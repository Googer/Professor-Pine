# Phase 8T-H: The Split's Confirmation as a Dialog: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Split group…" on a train's post and `/group split letter:X` open a Discord dialog (modal) in place of 8T's private confirmation: no scrolling to find the reply, one dialog per member at a time. The conductor and staff pick the group from a radio list naming who is in each.

**Architecture:**

- **The dialogs and the fake forms** (task 1): `splitDialog(view, groups)` in `src/render/train-split.ts` draws the one-group dialog (one text display, custom id `party:<id>:splitform:<group>:<mark>`) and the several-groups dialog (common text and the required radio group `Group that leaves`, nothing picked, each choice's value `<group>:<mark>`, label and description cut to 100). `party-post.ts` gains `groupInPostOrder` and `guestsOf`. The fake forms (`test/support/fake-interactions.ts`, `fake-gateway.ts`) check radio groups (2–10 choices) and text displays, and a submitted form carries a radio pick. 8T's confirmation stays until task 2.
- **Discord** (task 2): `openSplit` and `/group split` show the dialog as the first answer (only the member's privacy is read before it); `submitSplit` defers privately, runs `splitGroupAs` with the mark as `drawn` and answers in plain text. The confirmation, `splitgo`, `splitno`, `splitpick` go; their old presses get the router's stale answer. Docs: `trains.md`, `discord-framework.md`, `parties-and-posts.md`, the 8T design's pointer, the 8T staging checklist, `/group split`'s help.

**Tech Stack:** TypeScript 6.0, Node 24, discord.js 14, Vitest. No new dependency, no migration, no change of the party state (still version 11).

**Spec:** `docs/superpowers/specs/2026-10-18-train-split-dialog-design.md` (approved by Matt, 2026-10-18; a text-only dialog and a required radio group checked on the test server). Brief `.superpowers/sdd/2026-10-18-phase-8th-split-dialog/design.md` (git-ignored), mockup `split-dialog-v4.html` there.

**Every diff in this plan was run before the plan was written** on a throwaway branch (`proto-8th`), one commit per task. On the tip the full check (7,924 unit tests), the build and the database suite (487) are clean. An Opus reviewer went through the prototype (ready after fixes: four minor, four nits, all folded into the commits below).

## Decisions in this plan

1. **One action, `splitform`,** for both dialogs: arguments in the custom id mean one group; none means the radio pick.
2. **Answers after Submit are plain text** (single sentences), as the design's `Split off: <link>`.
3. **Choice labels are raw text,** not `plain()`: Discord shows no markdown in choices (assumed, as for select options; 8T staging step 28 checks a name with `*`, `_` and a domain).
4. **A long label is cut** at the group's own label (40 characters), then as many names as fit, then `, and N more`; a long train name in a description is cut before the group's suffix and who leads, which stay whole.
5. **Who moves** is listed in the post's order in both dialogs.
6. **The description drops `it has no conductor; `** when the old train keeps its conductor (mockup v4).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- **Tests never use the network** and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8th`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`. Stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. Nothing deferred or slow before `showModal`; guards and throttles on opening and Submit.
2. The mark carried through the dialog: a group renamed or replaced meanwhile is refused; who is in it at Submit goes (Matt's ruling).
3. The fake forms match Discord's rules for radio groups.

### Task 1: Plan 8T-H T1: the split's two dialogs, and radio groups in the fake forms (8T-H-1)

Prototype commit: `9d4b362d94fdababcbb53ceb91ababe9b5890ec7`

splitDialog draws the dialog that takes the place of the private
confirmation: for one group a text only (what becomes of the group, who
moves, who leads, "Submit splits it off."), its custom id
party:<id>:splitform:<group>:<mark>; for several a common text and the
required radio group "Group that leaves", nothing picked, each choice
named by the group and its members as the post lists them (status by
status, guests as +1; groupInPostOrder) and described by the new train's
name and who leads which, both cut to 100 characters, its value
<group>:<mark> (splitChoice reads it). The confirmation of plan 8T stays
until the next task wires the dialog in.

The fake forms check radio groups (2 to 10 choices) and text displays
(1 to 4,000 characters), and a submitted form carries a radio group's
pick (picked, fields.getRadioGroup), refusing a required one left
unpicked as Discord does.

**Files:**

```
 docs/architecture/testing.md           |   2 +-
 src/render/party-post.ts               |  29 +++-
 src/render/train-split.test.ts         | 399 +++++++++++++++++++++++++++++++++++++++++++++++++----
 src/render/train-split.ts              | 269 ++++++++++++++++++++++++++++++------
 test/support/fake-gateway.ts           |  11 +-
 test/support/fake-interactions.test.ts |  65 +++++++++
 test/support/fake-interactions.ts      |  67 +++++++--
 7 files changed, 755 insertions(+), 87 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, then `npx vitest run --project unit --project isolated src/render/train-split.test.ts test/support/fake-interactions.test.ts src/render/party-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9d4b362d94fdababcbb53ceb91ababe9b5890ec7 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8th-split-dialog.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T-H T1: the split's two dialogs, and radio groups in the fake forms (8T-H-1)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/testing.md
git add -- src/render/party-post.ts
git add -- src/render/train-split.test.ts
git add -- src/render/train-split.ts
git add -- test/support/fake-gateway.ts
git add -- test/support/fake-interactions.test.ts
git add -- test/support/fake-interactions.ts
```

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index abb01d74..a65ee7c6 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -25,7 +25,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Fake interactions
 
-- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options and checkbox groups of 1 to 10, values unique, `min_values` / `max_values` within the options, no more defaults than may be chosen). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus) and `checked` (checkbox groups, `fields.getCheckboxGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`), needs a value for a required menu and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
+- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu or radio group (Discord refuses the Submit without one), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
 
 ## Parties
 
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 6d144823..36b83a68 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -134,10 +134,14 @@ export function tidyTitle(text: string): string {
   return text.replace(/\s+/g, ' ').trim();
 }
 
+/** What a post adds to an attendee's name for those they bring: ` +2`, or nothing. */
+export function guestsOf(attendee: Attendee): string {
+  return attendee.number > 1 ? ` +${attendee.number - 1}` : '';
+}
+
 function attendeeText(memberId: string, attendee: Attendee, emoji: PostEmoji): string {
-  const extra = attendee.number > 1 ? ` +${attendee.number - 1}` : '';
   const name = memberName({ id: memberId, name: attendee.name });
-  return `${name}${extra}${attendee.remote ? ` ${emoji.remote}` : ''}`;
+  return `${name}${guestsOf(attendee)}${attendee.remote ? ` ${emoji.remote}` : ''}`;
 }
 
 /**
@@ -594,6 +598,9 @@ export function fittedLayout(
   return laid();
 }
 
+/** The statuses a post lists in a group, in its order (who completed a raid comes after). */
+const GROUP_STATUSES: readonly ShownStatus[] = ['interested', 'coming', 'present'];
+
 const STATUS_WORDS: Readonly<Record<ShownStatus, string>> = {
   interested: 'Interested',
   coming: 'Coming',
@@ -637,6 +644,22 @@ function statusMembers(
   return { heads, items: attendeeTexts(party, ids, emoji) };
 }
 
+/**
+ * The members of a group in the order the group's block of a post lists them: status by status
+ * (Interested, Coming, Present), each in shown order (`inShownOrder`).
+ */
+export function groupInPostOrder(party: Party, groupId: string): string[] {
+  return GROUP_STATUSES.flatMap((status) =>
+    inShownOrder(
+      party,
+      membersWhere(
+        party,
+        (attendee) => shownStatus(attendee) === status && attendee.group === groupId,
+      ),
+    ),
+  );
+}
+
 export interface TrainerOptions {
   /** Whether the party is completed (a raid): the status Complete, with Done. */
   complete: boolean;
@@ -683,7 +706,7 @@ function lobbyNote(view: TrainersView, group: PartyGroup, options: TrainerOption
 export function trainerBlocks(view: TrainersView, options: TrainerOptions, fit: Fit): PostBlock[] {
   const { list } = fit;
   const { party } = view;
-  const statuses: ShownStatus[] = ['interested', 'coming', 'present'];
+  const statuses = GROUP_STATUSES;
   const [only] = party.groups;
   if (only && party.groups.length === 1) {
     const blocks: PostBlock[] = [];
diff --git a/src/render/train-split.test.ts b/src/render/train-split.test.ts
index 941ddf37..c021e2e7 100644
--- a/src/render/train-split.test.ts
+++ b/src/render/train-split.test.ts
@@ -1,5 +1,11 @@
-import { ComponentType, type APIStringSelectComponent } from 'discord.js';
+import {
+  ComponentType,
+  type APIModalInteractionResponseCallbackData,
+  type APIRadioGroupComponent,
+  type APIStringSelectComponent,
+} from 'discord.js';
 import { describe, expect, it } from 'vitest';
+import { checkModal } from '../../test/support/fake-interactions.js';
 import { testGyms } from '../../test/support/gyms.js';
 import {
   accentOf,
@@ -8,6 +14,8 @@ import {
   selectsOf,
   textDisplays,
 } from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import { TRAIN_PANEL_COLOUR } from './train-panel.js';
 import {
   ALICE,
   BOB,
@@ -17,25 +25,40 @@ import {
   testTrain,
   withAttendees,
 } from '../../test/support/parties.js';
-import { expectV2Sendable } from '../../test/support/post-limits.js';
 import { decodeCustomId } from '../discord/custom-id.js';
-import type { Attendee, PartyGroup, TrainDetails, TrainParty } from '../domain/party/party.js';
+import type {
+  Attendee,
+  GroupId,
+  PartyGroup,
+  TrainDetails,
+  TrainParty,
+} from '../domain/party/party.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { groupMark } from '../domain/party/train.js';
 import type { PostGym } from './raid-post.js';
-import { TRAIN_PANEL_COLOUR } from './train-panel.js';
-import { splitConfirmation, splitNote, type SplitView } from './train-split.js';
+import {
+  SPLIT_FORM,
+  SPLIT_GROUP_INPUT,
+  splitChoice,
+  splitConfirmation,
+  splitDialog,
+  splitNote,
+  type SplitConfirmationView,
+  type SplitView,
+} from './train-split.js';
 
 const HOUR = 3_600_000;
 const gyms = new Map<number, PostGym>(testGyms().map((gym) => [gym.id, gym]));
 const DAVE = '200000000000000005';
+const ERIKA = '200000000000000006';
 
 /**
- * "Saturday legendaries" on stop 2 of 3 (4, 1, 7), the maker in A with Carol, group B (Fast)
- * with Alice (named Dawn) and Bob (named Iris).
+ * "Saturday legendaries" on stop 2 of 3 (4, 1, 7): the maker (named Ash, interested) in A with
+ * Carol, group B (Fast) with Alice (named Dawn) and Bob (named Iris).
  */
 function train(more: Partial<TrainDetails> = {}, groups?: PartyGroup[]): TrainParty {
   const made = withAttendees(testTrain(), {
+    [REPORTER]: { name: 'Ash', status: PartyStatus.Interested },
     [CAROL]: { name: 'Carol' },
     [ALICE]: { group: 'B', name: 'Dawn' },
     [BOB]: { group: 'B', name: 'Iris' },
@@ -57,18 +80,333 @@ function view(party: TrainParty, extra: Partial<SplitView> = {}): SplitView {
     memberId: ALICE,
     staff: false,
     anonymous: false,
-    group: 'B',
     now: PARTY_NOW,
     ...extra,
   };
 }
 
-const textOf = (party: TrainParty, extra: Partial<SplitView> = {}, note?: string): string =>
-  textDisplays(splitConfirmation(view(party, extra), note)).join('\n');
+/** The texts of the dialog's text displays. */
+function textsOf(dialog: APIModalInteractionResponseCallbackData): string[] {
+  return dialog.components.flatMap((component) =>
+    component.type === ComponentType.TextDisplay ? [component.content] : [],
+  );
+}
+
+/** The radio group of the dialog, if it has one. */
+function radioOf(dialog: APIModalInteractionResponseCallbackData):
+  | {
+      label: string;
+      radio: APIRadioGroupComponent;
+    }
+  | undefined {
+  for (const component of dialog.components) {
+    if (
+      component.type === ComponentType.Label &&
+      component.component.type === ComponentType.RadioGroup
+    ) {
+      return { label: component.label, radio: component.component };
+    }
+  }
+  return undefined;
+}
+
+/** The one-group dialog's text, for the member and group `extra` and `group` say. */
+const textOf = (party: TrainParty, extra: Partial<SplitView> = {}, group: GroupId = 'B'): string =>
+  textsOf(splitDialog(view(party, extra), [group])).join('\n');
+
+describe('the dialog of splitting one group off', () => {
+  it('says what becomes of the group, who moves and who leads, and has nothing to pick', () => {
+    const party = train({ conductorId: CAROL });
+    const dialog = splitDialog(view(party), ['B']);
+    expect(() => checkModal(dialog)).not.toThrow();
+    expect(dialog.title).toBe('Split a group off the train');
+    expect(decodeCustomId(dialog.custom_id)).toEqual({
+      kind: 'party',
+      id: party.id,
+      action: SPLIT_FORM,
+      args: ['B', groupMark(party, 'B')],
+    });
+    expect(dialog.components).toHaveLength(1);
+    expect(textsOf(dialog)).toEqual([
+      [
+        'Group **B (Fast)** leaves **Saturday legendaries** and becomes a train of its own, ' +
+          '**Saturday legendaries (Fast)**:',
+        '- the same route, at the same stop (stop 2 of 3: The Stacks), the same end mode, ' +
+          'boss and start',
+        '- Dawn and Iris move to it as they are signed up now',
+        '- you are its conductor; Carol stays the conductor of Saturday legendaries',
+        '',
+        'Submit splits it off.',
+      ].join('\n'),
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
+    // No conductor anywhere: the member in the group leads the new one.
+    expect(textOf(train())).toContain('- you are its conductor');
+    // Unless they asked not to be named: then nobody does, as for a train made anonymously.
+    expect(textOf(train(), { anonymous: true })).toMatch(/^- it has no conductor$/mu);
+    expect(textOf(train({ conductorId: CAROL }), { anonymous: true })).toContain(
+      '- it has no conductor; Carol stays the conductor of Saturday legendaries',
+    );
+    // The conductor who goes with the group leads it still.
+    expect(textOf(train({ conductorId: ALICE }), { anonymous: true })).toContain(
+      '- you are its conductor, and Saturday legendaries has none then',
+    );
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
+    expect(textOf(train({}, [{ id: 'A' }, { id: 'B' }]))).toContain(
+      'Group **B** leaves **Saturday legendaries** and becomes a train of its own, ' +
+        '**Saturday legendaries (B)**:',
+    );
+  });
+
+  it('is for the one group asked about, also for staff, who may split several', () => {
+    const party = train({ conductorId: CAROL });
+    const dialog = splitDialog(view(party, { memberId: DAVE, staff: true }), ['A']);
+    expect(radioOf(dialog)).toBeUndefined();
+    expect(decodeCustomId(dialog.custom_id)?.args).toEqual(['A', groupMark(party, 'A')]);
+    expect(textsOf(dialog)[0]).toMatch(/^Group \*\*A\*\* leaves \*\*Saturday legendaries\*\*/u);
+  });
+
+  it('names who moves in the order the post lists them, without their guests', () => {
+    const party = withAttendees(train(), {
+      // Interested: the post lists Zed before those who come.
+      [DAVE]: { group: 'B', name: 'Zed', number: 2, status: PartyStatus.Interested },
+    });
+    expect(textOf(party)).toContain('- Zed, Dawn and Iris move to it as they are signed up now');
+  });
+
+  it('cuts a long list of who moves', () => {
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 30; n++) {
+      crowd[`4${String(n).padStart(17, '0')}`] = { group: 'B', name: `Trainer ${n}` };
+    }
+    expect(textOf(withAttendees(train(), crowd))).toMatch(
+      /- Dawn, Iris, Trainer 0, .+, and \d+ more move to it/u,
+    );
+  });
+});
+
+describe('the dialog of picking the group to split off', () => {
+  /** Carol, the conductor in A, may split A and B; and C, with Erika in it, too. */
+  function three(more: Partial<TrainDetails> = {}): TrainParty {
+    const party = train({ conductorId: CAROL, ...more }, [
+      { id: 'A' },
+      { id: 'B', label: 'Fast' },
+      { id: 'C' },
+    ]);
+    return withAttendees(party, { [ERIKA]: { group: 'C', name: 'Erika' } });
+  }
+
+  it('says what is the same for every group, and asks for one, none picked', () => {
+    const party = three();
+    const dialog = splitDialog(view(party, { memberId: CAROL }), ['A', 'B', 'C']);
+    expect(() => checkModal(dialog)).not.toThrow();
+    expect(dialog.title).toBe('Split a group off the train');
+    // The dialog names the train; the pick names the group and its mark.
+    expect(decodeCustomId(dialog.custom_id)).toEqual({
+      kind: 'party',
+      id: party.id,
+      action: SPLIT_FORM,
+      args: [],
+    });
+    expect(textsOf(dialog)).toEqual([
+      'The group you pick leaves **Saturday legendaries** and becomes a train of its own: the ' +
+        'same route, at the same stop (stop 2 of 3: The Stacks), the same end mode, boss and ' +
+        'start. Its members move to it as they are signed up now.',
+    ]);
+    const shown = radioOf(dialog);
+    expect(shown?.label).toBe('Group that leaves');
+    expect(shown?.radio.custom_id).toBe(SPLIT_GROUP_INPUT);
+    expect(shown?.radio.required).toBe(true);
+    expect(
+      shown?.radio.options.map((option) => [
+        option.label,
+        option.description,
+        splitChoice(option.value),
+        option.default,
+      ]),
+    ).toEqual([
+      [
+        'Group A · Ash, Carol',
+        'Saturday legendaries (A) · you are its conductor, and Saturday legendaries has none then',
+        { group: 'A', mark: groupMark(party, 'A') },
+        undefined,
+      ],
+      [
+        'Group B (Fast) · Dawn, Iris',
+        'Saturday legendaries (Fast) · you stay the conductor of Saturday legendaries',
+        { group: 'B', mark: groupMark(party, 'B') },
+        undefined,
+      ],
+      [
+        'Group C · Erika',
+        'Saturday legendaries (C) · you stay the conductor of Saturday legendaries',
+        { group: 'C', mark: groupMark(party, 'C') },
+        undefined,
+      ],
+    ]);
+  });
+
+  it('names the members of each group as the post lists them: by status, with their guests', () => {
+    const party = withAttendees(three(), {
+      // Interested, with a guest: the post lists them before those who come.
+      [DAVE]: { group: 'B', name: 'Cilan', number: 2, status: PartyStatus.Interested },
+    });
+    const dialog = splitDialog(view(party, { memberId: CAROL }), ['B', 'C']);
+    expect(radioOf(dialog)?.radio.options.map((option) => option.label)).toEqual([
+      'Group B (Fast) · Cilan +1, Dawn, Iris',
+      'Group C · Erika',
+    ]);
+  });
+
+  it('says who leads which train as staff, who lead neither', () => {
+    const party = three();
+    const dialog = splitDialog(view(party, { memberId: DAVE, staff: true }), ['A', 'B']);
+    expect(radioOf(dialog)?.radio.options.map((option) => option.description)).toEqual([
+      'Saturday legendaries (A) · Carol is its conductor, and Saturday legendaries has none then',
+      'Saturday legendaries (Fast) · Carol stays the conductor of Saturday legendaries',
+    ]);
+    const leaderless = splitDialog(
+      view(three({ conductorId: null }), { memberId: DAVE, staff: true }),
+      ['A', 'B'],
+    );
+    expect(radioOf(leaderless)?.radio.options.map((option) => option.description)).toEqual([
+      'Saturday legendaries (A) · it has no conductor',
+      'Saturday legendaries (Fast) · it has no conductor',
+    ]);
+  });
+
+  it('cuts a choice to what Discord takes: a long label, many members, a long train name', () => {
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 30; n++) {
+      crowd[`4${String(n).padStart(17, '0')}`] = { group: 'B', name: `Trainer number ${n}` };
+    }
+    const party: TrainParty = {
+      ...withAttendees(three(), crowd),
+      timed: { name: 'A very long train name '.repeat(4).trim(), startTime: null },
+      groups: [{ id: 'A' }, { id: 'B', label: 'Fast and furious '.repeat(6).trim() }, { id: 'C' }],
+    };
+    const dialog = splitDialog(view(party, { memberId: CAROL }), ['A', 'B', 'C']);
+    expect(() => checkModal(dialog)).not.toThrow();
+    const [, long] = radioOf(dialog)?.radio.options ?? [];
+    expect(long?.label.length).toBeLessThanOrEqual(100);
+    expect(long?.label).toMatch(
+      /^Group B \(Fast and furious .*…\) · Dawn, Iris, .+, and \d+ more$/u,
+    );
+    // The train's name is cut, in both places, so that the group and who leads stay whole.
+    const descriptions = (radioOf(dialog)?.radio.options ?? []).map(
+      (option) => option.description ?? '',
+    );
+    for (const description of descriptions) expect(description.length).toBeLessThanOrEqual(100);
+    expect(long?.description).toMatch(
+      /^A very long .*… \(Fast and furious .*…\) · you stay the conductor of A very long .*…$/u,
+    );
+    expect(descriptions[0]).toMatch(
+      /^A very long train name .*… \(A\) · you are its conductor, and A very long .*… has none then$/u,
+    );
+    expect(descriptions[2]).toMatch(
+      /^A very long train name .*… \(C\) · you stay the conductor of A very long .*…$/u,
+    );
+  });
+
+  it('counts the members it has no name for among the more', () => {
+    const party = withAttendees(three(), { [DAVE]: { group: 'C' } });
+    const dialog = splitDialog(view(party, { memberId: CAROL }), ['B', 'C']);
+    expect(radioOf(dialog)?.radio.options.map((option) => option.label)).toEqual([
+      'Group B (Fast) · Dawn, Iris',
+      'Group C · Erika, and 1 more',
+    ]);
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
+    const shown = { ...view(party, { memberId: REPORTER }), gym: heavy };
+    for (const groups of [['B'], ['A', 'B', 'C', 'D', 'E']] as const) {
+      expect(() => checkModal(splitDialog(shown, groups))).not.toThrow();
+    }
+  });
+});
+
+describe('splitChoice', () => {
+  it('reads a choice as the group and its mark, and nothing else', () => {
+    expect(splitChoice('B:1x2y3z')).toEqual({ group: 'B', mark: '1x2y3z' });
+    expect(splitChoice('B')).toBeUndefined();
+    expect(splitChoice('B:')).toBeUndefined();
+    expect(splitChoice('Q:1x2y3z')).toBeUndefined();
+  });
+});
+
+/** The confirmation of plan 8T asks about group B unless `extra` says otherwise. */
+const confirmView = (
+  party: TrainParty,
+  extra: Partial<SplitConfirmationView> = {},
+): SplitConfirmationView => ({ ...view(party), group: 'B', ...extra });
+
+const confirmationText = (
+  party: TrainParty,
+  extra: Partial<SplitConfirmationView> = {},
+  note?: string,
+): string => textDisplays(splitConfirmation(confirmView(party, extra), note)).join('\n');
 
 describe('splitConfirmation', () => {
   it('asks in one grey container: what becomes of the group, who moves, who leads', () => {
-    const message = splitConfirmation(view(train({ conductorId: CAROL })));
+    const message = splitConfirmation(confirmView(train({ conductorId: CAROL })));
     expect(accentOf(message)).toBe(TRAIN_PANEL_COLOUR);
     expect(textDisplays(message)).toEqual([
       [
@@ -101,17 +439,17 @@ describe('splitConfirmation', () => {
   });
 
   it('says where the train is as it is: no route, finished, not started yet', () => {
-    expect(textOf(train({ route: [], stop: 0 }))).toContain(
+    expect(confirmationText(train({ route: [], stop: 0 }))).toContain(
       '- no route yet, the same end mode, boss and start',
     );
-    expect(textOf(train({ stop: 3 }))).toContain(
+    expect(confirmationText(train({ stop: 3 }))).toContain(
       '- the same route, finished, the same end mode, boss and start',
     );
     const waiting = {
       ...train(),
       timed: { name: 'Saturday legendaries', startTime: PARTY_NOW + HOUR },
     };
-    expect(textOf(waiting)).toContain(
+    expect(confirmationText(waiting)).toContain(
       '- the same route, at the same stop (stop 2 of 3: The Stacks), not started yet, ' +
         'the same end mode, boss and start',
     );
@@ -119,35 +457,35 @@ describe('splitConfirmation', () => {
 
   it('names who leads each train afterwards', () => {
     // The conductor goes with the group.
-    expect(textOf(train({ conductorId: ALICE }))).toContain(
+    expect(confirmationText(train({ conductorId: ALICE }))).toContain(
       '- you are its conductor, and Saturday legendaries has none then',
     );
-    expect(textOf(train({ conductorId: BOB }), { memberId: BOB })).toContain(
+    expect(confirmationText(train({ conductorId: BOB }), { memberId: BOB })).toContain(
       '- you are its conductor, and Saturday legendaries has none then',
     );
     // No conductor anywhere: the presser in the group leads the new one.
-    expect(textOf(train())).toContain('- you are its conductor');
+    expect(confirmationText(train())).toContain('- you are its conductor');
     // Unless they asked not to be named: then nobody does, as for a train made anonymously.
-    expect(textOf(train(), { anonymous: true })).toMatch(/^- it has no conductor$/mu);
-    expect(textOf(train({ conductorId: CAROL }), { anonymous: true })).toContain(
+    expect(confirmationText(train(), { anonymous: true })).toMatch(/^- it has no conductor$/mu);
+    expect(confirmationText(train({ conductorId: CAROL }), { anonymous: true })).toContain(
       '- it has no conductor; Carol stays the conductor of Saturday legendaries',
     );
     // The conductor who goes with the group leads it still.
-    expect(textOf(train({ conductorId: ALICE }), { anonymous: true })).toContain(
+    expect(confirmationText(train({ conductorId: ALICE }), { anonymous: true })).toContain(
       '- you are its conductor, and Saturday legendaries has none then',
     );
     // The conductor of the old train splits a group they are not in.
-    expect(textOf(train({ conductorId: CAROL }), { memberId: CAROL })).toContain(
+    expect(confirmationText(train({ conductorId: CAROL }), { memberId: CAROL })).toContain(
       '- it has no conductor; you stay the conductor of Saturday legendaries',
     );
     // Staff, with the conductor in the group.
-    expect(textOf(train({ conductorId: BOB }), { memberId: DAVE, staff: true })).toContain(
-      '- Iris is its conductor, and Saturday legendaries has none then',
-    );
+    expect(
+      confirmationText(train({ conductorId: BOB }), { memberId: DAVE, staff: true }),
+    ).toContain('- Iris is its conductor, and Saturday legendaries has none then');
   });
 
   it('says it of a group without a label by its letter', () => {
-    const text = textOf(train({}, [{ id: 'A' }, { id: 'B' }]));
+    const text = confirmationText(train({}, [{ id: 'A' }, { id: 'B' }]));
     expect(text).toContain(
       'Group **B** leaves **Saturday legendaries** and becomes a train of its own, ' +
         '**Saturday legendaries (B)**:',
@@ -161,7 +499,7 @@ describe('splitConfirmation', () => {
       { id: 'C' },
     ]);
     const withC = withAttendees(party, { [DAVE]: { group: 'C' } });
-    const message = splitConfirmation(view(withC, { memberId: CAROL }));
+    const message = splitConfirmation(confirmView(withC, { memberId: CAROL }));
     const menu = allComponents(message).find(
       (component): component is APIStringSelectComponent =>
         (component as { type?: unknown }).type === ComponentType.StringSelect,
@@ -180,7 +518,7 @@ describe('splitConfirmation', () => {
   });
 
   it('puts why a press did nothing above the question', () => {
-    expect(textOf(train(), {}, 'The groups of this train changed meanwhile.')).toMatch(
+    expect(confirmationText(train(), {}, 'The groups of this train changed meanwhile.')).toMatch(
       /^### Split a group off the train\nThe groups of this train changed meanwhile\.\nGroup /u,
     );
   });
@@ -190,7 +528,7 @@ describe('splitConfirmation', () => {
     for (let n = 0; n < 30; n++) {
       crowd[`4${String(n).padStart(17, '0')}`] = { group: 'B', name: `Trainer ${n}` };
     }
-    const text = textOf(withAttendees(train(), crowd));
+    const text = confirmationText(withAttendees(train(), crowd));
     expect(text).toMatch(/- Dawn, Iris, Trainer 0, .+, and \d+ more move to it/u);
   });
 
@@ -217,7 +555,10 @@ describe('splitConfirmation', () => {
       timed: { name: '*'.repeat(80), startTime: PARTY_NOW + HOUR },
       groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id, label: '*'.repeat(100) })),
     };
-    const message = splitConfirmation({ ...view(party, { memberId: REPORTER }), gym: heavy }, 'x');
+    const message = splitConfirmation(
+      { ...confirmView(party, { memberId: REPORTER }), gym: heavy },
+      'x',
+    );
     expectV2Sendable(message);
     expect(selectsOf(message)).toHaveLength(1);
   });
diff --git a/src/render/train-split.ts b/src/render/train-split.ts
index 8b3c9ee7..1d9a6600 100644
--- a/src/render/train-split.ts
+++ b/src/render/train-split.ts
@@ -1,13 +1,20 @@
-import { ButtonStyle, ComponentType, type APIStringSelectComponent } from 'discord.js';
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIModalInteractionResponseCallbackData,
+  type APIRadioGroupOption,
+  type APIStringSelectComponent,
+} from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import {
   groupOf,
   headCount,
+  isGroupId,
   memberOf,
-  membersWhere,
   type GroupId,
   type PartyGroup,
+  type TrainParty,
 } from '../domain/party/party.js';
 import { nameOf } from '../domain/party/timed.js';
 import {
@@ -18,28 +25,43 @@ import {
   splittableGroups,
 } from '../domain/party/train.js';
 import { PARTY_KIND, partyButton } from './party-controls.js';
-import { inShownOrder } from './party-post.js';
+import { groupInPostOrder, guestsOf } from './party-post.js';
 import { gymName } from './raid-post.js';
 import { count, memberName, plain, truncate } from './text.js';
 import type { TrainPlaces } from './train-post.js';
 import { TRAIN_PANEL_COLOUR } from './train-panel.js';
 import { actionRow, container, menuRow, textDisplay } from './v2.js';
 
-/** What the confirmation of a split is drawn from: the train, who asks, and the group. */
+/** What the dialog of a split is drawn from: the train and who asks (plan 8T-H). */
 export interface SplitView extends TrainPlaces {
-  /** The member who asks: the confirmation speaks to them. */
+  /** The member who asks: the dialog speaks to them. */
   memberId: string;
   staff: boolean;
   /** The member asked not to be named (`RaidPrivacy.Anonymous`): then they lead nothing. */
   anonymous: boolean;
-  /** The group it asks about; the train has it, and the member may split it off. */
-  group: GroupId;
   now: number;
 }
 
-/** The confirmation names this many of those who move, and how many more. */
+/**
+ * The action of the dialog's custom id: `party:<id>:splitform:<group>:<mark>` when it asks about
+ * one group, `party:<id>:splitform` when the member picks the group (`SPLIT_GROUP_INPUT`).
+ */
+export const SPLIT_FORM = 'splitform';
+
+/** The custom id of the radio group of the dialog that asks which group leaves. */
+export const SPLIT_GROUP_INPUT = 'group';
+
+const TITLE = 'Split a group off the train';
+
+/** The one-group dialog names this many of those who move, and how many more. */
 const NAMES_SHOWN = 10;
 
+/** What a choice's label and description hold (Discord's limit). */
+const CHOICE_ROOM = 100;
+
+/** A group's label in a choice is cut to this, so that names fit beside it. */
+const LABEL_ROOM = 40;
+
 /** `Dawn`, `Dawn and Iris`, `Dawn, Iris and Cilan`, `Dawn, …, and 12 more`. */
 function nameList(names: readonly string[]): string {
   if (names.length <= 1) return names.join('');
@@ -54,45 +76,225 @@ function groupName(group: PartyGroup): string {
   return group.label ? `${group.id} (${plain(group.label)})` : group.id;
 }
 
-/** Where the train is, for the first point: the new train is where it is. */
-function wherePoint(view: SplitView): string {
+/** A member's own text on one line, for a choice, which Discord shows as it is (no markdown). */
+function oneLine(text: string): string {
+  return text.replace(/\s+/g, ' ').trim();
+}
+
+/**
+ * Where the train is, which the new train is too: `the same route, at the same stop (stop 2 of
+ * 3: The Stacks), the same end mode, boss and start`, `no route yet, …`, `the same route,
+ * finished, …`, and `, not started yet` before the start.
+ */
+function whereWords(view: SplitView): string {
   const { party } = view;
   const { route, stop } = party.train;
   const rest = 'the same end mode, boss and start';
-  if (route.length === 0) return `- no route yet, ${rest}`;
-  if (routeFinished(party)) return `- the same route, finished, ${rest}`;
+  if (route.length === 0) return `no route yet, ${rest}`;
+  if (routeFinished(party)) return `the same route, finished, ${rest}`;
   const at = currentStop(party);
   const gym = plain(gymName(at === undefined ? undefined : view.gym(at)));
   const start = party.timed.startTime;
   const waiting = start !== null && start > view.now ? ', not started yet' : '';
   return (
-    `- the same route, at the same stop (stop ${stop + 1} of ${route.length}: ${gym})` +
+    `the same route, at the same stop (stop ${stop + 1} of ${route.length}: ${gym})` +
     `${waiting}, ${rest}`
   );
 }
 
+/** How the words of who leads name the old train and a member: in a text, or in a choice. */
+interface Naming {
+  train: string;
+  member: (id: string) => string;
+}
+
 /**
  * Who leads each train afterwards, as `splitTrain` decides it (`conductor` of the new train):
  * `you are its conductor; Ash stays the conductor of Saturday Loop`, and when the conductor goes
- * with the group, `…, and Saturday Loop has none then`.
+ * with the group, `…, and Saturday Loop has none then`. `brief` (a choice) leaves out that the
+ * new train has none where the old one keeps its conductor: `Ash stays the conductor of …`.
  */
-function conductorPoint(view: SplitView, conductor: string | null): string {
+function leadWords(
+  view: SplitView,
+  conductor: string | null,
+  naming: Naming,
+  brief = false,
+): string {
   const { party, memberId } = view;
-  const name = plain(nameOf(party));
-  const who = (id: string) => (id === memberId ? 'you' : memberName(memberOf(party, id)));
+  const name = naming.train;
+  const who = (id: string) => (id === memberId ? 'you' : naming.member(id));
   const is = (id: string) => (id === memberId ? 'are' : 'is');
   const stays = (id: string) => (id === memberId ? 'stay' : 'stays');
   const old = party.train.conductorId;
   const leads =
     conductor === null ? 'it has no conductor' : `${who(conductor)} ${is(conductor)} its conductor`;
-  if (old !== null && old === conductor) return `- ${leads}, and ${name} has none then`;
-  return old === null
-    ? `- ${leads}`
-    : `- ${leads}; ${who(old)} ${stays(old)} the conductor of ${name}`;
+  if (old !== null && old === conductor) return `${leads}, and ${name} has none then`;
+  if (old === null) return leads;
+  const kept = `${who(old)} ${stays(old)} the conductor of ${name}`;
+  return brief && conductor === null ? kept : `${leads}; ${kept}`;
+}
+
+/** The new train as `splitTrain` would make it of this group now. */
+function previewOf(view: SplitView, group: GroupId): TrainParty {
+  return splitTrain(view.party, {
+    id: view.party.id,
+    by: view.memberId,
+    anonymous: view.anonymous,
+    group,
+    now: view.now,
+  });
+}
+
+/** The words of the dialog that asks about one group (mockup v4). */
+function oneGroupText(view: SplitView, groupId: GroupId): string {
+  const { party } = view;
+  const group = groupOf(party, groupId) ?? { id: groupId };
+  const preview = previewOf(view, groupId);
+  // As the post lists them (`groupInPostOrder`), by name only.
+  const moving = groupInPostOrder(party, groupId).map((id) => memberName(memberOf(party, id)));
+  const verb = moving.length === 1 ? 'moves' : 'move';
+  const naming: Naming = {
+    train: plain(nameOf(party)),
+    member: (id) => memberName(memberOf(party, id)),
+  };
+  return [
+    `Group **${groupName(group)}** leaves **${plain(nameOf(party))}** and becomes a train of ` +
+      `its own, **${plain(nameOf(preview))}**:`,
+    `- ${whereWords(view)}`,
+    `- ${nameList(moving)} ${verb} to it as they are signed up now`,
+    `- ${leadWords(view, preview.train.conductorId, naming)}`,
+    '',
+    'Submit splits it off.',
+  ].join('\n');
+}
+
+/**
+ * `Group B (Fast) · Dawn, Iris +1, Cilan`: the group's members by the names the post lists them
+ * with, in its order (`groupInPostOrder`), those the bot has no name for counted only; as many
+ * as fit into a choice's 100 characters, then `, and 3 more`.
+ */
+function choiceLabel(party: TrainParty, group: PartyGroup): string {
+  const label = group.label ? ` (${truncate(oneLine(group.label), LABEL_ROOM)})` : '';
+  const head = `Group ${group.id}${label} · `;
+  const ids = groupInPostOrder(party, group.id);
+  const names = ids.flatMap((id) => {
+    const attendee = party.attendees[id];
+    const name = attendee?.name === undefined ? '' : oneLine(attendee.name);
+    return attendee && name !== '' ? [`${name}${guestsOf(attendee)}`] : [];
+  });
+  for (let shown = names.length; shown > 0; shown--) {
+    const more = ids.length - shown;
+    const list = names.slice(0, shown).join(', ') + (more > 0 ? `, and ${more} more` : '');
+    if (head.length + list.length <= CHOICE_ROOM) return head + list;
+  }
+  return truncate(head + count(ids.length, 'trainer'), CHOICE_ROOM);
+}
+
+/**
+ * `Saturday Loop (Fast) · you stay the conductor of Saturday Loop`: the new train's name, as
+ * `splitTrain` makes it (`<name> (<label or letter>)`), and who leads which train. What is too
+ * long for a choice's 100 characters cuts the train's name, in both places alike, so that the
+ * group (its label cut to `LABEL_ROOM`) and who leads stay whole and the choices differ.
+ */
+function choiceDescription(view: SplitView, groupId: GroupId): string {
+  const { party } = view;
+  const group = groupOf(party, groupId);
+  const conductor = previewOf(view, groupId).train.conductorId;
+  const suffix = truncate(oneLine(group?.label ?? groupId), LABEL_ROOM);
+  const member = (id: string) => oneLine(party.attendees[id]?.name ?? '') || 'a trainer';
+  const described = (train: string) =>
+    `${train} (${suffix}) · ${leadWords(view, conductor, { train, member }, true)}`;
+  const name = oneLine(nameOf(party));
+  for (let room = name.length; room > 0; room--) {
+    const text = described(truncate(name, room));
+    if (text.length <= CHOICE_ROOM) return text;
+  }
+  return truncate(described(truncate(name, 1)), CHOICE_ROOM);
+}
+
+/** A choice's value: the group's letter and mark, `B:<mark>` (`splitChoice` reads it). */
+function choiceValue(party: TrainParty, groupId: GroupId): string {
+  return `${groupId}:${groupMark(party, groupId) ?? '0'}`;
+}
+
+/** The group and mark of a choice of the dialog; undefined for anything else. */
+export function splitChoice(value: string): { group: GroupId; mark: string } | undefined {
+  const at = value.indexOf(':');
+  const group = value.slice(0, at);
+  const mark = value.slice(at + 1);
+  return at > 0 && isGroupId(group) && mark !== '' ? { group, mark } : undefined;
+}
+
+/**
+ * The dialog of splitting a group off a train (plan 8T-H; design
+ * `2026-10-18-train-split-dialog-design.md`), titled `Split a group off the train`, with
+ * Discord's own Submit and Cancel. For one group (`groups` of one: the member may split only it,
+ * or `/group split` named it): one text, what becomes of the group (the new train's name, as
+ * `splitTrain` makes it), the same route at the same stop, who moves (the first `NAMES_SHOWN`),
+ * who leads which train, and `Submit splits it off.`; its custom id
+ * `party:<id>:splitform:<group>:<mark>` (`groupMark`, so that a Submit for a group called
+ * otherwise or gone by now is refused). For several (the conductor and staff): what is the same
+ * for every group, then the required radio group `Group that leaves` of `groups` in their order,
+ * nothing picked, each choice named by `choiceLabel` and `choiceDescription`, its value
+ * `<group>:<mark>`; the custom id `party:<id>:splitform`. Who is in the group is carried by
+ * neither: who is in it at Submit goes (design, "Decided").
+ */
+export function splitDialog(
+  view: SplitView,
+  groups: readonly [GroupId, ...GroupId[]],
+): APIModalInteractionResponseCallbackData {
+  const { party } = view;
+  const [first] = groups;
+  if (groups.length === 1) {
+    return {
+      custom_id: encodeCustomId({
+        kind: PARTY_KIND,
+        id: party.id,
+        action: SPLIT_FORM,
+        args: [first, groupMark(party, first) ?? '0'],
+      }),
+      title: TITLE,
+      components: [textDisplay(oneGroupText(view, first))],
+    };
+  }
+  const options: APIRadioGroupOption[] = groups.map((id) => ({
+    label: choiceLabel(party, groupOf(party, id) ?? { id }),
+    value: choiceValue(party, id),
+    description: choiceDescription(view, id),
+  }));
+  return {
+    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: SPLIT_FORM }),
+    title: TITLE,
+    components: [
+      textDisplay(
+        `The group you pick leaves **${plain(nameOf(party))}** and becomes a train of its own: ` +
+          `${whereWords(view)}. Its members move to it as they are signed up now.`,
+      ),
+      {
+        type: ComponentType.Label,
+        label: 'Group that leaves',
+        component: {
+          type: ComponentType.RadioGroup,
+          custom_id: SPLIT_GROUP_INPUT,
+          required: true,
+          options,
+        },
+      },
+    ],
+  };
+}
+
+/** What the private confirmation of plan 8T asks about: the group too. */
+export interface SplitConfirmationView extends SplitView {
+  /** The group it asks about; the train has it, and the member may split it off. */
+  group: GroupId;
 }
 
 /** The menu of the groups the member may split, the one asked about chosen. */
-function groupMenu(view: SplitView, groups: readonly GroupId[]): APIStringSelectComponent {
+function groupMenu(
+  view: SplitConfirmationView,
+  groups: readonly GroupId[],
+): APIStringSelectComponent {
   const { party } = view;
   return {
     type: ComponentType.StringSelect,
@@ -124,29 +326,14 @@ function groupMenu(view: SplitView, groups: readonly GroupId[]): APIStringSelect
  * whose value is a group's letter. Who is in the group is not carried: who is in it at the
  * moment of the split goes (design, "The confirmation").
  */
-export function splitConfirmation(view: SplitView, note?: string): V2Message {
+export function splitConfirmation(view: SplitConfirmationView, note?: string): V2Message {
   const { party, group: groupId } = view;
-  const group = groupOf(party, groupId) ?? { id: groupId };
-  const preview = splitTrain(party, {
-    id: party.id,
-    by: view.memberId,
-    anonymous: view.anonymous,
-    group: groupId,
-    now: view.now,
-  });
-  const moving = inShownOrder(
-    party,
-    membersWhere(party, (attendee) => attendee.group === groupId),
-  ).map((id) => memberName(memberOf(party, id)));
-  const verb = moving.length === 1 ? 'moves' : 'move';
+  const [question, ...lines] = oneGroupText(view, groupId).split('\n').slice(0, -2);
   const text = [
     '### Split a group off the train',
     ...(note === undefined ? [] : [note]),
-    `Group **${groupName(group)}** leaves **${plain(nameOf(party))}** and becomes a train of ` +
-      `its own, **${plain(nameOf(preview))}**:`,
-    wherePoint(view),
-    `- ${nameList(moving)} ${verb} to it as they are signed up now`,
-    conductorPoint(view, preview.train.conductorId),
+    question ?? '',
+    ...lines,
   ];
   const groups = splittableGroups(party, view.memberId, view.staff);
   const mark = groupMark(party, groupId) ?? '0';
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index a39f7e6f..da1383e5 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -137,8 +137,8 @@ export interface MenuLike {
 }
 
 /**
- * Refuses a menu Discord would refuse, through `fail`: 1 to `most` options (25 for a select, 10
- * for a checkbox group), each with a label and a value of 1 to 100 characters and a description
+ * Refuses a menu Discord would refuse, through `fail`: `least` (1 unless given) to `most` options
+ * (25 for a select, 10 for a checkbox group, 2 to 10 for a radio group), each with a label and a value of 1 to 100 characters and a description
  * of at most 100, values unique; `min_values` (1 when not given) from 0 and `max_values` (1 for
  * a select, every option for a group, when not given) from 1, both within the options and in
  * order; no more options ticked by default than may be chosen; a placeholder of at most 150. In
@@ -147,12 +147,13 @@ export interface MenuLike {
  */
 export function checkMenu(
   menu: MenuLike,
-  shape: { most: number; group: boolean; inForm: boolean },
+  shape: { least?: number; most: number; group: boolean; inForm: boolean },
   fail: (what: string) => never,
 ): void {
   const options = menu.options ?? [];
-  if (options.length < 1 || options.length > shape.most) {
-    fail(`1 to ${shape.most} options, not ${options.length}`);
+  const least = shape.least ?? 1;
+  if (options.length < least || options.length > shape.most) {
+    fail(`${least} to ${shape.most} options, not ${options.length}`);
   }
   const values = new Set<unknown>();
   for (const option of options) {
diff --git a/test/support/fake-interactions.test.ts b/test/support/fake-interactions.test.ts
index 7057cca7..bf9eea85 100644
--- a/test/support/fake-interactions.test.ts
+++ b/test/support/fake-interactions.test.ts
@@ -516,6 +516,71 @@ describe('the forms a control opens', () => {
     ).toThrow(/no such/);
   });
 
+  const radio = (custom_id: string, n: number, extra: object = {}) => ({
+    type: ComponentType.Label,
+    label: 'Choose',
+    component: {
+      type: ComponentType.RadioGroup,
+      custom_id,
+      required: true,
+      options: Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: `v${i}` })),
+      ...extra,
+    },
+  });
+  const text = (content: string) => ({ type: ComponentType.TextDisplay, content });
+
+  it('takes a radio group of 2 to 10 choices and a text display of 1 to 4,000 characters', () => {
+    expect(() => checkModal(form([text('x'.repeat(4_000)), radio('a', 2)]))).not.toThrow();
+    expect(() => checkModal(form([radio('a', 10)]))).not.toThrow();
+    expect(() => checkModal(form([text('x')]))).not.toThrow();
+    expect(() => checkModal(form([radio('a', 1)]))).toThrow(/2 to 10 options, not 1/);
+    expect(() => checkModal(form([radio('a', 11)]))).toThrow(/2 to 10 options, not 11/);
+    expect(() =>
+      checkModal(
+        form([
+          radio('a', 2, {
+            options: [
+              { label: 'x'.repeat(101), value: '1' },
+              { label: 'y', value: '2' },
+            ],
+          }),
+        ]),
+      ),
+    ).toThrow(/label and value of 1 to 100/);
+    expect(() =>
+      checkModal(
+        form([
+          radio('a', 2, {
+            options: [
+              { label: 'x', value: '1', description: 'd'.repeat(101) },
+              { label: 'y', value: '2' },
+            ],
+          }),
+        ]),
+      ),
+    ).toThrow(/description of at most 100/);
+    expect(() => checkModal(form([text('x'.repeat(4_001))]))).toThrow(
+      /a text display of 1 to 4000 characters/,
+    );
+    expect(() => checkModal(form([text('')]))).toThrow(/a text display of 1 to 4000/);
+  });
+
+  it('submits the choice picked in a radio group, and refuses a required one left unpicked', () => {
+    const shown = form([radio('a', 3), radio('b', 2, { required: false })]);
+    const submitted = fakeModal({ customId: 'a:1:form', form: shown, picked: { a: 'v2' } });
+    expect(submitted.fields.getRadioGroup('a')).toBe('v2');
+    expect(submitted.fields.getRadioGroup('b')).toBeNull();
+    expect(() => submitted.fields.getRadioGroup('b', true)).toThrow(/FieldNotFound/);
+    expect(() => submitted.fields.getStringSelectValues('a')).toThrow(/FieldNotFound/);
+    // Discord refuses the Submit: the bot never gets an empty pick of a required group.
+    expect(() => fakeModal({ customId: 'a:1:form', form: shown })).toThrow(
+      /no value for its required radio group a/,
+    );
+    expect(() => fakeModal({ customId: 'a:1:form', form: shown, picked: { a: 'v9' } })).toThrow(
+      /has no choice v9/,
+    );
+  });
+
   it('refuses a menu of a form that may stay empty without saying it is not required', () => {
     expect(() => checkModal(form([select('a', 2, { min_values: 0 })]))).toThrow(
       /min_values 0 in a form needs required false/,
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index 62c6d0db..e84bc6f7 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -140,6 +140,8 @@ export interface FakeOptions {
   selected?: Record<string, string[]>;
   /** Modal: what was ticked in each checkbox group of the form, by the group's custom id. */
   checked?: Record<string, string[]>;
+  /** Modal: the choice picked in each radio group of the form, by the group's custom id. */
+  picked?: Record<string, string>;
   /**
    * Modal: the form the opener showed (as passed to `showModal`). The submitted form then has
    * every input of it, and refuses values for inputs it does not have (`submittedForm`).
@@ -382,6 +384,9 @@ const MODAL = {
   labelDescription: 100,
   selectOptions: 25,
   checkboxOptions: 10,
+  radioLeast: 2,
+  radioOptions: 10,
+  textDisplay: 4_000,
 } as const;
 
 /** The data of a form, from a builder's `toJSON()` or as given. */
@@ -400,8 +405,10 @@ function formData(modal: unknown): { custom_id?: string; title?: string; compone
 /** An input of a form, as a submitted form has it: its type, and whether it may stay empty. */
 interface FormInput {
   type: ComponentType;
-  /** A select menu or checkbox group that may be submitted with nothing chosen. */
+  /** A select menu, checkbox group or radio group that may be submitted with nothing chosen. */
   optional: boolean;
+  /** The values of the choices of a radio group (Discord sends only one of them). */
+  values?: readonly unknown[];
 }
 
 /** The inputs of a form by their custom ids: the text inputs, select menus and other inputs. */
@@ -425,7 +432,17 @@ function formInputs(modal: unknown): Map<string, FormInput> {
       'required' in inner && inner.required === false
         ? true
         : 'min_values' in inner && inner.min_values === 0;
-    inputs.set(inner.custom_id, { type: inner.type, optional });
+    inputs.set(inner.custom_id, {
+      type: inner.type,
+      optional,
+      ...(inner.type === ComponentType.RadioGroup
+        ? {
+            values: ((inner as { options?: { value?: unknown }[] }).options ?? []).map(
+              (option) => option.value,
+            ),
+          }
+        : {}),
+    });
   }
   return inputs;
 }
@@ -468,7 +485,13 @@ export function checkModal(modal: unknown): void {
       components?: { type?: number; custom_id?: unknown }[];
     };
     const where = `component ${index}`;
-    if (component.type === ComponentType.TextDisplay) continue;
+    if (component.type === ComponentType.TextDisplay) {
+      const { content } = component as { content?: unknown };
+      if (typeof content !== 'string' || content.length < 1 || content.length > MODAL.textDisplay) {
+        fail(`${where}: a text display of 1 to ${MODAL.textDisplay} characters`);
+      }
+      continue;
+    }
     if (component.type === ComponentType.ActionRow) {
       const inner = component.components ?? [];
       if (inner.length !== 1 || inner[0]?.type !== ComponentType.TextInput) {
@@ -499,10 +522,16 @@ export function checkModal(modal: unknown): void {
       checkMenu(inner, { most: MODAL.selectOptions, group: false, inForm: true }, menuFail);
     } else if (inner.type === ComponentType.CheckboxGroup) {
       checkMenu(inner, { most: MODAL.checkboxOptions, group: true, inForm: true }, menuFail);
+    } else if (inner.type === ComponentType.RadioGroup) {
+      // One choice of 2 to 10, each as an option of a menu, at most one picked beforehand.
+      checkMenu(
+        inner,
+        { least: MODAL.radioLeast, most: MODAL.radioOptions, group: false, inForm: true },
+        menuFail,
+      );
     } else if (
       inner.type !== ComponentType.TextInput &&
       inner.type !== ComponentType.Checkbox &&
-      inner.type !== ComponentType.RadioGroup &&
       inner.type !== ComponentType.FileUpload &&
       inner.type !== ComponentType.UserSelect &&
       inner.type !== ComponentType.RoleSelect &&
@@ -517,14 +546,16 @@ export function checkModal(modal: unknown): void {
 /** A value of a submitted form, by the type of its input. */
 type Submitted =
   | { type: ComponentType.TextInput; value: string }
-  | { type: ComponentType.StringSelect | ComponentType.CheckboxGroup; values: string[] };
+  | { type: ComponentType.StringSelect | ComponentType.CheckboxGroup; values: string[] }
+  | { type: ComponentType.RadioGroup; value: string | null };
 
 /**
  * What a fake form was submitted with, by custom id. With the form the opener showed (`form`),
  * every input of it is there (a text left empty as `''`, an unticked checkbox group or a menu
- * that may stay empty as `[]`), a required menu must be given a value, and a value for an input
- * the form does not have, or of another type, is refused. Without it, the inputs are what
- * `fields`, `selected` and `checked` name.
+ * that may stay empty as `[]`, a radio group that may as `null`), a required menu or radio group
+ * must be given a value (Discord refuses the Submit otherwise), a radio group one of its choices,
+ * and a value for an input the form does not have, or of another type, is refused. Without it,
+ * the inputs are what `fields`, `selected`, `checked` and `picked` name.
  */
 function submittedForm(o: FakeOptions): Map<string, Submitted> {
   const given = new Map<string, Submitted>();
@@ -537,12 +568,20 @@ function submittedForm(o: FakeOptions): Map<string, Submitted> {
   for (const [id, values] of Object.entries(o.checked ?? {})) {
     given.set(id, { type: ComponentType.CheckboxGroup, values });
   }
+  for (const [id, value] of Object.entries(o.picked ?? {})) {
+    given.set(id, { type: ComponentType.RadioGroup, value });
+  }
   if (o.form === undefined) return given;
   const inputs = formInputs(o.form);
   for (const [id, value] of given) {
     const input = inputs.get(id);
     if (!input) throw new Error(`The fake form has no input ${id}`);
     if (input.type !== value.type) throw new Error(`The input ${id} of the fake form is no such`);
+    if (value.type === ComponentType.RadioGroup && !(input.values ?? []).includes(value.value)) {
+      throw new Error(
+        `The radio group ${id} of the fake form has no choice ${String(value.value)}`,
+      );
+    }
   }
   const all = new Map<string, Submitted>();
   for (const [id, input] of inputs) {
@@ -559,6 +598,11 @@ function submittedForm(o: FakeOptions): Map<string, Submitted> {
         throw new Error(`The fake form has no value for its required menu ${id}`);
       }
       all.set(id, { type: input.type, values: [] });
+    } else if (input.type === ComponentType.RadioGroup) {
+      if (!input.optional) {
+        throw new Error(`The fake form has no value for its required radio group ${id}`);
+      }
+      all.set(id, { type: ComponentType.RadioGroup, value: null });
     }
   }
   return all;
@@ -824,6 +868,13 @@ function base(kind: Kind, o: FakeOptions) {
         if (input?.type !== ComponentType.CheckboxGroup) throw notSubmitted(id, 'checkbox group');
         return input.values;
       },
+      /** As discord.js: `null` for nothing picked, unless `required`, which then throws. */
+      getRadioGroup: (id: string, required?: boolean) => {
+        const input = submitted.get(id);
+        if (input?.type !== ComponentType.RadioGroup) throw notSubmitted(id, 'radio group');
+        if (input.value === null && required === true) throw notSubmitted(id, 'radio group pick');
+        return input.value;
+      },
     },
     // As in discord.js, these are async: a refusal rejects.
     reply: vi.fn((payload: SentPayload) => {
````

### Task 2: Plan 8T-H T2: Split group opens a dialog, and its Submit splits (8T-H-2)

Prototype commit: `c3a1aa8b5c073ed0470a60811321288dcbddf9bd`

"Split group…" opens the dialog of the one group the member may split,
or the one that asks which when they may split several (the conductor,
staff); /group split letter:X the one-group dialog of X, for anybody,
after mayNotSplit. A member who may split none gets the reason privately
and no dialog. The dialog is the first answer: nothing defers before it.

Its Submit (party:<id>:splitform, with <group>:<mark> in the custom id or
as the picked choice) is deferred privately, runs splitGroupAs with the
mark as drawn, and answers in plain text: Split off: <post> (also for the
very group split off meanwhile), "The groups of this train changed
meanwhile: press Split group… again." for a group called otherwise or
gone, any other refusal's words (a refusal none of the member's doing
gives the use back), "This train is over.", or that the split did not
work, the error going on to the router. Opening and Submit count as
presses of the post.

The private confirmation of 8T goes: splitConfirmation, splitNote, the
group menu, the splitgo, splitno and splitpick controls, whose old
presses get the router's stale answer. trains.md, discord-framework.md,
the 8T design's pointer, the 8T staging checklist and /group split's help
say the dialog.

**Files:**

```
 docs/architecture/discord-framework.md                  |   3 +-
 docs/architecture/parties-and-posts.md                  |   2 +-
 docs/architecture/trains.md                             |   6 +-
 docs/superpowers/plans/2026-10-17-phase-8t-staging.md   |  24 +--
 docs/superpowers/specs/2026-10-17-train-split-design.md |   2 +
 src/commands/parties/reply.ts                           |   3 +-
 src/commands/trains/split.test.ts                       | 420 +++++++++++++++++++++---------------
 src/commands/trains/split.ts                            | 214 +++++++-----------
 src/commands/trains/train-changes.ts                    |  10 +-
 src/components/party.ts                                 |  28 +--
 src/discord/custom-id.ts                                |   9 +-
 src/domain/party/attendance.ts                          |   2 +-
 src/domain/party/party.ts                               |   4 +-
 src/domain/party/train.ts                               |   6 +-
 src/render/party-controls.ts                            |  12 +-
 src/render/train-split.test.ts                          | 194 -----------------
 src/render/train-split.ts                               |  91 +-------
 src/services/party-service.ts                           |   2 +-
 src/services/train-service.ts                           |   2 +-
 19 files changed, 378 insertions(+), 656 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run `git apply --whitespace=nowarn <file>` (or type it in); nothing else changes.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, then `npx vitest run --project unit --project isolated src/commands/trains/split.test.ts src/render/train-split.test.ts src/components/party.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c3a1aa8b5c073ed0470a60811321288dcbddf9bd -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8th-split-dialog.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8T-H T2: Split group opens a dialog, and its Submit splits (8T-H-2)`, the body above and the trailer, staging exactly

```
git add -- docs/architecture/discord-framework.md
git add -- docs/architecture/parties-and-posts.md
git add -- docs/architecture/trains.md
git add -- docs/superpowers/plans/2026-10-17-phase-8t-staging.md
git add -- docs/superpowers/specs/2026-10-17-train-split-design.md
git add -- src/commands/parties/reply.ts
git add -- src/commands/trains/split.test.ts
git add -- src/commands/trains/split.ts
git add -- src/commands/trains/train-changes.ts
git add -- src/components/party.ts
git add -- src/discord/custom-id.ts
git add -- src/domain/party/attendance.ts
git add -- src/domain/party/party.ts
git add -- src/domain/party/train.ts
git add -- src/render/party-controls.ts
git add -- src/render/train-split.test.ts
git add -- src/render/train-split.ts
git add -- src/services/party-service.ts
git add -- src/services/train-service.ts
```

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index 3e65dd8d..c506c605 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -16,13 +16,14 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 ## The router and deferral
 
-- The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
+- The router's order is guards, checks (plan 8S-3, below), throttle, deferral, `execute`; before all of it, in rehearsal mode (`ctx.rehearsal`), a member who is neither on its allowlist nor staff gets `REHEARSAL_REFUSAL` and nothing else (`operations.md`). A handler that needs more than three seconds declares `defer: 'ephemeral' | 'public'` and then uses `editReply`/`followUp`; it never calls `deferReply` itself. A command whose work is short (a read or a write of the member's own rows) declares `defer: 'late'` instead: it runs at once and answers through `answer(interaction, payload)` (`src/discord/late-reply.ts`), never `editReply`, in everything it runs; `answer` sends the first answer directly (for the member alone) when nothing was acknowledged and edits otherwise, and the router acknowledges such a command only when it has not answered `LATE_DEFER_MS` after the interaction was made (one request to Discord is a quarter of a second, so deferring first doubled the wait). A test reads what such a command said with `answered(fake)` (`test/support/fake-interactions.ts`). `defer` may be a function of the interaction for a command that opens a form for some uses and works for long in others (`/delete`); a component handler that sends to Discord before it answers acknowledges itself first (`deferReply` in the form of `/delete` and in the Submit of a split's dialog, `trains.md`). `throttle: { uses, perSeconds }` limits a member per command path; a use that a guard refused does not count.
 - Plan 8S-3: between the guards and the throttle the router asks `checks`, the window a form's submit counts in, of a command (`CommandHandler.checks`, a `ControlThrottle`: `as` its command, else the command's own), a message command and a control (`ComponentHandler.checks(interaction, id)`, the limit `throttle` gives the form, counted where the form is): while that window is full the use is refused (the window's words: "You can use /report again in …", "That was a lot of clicks…"), and either way nothing is counted (`Throttles.wait`), so nobody types into a form only to be refused. `/report` and Report to moderators check `/report`'s window (`REPORT_WINDOW`), Ask the moderators and Appeal their form's (`APPEAL_THROTTLE`). A handler's own check before its form is a quick read (whether the member reported it already: `moderation.md`); when it fails the form opens as before, and the submit's checks stay (two forms open at once, a restart between).
 - Plan 8S-3: every use the router counted (a command's, a message command's, a control's) is given back when its work throws anything but a `UserError` (`Throttles.giveBack`; at most `uses` a window, so a use that keeps failing is held to twice its limit), and when a `UserError` says it is none of the member's doing (`givesBack`: the bot may not make posts in the forum, the moderators could not be asked: a meetup held for them, an ask about a place, an appeal or a report that was `not-sent`). A use goes back only to the window it was counted in (`countedAt`, when it was counted: a window opened since, after the use's own closed, gets nothing). A form or a question whose command counted the use names that command's window and when the use was counted with `ComponentHandler.carriesOn` (`/meetup`'s form: `MEETUP_THROTTLE` as `meetup`; `/raid`'s gym menu and buttons: `RAID_THROTTLE` as `raid`; undefined for a form it no longer knows), and its failure gives that use back. The time is the router's own (`whenCounted(interaction)`, `src/discord/router.ts`: when the router counted this use, by `RouterOptions.now`), never a clock the handler reads again later (`/raid` with a screenshot reads it first, which may take minutes). A refusal a handler has said in its own answer (`UserError` with `said: true`: `/raid`'s "no post" in its answer, the screenshot's feedback button kept) is answered no more by the router; with `givesBack` its use still goes back. A refusal is the member's and stays counted. The live map gives back what it counted the same way where it shares a window (`givenBackOnTheMap(deps, command, userId, throttle, countedAt)`: meetups, trains, raids). The trade-off (review of 8S-3): a use is given back whenever the work throws, also when its effect had landed before (the party made, then its answer refused: an `editReply` that failed, Unknown interaction); accepted, since at most `uses` go back a window, so such a member gets at most twice the limit, and a handler cannot mark a point after which nothing goes back.
 
 ## Controls and how a press answers
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
+- A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 6b39e1bc..87569645 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -50,7 +50,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 ## Discord: the gateway and the party service
 
-- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the press of "Split it off" of Split group… and `/group split`, and of "Move it there" of `/location`, both said in place of the question, `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
+- Everything parties ask of Discord goes through `PartyGateway` (`src/discord/party-gateway.ts`): its discord.js implementation is the only code that calls discord.js for parties and has unit tests only for how it edits messages (against a stub of Discord; the staging run is its test for the rest); everything above it is tested with `FakePartyGateway` (`test/support/fake-gateway.ts`), which is as strict as Discord about empty messages, titles, tags, the one pin per forum and components-v2 messages (no content or embeds beside the flag, 40 components, 4,000 characters of text, sections with an accessory, unique custom ids, thumbnails by https or by a file the message carries, galleries of 1 to 10 pictures by https or by such a file (counted as one component; `checkV2`'s `files` are the names the message carries, `V2Message.files` by their base names unless given), buttons and string select menus only in rows (a button also beside a section), a menu alone in its row and as `checkMenu` says (options, `min_values` / `max_values`, defaults; shared with the fakes' `checkModal`); a button with a label or an emoji, a custom emoji by its id and name, never as message text, an emoji by name only a pictograph or regional indicator; link buttons with an address and no custom id, others the other way round, thumbnails only beside a section, a container not empty and its accent within range; a v2 message never becomes classic again; `refuseV2Starter` refuses one as the first message of a post, with Invalid Form Body or, as `'empty'`, with 50006 (`emptyMessage`); `textLimit` lowers the text a test lets through). It refuses as Discord does, with Invalid Form Body (`refusedBody`, 50035), so the code that retries on that answer runs in tests. `OutgoingMessage` is `ClassicMessage | V2Message`; `discordPayload` sends and edits a v2 message with its flag and components only; `editAs` sends an edit, and only when Discord refuses a v2 edit (a classic message still has content: 50035, or 50006 where the flag was not taken) sends it once more through the REST route with content and embeds cleared (`conversionBody`; the refusal's code is logged), never for a message the gateway sent, made or edited as v2 itself (it keeps their ids, bounded: a refusal of one is the message's own and is passed on), so a post made before the posts were v2 becomes v2 by its next edit; a caller that knows the message is classic passes `{ convert: true }` to `editPost` / `editMessage` and it is converted at once (the fake records each conversion in `converted`, `direct` or not). Whether Discord takes a v2 message as the first message of a forum post is not documented: `PartyService` tries it until a post was made, and where Discord refuses it (`isRefusedStarter`: Invalid Form Body, or 50006 while direct posts are not known to work) makes the post with `FIRST_LINE` and edits that into the post at once (converted directly); a message with a picture is tried without it before either way is given up, so a refused picture flashes no stray post; what worked is logged once (with Discord's code when it switches), a post that went during that edit answers `no-post` (`NO_POST_MADE`), and one that could not be taken back is logged with its id. Where the bot may not make posts (plan 8S-3, staging of 8S-2: without Manage Threads, "Manage Posts" in a forum's settings, Discord refused a post with the forum's moderated tag as Missing Access; archiving, locking, pins and tags need it too, so a post without its tag would still break at its end), `DiscordPartyGateway.createPost` refuses before asking Discord, from the cache, where the bot lacks what the post needs there (`postNeeds`, `src/domain/party/post-permissions.ts`, names only, which the render reads without discord.js: View Channel, Create Posts, and Manage Posts only for a post with a moderated tag, as the forum lists its tags (Pine makes its tags moderated), so that a region's summary, which has none, is made without it as before and only its pin warns; not Send Messages in Posts, which Discord does not ask to start a post, though the bot needs it to write in its posts later and `cutover-check` asks it of every forum), and takes Missing Access as the same refusal (`PostsRefusedError`, with what it lacks; none known for Discord's answer); `PartyService` keeps nothing, answers `no-post` with `refused` (`NoPost`; raids, meetups, trains, moves, splits) and logs a warning once per forum while it runs, and the member is told `noPostWords` ("I am not allowed to make posts in <forum>: I lack the permission Manage Posts there. Nothing was made. The server's staff must give it to me."; a move, `posts-refused` with `refused`, `postsRefusedMoveWords`; an approved meetup, `postsRefusedFailure`; `/admin setup-forums` for the summary, `summaryRefusedWords`, and for a summary made but not pinned "posted the list of active raids (I could not pin it: give me Manage Posts there)", or "…; see the log)" for another failure: `ForumSetup.unpinned`). Every `no-post`, refused or a post lost while it was made, is none of the member's doing and leaves the use uncounted (`UserError` `givesBack`: `/meetup`, `/train`, `/raid` and its menu, the map's meetups, trains and raids, a screenshot's image: `screenshots.md`; the Submit of a split's dialog (Split group… and `/group split`), said in its private answer, and the press of "Move it there" of `/location`, said in place of the question, both `said`); `/raid` says it in its own answer, in place of its menu or with the screenshot's feedback button (`said`). Tests read a message through `test/support/messages.ts` (`textOf`, `textDisplays`, `header`, `leadOf`, `copiedPost`, `buttonsOf`, `buttonNames` (the label, or the emoji's name of a button without one), `customIdsOf`, `accentOf`, `thumbnailOf`, `thumbnailsOf`, `thumbnailBeside`, `sectionsOf`, `partTexts`, `componentCount`, `classic`, `v2`). A method answers `false` or `undefined` for something that is gone and throws for anything else; `renamePost` answers `{ laterMs }` when Discord's rename limit says to wait. The fake answers on `setImmediate`: a test that needs a fixed time fakes only `Date`.
 - `ctx.partyService` (`src/services/party-service.ts`) is parties on Discord: `reportRaid(report)` stores a raid and creates its post (or answers `exists`, `no-region`, `no-forum`), `changed(partyId)` brings the post and its region's summary up to date (changes are gathered: the first shows at once, later ones at most every two seconds; an edit that would change nothing is not sent, for a post and for the summary alike), `ended(party)` is for a party ended elsewhere, `setupForums(guildId)` is `/admin setup-forums`, `close()` is for shutdown (it flushes); `flush()` for tests. A raid is never left active without a post, nor a post without its party.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
 - `PartyService.showStatus(partyId)` is `/status` in a post; `summaryMessage(regionId)` is the region's list as a components-v2 message (the summary post and `/status` in a region channel; plan 8B-1): `renderSummary` (`src/render/summary.ts`) gives one container, `### Active raids` with a count of the kinds there are, the raids under a heading per tier (`SUMMARY_TIERS`: Elite, Level 5, Mega Legendary, Super Mega, Mega, Level 3, Level 1, each shadow tier after its plain one), then the trains and the meetups, one text display per tier and section, all within `TEXT_BUDGET` (`SECTION_ROOM` for trains and meetups, a heading and a count line for every tier, "…and N more"). The summary post is made through the same first-message path as a party's post and edited as v2 (an old classic one is converted by the gateway); an edit whose message (as JSON) is unchanged is not sent. `end(partyId, onlyIf?, closing?)` takes `lastWords` (said in the post before it is archived) and `left` (run once the party has left the store, waited for three seconds at most: an answer to an interaction in that post is given there, never after the archiving), and `removal: 'delete'` (plan 8S-2, a moderator's choice) deletes the post in the place of its last showing and the archiving (its copies and link line go as on any end; a deletion Discord refuses archives it; `mayDeletePost` asks first). `requestDeletion` puts a member's report into the post where the server has no moderators' channel (plan 8S-2: `/report`, `moderation.md`) (one request per member and party, the roles pinged by the first that is really sent, a party's requests one after the other); `keep(partyId, saved, memberId)` is `/admin save-party`. `ctx.attendance.shout` is `/shout`.
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 0deb6b88..da7e4b7b 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -26,13 +26,13 @@ The third kind of party: a route of gyms, a current stop, a conductor, modes at
 
 ## Splitting a group off
 
-- A group of a train can become a train of its own (plan 8T; spec `2026-10-17-train-split-design.md`; Matt, 2026-10-17: faster players go on at their own pace instead of per-group positions on one train). Who may is `mayNotSplit` in `train.ts`, beside `mayNotArrange`: never a train of one group (`one-group`), one without a post yet (`unposted`: the new train links to it), the new train of a split not settled yet (`split-pending`, "This train is still being split off another: try again in a moment.": from its post until the paired write its members are on the old train too, and a group split off it would outlive the split's take-back; `splitsPossible` and `splittableGroups` offer nothing of it), a group it does not have (`no-such-group`), an empty one (`empty-group`) or one that everybody on the train is in (`whole-train`, Matt, 2026-10-17: the old train would be left empty; the words name the group, `Everybody on this train is in group B (Fast): there is nothing to split it from.`, `splitRefusal`); staff and the conductor any other group; a member of the group (any status) their own (`not-in-group`, "Only a group's members, the conductor and the moderators can split a group off.") unless the conductor is in it (`conductor-in-group`). `splittableGroups` is what the menu and the autocomplete offer; `splitsPossible` (two groups or more with somebody in them) whether the post shows the button.
-- The pure parts (`train.ts`): `splitTrain(old, { id, by, anonymous, group, now })` is the new train: `<old name> (<label or letter>)` cut to `MAX_PARTY_NAME` (the group keeps at least half of the room), the same server and region, route, stop, `finishedFrom`, mode, boss, start and end (through `withTrain`), one group A with the group's label, the group's members as they are in A, made now by the presser (named unless their privacy is Anonymous; `makerName` is noted by the service), led by the old conductor who goes with the group, else the presser in it unless their privacy is Anonymous (as a `/train` made anonymously, it then has none until `/conductor set`; Matt, 2026-10-17), else nobody, with `train.splitFrom` (the old party and post, `pending: true`). `splitOffGroup(old, member, staff, group, link, drawn?, anonymous?)` is the old train without the group and its members: the other groups keep their letters, the newest left takes new sign-ups when the newest went, its conductor stays unless they went, `train.splitOff` gains `{ partyId, postId, group, label? }` newest first (at most `MAX_SPLITS_KEPT`, 10); it answers the members who moved (`moved`), the group, who leads the new train and the old train as it was then (`was`: its train part, start and end). `drawn` is the group's mark as the confirmation showed it (`groupMark`, FNV-1a in base 36 of the label and the party id of the newest `splitOff`): refused `group-changed` when the label changed, the group went, or another group was split off since, so a letter given again (even with the same label) is never taken for the group that had it. `splitDrawn(train, group, mark)` is the split a stale mark was drawn for when that very group is the one split off last. `carriedSplit(target, start, moved, conductor, was?, now?)` brings the new train in line with the group as it was at the split, and with the old train's place and times then unless they were changed on the new train meanwhile (as for the conductor); the very same train when that changes nothing. `splitSettled(train)` clears `pending`. A group opened after a split takes a letter that no group has and no split named, the first after the last in use, else the first such; when every free letter was a split's, the first free one (`nextGroupId`, `attendance.ts`): a letter can come again only then, and the mark keeps a stale confirmation from taking the new group for the old.
+- A group of a train can become a train of its own (plan 8T; spec `2026-10-17-train-split-design.md`; Matt, 2026-10-17: faster players go on at their own pace instead of per-group positions on one train). Who may is `mayNotSplit` in `train.ts`, beside `mayNotArrange`: never a train of one group (`one-group`), one without a post yet (`unposted`: the new train links to it), the new train of a split not settled yet (`split-pending`, "This train is still being split off another: try again in a moment.": from its post until the paired write its members are on the old train too, and a group split off it would outlive the split's take-back; `splitsPossible` and `splittableGroups` offer nothing of it), a group it does not have (`no-such-group`), an empty one (`empty-group`) or one that everybody on the train is in (`whole-train`, Matt, 2026-10-17: the old train would be left empty; the words name the group, `Everybody on this train is in group B (Fast): there is nothing to split it from.`, `splitRefusal`); staff and the conductor any other group; a member of the group (any status) their own (`not-in-group`, "Only a group's members, the conductor and the moderators can split a group off.") unless the conductor is in it (`conductor-in-group`). `splittableGroups` is what the dialog and the autocomplete offer; `splitsPossible` (two groups or more with somebody in them) whether the post shows the button.
+- The pure parts (`train.ts`): `splitTrain(old, { id, by, anonymous, group, now })` is the new train: `<old name> (<label or letter>)` cut to `MAX_PARTY_NAME` (the group keeps at least half of the room), the same server and region, route, stop, `finishedFrom`, mode, boss, start and end (through `withTrain`), one group A with the group's label, the group's members as they are in A, made now by the presser (named unless their privacy is Anonymous; `makerName` is noted by the service), led by the old conductor who goes with the group, else the presser in it unless their privacy is Anonymous (as a `/train` made anonymously, it then has none until `/conductor set`; Matt, 2026-10-17), else nobody, with `train.splitFrom` (the old party and post, `pending: true`). `splitOffGroup(old, member, staff, group, link, drawn?, anonymous?)` is the old train without the group and its members: the other groups keep their letters, the newest left takes new sign-ups when the newest went, its conductor stays unless they went, `train.splitOff` gains `{ partyId, postId, group, label? }` newest first (at most `MAX_SPLITS_KEPT`, 10); it answers the members who moved (`moved`), the group, who leads the new train and the old train as it was then (`was`: its train part, start and end). `drawn` is the group's mark as the dialog showed it (`groupMark`, FNV-1a in base 36 of the label and the party id of the newest `splitOff`): refused `group-changed` when the label changed, the group went, or another group was split off since, so a letter given again (even with the same label) is never taken for the group that had it. `splitDrawn(train, group, mark)` is the split a stale mark was drawn for when that very group is the one split off last. `carriedSplit(target, start, moved, conductor, was?, now?)` brings the new train in line with the group as it was at the split, and with the old train's place and times then unless they were changed on the new train meanwhile (as for the conductor); the very same train when that changes nothing. `splitSettled(train)` clears `pending`. A group opened after a split takes a letter that no group has and no split named, the first after the last in use, else the first such; when every free letter was a split's, the first free one (`nextGroupId`, `attendance.ts`): a letter can come again only then, and the mark keeps a stale dialog from taking the new group for the old.
 - `PartyService.splitTrain` (`ctx.trains.split`, `TrainService.split`, which adds the lines) does it as `relocate` does a raid's move, one split of a train at a time: refusals known at once are answered before anything is made (`no-forum` also when the region's forum is not the old train's); the new train is stored, pending, and gets its post in the same forum (`createTracked`: link line, summary, region copies follow; no new-train DMs); then both trains change in one write (`PartyStore.updateBoth([old, new], …)`, one transaction: both or neither), which decides anew; a refusal there (the presser left, the label changed, a second split), an old train that ended, a new train that ended meanwhile (its post deleted: `no-post`), or a failed write takes the new train back (`takeBack`: its post and link line deleted, dropped from the history as never having been a party). In that write the old train loses the group (`splitOffGroup`, the presser noted first), and who is in the group at that moment goes: a Leave or a Join on the old post while the new post was made counts; the new train, as it is then, is brought in line (`carriedSplit`, then `splitSettled`): it drops who left the group, adds who joined it, keeps what members did on the new post meanwhile (who left the new train stays out), is put where the old train was at the split (a Next or a route edit meanwhile) and is settled. A press on the new post while that write waits for the old train's lock goes before it or after it, as the order of the two ids puts the locks (`updateBoth` takes them in that order); either way it counts. Nobody is in both trains or in neither once it settles. The old post is never deleted or replaced: it is re-rendered without the group and with its small print (its region copies too), and gets its line.
 - No window between the writes: the old train's loss of the group and the new train's carry-over commit together or not at all, so nobody can end on both trains or on neither. What is left is the new post of a split whose write never committed: a stop of the process after the new post and before the write, or a failed write whose take-back could not end the new train. It stays pending (`train.splitFrom.pending`, in the state document) while the old train still has the group, and `settlePendingSplits` takes it back, each under the moves lock of its old train: once Discord is there after a start (`app.ts`: taking one back deletes a post), and with the clock's hourly upkeep those made a minute ago or more (`PartySchedulerOptions.splits`: the old train's moves lock keeps a split under way apart from the upkeep, which finds it settled once it has the lock; the minute's age only spares it waiting behind one), logging how many it settled and took back only when it did any; one it could not end stays pending for the next try and is not counted. A pending train whose old train is still active and lists it in `splitOff` cannot come of this code (only 8T's first build, which wrote the two trains one after the other, could leave one); it is settled as it is stored and logged as an error, since the group is on no other train. Only an active old train is seen (the store keeps no ended party): the pending train of an old train that ended is taken back, whatever the old one listed. A commit whose acknowledgement is lost (the connection drops after MySQL committed) is the same rare risk as for any `update`: the split's take-back then ends the new train although the old one lost the group, which leaves the group on neither train in the database (memory still has it on the old train) until the old train's next write stores it again, and a restart before that write makes the loss permanent (the restarted process reads the old train without the group); accepted as the same rare risk as any `update`.
 - Then the old post says `<doer> split group B (Fast) off into a train of its own.` (a line, no ping) and the new post `<doer> split this train off with group B (Fast).`, pinging the members who moved and allow `mentions`, never the presser (`doer`: a maker who asked not to be named is not; `This train was split off with …` then).
 - The post: last in the heading block, after the boss's facts (mockup 3), small print `Split off from <#post>` and per split `Group B (Fast) went its own way: <#post>`, newest first (channel mentions: Discord shows the post's current title, in copies too, after either train ended), cut through `fit.part` (labels shorter, then `…and N more`). The grey "✂️ Split group…" (`party:<id>:split`, `splitGroupButton`, `moves: true` so region copies leave it out) stands in the row of Move train… while two groups or more have somebody in them (`splitsPossible`); the worst case (five groups, `MAX_ROUTE_STOPS`, the picture, every split line) is 40 components with `postMessage`'s fold of four groups' details (44 unfolded).
-- The confirmation (`splitConfirmation`, `src/render/train-split.ts`; handlers `openSplit`, `pressSplit`, `cancelSplit`, `pickSplit` and `/group split` in `src/commands/trains/split.ts`): a private components-v2 message of `TRAIN_PANEL_COLOUR`, `### Split a group off the train`, what becomes of the group, the same route and stop, who moves (ten names and how many more), who leads which train, a menu of the groups when the member may split more than one (`party:<id>:splitpick`), "✂️ Split it off" (danger, `party:<id>:splitgo:<group>:<mark>`) and "Cancel" (`party:<id>:splitno`). "Split it off" first updates the confirmation to a note without controls (`Splitting group B (Fast) off…`, `splitNote`: nothing more can be pressed on it while the new post is made), then edits in the outcome: `Split off: <#post>`; a refusal draws the confirmation anew with the reason when the member may still split a group, else the reason alone; a train that ended meanwhile `This train is over.` A second press of the same confirmation waits for the first (one split of a train at a time) and is refused `group-changed`; `splitDrawn` sees that very group went, and it says `Split off: <#post>` too (`kind: 'already'`). The words are `splitGroupAs` (`train-changes.ts`), the code path the map can call later; `/group split letter:` answers with the same confirmation, its autocomplete only the groups the member may split.
+- The dialog (plan 8T-H; design `2026-10-18-train-split-dialog-design.md`, Matt, 2026-10-18: a reply under a busy post had to be scrolled to, and two presses made two): `splitDialog` (`src/render/train-split.ts`; handlers `openSplit`, `submitSplit` and `/group split` in `src/commands/trains/split.ts`), a Discord dialog titled `Split a group off the train` with Discord's own Submit and Cancel (Cancel says and splits nothing). It is the first answer: neither the button nor `/group split` defers, and only the member's privacy (`ctx.users.get`, one primary-key read) is read before it opens. "Split group…" opens it for the one group the member may split, or, when they may split two or more (the conductor, staff), the dialog that asks which; `/group split letter:` opens the one-group dialog of that group for anybody, after `mayNotSplit`; a member who may split none gets the reason privately (`whyNot`, `splitRefusal`) and no dialog. The one-group dialog is one text display: what becomes of the group, the same route and stop, who moves (in the post's order, `groupInPostOrder`, by name: ten names and how many more), who leads which train, `Submit splits it off.`; its custom id `party:<id>:splitform:<group>:<mark>`. The other is a text of what is the same for every group and the required radio group `Group that leaves` (`SPLIT_GROUP_INPUT`) of `splittableGroups` in the post's order, nothing picked (Discord refuses Submit until one is), each choice labelled `Group B (Fast) · Dawn, Iris +1, Cilan` (the members as the post lists them, `groupInPostOrder`, by name with their guests; those without a name counted in `, and N more`; the group's label cut to 40, the whole to 100) and described `<new train's name> · <who leads which>` (the conductor words without `it has no conductor;` where the old train keeps its conductor; beyond 100 the train's name is cut, in both places alike, so that the group and who leads stay whole and the choices differ), its value `<group>:<mark>` (`splitChoice`); its custom id `party:<id>:splitform`. Choices' labels and descriptions are the members' text as it is (Discord shows no markdown there), the texts are made plain. Submit is deferred privately, then `splitGroupAs` runs with the mark as `drawn`, and the answer (plain text) is `Split off: <#post>`; for the very group split off meanwhile, by a second Submit or somebody else (`splitDrawn`, `kind: 'already'`), the same; for a group called otherwise or gone (`group-changed`) `The groups of this train changed meanwhile: press Split group… again.`; any other refusal its words (a refusal none of the member's doing gives the use back: `givesBack`, `said`); a train that ended `This train is over.`; when the split throws `The split did not work: nothing was split off.`, and the error goes on to the router. Who is in the group at Submit goes, though the dialog named who was in it when it opened (Matt, 2026-10-18). Opening and Submit count as presses of the post (`ACTION_THROTTLE`). The private confirmation of 8T (`splitgo`, `splitno`, `splitpick`) is gone: a press of one drawn before gets the router's stale answer. `/group split`'s autocomplete offers only the groups the member may split.
 - The history records each train on its own (`history.md`: the step `split`, `PartyHistoryAttendee.splitOff`, `PartyHistory.splitFromId`; a pending train has no history until it is settled).
 
 ## Saved routes
diff --git a/docs/superpowers/plans/2026-10-17-phase-8t-staging.md b/docs/superpowers/plans/2026-10-17-phase-8t-staging.md
index 7baafa17..b1c1e8dc 100644
--- a/docs/superpowers/plans/2026-10-17-phase-8t-staging.md
+++ b/docs/superpowers/plans/2026-10-17-phase-8t-staging.md
@@ -11,9 +11,9 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 ## A train before its start, split by a group member (no conductor)
 
 4. Ash makes a train (`/train name:Saturday Loop`) with a start in an hour (`/meet`), a boss (`/boss`) and seven stops (`/route add`), mode loop (the panel's menu). Ash is in A. Dawn opens group B (`/group new`) and labels it (`/group label text:Fast`). The post now shows "✂️ Split group…" in the row of Move train… and Whole route (card 1A); with one group it was not there, and with group B opened but empty (before Dawn moved into it) it was not there either.
-5. Dawn presses Split group…: privately, the confirmation (card 2): `### Split a group off the train`, "Group **B (Fast)** leaves **Saturday Loop** and becomes a train of its own, **Saturday Loop (Fast)**:", the same route at stop 1 of 7, "not started yet", "Dawn moves to it as they are signed up now", "you are its conductor"; no menu (one group to split); Split it off (red) and Cancel.
-6. Cancel: the confirmation says "Nothing was split off." and has no controls; nothing changed in the post.
-7. Split group… again, then Split it off: at once the confirmation says "Splitting group B (Fast) off…" without controls, then "Split off: <link>"; the link opens the new post. The new post (card 3, draft 2): `### Raid Train: Saturday Loop (Fast)`, the same start, boss and mode, `Conductor: Dawn`, then the boss's facts, and last in the heading the small print "Split off from <old post>"; the same stop, its Next line; group A only, labelled Fast, Dawn in it; "Created by" Dawn. Its thread's first line: "**Dawn** (@Dawn) split this train off with group B (Fast)." with no ping (Dawn is the presser and the only member).
+5. Dawn presses Split group…: a dialog opens over the post at once (plan 8T-H; the first step that opens a dialog of text only), titled "Split a group off the train", with Discord's Submit and Cancel and nothing to pick: "Group **B (Fast)** leaves **Saturday Loop** and becomes a train of its own, **Saturday Loop (Fast)**:", the same route at stop 1 of 7, "not started yet", "Dawn moves to it as they are signed up now", "you are its conductor", then "Submit splits it off." Nothing is said in the channel or privately.
+6. Cancel (or Escape): the dialog closes; nothing is said and nothing changed in the post.
+7. Split group… again, then Submit: Discord shows its own wait, then privately "Split off: <link>"; the link opens the new post. The new post (card 3, draft 2): `### Raid Train: Saturday Loop (Fast)`, the same start, boss and mode, `Conductor: Dawn`, then the boss's facts, and last in the heading the small print "Split off from <old post>"; the same stop, its Next line; group A only, labelled Fast, Dawn in it; "Created by" Dawn. Its thread's first line: "**Dawn** (@Dawn) split this train off with group B (Fast)." with no ping (Dawn is the presser and the only member).
 8. The old post: small print "Group B (Fast) went its own way: <new post>" last in its heading, group A only (Ash), no Split group… any more; its thread: "**Dawn** (@Dawn) split group B (Fast) off into a train of its own." Both links show the posts' titles (Train · …).
 9. Nobody got a new-train DM for Saturday Loop (Fast) (an account with `/settings new-trains` on in this server: none arrives).
 
@@ -24,21 +24,21 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 
 ## Mid-route, split by the conductor
 
-12. A second train, all three in it; Ash takes the conductor (`/conductor set`), moves it to stop 3. Dawn opens group B and Iris joins it. Ash (not in B) presses Split group…: the menu lists A and B (the conductor may split any), A chosen (Ash's own group); pick B in the menu: the text is for B, "it has no conductor; you stay the conductor of …".
-13. Split it off: the new train has no conductor and is at stop 3; Dawn and Iris are pinged once in the new post's first line (if their `/settings mentions` allows it; turn it off for Iris and check she is not pinged); Ash is not pinged.
+12. A second train, all three in it; Ash takes the conductor (`/conductor set`), moves it to stop 3. Dawn opens group B and Iris joins it. Ash (not in B) presses Split group…: the dialog that asks which group: the common text ("The group you pick leaves **…** and becomes a train of its own: the same route, at the same stop (stop 3 of …), …"), then "Group that leaves" with a choice for A ("Group A · Ash", described "<train> (A) · you are its conductor, and <train> has none then") and one for B ("Group B · Dawn, Iris", described "<train> (B) · you stay the conductor of <train>"), nothing picked; Submit is refused by Discord until one is picked ("This field is required."). Pick B.
+13. Submit: "Split off: <link>"; the new train has no conductor and is at stop 3; Dawn and Iris are pinged once in the new post's first line (if their `/settings mentions` allows it; turn it off for Iris and check she is not pinged); Ash is not pinged.
 
 ## A group with the conductor in it, pressed by another member
 
-14. A train where Dawn is the conductor and in group B with Iris. Iris presses Split group…: "The conductor is in that group: only they and the moderators can split it off." Dawn may (her confirmation: "you are its conductor, and <train> has none then"); after the split the old train has no conductor.
+14. A train where Dawn is the conductor and in group B with Iris. Iris presses Split group…: "The conductor is in that group: only they and the moderators can split it off.", and no dialog. Dawn may (her dialog asks which group, since the conductor may split any; B's choice: "you are its conductor, and <train> has none then"); after the split the old train has no conductor.
 
 ## Staff, a finished route, stale and double presses, an ended train
 
-15. Ash as the Moderator, not signed up in a train of step 4's kind that Dawn made (Dawn in B, Iris in A; or Ash's own train after Ash pressed Leave), presses Split group…: the menu of every group that has somebody; splitting B: "it has no conductor" unless the conductor is in B. The new post says "Created by" Ash although Ash is not on it, and pings Dawn. `/group split letter:B` gives the same confirmation; its autocomplete offers only the groups the account may split (Iris sees group A only; somebody in no group sees none).
-16. A train whose route is finished (Finish on the panel), with groups A and B: split B: the confirmation says "the same route, finished"; the new train's post says Route complete, and Previous on its panel goes back to the stop the old train finished from.
-17. Stale confirm: Dawn opens the confirmation for B, then Iris relabels B (`/group label`); Dawn's Split it off: the confirmation drawn anew with "The groups of this train changed meanwhile." above, for B as it is called now.
-18. Quick double press: Dawn opens the confirmation for B and presses Split it off twice as fast as she can (or Dawn and Iris each open one and press at once): one new train only; each press ends as "Split off: <link>" (the second waits for the first). A confirmation for B opened before somebody else split B off says "Split off: <link>" too.
+15. Ash as the Moderator, not signed up in a train of step 4's kind that Dawn made (Dawn in B, Iris in A; or Ash's own train after Ash pressed Leave), presses Split group…: the dialog that asks which, a choice for every group that has somebody. B's description names who leads, as the train is: with no conductor "it has no conductor"; with the conductor outside B (`/conductor set` by Iris) "Iris stays the conductor of …"; with the conductor in B (`/conductor set` by Dawn) "Dawn is its conductor, and … has none then". Split B off: the new post says "Created by" Ash although Ash is not on it, and pings Dawn. `/group split letter:B` opens the one-group dialog of B (no choice, for staff too); its autocomplete offers only the groups the account may split (Iris sees group A only; somebody in no group sees none).
+16. A train whose route is finished (Finish on the panel), with groups A and B: split B: the dialog says "the same route, finished"; the new train's post says Route complete, and Previous on its panel goes back to the stop the old train finished from.
+17. Stale dialog: Dawn opens the dialog for B, then Iris relabels B (`/group label`); Dawn's Submit: "The groups of this train changed meanwhile: press Split group… again.", nothing split; Split group… again shows B as it is called now. (Iris leaving or joining B instead does not refuse it: who is in B at Submit goes, Matt 2026-10-18.)
+18. Double Submit: Discord shows one dialog at a time, so Dawn and Iris each open the dialog for B and press Submit at once: one new train only; each ends as "Split off: <link>" (the second waits for the first). A dialog for B opened before somebody else split B off says "Split off: <link>" too. A press of a confirmation's "Split it off" or "Cancel" left in a channel from the 8T build answers "This control is no longer active."
 19. A group opened after a split takes a new letter: after B went, `/group new` opens C, not B again.
-20. A confirmation of a train that ended meanwhile (`/delete` it as Ash): Discord disables the confirmation's buttons once the post is locked, so nothing can be split off (run 2026-10-17); "This train is over." answers only a press in the moment between the end and the lock (unit-tested).
+20. A dialog of a train that ended meanwhile: Dawn opens the dialog, Ash `/delete`s the train while it is open, then Dawn presses Submit: either "This train is over." or Discord's own refusal; in both cases nothing is split off and no new post appears. Note which one, once for archive and once for delete.
 21. `/group split` in a raid's post: "This is the post of a raid: that only works in the post of a train."; in a meetup's post "This is the post of a meetup: that only works in the post of a train."
 
 ## Copies, map, restart, history
@@ -52,7 +52,7 @@ Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in i
 ## Help and phone
 
 27. `/help group split` reads whole, with the example `/group split letter:B`; `/help group` lists it as "`/group split <letter>` Split a group off this train into a train of its own".
-28. On the phone: the post's button row with Split group… (three buttons), the confirmation and its menu, both posts' small print links.
+28. On the phone: the post's button row with Split group… (three buttons), both dialogs (the text alone; the choices with their descriptions, none picked), both posts' small print links. Give Iris the display name `*Iris_* example.com` first: the choice of her group shows the name exactly as typed (no bold or italics, the asterisks and underscore there, the domain as text); if Discord renders markdown in choices, say so (the names then need `plain()`).
 
 ## Rollback
 
diff --git a/docs/superpowers/specs/2026-10-17-train-split-design.md b/docs/superpowers/specs/2026-10-17-train-split-design.md
index a34c6681..ff2b8ab2 100644
--- a/docs/superpowers/specs/2026-10-17-train-split-design.md
+++ b/docs/superpowers/specs/2026-10-17-train-split-design.md
@@ -42,6 +42,8 @@ A raid train keeps all its groups at one stop: one route, one current stop (`tra
 
 ## The confirmation (private, mockup section 2)
 
+Replaced by a dialog (plan 8T-H, Matt, 2026-10-18): `2026-10-18-train-split-dialog-design.md`. What follows is the confirmation as 8T built it.
+
 One components-v2 message (`v2.ts`), like the Move train panel:
 
 - `### Split a group off the train`
diff --git a/src/commands/parties/reply.ts b/src/commands/parties/reply.ts
index 1b91cb48..20fbf4d0 100644
--- a/src/commands/parties/reply.ts
+++ b/src/commands/parties/reply.ts
@@ -3,6 +3,7 @@ import {
   type AutocompleteInteraction,
   type ChatInputCommandInteraction,
   type MessageComponentInteraction,
+  type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import { decodeCustomId } from '../../discord/custom-id.js';
@@ -55,7 +56,7 @@ export const ACTION_THROTTLE: Throttle = { uses: 30, perSeconds: 60 };
 
 /** The member who made an interaction, as the attendance service wants them. */
 export function actingMember(
-  interaction: ChatInputCommandInteraction | MessageComponentInteraction,
+  interaction: ChatInputCommandInteraction | MessageComponentInteraction | ModalSubmitInteraction,
 ): Member {
   return { id: interaction.user.id, ...memberInfo(interaction) };
 }
diff --git a/src/commands/trains/split.test.ts b/src/commands/trains/split.test.ts
index 8f755502..520f4928 100644
--- a/src/commands/trains/split.test.ts
+++ b/src/commands/trains/split.test.ts
@@ -1,33 +1,32 @@
-import { ComponentType, MessageFlags } from 'discord.js';
+import { MessageFlags, type APIModalInteractionResponseCallbackData } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
   asV2,
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeModal,
   fakeSelect,
   sent,
   type FakeInteraction,
-  type FakeRow,
 } from '../../../test/support/fake-interactions.js';
 import { WEST_FORUM } from '../../../test/support/gyms.js';
-import { customIdsOf, selectsOf, textDisplays } from '../../../test/support/messages.js';
+import { textDisplays } from '../../../test/support/messages.js';
 import { ALICE, BOB, CAROL, PARTY_NOW, REPORTER, asTrain } from '../../../test/support/parties.js';
 import { createdMeetup, createdTrain, reportedRaid } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { partyButtons } from '../../components/party.js';
 import { ACTION_THROTTLE } from '../parties/reply.js';
-import { InteractionRouter } from '../../discord/router.js';
-import type { V2Message } from '../../discord/party-gateway.js';
-import { isTrain } from '../../domain/party/party.js';
+import { InteractionRouter, STALE_COMPONENT } from '../../discord/router.js';
+import { isTrain, type GroupId } from '../../domain/party/party.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import { groupMark } from '../../domain/party/train.js';
 import { group } from '../parties/group.js';
 import { help, helpControls } from '../util/help.js';
-import { splitConfirmation } from '../../render/train-split.js';
+import { SPLIT_GROUP_INPUT, splitDialog } from '../../render/train-split.js';
 
 const DAVE = '200000000000000005';
-/** A message a control is on that is components v2, as the confirmation is. */
-const V2_ROWS: readonly FakeRow[] = [{ type: ComponentType.Container, components: [] }];
+const STAFF = { userId: DAVE, displayName: 'Dave', roleNames: ['Moderator'] } as const;
 
 beforeEach(() => {
   vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
@@ -36,6 +35,13 @@ afterEach(() => {
   vi.useRealTimers();
 });
 
+/** The dialog a fake was answered with (`showModal`); undefined when it opened none. */
+function dialogOf(
+  interaction: FakeInteraction,
+): APIModalInteractionResponseCallbackData | undefined {
+  return interaction.showModal.mock.calls[0]?.[0] as APIModalInteractionResponseCallbackData;
+}
+
 /**
  * A train on stop 2 of 3 with the maker and Carol in A, and group B (Fast): Alice opened it, Bob
  * is in it. The `/group` command and the post's controls, routed as the bot routes them.
@@ -73,32 +79,50 @@ async function setup() {
         channelId: made.postId,
         userId: ALICE,
         displayName: 'Alice',
-        messageRows: V2_ROWS,
         ...extra,
       }),
     );
   /**
-   * The confirmation as Alice (unless `as` says otherwise) would be shown it now; `anonymous`
-   * when they asked not to be named.
+   * The dialog as Alice (unless `as` says otherwise) would be shown it now, for `groups`;
+   * `anonymous` when they asked not to be named.
    */
   const drawn = (
-    groupId: 'A' | 'B' = 'B',
+    groups: readonly [GroupId, ...GroupId[]] = ['B'],
     as = ALICE,
     staff = false,
     anonymous = false,
-  ): V2Message =>
-    splitConfirmation({
-      party: made.current(),
-      gym: (gymId) => ctx.gyms.get(gymId),
-      memberId: as,
-      staff,
-      anonymous,
-      group: groupId,
-      now: PARTY_NOW,
+  ): APIModalInteractionResponseCallbackData =>
+    splitDialog(
+      {
+        party: made.current(),
+        gym: (gymId) => ctx.gyms.get(gymId),
+        memberId: as,
+        staff,
+        anonymous,
+        now: PARTY_NOW,
+      },
+      groups,
+    );
+  /** A Submit of `dialog`, by Alice unless `extra` says otherwise; `picked` its pick. */
+  const submitOf = (
+    dialog: APIModalInteractionResponseCallbackData,
+    picked?: string,
+    extra: object = {},
+  ): FakeInteraction =>
+    fakeModal({
+      customId: dialog.custom_id,
+      form: dialog,
+      ...(picked === undefined ? {} : { picked: { [SPLIT_GROUP_INPUT]: picked } }),
+      channelId: made.postId,
+      userId: ALICE,
+      displayName: 'Alice',
+      ...extra,
     });
-  /** The custom id of "Split it off" of a confirmation. */
-  const go = (message: V2Message): string =>
-    customIdsOf(message).find((custom) => custom.includes(':splitgo:')) ?? '';
+  const submit = (
+    dialog: APIModalInteractionResponseCallbackData,
+    picked?: string,
+    extra: object = {},
+  ) => handle(submitOf(dialog, picked, extra));
   const split = (extra: object = {}) =>
     handle(
       fakeChatInput({
@@ -111,7 +135,22 @@ async function setup() {
         ...extra,
       }),
     );
-  return { ...made, ctx, entries, router, handle, click, drawn, go, split, inPost };
+  /** The new train, once one was split off. */
+  const fresh = () => made.store.active().find((party) => party.id !== made.party.id);
+  return {
+    ...made,
+    ctx,
+    entries,
+    router,
+    handle,
+    click,
+    drawn,
+    submit,
+    submitOf,
+    split,
+    inPost,
+    fresh,
+  };
 }
 
 /** Holds the making of the next post (the new train's) until `release` is called. */
@@ -136,40 +175,54 @@ function holdPost(made: Awaited<ReturnType<typeof setup>>): {
   return { release, reached };
 }
 
-/** What the confirmation says while the split is under way. */
-const SPLITTING = 'Splitting group B (Fast) off…';
-
-/** The first text of the components-v2 message a responder was first given. */
-const firstText = (responder: Parameters<typeof sent>[0]): string =>
-  textDisplays(asV2(sent(responder)))[0] ?? '';
+/** What a Submit was answered with, after its private deferral. */
+function answerOf(submitted: FakeInteraction): string | undefined {
+  expect(submitted.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+  return sent(submitted.editReply).content;
+}
 
 describe('the button "Split group…" of a train post', () => {
-  it('answers a member of the group privately with the confirmation', async () => {
+  it('opens the dialog of the one group a member of it may split, and says nothing else', async () => {
     const made = await setup();
     const pressed = await made.click(`party:${made.party.id}:split`);
-    const reply = sent(pressed.reply) as { flags?: number };
-    expect(reply.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
-    expect(asV2(reply)).toEqual(made.drawn());
-    expect(firstText(pressed.reply)).toMatch(
-      /^### Split a group off the train\nGroup \*\*B \(Fast\)\*\*/u,
-    );
+    expect(dialogOf(pressed)).toEqual(made.drawn(['B']));
+    expect(pressed.reply).not.toHaveBeenCalled();
+    expect(pressed.deferReply).not.toHaveBeenCalled();
+    expect(made.store.active()).toHaveLength(1);
   });
 
   it('says that a member who asked not to be named will not lead the new train', async () => {
     const made = await setup();
     made.userSettings.set(ALICE, { raidPrivacy: RaidPrivacy.Anonymous });
     const pressed = await made.click(`party:${made.party.id}:split`);
-    expect(asV2(sent(pressed.reply))).toEqual(made.drawn('B', ALICE, false, true));
-    expect(firstText(pressed.reply)).toMatch(/^- it has no conductor$/mu);
-    await made.click(made.go(made.drawn('B', ALICE, false, true)));
-    const fresh = made.store.active().find((party) => party.id !== made.party.id);
-    expect(asTrain(fresh)).toMatchObject({ anonymous: true, train: { conductorId: null } });
+    const dialog = dialogOf(pressed);
+    expect(dialog).toEqual(made.drawn(['B'], ALICE, false, true));
+    expect(dialog?.components[0]).toMatchObject({
+      content: expect.stringMatching(/^- it has no conductor$/mu) as unknown,
+    });
+    if (dialog) await made.submit(dialog);
+    expect(asTrain(made.fresh())).toMatchObject({ anonymous: true, train: { conductorId: null } });
   });
 
-  it('tells a member who may split no group why, and nothing more', async () => {
+  it('opens the dialog that asks which group for staff and the conductor, who may split several', async () => {
     const made = await setup();
-    const refused = async (extra: object) =>
-      sent((await made.click(`party:${made.party.id}:split`, extra)).reply).content;
+    const forStaff = await made.click(`party:${made.party.id}:split`, STAFF);
+    expect(dialogOf(forStaff)).toEqual(made.drawn(['A', 'B'], DAVE, true));
+    await made.trains.setConductor(made.party.id, { id: CAROL, name: 'Carol' });
+    const forConductor = await made.click(`party:${made.party.id}:split`, {
+      userId: CAROL,
+      displayName: 'Carol',
+    });
+    expect(dialogOf(forConductor)).toEqual(made.drawn(['A', 'B'], CAROL));
+  });
+
+  it('tells a member who may split no group why, and opens no dialog', async () => {
+    const made = await setup();
+    const refused = async (extra: object) => {
+      const pressed = await made.click(`party:${made.party.id}:split`, extra);
+      expect(pressed.showModal).not.toHaveBeenCalled();
+      return sent(pressed.reply).content;
+    };
     expect(await refused({ userId: DAVE, displayName: 'Dave' })).toBe(
       "Only a group's members, the conductor and the moderators can split a group off.",
     );
@@ -190,15 +243,16 @@ describe('the button "Split group…" of a train post', () => {
     const whole =
       'Everybody on this train is in group B (Fast): there is nothing to split it from.';
     expect(sent(pressed.reply).content).toBe(whole);
-    expect(sent((await made.split()).reply).content).toBe(whole);
+    const used = await made.split();
+    expect(sent(used.reply).content).toBe(whole);
+    expect(used.showModal).not.toHaveBeenCalled();
     expect(made.store.active()).toHaveLength(1);
   });
 
   it('tells staff in no group why no group can be split: the group that has everybody, or none', async () => {
     const made = await setup();
-    const staff = { userId: DAVE, displayName: 'Dave', roleNames: ['Moderator'] };
     const refused = async () =>
-      sent((await made.click(`party:${made.party.id}:split`, staff)).reply).content;
+      sent((await made.click(`party:${made.party.id}:split`, STAFF)).reply).content;
     await made.attendance.leave(made.party.id, { id: REPORTER, name: 'Ash' });
     await made.attendance.leave(made.party.id, { id: CAROL, name: 'Carol' });
     expect(await refused()).toBe(
@@ -213,11 +267,7 @@ describe('the button "Split group…" of a train post', () => {
   it('tells staff a train without a post yet has none to split', async () => {
     const made = await setup();
     await made.store.update(made.party.id, (party) => ({ party: { ...party, forumPostId: null } }));
-    const pressed = await made.click(`party:${made.party.id}:split`, {
-      userId: DAVE,
-      displayName: 'Dave',
-      roleNames: ['Moderator'],
-    });
+    const pressed = await made.click(`party:${made.party.id}:split`, STAFF);
     expect(sent(pressed.reply).content).toBe('This train has no post yet: try again in a moment.');
   });
 
@@ -236,11 +286,7 @@ describe('the button "Split group…" of a train post', () => {
           }
         : {},
     );
-    const pressed = await made.click(`party:${made.party.id}:split`, {
-      userId: DAVE,
-      displayName: 'Dave',
-      roleNames: ['Moderator'],
-    });
+    const pressed = await made.click(`party:${made.party.id}:split`, STAFF);
     expect(sent(pressed.reply).content).toBe(
       'This train is still being split off another: try again in a moment.',
     );
@@ -259,188 +305,197 @@ describe('the button "Split group…" of a train post', () => {
     );
   });
 
-  it('offers staff a menu of the groups, and a pick shows the confirmation for that group', async () => {
+  it('says the train is over when it ended', async () => {
     const made = await setup();
-    const staff = { userId: DAVE, displayName: 'Dave', roleNames: ['Moderator'] };
-    const pressed = await made.click(`party:${made.party.id}:split`, staff);
-    const shown = asV2(sent(pressed.reply));
-    expect(selectsOf(shown)[0]?.options.map((option) => option.value)).toEqual(['A', 'B']);
-    const picked = await made.handle(
-      fakeSelect({
-        customId: `party:${made.party.id}:splitpick`,
-        values: ['A'],
-        channelId: made.postId,
-        userId: DAVE,
-        displayName: 'Dave',
-        roleNames: ['Moderator'],
-        messageRows: shown.components as FakeRow[],
-      }),
-    );
-    expect(asV2(sent(picked.update))).toEqual(made.drawn('A', DAVE, true));
+    await made.service.end(made.party.id);
+    const pressed = await made.click(`party:${made.party.id}:split`);
+    expect(sent(pressed.reply).content).toBe('This train is over.');
+    expect(pressed.showModal).not.toHaveBeenCalled();
   });
 });
 
-describe('the confirmation', () => {
-  it('splits the group off on "Split it off", and says where the new train is', async () => {
+describe('a Submit of the dialog', () => {
+  it('splits the group off, and says privately where the new train is', async () => {
     const made = await setup();
-    const confirmed = await made.click(made.go(made.drawn()));
-    // At once, without its controls: a second press cannot ask for another split meanwhile.
-    expect(firstText(confirmed.update)).toBe(SPLITTING);
-    expect(customIdsOf(asV2(sent(confirmed.update)))).toEqual([]);
-    const fresh = made.store.active().find((party) => party.id !== made.party.id);
+    const submitted = await made.submit(made.drawn());
+    const fresh = made.fresh();
     expect(fresh?.forumPostId).toBeDefined();
-    expect(firstText(confirmed.editReply)).toBe(`Split off: <#${fresh?.forumPostId}>`);
-    expect(customIdsOf(asV2(sent(confirmed.editReply)))).toEqual([]);
+    expect(answerOf(submitted)).toBe(`Split off: <#${fresh?.forumPostId}>`);
     expect(Object.keys(made.current().attendees)).toEqual([REPORTER, CAROL]);
     expect(Object.keys(asTrain(fresh).attendees)).toEqual([ALICE, BOB]);
   });
 
-  it('closes on Cancel and splits nothing', async () => {
+  it('splits the group picked off', async () => {
     const made = await setup();
-    const cancelled = await made.click(`party:${made.party.id}:splitno`);
-    expect(firstText(cancelled.update)).toBe('Nothing was split off.');
-    expect(made.store.active()).toHaveLength(1);
+    const dialog = made.drawn(['A', 'B'], DAVE, true);
+    const submitted = await made.submit(dialog, `A:${groupMark(made.current(), 'A') ?? ''}`, STAFF);
+    const fresh = made.fresh();
+    expect(answerOf(submitted)).toBe(`Split off: <#${fresh?.forumPostId}>`);
+    expect(Object.keys(made.current().attendees)).toEqual([ALICE, BOB]);
+    expect(Object.keys(asTrain(fresh).attendees)).toEqual([REPORTER, CAROL]);
   });
 
-  it('draws itself anew with the reason when the group changed since', async () => {
+  it('splits nothing and says the groups changed when the group was called otherwise meanwhile', async () => {
     const made = await setup();
     const before = made.drawn();
     await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, 'Slow');
-    const confirmed = await made.click(made.go(before));
-    expect(asV2(sent(confirmed.editReply))).toEqual(
-      splitConfirmation(
-        {
-          party: made.current(),
-          gym: (gymId) => made.ctx.gyms.get(gymId),
-          memberId: ALICE,
-          staff: false,
-          anonymous: false,
-          group: 'B',
-          now: PARTY_NOW,
-        },
-        'The groups of this train changed meanwhile.',
-      ),
+    const submitted = await made.submit(before);
+    expect(answerOf(submitted)).toBe(
+      'The groups of this train changed meanwhile: press Split group… again.',
     );
     expect(made.store.active()).toHaveLength(1);
   });
 
+  it('says so of a pick whose group changed meanwhile too', async () => {
+    const made = await setup();
+    const dialog = made.drawn(['A', 'B'], DAVE, true);
+    const pick = `B:${groupMark(made.current(), 'B') ?? ''}`;
+    await made.attendance.labelGroup(made.party.id, { id: ALICE, name: 'Alice' }, 'Slow');
+    const submitted = await made.submit(dialog, pick, STAFF);
+    expect(answerOf(submitted)).toBe(
+      'The groups of this train changed meanwhile: press Split group… again.',
+    );
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('splits who is in the group at Submit, also when that changed meanwhile', async () => {
+    const made = await setup();
+    const before = made.drawn();
+    await made.attendance.leave(made.party.id, { id: BOB, name: 'Bob' });
+    const submitted = await made.submit(before);
+    expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
+    expect(Object.keys(asTrain(made.fresh()).attendees)).toEqual([ALICE]);
+  });
+
   it('says where the group went when somebody split that very group off first', async () => {
     const made = await setup();
     const before = made.drawn();
     // Bob splits the group off first: Alice is on the new train, the old has nothing of hers.
     await made.trains.split(made.party.id, { id: BOB, name: 'Bob' }, false, 'B');
-    const fresh = made.store.active().find((party) => party.id !== made.party.id);
-    const confirmed = await made.click(made.go(before));
-    expect(firstText(confirmed.editReply)).toBe(`Split off: <#${fresh?.forumPostId}>`);
-    expect(customIdsOf(asV2(sent(confirmed.editReply)))).toEqual([]);
+    const submitted = await made.submit(before);
+    expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
     expect(made.store.active()).toHaveLength(2);
   });
 
-  it('answers both presses of one confirmation with where the group went, and splits once', async () => {
+  it('answers two Submits of one dialog with where the group went, and splits once', async () => {
     const made = await setup();
-    const customId = made.go(made.drawn());
+    const dialog = made.drawn();
     const { release, reached } = holdPost(made);
-    const first = made.click(customId);
+    const first = made.submit(dialog);
     await reached;
-    // The second press waits for the first split to settle.
-    const second = made.click(customId);
+    // The second Submit waits for the first split to settle.
+    const second = made.submit(dialog);
     release();
-    const presses = await Promise.all([first, second]);
-    const fresh = made.store.active().find((party) => party.id !== made.party.id);
-    for (const pressed of presses) {
-      expect(firstText(pressed.update)).toBe(SPLITTING);
-      expect(firstText(pressed.editReply)).toBe(`Split off: <#${fresh?.forumPostId}>`);
+    const submits = await Promise.all([first, second]);
+    for (const submitted of submits) {
+      expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
     }
     expect(made.store.active()).toHaveLength(2);
     expect(made.gateway.postsIn(WEST_FORUM)).toHaveLength(2);
   });
 
-  it('says the train is over when it ended while the group was being split off', async () => {
+  it('says why when the member may split nothing any more', async () => {
+    const made = await setup();
+    const before = made.drawn();
+    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
+    const submitted = await made.submit(before);
+    expect(answerOf(submitted)).toBe(
+      "Only a group's members, the conductor and the moderators can split a group off.",
+    );
+    expect(made.store.active()).toHaveLength(1);
+  });
+
+  it('says the train is over when it ended before the Submit, or while the group was split off', async () => {
     const made = await setup();
+    const dialog = made.drawn();
     const { release, reached } = holdPost(made);
-    const pressing = made.click(made.go(made.drawn()));
+    const submitting = made.submit(dialog);
     await reached;
     await made.service.end(made.party.id);
     release();
-    const pressed = await pressing;
-    expect(firstText(pressed.update)).toBe(SPLITTING);
-    expect(firstText(pressed.editReply)).toBe('This train is over.');
-    expect(customIdsOf(asV2(sent(pressed.editReply)))).toEqual([]);
+    expect(answerOf(await submitting)).toBe('This train is over.');
     expect(made.store.active()).toEqual([]);
+    const late = await made.submit(dialog);
+    expect(sent(late.reply).content).toBe('This train is over.');
   });
 
-  it('closes with the reason when the member may split nothing any more', async () => {
+  it('says the split did not work when it failed, and the router says what went wrong', async () => {
     const made = await setup();
-    const before = made.drawn();
-    await made.attendance.leave(made.party.id, { id: ALICE, name: 'Alice' });
-    const confirmed = await made.click(made.go(before));
-    expect(firstText(confirmed.editReply)).toBe(
-      "Only a group's members, the conductor and the moderators can split a group off.",
-    );
-    expect(customIdsOf(asV2(sent(confirmed.editReply)))).toEqual([]);
+    made.gateway.failing.set('createPost', new Error('Discord is away'));
+    const submitted = await made.submit(made.drawn());
+    made.gateway.failing.delete('createPost');
+    expect(answerOf(submitted)).toBe('The split did not work: nothing was split off.');
+    expect(sent(submitted.followUp).content).toMatch(/^Something went wrong/u);
     expect(made.store.active()).toHaveLength(1);
   });
 
-  it('says the split did not work when it failed, instead of splitting for good', async () => {
+  it('logs an answer that could not be given and lets the failure of the split go to the router', async () => {
     const made = await setup();
     made.gateway.failing.set('createPost', new Error('Discord is away'));
-    const confirmed = await made.click(made.go(made.drawn()));
+    const submitted = made.submitOf(made.drawn());
+    submitted.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));
+    await made.handle(submitted);
     made.gateway.failing.delete('createPost');
-    expect(firstText(confirmed.update)).toBe(SPLITTING);
-    expect(firstText(confirmed.editReply)).toBe('The split did not work: nothing was split off.');
-    expect(customIdsOf(asV2(sent(confirmed.editReply)))).toEqual([]);
-    // The failure itself went to the router, which says it went wrong.
-    expect(sent(confirmed.followUp).content).toMatch(/^Something went wrong/u);
+    const failed = made.entries.find((entry) => entry.msg === 'interaction failed');
+    expect(failed?.err).toMatchObject({ message: 'Discord is away' });
+    const note = made.entries.find(
+      (entry) => entry.msg === 'could not say that the split did not work',
+    );
+    expect(note?.err).toMatchObject({ message: 'Unknown Webhook' });
     expect(made.store.active()).toHaveLength(1);
   });
 
-  it('says plainly where the bot may not make the new post, and counts none of the presses', async () => {
+  it('says plainly where the bot may not make the new post, and counts none of the Submits', async () => {
     const made = await setup();
     made.gateway.refusePosts.set(WEST_FORUM, ['Manage Posts']);
-    // More presses than the post's controls allow a minute: none of them is the member's doing.
+    // More Submits than the post's controls allow a minute: none of them is the member's doing.
     for (let n = 0; n <= ACTION_THROTTLE.uses; n++) {
-      const confirmed = await made.click(made.go(made.drawn()));
-      expect(firstText(confirmed.update)).toBe(SPLITTING);
-      // The confirmation drawn anew with the reason: the member may try again once it is given.
-      expect(firstText(confirmed.editReply)).toContain(
+      const submitted = await made.submit(made.drawn());
+      expect(answerOf(submitted)).toBe(
         `I am not allowed to make posts in <#${WEST_FORUM}>: I lack the permission Manage Posts ` +
           "there. Nothing was made. The server's staff must give it to me.",
       );
       // Said there, once.
-      expect(confirmed.followUp).not.toHaveBeenCalled();
+      expect(submitted.followUp).not.toHaveBeenCalled();
     }
     expect(made.store.active()).toHaveLength(1);
   });
 
-  it('logs a failed note and lets the failure of the split itself go to the router', async () => {
+  it('counts with the presses of the post', async () => {
     const made = await setup();
-    made.gateway.failing.set('createPost', new Error('Discord is away'));
-    const press = fakeButton({
-      customId: made.go(made.drawn()),
-      channelId: made.postId,
-      userId: ALICE,
-      displayName: 'Alice',
-      messageRows: V2_ROWS,
+    for (let n = 0; n < ACTION_THROTTLE.uses; n++) {
+      await made.click(`party:${made.party.id}:split`, { userId: DAVE, displayName: 'Dave' });
+    }
+    const submitted = await made.submit(made.drawn(), undefined, {
+      userId: DAVE,
+      displayName: 'Dave',
     });
-    press.editReply.mockRejectedValueOnce(new Error('Unknown Webhook'));
-    await made.handle(press);
-    made.gateway.failing.delete('createPost');
-    const failed = made.entries.find((entry) => entry.msg === 'interaction failed');
-    expect(failed?.err).toMatchObject({ message: 'Discord is away' });
-    const note = made.entries.find(
-      (entry) => entry.msg === 'could not say that the split did not work',
-    );
-    expect(note?.err).toMatchObject({ message: 'Unknown Webhook' });
+    expect(sent(submitted.reply).content).toMatch(/^That was a lot of clicks/u);
     expect(made.store.active()).toHaveLength(1);
   });
+});
 
-  it('closes when the train is over', async () => {
+describe('the controls of the private confirmation of plan 8T', () => {
+  it('are no longer active', async () => {
     const made = await setup();
-    const before = made.drawn();
-    await made.service.end(made.party.id);
-    const confirmed = await made.click(made.go(before));
-    expect(firstText(confirmed.update)).toBe('This train is over.');
-    expect(made.store.active()).toEqual([]);
+    const mark = groupMark(made.current(), 'B') ?? '';
+    for (const customId of [
+      `party:${made.party.id}:splitgo:B:${mark}`,
+      `party:${made.party.id}:splitno`,
+    ]) {
+      expect(sent((await made.click(customId)).reply).content).toBe(STALE_COMPONENT);
+    }
+    const picked = await made.handle(
+      fakeSelect({
+        customId: `party:${made.party.id}:splitpick`,
+        values: ['B'],
+        channelId: made.postId,
+        userId: ALICE,
+        displayName: 'Alice',
+      }),
+    );
+    expect(sent(picked.reply).content).toBe(STALE_COMPONENT);
+    expect(made.store.active()).toHaveLength(1);
   });
 });
 
@@ -456,6 +511,7 @@ describe('/help group split', () => {
     expect(page).toMatch(/^### \/group split/u);
     expect(page).toContain('/group split letter:B');
     expect(page).toContain('Split group…');
+    expect(page).toContain('You are asked first, in a dialog.');
     expect((await ask('group')).split('\n')).toContain(
       '`/group split <letter>` Split a group off this train into a train of its own',
     );
@@ -463,20 +519,34 @@ describe('/help group split', () => {
 });
 
 describe('/group split', () => {
-  it('answers with the private confirmation of that group', async () => {
+  it('opens the dialog of that group', async () => {
     const made = await setup();
     const used = await made.split();
-    const reply = sent(used.reply) as { flags?: number };
-    expect(reply.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
-    expect(asV2(reply)).toEqual(made.drawn());
+    expect(dialogOf(used)).toEqual(made.drawn(['B']));
+    expect(used.reply).not.toHaveBeenCalled();
     expect(made.store.active()).toHaveLength(1);
   });
 
+  it('opens the dialog of that one group for staff too, who may split several', async () => {
+    const made = await setup();
+    const used = await made.split({ ...STAFF, options: { letter: 'A' } });
+    const dialog = dialogOf(used);
+    expect(dialog).toEqual(made.drawn(['A'], DAVE, true));
+    // Its Submit, from a dialog a command opened, splits group A.
+    if (dialog) {
+      const submitted = await made.submit(dialog, undefined, { ...STAFF, modalFromCommand: true });
+      expect(answerOf(submitted)).toBe(`Split off: <#${made.fresh()?.forumPostId}>`);
+    }
+    expect(Object.keys(asTrain(made.fresh()).attendees)).toEqual([REPORTER, CAROL]);
+  });
+
   it('refuses a group the member may not split, and a raid or meetup', async () => {
     const made = await setup();
-    expect(sent((await made.split({ userId: CAROL, displayName: 'Carol' })).reply).content).toBe(
+    const refusedCarol = await made.split({ userId: CAROL, displayName: 'Carol' });
+    expect(sent(refusedCarol.reply).content).toBe(
       "Only a group's members, the conductor and the moderators can split a group off.",
     );
+    expect(refusedCarol.showModal).not.toHaveBeenCalled();
     expect(sent((await made.split({ options: { letter: 'Q' } })).reply).content).toBe(
       'This train has no such group.',
     );
diff --git a/src/commands/trains/split.ts b/src/commands/trains/split.ts
index bda82aa3..5f2d3b99 100644
--- a/src/commands/trains/split.ts
+++ b/src/commands/trains/split.ts
@@ -3,18 +3,15 @@ import {
   SlashCommandSubcommandBuilder,
   type ButtonInteraction,
   type ChatInputCommandInteraction,
-  type MessageComponentInteraction,
+  type ModalSubmitInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
 import { isStaff, notATrain } from '../../discord/guards.js';
-import { v2Answer } from '../../discord/late-reply.js';
-import type { V2Message } from '../../discord/party-gateway.js';
 import { STALE_COMPONENT } from '../../discord/router.js';
 import {
   attendeeOf,
-  groupOf,
   isGroupId,
   isTrain,
   type GroupId,
@@ -22,8 +19,7 @@ import {
 } from '../../domain/party/party.js';
 import { RaidPrivacy } from '../../domain/party/status.js';
 import { mayNotSplit, splittableGroups } from '../../domain/party/train.js';
-import { groupWords } from '../../render/party-controls.js';
-import { splitConfirmation, splitNote } from '../../render/train-split.js';
+import { SPLIT_GROUP_INPUT, splitChoice, splitDialog } from '../../render/train-split.js';
 import {
   ACTION_THROTTLE,
   actingMember,
@@ -36,48 +32,47 @@ import { DISCORD_NAMES } from '../raids/report.js';
 import { splitGroupAs, splitRefusal, trainRefusal } from './train-changes.js';
 
 /*
- * Splitting a group off a train (plan 8T) on Discord: the post's "Split group…" and `/group
- * split` answer privately with the confirmation (`splitConfirmation`), whose "Split it off"
- * splits (`splitGroupAs`), "Cancel" closes and menu shows another group. Their controls are the
- * party's (`party:<id>:split`, `splitgo:<group>:<mark>`, `splitno`, `splitpick`), with the party
- * controls' guards and `ACTION_THROTTLE`.
+ * Splitting a group off a train (plans 8T, 8T-H) on Discord: the post's "Split group…" and
+ * `/group split` open a dialog (`splitDialog`), whose Submit splits (`splitGroupAs`); Discord's
+ * own Cancel closes it. The button and the dialog are the party's controls (`party:<id>:split`,
+ * `party:<id>:splitform[:<group>:<mark>]`), with the party controls' guards and
+ * `ACTION_THROTTLE`: opening counts as a press, and so does a Submit.
  */
 
 const A_TRAIN = { type: 'train' } as const;
 
-/** What the confirmation says once Cancel is pressed. */
-export const NOTHING_SPLIT = 'Nothing was split off.';
-
-/** What the confirmation says when the split failed (the old train is as it was). */
+/** What a Submit answers when the split failed (the old train is as it was). */
 const SPLIT_FAILED = 'The split did not work: nothing was split off.';
 
+/** What a Submit answers for a group called otherwise, or gone, since the dialog opened. */
+const GROUPS_CHANGED = 'The groups of this train changed meanwhile: press Split group… again.';
+
 /**
- * The confirmation for this member and group, as things stand now; who leads the new train as
- * their privacy says (`/settings privacy`, as the split itself reads it; the press reads it anew,
- * so a privacy changed in between counts as it is then).
+ * The dialog for this member, of these groups, as things stand now; who leads the new train as
+ * their privacy says (`/settings privacy`, as the split itself reads it; the Submit reads it
+ * anew, so a privacy changed in between counts as it is then).
  */
-async function confirmation(
+async function dialogFor(
   ctx: AppContext,
   party: TrainParty,
   memberId: string,
   staff: boolean,
-  group: GroupId,
-  note?: string,
-): Promise<V2Message> {
+  groups: readonly [GroupId, ...GroupId[]],
+): Promise<ReturnType<typeof splitDialog>> {
   const settings = await ctx.users.get(memberId);
   const anonymous = settings.raidPrivacy === RaidPrivacy.Anonymous;
-  return splitConfirmation(
-    { party, gym: (id) => ctx.gyms.get(id), memberId, staff, anonymous, group, now: Date.now() },
-    note,
+  return splitDialog(
+    { party, gym: (id) => ctx.gyms.get(id), memberId, staff, anonymous, now: Date.now() },
+    groups,
   );
 }
 
 /**
  * Why the member may split no group of the train, in words: a train of one group, one without
- * a post yet, or the new train of a split not settled yet; for staff and the conductor, who may split any other group, what the group that
- * has members says (everybody in it: `whole-train`), or that nobody is in any (`empty-group`);
- * for anybody else what their own group says (the conductor in it, everybody in it), and for
- * anybody in no group `not-in-group`.
+ * a post yet, or the new train of a split not settled yet; for staff and the conductor, who may
+ * split any other group, what the group that has members says (everybody in it: `whole-train`),
+ * or that nobody is in any (`empty-group`); for anybody else what their own group says (the
+ * conductor in it, everybody in it), and for anybody in no group `not-in-group`.
  */
 function whyNot(ctx: AppContext, party: TrainParty, memberId: string, staff: boolean): string {
   if (party.groups.length < 2) return trainRefusal(ctx, 'one-group');
@@ -97,26 +92,10 @@ function whyNot(ctx: AppContext, party: TrainParty, memberId: string, staff: boo
 }
 
 /**
- * The group the confirmation asks about: `wanted` when the member may split it, else their own
- * group, else the first they may split; undefined when they may split none.
- */
-function shownGroup(
-  party: TrainParty,
-  memberId: string,
-  staff: boolean,
-  wanted?: GroupId,
-): GroupId | undefined {
-  const groups = splittableGroups(party, memberId, staff);
-  const own = attendeeOf(party, memberId)?.group;
-  if (wanted !== undefined && groups.includes(wanted)) return wanted;
-  if (own !== undefined && groups.includes(own)) return own;
-  return groups[0];
-}
-
-/**
- * "Split group…" of a train's post: the confirmation privately, for the member's own group when
- * they may split it; why not, when they may split none. Every press gets a confirmation of its
- * own (not a gathered click).
+ * "Split group…" of a train's post: the dialog of the one group the member may split, or the
+ * one that asks which when they may split several (the conductor, staff: `splittableGroups`, in
+ * the post's order); why not, privately, when they may split none. The dialog is the first
+ * answer: nothing is deferred before it.
  */
 export async function openSplit(
   interaction: ButtonInteraction,
@@ -127,113 +106,75 @@ export async function openSplit(
   if (!party) throw new UserError(partyOver(A_TRAIN));
   if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
   const staff = isStaff(interaction, ctx);
-  const group = shownGroup(party, interaction.user.id, staff);
-  if (group === undefined) throw new UserError(whyNot(ctx, party, interaction.user.id, staff));
-  await interaction.reply({
-    components: (await confirmation(ctx, party, interaction.user.id, staff, group)).components,
-    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
-  });
+  const [first, ...rest] = splittableGroups(party, interaction.user.id, staff);
+  if (first === undefined) throw new UserError(whyNot(ctx, party, interaction.user.id, staff));
+  await interaction.showModal(
+    await dialogFor(ctx, party, interaction.user.id, staff, [first, ...rest]),
+  );
+}
+
+/**
+ * The group a Submit asks for: the one its dialog names (`<group>:<mark>` of the custom id), or
+ * the choice picked (`<group>:<mark>`, `splitChoice`); a dialog of neither is no longer active.
+ */
+function submittedGroup(
+  interaction: ModalSubmitInteraction,
+  args: readonly string[],
+): { group: GroupId; mark: string } {
+  const [group, mark] = args;
+  if (group !== undefined) {
+    if (!isGroupId(group) || mark === undefined) throw new UserError(STALE_COMPONENT);
+    return { group, mark };
+  }
+  const picked = splitChoice(interaction.fields.getRadioGroup(SPLIT_GROUP_INPUT, true));
+  if (!picked) throw new UserError(STALE_COMPONENT);
+  return picked;
 }
 
 /**
- * "Split it off" of the confirmation (`party:<id>:splitgo:<group>:<mark>`): first the
- * confirmation gives way to a note without controls (`Splitting group B (Fast) off…`), so that
- * nothing more can be pressed on it while the new post is made; then the group is split off
- * (`splitGroupAs`, with the mark the confirmation was drawn with) and the outcome takes the
- * note's place: `Split off: <post>` (also for a second press of the same confirmation, which
- * waits for the first and finds that very group split off); on a refusal the confirmation drawn
- * anew with the reason above when the member may still split a group, else the reason alone; a
- * train that is over closes it. A refusal that is none of the member's doing (the new post could
- * not be made) gives the press back (`UserError` `givesBack`, `said`). When the split throws, the note says `The split did not work:
- * nothing was split off.` and the error goes on to the router, which says what went wrong.
+ * Submit of the dialog (`party:<id>:splitform[:<group>:<mark>]`): acknowledged privately (the
+ * new post can take more than three seconds), then the group is split off (`splitGroupAs`, with
+ * the mark the dialog was drawn with) and the answer says `Split off: <post>` (also for a
+ * second Submit, or when somebody else split that very group off first); for a group called
+ * otherwise or gone by now `GROUPS_CHANGED`; any other refusal its reason; a train that is over
+ * `partyOver`. A refusal that is none of the member's doing (the new post could not be made)
+ * gives the use back (`UserError` `givesBack`, `said`). When the split throws, the answer is
+ * `SPLIT_FAILED` and the error goes on to the router, which says what went wrong.
  */
-export async function pressSplit(
-  interaction: MessageComponentInteraction,
+export async function submitSplit(
+  interaction: ModalSubmitInteraction,
   ctx: AppContext,
   partyId: string,
-  group: string | undefined,
-  mark: string | undefined,
+  args: readonly string[],
 ): Promise<void> {
-  if (group === undefined || !isGroupId(group) || mark === undefined) {
-    throw new UserError(STALE_COMPONENT);
-  }
+  const { group, mark } = submittedGroup(interaction, args);
   const party = ctx.parties.get(partyId);
-  if (!party) {
-    await interaction.update(v2Answer(splitNote(partyOver(A_TRAIN))));
-    return;
-  }
+  if (!party) throw new UserError(partyOver(A_TRAIN));
   if (!isTrain(party)) throw new UserError(STALE_COMPONENT);
   const member = actingMember(interaction);
   const staff = isStaff(interaction, ctx);
-  const words = groupWords(groupOf(party, group) ?? { id: group });
-  await interaction.update(v2Answer(splitNote(`Splitting ${words} off…`)));
+  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
   let answer;
   try {
     answer = await splitGroupAs(ctx, { party, member, group, staff, drawn: mark }, DISCORD_NAMES);
   } catch (err) {
-    // The note must not promise a split for good: the router says what went wrong below it. A
-    // note that cannot be changed is logged, so that the router gets the split's own failure.
-    await interaction.editReply(v2Answer(splitNote(SPLIT_FAILED))).catch((noteErr: unknown) => {
+    // The answer must not leave the member waiting: the router says what went wrong below it.
+    // An answer that cannot be given is logged, so that the router gets the split's own failure.
+    await interaction.editReply({ content: SPLIT_FAILED }).catch((noteErr: unknown) => {
       ctx.log.warn({ err: noteErr }, 'could not say that the split did not work');
     });
     throw err;
   }
-  const now = ctx.parties.get(partyId);
-  const again =
-    answer.kind === 'refused' && now && isTrain(now)
-      ? shownGroup(now, member.id, staff, group)
-      : undefined;
-  const shown =
-    again !== undefined && now && isTrain(now)
-      ? await confirmation(ctx, now, member.id, staff, again, answer.text)
-      : splitNote(answer.text);
-  await interaction.editReply(v2Answer(shown));
-  // Said in the confirmation's place; none of the member's doing, so the press goes back.
+  const text =
+    answer.kind === 'refused' && answer.reason === 'group-changed' ? GROUPS_CHANGED : answer.text;
+  await interaction.editReply({ content: text });
+  // Said in the answer; none of the member's doing, so the use goes back.
   if (answer.kind === 'refused' && answer.givesBack === true) {
-    throw new UserError(answer.text, { givesBack: true, said: true });
-  }
-}
-
-/** "Cancel" of the confirmation: it closes, and nothing is split off. */
-export async function cancelSplit(interaction: MessageComponentInteraction): Promise<void> {
-  await interaction.update(v2Answer(splitNote(NOTHING_SPLIT)));
-}
-
-/**
- * The menu of the groups of the confirmation (`party:<id>:splitpick`): the confirmation drawn for
- * the group picked, or why the member may split none any more.
- */
-export async function pickSplit(
-  interaction: MessageComponentInteraction & { values: readonly string[] },
-  ctx: AppContext,
-  partyId: string,
-): Promise<void> {
-  const [picked] = interaction.values;
-  if (picked === undefined || !isGroupId(picked)) throw new UserError(STALE_COMPONENT);
-  const party = ctx.parties.get(partyId);
-  if (!party || !isTrain(party)) {
-    await interaction.update(v2Answer(splitNote(partyOver(A_TRAIN))));
-    return;
+    throw new UserError(text, { givesBack: true, said: true });
   }
-  const staff = isStaff(interaction, ctx);
-  const group = shownGroup(party, interaction.user.id, staff, picked);
-  await interaction.update(
-    v2Answer(
-      group === undefined
-        ? splitNote(whyNot(ctx, party, interaction.user.id, staff))
-        : await confirmation(
-            ctx,
-            party,
-            interaction.user.id,
-            staff,
-            group,
-            group === picked ? undefined : trainRefusal(ctx, 'group-changed'),
-          ),
-    ),
-  );
 }
 
-/** `/group split letter:B`: the confirmation privately, for that group, or why not. */
+/** `/group split letter:B`: the dialog of that group, also for those who may split several. */
 async function splitByCommand(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
@@ -244,10 +185,7 @@ async function splitByCommand(
   const staff = isStaff(interaction, ctx);
   const problem = mayNotSplit(party, interaction.user.id, staff, group);
   if (problem) throw new UserError(splitRefusal(ctx, party, problem, group));
-  await interaction.reply({
-    components: (await confirmation(ctx, party, interaction.user.id, staff, group)).components,
-    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
-  });
+  await interaction.showModal(await dialogFor(ctx, party, interaction.user.id, staff, [group]));
 }
 
 /** The part `split` of `/group`. */
@@ -267,7 +205,7 @@ export const splitGroupPart: SubcommandPart = {
       'Makes a group of this train a train of its own, for those who want to go at their own ' +
       'pace: the same route, at the same stop, with the same end mode, boss and start, and the ' +
       "group's members moved there. Both posts link the other, and the members who moved are " +
-      'pinged in the new one. You are asked first, privately. A member of the group may split ' +
+      'pinged in the new one. You are asked first, in a dialog. A member of the group may split ' +
       'it off, unless the conductor is in it; the conductor and the moderators may split any ' +
       'group. The same as the button "Split group…" on the post. Only in the post of a train.',
     examples: ['/group split letter:B'],
diff --git a/src/commands/trains/train-changes.ts b/src/commands/trains/train-changes.ts
index 9ffd6df2..eedd21b4 100644
--- a/src/commands/trains/train-changes.ts
+++ b/src/commands/trains/train-changes.ts
@@ -443,13 +443,13 @@ export interface SplitAsk {
   member: Member;
   group: GroupId;
   staff: boolean;
-  /** The group's mark as the confirmation showed it (`groupMark`); a stale one is refused. */
+  /** The group's mark as the dialog showed it (`groupMark`); a stale one is refused. */
   drawn?: string;
 }
 
 /**
  * What came of a split, in the command's words: `split` with the new train; `already` when the
- * group the confirmation showed is the one split off last, by an earlier press or somebody else
+ * group the dialog showed is the one split off last, by an earlier Submit or somebody else
  * (`splitDrawn`): it says where it went. `givesBack` on a refusal that is none of the member's
  * doing (the new post could not be made; plan 8S-3).
  */
@@ -463,9 +463,9 @@ export type SplitAnswer =
  * Splits a group off the train into a train of its own as the member (`TrainService.split`),
  * named as their privacy says (`/settings privacy`, as for `/train`), and says what came of it:
  * `Split off: <post>` (`names.post`; the map names no post), the reason of a refusal (`splitRefusal`),
- * or that the train is over. A press drawn for the very group that was split off last (a second
- * press of one confirmation, or somebody else's split of it) says where it went, as if it had
- * split it. The one code path of the confirmation's "Split it off" and, later, the map's.
+ * or that the train is over. A Submit drawn for the very group that was split off last (a second
+ * Submit of one dialog, or somebody else's split of it) says where it went, as if it had
+ * split it. The one code path of the dialog's Submit and, later, the map's.
  */
 export async function splitGroupAs(
   ctx: TrainSplitting,
diff --git a/src/components/party.ts b/src/components/party.ts
index 08f8a957..ef51153e 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -19,7 +19,7 @@ import {
 } from '../commands/trains/move.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import { showWholeRoute } from '../commands/trains/route.js';
-import { cancelSplit, openSplit, pickSplit, pressSplit } from '../commands/trains/split.js';
+import { openSplit, submitSplit } from '../commands/trains/split.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { UserError } from '../discord/errors.js';
 import { notARaid, requireGuild } from '../discord/guards.js';
@@ -27,13 +27,15 @@ import { STALE_COMPONENT } from '../discord/router.js';
 import { isGroupId, isRaid } from '../domain/party/party.js';
 import { raidStage } from '../domain/party/raid.js';
 import { isPartyAction, PARTY_KIND, TIME_INPUT, timeForm } from '../render/party-controls.js';
+import { SPLIT_FORM } from '../render/train-split.js';
 
 /**
  * The controls of a party's post (spec 4.1): its buttons, the two answers under a completion
  * question, the "Set time" button of a raid without times with the form it opens, and the
  * button "Move train…" of a train with the panel it opens and its controls, the menu of what the
  * train does at the end of its route among them (`commands/trains/move.ts`), and "Whole route"
- * of a train, which shows the route privately as `/route show` does (`commands/trains/route.ts`).
+ * of a train, which shows the route privately as `/route show` does (`commands/trains/route.ts`),
+ * and "Split group…" of a train with the dialog it opens (`commands/trains/split.ts`).
  * The party is named by the custom id, not by the channel, so the same controls work on a copy of the
  * message in another channel. Every click is answered privately, a burst of clicks by one
  * member with one answer (`answerClick`); what it changed is said in the post by the attendance
@@ -134,15 +136,10 @@ export const partyButtons: ComponentHandler = {
         // "Whole route" of a train's post: the route privately, as `/route show` answers it.
         return showWholeRoute(interaction, ctx, partyId);
       case 'split':
-        // "Split group…" of a train's post: the confirmation privately (plan 8T).
+        // "Split group…" of a train's post: the dialog of the split (plans 8T, 8T-H).
         return openSplit(interaction, ctx, partyId);
-      case 'splitgo':
-        // "Split it off" of that confirmation.
-        return pressSplit(interaction, ctx, partyId, id.args[0], id.args[1]);
-      case 'splitno':
-        return cancelSplit(interaction);
-      case 'splitpick':
-        // The menu of that confirmation: never a button.
+      case 'splitform':
+        // Only that dialog has this action.
         throw new UserError(STALE_COMPONENT);
       case 'answer': {
         const [answer] = id.args;
@@ -157,15 +154,8 @@ export const partyButtons: ComponentHandler = {
     }
   },
 
-  /**
-   * The menu "At the end of the route" of the Move train panel, and the menu of the groups of
-   * the confirmation of a split.
-   */
+  /** The menu "At the end of the route" of the Move train panel. */
   async select(interaction, id, ctx) {
-    if (id.action === 'splitpick') {
-      await pickSplit(interaction, ctx, id.id);
-      return;
-    }
     if (id.action !== 'atend') throw new UserError(STALE_COMPONENT);
     await pressAtEnd(interaction, ctx, id.id, id.args[0]);
   },
@@ -173,9 +163,11 @@ export const partyButtons: ComponentHandler = {
   /**
    * The "Set time" form: what was typed is the hatch or the end time, as the form asked. The
    * form of a member's `/delete` opened before it was for staff only (plan 8S-2) is a report.
+   * The dialog of a split (plan 8T-H) splits the group off.
    */
   async modal(interaction, id, ctx) {
     if (id.action === 'delete') return submitPartyReport(interaction, ctx, id.id);
+    if (id.action === SPLIT_FORM) return submitSplit(interaction, ctx, id.id, id.args);
     const [parameter] = id.args;
     if (id.action !== 'time' || (parameter !== 'hatch' && parameter !== 'end')) {
       throw new UserError(STALE_COMPONENT);
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index a344d2be..970d219d 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -72,11 +72,10 @@
  * `<first>` the gym the route began with, so that a panel reverses it once), and the
  * select menu of what the train does at the end of its route `party:<id>:atend:<place>`, whose
  * value is `finish`, `loop` or `turn-back`. A press decides anew against that place.
- * "Split group…" (`party:<id>:split`, plan 8T) opens a private confirmation whose controls are
- * `party:<id>:splitgo:<group>:<mark>` (the group's letter and `groupMark`, so that a press for a
- * group called otherwise, gone, or given its letter again after a split is refused),
- * `party:<id>:splitno` and the menu
- * `party:<id>:splitpick`, whose value is a group's letter.
+ * "Split group…" (`party:<id>:split`, plan 8T) opens a dialog (plan 8T-H): of one group
+ * `party:<id>:splitform:<group>:<mark>` (the group's letter and `groupMark`, so that a Submit
+ * for a group called otherwise, gone, or given its letter again after a split is refused), of
+ * several `party:<id>:splitform`, whose radio group's value is `<group>:<mark>`.
  *
  * The buttons of a member's own list have the kinds `wantlist` (`/wants`) and `targetlist`
  * (`/targets`; the kinds `wants` and `targets` are the questions of `/unwant-all` and
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index 6d069a06..8af72061 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -517,7 +517,7 @@ export function joinInto<P extends Party>(
 /**
  * The letter of the next group: one that no group has and that no group split off a train went
  * by (plan 8T, `train.splitOff`), the first after the last letter in use, else the first such;
- * when every free letter was a split's, the first free one (a confirmation drawn for the group
+ * when every free letter was a split's, the first free one (a dialog drawn for the group
  * that went is still refused: `groupMark` covers the splits). Undefined when the party has every
  * group it may.
  */
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 118302ac..eab0ac10 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -543,8 +543,8 @@ export type PartyProblem =
   /** The conductor is in that group: only they and staff may split it off. */
   | 'conductor-in-group'
   /**
-   * The group is no longer the one a confirmation was drawn for (it was split off, or it is
-   * called otherwise now): the press would split off something it did not show.
+   * The group is no longer the one a split's dialog was drawn for (it was split off, or it is
+   * called otherwise now): the Submit would split off something it did not show.
    */
   | 'group-changed'
   /**
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index d5660cf9..756ecde7 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -1002,7 +1002,7 @@ function markOf(label: string | undefined, newest: string | undefined): string {
 
 /**
  * A short mark of a group as it is now: its label (or none) and which group was split off the
- * train last (the newest `splitOff`'s party). A confirmation carries it, so that a press for a
+ * train last (the newest `splitOff`'s party). The split's dialog carries it, so that a Submit for a
  * group whose label changed since, or that went and whose letter another group has now (even
  * with the same label), is refused (`group-changed`) instead of splitting what it did not show.
  * Undefined for a group the train does not have.
@@ -1016,7 +1016,7 @@ export function groupMark(party: TrainParty, groupId: string): string | undefine
 /**
  * The split a stale mark was drawn for, when that very group is the one split off last: the
  * newest `splitOff` is of this letter, and the mark is what that group had just before (its
- * label then, the split before it). An answer to a second press of one confirmation can then
+ * label then, the split before it). An answer to a second Submit of one dialog can then
  * say where the group went. Undefined otherwise.
  */
 export function splitDrawn(
@@ -1164,7 +1164,7 @@ export interface SplitMoment {
  * group as it was, and `was` where the train is and its times then, for the new one to go on
  * from.
  *
- * Refused as `mayNotSplit` says; and with `drawn`, the mark of the group as a confirmation showed
+ * Refused as `mayNotSplit` says; and with `drawn`, the mark of the group as the dialog showed
  * it (`groupMark`), when the group is called otherwise now or is gone (`group-changed`).
  */
 export function splitOffGroup(
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index 80aedab3..65df03bf 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -27,8 +27,8 @@ export const PARTY_KIND = 'party';
  * `skip` and `finish` (`train-panel.ts`). `route` is "Whole route" of a train's post, which
  * shows the route privately. `shot` is "Screenshot feedback" of a raid reported from a
  * screenshot, which shows that screenshot privately. `split` is "Split group…" of a train with
- * two groups or more, which opens the private confirmation (`train-split.ts`) whose controls are
- * `splitgo` (`<group>:<mark>`), `splitno` and the menu `splitpick`.
+ * two groups or more, which opens the dialog `splitform` (`train-split.ts`; `<group>:<mark>` when
+ * it asks about one group); no button has `splitform`.
  */
 export const PARTY_ACTIONS = [
   'maybe',
@@ -53,9 +53,7 @@ export const PARTY_ACTIONS = [
   'route',
   'shot',
   'split',
-  'splitgo',
-  'splitno',
-  'splitpick',
+  'splitform',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
@@ -221,8 +219,8 @@ export function wholeRouteButton(party: Pick<Party, 'id'>): PostButton {
 export const WHOLE_ROUTE_LABEL = 'Whole route';
 
 /**
- * The button "Split group…" of a train's post with two groups or more (plan 8T): the private
- * confirmation of splitting a group off into a train of its own. A copy for another region
+ * The button "Split group…" of a train's post with two groups or more (plan 8T): the dialog
+ * of splitting a group off into a train of its own (plan 8T-H). A copy for another region
  * leaves it out, as it leaves out Move train… (`moves`).
  */
 export function splitGroupButton(party: Pick<Party, 'id'>): PostButton {
diff --git a/src/render/train-split.test.ts b/src/render/train-split.test.ts
index c021e2e7..4a6b9335 100644
--- a/src/render/train-split.test.ts
+++ b/src/render/train-split.test.ts
@@ -2,20 +2,10 @@ import {
   ComponentType,
   type APIModalInteractionResponseCallbackData,
   type APIRadioGroupComponent,
-  type APIStringSelectComponent,
 } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import { checkModal } from '../../test/support/fake-interactions.js';
 import { testGyms } from '../../test/support/gyms.js';
-import {
-  accentOf,
-  allComponents,
-  buttonsOf,
-  selectsOf,
-  textDisplays,
-} from '../../test/support/messages.js';
-import { expectV2Sendable } from '../../test/support/post-limits.js';
-import { TRAIN_PANEL_COLOUR } from './train-panel.js';
 import {
   ALICE,
   BOB,
@@ -40,10 +30,7 @@ import {
   SPLIT_FORM,
   SPLIT_GROUP_INPUT,
   splitChoice,
-  splitConfirmation,
   splitDialog,
-  splitNote,
-  type SplitConfirmationView,
   type SplitView,
 } from './train-split.js';
 
@@ -391,184 +378,3 @@ describe('splitChoice', () => {
     expect(splitChoice('Q:1x2y3z')).toBeUndefined();
   });
 });
-
-/** The confirmation of plan 8T asks about group B unless `extra` says otherwise. */
-const confirmView = (
-  party: TrainParty,
-  extra: Partial<SplitConfirmationView> = {},
-): SplitConfirmationView => ({ ...view(party), group: 'B', ...extra });
-
-const confirmationText = (
-  party: TrainParty,
-  extra: Partial<SplitConfirmationView> = {},
-  note?: string,
-): string => textDisplays(splitConfirmation(confirmView(party, extra), note)).join('\n');
-
-describe('splitConfirmation', () => {
-  it('asks in one grey container: what becomes of the group, who moves, who leads', () => {
-    const message = splitConfirmation(confirmView(train({ conductorId: CAROL })));
-    expect(accentOf(message)).toBe(TRAIN_PANEL_COLOUR);
-    expect(textDisplays(message)).toEqual([
-      [
-        '### Split a group off the train',
-        'Group **B (Fast)** leaves **Saturday legendaries** and becomes a train of its own, ' +
-          '**Saturday legendaries (Fast)**:',
-        '- the same route, at the same stop (stop 2 of 3: The Stacks), the same end mode, ' +
-          'boss and start',
-        '- Dawn and Iris move to it as they are signed up now',
-        '- you are its conductor; Carol stays the conductor of Saturday legendaries',
-      ].join('\n'),
-    ]);
-    // Only one group to split: no menu.
-    expect(selectsOf(message)).toEqual([]);
-    const buttons = buttonsOf(message);
-    expect(buttons.map((button) => [button.label, button.emoji, button.style])).toEqual([
-      ['Split it off', '✂️', 4],
-      ['Cancel', undefined, 2],
-    ]);
-    const party = train({ conductorId: CAROL });
-    expect(buttons.map((button) => decodeCustomId(button.customId ?? ''))).toEqual([
-      {
-        kind: 'party',
-        id: party.id,
-        action: 'splitgo',
-        args: ['B', groupMark(party, 'B')],
-      },
-      { kind: 'party', id: party.id, action: 'splitno', args: [] },
-    ]);
-  });
-
-  it('says where the train is as it is: no route, finished, not started yet', () => {
-    expect(confirmationText(train({ route: [], stop: 0 }))).toContain(
-      '- no route yet, the same end mode, boss and start',
-    );
-    expect(confirmationText(train({ stop: 3 }))).toContain(
-      '- the same route, finished, the same end mode, boss and start',
-    );
-    const waiting = {
-      ...train(),
-      timed: { name: 'Saturday legendaries', startTime: PARTY_NOW + HOUR },
-    };
-    expect(confirmationText(waiting)).toContain(
-      '- the same route, at the same stop (stop 2 of 3: The Stacks), not started yet, ' +
-        'the same end mode, boss and start',
-    );
-  });
-
-  it('names who leads each train afterwards', () => {
-    // The conductor goes with the group.
-    expect(confirmationText(train({ conductorId: ALICE }))).toContain(
-      '- you are its conductor, and Saturday legendaries has none then',
-    );
-    expect(confirmationText(train({ conductorId: BOB }), { memberId: BOB })).toContain(
-      '- you are its conductor, and Saturday legendaries has none then',
-    );
-    // No conductor anywhere: the presser in the group leads the new one.
-    expect(confirmationText(train())).toContain('- you are its conductor');
-    // Unless they asked not to be named: then nobody does, as for a train made anonymously.
-    expect(confirmationText(train(), { anonymous: true })).toMatch(/^- it has no conductor$/mu);
-    expect(confirmationText(train({ conductorId: CAROL }), { anonymous: true })).toContain(
-      '- it has no conductor; Carol stays the conductor of Saturday legendaries',
-    );
-    // The conductor who goes with the group leads it still.
-    expect(confirmationText(train({ conductorId: ALICE }), { anonymous: true })).toContain(
-      '- you are its conductor, and Saturday legendaries has none then',
-    );
-    // The conductor of the old train splits a group they are not in.
-    expect(confirmationText(train({ conductorId: CAROL }), { memberId: CAROL })).toContain(
-      '- it has no conductor; you stay the conductor of Saturday legendaries',
-    );
-    // Staff, with the conductor in the group.
-    expect(
-      confirmationText(train({ conductorId: BOB }), { memberId: DAVE, staff: true }),
-    ).toContain('- Iris is its conductor, and Saturday legendaries has none then');
-  });
-
-  it('says it of a group without a label by its letter', () => {
-    const text = confirmationText(train({}, [{ id: 'A' }, { id: 'B' }]));
-    expect(text).toContain(
-      'Group **B** leaves **Saturday legendaries** and becomes a train of its own, ' +
-        '**Saturday legendaries (B)**:',
-    );
-  });
-
-  it('offers a menu of the groups when the member may split more than one, the chosen one first chosen', () => {
-    const party = train({ conductorId: CAROL }, [
-      { id: 'A' },
-      { id: 'B', label: 'Fast' },
-      { id: 'C' },
-    ]);
-    const withC = withAttendees(party, { [DAVE]: { group: 'C' } });
-    const message = splitConfirmation(confirmView(withC, { memberId: CAROL }));
-    const menu = allComponents(message).find(
-      (component): component is APIStringSelectComponent =>
-        (component as { type?: unknown }).type === ComponentType.StringSelect,
-    );
-    expect(decodeCustomId(menu?.custom_id ?? '')).toEqual({
-      kind: 'party',
-      id: party.id,
-      action: 'splitpick',
-      args: [],
-    });
-    expect(menu?.options.map((option) => [option.label, option.value, option.default])).toEqual([
-      ['Group A · 2 trainers', 'A', false],
-      ['Group B (Fast) · 2 trainers', 'B', true],
-      ['Group C · 1 trainer', 'C', false],
-    ]);
-  });
-
-  it('puts why a press did nothing above the question', () => {
-    expect(confirmationText(train(), {}, 'The groups of this train changed meanwhile.')).toMatch(
-      /^### Split a group off the train\nThe groups of this train changed meanwhile\.\nGroup /u,
-    );
-  });
-
-  it('cuts a long list of who moves', () => {
-    const crowd: Record<string, Partial<Attendee>> = {};
-    for (let n = 0; n < 30; n++) {
-      crowd[`4${String(n).padStart(17, '0')}`] = { group: 'B', name: `Trainer ${n}` };
-    }
-    const text = confirmationText(withAttendees(train(), crowd));
-    expect(text).toMatch(/- Dawn, Iris, Trainer 0, .+, and \d+ more move to it/u);
-  });
-
-  it('keeps within what Discord takes with the longest texts that need escaping', () => {
-    const crowd: Record<string, Partial<Attendee>> = {};
-    for (let n = 0; n < 400; n++) {
-      crowd[`4${String(n).padStart(17, '0')}`] = {
-        group: (['A', 'B', 'C', 'D', 'E'] as const)[n % 5] ?? 'A',
-        name: '*'.repeat(32),
-        status: PartyStatus.Coming,
-      };
-    }
-    const heavy = (id: number): PostGym => ({
-      name: `${'[*]'.repeat(84)}${id}`,
-      nickname: null,
-      lat: 40,
-      lon: -80,
-      notice: null,
-      taggedEx: false,
-      confirmedEx: false,
-    });
-    const party: TrainParty = {
-      ...withAttendees(train({ conductorId: REPORTER }), crowd),
-      timed: { name: '*'.repeat(80), startTime: PARTY_NOW + HOUR },
-      groups: (['A', 'B', 'C', 'D', 'E'] as const).map((id) => ({ id, label: '*'.repeat(100) })),
-    };
-    const message = splitConfirmation(
-      { ...confirmView(party, { memberId: REPORTER }), gym: heavy },
-      'x',
-    );
-    expectV2Sendable(message);
-    expect(selectsOf(message)).toHaveLength(1);
-  });
-});
-
-describe('splitNote', () => {
-  it('says only something, without controls', () => {
-    const note = splitNote('Nothing was split off.');
-    expect(textDisplays(note)).toEqual(['Nothing was split off.']);
-    expect(buttonsOf(note)).toEqual([]);
-    expect(accentOf(note)).toBe(TRAIN_PANEL_COLOUR);
-  });
-});
diff --git a/src/render/train-split.ts b/src/render/train-split.ts
index 1d9a6600..b0126905 100644
--- a/src/render/train-split.ts
+++ b/src/render/train-split.ts
@@ -1,15 +1,11 @@
 import {
-  ButtonStyle,
   ComponentType,
   type APIModalInteractionResponseCallbackData,
   type APIRadioGroupOption,
-  type APIStringSelectComponent,
 } from 'discord.js';
 import { encodeCustomId } from '../discord/custom-id.js';
-import type { V2Message } from '../discord/party-gateway.js';
 import {
   groupOf,
-  headCount,
   isGroupId,
   memberOf,
   type GroupId,
@@ -17,20 +13,13 @@ import {
   type TrainParty,
 } from '../domain/party/party.js';
 import { nameOf } from '../domain/party/timed.js';
-import {
-  currentStop,
-  groupMark,
-  routeFinished,
-  splitTrain,
-  splittableGroups,
-} from '../domain/party/train.js';
-import { PARTY_KIND, partyButton } from './party-controls.js';
+import { currentStop, groupMark, routeFinished, splitTrain } from '../domain/party/train.js';
+import { PARTY_KIND } from './party-controls.js';
 import { groupInPostOrder, guestsOf } from './party-post.js';
 import { gymName } from './raid-post.js';
 import { count, memberName, plain, truncate } from './text.js';
 import type { TrainPlaces } from './train-post.js';
-import { TRAIN_PANEL_COLOUR } from './train-panel.js';
-import { actionRow, container, menuRow, textDisplay } from './v2.js';
+import { textDisplay } from './v2.js';
 
 /** What the dialog of a split is drawn from: the train and who asks (plan 8T-H). */
 export interface SplitView extends TrainPlaces {
@@ -283,77 +272,3 @@ export function splitDialog(
     ],
   };
 }
-
-/** What the private confirmation of plan 8T asks about: the group too. */
-export interface SplitConfirmationView extends SplitView {
-  /** The group it asks about; the train has it, and the member may split it off. */
-  group: GroupId;
-}
-
-/** The menu of the groups the member may split, the one asked about chosen. */
-function groupMenu(
-  view: SplitConfirmationView,
-  groups: readonly GroupId[],
-): APIStringSelectComponent {
-  const { party } = view;
-  return {
-    type: ComponentType.StringSelect,
-    custom_id: encodeCustomId({ kind: PARTY_KIND, id: party.id, action: 'splitpick' }),
-    options: groups.map((id) => {
-      const group = groupOf(party, id);
-      const label = group?.label ? ` (${truncate(group.label, 60)})` : '';
-      return {
-        label: `Group ${id}${label} · ${count(headCount(party, id), 'trainer')}`,
-        value: id,
-        default: id === view.group,
-      };
-    }),
-  };
-}
-
-/**
- * The private confirmation of splitting a group off a train (plan 8T; mockup section 2), for the
- * member who asked alone: one components-v2 container (`TRAIN_PANEL_COLOUR`, as the Move train
- * panel) with `### Split a group off the train`, what becomes of the group (the new train's
- * name, as `splitTrain` makes it), the same route at the same stop, who moves (by name, the first
- * `NAMES_SHOWN`), who leads which train; a menu of the groups when the member may split more than
- * one (`splittableGroups`), then "Split it off" (danger) and "Cancel". `note` is said above the
- * question: why a press did nothing.
- *
- * The controls name the train by its id like every control of a post: `party:<id>:splitgo:
- * <group>:<mark>` (the group's mark, `groupMark`, so that a press for a group that is called
- * otherwise or gone by now is refused), `party:<id>:splitno`, the menu `party:<id>:splitpick`,
- * whose value is a group's letter. Who is in the group is not carried: who is in it at the
- * moment of the split goes (design, "The confirmation").
- */
-export function splitConfirmation(view: SplitConfirmationView, note?: string): V2Message {
-  const { party, group: groupId } = view;
-  const [question, ...lines] = oneGroupText(view, groupId).split('\n').slice(0, -2);
-  const text = [
-    '### Split a group off the train',
-    ...(note === undefined ? [] : [note]),
-    question ?? '',
-    ...lines,
-  ];
-  const groups = splittableGroups(party, view.memberId, view.staff);
-  const mark = groupMark(party, groupId) ?? '0';
-  const buttons = actionRow([
-    partyButton(party.id, 'splitgo', 'Split it off', ButtonStyle.Danger, [groupId, mark], '✂️'),
-    partyButton(party.id, 'splitno', 'Cancel', ButtonStyle.Secondary),
-  ]);
-  return {
-    v2: true,
-    components: [
-      container(TRAIN_PANEL_COLOUR, [
-        textDisplay(text.join('\n')),
-        ...(groups.length > 1 ? [menuRow(groupMenu(view, groups))] : []),
-        buttons,
-      ]),
-    ],
-  };
-}
-
-/** The confirmation's place taken by a sentence, without controls: done, cancelled, or why not. */
-export function splitNote(text: string): V2Message {
-  return { v2: true, components: [container(TRAIN_PANEL_COLOUR, [textDisplay(text)])] };
-}
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 22f42c40..9ad6eb02 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -304,7 +304,7 @@ export interface SplitRequest {
   group: GroupId;
   /** Their privacy is Anonymous: the new post names no maker, as for `/train`. */
   anonymous: boolean;
-  /** The group's mark as a confirmation showed it (`groupMark`); a command draws none. */
+  /** The group's mark as the split's dialog showed it (`groupMark`); a command draws none. */
   drawn?: string;
 }
 
diff --git a/src/services/train-service.ts b/src/services/train-service.ts
index 681d11c3..58f95c5d 100644
--- a/src/services/train-service.ts
+++ b/src/services/train-service.ts
@@ -506,7 +506,7 @@ export class TrainService {
   /**
    * Splits a group off the train into a train of its own (plan 8T; `PartyService.splitTrain`):
    * for the conductor and staff any group, for a member of the group their own unless the
-   * conductor is in it (`mayNotSplit`). `drawn` is the group's mark as a confirmation showed it
+   * conductor is in it (`mayNotSplit`). `drawn` is the group's mark as the dialog showed it
    * (`groupMark`): refused (`group-changed`) when the group is called otherwise or gone by now;
    * `anonymous` the member's privacy, for the new train's maker.
    *
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8th HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-18-phase-8th-split-dialog.md'` prints nothing; `npm run check`, `npm run build`, `npm run test:db`, one after the other through the npm scripts.
2. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
3. `CLAUDE.md` status line, the follow-ups ("From Phase 8T-H"), the Gantt chart and memory.

## Staging checklist

`docs/superpowers/plans/2026-10-17-phase-8t-staging.md` (updated in task 2): on the dev application and the test server, each step with Matt's go-ahead, after registering the commands again (`npm run deploy-commands -- --global` with the stage settings). Step 18's double Submit needs two accounts now.
