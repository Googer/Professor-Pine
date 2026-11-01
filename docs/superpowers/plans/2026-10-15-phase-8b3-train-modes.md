# Phase 8B-3: Train Modes, Reverse and the Move Train Panel as a Components-v2 Message: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A raid train finishes, loops or turns back at the end of its route (an option of `/train`, a menu in the Move train panel, kept with a saved route); a Reverse button turns the route round where the rules allow; the private panel behind "Move train…" becomes a components-v2 message.

**Architecture:** The third of the plans of 8B (8B-1 the DMs, member lists, spawn reports and summary; 8B-2 `/counters`, `/rank`, `/help`; 8B-3 trains; 8B-4 every embed left, after the Wayfarer plan 8W-1 is merged back, since both change the gym files). The mode is a field of the train (`train.atEnd`, state document version 9); every move is decided by pure functions of `src/domain/party/train.ts` (`destinationOf`, `cannotMove`, `reverseRoute`, `setAtEnd`), inside the store; a turn or a Reverse rewrites the stored route in the other order, so the post's list, the stop numbers and every reader work as before. Saved routes keep the mode in a new column of the legacy table `SavedRoutes` (migration 013, additive).

**Tech Stack:** TypeScript 6.0, discord.js 14.27 (components v2, a string select in a message), Kysely, Vitest. No new dependency. **One migration** (`2026_10_16_013_saved_route_at_end`) and **one command definition changed** (`/train`'s option `at-end`): `npm run deploy-commands -- --global` before staging.

**Spec:** the design brief `.superpowers/sdd/2026-10-15-phase-8b3-train-modes/design.md` (git-ignored; T1–T5), from Matt's approved drafts https://claude.ai/artifact/NdZ5QAHbwHagu76w7Fzy1X (version 3) and the follow-ups note "Future enhancement (Matt, 2026-10-13): trains that loop or turn back".

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8b3`), one commit per task, each commit typechecked with its own tests green, and the full check and build clean on the tip (5,661 unit tests; the database tests of the files it touches, 63). Two Opus reviewers went through that branch (the domain and services; the post, panel and docs), a third reviewer through the fixes, which are folded into the commits below.

## Decisions in this plan

Matt's (2026-10-15): the mode is set by `/train` and by a menu in the panel; a turned or reversed route is listed in its new order and renumbered; the mode is kept with a saved route; a Loop train may be reversed at any stop, which changes only the order, never the mode; Previous is off at stop 1 for Finish and Turn back trains; a change of the mode is said in the post without a ping.

Made while prototyping, to look at in staging:

1. **Who sets the mode:** whoever may arrange the route (`mayArrange`: signed up, or a train's maker), and staff; it never moves the train. A member who may set it but not move the train (a conductor leads) gets the mode set and the panel closed with the reason.
2. **Reverse** is offered on a Finish train at stop 1, at the last stop, and on a route finished from its last stop (it then starts again from that gym); on a Loop train at any stop (a finished one as a Finish train); never on a Turn back train or a route of fewer than two stops. Its button carries the first gym of the route as drawn, so a second press of one panel is refused ("That button no longer leads where it said.").
3. **Routes of one stop** behave as Finish in every mode, and the post and `/route show` say nothing of the mode there.
4. **Loop:** Skip wraps past the end; Previous from stop 1 goes to the last stop and is announced as "moving back". **Turn back:** Skip at the last stop lands two stops back; at the second-to-last stop it is refused.
5. **The movement message** names a round ("going round again") or a turn ("turning back at …") only when the last gathered step made it and the train is still where that step took it.
6. **The mode menu** carries where the train was, like every panel control: a pick on a stale panel is refused and the panel drawn anew. Its closed form reads as in the draft ("Loop: back to the first stop").
7. **Saved routes:** `/route save` / `/route load` answer with the mode in a sentence (Finish too), `/route show` ends with it; the public "loaded" line in the post leaves out the Finish sentence. The autocomplete of routes adds ", loops" / ", turns back".
8. **Panels opened before the deploy** (plain text) still work: a press does its move, the old panel says it was replaced, and the new v2 panel follows privately. Whether Discord would take a direct v2 update of such a message was not tried.
9. **Migration 013:** Wayfarer's 8W-1 holds 012, and Kysely refuses a migration that sorts before one already run: do not migrate the dev database with 013 before 012 is merged and applied. Starting the bot migrates too, so 8B-3 is staged only once 8W-1 is merged; if 013 ran first, delete its row from `kysely_migration` and start again (013 does nothing when the column exists). (Corrected after the final review.)

Left open (also in the staging checklist): nothing beyond item 8.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network.** `src/db/types.ts` is generated (task 2 carries its regenerated content).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8b3`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green; the full `npm run check` and the build after the last task (one after the other, never two at once). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Every mode × move at every position, also routes of 1 and 2 stops (the oracle in `train.test.ts`); a finished route; `finishedFrom` kept honest across turns and Reverse.
2. No stale or double press moves or flips the train wrongly (`from`, `target`, Reverse's `first`), every decision inside the store.
3. The state document reads versions 1 to 8 as `finish`; migration 013 additive and safe for the legacy bot.
4. Nothing Discord would refuse: the panel and the post in their worst cases, the menu, custom ids.
5. CLAUDE.md and the staging checklist match the code.

### Task 1: Train modes in the domain: a train finishes, loops or turns back at the end of its route

Prototype commit: `a166463fea4853615301e3302d2ea9914fcd403c`

TrainDetails.atEnd (TRAIN_AT_END), state document version 9 (versions 1 to 8 read
as finish), the moves by mode (destinationOf, turnAhead), reverseRoute with
cannotReverse, setAtEnd, a loaded route with its mode; the rules table as tests.

**Files:**

```
 src/db/repositories/party-repository.db.test.ts |   2 +
 src/domain/party/party-state.test.ts            |  65 ++++++-
 src/domain/party/party-state.ts                 |  94 +++++++--
 src/domain/party/party.ts                       |  23 +++
 src/domain/party/tick.train.test.ts             |   1 +
 src/domain/party/train.test.ts                  | 455 +++++++++++++++++++++++++++++++++++++++++++-
 src/domain/party/train.ts                       | 309 +++++++++++++++++++++++++-----
 src/render/activity.ts                          |   8 +
 src/render/train-panel.ts                       |   4 +-
 9 files changed, 884 insertions(+), 77 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/party/party-state.test.ts src/domain/party/tick.train.test.ts src/domain/party/train.test.ts`, and the database tests `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/party-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff a166463fea4853615301e3302d2ea9914fcd403c -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b3-train-modes.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Train modes in the domain: a train finishes, loops or turns back at the end of its route`, the body above and the trailer, staging exactly
  `src/db/repositories/party-repository.db.test.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/tick.train.test.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/activity.ts src/render/train-panel.ts`.

````diff
diff --git a/src/db/repositories/party-repository.db.test.ts b/src/db/repositories/party-repository.db.test.ts
index dfd16da8ed0f3c9cb614baedce29efca4724e383..5ea3db74d56ba544cbb72d31c894b1e8110e8652 100644
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -157,6 +157,7 @@ describe('PartyRepository', () => {
         route: [2, 1],
         stop: 1,
         finishedFrom: null,
+        atEnd: 'loop',
         conductorId: ALICE,
         boss: { key: 'yveltal' },
       },
@@ -191,6 +192,7 @@ describe('PartyRepository', () => {
         route: [1],
         stop: 1,
         finishedFrom: 1,
+        atEnd: 'turn-back',
         conductorId: null,
         boss: { name: 'Newmon' },
       },
diff --git a/src/domain/party/party-state.test.ts b/src/domain/party/party-state.test.ts
index e0344fcc3d3385fd34329ed092140cc0dc1f90b9..e63b526e24164a9637dbcbcc641dbef88d359271 100644
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -14,10 +14,12 @@ import {
   MAX_MEETUP_DESCRIPTION,
   MAX_PARTY_NAME,
   MAX_ROUTE_STOPS,
+  TRAIN_AT_END,
   type MeetupParty,
   type MirrorMessage,
   type Party,
   type RaidParty,
+  type TrainAtEnd,
   type TrainParty,
 } from './party.js';
 import { PartyStatus } from './status.js';
@@ -138,7 +140,7 @@ describe('party state', () => {
       party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
     });
     // Nothing was added to the document for it: the version is what it was.
-    expect(document.v).toBe(8);
+    expect(document.v).toBe(9);
     // There were no shadow EX raids, and there are no shadow elite raids: still refused.
     const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
     expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
@@ -153,7 +155,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(8);
+    expect(state.v).toBe(9);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -214,7 +216,7 @@ describe('party state', () => {
     expect(problem(state, { ...columns, type: 'train' })).toBe(
       'a train without its name and start',
     );
-    expect(problem({ ...state, v: 9 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 10 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -575,6 +577,7 @@ function fullTrain(): TrainParty {
       route: [4, 1, 7],
       stop: 1,
       finishedFrom: null,
+      atEnd: 'finish',
       conductorId: ALICE,
       boss: { key: 'yveltal' },
     },
@@ -616,6 +619,7 @@ describe('the state of a train', () => {
       route: [4, 1, 7],
       stop: 1,
       finishedFrom: null,
+      atEnd: 'finish',
       conductorId: ALICE,
       boss: { key: 'yveltal' },
     });
@@ -623,6 +627,7 @@ describe('the state of a train', () => {
       route: [],
       stop: 0,
       finishedFrom: null,
+      atEnd: 'finish',
       conductorId: null,
       boss: null,
     });
@@ -635,6 +640,7 @@ describe('the state of a train', () => {
         route: [4, 1, 7],
         stop: 3,
         finishedFrom: null,
+        atEnd: 'finish',
         conductorId: null,
         boss: { name: 'Newmon' },
       },
@@ -796,6 +802,59 @@ describe('the state of a train', () => {
     );
   });
 
+  it('keeps what a train does at the end of its route, and reads a version 8 train as one that finishes', () => {
+    for (const atEnd of TRAIN_AT_END) {
+      const train: TrainParty = { ...fullTrain(), train: { ...fullTrain().train, atEnd } };
+      expect(partyState(train).train?.atEnd).toBe(atEnd);
+      expect(partyFromStored(columnsOf(train), stored(partyState(train)), [])).toEqual({
+        ok: true,
+        party: train,
+      });
+      // Version 8 did not know the mode: what such a document says of one is not read.
+      const { atEnd: _mode, ...details } = partyState(train).train ?? {};
+      for (const old of [details, { ...details, atEnd }]) {
+        expect(
+          partyFromStored(columnsOf(train), stored({ ...partyState(train), v: 8, train: old }), []),
+        ).toEqual({ ok: true, party: { ...train, train: { ...train.train, atEnd: 'finish' } } });
+      }
+    }
+    // A raid and a meetup of version 8 are read as they are.
+    const raid = fullRaid();
+    expect(
+      partyFromStored(columnsOf(raid), stored({ ...partyState(raid), v: 8 }), raid.mirrorMessages),
+    ).toEqual({ ok: true, party: raid });
+    const meetup = fullMeetup();
+    expect(
+      partyFromStored(
+        columnsOf(meetup),
+        stored({ ...partyState(meetup), v: 8 }),
+        meetup.mirrorMessages,
+      ),
+    ).toEqual({ ok: true, party: meetup });
+    // A damaged version 8 train is reported as before.
+    const train = fullTrain();
+    const { atEnd: _mode, ...details } = partyState(train).train ?? {};
+    expect(
+      problem(
+        columnsOf(train),
+        stored({ ...partyState(train), v: 8, train: { ...details, stop: 9 } }),
+      ),
+    ).toMatch(/the train is at a stop beyond its route/);
+  });
+
+  it('refuses a mode it does not know, and a train of version 9 without one', () => {
+    const train = fullTrain();
+    const state = stored(partyState(train)) as Record<string, unknown>;
+    const withTrain = (details: object): string =>
+      problem(columnsOf(train), { ...state, train: { ...train.train, ...details } });
+    expect(withTrain({ atEnd: 'loop' })).toBe('read');
+    expect(withTrain({ atEnd: 'bounce' })).toMatch(/^state: /);
+    expect(withTrain({ atEnd: undefined })).toMatch(/^state: /);
+    expect(() =>
+      partyState({ ...train, train: { ...train.train, atEnd: 'bounce' as TrainAtEnd } }),
+    ).toThrow(/cannot be stored/);
+  });
+
   it('reads a version 4 document, which is a raid or a meetup and never a train', () => {
     const meetup = testMeetup();
     const old = stored({ ...partyState(meetup), v: 4 });
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index 3d2e7f95e1e5d6aba8dab72136028c2eadcfa6ae..55fe5023d21c1d9a7ad0edd3a5afbe9cdeff1484 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -9,6 +9,7 @@ import {
   MAX_ROUTE_STOPS,
   MIRROR_KINDS,
   TEAMS,
+  TRAIN_AT_END,
   type Attendee,
   type MirrorMessage,
   type Party,
@@ -35,10 +36,12 @@ import { PartyStatus } from './status.js';
  * remembers none. Version 7 added `makerName` (the display name of the member who made the
  * party), which a document of an earlier version does not have. Version 8 (plan 7B) added a
  * raid's `screenshot` (the screenshot it was reported from, and whether its time is a guess); a
- * raid of an earlier document has none. Documents of versions 1 to 3 are those of raids, and one
- * of version 4 is that of a raid or a meetup.
+ * raid of an earlier document has none. Version 9 (plan 8B-3) added a train's `atEnd` (what it
+ * does at the last stop of its route); a train of an earlier document finishes its route there.
+ * Documents of versions 1 to 3 are those of raids, and one of version 4 is that of a raid or a
+ * meetup.
  */
-export const PARTY_STATE_VERSION = 8;
+export const PARTY_STATE_VERSION = 9;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -162,29 +165,50 @@ const trainV5 = z
     for (const message of routeProblems(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** What does not hold of the stop a route remembers it was finished from. */
+function finishProblems(value: {
+  route: number[];
+  stop: number;
+  finishedFrom: number | null;
+}): string[] {
+  const { route, stop, finishedFrom } = value;
+  if (finishedFrom === null) return [];
+  // Only a finished route remembers the stop it was finished from, which is one of its own.
+  if (route.length === 0 || stop < route.length) {
+    return ['a route that is not finished remembers where it was finished from'];
+  }
+  return route.includes(finishedFrom)
+    ? []
+    : ['the route was finished from a gym that is not on it'];
+}
+
+/** The details of a train as versions 6 to 8 wrote them: read only, without its mode. */
+const trainV8 = z
+  .object({
+    route: z.array(gymId).max(MAX_ROUTE_STOPS),
+    stop: z.number().int().nonnegative(),
+    finishedFrom: gymId.nullable(),
+    conductorId: snowflake.nullable(),
+    boss: bossRef.nullable(),
+  })
+  .superRefine((value, context) => {
+    for (const message of [...routeProblems(value), ...finishProblems(value)]) {
+      context.addIssue({ code: 'custom', message });
+    }
+  });
+
 const train = z
   .object({
     route: z.array(gymId).max(MAX_ROUTE_STOPS),
     stop: z.number().int().nonnegative(),
     finishedFrom: gymId.nullable(),
+    atEnd: z.enum(TRAIN_AT_END),
     conductorId: snowflake.nullable(),
     boss: bossRef.nullable(),
   })
   .superRefine((value, context) => {
-    for (const message of routeProblems(value)) context.addIssue({ code: 'custom', message });
-    const { route, stop, finishedFrom } = value;
-    if (finishedFrom === null) return;
-    // Only a finished route remembers the stop it was finished from, which is one of its own.
-    if (route.length === 0 || stop < route.length) {
-      context.addIssue({
-        code: 'custom',
-        message: 'a route that is not finished remembers where it was finished from',
-      });
-    } else if (!route.includes(finishedFrom)) {
-      context.addIssue({
-        code: 'custom',
-        message: 'the route was finished from a gym that is not on it',
-      });
+    for (const message of [...routeProblems(value), ...finishProblems(value)]) {
+      context.addIssue({ code: 'custom', message });
     }
   });
 
@@ -234,6 +258,23 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 8, as plans 7B to 8B-2 wrote it: read only. It is version 9 without a train's mode. */
+const stateV8 = z
+  .object({
+    v: z.literal(8),
+    ...shared,
+    raid: raid.optional(),
+    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
+    timed: timed.optional(),
+    meetup: meetup.optional(),
+    train: trainV8.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 7, as plans 4A to 7A wrote it: read only. It is version 8 without a screenshot. */
 const stateV7 = z
   .object({
@@ -242,7 +283,7 @@ const stateV7 = z
     makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
     timed: timed.optional(),
     meetup: meetup.optional(),
-    train: train.optional(),
+    train: trainV8.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
   })
@@ -257,7 +298,7 @@ const stateV6 = z
     ...shared,
     timed: timed.optional(),
     meetup: meetup.optional(),
-    train: train.optional(),
+    train: trainV8.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
   })
@@ -337,14 +378,27 @@ function withScreenshot<T extends { raid?: z.output<typeof raidV7> | undefined }
   return old.raid ? { ...old, raid: { ...old.raid, screenshot: null } } : old;
 }
 
+/** A train of a document before version 9 finishes its route at the last stop, as it did. */
+function withAtEnd<T extends { train?: z.output<typeof trainV8> | undefined }>(old: T) {
+  return old.train ? { ...old, train: { ...old.train, atEnd: 'finish' as const } } : old;
+}
+
 /** Reads a stored document of any version this code knows, as the current version. */
 function readState(stored: unknown) {
   const version =
     typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
   if (version === PARTY_STATE_VERSION) return state.safeParse(stored);
+  const older = readStateV8(stored, version);
+  if (!older.success) return older;
+  return state.safeParse({ ...withAtEnd(older.data), v: PARTY_STATE_VERSION });
+}
+
+/** Reads a document of versions 1 to 8, upgraded to the shape of version 8. */
+function readStateV8(stored: unknown, version: unknown) {
+  if (version === 8) return stateV8.safeParse(stored);
   const older = readOlderState(stored, version);
   if (!older.success) return older;
-  return state.safeParse({ ...withScreenshot(older.data), v: PARTY_STATE_VERSION });
+  return stateV8.safeParse({ ...withScreenshot(older.data), v: 8 });
 }
 
 /** Reads a document of versions 1 to 7, upgraded to the shape of version 7. */
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index cc835c4392a2c0276560d55ae573f3285a0ac51c..940c9bd47ad725688b919f58d44c265e85e8621d 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -257,6 +257,19 @@ export interface MeetupParty extends PartyCore {
 /** A route has at most this many stops: more than a train gets to, and what one message lists. */
 export const MAX_ROUTE_STOPS = 50;
 
+/**
+ * What a train does when Next is pressed at the last stop of its route: it finishes the route
+ * (`finish`), goes round to the first stop again (`loop`), or runs the route backwards from
+ * there (`turn-back`). A route of one stop finishes in every mode: there is nowhere to go round
+ * or back to.
+ */
+export const TRAIN_AT_END = ['finish', 'loop', 'turn-back'] as const;
+export type TrainAtEnd = (typeof TRAIN_AT_END)[number];
+
+export function isTrainAtEnd(value: unknown): value is TrainAtEnd {
+  return typeof value === 'string' && (TRAIN_AT_END as readonly string[]).includes(value);
+}
+
 /** What only a raid train has (the functions that change it are in `train.ts`). */
 export interface TrainDetails {
   /** The gyms the train visits, by id, in order; no gym twice, at most `MAX_ROUTE_STOPS`. */
@@ -274,6 +287,8 @@ export interface TrainDetails {
    * removed under the train), and once that gym is no longer on the route.
    */
   finishedFrom: number | null;
+  /** What the train does at the last stop of its route (`TRAIN_AT_END`). */
+  atEnd: TrainAtEnd;
   /** Snowflake of the member who leads the train; null while nobody does. */
   conductorId: string | null;
   /** The Pokémon the train is after, when somebody said (`/boss`). */
@@ -428,6 +443,14 @@ export type PartyProblem =
   | 'at-first-stop'
   /** There is no stop after the next one. */
   | 'no-stop-to-skip'
+  /** A route of one stop has no other order. */
+  | 'one-stop-route'
+  /** A train that turns back at the end reverses its route by itself at the last stop. */
+  | 'reverse-turns-back'
+  /** The route can be reversed only at its first or last stop (a loop: anywhere). */
+  | 'reverse-mid-route'
+  /** A finished route can be reversed only when it was finished at its last stop. */
+  | 'reverse-finished-elsewhere'
   /** The gym is a stop of the route already. */
   | 'already-on-route'
   /** A route holds no more stops. */
diff --git a/src/domain/party/tick.train.test.ts b/src/domain/party/tick.train.test.ts
index e1e9fb204f598d6a5168c41cad51b5cdd4f470fc..b6d2a1ef59c2880a1cb06934513bbbd8b9e321e2 100644
--- a/src/domain/party/tick.train.test.ts
+++ b/src/domain/party/tick.train.test.ts
@@ -58,6 +58,7 @@ const boarded: TrainParty = {
     route: [4, 1, 7],
     stop: 0,
     finishedFrom: null,
+    atEnd: 'finish',
     conductorId: null,
     boss: { key: 'yveltal' },
   },
diff --git a/src/domain/party/train.test.ts b/src/domain/party/train.test.ts
index 514b4754a0f1f25144867e92dab2bf5b5434cc23..a0a8b8a759322215c017687d45476cbf3379fda3 100644
--- a/src/domain/party/train.test.ts
+++ b/src/domain/party/train.test.ts
@@ -30,7 +30,9 @@ import {
   MAX_ROUTE_STOPS,
   partyWord,
   remoteAllowed,
+  TRAIN_AT_END,
   type Change,
+  type TrainAtEnd,
   type TrainDetails,
   type TrainParty,
 } from './party.js';
@@ -40,6 +42,7 @@ import { OPEN_PARTY_HOURS, setStartTime } from './timed.js';
 import {
   addStop,
   cannotMove,
+  cannotReverse,
   clearConductor,
   clearRoute,
   createTrain,
@@ -52,11 +55,16 @@ import {
   placeOf,
   removeStop,
   replaceRoute,
+  reverseRoute,
   routeFinished,
+  setAtEnd,
   setConductor,
   setTrainBoss,
   targetOf,
   TRAIN_MOVES,
+  turnAhead,
+  type TrainMove,
+  type TrainTurn,
 } from './train.js';
 
 const HOUR = 3_600_000;
@@ -89,7 +97,14 @@ describe('createTrain', () => {
         saved: false,
         createdAt: PARTY_NOW,
         timed: { name: 'Saturday legendaries', startTime: null },
-        train: { route: [], stop: 0, finishedFrom: null, conductorId: null, boss: null },
+        train: {
+          route: [],
+          stop: 0,
+          finishedFrom: null,
+          atEnd: 'finish',
+          conductorId: null,
+          boss: null,
+        },
       },
     });
   });
@@ -399,6 +414,7 @@ describe('clearRoute and replaceRoute', () => {
       route: [],
       stop: 0,
       finishedFrom: null,
+      atEnd: 'finish',
       conductorId: ALICE,
       boss: { key: 'yveltal' },
     });
@@ -1014,3 +1030,440 @@ describe('a Finish that is taken back', () => {
     );
   });
 });
+
+/** The party a change answered; throws when it was refused. */
+function changed<T extends TrainParty>(change: Change<T, object>): T {
+  if (!change.ok) throw new Error(`refused: ${change.reason}`);
+  return change.party;
+}
+
+/**
+ * Where a move leaves the train, by the drafts' rules table: the gym it is at (`end` once the
+ * route is finished), the route afterwards when a turn changed its order, how it went past the
+ * end and what it skipped; or the reason it is refused.
+ */
+type Rule = string | { at: number | 'end'; route?: number[]; turn?: TrainTurn; skipped?: number };
+
+const R1 = [4];
+const R2 = [4, 1];
+const R3 = [4, 1, 7];
+const R4 = [4, 1, 7, 9];
+
+/** Every mode, every move, from the first, a middle, the second to last and the last stop, and the end. */
+const RULES: [TrainAtEnd, number[], number, TrainMove, Rule][] = [
+  // A route that finishes: as before there were modes.
+  ['finish', R4, 0, 'next', { at: 1 }],
+  ['finish', R4, 1, 'next', { at: 7 }],
+  ['finish', R4, 2, 'next', { at: 9 }],
+  ['finish', R4, 3, 'next', { at: 'end' }],
+  ['finish', R4, 4, 'next', 'route-finished'],
+  ['finish', R4, 0, 'previous', 'at-first-stop'],
+  ['finish', R4, 1, 'previous', { at: 4 }],
+  ['finish', R4, 3, 'previous', { at: 7 }],
+  ['finish', R4, 4, 'previous', { at: 9 }],
+  ['finish', R4, 0, 'skip', { at: 7, skipped: 1 }],
+  ['finish', R4, 1, 'skip', { at: 9, skipped: 7 }],
+  ['finish', R4, 2, 'skip', 'no-stop-to-skip'],
+  ['finish', R4, 3, 'skip', 'no-stop-to-skip'],
+  ['finish', R4, 4, 'skip', 'no-stop-to-skip'],
+  ['finish', R4, 0, 'finish', { at: 'end' }],
+  ['finish', R4, 3, 'finish', { at: 'end' }],
+  ['finish', R4, 4, 'finish', 'route-finished'],
+  // A route that loops: round from the last stop to the first, and back from the first.
+  ['loop', R4, 0, 'next', { at: 1 }],
+  ['loop', R4, 2, 'next', { at: 9 }],
+  ['loop', R4, 3, 'next', { at: 4, turn: 'round' }],
+  ['loop', R4, 4, 'next', 'route-finished'],
+  ['loop', R4, 0, 'previous', { at: 9 }],
+  ['loop', R4, 1, 'previous', { at: 4 }],
+  ['loop', R4, 4, 'previous', { at: 9 }],
+  ['loop', R4, 0, 'skip', { at: 7, skipped: 1 }],
+  ['loop', R4, 1, 'skip', { at: 9, skipped: 7 }],
+  ['loop', R4, 2, 'skip', { at: 4, turn: 'round', skipped: 9 }],
+  ['loop', R4, 3, 'skip', { at: 1, turn: 'round', skipped: 4 }],
+  ['loop', R4, 4, 'skip', 'no-stop-to-skip'],
+  ['loop', R4, 1, 'finish', { at: 'end' }],
+  ['loop', R4, 3, 'finish', { at: 'end' }],
+  ['loop', R4, 4, 'finish', 'route-finished'],
+  // A route that turns back: at the last stop it is run backwards.
+  ['turn-back', R4, 0, 'next', { at: 1 }],
+  ['turn-back', R4, 2, 'next', { at: 9 }],
+  ['turn-back', R4, 3, 'next', { at: 7, route: [9, 7, 1, 4], turn: 'back' }],
+  ['turn-back', R4, 4, 'next', 'route-finished'],
+  ['turn-back', R4, 0, 'previous', 'at-first-stop'],
+  ['turn-back', R4, 3, 'previous', { at: 7 }],
+  ['turn-back', R4, 4, 'previous', { at: 9 }],
+  ['turn-back', R4, 0, 'skip', { at: 7, skipped: 1 }],
+  ['turn-back', R4, 1, 'skip', { at: 9, skipped: 7 }],
+  // The stop after the next one would be the stop it is at.
+  ['turn-back', R4, 2, 'skip', 'no-stop-to-skip'],
+  ['turn-back', R4, 3, 'skip', { at: 1, route: [9, 7, 1, 4], turn: 'back', skipped: 7 }],
+  ['turn-back', R4, 4, 'skip', 'no-stop-to-skip'],
+  ['turn-back', R4, 3, 'finish', { at: 'end' }],
+  ['turn-back', R4, 4, 'finish', 'route-finished'],
+  // Three stops: the edges of Skip.
+  ['loop', R3, 1, 'skip', { at: 4, turn: 'round', skipped: 7 }],
+  ['loop', R3, 2, 'skip', { at: 1, turn: 'round', skipped: 4 }],
+  ['turn-back', R3, 0, 'skip', { at: 7, skipped: 1 }],
+  ['turn-back', R3, 1, 'skip', 'no-stop-to-skip'],
+  ['turn-back', R3, 2, 'skip', { at: 4, route: [7, 1, 4], turn: 'back', skipped: 1 }],
+  ['turn-back', R3, 2, 'next', { at: 1, route: [7, 1, 4], turn: 'back' }],
+  // Two stops: round and back go to the other stop, and nothing is left to skip.
+  ['finish', R2, 1, 'next', { at: 'end' }],
+  ['finish', R2, 0, 'skip', 'no-stop-to-skip'],
+  ['loop', R2, 1, 'next', { at: 4, turn: 'round' }],
+  ['loop', R2, 0, 'previous', { at: 1 }],
+  ['loop', R2, 0, 'skip', 'no-stop-to-skip'],
+  ['loop', R2, 1, 'skip', 'no-stop-to-skip'],
+  ['turn-back', R2, 1, 'next', { at: 4, route: [1, 4], turn: 'back' }],
+  ['turn-back', R2, 0, 'previous', 'at-first-stop'],
+  ['turn-back', R2, 0, 'skip', 'no-stop-to-skip'],
+  ['turn-back', R2, 1, 'skip', 'no-stop-to-skip'],
+  // One stop: every mode finishes, there is nowhere to go round or back to.
+  ...TRAIN_AT_END.flatMap((atEnd): [TrainAtEnd, number[], number, TrainMove, Rule][] => [
+    [atEnd, R1, 0, 'next', { at: 'end' }],
+    [atEnd, R1, 0, 'previous', 'at-first-stop'],
+    [atEnd, R1, 0, 'skip', 'no-stop-to-skip'],
+    [atEnd, R1, 0, 'finish', { at: 'end' }],
+    [atEnd, R1, 1, 'next', 'route-finished'],
+    [atEnd, R1, 1, 'previous', { at: 4 }],
+  ]),
+];
+
+describe('the modes of a train at the end of its route', () => {
+  it.each(RULES)('%s, route %j at index %i: %s', (atEnd, route, stop, move, rule) => {
+    const train = onRoute(route, stop, { atEnd });
+    const moved = moveTrain(train, ALICE, move, false);
+    if (typeof rule === 'string') {
+      expect(moved).toEqual(refusal(rule));
+      expect(cannotMove(train, move)).toBe(rule);
+      return;
+    }
+    expect(cannotMove(train, move)).toBeUndefined();
+    if (!moved.ok) throw new Error(`refused: ${moved.reason}`);
+    const { party } = moved;
+    expect(placeOf(party)).toBe(String(rule.at));
+    // The control that leads there says so beforehand.
+    expect(targetOf(train, move)).toBe(String(rule.at));
+    expect(party.train.route).toEqual(rule.route ?? route);
+    expect(party.train.atEnd).toBe(atEnd);
+    expect(moved).toMatchObject({ finished: rule.at === 'end' });
+    expect(moved.turn).toBe(rule.turn);
+    expect(moved.skipped).toBe(rule.skipped);
+  });
+
+  it('makes a new train finish its route unless it was told otherwise', () => {
+    expect(testTrain().train.atEnd).toBe('finish');
+    expect(testTrain({ atEnd: 'loop' }).train.atEnd).toBe('loop');
+    expect(testTrain({ atEnd: 'turn-back' }).train.atEnd).toBe('turn-back');
+  });
+
+  it('names where Next leads from the last stop, and how', () => {
+    expect(nextStop(onRoute(R4, 3, { atEnd: 'finish' }))).toBeUndefined();
+    expect(turnAhead(onRoute(R4, 3, { atEnd: 'finish' }))).toBeUndefined();
+    expect(nextStop(onRoute(R4, 3, { atEnd: 'loop' }))).toBe(4);
+    expect(turnAhead(onRoute(R4, 3, { atEnd: 'loop' }))).toBe('round');
+    expect(nextStop(onRoute(R4, 3, { atEnd: 'turn-back' }))).toBe(7);
+    expect(turnAhead(onRoute(R4, 3, { atEnd: 'turn-back' }))).toBe('back');
+    // Anywhere else Next goes on, whatever the mode; at the end of the route it goes nowhere.
+    for (const atEnd of TRAIN_AT_END) {
+      expect(nextStop(onRoute(R4, 1, { atEnd }))).toBe(7);
+      expect(turnAhead(onRoute(R4, 1, { atEnd }))).toBeUndefined();
+      expect(nextStop(onRoute(R4, 4, { atEnd }))).toBeUndefined();
+      expect(turnAhead(onRoute(R4, 4, { atEnd }))).toBeUndefined();
+      expect(nextStop(onRoute(R1, 0, { atEnd }))).toBeUndefined();
+    }
+  });
+
+  it('puts who is here back to coming when it goes round or turns back', () => {
+    for (const atEnd of ['loop', 'turn-back'] as const) {
+      const train = withAttendees(onRoute(R4, 3, { atEnd }), {
+        [ALICE]: { status: PartyStatus.Present },
+      });
+      const moved = changed(moveTrain(train, ALICE, 'next', false));
+      expect(moved.attendees[ALICE]?.status).toBe(PartyStatus.Coming);
+      expect(routeFinished(moved)).toBe(false);
+      expect(moved.train.finishedFrom).toBeNull();
+    }
+  });
+
+  it('runs a turned route on to its end, and turns it again there', () => {
+    let train = onRoute(R3, 2, { atEnd: 'turn-back' });
+    train = changed(moveTrain(train, ALICE, 'next', false));
+    expect(train.train).toMatchObject({ route: [7, 1, 4], stop: 1 });
+    train = changed(moveTrain(train, ALICE, 'next', false));
+    expect(currentStop(train)).toBe(4);
+    train = changed(moveTrain(train, ALICE, 'next', false));
+    expect(train.train).toMatchObject({ route: [4, 1, 7], stop: 1 });
+    // Previous after a turn takes it back to the gym it turned at, the first of the new order.
+    const turned = changed(moveTrain(onRoute(R3, 2, { atEnd: 'turn-back' }), ALICE, 'next', false));
+    const back = changed(moveTrain(turned, ALICE, 'previous', false));
+    expect(back.train).toMatchObject({ route: [7, 1, 4], stop: 0 });
+    expect(moveTrain(back, ALICE, 'previous', false)).toEqual(refusal('at-first-stop'));
+  });
+
+  it('decides a turn against what the panel showed: where it was and where the turn leads', () => {
+    const train = onRoute(R4, 3, { atEnd: 'turn-back' });
+    expect(changed(moveTrain(train, ALICE, 'next', false, '9', '7')).train.stop).toBe(1);
+    expect(moveTrain(train, ALICE, 'next', false, '7', '7')).toEqual(refusal('train-moved-on'));
+    // The panel was drawn while the train still finished its route there.
+    expect(moveTrain(train, ALICE, 'next', false, '9', 'end')).toEqual(refusal('route-changed'));
+    const loop = onRoute(R4, 3, { atEnd: 'loop' });
+    expect(moveTrain(loop, ALICE, 'next', false, '9', '7')).toEqual(refusal('route-changed'));
+    expect(changed(moveTrain(loop, ALICE, 'next', false, '9', '4')).train.stop).toBe(0);
+  });
+
+  it('takes a Finish of a train that loops back with Previous, as for any train', () => {
+    const finished = changed(moveTrain(onRoute(R4, 1, { atEnd: 'loop' }), ALICE, 'finish', false));
+    expect(finished.train).toMatchObject({ stop: 4, finishedFrom: 1 });
+    expect(changed(moveTrain(finished, ALICE, 'previous', false)).train.stop).toBe(1);
+  });
+});
+
+describe('reverseRoute', () => {
+  it('reverses a route that finishes at its first and its last stop, the train at the same gym', () => {
+    const first = changed(reverseRoute(onRoute(R4, 0), ALICE, false));
+    expect(first.train).toMatchObject({ route: [9, 7, 1, 4], stop: 3, atEnd: 'finish' });
+    expect(currentStop(first)).toBe(4);
+    const last = changed(reverseRoute(onRoute(R4, 3), ALICE, false));
+    expect(last.train).toMatchObject({ route: [9, 7, 1, 4], stop: 0 });
+    expect(currentStop(last)).toBe(9);
+    expect(reverseRoute(onRoute(R4, 1), ALICE, false)).toEqual(refusal('reverse-mid-route'));
+    expect(reverseRoute(onRoute(R4, 2), ALICE, false)).toEqual(refusal('reverse-mid-route'));
+  });
+
+  it('starts a route that was finished from its last stop again, from that gym', () => {
+    const finished = changed(moveTrain(onRoute(R4, 3), ALICE, 'next', false));
+    expect(finished.train.finishedFrom).toBe(9);
+    const reversed = reverseRoute(finished, ALICE, false);
+    expect(reversed).toMatchObject({ ok: true, restarted: true });
+    expect(changed(reversed).train).toMatchObject({
+      route: [9, 7, 1, 4],
+      stop: 0,
+      finishedFrom: null,
+    });
+    expect(routeFinished(changed(reversed))).toBe(false);
+    // Not one finished from another stop, nor one that remembers nothing.
+    const early = changed(moveTrain(onRoute(R4, 1), ALICE, 'finish', false));
+    expect(reverseRoute(early, ALICE, false)).toEqual(refusal('reverse-finished-elsewhere'));
+    expect(reverseRoute(onRoute(R4, 4), ALICE, false)).toEqual(
+      refusal('reverse-finished-elsewhere'),
+    );
+    // A finished loop is a finished route like any other.
+    const loopEarly = changed(moveTrain(onRoute(R4, 1, { atEnd: 'loop' }), ALICE, 'finish', false));
+    expect(reverseRoute(loopEarly, ALICE, false)).toEqual(refusal('reverse-finished-elsewhere'));
+  });
+
+  it('reverses a route that loops at any stop, and keeps the mode', () => {
+    for (const stop of [0, 1, 2, 3]) {
+      const reversed = reverseRoute(onRoute(R4, stop, { atEnd: 'loop' }), ALICE, false);
+      expect(reversed).toMatchObject({ ok: true, restarted: false });
+      expect(changed(reversed).train).toMatchObject({
+        route: [9, 7, 1, 4],
+        stop: 3 - stop,
+        atEnd: 'loop',
+      });
+    }
+  });
+
+  it('never reverses a route that turns back, one of fewer than two stops, or none', () => {
+    for (const stop of [0, 1, 3]) {
+      expect(reverseRoute(onRoute(R4, stop, { atEnd: 'turn-back' }), ALICE, false)).toEqual(
+        refusal('reverse-turns-back'),
+      );
+    }
+    for (const atEnd of TRAIN_AT_END) {
+      expect(reverseRoute(onRoute(R1, 0, { atEnd }), ALICE, false)).toEqual(
+        refusal('one-stop-route'),
+      );
+      expect(reverseRoute(onRoute([], 0, { atEnd }), ALICE, false)).toEqual(refusal('no-route'));
+    }
+    expect(cannotReverse(onRoute(R2, 1))).toBeUndefined();
+    expect(cannotReverse(onRoute(R2, 0, { atEnd: 'loop' }))).toBeUndefined();
+  });
+
+  it('is no movement: who is here stays here', () => {
+    const train = withAttendees(onRoute(R4, 0), { [ALICE]: { status: PartyStatus.Present } });
+    expect(changed(reverseRoute(train, ALICE, false)).attendees).toEqual(train.attendees);
+  });
+
+  it('takes the right to move the train, and the place the panel was drawn at', () => {
+    const led = onRoute(R4, 0, { conductorId: ALICE });
+    expect(reverseRoute(led, BOB, false)).toEqual(refusal('not-conductor'));
+    expect(reverseRoute(led, CAROL, true).ok).toBe(true);
+    expect(reverseRoute(onRoute(R4, 0), CAROL, false)).toEqual(refusal('not-attending'));
+    expect(reverseRoute(onRoute(R4, 0), ALICE, false, '1')).toEqual(refusal('train-moved-on'));
+    expect(reverseRoute(onRoute(R4, 0), ALICE, false, '4').ok).toBe(true);
+    // Who may not move it is told so before anything else.
+    expect(reverseRoute(onRoute(R1, 0), CAROL, false)).toEqual(refusal('not-attending'));
+  });
+
+  it('reverses once for a panel: a second press, or a panel drawn before another Reverse, does nothing', () => {
+    // The panel was drawn at the first stop of 4, 1, 7, 9: the route began with gym 4.
+    const once = changed(reverseRoute(onRoute(R4, 0), ALICE, false, '4', '4'));
+    expect(once.train).toMatchObject({ route: [9, 7, 1, 4], stop: 3 });
+    // The train is still at gym 4, but the route no longer begins there: no flip back.
+    expect(reverseRoute(once, ALICE, false, '4', '4')).toEqual(refusal('route-changed'));
+    expect(reverseRoute(once, BOB, false, '4', '4')).toEqual(refusal('route-changed'));
+    // A panel drawn after the Reverse reverses it again.
+    expect(changed(reverseRoute(once, BOB, false, '4', '9')).train).toMatchObject({
+      route: R4,
+      stop: 0,
+    });
+    // Where the train is is asked first.
+    expect(reverseRoute(once, ALICE, false, '9', '9')).toEqual(refusal('train-moved-on'));
+  });
+});
+
+describe('setAtEnd', () => {
+  it('sets the mode for whoever may arrange the route: signed up, its maker, and staff', () => {
+    expect(changed(setAtEnd(onRoute(R4, 1), ALICE, false, 'loop')).train.atEnd).toBe('loop');
+    expect(setAtEnd(onRoute(R4, 1), CAROL, false, 'loop')).toEqual(refusal('not-attending'));
+    // The mode never moves the train: with a conductor, others who are signed up may set it.
+    const led = onRoute(R4, 1, { conductorId: ALICE });
+    expect(changed(setAtEnd(led, BOB, false, 'loop')).train.atEnd).toBe('loop');
+    expect(setAtEnd(led, CAROL, true, 'loop').ok).toBe(true);
+    // So may the maker who is not signed up, as they may give the train its route.
+    const { [REPORTER]: _maker, ...others } = led.attendees;
+    const unsigned: TrainParty = { ...led, attendees: others };
+    expect(changed(setAtEnd(unsigned, REPORTER, false, 'turn-back')).train.atEnd).toBe('turn-back');
+  });
+
+  it('returns the very same party for the mode it has', () => {
+    const train = onRoute(R4, 1, { atEnd: 'turn-back' });
+    expect(setAtEnd(train, ALICE, false, 'turn-back')).toEqual({ ok: true, party: train });
+    expect(changed(setAtEnd(train, ALICE, false, 'turn-back'))).toBe(train);
+  });
+
+  it('never moves the train, and leaves a finished route finished', () => {
+    const train = withAttendees(onRoute(R4, 3), { [ALICE]: { status: PartyStatus.Present } });
+    const looping = changed(setAtEnd(train, ALICE, false, 'loop'));
+    expect(looping.train).toMatchObject({ route: R4, stop: 3 });
+    expect(looping.attendees).toEqual(train.attendees);
+    const finished = changed(moveTrain(onRoute(R4, 2), ALICE, 'finish', false));
+    const after = changed(setAtEnd(finished, ALICE, false, 'turn-back'));
+    expect(after.train).toMatchObject({ stop: 4, finishedFrom: 7, atEnd: 'turn-back' });
+    expect(routeFinished(after)).toBe(true);
+  });
+});
+
+describe('a loaded route with its mode', () => {
+  it('sets the mode with the route, and keeps the mode when none is given', () => {
+    const train = onRoute(R4, 2);
+    expect(changed(replaceRoute(train, ALICE, [1, 7], false, 'loop')).train).toMatchObject({
+      route: [1, 7],
+      stop: 0,
+      atEnd: 'loop',
+    });
+    const looping = onRoute(R4, 2, { atEnd: 'loop' });
+    expect(changed(replaceRoute(looping, ALICE, [1, 7])).train.atEnd).toBe('loop');
+  });
+
+  it('is the very same party only when the route, the stop and the mode are what they were', () => {
+    const train = onRoute(R4, 0);
+    expect(changed(replaceRoute(train, ALICE, R4, false, 'finish'))).toBe(train);
+    const looping = replaceRoute(train, ALICE, R4, false, 'loop');
+    expect(looping).toMatchObject({ ok: true, moved: false });
+    expect(changed(looping).train.atEnd).toBe('loop');
+  });
+});
+
+/**
+ * The rules of the design brief (T1), written out a second time and on their own, without
+ * `destinationOf`: where a move or a Reverse leaves a train on `route`, at index `stop` (its
+ * length: finished, with `finishedFrom`), or why it is refused.
+ */
+function oracle(
+  atEnd: TrainAtEnd,
+  route: readonly number[],
+  stop: number,
+  finishedFrom: number | null,
+  move: TrainMove | 'reverse',
+): { route: readonly number[]; stop: number } | string {
+  const n = route.length;
+  const finished = stop === n;
+  const back = [...route].reverse();
+  // A route of one stop behaves as Finish in every mode.
+  const mode = n < 2 ? 'finish' : atEnd;
+  const at = (index: number) => ({ route, stop: index });
+  switch (move) {
+    case 'next':
+      if (finished) return 'route-finished';
+      if (stop < n - 1) return at(stop + 1);
+      if (mode === 'loop') return at(0);
+      if (mode === 'turn-back') return { route: back, stop: 1 };
+      return at(n);
+    case 'finish':
+      return finished ? 'route-finished' : at(n);
+    case 'previous': {
+      if (finished) {
+        const from = finishedFrom === null ? -1 : route.indexOf(finishedFrom);
+        return at(from >= 0 ? from : n - 1);
+      }
+      if (stop > 0) return at(stop - 1);
+      return mode === 'loop' ? at(n - 1) : 'at-first-stop';
+    }
+    case 'skip':
+      if (finished) return 'no-stop-to-skip';
+      if (stop + 2 < n) return at(stop + 2);
+      if (mode === 'loop') return n >= 3 ? at((stop + 2) % n) : 'no-stop-to-skip';
+      if (mode === 'turn-back' && stop === n - 1 && n >= 3) return { route: back, stop: 2 };
+      return 'no-stop-to-skip';
+    case 'reverse':
+      if (n < 2) return 'one-stop-route';
+      if (atEnd === 'turn-back') return 'reverse-turns-back';
+      if (finished) {
+        return finishedFrom === route[n - 1]
+          ? { route: back, stop: 0 }
+          : 'reverse-finished-elsewhere';
+      }
+      if (atEnd === 'loop' || stop === 0 || stop === n - 1) {
+        return { route: back, stop: n - 1 - stop };
+      }
+      return 'reverse-mid-route';
+  }
+}
+
+describe('every mode, route, place and move against the rules of the brief', () => {
+  const ROUTES = [[4], [4, 1], [4, 1, 7], [4, 1, 7, 9]];
+  const cases: [TrainAtEnd, number[], number, number | null, TrainMove | 'reverse'][] = [];
+  for (const atEnd of TRAIN_AT_END) {
+    for (const route of ROUTES) {
+      for (let stop = 0; stop <= route.length; stop++) {
+        // Only a finished route remembers where it was finished from (or nothing).
+        const remembered = stop === route.length ? [null, ...route] : [null];
+        for (const finishedFrom of remembered) {
+          for (const move of [...TRAIN_MOVES, 'reverse' as const]) {
+            cases.push([atEnd, route, stop, finishedFrom, move]);
+          }
+        }
+      }
+    }
+  }
+
+  it('has every combination', () => {
+    // 3 modes × (a route of n stops: n + 1 places, the finished one once more per gym) × 5.
+    expect(cases).toHaveLength(3 * (3 + 5 + 7 + 9) * 5);
+  });
+
+  it.each(cases)(
+    '%s, route %j at index %i (finished from %s): %s',
+    (atEnd, route, stop, finishedFrom, move) => {
+      const train = onRoute(route, stop, { atEnd, finishedFrom });
+      const expected = oracle(atEnd, route, stop, finishedFrom, move);
+      const result =
+        move === 'reverse'
+          ? reverseRoute(train, ALICE, false)
+          : moveTrain(train, ALICE, move, false);
+      if (typeof expected === 'string') {
+        expect(result).toEqual(refusal(expected));
+        return;
+      }
+      if (!result.ok) throw new Error(`refused: ${result.reason}`);
+      expect({ route: result.party.train.route, stop: result.party.train.stop }).toEqual(expected);
+      expect(result.party.train.atEnd).toBe(atEnd);
+      // What the panel promises is where the move leads.
+      if (move !== 'reverse') expect(targetOf(train, move)).toBe(placeOf(result.party));
+    },
+  );
+});
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index c6ea64d6136ad9b700dd7acc61733686b681cb4d..c4b0072f99db113cf5c965bcd128f5cb77e46059 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -7,6 +7,7 @@ import {
   type Attendee,
   type Change,
   type RaidBossRef,
+  type TrainAtEnd,
   type TrainDetails,
   type TrainParty,
 } from './party.js';
@@ -26,6 +27,8 @@ export interface NewTrain extends NewTimedParty {
    * coming or here, and not at all for anything else. Left out: interested.
    */
   autoStatus?: PartyStatus;
+  /** What the train does at the last stop of its route. Left out: it finishes the route. */
+  atEnd?: TrainAtEnd;
 }
 
 /**
@@ -50,7 +53,14 @@ export function createTrain(input: NewTrain): Change<TrainParty> {
       ? { [input.createdById]: { number: 1, status, group: 'A', remote: false } }
       : {},
     type: 'train',
-    train: { route: [], stop: 0, finishedFrom: null, conductorId: null, boss: null },
+    train: {
+      route: [],
+      stop: 0,
+      finishedFrom: null,
+      atEnd: input.atEnd ?? 'finish',
+      conductorId: null,
+      boss: null,
+    },
   };
   return { ok: true, party: settled(train, input.now) };
 }
@@ -72,9 +82,33 @@ export function currentStop(party: TrainParty): number | undefined {
   return party.train.route[party.train.stop];
 }
 
-/** The gym the train goes to next; undefined at the last stop and wherever there is no current one. */
+/**
+ * The gym Next takes the train to: the next stop, and at the last stop the first one again (a
+ * train that loops) or the one before (a train that turns back). Undefined where Next finishes
+ * the route, and wherever there is no current stop.
+ */
 export function nextStop(party: TrainParty): number | undefined {
-  return currentStop(party) === undefined ? undefined : party.train.route[party.train.stop + 1];
+  if (currentStop(party) === undefined) return undefined;
+  const { route, stop } = destinationOf(party, 'next');
+  return route[stop];
+}
+
+/**
+ * What Next does at the last stop of the route: goes round to the first stop (`round`, a train
+ * that loops) or turns back (`back`). Undefined everywhere else, and where Next finishes the
+ * route.
+ */
+export function turnAhead(party: TrainParty): TrainTurn | undefined {
+  if (currentStop(party) === undefined) return undefined;
+  return destinationOf(party, 'next').turn;
+}
+
+/**
+ * What the train does at the end of its route as far as it can: a route of fewer than two stops
+ * finishes in every mode, since there is nowhere to go round or back to.
+ */
+function endMode(party: TrainParty): TrainAtEnd {
+  return party.train.route.length < 2 ? 'finish' : party.train.atEnd;
 }
 
 /**
@@ -295,21 +329,23 @@ export function clearRoute(
 }
 
 /**
- * Replaces the route (a saved one that is loaded) and puts the train at its first stop. That
- * always takes the right to move the train (`mayNotMove`), wherever the train ends up; when it
- * is at another place than before, it is a movement (`moved`, see `edited`: not for a train
- * that had no route). A gym that is
- * named twice counts once, and what a route does not hold is left off; a route without any gym
- * is refused (`empty-route`). The caller has left out the gyms that no longer exist. The very
- * same party comes back when the train has that route already and is at its first stop. Who
- * made the train may give it its first route without being signed up (`mayArrange`): that
- * moves nothing. With a route to replace they need the right to move like anybody.
+ * Replaces the route (a saved one that is loaded) and puts the train at its first stop, with
+ * what the train does at the end of it when that is given (`atEnd`: a saved route keeps its
+ * mode). That always takes the right to move the train (`mayNotMove`), wherever the train ends
+ * up; when it is at another place than before, it is a movement (`moved`, see `edited`: not for
+ * a train that had no route). A gym that is named twice counts once, and what a route does not
+ * hold is left off; a route without any gym is refused (`empty-route`). The caller has left out
+ * the gyms that no longer exist. The very same party comes back when the train has that route
+ * and that mode already and is at its first stop. Who made the train may give it its first
+ * route without being signed up (`mayArrange`): that moves nothing. With a route to replace
+ * they need the right to move like anybody.
  */
 export function replaceRoute(
   party: TrainParty,
   memberId: string,
   gymIds: readonly number[],
   staff = false,
+  atEnd: TrainAtEnd = party.train.atEnd,
 ): Change<TrainParty, { moved: boolean }> {
   const problem = mayNotMove(party, memberId, staff);
   const firstRoute = party.train.route.length === 0 && mayArrange(party, memberId);
@@ -318,11 +354,13 @@ export function replaceRoute(
   if (route.length === 0) return refused('empty-route');
   const same =
     party.train.stop === 0 &&
+    party.train.atEnd === atEnd &&
     party.train.route.length === route.length &&
     route.every((gymId, index) => party.train.route[index] === gymId);
   if (same) return { ok: true, party, moved: false };
   // The right to move was asked for above, with the one exception it has.
-  return edited(party, withTrain(party, { route, stop: 0 }), memberId, staff, {}, !firstRoute);
+  const loaded = withTrain(party, { route, stop: 0, atEnd });
+  return edited(party, loaded, memberId, staff, {}, !firstRoute);
 }
 
 /** The ways a train moves along its route. */
@@ -333,67 +371,141 @@ export function isTrainMove(value: string): value is TrainMove {
   return (TRAIN_MOVES as readonly string[]).includes(value);
 }
 
+/** How a move went past the end of the route: round to the first stop, or back along it. */
+export type TrainTurn = 'round' | 'back';
+
 /**
  * Why the train cannot move this way from where it is, or undefined when it can. All of them
  * need a route (`no-route`). `next` goes on from every stop (from the last one it finishes the
- * route) and not from a finished route; `previous` goes back from everywhere but the first
- * stop, also from a finished route (`stopAfter` says where to); `skip` needs a stop after the
- * next one; `finish` is refused once the route is finished.
+ * route, goes round or turns back, as the train's mode says) and not from a finished route;
+ * `finish` is refused once the route is finished. `previous` goes back from everywhere but the
+ * first stop, also from a finished route (`destinationOf` says where to); a train that loops
+ * goes back from its first stop to its last. `skip` needs a stop after the next one that is
+ * not the stop the train is at: on a route that finishes, a stop after the next one at all; on
+ * one that loops, three stops or more; on one that turns back, the stop after the next one in
+ * the order the train travels (at the second to last stop that would be the stop it is at).
+ * A route of one stop finishes in every mode.
  */
 export function cannotMove(
   party: TrainParty,
   move: TrainMove,
 ): 'no-route' | 'route-finished' | 'at-first-stop' | 'no-stop-to-skip' | undefined {
   const { route, stop } = party.train;
-  if (route.length === 0) return 'no-route';
+  const length = route.length;
+  if (length === 0) return 'no-route';
+  const finished = stop >= length;
+  const mode = endMode(party);
   switch (move) {
     case 'next':
     case 'finish':
-      return stop >= route.length ? 'route-finished' : undefined;
+      return finished ? 'route-finished' : undefined;
     case 'previous':
-      return stop === 0 ? 'at-first-stop' : undefined;
-    case 'skip':
-      return stop + 2 < route.length ? undefined : 'no-stop-to-skip';
+      return stop === 0 && mode !== 'loop' ? 'at-first-stop' : undefined;
+    case 'skip': {
+      if (finished) return 'no-stop-to-skip';
+      const skips =
+        stop + 2 < length ||
+        (mode === 'loop' && length >= 3) ||
+        (mode === 'turn-back' && stop === length - 1 && length >= 3);
+      return skips ? undefined : 'no-stop-to-skip';
+    }
   }
 }
 
-/**
- * The stop a finished route was finished from, as an index of the route; undefined when the
- * route is not finished or nothing is remembered of it.
- */
-function finishedFromStop(party: TrainParty): number | undefined {
-  const { route, finishedFrom } = party.train;
-  if (!routeFinished(party) || finishedFrom === null) return undefined;
-  const index = route.indexOf(finishedFrom);
-  return index >= 0 ? index : undefined;
+/** Where a move leaves the train: the route as it is then, and the stop on it. */
+export interface TrainDestination {
+  /** The route afterwards: the same one, or the same gyms in the other order after a turn. */
+  route: readonly number[];
+  /** The index of the stop on that route; its length is the end. */
+  stop: number;
+  /** The move went past the end of the route: round to its first stop, or back along it. */
+  turn?: TrainTurn;
+  /** The gym that was left out, for a skip. */
+  skipped?: number;
 }
 
 /**
- * The stop a move takes the train to, as an index of the route; its length is the end.
- * `previous` from a finished route leads to the stop the route was finished from, which takes
- * a mistaken Finish back, and to the last stop when none is remembered.
+ * Where a move takes the train from where it is, as `cannotMove` allows it (for a move that it
+ * refuses, somewhere harmless: the caller asks `cannotMove` first). `previous` from a finished
+ * route leads to the stop the route was finished from, which takes a mistaken Finish back, and
+ * to the last stop when none is remembered.
+ *
+ * At the last stop `next` finishes the route of a train that finishes, takes a train that loops
+ * to its first stop (`turn: 'round'`), and turns a train that turns back: its route is stored
+ * in the other order, and the train is at index 1 of it, the gym before the one it turned at
+ * (`turn: 'back'`). `skip` goes round the end of a loop like `next`, and at the last stop of a
+ * train that turns back to index 2 of the route in the other order. `previous` at the first
+ * stop of a train that loops leads to its last stop.
  */
-export function stopAfter(party: TrainParty, move: TrainMove): number {
+export function destinationOf(party: TrainParty, move: TrainMove): TrainDestination {
   const { route, stop } = party.train;
+  const length = route.length;
+  const last = length - 1;
+  const mode = endMode(party);
+  const reversed = (): number[] => [...route].reverse();
   switch (move) {
     case 'next':
-      return Math.min(stop + 1, route.length);
+      if (stop !== last) return { route, stop: Math.min(stop + 1, length) };
+      if (mode === 'loop') return { route, stop: 0, turn: 'round' };
+      if (mode === 'turn-back') return { route: reversed(), stop: 1, turn: 'back' };
+      return { route, stop: length };
+    case 'skip': {
+      if (mode === 'loop' && length >= 3 && stop < length) {
+        const to = (stop + 2) % length;
+        const skipped = route[(stop + 1) % length];
+        return {
+          route,
+          stop: to,
+          ...(to < stop ? { turn: 'round' as const } : {}),
+          ...(skipped === undefined ? {} : { skipped }),
+        };
+      }
+      if (mode === 'turn-back' && stop === last && length >= 3) {
+        const turned = reversed();
+        const skipped = turned[1];
+        return {
+          route: turned,
+          stop: 2,
+          turn: 'back',
+          ...(skipped === undefined ? {} : { skipped }),
+        };
+      }
+      const skipped = route[stop + 1];
+      return {
+        route,
+        stop: Math.min(stop + 2, length),
+        ...(skipped === undefined ? {} : { skipped }),
+      };
+    }
     case 'previous':
-      return finishedFromStop(party) ?? Math.max(stop - 1, 0);
-    case 'skip':
-      return Math.min(stop + 2, route.length);
+      if (stop >= length) return { route, stop: finishedFromStop(party) ?? Math.max(last, 0) };
+      if (stop === 0 && mode === 'loop') return { route, stop: last };
+      return { route, stop: Math.max(stop - 1, 0) };
     case 'finish':
-      return route.length;
+      return { route, stop: length };
   }
 }
 
+/**
+ * The stop a finished route was finished from, as an index of the route; undefined when the
+ * route is not finished or nothing is remembered of it.
+ */
+function finishedFromStop(party: TrainParty): number | undefined {
+  const { route, finishedFrom } = party.train;
+  if (!routeFinished(party) || finishedFrom === null) return undefined;
+  const index = route.indexOf(finishedFrom);
+  return index >= 0 ? index : undefined;
+}
+
 /**
  * Where a move would take the train from where it is, as `placeOf` names a place: the id of the
  * gym of that stop, or `end`. A control that leads to a stop ("Next is …", "Previous takes it
- * back to …") carries it, so that a press leads there or nowhere (`moveTrain`).
+ * back to …") carries it, so that a press leads there or nowhere (`moveTrain`). A move that
+ * turns the train back leads to a gym like any other: the one before the stop it turns at.
  */
 export function targetOf(party: TrainParty, move: TrainMove): string {
-  const gym = party.train.route[stopAfter(party, move)];
+  const { route, stop } = destinationOf(party, move);
+  const gym = route[stop];
   return gym === undefined ? 'end' : String(gym);
 }
 
@@ -404,17 +516,20 @@ export interface TrainMoved {
   at: number | undefined;
   /** The gym that was left out, for a skip. */
   skipped?: number;
+  /** The move went past the end of the route: round to its first stop, or back along it. */
+  turn?: TrainTurn;
   /** The move finished the route (`finish`, or `next` from the last stop). */
   finished: boolean;
 }
 
 /**
  * Moves the train along its route: to the next stop, back to the one before, past the next one,
- * or to the end of the route. Refused for a member who may not move it (`mayNotMove`) and for a
- * move that cannot be made from where the train is (`cannotMove`), in that order. A move to a
- * gym puts everybody who is here back to coming; at the end of the route who is here stays
- * here. Finishing the route does not end the party and changes none of its times (as with the
- * legacy bot).
+ * or to the end of the route; at the end of the route as its mode says (`destinationOf`).
+ * Refused for a member who may not move it (`mayNotMove`) and for a move that cannot be made
+ * from where the train is (`cannotMove`), in that order. A move to a gym puts everybody who is
+ * here back to coming, also one that goes round or turns back; at the end of the route who is
+ * here stays here. Finishing the route does not end the party and changes none of its times (as
+ * with the legacy bot). A move that goes round or turns back never finishes the route.
  *
  * A move that finishes the route remembers the stop it was made from (`finishedFrom`), and
  * Previous from the end leads back there: a Finish that was a mistake is taken back. Who is
@@ -444,22 +559,114 @@ export function moveTrain(
   if (problem) return refused(problem);
   if (target !== undefined && target !== targetOf(party, move)) return refused('route-changed');
   const { route, stop } = party.train;
-  const to = stopAfter(party, move);
+  const destination = destinationOf(party, move);
   // Only a move that finishes the route leaves something to remember: the gym it was made at.
-  const finishedFrom = to >= route.length ? (route[stop] ?? null) : null;
-  const placed = withTrain(party, { stop: to, finishedFrom });
-  const moved = to === finishedFromStop(party) ? placed : arrived(placed);
-  const skipped = move === 'skip' ? route[stop + 1] : undefined;
+  const finishes = destination.stop >= destination.route.length;
+  const finishedFrom = finishes ? (route[stop] ?? null) : null;
+  const placed = withTrain(party, {
+    route: destination.route,
+    stop: destination.stop,
+    finishedFrom,
+  });
+  const moved = destination.stop === finishedFromStop(party) ? placed : arrived(placed);
+  const { skipped, turn } = destination;
   return {
     ok: true,
     party: moved,
     move,
     at: currentStop(moved),
     ...(skipped === undefined ? {} : { skipped }),
+    ...(turn === undefined ? {} : { turn }),
     finished: routeFinished(moved),
   };
 }
 
+/**
+ * Why the route of the train cannot be reversed from where the train is, or undefined when it
+ * can. A route of fewer than two stops has no other order (`no-route`, `one-stop-route`); a
+ * train that turns back at the end does it by itself (`reverse-turns-back`). A train that loops
+ * may be reversed at any stop; one that finishes only at its first or last stop
+ * (`reverse-mid-route`; it then runs the route from where it is). A finished route, of either
+ * mode, only when it was finished from its last stop (`reverse-finished-elsewhere`; it then
+ * starts the route again from there).
+ */
+export function cannotReverse(
+  party: TrainParty,
+):
+  | 'no-route'
+  | 'one-stop-route'
+  | 'reverse-turns-back'
+  | 'reverse-mid-route'
+  | 'reverse-finished-elsewhere'
+  | undefined {
+  const { route, stop, atEnd, finishedFrom } = party.train;
+  const length = route.length;
+  if (length === 0) return 'no-route';
+  if (length === 1) return 'one-stop-route';
+  if (atEnd === 'turn-back') return 'reverse-turns-back';
+  if (stop >= length) {
+    return finishedFrom === route[length - 1] ? undefined : 'reverse-finished-elsewhere';
+  }
+  if (atEnd === 'loop' || stop === 0 || stop === length - 1) return undefined;
+  return 'reverse-mid-route';
+}
+
+/**
+ * Reverses the route: the same gyms in the other order, with the train at the same gym (stop
+ * `n - 1 - stop` of `n`). It is no movement: who is here stays here, and nobody is told but in
+ * a line of the post. The mode of the train stays what it was. A finished route that may be
+ * reversed (it was finished from its last stop) starts again: the train is at the first stop of
+ * the reversed route, which is that gym, and remembers no Finish (`restarted`).
+ *
+ * Refused for a member who may not move the train (`mayNotMove`), for a control drawn where the
+ * train no longer is (`from`, `train-moved-on`), for one drawn while the route ran the other way
+ * (`first`, the gym the route began with then: `route-changed`), and where `cannotReverse` says
+ * so, in that order. Reverse leaves the train where it is, so `from` alone would let a second
+ * press of one panel, or a panel drawn before another member's Reverse, flip the route back.
+ */
+export function reverseRoute(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+  from?: string,
+  first?: string,
+): Change<TrainParty, { restarted: boolean }> {
+  const forbidden = mayNotMove(party, memberId, staff);
+  if (forbidden) return refused(forbidden);
+  if (from !== undefined && from !== placeOf(party)) return refused('train-moved-on');
+  if (first !== undefined && first !== String(party.train.route[0])) {
+    return refused('route-changed');
+  }
+  const problem = cannotReverse(party);
+  if (problem) return refused(problem);
+  const { route, stop } = party.train;
+  const restarted = routeFinished(party);
+  const reversed = withTrain(party, {
+    route: [...route].reverse(),
+    stop: restarted ? 0 : route.length - 1 - stop,
+    finishedFrom: null,
+  });
+  return { ok: true, party: reversed, restarted };
+}
+
+/**
+ * Sets what the train does at the end of its route. It never moves the train, so it is for whoever
+ * may arrange the route (`mayArrange`: who is signed up, conductor or not, and the maker, who may
+ * give the train its route and with a saved route its mode) and for staff; anybody else is
+ * refused (`not-attending`). A finished route stays finished. The very same party comes back
+ * when the train has that mode already.
+ */
+export function setAtEnd(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+  atEnd: TrainAtEnd,
+): Change<TrainParty> {
+  if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
+  if (party.train.atEnd === atEnd) return { ok: true, party };
+  return { ok: true, party: withTrain(party, { atEnd }) };
+}
+
 /**
  * Makes a member the conductor. They must be signed up (`not-attending`; the legacy bot did not
  * ask). Taking it over from another conductor is allowed: somebody who went offline must be
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 8fc380cdd0bc1144f7f8ea66a0e8a29f21f98fc8..14fe55b4319e26c67fe9c9b40aa47f15115a0b50 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -167,6 +167,14 @@ export function problemText(
       return 'This train is at its first stop.';
     case 'no-stop-to-skip':
       return 'There is no stop after the next one to skip to.';
+    case 'one-stop-route':
+      return 'A route of one stop has no other order.';
+    case 'reverse-turns-back':
+      return 'This train turns back by itself at the end of its route.';
+    case 'reverse-mid-route':
+      return 'The route of this train can be reversed only at its first or last stop.';
+    case 'reverse-finished-elsewhere':
+      return 'A finished route can be reversed only when it was finished at its last stop.';
     case 'already-on-route':
       return 'That gym is on the route already.';
     case 'route-full':
diff --git a/src/render/train-panel.ts b/src/render/train-panel.ts
index 238d796d0d42d2a21d2d9a1352c4d442c4e5b284..b8cc8b5d46434d6c5688ec95068ed3a9fb6e1334 100644
--- a/src/render/train-panel.ts
+++ b/src/render/train-panel.ts
@@ -7,10 +7,10 @@ import {
 import {
   cannotMove,
   currentStop,
+  destinationOf,
   nextStop,
   placeOf,
   routeFinished,
-  stopAfter,
   targetOf,
   TRAIN_MOVES,
   type TrainMove,
@@ -38,7 +38,7 @@ export function whereText(view: TrainPlaces): string {
   const { route, stop } = party.train;
   if (route.length === 0) return 'This train has no route yet. Add its stops with `/route add`.';
   if (routeFinished(party)) {
-    const back = stopAfter(party, 'previous');
+    const back = destinationOf(party, 'previous').stop;
     const gymId = route[back];
     return (
       `The train has finished its route of ${count(route.length, 'stop')}. ` +
````

### Task 2: Train modes in the services: Reverse, the mode, saved routes keep it

Prototype commit: `e692f57d04b859c12fc2cd84b48df65085a63128`

TrainService.reverse and setAtEnd with their lines (no ping, doer), the movement
announcement says a round and a turn, migration 013 adds SavedRoutes.atEnd
(types regenerated), SavedRouteRepository and MemorySavedRoutes keep the mode,
route save, load and show say it, and train takes an at-end option.

**Files:**

```
 src/commands/trains/route.test.ts                      |  66 +++++++--
 src/commands/trains/route.ts                           |  45 ++++--
 src/commands/trains/train.test.ts                      |  22 +++
 src/commands/trains/train.ts                           |  24 +++-
 src/db/migrations/2026_10_16_013_saved_route_at_end.ts |  33 +++++
 src/db/migrations/index.ts                             |   2 +
 src/db/migrator.db.test.ts                             |   2 +
 src/db/repositories/saved-route-repository.db.test.ts  |  51 ++++++-
 src/db/repositories/saved-route-repository.ts          |  40 ++++--
 src/db/types.ts                                        |   1 +
 src/render/train-panel.ts                              |  22 ++-
 src/render/train-words.ts                              |  45 ++++++
 src/services/party-service.ts                          |   6 +-
 src/services/train-service.routes.test.ts              |   7 +-
 src/services/train-service.test.ts                     | 271 +++++++++++++++++++++++++++++++++++++
 src/services/train-service.ts                          |  90 +++++++++++-
 test/support/saved-routes.ts                           |  19 ++-
 17 files changed, 686 insertions(+), 60 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/trains/route.test.ts src/commands/trains/train.test.ts src/services/train-service.routes.test.ts src/services/train-service.test.ts`, and the database tests `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/saved-route-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff e692f57d04b859c12fc2cd84b48df65085a63128 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b3-train-modes.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Train modes in the services: Reverse, the mode, saved routes keep it`, the body above and the trailer, staging exactly
  `src/commands/trains/route.test.ts src/commands/trains/route.ts src/commands/trains/train.test.ts src/commands/trains/train.ts src/db/migrations/2026_10_16_013_saved_route_at_end.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/saved-route-repository.db.test.ts src/db/repositories/saved-route-repository.ts src/db/types.ts src/render/train-panel.ts src/render/train-words.ts src/services/party-service.ts src/services/train-service.routes.test.ts src/services/train-service.test.ts src/services/train-service.ts test/support/saved-routes.ts`.

````diff
diff --git a/src/commands/trains/route.test.ts b/src/commands/trains/route.test.ts
index 8641f171d0126acbbc689dec9d213409abd7145e..97d2a3f929a2ad2bc1b6ca866900ee57666333a1 100644
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -121,6 +121,7 @@ describe('/route show', () => {
         `~~1\\. [Veterans Memorial Bridge](<${maps(4)}>)~~`,
         `**2\\. [The Stacks](<${maps(1)}>)** (the train is here)`,
         `3\\. [Harbor Lighthouse Mural](<${maps(7)}>)`,
+        'At the end it finishes the route.',
       ].join('\n'),
       flags: MessageFlags.Ephemeral,
     });
@@ -132,6 +133,17 @@ describe('/route show', () => {
     expect(made.current().mirrorMessages.map((mirror) => mirror.kind)).toEqual(['region']);
   });
 
+  it('says nothing of the mode for a route of one stop: it finishes there in every mode', async () => {
+    const made = await setup([4]);
+    await made.trains.setAtEnd(made.party.id, { id: ALICE }, false, 'loop');
+    expect(await made.answer('show')).toBe(
+      [
+        '**The route of Saturday legendaries**',
+        `**1\\. [Veterans Memorial Bridge](<${maps(4)}>)** (the train is here)`,
+      ].join('\n'),
+    );
+  });
+
   it('is for anybody in the post, and says so when there is no route', async () => {
     const made = await setup();
     expect(await made.answer('show', {}, { userId: CAROL })).toMatch(/^\*\*The route of/);
@@ -176,8 +188,9 @@ describe('/route show', () => {
     for (const [payload] of used.followUp.mock.calls) {
       expect(payload.flags).toBe(MessageFlags.Ephemeral);
     }
-    const stops = texts.join('\n').split('\n').slice(1);
+    const stops = texts.join('\n').split('\n').slice(1, -1);
     expect(stops).toHaveLength(MAX_ROUTE_STOPS);
+    expect(texts.at(-1)?.split('\n').at(-1)).toBe('At the end it finishes the route.');
     expect(stops[0]).toMatch(/^\*\*1\\\. \[Gym with a long name 1000\]/);
     expect(stops.at(-1)).toMatch(/^50\\\. \[Gym with a long name 1049\]/);
   });
@@ -368,7 +381,7 @@ describe('/route save, load and forget', () => {
   it('save keeps the route for the member and the region, and says how to use it', async () => {
     const made = await setup();
     expect(await made.answer('save', { name: '  Downtown   loop ' })).toBe(
-      'I saved this route as **Downtown loop**: 3 stops. `/route load` puts it into a train of ' +
+      'I saved this route as **Downtown loop**: 3 stops. At the end it finishes the route. `/route load` puts it into a train of ' +
         'this region.',
     );
     expect(made.routes.rows).toMatchObject([
@@ -376,7 +389,7 @@ describe('/route save, load and forget', () => {
     ]);
     await made.trains.addStop(made.party.id, { id: ALICE }, 2);
     expect(await made.answer('save', { name: 'downtown loop' })).toBe(
-      'I replaced your saved route **downtown loop** with this one: 4 stops.',
+      'I replaced your saved route **downtown loop** with this one: 4 stops. At the end it finishes the route.',
     );
     expect(made.routes.rows).toHaveLength(1);
     // Saving says nothing in the post.
@@ -413,29 +426,52 @@ describe('/route save, load and forget', () => {
       { name: 'River walk (3 stops)', value: `id:${river.id}` },
     ]);
     expect(await made.answer('load', { route: `id:${river.id}` })).toBe(
-      'This train has the route **River walk** now: 3 stops. It is at the first.',
+      'This train has the route **River walk** now: 3 stops. It is at the first. At the end it finishes the route.',
     );
     expect(made.current().train).toMatchObject({ route: [2, 3, 11], stop: 0 });
     // Typed by its name works too; the same route again changes nothing.
     expect(await made.answer('load', { route: 'river WALK' })).toBe(
-      'This train has that route already, and is at its first stop.',
+      'This train has that route already, and is at its first stop. At the end it finishes the route.',
     );
     expect((await made.lines()).at(-1)).toBe(
       `**Alice** (<@${ALICE}>) loaded the route **River walk**: 3 stops. The train is at the first.`,
     );
   });
 
+  it('save keeps the mode of the train, load sets it, and the list says it', async () => {
+    const made = await setup();
+    await made.trains.setAtEnd(made.party.id, { id: ALICE }, false, 'turn-back');
+    expect(await made.answer('save', { name: 'Both ways' })).toBe(
+      'I saved this route as **Both ways**: 3 stops. At the end it turns back and runs the ' +
+        'route backwards. `/route load` puts it into a train of this region.',
+    );
+    expect(made.routes.rows).toMatchObject([{ name: 'Both ways', atEnd: 'turn-back' }]);
+    const loop = made.routes.add(ALICE, WEST, 'Round', [2, 3], 'loop');
+    expect(await made.choices('load', 'route')).toEqual([
+      { name: 'Both ways (3 stops, turns back)', value: `id:${made.routes.rows[0]?.id}` },
+      { name: 'Round (2 stops, loops)', value: `id:${loop.id}` },
+    ]);
+    expect(await made.answer('load', { route: `id:${loop.id}` })).toBe(
+      'This train has the route **Round** now: 2 stops. It is at the first. At the end it ' +
+        'loops back to the first stop.',
+    );
+    expect(made.current().train).toMatchObject({ route: [2, 3], stop: 0, atEnd: 'loop' });
+    expect((await made.answer('show')) ?? '').toMatch(
+      /\nAt the end it loops back to the first stop\.$/,
+    );
+  });
+
   it('load leaves out gyms that no longer exist and says how many', async () => {
     const made = await setup();
     const one = made.routes.add(ALICE, WEST, 'Old round', [2, 998, 3]);
     const two = made.routes.add(ALICE, WEST, 'Older round', [998, 2, 999]);
     const none = made.routes.add(ALICE, WEST, 'All gone', [998, 999]);
     expect(await made.answer('load', { route: `id:${one.id}` })).toBe(
-      'This train has the route **Old round** now: 2 stops. It is at the first. ' +
+      'This train has the route **Old round** now: 2 stops. It is at the first. At the end it finishes the route. ' +
         'One gym of it no longer exists and was left out.',
     );
     expect(await made.answer('load', { route: `id:${two.id}` })).toBe(
-      'This train has the route **Older round** now: 1 stop. It is at the first. ' +
+      'This train has the route **Older round** now: 1 stop. It is at the first. At the end it finishes the route. ' +
         '2 gyms of it no longer exist and were left out.',
     );
     expect(await made.answer('load', { route: `id:${none.id}` })).toBe(
@@ -539,13 +575,13 @@ describe('/route: what was found in review', () => {
     expect(await made.answer('forget', { route: '1' })).toBe('I forgot your saved route **1**.');
     expect(made.routes.rows.map((row) => row.name)).toEqual(['Downtown', '2026']);
     expect(await made.answer('load', { route: '2026' })).toBe(
-      'This train has the route **2026** now: 2 stops. It is at the first.',
+      'This train has the route **2026** now: 2 stops. It is at the first. At the end it finishes the route.',
     );
     expect(await made.answer('load', { route: String(downtown.id) })).toBe(
       'You have no such saved route for this region. Pick one from the list.',
     );
     expect(await made.answer('load', { route: `id:${downtown.id}` })).toBe(
-      'This train has the route **Downtown** now: 2 stops. It is at the first.',
+      'This train has the route **Downtown** now: 2 stops. It is at the first. At the end it finishes the route.',
     );
     expect(await made.answer('load', { route: 'id:x' })).toBe(
       'You have no such saved route for this region. Pick one from the list.',
@@ -579,7 +615,7 @@ describe('/route: what was found in review', () => {
       '**Maple Leaf Mosaic** is stop 3 of the route. The train is there now.',
     );
     expect(await made.answer('load', { route: `id:${saved.id}` }, { roleNames: ['Admin'] })).toBe(
-      'This train has the route **Mine** now: 2 stops. It is at the first.',
+      'This train has the route **Mine** now: 2 stops. It is at the first. At the end it finishes the route.',
     );
   });
 
@@ -607,7 +643,7 @@ describe('/route: what was found in review', () => {
     const made = await setup();
     const odd = made.routes.add(ALICE, WEST, '', [2]);
     expect(await made.answer('load', { route: `id:${odd.id}` })).toBe(
-      'This train has a saved route without a name as its route now: 1 stop. It is at the first.',
+      'This train has a saved route without a name as its route now: 1 stop. It is at the first. At the end it finishes the route.',
     );
     expect(await made.answer('forget', { route: `id:${odd.id}` })).toBe(
       'I forgot your saved route without a name.',
@@ -650,7 +686,7 @@ describe('/route: what was found in review', () => {
     });
     await new InteractionRouter(ctx, [route], []).handle(used as never);
     expect(sent(used.editReply).content).toBe(
-      'This train has the route **Marathon** now: 50 stops. It is at the first. ' +
+      'This train has the route **Marathon** now: 50 stops. It is at the first. At the end it finishes the route. ' +
         '2 more stops did not fit: a route has at most 50.',
     );
   });
@@ -718,7 +754,7 @@ describe('/route: what the review of the whole plan found', () => {
     const made = await setup();
     const saved = made.routes.add(ALICE, WEST, 'Up the hill', [2, 10, 3]);
     expect(await made.answer('load', { route: `id:${saved.id}` })).toBe(
-      'This train has the route **Up the hill** now: 2 stops. It is at the first. ' +
+      'This train has the route **Up the hill** now: 2 stops. It is at the first. At the end it finishes the route. ' +
         'One gym of it no longer exists and was left out.',
     );
     expect(made.routeNow()).toEqual([2, 3]);
@@ -728,12 +764,12 @@ describe('/route: what the review of the whole plan found', () => {
     const made = await setup();
     // The legacy bot let a route be called so; a new one may be too (only `id:` and digits may not).
     expect(await made.answer('save', { name: 'id:north' })).toBe(
-      'I saved this route as **id:north**: 3 stops. `/route load` puts it into a train of ' +
+      'I saved this route as **id:north**: 3 stops. At the end it finishes the route. `/route load` puts it into a train of ' +
         'this region.',
     );
     await made.trains.removeStop(made.party.id, { id: ALICE }, 3);
     expect(await made.answer('load', { route: 'ID:North' })).toBe(
-      'This train has the route **id:north** now: 3 stops. It is at the first.',
+      'This train has the route **id:north** now: 3 stops. It is at the first. At the end it finishes the route.',
     );
     expect(await made.answer('forget', { route: 'id:north' })).toBe(
       'I forgot your saved route **id:north**.',
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index fa1d52e8f340cac7d4adfb24d53b8b6f0e10f435..b0d99edbaee5819ec33c608383e720c6dbf7c29d 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -25,6 +25,7 @@ import { problemText } from '../../render/activity.js';
 import { gymName } from '../../render/raid-post.js';
 import { count, LIMITS, plain, truncate } from '../../render/text.js';
 import { routeLines } from '../../render/train-post.js';
+import { atEndSentence } from '../../render/train-words.js';
 import { SAVED_ROUTE_CHOICE, type TrainChangeOutcome } from '../../services/train-service.js';
 import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
@@ -92,8 +93,9 @@ const show: SubcommandPart = {
   help: {
     details:
       'Shows you every stop in order: those the train has left struck through, the one it is ' +
-      'at marked, elite raid gyms marked, each a link to Google Maps. The post itself shows the route ' +
-      'too, without the links.',
+      'at marked, elite raid gyms marked, each a link to Google Maps, and what the train does ' +
+      'at the end of a route of two stops or more. The post itself shows the route too, ' +
+      'without the links.',
     examples: ['/route show'],
   },
   throttle: CHANGE_THROTTLE,
@@ -104,7 +106,11 @@ const show: SubcommandPart = {
       return;
     }
     const heading = `**The route of ${plain(nameOf(party))}**`;
-    const lines = routeLines(trainPlaces(ctx, party), { links: true });
+    const lines = [
+      ...routeLines(trainPlaces(ctx, party), { links: true }),
+      // A route of one stop finishes there in every mode: nothing to say of it.
+      ...(party.train.route.length < 2 ? [] : [atEndSentence(party.train.atEnd)]),
+    ];
     const [first = heading, ...more] = routeMessages(heading, lines);
     await privately(interaction, first);
     for (const content of more) {
@@ -365,6 +371,13 @@ function routeName(route: SavedRoute): string {
 
 const NO_SUCH_ROUTE = 'You have no such saved route for this region. Pick one from the list.';
 
+/** What a choice of the saved routes adds for what a train does at the end of the route. */
+const CHOICE_MODE: Readonly<Record<SavedRoute['atEnd'], string>> = {
+  finish: '',
+  loop: ', loops',
+  'turn-back': ', turns back',
+};
+
 /** What the value of a choice of the list of saved routes begins with, before the id of its row. */
 const ROUTE_CHOICE = 'id:';
 
@@ -394,7 +407,10 @@ async function typedRoute(
   return only.id;
 }
 
-/** The member's saved routes of the region of this train, as choices: `Name (3 stops)`. */
+/**
+ * The member's saved routes of the region of this train, as choices: `Name (3 stops)`, and
+ * what a train does at the end of one that does not finish there (`Name (3 stops, loops)`).
+ */
 async function respondWithRoutes(interaction: AutocompleteInteraction, ctx: AppContext) {
   const party = trainOf(interaction, ctx);
   if (!party) {
@@ -408,7 +424,7 @@ async function respondWithRoutes(interaction: AutocompleteInteraction, ctx: AppC
       .filter((route) => route.name.toLowerCase().includes(typed))
       .slice(0, MAX_CHOICES)
       .map((route) => {
-        const stops = ` (${count(route.gyms.length, 'stop')})`;
+        const stops = ` (${count(route.gyms.length, 'stop')}${CHOICE_MODE[route.atEnd]})`;
         return {
           name: `${truncate(route.name || 'Without a name', 100 - stops.length)}${stops}`,
           value: `${ROUTE_CHOICE}${route.id}`,
@@ -430,8 +446,9 @@ const save: SubcommandPart = {
     ),
   help: {
     details:
-      'The route is saved for you and for the region of this train; nobody else sees it. A ' +
-      'route of yours with the same name is replaced. You can keep up to ' +
+      'The route is saved for you and for the region of this train, in the order it has now ' +
+      'and with what the train does at its end (finish, loop or turn back); nobody else sees ' +
+      'it. A route of yours with the same name is replaced. You can keep up to ' +
       `${MAX_SAVED_ROUTES} routes per region; \`/route forget\` removes one.`,
     examples: ['/route save name:Downtown loop'],
   },
@@ -466,12 +483,14 @@ const save: SubcommandPart = {
       case 'saved':
       case 'replaced': {
         const stops = count(outcome.route.gyms.length, 'stop');
+        const mode = atEndSentence(outcome.route.atEnd);
         await afterwards(
           interaction,
           outcome.kind === 'saved'
-            ? `I saved this route as ${routeName(outcome.route)}: ${stops}. ` +
+            ? `I saved this route as ${routeName(outcome.route)}: ${stops}. ${mode} ` +
                 '`/route load` puts it into a train of this region.'
-            : `I replaced your saved route ${routeName(outcome.route)} with this one: ${stops}.`,
+            : `I replaced your saved route ${routeName(outcome.route)} with this one: ` +
+                `${stops}. ${mode}`,
         );
       }
     }
@@ -495,7 +514,8 @@ const load: SubcommandPart = {
     details:
       'The route of the train is replaced, and the train is at its first stop: that moves the ' +
       'train, so with a conductor only they and the moderators can do it, and otherwise you ' +
-      'must be signed up. Gyms that no longer exist are left out.',
+      'must be signed up. The train then does at the end what it did when the route was ' +
+      'saved (finish, loop or turn back). Gyms that no longer exist are left out.',
     examples: ['/route load route:Downtown loop'],
   },
   throttle: CHANGE_THROTTLE,
@@ -517,6 +537,7 @@ const load: SubcommandPart = {
     }
     const outcome = changed(ctx, party, loaded);
     const stops = count(outcome.party.train.route.length, 'stop');
+    const mode = atEndSentence(outcome.party.train.atEnd);
     const missing =
       outcome.missing === 0
         ? ''
@@ -533,8 +554,8 @@ const load: SubcommandPart = {
     await afterwards(
       interaction,
       outcome.changed
-        ? `This train has ${has}: ${stops}. It is at the first.${missing}${cut}`
-        : `This train has that route already, and is at its first stop.${missing}${cut}`,
+        ? `This train has ${has}: ${stops}. It is at the first. ${mode}${missing}${cut}`
+        : `This train has that route already, and is at its first stop. ${mode}${missing}${cut}`,
     );
   },
   autocomplete: respondWithRoutes,
diff --git a/src/commands/trains/train.test.ts b/src/commands/trains/train.test.ts
index 71852303ff9dee379275d2d6907f54d4926815fd..864f2ce35f2ae1e0dbc62039f6f5fa190a78cdf8 100644
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -249,6 +249,28 @@ describe('/train', () => {
     expect(made.trains()).toHaveLength(3);
   });
 
+  it('makes a train that loops or turns back when told to, and one that finishes otherwise', async () => {
+    const made = await setup();
+    await made.run('Park loop', { options: { name: 'Park loop', 'at-end': 'loop' } });
+    await made.run('Plain', { options: { name: 'Plain' } });
+    await made.run('Both ways', {
+      userId: BOB,
+      options: { name: 'Both ways', 'at-end': 'turn-back' },
+    });
+    const modes = made.trains().map((party) => `${party.timed.name}: ${party.train.atEnd}`);
+    expect(modes.sort()).toEqual(['Both ways: turn-back', 'Park loop: loop', 'Plain: finish']);
+    // The option offers the three, by the names the panel's menu has.
+    const option = train.data.toJSON().options?.find((found) => found.name === 'at-end');
+    expect(option).toMatchObject({
+      required: false,
+      choices: [
+        { name: 'Finish', value: 'finish' },
+        { name: 'Loop', value: 'loop' },
+        { name: 'Turn back', value: 'turn-back' },
+      ],
+    });
+  });
+
   it('is listed with the commands under the trains, with everything a train alone has', () => {
     const filed = commands.filter((command) => command.help.category === 'train');
     expect(filed.map((command) => command.data.name).sort()).toEqual([
diff --git a/src/commands/trains/train.ts b/src/commands/trains/train.ts
index 92baf2f577f0a9c3d6f27bc1644eab73e2cb40ca..6d2ba04dc2c0f51585f9d3297a82d11bc43c3353 100644
--- a/src/commands/trains/train.ts
+++ b/src/commands/trains/train.ts
@@ -4,9 +4,15 @@ import { UserError } from '../../discord/errors.js';
 import { regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
 import type { Throttle } from '../../discord/throttle.js';
-import { attendeeOf, MAX_PARTY_NAME } from '../../domain/party/party.js';
+import {
+  attendeeOf,
+  isTrainAtEnd,
+  MAX_PARTY_NAME,
+  TRAIN_AT_END,
+} from '../../domain/party/party.js';
 import { RaidPrivacy } from '../../domain/party/status.js';
 import { NO_POST_MADE, problemText } from '../../render/activity.js';
+import { AT_END_LABELS } from '../../render/train-words.js';
 import { noForumYet, requirePlaceForNew } from '../parties/timed.js';
 
 /** Where `/train` works, said wherever it does not. */
@@ -32,6 +38,12 @@ export const train: SimpleCommand = {
         .setDescription('What to call it, such as "Saturday legendaries"')
         .setRequired(true)
         .setMaxLength(MAX_PARTY_NAME),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('at-end')
+        .setDescription('What it does at the last stop: finish (the default), loop, or turn back')
+        .addChoices(TRAIN_AT_END.map((atEnd) => ({ name: AT_END_LABELS[atEnd], value: atEnd }))),
     ),
   help: {
     category: 'train',
@@ -44,10 +56,13 @@ export const train: SimpleCommand = {
       '`/route add` adds the gyms it visits (also gyms of other regions), `/meet` sets when it ' +
       'starts and `/end` when it ends, `/boss` says which Pokémon it is after, and `/conductor ' +
       'set` makes you the one who moves it. Members sign up with the buttons, as for a raid, ' +
-      'and the button "Move train…" or `/next` takes it to its next stop. A train is archived ' +
+      'and the button "Move train…" or `/next` takes it to its next stop. `at-end` says what ' +
+      'the train does at the last stop: it finishes the route (the default), loops back to the ' +
+      'first stop, or turns back and runs the route backwards; the Move train panel changes ' +
+      'that later, and reverses the route. A train is archived ' +
       'an hour after it is over: after its end, or without one a day after its start. One ' +
       'without any time goes a day after it was made; its post says when.',
-    examples: ['/train name:Saturday legendaries'],
+    examples: ['/train name:Saturday legendaries', '/train name:Park loop at-end:Loop'],
   },
   guards: [requireGuild, requirePlaceForNew('train', TRAIN_FROM_A_REGION)],
   defer: 'ephemeral',
@@ -56,6 +71,8 @@ export const train: SimpleCommand = {
     const regionChannelId = regionChannelOf(interaction, ctx);
     if (regionChannelId === undefined) throw new UserError(TRAIN_FROM_A_REGION);
     const settings = await ctx.users.get(interaction.user.id);
+    // A choice of the option; anything else (a client that sends what it was not offered) is the default.
+    const atEnd = interaction.options.getString('at-end');
     const outcome = await ctx.partyService.createTrain({
       name: interaction.options.getString('name', true),
       creatorId: interaction.user.id,
@@ -63,6 +80,7 @@ export const train: SimpleCommand = {
       regionChannelId,
       anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
       autoStatus: settings.autoStatus,
+      ...(isTrainAtEnd(atEnd) ? { atEnd } : {}),
     });
     // The guard has looked at all of these; what follows is for what changed in between.
     switch (outcome.kind) {
diff --git a/src/db/migrations/2026_10_16_013_saved_route_at_end.ts b/src/db/migrations/2026_10_16_013_saved_route_at_end.ts
new file mode 100644
index 0000000000000000000000000000000000000000..54e80f32624901b64c28dddce6da3bc9a3f3b3fe
--- /dev/null
+++ b/src/db/migrations/2026_10_16_013_saved_route_at_end.ts
@@ -0,0 +1,33 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * What a train does at the end of a saved route (plan 8B-3): `SavedRoutes.atEnd` holds
+ * `finish`, `loop` or `turn-back` (`TRAIN_AT_END`), and every row from before finishes there, as
+ * every train did. A saved route keeps its mode (Matt, 2026-10-15): `/route save` writes the
+ * train's, `/route load` sets it.
+ *
+ * The legacy bot names its columns when it inserts into this table, so the default covers the
+ * rows it writes; it reads the columns it knows and does not see this one.
+ *
+ * 013, not 012: the Wayfarer plan (8W-1) adds 012 on its branch. Kysely refuses to run a
+ * migration that sorts before one already run, so a database gets 012 before this one.
+ *
+ * Safe to run again after a failure half-way: the column is added only when it is missing.
+ */
+export const savedRouteAtEnd: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    const existing = await sql<{ n: number }>`
+      select count(*) as n from information_schema.columns
+      where table_schema = database() and table_name = 'SavedRoutes'
+        and column_name = 'atEnd'`.execute(db);
+    if (Number(existing.rows[0]?.n ?? 0) === 0) {
+      await sql`alter table SavedRoutes add column atEnd
+        varchar(10) not null default 'finish'`.execute(db);
+    }
+  },
+  async down() {
+    // Additive only: the column stays.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index c85c688d094aeba19f5154d6479c08d84eb9f0ad..517c54991cecea55109af38355decd0ac4292577 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -11,6 +11,7 @@ import { selfRoleGroups } from './2026_10_13_008_self_role_groups.js';
 import { exWantsToElite } from './2026_10_13_009_ex_wants_to_elite.js';
 import { spawnReports } from './2026_10_13_010_spawn_reports.js';
 import { regionChannelUnique } from './2026_10_13_011_region_channel_unique.js';
+import { savedRouteAtEnd } from './2026_10_16_013_saved_route_at_end.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -29,4 +30,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_13_009_ex_wants_to_elite': exWantsToElite,
   '2026_10_13_010_spawn_reports': spawnReports,
   '2026_10_13_011_region_channel_unique': regionChannelUnique,
+  '2026_10_16_013_saved_route_at_end': savedRouteAtEnd,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index 5a32b5e1d4e187f47144959084946769458cd957..25fb57528726e00df0a612a8e441b5cb08e1ab78 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -41,6 +41,7 @@ const ADDED_COLUMNS = [
   'PokemonNotification.shadow',
   'Role.roleSnowflake',
   'Role.groupId',
+  'SavedRoutes.atEnd',
 ];
 /** The indexes it adds to tables of the legacy bot, as `Table.index`. */
 const ADDED_INDEXES = [
@@ -138,6 +139,7 @@ describe('runMigrations', () => {
       '2026_10_13_009_ex_wants_to_elite',
       '2026_10_13_010_spawn_reports',
       '2026_10_13_011_region_channel_unique',
+      '2026_10_16_013_saved_route_at_end',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/saved-route-repository.db.test.ts b/src/db/repositories/saved-route-repository.db.test.ts
index 7af3aaf0d5b8cd778150941c7abc83304e301ab3..1ba37545efd0bd73bb2fd7fea89e3cffd0abdcd0 100644
--- a/src/db/repositories/saved-route-repository.db.test.ts
+++ b/src/db/repositories/saved-route-repository.db.test.ts
@@ -39,10 +39,20 @@ describe('SavedRouteRepository', () => {
     const saved = await routes.save(ALICE, WEST, 'Downtown loop', [4, 1, 7]);
     expect(saved).toEqual({
       kind: 'saved',
-      route: { id: expect.any(Number) as number, name: 'Downtown loop', gyms: [4, 1, 7] },
+      route: {
+        id: expect.any(Number) as number,
+        name: 'Downtown loop',
+        gyms: [4, 1, 7],
+        atEnd: 'finish',
+      },
     });
     expect(await routes.list(ALICE, WEST)).toEqual([
-      { id: saved.kind === 'saved' ? saved.route.id : 0, name: 'Downtown loop', gyms: [4, 1, 7] },
+      {
+        id: saved.kind === 'saved' ? saved.route.id : 0,
+        name: 'Downtown loop',
+        gyms: [4, 1, 7],
+        atEnd: 'finish',
+      },
     ]);
     const row = await db.selectFrom('SavedRoutes').selectAll().executeTakeFirstOrThrow();
     // As the legacy bot wrote it: the member by their row id, the gyms as text.
@@ -104,7 +114,12 @@ describe('SavedRouteRepository', () => {
     const first = await routes.save(ALICE, WEST, 'Downtown loop', [4, 1]);
     const again = await routes.save(ALICE, WEST, 'downtown LOOP', [7]);
     if (first.kind !== 'saved' || again.kind !== 'replaced') throw new Error('not replaced');
-    expect(again.route).toEqual({ id: first.route.id, name: 'downtown LOOP', gyms: [7] });
+    expect(again.route).toEqual({
+      id: first.route.id,
+      name: 'downtown LOOP',
+      gyms: [7],
+      atEnd: 'finish',
+    });
     expect(await routes.list(ALICE, WEST)).toEqual([again.route]);
     // The same name in another region, or by another member, is another route.
     expect((await routes.save(ALICE, EAST, 'Downtown loop', [8])).kind).toBe('saved');
@@ -173,6 +188,36 @@ describe('SavedRouteRepository', () => {
     ]);
   });
 
+  it('keeps what a train does at the end of the route, also through a replacement', async () => {
+    const saved = await routes.save(ALICE, WEST, 'Round', [4, 1], 'loop');
+    if (saved.kind !== 'saved') throw new Error(saved.kind);
+    expect(saved.route.atEnd).toBe('loop');
+    expect(await routes.get(ALICE, WEST, saved.route.id)).toEqual(saved.route);
+    const row = await db.selectFrom('SavedRoutes').select('atEnd').executeTakeFirstOrThrow();
+    expect(row.atEnd).toBe('loop');
+    const replaced = await routes.save(ALICE, WEST, 'round', [1, 4], 'turn-back');
+    expect(replaced).toMatchObject({ kind: 'replaced', route: { atEnd: 'turn-back' } });
+    expect(await routes.list(ALICE, WEST)).toMatchObject([{ gyms: [1, 4], atEnd: 'turn-back' }]);
+    // Saved without one: the route finishes.
+    await routes.save(ALICE, WEST, 'round', [1]);
+    expect(await routes.list(ALICE, WEST)).toMatchObject([{ atEnd: 'finish' }]);
+  });
+
+  it('reads a row the legacy bot inserted as a route that finishes, and a mode it does not know too', async () => {
+    const userId = await users.ensure(ALICE);
+    // The legacy bot names its columns: the new one gets its default.
+    await sql`insert into SavedRoutes (userId, region, name, gyms) values (${userId}, 1, 'Old', '4,1')`.execute(
+      db,
+    );
+    await sql`insert into SavedRoutes (userId, region, name, gyms, atEnd) values (${userId}, 1, 'Odd', '7', 'bounce')`.execute(
+      db,
+    );
+    expect((await routes.list(ALICE, WEST)).map(({ name, atEnd }) => ({ name, atEnd }))).toEqual([
+      { name: 'Odd', atEnd: 'finish' },
+      { name: 'Old', atEnd: 'finish' },
+    ]);
+  });
+
   it('loses the routes of a region or a member that is deleted', async () => {
     await sql`insert into Region (id, guildId, channelId) values (9, 1, 1234567890123456000)`.execute(
       db,
diff --git a/src/db/repositories/saved-route-repository.ts b/src/db/repositories/saved-route-repository.ts
index 433a6ca0399ebec70cfe51a7109b68bd170d4377..abb19749a6cec50c9d6699c199dbac2101306d55 100644
--- a/src/db/repositories/saved-route-repository.ts
+++ b/src/db/repositories/saved-route-repository.ts
@@ -1,4 +1,5 @@
 import type { Kysely } from 'kysely';
+import { isTrainAtEnd, type TrainAtEnd } from '../../domain/party/party.js';
 import { inTransaction } from '../transaction.js';
 import type { DB } from '../types.js';
 
@@ -13,6 +14,8 @@ export interface SavedRoute {
   name: string;
   /** The gyms of the route, by id, in order. Some may no longer exist. */
   gyms: number[];
+  /** What a train does at the end of it (`SavedRoutes.atEnd`; a value this code does not know reads as `finish`). */
+  atEnd: TrainAtEnd;
 }
 
 /** What came of saving a route: a new one, one that took the place of its namesake, or none. */
@@ -28,14 +31,16 @@ export interface SavedRouteStorage {
   /** One of the member's routes of a region; undefined for any other row. */
   get(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined>;
   /**
-   * Saves a route under a name. A route of the same member and region with that name is
-   * replaced; a new one is refused (`full`) when the member has the most they may have.
+   * Saves a route under a name, with what a train does at its end (left out: it finishes). A
+   * route of the same member and region with that name is replaced, mode and all; a new one is
+   * refused (`full`) when the member has the most they may have.
    */
   save(
     memberId: string,
     regionId: number,
     name: string,
     gyms: readonly number[],
+    atEnd?: TrainAtEnd,
   ): Promise<SaveRouteOutcome>;
   /** Deletes one of the member's routes of a region and gives it; undefined for any other row. */
   remove(memberId: string, regionId: number, id: number): Promise<SavedRoute | undefined>;
@@ -75,13 +80,24 @@ export function routeGyms(text: string | null): number[] {
   return [...new Set(ids)];
 }
 
-function toRoute(row: { id: number; name: string | null; gyms: string | null }): SavedRoute {
-  return { id: row.id, name: row.name ?? '', gyms: routeGyms(row.gyms) };
+function toRoute(row: {
+  id: number;
+  name: string | null;
+  gyms: string | null;
+  atEnd: string;
+}): SavedRoute {
+  return {
+    id: row.id,
+    name: row.name ?? '',
+    gyms: routeGyms(row.gyms),
+    atEnd: isTrainAtEnd(row.atEnd) ? row.atEnd : 'finish',
+  };
 }
 
 /**
  * The legacy table `SavedRoutes`: `userId` is the row id of the member in `User`, `region` the
- * row id of the region, `gyms` the gym ids as text. Members are named by their snowflake here;
+ * row id of the region, `gyms` the gym ids as text, `atEnd` (migration 013) what a train does at
+ * the end of the route. Members are named by their snowflake here;
  * a member without a `User` row has no routes, and gets the row when they save their first.
  */
 export class SavedRouteRepository implements SavedRouteStorage, SavedRouteUpkeep {
@@ -93,7 +109,7 @@ export class SavedRouteRepository implements SavedRouteStorage, SavedRouteUpkeep
       .innerJoin('User', 'User.id', 'SavedRoutes.userId')
       .where('User.userSnowflake', '=', memberId)
       .where('SavedRoutes.region', '=', regionId)
-      .select(['SavedRoutes.id', 'SavedRoutes.name', 'SavedRoutes.gyms']);
+      .select(['SavedRoutes.id', 'SavedRoutes.name', 'SavedRoutes.gyms', 'SavedRoutes.atEnd']);
   }
 
   /** The member's row of `User`, locked until the transaction ends; undefined when they have none. */
@@ -126,6 +142,7 @@ export class SavedRouteRepository implements SavedRouteStorage, SavedRouteUpkeep
     regionId: number,
     name: string,
     gyms: readonly number[],
+    atEnd: TrainAtEnd = 'finish',
   ): Promise<SaveRouteOutcome> {
     const text = gyms.join(',');
     // A row for the member is made only when they have none (as `UserRepository.ensure` does):
@@ -167,19 +184,22 @@ export class SavedRouteRepository implements SavedRouteStorage, SavedRouteUpkeep
           ? undefined
           : await trx
               .updateTable('SavedRoutes')
-              .set({ name, gyms: text })
+              .set({ name, gyms: text, atEnd })
               .where('id', '=', same.id)
               .executeTakeFirst();
       if (same && replaced && replaced.numUpdatedRows > 0n) {
-        return { kind: 'replaced', route: { id: same.id, name, gyms: [...gyms] } };
+        return { kind: 'replaced', route: { id: same.id, name, gyms: [...gyms], atEnd } };
       }
       const others = same ? existing.length - 1 : existing.length;
       if (others >= MAX_SAVED_ROUTES) return { kind: 'full' };
       const inserted = await trx
         .insertInto('SavedRoutes')
-        .values({ userId: user.id, region: regionId, name, gyms: text })
+        .values({ userId: user.id, region: regionId, name, gyms: text, atEnd })
         .executeTakeFirstOrThrow();
-      return { kind: 'saved', route: { id: Number(inserted.insertId), name, gyms: [...gyms] } };
+      return {
+        kind: 'saved',
+        route: { id: Number(inserted.insertId), name, gyms: [...gyms], atEnd },
+      };
     });
   }
 
diff --git a/src/db/types.ts b/src/db/types.ts
index c72c267456f52a0e0cc350388ccc684f88d97edc..a3e7be13dfe7966572dc26b13abaf9b3e8436800 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -209,6 +209,7 @@ export interface RoleGroup {
 }
 
 export interface SavedRoutes {
+  atEnd: Generated<string>;
   gyms: string | null;
   id: Generated<number>;
   name: string | null;
diff --git a/src/render/train-panel.ts b/src/render/train-panel.ts
index b8cc8b5d46434d6c5688ec95068ed3a9fb6e1334..b26547d42f7ec0c982bb2deab4385472c8fb4eda 100644
--- a/src/render/train-panel.ts
+++ b/src/render/train-panel.ts
@@ -97,12 +97,17 @@ export function trainPanel(view: TrainPlaces): {
 
 /** How a train got to where it is, for the message that tells the members. */
 export interface Movement {
-  /** On to a stop, back to one, on past one, or to the end of the route. */
-  kind: 'to' | 'back' | 'skip' | 'finished';
+  /**
+   * On to a stop, back to one, on past one, to the end of the route, round from its end to its
+   * start (a loop), or back along it from its end (a train that turns back).
+   */
+  kind: 'to' | 'back' | 'skip' | 'finished' | 'round' | 'turn';
   /** The gym the train is at now (not for `finished`); undefined for one that no longer exists. */
   at?: PostGym | undefined;
-  /** The gym that was left out, for `skip`. */
+  /** The gym that was left out, for `skip`, and for `round` and `turn` by a skip. */
   skipped?: PostGym | undefined;
+  /** The gym the train turned back at, for `turn`. */
+  turnedAt?: PostGym | undefined;
   /** The member who moved the train. */
   by: NamedMember;
 }
@@ -117,6 +122,15 @@ export function movementText(movement: Movement): string {
   const where = stopLink(movement.at);
   if (movement.kind === 'back') return `The train is moving back to ${where}. ${by}`;
   const skipping =
-    movement.kind === 'skip' ? `, skipping **${plain(gymName(movement.skipped))}**` : '';
+    movement.kind !== 'to' && 'skipped' in movement
+      ? `, skipping **${plain(gymName(movement.skipped))}**`
+      : '';
+  if (movement.kind === 'round') {
+    return `The train is going round again, back to ${where}${skipping}. ${by}`;
+  }
+  if (movement.kind === 'turn') {
+    const turned = `**${plain(gymName(movement.turnedAt))}**`;
+    return `The train is turning back at ${turned}, on to ${where}${skipping}. ${by}`;
+  }
   return `The train is moving to ${where}${skipping}. ${by}`;
 }
diff --git a/src/render/train-words.ts b/src/render/train-words.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2d0f3605d26fc462bfccf114941f1dc3a815ca02
--- /dev/null
+++ b/src/render/train-words.ts
@@ -0,0 +1,45 @@
+import type { TrainAtEnd } from '../domain/party/party.js';
+
+/**
+ * The words of what a train does at the end of its route (`TrainAtEnd`), worded once for every
+ * place that names it: the choices of `/train`'s option `at-end`, the menu of the Move train
+ * panel, the lines of the post and `/route show`.
+ */
+
+/** What a choice or a menu option is called. */
+export const AT_END_LABELS: Readonly<Record<TrainAtEnd, string>> = {
+  finish: 'Finish',
+  loop: 'Loop',
+  'turn-back': 'Turn back',
+};
+
+/** One line under the menu option. */
+export const AT_END_DESCRIPTIONS: Readonly<Record<TrainAtEnd, string>> = {
+  finish: 'The train stops at the last stop',
+  loop: 'After the last stop comes the first',
+  'turn-back': 'The route is run backwards from the end',
+};
+
+/** A sentence of what the train does at the end of its route (`/route show`, a loaded route). */
+export function atEndSentence(atEnd: TrainAtEnd): string {
+  switch (atEnd) {
+    case 'finish':
+      return 'At the end it finishes the route.';
+    case 'loop':
+      return 'At the end it loops back to the first stop.';
+    case 'turn-back':
+      return 'At the end it turns back and runs the route backwards.';
+  }
+}
+
+/** How a line says the mode was set: "set the train to …". */
+export function atEndSetWords(atEnd: TrainAtEnd): string {
+  switch (atEnd) {
+    case 'finish':
+      return 'to finish at the last stop';
+    case 'loop':
+      return 'to loop';
+    case 'turn-back':
+      return 'to turn back at the end';
+  }
+}
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 7ad9b9fc3ed672d3ab92970469b47775c753bc3a..2bc4f8cca1d0f7be5560271374e9eb16f3271ba3 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -29,6 +29,7 @@ import {
   type RaidBossRef,
   type RaidParty,
   type TimedParty,
+  type TrainAtEnd,
   type TrainParty,
   setSaved,
   endParty,
@@ -170,6 +171,8 @@ export interface TrainRequest extends TimedRequest {
   anonymous?: boolean;
   /** The maker's automatic status (`User.status`). Left out: interested. */
   autoStatus?: PartyStatus;
+  /** What the train does at the end of its route. Left out: it finishes the route. */
+  atEnd?: TrainAtEnd;
 }
 
 export type TimedOutcome<P extends TimedParty> =
@@ -668,12 +671,13 @@ export class PartyService {
    * Its maker is signed up, and named, as they have set it for the raids they report.
    */
   createTrain(request: TrainRequest): Promise<TrainOutcome> {
-    const { anonymous, autoStatus } = request;
+    const { anonymous, autoStatus, atEnd } = request;
     return this.createTimed(request, 'train', (input) =>
       createTrain({
         ...input,
         ...(anonymous === undefined ? {} : { anonymous }),
         ...(autoStatus === undefined ? {} : { autoStatus }),
+        ...(atEnd === undefined ? {} : { atEnd }),
       }),
     );
   }
diff --git a/src/services/train-service.routes.test.ts b/src/services/train-service.routes.test.ts
index 086d56b88701b8e7a2631932b6cc709271ef4764..ed840e9084673346dab2027a3cc000ac87652b2c 100644
--- a/src/services/train-service.routes.test.ts
+++ b/src/services/train-service.routes.test.ts
@@ -39,7 +39,12 @@ describe('TrainService.saveRoute', () => {
     const saved = await made.trains.saveRoute(made.party.id, alice, '  Downtown   loop ');
     expect(saved).toEqual({
       kind: 'saved',
-      route: { id: expect.any(Number) as number, name: 'Downtown loop', gyms: [4, 1, 7] },
+      route: {
+        id: expect.any(Number) as number,
+        name: 'Downtown loop',
+        gyms: [4, 1, 7],
+        atEnd: 'finish',
+      },
     });
     expect(made.routes.rows).toMatchObject([
       { memberId: ALICE, regionId: WEST, name: 'Downtown loop', gyms: [4, 1, 7] },
diff --git a/src/services/train-service.test.ts b/src/services/train-service.test.ts
index 15bb2b23a2dfd9a99aa70bc039aad0cffa87c4e2..63ebfbaf59817bf267a29a923798f948ca85b14d 100644
--- a/src/services/train-service.test.ts
+++ b/src/services/train-service.test.ts
@@ -967,3 +967,274 @@ describe('TrainService: moves while an announcement is on its way', () => {
     expect(currentStop(made.current())).toBe(7);
   });
 });
+
+/** A train on the route of `boarded`, at its last stop, that does this at the end. */
+async function atLastStop(atEnd: 'loop' | 'turn-back'): Promise<Made> {
+  const made = await boarded();
+  await made.trains.setAtEnd(made.party.id, alice, false, atEnd);
+  for (let n = 0; n < 3; n++) await made.trains.move(made.party.id, alice, 'next', false);
+  await settled(made);
+  expect(currentStop(made.current())).toBe(2);
+  return made;
+}
+
+describe('TrainService: what a train does at the end of its route', () => {
+  it('goes round from the last stop of a loop, and says so', async () => {
+    const made = await atLastStop('loop');
+    const outcome = await made.trains.move(made.party.id, alice, 'next', false);
+    expect(outcome).toMatchObject({ kind: 'ok', at: 4, turn: 'round', finished: false });
+    await settled(made);
+    expect(first(made)).toBe(
+      `The train is going round again, back to [Veterans Memorial Bridge](<${maps(4)}>). ` +
+        `Moved by **Alice** (<@${ALICE}>).`,
+    );
+    expect(made.current().train).toMatchObject({ route: [4, 1, 7, 2], stop: 0 });
+  });
+
+  it('turns back at the last stop, runs the route the other way and says where it turned', async () => {
+    const made = await atLastStop('turn-back');
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
+    const outcome = await made.trains.move(made.party.id, alice, 'next', false);
+    expect(outcome).toMatchObject({ kind: 'ok', at: 7, turn: 'back', finished: false });
+    await settled(made);
+    expect(first(made)).toBe(
+      'The train is turning back at **Old Stone Fountain**, on to ' +
+        `[Harbor Lighthouse Mural](<${maps(7)}>). Moved by **Alice** (<@${ALICE}>).`,
+    );
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 1 });
+    // A movement like any other: who was here is coming again.
+    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Coming);
+  });
+
+  it('says what a skip round the end or back along the route left out', async () => {
+    const looping = await atLastStop('loop');
+    await looping.trains.move(looping.party.id, alice, 'skip', false);
+    await settled(looping);
+    expect(first(looping)).toBe(
+      `The train is going round again, back to [The Stacks](<${maps(1)}>), skipping ` +
+        `**Veterans Memorial Bridge**. Moved by **Alice** (<@${ALICE}>).`,
+    );
+    const turning = await atLastStop('turn-back');
+    await turning.trains.move(turning.party.id, alice, 'skip', false);
+    await settled(turning);
+    expect(first(turning)).toBe(
+      'The train is turning back at **Old Stone Fountain**, on to ' +
+        `[The Stacks](<${maps(1)}>), skipping **Harbor Lighthouse Mural**. ` +
+        `Moved by **Alice** (<@${ALICE}>).`,
+    );
+  });
+
+  it('says the round of a gathered run whose last step it was, and not one followed by a step', async () => {
+    const made = await boarded();
+    await made.trains.setAtEnd(made.party.id, alice, false, 'loop');
+    await made.trains.move(made.party.id, alice, 'skip', false);
+    await settled(made);
+    // On to the last stop and round to the first, in one window: the round is the last step.
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await settled(made);
+    expect(first(made)).toBe(
+      `The train is going round again, back to [Veterans Memorial Bridge](<${maps(4)}>). ` +
+        `Moved by **Alice** (<@${ALICE}>).`,
+    );
+    // Round and on again in one window: the train is simply moving to where it is.
+    await made.trains.move(made.party.id, alice, 'skip', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await settled(made);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await settled(made);
+    expect(first(made)).toBe(
+      `The train is moving to [The Stacks](<${maps(1)}>). Moved by **Alice** (<@${ALICE}>).`,
+    );
+  });
+
+  it('says nothing of a turn that was taken back right away: the train is where it was', async () => {
+    const made = await atLastStop('turn-back');
+    const before = messages(made).length;
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.trains.move(made.party.id, alice, 'previous', false);
+    await settled(made);
+    expect(messages(made)).toHaveLength(before);
+    // At the gym it turned at, which is the first stop of the route as it runs now.
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 0 });
+  });
+});
+
+describe('TrainService.reverse', () => {
+  it('reverses the route at its first stop, says so in a line, and pings nobody', async () => {
+    const made = await boarded();
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Present);
+    await settled(made);
+    const before = messages(made).length;
+    const outcome = await made.trains.reverse(made.party.id, alice, false, '4');
+    expect(outcome).toMatchObject({ kind: 'ok', changed: true, restarted: false });
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 3, atEnd: 'finish' });
+    await settled(made);
+    expect(lines(made).at(-1)).toBe(
+      `The route was reversed by **Alice** (<@${ALICE}>): it now runs from ` +
+        '**Old Stone Fountain** to **Veterans Memorial Bridge**.',
+    );
+    expect(
+      messages(made)
+        .slice(before)
+        .filter((message) => message.mention?.users?.length),
+    ).toEqual([]);
+    // No movement: who is here stays here, and nothing is announced.
+    expect(made.current().attendees[BOB]?.status).toBe(PartyStatus.Present);
+  });
+
+  it('starts a route that was finished from its last stop again, from there', async () => {
+    const made = await boarded();
+    await made.trains.move(made.party.id, alice, 'skip', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await made.trains.move(made.party.id, alice, 'next', false);
+    await settled(made);
+    const outcome = await made.trains.reverse(made.party.id, alice, false, 'end');
+    expect(outcome).toMatchObject({ kind: 'ok', restarted: true });
+    expect(made.current().train).toMatchObject({
+      route: [2, 7, 1, 4],
+      stop: 0,
+      finishedFrom: null,
+    });
+    await settled(made);
+    expect(lines(made).at(-1)).toBe(
+      `The route was reversed by **Alice** (<@${ALICE}>): it now runs from ` +
+        '**Old Stone Fountain** to **Veterans Memorial Bridge**, and starts again at ' +
+        '**Old Stone Fountain**.',
+    );
+  });
+
+  it("reverses once for one panel: a second press, or another member's old panel, changes nothing", async () => {
+    const made = await boarded();
+    // Both panels were drawn at the first stop, while the route began at gym 4.
+    expect(await made.trains.reverse(made.party.id, alice, false, '4', '4')).toMatchObject({
+      kind: 'ok',
+      changed: true,
+    });
+    expect(await made.trains.reverse(made.party.id, alice, false, '4', '4')).toEqual({
+      kind: 'refused',
+      reason: 'route-changed',
+    });
+    expect(await made.trains.reverse(made.party.id, bob, false, '4', '4')).toEqual({
+      kind: 'refused',
+      reason: 'route-changed',
+    });
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 3 });
+    await settled(made);
+    expect(lines(made).filter((line) => /reversed/.test(line))).toHaveLength(1);
+  });
+
+  it('refuses what cannot be reversed, and who may not move the train', async () => {
+    const made = await boarded();
+    await made.trains.move(made.party.id, alice, 'next', false);
+    expect(await made.trains.reverse(made.party.id, alice, false)).toEqual({
+      kind: 'refused',
+      reason: 'reverse-mid-route',
+    });
+    expect(await made.trains.reverse(made.party.id, carol, false)).toEqual({
+      kind: 'refused',
+      reason: 'not-attending',
+    });
+    expect(await made.trains.reverse(made.party.id, alice, false, '4')).toEqual({
+      kind: 'refused',
+      reason: 'train-moved-on',
+    });
+    await made.trains.setAtEnd(made.party.id, alice, false, 'turn-back');
+    expect(await made.trains.reverse(made.party.id, alice, false)).toEqual({
+      kind: 'refused',
+      reason: 'reverse-turns-back',
+    });
+    await made.trains.setAtEnd(made.party.id, alice, false, 'loop');
+    expect(await made.trains.reverse(made.party.id, alice, false)).toMatchObject({ kind: 'ok' });
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 2, atEnd: 'loop' });
+  });
+
+  it('names no maker who asked not to be named', async () => {
+    const made = await createdTrain({ route: [4, 1], anonymous: true });
+    await made.trains.reverse(made.party.id, maker, false);
+    await settled(made);
+    expect(lines(made).at(-1)).toBe(
+      'The route was reversed: it now runs from **The Stacks** to **Veterans Memorial Bridge**.',
+    );
+  });
+});
+
+describe('TrainService.setAtEnd', () => {
+  it('sets the mode, says so in a line without a ping, and nothing for the mode it has', async () => {
+    const made = await boarded();
+    expect(await made.trains.setAtEnd(made.party.id, alice, false, 'loop')).toMatchObject({
+      kind: 'ok',
+      changed: true,
+    });
+    expect(await made.trains.setAtEnd(made.party.id, alice, false, 'loop')).toMatchObject({
+      kind: 'ok',
+      changed: false,
+    });
+    await made.trains.setAtEnd(made.party.id, bob, false, 'turn-back');
+    await made.trains.setAtEnd(made.party.id, alice, false, 'finish');
+    await settled(made);
+    expect(lines(made).filter((line) => /set the train/.test(line))).toEqual([
+      `**Alice** (<@${ALICE}>) set the train to loop.`,
+      `**Bob** (<@${BOB}>) set the train to turn back at the end.`,
+      `**Alice** (<@${ALICE}>) set the train to finish at the last stop.`,
+    ]);
+    expect(messages(made).filter((message) => message.mention?.users?.length)).toEqual([]);
+  });
+
+  it('is for whoever may arrange the route: also a member who is not the conductor', async () => {
+    const made = await boarded();
+    expect(await made.trains.setAtEnd(made.party.id, carol, false, 'loop')).toEqual({
+      kind: 'refused',
+      reason: 'not-attending',
+    });
+    await made.trains.setConductor(made.party.id, alice);
+    expect(await made.trains.setAtEnd(made.party.id, bob, false, 'loop')).toMatchObject({
+      kind: 'ok',
+      changed: true,
+    });
+    expect(await made.trains.setAtEnd(made.party.id, carol, true, 'turn-back')).toMatchObject({
+      kind: 'ok',
+    });
+  });
+
+  it('names no maker who asked not to be named, who may set it without being signed up', async () => {
+    const made = await createdTrain({ route: [4, 1], anonymous: true });
+    await made.attendance.leave(made.party.id, maker);
+    expect(await made.trains.setAtEnd(made.party.id, maker, false, 'loop')).toMatchObject({
+      kind: 'ok',
+      changed: true,
+    });
+    await settled(made);
+    expect(lines(made).at(-1)).toBe('The train was set to loop.');
+  });
+
+  it('makes a train with the mode it was asked for', async () => {
+    const made = await createdTrain({ route: [4, 1], atEnd: 'turn-back' });
+    expect(made.current().train.atEnd).toBe('turn-back');
+  });
+});
+
+describe('TrainService: a saved route keeps its mode', () => {
+  it('saves the order and the mode the train has, and a load sets both', async () => {
+    const made = await boarded();
+    await made.trains.setAtEnd(made.party.id, alice, false, 'loop');
+    await made.trains.reverse(made.party.id, alice, false);
+    const saved = await made.trains.saveRoute(made.party.id, alice, 'Round the park');
+    expect(saved).toMatchObject({
+      kind: 'saved',
+      route: { name: 'Round the park', gyms: [2, 7, 1, 4], atEnd: 'loop' },
+    });
+    await made.trains.setAtEnd(made.party.id, alice, false, 'finish');
+    await made.trains.move(made.party.id, alice, 'next', false);
+    if (saved.kind !== 'saved') throw new Error(saved.kind);
+    const loaded = await made.trains.loadRoute(made.party.id, alice, saved.route.id);
+    expect(loaded).toMatchObject({ kind: 'ok', changed: true });
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 0, atEnd: 'loop' });
+    await settled(made);
+    expect(lines(made).at(-1)).toBe(
+      `**Alice** (<@${ALICE}>) loaded the route **Round the park**: 4 stops. The train is at ` +
+        'the first. At the end it loops back to the first stop.',
+    );
+  });
+});
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index 4d0eb36c2ad76d15a2638efef6959f2e03ccecaf..bc86f512ba5ced432410547f1cdda930ee638e3b 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -11,6 +11,7 @@ import {
   type Change,
   type PartyProblem,
   type RaidBossRef,
+  type TrainAtEnd,
   type TrainParty,
 } from '../domain/party/party.js';
 import {
@@ -22,7 +23,9 @@ import {
   moveTrain,
   removeStop,
   replaceRoute,
+  reverseRoute,
   routeFinished,
+  setAtEnd,
   setConductor,
   setTrainBoss,
   type TrainMove,
@@ -34,6 +37,7 @@ import { gymName, type PostGym } from '../render/raid-post.js';
 import { doer } from '../render/activity.js';
 import { count, LIMITS, memberText, plain, withMentions } from '../render/text.js';
 import { movementText, type Movement } from '../render/train-panel.js';
+import { atEndSentence, atEndSetWords } from '../render/train-words.js';
 import type { Member } from './attendance-service.js';
 import { Gathered } from './gathered.js';
 import { settingsOf, storedChange } from './party-change.js';
@@ -112,6 +116,8 @@ interface PendingMove {
   onlyBack: boolean;
   /** The last step when it was a move; undefined when it was an edit of the route. */
   last: TrainMoved | undefined;
+  /** The gym the train was at before the last step: where it turned, when it turned back. */
+  lastFrom: number | undefined;
   /** Who moved the train last. */
   by: Member;
 }
@@ -406,6 +412,64 @@ export class TrainService {
     return outcome;
   }
 
+  /**
+   * Reverses the route (`reverseRoute`): the same gyms in the other order, the train at the
+   * same gym; a route that was finished from its last stop starts again there (`restarted`).
+   * For who may move the train. It is no movement: nobody is pinged, and the post says it in a
+   * line. `from` is for a control drawn while the train was at some place (`placeOf`), `first`
+   * the gym the route began with then: a panel drawn before a Reverse does not reverse it back.
+   */
+  reverse(
+    partyId: string,
+    member: Member,
+    staff: boolean,
+    from?: string,
+    first?: string,
+  ): Promise<TrainChangeOutcome<{ restarted: boolean }>> {
+    return this.apply(
+      partyId,
+      member,
+      (party) => reverseRoute(party, member.id, staff, from, first),
+      (party, { restarted }) => {
+        const { route } = party.train;
+        const [start, end] = [route[0], route.at(-1)];
+        const again =
+          restarted && start !== undefined ? `, and starts again at ${this.named(start)}` : '';
+        const runs =
+          start === undefined || end === undefined
+            ? ''
+            : `: it now runs from ${this.named(start)} to ${this.named(end)}${again}`;
+        const who = doer(party, member);
+        return who ? `The route was reversed by ${who}${runs}.` : `The route was reversed${runs}.`;
+      },
+    );
+  }
+
+  /**
+   * Sets what the train does at the end of its route (`setAtEnd`): for who may move the train.
+   * It moves nothing, so it is for whoever may arrange the route (`mayArrange`) and for staff;
+   * the post says it in a line that pings nobody, naming the doer (`doer`). `changed` is false
+   * for the mode the train has already.
+   */
+  setAtEnd(
+    partyId: string,
+    member: Member,
+    staff: boolean,
+    atEnd: TrainAtEnd,
+  ): Promise<TrainChangeOutcome> {
+    return this.apply(
+      partyId,
+      member,
+      (party) => setAtEnd(party, member.id, staff, atEnd),
+      (party) => {
+        const who = doer(party, member);
+        return who
+          ? `${who} set the train ${atEndSetWords(atEnd)}.`
+          : `The train was set ${atEndSetWords(atEnd)}.`;
+      },
+    );
+  }
+
   /**
    * Runs an edit of the route that can move the train (its change answers `moved`), and has the
    * others told where the train is when it did.
@@ -444,6 +508,7 @@ export class TrainService {
       count: (earlier?.count ?? 0) + 1,
       onlyBack: (earlier?.onlyBack ?? true) && last?.move === 'previous',
       last,
+      lastFrom: start.gym,
       by,
     }));
   }
@@ -516,7 +581,8 @@ export class TrainService {
 
   /**
    * Saves the route the train has now for the member, under a name, for the region the train
-   * was made in (`SavedRouteStorage.save`): a route of theirs with that name is replaced, and
+   * was made in (`SavedRouteStorage.save`), in the order it has now and with what the train
+   * does at its end: a route of theirs with that name is replaced, and
    * a new one beyond what a member may keep is `full`. Anybody in the post may: it changes
    * nothing about the train. Refused for a text that is no name (`bad-name`, tidied like the
    * name of a party) and for a train without a route (`empty-route`).
@@ -540,7 +606,7 @@ export class TrainService {
     if (SAVED_ROUTE_CHOICE.test(name)) return { kind: 'refused', reason: 'name-like-choice' };
     const { route } = party.train;
     if (route.length === 0) return { kind: 'refused', reason: 'empty-route' };
-    return routes.save(member.id, party.regionId, name, route);
+    return routes.save(member.id, party.regionId, name, route, party.train.atEnd);
   }
 
   /** The routes the member saved for the region of this train, by name; none where there is no train. */
@@ -552,8 +618,9 @@ export class TrainService {
   }
 
   /**
-   * Replaces the route of the train by one the member saved for its region, and puts the train
-   * at its first stop (`replaceRoute`): for who may move the train (`staff` says whether the
+   * Replaces the route of the train by one the member saved for its region, with what the train
+   * does at its end, and puts the train at its first stop (`replaceRoute`): for who may move
+   * the train (`staff` says whether the
    * member is staff). `none` when the member has no such route there. Gyms that no longer exist
    * are left out (`missing` says how many), also those that lie in no region of the server of
    * the train any more (`reaches`), and so is what a route does not hold (`cut`); a route of
@@ -588,7 +655,7 @@ export class TrainService {
         );
         const missing = distinct.length - existing.length;
         const cut = Math.max(0, existing.length - MAX_ROUTE_STOPS);
-        const replaced = replaceRoute(party, member.id, existing, staff);
+        const replaced = replaceRoute(party, member.id, existing, staff, route.atEnd);
         return replaced.ok ? { ...replaced, route, missing, cut } : replaced;
       },
       (party, { cut }) =>
@@ -599,6 +666,8 @@ export class TrainService {
         ) +
         ': ' +
         `${count(party.train.route.length, 'stop')}. The train is at the first.` +
+        // Finishing is what a train does unless told otherwise: the post says only the others.
+        (party.train.atEnd === 'finish' ? '' : ` ${atEndSentence(party.train.atEnd)}`) +
         (cut === 0
           ? ''
           : ` ${count(cut, 'more stop')} did not fit: a route has at most ${MAX_ROUTE_STOPS}.`),
@@ -635,7 +704,8 @@ export class TrainService {
    * train that had finished and is at a gym of the route it had then, and otherwise only when
    * every step was Previous: after a Next, a Skip or an edit that moved the train, it is
    * "moving to" wherever it is. "Skipping" is said only of one Skip whose target is where the
-   * train is.
+   * train is. A last step that went round the end of the route (a loop) or turned back is said
+   * as such when the train is where that step took it; otherwise the other words apply.
    */
   private movement(party: TrainParty, pending: PendingMove): Movement | undefined {
     const { gyms } = this.options;
@@ -647,6 +717,14 @@ export class TrainService {
     if (here === undefined) return undefined;
     if (!pending.fromFinished && here === pending.fromGym) return undefined;
     const at = gyms.get(here);
+    if (last?.turn !== undefined && last.at === here) {
+      const skipped =
+        last.move === 'skip' && last.skipped !== undefined ? gyms.get(last.skipped) : undefined;
+      const passed = last.move === 'skip' ? { skipped } : {};
+      if (last.turn === 'round') return { kind: 'round', at, ...passed, by };
+      const turnedAt = pending.lastFrom === undefined ? undefined : gyms.get(pending.lastFrom);
+      return { kind: 'turn', at, turnedAt, ...passed, by };
+    }
     if (pending.count === 1 && last?.move === 'skip' && last.at === here) {
       const skipped = last.skipped === undefined ? undefined : gyms.get(last.skipped);
       return { kind: 'skip', at, skipped, by };
diff --git a/test/support/saved-routes.ts b/test/support/saved-routes.ts
index 2c2ff090e771a9d3014b42b5690f16e478332662..156d58cd98fc03823fa3dc168d354837e136cde8 100644
--- a/test/support/saved-routes.ts
+++ b/test/support/saved-routes.ts
@@ -1,3 +1,4 @@
+import type { TrainAtEnd } from '../../src/domain/party/party.js';
 import {
   MAX_SAVED_ROUTES,
   type SavedRoute,
@@ -11,8 +12,8 @@ interface Row extends SavedRoute {
   regionId: number;
 }
 
-function route({ id, name, gyms }: Row): SavedRoute {
-  return { id, name, gyms: [...gyms] };
+function route({ id, name, gyms, atEnd }: Row): SavedRoute {
+  return { id, name, gyms: [...gyms], atEnd };
 }
 
 /**
@@ -42,8 +43,14 @@ export class MemorySavedRoutes implements SavedRouteStorage, SavedRouteUpkeep {
   }
 
   /** A row as the legacy bot may have left it, for a test: any name, any gyms. */
-  add(memberId: string, regionId: number, name: string, gyms: number[]): SavedRoute {
-    const row = { id: this.nextId++, memberId, regionId, name, gyms };
+  add(
+    memberId: string,
+    regionId: number,
+    name: string,
+    gyms: number[],
+    atEnd: TrainAtEnd = 'finish',
+  ): SavedRoute {
+    const row = { id: this.nextId++, memberId, regionId, name, gyms, atEnd };
     this.rows.push(row);
     return route(row);
   }
@@ -68,6 +75,7 @@ export class MemorySavedRoutes implements SavedRouteStorage, SavedRouteUpkeep {
     regionId: number,
     name: string,
     gyms: readonly number[],
+    atEnd: TrainAtEnd = 'finish',
   ): Promise<SaveRouteOutcome> {
     return this.attempt((): SaveRouteOutcome => {
       const mine = this.of(memberId, regionId);
@@ -75,10 +83,11 @@ export class MemorySavedRoutes implements SavedRouteStorage, SavedRouteUpkeep {
       if (same) {
         same.name = name;
         same.gyms = [...gyms];
+        same.atEnd = atEnd;
         return { kind: 'replaced', route: route(same) };
       }
       if (mine.length >= MAX_SAVED_ROUTES) return { kind: 'full' };
-      return { kind: 'saved', route: this.add(memberId, regionId, name, [...gyms]) };
+      return { kind: 'saved', route: this.add(memberId, regionId, name, [...gyms], atEnd) };
     });
   }
````

### Task 3: The post of a train says its mode: the route line and Next gym at the last stop

Prototype commit: `c71257e135941fc30fbedef44f06d7e71f26ff97`

Route, stop 4 of 4, loops / turns back at the end; Next gym names the first stop
(round again) or the one before (turning back); a turned or reversed route is
listed in its new order. Worst cases with the words of each mode stay sendable.

**Files:**

```
 src/render/train-post.test.ts | 55 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/train-post.ts      | 29 ++++++++++++++++++++++-------
 2 files changed, 77 insertions(+), 7 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/render/train-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff c71257e135941fc30fbedef44f06d7e71f26ff97 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b3-train-modes.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `The post of a train says its mode: the route line and Next gym at the last stop`, the body above and the trailer, staging exactly
  `src/render/train-post.test.ts src/render/train-post.ts`.

````diff
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index 1acad93b6a4ec1ba1978e6f7cc158b1e9b182630..e344a25c6754317b6cd87c7a129fbdc509e2581c 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -223,6 +223,53 @@ describe('renderTrainPost', () => {
     expect(finished.brief.lines[1]).toBe('Route finished');
   });
 
+  it('says at the last stop where a train that loops or turns back goes next, and the mode in the route', () => {
+    const looping = onRoute([4, 1, 7], 2, { atEnd: 'loop' });
+    expect(where(looping)).toBe(
+      `**Current gym** · [Harbor Lighthouse Mural](${maps(7)})\n` +
+        `**Next gym** · [Veterans Memorial Bridge](${maps(4)}) (round again)`,
+    );
+    expect(block(renderTrainPost(view(looping)), '-# Route')).toMatch(
+      /^-# Route, stop 3 of 3, loops: 1\. \[Veterans/,
+    );
+    const turning = onRoute([4, 1, 7], 2, { atEnd: 'turn-back' });
+    expect(where(turning)).toBe(
+      `**Current gym** · [Harbor Lighthouse Mural](${maps(7)})\n` +
+        `**Next gym** · [The Stacks](${maps(1)}) (turning back)`,
+    );
+    expect(block(renderTrainPost(view(turning)), '-# Route')).toMatch(
+      /^-# Route, stop 3 of 3, turns back at the end: 1\. \[Veterans/,
+    );
+    // Elsewhere on the route the next gym is the next stop, whatever the mode.
+    expect(where(onRoute([4, 1, 7], 0, { atEnd: 'loop' }))).toBe(
+      `**Current gym** · [Veterans Memorial Bridge](${maps(4)})\n` +
+        `**Next gym** · [The Stacks](${maps(1)})`,
+    );
+    // A route of one stop finishes there in every mode: the line says nothing of a mode.
+    expect(block(renderTrainPost(view(onRoute([4], 0, { atEnd: 'loop' }))), '-# Route')).toMatch(
+      /^-# Route, stop 1 of 1: \*\*1\. \[Veterans/,
+    );
+    // A finished route reads as it always did.
+    const finished = renderTrainPost(view(onRoute([4, 1, 7], 3, { atEnd: 'loop' })));
+    expect(block(finished, '-# Route')).toMatch(/^-# Route, 3 stops, finished: 1\. /);
+  });
+
+  it('lists a route that turned back or was reversed in its new order, numbered anew', () => {
+    const turned = onRoute([7, 1, 4], 1, { atEnd: 'turn-back' });
+    expect(block(renderTrainPost(view(turned)), '-# Route')).toBe(
+      '-# Route, stop 2 of 3, turns back at the end: ' +
+        [
+          `1. [Harbor Lighthouse Mural](${maps(7)})`,
+          `**2. [The Stacks](${maps(1)})**`,
+          `3. [Veterans Memorial Bridge](${maps(4)})`,
+        ].join(' · '),
+    );
+    expect(where(turned)).toBe(
+      `**Current gym** · [The Stacks](${maps(1)})\n` +
+        `**Next gym** · [Veterans Memorial Bridge](${maps(4)})`,
+    );
+  });
+
   it('names a gym that no longer exists as unknown, without a link', () => {
     const post = renderTrainPost(view(onRoute([999, 4])));
     expect(where(onRoute([999, 4]))).toBe(
@@ -415,6 +462,14 @@ describe('the longest train that can be', () => {
     expectSendable(post);
     // The trainers are still named, cut down with a count.
     expect(textOf(post.message)).toMatch(/…and \d+ more/);
+    // With the longest words of a mode, at the last stop.
+    for (const atEnd of ['loop', 'turn-back'] as const) {
+      const last: TrainParty = {
+        ...train,
+        train: { ...train.train, stop: MAX_ROUTE_STOPS - 1, atEnd },
+      };
+      expectSendable(renderTrainPost(view(last, { gym: heavy })));
+    }
   });
 });
 
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index 53a0d75a6e4995262b4b6263ac777f9ba8a19456..a3c352f3b129b96dcd30f5b4eb428b715b464fb9 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -1,7 +1,7 @@
 import { memberOf, type TrainParty } from '../domain/party/party.js';
 import { isEliteGym } from '../domain/party/raid.js';
 import { nameOf } from '../domain/party/timed.js';
-import { currentStop, nextStop, routeFinished } from '../domain/party/train.js';
+import { currentStop, nextStop, routeFinished, turnAhead } from '../domain/party/train.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import { bottomControls, moveTrainButton } from './party-controls.js';
 import {
@@ -101,16 +101,25 @@ function placeLine(view: TrainPostView): string {
   return at === undefined ? 'No route yet' : `At ${stopLink(view.gym(at), true)}`;
 }
 
-/** Where the train is and where it goes next, as the post says it beside "Move train…". */
+/** What "Next gym" adds at the last stop of a train that goes round or turns back. */
+const TURN_WORDS = { round: ' (round again)', back: ' (turning back)' } as const;
+
+/**
+ * Where the train is and where it goes next, as the post says it beside "Move train…". At the
+ * last stop of a train that loops "Next gym" is the first stop, round again, and of one that
+ * turns back the stop before, turning back; of one that finishes there is none.
+ */
 function whereText(view: TrainPostView, room: number): string {
   const { party } = view;
   if (party.train.route.length === 0) return 'No route yet: `/route add` adds a stop.';
   if (routeFinished(party)) return '**Route complete**';
   const [at, next] = [currentStop(party), nextStop(party)];
+  const turn = turnAhead(party);
+  const how = turn === undefined ? '' : TURN_WORDS[turn];
   const lines = (name: (gym: PostGym | undefined) => string): string =>
     [
       ...(at === undefined ? [] : [`**Current gym** · ${name(view.gym(at))}`]),
-      ...(next === undefined ? [] : [`**Next gym** · ${name(view.gym(next))}`]),
+      ...(next === undefined ? [] : [`**Next gym** · ${name(view.gym(next))}${how}`]),
     ].join('\n');
   const linked = lines((gym) => stopLink(gym, true));
   if (linked.length <= room) return linked;
@@ -122,11 +131,16 @@ function whereText(view: TrainPostView, room: number): string {
 /** The room the route of a post may take, in small print under where the train is. */
 const ROUTE_ROOM = 600;
 
+/** What the heading of the route says of a train that does not finish at its last stop. */
+const MODE_WORDS = { finish: '', loop: ', loops', 'turn-back': ', turns back at the end' } as const;
+
 /**
  * The route in one line of small print, every stop a link, the current one in bold and an elite
- * raid gym marked: `-# Route, stop 2 of 4: 1. [A](…) · **2. [B](…)** · 3. [C](…) (elite)`. A
- * route that does not fit keeps the stops around the current one and says how many of the
- * earlier ones it left out.
+ * raid gym marked: `-# Route, stop 2 of 4: 1. [A](…) · **2. [B](…)** · 3. [C](…) (elite)`, with
+ * what the train does at the end when it does not finish there (`Route, stop 4 of 4, loops: …`),
+ * on a route of two stops or more (one of a single stop finishes there in every mode). The route
+ * is shown as it is stored: after a turn or a Reverse, in its new order. A route that does not
+ * fit keeps the stops around the current one and says how many of the earlier ones it left out.
  */
 function routeLine(view: TrainPostView, fit: Fit): PostBlock[] {
   const { route, stop } = view.party.train;
@@ -136,9 +150,10 @@ function routeLine(view: TrainPostView, fit: Fit): PostBlock[] {
     const text = `${index + 1}. ${stopLink(gym, true)}${gym && isEliteGym(gym) ? ' (elite)' : ''}`;
     return index === stop ? `**${text}**` : text;
   });
+  const mode = route.length < 2 ? '' : MODE_WORDS[view.party.train.atEnd];
   const heading = routeFinished(view.party)
     ? `Route, ${count(route.length, 'stop')}, finished`
-    : `Route, stop ${stop + 1} of ${route.length}`;
+    : `Route, stop ${stop + 1} of ${route.length}${mode}`;
   const shown = fit.part((room) => {
     const limit = Math.min(room, ROUTE_ROOM);
     const whole = stops.join(' · ');
````

### Task 4: The Move train panel as a components-v2 message, with Reverse and the mode menu

Prototype commit: `6714148e035a3701d5f5b9f478b5e1207eaa729f`

One grey container: where the train is and what Next does (round, back or the
end), the four moves, Reverse the route where it may be done, and the menu of
what the train does at the end of its route. New party actions reverse and
atend, both carrying where the panel was drawn; a press decides anew and
redraws. A plain-text panel from before is closed with a line and the new one
sent below it.

**Files:**

```
 src/commands/parties/in-train.test.ts |  21 +-
 src/commands/trains/move.test.ts      | 557 ++++++++++++++++++++++++++++++++++++++++++------------
 src/commands/trains/move.ts           | 168 ++++++++++++----
 src/components/party.ts               |  22 ++-
 src/discord/custom-id.ts              |  10 +
 src/domain/party/train.test.ts        |   5 +
 src/domain/party/train.ts             |   5 +-
 src/render/party-controls.ts          |   2 +
 src/render/train-panel.ts             | 234 +++++++++++++++++------
 src/render/train-post.test.ts         | 223 ++++++++++++++++++----
 src/services/train-service.ts         |   6 +-
 11 files changed, 993 insertions(+), 260 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/parties/in-train.test.ts src/commands/trains/move.test.ts src/domain/party/train.test.ts src/render/train-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 6714148e035a3701d5f5b9f478b5e1207eaa729f -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b3-train-modes.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `The Move train panel as a components-v2 message, with Reverse and the mode menu`, the body above and the trailer, staging exactly
  `src/commands/parties/in-train.test.ts src/commands/trains/move.test.ts src/commands/trains/move.ts src/components/party.ts src/discord/custom-id.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/party-controls.ts src/render/train-panel.ts src/render/train-post.test.ts src/services/train-service.ts`.

````diff
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index c20aeb2ab5aa391cff2ee0d7b31c10f9dcc0898a..6ee29a13a144a109cd1ca12a4a0f3dd38073505b 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -1,3 +1,4 @@
+import { ComponentType, MessageFlags } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
   asV2,
@@ -7,6 +8,7 @@ import {
   fakeModal,
   sent,
   type FakeInteraction,
+  type FakeRow,
 } from '../../../test/support/fake-interactions.js';
 import { testGyms, WEST_CHANNEL, WEST_FORUM } from '../../../test/support/gyms.js';
 import { ALICE, at, BOB, CAROL, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
@@ -38,12 +40,16 @@ import { status, where } from './status.js';
 import {
   buttonLabels,
   buttonsOf,
+  customIdsOf,
   header,
   textDisplays,
   textOf,
   thumbnailOf,
 } from '../../../test/support/messages.js';
 
+/** A message a control is on that is components v2, as posts and panels are. */
+const V2_ROWS: readonly FakeRow[] = [{ type: ComponentType.Container, components: [] }];
+
 const all: CommandModule[] = [
   join,
   interested,
@@ -125,6 +131,11 @@ async function setup(route: readonly number[] = [4, 1, 7]) {
       for (const [payload] of responder.mock.calls) {
         const content = (payload as { content?: string } | undefined)?.content;
         if (content !== undefined) told.push(content);
+        // A components-v2 answer (the Move train panel) says it in its text.
+        const flags = (payload as { flags?: number } | undefined)?.flags ?? 0;
+        if ((flags & MessageFlags.IsComponentsV2) !== 0) {
+          told.push(textOf(asV2(payload)));
+        }
       }
     }
     return interaction;
@@ -158,6 +169,7 @@ async function setup(route: readonly number[] = [4, 1, 7]) {
     }
     return undefined;
   };
+  /** A press on a control of the train, on a components-v2 message (a post, a panel). */
   const click = (action: string, extra: object = {}) =>
     handle(
       fakeButton({
@@ -165,6 +177,7 @@ async function setup(route: readonly number[] = [4, 1, 7]) {
         channelId: made.postId,
         userId: ALICE,
         displayName: 'Alice',
+        messageRows: V2_ROWS,
         ...extra,
       }),
     );
@@ -803,10 +816,10 @@ describe('what a member of a train is told', () => {
       await made.trains.addStop(made.party.id, { id: ALICE }, gymId);
     /** A button of the panel as it would be drawn now: with where the train is, and where it leads. */
     const drawn = (move: string): string => {
-      const buttons = trainPanel({ party: made.current(), gym: (id) => made.ctx.gyms.get(id) });
-      const id = buttons.components[0]?.components.find((button) =>
-        button.custom_id.startsWith(`party:${made.party.id}:${move}:`),
-      )?.custom_id;
+      const panel = trainPanel({ party: made.current(), gym: (id) => made.ctx.gyms.get(id) });
+      const id = customIdsOf(panel).find((found) =>
+        found.startsWith(`party:${made.party.id}:${move}:`),
+      );
       if (id === undefined) throw new Error(`the panel has no button ${move}`);
       return id.slice(`party:${made.party.id}:`.length);
     };
diff --git a/src/commands/trains/move.test.ts b/src/commands/trains/move.test.ts
index d8d46a8f4a1f95df1616a47704522d7342475130..cee1598c98b4f7c3e0589f7783edbafa9e00f94a 100644
--- a/src/commands/trains/move.test.ts
+++ b/src/commands/trains/move.test.ts
@@ -1,10 +1,13 @@
-import { MessageFlags } from 'discord.js';
+import { ComponentType, MessageFlags, type APIStringSelectComponent } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
+  asV2,
   fakeButton,
   fakeChatInput,
+  fakeSelect,
   sent,
   type FakeInteraction,
+  type FakeRow,
 } from '../../../test/support/fake-interactions.js';
 import { testGyms, WEST_FORUM } from '../../../test/support/gyms.js';
 import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER } from '../../../test/support/parties.js';
@@ -13,13 +16,24 @@ import { createTestContext } from '../../../test/support/test-context.js';
 import { partyButtons } from '../../components/party.js';
 import { ClickAnswers } from '../../discord/click-answers.js';
 import type { CommandModule } from '../../discord/command.js';
+import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
-import { attendeeOf } from '../../domain/party/party.js';
+import { attendeeOf, type TrainAtEnd } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
-import { trainPanel } from '../../render/train-panel.js';
+import type { PostGym } from '../../render/raid-post.js';
+import { panelNote, trainPanel } from '../../render/train-panel.js';
 import { conductor } from './conductor.js';
-import { finish, next, previous, skip } from './move.js';
-import { header, textOf } from '../../../test/support/messages.js';
+import { finish, next, OLD_PANEL, previous, skip } from './move.js';
+import {
+  allComponents,
+  customIdsOf,
+  header,
+  selectsOf,
+  textDisplays,
+  textOf,
+} from '../../../test/support/messages.js';
+import { expectV2Sendable } from '../../../test/support/post-limits.js';
 
 const all: CommandModule[] = [next, previous, skip, finish, conductor];
 
@@ -31,6 +45,33 @@ const BRIDGE = `[Veterans Memorial Bridge](<${maps(4)}>)`;
 const STACKS = `[The Stacks](<${maps(1)}>)`;
 const MURAL = `[Harbor Lighthouse Mural](<${maps(7)}>)`;
 const FOUNTAIN = `[Old Stone Fountain](<${maps(2)}>)`;
+/** The same as the panel links them: in a components-v2 message, without the brackets. */
+const BRIDGE_BARE = `[Veterans Memorial Bridge](${maps(4)})`;
+const STACKS_BARE = `[The Stacks](${maps(1)})`;
+const MURAL_BARE = `[Harbor Lighthouse Mural](${maps(7)})`;
+const FOUNTAIN_BARE = `[Old Stone Fountain](${maps(2)})`;
+
+/** A message a control is on that is components v2, as every panel since 8B-3 is. */
+const V2_ROWS: readonly FakeRow[] = [{ type: ComponentType.Container, components: [] }];
+/** A plain-text panel with its row of buttons, as panels were before 8B-3. */
+const CLASSIC_ROWS: readonly FakeRow[] = [{ type: ComponentType.ActionRow, components: [] }];
+
+/** The text of the panel: its heading, then these lines. */
+const panelText = (...lines: string[]): string => ['### Move the train', ...lines].join('\n');
+
+/** The first text of a components-v2 message: of a panel, its heading and where the train is. */
+const firstText = (message: V2Message): string => textDisplays(message)[0] ?? '';
+
+/** The first text of the components-v2 message a responder of a fake was first given. */
+const shown = (responder: Parameters<typeof sent>[0]): string => firstText(asV2(sent(responder)));
+
+/** The mode the menu of a panel shows as chosen. */
+const chosen = (message: V2Message): string | undefined =>
+  (
+    allComponents(message).find(
+      (component) => (component as { type?: unknown }).type === ComponentType.StringSelect,
+    ) as APIStringSelectComponent | undefined
+  )?.options.find((option) => option.default === true)?.value;
 
 beforeEach(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
@@ -40,8 +81,8 @@ afterEach(() => {
 });
 
 /** A train on a route of four gyms, with Alice and Bob coming beside the member who made it. */
-async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0) {
-  const made = await createdTrain({ route });
+async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0, atEnd?: TrainAtEnd) {
+  const made = await createdTrain({ route, ...(atEnd === undefined ? {} : { atEnd }) });
   await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
   await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming);
   await made.attendance.flush();
@@ -71,7 +112,10 @@ async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0) {
     );
   const answer = async (commandName: string, extra?: object): Promise<string | undefined> =>
     sent((await run(commandName, extra)).reply).content;
-  /** A press on a control of the train, by Alice unless `extra` says otherwise. */
+  /**
+   * A press on a control of the train, by Alice unless `extra` says otherwise, on a message that
+   * is components v2 (a panel, a post) unless `extra` gives other rows.
+   */
   const click = (action: string, extra: object = {}) =>
     handle(
       fakeButton({
@@ -79,23 +123,42 @@ async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0) {
         channelId: made.postId,
         userId: ALICE,
         displayName: 'Alice',
+        messageRows: V2_ROWS,
         ...extra,
       }),
     );
-  /** The panel as it would be drawn now. */
-  const panel = () => trainPanel({ party: made.current(), gym: (id) => ctx.gyms.get(id) });
+  /** The panel as it would be drawn now, with `note` above where the train is. */
+  const panel = (note?: string) =>
+    trainPanel({ party: made.current(), gym: (id) => ctx.gyms.get(id) }, note);
   /** A press on a button of that panel: it carries where the train is, and where it leads. */
-  const press = (move: string, extra: object = {}) => {
-    const drawn = panel().components[0]?.components.find((button) =>
-      button.custom_id.startsWith(`party:${made.party.id}:${move}:`),
+  const press = (action: string, extra: object = {}) => {
+    const drawn = customIdsOf(panel()).find((id) =>
+      id.startsWith(`party:${made.party.id}:${action}:`),
     );
-    if (!drawn) throw new Error(`the panel has no button ${move}`);
+    if (!drawn) throw new Error(`the panel has no button ${action}`);
     return handle(
       fakeButton({
-        customId: drawn.custom_id,
+        customId: drawn,
+        channelId: made.postId,
+        userId: ALICE,
+        displayName: 'Alice',
+        messageRows: panel().components as FakeRow[],
+        ...extra,
+      }),
+    );
+  };
+  /** A choice in the menu "At the end of the route" of the panel as it is drawn now. */
+  const pick = (value: string, extra: object = {}) => {
+    const [menu] = selectsOf(panel());
+    if (!menu) throw new Error('the panel has no menu');
+    return handle(
+      fakeSelect({
+        customId: menu.customId,
+        values: [value],
         channelId: made.postId,
         userId: ALICE,
         displayName: 'Alice',
+        messageRows: panel().components as FakeRow[],
         ...extra,
       }),
     );
@@ -108,7 +171,7 @@ async function setup(route: readonly number[] = [4, 1, 7, 2], windowMs = 0) {
     await made.service.flush();
     return made.said().join('\n').split('\n').filter(Boolean);
   };
-  return { ...made, ctx, handle, run, answer, click, press, lines, panel, inPost };
+  return { ...made, ctx, handle, run, answer, click, press, pick, lines, panel, inPost };
 }
 
 describe('/next, /previous, /skip and /finish', () => {
@@ -152,7 +215,8 @@ describe('/next, /previous, /skip and /finish', () => {
       `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}. I am telling the others.`,
     );
     expect(await made.answer('skip')).toBe(
-      `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop. I am telling the others.`,
+      `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop: Next finishes the route. ` +
+        'I am telling the others.',
     );
     // From the last stop, next finishes the route.
     expect(await made.answer('next')).toBe(
@@ -226,7 +290,7 @@ describe('/next, /previous, /skip and /finish', () => {
     });
     await new InteractionRouter(ctx, all, []).handle(used as never);
     expect(sent(used.reply).content).toBe(
-      `The train is at stop 2 of 2: ${STACKS}. It is the last stop.`,
+      `The train is at stop 2 of 2: ${STACKS}. It is the last stop: Next finishes the route.`,
     );
   });
 
@@ -344,24 +408,27 @@ describe('/conductor', () => {
 });
 
 describe('the button "Move train…" and its panel', () => {
-  it('opens the panel privately: where the train is, what comes next, and the four moves', async () => {
+  it('opens the panel privately: where the train is, what comes next, the four moves and the mode', async () => {
     const made = await setup();
     const opened = await made.click('move');
     expect(opened.reply).toHaveBeenCalledWith({
-      ...made.panel(),
-      flags: MessageFlags.Ephemeral,
+      components: made.panel().components,
+      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
     });
-    expect(sent(opened.reply).content).toBe(
-      `The train is at stop 1 of 4: ${BRIDGE}. Next is ${STACKS}.`,
+    expect(shown(opened.reply)).toBe(
+      panelText(`At stop 1 of 4: ${BRIDGE_BARE}`, `Next is ${STACKS_BARE}`),
     );
     // Every button says where the train was when the panel was drawn (at gym 4), and Next and
-    // Skip also where they lead: to gym 1, and past it to gym 7.
-    const [row] = made.panel().components;
-    expect(row?.components.map((button) => button.custom_id)).toEqual(
-      ['next:4:1', 'previous:4:4', 'skip:4:7', 'finish:4'].map(
+    // Skip also where they lead: to gym 1, and past it to gym 7. At the first stop of a route
+    // that finishes, Reverse is there too; the menu says where the train was as well.
+    expect(customIdsOf(made.panel())).toEqual(
+      ['next:4:1', 'previous:4:4', 'skip:4:7', 'finish:4', 'reverse:4:4'].map(
         (action) => `party:${made.party.id}:${action}`,
       ),
     );
+    expect(selectsOf(made.panel()).map((menu) => menu.customId)).toEqual([
+      `party:${made.party.id}:atend:4`,
+    ]);
     // Opening it moves nothing and says nothing.
     expect(made.current().train.stop).toBe(0);
     expect(await made.lines()).toEqual([]);
@@ -379,9 +446,9 @@ describe('the button "Move train…" and its panel', () => {
       'This train has a conductor: only they and the moderators can move it.',
     );
     // The conductor and a moderator get the panel.
-    expect(sent((await made.click('move', { userId: BOB })).reply).components).toHaveLength(1);
+    expect(shown((await made.click('move', { userId: BOB })).reply)).toMatch(/^### Move the train/);
     const moderator = await made.click('move', { userId: CAROL, roleNames: ['Moderator'] });
-    expect(sent(moderator.reply).components).toHaveLength(1);
+    expect(shown(moderator.reply)).toMatch(/^### Move the train/);
   });
 
   it('answers with the sentence alone on a train without a route: no panel of dead buttons', async () => {
@@ -396,9 +463,9 @@ describe('the button "Move train…" and its panel', () => {
   it('works on a copy of the message in another channel: the train is the one the button names', async () => {
     const made = await setup();
     const opened = await made.click('move', { channelId: '600000000000000099' });
-    expect(sent(opened.reply).content).toMatch(/^The train is at stop 1 of 4/);
+    expect(shown(opened.reply)).toMatch(/\nAt stop 1 of 4/);
     const pressed = await made.press('next', { channelId: '600000000000000099' });
-    expect(sent(pressed.update).content).toMatch(/^The train is at stop 2 of 4/);
+    expect(shown(pressed.update)).toMatch(/\nAt stop 2 of 4/);
   });
 
   it('a press moves the train and changes the panel itself, so that the conductor can go on', async () => {
@@ -406,23 +473,25 @@ describe('the button "Move train…" and its panel', () => {
     const pressed = await made.press('next');
     expect(made.current().train.stop).toBe(1);
     // The panel is edited in place: no new answer, no acknowledgement that leaves it as it was.
-    expect(pressed.update).toHaveBeenCalledWith(made.panel());
+    expect(pressed.update).toHaveBeenCalledWith(v2Answer(made.panel()));
     expect(pressed.reply).not.toHaveBeenCalled();
     expect(pressed.deferUpdate).not.toHaveBeenCalled();
-    expect(sent(pressed.update).content).toBe(
-      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}.`,
+    expect(shown(pressed.update)).toBe(
+      panelText(`At stop 2 of 4: ${STACKS_BARE}`, `Next is ${MURAL_BARE}`),
     );
-    // Each press is made with the buttons of the panel as it was just drawn.
+    // Each press is made with the controls of the panel as it was just drawn.
     const skipped = await made.press('skip');
-    expect(sent(skipped.update).content).toBe(
-      `The train is at stop 4 of 4: ${FOUNTAIN}. It is the last stop.`,
+    expect(shown(skipped.update)).toBe(
+      panelText(`At stop 4 of 4: ${FOUNTAIN_BARE}`, 'It is the last stop: Next finishes the route'),
     );
     const back = await made.press('previous');
-    expect(sent(back.update).content).toMatch(/^The train is at stop 3 of 4/);
+    expect(shown(back.update)).toMatch(/\nAt stop 3 of 4/);
     const finished = await made.press('finish');
-    expect(finished.update).toHaveBeenCalledWith(made.panel());
-    expect(sent(finished.update).content).toBe(
-      `The train has finished its route of 4 stops. Previous takes it back to stop 3: ${MURAL}.`,
+    expect(finished.update).toHaveBeenCalledWith(v2Answer(made.panel()));
+    expect(shown(finished.update)).toBe(
+      panelText(
+        `The train has finished its route of 4 stops. Previous takes it back to stop 3: ${MURAL_BARE}.`,
+      ),
     );
     // The others are told once, where the train ended up.
     expect(await made.lines()).toEqual([
@@ -447,7 +516,7 @@ describe('the button "Move train…" and its panel', () => {
       expect(pressed.deferUpdate).not.toHaveBeenCalled();
       expect(pressed.reply).not.toHaveBeenCalled();
     }
-    expect(sent(second.update).content).toMatch(/^The train is at stop 3 of 4/);
+    expect(shown(second.update)).toMatch(/\nAt stop 3 of 4/);
     expect(made.current().train.stop).toBe(2);
     await made.ctx.clickAnswers.flush();
   });
@@ -460,16 +529,18 @@ describe('the button "Move train…" and its panel', () => {
       made.click('next:4:1', { userId: BOB, displayName: 'Bob' }),
     ]);
     expect(made.current().train.stop).toBe(1);
-    const moved = `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}.`;
-    const texts = [sent(alice.update).content, sent(bob.update).content].sort();
-    // One of them moved it; the other is shown where the train is now, with fresh buttons.
-    expect(texts).toEqual([`The train has moved on meanwhile.\n${moved}`, moved].sort());
+    const where = [`At stop 2 of 4: ${STACKS_BARE}`, `Next is ${MURAL_BARE}`];
+    const texts = [shown(alice.update), shown(bob.update)].sort();
+    // One of them moved it; the other is shown where the train is now, with fresh controls.
+    expect(texts).toEqual(
+      [panelText('The train has moved on meanwhile.', ...where), panelText(...where)].sort(),
+    );
     for (const pressed of [alice, bob]) {
-      expect(sent(pressed.update).components).toEqual(made.panel().components);
+      expect(customIdsOf(asV2(sent(pressed.update)))).toEqual(customIdsOf(made.panel()));
     }
     // A press on the fresh buttons moves it on.
     const next = await made.press('next', { userId: BOB });
-    expect(sent(next.update).content).toMatch(/^The train is at stop 3 of 4/);
+    expect(shown(next.update)).toMatch(/\nAt stop 3 of 4/);
     // And `/next` typed twice still moves twice.
     await Promise.all([made.run('next'), made.run('next', { userId: BOB })]);
     expect(made.current().train.stop).toBe(4);
@@ -481,20 +552,23 @@ describe('the button "Move train…" and its panel', () => {
     await made.trains.move(made.party.id, { id: BOB }, 'finish', false);
     const pressed = await made.click('previous:4');
     expect(made.current().train.stop).toBe(4);
-    expect(pressed.update).toHaveBeenCalledWith({
-      ...made.panel(),
-      content:
-        'The train has moved on meanwhile.\nThe train has finished its route of 4 stops. ' +
-        `Previous takes it back to stop 1: ${BRIDGE}.`,
-    });
+    expect(pressed.update).toHaveBeenCalledWith(
+      v2Answer(made.panel('The train has moved on meanwhile.')),
+    );
+    expect(shown(pressed.update)).toBe(
+      panelText(
+        'The train has moved on meanwhile.',
+        `The train has finished its route of 4 stops. Previous takes it back to stop 1: ${BRIDGE_BARE}.`,
+      ),
+    );
     // From the panel as it is now, Previous works: back to where Bob finished the route from.
     const back = await made.press('previous');
-    expect(sent(back.update).content).toBe(
-      `The train is at stop 1 of 4: ${BRIDGE}. Next is ${STACKS}.`,
+    expect(shown(back.update)).toBe(
+      panelText(`At stop 1 of 4: ${BRIDGE_BARE}`, `Next is ${STACKS_BARE}`),
     );
     // A button without the place it was drawn at (none is made so) moves nothing either.
     const bare = await made.click('previous');
-    expect(sent(bare.update).content).toMatch(/^The train has moved on meanwhile\.\n/);
+    expect(shown(bare.update)).toMatch(/^### Move the train\nThe train has moved on meanwhile\.\n/);
     expect(made.current().train.stop).toBe(0);
   });
 
@@ -503,14 +577,16 @@ describe('the button "Move train…" and its panel', () => {
     await made.press('next');
     await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Present);
     const finished = await made.press('finish');
-    expect(sent(finished.update).content).toBe(
-      `The train has finished its route of 4 stops. Previous takes it back to stop 2: ${STACKS}.`,
+    expect(shown(finished.update)).toBe(
+      panelText(
+        `The train has finished its route of 4 stops. Previous takes it back to stop 2: ${STACKS_BARE}.`,
+      ),
     );
     expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: 1 });
     const back = await made.press('previous');
-    expect(back.update).toHaveBeenCalledWith(made.panel());
-    expect(sent(back.update).content).toBe(
-      `The train is at stop 2 of 4: ${STACKS}. Next is ${MURAL}.`,
+    expect(back.update).toHaveBeenCalledWith(v2Answer(made.panel()));
+    expect(shown(back.update)).toBe(
+      panelText(`At stop 2 of 4: ${STACKS_BARE}`, `Next is ${MURAL_BARE}`),
     );
     expect(made.current().train).toMatchObject({ stop: 1, finishedFrom: null });
     // Nobody went anywhere.
@@ -531,21 +607,20 @@ describe('the button "Move train…" and its panel', () => {
     await made.trains.removeStop(made.party.id, { id: BOB }, 2);
     const pressed = await made.click('previous:end:1');
     expect(made.current().train).toMatchObject({ route: [4, 7, 2], stop: 3 });
-    expect(pressed.update).toHaveBeenCalledWith({
-      ...made.panel(),
-      content:
-        'That button no longer leads where it said.\n' +
-        'The train has finished its route of 3 stops. ' +
-        `Previous takes it back to stop 3: ${FOUNTAIN}.`,
-    });
+    expect(shown(pressed.update)).toBe(
+      panelText(
+        'That button no longer leads where it said.',
+        `The train has finished its route of 3 stops. Previous takes it back to stop 3: ${FOUNTAIN_BARE}.`,
+      ),
+    );
     // A Previous without where it leads (none is made so) moves nothing either.
     const bare = await made.click('previous:end');
     expect(made.current().train.stop).toBe(3);
-    expect(sent(bare.update).content).toMatch(/^That button no longer leads where it said\.\n/);
+    expect(shown(bare.update)).toMatch(/\nThat button no longer leads where it said\.\n/);
     // The fresh button leads where the panel now says.
     const back = await made.press('previous');
-    expect(sent(back.update).content).toBe(
-      `The train is at stop 3 of 3: ${FOUNTAIN}. It is the last stop.`,
+    expect(shown(back.update)).toBe(
+      panelText(`At stop 3 of 3: ${FOUNTAIN_BARE}`, 'It is the last stop: Next finishes the route'),
     );
   });
 
@@ -561,9 +636,11 @@ describe('the button "Move train…" and its panel', () => {
     await made.trains.move(made.party.id, bob, 'finish', false);
     const pressed = await made.click('previous:end:1');
     expect(made.current().train).toMatchObject({ stop: 4, finishedFrom: 7 });
-    expect(sent(pressed.update).content).toBe(
-      'That button no longer leads where it said.\n' +
-        `The train has finished its route of 4 stops. Previous takes it back to stop 3: ${MURAL}.`,
+    expect(shown(pressed.update)).toBe(
+      panelText(
+        'That button no longer leads where it said.',
+        `The train has finished its route of 4 stops. Previous takes it back to stop 3: ${MURAL_BARE}.`,
+      ),
     );
   });
 
@@ -573,14 +650,18 @@ describe('the button "Move train…" and its panel', () => {
     // The train is at The Stacks (gym 1), which becomes the first stop.
     await made.trains.removeStop(made.party.id, { id: BOB }, 1);
     const pressed = await made.click('next:1:7');
-    expect(sent(pressed.update).content).toBe(
-      `The train is at stop 2 of 3: ${MURAL}. Next is ${FOUNTAIN}.`,
+    expect(shown(pressed.update)).toBe(
+      panelText(`At stop 2 of 3: ${MURAL_BARE}`, `Next is ${FOUNTAIN_BARE}`),
     );
     // The stop the train is at is removed: the panel drawn there is stale.
     await made.trains.removeStop(made.party.id, { id: BOB }, 2);
     const stale = await made.click('next:7');
-    expect(sent(stale.update).content).toBe(
-      `The train has moved on meanwhile.\nThe train is at stop 2 of 2: ${FOUNTAIN}. It is the last stop.`,
+    expect(shown(stale.update)).toBe(
+      panelText(
+        'The train has moved on meanwhile.',
+        `At stop 2 of 2: ${FOUNTAIN_BARE}`,
+        'It is the last stop: Next finishes the route',
+      ),
     );
     expect(made.current().train).toMatchObject({ route: [1, 2], stop: 1 });
   });
@@ -589,40 +670,47 @@ describe('the button "Move train…" and its panel', () => {
     const made = await setup();
     // Alice's panel says "Next is The Stacks"; Bob takes The Stacks (gym 1) off the route.
     const opened = await made.click('move');
-    expect(sent(opened.reply).content).toContain(`Next is ${STACKS}.`);
+    expect(shown(opened.reply)).toContain(`Next is ${STACKS_BARE}`);
     await made.trains.removeStop(made.party.id, { id: BOB }, 2);
     const pressed = await made.click('next:4:1');
     expect(made.current().train.stop).toBe(0);
-    expect(pressed.update).toHaveBeenCalledWith({
-      ...made.panel(),
-      content:
-        'That button no longer leads where it said.\n' +
-        `The train is at stop 1 of 3: ${BRIDGE}. Next is ${MURAL}.`,
-    });
+    expect(pressed.update).toHaveBeenCalledWith(
+      v2Answer(made.panel('That button no longer leads where it said.')),
+    );
+    expect(shown(pressed.update)).toBe(
+      panelText(
+        'That button no longer leads where it said.',
+        `At stop 1 of 3: ${BRIDGE_BARE}`,
+        `Next is ${MURAL_BARE}`,
+      ),
+    );
     // The fresh buttons lead where the panel now says.
     const next = await made.press('next');
-    expect(sent(next.update).content).toMatch(/^The train is at stop 2 of 3/);
+    expect(shown(next.update)).toMatch(/\nAt stop 2 of 3/);
     // Skip promised the stop after the next one: the same.
     const skip = await setup();
     await skip.trains.removeStop(skip.party.id, { id: BOB }, 3);
     const skipped = await skip.click('skip:4:7');
     expect(skip.current().train.stop).toBe(0);
-    expect(sent(skipped.update).content).toMatch(/^That button no longer leads where it said\.\n/);
+    expect(shown(skipped.update)).toMatch(/\nThat button no longer leads where it said\.\n/);
     // A Next or Skip without what it promised (none is made so) moves nothing either.
     const bare = await skip.click('next:4');
     expect(skip.current().train.stop).toBe(0);
-    expect(sent(bare.update).content).toMatch(/^That button no longer leads where it said\.\n/);
+    expect(shown(bare.update)).toMatch(/\nThat button no longer leads where it said\.\n/);
   });
 
-  it('keeps the ids of its buttons within what Discord takes, whatever the ids of the gyms', async () => {
+  it('keeps the ids of its controls within what Discord takes, whatever the ids of the gyms', async () => {
     const made = await setup();
     const far = { ...made.current().train, route: [4294967295, 4294967294, 4294967293], stop: 0 };
     await made.store.update(made.party.id, (party) => ({
       party: party.type === 'train' ? { ...party, train: far } : party,
     }));
-    for (const button of made.panel().components[0]?.components ?? []) {
-      expect(button.custom_id.length).toBeLessThanOrEqual(100);
-    }
+    const ids = [
+      ...customIdsOf(made.panel()),
+      ...selectsOf(made.panel()).map((menu) => menu.customId),
+    ];
+    expect(ids).toHaveLength(6);
+    for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
   });
 
   it('says one sentence for a press that cannot move a finished train', async () => {
@@ -630,52 +718,55 @@ describe('the button "Move train…" and its panel', () => {
     await made.press('finish');
     // The button is switched off, but a press can still arrive.
     const pressed = await made.click('next:end');
-    expect(pressed.update).toHaveBeenCalledWith({
-      ...made.panel(),
-      content: `The train has finished its route of 4 stops. Previous takes it back to stop 1: ${BRIDGE}.`,
-    });
+    expect(pressed.update).toHaveBeenCalledWith(v2Answer(made.panel()));
+    expect(shown(pressed.update)).toBe(
+      panelText(
+        `The train has finished its route of 4 stops. Previous takes it back to stop 1: ${BRIDGE_BARE}.`,
+      ),
+    );
     const first = await setup();
     const back = await first.click('previous:4');
-    expect(sent(back.update).content).toBe(
-      `This train is at its first stop.\nThe train is at stop 1 of 4: ${BRIDGE}. Next is ${STACKS}.`,
+    expect(shown(back.update)).toBe(
+      panelText(
+        'This train is at its first stop.',
+        `At stop 1 of 4: ${BRIDGE_BARE}`,
+        `Next is ${STACKS_BARE}`,
+      ),
     );
   });
 
-  it('loses its buttons when the route is gone', async () => {
+  it('loses its controls when the route is gone', async () => {
     const made = await setup();
     await made.trains.clearRoute(made.party.id, { id: BOB }, true);
     const pressed = await made.click('next:4');
-    expect(pressed.update).toHaveBeenCalledWith({
-      content: 'This train has no route yet. Add its stops with `/route add`.',
-      components: [],
-    });
+    expect(pressed.update).toHaveBeenCalledWith(
+      v2Answer(panelNote('This train has no route yet. Add its stops with `/route add`.')),
+    );
   });
 
-  it('loses its buttons for who may no longer move the train, and when the train has ended', async () => {
+  it('loses its controls for who may no longer move the train, and when the train has ended', async () => {
     const made = await setup();
     await made.trains.setConductor(made.party.id, { id: BOB });
     const refused = await made.press('next');
-    expect(refused.update).toHaveBeenCalledWith({
-      content: 'This train has a conductor: only they and the moderators can move it.',
-      components: [],
-    });
+    expect(refused.update).toHaveBeenCalledWith(
+      v2Answer(panelNote('This train has a conductor: only they and the moderators can move it.')),
+    );
     expect(made.current().train.stop).toBe(0);
     await made.attendance.leave(made.party.id, { id: ALICE });
     await made.trains.clearConductor(made.party.id, { id: BOB }, false);
     const left = await made.press('next');
-    expect(left.update).toHaveBeenCalledWith({
-      content: 'You are not signed up for this train.',
-      components: [],
-    });
+    expect(left.update).toHaveBeenCalledWith(
+      v2Answer(panelNote('You are not signed up for this train.')),
+    );
     await made.service.end(made.party.id);
     const over = await made.click('next:4', { userId: BOB });
-    expect(over.update).toHaveBeenCalledWith({ content: 'This train is over.', components: [] });
+    expect(over.update).toHaveBeenCalledWith(v2Answer(panelNote('This train is over.')));
     expect(sent((await made.click('move', { userId: BOB })).reply).content).toBe(
       'This train is over.',
     );
   });
 
-  it('refuses the buttons of a train on a party that is none', async () => {
+  it('refuses the controls of a train on a party that is none', async () => {
     const meetup = await createdMeetup();
     const before = meetup.current();
     const { ctx } = createTestContext({
@@ -691,15 +782,245 @@ describe('the button "Move train…" and its panel', () => {
         customId: `party:${meetup.party.id}:${action}`,
         channelId: meetup.postId,
         userId: REPORTER,
+        messageRows: V2_ROWS,
       });
       await router.handle(pressed as never);
       return pressed;
     };
     expect(sent((await press('move')).reply).content).toBe(STALE_COMPONENT);
-    expect((await press('next:4')).update).toHaveBeenCalledWith({
-      content: 'This train is over.',
-      components: [],
+    for (const action of ['next:4', 'reverse:4:4']) {
+      expect((await press(action)).update).toHaveBeenCalledWith(
+        v2Answer(panelNote('This train is over.')),
+      );
+    }
+    const picked = fakeSelect({
+      customId: `party:${meetup.party.id}:atend:4`,
+      values: ['loop'],
+      channelId: meetup.postId,
+      userId: REPORTER,
+      messageRows: V2_ROWS,
     });
+    await router.handle(picked as never);
+    expect(picked.update).toHaveBeenCalledWith(v2Answer(panelNote('This train is over.')));
     expect(meetup.current()).toBe(before);
   });
 });
+
+describe('the Move train panel: what the train does at the end of its route', () => {
+  it('says where Next leads at the last stop of a train that loops or turns back', async () => {
+    const looping = await setup([4, 1, 7, 2], 0, 'loop');
+    for (let n = 0; n < 3; n++) await looping.press('next');
+    expect(firstText(looping.panel())).toBe(
+      panelText(`At stop 4 of 4: ${FOUNTAIN_BARE}`, `Next goes round to ${BRIDGE_BARE}`),
+    );
+    expect(await looping.answer('next')).toBe(
+      `The train is at stop 1 of 4: ${BRIDGE}. Next is ${STACKS}. I am telling the others.`,
+    );
+    const turning = await setup([4, 1, 7, 2], 0, 'turn-back');
+    for (let n = 0; n < 3; n++) await turning.press('next');
+    expect(firstText(turning.panel())).toBe(
+      panelText(`At stop 4 of 4: ${FOUNTAIN_BARE}`, `Next turns back to ${MURAL_BARE}`),
+    );
+    const turned = await turning.press('next');
+    expect(shown(turned.update)).toBe(
+      panelText(`At stop 2 of 4: ${MURAL_BARE}`, `Next is ${STACKS_BARE}`),
+    );
+    expect(turning.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 1 });
+  });
+
+  it('changes the mode with its menu, says so in the post without a ping, and draws the panel anew', async () => {
+    const made = await setup();
+    expect(selectsOf(made.panel())[0]?.options).toEqual([
+      {
+        label: 'Finish at the last stop',
+        value: 'finish',
+        description: 'The train stops at the last stop',
+      },
+      {
+        label: 'Loop: back to the first stop',
+        value: 'loop',
+        description: 'After the last stop comes the first',
+      },
+      {
+        label: 'Turn back at the end',
+        value: 'turn-back',
+        description: 'The route is run backwards from the end',
+      },
+    ]);
+    const picked = await made.pick('loop');
+    expect(made.current().train.atEnd).toBe('loop');
+    expect(picked.update).toHaveBeenCalledWith(v2Answer(made.panel()));
+    expect(chosen(made.panel())).toBe('loop');
+    // The mode it has already changes nothing, and the panel is drawn again.
+    const again = await made.pick('loop');
+    expect(again.update).toHaveBeenCalledWith(v2Answer(made.panel()));
+    expect(await made.lines()).toEqual([`**Alice** (<@${ALICE}>) set the train to loop.`]);
+    for (const message of made.gateway.messagesIn(made.postId)) {
+      expect(message.message.mention).toBeUndefined();
+    }
+    // The post says it in its route line.
+    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
+      '-# Route, stop 1 of 4, loops: ',
+    );
+  });
+
+  it('takes the menu for who may arrange the route, and only where the panel was drawn', async () => {
+    const made = await setup();
+    const stranger = await made.pick('loop', { userId: CAROL });
+    expect(stranger.update).toHaveBeenCalledWith(
+      v2Answer(panelNote('You are not signed up for this train.')),
+    );
+    // Bob opened the panel, then Alice became the conductor: the mode never moves the train,
+    // so his pick is taken; the panel is for moving it, which he may no longer, and goes.
+    const bobs = made.panel();
+    await made.trains.setConductor(made.party.id, { id: ALICE });
+    const late = await made.pick('loop', {
+      userId: BOB,
+      displayName: 'Bob',
+      messageRows: bobs.components as FakeRow[],
+    });
+    expect(made.current().train.atEnd).toBe('loop');
+    expect(late.update).toHaveBeenCalledWith(
+      v2Answer(panelNote('This train has a conductor: only they and the moderators can move it.')),
+    );
+    expect((await made.lines()).at(-1)).toBe(`**Bob** (<@${BOB}>) set the train to loop.`);
+    await made.trains.clearConductor(made.party.id, { id: ALICE }, false);
+    await made.trains.setAtEnd(made.party.id, { id: ALICE }, false, 'finish');
+    await made.trains.move(made.party.id, { id: BOB }, 'next', false);
+    const stale = await made.handle(
+      fakeSelect({
+        customId: `party:${made.party.id}:atend:4`,
+        values: ['turn-back'],
+        channelId: made.postId,
+        userId: ALICE,
+        displayName: 'Alice',
+        messageRows: V2_ROWS,
+      }),
+    );
+    expect(made.current().train.atEnd).toBe('finish');
+    expect(shown(stale.update)).toMatch(
+      /^### Move the train\nThe train has moved on meanwhile\.\n/,
+    );
+    // A value the menu does not offer is a stale control.
+    const odd = await made.pick('bounce');
+    expect(sent(odd.reply).content).toBe(STALE_COMPONENT);
+  });
+
+  it('reverses a route that finishes at its first stop, says so without a ping, and keeps who is here', async () => {
+    const made = await setup();
+    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Present);
+    const pressed = await made.press('reverse');
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 3 });
+    expect(shown(pressed.update)).toBe(
+      panelText(`At stop 4 of 4: ${BRIDGE_BARE}`, 'It is the last stop: Next finishes the route'),
+    );
+    expect(attendeeOf(made.current(), BOB)?.status).toBe(PartyStatus.Present);
+    const said = await made.lines();
+    expect(said.at(-1)).toBe(
+      `The route was reversed by **Alice** (<@${ALICE}>): it now runs from **Old Stone Fountain** ` +
+        'to **Veterans Memorial Bridge**.',
+    );
+    // A line and no announcement: nobody is pinged.
+    expect(said.filter((line) => line.startsWith('<@'))).toEqual([]);
+    // Reverse is offered at the last stop too, and back it goes.
+    await made.press('reverse');
+    expect(made.current().train).toMatchObject({ route: [4, 1, 7, 2], stop: 0 });
+  });
+
+  it('reverses once for a panel: a second press, or a panel drawn before another Reverse, does nothing', async () => {
+    const made = await setup();
+    const bobs = made.panel();
+    const first = await made.press('reverse');
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 3 });
+    // The same button once more (a double press, or the old panel kept): the route stays.
+    const again = await made.click('reverse:4:4');
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 3 });
+    expect(shown(again.update)).toBe(
+      panelText(
+        'That button no longer leads where it said.',
+        `At stop 4 of 4: ${BRIDGE_BARE}`,
+        'It is the last stop: Next finishes the route',
+      ),
+    );
+    expect(shown(first.update)).toBe(
+      panelText(`At stop 4 of 4: ${BRIDGE_BARE}`, 'It is the last stop: Next finishes the route'),
+    );
+    // Bob's panel was drawn before Alice's Reverse.
+    const reverse = customIdsOf(bobs).find((id) => id.includes(':reverse:')) ?? '';
+    const stale = await made.handle(
+      fakeButton({
+        customId: reverse,
+        channelId: made.postId,
+        userId: BOB,
+        displayName: 'Bob',
+        messageRows: bobs.components as FakeRow[],
+      }),
+    );
+    expect(made.current().train).toMatchObject({ route: [2, 7, 1, 4], stop: 3 });
+    expect(shown(stale.update)).toMatch(/\nThat button no longer leads where it said\.\n/);
+    expect((await made.lines()).filter((line) => /reversed/.test(line))).toHaveLength(1);
+  });
+
+  it('offers Reverse where it may be done: at either end of a route that finishes, anywhere on a loop', async () => {
+    const made = await setup();
+    const offered = () => customIdsOf(made.panel()).some((id) => id.includes(':reverse:'));
+    expect(offered()).toBe(true);
+    await made.press('next');
+    expect(offered()).toBe(false);
+    // A press on a Reverse drawn at the first stop moves nothing now.
+    const stale = await made.click('reverse:4:4');
+    expect(shown(stale.update)).toMatch(/\nThe train has moved on meanwhile\.\n/);
+    const here = await made.click('reverse:1:4');
+    expect(shown(here.update)).toMatch(
+      /\nThe route of this train can be reversed only at its first or last stop\.\n/,
+    );
+    await made.pick('loop');
+    expect(offered()).toBe(true);
+    await made.pick('turn-back');
+    expect(offered()).toBe(false);
+    // A route finished from its last stop starts again from there.
+    const finished = await setup([4, 1]);
+    await finished.press('next');
+    await finished.press('next');
+    expect(customIdsOf(finished.panel())).toContain(`party:${finished.party.id}:reverse:end:4`);
+    const restarted = await finished.press('reverse');
+    expect(finished.current().train).toMatchObject({ route: [1, 4], stop: 0 });
+    expect(shown(restarted.update)).toBe(
+      panelText(`At stop 1 of 2: ${STACKS_BARE}`, `Next is ${BRIDGE_BARE}`),
+    );
+  });
+
+  it('stays within what Discord takes with the longest names, every control shown', async () => {
+    const made = await setup([4, 1, 7, 2], 0, 'loop');
+    const heavy = (id: number): PostGym => ({
+      name: `${'[*]'.repeat(84)}${id}`,
+      nickname: null,
+      lat: 40,
+      lon: -80,
+      notice: null,
+      taggedEx: true,
+      confirmedEx: false,
+    });
+    const panel = trainPanel(
+      { party: made.current(), gym: heavy },
+      'That button no longer leads where it said.',
+    );
+    expectV2Sendable(panel);
+    expect(customIdsOf(panel)).toHaveLength(5);
+  });
+
+  it('answers a press on a plain-text panel sent before this version with the new panel below it', async () => {
+    const made = await setup();
+    const old = await made.press('next', { messageRows: CLASSIC_ROWS });
+    expect(made.current().train.stop).toBe(1);
+    expect(old.update).toHaveBeenCalledWith({ content: OLD_PANEL, components: [] });
+    expect(old.followUp).toHaveBeenCalledWith({
+      components: made.panel().components,
+      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
+    });
+    // A refusal on one is the same: a line, and the panel as things stand below it.
+    const stale = await made.click('next:4:1', { messageRows: CLASSIC_ROWS });
+    expect(stale.update).toHaveBeenCalledWith({ content: OLD_PANEL, components: [] });
+    expect(shown(stale.followUp)).toMatch(/\nThe train has moved on meanwhile\.\n/);
+  });
+});
diff --git a/src/commands/trains/move.ts b/src/commands/trains/move.ts
index 59227a6cec24880fb57da65b7a8697f49453cef1..2e10b088074fa43436b6a06482bb7e7e1ebccae6 100644
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -9,12 +9,15 @@ import type { AppContext } from '../../app-context.js';
 import type { SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { isStaff, requireTrain } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
-import { isTrain, membersWhere, type TrainParty } from '../../domain/party/party.js';
+import { isTrain, isTrainAtEnd, membersWhere, type TrainParty } from '../../domain/party/party.js';
 import { mayNotMove, type TrainMove } from '../../domain/party/train.js';
 import { problemText } from '../../render/activity.js';
-import { trainPanel, whereText } from '../../render/train-panel.js';
+import { panelNote, trainPanel, whereText } from '../../render/train-panel.js';
 import type { TrainPlaces } from '../../render/train-post.js';
+import type { TrainChangeOutcome } from '../../services/train-service.js';
 import { actingMember, commandTrain, partyOver } from '../parties/reply.js';
 import { CHANGE_THROTTLE } from '../raids/change.js';
 
@@ -116,9 +119,10 @@ export const finish = moveCommand(
 
 /**
  * The button "Move train…" of a train's post: answers the member who pressed it, privately,
- * with the panel that moves the train. Who may not move it is told so in the place of the
- * panel, and so is everybody while the train has no route: there is nothing to move it along.
- * Not a click that is gathered (`answerClick`): every press gets a panel of its own.
+ * with the panel that moves the train (a components-v2 message, `trainPanel`). Who may not move
+ * it is told so in the place of the panel, and so is everybody while the train has no route:
+ * there is nothing to move it along. Not a click that is gathered (`answerClick`): every press
+ * gets a panel of its own.
  */
 export async function openTrainPanel(
   interaction: ButtonInteraction,
@@ -133,64 +137,146 @@ export async function openTrainPanel(
   if (problem) throw new UserError(refusal(ctx, problem));
   if (party.train.route.length === 0) throw new UserError(refusal(ctx, 'no-route'));
   await interaction.reply({
-    ...trainPanel(trainPlaces(ctx, party)),
-    flags: MessageFlags.Ephemeral,
+    components: trainPanel(trainPlaces(ctx, party)).components,
+    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
   });
 }
 
+/** What an old panel says once a press has put the new one below it. */
+export const OLD_PANEL = 'This panel was replaced by the one below.';
+
 /**
- * A press on a button of the panel: moves the train, and changes the panel itself to how things
- * stand now, so that the member can go on from it. Never a gathered answer: this message is
- * the panel.
- *
- * `from` is where the train was when the panel was drawn, which the button carries. A panel
- * that no longer shows where the train is (somebody else moved it, the stop it was at was
- * removed) moves nothing: it says so and shows where the train is now, with fresh buttons, so
- * that two members who press Next on the same stop move the train once. A button without it
- * (none is made so) is taken the same way. `target` is where Next, Previous or Skip led when
- * the panel was drawn: when the route was edited since and the move would lead to another stop,
- * it moves nothing either and says that the button no longer leads where it said. So it does
- * when the route was finished from another stop since, which changes where Previous leads
- * without any edit. The store decides, inside the change.
+ * Shows `message` in the place of the panel that was pressed (`update`). A panel sent before
+ * plan 8B-3 is plain text. Whether Discord takes a components-v2 interaction update of a
+ * classic message is not known, and it is not tried: that panel is closed with a line
+ * (`OLD_PANEL`), and the panel comes anew, privately, below it, which is the safe path.
+ */
+async function showPanel(
+  interaction: MessageComponentInteraction,
+  message: V2Message,
+): Promise<void> {
+  if (interaction.message.flags.has(MessageFlags.IsComponentsV2)) {
+    await interaction.update(v2Answer(message));
+    return;
+  }
+  await interaction.update({ content: OLD_PANEL, components: [] });
+  await interaction.followUp({
+    components: message.components,
+    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
+  });
+}
+
+/**
+ * What a press on the panel answers, once the train service has decided (`outcome`): the panel
+ * as things stand now, so that the member can go on from it. Never a gathered answer: this
+ * message is the panel.
  *
- * A move that cannot be made from where the train is leaves the panel, with the reason above
- * where the train is (not for a finished route, which the panel says itself). A member who may
- * no longer move the train, a train without a route and a train that has ended lose the buttons.
+ * A press that changed nothing because the panel no longer fits (somebody else moved the train,
+ * the stop it was at was removed, the route was edited so that a move would lead elsewhere, or
+ * finished from another stop, which changes where Previous leads) shows the reason above where
+ * the train is now, with fresh controls, so that two members who press Next on the same stop
+ * move the train once. So does one that cannot be done from where the train is (not for a
+ * finished route, which the panel says itself). A member who may no longer move the train, a
+ * train without a route and a train that has ended lose the controls (`panelNote`).
  */
-export async function pressTrainPanel(
+async function answerPanel(
   interaction: MessageComponentInteraction,
   ctx: AppContext,
   partyId: string,
-  move: TrainMove,
-  from: string | undefined,
-  target?: string,
+  staff: boolean,
+  outcome: TrainChangeOutcome,
 ): Promise<void> {
-  const member = actingMember(interaction);
-  const staff = isStaff(interaction, ctx);
-  // No place names an empty text: a press without one finds the train moved on. Every move
-  // but Finish also says where it leads, and a press without that finds the route changed.
-  const promised = move === 'finish' ? undefined : (target ?? '');
-  const outcome = await ctx.trains.move(partyId, member, move, staff, from ?? '', promised);
   if (outcome.kind === 'gone') {
-    await interaction.update({ content: partyOver(A_TRAIN), components: [] });
+    await showPanel(interaction, panelNote(partyOver(A_TRAIN)));
     return;
   }
   if (outcome.kind === 'ok') {
-    await interaction.update(trainPanel(trainPlaces(ctx, outcome.party)));
+    // The mode may be set by who may not move the train (a member who is not the conductor):
+    // the panel is for moving it, so they get why they may not instead.
+    const cannot = mayNotMove(outcome.party, interaction.user.id, staff);
+    await showPanel(
+      interaction,
+      cannot ? panelNote(refusal(ctx, cannot)) : trainPanel(trainPlaces(ctx, outcome.party)),
+    );
     return;
   }
   const why = refusal(ctx, outcome.reason);
   const party = ctx.parties.get(partyId);
-  if (!party || !isTrain(party) || mayNotMove(party, member.id, staff)) {
-    await interaction.update({ content: why, components: [] });
+  if (!party || !isTrain(party) || mayNotMove(party, interaction.user.id, staff)) {
+    await showPanel(interaction, panelNote(why));
     return;
   }
   if (party.train.route.length === 0) {
-    await interaction.update({ content: refusal(ctx, 'no-route'), components: [] });
+    await showPanel(interaction, panelNote(refusal(ctx, 'no-route')));
     return;
   }
-  const panel = trainPanel(trainPlaces(ctx, party));
   // That the route is finished is what the panel says of where the train is: once is enough.
-  const content = outcome.reason === 'route-finished' ? panel.content : `${why}\n${panel.content}`;
-  await interaction.update({ ...panel, content });
+  const note = outcome.reason === 'route-finished' ? undefined : why;
+  await showPanel(interaction, trainPanel(trainPlaces(ctx, party), note));
+}
+
+/**
+ * A press on a move of the panel (`party:<id>:<move>:<from>[:<target>]`): moves the train, and
+ * changes the panel itself to how things stand now (`answerPanel`). `from` is where the train
+ * was when the panel was drawn, which the button carries; `target` is where Next, Previous or
+ * Skip led then (at the end of a route that loops or turns back, the gym that comes then). The
+ * store decides, inside the change.
+ */
+export async function pressTrainPanel(
+  interaction: MessageComponentInteraction,
+  ctx: AppContext,
+  partyId: string,
+  move: TrainMove,
+  from: string | undefined,
+  target?: string,
+): Promise<void> {
+  const member = actingMember(interaction);
+  const staff = isStaff(interaction, ctx);
+  // No place names an empty text: a press without one finds the train moved on. Every move
+  // but Finish also says where it leads, and a press without that finds the route changed.
+  const promised = move === 'finish' ? undefined : (target ?? '');
+  const outcome = await ctx.trains.move(partyId, member, move, staff, from ?? '', promised);
+  await answerPanel(interaction, ctx, partyId, staff, outcome);
+}
+
+/**
+ * "Reverse the route" of the panel (`party:<id>:reverse:<from>:<first>`): the route in the other
+ * order, the train at the same gym (`TrainService.reverse`). No movement: nobody is pinged, and
+ * the post says it in a line. Refused, with the panel drawn anew, where the train is no longer
+ * where the panel was drawn (`from`), where the route no longer begins with the gym it began
+ * with then (`first`: a second press of one panel, or a panel drawn before another member's
+ * Reverse, would flip it back), or where the route may not be reversed from there. A button
+ * without either (none is made so) is refused like a stale one.
+ */
+export async function pressReverse(
+  interaction: MessageComponentInteraction,
+  ctx: AppContext,
+  partyId: string,
+  from: string | undefined,
+  first: string | undefined,
+): Promise<void> {
+  const member = actingMember(interaction);
+  const staff = isStaff(interaction, ctx);
+  const outcome = await ctx.trains.reverse(partyId, member, staff, from ?? '', first ?? '');
+  await answerPanel(interaction, ctx, partyId, staff, outcome);
+}
+
+/**
+ * The menu "At the end of the route" of the panel (`party:<id>:atend:<from>`): sets what the
+ * train does at the end of its route (`TrainService.setAtEnd`), for whoever may arrange it, and
+ * draws the panel anew. The mode the train has already changes nothing and redraws. A value the
+ * menu does not offer is a stale control.
+ */
+export async function pressAtEnd(
+  interaction: MessageComponentInteraction & { values: readonly string[] },
+  ctx: AppContext,
+  partyId: string,
+  from: string | undefined,
+): Promise<void> {
+  const [chosen] = interaction.values;
+  if (!isTrainAtEnd(chosen)) throw new UserError(STALE_COMPONENT);
+  const member = actingMember(interaction);
+  const staff = isStaff(interaction, ctx);
+  const outcome = await ctx.trains.setAtEnd(partyId, member, staff, chosen, from ?? '');
+  await answerPanel(interaction, ctx, partyId, staff, outcome);
 }
diff --git a/src/components/party.ts b/src/components/party.ts
index 33a2f60647a386f985212cf42dcd769d45ce5565..ff6fd898513c280dd29cbd73a3d24c41c6ee8608 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -12,7 +12,12 @@ import {
 import { changeTime, timesAlready } from '../commands/raids/change.js';
 import { memberInfo } from '../discord/member-info.js';
 import { showScreenshot } from '../commands/screenshots/feedback.js';
-import { openTrainPanel, pressTrainPanel } from '../commands/trains/move.js';
+import {
+  openTrainPanel,
+  pressAtEnd,
+  pressReverse,
+  pressTrainPanel,
+} from '../commands/trains/move.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
@@ -32,7 +37,8 @@ import {
 /**
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
  * question, the "Set time" button of a raid without times with the form it opens, and the
- * button "Move train…" of a train with the panel it opens (`commands/trains/move.ts`). The party
+ * button "Move train…" of a train with the panel it opens and its controls, the menu of what the
+ * train does at the end of its route among them (`commands/trains/move.ts`). The party
  * is named by the custom id, not by the channel, so the same controls work on a copy of the
  * message in another channel. Every click is answered privately, a burst of clicks by one
  * member with one answer (`answerClick`); what it changed is said in the post by the attendance
@@ -156,6 +162,12 @@ export const partyButtons: ComponentHandler = {
         // A button of that panel: it moves the train and changes the panel, never a gathered
         // answer (`answerClick`), which would leave the panel as it was.
         return pressTrainPanel(interaction, ctx, partyId, id.action, id.args[0], id.args[1]);
+      case 'reverse':
+        // "Reverse the route" of that panel.
+        return pressReverse(interaction, ctx, partyId, id.args[0], id.args[1]);
+      case 'atend':
+        // The menu of that panel: never a button.
+        throw new UserError(STALE_COMPONENT);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
@@ -169,6 +181,12 @@ export const partyButtons: ComponentHandler = {
     }
   },
 
+  /** The menu "At the end of the route" of the Move train panel; the panel is its only menu. */
+  async select(interaction, id, ctx) {
+    if (id.action !== 'atend') throw new UserError(STALE_COMPONENT);
+    await pressAtEnd(interaction, ctx, id.id, id.args[0]);
+  },
+
   /**
    * The "Set time" form: what was typed is the hatch or the end time, as the form asked. The
    * form of `/delete`: the reason goes into the post, for the moderators.
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 8b2e99c45c40d625794c0fc8c695cd25835b999e..6c9abf1c42e96d3944d56c9101e6a94b14b5e7bd 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -39,6 +39,16 @@
  * `shot:<token>:gym` (the menu) and `shot:<token>:cancel`. The button "Screenshot feedback" of a
  * raid's post is the party's own, `party:<party id>:shot`.
  *
+ * The controls of a party have the kind `party` and the party's id (`PARTY_ACTIONS`,
+ * `src/render/party-controls.ts`). The private panel behind "Move train…" (`party:<id>:move`;
+ * `trainPanel`, `src/render/train-panel.ts`) carries where the train was when it was drawn
+ * (`<place>`: the gym id of its stop, `end` once the route is finished): the moves
+ * `party:<id>:next|previous|skip:<place>:<target>` (the gym the move leads to, or `end`) and
+ * `party:<id>:finish:<place>`, `party:<id>:reverse:<place>:<first>` ("Reverse the route";
+ * `<first>` the gym the route began with, so that a panel reverses it once), and the
+ * select menu of what the train does at the end of its route `party:<id>:atend:<place>`, whose
+ * value is `finish`, `loop` or `turn-back`. A press decides anew against that place.
+ *
  * The buttons of a member's own list have the kinds `wantlist` (`/wants`) and `targetlist`
  * (`/targets`; the kinds `wants` and `targets` are the questions of `/unwant-all` and
  * `/untarget-all`), and their id is the page the list shows, from 0: `wantlist:<page>:prev`,
diff --git a/src/domain/party/train.test.ts b/src/domain/party/train.test.ts
index a0a8b8a759322215c017687d45476cbf3379fda3..7b14258a708c841881f11a65f0ff2408193be884 100644
--- a/src/domain/party/train.test.ts
+++ b/src/domain/party/train.test.ts
@@ -1329,6 +1329,11 @@ describe('setAtEnd', () => {
     expect(changed(setAtEnd(unsigned, REPORTER, false, 'turn-back')).train.atEnd).toBe('turn-back');
   });
 
+  it('is refused from a panel drawn where the train no longer is', () => {
+    expect(setAtEnd(onRoute(R4, 1), ALICE, false, 'loop', '4')).toEqual(refusal('train-moved-on'));
+    expect(changed(setAtEnd(onRoute(R4, 1), ALICE, false, 'loop', '1')).train.atEnd).toBe('loop');
+  });
+
   it('returns the very same party for the mode it has', () => {
     const train = onRoute(R4, 1, { atEnd: 'turn-back' });
     expect(setAtEnd(train, ALICE, false, 'turn-back')).toEqual({ ok: true, party: train });
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index c4b0072f99db113cf5c965bcd128f5cb77e46059..5655e39ed25e74b9759faff4f306ce37f8d7c2d7 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -653,7 +653,8 @@ export function reverseRoute(
  * Sets what the train does at the end of its route. It never moves the train, so it is for whoever
  * may arrange the route (`mayArrange`: who is signed up, conductor or not, and the maker, who may
  * give the train its route and with a saved route its mode) and for staff; anybody else is
- * refused (`not-attending`). A finished route stays finished. The very same party comes back
+ * refused (`not-attending`). From the panel (`from`) the train must still be where the panel was
+ * drawn (`train-moved-on`). A finished route stays finished. The very same party comes back
  * when the train has that mode already.
  */
 export function setAtEnd(
@@ -661,8 +662,10 @@ export function setAtEnd(
   memberId: string,
   staff: boolean,
   atEnd: TrainAtEnd,
+  from?: string,
 ): Change<TrainParty> {
   if (!staff && !mayArrange(party, memberId)) return refused('not-attending');
+  if (from !== undefined && from !== placeOf(party)) return refused('train-moved-on');
   if (party.train.atEnd === atEnd) return { ok: true, party };
   return { ok: true, party: withTrain(party, { atEnd }) };
 }
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index b8b61ded187f535811e63143c3feedff6fa7448b..a829f49ca9cddb4f1d5630beee656aace0f6d12d 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -49,6 +49,8 @@ export const PARTY_ACTIONS = [
   'previous',
   'skip',
   'finish',
+  'reverse',
+  'atend',
   'shot',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
diff --git a/src/render/train-panel.ts b/src/render/train-panel.ts
index b26547d42f7ec0c982bb2deab4385472c8fb4eda..540df80a45749e55a8e80d2597d671a2ef2794b2 100644
--- a/src/render/train-panel.ts
+++ b/src/render/train-panel.ts
@@ -1,11 +1,16 @@
 import {
   ButtonStyle,
   ComponentType,
-  type APIActionRowComponent,
   type APIButtonComponentWithCustomId,
+  type APIComponentInContainer,
+  type APIStringSelectComponent,
 } from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import { TRAIN_AT_END, type TrainAtEnd } from '../domain/party/party.js';
 import {
   cannotMove,
+  cannotReverse,
   currentStop,
   destinationOf,
   nextStop,
@@ -13,86 +18,197 @@ import {
   routeFinished,
   targetOf,
   TRAIN_MOVES,
+  turnAhead,
   type TrainMove,
 } from '../domain/party/train.js';
-import { partyButton } from './party-controls.js';
+import { PARTY_KIND, partyButton } from './party-controls.js';
 import { gymName, type PostGym } from './raid-post.js';
 import { count, memberText, plain, type NamedMember } from './text.js';
 import { stopLink, type TrainPlaces } from './train-post.js';
+import { AT_END_DESCRIPTIONS } from './train-words.js';
+import { actionRow, container, menuRow, separator, textDisplay } from './v2.js';
 
-const MOVE_LABELS: Readonly<Record<TrainMove, string>> = {
-  next: 'Next',
-  previous: 'Previous',
-  skip: 'Skip',
-  finish: 'Finish',
+/** The grey edge of the Move train panel: a tool for one member, not a post. */
+export const TRAIN_PANEL_COLOUR = 0x99aab5;
+
+/** The buttons of the moves: label, emoji and style. */
+const MOVE_BUTTONS: Readonly<
+  Record<TrainMove, [string, string, APIButtonComponentWithCustomId['style']]>
+> = {
+  next: ['Next', '▶️', ButtonStyle.Primary],
+  previous: ['Previous', '◀️', ButtonStyle.Secondary],
+  skip: ['Skip', '⏭️', ButtonStyle.Secondary],
+  finish: ['Finish', '🏁', ButtonStyle.Secondary],
+};
+
+/**
+ * The labels of the options of the menu of what the train does at the end of its route: Discord
+ * shows the chosen one alone while the menu is closed, so each says it in full (the choices of
+ * `/train` keep the short `AT_END_LABELS`).
+ */
+const AT_END_MENU_LABELS: Readonly<Record<TrainAtEnd, string>> = {
+  finish: 'Finish at the last stop',
+  loop: 'Loop: back to the first stop',
+  'turn-back': 'Turn back at the end',
+};
+
+/** The emoji of the options of the menu of what the train does at the end of its route. */
+const AT_END_EMOJI: Readonly<Record<TrainAtEnd, string>> = {
+  finish: '🏁',
+  loop: '🔁',
+  'turn-back': '↩️',
 };
 
 /**
- * Where a train is on its route and what comes next, as a member is told it: for the panel that
- * moves the train, and for the answer to a move. Of a finished route it says where Previous
- * leads, which is how a Finish that was a mistake is taken back: to the stop the train was at,
- * or to the last stop of a route that remembers none.
+ * What Next does from where the train is, in words: `Next is X`, and at the last stop `It is
+ * the last stop: Next finishes the route`, `Next goes round to X` (a loop) or `Next turns back to
+ * X`. `link` shows a gym.
+ */
+function nextWords(view: TrainPlaces, link: (gym: PostGym | undefined) => string): string {
+  const { party } = view;
+  const next = nextStop(party);
+  if (next === undefined) return 'It is the last stop: Next finishes the route';
+  const where = link(view.gym(next));
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
+function finishedWords(view: TrainPlaces, link: (gym: PostGym | undefined) => string): string {
+  const { route } = view.party.train;
+  const back = destinationOf(view.party, 'previous').stop;
+  const gymId = route[back];
+  return (
+    `The train has finished its route of ${count(route.length, 'stop')}. ` +
+    `Previous takes it back to stop ${back + 1}: ` +
+    `${link(gymId === undefined ? undefined : view.gym(gymId))}.`
+  );
+}
+
+/**
+ * Where a train is on its route and what comes next, as a member is told it in the answer to a
+ * move by a command (`/next` and the others). Of a finished route it says where Previous leads,
+ * which is how a Finish that was a mistake is taken back: to the stop the train was at, or to
+ * the last stop of a route that remembers none.
  */
 export function whereText(view: TrainPlaces): string {
   const { party } = view;
   const { route, stop } = party.train;
   if (route.length === 0) return 'This train has no route yet. Add its stops with `/route add`.';
-  if (routeFinished(party)) {
-    const back = destinationOf(party, 'previous').stop;
-    const gymId = route[back];
-    return (
-      `The train has finished its route of ${count(route.length, 'stop')}. ` +
-      `Previous takes it back to stop ${back + 1}: ` +
-      `${stopLink(gymId === undefined ? undefined : view.gym(gymId))}.`
-    );
-  }
-  const [at, next] = [currentStop(party), nextStop(party)];
-  const here = `The train is at stop ${stop + 1} of ${route.length}: ${stopLink(at === undefined ? undefined : view.gym(at))}.`;
-  return next === undefined
-    ? `${here} It is the last stop.`
-    : `${here} Next is ${stopLink(view.gym(next))}.`;
+  const link = (gym: PostGym | undefined) => stopLink(gym);
+  if (routeFinished(party)) return finishedWords(view, link);
+  const at = currentStop(party);
+  const here = `The train is at stop ${stop + 1} of ${route.length}: ${link(at === undefined ? undefined : view.gym(at))}.`;
+  return `${here} ${nextWords(view, link)}.`;
+}
+
+/** Where the train is and what comes next, as the panel shows it under its heading. */
+function panelWhere(view: TrainPlaces): string {
+  const { party } = view;
+  const { route, stop } = party.train;
+  const link = (gym: PostGym | undefined) => stopLink(gym, true);
+  if (routeFinished(party)) return finishedWords(view, link);
+  const at = currentStop(party);
+  return [
+    `At stop ${stop + 1} of ${route.length}: ${link(at === undefined ? undefined : view.gym(at))}`,
+    nextWords(view, link),
+  ].join('\n');
+}
+
+/** The menu of what the train does at the end of its route, the train's own mode chosen. */
+function atEndMenu(view: TrainPlaces, place: string): APIStringSelectComponent {
+  const { party } = view;
+  return {
+    type: ComponentType.StringSelect,
+    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: 'atend', args: [place] }),
+    options: TRAIN_AT_END.map((atEnd) => ({
+      label: AT_END_MENU_LABELS[atEnd],
+      value: atEnd,
+      description: AT_END_DESCRIPTIONS[atEnd],
+      emoji: { name: AT_END_EMOJI[atEnd] },
+      default: atEnd === party.train.atEnd,
+    })),
+  };
 }
 
 /**
  * The panel the button "Move train…" of a train's post opens, for the member who pressed it
- * alone: where the train is and what comes next, and the four moves. A move that cannot be made
- * from where the train is has its button switched off. The buttons name the train by its id,
- * like every control of a post, and carry where the train was when the panel was drawn
- * (`placeOf`: the gym of its stop, which an edit of the route does not change while the train
- * stays there). Next, Previous and Skip also carry the stop they lead to (`targetOf`). A press
- * decides anew: on a panel that no longer shows where the train is, or whose move would lead to
- * another stop than it did when the panel was drawn, it moves nothing, so two members who press
- * Next on the same stop move the train once.
+ * alone: one components-v2 container (`TRAIN_PANEL_COLOUR`) with where the train is and what
+ * comes next, the four moves, "Reverse the route" where it may be reversed (`cannotReverse`),
+ * and the menu of what the train does at the end of its route. A move that cannot be made from
+ * where the train is has its button switched off. `note` is said above where the train is: why
+ * a press did nothing.
+ *
+ * The controls name the train by its id, like every control of a post, and carry where the
+ * train was when the panel was drawn (`placeOf`: the gym of its stop, which an edit of the route
+ * does not change while the train stays there): `party:<id>:<move>:<place>[:<target>]`,
+ * `party:<id>:reverse:<place>:<first>` (`first`: the gym the route began with, so that a second
+ * press or a panel drawn before another Reverse does not reverse it back), the menu
+ * `party:<id>:atend:<place>`. Next, Previous and Skip
+ * also carry the gym they lead to (`targetOf`; at the end of a route that loops or turns back,
+ * the gym that comes then). A press decides anew: on a panel that no longer shows where the
+ * train is, or whose move would lead to another stop than it did when the panel was drawn, it
+ * does nothing, so two members who press Next on the same stop move the train once.
  */
-export function trainPanel(view: TrainPlaces): {
-  content: string;
-  components: APIActionRowComponent<APIButtonComponentWithCustomId>[];
-} {
+export function trainPanel(view: TrainPlaces, note?: string): V2Message {
   const { party } = view;
   const place = placeOf(party);
-  const styles: Readonly<Record<TrainMove, APIButtonComponentWithCustomId['style']>> = {
-    next: ButtonStyle.Primary,
-    previous: ButtonStyle.Secondary,
-    skip: ButtonStyle.Secondary,
-    finish: ButtonStyle.Secondary,
-  };
-  return {
-    content: whereText(view),
-    components: [
-      {
-        type: ComponentType.ActionRow,
-        components: TRAIN_MOVES.map((move) => ({
-          ...partyButton(party.id, move, MOVE_LABELS[move], styles[move], [
-            place,
-            // Where a move leads travels with it ("Next is …", "Previous takes it back to …");
-            // Finish leads to the end of whatever route there is.
-            ...(move === 'finish' ? [] : [targetOf(party, move)]),
+  const moves = TRAIN_MOVES.map((move) => {
+    const [label, emoji, style] = MOVE_BUTTONS[move];
+    return {
+      ...partyButton(
+        party.id,
+        move,
+        label,
+        style,
+        // Where a move leads travels with it ("Next is …", "Previous takes it back to …");
+        // Finish leads to the end of whatever route there is.
+        [place, ...(move === 'finish' ? [] : [targetOf(party, move)])],
+        emoji,
+      ),
+      ...(cannotMove(party, move) === undefined ? {} : { disabled: true }),
+    };
+  });
+  const reverse =
+    cannotReverse(party) === undefined
+      ? [
+          actionRow([
+            partyButton(
+              party.id,
+              'reverse',
+              'Reverse the route',
+              ButtonStyle.Secondary,
+              // The gym the route begins with, so that one panel reverses it once.
+              [place, String(party.train.route[0])],
+              '🔃',
+            ),
           ]),
-          ...(cannotMove(party, move) === undefined ? {} : { disabled: true }),
-        })),
-      },
-    ],
-  };
+        ]
+      : [];
+  const text = ['### Move the train', ...(note === undefined ? [] : [note]), panelWhere(view)];
+  const components: APIComponentInContainer[] = [
+    textDisplay(text.join('\n')),
+    actionRow(moves),
+    ...reverse,
+    separator(),
+    textDisplay('**At the end of the route**'),
+    menuRow(atEndMenu(view, place)),
+  ];
+  return { v2: true, components: [container(TRAIN_PANEL_COLOUR, components)] };
+}
+
+/**
+ * A panel that only says something, without controls: what takes the place of the panel when
+ * its member may no longer move the train, the train has no route any more, or it has ended.
+ */
+export function panelNote(text: string): V2Message {
+  return { v2: true, components: [container(TRAIN_PANEL_COLOUR, [textDisplay(text)])] };
 }
 
 /** How a train got to where it is, for the message that tells the members. */
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index e344a25c6754317b6cd87c7a129fbdc509e2581c..faee028b9d5dbe8780a653abb56ba9b0f54ec4ee 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -1,12 +1,20 @@
+import {
+  ComponentType,
+  type APIButtonComponentWithCustomId,
+  type APIStringSelectComponent,
+} from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { expectSendable } from '../../test/support/post-limits.js';
+import { expectSendable, expectV2Sendable } from '../../test/support/post-limits.js';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
 import {
   accentOf,
+  allComponents,
   buttonLabels,
   buttonsOf,
   componentCount,
+  customIdsOf,
+  selectsOf,
   textDisplays,
   textOf,
   thumbnailOf,
@@ -28,6 +36,7 @@ import { decodeCustomId } from '../discord/custom-id.js';
 import {
   endParty,
   MAX_ROUTE_STOPS,
+  TRAIN_AT_END,
   type Attendee,
   type TrainDetails,
   type TrainParty,
@@ -44,7 +53,13 @@ import {
 } from './party-post.js';
 import { shownBoss, type PostGym } from './raid-post.js';
 import { LIMITS } from './text.js';
-import { movementText, trainPanel, whereText } from './train-panel.js';
+import {
+  movementText,
+  panelNote,
+  TRAIN_PANEL_COLOUR,
+  trainPanel,
+  whereText,
+} from './train-panel.js';
 import {
   renderTrainPost,
   routeLines,
@@ -566,41 +581,125 @@ describe('the controls of a train post', () => {
 });
 
 describe('trainPanel', () => {
+  /** The buttons of the panel: label, emoji, action, switched off. */
   const buttons = (party: TrainParty) =>
-    trainPanel({ party, gym }).components[0]?.components.map((button) => [
-      button.label,
-      decodeCustomId(button.custom_id)?.action,
-      button.disabled ?? false,
+    allComponents(trainPanel({ party, gym }))
+      .filter((component) => (component as { type?: number }).type === ComponentType.Button)
+      .map((component) => {
+        const button = component as APIButtonComponentWithCustomId;
+        return [
+          button.label,
+          button.emoji?.name,
+          decodeCustomId(button.custom_id)?.action,
+          button.disabled ?? false,
+        ];
+      });
+  /** What the controls of the panel carry: their actions and arguments. */
+  const drawnAt = (party: TrainParty) =>
+    customIdsOf(trainPanel({ party, gym })).map((id) => decodeCustomId(id)?.args);
+  const first = (party: TrainParty, note?: string) =>
+    textDisplays(trainPanel({ party, gym }, note))[0];
+
+  it('is one grey container: where the train is and what comes next, the moves, and the menu of the mode', () => {
+    const train = onRoute([4, 1, 7], 1);
+    const panel = trainPanel({ party: train, gym });
+    expect(panel.components).toHaveLength(1);
+    expect(accentOf(panel)).toBe(TRAIN_PANEL_COLOUR);
+    expect(textDisplays(panel)).toEqual([
+      [
+        '### Move the train',
+        `At stop 2 of 3: [The Stacks](${maps(1)})`,
+        `Next is [Harbor Lighthouse Mural](${maps(7)})`,
+      ].join('\n'),
+      '**At the end of the route**',
+    ]);
+    expect(buttons(train)).toEqual([
+      ['Next', '▶️', 'next', false],
+      ['Previous', '◀️', 'previous', false],
+      ['Skip', '⏭️', 'skip', true],
+      ['Finish', '🏁', 'finish', false],
+    ]);
+    expect(buttonsOf(panel).map((button) => button.style)).toEqual([1, 2, 2, 2]);
+    const [menu] = selectsOf(panel);
+    expect(menu?.customId).toBe(`party:${train.id}:atend:1`);
+    // Discord shows the chosen option's label alone while the menu is closed: it says it all.
+    expect(menu?.options.map((option) => option.label)).toEqual([
+      'Finish at the last stop',
+      'Loop: back to the first stop',
+      'Turn back at the end',
     ]);
+    expectV2Sendable(panel);
+  });
 
-  it('says where the train is and what comes next, with the four moves', () => {
-    const train = onRoute([4, 1, 7], 0);
-    const panel = trainPanel({ party: train, gym });
-    expect(panel.content).toBe(
-      `The train is at stop 1 of 3: [Veterans Memorial Bridge](<${maps(4)}>). ` +
-        `Next is [The Stacks](<${maps(1)}>).`,
+  it('shows the mode the train has as chosen', () => {
+    const chosen = (party: TrainParty) =>
+      (
+        allComponents(trainPanel({ party, gym })).find(
+          (component) => (component as { type?: number }).type === ComponentType.StringSelect,
+        ) as APIStringSelectComponent | undefined
+      )?.options
+        .filter((option) => option.default === true)
+        .map((option) => option.value);
+    expect(chosen(onRoute([4, 1, 7]))).toEqual(['finish']);
+    expect(chosen(onRoute([4, 1, 7], 0, { atEnd: 'loop' }))).toEqual(['loop']);
+    expect(chosen(onRoute([4, 1, 7], 0, { atEnd: 'turn-back' }))).toEqual(['turn-back']);
+  });
+
+  it('says at the last stop what Next does there, as the mode says', () => {
+    expect(first(onRoute([4, 1, 7], 2))).toBe(
+      '### Move the train\n' +
+        `At stop 3 of 3: [Harbor Lighthouse Mural](${maps(7)})\n` +
+        'It is the last stop: Next finishes the route',
     );
-    expect(buttons(train)).toEqual([
-      ['Next', 'next', false],
-      // At the first stop there is none before it.
-      ['Previous', 'previous', true],
-      ['Skip', 'skip', false],
-      ['Finish', 'finish', false],
+    expect(first(onRoute([4, 1, 7], 2, { atEnd: 'loop' }))).toMatch(
+      new RegExp(`\\nNext goes round to \\[Veterans Memorial Bridge\\]`),
+    );
+    expect(first(onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }))).toMatch(
+      /\nNext turns back to \[The Stacks\]/,
+    );
+    // A route of one stop finishes in every mode.
+    expect(first(onRoute([4], 0, { atEnd: 'loop' }))).toMatch(
+      /\nIt is the last stop: Next finishes the route$/,
+    );
+    // A finished route says where Previous leads, and a note goes above where the train is.
+    expect(first(onRoute([4, 1], 2), 'The train has moved on meanwhile.')).toBe(
+      '### Move the train\nThe train has moved on meanwhile.\n' +
+        `The train has finished its route of 2 stops. Previous takes it back to stop 2: [The Stacks](${maps(1)}).`,
+    );
+  });
+
+  it('carries where the train was and where each move leads, also round the end and back', () => {
+    // Each control says where the train was when the panel was drawn: the gym of its stop.
+    // Next, Previous and Skip also say where they lead: the gym of that stop, or the end.
+    expect(drawnAt(onRoute([4, 1, 7], 0))).toEqual([
+      ['4', '1'],
+      ['4', '4'],
+      ['4', '7'],
+      ['4'],
+      // Reverse: also the gym the route begins with.
+      ['4', '4'],
     ]);
-    for (const button of panel.components[0]?.components ?? []) {
-      expect(decodeCustomId(button.custom_id)).toMatchObject({ kind: 'party', id: train.id });
-    }
-    const drawnAt = (party: TrainParty) =>
-      trainPanel({ party, gym }).components[0]?.components.map(
-        (button) => decodeCustomId(button.custom_id)?.args,
-      );
-    // Each button says where the train was when the panel was drawn: the gym of its stop. Next,
-    // Previous and Skip also say where they lead: the gym of that stop, or the end of the route.
-    expect(drawnAt(train)).toEqual([['4', '1'], ['4', '4'], ['4', '7'], ['4']]);
     expect(drawnAt(onRoute([9, 4, 1], 1))).toEqual([['4', '1'], ['4', '9'], ['4', 'end'], ['4']]);
-    expect(drawnAt(onRoute([4, 1, 7], 2))).toEqual([['7', 'end'], ['7', '1'], ['7', 'end'], ['7']]);
+    expect(drawnAt(onRoute([4, 1, 7], 2))).toEqual([
+      ['7', 'end'],
+      ['7', '1'],
+      ['7', 'end'],
+      ['7'],
+      ['7', '4'],
+    ]);
+    // Round the end of a loop, and back along a route that turns back.
+    expect(drawnAt(onRoute([4, 1, 7], 2, { atEnd: 'loop' }))?.slice(0, 3)).toEqual([
+      ['7', '4'],
+      ['7', '1'],
+      ['7', '1'],
+    ]);
+    expect(drawnAt(onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }))?.slice(0, 3)).toEqual([
+      ['7', '1'],
+      ['7', '1'],
+      ['7', '4'],
+    ]);
     // From the end, Previous leads to the last stop of a route that remembers no other...
-    expect(drawnAt(onRoute([4, 1, 7], 3))).toEqual([
+    expect(drawnAt(onRoute([4, 1, 7], 3))?.slice(0, 4)).toEqual([
       ['end', 'end'],
       ['end', '7'],
       ['end', 'end'],
@@ -612,17 +711,75 @@ describe('trainPanel', () => {
 
   it('switches off what cannot be done from where the train is', () => {
     const disabled = (party: TrainParty) =>
-      (buttons(party) ?? []).filter(([, , off]) => off).map(([, action]) => action);
+      buttons(party)
+        .filter(([, , , off]) => off)
+        .map(([, , action]) => action);
     expect(disabled(onRoute([4, 1, 7], 1))).toEqual(['skip']);
     expect(disabled(onRoute([4, 1, 7, 2], 1))).toEqual([]);
     expect(disabled(onRoute([4, 1, 7], 2))).toEqual(['skip']);
     expect(disabled(onRoute([4, 1, 7], 3))).toEqual(['next', 'skip', 'finish']);
     expect(disabled(testTrain())).toEqual(['next', 'previous', 'skip', 'finish']);
+    // Previous at the first stop of a loop leads to the last; Skip goes round.
+    expect(disabled(onRoute([4, 1, 7], 0, { atEnd: 'loop' }))).toEqual([]);
+    expect(disabled(onRoute([4, 1, 7], 2, { atEnd: 'loop' }))).toEqual([]);
+    expect(disabled(onRoute([4, 1, 7], 0, { atEnd: 'turn-back' }))).toEqual(['previous']);
+    expect(disabled(onRoute([4, 1, 7], 1, { atEnd: 'turn-back' }))).toEqual(['skip']);
   });
 
-  it('says the last stop, a finished route and a train without a route', () => {
+  it('offers Reverse only where the route may be reversed', () => {
+    const reverse = (party: TrainParty) =>
+      buttons(party).filter(([, , action]) => action === 'reverse');
+    expect(reverse(onRoute([4, 1, 7], 0))).toEqual([['Reverse the route', '🔃', 'reverse', false]]);
+    expect(reverse(onRoute([4, 1, 7], 2))).toHaveLength(1);
+    expect(reverse(onRoute([4, 1, 7], 1))).toEqual([]);
+    expect(reverse(onRoute([4, 1, 7], 3, { finishedFrom: 7 }))).toHaveLength(1);
+    expect(reverse(onRoute([4, 1, 7], 3, { finishedFrom: 1 }))).toEqual([]);
+    expect(reverse(onRoute([4, 1, 7], 1, { atEnd: 'loop' }))).toHaveLength(1);
+    expect(reverse(onRoute([4, 1, 7], 0, { atEnd: 'turn-back' }))).toEqual([]);
+    expect(reverse(onRoute([4], 0))).toEqual([]);
+    // Reverse carries where the train was and the gym the route began with.
+    expect(drawnAt(onRoute([4, 1, 7], 3, { finishedFrom: 7 })).at(-1)).toEqual(['end', '4']);
+    expect(drawnAt(onRoute([4, 1, 7], 0)).at(-1)).toEqual(['4', '4']);
+  });
+
+  it('keeps within what Discord takes with the longest names that need escaping', () => {
+    const heavy = (id: number): PostGym => ({
+      name: `${'[*]'.repeat(84)}${id}`,
+      nickname: null,
+      lat: 40,
+      lon: -80,
+      notice: null,
+      taggedEx: true,
+      confirmedEx: false,
+    });
+    for (const atEnd of TRAIN_AT_END) {
+      const party = onRoute([4294967295, 4294967294, 4294967293], 2, { atEnd });
+      const panel = trainPanel({ party, gym: heavy }, 'That button no longer leads where it said.');
+      expectV2Sendable(panel);
+      expect(componentCount(panel)).toBeLessThanOrEqual(MAX_COMPONENTS);
+    }
+  });
+
+  it('says only something, without controls, as a note', () => {
+    const note = panelNote('This train is over.');
+    expect(textOf(note)).toBe('This train is over.');
+    expect(buttonsOf(note)).toEqual([]);
+    expect(accentOf(note)).toBe(TRAIN_PANEL_COLOUR);
+    expectV2Sendable(note);
+  });
+
+  it('says the last stop, a finished route and a train without a route, in the answer to a command', () => {
     expect(whereText({ party: onRoute([4, 1], 1), gym })).toBe(
-      `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). It is the last stop.`,
+      `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). ` +
+        'It is the last stop: Next finishes the route.',
+    );
+    expect(whereText({ party: onRoute([4, 1], 1, { atEnd: 'loop' }), gym })).toBe(
+      `The train is at stop 2 of 2: [The Stacks](<${maps(1)}>). ` +
+        `Next goes round to [Veterans Memorial Bridge](<${maps(4)}>).`,
+    );
+    expect(whereText({ party: onRoute([4, 1, 7], 2, { atEnd: 'turn-back' }), gym })).toBe(
+      `The train is at stop 3 of 3: [Harbor Lighthouse Mural](<${maps(7)}>). ` +
+        `Next turns back to [The Stacks](<${maps(1)}>).`,
     );
     // A finished route says where Previous leads: to its last stop, or to the stop it was
     // finished from.
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index bc86f512ba5ced432410547f1cdda930ee638e3b..8872e291558a1840d42ca1207ea8ddedb8aa409c 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -449,18 +449,20 @@ export class TrainService {
    * Sets what the train does at the end of its route (`setAtEnd`): for who may move the train.
    * It moves nothing, so it is for whoever may arrange the route (`mayArrange`) and for staff;
    * the post says it in a line that pings nobody, naming the doer (`doer`). `changed` is false
-   * for the mode the train has already.
+   * for the mode the train has already. `from` is for the menu of a panel drawn while the train
+   * was at some place (`placeOf`).
    */
   setAtEnd(
     partyId: string,
     member: Member,
     staff: boolean,
     atEnd: TrainAtEnd,
+    from?: string,
   ): Promise<TrainChangeOutcome> {
     return this.apply(
       partyId,
       member,
-      (party) => setAtEnd(party, member.id, staff, atEnd),
+      (party) => setAtEnd(party, member.id, staff, atEnd, from),
       (party) => {
         const who = doer(party, member);
         return who
````

### Task 5: Train modes: help texts, CLAUDE.md conventions and the staging checklist of 8B-3

Prototype commit: `f91b8008fa975463d5da9d3a3d22520d5d4a9f45`



**Files:**

```
 CLAUDE.md                                              | 17 +++++++++--------
 docs/superpowers/plans/2026-10-15-phase-8b3-staging.md | 25 +++++++++++++++++++++++++
 src/commands/trains/move.ts                            | 21 +++++++++++++--------
 src/commands/trains/route.ts                           |  4 +++-
 4 files changed, 50 insertions(+), 17 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  no unit test files of its own); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff f91b8008fa975463d5da9d3a3d22520d5d4a9f45 -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b3-train-modes.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Train modes: help texts, CLAUDE.md conventions and the staging checklist of 8B-3`, the body above and the trailer, staging exactly
  `CLAUDE.md docs/superpowers/plans/2026-10-15-phase-8b3-staging.md src/commands/trains/move.ts src/commands/trains/route.ts`.

````diff
diff --git a/CLAUDE.md b/CLAUDE.md
index ac3d7c516fbe51ebece5d0c89bc260976b3e3307..7c3df8a8d61a9013324e5665f878df156f884cf7 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -57,7 +57,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Secrets come from environment variables (`.env`, see `.env.example`), never from `data/` files. Blank values mean "unset".
 - Required intents are `Guilds`, `GuildMessages`, `DirectMessages`. `MessageContent` only when `settings.ocr.passive`; `GuildMembers` only when `settings.autoAssignRole`. Never `GuildPresences` or `GuildMessageReactions`.
 - Ephemeral replies use `flags: MessageFlags.Ephemeral`. Things the user did wrong are thrown as `UserError`; the router turns them into ephemeral replies.
-- Every message that is more than plain text is a components-v2 message (Matt, 2026-10-15): new code never builds an embed (`APIEmbed`, `EmbedBuilder`). The embeds still left (gym and region administration, `/find-gym`, `/find-region`, `/bounds`, the gym announcements) go in plan 8B-3; only the classic text spawn report for a channel without Embed Links stays until staging says whether v2 needs that permission.
+- Every message that is more than plain text is a components-v2 message (Matt, 2026-10-15): new code never builds an embed (`APIEmbed`, `EmbedBuilder`). The embeds still left (gym and region administration, `/find-gym`, `/find-region`, `/bounds`, the gym announcements) go in plan 8B-4; only the classic text spawn report for a channel without Embed Links stays until staging says whether v2 needs that permission.
 - Mentions are off by default (`allowedMentions: { parse: [] }` on the client); a send that should ping must opt in with its own `allowedMentions`.
 - Component custom IDs are `<kind>:<id>:<action>[:<arg>...]`, at most 100 characters, built and parsed only through `src/discord/custom-id.ts`.
 - Every slash command is a `CommandModule` listed in `src/commands/index.ts`; the router and the deploy script both read that list. A command with another name is listed under both: `alsoAs(command, name)` (`src/discord/command.ts`; `/hmm` of `/interested`, `/coming` of `/join`) gives the same guards, handlers, throttle and help under another name, and a short form (`/little`, `/great`, `/ultra`, `/master`: `/rank` in that league) is a command of its own with `formOf`. The uses of a form count as the command's (the router's throttle key), "You can use /x again" names the name typed, and `/help` lists a form beside the command's name on its line and explains it as the command's.
@@ -109,7 +109,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
 - The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`): with one group a status's button stands beside its line (`statusButton`: Interested, Join, Here, Done), with several a "Join A" beside each group (`joinGroupButton`, the action `group`: `AttendanceService.joinInto` makes the member coming in that group from any status, and only moves one who is coming; the Join of the member's own group changes only Interested and leaves Present, and a member who is asked whether they completed the raid, as they are; `/group join` keeps the status) and the statuses' buttons in a row below; then the rows of `bottomControls` (Leave, −1, +1, Remote, a raid's Map link; Set time; Screenshot feedback), every button with its emoji: buttons only, none depending on the time. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
-- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 8 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; exactly the parts that fit the type must be present); versions 1 to 7 are still read.
+- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 9 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; exactly the parts that fit the type must be present); versions 1 to 8 are still read (a train of them as `finish`).
 - Time passes through `PartyScheduler` (`src/services/party-scheduler.ts`): at every `cleanupInterval` it runs `partyTick` inside the store for every party and does what the tick asks for (render, a line at hatch, `ask`, "did not answer and counts as done", the warning, the end). It is started in `src/app.ts` after the connection to Discord and stopped first at shutdown; a test moves `clock.now` and calls `tick()`. Its effects happen at most once (the party is stored first); only the ending repeats. `activity(channelId)` (from `MessageCreate`; only the channel id is used) says the warning again after every fifth message of others in a warned post, deleting the earlier one.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
 - What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`). It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
@@ -138,14 +138,15 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Meetups in tests: `testMeetup()`, `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`). The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - The maker of a train is signed up as their auto-status says (None: not at all; Here counts as Coming), and with privacy Anonymous neither the post nor the new-train DM names them (`NewTrain.anonymous`, `autoStatus`). A maker who is not signed up may still arrange the route and the times as far as the train does not move (`mayArrange`, `party.ts`); moving it and being its conductor need a sign-up. Meetups know neither setting.
-- A raid train is the third kind (`TrainParty`: `timed` like a meetup, and `train: { route, stop, conductorId, boss, finishedFrom }`). `isTrain`, the guards `requireTrain` (with `commandTrain`, `trainOf`) and `requireRaidOrTrain` (what has a boss or a gym: `/boss`, `/where`); `bossOf(party)` is the boss of any party that has one. `route` is gym ids, none twice, at most `MAX_ROUTE_STOPS`; `stop === route.length` on a route that is not empty means finished; `party.gymId` is null (the gym of a train is `currentStop(party)`). It has groups like a raid and one start like a meetup; Done means leave, and whoever leaves as the conductor stops being it.
-- Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its gym through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
-- A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied). A gym is a stop only when it lies in a region of the train's server (`reaches`).
+- A raid train is the third kind (`TrainParty`: `timed` like a meetup, and `train: { route, stop, conductorId, boss, finishedFrom, atEnd }`). `isTrain`, the guards `requireTrain` (with `commandTrain`, `trainOf`) and `requireRaidOrTrain` (what has a boss or a gym: `/boss`, `/where`); `bossOf(party)` is the boss of any party that has one. `route` is gym ids, none twice, at most `MAX_ROUTE_STOPS`; `stop === route.length` on a route that is not empty means finished; `party.gymId` is null (the gym of a train is `currentStop(party)`). It has groups like a raid and one start like a meetup; Done means leave, and whoever leaves as the conductor stops being it.
+- Everything that happens to a train is a pure function in `src/domain/party/train.ts` and goes through `ctx.trains` (`TrainService`: `addStop`, `removeStop`, `moveStop`, `clearRoute`, `move`, `reverse`, `setAtEnd`, `setConductor`, `clearConductor`, `setBoss`, `saveRoute`, `loadRoute`, `forgetRoute`, `savedRoutes`, `reaches`, `flush`; each change answers a `TrainChangeOutcome`). The current stop follows its gym through every route edit. An edit after which the train is somewhere else (`placeOf` differs: the current stop removed, a stop added to a finished route, a loaded route) is a movement: it needs the right to move (`mayNotMove`: the conductor or staff when there is a conductor, otherwise signed up; staff always), puts Here back to Coming and is announced. The first stop of an empty route is an ordinary edit. Finishing leaves Here as Here and changes no time.
+- A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym is a stop only when it lies in a region of the train's server (`reaches`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
-- A train's post has one grey button "Move train…" beside where the train is and goes next (`party:<id>:move`, `moveTrainButton`), which answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel` / `pressTrainPanel` in `src/commands/trains/move.ts`). The panel's buttons are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next and Skip also the stop they lead to): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew. A panel press calls `update` on the panel and never goes through `answerClick`.
-- Saved routes are the legacy table `SavedRoutes` behind `SavedRouteRepository` (per member and region, at most `MAX_SAVED_ROUTES`, the same name without case replaces; `save` and `remove` lock the member's `User` row first). The `route` option's autocomplete value is `id:<n>` (`SAVED_ROUTE_CHOICE`); anything else typed is a name. `/boss` in a train goes through `trainBoss` (`raid-input.ts`): tier words are ignored, any Pokémon the catalogue names is accepted, `none` clears; `reportedBoss` is for raids only.
+- A train's post has one grey button "Move train…" beside where the train is and goes next (`party:<id>:move`, `moveTrainButton`), which answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel`, `pressTrainPanel`, `pressReverse`, `pressAtEnd` in `src/commands/trains/move.ts`): a components-v2 message (plan 8B-3), one container of `TRAIN_PANEL_COLOUR` with `### Move the train`, where the train is and what Next does (`At stop 2 of 4: …`, `Next is …`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`), the four moves with their emoji (switched off where `cannotMove` says), "🔃 Reverse the route" where `cannotReverse` allows it, and under `**At the end of the route**` a menu of the three modes with the train's own as the default (its labels say each in full, "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", since a closed menu shows the label alone; `/train`'s choices keep `AT_END_LABELS`). Its controls are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next, Previous and Skip also the gym they lead to), `party:<id>:reverse:<place>:<first>` (`first`: the gym the route began with when drawn, so that a second press or a panel drawn before another member's Reverse is refused `route-changed` instead of flipping the route back) and the menu `party:<id>:atend:<place>` (a `select` of `partyButtons`): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew with the reason above where the train is; a member who may no longer move it (also after a mode they were allowed to set), a train without a route and one that ended get `panelNote` (no controls). A panel press calls `update` with `v2Answer` and never goes through `answerClick`; a press on a plain-text panel from before 8B-3 updates it to `OLD_PANEL` and sends the new panel as a private follow-up (whether Discord takes a v2 interaction update of a classic message is not known and not tried: the follow-up is the safe path). Command answers (`/next` and the others) keep `whereText`.
+- Saved routes are the legacy table `SavedRoutes` behind `SavedRouteRepository` (per member and region, at most `MAX_SAVED_ROUTES`, the same name without case replaces; `save` and `remove` lock the member's `User` row first). A saved route keeps the order of its stops and the train's mode (`SavedRoutes.atEnd`, migration 013, `varchar(10)` defaulting to `finish`, which covers the legacy bot's inserts; a value this code does not know reads as `finish`; `SavedRoute.atEnd`): `/route save` writes the train's, `/route load` sets both (`replaceRoute(…, atEnd)`), `/route show` ends with `atEndSentence` on a route of two stops or more; the private answers of save and load always say the mode, the public "loaded" line in the post only when it is not `finish`. The `route` option's autocomplete value is `id:<n>` (`SAVED_ROUTE_CHOICE`); anything else typed is a name. `/boss` in a train goes through `trainBoss` (`raid-input.ts`): tier words are ignored, any Pokémon the catalogue names is accepted, `none` clears; `reportedBoss` is for raids only.
+- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), the panel's menu (`setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route; Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was, so the panel's control also carries `first`, the gym the route began with (`route-changed` otherwise). The post's route line says `, loops` / `, turns back at the end` on a route of two stops or more, and "Next gym" at the last stop `(round again)` / `(turning back)`; after a turn or a Reverse the route is listed in its stored order. The words of the modes are `src/render/train-words.ts`.
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
-- A train remembers the gym it was at when a move finished its route (`train.finishedFrom`; state document version 6, version 5 read as null): Previous from the end leads back there and leaves Here as Here (`stopAfter`, `targetOf`), and to the last stop when nothing is remembered. `withTrain` in `train.ts` is the one place that keeps it (null unless the route is finished and still has that gym), so a route is changed only through the functions of `train.ts`, never by building `train.route` by hand: the state document refuses a train that breaks the rule. The panel's Previous button carries its target like Next and Skip.
+- A train remembers the gym it was at when a move finished its route (`train.finishedFrom`; state document version 6, version 5 read as null): Previous from the end leads back there and leaves Here as Here (`destinationOf`, `targetOf`), and to the last stop when nothing is remembered. `withTrain` in `train.ts` is the one place that keeps it (null unless the route is finished and still has that gym), so a route is changed only through the functions of `train.ts`, never by building `train.route` by hand: the state document refuses a train that breaks the rule. The panel's Previous button carries its target like Next and Skip.
 - A train has a copy of its message in the text channel of every other region of its server that a gym of its route lies in (mirror kind `region`; `regionChannels` in `PartyMirrors`), only where the bot may post embeds (`PartyGateway.mayPost`, from the cache: without Embed Links Discord drops the embed instead of refusing). `PartyMirrors` keeps one newest copy per slot: the kind, and for `region` the kind in a channel. Such a copy is `renderMirror('region', …)`: a line at the top and the post with its controls but "Move train…" (the layout's `move: false`). A copy is sent again without its picture when Discord refuses that. A run of the shared queue that left something undone (a failed edit or send, a channel that refuses or is gone) is followed by one more for that party `RETRY_AFTER_MS` later, for a raid's copies too. On the fake gateway `noEmbeds` names the channels that lack the permission.
 - Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`). Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`.
 - Gyms and regions in tests are the invented ones of `test/support/gyms.ts` (never production rows); `createTestContext()` provides `ctx.gyms`, `ctx.pokemon` and `ctx.maps` from `test/support/providers.ts`.
diff --git a/docs/superpowers/plans/2026-10-15-phase-8b3-staging.md b/docs/superpowers/plans/2026-10-15-phase-8b3-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..56f7c0707294cf65b6f8447e3fcba802d9fd31dd
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-15-phase-8b3-staging.md
@@ -0,0 +1,25 @@
+# Phase 8B-3: staging checklist
+
+The text for the end of the 8B-3 plan (train modes, Reverse, the Move train panel as a components-v2 message). Each step with Matt's go-ahead, on the test server, with the dev application and both accounts (Matt's own and Googer's). The gyms are the test server's; a route of four stops is called A, B, C, D below.
+
+1. **Registration first:** `/train`'s new option (`at-end`) is the one change of a command definition, so `npm run deploy-commands -- --global` before anything else (the dev application's only registration is the global one). The changed help texts (`/train`, `/route`, `/next`, `/previous`, `/skip`, `/finish`) need no registration: the bot keeps them.
+2. **Migration 013** (`SavedRoutes.atEnd`): **do not run `npm run migrate` on the dev database before the Wayfarer plan's migration 012 (8W-1) is merged and applied.** Kysely refuses a migration that sorts before one already run, so 013 applied first would make 012 impossible to run. Merge 8W-1 first and run both together, or apply 012 on the dev database before this one. Check afterwards that the legacy bot's saved routes still load (`/route load` of an old route: it finishes at its end).
+3. **Before the deploy, open a panel:** with the bot of the previous version still running, open "Move train…" on a train and leave the plain-text panel open. Then stop that bot and start this one (Matt, in a terminal).
+4. **An old panel pressed after the deploy** (Matt, on the panel of step 3): Next moves the train; the old panel now says "This panel was replaced by the one below." without buttons, and the new grey panel comes privately below it.
+5. **The panel** (Matt, a train with a route A–D, no mode given at `/train`): "Move train…" opens one grey container: `### Move the train`, "At stop 1 of 4: A" and "Next is B" with links, the buttons ▶ Next (blue), ◀ Previous (off at stop 1), ⏭ Skip, 🏁 Finish, a row "🔃 Reverse the route" (at stop 1 of a train that finishes), a line, "**At the end of the route**" and the menu showing "🏁 Finish at the last stop". Open the menu: "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", each with its line ("The train stops at the last stop", "After the last stop comes the first", "The route is run backwards from the end"), Finish chosen. On the phone too: does the panel read well at that width, and does the menu show its descriptions?
+6. **Finish mode at both ends:** Next to D: "It is the last stop: Next finishes the route", Reverse offered again. Next: the route is finished, the panel says where Previous leads, Reverse is still offered (finished from the last stop). Reverse: the route starts again from D (stop 1 of D, C, B, A), nobody is pinged, the post's route line reads D, C, B, A, and the line in the post says "The route was reversed by **Matt** …: it now runs from **D** to **A**, and starts again at **D**." In the middle of the route Reverse is not offered. Finish from B: Reverse is not offered on the finished route (only one finished from its last stop starts again).
+7. **Reverse once per panel:** at A, press Reverse twice quickly on one panel: the route is reversed once; the second press says "That button no longer leads where it said." above the fresh panel. Googer's panel drawn before Matt's Reverse: his Reverse says the same, and the route stays.
+8. **Loop** (Matt, the menu → Loop): the panel is drawn anew with Loop chosen; the post says "**Matt** … set the train to loop." without a ping, and its route line "Route, stop N of 4, loops: …". At D the panel says "Next goes round to A" and the post's "Next gym" names A "(round again)". Next: the movement message "The train is going round again, back to A. Moved by …" pings Googer (if signed up and allowing train pings). Previous at stop 1 goes to D. Skip at C goes round to A ("…, skipping **D**"), at D to B. Reverse in the middle of the route: the order changes, the train stays at its gym, the mode stays Loop.
+9. **Turn back** (the menu → Turn back): Reverse is no longer offered. At D the panel says "Next turns back to C"; the post's "Next gym" names C "(turning back)" and the route line "…, turns back at the end". Next: the route is stored as D, C, B, A, the train at stop 2 (C), the post lists the route in the new order, numbered anew, and the movement message is "The train is turning back at **D**, on to C." Previous then takes it back to D (stop 1), where Previous is switched off. Skip at stop 3 of 4 is switched off; at D Skip turns back past C to B. Finish ends the route in every mode.
+10. **A turn taken back at once:** at D of a turning train, Next and at once Previous (within five seconds): no movement message at all.
+11. **Who may change the mode** (the mode never moves the train, so whoever may arrange the route may set it): Googer, signed up and no conductor yet, opens the panel; then Matt runs `/conductor set`; then Googer picks Loop in his panel: the mode is set (the post says "**Googer** … set the train to loop."), and his panel loses its controls with "This train has a conductor: only they and the moderators can move it." Googer's "Move train…" now gives that refusal instead of a panel. A moderator who is not signed up may change the mode; a member who is not signed up may not ("You are not signed up for this train.").
+12. **A stale panel:** Matt and Googer (no conductor) each open the panel at stop 1; Matt presses Next; Googer picks Loop in his old panel: refused with "The train has moved on meanwhile." above the fresh panel, the mode unchanged. Googer's Reverse on an old panel the same.
+13. **`/train at-end:`** `/train name:Park loop at-end:Loop` makes a train whose post says "loops" once it has two stops (a route of one stop finishes there in every mode, and the line says nothing of a mode); `at-end:Turn back` likewise. Without the option the train finishes.
+14. **Saved routes keep the mode:** in a looping train reversed once, `/route save name:Round`: the answer says "At the end it loops back to the first stop." In a new train (Finish), `/route load route:Round` (the list shows "Round (4 stops, loops)"): the route in the saved order, the panel's menu shows Loop, the post's line says the train loaded the route and "At the end it loops back to the first stop." `/route show` ends with that sentence. Save again under the same name from a Finish train: the route is replaced, mode and all; loading it says "At the end it finishes the route." privately, and the post's line says nothing of the mode.
+15. **The commands:** `/next` at the last stop of a looping train answers with a text that begins "The train is at stop 1 of 4: A. Next is B."; of a finishing one, at the last stop, one that begins "The train is at stop 4 of 4: D. It is the last stop: Next finishes the route." (both end with " I am telling the others." when others are signed up).
+16. **A copy in another region's channel:** a train whose route has a stop in another region: the copy there shows the same route line ("loops" / "turns back at the end") and "Next gym", without "Move train…"; after a turn the copy lists the new order too.
+17. **A DM about a new train** (Googer, new-train DMs on): the brief of the train reads as before ("At …"), nothing about the mode is missing that the post shows in a word.
+
+## Left open (for the follow-ups)
+
+- **An old plain-text panel** is closed and the new one sent below it (step 4): a direct components-v2 update of an old panel was not tried.
diff --git a/src/commands/trains/move.ts b/src/commands/trains/move.ts
index 2e10b088074fa43436b6a06482bb7e7e1ebccae6..918dc938145075f903895bfc1d7b8b0c0925f4ef 100644
--- a/src/commands/trains/move.ts
+++ b/src/commands/trains/move.ts
@@ -76,8 +76,8 @@ function moveCommand(
         `${details} ${here}, and the others are told where ` +
         'the train is going, with a ping for those who allow it. While the train has a ' +
         'conductor, only they and the moderators can move it; otherwise anybody who is signed ' +
-        'up can. The same as the button "Move train…" on the post. Use it in the post of the ' +
-        'train.',
+        'up can. The same as the button "Move train…" on the post, whose panel also reverses ' +
+        'the route and sets what the train does at its end. Use it in the post of the train.',
       examples: [`/${name}`],
     },
     guards: [requireTrain],
@@ -90,15 +90,18 @@ export const next = moveCommand(
   'next',
   'next',
   'Move this train to its next stop',
-  'Takes the train to the next stop of its route; from the last stop it finishes the route.',
+  'Takes the train to the next stop of its route. From the last stop it finishes the route, ' +
+    'or, as the train is set (`/train at-end`, or the menu of the panel), goes round to the ' +
+    'first stop (loop) or turns back and runs the route backwards (turn back).',
 );
 
 export const previous = moveCommand(
   'previous',
   'previous',
   'Move this train back to the stop before',
-  'Takes the train one stop back. From the end of its route it goes back to the stop it was ' +
-    'at when the route was finished, which takes a mistaken `/finish` back.',
+  'Takes the train one stop back; a train that loops goes from its first stop to its last. ' +
+    'From the end of its route it goes back to the stop it was at when the route was ' +
+    'finished, which takes a mistaken `/finish` back.',
   'Who was here stays here when a `/finish` is taken back and is coming again otherwise',
 );
 
@@ -106,15 +109,17 @@ export const skip = moveCommand(
   'skip',
   'skip',
   'Move this train past its next stop, to the one after it',
-  'Leaves the next stop out and takes the train to the one after it.',
+  'Leaves the next stop out and takes the train to the one after it, also round the end of ' +
+    'a route that loops and back along one that turns back.',
 );
 
 export const finish = moveCommand(
   'finish',
   'finish',
   'Say that this train has finished its route',
-  'Marks the route as finished. The train itself goes on until its end time: finishing the ' +
-    'route does not close its post. `/previous` takes a mistaken finish back.',
+  'Marks the route as finished, whatever the train does at the end of it otherwise. The ' +
+    'train itself goes on until its end time: finishing the route does not close its post. ' +
+    '`/previous` takes a mistaken finish back.',
 );
 
 /**
diff --git a/src/commands/trains/route.ts b/src/commands/trains/route.ts
index b0d99edbaee5819ec33c608383e720c6dbf7c29d..47190a8c20a1ef2efc279ef2948b1832f6b54a3d 100644
--- a/src/commands/trains/route.ts
+++ b/src/commands/trains/route.ts
@@ -600,7 +600,9 @@ export const route = commandGroup({
     category: 'train',
     details:
       'Use it in the post of the train. The current stop follows its gym through every change ' +
-      'of the route: the train stays where it is.',
+      'of the route: the train stays where it is. A saved route keeps the order of its stops ' +
+      'and what the train does at its end (finish, loop or turn back); loading it sets both. ' +
+      'The route is reversed in the panel of the button "Move train…".',
   },
   guards: [requireTrain],
   parts: [show, add, remove, move, clear, save, load, forget],
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8b3 HEAD -- src test scripts docs .claude package.json package-lock.json CLAUDE.md ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-15-phase-8b3-train-modes.md'` prints nothing; `npm run check`, `npm run build`, then the database tests of the files this plan touches (`TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/saved-route-repository.db.test.ts src/db/migrator.db.test.ts src/db/repositories/party-repository.db.test.ts src/db/repositories/gym-removal-repository.db.test.ts`), one after the other. The test files with timers or waits that this plan changes (`src/services/train-service.test.ts`, `src/services/train-service.routes.test.ts`, `src/commands/trains/move.test.ts`, `src/commands/trains/route.test.ts`, `src/commands/trains/train.test.ts`, `src/commands/parties/in-train.test.ts`) ten times in a row.
2. Whole-branch review (Opus, high effort); one fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8B-3": the decisions above for Matt, what only staging shows, what was left open), the Gantt chart and memory.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-15-phase-8b3-staging.md` (added by task 5). Each step with Matt's go-ahead, on the test server with the dev application; Matt starts the bot. `npm run deploy-commands -- --global` first; migration 013 only after 8W-1's 012.
