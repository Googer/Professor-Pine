# Phase 8X-1B: One Layout of Buttons, Group… and Meet…: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The party posts' buttons as one layout for one group and several, and the dialogs that replace typed commands (design `docs/superpowers/specs/2026-10-20-join-group-meet-buttons-design.md`, decisions 1–9, approved by Matt 2026-10-20; mockup https://claude.ai/artifact/GQCrLuouMyfqLR1kNnNnkw). In detail:

- **One layout** for raids and trains with one group or several: the statuses as text lines under each group's heading (`Coming (3): Ash +1, Misty`, a status nobody is in without a line); three rows at the bottom: Interested, Join, Here, Done (raids), Leave; Meet… (raids), −1, +1, Remote (icons only); Group…, Set time (while a raid has no times, in Meet…'s place), Screenshot feedback / Move train…, Split group…, Whole route. The letter buttons are gone. Meetups keep rows 1 and 2.
- **Which group, for a newcomer:** in a post of several groups, Interested, Join and Here ask a member not signed up which group, in a radio dialog ("Any group with room" first where the party has a lobby size, else the newest group first); a signed-up member's press changes their status in their own group. Done never asks. +1, −1, Remote and the commands place silently as before.
- **Group…** (always shown, disabled while nobody is signed up): move to another group or open a new one with an optional label; a member not signed up is signed up as Coming in the group they choose; a member alone in a group of their own is not offered a new group.
- **Meet…** (raids): the group's meeting time chosen from the in-game RSVP times (the hatch, then every 15 minutes while the raid lasts) and the round 5-minute times of the next hour, at most 24, "No meeting time" when one is set; `/meet`'s rules and throttle.
- **Empty groups are pruned** inside `PartyStore` after every change that returned a new party (unless labelled or with a meeting time; never the last group); letters are not renamed. A **stamp per group** (`PartyGroup.opened`) names a group across time in every dialog, the split's group mark and the history: **party state version 12**.
- **The web map** asks a newcomer which group in its popup, by the same rules.

**Architecture:**

- **Domain** (`src/domain/party/`): `PartyGroup.opened`, `groupStamp`, `stampedGroup`, `newestFirst` (`party.ts`); `pruneGroups`, `openedGroup`, `joinStamped`, `joinChosen`, `newGroupChangesNothing` (`attendance.ts`); `meet-times.ts` (`rsvpTimes`, `meetTimes`, `setMeetingTimeAsDrawn`); `party-state.ts` version 12; `groupMark` `<stamp>.<hash>` (`train.ts`); the history's meeting steps name `B:<stamp>`.
- **Store:** `PartyStore.update` and `updateBoth` prune only when the change returned a new object, and keep `updatedAt` at least the newest stamp.
- **Discord:** `src/render/party-controls.ts` (the rows), `party-post.ts` (status lines), `src/discord/dialog.ts` (a choice picked to start with, a dropdown for long lists, a text field), the which-group, Group… and split dialogs in `src/components/party.ts` and `src/commands/trains/split.ts`, Meet… in `src/commands/parties/meet-dialog.ts` and `src/render/meet-dialog.ts` (its own custom-id kind `meet:`), `PARTY_ACTIONS` / `RAID_ACTIONS` in `src/discord/custom-id.ts`.
- **Web:** `pressBodySchema` takes a group with join, interested and here (`joinChosen`); the popup's group menu (`src/web/client/`).

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Vitest. No new dependency, no migration; **party state version 12** (versions 1–11 read as before). No command definition changes (help texts only); a new application emoji `pinemeet` (the game's Select Time icon) is pending: ⏰ until Matt uploads it.

**Spec:** the design above and the brief `.superpowers/sdd/8x-1b-buttons/design.md` (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8x1b`, tip `3cb122c2`), one commit per task, on `max-battles` fe4f9ea2 (typescript-migration c5472c6d and the design). Each commit typechecks and its unit tests pass; on the tip the full check (8087 tests), the build and the database suite are clean.

**Reviews:** an Opus reviewer went through the prototype (one Important: Meet… decided outside the store, so a Group… move queued before its Submit set the new group's time; eight Minor: the map's Join with a group, strictly increasing stamps, the RSVP cap, a new group that changes nothing in a post of several groups, a database test of the history through the store, the split picker's order, two tidy-ups), then the fix round (ready; one Minor, stamps across a prune within one millisecond, folded in). Every finding is in the commits below.

## Decisions in this plan

Made while prototyping and reviewing, for Matt to look at:

1. **The split picker** puts the largest group other than the presser's first and the presser's own group last, none marked (Android selects the first radio choice itself; a hurried Submit must not split the conductor off). Matt, 2026-10-20: taken for now, staging checks Android.
2. **The first group carries no stamp**: it counts as the party's creation, so documents of versions 1–11 read unchanged.
3. **Pruning** keeps the default group when every group is empty; on a stamp tie the later group in the list is the newer.
4. **Status lines:** Interested, Coming, Here, Done, each with its button's icon; with one group Done is the group's last line, with several a text of its own after the groups. One group has no letter heading unless labelled; "Nobody yet" while empty.
5. **The meeting-time hint** names the groups without a time ("Group B has no meeting time yet: ⏰ sets your group's."), only on a raid with times, and now in copies too (Meet… works there).
6. **Icons:** −1 and +1 as plain ⬇️ ⬆️; Leave and Remote without labels; Group… 👥 with its label; `pinemeet` listed as pending, not uploaded (the uploader reports a missing file and exits 1).
7. **Old letter buttons** (`party:<id>:group:<letter>`) of a post not yet redrawn still join that letter; once the letter is gone they answer "This raid has no such group."
8. **Meet…'s Submit is a custom-id kind of its own** (`meet:<party>:time:<group>:<stamp>`), so the live map's shared throttle key `component:party` is unchanged; a refusal in a varied window names only the command ("You can use /meet again in …").
9. **Group… counts in the post's presses window** (`ACTION_THROTTLE`, the limit `/group` has).
10. **The map** names the group by letter only (it has no stamps); Join with a group follows the dialog's rule (a member who signed up meanwhile keeps their group).

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8x1b`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock), one at a time. Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **Decisions inside the store:** pruning, the stamps and every dialog's Submit (which-group, Group…, Meet…, split) decide inside `PartyStore.update`'s callback; a group pruned and reopened under its letter is never mistaken for the old one.
2. **State version 12** reads versions 1–11 as before; the history matches groups by letter and stamp.
3. **Discord's limits:** components per post (at most 32 of 40), radio choices 2–10, select options up to 25, the post's text budget.
4. **Unchanged behaviour:** silent placement by +1, −1, Remote and the commands; meetups; trains' copies; `/meet`.

### Task 1: 8X-1B task 1: a stamp per group, empty groups pruned, state version 12

Prototype commit: `37e66d3f67fda5d2cc5829b21267a49eec479ab3`

A group remembers when it was opened (PartyGroup.opened; a group of an
older document, and a party's first group, count as opened with the
party: groupOpened, groupStamp, stampedGroup). PartyStore.update and
updateBoth prune the groups nobody is in from every change that returned
a new party (pruneGroups: never one with a label or a meeting time, never
the last; the newest left becomes the default). The train split's mark
carries the stamp, so a Submit for a group that went or was opened again
under its letter is refused as no such group; the history keeps a
meeting time with the group by letter and stamp. State document v12.

**Files:**

```
 src/commands/parties/attendance.test.ts          |   5 +-
 src/commands/parties/in-train.test.ts            |  12 +++-
 src/commands/trains/split.test.ts                |  17 +++++
 src/commands/trains/train-changes.ts             |   4 +-
 src/components/party.test.ts                     |   6 +-
 src/components/party.train-copy.test.ts          |   7 +-
 src/db/repositories/history-recording.db.test.ts |  59 +++++++++++++++
 src/domain/history/party-history.test.ts         |  56 ++++++++++++++-
 src/domain/history/party-history.ts              |  22 +++++-
 src/domain/party/attendance.prune.test.ts        | 168 +++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/attendance.test.ts              |   5 +-
 src/domain/party/attendance.ts                   |  87 ++++++++++++++++++----
 src/domain/party/party-state.test.ts             |  59 +++++++++++++--
 src/domain/party/party-state.ts                  |  80 ++++++++++++++++++---
 src/domain/party/party.ts                        |  48 ++++++++++++-
 src/domain/party/train-split.test.ts             |  35 ++++++++-
 src/domain/party/train.test.ts                   |   8 ++-
 src/domain/party/train.ts                        |  38 +++++++---
 src/services/attendance-service.test.ts          |   5 +-
 src/services/attendance-service.ts               |   7 +-
 src/services/party-service.ts                    |   1 +
 src/services/party-store.test.ts                 |  58 ++++++++++++++-
 src/services/party-store.ts                      |  37 +++++++---
 src/services/raid-change-service.test.ts         |   2 +-
 src/services/train-split.test.ts                 |  11 ++-
 25 files changed, 764 insertions(+), 73 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/attendance.test.ts src/commands/parties/in-train.test.ts src/commands/trains/split.test.ts src/components/party.test.ts src/components/party.train-copy.test.ts src/domain/history/party-history.test.ts src/domain/party/attendance.prune.test.ts src/domain/party/attendance.test.ts src/domain/party/party-state.test.ts src/domain/party/train-split.test.ts src/domain/party/train.test.ts src/services/attendance-service.test.ts src/services/party-store.test.ts src/services/raid-change-service.test.ts src/services/train-split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 37e66d3f67fda5d2cc5829b21267a49eec479ab3 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-1B task 1: a stamp per group, empty groups pruned, state version 12`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/attendance.test.ts b/src/commands/parties/attendance.test.ts
index 5f996dfce42b3b0fda7c3737215bb2da7ba9e7dc..fa7d26942945d7f1a0a5aab2b5a6b686e4d5185f 100644
--- a/src/commands/parties/attendance.test.ts
+++ b/src/commands/parties/attendance.test.ts
@@ -287,7 +287,10 @@ describe('/group', () => {
 
   it('new is refused when there are five groups', async () => {
     const made = await setup();
-    for (let n = 0; n < 4; n++) await made.run('group', {}, { subcommand: 'new' });
+    // Each by somebody else: a group its one member leaves goes (plan 8X-1B).
+    for (const userId of [ALICE, BOB, CAROL, '200000000000000005']) {
+      await made.run('group', {}, { subcommand: 'new', userId });
+    }
     expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
       'A raid cannot have more than five groups.',
     );
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index 599ee7bda3d21ec009be5ec09e327fb8c7459b25..d6c88cfa8274d14b301f2d49a745f08344540934 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -273,7 +273,10 @@ describe('the attendance commands in the post of a train', () => {
       'You are coming with 1 more, in group B (by car).',
     );
     expect(await made.answer('join', { group: 'D' })).toBe('This train has no such group.');
-    expect(made.current().groups).toEqual([{ id: 'A' }, { id: 'B', label: 'by car' }]);
+    expect(made.current().groups).toEqual([
+      { id: 'A' },
+      { id: 'B', label: 'by car', opened: expect.any(Number) as number },
+    ]);
     // The list of groups offers them.
     const typing = await made.handle(
       fakeAutocomplete({ commandName: 'join', ...made.inPost, focused: '', focusedName: 'group' }),
@@ -289,7 +292,10 @@ describe('the attendance commands in the post of a train', () => {
       'A',
       'B',
     ]);
-    for (let n = 0; n < 3; n++) await made.run('group', {}, { subcommand: 'new' });
+    // Each by somebody else: a group its one member leaves goes (plan 8X-1B).
+    for (const userId of [BOB, CAROL, '200000000000000005']) {
+      await made.run('group', {}, { subcommand: 'new', userId });
+    }
     expect(await made.answer('group', {}, { subcommand: 'new' })).toBe(
       'A train cannot have more than five groups.',
     );
@@ -307,7 +313,7 @@ describe('the buttons of a train post', () => {
     expect(sent((await made.click('here')).reply).content).toBe(
       'You are here with 1 more, remotely.',
     );
-    await made.attendance.newGroup(made.party.id, { id: REPORTER });
+    await made.attendance.newGroup(made.party.id, { id: BOB });
     // Join B makes a member who is here coming in group B; what else they gave stays.
     expect(sent((await made.click('group:B')).reply).content).toBe(
       'You are coming with 1 more, in group B, remotely.',
diff --git a/src/commands/trains/split.test.ts b/src/commands/trains/split.test.ts
index 64a8cfdaf9f8dbf74af67dab1f6e4cfc31533de5..5878fb9ad200600f2fac01cad01dc727a0a2c80a 100644
--- a/src/commands/trains/split.test.ts
+++ b/src/commands/trains/split.test.ts
@@ -251,6 +251,8 @@ describe('the button "Split group…" of a train post', () => {
   it('says so when everybody on the train is in that group', async () => {
     const made = await setup();
     // The maker and Carol leave group A: Alice and Bob in B are the whole train.
+    // A keeps its label, so it stays when it empties (a group nobody is in goes, plan 8X-1B).
+    await made.attendance.labelGroup(made.party.id, { id: REPORTER, name: 'Ash' }, 'Slow');
     await made.attendance.leave(made.party.id, { id: REPORTER, name: 'Ash' });
     await made.attendance.leave(made.party.id, { id: CAROL, name: 'Carol' });
     const pressed = await made.click(`party:${made.party.id}:split`);
@@ -267,6 +269,8 @@ describe('the button "Split group…" of a train post', () => {
     const made = await setup();
     const refused = async () =>
       sent((await made.click(`party:${made.party.id}:split`, STAFF)).reply).content;
+    // A keeps its label, so it stays when it empties (a group nobody is in goes, plan 8X-1B).
+    await made.attendance.labelGroup(made.party.id, { id: REPORTER, name: 'Ash' }, 'Slow');
     await made.attendance.leave(made.party.id, { id: REPORTER, name: 'Ash' });
     await made.attendance.leave(made.party.id, { id: CAROL, name: 'Carol' });
     expect(await refused()).toBe(
@@ -375,6 +379,19 @@ describe('a Submit of the dialog', () => {
     expect(made.store.active()).toHaveLength(1);
   });
 
+  it('says there is no such group when the group emptied and went meanwhile', async () => {
+    const made = await setup();
+    const before = made.drawn();
+    // Without its label group B goes once nobody is in it (plan 8X-1B).
+    await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, '');
+    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
+    await made.attendance.leave(made.party.id, { id: BOB, name: 'Bob' });
+    expect(made.current().groups.map((group) => group.id)).toEqual(['A']);
+    const submitted = await made.submit(before);
+    expect(answerOf(submitted)).toBe('This train has no such group.');
+    expect(made.store.active()).toHaveLength(1);
+  });
+
   it('says so of a pick whose group changed meanwhile too', async () => {
     const made = await setup();
     const dialog = made.drawn(['A', 'B'], DAVE, true);
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index eedd21b4e76d1e0780f3c7430d1f060d9dc191cc..dde6881cb5385414caed17dce80ea1d029db945c 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -483,8 +483,10 @@ export async function splitGroupAs(
       return { kind: 'gone', text: TRAIN_OVER };
     case 'refused': {
       const now = ctx.parties.get(party.id);
+      // The group that went may be the one split off (by an earlier Submit, or somebody else).
+      const stale = outcome.reason === 'group-changed' || outcome.reason === 'no-such-group';
       const went =
-        outcome.reason === 'group-changed' && drawn !== undefined && now && isTrain(now)
+        stale && drawn !== undefined && now && isTrain(now)
           ? splitDrawn(now, group, drawn)
           : undefined;
       if (went) return { kind: 'already', text: splitOffWords(went.postId, names) };
diff --git a/src/components/party.test.ts b/src/components/party.test.ts
index 27a27d8fb3fa285c1d431fce13b82998e7252173..8538c7baba8100fa990a8e584ff3898fd2356b05 100644
--- a/src/components/party.test.ts
+++ b/src/components/party.test.ts
@@ -7,7 +7,7 @@ import {
   sent,
   type FakeInteraction,
 } from '../../test/support/fake-interactions.js';
-import { ALICE, BOB, REPORTER } from '../../test/support/parties.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
 import { reportedRaid } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
@@ -170,7 +170,7 @@ describe('the buttons of a party post', () => {
 
   it('the Join of a group makes a member coming in that group, and only moves one who is coming', async () => {
     const made = await setup();
-    await made.attendance.newGroup(made.party.id, { id: REPORTER });
+    await made.attendance.newGroup(made.party.id, { id: BOB });
     await made.click('maybe');
     expect(sent((await made.click('group:A')).reply).content).toBe('You are coming, in group A.');
     expect(made.alice()).toMatchObject({ status: PartyStatus.Coming, group: 'A' });
@@ -185,7 +185,7 @@ describe('the buttons of a party post', () => {
 
   it('a group button moves the member and names the group in the answer', async () => {
     const made = await setup();
-    await made.attendance.newGroup(made.party.id, { id: REPORTER });
+    await made.attendance.newGroup(made.party.id, { id: BOB });
     expect(sent((await made.click('group:A')).reply).content).toBe('You are coming, in group A.');
     expect(sent((await made.click('group:B')).reply).content).toBe('You are coming, in group B.');
     expect(made.alice()?.group).toBe('B');
diff --git a/src/components/party.train-copy.test.ts b/src/components/party.train-copy.test.ts
index b8ccb688ddbccb75cf8cb908b1226541487ada02..0a0f91d42c9301049122a6f625cf40f27d90c198 100644
--- a/src/components/party.train-copy.test.ts
+++ b/src/components/party.train-copy.test.ts
@@ -3,7 +3,7 @@ import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { fakeButton, sent, type FakeInteraction } from '../../test/support/fake-interactions.js';
 import { EAST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
-import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
+import { ALICE, BOB, CAROL } from '../../test/support/parties.js';
 import { createdTrain } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { decodeCustomId } from '../discord/custom-id.js';
@@ -14,6 +14,7 @@ import { partyButtons } from './party.js';
 
 const DAVE = '200000000000000005';
 const ERIN = '200000000000000006';
+const FRANK = '200000000000000007';
 
 /**
  * A train from West with a stop in East, and so with a copy of its message in East's channel.
@@ -21,8 +22,8 @@ const ERIN = '200000000000000006';
  */
 async function setup() {
   const made = await createdTrain({ route: [4, 7] });
-  await made.attendance.newGroup(made.party.id, { id: REPORTER });
-  await made.attendance.joinGroup(made.party.id, { id: REPORTER }, 'A');
+  // Somebody else opens B; the maker stays in A (a group nobody is in would go).
+  await made.attendance.newGroup(made.party.id, { id: FRANK, name: 'Frank' });
   await made.attendance.flush();
   await made.service.flush();
   for (const message of made.gateway.messagesIn(made.postId)) {
diff --git a/src/db/repositories/history-recording.db.test.ts b/src/db/repositories/history-recording.db.test.ts
index be80af0114b6aeb2a0a631f3e16c4d187298ff7c..dce8ede695315301c21d683392ff55e94d707bf6 100644
--- a/src/db/repositories/history-recording.db.test.ts
+++ b/src/db/repositories/history-recording.db.test.ts
@@ -27,6 +27,8 @@ import { splitOffGroup, splitSettled, splitTrain } from '../../domain/party/trai
 import { createDb } from '../kysely.js';
 import { DEADLOCK_TRIES } from '../transaction.js';
 import type { DB } from '../types.js';
+import { createTestLogger } from '../../../test/support/test-logger.js';
+import { PartyStore } from '../../services/party-store.js';
 import { HistoryRepository } from './history-repository.js';
 import { PartyRepository } from './party-repository.js';
 
@@ -795,4 +797,61 @@ describe('the party history, written with the parties', () => {
     await parties.insert(raid);
     expect(await stepsOf(raid.id)).toEqual([]);
   });
+
+  it('keeps a meeting time with the group that had it, not with a group of its letter opened after it was pruned', async () => {
+    // Plan 8X-1B, through the store, which prunes a group nobody is in.
+    let now = T;
+    const { log } = createTestLogger();
+    const store = new PartyStore({
+      storage: parties,
+      log,
+      now: () => now,
+      history: { noteOf: (write) => noteOf(write.before, write.after) },
+    });
+    await store.load();
+    const raid = { ...testRaid(), forumChannelId: FORUM, forumPostId: POST };
+    await store.add(raid);
+    const step = async (change: (party: Party) => Party) => {
+      now += MINUTE;
+      await store.update(raid.id, (party) => ({ party: change(party) }));
+    };
+    const withGroups = (party: Party, groups: Party['groups']): Party => ({ ...party, groups });
+    // Bob opens B and sets its meeting time; the clock clears it; Bob leaves and B goes.
+    await step((party) =>
+      withAttendees(withGroups(party, [{ id: 'A' }, { id: 'B', opened: now }]), {
+        [BOB]: { group: 'B' },
+      }),
+    );
+    await step((party) =>
+      withGroups(party, [
+        party.groups[0] ?? { id: 'A' },
+        { id: 'B', opened: T + MINUTE, startTime: T + 30 * MINUTE },
+      ]),
+    );
+    await step((party) =>
+      withGroups(party, [party.groups[0] ?? { id: 'A' }, { id: 'B', opened: T + MINUTE }]),
+    );
+    await step((party) => {
+      const { [BOB]: _bob, ...rest } = party.attendees;
+      return { ...party, attendees: rest };
+    });
+    expect(store.get(raid.id)?.groups.map((group) => group.id)).toEqual(['A']);
+    // Alice opens a new B, and the raid ends.
+    await step((party) =>
+      withAttendees(withGroups(party, [...party.groups, { id: 'B', opened: now }]), {
+        [ALICE]: { group: 'B' },
+      }),
+    );
+    now += MINUTE;
+    await store.update(raid.id, (party) => ({ party: endParty(party), ended: { how: 'clock' } }));
+    const groups = await db
+      .selectFrom('PartyHistoryGroup')
+      .select(['groupId', 'meetingTime', 'members'])
+      .orderBy('groupId')
+      .execute();
+    expect(groups).toEqual([
+      { groupId: 'A', meetingTime: null, members: 1 },
+      { groupId: 'B', meetingTime: null, members: 1 },
+    ]);
+  });
 });
diff --git a/src/domain/history/party-history.test.ts b/src/domain/history/party-history.test.ts
index 1ef308a35700563cc8694346c9dff5dd85768a6c..c4010012fe0a1d75877d0d6143092435844ed78a 100644
--- a/src/domain/history/party-history.test.ts
+++ b/src/domain/history/party-history.test.ts
@@ -71,12 +71,37 @@ describe('partySteps', () => {
     const set = { ...raid, groups: [{ id: 'A' as const, startTime: T + 30 * MINUTE }] };
     const moved = { ...raid, groups: [{ id: 'A' as const, startTime: T + 40 * MINUTE }] };
     expect(partySteps(raid, set, T)).toEqual([
-      { partyId: raid.id, at: T, kind: 'meet', subject: 'A', value: T + 30 * MINUTE },
+      // The group by its letter and when it was opened (plan 8X-1B): letters are given again.
+      {
+        partyId: raid.id,
+        at: T,
+        kind: 'meet',
+        subject: `A:${T.toString(36)}`,
+        value: T + 30 * MINUTE,
+      },
     ]);
     expect(partySteps(set, moved, T)[0]?.value).toBe(T + 40 * MINUTE);
     expect(partySteps(moved, raid, T)).toEqual([]);
   });
 
+  it('notes the meeting time of a group opened again under a letter as that of another group', () => {
+    const raid = testRaid();
+    const before = { ...raid, groups: [{ id: 'A' as const, startTime: T + 30 * MINUTE }] };
+    const again = {
+      ...raid,
+      groups: [{ id: 'A' as const, startTime: T + 30 * MINUTE, opened: T + MINUTE }],
+    };
+    expect(partySteps(before, again, T)).toEqual([
+      {
+        partyId: raid.id,
+        at: T,
+        kind: 'meet',
+        subject: `A:${(T + MINUTE).toString(36)}`,
+        value: T + 30 * MINUTE,
+      },
+    ]);
+  });
+
   it('notes where a train is whenever that changes', () => {
     const empty = testTrain();
     const steps = partySteps(empty, train(0), T);
@@ -257,6 +282,35 @@ describe('historyOfParty', () => {
     ]);
   });
 
+  it('keeps a meeting time with the group that had it, not with a later group of its letter', () => {
+    const raid = withAttendees(testRaid(), { [ALICE]: { group: 'B' } });
+    const opened = { ...raid, groups: [{ id: 'A' as const }, { id: 'B' as const, opened: T }] };
+    const met = {
+      ...opened,
+      groups: [{ id: 'A' as const }, { id: 'B' as const, opened: T, startTime: T + MINUTE }],
+    };
+    // The clock cleared it, Alice left, B was pruned; later a new B was opened.
+    const { [ALICE]: _alice, ...rest } = met.attendees;
+    const pruned = { ...raid, attendees: rest, groups: [{ id: 'A' as const }] };
+    const again = withAttendees(
+      { ...pruned, groups: [{ id: 'A' as const }, { id: 'B' as const, opened: T + 9 * MINUTE }] },
+      { [BOB]: { group: 'B' } },
+    );
+    // Steps of before the stamps (plan 8X-1B) name the letter alone, and count for it.
+    const legacy: HistoryStep = { partyId: raid.id, at: T, kind: 'meet', subject: 'A', value: T };
+    const record = historyOfParty(endParty(again), {
+      end: { how: 'clock' },
+      steps: [...stepsOf([raid, opened, met, pruned, again]), legacy],
+      optedIn: new Set(),
+      describeBoss,
+      shiny: null,
+    });
+    expect(record.groups.map((group) => [group.groupId, group.meetingTime])).toEqual([
+      ['A', T],
+      ['B', null],
+    ]);
+  });
+
   it('says how a party ended: by the clock, by somebody, or not known', () => {
     const ended = (party: Party, how?: 'clock' | 'cancelled') =>
       historyOfParty(endParty(party), {
diff --git a/src/domain/history/party-history.ts b/src/domain/history/party-history.ts
index 9bd1c47517b789c2056dad409838f7d7e1ae7b88..11b54fbcf30ee98f9dec40882a0f9b3e78466d74 100644
--- a/src/domain/history/party-history.ts
+++ b/src/domain/history/party-history.ts
@@ -1,10 +1,12 @@
 import {
   attendeeOf,
+  groupStamp,
   isRaid,
   isTimed,
   isTrain,
   type Attendee,
   type Party,
+  type PartyGroup,
   type RaidBossRef,
   type Team,
 } from '../party/party.js';
@@ -250,6 +252,16 @@ export function splitPending(party: Party): boolean {
   return isTrain(party) && party.train.splitFrom?.pending === true;
 }
 
+/**
+ * The subject of a group's meeting time among the steps: its letter and when it was opened
+ * (`B:<stamp>`, plan 8X-1B), since a group nobody is in goes and a later one may take its
+ * letter: a meeting time is kept with the group that had it. A step of before the stamps names
+ * the letter alone, and counts for the group of that letter.
+ */
+function meetSubject(party: Party, group: PartyGroup): string {
+  return `${group.id}:${groupStamp(party, group)}`;
+}
+
 /**
  * The steps from one stored form of a party to the next (`before` undefined: a new party).
  *
@@ -275,8 +287,9 @@ export function partySteps(before: Party | undefined, after: Party, at: number):
   }
   for (const group of after.groups) {
     if (group.startTime === undefined) continue;
-    const was = before?.groups.find((other) => other.id === group.id)?.startTime;
-    if (was !== group.startTime) step('meet', group.id, group.startTime);
+    const subject = meetSubject(after, group);
+    const was = before?.groups.find((other) => meetSubject(before, other) === subject)?.startTime;
+    if (was !== group.startTime) step('meet', subject, group.startTime);
   }
   if (isTrain(after)) {
     const place = placeOf(after);
@@ -456,7 +469,10 @@ export function historyOfParty(party: Party, input: HistoryInput): LiveRecord {
   );
   const groups = party.groups.map((group): HistoryGroup => {
     const members = attendees.filter((a) => a.status !== null && a.groupId === group.id);
-    const meetings = steps.filter((step) => step.kind === 'meet' && step.subject === group.id);
+    const subject = meetSubject(party, group);
+    const meetings = steps.filter(
+      (step) => step.kind === 'meet' && (step.subject === subject || step.subject === group.id),
+    );
     return {
       groupId: group.id,
       label: scrubbed(group.label),
diff --git a/src/domain/party/attendance.prune.test.ts b/src/domain/party/attendance.prune.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0aad178ce4a0d58154366590580f5e6380132eb3
--- /dev/null
+++ b/src/domain/party/attendance.prune.test.ts
@@ -0,0 +1,168 @@
+import { describe, expect, it } from 'vitest';
+import {
+  ALICE,
+  BOB,
+  CAROL,
+  PARTY_NOW,
+  REPORTER,
+  testMeetup,
+  testRaid,
+  testTrain,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import {
+  attendanceLimits,
+  chooseGroup,
+  createGroup,
+  leaveParty,
+  pruneGroups,
+} from './attendance.js';
+import {
+  groupOpened,
+  groupStamp,
+  stampedGroup,
+  type Change,
+  type GroupId,
+  type PartyGroup,
+  type RaidParty,
+} from './party.js';
+import { PartyStatus } from './status.js';
+
+const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
+const LATER = PARTY_NOW + 60_000;
+
+function done<P, Extra>(change: Change<P, Extra>): P {
+  if (!change.ok) throw new Error(`refused: ${change.reason}`);
+  return change.party;
+}
+
+/** The test raid without its reporter, with these groups, the last the default one. */
+function raidWith(groups: readonly PartyGroup[], defaultGroupId?: GroupId): RaidParty {
+  const party = testRaid();
+  return {
+    ...party,
+    attendees: {},
+    groups,
+    defaultGroupId: defaultGroupId ?? groups.at(-1)?.id ?? 'A',
+  };
+}
+
+describe('the stamp of a group', () => {
+  it('of the first group of a new party is when the party was made', () => {
+    for (const party of [testRaid(), testMeetup(), testTrain()]) {
+      const [first] = party.groups;
+      expect(first && groupOpened(party, first)).toBe(PARTY_NOW);
+    }
+  });
+
+  it('is set on a group a member opens, and on one Join opens where a lobby is full', () => {
+    const opened = done(createGroup(testRaid(), REPORTER, { ...limits, now: LATER }));
+    expect(opened.groups.at(-1)).toEqual({ id: 'B', opened: LATER });
+    const full = withAttendees(testRaid(), { [ALICE]: { number: 4 } });
+    const chosen = chooseGroup(full, BOB, 1, 4, LATER);
+    expect(chosen.party.groups.at(-1)).toEqual({ id: 'B', opened: LATER });
+  });
+
+  it('stamps each group after the party’s last write and every group it has, within one millisecond too', () => {
+    // The clock has not moved since the party's last write (PARTY_NOW).
+    const b = done(createGroup(testRaid(), REPORTER, { ...limits, now: PARTY_NOW }));
+    expect(b.groups.at(-1)).toEqual({ id: 'B', opened: PARTY_NOW + 1 });
+    const c = done(createGroup(b, ALICE, { ...limits, now: PARTY_NOW }));
+    expect(c.groups.at(-1)).toEqual({ id: 'C', opened: PARTY_NOW + 2 });
+    // Without a time (a test), after the last write as well.
+    expect(done(createGroup(testRaid(), REPORTER, limits)).groups.at(-1)?.opened).toBe(
+      PARTY_NOW + 1,
+    );
+  });
+
+  it('counts a group of an older document as opened with the party', () => {
+    const party = raidWith([{ id: 'A' }, { id: 'B', opened: LATER }]);
+    const [a, b] = party.groups;
+    expect(a && groupOpened(party, a)).toBe(PARTY_NOW);
+    expect(b && groupOpened(party, b)).toBe(LATER);
+    expect(b && groupStamp(party, b)).toBe(LATER.toString(36));
+  });
+
+  it('names a group by its letter only while the letter is the same group', () => {
+    const party = raidWith([{ id: 'A' }, { id: 'B', opened: LATER }]);
+    expect(stampedGroup(party, 'B', LATER.toString(36))).toEqual({ id: 'B', opened: LATER });
+    expect(stampedGroup(party, 'B', PARTY_NOW.toString(36))).toBeUndefined();
+    expect(stampedGroup(party, 'C', LATER.toString(36))).toBeUndefined();
+  });
+});
+
+describe('pruneGroups', () => {
+  it('drops a group nobody is in, and keeps the letters of the others', () => {
+    const party = withAttendees(raidWith([{ id: 'A' }, { id: 'B' }, { id: 'C' }], 'A'), {
+      [ALICE]: { group: 'A' },
+      [BOB]: { group: 'C' },
+    });
+    const pruned = pruneGroups(party);
+    expect(pruned.groups.map((group) => group.id)).toEqual(['A', 'C']);
+    expect(pruned.defaultGroupId).toBe('A');
+    expect(pruned.attendees).toBe(party.attendees);
+  });
+
+  it('counts the interested and those who are done as being in a group', () => {
+    const party = withAttendees(raidWith([{ id: 'A' }, { id: 'B' }, { id: 'C' }]), {
+      [ALICE]: { group: 'A', status: PartyStatus.Interested },
+      [BOB]: { group: 'B', status: PartyStatus.Complete },
+      [CAROL]: { group: 'C' },
+    });
+    expect(pruneGroups(party)).toBe(party);
+  });
+
+  it('keeps an empty group with a label or a meeting time', () => {
+    const party = withAttendees(
+      raidWith([{ id: 'A' }, { id: 'B', label: 'by the bridge' }, { id: 'C', startTime: LATER }]),
+      { [ALICE]: { group: 'A' } },
+    );
+    expect(pruneGroups(party)).toBe(party);
+  });
+
+  it('never drops the last group, and keeps the default one when all are empty', () => {
+    const one = raidWith([{ id: 'A' }]);
+    expect(pruneGroups(one)).toBe(one);
+    const two = raidWith([{ id: 'A' }, { id: 'B' }], 'A');
+    const pruned = pruneGroups(two);
+    expect(pruned.groups).toEqual([{ id: 'A' }]);
+    expect(pruned.defaultGroupId).toBe('A');
+  });
+
+  it('makes the newest group left the default one when the default group goes', () => {
+    const party = withAttendees(
+      raidWith(
+        [
+          { id: 'A', opened: PARTY_NOW },
+          { id: 'C', opened: LATER + 2 },
+          { id: 'B', opened: LATER + 1 },
+          { id: 'D', opened: LATER + 3 },
+        ],
+        'D',
+      ),
+      { [ALICE]: { group: 'A' }, [BOB]: { group: 'C' }, [CAROL]: { group: 'B' } },
+    );
+    const pruned = pruneGroups(party);
+    expect(pruned.groups.map((group) => group.id)).toEqual(['A', 'C', 'B']);
+    expect(pruned.defaultGroupId).toBe('C');
+  });
+
+  it('is the very same party when every group has somebody in it', () => {
+    const party = testRaid();
+    expect(pruneGroups(party)).toBe(party);
+  });
+
+  it('lets a later group take the letter of a pruned one, with a stamp of its own', () => {
+    // B was opened at LATER and went when its last member left.
+    const before = withAttendees(
+      raidWith([{ id: 'A' }, { id: 'B', opened: LATER }, { id: 'E', opened: LATER + 1 }]),
+      { [ALICE]: { group: 'A' }, [BOB]: { group: 'B' }, [CAROL]: { group: 'E' } },
+    );
+    const pruned = pruneGroups(done(leaveParty(before, BOB)));
+    expect(pruned.groups.map((group) => group.id)).toEqual(['A', 'E']);
+    // No letter after E: the first free one, B again, opened now.
+    const again = done(createGroup(pruned, ALICE, { ...limits, now: LATER + 5 }));
+    expect(again.groups.at(-1)).toEqual({ id: 'B', opened: LATER + 5 });
+    expect(stampedGroup(again, 'B', LATER.toString(36))).toBeUndefined();
+  });
+});
diff --git a/src/domain/party/attendance.test.ts b/src/domain/party/attendance.test.ts
index fc4d94976c2805c5c5a75c043a57520a0dc9df4a..f2f4f091a3b041df4f495c9568aa04b2920b7346 100644
--- a/src/domain/party/attendance.test.ts
+++ b/src/domain/party/attendance.test.ts
@@ -437,7 +437,10 @@ describe('groups', () => {
     const change = setMeetingTime(base, ALICE, meet);
     expect(change).toMatchObject({ ok: true, group: 'A', others: [CAROL] });
     let party = done(change);
-    expect(party.groups).toEqual([{ id: 'A', startTime: meet }, { id: 'B' }]);
+    expect(party.groups).toEqual([
+      { id: 'A', startTime: meet },
+      { id: 'B', opened: PARTY_NOW + 1 },
+    ]);
 
     // A new time forgets that the old one had passed; null removes both.
     party = {
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index 030e3ecaeb9c42bcf9cf34717ff1659f03ba2b3b..20ccbf58c40cb00543a9e0eb978191d3702aafac 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -2,6 +2,7 @@ import {
   attendeeOf,
   GROUP_IDS,
   groupOf,
+  groupOpened,
   hasGroups,
   isRaid,
   isTimed,
@@ -36,6 +37,11 @@ export interface AttendanceLimits {
    * group, as always.
    */
   lobbySize?: number | undefined;
+  /**
+   * When the change is made (epoch ms): a group it opens is stamped with it (`PartyGroup.opened`).
+   * The services give it with every change; without it (a test) the party's last write stands in.
+   */
+  now?: number | undefined;
 }
 
 /** `maximumAdditionalAttendees` of the settings counts the people a member brings along. */
@@ -206,7 +212,7 @@ function placedFor<P extends Party>(
   if (!existing) {
     return size === undefined
       ? { party, group: party.defaultGroupId }
-      : chooseGroup(party, memberId, number, size);
+      : chooseGroup(party, memberId, number, size, limits.now);
   }
   const comes = status === PartyStatus.Coming || status === PartyStatus.Present;
   if (size === undefined || existing.status !== PartyStatus.Interested || !comes) {
@@ -215,7 +221,21 @@ function placedFor<P extends Party>(
   if (lobbyCount(party, existing.group, memberId) + number <= size) {
     return { party, group: existing.group };
   }
-  return chooseGroup(party, memberId, number, size);
+  return chooseGroup(party, memberId, number, size, limits.now);
+}
+
+/**
+ * A new group of this letter, opened at `now` (the party's last write when not given), and in
+ * any case after the party's last write and after every group it has: stamps strictly increase,
+ * also for changes within one millisecond (the store writes a party never before a stamp of its
+ * groups, so a group pruned and opened again under its letter gets a stamp of its own).
+ */
+function openedGroup(party: Party, id: GroupId, now: number | undefined): PartyGroup {
+  const latest = Math.max(
+    party.updatedAt,
+    ...party.groups.map((group) => groupOpened(party, group)),
+  );
+  return { id, opened: Math.max(now ?? party.updatedAt, latest + 1) };
 }
 
 /**
@@ -227,13 +247,14 @@ function placedFor<P extends Party>(
  * default; else the group with the most room left, the first by letter on a tie, over its size.
  * A member larger than a lobby by themself fits nowhere, a new group included: they go straight
  * to the group with the most room. A party without groups (a meetup) keeps its one. The party
- * comes back with the group opened, else the very same.
+ * comes back with the group opened (stamped `now`), else the very same.
  */
 export function chooseGroup<P extends Party>(
   party: P,
   memberId: string,
   heads: number,
   size: number,
+  now?: number,
 ): { party: P; group: GroupId } {
   if (!hasGroups(party)) return { party, group: party.defaultGroupId };
   const count = (id: GroupId) => lobbyCount(party, id, memberId);
@@ -248,7 +269,11 @@ export function chooseGroup<P extends Party>(
   const id = fits ? nextGroupId(party) : undefined;
   if (id !== undefined) {
     return {
-      party: { ...party, groups: [...party.groups, { id }], defaultGroupId: id },
+      party: {
+        ...party,
+        groups: [...party.groups, openedGroup(party, id, now)],
+        defaultGroupId: id,
+      },
       group: id,
     };
   }
@@ -598,9 +623,11 @@ export function joinInto<P extends Party>(
 /**
  * The letter of the next group: one that no group has and that no group split off a train went
  * by (plan 8T, `train.splitOff`), the first after the last letter in use, else the first such;
- * when every free letter was a split's, the first free one (a dialog drawn for the group
- * that went is still refused: `groupMark` covers the splits). Undefined when the party has every
- * group it may.
+ * when every free letter was a split's, the first free one. A letter can come again: a group
+ * nobody is in goes (`pruneGroups`, plan 8X-1B), and a split's letter is given once no other is
+ * free; what names a group across time names it by its stamp too (`groupStamp`, `groupMark`),
+ * so a dialog drawn for the group that went is refused. Undefined when the party has every group
+ * it may.
  */
 function nextGroupId(party: Party): GroupId | undefined {
   const used = new Set(party.groups.map((group) => group.id));
@@ -615,9 +642,9 @@ function nextGroupId(party: Party): GroupId | undefined {
 }
 
 /**
- * Opens the next group (`nextGroupId`) and moves the member into it. It becomes the group new
- * attendees land in. `others` are the attendees who have not completed the raid, to be told
- * about it.
+ * Opens the next group (`nextGroupId`, stamped `limits.now`) and moves the member into it. It
+ * becomes the group new attendees land in. `others` are the attendees who have not completed the
+ * raid, to be told about it.
  */
 export function createGroup<P extends Party>(
   party: P,
@@ -627,7 +654,11 @@ export function createGroup<P extends Party>(
   if (!hasGroups(party)) return refused('no-groups');
   const id = nextGroupId(party);
   if (id === undefined) return refused('too-many-groups');
-  const opened: P = { ...party, groups: [...party.groups, { id }], defaultGroupId: id };
+  const opened: P = {
+    ...party,
+    groups: [...party.groups, openedGroup(party, id, limits.now)],
+    defaultGroupId: id,
+  };
   const moved = joinGroup(opened, memberId, id, limits);
   if (!moved.ok) return moved;
   const others = membersWhere(
@@ -657,6 +688,35 @@ export function labelGroup<P extends Party>(
   };
 }
 
+/**
+ * The party without the groups nobody is in (design `2026-10-20-join-group-meet-buttons-design.md`,
+ * decision 6; a wish of legacy Pine's): a group goes when no attendee of any status is in it
+ * (who is interested and who is done count: the latter are the raid's record), unless it has a
+ * label or a meeting time; never the party's last group (of all empty ones the default group
+ * stays). The others keep their letters (members were told "group C"). When the default group
+ * goes, the newest group left takes over (by when it was opened, `groupOpened`; the later in the
+ * list on a tie). The very same party when nothing goes. Silent: whoever runs it says nothing.
+ * `PartyStore.update` runs it after every change that returned a new party.
+ */
+export function pruneGroups<P extends Party>(party: P): P {
+  const used = new Set(Object.values(party.attendees).map((attendee) => attendee.group));
+  const kept = party.groups.filter(
+    (group) => used.has(group.id) || Boolean(group.label) || group.startTime !== undefined,
+  );
+  if (kept.length === party.groups.length) return party;
+  const fallback = groupOf(party, party.defaultGroupId) ?? party.groups.at(-1);
+  const groups = kept.length > 0 ? kept : fallback ? [fallback] : [];
+  if (groups.length === party.groups.length) return party;
+  if (groups.some((group) => group.id === party.defaultGroupId)) return { ...party, groups };
+  let newest = groups[0];
+  for (const group of groups) {
+    if (newest === undefined || groupOpened(party, group) >= groupOpened(party, newest)) {
+      newest = group;
+    }
+  }
+  return { ...party, groups, defaultGroupId: newest?.id ?? party.defaultGroupId };
+}
+
 /**
  * Sets the meeting time of the member's own group, or removes it with null. `others` are the
  * attendees of that group who have not completed the raid, to be told; none when the time did
@@ -696,13 +756,14 @@ export function setMeetingTime<P extends Party>(
  * The reporter's automatic status when they report a raid that already exists: applied only to
  * somebody who is not signed up, so that a second report never resets what a member chose.
  * Where the party's groups hold `lobbySize` trainers, the group is chosen as Join chooses it
- * (`chooseGroup`); otherwise it is the default group.
+ * (`chooseGroup`, a group it opens stamped `now`); otherwise it is the default group.
  */
 export function applyAutoStatus<P extends Party>(
   party: P,
   memberId: string,
   status: PartyStatus,
   lobbySize?: number,
+  now?: number,
 ): { party: P; joined: boolean } {
   if (attendeeOf(party, memberId)) return { party, joined: false };
   if (
@@ -714,7 +775,7 @@ export function applyAutoStatus<P extends Party>(
   const placed =
     lobbySize === undefined
       ? { party, group: party.defaultGroupId }
-      : chooseGroup(party, memberId, 1, lobbySize);
+      : chooseGroup(party, memberId, 1, lobbySize, now);
   const attendee: Attendee = { number: 1, status, group: placed.group, remote: false };
   return { party: withAttendee(placed.party, memberId, attendee), joined: true };
 }
diff --git a/src/domain/party/party-state.test.ts b/src/domain/party/party-state.test.ts
index 5c8d0d413521635d2cb12c50cd6966ab78ce5582..f53e6ad2eb3dfe0a736ebc580dec9328ebb456b0 100644
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -156,7 +156,7 @@ describe('party state', () => {
       party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
     });
     // Nothing was added to the document for it: the version is what it was.
-    expect(document.v).toBe(11);
+    expect(document.v).toBe(12);
     // There were no shadow EX raids, and there are no shadow elite raids: still refused.
     const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
     expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
@@ -171,7 +171,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(11);
+    expect(state.v).toBe(12);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -232,7 +232,7 @@ describe('party state', () => {
     expect(problem(state, { ...columns, type: 'train' })).toBe(
       'a train without its name and start',
     );
-    expect(problem({ ...state, v: 12 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 13 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
@@ -971,7 +971,7 @@ describe('the state of a train', () => {
         ],
       },
     };
-    expect(partyState(split).v).toBe(11);
+    expect(partyState(split).v).toBe(12);
     expect(partyFromStored(columnsOf(split), stored(partyState(split)), [])).toEqual({
       ok: true,
       party: split,
@@ -1037,6 +1037,57 @@ describe('the state of a train', () => {
     ).toThrow(/cannot be stored/);
   });
 
+  it('keeps when each group was opened, and reads a version 11 document as groups opened with the party', () => {
+    const raid: RaidParty = {
+      ...fullRaid(),
+      groups: [{ id: 'A' }, { id: 'C', label: 'Fast', opened: PARTY_NOW + 60_000 }],
+      defaultGroupId: 'C',
+      attendees: {},
+      mirrorMessages: [],
+    };
+    expect(partyState(raid).v).toBe(12);
+    expect(partyFromStored(columnsOf(raid), stored(partyState(raid)), [])).toEqual({
+      ok: true,
+      party: raid,
+    });
+    // Version 11 knew no stamps: what such a document says of one is not read.
+    const old = stored({ ...partyState(raid), v: 11 });
+    expect(partyFromStored(columnsOf(raid), old, [])).toEqual({
+      ok: true,
+      party: { ...raid, groups: [{ id: 'A' }, { id: 'C', label: 'Fast' }] },
+    });
+    // A stamp that is no time is refused.
+    const state = stored(partyState(raid)) as Record<string, unknown>;
+    expect(problem(columnsOf(raid), { ...state, groups: [{ id: 'A', opened: -1 }] })).toMatch(
+      /^state: /,
+    );
+    // So is a group split off a train, which a stale dialog's mark is compared with.
+    const train = fullTrain();
+    const split: TrainParty = {
+      ...train,
+      train: {
+        ...train.train,
+        splitOff: [
+          {
+            partyId: '00000000-0000-4000-8000-0000000000bb',
+            postId: '300000000000000021',
+            group: 'C',
+            opened: PARTY_NOW + 60_000,
+          },
+        ],
+      },
+    };
+    expect(partyFromStored(columnsOf(split), stored(partyState(split)), [])).toEqual({
+      ok: true,
+      party: split,
+    });
+    const { opened: _opened, ...unstamped } = split.train.splitOff[0] ?? { opened: 0 };
+    expect(partyFromStored(columnsOf(split), stored({ ...partyState(split), v: 11 }), [])).toEqual({
+      ok: true,
+      party: { ...split, train: { ...split.train, splitOff: [unstamped] } },
+    });
+  });
+
   it('reads a version 4 document, which is a raid or a meetup and never a train', () => {
     const meetup = testMeetup();
     const old = stored({ ...partyState(meetup), v: 4 });
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index 0b70081fc266801d27415ffb768a70057478800b..32fb5335b437517fdcad6b3b039d305b3e61960a 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -43,11 +43,14 @@ import { PartyStatus } from './status.js';
  * Version 10 (plan 8D) added a meetup's `place` (a gym, PokéStop or power spot as it was named,
  * or a pin); a meetup of an earlier document has none. Version 11 (plan 8T) added a train's
  * `splitFrom` (the train it was split off from, `pending: true` until the split is settled) and
- * `splitOff` (the groups split off it); a train of an earlier document has neither.
+ * `splitOff` (the groups split off it); a train of an earlier document has neither. Version 12
+ * (plan 8X-1B) added a group's `opened` (when it was opened: a group nobody is in goes, and a
+ * later one may take its letter), also kept with a group split off a train; a group of an
+ * earlier document has none and counts as opened with the party (`groupOpened`).
  * Documents of versions 1 to 3 are those of raids, and one of version 4 is that of a raid or a
  * meetup.
  */
-export const PARTY_STATE_VERSION = 11;
+export const PARTY_STATE_VERSION = 12;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -86,13 +89,16 @@ const prompts = z.object({
   warning: snowflake.nullable(),
 });
 
-const group = z.object({
+/** A group as versions 1 to 11 wrote it: without when it was opened. */
+const groupV11 = z.object({
   id: groupId,
   label: z.string().optional(),
   startTime: time.optional(),
   startClearTime: time.optional(),
 });
 
+const group = groupV11.extend({ opened: time.optional() });
+
 /**
  * The level of a raid. A raid stored while there was an EX tier (plan 4F removed it; a dev
  * database may hold ended ones) is read as an elite raid, which is what the game made of EX.
@@ -254,7 +260,8 @@ const trainV10 = z
 /** The other train of a split: its party (a UUID, as every party id is) and its post. */
 const trainLink = z.object({ partyId: z.uuid(), postId: snowflake });
 
-const train = z
+/** The details of a train as version 11 wrote them: read only, its splits without stamps. */
+const trainV11 = z
   .object({
     route: z.array(gymId).max(MAX_ROUTE_STOPS),
     stop: z.number().int().nonnegative(),
@@ -273,6 +280,31 @@ const train = z
     }
   });
 
+const train = z
+  .object({
+    route: z.array(gymId).max(MAX_ROUTE_STOPS),
+    stop: z.number().int().nonnegative(),
+    finishedFrom: gymId.nullable(),
+    atEnd: z.enum(TRAIN_AT_END),
+    conductorId: snowflake.nullable(),
+    boss: bossRef.nullable(),
+    splitFrom: trainLink.extend({ pending: z.literal(true).optional() }).nullable(),
+    splitOff: z
+      .array(
+        trainLink.extend({
+          group: groupId,
+          label: z.string().optional(),
+          opened: time.optional(),
+        }),
+      )
+      .max(MAX_SPLITS_KEPT),
+  })
+  .superRefine((value, context) => {
+    for (const message of [...routeProblems(value), ...finishProblems(value)]) {
+      context.addIssue({ code: 'custom', message });
+    }
+  });
+
 /** What does not hold between the parts of a document, whatever its version. */
 function inconsistencies(value: {
   groups: { id: string }[];
@@ -291,10 +323,13 @@ function inconsistencies(value: {
   return problems;
 }
 
-/** What documents of versions 1 to 7 share; a raid's details without a screenshot. */
+/**
+ * What documents of versions 1 to 7 share; a raid's details without a screenshot, groups without
+ * their stamps (version 12 has its own).
+ */
 const shared = {
   anonymous: z.boolean(),
-  groups: z.array(group).min(1).max(GROUP_IDS.length),
+  groups: z.array(groupV11).min(1).max(GROUP_IDS.length),
   defaultGroupId: groupId,
   raid: raidV7.optional(),
 };
@@ -303,6 +338,7 @@ const state = z
   .object({
     v: z.literal(PARTY_STATE_VERSION),
     ...shared,
+    groups: z.array(group).min(1).max(GROUP_IDS.length),
     raid: raid.optional(),
     makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
     timed: timed.optional(),
@@ -319,6 +355,23 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 11, as plans 8T to 8X-1 wrote it: read only. It is version 12 without stamps. */
+const stateV11 = z
+  .object({
+    v: z.literal(11),
+    ...shared,
+    raid: raid.optional(),
+    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
+    timed: timed.optional(),
+    meetup: meetup.optional(),
+    train: trainV11.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 10, as plans 8D to 8M-5 wrote it: read only. It is version 11 without a train's splits. */
 const stateV10 = z
   .object({
@@ -488,14 +541,25 @@ function withSplits<T extends { train?: z.output<typeof trainV10> | undefined }>
   return old.train ? { ...old, train: { ...old.train, splitFrom: null, splitOff: [] } } : old;
 }
 
-/** Reads a stored document of any version this code knows, as the current version. */
+/**
+ * Reads a stored document of any version this code knows, as the current version. A document
+ * before version 12 has groups without stamps, which count as opened with the party.
+ */
 function readState(stored: unknown) {
   const version =
     typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
   if (version === PARTY_STATE_VERSION) return state.safeParse(stored);
+  const older = readStateV11(stored, version);
+  if (!older.success) return older;
+  return state.safeParse({ ...older.data, v: PARTY_STATE_VERSION });
+}
+
+/** Reads a document of versions 1 to 11, upgraded to the shape of version 11. */
+function readStateV11(stored: unknown, version: unknown) {
+  if (version === 11) return stateV11.safeParse(stored);
   const older = readStateV10(stored, version);
   if (!older.success) return older;
-  return state.safeParse({ ...withSplits(older.data), v: PARTY_STATE_VERSION });
+  return stateV11.safeParse({ ...withSplits(older.data), v: 11 });
 }
 
 /** Reads a document of versions 1 to 10, upgraded to the shape of version 10. */
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 3ccef8245a6571270f0537ba28dcc862842c53e6..a134a6ffb01b0ed9bb4c45d4999ccc3b80f85ce7 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -85,6 +85,47 @@ export interface PartyGroup {
   startTime?: number;
   /** Set once the meeting time has passed: when it is removed and the group is asked. */
   startClearTime?: number;
+  /**
+   * When the group was opened, epoch ms (plan 8X-1B): a group nobody is in goes
+   * (`pruneGroups`) and a later one may take its letter, so what names a group across time
+   * names it by its letter and this (`groupStamp`). Absent for a group of a document before
+   * version 12, which counts as opened with the party (`groupOpened`).
+   */
+  opened?: number;
+}
+
+/** When a group was opened: its own stamp, else (a group of an older document) the party's making. */
+export function groupOpened(
+  party: Pick<PartyCore, 'createdAt'>,
+  group: Pick<PartyGroup, 'opened'>,
+): number {
+  return group.opened ?? party.createdAt;
+}
+
+/**
+ * A group's stamp as a custom id or a step of the history carries it: when it was opened
+ * (`groupOpened`), in base 36. With the letter it names the group across time: a group opened
+ * again under a letter that a pruned group had is another.
+ */
+export function groupStamp(
+  party: Pick<PartyCore, 'createdAt'>,
+  group: Pick<PartyGroup, 'opened'>,
+): string {
+  return groupOpened(party, group).toString(36);
+}
+
+/**
+ * The group of this letter while it is the one with this stamp (`groupStamp`); undefined when
+ * the party has no such group, or the letter is another group's by now (the one named went and
+ * a new one took its letter).
+ */
+export function stampedGroup(
+  party: Pick<PartyCore, 'createdAt' | 'groups'>,
+  groupId: string,
+  stamp: string,
+): PartyGroup | undefined {
+  const group = party.groups.find((one) => one.id === groupId);
+  return group && groupStamp(party, group) === stamp ? group : undefined;
 }
 
 /**
@@ -152,7 +193,10 @@ export interface PartyCore {
    * indices, so an object keeps that order; the stored document is a list for the same reason.)
    */
   attendees: Readonly<Record<string, Attendee>>;
-  /** In the order they were created; never empty. */
+  /**
+   * In the order they were created; never empty. A group nobody is in goes after the change that
+   * emptied it, unless it has a label or a meeting time (`pruneGroups`).
+   */
   groups: readonly PartyGroup[];
   /** The group a new attendee lands in: the newest one. */
   defaultGroupId: GroupId;
@@ -304,6 +348,8 @@ export interface SplitFrom extends TrainLink {
 export interface SplitOff extends TrainLink {
   group: GroupId;
   label?: string;
+  /** When the group was opened (`PartyGroup.opened`); absent for one of an older document. */
+  opened?: number;
 }
 
 /**
diff --git a/src/domain/party/train-split.test.ts b/src/domain/party/train-split.test.ts
index 4c49ce840416e5d328918aa9a10ab287c98e70e9..a49090bf44cabbef33417345485fe79631242b28 100644
--- a/src/domain/party/train-split.test.ts
+++ b/src/domain/party/train-split.test.ts
@@ -402,11 +402,24 @@ describe('splitOffGroup: the old train', () => {
       ok: false,
       reason: 'group-changed',
     });
+    // A group that went (pruned once it emptied, plan 8X-1B) is no such group, as it is for a
+    // command, and so is one opened again under its letter since: another group.
     const gone = trainWith([{ id: 'A' }, { id: 'C' }], { [ALICE]: { group: 'C' } });
     expect(splitOffGroup(gone, ALICE, false, 'B', link, drawn)).toEqual({
       ok: false,
-      reason: 'group-changed',
+      reason: 'no-such-group',
     });
+    const reopened = {
+      ...fast(),
+      groups: [{ id: 'A' }, { id: 'B', label: 'Fast', opened: PARTY_NOW + HOUR }],
+    } as TrainParty;
+    expect(splitOffGroup(reopened, ALICE, false, 'B', link, drawn)).toEqual({
+      ok: false,
+      reason: 'no-such-group',
+    });
+    expect(splitOffGroup(reopened, ALICE, false, 'B', link, groupMark(reopened, 'B')).ok).toBe(
+      true,
+    );
     // A command draws nothing: the group it names is asked as it is.
     expect(splitOffGroup(gone, ALICE, false, 'B', link)).toEqual({
       ok: false,
@@ -440,6 +453,22 @@ describe('splitOffGroup: the old train', () => {
     expect(splitDrawn(done.party, 'A', drawn)).toBeUndefined();
     expect(splitDrawn(done.party, 'B', groupMark(fast(), 'A') ?? '')).toBeUndefined();
     expect(splitDrawn(fast(), 'B', drawn)).toBeUndefined();
+    // A group with a stamp of its own is remembered with it, and its split found by it.
+    const stamped = {
+      ...fast(),
+      groups: [{ id: 'A' }, { id: 'B', label: 'Fast', opened: PARTY_NOW + HOUR }],
+    } as TrainParty;
+    const stampedMark = groupMark(stamped, 'B') ?? '';
+    const split = splitOffGroup(stamped, ALICE, false, 'B', link);
+    if (!split.ok) throw new Error(split.reason);
+    expect(split.party.train.splitOff[0]).toEqual({
+      ...link,
+      group: 'B',
+      label: 'Fast',
+      opened: PARTY_NOW + HOUR,
+    });
+    expect(splitDrawn(split.party, 'B', stampedMark)).toMatchObject({ group: 'B' });
+    expect(splitDrawn(split.party, 'B', drawn)).toBeUndefined();
     // A later split of another group: the mark is no longer of the newest split.
     const three = trainWith([...TWO, { id: 'C' }], {
       [ALICE]: { group: 'B' },
@@ -477,7 +506,9 @@ describe('splitOffGroup: the old train', () => {
     expect(groupMark(fast(), 'B')).not.toBe(
       groupMark({ ...fast(), groups: [{ id: 'A' }, { id: 'B', label: 'Fast!' }] }, 'B'),
     );
-    expect(groupMark(fast(), 'A')).toMatch(/^[0-9a-z]+$/u);
+    // When the group was opened, then the hash: `<stamp>.<hash>`, both in base 36.
+    expect(groupMark(fast(), 'A')).toMatch(/^[0-9a-z]+\.[0-9a-z]+$/u);
+    expect(groupMark(fast(), 'A')?.split('.')[0]).toBe(PARTY_NOW.toString(36));
     expect(groupMark(fast(), 'C')).toBeUndefined();
   });
 });
diff --git a/src/domain/party/train.test.ts b/src/domain/party/train.test.ts
index b6e6074f66b1d0ba31cde4b3821372baeb353359..db8b796392fe5ca80c341d6a4d68baf5fe28a8be 100644
--- a/src/domain/party/train.test.ts
+++ b/src/domain/party/train.test.ts
@@ -880,7 +880,7 @@ describe('attendance in a train', () => {
     const opened = createGroup(train, ALICE, limits);
     expect(opened).toMatchObject({ ok: true, group: 'B', others: [REPORTER] });
     if (!opened.ok) throw new Error(opened.reason);
-    expect(opened.party.groups).toEqual([{ id: 'A' }, { id: 'B' }]);
+    expect(opened.party.groups).toEqual([{ id: 'A' }, { id: 'B', opened: PARTY_NOW + 1 }]);
     expect(opened.party.attendees[ALICE]?.group).toBe('B');
     const joined = joinGroup(opened.party, BOB, 'B', limits);
     expect(joined.ok && joined.party.attendees[BOB]).toMatchObject({
@@ -888,7 +888,11 @@ describe('attendance in a train', () => {
       status: PartyStatus.Coming,
     });
     const labelled = labelGroup(opened.party, ALICE, 'by car');
-    expect(labelled.ok && labelled.party.groups[1]).toEqual({ id: 'B', label: 'by car' });
+    expect(labelled.ok && labelled.party.groups[1]).toEqual({
+      id: 'B',
+      opened: PARTY_NOW + 1,
+      label: 'by car',
+    });
     let five: TrainParty = train;
     for (let n = 0; n < 4; n++) {
       const more = createGroup(five, ALICE, limits);
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index 756ecde78760ff5a6b447a429ac159586f86486c..6e9f6712db66ddc03b9ae71d20189dadd5f941fc 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -1,6 +1,8 @@
 import {
   attendeeOf,
   groupOf,
+  groupStamp,
+  stampedGroup,
   mayArrange,
   MAX_PARTY_NAME,
   MAX_ROUTE_STOPS,
@@ -1001,23 +1003,30 @@ function markOf(label: string | undefined, newest: string | undefined): string {
 }
 
 /**
- * A short mark of a group as it is now: its label (or none) and which group was split off the
- * train last (the newest `splitOff`'s party). The split's dialog carries it, so that a Submit for a
- * group whose label changed since, or that went and whose letter another group has now (even
- * with the same label), is refused (`group-changed`) instead of splitting what it did not show.
- * Undefined for a group the train does not have.
+ * A short mark of a group as it is now: `<stamp>.<hash>`, when it was opened (`groupStamp`, plan
+ * 8X-1B), then a hash of its label (or none) and which group was split off the train last (the
+ * newest `splitOff`'s party). The split's dialog carries it, so that a Submit for a group that
+ * went (pruned once it emptied, or split off) or whose letter a group opened since has, is
+ * refused as no such group, and one for a group whose label changed since, or whose letter
+ * another group has after a split (even with the same label), as `group-changed`, instead of
+ * splitting what it did not show. Undefined for a group the train does not have.
  */
 export function groupMark(party: TrainParty, groupId: string): string | undefined {
   const group = groupOf(party, groupId);
   if (!group) return undefined;
-  return markOf(group.label, party.train.splitOff[0]?.partyId);
+  return `${groupStamp(party, group)}.${markOf(group.label, party.train.splitOff[0]?.partyId)}`;
+}
+
+/** The stamp a mark was drawn with (`groupMark`): what comes before its dot. */
+function markStamp(mark: string): string {
+  return mark.slice(0, Math.max(0, mark.indexOf('.')));
 }
 
 /**
  * The split a stale mark was drawn for, when that very group is the one split off last: the
  * newest `splitOff` is of this letter, and the mark is what that group had just before (its
- * label then, the split before it). An answer to a second Submit of one dialog can then
- * say where the group went. Undefined otherwise.
+ * stamp, its label then, the split before it). An answer to a second Submit of one dialog can
+ * then say where the group went. Undefined otherwise.
  */
 export function splitDrawn(
   party: TrainParty,
@@ -1026,7 +1035,8 @@ export function splitDrawn(
 ): SplitOff | undefined {
   const [newest, before] = party.train.splitOff;
   if (newest?.group !== groupId) return undefined;
-  return markOf(newest.label, before?.partyId) === drawn ? newest : undefined;
+  const mark = `${groupStamp(party, newest)}.${markOf(newest.label, before?.partyId)}`;
+  return mark === drawn ? newest : undefined;
 }
 
 /** The members of a group, with their records, in the order they signed up. */
@@ -1165,7 +1175,9 @@ export interface SplitMoment {
  * from.
  *
  * Refused as `mayNotSplit` says; and with `drawn`, the mark of the group as the dialog showed
- * it (`groupMark`), when the group is called otherwise now or is gone (`group-changed`).
+ * it (`groupMark`), when the group is gone or another group has its letter now (opened since:
+ * `no-such-group`, plan 8X-1B), or it is called otherwise now or another group was split off
+ * since (`group-changed`).
  */
 export function splitOffGroup(
   party: TrainParty,
@@ -1184,7 +1196,10 @@ export function splitOffGroup(
     was: SplitMoment;
   }
 > {
-  if (drawn !== undefined && groupMark(party, groupId) !== drawn) return refused('group-changed');
+  if (drawn !== undefined) {
+    if (!stampedGroup(party, groupId, markStamp(drawn))) return refused('no-such-group');
+    if (groupMark(party, groupId) !== drawn) return refused('group-changed');
+  }
   const problem = mayNotSplit(party, memberId, staff, groupId);
   if (problem) return refused(problem);
   const group = groupOf(party, groupId);
@@ -1201,6 +1216,7 @@ export function splitOffGroup(
     ...link,
     group: groupId,
     ...(group.label === undefined ? {} : { label: group.label }),
+    ...(group.opened === undefined ? {} : { opened: group.opened }),
   };
   const after = withTrain(
     { ...party, attendees, groups, defaultGroupId },
diff --git a/src/services/attendance-service.test.ts b/src/services/attendance-service.test.ts
index ae2d5963badaeed69c6d28e1b8add10f76ed1298..443f2e84411923d01f6f8f2e4d5cd417a38f97b6 100644
--- a/src/services/attendance-service.test.ts
+++ b/src/services/attendance-service.test.ts
@@ -545,7 +545,10 @@ describe('AttendanceService: groups', () => {
   it('refuses a sixth group', async () => {
     const made = await reportedRaid();
     const id = made.party.id;
-    for (let n = 0; n < 4; n++) await made.attendance.newGroup(id, alice);
+    // Each by somebody else: a group its one member leaves goes (plan 8X-1B).
+    const dave: Member = { id: '200000000000000005', name: 'Dave' };
+    for (const member of [alice, bob, carol, dave]) await made.attendance.newGroup(id, member);
+    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
     expect(await made.attendance.newGroup(id, alice)).toEqual({
       kind: 'refused',
       reason: 'too-many-groups',
diff --git a/src/services/attendance-service.ts b/src/services/attendance-service.ts
index 0f98b1b79449d47b1e865fd69ccd606f97032988..08f5233f6ea56afbf6a7945181b7e1d317ae1dbd 100644
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -140,9 +140,12 @@ export class AttendanceService {
     return attendanceLimits(this.options.settings);
   }
 
-  /** The limits of a change of this party: with the size of its groups where it has one. */
+  /**
+   * The limits of a change of this party: with the size of its groups where it has one, and the
+   * time (a group the change opens is stamped with it).
+   */
   private limitsOf(party: Party): AttendanceLimits {
-    return { ...this.limits(), lobbySize: this.lobbySize(party) };
+    return { ...this.limits(), lobbySize: this.lobbySize(party), now: this.now() };
   }
 
   /** Interested, coming or here; what `options` leaves out stays as it is. */
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 774b30a7b8d08ee535ffad19671b3e128fd53bce..20788691f484e263735531ea9493582d4d98c9b2 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -937,6 +937,7 @@ export class PartyService {
           report.reporterId,
           report.autoStatus,
           this.lobbySize(party),
+          this.now(),
         );
         // Only somebody this report signed up: an attendee's record is theirs to change.
         return applied.joined
diff --git a/src/services/party-store.test.ts b/src/services/party-store.test.ts
index a44912e5a9efee6390e4f330becc74464953cfbf..87fee57a023594b1987753751869abb3d10829d9 100644
--- a/src/services/party-store.test.ts
+++ b/src/services/party-store.test.ts
@@ -13,9 +13,15 @@ import {
   testMeetup,
   testRaid,
   testRaidRules,
+  withAttendees,
 } from '../../test/support/parties.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
-import { attendanceLimits, leaveParty, setAttendance } from '../domain/party/attendance.js';
+import {
+  attendanceLimits,
+  createGroup,
+  leaveParty,
+  setAttendance,
+} from '../domain/party/attendance.js';
 import { endParty } from '../domain/party/party.js';
 import type { Party, RaidParty } from '../domain/party/party.js';
 import { setEndTime } from '../domain/party/raid.js';
@@ -163,6 +169,40 @@ describe('PartyStore', () => {
     expect(store.get(raid.id)).toBe(raid);
   });
 
+  it('gives a group opened again under a pruned letter a fresh stamp, within one millisecond too', async () => {
+    // The clock stands still: B is opened, emptied and pruned, and opened again.
+    const { store } = await partyStoreWith([testRaid()], () => PARTY_NOW);
+    const id = testRaid().id;
+    const open = (memberId: string) =>
+      store.update(id, (party) => createGroup(party, memberId, { ...limits, now: PARTY_NOW }));
+    await open(ALICE);
+    const first = store.get(id)?.groups.find((group) => group.id === 'B')?.opened;
+    await store.update(id, (party) => leaveParty(party, ALICE));
+    expect(store.get(id)?.groups.map((group) => group.id)).toEqual(['A']);
+    await open(BOB);
+    const again = store.get(id)?.groups.find((group) => group.id === 'B')?.opened;
+    expect(first).toBeDefined();
+    expect(again).toBeGreaterThan(first ?? Infinity);
+    // The party's last write is never before a stamp of its own.
+    expect(store.get(id)?.updatedAt).toBeGreaterThanOrEqual(again ?? Infinity);
+  });
+
+  it('prunes the groups nobody is in from a change that was written, and only from one', async () => {
+    const raid = withAttendees(
+      { ...testRaid(), groups: [{ id: 'A' }, { id: 'B', opened: PARTY_NOW + MINUTE }] },
+      { [ALICE]: { group: 'B' } },
+    );
+    const { store, storage } = await partyStoreWith([raid]);
+    // The reporter is the only one in A: a refusal and a change of nothing leave A alone.
+    await store.update(raid.id, (party) => leaveParty(party, CAROL));
+    await store.update(raid.id, (party) => ({ party }));
+    expect(store.get(raid.id)?.groups.map((group) => group.id)).toEqual(['A', 'B']);
+    const left = await store.update(raid.id, (party) => leaveParty(party, REPORTER));
+    expect(left?.party?.groups).toEqual([{ id: 'B', opened: PARTY_NOW + MINUTE }]);
+    expect(storage.rows.get(raid.id)?.groups).toEqual([{ id: 'B', opened: PARTY_NOW + MINUTE }]);
+    expect(store.get(raid.id)?.defaultGroupId).toBe('B');
+  });
+
   it('says whether anything was written: the first join is, an identical second is not', async () => {
     const raid = testRaid();
     const { store, storage } = await partyStoreWith([raid]);
@@ -597,6 +637,22 @@ describe('PartyStore', () => {
       expect(store.get(ID(2))).toBeUndefined();
       expect(storage.rows.get(ID(2))).toMatchObject({ status: 'ended' });
     });
+
+    it('prunes the groups nobody is in of both parties it writes', async () => {
+      const grouped = (party: RaidParty): RaidParty =>
+        withAttendees(
+          { ...party, groups: [{ id: 'A' }, { id: 'B', opened: PARTY_NOW + MINUTE }] },
+          { [ALICE]: { group: 'B' } },
+        );
+      const [one, other] = two();
+      const { store } = await partyStoreWith([grouped(one), grouped(other)]);
+      const result = await store.updateBoth([ID(1), ID(2)], (a, b) => ({
+        parties: [a && leaveParty(a, REPORTER).party, b && leaveParty(b, REPORTER).party] as const,
+      }));
+      for (const party of result.parties)
+        expect(party?.groups.map((group) => group.id)).toEqual(['B']);
+      expect(store.get(ID(1))?.groups.map((group) => group.id)).toEqual(['B']);
+    });
   });
 
   describe('addRaidUnlessTaken', () => {
diff --git a/src/services/party-store.ts b/src/services/party-store.ts
index 471f71a7a274488ea5cb11f84d55fc0e9d7b004f..d84ae5cd4c63fa3b88195839170a2a00a5c94444 100644
--- a/src/services/party-store.ts
+++ b/src/services/party-store.ts
@@ -1,5 +1,6 @@
 import type { PartyForum, PartySave, PartyStorage } from '../db/repositories/party-repository.js';
 import type { HistoryNote, PartyEnd, PartyWrite } from '../domain/history/party-history.js';
+import { pruneGroups } from '../domain/party/attendance.js';
 import { isRaid, type Party, type RaidParty } from '../domain/party/party.js';
 import { blocksNewRaid, raidKindOf } from '../domain/party/raid.js';
 import type { RaidKind } from '../domain/time/party-time.js';
@@ -8,6 +9,16 @@ import { KeyedLock } from './keyed-lock.js';
 
 const NOT_LOADED = 'Parties have not been loaded yet';
 
+/**
+ * When a change is written: now, never before the party's last write, and never before a stamp
+ * of one of its groups (plan 8X-1B: a group opened later is stamped after the party's last
+ * write, `openedGroup`, so stamps strictly increase, also across a prune and a reopening of a
+ * letter within one millisecond).
+ */
+function writtenAt(changed: Party, before: Party, now: number): number {
+  return Math.max(now, before.updatedAt, ...changed.groups.map((group) => group.opened ?? 0));
+}
+
 /** What handlers and guards read: the parties that have not ended, from memory. */
 export interface PartyProvider {
   get(id: string): Party | undefined;
@@ -240,8 +251,10 @@ export class PartyStore implements PartyProvider {
   /**
    * Applies a change to an active party: `change` gets the party as it is now and returns what
    * a function of `src/domain/party` returns, an object whose `party` is the changed party (or
-   * that has none, when the change was refused). A changed party is stamped with the time,
-   * written, and then replaces the old one; an ended party leaves memory. The result is what
+   * that has none, when the change was refused). A changed party loses the groups nobody is in
+   * (`pruneGroups`, plan 8X-1B: silently, and never for a refusal or a change of nothing), is
+   * stamped with the time, written, and then replaces the old one; an ended party leaves memory.
+   * The result is what
    * `change` returned, with the party as stored, and `written`: true when the change returned
    * another party object and it was stored, false when it was refused or changed nothing.
    * Handlers post a public line and show the post anew only when `written`. Undefined when there
@@ -269,13 +282,17 @@ export class PartyStore implements PartyProvider {
       const current = parties.get(id);
       if (!current) return undefined;
       const result = change(current);
-      const changed = result.party;
-      if (changed === undefined || changed === current) return { ...result, written: false };
+      if (result.party === undefined || result.party === current) {
+        return { ...result, written: false };
+      }
+      // The groups nobody is in go with the change that emptied them (plan 8X-1B), and only
+      // with a change: a refusal or a change of nothing leaves them.
+      const changed = pruneGroups(result.party);
       if (changed.id !== id)
         throw new Error(`A change of party ${id} returned party ${changed.id}`);
       if (changed.type !== current.type)
         throw new Error(`A change of ${current.type} ${id} returned a ${changed.type}`);
-      const stamped: Party = { ...changed, updatedAt: Math.max(this.now(), current.updatedAt) };
+      const stamped: Party = { ...changed, updatedAt: writtenAt(changed, current, this.now()) };
       const note = this.noteOf({
         before: current,
         after: stamped,
@@ -298,7 +315,7 @@ export class PartyStore implements PartyProvider {
    * both parties as they are now, in the order of `ids`, undefined for one that is not active
    * (it decides what that means), and returns `parties` in the same order: undefined, or the
    * very party it was given, for one it leaves alone. The rules of `update` hold for each: the
-   * same id and kind, stamped with the time, its note for the history (`ended` per party), an
+   * same id and kind, its empty groups pruned, stamped with the time, its note for the history (`ended` per party), an
    * ended party out of memory. Memory is replaced only once the write has committed, both
    * parties before the listeners are told of either. When the write fails, both stay in memory
    * as they were and the error is the caller's; a party whose row is gone leaves memory, and
@@ -334,15 +351,17 @@ export class PartyStore implements PartyProvider {
         for (const index of [0, 1] as const) {
           const id = ids[index];
           const before = current[index];
-          const changed = result.parties?.[index];
-          if (changed === undefined || changed === before) continue;
+          const given = result.parties?.[index];
+          if (given === undefined || given === before) continue;
+          // As in `update`: the groups nobody is in go with the change.
+          const changed = pruneGroups(given);
           if (before === undefined)
             throw new Error(`Party ${id} is not active: nothing is written`);
           if (changed.id !== id)
             throw new Error(`A change of party ${id} returned party ${changed.id}`);
           if (changed.type !== before.type)
             throw new Error(`A change of ${before.type} ${id} returned a ${changed.type}`);
-          const after: Party = { ...changed, updatedAt: Math.max(this.now(), before.updatedAt) };
+          const after: Party = { ...changed, updatedAt: writtenAt(changed, before, this.now()) };
           const ended = result.ended?.[index];
           const note = this.noteOf({ before, after, ...(ended ? { ended } : {}) });
           writes.push({ index, before, after, ...(note ? { note } : {}) });
diff --git a/src/services/raid-change-service.test.ts b/src/services/raid-change-service.test.ts
index 13c5de5e2ab087a6ca43a08df6073bb331b3760c..c584d3f4888d713f8e14995d03ad9326be1fa959 100644
--- a/src/services/raid-change-service.test.ts
+++ b/src/services/raid-change-service.test.ts
@@ -386,7 +386,7 @@ describe('RaidChangeService: meeting times follow corrected raid times', () => {
     await made.raids.setHatchTime(id, bob, HATCH + 10 * MINUTE);
     expect(made.current().groups).toEqual([
       { id: 'A', startTime: HATCH + 20 * MINUTE },
-      { id: 'B' },
+      { id: 'B', opened: expect.any(Number) as number },
     ]);
     expect((await lines(made)).at(-1)).toBe(
       'The meeting time of group B no longer fits the raid and is cancelled.',
diff --git a/src/services/train-split.test.ts b/src/services/train-split.test.ts
index 67a1ac70c0d598369e7b23462c7e61c90bc79427..2572809a9b6097718aa1ab0b26cc7d308cd5f113 100644
--- a/src/services/train-split.test.ts
+++ b/src/services/train-split.test.ts
@@ -200,7 +200,13 @@ describe('TrainService.split', () => {
     expect(Object.keys(old.attendees)).toEqual([REPORTER, CAROL]);
     expect(old.groups).toEqual([{ id: 'A' }]);
     expect(old.train.splitOff).toEqual([
-      { partyId: fresh.id, postId: fresh.forumPostId, group: 'B', label: 'Fast' },
+      {
+        partyId: fresh.id,
+        postId: fresh.forumPostId,
+        group: 'B',
+        label: 'Fast',
+        opened: expect.any(Number) as number,
+      },
     ]);
     expect(outcome.moved).toEqual([ALICE, BOB]);
     // The new post, with its link line in the region's channel; the old post is still there.
@@ -488,7 +494,8 @@ describe('TrainService.split: what fails, and what happens meanwhile', () => {
     ]);
     await settled(made);
     expect(first.kind).toBe('split');
-    expect(second).toEqual({ kind: 'refused', reason: 'group-changed' });
+    // The group went with the first: no such group by now (plan 8X-1B; its Submit says where).
+    expect(second).toEqual({ kind: 'refused', reason: 'no-such-group' });
     expect(made.store.active()).toHaveLength(2);
     expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
   });
````

### Task 2: 8X-1B task 2: one layout of buttons for one group and several

Prototype commit: `8a96ecdafd80b89fda53b178d2a56288557feb46`

Every post of a raid, train or meetup lists its trainers as text: a
text per group with its heading line (no letter for one group without a
label), its head count or lobby and meeting time, then a line per status
somebody is in, each starting with its button's icon (Interested,
Coming, Here, Done). Every button is in the rows at the bottom: the
statuses and Leave as icons; Meet... (pinemeet, plain clock until the
application has it), -1, +1 and Remote as icons; then Group... (off
while nobody is signed up), Set time, Screenshot feedback, and a
train's Move train..., Split group... and Whole route. The groups lose
their letter buttons; the hint of a missing meeting time names Meet...
by its icon and shows in copies too. The worst posts hold 31 and 32
components.

**Files:**

```
 src/commands/parties/in-train.test.ts       |   7 +-
 src/commands/raids/change.test.ts           |   2 +-
 src/commands/raids/raid-screenshot.test.ts  |   2 +-
 src/commands/trains/train.test.ts           |  12 +-
 src/components/party.train-copy.test.ts     |  12 +-
 src/components/party.ts                     |   4 +
 src/domain/pogo/game-icons.ts               |  10 +-
 src/render/meetup-post.test.ts              |  39 +++--
 src/render/meetup-post.ts                   |   2 +-
 src/render/mirrors.region.test.ts           |  13 +-
 src/render/mirrors.test.ts                  |  26 ++--
 src/render/party-controls.test.ts           | 392 +++++++++++++++++++-----------------------------
 src/render/party-controls.ts                | 194 +++++++++++++++---------
 src/render/party-post.lobby.test.ts         |  69 ++++-----
 src/render/party-post.test.ts               | 143 ++++++++++++------
 src/render/party-post.ts                    | 191 ++++++++++++-----------
 src/render/raid-post.test.ts                | 223 ++++++++++++++-------------
 src/render/raid-post.ts                     |  12 +-
 src/render/train-post.test.ts               | 152 ++++++++++---------
 src/render/train-post.ts                    |  33 ++--
 src/services/party-mirrors.region.test.ts   |   4 +-
 src/services/party-mirrors.test.ts          |   6 +-
 src/services/party-scheduler.meetup.test.ts |   2 +-
 src/services/party-service.lobby.test.ts    |  20 +--
 src/services/party-service.meetup.test.ts   |  10 +-
 src/services/party-service.test.ts          |  14 +-
 src/services/party-service.train.test.ts    |   8 +-
 27 files changed, 815 insertions(+), 787 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/in-train.test.ts src/commands/raids/change.test.ts src/commands/raids/raid-screenshot.test.ts src/commands/trains/train.test.ts src/components/party.train-copy.test.ts src/render/meetup-post.test.ts src/render/mirrors.region.test.ts src/render/mirrors.test.ts src/render/party-controls.test.ts src/render/party-post.lobby.test.ts src/render/party-post.test.ts src/render/raid-post.test.ts src/render/train-post.test.ts src/services/party-mirrors.region.test.ts src/services/party-mirrors.test.ts src/services/party-scheduler.meetup.test.ts src/services/party-service.lobby.test.ts src/services/party-service.meetup.test.ts src/services/party-service.test.ts src/services/party-service.train.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8a96ecdafd80b89fda53b178d2a56288557feb46 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-1B task 2: one layout of buttons for one group and several`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/in-train.test.ts b/src/commands/parties/in-train.test.ts
index d6c88cfa8274d14b301f2d49a745f08344540934..835700a8afb29e415426aa367bf559885c82213c 100644
--- a/src/commands/parties/in-train.test.ts
+++ b/src/commands/parties/in-train.test.ts
@@ -285,12 +285,11 @@ describe('the attendance commands in the post of a train', () => {
       { name: 'Group A (1)', value: 'A' },
       { name: 'Group B: by car (2)', value: 'B' },
     ]);
-    // The post has a Join beside each group now, and a group can be split off.
-    expect(buttonLabels(await made.shown()).slice(0, 4)).toEqual([
+    // The post lists both groups now, and a group can be split off.
+    expect(buttonLabels(await made.shown()).filter((label) => label !== undefined)).toEqual([
+      'Group…',
       'Move train…',
       'Split group…',
-      'A',
-      'B',
     ]);
     // Each by somebody else: a group its one member leaves goes (plan 8X-1B).
     for (const userId of [BOB, CAROL, '200000000000000005']) {
diff --git a/src/commands/raids/change.test.ts b/src/commands/raids/change.test.ts
index 1e96d6f6808eb66e4e1c9fdc3d0e586a32858bae..ea01a4d4a158aa822c20743f36ca193f70ed5c0a 100644
--- a/src/commands/raids/change.test.ts
+++ b/src/commands/raids/change.test.ts
@@ -276,7 +276,7 @@ describe('what the commands guard against', () => {
 
 describe('the "Set time" button and its form', () => {
   const actions = (made: Awaited<ReturnType<typeof setup>>) =>
-    bottomControls(made.current(), { groups: false, emoji: {} })
+    bottomControls(made.current(), { emoji: {} })
       .flat()
       .map(({ button }) => ('custom_id' in button ? decodeCustomId(button.custom_id)?.action : ''));
 
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index fb2eac7399d6de01e91e853990660f9a4695c87a..513807ee3bf5f01d29ff40e2c8e13ce0c2c70216 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -175,7 +175,7 @@ describe('/raid with a screenshot', () => {
       ...plain,
       raid: { ...plain.raid, screenshot: { id: null, timeUncertain: true } },
     };
-    const ids = bottomControls(unkept, { groups: false, emoji: {} })
+    const ids = bottomControls(unkept, { emoji: {} })
       .flat()
       .map(({ button }) => ('custom_id' in button ? button.custom_id : ''));
     expect(ids.some((id) => id.endsWith(':shot'))).toBe(false);
diff --git a/src/commands/trains/train.test.ts b/src/commands/trains/train.test.ts
index d6ca80971aef162143147041a31cc098052c657b..bacad00bd984fcc3c6fdd2ee0efe047ac477a4a6 100644
--- a/src/commands/trains/train.test.ts
+++ b/src/commands/trains/train.test.ts
@@ -93,10 +93,12 @@ describe('/train', () => {
     const post = made.gateway.posts.get(postId);
     expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Train · Saturday legendaries' });
     // The post has the button that opens the panel to move the train.
-    expect(buttonsOf(post?.message)[0]).toMatchObject({
-      label: 'Move train…',
-      customId: `party:${party?.id ?? ''}:move`,
-    });
+    expect(buttonsOf(post?.message).find((button) => button.label === 'Move train…')).toMatchObject(
+      {
+        label: 'Move train…',
+        customId: `party:${party?.id ?? ''}:move`,
+      },
+    );
     expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
     expect(sent(used.editReply).content).toBe(
       `Your train is made. Its post is <#${postId}>. There, \`/route add\` adds its stops, ` +
@@ -192,7 +194,7 @@ describe('/train', () => {
     const post = made.gateway.posts.get(party?.forumPostId ?? '');
     expect(textOf(post?.message)).not.toContain('Created by');
     // Signed up, so in the list of trainers like anybody: only "Created by" is left out.
-    expect(textOf(post?.message)).toContain('**Coming (1)**\n❄️ Alice');
+    expect(textOf(post?.message)).toContain('🏃 Coming (1): ❄️ Alice');
     expect(sent(used.editReply).content).toBe(
       `Your train is made. Its post is <#${party?.forumPostId ?? ''}>. There, \`/route add\` ` +
         'adds its stops, `/meet` sets when it starts, and `/conductor set` makes you its conductor.',
diff --git a/src/components/party.train-copy.test.ts b/src/components/party.train-copy.test.ts
index 0a0f91d42c9301049122a6f625cf40f27d90c198..5a3a3189e491f132c82fc0ea183b74df78bfb5e8 100644
--- a/src/components/party.train-copy.test.ts
+++ b/src/components/party.train-copy.test.ts
@@ -63,8 +63,8 @@ describe('the buttons of the copy of a train in another region', () => {
   it('sign a member up who cannot see the forum of the train, and let them into it', async () => {
     const made = await setup();
     made.gateway.shutOut(WEST_FORUM, ALICE);
-    // With several groups a member joins by a group's button: the last is B, where newcomers go.
-    const joined = await made.press('group');
+    // Join puts a newcomer in B, where newcomers go.
+    const joined = await made.press('join');
     expect(joined.reply).toHaveBeenCalledWith(privately('You are coming, in group B.'));
     expect(attendeeOf(made.current(), ALICE)).toMatchObject({
       status: PartyStatus.Coming,
@@ -82,19 +82,19 @@ describe('the buttons of the copy of a train in another region', () => {
     expect(made.ids.map((id) => decodeCustomId(id)?.action)).not.toContain('move');
   });
 
-  it('sign up and let in whoever presses Interested, Here, +1, Remote or the button of a group', async () => {
+  it('sign up and let in whoever presses Interested, Here, +1, Remote or Join', async () => {
     const made = await setup();
     const members = [ALICE, BOB, CAROL, ERIN, DAVE];
     made.gateway.shutOut(WEST_FORUM, ...members);
     const answers: (string | undefined)[] = [];
-    for (const [index, action] of ['maybe', 'here', 'more', 'remote', 'group'].entries()) {
+    for (const [index, action] of ['maybe', 'here', 'more', 'remote', 'join'].entries()) {
       const pressed = await made.press(action, members[index]);
       answers.push(sent(pressed.reply).content);
     }
     expect(answers).toEqual([
       'You are interested, in group B.',
       'You are here, in group B.',
-      // +1 by somebody who is not signed up signs them up; so does the button of a group.
+      // +1 by somebody who is not signed up signs them up; so does Join.
       'You are interested, in group B.',
       // So does Remote: whoever is not signed up is interested then, remotely.
       'You are interested, in group B, remotely.',
@@ -136,7 +136,7 @@ describe('the buttons of the copy of a train in another region', () => {
     await made.service.flush();
     // The copy is deleted with the train; a press that was on its way still arrives.
     expect(made.gateway.messagesIn(EAST_CHANNEL)).toEqual([]);
-    const late = await made.press('group');
+    const late = await made.press('join');
     expect(late.reply).toHaveBeenCalledWith(privately('This has ended.'));
   });
 });
diff --git a/src/components/party.ts b/src/components/party.ts
index ef51153e10c0854cd05b54bf817acaa0a9633bc4..62996e2deef19d3888cf968fed0bc6b1b264d1e0 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -141,6 +141,10 @@ export const partyButtons: ComponentHandler = {
       case 'splitform':
         // Only that dialog has this action.
         throw new UserError(STALE_COMPONENT);
+      case 'regroup':
+      case 'meet':
+        // "Group…" and "Meet…" (plan 8X-1B): their dialogs come with their tasks.
+        throw new UserError(STALE_COMPONENT);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
diff --git a/src/domain/pogo/game-icons.ts b/src/domain/pogo/game-icons.ts
index d4a484ca7606d0dc2f92f6b96d4b379bba9ca488..115824e3ea0f2fc2fc5f2a62336e52d03b50f781 100644
--- a/src/domain/pogo/game-icons.ts
+++ b/src/domain/pogo/game-icons.ts
@@ -50,7 +50,15 @@ export const CONTROL_ICON_NAMES = [
   'pineremote',
   'pineleave',
 ] as const;
-export type ControlIconName = (typeof CONTROL_ICON_NAMES)[number];
+/**
+ * Icons of controls the application may have although the upload script makes none of them yet
+ * (plan 8X-1B): `pinemeet`, the game's Select Time icon on Meet…, which comes from PokeMiners
+ * later (no file in `pictures/emoji/` yet; the uploader would fail on its missing file). Until
+ * the application has it the button shows ⏰.
+ */
+export const PENDING_CONTROL_ICON_NAMES = ['pinemeet'] as const;
+export type ControlIconName =
+  (typeof CONTROL_ICON_NAMES)[number] | (typeof PENDING_CONTROL_ICON_NAMES)[number];
 
 /** Every emoji of the game's icons that the bot looks for, as the upload script makes them. */
 export const GAME_ICON_NAMES: readonly string[] = [
diff --git a/src/render/meetup-post.test.ts b/src/render/meetup-post.test.ts
index 14b504e4472901493ae08e8a21581669a8061688..46c804c2cde692ddd684bfc243731873b9b6d216 100644
--- a/src/render/meetup-post.test.ts
+++ b/src/render/meetup-post.test.ts
@@ -124,10 +124,7 @@ describe('renderMeetupPost', () => {
     expect(rendered.tags).toEqual(['Meetup']);
     expect(textDisplays(rendered.message)).toEqual([
       `### Meetup: Community Day picnic\n${NO_TIME}`,
-      '**Interested (1)**',
-      `<@${REPORTER}>`,
-      '**Coming (0)**',
-      '**Present (0)**',
+      `1 trainer\n🤔 Interested (1): <@${REPORTER}>`,
       `-# Created by <@${REPORTER}>`,
     ]);
     expect(accentOf(rendered.message)).toBe(0x3498db);
@@ -382,7 +379,11 @@ describe('the information of a meetup post', () => {
     expect(information(withAttendees({ ...base, saved: true }, crowd))).toBe(
       `${'<\u200b'.repeat(999)}<`,
     );
-    expect(block(rendered, '**Coming')).toMatch(/…and \d+ more$/);
+    expect(
+      textOf(rendered.message)
+        .split('\n')
+        .find((line) => line.startsWith('🏃 Coming (')),
+    ).toMatch(/…and \d+ more$/);
   });
 });
 
@@ -549,29 +550,26 @@ describe('the trainers of a meetup post', () => {
       [BOB]: { status: PartyStatus.Coming, remote: true },
       [CAROL]: { status: PartyStatus.Coming, team: 'valor', name: 'Carol' },
     });
-    expect(partTexts(renderMeetupPost(view(meetup)).message).slice(1, 4)).toEqual([
-      `**Interested (1)**\n<@${REPORTER}>`,
-      `**Coming (2)**\n<@${BOB}> 🛰️, 🔥 Carol`,
-      '**Present (3)**\n❄️ Alice +2',
+    expect(textDisplays(renderMeetupPost(view(meetup)).message)[1]?.split('\n')).toEqual([
+      '6 trainers',
+      `🤔 Interested (1): <@${REPORTER}>`,
+      `🏃 Coming (2): <@${BOB}> 🛰️, 🔥 Carol`,
+      '✅ Here (3): ❄️ Alice +2',
     ]);
   });
 
-  it('has no Complete list and tells nobody to split up: there is no lobby', () => {
+  it('has no Done list and tells nobody to split up: there is no lobby', () => {
     const crowd: Record<string, Partial<Attendee>> = {};
     for (let n = 0; n < 30; n++) crowd[`300000000000${String(n).padStart(6, '0')}`] = {};
     const text = textOf(renderMeetupPost(view(withAttendees(testMeetup(), crowd))).message);
-    expect(text).toContain('**Coming (30)**');
-    expect(text).not.toContain('Complete');
+    expect(text).toContain('\n🏃 Coming (30): ');
+    expect(text).not.toContain('Done');
     expect(text).not.toContain('lobby');
   });
 
-  it('shows every status with its button when nobody is signed up', () => {
+  it('says so when nobody is signed up', () => {
     const empty = { ...testMeetup(), attendees: {} };
-    expect(textDisplays(renderMeetupPost(view(empty)).message).slice(1, 4)).toEqual([
-      '**Interested (0)**',
-      '**Coming (0)**',
-      '**Present (0)**',
-    ]);
+    expect(textDisplays(renderMeetupPost(view(empty)).message)[1]).toBe('Nobody yet');
   });
 });
 
@@ -580,8 +578,9 @@ describe('the controls of a meetup post', () => {
   const labels = (party: MeetupParty) =>
     buttonsOf(renderMeetupPost(view(party)).message).map((button) => button.label ?? button.emoji);
 
-  it('has no Done, no "Set time" and no map: the statuses, then Leave and the head count', () => {
-    expect(labels(testMeetup())).toEqual(['🤔', '🏃', '✅', 'Leave', '−1', '+1', 'Remote']);
+  it('has no Done, Meet…, "Set time", Group… or map: the statuses and Leave, then the head count', () => {
+    // A meetup has its one group for good: the rows of a raid without the third (plan 8X-1B).
+    expect(labels(testMeetup())).toEqual(['🤔', '🏃', '✅', '👋', '⬇️', '⬆️', '📡']);
   });
 
   it('names the meetup in every custom id, like the controls of a raid', () => {
diff --git a/src/render/meetup-post.ts b/src/render/meetup-post.ts
index 1aa005b9bb4b33a60775bd6e20848aec80cf63f3..a2da783051c1541bd5af4a985b1486834a266a18 100644
--- a/src/render/meetup-post.ts
+++ b/src/render/meetup-post.ts
@@ -212,7 +212,7 @@ function meetupLayout(view: MeetupPostView): PostLayout {
       { type: 'separator' },
       ...trainerBlocks(view, { complete: false, lobby: false, meetHint: false }, fit),
       { type: 'separator' },
-      { type: 'controls', rows: bottomControls(party, { groups: false, emoji: view.emoji }) },
+      { type: 'controls', rows: bottomControls(party, { emoji: view.emoji }) },
       {
         type: 'text',
         content: `-# Created by ${memberByName(memberOf(party, party.createdById))}`,
diff --git a/src/render/mirrors.region.test.ts b/src/render/mirrors.region.test.ts
index 32f97d4202d0e4a3a1f229b8bc28802942ee892a..fa19d695560c91fe0437a6555394197f6c7c14ca 100644
--- a/src/render/mirrors.region.test.ts
+++ b/src/render/mirrors.region.test.ts
@@ -59,27 +59,28 @@ describe('renderMirror for the channel of a region a train stops in', () => {
 
   it('has the controls of the post without the buttons that move or split the train', () => {
     expect(actions(rendered.message)).toEqual([
-      'move',
-      'split',
-      'group',
-      'group',
       'maybe',
+      'join',
       'here',
       'leave',
       'less',
       'more',
       'remote',
+      'regroup',
+      'move',
+      'split',
     ]);
     const copy = renderMirror('region', rendered, place);
+    // Group… stays: a member of that region joins and moves between groups from the copy.
     expect(actions(copy)).toEqual([
-      'group',
-      'group',
       'maybe',
+      'join',
       'here',
       'leave',
       'less',
       'more',
       'remote',
+      'regroup',
     ]);
     // Where the train is stays said, without its button.
     expect(textDisplays(copy)).toContain(textDisplays(rendered.message)[1]);
diff --git a/src/render/mirrors.test.ts b/src/render/mirrors.test.ts
index a366cdbb57f9fac0322a0bb0cd8278d69ba7fbd9..58be07d40145ee0084f3e70f58c4f2d35ba8cd09 100644
--- a/src/render/mirrors.test.ts
+++ b/src/render/mirrors.test.ts
@@ -15,7 +15,6 @@ import { PARTY_NOW, PARTY_ZONE, testRaid } from '../../test/support/parties.js';
 import type { RaidParty } from '../domain/party/party.js';
 import { renderMirror } from './mirrors.js';
 import type { V2Message } from '../discord/party-gateway.js';
-import { NO_MEETING_TIME } from './party-post.js';
 import { renderRaidPost } from './raid-post.js';
 
 const teams = { instinct: '⚡', mystic: '❄️', valor: '🔥' };
@@ -36,12 +35,10 @@ describe('renderMirror', () => {
   it('copies the post and its controls, opening with a line that links to the post', () => {
     const remote = renderMirror('remote', rendered, place);
     expect(leadOf(remote)).toBe('A raid in <#100000000000000001>: <#900000000000000001>');
-    // Everything but how to set a meeting time, which only works in the post itself.
-    expect(copiedPost(remote)).toEqual(
-      textDisplays(rendered.message).filter((text) => text !== NO_MEETING_TIME),
-    );
+    // Everything, how to set a meeting time too: Meet… works on a copy (plan 8X-1B).
+    expect(copiedPost(remote)).toEqual(textDisplays(rendered.message));
     // The line is the first of the post's first text: no component more than the post.
-    expect(componentCount(remote)).toBe(componentCount(rendered.message) - 1);
+    expect(componentCount(remote)).toBe(componentCount(rendered.message));
     expect(buttonsOf(remote)).toEqual(buttonsOf(rendered.message));
     expect(buttonsOf(remote).length).toBeGreaterThan(0);
     expect(thumbnailOf(remote)).toBe('https://example.test/egg.png');
@@ -91,10 +88,17 @@ describe('renderMirror', () => {
     const egg = raid();
     const elite = raid({ level: 'Elite', shadow: false });
     for (const kind of ['status', 'remote', 'ex'] as const) {
+      const statuses = ['🤔', 'pinejoin', 'pinehere', 'pinedone', 'pineleave'];
       expect(rowsOf(renderMirror(kind, egg, place))).toEqual([
-        ['Leave', '−1', '+1', 'Remote', 'Set time'],
+        statuses,
+        ['⬇️', '⬆️', 'pineremote'],
+        ['Group…', 'Set time'],
+      ]);
+      expect(rowsOf(renderMirror(kind, elite, place))).toEqual([
+        statuses,
+        ['⬇️', '⬆️'],
+        ['Group…', 'Set time'],
       ]);
-      expect(rowsOf(renderMirror(kind, elite, place))).toEqual([['Leave', '−1', '+1', 'Set time']]);
       for (const post of [egg, elite]) {
         const copy = renderMirror(kind, post, place);
         expect(buttonsOf(copy)).toEqual(buttonsOf(post.message));
@@ -103,9 +107,9 @@ describe('renderMirror', () => {
         );
       }
     }
-    expect(buttonsOf(egg.message).find((button) => button.label === 'Leave')?.emoji).toBe(
-      'pineleave',
-    );
+    expect(
+      buttonsOf(egg.message).find((button) => button.customId?.endsWith(':leave'))?.emoji,
+    ).toBe('pineleave');
   });
 
   it('leaves the picture out when asked, for when Discord refuses it', () => {
diff --git a/src/render/party-controls.test.ts b/src/render/party-controls.test.ts
index 016c594d2a8cd47415541bbcd266c83c93654fa2..23a18e929dd9e48a3d9bd97ac700bcd6ef830c62 100644
--- a/src/render/party-controls.test.ts
+++ b/src/render/party-controls.test.ts
@@ -16,14 +16,17 @@ import { setHatchTime } from '../domain/party/raid.js';
 import {
   bottomControls,
   completionQuestion,
-  joinGroupButton,
   moveTrainButton,
   statusButton,
   type ControlIcons,
   groupWords,
   isPartyAction,
+  isRaidAction,
   PARTY_ACTIONS,
   PARTY_KIND,
+  splitGroupButton,
+  statusIcon,
+  wholeRouteButton,
 } from './party-controls.js';
 import type { PostButton } from './party-post.js';
 
@@ -41,70 +44,53 @@ const PINE_ICONS: ControlIcons = {
 /** The emoji of a button of a post. */
 const emojiOf = ({ button }: PostButton) => ('emoji' in button ? button.emoji : undefined);
 
+/** A raid with times: it has Meet… and no "Set time". */
+const timed = setHatchTime(testRaid(), PARTY_NOW + 30 * 60_000, testRaidRules(), PARTY_NOW);
+
 /**
- * Every control a post of this raid shows, in their order there: label, emoji (a custom one by
- * its name), action and arguments.
+ * The rows of the controls of a post of this party: per button its emoji (a custom one by its
+ * name), its label when it has one, and its action.
  */
-function controls(party: RaidParty, emoji: ControlIcons = NO_ICONS) {
-  const groups = party.groups.length > 1;
-  const buttons = [
-    ...(groups
-      ? party.groups.map((group) => joinGroupButton(party, group, emoji))
-      : (['interested', 'coming', 'present', 'complete'] as const).map((status) =>
-          statusButton(party, status, emoji),
-        )),
-    ...bottomControls(party, { groups, emoji }).flat(),
-  ].map(({ button }) => button);
-  return buttons.map((button) => {
-    if (!('custom_id' in button)) throw new Error('a control without a custom id');
-    const id = decodeCustomId(button.custom_id);
-    return {
-      label: button.label,
-      emoji: button.emoji?.name,
-      action: id?.action,
-      args: id?.args,
-      disabled: button.disabled,
-    };
-  });
+function rows(party: Party, emoji: ControlIcons = NO_ICONS, opens: PostButton[] = []) {
+  return bottomControls(party, { emoji, opens }).map((row) =>
+    row.map(({ button }) => {
+      const label = 'label' in button ? button.label : undefined;
+      const shown = 'emoji' in button ? button.emoji?.name : undefined;
+      const action = 'custom_id' in button ? decodeCustomId(button.custom_id)?.action : undefined;
+      return [shown, label, action].filter((part) => part !== undefined).join(' ');
+    }),
+  );
 }
 
-const fiveGroups = (label?: string): RaidParty => ({
-  ...testRaid(),
-  groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({
-    id,
-    ...(label === undefined ? {} : { label }),
-  })),
-});
+/** The actions of each row. */
+const actions = (party: Party, opens: PostButton[] = []) =>
+  bottomControls(party, { emoji: NO_ICONS, opens }).map((row) =>
+    row.map(({ button }) =>
+      'custom_id' in button ? decodeCustomId(button.custom_id)?.action : undefined,
+    ),
+  );
 
-/** A raid with times: it has no "Set time" button. */
-const timed = setHatchTime(testRaid(), PARTY_NOW + 30 * 60_000, testRaidRules(), PARTY_NOW);
+const withShot = <P extends RaidParty>(raid: P): P => ({
+  ...raid,
+  raid: { ...raid.raid, screenshot: { id: 'a1', timeUncertain: false } },
+});
 
-describe('the controls of a raid post', () => {
-  it('has the four statuses as icons, then Leave, the head count and the remote switch', () => {
-    // The line beside a status's button says what it is: the button has no room for words on
-    // a phone (Matt, 2026-10-17).
-    expect(controls(timed).map((c) => [c.label, c.emoji, c.action])).toEqual([
-      [undefined, '🤔', 'maybe'],
-      [undefined, '🏃', 'join'],
-      [undefined, '✅', 'here'],
-      [undefined, '🎉', 'done'],
-      ['Leave', '👋', 'leave'],
-      ['−1', '⬇️', 'less'],
-      ['+1', '⬆️', 'more'],
-      ['Remote', '📡', 'remote'],
+describe('the controls of a post (plan 8X-1B: one layout for one group and several)', () => {
+  it('has the statuses and Leave, then Meet…, the head count and Remote, then Group…, as icons', () => {
+    // Matt, 2026-10-20: the first two rows icons only, legacy Pine's order; the buttons with a
+    // label, which open something, in the third.
+    expect(rows(withAttendees(timed, { [ALICE]: {} }))).toEqual([
+      ['🤔 maybe', '🏃 join', '✅ here', '🎉 done', '👋 leave'],
+      ['⏰ meet', '⬇️ less', '⬆️ more', '📡 remote'],
+      ['👥 Group… regroup'],
     ]);
   });
 
   it("shows legacy Pine's icons where the application has them, by id and name", () => {
-    expect(controls(timed, PINE_ICONS).map((c) => [c.label, c.emoji, c.action])).toEqual([
-      [undefined, '🤔', 'maybe'],
-      [undefined, 'pinejoin', 'join'],
-      [undefined, 'pinehere', 'here'],
-      [undefined, 'pinedone', 'done'],
-      ['Leave', 'pineleave', 'leave'],
-      ['−1', '⬇️', 'less'],
-      ['+1', '⬆️', 'more'],
-      ['Remote', 'pineremote', 'remote'],
+    expect(rows(timed, PINE_ICONS)).toEqual([
+      ['🤔 maybe', 'pinejoin join', 'pinehere here', 'pinedone done', 'pineleave leave'],
+      ['pinemeet meet', '⬇️ less', '⬆️ more', 'pineremote remote'],
+      ['👥 Group… regroup'],
     ]);
     expect(emojiOf(statusButton(timed, 'present', PINE_ICONS))).toEqual({
       id: EMOJI_ID,
@@ -116,18 +102,6 @@ describe('the controls of a raid post', () => {
       name: 'pinedone',
       animated: true,
     });
-    // Interested has no icon of its own; −1 and +1 keep their arrows.
-    const everything: ControlIcons = { controlIcon: (name) => `<:${name}:${EMOJI_ID}>` };
-    expect(controls(timed, everything).map((c) => c.emoji)).toEqual([
-      '🤔',
-      'pinejoin',
-      'pinehere',
-      'pinedone',
-      'pineleave',
-      '⬇️',
-      '⬆️',
-      'pineremote',
-    ]);
   });
 
   it('keeps the plain emoji where an emoji of that name is no custom emoji', () => {
@@ -137,61 +111,135 @@ describe('the controls of a raid post', () => {
     expect(emojiOf(statusButton(timed, 'coming', broken))).toEqual({ name: '🏃' });
   });
 
+  it('gives each status line the icon of its button, as text', () => {
+    expect(
+      (['interested', 'coming', 'present', 'complete'] as const).map((status) =>
+        statusIcon(PINE_ICONS, status),
+      ),
+    ).toEqual([
+      '🤔',
+      `<:pinejoin:${EMOJI_ID}>`,
+      `<:pinehere:${EMOJI_ID}>`,
+      `<:pinedone:${EMOJI_ID}>`,
+    ]);
+    expect(statusIcon(NO_ICONS, 'present')).toBe('✅');
+    expect(statusIcon({ controlIcon: () => '🦶' }, 'coming')).toBe('🏃');
+  });
+
+  it('is the same with one group and with several: no group has buttons of its own', () => {
+    const grouped: RaidParty = {
+      ...withAttendees(timed, { [ALICE]: { group: 'B' } }),
+      groups: [{ id: 'A' }, { id: 'B' }],
+    };
+    expect(rows(grouped)).toEqual(rows(withAttendees(timed, { [ALICE]: {} })));
+  });
+
+  it('has Group… switched off while nobody is signed up, and on for everybody once one is', () => {
+    const groupButton = (party: Party) =>
+      bottomControls(party, { emoji: NO_ICONS })
+        .flat()
+        .find(({ button }) => 'custom_id' in button && button.custom_id.endsWith(':regroup'));
+    const nobody = { ...timed, attendees: {} };
+    expect(groupButton(nobody)?.button).toMatchObject({ disabled: true, label: 'Group…' });
+    expect(groupButton(timed)?.button).not.toHaveProperty('disabled');
+  });
+
   it('names the party in every custom id, within the length Discord allows', () => {
-    const party = fiveGroups();
-    for (const control of controls(party)) {
-      expect(isPartyAction(control.action ?? '')).toBe(true);
-    }
-    for (const row of bottomControls(party, { groups: true, emoji: PINE_ICONS })) {
-      for (const { button } of row) {
-        if (!('custom_id' in button)) continue;
+    for (const party of [timed, testRaid(), testTrain(), testMeetup()]) {
+      for (const { button } of bottomControls(party, { emoji: PINE_ICONS }).flat()) {
+        if (!('custom_id' in button)) throw new Error('a control without a custom id');
         expect(button.custom_id.length).toBeLessThanOrEqual(MAX_CUSTOM_ID_LENGTH);
-        expect(decodeCustomId(button.custom_id)).toMatchObject({ kind: PARTY_KIND, id: party.id });
+        const id = decodeCustomId(button.custom_id);
+        expect(id).toMatchObject({ kind: PARTY_KIND, id: party.id });
+        expect(isPartyAction(id?.action ?? '')).toBe(true);
       }
     }
   });
 
-  it('is the same whatever the time: no control is switched off', () => {
+  it('is the same whatever the time: no control is switched off for it', () => {
     const egg = testRaid();
     const hatched = testRaid({ boss: { key: 'yveltal' } });
-    for (const party of [egg, hatched]) {
-      expect(controls(party).some((control) => control.disabled)).toBe(false);
-    }
-    expect(controls(egg)).toEqual(controls(hatched));
+    expect(rows(egg)).toEqual(rows(hatched));
+    expect(
+      bottomControls(egg, { emoji: NO_ICONS })
+        .flat()
+        .some(({ button }) => button.disabled),
+    ).toBe(false);
+  });
+
+  it('puts Set time in the place of Meet… while the raid has no times, after Group…', () => {
+    // A meeting time needs the raid's times: the two never show together.
+    expect(actions(testRaid())).toEqual([
+      ['maybe', 'join', 'here', 'done', 'leave'],
+      ['less', 'more', 'remote'],
+      ['regroup', 'time'],
+    ]);
+    expect(actions(withShot(testRaid()))).toEqual([
+      ['maybe', 'join', 'here', 'done', 'leave'],
+      ['less', 'more', 'remote'],
+      ['regroup', 'time', 'shot'],
+    ]);
+    expect(actions(withShot(timed))).toEqual([
+      ['maybe', 'join', 'here', 'done', 'leave'],
+      ['meet', 'less', 'more', 'remote'],
+      ['regroup', 'shot'],
+    ]);
+    expect(rows(withShot(testRaid())).at(-1)).toEqual([
+      '👥 Group… regroup',
+      '⏰ Set time time',
+      '📷 Screenshot feedback shot',
+    ]);
   });
 
-  it('offers "Set time" only while the raid has no times', () => {
-    expect(controls(testRaid()).map((c) => c.action)).toContain('time');
-    expect(controls(timed).map((c) => c.action)).not.toContain('time');
+  it('has no remote switch for an elite raid', () => {
+    const elite = setHatchTime(
+      testRaid({ tier: { level: 'Elite', shadow: false } }),
+      PARTY_NOW + 30 * 60_000,
+      testRaidRules(),
+      PARTY_NOW,
+    );
+    expect(actions(elite)[1]).toEqual(['meet', 'less', 'more']);
   });
 
-  it('offers to join each group once there are several, by the action that moves a member there', () => {
-    const party: RaidParty = {
-      ...withAttendees(testRaid(), { [ALICE]: { group: 'B', number: 3 }, [BOB]: { group: 'B' } }),
-      groups: [{ id: 'A' }, { id: 'B', label: '  park\n side ' }],
-      defaultGroupId: 'B',
-    };
-    // The group's letter with the shoe: the heading beside it names the group.
-    expect(
-      controls(party, PINE_ICONS)
-        .slice(0, 2)
-        .map((c) => [c.label, c.emoji, c.action, c.args]),
-    ).toEqual([
-      ['A', 'pinejoin', 'group', ['A']],
-      ['B', 'pinejoin', 'group', ['B']],
+  it('gives a train no Done and no Meet…, and its own labelled buttons after Group…', () => {
+    const train = testTrain();
+    const opens = [moveTrainButton(train), splitGroupButton(train), wholeRouteButton(train)];
+    expect(rows(train, NO_ICONS, opens)).toEqual([
+      ['🤔 maybe', '🏃 join', '✅ here', '👋 leave'],
+      ['⬇️ less', '⬆️ more', '📡 remote'],
+      ['👥 Group… regroup', '🚂 Move train… move', '✂️ Split group… split', '🗺️ Whole route route'],
     ]);
-    expect(controls(party)[0]?.emoji).toBe('🏃');
   });
 
-  it('has short buttons for five groups, whatever their labels', () => {
-    for (const control of controls(fiveGroups('x'.repeat(100))).slice(0, 5)) {
-      expect(control.label).toMatch(/^[A-E]$/);
-    }
+  it('gives a meetup, which has no groups, no Done, Meet… or Group…', () => {
+    expect(rows(testMeetup())).toEqual([
+      ['🤔 maybe', '🏃 join', '✅ here', '👋 leave'],
+      ['⬇️ less', '⬆️ more', '📡 remote'],
+    ]);
+  });
+
+  it('has buttons that say no word but Group… and those that open something', () => {
+    const party = testRaid();
+    expect(statusButton(party, 'coming', NO_ICONS).button).toEqual({
+      type: ComponentType.Button,
+      style: ButtonStyle.Primary,
+      emoji: { name: '🏃' },
+      custom_id: `party:${party.id}:join`,
+    });
+    expect(moveTrainButton(party)).toMatchObject({
+      moves: true,
+      button: { label: 'Move train…', custom_id: `party:${party.id}:move` },
+    });
   });
 
-  it('knows its own actions and no others', () => {
+  it('knows its own actions and no others, and which only a raid has', () => {
     for (const action of PARTY_ACTIONS) expect(isPartyAction(action)).toBe(true);
     expect(isPartyAction('gym')).toBe(false);
+    // The letter Join of a post drawn before plan 8X-1B still works: a train has groups too.
+    expect(isPartyAction('group')).toBe(true);
+    expect(isRaidAction('group')).toBe(false);
+    expect(isRaidAction('meet')).toBe(true);
+    expect(isRaidAction('regroup')).toBe(false);
   });
 });
 
@@ -235,141 +283,3 @@ describe('groupWords', () => {
     expect(groupWords({ id: 'B', label: '**park**' })).toBe('group B (\\*\\*park\\*\\*)');
   });
 });
-
-describe('bottomControls', () => {
-  /** Label, emoji and action (or address) of every button, row by row. */
-  const rows = (party: Party, groups: boolean, emoji: ControlIcons = NO_ICONS) =>
-    bottomControls(party, { groups, emoji }).map((row) =>
-      row.map(({ button }) => {
-        const label = 'label' in button ? button.label : undefined;
-        const shown = 'emoji' in button ? button.emoji?.name : undefined;
-        const what =
-          'custom_id' in button
-            ? decodeCustomId(button.custom_id)?.action
-            : 'url' in button
-              ? button.url
-              : '';
-        return `${shown ?? ''} ${label ?? ''} ${what ?? ''}`;
-      }),
-    );
-  it('puts Leave before the head count and the remote switch under one group, and no map', () => {
-    // The post's one Map is in its Where (Matt, 2026-10-17).
-    expect(rows(timed, false)).toEqual([
-      ['👋 Leave leave', '⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote'],
-    ]);
-  });
-
-  it("keeps the words of Leave and Remote beside legacy Pine's icons", () => {
-    expect(rows(timed, false, PINE_ICONS)).toEqual([
-      ['pineleave Leave leave', '⬇️ −1 less', '⬆️ +1 more', 'pineremote Remote remote'],
-    ]);
-  });
-
-  it('brings the statuses down to a row of their own, as icons, when the groups carry Join', () => {
-    expect(rows(timed, true)).toEqual([
-      ['🤔  maybe', '✅  here', '🎉  done', '👋 Leave leave'],
-      ['⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote'],
-    ]);
-    expect(rows(timed, true, PINE_ICONS)[0]).toEqual([
-      '🤔  maybe',
-      'pinehere  here',
-      'pinedone  done',
-      'pineleave Leave leave',
-    ]);
-  });
-
-  it('adds Set time to a raid without times and Screenshot feedback to one from a screenshot', () => {
-    const shot = {
-      ...testRaid(),
-      raid: { ...testRaid().raid, screenshot: { id: 'a1', timeUncertain: false } },
-    };
-    expect(rows(shot, false).flat().slice(-2)).toEqual([
-      '⏰ Set time time',
-      '📷 Screenshot feedback shot',
-    ]);
-  });
-
-  it('keeps the buttons below the lists in one row, a second only for what five leave over', () => {
-    // Matt, 2026-10-17: Set time joins Leave, −1, +1 and Remote; a phone wraps the row as it
-    // likes. The actions of each row, for every kind and variant.
-    const actions = (party: Party, groups: boolean) =>
-      bottomControls(party, { groups, emoji: NO_ICONS }).map((row) =>
-        row.map(({ button }) =>
-          'custom_id' in button ? decodeCustomId(button.custom_id)?.action : undefined,
-        ),
-      );
-    const withShot = <P extends RaidParty>(raid: P): P => ({
-      ...raid,
-      raid: { ...raid.raid, screenshot: { id: 'a1', timeUncertain: false } },
-    });
-    const egg = testRaid();
-    const elite = testRaid({ tier: { level: 'Elite', shadow: false } });
-    const eliteTimed = setHatchTime(elite, PARTY_NOW + 30 * 60_000, testRaidRules(), PARTY_NOW);
-    // A raid: Leave, the head count, Remote and Set time in one row; the screenshot's button
-    // is the sixth, so it starts a second.
-    expect(actions(egg, false)).toEqual([['leave', 'less', 'more', 'remote', 'time']]);
-    expect(actions(withShot(egg), false)).toEqual([
-      ['leave', 'less', 'more', 'remote', 'time'],
-      ['shot'],
-    ]);
-    expect(actions(timed, false)).toEqual([['leave', 'less', 'more', 'remote']]);
-    expect(actions(withShot(timed), false)).toEqual([['leave', 'less', 'more', 'remote', 'shot']]);
-    // With groups the statuses' row stays, and the rest fits one row even with everything.
-    expect(actions(withShot(egg), true)).toEqual([
-      ['maybe', 'here', 'done', 'leave'],
-      ['less', 'more', 'remote', 'time', 'shot'],
-    ]);
-    expect(actions(timed, true)).toEqual([
-      ['maybe', 'here', 'done', 'leave'],
-      ['less', 'more', 'remote'],
-    ]);
-    // An elite raid has no remote switch: everything fits one row.
-    expect(actions(withShot(elite), false)).toEqual([['leave', 'less', 'more', 'time', 'shot']]);
-    expect(actions(eliteTimed, false)).toEqual([['leave', 'less', 'more']]);
-    expect(actions(withShot(elite), true)).toEqual([
-      ['maybe', 'here', 'done', 'leave'],
-      ['less', 'more', 'time', 'shot'],
-    ]);
-    // A meetup and a train have no Done, Set time or screenshot.
-    expect(actions(testMeetup(), false)).toEqual([['leave', 'less', 'more', 'remote']]);
-    expect(actions(testTrain(), false)).toEqual([['leave', 'less', 'more', 'remote']]);
-    expect(actions(testTrain(), true)).toEqual([
-      ['maybe', 'here', 'leave'],
-      ['less', 'more', 'remote'],
-    ]);
-  });
-
-  it('has no remote switch for an elite raid, and no Done, Set time or map for a meetup', () => {
-    const elite = setHatchTime(
-      testRaid({ tier: { level: 'Elite', shadow: false } }),
-      PARTY_NOW + 30 * 60_000,
-      testRaidRules(),
-      PARTY_NOW,
-    );
-    expect(rows(elite, false)).toEqual([['👋 Leave leave', '⬇️ −1 less', '⬆️ +1 more']]);
-    expect(rows(testMeetup(), false)).toEqual([
-      ['👋 Leave leave', '⬇️ −1 less', '⬆️ +1 more', '📡 Remote remote'],
-    ]);
-    expect(rows(testTrain(), true)[0]).toEqual(['🤔  maybe', '✅  here', '👋 Leave leave']);
-  });
-
-  it('has buttons beside the statuses and the groups, and one that moves a train', () => {
-    const party = testRaid();
-    const join = statusButton(party, 'coming', NO_ICONS).button;
-    expect(join).toEqual({
-      type: ComponentType.Button,
-      style: ButtonStyle.Primary,
-      emoji: { name: '🏃' },
-      custom_id: `party:${party.id}:join`,
-    });
-    expect(joinGroupButton(party, { id: 'C' }, NO_ICONS).button).toMatchObject({
-      label: 'C',
-      emoji: { name: '🏃' },
-      custom_id: `party:${party.id}:group:C`,
-    });
-    expect(moveTrainButton(party)).toMatchObject({
-      moves: true,
-      button: { label: 'Move train…', custom_id: `party:${party.id}:move` },
-    });
-  });
-});
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index 65df03bf06f365f20df4d99d1dbee8293cf3e26e..15599ef5ad72c5a728ade602b5074c31842d406a 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -10,7 +10,7 @@ import {
 } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import type { ControlIconName } from '../domain/pogo/game-icons.js';
-import { isRaid, remoteAllowed, type Party, type PartyGroup } from '../domain/party/party.js';
+import { hasGroups, isRaid, remoteAllowed, type Party } from '../domain/party/party.js';
 import type { PostButton, PostEmoji } from './party-post.js';
 import { fitItems, plain } from './text.js';
 
@@ -28,7 +28,10 @@ export const PARTY_KIND = 'party';
  * shows the route privately. `shot` is "Screenshot feedback" of a raid reported from a
  * screenshot, which shows that screenshot privately. `split` is "Split group…" of a train with
  * two groups or more, which opens the dialog `splitform` (`train-split.ts`; `<group>:<mark>` when
- * it asks about one group); no button has `splitform`.
+ * it asks about one group); no button has `splitform`. `regroup` is "Group…" and `meet` is
+ * "Meet…" (plan 8X-1B), each of which opens a dialog. `group` is the letter Join of a post drawn
+ * before plan 8X-1B ("A", "B"): it still joins its letter until the post is shown anew, and is
+ * refused as no such group once that letter is gone.
  */
 export const PARTY_ACTIONS = [
   'maybe',
@@ -54,6 +57,8 @@ export const PARTY_ACTIONS = [
   'shot',
   'split',
   'splitform',
+  'regroup',
+  'meet',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
@@ -65,7 +70,7 @@ export function isPartyAction(value: string): value is PartyAction {
  * The actions that only the controls of a raid have: no other post shows them. A group button
  * is not among them: a train has groups too.
  */
-const RAID_ACTIONS: readonly PartyAction[] = ['done', 'answer', 'time', 'shot'];
+const RAID_ACTIONS: readonly PartyAction[] = ['done', 'answer', 'time', 'shot', 'meet'];
 
 /** Whether a control with this action can only have been a raid's. */
 export function isRaidAction(value: string): boolean {
@@ -157,11 +162,11 @@ const STATUS_BUTTONS: Readonly<
 };
 
 /**
- * The button beside a status in a post: Interested, Join, Here or Done, an icon without a label
- * (plan 8D-G, Matt, 2026-10-17: a phone puts a section's button under its line when the button
- * is wider than it allows, and "🤔 Interested" is). The line beside it says what it does;
- * Discord has no text for a button's accessible name but its label, so a screen reader reads
- * the emoji's name (`pinejoin`, or the character's) right after that line.
+ * A status's button: Interested, Join, Here or Done, an icon without a label (plan 8D-G, Matt,
+ * 2026-10-17), in the first row of a post's controls. The post's line of that status starts with
+ * the same icon (`statusIcon`, plan 8X-1B), which is how the button explains itself; Discord has
+ * no text for a button's accessible name but its label, so a screen reader reads the emoji's
+ * name (`pinejoin`, or the character's).
  */
 export function statusButton(
   party: Pick<Party, 'id'>,
@@ -175,19 +180,27 @@ export function statusButton(
 }
 
 /**
- * The button beside a group of a post with several: the group's letter with Join's icon ("A"
- * alone would not say what it does, the icon alone not which group). It makes a member coming in
- * that group, from whatever status, and moves one who is coming already (the action `group`,
- * `AttendanceService.joinInto`).
+ * An icon of a control as message text: the application's emoji of that name where it has one
+ * (`<:pinejoin:…>`), else the plain one (where a custom emoji is gone, text shows `:name:` and
+ * nothing is refused, unlike a button).
  */
-export function joinGroupButton(
-  party: Pick<Party, 'id'>,
-  group: PartyGroup,
-  icons: ControlIcons,
-): PostButton {
-  return iconButton(icons, 'pinejoin', '🏃', (emoji) =>
-    partyButton(party.id, 'group', group.id, ButtonStyle.Primary, [group.id], emoji),
-  );
+function iconText(icons: ControlIcons, name: ControlIconName, plain: string): string {
+  const custom = icons.controlIcon?.(name) ?? '';
+  return CUSTOM_EMOJI.test(custom) ? custom : plain;
+}
+
+/** The icon a post's line of a status starts with: that of its button (`statusButton`). */
+export function statusIcon(icons: ControlIcons, status: ShownStatus): string {
+  const [, icon, plain] = STATUS_BUTTONS[status];
+  return icon === undefined ? plain : iconText(icons, icon, plain);
+}
+
+/** The plain emoji of Meet… until the application has `pinemeet` (the game's Select Time icon). */
+const MEET_PLAIN = '⏰';
+
+/** Meet…'s icon as message text, for the hints that name it (plan 8X-1B). */
+export function meetIcon(icons: ControlIcons): string {
+  return iconText(icons, 'pinemeet', MEET_PLAIN);
 }
 
 /** The button "Move train…" of a train's post; a copy for another region leaves it out. */
@@ -240,76 +253,115 @@ export function splitGroupButton(party: Pick<Party, 'id'>): PostButton {
 /** The label of the button of a train's post that splits a group off. */
 export const SPLIT_GROUP_LABEL = 'Split group…';
 
+/** The label of the button of a raid's or a train's post that changes or opens a group. */
+export const GROUP_LABEL = 'Group…';
+
+/**
+ * "Group…" (plan 8X-1B, decision 3): a dialog to move to another group or open a new one, for
+ * whoever is signed up, and for a newcomer, whom it signs up as coming in the group they choose.
+ * Always shown, so that the buttons around it never move (Matt, 2026-10-20), and switched off
+ * (for everybody: Discord has no button per member) while nobody is signed up, when it could do
+ * nothing that Join does not; the first sign-up shows the post anew, which switches it on.
+ */
+export function groupButton(party: Pick<Party, 'id' | 'attendees'>): PostButton {
+  const button = partyButton(
+    party.id,
+    'regroup',
+    GROUP_LABEL,
+    ButtonStyle.Secondary,
+    undefined,
+    '👥',
+  );
+  return {
+    button: Object.keys(party.attendees).length === 0 ? { ...button, disabled: true } : button,
+  };
+}
+
+/**
+ * "Meet…" of a raid with times (plan 8X-1B, decision 5): the dialog that sets the meeting time of
+ * the member's own group. The game's Select Time icon (`pinemeet`), plain ⏰ until the
+ * application has it; no label.
+ */
+export function meetButton(party: Pick<Party, 'id'>, icons: ControlIcons): PostButton {
+  return iconButton(icons, 'pinemeet', MEET_PLAIN, (icon) =>
+    partyButton(party.id, 'meet', undefined, ButtonStyle.Secondary, undefined, icon),
+  );
+}
+
 export interface BottomOptions {
-  /**
-   * The party shows several groups: their sections carry their Join ("A", "B"), so the buttons of
-   * the other statuses come down here, on a row of their own.
-   */
-  groups: boolean;
   /** Where the buttons find their custom emoji (the post's `PostEmoji`). */
   emoji: ControlIcons;
+  /**
+   * The buttons with a label of the party's own kind, after Group… in the third row (a train's
+   * Move train…, Split group… and Whole route).
+   */
+  opens?: readonly PostButton[];
 }
 
 /**
- * The rows at the bottom of a post (spec 4.1). With several groups first Interested, Here and,
- * for a raid, Done (Join is each group's), with Leave; with one group the statuses have their
- * buttons beside them and Leave leads the row of the head count. Then −1, +1, the remote switch
- * (an elite raid has none), "Set time" for a raid without times (spec 4.3) and "Screenshot
- * feedback" for one reported from a kept screenshot (spec 7B), in one row (Matt, 2026-10-17: a
- * phone wraps it as it likes, and it is one component fewer than two rows); what five leave
- * over, only the screenshot's button of a raid of one group, starts a second. Nothing depends on
- * the time, so the controls never need an edit of their own: Done
- * on an egg is refused when it is pressed. A meetup has no Done (Leave is there), nor "Set
- * time" (its times are `/meet` and `/end`).
+ * The rows of a post's controls (plan 8X-1B, decision 1; Matt, 2026-10-20): the same for one
+ * group and several, and in raids and trains alike. Row 1 the statuses in legacy Pine's order,
+ * Interested, Join, Here, Done (a raid's: elsewhere Done means leave) and Leave; row 2 Meet… (a
+ * raid with times), −1, +1 and Remote (not for an elite raid); both rows icons only (the lines of
+ * the post start with the statuses' icons). Row 3 the buttons with a label, which open
+ * something: Group… (where the party has groups), then for a raid "Set time" (in Meet…'s place
+ * while it has no times, spec 4.3: the two never show together) and "Screenshot feedback" (one
+ * reported from a kept screenshot, spec 7B), then `opens`. A row with nothing in it is none.
+ * Nothing depends on the time, so the controls never need an edit of their own: Done on an egg
+ * is refused when it is pressed. A meetup has no Done, Meet…, Set time or Group….
  */
 export function bottomControls(party: Party, options: BottomOptions): PostButton[][] {
   const { id } = party;
   const { emoji } = options;
-  const leave = iconButton(emoji, 'pineleave', '👋', (icon) =>
-    partyButton(id, 'leave', 'Leave', ButtonStyle.Danger, undefined, icon),
-  );
-  const rows: PostButton[][] = [];
-  if (options.groups) {
-    rows.push([
-      statusButton(party, 'interested', emoji),
-      statusButton(party, 'present', emoji),
-      ...(isRaid(party) ? [statusButton(party, 'complete', emoji)] : []),
-      leave,
-    ]);
-  }
-  const row: PostButton[] = [
-    ...(options.groups ? [] : [leave]),
-    { button: partyButton(id, 'less', '−1', ButtonStyle.Secondary, undefined, '⬇️') },
-    { button: partyButton(id, 'more', '+1', ButtonStyle.Secondary, undefined, '⬆️') },
+  const raid = isRaid(party) ? party : undefined;
+  const statuses: PostButton[] = [
+    statusButton(party, 'interested', emoji),
+    statusButton(party, 'coming', emoji),
+    statusButton(party, 'present', emoji),
+    ...(raid ? [statusButton(party, 'complete', emoji)] : []),
+    iconButton(emoji, 'pineleave', '👋', (icon) =>
+      partyButton(id, 'leave', undefined, ButtonStyle.Danger, undefined, icon),
+    ),
+  ];
+  const counts: PostButton[] = [
+    // A meeting time needs the raid's times (`/meet`'s rule).
+    ...(raid && raid.hatchTime !== null ? [meetButton(party, emoji)] : []),
+    { button: partyButton(id, 'less', undefined, ButtonStyle.Secondary, undefined, '⬇️') },
+    { button: partyButton(id, 'more', undefined, ButtonStyle.Secondary, undefined, '⬆️') },
     ...(remoteAllowed(party)
       ? [
           iconButton(emoji, 'pineremote', '📡', (icon) =>
-            partyButton(id, 'remote', 'Remote', ButtonStyle.Secondary, undefined, icon),
+            partyButton(id, 'remote', undefined, ButtonStyle.Secondary, undefined, icon),
           ),
         ]
       : []),
   ];
-  // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
-  if (isRaid(party) && party.hatchTime === null) {
-    row.push({
-      button: partyButton(id, 'time', 'Set time', ButtonStyle.Primary, undefined, '⏰'),
-    });
-  }
-  // Only a kept screenshot can be shown.
-  if (isRaid(party) && party.raid.screenshot?.id) {
-    row.push({
-      button: partyButton(id, 'shot', SCREENSHOT_FEEDBACK, ButtonStyle.Secondary, undefined, '📷'),
-    });
-  }
-  for (let start = 0; start < row.length; start += MAX_ROW_BUTTONS) {
-    rows.push(row.slice(start, start + MAX_ROW_BUTTONS));
-  }
-  return rows;
+  const opens: PostButton[] = [
+    ...(hasGroups(party) ? [groupButton(party)] : []),
+    // Only while the raid has no times: afterwards `/hatch` and `/end` correct them.
+    ...(raid && raid.hatchTime === null
+      ? [{ button: partyButton(id, 'time', 'Set time', ButtonStyle.Primary, undefined, '⏰') }]
+      : []),
+    // Only a kept screenshot can be shown.
+    ...(raid?.raid.screenshot?.id
+      ? [
+          {
+            button: partyButton(
+              id,
+              'shot',
+              SCREENSHOT_FEEDBACK,
+              ButtonStyle.Secondary,
+              undefined,
+              '📷',
+            ),
+          },
+        ]
+      : []),
+    ...(options.opens ?? []),
+  ];
+  return [statuses, counts, opens].filter((row) => row.length > 0);
 }
 
-/** Discord's most buttons in a row. */
-const MAX_ROW_BUTTONS = 5;
-
 /** The label of the button of a raid's post that shows the screenshot it was reported from. */
 export const SCREENSHOT_FEEDBACK = 'Screenshot feedback';
 
diff --git a/src/render/party-post.lobby.test.ts b/src/render/party-post.lobby.test.ts
index 38a93ac16279e745c98f53d0786aa214bd1f016c..bdc13750b4c790b7dd2f6e26f987b089d0584e2b 100644
--- a/src/render/party-post.lobby.test.ts
+++ b/src/render/party-post.lobby.test.ts
@@ -23,6 +23,8 @@ const ALL = { complete: true, lobby: true, meetHint: false };
 const shown = (blocks: PostBlock[]) => postMessage({ accent: 1, blocks });
 const contents = (blocks: PostBlock[]) =>
   blocks.map((block) => (block.type === 'text' || block.type === 'section' ? block.content : ''));
+/** The first line of each block. */
+const headings = (blocks: PostBlock[]) => contents(blocks).map((text) => text.split('\n')[0]);
 
 function raidOf(
   attendees: Record<string, Partial<Attendee>>,
@@ -44,21 +46,19 @@ describe('trainerBlocks with a lobby size', () => {
       '300000000000000004': { name: 'Dot', status: Complete, number: 3 },
     });
     const blocks = trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all);
-    expect(contents(blocks)[0]).toBe('3/4 coming · 1 interested');
-    // The status lines stay as they are.
-    expect(sectionsOf(shown(blocks)).map((section) => section.text)).toEqual([
-      '**Interested (1)**',
-      '**Coming (2)**',
-      '**Present (1)**',
-      '**Complete (3)**',
+    // The status lines stay as they are, under it.
+    expect(contents(blocks)).toEqual([
+      '3/4 coming · 1 interested\n' +
+        '🤔 Interested (1): Cid\n🏃 Coming (2): Ann +1 📡\n✅ Here (1): Bea\n🎉 Done (3): Dot +2',
     ]);
+    expect(sectionsOf(shown(blocks))).toEqual([]);
   });
 
   it('leaves out who is interested when nobody is, and names the group when it has a label', () => {
     const party = raidOf({ '300000000000000001': { name: 'Ann', status: Coming } });
-    expect(contents(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toBe('1/4 coming');
+    expect(headings(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toBe('1/4 coming');
     const labelled = { ...party, groups: [{ id: 'A' as const, label: 'north' }] };
-    expect(contents(trainerBlocks({ party: labelled, emoji, lobbySize: 4 }, ALL, all))[0]).toBe(
+    expect(headings(trainerBlocks({ party: labelled, emoji, lobbySize: 4 }, ALL, all))[0]).toBe(
       '**Group A: north** · 1/4 coming',
     );
   });
@@ -70,12 +70,12 @@ describe('trainerBlocks with a lobby size', () => {
       '300000000000000003': { name: 'Cid', status: Interested },
     });
     expect(LOBBY_OVER).toBe('Over the lobby size: somebody could move to another group.');
-    expect(contents(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toBe(
-      `5/4 coming · 1 interested\n${LOBBY_OVER}`,
+    expect(contents(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toMatch(
+      new RegExp(`^5/4 coming · 1 interested\\n${LOBBY_OVER}\\n🤔 Interested`),
     );
   });
 
-  it('heads each of several groups so beside its Join, the note over the size under it', () => {
+  it('heads each of several groups so, the note over the size under it', () => {
     const party = raidOf(
       {
         '300000000000000001': { name: 'Ann', status: Coming, number: 4 },
@@ -85,18 +85,11 @@ describe('trainerBlocks with a lobby size', () => {
       ['A', 'B', 'C'],
     );
     const message = shown(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all));
-    expect(sectionsOf(message)).toEqual([
-      { text: '**Group A** · 4/4 coming · 1 interested', button: 'A' },
-      { text: '**Group B** · 5/4 coming', button: 'B' },
-      { text: '**Group C** · 0/4 coming', button: 'C' },
-    ]);
+    expect(sectionsOf(message)).toEqual([]);
     expect(textDisplays(message)).toEqual([
-      '**Group A** · 4/4 coming · 1 interested',
-      'Interested (1): Bea\nComing (4): Ann +3',
-      '**Group B** · 5/4 coming',
-      `${LOBBY_OVER}\nPresent (5): Cid +4`,
-      '**Group C** · 0/4 coming',
-      'Nobody yet',
+      '**Group A** · 4/4 coming · 1 interested\n🤔 Interested (1): Bea\n🏃 Coming (4): Ann +3',
+      `**Group B** · 5/4 coming\n${LOBBY_OVER}\n✅ Here (5): Cid +4`,
+      '**Group C** · 0/4 coming\nNobody yet',
     ]);
   });
 
@@ -104,25 +97,24 @@ describe('trainerBlocks with a lobby size', () => {
     const crowd: Record<string, Partial<Attendee>> = {};
     for (let n = 0; n < 4; n++) crowd[`31000000000000000${n}`] = { number: 3 };
     const party = raidOf(crowd);
-    expect(contents(trainerBlocks({ party, emoji, splitLobby: 11 }, ALL, all))[0]).toBe(
+    const second = (blocks: PostBlock[]) => contents(blocks)[0]?.split('\n')[1];
+    expect(second(trainerBlocks({ party, emoji, splitLobby: 11 }, ALL, all))).toBe(
       'More than 11 trainers: a lobby holds 11, so split up.',
     );
     // Not over it: no note; and without the setting, the game's 20.
-    expect(contents(trainerBlocks({ party, emoji, splitLobby: 12 }, ALL, all))[0]).toBe(
-      '**Interested (0)**',
-    );
-    expect(contents(trainerBlocks({ party, emoji }, ALL, all))[0]).toBe('**Interested (0)**');
+    expect(second(trainerBlocks({ party, emoji, splitLobby: 12 }, ALL, all))).toMatch(/^🏃/);
+    expect(second(trainerBlocks({ party, emoji }, ALL, all))).toMatch(/^🏃/);
   });
 
   it('tells no group to split up where the kind of party has no such size', () => {
     const crowd: Record<string, Partial<Attendee>> = {};
     for (let n = 0; n < 7; n++) crowd[`31000000000000000${n}`] = { number: 3 };
     const party = raidOf(crowd);
-    expect(contents(trainerBlocks({ party, emoji }, ALL, all))[0]).toBe(
-      'More than 20 trainers: a lobby holds 20, so split up.',
+    expect(contents(trainerBlocks({ party, emoji }, ALL, all))[0]).toContain(
+      '\nMore than 20 trainers: a lobby holds 20, so split up.\n',
     );
-    expect(contents(trainerBlocks({ party, emoji, splitLobby: null }, ALL, all))[0]).toBe(
-      '**Interested (0)**',
+    expect(contents(trainerBlocks({ party, emoji, splitLobby: null }, ALL, all))[0]).not.toContain(
+      'split up',
     );
   });
 
@@ -132,10 +124,12 @@ describe('trainerBlocks with a lobby size', () => {
     const party = raidOf(crowd, ['A', 'B']);
     const blocks = trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all);
     const texts = textDisplays(shown(blocks));
-    expect(texts[1]).toMatch(new RegExp(`^${LOBBY_OVER}\\nComing \\(21\\): `));
+    expect(texts[0]).toMatch(
+      new RegExp(`^\\*\\*Group A\\*\\* · 21/4 coming\\n${LOBBY_OVER}\\n🏃 Coming \\(21\\): `),
+    );
     expect(texts.join('\n')).not.toContain('so split up');
     const one = trainerBlocks({ party: raidOf(crowd), emoji, lobbySize: 4 }, ALL, all);
-    expect(contents(one)[0]).toBe(`21/4 coming\n${LOBBY_OVER}`);
+    expect(contents(one)[0]).toMatch(new RegExp(`^21/4 coming\\n${LOBBY_OVER}\\n`));
   });
 
   it('shows the post of today without a size', () => {
@@ -143,11 +137,8 @@ describe('trainerBlocks with a lobby size', () => {
       'A',
       'B',
     ]);
-    expect(sectionsOf(shown(trainerBlocks({ party, emoji }, ALL, all)))[0]).toEqual({
-      text: '**Group A** · 4 trainers',
-      button: 'A',
-    });
+    expect(headings(trainerBlocks({ party, emoji }, ALL, all))[0]).toBe('**Group A** · 4 trainers');
     const one = raidOf({ '300000000000000001': { name: 'Ann', status: Coming } });
-    expect(contents(trainerBlocks({ party: one, emoji }, ALL, all))[0]).toBe('**Interested (0)**');
+    expect(headings(trainerBlocks({ party: one, emoji }, ALL, all))[0]).toBe('1 trainer');
   });
 });
diff --git a/src/render/party-post.test.ts b/src/render/party-post.test.ts
index 887a2d7dbb0e1456e1586abe355f5ac5f7d7f391..a3bfd145b87867dfbe9a95140b99347944c3e06e 100644
--- a/src/render/party-post.test.ts
+++ b/src/render/party-post.test.ts
@@ -332,55 +332,74 @@ describe('trainerBlocks', () => {
       status: PartyStatus.CompletePending,
     },
   });
-  const view = (raid = mixed) => ({
+  const view = (raid = mixed, icons: Partial<PostEmoji> = {}) => ({
     party: raid,
-    emoji: { shiny: '✨', remote: '📡', teams } satisfies PostEmoji,
+    emoji: { shiny: '✨', remote: '📡', teams, ...icons } satisfies PostEmoji,
   });
   const all: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };
   const contents = (blocks: PostBlock[]) =>
     blocks.map((block) => (block.type === 'text' || block.type === 'section' ? block.content : ''));
   const ALL = { complete: true, lobby: true, meetHint: false };
+  const HINT = { complete: true, lobby: true, meetHint: true };
 
   /** The blocks as a post shows them. */
   const shown = (blocks: PostBlock[]) => postMessage({ accent: 1, blocks });
 
-  it('gives one group a line per status with its head count and its button, also an empty one', () => {
+  it('gives one group its head count and a line per status somebody is in, as text', () => {
+    // Plan 8X-1B (Matt, 2026-10-20): the layout of several groups for one too, the buttons all
+    // in the rows at the bottom; each line starts with its button's icon.
     const message = shown(trainerBlocks(view(), ALL, all));
-    // Beside its button a status's heading stands alone, one line, so that a phone keeps the
-    // button beside it; its members are a text under it.
-    expect(sectionsOf(message)).toEqual([
-      { text: '**Interested (1)**', button: '🤔' },
-      { text: '**Coming (3)**', button: '🏃' },
-      { text: '**Present (3)**', button: '✅' },
-      { text: '**Complete (0)**', button: '🎉' },
-    ]);
+    expect(sectionsOf(message)).toEqual([]);
     expect(textDisplays(message)).toEqual([
-      '**Interested (1)**',
-      '<@200000000000000001>',
-      '**Coming (3)**',
-      'Ann, Bea, ❄️ Cid',
-      '**Present (3)**',
-      '❄️ Dot +1, 🔥 Eve 📡',
-      '**Complete (0)**',
+      '7 trainers\n' +
+        '🤔 Interested (1): <@200000000000000001>\n' +
+        '🏃 Coming (3): Ann, Bea, ❄️ Cid\n' +
+        '✅ Here (3): ❄️ Dot +1, 🔥 Eve 📡',
     ]);
+    // Who is done has a line of their own, last, where the raid can be completed.
+    const done = withAttendees(mixed, {
+      '300000000000000002': { name: 'Bea', status: PartyStatus.Complete },
+    });
     expect(
-      sectionsOf(
-        shown(trainerBlocks(view(), { complete: false, lobby: false, meetHint: false }, all)),
-      ),
-    ).toHaveLength(3);
+      contents(trainerBlocks(view(done), ALL, all))[0]
+        ?.split('\n')
+        .at(-1),
+    ).toBe('🎉 Done (1): Bea');
+    expect(contents(trainerBlocks(view(done), { ...ALL, complete: false }, all))[0]).not.toContain(
+      'Done',
+    );
+  });
+
+  it("starts each line with the application's icon of its button where there is one", () => {
+    const icons = { controlIcon: (name: string) => `<:${name}:1400823744760905729>` };
+    expect(contents(trainerBlocks(view(mixed, icons), ALL, all))[0]?.split('\n')).toEqual([
+      '7 trainers',
+      '🤔 Interested (1): <@200000000000000001>',
+      '<:pinejoin:1400823744760905729> Coming (3): Ann, Bea, ❄️ Cid',
+      '<:pinehere:1400823744760905729> Here (3): ❄️ Dot +1, 🔥 Eve 📡',
+    ]);
+  });
+
+  it('says so of one group nobody is in', () => {
+    const nobody = { ...mixed, attendees: {} };
+    expect(contents(trainerBlocks(view(nobody), ALL, all))).toEqual(['Nobody yet']);
   });
 
-  it('names the one group above the statuses when it has a label or a meeting time', () => {
+  it('names the one group in its heading when it has a label, and says its meeting time', () => {
     const labelled = {
       ...mixed,
       groups: [{ id: 'A' as const, label: 'park *side*', startTime: 1_800_000_000_000 }],
     };
-    expect(contents(trainerBlocks(view(labelled), ALL, all))[0]).toBe(
-      '**Group A: park \\*side\\*** · meeting at <t:1800000000:t>',
+    expect(contents(trainerBlocks(view(labelled), ALL, all))[0]?.split('\n')[0]).toBe(
+      '**Group A: park \\*side\\*** · 7 trainers · meeting at <t:1800000000:t>',
+    );
+    const met = { ...mixed, groups: [{ id: 'A' as const, startTime: 1_800_000_000_000 }] };
+    expect(contents(trainerBlocks(view(met), ALL, all))[0]?.split('\n')[0]).toBe(
+      '7 trainers · meeting at <t:1800000000:t>',
     );
   });
 
-  it('gives several groups a block each with Join, and then who completed the raid', () => {
+  it('gives several groups a text each, and then who completed the raid', () => {
     const grouped = withAttendees(
       { ...mixed, groups: [{ id: 'A' as const }, { id: 'B' as const, label: 'late' }] },
       {
@@ -394,19 +413,14 @@ describe('trainerBlocks', () => {
       },
     );
     const message = shown(trainerBlocks(view(grouped), ALL, all));
-    // A group's heading alone beside its Join; who is in it in a text under it.
-    expect(sectionsOf(message)).toEqual([
-      { text: '**Group A** · 4 trainers', button: 'A' },
-      { text: '**Group B: late** · 1 trainer', button: 'B' },
-    ]);
+    expect(sectionsOf(message)).toEqual([]);
+    expect(customIdsOf(message)).toEqual([]);
     expect(textDisplays(message)).toEqual([
-      '**Group A** · 4 trainers',
-      'Interested (1): <@200000000000000001>\nComing (2): Ann, ❄️ Cid\nPresent (1): 🔥 Eve 📡',
-      '**Group B: late** · 1 trainer',
-      'Coming (1): Bea',
-      '**Complete (2)**\n❄️ Dot +1',
+      '**Group A** · 4 trainers\n' +
+        '🤔 Interested (1): <@200000000000000001>\n🏃 Coming (2): Ann, ❄️ Cid\n✅ Here (1): 🔥 Eve 📡',
+      '**Group B: late** · 1 trainer\n🏃 Coming (1): Bea',
+      '🎉 Done (2): ❄️ Dot +1',
     ]);
-    expect(customIdsOf(message)).toContain(`party:${mixed.id}:group:B`);
     // A group without members says so under its heading.
     const empty = shown(
       trainerBlocks(
@@ -415,7 +429,47 @@ describe('trainerBlocks', () => {
         all,
       ),
     );
-    expect(textDisplays(empty).slice(2, 4)).toEqual(['**Group B** · 0 trainers', 'Nobody yet']);
+    expect(textDisplays(empty)[1]).toBe('**Group B** · 0 trainers\nNobody yet');
+  });
+
+  it("says how to set a meeting time by Meet…'s icon while a group somebody is in has none", () => {
+    const meet = {
+      controlIcon: (name: string) =>
+        name === 'pinemeet' ? '<:pinemeet:1400823744760905729>' : undefined,
+    };
+    expect(
+      contents(trainerBlocks(view(mixed), HINT, all))[0]
+        ?.split('\n')
+        .at(-1),
+    ).toBe('-# No meeting time yet: ⏰ sets one.');
+    expect(
+      contents(trainerBlocks(view(mixed, meet), HINT, all))[0]
+        ?.split('\n')
+        .at(-1),
+    ).toBe('-# No meeting time yet: <:pinemeet:1400823744760905729> sets one.');
+    const met = { ...mixed, groups: [{ id: 'A' as const, startTime: 1_800_000_000_000 }] };
+    expect(contents(trainerBlocks(view(met), HINT, all)).join('\n')).not.toContain('-#');
+    // Several groups: one line after them, naming the groups without one.
+    const three = withAttendees(
+      {
+        ...mixed,
+        groups: [
+          { id: 'A' as const },
+          { id: 'B' as const, startTime: 1_800_000_000_000 },
+          { id: 'C' as const },
+          { id: 'D' as const },
+        ],
+      },
+      { '300000000000000002': { group: 'B' }, '300000000000000003': { group: 'C' } },
+    );
+    expect(contents(trainerBlocks(view(three), HINT, all)).at(-1)).toBe(
+      "-# Groups A and C have no meeting time yet: ⏰ sets your group's.",
+    );
+    const two = { ...three, groups: three.groups.slice(0, 3) };
+    const one = withAttendees(two, { '300000000000000003': { group: 'B' } });
+    expect(contents(trainerBlocks(view(one), HINT, all)).at(-1)).toBe(
+      "-# Group A has no meeting time yet: ⏰ sets your group's.",
+    );
   });
 
   it('puts a big group’s lobby note under its heading with several groups', () => {
@@ -426,9 +480,8 @@ describe('trainerBlocks', () => {
       crowd,
     );
     const message = shown(trainerBlocks(view(crowded), ALL, all));
-    expect(sectionsOf(message)[0]).toEqual({ text: '**Group A** · 22 trainers', button: 'A' });
-    expect(textDisplays(message)[1]).toMatch(
-      /^More than 20 trainers: a lobby holds 20, so split up\.\nInterested \(1\): /,
+    expect(textDisplays(message)[0]).toMatch(
+      /^\*\*Group A\*\* · 22 trainers\nMore than 20 trainers: a lobby holds 20, so split up\.\n🤔 Interested \(1\): /,
     );
   });
 
@@ -436,8 +489,10 @@ describe('trainerBlocks', () => {
     const crowd: Record<string, Partial<Attendee>> = {};
     for (let n = 0; n < 7; n++) crowd[`31000000000000000${n}`] = { number: 3 };
     const crowded = withAttendees(testRaid(), crowd);
-    expect(contents(trainerBlocks(view(crowded), ALL, all))[0]).toBe(
-      'More than 20 trainers: a lobby holds 20, so split up.',
-    );
+    expect(
+      contents(trainerBlocks(view(crowded), ALL, all))[0]
+        ?.split('\n')
+        .slice(0, 2),
+    ).toEqual(['22 trainers', 'More than 20 trainers: a lobby holds 20, so split up.']);
   });
 });
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index a224440a35522dd74931d35c40393bbee415a6a2..904823762d2a2c038b78e771147db13badaf27c0 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -5,13 +5,14 @@ import {
   lobbyCount,
   membersWhere,
   type Attendee,
+  type GroupId,
   type Party,
   type PartyGroup,
   type Team,
 } from '../domain/party/party.js';
 import { DEFAULT_LOBBIES } from '../domain/party/lobby.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { joinGroupButton, statusButton, type ShownStatus } from './party-controls.js';
+import { meetIcon, statusIcon, type ShownStatus } from './party-controls.js';
 import { count, memberName, plain, timestamp } from './text.js';
 import {
   actionRow,
@@ -257,12 +258,6 @@ export type PostBlock =
   | {
       type: 'text';
       content: string;
-      /**
-       * Lines of `content` that only the post itself says (how to set a meeting time, which
-       * `/meet` does only there): a copy elsewhere (`lead`) leaves them out, and the text
-       * altogether when nothing else is left.
-       */
-      postOnly?: readonly string[];
     }
   | { type: 'separator' }
   | {
@@ -328,7 +323,7 @@ export interface PostVariant {
  * order. A text whose picture or button is left out is a text display by itself; a thin line is
  * never first, last or doubled, whatever was left out around it. A section's details are a text
  * display of their own under it, one component each. A post that would hold more than
- * `MAX_COMPONENTS` (a raid of five groups with every control) puts the details of its sections
+ * `MAX_COMPONENTS` (no post since plan 8X-1B: the worst hold 32) puts the details of its sections
  * back into them, the last first and as few as make it fit; when even that is too many it goes
  * without the gym's picture as well (a `PostThumbnail` makes its text a section, two components
  * more), again with as few details put back as make it fit. Losing the picture comes last: a
@@ -378,17 +373,9 @@ function laidOut(
   };
   for (const block of layout.blocks) {
     switch (block.type) {
-      case 'text': {
-        const content =
-          variant.lead === undefined || block.postOnly === undefined
-            ? block.content
-            : block.content
-                .split('\n')
-                .filter((line) => !block.postOnly?.includes(line))
-                .join('\n');
-        if (content !== '') parts.push(textDisplay(withLead(content)));
+      case 'text':
+        if (block.content !== '') parts.push(textDisplay(withLead(block.content)));
         break;
-      }
       case 'separator':
         parts.push(separator());
         break;
@@ -612,11 +599,12 @@ export function fittedLayout(
 /** The statuses a post lists in a group, in its order (who completed a raid comes after). */
 const GROUP_STATUSES: readonly ShownStatus[] = ['interested', 'coming', 'present'];
 
+/** A status as the post's lines name it: the words of the buttons (plan 8X-1B, the mockup). */
 const STATUS_WORDS: Readonly<Record<ShownStatus, string>> = {
   interested: 'Interested',
   coming: 'Coming',
-  present: 'Present',
-  complete: 'Complete',
+  present: 'Here',
+  complete: 'Done',
 };
 
 /** Under which status a post lists an attendee: one asked whether they completed is present. */
@@ -672,22 +660,34 @@ export function groupInPostOrder(party: Party, groupId: string): string[] {
 }
 
 export interface TrainerOptions {
-  /** Whether the party is completed (a raid): the status Complete, with Done. */
+  /** Whether the party is completed (a raid): the status Done. */
   complete: boolean;
   /** Tell a group that is bigger than a lobby to split up (a raid, a train). */
   lobby: boolean;
   /**
-   * Say how a group gets a meeting time while one has none (a raid that is not over, plan 8D-F:
-   * `/meet` sets the meeting time of the member's own group). A train or meetup says how to set
-   * its start in its heading block instead.
+   * Say how a group gets a meeting time while one has none (a raid that is not over and has
+   * times, so that its post has Meet…; plan 8D-F, reworded in 8X-1B to name Meet… by its icon).
+   * A train or meetup says how to set its start in its heading block instead.
    */
   meetHint: boolean;
 }
 
-/** Under the heading of the one group of a raid while it has no meeting time. */
-export const NO_MEETING_TIME = '-# No meeting time yet: `/meet` sets one.';
-/** After the groups of a raid while one of them has no meeting time. */
-export const GROUP_MEETING_HINT = "-# `/meet` sets your group's meeting time.";
+/** The last line of the one group of a raid while it has no meeting time: Meet…'s icon sets one. */
+export function noMeetingTime(icon: string): string {
+  return `-# No meeting time yet: ${icon} sets one.`;
+}
+
+/**
+ * After the groups of a raid while some that somebody is in have no meeting time, naming them:
+ * `-# Group B has no meeting time yet: ⏰ sets your group's.` (the mockup of plan 8X-1B).
+ */
+export function groupMeetingHint(groups: readonly GroupId[], icon: string): string {
+  const named =
+    groups.length === 1
+      ? `Group ${groups[0] ?? ''} has`
+      : `Groups ${groups.slice(0, -1).join(', ')} and ${groups.at(-1) ?? ''} have`;
+  return `-# ${named} no meeting time yet: ${icon} sets your group's.`;
+}
 
 /**
  * `Group B: park side`, the label as the member wrote it, made plain; a label is one of the texts
@@ -728,90 +728,89 @@ function lobbyLine(view: TrainersView, group: PartyGroup): string | undefined {
 }
 
 /**
- * Who comes, as the post lists them. A party with one group has a line per status, its head
- * count in the heading, with the status's button beside it (an empty status too: its button
- * needs a place), its members as the section's details under it, and above them the group's
- * label and meeting time when it has them. A party with several groups has a block per group:
- * its heading (name, trainers, meeting time) with its "A" and Join's icon beside it, and as its details the
- * lobby note and a line per status that has members; and then, for a raid, who completed it.
- * The text beside a button is one line, so that a phone keeps the button beside it (plan 8D-F).
+ * The lines of a group (of all groups when `groupId` is undefined) for these statuses, each
+ * starting with its button's icon (`statusIcon`): `🏃 Coming (3): Ash +1, Misty`; a status nobody
+ * is in has none.
+ */
+function statusLines(
+  view: TrainersView,
+  statuses: readonly ShownStatus[],
+  fit: Fit,
+  groupId?: string,
+): string[] {
+  return statuses.flatMap((status) => {
+    const { heads, items } = statusMembers(view, status, groupId);
+    if (items.length === 0) return [];
+    const icon = statusIcon(view.emoji, status);
+    return [`${icon} ${STATUS_WORDS[status]} (${heads}): ${fit.list(items)}`];
+  });
+}
+
+/**
+ * Who comes, as the post lists them (plan 8X-1B, decision 1; Matt, 2026-10-20: one layout for one
+ * group and several, the buttons all in the rows at the bottom): a text per group, its heading
+ * line (with several groups `**Group B: label**`; with one only where it has a label), its head
+ * count (`N trainers`, or its lobby where the party has a size: `lobbyLine`) and meeting time,
+ * the lobby note, then a line per status somebody is in, Interested, Coming, Here (the asked
+ * among them), and with one group Done, or `Nobody yet`. With several groups who is done stands
+ * in a text of its own after them, for a raid. A raid that is not over and has times says how to
+ * set a meeting time by Meet…'s icon while one is missing (`noMeetingTime`, `groupMeetingHint`).
  * Members are listed by `attendeeTexts`; every list and label is asked of `fit`.
  */
 export function trainerBlocks(view: TrainersView, options: TrainerOptions, fit: Fit): PostBlock[] {
-  const { list } = fit;
   const { party } = view;
-  const statuses = GROUP_STATUSES;
+  const meet = meetIcon(view.emoji);
   const [only] = party.groups;
-  if (only && party.groups.length === 1) {
-    const blocks: PostBlock[] = [];
-    const lobby = lobbyLine(view, only);
-    const named = only.label || only.startTime !== undefined;
-    const heading = [
-      ...(named || lobby !== undefined
-        ? [
-            [
-              ...(named ? [`**${groupName(only, fit)}**`] : []),
-              ...(lobby === undefined ? [] : [lobby]),
-              ...(only.startTime === undefined ? [] : [`meeting at ${timestamp(only.startTime)}`]),
-            ].join(' · '),
-          ]
-        : []),
-      ...(options.meetHint && only.startTime === undefined ? [NO_MEETING_TIME] : []),
+  const several = party.groups.length > 1;
+  const heading = (group: PartyGroup): string[] => {
+    const someone = Object.values(party.attendees).some((attendee) => attendee.group === group.id);
+    const trainers =
+      lobbyLine(view, group) ??
+      (someone || several ? count(headCount(party, group.id), 'trainer') : undefined);
+    const parts = [
+      ...(several || group.label ? [`**${groupName(group, fit)}**`] : []),
+      ...(trainers === undefined ? [] : [trainers]),
+      ...(group.startTime === undefined ? [] : [`meeting at ${timestamp(group.startTime)}`]),
+    ];
+    return parts.length === 0 ? [] : [parts.join(' · ')];
+  };
+  if (only && !several) {
+    const lines = statusLines(
+      view,
+      options.complete ? [...GROUP_STATUSES, 'complete'] : GROUP_STATUSES,
+      fit,
+    );
+    const content = [
+      ...heading(only),
       ...lobbyNote(view, only, options),
+      ...(lines.length > 0 ? lines : ['Nobody yet']),
+      ...(options.meetHint && only.startTime === undefined && headCount(party, only.id) > 0
+        ? [noMeetingTime(meet)]
+        : []),
     ];
-    if (heading.length > 0) {
-      blocks.push({
-        type: 'text',
-        content: heading.join('\n'),
-        ...(heading.includes(NO_MEETING_TIME) ? { postOnly: [NO_MEETING_TIME] } : {}),
-      });
-    }
-    for (const status of options.complete ? [...statuses, 'complete' as const] : statuses) {
-      const { heads, items } = statusMembers(view, status);
-      blocks.push({
-        type: 'section',
-        content: `**${STATUS_WORDS[status]} (${heads})**`,
-        accessory: statusButton(party, status, view.emoji),
-        ...(items.length > 0 ? { details: list(items) } : {}),
-      });
-    }
-    return blocks;
+    return [{ type: 'text', content: content.join('\n') }];
   }
   const blocks: PostBlock[] = party.groups.map((group) => {
-    const lines = statuses.flatMap((status) => {
-      const { heads, items } = statusMembers(view, status, group.id);
-      return items.length > 0 ? [`${STATUS_WORDS[status]} (${heads}): ${list(items)}`] : [];
-    });
-    const heading = [
-      `**${groupName(group, fit)}**`,
-      lobbyLine(view, group) ?? count(headCount(party, group.id), 'trainer'),
-      ...(group.startTime === undefined ? [] : [`meeting at ${timestamp(group.startTime)}`]),
-    ].join(' · ');
+    const lines = statusLines(view, GROUP_STATUSES, fit, group.id);
     return {
-      type: 'section',
-      content: heading,
-      accessory: joinGroupButton(party, group, view.emoji),
-      details: [
+      type: 'text',
+      content: [
+        ...heading(group),
         ...lobbyNote(view, group, options),
         ...(lines.length > 0 ? lines : ['Nobody yet']),
       ].join('\n'),
     };
   });
-  // Only of a group somebody is in: nobody else could use `/meet` for it.
-  if (
-    options.meetHint &&
-    party.groups.some((group) => group.startTime === undefined && headCount(party, group.id) > 0)
-  ) {
-    blocks.push({ type: 'text', content: GROUP_MEETING_HINT, postOnly: [GROUP_MEETING_HINT] });
-  }
   if (options.complete) {
-    const { heads, items } = statusMembers(view, 'complete');
-    if (items.length > 0) {
-      blocks.push({
-        type: 'text',
-        content: `**${STATUS_WORDS.complete} (${heads})**\n${list(items)}`,
-      });
-    }
+    const done = statusLines(view, ['complete'], fit);
+    if (done.length > 0) blocks.push({ type: 'text', content: done.join('\n') });
+  }
+  // Only of a group somebody is in: nobody else could set one for it.
+  const timeless = party.groups
+    .filter((group) => group.startTime === undefined && headCount(party, group.id) > 0)
+    .map((group) => group.id);
+  if (options.meetHint && timeless.length > 0) {
+    blocks.push({ type: 'text', content: groupMeetingHint(timeless, meet) });
   }
   return blocks;
 }
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index bed71e3d48bc4b507079e2c5166d92a37f637de0..439afbffc6b3db4aa4dea9df6e109ca788bd3e4b 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -8,7 +8,6 @@ import {
   buttonNames,
   buttonsOf,
   componentCount,
-  copiedPost,
   partTexts,
   sectionsOf,
   textDisplays,
@@ -276,6 +275,16 @@ function block(post: RenderedPost, start: string): string | undefined {
   return undefined;
 }
 
+/**
+ * The line of a status in a post, by its word (`🏃 Coming (3): …`: plan 8X-1B, its button's icon
+ * first); undefined when nobody has that status.
+ */
+function statusLine(post: RenderedPost, word: string): string | undefined {
+  return textOf(post.message)
+    .split('\n')
+    .find((line) => new RegExp(`^\\S+ ${word} \\(\\d+\\): `).test(line));
+}
+
 describe('renderRaidPost', () => {
   it('shows an egg with its times and who is interested', () => {
     expect(shown(renderRaidPost(view(egg)))).toMatchInlineSnapshot(`
@@ -286,10 +295,12 @@ describe('renderRaidPost', () => {
           "🏃  party:00000000-0000-4000-8000-000000000001:join",
           "✅  party:00000000-0000-4000-8000-000000000001:here",
           "🎉  party:00000000-0000-4000-8000-000000000001:done",
-          "👋 Leave party:00000000-0000-4000-8000-000000000001:leave",
-          "⬇️ −1 party:00000000-0000-4000-8000-000000000001:less",
-          "⬆️ +1 party:00000000-0000-4000-8000-000000000001:more",
-          "📡 Remote party:00000000-0000-4000-8000-000000000001:remote",
+          "👋  party:00000000-0000-4000-8000-000000000001:leave",
+          "⏰  party:00000000-0000-4000-8000-000000000001:meet",
+          "⬇️  party:00000000-0000-4000-8000-000000000001:less",
+          "⬆️  party:00000000-0000-4000-8000-000000000001:more",
+          "📡  party:00000000-0000-4000-8000-000000000001:remote",
+          "👥 Group… party:00000000-0000-4000-8000-000000000001:regroup",
         ],
         "picture": undefined,
         "tags": [
@@ -301,12 +312,9 @@ describe('renderRaidPost', () => {
       Hatches <t:1791916200:R>, at <t:1791916200:t>. Ends at <t:1791918900:t>.",
           "**Where**
       **The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)",
-          "-# No meeting time yet: \`/meet\` sets one.",
-          "**Interested (1)**",
-          "<@200000000000000001>",
-          "**Coming (0)**",
-          "**Present (0)**",
-          "**Complete (0)**",
+          "1 trainer
+      🤔 Interested (1): <@200000000000000001>
+      -# No meeting time yet: ⏰ sets one.",
           "-# Reported by <@200000000000000001>",
         ],
         "title": "T5 egg · The Stacks",
@@ -333,15 +341,16 @@ describe('renderRaidPost', () => {
       {
         "accent": 3066993,
         "buttons": [
-          "🏃 A party:00000000-0000-4000-8000-000000000001:group:A",
-          "🏃 B party:00000000-0000-4000-8000-000000000001:group:B",
           "🤔  party:00000000-0000-4000-8000-000000000001:maybe",
+          "🏃  party:00000000-0000-4000-8000-000000000001:join",
           "✅  party:00000000-0000-4000-8000-000000000001:here",
           "🎉  party:00000000-0000-4000-8000-000000000001:done",
-          "👋 Leave party:00000000-0000-4000-8000-000000000001:leave",
-          "⬇️ −1 party:00000000-0000-4000-8000-000000000001:less",
-          "⬆️ +1 party:00000000-0000-4000-8000-000000000001:more",
-          "📡 Remote party:00000000-0000-4000-8000-000000000001:remote",
+          "👋  party:00000000-0000-4000-8000-000000000001:leave",
+          "⏰  party:00000000-0000-4000-8000-000000000001:meet",
+          "⬇️  party:00000000-0000-4000-8000-000000000001:less",
+          "⬆️  party:00000000-0000-4000-8000-000000000001:more",
+          "📡  party:00000000-0000-4000-8000-000000000001:remote",
+          "👥 Group… party:00000000-0000-4000-8000-000000000001:regroup",
         ],
         "picture": "https://cdn.leekduck.com/assets/img/pokemon_icons/pm717.icon.png",
         "tags": [
@@ -356,14 +365,13 @@ describe('renderRaidPost', () => {
       **Moveset** Snarl / ????",
           "**Where**
       **The Stacks** · 12 Maple Avenue, Pinewood, Pennsylvania 15999 · [Map](<https://www.google.com/maps/search/?api=1&query=40.05%2C-80.05>)",
-          "**Group A: park \\*side\\*** · 5 trainers · meeting at <t:1791917100:t>",
-          "Interested (1): <@200000000000000001>
-      Present (4): <@200000000000000002> +2, <@200000000000000009>",
-          "**Group B** · 1 trainer",
-          "Coming (1): <@200000000000000003> 🛰️",
-          "-# \`/meet\` sets your group's meeting time.",
-          "**Complete (1)**
-      <@200000000000000004>",
+          "**Group A: park \\*side\\*** · 5 trainers · meeting at <t:1791917100:t>
+      🤔 Interested (1): <@200000000000000001>
+      ✅ Here (4): <@200000000000000002> +2, <@200000000000000009>",
+          "**Group B** · 1 trainer
+      🏃 Coming (1): <@200000000000000003> 🛰️",
+          "🎉 Done (1): <@200000000000000004>",
+          "-# Group B has no meeting time yet: ⏰ sets your group's.",
           "-# Reported by <@200000000000000001>",
         ],
         "title": "Yveltal · The Stacks",
@@ -749,8 +757,8 @@ describe('renderRaidPost', () => {
       '300000000000000005': { name: 'Abe', team: 'instinct', number: 2, remote: true },
       '300000000000000006': { name: 'Al' },
     });
-    expect(block(renderRaidPost(view(party)), '**Coming')).toBe(
-      '**Coming (7)**\nAl, bea, <@300000000000000004>, ⚡ Abe +1 🛰️, Yan, 🔥 zed',
+    expect(statusLine(renderRaidPost(view(party)), 'Coming')).toBe(
+      '🏃 Coming (7): Al, bea, <@300000000000000004>, ⚡ Abe +1 🛰️, Yan, 🔥 zed',
     );
   });
 
@@ -761,8 +769,8 @@ describe('renderRaidPost', () => {
       '300000000000000003': { name: 'adam' },
       '300000000000000004': { name: 'Émile' },
     });
-    expect(block(renderRaidPost(view(party)), '**Coming')).toBe(
-      '**Coming (4)**\nadam, Émile, Émile, zed',
+    expect(statusLine(renderRaidPost(view(party)), 'Coming')).toBe(
+      '🏃 Coming (4): adam, Émile, Émile, zed',
     );
   });
 
@@ -784,7 +792,7 @@ describe('renderRaidPost', () => {
     }
     const party = withAttendees(testRaid({ autoStatus: PartyStatus.NotInterested }), many);
     const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote, teams: custom } }));
-    const value = block(post, '**Coming') ?? '';
+    const value = statusLine(post, 'Coming') ?? '';
     expect(value.match(/trainer \d+/g)).toHaveLength(20);
     expect(value).not.toMatch(/…and \d+ more/);
     // Each team's emoji stands once, before the first of its members.
@@ -796,20 +804,20 @@ describe('renderRaidPost', () => {
       '300000000000000001': { name: 'zed', team: 'mystic', status: PartyStatus.Complete },
       '300000000000000002': { name: 'amy', team: 'mystic', status: PartyStatus.Complete },
     });
-    expect(block(renderRaidPost(view(party)), '**Complete')).toBe('**Complete (2)**\n❄️ amy, zed');
+    expect(statusLine(renderRaidPost(view(party)), 'Done')).toBe('🎉 Done (2): ❄️ amy, zed');
   });
 
   it('warns a group of more than twenty trainers to split up', () => {
     const many: Record<string, object> = {};
     for (let n = 0; n < 300; n++) many[`300000000000000${String(n).padStart(3, '0')}`] = {};
     const post = renderRaidPost(view(withAttendees(egg, many)));
-    // Under the hint of a group without a meeting time.
-    expect(textDisplays(post.message)).toContain(
-      '-# No meeting time yet: `/meet` sets one.\nMore than 20 trainers: a lobby holds 20, so split up.',
+    // Under the group's head count, before its lines.
+    expect(textOf(post.message)).toContain(
+      '301 trainers\nMore than 20 trainers: a lobby holds 20, so split up.\n🤔 Interested (1): ',
     );
     // The note stands although the list itself is cut.
-    const value = block(post, '**Coming') ?? '';
-    expect(value).toMatch(/^\*\*Coming \(300\)\*\*\n/);
+    const value = statusLine(post, 'Coming') ?? '';
+    expect(value).toMatch(/^🏃 Coming \(300\): /);
     const listed = value.match(/<@3/g)?.length ?? 0;
     const left = Number(/…and (\d+) more$/.exec(value)?.[1]);
     expect(left).toBeGreaterThan(0);
@@ -818,7 +826,7 @@ describe('renderRaidPost', () => {
 
   it('shows thirty trainers who are all coming in full', () => {
     const post = renderRaidPost(view(withAttendees(egg, trainers(30))));
-    const value = block(post, '**Coming') ?? '';
+    const value = statusLine(post, 'Coming') ?? '';
     expect(value).not.toMatch(/…and \d+ more/);
     expect(value.match(/<@3/g)).toHaveLength(30);
   });
@@ -827,7 +835,7 @@ describe('renderRaidPost', () => {
     const remote = '<:pineremote:1234567890123456789>';
     const party = withAttendees(egg, trainers(200, { remote: true }));
     const post = renderRaidPost(view(party, { emoji: { shiny: '✨', remote, teams } }));
-    const value = block(post, '**Coming') ?? '';
+    const value = statusLine(post, 'Coming') ?? '';
     const listed = value.match(/<@3/g)?.length ?? 0;
     const left = Number(/…and (\d+) more/.exec(value)?.[1]);
     expect(listed + left).toBe(200);
@@ -892,52 +900,51 @@ describe('renderRaidPost', () => {
           `**Group ${id}: ${'L'.repeat(100)}** · ${id === 'A' ? 46 : 45} trainers · meeting at ${meeting}`,
       ),
     );
+    // Plan 8X-1B: the statuses and Leave, the head count and Remote, then Group… and the
+    // labelled buttons of a raid without times; no group has a button of its own.
     expect(buttonNames(post.message)).toEqual([
-      'A',
-      'B',
-      'C',
-      'D',
-      'E',
       '🤔',
+      '🏃',
       '✅',
       '🎉',
-      'Leave',
-      '−1',
-      '+1',
-      'Remote',
+      '👋',
+      '⬇️',
+      '⬆️',
+      '📡',
+      'Group…',
       'Set time',
       'Screenshot feedback',
     ]);
+    expect(sectionsOf(post.message).filter(({ button }) => button !== undefined)).toEqual([]);
     expect(thumbnailOf(post.message)).toMatch(/pm717/);
     // The boss's lines in the heading block and no Map button leave room for the gym's picture
     // even in so full a post (`postMessage` would leave it out past `MAX_COMPONENTS`).
     expect(thumbnailBeside(post.message, WHERE)).toBe(SHOWN_PICTURE);
     expect(textDisplays(post.message).some((text) => text.startsWith(WHERE))).toBe(true);
-    // Five groups' trainers each under their heading would be three components too many (the
-    // buttons below the lists in two rows, plan 8D-G): the first two groups keep them there, the
-    // others' go back beside their Join (`postMessage`), and the pictures stay.
-    const groupParts = sectionsOf(post.message).filter(
-      ({ button }) => button !== undefined && /^[A-E]$/.test(button),
-    );
-    expect(groupParts.map(({ text }) => text.split('\n').length > 1)).toEqual([
-      false,
-      false,
-      true,
-      true,
-      true,
-    ]);
-    expect(componentCount(post.message)).toBe(MAX_COMPONENTS);
+    // Each group one text and three rows of buttons: well within Discord's 40 with both
+    // pictures (before plan 8X-1B the groups' Join and their details needed 43, folded to 40).
+    expect(componentCount(post.message)).toBe(31);
     // And the fake gateway, as strict as Discord, takes it, and every copy of it.
     expectSendable(post);
-    // Without meeting times the hint after the groups is one more text, and it still fits.
+    // With times (Meet… in the place of Set time) and no meeting times, the hint after the
+    // groups is one more text, and it still fits.
     const untimed = renderRaidPost(
       view(
-        { ...party, groups: groups.map(({ id, label }) => ({ id, label })) },
+        {
+          ...party,
+          hatchTime: egg.hatchTime,
+          endTime: egg.endTime,
+          groups: groups.map(({ id, label }) => ({ id, label })),
+        },
         { gym, now: at('2026-10-13T14:40') },
       ),
     );
-    expect(textDisplays(untimed.message)).toContain("-# `/meet` sets your group's meeting time.");
+    expect(textDisplays(untimed.message)).toContain(
+      "-# Groups A, B, C, D and E have no meeting time yet: ⏰ sets your group's.",
+    );
+    expect(buttonNames(untimed.message).slice(5, 9)).toEqual(['⏰', '⬇️', '⬆️', '📡']);
     expect(thumbnailBeside(untimed.message, WHERE)).toBe(SHOWN_PICTURE);
+    expect(componentCount(untimed.message)).toBe(32);
     expectSendable(untimed);
     // A gym without an address: beside its picture that is said, and without the picture
     // (where Discord refuses one) the words go with it.
@@ -1102,9 +1109,7 @@ describe('renderRaidPost', () => {
 
   it('counts the heads of those who completed it, and shows a member’s guests', () => {
     const party = withAttendees(egg, { [CAROL]: { status: PartyStatus.Complete, number: 3 } });
-    expect(block(renderRaidPost(view(party)), '**Complete')).toBe(
-      `**Complete (3)**\n<@${CAROL}> +2`,
-    );
+    expect(statusLine(renderRaidPost(view(party)), 'Done')).toBe(`🎉 Done (3): <@${CAROL}> +2`);
   });
 
   it('marks a double weakness with ×2 and a single one without', () => {
@@ -1142,46 +1147,60 @@ describe('renderRaidPost', () => {
   });
 });
 
-describe('the hint of a raid without a meeting time (8D-F, F4)', () => {
-  const ONE = '-# No meeting time yet: `/meet` sets one.';
-  const SEVERAL = "-# `/meet` sets your group's meeting time.";
+describe('the hint of a raid without a meeting time (8D-F, F4; Meet… by its icon since 8X-1B)', () => {
+  const ONE = '-# No meeting time yet: ⏰ sets one.';
   const texts = (party: RaidParty, extra: Partial<RaidPostView> = {}) =>
     textDisplays(renderRaidPost(view(party, extra)).message);
+  const hints = (party: RaidParty, extra: Partial<RaidPostView> = {}) =>
+    texts(party, extra)
+      .join('\n')
+      .split('\n')
+      .filter((line) => line.includes('no meeting time yet') || line.includes('No meeting time'));
 
-  it('tells a raid of one group how to set one, as a text of its own before the statuses', () => {
+  it("tells a raid of one group how to set one, by Meet…'s icon, last in the group's text", () => {
     const shown = texts(egg);
-    expect(shown.filter((text) => text.includes('/meet'))).toEqual([ONE]);
-    expect(shown.indexOf(ONE)).toBe(shown.indexOf('**Interested (1)**') - 1);
-    expect(shown.indexOf(ONE)).toBeGreaterThan(
+    expect(hints(egg)).toEqual([ONE]);
+    const group = shown.find((text) => text.includes(ONE)) ?? '';
+    expect(group.split('\n')).toEqual([
+      '1 trainer',
+      '🤔 Interested (1): <@200000000000000001>',
+      ONE,
+    ]);
+    expect(shown.indexOf(group)).toBeGreaterThan(
       shown.findIndex((text) => text.startsWith('**Where**')),
     );
+    // With the application's own icon, that one.
+    const icons = { controlIcon: (name: string) => `<:${name}:1400823744760905729>` };
+    expect(hints(egg, { emoji: { ...emoji, ...icons } })).toEqual([
+      '-# No meeting time yet: <:pinemeet:1400823744760905729> sets one.',
+    ]);
   });
 
-  it('puts it under the label of a group that has one, and drops it once the group has a time', () => {
+  it('says it under a labelled group too, and drops it once the group has a time', () => {
     const labelled: RaidParty = { ...egg, groups: [{ id: 'A', label: 'park' }] };
-    expect(texts(labelled)).toContain(`**Group A: park**\n${ONE}`);
+    expect(texts(labelled).find((text) => text.startsWith('**Group A: park**'))).toMatch(
+      new RegExp(`\\n${ONE}$`),
+    );
     const meeting: RaidParty = {
       ...egg,
       groups: [{ id: 'A', label: 'park', startTime: at('2026-10-13T14:45') }],
     };
-    expect(texts(meeting).join('\n')).not.toContain('/meet');
-    const unlabelled: RaidParty = {
-      ...egg,
-      groups: [{ id: 'A', startTime: at('2026-10-13T14:45') }],
-    };
-    expect(texts(unlabelled).join('\n')).not.toContain('/meet');
+    expect(hints(meeting)).toEqual([]);
   });
 
-  it('says it once after the groups while one of several has none, and not once all have one', () => {
+  it('says it once after the groups, naming those without one, and not once all have one', () => {
     const grouped: RaidParty = withAttendees(
       { ...egg, groups: [{ id: 'A', startTime: at('2026-10-13T14:45') }, { id: 'B' }] },
       { [BOB]: { name: 'Bob', group: 'B' } },
     );
     const shown = texts(grouped);
-    expect(shown.filter((text) => text.includes('/meet'))).toEqual([SEVERAL]);
-    // After the last group's lines, as small print of its own; group A keeps its time.
-    expect(shown.indexOf(SEVERAL)).toBe(shown.indexOf('Coming (1): Bob') + 1);
-    expect(shown.some((text) => /^\*\*Group A\*\* · .* · meeting at <t:\d+:t>$/.test(text))).toBe(
+    const several = "-# Group B has no meeting time yet: ⏰ sets your group's.";
+    expect(hints(grouped)).toEqual([several]);
+    // After the last group's text, as small print of its own; group A keeps its time.
+    expect(shown.indexOf(several)).toBe(
+      shown.findIndex((text) => text.startsWith('**Group B**')) + 1,
+    );
+    expect(shown.some((text) => /^\*\*Group A\*\* · .* · meeting at <t:\d+:t>\n/.test(text))).toBe(
       true,
     );
     const timed: RaidParty = {
@@ -1191,46 +1210,40 @@ describe('the hint of a raid without a meeting time (8D-F, F4)', () => {
         { id: 'B', startTime: at('2026-10-13T14:50') },
       ],
     };
-    expect(texts(timed).join('\n')).not.toContain('/meet');
+    expect(hints(timed)).toEqual([]);
   });
 
   it('says nothing of a group nobody is in', () => {
-    // Group B is empty: nobody there could use /meet for it.
     const grouped: RaidParty = {
       ...egg,
       groups: [{ id: 'A', startTime: at('2026-10-13T14:45') }, { id: 'B' }],
     };
-    expect(texts(grouped).join('\n')).not.toContain('/meet');
+    expect(hints(grouped)).toEqual([]);
+  });
+
+  it('says nothing while the raid has no times: Set time stands in the place of Meet…', () => {
+    expect(hints(testRaid())).toEqual([]);
   });
 
-  it('says it in the post and its status copy, not in copies elsewhere, where /meet does not work', () => {
+  it('says it in the post and in every copy, where Meet… works as well', () => {
     const place = { postId: '900000000000000001', regionChannelId: '100000000000000001' };
-    const labelled: RaidParty = { ...egg, groups: [{ id: 'A', label: 'park' }] };
     const grouped: RaidParty = withAttendees(
       { ...egg, groups: [{ id: 'A' }, { id: 'B' }] },
       { [BOB]: { name: 'Bob', group: 'B' } },
     );
-    for (const party of [egg, labelled, grouped]) {
+    for (const party of [egg, grouped]) {
       const post = renderRaidPost(view(party));
-      expect(textOf(renderMirror('status', post, place))).toContain('/meet');
-      for (const kind of ['remote', 'ex', 'region'] as const) {
-        const copy = renderMirror(kind, post, place);
-        expect(textOf(copy), kind).not.toContain('/meet');
-        expect(copiedPost(copy).join('\n'), kind).toContain('Interested (1)');
+      for (const kind of ['status', 'remote', 'ex', 'region'] as const) {
+        expect(textOf(renderMirror(kind, post, place)), kind).toMatch(/no meeting time yet/i);
       }
     }
-    // The label stays in the copy, without the line under it.
-    const copy = renderMirror('remote', renderRaidPost(view(labelled)), place);
-    expect(textDisplays(copy)).toContain('**Group A: park**');
   });
 
   it('says nothing of it once the raid is over or closed', () => {
     const grouped: RaidParty = { ...egg, groups: [{ id: 'A' }, { id: 'B' }] };
     for (const party of [egg, grouped]) {
-      expect(texts(party, { now: at('2026-10-13T15:15') }).join('\n')).not.toContain('/meet');
-      expect(
-        texts(party, { closed: 'This raid was closed by **Mo** (<@9>).' }).join('\n'),
-      ).not.toContain('/meet');
+      expect(hints(party, { now: at('2026-10-13T15:15') })).toEqual([]);
+      expect(hints(party, { closed: 'This raid was closed by **Mo** (<@9>).' })).toEqual([]);
     }
   });
 });
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index c18e8b59e6f5825aadb621e5b092aedd099d4ac7..672c139dc74812f1f4050365bc5bdbcf01ee27ac 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -568,12 +568,14 @@ function raidLayout(view: RaidPostView): PostLayout {
       { type: 'separator' },
       gymWhere(WHERE_HEADING, gym, fit),
       { type: 'separator' },
-      ...trainerBlocks(view, { complete: true, lobby: true, meetHint: stage !== 'ended' }, fit),
+      // The hint names Meet…, which a raid has only once it has times.
+      ...trainerBlocks(
+        view,
+        { complete: true, lobby: true, meetHint: stage !== 'ended' && party.hatchTime !== null },
+        fit,
+      ),
       { type: 'separator' },
-      {
-        type: 'controls',
-        rows: bottomControls(party, { groups: party.groups.length > 1, emoji: view.emoji }),
-      },
+      { type: 'controls', rows: bottomControls(party, { emoji: view.emoji }) },
       ...(party.anonymous
         ? []
         : [
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index d575df1662a73ecd93bdc0ff3d0d486087943701..f87e41f92e1d50786129f1736b30cf21cf72e13c 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -157,6 +157,10 @@ function everySplit(character: string): Pick<TrainDetails, 'splitFrom' | 'splitO
   };
 }
 
+/** The labels of a message's buttons, of those that have one (Group…, Move train…, …). */
+const labelled = (message: Parameters<typeof buttonLabels>[0]): (string | undefined)[] =>
+  buttonLabels(message).filter((label) => label !== undefined);
+
 const NO_TIME =
   'No time has been set yet: `/meet` sets the start. Without one this post is archived ' +
   `${stamp(PARTY_NOW + (24 * 60 + 65) * MINUTE, 'R')}.`;
@@ -188,10 +192,7 @@ describe('renderTrainPost', () => {
     expect(textDisplays(post.message)).toEqual([
       `### Raid Train: Saturday legendaries\n${NO_TIME}`,
       '**Where**\nNo route yet: `/route add` adds a stop.',
-      '**Interested (1)**',
-      `<@${REPORTER}>`,
-      '**Coming (0)**',
-      '**Present (0)**',
+      `1 trainer\n🤔 Interested (1): <@${REPORTER}>`,
       `-# Created by <@${REPORTER}>`,
     ]);
     expect(post.message).toEqual(postMessage(post.layout));
@@ -286,13 +287,15 @@ describe('renderTrainPost', () => {
     expect(where(onRoute(SEVEN, 3))).toBe(
       `**Where · stop 4 of 7**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
     );
-    // Under it the next two stops and how many more, then Move train… and Whole route.
+    // Under it the next two stops and how many more; Move train… and Whole route are in the
+    // third row of the controls, after Group… (plan 8X-1B).
     expect(ahead(onRoute(SEVEN, 3))).toBe(
       '-# Next: 5. Starbucks · 6. Maple Leaf Mosaic, and 1 more to the end',
     );
-    expect(buttonLabels(post.message).slice(0, 2)).toEqual(['Move train…', 'Whole route']);
+    expect(labelled(post.message)).toEqual(['Group…', 'Move train…', 'Whole route']);
     const { id } = onRoute(SEVEN);
-    expect(customIdsOf(post.message).slice(0, 2)).toEqual([
+    expect(customIdsOf(post.message).slice(-3)).toEqual([
+      `party:${id}:regroup`,
       `party:${id}:move`,
       `party:${id}:route`,
     ]);
@@ -364,15 +367,14 @@ describe('renderTrainPost', () => {
     const long = renderTrainPost(view(onRoute(SEVEN, 7)));
     expect(where(onRoute(SEVEN, 7))).toBe('**Where**\nRoute complete');
     expect(ahead(onRoute(SEVEN, 7))).toBeUndefined();
-    expect(buttonLabels(long.message).slice(0, 2)).toEqual(['Move train…', 'Whole route']);
+    expect(labelled(long.message)).toEqual(['Group…', 'Move train…', 'Whole route']);
   });
 
   it('says how to add a stop to a train without a route, with Move train… alone', () => {
     const post = renderTrainPost(view(testTrain()));
     expect(where(testTrain())).toBe('**Where**\nNo route yet: `/route add` adds a stop.');
     expect(ahead(testTrain())).toBeUndefined();
-    expect(buttonLabels(post.message)[0]).toBe('Move train…');
-    expect(buttonLabels(post.message)).not.toContain('Whole route');
+    expect(labelled(post.message)).toEqual(['Group…', 'Move train…']);
   });
 
   it('lists a route that turned back or was reversed in its new order, numbered anew', () => {
@@ -397,19 +399,20 @@ describe('renderTrainPost', () => {
     });
     expect(buttonLabels(copy)).toContain('Whole route');
     expect(buttonLabels(copy)).not.toContain('Move train…');
-    // Every other button as the post has it: the statuses' icons, one row below the lists.
+    // Every other button as the post has it, in its three rows; Group… too.
     expect(buttonsOf(copy)).toEqual(
       buttonsOf(post.message).filter((button) => button.label !== 'Move train…'),
     );
     expect(buttonNames(copy)).toEqual([
-      'Whole route',
       '🤔',
       '🏃',
       '✅',
-      'Leave',
-      '−1',
-      '+1',
-      'Remote',
+      '👋',
+      '⬇️',
+      '⬆️',
+      '📡',
+      'Group…',
+      'Whole route',
     ]);
     // A short route's copy has neither.
     const short = renderMirror('region', renderTrainPost(view(onRoute([4, 1]))), {
@@ -487,8 +490,8 @@ describe('renderTrainPost', () => {
       `**Where · stop 1 of 2**\n**Veterans Memorial Bridge** · ${RIVER_ROAD} · [Map](<${maps(4)}>)`,
     );
     expect(thumbnailBeside(first.message, LOCATION)).toBe(`${picture(4)}=s400`);
-    // Move train… stays under where the train is.
-    expect(buttonLabels(first.message)[0]).toBe('Move train…');
+    // Move train… is in the third row, after Group… (plan 8X-1B).
+    expect(labelled(first.message)).toEqual(['Group…', 'Move train…']);
     const next = post(onRoute([4, 11], 1));
     expect(block(next, LOCATION)).toBe(
       `**Where · stop 2 of 2**\n**Riverside Park Gazebo** · ${RIVER_ROAD} · [Map](<${maps(11)}>)\n` +
@@ -507,7 +510,7 @@ describe('renderTrainPost', () => {
     expectSendable(next);
   });
 
-  it('lists the trainers by group, as a raid does, with a Join for each', () => {
+  it('lists the trainers by group, as a raid does, with the buttons of one group', () => {
     const train: TrainParty = {
       ...withAttendees(onRoute([4]), {
         [ALICE]: { status: PartyStatus.Present, group: 'B', number: 2 },
@@ -518,22 +521,22 @@ describe('renderTrainPost', () => {
     };
     const post = renderTrainPost(view(train));
     expect(block(post, '**Group A')).toBe(
-      `**Group A** · 1 trainer\nInterested (1): <@${REPORTER}>`,
+      `**Group A** · 1 trainer\n🤔 Interested (1): <@${REPORTER}>`,
     );
     expect(block(post, '**Group B')).toBe(
-      `**Group B: by car** · 3 trainers\nComing (1): <@${BOB}> 🛰️\nPresent (2): <@${ALICE}> +1`,
+      `**Group B: by car** · 3 trainers\n🏃 Coming (1): <@${BOB}> 🛰️\n✅ Here (2): <@${ALICE}> +1`,
     );
     expect(buttonNames(post.message)).toEqual([
-      'Move train…',
-      'Split group…',
-      'A',
-      'B',
       '🤔',
+      '🏃',
       '✅',
-      'Leave',
-      '−1',
-      '+1',
-      'Remote',
+      '👋',
+      '⬇️',
+      '⬆️',
+      '📡',
+      'Group…',
+      'Move train…',
+      'Split group…',
     ]);
   });
 
@@ -593,46 +596,36 @@ describe('renderTrainPost', () => {
       })),
     };
     const post = renderTrainPost(view(train, { gym: long }));
-    expect(componentCount(post.message)).toBe(MAX_COMPONENTS);
+    // Each group one text, the buttons in three rows (plan 8X-1B): within Discord's 40 with the
+    // picture and Split group… (before, 44 unfolded and four groups folded to 40).
+    expect(componentCount(post.message)).toBe(31);
     expect(layoutTextLength(post.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
     expectSendable(post);
-    // Five groups' trainers each under their heading would be four components too many with
-    // Split group… (plan 8T): the last four groups' go back beside their Join (`postMessage`),
-    // and the stop keeps its picture.
     expect(thumbnailBeside(post.message, '**Where')).toBe(
       `https://lh3.googleusercontent.com/${'p'.repeat(200)}=s400`,
     );
-    const groupParts = sectionsOf(post.message).filter(
-      ({ button }) => button !== undefined && /^[A-E]$/.test(button),
-    );
-    expect(groupParts.map(({ text }) => text.split('\n').length > 1)).toEqual([
-      false,
-      true,
-      true,
-      true,
-      true,
-    ]);
+    expect(sectionsOf(post.message).filter(({ button }) => button !== undefined)).toEqual([]);
     // Split group… is there too: five groups.
-    expect(buttonLabels(post.message).slice(0, 3)).toEqual([
+    expect(labelled(post.message)).toEqual([
+      'Group…',
       'Move train…',
-      'Whole route',
       'Split group…',
+      'Whole route',
     ]);
     // Where it is and the next two stops, however long the route.
     expect(block(post, '**Where')).toMatch(/^\*\*Where · stop 31 of 50\*\*\n\*\*Long gym name /);
     expect(block(post, '-# Next')).toMatch(
       /^-# Next: 32\. Long gym name [^·]+ · 33\. Long gym name [^·]+, and 17 more to the end$/,
     );
-    expect(buttonLabels(post.message).slice(0, 2)).toEqual(['Move train…', 'Whole route']);
     // With a lobby size (plan 8X-1; a Gigantamax train's will be 100) every group counts its
     // lobby and, over its size, says so in the place of the split-up note: it still fits.
     const sized = renderTrainPost(view(train, { gym: long, lobbySize: 4 }));
     expect(componentCount(sized.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
     expect(layoutTextLength(sized.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
     expectSendable(sized);
-    const headings = sectionsOf(sized.message)
-      .filter(({ button }) => button !== undefined && /^[A-E]$/.test(button))
-      .map(({ text }) => text.split('\n')[0]);
+    const headings = textDisplays(sized.message)
+      .filter((text) => text.startsWith('**Group'))
+      .map((text) => text.split('\n')[0]);
     expect(headings).toHaveLength(5);
     for (const heading of headings) expect(heading).toMatch(/ · \d+\/4 coming · \d+ interested · /);
     expect(textOf(sized.message)).toContain(LOBBY_OVER);
@@ -759,20 +752,27 @@ describe('the controls of a train post', () => {
       button.label ?? button.emoji,
       decodeCustomId(button.customId ?? '')?.action,
     ]);
+  /** A button of the post by its action. */
+  const buttonOf = (party: TrainParty, action: string) =>
+    buttonsOf(renderTrainPost(view(party)).message).find(
+      (button) => decodeCustomId(button.customId ?? '')?.action === action,
+    );
 
-  it('are those of a meetup, with a grey "Move train…" beside where the train is', () => {
+  it('are the rows of a raid without Done and Meet…, with a grey "Move train…" after Group…', () => {
+    // Plan 8X-1B: the same places in raids and trains (Matt, 2026-10-20).
     const train = testTrain();
     expect(controls(train)).toEqual([
-      ['Move train…', 'move'],
       ['🤔', 'maybe'],
       ['🏃', 'join'],
       ['✅', 'here'],
-      ['Leave', 'leave'],
-      ['−1', 'less'],
-      ['+1', 'more'],
-      ['Remote', 'remote'],
+      ['👋', 'leave'],
+      ['⬇️', 'less'],
+      ['⬆️', 'more'],
+      ['📡', 'remote'],
+      ['Group…', 'regroup'],
+      ['Move train…', 'move'],
     ]);
-    const move = buttonsOf(renderTrainPost(view(train)).message)[0];
+    const move = buttonOf(train, 'move');
     // Secondary: grey.
     expect(move?.style).toBe(2);
     expect(decodeCustomId(move?.customId ?? '')).toEqual({
@@ -783,32 +783,37 @@ describe('the controls of a train post', () => {
     });
   });
 
-  it('have a Join beside each group once there are several, and the statuses below', () => {
-    const train: TrainParty = { ...testTrain(), groups: [{ id: 'A' }, { id: 'B' }] };
-    expect(controls(train).map(([label]) => label)).toEqual([
-      'Move train…',
-      'A',
-      'B',
-      '🤔',
-      '✅',
-      'Leave',
-      '−1',
-      '+1',
-      'Remote',
+  it('are the same with several groups: no group has a Join of its own', () => {
+    const train: TrainParty = {
+      ...withAttendees(testTrain(), { [ALICE]: { group: 'B' } }),
+      groups: [{ id: 'A' }, { id: 'B' }],
+    };
+    expect(controls(train).map(([, action]) => action)).toEqual([
+      'maybe',
+      'join',
+      'here',
+      'leave',
+      'less',
+      'more',
+      'remote',
+      'regroup',
+      'move',
+      'split',
     ]);
   });
 
-  it('have a grey "Split group…" in the row of Move train… only with two groups of somebody', () => {
+  it('have a grey "Split group…" after Move train… only with two groups of somebody', () => {
     const two: TrainParty = {
       ...withAttendees(onRoute(SEVEN, 2), { [ALICE]: { group: 'B' } }),
       groups: [{ id: 'A' }, { id: 'B' }],
     };
-    expect(controls(two).slice(0, 3)).toEqual([
+    expect(controls(two).slice(-4)).toEqual([
+      ['Group…', 'regroup'],
       ['Move train…', 'move'],
-      ['Whole route', 'route'],
       ['Split group…', 'split'],
+      ['Whole route', 'route'],
     ]);
-    const split = buttonsOf(renderTrainPost(view(two)).message)[2];
+    const split = buttonOf(two, 'split');
     expect(split?.style).toBe(2);
     expect(split?.emoji).toBe('✂️');
     expect(decodeCustomId(split?.customId ?? '')).toEqual({
@@ -827,13 +832,14 @@ describe('the controls of a train post', () => {
       groups: [{ id: 'A' }, { id: 'B' }],
     };
     expect(controls(whole).map(([, action]) => action)).not.toContain('split');
-    // Not on a copy in another region, as Move train…; the copy keeps Whole route.
+    // Not on a copy in another region, as Move train…; the copy keeps Group… and Whole route.
     const copy = renderMirror('region', renderTrainPost(view(two)), {
       postId: '900000000000000001',
       regionChannelId: '100000000000000001',
     });
     expect(buttonsOf(copy).map((button) => button.label)).not.toContain('Split group…');
     expect(buttonsOf(copy).map((button) => button.label)).toContain('Whole route');
+    expect(buttonsOf(copy).map((button) => button.label)).toContain('Group…');
   });
 
   it('are the same wherever the train is and whoever leads it', () => {
diff --git a/src/render/train-post.ts b/src/render/train-post.ts
index 85be05a11fe440fc186905e3acbf669eac0e8ce9..6d7585403686706697b1fe4632aa5d1e4cc101f0 100644
--- a/src/render/train-post.ts
+++ b/src/render/train-post.ts
@@ -201,9 +201,8 @@ function aheadLine(view: TrainPostView, fit: Fit): PostBlock[] {
  * Where the train is (Matt, 2026-10-17): `**Where · stop 2 of 7**` and its current stop as a
  * raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them);
  * `Route complete` once the route is finished, how to add a stop while it has none; then what
- * lies ahead (`aheadLine`), and a row of "Move train…" (which a copy in another region leaves
- * out) and, on a route longer than `WHOLE_ROUTE_STOPS`, "Whole route" (the route privately, as
- * `/route show`). A row and not an accessory: the section's one accessory is the picture.
+ * lies ahead (`aheadLine`). Its buttons, "Move train…" and "Whole route", are in the third row
+ * of the controls since plan 8X-1B (`trainLayout`).
  */
 function trainWhere(view: TrainPostView, fit: Fit): PostBlock[] {
   const { party } = view;
@@ -215,21 +214,7 @@ function trainWhere(view: TrainPostView, fit: Fit): PostBlock[] {
       : at === undefined
         ? { type: 'text', content: `${WHERE_HEADING}\nRoute complete` }
         : gymWhere(`**Where · stop ${stop + 1} of ${route.length}**`, view.gym(at), fit);
-  return [
-    where,
-    ...aheadLine(view, fit),
-    {
-      type: 'controls',
-      rows: [
-        [
-          moveTrainButton(party),
-          ...(route.length > WHOLE_ROUTE_STOPS ? [wholeRouteButton(party)] : []),
-          // Plan 8T: only while there is a group to split off from another with somebody in it.
-          ...(splitsPossible(party) ? [splitGroupButton(party)] : []),
-        ],
-      ],
-    },
-  ];
+  return [where, ...aheadLine(view, fit)];
 }
 
 /** The room the small print of a train's splits may take. */
@@ -316,7 +301,17 @@ function trainLayout(view: TrainPostView): PostLayout {
       { type: 'separator' },
       {
         type: 'controls',
-        rows: bottomControls(party, { groups: party.groups.length > 1, emoji: view.emoji }),
+        rows: bottomControls(party, {
+          emoji: view.emoji,
+          // After Group…, in the third row (plan 8X-1B): Move train… and Split group… for the
+          // train's own post (`moves`), Whole route for its copies too.
+          opens: [
+            moveTrainButton(party),
+            // Plan 8T: only while there is a group to split off from another with somebody in it.
+            ...(splitsPossible(party) ? [splitGroupButton(party)] : []),
+            ...(party.train.route.length > WHOLE_ROUTE_STOPS ? [wholeRouteButton(party)] : []),
+          ],
+        }),
       },
       // Unless they chose not to be named (`/settings privacy`), as for a raid they report.
       ...(party.anonymous
diff --git a/src/services/party-mirrors.region.test.ts b/src/services/party-mirrors.region.test.ts
index 630277cbca64d41a7b0c0653c8301f997a132368..7817a8c5aa9ffd64bc2b8ac4eeb0be408f7a7d71 100644
--- a/src/services/party-mirrors.region.test.ts
+++ b/src/services/party-mirrors.region.test.ts
@@ -87,8 +87,8 @@ describe('the copies of a train in the regions it stops in', () => {
     const made = await createdTrain({ route: [4, 7] });
     const [copy] = copiesIn(made, EAST_CHANNEL);
     const post = buttonsOf(made.gateway.posts.get(made.postId)?.message);
-    expect(post[0]?.label).toBe(MOVE_TRAIN_LABEL);
-    expect(buttonsOf(copy?.message)).toEqual(post.slice(1));
+    expect(post.at(-1)?.label).toBe(MOVE_TRAIN_LABEL);
+    expect(buttonsOf(copy?.message)).toEqual(post.slice(0, -1));
     expect(customIdsOf(copy?.message)).toContain(`party:${made.party.id}:join`);
     expect(customIdsOf(copy?.message)).not.toContain(`party:${made.party.id}:move`);
     // The copy at the bottom of the post itself keeps it.
diff --git a/src/services/party-mirrors.test.ts b/src/services/party-mirrors.test.ts
index 077aa11aebf325a180c10574ed6dfd153369a4b8..6f8ad7ac43acd23823d0e86af5750deccb25f853 100644
--- a/src/services/party-mirrors.test.ts
+++ b/src/services/party-mirrors.test.ts
@@ -20,7 +20,6 @@ import type { Member } from './attendance-service.js';
 import { RETRY_AFTER_MS } from './party-mirrors.js';
 import type { PartyServiceOptions, RaidReport } from './party-service.js';
 import type { OutgoingMessage } from '../discord/party-gateway.js';
-import { NO_MEETING_TIME } from '../render/party-post.js';
 import {
   buttonsOf,
   copiedPost,
@@ -34,9 +33,8 @@ import {
 
 const alice: Member = { id: ALICE, name: 'Alice' };
 
-/** What a copy elsewhere shows of a post: its texts but how to set a meeting time (`/meet`). */
-const elsewhere = (message: OutgoingMessage | undefined): string[] =>
-  textDisplays(message).filter((text) => text !== NO_MEETING_TIME);
+/** What a copy elsewhere shows of a post: its texts (Meet… works there too, plan 8X-1B). */
+const elsewhere = (message: OutgoingMessage | undefined): string[] => textDisplays(message);
 const yveltal = { boss: { key: 'yveltal' } } as const;
 const ELITE = { level: 'Elite', shadow: false } as const;
 
diff --git a/src/services/party-scheduler.meetup.test.ts b/src/services/party-scheduler.meetup.test.ts
index f6f144ff6029e1175e3840003e734f6b2a0342af..3099f23a78956a8f0726c2965568b537b546157c 100644
--- a/src/services/party-scheduler.meetup.test.ts
+++ b/src/services/party-scheduler.meetup.test.ts
@@ -119,7 +119,7 @@ describe('PartyScheduler: a meetup while it goes on', () => {
     expect(made.gateway.posts.get(made.postId)?.renames).toBe(0);
     expect(
       buttonsOf(made.gateway.posts.get(made.postId)?.message).map((b) => b.label ?? b.emoji),
-    ).toEqual(['🤔', '🏃', '✅', 'Leave', '−1', '+1', 'Remote']);
+    ).toEqual(['🤔', '🏃', '✅', '👋', '⬇️', '⬆️', '📡']);
   });
 
   it('shows the date of its times once the day has changed', async () => {
diff --git a/src/services/party-service.lobby.test.ts b/src/services/party-service.lobby.test.ts
index e40e6f23419b06cea4605d6108fb4e6ddc5c8ec3..14e74ab908149c1191d903c5201ad61331fa4384 100644
--- a/src/services/party-service.lobby.test.ts
+++ b/src/services/party-service.lobby.test.ts
@@ -1,11 +1,10 @@
 import { describe, expect, it } from 'vitest';
-import { sectionsOf, textDisplays, textOf } from '../../test/support/messages.js';
+import { textDisplays, textOf } from '../../test/support/messages.js';
 import { ALICE, BOB } from '../../test/support/parties.js';
 import { createdTrain, reportedRaid } from '../../test/support/party-service.js';
 import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
 import { loadSettings } from '../config/settings.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { NO_MEETING_TIME } from '../render/party-post.js';
 
 /** Parties whose groups hold four trainers, as a Dynamax battle's will (plan 8X-3). */
 const inLobbiesOf4 = { lobbySize: () => 4 };
@@ -18,19 +17,16 @@ describe('PartyService: the lobby of a group in the post', () => {
     });
     await made.service.flush();
     const message = made.gateway.posts.get(made.postId)?.message;
-    expect(textDisplays(message)).toContain(`3/4 coming · 1 interested\n${NO_MEETING_TIME}`);
+    expect(textOf(message)).toContain('3/4 coming · 1 interested\n');
     // Bob does not fit in A: Join opens B for him.
     await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming, {
       number: 2,
     });
     await made.service.flush();
-    const groups = sectionsOf(made.gateway.posts.get(made.postId)?.message).filter((section) =>
-      section.text.startsWith('**Group'),
-    );
-    expect(groups).toEqual([
-      { text: '**Group A** · 3/4 coming · 1 interested', button: 'A' },
-      { text: '**Group B** · 2/4 coming', button: 'B' },
-    ]);
+    const groups = textDisplays(made.gateway.posts.get(made.postId)?.message)
+      .filter((text) => text.startsWith('**Group'))
+      .map((text) => text.split('\n')[0]);
+    expect(groups).toEqual(['**Group A** · 3/4 coming · 1 interested', '**Group B** · 2/4 coming']);
   });
 
   it('counts a train’s lobby in its post where the train has a size', async () => {
@@ -38,8 +34,8 @@ describe('PartyService: the lobby of a group in the post', () => {
     await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
     await made.service.flush();
     const postId = made.party.forumPostId ?? '';
-    expect(textDisplays(made.gateway.posts.get(postId)?.message)).toContain(
-      '1/4 coming · 1 interested',
+    expect(textOf(made.gateway.posts.get(postId)?.message)).toContain(
+      '1/4 coming · 1 interested\n',
     );
   });
 
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index b1d9d0f4457238ee1d248c8c576cd1bb79fcb470..8c218003057f5baf2c6a0d18eed11529ffba83c0 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -95,7 +95,7 @@ describe('PartyService.createMeetup', () => {
     expect(post).toMatchObject({ forumId: WEST_FORUM, title: 'Meetup · Community Day picnic' });
     expect(tagsOf(made)).toEqual(['Meetup']);
     expect(post?.message).toEqual(renderMeetupPost(made.service.timedView(made.current())).message);
-    expect(buttonNames(post?.message)).toEqual(['🤔', '🏃', '✅', 'Leave', '−1', '+1', 'Remote']);
+    expect(buttonNames(post?.message)).toEqual(['🤔', '🏃', '✅', '👋', '⬇️', '⬆️', '📡']);
   });
 
   it('makes a meetup at a place, and shows the place as it is now, also after an import', async () => {
@@ -311,11 +311,9 @@ describe('PartyService: the post of a meetup', () => {
     await made.service.flush();
     const post = made.gateway.posts.get(made.postId);
     expect(post?.edits).toBe(1);
-    expect(partTexts(post?.message).slice(1, 4)).toEqual([
-      `**Interested (1)**\n<@${REPORTER}>`,
-      '**Coming (2)**\n❄️ Alice +1',
-      '**Present (0)**',
-    ]);
+    expect(partTexts(post?.message)[1]).toBe(
+      `3 trainers\n🤔 Interested (1): <@${REPORTER}>\n🏃 Coming (2): ❄️ Alice +1`,
+    );
     // A render that would change nothing is not sent.
     made.service.changed(made.party.id);
     await made.service.flush();
diff --git a/src/services/party-service.test.ts b/src/services/party-service.test.ts
index 34f780bb043620fc213639ab49fe2e1db77dac10..dca2d64c85c805a9794f74d1776193d92e49511f 100644
--- a/src/services/party-service.test.ts
+++ b/src/services/party-service.test.ts
@@ -43,9 +43,7 @@ import { PartyStatus } from '../domain/party/status.js';
 import { HIDDEN_FORUM_REFUSED, type RaidReport } from './party-service.js';
 import { Rehearsal } from './rehearsal.js';
 import {
-  buttonLabels,
   header,
-  partTexts,
   textDisplays,
   textOf,
   thumbnailOf,
@@ -337,7 +335,7 @@ describe('PartyService: keeping posts up to date', () => {
     await service.flush();
     const post = gateway.posts.get(postId);
     expect(post?.edits).toBe(1);
-    expect(textOf(post?.message)).toContain('**Coming (3)**');
+    expect(textOf(post?.message)).toContain('🏃 Coming (3): ');
     // Title and tags did not change, so neither was touched.
     expect(post).toMatchObject({ renames: 0, retags: 0 });
   });
@@ -701,7 +699,7 @@ describe('PartyService.reportRaid: a report never leaves a raid without a post',
     if (outcome.kind !== 'created') throw new Error(outcome.kind);
     await service.flush();
     const message = gateway.posts.get(outcome.party.forumPostId ?? '')?.message;
-    expect(partTexts(message)).toContain(`**Coming (1)**\n<@${ALICE}>`);
+    expect(textOf(message)).toContain(`🏃 Coming (1): <@${ALICE}>`);
   });
 
   it('creates the post without the picture when Discord refuses the embed', async () => {
@@ -784,7 +782,7 @@ describe('PartyService.reportRaid: a report never leaves a raid without a post',
     );
     service.changed(outcome.party.id);
     await service.flush();
-    expect(partTexts(shown())).toContain(`**Coming (1)**\n<@${ALICE}>`);
+    expect(textOf(shown())).toContain(`🏃 Coming (1): <@${ALICE}>`);
     expect(thumbnailsOf(shown())).toEqual([]);
   });
 });
@@ -1421,13 +1419,13 @@ describe('PartyService: rate limits and unchanged posts', () => {
       return renderRaidPost(made.service.view(asRaid(party))).message;
     };
     expect(message()).toEqual(rendered());
-    expect(buttonLabels(message())).not.toContain('A');
-    // A second group changes the controls, and the edit carries them.
+    expect(textOf(message())).not.toContain('**Group B**');
+    // A second group changes the post, and the edit carries it.
     await made.store.update(made.party.id, (p) => createGroup(p, ALICE, limits));
     made.service.changed(made.party.id);
     await made.service.flush();
     expect(message()).toEqual(rendered());
-    expect(buttonLabels(message()).slice(0, 2)).toEqual(['A', 'B']);
+    expect(textOf(message())).toContain('**Group B**');
   });
 
   it('sends nothing for a render right after creation, and nothing for an unchanged party', async () => {
diff --git a/src/services/party-service.train.test.ts b/src/services/party-service.train.test.ts
index 7e3bd366ffa641fd07a96d57ce3b4a417b30b4e7..2fcc953cebc928bd927eab35ba9b7e9eb820f8bb 100644
--- a/src/services/party-service.train.test.ts
+++ b/src/services/party-service.train.test.ts
@@ -164,11 +164,9 @@ describe('PartyService: the post of a train', () => {
     expect(texts.find((text) => text.startsWith('-# Route'))).toBe(
       '-# Route: **1. Veterans Memorial Bridge** · 2. The Stacks',
     );
-    expect(texts.filter((text) => /^\*\*(Interested|Coming|Present)/.test(text))).toEqual([
-      `**Interested (1)**\n<@${REPORTER}>`,
-      '**Coming (0)**',
-      '**Present (1)**\n❄️ Alice',
-    ]);
+    expect(texts.find((text) => text.startsWith('2 trainers'))).toBe(
+      `2 trainers\n🤔 Interested (1): <@${REPORTER}>\n✅ Here (1): ❄️ Alice`,
+    );
   });
 
   it('has no copies in the channels for remote raids and raids at elite raid gyms', async () => {
````

### Task 3: 8X-1B task 3: which group, asked of a newcomer in a dialog

Prototype commit: `234a45cbada220167b04ff88ef0d62b32ce8e790`

In a post of several groups, Interested, Join and Here pressed by a
member who is not signed up open a radio dialog "Which group?": "Any
group with room" first where groups have a size (saying what it picks
now, or that all are full), else the newest group first, the first
picked to start with; each group by its label, its count and meeting
time. The Submit decides as things are then (joinChosen): the chosen
group by letter and stamp, refused when it went or was opened again;
over its size where full; a member who signed up meanwhile keeps their
group and is told so. +1, -1, Remote and the commands still place a
newcomer silently. dialog() takes a choice picked to start with, a menu
for long lists, an optional line of text and no text. The split's
picker puts the presser's own group first.

**Files:**

```
 src/commands/parties/group-dialogs.ts      | 126 ++++++++++++++++++++++++++++++++
 src/commands/trains/split.test.ts          |  36 +++++++++-
 src/commands/trains/split.ts               |  12 +++-
 src/components/party.groups.test.ts        | 192 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/party.train-copy.test.ts    |  39 ++++++++--
 src/components/party.ts                    |  21 +++++-
 src/discord/dialog.test.ts                 |  93 ++++++++++++++++++++++++
 src/discord/dialog.ts                      |  86 +++++++++++++++++++---
 src/domain/party/attendance.choose.test.ts | 111 ++++++++++++++++++++++++++++
 src/domain/party/attendance.ts             |  34 +++++++++
 src/render/group-dialogs.test.ts           | 143 ++++++++++++++++++++++++++++++++++++
 src/render/group-dialogs.ts                | 181 ++++++++++++++++++++++++++++++++++++++++++++++
 src/render/party-controls.ts               |   4 +-
 src/render/text.ts                         |   8 +++
 src/services/attendance-service.ts         |  25 +++++++
 15 files changed, 1087 insertions(+), 24 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/trains/split.test.ts src/components/party.groups.test.ts src/components/party.train-copy.test.ts src/discord/dialog.test.ts src/domain/party/attendance.choose.test.ts src/render/group-dialogs.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 234a45cbada220167b04ff88ef0d62b32ce8e790 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-1B task 3: which group, asked of a newcomer in a dialog`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/group-dialogs.ts b/src/commands/parties/group-dialogs.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2a43678370f8d6ca940d3d3778f7ef07b280ae89
--- /dev/null
+++ b/src/commands/parties/group-dialogs.ts
@@ -0,0 +1,126 @@
+import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import { deferSubmit } from '../../discord/dialog.js';
+import { UserError } from '../../discord/errors.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import type { GroupChoice } from '../../domain/party/attendance.js';
+import { attendeeOf, hasGroups, type Party } from '../../domain/party/party.js';
+import { PartyStatus } from '../../domain/party/status.js';
+import {
+  ANY_GROUP,
+  chosenGroup,
+  GROUP_INPUT,
+  isJoinAction,
+  whichGroupDialog,
+  type JoinAction,
+} from '../../render/group-dialogs.js';
+import { standingReply } from '../../render/activity.js';
+import { GROUP_LABEL } from '../../render/party-controls.js';
+import { actingMember, outcomeWords } from './reply.js';
+
+/*
+ * The dialogs about groups of a post on Discord (plan 8X-1B; design
+ * `2026-10-20-join-group-meet-buttons-design.md`): which group a newcomer joins, for Interested,
+ * Join and Here of a post of several groups (decision 2). The buttons and the dialogs are the
+ * party's controls, with their guards and `ACTION_THROTTLE`: opening counts as a press, and so
+ * does a Submit. Nothing is read from the database before a dialog opens (the party is in
+ * memory), so none waits for `readInTime`.
+ */
+
+/** The status each button gives. */
+const STATUS_OF: Readonly<
+  Record<
+    JoinAction,
+    typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present
+  >
+> = {
+  maybe: PartyStatus.Interested,
+  join: PartyStatus.Coming,
+  here: PartyStatus.Present,
+};
+
+/** The button each dialog came from, as a sentence names it. */
+const BUTTON_WORDS: Readonly<Record<JoinAction, string>> = {
+  maybe: 'Interested',
+  join: 'Join',
+  here: 'Here',
+};
+
+/**
+ * Whether a press of Interested, Join or Here asks which group: only a member who is not
+ * signed up, of a post of several groups (decision 2). Anybody else's press changes their status
+ * in their own group, as before; +1, −1, Remote and the commands never ask (they place a
+ * newcomer as they always did: `chooseGroup` with a lobby size, else the default group).
+ */
+export function asksWhichGroup(party: Party | undefined, memberId: string): party is Party {
+  return (
+    party !== undefined &&
+    hasGroups(party) &&
+    party.groups.length > 1 &&
+    attendeeOf(party, memberId) === undefined
+  );
+}
+
+/** The dialog "which group?" for this press (`whichGroupDialog`), as the party is now. */
+export async function openWhichGroup(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  party: Party,
+  action: JoinAction,
+): Promise<void> {
+  await interaction.showModal(
+    whichGroupDialog(
+      {
+        party,
+        memberId: interaction.user.id,
+        lobbySize: ctx.attendance.lobbyOf(party),
+        zone: ctx.config.settings.timezone,
+        now: Date.now(),
+      },
+      action,
+    ),
+  );
+}
+
+/** The choice a Submit picked; undefined for a dialog of another shape or a forged one. */
+function pickedChoice(interaction: ModalSubmitInteraction): GroupChoice | undefined {
+  if (!interaction.fields.fields.has(GROUP_INPUT)) return undefined;
+  const value = interaction.fields.getRadioGroup(GROUP_INPUT) ?? '';
+  return value === ANY_GROUP ? { any: true } : chosenGroup(value);
+}
+
+/**
+ * Submit of "which group?" (`party:<id>:joinform:<action>`): acknowledged privately, then the
+ * member is signed up as things are now (`AttendanceService.joinChosen`) and told how they stand;
+ * a group that went or was opened again under its letter is `Group B has changed since: press
+ * Join again.`, a member who signed up meanwhile hears they stay in their own group, a party
+ * that ended that it is over.
+ */
+export async function submitWhichGroup(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  partyId: string,
+  args: readonly string[],
+): Promise<void> {
+  const [action] = args;
+  const choice = pickedChoice(interaction);
+  if (!isJoinAction(action) || choice === undefined) throw new UserError(STALE_COMPONENT);
+  await deferSubmit(interaction);
+  const party = ctx.parties.get(partyId);
+  const outcome = await ctx.attendance.joinChosen(
+    partyId,
+    actingMember(interaction),
+    STATUS_OF[action],
+    choice,
+  );
+  const text =
+    outcome.kind === 'refused' && outcome.reason === 'group-changed' && 'group' in choice
+      ? `Group ${choice.group} has changed since: press ${BUTTON_WORDS[action]} again.`
+      : outcomeWords(ctx.attendance.limits(), party, outcome, (ok) =>
+          ok.stayed === undefined || ok.attendee === undefined
+            ? undefined
+            : `${standingReply(ok.party, ok.attendee)} You were signed up already, so you stay ` +
+              `in your group: ${GROUP_LABEL} moves you.`,
+        ).text;
+  await interaction.editReply({ content: text });
+}
diff --git a/src/commands/trains/split.test.ts b/src/commands/trains/split.test.ts
index 5878fb9ad200600f2fac01cad01dc727a0a2c80a..198bdc09ef66c6305e84e9f0466123d5c3b41f4e 100644
--- a/src/commands/trains/split.test.ts
+++ b/src/commands/trains/split.test.ts
@@ -1,4 +1,4 @@
-import { dialogOf } from '../../../test/support/dialogs.js';
+import { dialogChoices, dialogOf, shownDialog } from '../../../test/support/dialogs.js';
 import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
@@ -227,7 +227,39 @@ describe('the button "Split group…" of a train post', () => {
       userId: CAROL,
       displayName: 'Carol',
     });
-    expect(dialogOf(forConductor)).toEqual(made.drawn(['A', 'B'], CAROL));
+    // The presser's own group last: they are more likely to split off another.
+    expect(dialogOf(forConductor)).toEqual(made.drawn(['B', 'A'], CAROL));
+  });
+
+  it("offers first the group with the most members but the presser's own, which comes last", async () => {
+    // Plan 8X-1B: Android picks a radio group's first choice by itself; none is marked, the
+    // group that leaves is picked on purpose. Ties go by letter.
+    const made = await setup();
+    const id = made.party.id;
+    const ERIN = '200000000000000006';
+    await made.attendance.newGroup(id, { id: ERIN, name: 'Erin' });
+    for (const member of ['200000000000000007', '200000000000000008']) {
+      await made.attendance.joinGroup(id, { id: member }, 'C');
+    }
+    const order = async (who: object) => {
+      const pressed = await made.click(`party:${id}:split`, who);
+      return dialogChoices(shownDialog(pressed)).map(({ value, picked }) => [
+        value.split(':')[0],
+        picked,
+      ]);
+    };
+    // Staff, in no group: C (3), then A and B (2 each) by letter.
+    expect(await order(STAFF)).toEqual([
+      ['C', false],
+      ['A', false],
+      ['B', false],
+    ]);
+    await made.trains.setConductor(id, { id: CAROL, name: 'Carol' });
+    expect(await order({ userId: CAROL, displayName: 'Carol' })).toEqual([
+      ['C', false],
+      ['B', false],
+      ['A', false],
+    ]);
   });
 
   it('tells a member who may split no group why, and opens no dialog', async () => {
diff --git a/src/commands/trains/split.ts b/src/commands/trains/split.ts
index 39f700d382e08ef5fa383a231d78dfdf3b84ba9f..c980bf2117f153f52406c96846abe271b12f2058 100644
--- a/src/commands/trains/split.ts
+++ b/src/commands/trains/split.ts
@@ -14,6 +14,7 @@ import {
   attendeeOf,
   isGroupId,
   isTrain,
+  membersWhere,
   type GroupId,
   type TrainParty,
 } from '../../domain/party/party.js';
@@ -108,7 +109,16 @@ export async function openSplit(
   if (!party) throw new UserError(partyOver(A_TRAIN));
   if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
   const staff = isStaff(interaction, ctx);
-  const [first, ...rest] = splittableGroups(party, interaction.user.id, staff);
+  const groups = splittableGroups(party, interaction.user.id, staff);
+  // Plan 8X-1B: Android picks a radio group's first choice by itself, so the first is the most
+  // likely one: the group with the most members but the presser's own (ties by letter), which
+  // comes last (they more likely split another off). None is marked: it is picked on purpose.
+  const own = attendeeOf(party, interaction.user.id)?.group;
+  const size = (group: GroupId) =>
+    membersWhere(party, (attendee) => attendee.group === group).length;
+  const [first, ...rest] = [...groups].sort(
+    (a, b) => Number(a === own) - Number(b === own) || size(b) - size(a) || a.localeCompare(b),
+  );
   if (first === undefined) throw new UserError(whyNot(ctx, party, interaction.user.id, staff));
   await interaction.showModal(
     await dialogFor(interaction, ctx, party, interaction.user.id, staff, [first, ...rest]),
diff --git a/src/components/party.groups.test.ts b/src/components/party.groups.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d3376144d90ae468a4ac7a8c26ab14d90a1da941
--- /dev/null
+++ b/src/components/party.groups.test.ts
@@ -0,0 +1,192 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { dialogChoices, dialogOf, shownDialog } from '../../test/support/dialogs.js';
+import {
+  fakeButton,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../test/support/fake-interactions.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import type { APIModalInteractionResponseCallbackData } from 'discord.js';
+import { InteractionRouter } from '../discord/router.js';
+import { attendeeOf } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { ANY_GROUP, GROUP_INPUT, groupChoice } from '../render/group-dialogs.js';
+import { partyButtons } from './party.js';
+
+const DAVE = '200000000000000005';
+
+/**
+ * A raid reported through the service, with the party controls routed; `grouped` gives it a
+ * second group, B, that Bob opened (the reporter stays in A).
+ */
+async function setup(options: { grouped?: boolean; lobbySize?: number } = {}) {
+  const made = await reportedRaid(
+    {},
+    options.lobbySize === undefined ? {} : { lobbySize: () => options.lobbySize },
+  );
+  if (options.grouped !== false) {
+    await made.attendance.newGroup(made.party.id, { id: BOB, name: 'Bob' });
+  }
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    parties: made.store,
+    regions: made.regions,
+  });
+  const router = new InteractionRouter(ctx, [], [partyButtons]);
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  /** A press of a button of the post, by Alice unless said otherwise. */
+  const click = (action: string, userId = ALICE) =>
+    handle(
+      fakeButton({
+        customId: `party:${made.party.id}:${action}`,
+        channelId: made.postId,
+        userId,
+        displayName: userId === ALICE ? 'Alice' : 'Somebody',
+      }),
+    );
+  /** The Submit of a dialog with this choice picked, by Alice unless said otherwise. */
+  const submit = (
+    dialog: APIModalInteractionResponseCallbackData,
+    picked: string,
+    userId = ALICE,
+  ) =>
+    handle(
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        picked: { [GROUP_INPUT]: picked },
+        channelId: made.postId,
+        userId,
+        displayName: userId === ALICE ? 'Alice' : 'Somebody',
+      }),
+    );
+  const group = (id: 'A' | 'B') => {
+    const found = made.current().groups.find((one) => one.id === id);
+    if (!found) throw new Error(`no group ${id}`);
+    return groupChoice(made.current(), found);
+  };
+  return { ...made, click, submit, group };
+}
+
+/** What a Submit answered, privately. */
+const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
+
+describe('Interested, Join and Here of a post of several groups (plan 8X-1B)', () => {
+  it('ask a newcomer which group in a dialog, the newest group first and picked', async () => {
+    const made = await setup();
+    for (const action of ['maybe', 'join', 'here']) {
+      const pressed = await made.click(action);
+      const dialog = shownDialog(pressed);
+      expect(dialogChoices(dialog).map(({ value, picked }) => [value, picked])).toEqual([
+        [made.group('B'), true],
+        [made.group('A'), false],
+      ]);
+      // Nothing is signed up by the press itself.
+      expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
+    }
+  });
+
+  it('signs the newcomer up at Submit in the group they chose, with the status of the button', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.click('here'));
+    const submitted = await made.submit(dialog, made.group('A'));
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(answerOf(submitted)).toBe('You are here, in group A.');
+    expect(attendeeOf(made.current(), ALICE)).toMatchObject({
+      status: PartyStatus.Present,
+      group: 'A',
+      name: 'Alice',
+    });
+    await made.attendance.flush();
+    expect(made.said().at(-1)).toBe(`**Alice** (<@${ALICE}>) is here, in group A.`);
+  });
+
+  it('change only the status of a member signed up already, without asking', async () => {
+    const made = await setup();
+    const pressed = await made.click('join', BOB);
+    expect(dialogOf(pressed)).toBeUndefined();
+    expect(sent(pressed.reply).content).toBe('You are coming, in group B.');
+    // Done and Leave never ask.
+    expect(dialogOf(await made.click('done'))).toBeUndefined();
+    expect(dialogOf(await made.click('leave'))).toBeUndefined();
+  });
+
+  it('leave +1 and Remote to place a newcomer silently, as before', async () => {
+    const made = await setup();
+    const more = await made.click('more');
+    expect(dialogOf(more)).toBeUndefined();
+    expect(sent(more.reply).content).toBe('You are interested, in group B.');
+    const remote = await made.click('remote', DAVE);
+    expect(dialogOf(remote)).toBeUndefined();
+    expect(attendeeOf(made.current(), DAVE)).toMatchObject({ group: 'B', remote: true });
+  });
+
+  it('never ask in a post of one group', async () => {
+    const made = await setup({ grouped: false });
+    const pressed = await made.click('join');
+    expect(dialogOf(pressed)).toBeUndefined();
+    expect(sent(pressed.reply).content).toBe('You are coming.');
+  });
+
+  it('take the member who signed up meanwhile as they are, saying they stayed in their group', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.click('join'));
+    await made.attendance.signUp(
+      made.party.id,
+      { id: ALICE, name: 'Alice' },
+      PartyStatus.Interested,
+    );
+    const submitted = await made.submit(dialog, made.group('A'));
+    expect(answerOf(submitted)).toBe(
+      'You are coming, in group B. You were signed up already, so you stay in your group: ' +
+        'Group… moves you.',
+    );
+    expect(attendeeOf(made.current(), ALICE)).toMatchObject({ group: 'B' });
+  });
+
+  it('refuses a group that went meanwhile, and one opened again under its letter', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.click('join'));
+    const b = made.group('B');
+    // Bob leaves: B goes; Dave opens a new B.
+    await made.attendance.leave(made.party.id, { id: BOB });
+    made.clock.now += 60_000;
+    const gone = await made.submit(dialog, b);
+    expect(answerOf(gone)).toBe('Group B has changed since: press Join again.');
+    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
+    await made.attendance.newGroup(made.party.id, { id: DAVE });
+    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B']);
+    const again = await made.submit(dialog, b);
+    expect(answerOf(again)).toBe('Group B has changed since: press Join again.');
+    expect(attendeeOf(made.current(), ALICE)).toBeUndefined();
+  });
+
+  it('offers any group with room first where groups have a size, and chooses at the Submit', async () => {
+    const made = await setup({ lobbySize: 2 });
+    const dialog = shownDialog(await made.click('join'));
+    expect(dialogChoices(dialog)[0]).toMatchObject({ value: ANY_GROUP, picked: true });
+    // B fills meanwhile: any group with room is A then (the reporter is only interested).
+    await made.attendance.signUp(made.party.id, { id: DAVE }, PartyStatus.Coming, { group: 'B' });
+    const submitted = await made.submit(dialog, ANY_GROUP);
+    expect(answerOf(submitted)).toBe('You are coming, in group A.');
+    expect(attendeeOf(made.current(), ALICE)?.group).toBe('A');
+  });
+
+  it('answers a Submit for a raid that ended as over', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.click('join'));
+    const a = made.group('A');
+    await made.service.end(made.party.id);
+    const submitted = await made.submit(dialog, a);
+    // A control names its party by id alone: once it has ended, its kind is not known.
+    expect(answerOf(submitted)).toBe('This has ended.');
+  });
+});
diff --git a/src/components/party.train-copy.test.ts b/src/components/party.train-copy.test.ts
index 5a3a3189e491f132c82fc0ea183b74df78bfb5e8..60dd5dba75e6d6e37cd4410185c4ef2c3fa8bf96 100644
--- a/src/components/party.train-copy.test.ts
+++ b/src/components/party.train-copy.test.ts
@@ -1,7 +1,13 @@
 import { customIdsOf } from '../../test/support/messages.js';
 import { MessageFlags } from 'discord.js';
 import { describe, expect, it } from 'vitest';
-import { fakeButton, sent, type FakeInteraction } from '../../test/support/fake-interactions.js';
+import { dialogChoices, dialogOf } from '../../test/support/dialogs.js';
+import {
+  fakeButton,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../test/support/fake-interactions.js';
 import { EAST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import { ALICE, BOB, CAROL } from '../../test/support/parties.js';
 import { createdTrain } from '../../test/support/party-service.js';
@@ -10,6 +16,7 @@ import { decodeCustomId } from '../discord/custom-id.js';
 import { InteractionRouter } from '../discord/router.js';
 import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
+import { GROUP_INPUT } from '../render/group-dialogs.js';
 import { partyButtons } from './party.js';
 
 const DAVE = '200000000000000005';
@@ -54,7 +61,27 @@ async function setup() {
     await router.handle(interaction as never);
     return interaction;
   };
-  return { ...made, press, ids };
+  /**
+   * A press, and where it asks which group (a newcomer's Interested, Join or Here, plan 8X-1B),
+   * the Submit of the choice picked to start with: what the member was told either way.
+   */
+  const pressAndPick = async (action: string, userId = ALICE): Promise<string | undefined> => {
+    const pressed = await press(action, userId);
+    const dialog = dialogOf(pressed);
+    if (!dialog) return sent(pressed.reply).content;
+    const first = dialogChoices(dialog).find((choice) => choice.picked);
+    const submitted = fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      picked: { [GROUP_INPUT]: first?.value ?? '' },
+      channelId: EAST_CHANNEL,
+      userId,
+      displayName: userId === ALICE ? 'Alice' : 'Somebody',
+    });
+    await router.handle(submitted as never);
+    return sent(submitted.editReply).content;
+  };
+  return { ...made, press, pressAndPick, ids };
 }
 
 const privately = (content: string) => ({ content, flags: MessageFlags.Ephemeral });
@@ -63,9 +90,8 @@ describe('the buttons of the copy of a train in another region', () => {
   it('sign a member up who cannot see the forum of the train, and let them into it', async () => {
     const made = await setup();
     made.gateway.shutOut(WEST_FORUM, ALICE);
-    // Join puts a newcomer in B, where newcomers go.
-    const joined = await made.press('join');
-    expect(joined.reply).toHaveBeenCalledWith(privately('You are coming, in group B.'));
+    // Join asks a newcomer which group, B (the newest) picked to start with.
+    expect(await made.pressAndPick('join')).toBe('You are coming, in group B.');
     expect(attendeeOf(made.current(), ALICE)).toMatchObject({
       status: PartyStatus.Coming,
       name: 'Alice',
@@ -88,8 +114,7 @@ describe('the buttons of the copy of a train in another region', () => {
     made.gateway.shutOut(WEST_FORUM, ...members);
     const answers: (string | undefined)[] = [];
     for (const [index, action] of ['maybe', 'here', 'more', 'remote', 'join'].entries()) {
-      const pressed = await made.press(action, members[index]);
-      answers.push(sent(pressed.reply).content);
+      answers.push(await made.pressAndPick(action, members[index]));
     }
     expect(answers).toEqual([
       'You are interested, in group B.',
diff --git a/src/components/party.ts b/src/components/party.ts
index 62996e2deef19d3888cf968fed0bc6b1b264d1e0..1905371d1831e84d29081756768bb48f16bd10da 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -28,6 +28,12 @@ import { isGroupId, isRaid } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
 import { SPLIT_FORM } from '../render/train-split.js';
+import { WHICH_GROUP_FORM } from '../render/group-dialogs.js';
+import {
+  asksWhichGroup,
+  openWhichGroup,
+  submitWhichGroup,
+} from '../commands/parties/group-dialogs.js';
 
 /**
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
@@ -61,7 +67,14 @@ export const partyButtons: ComponentHandler = {
     switch (id.action) {
       case 'maybe':
       case 'join':
-      case 'here':
+      case 'here': {
+        // A newcomer to a post of several groups is asked which group (plan 8X-1B).
+        const party = ctx.parties.get(partyId);
+        if (asksWhichGroup(party, member.id)) {
+          return openWhichGroup(interaction, ctx, party, id.action);
+        }
+        return pressStatus(attendance, partyId, member, { action: id.action }, click);
+      }
       case 'done':
       case 'leave':
         return pressStatus(attendance, partyId, member, { action: id.action }, click);
@@ -139,7 +152,8 @@ export const partyButtons: ComponentHandler = {
         // "Split group…" of a train's post: the dialog of the split (plans 8T, 8T-H).
         return openSplit(interaction, ctx, partyId);
       case 'splitform':
-        // Only that dialog has this action.
+      case 'joinform':
+        // Only those dialogs have these actions.
         throw new UserError(STALE_COMPONENT);
       case 'regroup':
       case 'meet':
@@ -172,6 +186,9 @@ export const partyButtons: ComponentHandler = {
   async modal(interaction, id, ctx) {
     if (id.action === 'delete') return submitPartyReport(interaction, ctx, id.id);
     if (id.action === SPLIT_FORM) return submitSplit(interaction, ctx, id.id, id.args);
+    if (id.action === WHICH_GROUP_FORM) {
+      return submitWhichGroup(interaction, ctx, id.id, id.args);
+    }
     const [parameter] = id.args;
     if (id.action !== 'time' || (parameter !== 'hatch' && parameter !== 'end')) {
       throw new UserError(STALE_COMPONENT);
diff --git a/src/discord/dialog.test.ts b/src/discord/dialog.test.ts
index f2466452c60c7aa58ef097b0bcdb15c61dc2860e..e815a2951e36998c315a939c72cc35abc50b6f3e 100644
--- a/src/discord/dialog.test.ts
+++ b/src/discord/dialog.test.ts
@@ -50,6 +50,99 @@ describe('dialog', () => {
     ]);
   });
 
+  it('marks the choice that starts picked, which goes first in its list (plan 8X-1B)', () => {
+    const shown = dialog({
+      customId: 'x:1:go',
+      title: 'Join this raid',
+      choice: {
+        id: 'group',
+        label: 'Which group?',
+        options: [
+          { value: 'B', label: 'Group B' },
+          { value: 'A', label: 'Group A' },
+        ],
+        picked: 'B',
+      },
+    });
+    checkModal(shown);
+    // A dialog may be its choice alone: Discord adds a box of its own at the top.
+    expect(dialogTexts(shown)).toEqual([]);
+    expect(dialogChoices(shown).map(({ value, picked }) => [value, picked])).toEqual([
+      ['B', true],
+      ['A', false],
+    ]);
+    // A choice it does not have picks nothing.
+    const none = dialog({
+      customId: 'x:1:go',
+      title: 'Join this raid',
+      choice: {
+        id: 'group',
+        label: 'Which group?',
+        options: [
+          { value: 'B', label: 'Group B' },
+          { value: 'A', label: 'Group A' },
+        ],
+        picked: 'C',
+      },
+    });
+    expect(dialogChoices(none).some(({ picked }) => picked)).toBe(false);
+  });
+
+  it('asks a long choice in a menu, its default chosen to start with, and takes a line of text', () => {
+    const shown = dialog({
+      customId: 'x:1:go',
+      title: 'Meeting time',
+      text: 'For your group: everybody in it is told.',
+      choice: {
+        id: 'time',
+        label: 'When does your group meet?',
+        menu: true,
+        options: Array.from({ length: 12 }, (_, n) => ({ value: `t${n}`, label: `7:${n}5` })),
+        picked: 't3',
+      },
+      field: { id: 'label', label: 'Label for a new group (optional)', maxLength: 100 },
+    });
+    checkModal(shown);
+    const menu = shown.components.find(
+      (one) =>
+        one.type === ComponentType.Label && one.component.type === ComponentType.StringSelect,
+    );
+    expect(menu).toMatchObject({
+      label: 'When does your group meet?',
+      component: { custom_id: 'time', required: true, min_values: 1, max_values: 1 },
+    });
+    const field = shown.components.find(
+      (one) => one.type === ComponentType.Label && one.component.type === ComponentType.TextInput,
+    );
+    expect(field).toMatchObject({
+      label: 'Label for a new group (optional)',
+      component: { custom_id: 'label', required: false, max_length: 100 },
+    });
+  });
+
+  it('is refused by the fake as Discord would refuse two choices picked to start with', () => {
+    const shown = dialog({
+      customId: 'x:1:go',
+      title: 'Join this raid',
+      choice: {
+        id: 'group',
+        label: 'Which group?',
+        options: [
+          { value: 'B', label: 'Group B' },
+          { value: 'A', label: 'Group A' },
+        ],
+        picked: 'B',
+      },
+    });
+    const twice = structuredClone(shown);
+    const label = twice.components.find((one) => one.type === ComponentType.Label);
+    if (label?.type !== ComponentType.Label || label.component.type !== ComponentType.RadioGroup) {
+      throw new Error('no radio group');
+    }
+    for (const option of label.component.options) option.default = true;
+    expect(() => checkModal(twice)).toThrow(/2 options ticked by default, at most 1/);
+  });
+
   it('cuts a title and a text to what Discord takes', () => {
     const shown = dialog({ customId: 'x:1:go', title: 'T'.repeat(60), text: 'w'.repeat(5_000) });
     checkModal(shown);
diff --git a/src/discord/dialog.ts b/src/discord/dialog.ts
index 07a1e7ea007d1541fb7c4b03ee8073db6c373c20..9fa2565fa6d34f81f69bafb2033bdc2a09cf4805 100644
--- a/src/discord/dialog.ts
+++ b/src/discord/dialog.ts
@@ -1,5 +1,6 @@
 import {
   ComponentType,
+  TextInputStyle,
   MessageFlags,
   type APIModalInteractionResponseCallbackData,
   type ModalSubmitInteraction,
@@ -36,40 +37,103 @@ export interface DialogOption {
   description?: string;
 }
 
+/** A choice of a dialog: a required radio group, or a menu where it has more than ten. */
+export interface DialogChoice {
+  id: string;
+  label: string;
+  options: readonly DialogOption[];
+  /**
+   * The value of the choice picked to start with (plan 8X-1B: Discord's `default`), undefined
+   * for none. It goes first in `options` too, where the order allows (Android picks the first of
+   * a radio group by itself, whatever is marked; iPhone picks only what is marked). A value
+   * that is none of the options picks nothing.
+   */
+  picked?: string;
+  /**
+   * A string select (a dropdown) in the place of the radio group, for a list of more than ten
+   * (Discord's most in a radio group): up to 25 options, one to be chosen, read at Submit with
+   * `fields.getStringSelectValues(id)`.
+   */
+  menu?: true;
+}
+
+/** A line of text a dialog asks for besides its choice, which may be left empty. */
+export interface DialogField {
+  id: string;
+  label: string;
+  maxLength: number;
+}
+
 /** What a dialog asks: its custom id, title, text, and a choice between ways when it has one. */
 export interface DialogContent {
   customId: string;
   /** The act (`Remove a region`), cut to Discord's 45 characters. */
   title: string;
-  /** The question, as Markdown (a dialog's text displays show it). */
-  text: string;
+  /**
+   * The question, as Markdown (a dialog's text displays show it); none for a dialog that is its
+   * choice alone (Discord adds a box of its own at the top of every dialog: keep it short).
+   */
+  text?: string;
   /**
    * A choice between ways (archive or delete a post): a required radio group with nothing
-   * picked, so that Submit never does the harsher one by default; `id` is read at Submit with
-   * `fields.getRadioGroup(id, true)`.
+   * picked unless `picked` says, so that Submit never does the harsher one by default; `id` is
+   * read at Submit with `fields.getRadioGroup(id, true)`.
    */
-  choice?: { id: string; label: string; options: readonly DialogOption[] };
+  choice?: DialogChoice;
+  /** A line of text under the choice, optional (`fields.getTextInputValue(id)`, '' when empty). */
+  field?: DialogField;
+}
+
+/** The options of a choice, the one picked to start with marked as Discord's `default`. */
+function choiceOptions(choice: DialogChoice): (DialogOption & { default?: true })[] {
+  return choice.options.map((option) =>
+    option.value === choice.picked ? { ...option, default: true } : { ...option },
+  );
 }
 
 /** The dialog, as `showModal` takes it. */
 export function dialog(content: DialogContent): APIModalInteractionResponseCallbackData {
-  const { choice } = content;
+  const { choice, field, text } = content;
   return {
     custom_id: content.customId,
     title: truncate(content.title, TITLE_ROOM),
     components: [
-      textDisplay(truncate(content.text, TEXT_ROOM)),
+      ...(text === undefined ? [] : [textDisplay(truncate(text, TEXT_ROOM))]),
       ...(choice === undefined
         ? []
         : [
             {
               type: ComponentType.Label as const,
               label: choice.label,
+              component: choice.menu
+                ? {
+                    type: ComponentType.StringSelect as const,
+                    custom_id: choice.id,
+                    required: true,
+                    min_values: 1,
+                    max_values: 1,
+                    options: choiceOptions(choice),
+                  }
+                : {
+                    type: ComponentType.RadioGroup as const,
+                    custom_id: choice.id,
+                    required: true,
+                    options: choiceOptions(choice),
+                  },
+            },
+          ]),
+      ...(field === undefined
+        ? []
+        : [
+            {
+              type: ComponentType.Label as const,
+              label: field.label,
               component: {
-                type: ComponentType.RadioGroup as const,
-                custom_id: choice.id,
-                required: true,
-                options: choice.options.map((option) => ({ ...option })),
+                type: ComponentType.TextInput as const,
+                custom_id: field.id,
+                style: TextInputStyle.Short,
+                required: false,
+                max_length: field.maxLength,
               },
             },
           ]),
diff --git a/src/domain/party/attendance.choose.test.ts b/src/domain/party/attendance.choose.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..af7bb2e80d1a7a4f8243216ed67ddc3a800c6d1e
--- /dev/null
+++ b/src/domain/party/attendance.choose.test.ts
@@ -0,0 +1,111 @@
+import { describe, expect, it } from 'vitest';
+import {
+  ALICE,
+  BOB,
+  PARTY_NOW,
+  REPORTER,
+  testRaid,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import { attendanceLimits, joinChosen } from './attendance.js';
+import { groupStamp, type RaidParty } from './party.js';
+import { PartyStatus } from './status.js';
+
+const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
+const B_OPENED = PARTY_NOW + 60_000;
+
+/** A raid of two groups: the reporter in A, Bob in B (the default one). */
+const two = (): RaidParty =>
+  withAttendees(
+    {
+      ...testRaid(),
+      groups: [{ id: 'A' }, { id: 'B', opened: B_OPENED }],
+      defaultGroupId: 'B',
+    },
+    { [BOB]: { group: 'B', number: 2 } },
+  );
+const stampOf = (party: RaidParty, id: 'A' | 'B') => {
+  const group = party.groups.find((one) => one.id === id);
+  return group ? groupStamp(party, group) : '';
+};
+
+describe('joinChosen: the answer to "which group?" as things are at the Submit', () => {
+  it('signs a newcomer up in the group they chose, with the status of the button', () => {
+    const party = two();
+    const change = joinChosen(
+      party,
+      ALICE,
+      PartyStatus.Interested,
+      { group: 'A', stamp: stampOf(party, 'A') },
+      limits,
+    );
+    expect(change).toMatchObject({ ok: true, joined: true });
+    expect(change.ok && change.party.attendees[ALICE]).toMatchObject({
+      status: PartyStatus.Interested,
+      group: 'A',
+    });
+    expect(change.ok && 'stayed' in change).toBe(false);
+  });
+
+  it('refuses a group that went or whose letter another group has now', () => {
+    const party = two();
+    expect(
+      joinChosen(party, ALICE, PartyStatus.Coming, { group: 'B', stamp: 'x' }, limits),
+    ).toEqual({ ok: false, reason: 'group-changed' });
+    expect(
+      joinChosen(
+        party,
+        ALICE,
+        PartyStatus.Coming,
+        { group: 'C', stamp: stampOf(party, 'B') },
+        limits,
+      ),
+    ).toEqual({ ok: false, reason: 'group-changed' });
+  });
+
+  it('changes only the status of a member who signed up meanwhile, in their own group', () => {
+    const party = withAttendees(two(), { [ALICE]: { group: 'B', status: PartyStatus.Interested } });
+    const change = joinChosen(
+      party,
+      ALICE,
+      PartyStatus.Coming,
+      { group: 'A', stamp: stampOf(party, 'A') },
+      limits,
+    );
+    expect(change).toMatchObject({ ok: true, joined: false, stayed: 'B' });
+    expect(change.ok && change.party.attendees[ALICE]).toMatchObject({
+      status: PartyStatus.Coming,
+      group: 'B',
+    });
+    // Their own group chosen, or any: nothing to say of it.
+    const own = joinChosen(
+      party,
+      ALICE,
+      PartyStatus.Coming,
+      { group: 'B', stamp: stampOf(party, 'B') },
+      limits,
+    );
+    expect(own.ok && 'stayed' in own).toBe(false);
+    expect(joinChosen(party, ALICE, PartyStatus.Coming, { any: true }, limits).ok).toBe(true);
+  });
+
+  it('joins a full group anyway, as a named group does, and places "any" by the lobby size', () => {
+    const party = withAttendees(two(), { [REPORTER]: { group: 'A', number: 4 } });
+    const sized = { ...limits, lobbySize: 4, now: PARTY_NOW + 120_000 };
+    const full = joinChosen(
+      party,
+      ALICE,
+      PartyStatus.Coming,
+      { group: 'A', stamp: stampOf(party, 'A') },
+      sized,
+    );
+    expect(full.ok && full.party.attendees[ALICE]?.group).toBe('A');
+    const any = joinChosen(party, ALICE, PartyStatus.Coming, { any: true }, sized);
+    expect(any.ok && any.party.attendees[ALICE]?.group).toBe('B');
+    // Without a size "any" is the default group.
+    expect(joinChosen(party, ALICE, PartyStatus.Coming, { any: true }, limits)).toMatchObject({
+      ok: true,
+      party: { attendees: { [ALICE]: { group: 'B' } } },
+    });
+  });
+});
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index 20ccbf58c40cb00543a9e0eb978191d3702aafac..d7a089241fe13552ff34fe970d16e42557203581 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -12,6 +12,7 @@ import {
   membersWhere,
   refused,
   remoteAllowed,
+  stampedGroup,
   type Attendee,
   type Change,
   type CompletionQuestion,
@@ -620,6 +621,39 @@ export function joinInto<P extends Party>(
   return setAttendance(party, memberId, PartyStatus.Coming, { group: groupId }, limits);
 }
 
+/** What a member chose in the dialog "which group?": any group with room, or one by its stamp. */
+export type GroupChoice = { any: true } | { group: GroupId; stamp: string };
+
+/**
+ * The answer to "which group?" (plan 8X-1B, decision 2), decided as things are at the Submit: a
+ * member who is not signed up is signed up with the status of the button they pressed
+ * (Interested, Join, Here) in the group they chose, also over its size where groups have one (a
+ * group named, as in 8X-1), or, for "any group with room", where `setAttendance` places a
+ * newcomer (`chooseGroup` with a lobby size, else the default group). A group that went or whose
+ * letter a group opened since has (`stampedGroup`) is refused `group-changed`. A member who
+ * signed up meanwhile only gets that status in their own group, as the button gives it; `stayed`
+ * names that group when they had chosen another.
+ */
+export function joinChosen<P extends Party>(
+  party: P,
+  memberId: string,
+  status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
+  choice: GroupChoice,
+  limits: AttendanceLimits,
+): Change<P, { joined: boolean; stayed?: GroupId }> {
+  if (attendeeOf(party, memberId)) {
+    const changed = setAttendance(party, memberId, status, {}, limits);
+    if (!changed.ok) return changed;
+    const own = changed.party.attendees[memberId]?.group;
+    return 'group' in choice && own !== undefined && own !== choice.group
+      ? { ...changed, stayed: own }
+      : changed;
+  }
+  if ('any' in choice) return setAttendance(party, memberId, status, {}, limits);
+  if (!stampedGroup(party, choice.group, choice.stamp)) return refused('group-changed');
+  return setAttendance(party, memberId, status, { group: choice.group }, limits);
+}
+
 /**
  * The letter of the next group: one that no group has and that no group split off a train went
  * by (plan 8T, `train.splitOff`), the first after the last letter in use, else the first such;
diff --git a/src/render/group-dialogs.test.ts b/src/render/group-dialogs.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b835b3778a0b7246789ba0f866ca90c61cf89b3b
--- /dev/null
+++ b/src/render/group-dialogs.test.ts
@@ -0,0 +1,143 @@
+import { describe, expect, it } from 'vitest';
+import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
+import { checkModal } from '../../test/support/fake-interactions.js';
+import {
+  ALICE,
+  at,
+  BOB,
+  CAROL,
+  PARTY_NOW,
+  PARTY_ZONE,
+  REPORTER,
+  testRaid,
+  testTrain,
+  withAttendees,
+} from '../../test/support/parties.js';
+import { decodeCustomId } from '../discord/custom-id.js';
+import type { RaidParty } from '../domain/party/party.js';
+import { ANY_GROUP, groupChoice, whichGroupDialog } from './group-dialogs.js';
+
+const DAVE = '200000000000000005';
+const MEET = at('2026-10-13T14:45');
+
+/** A raid of two groups: A with the reporter, a meeting time, B (newer) with a label. */
+const two = (): RaidParty =>
+  withAttendees(
+    {
+      ...testRaid(),
+      groups: [
+        { id: 'A', startTime: MEET },
+        { id: 'B', label: 'by the bridge', opened: PARTY_NOW + 60_000 },
+      ],
+      defaultGroupId: 'B',
+    },
+    { [BOB]: { group: 'B', number: 2 } },
+  );
+
+const shown = (party = two(), lobbySize?: number, action: 'maybe' | 'join' | 'here' = 'join') =>
+  whichGroupDialog({ party, memberId: ALICE, lobbySize, zone: PARTY_ZONE, now: PARTY_NOW }, action);
+
+describe('whichGroupDialog', () => {
+  it('asks a newcomer which group, the newest first and picked to start with', () => {
+    const dialog = shown();
+    checkModal(dialog);
+    expect(dialog.title).toBe('Join this raid');
+    expect(decodeCustomId(dialog.custom_id)).toEqual({
+      kind: 'party',
+      id: two().id,
+      action: 'joinform',
+      args: ['join'],
+    });
+    // Kept short: Discord adds its own box to every dialog.
+    expect(dialogTexts(dialog)).toEqual([]);
+    expect(dialogChoices(dialog)).toEqual([
+      {
+        value: groupChoice(two(), { id: 'B', opened: PARTY_NOW + 60_000 }),
+        label: 'Group B: by the bridge',
+        description: '2 trainers · no meeting time yet',
+        picked: true,
+      },
+      {
+        value: `A:${PARTY_NOW.toString(36)}`,
+        label: 'Group A',
+        description: '1 trainer · meeting at 2:45 PM',
+        picked: false,
+      },
+    ]);
+  });
+
+  it('is titled by the button that was pressed', () => {
+    expect(shown(two(), undefined, 'maybe').title).toBe('Interested in this raid');
+    expect(shown(two(), undefined, 'here').title).toBe('Here for this raid');
+    const train = { ...testTrain(), groups: [{ id: 'A' as const }, { id: 'B' as const }] };
+    expect(
+      whichGroupDialog(
+        { party: train, memberId: ALICE, lobbySize: undefined, zone: PARTY_ZONE, now: PARTY_NOW },
+        'join',
+      ).title,
+    ).toBe('Join this train');
+  });
+
+  it('says nothing of meeting times on a train, and that a group is empty', () => {
+    const made = testTrain();
+    const train = {
+      ...made,
+      groups: [{ id: 'A' as const }, { id: 'B' as const, opened: PARTY_NOW + 1 }],
+    };
+    const dialog = whichGroupDialog(
+      { party: train, memberId: ALICE, lobbySize: undefined, zone: PARTY_ZONE, now: PARTY_NOW },
+      'join',
+    );
+    expect(dialogChoices(dialog).map(({ label, description }) => [label, description])).toEqual([
+      ['Group B', 'Nobody yet'],
+      ['Group A', '1 trainer'],
+    ]);
+  });
+
+  it('offers any group with room first where groups have a size, saying which that is now', () => {
+    const dialog = shown(two(), 4);
+    const [first, ...groups] = dialogChoices(dialog);
+    expect(first).toEqual({
+      value: ANY_GROUP,
+      label: 'Any group with room',
+      description: 'Now: group B (2/4 coming)',
+      picked: true,
+    });
+    expect(groups.map(({ description, picked }) => [description, picked])).toEqual([
+      ['2/4 coming · no meeting time yet', false],
+      ['0/4 coming · 1 interested · meeting at 2:45 PM', false],
+    ]);
+    // Every group full: a new one, while the party may have one more.
+    const full = withAttendees(two(), {
+      [REPORTER]: { group: 'A', number: 4 },
+      [BOB]: { group: 'B', number: 4 },
+    });
+    expect(dialogChoices(shown(full, 4))[0]?.description).toBe('Now: a new group, C');
+  });
+
+  it('says what happens when every group is full and there may be no more', () => {
+    const five = withAttendees(
+      {
+        ...testRaid(),
+        groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id, n) => ({
+          id,
+          opened: PARTY_NOW + n,
+        })),
+        defaultGroupId: 'E',
+      },
+      {
+        [REPORTER]: { group: 'A', number: 5 },
+        [BOB]: { group: 'B', number: 4 },
+        [CAROL]: { group: 'C', number: 4 },
+        [DAVE]: { group: 'D', number: 4 },
+        '200000000000000006': { group: 'E', number: 4 },
+      },
+    );
+    const [first] = dialogChoices(shown(five, 4));
+    // The join goes over the size there, as Join's choice does (`chooseGroup`).
+    expect(first).toMatchObject({
+      label: 'Any group: all are full',
+      description: 'The one with the most room: group B (4/4 coming)',
+    });
+  });
+});
diff --git a/src/render/group-dialogs.ts b/src/render/group-dialogs.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0cb880efbcb1bbdcf81c9b43b9c44766c9e458e5
--- /dev/null
+++ b/src/render/group-dialogs.ts
@@ -0,0 +1,181 @@
+import type { APIModalInteractionResponseCallbackData } from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import { dialog, type DialogOption } from '../discord/dialog.js';
+import { chooseGroup } from '../domain/party/attendance.js';
+import {
+  groupOpened,
+  groupStamp,
+  headCount,
+  isGroupId,
+  isRaid,
+  lobbyCount,
+  partyWord,
+  type GroupId,
+  type Party,
+  type PartyGroup,
+} from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { PARTY_KIND } from './party-controls.js';
+import { clockText, count, truncate } from './text.js';
+
+/*
+ * The dialogs about groups of a post (plan 8X-1B; design
+ * `2026-10-20-join-group-meet-buttons-design.md`): which group a newcomer joins (decision 2), and
+ * Group…'s (decision 3). A choice names a group by its letter and stamp (`groupChoice`), since a
+ * group nobody is in goes and a later one may take its letter: a Submit for a group that went is
+ * refused, never taken for the new one.
+ */
+
+/** The custom-id action of the dialog that asks a newcomer which group. */
+export const WHICH_GROUP_FORM = 'joinform';
+
+/** The radio group of the groups to choose from. */
+export const GROUP_INPUT = 'group';
+
+/** The choice "Any group with room", where the party's groups have a size. */
+export const ANY_GROUP = 'any';
+
+/** The status buttons that ask a newcomer which group: Interested, Join, Here. */
+export type JoinAction = 'maybe' | 'join' | 'here';
+
+export function isJoinAction(value: string | undefined): value is JoinAction {
+  return value === 'maybe' || value === 'join' || value === 'here';
+}
+
+/** What the dialogs about groups are drawn from. */
+export interface GroupDialogView {
+  party: Party;
+  /** The member who pressed. */
+  memberId: string;
+  /** How many trainers a group holds, where the party has a size (`lobbySize`). */
+  lobbySize: number | undefined;
+  /** The settings' time zone: a choice shows a meeting time as a clock time. */
+  zone: string;
+  now: number;
+}
+
+/** A choice's value for a group: `B:<stamp>` (`groupStamp`). */
+export function groupChoice(party: Pick<Party, 'createdAt'>, group: PartyGroup): string {
+  return `${group.id}:${groupStamp(party, group)}`;
+}
+
+/** The group and stamp of a choice's value; undefined for anything else (`ANY_GROUP` too). */
+export function chosenGroup(value: string): { group: GroupId; stamp: string } | undefined {
+  const [group, stamp, ...rest] = value.split(':');
+  return group !== undefined && isGroupId(group) && stamp && rest.length === 0
+    ? { group, stamp }
+    : undefined;
+}
+
+/** The groups newest first (by when they were opened; the later in the list on a tie). */
+export function newestFirst(party: Party): PartyGroup[] {
+  return party.groups
+    .map((group, index) => ({ group, index }))
+    .sort((a, b) => groupOpened(party, b.group) - groupOpened(party, a.group) || b.index - a.index)
+    .map(({ group }) => group);
+}
+
+/** `Group B: by the bridge`, within the 100 characters of a choice's label. */
+export function groupLabel(group: PartyGroup): string {
+  return truncate(group.label ? `Group ${group.id}: ${group.label}` : `Group ${group.id}`, 100);
+}
+
+/** A group's lobby, as the post's heading counts it: `2/4 coming · 1 interested`. */
+function lobbyWords(party: Party, group: GroupId, size: number): string {
+  const interested = Object.values(party.attendees)
+    .filter((attendee) => attendee.group === group && attendee.status === PartyStatus.Interested)
+    .reduce((sum, attendee) => sum + attendee.number, 0);
+  const coming = `${lobbyCount(party, group)}/${size} coming`;
+  return interested > 0 ? `${coming} · ${interested} interested` : coming;
+}
+
+/**
+ * A short line of a group, for its choice: how many are in it (its lobby where groups have a
+ * size), or `Nobody yet`, and a raid's meeting time or that it has none yet.
+ */
+export function groupDescription(view: GroupDialogView, group: PartyGroup): string {
+  const { party, lobbySize, zone } = view;
+  const someone = Object.values(party.attendees).some((attendee) => attendee.group === group.id);
+  const size =
+    lobbySize !== undefined
+      ? lobbyWords(party, group.id, lobbySize)
+      : someone
+        ? count(headCount(party, group.id), 'trainer')
+        : 'Nobody yet';
+  if (!isRaid(party)) return size;
+  const meeting =
+    group.startTime === undefined
+      ? 'no meeting time yet'
+      : `meeting at ${clockText(group.startTime, zone)}`;
+  return truncate(`${size} · ${meeting}`, 100);
+}
+
+/**
+ * "Any group with room" (where groups have a size, decision 2): what `chooseGroup` would choose
+ * for the member now, which the Submit chooses anew; when every group is full and the party may
+ * have no more, it says the join goes to the one with the most room (over its size).
+ */
+function anyGroupOption(view: GroupDialogView, size: number): DialogOption {
+  const { party, memberId, now } = view;
+  const chosen = chooseGroup(party, memberId, 1, size, now);
+  if (chosen.party !== party) {
+    return {
+      value: ANY_GROUP,
+      label: 'Any group with room',
+      description: `Now: a new group, ${chosen.group}`,
+    };
+  }
+  const words = `group ${chosen.group} (${lobbyWords(party, chosen.group, size)})`;
+  return lobbyCount(party, chosen.group, memberId) + 1 > size
+    ? {
+        value: ANY_GROUP,
+        label: 'Any group: all are full',
+        description: `The one with the most room: ${words}`,
+      }
+    : { value: ANY_GROUP, label: 'Any group with room', description: `Now: ${words}` };
+}
+
+const TITLES: Readonly<Record<JoinAction, (word: string) => string>> = {
+  maybe: (word) => `Interested in this ${word}`,
+  join: (word) => `Join this ${word}`,
+  here: (word) => `Here for this ${word}`,
+};
+
+/**
+ * The dialog that asks a member who is not signed up which group, for a press of Interested,
+ * Join or Here on a post of several groups (decision 2): one required radio choice, "Which
+ * group?", of "Any group with room" first where the groups have a size, then every group newest
+ * first, the first picked to start with (decision 9: Android picks the first itself). Each group
+ * by its label and a short line (`groupDescription`). Its custom id
+ * `party:<id>:joinform:<action>` keeps which button it was; a choice is `ANY_GROUP` or
+ * `groupChoice`.
+ */
+export function whichGroupDialog(
+  view: GroupDialogView,
+  action: JoinAction,
+): APIModalInteractionResponseCallbackData {
+  const { party, lobbySize } = view;
+  const options: DialogOption[] = [
+    ...(lobbySize === undefined ? [] : [anyGroupOption(view, lobbySize)]),
+    ...newestFirst(party).map((group) => ({
+      value: groupChoice(party, group),
+      label: groupLabel(group),
+      description: groupDescription(view, group),
+    })),
+  ];
+  return dialog({
+    customId: encodeCustomId({
+      kind: PARTY_KIND,
+      id: party.id,
+      action: WHICH_GROUP_FORM,
+      args: [action],
+    }),
+    title: TITLES[action](partyWord(party)),
+    choice: {
+      id: GROUP_INPUT,
+      label: 'Which group?',
+      options,
+      ...(options[0] === undefined ? {} : { picked: options[0].value }),
+    },
+  });
+}
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index 15599ef5ad72c5a728ade602b5074c31842d406a..f669508fd0f31629f60ddf3f711efba287e5ac82 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -29,7 +29,8 @@ export const PARTY_KIND = 'party';
  * screenshot, which shows that screenshot privately. `split` is "Split group…" of a train with
  * two groups or more, which opens the dialog `splitform` (`train-split.ts`; `<group>:<mark>` when
  * it asks about one group); no button has `splitform`. `regroup` is "Group…" and `meet` is
- * "Meet…" (plan 8X-1B), each of which opens a dialog. `group` is the letter Join of a post drawn
+ * "Meet…" (plan 8X-1B), each of which opens a dialog; `joinform` is the dialog that asks a newcomer
+ * which group (no button has it). `group` is the letter Join of a post drawn
  * before plan 8X-1B ("A", "B"): it still joins its letter until the post is shown anew, and is
  * refused as no such group once that letter is gone.
  */
@@ -58,6 +59,7 @@ export const PARTY_ACTIONS = [
   'split',
   'splitform',
   'regroup',
+  'joinform',
   'meet',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
diff --git a/src/render/text.ts b/src/render/text.ts
index 9ddbb12dfbcc43f7c1e7de705fa43bbeceb2c8b3..5fd691fc473d2cc87e7589c5c5d3f327ae834d1d 100644
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -284,6 +284,14 @@ export function cutMarkdown(text: string, limit: number): string {
   return `${kept.trimEnd()}…`;
 }
 
+/**
+ * A clock time as plain text in the settings' zone, `7:37 PM`: for what shows no markdown and so
+ * no Discord timestamp (the labels and descriptions of a dialog's choices, plan 8X-1B).
+ */
+export function clockText(ms: number, zone: string): string {
+  return DateTime.fromMillis(ms, { zone }).toFormat('h:mm a');
+}
+
 /**
  * A moment as Discord shows it in each reader's own time zone: `<t:1760000000:t>`. `t` is the
  * clock time, `f` the date with it, `F` the weekday too, `R` how long until or since.
diff --git a/src/services/attendance-service.ts b/src/services/attendance-service.ts
index 08f5233f6ea56afbf6a7945181b7e1d317ae1dbd..dd409cad016921c690c09d017250312471327441 100644
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -8,6 +8,7 @@ import {
   createGroup,
   finishParty,
   joinGroup,
+  joinChosen,
   joinInto,
   labelGroup,
   leaveParty,
@@ -20,6 +21,7 @@ import {
   setRemote,
   type AttendanceLimits,
   type AttendanceOptions,
+  type GroupChoice,
   type MemberInfo,
   withdrawQuestions,
 } from '../domain/party/attendance.js';
@@ -248,6 +250,29 @@ export class AttendanceService {
     );
   }
 
+  /**
+   * How many trainers one group of this party holds, where it has a size (`lobbySize`): the
+   * dialog that asks a newcomer which group offers "Any group with room" then (plan 8X-1B).
+   */
+  lobbyOf(party: Party): number | undefined {
+    return this.lobbySize(party);
+  }
+
+  /**
+   * The Submit of "which group?" (plan 8X-1B, `joinChosen`): the member signed up with that
+   * status in the group they chose, as things are now.
+   */
+  joinChosen(
+    partyId: string,
+    member: Member,
+    status: typeof PartyStatus.Interested | typeof PartyStatus.Coming | typeof PartyStatus.Present,
+    choice: GroupChoice,
+  ): Promise<AttendanceOutcome<{ stayed?: GroupId }>> {
+    return this.apply(partyId, member, (party) =>
+      joinChosen(party, member.id, status, choice, this.limitsOf(party)),
+    );
+  }
+
   /** "Join A" of a post with several groups (`joinInto`): coming in that group. */
   joinInto(partyId: string, member: Member, group: GroupId): Promise<AttendanceOutcome> {
     return this.apply(partyId, member, (party) =>
````

### Task 4: 8X-1B task 4: Group... moves a member or opens a group, in a dialog

Prototype commit: `9f6c721f666c3f98f6957470b7dfd0b989ddd55e`

Group... opens a dialog of the ways left to the member: every other
group (all of them for a newcomer, whom it signs up as coming), newest
first, then a new group with "Label for a new group (optional)",
ignored for a move; the first is picked to start with. Where one way is
left the dialog asks nothing and says what Submit does. Refused before
it opens: the one member of a party's one group (a new group would
change nothing), a member who completed the raid. The Submit moves by
letter and stamp (joinStamped: a group that went is refused) or opens
the group with its label, telling the others as /group new does; the
notice now says to press Group... on the post.

**Files:**

```
 src/commands/parties/group-dialogs.ts      | 152 +++++++++++++++++++++++++++++++++++++++++++------
 src/components/party.groups.test.ts        | 139 +++++++++++++++++++++++++++++++++++++++++++-
 src/components/party.ts                    |  12 +++-
 src/domain/party/attendance.choose.test.ts |  73 +++++++++++++++++++++++-
 src/domain/party/attendance.ts             |  50 ++++++++++++++--
 src/render/group-dialogs.test.ts           | 121 ++++++++++++++++++++++++++++++++++++++-
 src/render/group-dialogs.ts                | 127 ++++++++++++++++++++++++++++++++++++++++-
 src/render/party-controls.ts               |   3 +-
 src/services/attendance-service.test.ts    |  39 ++++++++++++-
 src/services/attendance-service.ts         |  37 +++++++++---
 10 files changed, 712 insertions(+), 41 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/components/party.groups.test.ts src/domain/party/attendance.choose.test.ts src/render/group-dialogs.test.ts src/services/attendance-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9f6c721f666c3f98f6957470b7dfd0b989ddd55e -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-1B task 4: Group... moves a member or opens a group, in a dialog`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/group-dialogs.ts b/src/commands/parties/group-dialogs.ts
index 2a43678370f8d6ca940d3d3778f7ef07b280ae89..fe27da969a0b9061ef47f784a41fa8abe00a02b8 100644
--- a/src/commands/parties/group-dialogs.ts
+++ b/src/commands/parties/group-dialogs.ts
@@ -3,20 +3,32 @@ import type { AppContext } from '../../app-context.js';
 import { deferSubmit } from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
-import type { GroupChoice } from '../../domain/party/attendance.js';
-import { attendeeOf, hasGroups, type Party } from '../../domain/party/party.js';
+import { newGroupChangesNothing, type GroupChoice } from '../../domain/party/attendance.js';
+import {
+  attendeeOf,
+  groupOf,
+  hasGroups,
+  partyWord,
+  type GroupId,
+  type Party,
+} from '../../domain/party/party.js';
 import { PartyStatus } from '../../domain/party/status.js';
+import { problemText, standingReply } from '../../render/activity.js';
 import {
   ANY_GROUP,
   chosenGroup,
   GROUP_INPUT,
+  groupMenuDialog,
+  groupWays,
   isJoinAction,
+  LABEL_INPUT,
+  NEW_GROUP,
   whichGroupDialog,
+  type GroupDialogView,
   type JoinAction,
 } from '../../render/group-dialogs.js';
-import { standingReply } from '../../render/activity.js';
-import { GROUP_LABEL } from '../../render/party-controls.js';
-import { actingMember, outcomeWords } from './reply.js';
+import { GROUP_LABEL, groupWords } from '../../render/party-controls.js';
+import { actingMember, outcomeWords, partyOver } from './reply.js';
 
 /*
  * The dialogs about groups of a post on Discord (plan 8X-1B; design
@@ -68,18 +80,124 @@ export async function openWhichGroup(
   party: Party,
   action: JoinAction,
 ): Promise<void> {
-  await interaction.showModal(
-    whichGroupDialog(
-      {
-        party,
-        memberId: interaction.user.id,
-        lobbySize: ctx.attendance.lobbyOf(party),
-        zone: ctx.config.settings.timezone,
-        now: Date.now(),
-      },
-      action,
-    ),
-  );
+  await interaction.showModal(whichGroupDialog(viewFor(ctx, party, interaction.user.id), action));
+}
+
+/** What Group… says to the one member of a party's one group (decision 8). */
+export const NOTHING_TO_CHANGE = 'You are the only one here: a new group would change nothing.';
+
+/**
+ * What Group… says to a member alone in a plain group of their own (`newGroupChangesNothing`):
+ * `NOTHING_TO_CHANGE` in a party of one group, else that they are alone in their group already.
+ */
+function nothingToChange(party: Party, memberId: string): string {
+  const own = attendeeOf(party, memberId)?.group;
+  return party.groups.length === 1 || own === undefined
+    ? NOTHING_TO_CHANGE
+    : `You are alone in group ${own} already: a new group would change nothing.`;
+}
+
+/** The view of the dialogs about groups for this member, as the party is now. */
+function viewFor(ctx: AppContext, party: Party, memberId: string): GroupDialogView {
+  return {
+    party,
+    memberId,
+    lobbySize: ctx.attendance.lobbyOf(party),
+    zone: ctx.config.settings.timezone,
+    now: Date.now(),
+  };
+}
+
+/**
+ * "Group…" of a post (decision 3): its dialog (`groupMenuDialog`) of the ways left to this
+ * member (`groupWays`: no new group for a member alone in a plain group of their own); refused
+ * privately before it opens (8S-3's rule) for a party that ended, one without groups, a member
+ * who has completed the raid, and where no way is left (the one member of a party's one group:
+ * `NOTHING_TO_CHANGE`).
+ */
+export async function openGroupMenu(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  partyId: string,
+): Promise<void> {
+  const party = ctx.parties.get(partyId);
+  if (!party) throw new UserError(partyOver(party));
+  const limits = ctx.attendance.limits();
+  const word = partyWord(party);
+  const memberId = interaction.user.id;
+  if (!hasGroups(party)) throw new UserError(problemText('no-groups', limits, word));
+  if (attendeeOf(party, memberId)?.status === PartyStatus.Complete) {
+    throw new UserError(problemText('already-done', limits, word));
+  }
+  const ways = groupWays(party, memberId);
+  if (ways.length === 0) {
+    throw new UserError(
+      newGroupChangesNothing(party, memberId)
+        ? nothingToChange(party, memberId)
+        : problemText('too-many-groups', limits, word),
+    );
+  }
+  await interaction.showModal(groupMenuDialog(viewFor(ctx, party, memberId), ways));
+}
+
+/** The way a Submit of Group…'s dialog asks for: from its custom id, else its choice. */
+function chosenWay(
+  interaction: ModalSubmitInteraction,
+  args: readonly string[],
+): { new: true } | { group: GroupId; stamp: string } | undefined {
+  const value =
+    args.length > 0
+      ? args.join(':')
+      : interaction.fields.fields.has(GROUP_INPUT)
+        ? (interaction.fields.getRadioGroup(GROUP_INPUT) ?? '')
+        : '';
+  return value === NEW_GROUP ? { new: true } : chosenGroup(value);
+}
+
+/**
+ * Submit of Group…'s dialog (`party:<id>:regroupform[:<way>]`): acknowledged privately, then, as
+ * things are now, a new group opened with the label typed (`/group new`'s notice and answer:
+ * `You opened group C (label) and are in it.`; `NOTHING_TO_CHANGE` once the member is the one of
+ * the party's one group) or a move to the group picked by its stamp (`joinStamped`: a newcomer
+ * comes; `Group B has changed since: press Group… again.` for one that went), the label ignored.
+ */
+export async function submitGroupMenu(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  partyId: string,
+  args: readonly string[],
+): Promise<void> {
+  const way = chosenWay(interaction, args);
+  if (way === undefined) throw new UserError(STALE_COMPONENT);
+  const label = interaction.fields.fields.has(LABEL_INPUT)
+    ? interaction.fields.getTextInputValue(LABEL_INPUT)
+    : '';
+  await deferSubmit(interaction);
+  const party = ctx.parties.get(partyId);
+  const member = actingMember(interaction);
+  const limits = ctx.attendance.limits();
+  let text: string;
+  if ('new' in way) {
+    text =
+      party && newGroupChangesNothing(party, member.id)
+        ? nothingToChange(party, member.id)
+        : outcomeWords(
+            limits,
+            party,
+            await ctx.attendance.newGroup(partyId, member, label),
+            (ok) => {
+              const group = groupOf(ok.party, ok.group);
+              return `You opened ${groupWords(group ?? { id: ok.group })} and are in it.`;
+            },
+          ).text;
+  } else {
+    const outcome = await ctx.attendance.joinStamped(partyId, member, way.group, way.stamp);
+    text =
+      outcome.kind === 'refused' && outcome.reason === 'group-changed'
+        ? `Group ${way.group} has changed since: press ${GROUP_LABEL} again.`
+        : outcomeWords(limits, party, outcome).text;
+  }
+  await interaction.editReply({ content: text });
 }
 
 /** The choice a Submit picked; undefined for a dialog of another shape or a forged one. */
diff --git a/src/components/party.groups.test.ts b/src/components/party.groups.test.ts
index d3376144d90ae468a4ac7a8c26ab14d90a1da941..38608cf598810ae3a545f33764987b4fc7497237 100644
--- a/src/components/party.groups.test.ts
+++ b/src/components/party.groups.test.ts
@@ -7,14 +7,20 @@ import {
   sent,
   type FakeInteraction,
 } from '../../test/support/fake-interactions.js';
-import { ALICE, BOB } from '../../test/support/parties.js';
+import { ALICE, BOB, REPORTER } from '../../test/support/parties.js';
 import { reportedRaid } from '../../test/support/party-service.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import type { APIModalInteractionResponseCallbackData } from 'discord.js';
 import { InteractionRouter } from '../discord/router.js';
 import { attendeeOf } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { ANY_GROUP, GROUP_INPUT, groupChoice } from '../render/group-dialogs.js';
+import {
+  ANY_GROUP,
+  GROUP_INPUT,
+  groupChoice,
+  LABEL_INPUT,
+  NEW_GROUP,
+} from '../render/group-dialogs.js';
 import { partyButtons } from './party.js';
 
 const DAVE = '200000000000000005';
@@ -68,12 +74,29 @@ async function setup(options: { grouped?: boolean; lobbySize?: number } = {}) {
         displayName: userId === ALICE ? 'Alice' : 'Somebody',
       }),
     );
+  /** The Submit of a dialog with its choice picked (where it has one) and its line of text. */
+  const submitForm = (
+    dialog: APIModalInteractionResponseCallbackData,
+    inputs: { picked?: string; label?: string },
+    userId = ALICE,
+  ) =>
+    handle(
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        ...(inputs.picked === undefined ? {} : { picked: { [GROUP_INPUT]: inputs.picked } }),
+        ...(inputs.label === undefined ? {} : { fields: { [LABEL_INPUT]: inputs.label } }),
+        channelId: made.postId,
+        userId,
+        displayName: userId === ALICE ? 'Alice' : 'Somebody',
+      }),
+    );
   const group = (id: 'A' | 'B') => {
     const found = made.current().groups.find((one) => one.id === id);
     if (!found) throw new Error(`no group ${id}`);
     return groupChoice(made.current(), found);
   };
-  return { ...made, click, submit, group };
+  return { ...made, click, submit, submitForm, group };
 }
 
 /** What a Submit answered, privately. */
@@ -190,3 +213,113 @@ describe('Interested, Join and Here of a post of several groups (plan 8X-1B)', (
     expect(answerOf(submitted)).toBe('This has ended.');
   });
 });
+
+describe('Group… (plan 8X-1B, decision 3)', () => {
+  it('moves a member to the group they pick, as /group join does', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.click('regroup', BOB));
+    expect(dialog.title).toBe('Change group');
+    // Bob is alone in B: a new group would change nothing, so the move to A is the one way.
+    expect(dialogChoices(dialog)).toEqual([]);
+    const submitted = await made.submitForm(dialog, {}, BOB);
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    // B is left empty and goes: one group, which the answer does not name.
+    expect(answerOf(submitted)).toBe('You are coming.');
+    expect(attendeeOf(made.current(), BOB)?.group).toBe('A');
+    // B is empty now, and went.
+    expect(made.current().groups.map((group) => group.id)).toEqual(['A']);
+  });
+
+  it('signs a newcomer up as coming in the group they pick', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.click('regroup'));
+    expect(dialog.title).toBe('Join a group');
+    const submitted = await made.submitForm(dialog, { picked: made.group('A') });
+    expect(answerOf(submitted)).toBe('You are coming, in group A.');
+    expect(attendeeOf(made.current(), ALICE)).toMatchObject({
+      group: 'A',
+      status: PartyStatus.Coming,
+    });
+  });
+
+  it('opens a new group with its label, and tells the others as /group new does', async () => {
+    const made = await setup();
+    await made.attendance.signUp(made.party.id, { id: DAVE }, PartyStatus.Coming, { group: 'B' });
+    const dialog = shownDialog(await made.click('regroup', BOB));
+    const submitted = await made.submitForm(
+      dialog,
+      { picked: NEW_GROUP, label: 'by the bridge' },
+      BOB,
+    );
+    expect(answerOf(submitted)).toBe('You opened group C (by the bridge) and are in it.');
+    expect(made.current().groups.at(-1)).toMatchObject({ id: 'C', label: 'by the bridge' });
+    await made.attendance.flush();
+    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.content).toMatch(
+      /opened group C \(by the bridge\)\. To move to it, press Group… on the post/,
+    );
+  });
+
+  it('ignores the label for a move', async () => {
+    const made = await setup();
+    await made.attendance.signUp(made.party.id, { id: DAVE }, PartyStatus.Coming, { group: 'B' });
+    const dialog = shownDialog(await made.click('regroup', BOB));
+    await made.submitForm(dialog, { picked: made.group('A'), label: 'never' }, BOB);
+    expect(made.current().groups.some((group) => group.label === 'never')).toBe(false);
+  });
+
+  it('refuses a new group at Submit to a member left alone in their group meanwhile', async () => {
+    const made = await setup();
+    await made.attendance.signUp(made.party.id, { id: ALICE }, PartyStatus.Coming, { group: 'A' });
+    const dialog = shownDialog(await made.click('regroup', REPORTER));
+    expect(dialogChoices(dialog).at(-1)?.value).toBe(NEW_GROUP);
+    await made.attendance.leave(made.party.id, { id: ALICE });
+    const submitted = await made.submitForm(dialog, { picked: NEW_GROUP }, REPORTER);
+    expect(answerOf(submitted)).toBe(
+      'You are alone in group A already: a new group would change nothing.',
+    );
+    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B']);
+  });
+
+  it('refuses at the press the one member of a party of one group, whom a new group would not change', async () => {
+    const made = await setup({ grouped: false });
+    const pressed = await made.click('regroup', REPORTER);
+    expect(dialogOf(pressed)).toBeUndefined();
+    expect(sent(pressed.reply).content).toBe(
+      'You are the only one here: a new group would change nothing.',
+    );
+  });
+
+  it('asks nothing where only a new group is left: Submit opens it', async () => {
+    const made = await setup({ grouped: false });
+    await made.attendance.signUp(made.party.id, { id: BOB }, PartyStatus.Coming);
+    const dialog = shownDialog(await made.click('regroup', BOB));
+    expect(dialogChoices(dialog)).toEqual([]);
+    const submitted = await made.submitForm(dialog, {}, BOB);
+    expect(answerOf(submitted)).toBe('You opened group B and are in it.');
+  });
+
+  it('refuses a group that went meanwhile', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.click('regroup', REPORTER));
+    await made.attendance.leave(made.party.id, { id: BOB });
+    // The reporter is alone in A: the move to B is the one way, which the dialog's id names.
+    const submitted = await made.submitForm(dialog, {}, REPORTER);
+    expect(answerOf(submitted)).toBe('Group B has changed since: press Group… again.');
+  });
+
+  it('refuses at the press a member who has completed the raid', async () => {
+    const made = await setup();
+    await made.store.update(made.party.id, (party) => ({
+      party: {
+        ...party,
+        attendees: {
+          ...party.attendees,
+          [ALICE]: { number: 1, status: PartyStatus.Complete, group: 'A', remote: false },
+        },
+      },
+    }));
+    const pressed = await made.click('regroup');
+    expect(dialogOf(pressed)).toBeUndefined();
+    expect(sent(pressed.reply).content).toMatch(/^You are done with this raid\./);
+  });
+});
diff --git a/src/components/party.ts b/src/components/party.ts
index 1905371d1831e84d29081756768bb48f16bd10da..cc49e1375dd2c0d2c1dd0891bbeb67d70b6a9f03 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -28,10 +28,12 @@ import { isGroupId, isRaid } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
 import { SPLIT_FORM } from '../render/train-split.js';
-import { WHICH_GROUP_FORM } from '../render/group-dialogs.js';
+import { GROUP_MENU_FORM, WHICH_GROUP_FORM } from '../render/group-dialogs.js';
 import {
   asksWhichGroup,
+  openGroupMenu,
   openWhichGroup,
+  submitGroupMenu,
   submitWhichGroup,
 } from '../commands/parties/group-dialogs.js';
 
@@ -156,8 +158,13 @@ export const partyButtons: ComponentHandler = {
         // Only those dialogs have these actions.
         throw new UserError(STALE_COMPONENT);
       case 'regroup':
+        // "Group…" (plan 8X-1B): move to another group or open one, in a dialog.
+        return openGroupMenu(interaction, ctx, partyId);
+      case 'regroupform':
+        // Only Group…'s dialog has this action.
+        throw new UserError(STALE_COMPONENT);
       case 'meet':
-        // "Group…" and "Meet…" (plan 8X-1B): their dialogs come with their tasks.
+        // "Meet…" (plan 8X-1B): its dialog comes with its task.
         throw new UserError(STALE_COMPONENT);
       case 'answer': {
         const [answer] = id.args;
@@ -186,6 +193,7 @@ export const partyButtons: ComponentHandler = {
   async modal(interaction, id, ctx) {
     if (id.action === 'delete') return submitPartyReport(interaction, ctx, id.id);
     if (id.action === SPLIT_FORM) return submitSplit(interaction, ctx, id.id, id.args);
+    if (id.action === GROUP_MENU_FORM) return submitGroupMenu(interaction, ctx, id.id, id.args);
     if (id.action === WHICH_GROUP_FORM) {
       return submitWhichGroup(interaction, ctx, id.id, id.args);
     }
diff --git a/src/domain/party/attendance.choose.test.ts b/src/domain/party/attendance.choose.test.ts
index af7bb2e80d1a7a4f8243216ed67ddc3a800c6d1e..a39a62b3a565afd031817a405d3e838d5b247f01 100644
--- a/src/domain/party/attendance.choose.test.ts
+++ b/src/domain/party/attendance.choose.test.ts
@@ -7,7 +7,13 @@ import {
   testRaid,
   withAttendees,
 } from '../../../test/support/parties.js';
-import { attendanceLimits, joinChosen } from './attendance.js';
+import {
+  attendanceLimits,
+  createGroup,
+  joinChosen,
+  joinStamped,
+  newGroupChangesNothing,
+} from './attendance.js';
 import { groupStamp, type RaidParty } from './party.js';
 import { PartyStatus } from './status.js';
 
@@ -109,3 +115,68 @@ describe('joinChosen: the answer to "which group?" as things are at the Submit',
     });
   });
 });
+
+describe('the moves of Group… (plan 8X-1B)', () => {
+  it('moves a member to the group of that stamp, and signs a newcomer up there as coming', () => {
+    const party = withAttendees(two(), { [ALICE]: { group: 'A', status: PartyStatus.Present } });
+    const moved = joinStamped(party, ALICE, 'B', stampOf(party, 'B'), limits);
+    expect(moved.ok && moved.party.attendees[ALICE]).toMatchObject({
+      group: 'B',
+      status: PartyStatus.Present,
+    });
+    const fresh = joinStamped(two(), ALICE, 'A', stampOf(party, 'A'), limits);
+    expect(fresh.ok && fresh.party.attendees[ALICE]).toMatchObject({
+      group: 'A',
+      status: PartyStatus.Coming,
+    });
+    expect(joinStamped(two(), ALICE, 'B', 'x', limits)).toEqual({
+      ok: false,
+      reason: 'group-changed',
+    });
+  });
+
+  it('opens a group with a label, tidied, and refuses one too long', () => {
+    const opened = createGroup(
+      two(),
+      ALICE,
+      { ...limits, now: PARTY_NOW + 1 },
+      '  by the  bridge ',
+    );
+    expect(opened.ok && opened.party.groups.at(-1)).toEqual({
+      id: 'C',
+      // After the newest group, B (stamps strictly increase).
+      opened: B_OPENED + 1,
+      label: 'by the bridge',
+    });
+    // An empty one is none.
+    const blank = createGroup(two(), ALICE, limits, ' ');
+    expect(blank.ok && blank.party.groups.at(-1)).not.toHaveProperty('label');
+    expect(createGroup(two(), ALICE, limits, 'x'.repeat(101))).toEqual({
+      ok: false,
+      reason: 'label-too-long',
+    });
+  });
+
+  it('knows when a new group would change nothing: the member alone in a plain group of their own', () => {
+    const alone = { ...testRaid(), groups: [{ id: 'A' as const }] };
+    expect(newGroupChangesNothing(alone, REPORTER)).toBe(true);
+    expect(newGroupChangesNothing(withAttendees(alone, { [ALICE]: {} }), REPORTER)).toBe(false);
+    expect(newGroupChangesNothing(alone, ALICE)).toBe(false);
+    // Any number of groups: the reporter is alone in A, Bob is in B.
+    expect(newGroupChangesNothing(two(), REPORTER)).toBe(true);
+    expect(
+      newGroupChangesNothing(withAttendees(two(), { [ALICE]: { group: 'A' } }), REPORTER),
+    ).toBe(false);
+    // A group with a label or a meeting time stays when they leave it: a new group changes that.
+    const labelled = {
+      ...two(),
+      groups: [{ id: 'A' as const, label: 'park' }, ...two().groups.slice(1)],
+    };
+    expect(newGroupChangesNothing(labelled, REPORTER)).toBe(false);
+    const timed = {
+      ...two(),
+      groups: [{ id: 'A' as const, startTime: PARTY_NOW }, ...two().groups.slice(1)],
+    };
+    expect(newGroupChangesNothing(timed, REPORTER)).toBe(false);
+  });
+});
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index d7a089241fe13552ff34fe970d16e42557203581..8e5020b3ae1c5a101574a12c700e130b1293f686 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -663,7 +663,7 @@ export function joinChosen<P extends Party>(
  * so a dialog drawn for the group that went is refused. Undefined when the party has every group
  * it may.
  */
-function nextGroupId(party: Party): GroupId | undefined {
+export function nextGroupId(party: Party): GroupId | undefined {
   const used = new Set(party.groups.map((group) => group.id));
   const gone = new Set(isTrain(party) ? party.train.splitOff.map((split) => split.group) : []);
   const last = Math.max(...party.groups.map((group) => GROUP_IDS.indexOf(group.id)));
@@ -675,22 +675,33 @@ function nextGroupId(party: Party): GroupId | undefined {
   );
 }
 
+/** A group's label as it is kept: white space tidied; undefined for none. */
+function tidyLabel(text: string): string | undefined {
+  const label = text.replace(/\s+/g, ' ').trim();
+  return label === '' ? undefined : label;
+}
+
 /**
- * Opens the next group (`nextGroupId`, stamped `limits.now`) and moves the member into it. It
- * becomes the group new attendees land in. `others` are the attendees who have not completed the
- * raid, to be told about it.
+ * Opens the next group (`nextGroupId`, stamped `limits.now`) and moves the member into it, with
+ * `label` where given (Group…'s dialog, plan 8X-1B; tidied, an empty one none, refused
+ * `label-too-long` past `MAX_GROUP_LABEL`). It becomes the group new attendees land in. `others`
+ * are the attendees who have not completed the raid, to be told about it.
  */
 export function createGroup<P extends Party>(
   party: P,
   memberId: string,
   limits: AttendanceLimits,
+  label?: string,
 ): Change<P, { group: GroupId; joined: boolean; others: string[] }> {
   if (!hasGroups(party)) return refused('no-groups');
   const id = nextGroupId(party);
   if (id === undefined) return refused('too-many-groups');
+  const tidy = label === undefined ? undefined : tidyLabel(label);
+  if (tidy !== undefined && tidy.length > MAX_GROUP_LABEL) return refused('label-too-long');
+  const group = openedGroup(party, id, limits.now);
   const opened: P = {
     ...party,
-    groups: [...party.groups, openedGroup(party, id, limits.now)],
+    groups: [...party.groups, tidy === undefined ? group : { ...group, label: tidy }],
     defaultGroupId: id,
   };
   const moved = joinGroup(opened, memberId, id, limits);
@@ -702,6 +713,35 @@ export function createGroup<P extends Party>(
   return { ...moved, group: id, others };
 }
 
+/**
+ * Group…'s move (plan 8X-1B): the member to the group of this letter while it has this stamp
+ * (`stampedGroup`; refused `group-changed` for one that went or was opened again under its
+ * letter), as `/group join` moves them (`joinGroup`: a member not signed up comes, alone).
+ */
+export function joinStamped<P extends Party>(
+  party: P,
+  memberId: string,
+  groupId: GroupId,
+  stamp: string,
+  limits: AttendanceLimits,
+): Change<P, { joined: boolean }> {
+  if (!hasGroups(party)) return refused('no-groups');
+  if (!stampedGroup(party, groupId, stamp)) return refused('group-changed');
+  return joinGroup(party, memberId, groupId, limits);
+}
+
+/**
+ * Whether a new group would change nothing for this member (Group…, decision 8): they are alone
+ * in their own group, which has no label and no meeting time and so would go once they left it
+ * for the new one, whatever the other groups.
+ */
+export function newGroupChangesNothing(party: Party, memberId: string): boolean {
+  const own = attendeeOf(party, memberId)?.group;
+  const group = own === undefined ? undefined : groupOf(party, own);
+  if (!group || group.label || group.startTime !== undefined) return false;
+  return membersWhere(party, (attendee) => attendee.group === own).length === 1;
+}
+
 /** Sets the label of the member's own group; an empty text removes it. Only for an attendee. */
 export function labelGroup<P extends Party>(
   party: P,
diff --git a/src/render/group-dialogs.test.ts b/src/render/group-dialogs.test.ts
index b835b3778a0b7246789ba0f866ca90c61cf89b3b..79825cece2d1ab11e2a8da5e992d3fe25f747068 100644
--- a/src/render/group-dialogs.test.ts
+++ b/src/render/group-dialogs.test.ts
@@ -1,3 +1,4 @@
+import { ComponentType } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
 import { checkModal } from '../../test/support/fake-interactions.js';
@@ -15,7 +16,15 @@ import {
 } from '../../test/support/parties.js';
 import { decodeCustomId } from '../discord/custom-id.js';
 import type { RaidParty } from '../domain/party/party.js';
-import { ANY_GROUP, groupChoice, whichGroupDialog } from './group-dialogs.js';
+import {
+  ANY_GROUP,
+  groupChoice,
+  groupMenuDialog,
+  groupWays,
+  LABEL_INPUT,
+  NEW_GROUP,
+  whichGroupDialog,
+} from './group-dialogs.js';
 
 const DAVE = '200000000000000005';
 const MEET = at('2026-10-13T14:45');
@@ -141,3 +150,113 @@ describe('whichGroupDialog', () => {
     });
   });
 });
+
+describe('groupMenuDialog (Group…)', () => {
+  const view = (party: RaidParty, memberId = BOB) => ({
+    party,
+    memberId,
+    lobbySize: undefined,
+    zone: PARTY_ZONE,
+    now: PARTY_NOW,
+  });
+  const menu = (party: RaidParty, memberId = BOB) =>
+    groupMenuDialog(view(party, memberId), groupWays(party, memberId));
+
+  it('offers a member the other groups, newest first, then a new group with an optional label', () => {
+    const three = withAttendees(
+      {
+        ...two(),
+        groups: [...two().groups, { id: 'C' as const, opened: PARTY_NOW + 120_000 }],
+      },
+      { [CAROL]: { group: 'C' } },
+    );
+    const dialog = menu(three);
+    checkModal(dialog);
+    expect(dialog.title).toBe('Change group');
+    expect(decodeCustomId(dialog.custom_id)).toMatchObject({ action: 'regroupform', args: [] });
+    expect(dialogTexts(dialog)).toEqual(["You're in group B (by the bridge)."]);
+    expect(
+      dialogChoices(dialog).map(({ label, description, picked }) => [label, description, picked]),
+    ).toEqual([
+      ['Group C', '1 trainer · no meeting time yet', true],
+      ['Group A', '1 trainer · meeting at 2:45 PM', false],
+      ['A new group (D)', 'Just you, until others join', false],
+    ]);
+    expect(dialogChoices(dialog).at(-1)?.value).toBe(NEW_GROUP);
+    const field = dialog.components.find(
+      (one) => one.type === ComponentType.Label && one.component.type === ComponentType.TextInput,
+    );
+    expect(field).toMatchObject({
+      label: 'Label for a new group (optional)',
+      component: { custom_id: LABEL_INPUT, required: false, max_length: 100 },
+    });
+  });
+
+  it('signs up a newcomer by it: every group to choose from, titled so', () => {
+    const dialog = menu(two(), ALICE);
+    expect(dialog.title).toBe('Join a group');
+    expect(dialogTexts(dialog)).toEqual(['You join as coming, in the group you pick.']);
+    expect(dialogChoices(dialog).map(({ label }) => label)).toEqual([
+      'Group B: by the bridge',
+      'Group A',
+      'A new group (C)',
+    ]);
+  });
+
+  it('asks nothing where only one way is left, and says what Submit does', () => {
+    // One group, with somebody else in it: only a new group.
+    const one = withAttendees(testRaid(), { [BOB]: {} });
+    const dialog = menu(one);
+    checkModal(dialog);
+    expect(dialogChoices(dialog)).toEqual([]);
+    expect(dialogTexts(dialog)).toEqual([
+      "You're in group A. Submit opens group B and moves you to it.",
+    ]);
+    expect(decodeCustomId(dialog.custom_id)).toMatchObject({ args: [NEW_GROUP] });
+    // Five groups: moves only, and no label asked.
+    const five = withAttendees(
+      {
+        ...testRaid(),
+        groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id })),
+        attendees: {},
+      },
+      { [BOB]: { group: 'A' }, [ALICE]: { group: 'E' } },
+    );
+    const moves = menu(five);
+    expect(dialogChoices(moves).map(({ value }) => value.split(':')[0])).toEqual([
+      'E',
+      'D',
+      'C',
+      'B',
+    ]);
+    expect(
+      moves.components.some(
+        (one) => one.type === ComponentType.Label && one.component.type === ComponentType.TextInput,
+      ),
+    ).toBe(false);
+  });
+
+  it('offers no new group to a member alone in a plain group: it would change nothing', () => {
+    // The reporter is alone in A (no meeting time now), Bob in B: only the move to B is left.
+    const plain = { ...two(), groups: [{ id: 'A' as const }, ...two().groups.slice(1)] };
+    expect(groupWays(plain, REPORTER).map((way) => way.kind)).toEqual(['move']);
+    // A meeting time keeps A when the reporter leaves it: a new group would change that.
+    expect(groupWays(two(), REPORTER).map((way) => way.kind)).toEqual(['move', 'new']);
+    expect(dialogTexts(menu(plain, REPORTER))).toEqual([
+      "You're in group A. Submit moves you to group B.",
+    ]);
+  });
+
+  it('names a group to move to by its stamp in a dialog without a choice', () => {
+    const party = {
+      ...two(),
+      groups: [{ id: 'A' as const }, { id: 'B' as const, opened: PARTY_NOW + 60_000 }],
+    };
+    const ways = groupWays(party, BOB).filter((way) => way.kind === 'move');
+    const dialog = groupMenuDialog(view(party), ways);
+    expect(dialogTexts(dialog)).toEqual(["You're in group B. Submit moves you to group A."]);
+    expect(decodeCustomId(dialog.custom_id)?.args).toEqual(
+      groupChoice(party, { id: 'A' }).split(':'),
+    );
+  });
+});
diff --git a/src/render/group-dialogs.ts b/src/render/group-dialogs.ts
index 0cb880efbcb1bbdcf81c9b43b9c44766c9e458e5..9fc08b560b51ba653ad57477cd4f7bceecae4ff7 100644
--- a/src/render/group-dialogs.ts
+++ b/src/render/group-dialogs.ts
@@ -1,8 +1,15 @@
 import type { APIModalInteractionResponseCallbackData } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import { dialog, type DialogOption } from '../discord/dialog.js';
-import { chooseGroup } from '../domain/party/attendance.js';
 import {
+  chooseGroup,
+  MAX_GROUP_LABEL,
+  newGroupChangesNothing,
+  nextGroupId,
+} from '../domain/party/attendance.js';
+import {
+  attendeeOf,
+  groupOf,
   groupOpened,
   groupStamp,
   headCount,
@@ -15,7 +22,7 @@ import {
   type PartyGroup,
 } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
-import { PARTY_KIND } from './party-controls.js';
+import { groupWords, PARTY_KIND } from './party-controls.js';
 import { clockText, count, truncate } from './text.js';
 
 /*
@@ -179,3 +186,119 @@ export function whichGroupDialog(
     },
   });
 }
+
+/** The custom-id action of Group…'s dialog. */
+export const GROUP_MENU_FORM = 'regroupform';
+
+/** The choice of Group…'s dialog that opens a new group. */
+export const NEW_GROUP = 'new';
+
+/** The line of Group…'s dialog for the label of a new group. */
+export const LABEL_INPUT = 'label';
+
+/** What Group… can do for a member: move them to a group, or open a new one (its letter). */
+export type GroupWay = { kind: 'move'; group: PartyGroup } | { kind: 'new'; id: GroupId };
+
+/**
+ * What Group… offers this member (decision 3): every other group (all of them for a member who
+ * is not signed up), newest first, then a new group while the party may have one more
+ * (`nextGroupId`) and it would change something (not for a member alone in a plain group of
+ * their own: `newGroupChangesNothing`). Nothing where there is nothing to choose.
+ */
+export function groupWays(party: Party, memberId: string): GroupWay[] {
+  const own = attendeeOf(party, memberId)?.group;
+  const next = newGroupChangesNothing(party, memberId) ? undefined : nextGroupId(party);
+  return [
+    ...newestFirst(party)
+      .filter((group) => group.id !== own)
+      .map((group): GroupWay => ({ kind: 'move', group })),
+    ...(next === undefined ? [] : [{ kind: 'new' as const, id: next }]),
+  ];
+}
+
+/** A way as the value of a choice: `NEW_GROUP`, or the group's `groupChoice`. */
+function wayValue(party: Party, way: GroupWay): string {
+  return way.kind === 'new' ? NEW_GROUP : groupChoice(party, way.group);
+}
+
+/** What a dialog without a choice says Submit does: `Submit opens group C and moves you to it.` */
+function onlyWay(way: GroupWay, signedUp: boolean): string {
+  if (way.kind === 'new') {
+    return signedUp
+      ? `Submit opens group ${way.id} and moves you to it.`
+      : `Submit opens group ${way.id} and signs you up as coming in it.`;
+  }
+  return signedUp
+    ? `Submit moves you to group ${way.group.id}.`
+    : `Submit signs you up as coming in group ${way.group.id}.`;
+}
+
+/**
+ * Group…'s dialog (decision 3; decision 8 for a single way): titled `Change group` (`Join a
+ * group` for a member who is not signed up, whom it signs up as coming), saying which group the
+ * member is in; the required radio choice `Move to` of `ways` in their order (the first picked to
+ * start with), a new group last as `A new group (C)`; where only one way is left no choice, and
+ * the text says what Submit does. "Label for a new group (optional)" where a new group is among
+ * the ways (ignored for a move). Its custom id `party:<id>:regroupform`, or with the one way as
+ * its arguments (`new`, or the group's letter and stamp).
+ */
+export function groupMenuDialog(
+  view: GroupDialogView,
+  ways: readonly GroupWay[],
+): APIModalInteractionResponseCallbackData {
+  const { party, memberId } = view;
+  const own = attendeeOf(party, memberId)?.group;
+  const ownGroup = own === undefined ? undefined : groupOf(party, own);
+  const intro = ownGroup
+    ? `You're in ${groupWords(ownGroup)}.`
+    : 'You join as coming, in the group you pick.';
+  const [first] = ways;
+  const only = ways.length === 1 ? first : undefined;
+  const options: DialogOption[] = ways.map((way) =>
+    way.kind === 'new'
+      ? {
+          value: NEW_GROUP,
+          label: `A new group (${way.id})`,
+          description: 'Just you, until others join',
+        }
+      : {
+          value: groupChoice(party, way.group),
+          label: groupLabel(way.group),
+          description: groupDescription(view, way.group),
+        },
+  );
+  return dialog({
+    customId: encodeCustomId({
+      kind: PARTY_KIND,
+      id: party.id,
+      action: GROUP_MENU_FORM,
+      ...(only === undefined ? {} : { args: wayValue(party, only).split(':') }),
+    }),
+    title: ownGroup ? 'Change group' : 'Join a group',
+    text:
+      only === undefined
+        ? intro
+        : ownGroup
+          ? `${intro} ${onlyWay(only, true)}`
+          : onlyWay(only, false),
+    ...(only === undefined && first !== undefined
+      ? {
+          choice: {
+            id: GROUP_INPUT,
+            label: ownGroup ? 'Move to' : 'Join',
+            options,
+            picked: wayValue(party, first),
+          },
+        }
+      : {}),
+    ...(ways.some((way) => way.kind === 'new')
+      ? {
+          field: {
+            id: LABEL_INPUT,
+            label: 'Label for a new group (optional)',
+            maxLength: MAX_GROUP_LABEL,
+          },
+        }
+      : {}),
+  });
+}
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index f669508fd0f31629f60ddf3f711efba287e5ac82..28e5417bab0736e11f933c578cd6735c0163e486 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -30,7 +30,7 @@ export const PARTY_KIND = 'party';
  * two groups or more, which opens the dialog `splitform` (`train-split.ts`; `<group>:<mark>` when
  * it asks about one group); no button has `splitform`. `regroup` is "Group…" and `meet` is
  * "Meet…" (plan 8X-1B), each of which opens a dialog; `joinform` is the dialog that asks a newcomer
- * which group (no button has it). `group` is the letter Join of a post drawn
+ * which group, `regroupform` Group…'s (no button has either). `group` is the letter Join of a post drawn
  * before plan 8X-1B ("A", "B"): it still joins its letter until the post is shown anew, and is
  * refused as no such group once that letter is gone.
  */
@@ -60,6 +60,7 @@ export const PARTY_ACTIONS = [
   'splitform',
   'regroup',
   'joinform',
+  'regroupform',
   'meet',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
diff --git a/src/services/attendance-service.test.ts b/src/services/attendance-service.test.ts
index 443f2e84411923d01f6f8f2e4d5cd417a38f97b6..db113abd5c3c27a8a50375faaa3e4e192952bf7a 100644
--- a/src/services/attendance-service.test.ts
+++ b/src/services/attendance-service.test.ts
@@ -13,7 +13,7 @@ import { reportedRaid } from '../../test/support/party-service.js';
 import { decodeCustomId } from '../discord/custom-id.js';
 import { completeRaid } from '../domain/party/attendance.js';
 import { WITHDRAWN_LINE } from './attendance-service.js';
-import { attendeeOf, endParty } from '../domain/party/party.js';
+import { attendeeOf, endParty, groupStamp } from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { Member } from './attendance-service.js';
 
@@ -475,13 +475,48 @@ describe('AttendanceService: groups', () => {
     await made.attendance.flush();
     const notice = made.gateway.messagesIn(made.postId).at(-1);
     expect(notice?.message.content).toBe(
-      `**Alice** (<@${ALICE}>) opened group B. To move to it, use its button on the post or \`/group join\`.` +
+      `**Alice** (<@${ALICE}>) opened group B. To move to it, press Group… on the post or use \`/group join\`.` +
         `\n<@${REPORTER}> <@${CAROL}>`,
     );
     expect(notice?.message.mention).toEqual({ users: [REPORTER, CAROL] });
     expect(made.current().defaultGroupId).toBe('B');
   });
 
+  it('opens a group with its label (Group…, plan 8X-1B), and names it in the notice', async () => {
+    const made = await reportedRaid();
+    const id = made.party.id;
+    const outcome = await made.attendance.newGroup(id, alice, 'by the *bridge*');
+    expect(outcome).toMatchObject({ kind: 'ok', group: 'B' });
+    expect(made.current().groups.at(-1)).toMatchObject({ id: 'B', label: 'by the *bridge*' });
+    await made.attendance.flush();
+    expect(made.gateway.messagesIn(made.postId).at(-1)?.message.content).toMatch(
+      new RegExp(
+        `^\\*\\*Alice\\*\\* \\(<@${ALICE}>\\) opened group B \\(by the \\\\\\*bridge\\\\\\*\\)\\. `,
+      ),
+    );
+    expect(await made.attendance.newGroup(id, bob, 'x'.repeat(101))).toEqual({
+      kind: 'refused',
+      reason: 'label-too-long',
+    });
+  });
+
+  it("moves a member by Group…'s choice only to the group of that stamp", async () => {
+    const made = await reportedRaid();
+    const id = made.party.id;
+    await made.attendance.newGroup(id, bob);
+    const b = made.current().groups.find((group) => group.id === 'B');
+    if (!b) throw new Error('no group B');
+    const stamp = groupStamp(made.current(), b);
+    expect(await made.attendance.joinStamped(id, alice, 'B', stamp)).toMatchObject({
+      kind: 'ok',
+      attendee: { group: 'B', status: PartyStatus.Coming },
+    });
+    expect(await made.attendance.joinStamped(id, carol, 'B', 'x')).toEqual({
+      kind: 'refused',
+      reason: 'group-changed',
+    });
+  });
+
   it('keeps the line of naming a group apart from the line of the member coming', async () => {
     const made = await reportedRaid();
     const id = made.party.id;
diff --git a/src/services/attendance-service.ts b/src/services/attendance-service.ts
index dd409cad016921c690c09d017250312471327441..cfc86fe103b06ffc3345d2edd78922be7e81f662 100644
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -10,6 +10,7 @@ import {
   joinGroup,
   joinChosen,
   joinInto,
+  joinStamped,
   labelGroup,
   leaveParty,
   noteMember,
@@ -42,7 +43,7 @@ import {
 import { PartyStatus } from '../domain/party/status.js';
 import type { Logger } from '../log.js';
 import { doer, standingLine } from '../render/activity.js';
-import { completionQuestion, groupWords } from '../render/party-controls.js';
+import { completionQuestion, GROUP_LABEL, groupWords } from '../render/party-controls.js';
 import { LIMITS, memberText, plain, timestamp, withMentions } from '../render/text.js';
 import type { PartyNotifier } from './notify-service.js';
 import { anyParty, pingInMessages, settingsOf, storedChange } from './party-change.js';
@@ -283,14 +284,36 @@ export class AttendanceService {
   }
 
   /**
-   * Opens the next group and moves the member into it. The attendees who have not completed the
-   * raid are told in the post; those who allow it are pinged.
+   * Group…'s move (plan 8X-1B, `joinStamped`): to the group of that letter while it has that
+   * stamp, as `/group join` moves a member.
    */
-  async newGroup(partyId: string, member: Member): Promise<AttendanceOutcome<{ group: GroupId }>> {
+  joinStamped(
+    partyId: string,
+    member: Member,
+    group: GroupId,
+    stamp: string,
+  ): Promise<AttendanceOutcome> {
+    return this.apply(partyId, member, (party) =>
+      isDone(party, member.id)
+        ? refused('already-done')
+        : joinStamped(party, member.id, group, stamp, this.limitsOf(party)),
+    );
+  }
+
+  /**
+   * Opens the next group and moves the member into it, with `label` where given (Group…). The
+   * attendees who have not completed the raid are told in the post; those who allow it are
+   * pinged.
+   */
+  async newGroup(
+    partyId: string,
+    member: Member,
+    label?: string,
+  ): Promise<AttendanceOutcome<{ group: GroupId }>> {
     const outcome = await this.apply(
       partyId,
       member,
-      (party) => createGroup(party, member.id, this.limitsOf(party)),
+      (party) => createGroup(party, member.id, this.limitsOf(party), label),
       'none',
     );
     if (outcome.kind === 'ok' && outcome.acted) {
@@ -634,7 +657,7 @@ export class AttendanceService {
     if (postId === null) return;
     const pingable = await this.pingable(others, (settings) => settings.mentionsGroups);
     if (!this.options.store.get(party.id)) return;
-    const opened = `${memberText(member)} opened group ${group}.`;
+    const opened = `${memberText(member)} opened ${groupWords(groupOf(party, group) ?? { id: group })}.`;
     if (others.length === 0) {
       await this.options.gateway.sendMessage(postId, { content: opened, mention: { users: [] } });
       return;
@@ -643,7 +666,7 @@ export class AttendanceService {
     await this.options.gateway.sendMessage(
       postId,
       withMentions(
-        `${opened} To move to it, use its button on the post or \`/group join\`.`,
+        `${opened} To move to it, press ${GROUP_LABEL} on the post or use \`/group join\`.`,
         pingable,
       ),
     );
````

### Task 5: 8X-1B task 5: Meet... sets the group's meeting time in a dialog

Prototype commit: `0d239934f43a7a38af00a5e1490f092a46863074`

Meet... of a raid with times opens a menu of the meeting time of the
member's own group: the in-game RSVP times (the hatch, then every 15
minutes while the raid lasts: one rule for every tier, rsvpTimes) and
the 5-minute times of the next hour, past times out, at most 24 (the
latest 5-minute times dropped first), the group's own time kept, "No
meeting time" while it has one. The group's time starts chosen, else
the next RSVP time (the hatch on an egg). Refused before it opens: not
signed up, no times, over, no time left. The Submit, a kind of its own
(meet:<party>:time:<group>:<stamp>), decides again and sets the time as
/meet does, in /meet's words, counted in /meet's window: one budget for
both. The router names the command of a varied window in a refusal.
pinemeet is a control icon the uploader does not make yet (no file).

**Files:**

```
 src/commands/parties/meet-dialog.ts | 146 +++++++++++++++++++++++++++++++++++++++++++
 src/commands/parties/meet.ts        |  64 +++++++++++++------
 src/components/index.ts             |   2 +
 src/components/party.meet.test.ts   | 190 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/components/party.ts             |   8 ++-
 src/discord/custom-id.ts            |   9 +++
 src/discord/router.ts               |   4 +-
 src/domain/party/meet-times.test.ts | 118 +++++++++++++++++++++++++++++++++++
 src/domain/party/meet-times.ts      | 135 ++++++++++++++++++++++++++++++++++++++++
 src/domain/party/party.ts           |   2 +
 src/render/activity.ts              |   2 +
 src/render/meet-dialog.test.ts      |  70 +++++++++++++++++++++
 src/render/meet-dialog.ts           |  87 ++++++++++++++++++++++++++
 src/services/attendance-service.ts  |  12 +++-
 test/support/dialogs.ts             |   9 ++-
 15 files changed, 832 insertions(+), 26 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/components/party.meet.test.ts src/domain/party/meet-times.test.ts src/render/meet-dialog.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 0d239934f43a7a38af00a5e1490f092a46863074 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-1B task 5: Meet... sets the group's meeting time in a dialog`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/parties/meet-dialog.ts b/src/commands/parties/meet-dialog.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0cc1bfa76ea280f4c2b9f5690fe347ee8b07b37e
--- /dev/null
+++ b/src/commands/parties/meet-dialog.ts
@@ -0,0 +1,146 @@
+import type { ButtonInteraction, ModalSubmitInteraction } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ComponentHandler } from '../../discord/command.js';
+import { deferSubmit } from '../../discord/dialog.js';
+import { UserError } from '../../discord/errors.js';
+import { requireGuild } from '../../discord/guards.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import { meetTimes } from '../../domain/party/meet-times.js';
+import {
+  attendeeOf,
+  isGroupId,
+  isRaid,
+  type Party,
+  type RaidParty,
+} from '../../domain/party/party.js';
+import { raidStage } from '../../domain/party/raid.js';
+import { problemText } from '../../render/activity.js';
+import {
+  MEET_FORM,
+  MEET_INPUT,
+  MEET_KIND,
+  meetDialog,
+  NO_MEETING,
+} from '../../render/meet-dialog.js';
+import { RAID_IS_OVER } from '../raids/raid-input.js';
+import { MEET_WINDOW, meetingWords } from './meet.js';
+import { actingMember, outcomeWords, partyOver } from './reply.js';
+
+/*
+ * Meet… of a raid's post on Discord (plan 8X-1B, decision 5): the button `party:<id>:meet` opens
+ * the dialog of the meeting time of the member's own group (`meetDialog`); its Submit,
+ * `meet:<id>:time:<group>:<stamp>`, sets it as `/meet` does (`AttendanceService.setMeetingTime`).
+ * The press counts as one of the post's (`ACTION_THROTTLE`), and is refused while `/meet`'s
+ * window is full (`MEET_WINDOW`, the party controls' `checks`); the Submit counts in that window,
+ * so `/meet` and Meet… draw on one budget.
+ */
+
+/** Said at a press for a raid without times (Set time shows in Meet…'s place then). */
+export const NO_TIMES = 'This raid has no times yet: Set time gives them.';
+
+/** Said when no time to meet is left before the raid ends. */
+export const NO_TIME_LEFT = 'There is no time left to meet before this raid ends.';
+
+/**
+ * Why this member may not set a meeting time of this party now (the rules of `/meet`), or the
+ * raid: a party that ended (as a raid's), one that is no raid, a member not signed up, a raid
+ * without times or that is over, one with no time to meet left.
+ */
+function refusalOf(
+  ctx: AppContext,
+  party: Party | undefined,
+  memberId: string,
+  now: number,
+): string | RaidParty {
+  if (!party) return partyOver({ type: 'raid' });
+  if (!isRaid(party)) return STALE_COMPONENT;
+  if (!attendeeOf(party, memberId)) {
+    return problemText('not-attending', ctx.attendance.limits(), 'raid');
+  }
+  if (party.hatchTime === null) return NO_TIMES;
+  if (raidStage(party, now) === 'ended') return RAID_IS_OVER;
+  if (meetTimes(party, now).length === 0) return NO_TIME_LEFT;
+  return party;
+}
+
+/**
+ * Meet… of a raid's post: the dialog of the meeting time of the member's own group; refused
+ * privately before it opens (8S-3's rule) as `refusalOf` says.
+ */
+export async function openMeet(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  partyId: string,
+): Promise<void> {
+  const now = Date.now();
+  const party = refusalOf(ctx, ctx.parties.get(partyId), interaction.user.id, now);
+  if (typeof party === 'string') throw new UserError(party);
+  const groupId = attendeeOf(party, interaction.user.id)?.group ?? party.defaultGroupId;
+  await interaction.showModal(
+    meetDialog({ party, groupId, zone: ctx.config.settings.timezone, now }),
+  );
+}
+
+/** The time a Submit chose: a moment, null for "No meeting time"; undefined for none of either. */
+function chosenTime(interaction: ModalSubmitInteraction): number | null | undefined {
+  if (!interaction.fields.fields.has(MEET_INPUT)) return undefined;
+  const [value] = interaction.fields.getStringSelectValues(MEET_INPUT);
+  if (value === NO_MEETING) return null;
+  const time = Number(value);
+  return Number.isInteger(time) ? time : undefined;
+}
+
+/** What a Submit of Meet…'s dialog is told for a refusal decided inside the store. */
+const MEET_REFUSALS: Partial<Record<string, string>> = {
+  'group-changed': 'Your group changed meanwhile: try again.',
+  'meeting-time-gone': 'That time has passed: try again.',
+};
+
+/**
+ * Submit of Meet…'s dialog: acknowledged privately, the checks of the press made again, then set
+ * or removed as `/meet` does, in its words (`meetingWords`), decided inside the store for the
+ * group the dialog was drawn for (`setMeetingTime` with `drawn`: the member still in that group
+ * by its stamp, the time one Meet… offers now), so a move queued before it is seen.
+ */
+async function submitMeet(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  partyId: string,
+  args: readonly string[],
+): Promise<void> {
+  const [groupId, stamp] = args;
+  const time = chosenTime(interaction);
+  if (groupId === undefined || !isGroupId(groupId) || stamp === undefined || time === undefined) {
+    throw new UserError(STALE_COMPONENT);
+  }
+  await deferSubmit(interaction);
+  const now = Date.now();
+  const member = actingMember(interaction);
+  const party = refusalOf(ctx, ctx.parties.get(partyId), member.id, now);
+  const say = (content: string) => interaction.editReply({ content });
+  if (typeof party === 'string') return void (await say(party));
+  const outcome = await ctx.attendance.setMeetingTime(partyId, member, time, {
+    group: groupId,
+    stamp,
+  });
+  const refusal = outcome.kind === 'refused' ? MEET_REFUSALS[outcome.reason] : undefined;
+  await say(
+    refusal ??
+      outcomeWords(ctx.attendance.limits(), party, outcome, (ok) => meetingWords(ok, member.id))
+        .text,
+  );
+}
+
+/**
+ * The dialog of Meet… (`meet:<party id>:time:<group>:<stamp>`): a kind of its own, so that its
+ * Submit counts in `/meet`'s window (`MEET_WINDOW`; "You can use /meet again in …").
+ */
+export const meetControls: ComponentHandler = {
+  kind: MEET_KIND,
+  guards: [requireGuild],
+  throttle: MEET_WINDOW,
+  async modal(interaction, id, ctx) {
+    if (id.action !== MEET_FORM) throw new UserError(STALE_COMPONENT);
+    await submitMeet(interaction, ctx, id.id, id.args);
+  },
+};
diff --git a/src/commands/parties/meet.ts b/src/commands/parties/meet.ts
index a4dc4159e419044d47c500d115d72a6c8162b273..88f899ac214e58f9019f0618a5dca0bb1827ac90 100644
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -1,12 +1,21 @@
 import { SlashCommandBuilder } from 'discord.js';
-import type { Guard, SimpleCommand } from '../../discord/command.js';
+import type { ControlThrottle, Guard, SimpleCommand } from '../../discord/command.js';
 import { UserError } from '../../discord/errors.js';
 import { partyOf, requireParty } from '../../discord/guards.js';
-import { groupOf, isTimed, mayArrange, membersWhere, partyWord } from '../../domain/party/party.js';
+import {
+  groupOf,
+  isTimed,
+  mayArrange,
+  membersWhere,
+  partyWord,
+  type GroupId,
+  type Party,
+} from '../../domain/party/party.js';
 import { problemText } from '../../render/activity.js';
 import { groupWords } from '../../render/party-controls.js';
 import { timestamp } from '../../render/text.js';
 import { typedPartyTime } from '../raids/raid-input.js';
+import { variedThrottleKey } from '../../discord/router.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { actingMember, answerOutcome, commandParty } from './reply.js';
 import { changeStart, START_THROTTLE, typedTimedTime } from './timed.js';
@@ -17,6 +26,15 @@ import { changeStart, START_THROTTLE, typedTimedTime } from './timed.js';
  */
 export const MEET_THROTTLE: Throttle = { uses: 3, perSeconds: 60 };
 
+/**
+ * The window `/meet` counts its uses in a raid (its throttle varies with the party:
+ * `variedThrottleKey`), which Meet…'s dialog counts in too (plan 8X-1B): one budget for both.
+ */
+export const MEET_WINDOW: ControlThrottle = {
+  ...MEET_THROTTLE,
+  as: variedThrottleKey('meet', MEET_THROTTLE),
+};
+
 /**
  * The limit of `/meet` and `/cancel-meet` where they are used: in a timed party the start is
  * for everybody, and telling of it pings everybody (`START_THROTTLE`, as for a shout).
@@ -91,26 +109,34 @@ export const meet: SimpleCommand = {
       actingMember(interaction),
       typed === 'unset' ? null : typed.at,
     );
-    await answerOutcome(interaction, ctx, party, outcome, (ok) => {
-      const group = groupOf(ok.party, ok.group);
-      const whose =
-        ok.party.groups.length > 1 ? groupWords(group ?? { id: ok.group }) : 'your group';
-      if (group?.startTime === undefined) {
-        return ok.acted
-          ? `The meeting time of ${whose} is cancelled.`
-          : 'There was no meeting time.';
-      }
-      const when = `${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`;
-      const others = membersWhere(ok.party, (attendee) => attendee.group === ok.group).some(
-        (id) => id !== interaction.user.id,
-      );
-      return ok.acted
-        ? `The meeting time of ${whose} is ${when}.${others ? ' I have told the others.' : ''}`
-        : `The meeting time of ${whose} was ${when} already.`;
-    });
+    await answerOutcome(interaction, ctx, party, outcome, (ok) =>
+      meetingWords(ok, interaction.user.id),
+    );
   },
 };
 
+/**
+ * What a member is told of the meeting time of their group they set or removed, by `/meet` and by
+ * Meet…'s dialog alike (plan 8X-1B): the time, and that the others were told.
+ */
+export function meetingWords(
+  ok: { party: Party; group: GroupId; acted: boolean },
+  memberId: string,
+): string {
+  const group = groupOf(ok.party, ok.group);
+  const whose = ok.party.groups.length > 1 ? groupWords(group ?? { id: ok.group }) : 'your group';
+  if (group?.startTime === undefined) {
+    return ok.acted ? `The meeting time of ${whose} is cancelled.` : 'There was no meeting time.';
+  }
+  const when = `${timestamp(group.startTime)} (${timestamp(group.startTime, 'R')})`;
+  const others = membersWhere(ok.party, (attendee) => attendee.group === ok.group).some(
+    (id) => id !== memberId,
+  );
+  return ok.acted
+    ? `The meeting time of ${whose} is ${when}.${others ? ' I have told the others.' : ''}`
+    : `The meeting time of ${whose} was ${when} already.`;
+}
+
 export const cancelMeet: SimpleCommand = {
   data: new SlashCommandBuilder()
     .setName('cancel-meet')
diff --git a/src/components/index.ts b/src/components/index.ts
index 91fa92b465730a78cdd7a8e1ffc4476ed683b93a..e233296792783b05c594bf34755057a55571c7f0 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -29,6 +29,7 @@ import { meetupSafetyControls } from './meetup-safety.js';
 import { reportDecisionControls } from './moderation-reports.js';
 import { scriptAccessControls } from './script-access.js';
 import { partyButtons } from './party.js';
+import { meetControls } from '../commands/parties/meet-dialog.js';
 
 /** Every handler of buttons, select menus and modals. The router reads this list. */
 export const components: readonly ComponentHandler[] = [
@@ -48,6 +49,7 @@ export const components: readonly ComponentHandler[] = [
   targetRemovalControls,
   targetListControls,
   partyButtons,
+  meetControls,
   reportControls,
   closeControls,
   dmControls,
diff --git a/src/components/party.meet.test.ts b/src/components/party.meet.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9630e4ef716c81773776b16b00cd8827619b21f9
--- /dev/null
+++ b/src/components/party.meet.test.ts
@@ -0,0 +1,190 @@
+import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { dialogChoices, dialogOf, shownDialog } from '../../test/support/dialogs.js';
+import {
+  fakeButton,
+  fakeChatInput,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../test/support/fake-interactions.js';
+import { WEST_FORUM } from '../../test/support/gyms.js';
+import { ALICE, BOB, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { meet } from '../commands/parties/meet.js';
+import { meetControls } from '../commands/parties/meet-dialog.js';
+import { InteractionRouter } from '../discord/router.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { MEET_INPUT, NO_MEETING } from '../render/meet-dialog.js';
+import { timestamp } from '../render/text.js';
+import { partyButtons } from './party.js';
+
+const HATCH = PARTY_NOW + 30 * MINUTE;
+
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+});
+afterEach(() => {
+  vi.restoreAllMocks();
+  vi.useRealTimers();
+});
+
+/** An egg hatching in half an hour, Alice coming, with the post's controls and `/meet` routed. */
+async function setup(report: Parameters<typeof reportedRaid>[0] = { time: { hatch: HATCH } }) {
+  const made = await reportedRaid(report);
+  await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    parties: made.store,
+    regions: made.regions,
+  });
+  const router = new InteractionRouter(ctx, [meet], [partyButtons, meetControls]);
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const press = (userId = ALICE) =>
+    handle(
+      fakeButton({
+        customId: `party:${made.party.id}:meet`,
+        channelId: made.postId,
+        userId,
+        displayName: 'Alice',
+      }),
+    );
+  const submit = (dialog: APIModalInteractionResponseCallbackData, value: string, userId = ALICE) =>
+    handle(
+      fakeModal({
+        customId: dialog.custom_id,
+        form: dialog,
+        selected: { [MEET_INPUT]: [value] },
+        channelId: made.postId,
+        userId,
+        displayName: 'Alice',
+      }),
+    );
+  const typed = (time: string) =>
+    handle(
+      fakeChatInput({
+        commandName: 'meet',
+        channelId: made.postId,
+        thread: { parentId: WEST_FORUM },
+        userId: ALICE,
+        displayName: 'Alice',
+        options: { time },
+      }),
+    );
+  return { ...made, press, submit, typed };
+}
+
+const answerOf = (submitted: FakeInteraction) => sent(submitted.editReply).content;
+
+describe('Meet… (plan 8X-1B, decision 5)', () => {
+  it('opens the dialog of the member’s group, the hatch chosen to start with on an egg', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.press());
+    expect(dialog.title).toBe('Meeting time');
+    expect(dialogChoices(dialog).find(({ picked }) => picked)?.value).toBe(String(HATCH));
+  });
+
+  it('sets the group’s meeting time as /meet does, and says so in /meet’s words', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.press());
+    const at = HATCH + 15 * MINUTE;
+    const submitted = await made.submit(dialog, String(at));
+    expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(answerOf(submitted)).toBe(
+      `The meeting time of your group is ${timestamp(at)} (${timestamp(at, 'R')}). I have told the others.`,
+    );
+    expect(made.current().groups[0]?.startTime).toBe(at);
+    await made.attendance.flush();
+    expect(made.said().at(-1)).toMatch(/set the meeting time: <t:\d+:t>/);
+    // And removes it again.
+    const again = shownDialog(await made.press());
+    expect(dialogChoices(again).at(-1)?.value).toBe(NO_MEETING);
+    const removed = await made.submit(again, NO_MEETING);
+    expect(answerOf(removed)).toBe('The meeting time of your group is cancelled.');
+    expect(made.current().groups[0]?.startTime).toBeUndefined();
+  });
+
+  it('refuses before the dialog opens: not signed up, a raid without times, no time left', async () => {
+    const made = await setup();
+    const stranger = await made.press(BOB);
+    expect(dialogOf(stranger)).toBeUndefined();
+    expect(sent(stranger.reply).content).toBe('You are not signed up for this raid.');
+    const untimed = await setup({});
+    const pressed = await untimed.press();
+    expect(dialogOf(pressed)).toBeUndefined();
+    expect(sent(pressed.reply).content).toBe('This raid has no times yet: Set time gives them.');
+    vi.setSystemTime(HATCH + 44 * MINUTE + 30_000);
+    const late = await made.press();
+    expect(dialogOf(late)).toBeUndefined();
+    expect(sent(late.reply).content).toBe('There is no time left to meet before this raid ends.');
+  });
+
+  it('refuses a Submit for a group the member left meanwhile, and a time that passed', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.press());
+    await made.attendance.newGroup(made.party.id, { id: ALICE, name: 'Alice' });
+    expect(answerOf(await made.submit(dialog, String(HATCH)))).toBe(
+      'Your group changed meanwhile: try again.',
+    );
+    const own = shownDialog(await made.press());
+    vi.setSystemTime(HATCH + MINUTE);
+    made.clock.now = HATCH + MINUTE;
+    expect(answerOf(await made.submit(own, String(HATCH)))).toBe(
+      'That time has passed: try again.',
+    );
+    expect(made.current().groups.every((group) => group.startTime === undefined)).toBe(true);
+  });
+
+  it('decides in the store: a Group… move queued before the Submit has it refused', async () => {
+    const made = await setup();
+    const dialog = shownDialog(await made.press());
+    // Alice's move to a new group is on its way: its write waits until the Submit has asked
+    // the store (the second change asked of it), so the Submit's own checks see her in A.
+    let release: () => void = () => undefined;
+    const held = new Promise<void>((resolve) => {
+      release = resolve;
+    });
+    const save = made.storage.save.bind(made.storage);
+    let first = true;
+    vi.spyOn(made.storage, 'save').mockImplementation(async (party, note) => {
+      if (first) {
+        first = false;
+        await held;
+      }
+      return save(party, note);
+    });
+    const update = made.store.update.bind(made.store);
+    let asked = 0;
+    vi.spyOn(made.store, 'update').mockImplementation(
+      (id: string, change: Parameters<typeof update>[1]) => {
+        asked += 1;
+        const result = update(id, change);
+        if (asked === 2) release();
+        return result;
+      },
+    );
+    const moving = made.attendance.newGroup(made.party.id, { id: ALICE, name: 'Alice' });
+    const submitted = await made.submit(dialog, String(HATCH));
+    await moving;
+    expect(answerOf(submitted)).toBe('Your group changed meanwhile: try again.');
+    expect(made.current().groups.every((group) => group.startTime === undefined)).toBe(true);
+  });
+
+  it('draws on the budget of /meet: three a minute, press and command alike', async () => {
+    const made = await setup();
+    for (const time of ['3:00pm', '3:05pm']) await made.typed(time);
+    const dialog = shownDialog(await made.press());
+    await made.submit(dialog, String(HATCH));
+    // The fourth use, by the button: refused before its dialog opens.
+    const fourth = await made.press();
+    expect(dialogOf(fourth)).toBeUndefined();
+    expect(sent(fourth.reply).content).toBe('You can use /meet again in 1 minute.');
+    const command = await made.typed('3:10pm');
+    expect(sent(command.reply).content).toBe('You can use /meet again in 1 minute.');
+  });
+});
diff --git a/src/components/party.ts b/src/components/party.ts
index cc49e1375dd2c0d2c1dd0891bbeb67d70b6a9f03..22bebbc6045e148b52ecd4cc3acd0b882504b079 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -20,6 +20,8 @@ import {
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import { showWholeRoute } from '../commands/trains/route.js';
 import { openSplit, submitSplit } from '../commands/trains/split.js';
+import { MEET_WINDOW } from '../commands/parties/meet.js';
+import { openMeet } from '../commands/parties/meet-dialog.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
 import { notARaid, requireGuild } from '../discord/guards.js';
@@ -57,6 +59,8 @@ export const partyButtons: ComponentHandler = {
   kind: PARTY_KIND,
   guards: [requireGuild],
   throttle: ACTION_THROTTLE,
+  // Meet… opens a dialog whose Submit counts in `/meet`'s window: refused while it is full.
+  checks: (_interaction, id) => (id.action === 'meet' ? MEET_WINDOW : undefined),
 
   async button(interaction, id, ctx) {
     const { attendance } = ctx;
@@ -164,8 +168,8 @@ export const partyButtons: ComponentHandler = {
         // Only Group…'s dialog has this action.
         throw new UserError(STALE_COMPONENT);
       case 'meet':
-        // "Meet…" (plan 8X-1B): its dialog comes with its task.
-        throw new UserError(STALE_COMPONENT);
+        // "Meet…" (plan 8X-1B): the meeting time of the member's group, in a dialog.
+        return openMeet(interaction, ctx, partyId);
       case 'answer': {
         const [answer] = id.args;
         if (answer !== 'yes' && answer !== 'no') throw new UserError(STALE_COMPONENT);
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 6f52a460579b09f6d42fdb9623435edbda24bdd2..8d18d3df722655863425616c5ce4e4900ec4c3e3 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -81,6 +81,15 @@
  * `party:<id>:splitform:<group>:<mark>` (the group's letter and `groupMark`, so that a Submit
  * for a group called otherwise, gone, or given its letter again after a split is refused), of
  * several `party:<id>:splitform`, whose radio group's value is `<group>:<mark>`.
+ * Plan 8X-1B: Interested, Join and Here of a newcomer to a post of several groups open
+ * `party:<id>:joinform:<maybe|join|here>` (the button pressed), whose radio group `group` is `any`
+ * or `<group>:<stamp>` (the group's letter and when it was opened, in base 36: a letter can be
+ * given again once its group went); "Group…" is `party:<id>:regroup` and its dialog
+ * `party:<id>:regroupform[:new | :<group>:<stamp>]` (the one way where it asks nothing), its
+ * radio group `group` (`new` or `<group>:<stamp>`) and line `label`; "Meet…" is
+ * `party:<id>:meet`, its dialog a kind of its own, `meet:<party id>:time:<group>:<stamp>`, so
+ * that its Submit counts in `/meet`'s window, its menu `time` (a moment in ms, or `none`). The
+ * letter Join of a post drawn before, `party:<id>:group:<letter>`, still joins its letter.
  *
  * The buttons of a member's own list have the kinds `wantlist` (`/wants`) and `targetlist`
  * (`/targets`; the kinds `wants` and `targets` are the dialogs of `/unwant-all` and
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 3ccde3f67830174f09d081cc05b0982218eec773..92e17b4546ee2f771e5a9b276a904f5bb59af163 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -585,9 +585,11 @@ function commandRefusal(name: string, wait: string): string {
 
 /** What a member is told who used a control too often: as a command's use where it counts as one. */
 function controlRefusal(throttle: ControlThrottle, wait: string): string {
+  // A command whose limit varies counts in a window of its name and limit
+  // (`variedThrottleKey`): the member is told the name (Meet… in `/meet`'s, plan 8X-1B).
   return throttle.as === undefined
     ? `That was a lot of clicks. Try again in ${wait}.`
-    : commandRefusal(throttle.as, wait);
+    : commandRefusal(throttle.as.split('\n')[0] ?? throttle.as, wait);
 }
 
 /** What the handler does with this kind of control; undefined when it has nothing for it. */
diff --git a/src/domain/party/meet-times.test.ts b/src/domain/party/meet-times.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..52284035997cfc2c413720bb056f3155c2debfad
--- /dev/null
+++ b/src/domain/party/meet-times.test.ts
@@ -0,0 +1,118 @@
+import { describe, expect, it } from 'vitest';
+import { at, PARTY_ZONE } from '../../../test/support/parties.js';
+import { MAX_MEET_TIMES, meetTimes, rsvpTimes } from './meet-times.js';
+
+const MINUTE = 60_000;
+const HATCH = at('2026-10-13T19:22');
+const END = HATCH + 45 * MINUTE;
+const raid = { hatchTime: HATCH, endTime: END };
+/** The clock times of these choices, `19:22`, in the test zone. */
+const clocks = (times: readonly { at: number }[]) =>
+  times.map(({ at: time }) =>
+    new Date(time).toLocaleTimeString('en-GB', {
+      timeZone: PARTY_ZONE,
+      hour: '2-digit',
+      minute: '2-digit',
+    }),
+  );
+
+describe('rsvpTimes: the times the game offers to RSVP for a raid', () => {
+  it('are the hatch and every 15 minutes after it while the raid lasts', () => {
+    expect(clocks(rsvpTimes(raid).map((time) => ({ at: time })))).toEqual([
+      '19:22',
+      '19:37',
+      '19:52',
+    ]);
+    // A raid of 90 minutes: the same steps (assumed for every tier; Matt checks).
+    const long = { hatchTime: HATCH, endTime: HATCH + 90 * MINUTE };
+    expect(rsvpTimes(long)).toHaveLength(6);
+  });
+
+  it('are none for a raid without times', () => {
+    expect(rsvpTimes({ hatchTime: null, endTime: null })).toEqual([]);
+  });
+});
+
+describe('meetTimes: the choices of Meet…', () => {
+  it('merges the RSVP times and the 5-minute times of the next hour, in time order, from now', () => {
+    const now = at('2026-10-13T19:28');
+    const times = meetTimes(raid, now);
+    expect(clocks(times)).toEqual([
+      '19:30',
+      '19:35',
+      '19:37',
+      '19:40',
+      '19:45',
+      '19:50',
+      '19:52',
+      '19:55',
+      '20:00',
+      '20:05',
+    ]);
+    expect(times.filter((time) => time.rsvp).map((time) => time.at)).toEqual([
+      HATCH + 15 * MINUTE,
+      HATCH + 30 * MINUTE,
+    ]);
+    // Nothing past, nothing at or after the end.
+    expect(times.every((time) => time.at > now && time.at < END)).toBe(true);
+  });
+
+  it('starts on an egg at its hatch, and has no time before it', () => {
+    const now = at('2026-10-13T18:56');
+    const times = meetTimes(raid, now);
+    expect(times[0]).toEqual({ at: HATCH, rsvp: true, hatch: true });
+    expect(times.every((time) => time.at >= HATCH)).toBe(true);
+    // The next hour only: up to 19:55.
+    expect(clocks(times).at(-1)).toBe('19:55');
+  });
+
+  it('keeps a meeting time set off the grid among them', () => {
+    const now = at('2026-10-13T19:28');
+    const set = at('2026-10-13T19:41');
+    expect(meetTimes(raid, now, set).find((time) => time.at === set)).toEqual({
+      at: set,
+      rsvp: false,
+    });
+    // Not one that has passed.
+    expect(meetTimes(raid, now, at('2026-10-13T19:25')).map((time) => time.at)).not.toContain(
+      at('2026-10-13T19:25'),
+    );
+  });
+
+  it('holds at most 24, dropping the furthest 5-minute times first, never an RSVP time', () => {
+    // A raid of four hours, a minute after its hatch: 15 RSVP times to come, 12 of the grid
+    // within the hour, and a time set off the grid: four too many.
+    const long = { hatchTime: HATCH, endTime: HATCH + 240 * MINUTE };
+    const set = at('2026-10-13T19:43');
+    const times = meetTimes(long, HATCH + MINUTE, set);
+    expect(times).toHaveLength(MAX_MEET_TIMES);
+    expect(MAX_MEET_TIMES).toBe(24);
+    expect(times.filter((time) => time.rsvp)).toHaveLength(15);
+    expect(times.map((time) => time.at)).toContain(set);
+    // The grid's latest given up: 20:05 to 20:20.
+    const grid = clocks(times.filter((time) => !time.rsvp && time.at !== set));
+    expect(grid).toEqual(['19:25', '19:30', '19:35', '19:40', '19:45', '19:50', '19:55', '20:00']);
+    expect(times.map((time) => time.at)).toEqual(
+      [...times.map((time) => time.at)].sort((a, b) => a - b),
+    );
+  });
+
+  it('keeps the earliest RSVP times when even they are too many, and the time set', () => {
+    // A raid of eight hours: 31 RSVP times to come.
+    const long = { hatchTime: HATCH, endTime: HATCH + 8 * 60 * MINUTE };
+    const set = at('2026-10-13T19:43');
+    const times = meetTimes(long, HATCH + MINUTE, set);
+    expect(times).toHaveLength(MAX_MEET_TIMES);
+    expect(times.map((time) => time.at)).toContain(set);
+    const rsvp = times.filter((time) => time.rsvp).map((time) => time.at);
+    expect(rsvp).toEqual(
+      Array.from({ length: MAX_MEET_TIMES - 1 }, (_, n) => HATCH + (n + 1) * 15 * MINUTE),
+    );
+    expect(meetTimes(long, HATCH + MINUTE)).toHaveLength(MAX_MEET_TIMES);
+  });
+
+  it('is empty once no time is left before the end', () => {
+    expect(meetTimes(raid, END - MINUTE)).toEqual([]);
+    expect(meetTimes({ hatchTime: null, endTime: null }, HATCH)).toEqual([]);
+  });
+});
diff --git a/src/domain/party/meet-times.ts b/src/domain/party/meet-times.ts
new file mode 100644
index 0000000000000000000000000000000000000000..84875a01ecd225ca8760900fb29e592fcbc81953
--- /dev/null
+++ b/src/domain/party/meet-times.ts
@@ -0,0 +1,135 @@
+import { setMeetingTime } from './attendance.js';
+import {
+  attendeeOf,
+  groupOf,
+  refused,
+  stampedGroup,
+  type Change,
+  type GroupId,
+  type Party,
+} from './party.js';
+
+/*
+ * The meeting times Meet… offers (plan 8X-1B, decisions 5 and 8): the game's in-game RSVP times of
+ * a raid and the round clock times between them, as a choice, so that nobody types.
+ */
+
+const MINUTE = 60_000;
+
+/**
+ * The game offers to RSVP for a raid every this many minutes from its hatch. Assumed the same for
+ * every tier and length of raid: Matt checks on a Wednesday evening whether raids of other
+ * lengths offer other times (design, decision 5). The one place to change it.
+ */
+export const RSVP_STEP_MINUTES = 15;
+
+/** The round clock times Meet… offers between the RSVP times: every this many minutes. */
+const GRID_MINUTES = 5;
+
+/** How far ahead Meet… offers round clock times: the next hour (decision 8). */
+const GRID_AHEAD_MINUTES = 60;
+
+/**
+ * At most this many times Meet… offers (decision 8): a menu holds 25 options, and "No meeting
+ * time" is one.
+ */
+export const MAX_MEET_TIMES = 24;
+
+/** What Meet… is drawn from of a raid: its times. */
+export interface MeetRaid {
+  hatchTime: number | null;
+  endTime: number | null;
+}
+
+/**
+ * The in-game RSVP times of a raid: its hatch, then every `RSVP_STEP_MINUTES` while it lasts
+ * (before its end). None for a raid without times.
+ */
+export function rsvpTimes(raid: MeetRaid): number[] {
+  const { hatchTime, endTime } = raid;
+  if (hatchTime === null || endTime === null) return [];
+  const times: number[] = [];
+  for (let time = hatchTime; time < endTime; time += RSVP_STEP_MINUTES * MINUTE) times.push(time);
+  return times;
+}
+
+/** A time Meet… offers: an in-game RSVP time (`rsvp`), the hatch among them (`hatch`). */
+export interface MeetTime {
+  at: number;
+  rsvp: boolean;
+  hatch?: true;
+}
+
+/**
+ * The times Meet… offers now (decision 8), in time order: every in-game RSVP time to come
+ * (`rsvpTimes`), and the round clock times every `GRID_MINUTES` of the next hour, all after
+ * `now`, not before the hatch (a meeting time lies between the hatch and the end, as `/meet`'s)
+ * and before the end; with `set`, the group's meeting time where it is still to come, also off
+ * that grid (one set through `/meet`). At most `MAX_MEET_TIMES`: the latest round clock times go
+ * first, then, where even the RSVP times are too many (a long raid), the latest of them; never
+ * the one set. Empty for a raid without times or with no time left.
+ */
+export function meetTimes(raid: MeetRaid, now: number, set?: number): MeetTime[] {
+  const { hatchTime, endTime } = raid;
+  if (hatchTime === null || endTime === null) return [];
+  const fits = (time: number): boolean => time > now && time >= hatchTime && time < endTime;
+  const rsvp = rsvpTimes(raid).filter(fits);
+  const step = GRID_MINUTES * MINUTE;
+  const grid: number[] = [];
+  for (
+    let time = Math.ceil((now + 1) / step) * step;
+    time <= now + GRID_AHEAD_MINUTES * MINUTE;
+    time += step
+  ) {
+    if (fits(time) && !rsvp.includes(time) && time !== set) grid.push(time);
+  }
+  const kept = set !== undefined && fits(set) && !rsvp.includes(set) ? [set] : [];
+  // Even the RSVP times may be too many (a long raid): the earliest stay, and the one set.
+  const first = rsvp.slice(0, MAX_MEET_TIMES - kept.length);
+  const shown =
+    set !== undefined && rsvp.includes(set) && !first.includes(set)
+      ? [...first.slice(0, -1), set]
+      : first;
+  const room = Math.max(0, MAX_MEET_TIMES - shown.length - kept.length);
+  const times: MeetTime[] = [
+    ...shown.map((time) => ({
+      at: time,
+      rsvp: true,
+      ...(time === hatchTime ? { hatch: true as const } : {}),
+    })),
+    ...grid.slice(0, room).map((time) => ({ at: time, rsvp: false })),
+    ...kept.map((time) => ({ at: time, rsvp: false })),
+  ];
+  return times.sort((a, b) => a.at - b.at);
+}
+
+/** The group Meet…'s dialog was drawn for: its letter and stamp (`groupStamp`). */
+export interface MeetDrawn {
+  group: GroupId;
+  stamp: string;
+}
+
+/**
+ * The Submit of Meet…'s dialog, decided inside the store (plan 8X-1B): the meeting time of the
+ * member's own group while it is still the group the dialog was drawn for (a move or a group
+ * opened again meanwhile: `group-changed`), and a time Meet… still offers now (else
+ * `meeting-time-gone`; null removes it), as `/meet` sets it (`setMeetingTime`).
+ */
+export function setMeetingTimeAsDrawn<P extends Party>(
+  party: P,
+  memberId: string,
+  drawn: MeetDrawn,
+  time: number | null,
+  now: number,
+): Change<P, { group: GroupId; others: string[] }> {
+  const attendee = attendeeOf(party, memberId);
+  if (!attendee) return refused('not-attending');
+  if (attendee.group !== drawn.group || !stampedGroup(party, drawn.group, drawn.stamp)) {
+    return refused('group-changed');
+  }
+  const set = groupOf(party, drawn.group)?.startTime;
+  if (time !== null && !meetTimes(party, now, set).some((offered) => offered.at === time)) {
+    return refused('meeting-time-gone');
+  }
+  return setMeetingTime(party, memberId, time);
+}
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index a134a6ffb01b0ed9bb4c45d4999ccc3b80f85ce7..59559f339201d9a8c0f129e2fd5c32e17812e5c4 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -593,6 +593,8 @@ export type PartyProblem =
    * called otherwise now): the Submit would split off something it did not show.
    */
   | 'group-changed'
+  /** The meeting time Meet… showed is one it no longer offers (it passed, plan 8X-1B). */
+  | 'meeting-time-gone'
   /**
    * A change of a timed party drawn from a name, information or time it no longer has (the live
    * map's meetup editor): another change came meanwhile.
diff --git a/src/render/activity.ts b/src/render/activity.ts
index 195e449589009926b2d9f323dda8677eacc708a8..afb1f9daf3afa6b247d46d08dfd4437a95503e5a 100644
--- a/src/render/activity.ts
+++ b/src/render/activity.ts
@@ -218,6 +218,8 @@ export function problemText(
       return 'The conductor is in that group: only they and the moderators can split it off.';
     case 'group-changed':
       return `The groups of this ${word} changed meanwhile.`;
+    case 'meeting-time-gone':
+      return 'That time has passed.';
     case 'changed-meanwhile':
       return `This ${word} changed meanwhile: here it is as it is now.`;
   }
diff --git a/src/render/meet-dialog.test.ts b/src/render/meet-dialog.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a49c5cd3cae2989231365f900d32a107f178ff7f
--- /dev/null
+++ b/src/render/meet-dialog.test.ts
@@ -0,0 +1,70 @@
+import { describe, expect, it } from 'vitest';
+import { dialogChoices, dialogTexts } from '../../test/support/dialogs.js';
+import { checkModal } from '../../test/support/fake-interactions.js';
+import { at, PARTY_ZONE, testRaid, testRaidRules } from '../../test/support/parties.js';
+import { decodeCustomId } from '../discord/custom-id.js';
+import type { RaidParty } from '../domain/party/party.js';
+import { setHatchTime } from '../domain/party/raid.js';
+import { meetDialog, NO_MEETING } from './meet-dialog.js';
+
+const HATCH = at('2026-10-13T14:30');
+const raid: RaidParty = setHatchTime(testRaid(), HATCH, testRaidRules(), at('2026-10-13T14:00'));
+
+describe('meetDialog', () => {
+  it('asks for the meeting time of the member’s group in a menu, the hatch first on an egg', () => {
+    const now = at('2026-10-13T14:12');
+    const dialog = meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now });
+    checkModal(dialog);
+    expect(dialog.title).toBe('Meeting time');
+    expect(decodeCustomId(dialog.custom_id)).toEqual({
+      kind: 'meet',
+      id: raid.id,
+      action: 'time',
+      args: ['A', raid.createdAt.toString(36)],
+    });
+    expect(dialogTexts(dialog)).toEqual(['For your group: everybody in it is told.']);
+    const choices = dialogChoices(dialog);
+    expect(choices[0]).toEqual({
+      value: String(HATCH),
+      label: 'At hatch (2:30 PM) · in-game RSVP',
+      description: undefined,
+      picked: true,
+    });
+    expect(choices.map(({ label }) => label).slice(1, 5)).toEqual([
+      '2:35 PM',
+      '2:40 PM',
+      '2:45 PM · in-game RSVP',
+      '2:50 PM',
+    ]);
+    // Nobody has set one: nothing to remove.
+    expect(choices.map(({ value }) => value)).not.toContain(NO_MEETING);
+  });
+
+  it('names the group where there are several, and starts at its time, with a way to remove it', () => {
+    const set = at('2026-10-13T14:52');
+    const grouped: RaidParty = {
+      ...raid,
+      groups: [{ id: 'A' }, { id: 'B', opened: raid.createdAt + 1, startTime: set }],
+    };
+    const now = at('2026-10-13T14:40');
+    const dialog = meetDialog({ party: grouped, groupId: 'B', zone: PARTY_ZONE, now });
+    checkModal(dialog);
+    expect(dialog.title).toBe('Meeting time for group B');
+    const choices = dialogChoices(dialog);
+    expect(choices.filter(({ picked }) => picked)).toEqual([
+      {
+        value: String(set),
+        label: '2:52 PM',
+        description: "Your group's meeting time now",
+        picked: true,
+      },
+    ]);
+    expect(choices.at(-1)).toMatchObject({ value: NO_MEETING, label: 'No meeting time' });
+  });
+
+  it('starts at the next in-game RSVP time on a hatched raid without a meeting time', () => {
+    const now = at('2026-10-13T14:31');
+    const choices = dialogChoices(meetDialog({ party: raid, groupId: 'A', zone: PARTY_ZONE, now }));
+    expect(choices.find(({ picked }) => picked)?.label).toBe('2:45 PM · in-game RSVP');
+  });
+});
diff --git a/src/render/meet-dialog.ts b/src/render/meet-dialog.ts
new file mode 100644
index 0000000000000000000000000000000000000000..20fd5bd801fdfd9794deb912ee8355a4f21a032b
--- /dev/null
+++ b/src/render/meet-dialog.ts
@@ -0,0 +1,87 @@
+import type { APIModalInteractionResponseCallbackData } from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import { dialog, type DialogOption } from '../discord/dialog.js';
+import { meetTimes, type MeetTime } from '../domain/party/meet-times.js';
+import { groupOf, groupStamp, type GroupId, type RaidParty } from '../domain/party/party.js';
+import { clockText } from './text.js';
+
+/*
+ * Meet…'s dialog (plan 8X-1B, decisions 5 and 8; design
+ * `2026-10-20-join-group-meet-buttons-design.md`): the meeting time of the member's own group,
+ * chosen from the game's in-game RSVP times and the round clock times between them.
+ */
+
+/**
+ * The custom-id kind of Meet…'s dialog: a kind of its own, not the party controls', so that its
+ * Submit counts in `/meet`'s window (`MEET_WINDOW`), as `/meet` itself does.
+ */
+export const MEET_KIND = 'meet';
+
+/** The custom-id action of the dialog: `meet:<party id>:time:<group>:<stamp>`. */
+export const MEET_FORM = 'time';
+
+/** The menu of the times. */
+export const MEET_INPUT = 'time';
+
+/** The choice that removes the group's meeting time. */
+export const NO_MEETING = 'none';
+
+/** What Meet…'s dialog is drawn from. */
+export interface MeetDialogView {
+  party: RaidParty;
+  /** The member's own group. */
+  groupId: GroupId;
+  /** The settings' time zone: the choices name clock times. */
+  zone: string;
+  now: number;
+}
+
+/** A time as its choice names it: `At hatch (7:22 PM) · in-game RSVP`, `7:37 PM · in-game RSVP`. */
+function timeLabel(time: MeetTime, zone: string): string {
+  const clock = clockText(time.at, zone);
+  if (time.hatch) return `At hatch (${clock}) · in-game RSVP`;
+  return time.rsvp ? `${clock} · in-game RSVP` : clock;
+}
+
+/**
+ * Meet…'s dialog for the member's group: titled `Meeting time for group B` (`Meeting time` with
+ * one group), `For your group: everybody in it is told.`, and the menu "When does your group
+ * meet?" of `meetTimes` in time order (the group's own time among them, said so) and, while the
+ * group has one, "No meeting time" last. The group's time is chosen to start with, else the next
+ * in-game RSVP time (the hatch on an egg: the most common meeting time), else the first. A menu
+ * keeps its order, so its start is marked only (Discord's `default`). Its custom id names the
+ * group by its letter and stamp: a Submit for a group that went is refused.
+ */
+export function meetDialog(view: MeetDialogView): APIModalInteractionResponseCallbackData {
+  const { party, groupId, zone, now } = view;
+  const group = groupOf(party, groupId);
+  const set = group?.startTime;
+  const times = meetTimes(party, now, set);
+  const options: DialogOption[] = [
+    ...times.map((time) => ({
+      value: String(time.at),
+      label: timeLabel(time, zone),
+      ...(time.at === set ? { description: "Your group's meeting time now" } : {}),
+    })),
+    ...(set === undefined ? [] : [{ value: NO_MEETING, label: 'No meeting time' }]),
+  ];
+  const start =
+    times.find((time) => time.at === set) ?? times.find((time) => time.rsvp) ?? times[0];
+  return dialog({
+    customId: encodeCustomId({
+      kind: MEET_KIND,
+      id: party.id,
+      action: MEET_FORM,
+      args: [groupId, group ? groupStamp(party, group) : '0'],
+    }),
+    title: party.groups.length > 1 ? `Meeting time for group ${groupId}` : 'Meeting time',
+    text: 'For your group: everybody in it is told.',
+    choice: {
+      id: MEET_INPUT,
+      label: 'When does your group meet?',
+      menu: true,
+      options,
+      ...(start === undefined ? {} : { picked: String(start.at) }),
+    },
+  });
+}
diff --git a/src/services/attendance-service.ts b/src/services/attendance-service.ts
index cfc86fe103b06ffc3345d2edd78922be7e81f662..84a851a6da7ac5fd604581bd648bcc2100621a71 100644
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -27,6 +27,7 @@ import {
   withdrawQuestions,
 } from '../domain/party/attendance.js';
 import { lobbySize } from '../domain/party/lobby.js';
+import { setMeetingTimeAsDrawn, type MeetDrawn } from '../domain/party/meet-times.js';
 import {
   attendeeOf,
   groupOf,
@@ -352,21 +353,28 @@ export class AttendanceService {
   /**
    * Sets the meeting time of the member's own group, or removes it with null. The others of the
    * group who have not completed the raid are told in the post; those who allow it are pinged.
-   * `changed` is false when the group already had that time (or none).
+   * `changed` is false when the group already had that time (or none). With `drawn` (Meet…'s
+   * Submit) it is decided for that group, by its stamp, and a time Meet… offers now
+   * (`setMeetingTimeAsDrawn`).
    */
   async setMeetingTime(
     partyId: string,
     member: Member,
     time: number | null,
+    drawn?: MeetDrawn,
   ): Promise<AttendanceOutcome<{ group: GroupId; others: string[] }>> {
     const seen: { before?: number | undefined } = {};
+    const now = this.now();
     const outcome = await this.apply(
       partyId,
       member,
       (party) => {
         const group = attendeeOf(party, member.id)?.group;
         seen.before = group === undefined ? undefined : groupOf(party, group)?.startTime;
-        return setMeetingTime(party, member.id, time);
+        // Meet…'s Submit (plan 8X-1B): decided here, for the group its dialog was drawn for.
+        return drawn === undefined
+          ? setMeetingTime(party, member.id, time)
+          : setMeetingTimeAsDrawn(party, member.id, drawn, time, now);
       },
       'none',
     );
diff --git a/test/support/dialogs.ts b/test/support/dialogs.ts
index f66dab1d0f33438082cdbaf0b25779f806f12ba7..f1933deea27f3f0bdae59fd6cc8d631e98a58eb8 100644
--- a/test/support/dialogs.ts
+++ b/test/support/dialogs.ts
@@ -37,10 +37,15 @@ export interface DialogChoice {
   picked: boolean;
 }
 
-/** The choices of a dialog's radio groups, in their order. */
+/**
+ * The choices of a dialog's radio groups and string selects (a menu, plan 8X-1B: Meet…), in
+ * their order; `picked` is a radio choice or a menu option marked to start chosen (`default`).
+ */
 export function dialogChoices(dialog: APIModalInteractionResponseCallbackData): DialogChoice[] {
   return dialog.components.flatMap((component) =>
-    component.type === ComponentType.Label && component.component.type === ComponentType.RadioGroup
+    component.type === ComponentType.Label &&
+    (component.component.type === ComponentType.RadioGroup ||
+      component.component.type === ComponentType.StringSelect)
       ? component.component.options.map((option) => ({
           value: option.value,
           label: option.label,
````

### Task 6: 8X-1B task 6: the map asks a newcomer which group; help and docs

Prototype commit: `3cb122c2cacc9dd6c26c8fdf2167f9cbce2966d5`

The live map's popup has one Interested, Join and Here, as the post
has, and asks a member who is not signed up for a party of several
groups which group, in a menu before the buttons, in the post's dialog's
order (any group with room first where groups have a size, then the
newest group). The press body takes a group with join, interested and
here, and each follows the dialog's rule (joinChosen by the group's
letter: a member signed up meanwhile keeps their group); joinInto is
left to the old letter buttons of posts drawn before. /group's and the
sign-up commands' help say how a newcomer is placed and name Group...;
/meet's names the button. The area files describe the one layout, the
groups' stamps and pruning, silent placement, the three dialogs,
dialog()'s default and menu, the press body and the history's meeting
times.

**Files:**

```
 docs/architecture/discord-framework.md |  2 +-
 docs/architecture/history.md           |  2 +-
 docs/architecture/parties-and-posts.md | 12 +++++++-----
 docs/architecture/testing.md           |  2 +-
 docs/architecture/trains.md            |  8 ++++----
 docs/architecture/web.md               |  4 ++--
 src/commands/parties/attendance.ts     |  5 ++++-
 src/commands/parties/group.ts          |  8 +++++---
 src/commands/parties/meet.ts           |  3 ++-
 src/commands/parties/reply.ts          | 26 ++++++++++++++++++++++----
 src/domain/party/attendance.ts         | 12 +++++++++---
 src/domain/party/party.ts              | 12 ++++++++++++
 src/domain/web/party-data.ts           | 18 +++++++++++++++++-
 src/domain/web/party-view.test.ts      | 27 +++++++++++++++++++++++----
 src/domain/web/party-view.ts           | 42 +++++++++++++++++++++++++++++++++---------
 src/render/group-dialogs.ts            | 10 +---------
 src/web/client/parties.test.ts         | 27 +++++++++++++++++++++++++++
 src/web/client/parties.ts              | 48 +++++++++++++++++++++++++++++++++++++-----------
 src/web/client/party-layer.ts          |  8 +++++++-
 src/web/party-press.test.ts            | 30 ++++++++++++++++++++++++++++--
 src/web/party-routes.ts                | 21 ++++++++++++++++-----
 test/support/web.ts                    |  4 ++++
 22 files changed, 263 insertions(+), 68 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/parties.test.ts src/web/party-press.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3cb122c2cacc9dd6c26c8fdf2167f9cbce2966d5 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8X-1B task 6: the map asks a newcomer which group; help and docs`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 0e1e73f414ea9500a4986d224f9920b4d8cb2b3e..19ca3123dd66f26c0bc557c07dbe1089fc412f22 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -24,7 +24,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
-- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`) and the split of a train (`trains.md`); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text, choice })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
+- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`) and the split of a train (`trains.md`); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/history.md b/docs/architecture/history.md
index 033a95c1e75b481e7f7eb21cbc4138ebef52246d..75b378ec8b12d6f846b9e6cb8a8e4b91bf9e024c 100644
--- a/docs/architecture/history.md
+++ b/docs/architecture/history.md
@@ -6,7 +6,7 @@ Every party that ends is kept in relational tables beside the live `Party` table
 
 - `PartyHistory`: one row per ended party. `source` is `live` (with `partyId`, the `Party.id`, unique) or `legacy` (with `legacyKey`, `<channel>:<creation ms>`, unique). `kind` is `raid`, `train` or `meetup`. Where: `serverId` (the server's snowflake), `regionId`, `gymId`, `legacyGymId` (the legacy file's gym, kept also when the gym list no longer has it). None of them carries a foreign key: the history outlives a server's `Guild` row (a kick and a new invite neither delete it nor split it; Matt, 2026-10-16), and a region or gym deleted later stays named by its id. What: `name` and `description` (trains and meetups), `tier` (`T1` to `T5`, `Mega`, `MegaLegendary`, `SuperMega`, `Elite`, and the legacy `T2`, `T4`, `EX`; null where not known), `shadow`, `mega`, `elite`, `ex`, `shiny` (null: not known), the boss as the catalogue knows it (`bossKey`, `bossDex`, `bossSpecies`, `bossForm`; a mega's form is `<SPECIES>_<MEGA…>`) or, where it does not, by the name it was given (`bossName`), `fastMove`, `chargedMove`. When (epoch ms): `createdAt`, `hatchTime`, `startTime` (trains and meetups), `endTime`, `endedAt` (null for the legacy parties of the cutover). How it ended: `ending` (below). Who: `createdById`, `conductorId`, only with that member's opt-in, else null; `anonymous` (the reporter asked not to be named in the post). Counts, so that the common questions need no join: `attendees` (members who signed up, also those who left), `interested`, `joined`, `here`, `done` (members by the furthest status they reached), the same with their +1s (`interestedHeads` …), `extras` (all +1s), `remote`, `departed` (left before the end, not by a split); `routeStops` (a train's route at the end); `splitFromId` (migration 020, below).
 - `PartyHistoryAttendee`: a row per member who signed up, in the order they did (`seq`): `memberId` only with their opt-in, else null (the row still counts); `status` at the end (null: they left before it), `furthest` (`interested`, `joined`, `here`, `done`; asked whether they completed it counts as `here`), `groupId`, `extras`, `remote`, `team`, and the times the bot saw (`signedUpAt`, `joinedAt`: first coming or further, `hereAt`, `doneAt`, `leftAt`; null in the legacy history); `splitOff` (migration 020: 1 for a member who left with a group split off the train, 0 otherwise).
-- `PartyHistoryGroup`: a row per group: `label`, `meetingTime` (the last one set, also after the clock cleared it), `members` and `heads` at the end.
+- `PartyHistoryGroup`: a row per group: `label`, `meetingTime` (the last one set, also after the clock cleared it; the steps of a group's meeting time name it by its letter and when it was opened, `B:<stamp>`, plan 8X-1B, since a group nobody is in goes and a later one may take its letter: a pruned B's time is never a new B's; a step of before the stamps names the letter alone and counts for that letter), `members` and `heads` at the end.
 - `PartyHistoryStop`: a row per stop a train made, in order (`seq`; a loop makes a gym's stop twice): `gymId` (null where the gym list no longer has it, with `legacyGymId`), `arrivedAt`, `leftAt` (null where not known: the first stop is reached at the train's start when it was laid earlier; a legacy train's stops have no times).
 - `HistoryOptIn`: a row per member and server (by snowflake, no foreign key) who opted in.
 - `PartyHistoryStep`: what happens to an active party that its model does not keep (a member's status, a member who left, a member who went with a group split off a train (`split`), where a train is, a group's meeting time, the raid it went on from after a move), read into the party's record when it ends and then deleted; it goes with its `Party` row. It holds the ids of everybody in an active party, as the party's own row does, until the party ends.
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index c206af5dcc64ea3aa225002a938f2cef1e770e72..ed8eea4bba9c7369510925f275ea2b150d785d86 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -8,11 +8,12 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - `Party` is a union, `RaidParty | MeetupParty | TrainParty`. Code that is about a raid narrows: `isRaid` in the domain and services, the guard `requireRaid` with `commandRaid(interaction, ctx)` in a handler, `raidOf` elsewhere; likewise `isTimed` / `requireTimed` / `commandTimed` and `isMeetup` / `requireMeetup` / `commandMeetup`. A change inside `PartyStore.update` keeps the kind (`asKindOf(original, changed)`; the store throws when the kind changes). Never cast to a kind.
 - What the clock does is `partyTick(party, input)` (`tick.ts`; it dispatches to `raidTick` or `timedTick`): it returns the party as it should be now, `effects` (`stage`, `ask-complete`, `completed`, `warn`, `end`) and `render`. It is idempotent and catches up after downtime by itself. `end` comes alone and repeats until the caller has ended the party with `endParty`.
 - A party changes only through `PartyStore.update(id, change)` (`src/services/party-store.ts`): one change at a time per party, written to the database first, then replaced in memory. `change` is synchronous and decides inside the callback (a `get` made earlier may be stale); the result has `written`. Two parties that must change together (a train's split: the old train loses the group, the new one is made to match) change through `PartyStore.updateBoth([id, id], change)`: `change(first, second)` gets both as they are (undefined for one that is not active: it decides) and returns `parties` in the same order, both written by one storage call in one transaction (`PartyStorage.saveBoth`; the notes as `save`'s: an end behind its savepoint inside the transaction, steps after the commit; a deadlock runs the whole transaction again, `retryOnDeadlock`, and one that persists or another loss of the transaction writes both rows again alone), memory replaced only after the commit, both before the listeners hear of either; a failed write leaves both as they were, a row that is gone writes neither. It takes both locks in the order of the ids, so a change of either waits for it and two such changes never deadlock; nothing inside it takes a lock again (`KeyedLock` is not re-entrant). A reported raid is stored only through `addRaidUnlessTaken`. Handlers read through `ctx.parties` (`get`, `byPost`, `active`, `inRegion`, `raidAt`).
+- Groups (plan 8X-1B; design `2026-10-20-join-group-meet-buttons-design.md`): a party's groups are in the order they were opened, and each remembers when (`PartyGroup.opened`; a party's first group and every group of a document before version 12 count as opened with the party: `groupOpened`). A group nobody is in goes (decision 6, a wish of legacy Pine's): `pruneGroups` (`attendance.ts`, pure) drops a group no attendee of any status is in (who is interested and who is done count), unless it has a label or a meeting time, never the party's last group (of all empty ones the default group stays); the others keep their letters, and when the default group goes the newest left takes over (by `groupOpened`). `PartyStore.update` and `updateBoth` (both parties) run it on every change that returned a new party, never on a refusal or a change of nothing; it is silent (no line, no ping, the post shown anew). A new group takes `nextGroupId`'s letter (after the last in use, else the first free one), so a letter can be given again: whatever names a group across time names it by its letter and stamp (`groupStamp`, base 36; `stampedGroup` finds a group only while the letter is still that group): the custom ids of the dialogs about groups and Meet…'s, the train split's mark (`groupMark` is `<stamp>.<hash>`; a mark of a group that went, or whose letter a group opened since has, is `no-such-group`, worded as before; a label changed or another split since is `group-changed`), and the party history's meeting times (`history.md`). A group a change opens is stamped with `AttendanceLimits.now`, which the services give with every change (`limitsOf`; `applyAutoStatus` takes it too), and in any case after the party's last write and every group it has (`openedGroup`): stamps strictly increase, also within one millisecond. Who signs up without choosing a group is placed silently as before: +1, −1, Remote and the commands (`/join`, `/here` …, without `group`), and a report's automatic status, go where `setAttendance` puts a newcomer (`chooseGroup` with a lobby size, else the default group); only the post's Interested, Join and Here ask (below).
 - Every party that ends is recorded in the party history (`history.md`): the store asks `PartyHistory` for a note of each write, which the storage writes with the party, and a change that ends a party says why with `ended` in its result (`PartyEnd`: the scheduler `clock`, `PartyService.end` `cancelled` by default, a move `moved`, a party that never had its post `failed`). Once recorded, an ended party's `Party` row is deleted (it holds its members' ids; Matt, 2026-10-16): what reads ended parties (`endedPosts`, `partyForums`) also reads `EndedPartyPost`, and nothing may count on an ended row being there.
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - A raid's boss is stored as a reference, `{ key }` (catalogue key) or `{ name }` (a boss the game master does not know): make it with `raidBossRef(boss)` from a `RaidBoss` of `ctx.raidBosses`, never by passing that object itself. An egg has no boss; `raid.reportedHatched` says whether a raid without times was seen hatched.
 - `PartyRepository` keeps what is searched by in columns and the rest in one versioned JSON document (`party-state.ts`), checked when written and when read; a row it cannot read is reported and left alone. Attendees are a list there, because MySQL sorts the keys of a JSON object. Any new field in the document is a new version with a reader for the old one.
-- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is only the size above which a group of a raid or a train is told to split up: `splitLobby(party, lobbies)`, a second exhaustive switch beside `lobbySize` (raid and train `lobbies.raid`, meetup none; 8X-4 adds the Dynamax train, none), `TrainersView.splitLobby`, null where a kind never splits up) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold, undefined for every party that exists today (a raid, a raid train, a meetup: Q6), an exhaustive switch on the kind that the max battle (8X-3, by its tier) and the Gigantamax train (8X-4) fill in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete. Where a party has a size, Join fills its groups: the services put `lobbySize` into the `AttendanceLimits` of each change (`AttendanceService.limitsOf(party)`; `PartyService` passes it to `applyAutoStatus`; both take `lobbySize` as an option, which tests use to give a raid a size), and `setAttendance` places a member who is not yet an attendee and names no group, whatever the status, and an Interested one who becomes Coming or Present (their own group while it has room for them) through `chooseGroup(party, member, heads, size)` (`attendance.ts`): the default group while they and their +1s fit, else the first group by letter with room, else a new group while there are fewer than five, opened silently (no line, no ping, unlike `createGroup`) and made the default, else the group with the most room, the first by letter on a tie, over its size; the member is never counted against their own group. A member larger than a lobby by themself goes straight to the group with the most room (no new group would hold them either), and a party without groups (a meetup) keeps its one. `+1` and Remote sign a new member up the same way. Nothing else moves anybody: a count or a change to Coming that puts a group over its size leaves them there, and `/group join`, a group's Join and anything that names a group put the member where they asked, over the size if so. Without a size every change is what it was.
+- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is only the size above which a group of a raid or a train is told to split up: `splitLobby(party, lobbies)`, a second exhaustive switch beside `lobbySize` (raid and train `lobbies.raid`, meetup none; 8X-4 adds the Dynamax train, none), `TrainersView.splitLobby`, null where a kind never splits up) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold, undefined for every party that exists today (a raid, a raid train, a meetup: Q6), an exhaustive switch on the kind that the max battle (8X-3, by its tier) and the Gigantamax train (8X-4) fill in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete. Where a party has a size, Join fills its groups: the services put `lobbySize` into the `AttendanceLimits` of each change (`AttendanceService.limitsOf(party)`; `PartyService` passes it to `applyAutoStatus`; both take `lobbySize` as an option, which tests use to give a raid a size), and `setAttendance` places a member who is not yet an attendee and names no group, whatever the status, and an Interested one who becomes Coming or Present (their own group while it has room for them) through `chooseGroup(party, member, heads, size)` (`attendance.ts`): the default group while they and their +1s fit, else the first group by letter with room, else a new group while there are fewer than five, opened silently (no line, no ping, unlike `createGroup`) and made the default, else the group with the most room, the first by letter on a tie, over its size; the member is never counted against their own group. A member larger than a lobby by themself goes straight to the group with the most room (no new group would hold them either), and a party without groups (a meetup) keeps its one. `+1` and Remote sign a new member up the same way. Nothing else moves anybody: a count or a change to Coming that puts a group over its size leaves them there, and `/group join`, Group…, the group a newcomer chose in the dialog "which group?" (plan 8X-1B), the letter Join of a post drawn before it and anything that names a group put the member where they asked, over the size if so. Without a size every change is what it was.
 - How long a raid lasts comes from `raidDurationsAt` / `hatchTimeForEnd` / `longestRaidDurations` (`src/domain/time/raid-durations.ts`) with `raidDurationRules(settings, ctx.raidEvents.events())`: the configured durations, changed for a standard raid that hatches during a Raid Hour or Raid Day (`settings.raidEvents`; events come from the feed, and the weekly Raid Hour of the settings applies in a week for which the feed lists none). Pass `longestRaidDurations(...)` as `durations` to `resolvePartyTime`.
 
 ## Commands and controls in a post
@@ -43,8 +44,9 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS` and `RETIRED_TAGS` (tags the bot once used: `/admin setup-forums` takes them off a forum, never a tag the server made), `inShownOrder`), the components in `src/render/v2.ts` (with `countComponents`, the count Discord's limit is about, the one every renderer uses); `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut. Every post says where the party is under **Where** (plan 8D, Matt, 2026-10-17, like the `/wild` report's Where; the layout below).
 - The layout of a post (plan 8D; Matt, 2026-10-17, mockup version 4): a heading block says what the party is, with the post's picture beside it (`accessory: 'picture'`): a raid `### Level 5 raid against Yveltal ✨` / `### Level 5 raid (egg)` (`heading`; the DM brief keeps the bold `headline`), its times or `closed`, `KEPT_OPEN`, then the boss's lines (`bossLines`: "Hatches as …" for an egg, weaknesses, catch CP, moves), which are no block of their own; a train `### Raid Train: <name>`, "After …", times, conductor, `KEPT_OPEN` and the boss's facts; a meetup its name and times. The gym's name no longer opens a raid's post (its thread title keeps it), and a copy's line (`lead`) still opens the first text. Then **Where**: for a raid and a train's current stop `gymWhere(heading, gym, fit)` (`src/render/raid-post.ts`): one line `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a link; `addressLine` made plain and cut to `ADDRESS_ROOM`; the one Map of the post, masked, in angle brackets so that it shows no preview), then the gym's notice (`plainLines`, cut to `LOCATION_ROOM` through `fit.part`), with the gym's picture from Wayfarer beside them (`placeSection`, a `PostThumbnail`; plan 8W-2: `Gym.imageUrl`, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept). Without an address the line is `**<gym>** · [Map](…)`; beside a picture it says `(no address available)` (`NO_ADDRESS`) so that the picture never sits beside a bare name, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) those words go with it (`PostThumbnail.withoutPicture`). A raid whose gym is gone says `**Unknown gym**`, without a map. No post says that a gym is an elite raid gym (Matt, 2026-10-17: it mattered for EX raids; the gym keeps its flags for staff's views, `/gym elite` and the `#elite-gym-raids` copies). A train's Where is in `trains.md`, a meetup's below ("Meetups and timed parties"). Everything from the sign-up lists down is as it was. The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more) once the trainers' details are back inside their sections (below).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
-- The trainers (`trainerBlocks`, plan 8D-F, Matt's mockup of 2026-10-17): the Discord app on a phone puts a section's button under its text whenever the text has more than one line, so the text beside a button is one line. With one group each status is a section of its heading alone (`**Interested (2)**`) with its button, and its names (`fit.list`) are the section's `details`, a text display right under it; with several each group's section holds only its heading line (`**Group A: label** · 3 trainers · meeting at …`) with its Join (the letter "A" with Join's icon), and its lobby note, its status lines (or "Nobody yet") are its details. The heading text of a single group with a label or a meeting time and the complete list of a raid of several groups stay texts. A raid that is not over (`meetHint`, plan 8D-F F4, Matt, 2026-10-17; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while there is none: with one group ``-# No meeting time yet: `/meet` sets one.`` (`NO_MEETING_TIME`) under the group's label, or as a heading text of its own without one; with several, groups with a time keep their "meeting at …" and one small-print text after the groups, ``-# `/meet` sets your group's meeting time.`` (`GROUP_MEETING_HINT`: `/meet` sets the meeting time of the member's own group), while at least one group that somebody is in has none. Both lines are the post's own (`postOnly` of a text block): a copy in another channel (`lead`: the remote, elite and region copies, where `/meet` does not work) leaves them out, the copy at the bottom of the post (`status`) keeps them. The worst raid without meeting times holds 40 with both pictures, one more group's lines beside its Join. Each details text is one component more: `postMessage` puts details back into their section (`content\ndetails`), the last first and as few as make the message fit `MAX_COMPONENTS`, before it leaves out the gym's picture (the least harm: a section with its details inside is how every post looked before), and into one text display where no button stands beside it (`controls: false`). The worst cases (5 groups, every control, both pictures): a raid would hold 43, so groups C to E keep their lines beside their Join and it holds 40 with both pictures; a train 44 with Split group… (plan 8T), four groups folded, 40 (43 and three folded before 8T); a raid of one group 35 (34 without Screenshot feedback), a meetup 28, nothing folded (before 8D-G, with the buttons below the lists in up to three rows: a raid 44, B to E folded; before 8D-F: 39, 38, 32, 25). Tests read a status with its names as one text through `partTexts` and the sections with their buttons through `sectionsOf` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any), and with one group that line (after the group's name where it has a label or a meeting time) heads the statuses; a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody could move to another group.") under its heading, as its first detail, in the place of the split-up note (a party with a lobby size never shows that one), so that the heading beside Join stays one short line. Without a size the post is as it was.
-- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`): with one group a status's button stands beside its heading (`statusButton`: Interested, Join, Here, Done, an icon without a label, plan 8D-G, Matt, 2026-10-17: a phone drops a section's button under its line when the button is wider than it allows, and "🤔 Interested" was; the line says what the button does, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name after the line), with several the group's letter with Join's icon beside each group ("A", `joinGroupButton`, the action `group`: `AttendanceService.joinInto` makes the member coming in that group from any status, and only moves one who is coming; the Join of the member's own group changes only Interested and leaves Present, and a member who is asked whether they completed the raid, as they are; `/group join` keeps the status) and the statuses' buttons in a row below; then the rows of `bottomControls` (no Map: a post's one Map is in its Where, plan 8D): with several groups the statuses' row (Interested, Here, Done for a raid, Leave), then one row of Leave (with one group), −1, +1, Remote (not for an elite raid), Set time (a raid without times) and Screenshot feedback (a raid from a kept screenshot), cut into rows of five (Matt, 2026-10-17, plan 8D-G: a phone wraps a row as it likes; one row is one component fewer). So a raid of one group has one row, two only with Set time and Screenshot feedback both (the latter alone in the second); a raid of several groups two; an elite raid of one group one; a meetup one; a train one, or two with groups, every button with its emoji: buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin` (Join and a group's Join), `pinehere`, `pinedone`, `pineleave` (Leave, which keeps its word) and `pineremote` (Remote, which keeps its word), else the plain ones (🏃 ✅ 🎉 👋 📡); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `statusButton`, `joinGroupButton` and `bottomControls`. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
+- The trainers (`trainerBlocks`, plan 8X-1B, Matt, 2026-10-20: one layout for one group and several, like legacy Pine's reactions; the mockup of the design): a text display per group, no button inside: its heading line (with several groups `**Group A: label** · 3 trainers · meeting at …`; with one group no letter unless it has a label, `4 trainers · meeting at …`, and nothing of a count while nobody is in it), its lobby note, then a line per status somebody is in, in legacy Pine's order Interested, Coming, Here (the asked among them) and, with one group, Done, each starting with its button's icon (`statusIcon`: 🤔, the application's `pinejoin`, `pinehere`, `pinedone` as message text, else 🏃 ✅ 🎉): `🏃 Coming (3): Ash +1, Misty` (the names through `fit.list`); `Nobody yet` for a group nobody is in. With several groups who is done stands in a text of its own after them (`🎉 Done (2): …`). A raid that is not over and has times (so its post has Meet…: `meetHint`, plan 8D-F F4, reworded in 8X-1B; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while one is missing, by Meet…'s icon (`meetIcon`, ⏰ until the application has `pinemeet`): with one group `-# No meeting time yet: ⏰ sets one.` (`noMeetingTime`) last in its text; with several, one small-print text after the groups naming those somebody is in that have none (`groupMeetingHint`: `-# Group B has no meeting time yet: ⏰ sets your group's.`, `Groups A and C have …`). The hints show in the copies too (Meet… works there). The worst cases (5 groups, every control, both pictures): a raid 31 components, 32 with times and the hint (before 8X-1B 43, folded to 40), a train 31 with Split group… (before, 44 folded to 40); nothing folds, and `postMessage`'s folding of a section's `details` stays for any layout that needs it. Tests read a group's text through `textDisplays` / `partTexts` and the buttons through `buttonsOf` / `buttonNames` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.splitLobby` from `splitLobby`, the settings' 20 when unset, null for none; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any; with one group after its name where it has a label); a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody could move to another group.") under its heading in the place of the split-up note (a party with a lobby size never shows that one). Without a size the post is as it was.
+- The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`, `bottomControls(party, { emoji, opens })`; plan 8X-1B, decision 1, Matt, 2026-10-20: the same rows for one group and several, in raids and trains alike, no Map: a post's one Map is in its Where, plan 8D). Row 1 the statuses in legacy Pine's order, Interested, Join, Here, Done (a raid's; elsewhere Done means leave) and Leave; row 2 Meet… (a raid with times, `meetButton`), −1, +1 and Remote (not for an elite raid); both rows icons only, no label (the lines of the post start with the statuses' icons, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name: `pinejoin`, or the character's); row 3 the buttons with a label, which open something: Group… (where the party has groups, `groupButton`, 👥, always shown so that nothing moves, and switched off, `disabled`, while nobody is signed up), then for a raid Set time (in Meet…'s place while it has no times: the two never show together) and Screenshot feedback (a raid from a kept screenshot), then `opens` (a train's Move train…, Split group…, Whole route, `trains.md`). A row with nothing in it is none (a meetup has two). Buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin`, `pinehere`, `pinedone`, `pineleave`, `pineremote` and `pinemeet` (Meet…, the game's Select Time icon; `PENDING_CONTROL_ICON_NAMES`: the upload script makes none until its file is in `pictures/emoji/`, since it reports a missing file as a failure), else the plain ones (🏃 ✅ 🎉 👋 📡 ⏰); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `bottomControls` and `trainerBlocks` (`statusIcon`, `meetIcon`). Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
+- The dialogs of a post (plan 8X-1B; the 8Q pieces of `src/discord/dialog.ts`, the first answer of the press, a Submit acknowledged privately at once and decided again; the renderers `src/render/group-dialogs.ts` and `meet-dialog.ts`, the handlers `src/commands/parties/group-dialogs.ts` and `meet-dialog.ts`; Discord adds its own box to every dialog, so they are short). **Which group** (decision 2): Interested, Join or Here pressed by a member who is not signed up, in a post of several groups (`asksWhichGroup`), opens `whichGroupDialog`, titled by the button (`Join this raid`, `Interested in this raid`, `Here for this raid`): one radio choice, "Which group?", of "Any group with room" first where the groups have a size (its line says what it picks now, `Now: group B (2/4 coming)`, `Now: a new group, C`; when every group is full and no more may open, "Any group: all are full", `The one with the most room: group B (4/4 coming)`), then every group newest first (`newestFirst`), by its label and a short line (`2 trainers · no meeting time yet`, a raid's meeting time as a clock time, `clockText`), the first picked to start with (decision 9: Android picks the first itself, iPhone what is marked). Anybody signed up changes status in their own group, without a dialog; Done and Leave never ask. Its Submit (`joinChosen`) decides as things are then: the chosen group by letter and stamp (gone or opened again: `Group B has changed since: press Join again.`), over its size where it is full (as a named group in 8X-1), "any" placed by `setAttendance` (`chooseGroup`), and a member who signed up meanwhile only gets the status in their own group and hears so. **Group…** (decision 3): `groupMenuDialog` of `groupWays`, every other group (all of them for a newcomer, whom it signs up as coming, `joinGroup`'s way) newest first, then a new group (`A new group (C)`, "Label for a new group (optional)", ignored for a move), the first picked; titled `Change group` ("You're in group A.") or `Join a group`; where only one way is left no choice and the text says what Submit does (`Submit opens group B and moves you to it.`). No new group is offered to a member alone in a plain group of their own, which would go once they left it (`newGroupChangesNothing`: no label, no meeting time, any number of groups); refused before it opens where no way is left (the one member of a party's one group: "You are the only one here: a new group would change nothing.") and for a member who completed the raid; a Submit of a new group by a member left alone meanwhile is told "You are alone in group B already: a new group would change nothing." Its Submit moves by stamp (`AttendanceService.joinStamped`) or opens the group with its label (`newGroup(…, label)`: `/group new`'s notice, now "press Group… on the post"). **Meet…** (decision 5): `meetDialog`, a menu (more than a radio choice's ten) of `meetTimes` (`src/domain/party/meet-times.ts`: the in-game RSVP times of `rsvpTimes`, the hatch then every `RSVP_STEP_MINUTES` 15 while the raid lasts, one rule for every tier until Matt checks other lengths, and the 5-minute clock times of the next hour, after now, between the hatch and the end, at most `MAX_MEET_TIMES` 24, the latest 5-minute times dropped first, then on a long raid the latest RSVP times, the group's own time kept), `At hatch (7:22 PM) · in-game RSVP` first on an egg, "No meeting time" last while the group has one; the group's time is chosen to start with, else the next RSVP time (a menu keeps time order, so its start is Discord's `default` only). Titled `Meeting time for group B` (`Meeting time` with one group), "For your group: everybody in it is told." Refused before it opens: not signed up, no times (`NO_TIMES`), over, no time left (`NO_TIME_LEFT`); its Submit is a kind of its own, `meet:<party>:time:<group>:<stamp>` (`meetControls`), so that it counts in `/meet`'s window (`MEET_WINDOW`, `variedThrottleKey('meet', MEET_THROTTLE)`: one budget for `/meet` and Meet…; the press is refused while it is full, the party controls' `checks`), and sets the time through `setMeetingTime` with `drawn` (the group's letter and stamp), decided inside the store (`setMeetingTimeAsDrawn`, `meet-times.ts`: the member still in that group, else `group-changed`, "Your group changed meanwhile: try again."; a time Meet… still offers, else `meeting-time-gone`, "That time has passed: try again."), so a move queued before the Submit is seen, in `/meet`'s words (`meetingWords`). Trains and meetups have no Meet…. The presses and Submits of the first two count as presses of the post (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
 - `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit (some 86 snowflakes after a short text, 100 at most). `inMessages(text, members)` (plan 8X-1) pings them all: the text with as many as fit, then messages of mentions alone, each within 2,000 characters and 100 pings. `pingInMessages(deps, partyId, postId, text, members)` (`src/services/party-change.ts`) sends them one after the other, asking the store before each whether the party is still active with that post (a moved raid has another), and stops otherwise or when Discord says the post is gone (`complete`, `pinged`, and `stopped`: `gone`, or `moved` for a party still active with another post); `/shout` (`AttendanceService.shout`) goes through it, answering `gone` with how many it `pinged` before ("This raid is over. I pinged 86 trainers before it ended."), or `moved` ("This raid moved to another post: I pinged 86 trainers before it moved. Shout again there.", without the count when nobody was pinged yet, and then the use of `/shout` goes back: `givesBack`); `/shout group:True` pings only the others of the shouter's own group (not Complete, those who allow shout pings; the text says `to everybody in group B:`), refused in a party of one group (`one-group`: "This raid has one group: `/shout` without `group` pings everybody."), `nobody` with the group when nobody else is in it. The other callers of `withMentions` (a meeting time, a new group, a start, a train's movement, a move's notice, the scheduler's) still ping at most one message's worth.
@@ -61,9 +63,9 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 ## Attendance, lines and the completion question
 
-- `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup`, `labelGroup`. Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, "Join B") are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
+- `ctx.attendance` (`AttendanceService`, `src/services/attendance-service.ts`) is what members do in a party: `signUp`, `setRemote`, `changeNumber`, `notHere`, `leave`, `done`, `answer`, `joinGroup`, `newGroup` (with a label, Group…), `labelGroup`; `joinChosen` and `joinStamped` (the Submits of the dialogs about groups), `lobbyOf` (a party's lobby size). Each takes the party id and the acting `Member` (`actingMember(interaction)`), decides inside `PartyStore.update`, has the post rendered anew and says a line in the post; it answers `{ kind: 'gone' | 'refused' | 'ok' }` (`AttendanceOutcome`), which a handler turns into the private answer with `answerOutcome(interaction, ctx, outcome, words?)` (`src/commands/parties/reply.ts`). Buttons and commands both go through it; neither touches the store or the gateway. The attendance buttons of a post (Interested, Join, Here, Done, Leave, and the letter Join, "Join B", of a post drawn before plan 8X-1B, which still joins its letter, `joinInto`, or is refused as no such group once the letter is gone) are carried out by `pressStatus(attendance, partyId, member, press, answer)`, the one code path the live map's presses share (plan 8M-3, `web.md`); `outcomeWords(limits, party, outcome, words?)` is the answer's words and whether it worked, without throwing (the map's answer), which `answerOutcome` and `answerClick` throw as a `UserError` when it did not. A member who is done cannot change count, remote or group (`already-done`); Done on an egg is refused (`not-hatched`).
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
-- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 11 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; exactly the parts that fit the type must be present); versions 1 to 10 are still read (a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another).
+- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 12 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; version 9 (plan 8B-3): `train.atEnd`; version 10 (plan 8D): `meetup.place`; version 11 (plan 8T): `train.splitFrom`, with `pending: true` while the split is not settled, and `train.splitOff`; version 12 (plan 8X-1B): a group's `opened`, also kept with a `splitOff` entry; exactly the parts that fit the type must be present); versions 1 to 11 are still read (a train of them before 9 as `finish`, a meetup of them before 10 without a place, a train of them before 11 split neither from nor off another, their groups before 12 opened with the party).
 
 ## The clock
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 645369d559144712225324ad41a896ecf34e461a..eb93bc85e1f14b629e4d3e4c60c640ddd31ff3a8 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -26,7 +26,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 ## Fake interactions
 
 - Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu or radio group (Discord refuses the Submit without one), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
-- A dialog (plan 8Q, `discord-framework.md`) is read with `test/support/dialogs.ts`: `dialogOf(fake)` (undefined when none opened) or `shownDialog(fake)`, its `dialogTexts` / `dialogText`, and `dialogChoices` (value, label, description, and `picked` for a choice picked beforehand, which none may be). Submit it with `fakeModal({ customId: dialog.custom_id, form: dialog, picked })`, so that the fake refuses a required choice left empty. The slow-read rule is tested by holding the read (a spy that resolves a promise when it is asked and never answers), then `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` before the press (the timer is set before the read is asked; the fake's `createdTimestamp` is the real now, so the budget is about `DIALOG_READ_MS`) and `vi.advanceTimersByTimeAsync(DIALOG_READ_MS)` once it was asked. A submitted form's `fields.fields` is the map of what it submitted, as discord.js's (`pickedOf` asks it).
+- A dialog (plan 8Q, `discord-framework.md`) is read with `test/support/dialogs.ts`: `dialogOf(fake)` (undefined when none opened) or `shownDialog(fake)`, its `dialogTexts` / `dialogText`, and `dialogChoices` (value, label, description, and `picked` for a choice picked beforehand, Discord's `default`; of radio groups and, since plan 8X-1B, string selects). A Submit of a menu passes `selected`, of a line of text `fields`. Submit it with `fakeModal({ customId: dialog.custom_id, form: dialog, picked })`, so that the fake refuses a required choice left empty. The slow-read rule is tested by holding the read (a spy that resolves a promise when it is asked and never answers), then `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` before the press (the timer is set before the read is asked; the fake's `createdTimestamp` is the real now, so the budget is about `DIALOG_READ_MS`) and `vi.advanceTimersByTimeAsync(DIALOG_READ_MS)` once it was asked. A submitted form's `fields.fields` is the map of what it submitted, as discord.js's (`pickedOf` asks it).
 
 ## Parties
 
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index bae59ea6dc9dd8bcbef5348dae65529126de3952..539d68f256ae3489cd49e17a7fa0a65f3920b281 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -20,19 +20,19 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 ## The post and the panel
 
 - `renderTrainPost` (`src/render/train-post.ts`) builds on `party-post.ts` and `timed-post.ts` (`describeTimes`, shared with the meetup); a gym in a list is `stopLink` (masked link, brackets escaped). The archive warning of a timed party without an end time pings `warningAddressee(party)` (a train's conductor, otherwise the maker).
-- A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Then a row (a `controls` block: a section's one accessory is the picture): the grey "Move train…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; also on a finished route: Previous and Reverse take a Finish back) and on a route longer than `WHOLE_ROUTE_STOPS` "Whole route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then. "Move train…" answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel`, `pressTrainPanel`, `pressReverse`, `pressAtEnd` in `src/commands/trains/move.ts`): a components-v2 message (plan 8B-3), one container of `TRAIN_PANEL_COLOUR` with `### Move the train`, where the train is and what Next does (`At stop 2 of 4: …`, `Next is …`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`), the four moves with their emoji (switched off where `cannotMove` says), "🔃 Reverse the route" where `cannotReverse` allows it, and under `**At the end of the route**` a menu of the three modes with the train's own as the default (its labels say each in full, "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", since a closed menu shows the label alone; `/train`'s choices keep `AT_END_LABELS`). Its controls are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next, Previous and Skip also the gym they lead to), `party:<id>:reverse:<place>:<first>` (`first`: the gym the route began with when drawn, so that a second press or a panel drawn before another member's Reverse is refused `route-changed` instead of flipping the route back) and the menu `party:<id>:atend:<place>` (a `select` of `partyButtons`): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew with the reason above where the train is; a member who may no longer move it (also after a mode they were allowed to set), a train without a route and one that ended get `panelNote` (no controls). A panel press calls `update` with `v2Answer` and never goes through `answerClick`; a press on a plain-text panel from before 8B-3 updates it to `OLD_PANEL` and sends the new panel as a private follow-up (whether Discord takes a v2 interaction update of a classic message is not known and not tried: the follow-up is the safe path). Command answers (`/next` and the others) keep the panel's `whereText`. The DM brief of a train is unchanged (`placeLine`).
+- A train's post (plan 8D; Matt, 2026-10-17) has its boss's facts in its heading block and says where the train is under `**Where · stop 2 of 7**`: its current stop as a raid's gym (`gymWhere`: the gym, its address and Map, its notice, its picture beside them); `**Where**` and `Route complete` once the route is finished; `**Where**` and ``No route yet: `/route add` adds a stop.`` without a route. Under it a line of small print says what lies ahead: `routeAhead` (`train.ts`, pure, beside `nextStop` and `turnAhead`; `RouteAhead`) gives it and `aheadLine` words it, the names plain and cut alike through `fit.part`: a route of `WHOLE_ROUTE_STOPS` (3) or fewer whole, the current stop in bold, with the mode (`Route: 1. A · **2. B** · 3. C, loops`; finished, nobody in bold and no mode: it goes nowhere any more); on a longer one the next two stops in the order the train travels and how many more (`Next: 3. C · 4. D, and 3 more to the end`; `…, the last stop` when they reach it, `This is the last stop.` at it; a loop looks past the end, `Next: 7. G · 1. A (round again), and 4 more round the loop`, the count the stops other than the current one not shown; a turn-back train counts the stops before it turns, `…, and 3 more to the end, where it turns back`, says `…, where it turns back` when the two reach the last stop, at the last stop `Next: 6. F (turning back) · 5. E, and 4 more back to the start`, and one stop before it `Next: 7. G, then back here, and 5 more back to the start`, Matt's wording, since the second next stop is the current one), numbered as the route is stored now; nothing on a long route that is finished. Its buttons are in the third row of the post's controls (plan 8X-1B: the rows of a raid, `parties-and-posts.md`; row 1 Interested, Join, Here, Leave, row 2 −1, +1, Remote, row 3 Group…, then the train's own, `bottomControls`'s `opens`): the grey "Move train…" (`party:<id>:move`, `moveTrainButton`, `moves: true`; also on a finished route: Previous and Reverse take a Finish back) and on a route longer than `WHOLE_ROUTE_STOPS` "Whole route" (`party:<id>:route`, `wholeRouteButton`, an action of the party controls: their guards and `ACTION_THROTTLE`), which answers privately with exactly what `/route show` answers (`showWholeRoute`, `routeTexts`, `src/commands/trains/route.ts`: every stop a maps link, in as many messages as it takes), to anybody, also on a copy; a train that ended answers "This train is over.", a route emptied since what `/route show` says then. "Move train…" answers privately with the panel (`trainPanel`, `src/render/train-panel.ts`; handlers `openTrainPanel`, `pressTrainPanel`, `pressReverse`, `pressAtEnd` in `src/commands/trains/move.ts`): a components-v2 message (plan 8B-3), one container of `TRAIN_PANEL_COLOUR` with `### Move the train`, where the train is and what Next does (`At stop 2 of 4: …`, `Next is …`, at the last stop `It is the last stop: Next finishes the route`, `Next goes round to …`, `Next turns back to …`), the four moves with their emoji (switched off where `cannotMove` says), "🔃 Reverse the route" where `cannotReverse` allows it, and under `**At the end of the route**` a menu of the three modes with the train's own as the default (its labels say each in full, "Finish at the last stop", "Loop: back to the first stop", "Turn back at the end", since a closed menu shows the label alone; `/train`'s choices keep `AT_END_LABELS`). Its controls are `party:<id>:<move>:<place>[:<target>]` (the gym id of the stop they were drawn at, or `end`; Next, Previous and Skip also the gym they lead to), `party:<id>:reverse:<place>:<first>` (`first`: the gym the route began with when drawn, so that a second press or a panel drawn before another member's Reverse is refused `route-changed` instead of flipping the route back) and the menu `party:<id>:atend:<place>` (a `select` of `partyButtons`): the store refuses a press that no longer fits (`train-moved-on`, `route-changed`) and the panel is shown anew with the reason above where the train is; a member who may no longer move it (also after a mode they were allowed to set), a train without a route and one that ended get `panelNote` (no controls). A panel press calls `update` with `v2Answer` and never goes through `answerClick`; a press on a plain-text panel from before 8B-3 updates it to `OLD_PANEL` and sends the new panel as a private follow-up (whether Discord takes a v2 interaction update of a classic message is not known and not tried: the follow-up is the safe path). Command answers (`/next` and the others) keep the panel's `whereText`. The DM brief of a train is unchanged (`placeLine`).
 
 - On the live map the panel opens in the train's popup in place of its actions ("Move…") and stays open after each move, as the post's does (`web.md`, "Trains on the map"); the popup keeps the click that drew the panel (`keepClicksInPopup`: before plan 8S-3 Leaflet took it for a click on the map, the Move… button being out of the page by then, and closed the popup at once).
 
 ## Splitting a group off
 
 - A group of a train can become a train of its own (plan 8T; spec `2026-10-17-train-split-design.md`; Matt, 2026-10-17: faster players go on at their own pace instead of per-group positions on one train). Who may is `mayNotSplit` in `train.ts`, beside `mayNotArrange`: never a train of one group (`one-group`), one without a post yet (`unposted`: the new train links to it), the new train of a split not settled yet (`split-pending`, "This train is still being split off another: try again in a moment.": from its post until the paired write its members are on the old train too, and a group split off it would outlive the split's take-back; `splitsPossible` and `splittableGroups` offer nothing of it), a group it does not have (`no-such-group`), an empty one (`empty-group`) or one that everybody on the train is in (`whole-train`, Matt, 2026-10-17: the old train would be left empty; the words name the group, `Everybody on this train is in group B (Fast): there is nothing to split it from.`, `splitRefusal`); staff and the conductor any other group; a member of the group (any status) their own (`not-in-group`, "Only a group's members, the conductor and the moderators can split a group off.") unless the conductor is in it (`conductor-in-group`). `splittableGroups` is what the dialog and the autocomplete offer; `splitsPossible` (two groups or more with somebody in them) whether the post shows the button.
-- The pure parts (`train.ts`): `splitTrain(old, { id, by, anonymous, group, now })` is the new train: `<old name> (<label or letter>)` cut to `MAX_PARTY_NAME` (the group keeps at least half of the room), the same server and region, route, stop, `finishedFrom`, mode, boss, start and end (through `withTrain`), one group A with the group's label, the group's members as they are in A, made now by the presser (named unless their privacy is Anonymous; `makerName` is noted by the service), led by the old conductor who goes with the group, else the presser in it unless their privacy is Anonymous (as a `/train` made anonymously, it then has none until `/conductor set`; Matt, 2026-10-17), else nobody, with `train.splitFrom` (the old party and post, `pending: true`). `splitOffGroup(old, member, staff, group, link, drawn?, anonymous?)` is the old train without the group and its members: the other groups keep their letters, the newest left takes new sign-ups when the newest went, its conductor stays unless they went, `train.splitOff` gains `{ partyId, postId, group, label? }` newest first (at most `MAX_SPLITS_KEPT`, 10); it answers the members who moved (`moved`), the group, who leads the new train and the old train as it was then (`was`: its train part, start and end). `drawn` is the group's mark as the dialog showed it (`groupMark`, FNV-1a in base 36 of the label and the party id of the newest `splitOff`): refused `group-changed` when the label changed, the group went, or another group was split off since, so a letter given again (even with the same label) is never taken for the group that had it. `splitDrawn(train, group, mark)` is the split a stale mark was drawn for when that very group is the one split off last. `carriedSplit(target, start, moved, conductor, was?, now?)` brings the new train in line with the group as it was at the split, and with the old train's place and times then unless they were changed on the new train meanwhile (as for the conductor); the very same train when that changes nothing. `splitSettled(train)` clears `pending`. A group opened after a split takes a letter that no group has and no split named, the first after the last in use, else the first such; when every free letter was a split's, the first free one (`nextGroupId`, `attendance.ts`): a letter can come again only then, and the mark keeps a stale dialog from taking the new group for the old.
+- The pure parts (`train.ts`): `splitTrain(old, { id, by, anonymous, group, now })` is the new train: `<old name> (<label or letter>)` cut to `MAX_PARTY_NAME` (the group keeps at least half of the room), the same server and region, route, stop, `finishedFrom`, mode, boss, start and end (through `withTrain`), one group A with the group's label, the group's members as they are in A, made now by the presser (named unless their privacy is Anonymous; `makerName` is noted by the service), led by the old conductor who goes with the group, else the presser in it unless their privacy is Anonymous (as a `/train` made anonymously, it then has none until `/conductor set`; Matt, 2026-10-17), else nobody, with `train.splitFrom` (the old party and post, `pending: true`). `splitOffGroup(old, member, staff, group, link, drawn?, anonymous?)` is the old train without the group and its members: the other groups keep their letters, the newest left takes new sign-ups when the newest went, its conductor stays unless they went, `train.splitOff` gains `{ partyId, postId, group, label? }` newest first (at most `MAX_SPLITS_KEPT`, 10); it answers the members who moved (`moved`), the group, who leads the new train and the old train as it was then (`was`: its train part, start and end). `drawn` is the group's mark as the dialog showed it (`groupMark`, `<stamp>.<hash>`: when the group was opened, `groupStamp`, plan 8X-1B, then FNV-1a in base 36 of the label and the party id of the newest `splitOff`): refused `no-such-group` (worded as for a command) when the group went (split off, or pruned once it emptied) or its letter is a group's opened since, `group-changed` when the label changed or another group was split off since, so a letter given again (even with the same label) is never taken for the group that had it; a `splitOff` entry keeps the group's `opened`. `splitDrawn(train, group, mark)` is the split a stale mark was drawn for when that very group is the one split off last. `carriedSplit(target, start, moved, conductor, was?, now?)` brings the new train in line with the group as it was at the split, and with the old train's place and times then unless they were changed on the new train meanwhile (as for the conductor); the very same train when that changes nothing. `splitSettled(train)` clears `pending`. A group opened after a split takes a letter that no group has and no split named, the first after the last in use, else the first such; when every free letter was a split's, the first free one (`nextGroupId`, `attendance.ts`); since plan 8X-1B a group nobody is in goes too (`pruneGroups`), so a letter comes again, and the mark (by the group's stamp) keeps a stale dialog from taking the new group for the old.
 - `PartyService.splitTrain` (`ctx.trains.split`, `TrainService.split`, which adds the lines) does it as `relocate` does a raid's move, one split of a train at a time: refusals known at once are answered before anything is made (`no-forum` also when the region's forum is not the old train's); the new train is stored, pending, and gets its post in the same forum (`createTracked`: link line, summary, region copies follow; no new-train DMs); then both trains change in one write (`PartyStore.updateBoth([old, new], …)`, one transaction: both or neither), which decides anew; a refusal there (the presser left, the label changed, a second split), an old train that ended, a new train that ended meanwhile (its post deleted: `no-post`), or a failed write takes the new train back (`takeBack`: its post and link line deleted, dropped from the history as never having been a party). In that write the old train loses the group (`splitOffGroup`, the presser noted first), and who is in the group at that moment goes: a Leave or a Join on the old post while the new post was made counts; the new train, as it is then, is brought in line (`carriedSplit`, then `splitSettled`): it drops who left the group, adds who joined it, keeps what members did on the new post meanwhile (who left the new train stays out), is put where the old train was at the split (a Next or a route edit meanwhile) and is settled. A press on the new post while that write waits for the old train's lock goes before it or after it, as the order of the two ids puts the locks (`updateBoth` takes them in that order); either way it counts. Nobody is in both trains or in neither once it settles. The old post is never deleted or replaced: it is re-rendered without the group and with its small print (its region copies too), and gets its line.
 - No window between the writes: the old train's loss of the group and the new train's carry-over commit together or not at all, so nobody can end on both trains or on neither. What is left is the new post of a split whose write never committed: a stop of the process after the new post and before the write, or a failed write whose take-back could not end the new train. It stays pending (`train.splitFrom.pending`, in the state document) while the old train still has the group, and `settlePendingSplits` takes it back, each under the moves lock of its old train: once Discord is there after a start (`app.ts`: taking one back deletes a post), and with the clock's hourly upkeep those made a minute ago or more (`PartySchedulerOptions.splits`: the old train's moves lock keeps a split under way apart from the upkeep, which finds it settled once it has the lock; the minute's age only spares it waiting behind one), logging how many it settled and took back only when it did any; one it could not end stays pending for the next try and is not counted. A pending train whose old train is still active and lists it in `splitOff` cannot come of this code (only 8T's first build, which wrote the two trains one after the other, could leave one); it is settled as it is stored and logged as an error, since the group is on no other train. Only an active old train is seen (the store keeps no ended party): the pending train of an old train that ended is taken back, whatever the old one listed. A commit whose acknowledgement is lost (the connection drops after MySQL committed) is the same rare risk as for any `update`: the split's take-back then ends the new train although the old one lost the group, which leaves the group on neither train in the database (memory still has it on the old train) until the old train's next write stores it again, and a restart before that write makes the loss permanent (the restarted process reads the old train without the group); accepted as the same rare risk as any `update`.
 - Then the old post says `<doer> split group B (Fast) off into a train of its own.` (a line, no ping) and the new post `<doer> split this train off with group B (Fast).`, pinging the members who moved and allow `mentions`, never the presser (`doer`: a maker who asked not to be named is not; `This train was split off with …` then).
-- The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "✂️ Split group…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out) stands in the row of Move train… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 40 components with `postMessage`'s fold of four groups' details (44 unfolded).
-- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens, within `DIALOG_READ_MS` of the interaction (`readInTime`, plan 8Q): past it no dialog opens and the member is told `SLOW_READ` privately. "Split group…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>`. The other (mockup v6, Matt, 2026-10-20: a big train split in person into groups of 17 needs everybody named, and a second line in every choice said the same) is one text display and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups` in the post's order, nothing picked (Discord refuses Submit until one is). The text says what is the same for every group, with the new train's name for the first group as the example of `named after the group`; then, once, who leads the new train for each group whose train somebody would lead (`leadSentences`: `If group A leaves, you go with it as its conductor, and <train> has none then.`, and for staff in a group `If group C leaves, you go with it as its conductor.`; nothing for a group whose train would have none); then a line per group in the choices' order (`groupLines`): `**Group B (Fast)** (4 trainers): Cilan +1, Dawn, Iris`, the members as the post lists them (`groupInPostOrder`, by name with their guests, those without a name counted in `, and N more`), the trainers counted with their guests as the post counts them (`headCount`); when the lines would pass Discord's 4,000 characters (`TEXT_ROOM`), every group names the same number of members and how many more. Each choice is only `Group B (Fast) · 4 trainers` (the group's label cut to 40, the whole to 100), with no description, its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform`. A choice's label is the group's label as it is (Discord is assumed to show no markdown there, as in a select's options; 8T staging step 28 checks it), the text is made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split group… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Split group… and Submit count as presses of the post; `/group split` counts in its own window (both `ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split.
+- The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "✂️ Split group…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out) stands after Move train… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 31 components since plan 8X-1B (each group one text; before, 44 with four groups folded to 40).
+- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens, within `DIALOG_READ_MS` of the interaction (`readInTime`, plan 8Q): past it no dialog opens and the member is told `SLOW_READ` privately. "Split group…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>`. The other (mockup v6, Matt, 2026-10-20: a big train split in person into groups of 17 needs everybody named, and a second line in every choice said the same) is one text display and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups`, first the group with the most members but the presser's own (ties by letter), the presser's own group last (plan 8X-1B: Android picks the first choice by itself; Matt to confirm), nothing marked (the group that leaves is picked on purpose; an iPhone refuses Submit until one is). The text says what is the same for every group, with the new train's name for the first group as the example of `named after the group`; then, once, who leads the new train for each group whose train somebody would lead (`leadSentences`: `If group A leaves, you go with it as its conductor, and <train> has none then.`, and for staff in a group `If group C leaves, you go with it as its conductor.`; nothing for a group whose train would have none); then a line per group in the choices' order (`groupLines`): `**Group B (Fast)** (4 trainers): Cilan +1, Dawn, Iris`, the members as the post lists them (`groupInPostOrder`, by name with their guests, those without a name counted in `, and N more`), the trainers counted with their guests as the post counts them (`headCount`); when the lines would pass Discord's 4,000 characters (`TEXT_ROOM`), every group names the same number of members and how many more. Each choice is only `Group B (Fast) · 4 trainers` (the group's label cut to 40, the whole to 100), with no description, its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform`. A choice's label is the group's label as it is (Discord is assumed to show no markdown there, as in a select's options; 8T staging step 28 checks it), the text is made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split group… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Split group… and Submit count as presses of the post; `/group split` counts in its own window (both `ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split.
 - The history records each train on its own (`history.md`: the step `split`, `PartyHistoryAttendee.splitOff`, `PartyHistory.splitFromId`; a pending train has no history until it is settled).
 
 ## Saved routes
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 4e2d8da5e1c16e9d807b5e22ff2f07cef5c2cb05..bbf99e8d8ec512104022fda74e8166057bf6a536 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -42,8 +42,8 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
-- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (with one group Interested, Join, Here; with several a Join for each group, Interested, Here; Done for a raid that has hatched; Leave for a member signed up; none while read-only); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
-- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join` (body `{ group }` for "Join B"), `here`, `leave`, `done`; any other action 404, a body other than an optional group letter with `join` 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This raid is over." for Done, which only a raid has, otherwise "This has ended.", as `answerClick` says it); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (Interested, Join, Here, the same for one group and several since plan 8X-1B; Done for a raid that has hatched; Leave for a member signed up; none while read-only), and `pick`, which group, for a member who is not signed up for a party of several groups (not while read-only): the choices of the post's dialog in its order, "Any group with room" (no group) first where the groups have a size (`PartyViewInput.lobbySize`, from `AttendanceService.lobbyOf`), then the groups newest first (`newestFirst`) by `Group B: label`; the popup shows it as a menu before the buttons, its first choice chosen (`groupPick`, `src/web/client/parties.ts`), and the page sends what it shows with Interested, Join and Here (`party-layer.ts`; Group… and Meet… are not on the map: follow-ups, the web UX sweep); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join`, `here` (each with body `{ group }`, the group a newcomer chose in the popup, plan 8X-1B: the dialog's Submit by the group's letter, `joinChosen` through `StatusPress` `chosen`, so a member signed up meanwhile keeps their own group; `joinInto` is left to the letter Join of a post drawn before plan 8X-1B), `leave`, `done`; any other action 404, a body other than an optional group letter with those three 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This raid is over." for Done, which only a raid has, otherwise "This has ended.", as `answerClick` says it); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
 - **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked by a ring around its gym (`trainMarker`, plan 8S-4: unfilled, so a click inside reaches the gym's dot or its raids' marker and one on its line opens the train; on the rings' pane, drawn as SVG by one renderer of that pane (`L.svg({ pane: RING_PANE })`, the meetups' rings too: a canvas would take a click inside an unfilled circle as the circle's); its size, `TRAIN_RING`, between a gym's dot, `GYM_DOT`, and a meetup's ring, `MEETUP_RING`, so the three at one gym hide none of each other, which leaves its line 3 px to click (no wider hit area fits between the gym's dot and a meetup's ring: a trade-off, the route's line and the side panel open the train too); dashed and pale at the first gym of a train not at a stop yet: a filled dot there hid the gym's marker and its raids), meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
diff --git a/src/commands/parties/attendance.ts b/src/commands/parties/attendance.ts
index 617474e3c6cd35fbf3946d4cdab0627c2ea99745..66a5839fb741d3ab368bd92d319869eddda9e591 100644
--- a/src/commands/parties/attendance.ts
+++ b/src/commands/parties/attendance.ts
@@ -62,7 +62,10 @@ function signUpCommand(
     data: withCountAndGroup(name, description),
     help: {
       category: 'basic-raid',
-      details: `${details} ${IN_A_POST} The same as the button on the post, with a head count and a group if you like.`,
+      details:
+        `${details} ${IN_A_POST} The same as the button on the post, with a head count and a ` +
+        'group if you like; without one a newcomer lands in the newest group (one with room ' +
+        'where groups have a size), where the button asks a newcomer which group.',
       examples: [`/${name}`, `/${name} count:3`],
     },
     guards: [requireParty],
diff --git a/src/commands/parties/group.ts b/src/commands/parties/group.ts
index 06db2c2c08c60d50ab69c279307ead049e7fa2db..0a0909a5e9735e42031fa4b57d20ba0cf542bf8e 100644
--- a/src/commands/parties/group.ts
+++ b/src/commands/parties/group.ts
@@ -24,7 +24,7 @@ const joinGroup: SubcommandPart = {
   help: {
     details:
       'Moves you to that group; if you were not signed up, you are marked as coming. The same ' +
-      'as the group buttons on the post.',
+      'as Group… on the post.',
     examples: ['/group join letter:B'],
   },
   throttle: ACTION_THROTTLE,
@@ -44,8 +44,10 @@ const newGroup: SubcommandPart = {
   help: {
     details:
       'For more trainers than one lobby holds, or for trainers who want to raid apart from ' +
-      'the others. Later sign-ups land in the newest group. A raid or train has at most five ' +
-      'groups.',
+      "the others. The post's Interested, Join and Here then ask a newcomer which group; who " +
+      'signs up without choosing (+1, Remote, the commands) lands in the newest group. A group ' +
+      'nobody is in goes, unless it has a label or a meeting time. A raid or train has at most ' +
+      'five groups. The same as Group… on the post, which also takes a label.',
   },
   throttle: ACTION_THROTTLE,
   async execute(interaction, ctx) {
diff --git a/src/commands/parties/meet.ts b/src/commands/parties/meet.ts
index 88f899ac214e58f9019f0618a5dca0bb1827ac90..a2ff850afbd42ab2bc5ff352f397df29a2eedcc8 100644
--- a/src/commands/parties/meet.ts
+++ b/src/commands/parties/meet.ts
@@ -83,7 +83,8 @@ export const meet: SimpleCommand = {
     details:
       'In the post of a raid: sets the meeting time of the group you are in and tells the ' +
       'others of the group. The time must lie between now (or the hatch) and the end of the ' +
-      'raid; `hatch` means the hatch time, `cancel` removes the meeting time. A while after it, ' +
+      'raid; `hatch` means the hatch time, `cancel` removes the meeting time (on the post, the ' +
+      "button with the game's Select Time icon offers the in-game RSVP times). A while after it, " +
       'those who are here are asked whether they are done. In the post of a train or meetup: sets when ' +
       'it starts, for everybody, and tells the others who are signed up. Give a clock ' +
       'time, a date and a time, or `in 30` for minutes from now (a bare number is an hour ' +
diff --git a/src/commands/parties/reply.ts b/src/commands/parties/reply.ts
index 20fbf4d0a238fb0d879b48a282b4231daaea7dee..2da25e2a016fd64c721c4c5c8aff89c8108686d6 100644
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -261,11 +261,16 @@ export function outcomeWords<Extra>(
 
 /**
  * A press of one of the attendance buttons of a post (spec 4.1): Interested (`maybe`), Join,
- * Here, Done, Leave, and "Join B" of a party with several groups (`group`). The live map presses
- * the same buttons (plan 8M-3).
+ * Here, Done, Leave, and "Join B" (`group`: the letter buttons of a post drawn before plan
+ * 8X-1B, `joinInto`). The live map presses the same buttons (plan 8M-3); its popup asks a
+ * newcomer which group as the post's dialog does, and sends Interested, Join and Here with it
+ * (`chosen`: as the dialog's Submit, `joinChosen` by the group's letter, so a member who signed
+ * up meanwhile keeps their group).
  */
 export type StatusPress =
-  { action: 'maybe' | 'join' | 'here' | 'done' | 'leave' } | { action: 'group'; group: GroupId };
+  | { action: 'maybe' | 'join' | 'here' | 'done' | 'leave' }
+  | { action: 'group'; group: GroupId }
+  | { action: 'chosen'; status: 'maybe' | 'join' | 'here'; group: GroupId };
 
 /** What a press is answered with: the outcome, and how its answer is worded. */
 export type PressAnswerer<R> = <Extra>(
@@ -279,7 +284,7 @@ export type PressAnswerer<R> = <Extra>(
  * its JSON). The one code path of the post's buttons and the map's.
  */
 export async function pressStatus<R>(
-  attendance: Pick<AttendanceService, 'signUp' | 'joinInto' | 'done' | 'leave'>,
+  attendance: Pick<AttendanceService, 'signUp' | 'joinInto' | 'joinChosen' | 'done' | 'leave'>,
   partyId: string,
   member: Member,
   press: StatusPress,
@@ -298,9 +303,22 @@ export async function pressStatus<R>(
       return answer(await attendance.leave(partyId, member), leftWords);
     case 'group':
       return answer(await attendance.joinInto(partyId, member, press.group));
+    case 'chosen':
+      return answer(
+        await attendance.joinChosen(partyId, member, CHOSEN_STATUS[press.status], {
+          group: press.group,
+        }),
+      );
   }
 }
 
+/** The status each button of the map's popup gives with a chosen group. */
+const CHOSEN_STATUS = {
+  maybe: PartyStatus.Interested,
+  join: PartyStatus.Coming,
+  here: PartyStatus.Present,
+} as const;
+
 /** What a member is told after an action that worked. */
 export function outcomeText<Extra>(
   ok: Ok<Extra>,
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index 8e5020b3ae1c5a101574a12c700e130b1293f686..268b04dd19eae20c984b46183dabfa9fccb30986 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -621,8 +621,11 @@ export function joinInto<P extends Party>(
   return setAttendance(party, memberId, PartyStatus.Coming, { group: groupId }, limits);
 }
 
-/** What a member chose in the dialog "which group?": any group with room, or one by its stamp. */
-export type GroupChoice = { any: true } | { group: GroupId; stamp: string };
+/**
+ * What a member chose in the dialog "which group?": any group with room, or one by its stamp; by
+ * its letter alone (`stamp` undefined) on the live map, whose popup names groups by letter.
+ */
+export type GroupChoice = { any: true } | { group: GroupId; stamp?: string };
 
 /**
  * The answer to "which group?" (plan 8X-1B, decision 2), decided as things are at the Submit: a
@@ -650,7 +653,10 @@ export function joinChosen<P extends Party>(
       : changed;
   }
   if ('any' in choice) return setAttendance(party, memberId, status, {}, limits);
-  if (!stampedGroup(party, choice.group, choice.stamp)) return refused('group-changed');
+  // By its letter alone, a group the party has not is no such group (setAttendance says so).
+  if (choice.stamp !== undefined && !stampedGroup(party, choice.group, choice.stamp)) {
+    return refused('group-changed');
+  }
   return setAttendance(party, memberId, status, { group: choice.group }, limits);
 }
 
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 59559f339201d9a8c0f129e2fd5c32e17812e5c4..16084b70d1d2521c6dca9846f65140fca2e0d4cb 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -114,6 +114,18 @@ export function groupStamp(
   return groupOpened(party, group).toString(36);
 }
 
+/**
+ * The groups newest first (by when they were opened, `groupOpened`; the later in the list on a
+ * tie): the order the dialogs about groups offer them in (plan 8X-1B: the newest is where
+ * newcomers usually go, and goes first, where Android picks it by itself).
+ */
+export function newestFirst(party: Pick<PartyCore, 'createdAt' | 'groups'>): PartyGroup[] {
+  return party.groups
+    .map((group, index) => ({ group, index }))
+    .sort((a, b) => groupOpened(party, b.group) - groupOpened(party, a.group) || b.index - a.index)
+    .map(({ group }) => group);
+}
+
 /**
  * The group of this letter while it is the one with this stamp (`groupStamp`); undefined when
  * the party has no such group, or the letter is another group's by now (the one named went and
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 325011426a19ca0619715b61de4a9da876ff719e..622e17cce6848a22c5e3398f153076bc0cad1193 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -9,7 +9,10 @@
 export const MAP_ACTIONS = ['interested', 'join', 'here', 'leave', 'done'] as const;
 export type MapAction = (typeof MAP_ACTIONS)[number];
 
-/** A press of a button: `join` with a group is "Join B" of a party with several groups. */
+/**
+ * A press of a button: with a group, the one a newcomer chose in the popup (`MapAttendance.pick`;
+ * before plan 8X-1B, `join` with a group was "Join B").
+ */
 export interface MapPress {
   action: MapAction;
   group?: string;
@@ -35,6 +38,19 @@ export interface MapAttendance {
   mine: { status: MapStatus; group: string } | null;
   /** The buttons that apply, in the post's order; none while the map is read-only. */
   actions: MapPress[];
+  /**
+   * Which group, asked of a member who is not signed up for a party of several groups (plan
+   * 8X-1B, as the post's dialog asks): the choices in its order, the first chosen to start with;
+   * Interested, Join and Here send the chosen `group` (none for "any group with room"). Absent
+   * where nothing is asked.
+   */
+  pick?: MapGroupChoice[];
+}
+
+/** A choice of the popup's question "which group?": a group's letter, none for any with room. */
+export interface MapGroupChoice {
+  group?: string;
+  label: string;
 }
 
 /** A raid's gym as its post names it: the name it shows, its place, its address line. */
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index 2358465f83e554629f182bfd457a85340724887a..c0107f6c58467ac5b3e2190a4bc90aa1788ca951 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -111,9 +111,15 @@ describe('partyView', () => {
     expect(view.raids[0]?.attendance.mine).toEqual({ status: 'coming', group: 'A' });
   });
 
-  it('gives a raid of several groups a Join for each, with Interested, Here and Leave', () => {
+  it('gives a raid of several groups the buttons of one, and asks a newcomer which group', () => {
+    // Plan 8X-1B: one Join, as the post has; the popup asks a member who is not signed up which
+    // group, by the post's dialog's rules and order (the newest group first).
+    const groups = [
+      { id: 'A' as const },
+      { id: 'B' as const, label: 'park side', opened: egg.createdAt + 1 },
+    ];
     const raid = withAttendees(
-      { ...egg, groups: [{ id: 'A' }, { id: 'B', label: 'park side' }], defaultGroupId: 'B' },
+      { ...egg, groups, defaultGroupId: 'B' },
       { [ALICE]: { group: 'B' }, [BOB]: { group: 'A', status: PartyStatus.Interested } },
     );
     const { attendance } = partyView(input([raid])).raids[0] ?? {};
@@ -123,12 +129,25 @@ describe('partyView', () => {
     ]);
     expect(attendance?.mine).toEqual({ status: 'coming', group: 'B' });
     expect(attendance?.actions).toEqual([
-      { action: 'join', group: 'A' },
-      { action: 'join', group: 'B' },
       { action: 'interested' },
+      { action: 'join' },
       { action: 'here' },
       { action: 'leave' },
     ]);
+    // Alice is signed up: nothing to ask.
+    expect(attendance).not.toHaveProperty('pick');
+    const newcomer = partyView(input([raid], { memberId: CAROL })).raids[0]?.attendance;
+    expect(newcomer?.pick).toEqual([
+      { group: 'B', label: 'Group B: park side' },
+      { group: 'A', label: 'Group A' },
+    ]);
+    // Where the groups have a size, any group with room first.
+    const sized = partyView(input([raid], { memberId: CAROL, lobbySize: () => 4 })).raids[0];
+    expect(sized?.attendance.pick?.[0]).toEqual({ label: 'Any group with room' });
+    // Nothing to ask while the map is read-only.
+    expect(
+      partyView(input([raid], { memberId: CAROL, readOnly: true })).raids[0]?.attendance,
+    ).not.toHaveProperty('pick');
   });
 
   it('offers Done once the raid has hatched, and Leave to a member signed up', () => {
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index d8c94fb42c05fefd9f78a2992ce708d22dd08dfa..5f6dad5ad90c075b4dabf75311cc7e520f25145b 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -1,5 +1,6 @@
 import {
   attendeeOf,
+  newestFirst,
   isRaid,
   mayArrange,
   type Attendee,
@@ -29,6 +30,7 @@ import type {
   MapMeetup,
   MapMeetupPlace,
   MapParty,
+  MapGroupChoice,
   MapPress,
   MapRaid,
   MapRaidPlace,
@@ -78,6 +80,11 @@ export interface PartyViewInput {
   zone: string;
   /** Discord cannot be reached: nothing may be pressed. */
   readOnly: boolean;
+  /**
+   * How many trainers a group of a party holds, where it has a size (`lobbySize`): the popup's
+   * question then offers "Any group with room" first. Left out: no party has one.
+   */
+  lobbySize?: (party: Party) => number | undefined;
   /** Who asks is staff of the server (an admin, a moderator, the bot's owner): may change raids. */
   staff: boolean;
   /**
@@ -123,9 +130,29 @@ function allowedPicture(url: string | undefined, origins: readonly string[]): st
 }
 
 /**
- * The counts per group, the member's own standing, and the post's buttons: with one group
- * Interested, Join, Here; with several a Join for each group, then Interested and Here; Done for
- * a raid that has hatched; Leave for a member who is signed up. None while read-only.
+ * The popup's question "which group?" (plan 8X-1B), asked as the post's dialog asks it: of a
+ * member who is not signed up for a party of several groups, "Any group with room" first where
+ * its groups have a size, then the groups newest first.
+ */
+function groupPick(party: Party, input: PartyViewInput): MapGroupChoice[] | undefined {
+  if (input.readOnly || party.groups.length < 2 || attendeeOf(party, input.memberId)) {
+    return undefined;
+  }
+  const sized = input.lobbySize?.(party) !== undefined;
+  return [
+    ...(sized ? [{ label: 'Any group with room' }] : []),
+    ...newestFirst(party).map((group) => ({
+      group: group.id,
+      label: group.label ? `Group ${group.id}: ${group.label}` : `Group ${group.id}`,
+    })),
+  ];
+}
+
+/**
+ * The counts per group, the member's own standing, and the post's buttons, the same for one
+ * group and several (plan 8X-1B): Interested, Join, Here; Done for a raid that has hatched;
+ * Leave for a member who is signed up. None while read-only. A newcomer to several groups is
+ * asked which (`groupPick`).
  */
 function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): MapAttendance {
   const groups: GroupCounts[] = party.groups.map((group) => ({
@@ -144,20 +171,17 @@ function attendanceOf(party: Party, input: PartyViewInput, hatched: boolean): Ma
   const own = attendeeOf(party, input.memberId);
   const ownStatus = own && mapStatus(own);
   const mine = own && ownStatus ? { status: ownStatus, group: own.group } : null;
-  const several = party.groups.length > 1;
   const actions: MapPress[] = input.readOnly
     ? []
     : [
-        ...(several
-          ? party.groups.map((group) => ({ action: 'join' as const, group: group.id }))
-          : []),
         { action: 'interested' },
-        ...(several ? [] : [{ action: 'join' as const }]),
+        { action: 'join' },
         { action: 'here' },
         ...(hatched ? [{ action: 'done' as const }] : []),
         ...(mine ? [{ action: 'leave' as const }] : []),
       ];
-  return { groups, mine, actions };
+  const pick = groupPick(party, input);
+  return { groups, mine, actions, ...(pick === undefined ? {} : { pick }) };
 }
 
 /**
diff --git a/src/render/group-dialogs.ts b/src/render/group-dialogs.ts
index 9fc08b560b51ba653ad57477cd4f7bceecae4ff7..15f2f19803676af9a4c7c248f94eaf879088f8e7 100644
--- a/src/render/group-dialogs.ts
+++ b/src/render/group-dialogs.ts
@@ -10,7 +10,7 @@ import {
 import {
   attendeeOf,
   groupOf,
-  groupOpened,
+  newestFirst,
   groupStamp,
   headCount,
   isGroupId,
@@ -74,14 +74,6 @@ export function chosenGroup(value: string): { group: GroupId; stamp: string } |
     : undefined;
 }
 
-/** The groups newest first (by when they were opened; the later in the list on a tie). */
-export function newestFirst(party: Party): PartyGroup[] {
-  return party.groups
-    .map((group, index) => ({ group, index }))
-    .sort((a, b) => groupOpened(party, b.group) - groupOpened(party, a.group) || b.index - a.index)
-    .map(({ group }) => group);
-}
-
 /** `Group B: by the bridge`, within the 100 characters of a choice's label. */
 export function groupLabel(group: PartyGroup): string {
   return truncate(group.label ? `Group ${group.id}: ${group.label}` : `Group ${group.id}`, 100);
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index e15b22c2c128b1bfe32f02ee82c56502526292a7..924ef12ae75d81d0d930e04f73723a26c316ebd9 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -208,6 +208,33 @@ describe('raidPopup', () => {
     expect(tagged(popup, 'button')[1]?.attributes).toMatchObject({ 'data-group': 'B' });
   });
 
+  it('asks a newcomer which group in the popup, the first chosen to start with (plan 8X-1B)', () => {
+    const popup = raidPopup(
+      raid({
+        attendance: attendance({
+          groups: [
+            { id: 'A', interested: 0, coming: 2, present: 0 },
+            { id: 'B', interested: 1, coming: 0, present: 0 },
+          ],
+          actions: [{ action: 'interested' }, { action: 'join' }, { action: 'here' }],
+          pick: [{ label: 'Any group with room' }, { group: 'B', label: 'Group B: <b>' }],
+        }),
+      }),
+      context,
+    );
+    const [select] = tagged(popup, 'select');
+    expect(select?.attributes).toMatchObject({
+      'data-group-pick': '',
+      'aria-label': 'Which group?',
+    });
+    expect(tagged(popup, 'option').map((option) => [option.text, option.attributes])).toEqual([
+      ['Any group with room', { value: '', selected: '' }],
+      ['Group B: <b>', { value: 'B' }],
+    ]);
+    // The buttons after it, in the popup's row of buttons.
+    expect(texts(popup).slice(-4)).toEqual(['Interested', 'Join', 'Here', 'Open the post']);
+  });
+
   it('says what is not known, and sets every text as text, never markup', () => {
     const popup = raidPopup(
       raid({
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index 8b0b5d10808711000521875479cc16879cc492c5..787a1f2e8c50d21f68920571f0a9e7699f978a97 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -114,22 +114,48 @@ function attendanceNodes(partyId: string, attendance: MapAttendance): PageNode[]
           {
             tag: 'div',
             className: 'presses',
-            children: attendance.actions.map((press): PageNode => ({
-              tag: 'button',
-              className: 'press',
-              text: pressLabel(press),
-              attributes: {
-                type: 'button',
-                'data-party': partyId,
-                'data-action': press.action,
-                ...(press.group === undefined ? {} : { 'data-group': press.group }),
-              },
-            })),
+            children: [
+              ...groupPick(attendance),
+              ...attendance.actions.map((press): PageNode => ({
+                tag: 'button',
+                className: 'press',
+                text: pressLabel(press),
+                attributes: {
+                  type: 'button',
+                  'data-party': partyId,
+                  'data-action': press.action,
+                  ...(press.group === undefined ? {} : { 'data-group': press.group }),
+                },
+              })),
+            ],
           },
         ]),
   ];
 }
 
+/**
+ * Which group, for a newcomer to a party of several (`MapAttendance.pick`, plan 8X-1B: as the
+ * post's dialog asks it): a menu before the buttons, its first choice chosen to start with;
+ * Interested, Join and Here send what it shows (`data-group-pick`: the page reads it at the
+ * press), none for "any group with room".
+ */
+function groupPick(attendance: MapAttendance): PageNode[] {
+  const { pick } = attendance;
+  if (pick === undefined || pick.length === 0) return [];
+  return [
+    {
+      tag: 'select',
+      className: 'group-pick',
+      attributes: { 'data-group-pick': '', 'aria-label': 'Which group?' },
+      children: pick.map((choice, index): PageNode => ({
+        tag: 'option',
+        text: choice.label,
+        attributes: { value: choice.group ?? '', ...(index === 0 ? { selected: '' } : {}) },
+      })),
+    },
+  ];
+}
+
 /** "Open the post": only an address of Discord, in a new tab that does not learn the map's. */
 function postLink(link: string): PageNode[] {
   return link.startsWith('https://discord.com/channels/')
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 20b774cdf4dd7db56630c54389461b741442915f..2a0bd2709b101b9f450249d62ca75064133f7e1e 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -244,8 +244,14 @@ export function showParties(
   });
 
   const press = async (button: HTMLButtonElement): Promise<void> => {
-    const { party, action, group } = button.dataset;
+    const { party, action } = button.dataset;
     if (party === undefined || action === undefined) return;
+    // The group a newcomer chose in the popup (plan 8X-1B), with Interested, Join and Here;
+    // empty for any group with room. A button of its own group (drawn before) names it.
+    const picked =
+      button.parentElement?.querySelector<HTMLSelectElement>('select[data-group-pick]');
+    const asks = action === 'interested' || action === 'join' || action === 'here';
+    const group = button.dataset.group ?? (asks && picked?.value ? picked.value : undefined);
     const buttons = button.parentElement?.querySelectorAll('button') ?? [];
     for (const each of buttons) each.disabled = true;
     const pressed = await pressParty(csrf, {
diff --git a/src/web/party-press.test.ts b/src/web/party-press.test.ts
index 2cb12ce91f0bf0dacfdbd0ec3828c43c564e3010..697720d910427cf8681c9e50118f9bab22b81e16 100644
--- a/src/web/party-press.test.ts
+++ b/src/web/party-press.test.ts
@@ -92,9 +92,11 @@ describe('pressing the buttons of a party on the map', () => {
     const id = map.made.party.id;
     expect((await map.post(press(id, 'interested'))).json.text).toBe('You are interested.');
     expect((await map.post(press(id, 'here'))).json.text).toBe('You are here.');
+    // Signed up already: a group sent with Join is the popup's question, which Alice was not
+    // asked; she stays in her group (plan 8X-1B).
     expect((await map.post(press(id, 'join'), { group: 'B' })).json).toMatchObject({
-      ok: false,
-      text: 'This raid has no such group.',
+      ok: true,
+      text: 'You are coming.',
     });
     expect((await map.post(press(id, 'leave'))).json).toEqual({
       ok: true,
@@ -103,6 +105,30 @@ describe('pressing the buttons of a party on the map', () => {
     expect(map.made.current().attendees[ALICE]).toBeUndefined();
   });
 
+  it('takes the group a newcomer chose in the popup with Interested and Here as with Join (plan 8X-1B)', async () => {
+    const map = await onTheMap(await reportedRaid());
+    web = map.web;
+    const id = map.made.party.id;
+    await map.made.attendance.newGroup(id, { id: BOB, name: 'Bob' });
+    expect((await map.post(press(id, 'interested'), { group: 'A' })).json).toEqual({
+      ok: true,
+      text: 'You are interested, in group A.',
+    });
+    // Signed up meanwhile: the status in their own group, as the post's dialog decides.
+    expect((await map.post(press(id, 'here'), { group: 'B' })).json).toEqual({
+      ok: true,
+      text: 'You are here, in group A.',
+    });
+    expect(map.made.current().attendees[ALICE]).toMatchObject({ group: 'A' });
+    // So does Join: its group is the popup's question, not a move (Group… moves).
+    expect((await map.post(press(id, 'join'), { group: 'B' })).json).toEqual({
+      ok: true,
+      text: 'You are coming, in group A.',
+    });
+    expect((await map.post(press(id, 'leave'), { group: 'A' })).status).toBe(400);
+    expect((await map.post(press(id, 'done'), { group: 'A' })).status).toBe(400);
+  });
+
   it("answers Done on an egg with the post's refusal", async () => {
     const map = await onTheMap(await reportedRaid());
     web = map.web;
diff --git a/src/web/party-routes.ts b/src/web/party-routes.ts
index 616cbc0659324f76981f4de0dc6e43d20507ccc8..8a783fbda526a1c29f85d65d630f7b9b18edaac7 100644
--- a/src/web/party-routes.ts
+++ b/src/web/party-routes.ts
@@ -60,7 +60,10 @@ export interface PartyWebDeps {
   /** `settings.timezone`: the posts' times, which the page shows. */
   zone: string;
   /** What a press does: what the post's buttons call (`pressStatus`). */
-  attendance: Pick<AttendanceService, 'signUp' | 'joinInto' | 'done' | 'leave' | 'limits'>;
+  attendance: Pick<
+    AttendanceService,
+    'signUp' | 'joinInto' | 'joinChosen' | 'done' | 'leave' | 'limits' | 'lobbyOf'
+  >;
   /** Who presses, fetched fresh from Discord as a button carries them (`DiscordWebMembers`). */
   acting: ActingMembers;
   /**
@@ -94,7 +97,10 @@ export interface ActingMembers {
 /** The presses one address may send in a minute, whoever sends them. */
 export const PRESSES_PER_ADDRESS_MINUTE = 60;
 
-/** The body of a press: the group of "Join B", only with `join`. Anything else is malformed. */
+/**
+ * The body of a press: the group a newcomer chose in the popup (plan 8X-1B), only with `join`,
+ * `interested` and `here`. Anything else is malformed.
+ */
 const pressBodySchema = z
   .object({
     group: z
@@ -115,10 +121,13 @@ const PRESS_STATUS: Readonly<Record<AttendanceOutcome['kind'], number>> = {
 function statusPress(action: MapAction, group: GroupId | undefined): StatusPress {
   switch (action) {
     case 'interested':
-      return { action: 'maybe' };
+      return group === undefined
+        ? { action: 'maybe' }
+        : { action: 'chosen', status: 'maybe', group };
     case 'join':
-      return group === undefined ? { action: 'join' } : { action: 'group', group };
+      return group === undefined ? { action: 'join' } : { action: 'chosen', status: 'join', group };
     case 'here':
+      return group === undefined ? { action } : { action: 'chosen', status: 'here', group };
     case 'leave':
     case 'done':
       return { action };
@@ -168,6 +177,7 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
     now: deps.now(),
     zone: parties.zone,
     readOnly: viewer.readOnly,
+    lobbySize: (party) => parties.attendance.lobbyOf(party),
     staff: isMapStaff(viewer.standing, memberId, parties.ownerId),
     botStaff: isMapBotStaff(viewer.standing, memberId, parties.ownerId),
     look: (raid) => parties.look(raid),
@@ -238,7 +248,8 @@ export function partyRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const body = pressBodySchema.safeParse(request.body ?? {});
       if (!isMapAction(action) || !body.success) return sendFailure(request, reply, 400);
       const { group } = body.data;
-      if (group !== undefined && (action !== 'join' || !isGroupId(group))) {
+      const takesGroup = action === 'join' || action === 'interested' || action === 'here';
+      if (group !== undefined && (!takesGroup || !isGroupId(group))) {
         return sendFailure(request, reply, 400);
       }
       const press = statusPress(action, group);
diff --git a/test/support/web.ts b/test/support/web.ts
index 68f293e56054004a9bc28f94114acf95d2f2c9da..645b82a8b34dbcda74328ca3c65c81058d68136f 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -228,11 +228,15 @@ const NO_PARTIES: PartyWebDeps = {
   attendance: {
     signUp: noAttendance,
     joinInto: noAttendance,
+    joinChosen: noAttendance,
     done: noAttendance,
     leave: noAttendance,
     limits: () => {
       throw new Error('no parties in this test: give partyWebWith');
     },
+    lobbyOf: () => {
+      throw new Error('no parties in this test: give partyWebWith');
+    },
   },
   acting: new FakeActingMembers(),
   throttles: new Throttles(),
````
