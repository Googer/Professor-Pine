# Phase 8M-5: Trains from the Map: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member starts a raid train from Pine's live map, lays its route by clicking gyms (reorders, removes, clears, saves and loads routes), moves it (Next, Previous, Skip, Finish, Reverse, at-end) and takes or gives up the conductor role there, with exactly what `/train`, `/route`, `/move`, `/conductor` and the post's Move train panel do.

**Architecture:** The commands' logic is factored into `train-changes.ts` (`*As` functions) that the commands and the web routes share; the routes (`/api/trains…`) are guarded as 8M-4's (per-address limit and `postGuard` before the body, the member checks, access, the service's rules, then the command's or control's own throttle); every press carries the state it was drawn from (the stop list, the current stop, the conductor seen) so a stale press is refused with the train as it is now; the page adds a start form, route mode (one edit at a time) and the Move panel, held by 8M-4's `FormHold`.

**Tech Stack:** TypeScript 6.0, Fastify, Leaflet (all from 8M-1). No new package, no migration, no command change (the commands' behaviour is unchanged).

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md` 3.5 and 3.7 (first three bullets). **Meetups from the map** (3.7's last bullet) are a plan of their own, **8M-5M**, after the meetup-safety plan 8S-1 (another session) merges. Ledger: `.superpowers/sdd/2026-10-17-phase-8m5-trains-from-the-map/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m5` (worktree `var/proto-8m5`, rebased onto `wayfarer` c4a05a09), one commit per task, each typechecked (root and page) with its area's tests green; on the tip the full check (7,184 tests), the build, the userscript build and the database suite were green. An Opus review went through the whole prototype; its findings are folded into the commits below.

## Decisions in this plan

Rulings made while Matt was away (2026-10-17; ledger), for Matt to look at:

1. **One code path per command or control**, in its own throttle window (`train`, `route <sub>`, the post controls' window for moves, `conductor set|clear`); the commands and the post's panel are unchanged.
2. **A route edit carries the stop list it was drawn from**, checked inside the store (`route-edited`: "The route changed meanwhile: here it is as it is now."); a move carries its stop; a conductor press carries the conductor the page saw.
3. **The map names nobody:** a takeover says "in the place of the conductor before".
4. **Gym clicks keep `/route add`'s window** (ten a minute), so a 20-stop route takes about two minutes; route mode sends one edit at a time; stops reorder by up/down or "move to #".
5. **The Move panel stays open after a move** (as the post's panel); Reverse and the at-end menu are included.
6. **A new train's start goes into its creation**, so the new-train DM carries it; the start answer says when the maker is not signed up.
7. **Route mode keeps the rest of the map live** (only route mode and the start form are "aside" claims that let the party list draw); it ends when the train is gone (a 409 without a train), not on a throttle or a broken connection.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/web.md`, `trains.md` and `testing.md` ("How the suites run") before starting.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure. **Tests never use the network.** A test that uses `vi.mock` is a `*.isolated.test.ts`; a test undoes its own fake timers, stubs and environment changes.
- Nothing names a member on the map; nothing from data reaches the page as HTML; nothing reads an ended party by id from the database.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m5`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`, which covers the page) and its own tests green. The full `npm run check`, `npm run build` and `npm run test:db` after the last task (they wait on the machine-wide suite lock).
- Never `npm install`/`npm ci`.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **The commands and the post's panel behave exactly as before.**
2. **Stale presses never act:** a changed route, a train moved on, a changed conductor answer 409 with the train as it is now.
3. **Refusals cost nothing** (who, access, the service's rules before the throttle) and nothing names a member.
4. **Route mode:** one edit at a time, no popup flicker, the map stays live, the mode ends when the train is gone.
5. **8H:** no ended party read by id.

---

### Task 1: Trains from the map: the commands' code paths shared

Prototype commit: `7f05a5e1cc5e0b36e06e008ec5d68a414b28dde8`

`src/commands/trains/train-changes.ts`: one function per command (`startTrainAs`, the route's `*As`, `moveTrainAs`, `reverseRouteAs`, `setAtEndAs`, `setConductorAs` with a `ConductorNamer`, `clearConductorAs`) doing the service call and the command's words; `/train`, `/route`, `/move` and `/conductor` call them and behave as before; a new train's start goes into `createTrain` (so the new-train DM carries it); `notSignedUpWords`.

**Files:**

```
 src/commands/parties/timed.ts        |  10 +-
 src/commands/trains/conductor.ts     |  43 ++------
 src/commands/trains/move.ts          |  34 +++----
 src/commands/trains/route.ts         | 206 ++++++++++----------------------------
 src/commands/trains/train-changes.ts | 404 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/trains/train.ts         |  74 ++++++--------
 src/domain/party/timed.ts            |  14 ++-
 src/services/party-service.ts        |   8 +-
 8 files changed, 540 insertions(+), 253 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/parties/timed.ts src/commands/trains/conductor.ts src/commands/trains/move.ts src/commands/trains/route.ts src/commands/trains/train-changes.ts src/commands/trains/train.ts src/domain/party/timed.ts src/services/party-service.ts` and `npx eslint src/commands/parties/timed.ts src/commands/trains/conductor.ts src/commands/trains/move.ts src/commands/trains/route.ts src/commands/trains/train-changes.ts src/commands/trains/train.ts src/domain/party/timed.ts src/services/party-service.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 7f05a5e1cc5e0b36e06e008ec5d68a414b28dde8 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Trains from the map: the commands' code paths shared`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/parties/timed.ts src/commands/trains/conductor.ts src/commands/trains/move.ts src/commands/trains/route.ts src/commands/trains/train-changes.ts src/commands/trains/train.ts src/domain/party/timed.ts src/services/party-service.ts`.

````diff
diff --git a/src/commands/parties/timed.ts b/src/commands/parties/timed.ts
index 6853a18171a0e4d5c136d124c84800eb88583d76..30cfc609e2e772e2b5f4684d21bdd190958bceb8 100644
--- a/src/commands/parties/timed.ts
+++ b/src/commands/parties/timed.ts
@@ -28,8 +28,16 @@ type Ok<Extra> = Extract<TimedChangeOutcome<Extra>, { kind: 'ok' }>;
 
 /** What a member is told who makes a train or meetup in a region that has no forum yet. */
 export function noForumYet(regionChannelId: string): string {
+  return noForumWords(`<#${regionChannelId}>`);
+}
+
+/**
+ * `noForumYet` with the region named as the caller names it (a mention on Discord, `#name` on
+ * the live map).
+ */
+export function noForumWords(region: string): string {
   return (
-    `The region <#${regionChannelId}> has no forum yet. ` +
+    `The region ${region} has no forum yet. ` +
     'A moderator can create it with `/admin setup-forums`.'
   );
 }
diff --git a/src/commands/trains/conductor.ts b/src/commands/trains/conductor.ts
index 5562375c9565053fd1d79d72d5152c9462be351a..48d43642cb5b3b897e27844a7ff4d50f411bbd8e 100644
--- a/src/commands/trains/conductor.ts
+++ b/src/commands/trains/conductor.ts
@@ -2,11 +2,9 @@ import { MessageFlags, SlashCommandBuilder, SlashCommandSubcommandBuilder } from
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
 import { isStaff, requireTrain } from '../../discord/guards.js';
-import { memberOf } from '../../domain/party/party.js';
-import { problemText } from '../../render/activity.js';
-import { memberText } from '../../render/text.js';
-import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
+import { actingMember, commandTrain } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
+import { clearConductorAs, DISCORD_CONDUCTOR, setConductorAs } from './train-changes.js';
 
 const setConductor: SubcommandPart = {
   data: new SlashCommandSubcommandBuilder()
@@ -22,20 +20,9 @@ const setConductor: SubcommandPart = {
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
     const party = commandTrain(interaction, ctx);
-    const outcome = await ctx.trains.setConductor(party.id, actingMember(interaction));
-    if (outcome.kind === 'gone') throw new UserError(partyOver(party));
-    if (outcome.kind === 'refused') {
-      throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), 'train'));
-    }
-    const only = 'Only you and the moderators can move it now.';
-    await interaction.reply({
-      content: !outcome.changed
-        ? 'You are the conductor of this train already.'
-        : outcome.previous === null
-          ? `You are the conductor of this train. ${only}`
-          : `You are the conductor of this train, in the place of ${memberText(memberOf(party, outcome.previous))}. ${only}`,
-      flags: MessageFlags.Ephemeral,
-    });
+    const answer = await setConductorAs(ctx, party, actingMember(interaction), DISCORD_CONDUCTOR);
+    if (answer.kind !== 'ok') throw new UserError(answer.text);
+    await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
   },
 };
 
@@ -53,24 +40,14 @@ const clearConductor: SubcommandPart = {
   throttle: CHANGE_THROTTLE,
   async execute(interaction, ctx) {
     const party = commandTrain(interaction, ctx);
-    const outcome = await ctx.trains.clearConductor(
-      party.id,
+    const answer = await clearConductorAs(
+      ctx,
+      party,
       actingMember(interaction),
       isStaff(interaction, ctx),
     );
-    if (outcome.kind === 'gone') throw new UserError(partyOver(party));
-    if (outcome.kind === 'refused') {
-      throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), 'train'));
-    }
-    const anybody = 'Anybody who is signed up can move it.';
-    await interaction.reply({
-      content: !outcome.changed
-        ? `This train has no conductor. ${anybody}`
-        : outcome.previous === interaction.user.id
-          ? `You are no longer the conductor of this train. ${anybody}`
-          : `This train has no conductor any more. ${anybody}`,
-      flags: MessageFlags.Ephemeral,
-    });
+    if (answer.kind !== 'ok') throw new UserError(answer.text);
+    await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
   },
 };
 
diff --git a/src/commands/trains/move.ts b/src/commands/trains/move.ts
index 918dc938145075f903895bfc1d7b8b0c0925f4ef..ab9eb33816b3e3e9880655b1683baf0bb4e66406 100644
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -12,26 +12,18 @@ import { isStaff, requireTrain } from '../../discord/guards.js';
 import { v2Answer } from '../../discord/late-reply.js';
 import type { V2Message } from '../../discord/party-gateway.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
-import { isTrain, isTrainAtEnd, membersWhere, type TrainParty } from '../../domain/party/party.js';
+import { isTrain, isTrainAtEnd } from '../../domain/party/party.js';
 import { mayNotMove, type TrainMove } from '../../domain/party/train.js';
-import { problemText } from '../../render/activity.js';
-import { panelNote, trainPanel, whereText } from '../../render/train-panel.js';
-import type { TrainPlaces } from '../../render/train-post.js';
+import { panelNote, trainPanel } from '../../render/train-panel.js';
 import type { TrainChangeOutcome } from '../../services/train-service.js';
 import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
+import { moveTrainAs, trainPlaces, trainRefusal } from './train-changes.js';
 
 const A_TRAIN = { type: 'train' } as const;
 
-/** A train with the gyms of its route, for what says where it is. */
-export function trainPlaces(ctx: AppContext, party: TrainParty): TrainPlaces {
-  return { party, gym: (id) => ctx.gyms.get(id) };
-}
-
 /** Why a train refused, as a sentence. */
-function refusal(ctx: AppContext, reason: Parameters<typeof problemText>[0]): string {
-  return problemText(reason, ctx.attendance.limits(), 'train');
-}
+const refusal = trainRefusal;
 
 /**
  * `/next`, `/previous`, `/skip` and `/finish`: moves the train of this post along its route and
@@ -45,15 +37,15 @@ async function moveByCommand(
   move: TrainMove,
 ): Promise<void> {
   const party = commandTrain(interaction, ctx);
-  const member = actingMember(interaction);
-  const outcome = await ctx.trains.move(party.id, member, move, isStaff(interaction, ctx));
-  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
-  if (outcome.kind === 'refused') throw new UserError(refusal(ctx, outcome.reason));
-  const others = membersWhere(outcome.party, (_attendee, id) => id !== member.id).length > 0;
-  await interaction.reply({
-    content: `${whereText(trainPlaces(ctx, outcome.party))}${others ? ' I am telling the others.' : ''}`,
-    flags: MessageFlags.Ephemeral,
-  });
+  const answer = await moveTrainAs(
+    ctx,
+    party,
+    actingMember(interaction),
+    move,
+    isStaff(interaction, ctx),
+  );
+  if (answer.kind !== 'ok') throw new UserError(answer.text);
+  await interaction.reply({ content: answer.text, flags: MessageFlags.Ephemeral });
 }
 
 /**
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index a0c7efc7eb1f0ee846b137c6795e21e78323623a..adc6b7af83ba887f5fed265047deb81caea36fd1 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -27,35 +27,36 @@ import {
 } from '../../domain/party/party.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import { nameOf } from '../../domain/party/timed.js';
-import { currentStop } from '../../domain/party/train.js';
 import { problemText } from '../../render/activity.js';
 import { gymName } from '../../render/raid-post.js';
 import { count, LIMITS, plain, truncate } from '../../render/text.js';
 import { routeLines } from '../../render/train-post.js';
 import { atEndSentence } from '../../render/train-words.js';
-import { SAVED_ROUTE_CHOICE, type TrainChangeOutcome } from '../../services/train-service.js';
+import { SAVED_ROUTE_CHOICE } from '../../services/train-service.js';
 import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
 import { MAX_CHOICES } from '../choices.js';
 import { gymChoices, reportedGym } from '../raids/raid-input.js';
-import { trainPlaces } from './move.js';
-
-type Ok<Extra> = Extract<TrainChangeOutcome<Extra>, { kind: 'ok' }>;
+import {
+  addStopAs,
+  clearRouteAs,
+  forgetRouteAs,
+  loadRouteAs,
+  moveStopAs,
+  NO_SUCH_ROUTE,
+  removeStopAs,
+  saveRouteAs,
+  trainPlaces,
+  type TrainAnswer,
+} from './train-changes.js';
 
 /**
- * What came of a change to a train, when it worked; a refusal and a train that has ended are
+ * The text of a change to a train, when it worked; a refusal and a train that has ended are
  * thrown as `UserError`s, as everywhere.
  */
-function changed<Extra>(
-  ctx: AppContext,
-  party: TrainParty,
-  outcome: TrainChangeOutcome<Extra>,
-): Ok<Extra> {
-  if (outcome.kind === 'gone') throw new UserError(partyOver(party));
-  if (outcome.kind === 'refused') {
-    throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), 'train'));
-  }
-  return outcome;
+function changed(answer: TrainAnswer): string {
+  if (answer.kind !== 'ok') throw new UserError(answer.text);
+  return answer.text;
 }
 
 function privately(interaction: ChatInputCommandInteraction, content: string): Promise<unknown> {
@@ -70,11 +71,6 @@ function afterwards(interaction: ChatInputCommandInteraction, content: string):
   return interaction.editReply({ content });
 }
 
-/** A gym as an answer names it. */
-function named(ctx: AppContext, gymId: number): string {
-  return `**${plain(gymName(ctx.gyms.get(gymId)))}**`;
-}
-
 /**
  * The route cut into texts that each fit one message, stop by stop: the whole route is shown,
  * however long it is, in as many messages as it takes.
@@ -206,20 +202,11 @@ const add: SubcommandPart = {
       );
     }
     const { gym } = answer;
-    const outcome = changed(
-      ctx,
-      party,
-      await ctx.trains.addStop(
-        party.id,
-        actingMember(interaction),
-        gym.id,
-        isStaff(interaction, ctx),
-      ),
-    );
-    const here = currentStop(outcome.party) === gym.id ? ' The train is there now.' : '';
     await privately(
       interaction,
-      `${named(ctx, gym.id)} is stop ${outcome.number} of the route.${here}`,
+      changed(
+        await addStopAs(ctx, party, actingMember(interaction), gym.id, isStaff(interaction, ctx)),
+      ),
     );
   },
   async autocomplete(interaction, ctx) {
@@ -295,29 +282,17 @@ const remove: SubcommandPart = {
   async execute(interaction, ctx) {
     const party = commandTrain(interaction, ctx);
     const number = interaction.options.getInteger('stop', true);
-    const outcome = changed(
-      ctx,
-      party,
-      await ctx.trains.removeStop(
-        party.id,
-        actingMember(interaction),
-        number,
-        isStaff(interaction, ctx),
-      ),
-    );
-    const left = outcome.party.train.route.length;
-    // The stop the train was at is gone: where it is now.
-    const at = currentStop(outcome.party);
-    const where = !outcome.moved
-      ? ''
-      : at !== undefined
-        ? ` The train is at ${named(ctx, at)} now.`
-        : left > 0
-          ? ' The train has finished its route.'
-          : '';
     await privately(
       interaction,
-      `${named(ctx, outcome.gymId)} is off the route, which has ${count(left, 'stop')} now.${where}`,
+      changed(
+        await removeStopAs(
+          ctx,
+          party,
+          actingMember(interaction),
+          number,
+          isStaff(interaction, ctx),
+        ),
+      ),
     );
   },
   autocomplete: respondWithStops,
@@ -354,22 +329,18 @@ const move: SubcommandPart = {
     const party = commandTrain(interaction, ctx);
     const from = interaction.options.getInteger('from', true);
     const to = interaction.options.getInteger('to', true);
-    const outcome = changed(
-      ctx,
-      party,
-      await ctx.trains.moveStop(
-        party.id,
-        actingMember(interaction),
-        from,
-        to,
-        isStaff(interaction, ctx),
-      ),
-    );
     await privately(
       interaction,
-      outcome.changed
-        ? `${named(ctx, outcome.gymId)} is stop ${to} of the route now.`
-        : `${named(ctx, outcome.gymId)} is stop ${to} of the route already.`,
+      changed(
+        await moveStopAs(
+          ctx,
+          party,
+          actingMember(interaction),
+          from,
+          to,
+          isStaff(interaction, ctx),
+        ),
+      ),
     );
   },
   autocomplete: respondWithStops,
@@ -394,25 +365,13 @@ const clear: SubcommandPart = {
       interaction.user.id,
       ctx.config.env.OWNER_ID,
     );
-    const outcome = changed(
-      ctx,
-      party,
-      await ctx.trains.clearRoute(party.id, actingMember(interaction), staff),
-    );
     await privately(
       interaction,
-      outcome.changed ? 'The route of this train is cleared.' : 'This train had no route.',
+      changed(await clearRouteAs(ctx, party, actingMember(interaction), staff)),
     );
   },
 };
 
-/** The name of a saved route as an answer shows it. A route that was just saved has one. */
-function routeName(route: SavedRoute): string {
-  return `**${plain(route.name)}**`;
-}
-
-const NO_SUCH_ROUTE = 'You have no such saved route for this region. Pick one from the list.';
-
 /** What a choice of the saved routes adds for what a train does at the end of the route. */
 const CHOICE_MODE: Readonly<Record<SavedRoute['atEnd'], string>> = {
   finish: '',
@@ -499,43 +458,11 @@ const save: SubcommandPart = {
   defer: 'ephemeral',
   async execute(interaction, ctx) {
     const party = commandTrain(interaction, ctx);
-    const outcome = await ctx.trains.saveRoute(
-      party.id,
-      actingMember(interaction),
-      interaction.options.getString('name', true),
+    const name = interaction.options.getString('name', true);
+    await afterwards(
+      interaction,
+      changed(await saveRouteAs(ctx, party, actingMember(interaction), name)),
     );
-    switch (outcome.kind) {
-      case 'gone':
-        throw new UserError(partyOver(party));
-      case 'refused':
-        throw new UserError(
-          outcome.reason === 'empty-route'
-            ? 'This train has no route to save yet.'
-            : outcome.reason === 'name-like-choice'
-              ? 'A saved route cannot be called `id:` and a number: that is how the list of ' +
-                'saved routes names its choices. Give it another name.'
-              : problemText(outcome.reason, ctx.attendance.limits(), 'train'),
-        );
-      case 'full':
-        throw new UserError(
-          `You have ${MAX_SAVED_ROUTES} saved routes for this region, which is as many as you ` +
-            'can keep. Remove one with `/route forget` first, or save under the name of one ' +
-            'to replace it.',
-        );
-      case 'saved':
-      case 'replaced': {
-        const stops = count(outcome.route.gyms.length, 'stop');
-        const mode = atEndSentence(outcome.route.atEnd);
-        await afterwards(
-          interaction,
-          outcome.kind === 'saved'
-            ? `I saved this route as ${routeName(outcome.route)}: ${stops}. ${mode} ` +
-                '`/route load` puts it into a train of this region.'
-            : `I replaced your saved route ${routeName(outcome.route)} with this one: ` +
-                `${stops}. ${mode}`,
-        );
-      }
-    }
   },
 };
 
@@ -566,38 +493,17 @@ const load: SubcommandPart = {
   async execute(interaction, ctx) {
     const party = commandTrain(interaction, ctx);
     const routeId = await typedRoute(interaction, ctx, party);
-    const loaded = await ctx.trains.loadRoute(
-      party.id,
-      actingMember(interaction),
-      routeId,
-      isStaff(interaction, ctx),
-    );
-    if (loaded.kind === 'none') throw new UserError(NO_SUCH_ROUTE);
-    if (loaded.kind === 'no-stops') throw new UserError('That saved route has no stops.');
-    if (loaded.kind === 'refused' && loaded.reason === 'empty-route') {
-      throw new UserError('None of the gyms of that route exists any more.');
-    }
-    const outcome = changed(ctx, party, loaded);
-    const stops = count(outcome.party.train.route.length, 'stop');
-    const mode = atEndSentence(outcome.party.train.atEnd);
-    const missing =
-      outcome.missing === 0
-        ? ''
-        : ` ${outcome.missing === 1 ? 'One gym of it no longer exists and was' : `${outcome.missing} gyms of it no longer exist and were`} left out.`;
-    const cut =
-      outcome.cut === 0
-        ? ''
-        : ` ${count(outcome.cut, 'more stop')} did not fit: a route has at most ${MAX_ROUTE_STOPS}.`;
-    // A route of the legacy bot may have no name.
-    const has =
-      outcome.route.name === ''
-        ? 'a saved route without a name as its route now'
-        : `the route ${routeName(outcome.route)} now`;
     await afterwards(
       interaction,
-      outcome.changed
-        ? `This train has ${has}: ${stops}. It is at the first. ${mode}${missing}${cut}`
-        : `This train has that route already, and is at its first stop. ${mode}${missing}${cut}`,
+      changed(
+        await loadRouteAs(
+          ctx,
+          party,
+          actingMember(interaction),
+          routeId,
+          isStaff(interaction, ctx),
+        ),
+      ),
     );
   },
   autocomplete: respondWithRoutes,
@@ -618,13 +524,9 @@ const forget: SubcommandPart = {
   async execute(interaction, ctx) {
     const party = commandTrain(interaction, ctx);
     const routeId = await typedRoute(interaction, ctx, party);
-    const gone = await ctx.trains.forgetRoute(party.id, interaction.user.id, routeId);
-    if (!gone) throw new UserError(NO_SUCH_ROUTE);
     await afterwards(
       interaction,
-      gone.name === ''
-        ? 'I forgot your saved route without a name.'
-        : `I forgot your saved route ${routeName(gone)}.`,
+      changed(await forgetRouteAs(ctx, party, interaction.user.id, routeId)),
     );
   },
   autocomplete: respondWithRoutes,
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cec7d06442be8b5139f9793dbdd7981b028cfdc4
--- /dev/null
+++ b/src/commands/trains/train-changes.ts
@@ -0,0 +1,404 @@
+import type { AppContext } from '../../app-context.js';
+import {
+  MAX_ROUTE_STOPS,
+  memberOf,
+  membersWhere,
+  type TrainParty,
+} from '../../domain/party/party.js';
+import { RaidPrivacy } from '../../domain/party/status.js';
+import type { PartyProblem, TrainAtEnd } from '../../domain/party/party.js';
+import { currentStop, type TrainMove } from '../../domain/party/train.js';
+import { NO_POST_MADE, problemText } from '../../render/activity.js';
+import { gymName } from '../../render/raid-post.js';
+import { count, memberText, plain } from '../../render/text.js';
+import { whereText } from '../../render/train-panel.js';
+import type { TrainPlaces } from '../../render/train-post.js';
+import { atEndSentence } from '../../render/train-words.js';
+import type { Member } from '../../services/attendance-service.js';
+import type { TrainOutcome } from '../../services/party-service.js';
+import type { TrainChangeOutcome } from '../../services/train-service.js';
+import type { SavedRoute } from '../../db/repositories/saved-route-repository.js';
+import { MAX_SAVED_ROUTES } from '../../db/repositories/saved-route-repository.js';
+import { partyOver } from '../parties/reply.js';
+import { noForumWords } from '../parties/timed.js';
+import type { ReportNames } from '../raids/report.js';
+
+/**
+ * What `/train`, `/route`, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond
+ * reading their options, as one function each that the commands and the live map (plan 8M-5)
+ * call alike: the change goes through `TrainService` (or `PartyService.createTrain`) as the
+ * member, and the answer is the command's words. Mentions and markdown are Discord's; the map
+ * makes them text (`pageWords`). A command throws a refusal and a train that has ended as a
+ * `UserError`; the map answers them.
+ */
+
+/** What changing a train needs: the train service, the limits of the words, the gyms. */
+export type TrainChanging = Pick<AppContext, 'trains' | 'attendance' | 'gyms'>;
+
+/** What making a train needs: the members' settings, the party service, the limits of words. */
+export type TrainStarting = Pick<AppContext, 'users' | 'partyService' | 'attendance'>;
+
+/**
+ * What came of a change, in the command's words: `ok`; `refused` with the service's reason (the
+ * map tells a press against a train that moved on or a route that changed by it); `gone` for a
+ * train that has ended.
+ */
+export type TrainAnswer =
+  | { kind: 'ok'; text: string }
+  | { kind: 'refused'; text: string; reason?: PartyProblem }
+  | { kind: 'gone'; text: string };
+
+/** A train that has ended, as the commands answer it. */
+const TRAIN_OVER = partyOver({ type: 'train' });
+
+/** A train with the gyms of its route, for what says where it is. */
+export function trainPlaces(ctx: Pick<AppContext, 'gyms'>, party: TrainParty): TrainPlaces {
+  return { party, gym: (id) => ctx.gyms.get(id) };
+}
+
+/** Why a train refused, as a sentence. */
+export function trainRefusal(
+  ctx: Pick<AppContext, 'attendance'>,
+  reason: Parameters<typeof problemText>[0],
+): string {
+  return problemText(reason, ctx.attendance.limits(), 'train');
+}
+
+/** A gym as an answer names it. */
+function named(ctx: Pick<AppContext, 'gyms'>, gymId: number): string {
+  return `**${plain(gymName(ctx.gyms.get(gymId)))}**`;
+}
+
+/** The answer of a change of a train: `said` of what it came to, or the refusal, or over. */
+function answerOf<Extra>(
+  ctx: Pick<AppContext, 'attendance'>,
+  outcome: TrainChangeOutcome<Extra>,
+  said: (ok: Extract<TrainChangeOutcome<Extra>, { kind: 'ok' }>) => string,
+): TrainAnswer {
+  if (outcome.kind === 'gone') return { kind: 'gone', text: TRAIN_OVER };
+  if (outcome.kind === 'refused') {
+    return { kind: 'refused', text: trainRefusal(ctx, outcome.reason), reason: outcome.reason };
+  }
+  return { kind: 'ok', text: said(outcome) };
+}
+
+/** A train to make: its name, the region it is made in, its mode, and when it starts. */
+export interface TrainStart {
+  name: string;
+  /** The region channel it is made in: the post goes into that region's forum. */
+  regionChannelId: string;
+  atEnd?: TrainAtEnd;
+  /**
+   * When it starts, read by `typedTimedTime` (the map); undefined: no start time yet. The train
+   * is made with it, so that its post and the news of a new train say it from the first.
+   */
+  start?: number;
+}
+
+/** What came of making a train: `made` with the train, or a refusal in `/train`'s words. */
+export type TrainStartAnswer =
+  { kind: 'made'; party: TrainParty; text: string } | { kind: 'refused'; text: string };
+
+/**
+ * What `/train` and the map add for a maker who is not signed up for the train they made (their
+ * `/settings auto-status` is None); `where` says where to sign up.
+ */
+export function notSignedUpWords(where: string): string {
+  return (
+    'You are not signed up for it, as your `/settings auto-status` is None: sign up ' +
+    `${where} to move the train or to be its conductor.`
+  );
+}
+
+/**
+ * Makes a train as the member, as `/train` does: signed up as their automatic status says,
+ * named unless their privacy is Anonymous, with its start when one is given (the map's form).
+ * `names` says how the answer names the post and a region's channel (mentions on Discord; on
+ * the map no post and a channel by its name). The text of `made` says that the train is made
+ * and where its post is; what to do next is the caller's.
+ */
+export async function startTrainAs(
+  ctx: TrainStarting,
+  member: Member,
+  request: TrainStart,
+  names: ReportNames,
+): Promise<TrainStartAnswer> {
+  const { id, ...creator } = member;
+  const settings = await ctx.users.get(id);
+  const outcome: TrainOutcome = await ctx.partyService.createTrain({
+    name: request.name,
+    creatorId: id,
+    creator,
+    regionChannelId: request.regionChannelId,
+    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
+    autoStatus: settings.autoStatus,
+    ...(request.atEnd === undefined ? {} : { atEnd: request.atEnd }),
+    ...(request.start === undefined ? {} : { startTime: request.start }),
+  });
+  switch (outcome.kind) {
+    case 'bad-name':
+      return { kind: 'refused', text: problemText('bad-name', ctx.attendance.limits(), 'train') };
+    case 'no-region':
+      return { kind: 'refused', text: TRAIN_FROM_A_REGION };
+    case 'no-forum':
+      return { kind: 'refused', text: noForumWords(names.channel(outcome.region.channelId)) };
+    case 'no-post':
+      return { kind: 'refused', text: NO_POST_MADE };
+    case 'created': {
+      const postId = outcome.party.forumPostId;
+      const post = postId === null ? undefined : names.post(postId);
+      const text = `Your train is made.${post === undefined ? '' : ` Its post is ${post}.`}`;
+      return { kind: 'made', party: outcome.party, text };
+    }
+  }
+}
+
+/** Where `/train` works, said wherever it does not. */
+export const TRAIN_FROM_A_REGION = 'Create a train from a region channel.';
+
+/** Adds a gym at the end of the route (`/route add`, the map). */
+export async function addStopAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  gymId: number,
+  staff: boolean,
+): Promise<TrainAnswer> {
+  return answerOf(ctx, await ctx.trains.addStop(party.id, member, gymId, staff), (ok) => {
+    const here = currentStop(ok.party) === gymId ? ' The train is there now.' : '';
+    return `${named(ctx, gymId)} is stop ${ok.number} of the route.${here}`;
+  });
+}
+
+/** Takes the stop with this number off the route (`/route remove`, the map). */
+export async function removeStopAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  number: number,
+  staff: boolean,
+): Promise<TrainAnswer> {
+  return answerOf(ctx, await ctx.trains.removeStop(party.id, member, number, staff), (ok) => {
+    const left = ok.party.train.route.length;
+    // The stop the train was at is gone: where it is now.
+    const at = currentStop(ok.party);
+    const where = !ok.moved
+      ? ''
+      : at !== undefined
+        ? ` The train is at ${named(ctx, at)} now.`
+        : left > 0
+          ? ' The train has finished its route.'
+          : '';
+    return `${named(ctx, ok.gymId)} is off the route, which has ${count(left, 'stop')} now.${where}`;
+  });
+}
+
+/** Moves the stop `from` to the number `to` (`/route move`, the map). */
+export async function moveStopAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  from: number,
+  to: number,
+  staff: boolean,
+): Promise<TrainAnswer> {
+  return answerOf(ctx, await ctx.trains.moveStop(party.id, member, from, to, staff), (ok) =>
+    ok.changed
+      ? `${named(ctx, ok.gymId)} is stop ${to} of the route now.`
+      : `${named(ctx, ok.gymId)} is stop ${to} of the route already.`,
+  );
+}
+
+/**
+ * Empties the route (`/route clear`, the map): for the conductor, and for `staff`, which for this
+ * is bot management, as the legacy bot had it.
+ */
+export async function clearRouteAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  staff: boolean,
+): Promise<TrainAnswer> {
+  return answerOf(ctx, await ctx.trains.clearRoute(party.id, member, staff), (ok) =>
+    ok.changed ? 'The route of this train is cleared.' : 'This train had no route.',
+  );
+}
+
+/** The name of a saved route as an answer shows it. A route that was just saved has one. */
+function routeName(route: SavedRoute): string {
+  return `**${plain(route.name)}**`;
+}
+
+/** Said for a saved route the member does not have (for the region of the train). */
+export const NO_SUCH_ROUTE =
+  'You have no such saved route for this region. Pick one from the list.';
+
+/** Saves the route of the train for the member under a name (`/route save`, the map). */
+export async function saveRouteAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  name: string,
+): Promise<TrainAnswer> {
+  const outcome = await ctx.trains.saveRoute(party.id, member, name);
+  switch (outcome.kind) {
+    case 'gone':
+      return { kind: 'gone', text: TRAIN_OVER };
+    case 'refused':
+      return {
+        kind: 'refused',
+        text:
+          outcome.reason === 'empty-route'
+            ? 'This train has no route to save yet.'
+            : outcome.reason === 'name-like-choice'
+              ? 'A saved route cannot be called `id:` and a number: that is how the list of ' +
+                'saved routes names its choices. Give it another name.'
+              : problemText(outcome.reason, ctx.attendance.limits(), 'train'),
+      };
+    case 'full':
+      return {
+        kind: 'refused',
+        text:
+          `You have ${MAX_SAVED_ROUTES} saved routes for this region, which is as many as you ` +
+          'can keep. Remove one with `/route forget` first, or save under the name of one ' +
+          'to replace it.',
+      };
+    case 'saved':
+    case 'replaced': {
+      const stops = count(outcome.route.gyms.length, 'stop');
+      const mode = atEndSentence(outcome.route.atEnd);
+      return {
+        kind: 'ok',
+        text:
+          outcome.kind === 'saved'
+            ? `I saved this route as ${routeName(outcome.route)}: ${stops}. ${mode} ` +
+              '`/route load` puts it into a train of this region.'
+            : `I replaced your saved route ${routeName(outcome.route)} with this one: ` +
+              `${stops}. ${mode}`,
+      };
+    }
+  }
+}
+
+/** Puts one of the member's saved routes into the train (`/route load`, the map). */
+export async function loadRouteAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  routeId: number,
+  staff: boolean,
+): Promise<TrainAnswer> {
+  const loaded = await ctx.trains.loadRoute(party.id, member, routeId, staff);
+  if (loaded.kind === 'none') return { kind: 'refused', text: NO_SUCH_ROUTE };
+  if (loaded.kind === 'no-stops') {
+    return { kind: 'refused', text: 'That saved route has no stops.' };
+  }
+  if (loaded.kind === 'refused' && loaded.reason === 'empty-route') {
+    return { kind: 'refused', text: 'None of the gyms of that route exists any more.' };
+  }
+  return answerOf(ctx, loaded, (ok) => {
+    const stops = count(ok.party.train.route.length, 'stop');
+    const mode = atEndSentence(ok.party.train.atEnd);
+    const missing =
+      ok.missing === 0
+        ? ''
+        : ` ${ok.missing === 1 ? 'One gym of it no longer exists and was' : `${ok.missing} gyms of it no longer exist and were`} left out.`;
+    const cut =
+      ok.cut === 0
+        ? ''
+        : ` ${count(ok.cut, 'more stop')} did not fit: a route has at most ${MAX_ROUTE_STOPS}.`;
+    // A route of the legacy bot may have no name.
+    const has =
+      ok.route.name === ''
+        ? 'a saved route without a name as its route now'
+        : `the route ${routeName(ok.route)} now`;
+    return ok.changed
+      ? `This train has ${has}: ${stops}. It is at the first. ${mode}${missing}${cut}`
+      : `This train has that route already, and is at its first stop. ${mode}${missing}${cut}`;
+  });
+}
+
+/** Deletes one of the member's saved routes of the region of the train (`/route forget`, the map). */
+export async function forgetRouteAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  memberId: string,
+  routeId: number,
+): Promise<TrainAnswer> {
+  const gone = await ctx.trains.forgetRoute(party.id, memberId, routeId);
+  if (!gone) return { kind: 'refused', text: NO_SUCH_ROUTE };
+  return {
+    kind: 'ok',
+    text:
+      gone.name === ''
+        ? 'I forgot your saved route without a name.'
+        : `I forgot your saved route ${routeName(gone)}.`,
+  };
+}
+
+/**
+ * Moves the train along its route (`/next`, `/previous`, `/skip`, `/finish`, the map) and says
+ * where it is now. `from` and `target` are for a control drawn at a place (the map's panel).
+ */
+export async function moveTrainAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  move: TrainMove,
+  staff: boolean,
+  from?: string,
+  target?: string,
+): Promise<TrainAnswer> {
+  const outcome = await ctx.trains.move(party.id, member, move, staff, from, target);
+  return answerOf(ctx, outcome, (ok) => {
+    const others = membersWhere(ok.party, (_attendee, id) => id !== member.id).length > 0;
+    return `${whereText(trainPlaces(ctx, ok.party))}${others ? ' I am telling the others.' : ''}`;
+  });
+}
+
+/**
+ * How the answer of a takeover names the conductor before (`setConductorAs`): on Discord the
+ * member as a sentence names them (`DISCORD_CONDUCTOR`); the map names nobody.
+ */
+export type ConductorNamer = (party: TrainParty, previousId: string) => string;
+
+/** The conductor before as `/conductor set` names them: `memberText`. */
+export const DISCORD_CONDUCTOR: ConductorNamer = (party, previousId) =>
+  memberText(memberOf(party, previousId));
+
+/**
+ * Makes the member the conductor (`/conductor set`, the map); a takeover names the conductor
+ * before as `previous` says.
+ */
+export async function setConductorAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  previous: ConductorNamer,
+): Promise<TrainAnswer> {
+  return answerOf(ctx, await ctx.trains.setConductor(party.id, member), (ok) => {
+    const only = 'Only you and the moderators can move it now.';
+    return !ok.changed
+      ? 'You are the conductor of this train already.'
+      : ok.previous === null
+        ? `You are the conductor of this train. ${only}`
+        : `You are the conductor of this train, in the place of ${previous(party, ok.previous)}. ${only}`;
+  });
+}
+
+/** Leaves the train without a conductor (`/conductor clear`, the map). */
+export async function clearConductorAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  staff: boolean,
+): Promise<TrainAnswer> {
+  return answerOf(ctx, await ctx.trains.clearConductor(party.id, member, staff), (ok) => {
+    const anybody = 'Anybody who is signed up can move it.';
+    return !ok.changed
+      ? `This train has no conductor. ${anybody}`
+      : ok.previous === member.id
+        ? `You are no longer the conductor of this train. ${anybody}`
+        : `This train has no conductor any more. ${anybody}`;
+  });
+}
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index 6d2ba04dc2c0f51585f9d3297a82d11bc43c3353..2f87b7208b7129b856f5a56118bd5bd4a35cda75 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -2,7 +2,6 @@ import { SlashCommandBuilder } from 'discord.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { regionChannelOf, requireGuild } from '../../discord/guards.js';
-import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
 import {
   attendeeOf,
@@ -10,13 +9,16 @@ import {
   MAX_PARTY_NAME,
   TRAIN_AT_END,
 } from '../../domain/party/party.js';
-import { RaidPrivacy } from '../../domain/party/status.js';
-import { NO_POST_MADE, problemText } from '../../render/activity.js';
 import { AT_END_LABELS } from '../../render/train-words.js';
-import { noForumYet, requirePlaceForNew } from '../parties/timed.js';
+import { actingMember } from '../parties/reply.js';
+import { requirePlaceForNew } from '../parties/timed.js';
+import { DISCORD_NAMES } from '../raids/report.js';
+import { notSignedUpWords, startTrainAs, TRAIN_FROM_A_REGION } from './train-changes.js';
 
-/** Where `/train` works, said wherever it does not. */
-export const TRAIN_FROM_A_REGION = 'Create a train from a region channel.';
+export { TRAIN_FROM_A_REGION };
+
+/** The name `/train` is used and counted under, and the map's new trains with it. */
+export const TRAIN_COMMAND = 'train';
 
 /** As the legacy bot allowed: a train is a post that stays for hours or days. */
 export const TRAIN_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };
@@ -30,7 +32,7 @@ export const TRAIN_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };
  */
 export const train: SimpleCommand = {
   data: new SlashCommandBuilder()
-    .setName('train')
+    .setName(TRAIN_COMMAND)
     .setDescription('Create a raid train in this region, with a post of its own')
     .addStringOption((option) =>
       option
@@ -70,44 +72,30 @@ export const train: SimpleCommand = {
   async execute(interaction, ctx) {
     const regionChannelId = regionChannelOf(interaction, ctx);
     if (regionChannelId === undefined) throw new UserError(TRAIN_FROM_A_REGION);
-    const settings = await ctx.users.get(interaction.user.id);
     // A choice of the option; anything else (a client that sends what it was not offered) is the default.
     const atEnd = interaction.options.getString('at-end');
-    const outcome = await ctx.partyService.createTrain({
-      name: interaction.options.getString('name', true),
-      creatorId: interaction.user.id,
-      creator: memberInfo(interaction),
-      regionChannelId,
-      anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
-      autoStatus: settings.autoStatus,
-      ...(isTrainAtEnd(atEnd) ? { atEnd } : {}),
+    const answer = await startTrainAs(
+      ctx,
+      actingMember(interaction),
+      {
+        name: interaction.options.getString('name', true),
+        regionChannelId,
+        ...(isTrainAtEnd(atEnd) ? { atEnd } : {}),
+      },
+      DISCORD_NAMES,
+    );
+    // The guard has looked at all of the refusals; they are for what changed in between.
+    if (answer.kind === 'refused') throw new UserError(answer.text);
+    // Who made it may lay its route and set its times without being signed up; moving it and
+    // being its conductor take a sign-up.
+    const signedUp = attendeeOf(answer.party, interaction.user.id) !== undefined;
+    await interaction.editReply({
+      content:
+        `${answer.text} ` +
+        'There, `/route add` adds its stops' +
+        (signedUp
+          ? ', `/meet` sets when it starts, and `/conductor set` makes you its conductor.'
+          : ` and \`/meet\` sets when it starts. ${notSignedUpWords('in the post')}`),
     });
-    // The guard has looked at all of these; what follows is for what changed in between.
-    switch (outcome.kind) {
-      case 'bad-name':
-        throw new UserError(problemText('bad-name', ctx.attendance.limits(), 'train'));
-      case 'no-region':
-        throw new UserError(TRAIN_FROM_A_REGION);
-      case 'no-forum':
-        throw new UserError(noForumYet(outcome.region.channelId));
-      case 'no-post':
-        throw new UserError(NO_POST_MADE);
-      case 'created': {
-        const post = outcome.party.forumPostId;
-        // Who made it may lay its route and set its times without being signed up; moving
-        // it and being its conductor take a sign-up.
-        const signedUp = attendeeOf(outcome.party, interaction.user.id) !== undefined;
-        await interaction.editReply({
-          content:
-            `Your train is made.${post === null ? '' : ` Its post is <#${post}>.`} ` +
-            'There, `/route add` adds its stops' +
-            (signedUp
-              ? ', `/meet` sets when it starts, and `/conductor set` makes you its conductor.'
-              : ' and `/meet` sets when it starts. You are not signed up for it, as your ' +
-                '`/settings auto-status` is None: sign up in the post to move the train or ' +
-                'to be its conductor.'),
-        });
-      }
-    }
   },
 };
diff --git a/src/domain/party/timed.ts b/src/domain/party/timed.ts
index e90302ebdfc18c4af06659b3ba061e0446109b45..b4d821dd04c868b17ef5f2fb28fbb09355154a97 100644
--- a/src/domain/party/timed.ts
+++ b/src/domain/party/timed.ts
@@ -33,6 +33,11 @@ export interface NewTimedParty {
   createdById: string;
   /** As the member typed it; it is tidied (`tidyName`). */
   name: string;
+  /**
+   * When it starts, as the caller read it (a train started on the map); floored to the minute,
+   * as `setStartTime` floors it. Left out: no start yet.
+   */
+  startTime?: number;
   now: number;
 }
 
@@ -40,7 +45,8 @@ export interface NewTimedParty {
  * What every new timed party starts as, before the part of its own kind is added: a name and
  * nothing else yet, with the member who made it signed up as interested in group A (as the
  * legacy bot did), and named. That is a meetup as it stays; a train changes both by what its
- * maker has set (`createTrain`). It has no times: `settled` gives it its day.
+ * maker has set (`createTrain`). It has no times but the start it was given, if any: `settled`
+ * gives it its day.
  */
 export function newTimedParty(
   input: NewTimedParty,
@@ -77,7 +83,11 @@ export function newTimedParty(
     groups: [{ id: 'A' }],
     defaultGroupId: 'A',
     prompts: NO_PROMPTS,
-    timed: { name, startTime: null },
+    timed: {
+      name,
+      startTime:
+        input.startTime === undefined ? null : Math.floor(input.startTime / MINUTE) * MINUTE,
+    },
   };
 }
 
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index e3ea797f3436b68679ef89fa309647dcdf71cf18..5703cbb9c389eab14f1b5196fa4f2a0b76d56c4a 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -188,6 +188,11 @@ export interface TrainRequest extends TimedRequest {
   autoStatus?: PartyStatus;
   /** What the train does at the end of its route. Left out: it finishes the route. */
   atEnd?: TrainAtEnd;
+  /**
+   * When it starts, read by the caller (the map's form, as `/meet` reads it): its post and the
+   * news of a new train say it from the first. Left out: no start yet.
+   */
+  startTime?: number;
 }
 
 export type TimedOutcome<P extends TimedParty> =
@@ -767,13 +772,14 @@ export class PartyService {
    * Its maker is signed up, and named, as they have set it for the raids they report.
    */
   createTrain(request: TrainRequest): Promise<TrainOutcome> {
-    const { anonymous, autoStatus, atEnd } = request;
+    const { anonymous, autoStatus, atEnd, startTime } = request;
     return this.createTimed(request, 'train', (input) =>
       createTrain({
         ...input,
         ...(anonymous === undefined ? {} : { anonymous }),
         ...(autoStatus === undefined ? {} : { autoStatus }),
         ...(atEnd === undefined ? {} : { atEnd }),
+        ...(startTime === undefined ? {} : { startTime }),
       }),
     );
   }
````

### Task 2: Trains from the map: starting a train

Prototype commit: `d4284ecfdef68f53280cf2297073f70edface095`

`POST /s/<guild>/api/trains` `{ region, name, time?, atEnd? }`: the per-address limit and `postGuard` before the body, the session, the member checks, a region of this server and its forum (none, barred, Discord away), the name and the time read as `/train` reads them, then `/train`'s throttle and `startTrainAs`; the answer adds `/train`'s clause for a maker not signed up.

**Files:**

```
 src/app.ts                    |   2 +
 src/commands/parties/timed.ts |  22 ++++++--
 src/domain/web/train-data.ts  |  34 ++++++++++++
 src/web/guild-routes.ts       |   4 ++
 src/web/server.ts             |   3 ++
 src/web/train-routes.ts       | 236 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/train-start.test.ts   | 234 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/web.ts           |  28 ++++++++++
 8 files changed, 560 insertions(+), 3 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/train-start.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/app.ts src/commands/parties/timed.ts src/domain/web/train-data.ts src/web/guild-routes.ts src/web/server.ts src/web/train-routes.ts src/web/train-start.test.ts test/support/web.ts` and `npx eslint src/app.ts src/commands/parties/timed.ts src/domain/web/train-data.ts src/web/guild-routes.ts src/web/server.ts src/web/train-routes.ts src/web/train-start.test.ts test/support/web.ts`.
- [ ] **Step 4: Check the transcription:** `git diff d4284ecfdef68f53280cf2297073f70edface095 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Trains from the map: starting a train`, the paragraph above as the body and the trailer, staging exactly
  `src/app.ts src/commands/parties/timed.ts src/domain/web/train-data.ts src/web/guild-routes.ts src/web/server.ts src/web/train-routes.ts src/web/train-start.test.ts test/support/web.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index 9d48242a8eba1190241e5a89ee1273b9af020f02..7f6e65bbe5d2089504851100ca368912ae779a95 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -844,6 +844,8 @@ export async function startApp(
         channelName: (channelId) => partyGateway.channelName(channelId),
         channels: partyGateway,
       },
+      // Starting, arranging and moving trains on the map: what the train commands read and call.
+      trains: { ctx, channelName: (channelId) => partyGateway.channelName(channelId) },
       now: () => Date.now(),
       log,
     });
diff --git a/src/commands/parties/timed.ts b/src/commands/parties/timed.ts
index 30cfc609e2e772e2b5f4684d21bdd190958bceb8..fecfd1914c87ecd2ffe43283490639213c7582c4 100644
--- a/src/commands/parties/timed.ts
+++ b/src/commands/parties/timed.ts
@@ -71,6 +71,22 @@ export function requirePlaceForNew(word: string, fromARegion: string): Guard {
   };
 }
 
+/** What reading a time of a timed party asks of it: its kind, when it was made, its times. */
+export interface TimedTimes {
+  type: TimedParty['type'];
+  createdAt: number;
+  endTime: number | null;
+  timed: { startTime: number | null };
+}
+
+/**
+ * A timed party that is not made yet, as reading its start sees it (the map's form of a new
+ * train, plan 8M-5): made now, without times.
+ */
+export function newPartyTimes(type: TimedParty['type'], now: number): TimedTimes {
+  return { type, createdAt: now, endTime: null, timed: { startTime: null } };
+}
+
 /**
  * A time a member typed for a timed party that exists (a meetup or a train): when it
  * starts (`meet`) or when it ends. `'unset'` when the member asked to remove it (`cancel`,
@@ -84,8 +100,8 @@ export function requirePlaceForNew(word: string, fromARegion: string): Guard {
  * on, and with the way to name another: the member cannot see what "5" was taken for.
  */
 export function typedTimedTime(
-  ctx: AppContext,
-  party: TimedParty,
+  ctx: Pick<AppContext, 'config'>,
+  party: TimedTimes,
   parameter: 'meet' | 'end',
   text: string,
   now: number,
@@ -102,7 +118,7 @@ export function typedTimedTime(
     party: {
       creationTime: party.createdAt,
       endTime: party.endTime,
-      startTime: startTimeOf(party),
+      startTime: party.timed.startTime,
     },
     settings,
   });
diff --git a/src/domain/web/train-data.ts b/src/domain/web/train-data.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b9c13239052b522806ebb17e7204a1b141de7a19
--- /dev/null
+++ b/src/domain/web/train-data.ts
@@ -0,0 +1,34 @@
+/**
+ * What the live map's trains read and send (plan 8M-5, spec 3.7), as the page reads it. Types
+ * and lists alone, with no import of the server's code: the page's bundle (`src/web/client/`)
+ * takes them.
+ */
+
+import type { MapTrain } from './party-data.js';
+
+/** What a train does at the last stop of its route, as `/train`'s option `at-end` takes it. */
+export const MAP_AT_ENDS = ['finish', 'loop', 'turn-back'] as const;
+export type MapAtEnd = (typeof MAP_AT_ENDS)[number];
+
+/**
+ * What starting, arranging or moving a train answers: whether it was done, the command's words
+ * as plain text, and the train as the member now sees it on the map, when there is one to show
+ * (also after a refusal, so that the page draws it as it is now).
+ */
+export interface TrainAnswer {
+  ok: boolean;
+  text: string;
+  train?: MapTrain;
+}
+
+/**
+ * The body of a new train (`POST /s/<guild>/api/trains`): the region it is made in (any region
+ * of the server, by id as `/api/geo` lists it), its name, when it starts as `/meet` takes it (a
+ * clock time, a date and a time, or `in 30`), and what it does at the end of its route.
+ */
+export interface TrainStartBody {
+  region: number;
+  name: string;
+  time?: string;
+  atEnd?: MapAtEnd;
+}
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index b6df1323fcba719c4e819c151c0cab398a051364..5ea4d8c65f963c6f9c460ede156ebf09eb6bbb3a 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -10,6 +10,7 @@ import { raidRoutes } from './raid-routes.js';
 import { limitedPerAddress, RateLimiter } from './rate-limit.js';
 import { spawnRoutes } from './spawn-routes.js';
 import type { WebDeps } from './server.js';
+import { trainRoutes } from './train-routes.js';
 
 /** The requests for a server's regions and gyms one address may make in a minute (spec 5). */
 const GEO_PER_MINUTE = 60;
@@ -118,4 +119,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
 
   // Reporting wild Pokémon on the live map (plan 8M-4S): for the same members.
   spawnRoutes(scope, map);
+
+  // Starting, arranging and moving trains on the live map (plan 8M-5): for the same members.
+  trainRoutes(scope, map);
 }
diff --git a/src/web/server.ts b/src/web/server.ts
index 0b394a2f7f82a88481f5c1d93911860af7b1e8e2..2aff375124e7f2b4fab28c52b771df712065f645 100644
--- a/src/web/server.ts
+++ b/src/web/server.ts
@@ -18,6 +18,7 @@ import type { PartyWebDeps } from './party-routes.js';
 import type { RaidWebDeps } from './raid-routes.js';
 import type { Sessions } from './sessions.js';
 import type { SpawnWebDeps } from './spawn-routes.js';
+import type { TrainWebDeps } from './train-routes.js';
 
 /** `settings.web` once it is set. */
 export type WebSettings = NonNullable<Settings['web']>;
@@ -50,6 +51,8 @@ export interface WebDeps {
   raids: RaidWebDeps;
   /** Reporting wild Pokémon on the live map (plan 8M-4S). */
   spawns: SpawnWebDeps;
+  /** Starting, arranging and moving trains on the live map (plan 8M-5). */
+  trains: TrainWebDeps;
   now: () => number;
   log: Logger;
 }
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a9c3eff78bc810d84deb9b93f00c9492d4ff49f0
--- /dev/null
+++ b/src/web/train-routes.ts
@@ -0,0 +1,236 @@
+import type { FastifyInstance, FastifyReply } from 'fastify';
+import { z } from 'zod';
+import type { AppContext } from '../app-context.js';
+import { newPartyTimes, noForumWords, typedTimedTime } from '../commands/parties/timed.js';
+import type { ReportNames } from '../commands/raids/report.js';
+import {
+  notSignedUpWords,
+  startTrainAs,
+  type TrainChanging,
+  type TrainStarting,
+} from '../commands/trains/train-changes.js';
+import { TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
+import type { Region } from '../db/repositories/region-repository.js';
+import { UserError } from '../discord/errors.js';
+import type { MemberAccess } from '../discord/party-gateway.js';
+import {
+  attendeeOf,
+  MAX_PARTY_NAME,
+  TRAIN_AT_END,
+  type TrainParty,
+} from '../domain/party/party.js';
+import { tidyName } from '../domain/party/timed.js';
+import { problemText } from '../render/activity.js';
+import { timestamp } from '../render/text.js';
+import type { MapTrain } from '../domain/web/party-data.js';
+import { mapParty } from '../domain/web/party-view.js';
+import type { TrainAnswer } from '../domain/web/train-data.js';
+import { actingOnTheMap, isMapStaff, throttledOnTheMap, unreachableOnTheMap } from './acting.js';
+import { sendFailure } from './answers.js';
+import { postGuard } from './csrf.js';
+import type { GuildRequest } from './guild-routes.js';
+import { pageWords } from './page-words.js';
+import { limitedPerAddress, RateLimiter } from './rate-limit.js';
+import type { WebDeps } from './server.js';
+
+/**
+ * What the trains of the live map read and call (plan 8M-5): exactly what `/train`, `/route`,
+ * `/next` and the others, `/conductor` and `/meet`'s reader use (the members' settings, the party
+ * and train services, the gyms and regions, the settings), so that the map shares their code
+ * paths.
+ */
+export type TrainWebContext = TrainStarting &
+  TrainChanging &
+  Pick<AppContext, 'config' | 'regions'>;
+
+/** What the trains of the live map need beyond the parties' own (`PartyWebDeps`). */
+export interface TrainWebDeps {
+  ctx: TrainWebContext;
+  /** A channel's name as the bot sees it now: a region's, which an answer names. */
+  channelName(channelId: string): string | undefined;
+}
+
+/**
+ * The writes of trains one address may send in a minute, whoever sends them: a route is laid a
+ * click a stop, and a household shares an address.
+ */
+export const TRAIN_WRITES_PER_ADDRESS_MINUTE = 60;
+
+/**
+ * The body of a new train: the region (by id, as `/api/geo` lists it), the name as `/train` takes
+ * it (up to its option's length; a blank one is refused in its words), the start as `/meet` takes
+ * it, and the mode as `/train`'s `at-end` offers it. Anything else is malformed.
+ */
+const startBodySchema = z
+  .object({
+    region: z.number().int().positive(),
+    name: z.string().max(MAX_PARTY_NAME),
+    time: z.string().max(40).optional(),
+    atEnd: z.enum(TRAIN_AT_END).optional(),
+  })
+  .strict();
+
+/** What the map's answer adds after a train is made: its route is laid on the map. */
+export const ADD_STOPS = 'Click gyms on the map to add its stops.';
+
+/**
+ * The trains of the live map (spec 3.7): starting one (`POST /s/<guild>/api/trains`), which is
+ * `/train` as the member in the region picked, with its start read as `/meet` reads it.
+ */
+export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
+  const { sessions, parties, trains } = deps;
+  const { ctx } = trains;
+
+  /** The words of a command as text of the page, in the posts' zone. */
+  const words = (text: string): string => pageWords(text, parties.zone, deps.now());
+
+  /** A region in a sentence: `#west` as its channel reads, else `Region 5`. */
+  const regionInWords = (region: Pick<Region, 'id' | 'channelId'>): string => {
+    const name = trains.channelName(region.channelId);
+    return name === undefined ? `Region ${region.id}` : `#${name}`;
+  };
+
+  /** How the map's answers name a post (not at all: the page shows the train) and a region. */
+  const names: ReportNames = {
+    post: () => undefined,
+    channel: (channelId) => {
+      const region = ctx.regions.byChannel(channelId);
+      return region ? regionInWords(region) : `#${trains.channelName(channelId) ?? 'unknown'}`;
+    },
+  };
+
+  /** How the member stands to a forum; rejects while Discord cannot say. */
+  const accessTo = (forumId: string | null, userId: string): Promise<MemberAccess | undefined> =>
+    forumId === null ? Promise.resolve(undefined) : parties.forums.memberAccess(forumId, userId);
+
+  /** A train as the member sees it on the map now (`mapParty`): none without its post yet. */
+  const viewOf = (
+    guildId: string,
+    guildRow: number,
+    party: TrainParty,
+    userId: string,
+    staff: boolean,
+  ): MapTrain | undefined => {
+    const shown = mapParty(party, {
+      guildId,
+      guildRow,
+      parties: [],
+      memberId: userId,
+      barred: new Set(),
+      now: deps.now(),
+      zone: parties.zone,
+      readOnly: false,
+      staff,
+      look: (raid) => parties.look(raid),
+      pictureOrigins: deps.pictureOrigins,
+    });
+    return shown?.kind === 'train' ? shown : undefined;
+  };
+
+  /** A refusal in the command's words, as text of the page. */
+  const refuse = (reply: FastifyReply, status: number, text: string) => {
+    const answer: TrainAnswer = { ok: false, text: words(text) };
+    return reply.code(status).send(answer);
+  };
+
+  const writeLimiter = new RateLimiter({ uses: TRAIN_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
+  const writeGuards = [
+    limitedPerAddress(writeLimiter, { now: deps.now }),
+    postGuard(sessions, deps.settings.publicUrl),
+  ];
+
+  // A new train (spec 3.7): before the body is read (`onRequest`), the per-address limit and the
+  // guard of every POST. Then the session (403) and the body (400), who starts it
+  // (`actingOnTheMap`), the region (one of this server, else 404, so that nobody learns of other
+  // servers' regions), its forum (none: `/train`'s words; barred 403, as the post would be one
+  // the member cannot open; Discord unreachable 503), what `/train`'s guard and `/meet`'s reader
+  // refuse (a blank name, a time that is none), and only then `/train`'s throttle in its window;
+  // then `/train`'s code path as the member (`startTrainAs`), with the start.
+  scope.post('/api/trains', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
+    void reply.header('cache-control', 'no-store');
+    const session = await sessions.of(request, reply);
+    if (!session) return sendFailure(request, reply, 403);
+    const body = startBodySchema.safeParse(request.body ?? {});
+    if (!body.success) return sendFailure(request, reply, 400);
+    const { guild } = request.params;
+    const { userId } = session;
+    const doing = 'started a train';
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+    if ('sent' in acting) return acting.sent;
+    const row = await parties.guilds.idFor(guild);
+    const region = ctx.regions.byId(body.data.region);
+    if (row === undefined || region === undefined || region.guildId !== row) {
+      return sendFailure(request, reply, 404);
+    }
+    if (region.forumChannelId === null) {
+      return refuse(reply, 422, noForumWords(regionInWords(region)));
+    }
+    try {
+      if ((await accessTo(region.forumChannelId, userId)) === 'barred') {
+        return sendFailure(request, reply, 403);
+      }
+    } catch (err) {
+      return unreachableOnTheMap(deps, reply, err, guild, userId, doing);
+    }
+    if (tidyName(body.data.name) === undefined) {
+      return refuse(reply, 422, problemText('bad-name', ctx.attendance.limits(), 'train'));
+    }
+    let start: number | undefined;
+    const typed = body.data.time?.trim() ?? '';
+    if (typed !== '') {
+      try {
+        const read = typedTimedTime(
+          ctx,
+          newPartyTimes('train', deps.now()),
+          'meet',
+          typed,
+          deps.now(),
+        );
+        start = read === 'unset' ? undefined : read.at;
+      } catch (err) {
+        if (!(err instanceof UserError)) throw err;
+        return refuse(reply, 422, err.message);
+      }
+    }
+    const throttled = throttledOnTheMap(
+      deps,
+      reply,
+      { command: TRAIN_COMMAND },
+      userId,
+      TRAIN_THROTTLE,
+    );
+    if (throttled) return throttled;
+    const made = await startTrainAs(
+      ctx,
+      acting.member,
+      {
+        name: body.data.name,
+        regionChannelId: region.channelId,
+        ...(body.data.atEnd === undefined ? {} : { atEnd: body.data.atEnd }),
+        ...(start === undefined ? {} : { start }),
+      },
+      names,
+    );
+    deps.log.info(
+      { user: userId, guild, region: region.id, outcome: made.kind },
+      'a train was started on the map',
+    );
+    if (made.kind === 'refused') return refuse(reply, 422, made.text);
+    const party = parties.store.get(made.party.id);
+    const staff = isMapStaff(acting.standing, userId, parties.ownerId);
+    const train = party?.type === 'train' ? viewOf(guild, row, party, userId, staff) : undefined;
+    const { startTime } = made.party.timed;
+    const when = startTime === null ? '' : ` It starts at ${timestamp(startTime)}.`;
+    // Who made it may lay its route without being signed up, as after `/train`.
+    const signUp =
+      attendeeOf(made.party, userId) === undefined
+        ? ` ${notSignedUpWords('in its popup or its post')}`
+        : '';
+    const answer: TrainAnswer = {
+      ok: true,
+      text: words(`${made.text}${when} ${ADD_STOPS}${signUp}`),
+      ...(train ? { train } : {}),
+    };
+    return reply.send(answer);
+  });
+}
diff --git a/src/web/train-start.test.ts b/src/web/train-start.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3cb587c0d4b3507968f2255c6fbe2fdac0ba397e
--- /dev/null
+++ b/src/web/train-start.test.ts
@@ -0,0 +1,234 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import {
+  EAST_CHANNEL,
+  UNBOUNDED_CHANNEL,
+  WEST_CHANNEL,
+  WEST_FORUM,
+} from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { dmBrief } from '../../test/support/messages.js';
+import { ALICE, at, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { partyServiceWith } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  trainWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
+import { Throttles } from '../discord/throttle.js';
+import { isTrain, type TrainParty } from '../domain/party/party.js';
+import { PartyStatus, RaidPrivacy } from '../domain/party/status.js';
+import type { TrainAnswer } from '../domain/web/train-data.js';
+import { UNREACHABLE } from './acting.js';
+
+const START = `/s/${FAKE_GUILD_ID}/api/trains`;
+
+/**
+ * The map of a server with the party services of a test and no train yet: Alice a member (in
+ * the directory, and fetched fresh as `Alice` of team mystic), Bob a member, the clock the
+ * parties' own, the channels named `west` and `east` as the bot sees them.
+ */
+async function starting(options: { throttles?: Throttles } = {}) {
+  const throttles = options.throttles ?? new Throttles();
+  const made = await partyServiceWith([]);
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    trains: made.trains,
+    parties: made.store,
+    regions: made.regions,
+    users: made.users,
+  });
+  const members = new FakeMemberDirectory().add(ALICE, 'Alice').add(BOB, 'Bob');
+  const acting = new FakeActingMembers().add(ALICE, 'Alice', 'mystic').add(BOB, 'Bob');
+  const names = new Map([
+    [WEST_CHANNEL, 'west'],
+    [EAST_CHANNEL, 'east'],
+    [UNBOUNDED_CHANNEL, 'unbounded'],
+  ]);
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    trains: trainWebWith(ctx, { channelName: (id) => names.get(id) }),
+  });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const start = async (body: unknown, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: START,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<TrainAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  const trains = (): TrainParty[] => made.store.active().filter(isTrain);
+  return { made, ctx, web, acting, members, headers, start, trains, throttles };
+}
+
+describe('starting a train on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("makes a train as /train does, in the region picked, with its start read as /meet reads it: the member signed up, the command's words as text, the train as the map shows it", async () => {
+    const map = await starting();
+    web = map.web;
+    await map.made.newTrains.set(BOB, map.made.gateway.guildId, true, 1);
+    const answer = await map.start({ region: 1, name: 'Park loop', time: '6:15pm' });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      ok: true,
+      text: 'Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops.',
+      train: {
+        kind: 'train',
+        name: 'Park loop',
+        startTime: at('2026-10-13T18:15'),
+        route: [],
+        stop: null,
+        attendance: { mine: { status: 'interested', group: 'A' } },
+      },
+    });
+    const [made] = map.trains();
+    expect(made).toMatchObject({
+      forumChannelId: WEST_FORUM,
+      createdById: ALICE,
+      anonymous: false,
+      timed: { name: 'Park loop', startTime: at('2026-10-13T18:15') },
+      train: { atEnd: 'finish' },
+      attendees: { [ALICE]: { status: PartyStatus.Interested, name: 'Alice', team: 'mystic' } },
+    });
+    expect(answer.json.train?.id).toBe(made?.id);
+    // The train is made with its start: its post says it from the first, and so does the DM of
+    // who asked to hear of new trains.
+    await map.made.notify.flush();
+    const [told] = map.made.dms.to(BOB);
+    expect(dmBrief(told).join('\n')).toContain(`<t:${String(at('2026-10-13T18:15') / 1000)}:`);
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({
+        msg: 'a train was started on the map',
+        user: ALICE,
+        guild: FAKE_GUILD_ID,
+        region: 1,
+        outcome: 'made',
+      }),
+    );
+  });
+
+  it("follows the maker's privacy and automatic status, and the mode picked, as /train does; without a time it has none", async () => {
+    const map = await starting();
+    web = map.web;
+    map.made.userSettings.set(ALICE, {
+      raidPrivacy: RaidPrivacy.Anonymous,
+      autoStatus: PartyStatus.NotInterested,
+    });
+    const answer = await map.start({ region: 2, name: 'East loop', atEnd: 'loop' });
+    expect(answer.status).toBe(200);
+    // Not signed up: said as /train says it.
+    expect(answer.json.text).toBe(
+      'Your train is made. Click gyms on the map to add its stops. You are not signed up for ' +
+        'it, as your /settings auto-status is None: sign up in its popup or its post to move ' +
+        'the train or to be its conductor.',
+    );
+    expect(answer.json.train).toMatchObject({ startTime: null, attendance: { mine: null } });
+    expect(map.trains()[0]).toMatchObject({
+      anonymous: true,
+      attendees: {},
+      timed: { startTime: null },
+      train: { atEnd: 'loop' },
+    });
+  });
+
+  it("refuses what /train's guard and /meet's reader refuse, in their words as text, before its throttle", async () => {
+    const throttles = new Throttles();
+    const map = await starting({ throttles });
+    web = map.web;
+    // One use of /train is left in its window.
+    throttles.use(TRAIN_COMMAND, ALICE, TRAIN_THROTTLE, PARTY_NOW);
+    const blank = await map.start({ region: 1, name: '   ' });
+    expect(blank.status).toBe(422);
+    expect(blank.json).toEqual({ ok: false, text: 'Give a name of 1 to 80 characters.' });
+    const unread = await map.start({ region: 1, name: 'Park loop', time: 'soonish' });
+    expect(unread.status).toBe(422);
+    expect(unread.json.text).toMatch(/^I could not read "soonish" as the time the train starts\./);
+    const noForum = await map.start({ region: 3, name: 'Park loop' });
+    expect(noForum.status).toBe(422);
+    expect(noForum.json.text).toBe(
+      'The region #unbounded has no forum yet. A moderator can create it with /admin setup-forums.',
+    );
+    expect(map.trains()).toEqual([]);
+    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(200);
+    const again = await map.start({ region: 1, name: 'Second loop' });
+    expect(again.status).toBe(429);
+    expect(again.json.error).toBe('You can use /train again in 15 minutes.');
+    expect(again.headers['retry-after']).toBeDefined();
+  });
+
+  it('counts in the window of /train: two from the map and Discord together', async () => {
+    const throttles = new Throttles();
+    const map = await starting({ throttles });
+    web = map.web;
+    throttles.use(TRAIN_COMMAND, ALICE, TRAIN_THROTTLE, PARTY_NOW);
+    throttles.use(TRAIN_COMMAND, ALICE, TRAIN_THROTTLE, PARTY_NOW);
+    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(429);
+    expect(map.trains()).toEqual([]);
+  });
+
+  it('knows no region of another server or none at all (404), and refuses a body that is not the form', async () => {
+    const map = await starting();
+    web = map.web;
+    map.made.regions.rows.push({
+      id: 9,
+      guildId: 2,
+      channelId: '100000000000000099',
+      description: null,
+      bounds: null,
+      forumChannelId: '100000000000000098',
+      summaryMessageId: null,
+    });
+    expect((await map.start({ region: 9, name: 'Park loop' })).status).toBe(404);
+    expect((await map.start({ region: 77, name: 'Park loop' })).status).toBe(404);
+    expect((await map.start({ region: 1, name: 'Park loop', at: 'end' })).status).toBe(400);
+    expect((await map.start({ region: 1, name: 'x'.repeat(81) })).status).toBe(400);
+    expect((await map.start({ region: 1, name: 'Park loop', atEnd: 'around' })).status).toBe(400);
+    expect(map.trains()).toEqual([]);
+  });
+
+  it("refuses a member kept out of the region's forum (403), and nothing while Discord cannot say (503)", async () => {
+    const map = await starting();
+    web = map.web;
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.start({ region: 1, name: 'Park loop' })).status).toBe(403);
+    map.made.gateway.barred.clear();
+    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
+    const away = await map.start({ region: 1, name: 'Park loop' });
+    expect(away.status).toBe(503);
+    expect(away.json.error).toBe(UNREACHABLE);
+    expect(map.trains()).toEqual([]);
+  });
+
+  it('is for members who may act: nobody else starts a train', async () => {
+    const map = await starting();
+    web = map.web;
+    const stranger = await map.web.posting('300000000000000009', 'Stranger');
+    expect((await map.start({ region: 1, name: 'Park loop' }, stranger)).status).toBe(403);
+    map.acting.holdBack(ALICE, 'timed-out');
+    expect((await map.start({ region: 1, name: 'Park loop' })).json.error).toBe(
+      'You are timed out in this server, so you cannot do that now.',
+    );
+    const { 'x-pine-csrf': _token, ...noToken } = map.headers;
+    expect((await map.start({ region: 1, name: 'Park loop' }, noToken)).status).toBe(403);
+    expect(map.trains()).toEqual([]);
+  });
+});
diff --git a/test/support/web.ts b/test/support/web.ts
index d1660f7e41d9c2451272d0f53c8fbd1f5204700f..9d2212b9a8ad37d725e00b06bba1b152dfb9e397 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -18,6 +18,7 @@ import type { WebAssets } from '../../src/web/page.js';
 import type { ActingAnswer, ActingMembers, PartyWebDeps } from '../../src/web/party-routes.js';
 import type { RaidWebContext, RaidWebDeps } from '../../src/web/raid-routes.js';
 import type { SpawnWebContext, SpawnWebDeps } from '../../src/web/spawn-routes.js';
+import type { TrainWebContext, TrainWebDeps } from '../../src/web/train-routes.js';
 import { Throttles } from '../../src/discord/throttle.js';
 import type { Team } from '../../src/domain/party/party.js';
 import type { Member } from '../../src/services/attendance-service.js';
@@ -294,6 +295,30 @@ export function spawnWebWith(
   return { ctx, channelName: () => undefined, channels: NOBODY_KEPT_OUT, ...options };
 }
 
+/**
+ * Starting, arranging and moving trains on the map over a test's context (`createTestContext`,
+ * with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of
+ * `partyServiceWith` or `createdTrain`), as the bot wires it. Pass as `trains`. `channelName`
+ * names the channels the bot sees (none by default).
+ */
+export function trainWebWith(
+  ctx: TrainWebContext,
+  options: Partial<Omit<TrainWebDeps, 'ctx'>> = {},
+): TrainWebDeps {
+  return { ctx, channelName: () => undefined, ...options };
+}
+
+/** No trains can be started or changed: a test that does passes `trainWebWith`. */
+const NO_TRAINS: TrainWebDeps = {
+  ctx: new Proxy({} as TrainWebContext, {
+    get(_target, property) {
+      if (typeof property === 'symbol' || property === 'then') return undefined;
+      throw new Error('no trains in this test: give trainWebWith');
+    },
+  }),
+  channelName: () => undefined,
+};
+
 /** No overwrite of a member's own keeps anybody out of a channel. */
 const NOBODY_KEPT_OUT: SpawnWebDeps['channels'] = { ownViewDenied: () => Promise.resolve(false) };
 
@@ -398,6 +423,8 @@ export interface WebTestOptions {
   raids?: RaidWebDeps;
   /** Reporting wild Pokémon on the map (`spawnWebWith`); none by default. */
   spawns?: SpawnWebDeps;
+  /** Starting, arranging and moving trains on the map (`trainWebWith`); none by default. */
+  trains?: TrainWebDeps;
 }
 
 /**
@@ -523,6 +550,7 @@ export function webServerWith(options: WebTestOptions = {}): TestWeb {
     parties: options.parties ?? NO_PARTIES,
     raids: options.raids ?? NO_RAIDS,
     spawns: options.spawns ?? NO_SPAWNS,
+    trains: options.trains ?? NO_TRAINS,
     now: () => clock.now,
     log,
   });
````

### Task 3: Trains from the map: the route

Prototype commit: `b8ddd8bd345d7133844517c298e1ba34b830a817`

`POST …/trains/<id>/route/<edit>` (add, remove, move, clear, save, load, forget) and `GET …/routes`: every edit carries the stop list it was drawn from, checked inside the store (`route-edited`, 409 with the train as it is now); `mayNotArrange`/`mayNotClear`/`mayNotLoad` shared by the domain, the view and the routes; gyms of the server's regions only; each edit in its subcommand's throttle window.

**Files:**

```
 src/commands/trains/train-changes.ts |  22 +++--
 src/domain/party/party.ts            |   7 +-
 src/domain/party/train.ts            |  68 +++++++++++++--
 src/domain/web/party-data.ts         |  20 ++++-
 src/domain/web/party-view.test.ts    |  50 ++++++++++-
 src/domain/web/party-view.ts         |  22 +++++
 src/domain/web/train-data.ts         |  23 +++++
 src/render/activity.ts               |   2 +
 src/services/train-service.ts        |  41 +++++++--
 src/web/acting.ts                    |  14 ++-
 src/web/client/parties.test.ts       |   1 +
 src/web/party-routes.ts              |   9 +-
 src/web/train-route.test.ts          | 338 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/train-routes.ts              | 349 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 14 files changed, 933 insertions(+), 33 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/parties.test.ts src/web/train-route.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/trains/train-changes.ts src/domain/party/party.ts src/domain/party/train.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/train-data.ts src/render/activity.ts src/services/train-service.ts src/web/acting.ts src/web/client/parties.test.ts src/web/party-routes.ts src/web/train-route.test.ts src/web/train-routes.ts` and `npx eslint src/commands/trains/train-changes.ts src/domain/party/party.ts src/domain/party/train.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/train-data.ts src/render/activity.ts src/services/train-service.ts src/web/acting.ts src/web/client/parties.test.ts src/web/party-routes.ts src/web/train-route.test.ts src/web/train-routes.ts`.
- [ ] **Step 4: Check the transcription:** `git diff b8ddd8bd345d7133844517c298e1ba34b830a817 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Trains from the map: the route`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/trains/train-changes.ts src/domain/party/party.ts src/domain/party/train.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/train-data.ts src/render/activity.ts src/services/train-service.ts src/web/acting.ts src/web/client/parties.test.ts src/web/party-routes.ts src/web/train-route.test.ts src/web/train-routes.ts`.

````diff
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index cec7d06442be8b5139f9793dbdd7981b028cfdc4..b90958b1c8346432ac7c05c2eb007f0669599a46 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -163,8 +163,10 @@ export async function addStopAs(
   member: Member,
   gymId: number,
   staff: boolean,
+  drawn?: readonly number[],
 ): Promise<TrainAnswer> {
-  return answerOf(ctx, await ctx.trains.addStop(party.id, member, gymId, staff), (ok) => {
+  const outcome = await ctx.trains.addStop(party.id, member, gymId, staff, drawn);
+  return answerOf(ctx, outcome, (ok) => {
     const here = currentStop(ok.party) === gymId ? ' The train is there now.' : '';
     return `${named(ctx, gymId)} is stop ${ok.number} of the route.${here}`;
   });
@@ -177,8 +179,10 @@ export async function removeStopAs(
   member: Member,
   number: number,
   staff: boolean,
+  drawn?: readonly number[],
 ): Promise<TrainAnswer> {
-  return answerOf(ctx, await ctx.trains.removeStop(party.id, member, number, staff), (ok) => {
+  const outcome = await ctx.trains.removeStop(party.id, member, number, staff, drawn);
+  return answerOf(ctx, outcome, (ok) => {
     const left = ok.party.train.route.length;
     // The stop the train was at is gone: where it is now.
     const at = currentStop(ok.party);
@@ -201,8 +205,10 @@ export async function moveStopAs(
   from: number,
   to: number,
   staff: boolean,
+  drawn?: readonly number[],
 ): Promise<TrainAnswer> {
-  return answerOf(ctx, await ctx.trains.moveStop(party.id, member, from, to, staff), (ok) =>
+  const outcome = await ctx.trains.moveStop(party.id, member, from, to, staff, drawn);
+  return answerOf(ctx, outcome, (ok) =>
     ok.changed
       ? `${named(ctx, ok.gymId)} is stop ${to} of the route now.`
       : `${named(ctx, ok.gymId)} is stop ${to} of the route already.`,
@@ -218,8 +224,9 @@ export async function clearRouteAs(
   party: TrainParty,
   member: Member,
   staff: boolean,
+  drawn?: readonly number[],
 ): Promise<TrainAnswer> {
-  return answerOf(ctx, await ctx.trains.clearRoute(party.id, member, staff), (ok) =>
+  return answerOf(ctx, await ctx.trains.clearRoute(party.id, member, staff, drawn), (ok) =>
     ok.changed ? 'The route of this train is cleared.' : 'This train had no route.',
   );
 }
@@ -239,14 +246,16 @@ export async function saveRouteAs(
   party: TrainParty,
   member: Member,
   name: string,
+  drawn?: readonly number[],
 ): Promise<TrainAnswer> {
-  const outcome = await ctx.trains.saveRoute(party.id, member, name);
+  const outcome = await ctx.trains.saveRoute(party.id, member, name, drawn);
   switch (outcome.kind) {
     case 'gone':
       return { kind: 'gone', text: TRAIN_OVER };
     case 'refused':
       return {
         kind: 'refused',
+        ...(outcome.reason === 'route-edited' ? { reason: outcome.reason } : {}),
         text:
           outcome.reason === 'empty-route'
             ? 'This train has no route to save yet.'
@@ -287,8 +296,9 @@ export async function loadRouteAs(
   member: Member,
   routeId: number,
   staff: boolean,
+  drawn?: readonly number[],
 ): Promise<TrainAnswer> {
-  const loaded = await ctx.trains.loadRoute(party.id, member, routeId, staff);
+  const loaded = await ctx.trains.loadRoute(party.id, member, routeId, staff, drawn);
   if (loaded.kind === 'none') return { kind: 'refused', text: NO_SUCH_ROUTE };
   if (loaded.kind === 'no-stops') {
     return { kind: 'refused', text: 'That saved route has no stops.' };
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index cb122cfff4264c11da40add6036b75a2a6306c41..500a2cab0affc56dc29e6aaf23577eaf8e03114b 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -476,7 +476,12 @@ export type PartyProblem =
   /** The train is no longer where the control that was pressed showed it. */
   | 'train-moved-on'
   /** The route was edited: the control that was pressed would lead elsewhere than it said. */
-  | 'route-changed';
+  | 'route-changed'
+  /**
+   * The route is no longer the one an edit was drawn from (the live map's route editor): the
+   * numbers of its stops may stand for other gyms now.
+   */
+  | 'route-edited';
 
 /** A change that was not made. It has no `party`, which is how `PartyStore.update` knows. */
 export interface Refusal {
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index 867fc6aeb1b277cd2e44b6c243aca244f90d515b..65827321c9c894ade9918b99d63d34761199892e 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -282,6 +282,58 @@ export function mayNotMove(
   return attendeeOf(party, memberId) ? undefined : 'not-attending';
 }
 
+/**
+ * Why a member may not edit the stops of the route (add, remove, move one), or undefined when
+ * they may: who is signed up, who made the train (`mayArrange`), and staff (`not-attending`).
+ * An edit that moves the train asks for the right to move it as well.
+ */
+export function mayNotArrange(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+): 'not-attending' | undefined {
+  return staff || mayArrange(party, memberId) ? undefined : 'not-attending';
+}
+
+/** Why a member may not clear the route: only the conductor and staff may (`conductor-or-staff`). */
+export function mayNotClear(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+): 'conductor-or-staff' | undefined {
+  return leads(party, memberId, staff) ? undefined : 'conductor-or-staff';
+}
+
+/**
+ * Why a member may not load a saved route into the train (`replaceRoute`): it takes the right to
+ * move the train (`mayNotMove`), but for who made it, who may give it its first route.
+ */
+export function mayNotLoad(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+): 'not-conductor' | 'not-attending' | undefined {
+  const problem = mayNotMove(party, memberId, staff);
+  const firstRoute = party.train.route.length === 0 && mayArrange(party, memberId);
+  return problem && !(problem === 'not-attending' && firstRoute) ? problem : undefined;
+}
+
+/**
+ * Whether the route is still the one a control was drawn from (`drawn`, its gyms in order: the
+ * live map's route editor, plan 8M-5): undefined when it is, or when nothing was drawn (a
+ * command), and `route-edited` when it changed meanwhile, so that an edit by the numbers of the
+ * stops it showed is not made on another route.
+ */
+export function routeDrawn(
+  party: TrainParty,
+  drawn: readonly number[] | undefined,
+): 'route-edited' | undefined {
+  if (drawn === undefined) return undefined;
+  const { route } = party.train;
+  const same = route.length === drawn.length && route.every((gym, index) => drawn[index] === gym);
+  return same ? undefined : 'route-edited';
+}
+
 /** Everybody who is here is coming again: they are on their way to the next stop. */
 function allAboard(party: TrainParty): TrainParty {
   let moved = false;
@@ -345,7 +397,8 @@ export function addStop(
   gymId: number,
   staff = false,
 ): Change<TrainParty, { number: number; moved: boolean }> {
-  if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
+  const forbidden = mayNotArrange(party, memberId, staff);
+  if (forbidden) return refused(forbidden);
   const { route } = party.train;
   if (route.includes(gymId)) return refused('already-on-route');
   if (route.length >= MAX_ROUTE_STOPS) return refused('route-full');
@@ -373,7 +426,8 @@ export function removeStop(
   number: number,
   staff = false,
 ): Change<TrainParty, { gymId: number; moved: boolean }> {
-  if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
+  const forbidden = mayNotArrange(party, memberId, staff);
+  if (forbidden) return refused(forbidden);
   const index = stopIndex(party, number);
   const gymId = index === undefined ? undefined : party.train.route[index];
   if (index === undefined || gymId === undefined) return refused('no-such-stop');
@@ -411,7 +465,8 @@ export function moveStop(
   to: number,
   staff = false,
 ): Change<TrainParty, { gymId: number }> {
-  if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
+  const forbidden = mayNotArrange(party, memberId, staff);
+  if (forbidden) return refused(forbidden);
   const [source, target] = [stopIndex(party, from), stopIndex(party, to)];
   const gymId = source === undefined ? undefined : party.train.route[source];
   if (source === undefined || target === undefined || gymId === undefined) {
@@ -441,7 +496,8 @@ export function clearRoute(
   memberId: string,
   staff: boolean,
 ): Change<TrainParty, { moved: boolean }> {
-  if (!leads(party, memberId, staff)) return refused('conductor-or-staff');
+  const forbidden = mayNotClear(party, memberId, staff);
+  if (forbidden) return refused(forbidden);
   if (party.train.route.length === 0 && party.train.stop === 0) {
     return { ok: true, party, moved: false };
   }
@@ -468,9 +524,9 @@ export function replaceRoute(
   staff = false,
   atEnd: TrainAtEnd = party.train.atEnd,
 ): Change<TrainParty, { moved: boolean }> {
-  const problem = mayNotMove(party, memberId, staff);
+  const problem = mayNotLoad(party, memberId, staff);
+  if (problem) return refused(problem);
   const firstRoute = party.train.route.length === 0 && mayArrange(party, memberId);
-  if (problem && !(problem === 'not-attending' && firstRoute)) return refused(problem);
   const route = [...new Set(gymIds)].slice(0, MAX_ROUTE_STOPS);
   if (route.length === 0) return refused('empty-route');
   const same =
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 87d90a7b74a26a0af42329f0e8026e18cd89e23b..5648d222d1c183400171cd91b69eae32bb861623 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -68,12 +68,30 @@ export interface MapTrain {
   id: string;
   name: string;
   startTime: number | null;
-  /** The gyms of its route, by id, in order. */
+  /**
+   * The gyms of its route, by id, in order. It is also the version of the route: an edit on the
+   * map carries the route it was drawn from (`drawn`), and one made on a route that changed
+   * meanwhile is refused.
+   */
   route: number[];
   /** The index in `route` of the stop the train is at; null without a route or once finished. */
   stop: number | null;
   link: string;
   attendance: MapAttendance;
+  /**
+   * What the member may do to its route on the map (plan 8M-5), as the commands decide it; all
+   * false while read-only. `arrange`: add, remove and move stops (signed up, the maker, staff);
+   * `clear`: empty the route (the conductor, staff); `load`: put a saved route into it (who may
+   * move the train, or the maker its first route).
+   */
+  may: MapTrainRights;
+}
+
+/** What a member may do to a train on the map (`MapTrain.may`). */
+export interface MapTrainRights {
+  arrange: boolean;
+  clear: boolean;
+  load: boolean;
 }
 
 export interface MapMeetup {
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 6c60e2a8a64d90d160befa23832d9554416454ed..3e3786618e7063a6256075aa0e2ad4a3fd2edfd7 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -17,7 +17,13 @@ import {
 import type { Party, RaidParty } from '../party/party.js';
 import { setHatchTime } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
-import { mapParty, mayChangeRaid, partyView, type PartyViewInput } from './party-view.js';
+import {
+  mapParty,
+  mayChangeRaid,
+  partyView,
+  trainRights,
+  type PartyViewInput,
+} from './party-view.js';
 
 const GUILD = '412345678901234567';
 const EGG_PICTURE = 'https://raw.githubusercontent.com/PokeMiners/raid_egg_2_icon.png';
@@ -191,6 +197,8 @@ describe('partyView', () => {
           mine: null,
           actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
         },
+        // The member is not signed up: nothing of the route is theirs to change.
+        may: { arrange: false, clear: false, load: false },
       },
     ]);
     expect(view.meetups).toEqual([
@@ -279,3 +287,43 @@ describe('mapParty', () => {
     expect(mapParty({ ...egg, status: 'ended' }, input([]))).toBeNull();
   });
 });
+
+describe('trainRights', () => {
+  const route = (party = testTrain()) => ({ ...party, train: { ...party.train, route: [1, 2] } });
+
+  it('lets who may arrange the route arrange it, the conductor and staff clear it, and who may move it load one', () => {
+    const train = withAttendees(route(), { [ALICE]: { status: PartyStatus.Coming } });
+    expect(trainRights(train, input([]))).toEqual({ arrange: true, clear: false, load: true });
+    expect(trainRights(train, input([], { memberId: BOB }))).toEqual({
+      arrange: false,
+      clear: false,
+      load: false,
+    });
+    const conducted = { ...train, train: { ...train.train, conductorId: BOB } };
+    expect(trainRights(conducted, input([]))).toEqual({ arrange: true, clear: false, load: false });
+    expect(trainRights(train, input([], { memberId: CAROL, staff: true }))).toEqual({
+      arrange: true,
+      clear: true,
+      load: true,
+    });
+    // A bot developer clears a route, as `/route clear` lets them; nothing else.
+    expect(trainRights(train, input([], { memberId: CAROL, botStaff: true }))).toEqual({
+      arrange: false,
+      clear: true,
+      load: false,
+    });
+  });
+
+  it('lets the maker who is not signed up give the train its first route, and nothing while read-only', () => {
+    const empty = testTrain({ autoStatus: PartyStatus.NotInterested });
+    const maker = input([], { memberId: REPORTER });
+    expect(trainRights(empty, maker)).toEqual({ arrange: true, clear: false, load: true });
+    expect(trainRights(route(empty), maker)).toEqual({ arrange: true, clear: false, load: false });
+    const signedUp = withAttendees(route(), { [ALICE]: { status: PartyStatus.Coming } });
+    expect(trainRights(signedUp, input([], { readOnly: true, staff: true }))).toEqual({
+      arrange: false,
+      clear: false,
+      load: false,
+    });
+  });
+});
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 2fdb9af3221f2bac3cca57f2d03d77a774ba0aef..a346e6908c5636dd06663acdd2752810f19445dd 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -11,6 +11,7 @@ import {
 import { raidStage } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
 import { timedOver } from '../party/timed.js';
+import { mayNotArrange, mayNotClear, mayNotLoad } from '../party/train.js';
 import { raidWords } from '../pogo/raid-tier.js';
 import type {
   GroupCounts,
@@ -21,6 +22,7 @@ import type {
   MapRaid,
   MapStatus,
   MapTrain,
+  MapTrainRights,
   PartiesView,
 } from './party-data.js';
 
@@ -58,6 +60,11 @@ export interface PartyViewInput {
   readOnly: boolean;
   /** Who asks is staff of the server (an admin, a moderator, the bot's owner): may change raids. */
   staff: boolean;
+  /**
+   * Who asks is staff as `/route clear` has it (also a bot developer, `isBotManagement`); left
+   * out: as `staff`.
+   */
+  botStaff?: boolean;
   look(raid: RaidParty): RaidLook;
   /** The origins the page may load pictures from (`pictureOrigins`). */
   pictureOrigins: readonly string[];
@@ -161,6 +168,20 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
   };
 }
 
+/**
+ * What the member may do to a train's route on the map (spec 3.7), as the commands decide it
+ * (`mayNotArrange`, `mayNotClear`, `mayNotLoad`); nothing while read-only.
+ */
+export function trainRights(party: TrainParty, input: PartyViewInput): MapTrainRights {
+  if (input.readOnly) return { arrange: false, clear: false, load: false };
+  const { memberId, staff } = input;
+  return {
+    arrange: mayNotArrange(party, memberId, staff) === undefined,
+    clear: mayNotClear(party, memberId, input.botStaff ?? staff) === undefined,
+    load: mayNotLoad(party, memberId, staff) === undefined,
+  };
+}
+
 function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTrain {
   const { route, stop } = party.train;
   return {
@@ -172,6 +193,7 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     stop: stop < route.length ? stop : null,
     link,
     attendance: attendanceOf(party, input, false),
+    may: trainRights(party, input),
   };
 }
 
diff --git a/src/domain/web/train-data.ts b/src/domain/web/train-data.ts
index b9c13239052b522806ebb17e7204a1b141de7a19..73875cd66ba9231872e9188fa00df4a02c9b8ba2 100644
--- a/src/domain/web/train-data.ts
+++ b/src/domain/web/train-data.ts
@@ -21,6 +21,29 @@ export interface TrainAnswer {
   train?: MapTrain;
 }
 
+/**
+ * The edits of a train's route the map makes (`POST /s/<guild>/api/trains/<id>/route/<edit>`),
+ * each as its `/route` subcommand does it. Every one but `forget` carries the route it was drawn
+ * from (`drawn`, the train's `route` as the page had it).
+ */
+export const ROUTE_EDITS = ['add', 'remove', 'move', 'clear', 'save', 'load', 'forget'] as const;
+export type RouteEdit = (typeof ROUTE_EDITS)[number];
+
+/** A route the member saved for the region of a train, as the map lists it. */
+export interface SavedRouteView {
+  /** What a load or a forget names. */
+  id: number;
+  /** Empty for a route of the legacy bot saved without one. */
+  name: string;
+  stops: number;
+  atEnd: MapAtEnd;
+}
+
+/** The member's saved routes of a train's region (`GET /s/<guild>/api/trains/<id>/routes`). */
+export interface SavedRoutesView {
+  routes: SavedRouteView[];
+}
+
 /**
  * The body of a new train (`POST /s/<guild>/api/trains`): the region it is made in (any region
  * of the server, by id as `/api/geo` lists it), its name, when it starts as `/meet` takes it (a
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 14fe55b4319e26c67fe9c9b40aa47f15115a0b50..53300bb326a31a07951b2a614b7f4cc23616f572 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -191,6 +191,8 @@ export function problemText(
       return 'The train has moved on meanwhile.';
     case 'route-changed':
       return 'That button no longer leads where it said.';
+    case 'route-edited':
+      return 'The route changed meanwhile: here it is as it is now.';
   }
 }
 
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index d078d20d8133d8f0e5f65eafeaa3815c8e7b4262..a44b544f1600ef62b1049831658cef097e745571 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -24,6 +24,7 @@ import {
   removeStop,
   replaceRoute,
   reverseRoute,
+  routeDrawn,
   routeFinished,
   setAtEnd,
   setConductor,
@@ -95,6 +96,15 @@ const SWEEPER = '0';
  */
 export const SAVED_ROUTE_CHOICE = /^id:\d+$/i;
 
+/**
+ * The refusal of an edit drawn from a route that is no longer the train's (`routeDrawn`), or
+ * undefined to go on with it.
+ */
+function stale(party: TrainParty, drawn: readonly number[] | undefined) {
+  const edited = routeDrawn(party, drawn);
+  return edited ? refused(edited) : undefined;
+}
+
 function placeNow(party: TrainParty): Place {
   return { gym: currentStop(party), finished: routeFinished(party), route: party.train.route };
 }
@@ -193,20 +203,26 @@ export class TrainService {
    * stop of a route is an ordinary edit: a line, and no announcement. A gym that is no longer in
    * the gym list is refused (`gym-gone`), which is asked inside the store: the member picked it
    * a moment ago, and it may have been deleted since.
+   *
+   * `drawn` (here and for the other edits of the route) is the route a control was drawn from
+   * (the live map's route editor): the edit is refused (`route-edited`) when the route is
+   * another by now. A command gives none.
    */
   addStop(
     partyId: string,
     member: Member,
     gymId: number,
     staff = false,
+    drawn?: readonly number[],
   ): Promise<TrainChangeOutcome<{ number: number; moved: boolean }>> {
     return this.movable(
       partyId,
       member,
       (party) =>
-        this.options.gyms.get(gymId) === undefined
+        stale(party, drawn) ??
+        (this.options.gyms.get(gymId) === undefined
           ? refused('gym-gone')
-          : addStop(party, member.id, gymId, staff),
+          : addStop(party, member.id, gymId, staff)),
       (party, added) => {
         const who = doer(party, member);
         return who
@@ -225,11 +241,12 @@ export class TrainService {
     member: Member,
     number: number,
     staff = false,
+    drawn?: readonly number[],
   ): Promise<TrainChangeOutcome<{ gymId: number; moved: boolean }>> {
     return this.movable(
       partyId,
       member,
-      (party) => removeStop(party, member.id, number, staff),
+      (party) => stale(party, drawn) ?? removeStop(party, member.id, number, staff),
       (party, removed) => {
         const who = doer(party, member);
         return who
@@ -351,11 +368,12 @@ export class TrainService {
     from: number,
     to: number,
     staff = false,
+    drawn?: readonly number[],
   ): Promise<TrainChangeOutcome<{ gymId: number }>> {
     return this.apply(
       partyId,
       member,
-      (party) => moveStop(party, member.id, from, to, staff),
+      (party) => stale(party, drawn) ?? moveStop(party, member.id, from, to, staff),
       (party, moved) => {
         const who = doer(party, member);
         return who
@@ -370,11 +388,12 @@ export class TrainService {
     partyId: string,
     member: Member,
     staff: boolean,
+    drawn?: readonly number[],
   ): Promise<TrainChangeOutcome<{ moved: boolean }>> {
     return this.movable(
       partyId,
       member,
-      (party) => clearRoute(party, member.id, staff),
+      (party) => stale(party, drawn) ?? clearRoute(party, member.id, staff),
       (party) => {
         const who = doer(party, member);
         return who ? `${who} cleared the route.` : 'The route was cleared.';
@@ -593,15 +612,22 @@ export class TrainService {
     partyId: string,
     member: Member,
     text: string,
+    drawn?: readonly number[],
   ): Promise<
     | { kind: 'gone' }
-    | { kind: 'refused'; reason: 'bad-name' | 'empty-route' | 'name-like-choice' }
+    | {
+        kind: 'refused';
+        reason: 'bad-name' | 'empty-route' | 'name-like-choice' | 'route-edited';
+      }
     | { kind: 'full' }
     | { kind: 'saved' | 'replaced'; route: SavedRoute }
   > {
     const { store, routes } = this.options;
     const party = store.get(partyId);
     if (!party || !isTrain(party) || party.regionId === null) return { kind: 'gone' };
+    // The route the member saw is the one saved, or none.
+    const edited = routeDrawn(party, drawn);
+    if (edited) return { kind: 'refused', reason: edited };
     const name = tidyName(text);
     if (name === undefined) return { kind: 'refused', reason: 'bad-name' };
     // The list of saved routes names its choices so: such a name could not be told from one.
@@ -635,6 +661,7 @@ export class TrainService {
     member: Member,
     routeId: number,
     staff = false,
+    drawn?: readonly number[],
   ): Promise<
     | TrainChangeOutcome<{ route: SavedRoute; missing: number; cut: number; moved: boolean }>
     | { kind: 'none' }
@@ -649,6 +676,8 @@ export class TrainService {
       partyId,
       member,
       (party) => {
+        const edited = stale(party, drawn);
+        if (edited) return edited;
         // Decided here, inside the store: a gym that was deleted while the load waited for the
         // train's turn is left out like one that was gone before.
         const distinct = [...new Set(route.gyms)];
diff --git a/src/web/acting.ts b/src/web/acting.ts
index 0c43be8092995eb99db2da46aa24ded4c6e9351a..ccb31439a4afe4a56f7f13470f30304e3b6d8c0f 100644
--- a/src/web/acting.ts
+++ b/src/web/acting.ts
@@ -1,5 +1,5 @@
 import type { FastifyReply, FastifyRequest } from 'fastify';
-import { isManagement } from '../discord/guards.js';
+import { isBotManagement, isManagement } from '../discord/guards.js';
 import type { MemberStanding } from '../discord/member-directory.js';
 import { controlThrottleKey } from '../discord/router.js';
 import { waitText, type Throttle } from '../discord/throttle.js';
@@ -120,6 +120,18 @@ export function isMapStaff(
   return isManagement(standing?.roleNames ?? [], userId, ownerId);
 }
 
+/**
+ * Whether a member is staff of the server as `/route clear` has it (`isBotManagement`: also a
+ * bot developer by role), for clearing a train's route on the map (plan 8M-5).
+ */
+export function isMapBotStaff(
+  standing: MemberStanding | undefined,
+  userId: string,
+  ownerId: string,
+): boolean {
+  return isBotManagement(standing?.roleNames ?? [], userId, ownerId);
+}
+
 /**
  * Counts a write of the member in the router's window of a command (its name) or a control
  * (`controlThrottleKey`), as a use there counts: undefined when it may go on, or the answer sent
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index ccc113ac8614392f7e32d4b1846febe7ba265b2a..155f25a22552685da32752f06b79907f4b448344 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -307,6 +307,7 @@ describe('trainPopup and meetupItem', () => {
       stop: 1,
       link: LINK,
       attendance: attendance({ actions: [] }),
+      may: { arrange: false, clear: false, load: false },
     };
     expect(texts(trainPopup(train, context))).toEqual([
       'Saturday <b>legendaries</b>',
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 3a38855968bea93a747b3d1b8ddfa9feb100b4b5..2216d9f23e013d19b265ff030885e395ae0e2a89 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -20,7 +20,13 @@ import type {
   AttendanceService,
   Member,
 } from '../services/attendance-service.js';
-import { actingOnTheMap, isMapStaff, throttledOnTheMap, UNREACHABLE } from './acting.js';
+import {
+  actingOnTheMap,
+  isMapBotStaff,
+  isMapStaff,
+  throttledOnTheMap,
+  UNREACHABLE,
+} from './acting.js';
 import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import { etagMatches, etagOf } from './geo-cache.js';
@@ -162,6 +168,7 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
     zone: parties.zone,
     readOnly: viewer.readOnly,
     staff: isMapStaff(viewer.standing, memberId, parties.ownerId),
+    botStaff: isMapBotStaff(viewer.standing, memberId, parties.ownerId),
     look: (raid) => parties.look(raid),
     pictureOrigins: deps.pictureOrigins,
   });
diff --git a/src/web/train-route.test.ts b/src/web/train-route.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7150ebb0589efd1cc607cc1da3af2aff6c40ef26
--- /dev/null
+++ b/src/web/train-route.test.ts
@@ -0,0 +1,338 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
+import { createdMeetup, createdTrain } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import {
+  FakeActingMembers,
+  partyWebWith,
+  TEST_OWNER_ID,
+  trainWebWith,
+  webServerWith,
+  type TestWeb,
+} from '../../test/support/web.js';
+import { CHANGE_THROTTLE } from '../commands/raids/change.js';
+import { Throttles } from '../discord/throttle.js';
+import { MAX_ROUTE_STOPS } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { PartiesView } from '../domain/web/party-data.js';
+import type { SavedRoutesView, TrainAnswer } from '../domain/web/train-data.js';
+import { UNREACHABLE } from './acting.js';
+
+const WEST = 1;
+
+/**
+ * A train of the party services of a test (`createdTrain`, made by `REPORTER`) on a route of
+ * three gyms unless `stops` says otherwise, on the map: Alice signed up as coming and a member of
+ * the server (fetched fresh as `Alice`), Bob a member who is not signed up, the bot's owner a
+ * member (staff). The web server's clock is the parties' own.
+ */
+async function arranging(
+  stops: readonly number[] = [4, 1, 7],
+  options: { throttles?: Throttles } = {},
+) {
+  const made = await createdTrain({ route: stops });
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
+  const members = new FakeMemberDirectory()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(REPORTER, 'Reporter')
+    .add(TEST_OWNER_ID, 'Owner');
+  const acting = new FakeActingMembers()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(REPORTER, 'Reporter')
+    .add(TEST_OWNER_ID, 'Owner');
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    trains: trainWebWith(ctx),
+  });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const edit = async (what: string, body: unknown, sent = headers, partyId = made.party.id) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: `/s/${FAKE_GUILD_ID}/api/trains/${partyId}/route/${what}`,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<TrainAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  const saved = async (sent = headers) => {
+    const answer = await web.app.inject({
+      url: `/s/${FAKE_GUILD_ID}/api/trains/${made.party.id}/routes`,
+      headers: { cookie: sent.cookie ?? '' },
+    });
+    return { status: answer.statusCode, json: answer.json<SavedRoutesView>() };
+  };
+  /** The lines said in the post since the setup, one by one. */
+  const lines = async (): Promise<string[]> => {
+    await made.attendance.flush();
+    await made.trains.flush();
+    return made.said().join('\n').split('\n').filter(Boolean);
+  };
+  const route = () => made.current().train.route;
+  return { made, ctx, web, acting, members, headers, edit, saved, lines, route, throttles };
+}
+
+describe("a train's route on the map", () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("adds a gym as /route add does: the line in the post, the command's words as text, the train as it is now", async () => {
+    const map = await arranging();
+    web = map.web;
+    const answer = await map.edit('add', { drawn: [4, 1, 7], gym: 2 });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      ok: true,
+      text: 'Old Stone Fountain is stop 4 of the route.',
+      train: { id: map.made.party.id, route: [4, 1, 7, 2], stop: 0 },
+    });
+    expect(map.route()).toEqual([4, 1, 7, 2]);
+    expect(await map.lines()).toContain(
+      `**Alice** (<@${ALICE}>) added stop 4 to the route: **Old Stone Fountain**.`,
+    );
+  });
+
+  it('removes, moves and clears as /route remove, move and clear do', async () => {
+    const map = await arranging();
+    web = map.web;
+    const removed = await map.edit('remove', { drawn: [4, 1, 7], stop: 2 });
+    expect(removed.json).toMatchObject({
+      ok: true,
+      text: 'The Stacks is off the route, which has 2 stops now.',
+      train: { route: [4, 7] },
+    });
+    const moved = await map.edit('move', { drawn: [4, 7], from: 2, to: 1 });
+    expect(moved.json).toMatchObject({
+      ok: true,
+      text: 'Harbor Lighthouse Mural is stop 1 of the route now.',
+      train: { route: [7, 4], stop: 1 },
+    });
+    // Clearing is for the conductor and the staff: the bot's owner.
+    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
+    const cleared = await map.edit('clear', { drawn: [7, 4] }, owner);
+    expect(cleared.json).toMatchObject({
+      ok: true,
+      text: 'The route of this train is cleared.',
+      train: { route: [], stop: null },
+    });
+    expect(map.route()).toEqual([]);
+  });
+
+  it('refuses an edit drawn from a route that changed meanwhile, and gives the route as it is now', async () => {
+    const map = await arranging();
+    web = map.web;
+    await map.made.trains.addStop(map.made.party.id, { id: ALICE }, 2);
+    const stale = await map.edit('remove', { drawn: [4, 1, 7], stop: 3 });
+    expect(stale.status).toBe(409);
+    expect(stale.json).toMatchObject({
+      ok: false,
+      text: 'The route changed meanwhile: here it is as it is now.',
+      train: { route: [4, 1, 7, 2] },
+    });
+    expect((await map.edit('add', { drawn: [4, 1], gym: 3 })).status).toBe(409);
+    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
+    expect((await map.edit('clear', { drawn: [] }, owner)).status).toBe(409);
+    expect((await map.edit('save', { drawn: [4, 1, 7], name: 'Old' })).status).toBe(409);
+    expect(map.made.routes.rows).toEqual([]);
+    expect(map.route()).toEqual([4, 1, 7, 2]);
+  });
+
+  it("takes only gyms of the server's regions (404 for any other, uncounted) and refuses what the route cannot take in the command's words", async () => {
+    const throttles = new Throttles();
+    const map = await arranging([4, 1, 7], { throttles });
+    web = map.web;
+    for (let use = 0; use < CHANGE_THROTTLE.uses - 1; use += 1) {
+      throttles.use('route add', ALICE, CHANGE_THROTTLE, PARTY_NOW);
+    }
+    // Gym 10 lies in no region; no gym has the id 999.
+    expect((await map.edit('add', { drawn: [4, 1, 7], gym: 10 })).status).toBe(404);
+    expect((await map.edit('add', { drawn: [4, 1, 7], gym: 999 })).status).toBe(404);
+    const twice = await map.edit('add', { drawn: [4, 1, 7], gym: 1 });
+    expect(twice.status).toBe(422);
+    expect(twice.json).toMatchObject({ ok: false, text: 'That gym is on the route already.' });
+    const counted = await map.edit('add', { drawn: [4, 1, 7], gym: 2 });
+    expect(counted.status).toBe(429);
+    expect(counted.json.error).toBe('You can use /route add again in 1 minute.');
+  });
+
+  it(`refuses a stop beyond ${MAX_ROUTE_STOPS}`, async () => {
+    const map = await arranging();
+    web = map.web;
+    const long = Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => 1000 + index);
+    await map.made.store.update(map.made.party.id, (party) => ({
+      party: party.type === 'train' ? { ...party, train: { ...party.train, route: long } } : party,
+    }));
+    const full = await map.edit('add', { drawn: long, gym: 2 });
+    expect(full.status).toBe(422);
+    expect(full.json.text).toBe(`A route has at most ${MAX_ROUTE_STOPS} stops.`);
+  });
+
+  it("lets only who may arrange the route arrange it, in the command's words before its throttle: the signed up, the maker, the staff; clearing for the conductor and staff", async () => {
+    const throttles = new Throttles();
+    const map = await arranging([4, 1, 7], { throttles });
+    web = map.web;
+    const bob = await map.web.posting(BOB, 'Bob');
+    const refused = await map.edit('add', { drawn: [4, 1, 7], gym: 2 }, bob);
+    expect(refused.status).toBe(403);
+    expect(refused.json).toMatchObject({
+      ok: false,
+      text: 'You are not signed up for this train.',
+    });
+    expect(throttles.use('route add', BOB, { uses: 1, perSeconds: 60 }, PARTY_NOW)).toBeUndefined();
+    const notLeading = await map.edit('clear', { drawn: [4, 1, 7] });
+    expect(notLeading.status).toBe(403);
+    expect(notLeading.json.text).toBe(
+      'Only the conductor of this train and the moderators can do that.',
+    );
+    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
+    expect((await map.edit('add', { drawn: [4, 1, 7], gym: 2 }, owner)).status).toBe(200);
+    expect(map.route()).toEqual([4, 1, 7, 2]);
+  });
+
+  it("tells who may arrange the route in the train's view: the signed up and staff, the conductor clears", async () => {
+    const map = await arranging();
+    web = map.web;
+    const viewOf = async (userId: string, name: string) => {
+      const cookie = await map.web.loggedIn(userId, name);
+      const answer = await map.web.app.inject({
+        url: `/s/${FAKE_GUILD_ID}/api/parties`,
+        headers: { cookie },
+      });
+      return answer.json<PartiesView>().trains[0]?.may;
+    };
+    expect(await viewOf(ALICE, 'Alice')).toMatchObject({ arrange: true, clear: false });
+    expect(await viewOf(BOB, 'Bob')).toMatchObject({ arrange: false, clear: false, load: false });
+    expect(await viewOf(TEST_OWNER_ID, 'Owner')).toMatchObject({
+      arrange: true,
+      clear: true,
+      load: true,
+    });
+    await map.made.trains.setConductor(map.made.party.id, { id: ALICE });
+    expect(await viewOf(ALICE, 'Alice')).toMatchObject({ arrange: true, clear: true, load: true });
+  });
+
+  it('saves, lists, loads and forgets saved routes as /route save, load and forget do', async () => {
+    const map = await arranging();
+    web = map.web;
+    expect((await map.saved()).json).toEqual({ routes: [] });
+    const saved = await map.edit('save', { drawn: [4, 1, 7], name: 'Downtown' });
+    expect(saved.json).toMatchObject({
+      ok: true,
+      text:
+        'I saved this route as Downtown: 3 stops. At the end it finishes the route. ' +
+        '/route load puts it into a train of this region.',
+    });
+    const listed = (await map.saved()).json.routes;
+    expect(listed.map(({ id: _id, ...route }) => route)).toEqual([
+      { name: 'Downtown', stops: 3, atEnd: 'finish' },
+    ]);
+    const id = listed[0]?.id;
+    expect(id).toBe(map.made.routes.rows[0]?.id);
+    await map.edit('clear', { drawn: [4, 1, 7] }, await map.web.posting(TEST_OWNER_ID, 'Owner'));
+    const loaded = await map.edit('load', { drawn: [], route: id });
+    expect(loaded.json).toMatchObject({
+      ok: true,
+      text: 'This train has the route Downtown now: 3 stops. It is at the first. At the end it finishes the route.',
+      train: { route: [4, 1, 7], stop: 0 },
+    });
+    const forgotten = await map.edit('forget', { route: id });
+    expect(forgotten.json).toMatchObject({ ok: true, text: 'I forgot your saved route Downtown.' });
+    expect((await map.saved()).json).toEqual({ routes: [] });
+  });
+
+  it("knows only the member's own saved routes of the train's region", async () => {
+    const map = await arranging();
+    web = map.web;
+    const bobs = map.made.routes.add(BOB, WEST, 'Bobs', [2, 3]);
+    const theirs = await map.edit('load', { drawn: [4, 1, 7], route: bobs.id });
+    expect(theirs.status).toBe(422);
+    expect(theirs.json.text).toBe(
+      'You have no such saved route for this region. Pick one from the list.',
+    );
+    expect((await map.edit('forget', { route: bobs.id })).status).toBe(422);
+    expect(map.made.routes.rows).toHaveLength(1);
+    expect((await map.saved()).json.routes).toEqual([]);
+  });
+
+  it("answers a train that is over, another party's id or another server's as the commands do: 409", async () => {
+    const map = await arranging();
+    web = map.web;
+    const meetup = await createdMeetup();
+    const notATrain = await map.edit('add', { drawn: [], gym: 2 }, map.headers, meetup.party.id);
+    expect(notATrain.status).toBe(409);
+    expect(notATrain.json).toEqual({ ok: false, text: 'This train is over.' });
+    await map.made.service.end(map.made.party.id);
+    const over = await map.edit('add', { drawn: [4, 1, 7], gym: 2 });
+    expect(over.status).toBe(409);
+    expect(over.json).toEqual({ ok: false, text: 'This train is over.' });
+    expect((await map.saved()).status).toBe(409);
+  });
+
+  it("refuses a member kept out of the train's forum (403), and nothing while Discord cannot say (503)", async () => {
+    const map = await arranging();
+    web = map.web;
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.edit('add', { drawn: [4, 1, 7], gym: 2 })).status).toBe(403);
+    expect((await map.saved()).status).toBe(403);
+    map.made.gateway.barred.clear();
+    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
+    const away = await map.edit('add', { drawn: [4, 1, 7], gym: 2 });
+    expect(away.status).toBe(503);
+    expect(away.json.error).toBe(UNREACHABLE);
+    expect(map.route()).toEqual([4, 1, 7]);
+  });
+
+  it('knows only its edits (404) and their bodies (400)', async () => {
+    const map = await arranging();
+    web = map.web;
+    expect((await map.edit('reverse', { drawn: [4, 1, 7] })).status).toBe(404);
+    expect((await map.edit('add', { gym: 2 })).status).toBe(400);
+    expect((await map.edit('remove', { drawn: [4, 1, 7], stop: 'two' })).status).toBe(400);
+    expect((await map.edit('save', { drawn: [4, 1, 7], name: 'x'.repeat(81) })).status).toBe(400);
+    expect(map.route()).toEqual([4, 1, 7]);
+  });
+
+  it('logs an edit as a command is logged: who, where, which train, what; never a name', async () => {
+    const map = await arranging();
+    web = map.web;
+    await map.edit('save', { drawn: [4, 1, 7], name: 'Secret loop' });
+    const logged = map.web.entries.find(
+      (entry) => entry.msg === "a train's route was changed on the map",
+    );
+    expect(logged).toMatchObject({
+      user: ALICE,
+      guild: FAKE_GUILD_ID,
+      party: map.made.party.id,
+      edit: 'save',
+      outcome: 'ok',
+    });
+    expect(JSON.stringify(logged)).not.toMatch(/Secret/u);
+  });
+});
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index a9c3eff78bc810d84deb9b93f00c9492d4ff49f0..3951d758fec92a7183d9a4efc23bbce6d0b3ea2e 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -1,31 +1,60 @@
-import type { FastifyInstance, FastifyReply } from 'fastify';
+import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
 import { newPartyTimes, noForumWords, typedTimedTime } from '../commands/parties/timed.js';
+import { partyOver } from '../commands/parties/reply.js';
+import { CHANGE_THROTTLE } from '../commands/raids/change.js';
 import type { ReportNames } from '../commands/raids/report.js';
 import {
+  addStopAs,
+  clearRouteAs,
+  forgetRouteAs,
+  loadRouteAs,
+  moveStopAs,
   notSignedUpWords,
+  removeStopAs,
+  saveRouteAs,
   startTrainAs,
+  trainRefusal,
+  type TrainAnswer as TrainChangeAnswer,
   type TrainChanging,
   type TrainStarting,
 } from '../commands/trains/train-changes.js';
 import { TRAIN_COMMAND, TRAIN_THROTTLE } from '../commands/trains/train.js';
 import type { Region } from '../db/repositories/region-repository.js';
 import { UserError } from '../discord/errors.js';
+import type { MemberStanding } from '../discord/member-directory.js';
 import type { MemberAccess } from '../discord/party-gateway.js';
 import {
   attendeeOf,
+  isTrain,
   MAX_PARTY_NAME,
+  MAX_ROUTE_STOPS,
   TRAIN_AT_END,
+  type PartyProblem,
   type TrainParty,
 } from '../domain/party/party.js';
 import { tidyName } from '../domain/party/timed.js';
-import { problemText } from '../render/activity.js';
-import { timestamp } from '../render/text.js';
+import { mayNotArrange, mayNotClear, mayNotLoad } from '../domain/party/train.js';
 import type { MapTrain } from '../domain/web/party-data.js';
 import { mapParty } from '../domain/web/party-view.js';
-import type { TrainAnswer } from '../domain/web/train-data.js';
-import { actingOnTheMap, isMapStaff, throttledOnTheMap, unreachableOnTheMap } from './acting.js';
+import {
+  ROUTE_EDITS,
+  type RouteEdit,
+  type SavedRoutesView,
+  type TrainAnswer,
+} from '../domain/web/train-data.js';
+import { problemText } from '../render/activity.js';
+import { timestamp } from '../render/text.js';
+import type { Member } from '../services/attendance-service.js';
+import {
+  actingOnTheMap,
+  isMapBotStaff,
+  isMapStaff,
+  memberOrFailure,
+  throttledOnTheMap,
+  unreachableOnTheMap,
+} from './acting.js';
 import { sendFailure } from './answers.js';
 import { postGuard } from './csrf.js';
 import type { GuildRequest } from './guild-routes.js';
@@ -56,6 +85,9 @@ export interface TrainWebDeps {
  */
 export const TRAIN_WRITES_PER_ADDRESS_MINUTE = 60;
 
+/** The requests for a member's saved routes one address may make in a minute. */
+const ROUTES_PER_MINUTE = 30;
+
 /**
  * The body of a new train: the region (by id, as `/api/geo` lists it), the name as `/train` takes
  * it (up to its option's length; a blank one is refused in its words), the start as `/meet` takes
@@ -70,12 +102,98 @@ const startBodySchema = z
   })
   .strict();
 
+/** The route an edit was drawn from: the gyms in order, as the train's view gave them. */
+const drawn = z.array(z.number().int().positive()).max(MAX_ROUTE_STOPS);
+/** A stop's number, from 1, as `/route remove` and `/route move` take it. */
+const stopNumber = z.number().int().min(1).max(MAX_ROUTE_STOPS);
+/** A saved route, by the id the list gave it. */
+const savedRoute = z.number().int().positive();
+
+/** The body of each edit of a route, as its subcommand's options are: anything else is malformed. */
+const EDIT_BODIES = {
+  add: z.object({ drawn, gym: z.number().int().positive() }).strict(),
+  remove: z.object({ drawn, stop: stopNumber }).strict(),
+  move: z.object({ drawn, from: stopNumber, to: stopNumber }).strict(),
+  clear: z.object({ drawn }).strict(),
+  save: z.object({ drawn, name: z.string().max(MAX_PARTY_NAME) }).strict(),
+  load: z.object({ drawn, route: savedRoute }).strict(),
+  forget: z.object({ route: savedRoute }).strict(),
+} as const;
+
+/** An edit of a route with what it names, as its subcommand's options give it. */
+type EditInput =
+  | ({ edit: 'add' } & z.infer<typeof EDIT_BODIES.add>)
+  | ({ edit: 'remove' } & z.infer<typeof EDIT_BODIES.remove>)
+  | ({ edit: 'move' } & z.infer<typeof EDIT_BODIES.move>)
+  | ({ edit: 'clear' } & z.infer<typeof EDIT_BODIES.clear>)
+  | ({ edit: 'save' } & z.infer<typeof EDIT_BODIES.save>)
+  | ({ edit: 'load' } & z.infer<typeof EDIT_BODIES.load>)
+  | ({ edit: 'forget' } & z.infer<typeof EDIT_BODIES.forget>);
+
+/** The edit a body asks for; undefined for a malformed body. */
+function editInput(edit: RouteEdit, body: unknown): EditInput | undefined {
+  switch (edit) {
+    case 'add': {
+      const parsed = EDIT_BODIES.add.safeParse(body);
+      return parsed.success ? { edit, ...parsed.data } : undefined;
+    }
+    case 'remove': {
+      const parsed = EDIT_BODIES.remove.safeParse(body);
+      return parsed.success ? { edit, ...parsed.data } : undefined;
+    }
+    case 'move': {
+      const parsed = EDIT_BODIES.move.safeParse(body);
+      return parsed.success ? { edit, ...parsed.data } : undefined;
+    }
+    case 'clear': {
+      const parsed = EDIT_BODIES.clear.safeParse(body);
+      return parsed.success ? { edit, ...parsed.data } : undefined;
+    }
+    case 'save': {
+      const parsed = EDIT_BODIES.save.safeParse(body);
+      return parsed.success ? { edit, ...parsed.data } : undefined;
+    }
+    case 'load': {
+      const parsed = EDIT_BODIES.load.safeParse(body);
+      return parsed.success ? { edit, ...parsed.data } : undefined;
+    }
+    case 'forget': {
+      const parsed = EDIT_BODIES.forget.safeParse(body);
+      return parsed.success ? { edit, ...parsed.data } : undefined;
+    }
+  }
+}
+
+function isRouteEdit(value: string): value is RouteEdit {
+  return (ROUTE_EDITS as readonly string[]).includes(value);
+}
+
+/** What anything done to a train that has ended answers, as the commands do. */
+const TRAIN_OVER = partyOver({ type: 'train' });
+
 /** What the map's answer adds after a train is made: its route is laid on the map. */
 export const ADD_STOPS = 'Click gyms on the map to add its stops.';
 
+/**
+ * The refusals of a press made on a train that is no longer as the page drew it: answered 409
+ * with the train as it is now, which the page draws.
+ */
+const STALE: ReadonlySet<PartyProblem> = new Set([
+  'route-edited',
+  'route-changed',
+  'train-moved-on',
+]);
+
+/** The address of a train's route edit, saved routes, move or conductor. */
+type TrainRequest = FastifyRequest<{
+  Params: { guild: string; party: string; edit?: string };
+}>;
+
 /**
  * The trains of the live map (spec 3.7): starting one (`POST /s/<guild>/api/trains`), which is
- * `/train` as the member in the region picked, with its start read as `/meet` reads it.
+ * `/train` as the member in the region picked, with its start read as `/meet` reads it; the
+ * edits of a train's route (`POST /s/<guild>/api/trains/<id>/route/<edit>`), each as its `/route`
+ * subcommand, and the member's saved routes of its region (`GET …/routes`).
  */
 export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
   const { sessions, parties, trains } = deps;
@@ -109,7 +227,7 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     guildRow: number,
     party: TrainParty,
     userId: string,
-    staff: boolean,
+    standing: MemberStanding,
   ): MapTrain | undefined => {
     const shown = mapParty(party, {
       guildId,
@@ -120,7 +238,8 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
       now: deps.now(),
       zone: parties.zone,
       readOnly: false,
-      staff,
+      staff: isMapStaff(standing, userId, parties.ownerId),
+      botStaff: isMapBotStaff(standing, userId, parties.ownerId),
       look: (raid) => parties.look(raid),
       pictureOrigins: deps.pictureOrigins,
     });
@@ -133,6 +252,88 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     return reply.code(status).send(answer);
   };
 
+  /** The active train of this server by id, as the store has it (an ended one is not there). */
+  const activeTrain = async (guild: string, partyId: string) => {
+    const row = await parties.guilds.idFor(guild);
+    const party = parties.store.get(partyId);
+    return row !== undefined &&
+      party?.guildId === row &&
+      party.status === 'active' &&
+      isTrain(party)
+      ? { row, party }
+      : undefined;
+  };
+
+  /** What a write to a train answers when it is over (or no train of this server). */
+  const over = (reply: FastifyReply) => {
+    const answer: TrainAnswer = { ok: false, text: TRAIN_OVER };
+    return reply.code(409).send(answer);
+  };
+
+  /**
+   * The checks every write to a train makes after the session and the body (the caller's, in
+   * that order: 403, 400), in this order: who writes (`actingOnTheMap`), the train (an active
+   * train of this server as the store has it; anything else 409 as the commands answer it), and
+   * its forum (barred 403, as `AccessService` would not let them in; Discord unreachable 503).
+   * None of them counts against a throttle.
+   */
+  const trainWrite = async (
+    request: TrainRequest,
+    reply: FastifyReply,
+    userId: string,
+    doing: string,
+  ): Promise<
+    | { sent: FastifyReply }
+    | { userId: string; member: Member; standing: MemberStanding; row: number; party: TrainParty }
+  > => {
+    const { guild, party: partyId } = request.params;
+    const acting = await actingOnTheMap(deps, request, reply, guild, userId, doing);
+    if ('sent' in acting) return acting;
+    const found = await activeTrain(guild, partyId);
+    if (!found) return { sent: over(reply) };
+    try {
+      if ((await accessTo(found.party.forumChannelId, userId)) === 'barred') {
+        return { sent: sendFailure(request, reply, 403) };
+      }
+    } catch (err) {
+      return { sent: unreachableOnTheMap(deps, reply, err, guild, userId, doing) };
+    }
+    return { userId, member: acting.member, standing: acting.standing, ...found };
+  };
+
+  /**
+   * What a change of a train answers: 200 when it was made; 409 when the train has ended, or the
+   * press no longer fits the train (it moved on, its route changed); 422 for any other refusal;
+   * the words as text, and the train as the member sees it now (not once it has ended).
+   */
+  const answered = (
+    reply: FastifyReply,
+    guild: string,
+    row: number,
+    partyId: string,
+    userId: string,
+    standing: MemberStanding,
+    answer: TrainChangeAnswer,
+  ) => {
+    const status =
+      answer.kind === 'ok'
+        ? 200
+        : answer.kind === 'gone' || (answer.reason !== undefined && STALE.has(answer.reason))
+          ? 409
+          : 422;
+    const party = answer.kind === 'gone' ? undefined : parties.store.get(partyId);
+    const train =
+      party?.status === 'active' && isTrain(party)
+        ? viewOf(guild, row, party, userId, standing)
+        : undefined;
+    const sent: TrainAnswer = {
+      ok: answer.kind === 'ok',
+      text: words(answer.text),
+      ...(train ? { train } : {}),
+    };
+    return reply.code(status).send(sent);
+  };
+
   const writeLimiter = new RateLimiter({ uses: TRAIN_WRITES_PER_ADDRESS_MINUTE, perMs: 60_000 });
   const writeGuards = [
     limitedPerAddress(writeLimiter, { now: deps.now }),
@@ -217,8 +418,8 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     );
     if (made.kind === 'refused') return refuse(reply, 422, made.text);
     const party = parties.store.get(made.party.id);
-    const staff = isMapStaff(acting.standing, userId, parties.ownerId);
-    const train = party?.type === 'train' ? viewOf(guild, row, party, userId, staff) : undefined;
+    const train =
+      party?.type === 'train' ? viewOf(guild, row, party, userId, acting.standing) : undefined;
     const { startTime } = made.party.timed;
     const when = startTime === null ? '' : ` It starts at ${timestamp(startTime)}.`;
     // Who made it may lay its route without being signed up, as after `/train`.
@@ -233,4 +434,132 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
     };
     return reply.send(answer);
   });
+
+  // The member's saved routes of the region of a train, for the route editor's list (as the
+  // autocomplete of `/route load` offers them): members only, an active train of this server
+  // (409 otherwise) in a forum the member is not kept out of (403; 503 while Discord cannot say).
+  const routesLimiter = new RateLimiter({ uses: ROUTES_PER_MINUTE, perMs: 60_000 });
+  scope.get(
+    '/api/trains/:party/routes',
+    { onRequest: limitedPerAddress(routesLimiter, { now: deps.now }) },
+    async (request: TrainRequest, reply) => {
+      void reply.header('cache-control', 'private, no-store');
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 401);
+      const { guild, party: partyId } = request.params;
+      const refused = await memberOrFailure(deps, request, reply, guild, session.userId);
+      if (refused) return refused;
+      const found = await activeTrain(guild, partyId);
+      if (!found) return reply.code(409).send({ error: TRAIN_OVER });
+      try {
+        if ((await accessTo(found.party.forumChannelId, session.userId)) === 'barred') {
+          return sendFailure(request, reply, 403);
+        }
+      } catch (err) {
+        deps.log.warn(
+          { err, guild, user: session.userId },
+          "could not ask Discord about a train's forum on the web pages",
+        );
+        return sendFailure(request, reply, 503);
+      }
+      const mine = await ctx.trains.savedRoutes(found.party.id, session.userId);
+      const view: SavedRoutesView = {
+        routes: mine.map((route) => ({
+          id: route.id,
+          name: route.name,
+          stops: route.gyms.length,
+          atEnd: route.atEnd,
+        })),
+      };
+      return view;
+    },
+  );
+
+  // An edit of a train's route (spec 3.7), as its `/route` subcommand makes it: before the body is
+  // read, the per-address limit, the guard of every POST and an edit the map knows (404
+  // otherwise). Then the session (403) and the body (400), the checks of every write to a train
+  // (`trainWrite`), whether the member may make the edit, as the service decides it
+  // (`mayNotArrange`, `mayNotClear`, `mayNotLoad`: 403 in the command's words), a gym of this
+  // server's regions (`reaches`; 404 otherwise, so that nobody learns of other servers' gyms),
+  // and only then the subcommand's throttle in its window; then its code path, with the route the
+  // edit was drawn from: one made on a route that changed meanwhile is refused (409, the train as
+  // it is now).
+  const knownEdit = async (request: TrainRequest, reply: FastifyReply) => {
+    if (!isRouteEdit(request.params.edit ?? '')) return sendFailure(request, reply, 404);
+  };
+  scope.post(
+    '/api/trains/:party/route/:edit',
+    { onRequest: [...writeGuards, knownEdit] },
+    async (request: TrainRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const edit = request.params.edit ?? '';
+      if (!isRouteEdit(edit)) return sendFailure(request, reply, 404);
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const input = editInput(edit, request.body ?? {});
+      if (!input) return sendFailure(request, reply, 400);
+      const writing = await trainWrite(request, reply, session.userId, "changed a train's route");
+      if ('sent' in writing) return writing.sent;
+      const { userId, member, standing, row, party } = writing;
+      const { guild } = request.params;
+      const staff = isMapStaff(standing, userId, parties.ownerId);
+      const forbidden =
+        edit === 'add' || edit === 'remove' || edit === 'move'
+          ? mayNotArrange(party, userId, staff)
+          : edit === 'clear'
+            ? mayNotClear(party, userId, isMapBotStaff(standing, userId, parties.ownerId))
+            : edit === 'load'
+              ? mayNotLoad(party, userId, staff)
+              : undefined;
+      if (forbidden) return refuse(reply, 403, trainRefusal(ctx, forbidden));
+      // A gym of no region of this server is none here, as for the list of `/route add`.
+      if (
+        input.edit === 'add' &&
+        (ctx.gyms.get(input.gym) === undefined || !ctx.trains.reaches(party, input.gym))
+      ) {
+        return sendFailure(request, reply, 404);
+      }
+      const throttled = throttledOnTheMap(
+        deps,
+        reply,
+        { command: `route ${edit}` },
+        userId,
+        CHANGE_THROTTLE,
+      );
+      if (throttled) return throttled;
+      const botStaff = isMapBotStaff(standing, userId, parties.ownerId);
+      const answer = await routeEdit(input, party, member, staff, botStaff);
+      deps.log.info(
+        { user: userId, guild, party: party.id, edit, outcome: answer.kind },
+        "a train's route was changed on the map",
+      );
+      return answered(reply, guild, row, party.id, userId, standing, answer);
+    },
+  );
+
+  /** The edit's code path, as its subcommand calls it. */
+  const routeEdit = (
+    input: EditInput,
+    party: TrainParty,
+    member: Member,
+    staff: boolean,
+    botStaff: boolean,
+  ): Promise<TrainChangeAnswer> => {
+    switch (input.edit) {
+      case 'add':
+        return addStopAs(ctx, party, member, input.gym, staff, input.drawn);
+      case 'remove':
+        return removeStopAs(ctx, party, member, input.stop, staff, input.drawn);
+      case 'move':
+        return moveStopAs(ctx, party, member, input.from, input.to, staff, input.drawn);
+      case 'clear':
+        return clearRouteAs(ctx, party, member, botStaff, input.drawn);
+      case 'save':
+        return saveRouteAs(ctx, party, member, input.name, input.drawn);
+      case 'load':
+        return loadRouteAs(ctx, party, member, input.route, staff, input.drawn);
+      case 'forget':
+        return forgetRouteAs(ctx, party, member.id, input.route);
+    }
+  };
 }
````

### Task 4: Trains from the map: moving, the conductor

Prototype commit: `6682df28e040a167556b91cf1729daf78c86792a`

`POST …/move/<press>` (next, previous, skip, finish, reverse, at-end) carrying the stop it was drawn at, in the post controls' window; `POST …/conductor/take|give-up` carrying the conductor the page saw (`who`), in `/conductor`'s windows; a press that no longer fits answers 409 with the train; the map names nobody ("the conductor before"); `MapTrain` gains `panel` and `conductor`.

**Files:**

```
 src/commands/trains/train-changes.ts |  37 +++++++
 src/domain/web/party-data.ts         |  40 ++++++++
 src/domain/web/party-view.test.ts    |  80 +++++++++++++++-
 src/domain/web/party-view.ts         |  48 +++++++++-
 src/domain/web/train-data.ts         |  32 ++++++-
 src/web/client/parties.test.ts       |   2 +
 src/web/page-words.test.ts           |  15 +++
 src/web/page-words.ts                |  21 ++--
 src/web/train-move.test.ts           | 392 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/train-routes.ts              | 230 ++++++++++++++++++++++++++++++++++++++++++--
 10 files changed, 877 insertions(+), 20 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/parties.test.ts src/web/page-words.test.ts src/web/train-move.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/trains/train-changes.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/train-data.ts src/web/client/parties.test.ts src/web/page-words.test.ts src/web/page-words.ts src/web/train-move.test.ts src/web/train-routes.ts` and `npx eslint src/commands/trains/train-changes.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/train-data.ts src/web/client/parties.test.ts src/web/page-words.test.ts src/web/page-words.ts src/web/train-move.test.ts src/web/train-routes.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 6682df28e040a167556b91cf1729daf78c86792a -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Trains from the map: moving, the conductor`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/trains/train-changes.ts src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/domain/web/train-data.ts src/web/client/parties.test.ts src/web/page-words.test.ts src/web/page-words.ts src/web/train-move.test.ts src/web/train-routes.ts`.

````diff
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index b90958b1c8346432ac7c05c2eb007f0669599a46..f7e1e57b82a86396ba94f108741132dd57c35c93 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -366,6 +366,43 @@ export async function moveTrainAs(
   });
 }
 
+/**
+ * Reverses the route as "Reverse the route" of the Move train panel does (`TrainService.reverse`,
+ * with where the panel was drawn and the gym the route began with then), and says where the
+ * train is now: the map's panel, whose answer is words (the post's panel draws itself anew).
+ */
+export async function reverseRouteAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  staff: boolean,
+  from: string,
+  first: string,
+): Promise<TrainAnswer> {
+  const outcome = await ctx.trains.reverse(party.id, member, staff, from, first);
+  return answerOf(
+    ctx,
+    outcome,
+    (ok) => `The route is reversed. ${whereText(trainPlaces(ctx, ok.party))}`,
+  );
+}
+
+/**
+ * Sets what the train does at the end of its route as the menu of the Move train panel does
+ * (`TrainService.setAtEnd`, with where the panel was drawn), and says it: the map's panel.
+ */
+export async function setAtEndAs(
+  ctx: TrainChanging,
+  party: TrainParty,
+  member: Member,
+  staff: boolean,
+  atEnd: TrainAtEnd,
+  from: string,
+): Promise<TrainAnswer> {
+  const outcome = await ctx.trains.setAtEnd(party.id, member, staff, atEnd, from);
+  return answerOf(ctx, outcome, (ok) => atEndSentence(ok.party.train.atEnd));
+}
+
 /**
  * How the answer of a takeover names the conductor before (`setConductorAs`): on Discord the
  * member as a sentence names them (`DISCORD_CONDUCTOR`); the map names nobody.
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 5648d222d1c183400171cd91b69eae32bb861623..be375c0eb9abbe78375adb5da4a45ecf957c5954 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -85,6 +85,14 @@ export interface MapTrain {
    * move the train, or the maker its first route).
    */
   may: MapTrainRights;
+  /**
+   * The Move train panel as the member may use it now (plan 8M-5), as the post's "Move train…"
+   * opens it: null for who may not move the train (`mayNotMove`), for a train without a route,
+   * and while read-only.
+   */
+  panel: MapTrainPanel | null;
+  /** Who leads the train, as the member sees it (nobody is named), and what they may do of it. */
+  conductor: MapConductor;
 }
 
 /** What a member may do to a train on the map (`MapTrain.may`). */
@@ -94,6 +102,38 @@ export interface MapTrainRights {
   load: boolean;
 }
 
+/** What a train does at the last stop of its route, as `/train`'s option `at-end` takes it. */
+export type MapAtEnd = 'finish' | 'loop' | 'turn-back';
+
+/** The moves of a train along its route. */
+export type MapMove = 'next' | 'previous' | 'skip' | 'finish';
+
+/**
+ * The Move train panel on the map: where the train is (`placeOf`: a gym's id, or `end` once the
+ * route is finished), which every press carries as `from`; the moves that can be made from there,
+ * each with where it leads (`targetOf`: a gym's id, or `end`), which Next, Previous and Skip
+ * carry as `target`; the gym the route begins with when it can be reversed from there
+ * (`cannotReverse`), which Reverse carries as `first`, else null; what the train does at its end.
+ */
+export interface MapTrainPanel {
+  place: string;
+  moves: Array<{ move: MapMove; target: string }>;
+  reverse: string | null;
+  atEnd: MapAtEnd;
+}
+
+/**
+ * The conductor of a train as a member sees it: themself (`you`), somebody else (`other`), or
+ * none; whether they may take the role (signed up, and not it already: `/conductor set`) and
+ * give it up or take it off (the conductor, and staff: `/conductor clear`). Never while
+ * read-only.
+ */
+export interface MapConductor {
+  who: 'you' | 'other' | null;
+  mayTake: boolean;
+  mayDrop: boolean;
+}
+
 export interface MapMeetup {
   kind: 'meetup';
   id: string;
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 3e3786618e7063a6256075aa0e2ad4a3fd2edfd7..582f40e17cec3b63019b52681de1f7787fc1e234 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -14,13 +14,15 @@ import {
   testTrain,
   withAttendees,
 } from '../../../test/support/parties.js';
-import type { Party, RaidParty } from '../party/party.js';
+import type { Party, RaidParty, TrainParty } from '../party/party.js';
 import { setHatchTime } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
 import {
   mapParty,
   mayChangeRaid,
   partyView,
+  conductorOf,
+  trainPanelOf,
   trainRights,
   type PartyViewInput,
 } from './party-view.js';
@@ -199,6 +201,8 @@ describe('partyView', () => {
         },
         // The member is not signed up: nothing of the route is theirs to change.
         may: { arrange: false, clear: false, load: false },
+        panel: null,
+        conductor: { who: null, mayTake: false, mayDrop: false },
       },
     ]);
     expect(view.meetups).toEqual([
@@ -327,3 +331,77 @@ describe('trainRights', () => {
     });
   });
 });
+
+describe('trainPanelOf and conductorOf', () => {
+  /** A train of three stops at this one, Alice signed up as coming. */
+  const stoppedAt = (stop: number, more: Partial<TrainParty['train']> = {}): TrainParty => {
+    const train = withAttendees(testTrain(), { [ALICE]: { status: PartyStatus.Coming } });
+    return { ...train, train: { ...train.train, route: [4, 1, 7], stop, ...more } };
+  };
+
+  it('gives the moves that can be made from where the train is, each with where it leads, and Reverse where it may be', () => {
+    expect(trainPanelOf(stoppedAt(1), input([]))).toEqual({
+      place: '1',
+      moves: [
+        { move: 'next', target: '7' },
+        { move: 'previous', target: '4' },
+        { move: 'finish', target: 'end' },
+      ],
+      reverse: null,
+      atEnd: 'finish',
+    });
+    // Finished from its last stop: Previous takes it back, Reverse starts it again there.
+    expect(trainPanelOf(stoppedAt(3, { finishedFrom: 7 }), input([]))).toEqual({
+      place: 'end',
+      moves: [{ move: 'previous', target: '7' }],
+      reverse: '4',
+      atEnd: 'finish',
+    });
+    expect(trainPanelOf(stoppedAt(2, { atEnd: 'loop' }), input([]))?.moves).toEqual([
+      { move: 'next', target: '4' },
+      { move: 'previous', target: '1' },
+      { move: 'skip', target: '1' },
+      { move: 'finish', target: 'end' },
+    ]);
+  });
+
+  it('gives no panel to who may not move the train, for a train without a route, or while read-only', () => {
+    expect(trainPanelOf(stoppedAt(0), input([], { memberId: BOB }))).toBeNull();
+    expect(trainPanelOf(stoppedAt(0, { conductorId: REPORTER }), input([]))).toBeNull();
+    expect(trainPanelOf(stoppedAt(0, { route: [] }), input([]))).toBeNull();
+    expect(trainPanelOf(stoppedAt(0), input([], { readOnly: true }))).toBeNull();
+    expect(
+      trainPanelOf(stoppedAt(0, { conductorId: REPORTER }), input([], { staff: true })),
+    ).not.toBeNull();
+  });
+
+  it('says whose the conductor role is without naming them, and who may take or drop it', () => {
+    expect(conductorOf(stoppedAt(0), input([]))).toEqual({
+      who: null,
+      mayTake: true,
+      mayDrop: false,
+    });
+    expect(conductorOf(stoppedAt(0, { conductorId: ALICE }), input([]))).toEqual({
+      who: 'you',
+      mayTake: false,
+      mayDrop: true,
+    });
+    expect(conductorOf(stoppedAt(0, { conductorId: ALICE }), input([], { memberId: BOB }))).toEqual(
+      {
+        who: 'other',
+        mayTake: false,
+        mayDrop: false,
+      },
+    );
+    expect(
+      conductorOf(stoppedAt(0, { conductorId: ALICE }), input([], { memberId: BOB, staff: true })),
+    ).toEqual({ who: 'other', mayTake: false, mayDrop: true });
+    expect(
+      conductorOf(stoppedAt(0, { conductorId: ALICE }), input([], { readOnly: true })),
+    ).toEqual({
+      who: 'you',
+      mayTake: false,
+      mayDrop: false,
+    });
+  });
+});
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index a346e6908c5636dd06663acdd2752810f19445dd..c277e31422bbe32d3f67724ecd8866c767848c96 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -11,7 +11,17 @@ import {
 import { raidStage } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
 import { timedOver } from '../party/timed.js';
-import { mayNotArrange, mayNotClear, mayNotLoad } from '../party/train.js';
+import {
+  cannotMove,
+  cannotReverse,
+  mayNotArrange,
+  mayNotClear,
+  mayNotLoad,
+  mayNotMove,
+  placeOf,
+  targetOf,
+  TRAIN_MOVES,
+} from '../party/train.js';
 import { raidWords } from '../pogo/raid-tier.js';
 import type {
   GroupCounts,
@@ -21,7 +31,9 @@ import type {
   MapPress,
   MapRaid,
   MapStatus,
+  MapConductor,
   MapTrain,
+  MapTrainPanel,
   MapTrainRights,
   PartiesView,
 } from './party-data.js';
@@ -182,6 +194,38 @@ export function trainRights(party: TrainParty, input: PartyViewInput): MapTrainR
   };
 }
 
+/**
+ * The Move train panel as the member may use it (spec 3.7), as the post's "Move train…" opens it
+ * (`openTrainPanel`): none for who may not move the train, for a train without a route, and
+ * while read-only. The moves are those `cannotMove` allows from where the train is, each with
+ * where it leads; Reverse where `cannotReverse` allows it.
+ */
+export function trainPanelOf(party: TrainParty, input: PartyViewInput): MapTrainPanel | null {
+  if (input.readOnly || party.train.route.length === 0) return null;
+  if (mayNotMove(party, input.memberId, input.staff) !== undefined) return null;
+  return {
+    place: placeOf(party),
+    moves: TRAIN_MOVES.flatMap((move) =>
+      cannotMove(party, move) === undefined ? [{ move, target: targetOf(party, move) }] : [],
+    ),
+    reverse: cannotReverse(party) === undefined ? String(party.train.route[0]) : null,
+    atEnd: party.train.atEnd,
+  };
+}
+
+/** The conductor of a train as the member sees it, and what they may do of it. */
+export function conductorOf(party: TrainParty, input: PartyViewInput): MapConductor {
+  const { conductorId } = party.train;
+  const { memberId } = input;
+  const who = conductorId === null ? null : conductorId === memberId ? 'you' : 'other';
+  if (input.readOnly) return { who, mayTake: false, mayDrop: false };
+  return {
+    who,
+    mayTake: who !== 'you' && attendeeOf(party, memberId) !== undefined,
+    mayDrop: conductorId !== null && mayNotClear(party, memberId, input.staff) === undefined,
+  };
+}
+
 function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTrain {
   const { route, stop } = party.train;
   return {
@@ -194,6 +238,8 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
     link,
     attendance: attendanceOf(party, input, false),
     may: trainRights(party, input),
+    panel: trainPanelOf(party, input),
+    conductor: conductorOf(party, input),
   };
 }
 
diff --git a/src/domain/web/train-data.ts b/src/domain/web/train-data.ts
index 73875cd66ba9231872e9188fa00df4a02c9b8ba2..6d460d12b7ce3c7aca916249b0d26c0112c06e5d 100644
--- a/src/domain/web/train-data.ts
+++ b/src/domain/web/train-data.ts
@@ -4,11 +4,35 @@
  * takes them.
  */
 
-import type { MapTrain } from './party-data.js';
+import type { MapAtEnd, MapTrain } from './party-data.js';
 
-/** What a train does at the last stop of its route, as `/train`'s option `at-end` takes it. */
-export const MAP_AT_ENDS = ['finish', 'loop', 'turn-back'] as const;
-export type MapAtEnd = (typeof MAP_AT_ENDS)[number];
+export type { MapAtEnd };
+
+/** What a train may do at the last stop of its route, in the order `/train` offers them. */
+export const MAP_AT_ENDS: readonly MapAtEnd[] = ['finish', 'loop', 'turn-back'];
+
+/**
+ * What the Move train panel on the map presses (`POST /s/<guild>/api/trains/<id>/move/<move>`):
+ * the four moves (body `{ from, target }`, Finish `{ from }`), Reverse (`{ from, first }`) and
+ * the mode at the end of the route (`{ from, atEnd }`), each as the post's panel does it.
+ */
+export const PANEL_PRESSES = ['next', 'previous', 'skip', 'finish', 'reverse', 'at-end'] as const;
+export type PanelPress = (typeof PANEL_PRESSES)[number];
+
+/**
+ * Taking the conductor role and giving it up (or taking it off another, for staff), as
+ * `/conductor set` and `/conductor clear` do (`POST …/conductor/<change>`, body `{ who }`: whose
+ * the role was when the page drew the button, `ConductorSeen`).
+ */
+export const CONDUCTOR_CHANGES = ['take', 'give-up'] as const;
+export type ConductorChange = (typeof CONDUCTOR_CHANGES)[number];
+
+/**
+ * Whose the conductor role was as the page drew a train (`MapConductor.who`, `none` for null):
+ * a conductor's button carries it, and one drawn when it was another is refused.
+ */
+export const CONDUCTOR_SEEN = ['none', 'other', 'you'] as const;
+export type ConductorSeen = (typeof CONDUCTOR_SEEN)[number];
 
 /**
  * What starting, arranging or moving a train answers: whether it was done, the command's words
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index 155f25a22552685da32752f06b79907f4b448344..b8b3eff028c0b55f33841077b339a274b086c7f8 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -308,6 +308,8 @@ describe('trainPopup and meetupItem', () => {
       link: LINK,
       attendance: attendance({ actions: [] }),
       may: { arrange: false, clear: false, load: false },
+      panel: null,
+      conductor: { who: null, mayTake: false, mayDrop: false },
     };
     expect(texts(trainPopup(train, context))).toEqual([
       'Saturday <b>legendaries</b>',
diff --git a/src/web/page-words.test.ts b/src/web/page-words.test.ts
index 39a8468e51a21213de0bc0ea312785da7d049811..4a19ec309db90bb0afe2ed23f196889028ae26f7 100644
--- a/src/web/page-words.test.ts
+++ b/src/web/page-words.test.ts
@@ -39,4 +39,19 @@ describe('the words of a command as the map shows them (pageWords)', () => {
       'Your group is north\\; its gym is a\\.',
     );
   });
+
+  it("writes the bot's masked links as their text, with or without the angle brackets, brackets in a name kept", () => {
+    const maps = 'https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05';
+    expect(
+      pageWords(
+        `The train is at stop 2 of 3: [The Stacks](<${maps}>). Next is [B](${maps}).`,
+        ZONE,
+        NOW,
+      ),
+    ).toBe('The train is at stop 2 of 3: The Stacks. Next is B.');
+    // `linkText` escapes the brackets of a name; a bracket a member typed outside a link stays.
+    expect(pageWords(`At [Gym \\[old\\] north\\_hills](<${maps}>) [sic]`, ZONE, NOW)).toBe(
+      'At Gym [old] north_hills [sic]',
+    );
+  });
 });
diff --git a/src/web/page-words.ts b/src/web/page-words.ts
index d9a7100a875321ba83d27fb51d76b6e365731145..9412abe08af5144a1a87d8776371b5cc0521ae10 100644
--- a/src/web/page-words.ts
+++ b/src/web/page-words.ts
@@ -5,22 +5,27 @@ import { unplain } from '../render/text.js';
 const TIMESTAMP = /<t:(-?\d+)(?::[tTdDfFR])?>/gu;
 
 /**
- * An escape (`\_`, `\\`: what members wrote is escaped), or the bot's own markdown: code spans
- * and bold. Read in one pass from the left, so that the backtick after a typed backslash (`\\`)
- * is the bot's and not escaped by it.
+ * An escape (`\_`, `\\`: what members wrote is escaped), a masked link of the bot's
+ * (`[name](<address>)`, its text with its own escapes in the first group), or the bot's own
+ * markdown: code spans and bold. Read in one pass from the left, so that the backtick after a
+ * typed backslash (`\\`) is the bot's and not escaped by it, and a bracket a member escaped
+ * begins no link.
  */
-const ESCAPE_OR_MARKDOWN = /\\.|`|\*\*/gsu;
+const ESCAPE_LINK_OR_MARKDOWN = /\\.|\[((?:\\.|[^\]\\])*)\]\((?:<[^>\s]*>|[^)\s]*)\)|`|\*\*/gsu;
 
 /**
- * The words of a command as the live map shows them, as plain text (plan 8M-4): Discord's
+ * The words of a command as the live map shows them, as plain text (plans 8M-4, 8M-5): Discord's
  * timestamps as clock times in the posts' zone (`clockTime`, as the page writes times), the
- * bot's own markdown taken out (escapes kept as they are), then the escapes of what members and
- * feeds wrote undone (`unplain`). Pure.
+ * bot's masked links as their text (the page links nothing of a command's words), the bot's own
+ * markdown taken out (escapes kept as they are), then the escapes of what members and feeds
+ * wrote undone (`unplain`). Pure.
  */
 export function pageWords(text: string, zone: string, now: number): string {
   return unplain(
     text
       .replace(TIMESTAMP, (_stamp, seconds: string) => clockTime(Number(seconds) * 1000, zone, now))
-      .replace(ESCAPE_OR_MARKDOWN, (match) => (match.startsWith('\\') ? match : '')),
+      .replace(ESCAPE_LINK_OR_MARKDOWN, (match, linked: string | undefined) =>
+        match.startsWith('\\') ? match : (linked ?? ''),
+      ),
   );
 }
diff --git a/src/web/train-move.test.ts b/src/web/train-move.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b9e4205521b2ed5350b5e3bd1d94cf89efd8cbcd
--- /dev/null
+++ b/src/web/train-move.test.ts
@@ -0,0 +1,392 @@
+import { afterEach, describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { testGyms, WEST_FORUM } from '../../test/support/gyms.js';
+import { FakeMemberDirectory } from '../../test/support/members.js';
+import { ALICE, BOB, PARTY_NOW, REPORTER } from '../../test/support/parties.js';
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
+import { CHANGE_THROTTLE } from '../commands/raids/change.js';
+import { controlThrottleKey } from '../discord/router.js';
+import { Throttles } from '../discord/throttle.js';
+import { attendeeOf } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { PartiesView } from '../domain/web/party-data.js';
+import type { TrainAnswer } from '../domain/web/train-data.js';
+import { PARTY_KIND } from '../render/party-controls.js';
+import { UNREACHABLE } from './acting.js';
+
+const maps = (id: number): string => {
+  const gym = testGyms().find((found) => found.id === id);
+  return `https://www.google.com/maps/search/?api=1&query=${gym?.lat}%2C${gym?.lon}`;
+};
+const STACKS = `[The Stacks](<${maps(1)}>)`;
+
+/**
+ * A train of the party services of a test (`createdTrain`, made by `REPORTER`, who is signed up
+ * as interested) on the route Veterans Memorial Bridge (4), The Stacks (1), Harbor Lighthouse
+ * Mural (7), at its first stop, on the map: Alice signed up as coming and a member of the server
+ * (fetched fresh as `Alice`), Bob a member who is not signed up, the bot's owner a member (staff).
+ */
+async function moving(options: { throttles?: Throttles } = {}) {
+  const made = await createdTrain({ route: [4, 1, 7] });
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
+  const members = new FakeMemberDirectory()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(REPORTER, 'Reporter')
+    .add(TEST_OWNER_ID, 'Owner');
+  const acting = new FakeActingMembers()
+    .add(ALICE, 'Alice')
+    .add(BOB, 'Bob')
+    .add(REPORTER, 'Reporter')
+    .add(TEST_OWNER_ID, 'Owner');
+  const web = webServerWith({
+    members,
+    parties: partyWebWith(made, { acting, throttles }),
+    trains: trainWebWith(ctx),
+  });
+  web.clock.now = PARTY_NOW;
+  const headers = await web.posting(ALICE, 'Alice');
+  const post = async (path: string, body: unknown, sent = headers) => {
+    const answer = await web.app.inject({
+      method: 'POST',
+      url: `/s/${FAKE_GUILD_ID}/api/trains/${made.party.id}/${path}`,
+      headers: { ...sent, 'content-type': 'application/json' },
+      payload: JSON.stringify(body),
+    });
+    return {
+      status: answer.statusCode,
+      json: answer.json<TrainAnswer & { error?: string }>(),
+      headers: answer.headers,
+    };
+  };
+  const move = (what: string, body: unknown, sent = headers) => post(`move/${what}`, body, sent);
+  /** A conductor's button, carrying whose the role was when the page drew it. */
+  const conductor = (what: string, who = 'none', sent = headers) =>
+    post(`conductor/${what}`, { who }, sent);
+  /** The train as a member sees it in the list of parties. */
+  const listed = async (userId: string, name: string) => {
+    const cookie = await web.loggedIn(userId, name);
+    const answer = await web.app.inject({
+      url: `/s/${FAKE_GUILD_ID}/api/parties`,
+      headers: { cookie },
+    });
+    return answer.json<PartiesView>().trains[0];
+  };
+  /** The lines said in the post since the setup, one by one, the movement announced. */
+  const lines = async (): Promise<string[]> => {
+    await made.trains.flush();
+    await made.attendance.flush();
+    return made.said().join('\n').split('\n').filter(Boolean);
+  };
+  return { made, web, acting, members, headers, post, move, conductor, listed, lines, throttles };
+}
+
+describe('moving a train on the map', () => {
+  let web: TestWeb | undefined;
+  afterEach(async () => {
+    await web?.app.close();
+    web = undefined;
+  });
+
+  it("moves it as the panel's Next does: the movement in the post pings as usual, the command's words as text, the train as it is now", async () => {
+    const map = await moving();
+    web = map.web;
+    await map.made.attendance.signUp(
+      map.made.party.id,
+      { id: BOB, name: 'Bob' },
+      PartyStatus.Present,
+    );
+    await map.made.attendance.flush();
+    const answer = await map.move('next', { from: '4', target: '1' });
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({
+      ok: true,
+      text:
+        'The train is at stop 2 of 3: The Stacks. Next is Harbor Lighthouse Mural. ' +
+        'I am telling the others.',
+      train: { stop: 1, panel: { place: '1' } },
+    });
+    expect(attendeeOf(map.made.current(), BOB)?.status).toBe(PartyStatus.Coming);
+    expect(await map.lines()).toEqual([
+      `**Bob** (<@${BOB}>) is here.`,
+      `The train is moving to ${STACKS}. Moved by **Alice** (<@${ALICE}>).`,
+      `<@${REPORTER}> <@${BOB}>`,
+    ]);
+  });
+
+  it('refuses a press drawn where the train no longer is, or leading where the route no longer goes, and gives the train as it is now', async () => {
+    const map = await moving();
+    web = map.web;
+    expect((await map.move('next', { from: '4', target: '1' })).status).toBe(200);
+    const twice = await map.move('next', { from: '4', target: '1' });
+    expect(twice.status).toBe(409);
+    expect(twice.json).toMatchObject({
+      ok: false,
+      text: 'The train has moved on meanwhile.',
+      train: { stop: 1 },
+    });
+    await map.made.trains.moveStop(map.made.party.id, { id: ALICE }, 3, 2);
+    const elsewhere = await map.move('previous', { from: '1', target: '4' });
+    expect(elsewhere.status).toBe(409);
+    expect(elsewhere.json.text).toBe('That button no longer leads where it said.');
+    expect(map.made.current().train.stop).toBe(2);
+  });
+
+  it('skips, goes back and finishes as the panel does', async () => {
+    const map = await moving();
+    web = map.web;
+    expect((await map.move('skip', { from: '4', target: '7' })).json.text).toBe(
+      'The train is at stop 3 of 3: Harbor Lighthouse Mural. It is the last stop: Next finishes the route. I am telling the others.',
+    );
+    expect((await map.move('previous', { from: '7', target: '1' })).json.ok).toBe(true);
+    const finished = await map.move('finish', { from: '1' });
+    expect(finished.json).toMatchObject({
+      ok: true,
+      text:
+        'The train has finished its route of 3 stops. Previous takes it back to stop 2: ' +
+        'The Stacks. I am telling the others.',
+      train: { stop: null, panel: { place: 'end' } },
+    });
+  });
+
+  it('reverses the route and sets what the train does at its end, as the panel does', async () => {
+    const map = await moving();
+    web = map.web;
+    const reversed = await map.move('reverse', { from: '4', first: '4' });
+    expect(reversed.json).toMatchObject({
+      ok: true,
+      text:
+        'The route is reversed. The train is at stop 3 of 3: Veterans Memorial Bridge. ' +
+        'It is the last stop: Next finishes the route.',
+      train: { route: [7, 1, 4], stop: 2 },
+    });
+    // The same press again would flip it back: the route no longer begins where it did.
+    expect((await map.move('reverse', { from: '4', first: '4' })).status).toBe(409);
+    const looping = await map.move('at-end', { from: '4', atEnd: 'loop' });
+    expect(looping.json).toMatchObject({
+      ok: true,
+      text: 'At the end it loops back to the first stop.',
+      train: { panel: { atEnd: 'loop' } },
+    });
+    expect(map.made.current().train).toMatchObject({ route: [7, 1, 4], atEnd: 'loop' });
+  });
+
+  it("gives the panel to who may move the train: the moves from where it is with where each leads, Reverse, the mode; nobody else's", async () => {
+    const map = await moving();
+    web = map.web;
+    expect((await map.listed(ALICE, 'Alice'))?.panel).toEqual({
+      place: '4',
+      moves: [
+        { move: 'next', target: '1' },
+        { move: 'skip', target: '7' },
+        { move: 'finish', target: 'end' },
+      ],
+      reverse: '4',
+      atEnd: 'finish',
+    });
+    expect((await map.listed(BOB, 'Bob'))?.panel).toBeNull();
+    await map.made.trains.setConductor(map.made.party.id, { id: REPORTER });
+    expect((await map.listed(ALICE, 'Alice'))?.panel).toBeNull();
+    expect((await map.listed(TEST_OWNER_ID, 'Owner'))?.panel?.place).toBe('4');
+  });
+
+  it("lets only who may move it move it, in the command's words before the throttle", async () => {
+    const throttles = new Throttles();
+    const map = await moving({ throttles });
+    web = map.web;
+    const bob = await map.web.posting(BOB, 'Bob');
+    const notSigned = await map.move('next', { from: '4', target: '1' }, bob);
+    expect(notSigned.status).toBe(403);
+    expect(notSigned.json).toMatchObject({
+      ok: false,
+      text: 'You are not signed up for this train.',
+    });
+    await map.made.trains.setConductor(map.made.party.id, { id: REPORTER });
+    const conducted = await map.move('next', { from: '4', target: '1' });
+    expect(conducted.status).toBe(403);
+    expect(conducted.json.text).toBe(
+      'This train has a conductor: only they and the moderators can move it.',
+    );
+    expect(
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
+    ).toBeUndefined();
+    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
+    expect((await map.move('next', { from: '4', target: '1' }, owner)).status).toBe(200);
+  });
+
+  it("counts in the window of the post's controls, as a press of the panel is", async () => {
+    const throttles = new Throttles();
+    const map = await moving({ throttles });
+    web = map.web;
+    for (let use = 0; use < ACTION_THROTTLE.uses; use += 1) {
+      throttles.use(controlThrottleKey(PARTY_KIND), ALICE, ACTION_THROTTLE, PARTY_NOW);
+    }
+    const counted = await map.move('next', { from: '4', target: '1' });
+    expect(counted.status).toBe(429);
+    expect(counted.json.error).toBe('That was a lot of clicks. Try again in 1 minute.');
+    expect(map.made.current().train.stop).toBe(0);
+  });
+
+  it('takes and gives up the conductor role as /conductor set and clear do, in their window', async () => {
+    const throttles = new Throttles();
+    const map = await moving({ throttles });
+    web = map.web;
+    const taken = await map.conductor('take');
+    expect(taken.json).toMatchObject({
+      ok: true,
+      text: 'You are the conductor of this train. Only you and the moderators can move it now.',
+      train: { conductor: { who: 'you', mayTake: false, mayDrop: true } },
+    });
+    expect((await map.listed(REPORTER, 'Reporter'))?.conductor).toEqual({
+      who: 'other',
+      mayTake: true,
+      mayDrop: false,
+    });
+    const bob = await map.web.posting(BOB, 'Bob');
+    const notSigned = await map.conductor('take', 'other', bob);
+    expect(notSigned.status).toBe(403);
+    expect(notSigned.json.text).toBe('You are not signed up for this train.');
+    const notTheirs = await map.conductor(
+      'give-up',
+      'other',
+      await map.web.posting(REPORTER, 'Reporter'),
+    );
+    expect(notTheirs.status).toBe(403);
+    expect(notTheirs.json.text).toBe(
+      'Only the conductor of this train and the moderators can do that.',
+    );
+    const given = await map.conductor('give-up', 'you');
+    expect(given.json).toMatchObject({
+      ok: true,
+      text: 'You are no longer the conductor of this train. Anybody who is signed up can move it.',
+      train: { conductor: { who: null, mayTake: true, mayDrop: false } },
+    });
+    for (let use = 0; use < CHANGE_THROTTLE.uses; use += 1) {
+      throttles.use('conductor set', ALICE, CHANGE_THROTTLE, PARTY_NOW);
+    }
+    const counted = await map.conductor('take');
+    expect(counted.status).toBe(429);
+    expect(counted.json.error).toBe('You can use /conductor set again in 1 minute.');
+  });
+
+  it('takes the role over from another conductor without naming them', async () => {
+    const map = await moving();
+    web = map.web;
+    await map.made.trains.setConductor(map.made.party.id, { id: REPORTER, name: 'Reporter' });
+    const taken = await map.conductor('take', 'other');
+    expect(taken.json).toMatchObject({
+      ok: true,
+      text:
+        'You are the conductor of this train, in the place of the conductor before. ' +
+        'Only you and the moderators can move it now.',
+      train: { conductor: { who: 'you' } },
+    });
+    expect(taken.json.text).not.toContain('Reporter');
+    expect(taken.json.text).not.toContain(REPORTER);
+  });
+
+  it("refuses a conductor button drawn when the role was somebody else's than it is now, and gives the train as it is now, uncounted", async () => {
+    const throttles = new Throttles();
+    const map = await moving({ throttles });
+    web = map.web;
+    // The page drew the train without a conductor; the reporter took the role meanwhile.
+    await map.made.trains.setConductor(map.made.party.id, { id: REPORTER, name: 'Reporter' });
+    const taken = await map.conductor('take', 'none');
+    expect(taken.status).toBe(409);
+    expect(taken.json).toMatchObject({
+      ok: false,
+      text: 'The conductor of this train changed meanwhile: here it is as it is now.',
+      train: { conductor: { who: 'other', mayTake: true } },
+    });
+    expect(map.made.current().train.conductorId).toBe(REPORTER);
+    // Drawn while Alice was it: she is not any more.
+    const owner = await map.web.posting(TEST_OWNER_ID, 'Owner');
+    const dropped = await map.conductor('give-up', 'you', owner);
+    expect(dropped.status).toBe(409);
+    expect(map.made.current().train.conductorId).toBe(REPORTER);
+    expect(
+      throttles.use('conductor set', ALICE, { uses: 1, perSeconds: 60 }, PARTY_NOW),
+    ).toBeUndefined();
+    expect((await map.conductor('give-up', 'other', owner)).status).toBe(200);
+    expect(map.made.current().train.conductorId).toBeNull();
+  });
+
+  it('answers a train that is over (409), refuses a member kept out of its forum (403), and nothing while Discord cannot say (503)', async () => {
+    const map = await moving();
+    web = map.web;
+    map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect((await map.move('next', { from: '4', target: '1' })).status).toBe(403);
+    expect((await map.conductor('take')).status).toBe(403);
+    map.made.gateway.barred.clear();
+    map.made.gateway.failing.set('memberAccess', new Error('Discord is away'));
+    const away = await map.move('next', { from: '4', target: '1' });
+    expect(away.status).toBe(503);
+    expect(away.json.error).toBe(UNREACHABLE);
+    map.made.gateway.failing.clear();
+    await map.made.service.end(map.made.party.id);
+    const over = await map.move('next', { from: '4', target: '1' });
+    expect(over.status).toBe(409);
+    expect(over.json).toEqual({ ok: false, text: 'This train is over.' });
+  });
+
+  it('knows only its moves (404) and their bodies (400)', async () => {
+    const map = await moving();
+    web = map.web;
+    expect((await map.move('jump', { from: '4' })).status).toBe(404);
+    expect((await map.conductor('steal')).status).toBe(404);
+    expect((await map.conductor('take', 'nobody')).status).toBe(400);
+    expect((await map.post('conductor/take', {})).status).toBe(400);
+    expect((await map.move('next', { from: '4' })).status).toBe(400);
+    expect((await map.move('at-end', { from: '4', atEnd: 'around' })).status).toBe(400);
+    expect((await map.move('finish', { from: '4', target: 'end', more: 1 })).status).toBe(400);
+    expect(map.made.current().train.stop).toBe(0);
+  });
+
+  it('logs a move as a command is logged: who, where, which train, what', async () => {
+    const map = await moving();
+    web = map.web;
+    await map.move('next', { from: '4', target: '1' });
+    await map.conductor('take');
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({
+        msg: 'a train was moved on the map',
+        user: ALICE,
+        guild: FAKE_GUILD_ID,
+        party: map.made.party.id,
+        move: 'next',
+        outcome: 'ok',
+      }),
+    );
+    expect(map.web.entries).toContainEqual(
+      expect.objectContaining({
+        msg: "a train's conductor was changed on the map",
+        conductor: 'take',
+        outcome: 'ok',
+      }),
+    );
+  });
+});
diff --git a/src/web/train-routes.ts b/src/web/train-routes.ts
index 3951d758fec92a7183d9a4efc23bbce6d0b3ea2e..f865787d605535453978524c8f260b565518968d 100644
--- a/src/web/train-routes.ts
+++ b/src/web/train-routes.ts
@@ -2,20 +2,26 @@ import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
 import { z } from 'zod';
 import type { AppContext } from '../app-context.js';
 import { newPartyTimes, noForumWords, typedTimedTime } from '../commands/parties/timed.js';
-import { partyOver } from '../commands/parties/reply.js';
+import { ACTION_THROTTLE, partyOver } from '../commands/parties/reply.js';
 import { CHANGE_THROTTLE } from '../commands/raids/change.js';
 import type { ReportNames } from '../commands/raids/report.js';
 import {
   addStopAs,
+  clearConductorAs,
   clearRouteAs,
   forgetRouteAs,
   loadRouteAs,
   moveStopAs,
+  moveTrainAs,
   notSignedUpWords,
   removeStopAs,
+  reverseRouteAs,
   saveRouteAs,
+  setAtEndAs,
+  setConductorAs,
   startTrainAs,
   trainRefusal,
+  type ConductorNamer,
   type TrainAnswer as TrainChangeAnswer,
   type TrainChanging,
   type TrainStarting,
@@ -35,16 +41,23 @@ import {
   type TrainParty,
 } from '../domain/party/party.js';
 import { tidyName } from '../domain/party/timed.js';
-import { mayNotArrange, mayNotClear, mayNotLoad } from '../domain/party/train.js';
+import { mayNotArrange, mayNotClear, mayNotLoad, mayNotMove } from '../domain/party/train.js';
 import type { MapTrain } from '../domain/web/party-data.js';
 import { mapParty } from '../domain/web/party-view.js';
 import {
+  CONDUCTOR_CHANGES,
+  CONDUCTOR_SEEN,
+  PANEL_PRESSES,
   ROUTE_EDITS,
+  type ConductorChange,
+  type ConductorSeen,
+  type PanelPress,
   type RouteEdit,
   type SavedRoutesView,
   type TrainAnswer,
 } from '../domain/web/train-data.js';
 import { problemText } from '../render/activity.js';
+import { PARTY_KIND } from '../render/party-controls.js';
 import { timestamp } from '../render/text.js';
 import type { Member } from '../services/attendance-service.js';
 import {
@@ -186,7 +199,7 @@ const STALE: ReadonlySet<PartyProblem> = new Set([
 
 /** The address of a train's route edit, saved routes, move or conductor. */
 type TrainRequest = FastifyRequest<{
-  Params: { guild: string; party: string; edit?: string };
+  Params: { guild: string; party: string; action?: string };
 }>;
 
 /**
@@ -485,14 +498,14 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // edit was drawn from: one made on a route that changed meanwhile is refused (409, the train as
   // it is now).
   const knownEdit = async (request: TrainRequest, reply: FastifyReply) => {
-    if (!isRouteEdit(request.params.edit ?? '')) return sendFailure(request, reply, 404);
+    if (!isRouteEdit(request.params.action ?? '')) return sendFailure(request, reply, 404);
   };
   scope.post(
-    '/api/trains/:party/route/:edit',
+    '/api/trains/:party/route/:action',
     { onRequest: [...writeGuards, knownEdit] },
     async (request: TrainRequest, reply) => {
       void reply.header('cache-control', 'no-store');
-      const edit = request.params.edit ?? '';
+      const edit = request.params.action ?? '';
       if (!isRouteEdit(edit)) return sendFailure(request, reply, 404);
       const session = await sessions.of(request, reply);
       if (!session) return sendFailure(request, reply, 403);
@@ -562,4 +575,209 @@ export function trainRoutes(scope: FastifyInstance, deps: WebDeps): void {
         return forgetRouteAs(ctx, party, member.id, input.route);
     }
   };
+
+  // A press of the Move train panel on the map (spec 3.7), as the post's panel makes it: before
+  // the body is read, the per-address limit, the guard of every POST and a press the panel has
+  // (404 otherwise). Then the session (403) and the body (400), the checks of every write to a
+  // train (`trainWrite`), whether the member may (`mayNotMove`; for the mode, `mayNotArrange`, as
+  // `setAtEnd` decides: 403 in the command's words), and only then the window of the post's
+  // controls (`ACTION_THROTTLE`), as a press of the panel counts; then the service with where the
+  // panel was drawn (`from`) and where the press leads (`target`, `first`): a press that no
+  // longer fits the train is refused (409, the train as it is now). The movement is announced in
+  // the post as for any move, with its ping.
+  const knownPress = async (request: TrainRequest, reply: FastifyReply) => {
+    if (!isPanelPress(request.params.action ?? '')) return sendFailure(request, reply, 404);
+  };
+  scope.post(
+    '/api/trains/:party/move/:action',
+    { onRequest: [...writeGuards, knownPress] },
+    async (request: TrainRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const press = request.params.action ?? '';
+      if (!isPanelPress(press)) return sendFailure(request, reply, 404);
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const input = pressInput(press, request.body ?? {});
+      if (!input) return sendFailure(request, reply, 400);
+      const writing = await trainWrite(request, reply, session.userId, 'moved a train');
+      if ('sent' in writing) return writing.sent;
+      const { userId, member, standing, row, party } = writing;
+      const { guild } = request.params;
+      const staff = isMapStaff(standing, userId, parties.ownerId);
+      const forbidden =
+        input.press === 'at-end'
+          ? mayNotArrange(party, userId, staff)
+          : mayNotMove(party, userId, staff);
+      if (forbidden) return refuse(reply, 403, trainRefusal(ctx, forbidden));
+      const throttled = throttledOnTheMap(
+        deps,
+        reply,
+        { control: PARTY_KIND },
+        userId,
+        ACTION_THROTTLE,
+      );
+      if (throttled) return throttled;
+      let answer: TrainChangeAnswer;
+      switch (input.press) {
+        case 'reverse':
+          answer = await reverseRouteAs(ctx, party, member, staff, input.from, input.first);
+          break;
+        case 'at-end':
+          answer = await setAtEndAs(ctx, party, member, staff, input.atEnd, input.from);
+          break;
+        case 'finish':
+          answer = await moveTrainAs(ctx, party, member, 'finish', staff, input.from);
+          break;
+        default:
+          answer = await moveTrainAs(
+            ctx,
+            party,
+            member,
+            input.press,
+            staff,
+            input.from,
+            input.target,
+          );
+      }
+      deps.log.info(
+        { user: userId, guild, party: party.id, move: press, outcome: answer.kind },
+        'a train was moved on the map',
+      );
+      return answered(reply, guild, row, party.id, userId, standing, answer);
+    },
+  );
+
+  // Taking the conductor role or giving it up (spec 3.7), as `/conductor set` and `/conductor
+  // clear` do: the per-address limit, the guard of every POST and a change the map knows (404),
+  // the session (403), the body (whose the role was when the page drew the button; 400), the
+  // checks of every write to a train, a button drawn when the role was another's than it is now
+  // (409, the train as it is now), whether the member may (signed up to take it; the conductor or
+  // staff to give it up or take it off another: 403 in the command's words), and only then the
+  // command's throttle in its window.
+  const knownConductor = async (request: TrainRequest, reply: FastifyReply) => {
+    if (!isConductorChange(request.params.action ?? '')) return sendFailure(request, reply, 404);
+  };
+  scope.post(
+    '/api/trains/:party/conductor/:action',
+    { onRequest: [...writeGuards, knownConductor] },
+    async (request: TrainRequest, reply) => {
+      void reply.header('cache-control', 'no-store');
+      const change = request.params.action ?? '';
+      if (!isConductorChange(change)) return sendFailure(request, reply, 404);
+      const session = await sessions.of(request, reply);
+      if (!session) return sendFailure(request, reply, 403);
+      const body = conductorBodySchema.safeParse(request.body ?? {});
+      if (!body.success) return sendFailure(request, reply, 400);
+      const writing = await trainWrite(
+        request,
+        reply,
+        session.userId,
+        "changed a train's conductor",
+      );
+      if ('sent' in writing) return writing.sent;
+      const { userId, member, standing, row, party } = writing;
+      const { guild } = request.params;
+      if (conductorSeenBy(party, userId) !== body.data.who) {
+        const train = viewOf(guild, row, party, userId, standing);
+        const stale: TrainAnswer = {
+          ok: false,
+          text: CONDUCTOR_CHANGED,
+          ...(train ? { train } : {}),
+        };
+        return reply.code(409).send(stale);
+      }
+      const staff = isMapStaff(standing, userId, parties.ownerId);
+      const forbidden =
+        change === 'take'
+          ? attendeeOf(party, userId) === undefined
+            ? 'not-attending'
+            : undefined
+          : party.train.conductorId === null
+            ? undefined
+            : mayNotClear(party, userId, staff);
+      if (forbidden) return refuse(reply, 403, trainRefusal(ctx, forbidden));
+      const throttled = throttledOnTheMap(
+        deps,
+        reply,
+        { command: change === 'take' ? 'conductor set' : 'conductor clear' },
+        userId,
+        CHANGE_THROTTLE,
+      );
+      if (throttled) return throttled;
+      const answer =
+        change === 'take'
+          ? await setConductorAs(ctx, party, member, CONDUCTOR_BEFORE)
+          : await clearConductorAs(ctx, party, member, staff);
+      deps.log.info(
+        { user: userId, guild, party: party.id, conductor: change, outcome: answer.kind },
+        "a train's conductor was changed on the map",
+      );
+      return answered(reply, guild, row, party.id, userId, standing, answer);
+    },
+  );
+}
+
+/** The map names nobody: a takeover's answer says "the conductor before". */
+const CONDUCTOR_BEFORE: ConductorNamer = () => 'the conductor before';
+
+/** Said of a conductor's button drawn when the role was another's than it is now. */
+const CONDUCTOR_CHANGED = 'The conductor of this train changed meanwhile: here it is as it is now.';
+
+/** Whose the conductor role is as the member sees it (`MapConductor.who`, `none` for nobody). */
+function conductorSeenBy(party: TrainParty, userId: string): ConductorSeen {
+  const { conductorId } = party.train;
+  return conductorId === null ? 'none' : conductorId === userId ? 'you' : 'other';
+}
+
+/** Where the train was when the panel was drawn (`placeOf`), and where a press leads. */
+const place = z.string().min(1).max(20);
+
+/** The body of each press of the panel, as its control carries it: anything else is malformed. */
+const PRESS_BODIES = {
+  move: z.object({ from: place, target: place }).strict(),
+  finish: z.object({ from: place }).strict(),
+  reverse: z.object({ from: place, first: place }).strict(),
+  atEnd: z.object({ from: place, atEnd: z.enum(TRAIN_AT_END) }).strict(),
+} as const;
+
+/** A conductor's change carries whose the role was when the page drew its button. */
+const conductorBodySchema = z.object({ who: z.enum(CONDUCTOR_SEEN) }).strict();
+
+/** A press of the panel with what it carries. */
+type PressInput =
+  | ({ press: 'next' | 'previous' | 'skip' } & z.infer<typeof PRESS_BODIES.move>)
+  | ({ press: 'finish' } & z.infer<typeof PRESS_BODIES.finish>)
+  | ({ press: 'reverse' } & z.infer<typeof PRESS_BODIES.reverse>)
+  | ({ press: 'at-end' } & z.infer<typeof PRESS_BODIES.atEnd>);
+
+/** The press a body is; undefined for a malformed body. */
+function pressInput(press: PanelPress, body: unknown): PressInput | undefined {
+  switch (press) {
+    case 'next':
+    case 'previous':
+    case 'skip': {
+      const parsed = PRESS_BODIES.move.safeParse(body);
+      return parsed.success ? { press, ...parsed.data } : undefined;
+    }
+    case 'finish': {
+      const parsed = PRESS_BODIES.finish.safeParse(body);
+      return parsed.success ? { press, ...parsed.data } : undefined;
+    }
+    case 'reverse': {
+      const parsed = PRESS_BODIES.reverse.safeParse(body);
+      return parsed.success ? { press, ...parsed.data } : undefined;
+    }
+    case 'at-end': {
+      const parsed = PRESS_BODIES.atEnd.safeParse(body);
+      return parsed.success ? { press, ...parsed.data } : undefined;
+    }
+  }
+}
+
+function isPanelPress(value: string): value is PanelPress {
+  return (PANEL_PRESSES as readonly string[]).includes(value);
+}
+
+function isConductorChange(value: string): value is ConductorChange {
+  return (CONDUCTOR_CHANGES as readonly string[]).includes(value);
 }
````

### Task 5: Trains from the map: the page

Prototype commit: `90284154970915af74774621acccf39dc81aa1cc`

"New train" in the side panel; a train's popup gains "Edit route" and "Move…"; route mode (a click on a gym adds a stop without opening its popup; numbered stops built as nodes; up/down and "move to #"; saved routes) sends one edit at a time (`RouteEdits`), keeps the rest of the map live (aside claims) and ends when the train is gone; the Move panel stays open after a move; one form at a time.

**Files:**

```
 src/web/client/main.ts             |  13 +-
 src/web/client/map.css             |  82 ++++++++++
 src/web/client/parties.test.ts     |   6 +
 src/web/client/parties.ts          |  10 +-
 src/web/client/party-layer.ts      | 138 ++++++++++++++++-
 src/web/client/raid-forms.test.ts  |  13 ++
 src/web/client/raid-forms.ts       |  21 ++-
 src/web/client/raid-ui.ts          |   7 +-
 src/web/client/train-forms.test.ts | 507 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-forms.ts      | 631 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-ui.ts         | 447 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 11 files changed, 1855 insertions(+), 20 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/parties.test.ts src/web/client/raid-forms.test.ts src/web/client/train-forms.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/web/client/main.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/raid-forms.test.ts src/web/client/raid-forms.ts src/web/client/raid-ui.ts src/web/client/train-forms.test.ts src/web/client/train-forms.ts src/web/client/train-ui.ts` and `npx eslint src/web/client/main.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/raid-forms.test.ts src/web/client/raid-forms.ts src/web/client/raid-ui.ts src/web/client/train-forms.test.ts src/web/client/train-forms.ts src/web/client/train-ui.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 90284154970915af74774621acccf39dc81aa1cc -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Trains from the map: the page`, the paragraph above as the body and the trailer, staging exactly
  `src/web/client/main.ts src/web/client/map.css src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.ts src/web/client/raid-forms.test.ts src/web/client/raid-forms.ts src/web/client/raid-ui.ts src/web/client/train-forms.test.ts src/web/client/train-forms.ts src/web/client/train-ui.ts`.

````diff
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 54d2c8274568cd31e8ad367780095395d8665b20..0b1ee23251ffbe14b89bc9c4d09a4f9b7ac6e3b3 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -4,7 +4,7 @@ import { addTiles, byId, getJson, say, showAccount } from './common.js';
 import { gymFilter } from './filter.js';
 import { tileLayers } from './layers.js';
 import { loginNotice } from './notice.js';
-import { showParties } from './party-layer.js';
+import { gymClicks, showParties } from './party-layer.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
 import { heldContent } from './raid-forms.js';
 
@@ -25,12 +25,14 @@ const REGION_COLOUR = '#3060c0';
 /**
  * What a gym's popup shows beyond the gym itself, once the page knows who is asking: "Report raid"
  * (plan 8M-4) and "Report spawn here" (plan 8M-4S) for a member, and whether a form is open (the
- * popup's content is held then: `heldContent`). Nothing until then.
+ * popup's content is held then: `heldContent`), and in route mode a click that adds the gym as
+ * a stop instead of opening its popup (plan 8M-5). Nothing until then.
  */
 const gymExtras: {
   of: (gym: MapGym) => HTMLElement[];
   editing: () => boolean;
-} = { of: () => [], editing: () => false };
+  clicked: (gym: MapGym) => boolean;
+} = { of: () => [], editing: () => false, clicked: () => false };
 
 /**
  * Shows the regions and gyms; gives the gyms by id, where the parties are put, the regions'
@@ -75,6 +77,10 @@ async function showGeo(
       ),
     ),
   }));
+  for (const { gym, dot } of dots) {
+    // In route mode a click (or Enter) adds the gym as a stop: its popup is not opened.
+    gymClicks(dot, () => gymExtras.clicked(gym));
+  }
   const gyms = L.featureGroup(dots.map(({ dot }) => dot)).addTo(map);
   const all = regions.getBounds().isValid() ? regions.getBounds() : gyms.getBounds();
   if (all.isValid()) map.fitBounds(all);
@@ -135,6 +141,7 @@ function start(): void {
       const raids = showParties(map, guild, me, gyms, names, regions, mayReport);
       gymExtras.editing = () => raids.editing();
       gymExtras.of = (gym) => raids.gymControls(gym);
+      gymExtras.clicked = (gym) => raids.gymClicked(gym);
     })
     .catch(() => say('The map could not be loaded. Try again in a moment.'));
 }
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 27de8e8a131154d93d54c47f1c5ca0261d7d9e96..7c3226bff88fd0e52e7ef80a6e607c2809a2c893 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -281,3 +281,85 @@ body {
 .raid-form .form-answer {
   color: #8a3b00;
 }
+
+/* Trains from the map (plan 8M-5): "New train", a train's actions, route mode, the panel. */
+.train-tools {
+  margin-bottom: 8px;
+}
+
+.new-train,
+.train-actions .press {
+  margin-top: 6px;
+  padding: 3px 10px;
+  border: 1px solid #8a94a6;
+  border-radius: 4px;
+  background: #fff;
+  font: inherit;
+  cursor: pointer;
+}
+
+.new-train:disabled,
+.train-actions .press:disabled {
+  opacity: 0.5;
+  cursor: default;
+}
+
+.train-actions {
+  display: flex;
+  flex-wrap: wrap;
+  gap: 4px;
+}
+
+.party-popup .conductor,
+.raid-form .hint {
+  margin: 0;
+  color: #555;
+}
+
+.route-editor .form-buttons,
+.move-panel .form-buttons {
+  flex-wrap: wrap;
+}
+
+.route-stops {
+  margin: 0;
+  padding-left: 0;
+  list-style: none;
+}
+
+.route-stop {
+  display: flex;
+  align-items: center;
+  gap: 4px;
+  padding: 2px 0;
+}
+
+.route-stop .stop-name {
+  flex: 1;
+}
+
+.route-stop.here .stop-name {
+  font-weight: 600;
+}
+
+.route-stop .press {
+  margin-top: 0;
+  padding: 1px 6px;
+}
+
+.stop-number {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  border-radius: 50%;
+  background: #fff;
+  box-shadow: 0 0 0 2px #d35400;
+  font-size: 12px;
+  font-weight: 600;
+  color: #6b2a00;
+}
+
+.stop-number.here {
+  background: #d35400;
+  color: #fff;
+}
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index b8b3eff028c0b55f33841077b339a274b086c7f8..e812ef42a0b25b1359f85eda01a0498c5b867a93 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -311,6 +311,12 @@ describe('trainPopup and meetupItem', () => {
       panel: null,
       conductor: { who: null, mayTake: false, mayDrop: false },
     };
+    // What the member may do of the train on the map comes before the post.
+    const extra = { tag: 'button', text: 'Edit route' };
+    expect(texts(trainPopup(train, context, [extra])).slice(-2)).toEqual([
+      'Edit route',
+      'Open the post',
+    ]);
     expect(texts(trainPopup(train, context))).toEqual([
       'Saturday <b>legendaries</b>',
       'Starts at 3:00 PM',
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 00ff688077e2bde09f6e66d35102f7bce5910f64..5631f142ea0e3c50d15032f2c4fc4843111077ff 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -265,9 +265,14 @@ function stopLine(train: MapTrain, context: ShowContext): string {
 
 /**
  * A train's popup: its name, start, where it is (with the address line and Directions of the
- * stop it is at), who comes, the buttons, the post.
+ * stop it is at), who comes, the buttons, then `extras` (what the member may do of its route,
+ * its moves and its conductor on the map, plan 8M-5: `trainActions`), the post.
  */
-export function trainPopup(train: MapTrain, context: ShowContext): PageNode {
+export function trainPopup(
+  train: MapTrain,
+  context: ShowContext,
+  extras: readonly PageNode[] = [],
+): PageNode {
   const at = train.stop === null ? undefined : context.gym(train.route[train.stop] ?? null);
   return {
     tag: 'div',
@@ -280,6 +285,7 @@ export function trainPopup(train: MapTrain, context: ShowContext): PageNode {
       div('stop', stopLine(train, context)),
       ...wayTo(at),
       ...attendanceNodes(train.id, train.attendance),
+      ...extras,
       ...postLink(train.link),
     ],
   };
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 33ab5735dfd43307df7e40c6ded35f8545554bdb..d38e7264c20ae6d24f962d3f53c63092829df95c 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -1,6 +1,6 @@
 import * as L from 'leaflet';
 import type { GeoView } from '../../domain/web/geo-data.js';
-import type { PartiesView } from '../../domain/web/party-data.js';
+import type { MapTrain, PartiesView } from '../../domain/web/party-data.js';
 import { byId, getJson, say } from './common.js';
 import type { Me } from './notice.js';
 import {
@@ -21,6 +21,8 @@ import { FormHold, OpenPopup, reportBox, reportOffered } from './raid-forms.js';
 import { formControls, raidUi } from './raid-ui.js';
 import { spawnBox, spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
+import { drawnTrains, newTrainButton, routeMarkers, trainActions } from './train-forms.js';
+import { trainUi } from './train-ui.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -43,6 +45,26 @@ const ICON_SIZE = 36;
 /** Makes the elements of a node; a click on a button in them presses it. */
 type Draw = (node: PageNode) => HTMLElement;
 
+/**
+ * A gym's layer (its dot, or the marker of its raids) whose bound popup is opened by our own
+ * handler: Leaflet opens a bound popup on a click, and on Enter on a focused marker, before any
+ * handler of ours runs, so the handlers `bindPopup` added are taken off and a click or Enter
+ * either is taken by `routeClick` (in route mode it adds the gym as a stop: true, no popup) or
+ * opens the popup (plan 8M-5). Call it after `bindPopup`.
+ */
+export function gymClicks(layer: L.Layer, routeClick: () => boolean): void {
+  layer.off('click').off('keypress');
+  const clicked = (event: L.LeafletEvent): void => {
+    // As Leaflet's own: the click is the layer's, not the map's.
+    L.DomEvent.stop(event);
+    if (!routeClick()) layer.openPopup();
+  };
+  layer.on('click', clicked);
+  layer.on('keypress', (event: L.LeafletKeyboardEvent) => {
+    if (event.originalEvent.key === 'Enter') clicked(event);
+  });
+}
+
 /**
  * What the map page's gym dots need of the parties: "Report raid" and "Report spawn here", and
  * whether a form is open.
@@ -55,6 +77,11 @@ export interface MapRaids {
   gymControls(gym: MapGym): HTMLElement[];
   /** A form is open in the popup that is open: its content is held (`heldContent`). */
   editing(): boolean;
+  /**
+   * A gym clicked on the map: in route mode it is added as the next stop of the train being
+   * arranged, and true says its popup is not wanted (plan 8M-5).
+   */
+  gymClicked(gym: MapGym): boolean;
 }
 
 /**
@@ -75,6 +102,10 @@ export function showParties(
 ): MapRaids {
   const layer = L.layerGroup().addTo(map);
   const panel = byId('parties');
+  /** The trains' box at the top of the side panel: "New train", or the form or editor open. */
+  const tools = document.createElement('div');
+  tools.className = 'train-tools';
+  tools.append(renderNode(newTrainButton(), document));
   const readOnly = byId('read-only');
   let csrf = me.csrf;
   let shown = '';
@@ -88,7 +119,8 @@ export function showParties(
    * A raid form is open, one at a time: the popup's content is held (Leaflet's `update()` would
    * draw it anew and wipe the form), the list is not drawn anew under it but once it closes
    * (after its popup closed, once Leaflet is through with the close), and the controls that open
-   * the other forms are off meanwhile.
+   * the other forms are off meanwhile. Under a form of the trains' box (the start form, route
+   * mode), which a redraw keeps, the list is drawn (`aside`).
    */
   const hold = new FormHold<PartiesView>({
     draw: (next) => {
@@ -149,6 +181,14 @@ export function showParties(
       } else if (target.dataset.spawn !== undefined) {
         const gym = gyms.get(Number(target.dataset.spawn));
         if (gym) spawnForms.spawnClicked(target, gym);
+      } else if (
+        target.dataset.routeTrain !== undefined ||
+        target.dataset.moveTrain !== undefined ||
+        target.dataset.conductor !== undefined
+      ) {
+        const id = target.dataset.routeTrain ?? target.dataset.moveTrain ?? target.dataset.train;
+        const train = view?.trains.find((each) => each.id === id);
+        if (train) trainForms.actionClicked(target, train);
       } else if (target.dataset.party !== undefined && target.dataset.action !== undefined) {
         void press(target);
       }
@@ -198,13 +238,19 @@ export function showParties(
       withPopup(marker, `gym:${gymId}`, () => gymRaidsPopup(gymId, raids, context(), extras)).addTo(
         layer,
       );
+      // In route mode a gym with raids is a stop to add like any other, its popup not opened.
+      gymClicks(marker, () => trainForms.gymClicked(gym));
     }
-    for (const train of next.trains) {
+    // Trains the map cannot draw (no route yet, or none of its gyms on the map) are listed; the
+    // train being routed is left to route mode, which draws its stops as they are edited.
+    const unplaced: MapTrain[] = [];
+    for (const train of drawnTrains(next.trains, trainForms.routing()?.id)) {
       const places = train.route.flatMap((id) => {
         const gym = gyms.get(id);
         return gym ? [L.latLng(gym.lat, gym.lon)] : [];
       });
-      const popup = () => trainPopup(train, context());
+      const popup = () => trainPopup(train, context(), trainActions(train));
+      if (places.length === 0) unplaced.push(train);
       if (places.length > 1) {
         withPopup(
           L.polyline(places, { color: TRAIN_COLOUR, weight: 4, opacity: 0.8 }),
@@ -224,20 +270,29 @@ export function showParties(
     }
     const items = [
       ...next.meetups.map((meetup) => meetupItem(meetup, context())),
+      ...unplaced.map((train): PageNode => ({
+        ...trainPopup(train, context(), trainActions(train)),
+        tag: 'li',
+      })),
       ...elsewhere.map((raid): PageNode => ({ ...raidPopup(raid, context()), tag: 'li' })),
     ];
-    panel.replaceChildren();
+    // "New train" (or the form or route editor open in its place) for a member who may; a form
+    // open there stays whatever the list says.
+    const offered = reportOffered(mayReport, next) || trainForms.inTools();
+    panel.replaceChildren(...(offered ? [tools] : []));
     if (items.length > 0) {
       const heading = document.createElement('h2');
       heading.textContent = 'Meetups and other parties';
       const list = draw({ tag: 'ul', className: 'party-list', children: items });
       panel.append(heading, list);
     }
-    panel.hidden = items.length === 0;
+    panel.hidden = items.length === 0 && !offered;
     map.invalidateSize();
     const line = readOnlyLine(next.readOnly);
     readOnly.textContent = line ?? '';
     readOnly.hidden = line === undefined;
+    // Drawn under a form of the trains' box: the controls that open another form stay off.
+    if (hold.editing) formControls(document, false);
     if (reopen !== undefined) popups.get(reopen)?.openPopup();
   };
 
@@ -306,6 +361,76 @@ export function showParties(
     spawnForms.spawnAt(spawnPoint(event.latlng.lat, event.latlng.lng));
   });
 
+  // Trains (plan 8M-5): "New train" in the side panel, route mode (the editor in the side panel,
+  // the stops numbered on the map, a gym clicked added as the next stop), the Move train panel in
+  // a train's popup, the conductor's buttons; held like the raid forms. After a success the list
+  // at once, and the train's popup opened.
+  const routeLayer = L.layerGroup().addTo(map);
+  const trainForms = trainUi({
+    guild,
+    csrf: {
+      get: () => csrf,
+      set: (token) => {
+        csrf = token;
+      },
+    },
+    regions,
+    gyms,
+    hold,
+    tools,
+    overlay: {
+      show: (train) => {
+        routeLayer.clearLayers();
+        const stops = routeMarkers(train).flatMap((stop) => {
+          const gym = gyms.get(stop.gymId);
+          return gym ? [{ ...stop, gym }] : [];
+        });
+        if (stops.length > 1) {
+          L.polyline(
+            stops.map(({ gym }) => L.latLng(gym.lat, gym.lon)),
+            { color: TRAIN_COLOUR, weight: 4, dashArray: '6 6', interactive: false },
+          ).addTo(routeLayer);
+        }
+        for (const { gym, number, here } of stops) {
+          // The number as text of an element of ours: Leaflet sets a string as HTML.
+          const label = document.createElement('span');
+          label.textContent = String(number);
+          L.marker([gym.lat, gym.lon], {
+            icon: L.divIcon({
+              html: label,
+              className: here ? 'stop-number here' : 'stop-number',
+              iconSize: [22, 22],
+            }),
+            interactive: false,
+            keyboard: false,
+          }).addTo(routeLayer);
+        }
+      },
+      clear: () => {
+        routeLayer.clearLayers();
+      },
+    },
+    closePopup: () => {
+      map.closePopup();
+    },
+    done: async (train) => {
+      if (train) {
+        map.closePopup();
+        showing.openNext(`train:${train.id}`);
+      }
+      await poller.now();
+      const open = showing.key;
+      if (open !== undefined) popups.get(open)?.openPopup();
+    },
+    refresh: () => poller.now(),
+  });
+  tools.addEventListener('click', (event) => {
+    const target = event.target;
+    if (target instanceof HTMLButtonElement && target.dataset.newTrain !== undefined) {
+      trainForms.newTrainClicked();
+    }
+  });
+
   const poller = new Poller({
     everyMs: EVERY_MS,
     visible: () => document.visibilityState === 'visible',
@@ -350,5 +475,6 @@ export function showParties(
         ? [raidForms.reportControl(gym), spawnForms.spawnControl(gym)]
         : [],
     editing: () => hold.editing,
+    gymClicked: (gym) => trainForms.gymClicked(gym),
   };
 }
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
index ae550550e01329c33dc92b18ffd5304019cdfddb..5f73d20af9c662b8d2c0e4407d569f0b205ce221 100644
--- a/src/web/client/raid-forms.test.ts
+++ b/src/web/client/raid-forms.test.ts
@@ -402,6 +402,19 @@ describe('a form open in a popup (FormHold)', () => {
     hold.release(claim);
     expect(views()).toEqual(['second']);
   });
+
+  it("draws the list under a form of the trains' box, which a redraw keeps, and still opens no other form", () => {
+    const { views, controls, hold } = holding();
+    const claim = hold.take(false, true);
+    if (!claim) throw new Error('no claim');
+    hold.shown('second');
+    expect(views()).toEqual(['second']);
+    expect(hold.editing).toBe(true);
+    expect(hold.take(true)).toBeUndefined();
+    hold.release(claim);
+    expect(views()).toEqual(['second']);
+    expect(controls).toEqual([false, true]);
+  });
 });
 
 describe('the form of a change (changeForm)', () => {
diff --git a/src/web/client/raid-forms.ts b/src/web/client/raid-forms.ts
index dee533dfd8e9276a37205c08c5818f23385049d3..fd9e5724a45b7cf2d15028f176b11254eb41d237 100644
--- a/src/web/client/raid-forms.ts
+++ b/src/web/client/raid-forms.ts
@@ -388,10 +388,13 @@ export interface FormHoldDeps<V> {
 
 /**
  * The claim of one form on the hold (`FormHold.take`), from the click that opens it until it
- * closes: in a popup, or in the side panel (which no popup's closing takes away).
+ * closes: in a popup, or in the side panel (which no popup's closing takes away). `aside`: in
+ * the trains' box at the top of the side panel (the start form, route mode), which a redraw of
+ * the list keeps, so the list is drawn under it (plan 8M-5).
  */
 export interface FormClaim {
   readonly inPopup: boolean;
+  readonly aside?: boolean;
 }
 
 /**
@@ -419,16 +422,22 @@ export class FormHold<V> {
     return heldContent(draw, () => this.editing);
   }
 
-  /** A new list: drawn now, or once no form is open. */
+  /**
+   * A new list: drawn now, or once no form is open; under a form of the trains' box (`aside`),
+   * which the redraw keeps, now.
+   */
   shown(view: V): void {
-    if (this.editing) this.waiting = { view };
+    if (this.editing && this.holder?.aside !== true) this.waiting = { view };
     else this.deps.draw(view);
   }
 
-  /** A form is being opened: its claim, or none while another form holds. */
-  take(inPopup: boolean): FormClaim | undefined {
+  /**
+   * A form is being opened: its claim, or none while another form holds. `aside`: a form of the
+   * trains' box (`FormClaim.aside`).
+   */
+  take(inPopup: boolean, aside = false): FormClaim | undefined {
     if (this.holder) return undefined;
-    const claim: FormClaim = { inPopup };
+    const claim: FormClaim = aside ? { inPopup, aside } : { inPopup };
     this.holder = claim;
     this.deps.controls(false);
     return claim;
diff --git a/src/web/client/raid-ui.ts b/src/web/client/raid-ui.ts
index 86abe1c66709db05444ba08c275f9f7c3db15c5d..489aad48a0f8e588e4a4ec58cf8ae664254fb141 100644
--- a/src/web/client/raid-ui.ts
+++ b/src/web/client/raid-ui.ts
@@ -45,12 +45,13 @@ export interface RaidUiDeps {
 }
 
 /**
- * The controls that open a form ("Report raid", "Change…", "Report spawn here") under `root`, on
- * or off.
+ * The controls that open a form ("Report raid", "Change…", "Report spawn here", and of trains
+ * "New train", "Edit route", "Move…") under `root`, on or off.
  */
 export function formControls(root: ParentNode, on: boolean): void {
   for (const button of root.querySelectorAll<HTMLButtonElement>(
-    'button[data-report], button[data-change-raid], button[data-spawn]',
+    'button[data-report], button[data-change-raid], button[data-spawn], ' +
+      'button[data-new-train], button[data-route-train], button[data-move-train]',
   )) {
     button.disabled = !on;
   }
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1bd0961a89f005c975d7b7fc5fe78dadc289aa7c
--- /dev/null
+++ b/src/web/client/train-forms.test.ts
@@ -0,0 +1,507 @@
+import { describe, expect, it } from 'vitest';
+import type { MapTrain } from '../../domain/web/party-data.js';
+import type { Me } from './notice.js';
+import type { PressSteps } from './parties.js';
+import type { MapGym, PageNode } from './popup.js';
+import {
+  conductorBody,
+  drawnTrains,
+  movePanel,
+  newTrainButton,
+  pressBody,
+  routeEditBody,
+  routeEditor,
+  RouteEdits,
+  routeMarkers,
+  routeModeEnds,
+  sendTrainForm,
+  startBody,
+  startForm,
+  stopName,
+  trainActions,
+  trainAnswerOf,
+  type TrainBody,
+} from './train-forms.js';
+
+const gymOf = (id: number, name: string, nickname: string | null = null): MapGym => ({
+  id,
+  name,
+  nickname,
+  lat: 40.05,
+  lon: -80.05,
+  regionIds: [1],
+  address: null,
+  description: null,
+  notice: null,
+});
+
+const GYMS = new Map([
+  [4, gymOf(4, 'Veterans Memorial Bridge')],
+  [1, gymOf(1, 'Pinewood Public Library', 'The Stacks')],
+  [7, gymOf(7, 'Harbor Lighthouse Mural')],
+]);
+const gym = (id: number) => GYMS.get(id);
+
+const train = (more: Partial<MapTrain> = {}): MapTrain => ({
+  kind: 'train',
+  id: 't1',
+  name: 'Saturday legendaries',
+  startTime: null,
+  route: [4, 1, 7],
+  stop: 1,
+  link: 'https://discord.com/channels/1/2',
+  attendance: {
+    groups: [{ id: 'A', interested: 1, coming: 1, present: 0 }],
+    mine: null,
+    actions: [],
+  },
+  may: { arrange: true, clear: false, load: true },
+  panel: {
+    place: '1',
+    moves: [
+      { move: 'next', target: '7' },
+      { move: 'previous', target: '4' },
+      { move: 'finish', target: 'end' },
+    ],
+    reverse: null,
+    atEnd: 'finish',
+  },
+  conductor: { who: null, mayTake: true, mayDrop: false },
+  ...more,
+});
+
+/** Every node of a tree, depth first. */
+function all(node: PageNode): PageNode[] {
+  return [node, ...(node.children ?? []).flatMap(all)];
+}
+const byName = (node: PageNode, name: string) =>
+  all(node).find((one) => one.attributes?.name === name);
+const buttons = (nodes: PageNode | PageNode[]) =>
+  (Array.isArray(nodes) ? nodes : [nodes])
+    .flatMap(all)
+    .filter((one) => one.tag === 'button')
+    .map((one): [string | undefined, Record<string, string> | undefined] => [
+      one.text,
+      one.attributes,
+    ]);
+const texts = (node: PageNode) =>
+  all(node)
+    .filter((one) => one.text !== undefined && one.tag !== 'button' && one.tag !== 'option')
+    .map((one) => one.text);
+
+describe('starting a train (startForm, startBody)', () => {
+  it("asks for the name, the region (any of the server's), the start and the mode, as /train and /meet take them", () => {
+    const form = startForm([
+      { id: 1, name: 'west' },
+      { id: 2, name: 'east' },
+    ]);
+    expect(form.attributes).toEqual({ 'data-form': 'train' });
+    expect(byName(form, 'name')?.attributes).toMatchObject({ maxlength: '80' });
+    expect(byName(form, 'time')?.attributes).toMatchObject({ maxlength: '40' });
+    expect(
+      all(byName(form, 'region') ?? { tag: 'none' })
+        .filter((one) => one.tag === 'option')
+        .map((one) => [one.attributes?.value, one.text]),
+    ).toEqual([
+      ['', 'Pick the region'],
+      ['1', 'west'],
+      ['2', 'east'],
+    ]);
+    expect(
+      all(byName(form, 'atEnd') ?? { tag: 'none' })
+        .filter((one) => one.attributes?.selected !== undefined)
+        .map((one) => one.attributes?.value),
+    ).toEqual(['finish']);
+    expect(newTrainButton().children?.[0]?.attributes).toMatchObject({ 'data-new-train': '' });
+  });
+
+  it('makes the body of a new train, or says what is missing', () => {
+    expect(
+      startBody({ name: ' Park loop ', region: '2', time: ' 6:15pm ', atEnd: 'loop' }),
+    ).toEqual({
+      body: { name: 'Park loop', region: 2, time: '6:15pm', atEnd: 'loop' },
+    });
+    expect(startBody({ name: 'Park loop', region: '1', time: '', atEnd: 'finish' })).toEqual({
+      body: { name: 'Park loop', region: 1 },
+    });
+    expect(startBody({ name: ' ', region: '1', time: '', atEnd: 'finish' })).toEqual({
+      text: 'Give the train a name first.',
+    });
+    expect(startBody({ name: 'Park loop', region: '', time: '', atEnd: 'finish' })).toEqual({
+      text: 'Pick the region first.',
+    });
+  });
+});
+
+describe("a train's actions in its popup (trainActions)", () => {
+  it('offers Edit route, Move… and the conductor role as the member may, naming nobody', () => {
+    expect(buttons(trainActions(train()))).toEqual([
+      ['Edit route', { type: 'button', 'data-route-train': 't1' }],
+      ['Move…', { type: 'button', 'data-move-train': 't1' }],
+      ['Be the conductor', { type: 'button', 'data-conductor': 'take', 'data-train': 't1' }],
+    ]);
+    const conducting = train({ conductor: { who: 'you', mayTake: false, mayDrop: true } });
+    expect(trainActions(conducting).map((node) => node.text)).toContain('You are its conductor.');
+    expect(buttons(trainActions(conducting)).map(([text]) => text)).toContain(
+      'Stop being the conductor',
+    );
+    const staff = train({ conductor: { who: 'other', mayTake: false, mayDrop: true } });
+    expect(buttons(trainActions(staff)).map(([text]) => text)).toContain('Take the conductor off');
+  });
+
+  it("makes a conductor button's body of whose the role was when the train was drawn", () => {
+    expect(conductorBody(train())).toEqual({ who: 'none' });
+    expect(
+      conductorBody(train({ conductor: { who: 'you', mayTake: false, mayDrop: true } })),
+    ).toEqual({ who: 'you' });
+    expect(
+      conductorBody(train({ conductor: { who: 'other', mayTake: true, mayDrop: false } })),
+    ).toEqual({ who: 'other' });
+  });
+
+  it('leaves the line of the train being routed off the map: route mode draws it', () => {
+    const other = train({ id: 't2' });
+    expect(drawnTrains([train(), other], undefined)).toEqual([train(), other]);
+    expect(drawnTrains([train(), other], 't1')).toEqual([other]);
+  });
+
+  it('offers nothing to who may do nothing of it', () => {
+    const watching = train({
+      may: { arrange: false, clear: false, load: false },
+      panel: null,
+      conductor: { who: 'other', mayTake: false, mayDrop: false },
+    });
+    expect(trainActions(watching)).toEqual([
+      { tag: 'div', className: 'conductor', text: 'It has a conductor.' },
+    ]);
+  });
+});
+
+describe('route mode (routeEditor, routeMarkers, routeEditBody)', () => {
+  it('numbers the stops as the route is stored, the one the train is at marked', () => {
+    expect(routeMarkers(train())).toEqual([
+      { gymId: 4, number: 1, here: false },
+      { gymId: 1, number: 2, here: true },
+      { gymId: 7, number: 3, here: false },
+    ]);
+    expect(stopName(gym(1), 1)).toBe('The Stacks');
+    expect(stopName(undefined, 99)).toBe('Gym 99');
+  });
+
+  it("lists the stops with up, down and remove, the member's saved routes, and what they may", () => {
+    const editor = routeEditor(train(), gym, [
+      { id: 5, name: 'Downtown', stops: 3, atEnd: 'loop' },
+      { id: 6, name: '', stops: 1, atEnd: 'finish' },
+    ]);
+    expect(editor.attributes).toEqual({ 'data-form': 'route', 'data-party': 't1' });
+    expect(texts(editor)).toEqual(
+      expect.arrayContaining([
+        'Route of Saturday legendaries',
+        '1. Veterans Memorial Bridge',
+        '2. The Stacks (the train is here)',
+        '3. Harbor Lighthouse Mural',
+      ]),
+    );
+    const moves = all(editor).filter((one) => one.attributes?.['data-edit'] === 'move');
+    expect(
+      moves.map((one) => [
+        one.attributes?.['data-from'],
+        one.attributes?.['data-to'],
+        one.attributes?.disabled,
+      ]),
+    ).toEqual([
+      ['1', '0', ''],
+      ['1', '2', undefined],
+      ['2', '1', undefined],
+      ['2', '3', undefined],
+      ['3', '2', undefined],
+      ['3', '4', ''],
+    ]);
+    expect(
+      all(byName(editor, 'route') ?? { tag: 'none' })
+        .filter((one) => one.tag === 'option')
+        .map((one) => one.text),
+    ).toEqual(['Pick a saved route', 'Downtown (3 stops, loops)', 'Without a name (1 stop)']);
+    const edits = all(editor).flatMap((one) => one.attributes?.['data-edit'] ?? []);
+    expect(new Set(edits)).toEqual(new Set(['move', 'remove', 'load', 'forget', 'save']));
+  });
+
+  it('offers each stop a move to any position, so that a move is one edit', () => {
+    const editor = routeEditor(train(), gym, []);
+    const selects = all(editor).filter((one) => one.attributes?.['data-move-from'] !== undefined);
+    expect(
+      selects.map((one) => [
+        one.attributes?.['data-move-from'],
+        one.attributes?.['aria-label'],
+        (one.children ?? []).map((choice) => [
+          choice.attributes?.value,
+          choice.text,
+          choice.attributes?.selected,
+        ]),
+      ]),
+    ).toEqual([
+      [
+        '1',
+        'Move stop 1 to',
+        [
+          ['1', '#1', ''],
+          ['2', '#2', undefined],
+          ['3', '#3', undefined],
+        ],
+      ],
+      [
+        '2',
+        'Move stop 2 to',
+        [
+          ['1', '#1', undefined],
+          ['2', '#2', ''],
+          ['3', '#3', undefined],
+        ],
+      ],
+      [
+        '3',
+        'Move stop 3 to',
+        [
+          ['1', '#1', undefined],
+          ['2', '#2', undefined],
+          ['3', '#3', ''],
+        ],
+      ],
+    ]);
+    // Stop 3 picked to be first: one move, as `/route move from:3 to:1`.
+    expect(routeEditBody('move', train(), { from: '3', to: '1' })).toEqual({
+      body: { drawn: [4, 1, 7], from: 3, to: 1 },
+    });
+  });
+
+  it('leaves the stops without their buttons for who may no longer arrange the route', () => {
+    const editor = routeEditor(
+      train({ may: { arrange: false, clear: false, load: false } }),
+      gym,
+      [],
+    );
+    expect(texts(editor)).toContain('2. The Stacks (the train is here)');
+    const edits = all(editor).flatMap((one) => one.attributes?.['data-edit'] ?? []);
+    expect(edits).not.toContain('move');
+    expect(edits).not.toContain('remove');
+    expect(all(editor).some((one) => one.attributes?.['data-move-from'] !== undefined)).toBe(false);
+  });
+
+  it('ends route mode on an answer that says the train is gone, and on no other', () => {
+    expect(routeModeEnds({ ok: false, status: 409 })).toBe(true);
+    // Refused, with the train as it is now: drawn again.
+    expect(routeModeEnds({ ok: false, status: 409, train: train() })).toBe(false);
+    expect(routeModeEnds({ ok: false, status: 422, train: train() })).toBe(false);
+    // Too many clicks, a broken connection: route mode stays.
+    expect(routeModeEnds({ ok: false, status: 429 })).toBe(false);
+    expect(routeModeEnds({ ok: false })).toBe(false);
+    expect(routeModeEnds({ ok: true, status: 200, train: train() })).toBe(false);
+  });
+
+  it('offers Clear to who may clear, and Load only to who may load', () => {
+    const leading = routeEditor(
+      train({ may: { arrange: true, clear: true, load: false } }),
+      gym,
+      [],
+    );
+    const edits = all(leading).flatMap((one) => one.attributes?.['data-edit'] ?? []);
+    expect(edits).toContain('clear');
+    expect(edits).not.toContain('load');
+    expect(texts(leading)).toContain('You have no saved routes for this region.');
+    const loading = routeEditor(train({ route: [], stop: null }), gym, undefined);
+    expect(texts(loading)).toEqual(
+      expect.arrayContaining(['No stops yet.', 'Loading your saved routes…']),
+    );
+    expect(byName(loading, 'name')).toBeUndefined();
+  });
+
+  it('makes the body of each edit with the route it was drawn from, or says what is missing', () => {
+    const drawn = [4, 1, 7];
+    expect(routeEditBody('add', train(), { gym: 2 })).toEqual({ body: { drawn, gym: 2 } });
+    expect(routeEditBody('remove', train(), { stop: '3' })).toEqual({ body: { drawn, stop: 3 } });
+    expect(routeEditBody('move', train(), { from: '3', to: '2' })).toEqual({
+      body: { drawn, from: 3, to: 2 },
+    });
+    expect(routeEditBody('clear', train(), {})).toEqual({ body: { drawn } });
+    expect(routeEditBody('save', train(), { name: ' Downtown ' })).toEqual({
+      body: { drawn, name: 'Downtown' },
+    });
+    expect(routeEditBody('save', train(), { name: '' })).toEqual({
+      text: 'Give the route a name first.',
+    });
+    expect(routeEditBody('load', train(), { route: '5' })).toEqual({ body: { drawn, route: 5 } });
+    expect(routeEditBody('forget', train(), { route: '5' })).toEqual({ body: { route: 5 } });
+    expect(routeEditBody('load', train(), { route: '' })).toEqual({
+      text: 'Pick one of your saved routes first.',
+    });
+  });
+});
+
+describe('the edits of route mode, one at a time (RouteEdits)', () => {
+  /** An edit sent and waiting for its answer, which the test gives. */
+  interface Waiting {
+    edit: string;
+    body: TrainBody;
+    answer: (next: MapTrain | undefined) => void;
+  }
+
+  /**
+   * Route mode over a fake that keeps each edit sent until the test answers it; `sendsCame(n)`
+   * resolves once `n` edits have been sent in all.
+   */
+  const editing = () => {
+    let shown: MapTrain | undefined = train({ route: [4], stop: 0 });
+    const sent: Waiting[] = [];
+    const waiters: Array<{ count: number; resolve: () => void }> = [];
+    const busy: boolean[] = [];
+    const edits = new RouteEdits({
+      train: () => shown,
+      send: (edit, body) =>
+        new Promise<void>((done) => {
+          sent.push({
+            edit,
+            body,
+            answer: (next) => {
+              shown = next;
+              done();
+            },
+          });
+          for (const waiter of waiters.filter(({ count }) => count <= sent.length)) {
+            waiter.resolve();
+          }
+        }),
+      busy: (on) => busy.push(on),
+    });
+    const sendsCame = (count: number): Promise<void> =>
+      sent.length >= count
+        ? Promise.resolve()
+        : new Promise((resolve) => waiters.push({ count, resolve }));
+    return { edits, sent, sendsCame, busy, end: () => (shown = undefined) };
+  };
+
+  it('sends gym clicks one after the other, each drawn from the route the answer before gave', async () => {
+    const { edits, sent, sendsCame, busy } = editing();
+    const first = edits.add('add', { gym: 1 });
+    const second = edits.add('add', { gym: 7 });
+    expect(edits.busy).toBe(true);
+    expect(busy).toEqual([true]);
+    await sendsCame(1);
+    expect(sent.map(({ body }) => body)).toEqual([{ body: { drawn: [4], gym: 1 } }]);
+    sent[0]?.answer(train({ route: [4, 1], stop: 0 }));
+    await first;
+    await sendsCame(2);
+    expect(sent.map(({ body }) => body)).toEqual([
+      { body: { drawn: [4], gym: 1 } },
+      { body: { drawn: [4, 1], gym: 7 } },
+    ]);
+    sent[1]?.answer(train({ route: [4, 1, 7], stop: 0 }));
+    await second;
+    expect(edits.busy).toBe(false);
+    expect(busy).toEqual([true, false]);
+  });
+
+  it('drops what waits once route mode ends', async () => {
+    const { edits, sent, sendsCame, busy, end } = editing();
+    const first = edits.add('add', { gym: 1 });
+    const second = edits.add('add', { gym: 7 });
+    await sendsCame(1);
+    end();
+    sent[0]?.answer(undefined);
+    await Promise.all([first, second]);
+    expect(sent).toHaveLength(1);
+    expect(busy).toEqual([true, false]);
+  });
+});
+
+describe('the Move train panel (movePanel, pressBody)', () => {
+  it('says where the train is and offers the moves that can be made, each with where it leads', () => {
+    const panel = movePanel(train(), gym);
+    expect(panel?.attributes).toEqual({ 'data-form': 'move', 'data-party': 't1' });
+    expect(texts(panel ?? { tag: 'none' })).toContain('At stop 2 of 3: The Stacks');
+    expect(
+      buttons(panel ?? { tag: 'none' }).map(([text, attributes]) => [
+        text,
+        attributes?.['data-press'],
+        attributes?.['data-target'],
+      ]),
+    ).toEqual([
+      ['Next', 'next', '7'],
+      ['Previous', 'previous', '4'],
+      ['Finish', 'finish', 'end'],
+      ['Set', 'at-end', undefined],
+      ['Done', undefined, undefined],
+    ]);
+    const finished = movePanel(
+      train({
+        stop: null,
+        panel: {
+          place: 'end',
+          moves: [{ move: 'previous', target: '7' }],
+          reverse: '4',
+          atEnd: 'loop',
+        },
+      }),
+      gym,
+    );
+    expect(texts(finished ?? { tag: 'none' })).toContain('The route of 3 stops is finished.');
+    expect(buttons(finished ?? { tag: 'none' }).map(([text]) => text)).toContain(
+      'Reverse the route',
+    );
+    expect(movePanel(train({ panel: null }), gym)).toBeUndefined();
+  });
+
+  it('makes the body of a press: where the panel was drawn and what the button carries', () => {
+    const { panel } = train();
+    if (!panel) throw new Error('no panel');
+    expect(pressBody(panel, 'next', { target: '7' })).toEqual({ from: '1', target: '7' });
+    expect(pressBody(panel, 'finish', { target: 'end' })).toEqual({ from: '1' });
+    expect(pressBody(panel, 'reverse', { first: '4' })).toEqual({ from: '1', first: '4' });
+    expect(pressBody(panel, 'at-end', { atEnd: 'loop' })).toEqual({ from: '1', atEnd: 'loop' });
+  });
+});
+
+describe("a train's answer (trainAnswerOf, sendTrainForm)", () => {
+  it('takes whether it was done and the train as the server gives it', () => {
+    expect(trainAnswerOf({ ok: true, text: 'Done.', train: train() })).toEqual({
+      ok: true,
+      train: train(),
+    });
+    expect(trainAnswerOf({ ok: false, text: 'No.' })).toEqual({ ok: false });
+    expect(trainAnswerOf({ ok: true, train: { id: 3 } })).toEqual({ ok: true });
+    expect(trainAnswerOf('nonsense')).toEqual({ ok: false });
+  });
+
+  it('sends with a token renewed once after a 403 of a stale one, and says the answer', async () => {
+    const tokens: string[] = [];
+    const steps: PressSteps = {
+      post: (token) => {
+        tokens.push(token);
+        return Promise.resolve(
+          token === 'old'
+            ? { status: 403, body: { error: 'Not allowed.' } }
+            : {
+                status: 200,
+                body: { ok: true, text: 'Old Stone Fountain is stop 4.', train: train() },
+              },
+        );
+      },
+      me: () =>
+        Promise.resolve({
+          loggedIn: true,
+          name: 'Alice',
+          member: true,
+          csrf: 'new',
+          readOnly: false,
+        } as Me),
+    };
+    const sent = await sendTrainForm('old', steps);
+    expect(tokens).toEqual(['old', 'new']);
+    expect(sent).toEqual({
+      text: 'Old Stone Fountain is stop 4.',
+      csrf: 'new',
+      ok: true,
+      status: 200,
+      train: train(),
+    });
+  });
+});
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
new file mode 100644
index 0000000000000000000000000000000000000000..30ad8bf9c933afac3044fde4955abcf6e116816f
--- /dev/null
+++ b/src/web/client/train-forms.ts
@@ -0,0 +1,631 @@
+import type { MapAtEnd, MapMove, MapTrain, MapTrainPanel } from '../../domain/web/party-data.js';
+import {
+  MAP_AT_ENDS,
+  type ConductorSeen,
+  type PanelPress,
+  type RouteEdit,
+  type SavedRouteView,
+} from '../../domain/web/train-data.js';
+import { pressParty, type PressSteps, type Pressed } from './parties.js';
+import type { MapGym, PageNode } from './popup.js';
+
+/**
+ * Trains on the live map (plan 8M-5, spec 3.7), the parts that need no Leaflet: the start form,
+ * a train's actions in its popup, the route editor of route mode and its numbered stops, the
+ * Move train panel, the bodies they send, and sending one with the page's CSRF token as a press
+ * is sent. Everything is a tree of nodes (`renderNode` sets every text as text). What a member
+ * types is read by the server with the commands' readers; the page only says what is missing.
+ */
+
+/** The longest name of a train or a saved route (`/train`'s option). */
+const NAME_LENGTH = 80;
+/** The longest time a command takes (its option's length). */
+const TIME_LENGTH = 40;
+
+/** What a train does at the end of its route, in full, as the panel's menu says it. */
+export const AT_END_WORDS: Readonly<Record<MapAtEnd, string>> = {
+  finish: 'Finish at the last stop',
+  loop: 'Loop: back to the first stop',
+  'turn-back': 'Turn back at the end',
+};
+
+/** The buttons of the moves, as the post's panel names them. */
+const MOVE_WORDS: Readonly<Record<MapMove, string>> = {
+  next: 'Next',
+  previous: 'Previous',
+  skip: 'Skip',
+  finish: 'Finish',
+};
+
+const button = (
+  text: string,
+  attributes: Record<string, string>,
+  className = 'press',
+): PageNode => ({
+  tag: 'button',
+  className,
+  text,
+  attributes: { type: 'button', ...attributes },
+});
+
+const option = (value: string, text: string, selected: boolean): PageNode => ({
+  tag: 'option',
+  text,
+  attributes: { value, ...(selected ? { selected: '' } : {}) },
+});
+
+const labelled = (text: string, ...children: PageNode[]): PageNode => ({
+  tag: 'label',
+  className: 'form-row',
+  children: [{ tag: 'span', text }, ...children],
+});
+
+/** A body to send (a route's edits carry the route they were drawn from), or what is missing. */
+export type TrainBody = { body: Record<string, unknown> } | { text: string };
+
+/** The line under a form where its answer is said. */
+const answerLine: PageNode = { tag: 'div', className: 'form-answer', attributes: { hidden: '' } };
+
+/** A gym as a stop is named: its nickname, else its name (as the posts do). */
+export function stopName(gym: MapGym | undefined, gymId: number): string {
+  if (!gym) return `Gym ${gymId}`;
+  return gym.nickname !== null && gym.nickname !== '' ? gym.nickname : gym.name;
+}
+
+/** "New train" in the side panel, for a member while the map is not read-only. */
+export function newTrainButton(): PageNode {
+  return {
+    tag: 'div',
+    className: 'train-box',
+    children: [button('New train', { 'data-new-train': '' }, 'press new-train')],
+  };
+}
+
+/** What the start form holds, kept when it is drawn anew. */
+export interface StartValues {
+  name: string;
+  region: string;
+  time: string;
+  atEnd: string;
+}
+
+/**
+ * The form of a new train, as `/train` takes it and `/meet` its start: its name, the region it
+ * is made in (any region of the server, `/api/geo`'s), when it starts (a clock time, a date and
+ * a time, or `in 30`; empty for none yet) and what it does at the end of its route.
+ */
+export function startForm(
+  regions: ReadonlyArray<{ id: number; name: string }>,
+  filled: Partial<StartValues> = {},
+): PageNode {
+  return {
+    tag: 'div',
+    className: 'raid-form train-form',
+    attributes: { 'data-form': 'train' },
+    children: [
+      { tag: 'strong', className: 'name', text: 'New train' },
+      labelled('Name', {
+        tag: 'input',
+        attributes: {
+          name: 'name',
+          type: 'text',
+          maxlength: String(NAME_LENGTH),
+          placeholder: 'Such as Saturday legendaries',
+          autocomplete: 'off',
+          ...(filled.name === undefined ? {} : { value: filled.name }),
+        },
+      }),
+      labelled('Region', {
+        tag: 'select',
+        attributes: { name: 'region' },
+        children: [
+          option('', 'Pick the region', (filled.region ?? '') === ''),
+          ...regions.map((region) =>
+            option(String(region.id), region.name, String(region.id) === filled.region),
+          ),
+        ],
+      }),
+      labelled('Starts', {
+        tag: 'input',
+        attributes: {
+          name: 'time',
+          type: 'text',
+          maxlength: String(TIME_LENGTH),
+          placeholder: '6:15pm, 10-17 6:15pm or in 30',
+          autocomplete: 'off',
+          ...(filled.time === undefined ? {} : { value: filled.time }),
+        },
+      }),
+      labelled('At the end', atEndSelect((filled.atEnd as MapAtEnd | undefined) ?? 'finish')),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          button('Start', { 'data-submit': 'train' }),
+          button('Cancel', { 'data-cancel': '' }),
+        ],
+      },
+      answerLine,
+    ],
+  };
+}
+
+/** The menu of what a train does at the end of its route, `picked` chosen. */
+function atEndSelect(picked: MapAtEnd): PageNode {
+  return {
+    tag: 'select',
+    attributes: { name: 'atEnd' },
+    children: MAP_AT_ENDS.map((atEnd) => option(atEnd, AT_END_WORDS[atEnd], atEnd === picked)),
+  };
+}
+
+/** The body of a new train (`POST /s/<guild>/api/trains`), or what is missing. */
+export function startBody(values: StartValues): TrainBody {
+  const name = values.name.trim();
+  if (name === '') return { text: 'Give the train a name first.' };
+  const region = Number(values.region);
+  if (values.region === '' || !Number.isInteger(region)) return { text: 'Pick the region first.' };
+  const time = values.time.trim();
+  const atEnd = MAP_AT_ENDS.find((mode) => mode === values.atEnd);
+  return {
+    body: {
+      name,
+      region,
+      ...(time === '' ? {} : { time }),
+      ...(atEnd === undefined || atEnd === 'finish' ? {} : { atEnd }),
+    },
+  };
+}
+
+/**
+ * What a train's popup offers a member beyond the post's buttons, as they may (`MapTrain.may`,
+ * `panel`, `conductor`): "Edit route", "Move…", and taking or giving up the conductor role; and
+ * whose the role is, without naming anybody.
+ */
+export function trainActions(train: MapTrain): PageNode[] {
+  const { conductor } = train;
+  const line =
+    conductor.who === 'you'
+      ? 'You are its conductor.'
+      : conductor.who === 'other'
+        ? 'It has a conductor.'
+        : undefined;
+  const buttons = [
+    ...(train.may.arrange ? [button('Edit route', { 'data-route-train': train.id })] : []),
+    ...(train.panel ? [button('Move…', { 'data-move-train': train.id })] : []),
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
+  return [
+    ...(line === undefined ? [] : [{ tag: 'div', className: 'conductor', text: line }]),
+    ...(buttons.length === 0
+      ? []
+      : [{ tag: 'div', className: 'train-actions', children: buttons }]),
+  ];
+}
+
+/**
+ * The body of a conductor's button (`POST …/conductor/<change>`): whose the role was as the
+ * train was drawn, so that a press against a role that changed meanwhile is refused.
+ */
+export function conductorBody(train: Pick<MapTrain, 'conductor'>): { who: ConductorSeen } {
+  return { who: train.conductor.who ?? 'none' };
+}
+
+/**
+ * The trains whose line the list draws on the map: all but the one being routed, whose route
+ * mode draws its stops (`routeMarkers`) as they are edited.
+ */
+export function drawnTrains(trains: readonly MapTrain[], routed: string | undefined): MapTrain[] {
+  return trains.filter((train) => train.id !== routed);
+}
+
+/** The stops of a train in route mode: the gym, its number, whether the train is there. */
+export function routeMarkers(
+  train: Pick<MapTrain, 'route' | 'stop'>,
+): Array<{ gymId: number; number: number; here: boolean }> {
+  return train.route.map((gymId, index) => ({
+    gymId,
+    number: index + 1,
+    here: train.stop === index,
+  }));
+}
+
+/** A saved route as the list names it: `Name (3 stops, loops)`. */
+function savedLabel(route: SavedRouteView): string {
+  const mode =
+    route.atEnd === 'loop' ? ', loops' : route.atEnd === 'turn-back' ? ', turns back' : '';
+  const stops = `${route.stops} ${route.stops === 1 ? 'stop' : 'stops'}`;
+  return `${route.name === '' ? 'Without a name' : route.name} (${stops}${mode})`;
+}
+
+/**
+ * What a stop of the route editor offers who may arrange the route: up, down, a move to any
+ * position (one `/route move` by the numbers shown, so that a stop goes far in one edit) and
+ * remove (`/route remove`).
+ */
+function stopControls(number: number, count: number): PageNode[] {
+  const positions = Array.from({ length: count }, (_, index) => index + 1);
+  return [
+    button('↑', {
+      'data-edit': 'move',
+      'data-from': String(number),
+      'data-to': String(number - 1),
+      'aria-label': `Move stop ${number} up`,
+      ...(number === 1 ? { disabled: '' } : {}),
+    }),
+    button('↓', {
+      'data-edit': 'move',
+      'data-from': String(number),
+      'data-to': String(number + 1),
+      'aria-label': `Move stop ${number} down`,
+      ...(number === count ? { disabled: '' } : {}),
+    }),
+    {
+      tag: 'select',
+      className: 'move-to',
+      attributes: { 'data-move-from': String(number), 'aria-label': `Move stop ${number} to` },
+      children: positions.map((to) => option(String(to), `#${to}`, to === number)),
+    },
+    button('✕', {
+      'data-edit': 'remove',
+      'data-stop': String(number),
+      'aria-label': `Remove stop ${number}`,
+    }),
+  ];
+}
+
+/**
+ * The route editor of route mode, in the side panel (spec 3.7): the train's stops in order, the
+ * one it is at marked, each with up, down, a move to any position and remove for who may arrange
+ * the route (`stopControls`; up, down and a position rather than dragging, which the map's side
+ * panel does not need); "Clear the route" for who may (`/route clear`); the member's saved routes
+ * of its region to load (who may) or forget, and a name to save the route under; Done. A gym
+ * clicked on the map is added as the next stop (`/route add`). `saved` is undefined while the
+ * list is on its way.
+ */
+export function routeEditor(
+  train: MapTrain,
+  gym: (id: number) => MapGym | undefined,
+  saved: readonly SavedRouteView[] | undefined,
+): PageNode {
+  const count = train.route.length;
+  const stops: PageNode =
+    count === 0
+      ? { tag: 'p', className: 'hint', text: 'No stops yet.' }
+      : {
+          tag: 'ol',
+          className: 'route-stops',
+          children: routeMarkers(train).map(({ gymId, number, here }) => ({
+            tag: 'li',
+            className: here ? 'route-stop here' : 'route-stop',
+            children: [
+              {
+                tag: 'span',
+                className: 'stop-name',
+                text: `${number}. ${stopName(gym(gymId), gymId)}${here ? ' (the train is here)' : ''}`,
+              },
+              ...(train.may.arrange ? stopControls(number, count) : []),
+            ],
+          })),
+        };
+  const savedPart: PageNode[] =
+    saved === undefined
+      ? [{ tag: 'p', className: 'hint', text: 'Loading your saved routes…' }]
+      : saved.length === 0
+        ? [{ tag: 'p', className: 'hint', text: 'You have no saved routes for this region.' }]
+        : [
+            labelled(
+              'Saved',
+              {
+                tag: 'select',
+                attributes: { name: 'route' },
+                children: [
+                  option('', 'Pick a saved route', true),
+                  ...saved.map((route) => option(String(route.id), savedLabel(route), false)),
+                ],
+              },
+              ...(train.may.load ? [button('Load', { 'data-edit': 'load' })] : []),
+              button('Forget', { 'data-edit': 'forget' }),
+            ),
+          ];
+  return {
+    tag: 'div',
+    className: 'raid-form route-editor',
+    attributes: { 'data-form': 'route', 'data-party': train.id },
+    children: [
+      { tag: 'strong', className: 'name', text: `Route of ${train.name}` },
+      {
+        tag: 'p',
+        className: 'hint',
+        text: 'Click a gym on the map to add it as the next stop.',
+      },
+      stops,
+      ...(train.may.clear && count > 0
+        ? [
+            {
+              tag: 'div',
+              className: 'form-buttons',
+              children: [button('Clear the route', { 'data-edit': 'clear' })],
+            },
+          ]
+        : []),
+      ...savedPart,
+      ...(count === 0
+        ? []
+        : [
+            labelled(
+              'Save as',
+              {
+                tag: 'input',
+                attributes: {
+                  name: 'name',
+                  type: 'text',
+                  maxlength: String(NAME_LENGTH),
+                  placeholder: 'A name for this route',
+                  autocomplete: 'off',
+                },
+              },
+              button('Save', { 'data-edit': 'save' }),
+            ),
+          ]),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [button('Done', { 'data-cancel': '' })],
+      },
+      answerLine,
+    ],
+  };
+}
+
+/** What a route edit reads of the editor and the button pressed. */
+export interface RouteEditValues {
+  gym?: number;
+  stop?: string;
+  from?: string;
+  to?: string;
+  route?: string;
+  name?: string;
+}
+
+/**
+ * The body of an edit of the route (`POST /s/<guild>/api/trains/<id>/route/<edit>`), with the
+ * route it was drawn from (`drawn`), or what is missing.
+ */
+export function routeEditBody(
+  edit: RouteEdit,
+  train: MapTrain,
+  values: RouteEditValues,
+): TrainBody {
+  const drawn = [...train.route];
+  const whole = (text: string | undefined): number | undefined => {
+    const value = Number(text);
+    return text !== undefined && text !== '' && Number.isInteger(value) && value > 0
+      ? value
+      : undefined;
+  };
+  switch (edit) {
+    case 'add':
+      return values.gym === undefined
+        ? { text: 'Click a gym first.' }
+        : { body: { drawn, gym: values.gym } };
+    case 'remove': {
+      const stop = whole(values.stop);
+      return stop === undefined ? { text: 'Pick a stop first.' } : { body: { drawn, stop } };
+    }
+    case 'move': {
+      const [from, to] = [whole(values.from), whole(values.to)];
+      return from === undefined || to === undefined
+        ? { text: 'Pick a stop first.' }
+        : { body: { drawn, from, to } };
+    }
+    case 'clear':
+      return { body: { drawn } };
+    case 'save': {
+      const name = (values.name ?? '').trim();
+      return name === '' ? { text: 'Give the route a name first.' } : { body: { drawn, name } };
+    }
+    case 'load':
+    case 'forget': {
+      const route = whole(values.route);
+      if (route === undefined) return { text: 'Pick one of your saved routes first.' };
+      return { body: edit === 'load' ? { drawn, route } : { route } };
+    }
+  }
+}
+
+/**
+ * The Move train panel on the map, in the train's popup (spec 3.7): where the train is, the
+ * moves that can be made from there (`MapTrainPanel.moves`), "Reverse the route" where it may be,
+ * what the train does at its end with Set, and Done. Nothing for a train without a panel.
+ */
+export function movePanel(
+  train: MapTrain,
+  gym: (id: number) => MapGym | undefined,
+): PageNode | undefined {
+  const { panel } = train;
+  if (!panel) return undefined;
+  const at = train.stop === null ? undefined : train.route[train.stop];
+  const where =
+    at === undefined
+      ? `The route of ${train.route.length} ${train.route.length === 1 ? 'stop' : 'stops'} is finished.`
+      : `At stop ${(train.stop ?? 0) + 1} of ${train.route.length}: ${stopName(gym(at), at)}`;
+  return {
+    tag: 'div',
+    className: 'raid-form move-panel',
+    attributes: { 'data-form': 'move', 'data-party': train.id },
+    children: [
+      { tag: 'strong', className: 'name', text: 'Move the train' },
+      { tag: 'div', className: 'stop', text: where },
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [
+          ...panel.moves.map(({ move, target }) =>
+            button(MOVE_WORDS[move], { 'data-press': move, 'data-target': target }),
+          ),
+          ...(panel.reverse === null
+            ? []
+            : [
+                button('Reverse the route', {
+                  'data-press': 'reverse',
+                  'data-first': panel.reverse,
+                }),
+              ]),
+        ],
+      },
+      labelled('At the end', atEndSelect(panel.atEnd), button('Set', { 'data-press': 'at-end' })),
+      {
+        tag: 'div',
+        className: 'form-buttons',
+        children: [button('Done', { 'data-cancel': '' })],
+      },
+      answerLine,
+    ],
+  };
+}
+
+/** What a press of the panel reads of its button and the menu. */
+export interface PressValues {
+  target?: string;
+  first?: string;
+  atEnd?: string;
+}
+
+/**
+ * The body of a press of the panel (`POST /s/<guild>/api/trains/<id>/move/<press>`): where the
+ * panel was drawn (`from`) and what the button carries.
+ */
+export function pressBody(
+  panel: MapTrainPanel,
+  press: PanelPress,
+  values: PressValues,
+): Record<string, string> {
+  const from = panel.place;
+  switch (press) {
+    case 'finish':
+      return { from };
+    case 'reverse':
+      return { from, first: values.first ?? '' };
+    case 'at-end':
+      return { from, atEnd: values.atEnd ?? panel.atEnd };
+    default:
+      return { from, target: values.target ?? '' };
+  }
+}
+
+/**
+ * What the page takes of a train's answer: whether it was done, the status it came with (none
+ * when the connection broke), and the train as it is now.
+ */
+export interface TrainAnswered {
+  ok: boolean;
+  status?: number;
+  train?: MapTrain;
+}
+
+/**
+ * Whether an edit's answer ends route mode: the train is gone (409 without a train: it has
+ * ended, or is no train of this server). A refusal that gives the train is drawn from it; one
+ * without it for another reason (too many clicks, Discord away, a broken connection) leaves route
+ * mode as it is.
+ */
+export function routeModeEnds(answer: TrainAnswered): boolean {
+  return !answer.ok && answer.train === undefined && answer.status === 409;
+}
+
+/** What `RouteEdits` works with. */
+export interface RouteEditsDeps {
+  /** The train being arranged as the last answer gave it; undefined once route mode ended. */
+  train(): MapTrain | undefined;
+  /** Sends an edit's body (or says what is missing) and takes its answer in. */
+  send(edit: RouteEdit, body: TrainBody): Promise<void>;
+  /** Edits are waiting or on their way (the editor's buttons off), or none any more. */
+  busy(on: boolean): void;
+}
+
+/**
+ * The edits of route mode, one at a time: a gym clicked while an edit is on its way waits for
+ * its turn rather than being refused against the route the edit before changes, and its body is
+ * made only then, from the train the answer before gave (`routeEditBody`); once route mode ended,
+ * what waits is dropped. `add` resolves when the edit is through (or dropped).
+ */
+export class RouteEdits {
+  private waiting = 0;
+  private last: Promise<void> = Promise.resolve();
+
+  constructor(private readonly deps: RouteEditsDeps) {}
+
+  /** Whether an edit is waiting or on its way. */
+  get busy(): boolean {
+    return this.waiting > 0;
+  }
+
+  add(edit: RouteEdit, values: RouteEditValues): Promise<void> {
+    if (this.waiting === 0) this.deps.busy(true);
+    this.waiting += 1;
+    const turn = this.last
+      .then(async () => {
+        const train = this.deps.train();
+        if (train) await this.deps.send(edit, routeEditBody(edit, train, values));
+      })
+      .catch(() => undefined)
+      .finally(() => {
+        this.waiting -= 1;
+        if (this.waiting === 0) this.deps.busy(false);
+      });
+    this.last = turn;
+    return turn;
+  }
+}
+
+/**
+ * Reads an answer of the trains' addresses. The train is the server's own view (`MapTrain`);
+ * an answer without one that looks like it (an id and a route) gives none.
+ */
+export function trainAnswerOf(body: unknown): TrainAnswered {
+  if (typeof body !== 'object' || body === null) return { ok: false };
+  const { ok, train } = body as { ok?: unknown; train?: unknown };
+  const answered: TrainAnswered = { ok: ok === true };
+  if (typeof train === 'object' && train !== null) {
+    const { id, route } = train as { id?: unknown; route?: unknown };
+    // The server's own view of the train, as `/api/parties` gives it.
+    if (typeof id === 'string' && Array.isArray(route)) answered.train = train as MapTrain;
+  }
+  return answered;
+}
+
+/**
+ * Sends a train's form or press with the page's CSRF token as a press is sent (`pressParty`: a
+ * 403 of a stale token is tried once more with a new one): the words to say, the token now, the
+ * status of the last answer, and the train as it gives it.
+ */
+export async function sendTrainForm(
+  csrf: string,
+  steps: PressSteps,
+): Promise<Pressed & TrainAnswered> {
+  let last: { status: number; body: unknown } | undefined;
+  const pressed = await pressParty(csrf, {
+    post: async (token) => {
+      const answer = await steps.post(token);
+      last = answer;
+      return answer;
+    },
+    me: () => steps.me(),
+  });
+  return {
+    ...pressed,
+    ...trainAnswerOf(last?.body),
+    ...(last === undefined ? {} : { status: last.status }),
+  };
+}
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
new file mode 100644
index 0000000000000000000000000000000000000000..59655fd9e3d8ff5c6971b4971273638d7a1805c2
--- /dev/null
+++ b/src/web/client/train-ui.ts
@@ -0,0 +1,447 @@
+import type { GeoView } from '../../domain/web/geo-data.js';
+import type { MapTrain } from '../../domain/web/party-data.js';
+import {
+  CONDUCTOR_CHANGES,
+  PANEL_PRESSES,
+  ROUTE_EDITS,
+  type ConductorChange,
+  type PanelPress,
+  type RouteEdit,
+  type SavedRoutesView,
+} from '../../domain/web/train-data.js';
+import { getJson, say } from './common.js';
+import type { Me } from './notice.js';
+import { renderNode, type MapGym } from './popup.js';
+import type { FormClaim, FormHold } from './raid-forms.js';
+import { fieldsOf, sayUnder } from './raid-ui.js';
+import {
+  conductorBody,
+  movePanel,
+  newTrainButton,
+  pressBody,
+  routeEditor,
+  RouteEdits,
+  routeModeEnds,
+  sendTrainForm,
+  startBody,
+  startForm,
+  type RouteEditValues,
+  type TrainAnswered,
+  type TrainBody,
+} from './train-forms.js';
+
+/**
+ * The trains of the live map in the page (plan 8M-5, spec 3.7): "New train" in the side panel
+ * opens the start form there; "Edit route" in a train's popup puts the map in route mode for it
+ * (the route editor in the side panel, the stops numbered on the map, a gym clicked added as the
+ * next stop, one edit at a time); "Move…" opens the Move train panel in the popup, which stays
+ * open after a move as the post's does; the conductor buttons press at once. One form or mode at
+ * a time (`FormHold`, shared with the raid and spawn forms); the start form and route mode are
+ * forms of the trains' box, under which the list is drawn (`aside`). After a success the map
+ * refreshes (`done`).
+ */
+export interface TrainUiDeps {
+  guild: string;
+  /** The page's CSRF token, which a stale one's renewal changes. */
+  csrf: { get(): string; set(token: string): void };
+  /** The server's regions with their names, as `/api/geo` gives them. */
+  regions: GeoView['regions'];
+  /** The gyms by id, as `/api/geo` gives them: the stops' names. */
+  gyms: ReadonlyMap<number, MapGym>;
+  /** The form that is open, shared with the raid and spawn forms. */
+  hold: Pick<FormHold<unknown>, 'take' | 'holds' | 'ready' | 'fit' | 'release'>;
+  /** Where the start form and the route editor are drawn: a box of the side panel. */
+  tools: HTMLElement;
+  /** The train's stops numbered on the map in route mode, and none once it ends. */
+  overlay: { show(train: MapTrain): void; clear(): void };
+  /** Closes the popup that is open (route mode works in the side panel and on the map). */
+  closePopup(): void;
+  /** After something went through: the list again, and the train's popup opened when given. */
+  done(train: MapTrain | undefined): Promise<void>;
+  /** The list again, nothing opened: drawn once the form that holds lets go. */
+  refresh(): Promise<void>;
+}
+
+/** What the page says of a form while another one is open. */
+const FORM_OPEN = 'Close the form that is open first.';
+
+function isRouteEdit(value: string | undefined): value is RouteEdit {
+  return (ROUTE_EDITS as readonly (string | undefined)[]).includes(value);
+}
+
+function isPanelPress(value: string | undefined): value is PanelPress {
+  return (PANEL_PRESSES as readonly (string | undefined)[]).includes(value);
+}
+
+function isConductorChange(value: string | undefined): value is ConductorChange {
+  return (CONDUCTOR_CHANGES as readonly (string | undefined)[]).includes(value);
+}
+
+export function trainUi(deps: TrainUiDeps) {
+  const { guild, hold } = deps;
+  const gym = (id: number) => deps.gyms.get(id);
+
+  /** Sends a body to an address of the trains with the page's token. */
+  const send = async (
+    url: string,
+    body: Record<string, unknown>,
+  ): Promise<{ text: string } & TrainAnswered> => {
+    const sent = await sendTrainForm(deps.csrf.get(), {
+      post: async (token) => {
+        const reply = await fetch(url, {
+          method: 'POST',
+          credentials: 'same-origin',
+          headers: { 'content-type': 'application/json', 'x-pine-csrf': token },
+          body: JSON.stringify(body),
+        });
+        return {
+          status: reply.status,
+          body: (await reply.json().catch(() => undefined)) as unknown,
+        };
+      },
+      me: () => getJson<Me>(`/s/${guild}/api/me`),
+    });
+    deps.csrf.set(sent.csrf);
+    return sent;
+  };
+
+  /** Sends a form's body with its buttons off meanwhile; what is missing is said under it. */
+  const sendForm = async (form: HTMLElement, url: string, body: TrainBody) => {
+    if ('text' in body) {
+      sayUnder(form, body.text);
+      return undefined;
+    }
+    const buttons = form.querySelectorAll('button');
+    for (const each of buttons) each.disabled = true;
+    const sent = await send(url, body.body);
+    for (const each of buttons) each.disabled = false;
+    return sent;
+  };
+
+  const trainUrl = (train: MapTrain, path: string) =>
+    `/s/${guild}/api/trains/${encodeURIComponent(train.id)}/${path}`;
+
+  /** The trains' box shows "New train" again. */
+  const toolsIdle = (): void => {
+    deps.tools.replaceChildren(renderNode(newTrainButton(), document));
+  };
+
+  /** The start form, while it is open. */
+  let starting: FormClaim | undefined;
+
+  /** Route mode: the train being arranged, its claim, and its saved routes once they came. */
+  let routing:
+    { claim: FormClaim; train: MapTrain; saved: SavedRoutesView | undefined } | undefined;
+
+  /** The route editor's controls but Done, off while edits wait or are on their way. */
+  const editorControls = (on: boolean): void => {
+    for (const control of deps.tools.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
+      '.route-editor button:not([data-cancel]), .route-editor select',
+    )) {
+      control.disabled = !on;
+    }
+  };
+
+  /**
+   * The edits of route mode, one at a time (`RouteEdits`): a gym clicked meanwhile waits, its
+   * body made from the train the answer before gave.
+   */
+  const edits = new RouteEdits({
+    train: () => routing?.train,
+    send: (edit, body) => sendEdit(edit, body),
+    busy: (on) => {
+      editorControls(!on);
+    },
+  });
+
+  /** Draws the route editor and the numbered stops anew, from the train as it is now. */
+  const drawRoute = (): void => {
+    if (!routing) return;
+    const { train, saved } = routing;
+    const editor = renderNode(routeEditor(train, gym, saved?.routes), document);
+    editor.addEventListener('click', (event) => {
+      editClicked(editor, event);
+    });
+    editor.addEventListener('change', (event) => {
+      moveChosen(event);
+    });
+    deps.tools.replaceChildren(editor);
+    if (edits.busy) editorControls(false);
+    deps.overlay.show(train);
+  };
+
+  const loadSaved = async (): Promise<void> => {
+    const shown = routing;
+    if (!shown) return;
+    try {
+      shown.saved = await getJson<SavedRoutesView>(trainUrl(shown.train, 'routes'));
+    } catch {
+      shown.saved = { routes: [] };
+      say('Your saved routes could not be loaded. Try again in a moment.');
+    }
+    if (routing === shown) drawRoute();
+  };
+
+  /**
+   * Ends route mode: the editor and the numbers go, the map is drawn anew with the train's popup
+   * open (`opened`; none for a train that is gone).
+   */
+  const endRoute = async (opened: MapTrain | undefined): Promise<void> => {
+    const ended = routing;
+    if (!ended) return;
+    routing = undefined;
+    toolsIdle();
+    deps.overlay.clear();
+    hold.release(ended.claim);
+    await deps.done(opened);
+  };
+
+  /**
+   * Sends one edit of the route (its turn in `edits`) and takes its answer in: the editor and
+   * the numbers are drawn anew from the train it gives, whether the edit went through or was
+   * refused; an answer that the train is gone ends route mode; one that gives no train for
+   * another reason (too many clicks, Discord away) is said and changes nothing. What is missing
+   * is said under the editor.
+   */
+  const sendEdit = async (edit: RouteEdit, body: TrainBody): Promise<void> => {
+    const shown = routing;
+    if (!shown) return;
+    const editor = deps.tools.firstElementChild;
+    const under = (text: string): void => {
+      const now = deps.tools.firstElementChild;
+      if (now instanceof HTMLElement) sayUnder(now, text);
+      else say(text);
+    };
+    if ('text' in body) {
+      if (editor instanceof HTMLElement) sayUnder(editor, body.text);
+      else say(body.text);
+      return;
+    }
+    const sent = await send(trainUrl(shown.train, `route/${edit}`), body.body);
+    if (routing !== shown) {
+      say(sent.text);
+      return;
+    }
+    if (routeModeEnds(sent)) {
+      say(sent.text);
+      await endRoute(undefined);
+      return;
+    }
+    if (sent.train) shown.train = sent.train;
+    // A saved route was saved, loaded or forgotten: its list as it is now.
+    if (sent.ok && (edit === 'save' || edit === 'forget')) shown.saved = undefined;
+    drawRoute();
+    under(sent.text);
+    if (shown.saved === undefined) void loadSaved();
+  };
+
+  const editClicked = (editor: HTMLElement, event: Event): void => {
+    const target = event.target;
+    if (!(target instanceof HTMLButtonElement) || !routing) return;
+    if (target.dataset.cancel !== undefined) {
+      void endRoute(routing.train);
+      return;
+    }
+    const edit = target.dataset.edit;
+    if (!isRouteEdit(edit)) return;
+    const fields = fieldsOf(editor);
+    const values: RouteEditValues = {
+      stop: target.dataset.stop,
+      from: target.dataset.from,
+      to: target.dataset.to,
+      route: fields.route,
+      name: fields.name,
+    };
+    void edits.add(edit, values);
+  };
+
+  /** A position picked in a stop's "move to" list: one `/route move`. */
+  const moveChosen = (event: Event): void => {
+    const target = event.target;
+    if (!(target instanceof HTMLSelectElement) || !routing) return;
+    const from = target.dataset.moveFrom;
+    if (from === undefined || target.value === from) return;
+    void edits.add('move', { from, to: target.value });
+  };
+
+  /** Puts the map in route mode for a train: only while no other form is open. */
+  const startRoute = (train: MapTrain): void => {
+    const claim = hold.take(false, true);
+    if (!claim) {
+      say(FORM_OPEN);
+      return;
+    }
+    deps.closePopup();
+    routing = { claim, train, saved: undefined };
+    drawRoute();
+    void loadSaved();
+  };
+
+  /** The start form in the side panel, in place of "New train". */
+  const openStart = (): void => {
+    const claim = hold.take(false, true);
+    if (!claim) {
+      say(FORM_OPEN);
+      return;
+    }
+    starting = claim;
+    const regions = deps.regions.map((region) => ({ id: region.id, name: region.name }));
+    const form = renderNode(startForm(regions), document);
+    const close = () => {
+      if (starting === claim) starting = undefined;
+      toolsIdle();
+      hold.release(claim);
+    };
+    form.addEventListener('click', (event) => {
+      const target = event.target;
+      if (!(target instanceof HTMLButtonElement)) return;
+      if (target.dataset.cancel !== undefined) {
+        close();
+        return;
+      }
+      if (target.dataset.submit !== 'train') return;
+      const fields = fieldsOf(form);
+      const body = startBody({
+        name: fields.name ?? '',
+        region: fields.region ?? '',
+        time: fields.time ?? '',
+        atEnd: fields.atEnd ?? '',
+      });
+      void sendForm(form, `/s/${guild}/api/trains`, body).then(async (sent) => {
+        if (!sent) return;
+        if (!sent.ok || !hold.holds(claim)) {
+          sayUnder(form, sent.text);
+          return;
+        }
+        close();
+        say(sent.text);
+        // A new train has no stops: its route is laid at once, by who may.
+        if (sent.train?.may.arrange) startRoute(sent.train);
+        else await deps.done(sent.train);
+      });
+    });
+    deps.tools.replaceChildren(form);
+  };
+
+  /**
+   * The Move train panel in a train's popup, in place of its actions. It stays open after a
+   * move, drawn anew from where the train is then, as the post's panel does; Done closes it and
+   * draws the map with the train's popup open again, and so does a move after which the member
+   * may move it no more (no panel). Meanwhile the list is asked for again after each move, and
+   * drawn once the panel or its popup closes.
+   */
+  const openMove = (box: HTMLElement, train: MapTrain): void => {
+    const claim = hold.take(box.closest('.leaflet-popup') !== null);
+    if (!claim) return;
+    const before = [...box.childNodes];
+    let shown = train;
+    const close = () => {
+      if (box.isConnected) box.replaceChildren(...before);
+      hold.release(claim);
+    };
+    /** Draws the panel from `shown`; false when there is none to draw (it closes). */
+    const draw = (): boolean => {
+      const node = movePanel(shown, gym);
+      if (!node) {
+        close();
+        return false;
+      }
+      const panel = renderNode(node, document);
+      panel.addEventListener('click', (event) => {
+        const target = event.target;
+        if (!(target instanceof HTMLButtonElement)) return;
+        if (target.dataset.cancel !== undefined) {
+          close();
+          void deps.done(shown);
+          return;
+        }
+        const press = target.dataset.press;
+        if (!isPanelPress(press) || !shown.panel) return;
+        const body = pressBody(shown.panel, press, {
+          target: target.dataset.target,
+          first: target.dataset.first,
+          atEnd: fieldsOf(panel).atEnd,
+        });
+        void sendForm(panel, trainUrl(shown, `move/${press}`), { body }).then(async (sent) => {
+          if (!sent) return;
+          if (!hold.holds(claim)) {
+            say(sent.text);
+            await deps.done(undefined);
+            return;
+          }
+          // The panel as the train is now (moved, or as it was moved meanwhile), and the words.
+          if (sent.train) shown = sent.train;
+          if (!draw()) {
+            say(sent.text);
+            await deps.done(shown);
+            return;
+          }
+          const drawn = box.firstElementChild;
+          if (drawn instanceof HTMLElement) sayUnder(drawn, sent.text);
+          else say(sent.text);
+          if (sent.ok) await deps.refresh();
+        });
+      });
+      box.replaceChildren(panel);
+      hold.fit();
+      return true;
+    };
+    draw();
+  };
+
+  /**
+   * Takes or gives up the conductor role at once, as `/conductor` does, with whose the role was
+   * as the train was drawn (a press against a role that changed meanwhile is refused).
+   */
+  const pressConductor = async (button: HTMLButtonElement, train: MapTrain): Promise<void> => {
+    const change = button.dataset.conductor;
+    if (!isConductorChange(change)) return;
+    button.disabled = true;
+    const sent = await send(trainUrl(train, `conductor/${change}`), conductorBody(train));
+    button.disabled = false;
+    say(sent.text);
+    await deps.done(sent.ok || sent.train ? (sent.train ?? train) : undefined);
+  };
+
+  return {
+    /** A click on "New train" (`newTrainButton`): the start form in its place. */
+    newTrainClicked(): void {
+      openStart();
+    },
+
+    /**
+     * A click on a train's action in its popup or the side panel (`data-route-train`,
+     * `data-move-train`, `data-conductor`): `train` is the train as the list has it.
+     */
+    actionClicked(button: HTMLButtonElement, train: MapTrain): void {
+      if (button.dataset.routeTrain !== undefined) startRoute(train);
+      else if (button.dataset.moveTrain !== undefined) {
+        const box = button.closest<HTMLElement>('.train-actions');
+        if (box) openMove(box, train);
+      } else if (button.dataset.conductor !== undefined) void pressConductor(button, train);
+    },
+
+    /**
+     * A gym clicked on the map: in route mode it is added as the next stop of the train being
+     * arranged, after the edits that wait (true: its popup is not wanted); otherwise nothing
+     * (false).
+     */
+    gymClicked(clicked: MapGym): boolean {
+      if (!routing) return false;
+      void edits.add('add', { gym: clicked.id });
+      return true;
+    },
+
+    /** The train in route mode, if any: the list leaves its line to route mode's numbers. */
+    routing(): MapTrain | undefined {
+      return routing?.train;
+    },
+
+    /** Whether the trains' box holds the start form or the route editor: the list keeps it. */
+    inTools(): boolean {
+      return starting !== undefined || routing !== undefined;
+    },
+  };
+}
+
+export type TrainUi = ReturnType<typeof trainUi>;
````

### Task 6: Trains from the map: docs and staging checklist

Prototype commit: `036b9d3d56d808159d1b1b08cb949814c5e0acf3`

`web.md` ("Trains on the map"), `trains.md`, `testing.md`; the staging checklist `docs/superpowers/plans/2026-10-17-phase-8m5-staging.md`.

**Files:**

```
 docs/architecture/testing.md                           |  1 +
 docs/architecture/trains.md                            |  4 +++-
 docs/architecture/web.md                               | 26 ++++++++++++++++++--------
 docs/superpowers/plans/2026-10-17-phase-8m5-staging.md | 50 ++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 72 insertions(+), 9 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check docs/architecture/testing.md docs/architecture/trains.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m5-staging.md`.
- [ ] **Step 4: Check the transcription:** `git diff 036b9d3d56d808159d1b1b08cb949814c5e0acf3 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Trains from the map: docs and staging checklist`, the paragraph above as the body and the trailer, staging exactly
  `docs/architecture/testing.md docs/architecture/trains.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m5-staging.md`.

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index dc8a5c062f2e7db9f881325a501d278dd50283e8..a7e75f8f4cbdc9d8ead9e25f542b97d9a12fe0dc 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -51,6 +51,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
 - Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`).
 - Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`. The bot refused in a region's channel: `gateway.failing.set('sendMessage', missingPermissions('POST'))`. The page's spawn form itself (`spawnUi`) imports Leaflet, which needs a browser as it loads: its test mocks `leaflet` and is `spawn-ui.isolated.test.ts`, with a `document` of its own (`vi.stubGlobal`, `vi.unstubAllGlobals()` afterwards) and a real `FormHold`.
+- Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it; `FormHold`'s `aside` claims in `raid-forms.test.ts`); `train-ui.ts`, like `raid-ui.ts`, is tried at staging.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 7798dd5475f6319483a2128e13d11465ed014b5b..1faaef280fbe218304862219f0e85f894de24de7 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -1,6 +1,6 @@
 # Raid trains
 
-The third kind of party: a route of gyms, a current stop, a conductor, modes at the end of the route (finish, loop, turn back), movement and its announcement, the private Move train panel, saved routes and copies in the channels of the regions a train stops in. Read before changing trains, routes or the panel (and `parties-and-posts.md` for what all parties share).
+The third kind of party: a route of gyms, a current stop, a conductor, modes at the end of the route (finish, loop, turn back), movement and its announcement, the private Move train panel, saved routes, copies in the channels of the regions a train stops in, and the commands' code paths the live map shares. Read before changing trains, routes or the panel (and `parties-and-posts.md` for what all parties share; `web.md`, "Trains on the map", for the map's side).
 
 ## The model
 
@@ -11,6 +11,8 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 ## Changes and movement
 
 - Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `reverse`, `setAtEnd`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its gym through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
+- Who may edit is one rule each in `train.ts`, which the domain functions, the live map's view and its routes all ask: `mayNotArrange` (add, remove, move a stop: signed up, the maker, staff), `mayNotClear` (the conductor and staff; `/route clear` counts bot developers as staff), `mayNotLoad` (who may move the train, or the maker its first route), `mayNotMove`. An edit of the route may carry the route it was drawn from (`drawn`, the live map's route editor: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `loadRoute` and `saveRoute` take it last): the service refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`); a command gives none.
+- What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `reverseRouteAs` and `setAtEndAs` word the panel's Reverse and mode for the map), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). The post's panel keeps its own answer, drawing itself anew. `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
 - A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym is a stop only when it lies in a region of the train's server (`reaches`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
 - What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), the panel's menu (the menu is only in the panel, which opens only for who may move the train, so `setAtEnd`'s `mayArrange` matters for a panel opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so the panel's control also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 984367ec987dee248ec800ffd262b0e653636214..80a23a83d994867ad3ce9d0c2e487f84a332bfb3 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,12 +1,12 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4S; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, the region editor, the Content Security Policy, and the rules for the routes of 8M-5. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
 - Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (`osm` default, or `google`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows OpenStreetMap). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
-- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
+- `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
 - Failures answer briefly (`sendFailure`, `src/web/answers.ts`): `{ error: '<a few words>' }` under `/s/<guild>/api/` (401 "Log in first.", 403, 404, 413, 429, 503 "Not available just now."), a short page otherwise, never a stack or what went wrong; 500s are logged. Unknown addresses are 404 through the same handler. The body limit is 16 KB (`BODY_LIMIT`); a route that takes more (the editor's preview and save, 2 MB: `SAVE_BODY_LIMIT`) sets its own `bodyLimit`.
 
@@ -16,7 +16,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4S; spec `docs/superpow
 
 ## Addresses
 
-- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
+- `/` is a short page that names no server. `/s/<guild>/…` serves a server the bot is in (`isSnowflake` and the client's cache), anything else is 404 before anything is looked at (`guildRoutes`, `src/web/guild-routes.ts`): `/s/<guild>/map` (the page), `/s/<guild>/api/me`, `/s/<guild>/api/geo`; the parties' `/s/<guild>/api/parties` and `POST /s/<guild>/api/parties/<party id>/<action>` (`partyRoutes`, `src/web/party-routes.ts`); the raids' `/s/<guild>/api/raid-options`, `POST /s/<guild>/api/raids`, `POST /s/<guild>/api/raids/<party id>/<change>` and `/s/<guild>/api/raids/<party id>/moves` (`raidRoutes`, `src/web/raid-routes.ts`); the spawns' `/s/<guild>/api/wild-options` and `POST /s/<guild>/api/spawns` (`spawnRoutes`, `src/web/spawn-routes.ts`); the trains' `POST /s/<guild>/api/trains`, `POST /s/<guild>/api/trains/<party id>/route/<edit>`, `/s/<guild>/api/trains/<party id>/routes`, `POST …/move/<press>` and `POST …/conductor/<change>` (`trainRoutes`, `src/web/train-routes.ts`); the region editor's `/s/<guild>/regions/edit`, `/s/<guild>/api/regions/edit`, `POST /s/<guild>/api/regions/preview` and `…/save` (`editorRoutes`, `src/web/editor-routes.ts`). `/auth/login?next=<path>`, `/auth/callback`, `/auth/link/<guild>/<token>` and `/auth/link/<guild>/<token>/edit` (GET a page, POST the login), `POST /auth/logout` (`authRoutes`, `src/web/auth-routes.ts`). `/assets/<file>` the bundle.
 - Every redirect goes to a local path of a server's pages (`localPath`, `src/web/local-path.ts`: `/s/<snowflake>` and plain segments, no `//`, `\`, `..`, query, escape or line break, at most 200 characters) or to `/`; a `next` that is no such path is dropped. An open redirect is a finding.
 
 ## Sessions and CSRF
@@ -29,7 +29,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4S; spec `docs/superpow
 
 - With Discord (only with `DISCORD_CLIENT_SECRET`; else both routes are 404): `/auth/login` sets `__Secure-pine_oauth` (`oauthCookieName`: plain `pine_oauth`, without Secure, on http of this machine; the state, 16 random bytes, and the page to return to; HttpOnly, path `/auth/`, ten minutes; `__Secure-` rather than `__Host-` because of its path) and sends the member to Discord's consent page for the scope `identify`; `/auth/callback` deletes that cookie whatever happens, checks the state in constant time, exchanges the code (`OAuthGateway`, `src/web/discord-oauth.ts`: `DiscordOAuth` over `fetch`, ten seconds, each answer read up to 64 KB with `readLimitedJson`, failures as a few words; `FakeOAuth` in tests), asks who the token is (`global_name ?? username`), starts a session and returns to the page. Any failure returns with `?login=failed`; the token is used once and never kept.
 - With a link of `/maps` or `/region edit` (`LoginLinks`, `src/web/login-links.ts`, on `ctx.loginLinks`): 32 random bytes, kept by their SHA-256 in a `BoundedMap` of 10,000, five minutes, once, for one member, one server and the page it opens (`LinkPage`: `map`, or `regions/edit`, whose address ends in `/edit`: an expired link is known no more, so the address says where `?login=expired` lands; a valid link opens its own page whatever address it came by), named as the account is (`globalName ?? username`, as the login with Discord names it: one login serves every server). `GET /auth/link/<guild>/<token>` (and HEAD) uses nothing up: it answers a short page without script (`buttonPage`, `src/web/answers.ts`) whose form POSTs to the same address, so that a link preview or a prefetch cannot spend the link. The button names the account: "Continue as <name>" (`loginLinks.peek(token, now)`, which spends nothing; the name stored with the link, HTML-escaped), because one click on somebody else's link logs you in as them, and the page is where you see whose it is. An unknown, used or expired link, or one of another server, shows plain "Continue" and nothing else (its POST lands on `?login=expired`). `POST /auth/link/<guild>/<token>` (and `…/edit`) checks that `Origin` is `publicUrl` (else 403), uses the link, starts a session and redirects (303) to the link's own page without the token (`/s/<guild>/map`, or `/s/<guild>/regions/edit` for a link of `/region edit`, whatever address it came by); an unknown, used or expired link (or one of another server) leads (303) to the page its address names with `?login=expired`: the map, or with `/edit` the region editor, so that an expired editor link lands on the editor. The guild is in the address so that an expired link still lands on its server's pages. The auth routes take an `application/x-www-form-urlencoded` body (the form's, empty) and ignore it.
-- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`); over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words).
+- Rate limits per client (`RateLimiter`, `limitedPerAddress`, `src/web/rate-limit.ts`; fixed windows in a `BoundedMap`, a refused request counted too): `/auth/*` 20 a minute, `/s/*/api/me` 60 a minute, `/s/*/api/geo` 60 a minute (a 304 counts), `/s/*/api/parties` 30 a minute (`PARTIES_PER_MINUTE`: a page asks three times a minute, more after presses, and a household shares an address), a party's presses 60 a minute (`PRESSES_PER_ADDRESS_MINUTE`), `/s/*/api/raid-options` and a raid's moves 30 a minute together (one limiter: a report form asks the first, a change form both), the reports and changes of raids 30 a minute (`RAID_WRITES_PER_ADDRESS_MINUTE`), `/s/*/api/wild-options` 30 a minute, the spawn reports 30 a minute (`SPAWN_WRITES_PER_ADDRESS_MINUTE`), the writes of trains 60 a minute together (`TRAIN_WRITES_PER_ADDRESS_MINUTE`: a route is laid a click a stop), a member's saved routes 30 a minute; over that 429 with `Retry-After`. The client is Fastify's `request.ip`: the peer's address, or with `trustProxy` the last address of `X-Forwarded-For` that was not added by a nearby proxy (Fastify's `trustProxy` is the function `isNearbyPeer`: loopback, RFC 1918, fc00::/7, link-local; Cloudflare and the other tunnels append the visitor to `X-Forwarded-For`). `CF-Connecting-IP` is never read: any peer that is believed could set it. IPv4 (also written as IPv6) counts by the address, IPv6 by its /64 (`addressBucket`, `src/web/client-address.ts`), which one home or machine has whole. Writes of 8M-2 to 8M-5 count against throttles per member (`Throttles`), and the region editor's previews and saves also against 30 a minute per address (`SAVES_PER_ADDRESS_MINUTE`); a press of a party's button counts in the router's own `Throttles` (`WebDeps.parties.throttles`, the `RouterOptions.throttles` of `src/app.ts`), in the window of the post's controls (`controlThrottleKey('party')`, `ACTION_THROTTLE`), so a member's clicks on the post and presses on the map are one budget; a report of a raid counts in `/raid`'s window (`RAID_COMMAND`, `RAID_THROTTLE`) and a change in that of its command (`/hatch`, `/end`, `/boss`, `/moveset`: `CHANGE_THROTTLE` under each name), a spawn report in `/wild`'s (`WILD_COMMAND`, `WILD_THROTTLE`), a new train in `/train`'s (`TRAIN_COMMAND`, `TRAIN_THROTTLE`), an edit of a route in its `/route` subcommand's (`route add` and the others, `CHANGE_THROTTLE`), a press of the Move train panel in the window of the post's controls (as the post's panel counts), the conductor's changes in `/conductor set`'s and `/conductor clear`'s, as the router counts the commands' uses (`throttledOnTheMap`, `src/web/acting.ts`, in the router's words).
 
 ## The public map
 
@@ -53,7 +53,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4S; spec `docs/superpow
 - **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum: `barred` from any of them 403, Discord unreachable 503; only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is: `{ user, guild, gym, outcome }`, "a raid was reported on the map", never the text.
 - **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403); whether the member may change it (`mayChangeRaid`: signed up for it, as `mayArrange` has it, or staff by the commands' `isManagement`, an admin or a moderator by role or the bot's owner, `isMapStaff` of the member fetched fresh; 403 "Only members signed up for this raid, and moderators, can change it here." otherwise); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. The commands themselves let anybody in the post change a raid; the map, which crosses forums (spec 2.5), asks a sign-up or staff (spec 3.6). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
 - **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, and after the raids in the popup of a gym that shows raids, `gymRaidsPopup`'s `extras`, since an elite raid can be beside a standard one), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go; once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise.
-- **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S (below); trains and meetups are 8M-5; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
+- **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S (below); trains are 8M-5 (below), meetups 8M-5M; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
 
 ## Spawns on the map (plan 8M-4S)
 
@@ -62,6 +62,16 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4S; spec `docs/superpow
 - **A report** `POST /s/<guild>/api/spawns`, body `{ pokemon, details, iv?, lat, lon, region? }` (strict: `pokemon` as `/wild` takes it, a key of the list or typed, 1 to 100 characters; `details` up to 200, blanks allowed so that they are refused in `/wild`'s words; `iv` `perfect` or `zero`; the point, latitude and longitude in range, kept to six decimals; the region's id when the point lies in several). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); where: the regions of this server whose outlines hold the point (`regionsAtPoint`, `src/services/region-directory.ts`: one per channel, in the regions' order), none 422 in `/wild`'s words for a pin outside them (`PIN_NOT_HERE`), several without one of them picked 422 `{ ok: false, text: "This point lies in several regions: pick the one to report the spawn in.", regions: [{ id, name }] }` (any region of the server, spec 2.5; names as the raids' list names them); the region by an id the body names counts only where the point lies in several (a point in one region is reported there whatever it names); the forum of the region picked (`memberAccess`: `barred` 403, as for a raid there; a region without a forum is not asked) and its text channel, where the report goes (`PartyGateway.ownViewDenied`: an overwrite of the member's own that denies View Channel 403, with a forum or without one; not asked of an administrator, whom Discord shows every channel, the server's owner included (`MemberStanding.administrator`); Discord unreachable 503 for either); the limit: a role's overwrite that denies View Channel on the text channel is not looked at, as the raids' checks look at none on the region's channel; `/wild`'s readers (`readSpawn`: 422 in its words as `pageWords` text, "Mewtwo does not appear in the wild.", "Say in details where …") and the pin (`PlaceFinder.pin(row, point, null)`: named by the nearest gym, PokéStop or power spot within 50 m, else a dropped pin), as `/wild`'s guard reads them; only then `/wild`'s throttle in its window (`throttledOnTheMap`, `WILD_COMMAND`, `WILD_THROTTLE`: five in half an hour from Discord and the map together, 429 "You can use /wild again in 30 minutes."), so that a report refused for who reports, where or what is not counted; then `reportSpawnAs` as the member (named by the name Discord has now, `ActingMembers`, as `/wild` names the member who uses it: spawns have no privacy setting), the point as the report's `near` (a `DroppedPin`: the region's message, the Unown copy and the DMs show it as `/wild near:` with a pin shows it), and who wants the Pokémon is told (`NotifyService.spawnReported`, through `DmSender`). The answer (`SpawnAnswer`): 200 `{ ok: true, text: "Reported: a wild Dratini near The Stacks.\nThe report is removed in 30 minutes." }` (`/wild`'s words without the report's link; a pin named by nothing is "at your pin"), 422 `{ ok: false, text }` for a report that was not made (the channel gone, the bot not allowed to post there: "I am not allowed to post in #west, …", a channel the bot sees no name of as `Region 1`), 503 with `Retry-After: 60` and `{ error: "I am restarting just now, so the report was not made. Report it again in a minute." }` for one that came while the bot shuts down (`kind` `closed`: no refusal, the page may try again). Nobody is named in an answer. Logged at info as a command is: `{ user, guild, region, outcome }` (`posted`, `not-made` or `closed`), "a spawn was reported on the map", never a text or the point.
 - **The page** (`src/web/client/spawn-forms.ts`, pure: "Report spawn here" (`spawnBox`), the regions a point lies in by the outlines of `/api/geo` (`regionsAt`, `ringContains`), the form as a tree of nodes, its body, reading an answer, `sendSpawnForm` over `pressParty`; the DOM side `spawn-ui.ts`): for a member while the map is not read-only (`reportOffered`, as "Report raid"), a long press or a right click on the map (Leaflet's `contextmenu`, which it also fires for a long press on a phone) opens the form in a popup of its own at that point (`spawnAt`; with another form open it says "Close the form that is open first." and opens nothing; at a point in no region of the map's outlines it says "That point is not in a region of this server." at once and opens nothing, `pressedWhere`: the server still decides by its own outlines, at their edges too), and "Report spawn here" in a gym's popup (its own, and that of a gym that shows raids, after "Report raid") opens it in place of its button, the gym's place being the point (the map shows no Wayspots, so no Wayspot popup has it). The form (`spawnForm`): the Pokémon, typed and picked by name from a `datalist` of the pick list (the browser filters it), sent as its key when the name is one of the list's (whatever its letter case), else as typed for the server to read; "Where it is" (required: "Say where it is first: …", the page's own); the IVs, "Not checked" by default; the region where the point lies in several of the map's outlines; whenever the server's answer names regions, the form is drawn again with those, keeping what was filled in (`redrawnAfter`: a region picked stays picked only while it is among them). It is held like the raid forms (`FormHold`: the hold taken before the list is asked for, the controls that open a form, `data-spawn` among them, off meanwhile, a popup's content held, `ready` before it is drawn); a success is said in the notice and closes the form; a refusal is said under the form and in the notice. Spawns are not drawn on the map.
 
+## Trains on the map (plan 8M-5)
+
+- **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The panel of the post keeps its own answer (it draws itself anew); the map calls the same service methods with the same `from`, `target` and `first`, and words Reverse and the mode with `reverseRouteAs` and `setAtEndAs`. The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
+- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `panel` (`trainPanelOf`: as the post's "Move train…" opens it, none for who may not move the train, a train without a route, or while read-only; where the train is, `placeOf`; the moves `cannotMove` allows, each with where it leads, `targetOf`; the gym the route begins with where `cannotReverse` allows Reverse; the mode) and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The route is the version of the route (below). Nothing of it while read-only.
+- **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
+- **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, gym }`), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train."); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer but `gone` carries the train as the member sees it now. The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
+- **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`), `finish` (`{ from }`), `reverse` (`{ from, first }`), `at-end` (`{ from, atEnd }`): the Move train panel, each press carrying where the panel was drawn and where it leads, as the post's controls carry them; the same checks in the same order, who may being `mayNotMove` (the mode: `mayNotArrange`, as `setAtEnd` decides), and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as a press of the panel counts; then `moveTrainAs` (the command's words, where the train is now, "I am telling the others."), `reverseRouteAs` ("The route is reversed. " and where the train is), `setAtEndAs` (`atEndSentence`). The movement message in the post pings as for any move. Logged "a train was moved on the map". **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted), then a sign-up to take the role, the conductor or staff to drop it (403 in their words), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
+- **Words:** `pageWords` also writes the bot's masked links as their text (`whereText` links every stop), read in the same one pass from the left as escapes and markdown, so that a bracket a member escaped begins no link.
+- **The page** (`src/web/client/train-forms.ts`, pure: the start form and its body, a train's actions, the route editor and the bodies of its edits, the Move train panel and the body of a press, reading an answer, `sendTrainForm` over `pressParty`; the DOM side `train-ui.ts`): for a member while the map is not read-only, "New train" in a box at the top of the side panel (`#parties`, now shown for such a member also without parties) opens the start form there (name, region from `/api/geo`, start, mode); a train's popup (and its item in the side panel, where trains the map cannot draw are listed: no route yet, or none of its gyms on the map) gains `trainActions`: "Edit route" (`may.arrange`), "Move…" (`panel`), "Be the conductor", "Stop being the conductor" or "Take the conductor off", and "You are its conductor." / "It has a conductor.". **Route mode** ("Edit route", and at once after a new train is made by who may arrange it): the route editor in the side panel box (the stops numbered as stored, the train's marked; for who may arrange it (`may.arrange`) up, down, a "move to" list of every position (one `/route move`, so that a stop goes far in one edit) and remove per stop, rather than dragging; "Clear the route" for who may; the saved routes to load or forget; a name to save the route under; Done), the stops numbered on the map over a dashed line (`routeMarkers`; a `divIcon` whose `html` is an element of ours with the number as text, never a string), and a gym clicked (or Enter on a focused one), its dot or the marker of its raids, added as the next stop without its popup opening: Leaflet opens a bound popup before any handler of ours, so the gyms' layers have Leaflet's click and keypress handlers taken off and open their popup from ours, which in route mode adds the stop instead (`gymClicks`, `gymClicked`). The edits run one at a time (`RouteEdits`): a gym clicked while an edit is on its way waits for its turn, its body made from the train the answer before gave (so quick clicks do not refuse each other as `route-edited` and burn the throttle), and the editor's controls but Done are off meanwhile; each answer redraws the editor and the numbers from the train it gives, also after a 409; an answer that the train is gone (409 without a train, `routeModeEnds`) ends route mode, any other without a train (429, 503, a broken connection) is said and changes nothing. **The panel** ("Move…") opens in the train's popup in place of its actions: where the train is, the moves with their targets, "Reverse the route", the mode with Set, Done; it stays open after a move, as the post's does, drawn anew from the answer's train with the words under it, also after a press that no longer fits; the list is asked for again after each move and drawn once the panel or its popup closes; Done draws the map with the train's popup open again, and so does a move after which the member may move it no more (no panel). The conductor's buttons press at once with `conductorBody`. One form or mode at a time (`FormHold`, shared with the raid and spawn forms: route mode and the start form take it as forms of the trains' box (`take(false, true)`, `aside`), the panel as one of a popup or a side panel item; `formControls` also turns "New train", "Edit route" and "Move…" off). The list waits under a form, but for one of the trains' box, which a redraw of the side panel keeps: under route mode and the start form the list is drawn (the controls that open another form turned off again after each draw), and the line of the train being routed is left to route mode's numbers (`drawnTrains`).
+
 ## The region editor (plans 8M-2, 8M-2F)
 
 - **Who:** staff for regions as `/region` admits them, decided per request by `RegionStaffSource.check` (`DiscordRegionStaff`, `src/discord/web-staff.ts`: the member fetched fresh, `fetchGuildMember(…, true)`, then `regionStaffAnswer`, `src/web/region-staff.ts`): an admin, a moderator or a bot developer by role, or the bot's owner (`isBotManagement`, the guard's own check), who also has Manage Server (`/region`'s `default_member_permissions`, which on the web nobody else checks); their own Manage Channels says whether new channels may be made and forums deleted. A server that grants `/region` to a role through its Integrations overrides (Server Settings, Integrations) still needs Manage Server for that role's members on the web: the overrides are not read (Matt, 2026-10-16: Manage Server is kept). `staff`, `not-staff`, `not-member`, `unknown-server` (no `Guild` row yet), or `unreachable` (Discord failed: read-only for staff seen within 30 minutes, 503 for anybody else, nothing written). The session says only who.
@@ -74,8 +84,8 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-4S; spec `docs/superpow
 - **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, power spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
 - **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
 
-## Adding a route (8M-5)
+## Adding a route
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
-- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs`, `changeRaidTime` and `reportSpawnAs` are), with the command's own throttle per member (`throttledOnTheMap`), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write; a forum Discord cannot say anything of is `unreachableOnTheMap`, 503; a GET of a member's data asks `memberOrFailure`, all in `src/web/acting.ts`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
-- Answer failures through `sendFailure` and refusals with the command's words, made text of the page by `pageWords` (`src/web/page-words.ts`: Discord's timestamps as clock times in the posts' zone, the bot's markdown taken out, `unplain`); a mention of a post or a channel the page cannot show is named by the caller's namer (`ReportNames`, `PostNamer`, `SpawnNames`), not left as `<#id>`. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
+- Every POST: the per-address limit and `postGuard(…)` in `onRequest`, before the body is read (as the region editor's saves and the presses of 8M-3 do), a body validated with zod, the limit of 16 KB unless the route says otherwise; call the service the command calls (never a repository or Discord directly), through the command's own code path where its handler does more than call it (factor it into a function both call, as `pressStatus`, `reportRaidAs`, `changeRaidTime`, `reportSpawnAs` and the functions of `train-changes.ts` are), with the command's own throttle per member (`throttledOnTheMap`), counted in the router's `Throttles` under the command's or control's key (`controlThrottleKey`), as the presses of 8M-3 are, and only after every check that refuses for who asks or what they name (membership, the party, access), so that a refused write is not counted and nobody but a member learns which ids exist; act as the member fetched fresh (`actingOnTheMap` over `ActingMembers`, the same checks in the same order as every write; a forum Discord cannot say anything of is `unreachableOnTheMap`, 503; a GET of a member's data asks `memberOrFailure`, all in `src/web/acting.ts`), and share the handler's code path rather than copy it (`pressStatus`); log a write as a command is logged (member, server, what), never the texts.
+- Answer failures through `sendFailure` and refusals with the command's words, made text of the page by `pageWords` (`src/web/page-words.ts`: Discord's timestamps as clock times in the posts' zone, the bot's markdown and masked links taken out, `unplain`); a press drawn from a state of a party that may have changed carries that state (a place, a target, the route) and the service refuses it inside the store, 409 with the party as it is now; a mention of a post or a channel the page cannot show is named by the caller's namer (`ReportNames`, `PostNamer`, `SpawnNames`), not left as `<#id>`. Anything the page shows from data is set as text. A new outside host the page loads from goes into `securityHeaders` (and its test), never as an inline exception.
diff --git a/docs/superpowers/plans/2026-10-17-phase-8m5-staging.md b/docs/superpowers/plans/2026-10-17-phase-8m5-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..db2d704d05a1201e524747b64c9f66f088900d36
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8m5-staging.md
@@ -0,0 +1,50 @@
+# Phase 8M-5 staging checklist: trains from the live map
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the map in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator) and **Tester** (Matt, a member without a staff role).
+
+## Before
+
+1. No migration and no command change in this plan (`/train`, `/route`, `/next`, `/previous`, `/skip`, `/finish`, `/conductor` keep their options, names, help and answers): no deploy. `npm run build` (it runs `npm run web:build`): a new `dist/web/assets/map-<hash>.js` and `map-<hash>.css`.
+2. Tester's `/settings auto-status` is Interested and privacy as it is; note a gym of West, three more of West and one of East.
+
+## Starting a train
+
+3. Logged out, and as somebody who is no member (or without the map's member role): no "New train" in the side panel, no train's actions in a train's popup.
+4. Googer logs in with `/maps`. The side panel shows "New train" at its top (also with no parties at all). Click it: the form takes its place (Name, Region with "Pick the region", Starts, At the end "Finish at the last stop"); "New train", "Report raid", "Report spawn here", "Edit route" and "Move…" elsewhere are greyed out while it is open. Start with nothing typed: "Give the train a name first."; with a name and no region: "Pick the region first.".
+5. Name "Staging loop", region West, Starts `6:15pm` (a time later today), At the end "Loop", Start: the notice says "Your train is made. It starts at 6:15 PM. Click gyms on the map to add its stops."; the form closes and route mode opens at once (step 6). On Discord: West's forum has the post, the maker named as Googer's privacy says, Googer signed up as their auto-status says, its start 6:15 PM from the first (no line "… set the start" after it), "loops" where the mode shows; whoever asked to hear of new trains got the DM (as for `/train`), which says the start 6:15 PM. With Googer's `/settings auto-status` None, a second train's answer adds "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor." (set it back afterwards).
+6. Refusals in the commands' words, as text, the form kept: Starts `soonish` "I could not read "soonish" as the time the train starts. Try 6:15pm, …" (no backticks); a region without a forum (if the test server has one) "The region #… has no forum yet. A moderator can create it with /admin setup-forums."; a third train within a quarter of an hour (from the map and `/train` together): "You can use /train again in 15 minutes.". The refusals before it count nothing.
+
+## The route on the map
+
+7. Route mode: the side panel shows "Route of Staging loop", "Click a gym on the map to add it as the next stop.", "No stops yet.", the saved routes ("You have no saved routes for this region." or the list), Done. Click the gym of West: no popup opens, not even for a moment; the notice and the editor say "<gym> is stop 1 of the route. The train is there now."; the map shows a numbered marker "1" at it (filled: the train is there). Click three more gyms of West and the gym of East (a gym whose marker shows a raid too): numbered 2 to 5 over a dashed line; the editor lists them, the first marked "(the train is here)". The post on Discord says each line ("Googer added stop 2 to the route: …"), and the copy in East's channel appears (a stop in East). (The map shows only gyms of the server's regions; a gym id of another server sent by hand is 404, covered by the route tests.) Three gyms clicked quickly one after the other: all three are added in the order clicked, none refused with "The route changed meanwhile"; the editor's buttons are greyed out (Done stays) until the last answer came. Outside route mode a click on a gym (and Enter on a focused raid marker) opens its popup as before.
+8. ↑ on stop 3: "<gym> is stop 2 of the route now."; the numbers on the map follow. Stop 5's "move to" list, #1: "<gym> is stop 1 of the route now." in one edit. ✕ on stop 4: "<gym> is off the route, which has 4 stops now.". "Clear the route" is offered to Googer (a moderator), not to Tester (step 12). While route mode is on, the side panel's list and the other trains on the map still follow the 20-second refresh; the routed train's own orange line is not drawn (its numbered markers are), and "Edit route", "Move…", "Report raid" in popups opened meanwhile stay greyed out.
+9. A route changed behind the page: with the editor open in Googer's browser, Tester (or Googer on Discord) adds a stop with `/route add`; then ✕ on a stop in Googer's editor: "The route changed meanwhile: here it is as it is now."; the editor and the numbers show the route with the new stop; nothing was removed.
+10. Saved routes: type "Staging save" under "Save as", Save: "I saved this route as Staging save: 5 stops. At the end it loops back to the first stop. /route load puts it into a train of this region."; the list shows "Staging save (5 stops, loops)". Pick it, Forget: "I forgot your saved route Staging save."; the list is empty again. Save it once more; Clear the route; pick it, Load: "This train has the route Staging save now: 5 stops. It is at the first. …"; the movement is announced in the post only when the train was somewhere else (not from an empty route).
+11. `/route add`'s limit is one: ten edits a minute of the same subcommand between the map and Discord (`/route add` and gym clicks together); the eleventh "You can use /route add again in 1 minute.". Done ends route mode: the editor gives way to "New train", the numbered markers go, the map draws the train's line and marker anew with the train's popup open. A train ended (`/delete` in its post) while its route editor is open: the next edit says "This train is over." and route mode ends.
+
+## Moving on the map
+
+12. Tester logs in (Tester is signed up for the train by Join in its popup). Tester's train popup has "Edit route", "Move…", "Be the conductor"; no "Clear the route" in Tester's route editor. A member who is not signed up (Tester before Join) sees none of these.
+13. Tester opens "Move…": the panel takes the place of the actions in the popup, "Move the train", "At stop 1 of 5: <gym>", Next, Skip, Finish (Previous at the first stop of a loop: also, leading to the last stop), Reverse the route (a loop at any stop), At the end with Set, Done. Next: the panel stays open, drawn anew at stop 2 ("At stop 2 of 5: <gym>"), the words "The train is at stop 2 of 5: <gym>. Next is <gym>. I am telling the others." under it and in the notice; Next again moves it on from there. Done: the map refreshes with the train's marker where it is and its popup open again (closing the popup instead also draws the map as it is). On Discord: "The train is moving to <gym>. Moved by Tester." and a ping for Googer (who allows train stop pings).
+14. Two windows open the panel at the same stop; Next in one, then Next in the other: "The train has moved on meanwhile.", the panel drawn anew where the train is now; the train moved once. A stop removed in route mode while a panel was open: Next there "That button no longer leads where it said.".
+15. Reverse the route: "The route is reversed. The train is at stop …"; the post says "The route was reversed by Tester: …" without a ping. At the end "Finish at the last stop", Set: "At the end it finishes the route."; the post's line says it.
+16. Conductor: Googer "Be the conductor": "You are the conductor of this train. Only you and the moderators can move it now."; Googer's popup says "You are its conductor." with "Stop being the conductor"; Tester's says "It has a conductor." and Tester has no "Move…" any more (a move sent by hand: 403 "This train has a conductor: only they and the moderators can move it."). Tester "Be the conductor" takes it over ("You are the conductor of this train, in the place of the conductor before. …": nobody named). Googer (a moderator) sees "Take the conductor off": "This train has no conductor any more. Anybody who is signed up can move it.". A conductor's button drawn before the role changed (Googer's popup open while Tester takes the role on Discord with `/conductor set`, then Googer's "Stop being the conductor"): "The conductor of this train changed meanwhile: here it is as it is now.", the popup drawn anew with "It has a conductor."; the role stays Tester's.
+17. The panel's presses count with the post's buttons (thirty a minute together: "That was a lot of clicks. Try again in …"); the conductor's in `/conductor set`'s and `/conductor clear`'s windows.
+
+## Access, read-only, logs
+
+18. A forum Tester is kept out of (an overwrite for Tester that denies View Channel on West's forum): the train is not in Tester's list; a write sent by hand to it answers 403; "New train" in West answers 403, in East goes through (end that train with `/delete` or let it be). Remove the overwrite afterwards.
+19. While Discord cannot be reached (not staged: covered by the route tests): the list read-only, no "New train" and no train actions; writes 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment.".
+20. One form at a time: with a raid form open in a gym's popup, "Edit route", "Move…" and "New train" are greyed out; with route mode on, a right click on the map says "Close the form that is open first."; with a raid change form open in the side panel's list (a raid at a gym the map does not show), the list is not drawn anew under it.
+21. The bot's log: "a train was started on the map" (`user`, `guild`, `region`, `outcome`), "a train's route was changed on the map" (`party`, `edit`, `outcome`), "a train was moved on the map" (`move`), "a train's conductor was changed on the map" (`conductor`); never a train's or a saved route's name.
+
+## Afterwards
+
+22. End the staging trains (`/delete` in their posts, or let them run out), forget Googer's saved route "Staging save" (`/route forget` or the editor), remove any overwrite of step 18.
+
+## Left open (to the follow-ups if not settled here)
+
+- For Matt: gym clicks keep `/route add`'s window (ten a minute, `CHANGE_THROTTLE`, the command's own key, as ruled): laying a route of twenty stops takes about two minutes (the clicks wait in line, the eleventh in a minute is refused "You can use /route add again in 1 minute."). A looser window for the map would be a ruling of its own.
+- For Matt: a train made on the map is made with its start time (read as `/meet` reads it), counted in `/train`'s window only (not also `/meet`'s).
+- Stops are reordered with ↑, ↓ and a "move to" list rather than by dragging; whether dragging is wanted is for staging to show.
+- Meetups from the map are plan 8M-5M (after 8S-1).
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m5 HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m5-staging.md` prints nothing; then `npm run check`, `npm run build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other. The new and changed test files with timers or waits (the train routes', the route queue's) ten times in a row.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`, `src/app.ts`, `package.json` and `package-lock.json`), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when the main checkout is clean and the cutover session is not committing (ask it). Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-5": the rulings and "Made while prototyping" above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-5.<n> <commit>` per task, then `review`), the ledger and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-17-phase-8m5-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application: `npm run build`, Matt starts the bot; two accounts: a train started, routed by clicking gyms and moved from the map, with its post, its movement messages and the new-train DMs.
