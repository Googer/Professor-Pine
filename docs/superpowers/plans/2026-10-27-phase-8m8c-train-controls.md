# Phase 8M-8C: A Train's Move…, Manage…, Split… and the Route Editor on the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the last of the three 8M-8 plans of the web polish: a train's post controls on the map do what Discord's do, over the same code paths. After it `CONTROLS` has no "Do this on Discord →" left but starting a new group.

- **Task 1:** the train dialogs' logic as shared functions (`manageTrainAs`, `manageRefusal`, `movedOnWords`, `splitRefusalFor`, `SPLIT_FAILED`, `GROUPS_CHANGED`; `moveForm`, `manageForm`, `splitForm`, `aheadText`), no behavior change.
- **Task 2:** Manage… on the map as Discord's Manage… dialog (where the train is, the route: Keep / Reverse / Finish, at the end, what the train is mainly for; a train without a route: the kind alone), `GET`/`POST …/trains/<id>/manage`; refusals in Discord's words sent by the server (`MapTrain.moveRefusal`); `TrainService.reverse`, `setAtEnd`, `setKind` and the map's old presses retired.
- **Task 3:** Move… on the map as Discord's Move… (Next, Previous, Skip with `offeredMoves`' labels and undo; `MapTrain.moves`); Finish, Reverse and the at-end mode only through Manage….
- **Task 4:** Split… on the map, `GET`/`POST …/trains/<id>/split` (one-group and several-group shapes, over `splitGroupAs`); who may not is refused before counting (403), the rest counted as Discord counts them (422).
- **Task 5:** route mode adds a Power Spot by a tap (and by Enter: gym and Power Spot dots are Tab stops only in route mode, `RouteFocus`); Route shows the read-only stops and the server's ahead line; one Edit route.
- **Task 6:** dragging a stop in route mode's stop list (pointer events, touch, a 32 px handle, autoscroll near the edges; the drag ends on Escape, a lost pointer and any redraw).
- **Task 7:** docs (`web.md`, `trains.md`, `testing.md`), the controls table and the staging checklist `2026-10-27-phase-8m8c-staging.md`.

**Tech stack:** TypeScript 6.0, Node 24, Leaflet, esbuild, Fastify and Vitest. No new dependency, no migration, no setting, no command change (no deploy needed).

**Spec:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` (approved by Matt 2026-10-25) and the brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (git-ignored) with its builder check's rulings R1–R9 (Move… becomes Discord's Move…; the conductor buttons stay outside Manage…; the route editor stays the side pane's route mode, docked under the map on a phone; Power Spots tappable in route mode; dragging in the stop list), `proto-review-1-findings.md` and `progress.md`.

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8m8c` (tip `43428a60`), one commit per task, on typescript-migration 3a71f452. Each commit typechecks and passes its tests; on the tip the full check passes (10,180 tests), the build passes and the database suite passes (611 tests).

**Reviews:**

- **The brief:** an Opus builder check (Discord's Manage… holds the route and has no conductor part; the map's Move… still had Finish, Reverse and the mode; the route editor lacked dragging and Power Spots), ruled R1–R9 by the controller.
- **The prototype:** an Opus review: ready after fixes (2 Important: refusals worded by the page, a drag outliving its editor; 9 Minor); fix round 1 folded in.
- **The fix round:** a scoped Opus re-review (all addressed; 2 Minor: Tab stops outside route mode, Split's state refusals not counted); fix round 2 folded in, checked by the controller.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md`, `trains.md`, `parties-and-posts.md`, `discord-framework.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck (root and `src/web/client`) and its own test files. The full check, the build and the database suite run once on the tip. Work in `../Professor-Pine-web` on `web-polish`; never commit in the main checkout.

## Review Focus

- Discord's Move…, Manage… and Split… dialogs behave exactly as before after their logic moved to shared functions (their tests unchanged).
- Every new route: members only, barred forums refused, CSRF, the per-address limiter, the post controls' throttle counted once at the Submit and given back where the router gives it back; staff judged on a freshly fetched member.
- A stale form (the train moved, the route edited, the groups changed) answers 409 with the train as it is now, in Discord's words.
- A drag never outlives its editor: a redraw, Escape or a lost pointer ends it without a drop.
- Nothing on the map is a Tab stop outside route mode that was not one before.

---

## Tasks

### Task 1: 8M-8C task 1: the train dialogs' logic as shared functions

Prototype commit: `ba6dd6a993c6037b1ea9ef9ecf1f598f79006a8d`

Manage...'s Submit is manageTrainAs in train-changes.ts (only what was
picked otherwise than shown, Nothing changed., the refusal with where
the train is now, the words), with movedOnWords and manageRefusal; the
split's refusal before the dialog is splitRefusalFor, SPLIT_FAILED and
GROUPS_CHANGED are shared. manageForm and splitForm build what the
dialogs say and ask apart from Discord's dialog, routeChoice and
OfferedMove are exported. No change of behavior: Discord's tests pass
unchanged.

**Files:**

```
 src/commands/trains/move.ts               | 111 ++++++++++++++++++++++++++-----------------------------------------------------------------------
 src/commands/trains/split.ts              |  50 ++++++++++----------------------------------
 src/commands/trains/train-changes.test.ts | 125 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/trains/train-changes.ts      | 172 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/render/train-dialogs.ts               |  76 ++++++++++++++++++++++++++++++++++++++++++++++++++++--------------
 src/render/train-split.ts                 |  53 +++++++++++++++++++++++++++++++---------------
 6 files changed, 432 insertions(+), 155 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/trains/train-changes.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff ba6dd6a993c6037b1ea9ef9ecf1f598f79006a8d -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8C task 1: the train dialogs' logic as shared functions`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/trains/move.ts b/src/commands/trains/move.ts
index a943db4f78b9a10c2f158378eac525be8c695523..cfd3a3e444a8579723807d8da9823f175ec2189f 100644
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -19,7 +19,7 @@ import {
   type TrainKind,
   type TrainParty,
 } from '../../domain/party/party.js';
-import { mayNotMove, type TrainMove } from '../../domain/party/train.js';
+import type { TrainMove } from '../../domain/party/train.js';
 import {
   AT_END_CODES,
   isDialogMove,
@@ -34,17 +34,20 @@ import {
   ROUTE_CHOICES,
   type DialogMove,
 } from '../../render/train-dialogs.js';
-import { atEndSentence, trainKindSentence, whereText } from '../../render/train-words.js';
-import type { TrainManage } from '../../services/train-service.js';
 import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
-import { moveTrainAs, trainPlaces, trainRefusal } from './train-changes.js';
+import {
+  manageRefusal,
+  manageTrainAs,
+  movedOnWords,
+  moveTrainAs,
+  trainPlaces,
+  type ManagePicked,
+  type ManageShown,
+} from './train-changes.js';
 
 const A_TRAIN = { type: 'train' } as const;
 
-/** Why a train refused, as a sentence. */
-const refusal = trainRefusal;
-
 /**
  * `/next`, `/previous`, `/skip` and `/finish`: moves the train of this post along its route and
  * tells the member where it is now. The others are told a moment later, in the post
@@ -150,8 +153,8 @@ function movableTrain(
   const party = ctx.parties.get(partyId);
   if (!party) throw new UserError(partyOver(A_TRAIN));
   if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
-  const problem = mayNotMove(party, interaction.user.id, isStaff(interaction, ctx));
-  if (problem) throw new UserError(refusal(ctx, problem));
+  const refused = manageRefusal(ctx, party, interaction.user.id, isStaff(interaction, ctx));
+  if (refused !== undefined) throw new UserError(refused);
   return party;
 }
 
@@ -186,12 +189,6 @@ export async function openManage(
   await interaction.showModal(manageDialog({ ...trainPlaces(ctx, party), now: Date.now() }));
 }
 
-/** What a Submit is told when the train moved on, or its route changed, since it opened. */
-const MOVED_ON = 'The train has moved on since you opened this: ';
-
-/** The refusals of a change that the train's moving on, or its route's change, explain. */
-const STALE_MOVES: ReadonlySet<string> = new Set(['train-moved-on', 'route-changed']);
-
 /**
  * The move a Submit of Move… asks for and where it leads: the dialog's id carries them where it
  * had one move left, else the radio choice does (`<move>:<target>`). Undefined for anything
@@ -213,23 +210,6 @@ function askedMove(
   return isDialogMove(move) && target !== undefined ? { from, move, target } : undefined;
 }
 
-/**
- * The words of a refusal of a Submit: where the train moved on, or its route changed, since the
- * dialog opened, where it is now (`MOVED_ON`); otherwise as the commands say it.
- */
-function submitRefusal(
-  ctx: AppContext,
-  partyId: string,
-  reason: string | undefined,
-  text: string,
-): string {
-  const now = ctx.parties.get(partyId);
-  if (reason !== undefined && STALE_MOVES.has(reason) && now && isTrain(now)) {
-    return `${MOVED_ON}${whereText(trainPlaces(ctx, now), 'post')}`;
-  }
-  return text;
-}
-
 /**
  * Submit of Move… (`party:<id>:moveform:…`): acknowledged privately, then the move made as
  * `/next` and the others make it (`moveTrainAs`, with where the train was when the dialog opened
@@ -262,7 +242,7 @@ export async function submitMove(
   );
   await say(
     answer.kind === 'refused'
-      ? submitRefusal(ctx, partyId, answer.reason, answer.text)
+      ? movedOnWords(ctx, partyId, answer.reason, answer.text, 'post')
       : answer.text,
   );
 }
@@ -272,14 +252,15 @@ const AT_END_OF_CODE = new Map(TRAIN_AT_END.map((atEnd) => [AT_END_CODES[atEnd],
 const KIND_OF_CODE = new Map(TRAIN_KINDS.map((kind) => [KIND_CODES[kind], kind]));
 
 /**
- * What a Submit of Manage… asks: where the train was, the stop the route began with, and each
- * part only where it was picked otherwise than the dialog showed it (review R5). Undefined for
- * a dialog of another shape or a forged one.
+ * What a Submit of Manage… showed and picked: where the train was, the stop the route began
+ * with, the mode and the kind as the custom id carries them, and what its choices hold (the mode
+ * not asked of a train without a route; "The route" left out where only Keep was left).
+ * Undefined for a dialog of another shape or a forged one.
  */
 function askedManage(
   interaction: ModalSubmitInteraction,
   args: readonly string[],
-): { from: string; first: string; asked: TrainManage } | undefined {
+): { shown: ManageShown; picked: ManagePicked } | undefined {
   const [from, first, shownAtEnd, shownKind] = withoutOpenToken(args);
   const wasAtEnd = AT_END_OF_CODE.get(shownAtEnd ?? '');
   const wasKind = KIND_OF_CODE.get(shownKind ?? '');
@@ -291,47 +272,20 @@ function askedManage(
     ? selectedOf<TrainAtEnd>(interaction, MANAGE_AT_END_INPUT, TRAIN_AT_END)
     : wasAtEnd;
   if (atEnd === undefined) return undefined;
-  // "The route" is left out where only Keep was left.
   const route = interaction.fields.fields.has(MANAGE_ROUTE_INPUT)
     ? pickedOf(interaction, MANAGE_ROUTE_INPUT, ROUTE_CHOICES)
     : 'keep';
   if (route === undefined) return undefined;
   return {
-    from,
-    first,
-    asked: {
-      ...(kind === wasKind ? {} : { kind }),
-      ...(route === 'keep' ? {} : { route }),
-      ...(atEnd === wasAtEnd ? {} : { atEnd }),
-    },
+    shown: { from, first, atEnd: wasAtEnd, kind: wasKind },
+    picked: { kind, route, atEnd },
   };
 }
 
-/** What a Submit of Manage… that changes nothing is told. */
-const NOTHING_CHANGED = 'Nothing changed.';
-
-/** What a Submit of Manage… says it did, in the words of the commands and of the map. */
-function managedWords(
-  ctx: AppContext,
-  party: TrainParty,
-  done: { kindSet: boolean; route?: 'reversed' | 'finished'; atEndSet: boolean },
-): string {
-  const said = [
-    done.kindSet ? trainKindSentence(party.train.kind) : undefined,
-    done.route === 'reversed' ? 'The route is reversed.' : undefined,
-    done.atEndSet ? atEndSentence(party.train.atEnd) : undefined,
-    // A finished route says so itself ("The train has finished its route of N stops.").
-    done.route === undefined ? undefined : whereText(trainPlaces(ctx, party), 'post'),
-  ].filter((sentence) => sentence !== undefined);
-  return said.length === 0 ? NOTHING_CHANGED : said.join(' ');
-}
-
 /**
  * Submit of Manage… (`party:<id>:manageform:…`): acknowledged privately, then what was picked
- * otherwise than shown applied as one change (`TrainService.manage`: the kind, the route, the
- * mode, all or nothing), answered with what it did; nothing picked otherwise is "Nothing
- * changed." A route change from a dialog opened before the train moved on, or its route
- * changed, is refused with where the train is now.
+ * otherwise than shown applied as one change and answered as `manageTrainAs` words it (the one
+ * code path of the dialog and the map's form, plan 8M-8C).
  */
 export async function submitManage(
   interaction: ModalSubmitInteraction,
@@ -346,21 +300,14 @@ export async function submitManage(
   const party = ctx.parties.get(partyId);
   if (!party) return void (await say(partyOver(A_TRAIN)));
   if (!isTrain(party)) return void (await say(STALE_COMPONENT));
-  if (Object.keys(asked.asked).length === 0) return void (await say(NOTHING_CHANGED));
-  const outcome = await ctx.trains.manage(
-    partyId,
+  const answer = await manageTrainAs(
+    ctx,
+    party,
     actingMember(interaction),
     isStaff(interaction, ctx),
-    asked.asked,
-    { from: asked.from, first: asked.first },
+    asked.shown,
+    asked.picked,
+    'post',
   );
-  if (outcome.kind === 'gone') return void (await say(partyOver(A_TRAIN)));
-  if (outcome.kind === 'refused') {
-    const text = refusal(ctx, outcome.reason);
-    const words = submitRefusal(ctx, partyId, outcome.reason, text);
-    // Of several parts asked, none was applied: said, as one refusal refuses all (review r0 B2).
-    const several = Object.keys(asked.asked).length > 1;
-    return void (await say(several ? `${words} Nothing was changed.` : words));
-  }
-  await say(managedWords(ctx, outcome.party, outcome));
+  await say(answer.text);
 }
diff --git a/src/commands/trains/split.ts b/src/commands/trains/split.ts
index 2dd1cbebbd501f673161e33df7049c1f94960499..b1b2484bae85523af691fcbdbb6b1a722e9fc5dd 100644
--- a/src/commands/trains/split.ts
+++ b/src/commands/trains/split.ts
@@ -11,13 +11,7 @@ import { deferSubmit, readInTime, withoutOpenToken } from '../../discord/dialog.
 import { UserError } from '../../discord/errors.js';
 import { isStaff, notATrain } from '../../discord/guards.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
-import {
-  attendeeOf,
-  isGroupId,
-  isTrain,
-  type GroupId,
-  type TrainParty,
-} from '../../domain/party/party.js';
+import { isGroupId, isTrain, type GroupId, type TrainParty } from '../../domain/party/party.js';
 import { RaidPrivacy } from '../../domain/party/status.js';
 import { mayNotSplit, splittableGroups } from '../../domain/party/train.js';
 import { SPLIT_GROUP_INPUT, splitChoice, splitDialog } from '../../render/train-split.js';
@@ -30,7 +24,13 @@ import {
   typedGroup,
 } from '../parties/reply.js';
 import { DISCORD_NAMES } from '../raids/report.js';
-import { splitGroupAs, splitRefusal, trainRefusal } from './train-changes.js';
+import {
+  GROUPS_CHANGED,
+  SPLIT_FAILED,
+  splitGroupAs,
+  splitRefusal,
+  splitRefusalFor,
+} from './train-changes.js';
 
 /*
  * Splitting a group off a train (plans 8T, 8T-H) on Discord: the post's "Split…" and
@@ -42,12 +42,6 @@ import { splitGroupAs, splitRefusal, trainRefusal } from './train-changes.js';
 
 const A_TRAIN = { type: 'train' } as const;
 
-/** What a Submit answers when the split failed (the old train is as it was). */
-const SPLIT_FAILED = 'The split did not work: nothing was split off.';
-
-/** What a Submit answers for a group called otherwise, or gone, since the dialog opened. */
-const GROUPS_CHANGED = 'The groups of this train changed meanwhile: press Split… again.';
-
 /**
  * The dialog for this member, of these groups, as things stand now; who leads the new train as
  * their privacy says (`/settings privacy`, as the split itself reads it; the Submit reads it
@@ -70,30 +64,6 @@ async function dialogFor(
   );
 }
 
-/**
- * Why the member may split no group of the train, in words: a train of one group, one without
- * a post yet, or the new train of a split not settled yet; for staff and the conductor, who may
- * split any other group, what the group that has members says (everybody in it: `whole-train`),
- * or that nobody is in any (`empty-group`); for anybody else what their own group says (the
- * conductor in it, everybody in it), and for anybody in no group `not-in-group`.
- */
-function whyNot(ctx: AppContext, party: TrainParty, memberId: string, staff: boolean): string {
-  if (party.groups.length < 2) return trainRefusal(ctx, 'one-group');
-  if (party.forumPostId === null) return trainRefusal(ctx, 'unposted');
-  if (party.train.splitFrom?.pending === true) return trainRefusal(ctx, 'split-pending');
-  if (staff || party.train.conductorId === memberId) {
-    const filled = Object.values(party.attendees)[0]?.group;
-    return filled === undefined
-      ? trainRefusal(ctx, 'empty-group')
-      : splitRefusal(ctx, party, 'whole-train', filled);
-  }
-  const own = attendeeOf(party, memberId)?.group;
-  const problem = own === undefined ? undefined : mayNotSplit(party, memberId, staff, own);
-  return problem === undefined || own === undefined
-    ? trainRefusal(ctx, 'not-in-group')
-    : splitRefusal(ctx, party, problem, own);
-}
-
 /**
  * "Split…" of a train's post: the dialog of the one group the member may split, or the
  * one that asks which when they may split several (the conductor, staff: `splittableGroups`, in
@@ -114,7 +84,9 @@ export async function openSplit(
   // is picked on purpose (Android picks a radio group's first choice by itself).
   // `splittableGroups` keeps the party's order, which is the letters' (review r0 A3).
   const [first, ...rest] = groups;
-  if (first === undefined) throw new UserError(whyNot(ctx, party, interaction.user.id, staff));
+  if (first === undefined) {
+    throw new UserError(splitRefusalFor(ctx, party, interaction.user.id, staff));
+  }
   await interaction.showModal(
     await dialogFor(interaction, ctx, party, interaction.user.id, staff, [first, ...rest]),
   );
diff --git a/src/commands/trains/train-changes.test.ts b/src/commands/trains/train-changes.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b49b6938582a08ddb1e1834f4ccfba0969803483
--- /dev/null
+++ b/src/commands/trains/train-changes.test.ts
@@ -0,0 +1,125 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
+import { createdTrain } from '../../../test/support/party-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import { manageForm } from '../../render/train-dialogs.js';
+import {
+  manageRefusal,
+  manageTrainAs,
+  MOVED_ON,
+  NOTHING_CHANGED,
+  splitRefusalFor,
+  trainPlaces,
+} from './train-changes.js';
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
+  /** What Manage… shows of the train now, as its form gives it back. */
+  const shown = () => manageForm(trainPlaces(ctx, made.current())).shown;
+  return { ...made, ctx, shown };
+}
+
+describe('Manage…’s Submit as one code path for the dialog and the map (plan 8M-8C)', () => {
+  it('applies only what was picked otherwise than shown, and nothing asked is "Nothing changed."', async () => {
+    const made = await setup();
+    const alice = made.shown();
+    // Bob makes it loop while Alice's form is open; she changes only the kind.
+    await made.trains.setAtEnd(made.party.id, { id: BOB }, false, 'loop');
+    const answer = await manageTrainAs(
+      made.ctx,
+      made.current(),
+      { id: ALICE, name: 'Alice' },
+      false,
+      alice,
+      { kind: 'gigantamax', route: 'keep', atEnd: 'finish' },
+      'post',
+    );
+    expect(answer).toEqual({ kind: 'ok', text: 'This train is a Gigantamax Train now.' });
+    expect(made.current().train).toMatchObject({ kind: 'gigantamax', atEnd: 'loop' });
+    const again = made.shown();
+    expect(
+      await manageTrainAs(
+        made.ctx,
+        made.current(),
+        { id: ALICE },
+        false,
+        again,
+        { kind: again.kind, atEnd: again.atEnd },
+        'post',
+      ),
+    ).toEqual({ kind: 'ok', text: NOTHING_CHANGED });
+  });
+
+  it('refuses a route change from a form drawn where the train no longer is, with where it is now, and says nothing of several parts was changed', async () => {
+    const made = await setup();
+    const early = made.shown();
+    await made.trains.move(made.party.id, { id: BOB }, 'next', false);
+    const late = await manageTrainAs(
+      made.ctx,
+      made.current(),
+      { id: ALICE },
+      false,
+      early,
+      { kind: 'dynamax', route: 'finish' },
+      'post',
+    );
+    expect(late.kind).toBe('refused');
+    expect(late.text.startsWith(`${MOVED_ON}The train is at stop 2 of 4`)).toBe(true);
+    expect(late.text.endsWith(' Nothing was changed.')).toBe(true);
+    expect(made.current().train).toMatchObject({ stop: 1, kind: 'raid' });
+  });
+
+  it('names what takes a finished route back as the member has it there', async () => {
+    const made = await setup();
+    const finished = await manageTrainAs(
+      made.ctx,
+      made.current(),
+      { id: ALICE },
+      false,
+      made.shown(),
+      { kind: 'raid', route: 'finish' },
+      'command',
+    );
+    expect(finished.text).toMatch(
+      /^The train has finished its route of 4 stops\. `\/previous` takes it back to stop 1: /,
+    );
+  });
+
+  it('says why Manage… does not open, as the dialog refuses it: for who may move the train and staff', async () => {
+    const made = await setup();
+    expect(manageRefusal(made.ctx, made.current(), ALICE, false)).toBeUndefined();
+    expect(manageRefusal(made.ctx, made.current(), CAROL, false)).toBe(
+      'You are not signed up for this train.',
+    );
+    expect(manageRefusal(made.ctx, made.current(), CAROL, true)).toBeUndefined();
+  });
+
+  it('says why a member may split no group, as the dialog refuses it', async () => {
+    const made = await setup();
+    expect(splitRefusalFor(made.ctx, made.current(), ALICE, false)).toBe(
+      'This train has one group: there is no group to split off it.',
+    );
+    expect(splitRefusalFor(made.ctx, made.current(), REPORTER, true)).toBe(
+      'This train has one group: there is no group to split off it.',
+    );
+  });
+});
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index 71cba43425a7762632294346d3405e88f497a537..e20fadb14e4ee0a8627008d5cb25e6ff0b73dc08 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -1,5 +1,6 @@
 import type { AppContext } from '../../app-context.js';
 import {
+  attendeeOf,
   groupOf,
   isTrain,
   MAX_ROUTE_STOPS,
@@ -12,6 +13,8 @@ import type { GroupId, PartyProblem, TrainAtEnd, TrainKind } from '../../domain/
 import { sameStop, type StopRef } from '../../domain/party/stops.js';
 import {
   currentStop,
+  mayNotMove,
+  mayNotSplit,
   routeFinished,
   splitDrawn,
   type ConductorSeen,
@@ -30,7 +33,7 @@ import {
 } from '../../render/train-words.js';
 import type { Member } from '../../services/attendance-service.js';
 import type { TrainOutcome } from '../../services/party-service.js';
-import type { TrainChangeOutcome } from '../../services/train-service.js';
+import type { TrainChangeOutcome, TrainManage } from '../../services/train-service.js';
 import type { SavedRoute } from '../../db/repositories/saved-route-repository.js';
 import { MAX_SAVED_ROUTES } from '../../db/repositories/saved-route-repository.js';
 import { partyOver } from '../parties/reply.js';
@@ -462,9 +465,176 @@ export async function setKindAs(
   return answerOf(ctx, outcome, (ok) => trainKindSentence(ok.party.train.kind));
 }
 
+/**
+ * What Manage… needs (plan 8M-8C): what changing a train needs, and the store, which says where
+ * the train is now when a change from a form drawn elsewhere is refused.
+ */
+export type TrainManaging = TrainChanging & Pick<AppContext, 'parties'>;
+
+/** What a Submit is told when the train moved on, or its route changed, since its form opened. */
+export const MOVED_ON = 'The train has moved on since you opened this: ';
+
+/** The refusals of a change that the train's moving on, or its route's change, explain. */
+const STALE_MOVES: ReadonlySet<string> = new Set(['train-moved-on', 'route-changed']);
+
+/**
+ * The words of a refusal of Move…'s or Manage…'s Submit (on Discord and on the map): where the
+ * train moved on, or its route changed, since the form opened, where it is now (`MOVED_ON`, with
+ * `whereText` as the member has it there, `surface`); otherwise `text`, as the commands say it.
+ */
+export function movedOnWords(
+  ctx: TrainManaging,
+  partyId: string,
+  reason: string | undefined,
+  text: string,
+  surface: TrainSurface,
+): string {
+  const now = ctx.parties.get(partyId);
+  if (reason !== undefined && STALE_MOVES.has(reason) && now && isTrain(now)) {
+    return `${MOVED_ON}${whereText(trainPlaces(ctx, now), surface)}`;
+  }
+  return text;
+}
+
+/**
+ * Why Move… and Manage… do not open for this member (plan 8X-G: for who may move the train and
+ * staff, `mayNotMove`), in the commands' words; undefined where they open. On Discord before the
+ * dialog, on the map before the form.
+ */
+export function manageRefusal(
+  ctx: Pick<AppContext, 'attendance'>,
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+): string | undefined {
+  const problem = mayNotMove(party, memberId, staff);
+  return problem === undefined ? undefined : trainRefusal(ctx, problem);
+}
+
+/**
+ * What Manage… showed (on Discord its custom id carries it, on the map its form sends it back):
+ * where the train was (`placeOf`), the stop the route began with (`stopHandle`, or `-` without a
+ * route), and the mode and the kind it showed picked.
+ */
+export interface ManageShown {
+  from: string;
+  first: string;
+  atEnd: TrainAtEnd;
+  kind: TrainKind;
+}
+
+/**
+ * What was picked in Manage…: the kind; the route (left out where the form had only Keep); the
+ * mode (left out for a train without a route, whose form asks its kind alone).
+ */
+export interface ManagePicked {
+  kind: TrainKind;
+  route?: 'keep' | 'reverse' | 'finish';
+  atEnd?: TrainAtEnd;
+}
+
+/** What a Submit of Manage… that changes nothing is told. */
+export const NOTHING_CHANGED = 'Nothing changed.';
+
+/** What a Submit of Manage… says it did, in the words of the commands. */
+function managedWords(
+  ctx: TrainChanging,
+  party: TrainParty,
+  done: { kindSet: boolean; route?: 'reversed' | 'finished'; atEndSet: boolean },
+  surface: TrainSurface,
+): string {
+  const said = [
+    done.kindSet ? trainKindSentence(party.train.kind) : undefined,
+    done.route === 'reversed' ? 'The route is reversed.' : undefined,
+    done.atEndSet ? atEndSentence(party.train.atEnd) : undefined,
+    // A finished route says so itself ("The train has finished its route of N stops.").
+    done.route === undefined ? undefined : whereText(trainPlaces(ctx, party), surface),
+  ].filter((sentence) => sentence !== undefined);
+  return said.length === 0 ? NOTHING_CHANGED : said.join(' ');
+}
+
+/**
+ * The Submit of Manage… (plan 8X-G on Discord, plan 8M-8C on the map): only what was picked
+ * otherwise than shown is asked (review R5: a form opened before somebody else set the mode does
+ * not set it back), and nothing asked is `Nothing changed.`; what is asked is one change
+ * (`TrainService.manage`: the kind, the route, the mode, all or nothing, with where the train was
+ * and the stop the route began with). A refusal of a route change from a form drawn where the
+ * train no longer is says where it is now (`movedOnWords`); a refusal of several parts adds that
+ * nothing was changed (review r0 B2). `surface` names what takes a finished route back.
+ */
+export async function manageTrainAs(
+  ctx: TrainManaging,
+  party: TrainParty,
+  member: Member,
+  staff: boolean,
+  shown: ManageShown,
+  picked: ManagePicked,
+  surface: TrainSurface,
+): Promise<TrainAnswer> {
+  const asked: TrainManage = {
+    ...(picked.kind === shown.kind ? {} : { kind: picked.kind }),
+    ...(picked.route === undefined || picked.route === 'keep' ? {} : { route: picked.route }),
+    ...(picked.atEnd === undefined || picked.atEnd === shown.atEnd ? {} : { atEnd: picked.atEnd }),
+  };
+  if (Object.keys(asked).length === 0) return { kind: 'ok', text: NOTHING_CHANGED };
+  const outcome = await ctx.trains.manage(party.id, member, staff, asked, {
+    from: shown.from,
+    first: shown.first,
+  });
+  if (outcome.kind === 'gone') return { kind: 'gone', text: TRAIN_OVER };
+  if (outcome.kind === 'refused') {
+    const text = trainRefusal(ctx, outcome.reason);
+    const words = movedOnWords(ctx, party.id, outcome.reason, text, surface);
+    // Of several parts asked, none was applied: said, as one refusal refuses all (review r0 B2).
+    const several = Object.keys(asked).length > 1;
+    return {
+      kind: 'refused',
+      text: several ? `${words} Nothing was changed.` : words,
+      reason: outcome.reason,
+    };
+  }
+  return { kind: 'ok', text: managedWords(ctx, outcome.party, outcome, surface) };
+}
+
 /** What splitting a group off needs: the train service, the members' privacy, the words. */
 export type TrainSplitting = Pick<AppContext, 'trains' | 'attendance' | 'users' | 'parties'>;
 
+/** What a Submit of Split… answers when the split failed (the old train is as it was). */
+export const SPLIT_FAILED = 'The split did not work: nothing was split off.';
+
+/** What a Submit of Split… answers for a group called otherwise, or gone, since it opened. */
+export const GROUPS_CHANGED = 'The groups of this train changed meanwhile: press Split… again.';
+
+/**
+ * Why the member may split no group of the train, in words (plan 8T-H; on Discord before the
+ * dialog, on the map before the form): a train of one group, one without a post yet, or the new
+ * train of a split not settled yet; for staff and the conductor, who may split any other group,
+ * what the group that has members says (everybody in it: `whole-train`), or that nobody is in any
+ * (`empty-group`); for anybody else what their own group says (the conductor in it, everybody in
+ * it), and for anybody in no group `not-in-group`.
+ */
+export function splitRefusalFor(
+  ctx: Pick<AppContext, 'attendance'>,
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+): string {
+  if (party.groups.length < 2) return trainRefusal(ctx, 'one-group');
+  if (party.forumPostId === null) return trainRefusal(ctx, 'unposted');
+  if (party.train.splitFrom?.pending === true) return trainRefusal(ctx, 'split-pending');
+  if (staff || party.train.conductorId === memberId) {
+    const filled = Object.values(party.attendees)[0]?.group;
+    return filled === undefined
+      ? trainRefusal(ctx, 'empty-group')
+      : splitRefusal(ctx, party, 'whole-train', filled);
+  }
+  const own = attendeeOf(party, memberId)?.group;
+  const problem = own === undefined ? undefined : mayNotSplit(party, memberId, staff, own);
+  return problem === undefined || own === undefined
+    ? trainRefusal(ctx, 'not-in-group')
+    : splitRefusal(ctx, party, problem, own);
+}
+
 /**
  * Why a member may not split a group off this train, in the command's words: as any refusal of a
  * train (`trainRefusal`), but a group that holds everybody on the train is named (Matt,
diff --git a/src/render/train-dialogs.ts b/src/render/train-dialogs.ts
index c05d538fb77844e072555e8fca51b66e1abe8866..53a2df6e6edc2e7e87bc1bd4991c8d0b2dff05be 100644
--- a/src/render/train-dialogs.ts
+++ b/src/render/train-dialogs.ts
@@ -69,7 +69,7 @@ const CHOICE_ROOM = 100;
 const SKIP_NAME_ROOM = 40;
 
 /** A move Move… offers: where it leads, its choice's label, and the sentence of Submit alone. */
-interface OfferedMove {
+export interface OfferedMove {
   move: DialogMove;
   target: string;
   label: string;
@@ -348,8 +348,11 @@ export const KIND_CODES: Readonly<Record<TrainKind, string>> = {
 /** What stands in for the first stop of a route that has none, in Manage…'s custom id. */
 export const NO_FIRST = '-';
 
-/** "The route" of Manage…: Keep first and picked, then what `cannotReverse` and the route allow. */
-function routeChoice(view: TrainPlaces): DialogChoice | undefined {
+/**
+ * "The route" of Manage…: Keep first and picked, then what `cannotReverse` and the route allow;
+ * undefined where only Keep is left. The live map's form offers the same (plan 8M-8C).
+ */
+export function routeChoice(view: TrainPlaces): DialogChoice | undefined {
   const { party } = view;
   const options: DialogOption[] = [{ value: 'keep', label: 'Keep it as it is' }];
   if (cannotReverse(party) === undefined) {
@@ -383,19 +386,59 @@ function routeChoice(view: TrainPlaces): DialogChoice | undefined {
  */
 export function manageDialog(view: TrainDialogView): APIModalInteractionResponseCallbackData {
   const { party } = view;
-  const [first] = party.train.route;
+  const form = manageForm(view);
   const customId = encodeCustomId({
     kind: PARTY_KIND,
     id: party.id,
     action: MANAGE_FORM,
     args: [
-      placeOf(party),
-      first === undefined ? NO_FIRST : stopHandle(first),
-      AT_END_CODES[party.train.atEnd],
-      KIND_CODES[party.train.kind],
+      form.shown.from,
+      form.shown.first,
+      AT_END_CODES[form.shown.atEnd],
+      KIND_CODES[form.shown.kind],
       openToken(view.now),
     ],
   });
+  return dialog({
+    customId,
+    title: form.title,
+    text: form.text,
+    choices: [
+      ...(form.route === undefined ? [] : [form.route]),
+      ...(form.atEnd === undefined ? [] : [form.atEnd]),
+      form.kind,
+    ],
+  });
+}
+
+/**
+ * What Manage… says, asks and showed (plan 8X-G), apart from Discord's dialog, so that one
+ * builder serves the dialog and the live map's form (plan 8M-8C): its title; its text (where the
+ * train is, `trainStateText`; without a route `NO_ROUTE_YET`); "The route" where more than Keep is
+ * left; "At the end of the route" (not for a train without a route) and "What the train is
+ * mainly for", each with the train's own picked; and what it showed (`shown`): where the train
+ * was, the stop the route began with (`NO_FIRST` without a route), the mode and the kind.
+ */
+export interface ManageForm {
+  title: string;
+  /** Discord's markdown: the map makes it text of the page. */
+  text: string;
+  route?: DialogChoice;
+  atEnd?: DialogChoice;
+  kind: DialogChoice;
+  shown: { from: string; first: string; atEnd: TrainAtEnd; kind: TrainKind };
+}
+
+/** Manage… as `manageDialog` draws it (`ManageForm`), without Discord's parts. */
+export function manageForm(view: TrainPlaces): ManageForm {
+  const { party } = view;
+  const [first] = party.train.route;
+  const shown = {
+    from: placeOf(party),
+    first: first === undefined ? NO_FIRST : stopHandle(first),
+    atEnd: party.train.atEnd,
+    kind: party.train.kind,
+  };
   const kind: DialogChoice = {
     id: MANAGE_KIND_INPUT,
     label: TRAIN_KIND_QUESTION,
@@ -408,9 +451,8 @@ export function manageDialog(view: TrainDialogView): APIModalInteractionResponse
     })),
     picked: party.train.kind,
   };
-  if (party.train.route.length === 0) {
-    return dialog({ customId, title: 'Manage the train', text: NO_ROUTE_YET, choices: [kind] });
-  }
+  const title = 'Manage the train';
+  if (party.train.route.length === 0) return { title, text: NO_ROUTE_YET, kind, shown };
   const atEnd: DialogChoice = {
     id: MANAGE_AT_END_INPUT,
     label: 'At the end of the route',
@@ -424,11 +466,13 @@ export function manageDialog(view: TrainDialogView): APIModalInteractionResponse
     picked: party.train.atEnd,
   };
   const route = routeChoice(view);
-  return dialog({
-    customId,
-    title: 'Manage the train',
+  return {
+    title,
     // Of a finished route only that it is: where Previous leads is Move…'s (review r0 B3).
     text: trainStateText(view),
-    choices: [...(route === undefined ? [] : [route]), atEnd, kind],
-  });
+    ...(route === undefined ? {} : { route }),
+    atEnd,
+    kind,
+    shown,
+  };
 }
diff --git a/src/render/train-split.ts b/src/render/train-split.ts
index 8be3a18010d7485a4e9e903d8258e1c58538a7d6..bb0c4f8386ef55075a153fccc63dff6083593603 100644
--- a/src/render/train-split.ts
+++ b/src/render/train-split.ts
@@ -256,41 +256,60 @@ export function splitDialog(
   view: SplitView,
   groups: readonly [GroupId, ...GroupId[]],
 ): APIModalInteractionResponseCallbackData {
+  const form = splitForm(view, groups);
+  const token = openToken(view.now);
+  const args = form.only === undefined ? [token] : [form.only.group, form.only.mark, token];
+  return dialog({
+    customId: encodeCustomId({ kind: PARTY_KIND, id: view.party.id, action: SPLIT_FORM, args }),
+    title: form.title,
+    text: form.text,
+    ...(form.choice === undefined
+      ? {}
+      : {
+          choice: { id: SPLIT_GROUP_INPUT, label: form.choice.label, options: form.choice.options },
+        }),
+  });
+}
+
+/**
+ * What the dialog of a split says and asks (plan 8T-H), apart from Discord's dialog, so that one
+ * builder serves the dialog and the live map's form (plan 8M-8C): its title and text; for one
+ * group the group and its mark (`only`: Submit splits it); for several the choice "Group that
+ * leaves" of `groups` in their order, nothing picked, each value `<group>:<mark>`.
+ */
+export interface SplitForm {
+  title: string;
+  /** Discord's markdown: the map makes it text of the page. */
+  text: string;
+  only?: { group: GroupId; mark: string };
+  choice?: { label: string; options: Array<{ value: string; label: string }> };
+}
+
+/** The dialog of a split as `splitDialog` draws it (`SplitForm`), without Discord's parts. */
+export function splitForm(view: SplitView, groups: readonly [GroupId, ...GroupId[]]): SplitForm {
   const { party } = view;
   const [first] = groups;
   if (groups.length === 1) {
-    return dialog({
-      customId: encodeCustomId({
-        kind: PARTY_KIND,
-        id: party.id,
-        action: SPLIT_FORM,
-        args: [first, groupMark(party, first) ?? '0', openToken(view.now)],
-      }),
+    return {
       title: TITLE,
       text: oneGroupText(view, first),
-    });
+      only: { group: first, mark: groupMark(party, first) ?? '0' },
+    };
   }
   const head =
     `The group you pick leaves **${plain(nameOf(party))}** and becomes a train of its own, ` +
     `named after the group (**${plain(nameOf(previewOf(view, first)))}**): ` +
     `${whereWords(view)}. Its members move to it as they are signed up now.` +
     leadSentences(view, groups);
-  return dialog({
-    customId: encodeCustomId({
-      kind: PARTY_KIND,
-      id: party.id,
-      action: SPLIT_FORM,
-      args: [openToken(view.now)],
-    }),
+  return {
     title: TITLE,
     text: `${head}\n\n${groupLines(party, groups, TEXT_ROOM - head.length - 2)}`,
     choice: {
-      id: SPLIT_GROUP_INPUT,
       label: 'Group that leaves',
       options: groups.map((id) => ({
         label: choiceLabel(party, groupOf(party, id) ?? { id }),
         value: choiceValue(party, id),
       })),
     },
-  });
+  };
 }
````

### Task 2: 8M-8C task 2: Manage... on the map as the post's dialog

Prototype commit: `7e4f697b38a1255292363f412f81d3b55eaf3494`

GET .../trains/<id>/manage answers what Manage...'s dialog shows now
(manageForm: where the train is, The route, At the end of the route,
What the train is mainly for, each with the train's own picked, and
what was shown), for who may move the train and staff (manageRefusal,
422 in its words) and refused while the post controls' window is full,
uncounted. POST .../manage sends back what was shown with what is
picked and goes the dialog's way (manageTrainAs): one use in the post
controls' window, a stale route change 409 with the train and the
dialog's words. A train without a route is asked its kind alone.

The old panel's presses finish, reverse, at-end and kind answer 404:
the moves keep Next, Previous and Skip. reverseRouteAs, setAtEndAs and
setKindAs and MapTrainRights.kind are gone. On the page Manage... opens
the form in the place of the post (train-post-forms.ts over 8M-8B's
dialogForm), the conductor's buttons are in the member's part, and a
409 that gives the train is a refusal, not a party that is over.

**Files:**

```
 src/commands/trains/manage-dialog.test.ts     |   2 +-
 src/commands/trains/route.test.ts             |   4 +-
 src/commands/trains/train-changes.test.ts     |   2 +-
 src/commands/trains/train-changes.ts          |  54 +---------------------
 src/domain/web/party-data.ts                  |  32 ++++++-------
 src/domain/web/party-view.test.ts             |  44 ++++++++++--------
 src/domain/web/party-view.ts                  |  45 +++++++++---------
 src/domain/web/train-data.ts                  |  72 ++++++++++++++++++++++++-----
 src/services/train-service.test.ts            |  58 +++++++++++------------
 src/services/train-service.ts                 |  65 --------------------------
 src/web/client/parties.test.ts                |   4 +-
 src/web/client/party-layer.ts                 |  12 +++--
 src/web/client/post-draw.test.ts              |  75 ++++++++++++++++++------------
 src/web/client/post-draw.ts                   | 127 +++++++++++++++++---------------------------------
 src/web/client/post-forms-ui.isolated.test.ts |  60 ++++++++++++++++++++++++
 src/web/client/post-forms-ui.ts               |  35 ++++++++++++--
 src/web/client/post-forms.ts                  |  17 +++++--
 src/web/client/raid-ui.ts                     |   7 +--
 src/web/client/train-forms.test.ts            |  48 +++++++------------
 src/web/client/train-forms.ts                 |  64 ++++++++-----------------
 src/web/client/train-post-forms.test.ts       | 139 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-post-forms.ts            |  70 ++++++++++++++++++++++++++++
 src/web/client/train-ui.isolated.test.ts      |   5 +-
 src/web/client/train-ui.ts                    |  10 ++--
 src/web/client/what-is-on.test.ts             |   2 +-
 src/web/party-routes.ts                       |   5 ++
 src/web/train-manage.test.ts                  | 372 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/train-move.test.ts                    | 131 ++++------------------------------------------------
 src/web/train-routes.ts                       | 269 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------------------------------
 src/web/train-views.ts                        |  23 +++++++++
 test/support/party-service.ts                 |  36 +++++++++++++--
 31 files changed, 1215 insertions(+), 674 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/trains/manage-dialog.test.ts src/commands/trains/route.test.ts src/commands/trains/train-changes.test.ts src/domain/web/party-view.test.ts src/services/train-service.test.ts src/web/client/parties.test.ts src/web/client/post-draw.test.ts src/web/client/post-forms-ui.isolated.test.ts src/web/client/train-forms.test.ts src/web/client/train-post-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/client/what-is-on.test.ts src/web/train-manage.test.ts src/web/train-move.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 7e4f697b38a1255292363f412f81d3b55eaf3494 -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8C task 2: Manage... on the map as the post's dialog`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/trains/manage-dialog.test.ts b/src/commands/trains/manage-dialog.test.ts
index b7dd318a7142d309661f17f7e20056d59f67b1ef..95c9452e59ea1dc3cc8eb7d4e73410319eabe77f 100644
--- a/src/commands/trains/manage-dialog.test.ts
+++ b/src/commands/trains/manage-dialog.test.ts
@@ -121,7 +121,7 @@ describe('Manage… of a train’s post (plan 8X-G)', () => {
     const made = await setup();
     const alice = shownDialog(await made.open());
     // Bob makes it loop while Alice's dialog is open; she changes only the kind.
-    await made.trains.setAtEnd(made.party.id, { id: BOB }, false, 'loop');
+    await made.setAtEnd({ id: BOB }, false, 'loop');
     await made.submit(alice, { atEnd: 'finish', kind: 'gigantamax' });
     expect(made.current().train).toMatchObject({ kind: 'gigantamax', atEnd: 'loop' });
     const again = shownDialog(await made.open());
diff --git a/src/commands/trains/route.test.ts b/src/commands/trains/route.test.ts
index e8ca68f4c99e1e8e5c2465cf0ddcdde8c49e9a4e..ffcfa1e983749f386c7651542bc6624e9c0feb62 100644
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -188,7 +188,7 @@ describe('/route show', () => {
 
   it('says nothing of the mode for a route of one stop: it finishes there in every mode', async () => {
     const made = await setup([4]);
-    await made.trains.setAtEnd(made.party.id, { id: ALICE }, false, 'loop');
+    await made.setAtEnd({ id: ALICE }, false, 'loop');
     expect(await made.answer('show')).toBe(
       [
         '**The route of Saturday legendaries**',
@@ -883,7 +883,7 @@ describe('/route save, load and forget', () => {
 
   it('save keeps the mode of the train, load sets it, and the list says it', async () => {
     const made = await setup();
-    await made.trains.setAtEnd(made.party.id, { id: ALICE }, false, 'turn-back');
+    await made.setAtEnd({ id: ALICE }, false, 'turn-back');
     expect(await made.answer('save', { name: 'Both ways' })).toBe(
       'I saved this route as **Both ways**: 3 stops. At the end it turns back and runs the ' +
         'route backwards. `/route load` puts it into a train of this region.',
diff --git a/src/commands/trains/train-changes.test.ts b/src/commands/trains/train-changes.test.ts
index b49b6938582a08ddb1e1834f4ccfba0969803483..696a0921f8445c6829b6c65b7c338c495ee3d4af 100644
--- a/src/commands/trains/train-changes.test.ts
+++ b/src/commands/trains/train-changes.test.ts
@@ -43,7 +43,7 @@ describe('Manage…’s Submit as one code path for the dialog and the map (plan
     const made = await setup();
     const alice = made.shown();
     // Bob makes it loop while Alice's form is open; she changes only the kind.
-    await made.trains.setAtEnd(made.party.id, { id: BOB }, false, 'loop');
+    await made.setAtEnd({ id: BOB }, false, 'loop');
     const answer = await manageTrainAs(
       made.ctx,
       made.current(),
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index e20fadb14e4ee0a8627008d5cb25e6ff0b73dc08..d961f7301f3b156b511fdfc494133bb492557640 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -81,7 +81,7 @@ export function trainPlaces(
 
 /** Why a train refused, as a sentence. */
 export function trainRefusal(
-  ctx: Pick<AppContext, 'attendance'>,
+  ctx: { attendance: Pick<AppContext['attendance'], 'limits'> },
   reason: Parameters<typeof problemText>[0],
 ): string {
   return problemText(reason, ctx.attendance.limits(), 'train');
@@ -413,58 +413,6 @@ export async function moveTrainAs(
   });
 }
 
-/**
- * Reverses the route as "Reverse the route" of the map's panel does (`TrainService.reverse`,
- * with where the panel was drawn and the gym the route began with then), and says where the
- * train is now: the map's panel, whose answer is words (the post has Manage…, plan 8X-G).
- */
-export async function reverseRouteAs(
-  ctx: TrainChanging,
-  party: TrainParty,
-  member: Member,
-  staff: boolean,
-  from: string,
-  first: string,
-): Promise<TrainAnswer> {
-  const outcome = await ctx.trains.reverse(party.id, member, staff, from, first);
-  return answerOf(
-    ctx,
-    outcome,
-    (ok) => `The route is reversed. ${whereText(trainPlaces(ctx, ok.party), 'map')}`,
-  );
-}
-
-/**
- * Sets what the train does at the end of its route as the menu of the map's panel does
- * (`TrainService.setAtEnd`, with where the panel was drawn), and says it: the map's panel.
- */
-export async function setAtEndAs(
-  ctx: TrainChanging,
-  party: TrainParty,
-  member: Member,
-  staff: boolean,
-  atEnd: TrainAtEnd,
-  from: string,
-): Promise<TrainAnswer> {
-  const outcome = await ctx.trains.setAtEnd(party.id, member, staff, atEnd, from);
-  return answerOf(ctx, outcome, (ok) => atEndSentence(ok.party.train.atEnd));
-}
-
-/**
- * Sets what kind of battles the train goes to as the kind menu of the map's panel does
- * (`TrainService.setKind`), and says it: the map's panel (plan 8X-5).
- */
-export async function setKindAs(
-  ctx: TrainChanging,
-  party: TrainParty,
-  member: Member,
-  staff: boolean,
-  kind: TrainKind,
-): Promise<TrainAnswer> {
-  const outcome = await ctx.trains.setKind(party.id, member, staff, kind);
-  return answerOf(ctx, outcome, (ok) => trainKindSentence(ok.party.train.kind));
-}
-
 /**
  * What Manage… needs (plan 8M-8C): what changing a train needs, and the store, which says where
  * the train is now when a change from a form drawn elsewhere is refused.
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 8209cc4891110d97dbc2c3814e5d7c93649cba15..d4e97538eab0f5d15430e8f428c873644b5b6b8d 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -293,23 +293,23 @@ export interface MapTrain {
    * What the member may do to its route on the map (plan 8M-5), as the commands decide it; all
    * false while read-only. `arrange`: add, remove and move stops (signed up, the maker, staff);
    * `clear`: empty the route (the conductor, staff); `load`: put a saved route into it (who may
-   * move the train, or the maker its first route); `kind`: set its kind (plan 8X-5).
+   * move the train, or the maker its first route).
    */
   may: MapTrainRights;
   /**
-   * The Manage train panel as the member may use it now (plan 8M-5), as the post's "Manage
-   * train…" opened it before plan 8X-G (the post has Move… and Manage… since; the map's panel
-   * waits for its UX pass): null for who may not move the train (`mayNotMove`), for a train without a route,
-   * and while read-only.
+   * The moves the member may make on the map now (plan 8M-5; Finish is Manage…'s since plan
+   * 8M-8C): null for who may not move the train (`mayNotMove`), for a train without a route, and
+   * while read-only.
    */
   panel: MapTrainPanel | null;
   /** Who leads the train, as the member sees it (nobody is named), and what they may do of it. */
   conductor: MapConductor;
   /**
    * Why the member may not move it on the map (plan 8M-8A, review N1; `moveRefusalOf`), null where
-   * they may: the page words it under the post's Move… and Manage….
+   * they may: the reason, and the words the page says under the post's Move… and Manage… (plan
+   * 8M-8C, review C1: the commands' words, `manageRefusal`'s, as text of the page).
    */
-  moveRefusal: MapMoveRefusal | null;
+  moveRefusal: { reason: MapMoveRefusal; text: string } | null;
   /** Staff's Delete… (plan 8M-8B); absent for anybody else. */
   close?: MapClose;
   /**
@@ -334,36 +334,30 @@ export interface MapTrainSpot {
 }
 
 /**
- * What a member may do to a train on the map (`MapTrain.may`); `kind`: set what it goes to
- * (plan 8X-5), as the panel's menu, for who may move it and staff (`mayNotMove`), also before it
- * has a route (when `panel` is null).
+ * What a member may do to a train on the map (`MapTrain.may`). Its kind is Manage…'s (plan 8M-8C),
+ * which opens for who may move the train (`MapTrain.moveRefusal`).
  */
 export interface MapTrainRights {
   arrange: boolean;
   clear: boolean;
   load: boolean;
-  kind: boolean;
 }
 
 /** What a train does at the last stop of its route, as `/train`'s option `at-end` takes it. */
 export type MapAtEnd = 'finish' | 'loop' | 'turn-back';
 
-/** The moves of a train along its route. */
-export type MapMove = 'next' | 'previous' | 'skip' | 'finish';
+/** The moves of a train along its route on the map (Finish is Manage…'s, plan 8M-8C). */
+export type MapMove = 'next' | 'previous' | 'skip';
 
 /**
- * The Manage train panel on the map: where the train is (`placeOf`: the handle of its stop, a gym's
+ * The moves of a train on the map: where the train is (`placeOf`: the handle of its stop, a gym's
  * id or a power spot's short hash, plan 8X-4; or `end` once the route is finished), which every
  * press carries as `from`; the moves that can be made from there, each with where it leads
- * (`targetOf`: a stop's handle, or `end`), which Next, Previous and Skip carry as `target`; the
- * handle of the stop the route begins with when it can be reversed from there (`cannotReverse`),
- * which Reverse carries as `first`, else null; what the train does at its end.
+ * (`targetOf`: a stop's handle, or `end`), which they carry as `target`.
  */
 export interface MapTrainPanel {
   place: string;
   moves: Array<{ move: MapMove; target: string }>;
-  reverse: string | null;
-  atEnd: MapAtEnd;
 }
 
 /**
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index c66868c18dc85dde8f085e2b56da8e14e868bd57..33e8d68f30d174bc64bfd20f78853ab6129c1758 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -422,10 +422,10 @@ describe('partyView', () => {
         },
         mayReport: true,
         // The member is not signed up: nothing of the route, nor its kind, is theirs to change.
-        may: { arrange: false, clear: false, load: false, kind: false },
+        may: { arrange: false, clear: false, load: false },
         panel: null,
         conductor: { who: null, mayTake: false, mayDrop: false },
-        moveRefusal: 'not-attending',
+        moveRefusal: { reason: 'not-attending', text: '' },
       },
     ]);
     expect(view.meetups).toEqual([
@@ -599,33 +599,28 @@ describe('trainRights', () => {
       arrange: true,
       clear: false,
       load: true,
-      kind: true,
     });
     expect(trainRights(train, input([], { memberId: BOB }))).toEqual({
       arrange: false,
       clear: false,
       load: false,
-      kind: false,
     });
     const conducted = { ...train, train: { ...train.train, conductorId: BOB } };
     expect(trainRights(conducted, input([]))).toEqual({
       arrange: true,
       clear: false,
       load: false,
-      kind: false,
     });
     expect(trainRights(train, input([], { memberId: CAROL, staff: true }))).toEqual({
       arrange: true,
       clear: true,
       load: true,
-      kind: true,
     });
     // A bot developer clears a route, as `/route clear` lets them; nothing else.
     expect(trainRights(train, input([], { memberId: CAROL, botStaff: true }))).toEqual({
       arrange: false,
       clear: true,
       load: false,
-      kind: false,
     });
   });
 
@@ -636,24 +631,22 @@ describe('trainRights', () => {
       arrange: true,
       clear: false,
       load: true,
-      kind: false,
     });
     expect(trainRights(route(empty), maker)).toEqual({
       arrange: true,
       clear: false,
       load: false,
-      kind: false,
     });
     const signedUp = withAttendees(route(), { [ALICE]: { status: PartyStatus.Coming } });
     expect(trainRights(signedUp, input([], { readOnly: true, staff: true }))).toEqual({
       arrange: false,
       clear: false,
       load: false,
-      kind: false,
     });
-    // Plan 8X-5: the kind of a train planned ahead, before it has a route, as the post's panel.
+    // Plan 8M-8C: a train planned ahead, before it has a route, has no moves; Manage… (its kind)
+    // opens for who may move it, the reason being only that it has no route.
     const planned = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Coming } });
-    expect(trainRights(planned, input([])).kind).toBe(true);
+    expect(moveRefusalOf(planned, input([]))).toBe('no-route');
     expect(trainPanelOf(planned, input([]))).toBeNull();
   });
 });
@@ -665,29 +658,23 @@ describe('trainPanelOf and conductorOf', () => {
     return { ...train, train: { ...train.train, route: stops(4, 1, 7), stop, ...more } };
   };
 
-  it('gives the moves that can be made from where the train is, each with where it leads, and Reverse where it may be', () => {
+  it("gives the moves that can be made from where the train is, each with where it leads; Finish and Reverse are Manage…'s", () => {
     expect(trainPanelOf(stoppedAt(1), input([]))).toEqual({
       place: '1',
       moves: [
         { move: 'next', target: '7' },
         { move: 'previous', target: '4' },
-        { move: 'finish', target: 'end' },
       ],
-      reverse: null,
-      atEnd: 'finish',
     });
-    // Finished from its last stop: Previous takes it back, Reverse starts it again there.
+    // Finished from its last stop: Previous takes it back.
     expect(trainPanelOf(stoppedAt(3, { finishedFrom: gymStop(7) }), input([]))).toEqual({
       place: 'end',
       moves: [{ move: 'previous', target: '7' }],
-      reverse: '4',
-      atEnd: 'finish',
     });
     expect(trainPanelOf(stoppedAt(2, { atEnd: 'loop' }), input([]))?.moves).toEqual([
       { move: 'next', target: '4' },
       { move: 'previous', target: '1' },
       { move: 'skip', target: '1' },
-      { move: 'finish', target: 'end' },
     ]);
   });
 
@@ -712,6 +699,23 @@ describe('trainPanelOf and conductorOf', () => {
     expect(moveRefusalOf(stoppedAt(0), input([], { readOnly: true }))).toBe('read-only');
   });
 
+  // Review C1 of 8M-8C: the page says why not in the commands' words, which the caller gives.
+  it('sends why not with the train in the words the caller gives for the reason', () => {
+    const train = posted(stoppedAt(0, { conductorId: REPORTER }));
+    const words = (reason: string) => `Discord's words for ${reason}`;
+    const shown = (more: Partial<PartyViewInput>) =>
+      partyView(input([train], { trainRefusal: words, ...more })).trains[0]?.moveRefusal;
+    expect(shown({})).toEqual({
+      reason: 'not-conductor',
+      text: "Discord's words for not-conductor",
+    });
+    expect(shown({ readOnly: true })).toEqual({
+      reason: 'read-only',
+      text: "Discord's words for read-only",
+    });
+    expect(shown({ staff: true })).toBeNull();
+  });
+
   it('says whose the conductor role is without naming them, and who may take or drop it', () => {
     expect(conductorOf(stoppedAt(0), input([]))).toEqual({
       who: null,
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 46e4991921038425db4589c958b8428b89e34078..d55d94440307df7b0cde75f25105102ad9dc0492 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -1,5 +1,5 @@
 import { allowedPicture } from './picture.js';
-import { stopHandle, stopKey } from '../party/stops.js';
+import { stopKey } from '../party/stops.js';
 import { maxEnded } from '../party/max.js';
 import {
   attendeeOf,
@@ -23,7 +23,6 @@ import { PartyStatus } from '../party/status.js';
 import { timedOver } from '../party/timed.js';
 import {
   cannotMove,
-  cannotReverse,
   mayNotArrange,
   mayNotClear,
   mayNotLoad,
@@ -157,6 +156,12 @@ export interface PartyViewInput {
    * undefined while it has none. Left out: none has one.
    */
   postKey?: (party: Party) => string | undefined;
+  /**
+   * Why a member may not move a train, in the commands' words as text of the page (plan 8M-8C,
+   * review C1: `manageRefusal`'s, which Discord says before Move… and Manage… open). Left out: no
+   * words.
+   */
+  trainRefusal?: (reason: MapMoveRefusal) => string;
 }
 
 /** Staff's Delete… of a party (plan 8M-8B): for staff alone, never while read-only. */
@@ -347,51 +352,43 @@ function maxOf(party: MaxParty, link: string, input: PartyViewInput): MapMax | n
 
 /**
  * What the member may do to a train's route on the map (spec 3.7), as the commands decide it
- * (`mayNotArrange`, `mayNotClear`, `mayNotLoad`), and to its kind (plan 8X-5, `mayNotMove`, as
- * the panel's menu); nothing while read-only.
+ * (`mayNotArrange`, `mayNotClear`, `mayNotLoad`); nothing while read-only.
  */
 export function trainRights(party: TrainParty, input: PartyViewInput): MapTrainRights {
-  if (input.readOnly) return { arrange: false, clear: false, load: false, kind: false };
+  if (input.readOnly) return { arrange: false, clear: false, load: false };
   const { memberId, staff } = input;
   return {
     arrange: mayNotArrange(party, memberId, staff) === undefined,
     clear: mayNotClear(party, memberId, input.botStaff ?? staff) === undefined,
     load: mayNotLoad(party, memberId, staff) === undefined,
-    // As the panel's kind menu (plan 8X-4), also for a train without a route yet.
-    kind: mayNotMove(party, memberId, staff) === undefined,
   };
 }
 
+/** The moves of the map (Finish is Manage…'s since plan 8M-8C). */
+const MAP_MOVES = TRAIN_MOVES.filter((move) => move !== 'finish');
+
 /**
- * The Manage train panel as the member may use it (spec 3.7), as the post's "Manage train…" opened it before plan 8X-G
- * (`openTrainPanel`): none for who may not move the train, for a train without a route, and
- * while read-only. The moves are those `cannotMove` allows from where the train is, each with
- * where it leads; Reverse where `cannotReverse` allows it.
+ * The moves the member may make on the map (spec 3.7): none for who may not move the train, for
+ * a train without a route, and while read-only. The moves are those `cannotMove` allows from where
+ * the train is, each with where it leads.
  */
 export function trainPanelOf(party: TrainParty, input: PartyViewInput): MapTrainPanel | null {
   if (input.readOnly || party.train.route.length === 0) return null;
   if (mayNotMove(party, input.memberId, input.staff) !== undefined) return null;
   return {
     place: placeOf(party),
-    moves: TRAIN_MOVES.flatMap((move) =>
+    moves: MAP_MOVES.flatMap((move) =>
       cannotMove(party, move) === undefined ? [{ move, target: targetOf(party, move) }] : [],
     ),
-    reverse: cannotReverse(party) === undefined ? reverseFirst(party) : null,
-    atEnd: party.train.atEnd,
   };
 }
 
-/** The handle of the stop a route begins with (`stopHandle`), which Reverse carries as `first`. */
-function reverseFirst(party: TrainParty): string {
-  const [first] = party.train.route;
-  return first === undefined ? '' : stopHandle(first);
-}
-
 /**
  * Why the member may not move the train on the map (review N1), as the commands decide it
  * (`mayNotMove`: `not-conductor`, `not-attending`), or that it has no route yet (`no-route`) or
- * the map is read-only (`read-only`); null where they may. The page words it under the post's
- * Move… and Manage…, never working it out itself.
+ * the map is read-only (`read-only`); null where they may. The train carries it with the words
+ * the caller gives (`trainRefusal`), which the page says under the post's Move… and Manage…,
+ * never working it out or wording it itself.
  */
 export function moveRefusalOf(party: TrainParty, input: PartyViewInput): MapMoveRefusal | null {
   if (input.readOnly) return 'read-only';
@@ -415,6 +412,7 @@ export function conductorOf(party: TrainParty, input: PartyViewInput): MapConduc
 
 function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTrain {
   const { route, stop } = party.train;
+  const refused = moveRefusalOf(party, input);
   return {
     kind: 'train',
     id: party.id,
@@ -435,7 +433,8 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     may: trainRights(party, input),
     panel: trainPanelOf(party, input),
     conductor: conductorOf(party, input),
-    moveRefusal: moveRefusalOf(party, input),
+    moveRefusal:
+      refused === null ? null : { reason: refused, text: input.trainRefusal?.(refused) ?? '' },
     ...closeOf(party, input),
     ...reportOf(party, input),
   };
diff --git a/src/domain/web/train-data.ts b/src/domain/web/train-data.ts
index 50a36cc5d84ea4790d4304d689ca54a038c4245e..bebf6d0110a6a45fcad600b7be112024fe3e9684 100644
--- a/src/domain/web/train-data.ts
+++ b/src/domain/web/train-data.ts
@@ -8,27 +8,75 @@ import type { MapAtEnd, MapTrain, MapTrainKind } from './party-data.js';
 
 export type { MapAtEnd, MapTrainKind };
 
-/** The kinds of train, in the order `/train kind:` and the panel's menu offer them (plan 8X-5). */
+/** The kinds of train, in the order `/train kind:` and Manage…'s menu offer them (plan 8X-5). */
 export const MAP_TRAIN_KINDS: readonly MapTrainKind[] = ['raid', 'dynamax', 'gigantamax'];
 
-/**
- * The kind menu of the Manage train panel on the map (plan 8X-5): `POST /s/<guild>/api/trains/<id>
- * /move/kind`, body `{ kind }`, as the post's menu sets it (for who may move the train and staff,
- * `MapTrainRights.kind`; also without a route). Not one of `PANEL_PRESSES`, the panel's buttons.
- */
-export const KIND_PRESS = 'kind';
-
 /** What a train may do at the last stop of its route, in the order `/train` offers them. */
 export const MAP_AT_ENDS: readonly MapAtEnd[] = ['finish', 'loop', 'turn-back'];
 
 /**
- * What the Manage train panel on the map presses (`POST /s/<guild>/api/trains/<id>/move/<move>`):
- * the four moves (body `{ from, target }`, Finish `{ from }`), Reverse (`{ from, first }`) and
- * the mode at the end of the route (`{ from, atEnd }`), each as the post's panel does it.
+ * The moves the map presses (`POST /s/<guild>/api/trains/<id>/move/<move>`, body
+ * `{ from, target }`). Finish, Reverse, the mode and the kind are Manage…'s (plan 8M-8C, R1: the
+ * presses `finish`, `reverse`, `at-end` and `kind` of the old panel answer 404).
  */
-export const PANEL_PRESSES = ['next', 'previous', 'skip', 'finish', 'reverse', 'at-end'] as const;
+export const PANEL_PRESSES = ['next', 'previous', 'skip'] as const;
 export type PanelPress = (typeof PANEL_PRESSES)[number];
 
+/**
+ * A choice of a train's form on the map (plan 8M-8C), as its Discord dialog has it
+ * (`DialogOption`): its value, its words, the line under them (the description), and the emoji a
+ * menu shows before them.
+ */
+export interface MapFormOption {
+  value: string;
+  label: string;
+  line?: string;
+  emoji?: string;
+}
+
+/** A choice of a train's form: its label over the options, and the one picked to start with. */
+export interface MapFormChoice {
+  label: string;
+  options: MapFormOption[];
+  picked?: string;
+}
+
+/**
+ * What Manage… showed, sent back with its Submit (plan 8M-8C, as the dialog's custom id carries
+ * it): where the train was (`placeOf`), the stop the route began with (`stopHandle`, `-` without a
+ * route), the mode and the kind it showed picked. Only what is picked otherwise is applied.
+ */
+export interface ManageShownBody {
+  from: string;
+  first: string;
+  atEnd: MapAtEnd;
+  kind: MapTrainKind;
+}
+
+/**
+ * Manage… on the map (plan 8M-8C, `GET /s/<guild>/api/trains/<id>/manage`), as the post's dialog
+ * is drawn now (`manageForm`): its title, its text as text of the page, "The route" where more
+ * than Keep is left, "At the end of the route" (not for a train without a route), "What the
+ * train is mainly for", and what it showed.
+ */
+export interface MapManage {
+  title: string;
+  text: string;
+  route?: MapFormChoice;
+  atEnd?: MapFormChoice;
+  kind: MapFormChoice;
+  shown: ManageShownBody;
+}
+
+/**
+ * The Submit of Manage… on the map (`POST …/manage`): what it showed, and what is picked (the
+ * route left out where the form had none, the mode for a train without a route).
+ */
+export interface ManageBody {
+  shown: ManageShownBody;
+  picked: { kind: MapTrainKind; route?: 'keep' | 'reverse' | 'finish'; atEnd?: MapAtEnd };
+}
+
 /**
  * Taking the conductor role and giving it up (or taking it off another, for staff), as
  * `/conductor set` and `/conductor clear` do (`POST …/conductor/<change>`, body `{ who }`: whose
diff --git a/src/services/train-service.test.ts b/src/services/train-service.test.ts
index 8f0cc6084fea17be849c0acdcab72ab1111ec1bf..2eedd7aa9c2deb7f37b164cd4c714b5d31230b74 100644
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -987,7 +987,7 @@ describe('TrainService: moves while an announcement is on its way', () => {
 /** A train on the route of `boarded`, at its last stop, that does this at the end. */
 async function atLastStop(atEnd: 'loop' | 'turn-back'): Promise<Made> {
   const made = await boarded();
-  await made.trains.setAtEnd(made.party.id, alice, false, atEnd);
+  await made.setAtEnd(alice, false, atEnd);
   for (let n = 0; n < 3; n++) await made.trains.move(made.party.id, alice, 'next', false);
   await settled(made);
   expect(currentStop(made.current())).toEqual(gym(2));
@@ -1046,7 +1046,7 @@ describe('TrainService: what a train does at the end of its route', () => {
 
   it('says the round of a gathered run whose last step it was, and not one followed by a step', async () => {
     const made = await boarded();
-    await made.trains.setAtEnd(made.party.id, alice, false, 'loop');
+    await made.setAtEnd(alice, false, 'loop');
     await made.trains.move(made.party.id, alice, 'skip', false);
     await settled(made);
     // On to the last stop and round to the first, in one window: the round is the last step.
@@ -1101,13 +1101,13 @@ describe('TrainService: what a train does at the end of its route', () => {
   });
 });
 
-describe('TrainService.reverse', () => {
+describe('TrainService.manage: Reverse alone (once TrainService.reverse)', () => {
   it('reverses the route at its first stop, says so in a line, and pings nobody', async () => {
     const made = await boarded();
     await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
     await settled(made);
     const before = messages(made).length;
-    const outcome = await made.trains.reverse(made.party.id, alice, false, '4');
+    const outcome = await made.reverse(alice, false, '4');
     expect(outcome).toMatchObject({ kind: 'ok', changed: true, restarted: false });
     expect(made.current().train).toMatchObject({
       route: stops(2, 7, 1, 4),
@@ -1134,7 +1134,7 @@ describe('TrainService.reverse', () => {
     const made = await createdTrain({ route: [13, 4] }, { gyms: gymsFixture([inc]) });
     await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming);
     await settled(made);
-    await made.trains.reverse(made.party.id, alice, false, '13');
+    await made.reverse(alice, false, '13');
     await settled(made);
     expect(lines(made).at(-1)).toBe(
       `The route was reversed by **Alice** (<@${ALICE}>): it now runs from ` +
@@ -1148,7 +1148,7 @@ describe('TrainService.reverse', () => {
     await made.trains.move(made.party.id, alice, 'next', false);
     await made.trains.move(made.party.id, alice, 'next', false);
     await settled(made);
-    const outcome = await made.trains.reverse(made.party.id, alice, false, 'end');
+    const outcome = await made.reverse(alice, false, 'end');
     expect(outcome).toMatchObject({ kind: 'ok', restarted: true });
     expect(made.current().train).toMatchObject({
       route: stops(2, 7, 1, 4),
@@ -1166,15 +1166,15 @@ describe('TrainService.reverse', () => {
   it("reverses once for one panel: a second press, or another member's old panel, changes nothing", async () => {
     const made = await boarded();
     // Both panels were drawn at the first stop, while the route began at gym 4.
-    expect(await made.trains.reverse(made.party.id, alice, false, '4', '4')).toMatchObject({
+    expect(await made.reverse(alice, false, '4', '4')).toMatchObject({
       kind: 'ok',
       changed: true,
     });
-    expect(await made.trains.reverse(made.party.id, alice, false, '4', '4')).toEqual({
+    expect(await made.reverse(alice, false, '4', '4')).toEqual({
       kind: 'refused',
       reason: 'route-changed',
     });
-    expect(await made.trains.reverse(made.party.id, bob, false, '4', '4')).toEqual({
+    expect(await made.reverse(bob, false, '4', '4')).toEqual({
       kind: 'refused',
       reason: 'route-changed',
     });
@@ -1186,25 +1186,25 @@ describe('TrainService.reverse', () => {
   it('refuses what cannot be reversed, and who may not move the train', async () => {
     const made = await boarded();
     await made.trains.move(made.party.id, alice, 'next', false);
-    expect(await made.trains.reverse(made.party.id, alice, false)).toEqual({
+    expect(await made.reverse(alice, false)).toEqual({
       kind: 'refused',
       reason: 'reverse-mid-route',
     });
-    expect(await made.trains.reverse(made.party.id, carol, false)).toEqual({
+    expect(await made.reverse(carol, false)).toEqual({
       kind: 'refused',
       reason: 'not-attending',
     });
-    expect(await made.trains.reverse(made.party.id, alice, false, '4')).toEqual({
+    expect(await made.reverse(alice, false, '4')).toEqual({
       kind: 'refused',
       reason: 'train-moved-on',
     });
-    await made.trains.setAtEnd(made.party.id, alice, false, 'turn-back');
-    expect(await made.trains.reverse(made.party.id, alice, false)).toEqual({
+    await made.setAtEnd(alice, false, 'turn-back');
+    expect(await made.reverse(alice, false)).toEqual({
       kind: 'refused',
       reason: 'reverse-turns-back',
     });
-    await made.trains.setAtEnd(made.party.id, alice, false, 'loop');
-    expect(await made.trains.reverse(made.party.id, alice, false)).toMatchObject({ kind: 'ok' });
+    await made.setAtEnd(alice, false, 'loop');
+    expect(await made.reverse(alice, false)).toMatchObject({ kind: 'ok' });
     expect(made.current().train).toMatchObject({
       route: stops(2, 7, 1, 4),
       stop: 2,
@@ -1214,7 +1214,7 @@ describe('TrainService.reverse', () => {
 
   it('names no maker who asked not to be named', async () => {
     const made = await createdTrain({ route: stops(4, 1), anonymous: true });
-    await made.trains.reverse(made.party.id, maker, false);
+    await made.reverse(maker, false);
     await settled(made);
     expect(lines(made).at(-1)).toBe(
       'The route was reversed: it now runs from **The Stacks** to **Veterans Memorial Bridge**.',
@@ -1222,19 +1222,19 @@ describe('TrainService.reverse', () => {
   });
 });
 
-describe('TrainService.setAtEnd', () => {
+describe('TrainService.manage: the mode alone (once TrainService.setAtEnd)', () => {
   it('sets the mode, says so in a line without a ping, and nothing for the mode it has', async () => {
     const made = await boarded();
-    expect(await made.trains.setAtEnd(made.party.id, alice, false, 'loop')).toMatchObject({
+    expect(await made.setAtEnd(alice, false, 'loop')).toMatchObject({
       kind: 'ok',
       changed: true,
     });
-    expect(await made.trains.setAtEnd(made.party.id, alice, false, 'loop')).toMatchObject({
+    expect(await made.setAtEnd(alice, false, 'loop')).toMatchObject({
       kind: 'ok',
       changed: false,
     });
-    await made.trains.setAtEnd(made.party.id, bob, false, 'turn-back');
-    await made.trains.setAtEnd(made.party.id, alice, false, 'finish');
+    await made.setAtEnd(bob, false, 'turn-back');
+    await made.setAtEnd(alice, false, 'finish');
     await settled(made);
     expect(lines(made).filter((line) => /set the train/.test(line))).toEqual([
       `**Alice** (<@${ALICE}>) set the train to loop.`,
@@ -1246,16 +1246,16 @@ describe('TrainService.setAtEnd', () => {
 
   it('is for whoever may arrange the route: also a member who is not the conductor', async () => {
     const made = await boarded();
-    expect(await made.trains.setAtEnd(made.party.id, carol, false, 'loop')).toEqual({
+    expect(await made.setAtEnd(carol, false, 'loop')).toEqual({
       kind: 'refused',
       reason: 'not-attending',
     });
     await made.trains.setConductor(made.party.id, alice);
-    expect(await made.trains.setAtEnd(made.party.id, bob, false, 'loop')).toMatchObject({
+    expect(await made.setAtEnd(bob, false, 'loop')).toMatchObject({
       kind: 'ok',
       changed: true,
     });
-    expect(await made.trains.setAtEnd(made.party.id, carol, true, 'turn-back')).toMatchObject({
+    expect(await made.setAtEnd(carol, true, 'turn-back')).toMatchObject({
       kind: 'ok',
     });
   });
@@ -1263,7 +1263,7 @@ describe('TrainService.setAtEnd', () => {
   it('names no maker who asked not to be named, who may set it without being signed up', async () => {
     const made = await createdTrain({ route: stops(4, 1), anonymous: true });
     await made.attendance.leave(made.party.id, maker);
-    expect(await made.trains.setAtEnd(made.party.id, maker, false, 'loop')).toMatchObject({
+    expect(await made.setAtEnd(maker, false, 'loop')).toMatchObject({
       kind: 'ok',
       changed: true,
     });
@@ -1280,14 +1280,14 @@ describe('TrainService.setAtEnd', () => {
 describe('TrainService: a saved route keeps its mode', () => {
   it('saves the order and the mode the train has, and a load sets both', async () => {
     const made = await boarded();
-    await made.trains.setAtEnd(made.party.id, alice, false, 'loop');
-    await made.trains.reverse(made.party.id, alice, false);
+    await made.setAtEnd(alice, false, 'loop');
+    await made.reverse(alice, false);
     const saved = await made.trains.saveRoute(made.party.id, alice, 'Round the park');
     expect(saved).toMatchObject({
       kind: 'saved',
       route: { name: 'Round the park', stops: stops(2, 7, 1, 4), atEnd: 'loop' },
     });
-    await made.trains.setAtEnd(made.party.id, alice, false, 'finish');
+    await made.setAtEnd(alice, false, 'finish');
     await made.trains.move(made.party.id, alice, 'next', false);
     if (saved.kind !== 'saved') throw new Error(saved.kind);
     const loaded = await made.trains.loadRoute(made.party.id, alice, saved.route.id);
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index 3abda4e3fe50b6fb6e6032ad7404195ef4db0231..ceb96dee38fcefba984b53c1e8523224873010da 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -508,29 +508,6 @@ export class TrainService {
     return outcome;
   }
 
-  /**
-   * Reverses the route (`reverseRoute`): the same stops in the other order, the train at the
-   * same stop; a route that was finished from its last stop starts again there (`restarted`).
-   * For who may move the train. It is no movement: nobody is pinged, and the post says it in a
-   * line. `from` is for a control drawn while the train was at some place (`placeOf`), `first`
-   * the handle of the stop the route began with then: a panel drawn before a Reverse does not
-   * reverse it back.
-   */
-  reverse(
-    partyId: string,
-    member: Member,
-    staff: boolean,
-    from?: string,
-    first?: string,
-  ): Promise<TrainChangeOutcome<{ restarted: boolean }>> {
-    return this.apply(
-      partyId,
-      member,
-      (party) => reverseRoute(party, member.id, staff, from, first),
-      (party, { restarted }) => this.reversedLine(party, member, restarted),
-    );
-  }
-
   /** The line of a reversed route: `The route was reversed by X: it now runs from A to B.` */
   private reversedLine(party: TrainParty, member: Member, restarted: boolean): string {
     const { route } = party.train;
@@ -547,48 +524,6 @@ export class TrainService {
     );
   }
 
-  /**
-   * Sets what the train does at the end of its route (`setAtEnd`).
-   * It moves nothing, so it is for whoever may arrange the route (`mayArrange`) and for staff;
-   * the post says it in a line that pings nobody, naming the doer (`doer`). `changed` is false
-   * for the mode the train has already. `from` is for the menu of a panel drawn while the train
-   * was at some place (`placeOf`).
-   */
-  setAtEnd(
-    partyId: string,
-    member: Member,
-    staff: boolean,
-    atEnd: TrainAtEnd,
-    from?: string,
-  ): Promise<TrainChangeOutcome> {
-    return this.apply(
-      partyId,
-      member,
-      (party) => setAtEnd(party, member.id, staff, atEnd, from),
-      (party) => atEndLine(party, member, atEnd),
-    );
-  }
-
-  /**
-   * Sets what kind of battles the train goes to (`setTrainKind`, plan 8X-4): for who may move it
-   * and for staff. The post says it in a line that pings nobody, naming the doer (`doer`), and is
-   * shown anew at once with the kind's heading, tags and lobby; groups already made stay.
-   * `changed` is false for the kind the train has already.
-   */
-  setKind(
-    partyId: string,
-    member: Member,
-    staff: boolean,
-    kind: TrainKind,
-  ): Promise<TrainChangeOutcome> {
-    return this.apply(
-      partyId,
-      member,
-      (party) => setTrainKind(party, member.id, staff, kind),
-      (party) => kindLine(party, member, kind),
-    );
-  }
-
   /**
    * What Manage… of a train's post asks (plan 8X-G; review R6), as one change: the kind
    * (`setTrainKind`), then the route (`reverseRoute` or Finish, `moveTrain`), then the mode at the
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 1044589419bcbcdfc4d2a0ac4f47d50abbb46a70..94c58ae45d58738486fdf51c4d38aab43ce6b871 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -454,10 +454,10 @@ describe('trainPopup and meetupItem', () => {
       stop: 1,
       link: LINK,
       attendance: attendance({ actions: [] }),
-      may: { arrange: false, clear: false, load: false, kind: false },
+      may: { arrange: false, clear: false, load: false },
       panel: null,
       conductor: { who: null, mayTake: false, mayDrop: false },
-      moveRefusal: 'not-attending',
+      moveRefusal: { reason: 'not-attending', text: 'You are not signed up for this train.' },
     };
     // What the member may do of the train on the map comes before the post.
     const extra = { tag: 'button', text: 'Edit route' };
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index e8343b70d58d49716acb1e79e47d923b66f863bd..b14e236ba9d8e759ed63195c476a6ee7178ecb53 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -656,6 +656,10 @@ export function showParties(
         // Meet… (plan 8M-8B): its form, from what the server offers now.
         const party = partyById(target.dataset.meet);
         if (party) postForms.meetClicked(target, party);
+      } else if (target.dataset.manageTrain !== undefined) {
+        // A train's Manage… (plan 8M-8C): the post's dialog as a form in the place of the post.
+        const party = partyById(target.dataset.manageTrain);
+        if (party) postForms.manageClicked(target, party);
       } else if (target.dataset.closeParty !== undefined) {
         // Staff's Delete… (plan 8M-8B): `/delete`'s question in the place of the post.
         const party = partyById(target.dataset.closeParty);
@@ -674,7 +678,7 @@ export function showParties(
   /**
    * The map's side of a post's buttons (plan 8M-8A): one the map has no form for yet shows the
    * post's link under the buttons ("Do this on Discord →"); Group… for a newcomer goes to the
-   * menu of groups; Manage… and Route show their part under the post; a raid's line in the list
+   * menu of groups; Route shows its part under the post; a raid's line in the list
    * of a gym's raids opens its post in the popup, and "All raids here" goes back to the list.
    */
   const postButton = (target: HTMLButtonElement): void => {
@@ -705,11 +709,11 @@ export function showParties(
       open({ discord: onDiscord });
     } else if (focusPick !== undefined) {
       popup?.querySelector<HTMLSelectElement>('select[data-group-pick]')?.focus();
-    } else if (toggle === 'manage' || toggle === 'route') {
-      const part = popup?.querySelector<HTMLElement>(`section.${toggle}`);
+    } else if (toggle === 'route') {
+      const part = popup?.querySelector<HTMLElement>('section.route');
       if (part) {
         part.hidden = !part.hidden;
-        open({ [toggle]: !part.hidden });
+        open({ route: !part.hidden });
       }
     } else if (showRaid !== undefined) {
       chooseRaid(showRaid, {
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index 04d6981581a1bdcc4ea9a752e7d7bd5120ccace6..0da858f2c36ad3085364f0531c42b8a749321185 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import type {
   MapAttendance,
+  MapMoveRefusal,
   MapRaid,
   MapTrain,
   PostButtonView,
@@ -589,8 +590,8 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
       stop: 1,
       link: LINK,
       attendance: attendance({ mine: { status: 'coming', group: 'A' } }),
-      may: { arrange: true, clear: false, load: false, kind: true },
-      panel: { place: '2', moves: [{ move: 'next', target: '3' }], reverse: null, atEnd: 'finish' },
+      may: { arrange: true, clear: false, load: false },
+      panel: { place: '2', moves: [{ move: 'next', target: '3' }] },
       conductor: { who: null, mayTake: true, mayDrop: false },
       moveRefusal: null,
     };
@@ -625,16 +626,22 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
     expect(buttons.find((one) => one.text === 'Move…')?.attributes).toMatchObject({
       'data-move-train': 't1',
     });
+    // Manage… is the map's form of the post's dialog (plan 8M-8C), for who may move the train.
     expect(buttons.find((one) => one.text === 'Manage…')?.attributes).toMatchObject({
-      'data-toggle': 'manage',
+      'data-manage-train': 't1',
     });
     expect(buttons.find((one) => one.text === 'Route')?.attributes).toMatchObject({
       'data-toggle': 'route',
     });
-    const manage = byClass(popup, 'manage')[0];
-    expect(manage?.attributes).toMatchObject({ hidden: '' });
-    expect(manage && buttonsOf(manage).map((one) => one.text)).toEqual(['Be the conductor']);
-    expect(manage && seen(manage)).toContain('What the train is mainly for: on Discord →');
+    // The conductor's part is the member's own, outside Manage… (R2), as `/conductor` is.
+    expect(byClass(popup, 'manage')).toEqual([]);
+    const mine = byClass(popup, 'mine-part')[0];
+    expect(mine && buttonsOf(mine).map((one) => one.text)).toEqual([
+      'Edit route',
+      'Be the conductor',
+    ]);
+    expect(mine && seen(mine)).toContain('It has no conductor.');
+    expect(seen(popup)).not.toContain('What the train is mainly for');
     const route = byClass(popup, 'route')[0];
     expect(
       route &&
@@ -649,6 +656,15 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
 });
 
 describe('the review’s fixes (8M-8A fix round 1)', () => {
+  /** Why not, as the server sends it with the train: the commands' words (review C1 of 8M-8C). */
+  const WORDS: Readonly<Record<MapMoveRefusal, string>> = {
+    'not-conductor': 'This train has a conductor: only they and the moderators can move it.',
+    'not-attending': 'You are not signed up for this train.',
+    'no-route': 'This train has no route yet. Add its stops with /route add.',
+    'read-only':
+      'Discord cannot be reached just now, so nothing can be changed. Try again in a moment.',
+  };
+  const refused = (reason: MapMoveRefusal) => ({ reason, text: WORDS[reason] });
   const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     kind: 'train',
     postKey: 'k',
@@ -662,10 +678,10 @@ describe('the review’s fixes (8M-8A fix round 1)', () => {
     stop: 0,
     link: LINK,
     attendance: attendance(),
-    may: { arrange: false, clear: false, load: false, kind: false },
+    may: { arrange: false, clear: false, load: false },
     panel: null,
     conductor: { who: 'other', mayTake: false, mayDrop: false },
-    moveRefusal: 'not-conductor',
+    moveRefusal: refused('not-conductor'),
     ...more,
   });
   const trainView: PostView = {
@@ -707,59 +723,60 @@ describe('the review’s fixes (8M-8A fix round 1)', () => {
   const pressed = (party: MapTrain, label: string) =>
     buttonsOf(postCard(trainView, party, context)).find((one) => one.text === label)?.attributes;
 
-  it('words why the member may not use Move… and Manage…, as the server says it (8A-12, N1)', () => {
+  // Review C1 of 8M-8C: in the words the server sends, Discord's, never the page's own.
+  it('says why the member may not use Move… and Manage… in the words the server sends (8A-12, N1)', () => {
     expect(pressed(train(), 'Move…')).toMatchObject({
       'data-on-discord': 'moves',
-      'data-why': 'Only the conductor or staff can move the train.',
+      'data-why': WORDS['not-conductor'],
     });
     expect(pressed(train(), 'Manage…')).toMatchObject({
       'data-on-discord': 'manage',
-      'data-why': 'Only the conductor or staff can manage the train.',
+      'data-why': WORDS['not-conductor'],
+    });
+    // Manage… of a train without a route asks its kind alone (plan 8M-8C): its form opens.
+    expect(pressed(train({ moveRefusal: refused('no-route') }), 'Manage…')).toMatchObject({
+      'data-manage-train': 't1',
     });
     const unled = train({
       conductor: { who: null, mayTake: false, mayDrop: false },
-      moveRefusal: 'not-attending',
+      moveRefusal: refused('not-attending'),
     });
-    expect(pressed(unled, 'Move…')?.['data-why']).toBe('Sign up for the train to move it.');
+    expect(pressed(unled, 'Move…')?.['data-why']).toBe(WORDS['not-attending']);
+    expect(pressed(unled, 'Manage…')?.['data-why']).toBe(WORDS['not-attending']);
     // The conductor of a train with no route yet: not a matter of who they are.
     const routeless = train({
       route: [],
       stop: null,
       conductor: { who: 'you', mayTake: false, mayDrop: true },
-      moveRefusal: 'no-route',
+      moveRefusal: refused('no-route'),
     });
-    expect(pressed(routeless, 'Move…')?.['data-why']).toBe(
-      'The train has no route yet: add a stop first.',
-    );
-    const readOnly = train({ moveRefusal: 'read-only' });
-    expect(pressed(readOnly, 'Move…')?.['data-why']).toBe(
-      'Discord cannot be reached just now, so nothing can be changed.',
-    );
+    expect(pressed(routeless, 'Move…')?.['data-why']).toBe(WORDS['no-route']);
+    const readOnly = train({ moveRefusal: refused('read-only') });
+    expect(pressed(readOnly, 'Move…')?.['data-why']).toBe(WORDS['read-only']);
   });
 
-  it('keeps Manage…, Route and the line to Discord open across a redraw, worded anew (8A-10, N3)', () => {
+  it('keeps Route and the line to Discord open across a redraw, worded anew (8A-10, N3)', () => {
     const popupOf = (party: MapTrain) =>
       postPopup(trainView, party, {
         ...context,
         place: undefined,
         located: undefined,
         units: 'imperial',
-        opened: { manage: true, route: true, discord: 'moves' },
+        opened: { route: true, discord: 'moves' },
       });
     const popup = popupOf(
       train({
-        may: { arrange: true, clear: false, load: false, kind: true },
-        moveRefusal: 'not-attending',
+        may: { arrange: true, clear: false, load: false },
+        moveRefusal: refused('not-attending'),
       }),
     );
-    expect(byClass(popup, 'manage')[0]?.attributes).not.toHaveProperty('hidden');
     expect(byClass(popup, 'route')[0]?.attributes).not.toHaveProperty('hidden');
     const discord = byClass(popup, 'on-discord')[0];
     expect(discord?.attributes).not.toHaveProperty('hidden');
-    expect(discord && seen(discord)).toContain('Sign up for the train to move it.');
+    expect(discord && seen(discord)).toContain(WORDS['not-attending']);
     // The train changed meanwhile (a conductor now): the line says what holds now.
     const now = byClass(popupOf(train()), 'on-discord')[0];
-    expect(now && seen(now)).toContain('Only the conductor or staff can move the train.');
+    expect(now && seen(now)).toContain(WORDS['not-conductor']);
   });
 
   it('links only this server’s posts on Discord and Google Maps itself (8A-13)', () => {
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index 3ee431a55f32e4ee39e68edfcad88a02ad4d4f68..d9efd3acafd1fc17674e6b47c71d0e8c0c4fea95 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -35,15 +35,14 @@ export interface PostDrawContext {
   /** A stop of a train's route by its key, as the map names it (`stopName`). */
   stopName(key: string): string;
   /**
-   * What the member opened under this party's post, kept across redraws (review 8A-10): Manage…'s
-   * and Route's parts, and the line to Discord.
+   * What the member opened under this party's post, kept across redraws (review 8A-10): Route's
+   * part, and the line to Discord.
    */
   opened?: PanelsOpen;
 }
 
 /** What is open under a party's post (`PostDrawContext.opened`). */
 export interface PanelsOpen {
-  manage?: boolean;
   route?: boolean;
   /**
    * The line to Discord, by the button pressed (`moves`, `manage`, or `''` for another), worded
@@ -203,18 +202,17 @@ function panelAttributes(
         ? { 'data-move-train': party.id }
         : undefined;
     case 'manage':
-      return party.kind === 'train' && manageable(party) ? { 'data-toggle': 'manage' } : undefined;
+      // Manage…'s form (plan 8M-8C), for who may move the train and staff, as the dialog opens
+      // (a train without a route too: its kind alone); else why not, as the server decided it.
+      return party.kind === 'train' &&
+        (party.moveRefusal === null || party.moveRefusal.reason === 'no-route')
+        ? { 'data-manage-train': party.id }
+        : undefined;
     case 'route':
       return party.kind === 'train' ? { 'data-toggle': 'route' } : undefined;
   }
 }
 
-/** Whether a train's Manage… has anything on the map for the member: its conductor, its kind. */
-function manageable(train: Extract<MapParty, { kind: 'train' }>): boolean {
-  const { conductor } = train;
-  return conductor.who === 'you' || conductor.mayTake || conductor.mayDrop || train.may.kind;
-}
-
 /**
  * The words of the line's link to the post for the button pressed: "Start a new group on
  * Discord →" for Group… where a new group is the only way (review W-1), else "Do this on
@@ -229,11 +227,12 @@ export function discordLink(party: MapParty, button: string): string {
 
 /**
  * What the line under the buttons says where the map has no panel of a button for the member
- * (reviews 8A-12, N1): for a train's Move… and Manage…, why they may not, as the server decided it
- * (`MapTrain.moveRefusal`: the commands' `mayNotMove`, no route, read-only), only worded here;
- * else nothing, and the line sends the member to the post ("Do this on Discord"). `button` is
- * which button was pressed (`moves`, `manage`, or another's `''`), worded anew at each draw from
- * the party as it is then (review N3).
+ * (reviews 8A-12, N1): for a train's Move… and Manage…, why they may not, as the server decided
+ * and worded it (`MapTrain.moveRefusal`: the commands' `mayNotMove`, no route, read-only, in
+ * Discord's words; plan 8M-8C, review C1: the page words none itself); else nothing, and the line
+ * sends the member to the post ("Do this on Discord"). `button` is which button was pressed
+ * (`moves`, `manage`, or another's `''`), said anew at each draw from the party as it is then
+ * (review N3).
  */
 export function whyNot(party: MapParty, button: string): string {
   // Group…'s refusal before it opens (plan 8M-8B), as the post's dialog says it.
@@ -242,20 +241,10 @@ export function whyNot(party: MapParty, button: string): string {
     return regroup !== undefined && 'refused' in regroup ? regroup.refused : '';
   }
   if (party.kind !== 'train' || (button !== 'moves' && button !== 'manage')) return '';
-  const doing = button === 'moves' ? 'move' : 'manage';
-  switch (party.moveRefusal) {
-    case 'not-conductor':
-      return `Only the conductor or staff can ${doing} the train.`;
-    case 'not-attending':
-      return `Sign up for the train to ${doing} it.`;
-    case 'no-route':
-      // Manage… (the kind) needs no route: Discord's dialog has it.
-      return button === 'moves' ? 'The train has no route yet: add a stop first.' : '';
-    case 'read-only':
-      return 'Discord cannot be reached just now, so nothing can be changed.';
-    case null:
-      return '';
-  }
+  const refused = party.moveRefusal;
+  if (refused === null) return '';
+  // Manage… (the kind) needs no route: Discord's dialog has it.
+  return button === 'manage' && refused.reason === 'no-route' ? '' : refused.text;
 }
 
 const ON_DISCORD = { 'data-on-discord': '', 'data-why': '' };
@@ -410,7 +399,11 @@ const button = (text: string, attributes: Record<string, string>): PageNode => (
   attributes: { type: 'button', ...attributes },
 });
 
-/** A train's part for the member: Edit route, and what Manage… and Route show on the map. */
+/**
+ * A train's part for the member: whose the conductor role is, Edit route and the conductor's
+ * buttons (`/conductor`'s, outside Manage…, which is Discord's dialog: R2), and the stop list
+ * Route shows.
+ */
 function trainPart(
   train: Extract<MapParty, { kind: 'train' }>,
   context: PostDrawContext,
@@ -422,34 +415,20 @@ function trainPart(
       : conductor.who === 'other'
         ? 'It has a conductor.'
         : 'It has no conductor.';
-  const manage: PageNode = {
-    tag: 'section',
-    className: 'manage',
-    attributes: context.opened?.manage ? {} : { hidden: '' },
-    children: [
-      { tag: 'div', className: 'conductor', text: who },
-      {
-        tag: 'div',
-        className: 'train-actions',
-        children: [
-          ...(conductor.mayTake
-            ? [button('Be the conductor', { 'data-conductor': 'take', 'data-train': train.id })]
-            : []),
-          ...(conductor.mayDrop
-            ? [
-                button(
-                  conductor.who === 'you' ? 'Stop being the conductor' : 'Take the conductor off',
-                  { 'data-conductor': 'give-up', 'data-train': train.id },
-                ),
-              ]
-            : []),
-        ],
-      },
-      ...(train.may.kind
-        ? [onDiscord('What the train is mainly for: on Discord →', train, context)]
-        : []),
-    ],
-  };
+  const actions = [
+    ...(train.may.arrange ? [button('Edit route', { 'data-route-train': train.id })] : []),
+    ...(conductor.mayTake
+      ? [button('Be the conductor', { 'data-conductor': 'take', 'data-train': train.id })]
+      : []),
+    ...(conductor.mayDrop
+      ? [
+          button(conductor.who === 'you' ? 'Stop being the conductor' : 'Take the conductor off', {
+            'data-conductor': 'give-up',
+            'data-train': train.id,
+          }),
+        ]
+      : []),
+  ];
   const route: PageNode = {
     tag: 'section',
     className: 'route',
@@ -465,40 +444,20 @@ function trainPart(
     ],
   };
   return [
-    ...(train.may.arrange
-      ? [
-          {
-            tag: 'div',
-            className: 'train-actions',
-            children: [button('Edit route', { 'data-route-train': train.id })],
-          },
-        ]
-      : []),
-    manage,
+    { tag: 'div', className: 'conductor', text: who },
+    ...(actions.length === 0
+      ? []
+      : [{ tag: 'div', className: 'train-actions', children: actions }]),
     route,
   ];
 }
 
-/** A line that sends the member to the post on Discord. */
-function onDiscord(text: string, party: MapParty, context: PostDrawContext): PageNode {
-  const href = safeHref(party.link, context.origin, context.guild);
-  return {
-    tag: 'div',
-    className: 'to-discord',
-    children: [
-      href === undefined
-        ? { tag: 'span', text }
-        : { tag: 'a', text, attributes: { href, ...NEW_TAB } },
-    ],
-  };
-}
-
 /**
  * The member's own part under the post (the map's, as before plan 8M-8A, in the post's look):
  * who they are in it (`You: Coming, group B · remote`), the group a newcomer picks (Interested,
  * Join and Here send it), and what the map lets them do beyond the post's buttons: a raid's
- * Change… (its boss and moves are slash commands on Discord), a train's Edit route and what its
- * Manage… and Route show, a meetup's Edit….
+ * Change… (its boss and moves are slash commands on Discord), a train's conductor role, Edit
+ * route and what Route shows, a meetup's Edit….
  */
 function minePart(party: MapParty, context: PostDrawContext): PageNode[] {
   const { mine, groups, remote } = party.attendance;
diff --git a/src/web/client/post-forms-ui.isolated.test.ts b/src/web/client/post-forms-ui.isolated.test.ts
index ee37c7d1e8ee70325fdce7c95e6506d4c996a1ba..316cc3de6b24a921ca9137cadd4c8ef10c0340f5 100644
--- a/src/web/client/post-forms-ui.isolated.test.ts
+++ b/src/web/client/post-forms-ui.isolated.test.ts
@@ -465,3 +465,63 @@ describe('the forms of the post’s controls in the page (plan 8M-8B)', () => {
     expect(closed).toEqual([staffs]);
   });
 });
+
+describe("a train's forms in the page (plan 8M-8C)", () => {
+  afterEach(() => {
+    vi.unstubAllGlobals();
+  });
+
+  // Manage… asks the trains' address what the dialog shows, and sends its Submit there; a
+  // refusal that gives the train as it is now (moved on meanwhile) closes the form and asks for
+  // the list again, without taking the train for over.
+  it('opens Manage… from the trains’ address, and a refusal with the train closes it without closing the popup', async () => {
+    const { ui, button, post, done, closed } = page();
+    const asked: Array<{ url: string; method: string; body?: unknown }> = [];
+    const manage = {
+      title: 'Manage the train',
+      text: 'At stop 1 of 3: Veterans Memorial Bridge',
+      kind: {
+        label: 'What the train is mainly for',
+        options: [
+          { value: 'raid', label: 'Raids' },
+          { value: 'dynamax', label: 'Dynamax Battles' },
+        ],
+        picked: 'raid',
+      },
+      shown: { from: '4', first: '4', atEnd: 'finish', kind: 'raid' },
+    };
+    vi.stubGlobal('fetch', (url: string, init?: { method?: string; body?: string }) => {
+      const method = init?.method ?? 'GET';
+      asked.push({
+        url,
+        method,
+        ...(init?.body === undefined ? {} : { body: JSON.parse(init.body) as unknown }),
+      });
+      const answer =
+        method === 'GET'
+          ? { status: 200, body: manage }
+          : {
+              status: 409,
+              body: { ok: false, text: 'The train has moved on.', train: { id: 'r1', route: [] } },
+            };
+      return Promise.resolve({
+        ok: answer.status < 400,
+        status: answer.status,
+        json: () => Promise.resolve(answer.body),
+      });
+    });
+    ui.manageClicked(button as unknown as HTMLButtonElement, raid);
+    await focusOn(undefined);
+    post.querySelector('button[data-submit]')?.dispatch('click');
+    await done;
+    expect(asked).toEqual([
+      { url: '/s/100000000000000001/api/trains/r1/manage', method: 'GET' },
+      {
+        url: '/s/100000000000000001/api/trains/r1/manage',
+        method: 'POST',
+        body: { shown: manage.shown, picked: { kind: 'raid' } },
+      },
+    ]);
+    expect(closed).toEqual([]);
+  });
+});
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index cc98c5c3e18e5c9f4f74c2127a83e97fc1919044..469df03782b088958344dbd5a9f9a49f0249778f 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -1,4 +1,6 @@
 import type { MapMeet, MapParty, MapReport } from '../../domain/web/party-data.js';
+import type { MapManage } from '../../domain/web/train-data.js';
+import { manageBody, manageForm } from './train-post-forms.js';
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type PageNode } from './popup.js';
@@ -87,7 +89,9 @@ export function postFormsUi(deps: PostFormsDeps) {
     load: () => Promise<Opened | { refused: string }>,
     ends = false,
   ): Promise<void> => {
-    const section = button.closest<HTMLElement>('.post-popup');
+    // A party's post, or its own summary while the page has not got the post (a train's).
+    const section =
+      button.closest<HTMLElement>('.post-popup') ?? button.closest<HTMLElement>('.party-popup');
     if (!section) return;
     const place = formPlace(section);
     // Outside a popup or the card (a line of the list), its claim goes with its form.
@@ -129,7 +133,7 @@ export function postFormsUi(deps: PostFormsDeps) {
       const sent = await sendPostForm(deps.csrf.get(), {
         post: async (token) => {
           const reply = await fetch(
-            `/s/${guild}/api/parties/${encodeURIComponent(party.id)}/${control}`,
+            `/s/${guild}/api/${partiesOf(control)}/${encodeURIComponent(party.id)}/${control}`,
             {
               method: 'POST',
               credentials: 'same-origin',
@@ -188,7 +192,7 @@ export function postFormsUi(deps: PostFormsDeps) {
   const asked = async <T>(partyId: string, control: string): Promise<T | { refused: string }> => {
     try {
       const reply = await fetch(
-        `/s/${guild}/api/parties/${encodeURIComponent(partyId)}/${control}`,
+        `/s/${guild}/api/${partiesOf(control)}/${encodeURIComponent(partyId)}/${control}`,
         { credentials: 'same-origin' },
       );
       const body = (await reply.json().catch(() => undefined)) as unknown;
@@ -244,6 +248,23 @@ export function postFormsUi(deps: PostFormsDeps) {
       });
     },
 
+    /**
+     * A train's Manage… (plan 8M-8C): its form from what the post's dialog shows now (`GET
+     * …/trains/<id>/manage`), or why not. A refusal of its Submit closes it (its choices may be
+     * stale) and the list is asked for again.
+     */
+    manageClicked(button: HTMLButtonElement, party: MapParty): void {
+      void open(button, 'manage', party, async () => {
+        const manage = await asked<MapManage>(party.id, 'manage');
+        if ('refused' in manage) return manage;
+        return {
+          form: manageForm(party.id, manage),
+          bodyOf: (fields) => manageBody(manage, fields),
+          refusalCloses: true as const,
+        };
+      });
+    },
+
     /** Meet…: its form, from what the server offers now (`GET …/meet`), or why not. */
     meetClicked(button: HTMLButtonElement, party: MapParty): void {
       void open(button, 'meet', party, async () => {
@@ -269,4 +290,12 @@ interface Opened {
 /** What the page says when a form could not ask the server what it offers. */
 const NOT_OPENED = 'That did not get through; try again.';
 
+/** The forms of a train's post (plan 8M-8C), whose addresses are the trains'. */
+const TRAIN_FORMS: ReadonlySet<string> = new Set(['manage']);
+
+/** Where a form's control is: `/api/trains/<id>/…` for a train's, else `/api/parties/<id>/…`. */
+function partiesOf(control: string): 'trains' | 'parties' {
+  return TRAIN_FORMS.has(control) ? 'trains' : 'parties';
+}
+
 export type PostFormsUi = ReturnType<typeof postFormsUi>;
diff --git a/src/web/client/post-forms.ts b/src/web/client/post-forms.ts
index 1b71634d0d069ea44a8dcf99b77fe410d81cf77d..cd2af90063536f8a732cf67f5f46ed0d4b4fb280 100644
--- a/src/web/client/post-forms.ts
+++ b/src/web/client/post-forms.ts
@@ -69,7 +69,7 @@ function dialogButtons(submit: string): PageNode {
  * A radio choice as Discord's dialog draws it: its label over the choices, each with its words
  * and a line under them; the first picked to start with, as the dialog marks it.
  */
-function radioChoice(
+export function radioChoice(
   name: string,
   label: string,
   choices: ReadonlyArray<{ value: string; label: string; line?: string }>,
@@ -110,7 +110,12 @@ function radioChoice(
 }
 
 /** A form in Discord's dialog look: its title, its parts, Submit and Cancel, its answer. */
-function dialogForm(form: string, partyId: string, title: string, parts: PageNode[]): PageNode {
+export function dialogForm(
+  form: string,
+  partyId: string,
+  title: string,
+  parts: PageNode[],
+): PageNode {
   return {
     tag: 'div',
     className: 'post-form',
@@ -365,5 +370,11 @@ export async function sendPostForm(csrf: string, steps: PressSteps): Promise<Pos
   });
   const body = last?.body;
   const ok = typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true;
-  return { ...pressed, ok, gone: last?.status === 409 };
+  // A train's form (plan 8M-8C) is refused 409 with the train as it is now where it was drawn
+  // from another state of it (moved on, its route changed): a refusal, not a party that is over.
+  const withTrain =
+    typeof body === 'object' &&
+    body !== null &&
+    typeof (body as { train?: unknown }).train === 'object';
+  return { ...pressed, ok, gone: last?.status === 409 && !withTrain };
 }
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 44bc238e0a29ea2a318c437fb014355d45c78398..21aa59fd20ccfded40cb00680500dcac45125ed0 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -48,14 +48,15 @@ export interface RaidUiDeps {
 
 /**
  * The controls that open a form ("Report raid", "Change…", "Report spawn here", and of trains
- * "New train", "Edit route", "Manage…", and of meetups "New meetup", "Meetup here", "Edit…") under
- * `root`, on or off; with them the choices of a gym's raids, which draw the popup or phone card
- * anew (review W-3).
+ * "New train", "Edit route", "Move…", "Manage…", and of meetups "New meetup", "Meetup here",
+ * "Edit…") under `root`, on or off; with them the choices of a gym's raids, which draw the popup
+ * or phone card anew (review W-3).
  */
 export function formControls(root: ParentNode, on: boolean): void {
   for (const button of root.querySelectorAll<HTMLButtonElement>(
     'button[data-report], button[data-change-raid], button[data-spawn], button[data-show-raid], ' +
       'button[data-new-train], button[data-route-train], button[data-move-train], ' +
+      'button[data-manage-train], ' +
       'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup], ' +
       'button[data-regroup], button[data-meet], button[data-close-party], ' +
       'button[data-report-party]',
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 7ae76567275dfa4942fe21dc8a5cfb9ed890c867..35ba8a871ade7349ff801e4a6e0a4fc037c0f819 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -64,16 +64,13 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     remote: { offered: false, on: false },
     count: false,
   },
-  may: { arrange: true, clear: false, load: true, kind: false },
+  may: { arrange: true, clear: false, load: true },
   panel: {
     place: '1',
     moves: [
       { move: 'next', target: '7' },
       { move: 'previous', target: '4' },
-      { move: 'finish', target: 'end' },
     ],
-    reverse: null,
-    atEnd: 'finish',
   },
   conductor: { who: null, mayTake: true, mayDrop: false },
   moveRefusal: null,
@@ -156,10 +153,11 @@ describe('starting a train (startForm, startBody)', () => {
 });
 
 describe("a train's actions in its popup (trainActions)", () => {
-  it('offers Edit route, Manage… and the conductor role as the member may, naming nobody', () => {
+  it('offers Edit route, Move…, Manage… and the conductor role as the member may, naming nobody', () => {
     expect(buttons(trainActions(train()))).toEqual([
       ['Edit route', { type: 'button', 'data-route-train': 't1' }],
-      ['Manage…', { type: 'button', 'data-move-train': 't1' }],
+      ['Move…', { type: 'button', 'data-move-train': 't1' }],
+      ['Manage…', { type: 'button', 'data-manage-train': 't1' }],
       ['Be the conductor', { type: 'button', 'data-conductor': 'take', 'data-train': 't1' }],
     ]);
     const conducting = train({ conductor: { who: 'you', mayTake: false, mayDrop: true } });
@@ -195,9 +193,13 @@ describe("a train's actions in its popup (trainActions)", () => {
 
   it('offers nothing to who may do nothing of it', () => {
     const watching = train({
-      may: { arrange: false, clear: false, load: false, kind: false },
+      may: { arrange: false, clear: false, load: false },
       panel: null,
       conductor: { who: 'other', mayTake: false, mayDrop: false },
+      moveRefusal: {
+        reason: 'not-conductor',
+        text: 'This train has a conductor: only they and the moderators can move it.',
+      },
     });
     expect(trainActions(watching)).toEqual([
       { tag: 'div', className: 'conductor', text: 'It has a conductor.' },
@@ -342,7 +344,7 @@ describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
 
   it('leaves the stops without their buttons for who may no longer arrange the route', () => {
     const editor = routeEditor(
-      train({ may: { arrange: false, clear: false, load: false, kind: false } }),
+      train({ may: { arrange: false, clear: false, load: false } }),
       gym,
       [],
     );
@@ -366,7 +368,7 @@ describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
 
   it('offers Clear to who may clear, and Load only to who may load', () => {
     const leading = routeEditor(
-      train({ may: { arrange: true, clear: true, load: false, kind: false } }),
+      train({ may: { arrange: true, clear: true, load: false } }),
       gym,
       [],
     );
@@ -489,12 +491,12 @@ describe('the edits of route mode, one at a time (RouteEdits)', () => {
   });
 });
 
-describe('the Manage train panel (movePanel, pressBody)', () => {
-  it('says where the train is and offers the moves that can be made, each with where it leads', () => {
+describe('the moves of a train (movePanel, pressBody)', () => {
+  it('says where the train is and offers the moves that can be made, each with where it leads; Finish, Reverse and the mode are Manage…’s', () => {
     const panel = movePanel(train(), gym);
     expect(panel?.attributes).toEqual({ 'data-form': 'move', 'data-party': 't1' });
     expect(texts(panel ?? { tag: 'none' }).slice(0, 2)).toEqual([
-      'Manage the train',
+      'Move the train',
       'At stop 2 of 3: The Stacks',
     ]);
     expect(
@@ -506,36 +508,20 @@ describe('the Manage train panel (movePanel, pressBody)', () => {
     ).toEqual([
       ['Next', 'next', '7'],
       ['Previous', 'previous', '4'],
-      ['Finish', 'finish', 'end'],
-      ['Set', 'at-end', undefined],
       ['Done', undefined, undefined],
     ]);
     const finished = movePanel(
-      train({
-        stop: null,
-        panel: {
-          place: 'end',
-          moves: [{ move: 'previous', target: '7' }],
-          reverse: '4',
-          atEnd: 'loop',
-        },
-      }),
+      train({ stop: null, panel: { place: 'end', moves: [{ move: 'previous', target: '7' }] } }),
       gym,
     );
     expect(texts(finished ?? { tag: 'none' })).toContain('The route of 3 stops is finished.');
-    expect(buttons(finished ?? { tag: 'none' }).map(([text]) => text)).toContain(
-      'Reverse the route',
-    );
     expect(movePanel(train({ panel: null }), gym)).toBeUndefined();
   });
 
-  it('makes the body of a press: where the panel was drawn and what the button carries', () => {
+  it('makes the body of a press: where the panel was drawn and where the button leads', () => {
     const { panel } = train();
     if (!panel) throw new Error('no panel');
-    expect(pressBody(panel, 'next', { target: '7' })).toEqual({ from: '1', target: '7' });
-    expect(pressBody(panel, 'finish', { target: 'end' })).toEqual({ from: '1' });
-    expect(pressBody(panel, 'reverse', { first: '4' })).toEqual({ from: '1', first: '4' });
-    expect(pressBody(panel, 'at-end', { atEnd: 'loop' })).toEqual({ from: '1', atEnd: 'loop' });
+    expect(pressBody(panel, { target: '7' })).toEqual({ from: '1', target: '7' });
   });
 });
 
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index 0351f3451b4f925dcb01552fcb4bbd635f362e13..bbf37bfda1303e1ea4cf35f19db45cdbb20e04e5 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -2,7 +2,6 @@ import type { MapAtEnd, MapMove, MapTrain, MapTrainPanel } from '../../domain/we
 import {
   MAP_AT_ENDS,
   type ConductorSeen,
-  type PanelPress,
   type RouteEdit,
   type SavedRouteView,
 } from '../../domain/web/train-data.js';
@@ -43,7 +42,6 @@ const MOVE_WORDS: Readonly<Record<MapMove, string>> = {
   next: 'Next',
   previous: 'Previous',
   skip: 'Skip',
-  finish: 'Finish',
 };
 
 const button = (
@@ -201,9 +199,10 @@ export function startBody(values: StartValues): TrainBody {
 }
 
 /**
- * What a train's popup offers a member beyond the post's buttons, as they may (`MapTrain.may`,
- * `panel`, `conductor`): "Edit route", "Manage…", and taking or giving up the conductor role; and
- * whose the role is, without naming anybody.
+ * What a train's own summary offers a member (shown until its post comes), as they may
+ * (`MapTrain.may`, `panel`, `moveRefusal`, `conductor`): "Edit route", "Move…", "Manage…" (for who
+ * may move the train, also without a route: its kind), and taking or giving up the conductor
+ * role; and whose the role is, without naming anybody.
  */
 export function trainActions(train: MapTrain): PageNode[] {
   const { conductor } = train;
@@ -213,9 +212,11 @@ export function trainActions(train: MapTrain): PageNode[] {
       : conductor.who === 'other'
         ? 'It has a conductor.'
         : undefined;
+  const manages = train.moveRefusal === null || train.moveRefusal.reason === 'no-route';
   const buttons = [
     ...(train.may.arrange ? [button('Edit route', { 'data-route-train': train.id })] : []),
-    ...(train.panel ? [button('Manage…', { 'data-move-train': train.id })] : []),
+    ...(train.panel ? [button('Move…', { 'data-move-train': train.id })] : []),
+    ...(manages ? [button('Manage…', { 'data-manage-train': train.id })] : []),
     ...(conductor.mayTake
       ? [button('Be the conductor', { 'data-conductor': 'take', 'data-train': train.id })]
       : []),
@@ -537,9 +538,9 @@ export function routeEditBody(
 }
 
 /**
- * The Manage train panel on the map, in the train's popup (spec 3.7): where the train is, the
- * moves that can be made from there (`MapTrainPanel.moves`), "Reverse the route" where it may be,
- * what the train does at its end with Set, and Done. Nothing for a train without a panel.
+ * The moves of a train on the map, in the train's popup (spec 3.7): where the train is, the moves
+ * that can be made from there (`MapTrainPanel.moves`), and Done. Finish, Reverse and the mode are
+ * Manage…'s (plan 8M-8C). Nothing for a train without a panel.
  */
 export function movePanel(
   train: MapTrain,
@@ -557,26 +558,15 @@ export function movePanel(
     className: 'raid-form move-panel',
     attributes: { 'data-form': 'move', 'data-party': train.id },
     children: [
-      { tag: 'strong', className: 'name', text: 'Manage the train' },
+      { tag: 'strong', className: 'name', text: 'Move the train' },
       { tag: 'div', className: 'stop', text: where },
       {
         tag: 'div',
         className: 'form-buttons',
-        children: [
-          ...panel.moves.map(({ move, target }) =>
-            button(MOVE_WORDS[move], { 'data-press': move, 'data-target': target }),
-          ),
-          ...(panel.reverse === null
-            ? []
-            : [
-                button('Reverse the route', {
-                  'data-press': 'reverse',
-                  'data-first': panel.reverse,
-                }),
-              ]),
-        ],
+        children: panel.moves.map(({ move, target }) =>
+          button(MOVE_WORDS[move], { 'data-press': move, 'data-target': target }),
+        ),
       },
-      labelled('At the end', atEndSelect(panel.atEnd), button('Set', { 'data-press': 'at-end' })),
       {
         tag: 'div',
         className: 'form-buttons',
@@ -587,33 +577,15 @@ export function movePanel(
   };
 }
 
-/** What a press of the panel reads of its button and the menu. */
-export interface PressValues {
-  target?: string;
-  first?: string;
-  atEnd?: string;
-}
-
 /**
- * The body of a press of the panel (`POST /s/<guild>/api/trains/<id>/move/<press>`): where the
- * panel was drawn (`from`) and what the button carries.
+ * The body of a move (`POST /s/<guild>/api/trains/<id>/move/<move>`): where the panel was drawn
+ * (`from`) and where the button leads.
  */
 export function pressBody(
   panel: MapTrainPanel,
-  press: PanelPress,
-  values: PressValues,
+  values: { target?: string | undefined },
 ): Record<string, string> {
-  const from = panel.place;
-  switch (press) {
-    case 'finish':
-      return { from };
-    case 'reverse':
-      return { from, first: values.first ?? '' };
-    case 'at-end':
-      return { from, atEnd: values.atEnd ?? panel.atEnd };
-    default:
-      return { from, target: values.target ?? '' };
-  }
+  return { from: panel.place, target: values.target ?? '' };
 }
 
 /**
diff --git a/src/web/client/train-post-forms.test.ts b/src/web/client/train-post-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..eb6117c0159da06b0fd44ef467dd3e0b1690b29b
--- /dev/null
+++ b/src/web/client/train-post-forms.test.ts
@@ -0,0 +1,139 @@
+import { describe, expect, it } from 'vitest';
+import type { MapManage } from '../../domain/web/train-data.js';
+import type { PageNode } from './popup.js';
+import { sendPostForm } from './post-forms.js';
+import { manageBody, manageForm } from './train-post-forms.js';
+
+/** Every node of a tree, depth first. */
+function all(node: PageNode): PageNode[] {
+  return [node, ...(node.children ?? []).flatMap(all)];
+}
+
+/** What a reader sees of a tree: its texts, in order. */
+function seen(node: PageNode): string {
+  return (node.text ?? '') + (node.children ?? []).map(seen).join('');
+}
+
+/** The radio inputs of a form by their group's name: their values, the one checked marked. */
+function radios(form: PageNode, name: string): string[] {
+  return all(form)
+    .filter((one) => one.attributes?.type === 'radio' && one.attributes.name === name)
+    .map((one) => `${one.attributes?.value ?? ''}${one.attributes?.checked === '' ? ' *' : ''}`);
+}
+
+const manage = (more: Partial<MapManage> = {}): MapManage => ({
+  title: 'Manage the train',
+  text: 'At stop 1 of 3: Veterans Memorial Bridge\nNext is The Stacks',
+  route: {
+    label: 'The route',
+    options: [
+      { value: 'keep', label: 'Keep it as it is' },
+      { value: 'reverse', label: 'Reverse it' },
+      { value: 'finish', label: 'Finish it here' },
+    ],
+    picked: 'keep',
+  },
+  atEnd: {
+    label: 'At the end of the route',
+    options: [
+      { value: 'finish', label: 'Finish at the last stop', line: 'The train stops', emoji: '🏁' },
+      { value: 'loop', label: 'Loop: back to the first stop', line: 'After the last', emoji: '🔁' },
+    ],
+    picked: 'loop',
+  },
+  kind: {
+    label: 'What the train is mainly for',
+    options: [
+      { value: 'raid', label: 'Raids', line: 'Members choose', emoji: '⚔️' },
+      { value: 'dynamax', label: 'Dynamax Battles', line: 'Lobbies form', emoji: '🔴' },
+    ],
+    picked: 'raid',
+  },
+  shown: { from: '4', first: '4', atEnd: 'loop', kind: 'raid' },
+  ...more,
+});
+
+describe('Manage… on the map (plan 8M-8C)', () => {
+  it("draws the dialog: its title and text, the route's choices, the mode and the kind, each with the train's own picked", () => {
+    const form = manageForm('t1', manage());
+    expect(form.className).toBe('post-form');
+    expect(form.attributes).toMatchObject({ 'data-form': 'manage', 'data-party': 't1' });
+    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Manage the train');
+    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe(
+      'At stop 1 of 3: Veterans Memorial Bridge\nNext is The Stacks',
+    );
+    expect(
+      all(form)
+        .filter((one) => one.tag === 'legend')
+        .map((one) => one.text),
+    ).toEqual(['The route', 'At the end of the route', 'What the train is mainly for']);
+    expect(radios(form, 'route')).toEqual(['keep *', 'reverse', 'finish']);
+    expect(radios(form, 'atEnd')).toEqual(['finish', 'loop *']);
+    expect(radios(form, 'kind')).toEqual(['raid *', 'dynamax']);
+    // A menu's emoji before its words, as Discord shows them, and its description under them.
+    expect(
+      all(form)
+        .filter((one) => one.className === 'choice')
+        .map(seen)
+        .slice(3, 5),
+    ).toEqual([
+      '🏁 Finish at the last stopThe train stops',
+      '🔁 Loop: back to the first stopAfter the last',
+    ]);
+    expect(
+      all(form)
+        .filter((one) => one.tag === 'button')
+        .map((one) => one.text),
+    ).toEqual(['Submit', 'Cancel']);
+  });
+
+  it('asks a train without a route its kind alone', () => {
+    const {
+      route: _route,
+      atEnd: _atEnd,
+      ...routeless
+    } = manage({
+      text: 'This train has no route yet. Add its stops with /route add.',
+    });
+    const form = manageForm('t1', routeless);
+    expect(radios(form, 'route')).toEqual([]);
+    expect(radios(form, 'atEnd')).toEqual([]);
+    expect(radios(form, 'kind')).toEqual(['raid *', 'dynamax']);
+  });
+
+  it('sends back what it showed with what is picked, the parts it did not ask left out', () => {
+    expect(manageBody(manage(), { route: 'reverse', atEnd: 'finish', kind: 'dynamax' })).toEqual({
+      body: {
+        shown: { from: '4', first: '4', atEnd: 'loop', kind: 'raid' },
+        picked: { kind: 'dynamax', route: 'reverse', atEnd: 'finish' },
+      },
+    });
+    const { route: _route, atEnd: _atEnd, ...routeless } = manage();
+    expect(manageBody(routeless, { kind: 'raid' })).toEqual({
+      body: { shown: manage().shown, picked: { kind: 'raid' } },
+    });
+    expect(manageBody(manage(), { kind: 'max', route: 'keep', atEnd: 'loop' })).toEqual({
+      text: 'Pick what the train is mainly for first.',
+    });
+  });
+});
+
+describe('a train form’s answer (sendPostForm)', () => {
+  it('takes a 409 that gives the train as it is now for a refusal, not for a train that is over', async () => {
+    const stale = await sendPostForm('t', {
+      post: () =>
+        Promise.resolve({
+          status: 409,
+          body: { ok: false, text: 'The train has moved on.', train: { id: 't1', route: [] } },
+        }),
+      me: () => Promise.reject(new Error('not asked')),
+    });
+    expect(stale).toMatchObject({ ok: false, gone: false, text: 'The train has moved on.' });
+    const over = await sendPostForm('t', {
+      post: () =>
+        Promise.resolve({ status: 409, body: { ok: false, text: 'This train is over.' } }),
+      me: () => Promise.reject(new Error('not asked')),
+    });
+    expect(over).toMatchObject({ ok: false, gone: true });
+  });
+});
diff --git a/src/web/client/train-post-forms.ts b/src/web/client/train-post-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a317eb85fecc58d32c65e22aecdede4810cb8f6b
--- /dev/null
+++ b/src/web/client/train-post-forms.ts
@@ -0,0 +1,70 @@
+import type { MapFormChoice, MapManage } from '../../domain/web/train-data.js';
+import { MAP_AT_ENDS, MAP_TRAIN_KINDS } from '../../domain/web/train-data.js';
+import type { PageNode } from './popup.js';
+import { dialogForm, radioChoice, type PostFormBody } from './post-forms.js';
+
+/**
+ * A train's post's dialogs as forms of the live map (plan 8M-8C), the parts that need no DOM:
+ * Manage… (and, with the next tasks, Move… and Split…), drawn in Discord's dialog look in the
+ * place of the post as the forms of plan 8M-8B are (`dialogForm`), and their bodies. What the
+ * dialog says, offers and picks to start with is the server's (`manageForm` of
+ * `src/render/train-dialogs.ts`, the dialog's own builder); the page only draws it.
+ */
+
+/**
+ * A choice of a dialog as a radio choice of the form: each option's emoji before its words (a
+ * menu of the dialog shows it), its description under them, the one picked to start with checked.
+ * The dialog draws the mode and the kind as menus because Android picks a radio group's first
+ * choice whatever is marked (review R7); a page checks what it is told, so every choice is a radio
+ * choice here, each option with its line in sight.
+ */
+function choiceOf(name: string, choice: MapFormChoice): PageNode {
+  return radioChoice(
+    name,
+    choice.label,
+    choice.options.map((option) => ({
+      value: option.value,
+      label: option.emoji === undefined ? option.label : `${option.emoji} ${option.label}`,
+      ...(option.line === undefined ? {} : { line: option.line }),
+    })),
+    choice.picked,
+  );
+}
+
+/**
+ * Manage…'s form (plan 8M-8C), as the post's dialog: its title and text (where the train is, or
+ * that it has no route yet), "The route" where more than Keep is left, "At the end of the route"
+ * (not for a train without a route) and "What the train is mainly for", each with the train's own
+ * picked to start with.
+ */
+export function manageForm(trainId: string, manage: MapManage): PageNode {
+  return dialogForm('manage', trainId, manage.title, [
+    { tag: 'p', className: 'form-text', text: manage.text },
+    ...(manage.route === undefined ? [] : [choiceOf('route', manage.route)]),
+    ...(manage.atEnd === undefined ? [] : [choiceOf('atEnd', manage.atEnd)]),
+    choiceOf('kind', manage.kind),
+  ]);
+}
+
+const ROUTE_WAYS = ['keep', 'reverse', 'finish'] as const;
+
+/**
+ * The body of Manage…'s Submit: what the form showed, as the server gave it, and what is picked;
+ * a part the form did not ask is left out (the server takes it as shown).
+ */
+export function manageBody(manage: MapManage, fields: Record<string, string>): PostFormBody {
+  const kind = MAP_TRAIN_KINDS.find((one) => one === fields.kind);
+  if (kind === undefined) return { text: 'Pick what the train is mainly for first.' };
+  const route = ROUTE_WAYS.find((one) => one === fields.route);
+  const atEnd = MAP_AT_ENDS.find((one) => one === fields.atEnd);
+  return {
+    body: {
+      shown: manage.shown,
+      picked: {
+        kind,
+        ...(manage.route === undefined || route === undefined ? {} : { route }),
+        ...(manage.atEnd === undefined || atEnd === undefined ? {} : { atEnd }),
+      },
+    },
+  };
+}
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 23e7f212e4cf3fa6160c05f39743e6110dc50854..e6d76b14f5190f3396cbb69015cfb6ebb05cda7d 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -258,16 +258,13 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     remote: { offered: false, on: false },
     count: false,
   },
-  may: { arrange: true, clear: false, load: true, kind: false },
+  may: { arrange: true, clear: false, load: true },
   panel: {
     place: '1',
     moves: [
       { move: 'next', target: '7' },
       { move: 'previous', target: '4' },
-      { move: 'finish', target: 'end' },
     ],
-    reverse: null,
-    atEnd: 'finish',
   },
   conductor: { who: null, mayTake: true, mayDrop: false },
   moveRefusal: null,
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index f3a3a07a4f13c98bb58d33508505a6f32e25943a..423042459e7e5fb44f9f76fc1fd9a57db125b6e1 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -37,7 +37,7 @@ import {
  * The trains of the live map in the page (plan 8M-5, spec 3.7): "New train" in the side panel
  * opens the start form there; "Edit route" in a train's popup puts the map in route mode for it
  * (the route editor in the side panel, the stops numbered on the map, a gym clicked added as the
- * next stop, one edit at a time); "Manage…" opens the Manage train panel in the popup, which stays
+ * next stop, one edit at a time); "Move…" opens the moves in the popup, which stay
  * open after a move as the post's does; the conductor buttons press at once. One form or mode at
  * a time (`FormHold`, shared with the raid and spawn forms); the start form and route mode are
  * forms of the trains' box, under which the list is drawn (`aside`). After a success the map
@@ -369,7 +369,7 @@ export function trainUi(deps: TrainUiDeps) {
   };
 
   /**
-   * The Manage train panel in a train's popup, in place of its actions. It stays open after a
+   * The moves of a train in its popup, in place of its actions. It stays open after a
    * move, drawn anew from where the train is then, as the post's panel does; Done closes it and
    * draws the map with the train's popup open again, and so does a move after which the member
    * may move it no more (no panel). Meanwhile the list is asked for again after each move, and
@@ -402,11 +402,7 @@ export function trainUi(deps: TrainUiDeps) {
         }
         const press = target.dataset.press;
         if (!isPanelPress(press) || !shown.panel) return;
-        const body = pressBody(shown.panel, press, {
-          target: target.dataset.target,
-          first: target.dataset.first,
-          atEnd: fieldsOf(panel).atEnd,
-        });
+        const body = pressBody(shown.panel, { target: target.dataset.target });
         void sendForm(panel, trainUrl(shown, `move/${press}`), { body }).then(async (sent) => {
           if (!sent) return;
           // The panel is closed meanwhile, or the train is gone (409 without a train): the map
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index f797a34a7b56fd7ef591cb50a9ea03f9356bf40d..f4f2ee2001a8f074b65290358d17d053aa9fd13e 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -89,7 +89,7 @@ const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
   stop: 0,
   link: 'https://discord.com/channels/1/3',
   attendance: attendance(4, 1),
-  may: { arrange: false, clear: false, load: false, kind: false },
+  may: { arrange: false, clear: false, load: false },
   panel: null,
   conductor: { who: null, mayTake: false, mayDrop: false },
   moveRefusal: null,
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index d90e8761fc83e986e00c138d3ea470183b439731..414a07f42d3109ce9cf39c6d1af5edd19201c13a 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -62,9 +62,11 @@ import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
+import { pageWords } from './page-words.js';
 import type { PartyViewers } from './party-viewers.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
+import { refusalOnTheMap } from './train-views.js';
 
 /**
  * The requests for a server's parties one address may make in a minute: a page asks every 20
@@ -379,6 +381,9 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
       const layout = parties.layoutOf(party.id);
       return layout === undefined ? undefined : postKey(layout);
     },
+    // Why Move… and Manage… do not open, in Discord's words (plan 8M-8C, review C1).
+    trainRefusal: (reason) =>
+      refusalOnTheMap(parties, reason, (text) => pageWords(text, parties.zone, deps.now())),
   });
 
   /**
diff --git a/src/web/train-manage.test.ts b/src/web/train-manage.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b3d95d3f77829a8a4b19be2e13bf6a5367959a06
--- /dev/null
+++ b/src/web/train-manage.test.ts
@@ -0,0 +1,372 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW, REPORTER, stops } from '../../test/support/parties.js';
+import { createdTrain } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  TEST_OWNER_ID,
+  trainWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { ACTION_THROTTLE } from '../commands/parties/reply.js';
+import { controlThrottleKey } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { PartiesView } from '../domain/web/party-data.js';
+import type { ManageBody, MapManage, TrainAnswer } from '../domain/web/train-data.js';
+import { PARTY_KIND } from '../render/party-controls.js';
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+/**
+ * A train of the party services of a test (`createdTrain`, made by `REPORTER`) on the route
+ * Veterans Memorial Bridge (4), The Stacks (1), Harbor Lighthouse Mural (7), at its first stop, on
+ * the map: Alice signed up as coming, Bob a member who is not signed up, the bot's owner staff.
+ */
+async function managing(options: { throttles?: Throttles; route?: number[] } = {}) {
+  const made = await createdTrain({ route: options.route ?? [4, 1, 7] });
+  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+  await made.attendance.flush();
+  for (const message of made.gateway.messagesIn(made.postId)) {
+    await made.gateway.deleteMessage(made.postId, message.id);
+  }
+  const throttles = options.throttles ?? new Throttles();
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    trains: made.trains,
+    parties: made.store,
+    regions: made.regions,
+    users: made.users,
+  });
+  const names: Array<[string, string]> = [
+    [ALICE, 'Alice'],
+    [BOB, 'Bob'],
+    [REPORTER, 'Reporter'],
+    [TEST_OWNER_ID, 'Owner'],
+  ];
+  const members = new FakeMemberDirectory();
+  const acting = new FakeActingMembers();
+  for (const [id, name] of names) {
+    members.add(id, name);
+    acting.add(id, name);
+  }
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    trains: trainWebWith(ctx),
+  });
+  web.clock.now = PARTY_NOW;
+  const url = `/s/${FAKE_GUILD_ID}/api/trains/${made.party.id}/manage`;
+  /** Opens Manage… as this member (`GET …/manage`). */
+  const open = async (userId = ALICE, name = 'Alice') => {
+    const answer = await web.app.inject({
+      url,
+      headers: { cookie: await web.loggedIn(userId, name) },
+    });
+    return { status: answer.statusCode, json: answer.json<MapManage & { error?: string }>() };
+  };
+  /** Submits Manage… as this member, what was shown sent back with what was picked. */
+  const submit = async (body: ManageBody | object, userId = ALICE, name = 'Alice') => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url,
+      headers: { ...(await web.posting(userId, name)), 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return { status: answer.statusCode, json: answer.json<TrainAnswer & { error?: string }>() };
+  };
+  const lines = async (): Promise<string[]> => {
+    await made.trains.flush();
+    await made.attendance.flush();
+    return made.said().join('\n').split('\n').filter(Boolean);
+  };
+  return { made, web, throttles, open, submit, lines };
+}
+
+describe('Manage… of a train on the map (plan 8M-8C)', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("opens with Discord's dialog: where the train is, the route's choices, the mode and the kind, each with the train's own picked", async () => {
+    const map = await managing();
+    web = map.web;
+    const opened = await map.open();
+    expect(opened.status).toBe(200);
+    expect(opened.json).toEqual({
+      title: 'Manage the train',
+      text: 'At stop 1 of 3: Veterans Memorial Bridge\nNext is The Stacks',
+      route: {
+        label: 'The route',
+        options: [
+          { value: 'keep', label: 'Keep it as it is' },
+          { value: 'reverse', label: 'Reverse it' },
+          { value: 'finish', label: 'Finish it here' },
+        ],
+        picked: 'keep',
+      },
+      atEnd: {
+        label: 'At the end of the route',
+        options: [
+          {
+            value: 'finish',
+            label: 'Finish at the last stop',
+            line: 'The train stops at the last stop',
+            emoji: '🏁',
+          },
+          {
+            value: 'loop',
+            label: 'Loop: back to the first stop',
+            line: 'After the last stop comes the first',
+            emoji: '🔁',
+          },
+          {
+            value: 'turn-back',
+            label: 'Turn back at the end',
+            line: 'The route is run backwards from the end',
+            emoji: '↩️',
+          },
+        ],
+        picked: 'finish',
+      },
+      kind: {
+        label: 'What the train is mainly for',
+        options: [
+          {
+            value: 'raid',
+            label: 'Raids',
+            line: 'Members choose their groups themselves',
+            emoji: '⚔️',
+          },
+          {
+            value: 'dynamax',
+            label: 'Dynamax Battles',
+            line: 'Lobbies form on the spot: the groups have no size',
+            emoji: '🔴',
+          },
+          {
+            value: 'gigantamax',
+            label: 'Gigantamax Battles',
+            line: 'Join fills the groups up to a Gigantamax lobby',
+            emoji: '🌋',
+          },
+        ],
+        picked: 'raid',
+      },
+      shown: { from: '4', first: '4', atEnd: 'finish', kind: 'raid' },
+    });
+  });
+
+  it('applies what was picked otherwise than shown as one change, in the words of the dialog', async () => {
+    const map = await managing();
+    web = map.web;
+    const { json: manage } = await map.open();
+    const done = await map.submit({
+      shown: manage.shown,
+      picked: { kind: 'dynamax', route: 'reverse', atEnd: 'loop' },
+    });
+    expect(done.status).toBe(200);
+    expect(done.json).toMatchObject({
+      ok: true,
+      text:
+        'This train is a Max Battle Train now. The route is reversed. At the end it loops back ' +
+        'to the first stop. The train is at stop 3 of 3: Veterans Memorial Bridge. Next goes ' +
+        'round to Harbor Lighthouse Mural.',
+      train: { route: ['7', '1', '4'], trainKind: 'dynamax' },
+    });
+    expect(map.made.current().train).toMatchObject({
+      route: stops(7, 1, 4),
+      atEnd: 'loop',
+      kind: 'dynamax',
+    });
+    // One line in the post for all three.
+    expect((await map.lines()).at(-1)).toMatch(
+      /made this a Max Battle Train\. The route was reversed by .+ set the train to loop\.$/,
+    );
+    // A form whose picks are what it showed changes nothing.
+    const { json: again } = await map.open();
+    const nothing = await map.submit({
+      shown: again.shown,
+      picked: { kind: 'dynamax', route: 'keep', atEnd: 'loop' },
+    });
+    expect(nothing.json).toMatchObject({ ok: true, text: 'Nothing changed.' });
+  });
+
+  it('finishes the route here, announced as a move, and refuses a route change from a form drawn where the train no longer is', async () => {
+    const map = await managing();
+    web = map.web;
+    const { json: early } = await map.open();
+    await map.made.trains.move(map.made.party.id, { id: BOB }, 'next', true);
+    const late = await map.submit({
+      shown: early.shown,
+      picked: { kind: 'dynamax', route: 'finish', atEnd: 'finish' },
+    });
+    expect(late.status).toBe(409);
+    expect(late.json.text).toBe(
+      'The train has moved on since you opened this: The train is at stop 2 of 3: The Stacks. ' +
+        'Next is Harbor Lighthouse Mural. Nothing was changed.',
+    );
+    expect(late.json.train).toMatchObject({ stop: 1 });
+    expect(map.made.current().train).toMatchObject({ stop: 1, kind: 'raid' });
+    const { json: fresh } = await map.open();
+    const finished = await map.submit({
+      shown: fresh.shown,
+      picked: { kind: 'raid', route: 'finish', atEnd: 'finish' },
+    });
+    expect(finished.json).toMatchObject({
+      ok: true,
+      text: 'The train has finished its route of 3 stops. Move… takes it back to stop 2: The Stacks.',
+    });
+    expect(await map.lines()).toContain(
+      `The train has finished its route. Moved by **Alice** (<@${ALICE}>).`,
+    );
+  });
+
+  it('asks a train without a route its kind alone', async () => {
+    const map = await managing({ route: [] });
+    web = map.web;
+    const { json: manage } = await map.open();
+    expect(manage).toMatchObject({
+      text: 'This train has no route yet. Add its stops with /route add.',
+      kind: { picked: 'raid' },
+      shown: { from: 'none', first: '-', atEnd: 'finish', kind: 'raid' },
+    });
+    expect(manage.route).toBeUndefined();
+    expect(manage.atEnd).toBeUndefined();
+    const set = await map.submit({ shown: manage.shown, picked: { kind: 'gigantamax' } });
+    expect(set.json).toMatchObject({ ok: true, text: 'This train is a Gigantamax Train now.' });
+    expect(map.made.current().train.kind).toBe('gigantamax');
+  });
+
+  it('opens for who may move the train and staff, refused before it opens in the words of the dialog, uncounted', async () => {
+    const throttles = new Throttles();
+    const map = await managing({ throttles });
+    web = map.web;
+    const bob = await map.open(BOB, 'Bob');
+    expect(bob).toMatchObject({
+      status: 422,
+      json: { error: 'You are not signed up for this train.' },
+    });
+    const { json: manage } = await map.open();
+    const refused = await map.submit(
+      { shown: manage.shown, picked: { kind: 'gigantamax', route: 'keep', atEnd: 'finish' } },
+      BOB,
+      'Bob',
+    );
+    expect(refused).toMatchObject({
+      status: 403,
+      json: { ok: false, text: 'You are not signed up for this train.' },
+    });
+    expect((await map.open(TEST_OWNER_ID, 'Owner')).status).toBe(200);
+    // Neither refusal was counted: Bob has used none of the post's controls.
+    expect(
+      throttles.use(controlThrottleKey(PARTY_KIND), BOB, { uses: 1, perSeconds: 60 }, PARTY_NOW),
+    ).toBeUndefined();
+  });
+
+  // Review C1: the page words no refusal of its own; the server sends the dialog's.
+  it("sends why Move… and Manage… do not open with the train in the list, in the dialog's words", async () => {
+    const map = await managing();
+    web = map.web;
+    const listed = async (userId: string, name: string) => {
+      const answer = await map.web.app.inject({
+        url: `/s/${FAKE_GUILD_ID}/api/parties`,
+        headers: { cookie: await map.web.loggedIn(userId, name) },
+      });
+      return answer.json<PartiesView>().trains[0]?.moveRefusal;
+    };
+    expect(await listed(BOB, 'Bob')).toEqual({
+      reason: 'not-attending',
+      text: 'You are not signed up for this train.',
+    });
+    await map.made.attendance.signUp(
+      map.made.party.id,
+      { id: BOB, name: 'Bob' },
+      PartyStatus.Coming,
+    );
+    await map.made.trains.setConductor(map.made.party.id, { id: ALICE, name: 'Alice' });
+    expect(await listed(BOB, 'Bob')).toEqual({
+      reason: 'not-conductor',
+      text: 'This train has a conductor: only they and the moderators can move it.',
+    });
+    expect(await listed(ALICE, 'Alice')).toBeNull();
+  });
+
+  it("counts the Submit in the window of the post's controls, and refuses the opening while it is full, uncounted", async () => {
+    const throttles = new Throttles();
+    const map = await managing({ throttles });
+    web = map.web;
+    const { json: manage } = await map.open();
+    for (let use = 0; use < ACTION_THROTTLE.uses; use += 1) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const opened = await map.open();
+    expect(opened.status).toBe(429);
+    expect(opened.json.error).toBe('That was a lot of clicks. Try again in 1 minute.');
+    const counted = await map.submit({
+      shown: manage.shown,
+      picked: { kind: 'gigantamax', route: 'keep', atEnd: 'finish' },
+    });
+    expect(counted.status).toBe(429);
+    expect(map.made.current().train.kind).toBe('raid');
+  });
+
+  it('answers a train that is over (409), refuses a member kept out of its forum (403), and knows only its bodies (400)', async () => {
+    const map = await managing();
+    web = map.web;
+    const { json: manage } = await map.open();
+    expect((await map.submit({ shown: manage.shown })).status).toBe(400);
+    expect(
+      (await map.submit({ shown: manage.shown, picked: { kind: 'max', route: 'keep' } })).status,
+    ).toBe(400);
+    expect(
+      (
+        await map.submit({
+          shown: { ...manage.shown, first: undefined },
+          picked: { kind: 'raid' },
+        })
+      ).status,
+    ).toBe(400);
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.open()).status).toBe(403);
+    expect((await map.submit({ shown: manage.shown, picked: { kind: 'dynamax' } })).status).toBe(
+      403,
+    );
+    await map.made.service.end(map.made.party.id);
+    expect((await map.open(TEST_OWNER_ID, 'Owner')).status).toBe(409);
+  });
+
+  it("retires the old panel's Finish, Reverse, mode and kind presses: Manage… does them (404)", async () => {
+    const map = await managing();
+    web = map.web;
+    const headers = await map.web.posting(ALICE, 'Alice');
+    const press = async (what: string, body: object) =>
+      (
+        await map.web.app.inject({
+          method: 'POST',
+          url: `/s/${FAKE_GUILD_ID}/api/trains/${map.made.party.id}/move/${what}`,
+          headers: { ...headers, 'content-type': 'application/json' },
+          payload: JSON.stringify(body),
+        })
+      ).statusCode;
+    expect(await press('finish', { from: '4' })).toBe(404);
+    expect(await press('reverse', { from: '4', first: '4' })).toBe(404);
+    expect(await press('at-end', { from: '4', atEnd: 'loop' })).toBe(404);
+    expect(await press('kind', { kind: 'dynamax' })).toBe(404);
+    expect(map.made.current().train).toMatchObject({ stop: 0, kind: 'raid', atEnd: 'finish' });
+  });
+});
diff --git a/src/web/train-move.test.ts b/src/web/train-move.test.ts
index 564a5aa4ada433a7184af48638744a5becbc0cfd..9017b4ab3aa486f575733c24e448319fc6888ecc 100644
--- a/src/web/train-move.test.ts
+++ b/src/web/train-move.test.ts
@@ -2,7 +2,7 @@ import { afterEach, describe, expect, it, vi } from 'vitest';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { testGyms, WEST_FORUM } from '../../test/support/gyms.js';
 import { FakeMemberDirectory } from '../../test/support/members.js';
-import { ALICE, BOB, PARTY_NOW, REPORTER, stops } from '../../test/support/parties.js';
+import { ALICE, BOB, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
 import { createdTrain } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import {
@@ -156,132 +156,19 @@ describe('moving a train on the map', () => {
     expect(map.made.current().train.stop).toBe(2);
   });
 
-  it('skips, goes back and finishes as the panel does', async () => {
+  it('skips and goes back as the panel does', async () => {
     const map = await moving();
     web = map.web;
     expect((await map.move('skip', { from: '4', target: '7' })).json.text).toBe(
       'The train is at stop 3 of 3: Harbor Lighthouse Mural. It is the last stop: Next finishes the route. I am telling the others.',
     );
-    expect((await map.move('previous', { from: '7', target: '1' })).json.ok).toBe(true);
-    const finished = await map.move('finish', { from: '1' });
-    expect(finished.json).toMatchObject({
+    expect((await map.move('previous', { from: '7', target: '1' })).json).toMatchObject({
       ok: true,
-      text:
-        'The train has finished its route of 3 stops. Previous takes it back to stop 2: ' +
-        'The Stacks. I am telling the others.',
-      train: { stop: null, panel: { place: 'end' } },
-    });
-  });
-
-  it('reverses the route and sets what the train does at its end, as the panel does', async () => {
-    const map = await moving();
-    web = map.web;
-    const reversed = await map.move('reverse', { from: '4', first: '4' });
-    expect(reversed.json).toMatchObject({
-      ok: true,
-      text:
-        'The route is reversed. The train is at stop 3 of 3: Veterans Memorial Bridge. ' +
-        'It is the last stop: Next finishes the route.',
-      train: { route: ['7', '1', '4'], stop: 2 },
-    });
-    // The same press again would flip it back: the route no longer begins where it did.
-    expect((await map.move('reverse', { from: '4', first: '4' })).status).toBe(409);
-    const looping = await map.move('at-end', { from: '4', atEnd: 'loop' });
-    expect(looping.json).toMatchObject({
-      ok: true,
-      text: 'At the end it loops back to the first stop.',
-      train: { panel: { atEnd: 'loop' } },
-    });
-    expect(map.made.current().train).toMatchObject({ route: stops(7, 1, 4), atEnd: 'loop' });
-  });
-
-  // Plan 8X-5: the panel's kind menu (8X-4), as the post's panel sets it.
-  it("sets the train's kind as the panel's menu does, for who may move it, in the window of the post's controls", async () => {
-    const throttles = new Throttles();
-    const map = await moving({ throttles });
-    web = map.web;
-    expect(await map.listed(ALICE, 'Alice')).toMatchObject({
-      trainKind: 'raid',
-      trainKindWords: 'Raid Train',
-      may: { kind: true },
-    });
-    const set = await map.move('kind', { kind: 'gigantamax' });
-    expect(set.status).toBe(200);
-    expect(set.json).toMatchObject({
-      ok: true,
-      text: 'This train is a Gigantamax Train now.',
-      train: { trainKind: 'gigantamax', trainKindWords: 'Gigantamax Train' },
-    });
-    expect(map.made.current().train.kind).toBe('gigantamax');
-    expect(await map.lines()).toContain(
-      '**Alice** (<@' + ALICE + '>) made this a Gigantamax Train.',
-    );
-    expect(throttles.size).toBe(1);
-    // Logged as a kind set, not as a move: who, where, which train, what.
-    expect(map.web.entries).toContainEqual(
-      expect.objectContaining({
-        msg: "a train's kind was set on the map",
-        user: ALICE,
-        party: map.made.party.id,
-        kind: 'gigantamax',
-        outcome: 'ok',
-      }),
-    );
-    const bob = await map.web.posting(BOB, 'Bob');
-    expect((await map.listed(BOB, 'Bob'))?.may.kind).toBe(false);
-    const refused = await map.move('kind', { kind: 'raid' }, bob);
-    expect(refused).toMatchObject({
-      status: 403,
-      json: {
-        ok: false,
-        text: 'You are not signed up for this train.',
-        train: { may: { kind: false } },
-      },
-    });
-    // Refused before the throttle: Bob has used none of the post's controls.
-    expect(
-      throttles.use(controlThrottleKey(PARTY_KIND), BOB, { uses: 1, perSeconds: 60 }, PARTY_NOW),
-    ).toBeUndefined();
-    expect((await map.move('kind', { kind: 'max' })).status).toBe(400);
-    expect((await map.move('kind', { kind: 'raid', from: '4' })).status).toBe(400);
-    expect(map.made.current().train.kind).toBe('gigantamax');
-  });
-
-  it('sets the kind of a train planned ahead, which has no route and so no panel yet', async () => {
-    const made = await createdTrain();
-    const { ctx } = createTestContext({
-      partyService: made.service,
-      attendance: made.attendance,
-      timedParties: made.timed,
-      trains: made.trains,
-      parties: made.store,
-      regions: made.regions,
-      users: made.users,
-    });
-    const members = new FakeMemberDirectory().add(REPORTER, 'Reporter');
-    const acting = new FakeActingMembers().add(REPORTER, 'Reporter');
-    web = webServerWith({
-      members,
-      parties: partyWebWith(made, { acting }),
-      trains: trainWebWith(ctx),
-    });
-    web.clock.now = PARTY_NOW;
-    const cookie = await web.loggedIn(REPORTER, 'Reporter');
-    const listed = (
-      await web.app.inject({ url: `/s/${FAKE_GUILD_ID}/api/parties`, headers: { cookie } })
-    ).json<PartiesView>().trains[0];
-    expect(listed).toMatchObject({ route: [], panel: null, may: { kind: true } });
-    const answer = await web.app.inject({
-      method: 'POST',
-      url: `/s/${FAKE_GUILD_ID}/api/trains/${made.party.id}/move/kind`,
-      headers: { ...(await web.posting(REPORTER, 'Reporter')), 'content-type': 'application/json' },
-      payload: JSON.stringify({ kind: 'dynamax' }),
+      train: { stop: 1, panel: { place: '1' } },
     });
-    expect(answer.statusCode).toBe(200);
-    expect(made.current().train.kind).toBe('dynamax');
   });
 
-  it("gives the panel to who may move the train: the moves from where it is with where each leads, Reverse, the mode; nobody else's", async () => {
+  it("gives the panel to who may move the train: the moves from where it is with where each leads; nobody else's", async () => {
     const map = await moving();
     web = map.web;
     expect((await map.listed(ALICE, 'Alice'))?.panel).toEqual({
@@ -289,10 +176,7 @@ describe('moving a train on the map', () => {
       moves: [
         { move: 'next', target: '1' },
         { move: 'skip', target: '7' },
-        { move: 'finish', target: 'end' },
       ],
-      reverse: '4',
-      atEnd: 'finish',
     });
     expect((await map.listed(BOB, 'Bob'))?.panel).toBeNull();
     await map.made.trains.setConductor(map.made.party.id, { id: REPORTER });
@@ -509,8 +393,9 @@ describe('moving a train on the map', () => {
     expect((await map.conductor('take', 'nobody')).status).toBe(400);
     expect((await map.post('conductor/take', {})).status).toBe(400);
     expect((await map.move('next', { from: '4' })).status).toBe(400);
-    expect((await map.move('at-end', { from: '4', atEnd: 'around' })).status).toBe(400);
-    expect((await map.move('finish', { from: '4', target: 'end', more: 1 })).status).toBe(400);
+    expect((await map.move('next', { from: '4', target: '1', more: 1 })).status).toBe(400);
+    // Finish is Manage…'s since plan 8M-8C.
+    expect((await map.move('finish', { from: '4' })).status).toBe(404);
     expect(map.made.current().train.stop).toBe(0);
   });
 
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index a6161de651c58c56d3062b8ad0621b25f02af6cd..f21fcb5436a54809bcdca858fda2ae8d2c13b247 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -12,22 +12,24 @@ import {
   clearRouteAs,
   forgetRouteAs,
   loadRouteAs,
+  manageRefusal,
+  manageTrainAs,
   moveStopAs,
   moveTrainAs,
   notSignedUpWords,
   removeStopAs,
-  reverseRouteAs,
   saveRouteAs,
-  setAtEndAs,
   setConductorAs,
-  setKindAs,
   startTrainAs,
+  trainPlaces,
   trainRefusal,
   type ConductorNamer,
   type TrainAnswer as TrainChangeAnswer,
-  type TrainChanging,
+  type TrainManaging,
   type TrainStarting,
 } from '../commands/trains/train-changes.js';
+import type { DialogChoice } from '../discord/dialog.js';
+import { manageForm, ROUTE_CHOICES } from '../render/train-dialogs.js';
 import { NO_START_TO_REMOVE, TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import { UserError } from '../discord/errors.js';
@@ -56,10 +58,11 @@ import { mapParty } from '../domain/web/party-view.js';
 import {
   CONDUCTOR_CHANGES,
   CONDUCTOR_SEEN,
-  KIND_PRESS,
   PANEL_PRESSES,
   ROUTE_EDITS,
   type ConductorChange,
+  type MapFormChoice,
+  type MapManage,
   type PanelPress,
   type RouteEdit,
   type SavedRoutesView,
@@ -85,6 +88,7 @@ import type { GuildRequest } from './guild-routes.js';
 import { pageWords } from './page-words.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
+import { refusalOnTheMap } from './train-views.js';
 
 /**
  * What the trains of the live map read and call (plan 8M-5): exactly what `/train`, `/route`,
@@ -93,7 +97,7 @@ import type { WebDeps } from './server.js';
  * paths.
  */
 export type TrainWebContext = TrainStarting &
-  TrainChanging &
+  TrainManaging &
   Pick<AppContext, 'config' | 'regions'>;
 
 /** What the trains of the live map need beyond the parties' own (`PartyWebDeps`). */
@@ -112,6 +116,12 @@ export const TRAIN_WRITES_PER_ADDRESS_MINUTE = 60;
 /** The requests for a member's saved routes one address may make in a minute. */
 const ROUTES_PER_MINUTE = 30;
 
+/**
+ * The openings of a train's forms that ask the server first (Manage…, Split…; plan 8M-8C) one
+ * address may make in a minute, whoever makes them; their Submits are writes of trains.
+ */
+export const TRAIN_FORMS_PER_ADDRESS_MINUTE = 30;
+
 /**
  * The body of a new train: the region (by id, as `/api/geo` lists it), the name as `/train` takes
  * it (up to its option's length; a blank one is refused in its words), the start as `/meet` takes
@@ -277,6 +287,8 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       ...(parties.maxLook === undefined ? {} : { maxLook: parties.maxLook }),
       ...(parties.spotOf === undefined ? {} : { spotOf: parties.spotOf }),
       pictureOrigins: deps.pictureOrigins,
+      // Why Move… and Manage… do not open, in Discord's words (review C1).
+      trainRefusal: (reason) => refusalOnTheMap(parties, reason, words),
     });
     return shown?.kind === 'train' ? shown : undefined;
   };
@@ -612,19 +624,17 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     }
   };
 
-  // A press of the Manage train panel on the map (spec 3.7), as the post's panel made it before plan 8X-G: before
-  // the body is read, the per-address limit, the guard of every POST and a press the panel has
-  // (404 otherwise; its kind menu, `KIND_PRESS`, plan 8X-5). Then the session (403) and the body
+  // A move on the map (spec 3.7): before the body is read, the per-address limit, the guard of
+  // every POST and a move the map makes (404 otherwise: the old panel's `finish`, `reverse`,
+  // `at-end` and `kind` are Manage…'s since plan 8M-8C, R1). Then the session (403) and the body
   // (400), the checks of every write to a train (`trainWrite`), whether the member may
-  // (`mayNotMove`, the kind too; for the mode, `mayNotArrange`, as `setAtEnd` decides: 403 in the
-  // command's words), and only then the window of the post's controls (`ACTION_THROTTLE`), as a
-  // press of the panel counts; then the service with where the panel was drawn (`from`) and where
-  // the press leads (`target`, `first`): a press that no longer fits the train is refused (409,
-  // the train as it is now). The movement is announced in the post as for any move, with its
-  // ping; a kind set, as the panel's menu says it.
+  // (`mayNotMove`: 403 in the command's words), and only then the window of the post's controls
+  // (`ACTION_THROTTLE`), as a press of the panel counts; then the service with where the panel was
+  // drawn (`from`) and where the press leads (`target`): a press that no longer fits the train is
+  // refused (409, the train as it is now). The movement is announced in the post as for any
+  // move, with its ping.
   const knownPress = async (request: TrainRequest, reply: FastifyReply) => {
-    const press = request.params.action ?? '';
-    if (!isPanelPress(press) && press !== KIND_PRESS) return sendFailure(request, reply, 404);
+    if (!isPanelPress(request.params.action ?? '')) return sendFailure(request, reply, 404);
   };
   scope.post(
     '/api/trains/:party/move/:action',
@@ -632,22 +642,17 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     async (request: TrainRequest, reply) => {
       void reply.header('cache-control', 'no-store');
       const press = request.params.action ?? '';
-      if (!isPanelPress(press) && press !== KIND_PRESS) return sendFailure(request, reply, 404);
+      if (!isPanelPress(press)) return sendFailure(request, reply, 404);
       const session = await sessions.of(request, reply);
       if (!session) return sendFailure(request, reply, 403);
-      const input = isPanelPress(press)
-        ? pressInput(press, request.body ?? {})
-        : kindInput(request.body ?? {});
-      if (!input) return sendFailure(request, reply, 400);
+      const body = PRESS_BODY.safeParse(request.body ?? {});
+      if (!body.success) return sendFailure(request, reply, 400);
       const writing = await trainWrite(request, reply, session.userId, 'moved a train');
       if ('sent' in writing) return writing.sent;
       const { userId, member, standing, row, party } = writing;
       const { guild } = request.params;
       const staff = isMapStaff(standing, userId, parties.ownerId);
-      const forbidden =
-        input.press === 'at-end'
-          ? mayNotArrange(party, userId, staff)
-          : mayNotMove(party, userId, staff);
+      const forbidden = mayNotMove(party, userId, staff);
       if (forbidden) {
         const train = viewOf(guild, row, party, userId, standing);
         return refuse(reply, 403, trainRefusal(ctx, forbidden), train);
@@ -655,40 +660,101 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const counted = { control: PARTY_KIND };
       const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
       if (throttled) return throttled;
-      const answer = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () => {
-        switch (input.press) {
-          case 'reverse':
-            return reverseRouteAs(ctx, party, member, staff, input.from, input.first);
-          case 'at-end':
-            return setAtEndAs(ctx, party, member, staff, input.atEnd, input.from);
-          case 'kind':
-            return setKindAs(ctx, party, member, staff, input.kind);
-          case 'finish':
-            return moveTrainAs(ctx, party, member, 'finish', staff, 'map', input.from);
-          default:
-            return moveTrainAs(
-              ctx,
-              party,
-              member,
-              input.press,
-              staff,
-              'map',
-              input.from,
-              input.target,
-            );
-        }
-      });
-      if (input.press === 'kind') {
-        deps.log.info(
-          { user: userId, guild, party: party.id, kind: input.kind, outcome: answer.kind },
-          "a train's kind was set on the map",
-        );
-      } else {
-        deps.log.info(
-          { user: userId, guild, party: party.id, move: press, outcome: answer.kind },
-          'a train was moved on the map',
-        );
+      const answer = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
+        moveTrainAs(ctx, party, member, press, staff, 'map', body.data.from, body.data.target),
+      );
+      deps.log.info(
+        { user: userId, guild, party: party.id, move: press, outcome: answer.kind },
+        'a train was moved on the map',
+      );
+      return answered(reply, guild, row, party.id, userId, standing, answer);
+    },
+  );
+
+  /**
+   * What every form of a train that asks the server before it opens checks (plan 8M-8C, as
+   * Discord checks before its dialog): who opens it (`actingOnTheMap`, as a write: whether they
+   * are staff is asked of the member fetched fresh), the train (`trainWrite`'s), and that the
+   * window of the post's controls has a use left (429 in the router's words), counting nothing.
+   */
+  const opening = async (
+    request: TrainRequest,
+    reply: FastifyReply,
+    doing: string,
+  ): Promise<
+    | { sent: FastifyReply }
+    | { userId: string; standing: MemberStanding; staff: boolean; party: TrainParty }
+  > => {
+    void reply.header('cache-control', 'private, no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return { sent: sendFailure(request, reply, 401) };
+    const writing = await trainWrite(request, reply, session.userId, doing);
+    if ('sent' in writing) return writing;
+    const { userId, standing, party } = writing;
+    const full = throttledOnTheMap(deps, reply, { control: PARTY_KIND }, userId, ACTION_THROTTLE, {
+      count: false,
+    });
+    if (full) return { sent: full };
+    return { userId, standing, staff: isMapStaff(standing, userId, parties.ownerId), party };
+  };
+
+  const formLimiter = new RateLimiter({ uses: TRAIN_FORMS_PER_ADDRESS_MINUTE, perMs: 60_000 });
+
+  // Manage… on the map (plan 8M-8C): the form opens with what the post's dialog shows now
+  // (`manageForm`), for who may move the train and staff, refused before it opens as the dialog is
+  // (`manageRefusal`, 422 in its words) and while the window of the post's controls is full,
+  // counting nothing (`opening`). Its Submit sends back what it showed with what is picked, and
+  // goes the dialog's way (`manageTrainAs`): one use in the window of the post's controls.
+  scope.get(
+    '/api/trains/:party/manage',
+    { onRequest: limitedPerAddress(formLimiter, { now: deps.now }) },
+    async (request: TrainRequest, reply) => {
+      const opened = await opening(request, reply, 'opened Manage…');
+      if ('sent' in opened) return opened.sent;
+      const { userId, staff, party } = opened;
+      const refused = manageRefusal(ctx, party, userId, staff);
+      if (refused !== undefined) return reply.code(422).send({ error: words(refused) });
+      const form = manageForm(trainPlaces(ctx, party));
+      const view: MapManage = {
+        title: form.title,
+        text: words(form.text),
+        ...(form.route === undefined ? {} : { route: formChoice(form.route) }),
+        ...(form.atEnd === undefined ? {} : { atEnd: formChoice(form.atEnd) }),
+        kind: formChoice(form.kind),
+        shown: form.shown,
+      };
+      return view;
+    },
+  );
+  scope.post(
+    '/api/trains/:party/manage',
+    { onRequest: writeGuards },
+    async (request: TrainRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const body = MANAGE_BODY.safeParse(request.body ?? {});
+      if (!body.success) return sendFailure(request, reply, 400);
+      const writing = await trainWrite(request, reply, session.userId, 'managed a train');
+      if ('sent' in writing) return writing.sent;
+      const { userId, member, standing, row, party } = writing;
+      const { guild } = request.params;
+      const staff = isMapStaff(standing, userId, parties.ownerId);
+      const refused = manageRefusal(ctx, party, userId, staff);
+      if (refused !== undefined) {
+        return refuse(reply, 403, refused, viewOf(guild, row, party, userId, standing));
       }
+      const counted = { control: PARTY_KIND };
+      const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
+      if (throttled) return throttled;
+      const { shown, picked } = body.data;
+      const answer = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
+        manageTrainAs(ctx, party, member, staff, shown, picked, 'post'),
+      );
+      deps.log.info(
+        { user: userId, guild, party: party.id, outcome: answer.kind },
+        'a train was managed on the map',
+      );
       return answered(reply, guild, row, party.id, userId, standing, answer);
     },
   );
@@ -777,56 +843,49 @@ const CONDUCTOR_BEFORE: ConductorNamer = () => 'the conductor before';
 /** Where the train was when the panel was drawn (`placeOf`), and where a press leads. */
 const place = z.string().min(1).max(20);
 
-/** The body of each press of the panel, as its control carries it: anything else is malformed. */
-const PRESS_BODIES = {
-  move: z.object({ from: place, target: place }).strict(),
-  finish: z.object({ from: place }).strict(),
-  reverse: z.object({ from: place, first: place }).strict(),
-  atEnd: z.object({ from: place, atEnd: z.enum(TRAIN_AT_END) }).strict(),
-  // The kind menu (plan 8X-5): as the post's menu, nothing of where the train is.
-  kind: z.object({ kind: z.enum(TRAIN_KINDS) }).strict(),
-} as const;
+/** The body of a move, as its button carries it: anything else is malformed. */
+const PRESS_BODY = z.object({ from: place, target: place }).strict();
 
-/** A conductor's change carries whose the role was when the page drew its button. */
-const conductorBodySchema = z.object({ who: z.enum(CONDUCTOR_SEEN) }).strict();
+/**
+ * The body of Manage…'s Submit (plan 8M-8C): what the form showed, as the dialog's custom id
+ * carries it, and what is picked; anything else is malformed.
+ */
+const MANAGE_BODY = z
+  .object({
+    shown: z
+      .object({
+        from: place,
+        first: place,
+        atEnd: z.enum(TRAIN_AT_END),
+        kind: z.enum(TRAIN_KINDS),
+      })
+      .strict(),
+    picked: z
+      .object({
+        kind: z.enum(TRAIN_KINDS),
+        route: z.enum(ROUTE_CHOICES).optional(),
+        atEnd: z.enum(TRAIN_AT_END).optional(),
+      })
+      .strict(),
+  })
+  .strict();
 
-/** A press of the panel with what it carries. */
-type PressInput =
-  | ({ press: 'next' | 'previous' | 'skip' } & z.infer<typeof PRESS_BODIES.move>)
-  | ({ press: 'finish' } & z.infer<typeof PRESS_BODIES.finish>)
-  | ({ press: 'reverse' } & z.infer<typeof PRESS_BODIES.reverse>)
-  | ({ press: 'at-end' } & z.infer<typeof PRESS_BODIES.atEnd>)
-  | ({ press: 'kind' } & z.infer<typeof PRESS_BODIES.kind>);
-
-/** The press a body is; undefined for a malformed body. */
-function pressInput(press: PanelPress, body: unknown): PressInput | undefined {
-  switch (press) {
-    case 'next':
-    case 'previous':
-    case 'skip': {
-      const parsed = PRESS_BODIES.move.safeParse(body);
-      return parsed.success ? { press, ...parsed.data } : undefined;
-    }
-    case 'finish': {
-      const parsed = PRESS_BODIES.finish.safeParse(body);
-      return parsed.success ? { press, ...parsed.data } : undefined;
-    }
-    case 'reverse': {
-      const parsed = PRESS_BODIES.reverse.safeParse(body);
-      return parsed.success ? { press, ...parsed.data } : undefined;
-    }
-    case 'at-end': {
-      const parsed = PRESS_BODIES.atEnd.safeParse(body);
-      return parsed.success ? { press, ...parsed.data } : undefined;
-    }
-  }
+/** A choice of a dialog as the map's form shows it: its options' descriptions as their lines. */
+function formChoice(choice: DialogChoice): MapFormChoice {
+  return {
+    label: choice.label,
+    options: choice.options.map((option) => ({
+      value: option.value,
+      label: option.label,
+      ...(option.description === undefined ? {} : { line: option.description }),
+      ...(option.emoji === undefined ? {} : { emoji: option.emoji }),
+    })),
+    ...(choice.picked === undefined ? {} : { picked: choice.picked }),
+  };
 }
 
-/** The kind menu's press (`KIND_PRESS`); undefined for a malformed body. */
-function kindInput(body: unknown): PressInput | undefined {
-  const parsed = PRESS_BODIES.kind.safeParse(body);
-  return parsed.success ? { press: 'kind', ...parsed.data } : undefined;
-}
+/** A conductor's change carries whose the role was when the page drew its button. */
+const conductorBodySchema = z.object({ who: z.enum(CONDUCTOR_SEEN) }).strict();
 
 function isPanelPress(value: string): value is PanelPress {
   return (PANEL_PRESSES as readonly string[]).includes(value);
diff --git a/src/web/train-views.ts b/src/web/train-views.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c7e244129d91a234615380582c69b2957ef852d4
--- /dev/null
+++ b/src/web/train-views.ts
@@ -0,0 +1,23 @@
+import type { AppContext } from '../app-context.js';
+import { trainRefusal } from '../commands/trains/train-changes.js';
+import type { MapMoveRefusal } from '../domain/web/party-data.js';
+import { UNREACHABLE } from './acting.js';
+
+/*
+ * A train's post's dialogs as the live map shows them (plan 8M-8C): made by the dialogs' own
+ * builders and words, only put into the map's data here, their markdown made text of the page by
+ * the caller's `words` (`pageWords`).
+ */
+
+/**
+ * Why a member may not move a train on the map, in the words Discord says before Move… and
+ * Manage… open (`manageRefusal`: `trainRefusal` of `mayNotMove`'s reason; review C1), also for a
+ * train without a route (`no-route`); while read-only what a write answers then (`UNREACHABLE`).
+ */
+export function refusalOnTheMap(
+  ctx: { attendance: Pick<AppContext['attendance'], 'limits'> },
+  reason: MapMoveRefusal,
+  words: (text: string) => string,
+): string {
+  return words(reason === 'read-only' ? UNREACHABLE : trainRefusal(ctx, reason));
+}
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index c860b41af9cdfd79d2fc27ddaab538d5d9aedcb9..11f1b324652384b2bc6bacb3bb04d29fe2c1277d 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -1,5 +1,5 @@
 import { MemoryTargetWants } from './target-wants.js';
-import { gymStop, stopKey, type StopRef } from '../../src/domain/party/stops.js';
+import { gymStop, stopHandle, stopKey, type StopRef } from '../../src/domain/party/stops.js';
 import { loadSettings } from '../../src/config/settings.js';
 import type {
   AccessGrant,
@@ -19,13 +19,14 @@ import { AccessService } from '../../src/services/access-service.js';
 import { BossTierMoves } from '../../src/services/boss-tier-moves.js';
 import { PartyLines } from '../../src/services/party-lines.js';
 import { PartyScheduler } from '../../src/services/party-scheduler.js';
-import { AttendanceService } from '../../src/services/attendance-service.js';
+import { AttendanceService, type Member } from '../../src/services/attendance-service.js';
 import {
   isRaid,
   type MaxParty,
   type MeetupParty,
   type Party,
   type RaidParty,
+  type TrainAtEnd,
   type TrainParty,
 } from '../../src/domain/party/party.js';
 import { FORUM_TAGS } from '../../src/render/party-post.js';
@@ -71,7 +72,9 @@ import { PartyStore } from '../../src/services/party-store.js';
 import { MaxChangeService } from '../../src/services/max-change-service.js';
 import { RaidChangeService } from '../../src/services/raid-change-service.js';
 import { TimedPartyService } from '../../src/services/timed-party-service.js';
-import { TrainService } from '../../src/services/train-service.js';
+import { TrainService, type TrainManage } from '../../src/services/train-service.js';
+import { placeOf } from '../../src/domain/party/train.js';
+import { NO_FIRST } from '../../src/render/train-dialogs.js';
 import type { EventSpawnProvider } from '../../src/services/event-spawn-service.js';
 
 /** The invented regions as a directory whose rows a test can change; `load` does nothing. */
@@ -732,5 +735,30 @@ export async function createdTrain(
   /** The texts of the messages in the post that were not deleted, oldest first. */
   const said = (): string[] =>
     made.gateway.messagesIn(postId).map((message) => message.message.content ?? '');
-  return { ...made, party: outcome.party, postId, current, said };
+  /**
+   * Manage… as it sets the mode or reverses the route (`TrainService.manage`, the only way since
+   * plan 8M-8C, review C5): drawn where the train is now and from the stop its route begins with
+   * now, unless `from` and `first` say where a dialog was drawn.
+   */
+  const managed = (
+    member: Member,
+    staff: boolean,
+    asked: TrainManage,
+    from?: string,
+    first?: string,
+  ) => {
+    const party = current();
+    const start = party.train.route[0];
+    return made.trains.manage(party.id, member, staff, asked, {
+      from: from ?? placeOf(party),
+      first: first ?? (start === undefined ? NO_FIRST : stopHandle(start)),
+    });
+  };
+  /** The mode at the end of the route set through Manage…. */
+  const setAtEnd = (member: Member, staff: boolean, atEnd: TrainAtEnd) =>
+    managed(member, staff, { atEnd });
+  /** The route reversed through Manage…. */
+  const reverse = (member: Member, staff: boolean, from?: string, first?: string) =>
+    managed(member, staff, { route: 'reverse' }, from, first);
+  return { ...made, party: outcome.party, postId, current, said, setAtEnd, reverse };
 }
````

### Task 3: 8M-8C task 3: Move... on the map as the post's dialog

Prototype commit: `1c434753133fff3d32f5587e56ccc26c66ba0c05`

The list gives a train's Move... as the post's dialog draws it
(moveForm over offeredMoves and trainStateText, one builder for the
dialog and the map): where the train is, the moves from there with
their labels and lines (the undo of a turn-back route), Next first and
picked, and with one move left what Submit does. MapTrain.moves takes
the place of the old panel. The move's answer is the dialog's: Move...
named for what takes a finished route back (the surface 'map' and its
Previous are gone), a move drawn elsewhere refused with where the train
is now (movedOnWords).

On the page Move... opens as a form in the place of the post, as the
other post forms (a pick's address move/<move>), closes after its
Submit and asks for the list; the old Move panel of train-ui.ts is gone.


# Conflicts:
#	src/domain/web/party-view.ts
#	src/web/party-routes.ts
#	src/web/train-routes.ts
#	src/web/train-views.ts

**Files:**

```
 src/app.ts                               |  2 ++
 src/commands/trains/train-changes.ts     |  2 +-
 src/domain/web/party-data.ts             | 28 ++++++++++++++++++----------
 src/domain/web/party-view.test.ts        | 54 ++++++++++++++++++++++++------------------------------
 src/domain/web/party-view.ts             | 38 +++++++++++++-------------------------
 src/render/train-dialogs.ts              | 54 +++++++++++++++++++++++++++++++++++++++++-------------
 src/render/train-post.test.ts            |  6 +-----
 src/render/train-words.ts                | 17 ++++++++---------
 src/web/client/map.css                   |  3 +--
 src/web/client/parties.test.ts           |  2 +-
 src/web/client/party-layer.ts            | 11 +++++++----
 src/web/client/post-draw.test.ts         | 10 ++++++++--
 src/web/client/post-draw.ts              |  3 ++-
 src/web/client/post-forms-ui.ts          | 23 ++++++++++++++++++++---
 src/web/client/post-forms.ts             |  7 +++++--
 src/web/client/raid-forms.ts             |  2 +-
 src/web/client/train-forms.test.ts       | 47 +++++++----------------------------------------
 src/web/client/train-forms.ts            | 74 ++++++++------------------------------------------------------------------
 src/web/client/train-post-forms.test.ts  | 65 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/train-post-forms.ts       | 36 ++++++++++++++++++++++++++++++++++++
 src/web/client/train-ui.isolated.test.ts | 84 ++++++------------------------------------------------------------------------------
 src/web/client/train-ui.ts               | 83 ++++-------------------------------------------------------------------------------
 src/web/client/what-is-on.test.ts        |  2 +-
 src/web/party-routes.ts                  | 11 ++++++++++-
 src/web/train-move.test.ts               | 81 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----------------
 src/web/train-routes.ts                  | 31 ++++++++++++-------------------
 src/web/train-views.ts                   | 46 +++++++++++++++++++++++++++++++++++++++++++---
 test/support/web.ts                      |  4 ++++
 28 files changed, 412 insertions(+), 414 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/render/train-post.test.ts src/web/client/parties.test.ts src/web/client/post-draw.test.ts src/web/client/train-forms.test.ts src/web/client/train-post-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/client/what-is-on.test.ts src/web/train-move.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1c434753133fff3d32f5587e56ccc26c66ba0c05 -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8C task 3: Move... on the map as the post's dialog`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index c960a6b0c220c29db83379361f45ddec92923be3..faa30e4d43cf04869ed841dc5c7a2d56fee810a5 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1271,6 +1271,8 @@ export async function startApp(
         guilds,
         store: parties,
         look: (raid) => raidLook(partyService.view(raid)),
+        // The stops of trains' routes as they are now: a train's Move… names them (plan 8M-8C).
+        stops: partyService.stops,
         // How a max battle's post shows it (plan 8X-5): its boss, picture and spot as they are now.
         maxLook: (party) => maxLook(partyService.maxView(party)),
         // The layout each post was last shown with, the popup's (plan 8M-8A), and posts' titles.
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index d961f7301f3b156b511fdfc494133bb492557640..55a5e7eba86a2f83d27a7f780e7a4c099f299cdf 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -393,7 +393,7 @@ export async function forgetRouteAs(
  * Moves the train along its route (`/next`, `/previous`, `/skip`, `/finish`, the map) and says
  * where it is now. `surface` is where the member moved it (a command, Move… of the post, the
  * map), so that a finished route names what takes it back there; `from` and `target` are for a
- * control drawn at a place (Move…, the map's panel).
+ * control drawn at a place (Move…, on Discord and on the map).
  */
 export async function moveTrainAs(
   ctx: TrainChanging,
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index d4e97538eab0f5d15430e8f428c873644b5b6b8d..b3f2a7a3a082f635be148a2d737b0753452e2e23 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -297,11 +297,11 @@ export interface MapTrain {
    */
   may: MapTrainRights;
   /**
-   * The moves the member may make on the map now (plan 8M-5; Finish is Manage…'s since plan
-   * 8M-8C): null for who may not move the train (`mayNotMove`), for a train without a route, and
+   * Move… as the post's dialog draws it now (plan 8M-8C, R1: `moveForm`, Discord's own words and
+   * moves): null for who may not move the train (`mayNotMove`), for a train without a route, and
    * while read-only.
    */
-  panel: MapTrainPanel | null;
+  moves: MapMoves | null;
   /** Who leads the train, as the member sees it (nobody is named), and what they may do of it. */
   conductor: MapConductor;
   /**
@@ -346,18 +346,26 @@ export interface MapTrainRights {
 /** What a train does at the last stop of its route, as `/train`'s option `at-end` takes it. */
 export type MapAtEnd = 'finish' | 'loop' | 'turn-back';
 
-/** The moves of a train along its route on the map (Finish is Manage…'s, plan 8M-8C). */
+/** The moves of Move… (Finish is Manage…'s). */
 export type MapMove = 'next' | 'previous' | 'skip';
 
 /**
- * The moves of a train on the map: where the train is (`placeOf`: the handle of its stop, a gym's
- * id or a power spot's short hash, plan 8X-4; or `end` once the route is finished), which every
- * press carries as `from`; the moves that can be made from there, each with where it leads
- * (`targetOf`: a stop's handle, or `end`), which they carry as `target`.
+ * Move… of a train on the map (plan 8M-8C, R1), as the post's dialog draws it (`moveForm` of
+ * `src/render/train-dialogs.ts`): where the train is (`placeOf`: the handle of its stop, a gym's
+ * id or a power spot's short hash, plan 8X-4; or `end` once the route is finished), which a move
+ * carries as `from`; the dialog's text as text of the page (where the train is and what Next does;
+ * with one move left what Submit does); the moves it offers in its order (`offeredMoves`: Next
+ * first, a move that cannot be made left out, Previous as the undo at the end of a turn-back
+ * route), each with where it leads (`targetOf`, carried as `target`), its label and the line under
+ * it (the choice's description). With one move there is no choice: the text says what Submit does.
  */
-export interface MapTrainPanel {
+export interface MapMoves {
+  title: string;
   place: string;
-  moves: Array<{ move: MapMove; target: string }>;
+  text: string;
+  /** The label of the choice: `Where to`. */
+  label: string;
+  moves: Array<{ move: MapMove; target: string; label: string; line?: string }>;
 }
 
 /**
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 33e8d68f30d174bc64bfd20f78853ab6129c1758..7c18ae4ef570723fa5b41f1b932f6cde74750180 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -1,4 +1,3 @@
-import { gymStop } from '../party/stops.js';
 import { describe, expect, it } from 'vitest';
 import { EAST_FORUM, WEST_FORUM } from '../../../test/support/gyms.js';
 import {
@@ -27,8 +26,9 @@ import {
   partyView,
   conductorOf,
   moveRefusalOf,
-  trainPanelOf,
+  trainMovesOf,
   trainRights,
+  type MapMoves,
   type PartyViewInput,
 } from './party-view.js';
 
@@ -423,7 +423,7 @@ describe('partyView', () => {
         mayReport: true,
         // The member is not signed up: nothing of the route, nor its kind, is theirs to change.
         may: { arrange: false, clear: false, load: false },
-        panel: null,
+        moves: null,
         conductor: { who: null, mayTake: false, mayDrop: false },
         moveRefusal: { reason: 'not-attending', text: '' },
       },
@@ -647,47 +647,41 @@ describe('trainRights', () => {
     // opens for who may move it, the reason being only that it has no route.
     const planned = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Coming } });
     expect(moveRefusalOf(planned, input([]))).toBe('no-route');
-    expect(trainPanelOf(planned, input([]))).toBeNull();
+    expect(trainMovesOf(planned, input([]))).toBeNull();
   });
 });
 
-describe('trainPanelOf and conductorOf', () => {
+describe('trainMovesOf and conductorOf', () => {
   /** A train of three stops at this one, Alice signed up as coming. */
   const stoppedAt = (stop: number, more: Partial<TrainParty['train']> = {}): TrainParty => {
     const train = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Coming } });
     return { ...train, train: { ...train.train, route: stops(4, 1, 7), stop, ...more } };
   };
-
-  it("gives the moves that can be made from where the train is, each with where it leads; Finish and Reverse are Manage…'s", () => {
-    expect(trainPanelOf(stoppedAt(1), input([]))).toEqual({
-      place: '1',
-      moves: [
-        { move: 'next', target: '7' },
-        { move: 'previous', target: '4' },
-      ],
-    });
-    // Finished from its last stop: Previous takes it back.
-    expect(trainPanelOf(stoppedAt(3, { finishedFrom: gymStop(7) }), input([]))).toEqual({
-      place: 'end',
-      moves: [{ move: 'previous', target: '7' }],
-    });
-    expect(trainPanelOf(stoppedAt(2, { atEnd: 'loop' }), input([]))?.moves).toEqual([
-      { move: 'next', target: '4' },
-      { move: 'previous', target: '1' },
-      { move: 'skip', target: '1' },
-    ]);
+  /** Move… as the caller draws it (the post's dialog's builder, `movesOnTheMap`). */
+  const drawn = (party: TrainParty): MapMoves => ({
+    title: 'Move the train',
+    place: String(party.train.stop),
+    text: 'the dialog',
+    label: 'Where to',
+    moves: [{ move: 'next', target: 'x', label: 'Next: X' }],
   });
+  const asking = (more: Partial<PartyViewInput> = {}) => input([], { trainMoves: drawn, ...more });
 
-  it('gives no panel to who may not move the train, for a train without a route, or while read-only', () => {
-    expect(trainPanelOf(stoppedAt(0), input([], { memberId: BOB }))).toBeNull();
-    expect(trainPanelOf(stoppedAt(0, { conductorId: REPORTER }), input([]))).toBeNull();
-    expect(trainPanelOf(stoppedAt(0, { route: [] }), input([]))).toBeNull();
-    expect(trainPanelOf(stoppedAt(0), input([], { readOnly: true }))).toBeNull();
+  it("gives who may move the train Move… as the caller draws it (the post's dialog's builder)", () => {
+    expect(trainMovesOf(stoppedAt(1), asking())).toEqual(drawn(stoppedAt(1)));
     expect(
-      trainPanelOf(stoppedAt(0, { conductorId: REPORTER }), input([], { staff: true })),
+      trainMovesOf(stoppedAt(0, { conductorId: REPORTER }), asking({ staff: true })),
     ).not.toBeNull();
+    // Without a caller's drawing, none.
+    expect(trainMovesOf(stoppedAt(1), input([]))).toBeNull();
   });
 
+  it('gives no Move… to who may not move the train, for a train without a route, or while read-only', () => {
+    expect(trainMovesOf(stoppedAt(0), asking({ memberId: BOB }))).toBeNull();
+    expect(trainMovesOf(stoppedAt(0, { conductorId: REPORTER }), asking())).toBeNull();
+    expect(trainMovesOf(stoppedAt(0, { route: [] }), asking())).toBeNull();
+    expect(trainMovesOf(stoppedAt(0), asking({ readOnly: true }))).toBeNull();
+  });
   it('says why the member may not move the train, as the commands decide it (review N1)', () => {
     expect(moveRefusalOf(stoppedAt(0), input([]))).toBeNull();
     expect(moveRefusalOf(stoppedAt(0), input([], { memberId: BOB }))).toBe('not-attending');
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index d55d94440307df7b0cde75f25105102ad9dc0492..34c13b164f93fd02ef9134f5e9e859dd12087593 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -21,16 +21,7 @@ import {
 import { raidStage } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
 import { timedOver } from '../party/timed.js';
-import {
-  cannotMove,
-  mayNotArrange,
-  mayNotClear,
-  mayNotLoad,
-  mayNotMove,
-  placeOf,
-  targetOf,
-  TRAIN_MOVES,
-} from '../party/train.js';
+import { mayNotArrange, mayNotClear, mayNotLoad, mayNotMove } from '../party/train.js';
 import { maxBossTitle, maxTierLabel } from '../pogo/max-tier.js';
 import { raidTierGroup, raidWords } from '../pogo/raid-tier.js';
 import type {
@@ -48,7 +39,7 @@ import type {
   MapConductor,
   MapMoveRefusal,
   MapTrain,
-  MapTrainPanel,
+  MapMoves,
   MapTrainRights,
   MapClose,
   MapRegroup,
@@ -162,6 +153,11 @@ export interface PartyViewInput {
    * words.
    */
   trainRefusal?: (reason: MapMoveRefusal) => string;
+  /**
+   * Move… of a train as the post's dialog draws it now (plan 8M-8C, `moveForm` in the map's
+   * words), asked only for who may move it. Left out: no Move… on the map.
+   */
+  trainMoves?: (party: TrainParty) => MapMoves;
 }
 
 /** Staff's Delete… of a party (plan 8M-8B): for staff alone, never while read-only. */
@@ -364,23 +360,15 @@ export function trainRights(party: TrainParty, input: PartyViewInput): MapTrainR
   };
 }
 
-/** The moves of the map (Finish is Manage…'s since plan 8M-8C). */
-const MAP_MOVES = TRAIN_MOVES.filter((move) => move !== 'finish');
-
 /**
- * The moves the member may make on the map (spec 3.7): none for who may not move the train, for
- * a train without a route, and while read-only. The moves are those `cannotMove` allows from where
- * the train is, each with where it leads.
+ * Move… as the member may use it on the map (plan 8M-8C): none for who may not move the train
+ * (`mayNotMove`), for a train without a route, and while read-only; else the post's dialog as
+ * the caller's `trainMoves` draws it (`moveForm`), none without it.
  */
-export function trainPanelOf(party: TrainParty, input: PartyViewInput): MapTrainPanel | null {
+export function trainMovesOf(party: TrainParty, input: PartyViewInput): MapMoves | null {
   if (input.readOnly || party.train.route.length === 0) return null;
   if (mayNotMove(party, input.memberId, input.staff) !== undefined) return null;
-  return {
-    place: placeOf(party),
-    moves: MAP_MOVES.flatMap((move) =>
-      cannotMove(party, move) === undefined ? [{ move, target: targetOf(party, move) }] : [],
-    ),
-  };
+  return input.trainMoves?.(party) ?? null;
 }
 
 /**
@@ -431,7 +419,7 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     attendance: attendanceOf(party, input, false),
     postKey: input.postKey?.(party) ?? null,
     may: trainRights(party, input),
-    panel: trainPanelOf(party, input),
+    moves: trainMovesOf(party, input),
     conductor: conductorOf(party, input),
     moveRefusal:
       refused === null ? null : { reason: refused, text: input.trainRefusal?.(refused) ?? '' },
diff --git a/src/render/train-dialogs.ts b/src/render/train-dialogs.ts
index 53a2df6e6edc2e7e87bc1bd4991c8d0b2dff05be..d2b5ab93243afaa82b38cfdf82bb6076b30ca75e 100644
--- a/src/render/train-dialogs.ts
+++ b/src/render/train-dialogs.ts
@@ -274,24 +274,22 @@ export function trainStateText(view: TrainPlaces): string {
  */
 export function moveDialog(view: TrainDialogView): APIModalInteractionResponseCallbackData {
   const { party } = view;
-  const moves = offeredMoves(view);
-  const place = placeOf(party);
+  const form = moveForm(view);
   const token = openToken(view.now);
-  const state = trainStateText(view);
-  const [only] = moves;
-  if (moves.length === 1 && only !== undefined) {
+  const [only] = form.moves;
+  if (form.moves.length === 1 && only !== undefined) {
     return dialog({
       customId: encodeCustomId({
         kind: PARTY_KIND,
         id: party.id,
         action: MOVE_FORM,
-        args: [place, only.move, only.target, token],
+        args: [form.place, only.move, only.target, token],
       }),
-      title: 'Move the train',
-      text: `${state}\n\n${only.sentence}`,
+      title: form.title,
+      text: form.text,
     });
   }
-  const options: DialogOption[] = moves.map((offered) => ({
+  const options: DialogOption[] = form.moves.map((offered) => ({
     value: `${offered.move}:${offered.target}`,
     label: offered.label,
     ...(offered.description === undefined ? {} : { description: offered.description }),
@@ -301,19 +299,49 @@ export function moveDialog(view: TrainDialogView): APIModalInteractionResponseCa
       kind: PARTY_KIND,
       id: party.id,
       action: MOVE_FORM,
-      args: [place, token],
+      args: [form.place, token],
     }),
-    title: 'Move the train',
-    text: state,
+    title: form.title,
+    text: form.text,
     choice: {
       id: MOVE_INPUT,
-      label: 'Where to',
+      label: form.label,
       options,
       ...(options[0] === undefined ? {} : { picked: options[0].value }),
     },
   });
 }
 
+/**
+ * What Move… says and offers (plan 8X-G), apart from Discord's dialog, so that one builder serves
+ * the dialog and the live map's form (plan 8M-8C): its title; its text (where the train is,
+ * `trainStateText`, and with one move left what Submit does); where the train is (`placeOf`),
+ * which a Submit carries; the label of its choice; the moves offered (`offeredMoves`), Next first
+ * and picked.
+ */
+export interface MoveForm {
+  title: string;
+  /** Discord's markdown: the map makes it text of the page. */
+  text: string;
+  place: string;
+  label: string;
+  moves: OfferedMove[];
+}
+
+/** Move… as `moveDialog` draws it (`MoveForm`), without Discord's parts. */
+export function moveForm(view: TrainPlaces): MoveForm {
+  const moves = offeredMoves(view);
+  const state = trainStateText(view);
+  const [only] = moves;
+  return {
+    title: 'Move the train',
+    text: moves.length === 1 && only !== undefined ? `${state}\n\n${only.sentence}` : state,
+    place: placeOf(view.party),
+    label: 'Where to',
+    moves,
+  };
+}
+
 /**
  * The action of Manage…'s dialog:
  * `party:<id>:manageform:<place>:<first>:<mode>:<kind>:~<token>`. `place` is where the train was
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index b0d3aeaa04d4e45af2715b73a80de9405dce5c4f..feb282cccb33cf6230addc7eb1d83dfcf7cc130a 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -914,16 +914,12 @@ describe('whereText', () => {
     );
   });
 
-  it('names what takes a finished route back where the member is: Move… on the post, Previous on the map', () => {
+  it('names what takes a finished route back where the member is: Move… on the post and the map', () => {
     const finished = { party: onRoute([4, 1], 2), stop: lookup(gym) };
     expect(whereText(finished, 'post')).toBe(
       'The train has finished its route of 2 stops. ' +
         `Move… takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
     );
-    expect(whereText(finished, 'map')).toBe(
-      'The train has finished its route of 2 stops. ' +
-        `Previous takes it back to stop 2: [The Stacks](<${maps(1)}>).`,
-    );
   });
 });
 
diff --git a/src/render/train-words.ts b/src/render/train-words.ts
index cbac2ee1acc42f9c7c8688be17ba1884daa6cdcd..9992056c1e9458a681d4b32a3eeb4d8047c16071 100644
--- a/src/render/train-words.ts
+++ b/src/render/train-words.ts
@@ -138,17 +138,16 @@ function nextWords(view: TrainPlaces, link: (stop: PostStop) => string): string
 }
 
 /**
- * Where a member moves a train from (plan 8X-H, G3): a typed command (`/previous`), the post
- * (Move…, which has no Previous of its own: the dialog offers it), or the live map's panel, which
- * has a Previous button.
+ * Where a member moves a train from (plan 8X-H, G3): a typed command (`/previous`), or the post's
+ * Move… (which has no Previous of its own: the dialog offers it), on Discord and on the live map
+ * alike since plan 8M-8C (R1: the map's panel with its Previous button is gone).
  */
-export type TrainSurface = 'command' | 'post' | 'map';
+export type TrainSurface = 'command' | 'post';
 
 /** What takes a finished route back, named as the member has it where they moved the train. */
 const BACK_FROM_THE_END: Readonly<Record<TrainSurface, string>> = {
   command: '`/previous`',
   post: 'Move…',
-  map: 'Previous',
 };
 
 /** Of a finished route: what takes the train back, and to where. */
@@ -174,10 +173,10 @@ export const NO_ROUTE_YET = 'This train has no route yet. Add its stops with `/r
 
 /**
  * Where a train is on its route and what comes next, as a member is told it in the answer to a
- * move (`/next` and the others, Move…'s and Manage…'s Submit, the map's panel). Of a finished
- * route it says where Previous leads, which is how a Finish that was a mistake is taken back: to
- * the stop the train was at, or to the last stop of a route that remembers none; Previous named
- * as the member has it there (`surface`: `/previous`, Move…, the map's Previous).
+ * move (`/next` and the others, Move…'s and Manage…'s Submit, on Discord and on the map). Of a
+ * finished route it says where Previous leads, which is how a Finish that was a mistake is taken
+ * back: to the stop the train was at, or to the last stop of a route that remembers none;
+ * Previous named as the member has it there (`surface`: `/previous` or Move…).
  */
 export function whereText(view: TrainPlaces, surface: TrainSurface): string {
   const { party } = view;
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 7fe7663d18209e923bc417672e6fc0d2836c47dc..691567a32ae04ccea52cf6b67c0cef0c62661e8c 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1204,8 +1204,7 @@ path.highlighted {
   color: var(--muted);
 }
 
-.route-editor .form-buttons,
-.move-panel .form-buttons {
+.route-editor .form-buttons {
   flex-wrap: wrap;
 }
 
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 94c58ae45d58738486fdf51c4d38aab43ce6b871..68dd5a0b0cae924946df3db23639b8d7b85ee4c0 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -455,7 +455,7 @@ describe('trainPopup and meetupItem', () => {
       link: LINK,
       attendance: attendance({ actions: [] }),
       may: { arrange: false, clear: false, load: false },
-      panel: null,
+      moves: null,
       conductor: { who: null, mayTake: false, mayDrop: false },
       moveRefusal: { reason: 'not-attending', text: 'You are not signed up for this train.' },
     };
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index b14e236ba9d8e759ed63195c476a6ee7178ecb53..f801e249b1e9393f68780d851d07e04bc8c470ce 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -642,12 +642,15 @@ export function showParties(
         if (meetup) meetupForms.editClicked(meetup);
       } else if (
         target.dataset.routeTrain !== undefined ||
-        target.dataset.moveTrain !== undefined ||
         target.dataset.conductor !== undefined
       ) {
-        const id = target.dataset.routeTrain ?? target.dataset.moveTrain ?? target.dataset.train;
+        const id = target.dataset.routeTrain ?? target.dataset.train;
         const train = view?.trains.find((each) => each.id === id);
         if (train) trainForms.actionClicked(target, train);
+      } else if (target.dataset.moveTrain !== undefined) {
+        // A train's Move… (plan 8M-8C, R1): the post's dialog as a form in the place of the post.
+        const party = partyById(target.dataset.moveTrain);
+        if (party) postForms.moveClicked(target, party);
       } else if (target.dataset.regroup !== undefined) {
         // Group… (plan 8M-8B): its form in the place of the post.
         const party = partyById(target.dataset.regroup);
@@ -1177,8 +1180,8 @@ export function showParties(
   });
 
   // Trains (plan 8M-5): "New train" in the side panel, route mode (the editor in the side panel,
-  // the stops numbered on the map, a gym clicked added as the next stop), the Manage train panel in
-  // a train's popup, the conductor's buttons; held like the raid forms. After a success the list
+  // the stops numbered on the map, a gym clicked added as the next stop), the conductor's buttons
+  // (Move… and Manage… are forms of the post, plan 8M-8C); held like the raid forms. After a success the list
   // at once, and the train's popup opened.
   const routeLayer = L.layerGroup().addTo(map);
   const trainForms = trainUi({
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index 0da858f2c36ad3085364f0531c42b8a749321185..47144651b1fa08c18e626d1af71c7a3761948416 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -591,7 +591,13 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
       link: LINK,
       attendance: attendance({ mine: { status: 'coming', group: 'A' } }),
       may: { arrange: true, clear: false, load: false },
-      panel: { place: '2', moves: [{ move: 'next', target: '3' }] },
+      moves: {
+        title: 'Move the train',
+        place: '2',
+        text: 'At stop 2 of 4: Gym 2\nNext is Gym 3',
+        label: 'Where to',
+        moves: [{ move: 'next', target: '3', label: 'Next: Gym 3' }],
+      },
       conductor: { who: null, mayTake: true, mayDrop: false },
       moveRefusal: null,
     };
@@ -679,7 +685,7 @@ describe('the review’s fixes (8M-8A fix round 1)', () => {
     link: LINK,
     attendance: attendance(),
     may: { arrange: false, clear: false, load: false },
-    panel: null,
+    moves: null,
     conductor: { who: 'other', mayTake: false, mayDrop: false },
     moveRefusal: refused('not-conductor'),
     ...more,
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index d9efd3acafd1fc17674e6b47c71d0e8c0c4fea95..4855523c4ae2623f02788e338d7328eb980cf0dd 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -198,7 +198,8 @@ function panelAttributes(
         ? { 'data-change-raid': party.id }
         : undefined;
     case 'moves':
-      return party.kind === 'train' && party.panel !== null
+      // Move…'s form (plan 8M-8C, R1), the post's dialog as the list carries it.
+      return party.kind === 'train' && party.moves !== null
         ? { 'data-move-train': party.id }
         : undefined;
     case 'manage':
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index 469df03782b088958344dbd5a9f9a49f0249778f..e32178184b334b7fa024ff8df0d592a4a1be5a5f 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -1,6 +1,6 @@
 import type { MapMeet, MapParty, MapReport } from '../../domain/web/party-data.js';
 import type { MapManage } from '../../domain/web/train-data.js';
-import { manageBody, manageForm } from './train-post-forms.js';
+import { manageBody, manageForm, moveBody, moveForm } from './train-post-forms.js';
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type PageNode } from './popup.js';
@@ -133,7 +133,7 @@ export function postFormsUi(deps: PostFormsDeps) {
       const sent = await sendPostForm(deps.csrf.get(), {
         post: async (token) => {
           const reply = await fetch(
-            `/s/${guild}/api/${partiesOf(control)}/${encodeURIComponent(party.id)}/${control}`,
+            `/s/${guild}/api/${partiesOf(control)}/${encodeURIComponent(party.id)}/${body.path ?? control}`,
             {
               method: 'POST',
               credentials: 'same-origin',
@@ -248,6 +248,23 @@ export function postFormsUi(deps: PostFormsDeps) {
       });
     },
 
+    /**
+     * A train's Move… (plan 8M-8C, R1): the post's dialog as the list carries it
+     * (`MapTrain.moves`), uncounted until its Submit (`POST …/trains/<id>/move/<move>`). A refusal
+     * closes it (its choices may be stale) and the list is asked for again.
+     */
+    moveClicked(button: HTMLButtonElement, party: MapParty): void {
+      if (party.kind !== 'train' || party.moves === null) return;
+      const { moves } = party;
+      void open(button, 'move', party, () =>
+        Promise.resolve({
+          form: moveForm(party.id, moves),
+          bodyOf: (fields) => moveBody(moves, fields),
+          refusalCloses: true as const,
+        }),
+      );
+    },
+
     /**
      * A train's Manage… (plan 8M-8C): its form from what the post's dialog shows now (`GET
      * …/trains/<id>/manage`), or why not. A refusal of its Submit closes it (its choices may be
@@ -291,7 +308,7 @@ interface Opened {
 const NOT_OPENED = 'That did not get through; try again.';
 
 /** The forms of a train's post (plan 8M-8C), whose addresses are the trains'. */
-const TRAIN_FORMS: ReadonlySet<string> = new Set(['manage']);
+const TRAIN_FORMS: ReadonlySet<string> = new Set(['move', 'manage']);
 
 /** Where a form's control is: `/api/trains/<id>/…` for a train's, else `/api/parties/<id>/…`. */
 function partiesOf(control: string): 'trains' | 'parties' {
diff --git a/src/web/client/post-forms.ts b/src/web/client/post-forms.ts
index cd2af90063536f8a732cf67f5f46ed0d4b4fb280..031c84a4fc4cdfc661019d38cb2e6fa4fb3c9aa1 100644
--- a/src/web/client/post-forms.ts
+++ b/src/web/client/post-forms.ts
@@ -295,8 +295,11 @@ export function reportBody(reason: string | undefined): PostFormBody {
   return { body: { reason: reason ?? '' } };
 }
 
-/** A body to send, or what the member must do first (the page's own words). */
-export type PostFormBody = { body: Record<string, unknown> } | { text: string };
+/**
+ * A body to send, or what the member must do first (the page's own words). `path`: the address
+ * under the party's where the pick decides it (Move…'s `move/<move>`, plan 8M-8C); else the form's.
+ */
+export type PostFormBody = { body: Record<string, unknown>; path?: string } | { text: string };
 
 /** The body of Group…'s move: the group picked by its letter and stamp. */
 export function regroupBody(
diff --git a/src/web/client/raid-forms.ts b/src/web/client/raid-forms.ts
index ce74d6a8e08a295cf0e09af4eea77ef21912b045..cfe3178968b36247d3871793b5749a87c21b6f1c 100644
--- a/src/web/client/raid-forms.ts
+++ b/src/web/client/raid-forms.ts
@@ -355,7 +355,7 @@ const stopClick = (event: { stopPropagation(): void }): void => {
  * Keeps the clicks in a popup from the map. Leaflet (1.9) leaves a click in a popup alone by
  * walking up from the click's target to the popup when the click reaches the map
  * (`Map._isClickDisabled`); a control that takes its own button out of the page as it is clicked
- * (Manage… drawing the Manage train panel in its place, Cancel putting a gym's buttons back) leaves
+ * (a form of the post drawn in its place, Cancel putting a gym's buttons back) leaves
  * nothing to walk up from, so Leaflet took it for a click on the map and closed the popup
  * (staging of the web map plans, 2026-10-18). Stopped at the popup's element, a click never
  * reaches the map. Safe to call on every opening: the listener is added once.
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 35ba8a871ade7349ff801e4a6e0a4fc037c0f819..6fb1a3bddf47eebf50cd2b3b6f2b55aed226e483 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -7,9 +7,7 @@ import {
   conductorBody,
   drawnTrains,
   keepTools,
-  movePanel,
   newTrainButton,
-  pressBody,
   routeEditBody,
   routeEditor,
   RouteEdits,
@@ -65,11 +63,14 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     count: false,
   },
   may: { arrange: true, clear: false, load: true },
-  panel: {
+  moves: {
+    title: 'Move the train',
     place: '1',
+    text: 'At stop 2 of 3: The Stacks\nNext is Harbor Lighthouse Mural',
+    label: 'Where to',
     moves: [
-      { move: 'next', target: '7' },
-      { move: 'previous', target: '4' },
+      { move: 'next', target: '7', label: 'Next: Harbor Lighthouse Mural' },
+      { move: 'previous', target: '4', label: 'Previous: Veterans Memorial Bridge' },
     ],
   },
   conductor: { who: null, mayTake: true, mayDrop: false },
@@ -194,7 +195,7 @@ describe("a train's actions in its popup (trainActions)", () => {
   it('offers nothing to who may do nothing of it', () => {
     const watching = train({
       may: { arrange: false, clear: false, load: false },
-      panel: null,
+      moves: null,
       conductor: { who: 'other', mayTake: false, mayDrop: false },
       moveRefusal: {
         reason: 'not-conductor',
@@ -491,40 +492,6 @@ describe('the edits of route mode, one at a time (RouteEdits)', () => {
   });
 });
 
-describe('the moves of a train (movePanel, pressBody)', () => {
-  it('says where the train is and offers the moves that can be made, each with where it leads; Finish, Reverse and the mode are Manage…’s', () => {
-    const panel = movePanel(train(), gym);
-    expect(panel?.attributes).toEqual({ 'data-form': 'move', 'data-party': 't1' });
-    expect(texts(panel ?? { tag: 'none' }).slice(0, 2)).toEqual([
-      'Move the train',
-      'At stop 2 of 3: The Stacks',
-    ]);
-    expect(
-      buttons(panel ?? { tag: 'none' }).map(([text, attributes]) => [
-        text,
-        attributes?.['data-press'],
-        attributes?.['data-target'],
-      ]),
-    ).toEqual([
-      ['Next', 'next', '7'],
-      ['Previous', 'previous', '4'],
-      ['Done', undefined, undefined],
-    ]);
-    const finished = movePanel(
-      train({ stop: null, panel: { place: 'end', moves: [{ move: 'previous', target: '7' }] } }),
-      gym,
-    );
-    expect(texts(finished ?? { tag: 'none' })).toContain('The route of 3 stops is finished.');
-    expect(movePanel(train({ panel: null }), gym)).toBeUndefined();
-  });
-
-  it('makes the body of a press: where the panel was drawn and where the button leads', () => {
-    const { panel } = train();
-    if (!panel) throw new Error('no panel');
-    expect(pressBody(panel, { target: '7' })).toEqual({ from: '1', target: '7' });
-  });
-});
-
 describe("a train's answer (trainAnswerOf, sendTrainForm)", () => {
   it('takes whether it was done and the train as the server gives it', () => {
     expect(trainAnswerOf({ ok: true, text: 'Done.', train: train() })).toEqual({
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index bbf37bfda1303e1ea4cf35f19db45cdbb20e04e5..466d5801aabc03cf84f7079f79dc0f71993241e1 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -1,4 +1,4 @@
-import type { MapAtEnd, MapMove, MapTrain, MapTrainPanel } from '../../domain/web/party-data.js';
+import type { MapAtEnd, MapTrain } from '../../domain/web/party-data.js';
 import {
   MAP_AT_ENDS,
   type ConductorSeen,
@@ -20,7 +20,7 @@ import { zoneHintNodes, type FormZones } from './raid-forms.js';
 /**
  * Trains on the live map (plan 8M-5, spec 3.7), the parts that need no Leaflet: the start form,
  * a train's actions in its popup, the route editor of route mode and its numbered stops, the
- * Manage train panel, the bodies they send, and sending one with the page's CSRF token as a press
+ * bodies they send, and sending one with the page's CSRF token as a press
  * is sent. Everything is a tree of nodes (`renderNode` sets every text as text). What a member
  * types is read by the server with the commands' readers; the page only says what is missing.
  */
@@ -37,13 +37,6 @@ export const AT_END_WORDS: Readonly<Record<MapAtEnd, string>> = {
   'turn-back': 'Turn back at the end',
 };
 
-/** The buttons of the moves, as the post's panel names them. */
-const MOVE_WORDS: Readonly<Record<MapMove, string>> = {
-  next: 'Next',
-  previous: 'Previous',
-  skip: 'Skip',
-};
-
 const button = (
   text: string,
   attributes: Record<string, string>,
@@ -200,7 +193,7 @@ export function startBody(values: StartValues): TrainBody {
 
 /**
  * What a train's own summary offers a member (shown until its post comes), as they may
- * (`MapTrain.may`, `panel`, `moveRefusal`, `conductor`): "Edit route", "Move…", "Manage…" (for who
+ * (`MapTrain.may`, `moves`, `moveRefusal`, `conductor`): "Edit route", "Move…", "Manage…" (for who
  * may move the train, also without a route: its kind), and taking or giving up the conductor
  * role; and whose the role is, without naming anybody.
  */
@@ -215,7 +208,7 @@ export function trainActions(train: MapTrain): PageNode[] {
   const manages = train.moveRefusal === null || train.moveRefusal.reason === 'no-route';
   const buttons = [
     ...(train.may.arrange ? [button('Edit route', { 'data-route-train': train.id })] : []),
-    ...(train.panel ? [button('Move…', { 'data-move-train': train.id })] : []),
+    ...(train.moves ? [button('Move…', { 'data-move-train': train.id })] : []),
     ...(manages ? [button('Manage…', { 'data-manage-train': train.id })] : []),
     ...(conductor.mayTake
       ? [button('Be the conductor', { 'data-conductor': 'take', 'data-train': train.id })]
@@ -537,57 +530,6 @@ export function routeEditBody(
   }
 }
 
-/**
- * The moves of a train on the map, in the train's popup (spec 3.7): where the train is, the moves
- * that can be made from there (`MapTrainPanel.moves`), and Done. Finish, Reverse and the mode are
- * Manage…'s (plan 8M-8C). Nothing for a train without a panel.
- */
-export function movePanel(
-  train: MapTrain,
-  gym: (id: number) => MapGym | undefined,
-): PageNode | undefined {
-  const { panel } = train;
-  if (!panel) return undefined;
-  const at = train.stop === null ? undefined : train.route[train.stop];
-  const where =
-    at === undefined
-      ? `The route of ${train.route.length} ${train.route.length === 1 ? 'stop' : 'stops'} is finished.`
-      : `At stop ${(train.stop ?? 0) + 1} of ${train.route.length}: ${stopName(gym(gymOfStop(at) ?? -1), at, train.spots)}`;
-  return {
-    tag: 'div',
-    className: 'raid-form move-panel',
-    attributes: { 'data-form': 'move', 'data-party': train.id },
-    children: [
-      { tag: 'strong', className: 'name', text: 'Move the train' },
-      { tag: 'div', className: 'stop', text: where },
-      {
-        tag: 'div',
-        className: 'form-buttons',
-        children: panel.moves.map(({ move, target }) =>
-          button(MOVE_WORDS[move], { 'data-press': move, 'data-target': target }),
-        ),
-      },
-      {
-        tag: 'div',
-        className: 'form-buttons',
-        children: [button('Done', { 'data-cancel': '' })],
-      },
-      answerLine,
-    ],
-  };
-}
-
-/**
- * The body of a move (`POST /s/<guild>/api/trains/<id>/move/<move>`): where the panel was drawn
- * (`from`) and where the button leads.
- */
-export function pressBody(
-  panel: MapTrainPanel,
-  values: { target?: string | undefined },
-): Record<string, string> {
-  return { from: panel.place, target: values.target ?? '' };
-}
-
 /**
  * What the page takes of a train's answer: whether it was done, the status it came with (none
  * when the connection broke), and the train as it is now.
@@ -599,10 +541,10 @@ export interface TrainAnswered {
 }
 
 /**
- * Whether an edit's answer ends route mode, and a press's closes the Move panel: the train is
- * gone (409 without a train: it has ended, or is no train of this server). A refusal that gives
- * the train is drawn from it; one without it for another reason (too many clicks, Discord away,
- * a broken connection) leaves route mode or the panel as it is.
+ * Whether an edit's answer ends route mode: the train is gone (409 without a train: it has
+ * ended, or is no train of this server). A refusal that gives the train is drawn from it; one
+ * without it for another reason (too many clicks, Discord away, a broken connection) leaves route
+ * mode as it is.
  */
 export function routeModeEnds(answer: TrainAnswered): boolean {
   return !answer.ok && answer.train === undefined && answer.status === 409;
diff --git a/src/web/client/train-post-forms.test.ts b/src/web/client/train-post-forms.test.ts
index eb6117c0159da06b0fd44ef467dd3e0b1690b29b..01e24c300c242cdd4c82e30b736059903292e325 100644
--- a/src/web/client/train-post-forms.test.ts
+++ b/src/web/client/train-post-forms.test.ts
@@ -1,8 +1,9 @@
 import { describe, expect, it } from 'vitest';
+import type { MapMoves } from '../../domain/web/party-data.js';
 import type { MapManage } from '../../domain/web/train-data.js';
 import type { PageNode } from './popup.js';
 import { sendPostForm } from './post-forms.js';
-import { manageBody, manageForm } from './train-post-forms.js';
+import { manageBody, manageForm, moveBody, moveForm } from './train-post-forms.js';
 
 /** Every node of a tree, depth first. */
 function all(node: PageNode): PageNode[] {
@@ -118,6 +119,68 @@ describe('Manage… on the map (plan 8M-8C)', () => {
   });
 });
 
+const moves = (more: Partial<MapMoves> = {}): MapMoves => ({
+  title: 'Move the train',
+  place: '7',
+  text: 'At stop 3 of 3: Harbor Lighthouse Mural\nNext turns back to The Stacks',
+  label: 'Where to',
+  moves: [
+    { move: 'next', target: '1', label: 'Next: turn back to The Stacks' },
+    {
+      move: 'previous',
+      target: '1',
+      label: 'Previous: back to The Stacks (undo)',
+      line: 'Back one stop, still heading for the end: undoes a Next made by mistake',
+    },
+  ],
+  ...more,
+});
+
+describe('Move… on the map (plan 8M-8C, R1)', () => {
+  it('draws the dialog: where the train is, then the moves as its radio choice in its words, Next first and picked', () => {
+    const form = moveForm('t1', moves());
+    expect(form.attributes).toMatchObject({ 'data-form': 'move', 'data-party': 't1' });
+    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Move the train');
+    expect(all(form).find((one) => one.tag === 'legend')?.text).toBe('Where to');
+    expect(radios(form, 'move')).toEqual(['next:1 *', 'previous:1']);
+    expect(
+      all(form)
+        .filter((one) => one.className === 'choice')
+        .map(seen),
+    ).toEqual([
+      'Next: turn back to The Stacks',
+      'Previous: back to The Stacks (undo)Back one stop, still heading for the end: undoes a Next made by mistake',
+    ]);
+  });
+
+  it('asks nothing where one move is left: the text says what Submit does', () => {
+    const one = moves({
+      place: 'end',
+      text: 'The train has finished its route of 3 stops.\n\nSubmit takes it back to stop 3, Harbor Lighthouse Mural.',
+      moves: [
+        {
+          move: 'previous',
+          target: '7',
+          label: 'Previous: back to stop 3, Harbor Lighthouse Mural',
+        },
+      ],
+    });
+    const form = moveForm('t1', one);
+    expect(radios(form, 'move')).toEqual([]);
+    expect(all(form).find((node) => node.attributes?.type === 'hidden')?.attributes?.value).toBe(
+      'previous:7',
+    );
+  });
+
+  it('sends the move picked to its address, with where the train was and where the move leads', () => {
+    expect(moveBody(moves(), { move: 'previous:1' })).toEqual({
+      path: 'move/previous',
+      body: { from: '7', target: '1' },
+    });
+    expect(moveBody(moves(), { move: 'skip:4' })).toEqual({ text: 'Pick where to first.' });
+  });
+});
+
 describe('a train form’s answer (sendPostForm)', () => {
   it('takes a 409 that gives the train as it is now for a refusal, not for a train that is over', async () => {
     const stale = await sendPostForm('t', {
diff --git a/src/web/client/train-post-forms.ts b/src/web/client/train-post-forms.ts
index a317eb85fecc58d32c65e22aecdede4810cb8f6b..04a204ddb4725d02307b212690d47c2704b3c24d 100644
--- a/src/web/client/train-post-forms.ts
+++ b/src/web/client/train-post-forms.ts
@@ -1,3 +1,4 @@
+import type { MapMoves } from '../../domain/web/party-data.js';
 import type { MapFormChoice, MapManage } from '../../domain/web/train-data.js';
 import { MAP_AT_ENDS, MAP_TRAIN_KINDS } from '../../domain/web/train-data.js';
 import type { PageNode } from './popup.js';
@@ -46,6 +47,41 @@ export function manageForm(trainId: string, manage: MapManage): PageNode {
   ]);
 }
 
+/** A move's value in Move…'s choice: `<move>:<target>`, as the dialog's. */
+const moveValue = (move: { move: string; target: string }): string => `${move.move}:${move.target}`;
+
+/**
+ * Move…'s form (plan 8M-8C, R1), as the post's dialog: where the train is (with one move left,
+ * what Submit does), then "Where to" of the moves the server offers in their order, each with
+ * its line, Next first and picked; with one move no choice.
+ */
+export function moveForm(trainId: string, moves: MapMoves): PageNode {
+  const choices = moves.moves.map((move) => ({
+    value: moveValue(move),
+    label: move.label,
+    ...(move.line === undefined ? {} : { line: move.line }),
+  }));
+  const [first] = choices;
+  return dialogForm('move', trainId, moves.title, [
+    { tag: 'p', className: 'form-text', text: moves.text },
+    ...(choices.length > 1
+      ? [radioChoice('move', moves.label, choices, first?.value)]
+      : first === undefined
+        ? []
+        : [{ tag: 'input', attributes: { type: 'hidden', name: 'move', value: first.value } }]),
+  ]);
+}
+
+/**
+ * The body of Move…'s Submit and its address (`move/<move>`): where the train was when the form
+ * was drawn (`from`) and where the move picked leads (`target`).
+ */
+export function moveBody(moves: MapMoves, fields: Record<string, string>): PostFormBody {
+  const picked = moves.moves.find((move) => moveValue(move) === fields.move);
+  if (picked === undefined) return { text: 'Pick where to first.' };
+  return { path: `move/${picked.move}`, body: { from: moves.place, target: picked.target } };
+}
+
 const ROUTE_WAYS = ['keep', 'reverse', 'finish'] as const;
 
 /**
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index e6d76b14f5190f3396cbb69015cfb6ebb05cda7d..3c51ebae4d3084ec7b2f74da9153cf713a4d259b 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -259,11 +259,14 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
     count: false,
   },
   may: { arrange: true, clear: false, load: true },
-  panel: {
+  moves: {
+    title: 'Move the train',
     place: '1',
+    text: 'At stop 2 of 3: The Stacks\nNext is Harbor Lighthouse Mural',
+    label: 'Where to',
     moves: [
-      { move: 'next', target: '7' },
-      { move: 'previous', target: '4' },
+      { move: 'next', target: '7', label: 'Next: Harbor Lighthouse Mural' },
+      { move: 'previous', target: '4', label: 'Previous: Veterans Memorial Bridge' },
     ],
   },
   conductor: { who: null, mayTake: true, mayDrop: false },
@@ -489,53 +492,6 @@ describe('route mode (trainUi)', () => {
   });
 });
 
-describe('the Manage train panel (trainUi)', () => {
-  afterEach(() => {
-    vi.unstubAllGlobals();
-  });
-
-  /** The panel opened in a train's actions in the side panel; `answer` answers the presses. */
-  const opened = (answer: Answer) => {
-    const shown = page((url) => (url.includes('/move/') ? answer : undefined));
-    const box = make('div');
-    box.className = 'train-actions';
-    shown.body.append(box);
-    const move = shown.action('data-move-train', 't1', box);
-    shown.ui.actionClicked(move, train());
-    const panel = box.firstElementChild;
-    if (panel?.dataset.form !== 'move') throw new Error('no Move panel');
-    const next = panel.querySelectorAll('button').find((button) => button.dataset.press === 'next');
-    return { ...shown, box, move, next };
-  };
-
-  it('closes when the train is gone (409 without a train), says so and draws the map with nothing opened', async () => {
-    const shown = opened({ status: 409, body: { ok: false, text: 'This train is over.' } });
-    shown.next?.dispatch('click');
-    await shown.finished.reached(1);
-    expect(shown.sent.map(({ url, body }) => [url, body])).toEqual([
-      [`/s/${GUILD}/api/trains/t1/move/next`, { from: '1', target: '7' }],
-    ]);
-    expect(shown.done).toEqual([undefined]);
-    expect(shown.said).toEqual(['This train is over.']);
-    expect(shown.box.childNodes).toEqual([shown.move]);
-    expect(shown.hold.editing).toBe(false);
-  });
-
-  it('closes when the answer gives the train without a panel for the member (who may not move it now)', async () => {
-    const without = train({ panel: null });
-    const shown = opened({
-      status: 403,
-      body: { ok: false, text: 'You are not signed up for this train.', train: without },
-    });
-    shown.next?.dispatch('click');
-    await shown.finished.reached(1);
-    expect(shown.done).toEqual([without]);
-    expect(shown.said).toEqual(['You are not signed up for this train.']);
-    expect(shown.box.childNodes).toEqual([shown.move]);
-    expect(shown.hold.editing).toBe(false);
-  });
-});
-
 describe('a form in a popup on the map, as Leaflet takes its clicks', () => {
   afterEach(() => {
     vi.unstubAllGlobals();
@@ -588,34 +544,6 @@ describe('a form in a popup on the map, as Leaflet takes its clicks', () => {
     return { updates, closed: () => closed };
   };
 
-  it("keeps a train's popup open when Manage… draws the Manage train panel into it, and Done closes the panel", async () => {
-    const shown = page();
-    const box = make('div');
-    box.className = 'train-actions';
-    const move = shown.action('data-move-train', 't1', box) as unknown as FakeElement;
-    const popup = leafletPopup(shown, () => {
-      const drawn = make('div');
-      drawn.append(box);
-      // As the party layer hands a train's action to the trains' side (`draw`).
-      drawn.addEventListener('click', (event) => {
-        if (event.target.dataset.moveTrain !== undefined) {
-          shown.ui.actionClicked(event.target as unknown as HTMLButtonElement, train());
-        }
-      });
-      return drawn;
-    });
-    move.dispatch('click');
-    expect(popup.closed()).toBe(false);
-    const panel = box.firstElementChild;
-    expect(panel?.dataset.form).toBe('move');
-    expect(shown.hold.editing).toBe(true);
-    panel?.querySelector('button[data-cancel]')?.dispatch('click');
-    await shown.finished.reached(1);
-    expect(popup.closed()).toBe(false);
-    expect(box.childNodes).toEqual([move]);
-    expect(shown.hold.editing).toBe(false);
-  });
-
   it("puts a gym's button back when the spawn form in its popup is cancelled, the popup open", async () => {
     const shown = page((url) =>
       url.endsWith('/wild-options')
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index 423042459e7e5fb44f9f76fc1fd9a57db125b6e1..41728ab58dc5892bcec67d02c33b6dc558b6f9ce 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -2,10 +2,8 @@ import type { GeoView } from '../../domain/web/geo-data.js';
 import type { MapTrain } from '../../domain/web/party-data.js';
 import {
   CONDUCTOR_CHANGES,
-  PANEL_PRESSES,
   ROUTE_EDITS,
   type ConductorChange,
-  type PanelPress,
   type RouteEdit,
   type SavedRoutesView,
 } from '../../domain/web/train-data.js';
@@ -13,13 +11,11 @@ import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type MapGym } from './popup.js';
 import { readerZone } from './post-time.js';
-import { formPlace, type FormClaim, type FormHold } from './raid-forms.js';
+import type { FormClaim, FormHold } from './raid-forms.js';
 import { fieldsOf, sayUnder } from './raid-ui.js';
 import {
   conductorBody,
-  movePanel,
   newTrainButton,
-  pressBody,
   routeEditor,
   RouteEdits,
   routeModeEnds,
@@ -79,10 +75,6 @@ function isRouteEdit(value: string | undefined): value is RouteEdit {
   return (ROUTE_EDITS as readonly (string | undefined)[]).includes(value);
 }
 
-function isPanelPress(value: string | undefined): value is PanelPress {
-  return (PANEL_PRESSES as readonly (string | undefined)[]).includes(value);
-}
-
 function isConductorChange(value: string | undefined): value is ConductorChange {
   return (CONDUCTOR_CHANGES as readonly (string | undefined)[]).includes(value);
 }
@@ -368,71 +360,6 @@ export function trainUi(deps: TrainUiDeps) {
     deps.tools.replaceChildren(form);
   };
 
-  /**
-   * The moves of a train in its popup, in place of its actions. It stays open after a
-   * move, drawn anew from where the train is then, as the post's panel does; Done closes it and
-   * draws the map with the train's popup open again, and so does a move after which the member
-   * may move it no more (no panel). Meanwhile the list is asked for again after each move, and
-   * drawn once the panel or its popup closes.
-   */
-  const openMove = (box: HTMLElement, train: MapTrain): void => {
-    const claim = hold.take(formPlace(box));
-    if (!claim) return;
-    const before = [...box.childNodes];
-    let shown = train;
-    const close = () => {
-      if (box.isConnected) box.replaceChildren(...before);
-      hold.release(claim);
-    };
-    /** Draws the panel from `shown`; false when there is none to draw (it closes). */
-    const draw = (): boolean => {
-      const node = movePanel(shown, gym);
-      if (!node) {
-        close();
-        return false;
-      }
-      const panel = renderNode(node, document);
-      panel.addEventListener('click', (event) => {
-        const target = event.target;
-        if (!(target instanceof HTMLButtonElement)) return;
-        if (target.dataset.cancel !== undefined) {
-          close();
-          void deps.done(shown);
-          return;
-        }
-        const press = target.dataset.press;
-        if (!isPanelPress(press) || !shown.panel) return;
-        const body = pressBody(shown.panel, { target: target.dataset.target });
-        void sendForm(panel, trainUrl(shown, `move/${press}`), { body }).then(async (sent) => {
-          if (!sent) return;
-          // The panel is closed meanwhile, or the train is gone (409 without a train): the map
-          // drawn anew with nothing opened.
-          if (!hold.holds(claim) || routeModeEnds(sent)) {
-            close();
-            say(sent.text);
-            await deps.done(undefined);
-            return;
-          }
-          // The panel as the train is now (moved, or as it was moved meanwhile), and the words.
-          if (sent.train) shown = sent.train;
-          if (!draw()) {
-            say(sent.text);
-            await deps.done(shown);
-            return;
-          }
-          const drawn = box.firstElementChild;
-          if (drawn instanceof HTMLElement) sayUnder(drawn, sent.text);
-          else say(sent.text);
-          if (sent.ok) await deps.refresh();
-        });
-      });
-      box.replaceChildren(panel);
-      hold.fit();
-      return true;
-    };
-    draw();
-  };
-
   /**
    * Takes or gives up the conductor role at once, as `/conductor` does, with whose the role was
    * as the train was drawn (a press against a role that changed meanwhile is refused).
@@ -455,14 +382,12 @@ export function trainUi(deps: TrainUiDeps) {
 
     /**
      * A click on a train's action in its popup or the side panel (`data-route-train`,
-     * `data-move-train`, `data-conductor`): `train` is the train as the list has it.
+     * `data-conductor`): `train` is the train as the list has it. Move… and Manage… are the
+     * post's dialogs as forms (`post-forms-ui.ts`, plan 8M-8C).
      */
     actionClicked(button: HTMLButtonElement, train: MapTrain): void {
       if (button.dataset.routeTrain !== undefined) startRoute(train);
-      else if (button.dataset.moveTrain !== undefined) {
-        const box = button.closest<HTMLElement>('.train-actions, .post-controls');
-        if (box) openMove(box, train);
-      } else if (button.dataset.conductor !== undefined) void pressConductor(button, train);
+      else if (button.dataset.conductor !== undefined) void pressConductor(button, train);
     },
 
     /**
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index f4f2ee2001a8f074b65290358d17d053aa9fd13e..d2bcaf961456565f966864b7db82e1deab96418e 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -90,7 +90,7 @@ const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
   link: 'https://discord.com/channels/1/3',
   attendance: attendance(4, 1),
   may: { arrange: false, clear: false, load: false },
-  panel: null,
+  moves: null,
   conductor: { who: null, mayTake: false, mayDrop: false },
   moveRefusal: null,
   ...more,
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 414a07f42d3109ce9cf39c6d1af5edd19201c13a..c002df39e076343e091345d693c6e75737dc806b 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -62,11 +62,12 @@ import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
 import type { GuildRequest } from './guild-routes.js';
+import type { StopLookup } from '../render/train-stops.js';
 import { pageWords } from './page-words.js';
 import type { PartyViewers } from './party-viewers.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
-import { refusalOnTheMap } from './train-views.js';
+import { movesOnTheMap, refusalOnTheMap } from './train-views.js';
 
 /**
  * The requests for a server's parties one address may make in a minute: a page asks every 20
@@ -100,6 +101,11 @@ export interface PartyWebDeps {
    * left out: none is known.
    */
   spotOf?: (id: string) => { name: string; lat: number; lon: number } | undefined;
+  /**
+   * The stops of trains' routes as they are now (`PartyService.stops`): a train's Move… on the map
+   * names them as the post's dialog does (plan 8M-8C).
+   */
+  stops: StopLookup;
   /**
    * The layout a party's post was last shown with (plan 8M-8A, `PartyService.layoutOf`), which the
    * map draws as its popup; undefined while it has none.
@@ -384,6 +390,9 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
     // Why Move… and Manage… do not open, in Discord's words (plan 8M-8C, review C1).
     trainRefusal: (reason) =>
       refusalOnTheMap(parties, reason, (text) => pageWords(text, parties.zone, deps.now())),
+    // Move… of a train as the post's dialog draws it (plan 8M-8C).
+    trainMoves: (train) =>
+      movesOnTheMap(parties.stops, train, (text) => pageWords(text, parties.zone, deps.now())),
   });
 
   /**
diff --git a/src/web/train-move.test.ts b/src/web/train-move.test.ts
index 9017b4ab3aa486f575733c24e448319fc6888ecc..0207e99eba790f5169bdc0d7525233af094aae7d 100644
--- a/src/web/train-move.test.ts
+++ b/src/web/train-move.test.ts
@@ -112,7 +112,7 @@ describe('moving a train on the map', () => {
     web = undefined;
   });
 
-  it("moves it as the panel's Next does: the movement in the post pings as usual, the command's words as text, the train as it is now", async () => {
+  it("moves it as Move…'s Next does: the movement in the post pings as usual, the dialog's words as text, the train as it is now", async () => {
     const map = await moving();
     web = map.web;
     await map.made.attendance.signUp(
@@ -128,7 +128,7 @@ describe('moving a train on the map', () => {
       text:
         'The train is at stop 2 of 3: The Stacks. Next is Harbor Lighthouse Mural. ' +
         'I am telling the others.',
-      train: { stop: 1, panel: { place: '1' } },
+      train: { stop: 1, moves: { place: '1' } },
     });
     expect(attendeeOf(map.made.current(), BOB)?.status).toBe(PartyStatus.Coming);
     expect(await map.lines()).toEqual([
@@ -138,7 +138,7 @@ describe('moving a train on the map', () => {
     ]);
   });
 
-  it('refuses a press drawn where the train no longer is, or leading where the route no longer goes, and gives the train as it is now', async () => {
+  it("refuses a move drawn where the train no longer is, or leading where the route no longer goes, in Move…'s words, and gives the train as it is now", async () => {
     const map = await moving();
     web = map.web;
     expect((await map.move('next', { from: '4', target: '1' })).status).toBe(200);
@@ -146,17 +146,19 @@ describe('moving a train on the map', () => {
     expect(twice.status).toBe(409);
     expect(twice.json).toMatchObject({
       ok: false,
-      text: 'The train has moved on meanwhile.',
+      text:
+        'The train has moved on since you opened this: The train is at stop 2 of 3: The ' +
+        'Stacks. Next is Harbor Lighthouse Mural.',
       train: { stop: 1 },
     });
     await map.made.trains.moveStop(map.made.party.id, { id: ALICE }, 3, 2);
     const elsewhere = await map.move('previous', { from: '1', target: '4' });
     expect(elsewhere.status).toBe(409);
-    expect(elsewhere.json.text).toBe('That button no longer leads where it said.');
+    expect(elsewhere.json.text).toMatch(/^The train has moved on since you opened this: /);
     expect(map.made.current().train.stop).toBe(2);
   });
 
-  it('skips and goes back as the panel does', async () => {
+  it('skips and goes back as Move… does, and names Move… for what takes a finished route back', async () => {
     const map = await moving();
     web = map.web;
     expect((await map.move('skip', { from: '4', target: '7' })).json.text).toBe(
@@ -164,24 +166,69 @@ describe('moving a train on the map', () => {
     );
     expect((await map.move('previous', { from: '7', target: '1' })).json).toMatchObject({
       ok: true,
-      train: { stop: 1, panel: { place: '1' } },
+      train: { stop: 1, moves: { place: '1' } },
     });
+    await map.made.trains.move(map.made.party.id, { id: ALICE }, 'next', false);
+    expect((await map.move('next', { from: '7', target: 'end' })).json.text).toBe(
+      'The train has finished its route of 3 stops. Move… takes it back to stop 3: Harbor ' +
+        'Lighthouse Mural. I am telling the others.',
+    );
   });
 
-  it("gives the panel to who may move the train: the moves from where it is with where each leads; nobody else's", async () => {
+  it("gives who may move the train Move… as the post's dialog draws it: where the train is, the moves from there in its words; nobody else", async () => {
     const map = await moving();
     web = map.web;
-    expect((await map.listed(ALICE, 'Alice'))?.panel).toEqual({
+    expect((await map.listed(ALICE, 'Alice'))?.moves).toEqual({
+      title: 'Move the train',
       place: '4',
+      text: 'At stop 1 of 3: Veterans Memorial Bridge\nNext is The Stacks',
+      label: 'Where to',
       moves: [
-        { move: 'next', target: '1' },
-        { move: 'skip', target: '7' },
+        { move: 'next', target: '1', label: 'Next: The Stacks' },
+        {
+          move: 'skip',
+          target: '7',
+          label: 'Skip The Stacks, go to Harbor Lighthouse Mural',
+        },
       ],
     });
-    expect((await map.listed(BOB, 'Bob'))?.panel).toBeNull();
+    expect((await map.listed(BOB, 'Bob'))?.moves).toBeNull();
     await map.made.trains.setConductor(map.made.party.id, { id: REPORTER });
-    expect((await map.listed(ALICE, 'Alice'))?.panel).toBeNull();
-    expect((await map.listed(TEST_OWNER_ID, 'Owner'))?.panel?.place).toBe('4');
+    expect((await map.listed(ALICE, 'Alice'))?.moves).toBeNull();
+    expect((await map.listed(TEST_OWNER_ID, 'Owner'))?.moves?.place).toBe('4');
+  });
+
+  it('offers the undo of a turn-back route and says what Submit does where one move is left, as the dialog does', async () => {
+    const map = await moving();
+    web = map.web;
+    await map.made.setAtEnd({ id: ALICE }, false, 'turn-back');
+    await map.made.trains.move(map.made.party.id, { id: ALICE }, 'skip', false);
+    const atEnd = (await map.listed(ALICE, 'Alice'))?.moves;
+    expect(atEnd?.text).toBe(
+      'At stop 3 of 3: Harbor Lighthouse Mural\nNext turns back to The Stacks',
+    );
+    expect(atEnd?.moves.map(({ label, line }) => [label, line])).toEqual([
+      ['Next: turn back to The Stacks', undefined],
+      [
+        'Previous: back to The Stacks (undo)',
+        'Back one stop, still heading for the end: undoes a Next made by mistake',
+      ],
+      ['Skip The Stacks, go to Veterans Memorial Bridge', undefined],
+    ]);
+    await map.made.setAtEnd({ id: ALICE }, false, 'finish');
+    await map.made.trains.move(map.made.party.id, { id: ALICE }, 'next', false);
+    const finished = (await map.listed(ALICE, 'Alice'))?.moves;
+    expect(finished?.text).toBe(
+      'The train has finished its route of 3 stops.\n\nSubmit takes it back to stop 3, ' +
+        'Harbor Lighthouse Mural.',
+    );
+    expect(finished?.moves).toEqual([
+      {
+        move: 'previous',
+        target: '7',
+        label: 'Previous: back to stop 3, Harbor Lighthouse Mural',
+      },
+    ]);
   });
 
   it("lets only who may move it move it, in the command's words before the throttle", async () => {
@@ -191,18 +238,18 @@ describe('moving a train on the map', () => {
     const bob = await map.web.posting(BOB, 'Bob');
     const notSigned = await map.move('next', { from: '4', target: '1' }, bob);
     expect(notSigned.status).toBe(403);
-    // With the train as Bob sees it, without a panel: the page closes the panel.
+    // With the train as Bob sees it, without Move…: the page closes the form.
     expect(notSigned.json).toMatchObject({
       ok: false,
       text: 'You are not signed up for this train.',
-      train: { route: ['4', '1', '7'], panel: null },
+      train: { route: ['4', '1', '7'], moves: null },
     });
     await map.made.trains.setConductor(map.made.party.id, { id: REPORTER });
     const conducted = await map.move('next', { from: '4', target: '1' });
     expect(conducted.status).toBe(403);
     expect(conducted.json).toMatchObject({
       text: 'This train has a conductor: only they and the moderators can move it.',
-      train: { panel: null, conductor: { who: 'other' } },
+      train: { moves: null, conductor: { who: 'other' } },
     });
     expect(
       throttles.use(controlThrottleKey(PARTY_KIND), ALICE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index f21fcb5436a54809bcdca858fda2ae8d2c13b247..ad034d70639877108e5e02dbed0185c2b843066c 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -14,6 +14,7 @@ import {
   loadRouteAs,
   manageRefusal,
   manageTrainAs,
+  movedOnWords,
   moveStopAs,
   moveTrainAs,
   notSignedUpWords,
@@ -28,8 +29,8 @@ import {
   type TrainManaging,
   type TrainStarting,
 } from '../commands/trains/train-changes.js';
-import type { DialogChoice } from '../discord/dialog.js';
 import { manageForm, ROUTE_CHOICES } from '../render/train-dialogs.js';
+import { formChoice, movesOnTheMap, refusalOnTheMap } from './train-views.js';
 import { NO_START_TO_REMOVE, TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import { UserError } from '../discord/errors.js';
@@ -61,7 +62,6 @@ import {
   PANEL_PRESSES,
   ROUTE_EDITS,
   type ConductorChange,
-  type MapFormChoice,
   type MapManage,
   type PanelPress,
   type RouteEdit,
@@ -88,7 +88,6 @@ import type { GuildRequest } from './guild-routes.js';
 import { pageWords } from './page-words.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
-import { refusalOnTheMap } from './train-views.js';
 
 /**
  * What the trains of the live map read and call (plan 8M-5): exactly what `/train`, `/route`,
@@ -289,6 +288,8 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       pictureOrigins: deps.pictureOrigins,
       // Why Move… and Manage… do not open, in Discord's words (review C1).
       trainRefusal: (reason) => refusalOnTheMap(parties, reason, words),
+      // Move… as the post's dialog draws it (plan 8M-8C).
+      trainMoves: (train) => movesOnTheMap(parties.stops, train, words),
     });
     return shown?.kind === 'train' ? shown : undefined;
   };
@@ -660,9 +661,15 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const counted = { control: PARTY_KIND };
       const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
       if (throttled) return throttled;
-      const answer = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
-        moveTrainAs(ctx, party, member, press, staff, 'map', body.data.from, body.data.target),
+      // Move…'s Submit (plan 8M-8C, R1): the post's dialog's words, Move… named as what takes a
+      // finished route back, and a move drawn elsewhere refused with where the train is now.
+      const moved = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
+        moveTrainAs(ctx, party, member, press, staff, 'post', body.data.from, body.data.target),
       );
+      const answer =
+        moved.kind === 'refused'
+          ? { ...moved, text: movedOnWords(ctx, party.id, moved.reason, moved.text, 'post') }
+          : moved;
       deps.log.info(
         { user: userId, guild, party: party.id, move: press, outcome: answer.kind },
         'a train was moved on the map',
@@ -870,20 +877,6 @@ const MANAGE_BODY = z
   })
   .strict();
 
-/** A choice of a dialog as the map's form shows it: its options' descriptions as their lines. */
-function formChoice(choice: DialogChoice): MapFormChoice {
-  return {
-    label: choice.label,
-    options: choice.options.map((option) => ({
-      value: option.value,
-      label: option.label,
-      ...(option.description === undefined ? {} : { line: option.description }),
-      ...(option.emoji === undefined ? {} : { emoji: option.emoji }),
-    })),
-    ...(choice.picked === undefined ? {} : { picked: choice.picked }),
-  };
-}
-
 /** A conductor's change carries whose the role was when the page drew its button. */
 const conductorBodySchema = z.object({ who: z.enum(CONDUCTOR_SEEN) }).strict();
 
diff --git a/src/web/train-views.ts b/src/web/train-views.ts
index c7e244129d91a234615380582c69b2957ef852d4..3716948a3b045c89b01aed1b8da4ae085f527c7d 100644
--- a/src/web/train-views.ts
+++ b/src/web/train-views.ts
@@ -1,14 +1,40 @@
 import type { AppContext } from '../app-context.js';
 import { trainRefusal } from '../commands/trains/train-changes.js';
-import type { MapMoveRefusal } from '../domain/web/party-data.js';
+import type { DialogChoice } from '../discord/dialog.js';
+import type { TrainParty } from '../domain/party/party.js';
+import type { MapMoveRefusal, MapMoves } from '../domain/web/party-data.js';
+import type { MapFormChoice } from '../domain/web/train-data.js';
+import { moveForm } from '../render/train-dialogs.js';
+import type { StopLookup } from '../render/train-stops.js';
 import { UNREACHABLE } from './acting.js';
 
 /*
  * A train's post's dialogs as the live map shows them (plan 8M-8C): made by the dialogs' own
- * builders and words, only put into the map's data here, their markdown made text of the page by
- * the caller's `words` (`pageWords`).
+ * builders (`moveForm`, `manageForm`, `splitForm` of `src/render/`) and words, only put into the
+ * map's data here, their markdown made text of the page by the caller's `words` (`pageWords`).
  */
 
+/** Move… of a train as the post's dialog draws it now, in the map's data (`MapMoves`). */
+export function movesOnTheMap(
+  stops: StopLookup,
+  party: TrainParty,
+  words: (text: string) => string,
+): MapMoves {
+  const form = moveForm({ party, stop: stops });
+  return {
+    title: form.title,
+    place: form.place,
+    text: words(form.text),
+    label: form.label,
+    moves: form.moves.map((offered) => ({
+      move: offered.move,
+      target: offered.target,
+      label: offered.label,
+      ...(offered.description === undefined ? {} : { line: offered.description }),
+    })),
+  };
+}
+
 /**
  * Why a member may not move a train on the map, in the words Discord says before Move… and
  * Manage… open (`manageRefusal`: `trainRefusal` of `mayNotMove`'s reason; review C1), also for a
@@ -21,3 +47,17 @@ export function refusalOnTheMap(
 ): string {
   return words(reason === 'read-only' ? UNREACHABLE : trainRefusal(ctx, reason));
 }
+
+/** A choice of a dialog as the map's form shows it: its options' descriptions as their lines. */
+export function formChoice(choice: DialogChoice): MapFormChoice {
+  return {
+    label: choice.label,
+    options: choice.options.map((option) => ({
+      value: option.value,
+      label: option.label,
+      ...(option.description === undefined ? {} : { line: option.description }),
+      ...(option.emoji === undefined ? {} : { emoji: option.emoji }),
+    })),
+    ...(choice.picked === undefined ? {} : { picked: choice.picked }),
+  };
+}
diff --git a/test/support/web.ts b/test/support/web.ts
index 79a5c287d95daacce9bf0d91ddde661210561b8a..24acc82b556d87c12f5c95b3a1a8d3138bcafa48 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -235,6 +235,9 @@ const NO_PARTIES: PartyWebDeps = {
   guilds: { idFor: () => Promise.resolve(undefined) },
   store: { active: () => [], get: () => undefined, raidAt: () => undefined },
   look: () => ({}),
+  stops: () => {
+    throw new Error('no trains in this test');
+  },
   layoutOf: () => undefined,
   titleOf: () => '',
   places: NO_PLACES,
@@ -289,6 +292,7 @@ export function partyWebWith(
     },
     store: made.store,
     look: (raid) => raidLook(made.service.view(raid)),
+    stops: made.service.stops,
     maxLook: (party) => maxLook(made.service.maxView(party)),
     layoutOf: (partyId) => made.service.layoutOf(partyId),
     titleOf: (party) => made.service.postTitle(party),
````

### Task 4: 8M-8C task 4: Split... on the map as the post's dialog

Prototype commit: `421bfb119fbf003498a6aa372facd265baa41836`

GET .../trains/<id>/split answers the dialog the member would be shown
now (splitForm, the dialog's own builder: the one group a member may
split, or for the conductor and staff the choice of the group that
leaves, nothing picked, with who is in each group a line each), the
member's privacy read as the dialog reads it; refused before it opens
in the dialog's words (splitRefusalFor, 422) and while the post
controls' window is full, uncounted. POST .../split { group, mark }
goes the dialog's way (splitGroupAs): one use in the post controls'
window, the new train named in the answer, a second Submit answered as
the dialog does, a group changed since 409 (GROUPS_CHANGED), a failed
split SPLIT_FAILED with its use given back.

Split... is a panel of CONTROLS now, which leaves PostControl without
its variant "Do this on Discord" (dropped). On the page Split... opens
as a form in the place of the post; after it the list shows both
trains, the old post's line linking the new.

**Files:**

```
 src/domain/web/party-data.ts            |  11 ++---
 src/domain/web/train-data.ts            |  23 +++++++++++
 src/render/post-view.test.ts            |   2 +-
 src/render/post-view.ts                 |   2 +-
 src/web/acting.ts                       |   8 ++--
 src/web/client/party-layer.ts           |   4 ++
 src/web/client/post-draw.test.ts        |  13 +++---
 src/web/client/post-draw.ts             |  23 ++++++-----
 src/web/client/post-forms-ui.ts         |  30 ++++++++++++--
 src/web/client/raid-ui.ts               |   8 ++--
 src/web/client/train-post-forms.test.ts |  46 ++++++++++++++++++++-
 src/web/client/train-post-forms.ts      |  32 ++++++++++++---
 src/web/train-routes.ts                 | 142 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/train-split.test.ts             | 338 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 14 files changed, 641 insertions(+), 41 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/post-view.test.ts src/web/client/post-draw.test.ts src/web/client/train-post-forms.test.ts src/web/train-split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 421bfb119fbf003498a6aa372facd265baa41836 -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8C task 4: Split... on the map as the post's dialog`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index b3f2a7a3a082f635be148a2d737b0753452e2e23..5bc4a7fdd800293657ab639fdcd6b205ff68243e 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -542,19 +542,20 @@ export const POST_ACCENTS = ['egg', 'hatched', 'ended', 'max', 'timed', 'other']
 export type PostAccent = (typeof POST_ACCENTS)[number];
 
 /** The panels of the map a post's button opens (`PostControl`). */
-export type PostPanel = 'group' | 'time' | 'meet' | 'moves' | 'manage' | 'route';
+export type PostPanel = 'group' | 'time' | 'meet' | 'moves' | 'manage' | 'route' | 'split';
 
 /**
  * What a button of a post does on the map (plan 8M-8A), decided on the server from its custom id
  * (no custom id reaches the page): a press the map makes as the post's button does (`MAP_ACTIONS`,
- * `MAP_REMOTE`, or since plan 8M-8B `MAP_COUNTS`), one of the map's panels, "Do this on Discord"
- * (a dialog the map has no form for: Split…), the note that the raid was reported from a screenshot (in the
- * place of Screenshot feedback, whose feedback stays on Discord), or nothing.
+ * `MAP_REMOTE`, or since plan 8M-8B `MAP_COUNTS`), one of the map's panels or forms (since plan
+ * 8M-8C every dialog of a post has one: the variant "Do this on Discord" is gone, R8), the note
+ * that the raid was reported from a screenshot (in the place of Screenshot feedback, whose feedback
+ * stays on Discord), or nothing. A panel the member may not use says why, or sends them to the post
+ * (`data-on-discord` of the page).
  */
 export type PostControl =
   | { kind: 'press'; action: MapAction | typeof MAP_REMOTE | MapCount }
   | { kind: 'panel'; panel: PostPanel }
-  | { kind: 'discord' }
   | { kind: 'screenshot' }
   | { kind: 'none' };
 
diff --git a/src/domain/web/train-data.ts b/src/domain/web/train-data.ts
index bebf6d0110a6a45fcad600b7be112024fe3e9684..b2f258bd00acc3f424213ddb85f737ade735a058 100644
--- a/src/domain/web/train-data.ts
+++ b/src/domain/web/train-data.ts
@@ -68,6 +68,29 @@ export interface MapManage {
   shown: ManageShownBody;
 }
 
+/**
+ * Split… on the map (plan 8M-8C, `GET /s/<guild>/api/trains/<id>/split`), as the post's dialog is
+ * drawn now for the member (`splitForm`): its title, its text as text of the page (what becomes
+ * of the group, who moves and who leads; with several, who is in each group, a line each), and
+ * either the one group it asks about with its mark (`only`: Submit splits it) or the choice of
+ * the group that leaves (`choice`, nothing picked; each value `<group>:<mark>`).
+ */
+export interface MapSplit {
+  title: string;
+  text: string;
+  only?: { group: string; mark: string };
+  choice?: MapFormChoice;
+}
+
+/**
+ * The Submit of Split… on the map (`POST …/split`): the group by its letter and the mark the form
+ * was drawn with (`groupMark`), so that a group called otherwise or gone since is refused.
+ */
+export interface SplitBody {
+  group: string;
+  mark: string;
+}
+
 /**
  * The Submit of Manage… on the map (`POST …/manage`): what it showed, and what is picked (the
  * route left out where the form had none, the mode for a train without a route).
diff --git a/src/render/post-view.test.ts b/src/render/post-view.test.ts
index a6434ed01865c96ad8d8988bbaddbeaa0e20f903..3c9a34d959c71bcfa9d0f95346901df211a014df 100644
--- a/src/render/post-view.test.ts
+++ b/src/render/post-view.test.ts
@@ -199,7 +199,7 @@ describe('postView: the controls', () => {
     expect(third?.map((button) => [button.label, button.does])).toEqual([
       ['Move…', { kind: 'panel', panel: 'moves' }],
       ['Manage…', { kind: 'panel', panel: 'manage' }],
-      ['Split…', { kind: 'discord' }],
+      ['Split…', { kind: 'panel', panel: 'split' }],
       ['Route', { kind: 'panel', panel: 'route' }],
     ]);
   });
diff --git a/src/render/post-view.ts b/src/render/post-view.ts
index 28773753f1c0e04927d09813addb40511a39e616..163432cd98eac5fd95fa663ca26b37ef1fca0968 100644
--- a/src/render/post-view.ts
+++ b/src/render/post-view.ts
@@ -114,7 +114,7 @@ export const CONTROLS: Partial<Readonly<Record<PartyAction, PostControl>>> = {
   less: { kind: 'press', action: 'less' },
   more: { kind: 'press', action: 'more' },
   meet: { kind: 'panel', panel: 'meet' },
-  split: { kind: 'discord' },
+  split: { kind: 'panel', panel: 'split' },
   shot: { kind: 'screenshot' },
 };
 
diff --git a/src/web/acting.ts b/src/web/acting.ts
index abcf6b727a97619893c880eda61a00dccb76dec0..5bbb35a8c864ff45fbe0cc17261a3c5161b0f8ca 100644
--- a/src/web/acting.ts
+++ b/src/web/acting.ts
@@ -136,16 +136,18 @@ export function isMapBotStaff(
 /**
  * Gives back a use `throttledOnTheMap` counted in a command's window, as the router gives back
  * the use of a command whose work failed unexpectedly (plan 8S-3: a meetup whose post Discord
- * refused), to the window open at `countedAt` (when it was counted) only.
+ * refused), to the window open at `countedAt` (when it was counted) only. `window` is the window's
+ * key, or what `throttledOnTheMap` counted in (`MapThrottleKey`, the router's key made of it).
  */
 export function givenBackOnTheMap(
   deps: WebDeps,
-  command: string,
+  window: string | MapThrottleKey,
   userId: string,
   throttle: Throttle,
   countedAt: number,
 ): void {
-  deps.parties.throttles.giveBack(command, userId, throttle, deps.now(), countedAt);
+  const key = typeof window === 'string' ? window : windowOf(window, throttle);
+  deps.parties.throttles.giveBack(key, userId, throttle, deps.now(), countedAt);
 }
 
 /** The router's window a write on the map counts in: a command's (its name) or a control's. */
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index f801e249b1e9393f68780d851d07e04bc8c470ce..190d1246a9a309c928fe07c856b3cee86c3d558a 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -659,6 +659,10 @@ export function showParties(
         // Meet… (plan 8M-8B): its form, from what the server offers now.
         const party = partyById(target.dataset.meet);
         if (party) postForms.meetClicked(target, party);
+      } else if (target.dataset.splitTrain !== undefined) {
+        // A train's Split… (plan 8M-8C): the post's dialog as a form in the place of the post.
+        const party = partyById(target.dataset.splitTrain);
+        if (party) postForms.splitClicked(target, party);
       } else if (target.dataset.manageTrain !== undefined) {
         // A train's Manage… (plan 8M-8C): the post's dialog as a form in the place of the post.
         const party = partyById(target.dataset.manageTrain);
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index 47144651b1fa08c18e626d1af71c7a3761948416..2c805fe7154938e8cea541f75e5dbb977b909c97 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -150,7 +150,7 @@ const VIEW: PostView = {
           }),
         ],
         [
-          button({ name: '+1', emoji: { name: '⬆️' }, does: { kind: 'discord' } }),
+          button({ name: '+1', emoji: { name: '⬆️' }, does: { kind: 'press', action: 'more' } }),
           button({ name: 'Set time…', label: 'Set time…', does: { kind: 'panel', panel: 'time' } }),
           button({ name: 'Group…', label: 'Group…', does: { kind: 'panel', panel: 'group' } }),
           button({
@@ -286,9 +286,6 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
     expect(plain.find((one) => one.text === 'Group…')?.attributes).toMatchObject({
       disabled: '',
     });
-    expect(plain.find((one) => one.attributes?.['aria-label'] === '+1')?.attributes).toHaveProperty(
-      'data-on-discord',
-    );
     const mayChange = raid({
       mayChange: true,
       attendance: attendance({
@@ -498,7 +495,7 @@ describe('postCard: a post drawn as Discord draws it (plan 8M-8A)', () => {
 
   it('turns nothing on while the map is read-only', () => {
     const readOnly = raid({
-      attendance: attendance({ actions: [], remote: { offered: false, on: false } }),
+      attendance: attendance({ actions: [], remote: { offered: false, on: false }, count: false }),
     });
     const presses = buttonsOf(postCard(VIEW, readOnly, context)).filter(
       (one) => one.attributes?.['data-action'],
@@ -616,7 +613,7 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
                 does: { kind: 'panel', panel: 'manage' },
               }),
               button({ name: 'Route', label: 'Route', does: { kind: 'panel', panel: 'route' } }),
-              button({ name: 'Split…', label: 'Split…', does: { kind: 'discord' } }),
+              button({ name: 'Split…', label: 'Split…', does: { kind: 'panel', panel: 'split' } }),
             ],
           ],
         },
@@ -639,6 +636,10 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
     expect(buttons.find((one) => one.text === 'Route')?.attributes).toMatchObject({
       'data-toggle': 'route',
     });
+    // Split… is the map's form of the post's dialog (plan 8M-8C), which asks the server first.
+    expect(buttons.find((one) => one.text === 'Split…')?.attributes).toMatchObject({
+      'data-split-train': 't1',
+    });
     // The conductor's part is the member's own, outside Manage… (R2), as `/conductor` is.
     expect(byClass(popup, 'manage')).toEqual([]);
     const mine = byClass(popup, 'mine-part')[0];
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index 4855523c4ae2623f02788e338d7328eb980cf0dd..4c60f1bee1ad58e08709777bace8a2211d48d280 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -1,6 +1,7 @@
 import type {
   MapParty,
   PostButtonView,
+  PostPanel,
   PostLine,
   PostNode,
   PostView,
@@ -164,7 +165,7 @@ function pressable(party: MapParty, action: string): boolean {
  */
 function panelAttributes(
   party: MapParty,
-  panel: 'group' | 'time' | 'meet' | 'moves' | 'manage' | 'route',
+  panel: PostPanel,
 ): Record<string, string> | 'off' | undefined {
   switch (panel) {
     case 'meet':
@@ -211,6 +212,11 @@ function panelAttributes(
         : undefined;
     case 'route':
       return party.kind === 'train' ? { 'data-toggle': 'route' } : undefined;
+    case 'split':
+      // Split…'s form (plan 8M-8C), which asks the server first and says its refusal, as the
+      // dialog does before it opens; nothing while read-only.
+      if (party.kind !== 'train') return undefined;
+      return party.moveRefusal?.reason === 'read-only' ? 'off' : { 'data-split-train': party.id };
   }
 }
 
@@ -248,13 +254,11 @@ export function whyNot(party: MapParty, button: string): string {
   return button === 'manage' && refused.reason === 'no-route' ? '' : refused.text;
 }
 
-const ON_DISCORD = { 'data-on-discord': '', 'data-why': '' };
-
 /**
  * A button of a post as Discord draws it (its style, its icon, its label), named for a reader and
  * a screen reader (`aria-label`, `title`), and what it does on the map: a press (off while the
- * member may not press it now), one of the map's panels, "Do this on Discord" (`data-on-discord`,
- * which shows the post's link), or the screenshot's note in its place.
+ * member may not press it now), one of the map's panels or forms (where the member may not use it,
+ * why not, or the post's link: `data-on-discord`), or the screenshot's note in its place.
  */
 function controlNode(button: PostButtonView, party: MapParty, context: PostDrawContext): PageNode {
   const { does } = button;
@@ -267,8 +271,7 @@ function controlNode(button: PostButtonView, party: MapParty, context: PostDrawC
       attributes: href === undefined ? {} : { href, ...NEW_TAB },
     };
   }
-  // The words of the link the line shows (`data-link`, review N-4), which the page reads.
-  let doing: Record<string, string> = { ...ON_DISCORD, 'data-link': discordLink(party, '') };
+  let doing: Record<string, string> = {};
   let on = !button.disabled;
   if (does.kind === 'press') {
     doing = { 'data-party': party.id, 'data-action': does.action };
@@ -278,17 +281,17 @@ function controlNode(button: PostButtonView, party: MapParty, context: PostDrawC
     // `formControls` would turn back on.
     const attributes = button.disabled ? 'off' : panelAttributes(party, does.panel);
     if (attributes === 'off') {
-      doing = {};
       on = false;
     } else {
+      // Why not, or the post's link: the words of the link the line shows (`data-link`,
+      // review N-4), which the page reads.
       doing = attributes ?? {
         'data-on-discord': does.panel,
         'data-why': whyNot(party, does.panel),
         'data-link': discordLink(party, does.panel),
       };
     }
-  } else if (does.kind === 'none') {
-    doing = {};
+  } else {
     on = false;
   }
   const src = button.emoji?.src === undefined ? undefined : safeSrc(button.emoji.src);
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index e32178184b334b7fa024ff8df0d592a4a1be5a5f..db344ecfab54ac04eac433daa059645ec0d9bd4d 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -1,6 +1,13 @@
 import type { MapMeet, MapParty, MapReport } from '../../domain/web/party-data.js';
-import type { MapManage } from '../../domain/web/train-data.js';
-import { manageBody, manageForm, moveBody, moveForm } from './train-post-forms.js';
+import type { MapManage, MapSplit } from '../../domain/web/train-data.js';
+import {
+  manageBody,
+  manageForm,
+  moveBody,
+  moveForm,
+  splitBody,
+  splitForm,
+} from './train-post-forms.js';
 import { getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import { renderNode, type PageNode } from './popup.js';
@@ -282,6 +289,23 @@ export function postFormsUi(deps: PostFormsDeps) {
       });
     },
 
+    /**
+     * A train's Split… (plan 8M-8C): the dialog the member would be shown now (`GET
+     * …/trains/<id>/split`), or why not. A refusal closes it (its groups may have changed) and the
+     * list is asked for again; once split, the list shows both trains.
+     */
+    splitClicked(button: HTMLButtonElement, party: MapParty): void {
+      void open(button, 'split', party, async () => {
+        const split = await asked<MapSplit>(party.id, 'split');
+        if ('refused' in split) return split;
+        return {
+          form: splitForm(party.id, split),
+          bodyOf: (fields) => splitBody(split, fields),
+          refusalCloses: true as const,
+        };
+      });
+    },
+
     /** Meet…: its form, from what the server offers now (`GET …/meet`), or why not. */
     meetClicked(button: HTMLButtonElement, party: MapParty): void {
       void open(button, 'meet', party, async () => {
@@ -308,7 +332,7 @@ interface Opened {
 const NOT_OPENED = 'That did not get through; try again.';
 
 /** The forms of a train's post (plan 8M-8C), whose addresses are the trains'. */
-const TRAIN_FORMS: ReadonlySet<string> = new Set(['move', 'manage']);
+const TRAIN_FORMS: ReadonlySet<string> = new Set(['move', 'manage', 'split']);
 
 /** Where a form's control is: `/api/trains/<id>/…` for a train's, else `/api/parties/<id>/…`. */
 function partiesOf(control: string): 'trains' | 'parties' {
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 21aa59fd20ccfded40cb00680500dcac45125ed0..4551cd01b2d215c60750f54396c2eedc17a5346a 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -48,15 +48,15 @@ export interface RaidUiDeps {
 
 /**
  * The controls that open a form ("Report raid", "Change…", "Report spawn here", and of trains
- * "New train", "Edit route", "Move…", "Manage…", and of meetups "New meetup", "Meetup here",
- * "Edit…") under `root`, on or off; with them the choices of a gym's raids, which draw the popup
- * or phone card anew (review W-3).
+ * "New train", "Edit route", "Move…", "Manage…", "Split…", and of meetups "New meetup", "Meetup
+ * here", "Edit…") under `root`, on or off; with them the choices of a gym's raids, which draw the
+ * popup or phone card anew (review W-3).
  */
 export function formControls(root: ParentNode, on: boolean): void {
   for (const button of root.querySelectorAll<HTMLButtonElement>(
     'button[data-report], button[data-change-raid], button[data-spawn], button[data-show-raid], ' +
       'button[data-new-train], button[data-route-train], button[data-move-train], ' +
-      'button[data-manage-train], ' +
+      'button[data-manage-train], button[data-split-train], ' +
       'button[data-new-meetup], button[data-meetup-here], button[data-edit-meetup], ' +
       'button[data-regroup], button[data-meet], button[data-close-party], ' +
       'button[data-report-party]',
diff --git a/src/web/client/train-post-forms.test.ts b/src/web/client/train-post-forms.test.ts
index 01e24c300c242cdd4c82e30b736059903292e325..963bed6dc86ba0466a3c8af7b8f30186319ae589 100644
--- a/src/web/client/train-post-forms.test.ts
+++ b/src/web/client/train-post-forms.test.ts
@@ -1,9 +1,16 @@
 import { describe, expect, it } from 'vitest';
 import type { MapMoves } from '../../domain/web/party-data.js';
-import type { MapManage } from '../../domain/web/train-data.js';
+import type { MapManage, MapSplit } from '../../domain/web/train-data.js';
 import type { PageNode } from './popup.js';
 import { sendPostForm } from './post-forms.js';
-import { manageBody, manageForm, moveBody, moveForm } from './train-post-forms.js';
+import {
+  manageBody,
+  manageForm,
+  moveBody,
+  moveForm,
+  splitBody,
+  splitForm,
+} from './train-post-forms.js';
 
 /** Every node of a tree, depth first. */
 function all(node: PageNode): PageNode[] {
@@ -181,6 +188,41 @@ describe('Move… on the map (plan 8M-8C, R1)', () => {
   });
 });
 
+describe('Split… on the map (plan 8M-8C)', () => {
+  const several: MapSplit = {
+    title: 'Split a group off the train',
+    text: 'The group you pick leaves Loop…\n\nGroup A (2 trainers): Ash, Misty\nGroup B (Fast) (2 trainers): Alice, Bob',
+    choice: {
+      label: 'Group that leaves',
+      options: [
+        { value: 'A:1.x', label: 'Group A · 2 trainers' },
+        { value: 'B:2.y', label: 'Group B (Fast) · 2 trainers' },
+      ],
+    },
+  };
+
+  it('asks which group leaves as the dialog does, nothing picked: it is picked on purpose', () => {
+    const form = splitForm('t1', several);
+    expect(form.attributes).toMatchObject({ 'data-form': 'split', 'data-party': 't1' });
+    expect(all(form).find((one) => one.tag === 'h4')?.text).toBe('Split a group off the train');
+    expect(all(form).find((one) => one.className === 'form-text')?.text).toBe(several.text);
+    expect(radios(form, 'group')).toEqual(['A:1.x', 'B:2.y']);
+    expect(splitBody(several, { group: 'B:2.y' })).toEqual({ body: { group: 'B', mark: '2.y' } });
+    expect(splitBody(several, {})).toEqual({ text: 'Pick the group that leaves first.' });
+  });
+
+  it('asks nothing of the one group a member may split: the text says what Submit does', () => {
+    const one: MapSplit = {
+      title: 'Split a group off the train',
+      text: 'Group B (Fast) leaves Loop…\n\nSubmit splits it off.',
+      only: { group: 'B', mark: '2.y' },
+    };
+    const form = splitForm('t1', one);
+    expect(radios(form, 'group')).toEqual([]);
+    expect(splitBody(one, {})).toEqual({ body: { group: 'B', mark: '2.y' } });
+  });
+});
+
 describe('a train form’s answer (sendPostForm)', () => {
   it('takes a 409 that gives the train as it is now for a refusal, not for a train that is over', async () => {
     const stale = await sendPostForm('t', {
diff --git a/src/web/client/train-post-forms.ts b/src/web/client/train-post-forms.ts
index 04a204ddb4725d02307b212690d47c2704b3c24d..056cb1283a105d927d2da11fa6cd03f9b2ca12de 100644
--- a/src/web/client/train-post-forms.ts
+++ b/src/web/client/train-post-forms.ts
@@ -1,15 +1,15 @@
 import type { MapMoves } from '../../domain/web/party-data.js';
-import type { MapFormChoice, MapManage } from '../../domain/web/train-data.js';
+import type { MapFormChoice, MapManage, MapSplit } from '../../domain/web/train-data.js';
 import { MAP_AT_ENDS, MAP_TRAIN_KINDS } from '../../domain/web/train-data.js';
 import type { PageNode } from './popup.js';
 import { dialogForm, radioChoice, type PostFormBody } from './post-forms.js';
 
 /**
  * A train's post's dialogs as forms of the live map (plan 8M-8C), the parts that need no DOM:
- * Manage… (and, with the next tasks, Move… and Split…), drawn in Discord's dialog look in the
- * place of the post as the forms of plan 8M-8B are (`dialogForm`), and their bodies. What the
- * dialog says, offers and picks to start with is the server's (`manageForm` of
- * `src/render/train-dialogs.ts`, the dialog's own builder); the page only draws it.
+ * Move…, Manage… and Split…, drawn in Discord's dialog look in the place of the post as the forms
+ * of plan 8M-8B are (`dialogForm`), and their bodies. What a dialog says, offers and picks to
+ * start with is the server's (`moveForm`, `manageForm` of `src/render/train-dialogs.ts` and
+ * `splitForm` of `src/render/train-split.ts`, the dialogs' own builders); the page only draws it.
  */
 
 /**
@@ -82,6 +82,28 @@ export function moveBody(moves: MapMoves, fields: Record<string, string>): PostF
   return { path: `move/${picked.move}`, body: { from: moves.place, target: picked.target } };
 }
 
+/**
+ * Split…'s form (plan 8M-8C), as the post's dialog: its text (what becomes of the group, who moves
+ * and who leads; with several, who is in each group, a line each), and for the conductor and staff
+ * "Group that leaves" with nothing picked (it is picked on purpose, as on Discord); for the one
+ * group a member may split, no choice: the text ends with what Submit does.
+ */
+export function splitForm(trainId: string, split: MapSplit): PageNode {
+  return dialogForm('split', trainId, split.title, [
+    { tag: 'p', className: 'form-text', text: split.text },
+    ...(split.choice === undefined ? [] : [choiceOf('group', split.choice)]),
+  ]);
+}
+
+/** The body of Split…'s Submit: the group by its letter and the mark the form was drawn with. */
+export function splitBody(split: MapSplit, fields: Record<string, string>): PostFormBody {
+  if (split.only !== undefined) return { body: { ...split.only } };
+  const picked = split.choice?.options.find((option) => option.value === fields.group)?.value;
+  const at = picked?.indexOf(':') ?? -1;
+  if (picked === undefined || at < 1) return { text: 'Pick the group that leaves first.' };
+  return { body: { group: picked.slice(0, at), mark: picked.slice(at + 1) } };
+}
+
 const ROUTE_WAYS = ['keep', 'reverse', 'finish'] as const;
 
 /**
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index ad034d70639877108e5e02dbed0185c2b843066c..6ba000a1f04754e85dfcf2ad6f0bb5d1f30ca592 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -11,6 +11,7 @@ import {
   clearConductorAs,
   clearRouteAs,
   forgetRouteAs,
+  GROUPS_CHANGED,
   loadRouteAs,
   manageRefusal,
   manageTrainAs,
@@ -21,15 +22,22 @@ import {
   removeStopAs,
   saveRouteAs,
   setConductorAs,
+  SPLIT_FAILED,
+  splitGroupAs,
+  splitRefusal,
+  splitRefusalFor,
   startTrainAs,
   trainPlaces,
   trainRefusal,
   type ConductorNamer,
+  type SplitAnswer,
   type TrainAnswer as TrainChangeAnswer,
   type TrainManaging,
   type TrainStarting,
 } from '../commands/trains/train-changes.js';
 import { manageForm, ROUTE_CHOICES } from '../render/train-dialogs.js';
+import { splitForm } from '../render/train-split.js';
+import { RaidPrivacy } from '../domain/party/status.js';
 import { formChoice, movesOnTheMap, refusalOnTheMap } from './train-views.js';
 import { NO_START_TO_REMOVE, TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
 import type { Region } from '../db/repositories/region-repository.js';
@@ -38,6 +46,7 @@ import type { MemberStanding } from '../discord/member-directory.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
 import {
   attendeeOf,
+  isGroupId,
   isTrain,
   MAX_PARTY_NAME,
   MAX_ROUTE_STOPS,
@@ -53,6 +62,9 @@ import {
   mayNotClear,
   mayNotLoad,
   mayNotMove,
+  mayNotSplit,
+  groupMark,
+  splittableGroups,
 } from '../domain/party/train.js';
 import type { MapTrain } from '../domain/web/party-data.js';
 import { mapParty } from '../domain/web/party-view.js';
@@ -63,6 +75,7 @@ import {
   ROUTE_EDITS,
   type ConductorChange,
   type MapManage,
+  type MapSplit,
   type PanelPress,
   type RouteEdit,
   type SavedRoutesView,
@@ -70,7 +83,7 @@ import {
 } from '../domain/web/train-data.js';
 import { problemText } from '../render/activity.js';
 import { PARTY_KIND } from '../render/party-controls.js';
-import { timestamp } from '../render/text.js';
+import { plain, timestamp } from '../render/text.js';
 import type { Member } from '../services/attendance-service.js';
 import {
   actingOnTheMap,
@@ -224,6 +237,7 @@ const STALE: ReadonlySet<PartyProblem> = new Set([
   'route-changed',
   'train-moved-on',
   'conductor-changed',
+  'group-changed',
 ]);
 
 /** The address of a train's route edit, saved routes, move or conductor. */
@@ -766,6 +780,121 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     },
   );
 
+  /**
+   * How a split's answer names the new train (plan 8M-8C): by the name of the train in that post
+   * (`Split off: Saturday legendaries (Fast)`), as the dialog names its post.
+   */
+  const splitNames: ReportNames = {
+    ...names,
+    post: (postId) => {
+      const made = parties.store.active().find((one) => one.forumPostId === postId);
+      return made && isTrain(made) ? `**${plain(made.timed.name)}**` : undefined;
+    },
+  };
+
+  // Split… on the map (plan 8M-8C): the form opens with the dialog the member would be shown now
+  // (`splitForm`: one group, the one they may split, or the choice of those they may split, for
+  // the conductor and staff, `splittableGroups`), the member's privacy read as the dialog reads it;
+  // refused before it opens as the dialog is (`splitRefusalFor`, 422 in its words) and while the
+  // window of the post's controls is full, counting nothing. Its Submit sends the group and the
+  // mark it was drawn with and goes the dialog's way (`splitGroupAs`): one use in the window of
+  // the post's controls; a group called otherwise or gone since 409 (`GROUPS_CHANGED`), a split
+  // that fails `SPLIT_FAILED` (500) with its use given back, a post the bot could not make 422
+  // with its use given back.
+  scope.get(
+    '/api/trains/:party/split',
+    { onRequest: limitedPerAddress(formLimiter, { now: deps.now }) },
+    async (request: TrainRequest, reply) => {
+      const opened = await opening(request, reply, 'opened Split…');
+      if ('sent' in opened) return opened.sent;
+      const { userId, staff, party } = opened;
+      const [first, ...rest] = splittableGroups(party, userId, staff);
+      if (first === undefined) {
+        return reply.code(422).send({ error: words(splitRefusalFor(ctx, party, userId, staff)) });
+      }
+      const settings = await ctx.users.get(userId);
+      const form = splitForm(
+        {
+          ...trainPlaces(ctx, party),
+          memberId: userId,
+          staff,
+          anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
+          now: deps.now(),
+        },
+        [first, ...rest],
+      );
+      const view: MapSplit = {
+        title: form.title,
+        text: words(form.text),
+        ...(form.only === undefined ? {} : { only: form.only }),
+        ...(form.choice === undefined
+          ? {}
+          : { choice: { label: form.choice.label, options: form.choice.options } }),
+      };
+      return view;
+    },
+  );
+  scope.post(
+    '/api/trains/:party/split',
+    { onRequest: writeGuards },
+    async (request: TrainRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const body = SPLIT_BODY.safeParse(request.body ?? {});
+      if (!body.success || !isGroupId(body.data.group)) return sendFailure(request, reply, 400);
+      const { group, mark } = body.data;
+      const writing = await trainWrite(request, reply, session.userId, 'split a train');
+      if ('sent' in writing) return writing.sent;
+      const { userId, member, standing, row, party } = writing;
+      const { guild } = request.params;
+      const staff = isMapStaff(standing, userId, parties.ownerId);
+      // Who may not split the group as the form drew it (`mayNotSplit`'s `not-in-group` and
+      // `conductor-in-group`) is refused before anything is counted, 403 with the train (review C3,
+      // as Manage…'s Submit refuses who may not move the train). What the train is now refuses by
+      // the dialog's counted way (`splitGroupAs`, 422; re-review N2: Discord's Submit counts it),
+      // as does a group drawn otherwise, which says where a group that went since went.
+      if (groupMark(party, group) === mark) {
+        const problem = mayNotSplit(party, userId, staff, group);
+        if (problem === 'not-in-group' || problem === 'conductor-in-group') {
+          const train = viewOf(guild, row, party, userId, standing);
+          return refuse(reply, 403, splitRefusal(ctx, party, problem, group), train);
+        }
+      }
+      const counted = { control: PARTY_KIND };
+      const throttled = throttledOnTheMap(deps, reply, counted, userId, ACTION_THROTTLE);
+      if (throttled) return throttled;
+      const countedAt = deps.now();
+      let split: SplitAnswer;
+      try {
+        split = await countedOnTheMap(deps, counted, userId, ACTION_THROTTLE, () =>
+          splitGroupAs(ctx, { party, member, group, staff, drawn: mark }, splitNames),
+        );
+      } catch (err) {
+        // The use went back (`countedOnTheMap`); the member is told nothing was split off.
+        deps.log.error({ err, guild, party: party.id }, 'a split on the map failed');
+        const failed: TrainAnswer = { ok: false, text: SPLIT_FAILED };
+        return reply.code(500).send(failed);
+      }
+      deps.log.info(
+        { user: userId, guild, party: party.id, outcome: split.kind },
+        'a train was split on the map',
+      );
+      if (split.kind === 'refused' && split.givesBack === true) {
+        givenBackOnTheMap(deps, counted, userId, ACTION_THROTTLE, countedAt);
+      }
+      const answer: TrainChangeAnswer =
+        split.kind === 'split' || split.kind === 'already'
+          ? { kind: 'ok', text: split.text }
+          : split.kind === 'gone'
+            ? split
+            : split.reason === 'group-changed'
+              ? { kind: 'refused', text: GROUPS_CHANGED, reason: 'group-changed' }
+              : { kind: 'refused', text: split.text };
+      return answered(reply, guild, row, party.id, userId, standing, answer);
+    },
+  );
+
   // Taking the conductor role or giving it up (spec 3.7), as `/conductor set` and `/conductor
   // clear` do: the per-address limit, the guard of every POST and a change the map knows (404),
   // the session (403), the body (whose the role was when the page drew the button; 400), the
@@ -880,6 +1009,17 @@ const MANAGE_BODY = z
 /** A conductor's change carries whose the role was when the page drew its button. */
 const conductorBodySchema = z.object({ who: z.enum(CONDUCTOR_SEEN) }).strict();
 
+/**
+ * The body of Split…'s Submit (plan 8M-8C): the group by its letter and the mark the form was
+ * drawn with (`groupMark`, `<stamp>.<hash>`); anything else is malformed.
+ */
+const SPLIT_BODY = z
+  .object({
+    group: z.string().regex(/^[A-E]$/u),
+    mark: z.string().min(1).max(40),
+  })
+  .strict();
+
 function isPanelPress(value: string): value is PanelPress {
   return (PANEL_PRESSES as readonly string[]).includes(value);
 }
diff --git a/src/web/train-split.test.ts b/src/web/train-split.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..333e29f707938a71d4874c618e70d494fbfcd086
--- /dev/null
+++ b/src/web/train-split.test.ts
@@ -0,0 +1,338 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER, stops } from '../../test/support/parties.js';
+import { createdTrain } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  TEST_OWNER_ID,
+  trainWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { ACTION_THROTTLE } from '../commands/parties/reply.js';
+import { controlThrottleKey } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { attendeeOf, isTrain } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { PartiesView } from '../domain/web/party-data.js';
+import type { MapSplit, TrainAnswer } from '../domain/web/train-data.js';
+import { PARTY_KIND } from '../render/party-controls.js';
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+const DAVE = '200000000000000005';
+
+/**
+ * A train on stop 2 of 3 (Veterans Memorial Bridge, The Stacks, Harbor Lighthouse Mural) with the
+ * maker and Carol in A, and group B (Fast): Alice opened it, Bob is in it; on the map with them,
+ * Dave (a member not on the train) and the bot's owner (staff).
+ */
+async function splitting(options: { throttles?: Throttles } = {}) {
+  const made = await createdTrain({ route: stops(4, 1, 7) });
+  const { id } = made.party;
+  await made.trains.move(id, { id: REPORTER }, 'next', true);
+  await made.attendance.signUp(id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
+  await made.attendance.newGroup(id, { id: ALICE, name: 'Alice' });
+  await made.attendance.labelGroup(id, { id: ALICE, name: 'Alice' }, 'Fast');
+  await made.attendance.joinGroup(id, { id: BOB, name: 'Bob' }, 'B');
+  await made.attendance.flush();
+  await made.service.flush();
+  const throttles = options.throttles ?? new Throttles();
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    trains: made.trains,
+    parties: made.store,
+    regions: made.regions,
+    users: made.users,
+  });
+  const members = new FakeMemberDirectory();
+  const acting = new FakeActingMembers();
+  for (const [userId, name] of [
+    [ALICE, 'Alice'],
+    [BOB, 'Bob'],
+    [CAROL, 'Carol'],
+    [DAVE, 'Dave'],
+    [REPORTER, 'Reporter'],
+    [TEST_OWNER_ID, 'Owner'],
+  ] as const) {
+    members.add(userId, name);
+    acting.add(userId, name);
+  }
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    trains: trainWebWith(ctx),
+  });
+  web.clock.now = PARTY_NOW;
+  const url = `/s/${FAKE_GUILD_ID}/api/trains/${id}/split`;
+  const names: Record<string, string> = {
+    [ALICE]: 'Alice',
+    [BOB]: 'Bob',
+    [CAROL]: 'Carol',
+    [DAVE]: 'Dave',
+    [REPORTER]: 'Reporter',
+    [TEST_OWNER_ID]: 'Owner',
+  };
+  /** Opens Split… as this member (`GET …/split`). */
+  const open = async (userId = ALICE) => {
+    const answer = await web.app.inject({
+      url,
+      headers: { cookie: await web.loggedIn(userId, names[userId] ?? 'Somebody') },
+    });
+    return { status: answer.statusCode, json: answer.json<MapSplit & { error?: string }>() };
+  };
+  /** Submits Split… as this member. */
+  const submit = async (body: object, userId = ALICE) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url,
+      headers: {
+        ...(await web.posting(userId, names[userId] ?? 'Somebody')),
+        'content-type': 'application/json',
+      },
+      payload: JSON.stringify(body),
+    });
+    return { status: answer.statusCode, json: answer.json<TrainAnswer & { error?: string }>() };
+  };
+  /** The trains a member sees in the list. */
+  const listed = async (userId = ALICE) => {
+    const cookie = await web.loggedIn(userId, names[userId] ?? 'Somebody');
+    const answer = await web.app.inject({
+      url: `/s/${FAKE_GUILD_ID}/api/parties`,
+      headers: { cookie },
+    });
+    return answer.json<PartiesView>().trains;
+  };
+  return { made, web, throttles, open, submit, listed };
+}
+
+describe('Split… of a train on the map (plan 8M-8C)', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("opens for a member of a group with the dialog of that group alone, in the dialog's words", async () => {
+    const map = await splitting();
+    web = map.web;
+    const opened = await map.open();
+    expect(opened.status).toBe(200);
+    expect(opened.json).toMatchObject({
+      title: 'Split a group off the train',
+      only: { group: 'B' },
+    });
+    expect(opened.json.choice).toBeUndefined();
+    expect(opened.json.text.split('\n')).toEqual([
+      'Group B (Fast) leaves Saturday legendaries and becomes a train of its own, Saturday ' +
+        'legendaries (Fast):',
+      '- the same route, at the same stop (stop 2 of 3: The Stacks), the same end mode, boss ' +
+        'and start',
+      '- Alice and Bob move to it as they are signed up now',
+      '- you are its conductor',
+      '',
+      'Submit splits it off.',
+    ]);
+  });
+
+  it('opens for staff with the dialog that asks which group leaves, who is in each named, nothing picked', async () => {
+    const map = await splitting();
+    web = map.web;
+    const opened = await map.open(TEST_OWNER_ID);
+    expect(opened.status).toBe(200);
+    expect(opened.json.only).toBeUndefined();
+    expect(opened.json.choice).toMatchObject({
+      label: 'Group that leaves',
+      options: [
+        { value: expect.stringMatching(/^A:/) as unknown, label: 'Group A · 2 trainers' },
+        { value: expect.stringMatching(/^B:/) as unknown, label: 'Group B (Fast) · 2 trainers' },
+      ],
+    });
+    expect(opened.json.text).toContain('Group B (Fast) (2 trainers): Alice, Bob');
+  });
+
+  it("refuses before it opens who may split no group, in the dialog's words, uncounted", async () => {
+    const throttles = new Throttles();
+    const map = await splitting({ throttles });
+    web = map.web;
+    const dave = await map.open(DAVE);
+    expect(dave).toMatchObject({
+      status: 422,
+      json: {
+        error: "Only a group's members, the conductor and the moderators can split a group off.",
+      },
+    });
+    expect(
+      throttles.use(controlThrottleKey(PARTY_KIND), DAVE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
+    ).toBeUndefined();
+  });
+
+  it('splits the group off into a train of its own, which the list shows beside the old one, counted once', async () => {
+    const throttles = new Throttles();
+    const map = await splitting({ throttles });
+    web = map.web;
+    const { json: split } = await map.open();
+    const done = await map.submit({ group: 'B', mark: split.only?.mark });
+    expect(done.status).toBe(200);
+    expect(done.json).toMatchObject({
+      ok: true,
+      text: 'Split off: Saturday legendaries (Fast)',
+    });
+    const old = map.made.current();
+    expect(old.groups.map((group) => group.id)).toEqual(['A']);
+    expect(attendeeOf(old, ALICE)).toBeUndefined();
+    const trains = await map.listed();
+    expect(trains.map((train) => train.name).sort()).toEqual([
+      'Saturday legendaries',
+      'Saturday legendaries (Fast)',
+    ]);
+    const added = map.made.store.active().find((party) => party.id !== old.id);
+    expect(added && isTrain(added) && attendeeOf(added, BOB)).toBeTruthy();
+    // A second Submit of the same form says where the group went, as the dialog does.
+    const again = await map.submit({ group: 'B', mark: split.only?.mark });
+    expect(again.json).toMatchObject({ ok: true, text: 'Split off: Saturday legendaries (Fast)' });
+    expect(map.made.store.active()).toHaveLength(2);
+  });
+
+  it("refuses a group called otherwise since the form opened, in the dialog's words", async () => {
+    const map = await splitting();
+    web = map.web;
+    const { json: split } = await map.open();
+    await map.made.attendance.labelGroup(map.made.party.id, { id: ALICE }, 'Faster');
+    const stale = await map.submit({ group: 'B', mark: split.only?.mark });
+    expect(stale.status).toBe(409);
+    expect(stale.json).toMatchObject({
+      ok: false,
+      text: 'The groups of this train changed meanwhile: press Split… again.',
+      train: { id: map.made.party.id },
+    });
+    expect(map.made.store.active()).toHaveLength(1);
+  });
+
+  it("counts the Submit in the window of the post's controls, and refuses the opening while it is full, uncounted", async () => {
+    const throttles = new Throttles();
+    const map = await splitting({ throttles });
+    web = map.web;
+    const { json: split } = await map.open();
+    for (let use = 0; use < ACTION_THROTTLE.uses; use += 1) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    expect((await map.open()).status).toBe(429);
+    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(429);
+    expect(map.made.store.active()).toHaveLength(1);
+  });
+
+  it('says a split that failed split nothing off, and gives its use back, as the dialog does', async () => {
+    const throttles = new Throttles();
+    const map = await splitting({ throttles });
+    web = map.web;
+    const { json: split } = await map.open();
+    for (let use = 0; use < ACTION_THROTTLE.uses - 1; use += 1) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const failing = vi
+      .spyOn(map.made.trains, 'split')
+      .mockRejectedValue(new Error('the database is away'));
+    const failed = await map.submit({ group: 'B', mark: split.only?.mark });
+    expect(failed).toMatchObject({
+      status: 500,
+      json: { ok: false, text: 'The split did not work: nothing was split off.' },
+    });
+    failing.mockRestore();
+    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(200);
+  });
+
+  // Review C3: as Manage…'s Submit, who may not is refused before anything is counted.
+  it("refuses the Submit of who may not split that group before it counts, 403 with the train, in the dialog's words", async () => {
+    const throttles = new Throttles();
+    const map = await splitting({ throttles });
+    web = map.web;
+    const { json: split } = await map.open();
+    const dave = await map.submit({ group: 'B', mark: split.only?.mark }, DAVE);
+    expect(dave).toMatchObject({
+      status: 403,
+      json: {
+        ok: false,
+        text: "Only a group's members, the conductor and the moderators can split a group off.",
+        train: { id: map.made.party.id },
+      },
+    });
+    expect(map.made.store.active()).toHaveLength(1);
+    expect(
+      throttles.use(controlThrottleKey(PARTY_KIND), DAVE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
+    ).toBeUndefined();
+  });
+
+  // Re-review N2: what the train is (not who asks) is refused by the counted way, as Discord's
+  // Submit is.
+  it("counts a Submit the train refuses for what it is now (one group left), 422 in the dialog's words", async () => {
+    const throttles = new Throttles();
+    const map = await splitting({ throttles });
+    web = map.web;
+    const { json: split } = await map.open();
+    const { id } = map.made.party;
+    await map.made.attendance.leave(id, { id: CAROL });
+    await map.made.attendance.leave(id, { id: REPORTER });
+    for (let use = 0; use < ACTION_THROTTLE.uses - 1; use += 1) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const whole = await map.submit({ group: 'B', mark: split.only?.mark });
+    expect(whole).toMatchObject({
+      status: 422,
+      json: {
+        ok: false,
+        text: 'This train has one group: there is no group to split off it.',
+      },
+    });
+    // That Submit was the window's last use.
+    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(429);
+    expect(map.made.store.active()).toHaveLength(1);
+  });
+
+  // Review C4: a post the bot may not make is none of the member's doing.
+  it("says plainly where the bot may not make the new post, and gives the Submit's use back", async () => {
+    const throttles = new Throttles();
+    const map = await splitting({ throttles });
+    web = map.web;
+    const { json: split } = await map.open();
+    for (let use = 0; use < ACTION_THROTTLE.uses - 1; use += 1) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    map.made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
+    const refused = await map.submit({ group: 'B', mark: split.only?.mark });
+    expect(refused.status).toBe(422);
+    expect(refused.json).toMatchObject({ ok: false, train: { id: map.made.party.id } });
+    expect(refused.json.text).toMatch(
+      /^I am not allowed to make posts in .+: I lack the permission Manage Posts there\. Nothing was made\./u,
+    );
+    expect(map.made.store.active()).toHaveLength(1);
+    map.made.gateway.refusePosts.delete(WEST_FORUM);
+    // The window has the one use left that the refused Submit gave back.
+    expect((await map.submit({ group: 'B', mark: split.only?.mark })).status).toBe(200);
+  });
+
+  it('answers a train that is over (409), refuses a member kept out of its forum (403), and knows only its bodies (400)', async () => {
+    const map = await splitting();
+    web = map.web;
+    expect((await map.submit({ group: 'B' })).status).toBe(400);
+    expect((await map.submit({ group: 'F', mark: '1.a' })).status).toBe(400);
+    expect((await map.submit({ group: 'B', mark: '1.a', more: 1 })).status).toBe(400);
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.open()).status).toBe(403);
+    map.made.gateway.barred.clear();
+    await map.made.service.end(map.made.party.id);
+    expect((await map.open()).status).toBe(409);
+    expect((await map.submit({ group: 'B', mark: '1.a' })).status).toBe(409);
+  });
+});
````

### Task 5: 8M-8C task 5: route mode adds a Power Spot by a tap, Route says what lies ahead

Prototype commit: `9fef62ac769c5a9012216123598ff33ddcf400ec`

In route mode a Power Spot of the map's layer tapped is the train's
next stop, by its key (w<Wayfarer id>), as a gym clicked is: the dot
opens its popup from our click handler rather than a bound popup, so
route mode takes the tap first. A Power Spot on the route already is
said and costs no request. The editor's hint says to turn on Power
Spots and zoom in while the map draws none (placesWanted, the layer's
own rule), kept current as the layer and the zoom change.

Route for anybody: the stop list read-only, what lies ahead as the
post's small print words it (aheadText over aheadLine, sent as
MapTrain.ahead: the page words no turning or looping of its own), and
Edit route for who may arrange the route. Route mode stays the side
pane's (R3).


# Conflicts:
#	src/web/party-routes.ts
#	src/web/train-routes.ts
#	src/web/train-views.ts

**Files:**

```
 src/domain/web/party-data.ts              |   5 +++++
 src/domain/web/party-view.test.ts         |   2 ++
 src/domain/web/party-view.ts              |   6 ++++++
 src/render/activity.ts                    |   3 ++-
 src/render/route-words.ts                 |   9 +++++++++
 src/render/train-post.ts                  |  13 ++++++++++++-
 src/web/client/gyms-ui.ts                 |   8 +++++++-
 src/web/client/main.ts                    |  23 ++++++++++++++++++++++-
 src/web/client/parties.test.ts            |   1 +
 src/web/client/party-layer.ts             |  20 ++++++++++++++++++++
 src/web/client/places-ui.isolated.test.ts | 129 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/places-ui.ts               |  63 ++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/web/client/post-draw.test.ts          |   6 ++++++
 src/web/client/post-draw.ts               |   3 +++
 src/web/client/route-focus.test.ts        |  68 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/route-focus.ts             |  52 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-forms.test.ts        |  31 +++++++++++++++++++++++++++----
 src/web/client/train-forms.ts             |  37 +++++++++++++++++++++++++++----------
 src/web/client/train-ui.isolated.test.ts  |  37 +++++++++++++++++++++++++++++++++++--
 src/web/client/train-ui.ts                |  41 ++++++++++++++++++++++++++++++++++++++---
 src/web/client/what-is-on.test.ts         |   1 +
 src/web/party-routes.ts                   |  16 +++++++++-------
 src/web/train-move.test.ts                |   4 ++++
 src/web/train-routes.ts                   |   3 ++-
 src/web/train-views.ts                    |  11 +++++++++++
 25 files changed, 552 insertions(+), 40 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/parties.test.ts src/web/client/places-ui.isolated.test.ts src/web/client/post-draw.test.ts src/web/client/route-focus.test.ts src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts src/web/client/what-is-on.test.ts src/web/train-move.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9fef62ac769c5a9012216123598ff33ddcf400ec -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8C task 5: route mode adds a Power Spot by a tap, Route says what lies ahead`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 5bc4a7fdd800293657ab639fdcd6b205ff68243e..1fa0c08dfe824e0042a1b90dde9047c0b9301eb1 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -285,6 +285,11 @@ export interface MapTrain {
   spots: MapTrainSpot[];
   /** The index in `route` of the stop the train is at; null without a route or once finished. */
   stop: number | null;
+  /**
+   * What lies ahead, as the post's small print says it (plan 8M-8C, R3: `aheadText`, the turning
+   * and looping words the server's), for the map's Route; null where the post says nothing.
+   */
+  ahead: string | null;
   link: string;
   attendance: MapAttendance;
   /** The key of its post as last shown (`postKey`, plan 8M-8A); null while it has none yet. */
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 7c18ae4ef570723fa5b41f1b932f6cde74750180..169e73d18f5ee8944b80929e496d8211ff29fbe2 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -410,6 +410,8 @@ describe('partyView', () => {
         route: ['1', '2', '3'],
         spots: [],
         stop: 1,
+        // What lies ahead is the caller's words (plan 8M-8C): none given here.
+        ahead: null,
         link: `https://discord.com/channels/${GUILD}/700000000000000002`,
         postKey: null,
         attendance: {
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 34c13b164f93fd02ef9134f5e9e859dd12087593..df45ca0dbd7ef0ad0cee7c391ef66da857d15684 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -158,6 +158,11 @@ export interface PartyViewInput {
    * words), asked only for who may move it. Left out: no Move… on the map.
    */
   trainMoves?: (party: TrainParty) => MapMoves;
+  /**
+   * What lies ahead of a train as its post's small print says it (plan 8M-8C, R3: `aheadText` in
+   * the map's words), undefined where it says nothing. Left out: none.
+   */
+  trainAhead?: (party: TrainParty) => string | undefined;
 }
 
 /** Staff's Delete… of a party (plan 8M-8B): for staff alone, never while read-only. */
@@ -415,6 +420,7 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
       return spot ? [{ key: stopKey(ref), ...spot }] : [];
     }),
     stop: stop < route.length ? stop : null,
+    ahead: input.trainAhead?.(party) ?? null,
     link,
     attendance: attendanceOf(party, input, false),
     postKey: input.postKey?.(party) ?? null,
diff --git a/src/render/activity.ts b/src/render/activity.ts
index d942413d3d3fff2d8d891e599653f28530b24e2c..d0222e5cc7e573926559e30ca0f517e40e86b7d4 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -13,6 +13,7 @@ import {
 import { POST_PERMISSIONS, type PostsRefused } from '../domain/party/post-permissions.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { GROUP_LABEL, groupWords } from './party-controls.js';
+import { ALREADY_ON_ROUTE } from './route-words.js';
 import { memberText, timestamp, type NamedMember } from './text.js';
 
 /**
@@ -195,7 +196,7 @@ export function problemText(
     case 'reverse-finished-elsewhere':
       return 'A finished route can be reversed only when it was finished at its last stop.';
     case 'already-on-route':
-      return 'That stop is on the route already.';
+      return ALREADY_ON_ROUTE;
     case 'route-full':
       return `A route has at most ${MAX_ROUTE_STOPS} stops.`;
     case 'no-such-stop':
diff --git a/src/render/route-words.ts b/src/render/route-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2e38a709cdbf5bd0781672acf9c1f554700da748
--- /dev/null
+++ b/src/render/route-words.ts
@@ -0,0 +1,9 @@
+/*
+ * The words of a route's refusal that the map's page says without asking the server (plan 8M-8C,
+ * review C7: a stop tapped that is on the route already costs no request) and `/route add` says
+ * when the server refuses the same (`problemText`), without an import, so that the map's page
+ * takes it whole: one wording for both.
+ */
+
+/** A stop added that is on the route already (`already-on-route`). */
+export const ALREADY_ON_ROUTE = 'That stop is on the route already.';
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index be7d4eb939a2d7cdba4132711ff5f074e1cd7ec2..9d54453df14d94e104614c66a7242f41e4a8dacc 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -142,7 +142,7 @@ const TOWARD_WORDS = {
  * (Where has the Map of the current stop, Route the rest), each cut alike when the line is
  * too long (`fit.part`).
  */
-function aheadLine(view: TrainPostView, fit: Fit): PostBlock[] {
+function aheadLine(view: TrainPlaces, fit: Fit): PostBlock[] {
   const ahead = routeAhead(view.party);
   const name = (ref: StopRef) => plain(stopLabel(view.stop(ref)));
   let names: string[];
@@ -193,6 +193,17 @@ function aheadLine(view: TrainPostView, fit: Fit): PostBlock[] {
   return [{ type: 'text', content: `-# ${shown}` }];
 }
 
+/**
+ * What lies ahead of the train as the post's small print says it (`aheadLine`, its names not cut
+ * for the post's room), without the small print's mark: the live map's Route (plan 8M-8C, R3),
+ * which words no turning or looping of its own. Undefined where the post says nothing.
+ */
+export function aheadText(view: TrainPlaces): string | undefined {
+  const whole: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };
+  const [block] = aheadLine(view, whole);
+  return block?.type === 'text' ? block.content.replace(/^-# /u, '') : undefined;
+}
+
 /**
  * Where the train is (Matt, 2026-10-17): `**Where · stop 2 of 7**` and its current stop as a
  * raid's gym (`stopWhere`: a gym or a power spot, its address and Map, a gym's notice, its picture);
diff --git a/src/web/client/gyms-ui.ts b/src/web/client/gyms-ui.ts
index 7721b51b465f53d3861fd2ea9c298cd855f4b4b4..ad101bf7b4ce69566ce780978d618d3d57b2f8b2 100644
--- a/src/web/client/gyms-ui.ts
+++ b/src/web/client/gyms-ui.ts
@@ -4,6 +4,8 @@ import { dotsDiff, shownGyms, wantedDots } from './gym-dots.js';
 import type { LayerRegistry } from './layer-registry.js';
 import { GYM_DOT, gymClicks } from './party-layer.js';
 import { gymPopup, renderNode, type MapGym } from './popup.js';
+import type { RouteFocus } from './route-focus.js';
+import { stopName } from './train-forms.js';
 import { heldContent } from './raid-forms.js';
 import { onThemeChange, theme } from './theme.js';
 
@@ -39,6 +41,8 @@ export interface GymDotsDeps {
   forced(): boolean;
   /** The gyms not drawn as dots: a gym with a raid shows the raid (plan 8M-7, `hiddenGyms`). */
   hidden(): ReadonlySet<number>;
+  /** The gyms' dots as Tab stops in route mode only (re-review N1); left out: never. */
+  focus?: Pick<RouteFocus, 'watch'>;
   /** A gym's dot tapped: the list of the things at its place, or `own`, its own popup. */
   tapped(gym: MapGym, own: () => void): void;
 }
@@ -72,7 +76,9 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
         () => deps.editing(),
       ),
     );
-    // In route mode a click (or Enter) adds the gym as a stop: its popup is not opened.
+    // In route mode a click (or Enter on the dot, a Tab stop then: `focus`) adds the gym as a
+    // stop: its popup is not opened.
+    deps.focus?.watch(marker, stopName(gym, String(gym.id)));
     gymClicks(
       marker,
       () => deps.clicked(gym),
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 0a04931028df1fe98ce0030bdeb78e0404dfebf1..61f0db5ab1c8054e5c69c02e2b6d3e8ffa7c0877 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -9,6 +9,7 @@ import { loginNotice, loginNoticeFor } from './notice.js';
 import { showParties } from './party-layer.js';
 import { quietLine, showPlaces } from './places-ui.js';
 import { regionLabel, renderNode, type MapGym } from './popup.js';
+import { RouteFocus } from './route-focus.js';
 import { hiddenGyms } from './shared-place.js';
 import { onThemeChange, theme } from './theme.js';
 import { BOUNDS_VISCOSITY, browserStorage, placeTheMap } from './view-ui.js';
@@ -32,6 +33,9 @@ import { showWhereYouAre, type You } from './you-ui.js';
 const LABELS_PANE = 'region-labels';
 const LABELS_PANE_Z = 350;
 
+/** The gyms' and Power Spots' dots as Tab stops while route mode is on, and only then (re-review N1). */
+const routeFocus = new RouteFocus();
+
 /**
  * What a gym's popup shows beyond the gym itself, once the page knows who is asking: "Report raid"
  * (plan 8M-4) and "Report spawn here" (plan 8M-4S) for a member, and whether a form is open (the
@@ -122,6 +126,7 @@ async function showGeo(
     clicked: (gym) => gymExtras.clicked(gym),
     forced: () => gymExtras.forced(),
     hidden: () => hiddenGyms(gymExtras.raidGyms(), registry.isOn('raids')),
+    focus: routeFocus,
     tapped: (gym, own) => {
       gymExtras.tapped(gym, own);
     },
@@ -211,7 +216,19 @@ function start(): void {
       const me = await account;
       const member = me.loggedIn && (me.member || me.readOnly);
       controls.refresh(member);
-      showPlaces(map, guild, registry, quiet, () => member);
+      // A Power Spot tapped is a stop in route mode (plan 8M-8C, R5), once the parties are drawn.
+      const spotTaps: { clicked: (spot: { id: string; title: string }) => boolean } = {
+        clicked: () => false,
+      };
+      showPlaces(
+        map,
+        guild,
+        registry,
+        quiet,
+        () => member,
+        (spot) => spotTaps.clicked(spot),
+        routeFocus,
+      );
       if (!me.loggedIn || !member) {
         // The side pane says how to see what is on (plan 8M-7).
         const pane = byId('parties');
@@ -242,10 +259,14 @@ function start(): void {
         },
         // The settings' units (task 7), as Discord says distances.
         units: data.distanceUnits === 'metric' ? 'metric' : 'imperial',
+        routeMode: (on) => {
+          routeFocus.set(on);
+        },
       });
       gymExtras.editing = () => raids.editing();
       gymExtras.of = (gym) => raids.gymControls(gym);
       gymExtras.clicked = (gym) => raids.gymClicked(gym);
+      spotTaps.clicked = (spot) => raids.spotClicked(spot);
       gymExtras.forced = () => raids.forced();
       gymExtras.raidGyms = () => raids.raidGyms();
       gymExtras.tapped = (gym, own) => {
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 68dd5a0b0cae924946df3db23639b8d7b85ee4c0..e5f10da4d7b144986048c08a315e1b5381337ec5 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -452,6 +452,7 @@ describe('trainPopup and meetupItem', () => {
       route: ['1', '2', '3'],
       spots: [],
       stop: 1,
+      ahead: null,
       link: LINK,
       attendance: attendance({ actions: [] }),
       may: { arrange: false, clear: false, load: false },
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 190d1246a9a309c928fe07c856b3cee86c3d558a..b41a727eb5c7df87279779cfcd3ac9284b640fe1 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -36,6 +36,7 @@ import {
 import { trainUi } from './train-ui.js';
 import { onThemeChange, theme } from './theme.js';
 import type { LayerRegistry } from './layer-registry.js';
+import { placesWanted } from './cluster.js';
 import {
   leadRaid,
   markerSize,
@@ -215,6 +216,8 @@ export interface PartyFrame {
   showMap: () => void;
   /** The units distances are said in (`settings.distanceUnits`, task 7). */
   units: DistanceUnits;
+  /** Route mode began or ended: the dots to add as stops are Tab stops only meanwhile (N1). */
+  routeMode?: (on: boolean) => void;
 }
 
 export interface MapRaids {
@@ -230,6 +233,11 @@ export interface MapRaids {
    * arranged, and true says its popup is not wanted (plan 8M-5).
    */
   gymClicked(gym: MapGym): boolean;
+  /**
+   * A Power Spot of the map's layer tapped: in route mode it is added as the next stop of the
+   * train being arranged, and true says its popup is not wanted (plan 8M-8C, R5).
+   */
+  spotClicked(spot: { id: string; title: string }): boolean;
   /**
    * A gym is to be clicked (route mode, a meetup's place picked): the map draws every gym,
    * whatever the Gyms layer (plan 8M-7).
@@ -1247,6 +1255,17 @@ export function showParties(
     redrawn: () => {
       if (view) hold.shown(view);
     },
+    // Whether the map draws Power Spots to tap in route mode (plan 8M-8C, R5), by the rule the
+    // Power Spots layer draws them by (`placesWanted`: on, zoomed in; the member's map).
+    spotsShown: () => placesWanted(registry.isOn('spots'), map.getZoom(), true),
+    ...(frame.routeMode === undefined ? {} : { routeMode: frame.routeMode }),
+  });
+  // The route editor's hint follows the Power Spots layer and the zoom (R5).
+  registry.onChange((id) => {
+    if (id === 'spots') trainForms.placesChanged();
+  });
+  map.on('zoomend', () => {
+    trainForms.placesChanged();
   });
   tools.addEventListener('click', (event) => {
     const target = event.target;
@@ -1405,6 +1424,7 @@ export function showParties(
         : [],
     editing: () => hold.editing,
     gymClicked: (gym) => gymClicked(gym),
+    spotClicked: (spot) => trainForms.spotClicked(spot),
     forced: () => trainForms.routing() !== undefined || meetupForms.picking(),
     raidGyms: () => raidGyms,
     gymTapped: (gym, own) => {
diff --git a/src/web/client/places-ui.isolated.test.ts b/src/web/client/places-ui.isolated.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f21dd227960323fb9acd5057b128c7ff785de9cc
--- /dev/null
+++ b/src/web/client/places-ui.isolated.test.ts
@@ -0,0 +1,129 @@
+import type * as L from 'leaflet';
+import { describe, expect, it, vi } from 'vitest';
+import { placeClicks } from './places-ui.js';
+import { RouteFocus } from './route-focus.js';
+
+// Leaflet reads the browser's `window` as it loads: what `placeClicks` uses of it is how an event
+// is stopped, recorded here. Isolated: a mocked module needs a module graph of its own.
+const stopped = vi.hoisted(() => [] as unknown[]);
+vi.mock('leaflet', () => ({
+  DomEvent: {
+    stop: (event: unknown) => {
+      stopped.push(event);
+    },
+  },
+}));
+
+/** A place's marker: its handlers by event, and its element once on the map. */
+function placeMarker() {
+  const handlers = new Map<string, ((event: unknown) => void)[]>();
+  const attributes = new Map<string, string>();
+  const marker = {
+    attributes,
+    off(type: string) {
+      handlers.delete(type);
+      return marker;
+    },
+    on(type: string, handler: (event: unknown) => void) {
+      handlers.set(type, [...(handlers.get(type) ?? []), handler]);
+      return marker;
+    },
+    getElement() {
+      return {
+        setAttribute: (name: string, value: string) => {
+          attributes.set(name, value);
+        },
+        removeAttribute: (name: string) => {
+          attributes.delete(name);
+        },
+      };
+    },
+    /** Leaflet fires an event on the marker. */
+    fire(type: string, event: unknown) {
+      for (const handler of handlers.get(type) ?? []) handler(event);
+    },
+  };
+  return marker;
+}
+
+// Review C10 of 8M-8C: a Power Spot is a stop to add as a gym is, also by the keyboard.
+describe("a Power Spot's clicks and keys (placeClicks)", () => {
+  // Re-review N1: up to 300 dots before the side pane are no Tab stops outside route mode.
+  it('is no Tab stop on the map outside route mode', () => {
+    const marker = placeMarker();
+    placeClicks(
+      marker as unknown as L.CircleMarker,
+      'Lake Gazebo',
+      () => false,
+      () => undefined,
+    );
+    marker.fire('add', {});
+    expect(Object.fromEntries(marker.attributes)).toEqual({});
+  });
+
+  it('is a Tab stop named for a screen reader while route mode is on (RouteFocus)', () => {
+    const marker = placeMarker();
+    const focus = new RouteFocus();
+    placeClicks(
+      marker as unknown as L.CircleMarker,
+      'Lake Gazebo',
+      () => true,
+      () => undefined,
+      focus,
+    );
+    marker.fire('add', {});
+    expect(Object.fromEntries(marker.attributes)).toEqual({});
+    focus.set(true);
+    expect(Object.fromEntries(marker.attributes)).toEqual({
+      tabindex: '0',
+      role: 'button',
+      'aria-label': 'Lake Gazebo',
+    });
+  });
+
+  it('adds the spot on Enter in route mode, and keeps a double tap from zooming the map', () => {
+    stopped.length = 0;
+    const marker = placeMarker();
+    let added = 0;
+    let opened = 0;
+    placeClicks(
+      marker as unknown as L.CircleMarker,
+      'Lake Gazebo',
+      () => {
+        added += 1;
+        return true;
+      },
+      () => {
+        opened += 1;
+      },
+    );
+    marker.fire('keypress', { originalEvent: { key: 'Enter' } });
+    const taps = [{ type: 'click' }, { type: 'click' }];
+    const double = { type: 'dblclick' };
+    for (const tap of taps) marker.fire('click', tap);
+    marker.fire('dblclick', double);
+    expect(added).toBe(3);
+    expect(opened).toBe(0);
+    expect(stopped).toContain(double);
+  });
+
+  it('opens its popup on a tap or Enter out of route mode, a double tap left to the map', () => {
+    stopped.length = 0;
+    const marker = placeMarker();
+    let opened = 0;
+    placeClicks(
+      marker as unknown as L.CircleMarker,
+      'Lake Gazebo',
+      () => false,
+      () => {
+        opened += 1;
+      },
+    );
+    marker.fire('click', { type: 'click' });
+    marker.fire('keypress', { originalEvent: { key: 'Enter' } });
+    const double = { type: 'dblclick' };
+    marker.fire('dblclick', double);
+    expect(opened).toBe(2);
+    expect(stopped).not.toContain(double);
+  });
+});
diff --git a/src/web/client/places-ui.ts b/src/web/client/places-ui.ts
index 0fecf230f6a5824a763ac91107bc61486fd2f1e6..be17859f31ce7d5beaf1d69c072f8f908ff43f2f 100644
--- a/src/web/client/places-ui.ts
+++ b/src/web/client/places-ui.ts
@@ -5,7 +5,9 @@ import { PlacesInView, placesWanted } from './cluster.js';
 import { getJson } from './common.js';
 import type { LayerRegistry } from './layer-registry.js';
 import { StopLoads, stopsBox } from './meetup-forms.js';
+import { gymClicks } from './party-layer.js';
 import { renderNode } from './popup.js';
+import type { RouteFocus } from './route-focus.js';
 import { onThemeChange, theme, type DrawnColour } from './theme.js';
 
 /**
@@ -13,8 +15,9 @@ import { onThemeChange, theme, type DrawnColour } from './theme.js';
  * level (`PLACES_FROM`), those of the view are asked for through the existing `/api/stops` and
  * `/api/powerspots` (the box kept to the world, `stopsBox`) at once and again 300 ms after the map
  * rests (`StopLoads`, only the last question's answer shown), drawn as small dots with their name
- * in a popup (Power Spots' popups say no more until plan 8M-9); "more than shown" is told in one
- * quiet line at the bottom of the map. Logged out the layers are not offered.
+ * in a popup (Power Spots' popups say no more until plan 8M-9); in route mode a Power Spot tapped
+ * is the train's next stop instead (plan 8M-8C, R5: `spotTapped`); "more than shown" is told in
+ * one quiet line at the bottom of the map. Logged out the layers are not offered.
  */
 
 /** The quiet line at the bottom of the map: one sentence per layer that has more than it shows. */
@@ -71,12 +74,33 @@ const LAYERS: readonly PlacesLayer[] = [
   },
 ];
 
+/**
+ * A Power Spot's marker as a gym's (plan 8M-8C, review C10): its clicks and Enter taken as a
+ * gym's are (`gymClicks`): in route mode `routeTap` adds it as a stop (true: no popup, and a
+ * double tap of it no zoom), otherwise `open` opens its popup. A Tab stop named for a screen
+ * reader only while route mode is on (`focus`, re-review N1).
+ */
+export function placeClicks(
+  marker: L.CircleMarker,
+  name: string,
+  routeTap: () => boolean,
+  open: () => void,
+  focus?: Pick<RouteFocus, 'watch'>,
+): void {
+  focus?.watch(marker, name);
+  gymClicks(marker, routeTap, open);
+}
+
 export function showPlaces(
   map: L.Map,
   guild: string,
   registry: LayerRegistry,
   quiet: QuietLine,
   member: () => boolean,
+  /** A Power Spot tapped: true where route mode took it as a stop (plan 8M-8C, R5). */
+  spotTapped: (spot: { id: string; title: string }) => boolean = () => false,
+  /** Power Spots as Tab stops in route mode only (re-review N1); left out: never. */
+  focus?: Pick<RouteFocus, 'watch'>,
 ): { refresh(): void } {
   const checks: Array<() => void> = [];
   for (const layer of LAYERS) {
@@ -101,13 +125,34 @@ export function showPlaces(
       show: (view) => {
         group.clearLayers();
         const colour = theme().colours[layer.colour];
-        for (const [, lat, lon, title] of view.stops) {
-          L.circleMarker([lat, lon], { radius: 5, weight: 2, color: colour, fillOpacity: 0.7 })
-            // The name as text of an element of ours: Leaflet sets a string as HTML.
-            .bindPopup(
-              renderNode({ tag: 'strong', className: 'place-name', text: title }, document),
-            )
-            .addTo(group);
+        for (const [id, lat, lon, title] of view.stops) {
+          const marker = L.circleMarker([lat, lon], {
+            radius: 5,
+            weight: 2,
+            color: colour,
+            fillOpacity: 0.7,
+          });
+          // Its name, as text of an element of ours (Leaflet sets a string as HTML); opened by our
+          // own handler rather than bound, which would open it before anything of ours.
+          const open = (): void => {
+            L.popup()
+              .setLatLng([lat, lon])
+              .setContent(
+                renderNode({ tag: 'strong', className: 'place-name', text: title }, document),
+              )
+              .openOn(map);
+          };
+          // A Power Spot tapped (or Enter on it) in route mode is the next stop of the train
+          // (plan 8M-8C, R5; review C10), as a gym is (`placeClicks`): no popup then.
+          if (layer.id === 'spots')
+            placeClicks(marker, title, () => spotTapped({ id, title }), open, focus);
+          else {
+            marker.on('click', (event: L.LeafletMouseEvent) => {
+              L.DomEvent.stopPropagation(event);
+              open();
+            });
+          }
+          marker.addTo(group);
         }
         registry.setCount(layer.id, view.stops.length);
       },
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index 2c805fe7154938e8cea541f75e5dbb977b909c97..06d11902decb7d08dd4c4c6446e072b45dfe79b3 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -585,6 +585,7 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
       route: ['1', '2', '3', '4'],
       spots: [],
       stop: 1,
+      ahead: 'Next: 3. Gym 3 · 4. Gym 4, the last stop',
       link: LINK,
       attendance: attendance({ mine: { status: 'coming', group: 'A' } }),
       may: { arrange: true, clear: false, load: false },
@@ -643,6 +644,7 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
     // The conductor's part is the member's own, outside Manage… (R2), as `/conductor` is.
     expect(byClass(popup, 'manage')).toEqual([]);
     const mine = byClass(popup, 'mine-part')[0];
+    // Edit route once, in the member's part above Route's list (review C8).
     expect(mine && buttonsOf(mine).map((one) => one.text)).toEqual([
       'Edit route',
       'Be the conductor',
@@ -656,6 +658,9 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
           .filter((one) => one.tag === 'li')
           .map(seen),
     ).toEqual(['Gym 1', 'Gym 2 (the train is here)', 'Gym 3', 'Gym 4']);
+    // What lies ahead as the server words it (R3); route mode is the member's part's Edit route.
+    expect(route && seen(route)).toContain('Next: 3. Gym 3 · 4. Gym 4, the last stop');
+    expect(route && buttonsOf(route)).toEqual([]);
     expect(buttons.find((one) => one.text === 'Edit route')?.attributes).toMatchObject({
       'data-route-train': 't1',
     });
@@ -683,6 +688,7 @@ describe('the review’s fixes (8M-8A fix round 1)', () => {
     route: ['1', '2'],
     spots: [],
     stop: 0,
+    ahead: null,
     link: LINK,
     attendance: attendance(),
     may: { arrange: false, clear: false, load: false },
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index 4c60f1bee1ad58e08709777bace8a2211d48d280..97fa8eb010d6db0a70433c87380b69312b2bc769 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -433,6 +433,8 @@ function trainPart(
         ]
       : []),
   ];
+  // Route (plan 8M-8C, R3): the stops read-only and what lies ahead as the server words it (the
+  // post's small print); route mode is the Edit route above it, once (review C8).
   const route: PageNode = {
     tag: 'section',
     className: 'route',
@@ -445,6 +447,7 @@ function trainPart(
           text: `${context.stopName(key)}${index === train.stop ? ' (the train is here)' : ''}`,
         })),
       },
+      ...(train.ahead === null ? [] : [{ tag: 'div', className: 'small', text: train.ahead }]),
     ],
   };
   return [
diff --git a/src/web/client/route-focus.test.ts b/src/web/client/route-focus.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..bbdcfeaeb04bf31196c9b134ea2f3acdafb38c64
--- /dev/null
+++ b/src/web/client/route-focus.test.ts
@@ -0,0 +1,68 @@
+import { describe, expect, it } from 'vitest';
+import { RouteFocus } from './route-focus.js';
+
+/** A dot of the map: its listeners, whether it is on the map, and its element's attributes. */
+function dot() {
+  const listeners = new Map<string, Array<() => void>>();
+  const attributes = new Map<string, string>();
+  let onMap = false;
+  const made = {
+    attributes,
+    on(type: 'add' | 'remove', listener: () => void) {
+      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
+      return made;
+    },
+    getElement() {
+      return onMap
+        ? {
+            setAttribute: (name: string, value: string) => {
+              attributes.set(name, value);
+            },
+            removeAttribute: (name: string) => {
+              attributes.delete(name);
+            },
+          }
+        : undefined;
+    },
+    /** Leaflet puts it on the map, or takes it off. */
+    add() {
+      onMap = true;
+      for (const listener of listeners.get('add') ?? []) listener();
+    },
+    remove() {
+      for (const listener of listeners.get('remove') ?? []) listener();
+      onMap = false;
+    },
+  };
+  return made;
+}
+
+const STOP = { tabindex: '0', role: 'button', 'aria-label': 'Lake Gazebo' };
+
+// Re-review N1 of 8M-8C: dots are Tab stops in route mode only.
+describe('the dots to add as stops (RouteFocus)', () => {
+  it('makes the dots on the map Tab stops while route mode is on, and none before or after', () => {
+    const focus = new RouteFocus();
+    const lake = dot();
+    focus.watch(lake, 'Lake Gazebo');
+    lake.add();
+    expect(Object.fromEntries(lake.attributes)).toEqual({});
+    focus.set(true);
+    expect(Object.fromEntries(lake.attributes)).toEqual(STOP);
+    focus.set(false);
+    expect(Object.fromEntries(lake.attributes)).toEqual({});
+  });
+
+  it('makes a dot drawn during route mode a Tab stop at once, and forgets one taken off the map', () => {
+    const focus = new RouteFocus();
+    focus.set(true);
+    const lake = dot();
+    focus.watch(lake, 'Lake Gazebo');
+    lake.add();
+    expect(Object.fromEntries(lake.attributes)).toEqual(STOP);
+    lake.remove();
+    focus.set(false);
+    // Taken off while route mode was on: nothing of it is asked any more.
+    expect(Object.fromEntries(lake.attributes)).toEqual(STOP);
+  });
+});
diff --git a/src/web/client/route-focus.ts b/src/web/client/route-focus.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e9c7f071ba3327f60f0e71dc8f607add65e4eb90
--- /dev/null
+++ b/src/web/client/route-focus.ts
@@ -0,0 +1,52 @@
+/*
+ * The dots a member adds as stops in route mode, gyms and Power Spots, as Tab stops only while
+ * route mode is on (plan 8M-8C, re-review N1): there Enter on a focused dot adds it (`gymClicks`);
+ * outside it hundreds of dots before the side pane would stand in the keyboard's way.
+ */
+
+/** What `RouteFocus` asks of a dot: Leaflet's events of a layer and its element on the map. */
+export interface FocusableDot {
+  on(type: 'add' | 'remove', listener: () => void): unknown;
+  getElement(): Pick<Element, 'setAttribute' | 'removeAttribute'> | undefined;
+}
+
+/**
+ * The dots that are stops to add, and whether route mode is on (`set`): each dot on the map
+ * then has `tabindex="0"`, `role="button"` and its name as `aria-label`, and none of them
+ * otherwise; a dot added to the map takes the state as it is, and one taken off is forgotten.
+ */
+export class RouteFocus {
+  private on = false;
+  private readonly dots = new Map<FocusableDot, string>();
+
+  /** Keeps the dot `dot`, named `name`, in step with route mode while it is on the map. */
+  watch(dot: FocusableDot, name: string): void {
+    dot.on('add', () => {
+      this.dots.set(dot, name);
+      this.apply(dot, name);
+    });
+    dot.on('remove', () => {
+      this.dots.delete(dot);
+    });
+  }
+
+  /** Route mode began (true) or ended (false). */
+  set(on: boolean): void {
+    this.on = on;
+    for (const [dot, name] of this.dots) this.apply(dot, name);
+  }
+
+  private apply(dot: FocusableDot, name: string): void {
+    const element = dot.getElement();
+    if (!element) return;
+    if (this.on) {
+      element.setAttribute('tabindex', '0');
+      element.setAttribute('role', 'button');
+      element.setAttribute('aria-label', name);
+    } else {
+      element.removeAttribute('tabindex');
+      element.removeAttribute('role');
+      element.removeAttribute('aria-label');
+    }
+  }
+}
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 6fb1a3bddf47eebf50cd2b3b6f2b55aed226e483..4db8dd1c8658e6b4674cb766bb5878d8044af22f 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -53,6 +53,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   route: ['4', '1', '7'],
   spots: [],
   stop: 1,
+  ahead: null,
   link: 'https://discord.com/channels/1/2',
   attendance: {
     groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
@@ -406,12 +407,34 @@ describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
     });
   });
 
-  it('says a gym clicked that is on the route already, and sends nothing', () => {
-    expect(routeEditBody('add', train(), { gym: 1, gymName: 'The Stacks' })).toEqual({
-      text: 'The Stacks is on the route already.',
+  it('adds a Power Spot tapped on the map by its key, and says one on the route already (plan 8M-8C)', () => {
+    const lake = 'w0a1b2c3d4';
+    expect(routeEditBody('add', train(), { spot: lake })).toEqual({
+      body: { drawn: ['4', '1', '7'], stop: 'w0a1b2c3d4' },
+    });
+    expect(routeEditBody('add', train({ route: ['4', 'w0a1b2c3d4'] }), { spot: lake })).toEqual({
+      text: 'That stop is on the route already.',
+    });
+  });
+
+  it('says how to add a Power Spot while the map shows none: its layer on, zoomed in (R5)', () => {
+    const hint = (spotsShown: boolean) =>
+      all(routeEditor(train(), gym, [], {}, spotsShown)).find((one) =>
+        (one.className ?? '').split(' ').includes('spots-hint'),
+      )?.text;
+    expect(hint(true)).toBe('Tap a gym or a Power Spot on the map to add it as the next stop.');
+    expect(hint(false)).toBe(
+      'Tap a gym on the map to add it as the next stop. Turn on Power Spots and zoom in to add a Power Spot.',
+    );
+  });
+
+  // Review C7: in the words `/route add` refuses it with (`already-on-route`).
+  it('says a gym clicked that is on the route already in the words of /route add, and sends nothing', () => {
+    expect(routeEditBody('add', train(), { gym: 1 })).toEqual({
+      text: 'That stop is on the route already.',
     });
     expect(routeEditBody('add', train(), { gym: 7 })).toEqual({
-      text: 'Gym 7 is on the route already.',
+      text: 'That stop is on the route already.',
     });
   });
 });
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index 466d5801aabc03cf84f7079f79dc0f71993241e1..e7c68c1f2ac871f58b35d2f1a512b97d097a897e 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -1,4 +1,5 @@
 import type { MapAtEnd, MapTrain } from '../../domain/web/party-data.js';
+import { ALREADY_ON_ROUTE } from '../../render/route-words.js';
 import {
   MAP_AT_ENDS,
   type ConductorSeen,
@@ -349,6 +350,17 @@ function stopControls(number: number, count: number): PageNode[] {
   ];
 }
 
+/**
+ * The route editor's hint (plan 8M-8C, R5): what a tap on the map adds, and while the map shows
+ * no Power Spot (their layer off, or zoomed out past where it draws them), how to have them.
+ */
+export function spotsHint(spotsShown: boolean): string {
+  return spotsShown
+    ? 'Tap a gym or a Power Spot on the map to add it as the next stop.'
+    : 'Tap a gym on the map to add it as the next stop. Turn on Power Spots and zoom in to add ' +
+        'a Power Spot.';
+}
+
 /**
  * What the route editor holds that the member typed or picked: the name to save the route under
  * and the saved route picked (its id), kept when the editor is drawn anew.
@@ -364,7 +376,9 @@ export interface RouteEditorFilled {
  * the route (`stopControls`; up, down and a position rather than dragging, which the map's side
  * panel does not need); "Clear the route" for who may (`/route clear`); the member's saved routes
  * of its region to load (who may) or forget, and a name to save the route under; Done. A gym
- * clicked on the map is added as the next stop (`/route add`). `saved` is undefined while the
+ * clicked on the map, or a Power Spot of its layer tapped (plan 8M-8C, R5), is added as the next
+ * stop (`/route add`); while the map shows no Power Spot (`spotsShown` false: their layer off or
+ * the map zoomed out too far), the hint says how to have them. `saved` is undefined while the
  * list is on its way. `filled` is what the editor drawn before held (`RouteEditorFilled`), kept
  * when an answer draws it anew.
  */
@@ -373,6 +387,7 @@ export function routeEditor(
   gym: (id: number) => MapGym | undefined,
   saved: readonly SavedRouteView[] | undefined,
   filled: RouteEditorFilled = {},
+  spotsShown = true,
 ): PageNode {
   const picked = saved?.some((route) => String(route.id) === filled.route) ? filled.route : '';
   const count = train.route.length;
@@ -423,11 +438,7 @@ export function routeEditor(
     attributes: { 'data-form': 'route', 'data-party': train.id },
     children: [
       { tag: 'strong', className: 'name', text: `Route of ${train.name}` },
-      {
-        tag: 'p',
-        className: 'hint',
-        text: 'Click a gym on the map to add it as the next stop.',
-      },
+      { tag: 'p', className: 'hint spots-hint', text: spotsHint(spotsShown) },
       stops,
       ...(train.may.clear && count > 0
         ? [
@@ -473,8 +484,8 @@ export function routeEditor(
 /** What a route edit reads of the editor and the button pressed. */
 export interface RouteEditValues {
   gym?: number;
-  /** The gym clicked as a stop is named (`stopName`), to say it is on the route already. */
-  gymName?: string;
+  /** A Power Spot tapped on the map (plan 8M-8C, R5): its stop key (`w<Wayfarer id>`). */
+  spot?: string;
   stop?: string;
   from?: string;
   to?: string;
@@ -500,10 +511,16 @@ export function routeEditBody(
   };
   switch (edit) {
     case 'add':
+      // A stop on the route already (a gym clicked twice, a stop clicked, a Power Spot tapped
+      // twice) costs no request: said in the words `/route add` refuses it with (review C7).
+      if (values.spot !== undefined) {
+        return drawn.includes(values.spot)
+          ? { text: ALREADY_ON_ROUTE }
+          : { body: { drawn, stop: values.spot } };
+      }
       if (values.gym === undefined) return { text: 'Click a gym first.' };
-      // A gym on the route already (clicked twice, or a stop clicked) costs no request.
       return drawn.includes(String(values.gym))
-        ? { text: `${values.gymName ?? `Gym ${values.gym}`} is on the route already.` }
+        ? { text: ALREADY_ON_ROUTE }
         : { body: { drawn, stop: String(values.gym) } };
     case 'remove': {
       const stop = whole(values.stop);
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 3c51ebae4d3084ec7b2f74da9153cf713a4d259b..5fd9ca4f50cf64ca133ef5e6468d5b75c9292efe 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -249,6 +249,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   route: ['4', '1', '7'],
   spots: [],
   stop: 1,
+  ahead: null,
   link: 'https://discord.com/channels/1/2',
   attendance: {
     groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
@@ -348,6 +349,8 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
   const events: string[] = [];
   const done: (MapTrain | undefined)[] = [];
   const finished = new Count();
+  /** Route mode begun (true) and ended (false), as the map is told. */
+  const modes: boolean[] = [];
   const ui = trainUi({
     guild: GUILD,
     csrf: { get: () => 'token', set: () => undefined },
@@ -372,6 +375,9 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
       return Promise.resolve();
     },
     refresh: () => Promise.resolve(),
+    routeMode: (on: boolean) => {
+      modes.push(on);
+    },
     redrawn: () => {
       events.push(`list drawn, routing ${ui.routing()?.id ?? 'none'}`);
     },
@@ -399,6 +405,7 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
     done,
     finished,
     action,
+    modes,
   };
 }
 
@@ -414,6 +421,17 @@ describe('route mode (trainUi)', () => {
     vi.unstubAllGlobals();
   });
 
+  // Re-review N1: the gyms' and Power Spots' dots are Tab stops only in route mode.
+  it('tells the map when route mode begins and when it ends', async () => {
+    const shown = page();
+    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
+    expect(shown.modes).toEqual([true]);
+    await shown.drawn.reached(2);
+    editorOf(shown.tools).querySelector('button[data-cancel]')?.dispatch('click');
+    await shown.finished.reached(1);
+    expect(shown.modes).toEqual([true, false]);
+  });
+
   it("draws the list anew as route mode starts and ends: the train's own line leaves at once and comes back on Done", async () => {
     const shown = page();
     shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
@@ -476,6 +494,21 @@ describe('route mode (trainUi)', () => {
     expect(field('select[name]')?.value).toBe('5');
   });
 
+  // Plan 8M-8C, R5: a Power Spot of the map's layer is a stop to tap in route mode, as a gym is.
+  it('adds a Power Spot tapped in route mode as the next stop, by its key; out of route mode a tap is its own', async () => {
+    const shown = page();
+    const lake = { id: '0a1b2c3d4', title: 'Lake Gazebo' };
+    expect(shown.ui.spotClicked(lake)).toBe(false);
+    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
+    await shown.drawn.reached(2);
+    expect(shown.ui.spotClicked(lake)).toBe(true);
+    await shown.requests.reached(2);
+    expect(shown.sent.at(-1)).toEqual({
+      url: `/s/${GUILD}/api/trains/t1/route/add`,
+      body: { drawn: ['4', '1', '7'], stop: 'w0a1b2c3d4' },
+    });
+  });
+
   it('says a gym clicked that is on the route already under the editor, and sends nothing', async () => {
     const shown = page();
     shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
@@ -484,9 +517,9 @@ describe('route mode (trainUi)', () => {
     if (!stacks) throw new Error('no Stacks');
     expect(shown.ui.gymClicked(stacks)).toBe(true);
     await shown.notices.reached(1);
-    expect(shown.said).toEqual(['The Stacks is on the route already.']);
+    expect(shown.said).toEqual(['That stop is on the route already.']);
     expect(editorOf(shown.tools).querySelector('.form-answer')?.textContent).toBe(
-      'The Stacks is on the route already.',
+      'That stop is on the route already.',
     );
     expect(shown.sent.map(({ url }) => url)).toEqual([`/s/${GUILD}/api/trains/t1/routes`]);
   });
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index 41728ab58dc5892bcec67d02c33b6dc558b6f9ce..26e4db711b08e7e767721d171abeec2c23669727 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -20,9 +20,9 @@ import {
   RouteEdits,
   routeModeEnds,
   sendTrainForm,
+  spotsHint,
   startBody,
   startForm,
-  stopName,
   type RouteEditorFilled,
   type RouteEditValues,
   type TrainAnswered,
@@ -66,6 +66,16 @@ export interface TrainUiDeps {
    * starts and ends, so that the routed train's own line leaves and comes back with it.
    */
   redrawn(): void;
+  /**
+   * Whether the map shows Power Spots to tap (plan 8M-8C, R5: their layer on, zoomed in far
+   * enough); left out: it does.
+   */
+  spotsShown?: () => boolean;
+  /**
+   * Route mode began (true) or ended (false): the gyms' and Power Spots' dots are Tab stops only
+   * meanwhile (re-review N1, `RouteFocus`). Left out: nobody is told.
+   */
+  routeMode?: (on: boolean) => void;
 }
 
 /** What the page says of a form while another one is open. */
@@ -187,7 +197,10 @@ export function trainUi(deps: TrainUiDeps) {
       ...(held.route === undefined ? {} : { route: held.route }),
       ...changed,
     };
-    const editor = renderNode(routeEditor(train, gym, saved?.routes, routing.filled), document);
+    const editor = renderNode(
+      routeEditor(train, gym, saved?.routes, routing.filled, deps.spotsShown?.() ?? true),
+      document,
+    );
     editor.addEventListener('click', (event) => {
       editClicked(editor, event);
     });
@@ -221,6 +234,7 @@ export function trainUi(deps: TrainUiDeps) {
     routing = undefined;
     toolsIdle();
     deps.overlay.clear();
+    deps.routeMode?.(false);
     hold.release(ended.claim);
     // The train's own line again, also when the list did not change meanwhile.
     deps.redrawn();
@@ -305,6 +319,7 @@ export function trainUi(deps: TrainUiDeps) {
     }
     deps.closePopup();
     routing = { claim, train, saved: undefined, filled: {} };
+    deps.routeMode?.(true);
     // The train's own line leaves the map at once: route mode's numbers take its place.
     deps.redrawn();
     drawRoute();
@@ -397,10 +412,30 @@ export function trainUi(deps: TrainUiDeps) {
      */
     gymClicked(clicked: MapGym): boolean {
       if (!routing) return false;
-      void edits.add('add', { gym: clicked.id, gymName: stopName(clicked, String(clicked.id)) });
+      void edits.add('add', { gym: clicked.id });
+      return true;
+    },
+
+    /**
+     * A Power Spot of the map's layer tapped (plan 8M-8C, R5): in route mode it is added as the
+     * next stop, by its key, as a gym clicked is (true: its popup is not wanted); otherwise
+     * nothing (false).
+     */
+    spotClicked(spot: { id: string; title: string }): boolean {
+      if (!routing) return false;
+      void edits.add('add', { spot: `w${spot.id}` });
       return true;
     },
 
+    /**
+     * The map's Power Spots came into sight or went (their layer, the zoom): the route editor's
+     * hint says so, nothing else of it drawn anew (a field keeps what is typed and the focus).
+     */
+    placesChanged(): void {
+      const hint = deps.tools.querySelector<HTMLElement>('.route-editor .spots-hint');
+      if (hint) hint.textContent = spotsHint(deps.spotsShown?.() ?? true);
+    },
+
     /** The train in route mode, if any: the list leaves its line to route mode's numbers. */
     routing(): MapTrain | undefined {
       return routing?.train;
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index d2bcaf961456565f966864b7db82e1deab96418e..e747d124d77af30cf269043f6d58ece3c0a35bb2 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -87,6 +87,7 @@ const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
   route: ['3', '2'],
   spots: [],
   stop: 0,
+  ahead: null,
   link: 'https://discord.com/channels/1/3',
   attendance: attendance(4, 1),
   may: { arrange: false, clear: false, load: false },
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index c002df39e076343e091345d693c6e75737dc806b..991950b9a68c5bd89835d808da5b8b1355fe377d 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -67,7 +67,7 @@ import { pageWords } from './page-words.js';
 import type { PartyViewers } from './party-viewers.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import type { WebDeps } from './server.js';
-import { movesOnTheMap, refusalOnTheMap } from './train-views.js';
+import { aheadOnTheMap, movesOnTheMap, refusalOnTheMap } from './train-views.js';
 
 /**
  * The requests for a server's parties one address may make in a minute: a page asks every 20
@@ -387,14 +387,16 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Part
       const layout = parties.layoutOf(party.id);
       return layout === undefined ? undefined : postKey(layout);
     },
-    // Why Move… and Manage… do not open, in Discord's words (plan 8M-8C, review C1).
-    trainRefusal: (reason) =>
-      refusalOnTheMap(parties, reason, (text) => pageWords(text, parties.zone, deps.now())),
-    // Move… of a train as the post's dialog draws it (plan 8M-8C).
-    trainMoves: (train) =>
-      movesOnTheMap(parties.stops, train, (text) => pageWords(text, parties.zone, deps.now())),
+    // Why Move… and Manage… do not open, in Discord's words (review C1); Move… of a train as the
+    // post's dialog draws it, and what lies ahead (plan 8M-8C).
+    trainRefusal: (reason) => refusalOnTheMap(parties, reason, words),
+    trainMoves: (train) => movesOnTheMap(parties.stops, train, words),
+    trainAhead: (train) => aheadOnTheMap(parties.stops, train, words),
   });
 
+  /** The bot's words as text of the page, in the posts' zone. */
+  const words = (text: string): string => pageWords(text, parties.zone, deps.now());
+
   /**
    * How a post is drawn for a member (plan 8M-8A, `postView`): its picture only from the hosts the
    * page may load, links only to the addresses `linkableOnTheMap` allows, another post named by
diff --git a/src/web/train-move.test.ts b/src/web/train-move.test.ts
index 0207e99eba790f5169bdc0d7525233af094aae7d..6ead291b05c12240b9703e9a430d0d2aa176f171 100644
--- a/src/web/train-move.test.ts
+++ b/src/web/train-move.test.ts
@@ -193,6 +193,10 @@ describe('moving a train on the map', () => {
       ],
     });
     expect((await map.listed(BOB, 'Bob'))?.moves).toBeNull();
+    // What lies ahead, as the post's small print words it, for anybody (the map's Route, R3).
+    expect((await map.listed(BOB, 'Bob'))?.ahead).toBe(
+      'Route: 1. Veterans Memorial Bridge · 2. The Stacks · 3. Harbor Lighthouse Mural',
+    );
     await map.made.trains.setConductor(map.made.party.id, { id: REPORTER });
     expect((await map.listed(ALICE, 'Alice'))?.moves).toBeNull();
     expect((await map.listed(TEST_OWNER_ID, 'Owner'))?.moves?.place).toBe('4');
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index 6ba000a1f04754e85dfcf2ad6f0bb5d1f30ca592..7674f9ed69e43f03096b74e645c0e9eb9dfacd5d 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -38,7 +38,7 @@ import {
 import { manageForm, ROUTE_CHOICES } from '../render/train-dialogs.js';
 import { splitForm } from '../render/train-split.js';
 import { RaidPrivacy } from '../domain/party/status.js';
-import { formChoice, movesOnTheMap, refusalOnTheMap } from './train-views.js';
+import { aheadOnTheMap, formChoice, movesOnTheMap, refusalOnTheMap } from './train-views.js';
 import { NO_START_TO_REMOVE, TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import { UserError } from '../discord/errors.js';
@@ -304,6 +304,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       trainRefusal: (reason) => refusalOnTheMap(parties, reason, words),
       // Move… as the post's dialog draws it (plan 8M-8C).
       trainMoves: (train) => movesOnTheMap(parties.stops, train, words),
+      trainAhead: (train) => aheadOnTheMap(parties.stops, train, words),
     });
     return shown?.kind === 'train' ? shown : undefined;
   };
diff --git a/src/web/train-views.ts b/src/web/train-views.ts
index 3716948a3b045c89b01aed1b8da4ae085f527c7d..3401a2e5c60f65ae6af14c8fc332643dd2b7f15f 100644
--- a/src/web/train-views.ts
+++ b/src/web/train-views.ts
@@ -5,6 +5,7 @@ import type { TrainParty } from '../domain/party/party.js';
 import type { MapMoveRefusal, MapMoves } from '../domain/web/party-data.js';
 import type { MapFormChoice } from '../domain/web/train-data.js';
 import { moveForm } from '../render/train-dialogs.js';
+import { aheadText } from '../render/train-post.js';
 import type { StopLookup } from '../render/train-stops.js';
 import { UNREACHABLE } from './acting.js';
 
@@ -48,6 +49,16 @@ export function refusalOnTheMap(
   return words(reason === 'read-only' ? UNREACHABLE : trainRefusal(ctx, reason));
 }
 
+/** What lies ahead of a train as its post's small print says it (`aheadText`), in the map's words. */
+export function aheadOnTheMap(
+  stops: StopLookup,
+  party: TrainParty,
+  words: (text: string) => string,
+): string | undefined {
+  const ahead = aheadText({ party, stop: stops });
+  return ahead === undefined ? undefined : words(ahead);
+}
+
 /** A choice of a dialog as the map's form shows it: its options' descriptions as their lines. */
 export function formChoice(choice: DialogChoice): MapFormChoice {
   return {
````

### Task 6: 8M-8C task 6: a stop dragged in the stop list of route mode

Prototype commit: `0750d586e126025d8ae26e90d07416c5b0d3b1ad`

Who may arrange the route drags a stop by its handle in the route
editor's stop list, with a mouse, a pen or a finger (pointer events,
the handle touch-action: none, the pointer captured by it): the row it
would land at is marked, and a drop is one /route move (moveStopAs over
the existing edit route) with the route as it was when the drag began;
a drop where the stop was, or a cancel, moves nothing. No drag begins
while edits wait or are on their way (RouteEdits.busy). Up, down and
the position menu stay the keyboard's way. The pure part is StopDrag
and dropPosition; no new dependency.


# Conflicts:
#	src/web/client/train-ui.isolated.test.ts

**Files:**

```
 src/web/client/map.css                   |  23 +++++++++++++++++++++++
 src/web/client/train-forms.test.ts       |  81 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-forms.ts            | 121 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 src/web/client/train-ui.isolated.test.ts | 145 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/train-ui.ts               |  96 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 5 files changed, 460 insertions(+), 6 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 0750d586e126025d8ae26e90d07416c5b0d3b1ad -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8C task 6: a stop dragged in the stop list of route mode`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 691567a32ae04ccea52cf6b67c0cef0c62661e8c..434f1e5bd65ddc14c8c38cda675daa9e5508f31a 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1229,6 +1229,29 @@ path.highlighted {
   font-weight: 600;
 }
 
+/*
+ * A stop's handle to drag it by in the stop list (plan 8M-8C, R6): a finger's drag moves the stop,
+ * not the page (`touch-action: none`), and the row it would land at is marked. At least 32 pixels
+ * each way, for a finger (review C9).
+ */
+.route-stop .drag-handle {
+  display: inline-flex;
+  flex: none;
+  align-items: center;
+  justify-content: center;
+  min-width: 32px;
+  min-height: 32px;
+  color: var(--muted);
+  cursor: grab;
+  touch-action: none;
+  user-select: none;
+}
+
+.route-stop.drop-target {
+  border-radius: var(--radius);
+  box-shadow: inset 0 0 0 2px var(--train);
+}
+
 .route-stop .press {
   margin-top: 0;
   padding: 1px 6px;
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 4db8dd1c8658e6b4674cb766bb5878d8044af22f..aa0354a506e214d60a2c05320920127ff0719be0 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -6,6 +6,8 @@ import type { MapGym, PageNode } from './popup.js';
 import {
   conductorBody,
   drawnTrains,
+  dropPosition,
+  edgeScroll,
   keepTools,
   newTrainButton,
   routeEditBody,
@@ -17,6 +19,7 @@ import {
   sendTrainForm,
   startBody,
   startForm,
+  StopDrag,
   stopName,
   trainActions,
   trainAnswerOf,
@@ -439,6 +442,84 @@ describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
   });
 });
 
+describe('dragging a stop in the stop list (plan 8M-8C, R6)', () => {
+  /** Three rows of the stop list, 30 pixels high each from 100. */
+  const rows = [
+    { top: 100, bottom: 130 },
+    { top: 130, bottom: 160 },
+    { top: 160, bottom: 190 },
+  ];
+
+  it('gives every stop a handle to drag for who may arrange the route, and none otherwise', () => {
+    const handles = (shown: MapTrain) =>
+      all(routeEditor(shown, gym, []))
+        .filter((one) => (one.className ?? '').split(' ').includes('drag-handle'))
+        .map((one) => one.attributes?.['data-drag']);
+    expect(handles(train())).toEqual(['1', '2', '3']);
+    expect(handles(train({ may: { arrange: false, clear: false, load: false } }))).toEqual([]);
+    expect(handles(train({ route: ['4'], stop: 0 }))).toEqual([]);
+  });
+
+  it('lands a stop at the row the pointer is over, above the first at the first, below the last at the last', () => {
+    expect(dropPosition(90, rows)).toBe(1);
+    expect(dropPosition(110, rows)).toBe(1);
+    expect(dropPosition(145, rows)).toBe(2);
+    expect(dropPosition(175, rows)).toBe(3);
+    expect(dropPosition(400, rows)).toBe(3);
+  });
+
+  it('makes one move of a drop, with the route as it was when the drag began; none where it lands where it was', () => {
+    const drag = new StopDrag();
+    expect(drag.begin(3, ['4', '1', '7'], false)).toBe(true);
+    expect(drag.over(110, rows)).toBe(1);
+    expect(drag.drop()).toEqual({ from: 3, to: 1, drawn: ['4', '1', '7'] });
+    expect(drag.drop()).toBeUndefined();
+    drag.begin(2, ['4', '1', '7'], false);
+    drag.over(145, rows);
+    expect(drag.drop()).toBeUndefined();
+    // Off while edits wait or are on their way.
+    expect(drag.begin(1, ['4', '1', '7'], true)).toBe(false);
+    expect(drag.over(175, rows)).toBeUndefined();
+    expect(drag.drop()).toBeUndefined();
+    drag.begin(1, ['4', '1', '7'], false);
+    drag.over(175, rows);
+    drag.cancel();
+    expect(drag.drop()).toBeUndefined();
+  });
+
+  // Review C2: a second finger, or a pointer event of another, moves nothing of the drag.
+  it('follows only the pointer that began the drag, until the drag ends', () => {
+    const drag = new StopDrag();
+    drag.begin(3, ['4', '1', '7'], false, 1);
+    expect(drag.follows(1)).toBe(true);
+    expect(drag.follows(2)).toBe(false);
+    drag.cancel();
+    expect(drag.follows(1)).toBe(false);
+  });
+
+  // Review C9: a stop dragged near an edge of the docked pane scrolls its list.
+  it('scrolls the list while the pointer is near an edge of the pane, faster nearer, not in its middle', () => {
+    const pane = { top: 100, bottom: 500 };
+    expect(edgeScroll(300, pane)).toBe(0);
+    expect(edgeScroll(130, pane)).toBeLessThan(0);
+    expect(edgeScroll(105, pane)).toBeLessThan(edgeScroll(130, pane));
+    expect(edgeScroll(470, pane)).toBeGreaterThan(0);
+    expect(edgeScroll(495, pane)).toBeGreaterThan(edgeScroll(470, pane));
+    // Beyond the pane, as fast as it goes.
+    expect(edgeScroll(40, pane)).toBe(edgeScroll(100, pane));
+    expect(edgeScroll(900, pane)).toBe(edgeScroll(500, pane));
+    // A pane too low to have edges, or none drawn, does not scroll.
+    expect(edgeScroll(110, { top: 100, bottom: 160 })).toBe(0);
+    expect(edgeScroll(10, { top: 0, bottom: 0 })).toBe(0);
+  });
+
+  it('sends a dropped move with the route it was drawn from, not the one the train has by then', () => {
+    expect(
+      routeEditBody('move', train(), { from: '3', to: '1', drawn: ['4', '1', '7', '2'] }),
+    ).toEqual({ body: { drawn: ['4', '1', '7', '2'], from: 3, to: 1 } });
+  });
+});
+
 describe('the edits of route mode, one at a time (RouteEdits)', () => {
   /** An edit sent and waiting for its answer, which the test gives. */
   interface Waiting {
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index e7c68c1f2ac871f58b35d2f1a512b97d097a897e..07a6c31714542bc8f1406295872b79349bd53e32 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -372,10 +372,11 @@ export interface RouteEditorFilled {
 
 /**
  * The route editor of route mode, in the side panel (spec 3.7): the train's stops in order, the
- * one it is at marked, each with up, down, a move to any position and remove for who may arrange
- * the route (`stopControls`; up, down and a position rather than dragging, which the map's side
- * panel does not need); "Clear the route" for who may (`/route clear`); the member's saved routes
- * of its region to load (who may) or forget, and a name to save the route under; Done. A gym
+ * one it is at marked, each for who may arrange the route with a handle to drag it by (plan 8M-8C,
+ * R6: a pointer's way, `StopDrag`) and up, down, a move to any position and remove (the
+ * keyboard's way, `stopControls`); "Clear the route" for who may (`/route clear`); the member's
+ * saved routes of its region to load (who may) or forget, and a name to save the route under;
+ * Done. A gym
  * clicked on the map, or a Power Spot of its layer tapped (plan 8M-8C, R5), is added as the next
  * stop (`/route add`); while the map shows no Power Spot (`spotsShown` false: their layer off or
  * the map zoomed out too far), the hint says how to have them. `saved` is undefined while the
@@ -401,6 +402,22 @@ export function routeEditor(
             tag: 'li',
             className: here ? 'route-stop here' : 'route-stop',
             children: [
+              // A handle to drag the stop by (plan 8M-8C, R6), for a pointer: the keyboard's way
+              // is up, down and the position menu.
+              ...(train.may.arrange && count > 1
+                ? [
+                    {
+                      tag: 'span',
+                      className: 'drag-handle',
+                      text: '⠿',
+                      attributes: {
+                        'data-drag': String(number),
+                        title: 'Drag to move this stop',
+                        'aria-hidden': 'true',
+                      },
+                    },
+                  ]
+                : []),
               {
                 tag: 'span',
                 className: 'stop-name',
@@ -491,6 +508,11 @@ export interface RouteEditValues {
   to?: string;
   route?: string;
   name?: string;
+  /**
+   * The route a move was drawn from where it is not the train's when the edit is sent: a drop
+   * of a drag sends the route as it was when the drag began (plan 8M-8C, R6).
+   */
+  drawn?: readonly string[];
 }
 
 /**
@@ -502,7 +524,7 @@ export function routeEditBody(
   train: MapTrain,
   values: RouteEditValues,
 ): TrainBody {
-  const drawn = [...train.route];
+  const drawn = [...(values.drawn ?? train.route)];
   const whole = (text: string | undefined): number | undefined => {
     const value = Number(text);
     return text !== undefined && text !== '' && Number.isInteger(value) && value > 0
@@ -567,6 +589,95 @@ export function routeModeEnds(answer: TrainAnswered): boolean {
   return !answer.ok && answer.train === undefined && answer.status === 409;
 }
 
+/** A row of the stop list as the page draws it: its top and bottom on the screen. */
+export interface DragRow {
+  top: number;
+  bottom: number;
+}
+
+/**
+ * Where a stop dragged in the stop list lands (plan 8M-8C, R6): the position (from 1, as `/route
+ * move` takes it) of the row the pointer is over; above the first row the first, below the last
+ * the last, between two rows the one below.
+ */
+export function dropPosition(y: number, rows: readonly DragRow[]): number {
+  const over = rows.findIndex((row) => y < row.bottom);
+  return over === -1 ? Math.max(1, rows.length) : over + 1;
+}
+
+/** How near an edge of the stop list's pane a dragged stop scrolls it, in pixels (`edgeScroll`). */
+const SCROLL_EDGE = 40;
+
+/** The most a frame scrolls the pane while a stop is dragged, in pixels. */
+const SCROLL_STEP = 12;
+
+/**
+ * How far to scroll the stop list's pane in a frame while a stop is dragged with the pointer at
+ * `y` (review C9: the docked pane on a phone shows a few rows): up (negative) within
+ * `SCROLL_EDGE` of its top, down within it of its bottom, the faster the nearer, at most
+ * `SCROLL_STEP` (also beyond the pane); nothing in its middle, nor in a pane too low to have
+ * edges.
+ */
+export function edgeScroll(y: number, pane: { top: number; bottom: number }): number {
+  if (pane.bottom - pane.top < 3 * SCROLL_EDGE) return 0;
+  const step = (inside: number): number =>
+    Math.ceil((SCROLL_STEP * (SCROLL_EDGE - Math.max(0, inside))) / SCROLL_EDGE);
+  if (y < pane.top + SCROLL_EDGE) return -step(y - pane.top);
+  if (y > pane.bottom - SCROLL_EDGE) return step(pane.bottom - y);
+  return 0;
+}
+
+/**
+ * A stop dragged by its handle in the route editor (plan 8M-8C, R6): it begins at a stop with the
+ * route as drawn then (not while edits wait or are on their way: `busy`), follows the pointer
+ * from row to row (`over`, the position it would land at), and a drop is one move (`drop`: from,
+ * to and the route drawn, none where it lands where it was). A cancel (the pointer lost, Escape,
+ * the editor drawn anew: review C2) drops nothing. It follows the pointer that began it only
+ * (`follows`: a second finger is not the drag).
+ */
+export class StopDrag {
+  private dragged:
+    { from: number; drawn: readonly string[]; to: number; pointer: number | undefined } | undefined;
+
+  /** Whether a drag is on. */
+  get active(): boolean {
+    return this.dragged !== undefined;
+  }
+
+  /**
+   * Begins a drag of the stop `from` by the pointer `pointer` (its `pointerId`); false while edits
+   * are busy (nothing begins).
+   */
+  begin(from: number, drawn: readonly string[], busy: boolean, pointer?: number): boolean {
+    this.dragged = busy ? undefined : { from, drawn: [...drawn], to: from, pointer };
+    return this.dragged !== undefined;
+  }
+
+  /** Whether a drag is on, begun by this pointer. */
+  follows(pointer: number): boolean {
+    return this.dragged !== undefined && this.dragged.pointer === pointer;
+  }
+
+  /** The pointer at `y` over the rows: where the stop would land, none without a drag. */
+  over(y: number, rows: readonly DragRow[]): number | undefined {
+    if (!this.dragged) return undefined;
+    this.dragged.to = dropPosition(y, rows);
+    return this.dragged.to;
+  }
+
+  /** The drop: the move to make, or none (no drag, or back where it was); the drag ends. */
+  drop(): { from: number; to: number; drawn: readonly string[] } | undefined {
+    const dropped = this.dragged;
+    this.dragged = undefined;
+    return dropped === undefined || dropped.to === dropped.from ? undefined : dropped;
+  }
+
+  /** The drag ends without a move. */
+  cancel(): void {
+    this.dragged = undefined;
+  }
+}
+
 /** What `RouteEdits` works with. */
 export interface RouteEditsDeps {
   /** The train being arranged as the last answer gave it; undefined once route mode ended. */
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 5fd9ca4f50cf64ca133ef5e6468d5b75c9292efe..aed84f94bdd6bd43b2e05b5430b6892ba507ae56 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -116,10 +116,12 @@ class FakeElement {
    * fixes the way up first: an element taken out of the page meanwhile still has its event go up
    * to its old ancestors), until a listener stops it.
    */
-  dispatch(type: string): void {
+  dispatch(type: string, more: { clientY?: number; pointerId?: number } = {}): void {
     let stopped = false;
     const event = {
       target: this,
+      ...more,
+      preventDefault: () => undefined,
       stopPropagation: () => {
         stopped = true;
       },
@@ -134,6 +136,18 @@ class FakeElement {
     return upward(this).find((at) => matches(at, selector)) ?? null;
   }
 
+  /** Where it is drawn: its row of the stop list as a test lays it out (`box`). */
+  box = { top: 0, bottom: 0 };
+
+  getBoundingClientRect(): { top: number; bottom: number } {
+    return this.box;
+  }
+
+  /** A pointer captured (a drag): the events go to this element, as they are dispatched here. */
+  setPointerCapture(): void {
+    return undefined;
+  }
+
   querySelectorAll(selector: string): FakeElement[] {
     const below = (element: FakeElement): FakeElement[] =>
       element.childNodes.flatMap((child) => [child, ...below(child)]);
@@ -295,9 +309,20 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
   const notices = new Count();
   const said: string[] = [];
   const notice = make('div');
+  /** The page's own key listeners (a drag's Escape), and a key pressed anywhere on it. */
+  const keyListeners = new Set<(event: { key: string }) => void>();
   const document = {
     createElement: make,
     getElementById: (id: string) => (id === 'notice' ? sayer : null),
+    addEventListener: (type: string, listener: (event: { key: string }) => void) => {
+      if (type === 'keydown') keyListeners.add(listener);
+    },
+    removeEventListener: (type: string, listener: (event: { key: string }) => void) => {
+      if (type === 'keydown') keyListeners.delete(listener);
+    },
+  };
+  const keyDown = (key: string): void => {
+    for (const listener of [...keyListeners]) listener({ key });
   };
   // The notice's text, as `say` sets it.
   const sayer = new Proxy(notice, {
@@ -406,6 +431,7 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
     finished,
     action,
     modes,
+    keyDown,
   };
 }
 
@@ -494,6 +520,123 @@ describe('route mode (trainUi)', () => {
     expect(field('select[name]')?.value).toBe('5');
   });
 
+  // Plan 8M-8C, R6: a stop dragged in the stop list and dropped is one `/route move`.
+  it('moves a stop dragged by its handle and dropped on another row, with the route as it was drawn', async () => {
+    const shown = page();
+    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
+    await shown.drawn.reached(2);
+    const editor = editorOf(shown.tools);
+    const rows = editor.querySelectorAll('li');
+    rows.forEach((row, index) => {
+      row.box = { top: 100 + 30 * index, bottom: 130 + 30 * index };
+    });
+    const handle = rows[2]?.querySelector('.drag-handle');
+    if (!handle) throw new Error('no handle on the third stop');
+    handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
+    handle.dispatch('pointermove', { clientY: 140, pointerId: 1 });
+    handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
+    expect(rows[0]?.className.split(' ')).toContain('drop-target');
+    handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
+    expect(rows.some((row) => row.className.split(' ').includes('drop-target'))).toBe(false);
+    await shown.requests.reached(2);
+    expect(shown.sent.at(-1)).toEqual({
+      url: `/s/${GUILD}/api/trains/t1/route/move`,
+      body: { drawn: ['4', '1', '7'], from: 3, to: 1 },
+    });
+    // A drop where the stop was sends nothing.
+    await shown.drawn.reached(3);
+    const again = editorOf(shown.tools).querySelectorAll('li');
+    again.forEach((row, index) => {
+      row.box = { top: 100 + 30 * index, bottom: 130 + 30 * index };
+    });
+    const second = again[1]?.querySelector('.drag-handle');
+    second?.dispatch('pointerdown', { clientY: 145, pointerId: 2 });
+    second?.dispatch('pointerup', { clientY: 145, pointerId: 2 });
+    expect(shown.sent).toHaveLength(2);
+  });
+
+  /**
+   * Route mode on a page, drawn and with the saved routes in, and the handle of a stop of the
+   * editor drawn last, its rows laid out 30 pixels high from 100.
+   */
+  const dragging = async (answer?: Parameters<typeof page>[0]) => {
+    const shown = page(answer);
+    shown.ui.actionClicked(shown.action('data-route-train', 't1'), train());
+    await shown.drawn.reached(2);
+    const handleOf = (stop: number) => {
+      const rows = editorOf(shown.tools).querySelectorAll('li');
+      rows.forEach((row, index) => {
+        row.box = { top: 100 + 30 * index, bottom: 130 + 30 * index };
+      });
+      const handle = rows[stop - 1]?.querySelector('.drag-handle');
+      if (!handle) throw new Error(`no handle on stop ${stop}`);
+      return { handle, rows };
+    };
+    return { shown, handleOf };
+  };
+  /** The stops whose rows are marked as where the dragged stop would land. */
+  const marked = (rows: FakeElement[]) =>
+    rows.flatMap((row, index) =>
+      row.className.split(' ').includes('drop-target') ? [index + 1] : [],
+    );
+
+  // Review C2: a drag never outlives the editor it began in.
+  it('drops nothing of a drag whose editor was drawn anew between the press and the release', async () => {
+    const longer = train({ route: ['4', '1', '7', '2'] });
+    const { shown, handleOf } = await dragging((url) =>
+      url.endsWith('/route/add')
+        ? { status: 200, body: { ok: true, text: 'Stop 4 is added.', train: longer } }
+        : undefined,
+    );
+    const old = handleOf(3);
+    old.handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
+    old.handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
+    // A gym clicked meanwhile is added: its answer draws the editor anew.
+    const riverside = GYMS.get(2);
+    if (!riverside) throw new Error('no Riverside Gazebo');
+    shown.ui.gymClicked(riverside);
+    await shown.drawn.reached(3);
+    expect(marked(old.rows)).toEqual([]);
+    old.handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
+    expect(shown.sent.map(({ url }) => url.split('/').slice(-2).join('/'))).toEqual([
+      't1/routes',
+      'route/add',
+    ]);
+  });
+
+  // Review C2: Escape, a pointer lost and another pointer move nothing.
+  it('ends a drag on Escape or when its pointer is lost, and follows the pointer that began it only', async () => {
+    const { shown, handleOf } = await dragging();
+    const escaped = handleOf(3);
+    escaped.handle.dispatch('pointerdown', { clientY: 175, pointerId: 2 });
+    escaped.handle.dispatch('pointermove', { clientY: 110, pointerId: 2 });
+    expect(marked(escaped.rows)).toEqual([1]);
+    shown.keyDown('Escape');
+    expect(marked(escaped.rows)).toEqual([]);
+    escaped.handle.dispatch('pointerup', { clientY: 110, pointerId: 2 });
+    // The pointer lost (the browser took it back).
+    const lost = handleOf(3);
+    lost.handle.dispatch('pointerdown', { clientY: 175, pointerId: 3 });
+    lost.handle.dispatch('pointermove', { clientY: 110, pointerId: 3 });
+    lost.handle.dispatch('lostpointercapture', { pointerId: 3 });
+    expect(marked(lost.rows)).toEqual([]);
+    lost.handle.dispatch('pointerup', { clientY: 110, pointerId: 3 });
+    // Another pointer's moves and release are not the drag's.
+    const other = handleOf(3);
+    other.handle.dispatch('pointerdown', { clientY: 175, pointerId: 4 });
+    other.handle.dispatch('pointermove', { clientY: 110, pointerId: 5 });
+    other.handle.dispatch('pointerup', { clientY: 110, pointerId: 5 });
+    expect(marked(other.rows)).toEqual([]);
+    other.handle.dispatch('pointerup', { clientY: 175, pointerId: 4 });
+    expect(shown.sent.map(({ url }) => url.split('/').slice(-2).join('/'))).toEqual(['t1/routes']);
+    // The drag that follows moves the stop.
+    other.handle.dispatch('pointerdown', { clientY: 175, pointerId: 6 });
+    other.handle.dispatch('pointermove', { clientY: 110, pointerId: 6 });
+    other.handle.dispatch('pointerup', { clientY: 110, pointerId: 6 });
+    await shown.requests.reached(2);
+    expect(shown.sent.at(-1)?.body).toEqual({ drawn: ['4', '1', '7'], from: 3, to: 1 });
+  });
+
   // Plan 8M-8C, R5: a Power Spot of the map's layer is a stop to tap in route mode, as a gym is.
   it('adds a Power Spot tapped in route mode as the next stop, by its key; out of route mode a tap is its own', async () => {
     const shown = page();
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index 26e4db711b08e7e767721d171abeec2c23669727..1eecc8b1ff2c8cf56f28c26d114f159a1c9867ab 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -21,6 +21,8 @@ import {
   routeModeEnds,
   sendTrainForm,
   spotsHint,
+  StopDrag,
+  edgeScroll,
   startBody,
   startForm,
   type RouteEditorFilled,
@@ -175,12 +177,104 @@ export function trainUi(deps: TrainUiDeps) {
     },
   });
 
+  /** A stop dragged in the route editor (plan 8M-8C, R6). */
+  const drag = new StopDrag();
+  /** Ends the drag that is on, what it marked and listens for with it; none without one. */
+  let endDrag: (() => void) | undefined;
+
+  /**
+   * Dragging a stop by its handle in the stop list, with a mouse, a pen or a finger (pointer
+   * events, the handle `touch-action: none` in `map.css`, the pointer captured by it): not while
+   * edits wait or are on their way; the row it would land at marked as the pointer moves, the
+   * list's pane scrolled while the pointer is near its top or bottom (`edgeScroll`, review C9);
+   * a drop is one `/route move` with the route as it was when the drag began. Only the pointer
+   * that began it is followed, and it ends without a move when that pointer is lost (the
+   * browser's `pointercancel`, `lostpointercapture`), on Escape, and when the editor is drawn
+   * anew (`drawRoute`; review C2). The keyboard's way is up, down and the position menu.
+   */
+  const dragsIn = (editor: HTMLElement): void => {
+    const rows = (): HTMLElement[] => [...editor.querySelectorAll<HTMLElement>('li')];
+    const mark = (at: number | undefined): void => {
+      rows().forEach((row, index) => {
+        const others = row.className.split(' ').filter((name) => name !== 'drop-target');
+        row.className = [...others, ...(index + 1 === at ? ['drop-target'] : [])].join(' ');
+      });
+    };
+    const boxes = () => rows().map((row) => row.getBoundingClientRect());
+    /** The pane the stop list scrolls in (the side pane, docked under the map on a phone). */
+    const pane = (): HTMLElement | null => deps.tools.closest<HTMLElement>('#parties');
+    /** Where the pointer was last, and the frame that scrolls the pane, while one is asked. */
+    let lastY = 0;
+    let frame: number | undefined;
+    const scrolling = (): void => {
+      frame = undefined;
+      const scroller = pane();
+      if (!drag.active || !scroller) return;
+      const step = edgeScroll(lastY, scroller.getBoundingClientRect());
+      if (step === 0) return;
+      scroller.scrollTop += step;
+      mark(drag.over(lastY, boxes()));
+      frame = requestAnimationFrame(scrolling);
+    };
+    const escape = (event: KeyboardEvent): void => {
+      if (event.key === 'Escape') endDrag?.();
+    };
+    editor.addEventListener('pointerdown', (event) => {
+      const handle =
+        event.target instanceof HTMLElement
+          ? event.target.closest<HTMLElement>('.drag-handle')
+          : null;
+      if (!handle || !routing || drag.active) return;
+      const { route } = routing.train;
+      if (!drag.begin(Number(handle.dataset.drag), route, edits.busy, event.pointerId)) return;
+      event.preventDefault();
+      handle.setPointerCapture(event.pointerId);
+      document.addEventListener('keydown', escape);
+      endDrag = () => {
+        endDrag = undefined;
+        drag.cancel();
+        mark(undefined);
+        document.removeEventListener('keydown', escape);
+        if (frame !== undefined) cancelAnimationFrame(frame);
+        frame = undefined;
+      };
+    });
+    editor.addEventListener('pointermove', (event) => {
+      if (!drag.follows(event.pointerId)) return;
+      lastY = event.clientY;
+      mark(drag.over(event.clientY, boxes()));
+      const scroller = pane();
+      if (frame === undefined && scroller && edgeScroll(lastY, scroller.getBoundingClientRect())) {
+        frame = requestAnimationFrame(scrolling);
+      }
+    });
+    editor.addEventListener('pointerup', (event) => {
+      if (!drag.follows(event.pointerId)) return;
+      drag.over(event.clientY, boxes());
+      const dropped = drag.drop();
+      endDrag?.();
+      if (dropped === undefined) return;
+      void edits.add('move', {
+        from: String(dropped.from),
+        to: String(dropped.to),
+        drawn: dropped.drawn,
+      });
+    });
+    for (const lost of ['pointercancel', 'lostpointercapture'] as const) {
+      editor.addEventListener(lost, (event) => {
+        if (drag.follows(event.pointerId)) endDrag?.();
+      });
+    }
+  };
+
   /**
    * Draws the route editor and the numbered stops anew, from the train as it is now, with the
    * name typed and the saved route picked in the editor drawn before (`changed` overrides them).
+   * A stop being dragged in the editor before is dropped nowhere (review C2).
    */
   const drawRoute = (changed: RouteEditorFilled = {}): void => {
     if (!routing) return;
+    endDrag?.();
     const { train, saved } = routing;
     const before = deps.tools.firstElementChild;
     // What the editor before showed of them (not a field it did not have: no saved routes while
@@ -207,6 +301,7 @@ export function trainUi(deps: TrainUiDeps) {
     editor.addEventListener('change', (event) => {
       moveChosen(event);
     });
+    dragsIn(editor);
     deps.tools.replaceChildren(editor);
     if (edits.busy) editorControls(false);
     deps.overlay.show(train);
@@ -231,6 +326,7 @@ export function trainUi(deps: TrainUiDeps) {
   const endRoute = async (opened: MapTrain | undefined): Promise<void> => {
     const ended = routing;
     if (!ended) return;
+    endDrag?.();
     routing = undefined;
     toolsIdle();
     deps.overlay.clear();
````

### Task 7: 8M-8C task 7: docs, the controls table and the staging checklist

Prototype commit: `43428a60886e461972398ae479b10426d7161bc0`

web.md: the trains' addresses (GET and POST .../manage and .../split),
their limits and windows, the CONTROLS table (Move..., Manage...,
Route, Split... as the map's forms; no "Do this on Discord" variant
left, only starting a new group), MapTrain's moves and ahead, the
retired presses (404 for an old bundle), route mode with Power Spots,
dragging and its place on a phone, and a section "A train's dialogs as
forms" with the shared functions moved out of the Discord handlers.
trains.md: manageTrainAs and splitForm, the map's old panel gone.
testing.md: where the new tests are. The staging checklist
2026-10-27-phase-8m8c-staging.md, step 0 the page built before the bot.

From the preview: Route's line of what lies ahead in the post's small
print, and the position menu of a stop as wide as its words.

**Files:**

```
 docs/architecture/testing.md                            |  4 ++--
 docs/architecture/trains.md                             | 14 +++++++-------
 docs/architecture/web.md                                | 32 +++++++++++++++++++++-----------
 docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md | 61 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/map.css                                  | 12 ++++++++++++
 src/web/client/post-draw.ts                             |  4 +++-
 6 files changed, 106 insertions(+), 21 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 43428a60886e461972398ae479b10426d7161bc0 -- src test docs/architecture docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-8C task 7: docs, the controls table and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index b723d84a08542adcf0edc00b80b15399a1b6f8b5..c458aaac3c6ae8809209dcd0243a6b4b9aad8c21 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -54,7 +54,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Trains
 
-- Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`; `add` takes a gym by its number). Stops (plan 8X-4): `stops(4, 1, <Wayfarer id>)` a route of gyms by number and Power Spots by Wayfarer id, `gym(n)` one gym (`test/support/parties.ts`), `inGyms(value)` a value with every gym stop as its id, for an expectation written by gym ids (both sides of a matcher); `createdTrain({ route, kind }, { wayspots })` takes gym numbers or stops, a kind, and the kept Wayspots (`wayspotsWith`, Power Spots by `keptRow(n, { kind: 'powerspot', lat, lon })` inside West, 40.00 to 40.10 north, -80.10 to -80.00) for the party and train services alike. Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`. A split (plan 8T) goes through `made.trains.split` (the service's `splits` is the party service); what happens while the new post is made is tested by holding `gateway.createPost` (`holdPost` in `train-split.test.ts`, as the relocate tests do; it moves the clock on as making a post takes time), what happens between the new post and the paired write of both trains by holding a write of the old train (`holdOldTrain`: the new train's id is made to sort after the old one's, or before it, which decides whose lock `updateBoth` takes first), a failed paired write by `failingPairs` (and a failed save by `failingSaves`), and a stop before the paired write by both, `restarted(made)` and `settlePendingSplits()`; a train's ids sort by `createdAt` and then id, so a test finds the new train by its id, not by its place in `store.active()`.
+- Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` (with `setAtEnd(member, staff, atEnd)` and `reverse(member, staff, from?, first?)`, Manage…'s `TrainService.manage` drawn where the train is now unless told otherwise; plan 8M-8C, review C5) and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`; `add` takes a gym by its number). Stops (plan 8X-4): `stops(4, 1, <Wayfarer id>)` a route of gyms by number and Power Spots by Wayfarer id, `gym(n)` one gym (`test/support/parties.ts`), `inGyms(value)` a value with every gym stop as its id, for an expectation written by gym ids (both sides of a matcher); `createdTrain({ route, kind }, { wayspots })` takes gym numbers or stops, a kind, and the kept Wayspots (`wayspotsWith`, Power Spots by `keptRow(n, { kind: 'powerspot', lat, lon })` inside West, 40.00 to 40.10 north, -80.10 to -80.00) for the party and train services alike. Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`. A split (plan 8T) goes through `made.trains.split` (the service's `splits` is the party service); what happens while the new post is made is tested by holding `gateway.createPost` (`holdPost` in `train-split.test.ts`, as the relocate tests do; it moves the clock on as making a post takes time), what happens between the new post and the paired write of both trains by holding a write of the old train (`holdOldTrain`: the new train's id is made to sort after the old one's, or before it, which decides whose lock `updateBoth` takes first), a failed paired write by `failingPairs` (and a failed save by `failingSaves`), and a stop before the paired write by both, `restarted(made)` and `settlePendingSplits()`; a train's ids sort by `createdAt` and then id, so a test finds the new train by its id, not by its place in `store.active()`.
 
 ## Wayfarer
 
@@ -88,7 +88,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a Power Spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
 - Max battles on the map (plan 8X-5): `maxReportingWith(safety, rows)` (`test/support/max-reporting.ts`) gives the services of `reportsWith` (without the moderators' channel unless `safety` names it), the max bosses of the recorded feed, the recorded max and big events, the kept Power Spot `SPOT_ROW` at `TEST_SPOT` (and `rows`), and a context over them whose place search is built (`ctx`); fake `Date` to `MAX_THURSDAY` (an ordinary Thursday, 14:00) first, and set the web server's `clock.now` to it (move both together to pass time). `maxWebWith(ctx, { channelName })` gives the web server what `/max` reads and calls; pass it as `maxes` beside `partyWebWith(made, …)`, whose `maxLook` shows a max battle as its post does (`reportedMax` for one made through the service). Without it every use of the max deps throws. A block at a pin: `made.storage.addBlock`; the moderators' notice: `made.reports.flush()`, then `made.gateway.messagesIn(MOD_CHANNEL)`; a spot in two regions: East's outline reaching into West (`made.regions.rows`), as for spawns.
 - Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
-- Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode, the Move panel) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events, the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
+- Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index b49c1fde6fee7ca5121bf8763e690a2f47de5f6a..8006a078a680c976b8da50634351d8b277072cbf 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -10,24 +10,24 @@ The third kind of party: a route of gyms and Power Spots, a kind (raids, Dynamax
 
 ## Changes and movement
 
-- Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `reverse`, `setAtEnd`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its stop through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
+- Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `manage` (Manage…'s one change of the kind, the route and the mode; since plan 8M-8C, review C5, the only way to reverse the route or set the kind or the mode: `reverse`, `setAtEnd` and `setKind` went with the map's panel, their last callers), `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its stop through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
 - Who may edit is one rule each in `train.ts`, which the domain functions, the live map's view and its routes all ask: `mayNotArrange` (add, remove, move a stop: signed up, the maker, staff), `mayNotClear` (the conductor and staff; `/route clear` counts bot developers as staff), `mayNotLoad` (who may move the train, or the maker its first route), `mayNotMove`. An edit of the route may carry the route it was drawn from (`drawn`, the live map's route editor: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `loadRoute` and `saveRoute` take it last): the service refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`); a command gives none. So may a change of the conductor carry whose the role was as the map drew its button (`seen`, `ConductorSeen`: `setConductor` and `clearConductor` take it last), refused inside the store when the role is somebody else's by now (`conductorDrawn`, reason `conductor-changed`).
-- What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `reverseRouteAs`, `setAtEndAs` and `setKindAs` (plan 8X-5) word the map's panel's Reverse, mode and kind; Manage…'s Submit says them in the same words), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). Move… and Manage… answer in the commands' words too (plan 8X-G). `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
+- What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `manageTrainAs` is Manage…'s Submit (plan 8M-8C: moved out of `move.ts`, so that the dialog and the map's form share it, with `manageRefusal`, `movedOnWords` and `splitRefusalFor`; the map's panel's `reverseRouteAs`, `setAtEndAs` and `setKindAs` are gone with that panel, and `TrainService.reverse`, `setAtEnd` and `setKind` with them)), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). Move… and Manage… answer in the commands' words too (plan 8X-G). `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
 - A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym or a Power Spot is a stop only when it lies in a region of the train's server (`reaches`, `stopRegionsInGuild`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
-- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), Manage…'s menu (plan 8X-G; Manage… opens only for who may move the train and staff, so `setAtEnd`'s `mayArrange` matters for a dialog opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so Manage… (and the map's panel) also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
+- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), Manage…'s menu (plan 8X-G; Manage… opens only for who may move the train and staff, so `setAtEnd`'s `mayArrange` matters for a dialog opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so Manage… (on Discord and on the map) also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
 
 ## The post, Move… and Manage…
 
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
 - A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Its buttons are in the third row of the post's controls (plan 8X-1B: the rows of a raid, `parties-and-posts.md`; row 1 Interested, Join, Here, Leave, row 2 −1, +1, Remote, row 3 the train's own after Group…, `bottomControls`'s `opens`). Plan 8X-G (Matt, 2026-10-22): **Group… · Move… · Manage… · Split… · Route**, short words and no emoji (on a train Group… has none either), five buttons in one row: "Move…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; only while the train has a route; the action of "Manage train…" before, so the button of a post not drawn anew opens Move…, or Manage… on a train without a route), "Manage…" (`party:<id>:manage`, `manageTrainButton`, `moves: true`), "Split…" (below) and, on a route longer than `WHOLE_ROUTE_STOPS`, "Route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`; it only shows, so it has no `…`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then.
-- Move… and Manage… are dialogs (plan 8X-G, the design talk of 2026-10-22: a post control that needs more input opens a dialog; `src/render/train-dialogs.ts`, handlers `openMove`, `submitMove`, `openManage`, `submitManage` in `src/commands/trains/move.ts`), for who may move the train and for staff, both alike (`mayNotMove`, refused privately before the dialog opens), each the first answer of its press, with the per-open token (`openToken`), and each Submit deferred privately at once and decided again. **Move…** (`moveDialog`): where the train is as text without links (`trainStateText`: `At stop 2 of 4: **X**` / `Next is **Y**`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`; of a finished route only `The train has finished its route of N stops.`, plan 8X-H: where Submit takes it is said once, after it, without naming Previous, which the dialog does not have), then one radio choice "Where to" (the title says the act; the controller's call, review r0) of the moves that can be made from here (`offeredMoves`; a move `cannotMove` refuses is left out, not switched off; Finish is in Manage…): `Next: <stop>` picked and first (at the last stop `Next: finish the route`, `Next: round to <first>`, `Next: turn back to <stop>`), `Previous: <stop>` (of a finished route `Previous: back to stop N, <stop>`, which takes a mistaken Finish back; at the last stop of a turn-back route, where Next turns back to the very stop Previous goes to, `Previous: back to <stop> (undo)` with the description `Back one stop, still heading for the end: undoes a Next made by mistake`, `UNDO_DESCRIPTION`: plan 8X-H, Matt 2026-10-23, Next reverses the route and Previous keeps its direction; left out only where it is the very move Next is, the same route in the same order and the same stop, a loop of two stops, `previousIsNext`), `Skip <next stop>, go to <stop after>`. A choice's value is `<move>:<target>` (`targetOf`), its label from `stopLabel` with no markdown, a name cut to fit Discord's 100 (each of Skip's two to 40) and given whole in the description where it was cut. With one move left (a finished route; stop 1 of a route of two that finishes) there is no choice (a radio group takes two to ten, review R1): the text says what Submit does (`Submit takes it back to stop 2, **X**.`) and the custom id carries the move. The custom id, `party:<id>:moveform:<place>[:<move>:<target>]:~<token>`, carries where the train was (`placeOf`, by `stopHandle`). Submit runs `moveTrainAs` with `from` and `target`, so the store decides: two Submits of Next drawn at one stop move it once, and a dialog drawn before somebody else moved the train, or changed its route, answers `The train has moved on since you opened this: ` and where it is now (`train-moved-on`, `route-changed`); otherwise the answer is `/next`'s (`whereText`, "I am telling the others."; of a finished route `whereText` names what takes it back as the member has it there, `TrainSurface`, plan 8X-H: `` `/previous` takes it back to stop 4: … `` for a typed command, `Move… takes it back …` for the post's dialogs, Move…'s and Manage…'s Submits, `Previous takes it back …` for the map's panel, which has a Previous button). Closing the dialog moves nothing. **Manage…** (`manageDialog`): where the train is (of a finished route only `The train has finished its route of N stops.`: where Previous leads is Move…'s; review r0 B3), then "The route", a radio choice (Keep it as it is, picked and first; Reverse it where `cannotReverse` allows, on a finished route with the description `Starts the route again from its last stop, <stop>, the other way round` (the name cut to fit); Finish it here while the route is not finished; left out where only Keep is left), and the menus "At the end of the route" (`AT_END_MENU_LABELS`, their emoji, `AT_END_DESCRIPTIONS`) and "What the train is mainly for" (`TRAIN_KIND_QUESTION`, below), each with the train's own picked (menus, review R7: Android picks a radio group's first choice whatever is marked); a train without a route is asked its kind alone (`NO_ROUTE_YET`). Its custom id `party:<id>:manageform:<place>:<first>:<mode>:<kind>:~<token>` carries where the train was, the stop the route began with (`NO_FIRST`, `-`, without a route) and the mode and the kind it showed, a letter each (`AT_END_CODES`, `KIND_CODES`): Submit applies only what was picked otherwise than shown (review R5: a dialog opened before somebody set the mode does not set it back), and answers `Nothing changed.` where nothing was; a refused Submit of several parts adds `Nothing was changed.` (review r0 B2). What it applies is one change, `TrainService.manage(partyId, member, staff, { kind?, route?: 'reverse' | 'finish', atEnd? }, { from, first })` (review R6): the kind (`setTrainKind`, which asks nothing of where the train is), then the route (`reverseRoute` with `from` and `first`, or Finish, `moveTrain('finish', from)`, announced as a move is, `movedFrom`), then the mode (`setAtEnd`, which asks nothing of where the train is unless the route changed in the same Submit, then where that change left it: review r0 B1, so a kind and a mode picked in a dialog drawn before somebody moved the train are applied), in one store change: one write, one line in the post (the parts' lines in that order), the route judged before the mode (Reverse refused on a turn-back route whatever mode comes with it), a refusal of any part refusing all, each part for whom it was before (the mode `mayArrange` and staff). Its answer says what it did in the words of the commands and the map (`trainKindSentence`, `The route is reversed.`, `atEndSentence`, then `whereText` after a change of the route; a finished route is said by `whereText` alone, `The train has finished its route of N stops.`, staging of 8X-H, H2); a change of the route from a dialog drawn where the train no longer is answers as Move…'s. Both dialogs count as presses of the post (`ACTION_THROTTLE`). The Manage train panel of plans 3C to 8X-4 (`trainPanel`, its moves, Reverse and two menus, `OLD_PANEL`) is gone (review R16): its controls (`next`, `previous`, `skip`, `finish`, `reverse`, `atend`, `kind`, still `PARTY_ACTIONS`) answer `STALE_COMPONENT`, so a panel still open in a client changes nothing. `whereText`, `movementText` and the menus' words are in `src/render/train-words.ts`. The DM brief of a train is unchanged (`placeLine`).
+- Move… and Manage… are dialogs (plan 8X-G, the design talk of 2026-10-22: a post control that needs more input opens a dialog; `src/render/train-dialogs.ts`, handlers `openMove`, `submitMove`, `openManage`, `submitManage` in `src/commands/trains/move.ts`), for who may move the train and for staff, both alike (`mayNotMove`, refused privately before the dialog opens), each the first answer of its press, with the per-open token (`openToken`), and each Submit deferred privately at once and decided again. **Move…** (`moveDialog`): where the train is as text without links (`trainStateText`: `At stop 2 of 4: **X**` / `Next is **Y**`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`; of a finished route only `The train has finished its route of N stops.`, plan 8X-H: where Submit takes it is said once, after it, without naming Previous, which the dialog does not have), then one radio choice "Where to" (the title says the act; the controller's call, review r0) of the moves that can be made from here (`offeredMoves`; a move `cannotMove` refuses is left out, not switched off; Finish is in Manage…): `Next: <stop>` picked and first (at the last stop `Next: finish the route`, `Next: round to <first>`, `Next: turn back to <stop>`), `Previous: <stop>` (of a finished route `Previous: back to stop N, <stop>`, which takes a mistaken Finish back; at the last stop of a turn-back route, where Next turns back to the very stop Previous goes to, `Previous: back to <stop> (undo)` with the description `Back one stop, still heading for the end: undoes a Next made by mistake`, `UNDO_DESCRIPTION`: plan 8X-H, Matt 2026-10-23, Next reverses the route and Previous keeps its direction; left out only where it is the very move Next is, the same route in the same order and the same stop, a loop of two stops, `previousIsNext`), `Skip <next stop>, go to <stop after>`. A choice's value is `<move>:<target>` (`targetOf`), its label from `stopLabel` with no markdown, a name cut to fit Discord's 100 (each of Skip's two to 40) and given whole in the description where it was cut. With one move left (a finished route; stop 1 of a route of two that finishes) there is no choice (a radio group takes two to ten, review R1): the text says what Submit does (`Submit takes it back to stop 2, **X**.`) and the custom id carries the move. The custom id, `party:<id>:moveform:<place>[:<move>:<target>]:~<token>`, carries where the train was (`placeOf`, by `stopHandle`). Submit runs `moveTrainAs` with `from` and `target`, so the store decides: two Submits of Next drawn at one stop move it once, and a dialog drawn before somebody else moved the train, or changed its route, answers `The train has moved on since you opened this: ` and where it is now (`train-moved-on`, `route-changed`); otherwise the answer is `/next`'s (`whereText`, "I am telling the others."; of a finished route `whereText` names what takes it back as the member has it there, `TrainSurface`, plan 8X-H: `` `/previous` takes it back to stop 4: … `` for a typed command, `Move… takes it back …` for the post's dialogs, Move…'s and Manage…'s Submits, on Discord and on the map alike since plan 8M-8C (the map's panel with its Previous button, and the surface `map`, are gone)). Closing the dialog moves nothing. **Manage…** (`manageDialog`): where the train is (of a finished route only `The train has finished its route of N stops.`: where Previous leads is Move…'s; review r0 B3), then "The route", a radio choice (Keep it as it is, picked and first; Reverse it where `cannotReverse` allows, on a finished route with the description `Starts the route again from its last stop, <stop>, the other way round` (the name cut to fit); Finish it here while the route is not finished; left out where only Keep is left), and the menus "At the end of the route" (`AT_END_MENU_LABELS`, their emoji, `AT_END_DESCRIPTIONS`) and "What the train is mainly for" (`TRAIN_KIND_QUESTION`, below), each with the train's own picked (menus, review R7: Android picks a radio group's first choice whatever is marked); a train without a route is asked its kind alone (`NO_ROUTE_YET`). Its custom id `party:<id>:manageform:<place>:<first>:<mode>:<kind>:~<token>` carries where the train was, the stop the route began with (`NO_FIRST`, `-`, without a route) and the mode and the kind it showed, a letter each (`AT_END_CODES`, `KIND_CODES`): Submit applies only what was picked otherwise than shown (review R5: a dialog opened before somebody set the mode does not set it back), and answers `Nothing changed.` where nothing was; a refused Submit of several parts adds `Nothing was changed.` (review r0 B2). What it applies is one change, `TrainService.manage(partyId, member, staff, { kind?, route?: 'reverse' | 'finish', atEnd? }, { from, first })` (review R6): the kind (`setTrainKind`, which asks nothing of where the train is), then the route (`reverseRoute` with `from` and `first`, or Finish, `moveTrain('finish', from)`, announced as a move is, `movedFrom`), then the mode (`setAtEnd`, which asks nothing of where the train is unless the route changed in the same Submit, then where that change left it: review r0 B1, so a kind and a mode picked in a dialog drawn before somebody moved the train are applied), in one store change: one write, one line in the post (the parts' lines in that order), the route judged before the mode (Reverse refused on a turn-back route whatever mode comes with it), a refusal of any part refusing all, each part for whom it was before (the mode `mayArrange` and staff). Its answer says what it did in the words of the commands and the map (`trainKindSentence`, `The route is reversed.`, `atEndSentence`, then `whereText` after a change of the route; a finished route is said by `whereText` alone, `The train has finished its route of N stops.`, staging of 8X-H, H2); a change of the route from a dialog drawn where the train no longer is answers as Move…'s. Both dialogs count as presses of the post (`ACTION_THROTTLE`). The Manage train panel of plans 3C to 8X-4 (`trainPanel`, its moves, Reverse and two menus, `OLD_PANEL`) is gone (review R16): its controls (`next`, `previous`, `skip`, `finish`, `reverse`, `atend`, `kind`, still `PARTY_ACTIONS`) answer `STALE_COMPONENT`, so a panel still open in a client changes nothing. `whereText`, `movementText` and the menus' words are in `src/render/train-words.ts`. The DM brief of a train is unchanged (`placeLine`).
 
-- On the live map the Manage train panel stays (plan 8X-G changed only the post; the map's panel waits for its UX pass): it opens in the train's popup in place of its actions ("Manage…") and stays open after each move, as the post's does (`web.md`, "Trains on the map"); the popup keeps the click that drew the panel (`keepClicksInPopup`: before plan 8S-3 Leaflet took it for a click on the map, the Manage… button being out of the page by then, and closed the popup at once).
+- On the live map (plan 8M-8C; `web.md`, "A train's dialogs as forms") Move…, Manage… and Split… are the post's dialogs as forms in the place of the post, drawn by the dialogs' own builders (`moveForm`, `manageForm`, `splitForm`) and submitted to their Submits' functions (`moveTrainAs`, `manageTrainAs`, `splitGroupAs`), opened and refused as the dialogs are (`manageRefusal`, `splitRefusalFor`); the Manage train panel of plans 8M-5 to 8X-5 is gone there too, its presses `finish`, `reverse`, `at-end` and `kind` answering 404. The conductor's buttons are the member's part under the post (`/conductor`'s, not Manage…'s). The route editor is the side pane's route mode, with stops dragged in its list and Power Spots tapped on the map.
 
 ## Kinds and Power Spots (plan 8X-4)
 
-- **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid; its hint `What the train is mainly for (its stops can be gyms or Power Spots)`) and Manage…'s menu "What the train is mainly for" (plan 8X-G; `TRAIN_KIND_QUESTION`; the choices `Raids`, `Dynamax Battles`, `Gigantamax Battles`, `trainKindChoice`, the same for `/train kind:`; `TrainService.manage`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through the same service (`setKindAs`, `POST …/move/kind`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices, which name what the train is mainly for): the post's heading and brief, `/help`; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
+- **The kind** (design `2026-10-20-max-battles-design.md`, 6.1): `train.kind` (`TrainKind`, which is `BattleKind`: `raid`, `dynamax`, `gigantamax`; party state version 14, a train of an older document is `raid`), set by `/train kind:` (default raid; its hint `What the train is mainly for (its stops can be gyms or Power Spots)`) and Manage…'s menu "What the train is mainly for" (plan 8X-G; `TRAIN_KIND_QUESTION`; the choices `Raids`, `Dynamax Battles`, `Gigantamax Battles`, `trainKindChoice`, the same for `/train kind:`; `TrainService.manage`, `setTrainKind`: for who may move the train and staff; the same kind is no change; a line `<doer> made this a Gigantamax Train.`); the live map sets it through Manage…'s form (plan 8M-8C, `manageTrainAs`, `POST …/manage`) and makes a train with a kind (plan 8X-5, `web.md`). Its words are one set, `TRAIN_KIND_WORDS` (`Raid Train`, `Max Battle Train`, `Gigantamax Train`; kept in `src/domain/web/party-data.ts` since plan 8X-5, where the map's view and a page may take it, and given on by `render/train-words.ts`; `trainKindChoice` for the choices, which name what the train is mainly for): the post's heading and brief, `/help`; the new-train DM and the summary line name a max train's kind, a raid train's stays "train". It sets the lobby (`lobbySize`: a Gigantamax train `lobbies.gigantamax`, so Join fills its groups; a raid and a Dynamax train none; `splitLobby` only a raid train), at once when changed (groups already made stay), the forum tag (a Dynamax or Gigantamax train is tagged `Max battle` too) and `/counters` in its post (a Dynamax train the max counters at the boss's Dynamax tier where a max boss list names it, else `tier:` is asked; a Gigantamax train the Gigantamax tier; a raid train raid counters as before). `/boss` takes any Pokémon whatever the kind (`trainBoss`).
 - **Planned ahead:** `/train start:` (a time as `/meet` reads it, `typedTimedTime` over `newPartyTimes('train', now)`, read by the guard first so that a refusal is not counted) makes the train with its start; its route may stay empty until the day (a train with no time still goes a day after it was made). Manage… opens on a train without a route too, with its kind alone (so a kind set wrongly at `/train` can be changed before the first stop); the post shows no Move… until the first stop.
 - **Stops** (design 6.2; `src/domain/party/stops.ts`): `StopRef` is `{ kind: 'gym', id }` or `{ kind: 'powerspot', id }` (a Wayfarer id); `stopKey` names one as text (`'12'`, `'w<Wayfarer id>'`: no colon, not `p`), by which stops are the same (`sameStop`, `whereOf` for whether a change moved the train) and the map's `MapTrain.route` is made; `stopHandle` is what a control carries (a gym's id; the first 8 hex characters of an FNV-1a hash of a Wayfarer id, so the dialogs' custom ids and choices stay within 100 characters with the longest ids, tested), checked against the route when pressed (`stopsByHandle`: no match is `train-moved-on` for a place, two `route-changed`). Every function of `train.ts` works on stops. A Power Spot is shown as a gym stop (`src/render/train-stops.ts`: `PostStop`, `stopsFrom` over the gyms and the kept Wayspots, `stopLabel` `<title> (Power Spot)` in lists, the dialogs and the movement announcement, `stopLink`, `stopWhere`: Where with its address, Map and Wayfarer picture); one no longer kept as a Power Spot (gone, or an import made it a PokéStop or gym: a train's spot never becomes a stop of another kind) is `Unknown Power Spot`, refused when added (`spot-gone`) and taken off by `removeUnknownStops` as an unknown gym is (never while no Wayspot is kept, `WayspotProvider.size`). `/where` in a train at a spot names it with its Map; a gym target, a request and the moderators' place are of gyms (a spot is the moderators' place too).
 - **`/route add stop:`** (renamed from `gym:`): its list is the `PlaceFinder`'s of kinds `gym` and `powerspot`, each choice by its kind and where it is (`placeLabel`), a Dynamax or Gigantamax train offered Power Spots first among places that fit as well, a raid train gyms (`mergePlaces`' `kindsFirst`; a better fit first whatever its kind); with nothing typed the region's gyms as before, a max train's the region's Power Spots by name ahead of them (`regionSpotChoices`, shared with `/max spot:`). A value is `gym:<id>` or `powerspot:<Wayfarer id>` (an old `g:<id>` still read); typed text is a gym by `reportedGym`'s rule and a Power Spot by `clearOf`'s, and the train's own kind decides first (`typedStop`): its stop beyond doubt is taken, and its several (some fitting every word) are "Several places fit", unless the other kind's stop beyond doubt fits the typed text strictly better than that stop or the best of those several (`PlaceFit`, `TypedSide.several.best`; design 6.2: a better match first, whatever its kind; a gym beyond doubt fits at least as a word's fit; a tie is the train's kind's), so a raid train finds gyms as before unless a Power Spot fits strictly better, and a max train takes a gym's exact full name though several Power Spots contain its words (plan 8X-F, the staging's "Allegheny Station"); without one, or with a list of guesses only (no place of that kind of the server has every word as typed; for gyms, no gym of the server has every word as typed), the other kind's stop beyond doubt, else several or none. A raid train may add Power Spots. `/route remove stop:` keeps its stop number. `/route move`'s answer says where the stop stands now (`… is stop 2 of the route now, before **Y**.`, or `the last`) and, when the number of the stop the train is at changed, that the train stays (`The train is still at **Y**, now stop 3.`, or `at it` for the very stop moved); its `to` choices, `from` given, say where the stop would stand (`2. before Y`, `4. after Z`, `3. X (where it is)`; Matt, 2026-10-24: a member took the move for one of the train).
@@ -42,7 +42,7 @@ The third kind of party: a route of gyms and Power Spots, a kind (raids, Dynamax
 - No window between the writes: the old train's loss of the group and the new train's carry-over commit together or not at all, so nobody can end on both trains or on neither. What is left is the new post of a split whose write never committed: a stop of the process after the new post and before the write, or a failed write whose take-back could not end the new train. It stays pending (`train.splitFrom.pending`, in the state document) while the old train still has the group, and `settlePendingSplits` takes it back, each under the moves lock of its old train: once Discord is there after a start (`app.ts`: taking one back deletes a post), and with the clock's hourly upkeep those made a minute ago or more (`PartySchedulerOptions.splits`: the old train's moves lock keeps a split under way apart from the upkeep, which finds it settled once it has the lock; the minute's age only spares it waiting behind one), logging how many it settled and took back only when it did any; one it could not end stays pending for the next try and is not counted. A pending train whose old train is still active and lists it in `splitOff` cannot come of this code (only 8T's first build, which wrote the two trains one after the other, could leave one); it is settled as it is stored and logged as an error, since the group is on no other train. Only an active old train is seen (the store keeps no ended party): the pending train of an old train that ended is taken back, whatever the old one listed. A commit whose acknowledgement is lost (the connection drops after MySQL committed) is the same rare risk as for any `update`: the split's take-back then ends the new train although the old one lost the group, which leaves the group on neither train in the database (memory still has it on the old train) until the old train's next write stores it again, and a restart before that write makes the loss permanent (the restarted process reads the old train without the group); accepted as the same rare risk as any `update`.
 - Then the old post says `<doer> split group B (Fast) off into a train of its own.` (a line, no ping) and the new post `<doer> split this train off with group B (Fast).`, pinging the members who moved and allow `mentions`, never the presser (`doer`: a maker who asked not to be named is not; `This train was split off with …` then).
 - The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "Split…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out; "✂️ Split group…" before plan 8X-G) stands after Manage… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 32 components since plan 8X-G (Move… and Manage… for Manage train…; 31 since plan 8X-1B, each group one text; before, 44 with four groups folded to 40).
-- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens, within `DIALOG_READ_MS` of the interaction (`readInTime`, plan 8Q): past it no dialog opens and the member is told `SLOW_READ` privately. "Split…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>:~<token>`. The other (mockup v6, Matt, 2026-10-20: a big train split in person into groups of 17 needs everybody named, and a second line in every choice said the same) is one text display and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups`, in letter order (plan 8X-G, Matt 2026-10-22, every list of groups; before, the group with the most members first and the presser's own last, as Android picks the first choice by itself), nothing marked (the group that leaves is picked on purpose; an iPhone refuses Submit until one is). The text says what is the same for every group, with the new train's name for the first group as the example of `named after the group`; then, once, who leads the new train for each group whose train somebody would lead (`leadSentences`: `If group A leaves, you go with it as its conductor, and <train> has none then.`, and for staff in a group `If group C leaves, you go with it as its conductor.`; nothing for a group whose train would have none); then a line per group in the choices' order (`groupLines`): `**Group B (Fast)** (4 trainers): Cilan +1, Dawn, Iris`, the members as the post lists them (`groupInPostOrder`, by name with their guests, those without a name counted in `, and N more`), the trainers counted with their guests as the post counts them (`headCount`); when the lines would pass Discord's 4,000 characters (`TEXT_ROOM`), every group names the same number of members and how many more. Each choice is only `Group B (Fast) · 4 trainers` (the group's label cut to 40, the whole to 100), with no description, its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform:~<token>` (each opening its own `openToken`, left out at Submit, so that Discord's client never shows a pick submitted before; an id without it still submits). A choice's label is the group's label as it is (Discord is assumed to show no markdown there, as in a select's options; 8T staging step 28 checks it), the text is made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Split… and Submit count as presses of the post; `/group split` counts in its own window (both `ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split.
+- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens, within `DIALOG_READ_MS` of the interaction (`readInTime`, plan 8Q): past it no dialog opens and the member is told `SLOW_READ` privately. "Split…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>:~<token>`. The other (mockup v6, Matt, 2026-10-20: a big train split in person into groups of 17 needs everybody named, and a second line in every choice said the same) is one text display and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups`, in letter order (plan 8X-G, Matt 2026-10-22, every list of groups; before, the group with the most members first and the presser's own last, as Android picks the first choice by itself), nothing marked (the group that leaves is picked on purpose; an iPhone refuses Submit until one is). The text says what is the same for every group, with the new train's name for the first group as the example of `named after the group`; then, once, who leads the new train for each group whose train somebody would lead (`leadSentences`: `If group A leaves, you go with it as its conductor, and <train> has none then.`, and for staff in a group `If group C leaves, you go with it as its conductor.`; nothing for a group whose train would have none); then a line per group in the choices' order (`groupLines`): `**Group B (Fast)** (4 trainers): Cilan +1, Dawn, Iris`, the members as the post lists them (`groupInPostOrder`, by name with their guests, those without a name counted in `, and N more`), the trainers counted with their guests as the post counts them (`headCount`); when the lines would pass Discord's 4,000 characters (`TEXT_ROOM`), every group names the same number of members and how many more. Each choice is only `Group B (Fast) · 4 trainers` (the group's label cut to 40, the whole to 100), with no description, its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform:~<token>` (each opening its own `openToken`, left out at Submit, so that Discord's client never shows a pick submitted before; an id without it still submits). A choice's label is the group's label as it is (Discord is assumed to show no markdown there, as in a select's options; 8T staging step 28 checks it), the text is made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Split… and Submit count as presses of the post; `/group split` counts in its own window (both `ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split. The dialog's text and choices are `splitForm` (plan 8M-8C), from which `splitDialog` draws, and so does the live map's Split… form (`GET` and `POST …/trains/<id>/split`, `web.md`, "A train's dialogs as forms"), refused before it opens by `splitRefusalFor`, as "Split…" is.
 - The history records each train on its own (`history.md`: the step `split`, `PartyHistoryAttendee.splitOff`, `PartyHistory.splitFromId`; a pending train has no history until it is settled).
 
 ## Saved routes
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index cefd8db8813779c2b097b1cb8a0f2869e47eea11..4ba5ed173925b8f2f3fb639e149612a6fd7d3360 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the post's controls as forms, `POST /s/<guild>/api/parties/<party id>/regroup`, `GET` and `POST …/meet`, `POST …/close` and `GET` and `POST …/report` (plan 8M-8B; `postControlRoutes`, `src/web/post-control-routes.ts`: static segments, which Fastify's router takes before the presses' `:action`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties`, `POST /s/<guild>/api/parties/<party id>/<action>`, a party's post `/s/<guild>/api/parties/<party id>/post` and the pictures of places beside a post `/s/<guild>/pictures/gym/<id>` and `/s/<guild>/pictures/wayspot/<id>` (plan 8M-8A) (`partyRoutes`, `src/web/party-routes.ts`); the post's controls as forms, `POST /s/<guild>/api/parties/<party id>/regroup`, `GET` and `POST …/meet`, `POST …/close` and `GET` and `POST …/report` (plan 8M-8B; `postControlRoutes`, `src/web/post-control-routes.ts`: static segments, which Fastify's router takes before the presses' `:action`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>`, `POST …/conductor/<change>`, and `GET` and `POST …/manage` and `…/split` (plan 8M-8C, static segments) (`trainRoutes`, `src/web/train-routes.ts`); the meetups' `POST /s/<guild>/api/meetups`, `POST /s/<guild>/api/meetups/<party id>/<change>` and `/s/<guild>/api/stops` (`meetupRoutes`, `src/web/meetup-routes.ts`); the max battles' `/s/<guild>/api/powerspots`, `/s/<guild>/api/max-options` and `POST /s/<guild>/api/maxes` (`maxRoutes`, `src/web/max-routes.ts`, plan 8X-5); the reports at stops' `/s/<guild>/api/stop-reports`, `/s/<guild>/api/research-options`, `/s/<guild>/api/rocket-options`, `POST /s/<guild>/api/research`, `POST /s/<guild>/api/rocket` and `POST /s/<guild>/api/stop-reports/<id>/remove` (`stopRoutes`, `src/web/stop-routes.ts`, plan 8R-3); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle. `/pictures/<key>.png` (plan 8R-6; `pictureRoutes`, `src/web/server.ts`, `WebDeps.pictures`: `StopPictures.read`): the square pictures of the reports at stops (`stop-reports.md`, "Pictures at the stops"), public, only a key of 32 lower-case hex digits that the service made (anything else 404), `image/png`, the eggs' thirty-day `Cache-Control`, the address carrying `?v=` of what it shows. `/emoji/<id>.png` (plan 8M-8A; `emojiRoutes`, `src/web/server.ts`, `WebDeps.emoji`: `EmojiPictures`): the application's emoji a post shows, public, only an id the application has (anything else 404), fetched once from Discord's CDN and kept for good (below, "A party's popup is its post"). `/eggs/<name>.png` (plan 8D-F; `eggRoutes`, `src/web/server.ts`): the square raid egg pictures of `pictures/eggs/` that posts of eggs show by address (`eggPictures`), public (Discord's media proxy fetches them), only the names `raidEggName` gives (anything else 404), `image/png`, `Cache-Control: public, max-age=2592000` (thirty days), read once and kept; no rate limit, as `/assets/`. Posts name them with `?v=<8 hex>` of the file's SHA-256 (`EggPictures`), which the route ignores, and only once the server listens. Discord must reach `publicUrl` for them: on this machine's address (`isLocalAddress`), and before the server listens or when it could not, posts carry the eggs as files instead, and the map shows no egg (`allowedPicture` leaves out an `attachment://` picture).
 - The Wayspot export tool's addresses (plan 8W-P, below) are the one exception to `/s/<guild>/`: `/userscript` (the page and its POSTs) and `/userscript/<key>/pine-wayspot-export.user.js` and `….meta.js`, with every other path under `/userscript/` a plain 404 (`toolPageRoutes`, `toolFileRoutes`, `src/web/tool-routes.ts`). The tool is not a server's: one instance, the owner's, hands it to the admins of other instances.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters), to `/userscript` exactly (not `/userscript/`, `/userscript?x`, `/userscriptx` or `//userscript`), or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
@@ -30,7 +30,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, and whose one script, inline (`CONTINUE_SCRIPT`, `src/web/continue-script.ts`, let in by its hash: no file of its own, which was a third request to `/auth/` for every login), presses the button as the page is shown (Matt, 2026-10-25: no second tap): it submits with `requestSubmit`, or `submit` where a browser lacks it (Safari before 16), then disables the button and puts "Logging you in as <name>…" in place of the sentence, the name read as text from the form's `data-name` (escaped on the page; never HTML built of it), so that a tap while the POST is on its way cannot abort it after the link was spent and land on `?login=expired` (8M-7 review fix 1; `login.test.ts` runs the page's script against a small document of its form, button and sentence). A link preview or a prefetch runs no script, so it cannot spend the link; without script the button stays. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped). Pressed by the script, somebody else's link logs you in as them without a pause; the map's header names whose account it is (Matt's ruling, 2026-10-25). An unknown, used or expired link, or one of another server, leads (303) at once to the page its address names with `?login=expired`. `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, with `?region=<id>` for a link of `/maps` used in a region's channel, plan 8M-7, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The answers of `/maps` and `/region edit` say so under the button: "The button works once, within five minutes; do not share it: it logs in whoever opens it as you. Use /maps again for another." (Matt, 2026-10-18). The page's plain address is given only as code, after "To share the map, give its address:", which Discord does not make a link: tapped above the button, it opened the page logged out (Matt, 2026-10-25); the button is the one link in the answer. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`; +1, −1 and the completion question's answers among them since plan 8M-8B), Group…'s moves 30 a minute (`GROUP_WRITES_PER_ADDRESS_MINUTE`, plan 8M-8B), Meet…'s openings and Submits 30 a minute together (`MEET_PER_ADDRESS_MINUTE`), staff's closings 30 a minute (`CLOSE_PER_ADDRESS_MINUTE`), the reports' openings and Submits 30 a minute together (`REPORT_PER_ADDRESS_MINUTE`), a party's posts 120 a minute (`POSTS_PER_MINUTE`, plan 8M-8A), the places' pictures 240 a minute (`PLACE_PICTURES_PER_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Manage train panel in the window of the post's controls (as the post's panel counts; its kind menu too, plan 8X-5), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), and so +1, −1, an answer to the completion question and a move of Group… (plan 8M-8B: one use at the move; the form opens from the list, uncounted), Meet…'s Submit in `/meet`'s window (`MEET_WINDOW`, its opening refused while it is full, uncounted, as the post's `checks`), staff's Delete… in that of `/delete`'s dialog (`CLOSE_THROTTLE` of the controls `pclose`), a report in `/report`'s (`REPORT_WINDOW`, its opening refused while it is full, uncounted), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute (a login by link is two of them, its page and its POST; one with Discord two, `/auth/login` and `/auth/callback`), `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`; +1, −1 and the completion question's answers among them since plan 8M-8B), Group…'s moves 30 a minute (`GROUP_WRITES_PER_ADDRESS_MINUTE`, plan 8M-8B), Meet…'s openings and Submits 30 a minute together (`MEET_PER_ADDRESS_MINUTE`), staff's closings 30 a minute (`CLOSE_PER_ADDRESS_MINUTE`), the reports' openings and Submits 30 a minute together (`REPORT_PER_ADDRESS_MINUTE`), a party's posts 120 a minute (`POSTS_PER_MINUTE`, plan 8M-8A), the places' pictures 240 a minute (`PLACE_PICTURES_PER_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop; Move…'s, Manage…'s and Split…'s Submits among them since plan 8M-8C), the openings of a train's Manage… and Split… 30 a minute together (`TRAIN_FORMS_PER_ADDRESS_MINUTE`, plan 8M-8C), a member's saved routes 30 a minute, the writes of meetups 30 a minute together (`MEETUP_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stops` 60 a minute, `/s/*/api/powerspots` 60 a minute, `/s/*/api/max-options` 30 a minute, the reports of max battles 30 a minute (`MAX_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/stop-reports` 30 a minute (`STOP_REPORTS_PER_MINUTE`), `/s/*/api/research-options` and `/s/*/api/rocket-options` 30 a minute each, the reports at stops and their taking back 30 a minute together (`STOP_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`; a stop dragged and dropped is one, plan 8M-8C), the Submits of a train's Move…, Manage… and Split… in the window of the post's controls (plan 8M-8C, as their dialogs count; their openings uncounted, refused while the window is full), a report of a max battle in `/max`'s (`MAX_COMMAND`, `MAX_THROTTLE`), a research report in `/research report`'s and a Rocket report in `/rocket report`'s (`researchWindow`, `rocketWindow`: their limits come from the settings, so the window is the varied one, `{ command, varies: true }`), a taking back in `/research remove`'s or `/rocket remove`'s by the report's kind (`MEMBER_WRITE_THROTTLE`), the Remote switch of a party in the window of the post's controls (as its Remote button counts), and so +1, −1, an answer to the completion question and a move of Group… (plan 8M-8B: one use at the move; the form opens from the list, uncounted), Meet…'s Submit in `/meet`'s window (`MEET_WINDOW`, its opening refused while it is full, uncounted, as the post's `checks`), staff's Delete… in that of `/delete`'s dialog (`CLOSE_THROTTLE` of the controls `pclose`), a report in `/report`'s (`REPORT_WINDOW`, its opening refused while it is full, uncounted), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, a new meetup in `/meetup`'s (`MEETUP_THROTTLE`), a meetup's changes in `/name`'s, `/info`'s, `/end`'s and, for its start, `/meet`'s in a timed party (`START_THROTTLE`, `variedThrottleKey`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words); the work after it runs in `countedOnTheMap`, which gives the use back on an unexpected error or a `UserError` with `givesBack`, as the router does (a refusal stays counted; a write whose service answers a refusal with `givesBack`, a new train or meetup, gives it back itself with `givenBackOnTheMap`).
 
 ## The public map
 
@@ -80,15 +80,15 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's
   | Group… | `panel` `group` | for a newcomer to several groups the menu "Which group?" in the member's part (Interested, Join and Here send it); else Group…'s form (plan 8M-8B) from the list's `regroup`, or its refusal in the line under the buttons; off while read-only (X10). Starting a new group stays on Discord ("Start a new group on Discord →" in the form, Matt's ruling; where it is the only way, review W-1, Group… itself shows that line with the post's link and no form) |
   | Set time… | `panel` `time` | the raid's change form (8M-4) where `mayChange` (since 8M-8B anybody the map shows the raid to); else "Do this on Discord" |
   | Meet… | `panel` `meet` | Meet…'s form (plan 8M-8B), which asks the server what it offers (`GET …/meet`) and says its refusal in the line under the buttons; off while read-only |
-  | Move… | `panel` `moves` | the moves panel (8M-5) in place of the post's buttons where `MapTrain.panel`; else why not, as the server decides it and sends it with the train (`MapTrain.moveRefusal`, `moveRefusalOf`: the commands' `mayNotMove`, `not-conductor` or `not-attending`, and `no-route`, `read-only`; review N1), the page only wording it (`whyNot`): "Only the conductor or staff can move the train.", "Sign up for the train to move it.", "The train has no route yet: add a stop first.", "Discord cannot be reached just now, so nothing can be changed." |
-  | Manage… | `panel` `manage` | shows the conductor's part (Be the conductor, Stop being or Take off) and "What the train is mainly for: on Discord" where the member is the conductor, may take or drop the role, or set the kind (the kind menu and the rest of Manage… are plan 8M-8C's, X9); else who may, as for Move… |
-  | Route | `panel` `route` | shows the stop list, the train's stop marked |
+  | Move… | `panel` `moves` | Move…'s form (plan 8M-8C, R1), the post's dialog as the list carries it (`MapTrain.moves`): where the train is, Next, Previous and Skip in the dialog's words; else why not, as the server decides and words it and sends it with the train (`MapTrain.moveRefusal`: the reason, `moveRefusalOf`: the commands' `mayNotMove`, `not-conductor` or `not-attending`, and `no-route`, `read-only`; review N1; and its text, `refusalOnTheMap`: the words Discord says before Move… and Manage… open, `manageRefusal`'s, "This train has a conductor: only they and the moderators can move it.", "You are not signed up for this train.", without a route `/route add`'s "This train has no route yet. …", while read-only `UNREACHABLE`; plan 8M-8C, review C1), the page only saying it (`whyNot`), never wording a refusal itself |
+  | Manage… | `panel` `manage` | Manage…'s form (plan 8M-8C), the post's dialog as the server gives it when it opens (`GET …/manage`), for who may move the train and staff, also on a train without a route (its kind alone); else why not, the same words as Move…'s (`MapTrain.moveRefusal`). The conductor's buttons are the member's part, not Manage…'s (R2) |
+  | Route | `panel` `route` | shows the stop list, the train's stop marked, and what lies ahead as the post's small print words it (`MapTrain.ahead`, R3); route mode is the member's part's "Edit route", once (review C8) |
   | −1, +1 | `press` `less`, `more` | the map's press (plan 8M-8B, `MAP_COUNTS`), off unless `attendance.count` (never while read-only) |
-  | Split… | `discord` | "Do this on Discord →" under the buttons, the post's link (8M-8C) |
+  | Split… | `panel` `split` | Split…'s form (plan 8M-8C), the dialog the member would be shown, as the server gives it when it opens (`GET …/split`), or its refusal in the line under the buttons; off while read-only |
   | Screenshot feedback | `screenshot` | "Reported from a screenshot · feedback on Discord →" in its place, the post's link (Matt's ruling: feedback stays on Discord) |
   | anything else | `none` | off |
 
-  The raid's boss and moves (slash commands on Discord, no post button) stay the map's "Change…" in the member's part, as do a train's "Edit route" and a meetup's "Edit…". After plan 8M-8B what the map leaves to Discord is Split…, Manage… beyond the conductor and the kind's line, and the route editor (plan 8M-8C), and starting a new group (Matt's ruling: it needs a word with the others). What a post has no button for, the map's line has (plan 8M-8B): Report… for a member who sees the party's forum on Discord (`mayReport`: not for a forum they cannot see by their roles, review W-7, since a report without the moderators' channel writes into the post; not while read-only) and staff's Delete… (`mapControls`, beside Open on Discord). The completion question (its own message on Discord) is in the member's part, to the member it asked (`asked`): "Have you completed this raid?", when no answer counts as done in the reader's zone, "Yes, done" and "Not yet" (a press `answer`). **The view's version** (`POST_VIEW_VERSION`, `src/render/post-view.ts`, X6): folded into every `postKey` (`layoutKey` of the version, the table `CONTROLS` itself and the layout's JSON, review W-3), so that no browser keeps a view an older one drew under its key: a change of `CONTROLS` changes every key by itself, and the version is raised only with a change of how `postView` draws (1 since plan 8M-8B).
+  The raid's boss and moves (slash commands on Discord, no post button) stay the map's "Change…" in the member's part, as do a train's "Edit route", its conductor's buttons (`/conductor`'s, outside Manage…, R2) and a meetup's "Edit…". Since plan 8M-8C every dialog of a post has its form on the map, and `PostControl` has no "Do this on Discord" variant any more (R8): what the map leaves to Discord is starting a new group (Matt's ruling: it needs a word with the others; Group…'s line, not a control), and a panel the member may not use says why or links the post (`data-on-discord`). What a post has no button for, the map's line has (plan 8M-8B): Report… for a member who sees the party's forum on Discord (`mayReport`: not for a forum they cannot see by their roles, review W-7, since a report without the moderators' channel writes into the post; not while read-only) and staff's Delete… (`mapControls`, beside Open on Discord). The completion question (its own message on Discord) is in the member's part, to the member it asked (`asked`): "Have you completed this raid?", when no answer counts as done in the reader's zone, "Yes, done" and "Not yet" (a press `answer`). **The view's version** (`POST_VIEW_VERSION`, `src/render/post-view.ts`, X6): folded into every `postKey` (`layoutKey` of the version, the table `CONTROLS` itself and the layout's JSON, review W-3), so that no browser keeps a view an older one drew under its key: a change of `CONTROLS` changes every key by itself, and the version is raised only with a change of how `postView` draws (1 since plan 8M-8B; plan 8M-8C changed `CONTROLS` alone, so it stays 1).
 - **Drawing** (`post-draw.ts`, pure: `postCard`, `postPopup`, `mapLine`, `raidChoices`; trees of nodes set as text by `renderNode`, never HTML from data; `safeHref`, as strict as `linkableOnTheMap` (this server's channels, `/maps` itself, review 8A-13), and `safeSrc` check every address again; a picture beside a part that does not load is hidden, review 8A-15): the post's edge (`.post.accent-<name>`), headings, small print, `strong`, `em`, `u`, `s`, `code`, links in a tab of their own, the application's emoji as pictures the size of the text, times as `<time>` in the reader's own zone and language (`postTime`, `post-time.ts`: Discord's styles, `R` kept current every 15 s), the buttons in Discord's styles (`press primary|secondary|success|danger`, `icon` for icons alone; a section's button beside its text as the controls are, `beside-control`, review W-4). Under the post the member's own part (who they are in it, "You: Coming, group B · remote"; the group menu; Change…, Edit route, Edit…; Manage…'s and Route's sections, hidden until pressed; what is open under a post, the line to Discord too, kept by party across redraws, `PanelsOpen`, review 8A-10; the line by the button pressed, worded again at each draw from the party as it is then, review N3) and the map's line (distance from where the member is by `distanceWords`, once the browser said; Directions; Open on Discord). A popup is 280 to 380 pixels wide and scrolls beyond the map's height (`maxHeight`). A gym of several raids lists their heading lines with their times, each opening its post in the popup with "← All raids here" (ruling 14); a gym that shows its raid offers "Report spawn here" and "Meetup here" under it, never "Report raid" (`gymWithRaidBoxes`, review 8A-2); a party whose post the page has not got yet shows the map's own summary as before.
 - **Times in the reader's zone** (ruling 7): the posts, the list, the markers' badges and the popups' summaries give times in the reader's own zone, as Discord does (`readerZone`, `post-time.ts`); what the server words (answers through `pageWords`) and the forms that send typed times keep `settings.timezone`, and where the reader is in another the forms name it (review 8A-11, N4): the meetup editor after its times ("Starts now: 7:30 PM (Eastern)", `zoneNote`), and the raid report and change forms, a new train's and a new meetup's in a hint under their typed times ("Clock times are read in the server's zone (Eastern).", `zoneHint`, `zoneHintNodes`; a zone without a short generic name in its own words, "(India Standard)").
 - **The phone card** (`phone-card.ts`): narrower than 768 pixels a party opens as a card docked at the bottom in the place of its popup (the popup Leaflet opens is closed at once; `autoPan` off), with the popup's own content: its summary (the `head` block, the first row of buttons, the member's line and the map's line, by the roles, `map.css`), the whole post once the handle is tapped or the card swiped up (40 pixels, `SWIPE_PIXELS`); down again the summary, then closed, as a tap on the map, × or Escape (only while the focus is in it or nowhere); the click after a swipe is no tap; the focus goes to its handle and back where it was when it closes; what was tapped is panned above it; "← All raids here" stays in its summary (review 8A-8). A dialog named by the heading of what it shows (the post's, else the name of the map's summary, else "Party"; review W-6). The list's line opens the same card. Drawn anew with each list and when its post comes, never under a form; a form in it claims the hold as the card's (`formPlace` says `'card'`; review N2), which no Leaflet popup's closing touches, and the card's closing lets it go (`PhoneCard`'s `onClose`, `hold.cardClosed`, review 8A-1), also when another party opens in the card's place; closed once its party is gone.
@@ -106,6 +106,16 @@ Brief `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its "Aft
 - **+1, −1 and the completion question** are presses of `partyRoutes` (above). The question's words are the import-free `src/render/completion-words.ts`, which the question's message on Discord uses too.
 - **The page** (`src/web/client/post-forms.ts`, pure: each form as a tree of nodes in Discord's dialog look, `.post-form` on `--dialog-bg`, its title, text, choice, Submit and Cancel; the bodies; `sendPostForm` over `pressParty`; the DOM side `post-forms-ui.ts`): a form opens in the place of the post of the button pressed (in its popup, its line of the list or the phone card: `formPlace`), held by `FormHold` (taken at the press, before a `GET`; drawn only while its claim holds and its place is in the page); Cancel or Escape put the post back and the focus on the button that opened the form (`focusBack`, review W-5), and after a form went through, the post drawn anew, on that control found again there (`sameControl` of `list-ui.ts`, review N-1); a refusal is said under the form and in the notice, and the form stays (but Group…'s, review W-2); a success or a party over puts the post back (Delete… closes the popup or card) and asks for the list. `formControls` turns `data-regroup`, `data-meet`, `data-close-party` and `data-report-party` off while another form holds.
 
+## A train's dialogs as forms (plan 8M-8C)
+
+Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "After the builder check" rulings R1 to R9). A train's post's Move…, Manage… and Split… are forms of the map over their dialogs' code paths, drawn by the dialogs' own builders, with the checks of every write ("Adding a route") in the trains' routes (`trainRoutes`, `src/web/train-routes.ts`). Each counts one use in the window of the post's controls (`ACTION_THROTTLE`) at its Submit, as the dialog's Submit counts; an opening that asks the server is uncounted and refused while that window is full (`opening`: who opens it by the member fetched fresh, `actingOnTheMap`, so whether they are staff is fresh; the train as the store has it, 409; its forum, 403, 503), 30 a minute per address (`TRAIN_FORMS_PER_ADDRESS_MINUTE`); the Submits are writes of trains (60 a minute). Answers are `TrainAnswer` (`{ ok, text, train? }`): 200, 409 for a train over or a form drawn from another state of it (with the train as it is now; the page takes a 409 that gives a train for a refusal, not for an ended party, `sendPostForm`), 422 for any other refusal, 403 with the train for who may not. Logged "a train was managed on the map" and "a train was split on the map", `{ user, guild, party, outcome }`.
+
+- **Shared functions** (R7, moved out of the Discord handlers, Discord's tests unchanged): `manageTrainAs(ctx, party, member, staff, shown, picked, surface)` (`src/commands/trains/train-changes.ts`: only what was picked otherwise than shown is asked, `Nothing changed.` where nothing is, one `TrainService.manage`, its words, a refusal with where the train is now through `movedOnWords` and `Nothing was changed.` after several parts), `manageRefusal` (who may open Move… and Manage…, `mayNotMove` in words; `movableTrain` asks it), `splitRefusalFor` (why a member may split no group; `openSplit` asks it), `GROUPS_CHANGED`, `SPLIT_FAILED`, `MOVED_ON`; the dialogs' builders without Discord's parts, which the dialogs draw from too: `moveForm` and `manageForm` (`src/render/train-dialogs.ts`, with `routeChoice` and `OfferedMove`), `splitForm` (`src/render/train-split.ts`); the map's data of them `movesOnTheMap`, `formChoice`, `aheadOnTheMap` and `refusalOnTheMap` (`src/web/train-views.ts`), their markdown made text of the page by `pageWords`.
+- **Move…** (R1): carried by the list (`MapTrain.moves`, above, "Trains on the map"), so it opens from the list without asking, and so also while the window of the post's controls is full (review C6: the other forms ask the server, which refuses an opening then; Move… asks nothing, and only its Submit is counted and refused, 429, when the window is full); its Submit is the move's address (`POST …/move/<move>`, `{ from, target }`).
+- **Manage…** (R2, R4): `GET …/trains/<id>/manage` answers `MapManage` (`train-data.ts`): the title, the text (where the train is, `trainStateText`; without a route `NO_ROUTE_YET`), "The route" where more than Keep is left, "At the end of the route" (not without a route) and "What the train is mainly for", each choice's options with their lines (the descriptions) and emoji and the train's own picked, and `shown` (where the train was, the stop the route began with, `-` without one, the mode and the kind), for who may move the train and staff (`manageRefusal`, 422 in its words). `POST …/manage` `{ shown, picked: { kind, route?, atEnd? } }` (strict): `manageRefusal` again (403 with the train), then `manageTrainAs` with the surface `post`. The page draws every choice as a radio choice with its lines (the dialog's menus are menus because Android picks a radio group's first choice whatever is marked; a page checks what it is told). The conductor's buttons stay the member's part (R2).
+- **Split…** (R4): `GET …/trains/<id>/split` answers `MapSplit`: the dialog the member would be shown now (`splitForm` over `splittableGroups`, their privacy read as the dialog reads it, `ctx.users`), its text as text of the page (with several groups who is in each a line each, names as the post shows them), and either `only` (the one group a member may split, with its mark: no choice, the text ends "Submit splits it off.") or `choice` ("Group that leaves", nothing picked, each value `<group>:<mark>`); refused before it opens in the dialog's words (`splitRefusalFor`, 422). It has no slow-read limit: Discord's `readInTime` guards its dialogs, whose opening must answer within three seconds; the map's `GET` reads the member's privacy from `ctx.users` and has no such deadline (open question 2 of the prototype review, accepted). `POST …/split` `{ group, mark }` (strict): who may not split the group as the form drew it (its mark still the group's; `mayNotSplit`'s `not-in-group` and `conductor-in-group`) is refused before anything is counted, 403 in `splitRefusal`'s words with the train (review C3, as Manage…'s Submit refuses who may not move the train); every other refusal is counted, as Discord's Submit counts it (re-review N2): it goes `splitGroupAs` with the mark as `drawn`: "Split off: <the new train's name>" (the map names the new train by its name, `splitNames`), the same for a second Submit of the same form (`already`), a group called otherwise or gone since 409 `GROUPS_CHANGED` (reason `group-changed`, with the train), a post the bot could not make 422 in `noPostWords`' words with the use given back (`givenBackOnTheMap` with the window it was counted in, review C4), a split that throws `SPLIT_FAILED` 500 with the use given back (`countedOnTheMap`) and logged. The list shows both trains after it, the old post's small print linking the new.
+- **The page** (`src/web/client/train-post-forms.ts`, pure: `moveForm`, `manageForm`, `splitForm` and their bodies over 8M-8B's `dialogForm` and `radioChoice`; the DOM side is 8M-8B's `post-forms-ui.ts`: `moveClicked`, `manageClicked`, `splitClicked`, their addresses under `/api/trains/` by `partiesOf`, a pick's own address by `PostFormBody.path`): each form opens in the place of the post (a popup, a line of the list, the phone card, or a train's own summary until its post comes), held by `FormHold`, in Discord's dialog look; a refusal of its Submit closes it and the list is asked for again (its choices may be stale, `refusalCloses`), as does a success. `post-draw.ts` gives Move… `data-move-train` where `moves`, Manage… `data-manage-train` for who may move the train (also without a route), Split… `data-split-train` (off while read-only).
+
 ## Raids on the map (plan 8M-4)
 
 - **One code path per command** (spec 3.5): what `/raid` does beyond its gym question is `reportRaidAs` and `reportWords` (`src/commands/raids/report.ts`: the report as the member, anonymous by their `raidPrivacy`, signed up by their `autoStatus` under their name and team; the command's words for each `ReportOutcome`, a post and a region channel named by the caller's `ReportNames`: mentions on Discord, on the map no post and a channel as `#name`); what `/hatch`, `/end`, `/boss` and `/moveset` do is `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` (`src/commands/raids/raid-changes.ts`: the command's reader, `RaidChangeService` as the member, the answer `raidChangeAnswer`, `ok` / `refused` / `gone`; a reader's refusal is thrown as a `UserError`). The commands reply with these or throw them; the map answers them. The readers (`reportedBoss`, `reportedTime`, `typedPartyTime`) take only what they read (`RaidReading`), so the web server is given exactly what the commands read and call (`RaidWebDeps.ctx`, `RaidWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
@@ -124,13 +134,13 @@ Brief `.superpowers/sdd/2026-10-26-phase-8m8b-post-controls/design.md` (its "Aft
 
 ## Trains on the map (plan 8M-5)
 
-- **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The panel of the post keeps its own answer (it draws itself anew); the map calls the same service methods with the same `from`, `target` and `first`, and words Reverse and the mode with `reverseRouteAs` and `setAtEndAs`. The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Manage train…" opened it before plan 8X-G (the post has Move… and Manage… since, `trains.md`; the map's panel waits for the UX pass), none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the handle of the stop the route begins with where `cannotReverse` allows Reverse; the mode); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train) and `may.kind` (whether the member may set it, `mayNotMove`, as the panel's menu: also for a train without a route, whose `panel` is null); Power Spots as a layer and Add to route from a spot (the add body takes a spot's key already) are the page's, left for the UX pass (follow-ups, "From Phase 8X-5"), and the kind menu is plan 8M-8C's with the rest of Manage… (X9: until then "What the train is mainly for: on Discord"); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
+- **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The map's Move…, Manage… and Split… are the post's dialogs, over their Submits' own functions (`moveTrainAs`, `manageTrainAs`, `splitGroupAs`; plan 8M-8C, below). The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
+- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `moves` (plan 8M-8C, R1: Move… as the post's dialog draws it, `moveForm` of `src/render/train-dialogs.ts` through `movesOnTheMap`, `src/web/train-views.ts`, given to the pure view as `PartyViewInput.trainMoves`: where the train is, `placeOf`; the dialog's text in the map's words; "Where to" and the moves `offeredMoves` makes, each with where it leads, `targetOf`, its label and the line under it; none for who may not move the train, a train without a route, or while read-only, `trainMovesOf`), `ahead` (plan 8M-8C, R3: what lies ahead as the post's small print says it, `aheadText` over `aheadLine`, `PartyViewInput.trainAhead`; the page words no turning or looping of its own), `moveRefusal` (why the member may not move it, with the words of Discord's refusal, `refusalOnTheMap`: Move…'s and Manage…'s line); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The kind and the mode are Manage…'s (below, "A train's dialogs as forms"). The route is the version of the route (below). Nothing of it while read-only.
 - **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd?, kind? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`; the kind as its `kind`, plan 8X-5, a raid train without one). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
 - **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, stop }`: the stop by its key, `stopKey`, plan 8X-4: a gym's id or `w<Wayfarer id>`; anything else 400, a stop of no region of the server 404; the route editor adds the gyms clicked; before 8X-4 the body was `{ drawn, gym }` with `drawn` the gyms' ids as numbers, and a page opened before the update keeps its old bundle, whose edits are refused as malformed, 400, and which draws no train line or ring (it looks the stop keys up as gym numbers, so every train is listed as unplaced), until the member reloads it: nothing reloads the page by itself), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train.", with the train as the member sees it, who has passed its forum's access, so that the page draws the editor or the panel again without the controls); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`, `conductor-changed`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer of who may and of the code path but `gone` carries the train as the member sees it now (the 403 of who may too). The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
-- **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`), `finish` (`{ from }`), `reverse` (`{ from, first }`), `at-end` (`{ from, atEnd }`), and `kind` (`{ kind }`, plan 8X-5: the panel's kind menu, as the post's menu, nothing of where the train is; who may is `mayNotMove`, also without a route; `setKindAs`, "This train is a Gigantamax Train now.", `trainKindSentence`; not one of `PANEL_PRESSES`, the panel's buttons, but `KIND_PRESS`): the Manage train panel, each press carrying where the panel was drawn and where it leads, as the post's controls carry them; the same checks in the same order, who may being `mayNotMove` (the mode: `mayNotArrange`, as `setAtEnd` decides), and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as a press of the panel counts; then `moveTrainAs` (the command's words, where the train is now, "I am telling the others."), `reverseRouteAs` ("The route is reversed. " and where the train is), `setAtEndAs` (`atEndSentence`). The movement message in the post pings as for any move. Logged "a train was moved on the map" (a kind set: "a train's kind was set on the map", `{ user, guild, party, kind, outcome }`). **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
+- **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`): Move…'s Submit (plan 8M-8C, R1), carrying where the form was drawn and where the move picked leads, as the dialog's custom id and choice carry them; the same checks in the same order, who may being `mayNotMove`, and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as the dialog's Submit counts; then `moveTrainAs` with the surface `post` (the command's words, where the train is now, "I am telling the others."; of a finished route "Move… takes it back to stop 2: …", as the dialog says it), a move drawn where the train no longer is refused in the dialog's words (`movedOnWords`: "The train has moved on since you opened this: " and where it is now, 409 with the train). The old panel's presses `finish`, `reverse`, `at-end` and `kind` (plans 8M-5, 8X-5) answer 404 since plan 8M-8C: Finish, Reverse, the mode and the kind are Manage…'s, as on Discord, and a page of an older bundle gets 404 for them until it is reloaded (`reverseRouteAs`, `setAtEndAs`, `setKindAs`, `MapTrainRights.kind` and the surface `map` are gone). The movement message in the post pings as for any move. Logged "a train was moved on the map". **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
 - **Words:** `pageWords` also writes the bot's masked links as their text (`whereText` links every stop), read in the same one pass from the left as escapes and markdown, so that a bracket a member escaped begins no link.
-- **The page** (`src/web/client/train-forms.ts`, pure: the start form and its body, a train's actions, the route editor and the bodies of its edits, the Manage train panel and the body of a press, reading an answer, `sendTrainForm` over `pressParty`; the DOM side `train-ui.ts`): for a member while the map is not read-only, "New train" in a box at the top of the side panel (`#parties`, now shown for such a member also without parties) opens the start form there (name, region from `/api/geo`, start, mode); a train's popup (and its item in the side panel, where trains the map cannot draw are listed: no route yet, or none of its gyms on the map) gains `trainActions`: "Edit route" (`may.arrange`), "Manage…" (`panel`), "Be the conductor", "Stop being the conductor" or "Take the conductor off", and "You are its conductor." / "It has a conductor.". **Route mode** ("Edit route", and at once after a new train is made by who may arrange it): the route editor in the side panel box (the stops numbered as stored, the train's marked; for who may arrange it (`may.arrange`) up, down, a "move to" list of every position (one `/route move`, so that a stop goes far in one edit) and remove per stop, rather than dragging; "Clear the route" for who may; the saved routes to load or forget; a name to save the route under; Done), the stops numbered on the map over a dashed line (`routeMarkers`; a `divIcon` whose `html` is an element of ours with the number as text, never a string), and a gym clicked (or Enter on a focused one), its dot or the marker of its raids, added as the next stop without its popup opening: Leaflet opens a bound popup before any handler of ours, so the gyms' layers have Leaflet's click and keypress handlers taken off and open their popup from ours, which in route mode adds the stop instead (`gymClicks`, `gymClicked`); a gym on the route already is said under the editor ("The Stacks is on the route already.", `routeEditBody`) and nothing is sent, and a double click whose clicks route mode took does not zoom the map. The edits run one at a time (`RouteEdits`): a gym clicked while an edit is on its way waits for its turn, its body made from the train the answer before gave (so quick clicks do not refuse each other as `route-edited` and burn the throttle), and the editor's controls but Done are off meanwhile; each answer redraws the editor and the numbers from the train it gives, also after a 409; an answer that the train is gone (409 without a train, `routeModeEnds`) ends route mode, any other without a train (429, 503, a broken connection) is said and changes nothing. **The panel** ("Manage…") opens in the train's popup in place of its actions: where the train is, the moves with their targets, "Reverse the route", the mode with Set, Done; it stays open after a move, as the post's does, drawn anew from the answer's train with the words under it, also after a press that no longer fits; the list is asked for again after each move and drawn once the panel or its popup closes; Done draws the map with the train's popup open again, and so does a move after which the member may move it no more (no panel, also the 403 of who may, which carries the train); an answer that the train is gone (409 without a train, `routeModeEnds`) closes the panel, says it and draws the map with nothing opened. The conductor's buttons press at once with `conductorBody`. One form or mode at a time (`FormHold`, shared with the raid and spawn forms: route mode and the start form take it as forms of the trains' box (`take(false, true)`, `aside`), the panel as one of a popup or a side panel item; `formControls` also turns "New train", "Edit route" and "Manage…" off). The list waits under a form, but for one of the trains' box, which a redraw of the side panel keeps in place (`keepTools`: a box already first is not taken out, only what follows it, so a field of the start form or the route editor keeps the focus); the route editor, drawn anew from each answer, keeps the name typed to save under and the saved route picked (`RouteEditorFilled`; the name is emptied once the route is saved): under route mode and the start form the list is drawn (the controls that open another form turned off again after each draw), and the line of the train being routed is left to route mode's numbers (`drawnTrains`), the other trains' lines and markers drawn `interactive: false` meanwhile (`clickable`), so that a gym under them stays a stop to click; as route mode starts and ends, the list the page has is drawn anew at once (`TrainUiDeps.redrawn`; the poller draws only a list that changed), so that the train's own line leaves the map with "Edit route" and comes back with Done.
+- **The page** (`src/web/client/train-forms.ts`, pure: the start form and its body, a train's actions, the route editor and the bodies of its edits, a stop dragged (`StopDrag`, `dropPosition`), reading an answer, `sendTrainForm` over `pressParty`; the DOM side `train-ui.ts`; Move…, Manage… and Split… are forms of the post, below, "A train's dialogs as forms"): for a member while the map is not read-only, "New train" in a box at the top of the side panel (`#parties`, now shown for such a member also without parties) opens the start form there (name, region from `/api/geo`, start, mode); a train's own summary (shown until its post comes, and in its item in the side panel, where trains the map cannot draw are listed: no route yet, or none of its gyms on the map) gains `trainActions`: "Edit route" (`may.arrange`), "Move…" (`moves`), "Manage…" (who may move the train, also without a route), "Be the conductor", "Stop being the conductor" or "Take the conductor off", and "You are its conductor." / "It has a conductor."; under a post the member's part has whose the conductor role is, "Edit route" and the conductor's buttons (R2), and Route's part the stop list and `ahead` (review C8: "Edit route" once, in the member's part). **Route mode** ("Edit route", and at once after a new train is made by who may arrange it; R3: it stays the side pane's, the stated exception to "forms in place", since a tap on the map closes Leaflet's popup and the phone card covers the map; on a phone the pane is docked under the map, 40% of the screen, `body.form-docked`): the route editor in the side panel box (the stops numbered as stored, the train's marked; for who may arrange it (`may.arrange`) a handle to drag each stop by (plan 8M-8C, R6: pointer events, so a mouse, a pen and a finger alike, no new dependency; the handle `touch-action: none` in `map.css`, the pointer captured by it; the row it would land at marked `drop-target`; a drop is one `/route move` with the route as it was when the drag began, `RouteEditValues.drawn`, and a drop where the stop was or a cancel sends nothing; no drag begins while edits wait or are on their way, `RouteEdits.busy`; the drag follows the pointer that began it only, `StopDrag.follows`, and ends without a move on Escape, when that pointer is lost, `pointercancel` and `lostpointercapture`, and when the editor is drawn anew or route mode ends, review C2; the handle is at least 32 by 32 pixels, and near the top or bottom of the side pane, docked on a phone, the list scrolls by itself while a stop is dragged, `edgeScroll` in a frame loop, review C9; the handles are not in the Tab order) and up, down, a "move to" list of every position (one `/route move`, so that a stop goes far in one edit) and remove per stop, the keyboard's way; "Clear the route" for who may; the saved routes to load or forget; a name to save the route under; Done), the stops numbered on the map over a dashed line (`routeMarkers`; a `divIcon` whose `html` is an element of ours with the number as text, never a string), and a gym clicked (or Enter on a focused one), its dot or the marker of its raids, added as the next stop without its popup opening: Leaflet opens a bound popup before any handler of ours, so the gyms' layers have Leaflet's click and keypress handlers taken off and open their popup from ours, which in route mode adds the stop instead (`gymClicks`, `gymClicked`); a Power Spot of the Power Spots layer tapped (or Enter on a focused one) is added the same way by its key (plan 8M-8C, R5: `places-ui.ts` takes a spot's clicks and Enter as a gym's, `placeClicks` over `gymClicks`, and opens its popup from its own handler, `spotTapped`, `TrainUi.spotClicked`; review C10: Enter on a focused spot adds it and a double tap that route mode took does not zoom; re-review N1: the gyms' and Power Spots' dots are Tab stops, `role="button"` with their names, only while route mode is on, `RouteFocus` (`route-focus.ts`), told by `TrainUiDeps.routeMode` as route mode begins and ends, and a dot drawn meanwhile takes it at once; the hint says "Turn on Power Spots and zoom in to add a Power Spot." while the layer draws none, `placesWanted`, and follows the layer and the zoom without drawing the editor anew, `placesChanged`); a stop on the route already is said under the editor in the words `/route add` refuses it with (`ALREADY_ON_ROUTE`, `src/render/route-words.ts`, which `problemText` says for `already-on-route`: "That stop is on the route already.", review C7; `routeEditBody`) and nothing is sent, and a double click whose clicks route mode took does not zoom the map. The edits run one at a time (`RouteEdits`): a gym clicked while an edit is on its way waits for its turn, its body made from the train the answer before gave (so quick clicks do not refuse each other as `route-edited` and burn the throttle), and the editor's controls but Done are off meanwhile; each answer redraws the editor and the numbers from the train it gives, also after a 409; an answer that the train is gone (409 without a train, `routeModeEnds`) ends route mode, any other without a train (429, 503, a broken connection) is said and changes nothing. The conductor's buttons press at once with `conductorBody`. One form or mode at a time (`FormHold`, shared with the raid and spawn forms: route mode and the start form take it as forms of the trains' box (`take(false, true)`, `aside`); `formControls` also turns "New train", "Edit route", "Move…", "Manage…" and "Split…" off). The list waits under a form, but for one of the trains' box, which a redraw of the side panel keeps in place (`keepTools`: a box already first is not taken out, only what follows it, so a field of the start form or the route editor keeps the focus); the route editor, drawn anew from each answer, keeps the name typed to save under and the saved route picked (`RouteEditorFilled`; the name is emptied once the route is saved): under route mode and the start form the list is drawn (the controls that open another form turned off again after each draw), and the line of the train being routed is left to route mode's numbers (`drawnTrains`), the other trains' lines and markers drawn `interactive: false` meanwhile (`clickable`), so that a gym under them stays a stop to click; as route mode starts and ends, the list the page has is drawn anew at once (`TrainUiDeps.redrawn`; the poller draws only a list that changed), so that the train's own line leaves the map with "Edit route" and comes back with Done.
 
 ## Meetups on the map (plan 8M-5M)
 
diff --git a/docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md b/docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..95fa9d619a6716563dae1a9a7d6596b4f745f34a
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-27-phase-8m8c-staging.md
@@ -0,0 +1,61 @@
+# Phase 8M-8C staging checklist: a train's Move…, Manage…, Split… and the route editor on the map
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel; Claude drives Discord and the map in its own tab, Matt the phone steps.
+
+- **Accounts:** Googer (owner, staff), Tester (a member), and a third account for the groups of a split where one is at hand.
+- **Brief:** `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its last section, "After the builder check", R1 to R9).
+- **Design:** `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("A party's popup is its post": trains).
+- **Conventions:** `docs/architecture/web.md` ("A train's dialogs as forms", "Trains on the map"), `docs/architecture/trains.md`.
+- **Devices:** a desktop browser (light and dark), an Android phone and an iPhone if at hand (touch dragging), Discord's in-app browser and the phone's own.
+- **Compare with Discord:** every form beside its dialog on Discord: the same title, words, choices, picks to start with and answers.
+
+## Before
+
+0. **The page built, the bot started after it.** `npm run web:build`, then start (or restart) the bot: the bot serves the map's page from `dist/web/assets/` and reads `dist/web/assets.json` once at startup.
+1. **No migration, no command option change:** no deploy needed. `settings.web.publicUrl` is `https://dev.example.com` and the tunnel `pine-dev` runs.
+2. **Parties:** Googer makes a train "Saturday legendaries" in West with a route of five gyms and a Power Spot of West (the editor or `/route add`); Googer and Tester sign up; Tester opens group B "Fast" (Group… on Discord) and the third account joins it. A second train "Evening run" planned ahead, without a route.
+3. **An old page.** A map page opened before the update keeps its old bundle until reloaded. Its Move… still opens the old panel, but the new list no longer carries the panel's data (`MapTrain.moves` replaced `panel`), so the old Move… does nothing at all: no request, no answer. The retired presses answer 404 only when sent directly (devtools: `POST …/trains/<id>/move/finish`, `reverse`, `at-end`, `kind`, R1). Reload: Move… is the new form, and the post's keys change by themselves (`CONTROLS` changed; the view's version did not, `POST_VIEW_VERSION` 1).
+
+## Move… (R1)
+
+4. **The dialog's moves.** As Googer at stop 2: Move… opens "Move the train" in the place of the post: where the train is ("At stop 2 of 6: …", "Next is …"), then "Where to" with Next first and picked, Previous and Skip, each in the dialog's words (Skip's two names, a long name cut with the whole under it). No Finish, no Reverse, no mode. Compare with Move… on Discord, opened at the same moment.
+5. **A move.** Submit Next: the form closes, the popup shows the post moved on, the answer is `/next`'s words ("The train is at stop 3 of 6: … I am telling the others."); the post on Discord announces the movement with its ping.
+6. **The undo at a turn-back end.** Manage… → "At the end of the route": Turn back; move the train to the last stop: Move… offers "Next: turn back to …", "Previous: back to … (undo)" with "Back one stop, still heading for the end: undoes a Next made by mistake" under it, and Skip.
+7. **One move left.** Finish the route (Manage…, step 10): Move… shows no choice, the text ends "Submit takes it back to stop 6, …."; Submit takes it back.
+8. **Stale.** Open Move… on the map, move the train with `/next` on Discord, Submit: "The train has moved on since you opened this: The train is at stop …", the form closes and the popup shows the train as it is now.
+9. **Who may.** Tester signed up, Googer the conductor: Move… says Discord's words under the post's buttons, "This train has a conductor: only they and the moderators can move it." (press Move… on Discord as Tester: the same sentence); Tester not signed up: "You are not signed up for this train.". Read-only (Discord away for the bot): Move… says "Discord cannot be reached just now, so nothing can be changed. Try again in a moment.".
+
+## Manage… (R2, R4)
+
+10. **The dialog's parts.** As Googer: Manage… opens "Manage the train": where the train is, "The route" (Keep it as it is picked; Reverse it where it can be; Finish it here), "At the end of the route" (Finish at the last stop, Loop, Turn back, with their emoji and lines) and "What the train is mainly for" (Raids, Dynamax Battles, Gigantamax Battles), each with the train's own picked. Compare with Manage… on Discord.
+11. **Several parts in one Submit.** Reverse it, Loop and Dynamax Battles: one answer "This train is a Max Battle Train now. The route is reversed. At the end it loops back to the first stop. The train is at …", one line in the post for the three; the forum tag Max battle comes with the kind.
+12. **Only what was picked otherwise.** Open Manage… on the map, set Turn back with Manage… on Discord, then Submit the map's form with only the kind changed: the mode stays Turn back. Submit with nothing changed: "Nothing changed.".
+13. **Finish it here.** Finish it here: "The train has finished its route of 6 stops. Move… takes it back to stop …", announced in the post as a move.
+14. **Stale.** Open Manage…, move the train on Discord, Submit Finish it here with a kind: "The train has moved on since you opened this: … Nothing was changed.".
+15. **Without a route.** On "Evening run": Manage… opens with "This train has no route yet. Add its stops with /route add." and the kind alone; Gigantamax Battles: "This train is a Gigantamax Train now.".
+16. **Who may.** Tester with a conductor that is not him: Manage… says "This train has a conductor: only they and the moderators can move it." under the buttons (the sentence Discord says before its Manage… opens), and opens nothing. The conductor's buttons (Be the conductor, Stop being the conductor, Take the conductor off) are in the member's part under the post, not in Manage… (R2), and work as before.
+17. **Its window.** Thirty presses of the post's controls a minute between Discord and the map: with the window full, Manage… on the map says "That was a lot of clicks…" and opens nothing.
+
+## Split… (R4, R7)
+
+18. **A member of a group.** The third account (in B, not the conductor): Split… opens the one-group form: "Group B (Fast) leaves Saturday legendaries and becomes a train of its own, Saturday legendaries (Fast):", the same route at the same stop, who moves, who leads, "Submit splits it off.". Compare with the dialog on Discord.
+19. **Staff and the conductor.** Googer: Split… asks "Group that leaves" with nothing picked, each choice "Group B (Fast) · 2 trainers", who is in each group a line each in the text (names as the post shows them). Submit without a pick: "Pick the group that leaves first.".
+20. **The split.** Submit group B: "Split off: Saturday legendaries (Fast)"; the list shows both trains; the old post's small print "Group B (Fast) went its own way: <the new post>" and the new post's "Split off from …" on Discord; the members of B are pinged in the new post. A second Submit of the same form (open it twice): "Split off: …" again, nothing more split.
+21. **Stale.** Open Split…, rename group B on Discord, Submit: "The groups of this train changed meanwhile: press Split… again.", the form closes.
+22. **Refused before it opens.** Tester in group A with the conductor in it: Split… says why under the buttons ("The conductor is in that group: only they and the moderators can split it off."), nothing opens; a member in no group: "Only a group's members, the conductor and the moderators can split a group off.". Both are the sentences Split… says on Discord for the same member (compare). A train of one group: no Split… on the post at all. A form opened by the conductor, then Submitted after the conductor role went to somebody else in the group: refused with the same words, and the post's controls' window not counted.
+23. **A split that fails.** With the bot refused to post in West's forum for a moment: Submit says the post could not be made, in Discord's words, and the use is given back.
+
+## The route editor (R3, R5, R6)
+
+24. **Route for anybody.** Tester (may not arrange the route): Route shows the stops read-only, the train's marked, and under them what lies ahead as the post's small print says it ("Next: 3. … · 4. …, and 2 more to the end"); no Edit route.
+25. **Route mode.** Googer: Edit route (once, in the member's part above Route's list; Route has none of its own) opens the editor in the side pane; on a phone the map with the pane docked under it (40%, `body.form-docked`).
+26. **Power Spots.** With the Power Spots layer off: the hint says "Tap a gym on the map to add it as the next stop. Turn on Power Spots and zoom in to add a Power Spot."; turn it on and zoom to 16: the hint becomes "Tap a gym or a Power Spot on the map to add it as the next stop." without the editor being drawn anew (a name typed to save under stays). Tap a Power Spot: it is the next stop ("… (Power Spot) is stop 7 of the route."), no popup opens; tap it again: "That stop is on the route already." (the words of `/route add` for the same), nothing sent; a double tap does not zoom the map. With the keyboard in route mode: Tab reaches the gyms' and Power Spots' dots (a screen reader names each as a button), Enter on one adds it. After Done (out of route mode) Tab passes over the dots to the side pane: no dot is a Tab stop; a tap on a Power Spot opens its popup as before.
+27. **Dragging with a mouse.** Drag stop 5 by its handle (⠿) onto row 2: the row it would land at is marked as the pointer moves; the drop is one move ("… is stop 2 of the route now, before …"), the numbers on the map follow. A drop where the stop was sends nothing.
+28. **Dragging with a finger.** On a phone: drag a stop by its handle (an easy target for a thumb): the page does not scroll by the finger while dragging, the stop moves. With a route longer than the docked pane shows: hold a stop near the pane's bottom (or top) edge: the list scrolls by itself, faster nearer the edge, and the stop lands where it is let go. A drag while an edit is on its way does not begin.
+28a. **A drag that ends without a move.** With a mouse: drag a stop, press Escape before letting go: the mark goes, nothing is sent. On a phone: hold a stop by its handle with one finger and tap a gym on the map with another: the gym is added and the editor drawn anew, which ends the drag: lifting the first finger sends nothing. A second finger dragged on the list during a drag moves nothing.
+29. **The keyboard.** ↑, ↓ and the position menu still move a stop, one edit each; Tab reaches them; the handles are not in the Tab order.
+30. **Stale.** Drag a stop while Tester removes one on Discord: "The route changed meanwhile: here it is as it is now.", the editor drawn from the route as it is now.
+
+## After
+
+31. **Nothing on Discord.** Every map form on Discord is a dialog with the same parts; `CONTROLS` has no "Do this on Discord" left: only "Start a new group on Discord →" in Group… (a Group… case, not a control).
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 434f1e5bd65ddc14c8c38cda675daa9e5508f31a..43ece629a0585963bc1c9e7fb48f65d92c91c93f 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1247,6 +1247,11 @@ path.highlighted {
   user-select: none;
 }
 
+/* The position menu as wide as its words: the stop's name takes the row (the preview of 8M-8C). */
+.route-stop .move-to {
+  flex: 0 0 auto;
+}
+
 .route-stop.drop-target {
   border-radius: var(--radius);
   box-shadow: inset 0 0 0 2px var(--train);
@@ -1620,6 +1625,13 @@ path.highlighted {
   padding-left: 20px;
 }
 
+/* What lies ahead under Route's stop list (plan 8M-8C, R3), the post's small print. */
+.post-popup section.route .route-ahead {
+  margin-bottom: 4px;
+  color: var(--muted);
+  font-size: 12px;
+}
+
 /*
  * The phone card of a party (plan 8M-8A, `phone-card.ts`): docked at the bottom, its edge on top
  * in the post's color; its summary shows the post's heading block, its first row of buttons and
diff --git a/src/web/client/post-draw.ts b/src/web/client/post-draw.ts
index 97fa8eb010d6db0a70433c87380b69312b2bc769..c54ff17eae06be9aea8306a43d8e0797b9c2dd52 100644
--- a/src/web/client/post-draw.ts
+++ b/src/web/client/post-draw.ts
@@ -447,7 +447,9 @@ function trainPart(
           text: `${context.stopName(key)}${index === train.stop ? ' (the train is here)' : ''}`,
         })),
       },
-      ...(train.ahead === null ? [] : [{ tag: 'div', className: 'small', text: train.ahead }]),
+      ...(train.ahead === null
+        ? []
+        : [{ tag: 'div', className: 'route-ahead', text: train.ahead }]),
     ],
   };
   return [
````

## After the last task

- [ ] `npm run check > var/8m8c-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 43428a60886e461972398ae479b10426d7161bc0 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
