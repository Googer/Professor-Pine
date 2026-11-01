# Phase 8M-4: Raids from the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member reports a raid from a gym's popup on Pine's live map and, when signed up or staff, sets its hatch time, end time, boss and moves there, with exactly what `/raid`, `/hatch`, `/end`, `/boss` and `/moveset` do: their readers, refusals, words, throttles, privacy and notifications.

**Architecture:** The commands' logic is factored into shared functions (`reportRaidAs`, `changeRaidTime`, `changeRaidBoss`, `changeRaidMoves`) that the commands and the web routes both call; the routes (`/api/raid-options`, `POST /api/raids`, `POST /api/raids/<id>/<change>`) are guarded as 8M-3's presses (per-address limit and `postGuard` before the body, the member checks, access, then the command's own throttle); the page adds forms to the popups and holds a popup's content while a form is open.

**Tech Stack:** TypeScript 6.0, Fastify, Leaflet (all from 8M-1). No new package, no migration, no command change (the commands' behaviour is unchanged).

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` 3.5 and 3.6, approved by Matt 2026-10-15. Spawns from the map (spec 3.8) are a plan of their own, **8M-4S**, after plan 8D (the other session's party posts with a "Where" section) brings pins read from maps links. Ledger: `.superpowers/sdd/2026-10-17-phase-8m4-raids-from-the-map/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m4` (worktree `var/proto-8m4`, rebased onto `wayfarer` 1b133daf), one commit per task, each typechecked (root and page) with its area's tests green; on the tip the full check (7,003 tests), the build, the userscript build and the database suite were green. An Opus review went through the whole prototype; its findings are folded into the commits below.

## Decisions in this plan

Rulings made while Matt was away (2026-10-17; ledger), for Matt to look at:

1. **One code path per command:** the map and the commands call the same functions; the commands' tests are unchanged. The map counts in the command's own throttle bucket (`raid`, `hatch`, `end`, `boss`, `moveset`).
2. **Changing a raid on the map needs a sign-up or staff** (spec 3.6); on Discord anyone in the post may (the map crosses forums).
3. **"Report raid" is offered on every gym**, also beside the raids a gym shows (a standard and an elite raid can stand at one gym).
4. **Access:** a member barred from the forum a new raid would go to, or from the forum of a raid already standing at the gym, is refused (403) before the throttle; `/raid` has the same gap in the second case (a gym in two regions) — left open for the commands.
5. **When the picked region has no forum** and another region of the server takes the raid, the answer says "It was posted in #<name>." (`/raid` asks first).
6. `/raid`'s readers run after its throttle, as in the command, so a bad boss or time uses one of the member's reports; refusals of who is asking, the gym and access do not.
7. **Status codes:** 200 created or changed; 409 a raid already there (with that raid) or the raid gone; 422 the command's refusals; 403 for who is asking.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/web.md`, `parties-and-posts.md`, `discord-framework.md` and `testing.md` ("How the suites run") before starting.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure. **Tests never use the network.** A test that uses `vi.mock` is a `*.isolated.test.ts`; a test undoes its own fake timers, stubs and environment changes.
- Nothing names a member on the map; nothing from data reaches the page as HTML; nothing reads an ended party by id from the database.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m4`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`, which covers the page) and its own tests green. The full `npm run check`, `npm run build` and `npm run test:db` after the last task (they wait on the machine-wide suite lock).
- Never `npm install`/`npm ci`.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **The commands behave exactly as before** (`/raid`, `/hatch`, `/end`, `/boss`, `/moveset`: words, refusals, throttles).
2. **The map is the command:** same throttle bucket, readers, privacy (the post names the reporter per their setting), `raidReported` notifications.
3. **Refusals cost nothing:** who is asking, the gym and access refused before the throttle; a refused POST never has its body read before `postGuard`.
4. **Access:** never into a forum the member is barred from, also through an existing raid at the gym.
5. **The forms stay open** while a member fills them (the popup is held), and the map refreshes after a success.

---

### Task 1: Raids: one code path for reporting and changing, shared with the map

Prototype commit: `bc2198e56626f5322c9613343041559f453e9c72`

`src/commands/raids/report.ts` (`reportRaidAs`, `reportWords` with `ReportNames`, `RAID_THROTTLE`) and `raid-changes.ts` (`changeRaidTime`, `changeRaidBoss`, `changeRaidMoves`, `raidChangeAnswer`, `bossMoves`, `timesText`): `/raid`, `/hatch`, `/end`, `/boss` and `/moveset` call them and behave as before; the readers take `RaidReading`, a `Pick` of the context.

**Files:**

```
 src/commands/raids/boss.ts              |  80 +++++---------------------
 src/commands/raids/change.ts            |  66 ++++++++-------------
 src/commands/raids/raid-changes.test.ts | 140 +++++++++++++++++++++++++++++++++++++++++++++
 src/commands/raids/raid-changes.ts      | 225 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/raids/raid-input.ts        |  22 +++++--
 src/commands/raids/raid.ts              |  62 ++++----------------
 src/commands/raids/report.test.ts       |  94 ++++++++++++++++++++++++++++++
 src/commands/raids/report.ts            | 132 ++++++++++++++++++++++++++++++++++++++++++
 8 files changed, 656 insertions(+), 165 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/raids/raid-changes.test.ts src/commands/raids/report.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/raid-changes.test.ts src/commands/raids/raid-changes.ts src/commands/raids/raid-input.ts src/commands/raids/raid.ts src/commands/raids/report.test.ts src/commands/raids/report.ts` and `npx eslint src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/raid-changes.test.ts src/commands/raids/raid-changes.ts src/commands/raids/raid-input.ts src/commands/raids/raid.ts src/commands/raids/report.test.ts src/commands/raids/report.ts`.
- [ ] **Step 4: Check the transcription:** `git diff bc2198e56626f5322c9613343041559f453e9c72 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Raids: one code path for reporting and changing, shared with the map`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/raids/boss.ts src/commands/raids/change.ts src/commands/raids/raid-changes.test.ts src/commands/raids/raid-changes.ts src/commands/raids/raid-input.ts src/commands/raids/raid.ts src/commands/raids/report.test.ts src/commands/raids/report.ts`.

````diff
diff --git a/src/commands/raids/boss.ts b/src/commands/raids/boss.ts
index ff44b5c794eafb14b955f2300ef6f55dcc130e7a..af90314e17c60a86d8c7c565ba915c6a5ee604bc 100644
--- a/src/commands/raids/boss.ts
+++ b/src/commands/raids/boss.ts
@@ -16,13 +16,13 @@ import {
 } from '../../discord/guards.js';
 import { isRaid, isTrain, type RaidBossRef, type TrainParty } from '../../domain/party/party.js';
 import type { PokemonEntry } from '../../domain/pogo/game-master.js';
-import { matchNamed } from '../../domain/search/word-match.js';
 import { problemText } from '../../render/activity.js';
-import { plain, truncate } from '../../render/text.js';
+import { truncate } from '../../render/text.js';
 import { MAX_CHOICES } from '../choices.js';
 import { commandParty, commandRaid, partyOver } from '../parties/reply.js';
-import { answerRaidChange, CHANGE_THROTTLE, changingMember, IN_A_RAID_POST } from './change.js';
-import { bossChoices, reportedBoss, trainBoss, trainBossChoices } from './raid-input.js';
+import { CHANGE_THROTTLE, changingMember, IN_A_RAID_POST, replyRaidChange } from './change.js';
+import { changeRaidBoss, changeRaidMoves, movesOf } from './raid-changes.js';
+import { bossChoices, trainBoss, trainBossChoices } from './raid-input.js';
 
 /** What a member is told who gives a train the tier of an egg. */
 const NO_TIER =
@@ -101,18 +101,9 @@ export const boss: SimpleCommand = {
       return;
     }
     if (!isRaid(here)) throw new UserError(notARaidOrTrain(here));
-    const party = here;
-    const reported = reportedBoss(ctx, text);
-    const outcome = await ctx.raids.setBoss(party.id, changingMember(interaction), reported);
-    await answerRaidChange(
+    await replyRaidChange(
       interaction,
-      ctx,
-      outcome,
-      () =>
-        reported.boss === null
-          ? `This is now: ${reported.label}.`
-          : `The boss is now ${reported.label}.`,
-      `This raid already is: ${reported.label}.`,
+      await changeRaidBoss(ctx, here, changingMember(interaction), text),
     );
   },
   async autocomplete(interaction, ctx) {
@@ -125,15 +116,6 @@ export const boss: SimpleCommand = {
   },
 };
 
-type MoveKind = 'quick' | 'charge';
-
-const KIND_WORDS: Readonly<Record<MoveKind, string>> = { quick: 'fast', charge: 'charged' };
-
-/** The ids of the moves of one kind that a Pokémon can have as a raid boss. */
-function movesOf(entry: PokemonEntry, kind: MoveKind): readonly string[] {
-  return kind === 'quick' ? entry.fastMoves : entry.chargedMoves;
-}
-
 /** The boss of the raid an interaction is in, when the game master knows its moves. */
 function bossEntry(
   interaction: AutocompleteInteraction,
@@ -143,26 +125,6 @@ function bossEntry(
   return party ? ctx.partyService.view(party).boss?.entry : undefined;
 }
 
-/**
- * The move a text names among those the boss has: a choice of the list (a move id), or typed
- * text that fits exactly one of them. Throws a `UserError` that lists the moves otherwise.
- */
-function typedMove(ctx: AppContext, entry: PokemonEntry, kind: MoveKind, text: string): string {
-  const { catalogue } = ctx.gameData;
-  const ids = movesOf(entry, kind);
-  const picked = text.trim();
-  if (ids.includes(picked)) return picked;
-  const named = ids.map((id) => ({ value: id, names: [catalogue.move(id)?.name ?? id] }));
-  const fits = matchNamed(named, picked);
-  const [only] = fits;
-  if (only !== undefined && fits.length === 1) return only;
-  const names = named.map((move) => plain(move.names[0] ?? move.value)).join(', ');
-  throw new UserError(
-    `"${plain(truncate(picked, 80))}" is not one ${KIND_WORDS[kind]} move of ${plain(entry.name)}. ` +
-      `Its ${KIND_WORDS[kind]} moves are: ${names}.`,
-  );
-}
-
 export const moveset: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('moveset')
@@ -192,29 +154,15 @@ export const moveset: SimpleCommand = {
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
     const party = commandRaid(interaction, ctx);
-    const quick = interaction.options.getString('quick');
-    const charge = interaction.options.getString('charge');
-    if (quick === null && charge === null) {
-      throw new UserError('Give the fast move, the charged move, or both.');
-    }
-    const shown = ctx.partyService.view(party).boss;
-    if (!shown) throw new UserError(problemText('no-boss', ctx.attendance.limits(), 'raid'));
-    const { entry } = shown;
-    if (!entry) throw new UserError(`I do not know the moves of ${plain(shown.name)} yet.`);
-    const moves = {
-      ...(quick === null ? {} : { fastMove: typedMove(ctx, entry, 'quick', quick) }),
-      ...(charge === null ? {} : { chargedMove: typedMove(ctx, entry, 'charge', charge) }),
-    };
-    const outcome = await ctx.raids.setMoveset(party.id, changingMember(interaction), moves);
-    const name = (id: string | null): string =>
-      plain((id && ctx.gameData.catalogue.move(id)?.name) ?? '????');
-    await answerRaidChange(
+    await replyRaidChange(
       interaction,
-      ctx,
-      outcome,
-      (changed) =>
-        `The moves are now ${name(changed.raid.fastMove)} / ${name(changed.raid.chargedMove)}.`,
-      'The raid already had those moves.',
+      await changeRaidMoves(
+        ctx,
+        party,
+        changingMember(interaction),
+        interaction.options.getString('quick'),
+        interaction.options.getString('charge'),
+      ),
     );
   },
   async autocomplete(interaction, ctx) {
diff --git a/src/commands/raids/change.ts b/src/commands/raids/change.ts
index 62b16ed0bd88197b3b9f55e0a5b2f94fbb47a8b0..1e2bcbe22906a26b33d54957347ccd15687e154a 100644
--- a/src/commands/raids/change.ts
+++ b/src/commands/raids/change.ts
@@ -12,13 +12,18 @@ import { requireParty, requireRaid } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { isTimed, type RaidParty } from '../../domain/party/party.js';
-import { problemText } from '../../render/activity.js';
-import { isFarOff, timestamp } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
-import { commandParty, commandRaid, partyOver } from '../parties/reply.js';
+import { commandParty, commandRaid } from '../parties/reply.js';
 import { changeEnd } from '../parties/timed.js';
-import { typedPartyTime } from './raid-input.js';
+import {
+  changeRaidTime,
+  raidChangeAnswer,
+  timesText,
+  type RaidChangeAnswer,
+} from './raid-changes.js';
+
+export { timesText } from './raid-changes.js';
 
 /** How often one member may change a raid: each change edits the post and says a line in it. */
 export const CHANGE_THROTTLE: Throttle = { uses: 10, perSeconds: 60 };
@@ -33,18 +38,15 @@ export function changingMember(interaction: Changing): Member {
 }
 
 /**
- * `It hatches at <t> and ends at <t>.`: the times of a raid as an answer names them (`hatched`,
- * `ended` for what is past), with the day when they are not within half a day of now (an
- * elite raid, or a clock time that was read as another day than the member meant).
+ * Tells the member, privately, what came of a change (`raidChangeAnswer`, `changeRaidTime` and
+ * the like): a refusal and a raid that has ended are thrown as `UserError`s.
  */
-export function timesText(party: RaidParty, now: number = Date.now()): string {
-  const { hatchTime, endTime } = party;
-  if (hatchTime === null || endTime === null) return 'It has no times yet.';
-  const style = isFarOff(hatchTime, now) ? 'f' : 't';
-  return (
-    `It ${hatchTime > now ? 'hatches' : 'hatched'} at ${timestamp(hatchTime, style)} and ` +
-    `${endTime > now ? 'ends' : 'ended'} at ${timestamp(endTime, style)}.`
-  );
+export async function replyRaidChange(
+  interaction: Changing,
+  answer: RaidChangeAnswer,
+): Promise<void> {
+  if (answer.kind !== 'ok') throw new UserError(answer.text);
+  await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
 }
 
 /**
@@ -59,18 +61,10 @@ export async function answerRaidChange(
   said: (party: RaidParty) => string,
   same: string,
 ): Promise<void> {
-  if (outcome.kind === 'gone') throw new UserError(partyOver({ type: 'raid' }));
-  if (outcome.kind === 'refused') {
-    const post = outcome.other?.forumPostId;
-    throw new UserError(
-      problemText(outcome.reason, ctx.attendance.limits(), 'raid') +
-        (post ? ` Its post is <#${post}>.` : ''),
-    );
-  }
-  await interaction.reply({
-    content: outcome.changed ? said(outcome.party) : same,
-    flags: MessageFlags.Ephemeral,
-  });
+  await replyRaidChange(
+    interaction,
+    raidChangeAnswer(ctx.attendance.limits(), outcome, said, same),
+  );
 }
 
 /** What the "Set time" button and its form answer for a raid that has its times by now. */
@@ -80,7 +74,7 @@ export function timesAlready(party: RaidParty): string {
 
 /**
  * Sets the hatch or the end time of a raid from what a member typed, and answers. For `/hatch`,
- * `/end` and the "Set time" form of a post.
+ * `/end` and the "Set time" form of a post (`changeRaidTime`, which the map calls too).
  */
 export async function changeTime(
   interaction: Changing,
@@ -89,21 +83,9 @@ export async function changeTime(
   parameter: 'hatch' | 'end',
   text: string,
 ): Promise<void> {
-  const typed = typedPartyTime(ctx, party, parameter, text, Date.now());
-  if (typed === 'unset') {
-    throw new UserError('A raid keeps its times once it has them. Give the right time instead.');
-  }
-  const member = changingMember(interaction);
-  const outcome =
-    parameter === 'hatch'
-      ? await ctx.raids.setHatchTime(party.id, member, typed.at)
-      : await ctx.raids.setEndTime(party.id, member, typed.at);
-  await answerRaidChange(
+  await replyRaidChange(
     interaction,
-    ctx,
-    outcome,
-    (changed) => `Done. ${timesText(changed)}`,
-    `Nothing changed. ${timesText(party)}`,
+    await changeRaidTime(ctx, party, changingMember(interaction), parameter, text),
   );
 }
 
diff --git a/src/commands/raids/raid-changes.test.ts b/src/commands/raids/raid-changes.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a8e933bdc8ba8af8c43f4b1c70b6f5f359935906
--- /dev/null
+++ b/src/commands/raids/raid-changes.test.ts
@@ -0,0 +1,140 @@
+import { describe, expect, it } from 'vitest';
+import { ALICE, at, PARTY_NOW } from '../../../test/support/parties.js';
+import { reportedRaid } from '../../../test/support/party-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { UserError } from '../../discord/errors.js';
+import type { RaidReport } from '../../services/party-service.js';
+import {
+  bossMoves,
+  changeRaidBoss,
+  changeRaidMoves,
+  changeRaidTime,
+  raidChangeAnswer,
+} from './raid-changes.js';
+
+const HATCH = at('2026-10-13T14:30');
+const END = at('2026-10-13T15:15');
+const stamp = (time: number) => `<t:${time / 1000}:t>`;
+const ALICE_MEMBER = { id: ALICE, name: 'Alice' };
+
+/**
+ * The changes of a raid as `/hatch`, `/end`, `/boss` and `/moveset` and the live map share them:
+ * one function each over a context, which answers the command's words and throws what the
+ * command's readers refuse.
+ */
+async function setup(report: Partial<RaidReport> = {}) {
+  const made = await reportedRaid(report);
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    raids: made.raids,
+    parties: made.store,
+    regions: made.regions,
+  });
+  return { ...made, ctx };
+}
+
+describe('the shared changes of a raid', () => {
+  it("sets a typed time as /hatch does, answering the command's words with the raid as it is now", async () => {
+    const made = await setup();
+    const answer = await changeRaidTime(
+      made.ctx,
+      made.current(),
+      ALICE_MEMBER,
+      'hatch',
+      '30',
+      PARTY_NOW,
+    );
+    expect(answer).toMatchObject({
+      kind: 'ok',
+      text: `Done. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
+    });
+    expect(answer.kind === 'ok' && answer.party.hatchTime).toBe(HATCH);
+    const same = await changeRaidTime(
+      made.ctx,
+      made.current(),
+      ALICE_MEMBER,
+      'end',
+      '3:15pm',
+      PARTY_NOW,
+    );
+    expect(same).toMatchObject({
+      kind: 'ok',
+      text: `Nothing changed. It hatches at ${stamp(HATCH)} and ends at ${stamp(END)}.`,
+    });
+  });
+
+  it("throws what the command's reader refuses, and changes nothing", async () => {
+    const made = await setup();
+    const typed = (text: string) =>
+      changeRaidTime(made.ctx, made.current(), ALICE_MEMBER, 'hatch', text, PARTY_NOW);
+    await expect(typed('5pm')).rejects.toThrow(UserError);
+    await expect(typed('cancel')).rejects.toThrow(
+      'A raid keeps its times once it has them. Give the right time instead.',
+    );
+    expect(made.current().hatchTime).toBeNull();
+  });
+
+  it('sets the boss and the moves as /boss and /moveset do', async () => {
+    const made = await setup();
+    expect(
+      await changeRaidBoss(made.ctx, made.current(), ALICE_MEMBER, 'b:yveltal:T5:0'),
+    ).toMatchObject({ kind: 'ok', text: 'The boss is now Yveltal (T5).' });
+    expect(await changeRaidBoss(made.ctx, made.current(), ALICE_MEMBER, 't3')).toMatchObject({
+      kind: 'ok',
+      text: 'This is now: T3 egg.',
+    });
+    await changeRaidBoss(made.ctx, made.current(), ALICE_MEMBER, 'yveltal');
+    expect(
+      await changeRaidMoves(made.ctx, made.current(), ALICE_MEMBER, 'snarl', 'DARK_PULSE'),
+    ).toMatchObject({ kind: 'ok', text: 'The moves are now Snarl / Dark Pulse.' });
+    await expect(
+      changeRaidMoves(made.ctx, made.current(), ALICE_MEMBER, null, null),
+    ).rejects.toThrow('Give the fast move, the charged move, or both.');
+    await expect(
+      changeRaidMoves(made.ctx, made.current(), ALICE_MEMBER, 'waterfall', null),
+    ).rejects.toThrow(/is not one fast move of Yveltal/);
+  });
+
+  it('answers a raid that ended meanwhile as over', async () => {
+    const made = await setup();
+    const party = made.current();
+    await made.service.end(party.id);
+    expect(await changeRaidBoss(made.ctx, party, ALICE_MEMBER, 't3')).toEqual({
+      kind: 'gone',
+      text: 'This raid is over.',
+    });
+  });
+
+  it('names the post of the raid that holds a gym only where the surface can link it', () => {
+    const limits = { maxNumber: 20 };
+    const other = { forumPostId: '900000000000000001' } as never;
+    const refused = { kind: 'refused', reason: 'gym-taken', other } as const;
+    const discord = raidChangeAnswer(limits, refused, () => '', '');
+    expect(discord).toMatchObject({ kind: 'refused' });
+    expect(discord.text).toMatch(/ Its post is <#900000000000000001>\.$/);
+    const page = raidChangeAnswer(
+      limits,
+      refused,
+      () => '',
+      '',
+      () => undefined,
+    );
+    expect(page.text).not.toMatch(/Its post/);
+  });
+
+  it("gives the moves the raid's boss can have, by id and name; none for an egg", async () => {
+    const made = await setup({ boss: { key: 'yveltal' } });
+    expect(bossMoves(made.ctx, made.current())).toEqual({
+      boss: 'Yveltal',
+      fast: [
+        { id: 'SUCKER_PUNCH_FAST', name: 'Sucker Punch' },
+        { id: 'SNARL_FAST', name: 'Snarl' },
+        { id: 'GUST_FAST', name: 'Gust' },
+      ],
+      charged: expect.arrayContaining([{ id: 'DARK_PULSE', name: 'Dark Pulse' }]) as unknown,
+    });
+    const egg = await setup();
+    expect(bossMoves(egg.ctx, egg.current())).toBeUndefined();
+  });
+});
diff --git a/src/commands/raids/raid-changes.ts b/src/commands/raids/raid-changes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..be85f3b442bc2e530d781a7895e70d7e258956e8
--- /dev/null
+++ b/src/commands/raids/raid-changes.ts
@@ -0,0 +1,225 @@
+import type { AppContext } from '../../app-context.js';
+import { UserError } from '../../discord/errors.js';
+import type { RaidParty } from '../../domain/party/party.js';
+import type { PokemonEntry } from '../../domain/pogo/game-master.js';
+import { matchNamed } from '../../domain/search/word-match.js';
+import { problemText } from '../../render/activity.js';
+import { isFarOff, plain, timestamp, truncate } from '../../render/text.js';
+import type { Member } from '../../services/attendance-service.js';
+import type { RaidChangeOutcome } from '../../services/raid-change-service.js';
+import { partyOver } from '../parties/reply.js';
+import { reportedBoss, typedPartyTime, type RaidReading } from './raid-input.js';
+
+/**
+ * The changes of a raid that `/hatch`, `/end`, `/boss` and `/moveset` make, as one function each
+ * that the commands and the live map (plan 8M-4) call alike: what the member typed is read with
+ * the command's reader (a `UserError` for what it refuses), the change goes through
+ * `RaidChangeService` as the member, and the answer is the command's words. Mentions and
+ * timestamps are Discord's; the map makes them text.
+ */
+
+/** What changing a raid needs: the readers, the service, the limits and how a raid is shown. */
+export type RaidChanging = RaidReading & Pick<AppContext, 'raids' | 'attendance' | 'partyService'>;
+
+/**
+ * What came of a change, in the command's words: `ok` with the raid as it is stored now;
+ * `refused` (the service's refusal) and `gone` (the raid ended), which a command throws.
+ */
+export type RaidChangeAnswer =
+  { kind: 'ok'; text: string; party: RaidParty } | { kind: 'refused' | 'gone'; text: string };
+
+/** How a post is named in an answer: a mention on Discord; nothing where it cannot be linked. */
+export type PostNamer = (postId: string) => string | undefined;
+
+const mention: PostNamer = (postId) => `<#${postId}>`;
+
+/**
+ * `It hatches at <t> and ends at <t>.`: the times of a raid as an answer names them (`hatched`,
+ * `ended` for what is past), with the day when they are not within half a day of now (an
+ * elite raid, or a clock time that was read as another day than the member meant).
+ */
+export function timesText(party: RaidParty, now: number = Date.now()): string {
+  const { hatchTime, endTime } = party;
+  if (hatchTime === null || endTime === null) return 'It has no times yet.';
+  const style = isFarOff(hatchTime, now) ? 'f' : 't';
+  return (
+    `It ${hatchTime > now ? 'hatches' : 'hatched'} at ${timestamp(hatchTime, style)} and ` +
+    `${endTime > now ? 'ends' : 'ended'} at ${timestamp(endTime, style)}.`
+  );
+}
+
+/**
+ * The answer to a change of a raid: `said` when it changed, `same` when the raid already was so;
+ * a refusal in the posts' words, for `gym-taken` with the post of the raid that holds the gym
+ * where `post` names it; a raid that has ended as over.
+ */
+export function raidChangeAnswer(
+  limits: { maxNumber: number },
+  outcome: RaidChangeOutcome,
+  said: (party: RaidParty) => string,
+  same: string,
+  post: PostNamer = mention,
+): RaidChangeAnswer {
+  if (outcome.kind === 'gone') return { kind: 'gone', text: partyOver({ type: 'raid' }) };
+  if (outcome.kind === 'refused') {
+    const postId = outcome.other?.forumPostId;
+    const named = postId ? post(postId) : undefined;
+    return {
+      kind: 'refused',
+      text:
+        problemText(outcome.reason, limits, 'raid') +
+        (named === undefined ? '' : ` Its post is ${named}.`),
+    };
+  }
+  return {
+    kind: 'ok',
+    text: outcome.changed ? said(outcome.party) : same,
+    party: outcome.party,
+  };
+}
+
+/**
+ * Sets the hatch or the end time of a raid from what a member typed (`/hatch`, `/end`, the "Set
+ * time" form, the map). Throws a `UserError` for a text that is no time for this raid, or that
+ * asks to remove a time.
+ */
+export async function changeRaidTime(
+  ctx: RaidChanging,
+  party: RaidParty,
+  member: Member,
+  parameter: 'hatch' | 'end',
+  text: string,
+  now: number = Date.now(),
+  post?: PostNamer,
+): Promise<RaidChangeAnswer> {
+  const typed = typedPartyTime(ctx, party, parameter, text, now);
+  if (typed === 'unset') {
+    throw new UserError('A raid keeps its times once it has them. Give the right time instead.');
+  }
+  const outcome =
+    parameter === 'hatch'
+      ? await ctx.raids.setHatchTime(party.id, member, typed.at)
+      : await ctx.raids.setEndTime(party.id, member, typed.at);
+  return raidChangeAnswer(
+    ctx.attendance.limits(),
+    outcome,
+    (changed) => `Done. ${timesText(changed, now)}`,
+    `Nothing changed. ${timesText(party, now)}`,
+    post,
+  );
+}
+
+/**
+ * Sets the boss of a raid, or the tier of its egg, from what a member typed or picked (`/boss`,
+ * the map), read as `/raid` reads it. Throws a `UserError` for what names no boss or tier.
+ */
+export async function changeRaidBoss(
+  ctx: RaidChanging,
+  party: RaidParty,
+  member: Member,
+  text: string,
+  post?: PostNamer,
+): Promise<RaidChangeAnswer> {
+  const reported = reportedBoss(ctx, text);
+  const outcome = await ctx.raids.setBoss(party.id, member, reported);
+  return raidChangeAnswer(
+    ctx.attendance.limits(),
+    outcome,
+    () =>
+      reported.boss === null
+        ? `This is now: ${reported.label}.`
+        : `The boss is now ${reported.label}.`,
+    `This raid already is: ${reported.label}.`,
+    post,
+  );
+}
+
+export type MoveKind = 'quick' | 'charge';
+
+const KIND_WORDS: Readonly<Record<MoveKind, string>> = { quick: 'fast', charge: 'charged' };
+
+/** The ids of the moves of one kind that a Pokémon can have as a raid boss. */
+export function movesOf(entry: PokemonEntry, kind: MoveKind): readonly string[] {
+  return kind === 'quick' ? entry.fastMoves : entry.chargedMoves;
+}
+
+/**
+ * The move a text names among those the boss has: a choice of the list (a move id), or typed
+ * text that fits exactly one of them. Throws a `UserError` that lists the moves otherwise.
+ */
+function typedMove(ctx: RaidReading, entry: PokemonEntry, kind: MoveKind, text: string): string {
+  const { catalogue } = ctx.gameData;
+  const ids = movesOf(entry, kind);
+  const picked = text.trim();
+  if (ids.includes(picked)) return picked;
+  const named = ids.map((id) => ({ value: id, names: [catalogue.move(id)?.name ?? id] }));
+  const fits = matchNamed(named, picked);
+  const [only] = fits;
+  if (only !== undefined && fits.length === 1) return only;
+  const names = named.map((move) => plain(move.names[0] ?? move.value)).join(', ');
+  throw new UserError(
+    `"${plain(truncate(picked, 80))}" is not one ${KIND_WORDS[kind]} move of ${plain(entry.name)}. ` +
+      `Its ${KIND_WORDS[kind]} moves are: ${names}.`,
+  );
+}
+
+/**
+ * Sets one or both moves of a raid's boss from what a member typed or picked (`/moveset`, the
+ * map); null leaves a move as it is. Throws a `UserError` without a move, without a boss the game
+ * master knows, or for a move the boss does not have.
+ */
+export async function changeRaidMoves(
+  ctx: RaidChanging,
+  party: RaidParty,
+  member: Member,
+  quick: string | null,
+  charge: string | null,
+  post?: PostNamer,
+): Promise<RaidChangeAnswer> {
+  if (quick === null && charge === null) {
+    throw new UserError('Give the fast move, the charged move, or both.');
+  }
+  const shown = ctx.partyService.view(party).boss;
+  if (!shown) throw new UserError(problemText('no-boss', ctx.attendance.limits(), 'raid'));
+  const { entry } = shown;
+  if (!entry) throw new UserError(`I do not know the moves of ${plain(shown.name)} yet.`);
+  const moves = {
+    ...(quick === null ? {} : { fastMove: typedMove(ctx, entry, 'quick', quick) }),
+    ...(charge === null ? {} : { chargedMove: typedMove(ctx, entry, 'charge', charge) }),
+  };
+  const outcome = await ctx.raids.setMoveset(party.id, member, moves);
+  const name = (id: string | null): string =>
+    plain((id && ctx.gameData.catalogue.move(id)?.name) ?? '????');
+  return raidChangeAnswer(
+    ctx.attendance.limits(),
+    outcome,
+    (changed) =>
+      `The moves are now ${name(changed.raid.fastMove)} / ${name(changed.raid.chargedMove)}.`,
+    'The raid already had those moves.',
+    post,
+  );
+}
+
+/** A move as a pick list offers it: its id (what `/moveset` takes) and its name. */
+export interface MoveChoice {
+  id: string;
+  name: string;
+}
+
+/**
+ * The moves the boss of a raid can have, as `/moveset` offers them: undefined while the raid has
+ * no boss the game master knows.
+ */
+export function bossMoves(
+  ctx: Pick<RaidChanging, 'partyService' | 'gameData'>,
+  party: RaidParty,
+): { boss: string; fast: MoveChoice[]; charged: MoveChoice[] } | undefined {
+  const entry = ctx.partyService.view(party).boss?.entry;
+  if (!entry) return undefined;
+  const choices = (kind: MoveKind): MoveChoice[] =>
+    movesOf(entry, kind).map((id) => ({
+      id,
+      name: ctx.gameData.catalogue.move(id)?.name ?? id,
+    }));
+  return { boss: entry.name, fast: choices('quick'), charged: choices('charge') };
+}
diff --git a/src/commands/raids/raid-input.ts b/src/commands/raids/raid-input.ts
index bef7331407774e7557325dab2386967c593fd27a..27062a30a751414a2bc8e79fba26cbefcf7beef2 100644
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -27,6 +27,16 @@ import { byName, CHOICE_NAME, MAX_CHOICES, showsGuessed, type Choice } from '../
 
 const MINUTE = 60_000;
 
+/**
+ * What reading a boss, a tier or a time of a raid needs: the settings, the boss list, the
+ * events, the Pokémon search and the game data. `/raid`, the changes of a raid and the live map
+ * read with the same functions.
+ */
+export type RaidReading = Pick<
+  AppContext,
+  'config' | 'raidBosses' | 'raidEvents' | 'pokemon' | 'gameData'
+>;
+
 /** What a report says the raid is: an egg of a tier, or a boss. */
 export interface ReportedBoss {
   tier: RaidTier;
@@ -175,7 +185,7 @@ function couldBeEntries(text: string, entries: readonly PokemonEntry[]): UserErr
 }
 
 /** The mega forms of the Pokémon a text names (`mega charizard` or `charizard`). */
-function megaForms(ctx: AppContext, text: string): PokemonEntry[] {
+function megaForms(ctx: RaidReading, text: string): PokemonEntry[] {
   const species = ctx.pokemon.exact(text.replace(/^mega\b\s*/i, ''));
   if (!species) return [];
   return ctx.gameData.catalogue.byDex(species.dex).filter((entry) => entry.kind === 'mega');
@@ -214,7 +224,7 @@ const MEGA_LEVELS: readonly RaidLevel[] = ['Mega', 'MegaLegendary'];
 
 /** A tier typed in front of a name: the boss of that tier, or any Pokémon in that tier. */
 function reportedWithTier(
-  ctx: AppContext,
+  ctx: RaidReading,
   bosses: readonly RaidBoss[],
   typedTier: { tier: RaidTier; rest: string },
 ): ReportedBoss {
@@ -284,7 +294,7 @@ function reportedWithTier(
  * Pokémon (nicknames included) that is a current boss is that boss; one that is not is
  * explained. Throws a `UserError` that says what would work.
  */
-export function reportedBoss(ctx: AppContext, value: string): ReportedBoss {
+export function reportedBoss(ctx: RaidReading, value: string): ReportedBoss {
   const text = value.trim();
   const bosses = ctx.raidBosses.bosses();
   const [kind, ...parts] = text.split(':');
@@ -608,7 +618,7 @@ export function reportedGym(
  * such a raid can have.
  */
 export function reportedTime(
-  ctx: AppContext,
+  ctx: RaidReading,
   reported: ReportedBoss,
   text: string | null,
   now: number,
@@ -654,7 +664,7 @@ export function reportedTime(
  * the end of a raid of any tier, it is something other than unreadable (whether it fits the raid
  * is known only once the screenshot was read).
  */
-export function readableTime(ctx: AppContext, text: string, now: number): boolean {
+export function readableTime(ctx: RaidReading, text: string, now: number): boolean {
   const { settings } = ctx.config;
   const rules = raidDurationRules(settings, ctx.raidEvents.events());
   return (['hatch', 'end'] as const).some((parameter) => {
@@ -688,7 +698,7 @@ const TIME_WORDS = {
  * `UserError` for a text that is no time or lies outside what this raid can have.
  */
 export function typedPartyTime(
-  ctx: AppContext,
+  ctx: RaidReading,
   party: RaidParty,
   parameter: 'hatch' | 'end' | 'meet',
   text: string,
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index 23b74426cc7d356385381d15998bc20f392c25c8..a89c37549f1587db6669e77e6ca5969cfa3746d5 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -20,7 +20,6 @@ import { memberInfo } from '../../discord/member-info.js';
 import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
 import { storedReport, type StoredReport } from '../../domain/ocr/screenshot-record.js';
 import type { ReportDoubt } from '../../domain/ocr/screenshot-report.js';
-import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { doubtLines, readingLines, refusalWords } from '../../render/screenshot-reading.js';
 import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
@@ -39,7 +38,7 @@ import {
   stageOnly,
   type ReportedBoss,
 } from './raid-input.js';
-import { NO_POST_MADE } from '../../render/activity.js';
+import { DISCORD_NAMES, RAID_THROTTLE, reportRaidAs, reportWords } from './report.js';
 
 /**
  * The custom-id kind of the controls this command shows. It belongs to `/raid`'s own controls
@@ -83,12 +82,6 @@ type Answerable = ChatInputCommandInteraction | ButtonInteraction | StringSelect
 
 const gymName = (gym: Gym): string => plain(gym.nickname ?? gym.name);
 
-const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
-  [PartyStatus.Interested]: 'interested',
-  [PartyStatus.Coming]: 'coming',
-  [PartyStatus.Present]: 'here',
-};
-
 /** Reports the raid and tells the member what came of it. The interaction is acknowledged. */
 async function finish(
   interaction: Answerable,
@@ -96,53 +89,20 @@ async function finish(
   request: PendingReport,
   gym: Gym,
 ): Promise<void> {
-  const settings = await ctx.users.get(interaction.user.id);
   const shot = request.screenshot;
-  const outcome = await ctx.partyService.reportRaid({
-    gym,
-    reporterId: interaction.user.id,
-    reporter: memberInfo(interaction),
-    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
-    autoStatus: settings.autoStatus,
-    tier: request.reported.tier,
-    boss: request.reported.boss,
+  const member = { id: interaction.user.id, ...memberInfo(interaction) };
+  const result = await reportRaidAs(ctx, member, gym, {
+    reported: request.reported,
+    time: request.time,
+    regionChannelId: request.regionChannelId,
     ...(request.hatched ? { hatched: true } : {}),
     // The screenshot's id when it was kept, and whether the time is a guess either way.
     ...(shot ? { screenshot: { id: shot.id ?? null, timeUncertain: shot.timeUncertain } } : {}),
-    ...(request.regionChannelId === undefined ? {} : { regionChannelId: request.regionChannelId }),
-    ...(request.time ? { time: request.time } : {}),
   });
-  let content: string;
-  switch (outcome.kind) {
-    case 'created':
-      content =
-        `Reported: ${request.reported.label} at ${gymName(gym)}.` +
-        (outcome.party.forumPostId === null ? '' : ` Its post is <#${outcome.party.forumPostId}>.`);
-      // Its post shows the screenshot as long as the raid lasts.
-      if (shot?.id !== undefined) await ctx.screenshots.inUse(shot.id);
-      break;
-    case 'exists': {
-      const post = outcome.party.forumPostId;
-      const where = post === null ? 'It is being set up right now.' : `Its post is <#${post}>.`;
-      const status = STATUS_WORDS[settings.autoStatus];
-      const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
-      content = `There is already a raid at ${gymName(gym)}. ${where}${marked}`;
-      break;
-    }
-    case 'gym-gone':
-      content = `${gymName(gym)} was removed from my gym list just now, so there is no raid to report there.`;
-      break;
-    case 'no-region':
-      content = `${gymName(gym)} is not in any region of this server, so I have nowhere to post the raid.`;
-      break;
-    case 'no-forum':
-      content =
-        `The region <#${outcome.region.channelId}> has no raid forum yet. ` +
-        'A moderator can create it with `/admin setup-forums`.';
-      break;
-    case 'no-post':
-      content = NO_POST_MADE;
-      break;
+  const content = reportWords(result, gym, request.reported.label, DISCORD_NAMES);
+  // Its post shows the screenshot as long as the raid lasts.
+  if (result.outcome.kind === 'created' && shot?.id !== undefined) {
+    await ctx.screenshots.inUse(shot.id);
   }
   // What a screenshot left unsure is said, and its feedback is a button away.
   const unsure =
@@ -536,7 +496,7 @@ function raidCommand(screenshots: boolean): SimpleCommand {
     },
     guards: [requireRegion, requireWhatToReport],
     defer: 'ephemeral',
-    throttle: { uses: 20, perSeconds: 900 },
+    throttle: RAID_THROTTLE,
 
     async execute(interaction, ctx) {
       const regionChannelId = regionChannelOf(interaction, ctx);
diff --git a/src/commands/raids/report.test.ts b/src/commands/raids/report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b94ac32f6dc96388430de3144873473c7fef5cbe
--- /dev/null
+++ b/src/commands/raids/report.test.ts
@@ -0,0 +1,94 @@
+import { describe, expect, it } from 'vitest';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { ALICE, PARTY_NOW } from '../../../test/support/parties.js';
+import { partyServiceWith } from '../../../test/support/party-service.js';
+import { gymsFixture } from '../../../test/support/providers.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { MemoryUsers } from '../../../test/support/users.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import type { UserSettings } from '../../db/repositories/user-repository.js';
+import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import { reportedBoss, reportedTime } from './raid-input.js';
+import {
+  DISCORD_NAMES,
+  reportRaidAs,
+  reportWords,
+  type ReportNames,
+  type ReportResult,
+} from './report.js';
+
+const ALICE_MEMBER = { id: ALICE, name: 'Alice', team: 'valor' } as const;
+
+function libraryGym(): Gym {
+  const gym = gymsFixture().get(1);
+  if (!gym) throw new Error('no gym 1');
+  return gym;
+}
+
+/** The page's names: no post (the page opens the raid), a region by its channel's name. */
+const PAGE: ReportNames = { post: () => undefined, channel: () => '#west' };
+
+/**
+ * A report as `/raid` and the live map make it: as the member, with their own privacy and
+ * automatic status, and the command's words for each outcome.
+ */
+async function setup(settings = new Map<string, Partial<UserSettings>>()) {
+  const made = await partyServiceWith();
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    users: new MemoryUsers(settings),
+  });
+  return { ...made, ctx };
+}
+
+describe('reporting a raid, as /raid and the map share it', () => {
+  it('reports as the member, signed up by their automatic status with their name and team, named unless their privacy says not', async () => {
+    const made = await setup(
+      new Map([[ALICE, { raidPrivacy: RaidPrivacy.Anonymous, autoStatus: PartyStatus.Coming }]]),
+    );
+    const reported = reportedBoss(made.ctx, 'e:T5:0');
+    const result = await reportRaidAs(made.ctx, ALICE_MEMBER, libraryGym(), {
+      reported,
+      time: reportedTime(made.ctx, reported, '30', PARTY_NOW),
+      regionChannelId: WEST_CHANNEL,
+    });
+    expect(result.outcome.kind).toBe('created');
+    expect(result.autoStatus).toBe(PartyStatus.Coming);
+    const [party] = made.store.active();
+    expect(party).toMatchObject({ createdById: ALICE, anonymous: true, gymId: 1 });
+    expect(party?.attendees[ALICE]).toMatchObject({
+      status: PartyStatus.Coming,
+      name: 'Alice',
+      team: 'valor',
+    });
+  });
+
+  it('words each outcome as /raid does, naming the post and the region as the surface can', async () => {
+    const made = await setup();
+    const gym = libraryGym();
+    const reported = reportedBoss(made.ctx, 'e:T5:0');
+    const request = { reported, time: undefined, regionChannelId: WEST_CHANNEL };
+    const first = await reportRaidAs(made.ctx, ALICE_MEMBER, gym, request);
+    const post = first.outcome.kind === 'created' ? first.outcome.party.forumPostId : null;
+    expect(reportWords(first, gym, reported.label, DISCORD_NAMES)).toBe(
+      `Reported: T5 egg at The Stacks. Its post is <#${post}>.`,
+    );
+    expect(reportWords(first, gym, reported.label, PAGE)).toBe('Reported: T5 egg at The Stacks.');
+    const again = await reportRaidAs(made.ctx, { id: '200000000000000099' }, gym, request);
+    expect(again.outcome.kind).toBe('exists');
+    expect(reportWords(again, gym, reported.label, PAGE)).toBe(
+      'There is already a raid at The Stacks. You have been marked as interested.',
+    );
+    const west = made.regions.byChannel(WEST_CHANNEL);
+    if (!west) throw new Error('no West');
+    const noForum: ReportResult = {
+      autoStatus: first.autoStatus,
+      outcome: { kind: 'no-forum', region: west },
+    };
+    expect(reportWords(noForum, gym, reported.label, PAGE)).toBe(
+      'The region #west has no raid forum yet. A moderator can create it with `/admin setup-forums`.',
+    );
+  });
+});
diff --git a/src/commands/raids/report.ts b/src/commands/raids/report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3dace2ed940414c1d1ae2a5fe6f90c13b76472c3
--- /dev/null
+++ b/src/commands/raids/report.ts
@@ -0,0 +1,132 @@
+import type { AppContext } from '../../app-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import type { Throttle } from '../../discord/throttle.js';
+import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import { NO_POST_MADE } from '../../render/activity.js';
+import { plain } from '../../render/text.js';
+import type { Member } from '../../services/attendance-service.js';
+import type { RaidScreenshot } from '../../domain/party/party.js';
+import type { ReportOutcome } from '../../services/party-service.js';
+import type { ReportedBoss } from './raid-input.js';
+
+/**
+ * Reporting a raid as `/raid` (and its short forms) and the live map (plan 8M-4) share it: the
+ * report as the member, with their own privacy and automatic status (`reportRaidAs`), and the
+ * command's words for what came of it (`reportWords`).
+ */
+
+/** The name `/raid` is used and counted under, and the map's reports with it. */
+export const RAID_COMMAND = 'raid';
+
+/** How often one member may report a raid, from Discord and from the map together. */
+export const RAID_THROTTLE: Throttle = { uses: 20, perSeconds: 900 };
+
+/** What reporting needs: the members' settings and the party service. */
+export type RaidReporting = Pick<AppContext, 'users' | 'partyService'>;
+
+/** A report whose gym is known: what it is, its time, where it was made. */
+export interface RaidReportRequest {
+  reported: ReportedBoss;
+  /** Read by `reportedTime`; undefined when none was given. */
+  time: { hatch: number } | { end: number } | undefined;
+  /**
+   * The region channel the report was made in (the map: the region the member picked): the raid
+   * goes to that region when the gym lies in it and it has a forum.
+   */
+  regionChannelId: string | undefined;
+  /** Seen hatched without a boss anybody could tell (from a screenshot). */
+  hatched?: boolean;
+  screenshot?: RaidScreenshot;
+}
+
+/** What came of a report, and the reporter's automatic status, which the answer names. */
+export interface ReportResult {
+  outcome: ReportOutcome;
+  autoStatus: PartyStatus;
+}
+
+/**
+ * Reports the raid as the member: anonymous when their privacy setting says so, signed up by
+ * their automatic status under their name and team.
+ */
+export async function reportRaidAs(
+  ctx: RaidReporting,
+  member: Member,
+  gym: Gym,
+  request: RaidReportRequest,
+): Promise<ReportResult> {
+  const { id, ...reporter } = member;
+  const settings = await ctx.users.get(id);
+  const outcome = await ctx.partyService.reportRaid({
+    gym,
+    reporterId: id,
+    reporter,
+    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
+    autoStatus: settings.autoStatus,
+    tier: request.reported.tier,
+    boss: request.reported.boss,
+    ...(request.hatched ? { hatched: true } : {}),
+    ...(request.screenshot ? { screenshot: request.screenshot } : {}),
+    ...(request.regionChannelId === undefined ? {} : { regionChannelId: request.regionChannelId }),
+    ...(request.time ? { time: request.time } : {}),
+  });
+  return { outcome, autoStatus: settings.autoStatus };
+}
+
+/**
+ * How an answer names a post and a region channel: as mentions on Discord; on the map no post
+ * (the page opens the raid instead: undefined leaves the sentence out) and a channel by its name.
+ */
+export interface ReportNames {
+  post(postId: string): string | undefined;
+  channel(channelId: string): string;
+}
+
+export const DISCORD_NAMES: ReportNames = {
+  post: (postId) => `<#${postId}>`,
+  channel: (channelId) => `<#${channelId}>`,
+};
+
+const STATUS_WORDS: Partial<Record<PartyStatus, string>> = {
+  [PartyStatus.Interested]: 'interested',
+  [PartyStatus.Coming]: 'coming',
+  [PartyStatus.Present]: 'here',
+};
+
+const gymName = (gym: Gym): string => plain(gym.nickname ?? gym.name);
+
+/** What `/raid` tells the member came of a report (`label`: what was reported, `T5 egg`). */
+export function reportWords(
+  result: ReportResult,
+  gym: Gym,
+  label: string,
+  names: ReportNames,
+): string {
+  const { outcome } = result;
+  const postSentence = (postId: string | null, missing: string): string => {
+    const named = postId === null ? undefined : names.post(postId);
+    if (named !== undefined) return ` Its post is ${named}.`;
+    return postId === null ? missing : '';
+  };
+  switch (outcome.kind) {
+    case 'created':
+      return `Reported: ${label} at ${gymName(gym)}.${postSentence(outcome.party.forumPostId, '')}`;
+    case 'exists': {
+      const where = postSentence(outcome.party.forumPostId, ' It is being set up right now.');
+      const status = STATUS_WORDS[result.autoStatus];
+      const marked = outcome.joined && status ? ` You have been marked as ${status}.` : '';
+      return `There is already a raid at ${gymName(gym)}.${where}${marked}`;
+    }
+    case 'gym-gone':
+      return `${gymName(gym)} was removed from my gym list just now, so there is no raid to report there.`;
+    case 'no-region':
+      return `${gymName(gym)} is not in any region of this server, so I have nowhere to post the raid.`;
+    case 'no-forum':
+      return (
+        `The region ${names.channel(outcome.region.channelId)} has no raid forum yet. ` +
+        'A moderator can create it with `/admin setup-forums`.'
+      );
+    case 'no-post':
+      return NO_POST_MADE;
+  }
+}
````

### Task 2: Map: the pick lists of a raid report

Prototype commit: `58ff5189b0140a8428619fbb8603fb412eac7e80`

`GET /s/<guild>/api/raid-options` for members: the bosses in the boss list's order, then an egg of every tier, valued as `/raid`'s own list values them, tiers in `raidWords` (no gym mark); an ETag, `private, no-cache`, 304.

**Files:**

```
 src/app.ts                          |  2 ++
 src/commands/raids/raid-input.ts    | 12 +++++++++---
 src/domain/web/raid-options-data.ts | 30 ++++++++++++++++++++++++++++++
 src/web/guild-routes.ts             |  4 ++++
 src/web/raid-options.test.ts        | 72 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/raid-options.ts             | 27 +++++++++++++++++++++++++++
 src/web/raid-routes.ts              | 60 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/server.ts                   |  3 +++
 test/support/web.ts                 | 23 +++++++++++++++++++++++
 9 files changed, 230 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/raid-options.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/commands/raids/raid-input.ts src/domain/web/raid-options-data.ts src/web/guild-routes.ts src/web/raid-options.test.ts src/web/raid-options.ts src/web/raid-routes.ts src/web/server.ts test/support/web.ts` and `npx eslint src/app.ts src/commands/raids/raid-input.ts src/domain/web/raid-options-data.ts src/web/guild-routes.ts src/web/raid-options.test.ts src/web/raid-options.ts src/web/raid-routes.ts src/web/server.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 58ff5189b0140a8428619fbb8603fb412eac7e80 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Map: the pick lists of a raid report`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/commands/raids/raid-input.ts src/domain/web/raid-options-data.ts src/web/guild-routes.ts src/web/raid-options.test.ts src/web/raid-options.ts src/web/raid-routes.ts src/web/server.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index cdf5847a38c2fb304659d53d216fb7ec6aeb5251..d77886f5f5bcd60fc9ddf0a52007b7f7df6a63ce 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -835,6 +835,8 @@ export async function startApp(
         acting: new DiscordWebMembers(client),
         throttles,
       },
+      // Reporting and changing raids on the map: what the raid commands read and call.
+      raids: { ctx },
       now: () => Date.now(),
       log,
     });
diff --git a/src/commands/raids/raid-input.ts b/src/commands/raids/raid-input.ts
index 27062a30a751414a2bc8e79fba26cbefcf7beef2..5891d8d5887214a42ee90f0a25b7f87097dc5589 100644
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -68,7 +68,7 @@ function bossLabel(boss: RaidBoss): string {
 const eggLabel = (tier: RaidTier): string => `${raidTierLabel(tier)} egg`;
 
 /** Every tier a raid can have, in the order of the levels, shadow after plain. */
-function allTiers(): RaidTier[] {
+export function allTiers(): RaidTier[] {
   return RAID_LEVELS.flatMap((level) =>
     [raidTier(level, false), raidTier(level, true)].filter(
       (tier): tier is RaidTier => tier !== undefined,
@@ -76,6 +76,12 @@ function allTiers(): RaidTier[] {
   );
 }
 
+/** What picking a boss of the list says (`b:yveltal:T5:0`), which `reportedBoss` reads back. */
+export const bossChoiceValue = (boss: RaidBoss): string => `b:${boss.key}:${tierCode(boss.tier)}`;
+
+/** What picking the egg of a tier says (`e:T5:0`), which `reportedBoss` reads back. */
+export const eggChoiceValue = (tier: RaidTier): string => `e:${tierCode(tier)}`;
+
 /**
  * The choices for the `boss` option: the current bosses first, then an egg for every tier,
  * narrowed to what was typed. A choice's value says exactly what was picked, so that the
@@ -90,11 +96,11 @@ export function bossChoices(ctx: AppContext, typed: string): Choice[] {
   const current = ctx.raidBosses.bosses();
   const asChoice = (boss: RaidBoss): Choice => ({
     name: choiceName(boss),
-    value: `b:${boss.key}:${tierCode(boss.tier)}`,
+    value: bossChoiceValue(boss),
   });
   // A value is at most 100 characters.
   const bosses = current.map(asChoice).filter((choice) => choice.value.length <= 100);
-  const eggs = allTiers().map((tier) => ({ name: eggLabel(tier), value: `e:${tierCode(tier)}` }));
+  const eggs = allTiers().map((tier) => ({ name: eggLabel(tier), value: eggChoiceValue(tier) }));
   // With nothing typed the bosses come first but leave room for every egg; with text typed the
   // list is narrowed to what fits it, then the bosses a nickname (or its beginning) names.
   let chosen: Choice[];
diff --git a/src/domain/web/raid-options-data.ts b/src/domain/web/raid-options-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..821525853439e74bff897c6007f555084db064b3
--- /dev/null
+++ b/src/domain/web/raid-options-data.ts
@@ -0,0 +1,30 @@
+/**
+ * What the live map's raid forms read and send (plan 8M-4, spec 3.6), as the page reads it.
+ * Types alone, with no import of the server's code: the page's bundle (`src/web/client/`) takes
+ * them.
+ */
+
+/** A boss as `/raid` lists it: its value (`b:yveltal:T5:0`), name, and tier in the posts' words. */
+export interface BossOption {
+  value: string;
+  name: string;
+  /** `Level 5 raid`, `Shadow Level 3 raid`. */
+  tier: string;
+}
+
+/** The egg of a tier as `/raid` lists it: its value (`e:T5:0`) and the tier in the posts' words. */
+export interface EggOption {
+  value: string;
+  tier: string;
+}
+
+/**
+ * The pick lists of a report (`GET /s/<guild>/api/raid-options`), in `/raid`'s order: the
+ * current bosses, then an egg of every tier; and the posts' time zone, in which typed clock
+ * times are read.
+ */
+export interface RaidOptionsView {
+  zone: string;
+  bosses: BossOption[];
+  eggs: EggOption[];
+}
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index f1c3de44512083b81e461e4659fb7abc07fc7c81..015ad56c4ff874dfcddfd2b5efbdc84074a467ed 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -6,6 +6,7 @@ import { etagMatches } from './geo-cache.js';
 import { mapMembers } from './map-members.js';
 import { mapPage } from './page.js';
 import { partyRoutes } from './party-routes.js';
+import { raidRoutes } from './raid-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -110,4 +111,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // The parties on the live map, and joining them (plan 8M-3): for members of the server (with
   // the map's member role, when the settings name one).
   partyRoutes(scope, map);
+
+  // Reporting and changing raids on the live map (plan 8M-4): for the same members.
+  raidRoutes(scope, map);
 }
diff --git a/src/web/raid-options.test.ts b/src/web/raid-options.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0de5d5932179fdf4de62dfa206d13e8b2f1661b4
--- /dev/null
+++ b/src/web/raid-options.test.ts
@@ -0,0 +1,72 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { raidBossesFixture } from '../../test/support/raid-bosses.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { raidWebWith, webServerWith, type TestWeb } from '../../test/support/web.js';
+import type { RaidOptionsView } from '../domain/web/raid-options-data.js';
+import { raidOptions } from './raid-options.js';
+
+const OPTIONS = `/s/${FAKE_GUILD_ID}/api/raid-options`;
+
+describe('the pick lists of a raid report (raidOptions)', () => {
+  it("lists the current bosses in the boss list's order, then an egg of every tier, as /raid offers them, the tiers in the posts' words", () => {
+    const bosses = raidBossesFixture().bosses();
+    const view = raidOptions(bosses, 'America/New_York');
+    expect(view.zone).toBe('America/New_York');
+    expect(view.bosses.map((boss) => boss.value)).toEqual(
+      bosses.map((boss) => `b:${boss.key}:${boss.tier.level}:${boss.tier.shadow ? '1' : '0'}`),
+    );
+    expect(view.bosses).toContainEqual({
+      value: 'b:yveltal:T5:0',
+      name: 'Yveltal',
+      tier: 'Level 5 raid',
+    });
+    expect(view.eggs[0]).toEqual({ value: 'e:T1:0', tier: 'Level 1 raid' });
+    expect(view.eggs.map((egg) => egg.tier)).toContain('Shadow Level 5 raid');
+    expect(view.eggs.map((egg) => egg.tier)).toContain('Elite raid');
+    // Nothing of gyms: the elite raid gym mark is not shown to members.
+    expect(JSON.stringify(view)).not.toMatch(/gym/i);
+  });
+});
+
+describe('GET /s/<guild>/api/raid-options', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  function serve() {
+    const { ctx } = createTestContext();
+    web = webServerWith({
+      members: new FakeMemberDirectory().add(ALICE, 'Alice'),
+      raids: raidWebWith(ctx),
+    });
+    return web;
+  }
+
+  it('answers a member with the pick lists, kept by an ETag', async () => {
+    const served = serve();
+    const cookie = await served.loggedIn(ALICE, 'Alice');
+    const answer = await served.app.inject({ url: OPTIONS, headers: { cookie } });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.headers['cache-control']).toBe('private, no-cache');
+    const view = answer.json<RaidOptionsView>();
+    expect(view.bosses.length).toBeGreaterThan(0);
+    const etag = String(answer.headers.etag);
+    const again = await served.app.inject({
+      url: OPTIONS,
+      headers: { cookie, 'if-none-match': etag },
+    });
+    expect(again.statusCode).toBe(304);
+  });
+
+  it('is for members only: 401 without a login, 403 for somebody who is not a member', async () => {
+    const served = serve();
+    expect((await served.app.inject({ url: OPTIONS })).statusCode).toBe(401);
+    const cookie = await served.loggedIn(BOB, 'Bob');
+    expect((await served.app.inject({ url: OPTIONS, headers: { cookie } })).statusCode).toBe(403);
+  });
+});
diff --git a/src/web/raid-options.ts b/src/web/raid-options.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d2de76ee7c1198455622be6a69e3ff06f4245f9a
--- /dev/null
+++ b/src/web/raid-options.ts
@@ -0,0 +1,27 @@
+import { allTiers, bossChoiceValue, eggChoiceValue } from '../commands/raids/raid-input.js';
+import type { RaidBoss } from '../domain/pogo/raid-bosses.js';
+import { raidWords } from '../domain/pogo/raid-tier.js';
+import type { RaidOptionsView } from '../domain/web/raid-options-data.js';
+
+/** The longest value a pick of `/raid`'s list may have (Discord's limit, kept for the map too). */
+const MAX_VALUE = 100;
+
+/**
+ * The pick lists of a report on the map (spec 3.6), as `/raid` offers them: the current bosses in
+ * the boss list's order, each with the value its choice has (`reportedBoss` reads it back), then
+ * an egg of every tier; tiers in the posts' words (`raidWords`), and nothing of gyms (the elite
+ * raid gym mark is not shown to members). Pure.
+ */
+export function raidOptions(bosses: readonly RaidBoss[], zone: string): RaidOptionsView {
+  return {
+    zone,
+    bosses: bosses
+      .map((boss) => ({
+        value: bossChoiceValue(boss),
+        name: boss.name,
+        tier: raidWords(boss.tier),
+      }))
+      .filter((option) => option.value.length <= MAX_VALUE),
+    eggs: allTiers().map((tier) => ({ value: eggChoiceValue(tier), tier: raidWords(tier) })),
+  };
+}
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2b3da2f92ba66927ffd7169fd645f2a70b8d4736
--- /dev/null
+++ b/src/web/raid-routes.ts
@@ -0,0 +1,60 @@
+import type { FastifyInstance } from 'fastify';
+import type { AppContext } from '../app-context.js';
+import type { RaidChanging } from '../commands/raids/raid-changes.js';
+import type { RaidReporting } from '../commands/raids/report.js';
+import { sendFailure } from './answers.js';
+import { etagMatches, etagOf } from './geo-cache.js';
+import type { GuildRequest } from './guild-routes.js';
+import { raidOptions } from './raid-options.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+
+/** The requests for the pick lists one address may make in a minute (a form asks once). */
+const OPTIONS_PER_MINUTE = 30;
+
+/**
+ * What reporting and changing raids on the map read and call (plan 8M-4): exactly what `/raid`,
+ * `/hatch`, `/end`, `/boss` and `/moveset` use (the readers' sources, the members' settings, the
+ * party and raid services, the gyms and regions), so that the map shares their code paths.
+ */
+export type RaidWebContext = RaidChanging & RaidReporting & Pick<AppContext, 'gyms' | 'regions'>;
+
+/** What the raids of the live map need beyond the parties' own (`PartyWebDeps`). */
+export interface RaidWebDeps {
+  ctx: RaidWebContext;
+}
+
+/**
+ * The raids of the live map (spec 3.5, 3.6): the pick lists of a report for members of the server
+ * (`/s/<guild>/api/raid-options`: `raidOptions`, an ETag of its JSON, `private, no-cache`, 304
+ * when the page has it).
+ */
+export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const { sessions, raids } = deps;
+
+  const optionsLimiter = new RateLimiter({ uses: OPTIONS_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/raid-options',
+    { onRequest: limitedPerAddress(optionsLimiter, { now: deps.now }) },
+    async (request: GuildRequest, reply) => {
+      void reply.header('cache-control', 'private, no-cache');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      try {
+        const member = await deps.members.find(request.params.guild, session.userId);
+        if (!member) return sendFailure(request, reply, 403);
+      } catch (err) {
+        deps.log.warn(
+          { err, guild: request.params.guild, user: session.userId },
+          'could not ask whether somebody on the web pages is a member',
+        );
+        return sendFailure(request, reply, 503);
+      }
+      const body = JSON.stringify(raidOptions(raids.ctx.raidBosses.bosses(), deps.parties.zone));
+      const etag = etagOf(body);
+      void reply.header('etag', etag);
+      if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
+      return reply.type('application/json; charset=utf-8').send(body);
+    },
+  );
+}
diff --git a/src/web/server.ts b/src/web/server.ts
index 153d3dd6854990268ec3e4fef79a960240788f4c..55e1f8ca44b2fd41f8b80d4be60c8858357ec017 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -15,6 +15,7 @@ import { securityHeaders } from './headers.js';
 import type { LoginLinks } from './login-links.js';
 import { HASHED_NAME, type WebAssets } from './page.js';
 import type { PartyWebDeps } from './party-routes.js';
+import type { RaidWebDeps } from './raid-routes.js';
 import type { Sessions } from './sessions.js';
 
 /** `settings.web` once it is set. */
@@ -44,6 +45,8 @@ export interface WebDeps {
   editor: EditorDeps;
   /** The parties on the live map, and joining them (plan 8M-3). */
   parties: PartyWebDeps;
+  /** Reporting and changing raids on the live map (plan 8M-4). */
+  raids: RaidWebDeps;
   now: () => number;
   log: Logger;
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index c18f207b2cf397cebca2f3efd2ad02537ca2a7ea..249a95601d52a14aa022c3afa4dfc6ddc92dc806 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -16,6 +16,7 @@ import type { RegionStaffSource, StaffAnswer } from '../../src/web/region-staff.
 import { LoginLinks } from '../../src/web/login-links.js';
 import type { WebAssets } from '../../src/web/page.js';
 import type { ActingAnswer, ActingMembers, PartyWebDeps } from '../../src/web/party-routes.js';
+import type { RaidWebContext, RaidWebDeps } from '../../src/web/raid-routes.js';
 import { Throttles } from '../../src/discord/throttle.js';
 import type { Team } from '../../src/domain/party/party.js';
 import type { Member } from '../../src/services/attendance-service.js';
@@ -249,6 +250,25 @@ export function partyWebWith(
   };
 }
 
+/**
+ * Reporting and changing raids on the map over a test's context (`createTestContext`, with the
+ * party services of `partyServiceWith` for a report or a change), as the bot wires it. Pass as
+ * `raids`.
+ */
+export function raidWebWith(ctx: RaidWebContext): RaidWebDeps {
+  return { ctx };
+}
+
+/** No raids can be reported or changed: a test that does passes `raidWebWith`. */
+const NO_RAIDS: RaidWebDeps = {
+  ctx: new Proxy({} as RaidWebContext, {
+    get(_target, property) {
+      if (typeof property === 'symbol' || property === 'then') return undefined;
+      throw new Error('no raids in this test: give raidWebWith');
+    },
+  }),
+};
+
 /** The web settings of the tests: a public address of its own, OpenStreetMap's tiles. */
 export const TEST_WEB: WebSettings = {
   port: 0,
@@ -334,6 +354,8 @@ export interface WebTestOptions {
   closing?: () => boolean;
   /** The live map's parties (`partyWebWith`); none by default. */
   parties?: PartyWebDeps;
+  /** Reporting and changing raids on the map (`raidWebWith`); none by default. */
+  raids?: RaidWebDeps;
 }
 
 /**
@@ -457,6 +479,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
       closing: options.closing ?? (() => false),
     },
     parties: options.parties ?? NO_PARTIES,
+    raids: options.raids ?? NO_RAIDS,
     now: () => clock.now,
     log,
   });
````

### Task 3: Map: report a raid

Prototype commit: `493ba0bbdf282434ea045942d6543320a3c35a52`

`POST /s/<guild>/api/raids`: the per-address limit and `postGuard` before the body; the member checks of 8M-3 (`actingOnTheMap`); the gym in a region of this server; the region asked when several; barred from the forum the raid would go to or from that of a raid already standing at the gym: 403; then `/raid`'s throttle, readers and `reportRaidAs`; answers in `/raid`'s words for the page (`pageWords`), "It was posted in …" when another region took it, the raid in 8M-3's view; nothing named, nothing of the text logged.

**Files:**

```
 src/app.ts                          |   2 +-
 src/domain/web/clock.ts             |  22 ++++++
 src/domain/web/raid-options-data.ts |  15 ++++
 src/web/acting.ts                   |  86 ++++++++++++++++++++
 src/web/client/parties.ts           |  20 +----
 src/web/page-words.test.ts          |  42 ++++++++++
 src/web/page-words.ts               |  26 +++++++
 src/web/party-routes.ts             |  62 ++++-----------
 src/web/raid-report.test.ts         | 325 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/raid-routes.ts              | 248 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 test/support/web.ts                 |  10 ++-
 11 files changed, 786 insertions(+), 72 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/page-words.test.ts src/web/raid-report.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/domain/web/clock.ts src/domain/web/raid-options-data.ts src/web/acting.ts src/web/client/parties.ts src/web/page-words.test.ts src/web/page-words.ts src/web/party-routes.ts src/web/raid-report.test.ts src/web/raid-routes.ts test/support/web.ts` and `npx eslint src/app.ts src/domain/web/clock.ts src/domain/web/raid-options-data.ts src/web/acting.ts src/web/client/parties.ts src/web/page-words.test.ts src/web/page-words.ts src/web/party-routes.ts src/web/raid-report.test.ts src/web/raid-routes.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 493ba0bbdf282434ea045942d6543320a3c35a52 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Map: report a raid`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/domain/web/clock.ts src/domain/web/raid-options-data.ts src/web/acting.ts src/web/client/parties.ts src/web/page-words.test.ts src/web/page-words.ts src/web/party-routes.ts src/web/raid-report.test.ts src/web/raid-routes.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index d77886f5f5bcd60fc9ddf0a52007b7f7df6a63ce..c663fda1787bca29c9872998930cb66afd121046 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -836,7 +836,7 @@ export async function startApp(
         throttles,
       },
       // Reporting and changing raids on the map: what the raid commands read and call.
-      raids: { ctx },
+      raids: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
       now: () => Date.now(),
       log,
     });
diff --git a/src/domain/web/clock.ts b/src/domain/web/clock.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2506c07d74bbf7061d42503bd04efbe26baec555
--- /dev/null
+++ b/src/domain/web/clock.ts
@@ -0,0 +1,22 @@
+/**
+ * Times as the live map writes them, in the page and in the server's answers alike. No import:
+ * the page's bundle takes it.
+ */
+
+/** Spaces the formatter writes as narrow or no-break ones (every space separator), as plain. */
+const plainSpaces = (text: string): string => text.replace(/\p{Zs}/gu, ' ');
+
+/** `2:30 PM` in the posts' zone, with the day (`Wed, Oct 14, 2:00 PM`) when it is not today. */
+export function clockTime(at: number, zone: string, now: number): string {
+  const day = (time: number) =>
+    new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(time);
+  const sameDay = day(at) === day(now);
+  return plainSpaces(
+    new Intl.DateTimeFormat('en-US', {
+      timeZone: zone,
+      ...(sameDay ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
+      hour: 'numeric',
+      minute: '2-digit',
+    }).format(at),
+  );
+}
diff --git a/src/domain/web/raid-options-data.ts b/src/domain/web/raid-options-data.ts
index 821525853439e74bff897c6007f555084db064b3..f4f36600395f80aa4c10f62875fdd8a5ad836b60 100644
--- a/src/domain/web/raid-options-data.ts
+++ b/src/domain/web/raid-options-data.ts
@@ -4,6 +4,21 @@
  * them.
  */
 
+import type { MapRaid } from './party-data.js';
+
+/**
+ * What a report or a change of a raid answers: whether it was done, the command's words as plain
+ * text, and the raid as the member now sees it on the map (for a report also the raid that was
+ * at the gym already), when there is one to show. A report at a gym that lies in several regions
+ * is answered with those regions (`regions`), to pick one.
+ */
+export interface RaidAnswer {
+  ok: boolean;
+  text: string;
+  raid?: MapRaid;
+  regions?: Array<{ id: number; name: string }>;
+}
+
 /** A boss as `/raid` lists it: its value (`b:yveltal:T5:0`), name, and tier in the posts' words. */
 export interface BossOption {
   value: string;
diff --git a/src/web/acting.ts b/src/web/acting.ts
new file mode 100644
index 0000000000000000000000000000000000000000..eb7bc2adb342288f01127bd40d56857bc27786eb
--- /dev/null
+++ b/src/web/acting.ts
@@ -0,0 +1,86 @@
+import type { FastifyReply, FastifyRequest } from 'fastify';
+import type { MemberStanding } from '../discord/member-directory.js';
+import { controlThrottleKey } from '../discord/router.js';
+import { waitText, type Throttle } from '../discord/throttle.js';
+import type { Member } from '../services/attendance-service.js';
+import { sendFailure } from './answers.js';
+import { countsOnTheMap } from './map-members.js';
+import type { WebDeps } from './server.js';
+
+/** What a write on the map answers while Discord cannot say who writes. */
+export const UNREACHABLE =
+  'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.';
+
+/** What a write answers a member who may not act in the server now. */
+const HELD_BACK: Readonly<Record<'timed-out' | 'pending', string>> = {
+  'timed-out': 'You are timed out in this server, so you cannot do that now.',
+  pending: "Finish this server's membership screening first.",
+};
+
+/**
+ * Who writes on the map, as Discord has them now (plans 8M-3, 8M-4): a member who may act, with
+ * their roles; or the answer already sent.
+ */
+export type Acting = { member: Member; standing: MemberStanding } | { sent: FastifyReply };
+
+/**
+ * The checks of every write of a member on the map, in this order (spec 2.5): whether they are
+ * a member (the member directory, kept a minute, also "not a member", and with the map's member
+ * role one without it: 403 without asking Discord anything more, so that a non-member's writes
+ * cost no fetch); the member fetched fresh (`ActingMembers`: not in the server, or without the
+ * map's member role, 403 whatever they name, so that nobody but a member learns which ids
+ * exist; timed out or not through the membership screening 403 in words of their own; Discord
+ * unreachable 503, logged with `doing`). None of these counts against a throttle.
+ */
+export async function actingOnTheMap(
+  deps: WebDeps,
+  request: FastifyRequest,
+  reply: FastifyReply,
+  guild: string,
+  userId: string,
+  doing: string,
+): Promise<Acting> {
+  let acting;
+  try {
+    if (!(await deps.members.find(guild, userId))) {
+      return { sent: sendFailure(request, reply, 403) };
+    }
+    acting = await deps.parties.acting.acting(guild, userId);
+  } catch (err) {
+    deps.log.warn(
+      { err, guild, user: userId },
+      `could not ask Discord who ${doing} on the web pages`,
+    );
+    return { sent: reply.code(503).send({ error: UNREACHABLE }) };
+  }
+  if (acting.kind === 'not-member') return { sent: sendFailure(request, reply, 403) };
+  if (acting.kind === 'member' && !countsOnTheMap(acting.standing, deps.settings.memberRole)) {
+    return { sent: sendFailure(request, reply, 403) };
+  }
+  if (acting.kind !== 'member') {
+    return { sent: reply.code(403).send({ error: HELD_BACK[acting.kind] }) };
+  }
+  return { member: acting.member, standing: acting.standing };
+}
+
+/**
+ * Counts a write of the member in the router's window of a command (its name) or a control
+ * (`controlThrottleKey`), as a use there counts: undefined when it may go on, or the answer sent
+ * (429 with `Retry-After`, in the router's words: `words` of the wait).
+ */
+export function throttledOnTheMap(
+  deps: WebDeps,
+  reply: FastifyReply,
+  key: { command: string } | { control: string },
+  userId: string,
+  throttle: Throttle,
+): FastifyReply | undefined {
+  const counted = 'command' in key ? key.command : controlThrottleKey(key.control);
+  const wait = deps.parties.throttles.use(counted, userId, throttle, deps.now());
+  if (wait === undefined) return undefined;
+  const error =
+    'command' in key
+      ? `You can use /${key.command} again in ${waitText(wait)}.`
+      : `That was a lot of clicks. Try again in ${waitText(wait)}.`;
+  return reply.code(429).header('retry-after', String(wait)).send({ error });
+}
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 9af3fd9d0c4a7cdb92b5f7c80abe0c059ed0eb06..65d5bbadc35e0f8740dc5d408837ea754da0d8da 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -6,6 +6,7 @@ import type {
   MapStatus,
   MapTrain,
 } from '../../domain/web/party-data.js';
+import { clockTime } from '../../domain/web/clock.js';
 import type { Me } from './notice.js';
 import { addressLine, directionsLink, type MapGym, type PageNode } from './popup.js';
 
@@ -37,23 +38,8 @@ export function countdown(until: number, now: number): string {
   return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
 }
 
-/** Spaces the formatter writes as narrow or no-break ones (every space separator), as plain. */
-const plainSpaces = (text: string): string => text.replace(/\p{Zs}/gu, ' ');
-
-/** `2:30 PM` in the posts' zone, with the day (`Wed, Oct 14, 2:00 PM`) when it is not today. */
-export function clockTime(at: number, zone: string, now: number): string {
-  const day = (time: number) =>
-    new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' }).format(time);
-  const sameDay = day(at) === day(now);
-  return plainSpaces(
-    new Intl.DateTimeFormat('en-US', {
-      timeZone: zone,
-      ...(sameDay ? {} : { weekday: 'short', month: 'short', day: 'numeric' }),
-      hour: 'numeric',
-      minute: '2-digit',
-    }).format(at),
-  );
-}
+/** `2:30 PM` in the posts' zone (the server words its answers' times the same way). */
+export { clockTime };
 
 const PRESS_LABELS: Readonly<Record<MapPress['action'], string>> = {
   interested: 'Interested',
diff --git a/src/web/page-words.test.ts b/src/web/page-words.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..39a8468e51a21213de0bc0ea312785da7d049811
--- /dev/null
+++ b/src/web/page-words.test.ts
@@ -0,0 +1,42 @@
+import { describe, expect, it } from 'vitest';
+import { pageWords } from './page-words.js';
+
+const ZONE = 'America/New_York';
+/** 2026-10-13 14:00 in New York. */
+const NOW = Date.UTC(2026, 9, 13, 18);
+const MINUTE = 60_000;
+const stamp = (time: number, style: string) => `<t:${time / 1000}:${style}>`;
+
+describe('the words of a command as the map shows them (pageWords)', () => {
+  it("writes Discord's timestamps as clock times in the posts' zone, with the day when it is not today", () => {
+    expect(
+      pageWords(
+        `"5pm" cannot be the time the egg hatches: it must be between ${stamp(NOW, 't')} and ${stamp(NOW + 60 * MINUTE, 't')}.`,
+        ZONE,
+        NOW,
+      ),
+    ).toBe('"5pm" cannot be the time the egg hatches: it must be between 2:00 PM and 3:00 PM.');
+    expect(pageWords(`Ends at ${stamp(NOW + 24 * 60 * MINUTE, 'f')}.`, ZONE, NOW)).toBe(
+      'Ends at Wed, Oct 14, 2:00 PM.',
+    );
+  });
+
+  it("takes out the bot's own markdown and undoes the escapes of what members and feeds wrote", () => {
+    expect(pageWords('Try `20` (minutes from now) or `6:15pm`.', ZONE, NOW)).toBe(
+      'Try 20 (minutes from now) or 6:15pm.',
+    );
+    expect(pageWords('The boss was set: **Yveltal (T5)**.', ZONE, NOW)).toBe(
+      'The boss was set: Yveltal (T5).',
+    );
+    expect(pageWords('Reported: T5 egg at north\\_hills \\`x\\`.', ZONE, NOW)).toBe(
+      'Reported: T5 egg at north_hills `x`.',
+    );
+  });
+
+  it('takes out the code span and bold around text that ends in a backslash a member typed', () => {
+    // `plain` writes a typed backslash as `\\`: the backtick or asterisks after it are the bot's.
+    expect(pageWords('Your group is `north\\\\`; its gym is **a\\\\**.', ZONE, NOW)).toBe(
+      'Your group is north\\; its gym is a\\.',
+    );
+  });
+});
diff --git a/src/web/page-words.ts b/src/web/page-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d9a7100a875321ba83d27fb51d76b6e365731145
--- /dev/null
+++ b/src/web/page-words.ts
@@ -0,0 +1,26 @@
+import { clockTime } from '../domain/web/clock.js';
+import { unplain } from '../render/text.js';
+
+/** A timestamp of Discord's (`<t:1760000000:t>`), which a page cannot show. */
+const TIMESTAMP = /<t:(-?\d+)(?::[tTdDfFR])?>/gu;
+
+/**
+ * An escape (`\_`, `\\`: what members wrote is escaped), or the bot's own markdown: code spans
+ * and bold. Read in one pass from the left, so that the backtick after a typed backslash (`\\`)
+ * is the bot's and not escaped by it.
+ */
+const ESCAPE_OR_MARKDOWN = /\\.|`|\*\*/gsu;
+
+/**
+ * The words of a command as the live map shows them, as plain text (plan 8M-4): Discord's
+ * timestamps as clock times in the posts' zone (`clockTime`, as the page writes times), the
+ * bot's own markdown taken out (escapes kept as they are), then the escapes of what members and
+ * feeds wrote undone (`unplain`). Pure.
+ */
+export function pageWords(text: string, zone: string, now: number): string {
+  return unplain(
+    text
+      .replace(TIMESTAMP, (_stamp, seconds: string) => clockTime(Number(seconds) * 1000, zone, now))
+      .replace(ESCAPE_OR_MARKDOWN, (match) => (match.startsWith('\\') ? match : '')),
+  );
+}
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 64635c85e120e24800095582e88dd18c5ccae1d7..be5d3ca7028eafbdd41ec8b76258a68c81f3c09e 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -9,8 +9,7 @@ import {
 } from '../commands/parties/reply.js';
 import type { MemberStanding } from '../discord/member-directory.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
-import { controlThrottleKey } from '../discord/router.js';
-import { waitText, type Throttles } from '../discord/throttle.js';
+import type { Throttles } from '../discord/throttle.js';
 import { isGroupId, type GroupId, type Party, type RaidParty } from '../domain/party/party.js';
 import { MAP_ACTIONS, type MapAction, type PressAnswer } from '../domain/web/party-data.js';
 import { partyView, type PartyViewInput, type RaidLook } from '../domain/web/party-view.js';
@@ -21,12 +20,12 @@ import type {
   AttendanceService,
   Member,
 } from '../services/attendance-service.js';
+import { actingOnTheMap, throttledOnTheMap, UNREACHABLE } from './acting.js';
 import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
 import { PartyViewers } from './party-viewers.js';
-import { countsOnTheMap } from './map-members.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
 
@@ -86,16 +85,6 @@ export interface ActingMembers {
 /** The presses one address may send in a minute, whoever sends them. */
 export const PRESSES_PER_ADDRESS_MINUTE = 60;
 
-/** What a press answers while Discord cannot say who presses. */
-const UNREACHABLE =
-  'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.';
-
-/** What a press answers a member who may not act in the server now. */
-const HELD_BACK: Readonly<Record<'timed-out' | 'pending', string>> = {
-  'timed-out': 'You are timed out in this server, so you cannot do that now.',
-  pending: "Finish this server's membership screening first.",
-};
-
 /** The body of a press: the group of "Join B", only with `join`. Anything else is malformed. */
 const pressBodySchema = z
   .object({
@@ -243,29 +232,10 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
       }
       const press = statusPress(action, group);
       const { userId } = session;
-      const unreachable = (err: unknown) => {
-        deps.log.warn(
-          { err, guild, user: userId },
-          'could not ask Discord who pressed a button of a party on the web pages',
-        );
-        return reply.code(503).send({ error: UNREACHABLE });
-      };
-      // The member directory first (kept a minute, also "not a member"), so that somebody who
-      // is not a member costs no fetch from Discord; then the member fetched fresh.
-      let acting: ActingAnswer;
-      try {
-        if (!(await deps.members.find(guild, userId))) return sendFailure(request, reply, 403);
-        acting = await parties.acting.acting(guild, userId);
-      } catch (err) {
-        return unreachable(err);
-      }
-      // Not a member, or one without the map's member role (as Discord has them now): whatever
-      // the party, nothing is said of it.
-      if (acting.kind === 'not-member') return sendFailure(request, reply, 403);
-      if (acting.kind === 'member' && !countsOnTheMap(acting.standing, deps.settings.memberRole)) {
-        return sendFailure(request, reply, 403);
-      }
-      if (acting.kind !== 'member') return reply.code(403).send({ error: HELD_BACK[acting.kind] });
+      const doing = 'pressed a button of a party';
+      // Whoever is no member, by the directory or fresh, learns nothing of the party.
+      const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+      if ('sent' in acting) return acting.sent;
       const { member } = acting;
       // The party as the store has it: one that ended is not there (nor read from anywhere).
       const own = await ownParties(guild);
@@ -282,22 +252,22 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
             ? undefined
             : await parties.forums.memberAccess(party.forumChannelId, userId);
       } catch (err) {
-        return unreachable(err);
+        deps.log.warn(
+          { err, guild, user: userId },
+          `could not ask Discord who ${doing} on the web pages`,
+        );
+        return reply.code(503).send({ error: UNREACHABLE });
       }
       // Kept out of the forum on purpose: `AccessService` would not let them in.
       if (access === 'barred') return sendFailure(request, reply, 403);
-      const wait = parties.throttles.use(
-        controlThrottleKey(PARTY_KIND),
+      const throttled = throttledOnTheMap(
+        deps,
+        reply,
+        { control: PARTY_KIND },
         userId,
         ACTION_THROTTLE,
-        deps.now(),
       );
-      if (wait !== undefined) {
-        return reply
-          .code(429)
-          .header('retry-after', String(wait))
-          .send({ error: `That was a lot of clicks. Try again in ${waitText(wait)}.` });
-      }
+      if (throttled) return throttled;
       const { kind, said } = await pressStatus(
         parties.attendance,
         partyId,
diff --git a/src/web/raid-report.test.ts b/src/web/raid-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2a964e4d5fbad96f8d2e76295adfbed3ac728330
--- /dev/null
+++ b/src/web/raid-report.test.ts
@@ -0,0 +1,325 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID, fakeChatInput, sent } from '../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { textOf } from '../../test/support/messages.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, at, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { partyServiceWith } from '../../test/support/party-service.js';
+import { gymsFixture } from '../../test/support/providers.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { MemoryUsers } from '../../test/support/users.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  raidWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { raid, raidControls } from '../commands/raids/raid.js';
+import { RAID_COMMAND, RAID_THROTTLE } from '../commands/raids/report.js';
+import type { UserSettings } from '../db/repositories/user-repository.js';
+import { InteractionRouter } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { PartyStatus, RaidPrivacy } from '../domain/party/status.js';
+import type { RaidAnswer } from '../domain/web/raid-options-data.js';
+import type { GymProvider } from '../services/gym-directory.js';
+
+const REPORT = `/s/${FAKE_GUILD_ID}/api/raids`;
+const HATCH = at('2026-10-13T14:30');
+
+/** The invented gyms, with the bridge (gym 4) lying in West and in East as well. */
+function gymsWithBridgeInBoth(): GymProvider {
+  const base = gymsFixture();
+  return Object.assign(Object.create(base) as GymProvider, {
+    regionsOf: (gymId: number) =>
+      gymId === 4 ? [WEST_CHANNEL, EAST_CHANNEL] : base.regionsOf(gymId),
+  });
+}
+
+/**
+ * The map of a server with the party services of a test and none of its raids yet: Alice a
+ * member (in the directory, and fetched fresh as `Alice` of team valor), the clock the parties'
+ * own; `settings` what members set (`MemoryUsers`); `gyms` the gyms of the services and the
+ * context alike.
+ */
+async function reporting(
+  options: {
+    throttles?: Throttles;
+    settings?: Map<string, Partial<UserSettings>>;
+    gyms?: GymProvider;
+    /** The names of channels as the bot sees them (West and East by default). */
+    channelNames?: Map<string, string>;
+  } = {},
+) {
+  const throttles = options.throttles ?? new Throttles();
+  const made = await partyServiceWith([], options.gyms ? { gyms: options.gyms } : {});
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    raids: made.raids,
+    parties: made.store,
+    regions: made.regions,
+    users: new MemoryUsers(options.settings),
+    ...(options.gyms ? { gyms: options.gyms } : {}),
+  });
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'valor').add(BOB, 'Bob');
+  const names =
+    options.channelNames ??
+    new Map([
+      [WEST_CHANNEL, 'west'],
+      [EAST_CHANNEL, 'east'],
+    ]);
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    raids: raidWebWith(ctx, { channelName: (id) => names.get(id) }),
+  });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const report = async (body: unknown, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: REPORT,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<RaidAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  return { made, ctx, web, acting, members, headers, report, throttles };
+}
+
+describe('reporting a raid on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    vi.useRealTimers();
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("reports an egg picked from the list as /raid does: as the member, its hatch time in minutes, the command's words and the raid as the map shows it", async () => {
+    const map = await reporting();
+    web = map.web;
+    const told = vi.spyOn(map.made.notify, 'raidReported');
+    const answer = await map.report({ gym: 1, boss: 'e:T5:0', time: '30' });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      ok: true,
+      text: 'Reported: T5 egg at The Stacks.',
+      raid: { kind: 'raid', gymId: 1, tier: 'Level 5 raid', stage: 'egg', hatchTime: HATCH },
+    });
+    const [party] = map.made.store.active();
+    expect(party).toMatchObject({ gymId: 1, createdById: ALICE, anonymous: false });
+    expect(party?.attendees[ALICE]).toMatchObject({
+      status: PartyStatus.Interested,
+      name: 'Alice',
+      team: 'valor',
+    });
+    expect(answer.json.raid?.id).toBe(party?.id);
+    const posts = map.made.gateway.postsIn(WEST_FORUM);
+    expect(posts).toHaveLength(1);
+    expect(textOf(posts[0]?.message)).toContain('Reported by **Alice**');
+    // Whoever wants the raid is told, as of a report with /raid.
+    expect(told).toHaveBeenCalledWith(expect.objectContaining({ id: party?.id }), ALICE);
+  });
+
+  it("reports a boss with a typed end time, and the member's privacy keeps them out of the post", async () => {
+    const map = await reporting({
+      settings: new Map([
+        [ALICE, { raidPrivacy: RaidPrivacy.Anonymous, autoStatus: PartyStatus.NotInterested }],
+      ]),
+    });
+    web = map.web;
+    const answer = await map.report({ gym: 2, boss: 'yveltal', time: 'at 2:40pm' });
+    expect(answer.json).toMatchObject({
+      ok: true,
+      text: 'Reported: Yveltal (T5) at Old Stone Fountain.',
+    });
+    expect(map.made.store.active()[0]).toMatchObject({
+      gymId: 2,
+      endTime: at('2026-10-13T14:40'),
+      anonymous: true,
+      raid: { boss: { key: 'yveltal' }, reportedHatched: true },
+    });
+    // Neither as the reporter nor in the list (not signed up by their automatic status).
+    const [post] = map.made.gateway.postsIn(WEST_FORUM);
+    expect(post).toBeDefined();
+    expect(textOf(post?.message)).not.toContain('Reported by');
+    expect(JSON.stringify(post?.message)).not.toContain('Alice');
+    expect(JSON.stringify(post?.message)).not.toContain(ALICE);
+  });
+
+  it("refuses a time the raid cannot have, and a boss it cannot read, in the command's words as text", async () => {
+    const map = await reporting();
+    web = map.web;
+    const late = await map.report({ gym: 1, boss: 'e:T5:0', time: '5pm' });
+    expect(late.status).toBe(422);
+    expect(late.json).toEqual({
+      ok: false,
+      text: '"5pm" cannot be the time the egg hatches: it must be between 1:15 PM and 3:00 PM.',
+    });
+    const unknown = await map.report({ gym: 1, boss: 'zzzz' });
+    expect(unknown.json.text).toMatch(
+      /^I do not know a raid boss or tier called "zzzz"\. .* t5 for/,
+    );
+    expect(map.made.store.active()).toEqual([]);
+  });
+
+  it('answers a raid already at the gym with that raid, so that the page can open it', async () => {
+    const map = await reporting();
+    web = map.web;
+    const first = await map.report({ gym: 1, boss: 'e:T5:0' });
+    const again = await map.web.app.inject({
+      method: 'POST',
+      url: REPORT,
+      headers: { ...(await map.web.posting(BOB, 'Bob')), 'content-type': 'application/json' },
+      payload: JSON.stringify({ gym: 1, boss: 'e:T5:0' }),
+    });
+    expect(again.statusCode).toBe(409);
+    expect(again.json<RaidAnswer>()).toMatchObject({
+      ok: false,
+      text: 'There is already a raid at The Stacks. You have been marked as interested.',
+      raid: { id: first.json.raid?.id },
+    });
+    expect(map.made.store.active()).toHaveLength(1);
+  });
+
+  it('asks which region of a gym that lies in several, and reports into the one picked', async () => {
+    const map = await reporting({ gyms: gymsWithBridgeInBoth() });
+    web = map.web;
+    const asked = await map.report({ gym: 4, boss: 'e:T5:0' });
+    expect(asked.status).toBe(422);
+    expect(asked.json).toEqual({
+      ok: false,
+      text: 'This gym lies in several regions: pick the one to report the raid in.',
+      regions: [
+        { id: 1, name: 'west' },
+        { id: 2, name: 'east' },
+      ],
+    });
+    expect(map.made.store.active()).toEqual([]);
+    const east = await map.report({ gym: 4, region: 2, boss: 'e:T5:0' });
+    expect(east.status).toBe(200);
+    expect(map.made.store.active()[0]).toMatchObject({ gymId: 4, regionId: 2 });
+  });
+
+  it('says where the raid was posted when the region picked has no forum', async () => {
+    const map = await reporting({ gyms: gymsWithBridgeInBoth() });
+    web = map.web;
+    await map.made.regions.setForum(1, null);
+    const answer = await map.report({ gym: 4, region: 1, boss: 'e:T5:0' });
+    expect(answer.status).toBe(200);
+    expect(answer.json.text).toBe(
+      'Reported: T5 egg at Veterans Memorial Bridge. It was posted in #east.',
+    );
+    expect(map.made.store.active()[0]).toMatchObject({ gymId: 4, regionId: 2 });
+  });
+
+  it('names a region whose channel the bot does not see by its number, in the list and in the words', async () => {
+    const map = await reporting({ gyms: gymsWithBridgeInBoth(), channelNames: new Map() });
+    web = map.web;
+    expect((await map.report({ gym: 4, boss: 'e:T5:0' })).json.regions).toEqual([
+      { id: 1, name: 'Region 1' },
+      { id: 2, name: 'Region 2' },
+    ]);
+    await map.made.regions.setForum(1, null);
+    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).json.text).toBe(
+      'The region Region 1 has no raid forum yet. A moderator can create it with /admin setup-forums.',
+    );
+    expect((await map.report({ gym: 4, region: 1, boss: 'e:T5:0' })).json.text).toBe(
+      'Reported: T5 egg at Veterans Memorial Bridge. It was posted in Region 2.',
+    );
+  });
+
+  it('refuses a report at a gym whose raid stands in a forum the member is kept out of, before anything is counted', async () => {
+    const throttles = new Throttles();
+    const map = await reporting({ throttles, gyms: gymsWithBridgeInBoth() });
+    web = map.web;
+    const bob = await map.report(
+      { gym: 4, region: 2, boss: 'e:T5:0' },
+      await map.web.posting(BOB, 'Bob'),
+    );
+    expect(bob.status).toBe(200);
+    expect(throttles.size).toBe(1);
+    map.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+    // West, which Alice may see, would take a new raid; but the one there is in East.
+    const refused = await map.report({ gym: 4, region: 1, boss: 'e:T5:0' });
+    expect(refused.status).toBe(403);
+    const [party] = map.made.store.active();
+    expect(map.made.store.active()).toHaveLength(1);
+    expect(party?.attendees[ALICE]).toBeUndefined();
+    expect(throttles.size).toBe(1);
+  });
+
+  it('shares the limit of /raid: a report on the map counts, and /raid is refused after it', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < RAID_THROTTLE.uses - 1; n++) {
+      throttles.use(RAID_COMMAND, ALICE, RAID_THROTTLE, PARTY_NOW);
+    }
+    const map = await reporting({ throttles });
+    web = map.web;
+    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(200);
+    const over = await map.report({ gym: 2, boss: 'e:T5:0' });
+    expect(over.status).toBe(429);
+    expect(over.json).toEqual({ error: 'You can use /raid again in 15 minutes.' });
+    expect(over.headers['retry-after']).toBe('900');
+    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+    const router = new InteractionRouter(map.ctx, [raid], [raidControls], {
+      throttles,
+      now: () => PARTY_NOW,
+    });
+    const used = fakeChatInput({
+      commandName: 'raid',
+      channelId: WEST_CHANNEL,
+      userId: ALICE,
+      options: { boss: 'e:T5:0', gym: 'g:2' },
+    });
+    await router.handle(used as never);
+    expect(sent(used.reply).content).toBe('You can use /raid again in 15 minutes.');
+  });
+
+  it('refuses before anything is counted: a gym of no region of the server, a forum the member is kept out of, somebody not a member', async () => {
+    const throttles = new Throttles();
+    const map = await reporting({ throttles });
+    web = map.web;
+    expect((await map.report({ gym: 10, boss: 'e:T5:0' })).status).toBe(404);
+    expect((await map.report({ gym: 999, boss: 'e:T5:0' })).status).toBe(404);
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(403);
+    map.acting.holdBack(ALICE, 'timed-out');
+    expect((await map.report({ gym: 2, boss: 'e:T5:0' })).json).toEqual({
+      error: 'You are timed out in this server, so you cannot do that now.',
+    });
+    map.acting.remove(ALICE);
+    expect((await map.report({ gym: 2, boss: 'e:T5:0' })).status).toBe(403);
+    expect(throttles.size).toBe(0);
+    expect(map.made.store.active()).toEqual([]);
+  });
+
+  it('refuses a malformed body, and a request without the CSRF token, before reading it', async () => {
+    const map = await reporting();
+    web = map.web;
+    expect((await map.report({ gym: '1', boss: 'e:T5:0' })).status).toBe(400);
+    expect((await map.report({ gym: 1, boss: 'e:T5:0', extra: true })).status).toBe(400);
+    expect((await map.report({ gym: 1, boss: 'x'.repeat(101) })).status).toBe(400);
+    const { 'x-pine-csrf': _token, ...withoutToken } = map.headers;
+    expect((await map.report({ gym: 1, boss: 'e:T5:0' }, withoutToken)).status).toBe(403);
+    expect(map.made.store.active()).toEqual([]);
+  });
+
+  it('logs a report as a command is logged: who, where, which gym, what came of it; never a text', async () => {
+    const map = await reporting();
+    web = map.web;
+    const answer = await map.report({ gym: 1, boss: 'e:T5:0', time: '30' });
+    const logged = map.web.entries.find((entry) => entry.msg === 'a raid was reported on the map');
+    expect(logged).toMatchObject({ user: ALICE, guild: FAKE_GUILD_ID, gym: 1, outcome: 'created' });
+    const everything = JSON.stringify(map.web.entries);
+    for (const text of [answer.json.text, 'The Stacks', 'e:T5:0', 'Alice']) {
+      expect(everything).not.toContain(text);
+    }
+  });
+});
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 2b3da2f92ba66927ffd7169fd645f2a70b8d4736..1a28a8e5c6394116dadcb79aeda2d1d4b19e1a44 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -1,10 +1,30 @@
-import type { FastifyInstance } from 'fastify';
+import type { FastifyInstance, FastifyReply } from 'fastify';
+import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
 import type { RaidChanging } from '../commands/raids/raid-changes.js';
-import type { RaidReporting } from '../commands/raids/report.js';
+import { reportedBoss, reportedTime, type ReportedBoss } from '../commands/raids/raid-input.js';
+import {
+  RAID_COMMAND,
+  RAID_THROTTLE,
+  reportRaidAs,
+  reportWords,
+  type RaidReporting,
+  type ReportNames,
+} from '../commands/raids/report.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import { UserError } from '../discord/errors.js';
+import type { MemberAccess } from '../discord/party-gateway.js';
+import { isRaid, type RaidParty } from '../domain/party/party.js';
+import type { MapRaid } from '../domain/web/party-data.js';
+import { mapParty } from '../domain/web/party-view.js';
+import type { RaidAnswer } from '../domain/web/raid-options-data.js';
+import { gymRegionsInGuild } from '../services/region-directory.js';
+import { actingOnTheMap, throttledOnTheMap, UNREACHABLE } from './acting.js';
 import { sendFailure } from './answers.js';
+import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
+import { pageWords } from './page-words.js';
 import { raidOptions } from './raid-options.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
@@ -12,6 +32,9 @@ import type { WebDeps } from './server.js';
 /** The requests for the pick lists one address may make in a minute (a form asks once). */
 const OPTIONS_PER_MINUTE = 30;
 
+/** The reports and changes of raids one address may send in a minute, whoever sends them. */
+export const RAID_WRITES_PER_ADDRESS_MINUTE = 30;
+
 /**
  * What reporting and changing raids on the map read and call (plan 8M-4): exactly what `/raid`,
  * `/hatch`, `/end`, `/boss` and `/moveset` use (the readers' sources, the members' settings, the
@@ -22,15 +45,104 @@ export type RaidWebContext = RaidChanging & RaidReporting & Pick<AppContext, 'gy
 /** What the raids of the live map need beyond the parties' own (`PartyWebDeps`). */
 export interface RaidWebDeps {
   ctx: RaidWebContext;
+  /** A channel's name as the bot sees it now: a region's, which an answer names. */
+  channelName(channelId: string): string | undefined;
 }
 
+/**
+ * The body of a report: the gym (by id, as `/api/geo` lists it), the region when the gym lies in
+ * several, the boss or egg as `/raid` takes it (a value of the pick list, or typed), and the time
+ * as `/raid` takes it (minutes from now, or a clock time). Anything else is malformed.
+ */
+const reportBodySchema = z
+  .object({
+    gym: z.number().int().positive(),
+    region: z.number().int().positive().optional(),
+    boss: z.string().trim().min(1).max(100),
+    time: z.string().max(40).optional(),
+  })
+  .strict();
+
+/** What a report answers for a gym that lies in several regions without one picked. */
+export const SEVERAL_REGIONS =
+  'This gym lies in several regions: pick the one to report the raid in.';
+
+/** The status of each outcome of a report. */
+const REPORT_STATUS = {
+  created: 200,
+  exists: 409,
+  'gym-gone': 422,
+  'no-region': 422,
+  'no-forum': 422,
+  'no-post': 422,
+} as const;
+
 /**
  * The raids of the live map (spec 3.5, 3.6): the pick lists of a report for members of the server
  * (`/s/<guild>/api/raid-options`: `raidOptions`, an ETag of its JSON, `private, no-cache`, 304
- * when the page has it).
+ * when the page has it), and a report (`POST /s/<guild>/api/raids`), which is `/raid` as the
+ * member: the same reader, the same report, the same throttle, the command's words.
  */
 export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
-  const { sessions, raids } = deps;
+  const { sessions, raids, parties } = deps;
+  const { ctx } = raids;
+
+  /** The words of a command as text of the page, in the posts' zone. */
+  const words = (text: string): string => pageWords(text, parties.zone, deps.now());
+
+  /** A region as an answer names it: its channel's name, or its number where the bot sees none. */
+  const regionName = (region: Pick<Region, 'id' | 'channelId'>): string =>
+    raids.channelName(region.channelId) ?? `Region ${region.id}`;
+
+  /** A region in a sentence: `#west` as its channel reads, else `Region 5` (`regionName`). */
+  const regionInWords = (region: Pick<Region, 'id' | 'channelId'>): string =>
+    raids.channelName(region.channelId) === undefined
+      ? regionName(region)
+      : `#${regionName(region)}`;
+
+  /** How the map's answers name a post (not at all: the page opens the raid) and a region. */
+  const names: ReportNames = {
+    post: () => undefined,
+    channel: (channelId) => {
+      const region = ctx.regions.byChannel(channelId);
+      return region ? regionInWords(region) : `#${raids.channelName(channelId) ?? 'unknown'}`;
+    },
+  };
+
+  /** How the member stands to a forum; rejects while Discord cannot say. */
+  const accessTo = (forumId: string | null, userId: string): Promise<MemberAccess | undefined> =>
+    forumId === null ? Promise.resolve(undefined) : parties.forums.memberAccess(forumId, userId);
+
+  /** A raid as the member sees it on the map now (`mapParty`): none without its post yet. */
+  const viewOf = (
+    guildId: string,
+    guildRow: number,
+    party: RaidParty,
+    userId: string,
+  ): MapRaid | undefined => {
+    const shown = mapParty(party, {
+      guildId,
+      guildRow,
+      parties: [],
+      memberId: userId,
+      barred: new Set(),
+      now: deps.now(),
+      zone: parties.zone,
+      readOnly: false,
+      look: (raid) => parties.look(raid),
+      pictureOrigins: deps.pictureOrigins,
+    });
+    return shown?.kind === 'raid' ? shown : undefined;
+  };
+
+  /** Discord could not say how the member stands to a forum: nothing is written. */
+  const unreachable = (reply: FastifyReply, err: unknown, guild: string, userId: string) => {
+    deps.log.warn(
+      { err, guild, user: userId },
+      'could not ask Discord who reported a raid on the web pages',
+    );
+    return reply.code(503).send({ error: UNREACHABLE });
+  };
 
   const optionsLimiter = new RateLimiter({ uses: OPTIONS_PER_MINUTE, perMs: 60_000 });
   scope.get(
@@ -50,11 +162,137 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
         );
         return sendFailure(request, reply, 503);
       }
-      const body = JSON.stringify(raidOptions(raids.ctx.raidBosses.bosses(), deps.parties.zone));
+      const body = JSON.stringify(raidOptions(ctx.raidBosses.bosses(), parties.zone));
       const etag = etagOf(body);
       void reply.header('etag', etag);
       if (etagMatches(request.headers['if-none-match'], etag)) return reply.code(304).send();
       return reply.type('application/json; charset=utf-8').send(body);
     },
   );
+
+  // A report (spec 3.6): before the body is read (`onRequest`), at most
+  // `RAID_WRITES_PER_ADDRESS_MINUTE` from one address and the guard of every POST (Origin,
+  // session, CSRF token). Then who reports (`actingOnTheMap`), the gym (one of a region of this
+  // server, else 404: nobody learns of other servers' gyms), the region when it lies in several
+  // (asked for with the regions), how the member stands to the forum the raid would go to and to
+  // that of a raid already at the gym, which the report would join (barred 403, as
+  // `AccessService` would not let them in), and only then `/raid`'s throttle in
+  // its own window, so that a report refused for who reports or where is not counted; then
+  // `/raid`'s reader and report as the member (`reportRaidAs`), and the command's words.
+  const writeLimiter = new RateLimiter({ uses: RAID_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const writeGuards = [
+    limitedPerAddress(writeLimiter, { now: deps.now }),
+    postGuard(sessions, deps.settings.publicUrl),
+  ];
+  scope.post('/api/raids', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return sendFailure(request, reply, 403);
+    const body = reportBodySchema.safeParse(request.body ?? {});
+    if (!body.success) return sendFailure(request, reply, 400);
+    const { guild } = request.params;
+    const { userId } = session;
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, 'reported a raid');
+    if ('sent' in acting) return acting.sent;
+    const row = await parties.guilds.idFor(guild);
+    const gym = ctx.gyms.get(body.data.gym);
+    const lying =
+      gym === undefined || row === undefined
+        ? []
+        : gymRegionsInGuild(ctx.gyms, ctx.regions, gym.id, row);
+    const [first] = lying;
+    if (gym === undefined || row === undefined || first === undefined) {
+      return sendFailure(request, reply, 404);
+    }
+    const picked =
+      lying.length === 1 ? first : lying.find((region) => region.id === body.data.region);
+    if (picked === undefined) {
+      const ask: RaidAnswer = {
+        ok: false,
+        text: SEVERAL_REGIONS,
+        regions: lying.map((region) => ({ id: region.id, name: regionName(region) })),
+      };
+      return reply.code(422).send(ask);
+    }
+    const regionChannelId = picked.channelId;
+    const forum = ctx.partyService.regionFor(gym, regionChannelId).region?.forumChannelId ?? null;
+    // A report joins a raid already at the gym, which may stand in another forum of the server:
+    // refused too when the member is kept out of that one.
+    const standing = new Set(
+      parties.store
+        .active()
+        .filter(
+          (party) =>
+            party.guildId === row &&
+            isRaid(party) &&
+            party.gymId === gym.id &&
+            party.forumChannelId !== forum,
+        )
+        .map((party) => party.forumChannelId),
+    );
+    try {
+      for (const forumId of [forum, ...standing]) {
+        if ((await accessTo(forumId, userId)) === 'barred') return sendFailure(request, reply, 403);
+      }
+    } catch (err) {
+      return unreachable(reply, err, guild, userId);
+    }
+    const throttled = throttledOnTheMap(
+      deps,
+      reply,
+      { command: RAID_COMMAND },
+      userId,
+      RAID_THROTTLE,
+    );
+    if (throttled) return throttled;
+    let reported: ReportedBoss;
+    let time: ReturnType<typeof reportedTime>;
+    try {
+      reported = reportedBoss(ctx, body.data.boss);
+      time = reportedTime(ctx, reported, body.data.time ?? null, deps.now());
+    } catch (err) {
+      if (!(err instanceof UserError)) throw err;
+      const refused: RaidAnswer = { ok: false, text: words(err.message) };
+      return reply.code(422).send(refused);
+    }
+    const result = await reportRaidAs(ctx, acting.member, gym, {
+      reported,
+      time,
+      regionChannelId,
+    });
+    const { outcome } = result;
+    let raid: MapRaid | undefined;
+    if (outcome.kind === 'created' || outcome.kind === 'exists') {
+      // A raid already there may be in another forum of the server: shown only when the
+      // member is not kept out of it.
+      let shown = outcome.party.forumChannelId === forum;
+      if (!shown) {
+        try {
+          shown = (await accessTo(outcome.party.forumChannelId, userId)) !== 'barred';
+        } catch {
+          shown = false;
+        }
+      }
+      if (shown) raid = viewOf(guild, row, outcome.party, userId);
+    }
+    deps.log.info(
+      { user: userId, guild, gym: gym.id, outcome: outcome.kind },
+      'a raid was reported on the map',
+    );
+    // The region picked has no forum: the raid went to another region of the gym, said by name.
+    const postedIn =
+      outcome.kind === 'created' &&
+      outcome.party.regionId !== null &&
+      outcome.party.regionId !== picked.id
+        ? ctx.regions.byId(outcome.party.regionId)
+        : undefined;
+    const answer: RaidAnswer = {
+      ok: outcome.kind === 'created',
+      text:
+        words(reportWords(result, gym, reported.label, names)) +
+        (postedIn ? ` It was posted in ${regionInWords(postedIn)}.` : ''),
+      ...(raid ? { raid } : {}),
+    };
+    return reply.code(REPORT_STATUS[outcome.kind]).send(answer);
+  });
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index 249a95601d52a14aa022c3afa4dfc6ddc92dc806..7969826c97840b3db9cf3dae49d6cb0f61e9c8ae 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -253,10 +253,13 @@ export function partyWebWith(
 /**
  * Reporting and changing raids on the map over a test's context (`createTestContext`, with the
  * party services of `partyServiceWith` for a report or a change), as the bot wires it. Pass as
- * `raids`.
+ * `raids`. `channelName` names the channels the bot sees (none by default).
  */
-export function raidWebWith(ctx: RaidWebContext): RaidWebDeps {
-  return { ctx };
+export function raidWebWith(
+  ctx: RaidWebContext,
+  options: Partial<Omit<RaidWebDeps, 'ctx'>> = {},
+): RaidWebDeps {
+  return { ctx, channelName: () => undefined, ...options };
 }
 
 /** No raids can be reported or changed: a test that does passes `raidWebWith`. */
@@ -267,6 +270,7 @@ const NO_RAIDS: RaidWebDeps = {
       throw new Error('no raids in this test: give raidWebWith');
     },
   }),
+  channelName: () => undefined,
 };
 
 /** The web settings of the tests: a public address of its own, OpenStreetMap's tiles. */
````

### Task 4: Map: change a raid

Prototype commit: `e0517b453570c079a0a08a1b388e4bff3b8484d2`

`POST /s/<guild>/api/raids/<id>/<change>` (hatch, end, boss, moves) and `GET …/moves`: the member checks, an active raid of this server (never read by id from the database), its forum not barred, signed up or staff (`mayChange` in 8M-3's view), then the command's own throttle and the shared change; the command's words.

**Files:**

```
 src/app.ts                          |   1 +
 src/domain/web/party-data.ts        |   5 ++
 src/domain/web/party-view.test.ts   |  15 ++++-
 src/domain/web/party-view.ts        |  12 ++++
 src/domain/web/raid-options-data.ts |  20 ++++++
 src/web/acting.ts                   |  14 ++++
 src/web/client/parties.test.ts      |   1 +
 src/web/party-routes.ts             |   7 +-
 src/web/party-viewers.ts            |  18 ++++--
 src/web/raid-change.test.ts         | 265 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/raid-routes.ts              | 261 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 test/support/web.ts                 |   6 ++
 12 files changed, 599 insertions(+), 26 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/parties.test.ts src/web/raid-change.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/raid-options-data.ts src/web/acting.ts src/web/client/parties.test.ts src/web/party-routes.ts src/web/party-viewers.ts src/web/raid-change.test.ts src/web/raid-routes.ts test/support/web.ts` and `npx eslint src/app.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/raid-options-data.ts src/web/acting.ts src/web/client/parties.test.ts src/web/party-routes.ts src/web/party-viewers.ts src/web/raid-change.test.ts src/web/raid-routes.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff e0517b453570c079a0a08a1b388e4bff3b8484d2 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Map: change a raid`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/raid-options-data.ts src/web/acting.ts src/web/client/parties.test.ts src/web/party-routes.ts src/web/party-viewers.ts src/web/raid-change.test.ts src/web/raid-routes.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index c663fda1787bca29c9872998930cb66afd121046..041361706fa675fbfd330e4721b3856ea25e4090 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -834,6 +834,7 @@ export async function startApp(
         attendance,
         acting: new DiscordWebMembers(client),
         throttles,
+        ownerId: config.env.OWNER_ID,
       },
       // Reporting and changing raids on the map: what the raid commands read and call.
       raids: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 1a6aec805b007b57b05b4fcab0cd1f8823d2a87d..87d90a7b74a26a0af42329f0e8026e18cd89e23b 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -55,6 +55,11 @@ export interface MapRaid {
   endTime: number | null;
   /** The post on Discord (`https://discord.com/channels/…`, which opens the app). */
   link: string;
+  /**
+   * Whether the member may change its times, boss and moves on the map (signed up, or staff;
+   * plan 8M-4); never while read-only.
+   */
+  mayChange: boolean;
   attendance: MapAttendance;
 }
 
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 6816d6624d24c3059155a24fcd0c29afa6e8919c..6c60e2a8a64d90d160befa23832d9554416454ed 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -17,7 +17,7 @@ import {
 import type { Party, RaidParty } from '../party/party.js';
 import { setHatchTime } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
-import { mapParty, partyView, type PartyViewInput } from './party-view.js';
+import { mapParty, mayChangeRaid, partyView, type PartyViewInput } from './party-view.js';
 
 const GUILD = '412345678901234567';
 const EGG_PICTURE = 'https://raw.githubusercontent.com/PokeMiners/raid_egg_2_icon.png';
@@ -42,6 +42,7 @@ function input(parties: readonly Party[], more: Partial<PartyViewInput> = {}): P
     now: PARTY_NOW,
     zone: PARTY_ZONE,
     readOnly: false,
+    staff: false,
     // The renderer's (`raidLook`): the egg's picture until it hatches.
     look: (raid: RaidParty) => ({
       picture: raid.hatchTime !== null && PARTY_NOW < raid.hatchTime ? EGG_PICTURE : BOSS_PICTURE,
@@ -69,6 +70,7 @@ describe('partyView', () => {
         hatchTime: at('2026-10-13T14:30'),
         endTime: egg.endTime,
         link: `https://discord.com/channels/${GUILD}/700000000000000001`,
+        mayChange: false,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
           mine: null,
@@ -135,6 +137,17 @@ describe('partyView', () => {
     expect(view.raids[0]?.attendance.actions).toEqual([]);
   });
 
+  it('lets a member signed up for a raid, and staff, change it on the map; nobody while read-only', () => {
+    const signedUp = withAttendees(egg, { [ALICE]: { status: PartyStatus.Interested } });
+    expect(partyView(input([signedUp])).raids[0]?.mayChange).toBe(true);
+    expect(partyView(input([egg])).raids[0]?.mayChange).toBe(false);
+    expect(partyView(input([egg], { staff: true })).raids[0]?.mayChange).toBe(true);
+    expect(partyView(input([signedUp], { readOnly: true })).raids[0]?.mayChange).toBe(false);
+    expect(mayChangeRaid(signedUp, ALICE, false)).toBe(true);
+    expect(mayChangeRaid(egg, ALICE, false)).toBe(false);
+    expect(mayChangeRaid(egg, ALICE, true)).toBe(true);
+  });
+
   it('leaves out a picture from a host the page may not load', () => {
     const view = partyView(
       input([egg], { look: () => ({ picture: 'https://evil.example/x.png', boss: 'Yveltal' }) }),
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index ac4f169b1c77e7dafa37d6ac60b1938566d5d385..2fdb9af3221f2bac3cca57f2d03d77a774ba0aef 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -1,6 +1,7 @@
 import {
   attendeeOf,
   isRaid,
+  mayArrange,
   type Attendee,
   type MeetupParty,
   type Party,
@@ -55,6 +56,8 @@ export interface PartyViewInput {
   zone: string;
   /** Discord cannot be reached: nothing may be pressed. */
   readOnly: boolean;
+  /** Who asks is staff of the server (an admin, a moderator, the bot's owner): may change raids. */
+  staff: boolean;
   look(raid: RaidParty): RaidLook;
   /** The origins the page may load pictures from (`pictureOrigins`). */
   pictureOrigins: readonly string[];
@@ -130,6 +133,14 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
   return { groups, mine, actions };
 }
 
+/**
+ * Whether a member may change a raid on the map (spec 3.6: its times, boss and moves): one signed
+ * up for it (`mayArrange`), or staff.
+ */
+export function mayChangeRaid(party: RaidParty, memberId: string, staff: boolean): boolean {
+  return staff || mayArrange(party, memberId);
+}
+
 function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid | null {
   const stage = raidStage(party, input.now);
   if (stage === 'ended') return null;
@@ -145,6 +156,7 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
     hatchTime: party.hatchTime,
     endTime: party.endTime,
     link,
+    mayChange: !input.readOnly && mayChangeRaid(party, input.memberId, input.staff),
     attendance: attendanceOf(party, input, stage === 'hatched'),
   };
 }
diff --git a/src/domain/web/raid-options-data.ts b/src/domain/web/raid-options-data.ts
index f4f36600395f80aa4c10f62875fdd8a5ad836b60..724c67d242c2e09dcdcfa3ee727cf4f8dae4592e 100644
--- a/src/domain/web/raid-options-data.ts
+++ b/src/domain/web/raid-options-data.ts
@@ -19,6 +19,26 @@ export interface RaidAnswer {
   regions?: Array<{ id: number; name: string }>;
 }
 
+/**
+ * What the map may change of a raid (spec 3.6), each as its command does it: `/hatch`, `/end`,
+ * `/boss`, `/moveset`.
+ */
+export const RAID_CHANGES = ['hatch', 'end', 'boss', 'moves'] as const;
+export type RaidChange = (typeof RAID_CHANGES)[number];
+
+/** A move as `/moveset` offers it: its id (what a change of the moves sends) and its name. */
+export interface MoveOption {
+  id: string;
+  name: string;
+}
+
+/** The moves the boss of a raid can have (`GET /s/<guild>/api/raids/<id>/moves`). */
+export interface RaidMovesView {
+  boss: string;
+  fast: MoveOption[];
+  charged: MoveOption[];
+}
+
 /** A boss as `/raid` lists it: its value (`b:yveltal:T5:0`), name, and tier in the posts' words. */
 export interface BossOption {
   value: string;
diff --git a/src/web/acting.ts b/src/web/acting.ts
index eb7bc2adb342288f01127bd40d56857bc27786eb..650decdc6d72c766d65a1609346a078614605aeb 100644
--- a/src/web/acting.ts
+++ b/src/web/acting.ts
@@ -1,4 +1,5 @@
 import type { FastifyReply, FastifyRequest } from 'fastify';
+import { isManagement } from '../discord/guards.js';
 import type { MemberStanding } from '../discord/member-directory.js';
 import { controlThrottleKey } from '../discord/router.js';
 import { waitText, type Throttle } from '../discord/throttle.js';
@@ -63,6 +64,19 @@ export async function actingOnTheMap(
   return { member: acting.member, standing: acting.standing };
 }
 
+/**
+ * Whether a member is staff of the server on the map, as the commands' guards decide it
+ * (`isManagement`: an admin or a moderator by role, or the bot's owner): staff may change any
+ * raid (plan 8M-4). A member whose roles are not known has none.
+ */
+export function isMapStaff(
+  standing: MemberStanding | undefined,
+  userId: string,
+  ownerId: string,
+): boolean {
+  return isManagement(standing?.roleNames ?? [], userId, ownerId);
+}
+
 /**
  * Counts a write of the member in the router's window of a command (its name) or a control
  * (`controlThrottleKey`), as a use there counts: undefined when it may go on, or the answer sent
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 0b40cf690ff39da5b960cb117608ff65e44a9608..ccc113ac8614392f7e32d4b1846febe7ba265b2a 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -44,6 +44,7 @@ const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   hatchTime: NOW + 30 * MINUTE,
   endTime: NOW + 75 * MINUTE,
   link: LINK,
+  mayChange: false,
   attendance: attendance(),
   ...more,
 });
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index be5d3ca7028eafbdd41ec8b76258a68c81f3c09e..3a38855968bea93a747b3d1b8ddfa9feb100b4b5 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -20,7 +20,7 @@ import type {
   AttendanceService,
   Member,
 } from '../services/attendance-service.js';
-import { actingOnTheMap, throttledOnTheMap, UNREACHABLE } from './acting.js';
+import { actingOnTheMap, isMapStaff, throttledOnTheMap, UNREACHABLE } from './acting.js';
 import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
@@ -61,6 +61,8 @@ export interface PartyWebDeps {
    * in the same window as a click on the post (`ACTION_THROTTLE`).
    */
   throttles: Throttles;
+  /** `OWNER_ID`: the bot's owner is staff in every server, as the commands' guards have it. */
+  ownerId: string;
 }
 
 /**
@@ -149,7 +151,7 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
     guildId: string,
     own: { row: number; parties: readonly Party[] },
     memberId: string,
-    viewer: { readOnly: boolean; barred: Set<string> },
+    viewer: { readOnly: boolean; barred: Set<string>; standing: MemberStanding | undefined },
   ): PartyViewInput => ({
     guildId,
     guildRow: own.row,
@@ -159,6 +161,7 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
     now: deps.now(),
     zone: parties.zone,
     readOnly: viewer.readOnly,
+    staff: isMapStaff(viewer.standing, memberId, parties.ownerId),
     look: (raid) => parties.look(raid),
     pictureOrigins: deps.pictureOrigins,
   });
diff --git a/src/web/party-viewers.ts b/src/web/party-viewers.ts
index f2c7dc30e1fe54469cf96d44b11d841f0d52c538..a88db38613712689f9b7dcde6ef0e3eb232f9390 100644
--- a/src/web/party-viewers.ts
+++ b/src/web/party-viewers.ts
@@ -1,5 +1,5 @@
 import { BoundedMap } from '../bounded-map.js';
-import type { MemberDirectory } from '../discord/member-directory.js';
+import type { MemberDirectory, MemberStanding } from '../discord/member-directory.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
 import type { Logger } from '../log.js';
 
@@ -18,11 +18,18 @@ const KEPT = 10_000;
  * see); a member, with the forums somebody keeps them out of (their parties are not listed) and
  * whether the map is read-only (Discord could not be asked: what it said last is used); or
  * `unconfirmed`, Discord could not be asked and has not said lately that they are a member.
+ * A member's `standing` is what the directory said of their roles (undefined while read-only):
+ * whether they are staff, who may change any raid (plan 8M-4).
  */
 export type PartyViewer =
   | { kind: 'not-member' }
   | { kind: 'unconfirmed' }
-  | { kind: 'member'; readOnly: boolean; barred: Set<string> };
+  | {
+      kind: 'member';
+      readOnly: boolean;
+      barred: Set<string>;
+      standing: MemberStanding | undefined;
+    };
 
 export interface PartyViewersOptions {
   /** Whether somebody is a member of a server (kept a minute by the directory). */
@@ -56,11 +63,14 @@ export class PartyViewers {
     const { members, log, now } = this.options;
     const key = `${guildId}:${userId}`;
     let readOnly = false;
+    let standing: MemberStanding | undefined;
     try {
-      if ((await members.find(guildId, userId)) === undefined) {
+      const member = await members.find(guildId, userId);
+      if (member === undefined) {
         this.seen.delete(key);
         return { kind: 'not-member' };
       }
+      standing = member.standing;
       this.seen.set(key, now());
     } catch (err) {
       log.warn(
@@ -78,7 +88,7 @@ export class PartyViewers {
       if (answer.unreachable) readOnly = true;
       if (answer.barred) barred.add(forumId);
     }
-    return { kind: 'member', readOnly, barred };
+    return { kind: 'member', readOnly, barred, standing };
   }
 
   /**
diff --git a/src/web/raid-change.test.ts b/src/web/raid-change.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9b24d3dcf892daac350475169c77345852cca8f8
--- /dev/null
+++ b/src/web/raid-change.test.ts
@@ -0,0 +1,265 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, at, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  raidWebWith,
+  TEST_OWNER_ID,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { CHANGE_THROTTLE } from '../commands/raids/change.js';
+import { Throttles } from '../discord/throttle.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { RaidReport } from '../services/party-service.js';
+import type { PartiesView } from '../domain/web/party-data.js';
+import type { RaidAnswer, RaidMovesView } from '../domain/web/raid-options-data.js';
+
+const HATCH = at('2026-10-13T14:30');
+const END = at('2026-10-13T15:15');
+const change = (partyId: string, what: string) =>
+  `/s/${FAKE_GUILD_ID}/api/raids/${partyId}/${what}`;
+
+/**
+ * A raid of the party services of a test (`reportedRaid`) on the map, with Alice signed up for it
+ * (unless `signedUp` is false) and a member of the server, fetched fresh as `Alice`; Bob a member
+ * who is not signed up. The web server's clock is the parties' own.
+ */
+async function changing(
+  report: Partial<RaidReport> = {},
+  options: { signedUp?: boolean; throttles?: Throttles } = {},
+) {
+  const made = await reportedRaid(report);
+  if (options.signedUp !== false) {
+    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+  }
+  const throttles = options.throttles ?? new Throttles();
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    raids: made.raids,
+    parties: made.store,
+    regions: made.regions,
+  });
+  const members = new FakeMemberDirectory()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(TEST_OWNER_ID, 'Owner');
+  const acting = new FakeActingMembers()
+    .add(ALICE, 'Alice', 'mystic')
+    .add(BOB, 'Bob')
+    .add(TEST_OWNER_ID, 'Owner');
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    raids: raidWebWith(ctx),
+  });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const post = async (what: string, body: unknown, sent = headers, partyId = made.party.id) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: change(partyId, what),
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<RaidAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  const lines = async (): Promise<string[]> => {
+    await made.attendance.flush();
+    await made.service.flush();
+    return made.said().join('\n').split('\n').filter(Boolean);
+  };
+  return { made, ctx, web, acting, members, headers, post, lines, throttles };
+}
+
+describe('changing a raid on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("sets the hatch time as /hatch does: the line in the post, the command's words as text, the raid as it is now", async () => {
+    const map = await changing();
+    web = map.web;
+    const answer = await map.post('hatch', { time: '30' });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      ok: true,
+      text: 'Done. It hatches at 2:30 PM and ends at 3:15 PM.',
+      raid: { id: map.made.party.id, hatchTime: HATCH, endTime: END, mayChange: true },
+    });
+    expect(map.made.current().hatchTime).toBe(HATCH);
+    expect(await map.lines()).toContain(
+      `**Alice** (<@${ALICE}>) set the hatch time: <t:${HATCH / 1000}:t>.`,
+    );
+  });
+
+  it('sets the end time, the boss and the moves, each as its command', async () => {
+    const map = await changing();
+    web = map.web;
+    expect((await map.post('end', { time: '3:20pm' })).json.text).toBe(
+      'Done. It hatches at 2:35 PM and ends at 3:20 PM.',
+    );
+    expect((await map.post('boss', { boss: 'b:yveltal:T5:0' })).json.text).toBe(
+      'The boss is now Yveltal (T5).',
+    );
+    expect(
+      (await map.post('moves', { quick: 'SNARL_FAST', charge: 'dark pulse' })).json,
+    ).toMatchObject({
+      ok: true,
+      text: 'The moves are now Snarl / Dark Pulse.',
+    });
+    expect(map.made.current().raid).toMatchObject({
+      boss: { key: 'yveltal' },
+      fastMove: 'SNARL_FAST',
+      chargedMove: 'DARK_PULSE',
+    });
+  });
+
+  it("refuses what the commands' readers refuse, in their words as text, changing nothing", async () => {
+    const map = await changing();
+    web = map.web;
+    const late = await map.post('hatch', { time: '5pm' });
+    expect(late.status).toBe(422);
+    expect(late.json.text).toMatch(
+      /^"5pm" cannot be the time the egg hatches: it must be between \d+:\d\d [AP]M and 3:00 PM\.$/,
+    );
+    expect((await map.post('moves', { quick: 'snarl' })).json).toEqual({
+      ok: false,
+      text: 'This raid has no boss yet.',
+    });
+    expect((await map.post('moves', {})).json.text).toBe(
+      'Give the fast move, the charged move, or both.',
+    );
+    expect(map.made.current().hatchTime).toBeNull();
+  });
+
+  it('lets staff change a raid they are not signed up for, and refuses any other member who is not, without counting it', async () => {
+    const throttles = new Throttles();
+    const map = await changing({}, { signedUp: false, throttles });
+    web = map.web;
+    const refused = await map.post('hatch', { time: '30' });
+    expect(refused.status).toBe(403);
+    expect(refused.json.error).toBe(
+      'Only members signed up for this raid, and moderators, can change it here.',
+    );
+    expect(throttles.size).toBe(0);
+    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
+    expect((await map.post('hatch', { time: '30' }, owner)).status).toBe(200);
+    map.acting.add(BOB, 'Bob').standing(BOB, { roleNames: ['Moderator'], administrator: false });
+    const bob = await map.web.posting(BOB, 'Bob');
+    expect((await map.post('end', { time: '3:20pm' }, bob)).status).toBe(200);
+  });
+
+  it("answers a raid that is over, another server's or no raid at all as the post's buttons do: 409", async () => {
+    const map = await changing();
+    web = map.web;
+    await map.made.service.end(map.made.party.id);
+    expect((await map.post('hatch', { time: '30' })).json).toEqual({
+      ok: false,
+      text: 'This raid is over.',
+    });
+    const meetup = await map.made.service.createMeetup({
+      name: 'Picnic',
+      creatorId: ALICE,
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (meetup.kind !== 'created') throw new Error('no meetup');
+    const other = await map.post('boss', { boss: 't3' }, map.headers, meetup.party.id);
+    expect(other.status).toBe(409);
+    expect(other.json.text).toBe('This raid is over.');
+  });
+
+  it('counts against the limit of the command it is: ten changes a minute of /hatch, then 429', async () => {
+    const throttles = new Throttles();
+    for (let n = 0; n < CHANGE_THROTTLE.uses; n++) {
+      throttles.use('hatch', ALICE, CHANGE_THROTTLE, PARTY_NOW);
+    }
+    const map = await changing({}, { throttles });
+    web = map.web;
+    const over = await map.post('hatch', { time: '30' });
+    expect(over.status).toBe(429);
+    expect(over.json).toEqual({ error: 'You can use /hatch again in 1 minute.' });
+    // /boss has a window of its own.
+    expect((await map.post('boss', { boss: 't3' })).status).toBe(200);
+    for (let n = 0; n < CHANGE_THROTTLE.uses - 1; n++) {
+      throttles.use('moveset', ALICE, CHANGE_THROTTLE, PARTY_NOW);
+    }
+    await map.post('moves', { quick: 'snarl' });
+    expect((await map.post('moves', { quick: 'snarl' })).json.error).toBe(
+      'You can use /moveset again in 1 minute.',
+    );
+  });
+
+  it('refuses a member kept out of the forum, an unknown change and a malformed body', async () => {
+    const map = await changing();
+    web = map.web;
+    expect((await map.post('duration', { minutes: 30 })).status).toBe(404);
+    expect((await map.post('hatch', { time: 30 })).status).toBe(400);
+    expect((await map.post('boss', { boss: 't3', time: '30' })).status).toBe(400);
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.post('hatch', { time: '30' })).status).toBe(403);
+    expect(map.made.current().hatchTime).toBeNull();
+  });
+
+  it("gives the moves of the raid's boss for the form, to members", async () => {
+    const map = await changing({ boss: { key: 'yveltal' } });
+    web = map.web;
+    const url = `/s/${FAKE_GUILD_ID}/api/raids/${map.made.party.id}/moves`;
+    const cookie = await map.web.loggedIn(ALICE, 'Alice');
+    const answer = await map.web.app.inject({ url, headers: { cookie } });
+    expect(answer.statusCode).toBe(200);
+    expect(answer.json<RaidMovesView>()).toMatchObject({
+      boss: 'Yveltal',
+      fast: [
+        { id: 'SUCKER_PUNCH_FAST', name: 'Sucker Punch' },
+        { id: 'SNARL_FAST', name: 'Snarl' },
+        { id: 'GUST_FAST', name: 'Gust' },
+      ],
+    });
+    const stranger = await map.web.loggedIn('200000000000000077', 'Stranger');
+    expect((await map.web.app.inject({ url, headers: { cookie: stranger } })).statusCode).toBe(403);
+  });
+
+  it('tells the page who may change a raid: the member signed up, and staff', async () => {
+    const map = await changing();
+    web = map.web;
+    const list = async (userId: string, name: string) => {
+      const cookie = await map.web.loggedIn(userId, name);
+      const answer = await map.web.app.inject({
+        url: `/s/${FAKE_GUILD_ID}/api/parties`,
+        headers: { cookie },
+      });
+      return answer.json<PartiesView>().raids[0]?.mayChange;
+    };
+    expect(await list(ALICE, 'Alice')).toBe(true);
+    expect(await list(BOB, 'Bob')).toBe(false);
+    expect(await list(TEST_OWNER_ID, 'Owner')).toBe(true);
+  });
+
+  it('logs a change as a command is logged: who, where, which raid, what; never a text', async () => {
+    const map = await changing();
+    web = map.web;
+    await map.post('hatch', { time: '2:30pm' });
+    const logged = map.web.entries.find((entry) => entry.msg === 'a raid was changed on the map');
+    expect(logged).toMatchObject({
+      user: ALICE,
+      guild: FAKE_GUILD_ID,
+      party: map.made.party.id,
+      change: 'hatch',
+      outcome: 'ok',
+    });
+    expect(JSON.stringify(logged)).not.toMatch(/2:30pm/u);
+  });
+});
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index 1a28a8e5c6394116dadcb79aeda2d1d4b19e1a44..1ff99ea6aa1315e7e5b9601a16989b2e237de247 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -1,7 +1,16 @@
-import type { FastifyInstance, FastifyReply } from 'fastify';
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
-import type { RaidChanging } from '../commands/raids/raid-changes.js';
+import { partyOver } from '../commands/parties/reply.js';
+import { CHANGE_THROTTLE } from '../commands/raids/change.js';
+import {
+  bossMoves,
+  changeRaidBoss,
+  changeRaidMoves,
+  changeRaidTime,
+  type RaidChangeAnswer,
+  type RaidChanging,
+} from '../commands/raids/raid-changes.js';
 import { reportedBoss, reportedTime, type ReportedBoss } from '../commands/raids/raid-input.js';
 import {
   RAID_COMMAND,
@@ -16,10 +25,15 @@ import { UserError } from '../discord/errors.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
 import { isRaid, type RaidParty } from '../domain/party/party.js';
 import type { MapRaid } from '../domain/web/party-data.js';
-import { mapParty } from '../domain/web/party-view.js';
-import type { RaidAnswer } from '../domain/web/raid-options-data.js';
+import { mapParty, mayChangeRaid } from '../domain/web/party-view.js';
+import {
+  RAID_CHANGES,
+  type RaidAnswer,
+  type RaidChange,
+  type RaidMovesView,
+} from '../domain/web/raid-options-data.js';
 import { gymRegionsInGuild } from '../services/region-directory.js';
-import { actingOnTheMap, throttledOnTheMap, UNREACHABLE } from './acting.js';
+import { actingOnTheMap, isMapStaff, throttledOnTheMap, UNREACHABLE } from './acting.js';
 import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
@@ -77,6 +91,72 @@ const REPORT_STATUS = {
   'no-post': 422,
 } as const;
 
+/** A text a command's option takes: trimmed, not empty, within the option's length. */
+const optionText = (max: number) => z.string().trim().min(1).max(max);
+
+/** The bodies of the changes, as the commands' options are: anything else is malformed. */
+const timeBodySchema = z.object({ time: optionText(40) }).strict();
+const bossBodySchema = z.object({ boss: optionText(100) }).strict();
+const movesBodySchema = z
+  .object({ quick: optionText(100).optional(), charge: optionText(100).optional() })
+  .strict();
+
+/** A change of a raid with what it sets, as its command's options give it. */
+type ChangeInput =
+  | { change: 'hatch' | 'end'; time: string }
+  | { change: 'boss'; boss: string }
+  | { change: 'moves'; quick: string | null; charge: string | null };
+
+/** The change a body asks for; undefined for a malformed body. */
+function changeInput(change: RaidChange, body: unknown): ChangeInput | undefined {
+  switch (change) {
+    case 'hatch':
+    case 'end': {
+      const parsed = timeBodySchema.safeParse(body);
+      return parsed.success ? { change, time: parsed.data.time } : undefined;
+    }
+    case 'boss': {
+      const parsed = bossBodySchema.safeParse(body);
+      return parsed.success ? { change, boss: parsed.data.boss } : undefined;
+    }
+    case 'moves': {
+      const parsed = movesBodySchema.safeParse(body);
+      return parsed.success
+        ? { change, quick: parsed.data.quick ?? null, charge: parsed.data.charge ?? null }
+        : undefined;
+    }
+  }
+}
+
+function isRaidChange(value: string): value is RaidChange {
+  return (RAID_CHANGES as readonly string[]).includes(value);
+}
+
+/** The command each change is, whose throttle it counts against (`CHANGE_THROTTLE`). */
+const CHANGE_COMMANDS: Readonly<Record<RaidChange, string>> = {
+  hatch: 'hatch',
+  end: 'end',
+  boss: 'boss',
+  moves: 'moveset',
+};
+
+/** The status of each outcome of a change. */
+const CHANGE_STATUS: Readonly<Record<RaidChangeAnswer['kind'], number>> = {
+  ok: 200,
+  refused: 422,
+  gone: 409,
+};
+
+/** What a change answers a member who may not change the raid. */
+export const NOT_YOURS =
+  'Only members signed up for this raid, and moderators, can change it here.';
+
+/** What the moves of a raid answer while it has no boss whose moves are known. */
+const NO_MOVES = 'This raid has no boss whose moves I know yet.';
+
+/** The address of a raid's change or moves: `/api/raids/<party id>/<change>`. */
+type ChangeRequest = FastifyRequest<{ Params: { guild: string; party: string; change: string } }>;
+
 /**
  * The raids of the live map (spec 3.5, 3.6): the pick lists of a report for members of the server
  * (`/s/<guild>/api/raid-options`: `raidOptions`, an ETag of its JSON, `private, no-cache`, 304
@@ -119,6 +199,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
     guildRow: number,
     party: RaidParty,
     userId: string,
+    staff: boolean,
   ): MapRaid | undefined => {
     const shown = mapParty(party, {
       guildId,
@@ -129,6 +210,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
       now: deps.now(),
       zone: parties.zone,
       readOnly: false,
+      staff,
       look: (raid) => parties.look(raid),
       pictureOrigins: deps.pictureOrigins,
     });
@@ -136,14 +218,48 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
   };
 
   /** Discord could not say how the member stands to a forum: nothing is written. */
-  const unreachable = (reply: FastifyReply, err: unknown, guild: string, userId: string) => {
+  const unreachable = (
+    reply: FastifyReply,
+    err: unknown,
+    guild: string,
+    userId: string,
+    doing: string,
+  ) => {
     deps.log.warn(
       { err, guild, user: userId },
-      'could not ask Discord who reported a raid on the web pages',
+      `could not ask Discord who ${doing} on the web pages`,
     );
     return reply.code(503).send({ error: UNREACHABLE });
   };
 
+  /** Whether somebody is a member who counts on the map, for a GET; the answer sent if not. */
+  const memberOrFailure = async (
+    request: FastifyRequest,
+    reply: FastifyReply,
+    guild: string,
+    userId: string,
+  ): Promise<FastifyReply | undefined> => {
+    try {
+      if (!(await deps.members.find(guild, userId))) return sendFailure(request, reply, 403);
+    } catch (err) {
+      deps.log.warn(
+        { err, guild, user: userId },
+        'could not ask whether somebody on the web pages is a member',
+      );
+      return sendFailure(request, reply, 503);
+    }
+    return undefined;
+  };
+
+  /** The active raid of this server by id, as the store has it (an ended one is not there). */
+  const activeRaid = async (guild: string, partyId: string) => {
+    const row = await parties.guilds.idFor(guild);
+    const party = parties.store.get(partyId);
+    return row !== undefined && party?.guildId === row && party.status === 'active' && isRaid(party)
+      ? { row, party }
+      : undefined;
+  };
+
   const optionsLimiter = new RateLimiter({ uses: OPTIONS_PER_MINUTE, perMs: 60_000 });
   scope.get(
     '/api/raid-options',
@@ -152,16 +268,8 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
       void reply.header('cache-control', 'private, no-cache');
       const session = await sessions.of(request, reply);
       if (!session) return sendFailure(request, reply, 401);
-      try {
-        const member = await deps.members.find(request.params.guild, session.userId);
-        if (!member) return sendFailure(request, reply, 403);
-      } catch (err) {
-        deps.log.warn(
-          { err, guild: request.params.guild, user: session.userId },
-          'could not ask whether somebody on the web pages is a member',
-        );
-        return sendFailure(request, reply, 503);
-      }
+      const refused = await memberOrFailure(request, reply, request.params.guild, session.userId);
+      if (refused) return refused;
       const body = JSON.stringify(raidOptions(ctx.raidBosses.bosses(), parties.zone));
       const etag = etagOf(body);
       void reply.header('etag', etag);
@@ -235,7 +343,7 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
         if ((await accessTo(forumId, userId)) === 'barred') return sendFailure(request, reply, 403);
       }
     } catch (err) {
-      return unreachable(reply, err, guild, userId);
+      return unreachable(reply, err, guild, userId, 'reported a raid');
     }
     const throttled = throttledOnTheMap(
       deps,
@@ -273,7 +381,8 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
           shown = false;
         }
       }
-      if (shown) raid = viewOf(guild, row, outcome.party, userId);
+      const staff = isMapStaff(acting.standing, userId, parties.ownerId);
+      if (shown) raid = viewOf(guild, row, outcome.party, userId, staff);
     }
     deps.log.info(
       { user: userId, guild, gym: gym.id, outcome: outcome.kind },
@@ -295,4 +404,118 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
     };
     return reply.code(REPORT_STATUS[outcome.kind]).send(answer);
   });
+
+  // The moves the raid's boss can have, for the form of a change (as `/moveset` lists them):
+  // members only, an active raid of this server (409 otherwise).
+  scope.get(
+    '/api/raids/:party/moves',
+    { onRequest: limitedPerAddress(optionsLimiter, { now: deps.now }) },
+    async (request: ChangeRequest, reply) => {
+      void reply.header('cache-control', 'private, no-cache');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const { guild, party: partyId } = request.params;
+      const refused = await memberOrFailure(request, reply, guild, session.userId);
+      if (refused) return refused;
+      const found = await activeRaid(guild, partyId);
+      if (!found) return reply.code(409).send({ error: partyOver({ type: 'raid' }) });
+      const moves = bossMoves(ctx, found.party);
+      if (!moves) return reply.code(422).send({ error: NO_MOVES });
+      const view: RaidMovesView = moves;
+      return view;
+    },
+  );
+
+  // A change of a raid (spec 3.6), as its command makes it: before the body is read, the
+  // per-address limit, the guard of every POST and a change the map knows (404 otherwise). Then
+  // the body (400), who changes it (`actingOnTheMap`), the raid as the store has it (an active raid
+  // of this server; anything else 409 "This raid is over.", as the post's buttons answer), how
+  // the member stands to its forum (barred 403), whether they may change it (signed up, or
+  // staff: `mayChangeRaid`; 403 otherwise), and only then the command's own throttle in its
+  // window; then the command's code path (`changeRaidTime`, `changeRaidBoss`, `changeRaidMoves`)
+  // and its words as text.
+  const knownChange = async (request: ChangeRequest, reply: FastifyReply) => {
+    if (!isRaidChange(request.params.change)) return sendFailure(request, reply, 404);
+  };
+  scope.post(
+    '/api/raids/:party/:change',
+    { onRequest: [...writeGuards, knownChange] },
+    async (request: ChangeRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const { guild, party: partyId, change } = request.params;
+      const input = isRaidChange(change) ? changeInput(change, request.body ?? {}) : undefined;
+      if (!input) return sendFailure(request, reply, 400);
+      const { userId } = session;
+      const doing = 'changed a raid';
+      const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+      if ('sent' in acting) return acting.sent;
+      const found = await activeRaid(guild, partyId);
+      if (!found) {
+        const gone: RaidAnswer = { ok: false, text: partyOver({ type: 'raid' }) };
+        return reply.code(409).send(gone);
+      }
+      const { row, party } = found;
+      try {
+        if ((await accessTo(party.forumChannelId, userId)) === 'barred') {
+          return sendFailure(request, reply, 403);
+        }
+      } catch (err) {
+        return unreachable(reply, err, guild, userId, doing);
+      }
+      const staff = isMapStaff(acting.standing, userId, parties.ownerId);
+      if (!mayChangeRaid(party, userId, staff)) return reply.code(403).send({ error: NOT_YOURS });
+      const throttled = throttledOnTheMap(
+        deps,
+        reply,
+        { command: CHANGE_COMMANDS[input.change] },
+        userId,
+        CHANGE_THROTTLE,
+      );
+      if (throttled) return throttled;
+      const { member } = acting;
+      // The map links no post: a refusal for a gym another raid holds names none.
+      const noPost = () => undefined;
+      let answer: RaidChangeAnswer;
+      try {
+        switch (input.change) {
+          case 'hatch':
+          case 'end':
+            answer = await changeRaidTime(
+              ctx,
+              party,
+              member,
+              input.change,
+              input.time,
+              deps.now(),
+              noPost,
+            );
+            break;
+          case 'boss':
+            answer = await changeRaidBoss(ctx, party, member, input.boss, noPost);
+            break;
+          case 'moves':
+            answer = await changeRaidMoves(ctx, party, member, input.quick, input.charge, noPost);
+            break;
+        }
+      } catch (err) {
+        if (!(err instanceof UserError)) throw err;
+        const refused: RaidAnswer = { ok: false, text: words(err.message) };
+        return reply.code(422).send(refused);
+      }
+      deps.log.info(
+        { user: userId, guild, party: partyId, change, outcome: answer.kind },
+        'a raid was changed on the map',
+      );
+      const raid =
+        answer.kind === 'ok' ? viewOf(guild, row, answer.party, userId, staff) : undefined;
+      const sent: RaidAnswer = {
+        ok: answer.kind === 'ok',
+        text: words(answer.text),
+        ...(raid ? { raid } : {}),
+      };
+      return reply.code(CHANGE_STATUS[answer.kind]).send(sent);
+    },
+  );
 }
diff --git a/test/support/web.ts b/test/support/web.ts
index 7969826c97840b3db9cf3dae49d6cb0f61e9c8ae..c901e38d65378ef57a439dcf00dd64165998e9e7 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -26,6 +26,7 @@ import { inThisThread } from '../../src/web/save-check.js';
 import type { RegionEditing } from '../../src/web/editor-save.js';
 import { Sessions, sessionHash } from '../../src/web/sessions.js';
 import { FAKE_GUILD_ID } from './fake-interactions.js';
+import { TEST_ENV } from './test-env.js';
 import { gymDirectoryWith } from './gym-store.js';
 import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from './gyms.js';
 import { FakeMemberDirectory } from './members.js';
@@ -35,6 +36,9 @@ import { wayspotsWith } from './wayspots.js';
 import { MemoryWebSessions } from './web-sessions.js';
 import type { partyServiceWith } from './party-service.js';
 
+/** The bot's owner in the tests' environment (`TEST_ENV.OWNER_ID`), staff in every server. */
+export const TEST_OWNER_ID = TEST_ENV.OWNER_ID ?? '';
+
 /**
  * Where the map's view is built from in tests: the invented gyms (`MemoryGyms` under a real
  * `GymDirectory`) and regions (a real `RegionDirectory` over `regionRows`) of the server of the
@@ -223,6 +227,7 @@ const NO_PARTIES: PartyWebDeps = {
   },
   acting: new FakeActingMembers(),
   throttles: new Throttles(),
+  ownerId: TEST_OWNER_ID,
 };
 
 /**
@@ -247,6 +252,7 @@ export function partyWebWith(
     attendance: made.attendance,
     acting: options.acting ?? new FakeActingMembers(),
     throttles: options.throttles ?? new Throttles(),
+    ownerId: TEST_OWNER_ID,
   };
 }
````

### Task 5: Map page: report and change raids

Prototype commit: `9fa2f90a8eeab33207725ed02c838e8f500c42bb`

"Report raid" in every gym's popup, also beside the raids a gym shows; "Change…" on raids the member may change; forms built as nodes; while a form is open the popup keeps it (`FormHold`, `heldContent`: Leaflet's `update()` re-runs a popup's content) and the poll waits; a success refreshes the map.

**Files:**

```
 src/web/client/main.ts            |  46 ++++++++--
 src/web/client/map.css            |  54 +++++++++++
 src/web/client/parties.ts         |  19 +++-
 src/web/client/party-layer.ts     |  87 ++++++++++++++++--
 src/web/client/raid-forms.test.ts | 335 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/raid-forms.ts      | 387 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/raid-ui.ts         | 231 ++++++++++++++++++++++++++++++++++++++++++++++
 7 files changed, 1143 insertions(+), 16 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/raid-forms.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/web/client/main.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/raid-forms.test.ts src/web/client/raid-forms.ts src/web/client/raid-ui.ts` and `npx eslint src/web/client/main.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/raid-forms.test.ts src/web/client/raid-forms.ts src/web/client/raid-ui.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 9fa2f90a8eeab33207725ed02c838e8f500c42bb -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Map page: report and change raids`, the paragraph above as the body and the trailer, staging exactly
  `src/web/client/main.ts src/web/client/map.css src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/raid-forms.test.ts src/web/client/raid-forms.ts src/web/client/raid-ui.ts`.

````diff
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 8c9c840ecd1da94242cf625a856f42d41d2b69b7..9fff5b893428adef38ce3d842f7e54f8818be45d 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -6,6 +6,7 @@ import { tileLayers } from './layers.js';
 import { loginNotice } from './notice.js';
 import { showParties } from './party-layer.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
+import { heldContent } from './raid-forms.js';
 
 /**
  * The map page (spec 3.1), bundled by `scripts/web/build.ts`: Leaflet with the tiles of
@@ -21,8 +22,24 @@ const LABEL_ZOOM = 12;
 const GYM_COLOUR = '#2d7a3a';
 const REGION_COLOUR = '#3060c0';
 
-/** Shows the regions and gyms; gives the gyms by id, where the parties are put. */
-async function showGeo(map: L.Map, guild: string): Promise<Map<number, MapGym>> {
+/**
+ * What a gym's popup shows beyond the gym itself, once the page knows who is asking: "Report raid"
+ * for a member (plan 8M-4), and whether a raid form is open (the popup's content is held then:
+ * `heldContent`). Nothing until then.
+ */
+const gymExtras: {
+  of: (gym: MapGym) => HTMLElement | undefined;
+  editing: () => boolean;
+} = { of: () => undefined, editing: () => false };
+
+/**
+ * Shows the regions and gyms; gives the gyms by id, where the parties are put, and the regions'
+ * names by id.
+ */
+async function showGeo(
+  map: L.Map,
+  guild: string,
+): Promise<{ gyms: Map<number, MapGym>; names: Map<number, string> }> {
   const view = await getJson<GeoView>(`/s/${guild}/api/geo`);
   const names = new Map(view.regions.map((region) => [region.id, region.name]));
   const regions = L.featureGroup();
@@ -43,7 +60,17 @@ async function showGeo(map: L.Map, guild: string): Promise<Map<number, MapGym>>
       weight: 2,
       color: GYM_COLOUR,
       fillOpacity: 0.8,
-    }).bindPopup(() => renderNode(gymPopup(gym, names), document)),
+    }).bindPopup(
+      heldContent(
+        () => {
+          const popup = renderNode(gymPopup(gym, names), document);
+          const extra = gymExtras.of(gym);
+          if (extra) popup.append(extra);
+          return popup;
+        },
+        () => gymExtras.editing(),
+      ),
+    ),
   }));
   const gyms = L.featureGroup(dots.map(({ dot }) => dot)).addTo(map);
   const all = regions.getBounds().isValid() ? regions.getBounds() : gyms.getBounds();
@@ -75,7 +102,7 @@ async function showGeo(map: L.Map, guild: string): Promise<Map<number, MapGym>>
     });
     if (matches.length === 1) matches[0]?.dot.openPopup();
   });
-  return new Map(view.gyms.map((gym) => [gym.id, gym]));
+  return { gyms: new Map(view.gyms.map((gym) => [gym.id, gym])), names };
 }
 
 function start(): void {
@@ -94,11 +121,16 @@ function start(): void {
   }
   const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links');
   showGeo(map, guild)
-    .then(async (gyms) => {
+    .then(async ({ gyms, names }) => {
       // The parties of the server for a member who is logged in (plan 8M-3); while Discord
-      // cannot be reached the server says whether it still knows them as a member.
+      // cannot be reached the server says whether it still knows them as a member. A member
+      // may report raids at gyms (plan 8M-4), not while the map is read-only.
       const me = await account;
-      if (me.loggedIn && (me.member || me.readOnly)) showParties(map, guild, me, gyms);
+      if (!me.loggedIn || !(me.member || me.readOnly)) return;
+      const mayReport = me.member && !me.readOnly;
+      const raids = showParties(map, guild, me, gyms, names, mayReport);
+      gymExtras.editing = () => raids.editing();
+      if (mayReport) gymExtras.of = (gym) => raids.reportControl(gym);
     })
     .catch(() => say('The map could not be loaded. Try again in a moment.'));
 }
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 10698420de6a5411e73817808119aaef94c5f76d..b1637b6a4490bb6bba33f56c9055ead0474226a8 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -226,3 +226,57 @@ body {
   display: inline-block;
   margin: 2px 0 6px;
 }
+
+/* Reporting and changing raids (plan 8M-4). */
+.report-raid,
+.raid-form .press,
+.party-popup .change-raid {
+  margin-top: 6px;
+  padding: 3px 10px;
+  border: 1px solid #8a94a6;
+  border-radius: 4px;
+  background: #fff;
+  font: inherit;
+  cursor: pointer;
+}
+
+.raid-form {
+  display: flex;
+  flex-direction: column;
+  gap: 6px;
+  min-width: 220px;
+}
+
+.raid-form .form-row {
+  display: flex;
+  flex-wrap: wrap;
+  align-items: center;
+  gap: 4px 6px;
+}
+
+.raid-form .form-row > span {
+  flex: 0 0 100%;
+  color: #444;
+}
+
+.raid-form input,
+.raid-form select {
+  flex: 1 1 120px;
+  max-width: 100%;
+  padding: 3px 6px;
+  font: inherit;
+}
+
+.raid-form .form-buttons {
+  display: flex;
+  gap: 6px;
+}
+
+.raid-form .press:disabled {
+  opacity: 0.5;
+  cursor: default;
+}
+
+.raid-form .form-answer {
+  color: #8a3b00;
+}
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 65d5bbadc35e0f8740dc5d408837ea754da0d8da..00ff688077e2bde09f6e66d35102f7bce5910f64 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -143,8 +143,8 @@ function postLink(link: string): PageNode[] {
 
 /**
  * A raid without its gym: the raid in the posts' words (`Level 5 raid against Yveltal`, an egg
- * with what it hatches as), the hatch or end time with a countdown, who comes, the buttons, and
- * the post.
+ * with what it hatches as), the hatch or end time with a countdown, who comes, the buttons,
+ * "Change…" for a member who may change it (plan 8M-4), and the post.
  */
 function raidNodes(raid: MapRaid, context: ShowContext): PageNode[] {
   const egg = raid.stage === 'egg';
@@ -160,6 +160,16 @@ function raidNodes(raid: MapRaid, context: ShowContext): PageNode[] {
       ? div('time', egg ? 'Hatch time not known' : 'End time not known')
       : timeLine('time', egg ? 'Hatches at' : 'Ends at', time, context),
     ...attendanceNodes(raid.id, raid.attendance),
+    ...(raid.mayChange
+      ? [
+          {
+            tag: 'button',
+            className: 'press change-raid',
+            text: 'Change…',
+            attributes: { type: 'button', 'data-change-raid': raid.id },
+          },
+        ]
+      : []),
     ...postLink(raid.link),
   ];
 }
@@ -187,12 +197,14 @@ function wayTo(gym: MapGym | undefined): PageNode[] {
 /**
  * The popup of a gym's one marker: the gym once, with its address line and Directions, then
  * every raid there in the list's order (a standard raid and an elite raid can be at one gym at
- * once), each in a section of its own with its time, counts, buttons and post.
+ * once), each in a section of its own with its time, counts, buttons and post; then `extras`
+ * ("Report raid" for a member, plan 8M-4).
  */
 export function gymRaidsPopup(
   gymId: number,
   raids: readonly MapRaid[],
   context: ShowContext,
+  extras: readonly PageNode[] = [],
 ): PageNode {
   return {
     tag: 'div',
@@ -205,6 +217,7 @@ export function gymRaidsPopup(
         className: 'raid',
         children: raidNodes(raid, context),
       })),
+      ...extras,
     ],
   };
 }
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 27c908e1579bc738b74909fd3dd438f0057de1a8..cede6b1dc48f45d41bbe6b6a605a9431b0897155 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -16,6 +16,8 @@ import {
   type ShowContext,
 } from './parties.js';
 import { renderNode, type MapGym, type PageNode } from './popup.js';
+import { FormHold, reportBox } from './raid-forms.js';
+import { raidUi } from './raid-ui.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -38,18 +40,43 @@ const ICON_SIZE = 36;
 /** Makes the elements of a node; a click on a button in them presses it. */
 type Draw = (node: PageNode) => HTMLElement;
 
+/** What the map page's gym dots need of the raids: "Report raid", and whether a form is open. */
+export interface MapRaids {
+  reportControl(gym: MapGym): HTMLElement;
+  /** A raid form is open in the popup that is open: its content is held (`heldContent`). */
+  editing(): boolean;
+}
+
+/**
+ * `mayReport`: a member who may report raids (not while the map is read-only), who gets "Report
+ * raid" also in the popups of gyms that show raids.
+ */
 export function showParties(
   map: L.Map,
   guild: string,
   me: Extract<Me, { loggedIn: true }>,
   gyms: ReadonlyMap<number, MapGym>,
-): void {
+  regionNames: ReadonlyMap<number, string>,
+  mayReport: boolean,
+): MapRaids {
   const layer = L.layerGroup().addTo(map);
   const panel = byId('parties');
   const readOnly = byId('read-only');
   let csrf = me.csrf;
   let shown = '';
   let view: PartiesView | undefined;
+  /** The popup that is open, whose size follows a form drawn into it. */
+  let shownPopup: L.Popup | undefined;
+  /**
+   * A raid form is open: the popup's content is held (Leaflet's `update()` would draw it anew
+   * and wipe the form), and the list is not drawn anew under it but once it closes.
+   */
+  const hold = new FormHold<PartiesView>({
+    draw: (next) => {
+      redraw(next);
+    },
+    popup: () => shownPopup,
+  });
   /** The popup that is open (by its layer's key), to open it again after a redraw. */
   let open: string | undefined;
   const popups = new Map<string, L.Layer>();
@@ -91,7 +118,12 @@ export function showParties(
     const element = renderNode(node, document);
     element.addEventListener('click', (event) => {
       const target = event.target;
-      if (target instanceof HTMLButtonElement && target.classList.contains('press')) {
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.changeRaid !== undefined) raidForms.changeClicked(target);
+      else if (target.dataset.report !== undefined) {
+        const gym = gyms.get(Number(target.dataset.report));
+        if (gym) raidForms.reportClicked(target, gym);
+      } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
       }
     });
@@ -100,10 +132,11 @@ export function showParties(
 
   /**
    * Binds a popup to a layer under a key that names it across redraws (`gym:<id>`,
-   * `train:<id>`, `route:<id>`), remembering it while it is open.
+   * `train:<id>`, `route:<id>`), remembering it while it is open; its content is held while a
+   * form is open in it.
    */
   const withPopup = <T extends L.Layer>(target: T, key: string, popup: () => PageNode): T => {
-    target.bindPopup(() => draw(popup()));
+    target.bindPopup(hold.content(() => draw(popup())));
     target.on('popupopen', () => {
       open = key;
     });
@@ -135,7 +168,10 @@ export function showParties(
               }),
               keyboard: true,
             });
-      withPopup(marker, `gym:${gymId}`, () => gymRaidsPopup(gymId, raids, context())).addTo(layer);
+      const extras = mayReport ? [reportBox(gymId)] : [];
+      withPopup(marker, `gym:${gymId}`, () => gymRaidsPopup(gymId, raids, context(), extras)).addTo(
+        layer,
+      );
     }
     for (const train of next.trains) {
       const places = train.route.flatMap((id) => {
@@ -179,6 +215,39 @@ export function showParties(
     if (reopen !== undefined) popups.get(reopen)?.openPopup();
   };
 
+  map.on('popupopen', (event) => {
+    shownPopup = event.popup;
+  });
+  // A popup closed with a form in it: the form is gone with it, and what came meanwhile is drawn.
+  map.on('popupclose', (event) => {
+    if (shownPopup === event.popup) shownPopup = undefined;
+    hold.popupClosed();
+  });
+
+  // Reporting and changing raids (plan 8M-4): after a success the list at once, and the raid's
+  // gym opened; while a form is open nothing is drawn anew under it.
+  const raidForms = raidUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    regionNames,
+    editing: (now) => {
+      hold.set(now);
+    },
+    done: async (raid) => {
+      if (raid?.gymId != null) {
+        map.closePopup();
+        open = `gym:${raid.gymId}`;
+      }
+      await poller.now();
+      if (open !== undefined) popups.get(open)?.openPopup();
+    },
+  });
+
   const poller = new Poller({
     everyMs: EVERY_MS,
     visible: () => document.visibilityState === 'visible',
@@ -197,7 +266,9 @@ export function showParties(
         const text = await answer.text();
         if (text !== shown) {
           shown = text;
-          redraw(JSON.parse(text) as PartiesView);
+          const next = JSON.parse(text) as PartiesView;
+          // Not under a form that is being filled in: once it closes.
+          hold.shown(next);
         }
       } catch {
         // Offline for a moment: the next turn asks again.
@@ -215,4 +286,8 @@ export function showParties(
     }
   }, COUNTDOWN_MS);
   void poller.start();
+  return {
+    reportControl: (gym) => raidForms.reportControl(gym),
+    editing: () => hold.editing,
+  };
 }
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..50c526ab11216c8f32f3f0ff876770e258a95f2c
--- /dev/null
+++ b/src/web/client/raid-forms.test.ts
@@ -0,0 +1,335 @@
+import { describe, expect, it } from 'vitest';
+import type { MapRaid } from '../../domain/web/party-data.js';
+import type { RaidMovesView, RaidOptionsView } from '../../domain/web/raid-options-data.js';
+import type { Me } from './notice.js';
+import { gymRaidsPopup, raidPopup, type PressSteps, type ShowContext } from './parties.js';
+import type { MapGym, PageNode } from './popup.js';
+import {
+  changeBody,
+  changeForm,
+  FormHold,
+  raidAnswerOf,
+  reportBody,
+  reportBox,
+  reportButton,
+  reportClosesForm,
+  reportForm,
+  sendRaidForm,
+  timeLabel,
+} from './raid-forms.js';
+
+const OPTIONS: RaidOptionsView = {
+  zone: 'America/New_York',
+  bosses: [
+    { value: 'b:yveltal:T5:0', name: 'Yveltal', tier: 'Level 5 raid' },
+    { value: 'b:onix:T1:0', name: 'Onix', tier: 'Level 1 raid' },
+    { value: 'b:raikou:T5:0', name: 'Raikou', tier: 'Level 5 raid' },
+  ],
+  eggs: [
+    { value: 'e:T1:0', tier: 'Level 1 raid' },
+    { value: 'e:T5:0', tier: 'Level 5 raid' },
+  ],
+};
+
+const MOVES: RaidMovesView = {
+  boss: 'Yveltal',
+  fast: [
+    { id: 'SNARL_FAST', name: 'Snarl' },
+    { id: 'GUST_FAST', name: 'Gust' },
+  ],
+  charged: [{ id: 'DARK_PULSE', name: 'Dark Pulse' }],
+};
+
+const gym = (regionIds: number[]): MapGym => ({
+  id: 4,
+  name: 'Veterans Memorial Bridge',
+  nickname: null,
+  lat: 40.05,
+  lon: -80.01,
+  regionIds,
+  address: null,
+  description: null,
+  notice: null,
+});
+
+const REGIONS = new Map([
+  [1, 'west'],
+  [2, 'east'],
+]);
+
+const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
+  kind: 'raid',
+  id: 'r1',
+  gymId: 4,
+  picture: null,
+  tier: 'Level 5 raid',
+  boss: null,
+  stage: 'egg',
+  hatchTime: null,
+  endTime: null,
+  link: 'https://discord.com/channels/1/2',
+  mayChange: true,
+  attendance: {
+    groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
+    mine: null,
+    actions: [],
+  },
+  ...more,
+});
+
+/** Every node of a tree, depth first. */
+function all(node: PageNode): PageNode[] {
+  return [node, ...(node.children ?? []).flatMap(all)];
+}
+
+const byName = (node: PageNode, name: string) =>
+  all(node).find((one) => one.attributes?.name === name);
+const optionsOf = (select: PageNode | undefined) =>
+  all(select ?? { tag: 'none' })
+    .filter((one) => one.tag === 'option')
+    .map((one) => [one.attributes?.value, one.text]);
+
+describe('the form of a report (reportForm)', () => {
+  it("offers the bosses by tier in /raid's order, then the eggs, nothing picked yet", () => {
+    const form = reportForm(gym([1]), OPTIONS, REGIONS);
+    expect(form.attributes).toMatchObject({ 'data-form': 'report', 'data-gym': '4' });
+    expect(
+      all(form)
+        .filter((one) => one.tag === 'optgroup')
+        .map((one) => one.attributes?.label),
+    ).toEqual(['Level 5 raid', 'Level 1 raid', 'Eggs']);
+    expect(optionsOf(byName(form, 'boss'))).toEqual([
+      ['', 'Pick the boss or the egg'],
+      ['b:yveltal:T5:0', 'Yveltal'],
+      ['b:raikou:T5:0', 'Raikou'],
+      ['b:onix:T1:0', 'Onix'],
+      ['e:T1:0', 'Level 1 raid egg'],
+      ['e:T5:0', 'Level 5 raid egg'],
+    ]);
+    expect(byName(form, 'time')?.attributes).toMatchObject({ maxlength: '40' });
+    expect(byName(form, 'region')).toBeUndefined();
+  });
+
+  it('asks for the region of a gym that lies in several, and keeps what was filled in', () => {
+    const form = reportForm(gym([1, 2]), OPTIONS, REGIONS, {
+      boss: 'e:T5:0',
+      time: '20',
+      region: '2',
+    });
+    expect(optionsOf(byName(form, 'region'))).toEqual([
+      ['', 'Pick the region'],
+      ['1', 'west'],
+      ['2', 'east'],
+    ]);
+    const selected = all(form).filter((one) => one.attributes?.selected !== undefined);
+    expect(selected.map((one) => one.attributes?.value)).toEqual(['e:T5:0', '2']);
+    expect(byName(form, 'time')?.attributes?.value).toBe('20');
+  });
+
+  it('names the time by what is picked: when an egg hatches, when a raid ends', () => {
+    expect(timeLabel('e:T5:0')).toBe('Hatches in');
+    expect(timeLabel('b:yveltal:T5:0')).toBe('Ends in');
+    expect(timeLabel('')).toBe('Hatches in');
+  });
+
+  it('makes the body of a report, or says what is missing', () => {
+    expect(reportBody(4, { boss: 'e:T5:0', time: ' 20 ', region: '' })).toEqual({
+      body: { gym: 4, boss: 'e:T5:0', time: '20' },
+    });
+    expect(reportBody(4, { boss: 'b:yveltal:T5:0', time: '', region: '2' })).toEqual({
+      body: { gym: 4, boss: 'b:yveltal:T5:0', region: 2 },
+    });
+    expect(reportBody(4, { boss: '', time: '20', region: '' })).toEqual({
+      text: 'Pick the boss or the egg first.',
+    });
+  });
+
+  it('is offered in the popup of a gym by a button that names the gym', () => {
+    expect(reportButton(4)).toMatchObject({
+      tag: 'button',
+      text: 'Report raid',
+      attributes: { type: 'button', 'data-report': '4' },
+    });
+  });
+
+  it('is offered also in the popup of a gym that shows a raid, after its raids', () => {
+    const context: ShowContext = { now: 0, zone: 'UTC', gym: () => gym([1]) };
+    const popup = gymRaidsPopup(4, [raid()], context, [reportBox(4)]);
+    const reports = all(popup).filter((one) => one.attributes?.['data-report'] !== undefined);
+    expect(reports).toEqual([reportButton(4)]);
+    expect(popup.children?.at(-1)).toEqual({
+      tag: 'div',
+      className: 'report-box',
+      children: [reportButton(4)],
+    });
+    const without = gymRaidsPopup(4, [raid()], context);
+    expect(all(without).filter((one) => one.attributes?.['data-report'] !== undefined)).toEqual([]);
+  });
+
+  it('closes once the report went through, also when the answer names no raid to open', () => {
+    expect(reportClosesForm({ ok: true })).toBe(true);
+    expect(reportClosesForm({ ok: true, raid: { id: 'r1', gymId: 4 } })).toBe(true);
+    // A raid already there: the form gives way to it.
+    expect(reportClosesForm({ ok: false, raid: { id: 'r1', gymId: 4 } })).toBe(true);
+    expect(reportClosesForm({ ok: false })).toBe(false);
+  });
+});
+
+describe('a form open in a popup (FormHold)', () => {
+  /** A popup as Leaflet's: `update()` asks its content function again. */
+  class FakePopup<T> {
+    node: T | undefined;
+    constructor(private readonly content: () => T) {}
+    update(): void {
+      this.node = this.content();
+    }
+  }
+
+  it('keeps the form in place when the popup is fitted to it, and draws what came meanwhile once the popup closes', () => {
+    const drawn: string[] = [];
+    let shown: FakePopup<{ n: number }> | undefined;
+    const hold = new FormHold<string>({ draw: (view) => drawn.push(view), popup: () => shown });
+    let count = 0;
+    const popup = new FakePopup(hold.content(() => ({ n: ++count })));
+    shown = popup;
+    popup.update();
+    const opened = popup.node;
+    expect(opened).toEqual({ n: 1 });
+    // The form is drawn into the node; the popup is fitted to it, and asked again later.
+    hold.set(true);
+    expect(hold.editing).toBe(true);
+    expect(popup.node).toBe(opened);
+    popup.update();
+    expect(popup.node).toBe(opened);
+    // A list that came meanwhile waits for the form.
+    hold.shown('second');
+    expect(drawn).toEqual([]);
+    // The popup closed with the form in it: the list is drawn, and the next ones at once.
+    shown = undefined;
+    hold.popupClosed();
+    expect(hold.editing).toBe(false);
+    expect(drawn).toEqual(['second']);
+    hold.shown('third');
+    expect(drawn).toEqual(['second', 'third']);
+    // Opened again: drawn anew.
+    popup.update();
+    expect(popup.node).toEqual({ n: 2 });
+  });
+
+  it('draws what came meanwhile once the form closes in a popup that stays open', () => {
+    const drawn: string[] = [];
+    let count = 0;
+    const open: { popup?: FakePopup<{ n: number }> } = {};
+    const hold = new FormHold<string>({
+      draw: (view) => drawn.push(view),
+      popup: () => open.popup,
+    });
+    const popup = new FakePopup(hold.content(() => ({ n: ++count })));
+    open.popup = popup;
+    popup.update();
+    hold.set(true);
+    hold.shown('second');
+    hold.set(false);
+    expect(drawn).toEqual(['second']);
+    // Fitted to what it shows without the form: drawn anew.
+    expect(popup.node).toEqual({ n: 2 });
+    hold.popupClosed();
+    expect(drawn).toEqual(['second']);
+  });
+});
+
+describe('the form of a change (changeForm)', () => {
+  it('sets the hatch time, the end time, the boss and, when the boss is known, its moves', () => {
+    const form = changeForm(raid(), OPTIONS, MOVES);
+    expect(form.attributes).toMatchObject({ 'data-form': 'change', 'data-party': 'r1' });
+    expect(
+      all(form)
+        .filter((one) => one.attributes?.['data-set'] !== undefined)
+        .map((one) => one.attributes?.['data-set']),
+    ).toEqual(['hatch', 'end', 'boss', 'moves']);
+    expect(optionsOf(byName(form, 'quick'))).toEqual([
+      ['', 'Fast move as it is'],
+      ['SNARL_FAST', 'Snarl'],
+      ['GUST_FAST', 'Gust'],
+    ]);
+    expect(optionsOf(byName(form, 'charge'))).toEqual([
+      ['', 'Charged move as it is'],
+      ['DARK_PULSE', 'Dark Pulse'],
+    ]);
+    const noMoves = changeForm(raid(), OPTIONS, undefined);
+    expect(byName(noMoves, 'quick')).toBeUndefined();
+  });
+
+  it('makes the body of each change, or says what is missing', () => {
+    expect(changeBody('hatch', { hatch: ' 20 ' })).toEqual({ body: { time: '20' } });
+    expect(changeBody('end', { end: '6:15pm' })).toEqual({ body: { time: '6:15pm' } });
+    expect(changeBody('end', { end: '' })).toEqual({ text: 'Type the time first.' });
+    expect(changeBody('boss', { boss: 'e:T3:0' })).toEqual({ body: { boss: 'e:T3:0' } });
+    expect(changeBody('boss', { boss: '' })).toEqual({ text: 'Pick the boss or the egg first.' });
+    expect(changeBody('moves', { quick: 'SNARL_FAST', charge: '' })).toEqual({
+      body: { quick: 'SNARL_FAST' },
+    });
+    expect(changeBody('moves', { quick: '', charge: '' })).toEqual({
+      text: 'Pick the fast move, the charged move, or both.',
+    });
+  });
+
+  it('is offered in the popup of a raid the member may change, and only there', () => {
+    const context: ShowContext = { now: 0, zone: 'UTC', gym: () => gym([1]) };
+    const change = (shown: MapRaid) =>
+      all(raidPopup(shown, context)).filter((one) => one.attributes?.['data-change-raid']);
+    expect(change(raid())).toHaveLength(1);
+    expect(change(raid({ mayChange: false }))).toEqual([]);
+  });
+});
+
+describe('sending a raid form (sendRaidForm)', () => {
+  const steps = (answers: Array<{ status: number; body: unknown }>, me?: Me): PressSteps => ({
+    post: () => {
+      const next = answers.shift();
+      return next ? Promise.resolve(next) : Promise.reject(new Error('no answer'));
+    },
+    me: () => Promise.resolve(me ?? { loggedIn: false }),
+  });
+
+  it('gives the words and the raid to open; never regions (the form has them from /api/geo)', async () => {
+    const raidView = raid({ id: 'r9', gymId: 7 });
+    expect(
+      await sendRaidForm(
+        'token',
+        steps([{ status: 200, body: { ok: true, text: 'Reported.', raid: raidView } }]),
+      ),
+    ).toEqual({ text: 'Reported.', csrf: 'token', ok: true, raid: { id: 'r9', gymId: 7 } });
+    const several = await sendRaidForm(
+      'token',
+      steps([
+        {
+          status: 422,
+          body: { ok: false, text: 'Pick one.', regions: [{ id: 1, name: 'west' }] },
+        },
+      ]),
+    );
+    expect(several).toEqual({ ok: false, text: 'Pick one.', csrf: 'token' });
+  });
+
+  it('tries once more with a new token after a 403, as a press does', async () => {
+    const sent = await sendRaidForm(
+      'old',
+      steps(
+        [
+          { status: 403, body: { error: 'Forbidden' } },
+          { status: 200, body: { ok: true, text: 'Done.' } },
+        ],
+        { loggedIn: true, name: 'Alice', member: true, csrf: 'new', readOnly: false },
+      ),
+    );
+    expect(sent).toMatchObject({ text: 'Done.', csrf: 'new', ok: true });
+  });
+
+  it('reads what the server answered, and nothing else', () => {
+    expect(raidAnswerOf({ ok: true, text: 'x', raid: { id: 5 } })).toEqual({ ok: true });
+    expect(raidAnswerOf('nonsense')).toEqual({ ok: false });
+    expect(raidAnswerOf({ ok: false, regions: [{ id: '1', name: 2 }] })).toEqual({ ok: false });
+    expect(raidAnswerOf({ ok: false, regions: [{ id: 1, name: 'west' }] })).toEqual({ ok: false });
+  });
+});
diff --git a/src/web/client/raid-forms.ts b/src/web/client/raid-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..68cf554e381ebcc5d172c54bd6f028880ecbd965
--- /dev/null
+++ b/src/web/client/raid-forms.ts
@@ -0,0 +1,387 @@
+import type {
+  RaidChange,
+  RaidMovesView,
+  RaidOptionsView,
+} from '../../domain/web/raid-options-data.js';
+import { pressParty, type PressSteps, type Pressed } from './parties.js';
+import type { MapGym, PageNode } from './popup.js';
+
+/**
+ * Reporting and changing raids on the live map (plan 8M-4, spec 3.6), the parts that need no
+ * Leaflet: the forms as trees of nodes (`renderNode` sets every text as text; the pick lists of
+ * `/api/raid-options` and the moves of a raid's boss), the bodies they send, and sending one
+ * with the page's CSRF token as a press is sent. What a member types is read by the server with
+ * the commands' readers; the page only says what is missing.
+ */
+
+/** The longest time a command takes (its option's length). */
+const TIME_LENGTH = 40;
+
+const option = (value: string, text: string, selected: boolean): PageNode => ({
+  tag: 'option',
+  text,
+  attributes: { value, ...(selected ? { selected: '' } : {}) },
+});
+
+/**
+ * The boss and egg pick list as `/raid` offers it: nothing picked at first, the current bosses
+ * grouped by tier in the list's order, then the eggs.
+ */
+function bossSelect(options: RaidOptionsView, picked: string | undefined): PageNode {
+  const tiers = new Map<string, PageNode[]>();
+  for (const boss of options.bosses) {
+    const group = tiers.get(boss.tier) ?? [];
+    group.push(option(boss.value, boss.name, boss.value === picked));
+    tiers.set(boss.tier, group);
+  }
+  return {
+    tag: 'select',
+    attributes: { name: 'boss' },
+    children: [
+      option('', 'Pick the boss or the egg', picked === undefined || picked === ''),
+      ...[...tiers].map(([tier, children]): PageNode => ({
+        tag: 'optgroup',
+        attributes: { label: tier },
+        children,
+      })),
+      {
+        tag: 'optgroup',
+        attributes: { label: 'Eggs' },
+        children: options.eggs.map((egg) =>
+          option(egg.value, `${egg.tier} egg`, egg.value === picked),
+        ),
+      },
+    ],
+  };
+}
+
+/** What the time of a report is, by what is picked: when an egg hatches, when a raid ends. */
+export function timeLabel(picked: string): string {
+  return picked.startsWith('b:') ? 'Ends in' : 'Hatches in';
+}
+
+const timeInput = (name: string, value: string | undefined): PageNode => ({
+  tag: 'input',
+  attributes: {
+    name,
+    type: 'text',
+    maxlength: String(TIME_LENGTH),
+    placeholder: 'minutes, or a time like 6:15pm',
+    autocomplete: 'off',
+    ...(value === undefined ? {} : { value }),
+  },
+});
+
+const labelled = (text: string, className: string, ...children: PageNode[]): PageNode => ({
+  tag: 'label',
+  className,
+  children: [{ tag: 'span', text }, ...children],
+});
+
+/** The line under a form where its answer is said. */
+const answerLine: PageNode = { tag: 'div', className: 'form-answer', attributes: { hidden: '' } };
+
+/** "Report raid" in a gym's popup (spec 3.6). */
+export function reportButton(gymId: number): PageNode {
+  return {
+    tag: 'button',
+    className: 'report-raid',
+    text: 'Report raid',
+    attributes: { type: 'button', 'data-report': String(gymId) },
+  };
+}
+
+/**
+ * "Report raid" in the box a click opens the form in (`report-box`): in a gym's own popup, and
+ * after the raids in the popup of a gym that shows them (an elite raid can be beside a standard
+ * one).
+ */
+export function reportBox(gymId: number): PageNode {
+  return { tag: 'div', className: 'report-box', children: [reportButton(gymId)] };
+}
+
+/**
+ * Whether a report's answer closes its form: it went through (whether or not it names the raid
+ * to open), or names the raid already there, which the page opens instead.
+ */
+export function reportClosesForm(answer: RaidAnswered): boolean {
+  return answer.ok || answer.raid !== undefined;
+}
+
+/** What a report form holds, kept when it is drawn anew (a region to pick, say). */
+export interface ReportValues {
+  boss: string;
+  time: string;
+  region: string;
+}
+
+/**
+ * The form of a report at a gym: the boss or egg, the time ("Hatches in" or "Ends in", minutes
+ * or a clock time), and the region where the gym lies in several of the server's.
+ */
+export function reportForm(
+  gym: MapGym,
+  options: RaidOptionsView,
+  regionNames: ReadonlyMap<number, string>,
+  filled: Partial<ReportValues> = {},
+): PageNode {
+  const regions = gym.regionIds.flatMap((id) => {
+    const name = regionNames.get(id);
+    return name === undefined ? [] : [{ id, name }];
+  });
+  return {
+    tag: 'div',
+    className: 'raid-form',
+    attributes: { 'data-form': 'report', 'data-gym': String(gym.id) },
+    children: [
+      { tag: 'strong', className: 'name', text: gym.name },
+      labelled('Raid', 'form-row', bossSelect(options, filled.boss)),
+      labelled(timeLabel(filled.boss ?? ''), 'form-row time-row', timeInput('time', filled.time)),
+      ...(regions.length > 1
+        ? [
+            labelled('Region', 'form-row', {
+              tag: 'select',
+              attributes: { name: 'region' },
+              children: [
+                option('', 'Pick the region', (filled.region ?? '') === ''),
+                ...regions.map((region) =>
+                  option(String(region.id), region.name, String(region.id) === filled.region),
+                ),
+              ],
+            }),
+          ]
+        : []),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Report',
+            attributes: { type: 'button', 'data-submit': 'report' },
+          },
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Cancel',
+            attributes: { type: 'button', 'data-cancel': '' },
+          },
+        ],
+      },
+      answerLine,
+    ],
+  };
+}
+
+/** A body to send, or what the member must fill in first. */
+export type FormBody = { body: Record<string, string | number> } | { text: string };
+
+/** The body of a report (`POST /s/<guild>/api/raids`). */
+export function reportBody(gymId: number, values: ReportValues): FormBody {
+  const boss = values.boss.trim();
+  if (boss === '') return { text: 'Pick the boss or the egg first.' };
+  const time = values.time.trim();
+  const region = Number(values.region);
+  return {
+    body: {
+      gym: gymId,
+      boss,
+      ...(time === '' ? {} : { time }),
+      ...(values.region !== '' && Number.isInteger(region) ? { region } : {}),
+    },
+  };
+}
+
+const setButton = (change: RaidChange): PageNode => ({
+  tag: 'button',
+  className: 'press',
+  text: 'Set',
+  attributes: { type: 'button', 'data-set': change },
+});
+
+const moveSelect = (name: string, unchanged: string, moves: RaidMovesView['fast']): PageNode => ({
+  tag: 'select',
+  attributes: { name },
+  children: [
+    option('', unchanged, true),
+    ...moves.map((move) => option(move.id, move.name, false)),
+  ],
+});
+
+/**
+ * The form of a change of a raid, as `/hatch`, `/end`, `/boss` and `/moveset` take it: each with
+ * its own Set; the moves only when the raid has a boss whose moves are known (`moves`).
+ */
+export function changeForm(
+  raid: { id: string },
+  options: RaidOptionsView,
+  moves: RaidMovesView | undefined,
+): PageNode {
+  return {
+    tag: 'div',
+    className: 'raid-form',
+    attributes: { 'data-form': 'change', 'data-party': raid.id },
+    children: [
+      labelled('Hatches in', 'form-row', timeInput('hatch', undefined), setButton('hatch')),
+      labelled('Ends in', 'form-row', timeInput('end', undefined), setButton('end')),
+      labelled('Boss', 'form-row', bossSelect(options, undefined), setButton('boss')),
+      ...(moves
+        ? [
+            labelled(
+              `Moves of ${moves.boss}`,
+              'form-row',
+              moveSelect('quick', 'Fast move as it is', moves.fast),
+              moveSelect('charge', 'Charged move as it is', moves.charged),
+              setButton('moves'),
+            ),
+          ]
+        : []),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          {
+            tag: 'button',
+            className: 'press',
+            text: 'Done',
+            attributes: { type: 'button', 'data-cancel': '' },
+          },
+        ],
+      },
+      answerLine,
+    ],
+  };
+}
+
+/** The body of a change (`POST /s/<guild>/api/raids/<id>/<change>`), from the form's fields. */
+export function changeBody(change: RaidChange, values: Record<string, string>): FormBody {
+  const field = (name: string): string => (values[name] ?? '').trim();
+  switch (change) {
+    case 'hatch':
+    case 'end': {
+      const time = field(change);
+      return time === '' ? { text: 'Type the time first.' } : { body: { time } };
+    }
+    case 'boss': {
+      const boss = field('boss');
+      return boss === '' ? { text: 'Pick the boss or the egg first.' } : { body: { boss } };
+    }
+    case 'moves': {
+      const quick = field('quick');
+      const charge = field('charge');
+      if (quick === '' && charge === '') {
+        return { text: 'Pick the fast move, the charged move, or both.' };
+      }
+      return {
+        body: { ...(quick === '' ? {} : { quick }), ...(charge === '' ? {} : { charge }) },
+      };
+    }
+  }
+}
+
+/**
+ * What the page takes of a report's or a change's answer: whether it was done, and the raid to
+ * open (by id and gym). Anything else in it is ignored: the regions of a gym that lies in several
+ * the form has from `/api/geo` already.
+ */
+export interface RaidAnswered {
+  ok: boolean;
+  raid?: { id: string; gymId: number | null };
+}
+
+export function raidAnswerOf(body: unknown): RaidAnswered {
+  if (typeof body !== 'object' || body === null) return { ok: false };
+  const { ok, raid } = body as { ok?: unknown; raid?: unknown };
+  const answered: RaidAnswered = { ok: ok === true };
+  if (typeof raid === 'object' && raid !== null) {
+    const { id, gymId } = raid as { id?: unknown; gymId?: unknown };
+    if (typeof id === 'string' && (typeof gymId === 'number' || gymId === null)) {
+      answered.raid = { id, gymId };
+    }
+  }
+  return answered;
+}
+
+/**
+ * A popup's content that, while a form is open in it, is the node already drawn: Leaflet asks a
+ * function content again on every `update()` (which fits the popup to the form), and a node
+ * drawn anew would wipe the form. Drawn anew whenever no form is open.
+ */
+export function heldContent<T>(draw: () => T, editing: () => boolean): () => T {
+  let drawn: T | undefined;
+  return () => {
+    if (drawn === undefined || !editing()) drawn = draw();
+    return drawn;
+  };
+}
+
+/** What `FormHold` works with: drawing a new list, and the popup that is open (Leaflet's). */
+export interface FormHoldDeps<V> {
+  draw(view: V): void;
+  popup(): { update(): void } | undefined;
+}
+
+/**
+ * Whether a raid form is open in the popup that is open (one at a time: opening another popup
+ * closes the first): its content is held (`content`), a new list waits for the form (`shown`),
+ * and is drawn once the form closes (`set(false)`) or its popup does (`popupClosed`).
+ */
+export class FormHold<V> {
+  private open = false;
+  private waiting: { view: V } | undefined;
+
+  constructor(private readonly deps: FormHoldDeps<V>) {}
+
+  get editing(): boolean {
+    return this.open;
+  }
+
+  /** A popup's content function, held while a form is open (`heldContent`). */
+  content<T>(draw: () => T): () => T {
+    return heldContent(draw, () => this.open);
+  }
+
+  /** A new list: drawn now, or once no form is open. */
+  shown(view: V): void {
+    if (this.open) this.waiting = { view };
+    else this.deps.draw(view);
+  }
+
+  /** A form opened or closed in the popup: the popup fits it; once closed, what waited is drawn. */
+  set(open: boolean): void {
+    this.open = open;
+    this.deps.popup()?.update();
+    if (!open && this.waiting) {
+      const { view } = this.waiting;
+      this.waiting = undefined;
+      this.deps.draw(view);
+    }
+  }
+
+  /** The popup closed: a form in it is gone with it. */
+  popupClosed(): void {
+    if (this.open) this.set(false);
+  }
+}
+
+/**
+ * Sends a report or a change with the page's CSRF token as a press is sent (`pressParty`: a 403
+ * of a stale token is tried once more with a new one): the words to say, the token now, and what
+ * the answer says of the raid.
+ */
+export async function sendRaidForm(
+  csrf: string,
+  steps: PressSteps,
+): Promise<Pressed & RaidAnswered> {
+  let last: unknown;
+  const pressed = await pressParty(csrf, {
+    post: async (token) => {
+      const answer = await steps.post(token);
+      last = answer.body;
+      return answer;
+    },
+    me: () => steps.me(),
+  });
+  return { ...pressed, ...raidAnswerOf(last) };
+}
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a75080d223bf349fe4e92c88fc52ef024cbdde3c
--- /dev/null
+++ b/src/web/client/raid-ui.ts
@@ -0,0 +1,231 @@
+import type {
+  RaidChange,
+  RaidMovesView,
+  RaidOptionsView,
+} from '../../domain/web/raid-options-data.js';
+import { getJson, say } from './common.js';
+import type { Me } from './notice.js';
+import { renderNode, type MapGym } from './popup.js';
+import {
+  changeBody,
+  changeForm,
+  reportBody,
+  reportBox,
+  reportClosesForm,
+  reportForm,
+  sendRaidForm,
+  timeLabel,
+  type FormBody,
+  type RaidAnswered,
+} from './raid-forms.js';
+
+/**
+ * The raid forms of the live map in the page (plan 8M-4, spec 3.6): "Report raid" in a gym's
+ * popup (also one that shows raids) opens the report form in its place; "Change…" in a raid's
+ * popup opens the change form in place of that raid. The pick lists come from
+ * `/api/raid-options` (the browser revalidates them by their ETag), the moves from the raid's own
+ * address. Every text is set as text (`renderNode`). After a success the party list is asked for
+ * at once and the raid's popup opened (`done`); a refusal is said under the form and in the
+ * notice.
+ */
+export interface RaidUiDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  /** The names of the server's regions by id, as `/api/geo` gives them. */
+  regionNames: ReadonlyMap<number, string>;
+  /** After a report or a change went through: the list again, and the raid opened. */
+  done(raid: RaidAnswered['raid']): Promise<void>;
+  /** Whether a form is open: the party list is not drawn anew under it. */
+  editing(open: boolean): void;
+}
+
+/** What the page says when the pick lists cannot be loaded. */
+const NO_OPTIONS = 'The pick lists could not be loaded. Try again in a moment.';
+
+/** The values of a form's fields by name. */
+function fieldsOf(form: HTMLElement): Record<string, string> {
+  const values: Record<string, string> = {};
+  for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
+    'input[name], select[name]',
+  )) {
+    values[field.name] = field.value;
+  }
+  return values;
+}
+
+/** Says a form's answer under it, and in the notice. */
+function answer(form: HTMLElement, text: string): void {
+  const line = form.querySelector<HTMLElement>('.form-answer');
+  if (line) {
+    line.textContent = text;
+    line.hidden = false;
+  }
+  say(text);
+}
+
+export function raidUi(deps: RaidUiDeps) {
+  const { guild } = deps;
+
+  const options = (): Promise<RaidOptionsView> =>
+    getJson<RaidOptionsView>(`/s/${guild}/api/raid-options`);
+
+  const moves = async (raidId: string): Promise<RaidMovesView | undefined> => {
+    try {
+      return await getJson<RaidMovesView>(
+        `/s/${guild}/api/raids/${encodeURIComponent(raidId)}/moves`,
+      );
+    } catch {
+      return undefined;
+    }
+  };
+
+  /** Sends a body to an address of the raids with the page's token; disables the form meanwhile. */
+  const send = async (form: HTMLElement, url: string, body: FormBody) => {
+    if ('text' in body) {
+      answer(form, body.text);
+      return undefined;
+    }
+    const buttons = form.querySelectorAll('button');
+    for (const each of buttons) each.disabled = true;
+    const sent = await sendRaidForm(deps.csrf.get(), {
+      post: async (token) => {
+        const reply = await fetch(url, {
+          method: 'POST',
+          credentials: 'same-origin',
+          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+          body: JSON.stringify(body.body),
+        });
+        return {
+          status: reply.status,
+          body: (await reply.json().catch(() => undefined)) as unknown,
+        };
+      },
+      me: () => getJson<Me>(`/s/${guild}/api/me`),
+    });
+    deps.csrf.set(sent.csrf);
+    for (const each of buttons) each.disabled = false;
+    answer(form, sent.text);
+    return sent;
+  };
+
+  /** Opens the report form of a gym in `box`, in place of its button. */
+  const openReport = async (box: HTMLElement, gym: MapGym, restore: () => void) => {
+    let lists: RaidOptionsView;
+    try {
+      lists = await options();
+    } catch {
+      say(NO_OPTIONS);
+      return;
+    }
+    const form = renderNode(reportForm(gym, lists, deps.regionNames), document);
+    const boss = form.querySelector<HTMLSelectElement>('select[name="boss"]');
+    const label = form.querySelector<HTMLElement>('.time-row span');
+    boss?.addEventListener('change', () => {
+      if (label) label.textContent = timeLabel(boss.value);
+    });
+    const close = () => {
+      restore();
+      deps.editing(false);
+    };
+    form.addEventListener('click', (event) => {
+      const target = event.target;
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.cancel !== undefined) close();
+      if (target.dataset.submit !== 'report') return;
+      const values = fieldsOf(form);
+      void send(
+        form,
+        `/s/${guild}/api/raids`,
+        reportBody(gym.id, {
+          boss: values.boss ?? '',
+          time: values.time ?? '',
+          region: values.region ?? '',
+        }),
+      ).then(async (sent) => {
+        // A new raid, or the raid that was there already: the list again, and the raid opened.
+        if (sent && reportClosesForm(sent)) {
+          close();
+          await deps.done(sent.raid);
+        }
+      });
+    });
+    box.replaceChildren(form);
+    deps.editing(true);
+  };
+
+  /** Opens the change form of a raid in place of its section of a popup. */
+  const openChange = async (section: HTMLElement, raidId: string) => {
+    let lists: RaidOptionsView;
+    try {
+      lists = await options();
+    } catch {
+      say(NO_OPTIONS);
+      return;
+    }
+    const before = [...section.childNodes];
+    const form = renderNode(changeForm({ id: raidId }, lists, await moves(raidId)), document);
+    const close = () => {
+      section.replaceChildren(...before);
+      deps.editing(false);
+    };
+    form.addEventListener('click', (event) => {
+      const target = event.target;
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.cancel !== undefined) {
+        close();
+        void deps.done(undefined);
+        return;
+      }
+      const change = target.dataset.set as RaidChange | undefined;
+      if (change === undefined) return;
+      void send(
+        form,
+        `/s/${guild}/api/raids/${encodeURIComponent(raidId)}/${change}`,
+        changeBody(change, fieldsOf(form)),
+      ).then(async (sent) => {
+        // Done: the list again, which shows the raid as it is now; a refusal keeps the form.
+        if (sent?.ok) {
+          close();
+          await deps.done(sent.raid);
+        }
+      });
+    });
+    section.replaceChildren(form);
+    deps.editing(true);
+  };
+
+  /** A click on "Report raid" (`reportBox`): the form in place of the button, in its box. */
+  const reportClicked = (button: HTMLButtonElement, gym: MapGym): void => {
+    const box = button.parentElement;
+    if (!box) return;
+    void openReport(box, gym, () => {
+      box.replaceChildren(button);
+    });
+  };
+
+  return {
+    /** "Report raid" for a gym's own popup; a click opens the form in its place. */
+    reportControl(gym: MapGym): HTMLElement {
+      const box = renderNode(reportBox(gym.id), document);
+      const button = box.querySelector('button');
+      button?.addEventListener('click', () => {
+        reportClicked(button, gym);
+      });
+      return box;
+    },
+
+    /** A click on "Report raid" in the popup of a gym that shows raids. */
+    reportClicked,
+
+    /** A click on "Change…" of a raid: its form in place of the raid's section. */
+    changeClicked(button: HTMLButtonElement): void {
+      const raidId = button.dataset.changeRaid;
+      const section = button.closest<HTMLElement>('.raid');
+      if (raidId === undefined || !section) return;
+      void openChange(section, raidId);
+    },
+  };
+}
+
+export type RaidUi = ReturnType<typeof raidUi>;
````

### Task 6: Docs: raids on the map, and the staging checklist of 8M-4

Prototype commit: `6c24684ca7a969331f184a1d6e2174db8b7f904c`

`web.md` ("Raids on the map", addresses, limits, "Adding a route"), `parties-and-posts.md`, `testing.md`; the staging checklist `docs/superpowers/plans/2026-10-17-phase-8m4-staging.md`.

**Files:**

```
 docs/architecture/parties-and-posts.md                 |  2 +-
 docs/architecture/testing.md                           |  3 ++-
 docs/architecture/web.md                               | 27 ++++++++++++++++++---------
 docs/superpowers/plans/2026-10-17-phase-8m4-staging.md | 47 +++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 68 insertions(+), 11 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m4-staging.md`.
- [ ] **Step 4: Check the transcription:** `git diff 6c24684ca7a969331f184a1d6e2174db8b7f904c -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Docs: raids on the map, and the staging checklist of 8M-4`, the paragraph above as the body and the trailer, staging exactly
  `docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m4-staging.md`.

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 31c85a598b075ba90d5f251becf8b65bfe321895..76ea5c3c7d5bd6bf8119e4e6630f2b885348e571 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -25,7 +25,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 ## Raids
 
-- What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`). It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
+- What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`; the words are `raidChangeAnswer`'s, `src/commands/raids/raid-changes.ts`, which a refusal or a raid that ended throws). `/hatch`, `/end` (of a raid), the "Set time" form, `/boss` (of a raid) and `/moveset` go through `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` there (read, change as the member, answer), the one code path the live map calls too (plan 8M-4, `web.md`); `/raid` reports through `reportRaidAs` and words the outcome with `reportWords` (`src/commands/raids/report.ts`), which the map shares. It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
 - The post of an egg shows the game's egg (`raidEggPicture`, `src/domain/pogo/raid-eggs.ts`, served by address from `settings.raidEggPicturesUrl`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one. `raidLook(view)` (`src/render/raid-post.ts`) gives the live map the post's picture and the boss it names, decided as for the post.
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 0e942eef6f4e883579613d8a73c90085bdce9856..16784a6857197a0f7c446c89e1e6a88504f7c489 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -48,7 +48,8 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
 - The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
-- The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is.
+- The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
+- Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`).
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 916de042733ea485a09410bf20d28738571e3855..667b903aa711275767de19c51c40d985b18223f5 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,12 +1,12 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-3; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, the region editor, the Content Security Policy, and the rules for the routes of 8M-4 and 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, the region editor, the Content Security Policy, and the rules for the routes of 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-3; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters) or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
 ## Sessions and CSRF
@@ -29,7 +29,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-3; spec `docs/superpowe
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget.
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute, the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words).
 
 ## The public map
 
@@ -41,11 +41,20 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-3; spec `docs/superpowe
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
-- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post). A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (with one group Interested, Join, Here; with several a Join for each group, Interested, Here; Done for a raid that has hatched; Leave for a member signed up; none while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
-- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join` (body `{ group }` for "Join B"), `here`, `leave`, `done`; any other action 404, a body other than an optional group letter with `join` 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This raid is over." for Done, which only a raid has, otherwise "This has ended.", as `answerClick` says it); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post). A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (with one group Interested, Join, Here; with several a Join for each group, Interested, Here; Done for a raid that has hatched; Leave for a member signed up; none while read-only); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join` (body `{ group }` for "Join B"), `here`, `leave`, `done`; any other action 404, a body other than an optional group letter with `join` 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This raid is over." for Done, which only a raid has, otherwise "This has ended.", as `answerClick` says it); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
 - **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked, meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
+## Raids on the map (plan 8M-4)
+
+- **One code path per command** (spec 3.5): what `/raid` does beyond its gym question is `reportRaidAs` and `reportWords` (`src/commands/raids/report.ts`: the report as the member, anonymous by their `raidPrivacy`, signed up by their `autoStatus` under their name and team; the command's words for each `ReportOutcome`, a post and a region channel named by the caller's `ReportNames`: mentions on Discord, on the map no post and a channel as `#name`); what `/hatch`, `/end`, `/boss` and `/moveset` do is `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` (`src/commands/raids/raid-changes.ts`: the command's reader, `RaidChangeService` as the member, the answer `raidChangeAnswer`, `ok` / `refused` / `gone`; a reader's refusal is thrown as a `UserError`). The commands reply with these or throw them; the map answers them. The readers (`reportedBoss`, `reportedTime`, `typedPartyTime`) take only what they read (`RaidReading`), so the web server is given exactly what the commands read and call (`RaidWebDeps.ctx`, `RaidWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
+- **The pick lists** `GET /s/<guild>/api/raid-options` (members, as `/api/parties`; 30 a minute per address): `raidOptions` (`src/web/raid-options.ts`, pure; types in `src/domain/web/raid-options-data.ts`, which imports no server code): the current bosses in the boss list's order, each with the value its choice of `/raid` has (`bossChoiceValue`: `b:yveltal:T5:0`; `/raid`'s own list uses it too, and `reportedBoss` reads it back), then an egg of every tier (`eggChoiceValue`, `e:T5:0`), tiers in the posts' words (`raidWords`), the posts' zone; nothing of gyms (no elite raid gym mark). An ETag of its JSON, `private, no-cache`, 304. A raid's moves `GET /s/<guild>/api/raids/<id>/moves` (members; an active raid of the server, 409 otherwise; 422 without a boss whose moves are known): `bossMoves`, the moves of the boss the post shows, by id and name, as `/moveset` lists them.
+- **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum: `barred` from any of them 403, Discord unreachable 503; only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is: `{ user, guild, gym, outcome }`, "a raid was reported on the map", never the text.
+- **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403); whether the member may change it (`mayChangeRaid`: signed up for it, as `mayArrange` has it, or staff by the commands' `isManagement`, an admin or a moderator by role or the bot's owner, `isMapStaff` of the member fetched fresh; 403 "Only members signed up for this raid, and moderators, can change it here." otherwise); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. The commands themselves let anybody in the post change a raid; the map, which crosses forums (spec 2.5), asks a sign-up or staff (spec 3.6). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
+- **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, and after the raids in the popup of a gym that shows raids, `gymRaidsPopup`'s `extras`, since an elite raid can be beside a standard one), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. While a form is open (`FormHold`) the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`popup.update()`). Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise.
+- **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S, after plan 8D's pins of maps links; trains and meetups are 8M-5; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
+
 ## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
@@ -58,8 +67,8 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-3; spec `docs/superpowe
 - **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, power spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
 - **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
 
-## Adding a route (8M-4 and 8M-5)
+## Adding a route (8M-5)
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
-- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), with the command's own throttle per member, counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`ActingMembers`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
-- Answer failures through `sendFailure` and refusals with the command's words. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
+- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs` and `changeRaidTime` are), with the command's own throttle per member (`throttledOnTheMap`), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
+- Answer failures through `sendFailure` and refusals with the command's words, made text of the page by `pageWords` (`src/web/page-words.ts`: Discord's timestamps as clock times in the posts' zone, the bot's markdown taken out, `unplain`); a mention of a post or a channel the page cannot show is named by the caller's namer (`ReportNames`, `PostNamer`), not left as `<#id>`. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
diff --git a/docs/superpowers/plans/2026-10-17-phase-8m4-staging.md b/docs/superpowers/plans/2026-10-17-phase-8m4-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..0dc88ff4a09663388307667dcfe5b648051b17c0
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8m4-staging.md
@@ -0,0 +1,47 @@
+# Phase 8M-4 staging checklist: reporting and changing raids on the live map
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator) and **Tester** (Matt, a member without a staff role).
+
+## Before
+
+1. No migration and no command change in this plan (the commands' options, names and help are as they were): no deploy. `npm run build` (it runs `npm run web:build`): a new `dist/web/assets/map-<hash>.js`.
+2. A gym of West that lies in West alone (the Library, say), and, if the test server's outlines have one, a gym that lies in two regions (else skip step 7). Googer's and Tester's `/settings`: Tester's raid privacy set to anonymous for step 6, Googer's left as it is.
+3. Somebody wants T5 raids (`/want` on Discord with a second account, or Googer's own `/want tier:t5` if the notifier tells the reporter too; note which) for step 5.
+
+## Reporting
+
+4. Logged out, and logged in as a member while Discord cannot be reached (not staged, below): no "Report raid" in a gym's popup.
+5. Googer logs in with `/maps` and clicks a gym of West: its popup has "Report raid". Click it: the form takes the popup's place and stays while a boss is picked and a time typed (the popup is fitted to it, not drawn anew): "Raid" with "Pick the boss or the egg", the current bosses grouped under their tiers ("Level 5 raid", …) in the order `/raid` lists them, then "Eggs"; "Hatches in" with "minutes, or a time like 6:15pm"; Report and Cancel. Pick "Level 5 raid egg", type `20`, Report: the notice says "Reported: T5 egg at <gym>."; the form closes, the gym gets the raid's marker within a moment and its popup opens, showing "Hatches at …" twenty minutes ahead. On Discord: the post in West's forum names Googer as the reporter, Googer is signed up by their automatic status, the region's summary lists the raid, and whoever wants T5 raids got the DM (step 3).
+6. Tester (anonymous by their settings) reports a boss from the list ("Ends in" once a boss is picked) with a clock time (`3:40pm`, within the raid's length): the post names no reporter (as `/raid` from an anonymous member), the map's answer "Reported: <boss> (T5) at <gym>.".
+7. The gym that lies in two regions: its form has "Region" with "Pick the region" and both regions by name; Report without one picked: "This gym lies in several regions: pick the one to report the raid in.", the form kept; with East picked the post goes to East's forum. If one of the two regions has no forum: with it picked the raid goes to the other, and the answer ends "It was posted in #<other region>."
+8. Report again at Googer's gym of step 5 (Tester): "There is already a raid at <gym>. You have been marked as interested." (or Tester's automatic status), the raid's popup opens, the post lists Tester. No second post. The raid's popup (the marker on the gym) also has "Report raid" after its raids: its form opens there and stays; an elite raid reported there is a second raid at the gym, listed in the same popup.
+9. Refusals in `/raid`'s words, as text: a time the egg cannot have (`5pm` an hour on): "\"5pm\" cannot be the time the egg hatches: it must be between <time> and <time>." with clock times in the server's zone (no `<t:…>`), shown under the form and in the notice, the form kept; Report with nothing picked: "Pick the boss or the egg first." (the page's own); a typed nonsense boss through the network panel's "Edit and resend" (`"boss": "zzzz"`): "I do not know a raid boss or tier called \"zzzz\". …" with the backticks taken out.
+10. `/raid`'s limit is one: report on the map and with `/raid` on Discord until 20 reports in 15 minutes between them (a scratch script against the dev server, or resends of a report at gyms without raids): the 21st is refused on whichever side, "You can use /raid again in 15 minutes." (429 with `Retry-After` on the map, privately on Discord). End the raids made meanwhile.
+
+## Changing
+
+11. Googer (signed up for the raid of step 5): its popup has "Change…" under the buttons; Tester, not signed up for a raid Googer reported alone, does not see it there until they Join (then it appears with the next refresh). Googer clicks Change…: the raid's section becomes the form (Hatches in / Ends in with Set each, Boss with Set, Moves only once the raid has a boss whose moves are known, Done).
+12. Hatches in `30`, Set: the notice says "Done. It hatches at … and ends at …." in clock times; the form closes, the list is asked for at once and the popup shows the new times; the post says "**Googer** (@Googer) set the hatch time: …" in its line. Ends in a clock time: the same with "set the end time".
+13. Boss: pick a T5 boss, Set: "The boss is now <boss> (T5)."; the post's picture becomes the boss's after it hatches, its line "set the boss". Then Change… again: Moves now lists the boss's fast and charged moves; pick one fast move, Set: "The moves are now <fast> / ????." and the post shows it; pick both: both.
+14. Refusals: Ends in `9pm` (outside the raid): the command's words with clock times, the form kept; Hatches in `cancel`: "A raid keeps its times once it has them. Give the right time instead."; Moves with neither picked: "Pick the fast move, the charged move, or both." (the page's own).
+15. Staff: Googer changes a raid Tester reported and Googer is not signed up for: Change… is there (a moderator), and Set goes through. Tester, not signed up, resends a change of Googer's raid from the network panel: 403 "Only members signed up for this raid, and moderators, can change it here."; nothing changes on the post, and the request is not counted.
+16. Each command's own limit: eleven Sets of the hatch time within a minute (resends): the eleventh is "You can use /hatch again in 1 minute."; a Boss Set right after it goes through (a window of its own); `/hatch` on Discord in that minute is refused with the same words.
+17. A raid that ends while its change form is open (`/delete` on Discord): Set answers "This raid is over." and the marker goes with the next refresh (after Done or closing the popup).
+18. While a form is open the map does not redraw under it (step 5 with somebody joining the raid on Discord meanwhile: the form stays; the counts change once it closes).
+19. A forum Tester is kept out of (an overwrite for Tester that denies View Channel on East's forum): Tester's report at a gym of East answers 403 and makes nothing; a change of a raid there (resend) 403; a report at the gym of step 7 with West picked while its raid stands in East 403, and Tester is not signed up for that raid. Remove the overwrite afterwards.
+20. The bot's log: one info line "a raid was reported on the map" per report (`user`, `guild`, `gym`, `outcome`) and "a raid was changed on the map" per change (`user`, `guild`, `party`, `change`, `outcome`); no name, no typed text.
+
+## Not staged
+
+- Read-only while Discord cannot be reached (no "Report raid", no "Change…", writes 503): covered by the route tests, as in 8M-3.
+- Spawns from the map (spec 3.8): plan 8M-4S, after plan 8D.
+
+## Afterwards
+
+21. End the raids made for the test; put Tester's privacy back; remove the `/want` of step 3 and any overwrite of step 19.
+
+## Left open (to the follow-ups if not settled here)
+
+- Who may change a raid on the map: the commands let anybody in the post change it; the map asks a sign-up or staff (spec 3.6). Whether a member who only sees the raid on the map (not signed up) should be able to correct an obviously wrong time.
+- `/raid` has the hole the map's report closes: at a gym that lies in two regions, a report in the region whose forum the member may see joins the raid already standing in the other region's forum, from which they are kept out. Left for a follow-up (the map refuses it, 403).
+- The size of the forms on a phone.
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m4 HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m4-staging.md` prints nothing; then `npm run check`, `npm run build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other. The new and changed test files with timers or waits (the raid routes', the forms') ten times in a row.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`, `src/app.ts`, `package.json` and `package-lock.json`), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when the main checkout is clean and the cutover session is not committing (ask it). Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-4": the rulings and "Made while prototyping" above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-4.<n> <commit>` per task, then `review`), the ledger and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-17-phase-8m4-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application: `npm run build`, Matt starts the bot; two accounts on the map: report and change raids, the posts and the DMs that follow.
