# Phase 8X-G: The 8X-F Staging's Findings and the Design Talk: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the findings of the 8X-F staging run of 2026-10-22 and build what Matt decided in the design talk after it (follow-ups, "From the staging run of 8X-F"):

- **Pokebattler:** a 30-second timeout that no longer pauses every request; raid answers read up to 32 MB (Mew's is 14.7 MB) and reduced at once to what `/counters` shows, only that kept; kept up to six hours and 200 per kind by Pokebattler's own `Cache-Control` (`max-age=3600`) and ETag (a 304 renews without a download); failures that are not the member's give the use back; a User-Agent with a contact.
- **Small fixes:** `/train … start:` without the `/meet` hint; date examples that never go stale; "max events loaded" in the log.
- **Labels:** a labelled button that opens a dialog ends in `…` (Set time…, Something is wrong…, Appeal…, Ask the moderators…, Delete…, Open the form again…); the train kind is "What the train is mainly for": Raids, Dynamax Battles, Gigantamax Battles.
- **Groups in letter order**, A to E, in the post, the dialogs (the default group marked), `/shout group:` and the map.
- **Move… and Manage…** dialogs in the place of the Manage train panel; the train's third row Group… · Move… · Manage… · Split… · Route, words only.
- **The summary post** "Going on now" (old "Active raids" posts taken over and renamed), a "Passing through" section for other regions' trains that will still reach a stop here, and a line linking to "Today at the stops" with its counts.
- **Docs and the staging checklist** `2026-10-22-phase-8xg-staging.md`.

**Architecture:** `src/services/pokebattler-gateway.ts`, `src/domain/counters/counters.ts` (`keptAnswer`), `src/commands/util/counters*.ts`, `max-counters.ts`; `src/domain/time/` (`dateExample`), `src/commands/parties/timed.ts`, `help-render`; `src/render/party-controls.ts`, `train-words.ts`; `src/domain/party/attendance.ts` (`withGroupAdded`), `party.ts`, `src/render/group-dialogs.ts`, `src/commands/trains/split.ts`, `src/domain/web/party-view.ts`; `src/discord/dialog.ts` (`choices`, `selectedOf`), `src/render/train-dialogs.ts` (`moveDialog`, `manageDialog`), `src/commands/trains/move.ts`, `src/services/train-service.ts` (`manage`), `src/render/train-post.ts`; `src/render/summary.ts`, `src/services/party-service.ts` (rename, passing through, stops line), `src/services/stop-posts.ts`, `src/domain/party/train.ts` (`stopsStillReached`), `src/app.ts`.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely, Vitest. No new dependency, no migration, no party state change (groups are sorted when a stored party is read). **Commands change** (`/train start:` and `kind:` hints and choices, `/end time:`, `/meetup start:`, `/admin setup-forums`): deploy the commands before staging.

**Spec:** the follow-ups' decisions of 2026-10-22; the brief `.superpowers/sdd/8x-g-design-talk/design.md` (its review R1–R18, Matt's answers, the probes) and the ledger (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8xg`, tip `eb4907fe`), one commit per task, on `max-battles` ce13b221. Each commit typechecks and its tests pass; on the tip the full check (8,919 tests), the build and the database suite (573) are clean.

**Reviews:** a fresh Opus reviewer read the brief before any code (one Blocker: a radio group needs two choices; nine Important: Mew's answer size, retries and the throttle, the Gigantamax picture's real cause, stale fields in Manage…, the order of its changes, menus for Android, the three group orders, passing trains' redraws, the summary's rename; all folded in as R1–R18). Pokebattler was probed with Matt's go-ahead (Mew 14.7 MB, 100 movesets, no moveset parameter, the site filters in the browser; `max-age=3600` and an ETag). Three Opus reviewers went through the prototype (tasks 1–4: two Important, the caching header and the dialog's preselection against the default group, five Minor; tasks 5–6: six Minor; tasks 7–8: five Minor), then a fix review (six Minor), all folded in.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at (his own answers are marked):

1. **Mew:** no narrowing exists, so raid answers are read up to 32 MB and reduced at once (a Mew-sized parse peaks near 73 MB of heap, 320 KB kept); a still too large answer says so, with the Full results link (`(<url>)`, no unfurl).
2. **Caching:** six hours and 200 per kind, by Pokebattler's `max-age` (an hour) and ETag; a check that gets no answer serves the kept answer and waits a minute before asking again; a check that no longer finds the boss under its name asks under all its names. `no-cache` keeps and checks every time, `no-store` keeps nothing.
3. **Uses given back** for every Pokebattler failure that is not the member's (timeout, unreachable, paused, busy, 5xx, too large, unreadable); a 4xx still counts.
4. **Date examples:** `{date}` in help examples, filled by `/help` (three days ahead in the zone); deployed hints say "month-day and time".
5. **Gigantamax pictures** (Matt): the plain picture until PokeMiners lists the Gigantamax icon; no guessed file names.
6. **Letter order** (Matt), in the dialogs too; the which-group dialog marks the default group (the newest), so Join and `/join`, +1 and Remote agree; Android picks the first choice whatever is marked (staging checks it). Split…'s radio in letter order with no default.
7. **Move…'s radio** is labelled "Where to"; with one move left there is no radio. **Manage…** applies only what differs from what it showed, as one change (kind, route, mode; a refusal refuses all and says "Nothing was changed."); the place guards only a route change. Its answers are text only.
8. **The third row** words only (Matt); Group… loses 👥 on trains only.
9. **Passing through** (Matt): a train that loops or turns back stays listed for every stop; one that finishes leaves a region once past its last stop there; a finished route none. Linked to its copy in the region's channel, else its post; the head counts "N trains passing through".
10. **The summary's rename:** by Discord's rename limit with a timer of its own; a refused permission warns once per region and is tried again at the next change of text; another failure is retried after the window.
11. **Today at the stops:** counted as the pinned post counts (tasks by task, hideouts by leader or decoy), the line last under a separator, none in rehearsal mode.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8xg`). Apply it exactly with `git apply`, never retype; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **Pokebattler:** the reduced answer gives what the full one gave for every option; the cache's revalidation, its failures and requests in flight; the uses given back.
2. **Dialogs:** Discord's limits (radio 2–10, 5 components, 45 and 100 characters, ids within 100 with the token); the stale guards with two members; Manage…'s fields against what it showed.
3. **Groups:** the invariant on every insert path and on reading old parties; the default group's choice.
4. **The summary:** the rename and its timers; which trains pass through and every path that redraws other regions; unchanged summaries not sent.
5. **Words** members see, and the checklist against every change.

## Tasks

### Task 1: 8X-G 1: Pokebattler: longer timeout, no pause on a timeout, raid answers to 32 MB kept reduced

Prototype commit: `878ef826f51d5d29fb6f800f52bc28e6a8d5e9f3`

A query Pokebattler has not worked out lately took longer than ten seconds, and the
timeout paused every request for a minute; Mew's raid answer (14.7 MB) passed the 5 MB
cap, so /counters never answered for it.

- 30 s per request; a timeout no longer pauses the gateway (only a request that could
  not reach Pokebattler does), and the member reads "Pokebattler is still working this
  out: try again in a minute."
- Raid answers are read up to 32 MB (max battle teams keep 5 MB), and reduced right
  after reading to what the answer can show (keptAnswer: the best moveset of the first
  twelve counters and the twelve fastest movesets, per boss moveset); only that is kept.
- Answers kept six hours, 200 per kind, less where Cache-Control says so (never for
  no-store; no-cache keeps the answer but checks it with Pokebattler, by its ETag,
  before each use); three requests at once.
- A failure that is not the member's gives the use back (timeout, unreachable,
  unavailable, busy, too large, unreadable, a 5xx refusal); an answer too large says so
  with the boss's full results on Pokebattler's site.
- User-Agent Professor-Pine (+https://github.com/Googer/Professor-Pine).

**Files:**

```
 src/commands/util/counters-dialog.test.ts |   2 +-
 src/commands/util/counters-words.ts       |  42 +++++-
 src/commands/util/counters.test.ts        |  41 +++++-
 src/commands/util/counters.ts             |  41 +++++-
 src/commands/util/max-counters.ts         |   9 +-
 src/domain/counters/counters.test.ts      |  78 +++++++++++-
 src/domain/counters/counters.ts           |  42 +++++-
 src/services/pokebattler-gateway.test.ts  | 344 ++++++++++++++++++++++++++++++++++++++++++++++----
 src/services/pokebattler-gateway.ts       | 278 ++++++++++++++++++++++++++++++++--------
 test/support/responses.ts                 |  14 +-
 10 files changed, 796 insertions(+), 95 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/util/counters-dialog.test.ts src/commands/util/counters.test.ts src/domain/counters/counters.test.ts src/services/pokebattler-gateway.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 878ef826f51d5d29fb6f800f52bc28e6a8d5e9f3 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-G 1: Pokebattler: longer timeout, no pause on a timeout, raid answers to 32 MB kept reduced`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/util/counters-dialog.test.ts b/src/commands/util/counters-dialog.test.ts
index 1ca2fa994b91fce399ad2a75327109f9f64d81df..e579ee122dfe73ecc87b670cf71e0dfdc60f2e7d 100644
--- a/src/commands/util/counters-dialog.test.ts
+++ b/src/commands/util/counters-dialog.test.ts
@@ -312,7 +312,7 @@ describe('/counters: Change options…', () => {
     const form = await made.submit(token, ALICE);
     expect(form.editReply).not.toHaveBeenCalled();
     expect(sent(form.followUp)).toEqual({
-      content: 'Pokebattler did not answer just now. Please try again later.',
+      content: 'Pokebattler is still working this out: try again in a minute.',
       flags: MessageFlags.Ephemeral,
     });
   });
diff --git a/src/commands/util/counters-words.ts b/src/commands/util/counters-words.ts
index 0b697b8ba22ca04ab76f1801005e9b95aaa1e5fc..aefd7a676010c7ef4d921cf7c3b91b842569bdbc 100644
--- a/src/commands/util/counters-words.ts
+++ b/src/commands/util/counters-words.ts
@@ -1,3 +1,5 @@
+import { UserError } from '../../discord/errors.js';
+import { plain } from '../../render/text.js';
 import type { PokebattlerFailure } from '../../services/pokebattler-gateway.js';
 
 /**
@@ -10,8 +12,10 @@ export function troubleText(reason: PokebattlerFailure['reason']): string | unde
     case 'unknown':
     case 'empty':
       return undefined;
-    case 'refused':
     case 'timeout':
+      // A query Pokebattler has not worked out lately: the next try is often answered at once.
+      return 'Pokebattler is still working this out: try again in a minute.';
+    case 'refused':
     case 'unreachable':
     case 'unavailable':
       return 'Pokebattler did not answer just now. Please try again later.';
@@ -22,3 +26,39 @@ export function troubleText(reason: PokebattlerFailure['reason']): string | unde
       return 'The answer of Pokebattler could not be read. Please try again later.';
   }
 }
+
+/**
+ * Whether a failure is not the member's doing, so the use is given back (plan 8X-G): no answer,
+ * too many asking, an answer too large or unreadable, or Pokebattler's own error (5xx). A
+ * refusal of another kind (4xx: what Pine asked) counts, as an unknown boss does.
+ */
+export function givesBackFor(outcome: PokebattlerFailure): boolean {
+  switch (outcome.reason) {
+    case 'unknown':
+    case 'empty':
+      return false;
+    case 'refused':
+      return outcome.status === undefined || outcome.status >= 500;
+    default:
+      return true;
+  }
+}
+
+/**
+ * The refusal of a failure that is not about the boss: `troubleText`, but for an answer too large
+ * to read the boss's full results on Pokebattler's site (`fullResults`, the page the answer's
+ * "Full results" would open), where the member can read it after all.
+ */
+export function troubleError(
+  outcome: PokebattlerFailure,
+  bossTitle: string,
+  fullResults: string,
+  fallback: string,
+): UserError {
+  const text =
+    outcome.reason === 'too-large'
+      ? `Pokebattler’s answer for ${plain(bossTitle)} is too large for me to read. See the ` +
+        `[full results on Pokebattler](<${fullResults}>).`
+      : (troubleText(outcome.reason) ?? fallback);
+  return new UserError(text, { givesBack: givesBackFor(outcome) });
+}
diff --git a/src/commands/util/counters.test.ts b/src/commands/util/counters.test.ts
index 06195558266b3c67629dcaa9f7c162a28428df91..773fd2c6c0e59a3fe11b87825447ed716be15394 100644
--- a/src/commands/util/counters.test.ts
+++ b/src/commands/util/counters.test.ts
@@ -278,6 +278,10 @@ describe('/counters: elsewhere than in a raid post', () => {
     );
     const again = setup();
     again.pokebattler.failing = { ok: false, reason: 'timeout' };
+    expect(told(await again.run({ boss: 'yveltal' }))).toBe(
+      'Pokebattler is still working this out: try again in a minute.',
+    );
+    again.pokebattler.failing = { ok: false, reason: 'unreachable' };
     expect(told(await again.run({ boss: 'yveltal' }))).toBe(
       'Pokebattler did not answer just now. Please try again later.',
     );
@@ -296,6 +300,36 @@ describe('/counters: elsewhere than in a raid post', () => {
     );
   });
 
+  it('says plainly when the answer is too large, with the full results on Pokebattler’s site', async () => {
+    const made = setup();
+    made.pokebattler.failing = { ok: false, reason: 'too-large' };
+    expect(told(await made.run({ boss: 'yveltal' }))).toBe(
+      'Pokebattler’s answer for Yveltal is too large for me to read. See the ' +
+        '[full results on Pokebattler](<https://www.pokebattler.com/raids/YVELTAL?includeShadow=0&includeMegas=0>).',
+    );
+  });
+
+  it('gives the use back when Pokebattler failed, but not when it refused the request', async () => {
+    const made = setup();
+    for (const reason of ['timeout', 'unreachable', 'unavailable', 'busy', 'too-large'] as const) {
+      made.pokebattler.failing = { ok: false, reason };
+      expect(told(await made.run({ boss: 'yveltal' }))).not.toMatch(/^You can use/);
+    }
+    made.pokebattler.failing = { ok: false, reason: 'refused', status: 503 };
+    expect(told(await made.run({ boss: 'yveltal' }))).not.toMatch(/^You can use/);
+    // The three of a minute are all still there.
+    made.pokebattler.failing = undefined;
+    for (let i = 0; i < 3; i += 1) await made.run({ boss: 'yveltal' });
+    expect(told(await made.run({ boss: 'yveltal' }))).toMatch(/^You can use \/counters again in/);
+    // A refusal of the request Pine made (a 4xx other than an unknown boss) counts.
+    const refused = setup();
+    refused.pokebattler.failing = { ok: false, reason: 'refused', status: 429 };
+    for (let i = 0; i < 3; i += 1) await refused.run({ boss: 'yveltal' });
+    expect(told(await refused.run({ boss: 'yveltal' }))).toMatch(
+      /^You can use \/counters again in/,
+    );
+  });
+
   it('says what an unknown Pokébox can mean', async () => {
     const made = setup();
     await made.users.update(ALICE, { pokebattlerId: 4242 });
@@ -741,7 +775,12 @@ describe('/counters: max battles', () => {
     );
     made.pokebattler.failing = { ok: false, reason: 'timeout' };
     expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
-      'Pokebattler did not answer just now. Please try again later.',
+      'Pokebattler is still working this out: try again in a minute.',
+    );
+    made.pokebattler.failing = { ok: false, reason: 'too-large' };
+    expect(told(await made.run({ boss: 'uxie', tier: 'D5' }))).toBe(
+      'Pokebattler’s answer for Dynamax Uxie (5★) is too large for me to read. See the ' +
+        '[full results on Pokebattler](<https://www.pokebattler.com/max/UXIE/METER_CHARGE>).',
     );
   });
 
diff --git a/src/commands/util/counters.ts b/src/commands/util/counters.ts
index 79b33ea69eb79c59dc4281253604bc0c2901f25a..8e6521383b8887e5fb9b87974a08313b7e627ff1 100644
--- a/src/commands/util/counters.ts
+++ b/src/commands/util/counters.ts
@@ -61,7 +61,7 @@ import type { CounterOutcome } from '../../services/pokebattler-gateway.js';
 import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
 import { kindOfText } from '../max/max-input.js';
 import { namedPokemon, pokemonChoices } from '../pokemon-option.js';
-import { troubleText } from './counters-words.js';
+import { troubleError } from './counters-words.js';
 import {
   maxTeamMessage,
   readMaxPlan,
@@ -440,9 +440,38 @@ const requireCounterPlan: Guard = async (interaction, ctx) => {
   if (interaction.isChatInputCommand()) await readPlan(interaction, ctx);
 };
 
-/** What the member is told when Pokebattler gave nothing. */
-function failureText(outcome: Extract<CounterOutcome, { ok: false }>, plan: CounterPlan): string {
-  switch (outcome.reason) {
+/**
+ * What the member is told when Pokebattler gave nothing: in words of the boss when it knows no
+ * such boss or lists no counters, else `troubleError` (the use given back where the failure is
+ * not the member's; an answer too large with the boss's page on Pokebattler's site).
+ */
+function failureError(
+  outcome: Extract<CounterOutcome, { ok: false }>,
+  plan: CounterPlan,
+): UserError {
+  if (outcome.reason === 'unknown' || outcome.reason === 'empty') {
+    return new UserError(failureText(outcome.reason, plan));
+  }
+  const fullResults = counterSiteLink({
+    boss: plan.bosses[0] ?? plan.entry.key.toUpperCase(),
+    raidLevel: plan.raidLevel,
+    attackers: plan.attackers,
+    weather: plan.weather,
+    friendship: plan.friendship,
+    shadow: plan.shadow,
+    mega: plan.mega,
+  });
+  return troubleError(
+    outcome,
+    plan.entry.name,
+    fullResults,
+    'Pokebattler gave no counters just now.',
+  );
+}
+
+/** The words of Pokebattler knowing no such boss, or listing no counters against it. */
+function failureText(reason: 'unknown' | 'empty', plan: CounterPlan): string {
+  switch (reason) {
     // For a Pokébox, unknown is also one that Pokebattler will not show (401, 403).
     case 'unknown':
       return plan.attackers.kind === 'box'
@@ -457,8 +486,6 @@ function failureText(outcome: Extract<CounterOutcome, { ok: false }>, plan: Coun
             'that can fight this boss: check that your Pokébox on Pokebattler is filled in.'
         : `Pokebattler lists no counters against ${plain(plan.entry.name)} in ` +
             `${raidTierLabel(plan.tier)} raids.`;
-    default:
-      return troubleText(outcome.reason) ?? 'Pokebattler gave no counters just now.';
   }
 }
 
@@ -581,7 +608,7 @@ export async function simulate(ctx: AppContext, plan: CounterPlan): Promise<Simu
     shadow: plan.shadow,
     mega: plan.mega,
   });
-  if (!outcome.ok) throw new UserError(failureText(outcome, plan));
+  if (!outcome.ok) throw failureError(outcome, plan);
   return {
     set: countersFor(outcome, plan, ctx.gameData.catalogue),
     link: counterSiteLink(outcome.query),
diff --git a/src/commands/util/max-counters.ts b/src/commands/util/max-counters.ts
index 01429dfc3b407794c4bf736e8995c4e6e05dae13..a00f4e2bf5e99ee72c29a03323e2f46faf54c389 100644
--- a/src/commands/util/max-counters.ts
+++ b/src/commands/util/max-counters.ts
@@ -46,7 +46,7 @@ import { iconAddress, maxBossPicture } from '../../domain/pogo/pokemon-icons.js'
 import { renderMaxTeam, type ShownTeamMember } from '../../render/max-team.js';
 import { cutText } from '../../render/party-post.js';
 import { plain } from '../../render/text.js';
-import { troubleText } from './counters-words.js';
+import { troubleError } from './counters-words.js';
 
 /*
  * `/counters` for max battles (plan 8X-6; design section 8): Pokebattler's suggested team of
@@ -245,7 +245,12 @@ export async function simulateMax(ctx: AppContext, plan: MaxCounterPlan): Promis
   if (outcome.reason === 'empty') {
     throw new UserError(`Pokebattler suggests no team against ${titleOf(plan)}.`);
   }
-  throw new UserError(troubleText(outcome.reason) ?? 'Pokebattler gave no team just now.');
+  throw troubleError(
+    outcome,
+    maxBossTitle(plan.entry.name, plan.tier),
+    maxTeamLink(plan.bosses[0] ?? plan.entry.key.toUpperCase(), plan.role),
+    'Pokebattler gave no team just now.',
+  );
 }
 
 /**
diff --git a/src/domain/counters/counters.test.ts b/src/domain/counters/counters.test.ts
index 4aca18ec07de61ae2b577e7e860340f79b38b60e..a3cd538dba3063d4e0b32ac823b35100f0c58398 100644
--- a/src/domain/counters/counters.test.ts
+++ b/src/domain/counters/counters.test.ts
@@ -5,11 +5,13 @@ import {
   counterRows,
   isMegaCounter,
   isShadowCounter,
+  keptAnswer,
   pokebattlerNames,
+  SHOWN_COUNTERS,
   titleCase,
   type CounterRow,
 } from './counters.js';
-import type { BossMovesetCounters } from './pokebattler-answer.js';
+import type { BossMovesetCounters, CounterAnswer } from './pokebattler-answer.js';
 
 const answer = mewtwoAnswer();
 const average = answer.average as BossMovesetCounters;
@@ -50,6 +52,80 @@ describe('counterRows', () => {
   });
 });
 
+/** A large answer made in the test: `movesets` boss movesets, 30 counters of 6 movesets each. */
+function largeAnswer(movesets: number): CounterAnswer {
+  let seed = 7;
+  const random = () => {
+    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
+    return seed / 2_147_483_648;
+  };
+  const set = (fast: string | null, charged: string | null): BossMovesetCounters => ({
+    fast,
+    charged,
+    counters: Array.from({ length: 30 }, (_unused, c) => ({
+      pokemonId:
+        c % 7 === 0
+          ? `P${String(c)}_SHADOW_FORM`
+          : c % 11 === 0
+            ? `P${String(c)}_MEGA`
+            : `P${String(c)}`,
+      cp: 3000,
+      nickname: null,
+      results: Array.from({ length: 6 }, (_none, r) => ({
+        fast: `F${String(r)}_FAST`,
+        charged: `C${String(r)}`,
+        third: null,
+        legacy: false,
+        // Some ties, as Pokebattler's rounded times have.
+        timeMs: Math.round(random() * 40) * 1000 + 100_000,
+        deaths: Math.round(random() * 4),
+        estimator: 2.5,
+      })),
+    })),
+  });
+  return {
+    byMoveset: Array.from({ length: movesets }, (_unused, m) => set(`B${String(m)}_FAST`, 'BC')),
+    average: set(null, null),
+  };
+}
+
+describe('keptAnswer', () => {
+  it('keeps of each boss moveset only what the answer can show, for single or not', () => {
+    const answer = largeAnswer(100);
+    for (const kinds of [
+      { shadow: false, mega: false },
+      { shadow: true, mega: false },
+      { shadow: true, mega: true },
+    ]) {
+      const kept = keptAnswer(answer, kinds);
+      expect(kept.byMoveset.map((set) => set.fast)).toEqual(
+        answer.byMoveset.map((set) => set.fast),
+      );
+      for (const [i, set] of [...answer.byMoveset, answer.average!].entries()) {
+        const keptSet = i < kept.byMoveset.length ? kept.byMoveset[i]! : kept.average!;
+        for (const single of [false, true]) {
+          expect(lines(counterRows(keptSet, { ...kinds, single }))).toEqual(
+            lines(counterRows(set, { ...kinds, single })),
+          );
+        }
+        // At most a best moveset of twelve counters and twelve movesets more.
+        const results = keptSet.counters.reduce((sum, counter) => sum + counter.results.length, 0);
+        expect(results).toBeLessThanOrEqual(2 * SHOWN_COUNTERS);
+        expect(results).toBeGreaterThanOrEqual(SHOWN_COUNTERS);
+      }
+    }
+    // Shadows and megas left out are not kept.
+    const plain = keptAnswer(answer, { shadow: false, mega: false });
+    const ids = plain.byMoveset.flatMap((set) => set.counters.map((counter) => counter.pokemonId));
+    expect(ids.some((id) => isShadowCounter(id) || isMegaCounter(id))).toBe(false);
+  });
+
+  it('keeps an answer without an average without one', () => {
+    const kept = keptAnswer({ byMoveset: [], average: undefined }, { shadow: false, mega: false });
+    expect(kept).toEqual({ byMoveset: [], average: undefined });
+  });
+});
+
 describe('the kinds of counters', () => {
   it('tells shadows and megas by Pokebattler name', () => {
     expect(isShadowCounter('MACHAMP_SHADOW_FORM')).toBe(true);
diff --git a/src/domain/counters/counters.ts b/src/domain/counters/counters.ts
index fbe00bd5fb4922118d9530862cc9483e6468b137..37af5d48228ed774d84c2c36644f5f4e0738aed6 100644
--- a/src/domain/counters/counters.ts
+++ b/src/domain/counters/counters.ts
@@ -1,5 +1,10 @@
 import type { PokemonEntry } from '../pogo/game-master.js';
-import type { BossMovesetCounters, Counter, CounterResult } from './pokebattler-answer.js';
+import type {
+  BossMovesetCounters,
+  Counter,
+  CounterAnswer,
+  CounterResult,
+} from './pokebattler-answer.js';
 
 /** How many counters the answer lists (the legacy bot's twelve). */
 export const SHOWN_COUNTERS = 12;
@@ -49,6 +54,41 @@ export function counterRows(set: BossMovesetCounters, options: RowOptions): Coun
   return rows.sort(faster).slice(0, options.limit ?? SHOWN_COUNTERS);
 }
 
+/** Of one boss moveset, the counters and their movesets that `counterRows` can show. */
+function keptSet(
+  set: BossMovesetCounters,
+  kinds: Pick<RowOptions, 'shadow' | 'mega'>,
+): BossMovesetCounters {
+  const shown = new Set<CounterResult>();
+  for (const single of [false, true]) {
+    for (const row of counterRows(set, { ...kinds, single })) shown.add(row.result);
+  }
+  const counters: Counter[] = [];
+  for (const counter of set.counters) {
+    const results = counter.results.filter((result) => shown.has(result));
+    if (results.length > 0) counters.push({ ...counter, results });
+  }
+  return { ...set, counters };
+}
+
+/**
+ * What is kept of an answer (plan 8X-G): of each boss moveset and of the average only the
+ * counters and movesets the answer can show with the shadow Pokémon and megas asked for, with
+ * `single` or without (the best moveset of the first twelve counters, and the twelve fastest
+ * movesets): `counterRows` of the kept answer is that of the whole one. Pokebattler's answer for
+ * Mew is 14.7 MB of JSON (100 boss movesets of 30 counters); what is kept of it is at most 24
+ * movesets per boss moveset, so the cache holds answers of tens of kilobytes, not megabytes.
+ */
+export function keptAnswer(
+  answer: CounterAnswer,
+  kinds: Pick<RowOptions, 'shadow' | 'mega'>,
+): CounterAnswer {
+  return {
+    byMoveset: answer.byMoveset.map((set) => keptSet(set, kinds)),
+    average: answer.average && keptSet(answer.average, kinds),
+  };
+}
+
 /** `CONFUSION_FAST` as `Confusion`, for a move or Pokémon the catalogue does not know. */
 export function titleCase(id: string): string {
   return id
diff --git a/src/services/pokebattler-gateway.test.ts b/src/services/pokebattler-gateway.test.ts
index 7615491077819139daaf235f8be84166da99f60d..05c28551b8f53be458334eff166c805aeb365068 100644
--- a/src/services/pokebattler-gateway.test.ts
+++ b/src/services/pokebattler-gateway.test.ts
@@ -30,7 +30,13 @@ const REQUEST: CounterRequest = {
 
 function setup(
   answer: (url: string, signal: AbortSignal) => Promise<LimitedResponse>,
-  options: { maxBytes?: number; timeoutMs?: number; maxConcurrent?: number } = {},
+  options: {
+    maxBytes?: number;
+    timeoutMs?: number;
+    maxConcurrent?: number;
+    cacheMs?: number;
+    pauseMs?: number;
+  } = {},
 ) {
   const { log, entries } = createTestLogger();
   /** The requests made, as a count a test can wait for. */
@@ -48,6 +54,7 @@ const background = watchEachTest();
 
 describe('PokebattlerFight', () => {
   it('asks the API as the legacy bot did, and reads the answer', async () => {
+    const timeouts = fakeTimeoutSignals();
     const made = setup(() => Promise.resolve(jsonResponse(BODY)));
     const outcome = await made.fight.counters(REQUEST);
     expect(outcome.ok && outcome.answer.average?.counters[0]?.pokemonId).toBe('TYRANITAR');
@@ -63,6 +70,12 @@ describe('PokebattlerFight', () => {
     expect(init?.method).toBe('GET');
     expect(init?.redirect).toBe('error');
     expect(init?.signal).toBeInstanceOf(AbortSignal);
+    // Pokebattler's developer page asks for a User-Agent that says who asks, with a contact.
+    expect(init?.headers['User-Agent']).toBe(
+      'Professor-Pine (+https://github.com/Googer/Professor-Pine)',
+    );
+    // A query Pokebattler has not worked out lately takes it longer than ten seconds.
+    expect(timeouts.lengths).toEqual([30_000]);
   });
 
   it('asks under the next name of the boss when Pokebattler does not know the first', async () => {
@@ -88,7 +101,7 @@ describe('PokebattlerFight', () => {
     expect(made.urls()).toHaveLength(4);
   });
 
-  it('makes one request for the same setting at a time, and keeps the answer ten minutes', async () => {
+  it('makes one request for the same setting at a time, and keeps the answer six hours', async () => {
     let release: (() => void) | undefined;
     const made = setup(
       () =>
@@ -106,7 +119,7 @@ describe('PokebattlerFight', () => {
     const [a, b] = await Promise.all([first, second]);
     expect(a).toBe(b);
     expect(made.urls()).toHaveLength(1);
-    made.clock.now += 599_000;
+    made.clock.now += 6 * 3_600_000 - 1_000;
     expect(await made.fight.counters(REQUEST)).toBe(a);
     expect(made.urls()).toHaveLength(1);
     // Another setting is another request, also shadow Pokémon or megas listed or not.
@@ -176,7 +189,7 @@ describe('PokebattlerFight', () => {
     expect(made.urls()).toHaveLength(2);
   });
 
-  it('makes two requests at once at most; the others wait for their turn', async () => {
+  it('makes three requests at once at most; the others wait for their turn', async () => {
     const releases: (() => void)[] = [];
     const made = setup(
       () =>
@@ -186,18 +199,17 @@ describe('PokebattlerFight', () => {
           });
         }),
     );
-    const asked = ['WINDY', 'RAINY', 'FOG'].map((weather) =>
+    const asked = ['WINDY', 'RAINY', 'FOG', 'SNOW'].map((weather) =>
       made.fight.counters({ ...REQUEST, weather: weather as CounterRequest['weather'] }),
     );
-    await made.asked.reached(2);
-    expect(made.urls()).toHaveLength(2);
-    await background.settle();
-    expect(made.urls()).toHaveLength(2);
-    releases[0]?.();
     await made.asked.reached(3);
     expect(made.urls()).toHaveLength(3);
-    releases[1]?.();
-    releases[2]?.();
+    await background.settle();
+    expect(made.urls()).toHaveLength(3);
+    releases[0]?.();
+    await made.asked.reached(4);
+    expect(made.urls()).toHaveLength(4);
+    for (const release of releases.slice(1)) release();
     expect((await Promise.all(asked)).every((outcome) => outcome.ok)).toBe(true);
   });
 
@@ -235,6 +247,7 @@ describe('PokebattlerFight', () => {
             resolve(jsonResponse(BODY));
           });
         }),
+      { maxConcurrent: 2 },
     );
     // Two on their way, ten waiting.
     const asked = Array.from({ length: 12 }, (_unused, i) =>
@@ -269,14 +282,12 @@ describe('PokebattlerFight', () => {
     expect((await late).ok).toBe(true);
   });
 
-  it('answers at once for a minute after Pokebattler gave no answer', async () => {
+  it('answers at once for a minute after Pokebattler could not be reached', async () => {
     let failing = true;
     const made = setup(() =>
-      failing
-        ? Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
-        : Promise.resolve(jsonResponse(BODY)),
+      failing ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve(jsonResponse(BODY)),
     );
-    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'timeout' });
+    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreachable' });
     failing = false;
     made.clock.now += 59_999;
     expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unavailable' });
@@ -284,11 +295,282 @@ describe('PokebattlerFight', () => {
     made.clock.now += 1;
     expect((await made.fight.counters(REQUEST)).ok).toBe(true);
     expect(made.urls()).toHaveLength(2);
-    // Unreachable is the same.
-    const down = setup(() => Promise.reject(new TypeError('fetch failed')));
-    expect(await down.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unreachable' });
-    expect(await down.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'unavailable' });
-    expect(down.urls()).toHaveLength(1);
+  });
+
+  it('does not pause after a timeout: Pokebattler is working the query out, not down', async () => {
+    let failing = true;
+    const made = setup(() =>
+      failing
+        ? Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
+        : Promise.resolve(jsonResponse(BODY)),
+    );
+    expect(await made.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'timeout' });
+    expect(made.entries.find((entry) => entry.msg === 'could not ask Pokebattler')).toMatchObject({
+      reason: 'timeout',
+    });
+    // The same query a moment later, and another, are asked at once.
+    failing = false;
+    expect((await made.fight.counters(REQUEST)).ok).toBe(true);
+    expect((await made.fight.counters({ ...REQUEST, weather: 'WINDY' })).ok).toBe(true);
+    expect(made.urls()).toHaveLength(3);
+  });
+
+  it('reads a raid answer up to 32 MB and keeps only what can be shown of it', async () => {
+    // Pokebattler's answer for Mew in a T5 raid was 14.7 MB (2026-10-22).
+    const counters = Array.from({ length: 30 }, (_unused, i) => ({
+      pokemonId: i === 0 ? 'TYRANITAR_SHADOW_FORM' : `COUNTER_${String(i)}`,
+      byMove: [
+        { move1: 'BITE_FAST', move2: 'CRUNCH', seconds: 100 + i },
+        { move1: 'BITE_FAST', move2: 'BRUTAL_SWING', seconds: 140 + i },
+      ],
+    }));
+    const big = {
+      ...(pokebattlerAnswer({ average: counters }) as object),
+      padding: 'x'.repeat(6 * 1024 * 1024),
+    };
+    const made = setup(() => Promise.resolve(jsonResponse(big, { pieceBytes: 1024 * 1024 })));
+    const outcome = await made.fight.counters(REQUEST);
+    if (!outcome.ok) throw new Error(`no answer: ${outcome.reason}`);
+    const kept = outcome.answer.average?.counters ?? [];
+    // The twelve fastest that are no shadow, with their best moveset only (and those of the
+    // twelve fastest movesets, all of them best movesets here).
+    expect(kept.map((counter) => counter.pokemonId)).toEqual(
+      Array.from({ length: 12 }, (_unused, i) => `COUNTER_${String(i + 1)}`),
+    );
+    expect(kept.every((counter) => counter.results.length === 1)).toBe(true);
+    // Past 32 MB it is too large, as its length says before a byte is read.
+    const huge = setup(() =>
+      Promise.resolve(jsonResponse(BODY, { contentLength: 32 * 1024 * 1024 + 1 })),
+    );
+    expect(await huge.fight.counters(REQUEST)).toEqual({ ok: false, reason: 'too-large' });
+  });
+
+  it('keeps 200 answers of each kind, the oldest going first', async () => {
+    const made = setup(() => Promise.resolve(jsonResponse(BODY)));
+    for (let i = 0; i < 200; i += 1) {
+      await made.fight.counters({ ...REQUEST, bosses: [`BOSS_${String(i)}`] });
+    }
+    await made.fight.counters({ ...REQUEST, bosses: ['BOSS_0'] });
+    expect(made.urls()).toHaveLength(200);
+    await made.fight.counters({ ...REQUEST, bosses: ['BOSS_200'] });
+    await made.fight.counters({ ...REQUEST, bosses: ['BOSS_1'] });
+    expect(made.urls()).toHaveLength(201);
+    await made.fight.counters({ ...REQUEST, bosses: ['BOSS_0'] });
+    expect(made.urls()).toHaveLength(202);
+  });
+
+  it('keeps an answer no longer than its Cache-Control allows, and never when it says no-store', async () => {
+    const made = setup((url) =>
+      Promise.resolve(
+        jsonResponse(BODY, {
+          headers: {
+            'cache-control': url.includes('WINDY') ? 'no-store' : 'public, max-age=60',
+          },
+        }),
+      ),
+    );
+    await made.fight.counters(REQUEST);
+    made.clock.now += 59_000;
+    await made.fight.counters(REQUEST);
+    expect(made.urls()).toHaveLength(1);
+    made.clock.now += 1_000;
+    await made.fight.counters(REQUEST);
+    expect(made.urls()).toHaveLength(2);
+    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
+    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
+    expect(made.urls()).toHaveLength(4);
+    // A longer max-age than six hours does not keep it longer.
+    const long = setup(() =>
+      Promise.resolve(jsonResponse(BODY, { headers: { 'cache-control': 'max-age=86400' } })),
+    );
+    await long.fight.counters(REQUEST);
+    long.clock.now += 6 * 3_600_000;
+    await long.fight.counters(REQUEST);
+    expect(long.urls()).toHaveLength(2);
+  });
+
+  // Review r0 A1: Pokebattler sends `cache-control: max-age=3600` and a weak ETag (probed by
+  // the controller, 2026-10-22).
+  it('asks again after max-age with If-None-Match, and a 304 renews the kept answer', async () => {
+    let answer: () => LimitedResponse = () =>
+      jsonResponse(BODY, { headers: { 'cache-control': 'max-age=3600', etag: 'W/"abc"' } });
+    const made = setup(() => Promise.resolve(answer()));
+    const first = await made.fight.counters(REQUEST);
+    const sentWith = (n: number) => made.fetch.mock.calls[n]?.[1].headers['If-None-Match'];
+    expect(sentWith(0)).toBeUndefined();
+    made.clock.now += 3_599_000;
+    expect(await made.fight.counters(REQUEST)).toBe(first);
+    expect(made.urls()).toHaveLength(1);
+    // Past max-age: asked again, the ETag sent; Pokebattler says nothing changed.
+    made.clock.now += 1_000;
+    const notModified = jsonResponse(null, { status: 304, raw: '' });
+    answer = () => notModified;
+    expect(await made.fight.counters(REQUEST)).toBe(first);
+    expect(made.urls()).toHaveLength(2);
+    expect(made.urls()[1]).toBe(made.urls()[0]);
+    expect(sentWith(1)).toBe('W/"abc"');
+    expect(notModified.readBytes()).toBe(0);
+    // Renewed: kept another hour, past the first six hours too.
+    made.clock.now += 3_599_000;
+    expect(await made.fight.counters(REQUEST)).toBe(first);
+    expect(made.urls()).toHaveLength(2);
+    // A new answer at the next look replaces it.
+    made.clock.now += 1_000;
+    const changed = pokebattlerAnswer({
+      average: [
+        {
+          pokemonId: 'MACHAMP',
+          byMove: [{ move1: 'COUNTER_FAST', move2: 'CROSS_CHOP', seconds: 99 }],
+        },
+      ],
+    });
+    answer = () =>
+      jsonResponse(changed, { headers: { 'cache-control': 'max-age=3600', etag: 'W/"def"' } });
+    const second = await made.fight.counters(REQUEST);
+    expect(second.ok && second.answer.average?.counters[0]?.pokemonId).toBe('MACHAMP');
+    expect(await made.fight.counters(REQUEST)).toBe(second);
+    expect(made.urls()).toHaveLength(3);
+  });
+
+  // Review r1, R1-2: after a revalidation that found no answer, the next requests do not wait
+  // the full time out again: the kept answer is fresh for a minute more.
+  it('keeps the kept answer fresh a minute after a revalidation that found no answer', async () => {
+    let failing = false;
+    const made = setup(() =>
+      failing
+        ? Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
+        : Promise.resolve(
+            jsonResponse(BODY, { headers: { 'cache-control': 'max-age=60', etag: 'W/"abc"' } }),
+          ),
+    );
+    const first = await made.fight.counters(REQUEST);
+    made.clock.now += 61_000;
+    failing = true;
+    expect(await made.fight.counters(REQUEST)).toBe(first);
+    made.clock.now += 59_000;
+    expect(await made.fight.counters(REQUEST)).toBe(first);
+    expect(made.urls()).toHaveLength(2);
+    // A minute later it is asked again.
+    made.clock.now += 1_000;
+    expect(await made.fight.counters(REQUEST)).toBe(first);
+    expect(made.urls()).toHaveLength(3);
+  });
+
+  // Review r1, R1-3: a name Pokebattler no longer knows sends the request through every name.
+  it('asks under every name again when the kept answer’s name is no longer known', async () => {
+    let incarnateKnown = false;
+    const made = setup((url) => {
+      const headers = { 'cache-control': 'max-age=60', etag: 'W/"abc"' };
+      if (url.includes('_INCARNATE_FORM')) {
+        return Promise.resolve(
+          incarnateKnown ? jsonResponse(BODY, { headers }) : jsonResponse({}, { status: 404 }),
+        );
+      }
+      return Promise.resolve(
+        incarnateKnown ? jsonResponse({}, { status: 404 }) : jsonResponse(BODY, { headers }),
+      );
+    });
+    const first = await made.fight.counters(REQUEST);
+    expect(first.ok && first.query.boss).toBe('LANDORUS');
+    made.clock.now += 61_000;
+    incarnateKnown = true;
+    const again = await made.fight.counters(REQUEST);
+    expect(again.ok && again.query.boss).toBe('LANDORUS_INCARNATE_FORM');
+    // LANDORUS, then INCARNATE and LANDORUS asked again (the second LANDORUS with its ETag).
+    expect(made.urls()).toHaveLength(4);
+    expect(await made.fight.counters(REQUEST)).toBe(again);
+  });
+
+  // Review r1, R1-4.
+  it('renews a kept answer by 304s past the time answers are kept, without a download', async () => {
+    const made = setup(
+      () =>
+        Promise.resolve(
+          made.urls().length === 1
+            ? jsonResponse(BODY, { headers: { 'cache-control': 'max-age=3600', etag: 'W/"abc"' } })
+            : jsonResponse(null, { status: 304, raw: '' }),
+        ),
+      { cacheMs: 2 * 3_600_000 },
+    );
+    const first = await made.fight.counters(REQUEST);
+    for (let round = 1; round <= 3; round++) {
+      made.clock.now += 3_600_000;
+      expect(await made.fight.counters(REQUEST)).toBe(first);
+    }
+    expect(made.urls()).toHaveLength(4);
+  });
+
+  it('makes one revalidation for two asking at once, and serves the kept answer while paused', async () => {
+    let release: ((response: LimitedResponse) => void) | undefined;
+    let down = false;
+    const made = setup(
+      (url) => {
+        if (down) return Promise.reject(new TypeError('fetch failed'));
+        if (made.urls().length === 1) {
+          return Promise.resolve(
+            jsonResponse(BODY, { headers: { 'cache-control': 'max-age=60', etag: 'W/"abc"' } }),
+          );
+        }
+        return url.includes('WINDY')
+          ? Promise.resolve(jsonResponse(BODY))
+          : new Promise((resolve) => {
+              release = resolve;
+            });
+      },
+      { pauseMs: 120_000 },
+    );
+    const first = await made.fight.counters(REQUEST);
+    made.clock.now += 61_000;
+    const a = made.fight.counters(REQUEST);
+    const b = made.fight.counters(REQUEST);
+    await made.asked.reached(2);
+    release?.(jsonResponse(null, { status: 304, raw: '' }));
+    expect(await a).toBe(first);
+    expect(await b).toBe(first);
+    expect(made.urls()).toHaveLength(2);
+    // Pokebattler out of reach pauses it; a stale kept answer is served meanwhile.
+    down = true;
+    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
+    made.clock.now += 61_000;
+    expect(await made.fight.counters(REQUEST)).toBe(first);
+    expect(made.urls()).toHaveLength(3);
+  });
+
+  it('answers with the kept answer when its revalidation finds no answer', async () => {
+    let failing = false;
+    const made = setup(() =>
+      failing
+        ? Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
+        : Promise.resolve(
+            jsonResponse(BODY, { headers: { 'cache-control': 'max-age=60', etag: 'W/"abc"' } }),
+          ),
+    );
+    const first = await made.fight.counters(REQUEST);
+    made.clock.now += 61_000;
+    failing = true;
+    expect(await made.fight.counters(REQUEST)).toBe(first);
+    expect(made.urls()).toHaveLength(2);
+  });
+
+  it('keeps an answer of no-cache but asks again each time, and keeps none of no-store, said once', async () => {
+    const made = setup((url) =>
+      Promise.resolve(
+        url.includes('WINDY')
+          ? jsonResponse(BODY, { headers: { 'cache-control': 'no-store', etag: 'W/"x"' } })
+          : jsonResponse(BODY, { headers: { 'cache-control': 'no-cache', etag: 'W/"abc"' } }),
+      ),
+    );
+    await made.fight.counters(REQUEST);
+    await made.fight.counters(REQUEST);
+    expect(made.fetch.mock.calls[1]?.[1].headers['If-None-Match']).toBe('W/"abc"');
+    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
+    await made.fight.counters({ ...REQUEST, weather: 'WINDY' });
+    expect(made.fetch.mock.calls[3]?.[1].headers['If-None-Match']).toBeUndefined();
+    expect(
+      made.entries.filter(
+        (entry) => entry.msg === 'Pokebattler asks for its answers not to be kept',
+      ),
+    ).toHaveLength(1);
   });
 
   it('does not send what waited for its turn once Pokebattler gave no answer', async () => {
@@ -362,7 +644,9 @@ describe('PokebattlerFight: max battle teams', () => {
         'weatherCondition=NO_WEATHER&' +
         'friendLevel=FRIENDSHIP_LEVEL_4',
     );
-    expect(init?.headers['User-Agent']).toBe('Professor-Pine');
+    expect(init?.headers['User-Agent']).toBe(
+      'Professor-Pine (+https://github.com/Googer/Professor-Pine)',
+    );
     expect(init?.redirect).toBe('error');
   });
 
@@ -389,14 +673,14 @@ describe('PokebattlerFight: max battle teams', () => {
     expect(await odd.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'unreadable' });
   });
 
-  it('makes one request for the same team at a time, and keeps it ten minutes', async () => {
+  it('makes one request for the same team at a time, and keeps it six hours', async () => {
     const made = setup(() => Promise.resolve(jsonResponse(recordedMaxTeam('gmax-machamp-2-0-1'))));
     const [a, b] = await Promise.all([
       made.fight.maxTeam(MAX_REQUEST),
       made.fight.maxTeam({ ...MAX_REQUEST }),
     ]);
     expect(a).toBe(b);
-    made.clock.now += 599_000;
+    made.clock.now += 6 * 3_600_000 - 1_000;
     expect(await made.fight.maxTeam(MAX_REQUEST)).toBe(a);
     expect(made.urls()).toHaveLength(1);
     // Another role or level is another request.
@@ -455,6 +739,15 @@ describe('PokebattlerFight: max battle teams', () => {
     expect(warned[0]).toMatchObject({ slots: 1, alternatives: 0, boss: 'MACHAMP_GIGANTAMAX' });
   });
 
+  it('reads a max battle team up to 5 MB only', async () => {
+    const big = {
+      ...(recordedMaxTeam('gmax-machamp-2-0-1') as object),
+      padding: 'x'.repeat(5 * 1024 * 1024),
+    };
+    const made = setup(() => Promise.resolve(jsonResponse(big, { pieceBytes: 1024 * 1024 })));
+    expect(await made.fight.maxTeam(MAX_REQUEST)).toEqual({ ok: false, reason: 'too-large' });
+  });
+
   it('says of a boss by a name Pokebattler does not know that it has no team, not counters', async () => {
     const made = setup(() => Promise.resolve(jsonResponse({}, { status: 404 })));
     await made.fight.maxTeam(MAX_REQUEST);
@@ -474,6 +767,7 @@ describe('PokebattlerFight: max battle teams', () => {
             );
           });
         }),
+      { maxConcurrent: 2 },
     );
     // Two on their way and ten waiting, raid counters and max teams mixed.
     const asked = Array.from({ length: 12 }, (_unused, i) =>
diff --git a/src/services/pokebattler-gateway.ts b/src/services/pokebattler-gateway.ts
index c9fb142ed48f1f3cc6a7e2a859e178e40e0f18d8..928924a5bab0df6f12ece143fba4e48e3b0c1f82 100644
--- a/src/services/pokebattler-gateway.ts
+++ b/src/services/pokebattler-gateway.ts
@@ -5,6 +5,7 @@ import {
   type MaxTeamAnswer,
   type MaxTeamQuery,
 } from '../domain/counters/max-team.js';
+import { keptAnswer } from '../domain/counters/counters.js';
 import { counterPath, POKEBATTLER_API, type CounterQuery } from '../domain/counters/options.js';
 import {
   hasCounters,
@@ -82,22 +83,78 @@ export interface PokebattlerFightOptions {
   fetch: PokebattlerFetch;
   log: Logger;
   now?: () => number;
-  /** How long one request may take, its body included. Default ten seconds. */
+  /**
+   * How long one request may take, its body included. Default 30 seconds: a query Pokebattler
+   * has not worked out lately took it longer than ten (staging of 8X-F, 2026-10-22), and the
+   * answer is deferred (Discord allows 15 minutes).
+   */
   timeoutMs?: number;
-  /** A longer answer is given up. Default 5 MB (a real one is 1.75 MB). */
+  /**
+   * A longer raid answer is given up. Default 32 MB: Mew's in a T5 raid is 14.7 MB (100 boss
+   * movesets; 2026-10-22), twice that leaves room. Only what can be shown is kept of it.
+   */
   maxBytes?: number;
-  /** How long an answer is kept for the same request. Default ten minutes. */
+  /** A longer max battle team is given up. Default 5 MB (a real one is a few kilobytes). */
+  maxTeamBytes?: number;
+  /**
+   * How long an answer is kept for the same request, unless its `Cache-Control` says less.
+   * Default six hours: Pokebattler's simulations change only when it runs them again for new
+   * game data, and its API page asks for answers to be kept.
+   */
   cacheMs?: number;
-  /** How many answers are kept at most, of each kind. Default ten. */
+  /** How many answers are kept at most, of each kind. Default 200. */
   cacheSize?: number;
-  /** How many requests may be on their way at once; the others wait. Default two. */
+  /** How many requests may be on their way at once; the others wait. Default three. */
   maxConcurrent?: number;
   /** How many requests may wait for their turn; one more is `busy`. Default ten. */
   maxWaiting?: number;
-  /** How long Pokebattler is not asked after it gave no answer. Default a minute. */
+  /**
+   * How long Pokebattler is not asked after it could not be reached. Default a minute. A
+   * timeout does not pause it: Pokebattler is working the query out, not down.
+   */
   pauseMs?: number;
 }
 
+/** Pine's User-Agent, with a contact, as Pokebattler's developer page asks. */
+export const POKEBATTLER_USER_AGENT = 'Professor-Pine (+https://github.com/Googer/Professor-Pine)';
+
+/**
+ * What an answer's headers say of keeping it (review r0 A1; Pokebattler sends
+ * `cache-control: max-age=3600` and a weak ETag, probed on 2026-10-22): `store` false for
+ * `no-store`; `freshMs` how long it may be used without asking again (`max-age`, none for
+ * `no-cache`; undefined: as long as the gateway keeps answers); `etag` what to ask again with.
+ */
+export interface KeepRule {
+  store: boolean;
+  freshMs: number | undefined;
+  etag: string | undefined;
+}
+
+/** The `KeepRule` of an answer by its `Cache-Control` and `ETag` headers. */
+export function keepRule(headers: { get(name: string): string | null }): KeepRule {
+  const etag = headers.get('etag') ?? undefined;
+  const directives = (headers.get('cache-control') ?? '')
+    .toLowerCase()
+    .split(',')
+    .map((part) => part.trim());
+  if (directives.includes('no-store')) return { store: false, freshMs: undefined, etag };
+  if (directives.includes('no-cache')) return { store: true, freshMs: 0, etag };
+  for (const part of directives) {
+    const match = /^max-age=(\d+)$/.exec(part);
+    if (match?.[1] !== undefined) return { store: true, freshMs: Number(match[1]) * 1000, etag };
+  }
+  return { store: true, freshMs: undefined, etag };
+}
+
+/**
+ * How long a kept answer is used as it is after asking again with its ETag found no answer (a
+ * timeout, Pokebattler away), before it is asked again (review r1, R1-2).
+ */
+const REVALIDATION_PAUSE_MS = 60_000;
+
+/** A rule that keeps nothing: what a failure comes with. */
+const KEEP_NOTHING: KeepRule = { store: false, freshMs: undefined, etag: undefined };
+
 /** Statuses by which Pokebattler says it knows no such boss, level or Pokébox. */
 const NOT_KNOWN = new Set([400, 404]);
 /**
@@ -108,9 +165,33 @@ const BOX_NOT_SHOWN = new Set([401, 403]);
 
 type Outcome = { ok: true } | PokebattlerFailure;
 
+/** A good answer of each kind: what is kept. */
+type GoodCounters = Extract<CounterOutcome, { ok: true }>;
+type GoodTeam = Extract<MaxTeamOutcome, { ok: true }>;
+
+/**
+ * What came of one request: the outcome and what its headers say of keeping it, or, for a
+ * request asked again with the kept answer's ETag, that nothing changed (304).
+ */
+type Asked<T> =
+  { outcome: T | PokebattlerFailure; keep: KeepRule } | { notModified: true; keep: KeepRule };
+
+/**
+ * A kept answer: when it was got or last confirmed (`at`; kept `cacheMs` from then), until when
+ * it is used without asking again (`fresh`), and the ETag to ask again with.
+ */
+interface Kept<T> {
+  at: number;
+  fresh: number;
+  /** How long it is fresh each time (its `max-age`): what a 304 without one renews it for. */
+  freshFor: number;
+  etag: string | undefined;
+  outcome: T;
+}
+
 /** The answers of one kind of request kept, and those being asked. */
 interface Shared<T> {
-  cache: BoundedMap<string, { at: number; outcome: T | PokebattlerFailure }>;
+  cache: BoundedMap<string, Kept<T>>;
   asking: Map<string, Promise<T | PokebattlerFailure>>;
 }
 
@@ -120,6 +201,10 @@ interface OneRequest<T> {
   what: Record<string, unknown>;
   /** Whether 401 and 403 mean an unknown Pokébox. */
   box: boolean;
+  /** A longer body is given up (`too-large`). */
+  maxBytes: number;
+  /** The ETag of the answer kept, to ask whether it changed (`If-None-Match`). */
+  etag?: string | undefined;
   /** The outcome of a body read; `empty` for an answer with nothing in it. */
   read: (body: unknown) => T | PokebattlerFailure;
 }
@@ -128,35 +213,43 @@ interface OneRequest<T> {
  * Pokebattler's API over `fetch`: raid simulations as the legacy bot asked them, and max battle
  * teams (plan 8X-6), both through the same turns, pause, cache and limits. One request per
  * setting at a time: whoever asks for what is being asked already waits for that answer, and an
- * answer is kept for ten minutes, so the members of one raid who ask in turn make one request. A
- * boss Pokebattler does not know under its first name is asked under the next. At most
- * `maxWaiting` wait for their turn (one more is `busy`), and after a request that got no answer
- * nothing is sent for `pauseMs` (`unavailable`, at once, also for what was waiting), whatever it
- * asks for.
+ * answer is kept for six hours from when it was got or last confirmed (a failure never), so the
+ * members of one raid who ask in turn make one request; past its `Cache-Control`'s `max-age` it is
+ * asked for again with its ETag (`If-None-Match`), and a 304 renews it without a download (review
+ * r0 A1); `no-cache` keeps it but asks each time, `no-store` keeps nothing. Of a raid answer only what can be shown
+ * is kept (`keptAnswer`), right after it is read. A boss Pokebattler does not know under its
+ * first name is asked under the next. At most `maxWaiting` wait for their turn (one more is
+ * `busy`), and after a request that could not reach Pokebattler nothing is sent for `pauseMs`
+ * (`unavailable`, at once, also for what was waiting), whatever it asks for; a timeout does not
+ * pause it (plan 8X-G).
  */
 export class PokebattlerFight implements PokebattlerGateway {
   private readonly now: () => number;
   private readonly timeoutMs: number;
   private readonly maxBytes: number;
+  private readonly maxTeamBytes: number;
   private readonly cacheMs: number;
-  private readonly counterAnswers: Shared<CounterOutcome>;
-  private readonly maxAnswers: Shared<MaxTeamOutcome>;
+  private readonly counterAnswers: Shared<GoodCounters>;
+  private readonly maxAnswers: Shared<GoodTeam>;
   private readonly maxConcurrent: number;
   private running = 0;
   private readonly turns: (() => void)[] = [];
   private readonly maxWaiting: number;
   private readonly pauseMs: number;
   private pausedUntil = 0;
+  /** Whether the log said once that Pokebattler asks for its answers not to be kept. */
+  private noStoreSaid = false;
 
   constructor(private readonly options: PokebattlerFightOptions) {
     this.now = options.now ?? (() => Date.now());
-    this.timeoutMs = options.timeoutMs ?? 10_000;
-    this.maxBytes = options.maxBytes ?? 5 * 1024 * 1024;
-    this.cacheMs = options.cacheMs ?? 600_000;
-    const cacheSize = options.cacheSize ?? 10;
+    this.timeoutMs = options.timeoutMs ?? 30_000;
+    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
+    this.maxTeamBytes = options.maxTeamBytes ?? 5 * 1024 * 1024;
+    this.cacheMs = options.cacheMs ?? 6 * 3_600_000;
+    const cacheSize = options.cacheSize ?? 200;
     this.counterAnswers = { cache: new BoundedMap(cacheSize), asking: new Map() };
     this.maxAnswers = { cache: new BoundedMap(cacheSize), asking: new Map() };
-    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 2);
+    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 3);
     this.maxWaiting = options.maxWaiting ?? 10;
     this.pauseMs = options.pauseMs ?? 60_000;
   }
@@ -182,6 +275,7 @@ export class PokebattlerFight implements PokebattlerGateway {
         ),
       // A Pokébox is its owner's to change at any time: its answer is not kept.
       request.attackers.kind === 'level',
+      (kept, etag) => this.inTurn(() => this.counterRequest(kept.query, etag)),
     );
   }
 
@@ -204,35 +298,90 @@ export class PokebattlerFight implements PokebattlerGateway {
           this.maxRequest({ ...rest, boss }),
         ),
       true,
+      (kept, etag) => this.inTurn(() => this.maxRequest(kept.query, etag)),
     );
   }
 
   /**
    * An answer kept or being asked for the same key, else a new one (`ask`), unless Pokebattler
-   * is paused or too many wait; a good answer is kept when `keep`.
+   * is paused or too many wait. A good answer is kept when `keep`, as its headers allow
+   * (`KeepRule`), for `cacheMs` from when it was got or last confirmed; a kept one past its
+   * freshness is asked for again with its ETag (`revalidate`): a 304 renews it, a new answer
+   * replaces it, a name Pokebattler no longer knows asks under every name again, and no answer
+   * at all (a timeout, Pokebattler away) answers with the kept one, fresh a minute more.
    */
-  private shared<T extends Outcome>(
+  private shared<T extends { ok: true }>(
     answers: Shared<T>,
     key: string,
-    ask: () => Promise<T | PokebattlerFailure>,
+    ask: () => Promise<Asked<T>>,
     keep: boolean,
+    revalidate: (kept: T, etag: string) => Promise<Asked<T>>,
   ): Promise<T | PokebattlerFailure> {
     const now = this.now();
     answers.cache.dropWhile((kept) => now - kept.at >= this.cacheMs);
     const kept = answers.cache.get(key);
-    if (kept) return Promise.resolve(kept.outcome);
+    if (kept && now < kept.fresh) return Promise.resolve(kept.outcome);
+    if (kept && kept.etag === undefined) answers.cache.delete(key);
     const asking = answers.asking.get(key);
     if (asking) return asking;
-    if (now < this.pausedUntil) return Promise.resolve({ ok: false, reason: 'unavailable' });
+    const stale = kept?.etag === undefined ? undefined : kept;
+    if (now < this.pausedUntil) {
+      return Promise.resolve(stale?.outcome ?? { ok: false, reason: 'unavailable' });
+    }
     if (this.turns.length >= this.maxWaiting) {
-      return Promise.resolve({ ok: false, reason: 'busy' });
+      return Promise.resolve(stale?.outcome ?? { ok: false, reason: 'busy' });
     }
-    const answer = ask()
-      .then((outcome) => {
-        if (outcome.ok && keep) answers.cache.set(key, { at: this.now(), outcome });
+    const freshFor = (rule: KeepRule, before?: number) =>
+      Math.min(this.cacheMs, rule.freshMs ?? before ?? this.cacheMs);
+    /** What a request without an ETag came to, kept as its rule says. */
+    const got = (done: Asked<T>): T | PokebattlerFailure => {
+      if ('notModified' in done) return { ok: false, reason: 'unreadable' };
+      const at = this.now();
+      const { outcome, keep: rule } = done;
+      if (!outcome.ok) {
+        answers.cache.delete(key);
         return outcome;
-      })
-      .finally(() => answers.asking.delete(key));
+      }
+      if (!rule.store) {
+        answers.cache.delete(key);
+        if (!this.noStoreSaid) {
+          this.noStoreSaid = true;
+          this.options.log.warn('Pokebattler asks for its answers not to be kept');
+        }
+      } else if (keep) {
+        const kept = freshFor(rule);
+        answers.cache.set(key, {
+          at,
+          fresh: at + kept,
+          freshFor: kept,
+          etag: rule.etag,
+          outcome,
+        });
+      }
+      return outcome;
+    };
+    /** What asking again with the kept answer's ETag came to. */
+    const revalidated = async (kept: Kept<T>, etag: string): Promise<T | PokebattlerFailure> => {
+      const done = await revalidate(kept.outcome, etag);
+      if ('notModified' in done) {
+        const at = this.now();
+        const renewed = freshFor(done.keep, kept.freshFor);
+        answers.cache.set(key, { ...kept, at, fresh: at + renewed, freshFor: renewed });
+        return kept.outcome;
+      }
+      if (done.outcome.ok) return got(done);
+      // A name Pokebattler no longer knows: every name is asked again (review r1, R1-3).
+      if (done.outcome.reason === 'unknown' || done.outcome.reason === 'empty') {
+        return got(await ask());
+      }
+      // No answer came: the kept answer stands, fresh a minute more, so that the next requests
+      // do not wait the full time out again (review r1, R1-2); when it was got stays as it was.
+      kept.fresh = this.now() + REVALIDATION_PAUSE_MS;
+      return kept.outcome;
+    };
+    const answer = (
+      stale?.etag === undefined ? ask().then(got) : revalidated(stale, stale.etag)
+    ).finally(() => answers.asking.delete(key));
     answers.asking.set(key, answer);
     return answer;
   }
@@ -245,27 +394,30 @@ export class PokebattlerFight implements PokebattlerGateway {
     bosses: readonly string[],
     level: Record<string, string>,
     noun: 'counters' | 'max battle team',
-    one: (boss: string) => Promise<T | PokebattlerFailure>,
-  ): Promise<T | PokebattlerFailure> {
+    one: (boss: string) => Promise<Asked<T>>,
+  ): Promise<Asked<T>> {
     let empty = false;
     for (const boss of bosses) {
-      const outcome = await this.inTurn(() => one(boss));
-      if (outcome.ok) return outcome;
-      if (outcome.reason !== 'unknown' && outcome.reason !== 'empty') return outcome;
+      const asked = await this.inTurn(() => one(boss));
+      // Not asked with an ETag here: no 304 can come.
+      if ('notModified' in asked) return asked;
+      const { outcome } = asked;
+      if (outcome.ok) return asked;
+      if (outcome.reason !== 'unknown' && outcome.reason !== 'empty') return asked;
       empty ||= outcome.reason === 'empty';
       this.options.log.info(
         { boss, ...level, reason: outcome.reason },
         `Pokebattler has no ${noun} for this boss by this name`,
       );
     }
-    return { ok: false, reason: empty ? 'empty' : 'unknown' };
+    return { outcome: { ok: false, reason: empty ? 'empty' : 'unknown' }, keep: KEEP_NOTHING };
   }
 
   /**
    * Runs a request once fewer than `maxConcurrent` are on their way; not at all when a pause
    * began while it waited.
    */
-  private async inTurn<T>(request: () => Promise<T | PokebattlerFailure>) {
+  private async inTurn<T>(request: () => Promise<Asked<T>>): Promise<Asked<T>> {
     if (this.running >= this.maxConcurrent) {
       await new Promise<void>((resolve) => this.turns.push(resolve));
     } else {
@@ -273,7 +425,7 @@ export class PokebattlerFight implements PokebattlerGateway {
     }
     try {
       if (this.now() < this.pausedUntil) {
-        return { ok: false, reason: 'unavailable' } satisfies PokebattlerFailure;
+        return { outcome: { ok: false, reason: 'unavailable' }, keep: KEEP_NOTHING };
       }
       return await request();
     } finally {
@@ -284,25 +436,31 @@ export class PokebattlerFight implements PokebattlerGateway {
     }
   }
 
-  private counterRequest(query: CounterQuery): Promise<CounterOutcome> {
+  private counterRequest(query: CounterQuery, etag?: string): Promise<Asked<GoodCounters>> {
     return this.one({
       path: counterPath(query),
       what: { boss: query.boss, raidLevel: query.raidLevel, box: query.attackers.kind === 'box' },
       box: query.attackers.kind === 'box',
+      maxBytes: this.maxBytes,
+      etag,
       read: (body): CounterOutcome => {
-        const answer = readCounterAnswer(body);
-        if (!answer) return { ok: false, reason: 'unreadable' };
+        const read = readCounterAnswer(body);
+        if (!read) return { ok: false, reason: 'unreadable' };
+        // Only what can be shown is kept: Mew's whole answer is 14.7 MB of JSON.
+        const answer = keptAnswer(read, query);
         if (!hasCounters(answer)) return { ok: false, reason: 'empty' };
         return { ok: true, answer, query };
       },
     });
   }
 
-  private maxRequest(query: MaxTeamQuery): Promise<MaxTeamOutcome> {
+  private maxRequest(query: MaxTeamQuery, etag?: string): Promise<Asked<GoodTeam>> {
     return this.one({
       path: maxTeamPath(query),
       what: { boss: query.boss, maxLevel: query.maxLevel, role: query.role },
       box: false,
+      maxBytes: this.maxTeamBytes,
+      etag,
       read: (body): MaxTeamOutcome => {
         const answer = readMaxTeam(body);
         if (!answer) return { ok: false, reason: 'unreadable' };
@@ -319,43 +477,59 @@ export class PokebattlerFight implements PokebattlerGateway {
     });
   }
 
-  private async one<T extends Outcome>(request: OneRequest<T>): Promise<T | PokebattlerFailure> {
+  private async one<T extends Outcome>(request: OneRequest<T>): Promise<Asked<T>> {
     const { log } = this.options;
     const { what } = request;
+    const failed = (failure: PokebattlerFailure): Asked<T> => ({
+      outcome: failure,
+      keep: KEEP_NOTHING,
+    });
     try {
       const response = await this.options.fetch(`${POKEBATTLER_API}${request.path}`, {
         method: 'GET',
-        headers: { Accept: 'application/json', 'User-Agent': 'Professor-Pine' },
+        headers: {
+          Accept: 'application/json',
+          'User-Agent': POKEBATTLER_USER_AGENT,
+          ...(request.etag === undefined ? {} : { 'If-None-Match': request.etag }),
+        },
         redirect: 'error',
         signal: AbortSignal.timeout(this.timeoutMs),
       });
+      if (response.status === 304 && request.etag !== undefined) {
+        // Nothing changed since the answer kept: no body to read.
+        discardBody(response);
+        return { notModified: true, keep: keepRule(response.headers) };
+      }
       if (NOT_KNOWN.has(response.status) || (request.box && BOX_NOT_SHOWN.has(response.status))) {
         discardBody(response);
-        return { ok: false, reason: 'unknown', status: response.status };
+        return failed({ ok: false, reason: 'unknown', status: response.status });
       }
       if (response.status !== 200) {
         discardBody(response);
         log.warn({ ...what, status: response.status }, 'Pokebattler refused a request');
-        return { ok: false, reason: 'refused', status: response.status };
+        return failed({ ok: false, reason: 'refused', status: response.status });
       }
-      const body = await readLimitedJson(response, this.maxBytes);
+      const body = await readLimitedJson(response, request.maxBytes);
       if (!body.ok) {
         log.warn({ ...what, reason: body.reason }, 'could not read the answer of Pokebattler');
-        return { ok: false, reason: body.reason };
+        return failed({ ok: false, reason: body.reason });
       }
       const outcome = request.read(body.value);
       if (!outcome.ok && outcome.reason === 'unreadable') {
         log.warn(what, 'the answer of Pokebattler is not of the shape known');
       }
-      return outcome;
+      return { outcome, keep: keepRule(response.headers) };
     } catch (err) {
       const timeout = err instanceof Error && err.name === 'TimeoutError';
-      this.pausedUntil = this.now() + this.pauseMs;
+      // A timeout is a query Pokebattler is still working out: the next may be answered at once.
+      if (!timeout) this.pausedUntil = this.now() + this.pauseMs;
       log.warn(
-        { ...what, reason: timeout ? 'timeout' : failureReason(err), pauseMs: this.pauseMs },
+        timeout
+          ? { ...what, reason: 'timeout', timeoutMs: this.timeoutMs }
+          : { ...what, reason: failureReason(err), pauseMs: this.pauseMs },
         'could not ask Pokebattler',
       );
-      return { ok: false, reason: timeout ? 'timeout' : 'unreachable' };
+      return failed({ ok: false, reason: timeout ? 'timeout' : 'unreachable' });
     }
   }
 }
diff --git a/test/support/responses.ts b/test/support/responses.ts
index 4d224614dc89b555a21a9b8bc96ec2db6dac64ab..cb5b05f77129048c2c07a7ab84bdf724622a709e 100644
--- a/test/support/responses.ts
+++ b/test/support/responses.ts
@@ -2,12 +2,18 @@ import type { LimitedResponse } from '../../src/services/limited-json.js';
 
 /**
  * An answer of a server as `readLimitedJson` reads it, made in the test: the body in pieces of
- * `pieceBytes`, a `content-length` header only when given. `cancelled` says whether the reader
- * let go of the rest.
+ * `pieceBytes`, a `content-length` header only when given, other headers by their lower-case
+ * names in `headers`. `cancelled` says whether the reader let go of the rest.
  */
 export function jsonResponse(
   body: unknown,
-  options: { status?: number; contentLength?: number; pieceBytes?: number; raw?: string } = {},
+  options: {
+    status?: number;
+    contentLength?: number;
+    pieceBytes?: number;
+    raw?: string;
+    headers?: Record<string, string>;
+  } = {},
 ): LimitedResponse & { cancelled: () => boolean; readBytes: () => number } {
   const bytes = new TextEncoder().encode(options.raw ?? JSON.stringify(body));
   const pieceBytes = options.pieceBytes ?? 64 * 1024;
@@ -19,7 +25,7 @@ export function jsonResponse(
       get: (name) =>
         name.toLowerCase() === 'content-length' && options.contentLength !== undefined
           ? String(options.contentLength)
-          : null,
+          : (options.headers?.[name.toLowerCase()] ?? null),
     },
     body: {
       getReader: () => ({
````

### Task 2: 8X-G 2: small fixes: start: without the meet hint, dates that never go stale, max events loaded

Prototype commit: `f375308a9677a6c41b942e4e24d9256c9f617146`

- M1: a train made with start: is no longer told that /meet sets when it starts.
- M2: the time refusal's example and /help's examples with a date name the date three
  days from today in the server's zone (dateExample; DATE_EXAMPLE in an example); the
  deployed hints of /train start: and /end time: name no date ("month-day and time").
  The commands change: deploy them first.
- M3: loadMax logs "max events loaded" with the counts of max and big events, and the
  feed read's line carries them too.
- F2: no code (Matt: the plain picture until PokeMiners lists the Gigantamax icon); the
  rule is in utilities.md.

**Files:**

```
 docs/architecture/utilities.md          |  2 +-
 src/commands/meetups/meetup.ts          |  8 +++++---
 src/commands/parties/in-meetup.test.ts  |  2 +-
 src/commands/parties/in-train.test.ts   |  2 +-
 src/commands/parties/meet.ts            |  9 +++++++--
 src/commands/parties/timed.ts           | 18 ++++++++++++++----
 src/commands/raids/change.test.ts       | 14 ++++++++++++++
 src/commands/raids/change.ts            | 11 ++++++++---
 src/commands/trains/train.test.ts       | 10 ++++++++++
 src/commands/trains/train.ts            | 18 +++++++++---------
 src/commands/util/help-render.ts        |  7 ++++++-
 src/commands/util/help.test.ts          | 22 +++++++++++++++++++++-
 src/discord/command.ts                  |  8 ++++++++
 src/domain/time/clock-input.ts          | 12 ++++++++++++
 src/services/raid-event-service.test.ts | 10 ++++++++++
 src/services/raid-event-service.ts      |  5 ++++-
 src/web/meetup-routes.ts                |  7 +++++--
 17 files changed, 136 insertions(+), 29 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/raids/change.test.ts src/commands/trains/train.test.ts src/commands/util/help.test.ts src/services/raid-event-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f375308a9677a6c41b942e4e24d9256c9f617146 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-G 2: small fixes: start: without the meet hint, dates that never go stale, max events loaded`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index eb57fb4b21a2c9e899dcc7ebb1899d5a95d511ae..956c7bc6e9f95b0d7a63248d4f6caa71ed15ac4c 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -24,7 +24,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Both boss lists are one machine with two families (plan 8X-2): `BossFeedService<T>` (`src/services/boss-feed-service.ts`: the stored list at start, the first read when it is older than the refresh, retries, the out-of-date warning, override writes one at a time) with a `BossFeedFamily` (its noun in the log, its parser, its list in effect, its override rules); `RaidBossService` and `MaxBossService` are its families. The list rules (`familyBosses`, `familyOverrideKeys`, `familyReport`, `diffFeedIn`, `diffBossesIn`) take the family's tier operations (`RAID_OPS`, `MAX_OPS`); `effectiveBosses`, `bossReport` and the rest keep their raid signatures. The tables are kept apart per family by their levels (`RaidBossRepository`: every level but the max tiers, so the retired EX level stays the raids' to report; `MaxBossRepository`: `MAX_TIERS`): every read and write filters by the family, and an override without a tier (a shiny one for every tier) is a raid override.
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
 - Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). It needs the ended event still known: ScrapedDuck drops an event once it has ended; the max events are kept in the database since plan 8X-F (`MaxEvent`, below), an ended one while it started less than eight days ago, so only a restart later than that offers the boss again until Pokebattler drops it (step 11 of the 8X-2 staging, after 2026-10-24, decides whether more is needed). `dynamaxPokemon` is not read. Max boss changes are not announced.
-- What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own).
+- What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own). PokeMiners' list of icon files has only 13 `fGIGANTAMAX` icons (no `pm25`: Gigantamax Pikachu shows plain Pikachu, staging of 8X-F, F2); a file name in no list is never guessed, and the plain picture stays until PokeMiners lists the Gigantamax one (Matt, 2026-10-22, plan 8X-G). Dynamax has no look of its own in the game: its battles show the plain picture.
 - The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read). The raid events (`merged`) are still kept in memory only: a follow-up. Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before; this question and the refusal of `tier:` outside a max battle give the use back, `givesBack`). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
 - The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
 - How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change; `maxRotation` takes another as its second argument, so a test tells a big event from outside), otherwise (a Dynamax battle on an ordinary day) the day's last battle time, or the start of the next max event later that day if sooner (`dayBattleEnd`, Matt, 2026-10-21, Q-B: one rule, to be revisited after the lake trio day of 2026-10-24; `/end` and `end:` still give a later end, and a report under five minutes before the event's start is asked about, the next rotation being the event's first half hour); always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), by the rule as things are at the end (review B12: a Dynamax battle at the last boundary of its event has none), undefined at the cap and for a battle that would then last the day.
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index 83aa5ce28469322bc0611f75ab1dcac8b52b5259..e03c122bea9cfdf0bafbd943c7360fbf04d2290e 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -25,7 +25,7 @@ import {
   newPartyTimes,
   noForumWords,
   requirePlaceForNew,
-  TIMED_TIME_HINT,
+  timedTimeHint,
   typedTimedTime,
 } from '../parties/timed.js';
 import { MAX_PLACE_TEXT, namedPlace, nearChoices, type PlaceKindsOnly } from '../place-option.js';
@@ -177,7 +177,9 @@ async function readAsked(
     now,
   );
   if (typed === 'unset') {
-    throw new UserError(`Give the time the meetup starts. ${TIMED_TIME_HINT}`);
+    throw new UserError(
+      `Give the time the meetup starts. ${timedTimeHint(now, ctx.config.settings.timezone)}`,
+    );
   }
   // The block is read above: not again.
   const verdict = await ctx.meetupSafety.verdict({
@@ -255,7 +257,7 @@ export const meetup: SimpleCommand = {
     .addStringOption((option) =>
       option
         .setName('start')
-        .setDescription('When it starts, such as 6:30pm or 10-18 11am (month-day)')
+        .setDescription('When it starts, such as 6:30pm, or a month-day and time')
         .setRequired(true)
         .setMaxLength(100),
     ),
diff --git a/src/commands/parties/in-meetup.test.ts b/src/commands/parties/in-meetup.test.ts
index 1d945d052e61736406f0599573d9f91f3c623f2c..25dc52fce1c12c57e3b56704b1aea88bad59667d 100644
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -356,7 +356,7 @@ describe('/meet, /cancel-meet and /end in the post of a meetup', () => {
     const made = await setup();
     await made.run('join');
     const hint =
-      'Try `6:15pm`, `10-17 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).';
+      'Try `6:15pm`, `10-16 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).';
     expect(await made.answer('meet', { time: 'soonish' })).toBe(
       `I could not read "soonish" as the time the meetup starts. ${hint}`,
     );
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index 7129f6682f3c73dfd54362ecd6c2a3e0f050740a..ddc4e7d7f69c4f6da3c6d20b24725fd24af6ee37 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -392,7 +392,7 @@ describe('/meet, /cancel-meet, /end and /name in the post of a train', () => {
     await made.run('join');
     expect(await made.answer('meet', { time: 'gibberish' })).toBe(
       'I could not read "gibberish" as the time the train starts. ' +
-        'Try `6:15pm`, `10-17 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).',
+        'Try `6:15pm`, `10-16 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).',
     );
   });
 
diff --git a/src/commands/parties/meet.ts b/src/commands/parties/meet.ts
index eccc4250034c33b689b4b25596ee074932ad9eb2..ceddd9a787c97285a1510dff2738cd859a57f857 100644
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -1,5 +1,10 @@
 import { SlashCommandBuilder } from 'discord.js';
-import type { ControlThrottle, Guard, SimpleCommand } from '../../discord/command.js';
+import {
+  DATE_EXAMPLE,
+  type ControlThrottle,
+  type Guard,
+  type SimpleCommand,
+} from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { notARaid, partyOf, requireParty } from '../../discord/guards.js';
 import {
@@ -100,7 +105,7 @@ export const meet: SimpleCommand = {
       'starts, or else the day it ends, while that day is still to come, and otherwise on ' +
       "today's date; a date comes first, month-day (`10-14 6pm`). " +
       'You must be signed up.',
-    examples: ['/meet time:6:15pm', '/meet time:hatch', '/meet time:10-17 6:15pm'],
+    examples: ['/meet time:6:15pm', '/meet time:hatch', `/meet time:${DATE_EXAMPLE} 6:15pm`],
   },
   guards: [requireParty, requireStartChange],
   throttle: meetThrottle,
diff --git a/src/commands/parties/timed.ts b/src/commands/parties/timed.ts
index 7e004e40b90b156b57b0e5cc8191998c89e9ab75..6690130d0dc53557e476e0140b97c5145171efc9 100644
--- a/src/commands/parties/timed.ts
+++ b/src/commands/parties/timed.ts
@@ -7,6 +7,7 @@ import { partyOf, regionChannelOf } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { partyWord, type PartyProblem, type TimedParty } from '../../domain/party/party.js';
 import { nameOf, startTimeOf, tidyName } from '../../domain/party/timed.js';
+import { dateExample } from '../../domain/time/clock-input.js';
 import { resolvePartyTime } from '../../domain/time/party-time.js';
 import { problemText } from '../../render/activity.js';
 import { clockOrDay, plain, timestamp, truncate } from '../../render/text.js';
@@ -21,9 +22,16 @@ import { actingMember, partyOver } from './reply.js';
  */
 export const START_THROTTLE: Throttle = { uses: 3, perSeconds: 180 };
 
-/** How a time is to be typed for a train or meetup: a bare number is an hour there, not minutes. */
-export const TIMED_TIME_HINT =
-  'Try `6:15pm`, `10-17 6:15pm` (a date, month-day, and a time) or `in 30` (minutes from now).';
+/**
+ * How a time is to be typed for a train or meetup: a bare number is an hour there, not minutes.
+ * The date of the example is three days from `now` (`dateExample`), so it never goes stale.
+ */
+export function timedTimeHint(now: number, zone: string): string {
+  return (
+    `Try \`6:15pm\`, \`${dateExample(now, zone)} 6:15pm\` (a date, month-day, and a time) or ` +
+    '`in 30` (minutes from now).'
+  );
+}
 
 /** What a member is told who makes a train or meetup in a region that has no forum yet. */
 export function noForumYet(regionChannelId: string): string {
@@ -139,7 +147,9 @@ export function typedTimedTime(
         `For another day, give the date first, month-day: \`${day.month}-${day.day} ${typed}\`.`,
     );
   }
-  throw new UserError(`I could not read "${typed}" as ${what}. ${TIMED_TIME_HINT}`);
+  throw new UserError(
+    `I could not read "${typed}" as ${what}. ${timedTimeHint(now, settings.timezone)}`,
+  );
 }
 
 /** A time as an answer names it: with its date when it is not today, and how long until then. */
diff --git a/src/commands/raids/change.test.ts b/src/commands/raids/change.test.ts
index ea01a4d4a158aa822c20743f36ca193f70ed5c0a..827e7b19f5c646c8a3eba42de98adc5680d56f86 100644
--- a/src/commands/raids/change.test.ts
+++ b/src/commands/raids/change.test.ts
@@ -18,6 +18,7 @@ import { InteractionRouter } from '../../discord/router.js';
 import { bottomControls, timeForm } from '../../render/party-controls.js';
 import type { RaidReport } from '../../services/party-service.js';
 import { cancelMeet, meet } from '../parties/meet.js';
+import { meetup } from '../meetups/meetup.js';
 import { join } from '../parties/attendance.js';
 import { duration, end, hatch, timesText } from './change.js';
 import { RAID_IS_OVER } from './raid-input.js';
@@ -152,6 +153,19 @@ describe('/hatch and /end', () => {
   });
 });
 
+describe('the hints of the time options (plan 8X-G, M2)', () => {
+  it('name no fixed date, which would go stale once deployed, and help shows a coming one', () => {
+    for (const command of [end, meet, meetup]) {
+      const options = command.data.toJSON().options ?? [];
+      for (const option of options) expect(option.description).not.toMatch(/\d+-\d+/);
+      // The help's example with a date is the date three days from today (`DATE_EXAMPLE`).
+      expect(command.help.examples?.filter((example) => /\d+-\d+/.test(example))).toEqual([]);
+    }
+    expect(meet.help.examples).toContain('/meet time:{date} 6:15pm');
+    expect(end.help.examples).toContain('/end time:{date} 9pm');
+  });
+});
+
 describe('/duration', () => {
   it('sets how long the raid lasts and says the new times', async () => {
     const made = await setup({ time: { hatch: HATCH } });
diff --git a/src/commands/raids/change.ts b/src/commands/raids/change.ts
index bc80ff86a902acd3ff3c236e43e6e1f798c7bf62..d54d32cd163de8a17a4f80e3a2ecca299c5f17e0 100644
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -6,7 +6,7 @@ import {
   type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
-import type { SimpleCommand } from '../../discord/command.js';
+import { DATE_EXAMPLE, type SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { notARaid, requireParty, requireRaid } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
@@ -128,7 +128,7 @@ export const end: SimpleCommand = {
       o
         .setName('time')
         .setDescription(
-          'Raid: minutes left (20) or 6:15pm. Train or meetup: 6:15pm, 10-17 6:15pm, in 90, none',
+          'Raid: minutes left (20) or 6:15pm. Train or meetup: 6:15pm, month-day and time, in 90, none',
         )
         .setRequired(true)
         .setMaxLength(40),
@@ -145,7 +145,12 @@ export const end: SimpleCommand = {
       "on today's date; a date comes first, month-day (`10-14 9pm`). A " +
       'train or meetup without an end is taken to be over a day after it started; one without any time ' +
       'is archived a day after it was made, or after its last time was removed.',
-    examples: ['/end time:20', '/end time:6:15pm', '/end time:10-17 9pm', '/end time:none'],
+    examples: [
+      '/end time:20',
+      '/end time:6:15pm',
+      `/end time:${DATE_EXAMPLE} 9pm`,
+      '/end time:none',
+    ],
   },
   guards: [requireParty],
   throttle: CHANGE_THROTTLE,
diff --git a/src/commands/trains/train.test.ts b/src/commands/trains/train.test.ts
index 06790980a2cad60d8772aa465ac69ccae5f049d3..1f09f8c06f03620a1d4d24bf92ca1a0eb8c81629 100644
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -312,6 +312,12 @@ describe('/train', () => {
     });
   });
 
+  it('names no fixed date in the hint of start, nor in the help’s examples (plan 8X-G, M2)', () => {
+    const option = train.data.toJSON().options?.find((found) => found.name === 'start');
+    expect(option?.description).not.toMatch(/\d+-\d+/);
+    expect(train.help.examples?.filter((example) => /\d+-\d+/.test(example))).toEqual([]);
+  });
+
   describe('start: a train planned ahead (plan 8X-4; design 6.1)', () => {
     beforeEach(() => {
       vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
@@ -335,6 +341,10 @@ describe('/train', () => {
         new RegExp(`^Starts <t:${start / 1000}:R>`),
       );
       expect(sent(used.editReply).content).toMatch(/^Your train is made\. Its post is /);
+      // Its start is set: `/meet` is not offered for it (plan 8X-G, M1).
+      expect(sent(used.editReply).content).toMatch(
+        /There, `\/route add` adds its stops and `\/conductor set` makes you its conductor\.$/,
+      );
     });
 
     it('refuses a start it cannot read before anything is made, and does not count it', async () => {
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index 4239a6f9064edf8d2fb848857e3ef1bb16701391..cb83420571b7aca081c972fa3829c32793837f4e 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -1,6 +1,6 @@
 import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
-import type { SimpleCommand } from '../../discord/command.js';
+import { DATE_EXAMPLE, type SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { regionChannelOf, requireGuild } from '../../discord/guards.js';
 import type { Throttle } from '../../discord/throttle.js';
@@ -86,7 +86,7 @@ export const train: SimpleCommand = {
     .addStringOption((option) =>
       option
         .setName('start')
-        .setDescription('When it starts, as /meet takes it: 6:15pm, 10-24 2pm, in 30')
+        .setDescription('When it starts, as /meet takes it: 6:15pm, month-day and time, in 30')
         .setMaxLength(40),
     ),
   help: {
@@ -113,7 +113,7 @@ export const train: SimpleCommand = {
     examples: [
       '/train name:Saturday legendaries',
       '/train name:Park loop at-end:Loop',
-      `/train name:Wild Area kind:${TRAIN_KIND_WORDS.gigantamax} start:11-14 10am`,
+      `/train name:Wild Area kind:${TRAIN_KIND_WORDS.gigantamax} start:${DATE_EXAMPLE} 10am`,
     ],
   },
   guards: [
@@ -152,13 +152,13 @@ export const train: SimpleCommand = {
     // Who made it may lay its route and set its times without being signed up; moving it and
     // being its conductor take a sign-up.
     const signedUp = attendeeOf(answer.party, interaction.user.id) !== undefined;
+    // `/meet` is named only for a train made without its start (plan 8X-G, M1).
+    const meet = start === undefined ? '`/meet` sets when it starts' : undefined;
+    const then = signedUp
+      ? `${meet === undefined ? '' : `, ${meet},`} and \`/conductor set\` makes you its conductor.`
+      : `${meet === undefined ? '' : ` and ${meet}`}. ${notSignedUpWords('in the post')}`;
     await interaction.editReply({
-      content:
-        `${answer.text} ` +
-        'There, `/route add` adds its stops' +
-        (signedUp
-          ? ', `/meet` sets when it starts, and `/conductor set` makes you its conductor.'
-          : ` and \`/meet\` sets when it starts. ${notSignedUpWords('in the post')}`),
+      content: `${answer.text} There, \`/route add\` adds its stops${then}`,
     });
   },
 };
diff --git a/src/commands/util/help-render.ts b/src/commands/util/help-render.ts
index 78728d671b135bfb52b3c8a23e0cb0c469677729..ed797ccb8bf4643ced8b2bd298546319918a140a 100644
--- a/src/commands/util/help-render.ts
+++ b/src/commands/util/help-render.ts
@@ -9,7 +9,9 @@ import {
   type APIStringSelectComponent,
 } from 'discord.js';
 import type { Settings } from '../../config/settings.js';
+import { dateExample } from '../../domain/time/clock-input.js';
 import {
+  DATE_EXAMPLE,
   subcommandPath,
   type CommandHelp,
   type CommandModule,
@@ -364,7 +366,10 @@ function helpPage(
   const usageText = `**Usage**\n${fitLines(usage, USAGE_ROOM)}`;
   const examples = help?.examples?.length
     ? `**Examples**\n${fitLines(
-        help.examples.map((example) => `\`${example}\``),
+        help.examples.map(
+          (example) =>
+            `\`${example.replaceAll(DATE_EXAMPLE, dateExample(Date.now(), settings.timezone))}\``,
+        ),
         EXAMPLES_ROOM,
       )}`
     : undefined;
diff --git a/src/commands/util/help.test.ts b/src/commands/util/help.test.ts
index dae7f111dc744cdc165d2bebb7007bda1e354b70..a8ca87311f9e9c42789704216d44be36e54c0a0f 100644
--- a/src/commands/util/help.test.ts
+++ b/src/commands/util/help.test.ts
@@ -7,7 +7,7 @@ import {
   type AutocompleteInteraction,
   type ChatInputCommandInteraction,
 } from 'discord.js';
-import { describe, expect, it } from 'vitest';
+import { afterEach, describe, expect, it, vi } from 'vitest';
 import {
   asV2,
   fakeAutocomplete,
@@ -22,6 +22,7 @@ import { createTestContext } from '../../../test/support/test-context.js';
 import { commandGroup } from '../../discord/command-group.js';
 import {
   alsoAs,
+  DATE_EXAMPLE,
   type CommandModule,
   type MessageCommand,
   type SimpleCommand,
@@ -107,6 +108,25 @@ describe('/help: a command with another name', () => {
   });
 });
 
+describe('/help: an example with a date (plan 8X-G, M2)', () => {
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('shows a date three days from today in the zone, so the example never goes stale', async () => {
+    const later: SimpleCommand = {
+      data: new SlashCommandBuilder().setName('later').setDescription('Plan ahead'),
+      help: { category: 'util', examples: [`/later time:${DATE_EXAMPLE} 6:15pm`, '/later'] },
+      execute: noop,
+    };
+    const dated = createTestContext({ commands: [help, later] }).ctx;
+    // 23:30 in New York on 10-13 is 10-14 in UTC: the zone's day counts.
+    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-14T03:30:00Z') });
+    const page = await ask({ options: { command: 'later' } }, dated);
+    expect(textDisplays(page).join('\n')).toContain('`/later time:10-16 6:15pm`\n`/later`');
+  });
+});
+
 describe('/help: a message command (the Apps menu on a message)', () => {
   const onMessage: MessageCommand = {
     target: 'message',
diff --git a/src/discord/command.ts b/src/discord/command.ts
index f67c5b77183af5756091941c403812ccc2e277f8..f9f01cbf9b4e467a4b63661df019591af41fb490 100644
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -36,9 +36,17 @@ export interface CommandHelp {
    * what this installation has switched on.
    */
   details?: string | ((settings: Settings) => string);
+  /** Ways to use it; `DATE_EXAMPLE` in one is shown as a date three days from today. */
   examples?: string[];
 }
 
+/**
+ * Stands for a date in a command's example (`/meet time:${DATE_EXAMPLE} 6:15pm`): `/help` shows
+ * it as the date three days from today, month-day (`dateExample`), so that it never goes stale
+ * (plan 8X-G, M2).
+ */
+export const DATE_EXAMPLE = '{date}';
+
 /**
  * How a command is acknowledged: before it runs, for the member alone or for everyone; or
  * `late`, for the member alone and only when it has not answered after a second
diff --git a/src/domain/time/clock-input.ts b/src/domain/time/clock-input.ts
index 6cad2b1526788f42db88a1e85eaacbd3759ff953..9a07eadd235a3751c07497ae48e0193d2d5cb92f 100644
--- a/src/domain/time/clock-input.ts
+++ b/src/domain/time/clock-input.ts
@@ -1,3 +1,15 @@
+import { DateTime } from 'luxon';
+
+/**
+ * The date of an example, month-day (`10-25`), three days after `now` in `zone`: an example
+ * that names a fixed date goes stale (plan 8X-G, M2), one that names today is no example of a
+ * date.
+ */
+export function dateExample(now: number, zone: string): string {
+  const day = DateTime.fromMillis(now, { zone }).plus({ days: 3 });
+  return `${String(day.month)}-${String(day.day)}`;
+}
+
 /** A time of day as typed, optionally with a month and day. */
 export interface ClockInput {
   /** 0–23, with am/pm already applied when it was given. */
diff --git a/src/services/raid-event-service.test.ts b/src/services/raid-event-service.test.ts
index bd9cf9594f329fc36c1d802e7d9256b3fa7c8389..8485146d3e26aefd33991d27712d6a5bea20e6eb 100644
--- a/src/services/raid-event-service.test.ts
+++ b/src/services/raid-event-service.test.ts
@@ -69,6 +69,11 @@ describe('RaidEventService', () => {
       URL,
       expect.objectContaining({ headers: { Accept: 'application/json' } }),
     );
+    expect(entries.find((entry) => entry.msg === 'raid events read')).toMatchObject({
+      events: 5,
+      max: events.maxEvents().length,
+      big: events.bigEvents().length,
+    });
     expect(entries.some((entry) => entry.msg === 'raid events read' && entry.events === 5)).toBe(
       true,
     );
@@ -403,6 +408,11 @@ describe('RaidEventService', () => {
       await again.events.loadMax();
       expect(again.events.maxEvents()).toEqual(events.maxEvents());
       expect(again.events.bigEvents()).toEqual(events.bigEvents());
+      // Plan 8X-G (staging of 8X-F, M3): a load says what it loaded, as the other loads do.
+      expect(again.entries.find((entry) => entry.msg === 'max events loaded')).toMatchObject({
+        max: 7,
+        big: events.bigEvents().length,
+      });
     });
 
     it("keeps the week's featured boss after a restart once the feed dropped its Monday", async () => {
diff --git a/src/services/raid-event-service.ts b/src/services/raid-event-service.ts
index ecd4166c5ebcea06740cc73e75862495103724f3..79c86322be759e8b5df680cb634e0e72b03596cf 100644
--- a/src/services/raid-event-service.ts
+++ b/src/services/raid-event-service.ts
@@ -203,6 +203,8 @@ export class RaidEventService
       ...kept.big.filter((old) => !readBig.some((event) => event.id === old.id)),
       ...readBig,
     ]);
+    const counts = { max: kept.max.length, big: kept.big.length };
+    this.safely(() => this.options.log.info(counts, 'max events loaded'));
   }
 
   /**
@@ -317,7 +319,8 @@ export class RaidEventService
       return { status: 'failed', reason };
     }
     const events = this.current.length;
-    this.safely(() => log.info({ events }, 'raid events read'));
+    const counts = { events, max: this.currentMax.length, big: this.currentBig.length };
+    this.safely(() => log.info(counts, 'raid events read'));
     return { status: 'updated', events };
   }
 
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index a3b57dca8aa878117a82c994ef59e89ecb5d0fd7..29ed38563dacb130d89bc74144d079002937d8ee 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -19,7 +19,7 @@ import {
   renameAs,
   START_THROTTLE,
   startAs,
-  TIMED_TIME_HINT,
+  timedTimeHint,
   typedTimedTime,
   type TimedAnswer,
 } from '../commands/parties/timed.js';
@@ -307,7 +307,10 @@ export function meetupRoutes(scope: FastifyInstance, deps: WebDeps): void {
     try {
       const typed = typedTimedTime(ctx, newPartyTimes('meetup', now), 'meet', body.data.start, now);
       if (typed === 'unset') {
-        return refused(422, `Give the time the meetup starts. ${TIMED_TIME_HINT}`);
+        return refused(
+          422,
+          `Give the time the meetup starts. ${timedTimeHint(now, ctx.config.settings.timezone)}`,
+        );
       }
       startTime = typed.at;
     } catch (err) {
````

### Task 3: 8X-G 3: labels: a button that opens a dialog ends in an ellipsis; the train kind's words

Prototype commit: `598af6e7403cf95158a45089b7de6e0cc2b423b6`

- Set time…, Something is wrong…, Appeal…, Ask the moderators…, Delete… (the
  moderators' pin-battle notice) and Open the form again… each open a dialog; the texts
  that name them follow (the raid without times, /meetup's refusal on the map, the
  block DMs, the asks of a refused place, the guide and the announcement draft).
- The kind of a train is "What the train is mainly for": Raids, Dynamax Battles,
  Gigantamax Battles, in /train kind:'s hint (its stops can be gyms or power spots), its
  choices and the panel's menu; the posts keep Raid Train and so on. The commands change:
  deploy them first.

**Files:**

```
 docs/guides/migrating-a-legacy-instance.md                   |  2 +-
 docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md |  2 +-
 src/commands/gyms/edit-move.test.ts                          | 10 +++++-----
 src/commands/gyms/gym.test.ts                                |  4 ++--
 src/commands/gyms/shared.ts                                  |  2 +-
 src/commands/gyms/view-controls.test.ts                      |  2 +-
 src/commands/max/max.test.ts                                 |  2 +-
 src/commands/meetups/meetup.test.ts                          |  6 +++---
 src/commands/meetups/meetup.ts                               |  2 +-
 src/commands/meetups/place-ask.test.ts                       |  4 ++--
 src/commands/meetups/place-ask.ts                            |  2 +-
 src/commands/parties/meet-dialog.ts                          |  2 +-
 src/commands/raids/raid-screenshot.test.ts                   |  2 +-
 src/commands/screenshots/feedback.ts                         |  2 +-
 src/commands/screenshots/read-screenshot.test.ts             |  2 +-
 src/commands/trains/move.test.ts                             |  2 +-
 src/commands/trains/train.test.ts                            | 11 ++++++++---
 src/commands/trains/train.ts                                 | 13 +++++++++----
 src/components/party.meet.test.ts                            |  2 +-
 src/render/max-post.test.ts                                  |  2 +-
 src/render/meetup-safety.ts                                  |  8 ++++----
 src/render/mirrors.test.ts                                   |  4 ++--
 src/render/moderation.ts                                     |  2 +-
 src/render/party-controls.test.ts                            |  2 +-
 src/render/party-controls.ts                                 |  2 +-
 src/render/place-asks.ts                                     |  2 +-
 src/render/raid-post.test.ts                                 |  2 +-
 src/render/train-kind.test.ts                                |  8 ++++----
 src/render/train-panel.ts                                    | 11 ++++++++---
 src/render/train-post.test.ts                                |  2 +-
 src/render/train-words.ts                                    | 20 +++++++++++++-------
 src/services/meetup-safety.blocks.test.ts                    |  4 ++--
 src/web/meetup-routes.ts                                     |  2 +-
 33 files changed, 83 insertions(+), 62 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/gyms/edit-move.test.ts src/commands/gyms/gym.test.ts src/commands/gyms/view-controls.test.ts src/commands/max/max.test.ts src/commands/meetups/meetup.test.ts src/commands/meetups/place-ask.test.ts src/commands/raids/raid-screenshot.test.ts src/commands/screenshots/read-screenshot.test.ts src/commands/trains/move.test.ts src/commands/trains/train.test.ts src/components/party.meet.test.ts src/render/max-post.test.ts src/render/mirrors.test.ts src/render/party-controls.test.ts src/render/raid-post.test.ts src/render/train-kind.test.ts src/render/train-post.test.ts src/services/meetup-safety.blocks.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 598af6e7403cf95158a45089b7de6e0cc2b423b6 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-G 3: labels: a button that opens a dialog ends in an ellipsis; the train kind's words`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 89d313a851aa39a94427db96d1601a8909b63f5f..c17e167dd1443a5d5d9ed13f6ce3c46675a1b1b6 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -305,7 +305,7 @@ The first only says what it would do, line by line: which rows it would add, and
 ## 5. What your members will notice
 
 - **A forum post per raid.** Each region keeps its channel, and gets a forum beside it. Every raid, max battle, train and meetup is a post in that forum, with the boss, the times, the groups and everybody signed up. A link to each new post appears in the region's channel.
-- **Buttons instead of reactions.** The post lists who is Interested, Coming, Here and Done, each line starting with its icon (Pine's old reaction icons, 🤔 for Interested), under a heading per group. The buttons are three rows at the bottom, the same for one group and several: Interested, Join, Here, Done (raids) and Leave, icons only; Meet… (raids; the game's Select Time icon, ⏰ until your application has it), −1, +1 and Remote, icons only; then Group… (and Set time while a raid has no times). Pressing one answers only you, and a short line in the post says what you did. In a post of several groups, Interested, Join or Here from somebody not signed up yet first asks which group (a short dialog, the newest group picked). Group… moves you to another group or opens a new one, with an optional label; Meet… sets your group's meeting time from a list of times, the game's in-game RSVP times among them. A group nobody is in goes by itself, unless it has a label or a meeting time.
+- **Buttons instead of reactions.** The post lists who is Interested, Coming, Here and Done, each line starting with its icon (Pine's old reaction icons, 🤔 for Interested), under a heading per group. The buttons are three rows at the bottom, the same for one group and several: Interested, Join, Here, Done (raids) and Leave, icons only; Meet… (raids; the game's Select Time icon, ⏰ until your application has it), −1, +1 and Remote, icons only; then Group… (and Set time… while a raid has no times). Pressing one answers only you, and a short line in the post says what you did. In a post of several groups, Interested, Join or Here from somebody not signed up yet first asks which group (a short dialog, the newest group picked). Group… moves you to another group or opens a new one, with an optional label; Meet… sets your group's meeting time from a list of times, the game's in-game RSVP times among them. A group nobody is in goes by itself, unless it has a label or a meeting time.
 - **Slash commands instead of `!` commands.** `!` commands get no answer any more. Type `/` and Discord lists the commands with their options; `/help` explains each. The most used ones:
 
   | Legacy                                         | New                                                     |
diff --git a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
index 21370d5203e9f50579415d7fced230432865cd0f..a992afe0fc53c74f7878892443ca1eac370939b2 100644
--- a/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
+++ b/docs/superpowers/plans/2026-10-16-phase-8l2-announcements.md
@@ -61,7 +61,7 @@ Pine has been rewritten from the ground up:
 
 - TypeScript on current discord.js; every command is a slash command, with options Discord explains as you type (`/help` lists them all)
 - One forum post per raid, max battle, train and meetup, in a forum beside each region's channel, instead of a channel per raid
-- Buttons on the post instead of reactions, with the legacy reaction icons, in three rows at the bottom, the same for one group and several: Interested, Join, Here, Done, Leave; Meet… (the game's Select Time icon), −1, +1, Remote; Group… (and Set time while a raid has no times). A newcomer to a post of several groups is asked which group in a dialog; Group… moves a member or opens a group with a label; Meet… sets the group's meeting time from a list with the in-game RSVP times. Legacy `!group`, `!new` and `!meet` are Group…, Meet… and `/group`, `/meet`; a group nobody is in goes by itself
+- Buttons on the post instead of reactions, with the legacy reaction icons, in three rows at the bottom, the same for one group and several: Interested, Join, Here, Done, Leave; Meet… (the game's Select Time icon), −1, +1, Remote; Group… (and Set time… while a raid has no times). A newcomer to a post of several groups is asked which group in a dialog; Group… moves a member or opens a group with a label; Meet… sets the group's meeting time from a list with the in-game RSVP times. Legacy `!group`, `!new` and `!meet` are Group…, Meet… and `/group`, `/meet`; a group nobody is in goes by itself
 - Raid screenshots read with `/raid` or a mention of the bot
 - Max battles (`/max`) at power spots, with lobbies of 4 (Dynamax) and 100 (Gigantamax) that Join fills, the bosses from Pokebattler with the event's boss first, and DMs by the Dynamax and Gigantamax boxes of `/want`
 - Trains of max battles (Max Battle Train, Gigantamax Train) with stops at power spots, a Gigantamax Train's groups filled up to its lobby, and a train planned ahead with its start (`/train start:`)
diff --git a/src/commands/gyms/edit-move.test.ts b/src/commands/gyms/edit-move.test.ts
index a2d7c591c0824abf2f825d8006c30ebb242b7d64..78a17d97771c9583171c00ed5d781318d60f59b0 100644
--- a/src/commands/gyms/edit-move.test.ts
+++ b/src/commands/gyms/edit-move.test.ts
@@ -163,11 +163,11 @@ describe('/gym edit', () => {
     // The first form came from the command: its refusal is a message of its own.
     expect(refused.reply).toHaveBeenCalledTimes(1);
     expect(refusal.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
-    expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again', 'Cancel']);
+    expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again…', 'Cancel']);
     expect(made.gymStore.writes).toEqual([]);
 
     // The form again, with what was typed.
-    const reopened = await made.press(buttonId(refusal, 'Open the form again'));
+    const reopened = await made.press(buttonId(refusal, 'Open the form again…'));
     const again = reopened.showModal.mock.calls[0]?.[0] as Form;
     expect(again.custom_id).toBe(form.custom_id);
     expect(filled(again)).toEqual(typed);
@@ -204,7 +204,7 @@ describe('/gym edit', () => {
     expect(second.reply).not.toHaveBeenCalled();
     expect(said(sent(second.update))).toMatch(/^The name is too long as I store it/);
     expect(buttonsOf(sent(second.update)).map(([label]) => label)).toEqual([
-      'Open the form again',
+      'Open the form again…',
       'Cancel',
     ]);
     // Put back to what it was: nothing to write, said where the refusal stood.
@@ -223,7 +223,7 @@ describe('/gym edit', () => {
     const notice = `${'n'.repeat(498)}\u{1f600}`;
     const typed = { ...filled(form), keywords, notice };
     const refused = await made.submit(form.custom_id, typed, { modalFromCommand: true });
-    const reopened = await made.press(buttonId(answerOf(refused), 'Open the form again'));
+    const reopened = await made.press(buttonId(answerOf(refused), 'Open the form again…'));
     const again = reopened.showModal.mock.calls[0]?.[0] as Form;
     expect(filled(again).keywords).toBe(keywords);
     expect(filled(again).notice).toBe(notice);
@@ -238,7 +238,7 @@ describe('/gym edit', () => {
     const many = await made.submit(form.custom_id, { ...filled(form), keywords });
     expect(said(answerOf(many))).toMatch(/^That is 3 keywords too many: a gym may have 30\.\n/);
     expect(buttonsOf(answerOf(many)).map(([label]) => label)).toEqual([
-      'Open the form again',
+      'Open the form again…',
       'Cancel',
     ]);
     expect(made.gymStore.row(1)?.keywords).toEqual([]);
diff --git a/src/commands/gyms/gym.test.ts b/src/commands/gyms/gym.test.ts
index ffb4fd47aa21e698a6632d085fe9caa25ae7d0c7..01c5fbb90654c07e4a6430496f295d5dd788c7a3 100644
--- a/src/commands/gyms/gym.test.ts
+++ b/src/commands/gyms/gym.test.ts
@@ -576,11 +576,11 @@ describe('/gym add', () => {
         'The keyword "kkkkkkkkkkkkkkkkkkkkkkkkkkkkk…" is 2 characters too long: a keyword may have 50.\n' +
         'Nothing was saved. What you typed is kept:',
     );
-    expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again', 'Cancel']);
+    expect(buttonsOf(refusal).map(([label]) => label)).toEqual(['Open the form again…', 'Cancel']);
     expect(made.gymStore.writes).toEqual([]);
 
     // The form opens with what was typed, the paragraph included.
-    const reopened = await made.press(buttonId(refusal, 'Open the form again'));
+    const reopened = await made.press(buttonId(refusal, 'Open the form again…'));
     const form = reopened.showModal.mock.calls[0]?.[0] as {
       custom_id: string;
       components: { components: { custom_id: string; value?: string }[] }[];
diff --git a/src/commands/gyms/shared.ts b/src/commands/gyms/shared.ts
index cc94b4d15e8e77f6394f79815963959e8d02b89a..0c1d8004aef273afd0d6b97d59e4b998e86a5d1a 100644
--- a/src/commands/gyms/shared.ts
+++ b/src/commands/gyms/shared.ts
@@ -330,7 +330,7 @@ export async function refuseForm(
   const answer = gymQuestion(
     [content([refusal, 'Nothing was saved. What you typed is kept:'])],
     [
-      button(token, 'reopen', 'Open the form again', ButtonStyle.Primary),
+      button(token, 'reopen', 'Open the form again…', ButtonStyle.Primary),
       button(token, 'cancel', 'Cancel', ButtonStyle.Secondary),
     ],
   );
diff --git a/src/commands/gyms/view-controls.test.ts b/src/commands/gyms/view-controls.test.ts
index fa4a081a30ba9c8e94a3d30970221aa12f1a5d54..477ece9b6de0d2c1826123089d35f018bb69cb58 100644
--- a/src/commands/gyms/view-controls.test.ts
+++ b/src/commands/gyms/view-controls.test.ts
@@ -158,7 +158,7 @@ describe('the buttons of the view of /gym show', () => {
     expect(refusal.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
     expect(said(refusal)).toMatch(/^A gym needs a name\./);
     // Opened again from the refusal, the form is answered in the place of the refusal.
-    const again = await made.press(buttonId(refusal, 'Open the form again'));
+    const again = await made.press(buttonId(refusal, 'Open the form again…'));
     const second = formOf(again);
     const done = await made.submit(second.custom_id, { name: 'Reading Room' });
     expect(done.deferUpdate).toHaveBeenCalledTimes(1);
diff --git a/src/commands/max/max.test.ts b/src/commands/max/max.test.ts
index da4cb71a3e523acc021776bb0268d1c9590b92ed..56373f038a198243581cb61e1bfb65793d361e0e 100644
--- a/src/commands/max/max.test.ts
+++ b/src/commands/max/max.test.ts
@@ -673,7 +673,7 @@ describe('/max at an unlisted power spot', () => {
         '-# Posted already: a power spot Pine does not know, which nobody checked. ' +
         'Delete closes it as `/delete` does.',
     ]);
-    expect(buttonNames(notice?.message)).toEqual(['Delete', 'Go to post']);
+    expect(buttonNames(notice?.message)).toEqual(['Delete…', 'Go to post']);
     expect(linksOf(notice?.message)).toEqual([
       `Go to post https://discord.com/channels/${FAKE_GUILD_ID}/${battle.forumPostId ?? ''}`,
     ]);
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index f76b2e11f685ce857e55f642a940ad1a5d71b378..696da8862314da8bf1d082a8ccd949f93ad6b2fd 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -574,7 +574,7 @@ describe('/meetup with meetup safety on', () => {
     const shown = asV2(payload);
     expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
     expect(buttonsOf(shown).map((button) => [button.label, button.customId])).toEqual([
-      ['Appeal', `mappeal:${made.gateway.guildId}:open`],
+      ['Appeal…', `mappeal:${made.gateway.guildId}:open`],
     ]);
   });
 
@@ -607,7 +607,7 @@ describe('/meetup with meetup safety on', () => {
     expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     const shown = asV2(sent(submitted.editReply));
     expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
-    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Appeal']);
+    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Appeal…']);
     expect(made.meetups()).toEqual([]);
   });
 
@@ -622,7 +622,7 @@ describe('/meetup with meetup safety on', () => {
     const { submitted } = await made.run('Picnic');
     const shown = asV2(sent((submitted as FakeInteraction).editReply));
     expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
-    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Appeal']);
+    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Appeal…']);
     expect(made.meetups()).toEqual([]);
   });
 
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index e03c122bea9cfdf0bafbd943c7360fbf04d2290e..1e55ac265ba3bbb1e35a6185803a33ea2f7d240b 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -55,7 +55,7 @@ export const NO_MEETUP_HERE = "A meetup can't be held there.";
 
 /** Said on the live map of a refused place members may ask the moderators about (plan 8S-2). */
 export const ASK_ON_DISCORD =
-  'You can ask the moderators about it with /meetup on Discord: its answer has Ask the moderators.';
+  'You can ask the moderators about it with /meetup on Discord: its answer has "Ask the moderators…".';
 
 /** Said to a member blocked from making meetups in the server (the design's words). */
 export const NO_MEETUPS_FOR_YOU = "You can't create meetups on this server.";
diff --git a/src/commands/meetups/place-ask.test.ts b/src/commands/meetups/place-ask.test.ts
index 51a8061f8e0d6aea647aff30f61ae26e6753e370..ad5fe1875ab2c4e8a121630b96ecf52dee0ed124 100644
--- a/src/commands/meetups/place-ask.test.ts
+++ b/src/commands/meetups/place-ask.test.ts
@@ -117,7 +117,7 @@ describe('Ask the moderators (a place refused for good)', () => {
     const refused = await made.run();
     const answer = asV2(sent(refused.reply));
     expect(textOf(answer)).toBe(NO_MEETUP_HERE);
-    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Ask the moderators']);
+    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Ask the moderators…']);
     const opened = await made.ask(refused);
     const form = opened.showModal.mock.calls[0]?.[0] as { title: string };
     expect(form.title).toBe('Ask about this place');
@@ -157,7 +157,7 @@ describe('Ask the moderators (a place refused for good)', () => {
     const pressed = await made.ask(refused);
     const answer = asV2(sent(pressed.reply));
     expect(textOf(answer)).toBe("You can't create meetups on this server.");
-    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Appeal']);
+    expect(buttonsOf(answer).map((button) => button.label)).toEqual(['Appeal…']);
   });
 
   it('takes the button from any member, and says when the ask was sent already', async () => {
diff --git a/src/commands/meetups/place-ask.ts b/src/commands/meetups/place-ask.ts
index baa253a69dd7c3ea665d322498b350c3b66ed3ad..d440eb3312c044848efad88ad37315de47857011 100644
--- a/src/commands/meetups/place-ask.ts
+++ b/src/commands/meetups/place-ask.ts
@@ -79,7 +79,7 @@ export async function placeRefusal(
           {
             type: ComponentType.Button,
             style: ButtonStyle.Secondary,
-            label: 'Ask the moderators',
+            label: 'Ask the moderators…',
             custom_id: encodeCustomId({
               kind: ASK_KIND,
               id: key.kind,
diff --git a/src/commands/parties/meet-dialog.ts b/src/commands/parties/meet-dialog.ts
index 141ffeb3774be6a59d48c968cbcd5beef99aba32..602059e44a194c521eeabb8021651696b1cf7ce6 100644
--- a/src/commands/parties/meet-dialog.ts
+++ b/src/commands/parties/meet-dialog.ts
@@ -40,7 +40,7 @@ import { actingMember, outcomeWords, partyOver } from './reply.js';
  */
 
 /** Said at a press for a raid without times (Set time shows in Meet…'s place then). */
-export const NO_TIMES = 'This raid has no times yet: Set time gives them.';
+export const NO_TIMES = 'This raid has no times yet: "Set time…" gives them.';
 
 /** Said when no time to meet is left before the raid (or max battle) ends. */
 export const NO_TIME_LEFT = 'There is no time left to meet before this raid ends.';
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index 513807ee3bf5f01d29ff40e2c8e13ce0c2c70216..978e1510f5b96a9ae84fe62cf11b2bd3d59bd39d 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -219,7 +219,7 @@ describe('/raid with a screenshot', () => {
     expect(answer.content).toMatch(/does not look like the screen of a raid/);
     expect(rowsOf(answer)[0]?.components.map((c) => c.label)).toEqual([
       'All right',
-      'Something is wrong',
+      'Something is wrong…',
     ]);
   });
 
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
index 3d238c5e1aebda227902fad666be510bf54be2a9..5710fb475c78487c8d0523644a33398e272d5348 100644
--- a/src/commands/screenshots/feedback.ts
+++ b/src/commands/screenshots/feedback.ts
@@ -64,7 +64,7 @@ function shotButton(
 export function feedbackButtons(screenshotId: string): APIButtonComponent[] {
   return [
     shotButton(screenshotId, 'right', 'All right', ButtonStyle.Success),
-    shotButton(screenshotId, 'wrong', 'Something is wrong', ButtonStyle.Secondary),
+    shotButton(screenshotId, 'wrong', 'Something is wrong…', ButtonStyle.Secondary),
   ];
 }
 
diff --git a/src/commands/screenshots/read-screenshot.test.ts b/src/commands/screenshots/read-screenshot.test.ts
index 610d81d16df82577d02007c4f11fbf3b20d4652f..9cee7904cd3eae0b4d6f0b0cfaf03e1e1bd8bfe3 100644
--- a/src/commands/screenshots/read-screenshot.test.ts
+++ b/src/commands/screenshots/read-screenshot.test.ts
@@ -102,7 +102,7 @@ describe('/read-screenshot', () => {
     const id = shownId(answer);
     expect(buttonsOf(message).map(({ customId, label }) => [customId, label])).toEqual([
       [`shot:${id}:right`, 'All right'],
-      [`shot:${id}:wrong`, 'Something is wrong'],
+      [`shot:${id}:wrong`, 'Something is wrong…'],
     ]);
     expect(files('held')).toContain(`${id}.json`);
   });
diff --git a/src/commands/trains/move.test.ts b/src/commands/trains/move.test.ts
index 0dbadc36fe892016af173e2f3238ec8d4ac35407..c3d86ecf5ab47e330ee443c885882974fa9b1a2f 100644
--- a/src/commands/trains/move.test.ts
+++ b/src/commands/trains/move.test.ts
@@ -469,7 +469,7 @@ describe('the button "Manage train…" and its panel', () => {
     const shownPanel = asV2(sent(opened.reply));
     expect(textDisplays(shownPanel)).toEqual([
       '### Manage the train\nThis train has no route yet. Add its stops with `/route add`.',
-      '**What the train goes to**',
+      '**What the train is mainly for**',
     ]);
     // No dead buttons: no moves, no Reverse, no mode of an end it does not have.
     expect(customIdsOf(shownPanel)).toEqual([]);
diff --git a/src/commands/trains/train.test.ts b/src/commands/trains/train.test.ts
index 1f09f8c06f03620a1d4d24bf92ca1a0eb8c81629..15a482e1561b8a9217a30cb5338626dc72dcaac9 100644
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -304,10 +304,11 @@ describe('/train', () => {
     const option = train.data.toJSON().options?.find((found) => found.name === 'kind');
     expect(option).toMatchObject({
       required: false,
+      description: 'What the train is mainly for (its stops can be gyms or power spots)',
       choices: [
-        { name: 'Raid Train: raids', value: 'raid' },
-        { name: 'Max Battle Train: Dynamax battles', value: 'dynamax' },
-        { name: 'Gigantamax Train: Gigantamax battles', value: 'gigantamax' },
+        { name: 'Raids', value: 'raid' },
+        { name: 'Dynamax Battles', value: 'dynamax' },
+        { name: 'Gigantamax Battles', value: 'gigantamax' },
       ],
     });
   });
@@ -316,6 +317,10 @@ describe('/train', () => {
     const option = train.data.toJSON().options?.find((found) => found.name === 'start');
     expect(option?.description).not.toMatch(/\d+-\d+/);
     expect(train.help.examples?.filter((example) => /\d+-\d+/.test(example))).toEqual([]);
+    // The kind by its choice's name (plan 8X-G, item 8).
+    expect(train.help.examples).toContain(
+      '/train name:Wild Area kind:Gigantamax Battles start:{date} 10am',
+    );
   });
 
   describe('start: a train planned ahead (plan 8X-4; design 6.1)', () => {
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index cb83420571b7aca081c972fa3829c32793837f4e..1b69cac52fab8eb90869669b7f452093da8d972a 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -12,7 +12,12 @@ import {
   TRAIN_AT_END,
   TRAIN_KINDS,
 } from '../../domain/party/party.js';
-import { AT_END_LABELS, TRAIN_KIND_WORDS, trainKindChoice } from '../../render/train-words.js';
+import {
+  AT_END_LABELS,
+  TRAIN_KIND_QUESTION,
+  TRAIN_KIND_WORDS,
+  trainKindChoice,
+} from '../../render/train-words.js';
 import { actingMember } from '../parties/reply.js';
 import { newPartyTimes, requirePlaceForNew, typedTimedTime } from '../parties/timed.js';
 import { DISCORD_NAMES } from '../raids/report.js';
@@ -80,7 +85,7 @@ export const train: SimpleCommand = {
     .addStringOption((option) =>
       option
         .setName('kind')
-        .setDescription('What it goes to: raids (the default), Dynamax or Gigantamax battles')
+        .setDescription(`${TRAIN_KIND_QUESTION} (its stops can be gyms or power spots)`)
         .addChoices(TRAIN_KINDS.map((kind) => ({ name: trainKindChoice(kind), value: kind }))),
     )
     .addStringOption((option) =>
@@ -102,7 +107,7 @@ export const train: SimpleCommand = {
       'for a raid, and the button "Manage train…" or `/next` takes it to its next stop. `at-end` ' +
       'says what the train does at the last stop: it finishes the route (the default), loops ' +
       'back to the first stop, or turns back and runs the route backwards; the Manage train panel ' +
-      `changes that later, and reverses the route. \`kind\` says what it goes to: raids (a ` +
+      `changes that later, and reverses the route. \`kind\` says what the train is mainly for: raids (a ` +
       `${TRAIN_KIND_WORDS.raid}, the default), Dynamax battles (a ${TRAIN_KIND_WORDS.dynamax}: ` +
       `lobbies form on the spot) or Gigantamax battles (a ${TRAIN_KIND_WORDS.gigantamax}: Join ` +
       'fills its groups up to a Gigantamax lobby); the Manage train panel changes that later too, ' +
@@ -113,7 +118,7 @@ export const train: SimpleCommand = {
     examples: [
       '/train name:Saturday legendaries',
       '/train name:Park loop at-end:Loop',
-      `/train name:Wild Area kind:${TRAIN_KIND_WORDS.gigantamax} start:${DATE_EXAMPLE} 10am`,
+      `/train name:Wild Area kind:${trainKindChoice('gigantamax')} start:${DATE_EXAMPLE} 10am`,
     ],
   },
   guards: [
diff --git a/src/components/party.meet.test.ts b/src/components/party.meet.test.ts
index faf6774db54e94d954e1fe9ea82eab981006ede7..d505b8ce4eec9f71ab9faa7162013f2dca71fa70 100644
--- a/src/components/party.meet.test.ts
+++ b/src/components/party.meet.test.ts
@@ -121,7 +121,7 @@ describe('Meet… (plan 8X-1B, decision 5)', () => {
     const untimed = await setup({});
     const pressed = await untimed.press();
     expect(dialogOf(pressed)).toBeUndefined();
-    expect(sent(pressed.reply).content).toBe('This raid has no times yet: Set time gives them.');
+    expect(sent(pressed.reply).content).toBe('This raid has no times yet: "Set time…" gives them.');
     vi.setSystemTime(HATCH + 44 * MINUTE + 30_000);
     const late = await made.press();
     expect(dialogOf(late)).toBeUndefined();
diff --git a/src/render/max-post.test.ts b/src/render/max-post.test.ts
index 1bc1ebc05bb4fbbaa2f2e6bc341f02c5ecb5fd4f..cf0ac77e52c795a92343443220f4daaa27d6578c 100644
--- a/src/render/max-post.test.ts
+++ b/src/render/max-post.test.ts
@@ -174,7 +174,7 @@ describe('renderMaxPost: groups, controls and the rest', () => {
     expect(text).toContain('**Group B** · 1/4 coming · 1 interested');
     const names = buttonNames(post(twoGroups).message);
     expect(names).toContain('🎉');
-    expect(names).not.toContain('Set time');
+    expect(names).not.toContain('Set time…');
     expect(names).not.toContain('Screenshot feedback');
     expect(names).toContain('📡');
   });
diff --git a/src/render/meetup-safety.ts b/src/render/meetup-safety.ts
index b4cc6cb7517363d835382197d2d2c55d6ee8f29a..b364ed7fda26c41d6bb4168f94c83347afebe7d6 100644
--- a/src/render/meetup-safety.ts
+++ b/src/render/meetup-safety.ts
@@ -193,7 +193,7 @@ export function blockedAnswer(text: string, serverId: string): V2Message {
         {
           type: ComponentType.Button,
           style: ButtonStyle.Secondary,
-          label: 'Appeal',
+          label: 'Appeal…',
           custom_id: encodeCustomId({ kind: APPEAL_KIND, id: serverId, action: 'open' }),
         },
       ]),
@@ -209,7 +209,7 @@ export function blockedDm(serverName: string | undefined): V2Message {
   const server = serverName === undefined ? 'this server' : `**${plainNoLinks(serverName)}**`;
   return textMessage(REFUSED_ACCENT, [
     `A moderator blocked you from creating meetups on ${server}. If you think that is wrong, ` +
-      'use `/meetup` there and press Appeal.',
+      'use `/meetup` there and press "Appeal…".',
   ]);
 }
 
@@ -309,9 +309,9 @@ export function appealOutcomeDm(appeal: MeetupAppeal, serverName?: string): V2Me
     return textMessage(EXPIRED_ACCENT, [
       on === ''
         ? 'No moderator decided on your appeal of your meetup block in time. You can appeal ' +
-          'again: use `/meetup` on that server and press Appeal.'
+          'again: use `/meetup` on that server and press "Appeal…".'
         : `No moderator decided on your appeal of your meetup block${on} in time. You can ` +
-          'appeal again: use `/meetup` there and press Appeal.',
+          'appeal again: use `/meetup` there and press "Appeal…".',
     ]);
   }
   return textMessage(REFUSED_ACCENT, [
diff --git a/src/render/mirrors.test.ts b/src/render/mirrors.test.ts
index 58be07d40145ee0084f3e70f58c4f2d35ba8cd09..31a705fc64f500cf8dcba6a8708c73aecce90d33 100644
--- a/src/render/mirrors.test.ts
+++ b/src/render/mirrors.test.ts
@@ -92,12 +92,12 @@ describe('renderMirror', () => {
       expect(rowsOf(renderMirror(kind, egg, place))).toEqual([
         statuses,
         ['⬇️', '⬆️', 'pineremote'],
-        ['Group…', 'Set time'],
+        ['Group…', 'Set time…'],
       ]);
       expect(rowsOf(renderMirror(kind, elite, place))).toEqual([
         statuses,
         ['⬇️', '⬆️'],
-        ['Group…', 'Set time'],
+        ['Group…', 'Set time…'],
       ]);
       for (const post of [egg, elite]) {
         const copy = renderMirror(kind, post, place);
diff --git a/src/render/moderation.ts b/src/render/moderation.ts
index 12d9b7eeee4b25ee84183649efc5ad0d587b1f55..8d836d48194844e62ec3a67d7eb6e404ce4152ad 100644
--- a/src/render/moderation.ts
+++ b/src/render/moderation.ts
@@ -403,7 +403,7 @@ export function maxPinNotice(notice: MaxPinNotice, outcome?: MaxPinOutcome): V2M
   const remove: APIButtonComponent = {
     type: ComponentType.Button,
     style: ButtonStyle.Danger,
-    label: 'Delete',
+    label: 'Delete…',
     custom_id: encodeCustomId({ kind: MAX_PIN_KIND, id: notice.partyId, action: 'delete' }),
   };
   const go = linkButton('Go to post', undefined, postLink(notice.serverId, notice.postId));
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index 3ef4a2598349aecf531f9536f7cd72f72b9be842..99ca25433521ac0672a7a6157767e59372513e83 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -186,7 +186,7 @@ describe('the controls of a post (plan 8X-1B: one layout for one group and sever
     ]);
     expect(rows(withShot(testRaid())).at(-1)).toEqual([
       '👥 Group… regroup',
-      '⏰ Set time time',
+      '⏰ Set time… time',
       '📷 Screenshot feedback shot',
     ]);
   });
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index c8acc39fe298caf922cc3eeeedb2186462b8f3ae..caa8e9b466208f47b773b74a1e2f8e5da0f20d1a 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -354,7 +354,7 @@ export function bottomControls(party: Party, options: BottomOptions): PostButton
     ...(hasGroups(party) ? [groupButton(party)] : []),
     // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
     ...(raid && raid.hatchTime === null
-      ? [{ button: partyButton(id, 'time', 'Set time', ButtonStyle.Primary, undefined, '⏰') }]
+      ? [{ button: partyButton(id, 'time', 'Set time…', ButtonStyle.Primary, undefined, '⏰') }]
       : []),
     // Only a kept screenshot can be shown.
     ...(raid?.raid.screenshot?.id
diff --git a/src/render/place-asks.ts b/src/render/place-asks.ts
index 60a4ed59beda5bcfd50df8d400b4c28b60325bd8..53e22705fcfa7691e4312a79ae46eda93f3e4680 100644
--- a/src/render/place-asks.ts
+++ b/src/render/place-asks.ts
@@ -132,7 +132,7 @@ export function askOutcomeDm(ask: PlaceAskRecord, serverName?: string): V2Messag
   if (ask.status === 'expired') {
     return textMessage(EXPIRED_ACCENT, [
       `No moderator decided on your ask about ${place}${on} in time. You can ask again: use ` +
-        '`/meetup` there and press Ask the moderators.',
+        '`/meetup` there and press "Ask the moderators…".',
     ]);
   }
   return textMessage(REFUSED_ACCENT, [
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index 439afbffc6b3db4aa4dea9df6e109ca788bd3e4b..54db47b1892142b0cdb5021c65f2be0b7723fad8 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -912,7 +912,7 @@ describe('renderRaidPost', () => {
       '⬆️',
       '📡',
       'Group…',
-      'Set time',
+      'Set time…',
       'Screenshot feedback',
     ]);
     expect(sectionsOf(post.message).filter(({ button }) => button !== undefined)).toEqual([]);
diff --git a/src/render/train-kind.test.ts b/src/render/train-kind.test.ts
index 417dd24d756ec5522f82d487e1575abb4aafb9d4..e2f5311aa3ef87db5426408506998d3cf39bd62d 100644
--- a/src/render/train-kind.test.ts
+++ b/src/render/train-kind.test.ts
@@ -66,14 +66,14 @@ describe('the kind in the Manage train panel (plan 8X-4; design 6.1)', () => {
     const panel = trainPanel({ party: train, stop: stopsFrom({ get: gym }) });
     expect(textDisplays(panel).slice(1)).toEqual([
       '**At the end of the route**',
-      '**What the train goes to**',
+      '**What the train is mainly for**',
     ]);
     const [, kinds] = selectsOf(panel);
     expect(kinds?.customId).toBe(`party:${train.id}:kind`);
     expect(kinds?.options.map((option) => [option.value, option.label])).toEqual([
-      ['raid', 'Raid Train: raids'],
-      ['dynamax', 'Max Battle Train: Dynamax battles'],
-      ['gigantamax', 'Gigantamax Train: Gigantamax battles'],
+      ['raid', 'Raids'],
+      ['dynamax', 'Dynamax Battles'],
+      ['gigantamax', 'Gigantamax Battles'],
     ]);
     expectV2Sendable(panel);
   });
diff --git a/src/render/train-panel.ts b/src/render/train-panel.ts
index 84add91039ebc90f36b2df06d316c8e96911a3cd..710a32387854bedd8f8e0dc24c822f3773594432 100644
--- a/src/render/train-panel.ts
+++ b/src/render/train-panel.ts
@@ -32,7 +32,12 @@ import { PARTY_KIND, partyButton } from './party-controls.js';
 import { count, endSentence, memberText, type NamedMember } from './text.js';
 import type { TrainPlaces } from './train-post.js';
 import { stopInWords, stopLink, type PostStop } from './train-stops.js';
-import { AT_END_DESCRIPTIONS, TRAIN_KIND_DESCRIPTIONS, trainKindChoice } from './train-words.js';
+import {
+  AT_END_DESCRIPTIONS,
+  TRAIN_KIND_DESCRIPTIONS,
+  TRAIN_KIND_QUESTION,
+  trainKindChoice,
+} from './train-words.js';
 import { actionRow, container, menuRow, separator, textDisplay } from './v2.js';
 
 /** The grey edge of the Manage train panel: a tool for one member, not a post. */
@@ -208,7 +213,7 @@ export function trainPanel(view: TrainPlaces, note?: string): V2Message {
       components: [
         container(TRAIN_PANEL_COLOUR, [
           textDisplay(text.join('\n')),
-          textDisplay('**What the train goes to**'),
+          textDisplay(`**${TRAIN_KIND_QUESTION}**`),
           menuRow(kindMenu(party)),
         ]),
       ],
@@ -256,7 +261,7 @@ export function trainPanel(view: TrainPlaces, note?: string): V2Message {
     separator(),
     textDisplay('**At the end of the route**'),
     menuRow(atEndMenu(view, place)),
-    textDisplay('**What the train goes to**'),
+    textDisplay(`**${TRAIN_KIND_QUESTION}**`),
     menuRow(kindMenu(party)),
   ];
   return { v2: true, components: [container(TRAIN_PANEL_COLOUR, components)] };
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index c61c076ae128e16b718de618670850269b375a26..a868cc3412134c45626fab6a7c04d8900ce08d97 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -911,7 +911,7 @@ describe('trainPanel', () => {
         `Next is [Harbor Lighthouse Mural](${maps(7)})`,
       ].join('\n'),
       '**At the end of the route**',
-      '**What the train goes to**',
+      '**What the train is mainly for**',
     ]);
     expect(buttons(train)).toEqual([
       ['Next', '▶️', 'next', false],
diff --git a/src/render/train-words.ts b/src/render/train-words.ts
index 151c093df6425923ab2632e5cb850b46e5feb705..c2503ba0b15f275bd50f44162f1ba3b18f33fc69 100644
--- a/src/render/train-words.ts
+++ b/src/render/train-words.ts
@@ -13,16 +13,22 @@ export function trainKindSentence(kind: TrainKind): string {
   return `This train is a ${TRAIN_KIND_WORDS[kind]} now.`;
 }
 
-/** What each kind goes to, after its name in a choice: `Max Battle Train: Dynamax battles`. */
-export const TRAIN_KIND_GOES_TO: Readonly<Record<TrainKind, string>> = {
-  raid: 'raids',
-  dynamax: 'Dynamax battles',
-  gigantamax: 'Gigantamax battles',
+/**
+ * The question the kind answers, in `/train kind:`'s hint and over Manage…'s menu (plan 8X-G,
+ * Matt 2026-10-22): a train's stops can be gyms or power spots whatever its kind.
+ */
+export const TRAIN_KIND_QUESTION = 'What the train is mainly for';
+
+/** A kind as a choice of `/train kind:` and Manage…'s menu name it (plan 8X-G). */
+const TRAIN_KIND_CHOICES: Readonly<Record<TrainKind, string>> = {
+  raid: 'Raids',
+  dynamax: 'Dynamax Battles',
+  gigantamax: 'Gigantamax Battles',
 };
 
-/** A kind as a choice of `/train kind:` and the panel's menu name it. */
+/** A kind as a choice of `/train kind:` and Manage…'s menu name it: `Dynamax Battles`. */
 export function trainKindChoice(kind: TrainKind): string {
-  return `${TRAIN_KIND_WORDS[kind]}: ${TRAIN_KIND_GOES_TO[kind]}`;
+  return TRAIN_KIND_CHOICES[kind];
 }
 
 /** One line under a kind's option in the panel's menu: what the kind changes. */
diff --git a/src/services/meetup-safety.blocks.test.ts b/src/services/meetup-safety.blocks.test.ts
index 507e7f3d05713d8361094d1b448230607f604900..69997bba39e3d1ebd7d38fedc1d2eff3708ebef5 100644
--- a/src/services/meetup-safety.blocks.test.ts
+++ b/src/services/meetup-safety.blocks.test.ts
@@ -69,7 +69,7 @@ describe('MeetupSafety: Block member', () => {
     // One direct message, about the block; none for each request.
     expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
       'A moderator blocked you from creating meetups on **Pine Town**. If you think that is ' +
-        'wrong, use `/meetup` there and press Appeal.',
+        'wrong, use `/meetup` there and press "Appeal…".',
     ]);
   });
 
@@ -451,7 +451,7 @@ describe('MeetupSafety: appeals', () => {
     expect(buttonsOf(post?.message)).toEqual([]);
     expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
       'No moderator decided on your appeal of your meetup block on **Test Server** in time. You ' +
-        'can appeal again: use `/meetup` there and press Appeal.',
+        'can appeal again: use `/meetup` there and press "Appeal…".',
     ]);
     expect((await made.appeal()).kind).toBe('sent');
   });
diff --git a/src/web/meetup-routes.ts b/src/web/meetup-routes.ts
index 29ed38563dacb130d89bc74144d079002937d8ee..9d648d31fac1d23db1a1603e4c8c888dc474fe5b 100644
--- a/src/web/meetup-routes.ts
+++ b/src/web/meetup-routes.ts
@@ -114,7 +114,7 @@ export const MAP_PLACE_KINDS_ONLY = 'A meetup can be at a gym, a PokéStop or a
  * What a member blocked from making meetups is told on the map: the map has no Appeal button, so
  * it points them to `/meetup` (8S-1's follow-up).
  */
-export const MAP_BLOCKED = `${NO_MEETUPS_FOR_YOU} To appeal, use /meetup on Discord and press Appeal.`;
+export const MAP_BLOCKED = `${NO_MEETUPS_FOR_YOU} To appeal, use /meetup on Discord and press "Appeal…".`;
 
 /** What the map's answer adds after a meetup is made: how to change it there. */
 export const EDIT_IN_POPUP = 'Edit… in its popup changes its name, information and times.';
````

### Task 4: 8X-G 4: groups in letter order, A to E, everywhere they are listed

Prototype commit: `4578857804b2dc0c1ce02c3526fdeb2aed9544ba`

A party kept its groups in the order they were opened, so a letter given again came
after later ones (C D E A). Now the groups are kept in letter order as an invariant:
a new group goes in its place (withGroupAdded, in createGroup and chooseGroup) and a
stored party is read sorted (no new state version). The post, /shout group:'s
choices and the map's counts follow; the dialogs (Join's which-group, Group…, Split…)
and the map's question list them by letter too, "Any group with room" first. Which
group takes over as the default one still goes by when it was opened (newestFirst).
On Android the which-group dialog now preselects group A where there is no lobby size.

**Files:**

```
 docs/guides/migrating-a-legacy-instance.md |  2 +-
 src/commands/parties/attendance.test.ts    | 30 +++++++++++++++++++++++++++
 src/commands/trains/split.test.ts          | 25 ++++++++++-------------
 src/commands/trains/split.ts               | 14 ++++---------
 src/components/party.groups.test.ts        | 36 +++++++++++++++++++++++++++++++--
 src/components/party.train-copy.test.ts    |  2 +-
 src/domain/party/attendance.prune.test.ts  | 24 +++++++++++++++++++++-
 src/domain/party/attendance.ts             |  8 +++++---
 src/domain/party/party-state.test.ts       | 12 +++++++++++
 src/domain/party/party-state.ts            |  4 +++-
 src/domain/party/party.ts                  | 21 ++++++++++++++++---
 src/domain/party/train.ts                  |  5 ++++-
 src/domain/web/party-view.test.ts          | 20 ++++++++++++++++--
 src/domain/web/party-view.ts               |  9 +++++----
 src/render/group-dialogs.test.ts           | 55 +++++++++++++++++++++++++++++++++++++-------------
 src/render/group-dialogs.ts                | 23 +++++++++++++--------
 16 files changed, 225 insertions(+), 65 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/attendance.test.ts src/commands/trains/split.test.ts src/components/party.groups.test.ts src/components/party.train-copy.test.ts src/domain/party/attendance.prune.test.ts src/domain/party/party-state.test.ts src/domain/web/party-view.test.ts src/render/group-dialogs.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4578857804b2dc0c1ce02c3526fdeb2aed9544ba -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-G 4: groups in letter order, A to E, everywhere they are listed`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index c17e167dd1443a5d5d9ed13f6ce3c46675a1b1b6..547abf9e521535b19ba0e23bd917bc1cb6744459 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -305,7 +305,7 @@ The first only says what it would do, line by line: which rows it would add, and
 ## 5. What your members will notice
 
 - **A forum post per raid.** Each region keeps its channel, and gets a forum beside it. Every raid, max battle, train and meetup is a post in that forum, with the boss, the times, the groups and everybody signed up. A link to each new post appears in the region's channel.
-- **Buttons instead of reactions.** The post lists who is Interested, Coming, Here and Done, each line starting with its icon (Pine's old reaction icons, 🤔 for Interested), under a heading per group. The buttons are three rows at the bottom, the same for one group and several: Interested, Join, Here, Done (raids) and Leave, icons only; Meet… (raids; the game's Select Time icon, ⏰ until your application has it), −1, +1 and Remote, icons only; then Group… (and Set time… while a raid has no times). Pressing one answers only you, and a short line in the post says what you did. In a post of several groups, Interested, Join or Here from somebody not signed up yet first asks which group (a short dialog, the newest group picked). Group… moves you to another group or opens a new one, with an optional label; Meet… sets your group's meeting time from a list of times, the game's in-game RSVP times among them. A group nobody is in goes by itself, unless it has a label or a meeting time.
+- **Buttons instead of reactions.** The post lists who is Interested, Coming, Here and Done, each line starting with its icon (Pine's old reaction icons, 🤔 for Interested), under a heading per group. The buttons are three rows at the bottom, the same for one group and several: Interested, Join, Here, Done (raids) and Leave, icons only; Meet… (raids; the game's Select Time icon, ⏰ until your application has it), −1, +1 and Remote, icons only; then Group… (and Set time… while a raid has no times). Pressing one answers only you, and a short line in the post says what you did. In a post of several groups, Interested, Join or Here from somebody not signed up yet first asks which group (a short dialog, the groups in letter order, the newest group marked (on Android the first)). Group… moves you to another group or opens a new one, with an optional label; Meet… sets your group's meeting time from a list of times, the game's in-game RSVP times among them. A group nobody is in goes by itself, unless it has a label or a meeting time.
 - **Slash commands instead of `!` commands.** `!` commands get no answer any more. Type `/` and Discord lists the commands with their options; `/help` explains each. The most used ones:
 
   | Legacy                                         | New                                                     |
diff --git a/src/commands/parties/attendance.test.ts b/src/commands/parties/attendance.test.ts
index c369a47478752e832332e2997bf7e247585a42df..07b79b141b1a57171a8179d77a41af29b5f90560 100644
--- a/src/commands/parties/attendance.test.ts
+++ b/src/commands/parties/attendance.test.ts
@@ -199,6 +199,36 @@ describe('the attendance commands', () => {
     expect(await offered('', { channelId: WEST_CHANNEL, thread: undefined })).toEqual([]);
   });
 
+  it('offers a letter given again by letter, as the post lists it (review r0 A7)', async () => {
+    const made = await setup();
+    // Bob opens B, Alice joins A, the reporter opens C and Alice follows (A goes), then three
+    // more open D, E and A again, the last.
+    const id = made.party.id;
+    await made.attendance.newGroup(id, { id: BOB, name: 'Bob' });
+    await made.attendance.joinGroup(id, { id: ALICE, name: 'Alice' }, 'A');
+    await made.attendance.newGroup(id, { id: REPORTER, name: 'Reporter' });
+    await made.attendance.joinGroup(id, { id: ALICE, name: 'Alice' }, 'C');
+    for (const member of [CAROL, '200000000000000011', '200000000000000012']) {
+      await made.attendance.newGroup(id, { id: member, name: 'Somebody' });
+    }
+    const interaction = fakeAutocomplete({
+      commandName: 'join',
+      channelId: made.postId,
+      thread: { parentId: WEST_FORUM },
+      focused: '',
+      focusedName: 'group',
+    });
+    await made.router.handle(interaction as never);
+    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
+    expect(interaction.respond.mock.calls[0]?.[0]?.map((choice) => choice.value)).toEqual([
+      'A',
+      'B',
+      'C',
+      'D',
+      'E',
+    ]);
+  });
+
   it('/remote and /local keep the status of an attendee and sign up anybody else as interested', async () => {
     const made = await setup();
     expect(await made.answer('remote')).toBe('You are interested, remotely.');
diff --git a/src/commands/trains/split.test.ts b/src/commands/trains/split.test.ts
index cd40081c7cbf32fdabe9dfebf924254c844142ce..8ff74175fe9d41275c5c0b43e700bc749b3b0a7d 100644
--- a/src/commands/trains/split.test.ts
+++ b/src/commands/trains/split.test.ts
@@ -236,13 +236,13 @@ describe('the button "Split group…" of a train post', () => {
       userId: CAROL,
       displayName: 'Carol',
     });
-    // The presser's own group last: they are more likely to split off another.
-    expect(dialogOf(forConductor)).toEqual(made.drawn(['B', 'A'], CAROL));
+    // In letter order, the presser's own group too (plan 8X-G).
+    expect(dialogOf(forConductor)).toEqual(made.drawn(['A', 'B'], CAROL));
   });
 
-  it("offers first the group with the most members but the presser's own, which comes last", async () => {
-    // Plan 8X-1B: Android picks a radio group's first choice by itself; none is marked, the
-    // group that leaves is picked on purpose. Ties go by letter.
+  it('offers the groups in letter order, whatever their size and whoever presses (plan 8X-G)', async () => {
+    // Plan 8X-G (Matt, 2026-10-22): every list of groups is in letter order. None is marked, the
+    // group that leaves is picked on purpose (Android picks the first by itself).
     const made = await setup();
     const id = made.party.id;
     const ERIN = '200000000000000006';
@@ -257,18 +257,15 @@ describe('the button "Split group…" of a train post', () => {
         picked,
       ]);
     };
-    // Staff, in no group: C (3), then A and B (2 each) by letter.
-    expect(await order(STAFF)).toEqual([
-      ['C', false],
+    // Staff, in no group: A and B (2 each), C (3).
+    const letters = [
       ['A', false],
       ['B', false],
-    ]);
-    await made.trains.setConductor(id, { id: CAROL, name: 'Carol' });
-    expect(await order({ userId: CAROL, displayName: 'Carol' })).toEqual([
       ['C', false],
-      ['B', false],
-      ['A', false],
-    ]);
+    ];
+    expect(await order(STAFF)).toEqual(letters);
+    await made.trains.setConductor(id, { id: CAROL, name: 'Carol' });
+    expect(await order({ userId: CAROL, displayName: 'Carol' })).toEqual(letters);
   });
 
   it('tells a member who may split no group why, and opens no dialog', async () => {
diff --git a/src/commands/trains/split.ts b/src/commands/trains/split.ts
index e157c9880a83e4a15f9265546e9c2b21d61769b3..330f3d33cd82452337cc9aee8b38708712f98595 100644
--- a/src/commands/trains/split.ts
+++ b/src/commands/trains/split.ts
@@ -15,7 +15,6 @@ import {
   attendeeOf,
   isGroupId,
   isTrain,
-  membersWhere,
   type GroupId,
   type TrainParty,
 } from '../../domain/party/party.js';
@@ -111,15 +110,10 @@ export async function openSplit(
   if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
   const staff = isStaff(interaction, ctx);
   const groups = splittableGroups(party, interaction.user.id, staff);
-  // Plan 8X-1B: Android picks a radio group's first choice by itself, so the first is the most
-  // likely one: the group with the most members but the presser's own (ties by letter), which
-  // comes last (they more likely split another off). None is marked: it is picked on purpose.
-  const own = attendeeOf(party, interaction.user.id)?.group;
-  const size = (group: GroupId) =>
-    membersWhere(party, (attendee) => attendee.group === group).length;
-  const [first, ...rest] = [...groups].sort(
-    (a, b) => Number(a === own) - Number(b === own) || size(b) - size(a) || a.localeCompare(b),
-  );
+  // In letter order, as every list of groups (plan 8X-G, Matt 2026-10-22). None is marked: it
+  // is picked on purpose (Android picks a radio group's first choice by itself).
+  // `splittableGroups` keeps the party's order, which is the letters' (review r0 A3).
+  const [first, ...rest] = groups;
   if (first === undefined) throw new UserError(whyNot(ctx, party, interaction.user.id, staff));
   await interaction.showModal(
     await dialogFor(interaction, ctx, party, interaction.user.id, staff, [first, ...rest]),
diff --git a/src/components/party.groups.test.ts b/src/components/party.groups.test.ts
index 8d557a0fa7e5e48745e6c46042220003c7999001..e45ff70b14280f6d5c16fe5bd937eeb053f5370c 100644
--- a/src/components/party.groups.test.ts
+++ b/src/components/party.groups.test.ts
@@ -7,6 +7,7 @@ import {
   sent,
   type FakeInteraction,
 } from '../../test/support/fake-interactions.js';
+import { textDisplays } from '../../test/support/messages.js';
 import { ALICE, BOB, REPORTER } from '../../test/support/parties.js';
 import { reportedRaid } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
@@ -104,20 +105,51 @@ async function setup(options: { grouped?: boolean; lobbySize?: number } = {}) {
 const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
 
 describe('Interested, Join and Here of a post of several groups (plan 8X-1B)', () => {
-  it('ask a newcomer which group in a dialog, the newest group first and picked', async () => {
+  it('ask a newcomer which group in a dialog, in letter order, the default group marked', async () => {
     const made = await setup();
     for (const action of ['maybe', 'join', 'here']) {
       const pressed = await made.click(action);
       const dialog = shownDialog(pressed);
       expect(dialogChoices(dialog).map(({ value, picked }) => [value, picked])).toEqual([
-        [made.group('B'), true],
         [made.group('A'), false],
+        [made.group('B'), true],
       ]);
       // Nothing is signed up by the press itself.
       expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
     }
   });
 
+  it('lists a letter given again in its place in the post and the dialog (plan 8X-G)', async () => {
+    const made = await setup();
+    const id = made.party.id;
+    // Alice joins A, the reporter opens C, Alice follows (A goes); three more open D, E and A
+    // again, the last.
+    await made.attendance.joinGroup(id, { id: ALICE, name: 'Alice' }, 'A');
+    await made.attendance.newGroup(id, { id: REPORTER, name: 'Reporter' });
+    await made.attendance.joinGroup(id, { id: ALICE, name: 'Alice' }, 'C');
+    for (const member of ['200000000000000011', '200000000000000012', DAVE]) {
+      expect((await made.attendance.newGroup(id, { id: member, name: 'Somebody' })).kind).toBe(
+        'ok',
+      );
+    }
+    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
+    await made.service.flush();
+    const post = made.gateway.posts.get(made.postId);
+    const headings = textDisplays(post?.message).flatMap((text) =>
+      [...text.matchAll(/\*\*Group ([A-E])\*\*/g)].map((match) => match[1]),
+    );
+    expect(headings).toEqual(['A', 'B', 'C', 'D', 'E']);
+    // A newcomer is asked.
+    const dialog = shownDialog(await made.click('join', '200000000000000099'));
+    expect(dialogChoices(dialog).map(({ value }) => value.split(':')[0])).toEqual([
+      'A',
+      'B',
+      'C',
+      'D',
+      'E',
+    ]);
+  });
+
   it('signs the newcomer up at Submit in the group they chose, with the status of the button', async () => {
     const made = await setup();
     const dialog = shownDialog(await made.click('here'));
diff --git a/src/components/party.train-copy.test.ts b/src/components/party.train-copy.test.ts
index 60dd5dba75e6d6e37cd4410185c4ef2c3fa8bf96..bb7062f5bbc47772cd44fe1923d3e62f94afdc9a 100644
--- a/src/components/party.train-copy.test.ts
+++ b/src/components/party.train-copy.test.ts
@@ -90,7 +90,7 @@ describe('the buttons of the copy of a train in another region', () => {
   it('sign a member up who cannot see the forum of the train, and let them into it', async () => {
     const made = await setup();
     made.gateway.shutOut(WEST_FORUM, ALICE);
-    // Join asks a newcomer which group, B (the newest) picked to start with.
+    // Join asks a newcomer which group, B (the default group, where Join would put them) marked.
     expect(await made.pressAndPick('join')).toBe('You are coming, in group B.');
     expect(attendeeOf(made.current(), ALICE)).toMatchObject({
       status: PartyStatus.Coming,
diff --git a/src/domain/party/attendance.prune.test.ts b/src/domain/party/attendance.prune.test.ts
index d5a13d5a154a3c43164deb299cfdb798ef3a0821..1523d4cc5e4322ed8852ec2f659f36d32b7f8963 100644
--- a/src/domain/party/attendance.prune.test.ts
+++ b/src/domain/party/attendance.prune.test.ts
@@ -145,6 +145,22 @@ describe('pruneGroups', () => {
     expect(pruned.defaultGroupId).toBe('C');
   });
 
+  it('puts a group Join opens with a reused letter in its place by letter (plan 8X-G)', () => {
+    const party = withAttendees(
+      raidWith([
+        { id: 'C', opened: LATER },
+        { id: 'E', opened: LATER + 1 },
+      ]),
+      {
+        [ALICE]: { group: 'C' },
+        [BOB]: { group: 'E' },
+      },
+    );
+    const chosen = chooseGroup(party, CAROL, 1, 1, LATER + 2);
+    expect(chosen.group).toBe('A');
+    expect(chosen.party.groups.map((group) => group.id)).toEqual(['A', 'C', 'E']);
+  });
+
   it('is the very same party when every group has somebody in it', () => {
     const party = testRaid();
     expect(pruneGroups(party)).toBe(party);
@@ -160,7 +176,13 @@ describe('pruneGroups', () => {
     expect(pruned.groups.map((group) => group.id)).toEqual(['A', 'E']);
     // No letter after E: the first free one, B again, opened now.
     const again = done(createGroup(pruned, REPORTER, { ...limits, now: LATER + 5 }));
-    expect(again.groups.at(-1)).toEqual({ id: 'B', opened: LATER + 5 });
+    // In its place by letter, not after E (plan 8X-G): the post and dialogs list A, B, E.
+    expect(again.groups).toEqual([
+      { id: 'A' },
+      { id: 'B', opened: LATER + 5 },
+      { id: 'E', opened: LATER + 1 },
+    ]);
+    expect(again.defaultGroupId).toBe('B');
     expect(stampedGroup(again, 'B', LATER.toString(36))).toBeUndefined();
   });
 });
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index da7e99e94e429a5af18efab79beebbd36cba13d5..a056b220198712813e4b5232b371e9b0c3ad5c88 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -2,6 +2,8 @@ import {
   attendeeOf,
   GROUP_IDS,
   groupOf,
+  newestFirst,
+  withGroupAdded,
   groupOpened,
   hasGroups,
   isBattle,
@@ -273,7 +275,7 @@ export function chooseGroup<P extends Party>(
     return {
       party: {
         ...party,
-        groups: [...party.groups, openedGroup(party, id, now)],
+        groups: withGroupAdded(party.groups, openedGroup(party, id, now)),
         defaultGroupId: id,
       },
       group: id,
@@ -715,7 +717,7 @@ export function createGroup<P extends Party>(
   const group = openedGroup(party, id, limits.now);
   const opened: P = {
     ...party,
-    groups: [...party.groups, tidy === undefined ? group : { ...group, label: tidy }],
+    groups: withGroupAdded(party.groups, tidy === undefined ? group : { ...group, label: tidy }),
     defaultGroupId: id,
   };
   const moved = joinGroup(opened, memberId, id, limits);
@@ -792,7 +794,7 @@ export function pruneGroups<P extends Party>(party: P): P {
     (group) => used.has(group.id) || Boolean(group.label) || group.startTime !== undefined,
   );
   if (kept.length === party.groups.length) return party;
-  const fallback = groupOf(party, party.defaultGroupId) ?? party.groups.at(-1);
+  const fallback = groupOf(party, party.defaultGroupId) ?? newestFirst(party)[0];
   const groups = kept.length > 0 ? kept : fallback ? [fallback] : [];
   if (groups.length === party.groups.length) return party;
   if (groups.some((group) => group.id === party.defaultGroupId)) return { ...party, groups };
diff --git a/src/domain/party/party-state.test.ts b/src/domain/party/party-state.test.ts
index 9095c0cbcd9b15af8cdeec5015c217ff22f1b23e..6a50d84d7dff5e347787b700f76958ee8788d9b6 100644
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -168,6 +168,18 @@ describe('party state', () => {
     expect(back).toEqual({ ok: true, party: raid });
   });
 
+  it('reads the groups in letter order, as a party keeps them since plan 8X-G', () => {
+    const raid = fullRaid();
+    const document = stored(partyState(raid)) as { groups: { id: string }[] };
+    // Stored before 8X-G: a letter given again (A) after the groups opened before it.
+    const old = { ...document, groups: [...document.groups].reverse() };
+    const back = partyFromStored(columnsOf(raid), old, stored(raid.mirrorMessages));
+    expect(raid.groups.length).toBeGreaterThan(1);
+    expect(back.ok && back.party.groups.map((group) => group.id)).toEqual(
+      raid.groups.map((group) => group.id),
+    );
+  });
+
   it('reads a raid that was stored with the EX tier as an elite raid, at any version', () => {
     const raid = fullRaid();
     const document = stored(partyState(raid)) as { v: number; raid: { tier: object } };
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index b5da5ea3880f4d7fa11281fa6c19f4e03cdd639f..c6fa32ac8f52d0774d90c74eb54aa6f7615123ca 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -15,6 +15,7 @@ import {
   TEAMS,
   TRAIN_AT_END,
   TRAIN_KINDS,
+  inLetterOrder,
   isPartyType,
   type Attendee,
   type MirrorMessage,
@@ -877,7 +878,8 @@ export function partyFromStored(
     anonymous,
     ...(makerName === undefined ? {} : { makerName }),
     attendees,
-    groups,
+    // Kept in letter order since plan 8X-G; one stored before may have a reused letter last.
+    groups: inLetterOrder(groups),
     defaultGroupId,
     prompts: parsed.data.prompts,
   };
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index d51b004ada94124da190f0aefade841b19e17a64..91448fb41a6c8440aa78a637af2ec76493d79668 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -119,9 +119,24 @@ export function groupStamp(
 }
 
 /**
- * The groups newest first (by when they were opened, `groupOpened`; the later in the list on a
- * tie): the order the dialogs about groups offer them in (plan 8X-1B: the newest is where
- * newcomers usually go, and goes first, where Android picks it by itself).
+ * The groups in letter order, A to E: the order a party keeps them in, and so the order the
+ * post, the dialogs, `/shout group:` and the map list them (plan 8X-G, Matt 2026-10-22). Before,
+ * they were kept in the order they were opened, so a letter given again came after later ones
+ * (C D E A). A new group is put in its place (`withGroupAdded`), a stored party is read sorted.
+ */
+export function inLetterOrder<G extends Pick<PartyGroup, 'id'>>(groups: readonly G[]): G[] {
+  return [...groups].sort((a, b) => GROUP_IDS.indexOf(a.id) - GROUP_IDS.indexOf(b.id));
+}
+
+/** The groups with one more, in its place by letter (`inLetterOrder`). */
+export function withGroupAdded(groups: readonly PartyGroup[], group: PartyGroup): PartyGroup[] {
+  return inLetterOrder([...groups, group]);
+}
+
+/**
+ * The groups newest first (by when they were opened, `groupOpened`; the later by letter on a
+ * tie): which group takes over as the default one when the default goes (`pruneGroups`, a
+ * train's split). The dialogs list them in letter order since plan 8X-G.
  */
 export function newestFirst(party: Pick<PartyCore, 'createdAt' | 'groups'>): PartyGroup[] {
   return party.groups
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index b0cc4c0ec282a2134603cb1a102a019c2f794120..0b6c8781c82f2f9d32cd60c28d0aeed07608a574 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -1,6 +1,7 @@
 import {
   attendeeOf,
   groupOf,
+  newestFirst,
   groupStamp,
   stampedGroup,
   mayArrange,
@@ -1289,7 +1290,9 @@ export function splitOffGroup(
   );
   const groups = party.groups.filter((other) => other.id !== groupId);
   const defaultGroupId =
-    party.defaultGroupId === groupId ? (groups.at(-1)?.id ?? 'A') : party.defaultGroupId;
+    party.defaultGroupId === groupId
+      ? (newestFirst({ ...party, groups })[0]?.id ?? 'A')
+      : party.defaultGroupId;
   const { conductorId } = party.train;
   const entry: SplitOff = {
     ...link,
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 64505c800d1dd7962dcd44589912466ab7ce7390..4ae6a7adef9bf3e36edb7a3950ec149be92efa8e 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -128,7 +128,7 @@ describe('partyView', () => {
 
   it('gives a raid of several groups the buttons of one, and asks a newcomer which group', () => {
     // Plan 8X-1B: one Join, as the post has; the popup asks a member who is not signed up which
-    // group, by the post's dialog's rules and order (the newest group first).
+    // group, by the post's dialog's rules and order (in letter order, plan 8X-G).
     const groups = [
       { id: 'A' as const },
       { id: 'B' as const, label: 'park side', opened: egg.createdAt + 1 },
@@ -153,8 +153,8 @@ describe('partyView', () => {
     expect(attendance).not.toHaveProperty('pick');
     const newcomer = partyView(input([raid], { memberId: CAROL })).raids[0]?.attendance;
     expect(newcomer?.pick).toEqual([
-      { group: 'B', label: 'Group B: park side' },
       { group: 'A', label: 'Group A' },
+      { group: 'B', label: 'Group B: park side' },
     ]);
     // Where the groups have a size, any group with room first.
     const sized = partyView(input([raid], { memberId: CAROL, lobbySize: () => 4 })).raids[0];
@@ -165,6 +165,22 @@ describe('partyView', () => {
     ).not.toHaveProperty('pick');
   });
 
+  it('lists a letter given again by letter, in the counts and the question (review r0 A7)', () => {
+    // Stored before plan 8X-G: C and D opened, A and B gone, A opened again last.
+    const groups = [
+      { id: 'C' as const, opened: egg.createdAt + 1 },
+      { id: 'D' as const, opened: egg.createdAt + 2 },
+      { id: 'A' as const, opened: egg.createdAt + 3 },
+    ];
+    const raid = withAttendees(
+      { ...egg, groups, defaultGroupId: 'A' },
+      { [ALICE]: { group: 'C' }, [BOB]: { group: 'D' } },
+    );
+    const view = partyView(input([raid], { memberId: CAROL })).raids[0]?.attendance;
+    expect(view?.groups.map((group) => group.id)).toEqual(['A', 'C', 'D']);
+    expect(view?.pick?.map((choice) => choice.group)).toEqual(['A', 'C', 'D']);
+  });
+
   it('offers Done once the raid has hatched, and Leave to a member signed up', () => {
     const hatched = at('2026-10-13T14:40');
     const view = partyView(
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 44b86eb83199ffbec1d02a5f0f54adf3927dcb28..9977ad90771b81365c312467ecb6eaaf64cf9941 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -3,7 +3,7 @@ import { stopHandle, stopKey } from '../party/stops.js';
 import { maxEnded } from '../party/max.js';
 import {
   attendeeOf,
-  newestFirst,
+  inLetterOrder,
   isMax,
   isRaid,
   isTimed,
@@ -155,7 +155,7 @@ function mapStatus(attendee: Attendee): MapStatus | undefined {
 /**
  * The popup's question "which group?" (plan 8X-1B), asked as the post's dialog asks it: of a
  * member who is not signed up for a party of several groups, "Any group with room" first where
- * its groups have a size, then the groups newest first.
+ * its groups have a size, then the groups in letter order (plan 8X-G).
  */
 function groupPick(party: Party, input: PartyViewInput): MapGroupChoice[] | undefined {
   if (input.readOnly || party.groups.length < 2 || attendeeOf(party, input.memberId)) {
@@ -164,7 +164,7 @@ function groupPick(party: Party, input: PartyViewInput): MapGroupChoice[] | unde
   const sized = input.lobbySize?.(party) !== undefined;
   return [
     ...(sized ? [{ label: 'Any group with room' }] : []),
-    ...newestFirst(party).map((group) => ({
+    ...inLetterOrder(party.groups).map((group) => ({
       group: group.id,
       label: group.label ? `Group ${group.id}: ${group.label}` : `Group ${group.id}`,
     })),
@@ -178,7 +178,8 @@ function groupPick(party: Party, input: PartyViewInput): MapGroupChoice[] | unde
  * groups is asked which (`groupPick`). The Remote switch as the post has it (plan 8X-5).
  */
 function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): MapAttendance {
-  const groups: GroupCounts[] = party.groups.map((group) => ({
+  // By letter, as the post lists them (plan 8X-G; a party read from storage is sorted already).
+  const groups: GroupCounts[] = inLetterOrder(party.groups).map((group) => ({
     id: group.id,
     interested: 0,
     coming: 0,
diff --git a/src/render/group-dialogs.test.ts b/src/render/group-dialogs.test.ts
index 0c8b0ba1cf295458f55e2df3e494b3a048f669f3..b96c5f52a2474d75c17f4dbdc78f3d46cb1383ba 100644
--- a/src/render/group-dialogs.test.ts
+++ b/src/render/group-dialogs.test.ts
@@ -48,7 +48,7 @@ const shown = (party = two(), lobbySize?: number, action: 'maybe' | 'join' | 'he
   whichGroupDialog({ party, memberId: ALICE, lobbySize, zone: PARTY_ZONE, now: PARTY_NOW }, action);
 
 describe('whichGroupDialog', () => {
-  it('asks a newcomer which group, the newest first and picked to start with', () => {
+  it('asks a newcomer which group, in letter order, the default group marked (review r0 A2)', () => {
     const dialog = shown();
     checkModal(dialog);
     expect(dialog.title).toBe('Join this raid');
@@ -62,18 +62,45 @@ describe('whichGroupDialog', () => {
     expect(dialogTexts(dialog)).toEqual([]);
     expect(dialogChoices(dialog)).toEqual([
       {
+        value: `A:${PARTY_NOW.toString(36)}`,
+        label: 'Group A',
+        description: '1 trainer · meeting at 2:45 PM',
+        picked: false,
+      },
+      {
+        // Where Join, +1 and Remote place a newcomer: the default group (iPhone picks it; Android
+        // picks the first, A).
         value: groupChoice(two(), { id: 'B', opened: PARTY_NOW + 60_000 }),
         label: 'Group B: by the bridge',
         description: '2 trainers · no meeting time yet',
         picked: true,
       },
+    ]);
+  });
+
+  it('lists a letter given again in its place, not after the groups opened before it (plan 8X-G)', () => {
+    // C and D were opened, A and B went, and A was opened again last.
+    const reused = withAttendees(
       {
-        value: `A:${PARTY_NOW.toString(36)}`,
-        label: 'Group A',
-        description: '1 trainer · meeting at 2:45 PM',
-        picked: false,
+        ...testRaid(),
+        groups: [
+          { id: 'C', opened: PARTY_NOW + 1 },
+          { id: 'D', opened: PARTY_NOW + 2 },
+          { id: 'A', opened: PARTY_NOW + 3 },
+        ],
+        defaultGroupId: 'A',
       },
+      { [REPORTER]: { group: 'C' }, [BOB]: { group: 'D' }, [CAROL]: { group: 'A' } },
+    );
+    expect(dialogChoices(shown(reused, 4)).map(({ label }) => label)).toEqual([
+      'Any group with room',
+      'Group A',
+      'Group C',
+      'Group D',
     ]);
+    expect(
+      groupWays(reused, BOB).map((way) => (way.kind === 'new' ? 'new' : way.group.id)),
+    ).toEqual(['A', 'C']);
   });
 
   it('is titled by the button that was pressed', () => {
@@ -99,8 +126,8 @@ describe('whichGroupDialog', () => {
       'join',
     );
     expect(dialogChoices(dialog).map(({ label, description }) => [label, description])).toEqual([
-      ['Group B', 'Nobody yet'],
       ['Group A', '1 trainer'],
+      ['Group B', 'Nobody yet'],
     ]);
   });
 
@@ -114,8 +141,8 @@ describe('whichGroupDialog', () => {
       picked: true,
     });
     expect(groups.map(({ description, picked }) => [description, picked])).toEqual([
-      ['2/4 coming · no meeting time yet', false],
       ['0/4 coming · 1 interested · meeting at 2:45 PM', false],
+      ['2/4 coming · no meeting time yet', false],
     ]);
     // Every group full: a new one, while the party may have one more.
     const full = withAttendees(two(), {
@@ -163,7 +190,7 @@ describe('groupMenuDialog (Group…)', () => {
   const menu = (party: RaidParty, memberId = BOB) =>
     groupMenuDialog(view(party, memberId), groupWays(party, memberId));
 
-  it('offers a member the other groups, newest first, then a new group with an optional label', () => {
+  it('offers a member the other groups in letter order, then a new group with an optional label', () => {
     const three = withAttendees(
       {
         ...two(),
@@ -182,8 +209,8 @@ describe('groupMenuDialog (Group…)', () => {
     expect(
       dialogChoices(dialog).map(({ label, description, picked }) => [label, description, picked]),
     ).toEqual([
-      ['Group C', '1 trainer · no meeting time yet', true],
-      ['Group A', '1 trainer · meeting at 2:45 PM', false],
+      ['Group A', '1 trainer · meeting at 2:45 PM', true],
+      ['Group C', '1 trainer · no meeting time yet', false],
       ['A new group (D)', 'Just you, until others join', false],
     ]);
     expect(dialogChoices(dialog).at(-1)?.value).toBe(NEW_GROUP);
@@ -203,8 +230,8 @@ describe('groupMenuDialog (Group…)', () => {
     expect(decodeCustomId(dialog.custom_id)).toMatchObject({ args: [openToken(PARTY_NOW)] });
     expect(dialogTexts(dialog)).toEqual(['You join as coming, in the group you pick.']);
     expect(dialogChoices(dialog).map(({ label }) => label)).toEqual([
-      'Group B: by the bridge',
       'Group A',
+      'Group B: by the bridge',
       'A new group (C)',
     ]);
   });
@@ -233,10 +260,10 @@ describe('groupMenuDialog (Group…)', () => {
     );
     const moves = menu(five);
     expect(dialogChoices(moves).map(({ value }) => value.split(':')[0])).toEqual([
-      'E',
-      'D',
-      'C',
       'B',
+      'C',
+      'D',
+      'E',
     ]);
     expect(
       moves.components.some(
diff --git a/src/render/group-dialogs.ts b/src/render/group-dialogs.ts
index 448897345d413e8b72b33eb9bfe822c08d2711e1..1fd14264b1c195240a0713bcdec9e5eefc6412f4 100644
--- a/src/render/group-dialogs.ts
+++ b/src/render/group-dialogs.ts
@@ -10,7 +10,7 @@ import {
 import {
   attendeeOf,
   groupOf,
-  newestFirst,
+  inLetterOrder,
   groupStamp,
   headCount,
   isGroupId,
@@ -143,9 +143,10 @@ const TITLES: Readonly<Record<JoinAction, (word: string) => string>> = {
 /**
  * The dialog that asks a member who is not signed up which group, for a press of Interested,
  * Join or Here on a post of several groups (decision 2): one required radio choice, "Which
- * group?", of "Any group with room" first where the groups have a size, then every group newest
- * first, the first picked to start with (decision 9: Android picks the first itself). Each group
- * by its label and a short line (`groupDescription`). Its custom id
+ * group?", of "Any group with room" first where the groups have a size, then every group in
+ * letter order (plan 8X-G), "Any group with room" marked to start with where there is one, else
+ * the default group, where Join, +1 and Remote put a newcomer (review r0 A2; decision 9: Android
+ * picks the first itself, group A, an iPhone what is marked). Each group by its label and a short line (`groupDescription`). Its custom id
  * `party:<id>:joinform:<action>:<token>` keeps which button it was, and a per-open token
  * (`openToken`, plan 8X-F: Discord's client starts with the value marked); a choice is
  * `ANY_GROUP` or `groupChoice`.
@@ -155,9 +156,10 @@ export function whichGroupDialog(
   action: JoinAction,
 ): APIModalInteractionResponseCallbackData {
   const { party, lobbySize } = view;
+  const defaultGroup = party.groups.find((group) => group.id === party.defaultGroupId);
   const options: DialogOption[] = [
     ...(lobbySize === undefined ? [] : [anyGroupOption(view, lobbySize)]),
-    ...newestFirst(party).map((group) => ({
+    ...inLetterOrder(party.groups).map((group) => ({
       value: groupChoice(party, group),
       label: groupLabel(group),
       description: groupDescription(view, group),
@@ -175,7 +177,12 @@ export function whichGroupDialog(
       id: GROUP_INPUT,
       label: 'Which group?',
       options,
-      ...(options[0] === undefined ? {} : { picked: options[0].value }),
+      // "Any group with room" where the groups have a size; else the default group, where Join,
+      // +1 and Remote put a newcomer (review r0 A2). Android picks the first itself (group A).
+      picked:
+        lobbySize !== undefined || defaultGroup === undefined
+          ? options[0]?.value
+          : groupChoice(party, defaultGroup),
     },
   });
 }
@@ -200,7 +207,7 @@ export type GroupWay = { kind: 'move'; group: PartyGroup } | { kind: 'new'; id:
 
 /**
  * What Group… offers this member (decision 3): every other group (all of them for a member who
- * is not signed up), newest first, then a new group while the party may have one more
+ * is not signed up), in letter order (plan 8X-G), then a new group while the party may have one more
  * (`nextGroupId`) and it would change something (not for a member alone in a plain group of
  * their own: `newGroupChangesNothing`). Nothing where there is nothing to choose.
  */
@@ -208,7 +215,7 @@ export function groupWays(party: Party, memberId: string): GroupWay[] {
   const own = attendeeOf(party, memberId)?.group;
   const next = newGroupChangesNothing(party, memberId) ? undefined : nextGroupId(party);
   return [
-    ...newestFirst(party)
+    ...inLetterOrder(party.groups)
       .filter((group) => group.id !== own)
       .map((group): GroupWay => ({ kind: 'move', group })),
     ...(next === undefined ? [] : [{ kind: 'new' as const, id: next }]),
````

### Task 5: 8X-G 5: dialogs with several choices, and Move… for a train

Prototype commit: `87c3ccce3ec42381ba510d9c6614a3f1940324d7`

- dialog() takes several choices (choices: radio groups and menus, each under its
  label, a menu's options with their emoji); selectedOf reads a menu's choice at Submit.
- Move… (moveDialog, src/render/train-dialogs.ts): for who may move the train, where
  it is in words without links, and one radio choice "Move the train" of the moves that
  can be made from here: Next picked (what it does at the last stop: finish the route,
  round to the first, turn back), Previous (of a finished route, back to stop N),
  Skip X, go to Y; a move that cannot be made is left out, long names are cut to fit
  and given in the description. With one move left there is no choice: the text says
  what Submit does and the custom id carries the move. The id carries where the train
  was and each choice where it leads, so two Submits of Next move it once, and a dialog
  opened before somebody moved it says "The train has moved on since you opened this:"
  with where it is now. Submit answers as /next does.
- The post's party:<id>:move opens Move… (the old "Manage train…" too); a train
  without a route still gets the panel until Manage… replaces it.

**Files:**

```
 src/commands/trains/move-dialog.test.ts | 172 ++++++++++++++++++++++++++++++++++
 src/commands/trains/move.test.ts        |  25 ++---
 src/commands/trains/move.ts             |  94 ++++++++++++++++++-
 src/components/party.ts                 |  12 ++-
 src/discord/dialog.test.ts              |  62 ++++++++++++
 src/discord/dialog.ts                   |  94 +++++++++++++------
 src/render/party-controls.ts            |   1 +
 src/render/train-dialogs.test.ts        | 158 +++++++++++++++++++++++++++++++
 src/render/train-dialogs.ts             | 264 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 9 files changed, 834 insertions(+), 48 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/trains/move-dialog.test.ts src/commands/trains/move.test.ts src/discord/dialog.test.ts src/render/train-dialogs.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 87c3ccce3ec42381ba510d9c6614a3f1940324d7 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-G 5: dialogs with several choices, and Move… for a train`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/trains/move-dialog.test.ts b/src/commands/trains/move-dialog.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..083a934af7f5da0509c153df111d97a9b5df441d
--- /dev/null
+++ b/src/commands/trains/move-dialog.test.ts
@@ -0,0 +1,172 @@
+import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { dialogChoices, dialogOf, shownDialog } from '../../../test/support/dialogs.js';
+import {
+  fakeButton,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { testGyms } from '../../../test/support/gyms.js';
+import { ALICE, BOB, CAROL, PARTY_NOW } from '../../../test/support/parties.js';
+import { createdTrain } from '../../../test/support/party-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { partyButtons } from '../../components/party.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import { MOVE_INPUT } from '../../render/train-dialogs.js';
+
+const maps = (id: number): string => {
+  const gym = testGyms().find((found) => found.id === id);
+  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
+};
+const STACKS = `[The Stacks](<${maps(1)}>)`;
+const MURAL = `[Harbor Lighthouse Mural](<${maps(7)}>)`;
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+/** A train on a route of four gyms (4, 1, 7, 2), with Alice and Bob coming. */
+async function setup() {
+  const made = await createdTrain({ route: [4, 1, 7, 2] });
+  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+  await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    trains: made.trains,
+    parties: made.store,
+    regions: made.regions,
+  });
+  const router = new InteractionRouter(ctx, [], [partyButtons]);
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const who = (userId: string) => ({
+    userId,
+    displayName: userId === ALICE ? 'Alice' : 'Bob',
+    channelId: made.postId,
+  });
+  /** A press of Move… on the post. */
+  const open = (userId = ALICE) =>
+    handle(fakeButton({ customId: `party:${made.party.id}:move`, ...who(userId) }));
+  /** The Submit of a Move… dialog, with this choice picked where it has one. */
+  const submit = (
+    dialog: APIModalInteractionResponseCallbackData,
+    picked?: string,
+    userId = ALICE,
+  ) =>
+    handle(
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        ...(picked === undefined ? {} : { picked: { [MOVE_INPUT]: picked } }),
+        ...who(userId),
+      }),
+    );
+  const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
+  return { ...made, ctx, handle, open, submit, answerOf };
+}
+
+/** The value of a dialog's choice whose label begins so. */
+function choiceOf(dialog: APIModalInteractionResponseCallbackData, label: string): string {
+  const found = dialogChoices(dialog).find((choice) => choice.label.startsWith(label));
+  if (!found) throw new Error(`no choice ${label}`);
+  return found.value;
+}
+
+describe('Move… of a train’s post (plan 8X-G)', () => {
+  it('opens the dialog, and its Submit moves the train and says where it is privately', async () => {
+    const made = await setup();
+    const pressed = await made.open();
+    const dialog = shownDialog(pressed);
+    expect(dialog.title).toBe('Move the train');
+    const submitted = await made.submit(dialog, choiceOf(dialog, 'Next'));
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(made.current().train.stop).toBe(1);
+    expect(made.answerOf(submitted)).toBe(
+      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
+    );
+    // Closing the dialog moves nothing: nothing happens without a Submit.
+    await made.open();
+    expect(made.current().train.stop).toBe(1);
+  });
+
+  it('skips and goes back as picked', async () => {
+    const made = await setup();
+    const first = shownDialog(await made.open());
+    await made.submit(first, choiceOf(first, 'Skip'));
+    expect(made.current().train.stop).toBe(2);
+    const second = shownDialog(await made.open());
+    const back = await made.submit(second, choiceOf(second, 'Previous'));
+    expect(made.current().train.stop).toBe(1);
+    expect(made.answerOf(back)).toMatch(/^The train is at stop 2 of 4/);
+  });
+
+  it('moves the train once when two members submit Next from dialogs opened at the same stop', async () => {
+    const made = await setup();
+    const alice = shownDialog(await made.open());
+    const bob = shownDialog(await made.open(BOB));
+    const first = await made.submit(alice, choiceOf(alice, 'Next'));
+    const second = await made.submit(bob, choiceOf(bob, 'Next'), BOB);
+    expect(made.current().train.stop).toBe(1);
+    expect(made.answerOf(first)).toMatch(/^The train is at stop 2 of 4/);
+    expect(made.answerOf(second)).toBe(
+      'The train has moved on since you opened this: ' +
+        `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}.`,
+    );
+  });
+
+  it('refuses who may not move the train before it opens, and again at Submit', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.open(BOB));
+    await made.trains.setConductor(made.party.id, { id: ALICE, name: 'Alice' });
+    const refused = await made.open(BOB);
+    expect(dialogOf(refused)).toBeUndefined();
+    expect(sent(refused.reply)).toEqual({
+      content: expect.stringMatching(/conductor/) as unknown,
+      flags: MessageFlags.Ephemeral,
+    });
+    const late = await made.submit(dialog, choiceOf(dialog, 'Next'), BOB);
+    expect(made.current().train.stop).toBe(0);
+    expect(made.answerOf(late)).toMatch(/conductor/);
+  });
+
+  it('takes a mistaken Finish back from a finished route, the move in the dialog’s id', async () => {
+    const made = await setup();
+    await made.trains.move(made.party.id, { id: ALICE }, 'next', false);
+    await made.trains.move(made.party.id, { id: ALICE }, 'finish', false);
+    const dialog = shownDialog(await made.open());
+    expect(dialogChoices(dialog)).toEqual([]);
+    const submitted = await made.submit(dialog);
+    expect(made.current().train.stop).toBe(1);
+    expect(made.answerOf(submitted)).toMatch(/^The train is at stop 2 of 4/);
+  });
+
+  it('answers a Submit without its choice, or of a train that is gone, without moving anything', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.open());
+    const forged = await made.handle(
+      fakeModal({ customId: dialog.custom_id, userId: ALICE, channelId: made.postId }),
+    );
+    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
+    expect(made.current().train.stop).toBe(0);
+    await made.service.end(made.party.id);
+    const over = await made.submit(dialog, choiceOf(dialog, 'Next'));
+    expect(made.answerOf(over)).toBe('This train is over.');
+  });
+
+  it('is not offered on a train that is over', async () => {
+    const made = await setup();
+    await made.service.end(made.party.id);
+    const pressed = await made.open(CAROL);
+    expect(dialogOf(pressed)).toBeUndefined();
+    expect(sent(pressed.reply).content).toBe('This train is over.');
+  });
+});
diff --git a/src/commands/trains/move.test.ts b/src/commands/trains/move.test.ts
index c3d86ecf5ab47e330ee443c885882974fa9b1a2f..f1dd82b608adb56924e7ed814db4825d24eed672 100644
--- a/src/commands/trains/move.test.ts
+++ b/src/commands/trains/move.test.ts
@@ -43,6 +43,7 @@ import {
   textOf,
 } from '../../../test/support/messages.js';
 import { expectV2Sendable } from '../../../test/support/post-limits.js';
+import { dialogOf } from '../../../test/support/dialogs.js';
 
 const all: CommandModule[] = [next, previous, skip, finish, conductor];
 
@@ -417,14 +418,11 @@ describe('/conductor', () => {
 });
 
 describe('the button "Manage train…" and its panel', () => {
-  it('opens the panel privately: where the train is, what comes next, the four moves and the mode', async () => {
+  it('is drawn with where the train is, what comes next, the four moves and the mode', async () => {
     const made = await setup();
-    const opened = await made.click('move');
-    expect(opened.reply).toHaveBeenCalledWith({
-      components: made.panel().components,
-      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
-    });
-    expect(shown(opened.reply)).toBe(
+    // The button opens Move… since plan 8X-G (`move-dialog.test.ts`).
+    expect(dialogOf(await made.click('move'))?.title).toBe('Move the train');
+    expect(firstText(made.panel())).toBe(
       panelText(`At stop 1 of 4: ${BRIDGE_BARE}`, `Next is ${STACKS_BARE}`),
     );
     // Every button says where the train was when the panel was drawn (at gym 4), and Next and
@@ -455,12 +453,10 @@ describe('the button "Manage train…" and its panel', () => {
     expect(sent((await made.click('move')).reply).content).toBe(
       'This train has a conductor: only they and the moderators can move it.',
     );
-    // The conductor and a moderator get the panel.
-    expect(shown((await made.click('move', { userId: BOB })).reply)).toMatch(
-      /^### Manage the train/,
-    );
+    // The conductor and a moderator get Move… (plan 8X-G).
+    expect(dialogOf(await made.click('move', { userId: BOB }))).toBeDefined();
     const moderator = await made.click('move', { userId: CAROL, roleNames: ['Moderator'] });
-    expect(shown(moderator.reply)).toMatch(/^### Manage the train/);
+    expect(dialogOf(moderator)).toBeDefined();
   });
 
   it('gives a train without a route the panel of what applies: no moves, the kind (plan 8X-4)', async () => {
@@ -499,7 +495,7 @@ describe('the button "Manage train…" and its panel', () => {
   it('works on a copy of the message in another channel: the train is the one the button names', async () => {
     const made = await setup();
     const opened = await made.click('move', { channelId: '600000000000000099' });
-    expect(shown(opened.reply)).toMatch(/\nAt stop 1 of 4/);
+    expect(dialogOf(opened)?.title).toBe('Move the train');
     const pressed = await made.press('next', { channelId: '600000000000000099' });
     expect(shown(pressed.update)).toMatch(/\nAt stop 2 of 4/);
   });
@@ -707,8 +703,7 @@ describe('the button "Manage train…" and its panel', () => {
   it('does not move the train to another stop than the button promised', async () => {
     const made = await setup();
     // Alice's panel says "Next is The Stacks"; Bob takes The Stacks (gym 1) off the route.
-    const opened = await made.click('move');
-    expect(shown(opened.reply)).toContain(`Next is ${STACKS_BARE}`);
+    expect(firstText(made.panel())).toContain(`Next is ${STACKS_BARE}`);
     await made.trains.removeStop(made.party.id, { id: BOB }, 2);
     const pressed = await made.click('next:4:1');
     expect(made.current().train.stop).toBe(0);
diff --git a/src/commands/trains/move.ts b/src/commands/trains/move.ts
index 6588535041c3782e46d204c1155a868c21cea0eb..5a6c95777bcbca8e2fccc980ae008541993aa95a 100644
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -4,9 +4,11 @@ import {
   type ButtonInteraction,
   type ChatInputCommandInteraction,
   type MessageComponentInteraction,
+  type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
+import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { isStaff, requireTrain } from '../../discord/guards.js';
 import { v2Answer } from '../../discord/late-reply.js';
@@ -14,7 +16,13 @@ import type { V2Message } from '../../discord/party-gateway.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { isTrain, isTrainAtEnd, isTrainKind } from '../../domain/party/party.js';
 import { mayNotMove, type TrainMove } from '../../domain/party/train.js';
-import { panelNote, trainPanel } from '../../render/train-panel.js';
+import {
+  isDialogMove,
+  MOVE_INPUT,
+  moveDialog,
+  type DialogMove,
+} from '../../render/train-dialogs.js';
+import { panelNote, trainPanel, whereText } from '../../render/train-panel.js';
 import type { TrainChangeOutcome } from '../../services/train-service.js';
 import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
@@ -138,6 +146,90 @@ export async function openTrainPanel(
   });
 }
 
+/**
+ * Move… of a train's post (plan 8X-G; `party:<id>:move`, also the button "Manage train…" of a
+ * post not drawn anew since): for who may move the train (`mayNotMove`, refused privately before
+ * it opens), the dialog of the moves that can be made from where it is (`moveDialog`). A train
+ * without a route has nothing to move along: it gets what applies to it.
+ */
+export async function openMove(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  partyId: string,
+): Promise<void> {
+  const party = ctx.parties.get(partyId);
+  if (!party) throw new UserError(partyOver(A_TRAIN));
+  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
+  const problem = mayNotMove(party, interaction.user.id, isStaff(interaction, ctx));
+  if (problem) throw new UserError(refusal(ctx, problem));
+  if (party.train.route.length === 0) return openTrainPanel(interaction, ctx, partyId);
+  await interaction.showModal(moveDialog({ ...trainPlaces(ctx, party), now: Date.now() }));
+}
+
+/** What a Submit of Move… is told when the train moved on, or its route changed, meanwhile. */
+const MOVED_ON = 'The train has moved on since you opened this: ';
+
+/**
+ * The move a Submit of Move… asks for and where it leads: the dialog's id carries them where it
+ * had one move left, else the radio choice does (`<move>:<target>`). Undefined for anything
+ * else (a dialog of another shape, a forged one).
+ */
+function askedMove(
+  interaction: ModalSubmitInteraction,
+  args: readonly string[],
+): { from: string; move: DialogMove; target: string } | undefined {
+  const [from, fixed, fixedTarget] = withoutOpenToken(args);
+  if (from === undefined) return undefined;
+  if (fixed !== undefined) {
+    return isDialogMove(fixed) && fixedTarget !== undefined
+      ? { from, move: fixed, target: fixedTarget }
+      : undefined;
+  }
+  if (!interaction.fields.fields.has(MOVE_INPUT)) return undefined;
+  const [move, target] = (interaction.fields.getRadioGroup(MOVE_INPUT) ?? '').split(':');
+  return isDialogMove(move) && target !== undefined ? { from, move, target } : undefined;
+}
+
+/**
+ * Submit of Move… (`party:<id>:moveform:…`): acknowledged privately, then the move made as
+ * `/next` and the others make it (`moveTrainAs`, with where the train was when the dialog opened
+ * and where the move led then), answered in their words (`whereText`). The store decides: a
+ * dialog opened before somebody else moved the train, or edited its route, moves nothing and
+ * says where the train is now, so two members who submit Next for the same stop move it once.
+ */
+export async function submitMove(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  partyId: string,
+  args: readonly string[],
+): Promise<void> {
+  const asked = askedMove(interaction, args);
+  if (!asked) throw new UserError(STALE_COMPONENT);
+  await deferSubmit(interaction);
+  const say = (content: string) => interaction.editReply({ content });
+  const party = ctx.parties.get(partyId);
+  if (!party) return void (await say(partyOver(A_TRAIN)));
+  if (!isTrain(party)) return void (await say(STALE_COMPONENT));
+  const answer = await moveTrainAs(
+    ctx,
+    party,
+    actingMember(interaction),
+    asked.move,
+    isStaff(interaction, ctx),
+    asked.from,
+    asked.target,
+  );
+  if (answer.kind === 'refused' && answer.reason !== undefined && STALE_MOVES.has(answer.reason)) {
+    const now = ctx.parties.get(partyId);
+    if (now && isTrain(now))
+      return void (await say(`${MOVED_ON}${whereText(trainPlaces(ctx, now))}`));
+  }
+  await say(answer.text);
+}
+
+/** The refusals of a move that the train's moving on, or its route's change, explain. */
+const STALE_MOVES: ReadonlySet<string> = new Set(['train-moved-on', 'route-changed']);
+
 /** What an old panel says once a press has put the new one below it. */
 export const OLD_PANEL = 'This panel was replaced by the one below.';
 
diff --git a/src/components/party.ts b/src/components/party.ts
index 211779ee9ebd5485a93b0953ff3a263cd94331fb..deac03cc6d13492b4c39c62ad3cffee5da1c82c1 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -12,11 +12,12 @@ import { changeTime, timesAlready } from '../commands/raids/change.js';
 import { showScreenshot } from '../commands/screenshots/feedback.js';
 import { submitPartyReport } from '../commands/parties/report.js';
 import {
-  openTrainPanel,
+  openMove,
   pressAtEnd,
   pressKind,
   pressReverse,
   pressTrainPanel,
+  submitMove,
 } from '../commands/trains/move.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import { showWholeRoute } from '../commands/trains/route.js';
@@ -30,6 +31,7 @@ import { STALE_COMPONENT } from '../discord/router.js';
 import { isGroupId, isRaid } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
+import { MOVE_FORM } from '../render/train-dialogs.js';
 import { SPLIT_FORM } from '../render/train-split.js';
 import { GROUP_MENU_FORM, WHICH_GROUP_FORM } from '../render/group-dialogs.js';
 import {
@@ -137,8 +139,11 @@ export const partyButtons: ComponentHandler = {
         // Only the form of `/delete` has this action.
         throw new UserError(STALE_COMPONENT);
       case 'move':
-        // The button of a train's post that opens the panel to move it.
-        return openTrainPanel(interaction, ctx, partyId);
+        // Move… of a train's post (plan 8X-G), and "Manage train…" of a post drawn before it.
+        return openMove(interaction, ctx, partyId);
+      case 'moveform':
+        // Only Move…'s dialog has this action.
+        throw new UserError(STALE_COMPONENT);
       case 'next':
       case 'previous':
       case 'skip':
@@ -200,6 +205,7 @@ export const partyButtons: ComponentHandler = {
   async modal(interaction, id, ctx) {
     if (id.action === 'delete') return submitPartyReport(interaction, ctx, id.id);
     if (id.action === SPLIT_FORM) return submitSplit(interaction, ctx, id.id, id.args);
+    if (id.action === MOVE_FORM) return submitMove(interaction, ctx, id.id, id.args);
     if (id.action === GROUP_MENU_FORM) return submitGroupMenu(interaction, ctx, id.id, id.args);
     if (id.action === WHICH_GROUP_FORM) {
       return submitWhichGroup(interaction, ctx, id.id, id.args);
diff --git a/src/discord/dialog.test.ts b/src/discord/dialog.test.ts
index 66ea69c10ff10b86004136ec0c716afb36f87d29..ffeb3e9112ca5a580bb09278a57c49894d135f45 100644
--- a/src/discord/dialog.test.ts
+++ b/src/discord/dialog.test.ts
@@ -11,6 +11,7 @@ import {
   openToken,
   pickedOf,
   readInTime,
+  selectedOf,
   withoutOpenToken,
 } from './dialog.js';
 import { UserError } from './errors.js';
@@ -145,6 +146,56 @@ describe('dialog', () => {
     expect(() => checkModal(twice)).toThrow(/2 options ticked by default, at most 1/);
   });
 
+  it('asks several choices, each under its label, in order (plan 8X-G: Manage…)', () => {
+    const shown = dialog({
+      customId: 'x:1:go',
+      title: 'Manage the train',
+      text: 'At stop 2 of 4.',
+      choices: [
+        {
+          id: 'route',
+          label: 'The route',
+          options: [
+            { value: 'keep', label: 'Keep it as it is' },
+            { value: 'reverse', label: 'Reverse it' },
+          ],
+          picked: 'keep',
+        },
+        {
+          id: 'atend',
+          label: 'At the end of the route',
+          menu: true,
+          options: [
+            { value: 'finish', label: 'Finish', emoji: '🏁' },
+            { value: 'loop', label: 'Loop', emoji: '🔁' },
+          ],
+          picked: 'loop',
+        },
+      ],
+    });
+    checkModal(shown);
+    const labels = shown.components.flatMap((component) =>
+      component.type === ComponentType.Label ? [[component.label, component.component.type]] : [],
+    );
+    expect(labels).toEqual([
+      ['The route', ComponentType.RadioGroup],
+      ['At the end of the route', ComponentType.StringSelect],
+    ]);
+    expect(dialogChoices(shown).map(({ value, picked }) => [value, picked])).toEqual([
+      ['keep', true],
+      ['reverse', false],
+      ['finish', false],
+      ['loop', true],
+    ]);
+    // A menu's option keeps its emoji.
+    const menu = shown.components.find(
+      (component) =>
+        component.type === ComponentType.Label &&
+        component.component.type === ComponentType.StringSelect,
+    );
+    expect(menu).toMatchObject({ component: { options: [{ emoji: { name: '🏁' } }, {}] } });
+  });
+
   it('cuts a title and a text to what Discord takes', () => {
     const shown = dialog({ customId: 'x:1:go', title: 'T'.repeat(60), text: 'w'.repeat(5_000) });
     checkModal(shown);
@@ -310,3 +361,14 @@ describe('pickedOf', () => {
     expect(pickedOf(older as never, 'removal', ['archive', 'delete'])).toBeUndefined();
   });
 });
+
+describe('selectedOf', () => {
+  it('gives the option a menu chose, and nothing for none of its values or no menu', () => {
+    const chosen = fakeModal({ customId: 'x:1:go', selected: { atend: ['loop'] } });
+    expect(selectedOf(chosen as never, 'atend', ['finish', 'loop'])).toBe('loop');
+    const other = fakeModal({ customId: 'x:1:go', selected: { atend: ['spin'] } });
+    expect(selectedOf(other as never, 'atend', ['finish', 'loop'])).toBeUndefined();
+    const older = fakeModal({ customId: 'x:1:go' });
+    expect(selectedOf(older as never, 'atend', ['finish', 'loop'])).toBeUndefined();
+  });
+});
diff --git a/src/discord/dialog.ts b/src/discord/dialog.ts
index a989984b442ede79f982b6754b7290197ba804a2..c6863ac9013e4edebbf1bedc2e0f18925cb4a4f0 100644
--- a/src/discord/dialog.ts
+++ b/src/discord/dialog.ts
@@ -35,6 +35,8 @@ export interface DialogOption {
   value: string;
   label: string;
   description?: string;
+  /** A character shown before the label of a menu's option (a radio group shows none). */
+  emoji?: string;
 }
 
 /** A choice of a dialog: a required radio group, or a menu where it has more than ten. */
@@ -80,48 +82,68 @@ export interface DialogContent {
    * read at Submit with `fields.getRadioGroup(id, true)`.
    */
   choice?: DialogChoice;
+  /**
+   * Several choices, each under its label after `choice` (plan 8X-G: Manage…, the route as a
+   * radio group and two menus): Discord takes five components in a dialog, the text included.
+   */
+  choices?: readonly DialogChoice[];
   /** A line of text under the choice, optional (`fields.getTextInputValue(id)`, '' when empty). */
   field?: DialogField;
 }
 
-/** The options of a choice, the one picked to start with marked as Discord's `default`. */
-function choiceOptions(choice: DialogChoice): (DialogOption & { default?: true })[] {
-  return choice.options.map((option) =>
-    option.value === choice.picked ? { ...option, default: true } : { ...option },
-  );
+/** An option as Discord takes it, the one picked to start with marked as its `default`. */
+interface ShownOption {
+  value: string;
+  label: string;
+  description?: string;
+  emoji?: { name: string };
+  default?: true;
+}
+
+/**
+ * The options of a choice, the one picked to start with marked as Discord's `default`; a
+ * menu's with their emoji.
+ */
+function choiceOptions(choice: DialogChoice): ShownOption[] {
+  return choice.options.map(({ emoji, ...option }) => ({
+    ...option,
+    ...(choice.menu && emoji !== undefined ? { emoji: { name: emoji } } : {}),
+    ...(option.value === choice.picked ? { default: true as const } : {}),
+  }));
+}
+
+/** A choice as a label holding its radio group or menu. */
+function choiceComponent(choice: DialogChoice) {
+  return {
+    type: ComponentType.Label as const,
+    label: choice.label,
+    component: choice.menu
+      ? {
+          type: ComponentType.StringSelect as const,
+          custom_id: choice.id,
+          required: true,
+          min_values: 1,
+          max_values: 1,
+          options: choiceOptions(choice),
+        }
+      : {
+          type: ComponentType.RadioGroup as const,
+          custom_id: choice.id,
+          required: true,
+          options: choiceOptions(choice),
+        },
+  };
 }
 
 /** The dialog, as `showModal` takes it. */
 export function dialog(content: DialogContent): APIModalInteractionResponseCallbackData {
-  const { choice, field, text } = content;
+  const { choice, choices = [], field, text } = content;
   return {
     custom_id: content.customId,
     title: truncate(content.title, TITLE_ROOM),
     components: [
       ...(text === undefined ? [] : [textDisplay(truncate(text, TEXT_ROOM))]),
-      ...(choice === undefined
-        ? []
-        : [
-            {
-              type: ComponentType.Label as const,
-              label: choice.label,
-              component: choice.menu
-                ? {
-                    type: ComponentType.StringSelect as const,
-                    custom_id: choice.id,
-                    required: true,
-                    min_values: 1,
-                    max_values: 1,
-                    options: choiceOptions(choice),
-                  }
-                : {
-                    type: ComponentType.RadioGroup as const,
-                    custom_id: choice.id,
-                    required: true,
-                    options: choiceOptions(choice),
-                  },
-            },
-          ]),
+      ...[...(choice === undefined ? [] : [choice]), ...choices].map(choiceComponent),
       ...(field === undefined
         ? []
         : [
@@ -249,3 +271,17 @@ export function pickedOf<V extends string>(
   const picked = interaction.fields.getRadioGroup(id);
   return values.find((value) => value === picked);
 }
+
+/**
+ * The option a Submit chose in the menu `id` (a choice with `menu: true`), when it is one of
+ * `values`; undefined for anything else, as `pickedOf` for a radio group.
+ */
+export function selectedOf<V extends string>(
+  interaction: ModalSubmitInteraction,
+  id: string,
+  values: readonly V[],
+): V | undefined {
+  if (!interaction.fields.fields.has(id)) return undefined;
+  const [chosen] = interaction.fields.getStringSelectValues(id);
+  return values.find((value) => value === chosen);
+}
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index caa8e9b466208f47b773b74a1e2f8e5da0f20d1a..ac7fe89243242f98542015be3cd59f88c951a380 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -63,6 +63,7 @@ export const PARTY_ACTIONS = [
   'joinform',
   'regroupform',
   'meet',
+  'moveform',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
diff --git a/src/render/train-dialogs.test.ts b/src/render/train-dialogs.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..446527e4e7d937764690c77d8ed675d172b014f9
--- /dev/null
+++ b/src/render/train-dialogs.test.ts
@@ -0,0 +1,158 @@
+import { describe, expect, it } from 'vitest';
+import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
+import { checkModal } from '../../test/support/fake-interactions.js';
+import { testGym, testGyms } from '../../test/support/gyms.js';
+import { PARTY_NOW, stops, testTrain } from '../../test/support/parties.js';
+import { decodeCustomId } from '../discord/custom-id.js';
+import { openToken } from '../discord/dialog.js';
+import type { TrainAtEnd, TrainParty } from '../domain/party/party.js';
+import { gymStop } from '../domain/party/stops.js';
+import { placeOf, targetOf } from '../domain/party/train.js';
+import type { PostGym } from './raid-post.js';
+import { MOVE_FORM, MOVE_INPUT, moveDialog } from './train-dialogs.js';
+import { stopsFrom } from './train-stops.js';
+
+const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
+const LONG =
+  'A gym whose name goes on and on, past what a choice of a dialog can hold in its label, ' +
+  'and further still';
+gyms.set(90, testGym(90, LONG, 40.05, -80.05));
+gyms.set(91, testGym(91, `${LONG}, again`, 40.05, -80.05));
+
+/** The test train on this route of gyms, at the stop with this index. */
+function onRoute(
+  route: readonly number[],
+  stop = 0,
+  atEnd: TrainAtEnd = 'finish',
+  finishedFrom?: number,
+): TrainParty {
+  const train = testTrain();
+  return {
+    ...train,
+    train: {
+      ...train.train,
+      route: stops(...route),
+      stop,
+      atEnd,
+      ...(finishedFrom === undefined ? {} : { finishedFrom: gymStop(finishedFrom) }),
+    },
+  };
+}
+
+const shown = (party: TrainParty) =>
+  moveDialog({ party, stop: stopsFrom({ get: (id) => gyms.get(id) }), now: PARTY_NOW });
+
+/** The choices as [value, label, picked]. */
+const choices = (party: TrainParty) =>
+  dialogChoices(shown(party)).map(({ value, label, picked }) => [value, label, picked]);
+
+/** The longest ids there are: a party's UUID, gyms of ten digits, a token of 2030 (review r0 B4). */
+const LONGEST = { gyms: [4294967295, 4294967294, 4294967293], now: Date.UTC(2030, 11, 31) };
+
+describe('the ids of the dialogs of a train (review r0 B4)', () => {
+  it('keep Move…’s custom id and choices within 100 characters, mid-route and finished', () => {
+    const view = (party: TrainParty) => ({
+      party,
+      stop: stopsFrom({ get: (id: number) => gyms.get(id) }),
+      now: LONGEST.now,
+    });
+    const mid = onRoute(LONGEST.gyms, 1, 'loop');
+    const finished = onRoute(LONGEST.gyms, 3, 'finish', LONGEST.gyms[1]);
+    for (const party of [mid, finished, onRoute(LONGEST.gyms.slice(0, 2), 0)]) {
+      expect(party.id.length).toBe(36);
+      const dialog = moveDialog(view(party));
+      checkModal(dialog);
+      expect(dialog.custom_id.length).toBeLessThanOrEqual(100);
+      for (const choice of dialogChoices(dialog))
+        expect(choice.value.length).toBeLessThanOrEqual(100);
+    }
+  });
+});
+
+describe('moveDialog (plan 8X-G: Move…)', () => {
+  it('asks where to move the train, Next picked, each choice carrying where it leads', () => {
+    // 4 Veterans Memorial Bridge, 1 The Stacks, 7 Harbor Lighthouse Mural, 2 Old Stone Fountain.
+    const train = onRoute([4, 1, 7, 2], 1);
+    const dialog = shown(train);
+    checkModal(dialog);
+    expect(dialog.title).toBe('Move the train');
+    expect(decodeCustomId(dialog.custom_id)).toEqual({
+      kind: 'party',
+      id: train.id,
+      action: MOVE_FORM,
+      args: [placeOf(train), openToken(PARTY_NOW)],
+    });
+    // Where it is, without links (a dialog's links are not known to be clickable).
+    expect(dialogTexts(dialog)).toEqual([
+      'At stop 2 of 4: **The Stacks**\nNext is **Harbor Lighthouse Mural**',
+    ]);
+    expect(choices(train)).toEqual([
+      [`next:${targetOf(train, 'next')}`, 'Next: Harbor Lighthouse Mural', true],
+      [`previous:${targetOf(train, 'previous')}`, 'Previous: Veterans Memorial Bridge', false],
+      [
+        `skip:${targetOf(train, 'skip')}`,
+        'Skip Harbor Lighthouse Mural, go to Old Stone Fountain',
+        false,
+      ],
+    ]);
+    const radio = dialog.components.find((component) => 'component' in component);
+    // The title says the act; the choice where to (review r0, the controller's call).
+    expect(radio).toMatchObject({ label: 'Where to', component: { custom_id: MOVE_INPUT } });
+  });
+
+  it('leaves out a move that cannot be made from here, and says what Next does at the end', () => {
+    // At the first stop: no Previous.
+    expect(choices(onRoute([4, 1, 7], 0)).map(([, label]) => label)).toEqual([
+      'Next: The Stacks',
+      'Skip The Stacks, go to Harbor Lighthouse Mural',
+    ]);
+    // At the last stop of each mode.
+    expect(choices(onRoute([4, 1, 7], 2)).map(([, label]) => label)).toEqual([
+      'Next: finish the route',
+      'Previous: The Stacks',
+    ]);
+    expect(choices(onRoute([4, 1, 7], 2, 'loop'))[0]?.[1]).toBe(
+      'Next: round to Veterans Memorial Bridge',
+    );
+    expect(choices(onRoute([4, 1, 7], 2, 'turn-back'))[0]?.[1]).toBe(
+      'Next: turn back to The Stacks',
+    );
+  });
+
+  it('has no choice where one move is left: the text says what Submit does, the id the move', () => {
+    // A finished route: Previous alone, which takes a mistaken Finish back.
+    const finished = onRoute([4, 1, 7], 3, 'finish', 1);
+    const dialog = shown(finished);
+    checkModal(dialog);
+    expect(dialogChoices(dialog)).toEqual([]);
+    expect(dialogTexts(dialog)).toEqual([
+      'The train has finished its route of 3 stops. Previous takes it back to stop 2: ' +
+        '**The Stacks**.\n\nSubmit takes it back to stop 2, **The Stacks**.',
+    ]);
+    expect(decodeCustomId(dialog.custom_id)?.args).toEqual([
+      'end',
+      'previous',
+      targetOf(finished, 'previous'),
+      openToken(PARTY_NOW),
+    ]);
+    // Stop 1 of a route of two that finishes: Next alone.
+    const two = shown(onRoute([4, 1], 0));
+    expect(dialogChoices(two)).toEqual([]);
+    expect(dialogTexts(two)[0]).toMatch(/\n\nSubmit moves it to \*\*The Stacks\*\*\.$/);
+  });
+
+  it('cuts long names to fit a choice, and gives them whole in its description', () => {
+    const train = onRoute([4, 90, 91], 0);
+    const dialog = shown(train);
+    checkModal(dialog);
+    const [next, skip] = dialogChoices(dialog);
+    expect(next?.label.length).toBeLessThanOrEqual(100);
+    expect(next?.label.endsWith('…')).toBe(true);
+    // The description holds more of it than the label (Discord takes 100 of each).
+    expect(next?.description?.startsWith(LONG.slice(0, 90))).toBe(true);
+    expect(next?.description?.length).toBeLessThanOrEqual(100);
+    expect(next?.description?.length).toBeGreaterThan((next?.label.length ?? 0) - 'Next: '.length);
+    expect(skip?.label.length).toBeLessThanOrEqual(100);
+    expect(skip?.label).toMatch(/^Skip A gym whose .*…, go to A gym whose .*…$/);
+  });
+});
diff --git a/src/render/train-dialogs.ts b/src/render/train-dialogs.ts
new file mode 100644
index 0000000000000000000000000000000000000000..edfa4cf997fbddcfe56628b41705d4afcd14bca9
--- /dev/null
+++ b/src/render/train-dialogs.ts
@@ -0,0 +1,264 @@
+import type { APIModalInteractionResponseCallbackData } from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import { dialog, openToken, type DialogOption } from '../discord/dialog.js';
+import type { StopRef } from '../domain/party/stops.js';
+import {
+  cannotMove,
+  currentStop,
+  destinationOf,
+  nextStop,
+  placeOf,
+  routeFinished,
+  targetOf,
+  turnAhead,
+} from '../domain/party/train.js';
+import { PARTY_KIND } from './party-controls.js';
+import { count, endSentence, plain, truncate } from './text.js';
+import type { TrainPlaces } from './train-post.js';
+import { stopLabel } from './train-stops.js';
+
+/*
+ * The dialogs of a train's post (plan 8X-G; design talk of 2026-10-22): Move… (`moveDialog`)
+ * and Manage… (`manageDialog`), in the place of the Manage train panel. A post control that
+ * needs more input opens a dialog (Matt, 2026-10-22).
+ */
+
+/** What a dialog of a train is drawn from: its places, and when it opens (the per-open token). */
+export interface TrainDialogView extends TrainPlaces {
+  now: number;
+}
+
+/**
+ * The action of Move…'s dialog: `party:<id>:moveform:<place>[:<move>:<target>]:~<token>`, the
+ * move and where it leads in the custom id when it is the one move left (no choice: a radio
+ * group takes two to ten).
+ */
+export const MOVE_FORM = 'moveform';
+
+/** The radio group of Move…'s dialog; a choice is `<move>:<target>` (`targetOf`). */
+export const MOVE_INPUT = 'move';
+
+/** The moves Move… offers; Finish is Manage…'s. */
+export const DIALOG_MOVES = ['next', 'previous', 'skip'] as const;
+export type DialogMove = (typeof DIALOG_MOVES)[number];
+
+export function isDialogMove(value: string | undefined): value is DialogMove {
+  return (DIALOG_MOVES as readonly (string | undefined)[]).includes(value);
+}
+
+/** Discord's room for a choice's label and its description. */
+const CHOICE_ROOM = 100;
+/** The room of each of the two stops a Skip names in its label. */
+const SKIP_NAME_ROOM = 40;
+
+/** A move Move… offers: where it leads, its choice's label, and the sentence of Submit alone. */
+interface OfferedMove {
+  move: DialogMove;
+  target: string;
+  label: string;
+  /** The names whole, where the label had to cut them; undefined where it did not. */
+  description: string | undefined;
+  /** What Submit does, where this is the one move left: `Submit moves it to **X**.` */
+  sentence: string;
+}
+
+/** A stop by its label (`stopLabel`), raw: a choice shows no markdown. */
+function labelOf(view: TrainPlaces, ref: StopRef | undefined): string {
+  return ref === undefined ? 'an unknown stop' : stopLabel(view.stop(ref));
+}
+
+/** A stop in the dialog's text: its label in bold, made plain, no link. */
+function boldOf(view: TrainPlaces, ref: StopRef | undefined): string {
+  return `**${plain(labelOf(view, ref))}**`;
+}
+
+/** A label of a prefix and a name, the name cut to fit; with the whole name where it was cut. */
+function named(prefix: string, name: string): { label: string; description: string | undefined } {
+  const label = `${prefix}${truncate(name, CHOICE_ROOM - prefix.length)}`;
+  return {
+    label,
+    description: label === `${prefix}${name}` ? undefined : truncate(name, CHOICE_ROOM),
+  };
+}
+
+/** What Next does from where the train is, as Move… offers it. */
+function nextMove(view: TrainPlaces): OfferedMove {
+  const { party } = view;
+  const target = targetOf(party, 'next');
+  const next = nextStop(party);
+  if (next === undefined) {
+    return {
+      move: 'next',
+      target,
+      label: 'Next: finish the route',
+      description: undefined,
+      sentence: 'Submit finishes the route.',
+    };
+  }
+  const name = labelOf(view, next);
+  const bold = boldOf(view, next);
+  switch (turnAhead(party)) {
+    case 'round':
+      return {
+        move: 'next',
+        target,
+        ...named('Next: round to ', name),
+        sentence: endSentence(`Submit takes it round to ${bold}`),
+      };
+    case 'back':
+      return {
+        move: 'next',
+        target,
+        ...named('Next: turn back to ', name),
+        sentence: endSentence(`Submit turns it back to ${bold}`),
+      };
+    default:
+      return {
+        move: 'next',
+        target,
+        ...named('Next: ', name),
+        sentence: endSentence(`Submit moves it to ${bold}`),
+      };
+  }
+}
+
+/** Where Previous takes the train, as Move… offers it; of a finished route, by its number. */
+function previousMove(view: TrainPlaces): OfferedMove {
+  const { party } = view;
+  const to = destinationOf(party, 'previous');
+  const ref = to.route[to.stop];
+  const target = targetOf(party, 'previous');
+  if (routeFinished(party)) {
+    const number = `stop ${String(to.stop + 1)}`;
+    return {
+      move: 'previous',
+      target,
+      ...named(`Previous: back to ${number}, `, labelOf(view, ref)),
+      sentence: endSentence(`Submit takes it back to ${number}, ${boldOf(view, ref)}`),
+    };
+  }
+  return {
+    move: 'previous',
+    target,
+    ...named('Previous: ', labelOf(view, ref)),
+    sentence: endSentence(`Submit takes it back to ${boldOf(view, ref)}`),
+  };
+}
+
+/** Skip as Move… offers it: `Skip <next stop>, go to <stop after>`, each name cut to 40. */
+function skipMove(view: TrainPlaces): OfferedMove {
+  const { party } = view;
+  const to = destinationOf(party, 'skip');
+  const skipped = labelOf(view, to.skipped);
+  const after = labelOf(view, to.route[to.stop]);
+  const label = `Skip ${truncate(skipped, SKIP_NAME_ROOM)}, go to ${truncate(after, SKIP_NAME_ROOM)}`;
+  const whole = `Skip ${skipped}, go to ${after}`;
+  return {
+    move: 'skip',
+    target: targetOf(party, 'skip'),
+    label,
+    description: label === whole ? undefined : truncate(`${skipped}, then ${after}`, CHOICE_ROOM),
+    sentence: endSentence(
+      `Submit skips ${boldOf(view, to.skipped)} and moves it to ${boldOf(view, to.route[to.stop])}`,
+    ),
+  };
+}
+
+/**
+ * The moves Move… offers from where the train is, in the order Next, Previous, Skip; a move
+ * that cannot be made from here (`cannotMove`) is left out, not shown switched off.
+ */
+export function offeredMoves(view: TrainPlaces): OfferedMove[] {
+  const offers: Record<DialogMove, (view: TrainPlaces) => OfferedMove> = {
+    next: nextMove,
+    previous: previousMove,
+    skip: skipMove,
+  };
+  return DIALOG_MOVES.filter((move) => cannotMove(view.party, move) === undefined).map((move) =>
+    offers[move](view),
+  );
+}
+
+/**
+ * Where the train is and what Next does, as Move… and Manage… say it at the top: the panel's
+ * words (`At stop 2 of 4: X`, `Next is Y`), the stops in bold and without links (whether a
+ * dialog's links can be clicked is not known); of a finished route where Previous leads.
+ */
+export function trainStateText(view: TrainPlaces): string {
+  const { party } = view;
+  const { route, stop } = party.train;
+  if (routeFinished(party)) {
+    const back = destinationOf(party, 'previous');
+    return (
+      `The train has finished its route of ${count(route.length, 'stop')}. ` +
+      endSentence(
+        `Previous takes it back to stop ${String(back.stop + 1)}: ` +
+          boldOf(view, back.route[back.stop]),
+      )
+    );
+  }
+  const here = `At stop ${String(stop + 1)} of ${String(route.length)}: ${boldOf(view, currentStop(party))}`;
+  const next = nextStop(party);
+  if (next === undefined) return `${here}\nIt is the last stop: Next finishes the route`;
+  const where = boldOf(view, next);
+  switch (turnAhead(party)) {
+    case 'round':
+      return `${here}\nNext goes round to ${where}`;
+    case 'back':
+      return `${here}\nNext turns back to ${where}`;
+    default:
+      return `${here}\nNext is ${where}`;
+  }
+}
+
+/**
+ * Move… (plan 8X-G, design talk item 5): for who may move the train, a dialog with where it is
+ * (`trainStateText`) and one radio choice "Where to" of the moves that can be made from
+ * here (`offeredMoves`): Next picked to start with (Android picks the first, which it is), then
+ * Previous and Skip; each choice `<move>:<target>`, where it leads (`targetOf`). With one move
+ * left (a finished route: Previous alone; stop 1 of a route of two: Next alone) there is no
+ * choice (a radio group takes two to ten): the text says what Submit does and the custom id
+ * carries the move. The custom id carries where the train was (`placeOf`), so a Submit after
+ * somebody else moved it changes nothing, and ends in a per-open token (`openToken`).
+ */
+export function moveDialog(view: TrainDialogView): APIModalInteractionResponseCallbackData {
+  const { party } = view;
+  const moves = offeredMoves(view);
+  const place = placeOf(party);
+  const token = openToken(view.now);
+  const state = trainStateText(view);
+  const [only] = moves;
+  if (moves.length === 1 && only !== undefined) {
+    return dialog({
+      customId: encodeCustomId({
+        kind: PARTY_KIND,
+        id: party.id,
+        action: MOVE_FORM,
+        args: [place, only.move, only.target, token],
+      }),
+      title: 'Move the train',
+      text: `${state}\n\n${only.sentence}`,
+    });
+  }
+  const options: DialogOption[] = moves.map((offered) => ({
+    value: `${offered.move}:${offered.target}`,
+    label: offered.label,
+    ...(offered.description === undefined ? {} : { description: offered.description }),
+  }));
+  return dialog({
+    customId: encodeCustomId({
+      kind: PARTY_KIND,
+      id: party.id,
+      action: MOVE_FORM,
+      args: [place, token],
+    }),
+    title: 'Move the train',
+    text: state,
+    choice: {
+      id: MOVE_INPUT,
+      label: 'Where to',
+      options,
+      ...(options[0] === undefined ? {} : { picked: options[0].value }),
+    },
+  });
+}
````

### Task 6: 8X-G 6: Manage… for a train, the third row Group… Move… Manage… Split… Route

Prototype commit: `859be7802820e6948fceb42f48e7320ff9165190`

- Manage… (manageDialog): for who may move the train and staff, where it is, then
  "The route" (Keep it as it is, picked and first; Reverse it where cannotReverse
  allows; Finish it here while the route is not finished; left out when only Keep is
  left), "At the end of the route" and "What the train is mainly for" as menus with
  the train's own picked. A train without a route is asked its kind alone. The custom
  id carries where the train was, the route's first stop, and the mode and kind shown
  (a letter each): Submit applies only what was picked otherwise.
- TrainService.manage: the kind, then the route (Reverse, or Finish as a move,
  announced), then the mode, as one change: one write, one line in the post, a
  refusal of any part refuses all; the route is judged before the mode.
- Submit answers with what it did in the words of the commands and the map ("This
  train is a Max Battle Train now. The route is reversed. …" and where the train is),
  "Nothing changed." when nothing was picked otherwise, and "The train has moved on
  since you opened this:" for a route change from a dialog opened elsewhere.
- The post's third row: Group… · Move… (while the train has a route) · Manage… ·
  Split… · Route, words only (Matt); a copy in another region leaves Move…, Manage…
  and Split… out. The old button party:<id>:move opens Move…, or Manage… on a train
  without a route.
- The Manage train panel is gone (trainPanel, its press handlers, OLD_PANEL); its
  controls answer as stale. whereText, movementText and the menus' words are in
  train-words.ts. Help texts and the split's refusal name the new buttons.

**Files:**

```
 src/commands/parties/in-train.test.ts     |  32 +-
 src/commands/trains/manage-dialog.test.ts | 208 +++++++++++++
 src/commands/trains/move.test.ts          | 849 +-------------------------------------------------
 src/commands/trains/move.ts               | 343 ++++++++++----------
 src/commands/trains/route.ts              |   8 +-
 src/commands/trains/split.test.ts         |   6 +-
 src/commands/trains/split.ts              |   8 +-
 src/commands/trains/train-changes.ts      |  11 +-
 src/commands/trains/train.test.ts         |  10 +-
 src/commands/trains/train.ts              |   8 +-
 src/components/party.ts                   |  51 ++-
 src/discord/custom-id.ts                  |   6 +-
 src/domain/party/train.ts                 |  14 +-
 src/domain/web/party-data.ts              |   5 +-
 src/domain/web/party-view.ts              |   2 +-
 src/render/mirrors.region.test.ts         |   1 +
 src/render/party-controls.test.ts         |  26 +-
 src/render/party-controls.ts              | 112 ++++---
 src/render/party-post.test.ts             |   2 +-
 src/render/party-post.ts                  |   4 +-
 src/render/train-dialogs.test.ts          | 131 +++++++-
 src/render/train-dialogs.ts               | 142 ++++++++-
 src/render/train-kind.test.ts             |  23 +-
 src/render/train-panel.ts                 | 321 -------------------
 src/render/train-post.test.ts             | 313 ++++---------------
 src/render/train-post.ts                  |  15 +-
 src/render/train-words.ts                 | 138 +++++++-
 src/services/party-mirrors.region.test.ts |  11 +-
 src/services/party-service.train.test.ts  |   4 +-
 src/services/train-service.spots.test.ts  |  16 +-
 src/services/train-service.test.ts        |  99 +++++-
 src/services/train-service.ts             | 162 ++++++++--
 src/web/train-routes.ts                   |   2 +-
 33 files changed, 1266 insertions(+), 1817 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/in-train.test.ts src/commands/trains/manage-dialog.test.ts src/commands/trains/move.test.ts src/commands/trains/split.test.ts src/commands/trains/train.test.ts src/render/mirrors.region.test.ts src/render/party-controls.test.ts src/render/party-post.test.ts src/render/train-dialogs.test.ts src/render/train-kind.test.ts src/render/train-post.test.ts src/services/party-mirrors.region.test.ts src/services/party-service.train.test.ts src/services/train-service.spots.test.ts src/services/train-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 859be7802820e6948fceb42f48e7320ff9165190 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-G 6: Manage… for a train, the third row Group… Move… Manage… Split… Route`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index ddc4e7d7f69c4f6da3c6d20b24725fd24af6ee37..cbc755b27550ecb8486636d5a0114d3cb58ac4e3 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -1,5 +1,4 @@
 import { gymStop } from '../../domain/party/stops.js';
-import { stopsFrom } from '../../render/train-stops.js';
 import { dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
 import { REMOVAL_INPUT } from '../../render/moderation.js';
 import { ComponentType, MessageFlags } from 'discord.js';
@@ -32,7 +31,6 @@ import { InteractionRouter } from '../../discord/router.js';
 import { attendeeOf } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
 import { TIME_INPUT } from '../../render/party-controls.js';
-import { trainPanel } from '../../render/train-panel.js';
 import { admin } from '../admin/index.js';
 import { info, infoControls } from '../meetups/info.js';
 import { boss, moveset } from '../raids/boss.js';
@@ -53,7 +51,6 @@ import { status, where } from './status.js';
 import {
   buttonLabels,
   buttonsOf,
-  customIdsOf,
   header,
   textDisplays,
   textOf,
@@ -298,8 +295,9 @@ describe('the attendance commands in the post of a train', () => {
     // The post lists both groups now, and a group can be split off.
     expect(buttonLabels(await made.shown()).filter((label) => label !== undefined)).toEqual([
       'Group…',
-      'Manage train…',
-      'Split group…',
+      'Move…',
+      'Manage…',
+      'Split…',
     ]);
     // Each by somebody else: a group its one member leaves goes (plan 8X-1B).
     for (const userId of [BOB, CAROL, '200000000000000005']) {
@@ -866,30 +864,20 @@ describe('what a member of a train is told', () => {
     // The route was cleared above: the train gets one again, to be moved along.
     for (const gymId of [4, 1, 7, 2])
       await made.trains.addStop(made.party.id, { id: ALICE }, gymStop(gymId));
-    /** A button of the panel as it would be drawn now: with where the train is, and where it leads. */
-    const drawn = (move: string): string => {
-      const panel = trainPanel({ party: made.current(), stop: stopsFrom(made.ctx.gyms) });
-      const id = customIdsOf(panel).find((found) =>
-        found.startsWith(`party:${made.party.id}:${move}:`),
-      );
-      if (id === undefined) throw new Error(`the panel has no button ${move}`);
-      return id.slice(`party:${made.party.id}:`.length);
-    };
     const moves = ['next', 'previous', 'skip', 'finish', 'next'];
     // Real moves, the last one refused: the route is finished by then.
-    await made.click('move');
-    for (const move of moves) await made.click(drawn(move));
+    for (const move of moves) await made.run(move);
     expect(made.current().train.stop).toBe(4);
-    // A panel that was drawn before the train moved on.
+    // A control of the Manage train panel before plan 8X-G, still open in a client.
     await made.click('next:4:1');
     for (const action of ['join', 'more', 'less', 'remote', 'here', 'maybe', 'group:A']) {
       await made.click(action);
     }
-    // The panel of a member who is not signed up, and of one who has left.
-    const panel = ['move', ...moves.map(drawn)];
+    // Move… and Manage… (plan 8X-G) of a member who is not signed up, and of one who has left.
+    const panel = ['move', 'manage'];
     for (const action of panel) await made.click(action, { userId: CAROL });
     await made.click('leave');
-    for (const action of panel.slice(0, 3)) await made.click(action);
+    for (const action of panel) await made.click(action);
     const closing = shownDialog(await made.run('delete', {}, { roleNames: ['Admin'] }));
     await made.handle(
       fakeModal({
@@ -907,8 +895,8 @@ describe('what a member of a train is told', () => {
     expect(made.told.slice(-8)).toEqual(Array.from({ length: 8 }, () => 'This has ended.'));
     // What only a train has knows that it was one. (By Bob: Alice has used up her clicks.)
     for (const action of panel) await made.click(action, { userId: BOB });
-    expect(made.told.slice(-6)).toEqual(Array.from({ length: 6 }, () => 'This train is over.'));
-    expect(made.told.length).toBeGreaterThanOrEqual(tries.length + 36);
+    expect(made.told.slice(-2)).toEqual(Array.from({ length: 2 }, () => 'This train is over.'));
+    expect(made.told.length).toBeGreaterThanOrEqual(tries.length + 27);
     // A raid is named only where every kind is ("raid, max battle, train or meetup", "raid or train"), and
     // a meetup only beside the train ("train or meetup"). Nothing speaks of a tier or a report.
     const wrong = made.told.filter(
diff --git a/src/commands/trains/manage-dialog.test.ts b/src/commands/trains/manage-dialog.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a06926a434b80054590b21015512b52491836d01
--- /dev/null
+++ b/src/commands/trains/manage-dialog.test.ts
@@ -0,0 +1,208 @@
+import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { dialogOf, dialogTexts, shownDialog } from '../../../test/support/dialogs.js';
+import {
+  fakeButton,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../../test/support/fake-interactions.js';
+import { ALICE, BOB, CAROL, PARTY_NOW, stops } from '../../../test/support/parties.js';
+import { createdTrain } from '../../../test/support/party-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { partyButtons } from '../../components/party.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import {
+  MANAGE_AT_END_INPUT,
+  MANAGE_KIND_INPUT,
+  MANAGE_ROUTE_INPUT,
+} from '../../render/train-dialogs.js';
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+/** A train on a route of four gyms (4, 1, 7, 2), with Alice and Bob coming. */
+async function setup(route: readonly number[] = [4, 1, 7, 2]) {
+  const made = await createdTrain({ route });
+  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+  await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    trains: made.trains,
+    parties: made.store,
+    regions: made.regions,
+  });
+  const router = new InteractionRouter(ctx, [], [partyButtons]);
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const who = (userId: string, extra: object = {}) => ({
+    userId,
+    displayName: userId === ALICE ? 'Alice' : 'Somebody',
+    channelId: made.postId,
+    ...extra,
+  });
+  /** A press of Manage… on the post. */
+  const open = (userId = ALICE, extra: object = {}) =>
+    handle(fakeButton({ customId: `party:${made.party.id}:manage`, ...who(userId, extra) }));
+  /** The Submit of a Manage… dialog with these picked; what is not given is as it was shown. */
+  const submit = (
+    dialog: APIModalInteractionResponseCallbackData,
+    asked: { route?: string; atEnd?: string; kind?: string },
+    userId = ALICE,
+  ) => {
+    const party = made.current();
+    const inputs = new Set(
+      dialog.components.flatMap((component) =>
+        'component' in component ? [component.component.custom_id] : [],
+      ),
+    );
+    return handle(
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        ...(inputs.has(MANAGE_ROUTE_INPUT)
+          ? { picked: { [MANAGE_ROUTE_INPUT]: asked.route ?? 'keep' } }
+          : {}),
+        selected: {
+          ...(inputs.has(MANAGE_AT_END_INPUT)
+            ? { [MANAGE_AT_END_INPUT]: [asked.atEnd ?? party.train.atEnd] }
+            : {}),
+          [MANAGE_KIND_INPUT]: [asked.kind ?? party.train.kind],
+        },
+        ...who(userId),
+      }),
+    );
+  };
+  const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
+  const lines = async (): Promise<string[]> => {
+    await made.trains.flush();
+    await made.attendance.flush();
+    await made.service.flush();
+    return made.said().join('\n').split('\n').filter(Boolean);
+  };
+  return { ...made, ctx, handle, open, submit, answerOf, lines };
+}
+
+describe('Manage… of a train’s post (plan 8X-G)', () => {
+  it('reverses the route, sets the mode and the kind in one Submit, and says what it did', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.open());
+    expect(dialog.title).toBe('Manage the train');
+    const submitted = await made.submit(dialog, {
+      route: 'reverse',
+      atEnd: 'loop',
+      kind: 'dynamax',
+    });
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(made.current().train).toMatchObject({
+      kind: 'dynamax',
+      atEnd: 'loop',
+      route: stops(2, 7, 1, 4),
+    });
+    expect(made.answerOf(submitted)).toMatch(
+      /^This train is a Max Battle Train now\. The route is reversed\. At the end it loops back to the first stop\. The train is at stop 4 of 4/,
+    );
+    // One line in the post for all three (after the lines of the sign-ups).
+    expect((await made.lines()).at(-1)).toMatch(
+      /made this a Max Battle Train\. The route was reversed by .+ set the train to loop\.$/,
+    );
+  });
+
+  it('changes only what was picked otherwise than shown, and answers a Submit that changes nothing', async () => {
+    const made = await setup();
+    const alice = shownDialog(await made.open());
+    // Bob makes it loop while Alice's dialog is open; she changes only the kind.
+    await made.trains.setAtEnd(made.party.id, { id: BOB }, false, 'loop');
+    await made.submit(alice, { atEnd: 'finish', kind: 'gigantamax' });
+    expect(made.current().train).toMatchObject({ kind: 'gigantamax', atEnd: 'loop' });
+    const again = shownDialog(await made.open());
+    expect(made.answerOf(await made.submit(again, {}))).toBe('Nothing changed.');
+  });
+
+  it('finishes the route here, and refuses a route change from a dialog opened elsewhere', async () => {
+    const made = await setup();
+    const early = shownDialog(await made.open());
+    await made.trains.move(made.party.id, { id: BOB }, 'next', false);
+    const late = await made.submit(early, { route: 'finish', kind: 'dynamax' });
+    expect(made.current().train).toMatchObject({ stop: 1, kind: 'raid' });
+    expect(made.answerOf(late)).toMatch(
+      /^The train has moved on since you opened this: The train is at stop 2 of 4.*\. Nothing was changed\.$/,
+    );
+    // The kind and the mode alone from that dialog ask nothing of where the train is (review r0
+    // B1): both are applied.
+    const both = await made.submit(early, { atEnd: 'loop', kind: 'gigantamax' });
+    expect(made.current().train).toMatchObject({ stop: 1, kind: 'gigantamax', atEnd: 'loop' });
+    expect(made.answerOf(both)).toBe(
+      'This train is a Gigantamax Train now. At the end it loops back to the first stop.',
+    );
+    const fresh = shownDialog(await made.open());
+    const finished = await made.submit(fresh, { route: 'finish' });
+    expect(made.current().train.stop).toBe(4);
+    expect(made.answerOf(finished)).toMatch(
+      /^The route is finished\. The train has finished its route of 4 stops\./,
+    );
+  });
+
+  it('asks a train without a route its kind alone, and is for who may move it and staff', async () => {
+    const made = await setup([]);
+    const dialog = shownDialog(await made.open());
+    expect(dialogTexts(dialog)).toEqual([
+      'This train has no route yet. Add its stops with `/route add`.',
+    ]);
+    await made.submit(dialog, { kind: 'gigantamax' });
+    expect(made.current().train.kind).toBe('gigantamax');
+    const stranger = await made.open(CAROL);
+    expect(dialogOf(stranger)).toBeUndefined();
+    expect(sent(stranger.reply).content).toBe('You are not signed up for this train.');
+    expect(dialogOf(await made.open(CAROL, { roleNames: ['Moderator'] }))).toBeDefined();
+    // The button of a post drawn before 8X-G, on a train without a route, opens Manage….
+    const old = await made.handle(
+      fakeButton({
+        customId: `party:${made.party.id}:move`,
+        userId: ALICE,
+        channelId: made.postId,
+      }),
+    );
+    expect(dialogOf(old)?.title).toBe('Manage the train');
+  });
+
+  it('reverses the route once when two members submit Reverse from dialogs opened at one stop (review r0 B5)', async () => {
+    const made = await setup();
+    const alice = shownDialog(await made.open());
+    const bob = shownDialog(await made.open(BOB));
+    await made.submit(alice, { route: 'reverse' });
+    const second = await made.submit(bob, { route: 'reverse' }, BOB);
+    expect(made.current().train.route).toEqual(stops(2, 7, 1, 4));
+    expect(made.answerOf(second)).toMatch(/^The train has moved on since you opened this: /);
+    expect((await made.lines()).filter((line) => line.includes('reversed'))).toHaveLength(1);
+  });
+
+  it('answers a forged Submit as stale, and the controls of the old panel too', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.open());
+    const forged = await made.handle(
+      fakeModal({ customId: dialog.custom_id, userId: ALICE, channelId: made.postId }),
+    );
+    expect(sent(forged.reply).content).toBe(STALE_COMPONENT);
+    for (const action of ['next:4:1', 'previous:4:4', 'skip:4:7', 'finish:4', 'reverse:4:4']) {
+      const pressed = await made.handle(
+        fakeButton({
+          customId: `party:${made.party.id}:${action}`,
+          userId: ALICE,
+          channelId: made.postId,
+        }),
+      );
+      expect(sent(pressed.reply).content).toBe(STALE_COMPONENT);
+    }
+    expect(made.current().train.stop).toBe(0);
+  });
+});
diff --git a/src/commands/trains/move.test.ts b/src/commands/trains/move.test.ts
index f1dd82b608adb56924e7ed814db4825d24eed672..dc4506728362f9385e563b459403e8953b9b9a71 100644
--- a/src/commands/trains/move.test.ts
+++ b/src/commands/trains/move.test.ts
@@ -1,49 +1,29 @@
-import { ComponentType, MessageFlags, type APIStringSelectComponent } from 'discord.js';
+import { MessageFlags } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
-  asV2,
-  fakeButton,
   fakeChatInput,
-  fakeSelect,
   sent,
   type FakeInteraction,
-  type FakeRow,
 } from '../../../test/support/fake-interactions.js';
 import { testGyms, WEST_FORUM } from '../../../test/support/gyms.js';
-import {
-  ALICE,
-  BOB,
-  CAROL,
-  PARTY_NOW,
-  REPORTER,
-  stops,
-  gym,
-} from '../../../test/support/parties.js';
+import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER, stops } from '../../../test/support/parties.js';
 import { createdMeetup, createdTrain } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { partyButtons } from '../../components/party.js';
 import { ClickAnswers } from '../../discord/click-answers.js';
 import type { CommandModule } from '../../discord/command.js';
-import { v2Answer } from '../../discord/late-reply.js';
-import type { V2Message } from '../../discord/party-gateway.js';
-import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
+import { InteractionRouter } from '../../discord/router.js';
 import { attendeeOf, type TrainAtEnd } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
-import type { PostGym } from '../../render/raid-post.js';
-import { panelNote, trainPanel } from '../../render/train-panel.js';
-import { stopsFrom } from '../../render/train-stops.js';
 import { conductor } from './conductor.js';
-import { finish, next, OLD_PANEL, previous, skip } from './move.js';
-import {
-  allComponents,
-  customIdsOf,
-  header,
-  selectsOf,
-  textDisplays,
-  textOf,
-} from '../../../test/support/messages.js';
-import { expectV2Sendable } from '../../../test/support/post-limits.js';
-import { dialogOf } from '../../../test/support/dialogs.js';
+import { finish, next, previous, skip } from './move.js';
+import { header, textOf } from '../../../test/support/messages.js';
+
+/*
+ * The commands that move a train and `/conductor`. Move… and Manage… of the post, which took the
+ * place of the Manage train panel (plan 8X-G), are `move-dialog.test.ts` and
+ * `manage-dialog.test.ts`.
+ */
 
 const all: CommandModule[] = [next, previous, skip, finish, conductor];
 
@@ -51,37 +31,9 @@ const maps = (id: number): string => {
   const gym = testGyms().find((found) => found.id === id);
   return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
 };
-const BRIDGE = `[Veterans Memorial Bridge](<${maps(4)}>)`;
 const STACKS = `[The Stacks](<${maps(1)}>)`;
 const MURAL = `[Harbor Lighthouse Mural](<${maps(7)}>)`;
 const FOUNTAIN = `[Old Stone Fountain](<${maps(2)}>)`;
-/** The same as the panel links them: in a components-v2 message, without the brackets. */
-const BRIDGE_BARE = `[Veterans Memorial Bridge](${maps(4)})`;
-const STACKS_BARE = `[The Stacks](${maps(1)})`;
-const MURAL_BARE = `[Harbor Lighthouse Mural](${maps(7)})`;
-const FOUNTAIN_BARE = `[Old Stone Fountain](${maps(2)})`;
-
-/** A message a control is on that is components v2, as every panel since 8B-3 is. */
-const V2_ROWS: readonly FakeRow[] = [{ type: ComponentType.Container, components: [] }];
-/** A plain-text panel with its row of buttons, as panels were before 8B-3. */
-const CLASSIC_ROWS: readonly FakeRow[] = [{ type: ComponentType.ActionRow, components: [] }];
-
-/** The text of the panel: its heading, then these lines. */
-const panelText = (...lines: string[]): string => ['### Manage the train', ...lines].join('\n');
-
-/** The first text of a components-v2 message: of a panel, its heading and where the train is. */
-const firstText = (message: V2Message): string => textDisplays(message)[0] ?? '';
-
-/** The first text of the components-v2 message a responder of a fake was first given. */
-const shown = (responder: Parameters<typeof sent>[0]): string => firstText(asV2(sent(responder)));
-
-/** The mode the menu of a panel shows as chosen. */
-const chosen = (message: V2Message): string | undefined =>
-  (
-    allComponents(message).find(
-      (component) => (component as { type?: unknown }).type === ComponentType.StringSelect,
-    ) as APIStringSelectComponent | undefined
-  )?.options.find((option) => option.default === true)?.value;
 
 beforeEach(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
@@ -122,57 +74,6 @@ async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0, atEn
     );
   const answer = async (commandName: string, extra?: object): Promise<string | undefined> =>
     sent((await run(commandName, extra)).reply).content;
-  /**
-   * A press on a control of the train, by Alice unless `extra` says otherwise, on a message that
-   * is components v2 (a panel, a post) unless `extra` gives other rows.
-   */
-  const click = (action: string, extra: object = {}) =>
-    handle(
-      fakeButton({
-        customId: `party:${made.party.id}:${action}`,
-        channelId: made.postId,
-        userId: ALICE,
-        displayName: 'Alice',
-        messageRows: V2_ROWS,
-        ...extra,
-      }),
-    );
-  /** The panel as it would be drawn now, with `note` above where the train is. */
-  const panel = (note?: string) =>
-    trainPanel({ party: made.current(), stop: stopsFrom(ctx.gyms) }, note);
-  /** A press on a button of that panel: it carries where the train is, and where it leads. */
-  const press = (action: string, extra: object = {}) => {
-    const drawn = customIdsOf(panel()).find((id) =>
-      id.startsWith(`party:${made.party.id}:${action}:`),
-    );
-    if (!drawn) throw new Error(`the panel has no button ${action}`);
-    return handle(
-      fakeButton({
-        customId: drawn,
-        channelId: made.postId,
-        userId: ALICE,
-        displayName: 'Alice',
-        messageRows: panel().components as FakeRow[],
-        ...extra,
-      }),
-    );
-  };
-  /** A choice in the menu "At the end of the route" of the panel as it is drawn now. */
-  const pick = (value: string, extra: object = {}) => {
-    const [menu] = selectsOf(panel());
-    if (!menu) throw new Error('the panel has no menu');
-    return handle(
-      fakeSelect({
-        customId: menu.customId,
-        values: [value],
-        channelId: made.postId,
-        userId: ALICE,
-        displayName: 'Alice',
-        messageRows: panel().components as FakeRow[],
-        ...extra,
-      }),
-    );
-  };
   /** Everything said in the post, line by line, once all of it has gone out. */
   const lines = async (): Promise<string[]> => {
     await made.attendance.flush();
@@ -181,7 +82,7 @@ async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0, atEn
     await made.service.flush();
     return made.said().join('\n').split('\n').filter(Boolean);
   };
-  return { ...made, ctx, handle, run, answer, click, press, pick, lines, panel, inPost };
+  return { ...made, ctx, handle, run, answer, lines, inPost };
 }
 
 describe('/next, /previous, /skip and /finish', () => {
@@ -416,729 +317,3 @@ describe('/conductor', () => {
     ]);
   });
 });
-
-describe('the button "Manage train…" and its panel', () => {
-  it('is drawn with where the train is, what comes next, the four moves and the mode', async () => {
-    const made = await setup();
-    // The button opens Move… since plan 8X-G (`move-dialog.test.ts`).
-    expect(dialogOf(await made.click('move'))?.title).toBe('Move the train');
-    expect(firstText(made.panel())).toBe(
-      panelText(`At stop 1 of 4: ${BRIDGE_BARE}`, `Next is ${STACKS_BARE}`),
-    );
-    // Every button says where the train was when the panel was drawn (at gym 4), and Next and
-    // Skip also where they lead: to gym 1, and past it to gym 7. At the first stop of a route
-    // that finishes, Reverse is there too; the menu says where the train was as well.
-    expect(customIdsOf(made.panel())).toEqual(
-      ['next:4:1', 'previous:4:4', 'skip:4:7', 'finish:4', 'reverse:4:4'].map(
-        (action) => `party:${made.party.id}:${action}`,
-      ),
-    );
-    expect(selectsOf(made.panel()).map((menu) => menu.customId)).toEqual([
-      `party:${made.party.id}:atend:4`,
-      `party:${made.party.id}:kind`,
-    ]);
-    // Opening it moves nothing and says nothing.
-    expect(made.current().train.stop).toBe(0);
-    expect(await made.lines()).toEqual([]);
-  });
-
-  it('gives who may not move the train the refusal instead of the panel', async () => {
-    const made = await setup();
-    const stranger = await made.click('move', { userId: CAROL });
-    expect(stranger.reply).toHaveBeenCalledWith({
-      content: 'You are not signed up for this train.',
-      flags: MessageFlags.Ephemeral,
-    });
-    await made.trains.setConductor(made.party.id, { id: BOB });
-    expect(sent((await made.click('move')).reply).content).toBe(
-      'This train has a conductor: only they and the moderators can move it.',
-    );
-    // The conductor and a moderator get Move… (plan 8X-G).
-    expect(dialogOf(await made.click('move', { userId: BOB }))).toBeDefined();
-    const moderator = await made.click('move', { userId: CAROL, roleNames: ['Moderator'] });
-    expect(dialogOf(moderator)).toBeDefined();
-  });
-
-  it('gives a train without a route the panel of what applies: no moves, the kind (plan 8X-4)', async () => {
-    const made = await setup([]);
-    const opened = await made.click('move');
-    const shownPanel = asV2(sent(opened.reply));
-    expect(textDisplays(shownPanel)).toEqual([
-      '### Manage the train\nThis train has no route yet. Add its stops with `/route add`.',
-      '**What the train is mainly for**',
-    ]);
-    // No dead buttons: no moves, no Reverse, no mode of an end it does not have.
-    expect(customIdsOf(shownPanel)).toEqual([]);
-    expect(selectsOf(shownPanel).map((menu) => menu.customId)).toEqual([
-      `party:${made.party.id}:kind`,
-    ]);
-    expectV2Sendable(shownPanel);
-    // A train planned ahead gets its kind changed before it has a stop.
-    const menu = selectsOf(made.panel())[0];
-    const picked = await made.handle(
-      fakeSelect({
-        customId: menu?.customId ?? '',
-        values: ['gigantamax'],
-        channelId: made.postId,
-        userId: ALICE,
-        displayName: 'Alice',
-        messageRows: made.panel().components as FakeRow[],
-      }),
-    );
-    expect(made.current().train.kind).toBe('gigantamax');
-    expect(picked.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    // Who may not move the train is told so, without a panel, route or not.
-    const stranger = await made.click('move', { userId: CAROL });
-    expect(sent(stranger.reply).content).toBe('You are not signed up for this train.');
-  });
-
-  it('works on a copy of the message in another channel: the train is the one the button names', async () => {
-    const made = await setup();
-    const opened = await made.click('move', { channelId: '600000000000000099' });
-    expect(dialogOf(opened)?.title).toBe('Move the train');
-    const pressed = await made.press('next', { channelId: '600000000000000099' });
-    expect(shown(pressed.update)).toMatch(/\nAt stop 2 of 4/);
-  });
-
-  it('a press moves the train and changes the panel itself, so that the conductor can go on', async () => {
-    const made = await setup();
-    const pressed = await made.press('next');
-    expect(made.current().train.stop).toBe(1);
-    // The panel is edited in place: no new answer, no acknowledgement that leaves it as it was.
-    expect(pressed.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    expect(pressed.reply).not.toHaveBeenCalled();
-    expect(pressed.deferUpdate).not.toHaveBeenCalled();
-    expect(shown(pressed.update)).toBe(
-      panelText(`At stop 2 of 4: ${STACKS_BARE}`, `Next is ${MURAL_BARE}`),
-    );
-    // Each press is made with the controls of the panel as it was just drawn.
-    const skipped = await made.press('skip');
-    expect(shown(skipped.update)).toBe(
-      panelText(`At stop 4 of 4: ${FOUNTAIN_BARE}`, 'It is the last stop: Next finishes the route'),
-    );
-    const back = await made.press('previous');
-    expect(shown(back.update)).toMatch(/\nAt stop 3 of 4/);
-    const finished = await made.press('finish');
-    expect(finished.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    expect(shown(finished.update)).toBe(
-      panelText(
-        `The train has finished its route of 4 stops. Previous takes it back to stop 3: ${MURAL_BARE}.`,
-      ),
-    );
-    // The others are told once, where the train ended up.
-    expect(await made.lines()).toEqual([
-      `The train has finished its route. Moved by **Alice** (<@${ALICE}>).`,
-      `<@${REPORTER}> <@${BOB}>`,
-    ]);
-  });
-
-  it('updates the panel with every press of a burst: none is swallowed into a gathered answer', async () => {
-    // The answers to clicks on the post are gathered for two seconds here, as in the bot.
-    const made = await setup([4, 1, 7, 2], 2_000);
-    const joined = await made.click('more');
-    expect(joined.reply).toHaveBeenCalledOnce();
-    // A second click on the post within the window is only acknowledged...
-    const again = await made.click('more');
-    expect(again.deferUpdate).toHaveBeenCalledOnce();
-    // ...but a press in the panel right after it changes the panel.
-    const first = await made.press('next');
-    const second = await made.press('next');
-    for (const pressed of [first, second]) {
-      expect(pressed.update).toHaveBeenCalledOnce();
-      expect(pressed.deferUpdate).not.toHaveBeenCalled();
-      expect(pressed.reply).not.toHaveBeenCalled();
-    }
-    expect(shown(second.update)).toMatch(/\nAt stop 3 of 4/);
-    expect(made.current().train.stop).toBe(2);
-    await made.ctx.clickAnswers.flush();
-  });
-
-  it('moves the train once when two members press Next on panels drawn at the same stop', async () => {
-    const made = await setup();
-    // Both panels were drawn while the train was at the bridge (gym 4).
-    const [alice, bob] = await Promise.all([
-      made.click('next:4:1'),
-      made.click('next:4:1', { userId: BOB, displayName: 'Bob' }),
-    ]);
-    expect(made.current().train.stop).toBe(1);
-    const where = [`At stop 2 of 4: ${STACKS_BARE}`, `Next is ${MURAL_BARE}`];
-    const texts = [shown(alice.update), shown(bob.update)].sort();
-    // One of them moved it; the other is shown where the train is now, with fresh controls.
-    expect(texts).toEqual(
-      [panelText('The train has moved on meanwhile.', ...where), panelText(...where)].sort(),
-    );
-    for (const pressed of [alice, bob]) {
-      expect(customIdsOf(asV2(sent(pressed.update)))).toEqual(customIdsOf(made.panel()));
-    }
-    // A press on the fresh buttons moves it on.
-    const next = await made.press('next', { userId: BOB });
-    expect(shown(next.update)).toMatch(/\nAt stop 3 of 4/);
-    // And `/next` typed twice still moves twice.
-    await Promise.all([made.run('next'), made.run('next', { userId: BOB })]);
-    expect(made.current().train.stop).toBe(4);
-  });
-
-  it('a panel that no longer shows where the train is does not move it', async () => {
-    const made = await setup();
-    // Bob moved the train to the end while Alice had the panel open at the first stop.
-    await made.trains.move(made.party.id, { id: BOB }, 'finish', false);
-    const pressed = await made.click('previous:4');
-    expect(made.current().train.stop).toBe(4);
-    expect(pressed.update).toHaveBeenCalledWith(
-      v2Answer(made.panel('The train has moved on meanwhile.')),
-    );
-    expect(shown(pressed.update)).toBe(
-      panelText(
-        'The train has moved on meanwhile.',
-        `The train has finished its route of 4 stops. Previous takes it back to stop 1: ${BRIDGE_BARE}.`,
-      ),
-    );
-    // From the panel as it is now, Previous works: back to where Bob finished the route from.
-    const back = await made.press('previous');
-    expect(shown(back.update)).toBe(
-      panelText(`At stop 1 of 4: ${BRIDGE_BARE}`, `Next is ${STACKS_BARE}`),
-    );
-    // A button without the place it was drawn at (none is made so) moves nothing either.
-    const bare = await made.click('previous');
-    expect(shown(bare.update)).toMatch(
-      /^### Manage the train\nThe train has moved on meanwhile\.\n/,
-    );
-    expect(made.current().train.stop).toBe(0);
-  });
-
-  it('takes a mistaken Finish back: Previous leads to the stop the train was at, and who is here stays here', async () => {
-    const made = await setup();
-    await made.press('next');
-    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Present);
-    const finished = await made.press('finish');
-    expect(shown(finished.update)).toBe(
-      panelText(
-        `The train has finished its route of 4 stops. Previous takes it back to stop 2: ${STACKS_BARE}.`,
-      ),
-    );
-    expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: gym(1) });
-    const back = await made.press('previous');
-    expect(back.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    expect(shown(back.update)).toBe(
-      panelText(`At stop 2 of 4: ${STACKS_BARE}`, `Next is ${MURAL_BARE}`),
-    );
-    expect(made.current().train).toMatchObject({ stop: 1, finishedFrom: null });
-    // Nobody went anywhere.
-    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
-    // The same by the commands.
-    await made.run('finish');
-    expect(await made.answer('previous')).toBe(
-      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
-    );
-    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
-  });
-
-  it('does not take the train back to another stop than its Previous said', async () => {
-    const made = await setup();
-    await made.press('next');
-    await made.press('finish');
-    // Alice's panel says "Previous takes it back to The Stacks"; Bob takes that stop off.
-    await made.trains.removeStop(made.party.id, { id: BOB }, 2);
-    const pressed = await made.click('previous:end:1');
-    expect(made.current().train).toMatchObject({ route: stops(4, 7, 2), stop: 3 });
-    expect(shown(pressed.update)).toBe(
-      panelText(
-        'That button no longer leads where it said.',
-        `The train has finished its route of 3 stops. Previous takes it back to stop 3: ${FOUNTAIN_BARE}.`,
-      ),
-    );
-    // A Previous without where it leads (none is made so) moves nothing either.
-    const bare = await made.click('previous:end');
-    expect(made.current().train.stop).toBe(3);
-    expect(shown(bare.update)).toMatch(/\nThat button no longer leads where it said\.\n/);
-    // The fresh button leads where the panel now says.
-    const back = await made.press('previous');
-    expect(shown(back.update)).toBe(
-      panelText(`At stop 3 of 3: ${FOUNTAIN_BARE}`, 'It is the last stop: Next finishes the route'),
-    );
-  });
-
-  it('does not take the train back to another stop when the route was finished anew meanwhile', async () => {
-    const made = await setup();
-    await made.press('next');
-    await made.press('finish');
-    // Alice's panel says "Previous takes it back to The Stacks". Bob takes the Finish back,
-    // moves on and finishes the route from the mural: no stop was added or removed.
-    const bob = { id: BOB };
-    await made.trains.move(made.party.id, bob, 'previous', false);
-    await made.trains.move(made.party.id, bob, 'next', false);
-    await made.trains.move(made.party.id, bob, 'finish', false);
-    const pressed = await made.click('previous:end:1');
-    expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: gym(7) });
-    expect(shown(pressed.update)).toBe(
-      panelText(
-        'That button no longer leads where it said.',
-        `The train has finished its route of 4 stops. Previous takes it back to stop 3: ${MURAL_BARE}.`,
-      ),
-    );
-  });
-
-  it('follows the gym, not the number of the stop: an edit that leaves the train where it is keeps the panel good', async () => {
-    const made = await setup();
-    await made.press('next');
-    // The train is at The Stacks (gym 1), which becomes the first stop.
-    await made.trains.removeStop(made.party.id, { id: BOB }, 1);
-    const pressed = await made.click('next:1:7');
-    expect(shown(pressed.update)).toBe(
-      panelText(`At stop 2 of 3: ${MURAL_BARE}`, `Next is ${FOUNTAIN_BARE}`),
-    );
-    // The stop the train is at is removed: the panel drawn there is stale.
-    await made.trains.removeStop(made.party.id, { id: BOB }, 2);
-    const stale = await made.click('next:7');
-    expect(shown(stale.update)).toBe(
-      panelText(
-        'The train has moved on meanwhile.',
-        `At stop 2 of 2: ${FOUNTAIN_BARE}`,
-        'It is the last stop: Next finishes the route',
-      ),
-    );
-    expect(made.current().train).toMatchObject({ route: stops(1, 2), stop: 1 });
-  });
-
-  it('does not move the train to another stop than the button promised', async () => {
-    const made = await setup();
-    // Alice's panel says "Next is The Stacks"; Bob takes The Stacks (gym 1) off the route.
-    expect(firstText(made.panel())).toContain(`Next is ${STACKS_BARE}`);
-    await made.trains.removeStop(made.party.id, { id: BOB }, 2);
-    const pressed = await made.click('next:4:1');
-    expect(made.current().train.stop).toBe(0);
-    expect(pressed.update).toHaveBeenCalledWith(
-      v2Answer(made.panel('That button no longer leads where it said.')),
-    );
-    expect(shown(pressed.update)).toBe(
-      panelText(
-        'That button no longer leads where it said.',
-        `At stop 1 of 3: ${BRIDGE_BARE}`,
-        `Next is ${MURAL_BARE}`,
-      ),
-    );
-    // The fresh buttons lead where the panel now says.
-    const next = await made.press('next');
-    expect(shown(next.update)).toMatch(/\nAt stop 2 of 3/);
-    // Skip promised the stop after the next one: the same.
-    const skip = await setup();
-    await skip.trains.removeStop(skip.party.id, { id: BOB }, 3);
-    const skipped = await skip.click('skip:4:7');
-    expect(skip.current().train.stop).toBe(0);
-    expect(shown(skipped.update)).toMatch(/\nThat button no longer leads where it said\.\n/);
-    // A Next or Skip without what it promised (none is made so) moves nothing either.
-    const bare = await skip.click('next:4');
-    expect(skip.current().train.stop).toBe(0);
-    expect(shown(bare.update)).toMatch(/\nThat button no longer leads where it said\.\n/);
-  });
-
-  it('keeps the ids of its controls within what Discord takes, whatever the ids of the gyms', async () => {
-    const made = await setup();
-    const far = {
-      ...made.current().train,
-      route: stops(4294967295, 4294967294, 4294967293),
-      stop: 0,
-    };
-    await made.store.update(made.party.id, (party) => ({
-      party: party.type === 'train' ? { ...party, train: far } : party,
-    }));
-    const ids = [
-      ...customIdsOf(made.panel()),
-      ...selectsOf(made.panel()).map((menu) => menu.customId),
-    ];
-    expect(ids).toHaveLength(7);
-    for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
-  });
-
-  it('says one sentence for a press that cannot move a finished train', async () => {
-    const made = await setup();
-    await made.press('finish');
-    // The button is switched off, but a press can still arrive.
-    const pressed = await made.click('next:end');
-    expect(pressed.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    expect(shown(pressed.update)).toBe(
-      panelText(
-        `The train has finished its route of 4 stops. Previous takes it back to stop 1: ${BRIDGE_BARE}.`,
-      ),
-    );
-    const first = await setup();
-    const back = await first.click('previous:4');
-    expect(shown(back.update)).toBe(
-      panelText(
-        'This train is at its first stop.',
-        `At stop 1 of 4: ${BRIDGE_BARE}`,
-        `Next is ${STACKS_BARE}`,
-      ),
-    );
-  });
-
-  it('loses its moves when the route is gone, and keeps the kind (plan 8X-4)', async () => {
-    const made = await setup();
-    await made.trains.clearRoute(made.party.id, { id: BOB }, true);
-    const pressed = await made.click('next:4');
-    expect(pressed.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    expect(firstText(made.panel())).toBe(
-      panelText('This train has no route yet. Add its stops with `/route add`.'),
-    );
-  });
-
-  it('loses its controls for who may no longer move the train, and when the train has ended', async () => {
-    const made = await setup();
-    await made.trains.setConductor(made.party.id, { id: BOB });
-    const refused = await made.press('next');
-    expect(refused.update).toHaveBeenCalledWith(
-      v2Answer(panelNote('This train has a conductor: only they and the moderators can move it.')),
-    );
-    expect(made.current().train.stop).toBe(0);
-    await made.attendance.leave(made.party.id, { id: ALICE });
-    await made.trains.clearConductor(made.party.id, { id: BOB }, false);
-    const left = await made.press('next');
-    expect(left.update).toHaveBeenCalledWith(
-      v2Answer(panelNote('You are not signed up for this train.')),
-    );
-    await made.service.end(made.party.id);
-    const over = await made.click('next:4', { userId: BOB });
-    expect(over.update).toHaveBeenCalledWith(v2Answer(panelNote('This train is over.')));
-    expect(sent((await made.click('move', { userId: BOB })).reply).content).toBe(
-      'This train is over.',
-    );
-  });
-
-  it('refuses the controls of a train on a party that is none', async () => {
-    const meetup = await createdMeetup();
-    const before = meetup.current();
-    const { ctx } = createTestContext({
-      partyService: meetup.service,
-      attendance: meetup.attendance,
-      trains: meetup.trains,
-      parties: meetup.store,
-      regions: meetup.regions,
-    });
-    const router = new InteractionRouter(ctx, all, [partyButtons]);
-    const press = async (action: string) => {
-      const pressed = fakeButton({
-        customId: `party:${meetup.party.id}:${action}`,
-        channelId: meetup.postId,
-        userId: REPORTER,
-        messageRows: V2_ROWS,
-      });
-      await router.handle(pressed as never);
-      return pressed;
-    };
-    expect(sent((await press('move')).reply).content).toBe(STALE_COMPONENT);
-    for (const action of ['next:4', 'reverse:4:4']) {
-      expect((await press(action)).update).toHaveBeenCalledWith(
-        v2Answer(panelNote('This train is over.')),
-      );
-    }
-    const picked = fakeSelect({
-      customId: `party:${meetup.party.id}:atend:4`,
-      values: ['loop'],
-      channelId: meetup.postId,
-      userId: REPORTER,
-      messageRows: V2_ROWS,
-    });
-    await router.handle(picked as never);
-    expect(picked.update).toHaveBeenCalledWith(v2Answer(panelNote('This train is over.')));
-    expect(meetup.current()).toBe(before);
-  });
-});
-
-describe('the Manage train panel: what the train does at the end of its route', () => {
-  it('says where Next leads at the last stop of a train that loops or turns back', async () => {
-    const looping = await setup([4, 1, 7, 2], 0, 'loop');
-    for (let n = 0; n < 3; n++) await looping.press('next');
-    expect(firstText(looping.panel())).toBe(
-      panelText(`At stop 4 of 4: ${FOUNTAIN_BARE}`, `Next goes round to ${BRIDGE_BARE}`),
-    );
-    expect(await looping.answer('next')).toBe(
-      `The train is at stop 1 of 4: ${BRIDGE}. Next is ${STACKS}. I am telling the others.`,
-    );
-    const turning = await setup([4, 1, 7, 2], 0, 'turn-back');
-    for (let n = 0; n < 3; n++) await turning.press('next');
-    expect(firstText(turning.panel())).toBe(
-      panelText(`At stop 4 of 4: ${FOUNTAIN_BARE}`, `Next turns back to ${MURAL_BARE}`),
-    );
-    const turned = await turning.press('next');
-    expect(shown(turned.update)).toBe(
-      panelText(`At stop 2 of 4: ${MURAL_BARE}`, `Next is ${STACKS_BARE}`),
-    );
-    expect(turning.current().train).toMatchObject({ route: stops(2, 7, 1, 4), stop: 1 });
-  });
-
-  it('changes the mode with its menu, says so in the post without a ping, and draws the panel anew', async () => {
-    const made = await setup();
-    expect(selectsOf(made.panel())[0]?.options).toEqual([
-      {
-        label: 'Finish at the last stop',
-        value: 'finish',
-        description: 'The train stops at the last stop',
-      },
-      {
-        label: 'Loop: back to the first stop',
-        value: 'loop',
-        description: 'After the last stop comes the first',
-      },
-      {
-        label: 'Turn back at the end',
-        value: 'turn-back',
-        description: 'The route is run backwards from the end',
-      },
-    ]);
-    const picked = await made.pick('loop');
-    expect(made.current().train.atEnd).toBe('loop');
-    expect(picked.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    expect(chosen(made.panel())).toBe('loop');
-    // The mode it has already changes nothing, and the panel is drawn again.
-    const again = await made.pick('loop');
-    expect(again.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    expect(await made.lines()).toEqual([`**Alice** (<@${ALICE}>) set the train to loop.`]);
-    for (const message of made.gateway.messagesIn(made.postId)) {
-      expect(message.message.mention).toBeUndefined();
-    }
-    // The post says it in what lies ahead.
-    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
-      ', and 1 more round the loop',
-    );
-  });
-
-  it('takes the menu for who may arrange the route, and only where the panel was drawn', async () => {
-    const made = await setup();
-    const stranger = await made.pick('loop', { userId: CAROL });
-    expect(stranger.update).toHaveBeenCalledWith(
-      v2Answer(panelNote('You are not signed up for this train.')),
-    );
-    // Bob opened the panel, then Alice became the conductor: the mode never moves the train,
-    // so his pick is taken; the panel is for moving it, which he may no longer, and goes.
-    const bobs = made.panel();
-    await made.trains.setConductor(made.party.id, { id: ALICE });
-    const late = await made.pick('loop', {
-      userId: BOB,
-      displayName: 'Bob',
-      messageRows: bobs.components as FakeRow[],
-    });
-    expect(made.current().train.atEnd).toBe('loop');
-    expect(late.update).toHaveBeenCalledWith(
-      v2Answer(panelNote('This train has a conductor: only they and the moderators can move it.')),
-    );
-    expect((await made.lines()).at(-1)).toBe(`**Bob** (<@${BOB}>) set the train to loop.`);
-    await made.trains.clearConductor(made.party.id, { id: ALICE }, false);
-    await made.trains.setAtEnd(made.party.id, { id: ALICE }, false, 'finish');
-    await made.trains.move(made.party.id, { id: BOB }, 'next', false);
-    const stale = await made.handle(
-      fakeSelect({
-        customId: `party:${made.party.id}:atend:4`,
-        values: ['turn-back'],
-        channelId: made.postId,
-        userId: ALICE,
-        displayName: 'Alice',
-        messageRows: V2_ROWS,
-      }),
-    );
-    expect(made.current().train.atEnd).toBe('finish');
-    expect(shown(stale.update)).toMatch(
-      /^### Manage the train\nThe train has moved on meanwhile\.\n/,
-    );
-    // A value the menu does not offer is a stale control.
-    const odd = await made.pick('bounce');
-    expect(sent(odd.reply).content).toBe(STALE_COMPONENT);
-  });
-
-  it('reverses a route that finishes at its first stop, says so without a ping, and keeps who is here', async () => {
-    const made = await setup();
-    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Present);
-    const pressed = await made.press('reverse');
-    expect(made.current().train).toMatchObject({ route: stops(2, 7, 1, 4), stop: 3 });
-    expect(shown(pressed.update)).toBe(
-      panelText(`At stop 4 of 4: ${BRIDGE_BARE}`, 'It is the last stop: Next finishes the route'),
-    );
-    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
-    const said = await made.lines();
-    expect(said.at(-1)).toBe(
-      `The route was reversed by **Alice** (<@${ALICE}>): it now runs from **Old Stone Fountain** ` +
-        'to **Veterans Memorial Bridge**.',
-    );
-    // A line and no announcement: nobody is pinged.
-    expect(said.filter((line) => line.startsWith('<@'))).toEqual([]);
-    // Reverse is offered at the last stop too, and back it goes.
-    await made.press('reverse');
-    expect(made.current().train).toMatchObject({ route: stops(4, 1, 7, 2), stop: 0 });
-  });
-
-  it('reverses once for a panel: a second press, or a panel drawn before another Reverse, does nothing', async () => {
-    const made = await setup();
-    const bobs = made.panel();
-    const first = await made.press('reverse');
-    expect(made.current().train).toMatchObject({ route: stops(2, 7, 1, 4), stop: 3 });
-    // The same button once more (a double press, or the old panel kept): the route stays.
-    const again = await made.click('reverse:4:4');
-    expect(made.current().train).toMatchObject({ route: stops(2, 7, 1, 4), stop: 3 });
-    expect(shown(again.update)).toBe(
-      panelText(
-        'That button no longer leads where it said.',
-        `At stop 4 of 4: ${BRIDGE_BARE}`,
-        'It is the last stop: Next finishes the route',
-      ),
-    );
-    expect(shown(first.update)).toBe(
-      panelText(`At stop 4 of 4: ${BRIDGE_BARE}`, 'It is the last stop: Next finishes the route'),
-    );
-    // Bob's panel was drawn before Alice's Reverse.
-    const reverse = customIdsOf(bobs).find((id) => id.includes(':reverse:')) ?? '';
-    const stale = await made.handle(
-      fakeButton({
-        customId: reverse,
-        channelId: made.postId,
-        userId: BOB,
-        displayName: 'Bob',
-        messageRows: bobs.components as FakeRow[],
-      }),
-    );
-    expect(made.current().train).toMatchObject({ route: stops(2, 7, 1, 4), stop: 3 });
-    expect(shown(stale.update)).toMatch(/\nThat button no longer leads where it said\.\n/);
-    expect((await made.lines()).filter((line) => /reversed/.test(line))).toHaveLength(1);
-  });
-
-  it('offers Reverse where it may be done: at either end of a route that finishes, anywhere on a loop', async () => {
-    const made = await setup();
-    const offered = () => customIdsOf(made.panel()).some((id) => id.includes(':reverse:'));
-    expect(offered()).toBe(true);
-    await made.press('next');
-    expect(offered()).toBe(false);
-    // A press on a Reverse drawn at the first stop moves nothing now.
-    const stale = await made.click('reverse:4:4');
-    expect(shown(stale.update)).toMatch(/\nThe train has moved on meanwhile\.\n/);
-    const here = await made.click('reverse:1:4');
-    expect(shown(here.update)).toMatch(
-      /\nThe route of this train can be reversed only at its first or last stop\.\n/,
-    );
-    await made.pick('loop');
-    expect(offered()).toBe(true);
-    await made.pick('turn-back');
-    expect(offered()).toBe(false);
-    // A route finished from its last stop starts again from there.
-    const finished = await setup([4, 1]);
-    await finished.press('next');
-    await finished.press('next');
-    expect(customIdsOf(finished.panel())).toContain(`party:${finished.party.id}:reverse:end:4`);
-    const restarted = await finished.press('reverse');
-    expect(finished.current().train).toMatchObject({ route: stops(1, 4), stop: 0 });
-    expect(shown(restarted.update)).toBe(
-      panelText(`At stop 1 of 2: ${STACKS_BARE}`, `Next is ${BRIDGE_BARE}`),
-    );
-  });
-
-  it('stays within what Discord takes with the longest names, every control shown', async () => {
-    const made = await setup([4, 1, 7, 2], 0, 'loop');
-    const heavy = (id: number): PostGym => ({
-      name: `${'[*]'.repeat(84)}${id}`,
-      nickname: null,
-      lat: 40,
-      lon: -80,
-      notice: null,
-      taggedEx: true,
-      confirmedEx: false,
-    });
-    const panel = trainPanel(
-      { party: made.current(), stop: stopsFrom({ get: heavy }) },
-      'That button no longer leads where it said.',
-    );
-    expectV2Sendable(panel);
-    expect(customIdsOf(panel)).toHaveLength(5);
-  });
-
-  it('answers a press on a plain-text panel sent before this version with the new panel below it', async () => {
-    const made = await setup();
-    const old = await made.press('next', { messageRows: CLASSIC_ROWS });
-    expect(made.current().train.stop).toBe(1);
-    expect(old.update).toHaveBeenCalledWith({ content: OLD_PANEL, components: [] });
-    expect(old.followUp).toHaveBeenCalledWith({
-      components: made.panel().components,
-      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
-    });
-    // A refusal on one is the same: a line, and the panel as things stand below it.
-    const stale = await made.click('next:4:1', { messageRows: CLASSIC_ROWS });
-    expect(stale.update).toHaveBeenCalledWith({ content: OLD_PANEL, components: [] });
-    expect(shown(stale.followUp)).toMatch(/\nThe train has moved on meanwhile\.\n/);
-  });
-});
-
-describe('the Manage train panel: what the train goes to (plan 8X-4)', () => {
-  /** A choice in the menu of the kind of the panel as it is drawn now, by Alice. */
-  const pickKind = (made: Awaited<ReturnType<typeof setup>>, value: string, extra: object = {}) => {
-    const menu = selectsOf(made.panel()).find((one) => one.customId.endsWith(':kind'));
-    if (!menu) throw new Error('the panel has no menu of the kind');
-    return made.handle(
-      fakeSelect({
-        customId: menu.customId,
-        values: [value],
-        channelId: made.postId,
-        userId: ALICE,
-        displayName: 'Alice',
-        messageRows: made.panel().components as FakeRow[],
-        ...extra,
-      }),
-    );
-  };
-
-  it('changes the kind, says so in the post, and draws the panel anew', async () => {
-    const made = await setup();
-    const picked = await pickKind(made, 'gigantamax');
-    expect(made.current().train.kind).toBe('gigantamax');
-    expect(picked.update).toHaveBeenCalledWith(v2Answer(made.panel()));
-    expect((await made.lines()).at(-1)).toBe(
-      `**Alice** (<@${ALICE}>) made this a Gigantamax Train.`,
-    );
-    // The post says it at once, and is tagged as a max battle.
-    const post = made.gateway.posts.get(made.postId);
-    expect(header(post?.message)[0]).toBe('### Gigantamax Train: Saturday legendaries');
-    const tags = made.gateway.forums.get(WEST_FORUM)?.tags ?? {};
-    const named = (post?.tagIds ?? []).map((id) =>
-      Object.keys(tags).find((name) => tags[name] === id),
-    );
-    expect(named).toEqual(['Train', 'Max battle']);
-    // The same kind again changes nothing and says nothing.
-    const before = (await made.lines()).length;
-    await pickKind(made, 'gigantamax');
-    expect(await made.lines()).toHaveLength(before);
-  });
-
-  it('changes the tags and the lobby with the kind at once, both ways', async () => {
-    const made = await setup();
-    const tagsNow = async (): Promise<(string | undefined)[]> => {
-      await made.service.flush();
-      const tags = made.gateway.forums.get(WEST_FORUM)?.tags ?? {};
-      return (made.gateway.posts.get(made.postId)?.tagIds ?? []).map((id) =>
-        Object.keys(tags).find((name) => tags[name] === id),
-      );
-    };
-    const groupLine = () =>
-      textDisplays(made.gateway.posts.get(made.postId)?.message).find((text) =>
-        /coming|trainer/.test(text),
-      );
-    await pickKind(made, 'gigantamax');
-    expect(await tagsNow()).toEqual(['Train', 'Max battle']);
-    // A Gigantamax lobby at once: the group's line counts against it.
-    expect(groupLine()).toMatch(/\/100 coming/);
-    await pickKind(made, 'dynamax');
-    expect(await tagsNow()).toEqual(['Train', 'Max battle']);
-    expect(groupLine()).not.toMatch(/\/\d+ coming/);
-    await pickKind(made, 'raid');
-    expect(await tagsNow()).toEqual(['Train']);
-    expect(groupLine()).not.toMatch(/\/\d+ coming/);
-  });
-
-  it('is for who may move the train: a member who may not gets why, and a stale value nothing', async () => {
-    const made = await setup();
-    await made.trains.setConductor(made.party.id, { id: BOB });
-    const bobs = made.panel();
-    const refused = await pickKind(made, 'dynamax', { messageRows: bobs.components as FakeRow[] });
-    expect(made.current().train.kind).toBe('raid');
-    expect(refused.update).toHaveBeenCalledWith(
-      v2Answer(panelNote('This train has a conductor: only they and the moderators can move it.')),
-    );
-    const odd = await pickKind(made, 'carnival', { userId: BOB, displayName: 'Bob' });
-    expect(sent(odd.reply).content).toBe(STALE_COMPONENT);
-    expect(made.current().train.kind).toBe('raid');
-  });
-});
diff --git a/src/commands/trains/move.ts b/src/commands/trains/move.ts
index 5a6c95777bcbca8e2fccc980ae008541993aa95a..8ef39c608e64682a092f5ce70dcc0799be171efa 100644
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -3,27 +3,39 @@ import {
   SlashCommandBuilder,
   type ButtonInteraction,
   type ChatInputCommandInteraction,
-  type MessageComponentInteraction,
   type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
-import { deferSubmit, withoutOpenToken } from '../../discord/dialog.js';
+import { deferSubmit, pickedOf, selectedOf, withoutOpenToken } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { isStaff, requireTrain } from '../../discord/guards.js';
-import { v2Answer } from '../../discord/late-reply.js';
-import type { V2Message } from '../../discord/party-gateway.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
-import { isTrain, isTrainAtEnd, isTrainKind } from '../../domain/party/party.js';
+import {
+  isTrain,
+  TRAIN_AT_END,
+  TRAIN_KINDS,
+  type TrainAtEnd,
+  type TrainKind,
+  type TrainParty,
+} from '../../domain/party/party.js';
 import { mayNotMove, type TrainMove } from '../../domain/party/train.js';
 import {
+  AT_END_CODES,
   isDialogMove,
+  KIND_CODES,
+  MANAGE_AT_END_INPUT,
+  MANAGE_KIND_INPUT,
+  MANAGE_ROUTE_INPUT,
+  manageDialog,
   MOVE_INPUT,
   moveDialog,
+  NO_FIRST,
+  ROUTE_CHOICES,
   type DialogMove,
 } from '../../render/train-dialogs.js';
-import { panelNote, trainPanel, whereText } from '../../render/train-panel.js';
-import type { TrainChangeOutcome } from '../../services/train-service.js';
+import { atEndSentence, trainKindSentence, whereText } from '../../render/train-words.js';
+import type { TrainManage } from '../../services/train-service.js';
 import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
 import { moveTrainAs, trainPlaces, trainRefusal } from './train-changes.js';
@@ -58,7 +70,8 @@ async function moveByCommand(
 
 /**
  * One of the four commands that move a train. `details` says what the move is; `here` says what
- * becomes of who was here, where that is not the rule of the others.
+ * becomes of who was here, where that is not the rule of the others. The help names the post's
+ * button that does the same (plan 8X-G: Move…, and Manage… for Finish).
  */
 function moveCommand(
   name: string,
@@ -68,6 +81,12 @@ function moveCommand(
   here = 'Everybody who was here is coming again (not once the route is finished: there is ' +
     'nowhere to come to)',
 ): SimpleCommand {
+  const button =
+    move === 'finish'
+      ? 'The same as "Finish it here" in the dialog of the button "Manage…" on the post, which ' +
+        'also reverses the route, sets what the train does at its end and what it is mainly for.'
+      : 'The same as the button "Move…" on the post; its button "Manage…" also reverses the ' +
+        'route, finishes it and sets what the train does at its end.';
   return {
     data: new SlashCommandBuilder().setName(name).setDescription(description),
     help: {
@@ -76,8 +95,7 @@ function moveCommand(
         `${details} ${here}, and the others are told where ` +
         'the train is going, with a ping for those who allow it. While the train has a ' +
         'conductor, only they and the moderators can move it; otherwise anybody who is signed ' +
-        'up can. The same as the button "Manage train…" on the post, whose panel also reverses ' +
-        'the route and sets what the train does at its end. Use it in the post of the train.',
+        `up can. ${button} Use it in the post of the train.`,
       examples: [`/${name}`],
     },
     guards: [requireTrain],
@@ -91,7 +109,7 @@ export const next = moveCommand(
   'next',
   'Move this train to its next stop',
   'Takes the train to the next stop of its route. From the last stop it finishes the route, ' +
-    'or, as the train is set (`/train at-end`, or the menu of the panel), goes round to the ' +
+    'or, as the train is set (`/train at-end`, or Manage… on the post), goes round to the ' +
     'first stop (loop) or turns back and runs the route backwards (turn back).',
 );
 
@@ -122,53 +140,57 @@ export const finish = moveCommand(
     '`/previous` takes a mistaken finish back.',
 );
 
-/**
- * The button "Manage train…" of a train's post: answers the member who pressed it, privately,
- * with the panel that moves the train (a components-v2 message, `trainPanel`). Who may not move
- * it is told so in the place of the panel. A train without a route (one planned ahead) gets the
- * panel of what applies to it, its kind (plan 8X-4). Not a click that is gathered (`answerClick`): every press
- * gets a panel of its own.
- */
-export async function openTrainPanel(
+/** The train of a press, for who may move it (also staff), refused privately otherwise. */
+function movableTrain(
   interaction: ButtonInteraction,
   ctx: AppContext,
   partyId: string,
-): Promise<void> {
+): TrainParty {
   const party = ctx.parties.get(partyId);
-  // Only the post of a train has this button.
   if (!party) throw new UserError(partyOver(A_TRAIN));
   if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
   const problem = mayNotMove(party, interaction.user.id, isStaff(interaction, ctx));
   if (problem) throw new UserError(refusal(ctx, problem));
-  await interaction.reply({
-    components: trainPanel(trainPlaces(ctx, party)).components,
-    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
-  });
+  return party;
 }
 
 /**
  * Move… of a train's post (plan 8X-G; `party:<id>:move`, also the button "Manage train…" of a
  * post not drawn anew since): for who may move the train (`mayNotMove`, refused privately before
  * it opens), the dialog of the moves that can be made from where it is (`moveDialog`). A train
- * without a route has nothing to move along: it gets what applies to it.
+ * without a route has nothing to move along: the old button opens Manage… there (review R15).
  */
 export async function openMove(
   interaction: ButtonInteraction,
   ctx: AppContext,
   partyId: string,
 ): Promise<void> {
-  const party = ctx.parties.get(partyId);
-  if (!party) throw new UserError(partyOver(A_TRAIN));
-  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
-  const problem = mayNotMove(party, interaction.user.id, isStaff(interaction, ctx));
-  if (problem) throw new UserError(refusal(ctx, problem));
-  if (party.train.route.length === 0) return openTrainPanel(interaction, ctx, partyId);
-  await interaction.showModal(moveDialog({ ...trainPlaces(ctx, party), now: Date.now() }));
+  const party = movableTrain(interaction, ctx, partyId);
+  const view = { ...trainPlaces(ctx, party), now: Date.now() };
+  await interaction.showModal(
+    party.train.route.length === 0 ? manageDialog(view) : moveDialog(view),
+  );
 }
 
-/** What a Submit of Move… is told when the train moved on, or its route changed, meanwhile. */
+/**
+ * Manage… of a train's post (plan 8X-G; `party:<id>:manage`): for who may move the train and
+ * staff, the dialog of its route, its mode at the end and its kind (`manageDialog`).
+ */
+export async function openManage(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  partyId: string,
+): Promise<void> {
+  const party = movableTrain(interaction, ctx, partyId);
+  await interaction.showModal(manageDialog({ ...trainPlaces(ctx, party), now: Date.now() }));
+}
+
+/** What a Submit is told when the train moved on, or its route changed, since it opened. */
 const MOVED_ON = 'The train has moved on since you opened this: ';
 
+/** The refusals of a change that the train's moving on, or its route's change, explain. */
+const STALE_MOVES: ReadonlySet<string> = new Set(['train-moved-on', 'route-changed']);
+
 /**
  * The move a Submit of Move… asks for and where it leads: the dialog's id carries them where it
  * had one move left, else the radio choice does (`<move>:<target>`). Undefined for anything
@@ -190,6 +212,23 @@ function askedMove(
   return isDialogMove(move) && target !== undefined ? { from, move, target } : undefined;
 }
 
+/**
+ * The words of a refusal of a Submit: where the train moved on, or its route changed, since the
+ * dialog opened, where it is now (`MOVED_ON`); otherwise as the commands say it.
+ */
+function submitRefusal(
+  ctx: AppContext,
+  partyId: string,
+  reason: string | undefined,
+  text: string,
+): string {
+  const now = ctx.parties.get(partyId);
+  if (reason !== undefined && STALE_MOVES.has(reason) && now && isTrain(now)) {
+    return `${MOVED_ON}${whereText(trainPlaces(ctx, now))}`;
+  }
+  return text;
+}
+
 /**
  * Submit of Move… (`party:<id>:moveform:…`): acknowledged privately, then the move made as
  * `/next` and the others make it (`moveTrainAs`, with where the train was when the dialog opened
@@ -219,169 +258,107 @@ export async function submitMove(
     asked.from,
     asked.target,
   );
-  if (answer.kind === 'refused' && answer.reason !== undefined && STALE_MOVES.has(answer.reason)) {
-    const now = ctx.parties.get(partyId);
-    if (now && isTrain(now))
-      return void (await say(`${MOVED_ON}${whereText(trainPlaces(ctx, now))}`));
-  }
-  await say(answer.text);
+  await say(
+    answer.kind === 'refused'
+      ? submitRefusal(ctx, partyId, answer.reason, answer.text)
+      : answer.text,
+  );
 }
 
-/** The refusals of a move that the train's moving on, or its route's change, explain. */
-const STALE_MOVES: ReadonlySet<string> = new Set(['train-moved-on', 'route-changed']);
-
-/** What an old panel says once a press has put the new one below it. */
-export const OLD_PANEL = 'This panel was replaced by the one below.';
-
-/**
- * Shows `message` in the place of the panel that was pressed (`update`). A panel sent before
- * plan 8B-3 is plain text. Whether Discord takes a components-v2 interaction update of a
- * classic message is not known, and it is not tried: that panel is closed with a line
- * (`OLD_PANEL`), and the panel comes anew, privately, below it, which is the safe path.
- */
-async function showPanel(
-  interaction: MessageComponentInteraction,
-  message: V2Message,
-): Promise<void> {
-  if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
-    await interaction.update(v2Answer(message));
-    return;
-  }
-  await interaction.update({ content: OLD_PANEL, components: [] });
-  await interaction.followUp({
-    components: message.components,
-    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
-  });
-}
+/** The mode and the kind of a train by the letters Manage…'s custom id gives them. */
+const AT_END_OF_CODE = new Map(TRAIN_AT_END.map((atEnd) => [AT_END_CODES[atEnd], atEnd]));
+const KIND_OF_CODE = new Map(TRAIN_KINDS.map((kind) => [KIND_CODES[kind], kind]));
 
 /**
- * What a press on the panel answers, once the train service has decided (`outcome`): the panel
- * as things stand now, so that the member can go on from it. Never a gathered answer: this
- * message is the panel.
- *
- * A press that changed nothing because the panel no longer fits (somebody else moved the train,
- * the stop it was at was removed, the route was edited so that a move would lead elsewhere, or
- * finished from another stop, which changes where Previous leads) shows the reason above where
- * the train is now, with fresh controls, so that two members who press Next on the same stop
- * move the train once. So does one that cannot be done from where the train is (not for a
- * finished route, which the panel says itself). A member who may no longer move the train and a
- * train that has ended lose the controls (`panelNote`); a train without a route keeps its kind menu.
+ * What a Submit of Manage… asks: where the train was, the stop the route began with, and each
+ * part only where it was picked otherwise than the dialog showed it (review R5). Undefined for
+ * a dialog of another shape or a forged one.
  */
-async function answerPanel(
-  interaction: MessageComponentInteraction,
-  ctx: AppContext,
-  partyId: string,
-  staff: boolean,
-  outcome: TrainChangeOutcome,
-): Promise<void> {
-  if (outcome.kind === 'gone') {
-    await showPanel(interaction, panelNote(partyOver(A_TRAIN)));
-    return;
-  }
-  if (outcome.kind === 'ok') {
-    // The mode may be set by who may not move the train (a member who is not the conductor):
-    // the panel is for moving it, so they get why they may not instead.
-    const cannot = mayNotMove(outcome.party, interaction.user.id, staff);
-    await showPanel(
-      interaction,
-      cannot ? panelNote(refusal(ctx, cannot)) : trainPanel(trainPlaces(ctx, outcome.party)),
-    );
-    return;
-  }
-  const why = refusal(ctx, outcome.reason);
-  const party = ctx.parties.get(partyId);
-  if (!party || !isTrain(party) || mayNotMove(party, interaction.user.id, staff)) {
-    await showPanel(interaction, panelNote(why));
-    return;
-  }
-  // That the route is finished, or that there is none, is what the panel says of where the
-  // train is: once is enough.
-  const note =
-    outcome.reason === 'route-finished' || party.train.route.length === 0 ? undefined : why;
-  await showPanel(interaction, trainPanel(trainPlaces(ctx, party), note));
+function askedManage(
+  interaction: ModalSubmitInteraction,
+  args: readonly string[],
+): { from: string; first: string; asked: TrainManage } | undefined {
+  const [from, first, shownAtEnd, shownKind] = withoutOpenToken(args);
+  const wasAtEnd = AT_END_OF_CODE.get(shownAtEnd ?? '');
+  const wasKind = KIND_OF_CODE.get(shownKind ?? '');
+  if (from === undefined || first === undefined || !wasAtEnd || !wasKind) return undefined;
+  const kind = selectedOf<TrainKind>(interaction, MANAGE_KIND_INPUT, TRAIN_KINDS);
+  if (kind === undefined) return undefined;
+  const hasRoute = first !== NO_FIRST;
+  const atEnd = hasRoute
+    ? selectedOf<TrainAtEnd>(interaction, MANAGE_AT_END_INPUT, TRAIN_AT_END)
+    : wasAtEnd;
+  if (atEnd === undefined) return undefined;
+  // "The route" is left out where only Keep was left.
+  const route = interaction.fields.fields.has(MANAGE_ROUTE_INPUT)
+    ? pickedOf(interaction, MANAGE_ROUTE_INPUT, ROUTE_CHOICES)
+    : 'keep';
+  if (route === undefined) return undefined;
+  return {
+    from,
+    first,
+    asked: {
+      ...(kind === wasKind ? {} : { kind }),
+      ...(route === 'keep' ? {} : { route }),
+      ...(atEnd === wasAtEnd ? {} : { atEnd }),
+    },
+  };
 }
 
-/**
- * A press on a move of the panel (`party:<id>:<move>:<from>[:<target>]`): moves the train, and
- * changes the panel itself to how things stand now (`answerPanel`). `from` is where the train
- * was when the panel was drawn, which the button carries; `target` is where Next, Previous or
- * Skip led then (at the end of a route that loops or turns back, the gym that comes then). The
- * store decides, inside the change.
- */
-export async function pressTrainPanel(
-  interaction: MessageComponentInteraction,
-  ctx: AppContext,
-  partyId: string,
-  move: TrainMove,
-  from: string | undefined,
-  target?: string,
-): Promise<void> {
-  const member = actingMember(interaction);
-  const staff = isStaff(interaction, ctx);
-  // No place names an empty text: a press without one finds the train moved on. Every move
-  // but Finish also says where it leads, and a press without that finds the route changed.
-  const promised = move === 'finish' ? undefined : (target ?? '');
-  const outcome = await ctx.trains.move(partyId, member, move, staff, from ?? '', promised);
-  await answerPanel(interaction, ctx, partyId, staff, outcome);
-}
+/** What a Submit of Manage… that changes nothing is told. */
+const NOTHING_CHANGED = 'Nothing changed.';
 
-/**
- * "Reverse the route" of the panel (`party:<id>:reverse:<from>:<first>`): the route in the other
- * order, the train at the same gym (`TrainService.reverse`). No movement: nobody is pinged, and
- * the post says it in a line. Refused, with the panel drawn anew, where the train is no longer
- * where the panel was drawn (`from`), where the route no longer begins with the gym it began
- * with then (`first`: a second press of one panel, or a panel drawn before another member's
- * Reverse, would flip it back), or where the route may not be reversed from there. A button
- * without either (none is made so) is refused like a stale one.
- */
-export async function pressReverse(
-  interaction: MessageComponentInteraction,
+/** What a Submit of Manage… says it did, in the words of the commands and of the map. */
+function managedWords(
   ctx: AppContext,
-  partyId: string,
-  from: string | undefined,
-  first: string | undefined,
-): Promise<void> {
-  const member = actingMember(interaction);
-  const staff = isStaff(interaction, ctx);
-  const outcome = await ctx.trains.reverse(partyId, member, staff, from ?? '', first ?? '');
-  await answerPanel(interaction, ctx, partyId, staff, outcome);
+  party: TrainParty,
+  done: { kindSet: boolean; route?: 'reversed' | 'finished'; atEndSet: boolean },
+): string {
+  const said = [
+    done.kindSet ? trainKindSentence(party.train.kind) : undefined,
+    done.route === 'reversed' ? 'The route is reversed.' : undefined,
+    done.route === 'finished' ? 'The route is finished.' : undefined,
+    done.atEndSet ? atEndSentence(party.train.atEnd) : undefined,
+    done.route === undefined ? undefined : whereText(trainPlaces(ctx, party)),
+  ].filter((sentence) => sentence !== undefined);
+  return said.length === 0 ? NOTHING_CHANGED : said.join(' ');
 }
 
 /**
- * The menu "At the end of the route" of the panel (`party:<id>:atend:<from>`): sets what the
- * train does at the end of its route (`TrainService.setAtEnd`), for whoever may arrange it, and
- * draws the panel anew. The mode the train has already changes nothing and redraws. A value the
- * menu does not offer is a stale control.
+ * Submit of Manage… (`party:<id>:manageform:…`): acknowledged privately, then what was picked
+ * otherwise than shown applied as one change (`TrainService.manage`: the kind, the route, the
+ * mode, all or nothing), answered with what it did; nothing picked otherwise is "Nothing
+ * changed." A route change from a dialog opened before the train moved on, or its route
+ * changed, is refused with where the train is now.
  */
-export async function pressAtEnd(
-  interaction: MessageComponentInteraction & { values: readonly string[] },
-  ctx: AppContext,
-  partyId: string,
-  from: string | undefined,
-): Promise<void> {
-  const [chosen] = interaction.values;
-  if (!isTrainAtEnd(chosen)) throw new UserError(STALE_COMPONENT);
-  const member = actingMember(interaction);
-  const staff = isStaff(interaction, ctx);
-  const outcome = await ctx.trains.setAtEnd(partyId, member, staff, chosen, from ?? '');
-  await answerPanel(interaction, ctx, partyId, staff, outcome);
-}
-
-/**
- * The menu "What the train goes to" of the panel (`party:<id>:kind`, plan 8X-4): sets the kind of
- * the train (`TrainService.setKind`), for who may move it and staff, and draws the panel anew. The
- * kind the train has already changes nothing and redraws. A value the menu does not offer is a
- * stale control.
- */
-export async function pressKind(
-  interaction: MessageComponentInteraction & { values: readonly string[] },
+export async function submitManage(
+  interaction: ModalSubmitInteraction,
   ctx: AppContext,
   partyId: string,
+  args: readonly string[],
 ): Promise<void> {
-  const [chosen] = interaction.values;
-  if (!isTrainKind(chosen)) throw new UserError(STALE_COMPONENT);
-  const member = actingMember(interaction);
-  const staff = isStaff(interaction, ctx);
-  const outcome = await ctx.trains.setKind(partyId, member, staff, chosen);
-  await answerPanel(interaction, ctx, partyId, staff, outcome);
+  const asked = askedManage(interaction, args);
+  if (!asked) throw new UserError(STALE_COMPONENT);
+  await deferSubmit(interaction);
+  const say = (content: string) => interaction.editReply({ content });
+  const party = ctx.parties.get(partyId);
+  if (!party) return void (await say(partyOver(A_TRAIN)));
+  if (!isTrain(party)) return void (await say(STALE_COMPONENT));
+  if (Object.keys(asked.asked).length === 0) return void (await say(NOTHING_CHANGED));
+  const outcome = await ctx.trains.manage(
+    partyId,
+    actingMember(interaction),
+    isStaff(interaction, ctx),
+    asked.asked,
+    { from: asked.from, first: asked.first },
+  );
+  if (outcome.kind === 'gone') return void (await say(partyOver(A_TRAIN)));
+  if (outcome.kind === 'refused') {
+    const text = refusal(ctx, outcome.reason);
+    const words = submitRefusal(ctx, partyId, outcome.reason, text);
+    // Of several parts asked, none was applied: said, as one refusal refuses all (review r0 B2).
+    const several = Object.keys(asked.asked).length > 1;
+    return void (await say(several ? `${words} Nothing was changed.` : words));
+  }
+  await say(managedWords(ctx, outcome.party, outcome));
 }
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index cb6ca21d92fc163cf682fc8d055b78ef0d718f3b..738003c41a2938c721ff9cc5aa151a9747139969 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -103,7 +103,7 @@ const show: SubcommandPart = {
       'Shows you every stop in order: those the train has left struck through, the one it is ' +
       'at marked, each a link to Google Maps, and what the train does ' +
       'at the end of a route of two stops or more. The post shows where the train is and the ' +
-      'next stops (a route of three stops or fewer whole); its button "Whole route" shows ' +
+      'next stops (a route of three stops or fewer whole); its button "Route" shows ' +
       'you this list too.',
     examples: ['/route show'],
   },
@@ -114,7 +114,7 @@ const show: SubcommandPart = {
 };
 
 /**
- * The route of a train as `/route show` and the button "Whole route" of its post answer it, the
+ * The route of a train as `/route show` and the button "Route" of its post answer it, the
  * texts of one or more private messages: every stop a link to its place (the answer has no Map of
  * its own), what the train does at the end of a route of two stops or more; a sentence for a
  * train without a route.
@@ -146,7 +146,7 @@ async function showRoute(
 }
 
 /**
- * The button "Whole route" of a train's post (Matt, 2026-10-17): the route privately, exactly as
+ * The button "Route" of a train's post (Matt, 2026-10-17): the route privately, exactly as
  * `/route show` answers it, to anybody, also on a copy of the post in another channel (the train
  * is the one the button names). A train that ended answers as the other controls of a post do;
  * a party that is no train never had the button.
@@ -761,7 +761,7 @@ export const route = commandGroup({
       'Use it in the post of the train. A stop is a gym or a power spot. The current stop ' +
       'follows its place through every change of the route: the train stays where it is. A saved route keeps the order of its stops ' +
       'and what the train does at its end (finish, loop or turn back); loading it sets both. ' +
-      'The route is reversed in the panel of the button "Manage train…".',
+      'The route is reversed, or finished, in the dialog of the button "Manage…" on the post.',
   },
   guards: [requireTrain],
   parts: [show, add, remove, move, clear, save, load, forget],
diff --git a/src/commands/trains/split.test.ts b/src/commands/trains/split.test.ts
index 8ff74175fe9d41275c5c0b43e700bc749b3b0a7d..00cfd0549ad35ac46863db6cb4264c4d8a23dc1d 100644
--- a/src/commands/trains/split.test.ts
+++ b/src/commands/trains/split.test.ts
@@ -412,7 +412,7 @@ describe('a Submit of the dialog', () => {
     await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, 'Slow');
     const submitted = await made.submit(before);
     expect(answerOf(submitted)).toBe(
-      'The groups of this train changed meanwhile: press Split group… again.',
+      'The groups of this train changed meanwhile: press Split… again.',
     );
     expect(made.store.active()).toHaveLength(1);
   });
@@ -437,7 +437,7 @@ describe('a Submit of the dialog', () => {
     await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, 'Slow');
     const submitted = await made.submit(dialog, pick, STAFF);
     expect(answerOf(submitted)).toBe(
-      'The groups of this train changed meanwhile: press Split group… again.',
+      'The groups of this train changed meanwhile: press Split… again.',
     );
     expect(made.store.active()).toHaveLength(1);
   });
@@ -594,7 +594,7 @@ describe('/help group split', () => {
     const page = await ask('group split');
     expect(page).toMatch(/^### \/group split/u);
     expect(page).toContain('/group split letter:B');
-    expect(page).toContain('Split group…');
+    expect(page).toContain('"Split…"');
     expect(page).toContain('You are asked first, in a dialog.');
     expect((await ask('group')).split('\n')).toContain(
       '`/group split <letter>` Split a group off this train into a train of its own',
diff --git a/src/commands/trains/split.ts b/src/commands/trains/split.ts
index 330f3d33cd82452337cc9aee8b38708712f98595..3d00ae48be8c40c0c8012e9c98f23ea82a0eb4c3 100644
--- a/src/commands/trains/split.ts
+++ b/src/commands/trains/split.ts
@@ -33,7 +33,7 @@ import { DISCORD_NAMES } from '../raids/report.js';
 import { splitGroupAs, splitRefusal, trainRefusal } from './train-changes.js';
 
 /*
- * Splitting a group off a train (plans 8T, 8T-H) on Discord: the post's "Split group…" and
+ * Splitting a group off a train (plans 8T, 8T-H) on Discord: the post's "Split…" and
  * `/group split` open a dialog (`splitDialog`), whose Submit splits (`splitGroupAs`); Discord's
  * own Cancel closes it. The button and the dialog are the party's controls (`party:<id>:split`,
  * `party:<id>:splitform[:<group>:<mark>]`), with the party controls' guards and
@@ -46,7 +46,7 @@ const A_TRAIN = { type: 'train' } as const;
 const SPLIT_FAILED = 'The split did not work: nothing was split off.';
 
 /** What a Submit answers for a group called otherwise, or gone, since the dialog opened. */
-const GROUPS_CHANGED = 'The groups of this train changed meanwhile: press Split group… again.';
+const GROUPS_CHANGED = 'The groups of this train changed meanwhile: press Split… again.';
 
 /**
  * The dialog for this member, of these groups, as things stand now; who leads the new train as
@@ -95,7 +95,7 @@ function whyNot(ctx: AppContext, party: TrainParty, memberId: string, staff: boo
 }
 
 /**
- * "Split group…" of a train's post: the dialog of the one group the member may split, or the
+ * "Split…" of a train's post: the dialog of the one group the member may split, or the
  * one that asks which when they may split several (the conductor, staff: `splittableGroups`, in
  * the post's order); why not, privately, when they may split none. The dialog is the first
  * answer: nothing is deferred before it.
@@ -219,7 +219,7 @@ export const splitGroupPart: SubcommandPart = {
       "group's members moved there. Both posts link the other, and the members who moved are " +
       'pinged in the new one. You are asked first, in a dialog. A member of the group may split ' +
       'it off, unless the conductor is in it; the conductor and the moderators may split any ' +
-      'group. The same as the button "Split group…" on the post. Only in the post of a train.',
+      'group. The same as the button "Split…" on the post. Only in the post of a train.',
     examples: ['/group split letter:B'],
   },
   throttle: ACTION_THROTTLE,
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index 8e0eb7e347c2eda22455f2f16c5b00641bb1d0c8..1d7b989797185eccade8ba72a01167c10d103086 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -20,9 +20,8 @@ import { noPostWords, problemText } from '../../render/activity.js';
 import { groupWords } from '../../render/party-controls.js';
 import { stopInWords, stopsFrom } from '../../render/train-stops.js';
 import { count, memberText, plain } from '../../render/text.js';
-import { whereText } from '../../render/train-panel.js';
 import type { TrainPlaces } from '../../render/train-post.js';
-import { atEndSentence, trainKindSentence } from '../../render/train-words.js';
+import { atEndSentence, trainKindSentence, whereText } from '../../render/train-words.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { TrainOutcome } from '../../services/party-service.js';
 import type { TrainChangeOutcome } from '../../services/train-service.js';
@@ -391,9 +390,9 @@ export async function moveTrainAs(
 }
 
 /**
- * Reverses the route as "Reverse the route" of the Manage train panel does (`TrainService.reverse`,
+ * Reverses the route as "Reverse the route" of the map's panel does (`TrainService.reverse`,
  * with where the panel was drawn and the gym the route began with then), and says where the
- * train is now: the map's panel, whose answer is words (the post's panel draws itself anew).
+ * train is now: the map's panel, whose answer is words (the post has Manage…, plan 8X-G).
  */
 export async function reverseRouteAs(
   ctx: TrainChanging,
@@ -412,7 +411,7 @@ export async function reverseRouteAs(
 }
 
 /**
- * Sets what the train does at the end of its route as the menu of the Manage train panel does
+ * Sets what the train does at the end of its route as the menu of the map's panel does
  * (`TrainService.setAtEnd`, with where the panel was drawn), and says it: the map's panel.
  */
 export async function setAtEndAs(
@@ -428,7 +427,7 @@ export async function setAtEndAs(
 }
 
 /**
- * Sets what kind of battles the train goes to as the kind menu of the Manage train panel does
+ * Sets what kind of battles the train goes to as the kind menu of the map's panel does
  * (`TrainService.setKind`), and says it: the map's panel (plan 8X-5).
  */
 export async function setKindAs(
diff --git a/src/commands/trains/train.test.ts b/src/commands/trains/train.test.ts
index 15a482e1561b8a9217a30cb5338626dc72dcaac9..8882aa5648afb692524fb2f330b18cf194718440 100644
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -92,12 +92,10 @@ describe('/train', () => {
     const postId = party?.forumPostId ?? '';
     const post = made.gateway.posts.get(postId);
     expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
-    // The post has the button that opens the panel to move the train.
-    expect(
-      buttonsOf(post?.message).find((button) => button.label === 'Manage train…'),
-    ).toMatchObject({
-      label: 'Manage train…',
-      customId: `party:${party?.id ?? ''}:move`,
+    // Made without a route, the post has Manage… and no Move… yet (plan 8X-G).
+    expect(buttonsOf(post?.message).find((button) => button.label === 'Manage…')).toMatchObject({
+      label: 'Manage…',
+      customId: `party:${party?.id ?? ''}:manage`,
     });
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(sent(used.editReply).content).toBe(
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index 1b69cac52fab8eb90869669b7f452093da8d972a..429393276008e42b653fe6524f001c89a921481b 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -104,13 +104,13 @@ export const train: SimpleCommand = {
       'add` adds the gyms and power spots it visits (also of other regions), `/meet` sets when ' +
       'it starts and `/end` when it ends, `/boss` says which Pokémon it is after, and ' +
       '`/conductor set` makes you the one who moves it. Members sign up with the buttons, as ' +
-      'for a raid, and the button "Manage train…" or `/next` takes it to its next stop. `at-end` ' +
+      'for a raid, and the button "Move…" or `/next` takes it to its next stop. `at-end` ' +
       'says what the train does at the last stop: it finishes the route (the default), loops ' +
-      'back to the first stop, or turns back and runs the route backwards; the Manage train panel ' +
-      `changes that later, and reverses the route. \`kind\` says what the train is mainly for: raids (a ` +
+      'back to the first stop, or turns back and runs the route backwards; the button "Manage…" ' +
+      `changes that later, and reverses or finishes the route. \`kind\` says what the train is mainly for: raids (a ` +
       `${TRAIN_KIND_WORDS.raid}, the default), Dynamax battles (a ${TRAIN_KIND_WORDS.dynamax}: ` +
       `lobbies form on the spot) or Gigantamax battles (a ${TRAIN_KIND_WORDS.gigantamax}: Join ` +
-      'fills its groups up to a Gigantamax lobby); the Manage train panel changes that later too, ' +
+      'fills its groups up to a Gigantamax lobby); "Manage…" changes that later too, ' +
       'also before the train has a stop. `start` says when it starts, as `/meet` takes it, so ' +
       'that a train planned days ahead says so from the first; its route can wait until the ' +
       'day. A train is archived an hour after it is over: after its end, or without one a day ' +
diff --git a/src/components/party.ts b/src/components/party.ts
index deac03cc6d13492b4c39c62ad3cffee5da1c82c1..df230890caa67aa6df95587ea255b760ffe2beab 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -11,14 +11,7 @@ import {
 import { changeTime, timesAlready } from '../commands/raids/change.js';
 import { showScreenshot } from '../commands/screenshots/feedback.js';
 import { submitPartyReport } from '../commands/parties/report.js';
-import {
-  openMove,
-  pressAtEnd,
-  pressKind,
-  pressReverse,
-  pressTrainPanel,
-  submitMove,
-} from '../commands/trains/move.js';
+import { openManage, openMove, submitManage, submitMove } from '../commands/trains/move.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import { showWholeRoute } from '../commands/trains/route.js';
 import { openSplit, submitSplit } from '../commands/trains/split.js';
@@ -31,7 +24,7 @@ import { STALE_COMPONENT } from '../discord/router.js';
 import { isGroupId, isRaid } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
-import { MOVE_FORM } from '../render/train-dialogs.js';
+import { MANAGE_FORM, MOVE_FORM } from '../render/train-dialogs.js';
 import { SPLIT_FORM } from '../render/train-split.js';
 import { GROUP_MENU_FORM, WHICH_GROUP_FORM } from '../render/group-dialogs.js';
 import {
@@ -44,11 +37,11 @@ import {
 
 /**
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
- * question, the "Set time" button of a raid without times with the form it opens, and the
- * button "Manage train…" of a train with the panel it opens and its controls, the menu of what the
- * train does at the end of its route among them (`commands/trains/move.ts`), and "Whole route"
- * of a train, which shows the route privately as `/route show` does (`commands/trains/route.ts`),
- * and "Split group…" of a train with the dialog it opens (`commands/trains/split.ts`).
+ * question, the "Set time…" button of a raid without times with the form it opens, and the
+ * buttons "Move…" and "Manage…" of a train with the dialogs they open (plan 8X-G,
+ * `commands/trains/move.ts`), "Route" of a train, which shows the route privately as
+ * `/route show` does (`commands/trains/route.ts`), and "Split…" of a train with the dialog it
+ * opens (`commands/trains/split.ts`).
  * The party is named by the custom id, not by the channel, so the same controls work on a copy of the
  * message in another channel. Every click is answered privately, a burst of clicks by one
  * member with one answer (`answerClick`); what it changed is said in the post by the attendance
@@ -144,25 +137,27 @@ export const partyButtons: ComponentHandler = {
       case 'moveform':
         // Only Move…'s dialog has this action.
         throw new UserError(STALE_COMPONENT);
+      case 'manage':
+        // Manage… of a train's post (plan 8X-G): its route, mode and kind, in a dialog.
+        return openManage(interaction, ctx, partyId);
+      case 'manageform':
+        // Only Manage…'s dialog has this action.
+        throw new UserError(STALE_COMPONENT);
       case 'next':
       case 'previous':
       case 'skip':
       case 'finish':
-        // A button of that panel: it moves the train and changes the panel, never a gathered
-        // answer (`answerClick`), which would leave the panel as it was.
-        return pressTrainPanel(interaction, ctx, partyId, id.action, id.args[0], id.args[1]);
       case 'reverse':
-        // "Reverse the route" of that panel.
-        return pressReverse(interaction, ctx, partyId, id.args[0], id.args[1]);
       case 'atend':
       case 'kind':
-        // The menus of that panel: never a button.
+        // The controls of the Manage train panel before plan 8X-G (review R16): a panel still
+        // open in a client is stale; Move… and Manage… took its place.
         throw new UserError(STALE_COMPONENT);
       case 'route':
-        // "Whole route" of a train's post: the route privately, as `/route show` answers it.
+        // "Route" of a train's post: the route privately, as `/route show` answers it.
         return showWholeRoute(interaction, ctx, partyId);
       case 'split':
-        // "Split group…" of a train's post: the dialog of the split (plans 8T, 8T-H).
+        // "Split…" of a train's post: the dialog of the split (plans 8T, 8T-H).
         return openSplit(interaction, ctx, partyId);
       case 'splitform':
       case 'joinform':
@@ -190,11 +185,12 @@ export const partyButtons: ComponentHandler = {
     }
   },
 
-  /** The menus "At the end of the route" and "What the train goes to" of the Manage train panel. */
-  async select(interaction, id, ctx) {
-    if (id.action === 'kind') return pressKind(interaction, ctx, id.id);
-    if (id.action !== 'atend') throw new UserError(STALE_COMPONENT);
-    await pressAtEnd(interaction, ctx, id.id, id.args[0]);
+  /**
+   * The post has no menu: those of the Manage train panel before plan 8X-G ("At the end of the
+   * route", the kind) are stale.
+   */
+  select() {
+    throw new UserError(STALE_COMPONENT);
   },
 
   /**
@@ -206,6 +202,7 @@ export const partyButtons: ComponentHandler = {
     if (id.action === 'delete') return submitPartyReport(interaction, ctx, id.id);
     if (id.action === SPLIT_FORM) return submitSplit(interaction, ctx, id.id, id.args);
     if (id.action === MOVE_FORM) return submitMove(interaction, ctx, id.id, id.args);
+    if (id.action === MANAGE_FORM) return submitManage(interaction, ctx, id.id, id.args);
     if (id.action === GROUP_MENU_FORM) return submitGroupMenu(interaction, ctx, id.id, id.args);
     if (id.action === WHICH_GROUP_FORM) {
       return submitWhichGroup(interaction, ctx, id.id, id.args);
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index b2f559c10b41d56b2e5673dca9dac3005997e231..00817688be445f988c5c296ee818a5c3cee307a3 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -69,8 +69,8 @@
  * raid's post is the party's own, `party:<party id>:shot`.
  *
  * The controls of a party have the kind `party` and the party's id (`PARTY_ACTIONS`,
- * `src/render/party-controls.ts`). The private panel behind "Manage train…" (`party:<id>:move`;
- * `trainPanel`, `src/render/train-panel.ts`) carries where the train was when it was drawn
+ * `src/render/party-controls.ts`). The private panel behind "Manage train…" before plan 8X-G
+ * (`party:<id>:move`, which opens Move… since; the panel's controls answer as stale) carried where the train was when it was drawn
  * (`<place>`: the `stopHandle` of its stop, `end` once the route is finished; plan 8X-4: a
  * stop's handle is a gym's id, or the first 8 hex characters of an FNV-1a hash of a power spot's
  * Wayfarer id, `src/domain/party/stops.ts`, checked against the route when pressed: a handle
@@ -83,7 +83,7 @@
  * anew against that place. The menu of the train's kind is `party:<id>:kind` (plan 8X-4; no
  * place: the kind does not depend on where the train is), its value `raid`, `dynamax` or
  * `gigantamax`.
- * "Split group…" (`party:<id>:split`, plan 8T) opens a dialog (plan 8T-H): of one group
+ * "Split…" (`party:<id>:split`, plan 8T) opens a dialog (plan 8T-H): of one group
  * `party:<id>:splitform:<group>:<mark>` (the group's letter and `groupMark`, so that a Submit
  * for a group called otherwise, gone, or given its letter again after a split is refused), of
  * several `party:<id>:splitform`, whose radio group's value is `<group>:<mark>`.
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index 0b6c8781c82f2f9d32cd60c28d0aeed07608a574..98a0f13000f1e9185117c0d2ecdd3faf9409a808 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -927,8 +927,8 @@ export function reverseRoute(
  * Sets what the train does at the end of its route. It never moves the train, so it is for whoever
  * may arrange the route (`mayArrange`: who is signed up, conductor or not, and the maker, who may
  * give the train its route and with a saved route its mode) and for staff; anybody else is
- * refused (`not-attending`). From the panel (`from`) the train must still be where the panel was
- * drawn (`train-moved-on`). A finished route stays finished. The very same party comes back
+ * refused (`not-attending`). With `from` (the map's panel; Manage… after a change of the route)
+ * the train must still be there (`train-moved-on`). A finished route stays finished. The very same party comes back
  * when the train has that mode already.
  */
 export function setAtEnd(
@@ -946,10 +946,10 @@ export function setAtEnd(
 }
 
 /**
- * Sets what kind of battles the train goes to (plan 8X-4; design 6.1: the menu of the Manage train
- * panel, under the mode's). It changes the lobby the post counts at once (`lobbySize`); groups
- * already made stay as they are. For who may move the train and for staff (`mayNotMove`: the
- * panel opens only for them). The very same party comes back when the train is of that kind
+ * Sets what kind of battles the train goes to (plan 8X-4; design 6.1: Manage…'s menu "What the
+ * train is mainly for", plan 8X-G, and the map's panel). It changes the lobby the post counts at once (`lobbySize`); groups
+ * already made stay as they are. For who may move the train and for staff (`mayNotMove`: Manage…
+ * opens only for them). The very same party comes back when the train is of that kind
  * already.
  */
 export function setTrainKind(
@@ -1064,7 +1064,7 @@ export function splittableGroups(party: TrainParty, memberId: string, staff: boo
 
 /**
  * Whether the train has something to split: two groups or more with somebody in them, and no
- * split of its own pending (`mayNotSplit`; the post shows "Split group…" only then).
+ * split of its own pending (`mayNotSplit`; the post shows "Split…" only then).
  */
 export function splitsPossible(party: TrainParty): boolean {
   if (party.train.splitFrom?.pending === true) return false;
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 34ce504609491c219304c21ae1e70621c09a25bf..a282aada3708bbcc6a2093ae4c81ccf99e4d2673 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -166,8 +166,9 @@ export interface MapTrain {
    */
   may: MapTrainRights;
   /**
-   * The Manage train panel as the member may use it now (plan 8M-5), as the post's "Manage train…"
-   * opens it: null for who may not move the train (`mayNotMove`), for a train without a route,
+   * The Manage train panel as the member may use it now (plan 8M-5), as the post's "Manage
+   * train…" opened it before plan 8X-G (the post has Move… and Manage… since; the map's panel
+   * waits for its UX pass): null for who may not move the train (`mayNotMove`), for a train without a route,
    * and while read-only.
    */
   panel: MapTrainPanel | null;
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 9977ad90771b81365c312467ecb6eaaf64cf9941..05e2b648fecb30e2d38456e29a51d820ef4fa0d2 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -297,7 +297,7 @@ export function trainRights(party: TrainParty, input: PartyViewInput): MapTrainR
 }
 
 /**
- * The Manage train panel as the member may use it (spec 3.7), as the post's "Manage train…" opens it
+ * The Manage train panel as the member may use it (spec 3.7), as the post's "Manage train…" opened it before plan 8X-G
  * (`openTrainPanel`): none for who may not move the train, for a train without a route, and
  * while read-only. The moves are those `cannotMove` allows from where the train is, each with
  * where it leads; Reverse where `cannotReverse` allows it.
diff --git a/src/render/mirrors.region.test.ts b/src/render/mirrors.region.test.ts
index cec89de821531d4f6a4eb126a8dff161de7de45a..bb2372f0e01c2b40d32d690c6f3e6753f3521aca 100644
--- a/src/render/mirrors.region.test.ts
+++ b/src/render/mirrors.region.test.ts
@@ -70,6 +70,7 @@ describe('renderMirror for the channel of a region a train stops in', () => {
       'remote',
       'regroup',
       'move',
+      'manage',
       'split',
     ]);
     const copy = renderMirror('region', rendered, place);
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index 99ca25433521ac0672a7a6157767e59372513e83..6c888fce8121520440b626417547d149b4eab03e 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -16,6 +16,7 @@ import { setHatchTime } from '../domain/party/raid.js';
 import {
   bottomControls,
   completionQuestion,
+  manageTrainButton,
   moveTrainButton,
   statusButton,
   type ControlIcons,
@@ -201,19 +202,22 @@ describe('the controls of a post (plan 8X-1B: one layout for one group and sever
     expect(actions(elite)[1]).toEqual(['meet', 'less', 'more']);
   });
 
-  it('gives a train no Done and no Meet…, and its own labelled buttons after Group…', () => {
+  it('gives a train no Done and no Meet…, and its own labelled buttons after Group…, words only', () => {
     const train = testTrain();
-    const opens = [moveTrainButton(train), splitGroupButton(train), wholeRouteButton(train)];
+    const opens = [
+      moveTrainButton(train),
+      manageTrainButton(train),
+      splitGroupButton(train),
+      wholeRouteButton(train),
+    ];
+    // Plan 8X-G (Matt, 2026-10-22): Group… · Move… · Manage… · Split… · Route, no emoji.
     expect(rows(train, NO_ICONS, opens)).toEqual([
       ['🤔 maybe', '🏃 join', '✅ here', '👋 leave'],
       ['⬇️ less', '⬆️ more', '📡 remote'],
-      [
-        '👥 Group… regroup',
-        '🚂 Manage train… move',
-        '✂️ Split group… split',
-        '🗺️ Whole route route',
-      ],
+      ['Group… regroup', 'Move… move', 'Manage… manage', 'Split… split', 'Route route'],
     ]);
+    // A raid's Group… keeps its emoji.
+    expect(rows(testRaid())[2]?.[0]).toBe('👥 Group… regroup');
   });
 
   it('gives a meetup, which has no groups, no Done, Meet… or Group…', () => {
@@ -233,7 +237,11 @@ describe('the controls of a post (plan 8X-1B: one layout for one group and sever
     });
     expect(moveTrainButton(party)).toMatchObject({
       moves: true,
-      button: { label: 'Manage train…', custom_id: `party:${party.id}:move` },
+      button: { label: 'Move…', custom_id: `party:${party.id}:move` },
+    });
+    expect(manageTrainButton(party)).toMatchObject({
+      moves: true,
+      button: { label: 'Manage…', custom_id: `party:${party.id}:manage` },
     });
   });
 
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index ac7fe89243242f98542015be3cd59f88c951a380..37f5c3a7d665f818ab59af57799750770bdaed9a 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -10,7 +10,14 @@ import {
 } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import type { ControlIconName } from '../domain/pogo/game-icons.js';
-import { hasGroups, isBattle, isRaid, remoteAllowed, type Party } from '../domain/party/party.js';
+import {
+  hasGroups,
+  isBattle,
+  isRaid,
+  isTrain,
+  remoteAllowed,
+  type Party,
+} from '../domain/party/party.js';
 import type { PostButton, PostEmoji } from './party-post.js';
 import { fitItems, plain } from './text.js';
 
@@ -20,13 +27,14 @@ export const PARTY_KIND = 'party';
 /**
  * What a control of a post does: the action part of its custom id. `group` carries the group's
  * letter as its argument, `answer` carries `yes` or `no` (the completion question). `time` is
- * the "Set time" button, and the form it opens, which carries `hatch` or `end`. `delete` is the
+ * the "Set time…" button, and the form it opens, which carries `hatch` or `end`. `delete` is the
  * form a member's `/delete` opened before it was for staff only (plan 8S-2), taken as a report
- * (`/report`'s form is `report:<party id>:party`); no button has it. `move` is the button
- * "Manage train…" of a train's post, which opens the panel whose buttons are `next`, `previous`,
- * `skip` and `finish` (`train-panel.ts`). `route` is "Whole route" of a train's post, which
- * shows the route privately. `shot` is "Screenshot feedback" of a raid reported from a
- * screenshot, which shows that screenshot privately. `split` is "Split group…" of a train with
+ * (`/report`'s form is `report:<party id>:party`); no button has it. `move` is "Move…" of a
+ * train's post ("Manage train…" before plan 8X-G), which opens the dialog `moveform`; `manage` is
+ * "Manage…", which opens `manageform` (`train-dialogs.ts`); `next`, `previous`, `skip`, `finish`,
+ * `reverse`, `atend` and `kind` were the Manage train panel's and answer as stale. `route` is
+ * "Route" of a train's post, which shows the route privately. `shot` is "Screenshot feedback" of a raid reported from a
+ * screenshot, which shows that screenshot privately. `split` is "Split…" of a train with
  * two groups or more, which opens the dialog `splitform` (`train-split.ts`; `<group>:<mark>` when
  * it asks about one group); no button has `splitform`. `regroup` is "Group…" and `meet` is
  * "Meet…" (plan 8X-1B), each of which opens a dialog; `joinform` is the dialog that asks a newcomer
@@ -64,6 +72,8 @@ export const PARTY_ACTIONS = [
   'regroupform',
   'meet',
   'moveform',
+  'manage',
+  'manageform',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
@@ -209,63 +219,67 @@ export function meetIcon(icons: ControlIcons): string {
   return iconText(icons, 'pinemeet', MEET_PLAIN);
 }
 
-/** The button "Manage train…" of a train's post; a copy for another region leaves it out. */
+/*
+ * The third row of a train's post (plan 8X-G; Matt, 2026-10-22): Group… · Move… · Manage… ·
+ * Split… · Route, short words and no emoji. Five buttons fit one row.
+ */
+
+/** The label of the button of a train's post that opens Move…. */
+export const MOVE_TRAIN_LABEL = 'Move…';
+
+/** The label of the button of a train's post that opens Manage…. */
+export const MANAGE_TRAIN_LABEL = 'Manage…';
+
+/** The label of the button of a train's post that shows its whole route. */
+export const WHOLE_ROUTE_LABEL = 'Route';
+
+/** The label of the button of a train's post that splits a group off. */
+export const SPLIT_GROUP_LABEL = 'Split…';
+
+/**
+ * The button "Move…" of a train's post while it has a route (plan 8X-G): the dialog of its
+ * moves. `party:<id>:move`, the action of "Manage train…" before, so that the button of a post
+ * not drawn anew opens it too. A copy for another region leaves it out (`moves`).
+ */
 export function moveTrainButton(party: Pick<Party, 'id'>): PostButton {
   return {
-    button: partyButton(
-      party.id,
-      'move',
-      MANAGE_TRAIN_LABEL,
-      ButtonStyle.Secondary,
-      undefined,
-      '🚂',
-    ),
+    button: partyButton(party.id, 'move', MOVE_TRAIN_LABEL, ButtonStyle.Secondary),
     moves: true,
   };
 }
 
 /**
- * The button "Whole route" of a train's post whose route is longer than the post lists: the
- * route privately, as `/route show` answers it. A copy for another region keeps it.
+ * The button "Manage…" of a train's post (plan 8X-G): the dialog of its route (Reverse, Finish),
+ * its mode at the end and its kind. A copy for another region leaves it out (`moves`).
  */
-export function wholeRouteButton(party: Pick<Party, 'id'>): PostButton {
+export function manageTrainButton(party: Pick<Party, 'id'>): PostButton {
   return {
-    button: partyButton(
-      party.id,
-      'route',
-      WHOLE_ROUTE_LABEL,
-      ButtonStyle.Secondary,
-      undefined,
-      '🗺️',
-    ),
+    button: partyButton(party.id, 'manage', MANAGE_TRAIN_LABEL, ButtonStyle.Secondary),
+    moves: true,
   };
 }
 
-/** The label of the button of a train's post that shows its whole route. */
-export const WHOLE_ROUTE_LABEL = 'Whole route';
+/**
+ * The button "Route" of a train's post whose route is longer than the post lists: the route
+ * privately, as `/route show` answers it. It only shows: no `…`. A copy for another region keeps
+ * it.
+ */
+export function wholeRouteButton(party: Pick<Party, 'id'>): PostButton {
+  return { button: partyButton(party.id, 'route', WHOLE_ROUTE_LABEL, ButtonStyle.Secondary) };
+}
 
 /**
- * The button "Split group…" of a train's post with two groups or more (plan 8T): the dialog
- * of splitting a group off into a train of its own (plan 8T-H). A copy for another region
- * leaves it out, as it leaves out Manage train… (`moves`).
+ * The button "Split…" of a train's post with two groups or more (plan 8T): the dialog of
+ * splitting a group off into a train of its own (plan 8T-H). A copy for another region leaves it
+ * out, as it leaves out Move… and Manage… (`moves`).
  */
 export function splitGroupButton(party: Pick<Party, 'id'>): PostButton {
   return {
-    button: partyButton(
-      party.id,
-      'split',
-      SPLIT_GROUP_LABEL,
-      ButtonStyle.Secondary,
-      undefined,
-      '✂️',
-    ),
+    button: partyButton(party.id, 'split', SPLIT_GROUP_LABEL, ButtonStyle.Secondary),
     moves: true,
   };
 }
 
-/** The label of the button of a train's post that splits a group off. */
-export const SPLIT_GROUP_LABEL = 'Split group…';
-
 /** The label of the button of a raid's or a train's post that changes or opens a group. */
 export const GROUP_LABEL = 'Group…';
 
@@ -276,14 +290,14 @@ export const GROUP_LABEL = 'Group…';
  * (for everybody: Discord has no button per member) while nobody is signed up, when it could do
  * nothing that Join does not; the first sign-up shows the post anew, which switches it on.
  */
-export function groupButton(party: Pick<Party, 'id' | 'attendees'>): PostButton {
+export function groupButton(party: Pick<Party, 'id' | 'attendees'>, emoji = true): PostButton {
   const button = partyButton(
     party.id,
     'regroup',
     GROUP_LABEL,
     ButtonStyle.Secondary,
     undefined,
-    '👥',
+    emoji ? '👥' : undefined,
   );
   return {
     button: Object.keys(party.attendees).length === 0 ? { ...button, disabled: true } : button,
@@ -306,7 +320,7 @@ export interface BottomOptions {
   emoji: ControlIcons;
   /**
    * The buttons with a label of the party's own kind, after Group… in the third row (a train's
-   * Manage train…, Split group… and Whole route).
+   * Move…, Manage…, Split… and Route).
    */
   opens?: readonly PostButton[];
 }
@@ -352,7 +366,8 @@ export function bottomControls(party: Party, options: BottomOptions): PostButton
       : []),
   ];
   const opens: PostButton[] = [
-    ...(hasGroups(party) ? [groupButton(party)] : []),
+    // A train's third row is words only (plan 8X-G, Matt): its Group… has no emoji.
+    ...(hasGroups(party) ? [groupButton(party, !isTrain(party))] : []),
     // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
     ...(raid && raid.hatchTime === null
       ? [{ button: partyButton(id, 'time', 'Set time…', ButtonStyle.Primary, undefined, '⏰') }]
@@ -380,9 +395,6 @@ export function bottomControls(party: Party, options: BottomOptions): PostButton
 /** The label of the button of a raid's post that shows the screenshot it was reported from. */
 export const SCREENSHOT_FEEDBACK = 'Screenshot feedback';
 
-/** The label of the button of a train's post that opens the panel to move it. */
-export const MANAGE_TRAIN_LABEL = 'Manage train…';
-
 /**
  * The question to members who were present when somebody of their group completed the raid, with
  * its two answers. The members are named as mentions, as many as fit; whom it may ping is the
diff --git a/src/render/party-post.test.ts b/src/render/party-post.test.ts
index 0f380e3c2addb66b3416641a3c96e72297d0c7f1..9064ee8b3de5494345271deea72d0b0a166df5a2 100644
--- a/src/render/party-post.test.ts
+++ b/src/render/party-post.test.ts
@@ -92,7 +92,7 @@ describe('postMessage', () => {
     expect(accentOf(message)).toBe(0x2ecc71);
     expect(thumbnailOf(message)).toBe('https://x.test/boss.png');
     expect(textDisplays(message)).toEqual(['### Title', '**Coming (0)**', '**Current gym**']);
-    expect(buttonNames(message)).toEqual(['🏃', 'Manage train…', '✅']);
+    expect(buttonNames(message)).toEqual(['🏃', 'Move…', '✅']);
     // Container; 3 sections of 2 each with their texts; 2 lines; a row and its button.
     expect(componentCount(message)).toBe(1 + 9 + 2 + 2);
   });
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index a2c0f94863993c78725ba9be696c123926e6db20..afe2b28f7c97ecbfbe2adb88b7939552ef1106f5 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -224,8 +224,8 @@ export const TEXT_BUDGET = 4_000;
 export const LEAD_ROOM = 200;
 
 /**
- * A button of a post. `moves` marks those of a train that are for its own post ("Manage train…",
- * "Split group…"), which a copy for the members of another region leaves out. `plain` is the
+ * A button of a post. `moves` marks those of a train that are for its own post ("Move…",
+ * "Manage…", "Split…"), which a copy for the members of another region leaves out. `plain` is the
  * emoji a button with a custom one shows instead where Discord refuses that (`customEmoji:
  * false`, plan 8D-G).
  */
diff --git a/src/render/train-dialogs.test.ts b/src/render/train-dialogs.test.ts
index 446527e4e7d937764690c77d8ed675d172b014f9..f2af5004731e4783e043960dd5aef9a8b7783df5 100644
--- a/src/render/train-dialogs.test.ts
+++ b/src/render/train-dialogs.test.ts
@@ -1,3 +1,4 @@
+import { ComponentType } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
 import { checkModal } from '../../test/support/fake-interactions.js';
@@ -9,7 +10,7 @@ import type { TrainAtEnd, TrainParty } from '../domain/party/party.js';
 import { gymStop } from '../domain/party/stops.js';
 import { placeOf, targetOf } from '../domain/party/train.js';
 import type { PostGym } from './raid-post.js';
-import { MOVE_FORM, MOVE_INPUT, moveDialog } from './train-dialogs.js';
+import { MANAGE_FORM, manageDialog, MOVE_FORM, MOVE_INPUT, moveDialog } from './train-dialogs.js';
 import { stopsFrom } from './train-stops.js';
 
 const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
@@ -67,6 +68,21 @@ describe('the ids of the dialogs of a train (review r0 B4)', () => {
         expect(choice.value.length).toBeLessThanOrEqual(100);
     }
   });
+
+  it('keep Manage…’s custom id within 100 characters', () => {
+    for (const party of [
+      onRoute(LONGEST.gyms, 1),
+      onRoute(LONGEST.gyms, 3, 'finish', LONGEST.gyms[2]),
+    ]) {
+      const dialog = manageDialog({
+        party,
+        stop: stopsFrom({ get: (id: number) => gyms.get(id) }),
+        now: LONGEST.now,
+      });
+      checkModal(dialog);
+      expect(dialog.custom_id.length).toBeLessThanOrEqual(100);
+    }
+  });
 });
 
 describe('moveDialog (plan 8X-G: Move…)', () => {
@@ -156,3 +172,116 @@ describe('moveDialog (plan 8X-G: Move…)', () => {
     expect(skip?.label).toMatch(/^Skip A gym whose .*…, go to A gym whose .*…$/);
   });
 });
+
+const managed = (party: TrainParty) =>
+  manageDialog({ party, stop: stopsFrom({ get: (id) => gyms.get(id) }), now: PARTY_NOW });
+
+/** The labels of a dialog's choices, with the values of each and which is picked. */
+function managedChoices(party: TrainParty) {
+  const dialog = managed(party);
+  return dialog.components.flatMap((component) =>
+    component.type === ComponentType.Label &&
+    (component.component.type === ComponentType.RadioGroup ||
+      component.component.type === ComponentType.StringSelect)
+      ? [
+          {
+            label: component.label,
+            menu: component.component.type === ComponentType.StringSelect,
+            options: component.component.options.map(
+              (option) => `${option.value}${option.default === true ? '*' : ''}`,
+            ),
+          },
+        ]
+      : [],
+  );
+}
+
+describe('manageDialog (plan 8X-G: Manage…)', () => {
+  it('asks the route, the mode and the kind, each with what the train has picked', () => {
+    const train = onRoute([4, 1, 7, 2], 0);
+    const dialog = managed(train);
+    checkModal(dialog);
+    expect(dialog.title).toBe('Manage the train');
+    expect(dialogTexts(dialog)).toEqual([
+      'At stop 1 of 4: **Veterans Memorial Bridge**\nNext is **The Stacks**',
+    ]);
+    expect(managedChoices(train)).toEqual([
+      { label: 'The route', menu: false, options: ['keep*', 'reverse', 'finish'] },
+      {
+        label: 'At the end of the route',
+        menu: true,
+        options: ['finish*', 'loop', 'turn-back'],
+      },
+      {
+        label: 'What the train is mainly for',
+        menu: true,
+        options: ['raid*', 'dynamax', 'gigantamax'],
+      },
+    ]);
+    expect(
+      dialogChoices(dialog)
+        .slice(0, 3)
+        .map(({ label }) => label),
+    ).toEqual(['Keep it as it is', 'Reverse it', 'Finish it here']);
+    // Where the train was, the stop the route began with, and the mode and kind shown.
+    expect(decodeCustomId(dialog.custom_id)).toEqual({
+      kind: 'party',
+      id: train.id,
+      action: MANAGE_FORM,
+      args: ['4', '4', 'f', 'r', openToken(PARTY_NOW)],
+    });
+  });
+
+  it('offers only what can be done with the route, and leaves it out when only Keep is left', () => {
+    // In the middle of a route that finishes: no Reverse.
+    expect(managedChoices(onRoute([4, 1, 7, 2], 1))[0]?.options).toEqual(['keep*', 'finish']);
+    // A finished route: no Finish; Reverse only where it was finished from its last stop (2).
+    expect(managedChoices(onRoute([4, 1, 7, 2], 4, 'finish', 2))[0]?.options).toEqual([
+      'keep*',
+      'reverse',
+    ]);
+    // Finished from another stop: only Keep is left, and the route is not asked.
+    expect(managedChoices(onRoute([4, 1, 7, 2], 4, 'finish', 1)).map(({ label }) => label)).toEqual(
+      ['At the end of the route', 'What the train is mainly for'],
+    );
+    // A turn-back train, mid-route: Finish alone with Keep.
+    expect(managedChoices(onRoute([4, 1, 7, 2], 1, 'turn-back'))[0]?.options).toEqual([
+      'keep*',
+      'finish',
+    ]);
+  });
+
+  it('says of a finished route only that it is finished, and that Reverse starts it again (review r0 B3)', () => {
+    const finished = onRoute([4, 1, 7, 2], 4, 'finish', 2);
+    expect(dialogTexts(managed(finished))).toEqual([
+      'The train has finished its route of 4 stops.',
+    ]);
+    const reverse = dialogChoices(managed(finished)).find((choice) => choice.value === 'reverse');
+    expect(reverse).toMatchObject({
+      label: 'Reverse it',
+      description:
+        'Starts the route again from its last stop, Old Stone Fountain, the other way round',
+    });
+    // On a route on its way, Reverse says nothing more.
+    const going = dialogChoices(managed(onRoute([4, 1, 7, 2], 0))).find(
+      (choice) => choice.value === 'reverse',
+    );
+    expect(going?.description).toBeUndefined();
+  });
+
+  it('asks a train without a route its kind alone', () => {
+    const train = onRoute([], 0);
+    const dialog = managed({ ...train, train: { ...train.train, kind: 'dynamax' } });
+    checkModal(dialog);
+    expect(dialogTexts(dialog)).toEqual([
+      'This train has no route yet. Add its stops with `/route add`.',
+    ]);
+    expect(managedChoices({ ...train, train: { ...train.train, kind: 'dynamax' } })).toEqual([
+      {
+        label: 'What the train is mainly for',
+        menu: true,
+        options: ['raid', 'dynamax*', 'gigantamax'],
+      },
+    ]);
+  });
+});
diff --git a/src/render/train-dialogs.ts b/src/render/train-dialogs.ts
index edfa4cf997fbddcfe56628b41705d4afcd14bca9..ade173171b1b5a810caa8d9e6fb9af09582b8e5f 100644
--- a/src/render/train-dialogs.ts
+++ b/src/render/train-dialogs.ts
@@ -1,9 +1,16 @@
 import type { APIModalInteractionResponseCallbackData } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
-import { dialog, openToken, type DialogOption } from '../discord/dialog.js';
-import type { StopRef } from '../domain/party/stops.js';
+import { dialog, openToken, type DialogChoice, type DialogOption } from '../discord/dialog.js';
+import {
+  TRAIN_AT_END,
+  TRAIN_KINDS,
+  type TrainAtEnd,
+  type TrainKind,
+} from '../domain/party/party.js';
+import { stopHandle, type StopRef } from '../domain/party/stops.js';
 import {
   cannotMove,
+  cannotReverse,
   currentStop,
   destinationOf,
   nextStop,
@@ -16,6 +23,16 @@ import { PARTY_KIND } from './party-controls.js';
 import { count, endSentence, plain, truncate } from './text.js';
 import type { TrainPlaces } from './train-post.js';
 import { stopLabel } from './train-stops.js';
+import {
+  AT_END_DESCRIPTIONS,
+  AT_END_EMOJI,
+  AT_END_MENU_LABELS,
+  NO_ROUTE_YET,
+  TRAIN_KIND_DESCRIPTIONS,
+  TRAIN_KIND_EMOJI,
+  TRAIN_KIND_QUESTION,
+  trainKindChoice,
+} from './train-words.js';
 
 /*
  * The dialogs of a train's post (plan 8X-G; design talk of 2026-10-22): Move… (`moveDialog`)
@@ -262,3 +279,124 @@ export function moveDialog(view: TrainDialogView): APIModalInteractionResponseCa
     },
   });
 }
+
+/**
+ * The action of Manage…'s dialog:
+ * `party:<id>:manageform:<place>:<first>:<mode>:<kind>:~<token>`. `place` is where the train was
+ * (`placeOf`), `first` the stop the route began with (`stopHandle`; `-` without a route), `mode`
+ * and `kind` the train's own as the dialog showed them, a letter each (`AT_END_CODES`,
+ * `KIND_CODES`): Submit changes only what was picked otherwise (review R5), so that a dialog
+ * opened before somebody else changed the mode does not set it back.
+ */
+export const MANAGE_FORM = 'manageform';
+
+/** The custom ids of Manage…'s three choices. */
+export const MANAGE_ROUTE_INPUT = 'route';
+export const MANAGE_AT_END_INPUT = 'atend';
+export const MANAGE_KIND_INPUT = 'kind';
+
+/** The values of "The route": keep it, reverse it, finish it at the stop the train is at. */
+export const ROUTE_CHOICES = ['keep', 'reverse', 'finish'] as const;
+export type RouteChoice = (typeof ROUTE_CHOICES)[number];
+
+/** The letters of the modes and kinds in Manage…'s custom id. */
+export const AT_END_CODES: Readonly<Record<TrainAtEnd, string>> = {
+  finish: 'f',
+  loop: 'l',
+  'turn-back': 't',
+};
+export const KIND_CODES: Readonly<Record<TrainKind, string>> = {
+  raid: 'r',
+  dynamax: 'd',
+  gigantamax: 'g',
+};
+
+/** What stands in for the first stop of a route that has none, in Manage…'s custom id. */
+export const NO_FIRST = '-';
+
+/** "The route" of Manage…: Keep first and picked, then what `cannotReverse` and the route allow. */
+function routeChoice(view: TrainPlaces): DialogChoice | undefined {
+  const { party } = view;
+  const options: DialogOption[] = [{ value: 'keep', label: 'Keep it as it is' }];
+  if (cannotReverse(party) === undefined) {
+    // Reverse on a finished route starts it again at its last stop (review r0 B3; r1 wording).
+    const prefix = 'Starts the route again from its last stop, ';
+    const suffix = ', the other way round';
+    const last = labelOf(view, party.train.route.at(-1));
+    options.push({
+      value: 'reverse',
+      label: 'Reverse it',
+      ...(routeFinished(party)
+        ? {
+            description: `${prefix}${truncate(last, CHOICE_ROOM - prefix.length - suffix.length)}${suffix}`,
+          }
+        : {}),
+    });
+  }
+  if (!routeFinished(party)) options.push({ value: 'finish', label: 'Finish it here' });
+  // A radio group takes two to ten: with Keep alone there is nothing to ask (review R1).
+  if (options.length < 2) return undefined;
+  return { id: MANAGE_ROUTE_INPUT, label: 'The route', options, picked: 'keep' };
+}
+
+/**
+ * Manage… (plan 8X-G, design talk item 5): for who may move the train and staff, where it is
+ * (`trainStateText`), then "The route", a radio choice (Keep it as it is, picked and first;
+ * Reverse it where `cannotReverse` allows; Finish it here while the route is not finished; left
+ * out when only Keep is left), "At the end of the route" and "What the train is mainly for" as
+ * menus (a radio group would have Android pick its first option whatever the train has; review
+ * R7), each with the train's own picked. A train without a route is asked its kind alone.
+ */
+export function manageDialog(view: TrainDialogView): APIModalInteractionResponseCallbackData {
+  const { party } = view;
+  const [first] = party.train.route;
+  const customId = encodeCustomId({
+    kind: PARTY_KIND,
+    id: party.id,
+    action: MANAGE_FORM,
+    args: [
+      placeOf(party),
+      first === undefined ? NO_FIRST : stopHandle(first),
+      AT_END_CODES[party.train.atEnd],
+      KIND_CODES[party.train.kind],
+      openToken(view.now),
+    ],
+  });
+  const kind: DialogChoice = {
+    id: MANAGE_KIND_INPUT,
+    label: TRAIN_KIND_QUESTION,
+    menu: true,
+    options: TRAIN_KINDS.map((value) => ({
+      value,
+      label: trainKindChoice(value),
+      description: TRAIN_KIND_DESCRIPTIONS[value],
+      emoji: TRAIN_KIND_EMOJI[value],
+    })),
+    picked: party.train.kind,
+  };
+  if (party.train.route.length === 0) {
+    return dialog({ customId, title: 'Manage the train', text: NO_ROUTE_YET, choices: [kind] });
+  }
+  const atEnd: DialogChoice = {
+    id: MANAGE_AT_END_INPUT,
+    label: 'At the end of the route',
+    menu: true,
+    options: TRAIN_AT_END.map((value) => ({
+      value,
+      label: AT_END_MENU_LABELS[value],
+      description: AT_END_DESCRIPTIONS[value],
+      emoji: AT_END_EMOJI[value],
+    })),
+    picked: party.train.atEnd,
+  };
+  const route = routeChoice(view);
+  return dialog({
+    customId,
+    title: 'Manage the train',
+    // Of a finished route only that it is: where Previous leads is Move…'s (review r0 B3).
+    text: routeFinished(party)
+      ? `The train has finished its route of ${count(party.train.route.length, 'stop')}.`
+      : trainStateText(view),
+    choices: [...(route === undefined ? [] : [route]), atEnd, kind],
+  });
+}
diff --git a/src/render/train-kind.test.ts b/src/render/train-kind.test.ts
index e2f5311aa3ef87db5426408506998d3cf39bd62d..824ae47e8b422884d62661e2b19a931d4701c22d 100644
--- a/src/render/train-kind.test.ts
+++ b/src/render/train-kind.test.ts
@@ -1,13 +1,11 @@
 import { describe, expect, it } from 'vitest';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
-import { selectsOf, textDisplays } from '../../test/support/messages.js';
+import { textDisplays } from '../../test/support/messages.js';
 import { PARTY_NOW, PARTY_ZONE, stops, testTrain } from '../../test/support/parties.js';
 import { stopsFrom } from './train-stops.js';
-import { expectV2Sendable } from '../../test/support/post-limits.js';
 import type { TrainKind, TrainParty } from '../domain/party/party.js';
 import type { PostGym } from './raid-post.js';
-import { trainPanel } from './train-panel.js';
 import { renderTrainPost, trainTags, type TrainPostView } from './train-post.js';
 import { TRAIN_KIND_WORDS } from './train-words.js';
 
@@ -59,22 +57,3 @@ describe('the kind of a train in its post (plan 8X-4)', () => {
     expect(trainTags(ofKind('gigantamax'), PARTY_NOW)).toEqual(['Train', 'Max battle']);
   });
 });
-
-describe('the kind in the Manage train panel (plan 8X-4; design 6.1)', () => {
-  it('is a menu under the mode, the train’s own kind chosen', () => {
-    const train = ofKind('dynamax', [4, 1]);
-    const panel = trainPanel({ party: train, stop: stopsFrom({ get: gym }) });
-    expect(textDisplays(panel).slice(1)).toEqual([
-      '**At the end of the route**',
-      '**What the train is mainly for**',
-    ]);
-    const [, kinds] = selectsOf(panel);
-    expect(kinds?.customId).toBe(`party:${train.id}:kind`);
-    expect(kinds?.options.map((option) => [option.value, option.label])).toEqual([
-      ['raid', 'Raids'],
-      ['dynamax', 'Dynamax Battles'],
-      ['gigantamax', 'Gigantamax Battles'],
-    ]);
-    expectV2Sendable(panel);
-  });
-});
diff --git a/src/render/train-panel.ts b/src/render/train-panel.ts
deleted file mode 100644
index 710a32387854bedd8f8e0dc24c822f3773594432..0000000000000000000000000000000000000000
--- a/src/render/train-panel.ts
+++ /dev/null
@@ -1,321 +0,0 @@
-import {
-  ButtonStyle,
-  ComponentType,
-  type APIButtonComponentWithCustomId,
-  type APIComponentInContainer,
-  type APIStringSelectComponent,
-} from 'discord.js';
-import { encodeCustomId } from '../discord/custom-id.js';
-import type { V2Message } from '../discord/party-gateway.js';
-import {
-  TRAIN_AT_END,
-  TRAIN_KINDS,
-  type TrainAtEnd,
-  type TrainKind,
-  type TrainParty,
-} from '../domain/party/party.js';
-import {
-  cannotMove,
-  cannotReverse,
-  currentStop,
-  destinationOf,
-  nextStop,
-  placeOf,
-  routeFinished,
-  targetOf,
-  TRAIN_MOVES,
-  turnAhead,
-  type TrainMove,
-} from '../domain/party/train.js';
-import { stopHandle } from '../domain/party/stops.js';
-import { PARTY_KIND, partyButton } from './party-controls.js';
-import { count, endSentence, memberText, type NamedMember } from './text.js';
-import type { TrainPlaces } from './train-post.js';
-import { stopInWords, stopLink, type PostStop } from './train-stops.js';
-import {
-  AT_END_DESCRIPTIONS,
-  TRAIN_KIND_DESCRIPTIONS,
-  TRAIN_KIND_QUESTION,
-  trainKindChoice,
-} from './train-words.js';
-import { actionRow, container, menuRow, separator, textDisplay } from './v2.js';
-
-/** The grey edge of the Manage train panel: a tool for one member, not a post. */
-export const TRAIN_PANEL_COLOUR = 0x99aab5;
-
-/** The buttons of the moves: label, emoji and style. */
-const MOVE_BUTTONS: Readonly<
-  Record<TrainMove, [string, string, APIButtonComponentWithCustomId['style']]>
-> = {
-  next: ['Next', '▶️', ButtonStyle.Primary],
-  previous: ['Previous', '◀️', ButtonStyle.Secondary],
-  skip: ['Skip', '⏭️', ButtonStyle.Secondary],
-  finish: ['Finish', '🏁', ButtonStyle.Secondary],
-};
-
-/**
- * The labels of the options of the menu of what the train does at the end of its route: Discord
- * shows the chosen one alone while the menu is closed, so each says it in full (the choices of
- * `/train` keep the short `AT_END_LABELS`).
- */
-const AT_END_MENU_LABELS: Readonly<Record<TrainAtEnd, string>> = {
-  finish: 'Finish at the last stop',
-  loop: 'Loop: back to the first stop',
-  'turn-back': 'Turn back at the end',
-};
-
-/** The emoji of the options of the menu of what the train does at the end of its route. */
-const AT_END_EMOJI: Readonly<Record<TrainAtEnd, string>> = {
-  finish: '🏁',
-  loop: '🔁',
-  'turn-back': '↩️',
-};
-
-/**
- * What Next does from where the train is, in words: `Next is X`, and at the last stop `It is
- * the last stop: Next finishes the route`, `Next goes round to X` (a loop) or `Next turns back to
- * X`. `link` shows a stop.
- */
-function nextWords(view: TrainPlaces, link: (stop: PostStop) => string): string {
-  const { party } = view;
-  const next = nextStop(party);
-  if (next === undefined) return 'It is the last stop: Next finishes the route';
-  const where = link(view.stop(next));
-  switch (turnAhead(party)) {
-    case 'round':
-      return `Next goes round to ${where}`;
-    case 'back':
-      return `Next turns back to ${where}`;
-    default:
-      return `Next is ${where}`;
-  }
-}
-
-/** Of a finished route: where Previous takes the train back to. */
-function finishedWords(view: TrainPlaces, link: (stop: PostStop) => string): string {
-  const { route } = view.party.train;
-  const back = destinationOf(view.party, 'previous').stop;
-  const ref = route[back];
-  return (
-    `The train has finished its route of ${count(route.length, 'stop')}. ` +
-    endSentence(
-      `Previous takes it back to stop ${back + 1}: ` +
-        (ref === undefined ? '' : link(view.stop(ref))),
-    )
-  );
-}
-
-/** What is said of a train without a route, in the answer to a command and in the panel. */
-const NO_ROUTE_YET = 'This train has no route yet. Add its stops with `/route add`.';
-
-/**
- * Where a train is on its route and what comes next, as a member is told it in the answer to a
- * move by a command (`/next` and the others). Of a finished route it says where Previous leads,
- * which is how a Finish that was a mistake is taken back: to the stop the train was at, or to
- * the last stop of a route that remembers none.
- */
-export function whereText(view: TrainPlaces): string {
-  const { party } = view;
-  const { route, stop } = party.train;
-  if (route.length === 0) return NO_ROUTE_YET;
-  const link = (shown: PostStop) => stopLink(shown);
-  if (routeFinished(party)) return finishedWords(view, link);
-  const at = currentStop(party);
-  const here = endSentence(
-    `The train is at stop ${stop + 1} of ${route.length}: ${at === undefined ? '' : link(view.stop(at))}`,
-  );
-  return `${here} ${endSentence(nextWords(view, link))}`;
-}
-
-/** Where the train is and what comes next, as the panel shows it under its heading. */
-function panelWhere(view: TrainPlaces): string {
-  const { party } = view;
-  const { route, stop } = party.train;
-  const link = (shown: PostStop) => stopLink(shown, true);
-  if (routeFinished(party)) return finishedWords(view, link);
-  const at = currentStop(party);
-  return [
-    `At stop ${stop + 1} of ${route.length}: ${at === undefined ? '' : link(view.stop(at))}`,
-    nextWords(view, link),
-  ].join('\n');
-}
-
-/** The menu of what the train does at the end of its route, the train's own mode chosen. */
-function atEndMenu(view: TrainPlaces, place: string): APIStringSelectComponent {
-  const { party } = view;
-  return {
-    type: ComponentType.StringSelect,
-    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: 'atend', args: [place] }),
-    options: TRAIN_AT_END.map((atEnd) => ({
-      label: AT_END_MENU_LABELS[atEnd],
-      value: atEnd,
-      description: AT_END_DESCRIPTIONS[atEnd],
-      emoji: { name: AT_END_EMOJI[atEnd] },
-      default: atEnd === party.train.atEnd,
-    })),
-  };
-}
-
-/** The emoji of the options of the menu of the kind of a train. */
-const KIND_EMOJI: Readonly<Record<TrainKind, string>> = {
-  raid: '⚔️',
-  dynamax: '🔴',
-  gigantamax: '🌋',
-};
-
-/**
- * The menu of what the train goes to (plan 8X-4; design 6.1), under the mode's, the train's own
- * kind chosen: `party:<id>:kind`. A kind does not depend on where the train is, so it carries no
- * place; the store decides who may (`setTrainKind`).
- */
-function kindMenu(party: TrainParty): APIStringSelectComponent {
-  return {
-    type: ComponentType.StringSelect,
-    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: 'kind', args: [] }),
-    options: TRAIN_KINDS.map((kind) => ({
-      label: trainKindChoice(kind),
-      value: kind,
-      description: TRAIN_KIND_DESCRIPTIONS[kind],
-      emoji: { name: KIND_EMOJI[kind] },
-      default: kind === party.train.kind,
-    })),
-  };
-}
-
-/**
- * The panel the button "Manage train…" of a train's post opens, for the member who pressed it
- * alone: one components-v2 container (`TRAIN_PANEL_COLOUR`) with where the train is and what
- * comes next, the four moves, "Reverse the route" where it may be reversed (`cannotReverse`),
- * and the menu of what the train does at the end of its route. A move that cannot be made from
- * where the train is has its button switched off. `note` is said above where the train is: why
- * a press did nothing.
- *
- * The controls name the train by its id, like every control of a post, and carry where the
- * train was when the panel was drawn (`placeOf`: the handle of its stop, `stopHandle`, which an
- * edit of the route does not change while the train stays there):
- * `party:<id>:<move>:<place>[:<target>]`,
- * `party:<id>:reverse:<place>:<first>` (`first`: the stop the route began with, so that a second
- * press or a panel drawn before another Reverse does not reverse it back), the menu
- * `party:<id>:atend:<place>`. Next, Previous and Skip
- * also carry the stop they lead to (`targetOf`; at the end of a route that loops or turns back,
- * the stop that comes then). A press decides anew: on a panel that no longer shows where the
- * train is, or whose move would lead to another stop than it did when the panel was drawn, it
- * does nothing, so two members who press Next on the same stop move the train once.
- */
-export function trainPanel(view: TrainPlaces, note?: string): V2Message {
-  const { party } = view;
-  if (party.train.route.length === 0) {
-    // A train without a route (planned ahead, plan 8X-4) has nothing to move along and no end:
-    // only what applies, its kind.
-    const text = ['### Manage the train', ...(note === undefined ? [] : [note]), NO_ROUTE_YET];
-    return {
-      v2: true,
-      components: [
-        container(TRAIN_PANEL_COLOUR, [
-          textDisplay(text.join('\n')),
-          textDisplay(`**${TRAIN_KIND_QUESTION}**`),
-          menuRow(kindMenu(party)),
-        ]),
-      ],
-    };
-  }
-  const place = placeOf(party);
-  const [first] = party.train.route;
-  const moves = TRAIN_MOVES.map((move) => {
-    const [label, emoji, style] = MOVE_BUTTONS[move];
-    return {
-      ...partyButton(
-        party.id,
-        move,
-        label,
-        style,
-        // Where a move leads travels with it ("Next is …", "Previous takes it back to …");
-        // Finish leads to the end of whatever route there is.
-        [place, ...(move === 'finish' ? [] : [targetOf(party, move)])],
-        emoji,
-      ),
-      ...(cannotMove(party, move) === undefined ? {} : { disabled: true }),
-    };
-  });
-  const reverse =
-    cannotReverse(party) === undefined
-      ? [
-          actionRow([
-            partyButton(
-              party.id,
-              'reverse',
-              'Reverse the route',
-              ButtonStyle.Secondary,
-              // The stop the route begins with, so that one panel reverses it once.
-              [place, first === undefined ? '' : stopHandle(first)],
-              '🔃',
-            ),
-          ]),
-        ]
-      : [];
-  const text = ['### Manage the train', ...(note === undefined ? [] : [note]), panelWhere(view)];
-  const components: APIComponentInContainer[] = [
-    textDisplay(text.join('\n')),
-    actionRow(moves),
-    ...reverse,
-    separator(),
-    textDisplay('**At the end of the route**'),
-    menuRow(atEndMenu(view, place)),
-    textDisplay(`**${TRAIN_KIND_QUESTION}**`),
-    menuRow(kindMenu(party)),
-  ];
-  return { v2: true, components: [container(TRAIN_PANEL_COLOUR, components)] };
-}
-
-/**
- * A panel that only says something, without controls: what takes the place of the panel when
- * its member may no longer move the train, or the train has ended.
- */
-export function panelNote(text: string): V2Message {
-  return { v2: true, components: [container(TRAIN_PANEL_COLOUR, [textDisplay(text)])] };
-}
-
-/** How a train got to where it is, for the message that tells the members. */
-export interface Movement {
-  /**
-   * On to a stop, back to one, on past one, to the end of the route, round from its end to its
-   * start (a loop), or back along it from its end (a train that turns back).
-   */
-  kind: 'to' | 'back' | 'skip' | 'finished' | 'round' | 'turn';
-  /** The stop the train is at now (not for `finished`), as it is now. */
-  at?: PostStop;
-  /** The stop that was left out, for `skip`, and for `round` and `turn` by a skip. */
-  skipped?: PostStop | undefined;
-  /** The stop the train turned back at, for `turn`. */
-  turnedAt?: PostStop | undefined;
-  /** The member who moved the train. */
-  by: NamedMember;
-}
-
-/** A stop that cannot be named in a movement (none was given). */
-const UNKNOWN_STOP = '**an unknown stop**';
-
-/**
- * What the post is told when the train has moved: where it is going, with the link to the
- * place, and who moved it. The mentions of the members are the caller's.
- */
-export function movementText(movement: Movement): string {
-  const by = `Moved by ${memberText(movement.by)}.`;
-  if (movement.kind === 'finished') return `The train has finished its route. ${by}`;
-  const where = movement.at === undefined ? UNKNOWN_STOP : stopLink(movement.at);
-  // A sentence that ends with a place ends once (plan 8X-F: "Inc.." read twice).
-  if (movement.kind === 'back')
-    return `${endSentence(`The train is moving back to ${where}`)} ${by}`;
-  const skipping =
-    movement.kind !== 'to' && 'skipped' in movement
-      ? `, skipping ${movement.skipped === undefined ? UNKNOWN_STOP : stopInWords(movement.skipped)}`
-      : '';
-  if (movement.kind === 'round') {
-    return `${endSentence(`The train is going round again, back to ${where}${skipping}`)} ${by}`;
-  }
-  if (movement.kind === 'turn') {
-    const turned = movement.turnedAt === undefined ? UNKNOWN_STOP : stopInWords(movement.turnedAt);
-    return `${endSentence(`The train is turning back at ${turned}, on to ${where}${skipping}`)} ${by}`;
-  }
-  return `${endSentence(`The train is moving to ${where}${skipping}`)} ${by}`;
-}
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index a868cc3412134c45626fab6a7c04d8900ce08d97..512bd2b5b29036b21a60ff0d97026afdc2d70f9d 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -1,15 +1,9 @@
-import {
-  ComponentType,
-  type APIButtonComponentWithCustomId,
-  type APIStringSelectComponent,
-} from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { expectSendable, expectV2Sendable } from '../../test/support/post-limits.js';
+import { expectSendable } from '../../test/support/post-limits.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
 import {
   accentOf,
-  allComponents,
   buttonLabels,
   buttonNames,
   buttonsOf,
@@ -17,7 +11,6 @@ import {
   customIdsOf,
   partTexts,
   sectionsOf,
-  selectsOf,
   textDisplays,
   textOf,
   thumbnailBeside,
@@ -65,13 +58,7 @@ import { shownBoss, type PostGym } from './raid-post.js';
 import { LIMITS } from './text.js';
 import { stopLink, stopsFrom } from './train-stops.js';
 import { gymStop } from '../domain/party/stops.js';
-import {
-  movementText,
-  panelNote,
-  TRAIN_PANEL_COLOUR,
-  trainPanel,
-  whereText,
-} from './train-panel.js';
+import { movementText, whereText } from './train-words.js';
 import {
   renderTrainPost,
   routeLines,
@@ -179,7 +166,7 @@ function everySplit(character: string): Pick<TrainDetails, 'splitFrom' | 'splitO
   };
 }
 
-/** The labels of a message's buttons, of those that have one (Group…, Manage train…, …). */
+/** The labels of a message's buttons, of those that have one (Group…, Move…, …). */
 const labelled = (message: Parameters<typeof buttonLabels>[0]): (string | undefined)[] =>
   buttonLabels(message).filter((label) => label !== undefined);
 
@@ -309,16 +296,17 @@ describe('renderTrainPost', () => {
     expect(where(onRoute(SEVEN, 3))).toBe(
       `**Where · stop 4 of 7**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
     );
-    // Under it the next two stops and how many more; Manage train… and Whole route are in the
+    // Under it the next two stops and how many more; Move…, Manage… and Route are in the
     // third row of the controls, after Group… (plan 8X-1B).
     expect(ahead(onRoute(SEVEN, 3))).toBe(
       '-# Next: 5. Starbucks · 6. Maple Leaf Mosaic, and 1 more to the end',
     );
-    expect(labelled(post.message)).toEqual(['Group…', 'Manage train…', 'Whole route']);
+    expect(labelled(post.message)).toEqual(['Group…', 'Move…', 'Manage…', 'Route']);
     const { id } = onRoute(SEVEN);
-    expect(customIdsOf(post.message).slice(-3)).toEqual([
+    expect(customIdsOf(post.message).slice(-4)).toEqual([
       `party:${id}:regroup`,
       `party:${id}:move`,
+      `party:${id}:manage`,
       `party:${id}:route`,
     ]);
   });
@@ -354,13 +342,13 @@ describe('renderTrainPost', () => {
     );
   });
 
-  it('lists a route of three stops or fewer whole, with its mode, and has no Whole route', () => {
+  it('lists a route of three stops or fewer whole, with its mode, and has no Route', () => {
     const looping = onRoute([4, 1, 7], 1, { atEnd: 'loop' });
     expect(ahead(looping)).toBe(
       '-# Route: 1. Veterans Memorial Bridge · **2. The Stacks** · 3. Harbor Lighthouse Mural, loops',
     );
     expect(where(looping)).toMatch(/^\*\*Where · stop 2 of 3\*\*\n\*\*The Stacks\*\* · /);
-    expect(buttonLabels(renderTrainPost(view(looping)).message)).not.toContain('Whole route');
+    expect(buttonLabels(renderTrainPost(view(looping)).message)).not.toContain('Route');
     expect(ahead(onRoute([4, 1], 0, { atEnd: 'turn-back' }))).toBe(
       '-# Route: **1. Veterans Memorial Bridge** · 2. The Stacks, turns back at the end',
     );
@@ -379,24 +367,25 @@ describe('renderTrainPost', () => {
         '-# Route: 1. Veterans Memorial Bridge · 2. The Stacks · 3. Harbor Lighthouse Mural',
       );
     }
-    // Manage train… stays: Previous and Reverse take a Finish back.
-    expect(buttonLabels(short.message)).toContain('Manage train…');
-    expect(buttonLabels(short.message)).not.toContain('Whole route');
+    // Move… and Manage… stay: Previous and Reverse take a Finish back.
+    expect(buttonLabels(short.message)).toContain('Move…');
+    expect(buttonLabels(short.message)).toContain('Manage…');
+    expect(buttonLabels(short.message)).not.toContain('Route');
     expect(accentOf(short.message)).toBe(0x3498db);
     expect(short.tags).toEqual(['Train']);
     expect(thumbnailsOf(short.message)).toEqual([]);
-    // A long one is not: Whole route shows it.
+    // A long one is not: Route shows it.
     const long = renderTrainPost(view(onRoute(SEVEN, 7)));
     expect(where(onRoute(SEVEN, 7))).toBe('**Where**\nRoute complete');
     expect(ahead(onRoute(SEVEN, 7))).toBeUndefined();
-    expect(labelled(long.message)).toEqual(['Group…', 'Manage train…', 'Whole route']);
+    expect(labelled(long.message)).toEqual(['Group…', 'Move…', 'Manage…', 'Route']);
   });
 
-  it('says how to add a stop to a train without a route, with Manage train… alone', () => {
+  it('says how to add a stop to a train without a route, with Manage… alone (no Move…)', () => {
     const post = renderTrainPost(view(testTrain()));
     expect(where(testTrain())).toBe('**Where**\nNo route yet: `/route add` adds a stop.');
     expect(ahead(testTrain())).toBeUndefined();
-    expect(labelled(post.message)).toEqual(['Group…', 'Manage train…']);
+    expect(labelled(post.message)).toEqual(['Group…', 'Manage…']);
   });
 
   it('lists a route that turned back or was reversed in its new order, numbered anew', () => {
@@ -413,17 +402,20 @@ describe('renderTrainPost', () => {
     );
   });
 
-  it('leaves Manage train… out of a copy in another region, and keeps Whole route', () => {
+  it('leaves Move… and Manage… out of a copy in another region, and keeps Route', () => {
     const post = renderTrainPost(view(onRoute(SEVEN, 1)));
     const copy = renderMirror('region', post, {
       postId: '900000000000000001',
       regionChannelId: undefined,
     });
-    expect(buttonLabels(copy)).toContain('Whole route');
-    expect(buttonLabels(copy)).not.toContain('Manage train…');
+    expect(buttonLabels(copy)).toContain('Route');
+    expect(buttonLabels(copy)).not.toContain('Move…');
+    expect(buttonLabels(copy)).not.toContain('Manage…');
     // Every other button as the post has it, in its three rows; Group… too.
     expect(buttonsOf(copy)).toEqual(
-      buttonsOf(post.message).filter((button) => button.label !== 'Manage train…'),
+      buttonsOf(post.message).filter(
+        (button) => button.label !== 'Move…' && button.label !== 'Manage…',
+      ),
     );
     expect(buttonNames(copy)).toEqual([
       '🤔',
@@ -434,7 +426,7 @@ describe('renderTrainPost', () => {
       '⬆️',
       '📡',
       'Group…',
-      'Whole route',
+      'Route',
     ]);
     // A short route's copy has neither.
     const short = renderMirror('region', renderTrainPost(view(onRoute([4, 1]))), {
@@ -512,8 +504,8 @@ describe('renderTrainPost', () => {
       `**Where · stop 1 of 2**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
     );
     expect(thumbnailBeside(first.message, LOCATION)).toBe(`${picture(4)}=s400`);
-    // Manage train… is in the third row, after Group… (plan 8X-1B).
-    expect(labelled(first.message)).toEqual(['Group…', 'Manage train…']);
+    // Move… and Manage… are in the third row, after Group… (plans 8X-1B, 8X-G).
+    expect(labelled(first.message)).toEqual(['Group…', 'Move…', 'Manage…']);
     const next = post(onRoute([4, 11], 1));
     expect(block(next, LOCATION)).toBe(
       `**Where · stop 2 of 2**\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
@@ -559,8 +551,9 @@ describe('renderTrainPost', () => {
       '⬆️',
       '📡',
       'Group…',
-      'Manage train…',
-      'Split group…',
+      'Move…',
+      'Manage…',
+      'Split…',
     ]);
   });
 
@@ -621,21 +614,17 @@ describe('renderTrainPost', () => {
     };
     const post = renderTrainPost(view(train, { stop: lookup(long) }));
     // Each group one text, the buttons in three rows (plan 8X-1B): within Discord's 40 with the
-    // picture and Split group… (before, 44 unfolded and four groups folded to 40).
-    expect(componentCount(post.message)).toBe(31);
+    // picture, Move…, Manage… and Split… (plan 8X-G: one more than Manage train… alone; before
+    // 8X-1B, 44 unfolded and four groups folded to 40).
+    expect(componentCount(post.message)).toBe(32);
     expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
     expectSendable(post);
     expect(thumbnailBeside(post.message, '**Where')).toBe(
       `https://lh3.googleusercontent.com/${'p'.repeat(200)}=s400`,
     );
     expect(sectionsOf(post.message).filter(({ button }) => button !== undefined)).toEqual([]);
-    // Split group… is there too: five groups.
-    expect(labelled(post.message)).toEqual([
-      'Group…',
-      'Manage train…',
-      'Split group…',
-      'Whole route',
-    ]);
+    // Split… is there too: five groups.
+    expect(labelled(post.message)).toEqual(['Group…', 'Move…', 'Manage…', 'Split…', 'Route']);
     // Where it is and the next two stops, however long the route.
     expect(block(post, '**Where')).toMatch(/^\*\*Where · stop 31 of 50\*\*\n\*\*Long gym name /);
     expect(block(post, '-# Next')).toMatch(
@@ -654,7 +643,7 @@ describe('renderTrainPost', () => {
     for (const heading of headings) expect(heading).toMatch(/ · \d+\/4 coming · \d+ interested · /);
     expect(textOf(sized.message)).toContain(LOBBY_OVER);
     expect(textOf(sized.message)).not.toContain('so split up');
-    expect(buttonLabels(sized.message)).toContain('Split group…');
+    expect(buttonLabels(sized.message)).toContain('Split…');
   });
 });
 
@@ -788,7 +777,7 @@ describe('the controls of a train post', () => {
       (button) => decodeCustomId(button.customId ?? '')?.action === action,
     );
 
-  it('are the rows of a raid without Done and Meet…, with a grey "Manage train…" after Group…', () => {
+  it('are the rows of a raid without Done and Meet…, with a grey "Manage…" after Group…', () => {
     // Plan 8X-1B: the same places in raids and trains (Matt, 2026-10-20).
     const train = testTrain();
     expect(controls(train)).toEqual([
@@ -800,15 +789,16 @@ describe('the controls of a train post', () => {
       ['⬆️', 'more'],
       ['📡', 'remote'],
       ['Group…', 'regroup'],
-      ['Manage train…', 'move'],
+      // No Move… without a route (plan 8X-G).
+      ['Manage…', 'manage'],
     ]);
-    const move = buttonOf(train, 'move');
+    const move = buttonOf(train, 'manage');
     // Secondary: grey.
     expect(move?.style).toBe(2);
     expect(decodeCustomId(move?.customId ?? '')).toEqual({
       kind: 'party',
       id: train.id,
-      action: 'move',
+      action: 'manage',
       args: [],
     });
   });
@@ -827,25 +817,27 @@ describe('the controls of a train post', () => {
       'more',
       'remote',
       'regroup',
-      'move',
+      'manage',
       'split',
     ]);
   });
 
-  it('have a grey "Split group…" after Manage train… only with two groups of somebody', () => {
+  it('have a grey "Split…" after Manage… only with two groups of somebody', () => {
     const two: TrainParty = {
       ...withAttendees(onRoute(SEVEN, 2), { [ALICE]: { group: 'B' } }),
       groups: [{ id: 'A' }, { id: 'B' }],
     };
-    expect(controls(two).slice(-4)).toEqual([
+    expect(controls(two).slice(-5)).toEqual([
       ['Group…', 'regroup'],
-      ['Manage train…', 'move'],
-      ['Split group…', 'split'],
-      ['Whole route', 'route'],
+      ['Move…', 'move'],
+      ['Manage…', 'manage'],
+      ['Split…', 'split'],
+      ['Route', 'route'],
     ]);
     const split = buttonOf(two, 'split');
     expect(split?.style).toBe(2);
-    expect(split?.emoji).toBe('✂️');
+    // Words only on a train's third row (Matt, 2026-10-22).
+    expect(split?.emoji).toBeUndefined();
     expect(decodeCustomId(split?.customId ?? '')).toEqual({
       kind: 'party',
       id: two.id,
@@ -862,216 +854,25 @@ describe('the controls of a train post', () => {
       groups: [{ id: 'A' }, { id: 'B' }],
     };
     expect(controls(whole).map(([, action]) => action)).not.toContain('split');
-    // Not on a copy in another region, as Manage train…; the copy keeps Group… and Whole route.
+    // Not on a copy in another region, as Move… and Manage…; the copy keeps Group… and Route.
     const copy = renderMirror('region', renderTrainPost(view(two)), {
       postId: '900000000000000001',
       regionChannelId: '100000000000000001',
     });
-    expect(buttonsOf(copy).map((button) => button.label)).not.toContain('Split group…');
-    expect(buttonsOf(copy).map((button) => button.label)).toContain('Whole route');
+    expect(buttonsOf(copy).map((button) => button.label)).not.toContain('Split…');
+    expect(buttonsOf(copy).map((button) => button.label)).toContain('Route');
     expect(buttonsOf(copy).map((button) => button.label)).toContain('Group…');
   });
 
-  it('are the same wherever the train is and whoever leads it', () => {
+  it('are the same wherever the train is and whoever leads it, Move… while it has a route', () => {
     const base = controls(onRoute([4, 1]));
     expect(controls(onRoute([4, 1], 2, { conductorId: ALICE }))).toEqual(base);
-    expect(controls(testTrain())).toEqual(base);
+    // Without a route there is nothing to move along (plan 8X-G).
+    expect(controls(testTrain())).toEqual(base.filter(([, action]) => action !== 'move'));
   });
 });
 
-describe('trainPanel', () => {
-  /** The buttons of the panel: label, emoji, action, switched off. */
-  const buttons = (party: TrainParty) =>
-    allComponents(trainPanel({ party, stop: lookup(gym) }))
-      .filter((component) => (component as { type?: number }).type === ComponentType.Button)
-      .map((component) => {
-        const button = component as APIButtonComponentWithCustomId;
-        return [
-          button.label,
-          button.emoji?.name,
-          decodeCustomId(button.custom_id)?.action,
-          button.disabled ?? false,
-        ];
-      });
-  /** What the controls of the panel carry: their actions and arguments. */
-  const drawnAt = (party: TrainParty) =>
-    customIdsOf(trainPanel({ party, stop: lookup(gym) })).map((id) => decodeCustomId(id)?.args);
-  const first = (party: TrainParty, note?: string) =>
-    textDisplays(trainPanel({ party, stop: lookup(gym) }, note))[0];
-
-  it('is one grey container: where the train is and what comes next, the moves, and the menu of the mode', () => {
-    const train = onRoute([4, 1, 7], 1);
-    const panel = trainPanel({ party: train, stop: lookup(gym) });
-    expect(panel.components).toHaveLength(1);
-    expect(accentOf(panel)).toBe(TRAIN_PANEL_COLOUR);
-    expect(textDisplays(panel)).toEqual([
-      [
-        '### Manage the train',
-        `At stop 2 of 3: [The Stacks](${maps(1)})`,
-        `Next is [Harbor Lighthouse Mural](${maps(7)})`,
-      ].join('\n'),
-      '**At the end of the route**',
-      '**What the train is mainly for**',
-    ]);
-    expect(buttons(train)).toEqual([
-      ['Next', '▶️', 'next', false],
-      ['Previous', '◀️', 'previous', false],
-      ['Skip', '⏭️', 'skip', true],
-      ['Finish', '🏁', 'finish', false],
-    ]);
-    expect(buttonsOf(panel).map((button) => button.style)).toEqual([1, 2, 2, 2]);
-    const [menu] = selectsOf(panel);
-    expect(menu?.customId).toBe(`party:${train.id}:atend:1`);
-    // Discord shows the chosen option's label alone while the menu is closed: it says it all.
-    expect(menu?.options.map((option) => option.label)).toEqual([
-      'Finish at the last stop',
-      'Loop: back to the first stop',
-      'Turn back at the end',
-    ]);
-    expectV2Sendable(panel);
-  });
-
-  it('shows the mode the train has as chosen', () => {
-    const chosen = (party: TrainParty) =>
-      (
-        allComponents(trainPanel({ party, stop: lookup(gym) })).find(
-          (component) => (component as { type?: number }).type === ComponentType.StringSelect,
-        ) as APIStringSelectComponent | undefined
-      )?.options
-        .filter((option) => option.default === true)
-        .map((option) => option.value);
-    expect(chosen(onRoute([4, 1, 7]))).toEqual(['finish']);
-    expect(chosen(onRoute([4, 1, 7], 0, { atEnd: 'loop' }))).toEqual(['loop']);
-    expect(chosen(onRoute([4, 1, 7], 0, { atEnd: 'turn-back' }))).toEqual(['turn-back']);
-  });
-
-  it('says at the last stop what Next does there, as the mode says', () => {
-    expect(first(onRoute([4, 1, 7], 2))).toBe(
-      '### Manage the train\n' +
-        `At stop 3 of 3: [Harbor Lighthouse Mural](${maps(7)})\n` +
-        'It is the last stop: Next finishes the route',
-    );
-    expect(first(onRoute([4, 1, 7], 2, { atEnd: 'loop' }))).toMatch(
-      new RegExp(`\\nNext goes round to \\[Veterans Memorial Bridge\\]`),
-    );
-    expect(first(onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }))).toMatch(
-      /\nNext turns back to \[The Stacks\]/,
-    );
-    // A route of one stop finishes in every mode.
-    expect(first(onRoute([4], 0, { atEnd: 'loop' }))).toMatch(
-      /\nIt is the last stop: Next finishes the route$/,
-    );
-    // A finished route says where Previous leads, and a note goes above where the train is.
-    expect(first(onRoute([4, 1], 2), 'The train has moved on meanwhile.')).toBe(
-      '### Manage the train\nThe train has moved on meanwhile.\n' +
-        `The train has finished its route of 2 stops. Previous takes it back to stop 2: [The Stacks](${maps(1)}).`,
-    );
-  });
-
-  it('carries where the train was and where each move leads, also round the end and back', () => {
-    // Each control says where the train was when the panel was drawn: the gym of its stop.
-    // Next, Previous and Skip also say where they lead: the gym of that stop, or the end.
-    expect(drawnAt(onRoute([4, 1, 7], 0))).toEqual([
-      ['4', '1'],
-      ['4', '4'],
-      ['4', '7'],
-      ['4'],
-      // Reverse: also the gym the route begins with.
-      ['4', '4'],
-    ]);
-    expect(drawnAt(onRoute([9, 4, 1], 1))).toEqual([['4', '1'], ['4', '9'], ['4', 'end'], ['4']]);
-    expect(drawnAt(onRoute([4, 1, 7], 2))).toEqual([
-      ['7', 'end'],
-      ['7', '1'],
-      ['7', 'end'],
-      ['7'],
-      ['7', '4'],
-    ]);
-    // Round the end of a loop, and back along a route that turns back.
-    expect(drawnAt(onRoute([4, 1, 7], 2, { atEnd: 'loop' }))?.slice(0, 3)).toEqual([
-      ['7', '4'],
-      ['7', '1'],
-      ['7', '1'],
-    ]);
-    expect(drawnAt(onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }))?.slice(0, 3)).toEqual([
-      ['7', '1'],
-      ['7', '1'],
-      ['7', '4'],
-    ]);
-    // From the end, Previous leads to the last stop of a route that remembers no other...
-    expect(drawnAt(onRoute([4, 1, 7], 3))?.slice(0, 4)).toEqual([
-      ['end', 'end'],
-      ['end', '7'],
-      ['end', 'end'],
-      ['end'],
-    ]);
-    // ...and otherwise to the stop the route was finished from.
-    expect(drawnAt(onRoute([4, 1, 7], 3, { finishedFrom: 4 }))?.[1]).toEqual(['end', '4']);
-  });
-
-  it('switches off what cannot be done from where the train is', () => {
-    const disabled = (party: TrainParty) =>
-      buttons(party)
-        .filter(([, , , off]) => off)
-        .map(([, , action]) => action);
-    expect(disabled(onRoute([4, 1, 7], 1))).toEqual(['skip']);
-    expect(disabled(onRoute([4, 1, 7, 2], 1))).toEqual([]);
-    expect(disabled(onRoute([4, 1, 7], 2))).toEqual(['skip']);
-    expect(disabled(onRoute([4, 1, 7], 3))).toEqual(['next', 'skip', 'finish']);
-    // Without a route there is nothing to move along: no moves at all (plan 8X-4).
-    expect(buttons(testTrain())).toEqual([]);
-    // Previous at the first stop of a loop leads to the last; Skip goes round.
-    expect(disabled(onRoute([4, 1, 7], 0, { atEnd: 'loop' }))).toEqual([]);
-    expect(disabled(onRoute([4, 1, 7], 2, { atEnd: 'loop' }))).toEqual([]);
-    expect(disabled(onRoute([4, 1, 7], 0, { atEnd: 'turn-back' }))).toEqual(['previous']);
-    expect(disabled(onRoute([4, 1, 7], 1, { atEnd: 'turn-back' }))).toEqual(['skip']);
-  });
-
-  it('offers Reverse only where the route may be reversed', () => {
-    const reverse = (party: TrainParty) =>
-      buttons(party).filter(([, , action]) => action === 'reverse');
-    expect(reverse(onRoute([4, 1, 7], 0))).toEqual([['Reverse the route', '🔃', 'reverse', false]]);
-    expect(reverse(onRoute([4, 1, 7], 2))).toHaveLength(1);
-    expect(reverse(onRoute([4, 1, 7], 1))).toEqual([]);
-    expect(reverse(onRoute([4, 1, 7], 3, { finishedFrom: 7 }))).toHaveLength(1);
-    expect(reverse(onRoute([4, 1, 7], 3, { finishedFrom: 1 }))).toEqual([]);
-    expect(reverse(onRoute([4, 1, 7], 1, { atEnd: 'loop' }))).toHaveLength(1);
-    expect(reverse(onRoute([4, 1, 7], 0, { atEnd: 'turn-back' }))).toEqual([]);
-    expect(reverse(onRoute([4], 0))).toEqual([]);
-    // Reverse carries where the train was and the gym the route began with.
-    expect(drawnAt(onRoute([4, 1, 7], 3, { finishedFrom: 7 })).at(-1)).toEqual(['end', '4']);
-    expect(drawnAt(onRoute([4, 1, 7], 0)).at(-1)).toEqual(['4', '4']);
-  });
-
-  it('keeps within what Discord takes with the longest names that need escaping', () => {
-    const heavy = (id: number): PostGym => ({
-      name: `${'[*]'.repeat(84)}${id}`,
-      nickname: null,
-      lat: 40,
-      lon: -80,
-      notice: null,
-      taggedEx: true,
-      confirmedEx: false,
-    });
-    for (const atEnd of TRAIN_AT_END) {
-      const party = onRoute([4294967295, 4294967294, 4294967293], 2, { atEnd });
-      const panel = trainPanel(
-        { party, stop: lookup(heavy) },
-        'That button no longer leads where it said.',
-      );
-      expectV2Sendable(panel);
-      expect(componentCount(panel)).toBeLessThanOrEqual(MAX_COMPONENTS);
-    }
-  });
-
-  it('says only something, without controls, as a note', () => {
-    const note = panelNote('This train is over.');
-    expect(textOf(note)).toBe('This train is over.');
-    expect(buttonsOf(note)).toEqual([]);
-    expect(accentOf(note)).toBe(TRAIN_PANEL_COLOUR);
-    expectV2Sendable(note);
-  });
-
+describe('whereText', () => {
   it('says the last stop, a finished route and a train without a route, in the answer to a command', () => {
     expect(whereText({ party: onRoute([4, 1], 1), stop: lookup(gym) })).toBe(
       `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). ` +
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index 3e4ee6ecd9b7830a49bc3a446e79c86dd9beabed..31eecb43e21b09f2cc1f78bbd94f5ec32d96cb01 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -10,6 +10,7 @@ import {
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import {
   bottomControls,
+  manageTrainButton,
   moveTrainButton,
   splitGroupButton,
   wholeRouteButton,
@@ -137,7 +138,7 @@ const TOWARD_WORDS = {
  * more (`Next: 3. C · 4. D, and 3 more to the end`), looking past the end of a loop or a train
  * that turns back; `This is the last stop.` at the last stop of one that finishes. Nothing for a
  * train without a route or a long route that is finished. The names are plain, without links
- * (Where has the Map of the current stop, Whole route the rest), each cut alike when the line is
+ * (Where has the Map of the current stop, Route the rest), each cut alike when the line is
  * too long (`fit.part`).
  */
 function aheadLine(view: TrainPostView, fit: Fit): PostBlock[] {
@@ -195,8 +196,8 @@ function aheadLine(view: TrainPostView, fit: Fit): PostBlock[] {
  * Where the train is (Matt, 2026-10-17): `**Where · stop 2 of 7**` and its current stop as a
  * raid's gym (`stopWhere`: a gym or a power spot, its address and Map, a gym's notice, its picture);
  * `Route complete` once the route is finished, how to add a stop while it has none; then what
- * lies ahead (`aheadLine`). Its buttons, "Manage train…" and "Whole route", are in the third row
- * of the controls since plan 8X-1B (`trainLayout`).
+ * lies ahead (`aheadLine`). Its buttons, "Move…", "Manage…", "Split…" and "Route", are in the
+ * third row of the controls (plans 8X-1B, 8X-G; `trainLayout`).
  */
 function trainWhere(view: TrainPostView, fit: Fit): PostBlock[] {
   const { party } = view;
@@ -297,10 +298,12 @@ function trainLayout(view: TrainPostView): PostLayout {
         type: 'controls',
         rows: bottomControls(party, {
           emoji: view.emoji,
-          // After Group…, in the third row (plan 8X-1B): Manage train… and Split group… for the
-          // train's own post (`moves`), Whole route for its copies too.
+          // After Group…, in the third row (plans 8X-1B, 8X-G): Move… (while there is a route to
+          // move along), Manage… and Split… for the train's own post (`moves`), Route for its
+          // copies too.
           opens: [
-            moveTrainButton(party),
+            ...(party.train.route.length > 0 ? [moveTrainButton(party)] : []),
+            manageTrainButton(party),
             // Plan 8T: only while there is a group to split off from another with somebody in it.
             ...(splitsPossible(party) ? [splitGroupButton(party)] : []),
             ...(party.train.route.length > WHOLE_ROUTE_STOPS ? [wholeRouteButton(party)] : []),
diff --git a/src/render/train-words.ts b/src/render/train-words.ts
index c2503ba0b15f275bd50f44162f1ba3b18f33fc69..5ca8633c3de8c383b550ad534e7d8e194f084e39 100644
--- a/src/render/train-words.ts
+++ b/src/render/train-words.ts
@@ -1,4 +1,14 @@
 import type { TrainAtEnd, TrainKind } from '../domain/party/party.js';
+import {
+  currentStop,
+  destinationOf,
+  nextStop,
+  routeFinished,
+  turnAhead,
+} from '../domain/party/train.js';
+import { count, endSentence, memberText, type NamedMember } from './text.js';
+import type { TrainPlaces } from './train-post.js';
+import { stopInWords, stopLink, type PostStop } from './train-stops.js';
 import { TRAIN_KIND_WORDS } from '../domain/web/party-data.js';
 
 /**
@@ -40,7 +50,7 @@ export const TRAIN_KIND_DESCRIPTIONS: Readonly<Record<TrainKind, string>> = {
 
 /**
  * The words of what a train does at the end of its route (`TrainAtEnd`), worded once for every
- * place that names it: the choices of `/train`'s option `at-end`, the menu of the Manage train
+ * place that names it: the choices of `/train`'s option `at-end`, Manage…'s menu and the map's
  * panel, the lines of the post and `/route show`.
  */
 
@@ -81,3 +91,129 @@ export function atEndSetWords(atEnd: TrainAtEnd): string {
       return 'to turn back at the end';
   }
 }
+
+/**
+ * The labels of the options of Manage…'s menu of what the train does at the end of its route
+ * (and of the panel before plan 8X-G): Discord shows the chosen one alone while a menu is
+ * closed, so each says it in full (the choices of `/train` keep the short `AT_END_LABELS`).
+ */
+export const AT_END_MENU_LABELS: Readonly<Record<TrainAtEnd, string>> = {
+  finish: 'Finish at the last stop',
+  loop: 'Loop: back to the first stop',
+  'turn-back': 'Turn back at the end',
+};
+
+/** The emoji of the options of the menu of what the train does at the end of its route. */
+export const AT_END_EMOJI: Readonly<Record<TrainAtEnd, string>> = {
+  finish: '🏁',
+  loop: '🔁',
+  'turn-back': '↩️',
+};
+
+/** The emoji of the options of the menu of the kind of a train. */
+export const TRAIN_KIND_EMOJI: Readonly<Record<TrainKind, string>> = {
+  raid: '⚔️',
+  dynamax: '🔴',
+  gigantamax: '🌋',
+};
+
+/**
+ * What Next does from where the train is, in words: `Next is X`, and at the last stop `It is
+ * the last stop: Next finishes the route`, `Next goes round to X` (a loop) or `Next turns back to
+ * X`. `link` shows a stop.
+ */
+function nextWords(view: TrainPlaces, link: (stop: PostStop) => string): string {
+  const { party } = view;
+  const next = nextStop(party);
+  if (next === undefined) return 'It is the last stop: Next finishes the route';
+  const where = link(view.stop(next));
+  switch (turnAhead(party)) {
+    case 'round':
+      return `Next goes round to ${where}`;
+    case 'back':
+      return `Next turns back to ${where}`;
+    default:
+      return `Next is ${where}`;
+  }
+}
+
+/** Of a finished route: where Previous takes the train back to. */
+function finishedWords(view: TrainPlaces, link: (stop: PostStop) => string): string {
+  const { route } = view.party.train;
+  const back = destinationOf(view.party, 'previous').stop;
+  const ref = route[back];
+  return (
+    `The train has finished its route of ${count(route.length, 'stop')}. ` +
+    endSentence(
+      `Previous takes it back to stop ${back + 1}: ` +
+        (ref === undefined ? '' : link(view.stop(ref))),
+    )
+  );
+}
+
+/** What is said of a train without a route, in the answer to a command and in Manage…. */
+export const NO_ROUTE_YET = 'This train has no route yet. Add its stops with `/route add`.';
+
+/**
+ * Where a train is on its route and what comes next, as a member is told it in the answer to a
+ * move (`/next` and the others, Move…'s and Manage…'s Submit). Of a finished route it says where
+ * Previous leads, which is how a Finish that was a mistake is taken back: to the stop the train
+ * was at, or to the last stop of a route that remembers none.
+ */
+export function whereText(view: TrainPlaces): string {
+  const { party } = view;
+  const { route, stop } = party.train;
+  if (route.length === 0) return NO_ROUTE_YET;
+  const link = (shown: PostStop) => stopLink(shown);
+  if (routeFinished(party)) return finishedWords(view, link);
+  const at = currentStop(party);
+  const here = endSentence(
+    `The train is at stop ${stop + 1} of ${route.length}: ${at === undefined ? '' : link(view.stop(at))}`,
+  );
+  return `${here} ${endSentence(nextWords(view, link))}`;
+}
+
+/** How a train got to where it is, for the message that tells the members. */
+export interface Movement {
+  /**
+   * On to a stop, back to one, on past one, to the end of the route, round from its end to its
+   * start (a loop), or back along it from its end (a train that turns back).
+   */
+  kind: 'to' | 'back' | 'skip' | 'finished' | 'round' | 'turn';
+  /** The stop the train is at now (not for `finished`), as it is now. */
+  at?: PostStop;
+  /** The stop that was left out, for `skip`, and for `round` and `turn` by a skip. */
+  skipped?: PostStop | undefined;
+  /** The stop the train turned back at, for `turn`. */
+  turnedAt?: PostStop | undefined;
+  /** The member who moved the train. */
+  by: NamedMember;
+}
+
+/** A stop that cannot be named in a movement (none was given). */
+const UNKNOWN_STOP = '**an unknown stop**';
+
+/**
+ * What the post is told when the train has moved: where it is going, with the link to the
+ * place, and who moved it. The mentions of the members are the caller's.
+ */
+export function movementText(movement: Movement): string {
+  const by = `Moved by ${memberText(movement.by)}.`;
+  if (movement.kind === 'finished') return `The train has finished its route. ${by}`;
+  const where = movement.at === undefined ? UNKNOWN_STOP : stopLink(movement.at);
+  // A sentence that ends with a place ends once (plan 8X-F: "Inc.." read twice).
+  if (movement.kind === 'back')
+    return `${endSentence(`The train is moving back to ${where}`)} ${by}`;
+  const skipping =
+    movement.kind !== 'to' && 'skipped' in movement
+      ? `, skipping ${movement.skipped === undefined ? UNKNOWN_STOP : stopInWords(movement.skipped)}`
+      : '';
+  if (movement.kind === 'round') {
+    return `${endSentence(`The train is going round again, back to ${where}${skipping}`)} ${by}`;
+  }
+  if (movement.kind === 'turn') {
+    const turned = movement.turnedAt === undefined ? UNKNOWN_STOP : stopInWords(movement.turnedAt);
+    return `${endSentence(`The train is turning back at ${turned}, on to ${where}${skipping}`)} ${by}`;
+  }
+  return `${endSentence(`The train is moving to ${where}${skipping}`)} ${by}`;
+}
diff --git a/src/services/party-mirrors.region.test.ts b/src/services/party-mirrors.region.test.ts
index 751926ef39d970b17eb03e98dbc5437cb871c4a1..5bc09c7887724331fde87036f3d84fad6c349977 100644
--- a/src/services/party-mirrors.region.test.ts
+++ b/src/services/party-mirrors.region.test.ts
@@ -18,7 +18,7 @@ import {
   type ImmediateWatch,
 } from '../../test/support/timers.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { MANAGE_TRAIN_LABEL } from '../render/party-controls.js';
+import { MANAGE_TRAIN_LABEL, MOVE_TRAIN_LABEL } from '../render/party-controls.js';
 import type { Member } from './attendance-service.js';
 import { RETRY_AFTER_MS } from './party-mirrors.js';
 import type { PartyServiceOptions } from './party-service.js';
@@ -87,10 +87,15 @@ describe('the copies of a train in the regions it stops in', () => {
     const made = await createdTrain({ route: stops(4, 7) });
     const [copy] = copiesIn(made, EAST_CHANNEL);
     const post = buttonsOf(made.gateway.posts.get(made.postId)?.message);
-    expect(post.at(-1)?.label).toBe(MANAGE_TRAIN_LABEL);
-    expect(buttonsOf(copy?.message)).toEqual(post.slice(0, -1));
+    // Move… and Manage… last (plan 8X-G): the copy has neither.
+    expect(post.slice(-2).map((button) => button.label)).toEqual([
+      MOVE_TRAIN_LABEL,
+      MANAGE_TRAIN_LABEL,
+    ]);
+    expect(buttonsOf(copy?.message)).toEqual(post.slice(0, -2));
     expect(customIdsOf(copy?.message)).toContain(`party:${made.party.id}:join`);
     expect(customIdsOf(copy?.message)).not.toContain(`party:${made.party.id}:move`);
+    expect(customIdsOf(copy?.message)).not.toContain(`party:${made.party.id}:manage`);
     // The copy at the bottom of the post itself keeps it.
     await made.service.showStatus(made.party.id);
     await made.service.flush();
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index c2fd88d1fbf53cb67026a70d9d8fc8cebf3de047..2bf5d85e0f069dcf238d12ceef8155651b60d86d 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -90,7 +90,9 @@ describe('PartyService.createTrain', () => {
     expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
     expect(tagsOf(made)).toEqual(['Train']);
     expect(post?.message).toEqual(renderTrainPost(made.service.trainView(made.current())).message);
-    expect(buttonLabels(post?.message)).toContain('Manage train…');
+    // Made without a route: Manage… and no Move… (plan 8X-G).
+    expect(buttonLabels(post?.message)).toContain('Manage…');
+    expect(buttonLabels(post?.message)).not.toContain('Move…');
     expect(post).toMatchObject({ edits: 0, renames: 0, retags: 0 });
   });
 
diff --git a/src/services/train-service.spots.test.ts b/src/services/train-service.spots.test.ts
index 5baccd083e9b092dae82dc40e33039661a70f4f2..2d5929f0f9ce07d7840d8cd9424384fcd7aa1949 100644
--- a/src/services/train-service.spots.test.ts
+++ b/src/services/train-service.spots.test.ts
@@ -6,9 +6,9 @@ import { createdTrain } from '../../test/support/party-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { keptRow } from '../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../test/support/wayspots.js';
-import { selectsOf } from '../../test/support/messages.js';
 import { spotStop } from '../domain/party/stops.js';
-import { trainPanel } from '../render/train-panel.js';
+import { manageDialog, moveDialog } from '../render/train-dialogs.js';
+import { dialogChoices } from '../../test/support/dialogs.js';
 import { stopsFrom } from '../render/train-stops.js';
 import type { Member } from './attendance-service.js';
 import type { GymProvider } from './gym-directory.js';
@@ -132,13 +132,17 @@ describe('power spots as stops of a train (plan 8X-4; design 6.2)', () => {
     );
     const made = await createdTrain({ route: ids.map(spotStop) }, { wayspots: kept.wayspots });
     const party = made.current();
-    const panel = trainPanel({
+    const view = {
       party,
       stop: stopsFrom(made.gyms ?? { get: () => undefined }, kept.wayspots),
-    });
+      now: Date.now(),
+    };
+    // Move… and Manage… (plan 8X-G): their dialogs' ids, and the values of Move…'s choices.
+    const move = moveDialog(view);
     const all = [
-      ...customIdsOf(panel),
-      ...selectsOf(panel).map((menu) => menu.customId),
+      move.custom_id,
+      manageDialog(view).custom_id,
+      ...dialogChoices(move).map((choice) => choice.value),
       ...customIdsOf(made.gateway.posts.get(made.postId)?.message),
     ];
     expect(all.length).toBeGreaterThan(5);
diff --git a/src/services/train-service.test.ts b/src/services/train-service.test.ts
index 6988ebe1f878f981146095ed5630e83a1c39063d..8f0cc6084fea17be849c0acdcab72ab1111ec1bf 100644
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -1,4 +1,4 @@
-import { describe, expect, it, onTestFinished } from 'vitest';
+import { describe, expect, it, onTestFinished, vi } from 'vitest';
 import { watchImmediates } from '../../test/support/timers.js';
 import { testGym, testGyms, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { ALICE, BOB, CAROL, REPORTER, stops, gym, inGyms } from '../../test/support/parties.js';
@@ -1304,3 +1304,100 @@ describe('TrainService: a saved route keeps its mode', () => {
     );
   });
 });
+
+describe('TrainService.manage (plan 8X-G: Manage…)', () => {
+  it('makes the kind, the route and the mode one change: one write, one line, in that order', async () => {
+    const made = await boarded();
+    const updates = vi.spyOn(made.store, 'update');
+    const outcome = await made.trains.manage(
+      made.party.id,
+      alice,
+      false,
+      { kind: 'gigantamax', route: 'reverse', atEnd: 'loop' },
+      { from: '4', first: '4' },
+    );
+    expect(outcome).toMatchObject({ kind: 'ok', changed: true, kindSet: true, route: 'reversed' });
+    expect(updates).toHaveBeenCalledTimes(1);
+    expect(made.current().train).toMatchObject({
+      kind: 'gigantamax',
+      route: stops(2, 7, 1, 4),
+      stop: 3,
+      atEnd: 'loop',
+    });
+    await settled(made);
+    expect(lines(made)).toEqual([
+      `**Alice** (<@${ALICE}>) made this a Gigantamax Train. The route was reversed by ` +
+        `**Alice** (<@${ALICE}>): it now runs from **Old Stone Fountain** to ` +
+        `**Veterans Memorial Bridge**. **Alice** (<@${ALICE}>) set the train to loop.`,
+    ]);
+  });
+
+  it('judges the route before the mode, and refuses all of it when one part is refused', async () => {
+    const made = await createdTrain({ route: [4, 1, 7, 2], atEnd: 'turn-back' });
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
+    // A turn-back route is not reversed, though the mode asked for with it would allow it.
+    const outcome = await made.trains.manage(
+      made.party.id,
+      alice,
+      false,
+      { kind: 'dynamax', route: 'reverse', atEnd: 'finish' },
+      { from: '4', first: '4' },
+    );
+    expect(outcome).toEqual({ kind: 'refused', reason: 'reverse-turns-back' });
+    expect(made.current().train).toMatchObject({
+      kind: 'raid',
+      atEnd: 'turn-back',
+      route: stops(4, 1, 7, 2),
+    });
+    // A dialog drawn where the train no longer is changes nothing of the route.
+    await made.trains.move(made.party.id, alice, 'next', false);
+    expect(
+      await made.trains.manage(
+        made.party.id,
+        alice,
+        false,
+        { route: 'finish' },
+        { from: '4', first: '4' },
+      ),
+    ).toEqual({ kind: 'refused', reason: 'train-moved-on' });
+    // The kind alone asks nothing of where the train is.
+    expect(
+      await made.trains.manage(
+        made.party.id,
+        alice,
+        false,
+        { kind: 'dynamax' },
+        { from: '4', first: '4' },
+      ),
+    ).toMatchObject({ kind: 'ok', changed: true });
+  });
+
+  it('finishes the route here as a movement, announced as a move is', async () => {
+    const made = await boarded();
+    const outcome = await made.trains.manage(
+      made.party.id,
+      alice,
+      false,
+      { route: 'finish' },
+      { from: '4', first: '4' },
+    );
+    expect(outcome).toMatchObject({ kind: 'ok', route: 'finished' });
+    expect(made.current().train.stop).toBe(4);
+    await settled(made);
+    expect(first(made)).toBe(`The train has finished its route. Moved by **Alice** (<@${ALICE}>).`);
+  });
+
+  it('changes nothing, and writes nothing, for what the train has already', async () => {
+    const made = await boarded();
+    const outcome = await made.trains.manage(
+      made.party.id,
+      alice,
+      false,
+      { kind: 'raid', atEnd: 'finish' },
+      { from: '4', first: '4' },
+    );
+    expect(outcome).toMatchObject({ kind: 'ok', changed: false });
+    await settled(made);
+    expect(lines(made)).toEqual([]);
+  });
+});
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index c94b81420e9a6f904d75ae4c9c51ea7060fdfd16..33d735b4c1fcc45efc276cef8a55d6941dc46cff 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -25,6 +25,7 @@ import {
   currentStop,
   moveStop,
   moveTrain,
+  placeOf,
   removeStop,
   replaceRoute,
   reverseRoute,
@@ -46,8 +47,13 @@ import { stopInWords, stopsFrom, type StopLookup } from '../render/train-stops.j
 import { doer } from '../render/activity.js';
 import { groupWords } from '../render/party-controls.js';
 import { count, endSentence, memberText, plain } from '../render/text.js';
-import { movementText, type Movement } from '../render/train-panel.js';
-import { atEndSentence, atEndSetWords, TRAIN_KIND_WORDS } from '../render/train-words.js';
+import {
+  atEndSentence,
+  atEndSetWords,
+  movementText,
+  TRAIN_KIND_WORDS,
+  type Movement,
+} from '../render/train-words.js';
 import type { Member } from './attendance-service.js';
 import { Gathered } from './gathered.js';
 import { pingInMessages, settingsOf, storedChange } from './party-change.js';
@@ -67,6 +73,37 @@ export type TrainChangeOutcome<Extra = unknown> =
   | { kind: 'refused'; reason: PartyProblem }
   | ({ kind: 'ok'; party: TrainParty; changed: boolean } & Extra);
 
+/** What Manage… asks of a train (plan 8X-G): each part only where it changes something. */
+export interface TrainManage {
+  kind?: TrainKind;
+  /** Reverse the route, or finish it at the stop the train is at. */
+  route?: 'reverse' | 'finish';
+  atEnd?: TrainAtEnd;
+}
+
+/** What Manage… changed: the kind, the route (and whether a reversal restarted it), the mode. */
+export interface TrainManaged {
+  kindSet: boolean;
+  route?: 'reversed' | 'finished';
+  restarted: boolean;
+  atEndSet: boolean;
+}
+
+/** The line of a kind set: `<doer> made this a Gigantamax Train.` */
+function kindLine(party: TrainParty, member: Member, kind: TrainKind): string {
+  const who = doer(party, member);
+  const what = TRAIN_KIND_WORDS[kind];
+  return who ? `${who} made this a ${what}.` : `This train was made a ${what}.`;
+}
+
+/** The line of a mode set: `<doer> set the train to loop.` */
+function atEndLine(party: TrainParty, member: Member, atEnd: TrainAtEnd): string {
+  const who = doer(party, member);
+  return who
+    ? `${who} set the train ${atEndSetWords(atEnd)}.`
+    : `The train was set ${atEndSetWords(atEnd)}.`;
+}
+
 export interface TrainServiceOptions {
   store: PartyStore;
   gateway: Pick<PartyGateway, 'sendMessage'>;
@@ -490,20 +527,23 @@ export class TrainService {
       partyId,
       member,
       (party) => reverseRoute(party, member.id, staff, from, first),
-      (party, { restarted }) => {
-        const { route } = party.train;
-        const [start, end] = [route[0], route.at(-1)];
-        const again =
-          restarted && start !== undefined ? `, and starts again at ${this.named(start)}` : '';
-        const runs =
-          start === undefined || end === undefined
-            ? ''
-            : `: it now runs from ${this.named(start)} to ${this.named(end)}${again}`;
-        const who = doer(party, member);
-        return endSentence(
-          who ? `The route was reversed by ${who}${runs}` : `The route was reversed${runs}`,
-        );
-      },
+      (party, { restarted }) => this.reversedLine(party, member, restarted),
+    );
+  }
+
+  /** The line of a reversed route: `The route was reversed by X: it now runs from A to B.` */
+  private reversedLine(party: TrainParty, member: Member, restarted: boolean): string {
+    const { route } = party.train;
+    const [start, end] = [route[0], route.at(-1)];
+    const again =
+      restarted && start !== undefined ? `, and starts again at ${this.named(start)}` : '';
+    const runs =
+      start === undefined || end === undefined
+        ? ''
+        : `: it now runs from ${this.named(start)} to ${this.named(end)}${again}`;
+    const who = doer(party, member);
+    return endSentence(
+      who ? `The route was reversed by ${who}${runs}` : `The route was reversed${runs}`,
     );
   }
 
@@ -525,12 +565,7 @@ export class TrainService {
       partyId,
       member,
       (party) => setAtEnd(party, member.id, staff, atEnd, from),
-      (party) => {
-        const who = doer(party, member);
-        return who
-          ? `${who} set the train ${atEndSetWords(atEnd)}.`
-          : `The train was set ${atEndSetWords(atEnd)}.`;
-      },
+      (party) => atEndLine(party, member, atEnd),
     );
   }
 
@@ -550,12 +585,89 @@ export class TrainService {
       partyId,
       member,
       (party) => setTrainKind(party, member.id, staff, kind),
+      (party) => kindLine(party, member, kind),
+    );
+  }
+
+  /**
+   * What Manage… of a train's post asks (plan 8X-G; review R6), as one change: the kind
+   * (`setTrainKind`), then the route (`reverseRoute` or Finish, `moveTrain`), then the mode at the
+   * end (`setAtEnd`), each only where asked. The route is judged before the mode (Reverse is
+   * refused on a turn-back route whatever mode comes with it), and a refusal of any part refuses
+   * all of it: one write, one line in the post of what changed, in that order. Who may: as
+   * each part alone (the kind and the route who may move the train and staff, the mode who may
+   * arrange it). `guards` are where the train was when the dialog opened (`from`, `placeOf`) and
+   * the stop the route began with then (`first`, `stopHandle`): the route is changed only from
+   * there. The kind and the mode ask nothing of where the train is (review r0 B1: a kind and a
+   * mode picked in a dialog drawn before somebody moved the train are applied), the mode only
+   * after a change of the route in the same Submit, where that change left it. A Finish is
+   * announced as a move is.
+   */
+  async manage(
+    partyId: string,
+    member: Member,
+    staff: boolean,
+    asked: TrainManage,
+    guards: { from: string; first: string },
+  ): Promise<TrainChangeOutcome<TrainManaged>> {
+    let start: Place | undefined;
+    let finished: TrainMoved | undefined;
+    const outcome = await this.apply<TrainManaged>(
+      partyId,
+      member,
       (party) => {
-        const who = doer(party, member);
-        const what = TRAIN_KIND_WORDS[kind];
-        return who ? `${who} made this a ${what}.` : `This train was made a ${what}.`;
+        start = placeNow(party);
+        let current = party;
+        const done: TrainManaged = { kindSet: false, restarted: false, atEndSet: false };
+        if (asked.kind !== undefined) {
+          const kind = setTrainKind(current, member.id, staff, asked.kind);
+          if (!kind.ok) return kind;
+          done.kindSet = kind.party !== current;
+          current = kind.party;
+        }
+        // The place guards the route; the mode asks it only after a change of the route, which
+        // the mode then follows (review r0 B1).
+        let modeFrom: string | undefined;
+        const from = guards.from;
+        if (asked.route === 'reverse') {
+          const reversed = reverseRoute(current, member.id, staff, from, guards.first);
+          if (!reversed.ok) return reversed;
+          done.route = 'reversed';
+          done.restarted = reversed.restarted;
+          current = reversed.party;
+          modeFrom = placeOf(current);
+        } else if (asked.route === 'finish') {
+          const moved = moveTrain(current, member.id, 'finish', staff, from);
+          if (!moved.ok) return moved;
+          const { ok: _ok, party: after, ...last } = moved;
+          if (after !== current) {
+            done.route = 'finished';
+            finished = last;
+          }
+          current = after;
+          modeFrom = placeOf(current);
+        }
+        if (asked.atEnd !== undefined) {
+          const mode = setAtEnd(current, member.id, staff, asked.atEnd, modeFrom);
+          if (!mode.ok) return mode;
+          done.atEndSet = mode.party !== current;
+          current = mode.party;
+        }
+        return { ok: true, party: current, ...done };
+      },
+      (party, done) => {
+        const said = [
+          done.kindSet ? kindLine(party, member, party.train.kind) : undefined,
+          done.route === 'reversed' ? this.reversedLine(party, member, done.restarted) : undefined,
+          done.atEndSet ? atEndLine(party, member, party.train.atEnd) : undefined,
+        ].filter((line) => line !== undefined);
+        return said.length === 0 ? undefined : said.join(' ');
       },
     );
+    if (outcome.kind === 'ok' && outcome.changed && start && finished) {
+      this.movedFrom(partyId, start, member, finished);
+    }
+    return outcome;
   }
 
   /**
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index 611f6a5b5dea15ed92eb664800cbd0d8d95ee8c3..9cd8deaf677d8ddd414e2ac363ef6d3f5c192514 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -612,7 +612,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     }
   };
 
-  // A press of the Manage train panel on the map (spec 3.7), as the post's panel makes it: before
+  // A press of the Manage train panel on the map (spec 3.7), as the post's panel made it before plan 8X-G: before
   // the body is read, the per-address limit, the guard of every POST and a press the panel has
   // (404 otherwise; its kind menu, `KIND_PRESS`, plan 8X-5). Then the session (403) and the body
   // (400), the checks of every write to a train (`trainWrite`), whether the member may
````

### Task 7: 8X-G 7: the summary post: Going on now, Passing through, Today at the stops

Prototype commit: `ba24b51461426f43d189966ebbb627403dc18f4b`

- The summary is titled "Going on now" for every kind of party; an "Active raids"
  post the bot made before is taken over and renamed with its next edit (by Discord's
  rename limit: until it is renamed the summary is not taken as done). Nothing going
  on reads "Nothing going on right now. Report a raid with /raid or a max battle with
  /max." /admin setup-forums and the guides speak of the list of what is going on (the
  command's description changes: deploy the commands first).
- Passing through: trains of other regions of the server with a stop in this region,
  after Trains, each linked to its copy in this region's channel (a message link, the
  server's snowflake read once by GuildRepository.snowflakeOf) or else its post, with
  the sections' room and "…and N more". A train's change asks for every summary of its
  server (an unchanged one is not edited), and so does its end; a recorded copy asks
  for its region's.
- Today at the stops: the region's pinned post of the stops today, linked last with
  its counts ("6 tasks · 2 hideouts"), nothing where nothing is reported.
  StopPostService tells the summary after each draw and delete (summaryOf, changed);
  none in rehearsal mode. Its cost: the summary is drawn anew after each draw of the
  stops' post, and edited when the counts changed.

**Files:**

```
 docs/guides/migrating-a-legacy-instance.md |   2 +-
 docs/guides/new-instance.md                |   2 +-
 src/app.ts                                 |   6 ++
 src/commands/admin/setup-forums.test.ts    |  28 +++---
 src/commands/admin/setup-forums.ts         |  10 +--
 src/commands/parties/in-meetup.test.ts     |   2 +-
 src/commands/parties/in-train.test.ts      |   2 +-
 src/commands/parties/status.test.ts        |   6 +-
 src/db/repositories/region-repository.ts   |   6 +-
 src/domain/party/train.ts                  |  12 +++
 src/render/activity.ts                     |   4 +-
 src/render/summary.test.ts                 |  89 ++++++++++++++++---
 src/render/summary.ts                      | 100 +++++++++++++++++----
 src/services/party-mirrors.ts              |   6 ++
 src/services/party-service.max.test.ts     |   2 +-
 src/services/party-service.meetup.test.ts  |  14 +--
 src/services/party-service.test.ts         | 147 +++++++++++++++++++++++++++++--
 src/services/party-service.train.test.ts   | 116 +++++++++++++++++++++++-
 src/services/party-service.ts              | 234 ++++++++++++++++++++++++++++++++++++++++++++++---
 src/services/stop-posts.test.ts            |  42 +++++++++
 src/services/stop-posts.ts                 |  33 +++++++
 test/support/party-service.ts              |   1 +
 22 files changed, 779 insertions(+), 85 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/admin/setup-forums.test.ts src/commands/parties/in-meetup.test.ts src/commands/parties/in-train.test.ts src/commands/parties/status.test.ts src/render/summary.test.ts src/services/party-service.max.test.ts src/services/party-service.meetup.test.ts src/services/party-service.test.ts src/services/party-service.train.test.ts src/services/stop-posts.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff ba24b51461426f43d189966ebbb627403dc18f4b -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-G 7: the summary post: Going on now, Passing through, Today at the stops`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 547abf9e521535b19ba0e23bd917bc1cb6744459..8b1899118671d3cdfee7fdbfa3d5454b160323fc 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -273,7 +273,7 @@ They can take a little while to show up in Discord.
 ### 4.9 The admin's part, in Discord
 
 1. **The bot's role**: whatever `cutover-check` said it still lacks.
-2. **`/admin setup-forums`**: every region gets a forum next to its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), with its tags and a pinned list of active raids. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again. A region that fails says why (most often the category's permissions).
+2. **`/admin setup-forums`**: every region gets a forum next to its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), with its tags and a pinned list of what is going on ("Going on now": its raids, max battles, trains and meetups). It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again. A region that fails says why (most often the category's permissions).
 3. **The regions' borders** (when the web pages are set up, `docs/web-setup.md`): `/region edit` opens the region editor, whose list shows the overlaps and gaps between the regions as the legacy map drew them. **Fix all slivers…** settles the thin ones (it asks only where a gym or stop would change region), and **Save** writes the new outlines straight into the database: no KML export or `/region import` is needed. What is no sliver is listed to be drawn by hand. Members' parties stay where they are.
 4. **`/admin cleanup-legacy`**: deletes the channels of the legacy raids. It first only **lists** them: the raid channels the legacy files name, and leftover legacy party channels that no file names (found by their names and the legacy bot's own first message). Channels it is not sure of are listed apart as "Not deleted", for a person to judge. The channels of the trains and meetups that are still open, and of any party saved with `!save-party`, are **not deleted**: many are long-lived discussion channels. They are listed under their own "Not deleted" heading with the party's name, the day it was made and how many signed up; delete by hand the ones that are dead, and the rest stay as plain channels (their old status message stays, and nothing answers it any more). New trains and meetups start with `/train` and `/meetup`. Nothing is deleted until you press "Delete these n channels" (within ten minutes). One run deletes at most 400 channels; run the command again for the rest.
 
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index 153d4d457f10c1978e8efba1a7add5778b5b1a3f..6895c364578e44c7c8f4e5e3ccdfa6e144fbb137 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -171,7 +171,7 @@ Draw the outlines in a map editor such as [Google My Maps](https://www.google.co
 
 ## 7. Forums
 
-Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), its tags, and a pinned list of active raids. It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
+Once regions and gyms are in, a staff member runs `/admin setup-forums` in your server: every region gets a forum beside its channel (named after the channel with `-meetups`, the `regionForumSuffix` setting), its tags, and a pinned list of what is going on ("Going on now": its raids, max battles, trains and meetups). It changes nothing that is already there but for taking off tags the bot no longer uses (such as EX), so it is safe to run again; a region that fails says why (most often the category's permissions for the bot).
 
 Then try it: `/raid` in a region channel, the buttons in the post, `/max` (a max battle at a power spot: the power spots come with the Wayfarer import), `/train` (also `kind:Gigantamax Train`, with power spots as its stops), `/meetup`, `/research report` (the task of a PokéStop: the region's pinned post "Today at the stops" shows it), `/rocket report` (a grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy goes in the pinned post), `/want` and a report of that boss by somebody else. `/help` lists everything.
 
diff --git a/src/app.ts b/src/app.ts
index a9f782855bf0e6475ae072688410d0190fae031f..becf0f9c48057cb61a3b887570fd2743b720d48e 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1010,8 +1010,14 @@ export async function startApp(
         gateway: partyGateway,
         zone: config.settings.timezone,
         log,
+        // The region's summary links the post with its counts (plan 8X-G).
+        changed: (channelId) => {
+          const region = regions.byChannel(channelId);
+          if (region) partyService.summaryChanged(region.id);
+        },
       });
   researchPostLinks.posts = stopPosts;
+  if (stopPosts) partyService.setStopPosts(stopPosts);
   void connected.then(() =>
     stopPosts
       ?.start()
diff --git a/src/commands/admin/setup-forums.test.ts b/src/commands/admin/setup-forums.test.ts
index f2ee823d3e7ab144fc503161f16d6dbdc361a70f..91045cbe1a5500d51802ec61ba08f1d5937819b8 100644
--- a/src/commands/admin/setup-forums.test.ts
+++ b/src/commands/admin/setup-forums.test.ts
@@ -68,7 +68,7 @@ describe('/admin setup-forums', () => {
     expect(gateway.hidden.has(north)).toBe(true);
     expect(gateway.hidden.has(WEST_FORUM)).toBe(false);
     expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of active raids, hid it from all but staff and the testers.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of what is going on, hid it from all but staff and the testers.`,
       'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
     ]);
   });
@@ -109,16 +109,16 @@ describe('/admin setup-forums', () => {
     for (const region of regions.all()) {
       const summary = gateway.posts.get(region.summaryMessageId ?? '');
       expect(summary).toMatchObject({
-        title: 'Active raids',
+        title: 'Going on now',
         pinned: true,
         forumId: region.forumChannelId,
       });
     }
     expect(interaction.deferReply).toHaveBeenCalled();
     expect(sent(interaction.editReply).content?.split('\n')).toEqual([
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of active raids.`,
-      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of active raids.`,
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north?.forumChannelId}>, closed it to posts by members, posted and pinned the list of active raids.`,
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of what is going on.`,
+      `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of what is going on.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north?.forumChannelId}>, closed it to posts by members, posted and pinned the list of what is going on.`,
     ]);
   });
 
@@ -171,7 +171,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run();
     const lines = sent(interaction.editReply).content?.split(NEWLINE) ?? [];
     expect(lines[0]).toBe(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, posted and pinned the list of active raids. ` +
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, posted and pinned the list of what is going on. ` +
         'I could not close it to posts by members (I need Manage Permissions and Send Messages there; see the log).',
     );
     expect(lines[1]).toContain('closed it to posts by members');
@@ -282,18 +282,18 @@ describe('/admin setup-forums', () => {
     const text = sent((await run()).editReply).content ?? '';
     expect(text).toContain(
       `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted the ` +
-        'list of active raids (I could not pin it: give me Manage Posts there).',
+        'list of what is going on (I could not pin it: give me Manage Posts there).',
     );
     expect(
       gateway.posts.get(regions.byChannel(WEST_CHANNEL)?.summaryMessageId ?? ''),
     ).toMatchObject({ pinned: false });
     expect(text).toContain(
-      `<#${EAST_CHANNEL}>: I am not allowed to post the list of active raids in <#${EAST_FORUM}>: ` +
+      `<#${EAST_CHANNEL}>: I am not allowed to post the list of what is going on in <#${EAST_FORUM}>: ` +
         'I lack the permission Create Posts there. Give it to me and run this again.',
     );
     gateway.refusePosts.set(EAST_FORUM, []);
     expect(sent((await run()).editReply).content).toContain(
-      `<#${EAST_CHANNEL}>: Discord does not let me post the list of active raids in <#${EAST_FORUM}>. ` +
+      `<#${EAST_CHANNEL}>: Discord does not let me post the list of what is going on in <#${EAST_FORUM}>. ` +
         'Check that I have View Channel, Create Posts, Send Messages in Posts and Manage Posts ' +
         'there, and run this again.',
     );
@@ -305,7 +305,7 @@ describe('/admin setup-forums', () => {
     const text = sent((await run()).editReply).content ?? '';
     expect(text).toContain(
       `<#${EAST_CHANNEL}>: <#${EAST_FORUM}> is ready, closed it to posts by members, posted and ` +
-        'pinned the list of active raids.',
+        'pinned the list of what is going on.',
     );
     expect(gateway.posts.has(regions.byChannel(EAST_CHANNEL)?.summaryMessageId ?? '')).toBe(true);
   });
@@ -315,7 +315,7 @@ describe('/admin setup-forums', () => {
     gateway.failing.set('pinPost', new Error('Discord is away'));
     expect(sent((await run()).editReply).content).toContain(
       `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted the ` +
-        'list of active raids (I could not pin it; see the log).',
+        'list of what is going on (I could not pin it; see the log).',
     );
   });
 
@@ -470,7 +470,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run(['Admin', 'Moderator']);
     const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
     expect(sent(interaction.editReply).content?.split(NEWLINE)[0]).toBe(
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of active raids, it is hidden from all but staff and the testers (without Use External Emojis there, which only its category gives me; see the log).`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of what is going on, it is hidden from all but staff and the testers (without Use External Emojis there, which only its category gives me; see the log).`,
     );
   });
 
@@ -490,7 +490,7 @@ describe('/admin setup-forums', () => {
     gateway.noHiding.add(WEST_FORUM);
     const first = sent((await run(['Admin', 'Moderator'])).editReply).content?.split(NEWLINE)[0];
     expect(first).toBe(
-      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of active raids, it was already hidden from members (Discord refused to set its permissions; see the log).`,
+      `<#${WEST_CHANNEL}>: <#${WEST_FORUM}> is ready, closed it to posts by members, posted and pinned the list of what is going on, it was already hidden from members (Discord refused to set its permissions; see the log).`,
     );
   });
 
@@ -525,7 +525,7 @@ describe('/admin setup-forums', () => {
     const interaction = await run(['Admin', 'Moderator']);
     const north = regions.byChannel(UNBOUNDED_CHANNEL)?.forumChannelId ?? '';
     expect(sent(interaction.editReply).content?.split(NEWLINE)).toEqual([
-      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of active raids, hid it from all but staff and the testers.`,
+      `<#${UNBOUNDED_CHANNEL}>: created <#${north}>, closed it to posts by members, posted and pinned the list of what is going on, hid it from all but staff and the testers.`,
       'Rehearsal mode: only the regions north get a forum, which only staff and the testers see.',
       'I could not check that every region of settings.rehearsal.regions names a region channel of this server (see the log).',
     ]);
diff --git a/src/commands/admin/setup-forums.ts b/src/commands/admin/setup-forums.ts
index a29ad84569bc62b0c2f8cab533de240dc6c66d57..cf4243b8e472a86af1e8773cf68de1eb8ff6710a 100644
--- a/src/commands/admin/setup-forums.ts
+++ b/src/commands/admin/setup-forums.ts
@@ -33,10 +33,10 @@ const HIDE_BY_HAND =
 
 /** A new summary post, and whether it could be pinned (Discord refuses a pin without Manage Posts). */
 function summaryWords(unpinned: ForumSetup['unpinned']): string {
-  if (unpinned === undefined) return 'posted and pinned the list of active raids';
+  if (unpinned === undefined) return 'posted and pinned the list of what is going on';
   return unpinned === 'refused'
-    ? 'posted the list of active raids (I could not pin it: give me Manage Posts there)'
-    : 'posted the list of active raids (I could not pin it; see the log)';
+    ? 'posted the list of what is going on (I could not pin it: give me Manage Posts there)'
+    : 'posted the list of what is going on (I could not pin it; see the log)';
 }
 
 function line(result: ForumSetup): string {
@@ -133,13 +133,13 @@ export const setupForums: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
     .setName('setup-forums')
     .setDescription(
-      'Create the raid forum, its tags and the list of active raids for every region',
+      'Create the raid forum, its tags and the list of what is going on for every region',
     ),
   help: {
     details:
       'For each region of this server: creates the forum for its raid posts next to the ' +
       "region's channel if it has none, adds the tags that are missing, and posts and pins the " +
-      'list of active raids. It changes nothing that is already there, so it is safe to run ' +
+      'list of what is going on ("Going on now"). It changes nothing that is already there, so it is safe to run ' +
       'again. A forum whose region is gone is named and left alone.',
     examples: ['/admin setup-forums'],
   },
diff --git a/src/commands/parties/in-meetup.test.ts b/src/commands/parties/in-meetup.test.ts
index 25dc52fce1c12c57e3b56704b1aea88bad59667d..559e4f0504b0559f21c0975d461b64759ceba244 100644
--- a/src/commands/parties/in-meetup.test.ts
+++ b/src/commands/parties/in-meetup.test.ts
@@ -644,7 +644,7 @@ describe('the other commands in the post of a meetup', () => {
     const made = await setup();
     const used = await made.run('status', {}, { channelId: WEST_CHANNEL, thread: undefined });
     expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
-      '### Active raids\n1 meetup',
+      '### Going on now\n1 meetup',
       `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
     ]);
   });
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index cbc755b27550ecb8486636d5a0114d3cb58ac4e3..4a17d662dbd4e103cabbac482cec799f4e5286f5 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -651,7 +651,7 @@ describe('the other commands in the post of a train', () => {
     const made = await setup();
     const used = await made.run('status', {}, { channelId: WEST_CHANNEL, thread: undefined });
     expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
-      '### Active raids\n1 train',
+      '### Going on now\n1 train',
       `**Trains**\n<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
     ]);
   });
diff --git a/src/commands/parties/status.test.ts b/src/commands/parties/status.test.ts
index e5234388e6c476d0dd122bea42089c7f100ba1f5..cffed4304bfcfc1b5b2ea97c5005f7a41e4433b6 100644
--- a/src/commands/parties/status.test.ts
+++ b/src/commands/parties/status.test.ts
@@ -61,7 +61,7 @@ describe('/status', () => {
   it('lists the raids of the region in its channel and in its forum, for the member alone', async () => {
     const made = await setup(yveltal);
     const listed = [
-      '### Active raids\n1 raid',
+      '### Going on now\n1 raid',
       `**Level 5**\n<#${made.postId}> · no time set · 1 trainer`,
     ];
     const shown = (used: { editReply: Parameters<typeof sent>[0] }) =>
@@ -78,7 +78,7 @@ describe('/status', () => {
 
     const elsewhere = await made.run('status', { channelId: EAST_CHANNEL });
     expect(shown(elsewhere)).toEqual([
-      '### Active raids\nNo raids right now. Report one with `/raid`.',
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     ]);
   });
 
@@ -87,7 +87,7 @@ describe('/status', () => {
     await made.service.end(made.party.id);
     const used = await made.run('status');
     expect(textDisplays(asV2(sent(used.editReply)))).toEqual([
-      '### Active raids\nNo raids right now. Report one with `/raid`.',
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     ]);
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
   });
diff --git a/src/db/repositories/region-repository.ts b/src/db/repositories/region-repository.ts
index 34d9209db9effd2cea8db2152904e22db2081a51..85c23e8ca5e25117ee1aabe41563ec2f6d2767c0 100644
--- a/src/db/repositories/region-repository.ts
+++ b/src/db/repositories/region-repository.ts
@@ -16,7 +16,7 @@ export interface Region {
   bounds: LatLon[] | null;
   /** The forum that holds the region's party posts; null until `/admin setup-forums` made one. */
   forumChannelId: string | null;
-  /** The pinned "Active raids" post in that forum. */
+  /** The pinned "Going on now" post in that forum ("Active raids" before plan 8X-G). */
   summaryMessageId: string | null;
 }
 
@@ -35,7 +35,7 @@ export interface SavedOutline {
 
 /**
  * What came of removing a region: nothing, or the region is gone with the saved routes of
- * members that went with it, and its forum and list of active raids as its row had them when it
+ * members that went with it, and its forum and list of what is going on as its row had them when it
  * was locked and deleted (what to delete or keep on Discord).
  */
 export type RemovedRegion =
@@ -266,7 +266,7 @@ export class RegionRepository implements RegionAdminStorage {
    * region, by their foreign key, and the parties that were in it lose their region
    * (`Party.regionId` becomes null); its channel, its forum and the gyms are not touched.
    * `removed` is false when the server has no such region: nothing was changed. `routes` is
-   * how many saved routes went with it; the forum and the list of active raids are those of the
+   * how many saved routes went with it; the forum and the list of what is going on are those of the
    * row as it was locked, whatever the directory in memory says.
    */
   async remove(id: number, guildId: number): Promise<RemovedRegion> {
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index 98a0f13000f1e9185117c0d2ecdd3faf9409a808..db4c737076b1ed0618ea8ae8ffa503ae573940c2 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -245,6 +245,18 @@ function endMode(party: TrainParty): TrainAtEnd {
   return party.train.route.length < 2 ? 'finish' : party.train.atEnd;
 }
 
+/**
+ * The stops the train will still reach by what its mode does (plan 8X-G, review r0 C4; Matt,
+ * 2026-10-22): a train that finishes the current stop and those after it; one that loops or
+ * turns back every stop (a turn-back stores the route reversed and keeps its mode, so it reaches
+ * every stop again); a finished route none. What "Passing through" of a region's summary asks.
+ */
+export function stopsStillReached(party: TrainParty): readonly StopRef[] {
+  const { route, stop } = party.train;
+  if (route.length === 0 || routeFinished(party)) return [];
+  return endMode(party) === 'finish' ? route.slice(stop) : route;
+}
+
 /**
  * The party with this in the part that only a train has. The stop the route was finished from
  * (`finishedFrom`) is kept only while it means something: on a finished route that still has
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 90741f519cadf0ffaa6e8e53fe459963867555b7..3094c58b1a36ac33f981dd31b8c4b688a3495a19 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -325,13 +325,13 @@ export function summaryRefusedWords(refused: PostsRefused): string {
   const { missing } = refused;
   if (missing.length === 0) {
     return (
-      `Discord does not let me post the list of active raids in ${forum}. Check that I have ` +
+      `Discord does not let me post the list of what is going on in ${forum}. Check that I have ` +
       `${andList(POST_PERMISSIONS)} there, and run this again.`
     );
   }
   const one = missing.length === 1;
   return (
-    `I am not allowed to post the list of active raids in ${forum}: I lack the ` +
+    `I am not allowed to post the list of what is going on in ${forum}: I lack the ` +
     `permission${one ? '' : 's'} ${andList(missing)} there. Give ${one ? 'it' : 'them'} to me ` +
     'and run this again.'
   );
diff --git a/src/render/summary.test.ts b/src/render/summary.test.ts
index 064e2240bc2ea633f23ef10905823261ac3025a9..59cd68c019e87586ad43a36668053412d815d4f9 100644
--- a/src/render/summary.test.ts
+++ b/src/render/summary.test.ts
@@ -52,13 +52,15 @@ function linesUnder(message: V2Message, heading: string): string[] {
   return block.split('\n').slice(1);
 }
 
-const NOTHING = `### Active raids\n${NOTHING_GOING}`;
+const NOTHING = `### Going on now\n${NOTHING_GOING}`;
 
 describe('renderSummary', () => {
   it('says so when there is nothing, in one container', () => {
     const message = renderSummary([], PARTY_NOW);
     expect(textDisplays(message)).toEqual([NOTHING]);
-    expect(NOTHING_GOING).toBe('No raids right now. Report one with `/raid`.');
+    expect(NOTHING_GOING).toBe(
+      'Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+    );
     expect(accentOf(message)).toBe(LIST_COLOUR);
     expect(message.components).toHaveLength(1);
   });
@@ -79,7 +81,7 @@ describe('renderSummary', () => {
       PARTY_NOW,
     );
     expect(textDisplays(message)).toEqual([
-      '### Active raids\n3 raids',
+      '### Going on now\n3 raids',
       [
         '**Level 5**',
         `<#300000000000000002> · ends <t:${at('2026-10-13T14:20') / 1000}:R> · 4 trainers`,
@@ -101,7 +103,7 @@ describe('renderSummary', () => {
       );
     const message = renderSummary(raids, PARTY_NOW);
     expect(textDisplays(message).map((text) => text.split('\n')[0])).toEqual([
-      '### Active raids',
+      '### Going on now',
       '**Elite**',
       '**Level 5**',
       '**Shadow Level 5**',
@@ -167,7 +169,7 @@ describe('renderSummary', () => {
     const message = renderSummary(many, PARTY_NOW);
     expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
     expect(textLength(message)).toBeGreaterThan(TEXT_BUDGET - 100);
-    expect(textDisplays(message)[0]).toBe('### Active raids\n200 raids');
+    expect(textDisplays(message)[0]).toBe('### Going on now\n200 raids');
     const lines = linesUnder(message, '**Level 5**');
     const last = lines.at(-1);
     expect(last).toMatch(/^…and \d+ more$/);
@@ -198,13 +200,13 @@ describe('renderSummary', () => {
     // Every tier is there, if only to say how many it has, and so are the trains and meetups.
     const headings = textDisplays(message).map((text) => text.split('\n')[0]);
     expect(headings).toEqual([
-      '### Active raids',
+      '### Going on now',
       ...SUMMARY_TIERS.map(tierHeading),
       '**Trains**',
       '**Meetups**',
     ]);
     expect(textDisplays(message)[0]).toBe(
-      `### Active raids\n${String(raids.length)} raids · 30 trains · 30 meetups`,
+      `### Going on now\n${String(raids.length)} raids · 30 trains · 30 meetups`,
     );
     for (const heading of ['**Trains**', '**Meetups**']) {
       expect(linesUnder(message, heading).length).toBeGreaterThan(1);
@@ -245,7 +247,7 @@ describe('renderSummary with meetups', () => {
     const picnic = meetup(1, { start: PARTY_NOW + 2 * HOUR });
     const message = renderSummary([raid], PARTY_NOW, [picnic]);
     expect(textDisplays(message)).toEqual([
-      '### Active raids\n1 raid · 1 meetup',
+      '### Going on now\n1 raid · 1 meetup',
       '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
       `**Meetups**\n${link(picnic)} · starts ${stamp(PARTY_NOW + 2 * HOUR)} · 1 trainer`,
     ]);
@@ -259,7 +261,7 @@ describe('renderSummary with meetups', () => {
   it('counts only the meetups when there are only meetups', () => {
     const picnic = meetup(1);
     expect(textDisplays(renderSummary([], PARTY_NOW, [picnic]))).toEqual([
-      '### Active raids\n1 meetup',
+      '### Going on now\n1 meetup',
       `**Meetups**\n${link(picnic)} · no time set · 1 trainer`,
     ]);
   });
@@ -398,13 +400,13 @@ describe('renderSummary with trains', () => {
     );
     const picnic = { party: testMeetup(), title: 'Meetup · Community Day picnic' };
     expect(textDisplays(renderSummary([raid], PARTY_NOW, [picnic], [rolling]))).toEqual([
-      '### Active raids\n1 raid · 1 train · 1 meetup',
+      '### Going on now\n1 raid · 1 train · 1 meetup',
       '**Level 5**\n<#300000000000000001> · no time set · 1 trainer',
       `**Trains**\n${link(rolling)} · at The Stacks · starts ${stamp(PARTY_NOW + HOUR)} · 1 trainer`,
       '**Meetups**\n**Meetup · Community Day picnic** · no time set · 1 trainer',
     ]);
     expect(textDisplays(renderSummary([], PARTY_NOW, [], [rolling]))[0]).toBe(
-      '### Active raids\n1 train',
+      '### Going on now\n1 train',
     );
   });
 
@@ -475,6 +477,67 @@ describe('renderSummary with trains', () => {
     }
     expect(raidLines?.length).toBeGreaterThan(20);
   });
+
+  // Plan 8X-G (Matt, 2026-10-22): trains of other regions with a stop in this one.
+  it('lists the trains passing through after its own, each linked to its copy here or its post', () => {
+    const own = train(1, { route: stops(4, 1) }, {}, 'The Stacks');
+    const visiting = train(2, { route: stops(7, 1), stop: 0 }, {}, 'Harbor Lighthouse Mural');
+    const copy = 'https://discord.com/channels/1/2/3';
+    const elsewhere = train(3, { route: stops(8, 2), kind: 'dynamax' }, {}, 'Café Élan Fresco');
+    const message = renderSummary([], PARTY_NOW, [], [own], [], {
+      passing: [{ ...visiting, copyUrl: copy }, elsewhere],
+    });
+    expect(textDisplays(message)).toEqual([
+      '### Going on now\n1 train · 2 trains passing through',
+      `**Trains**\n${link(own)} · at The Stacks · no time set · 1 trainer`,
+      '**Passing through**\n' +
+        `[Train · ${visiting.party.timed.name}](<${copy}>) · at Harbor Lighthouse Mural · no time set · 1 trainer\n` +
+        `${link(elsewhere)} · Max Battle Train · at Café Élan Fresco · no time set · 1 trainer`,
+    ]);
+    // Passing through alone is something going on.
+    expect(
+      textDisplays(renderSummary([], PARTY_NOW, [], [], [], { passing: [elsewhere] }))[0],
+    ).toBe('### Going on now\n1 train passing through');
+  });
+
+  it('keeps the trains passing through within the message with everything else, counting the rest', () => {
+    const raids = Array.from({ length: 120 }, (_unused, n) =>
+      listed(testRaid({ id: ID(n) }), 'T5 egg', `3000000000000${String(n).padStart(5, '0')}`),
+    );
+    const passing = Array.from({ length: 60 }, (_unused, n) =>
+      train(n, { route: stops(4) }, {}, 'Gym'),
+    );
+    const message = renderSummary(raids, PARTY_NOW, [], [], [], { passing });
+    expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
+    const lines = linesUnder(message, '**Passing through**');
+    expect(lines.at(-1)).toMatch(/^…and \d+ more$/);
+    expect(lines.length).toBeGreaterThan(5);
+  });
+});
+
+describe('renderSummary: "Today at the stops" (plan 8X-G)', () => {
+  const POST = 'https://discord.com/channels/1/2/3';
+
+  it('links the pinned post of the stops, with its counts, last', () => {
+    const raid = listed(testRaid({ id: ID(1) }), 'T5 egg · The Stacks', '300000000000000001');
+    const texts = textDisplays(
+      renderSummary([raid], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 6, hideouts: 2 } }),
+    );
+    expect(texts.at(-1)).toBe(`[Today at the stops](<${POST}>): 6 tasks · 2 hideouts`);
+    expect(
+      textDisplays(
+        renderSummary([], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 1, hideouts: 0 } }),
+      ),
+    ).toEqual([NOTHING, `[Today at the stops](<${POST}>): 1 task`]);
+  });
+
+  it('says nothing of the stops where nothing is reported', () => {
+    expect(
+      textDisplays(
+        renderSummary([], PARTY_NOW, [], [], [], { stops: { url: POST, tasks: 0, hideouts: 0 } }),
+      ),
+    ).toEqual([NOTHING]);
+  });
 });
 
 describe('renderSummary: max battles (plan 8X-3)', () => {
@@ -501,7 +564,7 @@ describe('renderSummary: max battles (plan 8X-3)', () => {
       ],
     );
     const texts = textDisplays(message);
-    expect(texts[0]).toBe('### Active raids\n1 raid · 4 max battles');
+    expect(texts[0]).toBe('### Going on now\n1 raid · 4 max battles');
     expect(linesUnder(message, '**Max battles**')).toEqual([
       `<#300000000000000703> · Dynamax 5★ · ends <t:${at('2026-10-13T14:30') / 1000}:R> · 1 trainer`,
       `**Battle 4** · Dynamax 2★ · ends <t:${at('2026-10-13T16:00') / 1000}:R> · 1 trainer`,
@@ -520,7 +583,7 @@ describe('renderSummary: max battles (plan 8X-3)', () => {
       [],
       [max(1, 'D2', '2026-10-13T21:00')],
     );
-    expect(textDisplays(over)[0]).toBe(`### Active raids\n${NOTHING_GOING}`);
+    expect(textDisplays(over)[0]).toBe(`### Going on now\n${NOTHING_GOING}`);
     const many = Array.from({ length: 150 }, (_unused, n) => max(n, 'D1', '2026-10-13T20:00'));
     const message = renderSummary([], PARTY_NOW, [], [], many);
     expect(textLength(message)).toBeLessThanOrEqual(TEXT_BUDGET);
diff --git a/src/render/summary.ts b/src/render/summary.ts
index e9dd6f17dd738b627c79725be5080bafd0088c79..242e43dfda84a8932b3b07ca0ddf834c127813cf 100644
--- a/src/render/summary.ts
+++ b/src/render/summary.ts
@@ -27,8 +27,17 @@ import { TEXT_BUDGET, trainerCount } from './party-post.js';
 import { count, plain, timestamp } from './text.js';
 import { container, LIST_COLOUR, separator, textDisplay } from './v2.js';
 
-/** The title of the pinned post that lists a region's raids (spec 5.1). */
-export const SUMMARY_TITLE = 'Active raids';
+/**
+ * The title of the pinned post that lists what goes on in a region: its raids, max battles,
+ * trains and meetups (spec 5.1; plan 8X-G, Matt 2026-10-22: every kind of party, not raids alone).
+ */
+export const SUMMARY_TITLE = 'Going on now';
+
+/**
+ * The title the summary post had before plan 8X-G: a post of this title the bot made is taken
+ * over as the region's summary (`takeOverSummary`) and renamed with its next edit.
+ */
+export const LEGACY_SUMMARY_TITLE = 'Active raids';
 
 /** A raid for a list: the party and the title its post has. */
 export interface ListedRaid {
@@ -115,13 +124,56 @@ export interface ListedTrain {
   title: string;
   /** The name of its current stop, as the gym has it; undefined when it is at none. */
   at?: string | undefined;
+  /**
+   * Of a train of another region passing through (plan 8X-G): the address of its copy in this
+   * region's channel (a message link), which the line links in the place of the post; undefined
+   * where it has none there.
+   */
+  copyUrl?: string | undefined;
+}
+
+/** The heading of the trains of other regions with a stop in this one (plan 8X-G). */
+export const PASSING_HEADING = '**Passing through**';
+
+/**
+ * The pinned post "Today at the stops" of the region's channel (plan 8R-1), for its line in the
+ * summary (plan 8X-G): the address of its first message, and how many tasks and hideouts it
+ * names, as it names them.
+ */
+export interface StopsLine {
+  url: string;
+  tasks: number;
+  hideouts: number;
+}
+
+/** What the summary lists besides the region's own parties (plan 8X-G). */
+export interface SummaryMore {
+  /** Trains of other regions of the server with a stop in this one. */
+  passing?: readonly ListedTrain[];
+  /** The region's pinned post of the stops today; undefined where there is none. */
+  stops?: StopsLine | undefined;
+}
+
+/**
+ * The line of the stops: `[Today at the stops](<link>): 6 tasks · 2 hideouts`; undefined where
+ * nothing is reported.
+ */
+function stopsLine(stops: StopsLine | undefined): string | undefined {
+  if (stops === undefined) return undefined;
+  const counts = [
+    ...(stops.tasks > 0 ? [count(stops.tasks, 'task')] : []),
+    ...(stops.hideouts > 0 ? [count(stops.hideouts, 'hideout')] : []),
+  ];
+  return counts.length === 0
+    ? undefined
+    : `[Today at the stops](<${stops.url}>): ${counts.join(' · ')}`;
 }
 
 /** The heading of the trains in a region's list, under its raids and above its meetups. */
 export const TRAINS_HEADING = '**Trains**';
 
 /** Where a train is: at a gym, before its route, or through with it. */
-function trainLine({ party, title, at }: ListedTrain, now: number): string {
+function trainLine({ party, title, at, copyUrl }: ListedTrain, now: number): string {
   const where =
     party.train.route.length === 0
       ? 'no route yet'
@@ -130,7 +182,8 @@ function trainLine({ party, title, at }: ListedTrain, now: number): string {
         : `at ${plain(at ?? 'Unknown gym')}`;
   // A train of max battles says its kind (plan 8X-4): "Trains" alone meant raid trains so far.
   const kind = party.train.kind === 'raid' ? '' : ` · ${TRAIN_KIND_WORDS[party.train.kind]}`;
-  return `${postOf(party, title)}${kind} · ${where} · ${timedWhen(party, now)} · ${trainerCount(party)}`;
+  const post = copyUrl === undefined ? postOf(party, title) : `[${plain(title)}](<${copyUrl}>)`;
+  return `${post}${kind} · ${where} · ${timedWhen(party, now)} · ${trainerCount(party)}`;
 }
 
 /** The timed parties of a list that are not over, by their start, then as they were made. */
@@ -167,8 +220,9 @@ function fitLines(texts: readonly string[], limit: number): string[] {
   return lines;
 }
 
-/** What the list says when the region has nothing going on. */
-export const NOTHING_GOING = 'No raids right now. Report one with `/raid`.';
+/** What the list says when the region has nothing going on (plan 8X-G: every kind). */
+export const NOTHING_GOING =
+  'Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.';
 
 /**
  * The place of each level in a region's list: the rarest and largest first (an elite raid is
@@ -203,17 +257,22 @@ const sureRoom = (heading: string): number => heading.length + 1 + 20;
 
 /**
  * The summary of a region as a components-v2 message (the draft "In the channels"): one
- * container, `### Active raids` with a count of what is going on (`5 raids · 2 trains · 1
- * meetup`, only the kinds there are; `NOTHING_GOING` when there is nothing), then the raids that
+ * container, `### Going on now` (`SUMMARY_TITLE`) with a count of what is going on (`5 raids · 2
+ * trains · 1 meetup · 1 train passing through`, only the kinds there are; `NOTHING_GOING` when there
+ * is nothing), then the raids that
  * have not ended by the clock under a bold heading per tier (`SUMMARY_TIERS`, the soonest end
  * first in each; a raid that has ended but whose post is still open is left out), then the max
  * battles whose end has not come (plan 8X-3, `MAX_BATTLES_HEADING`: 5 stars down to 1,
- * Gigantamax last, the soonest end first in each), then the trains and the meetups, each under
- * its heading: those that are not over, by their start, then those without one in the order they
- * were made. One text display per tier and section, so the component count stays small whatever
- * is listed.
+ * Gigantamax last, the soonest end first in each), then the trains, the trains of other regions
+ * passing through (plan 8X-G, `PASSING_HEADING`, `more.passing`: each linked to its copy in this
+ * region's channel where it has one, `copyUrl`) and the meetups, each under its heading: those
+ * that are not over, by their start, then those without one in the order they were made; last,
+ * after a line, the region's post of the stops today with its counts (`more.stops`, `stopsLine`;
+ * nothing where nothing is reported). One text display per tier and section, so the component
+ * count stays small whatever is listed.
  *
- * All of it keeps within `TEXT_BUDGET`: the max battles, the trains and the meetups are each sure of some room
+ * All of it keeps within `TEXT_BUDGET`: the max battles, the trains, the trains passing through
+ * and the meetups are each sure of some room
  * (`SECTION_ROOM`), every tier below another of its heading and a line, and each has all that is
  * left over what the ones after it are sure of; what does not fit is counted (`…and N more`).
  */
@@ -223,6 +282,7 @@ export function renderSummary(
   meetups: readonly ListedMeetup[] = [],
   trains: readonly ListedTrain[] = [],
   maxBattles: readonly ListedMax[] = [],
+  more: SummaryMore = {},
 ): V2Message {
   const going = raids
     .filter(({ party }) => party.status === 'active' && raidStage(party, now) !== 'ended')
@@ -237,15 +297,22 @@ export function renderSummary(
     );
   const plannedTrains = planned(trains, now);
   const plannedMeetups = planned(meetups, now);
+  const passing = planned(more.passing ?? [], now);
+  const stops = stopsLine(more.stops);
   const counts = [
     ...(going.length > 0 ? [count(going.length, 'raid')] : []),
     ...(maxOn.length > 0 ? [count(maxOn.length, 'max battle')] : []),
     ...(plannedTrains.length > 0 ? [count(plannedTrains.length, 'train')] : []),
     ...(plannedMeetups.length > 0 ? [count(plannedMeetups.length, 'meetup')] : []),
+    ...(passing.length > 0 ? [`${count(passing.length, 'train')} passing through`] : []),
   ];
   const head = `### ${SUMMARY_TITLE}\n${counts.length === 0 ? NOTHING_GOING : counts.join(' · ')}`;
+  // The line of the stops is last, after a line, and its room is kept from the start.
+  const tail: APIComponentInContainer[] =
+    stops === undefined ? [] : [separator(), textDisplay(stops)];
+  const tailRoom = stops?.length ?? 0;
   if (counts.length === 0) {
-    return { v2: true, components: [container(LIST_COLOUR, [textDisplay(head)])] };
+    return { v2: true, components: [container(LIST_COLOUR, [textDisplay(head), ...tail])] };
   }
   const size = (texts: readonly string[]): number =>
     texts.reduce((sum, text) => sum + text.length + 1, 0);
@@ -261,6 +328,7 @@ export function renderSummary(
   const timed = [
     { heading: MAX_BATTLES_HEADING, lines: maxOn.map((battle) => maxLine(battle)) },
     { heading: TRAINS_HEADING, lines: plannedTrains.map((train) => trainLine(train, now)) },
+    { heading: PASSING_HEADING, lines: passing.map((train) => trainLine(train, now)) },
     { heading: MEETUPS_HEADING, lines: plannedMeetups.map((meetup) => meetupLine(meetup, now)) },
   ].map((section) => ({
     ...section,
@@ -272,7 +340,7 @@ export function renderSummary(
     .map(({ heading, lines, raid, sure }) => ({ heading, lines, raid, room: sure(heading) }));
   const reserved = (from: number): number =>
     sections.slice(from).reduce((sum, section) => sum + section.room, 0);
-  let used = head.length;
+  let used = head.length + tailRoom;
   const parts: APIComponentInContainer[] = [textDisplay(head)];
   for (const [index, section] of sections.entries()) {
     // A line under the count, and one between the raids and what follows them.
@@ -282,7 +350,7 @@ export function renderSummary(
     used += text.length;
     parts.push(textDisplay(text));
   }
-  return { v2: true, components: [container(LIST_COLOUR, parts)] };
+  return { v2: true, components: [container(LIST_COLOUR, [...parts, ...tail])] };
 }
 
 /**
diff --git a/src/services/party-mirrors.ts b/src/services/party-mirrors.ts
index 913dcc5e54d4ee3e24c6b3481f3eeacd511d6147..f65d85e5dded12831c5bb11544d4425ccf634109 100644
--- a/src/services/party-mirrors.ts
+++ b/src/services/party-mirrors.ts
@@ -55,6 +55,11 @@ export interface PartyMirrorsOptions {
   refusedFiles: RefusedFiles;
   /** Told when Discord refuses an emoji of a button (`ApplicationEmoji.refused`: read them anew). */
   emojiRefused?: () => void;
+  /**
+   * Told when a copy was made and recorded (plan 8X-G: a train's copy in another region's
+   * channel is what that region's summary links).
+   */
+  copied?: (kind: MirrorKind, channelId: string) => void;
   log: Logger;
   now: () => number;
   /**
@@ -486,6 +491,7 @@ export class PartyMirrors {
     }
     if (!recorded) return 'unrecorded';
     this.sent.set(messageId, JSON.stringify(copy.message));
+    this.options.copied?.(kind, channelId);
     for (const stale of earlier) {
       await this.attempt(
         'delete an earlier copy of a party message',
diff --git a/src/services/party-service.max.test.ts b/src/services/party-service.max.test.ts
index f18445ee57e727e34ba492b36e3f634e6577b868..167a4f7e9b1bdb50270480ec417b2e92b40473ec 100644
--- a/src/services/party-service.max.test.ts
+++ b/src/services/party-service.max.test.ts
@@ -207,7 +207,7 @@ describe('PartyService.reportMax (plan 8X-3)', () => {
   it('lists it in the summary of its region, after the raids', async () => {
     const made = await reportedMax();
     const texts = textDisplays(made.service.summaryMessage(1));
-    expect(texts[0]).toBe('### Active raids\n1 max battle');
+    expect(texts[0]).toBe('### Going on now\n1 max battle');
     expect(texts).toContainEqual(
       `**Max battles**\n<#${made.postId}> · Dynamax 2★ · ends <t:${END / 1000}:R> · 1 trainer`,
     );
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index 8c218003057f5baf2c6a0d18eed11529ffba83c0..04e34b2bdaf96e3db5ee3e497186a8b3082157a0 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -372,11 +372,11 @@ describe('PartyService: the post of a meetup', () => {
   it('lists the meetup in the summary of its region, under the raids', async () => {
     const made = await createdMeetup();
     expect(textDisplays(made.service.summaryMessage(1))).toEqual([
-      '### Active raids\n1 meetup',
+      '### Going on now\n1 meetup',
       `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
     ]);
     expect(textDisplays(made.service.summaryMessage(2))).toEqual([
-      '### Active raids\nNo raids right now. Report one with `/raid`.',
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     ]);
     const gym = gymsFixture().get(1);
     if (!gym) throw new Error('no gym');
@@ -390,7 +390,7 @@ describe('PartyService: the post of a meetup', () => {
     });
     if (raid.kind !== 'created') throw new Error(raid.kind);
     expect(textDisplays(made.service.summaryMessage(1))).toEqual([
-      '### Active raids\n1 raid · 1 meetup',
+      '### Going on now\n1 raid · 1 meetup',
       `**Level 5**\n<#${raid.party.forumPostId ?? ''}> · no time set · 1 trainer`,
       `**Meetups**\n<#${made.postId}> · no time set · 1 trainer`,
     ]);
@@ -403,7 +403,9 @@ describe('PartyService: the post of a meetup', () => {
     await before.service.ensureSummary(west);
     const summaryId = before.regions.byId(1)?.summaryMessageId ?? '';
     const text = () => textOf(before.gateway.posts.get(summaryId)?.message);
-    expect(text()).toBe('### Active raids\nNo raids right now. Report one with `/raid`.');
+    expect(text()).toBe(
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+    );
 
     const outcome = await before.service.createMeetup({
       name: 'Picnic',
@@ -420,7 +422,9 @@ describe('PartyService: the post of a meetup', () => {
 
     await before.service.end(outcome.party.id);
     await before.service.flush();
-    expect(text()).toBe('### Active raids\nNo raids right now. Report one with `/raid`.');
+    expect(text()).toBe(
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+    );
   });
 });
 
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index d06042f70774f5c8177a9bab09c4482c2a70add4..078227dfb92723c3170261dceac3f09fd264a791 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -415,9 +415,9 @@ describe('PartyService: the summary and tidying up', () => {
     const west = regions.rows[0]!;
     await expect(service.ensureSummary(west)).resolves.toBe(true);
     const [summary] = gateway.postsIn(WEST_FORUM);
-    expect(summary).toMatchObject({ title: 'Active raids', pinned: true, tagIds: [] });
+    expect(summary).toMatchObject({ title: 'Going on now', pinned: true, tagIds: [] });
     expect(textOf(summary?.message)).toBe(
-      '### Active raids\nNo raids right now. Report one with `/raid`.',
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     );
     expect(regions.summaries).toEqual([
       { id: 1, forumChannelId: WEST_FORUM, messageId: summary?.id },
@@ -457,7 +457,135 @@ describe('PartyService: the summary and tidying up', () => {
     expect(entries.filter((entry) => entry.msg === 'could not pin the summary post')).toEqual([]);
     // The post taken over shows the region's list as it is now.
     await service.flush();
-    expect(textOf(gateway.posts.get(pinned ?? '')?.message)).toMatch(/^### Active raids\n1 raid/);
+    expect(textOf(gateway.posts.get(pinned ?? '')?.message)).toMatch(/^### Going on now\n1 raid/);
+  });
+
+  it('takes over a summary post made as "Active raids" and renames it "Going on now" (plan 8X-G)', async () => {
+    const made = await partyServiceWith();
+    const { service, gateway, regions } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const old = west.summaryMessageId ?? '';
+    // A post made before the update, its record lost.
+    gateway.posts.get(old)!.title = 'Active raids';
+    west.summaryMessageId = null;
+    await addQuietRaid(made);
+    await expect(service.ensureSummary(west)).resolves.toBe(false);
+    expect(west.summaryMessageId).toBe(old);
+    await service.flush();
+    expect(gateway.posts.get(old)).toMatchObject({ title: 'Going on now', renames: 1 });
+    expect(textOf(gateway.posts.get(old)?.message)).toMatch(/^### Going on now\n1 raid/);
+    // Its record kept, a later render renames nothing more.
+    service.summaryChanged(west.id);
+    await service.flush();
+    expect(gateway.posts.get(old)?.renames).toBe(1);
+  });
+
+  it('renames a recorded summary post still called "Active raids" with its next edit', async () => {
+    const timers: { run: () => void; ms: number }[] = [];
+    const made = await partyServiceWith([], {
+      setTimer: (run, ms) => {
+        timers.push({ run, ms });
+        return () => undefined;
+      },
+    });
+    const { service, gateway, regions } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const post = gateway.posts.get(west.summaryMessageId ?? '')!;
+    post.title = 'Active raids';
+    // Discord's limit of renames says to wait: it is tried again then.
+    gateway.renameLater.set(west.summaryMessageId ?? '', 60_000);
+    await addQuietRaid(made);
+    service.summaryChanged(west.id);
+    await service.flush();
+    expect(post.title).toBe('Active raids');
+    const edits = post.edits;
+    // While the rename waits, requests with the same text edit nothing (review r1, R1-6).
+    service.summaryChanged(west.id);
+    service.summaryChanged(west.id);
+    await service.flush();
+    expect(post.edits).toBe(edits);
+    gateway.renameLater.delete(west.summaryMessageId ?? '');
+    // The timer of the wait Discord named renames it, with nothing else changed (review r0 C3),
+    // and edits nothing (R1-6).
+    const due = timers.find((timer) => timer.ms >= 60_000 && timer.ms < 3_600_000);
+    expect(due).toBeDefined();
+    due?.run();
+    await service.flush();
+    expect(post.title).toBe('Going on now');
+    expect(post.edits).toBe(edits);
+  });
+
+  it('takes a summary whose rename fails for good as done, and warns once (review r0 C1)', async () => {
+    const made = await partyServiceWith();
+    const { service, gateway, regions, entries } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const post = gateway.posts.get(west.summaryMessageId ?? '')!;
+    post.title = 'Active raids';
+    gateway.failing.set('renamePost', missingPermissions('renamePost'));
+    await addQuietRaid(made);
+    service.summaryChanged(west.id);
+    await service.flush();
+    const edits = post.edits;
+    // The same text again: no edit, no second warning.
+    service.summaryChanged(west.id);
+    await service.flush();
+    expect(post.edits).toBe(edits);
+    expect(entries.filter((entry) => entry.msg === 'could not rename a summary post')).toHaveLength(
+      1,
+    );
+    // Allowed again: a later change of the text tries the rename once more (review r1, R1-5).
+    gateway.failing.delete('renamePost');
+    await made.store.update(made.store.active()[0]?.id ?? '', (party) => ({
+      party: { ...party, endTime: (party.endTime ?? 0) + 60_000 },
+    }));
+    service.summaryChanged(west.id);
+    await service.flush();
+    expect(post.title).toBe('Going on now');
+  });
+
+  it('tries a rename that failed otherwise again after the rename window (review r1, R1-5)', async () => {
+    const timers: { run: () => void; ms: number }[] = [];
+    const made = await partyServiceWith([], {
+      setTimer: (run, ms) => {
+        timers.push({ run, ms });
+        return () => undefined;
+      },
+    });
+    const { service, gateway, regions } = made;
+    const west = regions.rows[0]!;
+    await service.ensureSummary(west);
+    const post = gateway.posts.get(west.summaryMessageId ?? '')!;
+    post.title = 'Active raids';
+    gateway.failing.set('renamePost', new Error('Discord is away'));
+    await addQuietRaid(made);
+    service.summaryChanged(west.id);
+    await service.flush();
+    expect(post.title).toBe('Active raids');
+    gateway.failing.delete('renamePost');
+    const due = timers.find((timer) => timer.ms === 10 * 60_000);
+    expect(due).toBeDefined();
+    due?.run();
+    await service.flush();
+    expect(post.title).toBe('Going on now');
+  });
+
+  it('links the region’s post of the stops today, with its counts (plan 8X-G)', async () => {
+    const { service, gateway } = await partyServiceWith();
+    expect(textDisplays(service.summaryMessage(1))).toHaveLength(1);
+    service.setStopPosts({
+      summaryOf: (channelId) =>
+        channelId === WEST_CHANNEL
+          ? { serverId: gateway.guildId, messageId: '1700000000000000001', tasks: 3, hideouts: 1 }
+          : undefined,
+    });
+    expect(textDisplays(service.summaryMessage(1)).at(-1)).toBe(
+      `[Today at the stops](<https://discord.com/channels/${gateway.guildId}/${WEST_CHANNEL}/` +
+        '1700000000000000001>): 3 tasks · 1 hideout',
+    );
+    expect(textDisplays(service.summaryMessage(2))).toHaveLength(1);
   });
 
   it('takes over an unpinned summary post left over and pins it', async () => {
@@ -987,7 +1115,9 @@ describe('PartyService: renders, tags and the summary', () => {
     const ended = await made.store.update(made.party.id, (p) => ({ party: endParty(p) }));
     made.service.ended(ended?.party ?? made.party);
     await made.service.flush();
-    expect(summary()).toBe('### Active raids\nNo raids right now. Report one with `/raid`.');
+    expect(summary()).toBe(
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+    );
   });
 
   it('does not edit the summary when its text did not change, and does when it did', async () => {
@@ -1024,12 +1154,15 @@ describe('PartyService: renders, tags and the summary', () => {
     if (!post) throw new Error('no summary post');
     expect(post.message.v2).toBe(true);
     // As one made before the summary was a v2 message.
-    post.message = { content: 'No raids right now. Report one with `/raid`.' };
+    post.message = {
+      content:
+        'Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+    };
     await made.service.reportRaid(report({ gym: fountain! }));
     await made.service.flush();
     expect(made.gateway.converted).toEqual([{ id: summaryId, direct: false }]);
     expect(textOf(made.gateway.posts.get(summaryId)?.message)).toMatch(
-      /^### Active raids\n2 raids/,
+      /^### Going on now\n2 raids/,
     );
   });
 
@@ -1635,7 +1768,7 @@ describe('PartyService.setupForums: one run at a time per server', () => {
       expect(gateway.canSee(forumId, CAROL)).toBe(true);
       expect(gateway.canSee(forumId, ALICE)).toBe(true);
     }
-    // Hidden before the first post in it (the list of active raids).
+    // Hidden before the first post in it (the list of what is going on).
     const at = (call: string) => gateway.calls.indexOf(call);
     expect(at(`hideForum ${WEST_FORUM}`)).toBeGreaterThanOrEqual(0);
     expect(at(`hideForum ${WEST_FORUM}`)).toBeLessThan(at(`createPost ${WEST_FORUM}`));
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index 2bf5d85e0f069dcf238d12ceef8155651b60d86d..ab1722042ebd4db0e3e80bdf1dd3442f5b1e0823 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -16,6 +16,7 @@ import {
   restarted,
 } from '../../test/support/party-service.js';
 import { PartyStatus } from '../domain/party/status.js';
+import { gymStop } from '../domain/party/stops.js';
 import { renderTrainPost } from '../render/train-post.js';
 import type { Member } from './attendance-service.js';
 import { WARN_AGAIN_AFTER } from './party-scheduler.js';
@@ -200,7 +201,7 @@ describe('PartyService: the post of a train', () => {
     const made = await createdTrain({ route: [4, 1] });
     const trainLine = () => textDisplays(made.service.summaryMessage(1))[1]?.split('\n')[1];
     expect(textDisplays(made.service.summaryMessage(1))).toEqual([
-      '### Active raids\n1 train',
+      '### Going on now\n1 train',
       `**Trains**\n<#${made.postId}> · at Veterans Memorial Bridge · no time set · 1 trainer`,
     ]);
     await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
@@ -209,11 +210,122 @@ describe('PartyService: the post of a train', () => {
     await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
     expect(trainLine()).toBe(`<#${made.postId}> · route finished · no time set · 1 trainer`);
     expect(textDisplays(made.service.summaryMessage(2))).toEqual([
-      '### Active raids\nNo raids right now. Report one with `/raid`.',
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
     ]);
   });
 });
 
+describe('PartyService: a train passing through another region (plan 8X-G)', () => {
+  it('is listed in the summary of a region it stops in, linked to its copy there', async () => {
+    // Gym 4 lies in West, gym 7 in East: a West train that stops in East.
+    const made = await createdTrain({ route: [4, 7] });
+    const east = made.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
+    if (!east) throw new Error('no East');
+    await made.service.ensureSummary(east);
+    await made.service.flush();
+    const copy = made
+      .current()
+      .mirrorMessages.find(
+        (mirror) => mirror.kind === 'region' && mirror.channelId === EAST_CHANNEL,
+      );
+    if (!copy) throw new Error('no copy in East');
+    const summary = () => textOf(made.gateway.posts.get(east.summaryMessageId ?? '')?.message);
+    const url = `https://discord.com/channels/${made.gateway.guildId}/${EAST_CHANNEL}/${copy.messageId}`;
+    expect(summary()).toBe(
+      '### Going on now\n1 train passing through\n' +
+        `**Passing through**\n[Train · Saturday legendaries](<${url}>) · at Veterans Memorial ` +
+        'Bridge · no time set · 1 trainer',
+    );
+    // Its own region lists it as its train, not as passing through.
+    expect(textDisplays(made.service.summaryMessage(1))[0]).toBe('### Going on now\n1 train');
+    // A move of the train is shown in East's summary too.
+    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
+    await made.service.flush();
+    expect(summary()).toContain('· at Harbor Lighthouse Mural ·');
+    // Once its route leaves East, East lists it no more.
+    await made.trains.removeStop(made.party.id, { id: REPORTER }, 2);
+    await made.service.flush();
+    expect(summary()).toBe(
+      '### Going on now\nNothing going on right now. Report a raid with `/raid` or a max battle with `/max`.',
+    );
+  });
+});
+
+describe('PartyService: passing through while the train still reaches the region (review r0 C4)', () => {
+  // Gym 7 lies in East, gyms 4 and 1 in West: a West train that starts in East.
+  const passes = (made: Awaited<ReturnType<typeof createdTrain>>) =>
+    textDisplays(made.service.summaryMessage(2)).some((text) =>
+      text.startsWith('**Passing through**'),
+    );
+
+  it('drops a train that finishes once it is past every stop of the region', async () => {
+    const made = await createdTrain({ route: [7, 4, 1], atEnd: 'finish' });
+    expect(passes(made)).toBe(true);
+    await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
+    expect(passes(made)).toBe(false);
+  });
+
+  it('keeps a train that loops or turns back for every stop of its route (Matt, 2026-10-22)', async () => {
+    for (const atEnd of ['loop', 'turn-back'] as const) {
+      const made = await createdTrain({ route: [7, 4, 1], atEnd });
+      await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
+      await made.trains.move(made.party.id, { id: REPORTER }, 'next', false);
+      expect(passes(made)).toBe(true);
+    }
+  });
+
+  it('counts no stop of a finished route', async () => {
+    for (const atEnd of ['finish', 'loop'] as const) {
+      const made = await createdTrain({ route: [7, 4, 1], atEnd });
+      await made.trains.move(made.party.id, { id: REPORTER }, 'finish', false);
+      expect(passes(made)).toBe(false);
+    }
+  });
+
+  it('leaves the summary of another region with its end, and edits none it does not stop in (review r0 C3)', async () => {
+    const made = await createdTrain({ route: [4, 7] });
+    const east = made.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
+    if (!east) throw new Error('no East');
+    await made.service.ensureSummary(east);
+    await made.service.flush();
+    const post = made.gateway.posts.get(east.summaryMessageId ?? '');
+    expect(textOf(post?.message)).toContain('**Passing through**');
+    await made.service.end(made.party.id);
+    await made.service.flush();
+    expect(textOf(post?.message)).not.toContain('**Passing through**');
+    // A train of West alone: its moves leave East's summary as it is.
+    const home = await createdTrain({ route: [4, 1, 2] });
+    const there = home.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
+    if (!there) throw new Error('no East');
+    await home.service.ensureSummary(there);
+    await home.service.flush();
+    const summary = home.gateway.posts.get(there.summaryMessageId ?? '');
+    const edits = summary?.edits;
+    await home.trains.move(home.party.id, { id: REPORTER }, 'next', false);
+    await home.service.flush();
+    expect(summary?.edits).toBe(edits);
+  });
+});
+
+describe('PartyService: a train passing through, its copy made after the summary', () => {
+  it('links the copy once it is made, though the summary was drawn before it', async () => {
+    const made = await createdTrain({ route: [4] });
+    const east = made.regions.rows.find((row) => row.channelId === EAST_CHANNEL);
+    if (!east) throw new Error('no East');
+    await made.service.ensureSummary(east);
+    await made.trains.addStop(made.party.id, { id: REPORTER }, gymStop(7));
+    await made.service.flush();
+    const copy = made
+      .current()
+      .mirrorMessages.find(
+        (mirror) => mirror.kind === 'region' && mirror.channelId === EAST_CHANNEL,
+      );
+    if (!copy) throw new Error('no copy in East');
+    const summary = textOf(made.gateway.posts.get(east.summaryMessageId ?? '')?.message);
+    expect(summary).toContain(`/${EAST_CHANNEL}/${copy.messageId}>)`);
+  });
+});
+
 describe('PartyService: ending a train', () => {
   it('strips the controls, deletes the link line and archives the post as ended', async () => {
     const made = await createdTrain({ route: [4, 1] });
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 71158efadf19db5d365ce3c2c60950f8882728f2..f34e758c3cbc7a3013bcc869b9e26011269164cd 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -65,6 +65,7 @@ import {
   splitOffGroup,
   splitSettled,
   splitTrain,
+  stopsStillReached,
 } from '../domain/party/train.js';
 import { raidEggName } from '../domain/pogo/raid-eggs.js';
 import { EggPictures } from './egg-pictures.js';
@@ -113,7 +114,14 @@ import {
   type MaxPostView,
   spotNow,
 } from '../render/max-post.js';
-import { renderRegionLink, renderSummary, SUMMARY_TITLE } from '../render/summary.js';
+import {
+  LEGACY_SUMMARY_TITLE,
+  renderRegionLink,
+  renderSummary,
+  SUMMARY_TITLE,
+  type ListedTrain,
+  type StopsLine,
+} from '../render/summary.js';
 import { memberText, plain, type NamedMember } from '../render/text.js';
 import type { TimedPostView } from '../render/timed-post.js';
 import { renderTrainPost, trainTitle, type TrainPostView } from '../render/train-post.js';
@@ -131,7 +139,12 @@ import type { MaxBossProvider } from './max-boss-service.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import type { RaidEventProvider } from './raid-event-service.js';
 import type { WayspotProvider } from './wayspot-directory.js';
-import { gymRegionsInGuild, regionsAtPoint, type RegionProvider } from './region-directory.js';
+import {
+  gymRegionsInGuild,
+  regionsAtPoint,
+  stopRegionsInGuild,
+  type RegionProvider,
+} from './region-directory.js';
 
 const MINUTE = 60_000;
 /** Logged when a party that cannot be shown cannot be ended either. */
@@ -417,6 +430,17 @@ export type SplitOutcome =
     };
 
 /** What the party service needs of the region table. */
+/**
+ * What the summary reads of the pinned post "Today at the stops" of a region's channel (plan
+ * 8X-G; `StopPostService.summaryOf`): its server and first message, and how many tasks and
+ * hideouts it names; undefined where the channel has no post today.
+ */
+export interface StopPostsForSummary {
+  summaryOf(
+    channelId: string,
+  ): { serverId: string; messageId: string; tasks: number; hideouts: number } | undefined;
+}
+
 export interface SummaryStore {
   setForum(id: number, forumChannelId: string | null): Promise<'set' | 'no-region' | 'forum-taken'>;
   setSummaryMessage(id: number, forumChannelId: string, messageId: string | null): Promise<boolean>;
@@ -507,8 +531,15 @@ export interface PartyServiceOptions {
   gateway: PartyGateway;
   regions: RegionProvider & { load(): Promise<void> };
   regionStore: SummaryStore;
-  /** The row id of a server (`GuildRepository`); regions belong to servers by that id. */
-  guilds: { idFor(snowflake: string): Promise<number | undefined> };
+  /**
+   * The row id of a server (`GuildRepository`); regions belong to servers by that id. Its
+   * snowflake by the row (`snowflakeOf`) makes the summary's links to messages (plan 8X-G: a
+   * train's copy in another region's channel); without it the summary links the posts.
+   */
+  guilds: {
+    idFor(snowflake: string): Promise<number | undefined>;
+    snowflakeOf?(id: number): Promise<string | undefined>;
+  };
   gyms: { get(id: number): Gym | undefined; regionsOf(gymId: number): string[] };
   raidBosses: RaidBossProvider;
   /**
@@ -598,6 +629,19 @@ export class PartyService {
    * summary that would be the same is not edited again.
    */
   private readonly summarySent = new Map<number, { postId: string; text: string }>();
+
+  /** The regions whose summary post Discord refused to rename, said once in the log. */
+  private readonly renameRefused = new Set<number>();
+  /** The timers that try a summary post's rename again, by region (review r1, R1-6). */
+  private readonly summaryRenameTimers = new Map<number, { cancel: () => void }>();
+  /** The renames those timers have under way, which `flush` waits for. */
+  private readonly summaryRenames = new Set<Promise<void>>();
+
+  /** The snowflakes of the servers by their rows, as far as known (`guilds.snowflakeOf`). */
+  private readonly snowflakes = new Map<number, string>();
+
+  /** The pinned posts of the stops (`StopPostService`), for the summary's line; none until set. */
+  private stopPosts: StopPostsForSummary | undefined;
   /** The parties whose posts wait to be shown with other emoji, and the timer of the next. */
   private emojiQueue: string[] = [];
   private emojiTimer: (() => void) | undefined;
@@ -642,6 +686,11 @@ export class PartyService {
       render: (party) => this.rendered(party),
       refusedFiles: this.refusedFiles,
       emojiRefused: () => options.appEmoji?.refused?.(),
+      // A train's copy in another region is what that region's summary links (plan 8X-G).
+      copied: (kind, channelId) => {
+        const region = kind === 'region' ? options.regions.byChannel(channelId) : undefined;
+        if (region) this.summaries.request(region.id);
+      },
       log: options.log,
       now: this.now,
       ...(options.sharedDelayMs === undefined ? {} : { sharedDelayMs: options.sharedDelayMs }),
@@ -2105,8 +2154,30 @@ export class PartyService {
    */
   changed(partyId: string): void {
     this.posts.request(partyId);
-    const regionId = this.options.store.get(partyId)?.regionId;
+    const party = this.options.store.get(partyId);
+    const regionId = party?.regionId;
     if (regionId !== null && regionId !== undefined) this.summaries.request(regionId);
+    // A train may pass through any region of its server (plan 8X-G): every summary of the
+    // server is drawn again, and one that would be the same is not edited (`summarySent`).
+    if (party && isTrain(party)) this.serverSummaries(party.guildId);
+  }
+
+  /** Asks for the summary of every region of a server that has a forum. */
+  private serverSummaries(guildId: number): void {
+    for (const region of this.options.regions.all()) {
+      if (region.guildId === guildId && region.forumChannelId !== null) {
+        this.summaries.request(region.id);
+      }
+    }
+  }
+
+  /**
+   * The pinned posts of the stops (plan 8X-G): the summary links the post of its region's channel
+   * today, with its counts. Set by the app once the service of the stops is made (none in
+   * rehearsal mode); it tells `summaryChanged` when a post changes.
+   */
+  setStopPosts(stopPosts: StopPostsForSummary): void {
+    this.stopPosts = stopPosts;
   }
 
   /**
@@ -2144,10 +2215,18 @@ export class PartyService {
    * its post (requests to delete it, its rename budget) is dropped. `end` and `postGone` call
    * it; so must whoever ends a party in some other way.
    */
-  ended(party: { id: string; forumPostId: string | null; regionId: number | null }): void {
+  ended(party: {
+    id: string;
+    forumPostId: string | null;
+    regionId: number | null;
+    type?: string;
+    guildId?: number;
+  }): void {
     this.deletionRequests.delete(party.id);
     if (party.forumPostId !== null) this.forgetPost(party.forumPostId);
     if (party.regionId !== null) this.summaries.request(party.regionId);
+    // A train that ended passes through no region any more (plan 8X-G).
+    if (party.type === 'train' && party.guildId !== undefined) this.serverSummaries(party.guildId);
   }
 
   /** The summary of a region is brought up to date shortly. */
@@ -2532,6 +2611,9 @@ export class PartyService {
       await this.mirrors.flush();
       // A post run can ask for a summary and for its copies, and a summary run for a post.
     } while (this.posts.pending > 0 || this.summaries.pending > 0 || this.mirrors.pending > 0);
+    await Promise.all(this.summaryRenames);
+    for (const { cancel } of this.summaryRenameTimers.values()) cancel();
+    this.summaryRenameTimers.clear();
     for (const { cancel } of this.renameTimers.values()) cancel();
     this.renameTimers.clear();
     for (const { cancel } of this.summaryTimers.values()) cancel();
@@ -2804,7 +2886,74 @@ export class PartyService {
     const maxBattles = parties
       .filter(isMax)
       .map((party) => ({ party, title: maxTitle(this.maxView(party)) }));
-    return renderSummary(raids, now, meetups, trains, maxBattles);
+    const region = this.options.regions.byId(regionId);
+    return renderSummary(raids, now, meetups, trains, maxBattles, {
+      passing: region === undefined ? [] : this.passingThrough(region),
+      stops: region === undefined ? undefined : this.stopsLine(region),
+    });
+  }
+
+  /**
+   * The trains of other regions of the region's server with a stop in it (plan 8X-G; as their
+   * copies go, `stopRegionsInGuild`), each linked to its copy in the region's channel where it has
+   * one and the server's snowflake is known, else to its post.
+   */
+  private passingThrough(region: Region): ListedTrain[] {
+    const { store, gyms, wayspots, regions } = this.options;
+    const guildId = region.guildId;
+    if (guildId === null) return [];
+    const places = { gyms, ...(wayspots === undefined ? {} : { wayspots }) };
+    const snowflake = this.snowflakes.get(guildId);
+    return store
+      .active()
+      .filter(isTrain)
+      .filter((party) => party.guildId === guildId && party.regionId !== region.id)
+      .filter((party) =>
+        // Only while the train will still reach a stop of the region (review r0 C4).
+        stopsStillReached(party).some((ref) =>
+          stopRegionsInGuild(places, regions, ref, guildId).some((one) => one.id === region.id),
+        ),
+      )
+      .map((party) => {
+        const stop = currentStop(party);
+        const copy = party.mirrorMessages.find(
+          (mirror) => mirror.kind === 'region' && mirror.channelId === region.channelId,
+        );
+        return {
+          party,
+          title: trainTitle(party),
+          at: stop === undefined ? undefined : stopLabel(this.stops(stop)),
+          copyUrl:
+            copy === undefined || snowflake === undefined
+              ? undefined
+              : `https://discord.com/channels/${snowflake}/${copy.channelId}/${copy.messageId}`,
+        };
+      });
+  }
+
+  /** The line of the region's pinned post of the stops today, where there is one (plan 8X-G). */
+  private stopsLine(region: Region): StopsLine | undefined {
+    const post = this.stopPosts?.summaryOf(region.channelId);
+    if (!post) return undefined;
+    return {
+      url: `https://discord.com/channels/${post.serverId}/${region.channelId}/${post.messageId}`,
+      tasks: post.tasks,
+      hideouts: post.hideouts,
+    };
+  }
+
+  /** Learns the snowflake of a server for the summary's links, once (`guilds.snowflakeOf`). */
+  private async knowSnowflake(guildId: number | null): Promise<void> {
+    const { guilds } = this.options;
+    if (guildId === null || guilds.snowflakeOf === undefined || this.snowflakes.has(guildId)) {
+      return;
+    }
+    try {
+      const found = await guilds.snowflakeOf(guildId);
+      if (found !== undefined) this.snowflakes.set(guildId, found);
+    } catch (err) {
+      this.options.log.warn({ err, guild: guildId }, 'could not read the snowflake of a server');
+    }
   }
 
   private async renderSummary(regionId: number): Promise<void> {
@@ -2812,6 +2961,7 @@ export class PartyService {
     if (!region?.forumChannelId || !region.summaryMessageId) return;
     const failed = region.summaryMessageId;
     const { gateway, log } = this.options;
+    await this.knowSnowflake(region.guildId);
     const message = this.summaryMessage(regionId);
     const text = JSON.stringify(message);
     const last = this.summarySent.get(regionId);
@@ -2837,8 +2987,69 @@ export class PartyService {
     // A post that was archived and opened again comes back unpinned.
     const info = await gateway.postInfo(failed);
     if (!info) return;
-    this.summarySent.set(regionId, { postId: failed, text });
     if (!info.pinned) await this.pinSummary(regionId, failed);
+    // The text is sent: a request with the same text edits nothing (review r1, R1-6).
+    this.summarySent.set(regionId, { postId: failed, text });
+    // A post made as "Active raids" before plan 8X-G is renamed, by the rename limit as a party's
+    // post; a rename that has to wait is tried again by its own timer, not by editing again.
+    if (tidyTitle(info.title) !== SUMMARY_TITLE) await this.renameSummary(regionId, failed);
+  }
+
+  /**
+   * Tries the rename of a summary post again after `waitMs` (bounded as `namedWait`), by itself:
+   * the text it shows is sent already (review r1, R1-6). Nothing for a post that is no longer the
+   * region's summary.
+   */
+  private renameSummaryLater(regionId: number, postId: string, waitMs: number): void {
+    this.summaryRenameTimers.get(regionId)?.cancel();
+    const cancel = this.setTimer(() => {
+      this.summaryRenameTimers.delete(regionId);
+      if (this.options.regions.byId(regionId)?.summaryMessageId !== postId) return;
+      const renaming = this.inSummaryChain(regionId, () => this.renameSummary(regionId, postId))
+        .then(() => undefined)
+        .catch((err: unknown) => {
+          this.options.log.warn({ err, region: regionId }, 'could not rename a summary post');
+        })
+        .finally(() => this.summaryRenames.delete(renaming));
+      this.summaryRenames.add(renaming);
+    }, PartyService.namedWait(waitMs));
+    this.summaryRenameTimers.set(regionId, { cancel });
+  }
+
+  /**
+   * Renames a summary post to `SUMMARY_TITLE`; true when it is renamed or gone, false otherwise.
+   * A wait Discord named (its rename limit, a rate limit) is waited by a timer of its own
+   * (`renameSummaryLater`); a refused permission is for good, said once per region until a rename
+   * works again (review r0 C1, r1 R1-5), and the next change of the text tries again; any other
+   * failure (a 5xx, the network) is tried again after the rename window.
+   */
+  private async renameSummary(regionId: number, postId: string): Promise<boolean> {
+    const { gateway, log } = this.options;
+    try {
+      const answer = await gateway.renamePost(postId, SUMMARY_TITLE);
+      if (answer === 'renamed' || answer === 'gone') {
+        this.renameRefused.delete(regionId);
+        return true;
+      }
+      this.renameSummaryLater(regionId, postId, answer.laterMs);
+      return false;
+    } catch (err) {
+      const wait = rateLimitWaitMs(err);
+      if (wait !== undefined) {
+        this.renameSummaryLater(regionId, postId, wait);
+        return false;
+      }
+      if (isMissingPermission(err)) {
+        if (!this.renameRefused.has(regionId)) {
+          this.renameRefused.add(regionId);
+          log.warn({ err, region: regionId }, 'could not rename a summary post');
+        }
+        return false;
+      }
+      log.warn({ err, region: regionId }, 'could not rename a summary post; trying again later');
+      this.renameSummaryLater(regionId, postId, RENAME_WINDOW_MS);
+      return false;
+    }
   }
 
   /**
@@ -2913,7 +3124,8 @@ export class PartyService {
   }
 
   /**
-   * Records as the region's summary an "Active raids" post the bot made in the forum, where the
+   * Records as the region's summary a "Going on now" post the bot made in the forum (or one made
+   * as "Active raids" before plan 8X-G, `LEGACY_SUMMARY_TITLE`), where the
    * record lost it (the record points at a post that is gone, or at none: a forum put back by
    * hand): the pinned one, else the oldest left over (it is pinned with its next edit). A second
    * post would not get the forum's one pin (Discord's 30047). `changed` when the region's forum
@@ -2931,7 +3143,8 @@ export class PartyService {
       // Open posts come oldest first.
       for (const postId of (await gateway.openPosts(forumId)) ?? []) {
         const info = await gateway.postInfo(postId);
-        if (info?.title !== SUMMARY_TITLE) continue;
+        // Also one made as "Active raids" before plan 8X-G, renamed with its next edit.
+        if (info?.title !== SUMMARY_TITLE && info?.title !== LEGACY_SUMMARY_TITLE) continue;
         if (info.pinned) {
           found = postId;
           break;
@@ -2960,6 +3173,7 @@ export class PartyService {
     const { gateway, regionStore, regions, log } = this.options;
     const forumId = region.forumChannelId;
     if (forumId === null) throw new Error(`Region ${region.id} has no forum`);
+    await this.knowSnowflake(region.guildId);
     const message = this.summaryMessage(region.id);
     this.summarySent.delete(region.id);
     // As a party's post: v2 as the first message where Discord takes it, edited in otherwise.
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index 98eb5d5aa73c872d708dd6bb46a2576de8b3f130..ff8d9feb3638a97ef56e327a4a22d0fbfc56b07a 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -53,6 +53,8 @@ function postsWith(initial: ResearchEvent[] = []) {
     log,
     now: () => clock.now,
   });
+  /** The channels whose post the summary was told changed (plan 8X-G), in order. */
+  const changes: string[] = [];
   const make = () =>
     new StopPostService({
       storage,
@@ -65,6 +67,7 @@ function postsWith(initial: ResearchEvent[] = []) {
       log,
       now: () => clock.now,
       delayMs: 0,
+      changed: (channelId) => changes.push(channelId),
     });
   const posts = make();
   const report = (task: ResearchTask, stops = [west(1)]) =>
@@ -93,6 +96,7 @@ function postsWith(initial: ResearchEvent[] = []) {
     said,
     entries,
     setEvents,
+    changes,
   };
 }
 
@@ -136,6 +140,44 @@ describe('StopPostService', () => {
     ]);
   });
 
+  it('tells the summary what its post holds and when it changes, and when it goes (plan 8X-G)', async () => {
+    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
+    made = postsWith();
+    await made.posts.start();
+    expect(made.posts.summaryOf(WEST_CHANNEL)).toBeUndefined();
+    await made.report(pageTask('Catch a Dragon-type Pokémon'));
+    await made.report(pageTask('Catch 7 Pokémon'), [west(2)]);
+    // Arlo at two stops is one hideout, as the post counts its blocks (review r0 C2).
+    for (const stop of [west(3), west(4)]) {
+      await made.reports.reportRocket({
+        serverId: FAKE_GUILD_ID,
+        stop,
+        subject: rocketSubject(feedChoice('leader:arlo')),
+        reporter: ASH,
+      });
+    }
+    await made.posts.flush();
+    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(made.said()[0]).toMatch(/\*\*Arlo\*\*[^\n]*\n- \*\*[^\n]+\n- \*\*/);
+    expect(made.posts.summaryOf(WEST_CHANNEL)).toEqual({
+      serverId: FAKE_GUILD_ID,
+      messageId: first?.id,
+      tasks: 2,
+      hideouts: 1,
+    });
+    expect(made.changes).toContain(WEST_CHANNEL);
+    expect(made.changes).not.toContain(EAST_CHANNEL);
+    expect(made.posts.summaryOf(EAST_CHANNEL)).toBeUndefined();
+    // At midnight the post goes, and the summary is told.
+    made.changes.length = 0;
+    made.clock.now = at('2026-11-22T00:00:01');
+    await vi.advanceTimersByTimeAsync(at('2026-11-22T00:00:02') - at('2026-11-21T10:00'));
+    await made.posts.flush();
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toEqual([]);
+    expect(made.posts.summaryOf(WEST_CHANNEL)).toBeUndefined();
+    expect(made.changes).toContain(WEST_CHANNEL);
+  });
+
   it('shows the hideouts of the day after the research; a grunt makes no post (8R-2)', async () => {
     made = postsWith();
     const rocket = (key: string, stop = west(1)) =>
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index b0c93f4ed73cae7f8ab172cce3db45a37ea7bab5..1a213e53e67ef5f33f908c816ff468905ef52e7b 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -53,6 +53,12 @@ export interface StopPostServiceOptions {
   log: Logger;
   now?: () => number;
   delayMs?: number;
+  /**
+   * Told after a channel's post was drawn or deleted (plan 8X-G): the region's summary links the
+   * post with its counts (`summaryOf`), and is drawn anew (`PartyService.summaryChanged`; one
+   * that would be the same is not edited).
+   */
+  changed?: (channelId: string) => void;
 }
 
 /**
@@ -76,6 +82,8 @@ export class StopPostService {
   private readonly gathered: Gathered<string>;
   /** The posts kept, by channel (one a day each; an older day's until it is deleted). */
   private readonly posts = new Map<string, StopPostRecord>();
+  /** How many tasks and hideouts each channel's post shows, as last drawn (plan 8X-G). */
+  private readonly counts = new Map<string, { tasks: number; hideouts: number }>();
   private timer: NodeJS.Timeout | undefined;
   private closed = false;
   /** Which message of a channel's post holds each task (by its subject), as last drawn. */
@@ -333,6 +341,11 @@ export class StopPostService {
       updatedAt: this.now(),
     };
     this.posts.set(channelId, record);
+    this.counts.set(channelId, {
+      tasks: view.tasks.length,
+      // As the post counts them: one per leader (or decoy) shown, whatever its stops (r0 C2).
+      hideouts: (view.hideouts ?? []).length,
+    });
     this.holding.set(
       channelId,
       new Map(
@@ -343,6 +356,24 @@ export class StopPostService {
       ),
     );
     await storage.save(record);
+    this.options.changed?.(channelId);
+  }
+
+  /**
+   * What the summary of the channel's region shows of its post (plan 8X-G): the server, the first
+   * message (the link), and how many tasks and hideouts it shows, as last drawn; undefined where
+   * the channel has no post of today drawn since the start.
+   */
+  summaryOf(
+    channelId: string,
+  ): { serverId: string; messageId: string; tasks: number; hideouts: number } | undefined {
+    const post = this.posts.get(channelId);
+    const counts = this.counts.get(channelId);
+    const [messageId] = post?.messageIds ?? [];
+    if (!post || !counts || messageId === undefined || post.day !== this.dayOf(this.now())) {
+      return undefined;
+    }
+    return { serverId: post.serverId, messageId, ...counts };
   }
 
   /**
@@ -419,8 +450,10 @@ export class StopPostService {
     if (this.posts.get(post.channelId) === post) {
       this.posts.delete(post.channelId);
       this.holding.delete(post.channelId);
+      this.counts.delete(post.channelId);
     }
     await storage.remove(post.channelId, post.day);
+    this.options.changed?.(post.channelId);
   }
 
   /**
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index f8c9eec1809af521a8c2fb4f6aa50dea7769fa18..28197d77f5fcfe2bb638f5d0bae1f23d9f34f484 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -377,6 +377,7 @@ export async function partyServiceWith(
     // The fakes' server is the guild of row 1, which the invented regions belong to.
     guilds: {
       idFor: (snowflake) => Promise.resolve(snowflake === gateway.guildId ? 1 : undefined),
+      snowflakeOf: (id) => Promise.resolve(id === 1 ? gateway.guildId : undefined),
     },
     now,
     // Long enough that nothing runs by itself during a test.
````

### Task 8: 8X-G 8: docs and the staging checklist

Prototype commit: `eb4907fe04bcf902cec8efdb35bb19f7f75941c3`

- trains.md: Move… and Manage… in the place of the Manage train panel (the dialogs,
  their ids and guards, TrainService.manage), the third row Group… Move… Manage… Split…
  Route, the kind's words, the split's radio in letter order.
- parties-and-posts.md: groups kept in letter order, the dialogs by letter, the row's
  labels, Set time…, the summary "Going on now" with Passing through and the line of
  the stops, the takeover and rename of an "Active raids" post, the time hint's date.
- discord-framework.md: dialogs with several choices (choices, selectedOf) and the
  rule that a labelled button that opens a dialog ends in an ellipsis.
- utilities.md: Pokebattler (30 s, 32 MB raid answers reduced and kept, 6 h and 200,
  Cache-Control, no pause on a timeout, the use given back, the too-large answer, the
  User-Agent, the probes and the heap measured), DATE_EXAMPLE, max events loaded.
- stop-reports.md: summaryOf and changed for the summary's line. web.md: the map's
  group order and its panel unchanged.
- The staging checklist 2026-10-22-phase-8xg-staging.md (deploy the commands first;
  the Android preselection with letter order; the steps the 8X-F run did not reach),
  and a section for the prototype in the follow-ups.

**Files:**

```
 docs/architecture/discord-framework.md                 |  4 ++-
 docs/architecture/parties-and-posts.md                 | 22 ++++++++--------
 docs/architecture/stop-reports.md                      |  2 +-
 docs/architecture/trains.md                            | 25 +++++++++---------
 docs/architecture/utilities.md                         |  6 ++---
 docs/architecture/web.md                               |  4 +--
 docs/superpowers/plans/2026-10-22-phase-8xg-staging.md | 52 ++++++++++++++++++++++++++++++++++++++
 docs/superpowers/plans/phase-0-follow-ups.md           | 18 +++++++++++++
 8 files changed, 103 insertions(+), 30 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, no test file in this task: the typecheck alone); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff eb4907fe04bcf902cec8efdb35bb19f7f75941c3 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-G 8: docs and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 713a67e4a8e64749847975da161a841b18c01c2b..9a761496add8cce08e95446d0422057e2ef709ae 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -24,10 +24,12 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
-- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order). Discord's client keeps what was submitted in a dialog per custom id and shows that again in place of the value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so a dialog that marks a value to start with (Meet…, the which-group dialog, Group…) ends its custom id in a per-open token, `openToken(now)` (`~` and the moment it opened in base 36, about ten characters: count them in the 100), which its Submit leaves out with `withoutOpenToken(args)` (plan 8X-F; a dialog drawn before without it submits as before); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
+- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order). Discord's client keeps what was submitted in a dialog per custom id and shows that again in place of the value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so a dialog that marks a value to start with (Meet…, the which-group dialog, Group…) ends its custom id in a per-open token, `openToken(now)` (`~` and the moment it opened in base 36, about ten characters: count them in the 100), which its Submit leaves out with `withoutOpenToken(args)` (plan 8X-F; a dialog drawn before without it submits as before); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). Plan 8X-G: `choices` asks several, each under its label after `choice` (Manage… of a train: "The route" as a radio group, the mode and the kind as menus; Discord takes five components in a dialog, the text included), a menu's options with their `emoji` (a radio group shows none), read at Submit with `pickedOf` (a radio group) and `selectedOf` (a menu: the option chosen when it is one of the values, else undefined). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
+- **A labelled button that opens a dialog ends in `…`** (plan 8X-G; Matt, 2026-10-22: a post control that needs more input opens a dialog, never a private reply with controls): Group…, Meet…, Move…, Manage…, Split…, Set time…, Something is wrong…, Appeal…, Ask the moderators…, Delete… (the moderators' notice of a pin battle), Open the form again…, Change options…, Close…, Refuse place…, Block maker… and the others; a button that only shows something has none (Route, Screenshot feedback, Go to post). Text that names such a button names it with its `…` (`"Set time…" gives them.`, `press "Appeal…".`); an icon-only button (Meet…'s ⏰) is named by its icon.
+
 ## Where an interaction came from
 
 - Where an interaction came from is read only through `channelContext(interaction)` (`src/discord/channel-context.ts`): a thread or forum post is judged by the channel it is in (`baseChannelId`), and a DM is `!interaction.inGuild()`, never the channel cache. `regionChannelOf(interaction, ctx)` gives the region channel or undefined. Both also take an autocomplete interaction (`LocatedInteraction`).
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index c84104e0f7bf86f81eb5f52efe73374b427e5c8b..544ca6354702dc6c0dca3a599cf35f81db79b35c 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -8,7 +8,7 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - `Party` is a union, `RaidParty | MeetupParty | TrainParty | MaxParty`. Code that is about a raid narrows: `isRaid` in the domain and services, the guard `requireRaid` with `commandRaid(interaction, ctx)` in a handler, `raidOf` elsewhere; likewise `isTimed` / `requireTimed` / `commandTimed` and `isMeetup` / `requireMeetup` / `commandMeetup`, and `isMax` for a max battle. Every guard names its kinds outright (plan 8X-3: `isTimed` is a meetup or a train, `requireRaidOrTrain` a raid, max battle or train): a kind added later is none of them by elimination. A battle (`isBattle`, `BattleParty`: a raid or a max battle) is one where Done means the member completed it, and its present members are asked whether they did (`completeRaid`, `askGroupWhetherComplete`, `completeUnanswered`; the egg's refusal stays a raid's). A change inside `PartyStore.update` keeps the kind (`asKindOf(original, changed)`; the store throws when the kind changes). Never cast to a kind.
 - What the clock does is `partyTick(party, input)` (`tick.ts`; it dispatches to `raidTick`, `maxTick` or `timedTick`; a raid and a max battle share `battleClock`: the meeting times, the questions, the archiving warned `deletionWarningTime` ahead): it returns the party as it should be now, `effects` (`stage`, `ask-complete`, `completed`, `warn`, `end`) and `render`. It is idempotent and catches up after downtime by itself. `end` comes alone and repeats until the caller has ended the party with `endParty`.
 - A party changes only through `PartyStore.update(id, change)` (`src/services/party-store.ts`): one change at a time per party, written to the database first, then replaced in memory. `change` is synchronous and decides inside the callback (a `get` made earlier may be stale); the result has `written`. Two parties that must change together (a train's split: the old train loses the group, the new one is made to match) change through `PartyStore.updateBoth([id, id], change)`: `change(first, second)` gets both as they are (undefined for one that is not active: it decides) and returns `parties` in the same order, both written by one storage call in one transaction (`PartyStorage.saveBoth`; the notes as `save`'s: an end behind its savepoint inside the transaction, steps after the commit; a deadlock runs the whole transaction again, `retryOnDeadlock`, and one that persists or another loss of the transaction writes both rows again alone), memory replaced only after the commit, both before the listeners hear of either; a failed write leaves both as they were, a row that is gone writes neither. It takes both locks in the order of the ids, so a change of either waits for it and two such changes never deadlock; nothing inside it takes a lock again (`KeyedLock` is not re-entrant). A reported raid is stored only through `addRaidUnlessTaken`, a reported max battle only through `addMaxUnlessTaken` (below). Handlers read through `ctx.parties` (`get`, `byPost`, `active`, `inRegion`, `raidAt`, `maxAt`).
-- Groups (plan 8X-1B; design `2026-10-20-join-group-meet-buttons-design.md`): a party's groups are in the order they were opened, and each remembers when (`PartyGroup.opened`; a party's first group and every group of a document before version 12 count as opened with the party: `groupOpened`). A group nobody is in goes (decision 6, a wish of legacy Pine's): `pruneGroups` (`attendance.ts`, pure) drops a group no attendee of any status is in (who is interested and who is done count), unless it has a label or a meeting time, never the party's last group (of all empty ones the default group stays); the others keep their letters, and when the default group goes the newest left takes over (by `groupOpened`). `PartyStore.update` and `updateBoth` (both parties) run it on every change that returned a new party, never on a refusal or a change of nothing; it is silent (no line, no ping, the post shown anew). A new group takes `nextGroupId`'s letter (after the last in use, else the first free one), so a letter can be given again: whatever names a group across time names it by its letter and stamp (`groupStamp`, base 36; `stampedGroup` finds a group only while the letter is still that group): the custom ids of the dialogs about groups and Meet…'s, the train split's mark (`groupMark` is `<stamp>.<hash>`; a mark of a group that went, or whose letter a group opened since has, is `no-such-group`, worded as before; a label changed or another split since is `group-changed`), and the party history's meeting times (`history.md`). A group a change opens is stamped with `AttendanceLimits.now`, which the services give with every change (`limitsOf`; `applyAutoStatus` takes it too), and in any case after the party's last write and every group it has (`openedGroup`): stamps strictly increase, also within one millisecond. Who signs up without choosing a group is placed silently as before: +1, −1, Remote and the commands (`/join`, `/here` …, without `group`), and a report's automatic status, go where `setAttendance` puts a newcomer (`chooseGroup` with a lobby size, else the default group); only the post's Interested, Join and Here ask (below).
+- Groups (plan 8X-1B; design `2026-10-20-join-group-meet-buttons-design.md`): a party keeps its groups in letter order, A to E (plan 8X-G, Matt 2026-10-22: before, in the order they were opened, so a letter given again came after later ones, C D E A; a new group goes in its place, `withGroupAdded` in `createGroup` and `chooseGroup`, and a stored party is read sorted, `inLetterOrder`, with no new state version), so the post, the dialogs, `/shout group:`'s choices and the map list them by letter; each remembers when it was opened (`PartyGroup.opened`; a party's first group and every group of a document before version 12 count as opened with the party: `groupOpened`). A group nobody is in goes (decision 6, a wish of legacy Pine's): `pruneGroups` (`attendance.ts`, pure) drops a group no attendee of any status is in (who is interested and who is done count), unless it has a label or a meeting time, never the party's last group (of all empty ones the default group stays); the others keep their letters, and when the default group goes the newest left takes over (by `groupOpened`, `newestFirst`; so does a train's split). `PartyStore.update` and `updateBoth` (both parties) run it on every change that returned a new party, never on a refusal or a change of nothing; it is silent (no line, no ping, the post shown anew). A new group takes `nextGroupId`'s letter (after the last in use, else the first free one), so a letter can be given again: whatever names a group across time names it by its letter and stamp (`groupStamp`, base 36; `stampedGroup` finds a group only while the letter is still that group): the custom ids of the dialogs about groups and Meet…'s, the train split's mark (`groupMark` is `<stamp>.<hash>`; a mark of a group that went, or whose letter a group opened since has, is `no-such-group`, worded as before; a label changed or another split since is `group-changed`), and the party history's meeting times (`history.md`). A group a change opens is stamped with `AttendanceLimits.now`, which the services give with every change (`limitsOf`; `applyAutoStatus` takes it too), and in any case after the party's last write and every group it has (`openedGroup`): stamps strictly increase, also within one millisecond. Who signs up without choosing a group is placed silently as before: +1, −1, Remote and the commands (`/join`, `/here` …, without `group`), and a report's automatic status, go where `setAttendance` puts a newcomer (`chooseGroup` with a lobby size, else the default group); only the post's Interested, Join and Here ask (below).
 - Every party that ends is recorded in the party history (`history.md`): the store asks `PartyHistory` for a note of each write, which the storage writes with the party, and a change that ends a party says why with `ended` in its result (`PartyEnd`: the scheduler `clock`, `PartyService.end` `cancelled` by default, a move `moved`, a party that never had its post `failed`). Once recorded, an ended party's `Party` row is deleted (it holds its members' ids; Matt, 2026-10-16): what reads ended parties (`endedPosts`, `partyForums`) also reads `EndedPartyPost`, and nothing may count on an ended row being there.
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - A raid's boss is stored as a reference, `{ key }` (catalogue key) or `{ name }` (a boss the game master does not know): make it with `raidBossRef(boss)` from a `RaidBoss` of `ctx.raidBosses`, never by passing that object itself. An egg has no boss; `raid.reportedHatched` says whether a raid without times was seen hatched.
@@ -22,12 +22,12 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - A time a member types for an existing raid is read by `typedPartyTime(ctx, party, 'hatch' | 'end' | 'meet', text, now)` (`src/commands/raids/raid-input.ts`); handlers read `Date.now()` themselves (their tests fake only `Date`). A boss with only one fast or one charged move has it set wherever a raid gets its boss (`certainMoves`: report, `/boss`, hatch).
 - The raid command for another gym is `/location`, not `/gym`: `/gym` is the gym administration of Phase 5, and one slash command cannot be both a command and a group of subcommands. A gym of another region of the same server moves the raid there: `/location` asks first (its own file, `src/commands/raids/location.ts`), in a dialog since plan 8Q: titled `Move the raid to another region`, today's question with the region's channel named (`#east`, `channelInDialog`; the answers keep their mentions) and `Submit moves it.`; refusals before asking (no such gym, several, a gym with such a raid, none of a region with a forum) stay private replies, and a move within the region asks nothing. The dialog carries the party and the gym (no pending request); its Submit (`locationControls.modal`, `requireGuild`) is acknowledged privately, refused as over (`This raid is over.`) unless the raid it names is the one of the post it is submitted in (`raidOf`), and moves the raid as the service decides then (`raids.setGym`), the answer (`This raid is now at … Its new post is …`) given before the old post closes; a refusal that is none of the member's doing gives back the Submit and the use of `/location` that opened the dialog (`carriesOn`, plan 8S-4: when it was counted is the custom id's last part, `location:<party id>:move:<gym id>:<counted at>`), and a failure after the move was answered is only logged. Command and Submit have no limit of their own (the `CHANGE_THROTTLE` of every change of a raid applies; Matt, 2026-10-11); the buttons of the question before plan 8Q (`location:<token>:yes|no`) get the router's stale answer.
 - A `group` option is free text with autocomplete of the groups the raid has (`respondWithGroups`), read by `typedGroup` (`src/commands/parties/reply.ts`); text that is no group is refused, never ignored.
-- Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`: Set time and Screenshot feedback; Done, the completion question's answers and Meet… are a max battle's too, plan 8X-3), otherwise "This has ended.", also on the map and in Meet…'s refusal
+- Sentences name the kind of party with `partyWord(party)` (`partyOver(party?)`, `problemText(reason, limits, word)`, `answerOutcome` takes the party): no member of a meetup reads "raid". `requireParty` says "a raid or meetup"; a control of a party that has ended says "This raid is over." only for what a raid alone has (`isRaidAction`: Set time… and Screenshot feedback; Done, the completion question's answers and Meet… are a max battle's too, plan 8X-3), otherwise "This has ended.", also on the map and in Meet…'s refusal
 - Private answers to clicks on a post's controls go through `answerClick` (`ctx.clickAnswers`, `ClickAnswers`): the first click of a member on a party is answered with `reply`, later ones within two seconds are only acknowledged (`deferUpdate`), and the first answer is then edited to the answer of the last click. Only the first interaction of a burst may be given `editReply` (on a `deferUpdate`d click it would edit the post's own message). A refusal is thrown and shown at once. The test context answers every click by itself (window zero).
 
 ## Raids
 
-- What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`; the words are `raidChangeAnswer`'s, `src/commands/raids/raid-changes.ts`, which a refusal or a raid that ended throws). `/hatch`, `/end` (of a raid), the "Set time" form, `/boss` (of a raid) and `/moveset` go through `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` there (read, change as the member, answer), the one code path the live map calls too (plan 8M-4, `web.md`); `/raid` reports through `reportRaidAs` and words the outcome with `reportWords` (`src/commands/raids/report.ts`), which the map shares; a report that would put the member in a forum somebody keeps them out of (the forum the new raid would go to, or that of an active raid already at the gym, which may stand in another region's forum: `reportBarred`, the map's check too) is refused with `REPORT_BARRED` (plan 8M-6), by `/raid`'s guard before its throttle for a gym typed outright, and once the gym is known (`withGym`) for one chosen from a menu or read from a screenshot (counted then), and again on "Report it there" after the question about a gym of another region (the access may have changed since); a failure of Discord to say propagates. A screenshot posted in a region channel is checked the same way before it is reported, unasked or once its gym is picked (`reportShot`, `screenshots.md`). The check reads `parties.active()` and asks Discord before the report, outside `PartyStore.update`, so when two members report a gym of two regions within moments, the first one's raid may appear in a forum the second's check did not see; the report therefore asks again where it would join a raid already at the gym (plan 8W-3: `RaidReport.mayJoin`, `mayJoinAs` / `mayJoinNoting` of `report.ts`, asked once the raid to join is known, not for the region's own forum, which every caller checked already; inside `PartyStore.update` a raid whose forum is not the one asked about any more is not joined either) and answers `barred` (`REPORT_BARRED`; the map 403, Discord away 503; a screenshot `unknown-access`) without signing them up; such a refusal comes after the throttle, so it counts as a use of `/raid` (on the map too, `raid-report.test.ts`). What is left is a change of the member's own access between that question and the write, as for any check of access. It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
+- What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`; the words are `raidChangeAnswer`'s, `src/commands/raids/raid-changes.ts`, which a refusal or a raid that ended throws). `/hatch`, `/end` (of a raid), the "Set time…" form, `/boss` (of a raid) and `/moveset` go through `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` there (read, change as the member, answer), the one code path the live map calls too (plan 8M-4, `web.md`); `/raid` reports through `reportRaidAs` and words the outcome with `reportWords` (`src/commands/raids/report.ts`), which the map shares; a report that would put the member in a forum somebody keeps them out of (the forum the new raid would go to, or that of an active raid already at the gym, which may stand in another region's forum: `reportBarred`, the map's check too) is refused with `REPORT_BARRED` (plan 8M-6), by `/raid`'s guard before its throttle for a gym typed outright, and once the gym is known (`withGym`) for one chosen from a menu or read from a screenshot (counted then), and again on "Report it there" after the question about a gym of another region (the access may have changed since); a failure of Discord to say propagates. A screenshot posted in a region channel is checked the same way before it is reported, unasked or once its gym is picked (`reportShot`, `screenshots.md`). The check reads `parties.active()` and asks Discord before the report, outside `PartyStore.update`, so when two members report a gym of two regions within moments, the first one's raid may appear in a forum the second's check did not see; the report therefore asks again where it would join a raid already at the gym (plan 8W-3: `RaidReport.mayJoin`, `mayJoinAs` / `mayJoinNoting` of `report.ts`, asked once the raid to join is known, not for the region's own forum, which every caller checked already; inside `PartyStore.update` a raid whose forum is not the one asked about any more is not joined either) and answers `barred` (`REPORT_BARRED`; the map 403, Discord away 503; a screenshot `unknown-access`) without signing them up; such a refusal comes after the throttle, so it counts as a use of `/raid` (on the map too, `raid-report.test.ts`). What is left is a change of the member's own access between that question and the write, as for any check of access. It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
 - The post of an egg shows the game's egg (`raidEggName`, `src/domain/pogo/raid-eggs.ts`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one. `raidLook(view)` (`src/render/raid-post.ts`) gives the live map the post's picture, the boss it names and where Where says it is (`place`: the gym's name as the post shows it, its point and address line; plan 8M-6), decided as for the post. The pictures are square (plan 8D-F, Matt, 2026-10-17: PokeMiners' icons are 112 by 128 and a phone crops a thumbnail to a square, cutting the egg's bottom off): `scripts/eggs/make-eggs.ts` (`npm run eggs:make`, the one step that downloads them, from `RAID_EGG_PICTURES_URL`'s pinned commit) padded each with transparency to a square of its longer side, the egg centred and unscaled, into `pictures/eggs/`, which is committed and in the image; nothing is fetched at run time, and `settings.raidEggPicturesUrl` is retired (`RETIRED_SETTINGS`). `EggPictures` (`src/services/egg-pictures.ts`, `PartyServiceOptions.eggPictures`) says where a post takes one from: once the web server listens (`src/app.ts` calls `serving()` when `startWebServer` answered true, so a port it could not take leaves the files) with `settings.web` at a public address that is not this machine's, the bot's own web server (`<publicUrl>/eggs/<name>.png?v=<8 hex>`, the start of the file's SHA-256, so that a cached picture never hides an egg made again; `web.md`); otherwise, and until then, the message carries the file and shows it as `attachment://<name>.png` (`RaidPostView.eggFile`, `PostLayout.pictureFile`, `PartyBrief.pictureFile`). Every post message says which files it has (`files`, `[]` when none: `postMessage`), and an edit that says so replaces the files the message had (`editAs` sends `attachments: []` and the files uploaded again; a conversion sends them through the REST route with `attachments` by index, `uploadsOf`), as Discord documents it: an edit keeps only the attachments it names. So the egg's file is uploaded again with every edit while it is an egg (some 22 KB), and the edit at hatch takes it away. A copy in another channel and the direct message's brief carry the same file. Where the bot may not attach files Discord answers Missing Permissions (50013), not Invalid Form Body: `isRefusedFile` (`src/discord/party-gateway.ts`, over `looksLikeRefusedFile`: 50013, 50035, 40005 or an error of reading the file, for a message that carries files) has a post, its edit and a copy sent once more without the file (`PostVariant.files: false`: the egg left out, pictures by address kept; `postForms`, `sendInForms`, `src/services/refused-files.ts`), and then in its other forms if Discord refuses one (`FormTrail`, below the controls); once a form without the file goes through (also one that needed plain emoji or no pictures as well), the forum, the post or the channel of copies is remembered for ten minutes (`RefusedFiles`, shared by `PartyService` and `PartyMirrors`), so that its next messages go without the file at once, with no refused call and no warning each time; a post made by its line of text after the first way had its file refused edits the line in without the file at once. Invalid Form Body is never noted as refused files (when a post is made it is taken as a refused first message; an edit or a copy refused so may have been refused for what it holds): only another refusal of the file is.
 
@@ -36,15 +36,15 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - A max battle (plan 8X-3; design `2026-10-20-max-battles-design.md`, section 3) is `MaxParty` (`type: 'max'`, `max: { tier, boss, spot }`; `src/domain/party/max.ts`): a tier of `MaxTier` (`D1` to `D5`, `G`), a boss that is always known (no egg), and a spot, a power spot as it was named (`PowerSpot`, a snapshot shown as it is now while it is the same place, `spotNow` over `shownPlace`) or a pin, an "Unlisted power spot" (Q7, `UNLISTED_SPOT`). `gymId` and `hatchTime` stay null; its end is always set. Remote is allowed; no copies in the remote or elite channels.
 - One max battle per spot and server: `PartyStore.maxAt(guildId, spot, now)` (an active one of that server whose end has not come, `blocksNewMax`; the same power spot, or a pin within 50 m of a pin, `sameSpot`; a Wayfarer id is the same in every server) and `addMaxUnlessTaken` under a `KeyedLock<string>` of the spot (`withSpotLock`, `spotKey`: `w<Wayfarer id>`, one key `pin` for every pin), which `whenIdle` waits for. `PartyService.reportMax(MaxReport)` makes one with its post in the forum of a region whose outline holds the spot (`regionForSpot`, the report's own region first): `created`, `exists` (the same boss and tier: the reporter is signed up by their automatic status; answered "There is already a max battle against <the battle's boss> at this spot: <post>." whatever the report named, "…: its post is being made." without a post, and on the map without the post, plan 8X-F), `taken` (another boss: refused, Q3; the boss, tier and that it still holds the spot decided again inside `PartyStore.update`, since `/boss` may change it while the report waits), `no-region`, `no-forum`, `no-post`, `barred`, `ended`, `pin-blocked` (`MaxReport.mayCreateAtPin`, asked of a report at a pin before the spot's lock: false, a free spot gets no battle, `addMaxUnlessTaken` with `mayAdd: false`, while the battle there may still be joined; `reportMaxAs` asks it of meetup safety's block, `blockedAtPin`). `/max spot:` offers the power spots that fit what is typed (`nearChoices`), and with nothing typed the region's power spots by name (`regionSpotChoices`, `src/commands/place-option.ts`, as a max train's `/route add`; plan 8X-F; none outside a region's channel).
 - How long it lasts is `defaultMaxEnd` (`src/domain/time/max-end.ts`, `utilities.md`): the boundary of its rotation, else the day's last battle time or the start of a max event later that day (Q-B); `/end` changes it within its day (`typedMaxTime`) through `ctx.maxBattles` (`MaxChangeService`: `setEnd` under the spot's lock, `spot-taken` where an ended battle's later end would share its spot, meeting times after it cancelled; `setBoss`, the tier with the boss, `max-kind-change` between Dynamax and Gigantamax). A report at or after the last battle time is refused; `/max` asks first about a new battle whose end, not typed (a typed `end:` is never second-guessed), is within `ENDING_SOON_MINUTES` (5), in a dialog (`endingSoonDialog`: until the next rotation, `nextRotationEnd`, first and picked, or until the end about to pass; only "Report it anyway?" at the last battle time and for a Dynamax battle at its event's last boundary). Whether it asks is decided once, by its guard (`MaxAsk.asks`), and read by the deferral and the command: a deferral cannot be followed by a dialog. The Submit (`maxControls`, `requireGuild`) decides again (another boss there by then, a member kept out since, the end passed); one without the choice it was shown is `STALE_COMPONENT`. Its refusal of another boss names the battle by its kind (`maxBossTitle`), a pin "an unlisted power spot", and the `/boss` hint only within one kind. The report itself is `reportMaxAs` and its words `maxReportWords` (`src/commands/max/max-report.ts`, a post and a channel named by the caller's `MaxNames`: `ReportNames` plus `ended`, `bossHint`, `pinBlocked`), with `maxBarred`, `blockedAtPin` and the dialog's words `endingSoonQuestion`, the code paths the live map shares (plan 8X-5, `web.md`, "Max battles on the map"; the map asks the ending-soon question as an answer and a second request).
-- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …`, the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
+- Its post (`renderMaxPost`, `src/render/max-post.ts`): `### Dynamax Machamp (2★)` / `### Gigantamax Machamp`, `Until 21:00 (in …)` or `Ended at …`, the boss's types and weaknesses (no catch CP, no moves), the boss's picture (`shownMaxBoss`: the Gigantamax icon where the game has one); Where `**<title>** (power spot) · <address> · [Map]` with the Wayfarer picture, or `📍 **Unlisted power spot** · [Map]` (a power spot as it is now while it is the same place, `spotNow`: the title, the post's heading, the DM brief and `/where` alike); the groups with their lobby; a battle's controls (Done completes; Meet… with the round 5-minute times of the next hour up to its end, Q10; no Set time…, no Screenshot feedback); the reporter. Its title `<battle> · <spot>`, its tags `Max battle` (+ `Ended`), its link line `New max battle: <#post>`; the summary lists max battles under **Max battles** after the raids.
 - A battle at a pin, an "Unlisted power spot" (a place nobody checked; Matt, 2026-10-21, final review G1): a member blocked from meetups (`MeetupSafety.blocked`, the block that refuses their meetups; never staff, nobody while meetup safety is off) is refused a new battle there in plain words (`MAX_PIN_BLOCKED`, no Appeal button: the block is appealed with `/meetup`, `meetup-safety.md`) by `/max`'s guard, before anything is made and uncounted, and again at the ending-soon dialog's Submit where the report would not join a battle; joining the battle at the pin is allowed (its Join button would sign them up anyway, fix review 4), and a known power spot is still theirs. Every pin battle is posted at once as before (wants and DMs as before), its log line names the reporter and the server, and the moderators' channel, when set, gets a notice of it on the side (`ModerationReports.maxAtPin`, `moderation.md`). Every DM and `/where` name a max battle's spot as its post does now (`PartyService.spotOf`: `spotNow` over the kept Wayspots; the notifier's `posts.spotOf`, as meetups' `placeOf`).
 
 ## Meetups and timed parties
 
 - A timed party (a meetup or a train) has `party.timed` (`name`, `startTime`: one start for the whole party, not a group's meeting time) and changes through `ctx.timedParties` (`TimedPartyService`: `setName`, `setDescription`, `setStartTime`, `setEndTime`, `flush`) over the pure functions of `src/domain/party/timed.ts` (and `meetup.ts`). Each of the four takes the value the change was drawn from (`drawn`, the live map's meetup editor, plan 8M-5M) and refuses it inside the store as `changed-meanwhile` when the party has another by now (`asDrawn`); the commands give none. What `/name`, `/meet` and `/cancel-meet` in a timed party, `/end` of one and `/info` do is `renameAs`, `startAs`, `endAs` (`src/commands/parties/timed.ts`, answering `TimedAnswer`, which the commands reply with through `replyTimed`) and `describeAs` (`src/commands/meetups/info.ts`), the code paths the map shares. It is over at its end time; without one, a day after its start; without either, a day after it was made or its last time was removed (`latestTime(party, now)`, `settled`). The clock warns it `trainOrMeetupDeletionWarningTime` ahead, and an ended one is always shown as over. A new start is announced in the post gathered (one message a few seconds after the last change).
-- A meetup has one group and no completion: Done means leave (`finishParty`), `/group` and a group's meeting time are refused (`no-groups`, `party-wide-start`), its post has no Done and no Set time button, and its maker is always named.
+- A meetup has one group and no completion: Done means leave (`finishParty`), `/group` and a group's meeting time are refused (`no-groups`, `party-wide-start`), its post has no Done and no Set time… button, and its maker is always named.
 - A meetup's place (plan 8D, Matt, 2026-10-17) is `meetup.place` (`MeetupPlace`, `src/domain/geo/place.ts`: a `KnownPlace`, a gym or PokéStop as it was when it was named, a snapshot (a new meetup is never at a power spot: Matt, 2026-10-17, poorly curated and often on private property; `MEETUP_PLACE_KINDS`, and `PlaceKindsOnly` for `nearChoices` and `namedPlace`, whose pin is then named by no power spot either; one stored before stays as it is); or a `DroppedPin`, a point with the place `near` it within `PIN_NEAR_METRES` 50 and the `linkName` its maps link gave). It is set once, by `/meetup near:` when the meetup is made (`createMeetup`; `near` required since plan 8S-1, which also asks for the start and, in a form, the information, and holds a place that might be private for the moderators: `meetup-safety.md`; a meetup made before may have no place), and never changes afterwards (Matt, 2026-10-17): no command adds, changes or clears it, since a new public place would skip the moderators' check of plan 8S, and what more there is to say about where goes in the information (`/info`). `/location` is for raids alone. `near` is read by `namedPlace` (`src/commands/place-option.ts`, shared with `/wild near:`). The post shows the place as it is now while it is the same place (`shownPlace`: the gym by id from `MeetupPostView.gym`, the kept Wayspot from `MeetupPostView.wayspot`, of the same kind and within `PLACE_MOVE_METRES` 25 of the snapshot, so a rename, a new picture, address or a gym's notice show), else the snapshot; the stored place is never rewritten. A gym edit shows the meetups at it anew (`GymUpkeep.showAnew`), a load of the kept Wayspots those near a PokéStop or power spot (`PartyService` over `WayspotProvider.whenChanged`). Its Where, after the heading block and before "Meeting Information": a known place `Near **<title>** (<kind>) · <address> · [Map](…)` (the `NO_ADDRESS` rule of a raid's Where), a gym's notice under it, its picture beside; a pin `📍 Near **<title>** (<kind>)` (the nearest place within 50 m), else `📍 **<linkName>**`, else `📍 Dropped pin`, with its Map and no picture (`pinLine`, `src/render/place.ts`); nothing without a place. The DM brief has the first line of the Where without links or Map, and the place's point as its `map`; the DM of a start time names the place as the post shows it now (`PartyService.placeOf`, `meetupPlaceNow`).
-- A time typed for a timed party is read by `typedTimedTime` (`src/commands/parties/timed.ts`) over `resolvePartyTime` (for a meetup still to be made, `/meetup start:`, against `newPartyTimes('meetup', now)`): never into the past, on the day of its start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`. Raids keep `typedPartyTime`.
+- A time typed for a timed party is read by `typedTimedTime` (`src/commands/parties/timed.ts`; one it cannot read is refused with `timedTimeHint`, whose example date is three days from today, `dateExample`, plan 8X-G) over `resolvePartyTime` (for a meetup still to be made, `/meetup start:`, against `newPartyTimes('meetup', now)`): never into the past, on the day of its start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`. Raids keep `typedPartyTime`.
 
 ## How a post is rendered
 
@@ -52,9 +52,9 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 - What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS` and `RETIRED_TAGS` (tags the bot once used: `/admin setup-forums` takes them off a forum, never a tag the server made); Discord allows a forum 20 tags, the server's own included (`MAX_FORUM_TAGS`, final review G2): `ensureTags` adds only what fits and logs the rest at warn, the posts go without them rather than every report failing, and `/admin setup-forums` takes the retired tags off first and names the tags a forum has no room for (`ForumSetup.tagsMissing`), `inShownOrder`), the components in `src/render/v2.ts` (with `countComponents`, the count Discord's limit is about, the one every renderer uses); `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut. Every post says where the party is under **Where** (plan 8D, Matt, 2026-10-17, like the `/wild` report's Where; the layout below).
 - The layout of a post (plan 8D; Matt, 2026-10-17, mockup version 4): a heading block says what the party is, with the post's picture beside it (`accessory: 'picture'`): a raid `### Level 5 raid against Yveltal ✨` / `### Level 5 raid (egg)` (`heading`; the DM brief keeps the bold `headline`), its times or `closed`, `KEPT_OPEN`, then the boss's lines (`bossLines`: "Hatches as …" for an egg, weaknesses, catch CP, moves), which are no block of their own; a train `### Raid Train: <name>`, "After …", times, conductor, `KEPT_OPEN` and the boss's facts; a meetup its name and times. The gym's name no longer opens a raid's post (its thread title keeps it), and a copy's line (`lead`) still opens the first text. Then **Where**: for a raid and a train's current stop `gymWhere(heading, gym, fit)` (`src/render/raid-post.ts`): one line `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a link; `addressLine` made plain and cut to `ADDRESS_ROOM`; the one Map of the post, masked, in angle brackets so that it shows no preview), then the gym's notice (`plainLines`, cut to `LOCATION_ROOM` through `fit.part`), with the gym's picture from Wayfarer beside them (`placeSection`, a `PostThumbnail`; plan 8W-2: `Gym.imageUrl`, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept). Without an address the line is `**<gym>** · [Map](…)`; beside a picture it says `(no address available)` (`NO_ADDRESS`) so that the picture never sits beside a bare name, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) those words go with it (`PostThumbnail.withoutPicture`). A raid whose gym is gone says `**Unknown gym**`, without a map. No post says that a gym is an elite raid gym (Matt, 2026-10-17: it mattered for EX raids; the gym keeps its flags for staff's views, `/gym elite` and the `#elite-gym-raids` copies). A train's Where is in `trains.md`, a meetup's below ("Meetups and timed parties"). Everything from the sign-up lists down is as it was. The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more) once the trainers' details are back inside their sections (below).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
-- The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times, or a max battle that is on (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 31 with Split group… (before, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody should consider moving to another group.", Matt, plan 8X-F) under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
-- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Manage train…, Split group…, Whole route, `trains.md`). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game's Select Time icon; `PENDING_CONTROL_ICON_NAMES`: the upload script makes none until its file is in `pictures/emoji/`, since it reports a missing file as a failure), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
-- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group newest first (`newestFirst`), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) newest first, then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>[:~<token>]` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
+- The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times, or a max battle that is on (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 32 with Move…, Manage… and Split… (plan 8X-G; 31 with Manage train… and Split group…; before 8X-1B, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody should consider moving to another group.", Matt, plan 8X-F) under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
+- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a battle's, `isBattle`: a raid's or a max battle's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times or a max battle, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time… (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Move…, Manage…, Split… and Route, words only, Group…'s emoji left out on a train: `trains.md`, plan 8X-G). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game's Select Time icon; `PENDING_CONTROL_ICON_NAMES`: the upload script makes none until its file is in `pictures/emoji/`, since it reports a missing file as a failure), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
+- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group in letter order (plan 8X-G, `inLetterOrder`; newest first before), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked; since plan 8X-G the groups in letter order, and marked to start with where they have no size the default group, where Join, +1 and Remote put a newcomer, review r0 A2: an iPhone starts there, Android with group A). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so (where coming takes them out of a full group, a lobby size, they hear where they went instead, and no "you stay"). **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) in letter order (plan 8X-G), then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a new group that would change nothing is refused by `createGroup` itself, inside the store (`nothing-to-change`), so Group…'s Submit by a member left alone meanwhile and `/group new` alike are told so by the party as it is then (`newGroupRefusal`: "You are the only one here: …" in a party of one group, else "You are alone in group B already: a new group would change nothing."). Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). A `Change group` dialog carries `in` first in its custom id (`SIGNED_UP_MARK`, `party:<id>:regroupform:in[:<way>]`): its Submit by a member who has left since is refused inside the store (`no-longer-signed-up`, "You are no longer signed up: press Group… again."), not signed up again; a `Join a group` dialog still signs its newcomer up. **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>[:~<token>]` (`meetControls`; the token per opening, plan 8X-F, `discord-framework.md`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time is no longer offered: press ⏰ again.", Meet… named by its icon, `meetIcon`, as the post's hints name it), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A sentence that ends with a place's name (a gym, a power spot, a stop, a route's stop by its link) ends through `endSentence(text)` (`src/render/text.ts`, plan 8X-F): no period is added where what a reader sees already ends in one (`.`, `!`, `?`; through closing bold, a masked link's address and `plain`'s escapes), so "at **Fire Company Inc.**" never reads "Inc..". A battle at a pin is "at an unlisted power spot" in running text (the DMs' `MaxDmView.pin`, the meeting DM); the label `Unlisted power spot` stays where it is a name (the post, `/where`, the moderators' notice, the map).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
@@ -62,10 +62,10 @@ A party is a raid, a max battle, a meetup or a train: an immutable object change
 
 ## Discord: the gateway and the party service
 
-- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split group… and `/group split`), said in its private answer, and the Submit of the dialog of `/location`, said in its private answer, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
+- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split… and `/group split`), said in its private answer, and the Submit of the dialog of `/location`, said in its private answer, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
-- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Active raids` with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains and the meetups, one text display per tier and section, all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains and the meetups each, a heading and a count line for every tier, "…and N more"). The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, an `Active raids` post the bot made in the forum is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
+- `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Going on now` (`SUMMARY_TITLE`; plan 8X-G, Matt 2026-10-22: every kind of party, `Active raids` before; `NOTHING_GOING` "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`.") with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the max battles under **Max battles** (plan 8X-3: those whose end has not come, 5 stars down to 1, Gigantamax last, the soonest end first in each), then the trains, then **Passing through** (plan 8X-G, review R9: the trains of other regions of the server with a stop in this region, as their copies go, `stopRegionsInGuild`; each linked to its copy in this region's channel, a message link by the server's snowflake, `guilds.snowflakeOf`, read once, else to its post; counted in the head as `N trains passing through`; a train's change, and its end, ask for every summary of its server, an unchanged one not edited, and a copy recorded for its region's, `PartyMirrorsOptions.copied`), then the meetups, one text display per tier and section, and last, after a line, the region's pinned post of the stops today with its counts (`[Today at the stops](<link>): 6 tasks · 2 hideouts`, `StopsLine`, from `StopPostService.summaryOf` set with `setStopPosts`; nothing where nothing is reported, none in rehearsal mode; `stop-reports.md`), all within `TEXT_BUDGET` (`SECTION_ROOM` for the max battles, the trains, the trains passing through and the meetups each, a heading and a count line for every tier, "…and N more", the stops' line kept from the start). A train counts as passing through a region while it will still reach a stop there (`stopsStillReached`, review r0 C4, Matt 2026-10-22): one that finishes the stops from its current one on, one that loops or turns back every stop (a turn-back keeps its mode and comes back), a finished route none. The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. Where the record of a region's summary is gone or empty, a `Going on now` post the bot made in the forum, or one it made as `Active raids` before plan 8X-G (`LEGACY_SUMMARY_TITLE`; renamed with its next edit, `renameSummary`, by Discord's rename limit; the text is recorded as sent, so a request with the same text edits nothing while the rename waits, and the wait is a timer of its own that renames and edits nothing, `renameSummaryLater`, review r1 R1-6; a refused permission is warned of once per region until a rename works again, the next change of the text trying it again, and any other failure is tried again after the rename window, review r0 C1, r1 R1-5), is recorded and edited instead of making a second one, which Discord would not pin beside it (30047: one pinned post per forum; `takeOverSummary`, staging of 2026-10-16): the pinned one, else the oldest open one, pinned with its next edit (`openPosts` lists open posts only: an archived one is not found). A forum that changed meanwhile gets no post; a failed look makes a new post, with a warning. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
 - Staff for raid moderation are admins, moderators and the owner (`isStaff`, `requireManagement`, `managementRoleIds` in `guards.ts`): `/delete` and `/admin save-party` are theirs; the rest of `/admin` also admits bot developers (`requireBotManagement`). `/delete` (Manage Messages since plan 8S-2; it asks in a dialog whether to archive the post or delete it, plan 8Q, `moderation.md`) has no throttle: it is the staff's manual clean-up and must always work; the post of a raid it closed says so in the place of the times (`RaidPostView.closed`). `/admin save-party` outside a post lists the kept posts. `/shout` is for members who are signed up.
 - The forum of a region holds its raids, max battles, trains and meetups and is named `<region channel>` + `settings.regionForumSuffix` (default `-meetups`). `/admin setup-forums` creates it, renames one whose name is the region's with another one-word ending (a name chosen by hand stays), and leaves the making of posts to the bot (`PartyGateway.reservePosts`: Send Messages denied to everyone and to every role the forum allows it, allowed to the bot; writing in posts is untouched). In rehearsal mode it makes forums only for the rehearsed regions, a new one hidden from its first moment (`createForum(…, hidden)`) and one that is there hidden before anything is posted in it (`PartyGateway.hideForum`, `hiddenForumOverwrites`); a forum that cannot be hidden gets nothing posted (`operations.md`, "Rehearsal mode").
 - `RegionRepository.setForum` gives a region its forum (one forum per region, enforced by a unique key); `setSummaryMessage` names the forum the summary post was made in.
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 785174c704d4ac8985cc74316e079fa782c8647e..7a5b71b817cf533c52949e8778616215cfa8d8de 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -44,7 +44,7 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 
 ## The pinned post "Today at the stops"
 
-- `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, pinned (the "pinned a message" notice deleted where the bot may; at Discord's pin limit, or without Pin Messages, it stands unpinned and that is logged once per channel), drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as `mayPost` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent, before it is pinned), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode.
+- `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, pinned (the "pinned a message" notice deleted where the bot may; at Discord's pin limit, or without Pin Messages, it stands unpinned and that is logged once per channel), drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as `mayPost` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent, before it is pinned), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. The region's summary post links it (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the post's first message and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged` of the channel's region) is told after each draw and each delete, so the summary is drawn anew after every draw of the post and edited where the counts changed. Where the post lives, the region's channel or its forum, is open until the 8R staging.
 - `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first, each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"), the reward's picture beside it; within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it), under an intra-day window when the day's research comes back. Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (the first catch's picture beside it) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
 - `PartyGateway.pinMessage` / `unpinMessage` (`PinOutcome`: `pinned`, `full`, `not-allowed`, `gone`); Pin Messages is optional in `REGION_CHANNEL_NEEDS`, so `cutover-check` warns where it lacks.
 
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 8e0630ec4e733e667f5bc36339d616bb8dbde477..20da7a89274d575c4c7049227d425fe09efaa88f 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -1,6 +1,6 @@
 # Raid trains
 
-The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax or Gigantamax battles), a current stop, a conductor, modes at the end of the route (finish, loop, turn back), movement and its announcement, the private Manage train panel, saved routes, copies in the channels of the regions a train stops in, and the commands' code paths the live map shares. Read before changing trains, routes or the panel (and `parties-and-posts.md` for what all parties share; `web.md`, "Trains on the map", for the map's side).
+The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax or Gigantamax battles), a current stop, a conductor, modes at the end of the route (finish, loop, turn back), movement and its announcement, the dialogs Move… and Manage… of its post (plan 8X-G; the Manage train panel before), saved routes, copies in the channels of the regions a train stops in, and the commands' code paths the live map shares. Read before changing trains, routes or the dialogs (and `parties-and-posts.md` for what all parties share; `web.md`, "Trains on the map", for the map's side).
 
 ## The model
 
@@ -12,23 +12,24 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 
 - Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `reverse`, `setAtEnd`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its stop through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
 - Who may edit is one rule each in `train.ts`, which the domain functions, the live map's view and its routes all ask: `mayNotArrange` (add, remove, move a stop: signed up, the maker, staff), `mayNotClear` (the conductor and staff; `/route clear` counts bot developers as staff), `mayNotLoad` (who may move the train, or the maker its first route), `mayNotMove`. An edit of the route may carry the route it was drawn from (`drawn`, the live map's route editor: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `loadRoute` and `saveRoute` take it last): the service refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`); a command gives none. So may a change of the conductor carry whose the role was as the map drew its button (`seen`, `ConductorSeen`: `setConductor` and `clearConductor` take it last), refused inside the store when the role is somebody else's by now (`conductorDrawn`, reason `conductor-changed`).
-- What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `reverseRouteAs`, `setAtEndAs` and `setKindAs` (plan 8X-5) word the panel's Reverse, mode and kind for the map), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). The post's panel keeps its own answer, drawing itself anew. `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
+- What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `reverseRouteAs`, `setAtEndAs` and `setKindAs` (plan 8X-5) word the map's panel's Reverse, mode and kind; Manage…'s Submit says them in the same words), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). Move… and Manage… answer in the commands' words too (plan 8X-G). `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
 - A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym or a power spot is a stop only when it lies in a region of the train's server (`reaches`, `stopRegionsInGuild`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
-- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), the panel's menu (the menu is only in the panel, which opens only for who may move the train, so `setAtEnd`'s `mayArrange` matters for a panel opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so the panel's control also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
+- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), Manage…'s menu (plan 8X-G; Manage… opens only for who may move the train and staff, so `setAtEnd`'s `mayArrange` matters for a dialog opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so Manage… (and the map's panel) also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
 
-## The post and the panel
+## The post, Move… and Manage…
 
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
-- A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Its buttons are in the third row of the post's controls (plan 8X-1B: the rows of a raid, `parties-and-posts.md`; row 1 Interested, Join, Here, Leave, row 2 −1, +1, Remote, row 3 Group…, then the train's own, `bottomControls`'s `opens`): the grey "Manage train…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; also on a finished route: Previous and Reverse take a Finish back) and on a route longer than `WHOLE_ROUTE_STOPS` "Whole route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then. "Manage train…" answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel`, `pressTrainPanel`, `pressReverse`, `pressAtEnd` in `src/commands/trains/move.ts`): a components-v2 message (plan 8B-3), one container of `TRAIN_PANEL_COLOUR` with `### Manage the train`, where the train is and what Next does (`At stop 2 of 4: …`, `Next is …`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`), the four moves with their emoji (switched off where `cannotMove` says), "🔃 Reverse the route" where `cannotReverse` allows it, and under `**At the end of the route**` a menu of the three modes with the train's own as the default (its labels say each in full, "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", since a closed menu shows the label alone; `/train`'s choices keep `AT_END_LABELS`). Its controls are `party:<id>:<move>:<place>[:<target>]` (the handle of the stop they were drawn at, `stopHandle`: a gym's id, a power spot's eight hex characters; or `end`; Next, Previous and Skip also the handle of the stop they lead to; a handle that matches two stops of the route is `route-changed`), `party:<id>:reverse:<place>:<first>` (`first`: the handle of the stop the route began with when drawn, so that a second press or a panel drawn before another member's Reverse is refused `route-changed` instead of flipping the route back) and the menu `party:<id>:atend:<place>` (a `select` of `partyButtons`): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew with the reason above where the train is; a member who may no longer move it (also after a mode they were allowed to set), one that ended gets `panelNote` (no controls); a train without a route gets the panel with the menu of its kind alone ("This train has no route yet", plan 8X-4). A panel press calls `update` with `v2Answer` and never goes through `answerClick`; a press on a plain-text panel from before 8B-3 updates it to `OLD_PANEL` and sends the new panel as a private follow-up (whether Discord takes a v2 interaction update of a classic message is not known and not tried: the follow-up is the safe path). Command answers (`/next` and the others) keep the panel's `whereText`. The DM brief of a train is unchanged (`placeLine`).
+- A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Its buttons are in the third row of the post's controls (plan 8X-1B: the rows of a raid, `parties-and-posts.md`; row 1 Interested, Join, Here, Leave, row 2 −1, +1, Remote, row 3 the train's own after Group…, `bottomControls`'s `opens`). Plan 8X-G (Matt, 2026-10-22): **Group… · Move… · Manage… · Split… · Route**, short words and no emoji (on a train Group… has none either), five buttons in one row: "Move…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; only while the train has a route; the action of "Manage train…" before, so the button of a post not drawn anew opens Move…, or Manage… on a train without a route), "Manage…" (`party:<id>:manage`, `manageTrainButton`, `moves: true`), "Split…" (below) and, on a route longer than `WHOLE_ROUTE_STOPS`, "Route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`; it only shows, so it has no `…`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then.
+- Move… and Manage… are dialogs (plan 8X-G, the design talk of 2026-10-22: a post control that needs more input opens a dialog; `src/render/train-dialogs.ts`, handlers `openMove`, `submitMove`, `openManage`, `submitManage` in `src/commands/trains/move.ts`), for who may move the train (`mayNotMove`, refused privately before the dialog opens; Manage… also for staff), each the first answer of its press, with the per-open token (`openToken`), and each Submit deferred privately at once and decided again. **Move…** (`moveDialog`): where the train is as text without links (`trainStateText`: `At stop 2 of 4: **X**` / `Next is **Y**`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`; of a finished route where Previous leads), then one radio choice "Where to" (the title says the act; the controller's call, review r0) of the moves that can be made from here (`offeredMoves`; a move `cannotMove` refuses is left out, not switched off; Finish is in Manage…): `Next: <stop>` picked and first (at the last stop `Next: finish the route`, `Next: round to <first>`, `Next: turn back to <stop>`), `Previous: <stop>` (of a finished route `Previous: back to stop N, <stop>`, which takes a mistaken Finish back), `Skip <next stop>, go to <stop after>`. A choice's value is `<move>:<target>` (`targetOf`), its label from `stopLabel` with no markdown, a name cut to fit Discord's 100 (each of Skip's two to 40) and given whole in the description where it was cut. With one move left (a finished route; stop 1 of a route of two that finishes) there is no choice (a radio group takes two to ten, review R1): the text says what Submit does (`Submit takes it back to stop 2, **X**.`) and the custom id carries the move. The custom id, `party:<id>:moveform:<place>[:<move>:<target>]:~<token>`, carries where the train was (`placeOf`, by `stopHandle`). Submit runs `moveTrainAs` with `from` and `target`, so the store decides: two Submits of Next drawn at one stop move it once, and a dialog drawn before somebody else moved the train, or changed its route, answers `The train has moved on since you opened this: ` and where it is now (`train-moved-on`, `route-changed`); otherwise the answer is `/next`'s (`whereText`, "I am telling the others."). Closing the dialog moves nothing. **Manage…** (`manageDialog`): where the train is (of a finished route only `The train has finished its route of N stops.`: where Previous leads is Move…'s; review r0 B3), then "The route", a radio choice (Keep it as it is, picked and first; Reverse it where `cannotReverse` allows, on a finished route with the description `Starts the route again from its last stop, <stop>, the other way round` (the name cut to fit); Finish it here while the route is not finished; left out where only Keep is left), and the menus "At the end of the route" (`AT_END_MENU_LABELS`, their emoji, `AT_END_DESCRIPTIONS`) and "What the train is mainly for" (`TRAIN_KIND_QUESTION`, below), each with the train's own picked (menus, review R7: Android picks a radio group's first choice whatever is marked); a train without a route is asked its kind alone (`NO_ROUTE_YET`). Its custom id `party:<id>:manageform:<place>:<first>:<mode>:<kind>:~<token>` carries where the train was, the stop the route began with (`NO_FIRST`, `-`, without a route) and the mode and the kind it showed, a letter each (`AT_END_CODES`, `KIND_CODES`): Submit applies only what was picked otherwise than shown (review R5: a dialog opened before somebody set the mode does not set it back), and answers `Nothing changed.` where nothing was; a refused Submit of several parts adds `Nothing was changed.` (review r0 B2). What it applies is one change, `TrainService.manage(partyId, member, staff, { kind?, route?: 'reverse' | 'finish', atEnd? }, { from, first })` (review R6): the kind (`setTrainKind`, which asks nothing of where the train is), then the route (`reverseRoute` with `from` and `first`, or Finish, `moveTrain('finish', from)`, announced as a move is, `movedFrom`), then the mode (`setAtEnd`, which asks nothing of where the train is unless the route changed in the same Submit, then where that change left it: review r0 B1, so a kind and a mode picked in a dialog drawn before somebody moved the train are applied), in one store change: one write, one line in the post (the parts' lines in that order), the route judged before the mode (Reverse refused on a turn-back route whatever mode comes with it), a refusal of any part refusing all, each part for whom it was before (the mode `mayArrange` and staff). Its answer says what it did in the words of the commands and the map (`trainKindSentence`, `The route is reversed.`, `The route is finished.`, `atEndSentence`, then `whereText` after a change of the route); a change of the route from a dialog drawn where the train no longer is answers as Move…'s. Both dialogs count as presses of the post (`ACTION_THROTTLE`). The Manage train panel of plans 3C to 8X-4 (`trainPanel`, its moves, Reverse and two menus, `OLD_PANEL`) is gone (review R16): its controls (`next`, `previous`, `skip`, `finish`, `reverse`, `atend`, `kind`, still `PARTY_ACTIONS`) answer `STALE_COMPONENT`, so a panel still open in a client changes nothing. `whereText`, `movementText` and the menus' words are in `src/render/train-words.ts`. The DM brief of a train is unchanged (`placeLine`).
 
-- On the live map the panel opens in the train's popup in place of its actions ("Manage…") and stays open after each move, as the post's does (`web.md`, "Trains on the map"); the popup keeps the click that drew the panel (`keepClicksInPopup`: before plan 8S-3 Leaflet took it for a click on the map, the Manage… button being out of the page by then, and closed the popup at once).
+- On the live map the Manage train panel stays (plan 8X-G changed only the post; the map's panel waits for its UX pass): it opens in the train's popup in place of its actions ("Manage…") and stays open after each move, as the post's does (`web.md`, "Trains on the map"); the popup keeps the click that drew the panel (`keepClicksInPopup`: before plan 8S-3 Leaflet took it for a click on the map, the Manage… button being out of the page by then, and closed the popup at once).
 
 ## Kinds and power spots (plan 8X-4)
 
-- **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid) and the Manage train panel's menu "What the train goes to" under the mode's (`party:<id>:kind`, `pressKind`, `TrainService.setKind`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through the same service (`setKindAs`, `POST …/move/kind`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices): the post's heading and brief, `/help`, the panel; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
-- **Planned ahead:** `/train start:` (a time as `/meet` reads it, `typedTimedTime` over `newPartyTimes('train', now)`, read by the guard first so that a refusal is not counted) makes the train with its start; its route may stay empty until the day (a train with no time still goes a day after it was made). The Manage train panel opens on a train without a route too, with what applies: no moves, no Reverse, no mode, the kind menu (so a kind set wrongly at `/train` can be changed before the first stop).
-- **Stops** (design 6.2; `src/domain/party/stops.ts`): `StopRef` is `{ kind: 'gym', id }` or `{ kind: 'powerspot', id }` (a Wayfarer id); `stopKey` names one as text (`'12'`, `'w<Wayfarer id>'`: no colon, not `p`), by which stops are the same (`sameStop`, `whereOf` for whether a change moved the train) and the map's `MapTrain.route` is made; `stopHandle` is what a control carries (a gym's id; the first 8 hex characters of an FNV-1a hash of a Wayfarer id, so the panel's ids stay within 100 characters with the longest ids, tested), checked against the route when pressed (`stopsByHandle`: no match is `train-moved-on` for a place, two `route-changed`). Every function of `train.ts` works on stops. A power spot is shown as a gym stop (`src/render/train-stops.ts`: `PostStop`, `stopsFrom` over the gyms and the kept Wayspots, `stopLabel` `<title> (power spot)` in lists, the panel and the movement announcement, `stopLink`, `stopWhere`: Where with its address, Map and Wayfarer picture); one no longer kept as a power spot (gone, or an import made it a PokéStop or gym: a train's spot never becomes a stop of another kind) is `Unknown power spot`, refused when added (`spot-gone`) and taken off by `removeUnknownStops` as an unknown gym is (never while no Wayspot is kept, `WayspotProvider.size`). `/where` in a train at a spot names it with its Map; a gym target, a request and the moderators' place are of gyms (a spot is the moderators' place too).
+- **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid; its hint `What the train is mainly for (its stops can be gyms or power spots)`) and Manage…'s menu "What the train is mainly for" (plan 8X-G; `TRAIN_KIND_QUESTION`; the choices `Raids`, `Dynamax Battles`, `Gigantamax Battles`, `trainKindChoice`, the same for `/train kind:`; `TrainService.manage`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through the same service (`setKindAs`, `POST …/move/kind`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices, which name what the train is mainly for): the post's heading and brief, `/help`; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
+- **Planned ahead:** `/train start:` (a time as `/meet` reads it, `typedTimedTime` over `newPartyTimes('train', now)`, read by the guard first so that a refusal is not counted) makes the train with its start; its route may stay empty until the day (a train with no time still goes a day after it was made). Manage… opens on a train without a route too, with its kind alone (so a kind set wrongly at `/train` can be changed before the first stop); the post shows no Move… until the first stop.
+- **Stops** (design 6.2; `src/domain/party/stops.ts`): `StopRef` is `{ kind: 'gym', id }` or `{ kind: 'powerspot', id }` (a Wayfarer id); `stopKey` names one as text (`'12'`, `'w<Wayfarer id>'`: no colon, not `p`), by which stops are the same (`sameStop`, `whereOf` for whether a change moved the train) and the map's `MapTrain.route` is made; `stopHandle` is what a control carries (a gym's id; the first 8 hex characters of an FNV-1a hash of a Wayfarer id, so the dialogs' custom ids and choices stay within 100 characters with the longest ids, tested), checked against the route when pressed (`stopsByHandle`: no match is `train-moved-on` for a place, two `route-changed`). Every function of `train.ts` works on stops. A power spot is shown as a gym stop (`src/render/train-stops.ts`: `PostStop`, `stopsFrom` over the gyms and the kept Wayspots, `stopLabel` `<title> (power spot)` in lists, the dialogs and the movement announcement, `stopLink`, `stopWhere`: Where with its address, Map and Wayfarer picture); one no longer kept as a power spot (gone, or an import made it a PokéStop or gym: a train's spot never becomes a stop of another kind) is `Unknown power spot`, refused when added (`spot-gone`) and taken off by `removeUnknownStops` as an unknown gym is (never while no Wayspot is kept, `WayspotProvider.size`). `/where` in a train at a spot names it with its Map; a gym target, a request and the moderators' place are of gyms (a spot is the moderators' place too).
 - **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered power spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's power spots by name ahead of them (`regionSpotChoices`, shared with `/max spot:`). A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a power spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, and its several (some fitting every word) are "Several places fit", unless the other kind's stop beyond doubt fits the typed text strictly better than that stop or the best of those several (`PlaceFit`, `TypedSide.several.best`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a power spot fits strictly better, and a max train takes a gym's exact full name though several power spots contain its words (plan 8X-F, the staging's "Allegheny Station"); without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add power spots. `/route remove stop:` keeps its stop number.
 - **Saved routes** keep stops: `SavedRoute.stops`, the column `SavedRoutes.gyms` their keys separated by commas (`routeText`, `routeStops`, which also reads the legacy bot's gym ids; no migration). `removeGym` keeps a route's power spots and removes only a route left without a stop; `countWithGym` and `removeGym` narrow their `LIKE` by the parsed stops. `/route load` leaves out stops gone or of no region of the server.
 - **Copies** in other regions go also where a power spot of the route lies (`stopRegionsInGuild` in `PartyMirrors.regionChannels`). The history records a spot's stop with its `wayspotId` (`history.md`). The map draws the line through the spots its data gives (`web.md`).
@@ -40,8 +41,8 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 - `PartyService.splitTrain` (`ctx.trains.split`, `TrainService.split`, which adds the lines) does it as `relocate` does a raid's move, one split of a train at a time: refusals known at once are answered before anything is made (`no-forum` also when the region's forum is not the old train's); the new train is stored, pending, and gets its post in the same forum (`createTracked`: link line, summary, region copies follow; no new-train DMs); then both trains change in one write (`PartyStore.updateBoth([old, new], …)`, one transaction: both or neither), which decides anew; a refusal there (the presser left, the label changed, a second split), an old train that ended, a new train that ended meanwhile (its post deleted: `no-post`), or a failed write takes the new train back (`takeBack`: its post and link line deleted, dropped from the history as never having been a party). In that write the old train loses the group (`splitOffGroup`, the presser noted first), and who is in the group at that moment goes: a Leave or a Join on the old post while the new post was made counts; the new train, as it is then, is brought in line (`carriedSplit`, then `splitSettled`): it drops who left the group, adds who joined it, keeps what members did on the new post meanwhile (who left the new train stays out), is put where the old train was at the split (a Next or a route edit meanwhile) and is settled. A press on the new post while that write waits for the old train's lock goes before it or after it, as the order of the two ids puts the locks (`updateBoth` takes them in that order); either way it counts. Nobody is in both trains or in neither once it settles. The old post is never deleted or replaced: it is re-rendered without the group and with its small print (its region copies too), and gets its line.
 - No window between the writes: the old train's loss of the group and the new train's carry-over commit together or not at all, so nobody can end on both trains or on neither. What is left is the new post of a split whose write never committed: a stop of the process after the new post and before the write, or a failed write whose take-back could not end the new train. It stays pending (`train.splitFrom.pending`, in the state document) while the old train still has the group, and `settlePendingSplits` takes it back, each under the moves lock of its old train: once Discord is there after a start (`app.ts`: taking one back deletes a post), and with the clock's hourly upkeep those made a minute ago or more (`PartySchedulerOptions.splits`: the old train's moves lock keeps a split under way apart from the upkeep, which finds it settled once it has the lock; the minute's age only spares it waiting behind one), logging how many it settled and took back only when it did any; one it could not end stays pending for the next try and is not counted. A pending train whose old train is still active and lists it in `splitOff` cannot come of this code (only 8T's first build, which wrote the two trains one after the other, could leave one); it is settled as it is stored and logged as an error, since the group is on no other train. Only an active old train is seen (the store keeps no ended party): the pending train of an old train that ended is taken back, whatever the old one listed. A commit whose acknowledgement is lost (the connection drops after MySQL committed) is the same rare risk as for any `update`: the split's take-back then ends the new train although the old one lost the group, which leaves the group on neither train in the database (memory still has it on the old train) until the old train's next write stores it again, and a restart before that write makes the loss permanent (the restarted process reads the old train without the group); accepted as the same rare risk as any `update`.
 - Then the old post says `<doer> split group B (Fast) off into a train of its own.` (a line, no ping) and the new post `<doer> split this train off with group B (Fast).`, pinging the members who moved and allow `mentions`, never the presser (`doer`: a maker who asked not to be named is not; `This train was split off with …` then).
-- The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "✂️ Split group…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out) stands after Manage train… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 31 components since plan 8X-1B (each group one text; before, 44 with four groups folded to 40).
-- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens, within `DIALOG_READ_MS` of the interaction (`readInTime`, plan 8Q): past it no dialog opens and the member is told `SLOW_READ` privately. "Split group…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>`. The other (mockup v6, Matt, 2026-10-20: a big train split in person into groups of 17 needs everybody named, and a second line in every choice said the same) is one text display and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups`, first the group with the most members but the presser's own (ties by letter), the presser's own group last (plan 8X-1B: Android picks the first choice by itself; Matt to confirm), nothing marked (the group that leaves is picked on purpose; an iPhone refuses Submit until one is). The text says what is the same for every group, with the new train's name for the first group as the example of `named after the group`; then, once, who leads the new train for each group whose train somebody would lead (`leadSentences`: `If group A leaves, you go with it as its conductor, and <train> has none then.`, and for staff in a group `If group C leaves, you go with it as its conductor.`; nothing for a group whose train would have none); then a line per group in the choices' order (`groupLines`): `**Group B (Fast)** (4 trainers): Cilan +1, Dawn, Iris`, the members as the post lists them (`groupInPostOrder`, by name with their guests, those without a name counted in `, and N more`), the trainers counted with their guests as the post counts them (`headCount`); when the lines would pass Discord's 4,000 characters (`TEXT_ROOM`), every group names the same number of members and how many more. Each choice is only `Group B (Fast) · 4 trainers` (the group's label cut to 40, the whole to 100), with no description, its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform`. A choice's label is the group's label as it is (Discord is assumed to show no markdown there, as in a select's options; 8T staging step 28 checks it), the text is made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split group… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Split group… and Submit count as presses of the post; `/group split` counts in its own window (both `ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split.
+- The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "Split…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out; "✂️ Split group…" before plan 8X-G) stands after Manage… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 32 components since plan 8X-G (Move… and Manage… for Manage train…; 31 since plan 8X-1B, each group one text; before, 44 with four groups folded to 40).
+- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens, within `DIALOG_READ_MS` of the interaction (`readInTime`, plan 8Q): past it no dialog opens and the member is told `SLOW_READ` privately. "Split…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>`. The other (mockup v6, Matt, 2026-10-20: a big train split in person into groups of 17 needs everybody named, and a second line in every choice said the same) is one text display and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups`, in letter order (plan 8X-G, Matt 2026-10-22, every list of groups; before, the group with the most members first and the presser's own last, as Android picks the first choice by itself), nothing marked (the group that leaves is picked on purpose; an iPhone refuses Submit until one is). The text says what is the same for every group, with the new train's name for the first group as the example of `named after the group`; then, once, who leads the new train for each group whose train somebody would lead (`leadSentences`: `If group A leaves, you go with it as its conductor, and <train> has none then.`, and for staff in a group `If group C leaves, you go with it as its conductor.`; nothing for a group whose train would have none); then a line per group in the choices' order (`groupLines`): `**Group B (Fast)** (4 trainers): Cilan +1, Dawn, Iris`, the members as the post lists them (`groupInPostOrder`, by name with their guests, those without a name counted in `, and N more`), the trainers counted with their guests as the post counts them (`headCount`); when the lines would pass Discord's 4,000 characters (`TEXT_ROOM`), every group names the same number of members and how many more. Each choice is only `Group B (Fast) · 4 trainers` (the group's label cut to 40, the whole to 100), with no description, its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform`. A choice's label is the group's label as it is (Discord is assumed to show no markdown there, as in a select's options; 8T staging step 28 checks it), the text is made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Split… and Submit count as presses of the post; `/group split` counts in its own window (both `ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split.
 - The history records each train on its own (`history.md`: the step `split`, `PartyHistoryAttendee.splitOff`, `PartyHistory.splitFromId`; a pending train has no history until it is settled).
 
 ## Saved routes
@@ -50,4 +51,4 @@ The third kind of party: a route of gyms and power spots, a kind (raids, Dynamax
 
 ## Copies in other regions
 
-- A train has a copy of its message in the text channel of every other region of its server that a gym of its route lies in (mirror kind `region`; `regionChannels` in `PartyMirrors`), only where the bot may post embeds (`PartyGateway.mayPost`, from the cache: without Embed Links Discord drops the embed instead of refusing). `PartyMirrors` keeps one newest copy per slot: the kind, and for `region` the kind in a channel. Such a copy is `renderMirror('region', …)`: a line at the top and the post with its controls but "Manage train…" (the layout's `move: false`); it keeps "Whole route". A copy is sent again without its picture when Discord refuses that. A run of the shared queue that left something undone (a failed edit or send, a channel that refuses or is gone) is followed by one more for that party `RETRY_AFTER_MS` later, for a raid's copies too. On the fake gateway `noEmbeds` names the channels that lack the permission.
+- A train has a copy of its message in the text channel of every other region of its server that a gym of its route lies in (mirror kind `region`; `regionChannels` in `PartyMirrors`), only where the bot may post embeds (`PartyGateway.mayPost`, from the cache: without Embed Links Discord drops the embed instead of refusing). `PartyMirrors` keeps one newest copy per slot: the kind, and for `region` the kind in a channel. Such a copy is `renderMirror('region', …)`: a line at the top and the post with its controls but Move…, Manage… and Split… (the layout's `move: false`, `moves` buttons); it keeps "Route". A copy is sent again without its picture when Discord refuses that. A run of the shared queue that left something undone (a failed edit or send, a channel that refuses or is gone) is followed by one more for that party `RETRY_AFTER_MS` later, for a raid's copies too. On the fake gateway `noEmbeds` names the channels that lack the permission.
diff --git a/docs/architecture/utilities.md b/docs/architecture/utilities.md
index 956c7bc6e9f95b0d7a63248d4f6caa71ed15ac4c..d99a44ab69c2bdd37c31a06892e22f0394c44a6c 100644
--- a/docs/architecture/utilities.md
+++ b/docs/architecture/utilities.md
@@ -25,7 +25,7 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 - Max battle tiers are `MaxTier` (`D1` to `D5`, `G`; `src/domain/pogo/max-tier.ts`), the one spelling in the domain, the state document, `RaidBoss.level` and the history; `BattleKind` (`raid`, `dynamax`, `gigantamax`, `battleKindOf(tier)`) is only for lobby sizes and train kinds; their words are there too (`maxTierLabel` "Dynamax 2★", `maxBossTitle` "Dynamax Machamp (2★)", `maxBossChoiceName` "Machamp · Dynamax 2★" / "Gigantamax Machamp").
 - Max bosses come from `ctx.maxBosses` (`bosses()`: the list in effect, D1 to G, then name; `feedBosses()`, the feed as stored), staff's list from `ctx.maxBossAdmin`. Max battles are always on (Matt, 2026-10-21, plan 8X-3: trains, meetups and raid bosses cannot be switched off either): `settings.maxBattles` has a default for every key, and a file without the block has them all. The feed is Pokebattler's `GET /raids` (`settings.maxBattles.url`, `MAX_BOSS_FEED_URL` unless set, read every `refreshMinutes`, 6 hours unless set; about 700 KB): `parseMaxBossFeed` (`src/domain/pogo/max-bosses.ts`) reads `RAID_LEVEL_1_MAX` to `_5_MAX` as `D1` to `D5` and `RAID_LEVEL_6_MAX` as `G`, verified or not (Matt, 2026-10-20), never the `_FUTURE` and `_LEGACY` twins nor the raid tiers (Pokebattler is no raid boss source); a max tier it does not know that has bosses is reported. `maxBossOf` maps an id: the entry of that Pokebattler id, else the entry the id names as a catalogue key or alias (a bare species is the species, or the default form of a species known by one); a Gigantamax id drops `_GIGANTAMAX` and is that Pokémon with the tier `G`, never an entry of its own; a mega is no max boss; an unknown id is a boss by a name made of it, logged once. An upcoming boss is a boss from the start of its `startDate`'s day in `settings.timezone` (Pokebattler gives one instant for an event held at a local hour: the lake trio's 14:00 Max Battle Day is 17:00 in New York), stored as its `firstSeen` (`FeedBoss.startsAt`), so the list leaves it out until then, after a restart too; Pokebattler gives no end in any max tier, so `/max`'s list leaves an upcoming boss out again once an event that named it is over and no event names it now or later (`withoutEndedUpcoming`, plan 8X-3: one the feed first had from that event's day on; a boss of the pool from before stays). It needs the ended event still known: ScrapedDuck drops an event once it has ended; the max events are kept in the database since plan 8X-F (`MaxEvent`, below), an ended one while it started less than eight days ago, so only a restart later than that offers the boss again until Pokebattler drops it (step 11 of the 8X-2 staging, after 2026-10-24, decides whether more is needed). `dynamaxPokemon` is not read. Max boss changes are not announced.
 - What may be typed as a max boss off the lists is the game master's (`GameData.maxBattles`, `catalogue.canDynamax` / `canGigantamax`, `GAME_DATA_VERSION` 6): the modes of `pokemonExtendedSettings.breadOverrides` (`BREAD_MODE`; `BREAD_DOUGH_MODE`, `_2` for Gigantamax), which every such Pokémon has, not `BREAD_POKEMON_SCALING_SETTINGS`, which lists only the 70 species with visuals of their own; a game master with no Pokémon that can Dynamax (the field or mode renamed) is a `game data warning`, not a refused refresh. `typedMaxBoss(entry, bosses, catalogue)` gives a typed Pokémon's listed bosses and the other tiers it may battle in. A Gigantamax boss's picture is `maxBossPicture` (the game's `pm<dex>.f<FORM>_GIGANTAMAX`, else `pm<dex>.fGIGANTAMAX`, else its own). PokeMiners' list of icon files has only 13 `fGIGANTAMAX` icons (no `pm25`: Gigantamax Pikachu shows plain Pikachu, staging of 8X-F, F2); a file name in no list is never guessed, and the plain picture stays until PokeMiners lists the Gigantamax one (Matt, 2026-10-22, plan 8X-G). Dynamax has no look of its own in the game: its battles show the plain picture.
-- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read). The raid events (`merged`) are still kept in memory only: a follow-up. Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before; this question and the refusal of `tier:` outside a max battle give the use back, `givesBack`). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
+- The featured boss: the events feed's `max-mondays` and `max-battles` are max events (`parseMaxEventFeed`, `src/domain/time/max-events.ts`; `RaidEventService.maxEvents()`), apart from the raid events; once one is over the feed has it dropped, or listed without hours (then its hours are assumed, as below: the feed of 2026-10-20 still listed `max-mondays-2026-10-19` with no start or end); one dropped is kept while it started less than eight days ago (`mergedMax`). The max events and the big events are kept in the database as last merged (plan 8X-F; the staging of 8X lost the week's boss to a restart after the feed dropped its Monday): table `MaxEvent` of migration 029 (`MaxEventRepository`, twin `MemoryMaxEvents`, shared `maxEventCases`; a `kind` column, `big` for a big event; replaced whole after each read, so what the merge drops, a max event that started eight days ago, a big event once over, one not begun that the read no longer lists, is gone from it too), loaded before the first read (`RaidEventService.loadMax`, in `app.ts` after `loadResearch`; a read made before it stays as read; it logs `max events loaded` with how many max and big events, plan 8X-G, and a read's `raid events read` says them too). The raid events (`merged`) are still kept in memory only: a follow-up. Their hours are always the feed's own; one without hours whose id carries a date takes the clock times of the nearest event of its kind (its `eventType`, and a Max Battle Day for a day, a Weekend for a weekend) on that date (logged each read), else it is left out (a warning when its date is today or later). `short` is a Max Battle Day (one day, under 6 hours), else all day (a Max Monday, a weekend from start to end). `maxEventAt(events, time)` is the event on at a time; `featuredAt(events, time, zone)` the events whose bosses are featured: a Max Battle Day or Weekend during its hours first, then the week's Max Monday from its start until the next Max Monday or a week of the zone's clock (Matt, 2026-10-20). Their bosses are read from the name (`featuredNames`: "Dynamax Uxie, Mesprit, and Azelf Max Battle Day") through the Pokémon search; a name that does not parse features nothing. `maxBossChoices` / `currentMaxBossChoices` give `/max`'s list (plan 8X-3, `maxBossOptions`, values `m:<tier>:<key>`): the featured bosses first, then 5 stars down to 1, Gigantamax last; during a big event's hours (`bigEventAt`; Matt, 2026-10-21, Q-A) the Gigantamax bosses first, ahead of the featured Dynamax ones, each part in its order. `/max` reads a boss with `readMaxBoss` (`src/commands/max/max-input.ts`): a choice, or a Pokémon typed in full (`Gigantamax ` or `Dynamax ` before it names the kind), its listed boss first, else the tier `tier:` names (asked for, `WHICH_TIER`), Gigantamax needing none; in `/boss` (whose `tier:` is for max battles only, refused in a raid's or a train's post) the listed boss of the battle's own kind first, and in a Gigantamax battle a Pokémon the game lets battle so, while a Dynamax boss on no list needs `tier:` as with `/max` (plan 8X-F: the battle's stars were taken in silence before; this question and the refusal of `tier:` outside a max battle give the use back, `givesBack`). A featured event also brings an upcoming boss it names from its start (`MaxBossProvider.coming()`: east of UTC the day of Pokebattler's instant comes after the event), and during its hours a Gigantamax boss it names that the game master has and the feed does not list (`source` `event`; the coordinator's call, pending Matt), unless staff hid it at G: `MaxBossProvider.hidden()` gives the key and tier of every hide override in force, and a hidden Gigantamax boss stays hidden during an event that names it.
 - The big events (plan 8X-3; Matt, 2026-10-21): ScrapedDuck's `wild-area`, `pokemon-go-tour` and `pokemon-go-fest` (`BIG_EVENT_TYPES`; the last a guess, not in the feed of 2026-10-20: one line to change) bring Gigantamax battles nearly all day, over a day or two; raids act as usual. `parseBigEventFeed` reads the global editions only (an id with the word `global`, local times; the in-person city editions have UTC times and are out of scope until one comes to a region Pine serves), `RaidEventService.bigEvents()` keeps those of the last good read, and one that has begun and not ended that a later read no longer lists (`mergedBig`, by the feed's id, as `mergedMax`) (`ctx.raidEvents`, which is `RaidEventProvider & MaxEventProvider`), `bigEventAt` is the one on at a time. They feature nothing: their names name no boss.
 - How long a max battle lasts (design Q9; Matt, 2026-10-20 and 21): battles rotate on the hour and the half hour, and a report is of a battle in progress, so the default end is the boundary of its rotation (`defaultMaxEnd`, `src/domain/time/max-end.ts`; `maxRotation`): in a short max event (`short`) the next :00 or :30 after the report, in an all-day one the next full hour, and for a Gigantamax battle the next full hour also in a big event and outside any event (`GIGANTAMAX_OUTSIDE_EVENTS`, unconfirmed: the one place to change; `maxRotation` takes another as its second argument, so a test tells a big event from outside), otherwise (a Dynamax battle on an ordinary day) the day's last battle time, or the start of the next max event later that day if sooner (`dayBattleEnd`, Matt, 2026-10-21, Q-B: one rule, to be revisited after the lake trio day of 2026-10-24; `/end` and `end:` still give a later end, and a report under five minutes before the event's start is asked about, the next rotation being the event's first half hour); always capped at `settings.maxBattles.lastBattle`. A report at or after the last battle time is `over`; one before the first battle is taken, its rotation counted from the first battle. `nextRotationEnd` is the end one rotation later (the ending-soon dialog of `/max`), by the rule as things are at the end (review B12: a Dynamax battle at the last boundary of its event has none), undefined at the cap and for a battle that would then last the day.
 - `/admin boss` takes the max tiers after the raid tiers (`BossTier`, `readTier`; not `autoset`, `readRaidTier`): `add`, `hide` and `shiny` with a max tier change the max boss list (a Pokémon the game data does not list as that kind of max boss gets a warning line, not a refusal), `remove` offers the overrides of both (one table numbers them), `list` shows the max bosses after the raid bosses, their upcoming ones under Coming, and `sync max:True` reads the max feed. `/boss-tier` stays raids only.
@@ -43,9 +43,9 @@ The game data and its catalogue, finding Pokémon, raid tiers and bosses with th
 ## Gyms for members, issues, counters and places
 
 - `/find-gym` and `/request` read a gym of this server through `src/commands/util/server-gym.ts` (`#n`, bare digits only when a gym of this server has that number or is called by them, a picked choice, or a clear hit; another server's gym reads as none). GitHub issues go through `ctx.issues` (`GitHubIssues`, `src/services/issue-gateway.ts`: `GITHUB_TOKEN` in the header only, never logged; `GITHUB_REPO`; answers read with a byte limit; a refusal logged by its status and a word for its kind, `refusalKind`, never GitHub's text); text in an issue body has `@`, `#`, `&`, `GH-` and `github.com/` broken by a zero-width space; names in code spans.
-- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`: ten seconds, 5 MB read by `readLimitedJson`, two requests at once, identical requests shared, answers kept ten minutes, a Pokébox never, the next boss name tried on 400/404 or an empty answer). `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&charge=&meterCharge=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`; not among Pokebattler's documented endpoints, www.pokebattler.com/developers, so it may change without notice; a 400 or 404 there is read as a boss it does not know, but may also be parameters it refuses, for staging to tell apart): both through the same turns, limits and pause (no answer for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxBoss`: the most stars, Gigantamax last; for a species a listed form of it, which is then the boss). "Gigantamax X" and "Dynamax X" are read as `/max` reads them. Gigantamax is refused, in the guard, for a Pokémon the game master has neither itself nor any form of as Gigantamax, unless it is on the max boss list at G (Pokebattler's feed may be ahead of the game data) or the post is of its own Gigantamax battle (another boss named there is not: `ownBattle`); in a train's post the train's kind decides (plan 8X-4): a raid train's boss is a raid boss (one that is no raid boss now is asked for `tier:`, and its boss moves are offered), a Dynamax train's is taken at its Dynamax tier where a max boss list names it (`currentMaxBoss` of Dynamax bosses only; else "X is not a Dynamax boss now. Say which tier to simulate with `tier`."), a Gigantamax train's at Gigantamax (refused as above where the game master has no Gigantamax of it), a boss named there alike; a species is asked under its own Gigantamax name and those of its forms that Gigantamax (`gigantamaxDefenders`: Toxtricity and both its forms, Urshifu only its forms). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attackers + charger 2/1/0/0 (attack/meterCharge/shield/heal; the default, Matt's usual team), Balanced 1/1/1/0, All attackers 3/0/0/0, Shielder 1/0/2/0, Healer 1/0/0/2, `charge` (Pokebattler's defender) 0 in all; every count is sent, and Pokebattler refuses a team that is not three. Every role but Balanced has a recorded answer in the tests (`uxie-d5-2-1-0-0` the default's). Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point, and Pokebattler records it where it holds the charged move irrelevant to a max battle, so such a member is shown with its fast move alone, no separator and no small print: plan 8X-F checked the staging's Hydreigon "Bite" against the recorded answers, `test/fixtures/pokebattler-max-teams.json`, `BITE_FAST` / `MOVE_NONE` in the attacker teams, `BRUTAL_SWING` in the shielder's: Pine drops nothing; the first three slots that fit, `MAX_TEAM_SIZE`, the rest counted as left out) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`, Pokebattler's page's words: `ATTACK` Attacker, `METER_CHARGE` Charger, `SHIELD` Shielder, `HEAL` Healer, `CHARGE` Defender) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten; "Others" for a role Pine does not know), the lines sharing what is left of `TEXT_BUDGET` equally, each fitted with "…and N more", the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: All attackers `/max/<boss>`, a team with a charger `/METER_CHARGE`, Shielder `/TANK`, Healer `/TOTAL_HEAL`; `/CHARGER` is the defenders' and `/PARTY` a lobby of four, no role's). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `askPokebattler` and `answeredMessage` (a raid's counters or a max battle's team, by the kept options' `kind`; a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
+- Pokebattler is `ctx.pokebattler` (`PokebattlerFight`, `src/services/pokebattler-gateway.ts`; plan 8X-G after the staging of 8X-F, findings F1 and F3): 30 seconds a request, its body included (a query Pokebattler has not worked out lately took longer than ten; the answer is deferred, and Discord allows 15 minutes), a raid answer read up to 32 MB and a max battle team up to 5 MB by `readLimitedJson` (Mew's raid answer in T5 was 14.7 MB of JSON, 2.9 MB on the wire, 100 boss movesets of 30 counters, probed on 2026-10-22 with Matt's go-ahead: Pokebattler takes no moveset and no smaller aggregation, `aggregation=BEST` is as large, and its site filters one answer in the page), three requests at once, identical requests shared, the next boss name tried on 400/404 or an empty answer. A raid answer is reduced right after it is read to what the answer can show (`keptAnswer`, `src/domain/counters/counters.ts`: of each boss moveset and of the average the best moveset of the first twelve counters and the twelve fastest movesets, with the shadow Pokémon and megas asked for, so `counterRows` of it is that of the whole answer with `single` or without), and only that is kept: a scratch run of a Mew-sized answer (12.5 MB, 101 movesets) took some 270 ms and 73 MB of heap at its peak to parse and reduce, and kept some 320 KB (a boss of ten movesets some 30 KB). Answers are kept six hours and 200 of each kind (Pokebattler's simulations change only when it runs them again for new game data, and its API page asks for answers to be kept; Matt, 2026-10-22), from when they were got or last confirmed, as their headers say (`keepRule`; review r0 A1: Pokebattler sends `cache-control: max-age=3600` and a weak ETag, probed by the controller on 2026-10-22): within `max-age` an answer is used as it is; past it, it is asked for again with `If-None-Match` and its ETag, and a 304 renews it without a download (another `max-age`, or the one it had where the 304 names none; its six hours start again); a new answer replaces it; a name Pokebattler no longer knows (404, empty) asks under every name of the boss again; no answer at all (a timeout, Pokebattler away, busy) answers with the kept one, which is then used as it is for another minute (`REVALIDATION_PAUSE_MS`, review r1 R1-2: the next requests do not wait the time out again; when it was got stays as it was). `no-cache` keeps it but asks each time; `no-store` keeps nothing, said once in the log (`Pokebattler asks for its answers not to be kept`); a failure and a Pokébox are never kept. A request that could not reach Pokebattler pauses it for a minute (`unavailable`, also for what waits); a timeout does not (Pokebattler is working the query out, not down): the member reads "Pokebattler is still working this out: try again in a minute." Every failure that is not the member's gives the use back (`givesBackFor`: a timeout, unreachable, unavailable, busy, too large, unreadable, a 5xx refusal; a 4xx refusal and an unknown boss count), and an answer too large to read still says so plainly with the boss's full results on Pokebattler's site (`troubleError`: `Pokebattler’s answer for Mew is too large for me to read. See the [full results on Pokebattler](<…>).`, the address in angle brackets so that it unfurls no preview, `counterSiteLink` or `maxTeamLink` under the boss's first name). Pine's User-Agent is `Professor-Pine (+https://github.com/Googer/Professor-Pine)` (`POKEBATTLER_USER_AGENT`), as Pokebattler's developer page asks. The dialog's boss moves offer the average and 24 of a boss's movesets (Mew has 100): `/counters moveset:` typed names any. `counters` asks for a raid simulation, `maxTeam` (plan 8X-6) for a max battle team (`GET /max/parties/suggested/defenders/<boss>/levels/<tier>?attack=&heal=&shield=&charge=&meterCharge=&level=&weatherCondition=&friendLevel=`, `maxTeamPath`; not among Pokebattler's documented endpoints, www.pokebattler.com/developers, so it may change without notice; a 400 or 404 there is read as a boss it does not know, but may also be parameters it refuses, for staging to tell apart): both through the same turns, limits and pause (Pokebattler out of reach for one pauses both), each kind with its own cache. What a raid tier and a boss are called there, the option tables and the reading of the answer are pure (`src/domain/counters/`). Nominatim is `ctx.places` (`NominatimSearch`, `src/services/place-search.ts`: one request a second for the whole bot, ten waiting, a ten-minute pause after 429/403 also for searches already waiting, the place most likely meant kept a day; the search text is never logged). Of several places by one name `bestPlace` (`src/domain/geo/nominatim.ts`) takes a settlement or boundary before anything else and anything before a road, then the largest; a name is searched in the regions' box widened by `SEARCH_MARGIN_KM` (`widenedBox`); `settings.findRegion` (address and User-Agent) enables `/find-region`. Which regions a place touches is `shapeTouches` (`packages/wayspot-core/src/shape.ts`: the sides' sweep first, then one point each way). `ctx.maps.place` draws a place with regions; place pictures unused for a day are pruned by the hourly upkeep (`ImageCache.removeOlder`). Outside JSON bodies are read with `readLimitedJson` (a byte cap counted while reading). `/counters` for max battles (plan 8X-6; design section 8) is a max tier of `tier:` (D1 to D5, G, after the raid tiers) or the post of a max battle (its boss and tier, as a raid's post gives its own; a boss named there is taken in its tier), or a boss named without a tier that is no raid boss now and is a max boss (`currentMaxBoss`: the most stars, Gigantamax last; for a species a listed form of it, which is then the boss). "Gigantamax X" and "Dynamax X" are read as `/max` reads them. Gigantamax is refused, in the guard, for a Pokémon the game master has neither itself nor any form of as Gigantamax, unless it is on the max boss list at G (Pokebattler's feed may be ahead of the game data) or the post is of its own Gigantamax battle (another boss named there is not: `ownBattle`); in a train's post the train's kind decides (plan 8X-4): a raid train's boss is a raid boss (one that is no raid boss now is asked for `tier:`, and its boss moves are offered), a Dynamax train's is taken at its Dynamax tier where a max boss list names it (`currentMaxBoss` of Dynamax bosses only; else "X is not a Dynamax boss now. Say which tier to simulate with `tier`."), a Gigantamax train's at Gigantamax (refused as above where the game master has no Gigantamax of it), a boss named there alike; a species is asked under its own Gigantamax name and those of its forms that Gigantamax (`gigantamaxDefenders`: Toxtricity and both its forms, Urshifu only its forms). It shows Pokebattler's suggested team of three for the member's `role:`, one table (`MAX_ROLES`, `src/domain/counters/max-team.ts`; Matt, 2026-10-21, "a good starting point"): Attackers + charger 2/1/0/0 (attack/meterCharge/shield/heal; the default, Matt's usual team), Balanced 1/1/1/0, All attackers 3/0/0/0, Shielder 1/0/2/0, Healer 1/0/0/2, `charge` (Pokebattler's defender) 0 in all; every count is sent, and Pokebattler refuses a team that is not three. Every role but Balanced has a recorded answer in the tests (`uxie-d5-2-1-0-0` the default's). Levels are `MAX_TEAM_LEVELS`, 20 to 50 in steps of five (no best buddy levels: one Pokémon at a time is a best buddy; Matt), 40 unless named; weather and friendship as the raid's (the endpoint reads `weatherCondition` and `friendLevel`, probed live on 2026-10-21; friendship 0 without it); `moveset`, `shadow`, `mega`, `single` and the Pokébox level are refused in words for a max tier (`readMaxPlan`, in the guard, uncounted), `role` for a raid. The boss's names there are `pokebattlerMaxDefenders` (a Gigantamax boss as the feed writes it, `MACHAMP_GIGANTAMAX`, `TOXTRICITY_AMPED_GIGANTAMAX`; a mega has none and is refused); the answer is read by `readMaxTeam` (zod; `MOVE_NONE` is no charged move: the max moves are the point, and Pokebattler records it where it holds the charged move irrelevant to a max battle, so such a member is shown with its fast move alone, no separator and no small print: plan 8X-F checked the staging's Hydreigon "Bite" against the recorded answers, `test/fixtures/pokebattler-max-teams.json`, `BITE_FAST` / `MOVE_NONE` in the attacker teams, `BRUTAL_SWING` in the shielder's: Pine drops nothing; the first three slots that fit, `MAX_TEAM_SIZE`, the rest counted as left out) and its Pokémon named as the max boss feed is mapped (`maxTeamMember`, `maxBossOf`: `RILLABOOM_GIGANTAMAX` is Gigantamax Rillaboom, pictured by `maxBossPicture`; one the game data does not know by Pokebattler's name in words, logged). The answer (`renderMaxTeam`, `src/render/max-team.ts`; `src/commands/util/max-counters.ts`) is in the counters' form: the boss, its types and the role beside its picture, each of the three with its role (`slotRoleWords`, Pokebattler's page's words: `ATTACK` Attacker, `METER_CHARGE` Charger, `SHIELD` Shielder, `HEAL` Healer, `CHARGE` Defender) and moves beside its picture, the first `SHOWN_ALTERNATIVES` (five) alternatives once per role (Pokebattler gives the slots of one role the same ten; "Others" for a role Pine does not know), the lines sharing what is left of `TEXT_BUDGET` equally, each fitted with "…and N more", the level the answer used, the weather and friendship and the max move levels in small print, "Change options…" (its dialog: role, level, weather, friendship; the kept options `KeptMaxCounters`, `kind: 'max'`, in the same `keptCounters` under the same custom-id kind), and "Full results", the role's page of Pokebattler's site (`maxTeamLink`: All attackers `/max/<boss>`, a team with a charger `/METER_CHARGE`, Shielder `/TANK`, Healer `/TOTAL_HEAL`; `/CHARGER` is the defenders' and `/PARTY` a lobby of four, no role's). No trainers estimate. The raid answer's "Full results" is the boss's page of the new site (`counterSiteLink`: `/raids/<boss>`, with `includeShadow=0` and `includeMegas=0` where the answer left them out; the site sends the API's long path there, dropping every option). A command that defers publicly in a party's post (`/counters`) reads the party again before it answers and answers privately when the party has ended meanwhile: an edit in an archived post opens it again. The answer of `/counters` is a components-v2 message (`renderCounters`, `src/render/counters.ts`; plan 8B-2): the boss, its raid and moves and the trainers beside its picture, the twelve counters with their moves' type emoji in small print, what the simulation was for in small print (never the member's Pokebattler user number), "Change options…" and the full results. Its options are kept a day (`keptCounters`, `KeptCounterOptions`: at most `COUNTERS_KEPT_MAX`, in memory, without the Pokébox number) under a token, the custom-id kind `counters` (`counters:<token>:options`, the dialog `counters:<token>:dialog`; `src/commands/util/counters-dialog.ts`): the dialog has five labels (attackers with the presser's Pokébox when they have an id, weather, friendship, boss moves of at most 25, "Also list" as a checkbox group); a submit builds the plan from the kept one (boss and tier never change), runs the command's `askPokebattler` and `answeredMessage` (a raid's counters or a max battle's team, by the kept options' `kind`; a new token; the old one stays good) and answers by `pressAnswer` (a Pokébox only privately); a token that is gone says "These options are no longer kept." A submit counts in the window of the command (above), opening the dialog in its own `MEMBER_READ_THROTTLE` window, and the guard `requireDialogPlan` refuses what does not fit before it is counted.
 - `/maps` is offered where `settings.web` or `settings.regionMapLink` (blank is unset) is set. With the web pages it answers in a server with the map's address and a button of a login link (`ctx.loginLinks.issue`, `web.md`; its small print says not to share it: it logs in whoever opens it as the member), under `MEMBER_WRITE_THROTTLE` (a link is a write); in a DM, which names no server, with `regionMapLink` or "Use /maps in your server."; without them with `regionMapLink` anywhere. `MEMBER_READ_THROTTLE` is the throttle of member commands that only read.
 
 ## /help
 
-- `/help` answers with components-v2 pages for the member alone (`src/commands/util/help-render.ts`, plan 8B-2): the overview (each group with its commands' names, a command's other forms beside it, and the menu "Show a group…"), a group (a line per command with what it does, "Details of a command…" in one or two menus, "◀ All groups"), a command (what it does, **Usage**, **Examples**, "◀ <its group>", "All groups", and for a command with groups of subcommands "Subcommands of a group…"); `/help command:<command> <group>` and a subcommand's page lead one level up ("◀ /admin"; a subcommand of a group to its group, "◀ /admin boss"). The controls are the kind `help` (`help:overview:group`, `help:group:<category>:command|more|overview`, `help:command:<path>:back|overview|subgroup`; the id is the kind of page, the action which page, the first argument what the control does) and `update` the page; who is staff is asked anew with every press, and a staff page is answered as one that does not exist; `MEMBER_READ_THROTTLE`.
+- `/help` answers with components-v2 pages for the member alone (`src/commands/util/help-render.ts`, plan 8B-2): the overview (each group with its commands' names, a command's other forms beside it, and the menu "Show a group…"), a group (a line per command with what it does, "Details of a command…" in one or two menus, "◀ All groups"), a command (what it does, **Usage**, **Examples**, "◀ <its group>", "All groups", and for a command with groups of subcommands "Subcommands of a group…"); `/help command:<command> <group>` and a subcommand's page lead one level up ("◀ /admin"; a subcommand of a group to its group, "◀ /admin boss"). The controls are the kind `help` (`help:overview:group`, `help:group:<category>:command|more|overview`, `help:command:<path>:back|overview|subgroup`; the id is the kind of page, the action which page, the first argument what the control does) and `update` the page; an example may hold `DATE_EXAMPLE` (`{date}`, `src/discord/command.ts`), shown as the date three days from today in `settings.timezone` (`dateExample`, `src/domain/time/clock-input.ts`; plan 8X-G: a fixed date goes stale once deployed, as the hint of `/train start:` and the time refusal's example did; the refusal of a time of a train or meetup says it the same way, `timedTimeHint`, and the deployed hints name no date, "month-day and time"); who is staff is asked anew with every press, and a staff page is answered as one that does not exist; `MEMBER_READ_THROTTLE`.
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index d30bae7560e6f6dd581b1cfda59c5dd0c8dab1fe..bc4a687e73ea0fe8169bd2a5e15b99b98c36e3cf 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -42,7 +42,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
-- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups newest first (`newestFirst`) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups in letter order (plan 8X-G, `inLetterOrder`; newest first before) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Since plan 8X-5 the view has `maxes` beside `raids`, `trains` and `meetups` (below, "Max battles on the map"), and every party's attendance says the member's Remote switch (`remote: { offered, on }`: `on` whether the member takes part remotely, false while not signed up, nobody else's; `offered` where the post has Remote, `remoteAllowed`, every party but an elite raid, never while read-only); Remote is pressed apart from `actions` (`MAP_REMOTE`), which the page draws as buttons. Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
 - **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`, and `remote` (plan 8X-5, `MAP_REMOTE`, no body: toggles the member's Remote as the post's button does, `AttendanceService.setRemote(…, 'toggle')`, answered in `remoteWords`; a newcomer is signed up as interested and remote, an elite raid refused in the post's words, 422; for every kind whose post has Remote); any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This has ended.", as `answerClick` says it: only what a raid alone has, `isRaidAction` (Set time, Screenshot feedback), is said to be a raid's, and no press of the map is one of those; Done is a max battle's too, plan 8X-3); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
 - **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
@@ -66,7 +66,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 ## Trains on the map (plan 8M-5)
 
 - **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The panel of the post keeps its own answer (it draws itself anew); the map calls the same service methods with the same `from`, `target` and `first`, and words Reverse and the mode with `reverseRouteAs` and `setAtEndAs`. The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opens it, none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the power spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (power spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train) and `may.kind` (whether the member may set it, `mayNotMove`, as the panel's menu: also for a train without a route, whose `panel` is null); power spots as a layer, Add to route from a spot (the add body takes a spot's key already) and the kind menu are the page's, left for the UX pass (follow-ups, "From Phase 8X-5"); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
+- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opened it before plan 8X-G (the post has Move… and Manage… since, `trains.md`; the map's panel waits for the UX pass), none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the power spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (power spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train) and `may.kind` (whether the member may set it, `mayNotMove`, as the panel's menu: also for a train without a route, whose `panel` is null); power spots as a layer, Add to route from a spot (the add body takes a spot's key already) and the kind menu are the page's, left for the UX pass (follow-ups, "From Phase 8X-5"); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
 - **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd?, kind? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`; the kind as its `kind`, plan 8X-5, a raid train without one). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
 - **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, stop }`: the stop by its key, `stopKey`, plan 8X-4: a gym's id or `w<Wayfarer id>`; anything else 400, a stop of no region of the server 404; the route editor adds the gyms clicked; before 8X-4 the body was `{ drawn, gym }` with `drawn` the gyms' ids as numbers, and a page opened before the update keeps its old bundle, whose edits are refused as malformed, 400, and which draws no train line or ring (it looks the stop keys up as gym numbers, so every train is listed as unplaced), until the member reloads it: nothing reloads the page by itself), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train.", with the train as the member sees it, who has passed its forum's access, so that the page draws the editor or the panel again without the controls); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`, `conductor-changed`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer of who may and of the code path but `gone` carries the train as the member sees it now (the 403 of who may too). The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
 - **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`), `finish` (`{ from }`), `reverse` (`{ from, first }`), `at-end` (`{ from, atEnd }`), and `kind` (`{ kind }`, plan 8X-5: the panel's kind menu, as the post's menu, nothing of where the train is; who may is `mayNotMove`, also without a route; `setKindAs`, "This train is a Gigantamax Train now.", `trainKindSentence`; not one of `PANEL_PRESSES`, the panel's buttons, but `KIND_PRESS`): the Manage train panel, each press carrying where the panel was drawn and where it leads, as the post's controls carry them; the same checks in the same order, who may being `mayNotMove` (the mode: `mayNotArrange`, as `setAtEnd` decides), and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as a press of the panel counts; then `moveTrainAs` (the command's words, where the train is now, "I am telling the others."), `reverseRouteAs` ("The route is reversed. " and where the train is), `setAtEndAs` (`atEndSentence`). The movement message in the post pings as for any move. Logged "a train was moved on the map" (a kind set: "a train's kind was set on the map", `{ user, guild, party, kind, outcome }`). **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
diff --git a/docs/superpowers/plans/2026-10-22-phase-8xg-staging.md b/docs/superpowers/plans/2026-10-22-phase-8xg-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..561988d975aa46dd79309c6d48c41786466a62b1
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-22-phase-8xg-staging.md
@@ -0,0 +1,52 @@
+# Phase 8X-G staging checklist: the 8X-F run's findings and the design talk (draft)
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord and the map in its own tab. Accounts: Googer (owner, staff), Tester (a member) and, where a step says so, a third account or a phone (web, Android, iPhone). The findings and the decisions are in the follow-ups, "From the staging run of 8X-F"; the brief is `.superpowers/sdd/8x-g-design-talk/design.md`. Part one re-checks each finding, part two the decisions of the design talk, part three the steps the 8X-F run did not reach. No new migration (the dev database stays at 029).
+
+## Before
+
+1. **Deploy the commands** (the hints of `/train start:`, `/train kind:` and `/end time:`, the choices of `/train kind:`, the description of `/admin setup-forums` change): `set SETTINGS_PATH=var/stage/settings.json&& npm run deploy-commands -- --global`.
+2. Check `var/stage/TEST-SERVER-STATE.md` (who uses the dev bot, what is left in #north-side) and note there that 8X-G is being staged. Between 06:00 and 21:00, with the max boss list loaded.
+3. **Pokebattler is asked live** in steps 4 to 7 (Matt's go-ahead for the run covers it: a handful of `/counters` queries, as a member would make them).
+
+## Part one: the findings
+
+4. **A slow first answer (F1).** `/counters` for a query Pokebattler has not worked out lately (a boss and options not asked today: the 8X-F run's SNORLAX_GIGANTAMAX or PIKACHU_GIGANTAMAX charger): it answers within 30 seconds, or says "Pokebattler is still working this out: try again in a minute." Right after a timeout another `/counters` (another boss) is asked at once, not refused as unavailable (the log has `could not ask Pokebattler` with `reason: timeout`, `timeoutMs: 30000`, no `pauseMs`). A use refused so is given back: the three a minute are still there.
+5. **Mew in a T5 raid (F3).** `/counters boss:Mew tier:T5`: the twelve counters against the average, within 30 seconds (Pokebattler's answer is 14.7 MB; the bot keeps some 320 KB of it). Then "Change options…" and a boss moveset of the 24 offered: its counters. `/counters boss:Mew tier:T5 moveset:<one not among the 24>` typed: its counters too. The same query again within the hour is answered from what is kept, at once (no request in the log); after the hour (Pokebattler's `max-age=3600`) it is asked again with the ETag and Pokebattler's 304 answers it without a download (at debug the log shows the request; the answer comes at once). Where Pokebattler's answer were too large after all: "Pokebattler’s answer for Mew is too large for me to read. See the full results on Pokebattler." with a link that opens Mew's page on www.pokebattler.com.
+6. **The User-Agent.** Not seen on Discord: the unit tests check `Professor-Pine (+https://github.com/Googer/Professor-Pine)`. Skip.
+7. **A Gigantamax picture (F2).** A Gigantamax Pikachu battle still shows plain Pikachu (Matt, 2026-10-22: the plain picture until PokeMiners lists the Gigantamax icon); a Gigantamax Machamp battle shows Gigantamax Machamp.
+8. **`/train start:` (M1).** `/train name:Planned start:<a date three days ahead> 7pm`: the answer names `/route add` and `/conductor set`, not `/meet`. Without `start:` it still names `/meet`.
+9. **Dates that never go stale (M2).** `/meet time:soonish` in a train's post: "Try `6:15pm`, `<the date three days from today> 6:15pm` …". The hint of `/train start:` and of `/end time:` names no date ("month-day and time"). `/help command:meet`, `/help command:end` and `/help command:train` show an example with the date three days from today. `/meetup … start:soonish`: the refusal's example date is three days from today, and so is the map's (a meetup made from the map with an unreadable start: the 422's words). The hint of `/meetup start:` names no date.
+10. **Max events loaded (M3).** At start the log has `max events loaded` with `max` and `big` counts, and the feed read's `raid events read` has them too.
+
+## Part two: the design talk
+
+11. **Move… on web, Android and iPhone.** On a train of four stops with Googer as its conductor: the third row reads **Group… · Move… · Manage… · Split… · Route** (Split… only with two groups of somebody, Route only on a route longer than three), words only, no emoji; a raid's post keeps 👥 on Group…. Move… opens a dialog titled "Move the train": "At stop 1 of 4: **…**" / "Next is **…**", and "Where to" with **Next: <stop>** picked, Previous left out at the first stop, `Skip <next>, go to <after>`. On Android the first choice (Next) is picked by itself; on iPhone Next is marked. Submit moves the train: the private answer is `/next`'s, the post's movement message pings as before. Closing the dialog moves nothing. At the last stop of a route that finishes: "Next: finish the route"; of a loop: "Next: round to <first>"; of a turn-back: "Next: turn back to <stop>". A finished route: no choice, "Submit takes it back to stop N, **…**."; Submit takes the Finish back.
+12. **Move…'s stale guard with two accounts.** Googer and Tester (no conductor, both signed up) each open Move… at the same stop; Googer submits Next, then Tester submits Next: the train moved once, and Tester reads "The train has moved on since you opened this: The train is at stop 2 …". Tester as a member who may not move it (with a conductor set): Move… is refused privately before it opens.
+13. **Manage… on web, Android and iPhone.** Manage… opens "Manage the train": where the train is, "The route" with **Keep it as it is** picked (Reverse it at either end of a route that finishes or anywhere on a loop; Finish it here unless finished; left out where only Keep is left), "At the end of the route" and "What the train is mainly for" as menus with the train's own picked (check Android does not pick another value by itself). Submit with Reverse, Loop and Dynamax Battles at once: one line in the post naming all three, one private answer ("This train is a Max Battle Train now. The route is reversed. At the end it loops back to the first stop. The train is at …"). Submit without changing anything: "Nothing changed." Googer opens Manage…, Tester changes the mode with another Manage…; Googer submits a new kind only: the mode Tester set stays. Finish it here: the route is finished and the movement message says so. A train without a route (`/train … start:`): Manage… shows the kind alone and no Move… is on the post. Staff (Googer, not the conductor) may open Manage…; a member who may not move the train is refused privately.
+14. **Old buttons.** A train post drawn before 8X-G (one of an older run, or one not edited since the deploy): its "Manage train…" opens Move… (Manage… on a train without a route). A Manage train panel still open in a client: its buttons and menus answer as no longer in use and change nothing.
+15. **The kind's words.** `/train kind:` offers Raids, Dynamax Battles, Gigantamax Battles under the hint "What the train is mainly for (its stops can be gyms or power spots)". The posts still say Raid Train / Max Battle Train / Gigantamax Train. `/help command:train`'s example names `kind:Gigantamax Battles`.
+16. **The `…` labels.** Set time… on a raid without times, Something is wrong… under a screenshot's reading, Appeal… under a meetup block, Ask the moderators… under an old refused place, Delete… on the moderators' notice of a pin battle, Open the form again… under a refused gym form: each still opens its dialog. The texts that name them say them with `…` (the raid without times pressed on Meet…: `"Set time…" gives them.`).
+17. **Groups in letter order, with a reused letter.** On a raid with groups A and B (two accounts in A and B), the third account opens C and moves to it, Googer leaves A (A goes), then a fourth sign-up opens a group: it is A again. The post lists A, B, C; the which-group dialog of a newcomer lists A, B, C with the default group marked (the newest opened, where Join, +1 and Remote put a newcomer): on an iPhone it starts there, on Android A is picked by itself (check whether that reads well where the raid has no lobby size); Group… lists them by letter; the `group` option's choices (`/join group:`) by letter; Split…'s radio of a train by letter, nothing marked: on Android the first group, often the presser's own, is picked by itself (review r0 A3: check it is never submitted by accident; a follow-up if it is); the map's group question by letter.
+18. **The summary post renamed.** In #north-side's forum the pinned post is renamed "Going on now" with its next edit (a post made as "Active raids"), its heading `### Going on now`; with nothing going on: "Nothing going on right now. Report a raid with `/raid` or a max battle with `/max`." Without any other change, the rename goes through within ten minutes of the update (Discord's rename limit: the retry timer, not a later report, does it). With the record of the post lost (`summaryMessageId` set to NULL by SQL in `Region`, Matt's call), `/admin setup-forums` takes the old post over instead of making a second one.
+19. **Passing through.** A train of #north-side with a stop in another region (#downtown or the region a gym of the route lies in): that region's summary lists it under **Passing through**, linked to its copy in that region's channel (the link opens the copy); its own region lists it under Trains. The copy in that region's channel has no Move…, Manage… or Split… (Group… and Route only). A move of the train shows in both; a third region it does not stop in keeps its summary unedited (no edit in the log). Once a train that finishes has passed every stop of the region, it goes from that summary (a loop or turn-back train stays). Taking the stop off the route takes it off the other summary. Its end takes it off too.
+20. **Today at the stops.** A research report in #north-side: the summary's last line `Today at the stops: 1 task`, linked to the pinned post in #north-side; a hideout report makes it `… · 1 hideout`, and the same leader at a second stop keeps it at `1 hideout` (as the post counts its blocks). Restart the bot: the line comes back with the post's first draw after the start (or is missing until then: note which). Taking both back: the line goes ("Nothing reported right now." in the post, no line in the summary). After midnight the line goes with the post. Not in rehearsal mode.
+
+## Part three: the steps the 8X-F run did not reach
+
+From the follow-ups, "From the staging run of 8X-F", "Not run, for a later staging", in their own checklists:
+
+21. **8X-2** (`2026-10-21-phase-8x2-staging.md`): 5's warnings on a changed list and the 304 (with `refreshMinutes: 5`).
+22. **8X-1B** (`2026-10-21-phase-8x1b-staging.md`): 18 (an elite raid and a raid's copy); Group…'s read-only mode on the map.
+23. **8X-3** (`2026-10-21-phase-8x3-staging.md`): 17a/b (the summary post: with steps 18 to 20 above).
+24. **8X-4** (`2026-10-21-phase-8x4-staging.md`): 7's raid split-up note (more sign-ups than `lobbies.raid`), 10's "a spot named exactly beats gyms that contain it" (a place where one exists), 13's gym deletion, 15, 16 beyond the lines (ring at a spot, route mode, popups: with the map's UX pass), 23's turn-back case (with Move…: "Next: turn back to …"). Read "Manage train…" there as Move… and Manage… (plan 8X-G).
+25. **8X-5** (`2026-10-22-phase-8x5-staging.md`): 11 (a short max event on), 12 (the throttle).
+26. **8X-6** (`2026-10-21-phase-8x6-staging.md`): 3's other roles, 4's weather and friendship, 6's other refusals, 9b's dialog (with step 5 above), 9d (a Pokébox: `/settings pokebattler-id` first), 9e's raid case, 10's shadow, mega and T3 addresses.
+27. **8X-F** (`2026-10-22-phase-8xf-staging.md`): 9's raid moved to a gym ending in a period, and the research and Rocket take-back at such a stop without an address (where such a place exists).
+
+**Dated, not part of this run:** 2026-10-24 (Lake Trio Max Battle Day: whether Dynamax battles were up before 14:00, Q-B; whether the trio linger in Pokebattler's feed after 17:00, 8X-2 step 11, 8X-3 step 20); 2026-11-14/15 (Wild Area: Gigantamax first, their default ends, 8X-3 step 21; the big event kept across a restart, 8X-F step 8).
+
+**The older checklists' words.** The checklists before 8X-G name "Manage train…", its panel, "Split group…", "Whole route", "Set time" and "Active raids": read them as Move… and Manage… (the panel's moves in Move…, Reverse, the mode and the kind in Manage…), Split…, Route, Set time… and "Going on now".
+
+## After
+
+28. Record the results in the follow-ups ("From the staging run of 8X-G"), and the state left in `var/stage/TEST-SERVER-STATE.md`.
diff --git a/docs/superpowers/plans/phase-0-follow-ups.md b/docs/superpowers/plans/phase-0-follow-ups.md
index 383d2e09cf3e17158571f686af60f7a539dc4db4..4092ae6729fabf354cf6bfc7e5799109079c2814 100644
--- a/docs/superpowers/plans/phase-0-follow-ups.md
+++ b/docs/superpowers/plans/phase-0-follow-ups.md
@@ -1546,6 +1546,24 @@ Design `docs/superpowers/specs/2026-10-20-max-battles-design.md`, approved by Ma
   - Pokebattler as a fallback source of raid bosses when ScrapedDuck is stale (on 2026-10-20 it listed more T1 bosses and Mega Charizard X/Y beside ScrapedDuck's Mega Dragonite: it seems to keep bosses without an end date).
   - Spot targets ("max battles at this spot"), catch CP and moves for max bosses, a group menu and more than five groups (Matt: dropped "once we're full on groups").
 
+## From the 8X-G prototype (the 8X-F run's findings and the design talk, 2026-10-22)
+
+The prototype of plan 8X-G (brief `.superpowers/sdd/8x-g-design-talk/design.md`, its review R1–R18, Matt's answers and the Pokebattler probes P1–P3), in eight commits on `proto-8xg`. Its staging checklist is `2026-10-22-phase-8xg-staging.md` (deploy the commands first).
+
+- **For staging:**
+  - The checklists before 8X-G name "Manage train…", its panel, "Split group…", "Whole route", "Set time" and "Active raids": read them as Move… and Manage… (the panel's moves in Move…; Reverse, Finish, the mode and the kind in Manage…), Split…, Route, Set time… and "Going on now".
+  - Android's preselection with letter order: the which-group dialog lists the groups by letter and marks the default group (where Join, +1 and Remote put a newcomer; review r0 A2), so an iPhone starts there while Android picks group A by itself; Split…'s radio is in letter order with nothing marked (before, the largest group first and the presser's own last), so on Android the first group, often the presser's own, is picked by itself (review r0 A3). Check both on Android (Matt, 2026-10-22: letter order in the dialogs too; staging double-checks); a follow-up if a split is submitted by accident.
+- **Left as they are (for Matt):**
+  - F2: a Gigantamax boss PokeMiners has no icon for (Pikachu) shows its plain picture; no file name in no list is guessed (Matt, 2026-10-22). When PokeMiners lists one, `maxBossPicture` takes it with the next game-data download.
+  - `/counters`' dialog offers the average and 24 of a boss's movesets; Mew has 100 (probe P1). `/counters moveset:` typed names any. A dialog cannot hold more without a second menu; not worth it until members ask.
+  - Pokebattler takes no moveset and no smaller aggregation (P2, P3), so a raid answer is read whole (up to 32 MB) and reduced at once; the transient parse of a Mew-sized answer is some 73 MB of heap for some 270 ms (scratch run). Three requests at once could add up to some 250 MB in the worst case (three Mew-sized answers of other options at once); not seen, and the cache makes it rare.
+  - The summary is drawn anew after every draw of the stops' post (review R11's choice: counts in the line); an edit goes out only where the line changed (the JSON of the summary is compared). The cost is one summary render per stops-post draw, in the region of the report.
+  - Passing through counts a train while it will still reach a stop of the region (review r0 C4, Matt 2026-10-22: a train that finishes the stops from its current one on, a loop or turn-back every stop, a finished route none).
+  - Pokebattler's answers are revalidated with their ETag after `max-age` (an hour); a 304 renews them without a download (review r0 A1).
+  - Passing through links a train's copy in the region's channel by a message link, which needs the server's snowflake (`GuildRepository.snowflakeOf`, read once per server by the summary's render); `/status` in a region channel before the first summary render of that server since the start links the post instead.
+  - The map's Manage train panel and its kind words are unchanged (the map's UX pass).
+- **Decisions of the prototype** (the report lists them all; those Matt may want to see): "Passing through" counts in the summary's head (`1 train passing through`); the stops' line is the summary's last text, after a line; Manage…'s answer says what changed in the commands' and the map's words, and `Nothing changed.` where nothing was picked otherwise; a failure of Pokebattler gives the use back also for an answer too large or unreadable (R3 named the others); the train's third row is words only on a train, Group… included, while a raid's Group… keeps 👥.
+
 ## From the staging run of 8X-F (2026-10-22, afternoon and evening)
 
 Staged with the checklist `2026-10-22-phase-8xf-staging.md` from typescript-migration at 7087fed8 (logs `var/stage/logs/bot-8xf-1.log`, and `bot-8xf-2.log` after a Docker restart), Googer driven by Claude, Tester and the phones (web, iPhone, Android) by Matt. Migration 029 ran at the first start. **Part one passes in full**: every finding of the 8X run is fixed. Part two: most 8X steps not run before now pass; what is left is listed below. The run's notes, step by step, are in the git-ignored `.superpowers/sdd/8x-f-staging-fixes/staging-run.md`.
````

## After the last task

- [ ] `npm run check > var/8xg-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `npm run test:db` (0), one at a time.
- [ ] `git diff eb4907fe04bcf902cec8efdb35bb19f7f75941c3 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory.
