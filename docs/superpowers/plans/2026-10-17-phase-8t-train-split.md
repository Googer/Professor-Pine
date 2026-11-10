# Phase 8T: Splitting a Group off a Raid Train: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a group of a raid train becomes a train of its own in one action: the same route, current stop, end mode, boss and start, the group's members moved there as they are; both posts link the other in their small print; the members who moved are pinged in the new post. A grey "✂️ Split group…" button by "Move train…" (only while two groups have members) and `/group split letter:` open a private confirmation; "✂️ Split it off" does it.

**Architecture:**

- **Domain** (`src/domain/party/train.ts`, pure): `mayNotSplit` (who may: staff and the conductor any group; a group's member their own group unless the conductor is in it; refused with one group, an empty group, a split that would leave the train empty `whole-train`, a train without a post `unposted`, a stale press `group-changed`), `splittableGroups`, `splitsPossible`; `splitTrain` (the new train), `splitOffGroup` (the old train without the group, and what it was at the split), `carriedSplit` and `splitSettled` (the new train made to match the group as it was at the old train's write; a member still on the old train dropped on settling). `groupMark` (the label with the newest split's party id) marks a confirmation; `nextGroupId` never reuses a letter in use and prefers one no split named. State document **version 11**: `train.splitFrom` (with `pending` until settled) and `train.splitOff` (newest first, at most 10); version 10 read with neither.
- **History** (`src/domain/history/party-history.ts`, `src/services/party-history.ts`, migration **020**): a member who left with a split gets a `split` step on the old train (an attendee, not departed; `PartyHistoryAttendee.splitOff`); the new train's history starts at the write that settles it (nothing is noted while it is pending); `PartyHistory.splitFromId` (indexed) names the old train.
- **Service** (`PartyService.splitTrain`, `TrainService.split`): on the pattern of `relocate`, under the old train's `moves` lock: refusals known up front; the new train stored (pending) and posted in the same forum; the old train loses the group inside the store (refused if the new train is no longer active); the new train settled (retried once; else reconciled); anything failing before the old train's write takes the new train back (no stray post). Pending trains are settled once Discord is connected and by the scheduler's upkeep after a minute. Lines in both threads; the new post's line pings the members who moved and allow mentions, never the presser; no new-train DMs.
- **Discord** (`src/render/train-post.ts`, `src/render/train-split.ts`, `src/commands/trains/split.ts`, `train-changes.ts`, `src/commands/parties/group.ts`): the small print `Split off from <#post>` / `Group B (Fast) went its own way: <#post>`; the button (`party:<id>:split`, not on region copies); the confirmation (components-v2, private; `splitgo:<group>:<mark>`, `splitno`, `splitpick`); "Split it off" first shows "Splitting group B off…" without controls, then the outcome; `splitGroupAs` is the one code path (the live map can call it later); `/group split` with autocomplete of the groups the member may split.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14 components-v2, Kysely on MySQL 8.4, Vitest. No new dependency. **Migration 020** (additive, guarded: `PartyHistory.splitFromId` with its index, `PartyHistoryAttendee.splitOff`; after 8S-1's 019). Party state document version 11. `/group` gains `split`, so the commands are registered again at staging.

**Spec:** `docs/superpowers/specs/2026-10-17-train-split-design.md` (approved by Matt 2026-10-17), with the mockups in `.superpowers/sdd/2026-10-17-phase-8t-train-split/` (`split-v1.html`, `split-v2.html`, git-ignored). Matt decided: the conductor splits any group, a group's member their own unless the conductor is in it; a private "are you sure?"; the new train named after the group's label; one link to the other train in each post's small print, the thread line naming only the doer; the members who moved pinged in the new post; each train's history records what happened on it (the group on the old train until the split); a split that would leave the train empty is refused.

**Every diff in this plan was run before the plan was written** on a throwaway branch (`proto-8t`, on typescript-migration e4c6bc52), one commit per task, each typechecked with its tests green. On the tip the full check (7,488 unit tests), the build and the database suite (440) are clean. Three Opus reviewers went through the prototype (tasks 1–2, 3, 4–6) and two more through the three fix rounds; every finding is folded into the commits below.

## Decisions in this plan

Matt's decisions are under Spec above. These were made while prototyping and reviewing, for Matt to look at:

1. **Staff may always split**; the new train's conductor is the old conductor when they went with the group, else the presser when in the group, else none; the old train keeps its other groups' letters.
2. **The button is not on region copies**; it shows only while two groups have members.
3. **The ping honours each member's `mentions` setting** and is the new post's line itself.
4. **Several splits of one train** each get a line in its small print, newest first, at most 10 kept.
5. **Empty groups** cannot be split off; a train without a post yet cannot be split.
6. **The links are channel mentions** (`<#post>`): Discord shows the post's current title, also in copies and after either train ends.
7. **The window of a restart:** a split interrupted between the new post and the old train's write is taken back at start; one interrupted after it is settled. A member who changed group in the seconds the new post was being made, in a run that then stops in that window, may end on the wrong train (documented in `trains.md`).
8. **History:** a split member is an attendee of the old train (`splitOff` 1, not departed) and signs up on the new train at the split; the record's `createdAt` of a split-off train is the split (the `Party.createdAt` column, seconds earlier, cannot change).
9. **Rollback:** once the bot writes version 11 documents, older code cannot read them; 020 is additive. Stage 8T on a database that has 019 (8S-1) first.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network** and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8t`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`. Stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **The invariant:** nobody in both trains or in neither once a split settles; the old train never without its post; a failure leaves the old train as it was and no stray post (the races in the window, the pending flag, its settling at start and by the upkeep).
2. **Who may split**, against the design, in the domain and in every entry point (button, command, autocomplete, confirmation).
3. **The confirmation:** stale presses (the mark), a double press, a throw after the acknowledgement.
4. **The history:** the `split` step, the new train from the split, `splitFromId`, `splitOff`, migration 020 additive and guarded.
5. **The post:** the worst case within `MAX_COMPONENTS` (44 unfolded, 40 with four groups folded) with every copy; the small print through `fit`.

### Task 1: Plan 8T T1: Who may split a group off, the new and the old train

Prototype commit: `f139602806370229dcd0b0278a045022cda3e48f`

The domain of plan 8T. mayNotSplit beside mayNotArrange (staff and the
conductor any group, a member of the group their own unless the
conductor is in it; never a train of one group, one without a post
yet, an empty group, or a group that is the whole train: Matt,
2026-10-17, the old train would be left empty), splittableGroups,
splitsPossible (two groups with somebody in them), groupMark (what a
confirmation carries: the group's label and the newest split, so that
a press for a group that changed, went, or whose letter came again is
refused: group-changed) and splitDrawn (the split a stale mark was
drawn for). splitTrain makes the new train from the old one and the
group (route, stop, mode, boss and times as they are, one group A with
the group's label, its members as they are, led by the old conductor
who goes with it, else the presser in it, else nobody), pending until
the split is settled; splitOffGroup takes the group off the old train
(other groups keep their letters, splits remembered newest first, at
most ten) and says where the old train was then; carriedSplit keeps
what happened on the new train while its post was made and takes the
old train's place and times at the split (the very same train when
nothing changed); splitSettled clears pending, and with the old train
drops who is still on it as the new train was made with them (they
changed group meanwhile and stayed). A group opened after a
split takes a letter no group has and no split named while one is
free. Party state document version 11: train.splitFrom (with pending)
and train.splitOff; version 10 is read with neither.

**Files:**

```
 src/db/repositories/party-repository.db.test.ts |  15 ++
 src/domain/party/attendance.test.ts             |  18 ++
 src/domain/party/attendance.ts                  |  26 +-
 src/domain/party/party-state.test.ts            | 106 +++++++-
 src/domain/party/party-state.ts                 |  70 +++++-
 src/domain/party/party.ts                       |  54 ++++-
 src/domain/party/tick.train.test.ts             |   2 +
 src/domain/party/train-split.test.ts            | 577 ++++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/train.test.ts                  |   2 +
 src/domain/party/train.ts                       | 450 ++++++++++++++++++++++++++++++++++
 src/render/activity.ts                          |  14 ++
 11 files changed, 1322 insertions(+), 12 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/party/attendance.test.ts src/domain/party/party-state.test.ts src/domain/party/tick.train.test.ts src/domain/party/train-split.test.ts src/domain/party/train.test.ts`, then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/repositories/party-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f139602806370229dcd0b0278a045022cda3e48f -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-train-split.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T T1: Who may split a group off, the new and the old train`, the body above and the trailer, staging exactly
  `src/db/repositories/party-repository.db.test.ts src/domain/party/attendance.test.ts src/domain/party/attendance.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/tick.train.test.ts src/domain/party/train-split.test.ts src/domain/party/train.test.ts src/domain/party/train.ts src/render/activity.ts`.

````diff
diff --git a/src/db/repositories/party-repository.db.test.ts b/src/db/repositories/party-repository.db.test.ts
index d4a90c538324745bf17c408eaa363463d770eb03..df39bfdcc37dc9402a52ff760925e0e853af81e8 100644
--- a/src/db/repositories/party-repository.db.test.ts
+++ b/src/db/repositories/party-repository.db.test.ts
@@ -193,6 +193,19 @@ describe('PartyRepository', () => {
         atEnd: 'loop',
         conductorId: ALICE,
         boss: { key: 'yveltal' },
+        // Split off another train, and a group of its own split off it (plan 8T).
+        splitFrom: {
+          partyId: '00000000-0000-4000-8000-0000000000aa',
+          postId: '300000000000000020',
+        },
+        splitOff: [
+          {
+            partyId: '00000000-0000-4000-8000-0000000000bb',
+            postId: '300000000000000021',
+            group: 'C',
+            label: 'Fast',
+          },
+        ],
       },
     };
   }
@@ -228,6 +241,8 @@ describe('PartyRepository', () => {
         atEnd: 'turn-back',
         conductorId: null,
         boss: { name: 'Newmon' },
+        splitFrom: null,
+        splitOff: [],
       },
       updatedAt: PARTY_NOW + 5,
     };
diff --git a/src/domain/party/attendance.test.ts b/src/domain/party/attendance.test.ts
index 9e98124791ccd3f6edc7068b2b9aac4fb05f65d8..fc4d94976c2805c5c5a75c043a57520a0dc9df4a 100644
--- a/src/domain/party/attendance.test.ts
+++ b/src/domain/party/attendance.test.ts
@@ -312,6 +312,24 @@ describe('groups', () => {
     expect(createGroup(party, ALICE, limits)).toEqual({ ok: false, reason: 'too-many-groups' });
   });
 
+  it('opens a group under a letter no group has, after one went (a split, plan 8T)', () => {
+    // Groups A and C: B was split off. The next group is D, never a second C.
+    const gapped = {
+      ...testRaid(),
+      groups: [{ id: 'A' }, { id: 'C' }],
+      defaultGroupId: 'C',
+    } as const;
+    const opened = createGroup(gapped, ALICE, limits);
+    expect(opened).toMatchObject({ ok: true, group: 'D' });
+    // With E in use, the first letter that is free.
+    const late = {
+      ...testRaid(),
+      groups: [{ id: 'A' }, { id: 'C' }, { id: 'E' }],
+      defaultGroupId: 'E',
+    } as const;
+    expect(createGroup(late, ALICE, limits)).toMatchObject({ ok: true, group: 'B' });
+  });
+
   it('adds somebody who is not signed up as coming when they open or join a group', () => {
     const opened = createGroup(testRaid(), ALICE, limits);
     expect(opened).toMatchObject({ ok: true, joined: true });
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index 8dfb65586463baff9c464e51f2d81c7d404113e8..6d069a06b9a4081bf33023f9a1032aa1a48b4f7f 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -515,8 +515,28 @@ export function joinInto<P extends Party>(
 }
 
 /**
- * Opens the next group and moves the member into it. It becomes the group new attendees land
- * in. `others` are the attendees who have not completed the raid, to be told about it.
+ * The letter of the next group: one that no group has and that no group split off a train went
+ * by (plan 8T, `train.splitOff`), the first after the last letter in use, else the first such;
+ * when every free letter was a split's, the first free one (a confirmation drawn for the group
+ * that went is still refused: `groupMark` covers the splits). Undefined when the party has every
+ * group it may.
+ */
+function nextGroupId(party: Party): GroupId | undefined {
+  const used = new Set(party.groups.map((group) => group.id));
+  const gone = new Set(isTrain(party) ? party.train.splitOff.map((split) => split.group) : []);
+  const last = Math.max(...party.groups.map((group) => GROUP_IDS.indexOf(group.id)));
+  const fresh = (id: GroupId) => !used.has(id) && !gone.has(id);
+  return (
+    GROUP_IDS.slice(last + 1).find(fresh) ??
+    GROUP_IDS.find(fresh) ??
+    GROUP_IDS.find((id) => !used.has(id))
+  );
+}
+
+/**
+ * Opens the next group (`nextGroupId`) and moves the member into it. It becomes the group new
+ * attendees land in. `others` are the attendees who have not completed the raid, to be told
+ * about it.
  */
 export function createGroup<P extends Party>(
   party: P,
@@ -524,7 +544,7 @@ export function createGroup<P extends Party>(
   limits: AttendanceLimits,
 ): Change<P, { group: GroupId; joined: boolean; others: string[] }> {
   if (!hasGroups(party)) return refused('no-groups');
-  const id = GROUP_IDS[party.groups.length];
+  const id = nextGroupId(party);
   if (id === undefined) return refused('too-many-groups');
   const opened: P = { ...party, groups: [...party.groups, { id }], defaultGroupId: id };
   const moved = joinGroup(opened, memberId, id, limits);
diff --git a/src/domain/party/party-state.test.ts b/src/domain/party/party-state.test.ts
index 61708adb07c544c9fe721937aa37d0a77ad577e2..5c8d0d413521635d2cb12c50cd6966ab78ce5582 100644
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -15,6 +15,7 @@ import {
   MAX_MEETUP_DESCRIPTION,
   MAX_PARTY_NAME,
   MAX_ROUTE_STOPS,
+  MAX_SPLITS_KEPT,
   TRAIN_AT_END,
   type MeetupParty,
   type MirrorMessage,
@@ -155,7 +156,7 @@ describe('party state', () => {
       party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
     });
     // Nothing was added to the document for it: the version is what it was.
-    expect(document.v).toBe(10);
+    expect(document.v).toBe(11);
     // There were no shadow EX raids, and there are no shadow elite raids: still refused.
     const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
     expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
@@ -170,7 +171,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(10);
+    expect(state.v).toBe(11);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -231,7 +232,7 @@ describe('party state', () => {
     expect(problem(state, { ...columns, type: 'train' })).toBe(
       'a train without its name and start',
     );
-    expect(problem({ ...state, v: 11 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 12 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -658,6 +659,8 @@ function fullTrain(): TrainParty {
       atEnd: 'finish',
       conductorId: ALICE,
       boss: { key: 'yveltal' },
+      splitFrom: null,
+      splitOff: [],
     },
   };
 }
@@ -700,6 +703,8 @@ describe('the state of a train', () => {
       atEnd: 'finish',
       conductorId: ALICE,
       boss: { key: 'yveltal' },
+      splitFrom: null,
+      splitOff: [],
     });
     expect(partyState(testTrain()).train).toEqual({
       route: [],
@@ -708,6 +713,8 @@ describe('the state of a train', () => {
       atEnd: 'finish',
       conductorId: null,
       boss: null,
+      splitFrom: null,
+      splitOff: [],
     });
   });
 
@@ -721,6 +728,8 @@ describe('the state of a train', () => {
         atEnd: 'finish',
         conductorId: null,
         boss: { name: 'Newmon' },
+        splitFrom: null,
+        splitOff: [],
       },
     };
     expect(partyFromStored(columnsOf(train), stored(partyState(train)), [])).toEqual({
@@ -937,6 +946,97 @@ describe('the state of a train', () => {
     ).toThrow(/cannot be stored/);
   });
 
+  it('keeps the trains a train was split from and off, and reads a version 10 train as one of neither', () => {
+    const train = fullTrain();
+    const split: TrainParty = {
+      ...train,
+      train: {
+        ...train.train,
+        splitFrom: {
+          partyId: '00000000-0000-4000-8000-0000000000aa',
+          postId: '300000000000000020',
+        },
+        splitOff: [
+          {
+            partyId: '00000000-0000-4000-8000-0000000000bb',
+            postId: '300000000000000021',
+            group: 'C',
+            label: 'Fast',
+          },
+          {
+            partyId: '00000000-0000-4000-8000-0000000000cc',
+            postId: '300000000000000022',
+            group: 'B',
+          },
+        ],
+      },
+    };
+    expect(partyState(split).v).toBe(11);
+    expect(partyFromStored(columnsOf(split), stored(partyState(split)), [])).toEqual({
+      ok: true,
+      party: split,
+    });
+    // A new train whose split is not settled yet says so, and only then.
+    const pending: TrainParty = {
+      ...split,
+      train: {
+        ...split.train,
+        splitFrom: {
+          partyId: '00000000-0000-4000-8000-0000000000aa',
+          postId: '300000000000000020',
+          pending: true,
+        },
+      },
+    };
+    expect(partyFromStored(columnsOf(pending), stored(partyState(pending)), [])).toEqual({
+      ok: true,
+      party: pending,
+    });
+    expect(partyState(split).train?.splitFrom).not.toHaveProperty('pending');
+    // Version 10 knew no splits: what such a document says of them is not read.
+    const { splitFrom: _from, splitOff: _off, ...details } = partyState(split).train ?? {};
+    for (const old of [details, partyState(split).train]) {
+      expect(
+        partyFromStored(columnsOf(split), stored({ ...partyState(split), v: 10, train: old }), []),
+      ).toEqual({ ok: true, party: train });
+    }
+    // A raid and a meetup of version 10 are read as they are.
+    const meetup = fullMeetup();
+    expect(
+      partyFromStored(
+        columnsOf(meetup),
+        stored({ ...partyState(meetup), v: 10 }),
+        meetup.mirrorMessages,
+      ),
+    ).toEqual({ ok: true, party: meetup });
+  });
+
+  it('refuses a split that no train can have, when read and when written', () => {
+    const train = fullTrain();
+    const state = stored(partyState(train)) as Record<string, unknown>;
+    const withTrain = (details: object): string =>
+      problem(columnsOf(train), { ...state, train: { ...train.train, ...details } });
+    const off = (n: number) =>
+      Array.from({ length: n }, (_, i) => ({
+        partyId: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`,
+        postId: `30000000000000003${i % 10}`,
+        group: 'B',
+      }));
+    expect(withTrain({ splitOff: off(MAX_SPLITS_KEPT) })).toBe('read');
+    expect(withTrain({ splitOff: off(MAX_SPLITS_KEPT + 1) })).toMatch(/^state: /);
+    expect(withTrain({ splitOff: [{ ...off(1)[0], group: 'F' }] })).toMatch(/^state: /);
+    expect(withTrain({ splitFrom: { partyId: 'x', postId: 'no post' } })).toMatch(/^state: /);
+    expect(withTrain({ splitFrom: undefined })).toMatch(/^state: /);
+    // A new train waits for the old one's write (`pending`): only `true` says so.
+    const from = { partyId: '00000000-0000-4000-8000-0000000000aa', postId: '300000000000000020' };
+    expect(withTrain({ splitFrom: { ...from, pending: true } })).toBe('read');
+    expect(withTrain({ splitFrom: { ...from, pending: false } })).toMatch(/^state: /);
+    expect(withTrain({ splitOff: undefined })).toMatch(/^state: /);
+    expect(() =>
+      partyState({ ...train, train: { ...train.train, splitFrom: { partyId: '', postId: '1' } } }),
+    ).toThrow(/cannot be stored/);
+  });
+
   it('reads a version 4 document, which is a raid or a meetup and never a train', () => {
     const meetup = testMeetup();
     const old = stored({ ...partyState(meetup), v: 4 });
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index 9dc24f4b2a1b7ddac841c74ac74395dac1609553..0b70081fc266801d27415ffb768a70057478800b 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -8,6 +8,7 @@ import {
   MAX_PARTY_NAME,
   MAX_MEMBER_NAME,
   MAX_ROUTE_STOPS,
+  MAX_SPLITS_KEPT,
   MIRROR_KINDS,
   TEAMS,
   TRAIN_AT_END,
@@ -40,11 +41,13 @@ import { PartyStatus } from './status.js';
  * raid of an earlier document has none. Version 9 (plan 8B-3) added a train's `atEnd` (what it
  * does at the last stop of its route); a train of an earlier document finishes its route there.
  * Version 10 (plan 8D) added a meetup's `place` (a gym, PokéStop or power spot as it was named,
- * or a pin); a meetup of an earlier document has none.
+ * or a pin); a meetup of an earlier document has none. Version 11 (plan 8T) added a train's
+ * `splitFrom` (the train it was split off from, `pending: true` until the split is settled) and
+ * `splitOff` (the groups split off it); a train of an earlier document has neither.
  * Documents of versions 1 to 3 are those of raids, and one of version 4 is that of a raid or a
  * meetup.
  */
-export const PARTY_STATE_VERSION = 10;
+export const PARTY_STATE_VERSION = 11;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -232,6 +235,25 @@ const trainV8 = z
     }
   });
 
+/** The details of a train as versions 9 and 10 wrote them: read only, without its splits. */
+const trainV10 = z
+  .object({
+    route: z.array(gymId).max(MAX_ROUTE_STOPS),
+    stop: z.number().int().nonnegative(),
+    finishedFrom: gymId.nullable(),
+    atEnd: z.enum(TRAIN_AT_END),
+    conductorId: snowflake.nullable(),
+    boss: bossRef.nullable(),
+  })
+  .superRefine((value, context) => {
+    for (const message of [...routeProblems(value), ...finishProblems(value)]) {
+      context.addIssue({ code: 'custom', message });
+    }
+  });
+
+/** The other train of a split: its party (a UUID, as every party id is) and its post. */
+const trainLink = z.object({ partyId: z.uuid(), postId: snowflake });
+
 const train = z
   .object({
     route: z.array(gymId).max(MAX_ROUTE_STOPS),
@@ -240,6 +262,10 @@ const train = z
     atEnd: z.enum(TRAIN_AT_END),
     conductorId: snowflake.nullable(),
     boss: bossRef.nullable(),
+    splitFrom: trainLink.extend({ pending: z.literal(true).optional() }).nullable(),
+    splitOff: z
+      .array(trainLink.extend({ group: groupId, label: z.string().optional() }))
+      .max(MAX_SPLITS_KEPT),
   })
   .superRefine((value, context) => {
     for (const message of [...routeProblems(value), ...finishProblems(value)]) {
@@ -293,6 +319,23 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 10, as plans 8D to 8M-5 wrote it: read only. It is version 11 without a train's splits. */
+const stateV10 = z
+  .object({
+    v: z.literal(10),
+    ...shared,
+    raid: raid.optional(),
+    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
+    timed: timed.optional(),
+    meetup: meetup.optional(),
+    train: trainV10.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 9, as plans 8B-3 to 8M-2F wrote it: read only. It is version 10 without a meetup's place. */
 const stateV9 = z
   .object({
@@ -302,7 +345,7 @@ const stateV9 = z
     makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
     timed: timed.optional(),
     meetup: meetupV9.optional(),
-    train: train.optional(),
+    train: trainV10.optional(),
     attendees: z.array(attendee.extend({ id: snowflake })),
     prompts,
   })
@@ -440,14 +483,27 @@ function withPlace<T extends { meetup?: z.output<typeof meetupV9> | undefined }>
   return old.meetup ? { ...old, meetup: { ...old.meetup, place: null } } : old;
 }
 
+/** A train of a document before version 11 was split neither from nor off another. */
+function withSplits<T extends { train?: z.output<typeof trainV10> | undefined }>(old: T) {
+  return old.train ? { ...old, train: { ...old.train, splitFrom: null, splitOff: [] } } : old;
+}
+
 /** Reads a stored document of any version this code knows, as the current version. */
 function readState(stored: unknown) {
   const version =
     typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
   if (version === PARTY_STATE_VERSION) return state.safeParse(stored);
+  const older = readStateV10(stored, version);
+  if (!older.success) return older;
+  return state.safeParse({ ...withSplits(older.data), v: PARTY_STATE_VERSION });
+}
+
+/** Reads a document of versions 1 to 10, upgraded to the shape of version 10. */
+function readStateV10(stored: unknown, version: unknown) {
+  if (version === 10) return stateV10.safeParse(stored);
   const older = readStateV9(stored, version);
   if (!older.success) return older;
-  return state.safeParse({ ...withPlace(older.data), v: PARTY_STATE_VERSION });
+  return stateV10.safeParse({ ...withPlace(older.data), v: 10 });
 }
 
 /** Reads a document of versions 1 to 9, upgraded to the shape of version 9. */
@@ -543,7 +599,11 @@ function kindParts(party: Party): Pick<PartyState, 'raid' | 'timed' | 'meetup' |
     case 'train':
       return {
         timed: party.timed,
-        train: { ...party.train, route: [...party.train.route] },
+        train: {
+          ...party.train,
+          route: [...party.train.route],
+          splitOff: party.train.splitOff.map((split) => ({ ...split })),
+        },
       };
   }
 }
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 17837ca1948e36bbe7d2128bbcef7b04750cb39b..2ef09f740aed0ebd032b94223d5414dd145ebca1 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -280,6 +280,37 @@ export function isTrainAtEnd(value: unknown): value is TrainAtEnd {
   return typeof value === 'string' && (TRAIN_AT_END as readonly string[]).includes(value);
 }
 
+/** The other train of a split (plan 8T): its party and its post. */
+export interface TrainLink {
+  partyId: string;
+  postId: string;
+}
+
+/**
+ * The train a train was split off from (plan 8T). `pending` while the split is not settled: the
+ * new train is stored and has its post, the old one may not have lost the group yet. The write
+ * that carries the group over clears it (`splitSettled`); a train still pending at start is
+ * settled or taken back by what the old train says (`PartyService.settlePendingSplits`).
+ */
+export interface SplitFrom extends TrainLink {
+  pending?: true;
+}
+
+/**
+ * A group that was split off a train and became a train of its own (plan 8T): that train, and
+ * the group as it was called when it left (its letter, and its label when it had one).
+ */
+export interface SplitOff extends TrainLink {
+  group: GroupId;
+  label?: string;
+}
+
+/**
+ * A train remembers this many of the groups that were split off it, the newest first: a train
+ * has at most five groups at a time, and the small print of its post lists them.
+ */
+export const MAX_SPLITS_KEPT = 10;
+
 /** What only a raid train has (the functions that change it are in `train.ts`). */
 export interface TrainDetails {
   /** The gyms the train visits, by id, in order; no gym twice, at most `MAX_ROUTE_STOPS`. */
@@ -303,6 +334,10 @@ export interface TrainDetails {
   conductorId: string | null;
   /** The Pokémon the train is after, when somebody said (`/boss`). */
   boss: RaidBossRef | null;
+  /** The train this one was split off from (`splitTrain`), with its post; null for any other. */
+  splitFrom: SplitFrom | null;
+  /** The groups split off this train, newest first, at most `MAX_SPLITS_KEPT`. */
+  splitOff: readonly SplitOff[];
 }
 
 /**
@@ -486,7 +521,24 @@ export type PartyProblem =
    * The conductor role is no longer whose it was when a button was drawn (the live map): the
    * button would take it over or drop it from somebody it did not show.
    */
-  | 'conductor-changed';
+  | 'conductor-changed'
+  /** A train of one group has nothing to split a group off from. */
+  | 'one-group'
+  /** Nobody is in that group: there is nobody to make a train of. */
+  | 'empty-group'
+  /** Everybody on the train is in that group: the old train would be left empty (Matt). */
+  | 'whole-train'
+  /** The train has no post yet: the train split off it could not link to it. */
+  | 'unposted'
+  /** Only a member of the group (or the conductor, or staff) may split it off. */
+  | 'not-in-group'
+  /** The conductor is in that group: only they and staff may split it off. */
+  | 'conductor-in-group'
+  /**
+   * The group is no longer the one a confirmation was drawn for (it was split off, or it is
+   * called otherwise now): the press would split off something it did not show.
+   */
+  | 'group-changed';
 
 /** A change that was not made. It has no `party`, which is how `PartyStore.update` knows. */
 export interface Refusal {
diff --git a/src/domain/party/tick.train.test.ts b/src/domain/party/tick.train.test.ts
index b6d2a1ef59c2880a1cb06934513bbbd8b9e321e2..36afd036a7cd9132e199d6f98fe1354ab2396295 100644
--- a/src/domain/party/tick.train.test.ts
+++ b/src/domain/party/tick.train.test.ts
@@ -61,6 +61,8 @@ const boarded: TrainParty = {
     atEnd: 'finish',
     conductorId: null,
     boss: { key: 'yveltal' },
+    splitFrom: null,
+    splitOff: [],
   },
 };
 /** The same from 16:00 to 18:00. */
diff --git a/src/domain/party/train-split.test.ts b/src/domain/party/train-split.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3220de34c93418ae399e75174517de52f39b27ff
--- /dev/null
+++ b/src/domain/party/train-split.test.ts
@@ -0,0 +1,577 @@
+import { describe, expect, it } from 'vitest';
+import {
+  ALICE,
+  BOB,
+  CAROL,
+  PARTY_NOW,
+  REPORTER,
+  testTrain,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import { createGroup } from './attendance.js';
+import {
+  MAX_PARTY_NAME,
+  MAX_SPLITS_KEPT,
+  type Attendee,
+  type PartyGroup,
+  type TrainDetails,
+  type TrainParty,
+} from './party.js';
+import { partyFromStored, partyState } from './party-state.js';
+import { PartyStatus } from './status.js';
+import {
+  carriedSplit,
+  groupMark,
+  mayNotSplit,
+  splitDrawn,
+  splitOffGroup,
+  splitSettled,
+  splitsPossible,
+  splitTrain,
+  splittableGroups,
+} from './train.js';
+
+const HOUR = 3_600_000;
+const NEW_ID = '00000000-0000-4000-8000-0000000000aa';
+const OLD_POST = '910000000000000001';
+const NEW_POST = '910000000000000002';
+const DAVE = '200000000000000005';
+const link = { partyId: NEW_ID, postId: NEW_POST };
+
+/**
+ * A train with these groups (A always first), its route and these members (coming in group A
+ * unless they say otherwise), with its post. `REPORTER` made it and is in group A.
+ */
+function trainWith(
+  groups: readonly PartyGroup[],
+  attendees: Record<string, Partial<Attendee>>,
+  train: Partial<TrainDetails> = {},
+): TrainParty {
+  const made = withAttendees(testTrain({ autoStatus: PartyStatus.Coming }), attendees);
+  return {
+    ...made,
+    forumChannelId: '900000000000000001',
+    forumPostId: OLD_POST,
+    groups,
+    defaultGroupId: groups.at(-1)?.id ?? 'A',
+    train: { ...made.train, ...train },
+  };
+}
+
+const TWO = [{ id: 'A' }, { id: 'B', label: 'Fast' }] as const satisfies readonly PartyGroup[];
+
+/** Alice and Bob in group B (Fast), Carol in A with the maker. */
+const fast = (train: Partial<TrainDetails> = {}) =>
+  trainWith(
+    TWO,
+    { [ALICE]: { group: 'B', name: 'Dawn' }, [BOB]: { group: 'B', number: 2 }, [CAROL]: {} },
+    train,
+  );
+
+describe('mayNotSplit: who may split a group off', () => {
+  it('refuses a train of one group, a group it does not have and an empty one, to everybody', () => {
+    const one = trainWith([{ id: 'A' }], { [ALICE]: {} });
+    expect(mayNotSplit(one, ALICE, true, 'A')).toBe('one-group');
+    expect(mayNotSplit(fast(), ALICE, true, 'C')).toBe('no-such-group');
+    const empty = trainWith(TWO, { [ALICE]: {} });
+    expect(mayNotSplit(empty, ALICE, true, 'B')).toBe('empty-group');
+  });
+
+  it('lets staff split any group, and the conductor any group, in it or not', () => {
+    const led = fast({ conductorId: CAROL });
+    expect(mayNotSplit(led, DAVE, true, 'B')).toBeUndefined();
+    expect(mayNotSplit(led, DAVE, true, 'A')).toBeUndefined();
+    expect(mayNotSplit(led, CAROL, false, 'B')).toBeUndefined();
+    expect(mayNotSplit(led, CAROL, false, 'A')).toBeUndefined();
+  });
+
+  it('lets a member split their own group, with no conductor or a conductor elsewhere', () => {
+    expect(mayNotSplit(fast(), ALICE, false, 'B')).toBeUndefined();
+    expect(mayNotSplit(fast({ conductorId: CAROL }), BOB, false, 'B')).toBeUndefined();
+    // Any status counts: an interested member of the group too.
+    const interested = trainWith(TWO, { [ALICE]: { group: 'B', status: PartyStatus.Interested } });
+    expect(mayNotSplit(interested, ALICE, false, 'B')).toBeUndefined();
+  });
+
+  it('refuses a member of another group, somebody not signed up, and the maker who is not', () => {
+    expect(mayNotSplit(fast(), CAROL, false, 'B')).toBe('not-in-group');
+    expect(mayNotSplit(fast(), DAVE, false, 'B')).toBe('not-in-group');
+    const away = { ...fast(), attendees: { [ALICE]: attendee('B'), [CAROL]: attendee('A') } };
+    expect(mayNotSplit(away, REPORTER, false, 'B')).toBe('not-in-group');
+  });
+
+  it('refuses to split off a group that holds everybody: the old train would be left empty', () => {
+    // Matt, 2026-10-17: group A is empty, so B is the whole train.
+    const whole = { ...fast(), attendees: { [ALICE]: attendee('B'), [BOB]: attendee('B') } };
+    expect(mayNotSplit(whole, ALICE, false, 'B')).toBe('whole-train');
+    expect(mayNotSplit(whole, DAVE, true, 'B')).toBe('whole-train');
+    expect(splittableGroups(whole, DAVE, true)).toEqual([]);
+    expect(splitsPossible(whole)).toBe(false);
+    expect(splitOffGroup(whole, ALICE, false, 'B', link)).toEqual({
+      ok: false,
+      reason: 'whole-train',
+    });
+    // Two groups with somebody in them: there is something to split.
+    expect(splitsPossible(fast())).toBe(true);
+    expect(splitsPossible(trainWith([{ id: 'A' }], { [ALICE]: {} }))).toBe(false);
+  });
+
+  it('refuses a train that has no post yet: the new one could not link to it', () => {
+    const unposted = { ...fast(), forumPostId: null };
+    expect(mayNotSplit(unposted, ALICE, true, 'B')).toBe('unposted');
+    expect(splitOffGroup(unposted, ALICE, false, 'B', link)).toEqual({
+      ok: false,
+      reason: 'unposted',
+    });
+  });
+
+  it('leaves a group with the conductor in it to the conductor and staff', () => {
+    const led = fast({ conductorId: ALICE });
+    expect(mayNotSplit(led, BOB, false, 'B')).toBe('conductor-in-group');
+    expect(mayNotSplit(led, ALICE, false, 'B')).toBeUndefined();
+    expect(mayNotSplit(led, DAVE, true, 'B')).toBeUndefined();
+  });
+
+  it('lists the groups a member may split, for the menu and the autocomplete', () => {
+    const three = trainWith([...TWO, { id: 'C' }], {
+      [ALICE]: { group: 'B' },
+      [BOB]: { group: 'C' },
+    });
+    expect(splittableGroups(three, ALICE, false)).toEqual(['B']);
+    expect(splittableGroups(three, DAVE, false)).toEqual([]);
+    // Staff: every group that has somebody in it (C, B and the maker's A).
+    expect(splittableGroups(three, DAVE, true)).toEqual(['A', 'B', 'C']);
+    expect(
+      splittableGroups({ ...three, train: { ...three.train, conductorId: BOB } }, BOB, false),
+    ).toEqual(['A', 'B', 'C']);
+  });
+});
+
+function attendee(group: 'A' | 'B'): Attendee {
+  return { number: 1, status: PartyStatus.Coming, group, remote: false };
+}
+
+const split = (old: TrainParty, by = ALICE, anonymous = false) =>
+  splitTrain(old, { id: NEW_ID, by, anonymous, group: 'B', now: PARTY_NOW + HOUR });
+
+describe('splitTrain: the new train', () => {
+  it('is named after the old one and the group, in the same server and region, made now', () => {
+    const made = split(fast());
+    expect(made).toMatchObject({
+      id: NEW_ID,
+      type: 'train',
+      status: 'active',
+      guildId: 1,
+      regionId: 1,
+      gymId: null,
+      hatchTime: null,
+      forumChannelId: null,
+      forumPostId: null,
+      regionLinkMessageId: null,
+      mirrorMessages: [],
+      createdById: ALICE,
+      anonymous: false,
+      saved: false,
+      createdAt: PARTY_NOW + HOUR,
+      updatedAt: PARTY_NOW + HOUR,
+      timed: { name: 'Saturday legendaries (Fast)' },
+    });
+    // The maker of the old train is no maker of this one.
+    expect(made.makerName).toBeUndefined();
+    // Without a label, by the group's letter.
+    const plain = trainWith([{ id: 'A' }, { id: 'B' }], { [ALICE]: { group: 'B' } });
+    expect(split(plain).timed.name).toBe('Saturday legendaries (B)');
+  });
+
+  it('cuts a long name so that the group still shows, within what a name may be', () => {
+    const long = { ...fast(), timed: { name: 'x'.repeat(MAX_PARTY_NAME), startTime: null } };
+    const name = split(long).timed.name;
+    expect(name.length).toBeLessThanOrEqual(MAX_PARTY_NAME);
+    expect(name).toMatch(/^x+… \(Fast\)$/u);
+    const label = 'y'.repeat(100);
+    const labelled = trainWith([{ id: 'A' }, { id: 'B', label }], { [ALICE]: { group: 'B' } });
+    const both = split({ ...labelled, timed: long.timed }).timed.name;
+    expect(both.length).toBeLessThanOrEqual(MAX_PARTY_NAME);
+    expect(both).toMatch(/^x+… \(y+…\)$/u);
+  });
+
+  it('has the group as its one group A, with its label, and its members as they are', () => {
+    const made = split(fast());
+    expect(made.groups).toEqual([{ id: 'A', label: 'Fast' }]);
+    expect(made.defaultGroupId).toBe('A');
+    expect(made.attendees).toEqual({
+      [ALICE]: { number: 1, status: PartyStatus.Coming, group: 'A', remote: false, name: 'Dawn' },
+      [BOB]: { number: 2, status: PartyStatus.Coming, group: 'A', remote: false },
+    });
+    expect(made.prompts).toEqual({ completion: [], warning: null });
+  });
+
+  it('keeps who is here, remote and +1s as they were', () => {
+    const old = trainWith(TWO, {
+      [ALICE]: { group: 'B', status: PartyStatus.Present, remote: true, number: 3, team: 'mystic' },
+    });
+    expect(split(old).attendees[ALICE]).toEqual({
+      number: 3,
+      status: PartyStatus.Present,
+      group: 'A',
+      remote: true,
+      team: 'mystic',
+    });
+  });
+
+  it('carries the times and the end mode and the boss, before the train started', () => {
+    const old = {
+      ...fast({ atEnd: 'loop', boss: { key: 'yveltal' } }),
+      endTime: PARTY_NOW + 4 * HOUR,
+      timed: { name: 'Saturday legendaries', startTime: PARTY_NOW + 2 * HOUR },
+    };
+    const made = split(old);
+    expect(made.timed.startTime).toBe(PARTY_NOW + 2 * HOUR);
+    expect(made.endTime).toBe(PARTY_NOW + 4 * HOUR);
+    expect(made.lastPossibleTime).toBe(PARTY_NOW + 4 * HOUR);
+    expect(made.deletionTime).toBeNull();
+    expect(made.train).toEqual({
+      route: [],
+      stop: 0,
+      finishedFrom: null,
+      atEnd: 'loop',
+      // Alice split it off, and she is in the group.
+      conductorId: ALICE,
+      boss: { key: 'yveltal' },
+      splitFrom: { partyId: old.id, postId: OLD_POST, pending: true },
+      splitOff: [],
+    });
+  });
+
+  it('is where the old train is, mid-route, finished, and turned back', () => {
+    expect(split(fast({ route: [4, 1, 7], stop: 1 })).train).toMatchObject({
+      route: [4, 1, 7],
+      stop: 1,
+    });
+    const finished = split(fast({ route: [4, 1, 7], stop: 3, finishedFrom: 1 }));
+    expect(finished.train).toMatchObject({ route: [4, 1, 7], stop: 3, finishedFrom: 1 });
+    // A turn-back train that has turned keeps its route as it is stored now.
+    const turned = split(fast({ route: [7, 1, 4], stop: 1, atEnd: 'turn-back' }));
+    expect(turned.train).toMatchObject({ route: [7, 1, 4], stop: 1, atEnd: 'turn-back' });
+  });
+
+  it('is led by the old conductor who goes with the group, else by the presser in it, else by nobody', () => {
+    expect(split(fast({ conductorId: BOB }), ALICE).train.conductorId).toBe(BOB);
+    expect(split(fast({ conductorId: CAROL }), ALICE).train.conductorId).toBe(ALICE);
+    expect(split(fast(), ALICE).train.conductorId).toBe(ALICE);
+    // The conductor of the old train, or staff, splitting a group they are not in.
+    expect(split(fast({ conductorId: CAROL }), CAROL).train.conductorId).toBeNull();
+    expect(split(fast(), DAVE).train.conductorId).toBeNull();
+  });
+
+  it('names the presser as its maker, unless they asked not to be named', () => {
+    expect(split(fast(), CAROL, false)).toMatchObject({ createdById: CAROL, anonymous: false });
+    expect(split(fast(), ALICE, true)).toMatchObject({ createdById: ALICE, anonymous: true });
+  });
+
+  it('survives the state document', () => {
+    const made = { ...split(fast({ route: [4, 1, 7], stop: 1 })), forumPostId: NEW_POST };
+    const columns = { ...made, type: made.type };
+    const back = partyFromStored(columns, partyState(made), made.mirrorMessages);
+    expect(back).toEqual({ ok: true, party: made });
+  });
+});
+
+describe('splitOffGroup: the old train', () => {
+  it('loses the group and its members; the others keep their letters', () => {
+    const three = trainWith([...TWO, { id: 'C' }], {
+      [ALICE]: { group: 'B' },
+      [BOB]: { group: 'B' },
+      [CAROL]: { group: 'C' },
+    });
+    const done = splitOffGroup(three, ALICE, false, 'B', link);
+    if (!done.ok) throw new Error(done.reason);
+    expect(Object.keys(done.party.attendees)).toEqual([REPORTER, CAROL]);
+    expect(done.party.groups).toEqual([{ id: 'A' }, { id: 'C' }]);
+    expect(done.party.defaultGroupId).toBe('C');
+    expect(Object.keys(done.moved)).toEqual([ALICE, BOB]);
+    expect(done.group).toEqual({ id: 'B', label: 'Fast' });
+    expect(done.party.train.splitOff).toEqual([{ ...link, group: 'B', label: 'Fast' }]);
+  });
+
+  it('hands new sign-ups to the newest group left when the newest one went', () => {
+    const done = splitOffGroup(fast(), ALICE, false, 'B', link);
+    expect(done.ok && done.party.defaultGroupId).toBe('A');
+    // A group opened afterwards takes the next letter, never one in use.
+    if (!done.ok) throw new Error(done.reason);
+    const three = trainWith([{ id: 'A' }, { id: 'B' }, { id: 'C' }], {
+      [ALICE]: { group: 'B' },
+      [CAROL]: { group: 'C' },
+    });
+    const middle = splitOffGroup(three, ALICE, false, 'B', link);
+    if (!middle.ok) throw new Error(middle.reason);
+    const opened = createGroup(middle.party, CAROL, { maxNumber: 6 });
+    expect(opened).toMatchObject({ ok: true, group: 'D' });
+  });
+
+  it('keeps its conductor, but for one who went with the group', () => {
+    const kept = splitOffGroup(fast({ conductorId: CAROL }), ALICE, false, 'B', link);
+    expect(kept.ok && kept.party.train.conductorId).toBe(CAROL);
+    const gone = splitOffGroup(fast({ conductorId: BOB }), BOB, false, 'B', link);
+    expect(gone.ok && gone.party.train.conductorId).toBeNull();
+  });
+
+  it('says who leads the new train, as the group is at the split', () => {
+    const conductor = (old: TrainParty, by: string) => {
+      const done = splitOffGroup(old, by, by === DAVE, 'B', link);
+      return done.ok ? done.conductor : done.reason;
+    };
+    expect(conductor(fast({ conductorId: BOB }), BOB)).toBe(BOB);
+    expect(conductor(fast({ conductorId: BOB }), DAVE)).toBe(BOB);
+    expect(conductor(fast({ conductorId: CAROL }), ALICE)).toBe(ALICE);
+    expect(conductor(fast({ conductorId: CAROL }), CAROL)).toBeNull();
+    expect(conductor(fast(), DAVE)).toBeNull();
+  });
+
+  it('keeps its route, stop and mode', () => {
+    const old = fast({ route: [4, 1, 7], stop: 1, atEnd: 'loop' });
+    const done = splitOffGroup(old, ALICE, false, 'B', link);
+    expect(done.ok && done.party.train).toMatchObject({ route: [4, 1, 7], stop: 1, atEnd: 'loop' });
+  });
+
+  it('lists the splits newest first, as many as it keeps', () => {
+    const older = Array.from({ length: MAX_SPLITS_KEPT }, (_, n) => ({
+      partyId: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
+      postId: `92000000000000000${n}`,
+      group: 'C' as const,
+    }));
+    const done = splitOffGroup(fast({ splitOff: older }), ALICE, false, 'B', link);
+    if (!done.ok) throw new Error(done.reason);
+    expect(done.party.train.splitOff).toHaveLength(MAX_SPLITS_KEPT);
+    expect(done.party.train.splitOff[0]).toEqual({ ...link, group: 'B', label: 'Fast' });
+    expect(done.party.train.splitOff.at(-1)).toEqual(older.at(-2));
+  });
+
+  it('refuses as mayNotSplit says', () => {
+    expect(splitOffGroup(fast(), CAROL, false, 'B', link)).toEqual({
+      ok: false,
+      reason: 'not-in-group',
+    });
+    expect(splitOffGroup(fast({ conductorId: ALICE }), BOB, false, 'B', link)).toEqual({
+      ok: false,
+      reason: 'conductor-in-group',
+    });
+  });
+
+  it('refuses a press drawn for a group that changed or went since', () => {
+    const drawn = groupMark(fast(), 'B');
+    expect(drawn).toBeDefined();
+    expect(splitOffGroup(fast(), ALICE, false, 'B', link, drawn).ok).toBe(true);
+    const renamed = { ...fast(), groups: [{ id: 'A' }, { id: 'B', label: 'Slow' }] } as TrainParty;
+    expect(splitOffGroup(renamed, ALICE, false, 'B', link, drawn)).toEqual({
+      ok: false,
+      reason: 'group-changed',
+    });
+    const gone = trainWith([{ id: 'A' }, { id: 'C' }], { [ALICE]: { group: 'C' } });
+    expect(splitOffGroup(gone, ALICE, false, 'B', link, drawn)).toEqual({
+      ok: false,
+      reason: 'group-changed',
+    });
+    // A command draws nothing: the group it names is asked as it is.
+    expect(splitOffGroup(gone, ALICE, false, 'B', link)).toEqual({
+      ok: false,
+      reason: 'no-such-group',
+    });
+  });
+
+  it('marks a group by the splits so far too: a letter given again is another group', () => {
+    // A and B (Fast); B is split off; a new group B (Fast) is opened: the old mark is stale.
+    const drawn = groupMark(fast(), 'B');
+    const done = splitOffGroup(fast(), ALICE, false, 'B', link);
+    if (!done.ok) throw new Error(done.reason);
+    const again = {
+      ...done.party,
+      groups: [{ id: 'A' }, { id: 'B', label: 'Fast' }],
+      attendees: { ...done.party.attendees, [DAVE]: attendee('B') },
+    } as TrainParty;
+    expect(groupMark(again, 'B')).not.toBe(drawn);
+    expect(splitOffGroup(again, DAVE, false, 'B', link, drawn)).toEqual({
+      ok: false,
+      reason: 'group-changed',
+    });
+  });
+
+  it('tells which split a stale mark was drawn for: the group that went', () => {
+    const drawn = groupMark(fast(), 'B') ?? '';
+    const done = splitOffGroup(fast(), ALICE, false, 'B', link);
+    if (!done.ok) throw new Error(done.reason);
+    expect(splitDrawn(done.party, 'B', drawn)).toEqual({ ...link, group: 'B', label: 'Fast' });
+    // Not for another letter, another mark, or a train it was not split off.
+    expect(splitDrawn(done.party, 'A', drawn)).toBeUndefined();
+    expect(splitDrawn(done.party, 'B', groupMark(fast(), 'A') ?? '')).toBeUndefined();
+    expect(splitDrawn(fast(), 'B', drawn)).toBeUndefined();
+    // A later split of another group: the mark is no longer of the newest split.
+    const three = trainWith([...TWO, { id: 'C' }], {
+      [ALICE]: { group: 'B' },
+      [BOB]: { group: 'C' },
+    });
+    const first = splitOffGroup(three, ALICE, false, 'B', link);
+    if (!first.ok) throw new Error(first.reason);
+    const markOfB = groupMark(three, 'B') ?? '';
+    const second = splitOffGroup(first.party, BOB, false, 'C', {
+      partyId: '00000000-0000-4000-8000-0000000000bb',
+      postId: '910000000000000003',
+    });
+    if (!second.ok) throw new Error(second.reason);
+    expect(splitDrawn(second.party, 'B', markOfB)).toBeUndefined();
+  });
+
+  it('opens a group after a split under a letter no split named, while one is free', () => {
+    const done = splitOffGroup(fast(), ALICE, false, 'B', link);
+    if (!done.ok) throw new Error(done.reason);
+    expect(createGroup(done.party, CAROL, { maxNumber: 6 })).toMatchObject({
+      ok: true,
+      group: 'C',
+    });
+    // B to E all went: B comes again, the first letter that is free.
+    const gone = (['B', 'C', 'D', 'E'] as const).map((group, n) => ({
+      partyId: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
+      postId: `92000000000000000${n}`,
+      group,
+    }));
+    const spent = trainWith([{ id: 'A' }], { [CAROL]: {} }, { splitOff: gone });
+    expect(createGroup(spent, CAROL, { maxNumber: 6 })).toMatchObject({ ok: true, group: 'B' });
+  });
+
+  it('marks a group by its label, so that a mark tells one label from another', () => {
+    expect(groupMark(fast(), 'B')).not.toBe(
+      groupMark({ ...fast(), groups: [{ id: 'A' }, { id: 'B', label: 'Fast!' }] }, 'B'),
+    );
+    expect(groupMark(fast(), 'A')).toMatch(/^[0-9a-z]+$/u);
+    expect(groupMark(fast(), 'C')).toBeUndefined();
+  });
+});
+
+describe('carriedSplit: what changed while the new post was made', () => {
+  const start = split(fast({ conductorId: CAROL }), ALICE);
+
+  it('moves whoever is in the group at the split, as they are then', () => {
+    // Bob left the group before the split; Carol joined it.
+    const moved = {
+      [ALICE]: attendee('B'),
+      [CAROL]: { ...attendee('B'), status: PartyStatus.Present },
+    };
+    // The conductor of the old train went with the group after all.
+    const carried = carriedSplit(start, start, moved, CAROL);
+    expect(carried.attendees).toEqual({
+      [ALICE]: { ...attendee('B'), group: 'A' },
+      [CAROL]: { ...attendee('B'), group: 'A', status: PartyStatus.Present },
+    });
+    expect(carried.train.conductorId).toBe(CAROL);
+  });
+
+  it('keeps what members did on the new train meanwhile, and who left it stays out', () => {
+    const moved = { [ALICE]: attendee('B'), [BOB]: attendee('B') };
+    const target: TrainParty = {
+      ...start,
+      attendees: {
+        [ALICE]: { ...attendee('B'), group: 'A', status: PartyStatus.Present },
+        [DAVE]: { ...attendee('B'), group: 'A' },
+      },
+    };
+    const carried = carriedSplit(target, start, moved, ALICE);
+    expect(Object.keys(carried.attendees)).toEqual([ALICE, DAVE]);
+    expect(carried.attendees[ALICE]?.status).toBe(PartyStatus.Present);
+  });
+
+  it('keeps a conductor somebody set on the new train meanwhile', () => {
+    const moved = { [ALICE]: attendee('B'), [BOB]: attendee('B') };
+    const target = { ...start, train: { ...start.train, conductorId: BOB } };
+    expect(carriedSplit(target, start, moved, ALICE).train.conductorId).toBe(BOB);
+  });
+
+  it('gives back the very same train when nothing changed meanwhile', () => {
+    const moved = { [ALICE]: { ...attendee('B'), name: 'Dawn' }, [BOB]: start.attendees[BOB] };
+    const same = carriedSplit(start, start, moved as Record<string, Attendee>, ALICE);
+    expect(same).toBe(start);
+    const was = at(fast({ conductorId: CAROL }));
+    expect(carriedSplit(start, start, moved as Record<string, Attendee>, ALICE, was)).toBe(start);
+  });
+
+  it('takes the stop, route and times of the old train at the split, unless they changed on the new one', () => {
+    const old = fast({ route: [4, 1, 7], stop: 1, conductorId: CAROL });
+    const made = split(old, ALICE);
+    const moved = { [ALICE]: made.attendees[ALICE], [BOB]: made.attendees[BOB] } as Record<
+      string,
+      Attendee
+    >;
+    // The old train moved on and had its start set while the new post was made.
+    const later: Partial<TrainParty> = {
+      train: { ...old.train, route: [4, 1, 7, 9], stop: 2 },
+      timed: { ...old.timed, startTime: PARTY_NOW + 2 * HOUR },
+      endTime: PARTY_NOW + 5 * HOUR,
+    };
+    const carried = carriedSplit(made, made, moved, ALICE, at({ ...old, ...later }));
+    expect(carried.train).toMatchObject({
+      route: [4, 1, 7, 9],
+      stop: 2,
+      conductorId: ALICE,
+      splitFrom: made.train.splitFrom,
+      splitOff: [],
+    });
+    expect(carried.timed).toEqual({
+      name: 'Saturday legendaries (Fast)',
+      startTime: PARTY_NOW + 2 * HOUR,
+    });
+    expect(carried.endTime).toBe(PARTY_NOW + 5 * HOUR);
+    // Somebody moved the new train itself meanwhile: that counts, as for the conductor.
+    const moving = { ...made, train: { ...made.train, stop: 0 } };
+    expect(carriedSplit(moving, made, moved, ALICE, at({ ...old, ...later })).train.stop).toBe(0);
+  });
+});
+
+/** What `splitOffGroup` says of the old train at the split: its train and times. */
+function at(old: TrainParty) {
+  const done = splitOffGroup(old, REPORTER, true, 'B', link);
+  if (!done.ok) throw new Error(done.reason);
+  return done.was;
+}
+
+describe('the new train of a split waits for the old one (pending)', () => {
+  it('is pending from its making until the split is settled', () => {
+    const made = split(fast());
+    expect(made.train.splitFrom).toEqual({ partyId: fast().id, postId: OLD_POST, pending: true });
+    const settledNow = splitSettled(made);
+    expect(settledNow.train.splitFrom).toEqual({ partyId: fast().id, postId: OLD_POST });
+    expect(splitSettled(settledNow)).toBe(settledNow);
+    expect(splitSettled(fast())).toEqual(fast());
+  });
+
+  it('settles against the old train: who is still on it as the new train was made with them stays there', () => {
+    const old = fast({ conductorId: BOB });
+    const made = split(old);
+    const bob = old.attendees[BOB] ?? attendee('B');
+    // While the new post was made Bob went to group A of the old train, which then lost group B
+    // (Alice): a stop before the carry-over left the new train with both of them.
+    const after: TrainParty = {
+      ...old,
+      attendees: {
+        [REPORTER]: attendee('A'),
+        [BOB]: { ...bob, group: 'A' },
+        [CAROL]: attendee('A'),
+      },
+    };
+    const settledNow = splitSettled(made, after);
+    expect(Object.keys(settledNow.attendees)).toEqual([ALICE]);
+    // Bob led it: the lead falls to Alice, who split the group off and is still on it, as at
+    // the carry-over; staff who split it off and are not on it lead nothing.
+    expect(settledNow.train.conductorId).toBe(ALICE);
+    expect(splitSettled(split(old, DAVE), after).train.conductorId).toBeNull();
+    expect(settledNow.train.splitFrom).toEqual({ partyId: old.id, postId: OLD_POST });
+    // Who acted on the new post meanwhile stays on it.
+    const acted: TrainParty = {
+      ...made,
+      attendees: {
+        ...made.attendees,
+        [BOB]: { ...bob, group: 'A', status: PartyStatus.Present },
+      },
+    };
+    expect(Object.keys(splitSettled(acted, after).attendees)).toEqual([ALICE, BOB]);
+    expect(splitSettled(acted, after).train.conductorId).toBe(BOB);
+  });
+});
diff --git a/src/domain/party/train.test.ts b/src/domain/party/train.test.ts
index 6e4edfb8dc7b403a21d8ca6b284f56136c9cd1d4..b6e6074f66b1d0ba31cde4b3821372baeb353359 100644
--- a/src/domain/party/train.test.ts
+++ b/src/domain/party/train.test.ts
@@ -661,6 +661,8 @@ describe('clearRoute and replaceRoute', () => {
       atEnd: 'finish',
       conductorId: ALICE,
       boss: { key: 'yveltal' },
+      splitFrom: null,
+      splitOff: [],
     });
   });
 
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index ce7daa753b33b2a2fb82d3ffee1a850ec3dbda96..a897c52fdb4588de2dc53afa543a5974683433ee 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -1,14 +1,23 @@
 import {
   attendeeOf,
+  groupOf,
   mayArrange,
+  MAX_PARTY_NAME,
   MAX_ROUTE_STOPS,
+  MAX_SPLITS_KEPT,
+  membersWhere,
+  NO_PROMPTS,
   refused,
   sameBoss,
   type Attendee,
   type Change,
+  type GroupId,
+  type PartyGroup,
   type RaidBossRef,
+  type SplitOff,
   type TrainAtEnd,
   type TrainDetails,
+  type TrainLink,
   type TrainParty,
 } from './party.js';
 import { PartyStatus } from './status.js';
@@ -60,6 +69,8 @@ export function createTrain(input: NewTrain): Change<TrainParty> {
       atEnd: input.atEnd ?? 'finish',
       conductorId: null,
       boss: null,
+      splitFrom: null,
+      splitOff: [],
     },
   };
   return { ok: true, party: settled(train, input.now) };
@@ -912,3 +923,442 @@ export function setTrainBoss(party: TrainParty, boss: RaidBossRef | null): Chang
   if (sameBoss(party.train.boss, boss)) return { ok: true, party };
   return { ok: true, party: withTrain(party, { boss }) };
 }
+
+/*
+ * Splitting a group off a train (plan 8T, docs/superpowers/specs/2026-10-17-train-split-design.md):
+ * the group becomes a train of its own with the same route, stop, mode, boss and times, its
+ * members moved there; the old train goes on without them. Who may is `mayNotSplit`; the new
+ * train is `splitTrain`, the old one `splitOffGroup`, and what changed on the new one while its
+ * post was being made is kept by `carriedSplit`.
+ */
+
+/**
+ * Why a member may not split this group off the train, or undefined when they may. Nobody may
+ * split a train of one group (`one-group`), one without a post yet (`unposted`: the new train
+ * links to it), a group it does not have (`no-such-group`), one that nobody is in
+ * (`empty-group`) or one that everybody on the train is in (`whole-train`: the old train would
+ * be left empty; Matt, 2026-10-17). Staff may split any other group, and so may the conductor;
+ * a member of the group (signed up in it, whatever their status) may split their own group
+ * (`not-in-group` for anybody else), unless the conductor is in it (`conductor-in-group`): then
+ * only the conductor and staff may. Without a conductor, any member of the group may.
+ */
+export function mayNotSplit(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+  groupId: string,
+):
+  | 'one-group'
+  | 'unposted'
+  | 'no-such-group'
+  | 'empty-group'
+  | 'whole-train'
+  | 'not-in-group'
+  | 'conductor-in-group'
+  | undefined {
+  if (party.groups.length < 2) return 'one-group';
+  if (party.forumPostId === null) return 'unposted';
+  if (!groupOf(party, groupId)) return 'no-such-group';
+  const members = membersWhere(party, (attendee) => attendee.group === groupId);
+  if (members.length === 0) return 'empty-group';
+  if (members.length === Object.keys(party.attendees).length) return 'whole-train';
+  const { conductorId } = party.train;
+  if (staff || conductorId === memberId) return undefined;
+  if (!members.includes(memberId)) return 'not-in-group';
+  if (conductorId !== null && members.includes(conductorId)) return 'conductor-in-group';
+  return undefined;
+}
+
+/** The groups this member may split off the train, in the order of the groups. */
+export function splittableGroups(party: TrainParty, memberId: string, staff: boolean): GroupId[] {
+  return party.groups
+    .filter((group) => mayNotSplit(party, memberId, staff, group.id) === undefined)
+    .map((group) => group.id);
+}
+
+/**
+ * Whether the train has something to split: two groups or more with somebody in them (the post
+ * shows "Split group…" only then).
+ */
+export function splitsPossible(party: TrainParty): boolean {
+  const filled = new Set(Object.values(party.attendees).map((attendee) => attendee.group));
+  return party.groups.filter((group) => filled.has(group.id)).length >= 2;
+}
+
+/** FNV-1a of a group's label and the newest split before it, in base 36 (`groupMark`). */
+function markOf(label: string | undefined, newest: string | undefined): string {
+  let hash = 0x811c9dc5;
+  for (const unit of `${label ?? ''}\u0000${newest ?? ''}`) {
+    hash ^= unit.codePointAt(0) ?? 0;
+    hash = Math.imul(hash, 0x01000193) >>> 0;
+  }
+  return hash.toString(36);
+}
+
+/**
+ * A short mark of a group as it is now: its label (or none) and which group was split off the
+ * train last (the newest `splitOff`'s party). A confirmation carries it, so that a press for a
+ * group whose label changed since, or that went and whose letter another group has now (even
+ * with the same label), is refused (`group-changed`) instead of splitting what it did not show.
+ * Undefined for a group the train does not have.
+ */
+export function groupMark(party: TrainParty, groupId: string): string | undefined {
+  const group = groupOf(party, groupId);
+  if (!group) return undefined;
+  return markOf(group.label, party.train.splitOff[0]?.partyId);
+}
+
+/**
+ * The split a stale mark was drawn for, when that very group is the one split off last: the
+ * newest `splitOff` is of this letter, and the mark is what that group had just before (its
+ * label then, the split before it). An answer to a second press of one confirmation can then
+ * say where the group went. Undefined otherwise.
+ */
+export function splitDrawn(
+  party: TrainParty,
+  groupId: string,
+  drawn: string,
+): SplitOff | undefined {
+  const [newest, before] = party.train.splitOff;
+  if (newest?.group !== groupId) return undefined;
+  return markOf(newest.label, before?.partyId) === drawn ? newest : undefined;
+}
+
+/** The members of a group, with their records, in the order they signed up. */
+function groupMembers(party: TrainParty, groupId: string): Record<string, Attendee> {
+  return Object.fromEntries(
+    Object.entries(party.attendees).filter(([, attendee]) => attendee.group === groupId),
+  );
+}
+
+/**
+ * Who leads the train a group becomes: the conductor of the old train when they go with the
+ * group, otherwise the member who splits it when they do, otherwise nobody (staff, or the
+ * conductor of the old train, splitting a group they are not in).
+ */
+function splitConductor(
+  party: TrainParty,
+  moved: Readonly<Record<string, Attendee>>,
+  by: string,
+): string | null {
+  const { conductorId } = party.train;
+  if (conductorId !== null && Object.hasOwn(moved, conductorId)) return conductorId;
+  return Object.hasOwn(moved, by) ? by : null;
+}
+
+/** At most `room` characters of a text, cut at the end with `…`, never inside a character. */
+function cutName(text: string, room: number): string {
+  if (text.length <= room) return text;
+  return `${text.slice(0, Math.max(0, room - 1)).replace(/[\uD800-\uDBFF]$/u, '')}…`;
+}
+
+/**
+ * The name of the train a group becomes: `<old name> (<label>)`, or `(<letter>)` for a group
+ * without a label, within `MAX_PARTY_NAME`. When it is too long, the group's part keeps at least
+ * half of the room (more when the old name is short) and the old name what is left, each cut
+ * with `…`.
+ */
+function splitName(name: string, tag: string): string {
+  const whole = `${name} (${tag})`;
+  if (whole.length <= MAX_PARTY_NAME) return whole;
+  const room = MAX_PARTY_NAME - 3;
+  const tagRoom = Math.min(tag.length, Math.max(Math.floor(room / 2), room - name.length));
+  return tidyName(`${cutName(name, room - tagRoom)} (${cutName(tag, tagRoom)})`) ?? name;
+}
+
+/** What it takes to split a group off a train, besides the train. */
+export interface NewSplit {
+  /** A fresh UUID: the id of the new train. */
+  id: string;
+  /** Snowflake of the member who splits it off: the maker of the new train. */
+  by: string;
+  /** They asked not to be named (`RaidPrivacy.Anonymous`), as for a train they make. */
+  anonymous: boolean;
+  group: GroupId;
+  now: number;
+}
+
+/**
+ * The train a group of `party` becomes (it must have the group, and a post: `mayNotSplit`):
+ * `<name> (<label or letter>)`, in the same server and region, made now by the member who splits
+ * it off (named unless they asked not to be, as for `/train`), with nothing on Discord yet. It
+ * is where the old train is, as it is: its route, stop, the stop a finished route was finished
+ * from, its mode, its boss, its start and end. It has one group, A, with the group's label; the
+ * group's members are in it as they are (status, head count, remote, name, team). It is led as
+ * `splitConductor` says, and remembers the train and post it was split off from, `pending`
+ * until the split is settled (`splitSettled`).
+ */
+export function splitTrain(party: TrainParty, split: NewSplit): TrainParty {
+  const group = groupOf(party, split.group);
+  const moved = groupMembers(party, split.group);
+  const label = group?.label;
+  const postId = party.forumPostId;
+  const base: TrainParty = {
+    id: split.id,
+    type: 'train',
+    guildId: party.guildId,
+    status: 'active',
+    regionId: party.regionId,
+    gymId: null,
+    forumChannelId: null,
+    forumPostId: null,
+    regionLinkMessageId: null,
+    mirrorMessages: [],
+    createdById: split.by,
+    anonymous: split.anonymous,
+    hatchTime: null,
+    endTime: party.endTime,
+    lastPossibleTime: null,
+    deletionTime: null,
+    saved: false,
+    createdAt: split.now,
+    updatedAt: split.now,
+    attendees: inGroupA(moved),
+    groups: [{ id: 'A', ...(label === undefined ? {} : { label }) }],
+    defaultGroupId: 'A',
+    prompts: NO_PROMPTS,
+    timed: {
+      name: splitName(party.timed.name, label ?? split.group),
+      startTime: party.timed.startTime,
+    },
+    train: party.train,
+  };
+  const placed = withTrain(base, {
+    conductorId: splitConductor(party, moved, split.by),
+    splitFrom: postId === null ? null : { partyId: party.id, postId, pending: true },
+    splitOff: [],
+  });
+  return settled(placed, split.now);
+}
+
+/** These records, every one in group A. */
+function inGroupA(records: Readonly<Record<string, Attendee>>): Record<string, Attendee> {
+  return Object.fromEntries(
+    Object.entries(records).map(([memberId, attendee]) => [memberId, { ...attendee, group: 'A' }]),
+  );
+}
+
+/** The old train at the moment of a split, as the new one goes on from it (`carriedSplit`). */
+export interface SplitMoment {
+  train: TrainDetails;
+  startTime: number | null;
+  endTime: number | null;
+}
+
+/**
+ * The train after a group was split off it into the train `link` names: without that group and
+ * its members (`moved`, their records as they were then), its other groups keeping their letters
+ * (renaming them would confuse who is where); when the group new sign-ups land in went, the
+ * newest group left takes over. Its conductor stays, but for one who went with the group. It
+ * keeps its route, stop, mode and times, and remembers the split, newest first (at most
+ * `MAX_SPLITS_KEPT`). `conductor` is who leads the new train, as the group is now
+ * (`splitConductor`), `group` the group as it was, and `was` where the train is and its times
+ * then, for the new one to go on from.
+ *
+ * Refused as `mayNotSplit` says; and with `drawn`, the mark of the group as a confirmation showed
+ * it (`groupMark`), when the group is called otherwise now or is gone (`group-changed`).
+ */
+export function splitOffGroup(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+  groupId: GroupId,
+  link: TrainLink,
+  drawn?: string,
+): Change<
+  TrainParty,
+  {
+    moved: Record<string, Attendee>;
+    group: PartyGroup;
+    conductor: string | null;
+    was: SplitMoment;
+  }
+> {
+  if (drawn !== undefined && groupMark(party, groupId) !== drawn) return refused('group-changed');
+  const problem = mayNotSplit(party, memberId, staff, groupId);
+  if (problem) return refused(problem);
+  const group = groupOf(party, groupId);
+  if (!group) return refused('no-such-group');
+  const moved = groupMembers(party, groupId);
+  const attendees = Object.fromEntries(
+    Object.entries(party.attendees).filter(([memberId]) => !Object.hasOwn(moved, memberId)),
+  );
+  const groups = party.groups.filter((other) => other.id !== groupId);
+  const defaultGroupId =
+    party.defaultGroupId === groupId ? (groups.at(-1)?.id ?? 'A') : party.defaultGroupId;
+  const { conductorId } = party.train;
+  const entry: SplitOff = {
+    ...link,
+    group: groupId,
+    ...(group.label === undefined ? {} : { label: group.label }),
+  };
+  const after = withTrain(
+    { ...party, attendees, groups, defaultGroupId },
+    {
+      conductorId: conductorId !== null && Object.hasOwn(moved, conductorId) ? null : conductorId,
+      splitOff: [entry, ...party.train.splitOff].slice(0, MAX_SPLITS_KEPT),
+    },
+  );
+  return {
+    ok: true,
+    party: after,
+    moved,
+    group,
+    conductor: splitConductor(party, moved, memberId),
+    was: { train: party.train, startTime: party.timed.startTime, endTime: party.endTime },
+  };
+}
+
+/** Whether two attendee records say the same, over their own keys. */
+function sameAttendee(a: Attendee, b: Attendee): boolean {
+  const left = Object.entries(a);
+  return (
+    left.length === Object.keys(b).length &&
+    left.every(([key, value]) => b[key as keyof Attendee] === value)
+  );
+}
+
+/** Whether two trains are at the same place of the same route, in the same mode, after one boss. */
+function samePlace(a: TrainDetails, b: TrainDetails): boolean {
+  return (
+    a.route.length === b.route.length &&
+    a.route.every((gym, n) => b.route[n] === gym) &&
+    a.stop === b.stop &&
+    a.finishedFrom === b.finishedFrom &&
+    a.atEnd === b.atEnd &&
+    sameBoss(a.boss, b.boss)
+  );
+}
+
+/** Whether two records of attendees say the same of the same members, in the same order. */
+function sameAttendees(
+  a: Readonly<Record<string, Attendee>>,
+  b: Readonly<Record<string, Attendee>>,
+): boolean {
+  const left = Object.entries(a);
+  const right = Object.keys(b);
+  return (
+    left.length === right.length &&
+    left.every(([memberId, attendee], n) => {
+      const other = b[memberId];
+      return right[n] === memberId && other !== undefined && sameAttendee(attendee, other);
+    })
+  );
+}
+
+/**
+ * `target`, the new train of a split, with the members the split moved (`moved`: the group as it
+ * was at the moment of the split, a moment after the new train was made as `start`): what members
+ * did meanwhile counts. Who was in the group then is on the new train, in group A, as they were
+ * on the old one; who left the group of the old train meanwhile is not (unless they acted on the
+ * new one). A member whose record on the new train differs from `start` acted on it and keeps
+ * that record, who joined it keeps theirs, and who left it stays out. The conductor is
+ * `conductor` (who leads it as the group was at the split) unless somebody changed the conductor
+ * of the new train meanwhile; a conductor who is not on it leads nothing. With `was` (the old
+ * train at the split, `splitOffGroup`), the new train is where the old one was then (its route,
+ * stop, mode, boss) and has its start and end, unless somebody changed those on the new train
+ * meanwhile; `now` is when, for what follows from the times (`settled`). The very same `target`
+ * when that changes nothing.
+ */
+export function carriedSplit(
+  target: TrainParty,
+  start: TrainParty,
+  moved: Readonly<Record<string, Attendee>>,
+  conductor: string | null,
+  was?: SplitMoment,
+  now: number = target.updatedAt,
+): TrainParty {
+  const attendees: Record<string, Attendee> = {};
+  const acted = (memberId: string): Attendee | undefined => {
+    const now = attendeeOf(target, memberId);
+    const was = attendeeOf(start, memberId);
+    return now !== undefined && (was === undefined || !sameAttendee(now, was)) ? now : undefined;
+  };
+  for (const [memberId, now] of Object.entries(target.attendees)) {
+    const record = Object.hasOwn(moved, memberId) ? moved[memberId] : undefined;
+    const own = acted(memberId);
+    if (own) attendees[memberId] = own;
+    else if (record) attendees[memberId] = { ...record, group: 'A' };
+    // Otherwise: in the group when the new train was made, and no longer at the split.
+    else if (!attendeeOf(start, memberId)) attendees[memberId] = now;
+  }
+  for (const [memberId, record] of Object.entries(moved)) {
+    if (Object.hasOwn(attendees, memberId)) continue;
+    // In the new train from the start and no longer: they left it there.
+    if (attendeeOf(start, memberId)) continue;
+    attendees[memberId] = { ...record, group: 'A' };
+  }
+  const changed = target.train.conductorId !== start.train.conductorId;
+  const leads = changed ? target.train.conductorId : conductor;
+  const conductorId = leads !== null && Object.hasOwn(attendees, leads) ? leads : null;
+  // Where the old train was at the split, unless the new one was moved or edited meanwhile.
+  const place =
+    was === undefined || !samePlace(target.train, start.train) || samePlace(target.train, was.train)
+      ? undefined
+      : {
+          route: was.train.route,
+          stop: was.train.stop,
+          finishedFrom: was.train.finishedFrom,
+          atEnd: was.train.atEnd,
+          boss: was.train.boss,
+        };
+  const ownTimes =
+    target.timed.startTime !== start.timed.startTime || target.endTime !== start.endTime;
+  const times =
+    was === undefined ||
+    ownTimes ||
+    (target.timed.startTime === was.startTime && target.endTime === was.endTime)
+      ? undefined
+      : was;
+  if (
+    place === undefined &&
+    times === undefined &&
+    conductorId === target.train.conductorId &&
+    sameAttendees(attendees, target.attendees)
+  ) {
+    return target;
+  }
+  const carried = withTrain(
+    {
+      ...target,
+      attendees,
+      ...(times
+        ? { endTime: times.endTime, timed: { ...target.timed, startTime: times.startTime } }
+        : {}),
+    },
+    { ...place, conductorId },
+  );
+  return times ? settled(carried, now) : carried;
+}
+
+/**
+ * The new train of a split once the split is settled: `splitFrom` no longer `pending`. The very
+ * same train when it is not pending.
+ *
+ * With `old`, the old train that lost the group to it (settled without the carry-over,
+ * `carriedSplit`): a member who is still on the old train, there as the new train was made with
+ * them (their record the same but for the group, so they never acted on the new post), changed
+ * group while the new post was made and did not go: they leave the new train. When its
+ * conductor leaves, the lead falls as at the split (`splitConductor`): to the member who split
+ * it off when they are still on it, otherwise to nobody.
+ */
+export function splitSettled(party: TrainParty, old?: TrainParty): TrainParty {
+  const from = party.train.splitFrom;
+  if (from?.pending !== true) return party;
+  const stayed = (memberId: string, attendee: Attendee): boolean => {
+    const there = old === undefined ? undefined : attendeeOf(old, memberId);
+    return there !== undefined && sameAttendee(attendee, { ...there, group: attendee.group });
+  };
+  const attendees = Object.fromEntries(
+    Object.entries(party.attendees).filter(([memberId, attendee]) => !stayed(memberId, attendee)),
+  );
+  const splitFrom = { partyId: from.partyId, postId: from.postId };
+  const { conductorId } = party.train;
+  if (Object.keys(attendees).length === Object.keys(party.attendees).length) {
+    return withTrain(party, { splitFrom });
+  }
+  const on = (memberId: string | null): memberId is string =>
+    memberId !== null && Object.hasOwn(attendees, memberId);
+  const leads = on(conductorId) ? conductorId : on(party.createdById) ? party.createdById : null;
+  return withTrain({ ...party, attendees }, { splitFrom, conductorId: leads });
+}
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 9c7aea150726c7eef3dcb95db446de83aabe0a95..bee889b6771bf200c0aaba0c6048391ca6df0bd2 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -195,6 +195,20 @@ export function problemText(
       return 'The route changed meanwhile: here it is as it is now.';
     case 'conductor-changed':
       return 'The conductor of this train changed meanwhile: here it is as it is now.';
+    case 'one-group':
+      return `This ${word} has one group: there is no group to split off it.`;
+    case 'empty-group':
+      return 'Nobody is in that group: there is nobody to split off.';
+    case 'whole-train':
+      return `Everybody on this ${word} is in that group: there is nothing to split it from.`;
+    case 'unposted':
+      return `This ${word} has no post yet: try again in a moment.`;
+    case 'not-in-group':
+      return "Only a group's members, the conductor and the moderators can split a group off.";
+    case 'conductor-in-group':
+      return 'The conductor is in that group: only they and the moderators can split it off.';
+    case 'group-changed':
+      return `The groups of this ${word} changed meanwhile.`;
   }
 }
````

### Task 2: Plan 8T T2: The history of both trains

Prototype commit: `b5100ab7b0c8327ef0bbd1459a4cdc22d32ce518`

Each train of a split is recorded on its own (Matt, 2026-10-17). The
members who went with the group leave the old train by a step of the
new kind split, not left: attendees up to the split (leftAt the split,
final status null, splitOff), never departed. The new train has no
history while it is pending; the write that settles it is its start,
as if it were new then: sign-ups, joinedAt and hereAt at the split,
its first stop where it was split (reached at its start when split
before), its record's createdAt the split, and nobody who left the
group before the split. A pending train that ends is dropped.

Migration 020 adds PartyHistory.splitFromId (the old train's partyId,
no foreign key) with an index, and PartyHistoryAttendee.splitOff
(written from the attendee), each only when it is missing;
PartyHistoryStep.kind is a varchar(8) and takes split as it is.

**Files:**

```
 src/db/migrations/2026_10_17_020_train_split.db.test.ts |  77 ++++++++++++++++
 src/db/migrations/2026_10_17_020_train_split.ts         |  53 +++++++++++
 src/db/migrations/index.ts                              |   2 +
 src/db/migrator.db.test.ts                              |   1 +
 src/db/repositories/history-queries.db.test.ts          |   1 +
 src/db/repositories/history-recording.db.test.ts        |  95 ++++++++++++++++++-
 src/db/repositories/history-repository.ts               |   2 +
 src/db/types.ts                                         |   2 +
 src/domain/history/legacy-party.test.ts                 |   1 +
 src/domain/history/legacy-party.ts                      |   2 +
 src/domain/history/party-history.test.ts                | 178 ++++++++++++++++++++++++++++++++++++
 src/domain/history/party-history.ts                     |  83 ++++++++++++++---
 src/services/party-history.test.ts                      |  44 ++++++++-
 src/services/party-history.ts                           |   3 +
 14 files changed, 530 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/history/legacy-party.test.ts src/domain/history/party-history.test.ts src/services/party-history.test.ts`, then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrations/2026_10_17_020_train_split.db.test.ts src/db/migrator.db.test.ts src/db/repositories/history-queries.db.test.ts src/db/repositories/history-recording.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff b5100ab7b0c8327ef0bbd1459a4cdc22d32ce518 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-train-split.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T T2: The history of both trains`, the body above and the trailer, staging exactly
  `src/db/migrations/2026_10_17_020_train_split.db.test.ts src/db/migrations/2026_10_17_020_train_split.ts src/db/migrations/index.ts src/db/migrator.db.test.ts src/db/repositories/history-queries.db.test.ts src/db/repositories/history-recording.db.test.ts src/db/repositories/history-repository.ts src/db/types.ts src/domain/history/legacy-party.test.ts src/domain/history/legacy-party.ts src/domain/history/party-history.test.ts src/domain/history/party-history.ts src/services/party-history.test.ts src/services/party-history.ts`.

````diff
diff --git a/src/db/migrations/2026_10_17_020_train_split.db.test.ts b/src/db/migrations/2026_10_17_020_train_split.db.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8f8ad111fc3a1927b8317ddaa47e034d6ad435df
--- /dev/null
+++ b/src/db/migrations/2026_10_17_020_train_split.db.test.ts
@@ -0,0 +1,77 @@
+import { sql, type Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import type { DB } from '../types.js';
+import { trainSplit } from './2026_10_17_020_train_split.js';
+
+const HOME = '412345678901234567';
+const OLD = '00000000-0000-4000-8000-000000000001';
+const NEW = '00000000-0000-4000-8000-000000000002';
+
+describe('migration 020: the train a train was split off from', () => {
+  let stop: () => Promise<void>;
+  let db: Kysely<DB>;
+
+  beforeAll(async () => {
+    ({ db, stop } = await startMigratedDatabase());
+  });
+  afterAll(async () => {
+    await stop();
+  });
+
+  const column = async () => {
+    const rows = await sql<{ type: string; nullable: string; defaultValue: string | null }>`
+      select column_type as type, is_nullable as nullable, column_default as defaultValue
+      from information_schema.columns
+      where table_schema = database() and table_name = 'PartyHistory'
+        and column_name = 'splitFromId'`.execute(db);
+    return rows.rows;
+  };
+
+  it('adds PartyHistory.splitFromId: a party id or nothing, without a foreign key', async () => {
+    expect(await column()).toEqual([{ type: 'char(36)', nullable: 'YES', defaultValue: null }]);
+    const keys = await sql<{ n: number }>`
+      select count(*) as n from information_schema.key_column_usage
+      where table_schema = database() and table_name = 'PartyHistory'
+        and column_name = 'splitFromId' and referenced_table_name is not null`.execute(db);
+    expect(Number(keys.rows[0]?.n)).toBe(0);
+    // A record names a train that was never recorded, or whose record is gone: it is a link.
+    await sql`insert into PartyHistory (source, partyId, kind, serverId, createdAt, ending, splitFromId)
+              values ('live', ${NEW}, 'train', ${HOME}, 1000, 'completed', ${OLD})`.execute(db);
+    await sql`insert into PartyHistory (source, partyId, kind, serverId, createdAt, ending)
+              values ('live', ${OLD}, 'train', ${HOME}, 900, 'completed')`.execute(db);
+    const rows = await sql<{ partyId: string; splitFromId: string | null }>`
+      select partyId, splitFromId from PartyHistory order by createdAt`.execute(db);
+    expect(rows.rows).toEqual([
+      { partyId: OLD, splitFromId: null },
+      { partyId: NEW, splitFromId: OLD },
+    ]);
+  });
+
+  it('adds PartyHistoryAttendee.splitOff: whether the member left with a group split off', async () => {
+    const rows = await sql<{ type: string; nullable: string; defaultValue: string | null }>`
+      select column_type as type, is_nullable as nullable, column_default as defaultValue
+      from information_schema.columns
+      where table_schema = database() and table_name = 'PartyHistoryAttendee'
+        and column_name = 'splitOff'`.execute(db);
+    expect(rows.rows).toEqual([{ type: 'tinyint(1)', nullable: 'NO', defaultValue: '0' }]);
+  });
+
+  it('indexes PartyHistory.splitFromId, for the trains split off a train', async () => {
+    expect(await indexed()).toEqual(['splitFromId']);
+  });
+
+  const indexed = async () => {
+    const rows = await sql<{ name: string }>`
+      select column_name as name from information_schema.statistics
+      where table_schema = database() and table_name = 'PartyHistory'
+        and index_name = 'partyhistory_splitfromid_index'`.execute(db);
+    return rows.rows.map((row) => row.name);
+  };
+
+  it('can run again: the columns and the index are added only when they are missing', async () => {
+    await trainSplit.up(db);
+    expect(await column()).toHaveLength(1);
+    expect(await indexed()).toEqual(['splitFromId']);
+  });
+});
diff --git a/src/db/migrations/2026_10_17_020_train_split.ts b/src/db/migrations/2026_10_17_020_train_split.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c17ba754a21aa187292d8459047d1932f5f574b4
--- /dev/null
+++ b/src/db/migrations/2026_10_17_020_train_split.ts
@@ -0,0 +1,53 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * Splitting a group off a raid train (plan 8T; spec `2026-10-17-train-split-design.md`, "Data"):
+ * `PartyHistory.splitFromId` names, in the record of a train that was split off another, that
+ * other train's `partyId`. It is a link and nothing more: each train is recorded on its own
+ * (Matt, 2026-10-17), so it carries no foreign key (the other record may be written later, or
+ * not at all). Null for every other party, the legacy history's included.
+ *
+ * A member who went with the group leaves the old train by a step of the kind `split`
+ * (`PartyHistoryStep.kind`, a `varchar(8)` since 018: no change needed), and their row of the old
+ * train's record says so: `PartyHistoryAttendee.splitOff` (1; 0 for every other row), so that
+ * SQL tells them from a member who left. `PartyHistory.splitFromId` is indexed, for the trains
+ * split off a train.
+ *
+ * 020: 8S-1 holds 019, which may be merged before or after this one (the migrator runs them
+ * in name order on a database that has neither).
+ *
+ * Safe to run again after a failure half-way: each column and the index are added only when they
+ * are missing.
+ */
+export const trainSplit: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    const missing = async (table: string, column: string) => {
+      const rows = await sql<{ n: number }>`
+        select count(*) as n from information_schema.columns
+        where table_schema = database() and table_name = ${table}
+          and column_name = ${column}`.execute(db);
+      return Number(rows.rows[0]?.n ?? 0) === 0;
+    };
+    if (await missing('PartyHistory', 'splitFromId')) {
+      await sql`alter table PartyHistory add column splitFromId char(36) default null
+        after routeStops`.execute(db);
+    }
+    if (await missing('PartyHistoryAttendee', 'splitOff')) {
+      await sql`alter table PartyHistoryAttendee add column splitOff tinyint(1) not null default 0
+        after leftAt`.execute(db);
+    }
+    const index = await sql<{ n: number }>`
+      select count(*) as n from information_schema.statistics
+      where table_schema = database() and table_name = 'PartyHistory'
+        and index_name = 'partyhistory_splitfromid_index'`.execute(db);
+    if (Number(index.rows[0]?.n ?? 0) === 0) {
+      await sql`create index partyhistory_splitfromid_index
+        on PartyHistory (splitFromId)`.execute(db);
+    }
+  },
+  async down() {
+    // Additive only: the column stays.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index 0d18c715fe4869961fd8970adea27e1845074f81..c9f67589643dfd1900dbe1120f15b53513e129f7 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -18,6 +18,7 @@ import { webSession } from './2026_10_16_015_web_session.js';
 import { wayspot } from './2026_10_16_017_wayspot.js';
 import { partyHistory } from './2026_10_16_018_party_history.js';
 import { meetupSafety } from './2026_10_17_019_meetup_safety.js';
+import { trainSplit } from './2026_10_17_020_train_split.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -43,4 +44,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_16_017_wayspot': wayspot,
   '2026_10_16_018_party_history': partyHistory,
   '2026_10_17_019_meetup_safety': meetupSafety,
+  '2026_10_17_020_train_split': trainSplit,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index e35367e284352b46f9155a6adc5012d155999ac6..9db49c8f58c65879ef96041682015571cc204646 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -166,6 +166,7 @@ describe('runMigrations', () => {
       '2026_10_16_017_wayspot',
       '2026_10_16_018_party_history',
       '2026_10_17_019_meetup_safety',
+      '2026_10_17_020_train_split',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/history-queries.db.test.ts b/src/db/repositories/history-queries.db.test.ts
index 4ae76b60e3ced529d43f9eb65ba775843b0c2e9a..fb334d295a296b6c9e46167a897c623996f82bbf 100644
--- a/src/db/repositories/history-queries.db.test.ts
+++ b/src/db/repositories/history-queries.db.test.ts
@@ -83,6 +83,7 @@ function record(more: Partial<HistoryRecord>): HistoryRecord {
     conductorId: null,
     anonymous: false,
     routeStops: null,
+    splitFromId: null,
     attendees: [],
     groups: [],
     stops: [],
diff --git a/src/db/repositories/history-recording.db.test.ts b/src/db/repositories/history-recording.db.test.ts
index 7d4436579c63132d299655723c00570d7e274778..fee7fe4b538a5256b50fc220f23e17f44c94221d 100644
--- a/src/db/repositories/history-recording.db.test.ts
+++ b/src/db/repositories/history-recording.db.test.ts
@@ -21,8 +21,9 @@ import {
   type HistoryNote,
   type HistoryNoteEnd,
 } from '../../domain/history/party-history.js';
-import { endParty, type Party } from '../../domain/party/party.js';
+import { endParty, type Party, type TrainParty } from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
+import { splitOffGroup, splitSettled, splitTrain } from '../../domain/party/train.js';
 import { createDb } from '../kysely.js';
 import type { DB } from '../types.js';
 import { HistoryRepository } from './history-repository.js';
@@ -30,6 +31,7 @@ import { PartyRepository } from './party-repository.js';
 
 const T = PARTY_NOW;
 const MOVED = '00000000-0000-4000-8000-000000000009';
+const SPLIT = '00000000-0000-4000-8000-00000000000a';
 const POST = '900000000000000001';
 const FORUM = '900000000000000002';
 
@@ -296,6 +298,97 @@ describe('the party history, written with the parties', () => {
     ]);
   });
 
+  it('records each train of a split on its own, the new one naming the old (plan 8T)', async () => {
+    await optIn(ALICE);
+    const made = withAttendees(testTrain(), {
+      [ALICE]: { group: 'B', status: PartyStatus.Present },
+    });
+    const before: TrainParty = {
+      ...made,
+      forumChannelId: FORUM,
+      forumPostId: POST,
+      groups: [{ id: 'A' }, { id: 'B', label: 'Fast' }],
+      defaultGroupId: 'B',
+      train: { ...made.train, route: [11, 12], stop: 0 },
+    };
+    const link = { partyId: SPLIT, postId: '900000000000000003' };
+    const split = splitOffGroup(before, ALICE, false, 'B', link);
+    if (!split.ok) throw new Error(split.reason);
+    const old = await live([before, split.party]);
+    await parties.save(ending(old, T + 5 * MINUTE), noteOf(old, ending(old, T + 5 * MINUTE)));
+    // The new train: made with its post in the same forum a moment before the split, and
+    // pending until the write that settles it, at the split.
+    const fresh = {
+      ...splitTrain(before, {
+        id: SPLIT,
+        by: ALICE,
+        anonymous: false,
+        group: 'B',
+        now: T + MINUTE / 2,
+      }),
+      forumChannelId: FORUM,
+      forumPostId: link.postId,
+    };
+    await parties.insert(fresh, noteOf(undefined, fresh));
+    const settled = { ...splitSettled(fresh), updatedAt: T + MINUTE };
+    await parties.save(settled, noteOf(fresh, settled));
+    const over = ending(settled, T + 9 * MINUTE);
+    await parties.save(over, noteOf(settled, over));
+    const records = await db
+      .selectFrom('PartyHistory')
+      .select(['id', 'partyId', 'splitFromId', 'attendees', 'here', 'departed', 'createdAt'])
+      .orderBy('id')
+      .execute();
+    expect(records).toEqual([
+      expect.objectContaining({
+        partyId: before.id,
+        splitFromId: null,
+        attendees: 2,
+        here: 1,
+        departed: 0,
+      }),
+      expect.objectContaining({
+        partyId: SPLIT,
+        splitFromId: before.id,
+        attendees: 1,
+        here: 1,
+        departed: 0,
+        createdAt: String(T + MINUTE),
+      }),
+    ]);
+    // Alice on the old train: there until the split, at its first stop; on the new from then.
+    expect(
+      await db
+        .selectFrom('PartyHistoryAttendee')
+        .select(['historyId', 'memberId', 'status', 'hereAt', 'leftAt', 'signedUpAt', 'splitOff'])
+        .where('memberId', '=', ALICE)
+        .orderBy('historyId')
+        .execute(),
+    ).toEqual([
+      {
+        historyId: records[0]?.id,
+        memberId: ALICE,
+        status: null,
+        hereAt: String(T),
+        leftAt: String(T + MINUTE),
+        signedUpAt: String(T),
+        splitOff: 1,
+      },
+      {
+        historyId: records[1]?.id,
+        memberId: ALICE,
+        status: 'here',
+        hereAt: String(T + MINUTE),
+        leftAt: null,
+        signedUpAt: String(T + MINUTE),
+        splitOff: 0,
+      },
+    ]);
+    // Both rows are gone, and nothing is left behind of either.
+    expect(await rowOf(before.id)).toBeUndefined();
+    expect(await rowOf(SPLIT)).toBeUndefined();
+  });
+
   it('records a party once, whatever is written again, and drops a late step', async () => {
     const raid = testRaid();
     const ended = await live([raid]);
diff --git a/src/db/repositories/history-repository.ts b/src/db/repositories/history-repository.ts
index 3fec0825d99ee50e4b15cf7249d28890ffc51b21..4f230e14417e62d394183ccb2b5510c163d222ae 100644
--- a/src/db/repositories/history-repository.ts
+++ b/src/db/repositories/history-repository.ts
@@ -99,6 +99,7 @@ function historyRow(record: HistoryRecord): Insertable<DB['PartyHistory']> {
     conductorId: record.conductorId,
     anonymous: flag(record.anonymous),
     routeStops: record.routeStops,
+    splitFromId: record.splitFromId,
     ...historyCounts(record.attendees),
   };
 }
@@ -352,6 +353,7 @@ export class HistoryRepository implements HistoryOptIns, HistoryStorage {
             hereAt: epoch(attendee.hereAt),
             doneAt: epoch(attendee.doneAt),
             leftAt: epoch(attendee.leftAt),
+            splitOff: flag(attendee.splitOff === true),
           });
         }
         for (const group of record.groups) {
diff --git a/src/db/types.ts b/src/db/types.ts
index eb1caa350209c481c5dbd28ede2b0df3e0c64303..1826db8b0e8e5dd660592e3b79db81401a91200a 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -285,6 +285,7 @@ export interface PartyHistory {
   shadow: Generated<number>;
   shiny: number | null;
   source: string;
+  splitFromId: string | null;
   startTime: string | null;
   tier: string | null;
 }
@@ -302,6 +303,7 @@ export interface PartyHistoryAttendee {
   remote: Generated<number>;
   seq: number;
   signedUpAt: string | null;
+  splitOff: Generated<number>;
   status: string | null;
   team: string | null;
 }
diff --git a/src/domain/history/legacy-party.test.ts b/src/domain/history/legacy-party.test.ts
index 1f30847bcd4c41abe9064bca19cbef1dd908b096..278f314d1f41e41c03b705b426ad680490c7d213 100644
--- a/src/domain/history/legacy-party.test.ts
+++ b/src/domain/history/legacy-party.test.ts
@@ -89,6 +89,7 @@ describe('legacyRecord', () => {
         conductorId: null,
         anonymous: false,
         routeStops: null,
+        splitFromId: null,
         attendees: [
           {
             memberId: null,
diff --git a/src/domain/history/legacy-party.ts b/src/domain/history/legacy-party.ts
index 89bcc9fc4ba1214985d00aefc72edde8bf003a82..ae5bcaccb19e95ecffb0a4c9e0518414f816a11a 100644
--- a/src/domain/history/legacy-party.ts
+++ b/src/domain/history/legacy-party.ts
@@ -288,6 +288,8 @@ export function legacyRecord(raw: unknown, context: LegacyContext): LegacyRead {
       conductorId: null,
       anonymous: false,
       routeStops: kind === 'train' ? (Array.isArray(raw.route) ? raw.route.length : 0) : null,
+      // The legacy bot split no trains.
+      splitFromId: null,
       attendees,
       groups: groupsOf(raw, attendees),
       stops: kind === 'train' ? stopsOf(raw, context) : [],
diff --git a/src/domain/history/party-history.test.ts b/src/domain/history/party-history.test.ts
index b52327e9f92fbb0e0c39ebcb1057bb697015b8b0..1ef308a35700563cc8694346c9dff5dd85768a6c 100644
--- a/src/domain/history/party-history.test.ts
+++ b/src/domain/history/party-history.test.ts
@@ -13,6 +13,7 @@ import {
 } from '../../../test/support/parties.js';
 import { endParty, type Party, type RaidBossRef, type TrainParty } from '../party/party.js';
 import { PartyStatus } from '../party/status.js';
+import { splitOffGroup, splitSettled, splitTrain } from '../party/train.js';
 import {
   historyCounts,
   historyMembers,
@@ -384,3 +385,180 @@ describe('historyOfParty', () => {
     ).toEqual([]);
   });
 });
+
+describe('a train a group was split off (plan 8T)', () => {
+  const NEW_ID = '00000000-0000-4000-8000-0000000000aa';
+  const NEW_POST = '910000000000000002';
+  const OLD_POST = '910000000000000001';
+  const DAVE = '200000000000000005';
+  /** The maker in A, Alice (here) and Bob in B, on stop 1 of 3. */
+  const before = (): TrainParty => {
+    const made = withAttendees(train(1), {
+      [ALICE]: { group: 'B', status: PartyStatus.Present },
+      [BOB]: { group: 'B' },
+    });
+    return {
+      ...made,
+      forumPostId: OLD_POST,
+      groups: [{ id: 'A' }, { id: 'B', label: 'Fast' }],
+      defaultGroupId: 'B',
+    };
+  };
+  const old = (): TrainParty => {
+    const split = splitOffGroup(before(), ALICE, false, 'B', { partyId: NEW_ID, postId: NEW_POST });
+    if (!split.ok) throw new Error(split.reason);
+    return split.party;
+  };
+
+  it('notes the members who went with the group as split off, not as left', () => {
+    expect(
+      partySteps(before(), old(), T).map(({ kind, subject, value }) => [kind, subject, value]),
+    ).toEqual([
+      ['split', ALICE, null],
+      ['split', BOB, null],
+    ]);
+    // Who leaves the train afterwards has left it, as before.
+    const { [REPORTER]: _maker, ...rest } = old().attendees;
+    expect(partySteps(old(), { ...old(), attendees: rest }, T)[0]).toMatchObject({
+      kind: 'left',
+      subject: REPORTER,
+    });
+    // Who was split off is a member the record of the old train can name.
+    const steps = partySteps(before(), old(), T);
+    expect(historyMembers(old(), steps)).toEqual([ALICE, BOB, REPORTER]);
+  });
+
+  it('keeps them as attendees of the old train up to the split, and not as departed', () => {
+    const writes: Party[] = [before(), old()];
+    const record = historyOfParty(endParty(old()), {
+      end: { how: 'clock' },
+      steps: stepsOf(writes),
+      optedIn: new Set([ALICE]),
+      describeBoss,
+      shiny: null,
+    });
+    const alice = record.attendees.find((attendee) => attendee.memberId === ALICE);
+    expect(alice).toMatchObject({
+      status: null,
+      furthest: 'here',
+      groupId: null,
+      hereAt: T,
+      leftAt: T + MINUTE,
+    });
+    expect(historyCounts(record.attendees)).toMatchObject({ attendees: 3, here: 1, departed: 0 });
+    // Alice was here: the old train took place.
+    expect(record.ending).toBe('completed');
+    expect(record.splitFromId).toBeNull();
+  });
+
+  it('notes nothing of the new train while it is pending, and all of it when it is settled', () => {
+    const made = splitTrain(before(), {
+      id: NEW_ID,
+      by: ALICE,
+      anonymous: false,
+      group: 'B',
+      now: T,
+    });
+    expect(partySteps(undefined, made, T)).toEqual([]);
+    const { [BOB]: _bob, ...alone } = made.attendees;
+    expect(partySteps(made, { ...made, attendees: alone }, T + 1)).toEqual([]);
+    // The write that settles it: as if it were new then.
+    const settled = splitSettled(made);
+    expect(partySteps(made, settled, T + 2)).toEqual(partySteps(undefined, settled, T + 2));
+    expect(partySteps(made, settled, T + 2).map(({ kind, subject }) => [kind, subject])).toEqual([
+      ['status', ALICE],
+      ['status', BOB],
+      ['stop', '12'],
+    ]);
+  });
+
+  it('records nobody on the new train who was not on it once the split was settled', () => {
+    // Bob left the group while the new post was made: the write that settles it drops him.
+    const made = splitTrain(before(), {
+      id: NEW_ID,
+      by: ALICE,
+      anonymous: false,
+      group: 'B',
+      now: T,
+    });
+    const { [BOB]: _bob, ...alone } = made.attendees;
+    const settled = { ...splitSettled(made), attendees: alone };
+    const steps = [...partySteps(undefined, made, T), ...partySteps(made, settled, T + MINUTE)];
+    const record = historyOfParty(endParty({ ...settled, updatedAt: T + 30 * MINUTE }), {
+      end: { how: 'clock' },
+      steps,
+      optedIn: new Set([ALICE, BOB]),
+      describeBoss,
+      shiny: null,
+    });
+    expect(record.attendees.map((attendee) => attendee.memberId)).toEqual([ALICE]);
+    expect(historyCounts(record.attendees)).toMatchObject({ attendees: 1, departed: 0 });
+    expect(historyMembers(settled, steps)).not.toContain(BOB);
+  });
+
+  it('starts the history of the new train at the split, and names the train it came from', () => {
+    // Made with its post a moment before the split; the write that settles it is the split.
+    const made = splitTrain(before(), {
+      id: NEW_ID,
+      by: ALICE,
+      anonymous: false,
+      group: 'B',
+      now: T + 9 * MINUTE,
+    });
+    const at = T + 10 * MINUTE;
+    const settled = splitSettled(made);
+    const later = { ...settled, attendees: { ...made.attendees }, updatedAt: at + 30 * MINUTE };
+    const record = historyOfParty(endParty(later), {
+      end: { how: 'clock' },
+      steps: [...partySteps(undefined, made, made.createdAt), ...partySteps(made, settled, at)],
+      optedIn: new Set([ALICE, BOB]),
+      describeBoss,
+      shiny: null,
+    });
+    expect(record).toMatchObject({ createdAt: at, splitFromId: before().id, createdById: ALICE });
+    expect(record.attendees).toEqual([
+      expect.objectContaining({
+        memberId: ALICE,
+        signedUpAt: at,
+        joinedAt: at,
+        hereAt: at,
+        status: 'here',
+      }),
+      expect.objectContaining({ memberId: BOB, signedUpAt: at, joinedAt: at, hereAt: null }),
+    ]);
+    // Its first stop is where it was split off, reached then.
+    expect(record.stops).toEqual([{ gymId: 12, legacyGymId: null, arrivedAt: at, leftAt: null }]);
+    expect(historyMembers(made, [])).toContain(ALICE);
+    expect(historyMembers(made, [])).not.toContain(DAVE);
+    // Without a step (nobody went with it, no route): when it was made.
+    const empty = historyOfParty(endParty({ ...settled, attendees: {} }), {
+      end: { how: 'clock' },
+      steps: [],
+      optedIn: new Set(),
+      describeBoss,
+      shiny: null,
+    });
+    expect(empty.createdAt).toBe(T + 9 * MINUTE);
+  });
+
+  it('reaches the first stop of a train split before its start at the start', () => {
+    const start = T + 60 * MINUTE;
+    const waiting = { ...before(), timed: { ...before().timed, startTime: start } };
+    const made = splitTrain(waiting, {
+      id: NEW_ID,
+      by: ALICE,
+      anonymous: false,
+      group: 'B',
+      now: T,
+    });
+    const settled = splitSettled(made);
+    const record = historyOfParty(endParty({ ...settled, updatedAt: start + MINUTE }), {
+      end: { how: 'clock' },
+      steps: partySteps(made, settled, T),
+      optedIn: new Set(),
+      describeBoss,
+      shiny: null,
+    });
+    expect(record.stops[0]).toMatchObject({ gymId: 12, arrivedAt: start });
+  });
+});
diff --git a/src/domain/history/party-history.ts b/src/domain/history/party-history.ts
index c3abb52865c8709cabbd689b74333620296b2925..9bd1c47517b789c2056dad409838f7d7e1ae7b88 100644
--- a/src/domain/history/party-history.ts
+++ b/src/domain/history/party-history.ts
@@ -100,6 +100,12 @@ export interface HistoryAttendee {
   hereAt: number | null;
   doneAt: number | null;
   leftAt: number | null;
+  /**
+   * Left with a group that was split off into a train of its own (plan 8T): one who left at
+   * `leftAt` without leaving the train behind, so no departure (`HistoryCounts.departed`); the
+   * column `PartyHistoryAttendee.splitOff` (migration 020).
+   */
+  splitOff?: true;
 }
 
 export interface HistoryGroup {
@@ -154,6 +160,11 @@ export interface HistoryRecord {
   anonymous: boolean;
   /** The stops of a train's route at the end; null for other parties. */
   routeStops: number | null;
+  /**
+   * The train this one was split off from (plan 8T): its `partyId`, a link only (its record is
+   * its own). Null for every other party.
+   */
+  splitFromId: string | null;
   attendees: readonly HistoryAttendee[];
   groups: readonly HistoryGroup[];
   stops: readonly HistoryStop[];
@@ -173,7 +184,7 @@ export interface HistoryCounts {
   doneHeads: number;
   extras: number;
   remote: number;
-  /** Members who left before the end. */
+  /** Members who left before the end; not those who went with a group split off it. */
   departed: number;
 }
 
@@ -197,14 +208,15 @@ export function historyCounts(attendees: readonly HistoryAttendee[]): HistoryCou
     counts[`${attendee.furthest}Heads`] += 1 + attendee.extras;
     counts.extras += attendee.extras;
     if (attendee.remote) counts.remote += 1;
-    if (attendee.status === null) counts.departed += 1;
+    if (attendee.status === null && attendee.splitOff !== true) counts.departed += 1;
   }
   return counts;
 }
 
 /**
  * What happened to an active party that its model does not keep: a member's status (`value`,
- * a `PartyStatus`), a member who left, where a train is (`subject` its place, `value` the gym,
+ * a `PartyStatus`), a member who left, a member who went with a group split off a train into a
+ * train of its own (`split`, plan 8T), where a train is (`subject` its place, `value` the gym,
  * null at the end of the route or without one), a group's meeting time (`subject` the group),
  * and the party it goes on from (`from`: `subject` the id of a raid that moved and became this
  * party; the record of this party takes that party's steps and its row with it).
@@ -212,13 +224,43 @@ export function historyCounts(attendees: readonly HistoryAttendee[]): HistoryCou
 export interface HistoryStep {
   partyId: string;
   at: number;
-  kind: 'status' | 'left' | 'stop' | 'meet' | 'from';
+  kind: 'status' | 'left' | 'split' | 'stop' | 'meet' | 'from';
   subject: string;
   value: number | null;
 }
 
-/** The steps from one stored form of a party to the next (`before` undefined: a new party). */
+/** The kinds of step that are about one member, by their snowflake (`subject`). */
+const MEMBER_STEPS: ReadonlySet<HistoryStep['kind']> = new Set(['status', 'left', 'split']);
+
+/**
+ * Whether this write split a group off a train: the train remembers a split it did not before.
+ * Whoever left in such a write left with the group (`splitOffGroup` changes nothing else).
+ */
+function splitIn(before: Party | undefined, after: Party): boolean {
+  if (before === undefined || !isTrain(before) || !isTrain(after)) return false;
+  const known = new Set(before.train.splitOff.map((split) => split.partyId));
+  return after.train.splitOff.some((split) => !known.has(split.partyId));
+}
+
+/**
+ * Whether a party is the new train of a split that is not settled yet (`splitFrom.pending`):
+ * stored with its post, the old train perhaps not yet without the group.
+ */
+export function splitPending(party: Party): boolean {
+  return isTrain(party) && party.train.splitFrom?.pending === true;
+}
+
+/**
+ * The steps from one stored form of a party to the next (`before` undefined: a new party).
+ *
+ * The new train of a split has no history while it is pending (plan 8T): who is on it then may
+ * still leave the group of the old train and never be on it. The write that settles it is its
+ * start, as if it were new then: who is on it signs up then, and it reaches its stop then. So
+ * its history starts at the split and holds nobody who never was on it.
+ */
 export function partySteps(before: Party | undefined, after: Party, at: number): HistoryStep[] {
+  if (splitPending(after)) return [];
+  if (before !== undefined && splitPending(before)) return partySteps(undefined, after, at);
   const steps: HistoryStep[] = [];
   const step = (kind: HistoryStep['kind'], subject: string, value: number | null) => {
     steps.push({ partyId: after.id, at, kind, subject, value });
@@ -227,8 +269,9 @@ export function partySteps(before: Party | undefined, after: Party, at: number):
     const was = before === undefined ? undefined : attendeeOf(before, memberId);
     if (was?.status !== attendee.status) step('status', memberId, attendee.status);
   }
+  const gone = splitIn(before, after) ? 'split' : 'left';
   for (const memberId of Object.keys(before?.attendees ?? {})) {
-    if (attendeeOf(after, memberId) === undefined) step('left', memberId, null);
+    if (attendeeOf(after, memberId) === undefined) step(gone, memberId, null);
   }
   for (const group of after.groups) {
     if (group.startTime === undefined) continue;
@@ -247,7 +290,7 @@ export function partySteps(before: Party | undefined, after: Party, at: number):
 export function historyMembers(party: Party, steps: readonly HistoryStep[]): string[] {
   const members = new Set<string>();
   for (const step of steps) {
-    if (step.kind === 'status' || step.kind === 'left') members.add(step.subject);
+    if (MEMBER_STEPS.has(step.kind)) members.add(step.subject);
   }
   for (const memberId of Object.keys(party.attendees)) members.add(memberId);
   members.add(party.createdById);
@@ -282,9 +325,11 @@ function attendeeRecord(
   final: Attendee | undefined,
   optedIn: ReadonlySet<string>,
 ): HistoryAttendee {
-  const own = steps.filter(
-    (step) => step.subject === memberId && (step.kind === 'status' || step.kind === 'left'),
-  );
+  const own = steps.filter((step) => step.subject === memberId && MEMBER_STEPS.has(step.kind));
+  // How they last left the party, when they are not on it at the end.
+  const departure = final
+    ? undefined
+    : own.findLast((step) => step.kind === 'left' || step.kind === 'split');
   const firstAt = (level: number): number | null =>
     own.find((step) => step.kind === 'status' && reach(step.value ?? 0) >= level)?.at ?? null;
   const levels = own.filter((step) => step.kind === 'status').map((step) => reach(step.value ?? 0));
@@ -302,7 +347,8 @@ function attendeeRecord(
     joinedAt: firstAt(1),
     hereAt: firstAt(2),
     doneAt: firstAt(3),
-    leftAt: final ? null : (own.findLast((step) => step.kind === 'left')?.at ?? null),
+    leftAt: departure?.at ?? null,
+    ...(departure?.kind === 'split' ? { splitOff: true as const } : {}),
   };
 }
 
@@ -442,7 +488,7 @@ export function historyOfParty(party: Party, input: HistoryInput): LiveRecord {
     boss: boss === null ? null : input.describeBoss(boss),
     fastMove: raid?.fastMove ?? null,
     chargedMove: raid?.chargedMove ?? null,
-    createdAt: party.createdAt,
+    createdAt: startOf(party, steps),
     hatchTime: party.hatchTime,
     startTime: isTimed(party) ? party.timed.startTime : null,
     endTime: party.endTime,
@@ -452,12 +498,25 @@ export function historyOfParty(party: Party, input: HistoryInput): LiveRecord {
     conductorId: isTrain(party) ? named(party.train.conductorId) : null,
     anonymous: party.anonymous,
     routeStops: isTrain(party) ? party.train.route.length : null,
+    splitFromId: isTrain(party) ? (party.train.splitFrom?.partyId ?? null) : null,
     attendees,
     groups,
     stops: trainStops(party, steps),
   };
 }
 
+/**
+ * When the history of a party starts: when it was made; for the new train of a split, at the
+ * split (its first step, of the write that settled it, `partySteps`), which comes a moment
+ * after it was made with its post. When it has no step (nobody went with it, and it has no
+ * route), when it was made.
+ */
+function startOf(party: Party, steps: readonly HistoryStep[]): number {
+  if (!isTrain(party) || party.train.splitFrom === null) return party.createdAt;
+  const own = steps.filter((step) => step.partyId === party.id).map((step) => step.at);
+  return own.length === 0 ? party.createdAt : Math.min(...own);
+}
+
 /**
  * What a write of a party adds to the history (`PartyStore` asks `noteOf` for each write and
  * the storage writes it with the party): its steps, and when the write ended the party, what
diff --git a/src/services/party-history.test.ts b/src/services/party-history.test.ts
index c943c6750163fff3ed2b3d903703ccc8d130706b..0b20a18d91954a21d566fcc837cbf36c0e1df675 100644
--- a/src/services/party-history.test.ts
+++ b/src/services/party-history.test.ts
@@ -1,7 +1,8 @@
 import { describe, expect, it } from 'vitest';
 import { ALICE, at, BOB, MINUTE, REPORTER, testRaid } from '../../test/support/parties.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
-import { endParty } from '../domain/party/party.js';
+import { endParty, isTrain } from '../domain/party/party.js';
+import { splitOffGroup } from '../domain/party/train.js';
 import { HISTORY_SERVER } from '../../test/support/history.js';
 import { REGION_STAFF, regionAdminWith } from '../../test/support/region-admin.js';
 import { gymsFixture } from '../../test/support/providers.js';
@@ -257,6 +258,47 @@ describe('the party history of live parties', () => {
     expect(await made.recorder.sweep()).toBe(0);
   });
 
+  it('records at start a train a group was split off, its split members not departed', async () => {
+    const made = await createdTrain({ route: [1, 2] });
+    await made.attendance.newGroup(made.party.id, alice);
+    await made.attendance.joinGroup(made.party.id, bob, 'B');
+    const link = { partyId: '00000000-0000-4000-8000-0000000000aa', postId: '910000000000000009' };
+    made.clock.now += 5 * MINUTE;
+    const split = await made.store.update(made.party.id, (party) =>
+      isTrain(party) ? splitOffGroup(party, ALICE, false, 'B', link) : { party },
+    );
+    expect(split?.written).toBe(true);
+    made.history.failing = new Error('the history is down');
+    await made.service.end(made.party.id);
+    for (let n = 0; n < 5; n++) await made.recorder.flush();
+    made.history.failing = undefined;
+    expect(made.history.records).toEqual([]);
+
+    expect(await made.recorder.sweep()).toBe(1);
+    const [record] = made.history.records;
+    expect(record?.attendees).toEqual([
+      expect.objectContaining({ status: 'interested' }),
+      expect.objectContaining({ status: null, leftAt: made.clock.now, splitOff: true }),
+      expect.objectContaining({ status: null, leftAt: made.clock.now, splitOff: true }),
+    ]);
+    expect(record?.attendees.filter((attendee) => attendee.splitOff)).toHaveLength(2);
+  });
+
+  it('records nothing of the new train of a split that ends before the split is settled', async () => {
+    const made = await createdTrain({ route: [1, 2] });
+    const from = {
+      partyId: '00000000-0000-4000-8000-0000000000aa',
+      postId: '910000000000000009',
+      pending: true as const,
+    };
+    await made.store.update(made.party.id, (party) =>
+      isTrain(party) ? { party: { ...party, train: { ...party.train, splitFrom: from } } } : {},
+    );
+    await made.service.end(made.party.id);
+    await made.recorder.flush();
+    expect(made.history.records).toEqual([]);
+  });
+
   it('leaves a party whose row cannot be read, says so, and logs a sweep that fails', async () => {
     const made = await reportedRaid();
     made.history.failing = new Error('the history is down');
diff --git a/src/services/party-history.ts b/src/services/party-history.ts
index f6b6d7d40d2a7eba95354e5dbca7237dabf5bcc6..b51dcafb82ec0368b69d0dbfbe90d46482b3b09f 100644
--- a/src/services/party-history.ts
+++ b/src/services/party-history.ts
@@ -4,6 +4,7 @@ import {
   historyMembers,
   historyOfParty,
   partySteps,
+  splitPending,
   type HistoryBoss,
   type HistoryNote,
   type HistoryNoteEnd,
@@ -91,6 +92,8 @@ export class PartyHistory {
   private endOf(party: Party, ended: PartyEnd | undefined): HistoryNoteEnd {
     if (ended?.how === 'moved') return { kind: 'move', to: ended.to };
     if (ended?.how === 'failed') return { kind: 'drop' };
+    // The new train of a split that ended before the split was settled never was one (plan 8T).
+    if (splitPending(party)) return { kind: 'drop' };
     // Decided now, from the boss list as it is when the party ends.
     const shiny = this.shinyOf(party);
     return {
````

### Task 3: Plan 8T T3: The service that splits a group off

Prototype commit: `c9e59fcba57773f592ca006180e3cdeb02ce39db`

PartyService.splitTrain, modelled on relocate: the new train is stored,
pending, and gets its post in the forum of the old train (no-forum
when the region's forum is another); then the old train loses the
group inside the store, which decides anew (the group gone or called
otherwise since the confirmation was drawn: group-changed; the train
ended; the presser no longer allowed; the new train ended meanwhile).
A refusal or an end takes the new train back (post and link line
deleted, nothing recorded). Who is in the group at the old train's
change goes: a leave or a join in between counts, and the carry-over
write makes the new train match, puts it where the old train was at
the split and settles it. A carry-over write that fails is tried once
more, then the new train is settled as the old one says. One split of
a train at a time. No new-train DMs; copies, access and the summary as
for any new party.

settlePendingSplits, once Discord is there after a start and with the
clock's hourly upkeep for one a minute old (left by writes that
failed): a pending new train is settled when the old train lists it
among its splits (without who is still on the old train as the new
one was made with them) or is no longer active, and taken back while
the old train is active without having lost the group; the log says
how many it settled and took back, only when it did any.

TrainService.split says it in both posts (doer, no link) and pings the
members who moved and allow mentions, never the presser, in the new
post's line.

**Files:**

```
 src/app.ts                                |  10 +
 src/commands/trains/route.test.ts         |   1 +
 src/services/party-scheduler.test.ts      |  27 +++
 src/services/party-scheduler.ts           |  21 +-
 src/services/party-service.ts             | 274 +++++++++++++++++++++-
 src/services/train-service.routes.test.ts |   1 +
 src/services/train-service.ts             |  72 ++++++
 src/services/train-split.test.ts          | 638 ++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/party-service.ts             |   2 +
 9 files changed, 1042 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/trains/route.test.ts src/services/party-scheduler.test.ts src/services/train-service.routes.test.ts src/services/train-split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c9e59fcba57773f592ca006180e3cdeb02ce39db -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-train-split.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T T3: The service that splits a group off`, the body above and the trailer, staging exactly
  `src/app.ts src/commands/trains/route.test.ts src/services/party-scheduler.test.ts src/services/party-scheduler.ts src/services/party-service.ts src/services/train-service.routes.test.ts src/services/train-service.ts src/services/train-split.test.ts test/support/party-service.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index d8636f9d300c88da3b8356375f58e123876d4512..b8ff422794fc5cd9da6544b4fcfa56a0690cd9e2 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -415,6 +415,7 @@ export async function startApp(
     gyms,
     regions,
     routes: savedRoutes,
+    splits: partyService,
     log,
   });
   // Google, asked about the place of a gym; without a key nothing is asked.
@@ -555,6 +556,7 @@ export async function startApp(
     screenshots: screenshotStore,
     emoji: appEmoji,
     webSessions,
+    splits: partyService,
     lines,
     gateway: partyGateway,
     raidBosses,
@@ -799,6 +801,14 @@ export async function startApp(
     ),
   );
   log.info({ features }, 'optional features');
+  // The new trains of splits that a stop left pending (plan 8T): settled or taken back once
+  // Discord is there, for taking one back deletes its post (those that failed writes left pending
+  // in the process go with the clock's upkeep).
+  void connected.then(() =>
+    partyService
+      .settlePendingSplits()
+      .catch((err: unknown) => log.error({ err }, 'could not settle the splits left pending')),
+  );
 
   // The web pages (`settings.web`), served once the client is ready: a port it cannot take is
   // logged and the bot runs on without them.
diff --git a/src/commands/trains/route.test.ts b/src/commands/trains/route.test.ts
index c5e6cdbb8210f723d10f224a2e030767742684d8..1801eacc3f34e4ecb967f7f980f4ee36bef86470 100644
--- a/src/commands/trains/route.test.ts
+++ b/src/commands/trains/route.test.ts
@@ -739,6 +739,7 @@ describe('/route: what was found in review', () => {
       store: made.store,
       gateway: made.gateway,
       posts: made.service,
+      splits: made.service,
       lines: made.partyLines,
       users: made.users,
       gyms: {
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index 478f79c3bf9698e575e775d2445e830603544d7b..77313c0f299a24c92dca8b8c99d56cc6eeba9b95 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -783,6 +783,33 @@ describe('PartyScheduler: running', () => {
     await scheduler.whenIdle();
   });
 
+  it('has the new trains of splits settled with the upkeep that a minute left pending', async () => {
+    const made = await reportedRaid();
+    const asked: number[] = [];
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      splits: {
+        settlePendingSplits: (olderThanMs) => {
+          asked.push(olderThanMs ?? 0);
+          return Promise.resolve(0);
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
+    await scheduler.whenIdle();
+    expect(asked).toEqual([60_000]);
+  });
+
   it('has the expired sessions of the web pages deleted with the upkeep', async () => {
     const made = await reportedRaid();
     let swept = 0;
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index d8ee3e7a799eaaf309abde3adb3392d912d66923..18e785ae437781d50ca376e9992090ba967b0f90 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -21,6 +21,14 @@ import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 
 const HOUR_MS = 3_600_000;
+/**
+ * How old the new train of a split must be for the upkeep to settle it while it is pending. The
+ * old train's moves lock keeps a split under way apart from the upkeep, which settles a train
+ * only once that split is done (and finds it settled then); the minute only spares the upkeep
+ * waiting behind a split that takes a moment from its post to its carry-over. One older is left
+ * by writes that failed.
+ */
+const PENDING_SPLIT_MS = 60_000;
 /** The warning is said again after this many messages of others in the post. */
 export const WARN_AGAIN_AFTER = 5;
 /** The names in a line of the scheduler are cut so that the line stays well within a message. */
@@ -53,6 +61,11 @@ export interface PartySchedulerOptions {
   emoji?: { refresh(): Promise<unknown> };
   /** The sessions of the web pages, of which those that expired go with the upkeep. */
   webSessions?: { sweep(): Promise<unknown> };
+  /**
+   * The new trains of splits left pending in the process (plan 8T: writes that failed), settled
+   * with the upkeep once they are a minute old (`PartyService.settlePendingSplits`).
+   */
+  splits?: Pick<PartyService, 'settlePendingSplits'>;
   /**
    * The meetup requests held for the moderators (`MeetupSafety.expire`), of which those whose
    * time is up expire at every tick: an hour before the meetup's start is too fine for the
@@ -251,13 +264,14 @@ export class PartyScheduler {
    * Archives open posts of ended parties, looks after the summaries, takes back the access to
    * forums that nothing calls for any more, takes stops off the routes of trains whose gym is
    * gone, has the spawn reports deleted that no process deleted at their time, and the kept
-   * screenshots that are due, and the expired sessions of the web pages, records the parties the
-   * party history was left without, and reads the application's emoji anew: at start and hourly.
+   * screenshots that are due, and the expired sessions of the web pages, settles the new trains
+   * of splits left pending, records the parties the party history was left without, and reads the
+   * application's emoji anew: at start and hourly.
    */
   private upkeep(): void {
     const { posts, access, routes, spawns, pictures, screenshots, emoji, webSessions, log } =
       this.options;
-    const { history } = this.options;
+    const { history, splits } = this.options;
     this.lastUpkeep = this.now();
     // Each by itself: one that fails does not keep the others from running.
     const step = async (work: () => Promise<unknown>): Promise<void> => {
@@ -277,6 +291,7 @@ export class PartyScheduler {
       if (screenshots) await step(() => screenshots.sweep());
       if (emoji) await step(() => emoji.refresh());
       if (webSessions) await step(() => webSessions.sweep());
+      if (splits) await step(() => splits.settlePendingSplits(PENDING_SPLIT_MS));
       // Party by party, over what may be many old rows: it ends with the clock's stop.
       if (history && !this.stopped) {
         await step(() => history.sweep({ isStopped: () => this.stopped }));
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index ae499a979cf4477d1f304ec77a13a0d919c125cb..61f270102bd0ec004024dfc394645329b616d472 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -28,7 +28,10 @@ import {
   membersWhere,
   partyWord,
   type Change,
+  type GroupId,
   type MeetupParty,
+  type PartyGroup,
+  type PartyProblem,
   type MeetupPlace,
   type Party,
   type RaidBossRef,
@@ -44,7 +47,14 @@ import { certainMoves, createRaid, setEndTime, setHatchTime } from '../domain/pa
 import { carriedOver, relocatedRaid } from '../domain/party/relocate.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { NewTimedParty } from '../domain/party/timed.js';
-import { createTrain, currentStop } from '../domain/party/train.js';
+import {
+  carriedSplit,
+  createTrain,
+  currentStop,
+  splitOffGroup,
+  splitSettled,
+  splitTrain,
+} from '../domain/party/train.js';
 import { raidEggName } from '../domain/pogo/raid-eggs.js';
 import { EggPictures } from './egg-pictures.js';
 import { postForms, RefusedFiles, sendInForms } from './refused-files.js';
@@ -236,6 +246,44 @@ export type RelocateOutcome =
   /** `party` is the raid in its new place, `from` the party it was, which has ended. */
   | { kind: 'moved'; party: RaidParty; from: RaidParty };
 
+/** A group of a train to be split off into a train of its own (plan 8T). */
+export interface SplitRequest {
+  partyId: string;
+  /** Who splits it off: the maker of the new train. */
+  by: { id: string } & MemberInfo;
+  staff: boolean;
+  group: GroupId;
+  /** Their privacy is Anonymous: the new post names no maker, as for `/train`. */
+  anonymous: boolean;
+  /** The group's mark as a confirmation showed it (`groupMark`); a command draws none. */
+  drawn?: string;
+}
+
+/** What came of splitting a group off a train. */
+export type SplitOutcome =
+  /** There is no such active train. */
+  | { kind: 'gone' }
+  /** Not split, as the train said (`splitOffGroup`): nothing was made. */
+  | { kind: 'refused'; reason: PartyProblem }
+  /** The region of the train has no forum (any more). */
+  | { kind: 'no-forum' }
+  /**
+   * The new post went while it was being made (`NO_POST_MADE`), or the new train ended before
+   * the old one lost the group (its post deleted): nothing was kept.
+   */
+  | { kind: 'no-post' }
+  /**
+   * `party` is the new train with its post, `from` the old one without the group; `group` the
+   * group as it was, `moved` the members who went with it, in the order they signed up.
+   */
+  | {
+      kind: 'split';
+      party: TrainParty;
+      from: TrainParty;
+      group: PartyGroup;
+      moved: readonly string[];
+    };
+
 /** What the party service needs of the region table. */
 export interface SummaryStore {
   setForum(id: number, forumChannelId: string | null): Promise<'set' | 'no-region' | 'forum-taken'>;
@@ -1062,6 +1110,230 @@ export class PartyService {
     return { kind: 'moved', party, from };
   }
 
+  /**
+   * Splits a group off a train into a train of its own (plan 8T): a new train with its post in
+   * the same forum, with the route, stop, mode, boss and times of the old one and the group's
+   * members (`splitTrain`), and the old train without them (`splitOffGroup`). Nobody is in both
+   * trains or in neither once it settles; the old train keeps its post whatever happens; a failure
+   * leaves the old train as it was and no new post behind.
+   *
+   * As a raid's move (`relocate`): the new train is stored (`pending`: `splitFrom.pending`) and
+   * gets its post first; then the old one loses the group inside the store, which decides anew
+   * (the group may be gone or called otherwise by now, `drawn`; the train may have ended; the
+   * member may no longer be allowed; the new train must still be there). When it refuses or has
+   * ended, the new train is taken back (`takeBack`: its post and link line deleted, nothing
+   * recorded) and that is the answer. A refusal that is known before anything is made is
+   * answered at once. Who is in the group at the moment of the old train's change goes: a member
+   * who left the group, or joined it, while the new post was made counts as they are then, and
+   * the new train is made to match (`carriedSplit`), keeping what members did on the new post
+   * meanwhile, and goes on from where the old one was then (its stop, route and times). That
+   * write settles the new train (no longer pending); its history starts there (`partySteps`). One
+   * split of a train at a time; a second finds the group gone.
+   *
+   * A carry-over write that fails is tried once more; when that fails too, the new train is
+   * settled as the old one says (`settleSplit`, logged as an error), and stays pending when that
+   * write fails too. A stop of the process after the new post exists and before the new train is
+   * settled leaves it pending as well; `settlePendingSplits` (at start, and with the clock's
+   * hourly upkeep for one a minute old) settles it when the old train lost the group to it, but
+   * for who is still on the old train as the new one was made with them (they changed group
+   * meanwhile), and when the old train is no longer active; it takes it back while the old train
+   * is active without having lost the group. Then a member who left the train while the new post
+   * was made is on the new one (it was stored with them), and one who joined the group on neither
+   * (they went with the group, and the new train was stored before): the window is a database
+   * write wide.
+   *
+   * No new-train DMs go out (its members know); its region copies, the access to its forum and
+   * the summary follow as for any new party. Lines and the ping of who moved are the caller's
+   * (`TrainService.split`).
+   */
+  splitTrain(request: SplitRequest): Promise<SplitOutcome> {
+    return this.moves.run(request.partyId, () => this.splitNow(request));
+  }
+
+  private async splitNow(request: SplitRequest): Promise<SplitOutcome> {
+    const { store, regions, log } = this.options;
+    const { by, staff, group, drawn } = request;
+    const old = store.get(request.partyId);
+    const oldPost = old?.forumPostId ?? null;
+    if (!old || !isTrain(old) || oldPost === null) return { kind: 'gone' };
+    const id = crypto.randomUUID();
+    // What the old train would say now, before anything is made.
+    const first = splitOffGroup(old, by.id, staff, group, { partyId: id, postId: oldPost }, drawn);
+    if (!first.ok) return { kind: 'refused', reason: first.reason };
+    const region = old.regionId === null ? undefined : regions.byId(old.regionId);
+    const forumId = old.forumChannelId;
+    // The new post goes into the region's forum: only while that is the old train's.
+    if (!region || forumId === null || region.forumChannelId !== forumId) {
+      return { kind: 'no-forum' };
+    }
+    const made = splitTrain(old, {
+      id,
+      by: by.id,
+      anonymous: request.anonymous,
+      group,
+      now: this.now(),
+    });
+    const fresh = noteMember(made, by.id, by);
+    const rendered = this.rendered({ ...fresh, forumChannelId: forumId });
+    try {
+      await store.add(fresh);
+    } catch (err) {
+      if (err instanceof RegionClosedError) return { kind: 'no-forum' };
+      throw err;
+    }
+    // A failure in here ends the new train again and leaves the old one alone.
+    const created = await this.unlessRegionClosed(region, () =>
+      this.createTracked(fresh, region, rendered),
+    );
+    if (created?.kind === 'no-post') return created;
+    if (created?.kind !== 'created' || created.party.forumPostId === null) {
+      return { kind: 'no-forum' };
+    }
+    const link = { partyId: id, postId: created.party.forumPostId };
+
+    // The old train loses the group inside the store: who is in it now is who goes.
+    const seen: {
+      split?: Extract<ReturnType<typeof splitOffGroup>, { ok: true }>;
+      refusal?: PartyProblem;
+      newGone?: true;
+    } = {};
+    let changed;
+    try {
+      changed = await store.update(old.id, (party): { party?: Party } => {
+        // The new train ended meanwhile (its post was deleted): the group stays where it is.
+        if (!store.get(id)) {
+          seen.newGone = true;
+          return {};
+        }
+        const train = asKindOf(old, party);
+        const split = splitOffGroup(train, by.id, staff, group, link, drawn);
+        if (!split.ok) {
+          seen.refusal = split.reason;
+          return split;
+        }
+        seen.split = split;
+        return { ...split, party: noteMember(split.party, by.id, by) };
+      });
+    } catch (err) {
+      await this.takeBack(id);
+      throw err;
+    }
+    const split = seen.split;
+    if (!changed?.written || !split || !changed.party) {
+      await this.takeBack(id);
+      if (seen.newGone) return { kind: 'no-post' };
+      return seen.refusal ? { kind: 'refused', reason: seen.refusal } : { kind: 'gone' };
+    }
+    const from = asKindOf(old, changed.party);
+    const carry = (current: Party) => ({
+      party: splitSettled(
+        carriedSplit(
+          asKindOf(fresh, current),
+          fresh,
+          split.moved,
+          split.conductor,
+          split.was,
+          this.now(),
+        ),
+      ),
+    });
+    let party = created.party;
+    let carried;
+    try {
+      carried = await store.update(id, carry);
+    } catch (err) {
+      log.warn({ err, party: id }, 'could not carry a group over to its train; trying once more');
+      try {
+        carried = await store.update(id, carry);
+      } catch (again) {
+        log.error(
+          { err: again, party: id },
+          'could not carry a group over to its train: it is settled as the old train says',
+        );
+        await this.settleSplit(id);
+      }
+    }
+    if (carried?.party) party = asKindOf(fresh, carried.party);
+    else party = asKindOf(fresh, store.get(id) ?? party);
+    this.changed(from.id);
+    this.changed(id);
+    return { kind: 'split', party, from, group: split.group, moved: Object.keys(split.moved) };
+  }
+
+  /**
+   * Settles the new train of a split that is still pending (`splitFrom.pending`), as the old
+   * train says. While the old train is active and does not list the new one among its splits
+   * (`splitOff`), it never lost the group, and the new one is taken back (`takeBack`: its post
+   * and link line deleted, dropped from the history). When it lists it, the group went, and the
+   * new train is settled with its members as they are on it, but for those still on the old
+   * train as the new one was made with them (`splitSettled` with the old train: they changed
+   * group while the new post was made and stayed). When the old train is no longer active, the
+   * group is on no other train, and the new one is settled as it is. Says which it did; nothing
+   * for a train that is not pending. Never rejects: what fails is logged, and the train stays
+   * pending for the next try (`settlePendingSplits`).
+   */
+  private async settleSplit(partyId: string): Promise<'settled' | 'taken-back' | undefined> {
+    const { store, log } = this.options;
+    const found = store.get(partyId);
+    const party = found && isTrain(found) ? found : undefined;
+    const from = party?.train.splitFrom ?? null;
+    if (!party || from?.pending !== true) return undefined;
+    const oldTrain = (): TrainParty | undefined => {
+      const old = store.get(from.partyId);
+      return old && isTrain(old) ? old : undefined;
+    };
+    const old = oldTrain();
+    if (old && !old.train.splitOff.some((split) => split.partyId === partyId)) {
+      await this.takeBack(partyId);
+      return 'taken-back';
+    }
+    try {
+      await store.update(partyId, (current) => ({
+        // The old train as it is when the new one is written.
+        party: splitSettled(asKindOf(party, current), oldTrain()),
+      }));
+      this.changed(partyId);
+      return 'settled';
+    } catch (err) {
+      log.error({ err, party: partyId }, 'could not settle the new train of a split');
+      return undefined;
+    }
+  }
+
+  /**
+   * Settles the new trains of splits that were left pending (`settleSplit`), each under the lock
+   * of the moves of its old train: by a stop of the process (call once at start, once Discord is
+   * there: taking one back deletes its post), or by writes that failed in the process (the
+   * clock's hourly upkeep asks for those `olderThanMs` a minute: the lock keeps it apart from a
+   * split under way, and the minute only spares it waiting behind one). Logs how many it settled
+   * and took back, when it did any; says how many.
+   */
+  async settlePendingSplits(olderThanMs = 0): Promise<number> {
+    const before = this.now() - olderThanMs;
+    const pending = this.options.store
+      .active()
+      .filter(isTrain)
+      .filter((party) => party.train.splitFrom?.pending === true && party.createdAt <= before);
+    const done: { id: string; outcome: 'settled' | 'taken-back' }[] = [];
+    for (const party of pending) {
+      const outcome = await this.moves.run(party.train.splitFrom?.partyId ?? party.id, () =>
+        this.settleSplit(party.id),
+      );
+      if (outcome !== undefined) done.push({ id: party.id, outcome });
+    }
+    if (done.length > 0) {
+      this.options.log.warn(
+        {
+          parties: done.map((one) => one.id),
+          settled: done.filter((one) => one.outcome === 'settled').length,
+          takenBack: done.filter((one) => one.outcome === 'taken-back').length,
+        },
+        'settled the new trains of splits that were left pending',
+      );
+    }
+    return done.length;
+  }
+
   /**
    * Undoes the new party of a move that did not happen after all: it ends, and its link line,
    * its copies and its post, which is a moment old, are deleted. Never rejects. A party that
diff --git a/src/services/train-service.routes.test.ts b/src/services/train-service.routes.test.ts
index ed840e9084673346dab2027a3cc000ac87652b2c..8cc6badf4212d5a0f686bd100cfe54dc6d4b6e82 100644
--- a/src/services/train-service.routes.test.ts
+++ b/src/services/train-service.routes.test.ts
@@ -365,6 +365,7 @@ describe('TrainService.loadRoute with a route longer than a route may be', () =>
       store: made.store,
       gateway: made.gateway,
       posts: made.service,
+      splits: made.service,
       lines: made.lines,
       users: made.users,
       gyms: {
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index e9c0bb2fcd40b9bfefdeb06322d19f7f2bf08392..681d11c305541fe66e7a5fab6270101e61274cd8 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -9,6 +9,7 @@ import {
   membersWhere,
   refused,
   type Change,
+  type GroupId,
   type PartyProblem,
   type RaidBossRef,
   type TrainAtEnd,
@@ -38,6 +39,7 @@ import { tidyName } from '../domain/party/timed.js';
 import type { Logger } from '../log.js';
 import { gymName, type PostGym } from '../render/raid-post.js';
 import { doer } from '../render/activity.js';
+import { groupWords } from '../render/party-controls.js';
 import { count, LIMITS, memberText, plain, withMentions } from '../render/text.js';
 import { movementText, type Movement } from '../render/train-panel.js';
 import { atEndSentence, atEndSetWords } from '../render/train-words.js';
@@ -45,6 +47,7 @@ import type { Member } from './attendance-service.js';
 import { Gathered } from './gathered.js';
 import { settingsOf, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
+import type { PartyService, SplitOutcome } from './party-service.js';
 import type { PartyStore } from './party-store.js';
 import { gymInGuild, type RegionProvider } from './region-directory.js';
 
@@ -80,6 +83,8 @@ export interface TrainServiceOptions {
   regions: Pick<RegionProvider, 'byChannel'>;
   /** The routes members saved (the table `SavedRoutes`). */
   routes: SavedRouteStorage;
+  /** What makes the train a group becomes, with its post (`PartyService.splitTrain`). */
+  splits: Pick<PartyService, 'splitTrain'>;
   log: Logger;
   now?: () => number;
   /**
@@ -498,6 +503,68 @@ export class TrainService {
     );
   }
 
+  /**
+   * Splits a group off the train into a train of its own (plan 8T; `PartyService.splitTrain`):
+   * for the conductor and staff any group, for a member of the group their own unless the
+   * conductor is in it (`mayNotSplit`). `drawn` is the group's mark as a confirmation showed it
+   * (`groupMark`): refused (`group-changed`) when the group is called otherwise or gone by now;
+   * `anonymous` the member's privacy, for the new train's maker.
+   *
+   * Then each post says who did it, in a line without a link (the links are in the posts' small
+   * print): the old one `<doer> split group B (Fast) off into a train of its own.`, the new one
+   * `<doer> split this train off with group B (Fast).`, which pings the members who moved and
+   * allow it (`mentions`), never the member who split it, once. The doer is named through
+   * `doer`; a maker who asked not to be named is not.
+   */
+  async split(
+    partyId: string,
+    member: Member,
+    staff: boolean,
+    group: GroupId,
+    options: { anonymous?: boolean; drawn?: string } = {},
+  ): Promise<SplitOutcome> {
+    const { splits, lines, store, gateway, users, log } = this.options;
+    const outcome = await splits.splitTrain({
+      partyId,
+      by: member,
+      staff,
+      group,
+      anonymous: options.anonymous ?? false,
+      ...(options.drawn === undefined ? {} : { drawn: options.drawn }),
+    });
+    if (outcome.kind !== 'split') return outcome;
+    const { party, from } = outcome;
+    const words = groupWords(outcome.group);
+    const oldWho = doer(from, member);
+    if (from.forumPostId !== null) {
+      lines.say(
+        from.forumPostId,
+        oldWho
+          ? `${oldWho} split ${words} off into a train of its own.`
+          : `${capitalised(words)} was split off into a train of its own.`,
+      );
+    }
+    const newWho = doer(party, member);
+    const text = newWho
+      ? `${newWho} split this train off with ${words}.`
+      : `This train was split off with ${words}.`;
+    const postId = party.forumPostId;
+    try {
+      const others = outcome.moved.filter(
+        (id) => id !== member.id && store.get(party.id)?.attendees[id] !== undefined,
+      );
+      const settings = await settingsOf(users, others, log);
+      const pingable = others.filter((id) => settings.get(id)?.mentions === true);
+      // A message into the post of a party that has ended would open an archived post again.
+      if (postId !== null && store.get(party.id)) {
+        await gateway.sendMessage(postId, withMentions(text, pingable));
+      }
+    } catch (err) {
+      log.warn({ err, party: party.id }, 'could not say in its post that a train was split off');
+    }
+    return outcome;
+  }
+
   /**
    * Runs an edit of the route that can move the train (its change answers `moved`), and has the
    * others told where the train is when it did.
@@ -841,6 +908,11 @@ export class TrainService {
   }
 }
 
+/** A sentence's first word as a sentence begins it: `group B` → `Group B`. */
+function capitalised(text: string): string {
+  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
+}
+
 /** "X loaded the route **N**", or without a name to say: "The route **N** was loaded". */
 function loadedWords(who: string | undefined, route: string): string {
   if (who) return `${who} loaded ${route}`;
diff --git a/src/services/train-split.test.ts b/src/services/train-split.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9361d2102a367b0db04247f2c2f443d9554067a6
--- /dev/null
+++ b/src/services/train-split.test.ts
@@ -0,0 +1,638 @@
+import { describe, expect, it, vi } from 'vitest';
+import { EAST_CHANNEL, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { leadOf } from '../../test/support/messages.js';
+import { ALICE, asTrain, BOB, CAROL, MINUTE, REPORTER } from '../../test/support/parties.js';
+import { createdTrain, restarted } from '../../test/support/party-service.js';
+import { isTrain, type Party } from '../domain/party/party.js';
+import { groupMark } from '../domain/party/train.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { Member } from './attendance-service.js';
+
+const alice: Member = { id: ALICE, name: 'Alice' };
+const bob: Member = { id: BOB, name: 'Bob' };
+const carol: Member = { id: CAROL, name: 'Carol' };
+const DAVE = '200000000000000005';
+
+/** How long the new post takes to make, in the tests that hold it: the clock moves on. */
+const POST_TIME = 3_000;
+const HOUR = 60 * MINUTE;
+
+type Made = Awaited<ReturnType<typeof createdTrain>>;
+
+/**
+ * A train on stop 2 of 3 with the maker in A and group B (Fast): Alice opened it, Bob is in it
+ * (coming, +1), Carol in A. Everything said so far is cleared.
+ */
+async function fastTrain(route: readonly number[] = [4, 1, 7]): Promise<Made> {
+  const made = await createdTrain({ route });
+  await made.trains.move(made.party.id, { id: REPORTER }, 'next', true);
+  await made.attendance.signUp(made.party.id, carol, PartyStatus.Coming);
+  await made.attendance.newGroup(made.party.id, alice);
+  await made.attendance.labelGroup(made.party.id, alice, 'Fast');
+  await made.attendance.joinGroup(made.party.id, bob, 'B');
+  await made.attendance.changeNumber(made.party.id, bob, 1);
+  await settled(made);
+  for (const message of made.gateway.messagesIn(made.postId)) {
+    await made.gateway.deleteMessage(made.postId, message.id);
+  }
+  return made;
+}
+
+async function settled(made: Made): Promise<void> {
+  await made.attendance.flush();
+  await made.trains.flush();
+  await made.service.flush();
+  await made.access.flush();
+}
+
+/** Holds the creation of the next post until `release` is called. */
+function holdPost(made: Made): { release: () => void; reached: Promise<void> } {
+  let release: () => void = () => undefined;
+  let arrive: () => void = () => undefined;
+  const held = new Promise<void>((resolve) => {
+    release = resolve;
+  });
+  const reached = new Promise<void>((resolve) => {
+    arrive = resolve;
+  });
+  const original = made.gateway.createPost.bind(made.gateway);
+  vi.spyOn(made.gateway, 'createPost').mockImplementation(async (forumId, post) => {
+    arrive();
+    await held;
+    // Making a post takes a moment: the split happens after it was asked for.
+    made.clock.now += POST_TIME;
+    return original(forumId, post);
+  });
+  return { release, reached };
+}
+
+/**
+ * Holds the old train between the new post and its own change: a write of the old train is
+ * held until `release`, and `reached` comes once the split asks to change the old train behind
+ * it (the new train has its post by then). `fresh` gives the new train as it is then.
+ */
+function holdOldTrain(made: Made): {
+  release: () => void;
+  reached: Promise<void>;
+  fresh: () => Party;
+} {
+  let release: () => void = () => undefined;
+  let arrive: () => void = () => undefined;
+  const held = new Promise<void>((resolve) => {
+    release = resolve;
+  });
+  const reached = new Promise<void>((resolve) => {
+    arrive = resolve;
+  });
+  const save = made.storage.save.bind(made.storage);
+  let holding = true;
+  vi.spyOn(made.storage, 'save').mockImplementation(async (party, note) => {
+    if (holding && party.id === made.party.id) {
+      holding = false;
+      await held;
+    }
+    return save(party, note);
+  });
+  // The write that is held: one that changes nothing a member sees.
+  void made.store.update(made.party.id, (party) => ({ party: { ...party } }));
+  const update = made.store.update.bind(made.store);
+  vi.spyOn(made.store, 'update').mockImplementation(
+    (id: string, change: (party: Party) => { party?: Party }) => {
+      if (id === made.party.id) arrive();
+      return update(id, change);
+    },
+  );
+  const fresh = () => {
+    const party = made.store.active().find((one) => one.id !== made.party.id);
+    if (!party) throw new Error('there is no new train');
+    return party;
+  };
+  return { release, reached, fresh };
+}
+
+/** Saves of parties that `when` picks fail, as the database's would; the others are written. */
+function failingSaves(made: Made, when: (party: Party) => boolean): void {
+  const save = made.storage.save.bind(made.storage);
+  vi.spyOn(made.storage, 'save').mockImplementation((party, note) =>
+    when(party) ? Promise.reject(new Error('the database is away')) : save(party, note),
+  );
+}
+
+/** The write that settles the new train of a split: it is no longer pending. */
+const settling = (party: Party) =>
+  isTrain(party) && party.train.splitFrom !== null && party.train.splitFrom.pending !== true;
+
+describe('TrainService.split', () => {
+  it('makes the group a train of its own in the same forum, and the old train goes on without it', async () => {
+    const made = await fastTrain();
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    const fresh = asTrain(made.store.get(outcome.party.id));
+    const old = made.current();
+    expect(fresh).toMatchObject({
+      forumChannelId: WEST_FORUM,
+      regionId: 1,
+      createdById: ALICE,
+      makerName: 'Alice',
+      timed: { name: 'Saturday legendaries (Fast)' },
+      groups: [{ id: 'A', label: 'Fast' }],
+      train: {
+        route: [4, 1, 7],
+        stop: 1,
+        conductorId: ALICE,
+        splitFrom: { partyId: made.party.id, postId: made.postId },
+        splitOff: [],
+      },
+    });
+    expect(Object.keys(fresh.attendees)).toEqual([ALICE, BOB]);
+    expect(fresh.attendees).toMatchObject({
+      [ALICE]: { group: 'A', status: PartyStatus.Coming, name: 'Alice' },
+      [BOB]: { group: 'A', number: 2, name: 'Bob' },
+    });
+    expect(Object.keys(old.attendees)).toEqual([REPORTER, CAROL]);
+    expect(old.groups).toEqual([{ id: 'A' }]);
+    expect(old.train.splitOff).toEqual([
+      { partyId: fresh.id, postId: fresh.forumPostId, group: 'B', label: 'Fast' },
+    ]);
+    expect(outcome.moved).toEqual([ALICE, BOB]);
+    // The new post, with its link line in the region's channel; the old post is still there.
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
+    expect(made.gateway.posts.get(made.postId)?.archived).toBe(false);
+    expect(fresh.regionLinkMessageId).not.toBeNull();
+  });
+
+  it('says in both posts who split what, and pings the members who moved, but not the presser', async () => {
+    const made = await fastTrain();
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    expect(made.said()).toEqual([
+      `**Alice** (<@${ALICE}>) split group B (Fast) off into a train of its own.`,
+    ]);
+    const postId = outcome.party.forumPostId ?? '';
+    const sent = made.gateway.messagesIn(postId).map((message) => message.message);
+    expect(sent).toEqual([
+      {
+        content: `**Alice** (<@${ALICE}>) split this train off with group B (Fast).\n<@${BOB}>`,
+        mention: { users: [BOB] },
+      },
+    ]);
+  });
+
+  it('pings only those who allow mentions', async () => {
+    const made = await fastTrain();
+    made.userSettings.set(BOB, { mentions: false });
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    const [said] = made.gateway.messagesIn(outcome.party.forumPostId ?? '');
+    expect(said?.message).toEqual({
+      content: `**Alice** (<@${ALICE}>) split this train off with group B (Fast).`,
+      mention: { users: [] },
+    });
+  });
+
+  it('names nobody where the presser made the old train and asked not to be named', async () => {
+    const made = await fastTrain();
+    const old = made.current();
+    // The maker, staff here, splits a group they are not in, anonymously.
+    await made.store.update(made.party.id, (party) => ({ party: { ...party, anonymous: true } }));
+    const outcome = await made.trains.split(old.id, { id: REPORTER }, true, 'B', {
+      anonymous: true,
+    });
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    expect(made.said()).toEqual(['Group B (Fast) was split off into a train of its own.']);
+    const [said] = made.gateway.messagesIn(outcome.party.forumPostId ?? '');
+    expect(said?.message.content?.split('\n')[0]).toBe(
+      'This train was split off with group B (Fast).',
+    );
+    expect(asTrain(made.store.get(outcome.party.id))).toMatchObject({
+      anonymous: true,
+      createdById: REPORTER,
+      train: { conductorId: null },
+    });
+  });
+
+  it('tells nobody of a new train: the people in it know', async () => {
+    const made = await fastTrain();
+    await made.newTrains.set('200000000000000009', made.gateway.guildId, true, 1);
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    await made.notify.flush();
+    expect(outcome.kind).toBe('split');
+    expect(made.dms.to('200000000000000009')).toEqual([]);
+    // Who asks to hear of new trains hears of one that is made.
+    await made.service.createTrain({
+      name: 'Another',
+      creatorId: CAROL,
+      regionChannelId: WEST_CHANNEL,
+    });
+    await made.notify.flush();
+    expect(made.dms.to('200000000000000009')).toHaveLength(1);
+  });
+
+  it('copies the new train into the channels of the other regions of its route', async () => {
+    // Gym 8 lies in East.
+    const made = await fastTrain([4, 1, 8]);
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    const leads = made.gateway.messagesIn(EAST_CHANNEL).map((sent) => leadOf(sent.message));
+    expect(leads).toContain(
+      'A raid train that stops in this region. ' +
+        `Sign up here to follow it in its post: <#${outcome.party.forumPostId}>`,
+    );
+  });
+
+  it('refuses before anything is made, as mayNotSplit says', async () => {
+    const made = await fastTrain();
+    expect(await made.trains.split(made.party.id, carol, false, 'B')).toEqual({
+      kind: 'refused',
+      reason: 'not-in-group',
+    });
+    expect(await made.trains.split(made.party.id, alice, false, 'C')).toEqual({
+      kind: 'refused',
+      reason: 'no-such-group',
+    });
+    await settled(made);
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
+    expect(made.store.active()).toHaveLength(1);
+    expect(made.said()).toEqual([]);
+  });
+
+  it('refuses a press drawn for a group that changed since', async () => {
+    const made = await fastTrain();
+    const drawn = groupMark(made.current(), 'B');
+    await made.attendance.labelGroup(made.party.id, alice, 'Slow');
+    expect(await made.trains.split(made.party.id, alice, false, 'B', { drawn })).toEqual({
+      kind: 'refused',
+      reason: 'group-changed',
+    });
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('answers gone for a party that is no train, or no longer there', async () => {
+    const made = await fastTrain();
+    await made.service.end(made.party.id);
+    expect(await made.trains.split(made.party.id, alice, false, 'B')).toEqual({ kind: 'gone' });
+  });
+
+  it('records each train on its own once they end', async () => {
+    const made = await fastTrain();
+    made.history.optIn(1, ALICE);
+    made.clock.now += 5 * MINUTE;
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
+    await made.service.end(outcome.party.id, undefined, { ended: { how: 'clock' } });
+    const [old, fresh] = made.history.records;
+    expect(old).toMatchObject({ partyId: made.party.id, splitFromId: null });
+    expect(old?.attendees.find((one) => one.memberId === ALICE)).toMatchObject({
+      status: null,
+      leftAt: made.clock.now,
+      splitOff: true,
+    });
+    expect(fresh).toMatchObject({
+      partyId: outcome.party.id,
+      splitFromId: made.party.id,
+      createdAt: made.clock.now,
+    });
+    expect(fresh?.attendees.map((one) => one.signedUpAt)).toEqual([made.clock.now, made.clock.now]);
+  });
+
+  it("starts the new train's history at the split, after its post was made, and the group's time on the old one ends then", async () => {
+    const made = await fastTrain();
+    made.history.optIn(1, ALICE);
+    const asked = made.clock.now;
+    const { release, reached } = holdPost(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    release();
+    const outcome = await splitting;
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    const split = asked + POST_TIME;
+    await made.service.end(made.party.id, undefined, { ended: { how: 'clock' } });
+    await made.service.end(outcome.party.id, undefined, { ended: { how: 'clock' } });
+    const [old, fresh] = made.history.records;
+    expect(old?.attendees.find((one) => one.memberId === ALICE)?.leftAt).toBe(split);
+    expect(fresh?.createdAt).toBe(split);
+    expect(fresh?.attendees.map((one) => one.signedUpAt)).toEqual([split, split]);
+    expect(fresh?.stops[0]?.arrivedAt).toBe(split);
+  });
+
+  it('pings everybody of the group when staff split it, and leads neither train anew', async () => {
+    const made = await fastTrain();
+    await made.store.update(made.party.id, (party) =>
+      isTrain(party) ? { party: { ...party, train: { ...party.train, conductorId: CAROL } } } : {},
+    );
+    const outcome = await made.trains.split(made.party.id, { id: DAVE, name: 'Dave' }, true, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    const fresh = asTrain(made.store.get(outcome.party.id));
+    expect(fresh).toMatchObject({ createdById: DAVE, train: { conductorId: null } });
+    expect(made.current().train.conductorId).toBe(CAROL);
+    const [said] = made.gateway.messagesIn(outcome.party.forumPostId ?? '');
+    expect(said?.message.mention).toEqual({ users: [ALICE, BOB] });
+  });
+
+  it("makes no train in another forum than the old train's", async () => {
+    const made = await fastTrain();
+    await made.store.update(made.party.id, (party) => ({
+      party: { ...party, forumChannelId: '900000000000000777' },
+    }));
+    expect(await made.trains.split(made.party.id, alice, false, 'B')).toEqual({
+      kind: 'no-forum',
+    });
+    await settled(made);
+    expect(made.store.active()).toHaveLength(1);
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
+  });
+});
+
+describe('TrainService.split: what fails, and what happens meanwhile', () => {
+  it('leaves the old train as it was and no post behind when the new post cannot be made', async () => {
+    const made = await fastTrain();
+    const before = made.current();
+    made.gateway.failing.set('createPost', new Error('Discord is away'));
+    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
+      'Discord is away',
+    );
+    made.gateway.failing.delete('createPost');
+    await settled(made);
+    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
+    expect(made.current().attendees).toEqual(before.attendees);
+    expect(made.current().groups).toEqual(before.groups);
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
+    expect(made.said()).toEqual([]);
+  });
+
+  it('takes the new train back when the old one refuses at the split, and changes nothing', async () => {
+    const made = await fastTrain();
+    const { release, reached } = holdPost(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    // Alice leaves the train while the new post is made: she may no longer split group B.
+    await made.attendance.leave(made.party.id, alice);
+    release();
+    expect(await splitting).toEqual({ kind: 'refused', reason: 'not-in-group' });
+    await settled(made);
+    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
+    expect(Object.keys(made.current().attendees)).toEqual([REPORTER, CAROL, BOB]);
+    // The post that was a moment old is deleted, and so is its link line.
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
+    expect(
+      made.gateway
+        .messagesIn(WEST_CHANNEL)
+        .filter((sent) => (sent.message.content ?? '').startsWith('New train')),
+    ).toHaveLength(1);
+    // Nothing of the new train is recorded: it never was one.
+    expect(made.history.records).toEqual([]);
+  });
+
+  it('takes the new train back when the old one ended meanwhile', async () => {
+    const made = await fastTrain();
+    const { release, reached } = holdPost(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    await made.service.end(made.party.id);
+    release();
+    expect(await splitting).toEqual({ kind: 'gone' });
+    await settled(made);
+    expect(made.store.active()).toEqual([]);
+    expect(made.gateway.postsIn(WEST_FORUM).filter((post) => !post.archived)).toEqual([]);
+  });
+
+  it('splits a group once: a second press at the same time finds it gone', async () => {
+    const made = await fastTrain();
+    const drawn = groupMark(made.current(), 'B');
+    const [first, second] = await Promise.all([
+      made.trains.split(made.party.id, alice, false, 'B', { drawn }),
+      made.trains.split(made.party.id, bob, false, 'B', { drawn }),
+    ]);
+    await settled(made);
+    expect(first.kind).toBe('split');
+    expect(second).toEqual({ kind: 'refused', reason: 'group-changed' });
+    expect(made.store.active()).toHaveLength(2);
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
+  });
+
+  it('moves who is in the group at the split: a leave and a join meanwhile count', async () => {
+    const made = await fastTrain();
+    const { release, reached } = holdPost(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    await made.attendance.leave(made.party.id, bob);
+    await made.attendance.joinGroup(made.party.id, carol, 'B');
+    release();
+    const outcome = await splitting;
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    const fresh = asTrain(made.store.get(outcome.party.id));
+    expect(Object.keys(fresh.attendees).sort()).toEqual([ALICE, CAROL].sort());
+    expect(Object.keys(made.current().attendees)).toEqual([REPORTER]);
+    expect(outcome.moved).toEqual([CAROL, ALICE]);
+    // Nobody is on both trains, and nobody of the group on neither.
+    for (const id of [ALICE, CAROL]) expect(made.current().attendees[id]).toBeUndefined();
+  });
+
+  it('keeps what a member did on the new post before the old train lost the group', async () => {
+    const made = await fastTrain();
+    const { release, reached, fresh } = holdOldTrain(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    // Bob is here already, and says so on the new post.
+    await made.attendance.signUp(fresh().id, bob, PartyStatus.Present);
+    release();
+    const outcome = await splitting;
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    const train = asTrain(made.store.get(outcome.party.id));
+    expect(train.attendees[BOB]).toMatchObject({ status: PartyStatus.Present, number: 2 });
+    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
+    expect(made.current().attendees[BOB]).toBeUndefined();
+  });
+
+  it('takes the new train back, and leaves the old one as it was, when the new one ends before the split', async () => {
+    const made = await fastTrain();
+    const before = made.current();
+    const { release, reached, fresh } = holdOldTrain(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    const gone = fresh();
+    await made.service.end(gone.id);
+    release();
+    expect(await splitting).toEqual({ kind: 'no-post' });
+    await settled(made);
+    expect(made.store.active().map((party) => party.id)).toEqual([made.party.id]);
+    expect(made.current().attendees).toEqual(before.attendees);
+    expect(made.current().train.splitOff).toEqual([]);
+    expect(made.history.records.map((record) => record.partyId)).not.toContain(gone.id);
+  });
+
+  it('carries the new train to where the old one went while the new post was made', async () => {
+    const made = await fastTrain([4, 1, 7]);
+    const { release, reached } = holdPost(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    await made.trains.move(made.party.id, { id: REPORTER }, 'next', true);
+    await made.trains.addStop(made.party.id, { id: REPORTER }, 9);
+    release();
+    const outcome = await splitting;
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    expect(asTrain(made.store.get(outcome.party.id)).train).toMatchObject({
+      route: [4, 1, 7, 9],
+      stop: 2,
+    });
+  });
+
+  it('tries the carry-over once more when its write fails, and settles the new train', async () => {
+    const made = await fastTrain();
+    let failed = 0;
+    failingSaves(made, (party) => settling(party) && failed++ === 0);
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    const train = asTrain(made.store.get(outcome.party.id));
+    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
+    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
+    expect(failed).toBe(2);
+  });
+
+  it('settles at start a new train whose carry-over failed, when the old train lists it', async () => {
+    const made = await fastTrain();
+    // Every write that would settle the new train fails: it is left pending.
+    failingSaves(made, settling);
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    expect(made.entries.some((entry) => entry.level === 50)).toBe(true);
+    expect(asTrain(made.store.get(outcome.party.id)).train.splitFrom?.pending).toBe(true);
+    vi.restoreAllMocks();
+
+    const again = await restarted(made);
+    expect(await again.service.settlePendingSplits()).toBe(1);
+    const train = asTrain(again.store.get(outcome.party.id));
+    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
+    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
+    expect(made.gateway.posts.get(train.forumPostId ?? '')).toBeDefined();
+    expect(await again.service.settlePendingSplits()).toBe(0);
+  });
+
+  it('settles with the upkeep a new train left pending in the process, once it is a minute old', async () => {
+    const made = await fastTrain();
+    failingSaves(made, settling);
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    vi.restoreAllMocks();
+    const said = () =>
+      made.entries.filter(
+        (entry) => entry.msg === 'settled the new trains of splits that were left pending',
+      );
+    // Younger than a minute: a split may still be under way.
+    expect(await made.service.settlePendingSplits(MINUTE)).toBe(0);
+    expect(said()).toEqual([]);
+    expect(asTrain(made.store.get(outcome.party.id)).train.splitFrom?.pending).toBe(true);
+    // The clock's hourly upkeep settles it.
+    made.clock.now += HOUR;
+    await made.scheduler.tick();
+    await made.scheduler.whenIdle();
+    const train = asTrain(made.store.get(outcome.party.id));
+    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
+    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
+    expect(said()).toHaveLength(1);
+    expect(said()[0]).toMatchObject({ settled: 1, takenBack: 0 });
+  });
+
+  it('logs no settling when a pending train could not be settled', async () => {
+    const made = await fastTrain();
+    failingSaves(made, settling);
+    const outcome = await made.trains.split(made.party.id, alice, false, 'B');
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    // The database is still away for it.
+    expect(await made.service.settlePendingSplits()).toBe(0);
+    expect(made.entries.map((entry) => entry.msg)).not.toContain(
+      'settled the new trains of splits that were left pending',
+    );
+    expect(asTrain(made.store.get(outcome.party.id)).train.splitFrom?.pending).toBe(true);
+  });
+
+  it('settles at start a pending train whose old train has ended without losing the group', async () => {
+    const made = await fastTrain();
+    failingSaves(
+      made,
+      (party) =>
+        (party.id === made.party.id && isTrain(party) && party.train.splitOff.length > 0) ||
+        (party.id !== made.party.id && party.status === 'ended'),
+    );
+    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
+      'the database is away',
+    );
+    await settled(made);
+    const pending = made.store.active().find((party) => party.id !== made.party.id);
+    vi.restoreAllMocks();
+    // The old train ends before the bot starts again: the group is on no train but the new one.
+    await made.service.end(made.party.id);
+    await settled(made);
+
+    const again = await restarted(made);
+    expect(await again.service.settlePendingSplits()).toBe(1);
+    const train = asTrain(again.store.get(pending?.id ?? ''));
+    expect(train.train.splitFrom).toEqual({ partyId: made.party.id, postId: made.postId });
+    expect(Object.keys(train.attendees)).toEqual([ALICE, BOB]);
+  });
+
+  it('settles at start without who changed group on the old train while the new post was made', async () => {
+    const made = await fastTrain();
+    const { release, reached } = holdPost(made);
+    const splitting = made.trains.split(made.party.id, alice, false, 'B');
+    await reached;
+    // Bob goes to group A, then the process stops before the carry-over (every settling fails).
+    await made.attendance.joinGroup(made.party.id, bob, 'A');
+    failingSaves(made, settling);
+    release();
+    const outcome = await splitting;
+    await settled(made);
+    if (outcome.kind !== 'split') throw new Error(outcome.kind);
+    expect(asTrain(made.store.get(outcome.party.id)).train.splitFrom?.pending).toBe(true);
+    vi.restoreAllMocks();
+
+    const again = await restarted(made);
+    expect(await again.service.settlePendingSplits()).toBe(1);
+    expect(Object.keys(asTrain(again.store.get(outcome.party.id)).attendees)).toEqual([ALICE]);
+    expect(asTrain(again.store.get(made.party.id)).attendees[BOB]).toMatchObject({ group: 'A' });
+  });
+
+  it('takes back at start a new train that the old one never lost the group to', async () => {
+    const made = await fastTrain();
+    const before = made.current();
+    // The old train's change fails, and so does ending the new one: a stop in between, as it were.
+    failingSaves(
+      made,
+      (party) =>
+        (party.id === made.party.id && isTrain(party) && party.train.splitOff.length > 0) ||
+        (party.id !== made.party.id && party.status === 'ended'),
+    );
+    await expect(made.trains.split(made.party.id, alice, false, 'B')).rejects.toThrow(
+      'the database is away',
+    );
+    await settled(made);
+    const pending = made.store.active().find((party) => party.id !== made.party.id);
+    expect(pending && isTrain(pending) && pending.train.splitFrom?.pending).toBe(true);
+    vi.restoreAllMocks();
+
+    const again = await restarted(made);
+    expect(await again.service.settlePendingSplits()).toBe(1);
+    await again.service.flush();
+    expect(again.store.active().map((party) => party.id)).toEqual([made.party.id]);
+    expect(asTrain(again.store.get(made.party.id)).attendees).toEqual(before.attendees);
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(1);
+    expect(again.history.records.map((record) => record.partyId)).not.toContain(pending?.id);
+  });
+});
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index 8e0aa925aef0a4297f6caf3fdfbbb2dd4974069d..7b4117731f71571dd41b7f5a518300717e7e4f9c 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -476,6 +476,7 @@ export async function partyServiceWith(
     gyms,
     regions,
     routes,
+    splits: service,
     log,
     now,
     // As for a start time: `trains.flush()` sends what is waiting.
@@ -489,6 +490,7 @@ export async function partyServiceWith(
     attendance,
     routes: trains,
     access,
+    splits: service,
     lines,
     gateway,
     raidBosses,
````

### Task 4: Plan 8T T4: The posts' links, the button, the confirmation

Prototype commit: `bb10bcfaea8f402ba5f3f5040dea0bbaa1a0bce3`

A train's post says in small print, last in its heading after the
boss's facts, where the other trains of a split are (mockup 3, draft
2): "Split off from <post>" and, newest first, "Group B (Fast) went
its own way: <post>", the posts as channel mentions, labels cut and
the oldest lines given up for "...and N more" when the post is too
long. A grey "Split group..." (party:<id>:split) in the row of Move
train... while two groups or more have somebody in them, left out of
copies in other regions like Move train...; the worst case stays
sendable with every copy (40 of 40 components, four groups' details
folded; 44 unfolded).

The private confirmation (mockup 2): one grey container, what becomes
of the group (the new train's name as splitTrain makes it), the same
route and stop, who moves, who leads which train, a menu of the groups
when the member may split more than one, "Split it off" and "Cancel"
(party:<id>:splitgo:<group>:<mark>, splitno, splitpick).

**Files:**

```
 src/commands/parties/in-train.test.ts |   9 ++-
 src/render/mirrors.region.test.ts     |  15 +++-
 src/render/party-controls.ts          |  30 +++++++-
 src/render/party-post.ts              |   7 +-
 src/render/train-post.test.ts         | 119 +++++++++++++++++++++++++++--
 src/render/train-post.ts              |  75 ++++++++++++++----
 src/render/train-split.test.ts        | 223 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/train-split.ts             | 170 +++++++++++++++++++++++++++++++++++++++++
 8 files changed, 621 insertions(+), 27 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/in-train.test.ts src/render/mirrors.region.test.ts src/render/train-post.test.ts src/render/train-split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff bb10bcfaea8f402ba5f3f5040dea0bbaa1a0bce3 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-train-split.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T T4: The posts' links, the button, the confirmation`, the body above and the trailer, staging exactly
  `src/commands/parties/in-train.test.ts src/render/mirrors.region.test.ts src/render/party-controls.ts src/render/party-post.ts src/render/train-post.test.ts src/render/train-post.ts src/render/train-split.test.ts src/render/train-split.ts`.

````diff
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index c5d02981980f7fc4a3bdd44379a80945b8fbcfdb..3d74d376eb89652e4b53aedde80d9bea595eec92 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -272,8 +272,13 @@ describe('the attendance commands in the post of a train', () => {
       { name: 'Group A (1)', value: 'A' },
       { name: 'Group B: by car (2)', value: 'B' },
     ]);
-    // The post has a Join beside each group now.
-    expect(buttonLabels(await made.shown()).slice(0, 3)).toEqual(['Move train…', 'A', 'B']);
+    // The post has a Join beside each group now, and a group can be split off.
+    expect(buttonLabels(await made.shown()).slice(0, 4)).toEqual([
+      'Move train…',
+      'Split group…',
+      'A',
+      'B',
+    ]);
     for (let n = 0; n < 3; n++) await made.run('group', {}, { subcommand: 'new' });
     expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
       'A train cannot have more than five groups.',
diff --git a/src/render/mirrors.region.test.ts b/src/render/mirrors.region.test.ts
index 6b1d07ee9daee674fbddd42729b5b6c0e5fc3b44..32f97d4202d0e4a3a1f229b8bc28802942ee892a 100644
--- a/src/render/mirrors.region.test.ts
+++ b/src/render/mirrors.region.test.ts
@@ -2,7 +2,14 @@ import { describe, expect, it } from 'vitest';
 import { catalogueFixture } from '../../test/support/game-data.js';
 import { testGyms } from '../../test/support/gyms.js';
 import { buttonsOf, copiedPost, leadOf, textDisplays } from '../../test/support/messages.js';
-import { PARTY_NOW, PARTY_ZONE, testRaid, testTrain } from '../../test/support/parties.js';
+import {
+  ALICE,
+  PARTY_NOW,
+  PARTY_ZONE,
+  testRaid,
+  testTrain,
+  withAttendees,
+} from '../../test/support/parties.js';
 import { decodeCustomId } from '../discord/custom-id.js';
 import type { OutgoingMessage } from '../discord/party-gateway.js';
 import type { TrainParty } from '../domain/party/party.js';
@@ -13,7 +20,8 @@ import { renderTrainPost } from './train-post.js';
 const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
 const emoji = { shiny: '✨', remote: '🛰️', teams };
 const gyms = new Map(testGyms().map((gym) => [gym.id, gym]));
-const base = testTrain();
+// Somebody in each group: a group can be split off.
+const base = withAttendees(testTrain(), { [ALICE]: { group: 'B' } });
 const train: TrainParty = {
   ...base,
   groups: [{ id: 'A' }, { id: 'B' }],
@@ -49,9 +57,10 @@ describe('renderMirror for the channel of a region a train stops in', () => {
     );
   });
 
-  it('has the controls of the post without the button that moves the train', () => {
+  it('has the controls of the post without the buttons that move or split the train', () => {
     expect(actions(rendered.message)).toEqual([
       'move',
+      'split',
       'group',
       'group',
       'maybe',
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index a552e59775add79a0e6e553800ca8e3f8f6b798f..f1b97b921584fcc1f7be4cf5a2e5aeea5a79a333 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -31,7 +31,9 @@ export const PARTY_KIND = 'party';
  * "Move train…" of a train's post, which opens the panel whose buttons are `next`, `previous`,
  * `skip` and `finish` (`train-panel.ts`). `route` is "Whole route" of a train's post, which
  * shows the route privately. `shot` is "Screenshot feedback" of a raid reported from a
- * screenshot, which shows that screenshot privately.
+ * screenshot, which shows that screenshot privately. `split` is "Split group…" of a train with
+ * two groups or more, which opens the private confirmation (`train-split.ts`) whose controls are
+ * `splitgo` (`<group>:<mark>`), `splitno` and the menu `splitpick`.
  */
 export const PARTY_ACTIONS = [
   'maybe',
@@ -55,6 +57,10 @@ export const PARTY_ACTIONS = [
   'atend',
   'route',
   'shot',
+  'split',
+  'splitgo',
+  'splitno',
+  'splitpick',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
@@ -219,6 +225,28 @@ export function wholeRouteButton(party: Pick<Party, 'id'>): PostButton {
 /** The label of the button of a train's post that shows its whole route. */
 export const WHOLE_ROUTE_LABEL = 'Whole route';
 
+/**
+ * The button "Split group…" of a train's post with two groups or more (plan 8T): the private
+ * confirmation of splitting a group off into a train of its own. A copy for another region
+ * leaves it out, as it leaves out Move train… (`moves`).
+ */
+export function splitGroupButton(party: Pick<Party, 'id'>): PostButton {
+  return {
+    button: partyButton(
+      party.id,
+      'split',
+      SPLIT_GROUP_LABEL,
+      ButtonStyle.Secondary,
+      undefined,
+      '✂️',
+    ),
+    moves: true,
+  };
+}
+
+/** The label of the button of a train's post that splits a group off. */
+export const SPLIT_GROUP_LABEL = 'Split group…';
+
 export interface BottomOptions {
   /**
    * The party shows several groups: their sections carry their Join ("A", "B"), so the buttons of
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 3d2da272582774124ff16d10cff2574a4e675e6b..ec34653346bffcbf134699d0ffdc69600c899b4a 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -196,9 +196,10 @@ export const TEXT_BUDGET = 4_000;
 export const LEAD_ROOM = 200;
 
 /**
- * A button of a post. `moves` marks the one that moves a train ("Move train…"), which a copy for
- * the members of another region leaves out. `plain` is the emoji a button with a custom one
- * shows instead where Discord refuses that (`customEmoji: false`, plan 8D-G).
+ * A button of a post. `moves` marks those of a train that are for its own post ("Move train…",
+ * "Split group…"), which a copy for the members of another region leaves out. `plain` is the
+ * emoji a button with a custom one shows instead where Discord refuses that (`customEmoji:
+ * false`, plan 8D-G).
  */
 export interface PostButton {
   button: APIButtonComponent;
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index f69ca28baf5184c5d27aa240014df7432f590840..99943bf517b880e0e97fa25a226b73087b664cce 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -41,6 +41,7 @@ import { decodeCustomId } from '../discord/custom-id.js';
 import {
   endParty,
   MAX_ROUTE_STOPS,
+  MAX_SPLITS_KEPT,
   TRAIN_AT_END,
   type Attendee,
   type TrainAtEnd,
@@ -139,6 +140,22 @@ const ahead = (party: TrainParty, extra: Partial<TrainPostView> = {}): string |
 /** A route of seven gyms, 1 to 7. */
 const SEVEN = [1, 2, 3, 4, 5, 6, 7];
 
+/**
+ * A train split off another, with as many groups split off it as it keeps, each with a label
+ * of 100 of this character: the longest small print of splits.
+ */
+function everySplit(character: string): Pick<TrainDetails, 'splitFrom' | 'splitOff'> {
+  return {
+    splitFrom: { partyId: '00000000-0000-4000-8000-0000000000aa', postId: '910000000000000001' },
+    splitOff: Array.from({ length: MAX_SPLITS_KEPT }, (_, n) => ({
+      partyId: `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`,
+      postId: `9200000000000000${String(n).padStart(2, '0')}`,
+      group: 'B' as const,
+      label: character.repeat(100),
+    })),
+  };
+}
+
 const NO_TIME =
   'No time has been set yet: `/meet` sets the start. Without one this post is archived ' +
   `${stamp(PARTY_NOW + (24 * 60 + 65) * MINUTE, 'R')}.`;
@@ -219,6 +236,49 @@ describe('renderTrainPost', () => {
     expect(lines(onRoute([4])).some((line) => line.startsWith('Conductor'))).toBe(false);
   });
 
+  it('says in its small print where the groups split off it went, newest first, and where it came from', () => {
+    const NEW = '910000000000000002';
+    const NEWER = '910000000000000003';
+    const OLD = '910000000000000001';
+    const train = onRoute([4], 0, {
+      conductorId: ALICE,
+      splitFrom: { partyId: '00000000-0000-4000-8000-0000000000aa', postId: OLD },
+      splitOff: [
+        { partyId: '00000000-0000-4000-8000-0000000000cc', postId: NEWER, group: 'C' },
+        {
+          partyId: '00000000-0000-4000-8000-0000000000bb',
+          postId: NEW,
+          group: 'B',
+          label: 'Fast *and* furious',
+        },
+      ],
+    });
+    expect(lines(train).slice(-4)).toEqual([
+      `Conductor: <@${ALICE}>`,
+      `-# Split off from <#${OLD}>`,
+      `-# Group C went its own way: <#${NEWER}>`,
+      `-# Group B (Fast \\*and\\* furious) went its own way: <#${NEW}>`,
+    ]);
+    // A train neither split from nor off another says nothing of it.
+    expect(lines(onRoute([4])).some((line) => line.startsWith('-#'))).toBe(false);
+  });
+
+  it('puts the small print of splits last in the heading, after the boss (mockup 3)', () => {
+    const OLD = '910000000000000001';
+    const train: TrainParty = {
+      ...onRoute([4], 0, {
+        boss: { key: 'yveltal' },
+        splitFrom: { partyId: '00000000-0000-4000-8000-0000000000aa', postId: OLD },
+      }),
+      saved: true,
+    };
+    const heading = lines(train);
+    const at = heading.indexOf(`-# Split off from <#${OLD}>`);
+    expect(at).toBeGreaterThan(heading.findIndex((line) => line.startsWith('**Catch CP**')));
+    expect(at).toBeGreaterThan(heading.indexOf(KEPT_OPEN));
+    expect(heading.at(-1)).toBe(`-# Split off from <#${OLD}>`);
+  });
+
   it('says where the train is as a raid says its gym, with the number of the stop', () => {
     const post = renderTrainPost(view(onRoute(SEVEN, 3)));
     expect(where(onRoute(SEVEN, 3))).toBe(
@@ -463,6 +523,7 @@ describe('renderTrainPost', () => {
     );
     expect(buttonNames(post.message)).toEqual([
       'Move train…',
+      'Split group…',
       'A',
       'B',
       '🤔',
@@ -519,7 +580,7 @@ describe('renderTrainPost', () => {
         onRoute(
           Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1),
           30,
-          { boss: { key: 'yveltal' }, conductorId: CAROL },
+          { boss: { key: 'yveltal' }, conductorId: CAROL, ...everySplit('l') },
         ),
         crowd,
       ),
@@ -533,8 +594,9 @@ describe('renderTrainPost', () => {
     expect(componentCount(post.message)).toBe(MAX_COMPONENTS);
     expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
     expectSendable(post);
-    // Five groups' trainers each under their heading would be three components too many: the
-    // last three groups' go back beside their Join (`postMessage`), and the stop keeps its picture.
+    // Five groups' trainers each under their heading would be four components too many with
+    // Split group… (plan 8T): the last four groups' go back beside their Join (`postMessage`),
+    // and the stop keeps its picture.
     expect(thumbnailBeside(post.message, '**Where')).toBe(
       `https://lh3.googleusercontent.com/${'p'.repeat(200)}=s400`,
     );
@@ -542,11 +604,17 @@ describe('renderTrainPost', () => {
       ({ button }) => button !== undefined && /^[A-E]$/.test(button),
     );
     expect(groupParts.map(({ text }) => text.split('\n').length > 1)).toEqual([
-      false,
       false,
       true,
       true,
       true,
+      true,
+    ]);
+    // Split group… is there too: five groups.
+    expect(buttonLabels(post.message).slice(0, 3)).toEqual([
+      'Move train…',
+      'Whole route',
+      'Split group…',
     ]);
     // Where it is and the next two stops, however long the route.
     expect(block(post, '**Where')).toMatch(/^\*\*Where · stop 31 of 50\*\*\n\*\*Long gym name /);
@@ -601,7 +669,7 @@ describe('the longest train that can be', () => {
         onRoute(
           Array.from({ length: MAX_ROUTE_STOPS }, (_, index) => index + 1),
           30,
-          { boss: { key: 'yveltal' }, conductorId: CAROL },
+          { boss: { key: 'yveltal' }, conductorId: CAROL, ...everySplit('*') },
         ),
         { ...crowd, [CAROL]: { name: '*'.repeat(32) } },
       ),
@@ -617,6 +685,9 @@ describe('the longest train that can be', () => {
     expectSendable(post);
     // The trainers are still named, cut down with a count.
     expect(textOf(post.message)).toMatch(/…and \d+ more/);
+    // So are the trains split off it, and the one it was split off from.
+    expect(textOf(post.message)).toMatch(/-# Group B \(\\\*.*\) went its own way: <#92/u);
+    expect(textOf(post.message)).toContain('-# Split off from <#910000000000000001>');
     // With the longest words of a mode, at the last stop.
     for (const atEnd of ['loop', 'turn-back'] as const) {
       const last: TrainParty = {
@@ -711,6 +782,44 @@ describe('the controls of a train post', () => {
     ]);
   });
 
+  it('have a grey "Split group…" in the row of Move train… only with two groups of somebody', () => {
+    const two: TrainParty = {
+      ...withAttendees(onRoute(SEVEN, 2), { [ALICE]: { group: 'B' } }),
+      groups: [{ id: 'A' }, { id: 'B' }],
+    };
+    expect(controls(two).slice(0, 3)).toEqual([
+      ['Move train…', 'move'],
+      ['Whole route', 'route'],
+      ['Split group…', 'split'],
+    ]);
+    const split = buttonsOf(renderTrainPost(view(two)).message)[2];
+    expect(split?.style).toBe(2);
+    expect(split?.emoji).toBe('✂️');
+    expect(decodeCustomId(split?.customId ?? '')).toEqual({
+      kind: 'party',
+      id: two.id,
+      action: 'split',
+      args: [],
+    });
+    expect(controls(onRoute(SEVEN, 2)).map(([, action]) => action)).not.toContain('split');
+    // Two groups, but one of them empty: there is nothing to split from (Matt, 2026-10-17).
+    const lone: TrainParty = { ...onRoute(SEVEN, 2), groups: [{ id: 'A' }, { id: 'B' }] };
+    expect(controls(lone).map(([, action]) => action)).not.toContain('split');
+    const whole: TrainParty = {
+      ...withAttendees(onRoute(SEVEN, 2), { [ALICE]: { group: 'B' } }),
+      attendees: { [ALICE]: { number: 1, status: PartyStatus.Coming, group: 'B', remote: false } },
+      groups: [{ id: 'A' }, { id: 'B' }],
+    };
+    expect(controls(whole).map(([, action]) => action)).not.toContain('split');
+    // Not on a copy in another region, as Move train…; the copy keeps Whole route.
+    const copy = renderMirror('region', renderTrainPost(view(two)), {
+      postId: '900000000000000001',
+      regionChannelId: '100000000000000001',
+    });
+    expect(buttonsOf(copy).map((button) => button.label)).not.toContain('Split group…');
+    expect(buttonsOf(copy).map((button) => button.label)).toContain('Whole route');
+  });
+
   it('are the same wherever the train is and whoever leads it', () => {
     const base = controls(onRoute([4, 1]));
     expect(controls(onRoute([4, 1], 2, { conductorId: ALICE }))).toEqual(base);
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index 5f796cdbbeb80393efc65416ac06d423e990ed92..b8aca479550ed7363797a51e819b53a3e5e647bf 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -1,13 +1,19 @@
-import { memberOf, type TrainParty } from '../domain/party/party.js';
+import { memberOf, type SplitOff, type TrainParty } from '../domain/party/party.js';
 import { nameOf } from '../domain/party/timed.js';
 import {
   currentStop,
   routeAhead,
   routeFinished,
+  splitsPossible,
   WHOLE_ROUTE_STOPS,
 } from '../domain/party/train.js';
 import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
-import { bottomControls, moveTrainButton, wholeRouteButton } from './party-controls.js';
+import {
+  bottomControls,
+  moveTrainButton,
+  splitGroupButton,
+  wholeRouteButton,
+} from './party-controls.js';
 import {
   cutText,
   ENDED_COLOUR,
@@ -218,12 +224,52 @@ function trainWhere(view: TrainPostView, fit: Fit): PostBlock[] {
         [
           moveTrainButton(party),
           ...(route.length > WHOLE_ROUTE_STOPS ? [wholeRouteButton(party)] : []),
+          // Plan 8T: only while there is a group to split off from another with somebody in it.
+          ...(splitsPossible(party) ? [splitGroupButton(party)] : []),
         ],
       ],
     },
   ];
 }
 
+/** The room the small print of a train's splits may take. */
+const SPLITS_ROOM = 1_000;
+
+/**
+ * Where the other trains of a split are, in small print under the heading (plan 8T; mockup 3,
+ * draft 2): `Split off from <post>` on a train that was split off another, and on a train that
+ * groups were split off, `Group B (Fast) went its own way: <post>` for each, newest first. The
+ * posts are channel mentions, which Discord shows by the post's current title, in the post and in
+ * its copies alike, also once that train has ended (the archived post is still there). When the
+ * post is too long, the labels are cut, then the oldest lines give way to `…and N more`
+ * (`fit.part`).
+ */
+function splitLines(party: TrainParty, fit: Fit): string[] {
+  const { splitFrom, splitOff } = party.train;
+  const from = splitFrom === null ? [] : [`-# Split off from <#${splitFrom.postId}>`];
+  if (splitOff.length === 0) return from;
+  const line = (split: SplitOff, labelRoom: number): string => {
+    const label = split.label === undefined ? '' : ` (${cutText(plain(split.label), labelRoom)})`;
+    return `-# Group ${split.group}${label} went its own way: <#${split.postId}>`;
+  };
+  const shownAs = (shown: number, labelRoom: number): string => {
+    const left = splitOff.length - shown;
+    const lines = splitOff.slice(0, shown).map((split) => line(split, labelRoom));
+    return [...lines, ...(left > 0 ? [`-# …and ${left} more`] : [])].join('\n');
+  };
+  const text = fit.part((room) => {
+    const limit = Math.min(room, SPLITS_ROOM);
+    for (let shown = splitOff.length; shown >= 1; shown--) {
+      for (const labelRoom of [Infinity, 40, 10]) {
+        const lines = shownAs(shown, labelRoom);
+        if (lines.length <= limit) return lines;
+      }
+    }
+    return shownAs(1, 1);
+  });
+  return [...from, text];
+}
+
 function colour(view: TrainPostView): number {
   return view.closed !== undefined || shownAsOver(view.party, view.now)
     ? ENDED_COLOUR
@@ -245,21 +291,24 @@ function afterLine(view: TrainPostView): string[] {
 function trainLayout(view: TrainPostView): PostLayout {
   const { party, boss } = view;
   const { conductorId } = party.train;
-  const header = [
-    `### Raid Train: ${plain(nameOf(party))}`,
-    ...afterLine(view),
-    view.closed ?? describeTimes(view),
-    ...(conductorId === null ? [] : [`Conductor: ${memberName(memberOf(party, conductorId))}`]),
-    // Not in the last showing of a train that was closed: that post is archived.
-    ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
-    // A train is after the boss as raids have it: the CP of a shadow raid is not asked for.
-    ...(boss?.entry ? bossFacts(view.catalogue, boss.entry, false, view.emoji) : []),
-  ].join('\n');
+  const header = (fit: Fit): string =>
+    [
+      `### Raid Train: ${plain(nameOf(party))}`,
+      ...afterLine(view),
+      view.closed ?? describeTimes(view),
+      ...(conductorId === null ? [] : [`Conductor: ${memberName(memberOf(party, conductorId))}`]),
+      // Not in the last showing of a train that was closed: that post is archived.
+      ...(party.saved && view.closed === undefined ? [KEPT_OPEN] : []),
+      // A train is after the boss as raids have it: the CP of a shadow raid is not asked for.
+      ...(boss?.entry ? bossFacts(view.catalogue, boss.entry, false, view.emoji) : []),
+      // Last in the heading, after the boss (mockup 3).
+      ...splitLines(party, fit),
+    ].join('\n');
   return fittedLayout((fit) => ({
     accent: colour(view),
     ...(boss?.image === undefined ? {} : { picture: boss.image }),
     blocks: [
-      { type: 'section', content: header, accessory: 'picture' },
+      { type: 'section', content: header(fit), accessory: 'picture' },
       { type: 'separator' },
       ...trainWhere(view, fit),
       { type: 'separator' },
diff --git a/src/render/train-split.test.ts b/src/render/train-split.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..210c64c6a91b3801212b0d44f03468fe163a7a97
--- /dev/null
+++ b/src/render/train-split.test.ts
@@ -0,0 +1,223 @@
+import { ComponentType, type APIStringSelectComponent } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { testGyms } from '../../test/support/gyms.js';
+import {
+  accentOf,
+  allComponents,
+  buttonsOf,
+  selectsOf,
+  textDisplays,
+} from '../../test/support/messages.js';
+import {
+  ALICE,
+  BOB,
+  CAROL,
+  PARTY_NOW,
+  REPORTER,
+  testTrain,
+  withAttendees,
+} from '../../test/support/parties.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import { decodeCustomId } from '../discord/custom-id.js';
+import type { Attendee, PartyGroup, TrainDetails, TrainParty } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { groupMark } from '../domain/party/train.js';
+import type { PostGym } from './raid-post.js';
+import { TRAIN_PANEL_COLOUR } from './train-panel.js';
+import { splitConfirmation, splitNote, type SplitView } from './train-split.js';
+
+const HOUR = 3_600_000;
+const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
+const DAVE = '200000000000000005';
+
+/**
+ * "Saturday legendaries" on stop 2 of 3 (4, 1, 7), the maker in A with Carol, group B (Fast)
+ * with Alice (named Dawn) and Bob (named Iris).
+ */
+function train(more: Partial<TrainDetails> = {}, groups?: PartyGroup[]): TrainParty {
+  const made = withAttendees(testTrain(), {
+    [CAROL]: { name: 'Carol' },
+    [ALICE]: { group: 'B', name: 'Dawn' },
+    [BOB]: { group: 'B', name: 'Iris' },
+  });
+  return {
+    ...made,
+    forumChannelId: '900000000000000001',
+    forumPostId: '910000000000000001',
+    groups: groups ?? [{ id: 'A' }, { id: 'B', label: 'Fast' }],
+    defaultGroupId: 'B',
+    train: { ...made.train, route: [4, 1, 7], stop: 1, ...more },
+  };
+}
+
+function view(party: TrainParty, extra: Partial<SplitView> = {}): SplitView {
+  return {
+    party,
+    gym: (id) => gyms.get(id),
+    memberId: ALICE,
+    staff: false,
+    group: 'B',
+    now: PARTY_NOW,
+    ...extra,
+  };
+}
+
+const textOf = (party: TrainParty, extra: Partial<SplitView> = {}, note?: string): string =>
+  textDisplays(splitConfirmation(view(party, extra), note)).join('\n');
+
+describe('splitConfirmation', () => {
+  it('asks in one grey container: what becomes of the group, who moves, who leads', () => {
+    const message = splitConfirmation(view(train({ conductorId: CAROL })));
+    expect(accentOf(message)).toBe(TRAIN_PANEL_COLOUR);
+    expect(textDisplays(message)).toEqual([
+      [
+        '### Split a group off the train',
+        'Group **B (Fast)** leaves **Saturday legendaries** and becomes a train of its own, ' +
+          '**Saturday legendaries (Fast)**:',
+        '- the same route, at the same stop (stop 2 of 3: The Stacks), the same end mode, ' +
+          'boss and start',
+        '- Dawn and Iris move to it as they are signed up now',
+        '- you are its conductor; Carol stays the conductor of Saturday legendaries',
+      ].join('\n'),
+    ]);
+    // Only one group to split: no menu.
+    expect(selectsOf(message)).toEqual([]);
+    const buttons = buttonsOf(message);
+    expect(buttons.map((button) => [button.label, button.emoji, button.style])).toEqual([
+      ['Split it off', '✂️', 4],
+      ['Cancel', undefined, 2],
+    ]);
+    const party = train({ conductorId: CAROL });
+    expect(buttons.map((button) => decodeCustomId(button.customId ?? ''))).toEqual([
+      {
+        kind: 'party',
+        id: party.id,
+        action: 'splitgo',
+        args: ['B', groupMark(party, 'B')],
+      },
+      { kind: 'party', id: party.id, action: 'splitno', args: [] },
+    ]);
+  });
+
+  it('says where the train is as it is: no route, finished, not started yet', () => {
+    expect(textOf(train({ route: [], stop: 0 }))).toContain(
+      '- no route yet, the same end mode, boss and start',
+    );
+    expect(textOf(train({ stop: 3 }))).toContain(
+      '- the same route, finished, the same end mode, boss and start',
+    );
+    const waiting = {
+      ...train(),
+      timed: { name: 'Saturday legendaries', startTime: PARTY_NOW + HOUR },
+    };
+    expect(textOf(waiting)).toContain(
+      '- the same route, at the same stop (stop 2 of 3: The Stacks), not started yet, ' +
+        'the same end mode, boss and start',
+    );
+  });
+
+  it('names who leads each train afterwards', () => {
+    // The conductor goes with the group.
+    expect(textOf(train({ conductorId: ALICE }))).toContain(
+      '- you are its conductor, and Saturday legendaries has none then',
+    );
+    expect(textOf(train({ conductorId: BOB }), { memberId: BOB })).toContain(
+      '- you are its conductor, and Saturday legendaries has none then',
+    );
+    // No conductor anywhere: the presser in the group leads the new one.
+    expect(textOf(train())).toContain('- you are its conductor');
+    // The conductor of the old train splits a group they are not in.
+    expect(textOf(train({ conductorId: CAROL }), { memberId: CAROL })).toContain(
+      '- it has no conductor; you stay the conductor of Saturday legendaries',
+    );
+    // Staff, with the conductor in the group.
+    expect(textOf(train({ conductorId: BOB }), { memberId: DAVE, staff: true })).toContain(
+      '- Iris is its conductor, and Saturday legendaries has none then',
+    );
+  });
+
+  it('says it of a group without a label by its letter', () => {
+    const text = textOf(train({}, [{ id: 'A' }, { id: 'B' }]));
+    expect(text).toContain(
+      'Group **B** leaves **Saturday legendaries** and becomes a train of its own, ' +
+        '**Saturday legendaries (B)**:',
+    );
+  });
+
+  it('offers a menu of the groups when the member may split more than one, the chosen one first chosen', () => {
+    const party = train({ conductorId: CAROL }, [
+      { id: 'A' },
+      { id: 'B', label: 'Fast' },
+      { id: 'C' },
+    ]);
+    const withC = withAttendees(party, { [DAVE]: { group: 'C' } });
+    const message = splitConfirmation(view(withC, { memberId: CAROL }));
+    const menu = allComponents(message).find(
+      (component): component is APIStringSelectComponent =>
+        (component as { type?: unknown }).type === ComponentType.StringSelect,
+    );
+    expect(decodeCustomId(menu?.custom_id ?? '')).toEqual({
+      kind: 'party',
+      id: party.id,
+      action: 'splitpick',
+      args: [],
+    });
+    expect(menu?.options.map((option) => [option.label, option.value, option.default])).toEqual([
+      ['Group A · 2 trainers', 'A', false],
+      ['Group B (Fast) · 2 trainers', 'B', true],
+      ['Group C · 1 trainer', 'C', false],
+    ]);
+  });
+
+  it('puts why a press did nothing above the question', () => {
+    expect(textOf(train(), {}, 'The groups of this train changed meanwhile.')).toMatch(
+      /^### Split a group off the train\nThe groups of this train changed meanwhile\.\nGroup /u,
+    );
+  });
+
+  it('cuts a long list of who moves', () => {
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 30; n++) {
+      crowd[`4${String(n).padStart(17, '0')}`] = { group: 'B', name: `Trainer ${n}` };
+    }
+    const text = textOf(withAttendees(train(), crowd));
+    expect(text).toMatch(/- Dawn, Iris, Trainer 0, .+, and \d+ more move to it/u);
+  });
+
+  it('keeps within what Discord takes with the longest texts that need escaping', () => {
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 400; n++) {
+      crowd[`4${String(n).padStart(17, '0')}`] = {
+        group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5] ?? 'A',
+        name: '*'.repeat(32),
+        status: PartyStatus.Coming,
+      };
+    }
+    const heavy = (id: number): PostGym => ({
+      name: `${'[*]'.repeat(84)}${id}`,
+      nickname: null,
+      lat: 40,
+      lon: -80,
+      notice: null,
+      taggedEx: false,
+      confirmedEx: false,
+    });
+    const party: TrainParty = {
+      ...withAttendees(train({ conductorId: REPORTER }), crowd),
+      timed: { name: '*'.repeat(80), startTime: PARTY_NOW + HOUR },
+      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id, label: '*'.repeat(100) })),
+    };
+    const message = splitConfirmation({ ...view(party, { memberId: REPORTER }), gym: heavy }, 'x');
+    expectV2Sendable(message);
+    expect(selectsOf(message)).toHaveLength(1);
+  });
+});
+
+describe('splitNote', () => {
+  it('says only something, without controls', () => {
+    const note = splitNote('Nothing was split off.');
+    expect(textDisplays(note)).toEqual(['Nothing was split off.']);
+    expect(buttonsOf(note)).toEqual([]);
+    expect(accentOf(note)).toBe(TRAIN_PANEL_COLOUR);
+  });
+});
diff --git a/src/render/train-split.ts b/src/render/train-split.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6074e892bde689663f788cfa45994a783af7abf1
--- /dev/null
+++ b/src/render/train-split.ts
@@ -0,0 +1,170 @@
+import { ButtonStyle, ComponentType, type APIStringSelectComponent } from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import {
+  groupOf,
+  headCount,
+  memberOf,
+  membersWhere,
+  type GroupId,
+  type PartyGroup,
+} from '../domain/party/party.js';
+import { nameOf } from '../domain/party/timed.js';
+import {
+  currentStop,
+  groupMark,
+  routeFinished,
+  splitTrain,
+  splittableGroups,
+} from '../domain/party/train.js';
+import { PARTY_KIND, partyButton } from './party-controls.js';
+import { inShownOrder } from './party-post.js';
+import { gymName } from './raid-post.js';
+import { count, memberName, plain, truncate } from './text.js';
+import type { TrainPlaces } from './train-post.js';
+import { TRAIN_PANEL_COLOUR } from './train-panel.js';
+import { actionRow, container, menuRow, textDisplay } from './v2.js';
+
+/** What the confirmation of a split is drawn from: the train, who asks, and the group. */
+export interface SplitView extends TrainPlaces {
+  /** The member who asks: the confirmation speaks to them. */
+  memberId: string;
+  staff: boolean;
+  /** The group it asks about; the train has it, and the member may split it off. */
+  group: GroupId;
+  now: number;
+}
+
+/** The confirmation names this many of those who move, and how many more. */
+const NAMES_SHOWN = 10;
+
+/** `Dawn`, `Dawn and Iris`, `Dawn, Iris and Cilan`, `Dawn, …, and 12 more`. */
+function nameList(names: readonly string[]): string {
+  if (names.length <= 1) return names.join('');
+  if (names.length <= NAMES_SHOWN) {
+    return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
+  }
+  return `${names.slice(0, NAMES_SHOWN).join(', ')}, and ${names.length - NAMES_SHOWN} more`;
+}
+
+/** `B (Fast)` of a group with a label, `B` of one without. */
+function groupName(group: PartyGroup): string {
+  return group.label ? `${group.id} (${plain(group.label)})` : group.id;
+}
+
+/** Where the train is, for the first point: the new train is where it is. */
+function wherePoint(view: SplitView): string {
+  const { party } = view;
+  const { route, stop } = party.train;
+  const rest = 'the same end mode, boss and start';
+  if (route.length === 0) return `- no route yet, ${rest}`;
+  if (routeFinished(party)) return `- the same route, finished, ${rest}`;
+  const at = currentStop(party);
+  const gym = plain(gymName(at === undefined ? undefined : view.gym(at)));
+  const start = party.timed.startTime;
+  const waiting = start !== null && start > view.now ? ', not started yet' : '';
+  return (
+    `- the same route, at the same stop (stop ${stop + 1} of ${route.length}: ${gym})` +
+    `${waiting}, ${rest}`
+  );
+}
+
+/**
+ * Who leads each train afterwards, as `splitTrain` decides it (`conductor` of the new train):
+ * `you are its conductor; Ash stays the conductor of Saturday Loop`, and when the conductor goes
+ * with the group, `…, and Saturday Loop has none then`.
+ */
+function conductorPoint(view: SplitView, conductor: string | null): string {
+  const { party, memberId } = view;
+  const name = plain(nameOf(party));
+  const who = (id: string) => (id === memberId ? 'you' : memberName(memberOf(party, id)));
+  const is = (id: string) => (id === memberId ? 'are' : 'is');
+  const stays = (id: string) => (id === memberId ? 'stay' : 'stays');
+  const old = party.train.conductorId;
+  const leads =
+    conductor === null ? 'it has no conductor' : `${who(conductor)} ${is(conductor)} its conductor`;
+  if (old !== null && old === conductor) return `- ${leads}, and ${name} has none then`;
+  return old === null
+    ? `- ${leads}`
+    : `- ${leads}; ${who(old)} ${stays(old)} the conductor of ${name}`;
+}
+
+/** The menu of the groups the member may split, the one asked about chosen. */
+function groupMenu(view: SplitView, groups: readonly GroupId[]): APIStringSelectComponent {
+  const { party } = view;
+  return {
+    type: ComponentType.StringSelect,
+    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: 'splitpick' }),
+    options: groups.map((id) => {
+      const group = groupOf(party, id);
+      const label = group?.label ? ` (${truncate(group.label, 60)})` : '';
+      return {
+        label: `Group ${id}${label} · ${count(headCount(party, id), 'trainer')}`,
+        value: id,
+        default: id === view.group,
+      };
+    }),
+  };
+}
+
+/**
+ * The private confirmation of splitting a group off a train (plan 8T; mockup section 2), for the
+ * member who asked alone: one components-v2 container (`TRAIN_PANEL_COLOUR`, as the Move train
+ * panel) with `### Split a group off the train`, what becomes of the group (the new train's
+ * name, as `splitTrain` makes it), the same route at the same stop, who moves (by name, the first
+ * `NAMES_SHOWN`), who leads which train; a menu of the groups when the member may split more than
+ * one (`splittableGroups`), then "Split it off" (danger) and "Cancel". `note` is said above the
+ * question: why a press did nothing.
+ *
+ * The controls name the train by its id like every control of a post: `party:<id>:splitgo:
+ * <group>:<mark>` (the group's mark, `groupMark`, so that a press for a group that is called
+ * otherwise or gone by now is refused), `party:<id>:splitno`, the menu `party:<id>:splitpick`,
+ * whose value is a group's letter. Who is in the group is not carried: who is in it at the
+ * moment of the split goes (design, "The confirmation").
+ */
+export function splitConfirmation(view: SplitView, note?: string): V2Message {
+  const { party, group: groupId } = view;
+  const group = groupOf(party, groupId) ?? { id: groupId };
+  const preview = splitTrain(party, {
+    id: party.id,
+    by: view.memberId,
+    anonymous: false,
+    group: groupId,
+    now: view.now,
+  });
+  const moving = inShownOrder(
+    party,
+    membersWhere(party, (attendee) => attendee.group === groupId),
+  ).map((id) => memberName(memberOf(party, id)));
+  const verb = moving.length === 1 ? 'moves' : 'move';
+  const text = [
+    '### Split a group off the train',
+    ...(note === undefined ? [] : [note]),
+    `Group **${groupName(group)}** leaves **${plain(nameOf(party))}** and becomes a train of ` +
+      `its own, **${plain(nameOf(preview))}**:`,
+    wherePoint(view),
+    `- ${nameList(moving)} ${verb} to it as they are signed up now`,
+    conductorPoint(view, preview.train.conductorId),
+  ];
+  const groups = splittableGroups(party, view.memberId, view.staff);
+  const mark = groupMark(party, groupId) ?? '0';
+  const buttons = actionRow([
+    partyButton(party.id, 'splitgo', 'Split it off', ButtonStyle.Danger, [groupId, mark], '✂️'),
+    partyButton(party.id, 'splitno', 'Cancel', ButtonStyle.Secondary),
+  ]);
+  return {
+    v2: true,
+    components: [
+      container(TRAIN_PANEL_COLOUR, [
+        textDisplay(text.join('\n')),
+        ...(groups.length > 1 ? [menuRow(groupMenu(view, groups))] : []),
+        buttons,
+      ]),
+    ],
+  };
+}
+
+/** The confirmation's place taken by a sentence, without controls: done, cancelled, or why not. */
+export function splitNote(text: string): V2Message {
+  return { v2: true, components: [container(TRAIN_PANEL_COLOUR, [textDisplay(text)])] };
+}
````

### Task 5: Plan 8T T5: /group split and the confirmation's controls

Prototype commit: `d59f30e1f592c20c7e10393df57b17efca4bbc4d`

splitGroupAs in train-changes.ts: the service call as the member (named
as their privacy says) and the answer in the command's words, a refusal
without Discord objects (splitRefusal names the group that is the whole
train); a press drawn for the very group split off last says where it
went (already). The confirmation's "Split it off" calls it, and so can
the map later. The post's "Split group..." answers privately with the
confirmation (the member's own group when they may split it) or why
not ("Only a group's members, the conductor and the moderators can
split a group off." for a member in no group; for staff and the
conductor, the group that is the whole train, or that nobody is in
any; for anybody, a train without a post yet). "Split it off" first
updates the confirmation to "Splitting group B (Fast) off..." without
controls, then edits in "Split off: <post>" (also for a second press
of the same confirmation), or the confirmation drawn anew with the
reason when the member may still split a group, or the reason alone,
or, when the split throws, "The split did not work: nothing was split
off." before the error goes on to the router;
Cancel closes it; the menu shows another group. /group split letter:
answers with the same confirmation, refuses a raid or meetup, and its
autocomplete offers only the groups the member may split.
deploy-commands is needed at staging (a new subcommand).

**Files:**

```
 src/commands/parties/group.ts        |   3 +-
 src/commands/parties/reply.ts        |  29 +++-
 src/commands/trains/split.test.ts    | 484 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/trains/split.ts         | 268 ++++++++++++++++++++++++++++++
 src/commands/trains/train-changes.ts | 109 ++++++++++++-
 src/components/party.ts              |  21 ++-
 6 files changed, 903 insertions(+), 11 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/trains/split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d59f30e1f592c20c7e10393df57b17efca4bbc4d -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-train-split.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T T5: /group split and the confirmation's controls`, the body above and the trailer, staging exactly
  `src/commands/parties/group.ts src/commands/parties/reply.ts src/commands/trains/split.test.ts src/commands/trains/split.ts src/commands/trains/train-changes.ts src/components/party.ts`.

````diff
diff --git a/src/commands/parties/group.ts b/src/commands/parties/group.ts
index 0c0a1a6ff6a44f7aaebd2788dec3e57245394a41..06db2c2c08c60d50ab69c279307ead049e7fa2db 100644
--- a/src/commands/parties/group.ts
+++ b/src/commands/parties/group.ts
@@ -4,6 +4,7 @@ import { requireParty } from '../../discord/guards.js';
 import { MAX_GROUP_LABEL } from '../../domain/party/attendance.js';
 import { groupOf } from '../../domain/party/party.js';
 import { groupWords } from '../../render/party-controls.js';
+import { splitGroupPart } from '../trains/split.js';
 import {
   ACTION_THROTTLE,
   actingMember,
@@ -98,5 +99,5 @@ export const group = commandGroup({
     details: 'Use it in the post of the raid or train. A meetup has no groups.',
   },
   guards: [requireParty],
-  parts: [joinGroup, newGroup, labelGroup],
+  parts: [joinGroup, newGroup, labelGroup, splitGroupPart],
 });
diff --git a/src/commands/parties/reply.ts b/src/commands/parties/reply.ts
index a67750149327709f8b0a5d6819d69d0cfe84dff0..1b91cb48e47b125f275577d8eb645f6d3fcf484a 100644
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -135,9 +135,21 @@ export function typedGroup(ctx: AppContext, party: Pick<Party, 'type'>, text: st
  * Answers the autocomplete of a group option with the groups the raid of this post has, each
  * with its name and head count (`Group B: park side (4)`); with none anywhere else.
  */
-export async function respondWithGroups(
+export function respondWithGroups(
   interaction: AutocompleteInteraction,
   ctx: AppContext,
+): Promise<void> {
+  return respondWithGroupsOf(interaction, ctx, (party) => party.groups.map((group) => group.id));
+}
+
+/**
+ * As `respondWithGroups`, with only the groups `pick` names of the party of this post (`/group
+ * split`: those the member may split off).
+ */
+export async function respondWithGroupsOf(
+  interaction: AutocompleteInteraction,
+  ctx: AppContext,
+  pick: (party: Party) => readonly GroupId[],
 ): Promise<void> {
   const party = partyOf(interaction, ctx);
   // Nothing either for a party that has its one group for good: there is nothing to choose.
@@ -145,17 +157,20 @@ export async function respondWithGroups(
     await interaction.respond([]);
     return;
   }
+  const picked = new Set(pick(party));
   const typed = interaction.options
     .getFocused()
     .trim()
     .toLowerCase()
     .replace(/^group\s*/, '');
-  const all = party.groups.map((group) => ({
-    // The label gives way, never the head count: a choice has at most 100 characters.
-    name: `Group ${group.id}${group.label ? `: ${truncate(group.label, 70)}` : ''} (${headCount(party, group.id)})`,
-    label: (group.label ?? '').toLowerCase(),
-    value: group.id,
-  }));
+  const all = party.groups
+    .filter((group) => picked.has(group.id))
+    .map((group) => ({
+      // The label gives way, never the head count: a choice has at most 100 characters.
+      name: `Group ${group.id}${group.label ? `: ${truncate(group.label, 70)}` : ''} (${headCount(party, group.id)})`,
+      label: (group.label ?? '').toLowerCase(),
+      value: group.id,
+    }));
   // A letter means that group; anything else is looked for in the names of the groups.
   const byLetter = all.filter((choice) => choice.value.toLowerCase() === typed);
   const found =
diff --git a/src/commands/trains/split.test.ts b/src/commands/trains/split.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4c43325da139147408c10bb049fdc9e36c6e5a41
--- /dev/null
+++ b/src/commands/trains/split.test.ts
@@ -0,0 +1,484 @@
+import { ComponentType, MessageFlags } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  asV2,
+  fakeAutocomplete,
+  fakeButton,
+  fakeChatInput,
+  fakeSelect,
+  sent,
+  type FakeInteraction,
+  type FakeRow,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../../test/support/gyms.js';
+import { customIdsOf, selectsOf, textDisplays } from '../../../test/support/messages.js';
+import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER, asTrain } from '../../../test/support/parties.js';
+import { createdMeetup, createdTrain, reportedRaid } from '../../../test/support/party-service.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { partyButtons } from '../../components/party.js';
+import { InteractionRouter } from '../../discord/router.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import { group } from '../parties/group.js';
+import { help, helpControls } from '../util/help.js';
+import { splitConfirmation } from '../../render/train-split.js';
+
+const DAVE = '200000000000000005';
+/** A message a control is on that is components v2, as the confirmation is. */
+const V2_ROWS: readonly FakeRow[] = [{ type: ComponentType.Container, components: [] }];
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+/**
+ * A train on stop 2 of 3 with the maker and Carol in A, and group B (Fast): Alice opened it, Bob
+ * is in it. The `/group` command and the post's controls, routed as the bot routes them.
+ */
+async function setup() {
+  const made = await createdTrain({ route: [4, 1, 7] });
+  const { id } = made.party;
+  await made.trains.move(id, { id: REPORTER }, 'next', true);
+  await made.attendance.signUp(id, { id: CAROL, name: 'Carol' }, PartyStatus.Coming);
+  await made.attendance.newGroup(id, { id: ALICE, name: 'Alice' });
+  await made.attendance.labelGroup(id, { id: ALICE, name: 'Alice' }, 'Fast');
+  await made.attendance.joinGroup(id, { id: BOB, name: 'Bob' }, 'B');
+  await made.attendance.flush();
+  await made.service.flush();
+  const { ctx, entries } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    timedParties: made.timed,
+    trains: made.trains,
+    parties: made.store,
+    regions: made.regions,
+    users: made.users,
+  });
+  const router = new InteractionRouter(ctx, [group], [partyButtons]);
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const inPost = { channelId: made.postId, thread: { parentId: WEST_FORUM } };
+  /** A press on a control of the train, by Alice unless `extra` says otherwise. */
+  const click = (customId: string, extra: object = {}) =>
+    handle(
+      fakeButton({
+        customId,
+        channelId: made.postId,
+        userId: ALICE,
+        displayName: 'Alice',
+        messageRows: V2_ROWS,
+        ...extra,
+      }),
+    );
+  /** The confirmation as Alice (unless `as` says otherwise) would be shown it now. */
+  const drawn = (groupId: 'A' | 'B' = 'B', as = ALICE, staff = false): V2Message =>
+    splitConfirmation({
+      party: made.current(),
+      gym: (gymId) => ctx.gyms.get(gymId),
+      memberId: as,
+      staff,
+      group: groupId,
+      now: PARTY_NOW,
+    });
+  /** The custom id of "Split it off" of a confirmation. */
+  const go = (message: V2Message): string =>
+    customIdsOf(message).find((custom) => custom.includes(':splitgo:')) ?? '';
+  const split = (extra: object = {}) =>
+    handle(
+      fakeChatInput({
+        commandName: 'group',
+        subcommand: 'split',
+        ...inPost,
+        userId: ALICE,
+        displayName: 'Alice',
+        options: { letter: 'B' },
+        ...extra,
+      }),
+    );
+  return { ...made, ctx, entries, router, handle, click, drawn, go, split, inPost };
+}
+
+/** Holds the making of the next post (the new train's) until `release` is called. */
+function holdPost(made: Awaited<ReturnType<typeof setup>>): {
+  release: () => void;
+  reached: Promise<void>;
+} {
+  let release: () => void = () => undefined;
+  let arrive: () => void = () => undefined;
+  const held = new Promise<void>((resolve) => {
+    release = resolve;
+  });
+  const reached = new Promise<void>((resolve) => {
+    arrive = resolve;
+  });
+  const original = made.gateway.createPost.bind(made.gateway);
+  vi.spyOn(made.gateway, 'createPost').mockImplementation(async (forumId, post) => {
+    arrive();
+    await held;
+    return original(forumId, post);
+  });
+  return { release, reached };
+}
+
+/** What the confirmation says while the split is under way. */
+const SPLITTING = 'Splitting group B (Fast) off…';
+
+/** The first text of the components-v2 message a responder was first given. */
+const firstText = (responder: Parameters<typeof sent>[0]): string =>
+  textDisplays(asV2(sent(responder)))[0] ?? '';
+
+describe('the button "Split group…" of a train post', () => {
+  it('answers a member of the group privately with the confirmation', async () => {
+    const made = await setup();
+    const pressed = await made.click(`party:${made.party.id}:split`);
+    const reply = sent(pressed.reply) as { flags?: number };
+    expect(reply.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
+    expect(asV2(reply)).toEqual(made.drawn());
+    expect(firstText(pressed.reply)).toMatch(
+      /^### Split a group off the train\nGroup \*\*B \(Fast\)\*\*/u,
+    );
+  });
+
+  it('tells a member who may split no group why, and nothing more', async () => {
+    const made = await setup();
+    const refused = async (extra: object) =>
+      sent((await made.click(`party:${made.party.id}:split`, extra)).reply).content;
+    expect(await refused({ userId: DAVE, displayName: 'Dave' })).toBe(
+      "Only a group's members, the conductor and the moderators can split a group off.",
+    );
+    // With the conductor in group B, Bob may not split it.
+    await made.trains.setConductor(made.party.id, { id: ALICE, name: 'Alice' });
+    expect(await refused({ userId: BOB, displayName: 'Bob' })).toBe(
+      'The conductor is in that group: only they and the moderators can split it off.',
+    );
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('says so when everybody on the train is in that group', async () => {
+    const made = await setup();
+    // The maker and Carol leave group A: Alice and Bob in B are the whole train.
+    await made.attendance.leave(made.party.id, { id: REPORTER, name: 'Ash' });
+    await made.attendance.leave(made.party.id, { id: CAROL, name: 'Carol' });
+    const pressed = await made.click(`party:${made.party.id}:split`);
+    const whole =
+      'Everybody on this train is in group B (Fast): there is nothing to split it from.';
+    expect(sent(pressed.reply).content).toBe(whole);
+    expect(sent((await made.split()).reply).content).toBe(whole);
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('tells staff in no group why no group can be split: the group that has everybody, or none', async () => {
+    const made = await setup();
+    const staff = { userId: DAVE, displayName: 'Dave', roleNames: ['Moderator'] };
+    const refused = async () =>
+      sent((await made.click(`party:${made.party.id}:split`, staff)).reply).content;
+    await made.attendance.leave(made.party.id, { id: REPORTER, name: 'Ash' });
+    await made.attendance.leave(made.party.id, { id: CAROL, name: 'Carol' });
+    expect(await refused()).toBe(
+      'Everybody on this train is in group B (Fast): there is nothing to split it from.',
+    );
+    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
+    await made.attendance.leave(made.party.id, { id: BOB, name: 'Bob' });
+    expect(await refused()).toBe('Nobody is in that group: there is nobody to split off.');
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('tells staff a train without a post yet has none to split', async () => {
+    const made = await setup();
+    await made.store.update(made.party.id, (party) => ({ party: { ...party, forumPostId: null } }));
+    const pressed = await made.click(`party:${made.party.id}:split`, {
+      userId: DAVE,
+      displayName: 'Dave',
+      roleNames: ['Moderator'],
+    });
+    expect(sent(pressed.reply).content).toBe('This train has no post yet: try again in a moment.');
+  });
+
+  it('says a train of one group has none to split', async () => {
+    const made = await setup();
+    // Group B went its own way: the train has group A alone (a post drawn before shows the button).
+    await made.trains.split(made.party.id, { id: ALICE, name: 'Alice' }, false, 'B');
+    const pressed = await made.click(`party:${made.party.id}:split`, {
+      userId: CAROL,
+      displayName: 'Carol',
+    });
+    expect(sent(pressed.reply).content).toBe(
+      'This train has one group: there is no group to split off it.',
+    );
+  });
+
+  it('offers staff a menu of the groups, and a pick shows the confirmation for that group', async () => {
+    const made = await setup();
+    const staff = { userId: DAVE, displayName: 'Dave', roleNames: ['Moderator'] };
+    const pressed = await made.click(`party:${made.party.id}:split`, staff);
+    const shown = asV2(sent(pressed.reply));
+    expect(selectsOf(shown)[0]?.options.map((option) => option.value)).toEqual(['A', 'B']);
+    const picked = await made.handle(
+      fakeSelect({
+        customId: `party:${made.party.id}:splitpick`,
+        values: ['A'],
+        channelId: made.postId,
+        userId: DAVE,
+        displayName: 'Dave',
+        roleNames: ['Moderator'],
+        messageRows: shown.components as FakeRow[],
+      }),
+    );
+    expect(asV2(sent(picked.update))).toEqual(made.drawn('A', DAVE, true));
+  });
+});
+
+describe('the confirmation', () => {
+  it('splits the group off on "Split it off", and says where the new train is', async () => {
+    const made = await setup();
+    const confirmed = await made.click(made.go(made.drawn()));
+    // At once, without its controls: a second press cannot ask for another split meanwhile.
+    expect(firstText(confirmed.update)).toBe(SPLITTING);
+    expect(customIdsOf(asV2(sent(confirmed.update)))).toEqual([]);
+    const fresh = made.store.active().find((party) => party.id !== made.party.id);
+    expect(fresh?.forumPostId).toBeDefined();
+    expect(firstText(confirmed.editReply)).toBe(`Split off: <#${fresh?.forumPostId}>`);
+    expect(customIdsOf(asV2(sent(confirmed.editReply)))).toEqual([]);
+    expect(Object.keys(made.current().attendees)).toEqual([REPORTER, CAROL]);
+    expect(Object.keys(asTrain(fresh).attendees)).toEqual([ALICE, BOB]);
+  });
+
+  it('closes on Cancel and splits nothing', async () => {
+    const made = await setup();
+    const cancelled = await made.click(`party:${made.party.id}:splitno`);
+    expect(firstText(cancelled.update)).toBe('Nothing was split off.');
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('draws itself anew with the reason when the group changed since', async () => {
+    const made = await setup();
+    const before = made.drawn();
+    await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, 'Slow');
+    const confirmed = await made.click(made.go(before));
+    expect(asV2(sent(confirmed.editReply))).toEqual(
+      splitConfirmation(
+        {
+          party: made.current(),
+          gym: (gymId) => made.ctx.gyms.get(gymId),
+          memberId: ALICE,
+          staff: false,
+          group: 'B',
+          now: PARTY_NOW,
+        },
+        'The groups of this train changed meanwhile.',
+      ),
+    );
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('says where the group went when somebody split that very group off first', async () => {
+    const made = await setup();
+    const before = made.drawn();
+    // Bob splits the group off first: Alice is on the new train, the old has nothing of hers.
+    await made.trains.split(made.party.id, { id: BOB, name: 'Bob' }, false, 'B');
+    const fresh = made.store.active().find((party) => party.id !== made.party.id);
+    const confirmed = await made.click(made.go(before));
+    expect(firstText(confirmed.editReply)).toBe(`Split off: <#${fresh?.forumPostId}>`);
+    expect(customIdsOf(asV2(sent(confirmed.editReply)))).toEqual([]);
+    expect(made.store.active()).toHaveLength(2);
+  });
+
+  it('answers both presses of one confirmation with where the group went, and splits once', async () => {
+    const made = await setup();
+    const customId = made.go(made.drawn());
+    const { release, reached } = holdPost(made);
+    const first = made.click(customId);
+    await reached;
+    // The second press waits for the first split to settle.
+    const second = made.click(customId);
+    release();
+    const presses = await Promise.all([first, second]);
+    const fresh = made.store.active().find((party) => party.id !== made.party.id);
+    for (const pressed of presses) {
+      expect(firstText(pressed.update)).toBe(SPLITTING);
+      expect(firstText(pressed.editReply)).toBe(`Split off: <#${fresh?.forumPostId}>`);
+    }
+    expect(made.store.active()).toHaveLength(2);
+    expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
+  });
+
+  it('says the train is over when it ended while the group was being split off', async () => {
+    const made = await setup();
+    const { release, reached } = holdPost(made);
+    const pressing = made.click(made.go(made.drawn()));
+    await reached;
+    await made.service.end(made.party.id);
+    release();
+    const pressed = await pressing;
+    expect(firstText(pressed.update)).toBe(SPLITTING);
+    expect(firstText(pressed.editReply)).toBe('This train is over.');
+    expect(customIdsOf(asV2(sent(pressed.editReply)))).toEqual([]);
+    expect(made.store.active()).toEqual([]);
+  });
+
+  it('closes with the reason when the member may split nothing any more', async () => {
+    const made = await setup();
+    const before = made.drawn();
+    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
+    const confirmed = await made.click(made.go(before));
+    expect(firstText(confirmed.editReply)).toBe(
+      "Only a group's members, the conductor and the moderators can split a group off.",
+    );
+    expect(customIdsOf(asV2(sent(confirmed.editReply)))).toEqual([]);
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('says the split did not work when it failed, instead of splitting for good', async () => {
+    const made = await setup();
+    made.gateway.failing.set('createPost', new Error('Discord is away'));
+    const confirmed = await made.click(made.go(made.drawn()));
+    made.gateway.failing.delete('createPost');
+    expect(firstText(confirmed.update)).toBe(SPLITTING);
+    expect(firstText(confirmed.editReply)).toBe('The split did not work: nothing was split off.');
+    expect(customIdsOf(asV2(sent(confirmed.editReply)))).toEqual([]);
+    // The failure itself went to the router, which says it went wrong.
+    expect(sent(confirmed.followUp).content).toMatch(/^Something went wrong/u);
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('logs a failed note and lets the failure of the split itself go to the router', async () => {
+    const made = await setup();
+    made.gateway.failing.set('createPost', new Error('Discord is away'));
+    const press = fakeButton({
+      customId: made.go(made.drawn()),
+      channelId: made.postId,
+      userId: ALICE,
+      displayName: 'Alice',
+      messageRows: V2_ROWS,
+    });
+    press.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));
+    await made.handle(press);
+    made.gateway.failing.delete('createPost');
+    const failed = made.entries.find((entry) => entry.msg === 'interaction failed');
+    expect(failed?.err).toMatchObject({ message: 'Discord is away' });
+    const note = made.entries.find(
+      (entry) => entry.msg === 'could not say that the split did not work',
+    );
+    expect(note?.err).toMatchObject({ message: 'Unknown Webhook' });
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('closes when the train is over', async () => {
+    const made = await setup();
+    const before = made.drawn();
+    await made.service.end(made.party.id);
+    const confirmed = await made.click(made.go(before));
+    expect(firstText(confirmed.update)).toBe('This train is over.');
+    expect(made.store.active()).toEqual([]);
+  });
+});
+
+describe('/help group split', () => {
+  it('explains the subcommand with an example, and /group lists it', async () => {
+    const { ctx } = createTestContext({ commands: [help, group] });
+    const ask = async (command: string) => {
+      const asked = fakeChatInput({ commandName: 'help', options: { command } });
+      await new InteractionRouter(ctx, [help, group], [helpControls]).handle(asked as never);
+      return textDisplays(asV2(sent(asked.reply))).join('\n');
+    };
+    const page = await ask('group split');
+    expect(page).toMatch(/^### \/group split/u);
+    expect(page).toContain('/group split letter:B');
+    expect(page).toContain('Split group…');
+    expect((await ask('group')).split('\n')).toContain(
+      '`/group split <letter>` Split a group off this train into a train of its own',
+    );
+  });
+});
+
+describe('/group split', () => {
+  it('answers with the private confirmation of that group', async () => {
+    const made = await setup();
+    const used = await made.split();
+    const reply = sent(used.reply) as { flags?: number };
+    expect(reply.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
+    expect(asV2(reply)).toEqual(made.drawn());
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('refuses a group the member may not split, and a raid or meetup', async () => {
+    const made = await setup();
+    expect(sent((await made.split({ userId: CAROL, displayName: 'Carol' })).reply).content).toBe(
+      "Only a group's members, the conductor and the moderators can split a group off.",
+    );
+    expect(sent((await made.split({ options: { letter: 'Q' } })).reply).content).toBe(
+      'This train has no such group.',
+    );
+    const raid = await reportedRaid();
+    const { ctx } = createTestContext({
+      partyService: raid.service,
+      attendance: raid.attendance,
+      parties: raid.store,
+      regions: raid.regions,
+    });
+    const router = new InteractionRouter(ctx, [group], [partyButtons]);
+    const used = fakeChatInput({
+      commandName: 'group',
+      subcommand: 'split',
+      channelId: raid.postId,
+      thread: { parentId: WEST_FORUM },
+      userId: ALICE,
+      options: { letter: 'A' },
+    });
+    await router.handle(used as never);
+    expect(sent(used.reply).content).toBe(
+      'This is the post of a raid: that only works in the post of a train.',
+    );
+  });
+
+  it('refuses in the post of a meetup', async () => {
+    const meetup = await createdMeetup();
+    const { ctx } = createTestContext({
+      partyService: meetup.service,
+      attendance: meetup.attendance,
+      parties: meetup.store,
+      regions: meetup.regions,
+    });
+    const used = fakeChatInput({
+      commandName: 'group',
+      subcommand: 'split',
+      channelId: meetup.postId,
+      thread: { parentId: WEST_FORUM },
+      userId: ALICE,
+      options: { letter: 'A' },
+    });
+    await new InteractionRouter(ctx, [group], [partyButtons]).handle(used as never);
+    expect(sent(used.reply).content).toBe(
+      'This is the post of a meetup: that only works in the post of a train.',
+    );
+  });
+
+  it('offers only the groups the member may split', async () => {
+    const made = await setup();
+    const offered = async (userId: string, extra: object = {}) => {
+      const interaction = fakeAutocomplete({
+        commandName: 'group',
+        subcommand: 'split',
+        ...made.inPost,
+        userId,
+        focused: '',
+        focusedName: 'letter',
+        ...extra,
+      });
+      await made.router.handle(interaction as never);
+      return interaction.respond.mock.calls[0]?.[0];
+    };
+    expect(await offered(ALICE)).toEqual([{ name: 'Group B: Fast (2)', value: 'B' }]);
+    expect(await offered(CAROL)).toEqual([{ name: 'Group A (2)', value: 'A' }]);
+    expect(await offered(DAVE)).toEqual([]);
+    expect(await offered(DAVE, { roleNames: ['Moderator'] })).toEqual([
+      { name: 'Group A (2)', value: 'A' },
+      { name: 'Group B: Fast (2)', value: 'B' },
+    ]);
+  });
+});
diff --git a/src/commands/trains/split.ts b/src/commands/trains/split.ts
new file mode 100644
index 0000000000000000000000000000000000000000..326cbccf0c88d7ef0cd34a6bce5d63ea514ebd20
--- /dev/null
+++ b/src/commands/trains/split.ts
@@ -0,0 +1,268 @@
+import {
+  MessageFlags,
+  SlashCommandSubcommandBuilder,
+  type ButtonInteraction,
+  type ChatInputCommandInteraction,
+  type MessageComponentInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { UserError } from '../../discord/errors.js';
+import { isStaff, notATrain } from '../../discord/guards.js';
+import { v2Answer } from '../../discord/late-reply.js';
+import type { V2Message } from '../../discord/party-gateway.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import {
+  attendeeOf,
+  groupOf,
+  isGroupId,
+  isTrain,
+  type GroupId,
+  type TrainParty,
+} from '../../domain/party/party.js';
+import { mayNotSplit, splittableGroups } from '../../domain/party/train.js';
+import { groupWords } from '../../render/party-controls.js';
+import { splitConfirmation, splitNote } from '../../render/train-split.js';
+import {
+  ACTION_THROTTLE,
+  actingMember,
+  commandParty,
+  partyOver,
+  respondWithGroupsOf,
+  typedGroup,
+} from '../parties/reply.js';
+import { DISCORD_NAMES } from '../raids/report.js';
+import { splitGroupAs, splitRefusal, trainRefusal } from './train-changes.js';
+
+/*
+ * Splitting a group off a train (plan 8T) on Discord: the post's "Split group…" and `/group
+ * split` answer privately with the confirmation (`splitConfirmation`), whose "Split it off"
+ * splits (`splitGroupAs`), "Cancel" closes and menu shows another group. Their controls are the
+ * party's (`party:<id>:split`, `splitgo:<group>:<mark>`, `splitno`, `splitpick`), with the party
+ * controls' guards and `ACTION_THROTTLE`.
+ */
+
+const A_TRAIN = { type: 'train' } as const;
+
+/** What the confirmation says once Cancel is pressed. */
+export const NOTHING_SPLIT = 'Nothing was split off.';
+
+/** What the confirmation says when the split failed (the old train is as it was). */
+const SPLIT_FAILED = 'The split did not work: nothing was split off.';
+
+/** The confirmation for this member and group, as things stand now. */
+function confirmation(
+  ctx: AppContext,
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+  group: GroupId,
+  note?: string,
+): V2Message {
+  return splitConfirmation(
+    { party, gym: (id) => ctx.gyms.get(id), memberId, staff, group, now: Date.now() },
+    note,
+  );
+}
+
+/**
+ * Why the member may split no group of the train, in words: a train of one group, or one without
+ * a post yet; for staff and the conductor, who may split any other group, what the group that
+ * has members says (everybody in it: `whole-train`), or that nobody is in any (`empty-group`);
+ * for anybody else what their own group says (the conductor in it, everybody in it), and for
+ * anybody in no group `not-in-group`.
+ */
+function whyNot(ctx: AppContext, party: TrainParty, memberId: string, staff: boolean): string {
+  if (party.groups.length < 2) return trainRefusal(ctx, 'one-group');
+  if (party.forumPostId === null) return trainRefusal(ctx, 'unposted');
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
+/**
+ * The group the confirmation asks about: `wanted` when the member may split it, else their own
+ * group, else the first they may split; undefined when they may split none.
+ */
+function shownGroup(
+  party: TrainParty,
+  memberId: string,
+  staff: boolean,
+  wanted?: GroupId,
+): GroupId | undefined {
+  const groups = splittableGroups(party, memberId, staff);
+  const own = attendeeOf(party, memberId)?.group;
+  if (wanted !== undefined && groups.includes(wanted)) return wanted;
+  if (own !== undefined && groups.includes(own)) return own;
+  return groups[0];
+}
+
+/**
+ * "Split group…" of a train's post: the confirmation privately, for the member's own group when
+ * they may split it; why not, when they may split none. Every press gets a confirmation of its
+ * own (not a gathered click).
+ */
+export async function openSplit(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  partyId: string,
+): Promise<void> {
+  const party = ctx.parties.get(partyId);
+  if (!party) throw new UserError(partyOver(A_TRAIN));
+  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
+  const staff = isStaff(interaction, ctx);
+  const group = shownGroup(party, interaction.user.id, staff);
+  if (group === undefined) throw new UserError(whyNot(ctx, party, interaction.user.id, staff));
+  await interaction.reply({
+    components: confirmation(ctx, party, interaction.user.id, staff, group).components,
+    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
+  });
+}
+
+/**
+ * "Split it off" of the confirmation (`party:<id>:splitgo:<group>:<mark>`): first the
+ * confirmation gives way to a note without controls (`Splitting group B (Fast) off…`), so that
+ * nothing more can be pressed on it while the new post is made; then the group is split off
+ * (`splitGroupAs`, with the mark the confirmation was drawn with) and the outcome takes the
+ * note's place: `Split off: <post>` (also for a second press of the same confirmation, which
+ * waits for the first and finds that very group split off); on a refusal the confirmation drawn
+ * anew with the reason above when the member may still split a group, else the reason alone; a
+ * train that is over closes it. When the split throws, the note says `The split did not work:
+ * nothing was split off.` and the error goes on to the router, which says what went wrong.
+ */
+export async function pressSplit(
+  interaction: MessageComponentInteraction,
+  ctx: AppContext,
+  partyId: string,
+  group: string | undefined,
+  mark: string | undefined,
+): Promise<void> {
+  if (group === undefined || !isGroupId(group) || mark === undefined) {
+    throw new UserError(STALE_COMPONENT);
+  }
+  const party = ctx.parties.get(partyId);
+  if (!party) {
+    await interaction.update(v2Answer(splitNote(partyOver(A_TRAIN))));
+    return;
+  }
+  if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
+  const member = actingMember(interaction);
+  const staff = isStaff(interaction, ctx);
+  const words = groupWords(groupOf(party, group) ?? { id: group });
+  await interaction.update(v2Answer(splitNote(`Splitting ${words} off…`)));
+  let answer;
+  try {
+    answer = await splitGroupAs(ctx, { party, member, group, staff, drawn: mark }, DISCORD_NAMES);
+  } catch (err) {
+    // The note must not promise a split for good: the router says what went wrong below it. A
+    // note that cannot be changed is logged, so that the router gets the split's own failure.
+    await interaction.editReply(v2Answer(splitNote(SPLIT_FAILED))).catch((noteErr: unknown) => {
+      ctx.log.warn({ err: noteErr }, 'could not say that the split did not work');
+    });
+    throw err;
+  }
+  const now = ctx.parties.get(partyId);
+  const again =
+    answer.kind === 'refused' && now && isTrain(now)
+      ? shownGroup(now, member.id, staff, group)
+      : undefined;
+  const shown =
+    again !== undefined && now && isTrain(now)
+      ? confirmation(ctx, now, member.id, staff, again, answer.text)
+      : splitNote(answer.text);
+  await interaction.editReply(v2Answer(shown));
+}
+
+/** "Cancel" of the confirmation: it closes, and nothing is split off. */
+export async function cancelSplit(interaction: MessageComponentInteraction): Promise<void> {
+  await interaction.update(v2Answer(splitNote(NOTHING_SPLIT)));
+}
+
+/**
+ * The menu of the groups of the confirmation (`party:<id>:splitpick`): the confirmation drawn for
+ * the group picked, or why the member may split none any more.
+ */
+export async function pickSplit(
+  interaction: MessageComponentInteraction & { values: readonly string[] },
+  ctx: AppContext,
+  partyId: string,
+): Promise<void> {
+  const [picked] = interaction.values;
+  if (picked === undefined || !isGroupId(picked)) throw new UserError(STALE_COMPONENT);
+  const party = ctx.parties.get(partyId);
+  if (!party || !isTrain(party)) {
+    await interaction.update(v2Answer(splitNote(partyOver(A_TRAIN))));
+    return;
+  }
+  const staff = isStaff(interaction, ctx);
+  const group = shownGroup(party, interaction.user.id, staff, picked);
+  await interaction.update(
+    v2Answer(
+      group === undefined
+        ? splitNote(whyNot(ctx, party, interaction.user.id, staff))
+        : confirmation(
+            ctx,
+            party,
+            interaction.user.id,
+            staff,
+            group,
+            group === picked ? undefined : trainRefusal(ctx, 'group-changed'),
+          ),
+    ),
+  );
+}
+
+/** `/group split letter:B`: the confirmation privately, for that group, or why not. */
+async function splitByCommand(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+): Promise<void> {
+  const party = commandParty(interaction, ctx);
+  if (!isTrain(party)) throw new UserError(notATrain(party));
+  const group = typedGroup(ctx, party, interaction.options.getString('letter', true));
+  const staff = isStaff(interaction, ctx);
+  const problem = mayNotSplit(party, interaction.user.id, staff, group);
+  if (problem) throw new UserError(splitRefusal(ctx, party, problem, group));
+  await interaction.reply({
+    components: confirmation(ctx, party, interaction.user.id, staff, group).components,
+    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
+  });
+}
+
+/** The part `split` of `/group`. */
+export const splitGroupPart: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('split')
+    .setDescription('Split a group off this train into a train of its own')
+    .addStringOption((option) =>
+      option
+        .setName('letter')
+        .setDescription('The group to split off')
+        .setRequired(true)
+        .setAutocomplete(true),
+    ),
+  help: {
+    details:
+      'Makes a group of this train a train of its own, for those who want to go at their own ' +
+      'pace: the same route, at the same stop, with the same end mode, boss and start, and the ' +
+      "group's members moved there. Both posts link the other, and the members who moved are " +
+      'pinged in the new one. You are asked first, privately. A member of the group may split ' +
+      'it off, unless the conductor is in it; the conductor and the moderators may split any ' +
+      'group. The same as the button "Split group…" on the post. Only in the post of a train.',
+    examples: ['/group split letter:B'],
+  },
+  throttle: ACTION_THROTTLE,
+  execute: splitByCommand,
+  autocomplete: (interaction, ctx) =>
+    respondWithGroupsOf(interaction, ctx, (party) =>
+      isTrain(party) ? splittableGroups(party, interaction.user.id, isStaff(interaction, ctx)) : [],
+    ),
+};
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index bb219e603c971414b504fa401e069a694cb5d353..63dad70ffe10c43aade9ed391b38f003f80e2497 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -1,14 +1,22 @@
 import type { AppContext } from '../../app-context.js';
 import {
+  groupOf,
+  isTrain,
   MAX_ROUTE_STOPS,
   memberOf,
   membersWhere,
   type TrainParty,
 } from '../../domain/party/party.js';
 import { RaidPrivacy } from '../../domain/party/status.js';
-import type { PartyProblem, TrainAtEnd } from '../../domain/party/party.js';
-import { currentStop, type ConductorSeen, type TrainMove } from '../../domain/party/train.js';
+import type { GroupId, PartyProblem, TrainAtEnd } from '../../domain/party/party.js';
+import {
+  currentStop,
+  splitDrawn,
+  type ConductorSeen,
+  type TrainMove,
+} from '../../domain/party/train.js';
 import { NO_POST_MADE, problemText } from '../../render/activity.js';
+import { groupWords } from '../../render/party-controls.js';
 import { gymName } from '../../render/raid-post.js';
 import { count, memberText, plain } from '../../render/text.js';
 import { whereText } from '../../render/train-panel.js';
@@ -403,6 +411,103 @@ export async function setAtEndAs(
   return answerOf(ctx, outcome, (ok) => atEndSentence(ok.party.train.atEnd));
 }
 
+/** What splitting a group off needs: the train service, the members' privacy, the words. */
+export type TrainSplitting = Pick<AppContext, 'trains' | 'attendance' | 'users' | 'parties'>;
+
+/**
+ * Why a member may not split a group off this train, in the command's words: as any refusal of a
+ * train (`trainRefusal`), but a group that holds everybody on the train is named (Matt,
+ * 2026-10-17): `Everybody on this train is in group B (Fast): there is nothing to split it
+ * from.`
+ */
+export function splitRefusal(
+  ctx: Pick<AppContext, 'attendance'>,
+  party: TrainParty,
+  reason: PartyProblem,
+  groupId: GroupId,
+): string {
+  if (reason !== 'whole-train') return trainRefusal(ctx, reason);
+  const words = groupWords(groupOf(party, groupId) ?? { id: groupId });
+  return `Everybody on this train is in ${words}: there is nothing to split it from.`;
+}
+
+/** A group to split off a train, as the member asks it (plan 8T). */
+export interface SplitAsk {
+  party: TrainParty;
+  member: Member;
+  group: GroupId;
+  staff: boolean;
+  /** The group's mark as the confirmation showed it (`groupMark`); a stale one is refused. */
+  drawn?: string;
+}
+
+/**
+ * What came of a split, in the command's words: `split` with the new train; `already` when the
+ * group the confirmation showed is the one split off last, by an earlier press or somebody else
+ * (`splitDrawn`): it says where it went.
+ */
+export type SplitAnswer =
+  | { kind: 'split'; party: TrainParty; text: string }
+  | { kind: 'already'; text: string }
+  | { kind: 'refused'; text: string; reason?: PartyProblem }
+  | { kind: 'gone'; text: string };
+
+/**
+ * Splits a group off the train into a train of its own as the member (`TrainService.split`),
+ * named as their privacy says (`/settings privacy`, as for `/train`), and says what came of it:
+ * `Split off: <post>` (`names.post`; the map names no post), the reason of a refusal (`splitRefusal`),
+ * or that the train is over. A press drawn for the very group that was split off last (a second
+ * press of one confirmation, or somebody else's split of it) says where it went, as if it had
+ * split it. The one code path of the confirmation's "Split it off" and, later, the map's.
+ */
+export async function splitGroupAs(
+  ctx: TrainSplitting,
+  ask: SplitAsk,
+  names: Pick<ReportNames, 'post'>,
+): Promise<SplitAnswer> {
+  const { party, member, group, staff, drawn } = ask;
+  const settings = await ctx.users.get(member.id);
+  const outcome = await ctx.trains.split(party.id, member, staff, group, {
+    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
+    ...(drawn === undefined ? {} : { drawn }),
+  });
+  switch (outcome.kind) {
+    case 'gone':
+      return { kind: 'gone', text: TRAIN_OVER };
+    case 'refused': {
+      const now = ctx.parties.get(party.id);
+      const went =
+        outcome.reason === 'group-changed' && drawn !== undefined && now && isTrain(now)
+          ? splitDrawn(now, group, drawn)
+          : undefined;
+      if (went) return { kind: 'already', text: splitOffWords(went.postId, names) };
+      return {
+        kind: 'refused',
+        text: splitRefusal(ctx, party, outcome.reason, group),
+        reason: outcome.reason,
+      };
+    }
+    case 'no-forum':
+      return { kind: 'refused', text: 'The region of this train has no forum any more.' };
+    case 'no-post':
+      return { kind: 'refused', text: NO_POST_MADE };
+    case 'split': {
+      const postId = outcome.party.forumPostId;
+      return {
+        kind: 'split',
+        party: outcome.party,
+        text: postId === null ? 'Split off.' : splitOffWords(postId, names),
+      };
+    }
+  }
+}
+
+/** `Split off: <post>`, or `Split off.` where posts are not named (the map). */
+function splitOffWords(postId: string, names: Pick<ReportNames, 'post'>): string {
+  const post = names.post(postId);
+  return post === undefined ? 'Split off.' : `Split off: ${post}`;
+}
+
 /**
  * How the answer of a takeover names the conductor before (`setConductorAs`): on Discord the
  * member as a sentence names them (`DISCORD_CONDUCTOR`); the map names nobody.
diff --git a/src/components/party.ts b/src/components/party.ts
index c18e483ea8349354b47db744aee2280c5de5ec05..719b170fd442ef92b9c6d48fad7c35ab6de88ac2 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -20,6 +20,7 @@ import {
 } from '../commands/trains/move.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import { showWholeRoute } from '../commands/trains/route.js';
+import { cancelSplit, openSplit, pickSplit, pressSplit } from '../commands/trains/split.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
 import { managementRoleIds, notARaid, partyOf, requireGuild } from '../discord/guards.js';
@@ -139,6 +140,17 @@ export const partyButtons: ComponentHandler = {
       case 'route':
         // "Whole route" of a train's post: the route privately, as `/route show` answers it.
         return showWholeRoute(interaction, ctx, partyId);
+      case 'split':
+        // "Split group…" of a train's post: the confirmation privately (plan 8T).
+        return openSplit(interaction, ctx, partyId);
+      case 'splitgo':
+        // "Split it off" of that confirmation.
+        return pressSplit(interaction, ctx, partyId, id.args[0], id.args[1]);
+      case 'splitno':
+        return cancelSplit(interaction);
+      case 'splitpick':
+        // The menu of that confirmation: never a button.
+        throw new UserError(STALE_COMPONENT);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
@@ -152,8 +164,15 @@ export const partyButtons: ComponentHandler = {
     }
   },
 
-  /** The menu "At the end of the route" of the Move train panel; the panel is its only menu. */
+  /**
+   * The menu "At the end of the route" of the Move train panel, and the menu of the groups of
+   * the confirmation of a split.
+   */
   async select(interaction, id, ctx) {
+    if (id.action === 'splitpick') {
+      await pickSplit(interaction, ctx, id.id);
+      return;
+    }
     if (id.action !== 'atend') throw new UserError(STALE_COMPONENT);
     await pressAtEnd(interaction, ctx, id.id, id.args[0]);
   },
````

### Task 6: Plan 8T T6: The docs and the staging checklist

Prototype commit: `1bd0bdc81508194bee27bf5293aca338cb46cc28`

trains.md has a part "Splitting a group off" (who may, the pure
functions, the mark, the service's order and take-back, the pending
window and its settling at start, the lines and the ping, the post's
small print and button, the confirmation and its custom ids);
parties-and-posts.md the state document version 11 and the train's
worst case (44, four groups folded); history.md the split step,
PartyHistoryAttendee.splitOff, PartyHistory.splitFromId and its index
(migration 020), the pending train's history; testing.md how a split
is tested. The staging checklist 2026-10-17-phase-8t-staging.md starts
with deploy-commands (a new subcommand) and migration 020 after 8S-1's
019, and names who of three accounts does what.

**Files:**

```
 docs/architecture/history.md                          | 10 ++++---
 docs/architecture/parties-and-posts.md                |  4 +--
 docs/architecture/testing.md                          |  2 +-
 docs/architecture/trains.md                           | 11 ++++++++
 docs/superpowers/plans/2026-10-17-phase-8t-staging.md | 59 +++++++++++++++++++++++++++++++++++++++
 src/discord/custom-id.ts                              |  5 ++++
 6 files changed, 84 insertions(+), 7 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1bd0bdc81508194bee27bf5293aca338cb46cc28 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-train-split.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T T6: The docs and the staging checklist`, the body above and the trailer, staging exactly
  `docs/architecture/history.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/trains.md docs/superpowers/plans/2026-10-17-phase-8t-staging.md src/discord/custom-id.ts`.

````diff
diff --git a/docs/architecture/history.md b/docs/architecture/history.md
index 5ed958ee74381a3cb5981062c39f1e831382ffb6..80bac197f1384cf69057e2127403872c48fff539 100644
--- a/docs/architecture/history.md
+++ b/docs/architecture/history.md
@@ -2,14 +2,15 @@
 
 Every party that ends is kept in relational tables beside the live `Party` table (plan 8H; spec `2026-10-16-cutover-docker-history-design.md`, 4.3): what it was, where and when, how it ended and how many took part, in a form that plain SQL counts and groups. The legacy bot's parties are imported once from its files. Members are named only with their opt-in. Read before changing the history, its recording, the opt-in or the import, or before writing a statistic over it.
 
-## The tables (migration 018)
+## The tables (migrations 018 and 020)
 
-- `PartyHistory`: one row per ended party. `source` is `live` (with `partyId`, the `Party.id`, unique) or `legacy` (with `legacyKey`, `<channel>:<creation ms>`, unique). `kind` is `raid`, `train` or `meetup`. Where: `serverId` (the server's snowflake), `regionId`, `gymId`, `legacyGymId` (the legacy file's gym, kept also when the gym list no longer has it). None of them carries a foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither delete it nor split it; Matt, 2026-10-16), and a region or gym deleted later stays named by its id. What: `name` and `description` (trains and meetups), `tier` (`T1` to `T5`, `Mega`, `MegaLegendary`, `SuperMega`, `Elite`, and the legacy `T2`, `T4`, `EX`; null where not known), `shadow`, `mega`, `elite`, `ex`, `shiny` (null: not known), the boss as the catalogue knows it (`bossKey`, `bossDex`, `bossSpecies`, `bossForm`; a mega's form is `<SPECIES>_<MEGA…>`) or, where it does not, by the name it was given (`bossName`), `fastMove`, `chargedMove`. When (epoch ms): `createdAt`, `hatchTime`, `startTime` (trains and meetups), `endTime`, `endedAt` (null for the legacy parties of the cutover). How it ended: `ending` (below). Who: `createdById`, `conductorId`, only with that member's opt-in, else null; `anonymous` (the reporter asked not to be named in the post). Counts, so that the common questions need no join: `attendees` (members who signed up, also those who left), `interested`, `joined`, `here`, `done` (members by the furthest status they reached), the same with their +1s (`interestedHeads` …), `extras` (all +1s), `remote`, `departed` (left before the end); `routeStops` (a train's route at the end).
-- `PartyHistoryAttendee`: a row per member who signed up, in the order they did (`seq`): `memberId` only with their opt-in, else null (the row still counts); `status` at the end (null: they left before it), `furthest` (`interested`, `joined`, `here`, `done`; asked whether they completed it counts as `here`), `groupId`, `extras`, `remote`, `team`, and the times the bot saw (`signedUpAt`, `joinedAt`: first coming or further, `hereAt`, `doneAt`, `leftAt`; null in the legacy history).
+- `PartyHistory`: one row per ended party. `source` is `live` (with `partyId`, the `Party.id`, unique) or `legacy` (with `legacyKey`, `<channel>:<creation ms>`, unique). `kind` is `raid`, `train` or `meetup`. Where: `serverId` (the server's snowflake), `regionId`, `gymId`, `legacyGymId` (the legacy file's gym, kept also when the gym list no longer has it). None of them carries a foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither delete it nor split it; Matt, 2026-10-16), and a region or gym deleted later stays named by its id. What: `name` and `description` (trains and meetups), `tier` (`T1` to `T5`, `Mega`, `MegaLegendary`, `SuperMega`, `Elite`, and the legacy `T2`, `T4`, `EX`; null where not known), `shadow`, `mega`, `elite`, `ex`, `shiny` (null: not known), the boss as the catalogue knows it (`bossKey`, `bossDex`, `bossSpecies`, `bossForm`; a mega's form is `<SPECIES>_<MEGA…>`) or, where it does not, by the name it was given (`bossName`), `fastMove`, `chargedMove`. When (epoch ms): `createdAt`, `hatchTime`, `startTime` (trains and meetups), `endTime`, `endedAt` (null for the legacy parties of the cutover). How it ended: `ending` (below). Who: `createdById`, `conductorId`, only with that member's opt-in, else null; `anonymous` (the reporter asked not to be named in the post). Counts, so that the common questions need no join: `attendees` (members who signed up, also those who left), `interested`, `joined`, `here`, `done` (members by the furthest status they reached), the same with their +1s (`interestedHeads` …), `extras` (all +1s), `remote`, `departed` (left before the end, not by a split); `routeStops` (a train's route at the end); `splitFromId` (migration 020, below).
+- `PartyHistoryAttendee`: a row per member who signed up, in the order they did (`seq`): `memberId` only with their opt-in, else null (the row still counts); `status` at the end (null: they left before it), `furthest` (`interested`, `joined`, `here`, `done`; asked whether they completed it counts as `here`), `groupId`, `extras`, `remote`, `team`, and the times the bot saw (`signedUpAt`, `joinedAt`: first coming or further, `hereAt`, `doneAt`, `leftAt`; null in the legacy history); `splitOff` (migration 020: 1 for a member who left with a group split off the train, 0 otherwise).
 - `PartyHistoryGroup`: a row per group: `label`, `meetingTime` (the last one set, also after the clock cleared it), `members` and `heads` at the end.
 - `PartyHistoryStop`: a row per stop a train made, in order (`seq`; a loop makes a gym's stop twice): `gymId` (null where the gym list no longer has it, with `legacyGymId`), `arrivedAt`, `leftAt` (null where not known: the first stop is reached at the train's start when it was laid earlier; a legacy train's stops have no times).
 - `HistoryOptIn`: a row per member and server (by snowflake, no foreign key) who opted in.
-- `PartyHistoryStep`: what happens to an active party that its model does not keep (a member's status, a member who left, where a train is, a group's meeting time, the raid it went on from after a move), read into the party's record when it ends and then deleted; it goes with its `Party` row. It holds the ids of everybody in an active party, as the party's own row does, until the party ends.
+- `PartyHistoryStep`: what happens to an active party that its model does not keep (a member's status, a member who left, a member who went with a group split off a train (`split`), where a train is, a group's meeting time, the raid it went on from after a move), read into the party's record when it ends and then deleted; it goes with its `Party` row. It holds the ids of everybody in an active party, as the party's own row does, until the party ends.
+- Migration 020 (plan 8T): `PartyHistory.splitFromId`, in the record of a train that was split off another, that train's `partyId` (`char(36)`, null otherwise, no foreign key: a link only, each train is recorded on its own; Matt, 2026-10-17), with an index (`partyhistory_splitfromid_index`: the trains split off a train); `PartyHistoryAttendee.splitOff` (`tinyint(1) not null default 0`, written from `HistoryAttendee.splitOff`), so that SQL tells a member who went with a group from one who left. Each is added only when it is missing. `kind` of a step is `varchar(8)` since 018 and takes `split` as it is.
 - `EndedPartyPost`: the post and forum of a party whose `Party` row was deleted once its record was written, for what still reads them (below): no member, no party id. Its rows are kept for good, as the ended `Party` rows were before: the post can be reopened by a late message any time.
 - Text a member wrote (a train's or meetup's name, a meetup's description, a group's label) is kept with every member it names written `@member` (`withoutMembers`, `src/domain/history/party-history.ts`; mentions and bare ids of 17 to 20 digits, an emoji's tag stays), live and legacy alike.
 - `createdById` of a raid whose reporter asked not to be named in the post (`anonymous`) is kept all the same when the reporter opted in to the history: a statistic shown to others later must honour `anonymous`.
@@ -24,6 +25,7 @@ How a party ended (`ending`): `completed` whenever it took place (somebody compl
 - A record takes along only parties it went on from that have ended, locked first, and never walks past one that has not: a move that failed (the old raid stayed) leaves the old raid to its own record. Raids that moved before migration 018 have no `from` step: the old and the new party are each recorded, so such a raid counts twice.
 - A change that ends a party says why with `ended` in its result (`PartyEnd`): the scheduler `clock`; `PartyService.end` `cancelled` unless told otherwise; a deleted post `cancelled`; a raid that moved to another region `moved`; a party that never had its post `failed`, which is dropped. A change that says nothing is recorded as `unknown`. A raid that moved goes on as a new party whose first step (`from`) names the old one (and the old one's end writes it again): the new party's record takes the old one's steps and row along (one record, with the times from before the move; `createdAt` stays), and nothing records the old one by itself.
 - Members, the maker and the conductor are named as their opt-ins are when the record is written.
+- A train a group was split off (plan 8T) is recorded on its own, and so is the train the group became (`splitFromId` names the old one). A write that adds a split to `train.splitOff` notes who left in it as `split`, not `left` (`partySteps`): they are attendees of the old train up to the split (`leftAt` the split, `status` null, `splitOff` 1) and not `departed`. The new train is stored with its post before the old train loses the group, and is `pending` until the write that carries the group over (`train.splitFrom.pending`, `trains.md`): `partySteps` notes nothing of it while it is pending, and the write that settles it as if the train were new then. So its history starts at the split and holds nobody who never was on it (a member who left the group while the new post was made): its members sign up then (`joinedAt`, `hereAt` then for who is coming or here), its first stop is where it was split (reached at its start when split before it), and its record's `createdAt` is its first step, the split (the `Party` row's `createdAt` is when it was made, the time its post took before). A pending train that ends, or is taken back, is dropped (`drop`), as one that failed. A member who rode both counts in both.
 - Tests: `partyServiceWith()` records into `MemoryHistory` (`history`: `records`, `steps`, `posts`, `optIn(guildRow, member)`, `failing`; it shares the memory storage's rows and deletes them as the repository does) through `recorder` (`flush()` runs the tries that wait; over the database its tries go to `kept.historyStorage`; `sweep()` reads the storage's rows, and those in `storage.unreadable` as unreadable; the scheduler's upkeep runs it; `historySweepProgressEvery` sets its progress lines); `history-recording.db.test.ts` pins the repository; a `PartyRepository` in a test that expects no failure takes `HISTORY_MUST_NOT_FAIL`.
 
 ## The opt-in
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 65338ee99ec5d061f307906343875ac61601a3c9..c7b905abf6e532c764ece0bba44e45dea37b027e 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -42,7 +42,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS`, `inShownOrder`), the components in `src/render/v2.ts` (with `countComponents`, the count Discord's limit is about, the one every renderer uses); `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut. Every post says where the party is under **Where** (plan 8D, Matt, 2026-10-17, like the `/wild` report's Where; the layout below).
 - The layout of a post (plan 8D; Matt, 2026-10-17, mockup version 4): a heading block says what the party is, with the post's picture beside it (`accessory: 'picture'`): a raid `### Level 5 raid against Yveltal ✨` / `### Level 5 raid (egg)` (`heading`; the DM brief keeps the bold `headline`), its times or `closed`, `KEPT_OPEN`, then the boss's lines (`bossLines`: "Hatches as …" for an egg, weaknesses, catch CP, moves), which are no block of their own; a train `### Raid Train: <name>`, "After …", times, conductor, `KEPT_OPEN` and the boss's facts; a meetup its name and times. The gym's name no longer opens a raid's post (its thread title keeps it), and a copy's line (`lead`) still opens the first text. Then **Where**: for a raid and a train's current stop `gymWhere(heading, gym, fit)` (`src/render/raid-post.ts`): one line `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a link; `addressLine` made plain and cut to `ADDRESS_ROOM`; the one Map of the post, masked, in angle brackets so that it shows no preview), then the gym's notice (`plainLines`, cut to `LOCATION_ROOM` through `fit.part`), with the gym's picture from Wayfarer beside them (`placeSection`, a `PostThumbnail`; plan 8W-2: `Gym.imageUrl`, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept). Without an address the line is `**<gym>** · [Map](…)`; beside a picture it says `(no address available)` (`NO_ADDRESS`) so that the picture never sits beside a bare name, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) those words go with it (`PostThumbnail.withoutPicture`). A raid whose gym is gone says `**Unknown gym**`, without a map. No post says that a gym is an elite raid gym (Matt, 2026-10-17: it mattered for EX raids; the gym keeps its flags for staff's views, `/gym elite` and the `#elite-gym-raids` copies). A train's Where is in `trains.md`, a meetup's below ("Meetups and timed parties"). Everything from the sign-up lists down is as it was. The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more) once the trainers' details are back inside their sections (below).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
-- The trainers (`trainerBlocks`, plan 8D-F, Matt's mockup of 2026-10-17): the Discord app on a phone puts a section's button under its text whenever the text has more than one line, so the text beside a button is one line. With one group each status is a section of its heading alone (`**Interested (2)**`) with its button, and its names (`fit.list`) are the section's `details`, a text display right under it; with several each group's section holds only its heading line (`**Group A: label** · 3 trainers · meeting at …`) with its Join (the letter "A" with Join's icon), and its lobby note, its status lines (or "Nobody yet") are its details. The heading text of a single group with a label or a meeting time and the complete list of a raid of several groups stay texts. A raid that is not over (`meetHint`, plan 8D-F F4, Matt, 2026-10-17; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while there is none: with one group ``-# No meeting time yet: `/meet` sets one.`` (`NO_MEETING_TIME`) under the group's label, or as a heading text of its own without one; with several, groups with a time keep their "meeting at …" and one small-print text after the groups, ``-# `/meet` sets your group's meeting time.`` (`GROUP_MEETING_HINT`: `/meet` sets the meeting time of the member's own group), while at least one group that somebody is in has none. Both lines are the post's own (`postOnly` of a text block): a copy in another channel (`lead`: the remote, elite and region copies, where `/meet` does not work) leaves them out, the copy at the bottom of the post (`status`) keeps them. The worst raid without meeting times holds 40 with both pictures, one more group's lines beside its Join. Each details text is one component more: `postMessage` puts details back into their section (`content\ndetails`), the last first and as few as make the message fit `MAX_COMPONENTS`, before it leaves out the gym's picture (the least harm: a section with its details inside is how every post looked before), and into one text display where no button stands beside it (`controls: false`). The worst cases (5 groups, every control, both pictures): a raid would hold 43, so groups C to E keep their lines beside their Join and it holds 40 with both pictures; a train 43, three groups folded, 40; a raid of one group 35 (34 without Screenshot feedback), a meetup 28, nothing folded (before 8D-G, with the buttons below the lists in up to three rows: a raid 44, B to E folded; before 8D-F: 39, 38, 32, 25). Tests read a status with its names as one text through `partTexts` and the sections with their buttons through `sectionsOf` (`test/support/messages.ts`).
+- The trainers (`trainerBlocks`, plan 8D-F, Matt's mockup of 2026-10-17): the Discord app on a phone puts a section's button under its text whenever the text has more than one line, so the text beside a button is one line. With one group each status is a section of its heading alone (`**Interested (2)**`) with its button, and its names (`fit.list`) are the section's `details`, a text display right under it; with several each group's section holds only its heading line (`**Group A: label** · 3 trainers · meeting at …`) with its Join (the letter "A" with Join's icon), and its lobby note, its status lines (or "Nobody yet") are its details. The heading text of a single group with a label or a meeting time and the complete list of a raid of several groups stay texts. A raid that is not over (`meetHint`, plan 8D-F F4, Matt, 2026-10-17; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while there is none: with one group ``-# No meeting time yet: `/meet` sets one.`` (`NO_MEETING_TIME`) under the group's label, or as a heading text of its own without one; with several, groups with a time keep their "meeting at …" and one small-print text after the groups, ``-# `/meet` sets your group's meeting time.`` (`GROUP_MEETING_HINT`: `/meet` sets the meeting time of the member's own group), while at least one group that somebody is in has none. Both lines are the post's own (`postOnly` of a text block): a copy in another channel (`lead`: the remote, elite and region copies, where `/meet` does not work) leaves them out, the copy at the bottom of the post (`status`) keeps them. The worst raid without meeting times holds 40 with both pictures, one more group's lines beside its Join. Each details text is one component more: `postMessage` puts details back into their section (`content\ndetails`), the last first and as few as make the message fit `MAX_COMPONENTS`, before it leaves out the gym's picture (the least harm: a section with its details inside is how every post looked before), and into one text display where no button stands beside it (`controls: false`). The worst cases (5 groups, every control, both pictures): a raid would hold 43, so groups C to E keep their lines beside their Join and it holds 40 with both pictures; a train 44 with Split group… (plan 8T), four groups folded, 40 (43 and three folded before 8T); a raid of one group 35 (34 without Screenshot feedback), a meetup 28, nothing folded (before 8D-G, with the buttons below the lists in up to three rows: a raid 44, B to E folded; before 8D-F: 39, 38, 32, 25). Tests read a status with its names as one text through `partTexts` and the sections with their buttons through `sectionsOf` (`test/support/messages.ts`).
 - The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`): with one group a status's button stands beside its heading (`statusButton`: Interested, Join, Here, Done, an icon without a label, plan 8D-G, Matt, 2026-10-17: a phone drops a section's button under its line when the button is wider than it allows, and "🤔 Interested" was; the line says what the button does, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name after the line), with several the group's letter with Join's icon beside each group ("A", `joinGroupButton`, the action `group`: `AttendanceService.joinInto` makes the member coming in that group from any status, and only moves one who is coming; the Join of the member's own group changes only Interested and leaves Present, and a member who is asked whether they completed the raid, as they are; `/group join` keeps the status) and the statuses' buttons in a row below; then the rows of `bottomControls` (no Map: a post's one Map is in its Where, plan 8D): with several groups the statuses' row (Interested, Here, Done for a raid, Leave), then one row of Leave (with one group), −1, +1, Remote (not for an elite raid), Set time (a raid without times) and Screenshot feedback (a raid from a kept screenshot), cut into rows of five (Matt, 2026-10-17, plan 8D-G: a phone wraps a row as it likes; one row is one component fewer). So a raid of one group has one row, two only with Set time and Screenshot feedback both (the latter alone in the second); a raid of several groups two; an elite raid of one group one; a meetup one; a train one, or two with groups, every button with its emoji: buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin` (Join and a group's Join), `pinehere`, `pinedone`, `pineleave` (Leave, which keeps its word) and `pineremote` (Remote, which keeps its word), else the plain ones (🏃 ✅ 🎉 👋 📡); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`), and the bare form of a post or a copy (`hasBareForm`, `src/services/refused-files.ts`: `picture: false, customEmoji: false`), which is sent where Discord answers Invalid Form Body, shows the plain ones, so an emoji deleted from the application before the hourly re-read degrades the post instead of failing it; the renderers pass `view.emoji` (`ControlIcons`) to `statusButton`, `joinGroupButton` and `bottomControls`. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
@@ -62,7 +62,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 - `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, "Join B") are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
-- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 10 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; exactly the parts that fit the type must be present); versions 1 to 9 are still read (a train of them before 9 as `finish`, a meetup of them before 10 without a place).
+- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 11 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; exactly the parts that fit the type must be present); versions 1 to 10 are still read (a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another).
 
 ## The clock
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 6fd9fccde9f44a20bfdb875ff68d587284d596b5..f7ccacf33d9ae52919adc58dff5ac2964ea45894 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -42,7 +42,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Trains
 
-- Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`). Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`.
+- Trains in tests: `testTrain()`, `asTrain()` (`test/support/parties.ts`), `createdTrain()` and `trains` of `partyServiceWith()` (`test/support/party-service.ts`), `MemorySavedRoutes` (`test/support/saved-routes.ts`). Lines and the movement announcement go out on `attendance.flush()` and `trains.flush()`. A split (plan 8T) goes through `made.trains.split` (the service's `splits` is the party service); what happens while the new post is made is tested by holding `gateway.createPost` (`holdPost` in `train-split.test.ts`, as the relocate tests do; it moves the clock on as making a post takes time), what happens between the new post and the old train's change by holding a write of the old train (`holdOldTrain`), a failed write by `failingSaves`, and a stop in between by `restarted(made)` and `settlePendingSplits()`; a train's ids sort by `createdAt` and then id, so a test finds the new train by its id, not by its place in `store.active()`.
 
 ## Wayfarer
 
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 45344892fadda15fb364c2f0fa8baff54dab1d01..a23c2fb0c4441a6d9a5e6ba36deb812477d87117 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -22,6 +22,17 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
 - A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Then a row (a `controls` block: a section's one accessory is the picture): the grey "Move train…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; also on a finished route: Previous and Reverse take a Finish back) and on a route longer than `WHOLE_ROUTE_STOPS` "Whole route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then. "Move train…" answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel`, `pressTrainPanel`, `pressReverse`, `pressAtEnd` in `src/commands/trains/move.ts`): a components-v2 message (plan 8B-3), one container of `TRAIN_PANEL_COLOUR` with `### Move the train`, where the train is and what Next does (`At stop 2 of 4: …`, `Next is …`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`), the four moves with their emoji (switched off where `cannotMove` says), "🔃 Reverse the route" where `cannotReverse` allows it, and under `**At the end of the route**` a menu of the three modes with the train's own as the default (its labels say each in full, "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", since a closed menu shows the label alone; `/train`'s choices keep `AT_END_LABELS`). Its controls are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next, Previous and Skip also the gym they lead to), `party:<id>:reverse:<place>:<first>` (`first`: the gym the route began with when drawn, so that a second press or a panel drawn before another member's Reverse is refused `route-changed` instead of flipping the route back) and the menu `party:<id>:atend:<place>` (a `select` of `partyButtons`): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew with the reason above where the train is; a member who may no longer move it (also after a mode they were allowed to set), a train without a route and one that ended get `panelNote` (no controls). A panel press calls `update` with `v2Answer` and never goes through `answerClick`; a press on a plain-text panel from before 8B-3 updates it to `OLD_PANEL` and sends the new panel as a private follow-up (whether Discord takes a v2 interaction update of a classic message is not known and not tried: the follow-up is the safe path). Command answers (`/next` and the others) keep the panel's `whereText`. The DM brief of a train is unchanged (`placeLine`).
 
+## Splitting a group off
+
+- A group of a train can become a train of its own (plan 8T; spec `2026-10-17-train-split-design.md`; Matt, 2026-10-17: faster players go on at their own pace instead of per-group positions on one train). Who may is `mayNotSplit` in `train.ts`, beside `mayNotArrange`: never a train of one group (`one-group`), one without a post yet (`unposted`: the new train links to it), a group it does not have (`no-such-group`), an empty one (`empty-group`) or one that everybody on the train is in (`whole-train`, Matt, 2026-10-17: the old train would be left empty; the words name the group, `Everybody on this train is in group B (Fast): there is nothing to split it from.`, `splitRefusal`); staff and the conductor any other group; a member of the group (any status) their own (`not-in-group`, "Only a group's members, the conductor and the moderators can split a group off.") unless the conductor is in it (`conductor-in-group`). `splittableGroups` is what the menu and the autocomplete offer; `splitsPossible` (two groups or more with somebody in them) whether the post shows the button.
+- The pure parts (`train.ts`): `splitTrain(old, { id, by, anonymous, group, now })` is the new train: `<old name> (<label or letter>)` cut to `MAX_PARTY_NAME` (the group keeps at least half of the room), the same server and region, route, stop, `finishedFrom`, mode, boss, start and end (through `withTrain`), one group A with the group's label, the group's members as they are in A, made now by the presser (named unless their privacy is Anonymous; `makerName` is noted by the service), led by the old conductor who goes with the group, else the presser in it, else nobody, with `train.splitFrom` (the old party and post, `pending: true`). `splitOffGroup(old, member, staff, group, link, drawn?)` is the old train without the group and its members: the other groups keep their letters, the newest left takes new sign-ups when the newest went, its conductor stays unless they went, `train.splitOff` gains `{ partyId, postId, group, label? }` newest first (at most `MAX_SPLITS_KEPT`, 10); it answers the members who moved (`moved`), the group, who leads the new train and the old train as it was then (`was`: its train part, start and end). `drawn` is the group's mark as the confirmation showed it (`groupMark`, FNV-1a in base 36 of the label and the party id of the newest `splitOff`): refused `group-changed` when the label changed, the group went, or another group was split off since, so a letter given again (even with the same label) is never taken for the group that had it. `splitDrawn(train, group, mark)` is the split a stale mark was drawn for when that very group is the one split off last. `carriedSplit(target, start, moved, conductor, was?, now?)` brings the new train in line with the group as it was at the split, and with the old train's place and times then unless they were changed on the new train meanwhile (as for the conductor); the very same train when that changes nothing. `splitSettled(train, old?)` clears `pending`; with the old train it also drops who is still on it with the record the new train was made with (but for the group); when its conductor is one of them, the lead falls as at the split, to the presser while still on it, else to nobody. A group opened after a split takes a letter that no group has and no split named, the first after the last in use, else the first such; when every free letter was a split's, the first free one (`nextGroupId`, `attendance.ts`): a letter can come again only then, and the mark keeps a stale confirmation from taking the new group for the old.
+- `PartyService.splitTrain` (`ctx.trains.split`, `TrainService.split`, which adds the lines) does it as `relocate` does a raid's move, one split of a train at a time: refusals known at once are answered before anything is made (`no-forum` also when the region's forum is not the old train's); the new train is stored, pending, and gets its post in the same forum (`createTracked`: link line, summary, region copies follow; no new-train DMs); then the old train loses the group inside the store, which decides anew; a refusal there (the presser left, the label changed, a second split), an old train that ended, a new train that ended meanwhile (its post deleted: `no-post`), or a failure takes the new train back (`takeBack`: its post and link line deleted, dropped from the history as never having been a party). Who is in the group at the moment of that change goes: a Leave or a Join on the old post while the new post was made counts, and the carry-over write (`carriedSplit`, then `splitSettled`) drops from the new train who left the group, adds who joined it, keeps what members did on the new post meanwhile (who left the new train stays out), puts it where the old train was at the split (a Next or a route edit meanwhile) and settles it. Nobody is in both trains or in neither once it settles, and the old post is never touched but by its line.
+- The window, as `relocate` documents its own: a carry-over write that fails is tried once more; when that fails too, the new train is settled as the old train says (`settleSplit`, logged as an error), and stays pending when even that write fails. A stop of the process between the new post and the carry-over leaves the new train pending too (`train.splitFrom.pending`, in the state document). `settlePendingSplits` settles them, each under the moves lock of its old train: once Discord is there after a start (`app.ts`: taking one back deletes a post), and with the clock's hourly upkeep those made a minute ago or more (`PartySchedulerOptions.splits`: the old train's moves lock keeps a split under way apart from the upkeep, which finds it settled once it has the lock; the minute's age only spares it waiting behind one), logging how many it settled and took back only when it did any. A pending train whose old train lists it in `splitOff` is settled with its members as stored, without those still on the old train as the new one was made with them (`splitSettled(train, old)`: they changed group while the new post was made, and stayed); one whose old train is no longer active is settled as it is (the group is on no other train); one whose old train is active and does not list it (it never lost the group) is taken back. Then a member who left the train while the new post was made is on the new one (it was stored with them), and one who joined the group on neither (they went with the group, and the new train was stored before): the window is one database write wide.
+- Then the old post says `<doer> split group B (Fast) off into a train of its own.` (a line, no ping) and the new post `<doer> split this train off with group B (Fast).`, pinging the members who moved and allow `mentions`, never the presser (`doer`: a maker who asked not to be named is not; `This train was split off with …` then).
+- The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "✂️ Split group…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out) stands in the row of Move train… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 40 components with `postMessage`'s fold of four groups' details (44 unfolded).
+- The confirmation (`splitConfirmation`, `src/render/train-split.ts`; handlers `openSplit`, `pressSplit`, `cancelSplit`, `pickSplit` and `/group split` in `src/commands/trains/split.ts`): a private components-v2 message of `TRAIN_PANEL_COLOUR`, `### Split a group off the train`, what becomes of the group, the same route and stop, who moves (ten names and how many more), who leads which train, a menu of the groups when the member may split more than one (`party:<id>:splitpick`), "✂️ Split it off" (danger, `party:<id>:splitgo:<group>:<mark>`) and "Cancel" (`party:<id>:splitno`). "Split it off" first updates the confirmation to a note without controls (`Splitting group B (Fast) off…`, `splitNote`: nothing more can be pressed on it while the new post is made), then edits in the outcome: `Split off: <#post>`; a refusal draws the confirmation anew with the reason when the member may still split a group, else the reason alone; a train that ended meanwhile `This train is over.` A second press of the same confirmation waits for the first (one split of a train at a time) and is refused `group-changed`; `splitDrawn` sees that very group went, and it says `Split off: <#post>` too (`kind: 'already'`). The words are `splitGroupAs` (`train-changes.ts`), the code path the map can call later; `/group split letter:` answers with the same confirmation, its autocomplete only the groups the member may split.
+- The history records each train on its own (`history.md`: the step `split`, `PartyHistoryAttendee.splitOff`, `PartyHistory.splitFromId`; a pending train has no history until it is settled).
+
 ## Saved routes
 
 - Saved routes are the legacy table `SavedRoutes` behind `SavedRouteRepository` (per member and region, at most `MAX_SAVED_ROUTES`, the same name without case replaces; `save` and `remove` lock the member's `User` row first). A saved route keeps the order of its stops and the train's mode (`SavedRoutes.atEnd`, migration 013, `varchar(10)` defaulting to `finish`, which covers the legacy bot's inserts; a value this code does not know reads as `finish`; `SavedRoute.atEnd`; starting the bot migrates, so a dev database must hold 8W-1's 012 before this branch starts on it: Kysely refuses 012 after 013 has run, and a database with 012 refuses a branch without it ("previously executed migration ... is missing"); if 013 ran first, delete its row from `kysely_migration` and start again, 013 does nothing when the column exists): `/route save` writes the train's, `/route load` sets both (`replaceRoute(…, atEnd)`), `/route show` ends with `atEndSentence` on a route of two stops or more; the private answers of save and load always say the mode, the public "loaded" line in the post only when it is not `finish`. The `route` option's autocomplete value is `id:<n>` (`SAVED_ROUTE_CHOICE`); anything else typed is a name. `/boss` in a train goes through `trainBoss` (`raid-input.ts`): tier words are ignored, any Pokémon the catalogue names is accepted, `none` clears; `reportedBoss` is for raids only.
diff --git a/docs/superpowers/plans/2026-10-17-phase-8t-staging.md b/docs/superpowers/plans/2026-10-17-phase-8t-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..5ee1c2aee44160887eb99f2b3e652d7db0c1368e
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8t-staging.md
@@ -0,0 +1,59 @@
+# Phase 8T staging checklist: splitting a group off a raid train
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Three accounts, named here by who they play: **Ash** (Matt's account, a Moderator: the staff steps), **Dawn** (the second account) and **Iris** (a third account, needed where a group must hold two members or where one member presses while another is in the group: steps 10 to 13). Where a step needs only two, Iris stays out. The approved mockups are `split-v1.html` (sections 1 and 2: the button, the confirmation) and `split-v2.html` (section 3, draft 2: both posts afterwards) in `.superpowers/sdd/2026-10-17-phase-8t-train-split/`; compare each message with its card. The design is `docs/superpowers/specs/2026-10-17-train-split-design.md`.
+
+## Before
+
+1. `/group` has a new subcommand `split`: register the commands again, only on Matt's go-ahead (`npm run deploy-commands -- --global`, or `./pine deploy-commands --global` in the stack; the dev application is registered globally only). A client may need a restart (Ctrl+R) to show it.
+2. Migration 020 runs when the bot starts (or `npm run migrate`). Stage this only on a branch that has 8S-1's 019 too (merged first, or merged before staging): Kysely refuses a migration that sorts before one already run, so a dev database that ran 020 without 019 refuses 019 later ("previously executed migration ... is missing" the other way round; the way out is CLAUDE.md's for 013: delete 020's row from `kysely_migration` and start again, 020 adds only what is missing). Check `kysely_migration` lists 018, 019, 020; `describe PartyHistory` shows `splitFromId char(36)` after `routeStops`, `show index from PartyHistory` an index `partyhistory_splitfromid_index` on it, and `describe PartyHistoryAttendee` shows `splitOff tinyint(1) NOT NULL default 0` after `leftAt`.
+3. The party document is version 11 (a train's splits; the new train of a split carries `splitFrom.pending: true` until the group is carried over, a moment after its post is made). Once the bot has written a version 11 document, a bot from before this plan cannot read that party (any party it wrote, not only trains): do not go back to an older branch on the dev database while a party written by this one is active. Migration 020 is additive: older code runs on the database as before.
+
+## A train before its start, split by a group member (no conductor)
+
+4. Ash makes a train (`/train name:Saturday Loop`) with a start in an hour (`/meet`), a boss (`/boss`) and seven stops (`/route add`), mode loop (the panel's menu). Ash is in A. Dawn opens group B (`/group new`) and labels it (`/group label text:Fast`). The post now shows "✂️ Split group…" in the row of Move train… and Whole route (card 1A); with one group it was not there, and with group B opened but empty (before Dawn moved into it) it was not there either.
+5. Dawn presses Split group…: privately, the confirmation (card 2): `### Split a group off the train`, "Group **B (Fast)** leaves **Saturday Loop** and becomes a train of its own, **Saturday Loop (Fast)**:", the same route at stop 1 of 7, "not started yet", "Dawn moves to it as they are signed up now", "you are its conductor"; no menu (one group to split); Split it off (red) and Cancel.
+6. Cancel: the confirmation says "Nothing was split off." and has no controls; nothing changed in the post.
+7. Split group… again, then Split it off: at once the confirmation says "Splitting group B (Fast) off…" without controls, then "Split off: <link>"; the link opens the new post. The new post (card 3, draft 2): `### Raid Train: Saturday Loop (Fast)`, the same start, boss and mode, `Conductor: Dawn`, then the boss's facts, and last in the heading the small print "Split off from <old post>"; the same stop, its Next line; group A only, labelled Fast, Dawn in it; "Created by" Dawn. Its thread's first line: "**Dawn** (@Dawn) split this train off with group B (Fast)." with no ping (Dawn is the presser and the only member).
+8. The old post: small print "Group B (Fast) went its own way: <new post>" last in its heading, group A only (Ash), no Split group… any more; its thread: "**Dawn** (@Dawn) split group B (Fast) off into a train of its own." Both links show the posts' titles (Train · …).
+9. Nobody got a new-train DM for Saturday Loop (Fast) (an account with `/settings new-trains` on in this server: none arrives).
+
+## A group that is the whole train, and an Anonymous presser
+
+10. A new train by Ash; Dawn and Iris open group B and join it; Ash leaves the train (Leave), so group A is empty: Split group… is gone from the post. Dawn's `/group split letter:B`: "Everybody on this train is in group B: there is nothing to split it from." (with its label if it has one). Ash presses group A's Join (the "A" with the shoe; a plain sign-up would go to the newest group, B, and leave the train one group's): the button is back.
+11. Dawn sets `/settings privacy` to Anonymous and splits group B off: the new post names no maker ("Created by" absent, as for a `/train` made anonymously), its first line "This train was split off with group B." and pings Iris only (if Iris allows mentions); the old post's line still names Dawn ("**Dawn** (@Dawn) split group B off into a train of its own.": she did not make the old train, and only a maker's privacy hides who did something in a post, `doer`). Dawn sets her privacy back.
+
+## Mid-route, split by the conductor
+
+12. A second train, all three in it; Ash takes the conductor (`/conductor set`), moves it to stop 3. Dawn opens group B and Iris joins it. Ash (not in B) presses Split group…: the menu lists A and B (the conductor may split any), A chosen (Ash's own group); pick B in the menu: the text is for B, "it has no conductor; you stay the conductor of …".
+13. Split it off: the new train has no conductor and is at stop 3; Dawn and Iris are pinged once in the new post's first line (if their `/settings mentions` allows it; turn it off for Iris and check she is not pinged); Ash is not pinged.
+
+## A group with the conductor in it, pressed by another member
+
+14. A train where Dawn is the conductor and in group B with Iris. Iris presses Split group…: "The conductor is in that group: only they and the moderators can split it off." Dawn may (her confirmation: "you are its conductor, and <train> has none then"); after the split the old train has no conductor.
+
+## Staff, a finished route, stale and double presses, an ended train
+
+15. Ash as the Moderator, not signed up in a train of step 4's kind that Dawn made (Dawn in B, Iris in A; or Ash's own train after Ash pressed Leave), presses Split group…: the menu of every group that has somebody; splitting B: "it has no conductor" unless the conductor is in B. The new post says "Created by" Ash although Ash is not on it, and pings Dawn. `/group split letter:B` gives the same confirmation; its autocomplete offers only the groups the account may split (Iris sees group A only; somebody in no group sees none).
+16. A train whose route is finished (Finish on the panel), with groups A and B: split B: the confirmation says "the same route, finished"; the new train's post says Route complete, and Previous on its panel goes back to the stop the old train finished from.
+17. Stale confirm: Dawn opens the confirmation for B, then Iris relabels B (`/group label`); Dawn's Split it off: the confirmation drawn anew with "The groups of this train changed meanwhile." above, for B as it is called now.
+18. Quick double press: Dawn opens the confirmation for B and presses Split it off twice as fast as she can (or Dawn and Iris each open one and press at once): one new train only; each press ends as "Split off: <link>" (the second waits for the first). A confirmation for B opened before somebody else split B off says "Split off: <link>" too.
+19. A group opened after a split takes a new letter: after B went, `/group new` opens C, not B again.
+20. A confirmation of a train that ended meanwhile (`/delete` it as Ash): Split it off says "This train is over."
+21. `/group split` in a raid's post: "This is the post of a raid: that only works in the post of a train."; in a meetup's post "This is the post of a meetup: that only works in the post of a train."
+
+## Copies, map, restart, history
+
+22. A train with a stop in another region, split: the new train has its copy in that region's channel, without Move train… and without Split group…; the old copy keeps its small print.
+23. The live map shows both trains, each at its stop, with its own members; joining the new one from the map works.
+24. Split the same train a second time (a new group, split): the old post lists two lines, newest first.
+25. Restart the bot: both posts are as before (version 11 read back), the buttons work; the log has no "settled the new trains of splits that were left pending" (nothing was pending). In the dev database no active train is left pending (`select id from Party where status = 'active' and json_extract(state, '$.train.splitFrom.pending') is not null` returns nothing).
+26. End both trains of step 7 (`/delete`, or let the clock end them): in the dev database, the old train's `PartyHistory` row has `splitFromId` null and counts Dawn as an attendee but not `departed`; her `PartyHistoryAttendee` row there has `status` null, `leftAt` the split and `splitOff` 1 (every other row `splitOff` 0); the new train's row has `splitFromId` = the old train's `partyId`, its `createdAt` the split (a few seconds after the new post was asked for), and Dawn's `signedUpAt` the split too. No `PartyHistoryStep` row of either train is left.
+
+## Help and phone
+
+27. `/help group split` reads whole, with the example `/group split letter:B`; `/help group` lists it as "`/group split <letter>` Split a group off this train into a train of its own".
+28. On the phone: the post's button row with Split group… (three buttons), the confirmation and its menu, both posts' small print links.
+
+## Rollback
+
+Once the bot writes version 11 documents, older code cannot read those parties (a code rollback must wait until they have ended, or they are left unread by the old bot). Migration 020 only adds a column to each of two tables and an index; nothing to undo in the database.
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 3a43debdb6419ded41547e98046055e1e64f516d..27e235deabcb48346217ee4ca55baeb776a7e27c 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -72,6 +72,11 @@
  * `<first>` the gym the route began with, so that a panel reverses it once), and the
  * select menu of what the train does at the end of its route `party:<id>:atend:<place>`, whose
  * value is `finish`, `loop` or `turn-back`. A press decides anew against that place.
+ * "Split group…" (`party:<id>:split`, plan 8T) opens a private confirmation whose controls are
+ * `party:<id>:splitgo:<group>:<mark>` (the group's letter and `groupMark`, so that a press for a
+ * group called otherwise, gone, or given its letter again after a split is refused),
+ * `party:<id>:splitno` and the menu
+ * `party:<id>:splitpick`, whose value is a group's letter.
  *
  * The buttons of a member's own list have the kinds `wantlist` (`/wants`) and `targetlist`
  * (`/targets`; the kinds `wants` and `targets` are the questions of `/unwant-all` and
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8t HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8t-train-split.md'` prints nothing; `npm run check`, `npm run build`, `npm run test:db`, one after the other through the npm scripts.
2. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8T"), the Gantt chart and memory; tell the sessions of the web map (migration 020 / 021: first merge wins) and of meetup safety that 8T is merged.

## Staging checklist

`docs/superpowers/plans/2026-10-17-phase-8t-staging.md` (task 6): on the dev application and the test server, each step with Matt's go-ahead, starting with registering the commands again (`npm run deploy-commands -- --global`) on a database that already has migration 019.
