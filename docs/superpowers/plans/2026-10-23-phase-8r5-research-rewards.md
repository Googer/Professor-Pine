# Phase 8R-5: Research Rewards Reported Apart: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the sixth plan of reports at stops (Gantt phase 17). It builds the design `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md`, before the stagings of 8R-1 to 8R-5.

Leek Duck lists a task's "Possible Rewards" together, but in the game each is a task of its own. A stop has one of them all day, the same for everyone (Matt, 2026-10-23). 8R-1 took the task and all its rewards as one report. Now:

- **Reporting by version.** `/research report` offers one choice per task and reward. A task with two or more encounters also offers "one of" them, for a member who has not finished the task yet, since an encounter shows only once the task is done.
- **What a report at a stop that already has one does:**
  - **Narrowing** (a reward over its own "one of") replaces the report without asking.
  - **Saying less**, or the same version again, answers "Already reported".
  - **Any other report contradicts the standing one** and asks first. One dialog lists each contested stop as an unticked checkbox; Cancel reports nothing. The reporter's own report is replaced without asking.
- **DMs:**
  - A reward's report tells that reward's wanters.
  - A "one of" report tells the wanters of any of its encounters.
  - A narrowing sends a short confirmation to a member who was told of the "one of". A "one of" narrowed before its DM goes out leaves that stop out.
- **The pinned post** has one block per task, with a line per version.

**Architecture:**

- **The domain:**
  - `src/domain/research/versions.ts`: the versions, their values and labels, and `rewardKey`;
  - `src/domain/research/reports.ts`: `researchSubjectOf`, `decideResearch` and `versionOf`;
  - `hexHash` in `src/domain/short-hash.ts`.
- **Services:**
  - `ResearchTaskService` keeps the versions and has `byVersion`.
  - `StopReportService.reportResearch` goes through `saveUnless` with `decideResearch` and `replacing`. Its outcome has `already` and `asks`, its news has `replaced`, and it has `contested` and `versionOf`.
  - `NotifyService` keeps one line per task. It sends confirmations, decides the kind of DM once per member, and re-reads a "one of" when its turn comes.
  - `StopPostService` groups by version, under one block per task.
- **Commands:**
  - `/research report`: the choices by version and `readTask`;
  - the contradiction dialog;
  - "Same task at more stops…" with its version in the custom id, the period check and `readOrDefer`.
- **The map's server side:**
  - `versions` in the options;
  - `oneOf` on each report;
  - the POST with `replacing`, `more`, `asks` (`reports` and `hidden`) and `already`.

**Tech stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely and Vitest.

- No new dependency.
- **No migration**, no game data change and no party state change.
- **No command change**: `/research`'s options are the same, and only the values its autocomplete gives change. So no deploy is needed for this plan alone.

**Spec:**

- the design above, with its review R1–R15 and Matt's rulings R6 and R7;
- the brief `.superpowers/sdd/8r-5-rewards/design.md`;
- the fix rounds `fix-round-1.md` to `fix-round-3.md`;
- the ledger (git-ignored).

**Every diff in this plan was run before the plan was written.** They were made on a throwaway branch `proto-8r5` (tip `13853dcc`, tag `proto-8r5-r4`), one commit per task, on `stop-reports` 663fa4d9. Each commit typechecks and passes its tests. On the tip, the full check (9,226 tests), the build and the database suite (596) pass.

**Reviews:**

- **The design:** a fresh Opus reviewer read it before any code was written. It raised fifteen points; thirteen had defaults, and Matt ruled on two (R6 and R7).
- **The prototype:** two Opus reviewers read it.
  - Tasks 1–3: L1–L10, one Important (the more-stops menu reporting into a new period).
  - Tasks 4–7: R1–R8, one Important (a typed task without a reward listed under another version's line).
- **The fixes:** reviewed twice, with F1–F6 and then P1–P4, all Minor. The last round was checked by the controller.

**Conventions:** read `CLAUDE.md` and `docs/architecture/stop-reports.md`, `notifications-and-dms.md`, `discord-framework.md`, `web.md` and `testing.md`.

**Inside the plan:** each commit needs only the typecheck and its own test files. The full check, the build and the database suite run once on the tip.

---

### Task 1: 8R-5 task 1: Research versions and decisions in the domain

Prototype commit: `bcd0fd840927f58afddf6b21c4c8b4c4ecffe78e`

A task's versions (one per reward, then "one of" its encounters where it has
two or more), their values (`<task>:<8 hex>` of FNV-1a of rewardKey, the task
alone for "one of") and labels; researchSubjectOf for listed and typed
subjects; decideResearch per stop: new, narrow, less, again, asks, correct.
rewardKey moved from leekduck.ts to versions.ts; hexHash in short-hash.ts.

**Files:**

```
 src/domain/research/leekduck.ts      |  19 +-----------
 src/domain/research/reports.test.ts  |  98 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/research/reports.ts       |  98 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/research/versions.test.ts | 123 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/research/versions.ts      | 125 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/short-hash.ts             |  21 ++++++++++---
 6 files changed, 462 insertions(+), 22 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/research/reports.test.ts src/domain/research/versions.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff bcd0fd840927f58afddf6b21c4c8b4c4ecffe78e -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-5 task 1: Research versions and decisions in the domain`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/research/leekduck.ts b/src/domain/research/leekduck.ts
index e48f217bd02eca099246566d304ed00a7194f2de..a749a79cb7f309b72c58d25e0dac48430cf969d3 100644
--- a/src/domain/research/leekduck.ts
+++ b/src/domain/research/leekduck.ts
@@ -1,8 +1,8 @@
 import type { PokemonCatalogue } from '../pogo/catalogue.js';
-import { costumedByName } from '../pogo/costumes.js';
 import { feedLookupOf } from '../pogo/feed-lookup.js';
 import { identifyBoss } from '../pogo/raid-boss-feed.js';
 import { itemKey, MAX_TASK_TEXT, taskKeyOf, type ResearchTask, type TaskReward } from './task.js';
+import { rewardKey } from './versions.js';
 
 /*
  * Leek Duck's research page (`https://leekduck.com/research/`; plan 8R-1, design 4.1, decision 5)
@@ -176,23 +176,6 @@ function readReward(html: string, reading: Reading): TaskReward | undefined {
   return undefined;
 }
 
-/**
- * What tells two rewards of a task apart: its kind and what it is; an encounter also whether it
- * is costumed (plan 8R-4: a plain and a costumed Pikachu stay two).
- */
-function rewardKey(reward: TaskReward, catalogue: PokemonCatalogue): string {
-  switch (reward.kind) {
-    case 'encounter': {
-      const costumed = costumedByName(catalogue, reward.name, reward.image ?? undefined);
-      return `e:${reward.key ?? reward.name}${costumed ? ':costumed' : ''}`;
-    }
-    case 'item':
-      return `i:${reward.item}:${String(reward.quantity)}`;
-    case 'energy':
-      return `m:${reward.name}:${String(reward.quantity)}`;
-  }
-}
-
 /**
  * The Pokémon of the Spawns section of a Leek Duck event page (plan 8R-4, design 5): each list
  * item's name and picture (`<li class="pkmn-list-item">`, `<div class="pkmn-name">`), between the
diff --git a/src/domain/research/reports.test.ts b/src/domain/research/reports.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..77a33dc76f81e66d42c380cba1e2eb77de0e9e24
--- /dev/null
+++ b/src/domain/research/reports.test.ts
@@ -0,0 +1,98 @@
+import { describe, expect, it } from 'vitest';
+import { decideResearch, researchSubjectOf, type StandingResearch } from './reports.js';
+
+const TASK = '0123456789abcdef';
+const OTHER = 'fedcba9876543210';
+const GIBLE = '0000000a';
+const BULBASAUR = '0000000b';
+const CANDY = '0000000c';
+const NOW = 1_000_000;
+
+const v = (hash: string, task = TASK): string => `${task}:${hash}`;
+
+const standing = (
+  subjectKey: string,
+  hashes: string[],
+  overrides: Partial<StandingResearch> = {},
+): StandingResearch => ({
+  id: 7,
+  subjectKey,
+  hashes,
+  endsAt: NOW + 60_000,
+  reporterId: 'misty',
+  ...overrides,
+});
+
+describe('a research subject read (plan 8R-5, R11)', () => {
+  it('reads a task, a version of it, a typed task and its version; nothing else', () => {
+    expect(researchSubjectOf(TASK)).toEqual({ task: TASK, hash: undefined });
+    expect(researchSubjectOf(v(GIBLE))).toEqual({ task: TASK, hash: GIBLE });
+    expect(researchSubjectOf(`typed:${TASK}`)).toEqual({ task: `typed:${TASK}`, hash: undefined });
+    expect(researchSubjectOf(`typed:${TASK}:${GIBLE}`)).toEqual({
+      task: `typed:${TASK}`,
+      hash: GIBLE,
+    });
+    for (const no of [
+      '',
+      'typed:',
+      `${TASK}:`,
+      `${TASK}:xyz`,
+      'grunt:water',
+      `${TASK}:${GIBLE}:1`,
+    ]) {
+      expect(researchSubjectOf(no)).toBeUndefined();
+    }
+  });
+});
+
+describe('what becomes of a research report at a stop (plan 8R-5)', () => {
+  const oneOf = { subjectKey: TASK, hashes: [GIBLE, BULBASAUR] };
+  const gible = { subjectKey: v(GIBLE), hashes: [GIBLE] };
+  const bulbasaur = { subjectKey: v(BULBASAUR), hashes: [BULBASAUR] };
+  const candy = { subjectKey: v(CANDY), hashes: [CANDY] };
+  const typedCandy = { subjectKey: `typed:${OTHER}:${CANDY}`, hashes: [CANDY] };
+  const typedBare = { subjectKey: `typed:${OTHER}`, hashes: [] };
+
+  it.each([
+    ['nothing stands', undefined, gible, 'new'],
+    ['what stood has ended', standing(TASK, [GIBLE, BULBASAUR], { endsAt: NOW }), gible, 'new'],
+    ['a reward over its "one of"', standing(TASK, [GIBLE, BULBASAUR]), gible, 'narrow'],
+    [
+      'a reward over a "one of" of before (items too)',
+      standing(TASK, [GIBLE, CANDY]),
+      candy,
+      'narrow',
+    ],
+    ['"one of" over one of its rewards', standing(v(GIBLE), [GIBLE]), oneOf, 'less'],
+    ['the same reward again', standing(v(GIBLE), [GIBLE]), gible, 'again'],
+    ['the same "one of" again', standing(TASK, [GIBLE, BULBASAUR]), oneOf, 'again'],
+    ['a reward over a bare key of that one reward (R10)', standing(TASK, [GIBLE]), gible, 'again'],
+    ['another reward of the task', standing(v(GIBLE), [GIBLE]), bulbasaur, 'asks'],
+    ['"one of" over an item of the task', standing(v(CANDY), [CANDY]), oneOf, 'asks'],
+    ['a reward the "one of" does not hold', standing(TASK, [GIBLE, BULBASAUR]), candy, 'asks'],
+    ['another task', standing(v(GIBLE, OTHER), [GIBLE]), gible, 'asks'],
+    ['a bare key of one reward, another reward (R10)', standing(TASK, [GIBLE]), bulbasaur, 'asks'],
+    ['a typed reward over its typed task', standing(`typed:${OTHER}`, []), typedCandy, 'narrow'],
+    [
+      'a typed task over its reward',
+      standing(`typed:${OTHER}:${CANDY}`, [CANDY]),
+      typedBare,
+      'less',
+    ],
+    ['a typed task over a listed one', standing(v(CANDY), [CANDY]), typedCandy, 'asks'],
+  ] as const)('%s: %s', (_what, there, report, expected) => {
+    expect(decideResearch(there, report, NOW, 'ash')).toBe(expected);
+  });
+
+  it('corrects the reporter’s own report without asking, and one the member ticked', () => {
+    const own = standing(v(GIBLE), [GIBLE], { reporterId: 'ash' });
+    expect(decideResearch(own, bulbasaur, NOW, 'ash')).toBe('correct');
+    const misty = standing(v(GIBLE), [GIBLE], { id: 9 });
+    expect(decideResearch(misty, bulbasaur, NOW, 'ash', [9])).toBe('correct');
+    expect(decideResearch(misty, bulbasaur, NOW, 'ash', [8])).toBe('asks');
+    // Ticking says nothing of what is no contest.
+    expect(decideResearch(standing(v(GIBLE), [GIBLE], { id: 9 }), gible, NOW, 'ash', [9])).toBe(
+      'again',
+    );
+  });
+});
diff --git a/src/domain/research/reports.ts b/src/domain/research/reports.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6f6269b8b305ae562246991c73e1b323f8d46c0b
--- /dev/null
+++ b/src/domain/research/reports.ts
@@ -0,0 +1,98 @@
+/*
+ * Research reports at a stop (plan 8R-5; design `2026-10-23-research-rewards-apart-design.md`,
+ * point 4 and R7–R15): one per stop and period, of one version of a task (`versions.ts`). Which
+ * stands is decided by the storage with the stop's row locked (`saveUnless`), as Rocket's
+ * `decideRocket` is. Pure.
+ */
+
+/** A research report's subject read: its task (a key, or `typed:<text key>`) and reward hash. */
+export interface ResearchSubjectKey {
+  /** The task: a listed task's key, or a typed task's `typed:<key of its text>`. */
+  task: string;
+  /** The reward's hash (`rewardHash`) of a version of one reward; undefined for the task alone. */
+  hash: string | undefined;
+}
+
+/**
+ * A research report's `subjectKey` read (R9, R11): `<task>`, `<task>:<hash>`,
+ * `typed:<text key>` or `typed:<text key>:<hash>`; undefined for anything else. Never read a
+ * subject by splitting it on `:`.
+ */
+export function researchSubjectOf(subjectKey: string): ResearchSubjectKey | undefined {
+  const match = /^((?:typed:)?[0-9a-f]{16})(?::([0-9a-f]{8}))?$/.exec(subjectKey);
+  if (!match?.[1]) return undefined;
+  return { task: match[1], hash: match[2] };
+}
+
+/** The task a subject is of (`researchSubjectOf`), the subject itself where it reads as none. */
+export function taskOfSubject(subjectKey: string): string {
+  return researchSubjectOf(subjectKey)?.task ?? subjectKey;
+}
+
+/**
+ * What the decision reads of a research report: its subject and the hashes of the rewards its
+ * detail stands for (`rewardHash` of each: the one reward, the encounters of "one of", every
+ * reward of a report made before plan 8R-5).
+ */
+export interface ResearchAt {
+  subjectKey: string;
+  hashes: readonly string[];
+}
+
+/** What the decision reads of the report standing at the stop in the period. */
+export interface StandingResearch extends ResearchAt {
+  id: number;
+  endsAt: number;
+  reporterId: string;
+}
+
+/**
+ * What becomes of a research report at a stop (point 4): `new` (nothing stands, or it ended:
+ * R8); `narrow` (a reward over the "one of" of its task that holds it: replaced without asking);
+ * `less` ("one of" over one of its rewards: already reported, the reward says more); `again`
+ * (the same version: already reported); `asks` (a contradiction: anything else, asked first, R7);
+ * `correct` (a contradiction replaced: of the reporter's own report, or one the member ticked).
+ */
+export type ResearchDecision = 'new' | 'narrow' | 'less' | 'again' | 'asks' | 'correct';
+
+/**
+ * A report's version as the decision sees it: its task, its reward's hash, or none where it
+ * stands for its task's rewards together. A task's key alone with one reward in its detail is
+ * that reward's version (R10: a report of before, of a task of one reward); with none or two
+ * or more it is open ("one of", a typed task without its reward).
+ */
+function versionOf(report: ResearchAt): { task: string; hash: string | undefined } | undefined {
+  const subject = researchSubjectOf(report.subjectKey);
+  if (!subject) return undefined;
+  if (subject.hash !== undefined) return subject;
+  const [only, ...more] = report.hashes;
+  return { task: subject.task, hash: only !== undefined && more.length === 0 ? only : undefined };
+}
+
+/**
+ * The decision on a research `report` at a stop where `standing` is the stop's report of the
+ * report's own period (R15: no other period's), made by `by` at `now`; `replacing` the ids of
+ * the reports the member said to replace (R7: the stops they ticked).
+ */
+export function decideResearch(
+  standing: StandingResearch | undefined,
+  report: ResearchAt,
+  now: number,
+  by: string,
+  replacing: readonly number[] = [],
+): ResearchDecision {
+  if (!standing || standing.endsAt <= now) return 'new';
+  if (standing.subjectKey === report.subjectKey) return 'again';
+  const there = versionOf(standing);
+  const here = versionOf(report);
+  if (there && here && there.task === here.task) {
+    if (there.hash === undefined && here.hash !== undefined) {
+      if (standing.hashes.length === 0 || standing.hashes.includes(here.hash)) return 'narrow';
+    } else if (there.hash !== undefined && here.hash === undefined) {
+      if (report.hashes.length === 0 || report.hashes.includes(there.hash)) return 'less';
+    } else if (there.hash === here.hash) {
+      return 'again';
+    }
+  }
+  return standing.reporterId === by || replacing.includes(standing.id) ? 'correct' : 'asks';
+}
diff --git a/src/domain/research/versions.test.ts b/src/domain/research/versions.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..58f258296ee4b8a922d32a1c018e477c9540658f
--- /dev/null
+++ b/src/domain/research/versions.test.ts
@@ -0,0 +1,123 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { pageTask } from '../../../test/support/research.js';
+import { rewardHash, taskVersions, versionValue, oneOfLabel } from './versions.js';
+import type { ResearchTask, TaskReward } from './task.js';
+
+const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
+
+function encounter(name: string, key: string, dex: number, picture: string): TaskReward {
+  return {
+    kind: 'encounter',
+    name,
+    key,
+    dex,
+    shiny: false,
+    cp: null,
+    image: `${crop}${picture}`,
+  };
+}
+
+const candy: TaskReward = {
+  kind: 'item',
+  item: 'rare-candy',
+  name: 'Rare Candy',
+  quantity: 3,
+  image: null,
+};
+
+const task = (rewards: TaskReward[]): ResearchTask => ({
+  key: '0123456789abcdef',
+  text: 'Make 3 Great Throws in a row',
+  category: 'Throwing',
+  rewards,
+});
+
+describe('the versions of a task (plan 8R-5)', () => {
+  const catalogue = catalogueFixture();
+
+  it('offers one per reward in the page’s order, then "one of" its encounters', () => {
+    const lileep = pageTask('Make 3 Great Throws in a row');
+    const versions = taskVersions(lileep, catalogue);
+    expect(versions.map((one) => [one.label, one.oneOf])).toEqual([
+      ['Lileep', false],
+      ['Anorith', false],
+      ['Pinap Berry ×3', false],
+      ['Poké Ball ×10', false],
+      ['Rare Candy ×1', false],
+      ['Razz Berry ×9', false],
+      ['Stardust ×1000', false],
+      ['Ultra Ball ×5', false],
+      ['one of Lileep, Anorith', true],
+    ]);
+    const [first] = versions;
+    expect(first?.value).toBe(`${lileep.key}:${rewardHash(lileep.rewards[0]!, catalogue)}`);
+    expect(first?.value).toMatch(/^[0-9a-f]{16}:[0-9a-f]{8}$/);
+    expect(first?.rewards).toEqual([lileep.rewards[0]]);
+    // "One of" is the task's key alone, with its encounters only (the items left out).
+    const oneOf = versions.at(-1);
+    expect(oneOf?.value).toBe(lileep.key);
+    expect(oneOf?.rewards.map((reward) => reward.name)).toEqual(['Lileep', 'Anorith']);
+  });
+
+  it('has no "one of" where one encounter is among items', () => {
+    const versions = taskVersions(
+      task([encounter('Dratini', 'dratini', 147, 'pm147.icon.png'), candy]),
+      catalogue,
+    );
+    expect(versions.map((one) => [one.label, one.oneOf])).toEqual([
+      ['Dratini', false],
+      ['Rare Candy ×3', false],
+    ]);
+  });
+
+  it('keeps a plain and a costumed Pikachu two versions, the costumed one said', () => {
+    const versions = taskVersions(
+      task([
+        encounter('Pikachu', 'pikachu', 25, 'pm25.icon.png'),
+        encounter('Pikachu wearing a Cosmog suit', 'pikachu', 25, 'pm25.fPXP_2026.icon.png'),
+      ]),
+      catalogue,
+    );
+    // The name says the costume already: no mark (review L9). The flag tells it (L7).
+    expect(versions.map((one) => [one.label, one.costumed])).toEqual([
+      ['Pikachu', false],
+      ['Pikachu wearing a Cosmog suit', true],
+      ['one of Pikachu, Pikachu wearing a Cosmog suit', false],
+    ]);
+    expect(new Set(versions.map((one) => one.value)).size).toBe(3);
+  });
+
+  it('marks a costumed version whose name is the plain one', () => {
+    const versions = taskVersions(
+      task([
+        encounter('Pikachu', 'pikachu', 25, 'pm25.icon.png'),
+        encounter('Pikachu', 'pikachu', 25, 'pm25.fPXP_2026.icon.png'),
+      ]),
+      catalogue,
+    );
+    expect(versions.map((one) => [one.label, one.costumed])).toEqual([
+      ['Pikachu', false],
+      ['Pikachu (costumed)', true],
+      ['one of Pikachu, Pikachu (costumed)', false],
+    ]);
+  });
+
+  it('is the task alone where it has one reward, or none', () => {
+    const dratini = pageTask('Make 2 Excellent Throws');
+    expect(taskVersions(dratini, catalogue).map((one) => [one.value, one.label])).toEqual([
+      [versionValue(dratini.key, rewardHash(dratini.rewards[0]!, catalogue)), 'Dratini'],
+    ]);
+    expect(taskVersions(task([]), catalogue)).toEqual([
+      { value: '0123456789abcdef', label: '', rewards: [], oneOf: false, costumed: false },
+    ]);
+  });
+
+  it('names the rewards of "one of" with those matched first', () => {
+    const rewards = pageTask('Make 3 Excellent Throws in a row').rewards;
+    expect(oneOfLabel(rewards)).toBe('one of Larvitar, Beldum, Gible');
+    expect(oneOfLabel(rewards, (reward) => reward.name === 'Gible')).toBe(
+      'one of Gible, Larvitar, Beldum',
+    );
+  });
+});
diff --git a/src/domain/research/versions.ts b/src/domain/research/versions.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cd286674437d5e723ca1e3f9c7e13a396b6aa390
--- /dev/null
+++ b/src/domain/research/versions.ts
@@ -0,0 +1,125 @@
+import type { PokemonCatalogue } from '../pogo/catalogue.js';
+import { costumedByName } from '../pogo/costumes.js';
+import { hexHash } from '../short-hash.js';
+import { rewardsInShort, type ResearchTask, type TaskReward } from './task.js';
+
+/*
+ * The versions of a field research task (plan 8R-5; design
+ * `2026-10-23-research-rewards-apart-design.md`): a task Leek Duck lists with several rewards is
+ * in the game several tasks of one text, each with one reward, the same all day at a stop. So a
+ * report is of one version: one reward (`<task key>:<reward hash>`), or, for a task of two or
+ * more encounters, "one of" them (the task's key alone), since an encounter is not shown before
+ * the task is done. Pure.
+ */
+
+/**
+ * What tells two rewards of a task apart: its kind and what it is; an encounter also whether it
+ * is costumed (plan 8R-4: a plain and a costumed Pikachu stay two).
+ */
+export function rewardKey(reward: TaskReward, catalogue: PokemonCatalogue): string {
+  switch (reward.kind) {
+    case 'encounter':
+      return `e:${reward.key ?? reward.name}${rewardIsCostumed(reward, catalogue) ? ':costumed' : ''}`;
+    case 'item':
+      return `i:${reward.item}:${String(reward.quantity)}`;
+    case 'energy':
+      return `m:${reward.name}:${String(reward.quantity)}`;
+  }
+}
+
+/** Whether an encounter is costumed, by its Leek Duck name and picture (`costumedByName`). */
+function rewardIsCostumed(reward: TaskReward, catalogue: PokemonCatalogue): boolean {
+  return (
+    reward.kind === 'encounter' && costumedByName(catalogue, reward.name, reward.image ?? undefined)
+  );
+}
+
+/** A reward's hash in a version's subject: 8 hex digits of FNV-1a of its `rewardKey`. */
+export function rewardHash(reward: TaskReward, catalogue: PokemonCatalogue): string {
+  return hexHash(rewardKey(reward, catalogue));
+}
+
+/** A version's subject: `<task>:<reward hash>`, or the task alone ("one of", or no reward). */
+export function versionValue(task: string, hash?: string): string {
+  return hash === undefined ? task : `${task}:${hash}`;
+}
+
+/**
+ * A version of a task, as `/research report` and the map offer it (R1): its value (the report's
+ * `subjectKey`), its label (the reward's words: `Gible`, `Rare Candy ×3`, `Pikachu wearing a
+ * Cosmog suit (costumed)`, `one of Gible, Bulbasaur`), the rewards it stands for (one, the
+ * encounters of "one of", none for a task of no reward), and whether it is "one of".
+ */
+export interface TaskVersion {
+  value: string;
+  label: string;
+  rewards: TaskReward[];
+  oneOf: boolean;
+  /** Whether it is a costumed reward's version (plan 8R-4: kept apart from the plain one). */
+  costumed: boolean;
+}
+
+/**
+ * A reward's words as a version's label: its name, an item's quantity; a costumed encounter's
+ * `(costumed)` said where its name is the catalogue's plain one (review L9: `Pikachu wearing a
+ * Cosmog suit` says it already).
+ */
+function rewardLabel(reward: TaskReward, catalogue: PokemonCatalogue | undefined): string {
+  const words = rewardsInShort([reward]);
+  if (catalogue === undefined || !rewardIsCostumed(reward, catalogue)) return words;
+  const plainName =
+    reward.kind === 'encounter' && reward.key !== null
+      ? catalogue.byKey(reward.key)?.name
+      : undefined;
+  return plainName === undefined || plainName === reward.name ? `${words} (costumed)` : words;
+}
+
+/**
+ * The words of "one of" (R12): `one of Gible, Bulbasaur, Axew +2`, the rewards `first` matches
+ * (the reward typed, the member's) before the others, each group in its order.
+ */
+export function oneOfLabel(
+  rewards: readonly TaskReward[],
+  first?: (reward: TaskReward) => boolean,
+  catalogue?: PokemonCatalogue,
+): string {
+  const ordered =
+    first === undefined
+      ? rewards
+      : [
+          ...rewards.filter((reward) => first(reward)),
+          ...rewards.filter((reward) => !first(reward)),
+        ];
+  const names = ordered.map((reward) => rewardLabel(reward, catalogue));
+  const shown = names.slice(0, 3).join(', ');
+  return `one of ${names.length > 3 ? `${shown} +${String(names.length - 3)}` : shown}`;
+}
+
+/**
+ * The versions of a task (R1): one per reward in the page's order, then "one of" its encounters
+ * where it has two or more (its items and Mega Energy left out: they show before the task is
+ * done). A task of no reward is one version, its key alone.
+ */
+export function taskVersions(task: ResearchTask, catalogue: PokemonCatalogue): TaskVersion[] {
+  if (task.rewards.length === 0) {
+    return [{ value: task.key, label: '', rewards: [], oneOf: false, costumed: false }];
+  }
+  const versions = task.rewards.map((reward): TaskVersion => ({
+    value: versionValue(task.key, rewardHash(reward, catalogue)),
+    label: rewardLabel(reward, catalogue),
+    rewards: [reward],
+    oneOf: false,
+    costumed: rewardIsCostumed(reward, catalogue),
+  }));
+  const encounters = task.rewards.filter((reward) => reward.kind === 'encounter');
+  if (encounters.length >= 2) {
+    versions.push({
+      value: task.key,
+      label: oneOfLabel(encounters, undefined, catalogue),
+      rewards: encounters,
+      oneOf: true,
+      costumed: false,
+    });
+  }
+  return versions;
+}
diff --git a/src/domain/short-hash.ts b/src/domain/short-hash.ts
index 849de87777ebce08c61f374ee19bc7dd4bbb3568..97ba6ea13eba7fc4993e48ec40dd1dcbad510ccb 100644
--- a/src/domain/short-hash.ts
+++ b/src/domain/short-hash.ts
@@ -1,7 +1,7 @@
 /*
  * A short hash of what a member was shown, to tell a choice made then from the data of now: the
- * Which field of `/want`'s dialog (plan 8R-4, review R5) and a grunt type's lineup (plan 8R-4L,
- * B13). Pure, and of no module of its own area, so that both can import it without a cycle.
+ * Which field of `/want`'s dialog (plan 8R-4, review R5), a grunt type's lineup (plan 8R-4L,
+ * B13) and a research reward's version (plan 8R-5). Pure, and of no module of its own area, so that both can import it without a cycle.
  */
 
 /** The Which field's hash where a dialog shows none (`whichHash` of no keys). */
@@ -17,9 +17,22 @@ const FNV_PRIME = 0x01000193;
  */
 export function whichHash(keys: readonly string[]): string {
   if (keys.length === 0) return NO_WHICH;
+  return fnv32(keys.join(',')).toString(36);
+}
+
+/**
+ * A short hash of a text as 8 hex digits (FNV-1a, 32 bits): a research reward's version in a
+ * report's subject (plan 8R-5), far under a choice's 100 characters.
+ */
+export function hexHash(text: string): string {
+  return fnv32(text).toString(16).padStart(8, '0');
+}
+
+/** FNV-1a of a text's UTF-8, 32 bits. */
+function fnv32(text: string): number {
   let hash = FNV_OFFSET;
-  for (const byte of new TextEncoder().encode(keys.join(','))) {
+  for (const byte of new TextEncoder().encode(text)) {
     hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
   }
-  return hash.toString(36);
+  return hash;
 }
````

### Task 2: 8R-5 task 2: Versions in the task list and reports in storage

Prototype commit: `748bc931f149a592052fc0f8a271430a72f80ced`

ResearchTaskService works out each task's versions (by task and by value,
`byVersion`) once per list and catalogue; the fixture gives them too.
StopReportService.reportResearch goes through saveUnless with decideResearch
(the stop's row of its period locked): a narrowing, a correction of one's own
report or of one the member ticked (`replacing`) replaces; the same version or
less is reported already; a contradiction asks. ResearchOutcome gains
`already` and `asks`, ResearchNews the reports replaced; `contested` reads the
contradictions before anything is reported. The reward hash is the game data's
(`rewardHash` option, a costume told by the catalogue).

**Files:**

```
 src/app.ts                                    |   3 ++
 src/commands/research/research-report.test.ts |   3 +-
 src/commands/research/research.test.ts        |  30 ++++++++++---
 src/commands/rocket/rocket-report.test.ts     |   3 +-
 src/commands/rocket/rocket.test.ts            |   3 +-
 src/domain/research/reports.ts                |  13 ++++++
 src/domain/research/versions.ts               |  47 +++++++++++++++++---
 src/services/notify-service.research.test.ts  |   3 +-
 src/services/notify-service.rocket.test.ts    |   3 +-
 src/services/research-task-service.test.ts    |  28 ++++++++++++
 src/services/research-task-service.ts         |  43 ++++++++++++++++++
 src/services/rocket-reports.test.ts           |   3 +-
 src/services/stop-posts.test.ts               |   3 +-
 src/services/stop-reports.test.ts             | 153 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/services/stop-reports.ts                  | 157 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++----------
 test/support/research.ts                      |   5 +++
 test/support/stop-report-cases.ts             |  26 +++++++++++
 test/support/stop-reporting.ts                |   2 +
 test/support/stop-reports.ts                  |  11 +++++
 test/support/test-context.ts                  |   2 +
 20 files changed, 496 insertions(+), 45 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/research/research-report.test.ts src/commands/research/research.test.ts src/commands/rocket/rocket-report.test.ts src/commands/rocket/rocket.test.ts src/services/notify-service.research.test.ts src/services/notify-service.rocket.test.ts src/services/research-task-service.test.ts src/services/rocket-reports.test.ts src/services/stop-posts.test.ts src/services/stop-reports.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 748bc931f149a592052fc0f8a271430a72f80ced -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-5 task 2: Versions in the task list and reports in storage`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 2c64a8ddbf69ef4af33f31ac7083fce17085ff3a..51633922d9e4a37533bb80cf6abfbfb7f63e55c4 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -85,6 +85,7 @@ import { ResearchEventRepository } from './db/repositories/research-event-reposi
 import { MaxEventRepository } from './db/repositories/max-event-repository.js';
 import { StopReportRepository } from './db/repositories/stop-report-repository.js';
 import { StopReportService } from './services/stop-reports.js';
+import { rewardHash } from './domain/research/versions.js';
 import { StopPostService } from './services/stop-posts.js';
 import { StopPostRepository } from './db/repositories/stop-post-repository.js';
 import { PineStopRepository } from './db/repositories/pine-stop-repository.js';
@@ -299,6 +300,8 @@ export async function startApp(
     zone: config.settings.timezone,
     // A grunt's report (plan 8R-2) stands as long as its message.
     gruntMs: config.settings.rocket.gruntMinutes * 60_000,
+    // A costume is told by the game data (plan 8R-5): a costumed reward's version is its own.
+    rewardHash: (reward) => rewardHash(reward, gameData.catalogue),
     log,
   });
   const gymRepository = new GymRepository(db);
diff --git a/src/commands/research/research-report.test.ts b/src/commands/research/research-report.test.ts
index a10271da54cb1ebe4a26168906ab668652dd3fd8..b1d949fb1720182274347fdcb93ab7ec0a28dd63 100644
--- a/src/commands/research/research-report.test.ts
+++ b/src/commands/research/research-report.test.ts
@@ -2,7 +2,7 @@ import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
 import { OTHER_GUILD_ID, OTHER_GUILD_ROW, WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { pageTask } from '../../../test/support/research.js';
-import { MemoryStopReports } from '../../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../../test/support/wayspots.js';
@@ -66,6 +66,7 @@ async function setup() {
   const { ctx } = createTestContext({ wayspots });
   Object.assign(ctx, {
     stopReports: new StopReportService({
+      rewardHash: fixtureRewardHash,
       store,
       events: ctx.raidEvents,
       zone: ctx.config.settings.timezone,
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index 1956bd253c4746509de4b1a049c2025c2087b4b4..f39a313df33e926b8f0a5f569621911ede2adb18 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -13,7 +13,7 @@ import {
 import { UNBOUNDED_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { selectsOf } from '../../../test/support/messages.js';
 import { pageTask } from '../../../test/support/research.js';
-import { MemoryStopReports } from '../../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../../test/support/wayspots.js';
@@ -56,6 +56,7 @@ async function setup(rows: readonly WayspotRow[] = STOPS) {
   const { ctx } = createTestContext({ wayspots });
   Object.assign(ctx, {
     stopReports: new StopReportService({
+      rewardHash: fixtureRewardHash,
       store,
       events: ctx.raidEvents,
       zone: ctx.config.settings.timezone,
@@ -130,6 +131,22 @@ async function setup(rows: readonly WayspotRow[] = STOPS) {
 
 const stop = (n: number): string => `stop:${wayspotId(n)}`;
 
+/** Misty reports Catch 7 Pokémon at stop 1, replacing what stands there as if she ticked it. */
+async function replaceAsMisty(made: Awaited<ReturnType<typeof setup>>): Promise<void> {
+  const there = await made.ctx.stopReports.at(FAKE_GUILD_ID, wayspotId(1));
+  const task = pageTask('Catch 7 Pokémon');
+  await made.ctx.stopReports.reportResearch({
+    serverId: FAKE_GUILD_ID,
+    stops: [there!.stop],
+    subject: {
+      subjectKey: task.key,
+      research: { text: task.text, category: task.category, rewards: task.rewards, typed: false },
+    },
+    reporter: { id: MISTY, name: 'Misty' },
+    replacing: [there!.id],
+  });
+}
+
 describe('/research report', () => {
   it('reports a task at the stops named, privately, with more stops to offer and Take back', async () => {
     const made = await setup();
@@ -159,7 +176,8 @@ describe('/research report', () => {
   it('says what a report replaced', async () => {
     const made = await setup();
     await made.report({ task: pageTask('Catch 7 Pokémon').key, stop: stop(1) });
-    const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }, made.as(MISTY)));
+    // The reporter's own report is corrected without asking (plan 8R-5).
+    const answer = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
     expect(said(answer)).toContain('- **Yellow Mural** (was: Catch 7 Pokémon)');
     expect(made.store.rows.size).toBe(1);
   });
@@ -198,7 +216,9 @@ describe('/research report', () => {
     expect(await refused({ task: DRAGON.key, stop: '40.03, -80.09' })).toBe(NO_STOP_AT_PIN);
     expect(made.store.rows.size).toBe(0);
     // Nothing counted: the limit is all there.
-    for (let n = 0; n < 10; n++) await made.report({ task: DRAGON.key, stop: stop(1) });
+    // Each a correction of the one before (plan 8R-5: the same task again is reported already).
+    const tasks = [DRAGON.key, pageTask('Catch 7 Pokémon').key];
+    for (let n = 0; n < 10; n++) await made.report({ task: tasks[n % 2] ?? '', stop: stop(1) });
     expect(said(answerOf(await made.report({ task: DRAGON.key, stop: stop(1) })))).toMatch(
       /^You can use \/research report again in/,
     );
@@ -253,7 +273,7 @@ describe('the controls of /research report’s answer', () => {
     const made = await setup();
     made.ctx.config.settings.research.throttle.uses = 2;
     const first = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
-    await made.report({ task: pageTask('Catch 7 Pokémon').key, stop: stop(1) }, made.as(MISTY));
+    await replaceAsMisty(made);
     const [menu] = selectsOf(asV2(first));
     expect(said(answerOf(await made.pick(menu?.customId ?? '', [wayspotId(3)])))).toBe(
       REPORT_ENDED,
@@ -301,7 +321,7 @@ describe('/research remove', () => {
     await made.report({ task: DRAGON.key, stop: stop(1) });
     const read = await made.ctx.stopReports.at(FAKE_GUILD_ID, wayspotId(1));
     // Misty replaces it between the read and the taking back.
-    await made.report({ task: pageTask('Catch 7 Pokémon').key, stop: stop(1) }, made.as(MISTY));
+    await replaceAsMisty(made);
     made.ctx.stopReports.at = () => Promise.resolve(read);
     expect(said(answerOf(await made.remove(stop(1))))).toBe(REPORT_CHANGED);
     expect([...made.store.rows.values()].map((one) => one.reporter.name)).toEqual(['Misty']);
diff --git a/src/commands/rocket/rocket-report.test.ts b/src/commands/rocket/rocket-report.test.ts
index 15a31133ece17252db6e9dabb06f0311f7d23f36..b71ec4813b84021579025639a9e0c74799b9e6d3 100644
--- a/src/commands/rocket/rocket-report.test.ts
+++ b/src/commands/rocket/rocket-report.test.ts
@@ -4,7 +4,7 @@ import { FAKE_GUILD_ID } from '../../../test/support/fake-interactions.js';
 import { WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { feedChoice } from '../../../test/support/rocket.js';
 import { MemoryGruntMessages } from '../../../test/support/rocket-store.js';
-import { MemoryStopReports } from '../../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../../test/support/wayspots.js';
@@ -35,6 +35,7 @@ async function setup() {
   const gateway = new FakePartyGateway();
   const { ctx } = createTestContext({ wayspots });
   const stopReports = new StopReportService({
+    rewardHash: fixtureRewardHash,
     store,
     events: ctx.raidEvents,
     zone: ctx.config.settings.timezone,
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index af4396a793bf66f00dd20114a2a9016212c0b4cf..d6d44394b78065ceb69c77be3d3f6f05e69e7d90 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -21,7 +21,7 @@ import {
 } from '../../../test/support/rocket.js';
 import { lineupChoice, lineupFingerprint, lineupValue } from '../../domain/rocket/lineups.js';
 import { MemoryGruntMessages } from '../../../test/support/rocket-store.js';
-import { MemoryStopReports } from '../../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../../test/support/wayspots.js';
@@ -61,6 +61,7 @@ async function setup(rows: readonly WayspotRow[] = STOPS) {
   const gateway = new FakePartyGateway();
   const { ctx } = createTestContext({ wayspots });
   const stopReports = new StopReportService({
+    rewardHash: fixtureRewardHash,
     store,
     events: ctx.raidEvents,
     zone: ctx.config.settings.timezone,
diff --git a/src/domain/research/reports.ts b/src/domain/research/reports.ts
index 6f6269b8b305ae562246991c73e1b323f8d46c0b..04e2dc016d21d852650c2deed8999a947e855870 100644
--- a/src/domain/research/reports.ts
+++ b/src/domain/research/reports.ts
@@ -29,6 +29,19 @@ export function taskOfSubject(subjectKey: string): string {
   return researchSubjectOf(subjectKey)?.task ?? subjectKey;
 }
 
+/**
+ * Whether a report is "one of" (R10), in words, narrowing and confirmations: its task's key
+ * alone, with two or more rewards in its detail (a report of before plan 8R-5 has every reward of
+ * its task there, items too).
+ */
+export function isOneOf(report: {
+  subjectKey: string;
+  research: { rewards: readonly unknown[] };
+}): boolean {
+  const subject = researchSubjectOf(report.subjectKey);
+  return subject !== undefined && subject.hash === undefined && report.research.rewards.length >= 2;
+}
+
 /**
  * What the decision reads of a research report: its subject and the hashes of the rewards its
  * detail stands for (`rewardHash` of each: the one reward, the encounters of "one of", every
diff --git a/src/domain/research/versions.ts b/src/domain/research/versions.ts
index cd286674437d5e723ca1e3f9c7e13a396b6aa390..ba560a07a9f59c3933bf6203e1b3150467e73a09 100644
--- a/src/domain/research/versions.ts
+++ b/src/domain/research/versions.ts
@@ -14,9 +14,10 @@ import { rewardsInShort, type ResearchTask, type TaskReward } from './task.js';
 
 /**
  * What tells two rewards of a task apart: its kind and what it is; an encounter also whether it
- * is costumed (plan 8R-4: a plain and a costumed Pikachu stay two).
+ * is costumed (plan 8R-4: a plain and a costumed Pikachu stay two), which only the catalogue
+ * tells: without it, none is.
  */
-export function rewardKey(reward: TaskReward, catalogue: PokemonCatalogue): string {
+export function rewardKey(reward: TaskReward, catalogue?: PokemonCatalogue): string {
   switch (reward.kind) {
     case 'encounter':
       return `e:${reward.key ?? reward.name}${rewardIsCostumed(reward, catalogue) ? ':costumed' : ''}`;
@@ -28,14 +29,16 @@ export function rewardKey(reward: TaskReward, catalogue: PokemonCatalogue): stri
 }
 
 /** Whether an encounter is costumed, by its Leek Duck name and picture (`costumedByName`). */
-function rewardIsCostumed(reward: TaskReward, catalogue: PokemonCatalogue): boolean {
+function rewardIsCostumed(reward: TaskReward, catalogue?: PokemonCatalogue): boolean {
   return (
-    reward.kind === 'encounter' && costumedByName(catalogue, reward.name, reward.image ?? undefined)
+    catalogue !== undefined &&
+    reward.kind === 'encounter' &&
+    costumedByName(catalogue, reward.name, reward.image ?? undefined)
   );
 }
 
 /** A reward's hash in a version's subject: 8 hex digits of FNV-1a of its `rewardKey`. */
-export function rewardHash(reward: TaskReward, catalogue: PokemonCatalogue): string {
+export function rewardHash(reward: TaskReward, catalogue?: PokemonCatalogue): string {
   return hexHash(rewardKey(reward, catalogue));
 }
 
@@ -66,10 +69,10 @@ export interface TaskVersion {
  */
 function rewardLabel(reward: TaskReward, catalogue: PokemonCatalogue | undefined): string {
   const words = rewardsInShort([reward]);
-  if (catalogue === undefined || !rewardIsCostumed(reward, catalogue)) return words;
+  if (!rewardIsCostumed(reward, catalogue)) return words;
   const plainName =
     reward.kind === 'encounter' && reward.key !== null
-      ? catalogue.byKey(reward.key)?.name
+      ? catalogue?.byKey(reward.key)?.name
       : undefined;
   return plainName === undefined || plainName === reward.name ? `${words} (costumed)` : words;
 }
@@ -95,6 +98,36 @@ export function oneOfLabel(
   return `one of ${names.length > 3 ? `${shown} +${String(names.length - 3)}` : shown}`;
 }
 
+/** A version found by its value, with its task. */
+export interface FoundVersion {
+  task: ResearchTask;
+  version: TaskVersion;
+}
+
+/** The versions of a task list, worked out once (R1): by task and by value. */
+export interface VersionIndex {
+  of(task: ResearchTask): readonly TaskVersion[];
+  byValue(value: string): FoundVersion | undefined;
+}
+
+/** The versions of every task of a list, by task key and by value. */
+export function versionIndex(
+  tasks: readonly ResearchTask[],
+  catalogue: PokemonCatalogue,
+): VersionIndex {
+  const byTask = new Map<string, TaskVersion[]>();
+  const byValue = new Map<string, FoundVersion>();
+  for (const task of tasks) {
+    const versions = taskVersions(task, catalogue);
+    byTask.set(task.key, versions);
+    for (const version of versions) byValue.set(version.value, { task, version });
+  }
+  return {
+    of: (task) => byTask.get(task.key) ?? taskVersions(task, catalogue),
+    byValue: (value) => byValue.get(value),
+  };
+}
+
 /**
  * The versions of a task (R1): one per reward in the page's order, then "one of" its encounters
  * where it has two or more (its items and Mega Energy left out: they show before the task is
diff --git a/src/services/notify-service.research.test.ts b/src/services/notify-service.research.test.ts
index e8cc378753424c0d01989c5507dde54fdaf476aa..ba30146e52ea7349278ba6cf2bd03118c3b43a1e 100644
--- a/src/services/notify-service.research.test.ts
+++ b/src/services/notify-service.research.test.ts
@@ -5,7 +5,7 @@ import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import { pageTask, researchTasksOfPage } from '../../test/support/research.js';
 import { reportedStop } from '../../test/support/stop-report-cases.js';
-import { MemoryStopReports } from '../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
 import { INTO_THE_WILD } from '../../test/support/research-store-cases.js';
 import type { ResearchEvent } from '../domain/time/research-events.js';
 import { DateTime } from 'luxon';
@@ -44,6 +44,7 @@ async function researchWith(
 ) {
   const made = await partyServiceWith([], { notifying });
   const reports = new StopReportService({
+    rewardHash: fixtureRewardHash,
     store: new MemoryStopReports(),
     events: { researchEvents: () => events },
     zone: made.settings.timezone,
diff --git a/src/services/notify-service.rocket.test.ts b/src/services/notify-service.rocket.test.ts
index 7afe184d055ca6448e44a304fb64409bf27051d8..f581e8a844388b9456c60e821ffbe2e017ec04ce 100644
--- a/src/services/notify-service.rocket.test.ts
+++ b/src/services/notify-service.rocket.test.ts
@@ -13,7 +13,7 @@ import { partyServiceWith } from '../../test/support/party-service.js';
 import { feedChoice } from '../../test/support/rocket.js';
 import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
 import { reportedStop } from '../../test/support/stop-report-cases.js';
-import { MemoryStopReports } from '../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
 import { watchEachTest } from '../../test/support/timers.js';
 import type { TargetWant } from '../domain/notify/target-wants.js';
 import { lineupChoice, type RocketLineupChoice } from '../domain/rocket/lineups.js';
@@ -39,6 +39,7 @@ const rocketWant = (who: string): TargetWant => ({ kind: 'rocket', who });
 async function rocketWith(notifying: Partial<NotifyServiceOptions> = {}, rehearsal = false) {
   const made = await partyServiceWith([], { notifying });
   const reports = new StopReportService({
+    rewardHash: fixtureRewardHash,
     store: new MemoryStopReports(),
     events: { researchEvents: () => [] },
     zone: made.settings.timezone,
diff --git a/src/services/research-task-service.test.ts b/src/services/research-task-service.test.ts
index cdd89c828ff39890311b32aa11e2a320b863333b..a286ff4bb8d16335f37d52fdc5979d1d63aa9791 100644
--- a/src/services/research-task-service.test.ts
+++ b/src/services/research-task-service.test.ts
@@ -63,6 +63,34 @@ describe('ResearchTaskService', () => {
     expect((await store.kept()).tasks).toHaveLength(58);
   });
 
+  it('works out the versions of each task when it takes a list, and finds them (plan 8R-5)', async () => {
+    let html = readResearchPage();
+    const { service, clock } = serviceWith(() => page(html));
+    expect(service.byVersion('6458b09802613fa3')).toBeUndefined();
+    await service.refresh();
+    const dragon = service.tasks().find((task) => task.text === 'Catch a Dragon-type Pokémon');
+    const versions = service.versions(dragon!);
+    expect(versions.map((version) => version.label)).toEqual([
+      'Dratini',
+      'Bagon',
+      'Axew',
+      'Golden Razz Berry ×2',
+      'Rare Candy ×3',
+      'Stardust ×1500',
+      'Ultra Ball ×10',
+      'one of Dratini, Bagon, Axew',
+    ]);
+    const bagon = versions[1]!;
+    expect(service.byVersion(bagon.value)).toEqual({ task: dragon, version: bagon });
+    expect(service.byVersion(dragon!.key)?.version.oneOf).toBe(true);
+    expect(service.byVersion(`${dragon!.key}:00000000`)).toBeUndefined();
+    // A list without the task: its versions are gone with it.
+    html = readResearchPage().replace('Catch a Dragon-type Pokémon', 'Catch a Fairy-type Pokémon');
+    clock.now += HOUR;
+    await service.refresh();
+    expect(service.byVersion(bagon.value)).toBeUndefined();
+  });
+
   it('starts with the list of the last run, without the network', async () => {
     const store = new MemoryResearchTasks();
     await store.replace([listedTask('Make 2 Excellent Throws')], NOW - HOUR / 2);
diff --git a/src/services/research-task-service.ts b/src/services/research-task-service.ts
index 10fd3b421b260fb877dcda1955707b3f8b7d4052..08ca41fb6cc58c286e2c0e47fd7806fe0bfa1262 100644
--- a/src/services/research-task-service.ts
+++ b/src/services/research-task-service.ts
@@ -1,6 +1,13 @@
 import type { ResearchTaskStorage } from '../db/repositories/research-task-repository.js';
 import { parseResearchPage } from '../domain/research/leekduck.js';
+import type { PokemonCatalogue } from '../domain/pogo/catalogue.js';
 import type { ResearchTask } from '../domain/research/task.js';
+import {
+  versionIndex,
+  type FoundVersion,
+  type TaskVersion,
+  type VersionIndex,
+} from '../domain/research/versions.js';
 import type { Logger } from '../log.js';
 import { failureReason } from './failure-reason.js';
 import type { GameDataProvider } from './game-data-service.js';
@@ -52,6 +59,14 @@ export interface ResearchTaskProvider {
    * (the rule the log's warning follows; the map's pick list says it, plan 8R-3).
    */
   stale(now: number): boolean;
+  /**
+   * The versions of a task (plan 8R-5, R1: one per reward, then "one of" its encounters), worked
+   * out once per list and game data; the autocomplete, `readTask`, the map's options and "Same
+   * task at more stops…" read only these.
+   */
+  versions(task: ResearchTask): readonly TaskVersion[];
+  /** A version of the list by its value (`<task>:<hash>`, or a task's key), with its task. */
+  byVersion(value: string): FoundVersion | undefined;
 }
 
 export type ResearchRefresh =
@@ -90,6 +105,10 @@ export class ResearchTaskService implements ResearchTaskProvider {
   private staleTold = false;
   /** The task keys of the last read refused as much smaller (`shrinkAgreed`); a read clears it. */
   private shrink: string | undefined;
+  /** The versions of the list in use, with the list and catalogue they were worked out of. */
+  private indexed:
+    | { tasks: readonly ResearchTask[]; catalogue: PokemonCatalogue; index: VersionIndex }
+    | undefined;
 
   constructor(private readonly options: ResearchTaskOptions) {
     this.timeoutMs = options.timeoutMs ?? 30_000;
@@ -113,6 +132,30 @@ export class ResearchTaskService implements ResearchTaskProvider {
     return this.read === undefined || now - this.read >= this.options.staleAfterMs;
   }
 
+  versions(task: ResearchTask): readonly TaskVersion[] {
+    return this.index().of(task);
+  }
+
+  byVersion(value: string): FoundVersion | undefined {
+    return this.index().byValue(value);
+  }
+
+  /**
+   * The versions of the list in use, worked out again only when the list or the game data
+   * changed (a costume is told by the catalogue: R1).
+   */
+  private index(): VersionIndex {
+    const { catalogue } = this.options.gameData;
+    if (this.indexed?.tasks !== this.current || this.indexed.catalogue !== catalogue) {
+      this.indexed = {
+        tasks: this.current,
+        catalogue,
+        index: versionIndex(this.current, catalogue),
+      };
+    }
+    return this.indexed.index;
+  }
+
   /** Takes the list kept by the last run (no network). */
   async load(): Promise<void> {
     const kept = await this.options.store.kept();
diff --git a/src/services/rocket-reports.test.ts b/src/services/rocket-reports.test.ts
index d3a23e37607fc0f308513306b8781ea4c900c3ac..8f4c2b51a0b5c668961f4362d99e4e338c52d16e 100644
--- a/src/services/rocket-reports.test.ts
+++ b/src/services/rocket-reports.test.ts
@@ -7,7 +7,7 @@ import { textOf } from '../../test/support/messages.js';
 import { feedChoice } from '../../test/support/rocket.js';
 import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
 import { REPORT_NOW, reportedStop } from '../../test/support/stop-report-cases.js';
-import { MemoryStopReports } from '../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { lineupChoice } from '../domain/rocket/lineups.js';
 import { rocketDay } from '../domain/rocket/reports.js';
@@ -27,6 +27,7 @@ function rocketWith(options: { rehearsal?: boolean; overlap?: boolean } = {}) {
   const { log } = createTestLogger();
   const gateway = new FakePartyGateway();
   const reports = new StopReportService({
+    rewardHash: fixtureRewardHash,
     store: new MemoryStopReports(),
     events: { researchEvents: () => [] },
     zone: 'America/New_York',
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index ff8d9feb3638a97ef56e327a4a22d0fbfc56b07a..3645c1ae6293fcbc977d2e56ff7e60bf1dede4a4 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -11,7 +11,7 @@ import { MemoryStopPosts } from '../../test/support/research-store.js';
 import { feedChoice } from '../../test/support/rocket.js';
 import { reportedStop } from '../../test/support/stop-report-cases.js';
 import { rocketSubject } from './rocket-reports.js';
-import { MemoryStopReports } from '../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import type { ResearchTask } from '../domain/research/task.js';
 import type { ResearchEvent } from '../domain/time/research-events.js';
@@ -47,6 +47,7 @@ function postsWith(initial: ResearchEvent[] = []) {
     for (const listener of listeners) listener();
   };
   const reports = new StopReportService({
+    rewardHash: fixtureRewardHash,
     store: reportStore,
     events: provider,
     zone: ZONE,
diff --git a/src/services/stop-reports.test.ts b/src/services/stop-reports.test.ts
index 044cff5f8db007113b6cdaf4194821edc0ebc856..c44861c2580b368c07cd1b55d582a43b56b68759 100644
--- a/src/services/stop-reports.test.ts
+++ b/src/services/stop-reports.test.ts
@@ -10,9 +10,12 @@ import {
   REPORTER,
   reportedStop,
 } from '../../test/support/stop-report-cases.js';
-import { MemoryStopReports } from '../../test/support/stop-reports.js';
+import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
+import { catalogueFixture } from '../../test/support/game-data.js';
+import { pageTask } from '../../test/support/research.js';
 import { taskKeyOf } from '../domain/research/task.js';
+import { taskVersions } from '../domain/research/versions.js';
 import type { ResearchEvent } from '../domain/time/research-events.js';
 import {
   StopReportService,
@@ -35,6 +38,7 @@ function serviceWith(events: ResearchEvent[] = [], start = at('2026-11-21T10:00'
   const store = new MemoryStopReports();
   const clock = { now: start };
   const service = new StopReportService({
+    rewardHash: fixtureRewardHash,
     store,
     events: { researchEvents: () => events },
     zone: ZONE,
@@ -70,7 +74,7 @@ describe('StopReportService', () => {
     expect(await service.standing(REPORT_SERVER)).toHaveLength(2);
   });
 
-  it('replaces a stop’s report whoever made it, news only for another task', async () => {
+  it('leaves the same task again as it stands, and corrects the reporter’s own (plan 8R-5)', async () => {
     const { service, news } = serviceWith();
     await service.reportResearch({
       serverId: REPORT_SERVER,
@@ -84,12 +88,16 @@ describe('StopReportService', () => {
       subject: THROWS,
       reporter: OTHER_REPORTER,
     });
-    // The same task again at stop 1 is no news; stop 2 is.
+    // The same task again at stop 1 is reported already, and no news; stop 2 is.
     expect(news.map((one) => one.reports.map((report) => report.stop.key))).toEqual([
       [reportedStop(1).key],
       [reportedStop(2).key],
     ]);
-    expect(again.saved[0]?.replaced?.subjectKey).toBe(THROWS.subjectKey);
+    expect(again.saved.map(({ report }) => report.stop.key)).toEqual([reportedStop(2).key]);
+    expect(again.already.map((report) => [report.stop.key, report.reporter])).toEqual([
+      [reportedStop(1).key, REPORTER],
+    ]);
+    // Another task over one's own report is a correction: no question.
     const other = await service.reportResearch({
       serverId: REPORT_SERVER,
       stops: [reportedStop(1)],
@@ -451,3 +459,140 @@ describe('StopReportService', () => {
     expect(store.rows.size).toBe(0);
   });
 });
+
+describe('StopReportService and the versions of a task (plan 8R-5)', () => {
+  const task = pageTask('Make 3 Excellent Throws in a row');
+  const versions = taskVersions(task, catalogueFixture());
+  const version = (label: string): ResearchSubject => {
+    const found = versions.find((one) => one.label === label);
+    if (!found) throw new Error(`no version ${label}`);
+    return {
+      subjectKey: found.value,
+      research: { text: task.text, category: task.category, rewards: found.rewards, typed: false },
+    };
+  };
+  const ONE_OF = version('one of Larvitar, Beldum, Gible');
+  const GIBLE = version('Gible');
+  const BELDUM = version('Beldum');
+  const report = (
+    service: StopReportService,
+    subject: ResearchSubject,
+    reporter = REPORTER,
+    stops = [reportedStop(1)],
+    replacing?: number[],
+  ) =>
+    service.reportResearch({
+      serverId: REPORT_SERVER,
+      stops,
+      subject,
+      reporter,
+      ...(replacing === undefined ? {} : { replacing }),
+    });
+
+  it('narrows "one of" to its reward without asking, the news carrying what it replaced', async () => {
+    const { service, news, changed } = serviceWith();
+    const first = await report(service, ONE_OF, OTHER_REPORTER);
+    const narrowed = await report(service, GIBLE);
+    const [saved] = narrowed.saved;
+    expect(saved?.replaced?.id).toBe(first.saved[0]?.report.id);
+    expect(saved?.report.subjectKey).toBe(GIBLE.subjectKey);
+    expect(news.at(-1)?.replaced.map((one) => one.subjectKey)).toEqual([ONE_OF.subjectKey]);
+    expect(changed).toHaveLength(2);
+  });
+
+  it('narrows "one of" to its costumed reward, told apart by the catalogue (review L5)', async () => {
+    const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
+    const pikachu = (picture: string) => ({
+      kind: 'encounter' as const,
+      name: 'Pikachu',
+      key: 'pikachu',
+      dex: 25,
+      shiny: false,
+      cp: null,
+      image: `${crop}${picture}`,
+    });
+    const costumedTask = {
+      key: taskKeyOf('Catch 5 Electric-type Pokémon'),
+      text: 'Catch 5 Electric-type Pokémon',
+      category: 'Catching',
+      rewards: [pikachu('pm25.icon.png'), pikachu('pm25.fPXP_2026.icon.png')],
+    };
+    const [, costumed, oneOf] = taskVersions(costumedTask, catalogueFixture());
+    const as = (found: typeof costumed): ResearchSubject => ({
+      subjectKey: found!.value,
+      research: {
+        text: costumedTask.text,
+        category: costumedTask.category,
+        rewards: found!.rewards,
+        typed: false,
+      },
+    });
+    const { service } = serviceWith();
+    await report(service, as(oneOf), OTHER_REPORTER);
+    const narrowed = await report(service, as(costumed));
+    expect(narrowed.asks).toEqual([]);
+    expect(narrowed.saved.map(({ report: one }) => one.subjectKey)).toEqual([costumed!.value]);
+  });
+
+  it('answers "one of" over its reward, and the same version, as reported already', async () => {
+    const { service, news, changed } = serviceWith();
+    await report(service, GIBLE, OTHER_REPORTER);
+    const less = await report(service, ONE_OF);
+    const again = await report(service, GIBLE);
+    for (const outcome of [less, again]) {
+      expect(outcome.saved).toEqual([]);
+      expect(outcome.already.map((one) => one.subjectKey)).toEqual([GIBLE.subjectKey]);
+    }
+    expect(news).toHaveLength(1);
+    expect(changed).toHaveLength(1);
+  });
+
+  it('asks before contradicting another’s report, and replaces it where ticked (R7)', async () => {
+    const { service, news } = serviceWith();
+    const gible = (await report(service, GIBLE, OTHER_REPORTER)).saved[0]!.report;
+    expect(await service.contested(REPORT_SERVER, [reportedStop(1)], BELDUM, REPORTER.id)).toEqual([
+      gible,
+    ]);
+    const asked = await report(service, BELDUM);
+    expect(asked.saved).toEqual([]);
+    expect(asked.asks).toEqual([gible]);
+    // Ticked: replaced. The reporter's own report is corrected without asking.
+    const ticked = await report(service, BELDUM, REPORTER, [reportedStop(1)], [gible.id]);
+    expect(ticked.saved[0]?.replaced?.id).toBe(gible.id);
+    expect(await service.contested(REPORT_SERVER, [reportedStop(1)], GIBLE, REPORTER.id)).toEqual(
+      [],
+    );
+    expect((await report(service, GIBLE)).saved).toHaveLength(1);
+    expect(news).toHaveLength(3);
+  });
+
+  it('decides each stop for itself in a report of several', async () => {
+    const { service } = serviceWith();
+    await report(service, GIBLE, OTHER_REPORTER, [reportedStop(1)]);
+    await report(service, BELDUM, OTHER_REPORTER, [reportedStop(2)]);
+    await report(service, ONE_OF, OTHER_REPORTER, [reportedStop(3)]);
+    const outcome = await report(service, GIBLE, REPORTER, [
+      reportedStop(1),
+      reportedStop(2),
+      reportedStop(3),
+      reportedStop(4),
+    ]);
+    expect(outcome.already.map((one) => one.stop.key)).toEqual([reportedStop(1).key]);
+    expect(outcome.asks.map((one) => one.stop.key)).toEqual([reportedStop(2).key]);
+    expect(outcome.saved.map(({ report: made }) => made.stop.key)).toEqual([
+      reportedStop(3).key,
+      reportedStop(4).key,
+    ]);
+  });
+
+  it('decides under an intra-day event only against the window’s own report (R15)', async () => {
+    const { service, clock } = serviceWith([PAWNIARD_DAY]);
+    await report(service, GIBLE, OTHER_REPORTER);
+    clock.now = at('2026-11-21T15:00');
+    const during = await report(service, BELDUM);
+    expect(during.saved.map(({ replaced }) => replaced)).toEqual([undefined]);
+    expect(await service.contested(REPORT_SERVER, [reportedStop(1)], GIBLE, REPORTER.id)).toEqual(
+      [],
+    );
+  });
+});
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index 2b62d0df44fc35707b257678c6ad2473fd317409..a2139f4884e1d536cfa43b2c43df809882af5068 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -1,5 +1,12 @@
 import type { StopReportStorage } from '../db/repositories/stop-report-repository.js';
 import { isHideout, parseRocketKey } from '../domain/rocket/lineups.js';
+import {
+  decideResearch,
+  type ResearchAt,
+  type ResearchDecision,
+  type StandingResearch,
+} from '../domain/research/reports.js';
+import type { TaskReward } from '../domain/research/task.js';
 import { decideRocket, rocketDay, type RocketDecision } from '../domain/rocket/reports.js';
 import {
   isResearchReport,
@@ -28,23 +35,33 @@ export interface SavedAtStop {
   replaced: ResearchReport | undefined;
 }
 
-/** What came of a research report at one or more stops. */
+/**
+ * What came of a research report at one or more stops (plan 8R-5, R8): each stop is saved, or
+ * reported already (the same version stands, or one that says more: `decideResearch`), or asks
+ * (another's report stands that it contradicts, and the member did not say to replace it, R7).
+ */
 export interface ResearchOutcome {
   period: ResearchPeriod;
-  /** One per stop, in the order given. */
+  /** One per stop saved, in the order given. */
   saved: SavedAtStop[];
+  /** The reports standing at the stops reported already, in the order given. */
+  already: ResearchReport[];
+  /** The reports standing at the stops that ask first, in the order given. */
+  asks: ResearchReport[];
 }
 
 /**
  * Reports at stops that are news to members who want what they reward (plan 8R-1; design 7):
  * those whose stop had no report of the same subject in the period before (a report of the same
- * task again is no news), with the period and who reported.
+ * task again is no news), with the period and who reported; and (plan 8R-5) the reports they
+ * replaced, so that the notifier tells a narrowing of a "one of" from a first report.
  */
 export interface ResearchNews {
   serverId: string;
   reports: ResearchReport[];
   reporter: Reporter;
   period: ResearchPeriod;
+  replaced: ResearchReport[];
 }
 
 /** What a Rocket report is of (plan 8R-2): who (`rocketKey`) and what it says. */
@@ -115,6 +132,12 @@ export interface StopReportServiceOptions {
   now?: () => number;
   /** How long a grunt's report stands (`settings.rocket.gruntMinutes`). Default 30 minutes. */
   gruntMs?: number;
+  /**
+   * A research reward's hash (`rewardHash` with the game data's catalogue, which tells a costume:
+   * plan 8R-5), by which a "one of" is found to hold a reward. Required (review L5): without the
+   * catalogue no reward is costumed, and a costumed reward over its "one of" would ask.
+   */
+  rewardHash: (reward: TaskReward) => string;
 }
 
 /**
@@ -133,9 +156,59 @@ export class StopReportService {
   private readonly gruntMs: number;
   private readonly listeners: StopReportListener[] = [];
 
+  private readonly rewardHash: (reward: TaskReward) => string;
+
   constructor(private readonly options: StopReportServiceOptions) {
     this.now = options.now ?? (() => Date.now());
     this.gruntMs = options.gruntMs ?? GRUNT_MS;
+    this.rewardHash = options.rewardHash;
+  }
+
+  /** What `decideResearch` reads of a research subject: its key and its rewards' hashes. */
+  private researchAt(subject: {
+    subjectKey: string;
+    research: Pick<ResearchDetail, 'rewards'>;
+  }): ResearchAt {
+    return {
+      subjectKey: subject.subjectKey,
+      hashes: subject.research.rewards.map((reward) => this.rewardHash(reward)),
+    };
+  }
+
+  /** What `decideResearch` reads of the research report standing at a stop. */
+  private standingResearch(report: ResearchReport): StandingResearch {
+    return {
+      ...this.researchAt(report),
+      id: report.id,
+      endsAt: report.endsAt,
+      reporterId: report.reporter.id,
+    };
+  }
+
+  /**
+   * The reports a research report would contradict at these stops, of the period on now (R7,
+   * R15): another member's that it neither narrows, nor says less than, nor repeats. Read without
+   * a lock, so that a member is asked before anything is reported; `reportResearch` decides
+   * again with each stop's row locked.
+   */
+  async contested(
+    serverId: string,
+    stops: readonly ReportedStop[],
+    subject: ResearchSubject,
+    by: string,
+  ): Promise<ResearchReport[]> {
+    const now = this.now();
+    const period = this.period(now);
+    const standing = (await this.standing(serverId))
+      .filter(isResearchReport)
+      .filter((report) => report.periodKey === period.key);
+    const asked = this.researchAt(subject);
+    return stops.flatMap((stop) => {
+      const there = standing.find((report) => report.stop.key === stop.key);
+      return there && decideResearch(this.standingResearch(there), asked, now, by) === 'asks'
+        ? [there]
+        : [];
+    });
   }
 
   /** Adds a listener; it must not throw (what it throws is logged). */
@@ -193,32 +266,71 @@ export class StopReportService {
   }
 
   /**
-   * Reports a task at these stops (one to five, each once) in the period on now: each in the
-   * place of the stop's report of the period. Throws what storing throws; a stop stored before
-   * the failure stays reported (each is a transaction of its own).
+   * Reports a version of a task at these stops (one to five, each once) in the period on now:
+   * each as `decideResearch` decides with the stop's row locked (`saveUnless`; plan 8R-5, R8): in
+   * the place of the stop's report of the period where it narrows it, contradicts the member's
+   * own, or one the member said to replace (`replacing`, R7); reported already where the same
+   * version stands or one that says more; asking where it contradicts another's report. Throws
+   * what storing throws; a stop stored before the failure stays reported (each is a transaction
+   * of its own).
    */
   async reportResearch(input: {
     serverId: string;
     stops: readonly ReportedStop[];
     subject: ResearchSubject;
     reporter: Reporter;
+    replacing?: readonly number[];
   }): Promise<ResearchOutcome> {
     const madeAt = this.now();
     const period = this.period(madeAt);
     const saved: SavedAtStop[] = [];
+    const already: ResearchReport[] = [];
+    const asks: ResearchReport[] = [];
+    const asked = this.researchAt(input.subject);
     try {
       for (const stop of input.stops) {
-        const { report, replaced } = await this.options.store.save({
-          serverId: input.serverId,
-          kind: 'research',
-          stop,
-          periodKey: period.key,
-          endsAt: period.end,
-          subjectKey: input.subject.subjectKey,
-          research: input.subject.research,
-          reporter: input.reporter,
-          madeAt,
-        });
+        // Set by the decision inside the transaction (an object: a closure's write is not narrowed).
+        const decided: { decision: ResearchDecision } = { decision: 'new' };
+        const outcome = await this.options.store.saveUnless(
+          {
+            serverId: input.serverId,
+            kind: 'research',
+            stop,
+            periodKey: period.key,
+            endsAt: period.end,
+            subjectKey: input.subject.subjectKey,
+            research: input.subject.research,
+            reporter: input.reporter,
+            madeAt,
+          },
+          (standing) => {
+            if (!isResearchReport(standing)) return 'replace';
+            decided.decision = decideResearch(
+              this.standingResearch(standing),
+              asked,
+              madeAt,
+              input.reporter.id,
+              input.replacing,
+            );
+            switch (decided.decision) {
+              case 'less':
+              case 'again':
+              case 'asks':
+                return 'keep';
+              case 'new':
+              case 'narrow':
+              case 'correct':
+                return 'replace';
+            }
+          },
+        );
+        if (!outcome.saved) {
+          const { standing } = outcome;
+          if (!isResearchReport(standing)) throw new Error('a research report met another kind');
+          (decided.decision === 'asks' ? asks : already).push(standing);
+          continue;
+        }
+        const { report, replaced } = outcome;
         // A report replaces only one of its own kind (the identity has the kind).
         if (!isResearchReport(report)) throw new Error('a research report was saved as another');
         saved.push({
@@ -235,16 +347,15 @@ export class StopReportService {
       }
     }
     // A stop that had this very task reported in the period is no news (design 7).
-    const news = saved
-      .filter(({ replaced }) => replaced?.subjectKey !== input.subject.subjectKey)
-      .map(({ report }) => report);
+    const news = saved.filter(({ replaced }) => replaced?.subjectKey !== input.subject.subjectKey);
     if (news.length > 0) {
       this.tell((listener) =>
         listener.reported?.({
           serverId: input.serverId,
-          reports: news,
+          reports: news.map(({ report }) => report),
           reporter: input.reporter,
           period,
+          replaced: news.flatMap(({ replaced }) => (replaced ? [replaced] : [])),
         }),
       );
     }
@@ -254,11 +365,13 @@ export class StopReportService {
         by: input.reporter.id,
         stops: saved.length,
         replaced: saved.filter(({ replaced }) => replaced !== undefined).length,
+        already: already.length,
+        asks: asks.length,
         period: period.key,
       },
       'field research reported',
     );
-    return { period, saved };
+    return { period, saved, already, asks };
   }
 
   /**
diff --git a/test/support/research.ts b/test/support/research.ts
index e9ea7eebeb75b634370b8d4567d3a745eaa04dad..bb918d2fe9270235187d0e147838a3240bd33247 100644
--- a/test/support/research.ts
+++ b/test/support/research.ts
@@ -2,6 +2,7 @@ import { readFileSync } from 'node:fs';
 import path from 'node:path';
 import { parseResearchPage } from '../../src/domain/research/leekduck.js';
 import type { ResearchTask } from '../../src/domain/research/task.js';
+import { versionIndex, type VersionIndex } from '../../src/domain/research/versions.js';
 import type { ResearchTaskProvider } from '../../src/services/research-task-service.js';
 import { catalogueFixture } from './game-data.js';
 
@@ -36,12 +37,16 @@ export function researchTasksFixture(
 ): ResearchTaskProvider {
   // Read when first asked: most contexts never ask.
   let byKey: Map<string, ResearchTask> | undefined;
+  let versions: VersionIndex | undefined;
   const tasks = (): readonly ResearchTask[] => given ?? researchTasksOfPage();
+  const index = (): VersionIndex => (versions ??= versionIndex(tasks(), catalogueFixture()));
   return {
     tasks,
     byKey: (key) => (byKey ??= new Map(tasks().map((task) => [task.key, task]))).get(key),
     readAt: () => readAt ?? undefined,
     stale: (now) => readAt === null || now - readAt >= staleAfterHours * 3_600_000,
+    versions: (task) => index().of(task),
+    byVersion: (value) => index().byValue(value),
   };
 }
 
diff --git a/test/support/stop-report-cases.ts b/test/support/stop-report-cases.ts
index 4dd5c78aebd9577a66041807e8e777e26bc21199..938985adc73f4e5cf763691ab720b659c2ce01b5 100644
--- a/test/support/stop-report-cases.ts
+++ b/test/support/stop-report-cases.ts
@@ -353,4 +353,30 @@ export function stopReportCases(made: () => Promise<StopReportStorage>): void {
       research: { text, category: null, typed: true, rewards: [DRATINI] },
     });
   });
+
+  it('keeps a research version, and what stands where the decision keeps it (plan 8R-5)', async () => {
+    const store = await made();
+    const task = taskKeyOf('Win 3 raids in the rain');
+    // The longest subject: a typed task's version.
+    const typed = `typed:${task}:0123abcd`;
+    const { report: standing } = await store.save(researchReport({ subjectKey: typed }));
+    const asked: string[] = [];
+    const kept = await store.saveUnless(
+      researchReport({ subjectKey: `${task}:89abcdef`, reporter: OTHER_REPORTER }),
+      (there) => {
+        asked.push(there.subjectKey);
+        return 'keep';
+      },
+    );
+    expect(asked).toEqual([typed]);
+    expect(kept).toEqual({ saved: false, standing });
+    const replaced = await store.saveUnless(
+      researchReport({ subjectKey: `${task}:89abcdef`, reporter: OTHER_REPORTER }),
+      () => 'replace',
+    );
+    expect(replaced).toMatchObject({ saved: true, replaced: standing });
+    expect((await store.standing(REPORT_SERVER, REPORT_NOW)).map((one) => one.subjectKey)).toEqual([
+      `${task}:89abcdef`,
+    ]);
+  });
 }
diff --git a/test/support/stop-reporting.ts b/test/support/stop-reporting.ts
index eb824699cd5f6416aa01d4ad1661ba34c7a04ccc..0551709b16c93cc865bb6d37b5d00fa98e254356 100644
--- a/test/support/stop-reporting.ts
+++ b/test/support/stop-reporting.ts
@@ -2,6 +2,7 @@ import type { WayspotRow } from '../../src/domain/wayspots/kept.js';
 import { GruntMessageService } from '../../src/services/grunt-messages.js';
 import { RocketService } from '../../src/services/rocket-reports.js';
 import { StopReportService } from '../../src/services/stop-reports.js';
+import { rewardHash } from '../../src/domain/research/versions.js';
 import { partyServiceWith } from './party-service.js';
 import { MemoryGruntMessages } from './rocket-store.js';
 import { MemoryStopReports } from './stop-reports.js';
@@ -39,6 +40,7 @@ export async function stopReportingWith(rows: readonly WayspotRow[] = STOP_ROWS)
     events: ctx.raidEvents,
     zone: ctx.config.settings.timezone,
     log: ctx.log,
+    rewardHash: (reward) => rewardHash(reward, ctx.gameData.catalogue),
   });
   const gruntStore = new MemoryGruntMessages();
   const grunts = new GruntMessageService({
diff --git a/test/support/stop-reports.ts b/test/support/stop-reports.ts
index ecd8f4d5e666c16225dfcf48752f6bde9cb35b13..01ffcce94b6fdaba6b73879d71fb3d7e212bf97a 100644
--- a/test/support/stop-reports.ts
+++ b/test/support/stop-reports.ts
@@ -5,7 +5,18 @@ import {
   type StandingVerdict,
   type StopReportStorage,
 } from '../../src/db/repositories/stop-report-repository.js';
+import type { TaskReward } from '../../src/domain/research/task.js';
+import { rewardHash } from '../../src/domain/research/versions.js';
 import type { NewStopReport, StopReport } from '../../src/domain/stops/report.js';
+import { catalogueFixture } from './game-data.js';
+
+/**
+ * A research reward's hash with the fixtures' catalogue, which tells a costume: what
+ * `StopReportService` needs as `rewardHash` (plan 8R-5), as the app gives it the game data's.
+ */
+export function fixtureRewardHash(reward: TaskReward): string {
+  return rewardHash(reward, catalogueFixture());
+}
 
 /** Methods a test can make fail (`failing`). */
 type Method = keyof StopReportStorage;
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 6ae72c8684d75b3141a80dcd4e152440abb03a7d..27bb82a23543f282d352e30110dd8a2b2f19e201 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -14,6 +14,7 @@ import { PineStopService } from '../../src/services/pine-stops.js';
 import { WayspotDirectory } from '../../src/services/wayspot-directory.js';
 import { MemoryPineStops } from './pine-stops.js';
 import { StopReportService } from '../../src/services/stop-reports.js';
+import { rewardHash } from '../../src/domain/research/versions.js';
 import { RocketService } from '../../src/services/rocket-reports.js';
 import { MemoryStopReports } from './stop-reports.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
@@ -290,6 +291,7 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       events: ctx.raidEvents,
       zone: ctx.config.settings.timezone,
       log,
+      rewardHash: (reward) => rewardHash(reward, ctx.gameData.catalogue),
     });
   }
   if (overrides.rocket === undefined) {
````

### Task 3: 8R-5 task 3: Reporting one version with the research command

Prototype commit: `cdc3d17946b4773b3e612eb4c917b5b336d34159`

The task option offers a choice per version, the typed words found across the
task's text and the reward ("one of" with the reward typed first); readTask
takes a version, or a task's key or text with its reward (the only reward,
else "one of", else "pick the reward"); a typed task with its reward is a
version of it. The answer says "(was: one of ...)" and the reward a correction
replaced, and "Already reported" with the pinned post's link
(ctx.stopPostLinks); with every stop reported already it has no Take back nor
more stops. A contradiction of other members' reports opens a dialog of
unticked checkboxes per contested stop (what stands, who, when): Submit reports
at every stop, the ticked ones replaced. "Same task at more stops..." carries
its version in its custom id and leaves out, for "one of", stops of any version
of the task; it asks in the same dialog.

**Files:**

```
 src/app-context.ts                       |   6 +
 src/app.ts                               |   4 +
 src/commands/research/research-input.ts  | 149 +++++++++++++++++----
 src/commands/research/research-report.ts |  33 ++++-
 src/commands/research/research.test.ts   | 508 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/commands/research/research.ts        | 372 ++++++++++++++++++++++++++++++++++++++++++++++------
 src/domain/research/versions.ts          |   5 +-
 src/render/research.test.ts              |   2 +-
 src/render/research.ts                   |  86 ++++++++++--
 src/web/stop-report-post.test.ts         |   2 +-
 test/support/fake-interactions.ts        |   9 +-
 test/support/test-context.ts             |   2 +
 12 files changed, 1078 insertions(+), 100 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/research/research.test.ts src/render/research.test.ts src/web/stop-report-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff cdc3d17946b4773b3e612eb4c917b5b336d34159 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-5 task 3: Reporting one version with the research command`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 5b820d8a251d1396721c13b072901313e19e8b21..54440928d235da4122d33730e017f0313676c7d6 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -95,6 +95,12 @@ export interface AppContext {
   readonly rocketLineups: RocketLineupProvider;
   /** Reports at stops (plan 8R-1): field research, in research periods. */
   readonly stopReports: StopReportService;
+  /**
+   * The message of a region channel's pinned post "Today at the stops" that holds a subject, as
+   * last drawn (`StopPostService.linkOf`; plan 8R-5: "Already reported" links it); none in
+   * rehearsal mode, which makes no posts.
+   */
+  readonly stopPostLinks: { linkOf(channelId: string, subjectKey: string): string | undefined };
   /**
    * Reporting Team GO Rocket (plan 8R-2): the report, the grunt's messages (none in rehearsal
    * mode), the notifier.
diff --git a/src/app.ts b/src/app.ts
index 51633922d9e4a37533bb80cf6abfbfb7f63e55c4..a5d29fc295ea99a0457ffbfafe744a9f0d03dc9c 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -831,6 +831,10 @@ export async function startApp(
     eventSpawns,
     rocketLineups,
     stopReports,
+    // The pinned posts made below (none in rehearsal mode), as last drawn.
+    stopPostLinks: {
+      linkOf: (channelId, subjectKey) => researchPostLinks.posts?.linkOf(channelId, subjectKey),
+    },
     rocket,
     gyms,
     gymAdmin,
diff --git a/src/commands/research/research-input.ts b/src/commands/research/research-input.ts
index 22d57ada1d0d6a396ef746df3e170574bc5ca1a9..49e1286bbd2bda01cc5b426028655709ae52ba4a 100644
--- a/src/commands/research/research-input.ts
+++ b/src/commands/research/research-input.ts
@@ -12,11 +12,17 @@ import {
   isItemKey,
   isTaskKey,
   MAX_TYPED_TASK,
-  rewardsInShort,
   taskKeyOf,
   type ResearchTask,
   type TaskReward,
 } from '../../domain/research/task.js';
+import { researchSubjectOf } from '../../domain/research/reports.js';
+import {
+  oneOfLabel,
+  rewardHash,
+  versionValue,
+  type TaskVersion,
+} from '../../domain/research/versions.js';
 import { typedSubject, type ReportedStop } from '../../domain/stops/report.js';
 import { searchTokens } from '../../domain/search/text.js';
 import { plain, truncate } from '../../render/text.js';
@@ -140,29 +146,52 @@ function hasWords(text: string, words: readonly string[]): boolean {
   return words.every((word) => own.some((one) => one.startsWith(word)));
 }
 
-/** A task as a choice: `Make 2 Excellent Throws · Dratini, Bagon, Axew +4`, its key the value. */
-export function taskChoice(task: ResearchTask): Choice {
-  const rewards = rewardsInShort(task.rewards);
-  const suffix = rewards === '' ? '' : ` · ${rewards}`;
+/**
+ * A version of a task as a choice (plan 8R-5): `Make 3 Excellent Throws in a row · Gible`,
+ * `… · one of Gible, Larvitar, Beldum`, its value the version's (`<task>:<hash>`, the task's key
+ * for "one of"); the task's text cut first.
+ */
+export function versionChoice(task: ResearchTask, label: string, value: string): Choice {
+  const suffix = label === '' ? '' : ` · ${label}`;
   const room = CHOICE_NAME - Math.min(suffix.length, CHOICE_NAME - 30);
-  return { name: truncate(`${truncate(task.text, room)}${suffix}`, CHOICE_NAME), value: task.key };
+  return { name: truncate(`${truncate(task.text, room)}${suffix}`, CHOICE_NAME), value };
 }
 
 /**
- * The choices of the `task` option (design 4.3): the period's tasks whose text has every typed
- * word (as the beginning of a word), then those that have them among their rewards' names
- * (`dratini` finds "Make 2 Excellent Throws · Dratini"), each in the list's order.
+ * The choices of the `task` option (design 4.3; plan 8R-5, design point 3 and R12): a choice per
+ * version of the period's tasks, in the list's order; with words typed, first every version of
+ * the tasks whose text has every word (as the beginning of a word), then the versions that have
+ * them across the task's text and their rewards' names together (`excellent gible` finds "Make 3
+ * Excellent Throws in a row · Gible" and its "one of"), a "one of" naming the rewards typed first.
  */
-export function taskChoices(ctx: Pick<AppContext, 'researchTasks'>, typed: string): Choice[] {
+export function taskChoices(
+  ctx: Pick<AppContext, 'researchTasks' | 'gameData'>,
+  typed: string,
+): Choice[] {
   const words = searchTokens(typed);
-  const tasks = ctx.researchTasks.tasks();
-  const byText = tasks.filter((task) => hasWords(task.text, words));
-  const byReward = tasks.filter(
-    (task) =>
-      !byText.includes(task) &&
-      hasWords(task.rewards.map((reward) => reward.name).join(' '), words),
-  );
-  return [...byText, ...byReward].slice(0, MAX_CHOICES).map(taskChoice);
+  const byText: Choice[] = [];
+  const byReward: Choice[] = [];
+  for (const task of ctx.researchTasks.tasks()) {
+    const whole = hasWords(task.text, words);
+    for (const version of ctx.researchTasks.versions(task)) {
+      const names = version.rewards.map((reward) => reward.name);
+      if (whole) {
+        byText.push(versionChoice(task, version.label, version.value));
+      } else if (hasWords(`${task.text} ${names.join(' ')}`, words)) {
+        // "One of" with the rewards typed first (R12).
+        const label = version.oneOf
+          ? oneOfLabel(
+              version.rewards,
+              (reward) =>
+                searchTokens(reward.name).some((own) => words.some((w) => own.startsWith(w))),
+              ctx.gameData.catalogue,
+            )
+          : version.label;
+        byReward.push(versionChoice(task, label, version.value));
+      }
+    }
+  }
+  return [...byText, ...byReward].slice(0, MAX_CHOICES);
 }
 
 /** The items and the Mega Energy of the task list, by key: what `reward:` and `/want` offer. */
@@ -267,12 +296,17 @@ function encounterOf(entry: { key: string; dex: number; name: string }): TaskRew
   };
 }
 
+/** Said of a task of several rewards named without its reward, and no "one of" (R2). */
+export const PICK_THE_REWARD =
+  'That task has several rewards: pick the task with its reward from the list that appears ' +
+  'while you type.';
+
 /**
- * The task `task:` names (design 4.3, 9.8): a choice of the list (its key; one no longer on the
- * list is `TASK_LIST_CHANGED`), or typed text, which is the list's task of the same folded text,
+ * The task `task:` names (design 4.3, 9.8; plan 8R-5, R2): a version of the list
+ * (`<task>:<hash>`; one no longer on the list is `TASK_LIST_CHANGED`), a task's key or typed text
+ * that is the list's task of the same folded text (`listedVersion`: its version by `reward`),
  * else a task typed in full (at most `MAX_TYPED_TASK` characters), whose `reward` is the only
- * reward that makes wants fire. A reward given with a task of the list says nothing more: the
- * list knows its rewards.
+ * reward that makes wants fire: `typed:<text key>`, with the reward's hash after it (R11).
  */
 export function readTask(
   ctx: Pick<AppContext, 'researchTasks' | 'pokemon' | 'gameData'>,
@@ -280,16 +314,22 @@ export function readTask(
   reward: string | null,
 ): ResearchSubject {
   const text = tidyLine(value);
+  const subject = researchSubjectOf(text);
+  if (subject?.hash !== undefined && !subject.task.startsWith('typed:')) {
+    const found = ctx.researchTasks.byVersion(text);
+    if (!found) throw new UserError(TASK_LIST_CHANGED);
+    return versionSubject(found.task, found.version);
+  }
   if (isTaskKey(text)) {
     const task = ctx.researchTasks.byKey(text);
     if (!task) throw new UserError(TASK_LIST_CHANGED);
-    return listed(task);
+    return listedVersion(ctx, task, reward);
   }
   if (text === '')
     throw new UserError('Say which task: pick one from the list that appears while you type.');
   const key = taskKeyOf(text);
   const known = ctx.researchTasks.byKey(key);
-  if (known) return listed(known);
+  if (known) return listedVersion(ctx, known, reward);
   if (text.length > MAX_TYPED_TASK) {
     throw new UserError(
       `A task you type may have ${String(MAX_TYPED_TASK)} characters: pick it from the list ` +
@@ -297,15 +337,68 @@ export function readTask(
     );
   }
   const rewards = reward === null || reward.trim() === '' ? [] : [readReward(ctx, reward)];
+  const [only] = rewards;
   return {
-    subjectKey: typedSubject(key),
+    subjectKey: versionValue(
+      typedSubject(key),
+      only === undefined ? undefined : rewardHash(only, ctx.gameData.catalogue),
+    ),
     research: { text, category: null, rewards, typed: true },
   };
 }
 
-function listed(task: ResearchTask): ResearchSubject {
+/**
+ * The version of a listed task named without its version (R2): with `reward`, the version of
+ * that reward (a plain one before a costumed one; refused where the task does not give it, and
+ * with `PICK_THE_REWARD` where two versions fit alike);
+ * without, its only version, else its "one of", else refused with `PICK_THE_REWARD`.
+ */
+function listedVersion(
+  ctx: Pick<AppContext, 'researchTasks' | 'pokemon' | 'gameData'>,
+  task: ResearchTask,
+  reward: string | null,
+): ResearchSubject {
+  const versions = ctx.researchTasks.versions(task);
+  if (reward === null || reward.trim() === '') {
+    const [only, ...more] = versions;
+    const chosen =
+      only !== undefined && more.length === 0 ? only : versions.find((one) => one.oneOf);
+    if (!chosen) throw new UserError(PICK_THE_REWARD);
+    return versionSubject(task, chosen);
+  }
+  const named = readReward(ctx, reward);
+  const matching = versions.filter(
+    (one) => !one.oneOf && one.rewards.length === 1 && sameReward(one.rewards[0], named),
+  );
+  if (matching.length === 0) {
+    throw new UserError(
+      `${plain(truncate(task.text, 100))} does not give ${plain(named.name)}: pick the reward ` +
+        'from the list.',
+    );
+  }
+  // The plain version before a costumed one; two that fit alike (Rare Candy ×1 and ×3) are
+  // refused, never one taken silently (review L7).
+  const plainOnes = matching.filter((one) => !one.costumed);
+  const [chosen, ...others] = plainOnes.length > 0 ? plainOnes : matching;
+  if (!chosen || others.length > 0) throw new UserError(PICK_THE_REWARD);
+  return versionSubject(task, chosen);
+}
+
+/** Whether a reward of the list is the one a member named (`readReward`, without a quantity). */
+function sameReward(listedOne: TaskReward | undefined, named: TaskReward): boolean {
+  if (listedOne === undefined) return false;
+  if (listedOne.kind === 'encounter' && named.kind === 'encounter') {
+    return listedOne.key !== null && listedOne.key === named.key;
+  }
+  if (listedOne.kind === 'item' && named.kind === 'item') return listedOne.item === named.item;
+  if (listedOne.kind === 'energy' && named.kind === 'energy') return listedOne.dex === named.dex;
+  return false;
+}
+
+/** A version of a listed task as a report's subject. */
+export function versionSubject(task: ResearchTask, version: TaskVersion): ResearchSubject {
   return {
-    subjectKey: task.key,
-    research: { text: task.text, category: task.category, rewards: task.rewards, typed: false },
+    subjectKey: version.value,
+    research: { text: task.text, category: task.category, rewards: version.rewards, typed: false },
   };
 }
diff --git a/src/commands/research/research-report.ts b/src/commands/research/research-report.ts
index 7e06e5aa6a5876ca476b50ccb53ad2bb4b2cf440..ca2c1291a0b04a6caa9375811fc9ff0cfd7b85dc 100644
--- a/src/commands/research/research-report.ts
+++ b/src/commands/research/research-report.ts
@@ -8,6 +8,7 @@ import {
   stopLine,
   type ResearchWordsView,
 } from '../../render/research.js';
+import { postLink } from '../../render/notify-dm.js';
 import { endSentence } from '../../render/text.js';
 import type { ReportRef, ResearchOutcome, ResearchSubject } from '../../services/stop-reports.js';
 
@@ -43,7 +44,7 @@ export const NOTHING_LEFT =
 /** What a research report from a member reads and calls (`/research` and the map). */
 export type ResearchReporting = Pick<
   AppContext,
-  'stopReports' | 'guilds' | 'regions' | 'wayspots' | 'config' | 'rehearsal'
+  'stopReports' | 'stopPostLinks' | 'guilds' | 'regions' | 'wayspots' | 'config' | 'rehearsal'
 >;
 
 /** A reporter by id and the name shown (else the account's), cut to what is kept. */
@@ -113,11 +114,15 @@ async function postChannels(
   ];
 }
 
-/** What a research report from a member is: the task, the stops (one to five), who reports. */
+/**
+ * What a research report from a member is: the version of a task, the stops (one to five), who
+ * reports, and the reports the member said to replace (plan 8R-5, R7: the stops they ticked).
+ */
 export interface ResearchAsk {
   stops: readonly ReportedStop[];
   subject: ResearchSubject;
   reporter: Reporter;
+  replacing?: readonly number[];
 }
 
 /** What came of it: the service's outcome, and the view its words are made of. */
@@ -141,10 +146,19 @@ export async function reportResearchAs(
 ): Promise<ResearchReported> {
   const outcome = await ctx.stopReports.reportResearch({ serverId, ...ask });
   const stops = outcome.saved.map(({ report }) => report.stop);
+  // A contradiction met after the member was asked (or after the check before) keeps its report:
+  // it is said as reported already (R7, R8).
+  const already = await Promise.all(
+    [...outcome.already, ...outcome.asks].map(async (report) => ({
+      report,
+      link: await postLinkOf(ctx, serverId, report),
+    })),
+  );
   return {
     outcome,
     view: {
       saved: outcome.saved,
+      already,
       channels: await postChannels(ctx, serverId, stops),
       until: periodEndWords(outcome.period.end, Date.now(), ctx.config.settings.timezone),
       // Rehearsal mode makes no pinned post (B10).
@@ -154,6 +168,21 @@ export async function reportResearchAs(
   };
 }
 
+/**
+ * The link to the message of the pinned post that holds a report (R8), in the first region
+ * channel its stop lies in; undefined where none holds it (rehearsal mode: no posts).
+ */
+export async function postLinkOf(
+  ctx: Pick<AppContext, 'guilds' | 'regions' | 'wayspots' | 'stopPostLinks'>,
+  serverId: string,
+  report: StopReport,
+): Promise<string | undefined> {
+  const [channelId] = await postChannels(ctx, serverId, [report.stop]);
+  if (channelId === undefined) return undefined;
+  const messageId = ctx.stopPostLinks.linkOf(channelId, report.subjectKey);
+  return messageId === undefined ? undefined : postLink(serverId, channelId, messageId);
+}
+
 /** What a report taken back was: `Took back **Catch 7 Pokémon** at **Yellow Mural**.` */
 export function tookBackWords(report: StopReport): string {
   return endSentence(`Took back **${reportSubject(report)}** at ${stopLine(report.stop)}`);
diff --git a/src/commands/research/research.test.ts b/src/commands/research/research.test.ts
index f39a313df33e926b8f0a5f569621911ede2adb18..9f0a525a289565b1c5464e5a36689c27ab2e8d30 100644
--- a/src/commands/research/research.test.ts
+++ b/src/commands/research/research.test.ts
@@ -1,9 +1,12 @@
-import { describe, expect, it } from 'vitest';
+import { DateTime } from 'luxon';
+import { describe, expect, it, vi } from 'vitest';
 import { answerOf, buttonId, buttonsOf, said } from '../../../test/support/gym-commands.js';
 import {
   fakeAutocomplete,
   fakeButton,
   fakeChatInput,
+  fakeMessage,
+  fakeModal,
   fakeSelect,
   asV2,
   FAKE_GUILD_ID,
@@ -12,12 +15,15 @@ import {
 } from '../../../test/support/fake-interactions.js';
 import { UNBOUNDED_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { selectsOf } from '../../../test/support/messages.js';
-import { pageTask } from '../../../test/support/research.js';
+import { dialogField, dialogText, shownDialog } from '../../../test/support/dialogs.js';
+import { pageTask, researchTasksFixture } from '../../../test/support/research.js';
 import { MemoryStopReports, fixtureRewardHash } from '../../../test/support/stop-reports.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
 import { wayspotsWith } from '../../../test/support/wayspots.js';
 import type { WayspotRow } from '../../domain/wayspots/kept.js';
+import { taskKeyOf, type ResearchTask, type TaskReward } from '../../domain/research/task.js';
+import { DIALOG_READ_MS, SLOW_READ } from '../../discord/dialog.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { Throttles } from '../../discord/throttle.js';
 import { StopReportService } from '../../services/stop-reports.js';
@@ -25,10 +31,13 @@ import {
   NO_STOP_AT_PIN,
   NO_STOPS_HERE,
   NOT_A_STOP,
+  PICK_THE_REWARD,
+  readTask,
   RESEARCH_FROM_A_REGION,
   TASK_LIST_CHANGED,
 } from './research-input.js';
 import { Rehearsal } from '../../services/rehearsal.js';
+import { stopsByKey } from './research-report.js';
 import {
   NOT_YOUR_REPORT,
   REPORT_CHANGED,
@@ -115,6 +124,14 @@ async function setup(rows: readonly WayspotRow[] = STOPS) {
           ...extra,
         }),
       ),
+    submit: (
+      dialog: { custom_id: string },
+      checked: Record<string, string[]>,
+      extra: FakeOptions = {},
+    ) =>
+      handled(
+        fakeModal({ customId: dialog.custom_id, form: dialog, checked, ...as(ASH), ...extra }),
+      ),
     typing: (focusedName: string, focused: string) =>
       handled(
         fakeAutocomplete({
@@ -126,6 +143,7 @@ async function setup(rows: readonly WayspotRow[] = STOPS) {
         }),
       ),
     as,
+    handled,
   };
 }
 
@@ -155,7 +173,8 @@ describe('/research report', () => {
     );
     expect(said(answer)).toContain('### Field research reported');
     expect(said(answer)).toContain(
-      '**Catch a Dragon-type Pokémon** · one of Dratini, Bagon, Axew +4',
+      // The task's key alone is its "one of": its encounters only (plan 8R-5).
+      '**Catch a Dragon-type Pokémon** · one of Dratini, Bagon, Axew',
     );
     expect(said(answer)).toContain('- **Yellow Mural**\n- **Paititi Inti**');
     expect(said(answer)).toContain(
@@ -241,10 +260,13 @@ describe('/research report', () => {
       name: string;
       value: string;
     }[];
-    expect(choices).toContainEqual({
-      name: 'Catch a Dragon-type Pokémon · Dratini, Bagon, Axew +4',
-      value: DRAGON.key,
-    });
+    // A choice per version that holds Dratini (plan 8R-5), in the list's order.
+    expect(choices.map((choice) => choice.name)).toEqual([
+      'Catch a Dragon-type Pokémon · Dratini',
+      'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew',
+      'Make 2 Excellent Throws · Dratini',
+    ]);
+    expect(choices[1]?.value).toBe(DRAGON.key);
     const stops = (await made.typing('stop2', 'mural')).respond.mock.calls[0]?.[0];
     expect(stops?.map((one) => one.value)).toEqual([stop(1)]);
   });
@@ -275,9 +297,9 @@ describe('the controls of /research report’s answer', () => {
     const first = answerOf(await made.report({ task: DRAGON.key, stop: stop(1) }));
     await replaceAsMisty(made);
     const [menu] = selectsOf(asV2(first));
-    expect(said(answerOf(await made.pick(menu?.customId ?? '', [wayspotId(3)])))).toBe(
-      REPORT_ENDED,
-    );
+    // A menu of before plan 8R-5, without the version it reports (R14), reports its first one's.
+    const before = (menu?.customId ?? '').split(':').slice(0, 3).join(':');
+    expect(said(answerOf(await made.pick(before, [wayspotId(3)])))).toBe(REPORT_ENDED);
     const taken = answerOf(await made.press(buttonId(first, 'Take back')));
     expect(said(taken)).toBe(
       'There was nothing left to take back: the report has ended, was taken back, or was replaced by a newer one.',
@@ -339,3 +361,469 @@ describe('/research in rehearsal mode', () => {
     expect(said(answer)).toContain('-# It stands until midnight.');
   });
 });
+
+describe('/research report and the versions of a task (plan 8R-5)', () => {
+  const THROWS = pageTask('Make 3 Excellent Throws in a row');
+  const version = (label: string): string => {
+    const found = researchTasksFixture()
+      .versions(THROWS)
+      .find((one) => one.label === label);
+    if (!found) throw new Error(`no version ${label}`);
+    return found.value;
+  };
+  const GIBLE = version('Gible');
+  const BELDUM = version('Beldum');
+  type Choices = { name: string; value: string }[];
+
+  it('offers a choice per version, the typed words found across the task and its reward', async () => {
+    const made = await setup();
+    const choices = (await made.typing('task', 'excellent gible')).respond.mock
+      .calls[0]?.[0] as Choices;
+    expect(choices).toEqual([
+      { name: 'Make 3 Excellent Throws in a row · Gible', value: GIBLE },
+      // "One of" with the reward typed first (R12).
+      {
+        name: 'Make 3 Excellent Throws in a row · one of Gible, Larvitar, Beldum',
+        value: THROWS.key,
+      },
+    ]);
+  });
+
+  it('reads the version a choice, a key or a text with its reward names (R2)', () => {
+    const { ctx } = createTestContext();
+    const subject = (task: string, reward: string | null = null) =>
+      readTask(ctx, task, reward).subjectKey;
+    expect(subject(GIBLE)).toBe(GIBLE);
+    expect(subject(THROWS.key, 'gible')).toBe(GIBLE);
+    expect(subject('make 3 excellent throws in a row', 'Gible')).toBe(GIBLE);
+    // Without a reward: "one of" of a task of encounters, the only reward of a task of one.
+    expect(subject(THROWS.key)).toBe(THROWS.key);
+    const dratini = pageTask('Make 2 Excellent Throws');
+    expect(subject(dratini.key)).toMatch(new RegExp(`^${dratini.key}:[0-9a-f]{8}$`));
+    // A task of items asks which; a reward it does not give is refused.
+    expect(() => subject(pageTask('Catch a Ditto').key)).toThrow(PICK_THE_REWARD);
+    expect(() => subject(THROWS.key, 'rare candy')).toThrow(
+      'Make 3 Excellent Throws in a row does not give Rare Candy: pick the reward from the list.',
+    );
+    expect(() => subject(`${THROWS.key}:00000000`)).toThrow(TASK_LIST_CHANGED);
+    // A typed task with its reward is a version of it (R11).
+    expect(subject('Win 3 raids in the rain', 'rare candy')).toMatch(
+      /^typed:[0-9a-f]{16}:[0-9a-f]{8}$/,
+    );
+  });
+
+  it('says what "one of" it narrowed', async () => {
+    const made = await setup();
+    await made.report({ task: THROWS.key, stop: stop(1) }, made.as(MISTY));
+    const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
+    expect(said(answer)).toContain('**Make 3 Excellent Throws in a row** · Gible');
+    expect(said(answer)).toContain('- **Yellow Mural** (was: one of Larvitar, Beldum, Gible)');
+  });
+
+  it('answers a version that stands already with its post, and nothing to take back', async () => {
+    const made = await setup();
+    Object.assign(made.ctx, { stopPostLinks: { linkOf: () => '300000000000000077' } });
+    await made.report({ task: GIBLE, stop: stop(1) }, made.as(MISTY));
+    const answer = answerOf(await made.report({ task: THROWS.key, stop: stop(1) }));
+    expect(said(answer)).toMatch(
+      /^Already reported: \*\*Make 3 Excellent Throws in a row\*\* · Gible at \*\*Yellow Mural\*\*, by \*\*Misty\*\* <t:\d+:R>\. https:\/\/discord\.com\/channels\/\d+\/\d+\/300000000000000077$/,
+    );
+    expect(buttonsOf(answer)).toEqual([]);
+    expect(selectsOf(asV2(answer))).toEqual([]);
+    // Beside a stop reported now: the answer as before, the stop reported already said apart.
+    const mixed = answerOf(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }));
+    expect(said(mixed)).toContain('- **Paititi Inti**\nAlready reported:');
+    expect(buttonsOf(mixed).map(([label]) => label)).toEqual(['Take back']);
+  });
+
+  it('asks before contradicting another’s report, replacing only the stops ticked (R7)', async () => {
+    const made = await setup();
+    await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }, made.as(MISTY));
+    const asked = await made.report({
+      task: BELDUM,
+      stop: stop(1),
+      stop2: stop(2),
+      stop3: stop(3),
+    });
+    const dialog = shownDialog(asked);
+    expect(dialog.title).toBe('Replace field research?');
+    expect(dialogText(dialog)).toContain('**Make 3 Excellent Throws in a row** · Beldum');
+    expect(dialogText(dialog)).toContain('at stops you named');
+    // Little Bench has no contest: Submit reports it too (review L4).
+    expect(dialogText(dialog)).toContain('Submit reports at the other stops as well.');
+    const field = dialogField(dialog, 'Replace the report at');
+    expect(field.kind).toBe('group');
+    expect(field.options?.map((option) => [option.label, option.ticked])).toEqual([
+      ['Yellow Mural', false],
+      ['Paititi Inti', false],
+    ]);
+    expect(field.options?.[0]?.description).toMatch(
+      /^Make 3 Excellent Throws in a row · Gible, by Misty at \d{1,2}:\d{2} [AP]M$/,
+    );
+    // Nothing reported before the Submit (Cancel reports nothing).
+    expect(made.store.rows.size).toBe(2);
+    const [first] = [...made.store.rows.values()];
+    const submitted = await made.submit(dialog, { [field.id]: [String(first?.id)] });
+    const answer = said(answerOf(submitted));
+    expect(answer).toContain('- **Yellow Mural** (was: Gible)\n- **Little Bench**');
+    expect(answer).toContain(
+      'Already reported: **Make 3 Excellent Throws in a row** · Gible at **Paititi Inti**',
+    );
+    expect(
+      [...made.store.rows.values()].map((one) => [
+        one.stop.name,
+        one.subjectKey,
+        one.reporter.name,
+      ]),
+    ).toEqual([
+      ['Paititi Inti', GIBLE, 'Misty'],
+      ['Yellow Mural', BELDUM, 'Ash'],
+      ['Little Bench', BELDUM, 'Ash'],
+    ]);
+  });
+
+  it('reports the same version at more stops, also once the first was narrowed (R14)', async () => {
+    const made = await setup();
+    // Gible stands at Paititi Inti: the "one of" of its task is not offered there (R8).
+    await made.report({ task: GIBLE, stop: stop(2) }, made.as(MISTY));
+    const answer = answerOf(await made.report({ task: THROWS.key, stop: stop(1) }));
+    const [menu] = selectsOf(asV2(answer));
+    expect(menu?.options.map((option) => option.label)).toEqual(['Little Bench']);
+    // Misty narrows Yellow Mural meanwhile: the menu still reports "one of".
+    await made.report({ task: GIBLE, stop: stop(1) }, made.as(MISTY));
+    const picked = said(answerOf(await made.pick(menu?.customId ?? '', [wayspotId(3)])));
+    expect(picked).toContain('### Also reported');
+    expect(
+      [...made.store.rows.values()].find((one) => one.stop.name === 'Little Bench')?.subjectKey,
+    ).toBe(THROWS.key);
+  });
+
+  it('reports the version of a menu whose first report was taken back, in its period', async () => {
+    const made = await setup();
+    const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
+    await made.press(buttonId(answer, 'Take back'));
+    const [menu] = selectsOf(asV2(answer));
+    const picked = said(answerOf(await made.pick(menu?.customId ?? '', [wayspotId(3)])));
+    expect(picked).toContain('### Also reported');
+    expect([...made.store.rows.values()].map((one) => [one.stop.name, one.subjectKey])).toEqual([
+      ['Little Bench', GIBLE],
+    ]);
+  });
+
+  it('reports nothing into a new period from a menu whose first report is gone (review L1)', async () => {
+    vi.useFakeTimers({ toFake: ['Date'] });
+    try {
+      const made = await setup();
+      const zone = made.ctx.config.settings.timezone;
+      vi.setSystemTime(DateTime.fromISO('2026-11-21T23:50', { zone }).toMillis());
+      const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
+      const shownAt = Date.now();
+      await made.press(buttonId(answer, 'Take back'));
+      vi.setSystemTime(DateTime.fromISO('2026-11-22T00:10', { zone }).toMillis());
+      const [menu] = selectsOf(asV2(answer));
+      const picked = await made.pick(menu?.customId ?? '', [wayspotId(3)], {
+        message: { ...fakeMessage([]), createdTimestamp: shownAt },
+      });
+      expect(said(answerOf(picked))).toBe(REPORT_ENDED);
+      expect(made.store.rows.size).toBe(0);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  it('asks from the menu too, and its Submit answers "Also reported" (review L4, L10)', async () => {
+    const made = await setup();
+    await made.report({ task: BELDUM, stop: stop(3) }, made.as(MISTY));
+    const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
+    const [menu] = selectsOf(asV2(answer));
+    // Only the contested stop picked: nothing is said of other stops.
+    const alone = shownDialog(await made.pick(menu?.customId ?? '', [wayspotId(3)]));
+    expect(dialogText(alone)).toContain('at a stop you picked');
+    expect(dialogText(alone)).not.toContain('other stops');
+    const asked = shownDialog(await made.pick(menu?.customId ?? '', [wayspotId(3), wayspotId(2)]));
+    expect(dialogText(asked)).toContain('Submit reports at the other stops as well.');
+    const field = dialogField(asked, 'Replace the report at');
+    const [beldum] = [...made.store.rows.values()];
+    const submitted = said(
+      answerOf(await made.submit(asked, { [field.id]: [String(beldum?.id)] })),
+    );
+    expect(submitted).toContain('### Also reported');
+    expect(submitted).toContain('- **Little Bench** (was: Beldum)\n- **Paititi Inti**');
+  });
+
+  it('answers a dialog’s Submit that is another’s, or answered already', async () => {
+    const made = await setup();
+    await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
+    const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1) }));
+    expect(said(answerOf(await made.submit(dialog, {}, made.as(MISTY))))).toBe(
+      'That is somebody else’s report.',
+    );
+    await made.submit(dialog, {});
+    expect(said(answerOf(await made.submit(dialog, {})))).toBe(
+      'That question has expired. Use `/research report` again.',
+    );
+  });
+
+  it('opens no dialog after Discord’s three seconds, and gives the use back', async () => {
+    const made = await setup();
+    made.ctx.config.settings.research.throttle.uses = 1;
+    try {
+      await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
+      const late = await made.report(
+        { task: GIBLE, stop: stop(1) },
+        { createdTimestamp: Date.now() - DIALOG_READ_MS - 100 },
+      );
+      expect(late.showModal).not.toHaveBeenCalled();
+      expect(said(answerOf(late))).toBe(SLOW_READ);
+      // The use was given back: the next one is not refused by the limit.
+      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toContain(
+        '### Field research reported',
+      );
+    } finally {
+      made.ctx.config.settings.research.throttle.uses = 10;
+    }
+  });
+
+  /**
+   * A pick of the menu made past Discord's budget whose read of the stops' reports comes back
+   * only once the press was deferred: the read raced against `DIALOG_READ_MS` (review F1).
+   */
+  async function slowPick(made: Awaited<ReturnType<typeof setup>>, customId: string) {
+    const picked = fakeSelect({
+      customId,
+      values: [wayspotId(3)],
+      v2Message: true,
+      ephemeralMessage: true,
+      ...made.as(ASH),
+      createdTimestamp: Date.now() - DIALOG_READ_MS - 100,
+    });
+    let deferred = (): void => undefined;
+    const isDeferred = new Promise<void>((resolve) => {
+      deferred = resolve;
+    });
+    const defer = picked.deferReply.getMockImplementation();
+    picked.deferReply.mockImplementation((payload) => {
+      deferred();
+      return defer ? defer(payload) : Promise.resolve();
+    });
+    const { stopReports } = made.ctx;
+    const contested = stopReports.contested.bind(stopReports);
+    const slow = vi.spyOn(stopReports, 'contested').mockImplementationOnce(async (...args) => {
+      await isDeferred;
+      return contested(...args);
+    });
+    try {
+      return await made.handled(picked);
+    } finally {
+      slow.mockRestore();
+    }
+  }
+
+  it('reports a slow menu’s pick without a contest once deferred (review F1)', async () => {
+    const made = await setup();
+    const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
+    const [menu] = selectsOf(asV2(answer));
+    const picked = await slowPick(made, menu?.customId ?? '');
+    expect(picked.deferReply).toHaveBeenCalledTimes(1);
+    expect(said(answerOf(picked))).toContain('### Also reported');
+    expect([...made.store.rows.values()].map((one) => one.stop.name)).toEqual([
+      'Yellow Mural',
+      'Little Bench',
+    ]);
+  });
+
+  it('answers a slow menu’s pick that meets a contest with SLOW_READ, the use given back (review F1)', async () => {
+    const made = await setup();
+    made.ctx.config.settings.research.throttle.uses = 2;
+    try {
+      await made.report({ task: BELDUM, stop: stop(3) }, made.as(MISTY));
+      const answer = answerOf(await made.report({ task: GIBLE, stop: stop(1) }));
+      const [menu] = selectsOf(asV2(answer));
+      const picked = await slowPick(made, menu?.customId ?? '');
+      expect(picked.showModal).not.toHaveBeenCalled();
+      expect(picked.deferReply).toHaveBeenCalledTimes(1);
+      expect(said(answerOf(picked))).toBe(SLOW_READ);
+      expect(
+        [...made.store.rows.values()].map((one) => [one.stop.name, one.reporter.name]),
+      ).toEqual([
+        ['Little Bench', 'Misty'],
+        ['Yellow Mural', 'Ash'],
+      ]);
+      // The pick's use was given back: Ash's second of two is still there.
+      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toContain(
+        '### Field research reported',
+      );
+    } finally {
+      made.ctx.config.settings.research.throttle.uses = 10;
+    }
+  });
+
+  it('says a contradiction met after the check as reported already, keeping it (call 4)', async () => {
+    const made = await setup();
+    const { stopReports } = made.ctx;
+    // Misty reports Gible at Yellow Mural just after Ash's check found nothing to ask about.
+    vi.spyOn(stopReports, 'contested').mockImplementationOnce(async () => {
+      const there = await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]);
+      await stopReports.reportResearch({
+        serverId: FAKE_GUILD_ID,
+        stops: there,
+        subject: readTask(made.ctx, GIBLE, null),
+        reporter: { id: MISTY, name: 'Misty' },
+      });
+      return [];
+    });
+    const answer = answerOf(await made.report({ task: BELDUM, stop: stop(1) }));
+    expect(said(answer)).toMatch(
+      /^Already reported: \*\*Make 3 Excellent Throws in a row\*\* · Gible at \*\*Yellow Mural\*\*, by \*\*Misty\*\* <t:\d+:R>\.$/,
+    );
+    expect(buttonsOf(answer)).toEqual([]);
+    expect(selectsOf(asV2(answer))).toEqual([]);
+    expect(
+      [...made.store.rows.values()].map((one) => [
+        one.stop.name,
+        one.subjectKey,
+        one.reporter.name,
+      ]),
+    ).toEqual([['Yellow Mural', GIBLE, 'Misty']]);
+  });
+
+  it('keeps the time whole with the name and the rewards at their longest (review F2)', async () => {
+    vi.useFakeTimers({ toFake: ['Date'] });
+    try {
+      const made = await setup();
+      const zone = made.ctx.config.settings.timezone;
+      vi.setSystemTime(DateTime.fromISO('2026-11-21T10:05', { zone }).toMillis());
+      const there = await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]);
+      const berry = (name: string): TaskReward => ({
+        kind: 'item',
+        item: name.toLowerCase().replaceAll(' ', '-'),
+        name,
+        quantity: 0,
+        image: null,
+      });
+      await made.ctx.stopReports.reportResearch({
+        serverId: FAKE_GUILD_ID,
+        stops: there,
+        subject: {
+          subjectKey: DRAGON.key,
+          research: {
+            text: DRAGON.text,
+            category: DRAGON.category,
+            rewards: [
+              berry('Silver Pinap Berry'),
+              berry('Golden Razz Berry'),
+              berry('Nanab Berry'),
+            ],
+            typed: false,
+          },
+        },
+        reporter: { id: MISTY, name: 'Misty of the Cerulean City Gym, Water-type Gym Leader' },
+      });
+      const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1) }));
+      const [option] = dialogField(dialog, 'Replace the report at').options ?? [];
+      // The name cut to 32 and the rewards to 40; the time whole at the end.
+      expect(option?.description).toBe(
+        'Catch a… · one of Silver Pinap Berry, Golden Razz…, by Misty of the Cerulean City Gym,… at 10:05 AM',
+      );
+      expect(option?.description?.length).toBeLessThanOrEqual(100);
+    } finally {
+      vi.useRealTimers();
+    }
+  });
+
+  it('refuses a dialog’s Submit once its version left the list, the use given back (review L8)', async () => {
+    const made = await setup();
+    made.ctx.config.settings.research.throttle.uses = 1;
+    try {
+      await made.report({ task: BELDUM, stop: stop(1) }, made.as(MISTY));
+      const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1), stop2: stop(2) }));
+      const listed = made.ctx.researchTasks;
+      Object.assign(made.ctx, { researchTasks: researchTasksFixture([]) });
+      expect(said(answerOf(await made.submit(dialog, {})))).toBe(TASK_LIST_CHANGED);
+      expect([...made.store.rows.values()].map((one) => one.stop.name)).toEqual(['Yellow Mural']);
+      Object.assign(made.ctx, { researchTasks: listed });
+      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toContain(
+        '### Field research reported',
+      );
+    } finally {
+      made.ctx.config.settings.research.throttle.uses = 10;
+    }
+  });
+
+  it('keeps who and when in a contested stop’s description, a long name cut (review L3)', async () => {
+    const made = await setup();
+    await made.report(
+      { task: BELDUM, stop: stop(1) },
+      { ...made.as(MISTY), displayName: 'Misty of the Cerulean City Gym, Water-type Gym Leader' },
+    );
+    const dialog = shownDialog(await made.report({ task: GIBLE, stop: stop(1) }));
+    const [option] = dialogField(dialog, 'Replace the report at').options ?? [];
+    expect(option?.description).toMatch(/, by Misty of the .*… at \d{1,2}:\d{2} [AP]M$/);
+    expect(option?.description?.length).toBeLessThanOrEqual(100);
+  });
+
+  it('says no "was" where a typed task gets its reward (review L6)', async () => {
+    const made = await setup();
+    const typed = 'Win 3 raids in the rain';
+    await made.report({ task: typed, stop: stop(1) }, made.as(MISTY));
+    const answer = said(
+      answerOf(await made.report({ task: typed, stop: stop(1), reward: 'rare candy' })),
+    );
+    expect(answer).toContain('**Win 3 raids in the rain** · Rare Candy\n- **Yellow Mural**\n');
+  });
+
+  it('counts a use that found every stop reported already', async () => {
+    const made = await setup();
+    made.ctx.config.settings.research.throttle.uses = 2;
+    try {
+      await made.report({ task: GIBLE, stop: stop(1) }, made.as(MISTY));
+      for (let n = 0; n < 2; n++) {
+        expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(1) })))).toMatch(
+          /^Already reported:/,
+        );
+      }
+      expect(said(answerOf(await made.report({ task: GIBLE, stop: stop(2) })))).toMatch(
+        /^You can use \/research report again in/,
+      );
+    } finally {
+      made.ctx.config.settings.research.throttle.uses = 10;
+    }
+  });
+
+  it('refuses a reward that fits two versions, and takes the plain one before a costume (L7)', () => {
+    const { ctx } = createTestContext();
+    const crop = 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/';
+    const candy = (quantity: number): TaskReward => ({
+      kind: 'item',
+      item: 'rare-candy',
+      name: 'Rare Candy',
+      quantity,
+      image: null,
+    });
+    const pikachu = (picture: string): TaskReward => ({
+      kind: 'encounter',
+      name: 'Pikachu',
+      key: 'pikachu',
+      dex: 25,
+      shiny: false,
+      cp: null,
+      image: `${crop}${picture}`,
+    });
+    const candies: ResearchTask = {
+      key: taskKeyOf('Spin 5 PokéStops'),
+      text: 'Spin 5 PokéStops',
+      category: 'Exploring',
+      rewards: [candy(1), candy(3)],
+    };
+    const electric: ResearchTask = {
+      key: taskKeyOf('Catch 5 Electric-type Pokémon'),
+      text: 'Catch 5 Electric-type Pokémon',
+      category: 'Catching',
+      rewards: [pikachu('pm25.fPXP_2026.icon.png'), pikachu('pm25.icon.png')],
+    };
+    Object.assign(ctx, { researchTasks: researchTasksFixture([candies, electric]) });
+    expect(() => readTask(ctx, candies.key, 'rare candy')).toThrow(PICK_THE_REWARD);
+    const plain = ctx.researchTasks.versions(electric).find((one) => !one.costumed);
+    expect(readTask(ctx, electric.key, 'pikachu').subjectKey).toBe(plain?.value);
+  });
+});
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 630a81715d4af03b7717a12a337289c0714f7c94..7988eae585963dc8c3eaf266cc190594034cf6ed 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -1,20 +1,39 @@
 import {
+  ComponentType,
   MessageFlags,
   SlashCommandBuilder,
   SlashCommandSubcommandBuilder,
+  type AnySelectMenuInteraction,
+  type APIModalInteractionResponseCallbackData,
   type AutocompleteInteraction,
+  type ChatInputCommandInteraction,
   type SlashCommandStringOption,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { ComponentHandler, Guard, LocatedInteraction } from '../../discord/command.js';
 import { commandGroup, type SubcommandPart } from '../../discord/command-group.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import {
+  deferSubmit,
+  dialog,
+  DIALOG_READ_MS,
+  readInTime,
+  SLOW_READ,
+} from '../../discord/dialog.js';
 import { UserError } from '../../discord/errors.js';
 import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { answer, answerApart, showInPlace, v2Answer } from '../../discord/late-reply.js';
 import { memberInfo } from '../../discord/member-info.js';
-import { STALE_COMPONENT } from '../../discord/router.js';
-import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
-import type { Reporter, ReportedStop, StopReport } from '../../domain/stops/report.js';
+import { STALE_COMPONENT, whenCounted } from '../../discord/router.js';
+import { MEMBER_WRITE_THROTTLE, type Throttle } from '../../discord/throttle.js';
+import { isOneOf, taskOfSubject } from '../../domain/research/reports.js';
+import { rewardsInShort, type TaskReward } from '../../domain/research/task.js';
+import {
+  isResearchReport,
+  type Reporter,
+  type ReportedStop,
+  type ResearchReport,
+} from '../../domain/stops/report.js';
 import { streetOf } from '../../domain/search/wayspot-index.js';
 import {
   RESEARCH_ACTIONS,
@@ -22,11 +41,14 @@ import {
   RESEARCH_KIND,
   reportSubject,
   researchAnswer,
+  rewardWords,
   stopLine,
+  taskText,
   type MoreStop,
 } from '../../render/research.js';
-import { endSentence } from '../../render/text.js';
+import { clockText, endSentence, truncate } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
+import { PendingRequests } from '../../services/pending-requests.js';
 import type { ResearchSubject } from '../../services/stop-reports.js';
 import { MAX_PLACE_TEXT, nearChoices } from '../place-option.js';
 import {
@@ -39,7 +61,9 @@ import {
   researchWindow,
   rewardChoices,
   STOP_OPTIONS,
+  TASK_LIST_CHANGED,
   taskChoices,
+  versionSubject,
 } from './research-input.js';
 import {
   NOT_YOUR_REPORT,
@@ -75,14 +99,15 @@ export function reporterOf(interaction: LocatedInteraction): Reporter {
 
 /**
  * The stops "Same task at more stops…" offers (design 4.3): the server's PokéStops within
- * `MORE_STOPS_METRES` of the first stop, nearest first, without a report of this subject in the
- * period, 25 at most.
+ * `MORE_STOPS_METRES` of the first stop, nearest first, without a report of this version in the
+ * period (for a "one of", without a report of any version of its task: plan 8R-5, R8), 25 at
+ * most.
  */
 async function moreStops(
   interaction: LocatedInteraction,
   ctx: AppContext,
   first: ReportedStop,
-  subjectKey: string,
+  subject: ResearchSubject,
   periodKey: string,
 ): Promise<MoreStop[]> {
   const row = await ctx.guilds.idFor(guildIdOf(interaction));
@@ -92,13 +117,16 @@ async function moreStops(
       .filter((region) => row !== undefined && region.guildId === row)
       .map((region) => region.channelId),
   );
+  const task = taskOfSubject(subject.subjectKey);
+  const oneOf = isOneOf(subject);
   const reported = new Set(
     (await ctx.stopReports.standing(guildIdOf(interaction)))
       .filter(
         (report) =>
           report.kind === 'research' &&
           report.periodKey === periodKey &&
-          report.subjectKey === subjectKey,
+          (report.subjectKey === subject.subjectKey ||
+            (oneOf && taskOfSubject(report.subjectKey) === task)),
       )
       .map((report) => report.stop.key),
   );
@@ -135,28 +163,227 @@ async function answerOf(
     more:
       first === undefined
         ? []
-        : await moreStops(
-            interaction,
-            ctx,
-            first.report.stop,
-            subject.subjectKey,
-            outcome.period.key,
-          ),
+        : await moreStops(interaction, ctx, first.report.stop, subject, outcome.period.key),
   });
 }
 
-/** Refuses what can be known before anything is reported, so that it does not count. */
+/**
+ * The version "Same task at more stops…" reports (R14): the one its custom id carries, as the
+ * list has it, else as a report of the period keeps it (a typed task; one gone from the list), so
+ * that the first report narrowed or replaced meanwhile does not stop it; refused with
+ * `REPORT_ENDED` (the use given back) where the first report is of an ended period, where it is
+ * gone and the answer (`shownAt`, its message's time) was made in another period than now
+ * (review L1: yesterday's task is not reported into today), or where nothing has the version
+ * now. An answer of before plan 8R-5 carries none: its first report's.
+ */
+async function moreSubject(
+  ctx: AppContext,
+  serverId: string,
+  baseId: number,
+  version: string | undefined,
+  shownAt: number,
+): Promise<ResearchSubject> {
+  const period = ctx.stopReports.period().key;
+  const ended = new UserError(REPORT_ENDED, { givesBack: true });
+  const base = await ctx.stopReports.kept(serverId, baseId);
+  if (base !== undefined && (base.kind !== 'research' || base.periodKey !== period)) throw ended;
+  if (base?.kind === 'research' && (version === undefined || base.subjectKey === version)) {
+    return { subjectKey: base.subjectKey, research: base.research };
+  }
+  if (version === undefined) throw ended;
+  if (base === undefined && ctx.stopReports.period(shownAt).key !== period) throw ended;
+  const found = ctx.researchTasks.byVersion(version);
+  if (found) return versionSubject(found.task, found.version);
+  const same = (await ctx.stopReports.standing(serverId))
+    .filter(isResearchReport)
+    .find((report) => report.periodKey === period && report.subjectKey === version);
+  if (!same) throw ended;
+  return { subjectKey: same.subjectKey, research: same.research };
+}
+
+/**
+ * What a report of a use is: the version, the stops, the contradicted reports of other members
+ * standing at them (plan 8R-5, R7: asked about first, in a dialog), and whether it is "Same task
+ * at more stops…" (`also`); `listed` where the version is the task list's (its Submit refuses
+ * one gone from the list since: review L8).
+ */
+interface ResearchUse {
+  subject: ResearchSubject;
+  stops: ReportedStop[];
+  contested: ResearchReport[];
+  also: boolean;
+  listed: boolean;
+}
+
+/** A use of these stops and this version, as read. */
+function useOf(
+  ctx: Pick<AppContext, 'researchTasks'>,
+  subject: ResearchSubject,
+  stops: ReportedStop[],
+  contested: ResearchReport[],
+  also: boolean,
+): ResearchUse {
+  const listed = ctx.researchTasks.byVersion(subject.subjectKey) !== undefined;
+  return { subject, stops, contested, also, listed };
+}
+
+/** A question waiting for its Submit: the use it carries on, counted when and where. */
+interface WaitingUse extends ResearchUse {
+  countedAt: number;
+  throttle: Throttle;
+  window: string;
+}
+
+/** What each use's guard read: the command takes it (one reading in all). */
+const asked = new WeakMap<ChatInputCommandInteraction, ResearchUse>();
+
+/** The reports that wait for the dialog's Submit. */
+const pending = new PendingRequests<WaitingUse>();
+
+/** The input of the dialog: a checkbox per contested stop, by the report's id. */
+const CONTESTED_INPUT = 'replace';
+
+/** A version's rewards as a choice's description says them (no markdown there). */
+function rewardsAsText(rewards: readonly TaskReward[]): string {
+  const short = rewardsInShort(rewards);
+  return rewards.length > 1 ? `one of ${short}` : short;
+}
+
+/** A description's room (Discord's 100 characters). */
+const DESCRIPTION_ROOM = 100;
+
+/**
+ * What stands at a contested stop, as its checkbox describes it: `Make 3 Excellent Throws in a
+ * row · Gible, by Misty at 10:05 AM`. Who and when are always kept (review L3): the name cut to
+ * 32 characters, the rewards to 40, and the task's text to the room left; the clock as plain
+ * text (`clockText`: a description shows no Discord timestamp).
+ */
+function contestedDescription(report: ResearchReport, zone: string): string {
+  const who = `, by ${truncate(report.reporter.name, 32)} at ${clockText(report.madeAt, zone)}`;
+  const rewards = truncate(rewardsAsText(report.research.rewards), 40);
+  const after = `${rewards === '' ? '' : ` · ${rewards}`}${who}`;
+  // At most 92 characters after the task's text (the name and the rewards cut, a clock of eight):
+  // the text has the room left, never more, so that the cut never reaches the time (review F2).
+  return `${truncate(report.research.text, DESCRIPTION_ROOM - after.length)}${after}`;
+}
+
+/**
+ * The dialog that asks before a report contradicts other members' reports (R7): a checkbox per
+ * contested stop, unticked (the member must go out of their way to overrule one), saying what
+ * stands there, who reported it and when; Submit reports at every stop, the ticked ones replaced.
+ */
+function replaceDialog(token: string, use: WaitingUse, zone: string) {
+  const { research } = use.subject;
+  const rewards = rewardWords(research.rewards);
+  const many = use.contested.length > 1;
+  // The stops picked from "Same task at more stops…", else named (review L4).
+  const question =
+    `Another member’s report stands at ${many ? 'stops' : 'a stop'} you ` +
+    `${use.also ? 'picked' : 'named'}. Tick ${many ? 'each one' : 'it'} to replace that report ` +
+    `with **${taskText(research)}**${rewards === '' ? '' : ` · ${rewards}`}; a stop left ` +
+    'unticked keeps its report.';
+  const shown = dialog({
+    customId: encodeCustomId({ kind: RESEARCH_KIND, id: token, action: RESEARCH_ACTIONS.replace }),
+    title: 'Replace field research?',
+    // The other stops only where there are any (review L4).
+    text:
+      use.stops.length > use.contested.length
+        ? `${question}\n\nSubmit reports at the other stops as well.`
+        : question,
+  });
+  return {
+    ...shown,
+    components: [
+      ...shown.components,
+      {
+        type: ComponentType.Label,
+        label: 'Replace the report at',
+        component: {
+          type: ComponentType.CheckboxGroup,
+          custom_id: CONTESTED_INPUT,
+          required: false,
+          min_values: 0,
+          max_values: use.contested.length,
+          options: use.contested.map((report) => ({
+            label: truncate(report.stop.name, 100),
+            value: String(report.id),
+            description: contestedDescription(report, zone),
+          })),
+        },
+      },
+    ],
+  } satisfies APIModalInteractionResponseCallbackData;
+}
+
+/**
+ * Asks in the dialog before contradicting other members' reports (R7), as the first answer of
+ * the use: nothing more is read, but what was read must have left Discord's three seconds.
+ */
+async function askToReplace(
+  interaction: ChatInputCommandInteraction | AnySelectMenuInteraction,
+  ctx: AppContext,
+  use: ResearchUse,
+): Promise<void> {
+  await readInTime(ctx.log, interaction, () => Promise.resolve());
+  const { settings } = ctx.config;
+  const waiting: WaitingUse = {
+    ...use,
+    countedAt: whenCounted(interaction) ?? Date.now(),
+    throttle: researchThrottle(settings),
+    window: researchWindow(settings),
+  };
+  const token = pending.put(interaction.user.id, waiting);
+  await interaction.showModal(replaceDialog(token, waiting, settings.timezone));
+}
+
+/**
+ * A read whose answer decides whether a dialog opens, raced against `DIALOG_READ_MS` of the
+ * interaction (review F1, the slow-read rule): back in time, as it is (`deferred` false, nothing
+ * answered yet); past the budget, the press is deferred privately at once and the read awaited
+ * (`deferred` true: no dialog can open any more). A read that fails passes its error on, before
+ * or after the deferral.
+ */
+async function readOrDefer<T>(
+  interaction: AnySelectMenuInteraction,
+  work: Promise<T>,
+): Promise<{ value: T; deferred: boolean }> {
+  const age = Math.max(0, Date.now() - interaction.createdTimestamp);
+  let timer: NodeJS.Timeout | undefined;
+  const late = new Promise<'late'>((resolve) => {
+    timer = setTimeout(() => resolve('late'), Math.max(0, DIALOG_READ_MS - age));
+  });
+  try {
+    const first = await Promise.race([work.then((value) => ({ value })), late]);
+    if (first !== 'late') return { value: first.value, deferred: false };
+  } finally {
+    clearTimeout(timer);
+  }
+  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+  return { value: await work, deferred: true };
+}
+
+/**
+ * Refuses what can be known before anything is reported, so that it does not count; and reads
+ * what stands at the stops, so that a contradiction opens the dialog (no deferral before it).
+ */
 const requireResearchReport: Guard = async (interaction, ctx) => {
   if (regionChannelOf(interaction, ctx) === undefined) throw new UserError(RESEARCH_FROM_A_REGION);
   const row = await ctx.guilds.idFor(guildIdOf(interaction));
   if (row === undefined || !ctx.placeFinder.hasStops(row)) throw new UserError(NO_STOPS_HERE);
   if (interaction.isChatInputCommand()) {
-    readTask(
+    const subject = readTask(
       ctx,
       interaction.options.getString('task', true),
       interaction.options.getString('reward'),
     );
-    await namedStops(interaction, ctx);
+    const stops = await namedStops(interaction, ctx);
+    const contested = await ctx.stopReports.contested(
+      guildIdOf(interaction),
+      stops,
+      subject,
+      interaction.user.id,
+    );
+    asked.set(interaction, useOf(ctx, subject, stops, contested, false));
   }
 };
 
@@ -225,21 +452,23 @@ const reportResearch: SubcommandPart = {
     ],
   },
   guards: [requireResearchReport],
-  defer: 'late',
+  // The dialog is the first answer where one opens: nothing is deferred before it.
+  defer: (interaction) =>
+    (asked.get(interaction)?.contested.length ?? 0) > 0 ? undefined : 'late',
   throttle: (_interaction, ctx) => researchThrottle(ctx.config.settings),
   async execute(interaction, ctx) {
-    const subject = readTask(
-      ctx,
-      interaction.options.getString('task', true),
-      interaction.options.getString('reward'),
-    );
-    const stops = await namedStops(interaction, ctx);
+    const use = asked.get(interaction);
+    if (!use) throw new UserError('Use `/research report` again.');
+    if (use.contested.length > 0) {
+      await askToReplace(interaction, ctx, use);
+      return;
+    }
     const reported = await reportResearchAs(ctx, guildIdOf(interaction), {
-      stops,
-      subject,
+      stops: use.stops,
+      subject: use.subject,
       reporter: reporterOf(interaction),
     });
-    await answer(interaction, v2Answer(await answerOf(interaction, ctx, reported, subject)));
+    await answer(interaction, v2Answer(await answerOf(interaction, ctx, reported, use.subject)));
   },
   autocomplete: async (interaction, ctx) => {
     await interaction.respond(await researchChoices(interaction, ctx));
@@ -304,31 +533,90 @@ export const research = commandGroup({
 export const researchControls: ComponentHandler = {
   kind: RESEARCH_KIND,
   guards: [requireGuild],
-  throttle: (_interaction, id, ctx) =>
-    id.action === RESEARCH_ACTIONS.more
+  throttle: (_interaction, id, ctx) => {
+    if (id.action === RESEARCH_ACTIONS.replace) return undefined;
+    return id.action === RESEARCH_ACTIONS.more
       ? { ...researchThrottle(ctx.config.settings), as: researchWindow(ctx.config.settings) }
-      : MEMBER_WRITE_THROTTLE,
+      : MEMBER_WRITE_THROTTLE;
+  },
+  carriesOn: (interaction, id) => {
+    if (id.action !== RESEARCH_ACTIONS.replace) return undefined;
+    const waiting = pending.peek(id.id, interaction.user.id);
+    return typeof waiting === 'object'
+      ? { ...waiting.value.throttle, as: waiting.value.window, countedAt: waiting.value.countedAt }
+      : undefined;
+  },
   async select(interaction, id, ctx) {
-    if (id.action !== RESEARCH_ACTIONS.more || !/^\d{1,10}$/.test(id.id)) {
+    const [arg, ...more] = id.args;
+    if (id.action !== RESEARCH_ACTIONS.more || !/^\d{1,10}$/.test(id.id) || more.length > 0) {
       throw new UserError(STALE_COMPONENT);
     }
-    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
     const serverId = guildIdOf(interaction);
-    const base: StopReport | undefined = await ctx.stopReports.get(serverId, Number(id.id));
-    // Nothing reported: the use counted in `/research report`'s window is given back (B11).
-    if (base?.kind !== 'research' || base.periodKey !== ctx.stopReports.period().key) {
-      throw new UserError(REPORT_ENDED, { givesBack: true });
+    const reading = (async () => {
+      const subject = await moreSubject(
+        ctx,
+        serverId,
+        Number(id.id),
+        arg?.replaceAll('.', ':'),
+        interaction.message.createdTimestamp,
+      );
+      const stops = await stopsByKey(ctx, serverId, interaction.values);
+      if (stops.length === 0) throw new UserError(REPORT_ENDED, { givesBack: true });
+      const contested = await ctx.stopReports.contested(
+        serverId,
+        stops,
+        subject,
+        interaction.user.id,
+      );
+      return useOf(ctx, subject, stops, contested, true);
+    })();
+    const { value: use, deferred } = await readOrDefer(interaction, reading);
+    // Only a dialog must open within Discord's three seconds (`askToReplace` checks the clock,
+    // review L2): a read past the budget deferred the press, and then a contest can only be
+    // refused (review F1); otherwise the answer is deferred, and a contradiction met since is
+    // said as reported already.
+    if (use.contested.length > 0) {
+      if (deferred) throw new UserError(SLOW_READ, { givesBack: true });
+      await askToReplace(interaction, ctx, use);
+      return;
     }
-    const stops = await stopsByKey(ctx, serverId, interaction.values);
-    if (stops.length === 0) throw new UserError(REPORT_ENDED, { givesBack: true });
-    const subject: ResearchSubject = { subjectKey: base.subjectKey, research: base.research };
+    if (!deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
     const reported = await reportResearchAs(
       ctx,
       serverId,
-      { stops, subject, reporter: reporterOf(interaction) },
+      { stops: use.stops, subject: use.subject, reporter: reporterOf(interaction) },
       true,
     );
-    await answerApart(interaction, await answerOf(interaction, ctx, reported, subject));
+    await answerApart(interaction, await answerOf(interaction, ctx, reported, use.subject));
+  },
+  async modal(interaction, id, ctx) {
+    if (id.action !== RESEARCH_ACTIONS.replace) throw new UserError(STALE_COMPONENT);
+    const taken = pending.take(id.id, interaction.user.id);
+    if (taken === 'not-yours') throw new UserError('That is somebody else’s report.');
+    if (taken === 'expired') {
+      throw new UserError('That question has expired. Use `/research report` again.');
+    }
+    const use = taken.value;
+    // The version asked about left the list since the dialog opened (review L8).
+    if (use.listed && !ctx.researchTasks.byVersion(use.subject.subjectKey)) {
+      throw new UserError(TASK_LIST_CHANGED, { givesBack: true });
+    }
+    await deferSubmit(interaction);
+    const ticked = interaction.fields.fields.has(CONTESTED_INPUT)
+      ? interaction.fields.getCheckboxGroup(CONTESTED_INPUT)
+      : [];
+    // Only the reports it asked about: a stop ticked is replaced, one left unticked keeps its
+    // report, and so does one contradicted since (said as reported already).
+    const replacing = use.contested
+      .map((report) => report.id)
+      .filter((reportId) => ticked.includes(String(reportId)));
+    const reported = await reportResearchAs(
+      ctx,
+      guildIdOf(interaction),
+      { stops: use.stops, subject: use.subject, reporter: reporterOf(interaction), replacing },
+      use.also,
+    );
+    await answerApart(interaction, await answerOf(interaction, ctx, reported, use.subject));
   },
   async button(interaction, id, ctx) {
     const ids = [id.id, ...id.args];
diff --git a/src/domain/research/versions.ts b/src/domain/research/versions.ts
index ba560a07a9f59c3933bf6203e1b3150467e73a09..ed04462ee79110214a94e939e547f4c4a10f6be1 100644
--- a/src/domain/research/versions.ts
+++ b/src/domain/research/versions.ts
@@ -62,6 +62,9 @@ export interface TaskVersion {
   costumed: boolean;
 }
 
+/** What a costumed version's label ends with (R12). */
+export const COSTUMED_MARK = ' (costumed)';
+
 /**
  * A reward's words as a version's label: its name, an item's quantity; a costumed encounter's
  * `(costumed)` said where its name is the catalogue's plain one (review L9: `Pikachu wearing a
@@ -74,7 +77,7 @@ function rewardLabel(reward: TaskReward, catalogue: PokemonCatalogue | undefined
     reward.kind === 'encounter' && reward.key !== null
       ? catalogue?.byKey(reward.key)?.name
       : undefined;
-  return plainName === undefined || plainName === reward.name ? `${words} (costumed)` : words;
+  return plainName === undefined || plainName === reward.name ? `${words}${COSTUMED_MARK}` : words;
 }
 
 /**
diff --git a/src/render/research.test.ts b/src/render/research.test.ts
index 4a1057912bf392ebf183ea694f39407859189c1a..944eda1139e75f73a12515a3eeede21c7691db3d 100644
--- a/src/render/research.test.ts
+++ b/src/render/research.test.ts
@@ -59,7 +59,7 @@ describe('researchAnswer', () => {
               {
                 "components": [
                   {
-                    "custom_id": "research:7:more",
+                    "custom_id": "research:7:more:7f01b706630faf94",
                     "max_values": 1,
                     "min_values": 1,
                     "options": [
diff --git a/src/render/research.ts b/src/render/research.ts
index 70b31a492a894feb214d925ae94b40facc5e9009..b7494ed97b490f76e16453b96e2bb1a464551059 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -8,6 +8,7 @@ import {
 import { DateTime } from 'luxon';
 import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
+import { taskOfSubject } from '../domain/research/reports.js';
 import { rewardsInShort, type TaskReward } from '../domain/research/task.js';
 import type {
   ReportedStop,
@@ -19,9 +20,11 @@ import { cutText } from './party-post.js';
 import {
   clockOrDay,
   count,
+  memberByName,
   memberName,
   plain,
   plainNoLinks,
+  timestamp,
   truncate,
   type NamedMember,
 } from './text.js';
@@ -33,8 +36,11 @@ export const RESEARCH_COLOUR = 0x9b59b6;
 /** The custom-id kind of the controls of `/research report`'s answer. */
 export const RESEARCH_KIND = 'research';
 
-/** The actions: "Same task at more stops…" (a menu) and "Take back" (a button). */
-export const RESEARCH_ACTIONS = { more: 'more', back: 'back' } as const;
+/**
+ * The actions: "Same task at more stops…" (a menu), "Take back" (a button) and the Submit of the
+ * dialog that asks before replacing other members' reports (plan 8R-5, R7).
+ */
+export const RESEARCH_ACTIONS = { more: 'more', back: 'back', replace: 'replace' } as const;
 
 /** A task's text as shown: a typed one through `plainNoLinks` (Matt's answer 5), cut first. */
 export function taskText(research: Pick<ResearchDetail, 'text' | 'typed'>, room = 120): string {
@@ -81,10 +87,52 @@ export interface MoreStop {
   where: string | undefined;
 }
 
+/**
+ * A stop where a report stands already (plan 8R-5, R8): the report, the link to the message of
+ * the pinned post that holds it, and the reporter as the caller names them (the map: by name).
+ */
+export interface AlreadyAt {
+  report: ResearchReport;
+  link: string | undefined;
+  by?: string;
+}
+
+/**
+ * A research report that stands already, as `alreadyReported` words a Rocket one (R8):
+ * `Already reported: **Make 3 Excellent Throws in a row** · Gible at **Yellow Mural**, by
+ * **Misty** <t:R>.`, the link after it.
+ */
+export function researchAlready({ report, link, by }: AlreadyAt): string {
+  const rewards = rewardWords(report.research.rewards);
+  return (
+    `Already reported: **${taskText(report.research)}**${rewards === '' ? '' : ` · ${rewards}`} ` +
+    `at ${stopLine(report.stop)}, by ${by ?? memberByName(report.reporter)} ` +
+    `${timestamp(report.madeAt, 'R')}.` +
+    (link === undefined ? '' : ` ${link}`)
+  );
+}
+
+/**
+ * What a replaced report was, as an answer's stop line says it (plan 8R-5): ` (again)` for the
+ * same version, the version's rewards for another of the same task (`one of Larvitar, Beldum,
+ * Gible`, `Gible`), nothing for the same task whose reward was not said (a typed task given its
+ * reward: review L6), else the other task's text.
+ */
+function replacedWords(report: ResearchReport, replaced: ResearchReport): string {
+  if (replaced.subjectKey === report.subjectKey) return ' (again)';
+  const words = rewardWords(replaced.research.rewards);
+  if (taskOfSubject(replaced.subjectKey) !== taskOfSubject(report.subjectKey)) {
+    return ` (was: ${taskText(replaced.research, 60)})`;
+  }
+  return words === '' ? '' : ` (was: ${words})`;
+}
+
 /** What the words of a research report's answer say (`researchWords`), on Discord or the map. */
 export interface ResearchWordsView {
   /** The reports made, one per stop, in the order given; with the report each replaced. */
   saved: readonly { report: ResearchReport; replaced: ResearchReport | undefined }[];
+  /** The stops where a report stood already (plan 8R-5, R8): said after those reported. */
+  already?: readonly AlreadyAt[];
   /** The region channels whose pinned posts show them. */
   channels: readonly string[];
   /** When they end, as shown (`periodEndWords`). */
@@ -122,23 +170,24 @@ export function researchWords(
   view: ResearchWordsView,
   channel: ChannelNamer,
 ): { head: string; where: string } {
+  const already = (view.already ?? []).map(researchAlready);
   const [first] = view.saved;
-  if (!first) throw new Error('a research answer needs a report');
+  // Every stop reported already (R8): only that is said.
+  if (!first) {
+    if (already.length === 0) throw new Error('a research answer needs a report');
+    return { head: already.join('\n'), where: '' };
+  }
   const { research } = first.report;
   const rewards = rewardWords(research.rewards);
-  const lines = view.saved.map(({ report, replaced }) => {
-    const before =
-      replaced === undefined
-        ? ''
-        : replaced.subjectKey === report.subjectKey
-          ? ' (again)'
-          : ` (was: ${taskText(replaced.research, 60)})`;
-    return `- ${stopLine(report.stop)}${before}`;
-  });
+  const lines = view.saved.map(
+    ({ report, replaced }) =>
+      `- ${stopLine(report.stop)}${replaced === undefined ? '' : replacedWords(report, replaced)}`,
+  );
   const head = [
     `### ${view.also === true ? 'Also reported' : 'Field research reported'}`,
     `**${taskText(research)}**${rewards === '' ? '' : ` · ${rewards}`}`,
     ...lines,
+    ...already,
   ].join('\n');
   const where =
     view.posts === false
@@ -157,9 +206,15 @@ export function researchWords(
  * the answer whose id fits the custom id; the rest by `/research remove`).
  */
 export function researchAnswer(view: ResearchAnswerView): V2Message {
-  const [first] = view.saved;
-  if (!first) throw new Error('a research answer needs a report');
   const { head, where } = researchWords(view, DISCORD_CHANNEL);
+  const [first] = view.saved;
+  // Nothing reported (R8): the stops reported already, no Take back nor more stops.
+  if (!first) {
+    return {
+      v2: true,
+      components: [container(RESEARCH_COLOUR, [textDisplay(cutText(head, 3_000))])],
+    };
+  }
   const parts: APIComponentInContainer[] = [
     textDisplay(cutText(head, 3_000)),
     textDisplay(`-# ${where}`),
@@ -167,10 +222,13 @@ export function researchAnswer(view: ResearchAnswerView): V2Message {
   if (view.more.length > 0) {
     const menu: APIStringSelectComponent = {
       type: ComponentType.StringSelect,
+      // The version it reports (R14), `.` for every `:`: a first report narrowed meanwhile does
+      // not stop it.
       custom_id: encodeCustomId({
         kind: RESEARCH_KIND,
         id: String(first.report.id),
         action: RESEARCH_ACTIONS.more,
+        args: [first.report.subjectKey.replaceAll(':', '.')],
       }),
       placeholder: 'Same task at more stops…',
       min_values: 1,
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index 75e1c4672418e91b1a3587e07a0118f654034f83..939aa93a7effe31e342e5cb8c2a72133fbd81b93 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -112,7 +112,7 @@ describe('reports at stops from the map', () => {
       expect(answer.status).toBe(200);
       expect(answer.json.ok).toBe(true);
       expect(answer.json.text).toBe(
-        'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew +4\n' +
+        'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew\n' +
           '- Yellow Mural\n- Paititi Inti\n' +
           'In the pinned post "Today at the stops" of #west, until midnight.',
       );
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index 4db66f2535bb27be9f6c3a39128b8c5efd77ed3b..1211ec63c04a0d97db0ea89e57ebe4981aa3ecc0 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -278,6 +278,11 @@ export interface FakeMessage {
    * (`attachments`), and adds its own `files`.
    */
   files?: readonly unknown[];
+  /**
+   * When it was sent: `interaction.message.createdTimestamp`; the interaction's own time unless
+   * a test says so.
+   */
+  createdTimestamp?: number;
 }
 
 export const FAKE_MESSAGE_ID = '950000000000000001';
@@ -760,8 +765,10 @@ function base(kind: Kind, o: FakeOptions) {
       replyFiles = filesAfter(payload, replyFiles);
     }
   };
+  const createdAt = o.createdTimestamp ?? Date.now();
   const shownMessage = () => ({
     id: shown.id,
+    createdTimestamp: shown.createdTimestamp ?? createdAt,
     content: shown.content,
     attachments: shown.files ?? [],
     components: shown.rows.map((row) => ({ type: row.type, toJSON: () => row })),
@@ -790,7 +797,7 @@ function base(kind: Kind, o: FakeOptions) {
   const interaction = {
     id: '900000000000000001',
     type: TYPE[kind],
-    createdTimestamp: o.createdTimestamp ?? Date.now(),
+    createdTimestamp: createdAt,
     memberPermissions: o.isDm
       ? null
       : new PermissionsBitField(o.memberPermissions ?? o.permissions ?? 0n).freeze(),
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 27bb82a23543f282d352e30110dd8a2b2f19e201..3a05f16e184583cb0476170f11eea3fe7141d122 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -120,6 +120,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     rocketLineups: rocketLineupsFixture(),
     // Over memory and the context's own research events (below), unless a test passes its own.
     stopReports: undefined as unknown as StopReportService,
+    // No pinned post holds anything; a test passes its own `linkOf`.
+    stopPostLinks: { linkOf: () => undefined },
     // Over the context's reports (below), unless a test passes its own.
     rocket: undefined as unknown as RocketService,
     gyms: gymsFixture(),
````

### Task 4: 8R-5 task 4: The notifier: confirmations and narrowed one-ofs

Prototype commit: `141367b6cf4ad46f9c2020e8245344cec07a0a62`

The notifier's line is the task's (every version in order). A reward's report
confirms, in a short DM, the stops where the member was told of the task's
"one of" ("Confirmed: the reward at **Stop** is **Gible**."), naming every
stop it confirms; where any stop is new for them, the usual DM names every
untold stop. The reporter of a replaced "one of" counts as told of it. A "one
of" reads its reports again when its turn comes and leaves out the stops
replaced since (StopReportService.kept). A DM names the member's reward first.

**Files:**

```
 src/app.ts                                   |   2 +
 src/render/research.ts                       |  40 +++++++++
 src/services/notify-service.research.test.ts | 316 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/services/notify-service.ts               | 212 +++++++++++++++++++++++++++++++++++++--------
 4 files changed, 527 insertions(+), 43 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/services/notify-service.research.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 141367b6cf4ad46f9c2020e8245344cec07a0a62 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-5 task 4: The notifier: confirmations and narrowed one-ofs`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/app.ts b/src/app.ts
index a5d29fc295ea99a0457ffbfafe744a9f0d03dc9c..0f30cf990045d8744b897b00c6620873eb0be767 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -463,6 +463,8 @@ export async function startApp(
       messageOf: (channelId, subjectKey) =>
         researchPostLinks.posts?.messageOf(channelId, subjectKey) ?? Promise.resolve(undefined),
     },
+    // A "one of" leaves out the stops narrowed before its turn (plan 8R-5, R6).
+    stopReports,
   });
   partyService.announceTo(notify);
   // Who wants a reward of reported field research hears of it (plan 8R-1, design 7).
diff --git a/src/render/research.ts b/src/render/research.ts
index b7494ed97b490f76e16453b96e2bb1a464551059..fe82703f771ebfd38a44f7d616de0676bda84550 100644
--- a/src/render/research.ts
+++ b/src/render/research.ts
@@ -283,6 +283,46 @@ export function researchDmSentence(view: {
   );
 }
 
+/**
+ * The first line of the direct message that confirms a "one of" a member was told of (plan 8R-5,
+ * design point 5, R4): `Confirmed: the reward at **Yellow Mural** and **Paititi Inti** is
+ * **Gible**.`, the stops ten at most (the rest counted), all through `plainNoLinks`.
+ */
+export function researchConfirmSentence(view: {
+  stops: readonly Pick<ReportedStop, 'name'>[];
+  rewards: readonly TaskReward[];
+}): string {
+  const names = view.stops
+    .slice(0, DM_STOPS_SHOWN)
+    .map((stop) => `**${plainNoLinks(truncate(stop.name, 80))}**`);
+  const more = view.stops.length - names.length;
+  if (more > 0) names.push(count(more, 'more stop'));
+  const last = names.pop() ?? '';
+  const stops = names.length === 0 ? last : `${names.join(', ')} and ${last}`;
+  const reward = plainNoLinks(rewardsInShort(view.rewards));
+  return `Confirmed: the reward at ${stops} is **${reward}**.`;
+}
+
+/**
+ * The brief of the direct message that confirms a "one of" (plan 8R-5): the task, until when, and
+ * the reward's picture.
+ */
+export function researchConfirmBrief(view: {
+  research: Pick<ResearchDetail, 'text' | 'rewards'>;
+  until: string;
+}): { accent: number; picture?: string; lines: string[] } {
+  const picture = view.research.rewards.find((reward) => reward.image !== null)?.image;
+  const { until } = view;
+  return {
+    accent: RESEARCH_COLOUR,
+    ...(picture == null ? {} : { picture }),
+    lines: [
+      `**${plainNoLinks(truncate(view.research.text, 120))}**`,
+      `${until.charAt(0).toUpperCase()}${until.slice(1)}.`,
+    ],
+  };
+}
+
 /**
  * Field research in brief, for a direct message (`notifyDm`): the rewards ("one of" where one is
  * drawn), a line per stop with its address (ten at most, the rest counted) and until when
diff --git a/src/services/notify-service.research.test.ts b/src/services/notify-service.research.test.ts
index ba30146e52ea7349278ba6cf2bd03118c3b43a1e..6cbfc871135b9a6f7dea7c72fe22ac2c5d15b373 100644
--- a/src/services/notify-service.research.test.ts
+++ b/src/services/notify-service.research.test.ts
@@ -1,22 +1,24 @@
-import { describe, expect, it } from 'vitest';
+import { describe, expect, it, vi } from 'vitest';
+import { catalogueFixture } from '../../test/support/game-data.js';
 import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { dmBrief, dmReasons, dmSentence, linksOf } from '../../test/support/messages.js';
 import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
 import { pageTask, researchTasksOfPage } from '../../test/support/research.js';
 import { reportedStop } from '../../test/support/stop-report-cases.js';
-import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
+import { MemoryStopReports } from '../../test/support/stop-reports.js';
 import { INTO_THE_WILD } from '../../test/support/research-store-cases.js';
 import type { ResearchEvent } from '../domain/time/research-events.js';
 import { DateTime } from 'luxon';
 import { watchEachTest } from '../../test/support/timers.js';
 import { boxTarget, type TargetWant } from '../domain/notify/target-wants.js';
 import type { ResearchTask } from '../domain/research/task.js';
+import { rewardHash, taskVersions } from '../domain/research/versions.js';
 import type { ReportedStop } from '../domain/stops/report.js';
 import { postLink } from '../render/notify-dm.js';
 import type { NotifyServiceOptions } from './notify-service.js';
 import { DM_PRIORITY } from './dm-sender.js';
-import { StopReportService } from './stop-reports.js';
+import { StopReportService, type ResearchSubject } from './stop-reports.js';
 
 const background = watchEachTest();
 const at = (local: string): number =>
@@ -42,16 +44,42 @@ async function researchWith(
   notifying: Partial<NotifyServiceOptions> = {},
   events: ResearchEvent[] = [],
 ) {
-  const made = await partyServiceWith([], { notifying });
+  // The reports the notifier reads again (R6): made after it, over the party tests' clock.
+  const held: { reports?: StopReportService } = {};
+  const made = await partyServiceWith([], {
+    notifying: {
+      stopReports: {
+        kept: (serverId, id) => held.reports?.kept(serverId, id) ?? Promise.resolve(undefined),
+      },
+      ...notifying,
+    },
+  });
   const reports = new StopReportService({
-    rewardHash: fixtureRewardHash,
     store: new MemoryStopReports(),
     events: { researchEvents: () => events },
     zone: made.settings.timezone,
     log: made.log,
     now: () => made.clock.now,
+    rewardHash: (reward) => rewardHash(reward, catalogueFixture()),
   });
+  held.reports = reports;
   reports.listen({ reported: (news) => made.notify.researchReported(news) });
+  const reportVersion = async (
+    subject: ResearchSubject,
+    stops: ReportedStop[],
+    reporter: { id: string; name: string } = RITA,
+    replacing?: number[],
+  ) => {
+    const outcome = await reports.reportResearch({
+      serverId: made.gateway.guildId,
+      stops,
+      subject,
+      reporter,
+      ...(replacing === undefined ? {} : { replacing }),
+    });
+    await made.notify.flush();
+    return outcome;
+  };
   const want = (memberId: string, ...targets: TargetWant[]) =>
     made.targetWants.change(memberId, made.gateway.guildId, { add: targets, remove: [] }, 0);
   const report = async (
@@ -71,7 +99,7 @@ async function researchWith(
     await made.notify.flush();
     return outcome;
   };
-  return { ...made, reports, want, report };
+  return { ...made, reports, want, report, reportVersion };
 }
 
 describe('NotifyService: field research is reported (plan 8R-1, design 7)', () => {
@@ -182,6 +210,282 @@ describe('NotifyService: field research is reported (plan 8R-1, design 7)', () =
     ]);
   });
 
+  describe('the versions of a task (plan 8R-5)', () => {
+    const THROWS = pageTask('Make 3 Excellent Throws in a row');
+    const versions = taskVersions(THROWS, catalogueFixture());
+    const version = (label: string) => {
+      const found = versions.find((one) => one.label === label);
+      if (!found) throw new Error(`no version ${label}`);
+      return {
+        subjectKey: found.value,
+        research: {
+          text: THROWS.text,
+          category: THROWS.category,
+          rewards: found.rewards,
+          typed: false,
+        },
+      };
+    };
+    const ONE_OF = version('one of Larvitar, Beldum, Gible');
+    const GIBLE = version('Gible');
+    const BELDUM = version('Beldum');
+    const WANT_GIBLE = boxTarget('research-pokemon', 443);
+    const BOB_ = { id: BOB, name: 'Bob' };
+    const CAROL_ = { id: CAROL, name: 'Carol' };
+    const confirmed = (stops: string) => `Confirmed: the reward at ${stops} is **Gible**.`;
+
+    it('names the member’s reward first in a "one of" DM (R12)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [west(1)]);
+      expect(dmBrief(made.dms.to(ALICE)[0])[0]).toBe('**Rewards** one of Gible, Larvitar, Beldum');
+    });
+
+    it('confirms a narrowing to whoever was told of its "one of" there, and its reporter (R5)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      await made.want(REPORTER, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [west(1)]);
+      // Carol wants Gible from now on: she was not told of the "one of".
+      await made.want(CAROL, WANT_GIBLE);
+      await made.reportVersion(GIBLE, [west(1)], BOB_);
+      expect(made.dms.to(ALICE).map(dmSentence)).toEqual([
+        expect.stringContaining('Field research has been reported'),
+        confirmed('**Yellow Mural 1**'),
+      ]);
+      // Rita reported the "one of": she knows of the task there, and is told which it is.
+      expect(made.dms.to(REPORTER).map(dmSentence)).toEqual([confirmed('**Yellow Mural 1**')]);
+      expect(made.dms.to(CAROL).map(dmSentence)).toEqual([
+        expect.stringContaining('Field research has been reported'),
+      ]);
+      expect(dmBrief(made.dms.to(CAROL)[0])[0]).toBe('**Rewards** Gible');
+    });
+
+    it('confirms Gible after Beldum to whoever was told of the "one of" there (R5)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [west(1)]);
+      // A narrowing to a reward Alice does not want tells her nothing.
+      await made.reportVersion(BELDUM, [west(1)], BOB_);
+      expect(made.dms.to(ALICE)).toHaveLength(1);
+      // Carol corrects it (she ticked Bob's report): Alice was told of the "one of" there.
+      const there = await made.reports.at(made.gateway.guildId, west(1).key);
+      await made.reportVersion(GIBLE, [west(1)], CAROL_, [there?.id ?? 0]);
+      expect(made.dms.to(ALICE).map(dmSentence).at(-1)).toBe(confirmed('**Yellow Mural 1**'));
+    });
+
+    it('confirms several stops in one DM, and names every stop untold where one is new (R4)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [west(1), west(2), west(3)]);
+      await made.reportVersion(GIBLE, [west(1), west(2)], BOB_);
+      expect(made.dms.to(ALICE).map(dmSentence).at(-1)).toBe(
+        confirmed('**Yellow Mural 1** and **Yellow Mural 2**'),
+      );
+      await made.reportVersion(GIBLE, [west(3), west(4)], BOB_);
+      const last = made.dms.to(ALICE).at(-1);
+      expect(dmSentence(last)).toContain('Field research has been reported');
+      expect(dmBrief(last).slice(1, -1)).toEqual([
+        '- **Yellow Mural 3** · Market Street',
+        '- **Yellow Mural 4** · Market Street',
+      ]);
+      expect(made.dms.to(ALICE)).toHaveLength(3);
+    });
+
+    it('leaves a stop narrowed before its turn out of the "one of" DM (R6)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      // The "one of" waits to be told while Bob narrows it.
+      let release = (): void => undefined;
+      const gate = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      const wanting = made.targetWants.wanting.bind(made.targetWants);
+      vi.spyOn(made.targetWants, 'wanting').mockImplementationOnce(async (...args) => {
+        await gate;
+        return wanting(...args);
+      });
+      await made.reports.reportResearch({
+        serverId: made.gateway.guildId,
+        stops: [west(1), west(2)],
+        subject: ONE_OF,
+        reporter: RITA,
+      });
+      await made.reports.reportResearch({
+        serverId: made.gateway.guildId,
+        stops: [west(1)],
+        subject: GIBLE,
+        reporter: BOB_,
+      });
+      release();
+      await made.notify.flush();
+      const [oneOf, gible] = made.dms.to(ALICE);
+      expect(dmBrief(oneOf).slice(1, -1)).toEqual(['- **Yellow Mural 2** · Market Street']);
+      // Not told of the "one of" at Yellow Mural 1: the usual DM.
+      expect(dmSentence(gible)).toContain('Field research has been reported');
+      expect(dmBrief(gible).slice(0, -1)).toEqual([
+        '**Rewards** Gible',
+        '- **Yellow Mural 1** · Market Street',
+      ]);
+    });
+
+    it('leaves a stop taken back before its turn out of the "one of" DM (R6)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      let release = (): void => undefined;
+      const gate = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      const wanting = made.targetWants.wanting.bind(made.targetWants);
+      vi.spyOn(made.targetWants, 'wanting').mockImplementationOnce(async (...args) => {
+        await gate;
+        return wanting(...args);
+      });
+      const oneOf = await made.reports.reportResearch({
+        serverId: made.gateway.guildId,
+        stops: [west(1), west(2)],
+        subject: ONE_OF,
+        reporter: RITA,
+      });
+      const first = oneOf.saved[0]?.report.id ?? 0;
+      await made.reports.takeBack(made.gateway.guildId, [first], REPORTER, false);
+      release();
+      await made.notify.flush();
+      expect(made.dms.to(ALICE).map((message) => dmBrief(message).slice(1, -1))).toEqual([
+        ['- **Yellow Mural 2** · Market Street'],
+      ]);
+    });
+
+    it('tells the reports of a task in the order they were made, whatever the look-ups take (review R6)', async () => {
+      // The server's row of the first report is slow to come.
+      let release = (): void => undefined;
+      const gate = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      let calls = 0;
+      const made = await researchWith({
+        guilds: {
+          snowflakeOf: () => Promise.resolve(undefined),
+          idFor: async () => {
+            calls += 1;
+            if (calls === 1) await gate;
+            return 1;
+          },
+        },
+      });
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reports.reportResearch({
+        serverId: made.gateway.guildId,
+        stops: [west(1), west(2)],
+        subject: ONE_OF,
+        reporter: RITA,
+      });
+      await made.reports.reportResearch({
+        serverId: made.gateway.guildId,
+        stops: [west(3)],
+        subject: GIBLE,
+        reporter: BOB_,
+      });
+      release();
+      await made.notify.flush();
+      expect(made.dms.to(ALICE).map((message) => dmBrief(message)[0])).toEqual([
+        '**Rewards** one of Gible, Larvitar, Beldum',
+        '**Rewards** Gible',
+      ]);
+    });
+
+    it('confirms in every region where each stop was told of its "one of" (review R3)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [west(1), east]);
+      await made.reportVersion(GIBLE, [west(1), east], BOB_);
+      expect(made.dms.to(ALICE).map(dmSentence).slice(2)).toEqual([
+        confirmed('**Yellow Mural 1**'),
+        confirmed(`**${east.name}**`),
+      ]);
+    });
+
+    it('confirms in a region the member views, though a stop is new in one they are kept out of (review F4)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [east]);
+      made.gateway.shutOut(WEST_CHANNEL, ALICE);
+      await made.reportVersion(GIBLE, [west(1), east], BOB_);
+      expect(made.dms.to(ALICE).map(dmSentence)).toEqual([
+        expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
+        confirmed(`**${east.name}**`),
+      ]);
+    });
+
+    it('confirms where the member’s only untold stop lies in the second region (review P1)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [east]);
+      // Alice is told of Gible at Yellow Mural 1; Rita replaces it by Beldum there.
+      await made.reportVersion(GIBLE, [west(1)], BOB_);
+      const gible = await made.reports.at(made.gateway.guildId, west(1).key);
+      await made.reportVersion(BELDUM, [west(1)], RITA, [gible?.id ?? 0]);
+      // Carol, new to both stops, is read first, for West: Alice has nothing new there.
+      await made.want(CAROL, WANT_GIBLE);
+      const beldum = await made.reports.at(made.gateway.guildId, west(1).key);
+      await made.reportVersion(GIBLE, [west(1), east], BOB_, [beldum?.id ?? 0]);
+      expect(made.dms.to(ALICE).map(dmSentence)).toEqual([
+        expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
+        expect.stringContaining(`reported in <#${WEST_CHANNEL}>`),
+        confirmed(`**${east.name}**`),
+      ]);
+      expect(made.dms.to(CAROL).map(dmSentence)).toEqual([
+        expect.stringContaining(`reported in <#${WEST_CHANNEL}>`),
+        expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
+      ]);
+    });
+
+    it('dates a DM by its report, however late its turn comes (review F6)', async () => {
+      // The server's row is slow to come: the turn comes five minutes after the report.
+      let release = (): void => undefined;
+      const gate = new Promise<void>((resolve) => {
+        release = resolve;
+      });
+      const made = await researchWith({
+        guilds: {
+          snowflakeOf: () => Promise.resolve(undefined),
+          idFor: async () => {
+            await gate;
+            return 1;
+          },
+        },
+      });
+      await made.want(ALICE, WANT_GIBLE);
+      const reportedAt = made.clock.now;
+      await made.reports.reportResearch({
+        serverId: made.gateway.guildId,
+        stops: [west(1)],
+        subject: GIBLE,
+        reporter: RITA,
+      });
+      made.clock.now = reportedAt + 5 * 60_000;
+      release();
+      await made.notify.flush();
+      expect(made.dms.jobs.map((job) => job.eventAt)).toEqual([reportedAt]);
+    });
+
+    it('sends the usual DM in every region where a stop is new to the member (review R3)', async () => {
+      const made = await researchWith();
+      await made.want(ALICE, WANT_GIBLE);
+      await made.reportVersion(ONE_OF, [west(1)]);
+      await made.reportVersion(GIBLE, [west(1), east], BOB_);
+      const [, inWest, inEast] = made.dms.to(ALICE);
+      expect([inWest, inEast].map(dmSentence)).toEqual([
+        expect.stringContaining(`reported in <#${WEST_CHANNEL}>`),
+        expect.stringContaining(`reported in <#${EAST_CHANNEL}>`),
+      ]);
+      expect(dmBrief(inWest).slice(0, -1)).toEqual([
+        '**Rewards** Gible',
+        '- **Yellow Mural 1** · Market Street',
+      ]);
+    });
+  });
+
   it('tells nobody where notifications are off', async () => {
     const made = await researchWith();
     made.settings.features.notifications = false;
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index c1643b6d44355f1e1e2a55f76b83ee71184695f4..235ed8013eb6e4470d0ee114bacdac8462bf055b 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -81,7 +81,13 @@ import {
 } from '../render/notify-dm.js';
 import type { PartyBrief } from '../render/party-post.js';
 import { gymName, shownBoss, type PostGym } from '../render/raid-post.js';
-import { periodEndWords, researchDmBrief, researchDmSentence } from '../render/research.js';
+import {
+  periodEndWords,
+  researchConfirmBrief,
+  researchConfirmSentence,
+  researchDmBrief,
+  researchDmSentence,
+} from '../render/research.js';
 import { spawnBrief, spawnSentence } from '../render/spawn.js';
 import { placeSummary } from '../render/place.js';
 import { clockOrDate, clockOrDay, plain, plainNoLinks, type NamedMember } from '../render/text.js';
@@ -98,6 +104,8 @@ import { isHideoutReport, type ResearchNews } from './stop-reports.js';
 import type { RocketNews } from './rocket-reports.js';
 import { gruntHourNote, rocketDmBrief, rocketDmSentence } from '../render/rocket.js';
 import type { StopReport } from '../domain/stops/report.js';
+import { isOneOf, researchSubjectOf, taskOfSubject } from '../domain/research/reports.js';
+import type { TaskReward } from '../domain/research/task.js';
 
 /**
  * Change… of a reason (plan 8R-4, design 4): a want of a Pokémon in raids, spawns or as a shadow
@@ -249,6 +257,12 @@ export interface NotifyServiceOptions {
   researchPosts?: {
     messageOf(channelId: string, subjectKey: string): Promise<string | undefined>;
   };
+  /**
+   * The research reports as they are kept now (`StopReportService.kept`; plan 8R-5, R6): a "one
+   * of" reads its reports again when its turn comes and leaves out the stops replaced since.
+   * Without it, it names every stop it was reported at.
+   */
+  stopReports?: { kept(serverId: string, id: number): Promise<StopReport | undefined> };
   gyms: { get(id: number): PostGym | undefined };
   gameData: GameDataProvider;
   raidBosses: Pick<RaidBossProvider, 'bosses'>;
@@ -801,11 +815,25 @@ export class NotifyService implements PartyNotifier {
    * in the period is not told of it there again (`researchTold`): a later report of the task at
    * more stops names only the new ones. The DM ends with the report and links to the message of
    * the pinned post that holds the task (`researchPosts`; none in rehearsal mode).
+   *
+   * The task's line (R3) and the DMs' time (`eventAt`, and the start of `periodEndWords`; review
+   * F6) are taken here, as the report is made (review R6): what is read before
+   * anybody is told (the server's row, the reports as they stand now) is read when its turn
+   * comes, so the reports of a task are told in the order they were made.
    */
   researchReported(news: ResearchNews): void {
     this.safely('field research', () => {
       if (!this.enabled || !this.options.targetWants || this.closed) return;
-      const work = this.announceResearch(news)
+      const [first] = news.reports;
+      if (!first) return;
+      // The DMs' time is the report's, however late its turn comes (review F6).
+      const reportedAt = this.now();
+      const work = this.lines
+        .run(`research:${news.serverId}:${taskOfSubject(first.subjectKey)}`, async () => {
+          for (const event of await this.researchEvents(news, reportedAt)) {
+            await this.deliver(event);
+          }
+        })
         .catch((err: unknown) => {
           this.options.log.error(
             { err, guild: news.serverId },
@@ -817,15 +845,36 @@ export class NotifyService implements PartyNotifier {
     });
   }
 
-  private async announceResearch(news: ResearchNews): Promise<void> {
-    const { regions, guilds, targetWants, gameData, researchPosts, log } = this.options;
+  /**
+   * What research news tells, one event per region channel its stops lie in, read when its turn
+   * in the task's line comes. Whether a member's message confirms (R4, R5) is decided once for
+   * every channel (review R3): a confirmation where each of the news' stops they were not told of
+   * yet, in the channels they view (review F4), was told of the task's "one of", else the usual
+   * DM; each channel's DM then names that channel's stops.
+   */
+  private async researchEvents(news: ResearchNews, reportedAt: number): Promise<Announcement[]> {
+    const { regions, guilds, members, targetWants, gameData, researchPosts, stopReports, log } =
+      this.options;
     const [first] = news.reports;
-    if (!first || !targetWants) return;
+    if (!first || !targetWants) return [];
     const { research, subjectKey } = first;
+    // Every version of a task is told in the task's line (R3), and "told" of its "one of" is told
+    // of the task's key alone at a stop: what a narrowing confirms (R5).
+    const task = taskOfSubject(subjectKey);
+    const oneOf = isOneOf(first);
+    const narrows = researchSubjectOf(subjectKey)?.hash !== undefined;
+    const toldKey = (memberId: string, report: StopReport, subject = subjectKey): string =>
+      `${news.serverId} ${memberId} ${report.periodKey} ${subject} ${report.stop.key}`;
+    // The reporter of a "one of" this replaced knows of the task there, as if told (R5).
+    for (const replaced of news.replaced) {
+      if (replaced.subjectKey === task && isOneOf(replaced)) {
+        this.researchTold.set(toldKey(replaced.reporter.id, replaced, task), true);
+      }
+    }
     const targets = researchTargets(research.rewards);
-    if (targets.length === 0) return;
+    if (targets.length === 0) return [];
     const row = await guilds.idFor(news.serverId);
-    if (row === undefined) return;
+    if (row === undefined) return [];
     // The reports by the region channels their stops lie in; a stop in two regions is in both.
     const byChannel = new Map<string, StopReport[]>();
     for (const report of news.reports) {
@@ -833,28 +882,92 @@ export class NotifyService implements PartyNotifier {
         byChannel.set(region.channelId, [...(byChannel.get(region.channelId) ?? []), report]);
       }
     }
-    const toldKey = (memberId: string, report: StopReport): string =>
-      `${news.serverId} ${memberId} ${report.periodKey} ${subjectKey} ${report.stop.key}`;
-    const untold = (memberId: string, reports: readonly StopReport[]): StopReport[] =>
-      reports.filter((report) => !this.researchTold.has(toldKey(memberId, report)));
-    for (const [channelId, reports] of byChannel) {
-      const eventAt = this.now();
+    // The ids of the reports as they stand (R6): a "one of" replaced or taken back since its
+    // report is left out. Read once, by the first channel's event once it has read the wants (as
+    // late as can be), and the same for every channel, so that the kind of a member's message is
+    // decided on one reading.
+    let standing: ReadonlySet<number> = new Set(news.reports.map((report) => report.id));
+    let reading: Promise<ReadonlySet<number>> | undefined;
+    const standingNow = async (): Promise<ReadonlySet<number>> => {
+      if (!oneOf || !stopReports) return standing;
+      reading ??= Promise.all(
+        news.reports.map((report) => stopReports.kept(news.serverId, report.id)),
+      ).then(
+        (kept) =>
+          new Set(
+            news.reports
+              .filter((report, index) => kept[index]?.madeAt === report.madeAt)
+              .map((report) => report.id),
+          ),
+      );
+      return reading;
+    };
+    /** A report of the news a member was not told of at its stop yet, still standing. */
+    const isNews = (memberId: string, report: StopReport): boolean =>
+      standing.has(report.id) && !this.researchTold.has(toldKey(memberId, report));
+    // Who of the members it may tell views each region channel (review F4): read once, by the
+    // first channel's event, for every member with an untold stop in any channel (review P1),
+    // where a confirmation can be sent and the stops lie in several channels; a channel whose
+    // viewers could not be read counts for everybody (the usual DM).
+    let viewing: ReadonlyMap<string, ReadonlySet<string> | undefined> = new Map();
+    let readingViewers: Promise<typeof viewing> | undefined;
+    const viewersNow = (guildId: string, ids: readonly string[]): Promise<typeof viewing> => {
+      if (!narrows || byChannel.size < 2 || ids.length === 0) return Promise.resolve(viewing);
+      readingViewers ??= Promise.all(
+        [...byChannel.keys()].map(async (channelId) => {
+          const seeing = await members.viewers(guildId, channelId, ids).catch((err: unknown) => {
+            log.warn({ err, channel: channelId }, 'could not find out who can see a channel');
+            return undefined;
+          });
+          return [channelId, seeing] as const;
+        }),
+      ).then((entries) => new Map(entries));
+      return readingViewers;
+    };
+    /** Whether the member may be told of a report: they view a channel its stop lies in. */
+    const viewed = (memberId: string, report: StopReport): boolean =>
+      [...byChannel].some(
+        ([channelId, reports]) =>
+          reports.includes(report) && (viewing.get(channelId)?.has(memberId) ?? true),
+      );
+    const inAny = [...new Set([...byChannel.values()].flat())];
+    /** Whether a member is sent confirmations, decided at their first message of the news. */
+    const confirming = new Map<string, boolean>();
+    const confirms = (memberId: string): boolean => {
+      let decided = confirming.get(memberId);
+      if (decided === undefined) {
+        // Only the stops of the channels they view (review F4).
+        const untold = inAny.filter(
+          (report) => isNews(memberId, report) && viewed(memberId, report),
+        );
+        decided =
+          narrows &&
+          untold.length > 0 &&
+          untold.every((report) => this.researchTold.has(toldKey(memberId, report, task)));
+        confirming.set(memberId, decided);
+      }
+      return decided;
+    };
+    return [...byChannel].map(([channelId, reported]): Announcement => {
+      const eventAt = reportedAt;
       let messageId: string | undefined;
-      this.announce({
-        // One line per task of a server: the second region's DM knows what the first one told.
-        key: `research:${news.serverId}:${subjectKey}`,
+      const untold = (memberId: string): StopReport[] =>
+        reported.filter((report) => isNews(memberId, report));
+      return {
+        key: `research:${news.serverId}:${task}`,
         partyId: undefined,
         guild: news.serverId,
         channelId,
         actorId: news.reporter.id,
         eventAt,
-        expiresAt: Math.min(...reports.map((report) => report.endsAt)),
+        expiresAt: Math.min(...reported.map((report) => report.endsAt)),
         gather: async (guildId) => {
           const wanting = new Map<string, readonly TargetWant[]>();
           for (const found of await targetWants.wanting(guildId, targets)) {
             wanting.set(found.memberId, found.wants);
           }
-          if (wanting.size > 0 && researchPosts) {
+          standing = await standingNow();
+          if (wanting.size > 0 && researchPosts && reported.some(({ id }) => standing.has(id))) {
             messageId = await researchPosts
               .messageOf(channelId, subjectKey)
               .catch((err: unknown) => {
@@ -862,46 +975,71 @@ export class NotifyService implements PartyNotifier {
                 return undefined;
               });
           }
+          const ids = [...wanting.keys()].filter((id) => untold(id).length > 0);
+          viewing = await viewersNow(
+            guildId,
+            [...wanting.keys()].filter((id) => inAny.some((report) => isNews(id, report))),
+          );
           return {
-            ids: [...wanting.keys()].filter((id) => untold(id, reports).length > 0),
+            ids,
             reasonsOf: (id) =>
               researchWantsFiring(gameData.catalogue, wanting.get(id) ?? [], research.rewards).map(
                 (want): NotifyReason => ({ kind: 'target', want }),
               ),
           };
         },
+        // What a member's message names, and whether it confirms (R4).
         variant: (id) =>
-          untold(id, reports)
+          `${confirms(id) ? 'confirm' : 'news'} ${untold(id)
             .map((report) => report.stop.key)
-            .join(' '),
-        message: (guildId, reasons, memberId) =>
-          notifyDm(
+            .join(' ')}`,
+        message: (guildId, reasons, memberId) => {
+          const stops = untold(memberId).map((report) => report.stop);
+          const until = periodEndWords(news.period.end, eventAt, this.options.settings.timezone);
+          const links =
+            messageId === undefined ? [] : [postButton(postLink(guildId, channelId, messageId))];
+          const shown = reasons.map((reason) => this.shown(guildId, reason));
+          if (confirms(memberId)) {
+            return notifyDm(
+              {
+                sentence: researchConfirmSentence({ stops, rewards: research.rewards }),
+                brief: researchConfirmBrief({ research, until }),
+                links,
+              },
+              shown,
+            );
+          }
+          // The member's own rewards first (R12): a "one of" may not be theirs.
+          const wants = reasons.flatMap((reason) =>
+            reason.kind === 'target' ? [reason.want] : [],
+          );
+          const theirs = (reward: TaskReward): boolean =>
+            researchWantsFiring(gameData.catalogue, wants, [reward]).length > 0;
+          const rewards = [
+            ...research.rewards.filter(theirs),
+            ...research.rewards.filter((reward) => !theirs(reward)),
+          ];
+          return notifyDm(
             {
               sentence: researchDmSentence({
                 research,
                 regionChannelId: channelId,
                 reporter: news.reporter,
               }),
-              brief: researchDmBrief({
-                research,
-                stops: untold(memberId, reports).map((report) => report.stop),
-                until: periodEndWords(news.period.end, eventAt, this.options.settings.timezone),
-              }),
-              links:
-                messageId === undefined
-                  ? []
-                  : [postButton(postLink(guildId, channelId, messageId))],
+              brief: researchDmBrief({ research: { rewards }, stops, until }),
+              links,
             },
-            reasons.map((reason) => this.shown(guildId, reason)),
-          ),
+            shown,
+          );
+        },
         priority: () => DM_PRIORITY.normal,
         sent: (id) => {
-          for (const report of untold(id, reports)) {
+          for (const report of untold(id)) {
             this.researchTold.set(toldKey(id, report), true);
           }
         },
-      });
-    }
+      };
+    });
   }
 
   /**
````

### Task 5: 8R-5 task 5: The pinned post by task and version

Prototype commit: `8130a3a8570f036f66e358c1220a487381a7523f`

The post groups research by task (the subject read by researchSubjectOf),
then by version: a task of one version keeps its rewards beside it; one of
several has a line of each version's rewards before its stops, the rewards'
versions first and "one of" last, with one picture. Tasks are ordered by
their stops in all and counted as tasks; the task's key and every version's
place the block's message, so a DM of any version links it.

**Files:**

```
 src/domain/research/reports.ts  |   5 ++--
 src/render/stop-post.test.ts    | 119 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------
 src/render/stop-post.ts         |  89 +++++++++++++++++++++++++++++++++++++++++++++++-------------
 src/services/stop-posts.test.ts |  99 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/services/stop-posts.ts      |  86 ++++++++++++++++++++++++++++++++++++++++++++++++----------
 src/services/stop-reports.ts    |  14 ++++++++++
 6 files changed, 366 insertions(+), 46 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/stop-post.test.ts src/services/stop-posts.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8130a3a8570f036f66e358c1220a487381a7523f -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-5 task 5: The pinned post by task and version`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/research/reports.ts b/src/domain/research/reports.ts
index 04e2dc016d21d852650c2deed8999a947e855870..0604528ddb82f715f322cb05fafa8c3bd59d6cc9 100644
--- a/src/domain/research/reports.ts
+++ b/src/domain/research/reports.ts
@@ -72,9 +72,10 @@ export type ResearchDecision = 'new' | 'narrow' | 'less' | 'again' | 'asks' | 'c
  * A report's version as the decision sees it: its task, its reward's hash, or none where it
  * stands for its task's rewards together. A task's key alone with one reward in its detail is
  * that reward's version (R10: a report of before, of a task of one reward); with none or two
- * or more it is open ("one of", a typed task without its reward).
+ * or more it is open ("one of", a typed task without its reward). The pinned post groups by it
+ * too (review R2).
  */
-function versionOf(report: ResearchAt): { task: string; hash: string | undefined } | undefined {
+export function versionOf(report: ResearchAt): ResearchSubjectKey | undefined {
   const subject = researchSubjectOf(report.subjectKey);
   if (!subject) return undefined;
   if (subject.hash !== undefined) return subject;
diff --git a/src/render/stop-post.test.ts b/src/render/stop-post.test.ts
index 8c1567230336619d0088145d91870ab34b5b09c7..67acac7054d5bb8574aba302c3fa63d77bb39f9d 100644
--- a/src/render/stop-post.test.ts
+++ b/src/render/stop-post.test.ts
@@ -8,8 +8,12 @@ import { stopPostMessages, stopPostText, type PostHideout, type PostTask } from
 
 const DRAGON = pageTask('Catch a Dragon-type Pokémon');
 
-/** The dragon task at `n` stops, each by a reporter of its own. */
-function atStops(n: number, key = 'dragon'): PostTask {
+/** The dragon task at `n` stops (or `stops`), each by a reporter of its own: one version. */
+function atStops(
+  n: number,
+  key = 'dragon',
+  stops?: PostTask['versions'][number]['stops'],
+): PostTask {
   return {
     key,
     research: {
@@ -18,10 +22,18 @@ function atStops(n: number, key = 'dragon'): PostTask {
       rewards: DRAGON.rewards,
       typed: false,
     },
-    stops: Array.from({ length: n }, (_, i) => ({
-      stop: reportedStop(i + 1, { name: `Stop ${'x'.repeat(60)} ${String(i + 1)}` }),
-      reporter: { id: `20000000000000${String(1000 + i)}`, name: `Member ${String(i)}` },
-    })),
+    versions: [
+      {
+        key,
+        rewards: DRAGON.rewards,
+        stops:
+          stops ??
+          Array.from({ length: n }, (_, i) => ({
+            stop: reportedStop(i + 1, { name: `Stop ${'x'.repeat(60)} ${String(i + 1)}` }),
+            reporter: { id: `20000000000000${String(1000 + i)}`, name: `Member ${String(i)}` },
+          })),
+      },
+    ],
   };
 }
 
@@ -49,6 +61,92 @@ describe('the post "Today at the stops"', () => {
     );
   });
 
+  it('shows a task’s versions in one block, a line before each one’s stops, one picture (plan 8R-5)', () => {
+    const [lileep, anorith] = pageTask('Make 3 Great Throws in a row').rewards;
+    const by = (n: number) => ({
+      stop: reportedStop(n, { name: `Stop ${String(n)}`, address: null }),
+      reporter: { id: `20000000000000${String(1000 + n)}`, name: `Member ${String(n)}` },
+    });
+    const task: PostTask = {
+      key: 'task',
+      research: { text: 'Make 3 Great Throws in a row', category: null, rewards: [], typed: false },
+      versions: [
+        { key: 'task:0000000a', rewards: [lileep!], stops: [by(1), by(2)] },
+        { key: 'task', rewards: [lileep!, anorith!], stops: [by(3)] },
+      ],
+    };
+    const layout = stopPostMessages({ day: 'Saturday, November 21', tasks: [task] });
+    const text = textOf(layout.messages[0]);
+    expect(text).toContain(
+      [
+        '**Make 3 Great Throws in a row**',
+        'Lileep',
+        '- **Stop 1** · **Member 1**',
+        '- **Stop 2** · **Member 2**',
+        'one of Lileep, Anorith',
+        '- **Stop 3** · **Member 3**',
+      ].join('\n'),
+    );
+    expect(JSON.stringify(layout.messages[0]).match(/pokemon_icons_crop/g)).toHaveLength(1);
+    expect([...layout.placement]).toEqual([
+      ['task', 0],
+      ['task:0000000a', 0],
+    ]);
+  });
+
+  /** A task of several versions at `perVersion` stops each, the last without a reward said. */
+  function versioned(n: number, perVersion: number): PostTask {
+    const [lileep, anorith] = pageTask('Make 3 Great Throws in a row').rewards;
+    const at = (version: number) =>
+      Array.from({ length: perVersion }, (_, i) => ({
+        stop: reportedStop(100 * version + i + 1, {
+          name: `Stop ${'y'.repeat(50)} ${String(n)}-${String(version)}-${String(i)}`,
+        }),
+        reporter: { id: `20000000000000${String(1000 + i)}`, name: `Member ${'z'.repeat(40)}` },
+      }));
+    return {
+      key: `task${String(n)}`,
+      research: {
+        text: `Task ${String(n)} ${'w'.repeat(80)}`,
+        category: null,
+        rewards: [],
+        typed: true,
+      },
+      versions: [
+        { key: `task${String(n)}:0000000a`, rewards: [lileep!], stops: at(1) },
+        { key: `task${String(n)}`, rewards: [lileep!, anorith!], stops: at(2) },
+        { key: `task${String(n)}:x`, rewards: [], stops: at(3) },
+      ],
+    };
+  }
+
+  it('gives a version without its reward said a line of its own among others (review R1)', () => {
+    const task = versioned(1, 1);
+    for (const text of [
+      textOf(stopPostMessages({ day: 'Saturday, November 21', tasks: [task] }).messages[0]),
+      stopPostText({ day: 'Saturday, November 21', tasks: [task] }).messages[0]?.content ?? '',
+    ]) {
+      const lines = text.split('\n');
+      const at = lines.findIndex((line) => line.includes('1-3-0'));
+      expect(lines[at - 1]).toBe('reward not said');
+      expect(lines[at - 3]).toBe('one of Lileep, Anorith');
+      expect(lines[at - 5]).toBe('Lileep');
+    }
+  });
+
+  it('keeps many tasks of several versions within Discord’s limits', () => {
+    const view = {
+      day: 'Saturday, November 21',
+      tasks: Array.from({ length: 30 }, (_, n) => versioned(n, 4)),
+    };
+    const { messages } = stopPostMessages(view);
+    expect(messages).toHaveLength(3);
+    for (const message of messages) expectV2Sendable(message);
+    expect(textOf(messages[2])).toMatch(/…and \d+ more tasks$/);
+    const classic = stopPostText(view).messages;
+    for (const message of classic) expect(message.content?.length).toBeLessThanOrEqual(2_000);
+  });
+
   it('is classic text of at most 2,000 characters a message, three at most', () => {
     const many = Array.from({ length: 30 }, () => atStops(10));
     const { messages } = stopPostText({ day: 'Saturday, November 21', tasks: many });
@@ -59,9 +157,10 @@ describe('the post "Today at the stops"', () => {
 
   it('names whole stop lines only, counting those that do not fit (B6)', () => {
     // Long names and addresses with marks that escaping lengthens, long reporters' names.
-    const task: PostTask = {
-      ...atStops(0),
-      stops: Array.from({ length: 15 }, (_, i) => ({
+    const task: PostTask = atStops(
+      0,
+      'dragon',
+      Array.from({ length: 15 }, (_, i) => ({
         stop: reportedStop(i + 1, {
           name: `The_Old *Mural* of the ${'Long_'.repeat(13)}Street ${String(i + 1)}`,
           address: `${String(1000 + i)} ${'Market_Street '.repeat(5)}Pittsburgh`,
@@ -71,7 +170,7 @@ describe('the post "Today at the stops"', () => {
           name: `Trainer_${'Name_'.repeat(18)}${String(i)}`,
         },
       })),
-    };
+    );
     const lines = (text: string) => text.split('\n').filter((line) => line.startsWith('- '));
     const view = { day: 'Saturday, November 21', tasks: [task] };
     const [v2] = stopPostMessages(view).messages;
diff --git a/src/render/stop-post.ts b/src/render/stop-post.ts
index 462bb6f381cfd12d9508411c221ba5b7fd274c15..3c945f6a041e9e9fdbf8916e0585b2802150a16b 100644
--- a/src/render/stop-post.ts
+++ b/src/render/stop-post.ts
@@ -33,12 +33,25 @@ interface PostStop {
   reporter: Reporter;
 }
 
-/** A task of the post with the stops it was reported at. */
+/**
+ * A version of a task in the post (plan 8R-5): its subject (`StopReport.subjectKey`), the
+ * rewards it stands for, and the stops it was reported at.
+ */
+export interface PostVersion {
+  key: string;
+  rewards: readonly TaskReward[];
+  stops: PostStop[];
+}
+
+/**
+ * A task of the post (plan 8R-5, R9: one block per task): its key (`taskOfSubject`), its text as
+ * reported, and its versions with their stops, the rewards' first and "one of" last. A DM links
+ * to the message holding the task by any of the keys.
+ */
 export interface PostTask {
-  /** What the reports are of (`StopReport.subjectKey`): a DM links to the message holding it. */
   key: string;
   research: ResearchDetail;
-  stops: PostStop[];
+  versions: PostVersion[];
 }
 
 /**
@@ -73,7 +86,8 @@ export interface StopPostView {
 
 /** A part of the post that stays in one message: a task or a hideout. */
 interface Block {
-  key: string;
+  /** What a DM finds it by: a task's key and its versions' (R9), a hideout's `rocketKey`. */
+  keys: string[];
   kind: 'task' | 'hideout';
   /** Its text in at most `room` characters, by whole lines. */
   body: (room: number) => string;
@@ -97,33 +111,70 @@ function moreStops(left: number): string {
  * counted.
  */
 function stopsBody(head: string, stops: readonly PostStop[], room: number): string {
+  return groupsBody(head, [{ stops }], room);
+}
+
+/**
+ * A head and groups of stops, each under its own line where it has one (a task's versions, plan
+ * 8R-5), as text of at most `room` characters: whole lines only, `STOPS_SHOWN` stops at most in
+ * all, a group's line only with at least one of its stops, then the rest counted.
+ */
+function groupsBody(
+  head: string,
+  groups: readonly { line?: string; stops: readonly PostStop[] }[],
+  room: number,
+): string {
+  const total = groups.reduce((sum, group) => sum + group.stops.length, 0);
   const lines: string[] = [];
   let used = head.length;
-  for (const [index, { stop, reporter }] of stops.slice(0, STOPS_SHOWN).entries()) {
-    const line = `- ${stopLine(stop)} · ${memberByName(reporter)}`;
-    const left = stops.length - index - 1;
-    const tail = left > 0 ? 1 + moreStops(left).length : 0;
-    if (used + 1 + line.length + tail > room) break;
-    lines.push(line);
-    used += 1 + line.length;
+  let shown = 0;
+  fill: for (const group of groups) {
+    for (const [index, { stop, reporter }] of group.stops.entries()) {
+      if (shown >= STOPS_SHOWN) break fill;
+      const own = `- ${stopLine(stop)} · ${memberByName(reporter)}`;
+      const line = index === 0 && group.line !== undefined ? `${group.line}\n${own}` : own;
+      const left = total - shown - 1;
+      const tail = left > 0 ? 1 + moreStops(left).length : 0;
+      if (used + 1 + line.length + tail > room) break fill;
+      lines.push(line);
+      used += 1 + line.length;
+      shown += 1;
+    }
   }
-  const more = stops.length - lines.length;
+  const more = total - shown;
   return [head, ...lines, ...(more > 0 ? [moreStops(more)] : [])].join('\n');
 }
 
+/** The line of a version among others whose reward was not said. */
+const REWARD_NOT_SAID = 'reward not said';
+
 /** The heading of the Rocket section, over its first hideout. */
 const ROCKET_HEADING = '### Team GO Rocket hideouts';
 
 /** The blocks of a view: its tasks, then its hideouts under their heading. */
 function blocksOf(view: StopPostView): Block[] {
   const tasks = view.tasks.map((task): Block => {
-    const rewards = rewardWords(task.research.rewards);
+    const keys = [task.key, ...task.versions.map((version) => version.key)];
+    const [only, ...others] = task.versions;
+    // One version: its rewards beside the task, as before plan 8R-5. Several: a line of each
+    // version's rewards before its stops (R9).
+    const single = only !== undefined && others.length === 0;
+    const rewards = single ? rewardWords(only.rewards) : '';
     const head = `**${taskText(task.research)}**${rewards === '' ? '' : ` · ${rewards}`}`;
+    // A version whose reward was not said (a typed task without `reward:`) has a line of its own
+    // too, else its stops would run on under the version before it (review R1).
+    const groups = task.versions.map((version) => {
+      const line = rewardWords(version.rewards);
+      return single
+        ? { stops: version.stops }
+        : { line: line === '' ? REWARD_NOT_SAID : line, stops: version.stops };
+    });
     return {
-      key: task.key,
+      keys: [...new Set(keys)],
       kind: 'task',
-      body: (room) => stopsBody(head, task.stops, room),
-      picture: pictureOf(task.research.rewards),
+      body: (room) => groupsBody(head, groups, room),
+      // One picture: the first version's that has one.
+      picture: pictureOf(task.versions.flatMap((version) => version.rewards)),
     };
   });
   const hideouts = (view.hideouts ?? []).map((hideout, index): Block => {
@@ -132,7 +183,7 @@ function blocksOf(view: StopPostView): Block[] {
       `${index === 0 ? `${ROCKET_HEADING}\n` : ''}**${plain(hideout.name)}**` +
       `${catches === '' ? '' : ` · catch ${catches}`}`;
     return {
-      key: hideout.key,
+      keys: [hideout.key],
       kind: 'hideout',
       body: (room) => stopsBody(head, hideout.stops, room),
       picture: hideout.catches.find((one) => one.image !== null)?.image ?? undefined,
@@ -211,7 +262,7 @@ export function stopPostMessages(view: StopPostView): PostLayout<V2Message> {
       messages.push(parts);
       parts = [textDisplay(headText(view, messages.length)), ...own];
     }
-    placement.set(block.key, messages.length);
+    for (const key of block.keys) placement.set(key, messages.length);
     shown += 1;
   }
   if (shown < blocks.length) parts.push(textDisplay(leftLine(blocks.slice(shown))));
@@ -268,7 +319,7 @@ export function stopPostText(view: StopPostView): PostLayout<ClassicMessage> {
       messages.push(current);
       current = text;
     }
-    placement.set(block.key, messages.length);
+    for (const key of block.keys) placement.set(key, messages.length);
     shown += 1;
   }
   if (shown < blocks.length) current = `${current}\n${leftLine(blocks.slice(shown))}`;
diff --git a/src/services/stop-posts.test.ts b/src/services/stop-posts.test.ts
index 3645c1ae6293fcbc977d2e56ff7e60bf1dede4a4..d65f47ed8657be0b1510d11873ced63cbb098bc9 100644
--- a/src/services/stop-posts.test.ts
+++ b/src/services/stop-posts.test.ts
@@ -5,7 +5,11 @@ import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from '../../test/support/gyms.js';
 import { textOf } from '../../test/support/messages.js';
 import { expectV2Sendable } from '../../test/support/post-limits.js';
-import { pageTask, researchTasksOfPage } from '../../test/support/research.js';
+import {
+  pageTask,
+  researchTasksFixture,
+  researchTasksOfPage,
+} from '../../test/support/research.js';
 import { INTO_THE_WILD, PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
 import { MemoryStopPosts } from '../../test/support/research-store.js';
 import { feedChoice } from '../../test/support/rocket.js';
@@ -14,6 +18,7 @@ import { rocketSubject } from './rocket-reports.js';
 import { MemoryStopReports, fixtureRewardHash } from '../../test/support/stop-reports.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import type { ResearchTask } from '../domain/research/task.js';
+import type { TaskVersion } from '../domain/research/versions.js';
 import type { ResearchEvent } from '../domain/time/research-events.js';
 import { StopPostService } from './stop-posts.js';
 import { StopReportService } from './stop-reports.js';
@@ -81,6 +86,21 @@ function postsWith(initial: ResearchEvent[] = []) {
       },
       reporter: ASH,
     });
+  const reportVersion = (task: ResearchTask, version: TaskVersion, stops = [west(1)]) =>
+    reports.reportResearch({
+      serverId: FAKE_GUILD_ID,
+      stops,
+      subject: {
+        subjectKey: version.value,
+        research: {
+          text: task.text,
+          category: task.category,
+          rewards: version.rewards,
+          typed: false,
+        },
+      },
+      reporter: ASH,
+    });
   const said = (channelId = WEST_CHANNEL) =>
     gateway
       .messagesIn(channelId)
@@ -94,6 +114,7 @@ function postsWith(initial: ResearchEvent[] = []) {
     posts,
     make,
     report,
+    reportVersion,
     said,
     entries,
     setEvents,
@@ -141,6 +162,82 @@ describe('StopPostService', () => {
     ]);
   });
 
+  it('puts every version of a task in its one block, linked by each (plan 8R-5, R9)', async () => {
+    made = postsWith();
+    const throws = pageTask('Make 3 Excellent Throws in a row');
+    const versions = researchTasksFixture().versions(throws);
+    const version = (label: string) => {
+      const found = versions.find((one) => one.label === label);
+      if (!found) throw new Error(`no version ${label}`);
+      return found;
+    };
+    await made.reportVersion(throws, version('Gible'), [west(1)]);
+    await made.reportVersion(throws, version('one of Larvitar, Beldum, Gible'), [west(2), west(3)]);
+    await made.reportVersion(throws, version('Beldum'), [west(4)]);
+    await made.report(pageTask('Catch 7 Pokémon'), [west(5), west(6), west(7)]);
+    await made.posts.flush();
+    const stop = (n: number) => `- **Yellow Mural ${String(n)}** · Market Street · **Ash**`;
+    // The task of most stops first; its rewards' stops, then those of "one of".
+    expect(made.said()[0]).toContain(
+      [
+        '**Make 3 Excellent Throws in a row**',
+        'Gible',
+        stop(1),
+        'Beldum',
+        stop(4),
+        'one of Larvitar, Beldum, Gible',
+        stop(2),
+        stop(3),
+      ].join('\n'),
+    );
+    expect(made.said()[0]).toContain(
+      `**Catch 7 Pokémon** · one of Magikarp, Stufful, Wimpod\n${stop(5)}`,
+    );
+    expect(made.said()[0]?.indexOf('Make 3 Excellent')).toBeLessThan(
+      made.said()[0]?.indexOf('Catch 7') ?? 0,
+    );
+    // Every version and the task's key alone link the block's message; the tasks are counted.
+    const [first] = made.gateway.messagesIn(WEST_CHANNEL);
+    for (const key of [throws.key, version('Gible').value, version('Beldum').value]) {
+      expect(await made.posts.messageOf(WEST_CHANNEL, key)).toBe(first?.id);
+    }
+    expect(made.posts.summaryOf(WEST_CHANNEL)?.tasks).toBe(2);
+  });
+
+  it('groups a report of before plan 8R-5 under the version it is (review R2)', async () => {
+    made = postsWith();
+    const excellent = pageTask('Make 2 Excellent Throws');
+    const great = pageTask('Make 3 Great Throws in a row');
+    const versionOf = (task: ResearchTask, label: string) => {
+      const found = researchTasksFixture()
+        .versions(task)
+        .find((one) => one.label === label);
+      if (!found) throw new Error(`no version ${label}`);
+      return found;
+    };
+    // A task of one reward: its key alone (before) and its reward's version are one.
+    await made.report(excellent, [west(1)]);
+    await made.reportVersion(excellent, versionOf(excellent, 'Dratini'), [west(2)]);
+    // "One of" before (every reward, items too) and now: one group, in the newer words.
+    await made.report(great, [west(3)]);
+    await made.reportVersion(great, versionOf(great, 'one of Lileep, Anorith'), [west(4)]);
+    await made.reportVersion(great, versionOf(great, 'Lileep'), [west(5)]);
+    await made.posts.flush();
+    const stop = (n: number) => `- **Yellow Mural ${String(n)}** · Market Street · **Ash**`;
+    const [text] = made.said();
+    expect(text).toContain(`**Make 2 Excellent Throws** · Dratini\n${stop(1)}\n${stop(2)}`);
+    expect(text).toContain(
+      [
+        '**Make 3 Great Throws in a row**',
+        'Lileep',
+        stop(5),
+        'one of Lileep, Anorith',
+        stop(3),
+        stop(4),
+      ].join('\n'),
+    );
+  });
+
   it('tells the summary what its post holds and when it changes, and when it goes (plan 8X-G)', async () => {
     vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
     made = postsWith();
diff --git a/src/services/stop-posts.ts b/src/services/stop-posts.ts
index 1a213e53e67ef5f33f908c816ff468905ef52e7b..9f8b31b799699a59f4722bf655d81596caac859a 100644
--- a/src/services/stop-posts.ts
+++ b/src/services/stop-posts.ts
@@ -15,6 +15,8 @@ import {
   type RocketReport,
 } from '../domain/stops/report.js';
 import { nextPeriodChange } from '../domain/time/research-periods.js';
+import { taskOfSubject, type ResearchSubjectKey } from '../domain/research/reports.js';
+import { versionValue } from '../domain/research/versions.js';
 import type { Logger } from '../log.js';
 import {
   stopPostMessages,
@@ -22,6 +24,7 @@ import {
   type PostLayout,
   type PostHideout,
   type PostTask,
+  type PostVersion,
   type StopPostView,
 } from '../render/stop-post.js';
 import type { Region } from '../db/repositories/region-repository.js';
@@ -39,7 +42,8 @@ const MAX_TIMER_MS = 2 ** 31 - 1;
 
 export interface StopPostServiceOptions {
   storage: StopPostStorage;
-  reports: Pick<StopReportService, 'standing' | 'period' | 'listen'>;
+  /** The reports, and the version of each (`versionOf`, review R2), by which the post groups. */
+  reports: Pick<StopReportService, 'standing' | 'period' | 'listen' | 'versionOf'>;
   events: ResearchEventProvider;
   regions: { all(): readonly Region[] };
   /** The row of a server in `Guild` (its regions name it so), by its snowflake. */
@@ -249,7 +253,7 @@ export class StopPostService {
     const hideouts = standing.filter(isRocketReport).filter(isHideoutReport);
     return {
       day: DateTime.fromMillis(now, { zone: this.options.zone }).toFormat('cccc, LLLL d'),
-      tasks: grouped(shown),
+      tasks: grouped(shown, (report) => this.options.reports.versionOf(report)),
       hideouts: hideoutsOf(hideouts),
       event: period.event?.name,
       until: period.kind === 'day' ? undefined : periodEndWords(period.end, now, this.options.zone),
@@ -533,23 +537,77 @@ export function hideoutsOf(reports: readonly RocketReport[]): PostHideout[] {
   return [...byWho.values()].sort((a, b) => rank(a.key) - rank(b.key));
 }
 
-/** Reports grouped by task: most stops first, then by the first report. */
-export function grouped(reports: readonly ResearchReport[]): PostTask[] {
-  const bySubject = new Map<string, PostTask & { first: number }>();
+/**
+ * Reports grouped by task (plan 8R-5, R9: the subject read by `researchSubjectOf`), then by
+ * version as the decision sees it (`versionOf`, review R2: a report of before plan 8R-5 of a task
+ * of one reward is that reward's version, R10; "one of" before and now are one), each in the
+ * words of its newest report: the tasks of most stops in all first, then by the first report;
+ * within a task the versions of a reward first (most stops first, then by the first report),
+ * then the open ones ("one of", a typed task without its reward).
+ */
+export function grouped(
+  reports: readonly ResearchReport[],
+  versionOf: (report: ResearchReport) => ResearchSubjectKey | undefined,
+): PostTask[] {
+  type Collected = PostVersion & { first: number; newest: number; open: boolean };
+  const byTask = new Map<
+    string,
+    { task: PostTask; first: number; versions: Map<string, Collected> }
+  >();
   for (const report of reports) {
-    const known = bySubject.get(report.subjectKey);
+    const version = versionOf(report);
+    const taskKey = version?.task ?? taskOfSubject(report.subjectKey);
+    const versionKey =
+      version === undefined ? report.subjectKey : versionValue(version.task, version.hash);
+    let task = byTask.get(taskKey);
+    if (!task) {
+      task = {
+        task: { key: taskKey, research: report.research, versions: [] },
+        first: report.madeAt,
+        versions: new Map(),
+      };
+      byTask.set(taskKey, task);
+    }
     const stop = { stop: report.stop, reporter: report.reporter };
-    if (known) known.stops.push(stop);
-    else {
-      bySubject.set(report.subjectKey, {
-        key: report.subjectKey,
-        research: report.research,
+    const known = task.versions.get(versionKey);
+    if (known) {
+      known.stops.push(stop);
+      if (report.madeAt >= known.newest) {
+        known.rewards = report.research.rewards;
+        known.newest = report.madeAt;
+      }
+    } else {
+      task.versions.set(versionKey, {
+        key: versionKey,
+        rewards: report.research.rewards,
         stops: [stop],
         first: report.madeAt,
+        newest: report.madeAt,
+        open: version?.hash === undefined,
       });
     }
   }
-  return [...bySubject.values()]
-    .sort((a, b) => b.stops.length - a.stops.length || a.first - b.first)
-    .map(({ key, research, stops }) => ({ key, research, stops }));
+  const byStops = (a: { stops: number; first: number }, b: { stops: number; first: number }) =>
+    b.stops - a.stops || a.first - b.first;
+  return [...byTask.values()]
+    .map(({ task, first, versions }) => {
+      const ordered = [...versions.values()].sort(
+        (a, b) =>
+          Number(a.open) - Number(b.open) ||
+          byStops(
+            { stops: a.stops.length, first: a.first },
+            { stops: b.stops.length, first: b.first },
+          ),
+      );
+      return {
+        first,
+        stops: ordered.reduce((sum, version) => sum + version.stops.length, 0),
+        task: {
+          ...task,
+          versions: ordered.map(({ key, rewards, stops }) => ({ key, rewards, stops })),
+        },
+      };
+    })
+    .sort(byStops)
+    .map(({ task }) => task);
 }
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index a2139f4884e1d536cfa43b2c43df809882af5068..6d5aa9642d7434e45b715e6ed9239dbc15df4a20 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -2,8 +2,10 @@ import type { StopReportStorage } from '../db/repositories/stop-report-repositor
 import { isHideout, parseRocketKey } from '../domain/rocket/lineups.js';
 import {
   decideResearch,
+  versionOf,
   type ResearchAt,
   type ResearchDecision,
+  type ResearchSubjectKey,
   type StandingResearch,
 } from '../domain/research/reports.js';
 import type { TaskReward } from '../domain/research/task.js';
@@ -175,6 +177,18 @@ export class StopReportService {
     };
   }
 
+  /**
+   * A research report's version as the decision sees it (`versionOf`; review R2: the pinned
+   * post groups by it): its task, and its reward's hash where it stands for one reward, also
+   * a report of before plan 8R-5 of a task of one reward (R10).
+   */
+  versionOf(report: {
+    subjectKey: string;
+    research: Pick<ResearchDetail, 'rewards'>;
+  }): ResearchSubjectKey | undefined {
+    return versionOf(this.researchAt(report));
+  }
+
   /** What `decideResearch` reads of the research report standing at a stop. */
   private standingResearch(report: ResearchReport): StandingResearch {
     return {
````

### Task 6: 8R-5 task 6: Research versions on the map's server side

Prototype commit: `f1be1f6bc2c13001bd37ee73bb55b9d0c4bb6bcf`

The research options give each task's versions (value, label, oneOf); a
report on the map shows `oneOf`. POST /api/research asks, uncounted, before
contradicting other members' reports (422 with `asks.reports`, the question
of the dialog) and takes `replacing`, the ids of those to replace; the stops
reported already come back as `already`, a 409 where every stop was (counted,
as on Discord), the reporters by name and no link in the words.

**Files:**

```
 src/commands/research/research-report.ts |  27 ++++++++-
 src/commands/research/research.ts        |  17 ++----
 src/domain/web/stop-report-data.ts       |  51 +++++++++++++---
 src/domain/web/stop-report-view.test.ts  |   2 +
 src/domain/web/stop-report-view.ts       |   2 +
 src/web/stop-options.test.ts             |  11 ++++
 src/web/stop-options.ts                  |   4 ++
 src/web/stop-report-post.test.ts         | 235 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/stop-routes.ts                   |  96 ++++++++++++++++++++++++-----
 9 files changed, 411 insertions(+), 34 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/stop-report-view.test.ts src/web/stop-options.test.ts src/web/stop-report-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f1be1f6bc2c13001bd37ee73bb55b9d0c4bb6bcf -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-5 task 6: Research versions on the map's server side`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/research/research-report.ts b/src/commands/research/research-report.ts
index ca2c1291a0b04a6caa9375811fc9ff0cfd7b85dc..2bff9c22a211855d779c35dc912944e37f746d46 100644
--- a/src/commands/research/research-report.ts
+++ b/src/commands/research/research-report.ts
@@ -1,11 +1,18 @@
 import type { AppContext } from '../../app-context.js';
 import { wayspotAddressLine } from '../../domain/geo/wayfarer-address.js';
 import { cutWhole } from '../../domain/geo/place.js';
-import type { Reporter, ReportedStop, StopReport } from '../../domain/stops/report.js';
+import type {
+  Reporter,
+  ReportedStop,
+  ResearchDetail,
+  StopReport,
+} from '../../domain/stops/report.js';
 import {
   periodEndWords,
   reportSubject,
+  rewardWords,
   stopLine,
+  taskText,
   type ResearchWordsView,
 } from '../../render/research.js';
 import { postLink } from '../../render/notify-dm.js';
@@ -168,6 +175,24 @@ export async function reportResearchAs(
   };
 }
 
+/**
+ * The question before a report contradicts other members' reports (plan 8R-5, R7): the dialog's
+ * words on Discord (with what Submit does), the map's 422. The task and reward made plain; the
+ * stops `picked` from "Same task at more stops…", else `named` (review L4).
+ */
+export function replaceQuestion(
+  research: ResearchDetail,
+  many: boolean,
+  how: 'named' | 'picked' = 'named',
+): string {
+  const rewards = rewardWords(research.rewards);
+  return (
+    `Another member’s report stands at ${many ? 'stops' : 'a stop'} you ${how}. Tick ` +
+    `${many ? 'each one' : 'it'} to replace that report with **${taskText(research)}**` +
+    `${rewards === '' ? '' : ` · ${rewards}`}; a stop left unticked keeps its report.`
+  );
+}
+
 /**
  * The link to the message of the pinned post that holds a report (R8), in the first region
  * channel its stop lies in; undefined where none holds it (rehearsal mode: no posts).
diff --git a/src/commands/research/research.ts b/src/commands/research/research.ts
index 7988eae585963dc8c3eaf266cc190594034cf6ed..5956cd8c5e41785f8d10faf702c51d3ef8533458 100644
--- a/src/commands/research/research.ts
+++ b/src/commands/research/research.ts
@@ -41,9 +41,7 @@ import {
   RESEARCH_KIND,
   reportSubject,
   researchAnswer,
-  rewardWords,
   stopLine,
-  taskText,
   type MoreStop,
 } from '../../render/research.js';
 import { clockText, endSentence, truncate } from '../../render/text.js';
@@ -70,6 +68,7 @@ import {
   NOTHING_LEFT,
   REPORT_CHANGED,
   REPORT_ENDED,
+  replaceQuestion,
   reporterNamed,
   reportResearchAs,
   stopsByKey,
@@ -273,15 +272,11 @@ function contestedDescription(report: ResearchReport, zone: string): string {
  * stands there, who reported it and when; Submit reports at every stop, the ticked ones replaced.
  */
 function replaceDialog(token: string, use: WaitingUse, zone: string) {
-  const { research } = use.subject;
-  const rewards = rewardWords(research.rewards);
-  const many = use.contested.length > 1;
-  // The stops picked from "Same task at more stops…", else named (review L4).
-  const question =
-    `Another member’s report stands at ${many ? 'stops' : 'a stop'} you ` +
-    `${use.also ? 'picked' : 'named'}. Tick ${many ? 'each one' : 'it'} to replace that report ` +
-    `with **${taskText(research)}**${rewards === '' ? '' : ` · ${rewards}`}; a stop left ` +
-    'unticked keeps its report.';
+  const question = replaceQuestion(
+    use.subject.research,
+    use.contested.length > 1,
+    use.also ? 'picked' : 'named',
+  );
   const shown = dialog({
     customId: encodeCustomId({ kind: RESEARCH_KIND, id: token, action: RESEARCH_ACTIONS.replace }),
     title: 'Replace field research?',
diff --git a/src/domain/web/stop-report-data.ts b/src/domain/web/stop-report-data.ts
index fbb99353c22e4ea20816486d3d9d7721fcb963df..69c649138e702ae6d6e9cfc4b0bcb0a02c5d58b3 100644
--- a/src/domain/web/stop-report-data.ts
+++ b/src/domain/web/stop-report-data.ts
@@ -36,7 +36,8 @@ export interface MapReward {
 interface MapStopReportBase {
   /**
    * The report's id: what `POST …/stop-reports/<id>/remove` takes back, and a research report's
-   * `sameAs` in `POST …/research` reports again at more stops.
+   * `sameAs` in `POST …/research` reports again at more stops while it stands (once it is gone,
+   * a listed one's by its `task` with `more: true`: review R4, F3).
    */
   id: number;
   stop: MapStop;
@@ -60,16 +61,23 @@ interface MapStopReportBase {
 
 /**
  * Field research reported at a stop, of the period on now: the task's text (`typed`: a member
- * typed it in full, no task of the list), its category (null for a typed one), `task` its key (a
- * task's key, `typed:<key>` for a typed one: the same task at several stops has the same; for
- * telling tasks apart, never sent back as a report's `task`), its rewards (one is drawn per
- * player). The same task at more stops is reported by the report's `id` (`sameAs`).
+ * typed it in full, no task of the list), its category (null for a typed one), `task` its
+ * version (plan 8R-5: `<task key>:<reward hash>` for one reward, the task's key alone for "one
+ * of"; `typed:<key>[:<hash>]` for a typed one: the same version at several stops has the same),
+ * its rewards (the one reward, or those "one of" stands for), and whether it is "one of" (`oneOf`,
+ * R13: the reward is not known yet; a report of before plan 8R-5 with every reward of its task is
+ * one too). The same version at more stops ("Same task at more stops…") is reported by sending
+ * the report's `id` as `sameAs` while it stands; once it is gone (narrowed or replaced since), a
+ * listed report's `task` as the report's `task` with `more: true` (review R4, F3: asked about and
+ * answered as more stops; a typed one's `task` is no task of the list, and is refused). A bare
+ * key of before plan 8R-5 whose rewards are only items names no one reward: `PICK_THE_REWARD`.
  */
 export interface MapResearch extends MapStopReportBase {
   task: string;
   text: string;
   category: string | null;
   typed: boolean;
+  oneOf: boolean;
   rewards: MapReward[];
 }
 
@@ -114,14 +122,27 @@ export interface StopReportsView {
 }
 
 /**
- * A task as `/research` lists it (`GET /s/<guild>/api/research-options`): its key (what a report
- * sends as `task`), text, category and rewards.
+ * A version of a task as `/research` offers it (plan 8R-5, R13): its value (what a report sends
+ * as `task`), its label (`Gible`, `Rare Candy ×3`, `one of Gible, Larvitar, Beldum`), and
+ * whether it is "one of".
+ */
+export interface ResearchVersionOption {
+  value: string;
+  label: string;
+  oneOf: boolean;
+}
+
+/**
+ * A task as `/research` lists it (`GET /s/<guild>/api/research-options`): its key, text,
+ * category, rewards, and its versions (plan 8R-5: one per reward, then "one of"), whose value a
+ * report sends as `task`.
  */
 export interface ResearchTaskOption {
   key: string;
   text: string;
   category: string;
   rewards: MapReward[];
+  versions: ResearchVersionOption[];
 }
 
 /**
@@ -183,12 +204,26 @@ export interface RocketOptionsView {
  * research reports made (`research`) or the Rocket report made or standing (`grunt`, `hideout`)
  * as the map shows them to the member; for a grunt where a hideout stands, the question
  * (`text`) and the hideout to say Replace to (`asks.replacing`: send the report again with it).
+ * Research (plan 8R-5): the reports standing already at stops named (`already`, R8: also a 409
+ * where every stop was), and where it contradicts other members' reports, the question (`text`)
+ * and those reports (`asks.reports`, R7: send it again with `replacing`, the ids of those to
+ * replace; the others keep theirs); those the map does not show the member (in a region they are
+ * kept out of, or all where they cannot be shown just now) only by their ids and stops'
+ * names (`asks.hidden`, review R5), which `replacing` takes alike.
  */
 export interface StopReportAnswer {
   ok: boolean;
   text: string;
   research?: MapResearch[];
+  already?: MapResearch[];
   grunt?: MapGrunt;
   hideout?: MapHideout;
-  asks?: { replacing: number };
+  /** Rocket's: `replacing`; research's: `reports`, and `hidden` where any is not shown. */
+  asks?: { replacing?: number; reports?: MapResearch[]; hidden?: HiddenReport[] };
+}
+
+/** A contested report the map does not show the member (review R5): its id and its stop's name. */
+export interface HiddenReport {
+  id: number;
+  stop: string;
 }
diff --git a/src/domain/web/stop-report-view.test.ts b/src/domain/web/stop-report-view.test.ts
index d6a3632b90eada5d61d77288b7e3d95e1c7facdc..a164b54a30677c8b97d3a7baaafc8f5b1a2228cd 100644
--- a/src/domain/web/stop-report-view.test.ts
+++ b/src/domain/web/stop-report-view.test.ts
@@ -109,6 +109,8 @@ describe('stopReportView', () => {
       text: 'Catch 3 Pawniard',
       category: null,
       typed: true,
+      // A task's key alone with two rewards or more reads as "one of" (plan 8R-5, R10).
+      oneOf: true,
       rewards: [
         { kind: 'item', name: 'Rare Candy', value: 'item:rare-candy', quantity: 0, shiny: false },
         // A picture from no host the page may load is left out.
diff --git a/src/domain/web/stop-report-view.ts b/src/domain/web/stop-report-view.ts
index a18a71dcc8b7468088e2027d17f0a831f747f5e4..3412b5e3770cf60c2bf8833ad918ef17a9259e8e 100644
--- a/src/domain/web/stop-report-view.ts
+++ b/src/domain/web/stop-report-view.ts
@@ -1,3 +1,4 @@
+import { isOneOf } from '../research/reports.js';
 import type { TaskReward } from '../research/task.js';
 import { isHideout, parseRocketKey, type RocketCatch } from '../rocket/lineups.js';
 import {
@@ -123,6 +124,7 @@ function mapResearch(report: ResearchReport, input: StopReportViewInput): MapRes
     text: research.text,
     category: research.category,
     typed: research.typed,
+    oneOf: isOneOf(report),
     rewards: research.rewards.map((reward) => mapReward(reward, input.pictureOrigins)),
   };
 }
diff --git a/src/web/stop-options.test.ts b/src/web/stop-options.test.ts
index 62dc5d0347213de7875122005f9e801eba36e591..b11faccddffc6a14773bf26950bdd2a2407d847f 100644
--- a/src/web/stop-options.test.ts
+++ b/src/web/stop-options.test.ts
@@ -71,6 +71,17 @@ describe('the pick lists of reports at stops', () => {
       name: 'Dratini',
       value: 'pokemon:dratini',
     });
+    // Its versions, as /research offers them (plan 8R-5, R13).
+    expect(shown?.versions[0]).toEqual({
+      value: expect.stringMatching(new RegExp(`^${dragon.key}:[0-9a-f]{8}$`)) as string,
+      label: 'Dratini',
+      oneOf: false,
+    });
+    expect(shown?.versions.at(-1)).toEqual({
+      value: dragon.key,
+      label: 'one of Dratini, Bagon, Axew',
+      oneOf: true,
+    });
     expect(view.rewards).toContainEqual({ value: 'item:rare-candy', name: 'Rare Candy' });
     expect(view.rewards.some((reward) => reward.value.startsWith('energy:'))).toBe(true);
     expect(
diff --git a/src/web/stop-options.ts b/src/web/stop-options.ts
index 9741f052cacdc70a0e5c64431e7247827d975b9b..5558b508147d9ad8da352fea7a557b6987d572dd 100644
--- a/src/web/stop-options.ts
+++ b/src/web/stop-options.ts
@@ -1,4 +1,5 @@
 import type { ResearchTask } from '../domain/research/task.js';
+import type { TaskVersion } from '../domain/research/versions.js';
 import {
   isHideout,
   lineupChoice,
@@ -18,6 +19,8 @@ import { mapCatch, mapReward } from '../domain/web/stop-report-view.js';
  */
 export function researchOptions(input: {
   tasks: readonly ResearchTask[];
+  /** A task's versions as `/research` offers them (plan 8R-5, R13: `ResearchTaskProvider`). */
+  versions: (task: ResearchTask) => readonly TaskVersion[];
   readAt: number | undefined;
   stale: boolean;
   listed: { items: ReadonlyMap<string, string>; energies: ReadonlyMap<number, string> };
@@ -31,6 +34,7 @@ export function researchOptions(input: {
       text: task.text,
       category: task.category,
       rewards: task.rewards.map((reward) => mapReward(reward, input.origins)),
+      versions: input.versions(task).map(({ value, label, oneOf }) => ({ value, label, oneOf })),
     })),
     rewards: [
       ...[...input.listed.items].map(([key, name]) => ({ value: `item:${key}`, name })),
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index 939aa93a7effe31e342e5cb8c2a72133fbd81b93..7bfd16cf7b5dbe39071325d982cbc4c35da36770 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -23,6 +23,7 @@ import {
 } from '../../test/support/web.js';
 import {
   NO_STOPS_HERE,
+  PICK_THE_REWARD,
   readTask,
   RESEARCH_REMOVE,
   researchThrottle,
@@ -102,6 +103,240 @@ describe('reports at stops from the map', () => {
   });
 
   describe('research', () => {
+    describe('the versions of a task (plan 8R-5)', () => {
+      const THROWS = pageTask('Make 3 Excellent Throws in a row');
+      const version = (label: string): string => {
+        const found = researchTasksFixture()
+          .versions(THROWS)
+          .find((one) => one.label === label);
+        if (!found) throw new Error(`no version ${label}`);
+        return found.value;
+      };
+
+      it('answers a version standing already with it, counted (R8)', async () => {
+        const made = await setup();
+        web = made.web;
+        expect(
+          (
+            await made.post(
+              '/research',
+              { task: version('Gible'), stops: [wayspotId(1)] },
+              made.bob,
+            )
+          ).status,
+        ).toBe(200);
+        made.fillResearch(9);
+        const answer = await made.post('/research', { task: THROWS.key, stops: [wayspotId(1)] });
+        expect(answer.status).toBe(409);
+        expect(answer.json.text).toMatch(
+          /^Already reported: Make 3 Excellent Throws in a row · Gible at Yellow Mural, by Bob /,
+        );
+        expect(answer.json.already?.map((one) => [one.stop.name, one.reporter, one.oneOf])).toEqual(
+          [['Yellow Mural', 'Bob', false]],
+        );
+        // Counted, as /research counts it: the tenth use of ten.
+        expect(
+          (await made.post('/research', { task: version('Beldum'), stops: [wayspotId(2)] })).status,
+        ).toBe(429);
+      });
+
+      it('asks before contradicting another’s report, uncounted, and replaces what is ticked (R7)', async () => {
+        const made = await setup();
+        web = made.web;
+        const stops = [wayspotId(1), wayspotId(2)];
+        await made.post('/research', { task: version('Gible'), stops }, made.bob);
+        const asked = await made.post('/research', { task: version('Beldum'), stops });
+        expect(asked.status).toBe(422);
+        expect(asked.json.text).toContain('Make 3 Excellent Throws in a row · Beldum');
+        const contested = asked.json.asks?.reports ?? [];
+        expect(contested.map((one) => [one.stop.name, one.reporter, one.task])).toEqual([
+          ['Yellow Mural', 'Bob', version('Gible')],
+          ['Paititi Inti', 'Bob', version('Gible')],
+        ]);
+        // Uncounted: all ten uses are there after it.
+        made.fillResearch(9);
+        const answer = await made.post('/research', {
+          task: version('Beldum'),
+          stops,
+          replacing: [contested[0]?.id],
+        });
+        expect(answer.status).toBe(200);
+        expect(answer.json.research?.map((one) => [one.stop.name, one.task])).toEqual([
+          ['Yellow Mural', version('Beldum')],
+        ]);
+        expect(answer.json.already?.map((one) => one.stop.name)).toEqual(['Paititi Inti']);
+        expect(answer.json.text).toContain('Already reported: ');
+      });
+
+      it('refuses the question with the window full, as Discord does before its dialog', async () => {
+        const made = await setup();
+        web = made.web;
+        await made.post('/research', { task: version('Gible'), stops: [wayspotId(1)] }, made.bob);
+        made.fillResearch(10);
+        const answer = await made.post('/research', {
+          task: version('Beldum'),
+          stops: [wayspotId(1)],
+        });
+        expect(answer.status).toBe(429);
+        expect([...made.store.rows.values()].map((one) => one.reporter.id)).toEqual([BOB]);
+      });
+
+      it('names a contested report the member may not see by its id and stop (review R5)', async () => {
+        const made = await setup();
+        web = made.web;
+        const stops = [wayspotId(1), wayspotId(3)];
+        await made.post('/research', { task: version('Gible'), stops }, made.bob);
+        const [west, east] = [...made.store.rows.values()];
+        made.made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+        const asked = await made.post('/research', { task: version('Beldum'), stops });
+        expect(asked.status).toBe(422);
+        expect(asked.json.asks?.reports?.map((one) => one.id)).toEqual([west?.id]);
+        expect(asked.json.asks?.hidden).toEqual([{ id: east?.id, stop: east?.stop.name }]);
+        // Overruled by its id, as the page sends it.
+        const answer = await made.post('/research', {
+          task: version('Beldum'),
+          stops,
+          replacing: [west?.id, east?.id],
+        });
+        expect(answer.status).toBe(200);
+        expect(
+          [...made.store.rows.values()].map((one) => [one.stop.name, one.reporter.id]),
+        ).toEqual([
+          [west?.stop.name, ALICE],
+          [east?.stop.name, ALICE],
+        ]);
+      });
+
+      it('names every contested report by its id and stop where none can be shown (R5)', async () => {
+        let postsFail = false;
+        const made = await setup(undefined, {
+          linkOf: () => {
+            if (postsFail) throw new Error('the posts cannot be read');
+            return undefined;
+          },
+        });
+        web = made.web;
+        await made.post('/research', { task: version('Gible'), stops: [wayspotId(1)] }, made.bob);
+        const [gible] = [...made.store.rows.values()];
+        postsFail = true;
+        const asked = await made.post('/research', {
+          task: version('Beldum'),
+          stops: [wayspotId(1)],
+        });
+        expect(asked.status).toBe(422);
+        expect(asked.json.asks).toEqual({
+          reports: [],
+          hidden: [{ id: gible?.id, stop: 'Yellow Mural' }],
+        });
+      });
+
+      it('reports a listed report’s version by its task once that report was narrowed (R4)', async () => {
+        const made = await setup();
+        web = made.web;
+        const first = await made.post(
+          '/research',
+          { task: THROWS.key, stops: [wayspotId(1)] },
+          made.bob,
+        );
+        const [listed] = first.json.research ?? [];
+        // Bob narrows it to Gible: the report the page listed is gone.
+        await made.post('/research', { task: version('Gible'), stops: [wayspotId(1)] }, made.bob);
+        expect(
+          (await made.post('/research', { sameAs: listed?.id, stops: [wayspotId(2)] })).status,
+        ).toBe(409);
+        const again = await made.post('/research', { task: listed?.task, stops: [wayspotId(2)] });
+        expect(again.status).toBe(200);
+        expect(again.json.research?.map((one) => [one.stop.name, one.task, one.oneOf])).toEqual([
+          ['Paititi Inti', THROWS.key, true],
+        ]);
+      });
+
+      it('asks in "Same task at more stops…"’s words with more, as with sameAs, and reports (review F3)', async () => {
+        const made = await setup();
+        web = made.web;
+        const first = await made.post('/research', {
+          task: version('Gible'),
+          stops: [wayspotId(1)],
+        });
+        const [listed] = first.json.research ?? [];
+        await made.post('/research', { task: version('Beldum'), stops: [wayspotId(2)] }, made.bob);
+        const asked = await made.post('/research', {
+          task: listed?.task,
+          more: true,
+          stops: [wayspotId(2)],
+        });
+        expect(asked.status).toBe(422);
+        expect(asked.json.text).toMatch(/^Another member’s report stands at a stop you picked\./);
+        const bySameAs = await made.post('/research', {
+          sameAs: listed?.id,
+          stops: [wayspotId(2)],
+        });
+        expect(bySameAs.json.text).toMatch(
+          /^Another member’s report stands at a stop you picked\./,
+        );
+        // Bob replaces Alice's report by Beldum: the report the page listed is gone.
+        const replaced = await made.post(
+          '/research',
+          { task: version('Beldum'), stops: [wayspotId(1)], replacing: [listed?.id] },
+          made.bob,
+        );
+        expect(replaced.status).toBe(200);
+        const ended = await made.post('/research', {
+          sameAs: listed?.id,
+          stops: [wayspotId(3)],
+        });
+        expect(ended.status).toBe(409);
+        expect(ended.json).toEqual({ ok: false, text: REPORT_ENDED.replace(/`/g, '') });
+        const more = await made.post('/research', {
+          task: listed?.task,
+          more: true,
+          stops: [wayspotId(3)],
+        });
+        // The map's words leave the answer's heading out: "Also reported" is not seen there.
+        expect(more.status).toBe(200);
+        expect(more.json.research?.map((one) => [one.stop.name, one.task])).toEqual([
+          ['East Fountain', version('Gible')],
+        ]);
+        expect(
+          [...made.store.rows.values()].map((one) => [one.stop.name, one.reporter.id]),
+        ).toEqual([
+          ['Paititi Inti', BOB],
+          ['Yellow Mural', BOB],
+          ['East Fountain', ALICE],
+        ]);
+      });
+
+      it('refuses more stops by a bare key of before plan 8R-5 whose task gives only items (review F3)', async () => {
+        const made = await setup();
+        web = made.web;
+        // A report of before plan 8R-5: the task's key with every reward, all of them items.
+        const ditto = pageTask('Catch a Ditto');
+        expect(ditto.rewards.every((reward) => reward.kind === 'item')).toBe(true);
+        await made.ctx.stopReports.reportResearch({
+          serverId: FAKE_GUILD_ID,
+          stops: await stopsByKey(made.ctx, FAKE_GUILD_ID, [wayspotId(1)]),
+          subject: {
+            subjectKey: ditto.key,
+            research: {
+              text: ditto.text,
+              category: ditto.category,
+              rewards: ditto.rewards,
+              typed: false,
+            },
+          },
+          reporter: { id: ALICE, name: 'Alice' },
+        });
+        const answer = await made.post('/research', {
+          task: ditto.key,
+          more: true,
+          stops: [wayspotId(2)],
+        });
+        expect(answer.status).toBe(422);
+        expect(answer.json.text).toBe(PICK_THE_REWARD);
+        expect(made.store.rows.size).toBe(1);
+      });
+    });
+
     it('reports a task at the stops picked, as /research, and gives them as the map shows them', async () => {
       const made = await setup();
       web = made.web;
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index 222baedbea3b301d159de6fc583ad8da1f9e2181..c9bbf80142235602bdc72e92231364fd6b6008eb 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -16,6 +16,7 @@ import {
   REPORT_CHANGED,
   REPORT_ENDED,
   reporterNamed,
+  replaceQuestion,
   reportResearchAs,
   stopsByKey,
   takeBackAs,
@@ -286,6 +287,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
   optionsRoute('/api/research-options', () =>
     researchOptions({
       tasks: ctx.researchTasks.tasks(),
+      versions: (task) => ctx.researchTasks.versions(task),
       readAt: ctx.researchTasks.readAt(),
       stale: ctx.researchTasks.stale(deps.now()),
       listed: listedRewards(ctx),
@@ -312,7 +314,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
    * ("### Field research reported": the page says what was done its own way), as page text.
    */
   const answerWords = ({ head, where }: { head: string; where: string }): string =>
-    words(`${head.replace(/^### [^\n]*\n/u, '')}\n${where}`);
+    words(`${head.replace(/^### [^\n]*\n/u, '')}${where === '' ? '' : `\n${where}`}`);
 
   /** A region channel as the map's answers name it: `#west`, else `Region 5`. */
   const channel: ChannelNamer = (channelId) => {
@@ -368,8 +370,15 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
   // 404), the task and its reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them;
   // a typed task's key `typed:…` 422 `TYPED_TASK_KEY`) or instead `sameAs`, the report whose task
   // it is ("Same task at more stops…": research of this server and of the period on now, else 409
-  // `REPORT_ENDED`), none counted; only then `/research report`'s throttle in its window (`researchWindow`: the
-  // map shares the command's, design 9.12); then `reportResearchAs` as the member.
+  // `REPORT_ENDED`; a `task` with `more` is "Same task at more stops…" too: asked in its words,
+  // with `also`; read by `readTask`, no period check; review F3), none counted; without
+  // `replacing`, other members' reports it contradicts
+  // (plan 8R-5, R7) are the question `/research` asks in its dialog, a 422 with those reports
+  // (`asks.reports`; those the member may not be shown by id and stop, `asks.hidden`: review R5),
+  // uncounted unless the window is full (429); only then `/research report`'s
+  // throttle in its window (`researchWindow`: the map shares the command's, design 9.12); then
+  // `reportResearchAs` as the member, `replacing` the reports ticked. The stops reported already
+  // (R8) come back as `already`; where every stop was, a 409, counted as on Discord.
   scope.post('/api/research', { onRequest: writeGuards }, async (request: GuildRequest, reply) => {
     void reply.header('cache-control', 'no-store');
     const session = await sessions.of(request, reply);
@@ -396,6 +405,9 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
     if ('sent' in named) return noted(named.outcome, named.sent);
     logged = named.stops.map((stop) => stop.key);
     let subject: ResearchSubject;
+    // "Same task at more stops…": by `sameAs`, or by a listed report's `task` with `more`
+    // (review F3), asked about and answered in its words (`picked`, "Also reported").
+    const more = 'sameAs' in body.data || body.data.more === true;
     if ('sameAs' in body.data) {
       // "Same task at more stops…" (`researchControls`): the task of a research report of this
       // server and of the period on now, as it was reported (a typed one with its reward, a
@@ -420,6 +432,36 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
     const { settings } = ctx.config;
     const throttle = researchThrottle(settings);
     const key = { command: RESEARCH_REPORT, varies: true };
+    const { replacing } = body.data;
+    if (replacing === undefined) {
+      // Other members' reports it contradicts are asked about first, uncounted (plan 8R-5, R7),
+      // as `/research` asks in its dialog: send it again with `replacing`.
+      const contested = await ctx.stopReports.contested(guild, named.stops, subject, userId);
+      if (contested.length > 0) {
+        // Discord refuses `/research report` for a full window before its dialog opens.
+        const full = throttledOnTheMap(deps, reply, key, userId, throttle, { count: false });
+        if (full) return noted('throttled', full);
+        const shown = await shownTo(guild, userId, contested);
+        const reports = shown?.research ?? [];
+        // Those the map does not show the member (a region they are kept out of, a view that
+        // could not be read) by their ids and stops, so that the page can still overrule them
+        // (review R5).
+        const hidden = contested
+          .filter((report) => !reports.some((one) => one.id === report.id))
+          .map((report) => ({ id: report.id, stop: report.stop.name }));
+        return noted(
+          'asks',
+          refuse(
+            reply,
+            422,
+            replaceQuestion(subject.research, contested.length > 1, more ? 'picked' : 'named'),
+            {
+              asks: { reports, ...(hidden.length === 0 ? {} : { hidden }) },
+            },
+          ),
+        );
+      }
+    }
     const throttled = throttledOnTheMap(deps, reply, key, userId, throttle);
     if (throttled) return noted('throttled', throttled);
     const reporter = reporterNamed(userId, acting.member.name, session.userName);
@@ -427,17 +469,38 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       reportResearchAs(
         ctx,
         guild,
-        { stops: named.stops, subject, reporter },
-        'sameAs' in body.data,
+        {
+          stops: named.stops,
+          subject,
+          reporter,
+          ...(replacing === undefined ? {} : { replacing }),
+        },
+        more,
       ),
     );
-    const made = reported.outcome.saved.map(({ report }) => report);
-    const shown = await shownTo(guild, userId, made);
+    const { outcome } = reported;
+    const made = outcome.saved.map(({ report }) => report);
+    // Standing already (R8), or contradicted since and not to be replaced: kept, said as such.
+    const standing = [...outcome.already, ...outcome.asks];
+    const shown = await shownTo(guild, userId, [...made, ...standing]);
+    const among = (reports: readonly StopReport[]) =>
+      (shown?.research ?? []).filter((one) => reports.some((report) => report.id === one.id));
+    // The reporters by name, never an id; no link to Discord in the page's words.
+    const view = {
+      ...reported.view,
+      already: (reported.view.already ?? []).map(({ report }) => {
+        const by = report.reporter.name.trim();
+        return { report, link: undefined, by: by === '' ? 'a member' : `**${plain(by)}**` };
+      }),
+    };
     const answer: StopReportAnswer = {
-      ok: true,
-      text: answerWords(researchWords(reported.view, channel)),
-      research: shown?.research ?? [],
+      ok: made.length > 0,
+      text: answerWords(researchWords(view, channel)),
+      research: among(made),
+      already: among(standing),
     };
+    // Every stop reported already: counted, as `/research` counts it (R8).
+    if (made.length === 0) return noted('already', reply.code(409).send(answer));
     return noted('reported', reply.send(answer));
   });
 
@@ -666,23 +729,28 @@ const stopKey = z.string().min(1).max(60);
 const researchStops = z.array(stopKey).min(1).max(STOP_OPTIONS.length);
 
 /**
- * The body of a research report: the task as `/research`'s `task:` takes it (a key of the list,
- * or typed in full), the reward of a typed task as its `reward:` does; or instead of both
- * `sameAs`, the id of a report whose task it is ("Same task at more stops…"); one to five stops
- * by key. Anything else (both, or neither) is malformed.
+ * The body of a research report: the task as `/research`'s `task:` takes it (a version or key of
+ * the list, also a listed report's `task` for "Same task at more stops…" once that report is
+ * gone, with `more: true`: review R4, F3; or typed in full), the reward of a typed task as its
+ * `reward:` does; or instead of both `sameAs`, the id of a report whose task it is ("Same task at
+ * more stops…" while that report stands); one to five stops by key. Anything else (both, or
+ * neither) is malformed.
  */
 const researchBodySchema = z.union([
   z
     .object({
       task: z.string().max(100),
       reward: z.string().max(100).optional(),
+      more: z.literal(true).optional(),
       stops: researchStops,
+      replacing: z.array(z.number().int().positive()).max(STOP_OPTIONS.length).optional(),
     })
     .strict(),
   z
     .object({
       sameAs: z.number().int().positive(),
       stops: researchStops,
+      replacing: z.array(z.number().int().positive()).max(STOP_OPTIONS.length).optional(),
     })
     .strict(),
 ]);
````

### Task 7: 8R-5 task 7: Docs for research versions

Prototype commit: `13853dccfb4cfaa84c95b6cf919b19b8acca280f`

stop-reports.md: versions, subjects, the decision per stop, /research
report's choices, readTask, the contradiction dialog, Already reported and
Same task at more stops by version; the post's one block per task.
notifications-and-dms.md: research by version, confirmations, the "one of"
read again. web.md: versions in the options, oneOf, the POST's replacing,
asks and already. testing.md: the fixture's versions, ctx.stopPostLinks. The
8R-1 design's game fact corrected: the reward is the same all day at a stop.

**Files:**

```
 docs/architecture/discord-framework.md                   |  2 +-
 docs/architecture/notifications-and-dms.md               |  1 +
 docs/architecture/stop-reports.md                        | 20 +++++++++++++++-----
 docs/architecture/testing.md                             |  6 +++---
 docs/architecture/web.md                                 |  6 +++---
 docs/superpowers/specs/2026-10-21-stop-reports-design.md |  2 +-
 src/domain/research/task.ts                              |  5 ++++-
 7 files changed, 28 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 13853dccfb4cfaa84c95b6cf919b19b8acca280f -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-5 task 7: Docs for research versions`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index cadc2c85eca1109eede8c40754920b1248b1de63..ca57c95faff0c37e74993e06223927a3f2b88e85 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -24,7 +24,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 
 - Controls are `ComponentHandler`s listed in `src/components/index.ts`, one per custom-id kind, with a function per control type (`button`, `select`, `modal`). A command's guards do not cover its controls: give the handler its own `guards`. Its `throttle` may be a function of the interaction and the custom id (asked after the guards; undefined lets a control through uncounted): `/counters` counts a submitted dialog in the command's window and the button that opens it in a `MEMBER_READ_THROTTLE` window of its own. A limit with `as` (`ControlThrottle`) counts in the window of that command, as the router counts the command's uses (the dialog of `/counters` runs the command's work against Pokebattler: command and submits share its three a minute, "You can use /counters again in …"); without it a control counts in its kind's own window (`controlThrottleKey(kind)`, `component:<kind>`), as `/rank`'s and `/help`'s do. The bot gives the router its `Throttles` (`RouterOptions.throttles`) and shares them with the web server, whose presses of a party's buttons count in the window of the post's controls (plan 8M-3). What a control refuses belongs in a guard of its handler, which runs before the throttle, so that a refusal does not count (`requireDialogPlan` of `/counters`' dialog).
 - A dialog (a modal; `showModal`, the first answer: nothing is deferred before it) holds up to five labels, rows of a text input and text displays. Checked on the test server (2026-10-18, plan 8T-H): a dialog of one text display alone opens and submits (the split's one-group dialog), and a label may hold a radio group (`ComponentType.RadioGroup`, 2 to 10 choices of a label, value and description of 100 each), read with `fields.getRadioGroup(id, true)`; a required one cannot be submitted empty (Discord refuses Submit), so nothing is preselected where a pick must be deliberate. A label may also hold one tick box (`ComponentType.Checkbox`: a `custom_id` and `default` only, its words the label's and its description's; `fields.getCheckbox`, plan 8R-4: Costumes and Remove of `/want`'s dialog), not yet checked on Discord (8R-4's staging). Labels and descriptions of choices are assumed to show no markdown, as those of select menus do (not yet checked on Discord: 8T staging step 28 checks it): they carry the members' text as it is, not `plain()`.
-- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order). Discord's client keeps what was submitted in a dialog per custom id and shows that again in place of the value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so a dialog that marks a value to start with (Meet…, the which-group dialog, Group…; since plan 8R-4 `/want`'s Pokémon, tier and Team GO Rocket dialogs, whose Submits refuse an id without it, as none was drawn without one), and a radio dialog that starts with nothing picked where an earlier pick could come back after a refused Submit (the split's picker and one-group dialog, `removalDialog` of `/delete` and a report's Close…, Refuse place…, Block maker…, `/region remove`; 2026-10-22, from the 8X staging's finding) ends its custom id in a per-open token, `openToken(now)` (`~` and the moment it opened in base 36, about ten characters: count them in the 100), which its Submit leaves out with `withoutOpenToken(args)` (plan 8X-F; a dialog drawn before without it submits as before); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). Plan 8X-G: `choices` asks several, each under its label after `choice` (Manage… of a train: "The route" as a radio group, the mode and the kind as menus; Discord takes five components in a dialog, the text included), a menu's options with their `emoji` (a radio group shows none), read at Submit with `pickedOf` (a radio group) and `selectedOf` (a menu: the option chosen when it is one of the values, else undefined). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
+- A question asked once ("Remove all your wants?", "Close this raid?", the split of a train; plans 8T-H, 8Q, design `2026-10-18-one-shot-dialogs-design.md`) is a dialog, not a private reply with buttons: it opens over the channel at once and closes when answered. They are Remove all of the wants and gym targets (`notifications-and-dms.md`), staff's `/delete` and Close…, Refuse place…, Block maker… of a report's post (`removalDialog`, `moderation.md`), deleting a gym and `/region remove` (`gyms-and-regions.md`), `/location` to another region (`parties-and-posts.md`), the split of a train (`trains.md`) and `/max`'s question about a battle that ends soon (plan 8X-3, `parties-and-posts.md`: no read from the database, the slow-read rule's clock checked before it opens; its Submit `max:<token>:report`, a pending-request token, carries on the use `/max` counted); the panels used again and again, the import previews and the like stay private replies. The pieces are `src/discord/dialog.ts`: `dialog({ customId, title, text?, choice?, field? })` (the title says the act, cut to 45 characters; the text is the question, ending with what Submit does when there is no choice, `Submit removes them.`, and may be left out of a dialog that is its choice alone; a choice between ways is a required radio group with nothing picked, so that Submit never does the harsher one by default, read at Submit with `pickedOf` (undefined for a Submit without that group, a dialog of an older shape or a forged one: the handler then answers stale); when only one way is possible there is no choice and the text says why). Plan 8X-1B: a choice may name the value `picked` to start with (Discord's `default`; the fakes refuse two, as Discord would), which goes first in its list where the order allows: Android picks a radio group's first choice by itself whatever is marked (Matt's check, 2026-10-20), an iPhone only what is marked, so a choice that must not be made by accident is never first; `menu: true` makes it a string select of up to 25 for a longer list (Meet…, `getStringSelectValues`), whose default is marked only (it keeps its order). Discord's client keeps what was submitted in a dialog per custom id and shows that again in place of the value marked (the staging of 8X: Meet… showed the time submitted before, not the group's), so a dialog that marks a value to start with (Meet…, the which-group dialog, Group…; since plan 8R-4 `/want`'s Pokémon, tier and Team GO Rocket dialogs, whose Submits refuse an id without it, as none was drawn without one), and a radio dialog that starts with nothing picked where an earlier pick could come back after a refused Submit (the split's picker and one-group dialog, `removalDialog` of `/delete` and a report's Close…, Refuse place…, Block maker…, `/region remove`; 2026-10-22, from the 8X staging's finding) ends its custom id in a per-open token, `openToken(now)` (`~` and the moment it opened in base 36, about ten characters: count them in the 100), which its Submit leaves out with `withoutOpenToken(args)` (plan 8X-F; a dialog drawn before without it submits as before); `field` is one optional line of text (`TextInputStyle.Short`, `required: false`). Plan 8X-G: `choices` asks several, each under its label after `choice` (Manage… of a train: "The route" as a radio group, the mode and the kind as menus; Discord takes five components in a dialog, the text included), a menu's options with their `emoji` (a radio group shows none), read at Submit with `pickedOf` (a radio group) and `selectedOf` (a menu: the option chosen when it is one of the values, else undefined). A command whose throttle varies counts in `variedThrottleKey(name, limit)`; a control that counts in that window (`as`, Meet…'s dialog in `/meet`'s; "Same task at more stops…" in `/research report`'s, plan 8R-1, whose limit is of the settings: a control's `throttle` function gets `(interaction, id, ctx)`) is refused in the command's words, the name before the line break ("You can use /meet again in …"). Discord's Cancel replaces the Keep and Cancel buttons: it closes the dialog and nothing is said. **The slow-read rule:** what a dialog needs from the database (a count, a report, a gym's references, the member's privacy) is read through `readInTime(log, interaction, work)`, within `DIALOG_READ_MS` (2 seconds, of Discord's 3) of when the interaction was made (its `createdTimestamp`, as the late deferral counts): past it no dialog opens and the member is told privately `SLOW_READ` ("That took me too long to look up: try again in a moment."), a `UserError` that gives the use back; a refusal of the read itself passes on (also one thrown at once, which leaves no timer), a read that comes back past the budget by the clock is refused too (also before its timer ran, on a busy event loop), and a read that fails after it was given up is logged. A command that opens a dialog declares no `defer`, and a control does not defer before it. Where the read decides whether a dialog opens at all, and the use goes on without one (`/research report`'s "Same task at more stops…", plan 8R-5, review F1: `readOrDefer` in `research.ts`), the read is raced against the same budget: back in time, as above; past it, the press is deferred privately at once, and when the read comes back the dialog it would need is refused with `SLOW_READ` in the deferred reply (the use given back), while without one the use goes on. The dialog carries what it needs in its custom id (the party, the gym, the region, the report); a pending-request token only where a value does not fit or must not be shown. Its Submit is a `modal` of the handler of the same kind, with the same guards and throttle as the press it replaces (opening counts as the question did); it is acknowledged privately at once (`deferSubmit`), decides everything again, and answers privately (`editReply`, `answerApart`, or a `UserError` the router says). **Channels in a dialog are named, not mentioned:** `channelInDialog(name)` (`#oakland`; `a deleted channel` for one the bot cannot find), since whether Discord shows `<#id>` inside a dialog is not checked yet (8Q staging); the answers after Submit keep their mentions. Tests read a dialog with `test/support/dialogs.ts`.
 - A press on the controls of an answer (plan 8B-2) is answered through `pressAnswer` / `deferPress` / `answerPress` (`src/discord/late-reply.ts`): on a public answer (`/rank`, `/counters` in a post) the member who asked (`message.interactionMetadata.user`, never the deprecated `interaction`) changes the answer for everybody (`update`), anybody else gets a private copy with the change; a press on a private answer always changes it; `onlyPrivate` (a Pokébox) gives even the asker a copy. Work that takes time acknowledges first as it will answer (`deferUpdate` or a private `deferReply`; a form submitted from no message has nothing to update and is deferred as a copy). A public answer in a party's post whose party has ended is never edited: the press answers privately.
 - A control that answers in the place of the message it is on, where that message may be from before it was v2, uses `showInPlace(press, message, oldLine?)` and `sayInPlace(press, text, accent)` (`src/discord/late-reply.ts`; `onV2Message`): on a v2 message an `update` (or an edit after `deferUpdate`) with its files replacing the old ones (`attachments: []`); on a classic one `sayInPlace` answers plain text, and `showInPlace` closes it with `oldLine` (`ANSWERED_BELOW` unless given) and sends the v2 message as a private follow-up, since whether Discord takes a v2 interaction update of a classic message is not known and is not tried; a form a command opened is answered privately. Controls backed by `PendingRequests` (the questions of `/gym` and `/region`) meet a message from before a restart as expired, so these classic paths are a safety net for them; in practice only stateless controls (the `/iam` menus) reach them. An answer in a private message of its own (a command, or a press acknowledged with `deferReply`: `answeredApart`, told by discord.js setting `ephemeral` for a reply or `deferReply` and not for `update` or `deferUpdate`) goes through `answerApart(interaction, message)`; `showInPlace` throws there, and `sayInPlace` answers apart. In tests the fake controls take `v2Message: true` for a press on a v2 message whose rows the test does not give (`gymCommandsWith` and `regionCommandsWith` press so by default; `v2Message: false` is a message from before), and refuse as Discord would: a v2 `update` (or edit after `deferUpdate`) of a classic message ("a classic-to-v2 update is not tried"), a v2 message made classic, and a file component, thumbnail or gallery picture naming a file the message does not carry (a reply and a follow-up carry only their own `files`; an edit that sends `files` without `attachments` keeps none of the old ones, as discord.js sends it). `V2Message.files` are `MessageFile`s: a local path, or text made with its name (`{ attachment: Buffer, name }`).
 
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 63790514995a18c8fd1a9aec133b1e82f3bd48e0..0fc5ce107854dd0373a7a49a87c24b93199b1649 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -15,6 +15,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 ## The notifier
 
 - Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop; since plan 8R-4L a lineup's report is wanted, quiet and announced by its type, `typeKeyOf`, its Shadow wants judged by its own catches, and a grunt refined in place by a lineup is told again as a report, the hour per type keeping a second DM away, never to its reporter or the reporter of the grunt it changed, `RocketNews.alsoActors`, review R3, who have heard of the type for the hour; DMs sent before a refine are not changed). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
+- **Research by version** (plan 8R-5; `stop-reports.md`, "Research rewards reported apart"): `researchReported` works every version of a task off in the task's line (R3, `research:<server>:<task>`, `taskOfSubject`; a typed task's `typed:<text key>`), taken as the report is made (review R6), and so is the DMs' time (review F6: every channel's `eventAt` and the start of `periodEndWords` are the report's, however late its turn comes): the server's row, the reports by region channel and each channel's event (`researchEvents`) are read when its turn comes, every channel's event delivered in the same turn, so the reports of a task are told in the order they were made. A reward's report tells who wants that reward; a "one of" who wants any of its encounters, its DM's rewards line naming the member's own first (R12: `**Rewards** one of Gible, Larvitar, Beldum`). The memory `researchTold` is by subject, so a member told of a task's "one of" at a stop is told of the task's key alone there. A reward's report whose untold stops the member was all told of as "one of" there is a confirmation (R4, R5; the message's variant has its kind): `researchConfirmSentence` "Confirmed: the reward at **Yellow Mural** and **Paititi Inti** is **Gible**." with `researchConfirmBrief` (the task, until when, the reward's picture) and the usual link and reasons; where any untold stop is new for them, the usual DM names every untold stop instead. The kind is decided once per member across all the news' untold stops, in every region channel the member views (review R3, the controller's call; F4: a stop in a channel they are kept out of does not count, the viewers of each channel read once by the first channel's event where the stops lie in several and a confirmation can be sent, for every member who wants the reward and has an untold stop in any channel (review P1: not only those of the first channel), a channel whose viewers could not be read counting for all): a confirmation only where every untold stop of the news, in whichever region they view, was told of as "one of", else the usual DM; then each channel's DM (one per report and region channel, as plan 8R-1) is of that kind and names that channel's untold stops. That covers a correction after a narrowing too (told of the "one of" there, then Beldum, then Gible: Gible is confirmed). The reporter of a "one of" a report replaced (`ResearchNews.replaced`) counts as told of it at that stop, as Rocket's `alsoActors`. A narrowing to a reward a member does not want tells them nothing, and a "one of" turning out another reward is not said (Matt). When a "one of"'s turn comes it reads its reports again (`NotifyServiceOptions.stopReports`, `StopReportService.kept`; Matt's R6; once, by its first channel's event after the wants are read, for every channel alike) and leaves out every stop whose report was replaced or taken back since (another `madeAt`, or gone), so the narrowing's own DM tells the wanters of the reward as usual.
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 
 ## Sending direct messages
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index bd0e3acd81a18e9820fe3bed0fc0216cec82499f..2c40119629367ae89172562b12cdc9f5a5576798 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -28,10 +28,20 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 
 ## Reports and `/research`
 
-- `StopReportService` (`ctx.stopReports`) reports a task at one to five stops in the period on now (`reportResearch`): each stop's report of the period is replaced, whoever made it (`StopReportStorage.save` gives the one replaced), and ends with the period (`endsAt`). Listeners hear `changed(serverId, stops)` (the posts of the regions those stops lie in) and `reported(news)` (the notifier: only stops that did not have this very task in the period). A replacement is a report of its own: the replaced row is deleted and a new one made under the same lock, so a report's version never changes what it is (its id; for Rocket, the id and `madeAt`, plan 8R-4L, review L1: a grunt refined in place keeps its id) (an old answer's Take back or "Same task at more stops…" finds its report gone and answers so; `/research remove` takes back by the id it read, and says `REPORT_CHANGED` where the report was replaced meanwhile). `takeBack(serverId, refs, by, staff)` removes a member's own reports, any for staff; a replaced report does not come back. A `ReportRef` is an id or a version `{ id, madeAt }` (review L1): one refined in place since is `changed`, before whose it is, and nothing of it is taken back (`StopReportStorage.remove(id, serverId, madeAt?)` asks the version again with the row locked); `kept(serverId, id)` gives a report by its id as it is kept now. The hourly upkeep (`PartyScheduler`, `stops`) sweeps ended reports.
-- `/research report task: stop: [stop2: … stop5:] [reward:]` and `/research remove stop:` (`src/commands/research/`): from a region's channel, forum or post (`RESEARCH_FROM_A_REGION`); where the server's regions hold no stop, `NO_STOPS_HERE` (Matt's answer 7). `task` is a choice of the list (found by reward words too) or text typed in full (free text, capped at 100 characters, shown through `plainNoLinks`; with `reward:` a Pokémon, item or Mega Energy); a key gone from the list is `TASK_LIST_CHANGED`. A stop is a choice of the stops (`stop:<key>`), typed text naming one, or a maps link (the nearest stop within 50 m, `PlaceFinder.nearestStop`). The guard reads all of it so a refusal does not count; the throttle is `settings.research.throttle` in a window of its own (`researchThrottle`, `researchWindow`); one report of five stops counts once. `defer: 'late'`.
+- `StopReportService` (`ctx.stopReports`) reports a version of a task at one to five stops in the period on now (`reportResearch`): since plan 8R-5 each stop as `decideResearch` decides with the stop's row of the period locked (`saveUnless`; "Research rewards reported apart" below), the report it replaces given back; it ends with the period (`endsAt`). Listeners hear `changed(serverId, stops)` (the posts of the regions those stops lie in) and `reported(news)` (the notifier: only stops that did not have this very version in the period; since plan 8R-5 the news carries the reports they replaced, `replaced`, so that the notifier tells a narrowing of a "one of" from a first report). A replacement is a report of its own: the replaced row is deleted and a new one made under the same lock, so a report's version never changes what it is (its id; for Rocket, the id and `madeAt`, plan 8R-4L, review L1: a grunt refined in place keeps its id) (an old answer's Take back or "Same task at more stops…" finds its report gone and answers so; `/research remove` takes back by the id it read, and says `REPORT_CHANGED` where the report was replaced meanwhile). `takeBack(serverId, refs, by, staff)` removes a member's own reports, any for staff; a replaced report does not come back. A `ReportRef` is an id or a version `{ id, madeAt }` (review L1): one refined in place since is `changed`, before whose it is, and nothing of it is taken back (`StopReportStorage.remove(id, serverId, madeAt?)` asks the version again with the row locked); `kept(serverId, id)` gives a report by its id as it is kept now. The hourly upkeep (`PartyScheduler`, `stops`) sweeps ended reports.
+- `/research report task: stop: [stop2: … stop5:] [reward:]` and `/research remove stop:` (`src/commands/research/`): from a region's channel, forum or post (`RESEARCH_FROM_A_REGION`); where the server's regions hold no stop, `NO_STOPS_HERE` (Matt's answer 7). `task` is a version of the list (found by reward words too; since plan 8R-5 one choice per reward and "one of", below) or text typed in full (free text, capped at 100 characters, shown through `plainNoLinks`; with `reward:` a Pokémon, item or Mega Energy); a key gone from the list is `TASK_LIST_CHANGED`. A stop is a choice of the stops (`stop:<key>`), typed text naming one, or a maps link (the nearest stop within 50 m, `PlaceFinder.nearestStop`). The guard reads all of it so a refusal does not count; the throttle is `settings.research.throttle` in a window of its own (`researchThrottle`, `researchWindow`); one report of five stops counts once. `defer: 'late'`.
 - **One code path with the map** (plan 8R-3; `src/commands/research/research-report.ts`): `reportResearchAs(ctx, serverId, { stops, subject, reporter }, also?)` is the report as the member and the view of its answer's words (`ResearchWordsView`: the region channels whose posts show it, until when, none named in rehearsal mode); `/research report`, "Same task at more stops…" and the map call it. `stopsByKey` names stops by their keys (a titled PokéStop in a region of the server, a stop of Pine's own by `pine-<id>`, each once; the menu's and the map's). `takeBackAs(ctx, serverId, ref, by, staff)` takes a report back by its `ReportRef` (`removed` with `tookBackWords`, `not-yours`, `changed` where it was refined in place since the version asked for, `gone`): `/research remove` by the id it read, `/rocket remove` by the version it read (`{ id, madeAt }`, fix round 2, F6: a report refined meanwhile is `REPORT_CHANGED`), and the map. `reporterNamed` names a reporter (the name shown, else the account's, cut to 100). `NOT_YOUR_REPORT`, `REPORT_CHANGED` and `NOTHING_LEFT` (a Take back that finds nothing) are its words. `researchWords(view, channel)` (`src/render/research.ts`) words the answer with the caller's `ChannelNamer` (`DISCORD_CHANNEL`, `<#id>`, for the commands); `researchAnswer` wraps it with the controls and is the same message as before (an inline snapshot guards it).
-- The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced, "again" for the same task), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period, five at once; it counts in `/research report`'s window through the throttle's `as`, gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
+- The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced; since plan 8R-5 the same version is reported already, below), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period, five at once; it counts in `/research report`'s window through the throttle's `as`, gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
+
+## Research rewards reported apart (plan 8R-5)
+
+Design `docs/superpowers/specs/2026-10-23-research-rewards-apart-design.md` (its review defaults R1–R15 and Matt's rulings R6, R7). The game fact: a task Leek Duck lists with several rewards is in the game several tasks of one text, each with one reward, the same for every player at a stop all day; an item or Mega Energy reward shows on the task before it is done, an encounter only after (so a task of two or more encounters can be reported before it is done as "one of" them).
+
+- **Versions** (`src/domain/research/versions.ts`, pure): `taskVersions(task, catalogue)` gives one version per reward in the page's order (value `<task key>:<reward hash>`, `rewardHash`: 8 hex digits, FNV-1a of `rewardKey`, `hexHash` of `src/domain/short-hash.ts`; label `Gible`, `Rare Candy ×3`, a costumed encounter `… (costumed)` (`COSTUMED_MARK`) where its name is the catalogue's plain one, not where the name says it already, `Pikachu wearing a Cosmog suit` (review L9); `costumed` flags a costumed reward's version, L7), then, for a task of two or more encounters, its "one of" (value the task's key alone, rewards its encounters only, label `one of Gible, Larvitar, Beldum`, `oneOfLabel`, the rewards `first` matches before the others). A task of one reward is that one version; of none, its key alone. `rewardKey` (moved from `leekduck.ts`, which merges a task listed twice by it) tells a costume only with the catalogue. `ResearchTaskService.versions(task)` and `byVersion(value)` (R1; `versionIndex`) work them out once per list and catalogue; the test fixture gives them too. A version gone from the list (a reward hash the task no longer has) is `TASK_LIST_CHANGED`.
+- **Subjects** (`src/domain/research/reports.ts`, pure): a report's `subjectKey` is its version: `<task>`, `<task>:<hash>`, `typed:<text key>` or `typed:<text key>:<hash>` (R11: a typed task with its reward), read only by `researchSubjectOf` (never split on `:`; `taskOfSubject` the task). A report's detail keeps the rewards it stands for (the one reward, the encounters of "one of"), so the post, the DMs and the map read it as before. `isOneOf(report)` (R10): its task's key alone with two or more rewards in its detail; a report made before plan 8R-5 has every reward of its task there, items too, and reads as such a "one of" until its period ends (nothing converts it). No migration: `subjectKey` is `varchar(64)`, the longest 31 characters.
+- **The decision** `decideResearch(standing, report, now, by, replacing)` against the stop's report of the report's own period only (R15: no `standingAt`, so a report under an intra-day window never meets the day's), each with the hashes of the rewards it stands for (`StopReportServiceOptions.rewardHash`, required, review L5: the game data's catalogue in `app.ts`, `fixtureRewardHash` of `test/support/stop-reports.ts` in tests; without the catalogue no reward would be costumed, and a costumed reward over its "one of" would ask): nothing standing or ended `new`; a reward over the "one of" of its task that holds it (or one of no reward, a typed task without one) `narrow`, replaced without asking; "one of" over one of its rewards `less` and the same version `again`, both reported already (`ResearchOutcome.already`); anything else a contradiction (another reward of the task, "one of" over an item or Mega Energy version, another task), `asks` (`ResearchOutcome.asks`, Matt's R7), unless it is the reporter's own report or one the member ticked (`replacing`, its id), `correct`, replaced. A key alone with one reward is that reward's version (R10). `StopReportService.contested(serverId, stops, subject, by)` reads the contradictions without a lock, so that a member is asked before anything is reported; `reportResearch` decides again under the lock, and a contradiction met there after all (another report meanwhile, or one left unticked) keeps its report and is answered as reported already. `ResearchNews.replaced` carries the reports the news replaced (the notifier's confirmations).
+- **`/research report`** (`research-input.ts`, `research.ts`): `task`'s choices are one per version (`versionChoice`: `Make 3 Excellent Throws in a row · Gible`, the task's text cut first), in the list's order; with words typed, every version of the tasks whose text has them all first, then the versions that have them across the task's text and their rewards' names together (`excellent gible`; R12), a "one of" naming the rewards typed first; with nothing typed the first 25. `readTask` (R2) takes a version (`<16 hex>:<8 hex>`, before the typed fallback), or a task's key or its text in full: with `reward:` the version of that reward (a plain one before a costumed one, by `TaskVersion.costumed`; `<task> does not give <reward>: pick the reward from the list.` where it has none; `PICK_THE_REWARD` where two fit alike, Rare Candy ×1 and ×3: review L7), without its only version, else its "one of", else `PICK_THE_REWARD`. The guard reads the task, the stops and `contested`; where another member's report is contradicted the command declares no `defer` and opens the dialog **"Replace field research?"** (`replaceDialog`; `readInTime` with nothing more to read; `PendingRequests`, `research:<token>:replace`, `carriesOn` the command's use and window): `replaceQuestion` (shared with the map: `Another member’s report stands at stops you named. Tick each one to replace that report with **task** · reward; a stop left unticked keeps its report.`, `you picked` from "Same task at more stops…", then `Submit reports at the other stops as well.` only where the use has stops without a contest, review L4) and a checkbox group "Replace the report at" of the contested stops, unticked (one option each, by the report's id: the stop's name, and `Make 3 … · Gible, by Misty at 10:42 AM` in the description, no markdown: `contestedDescription`, who and when always kept, the name cut to 32 and the task's text to the room left, the time as `clockText` since a description shows no Discord timestamp, review L3). Cancel reports nothing; Submit (`deferSubmit`) reports at every stop, `replacing` the ticked ones among those it asked about; a listed version gone from the list since the dialog opened is `TASK_LIST_CHANGED`, the use given back (review L8). Another member's Submit is `That is somebody else’s report.`, one answered already or too old `That question has expired.` The answer (`researchWords`): a stop's replaced report as `(was: one of Larvitar, Beldum, Gible)` or `(was: Gible)` within the task, nothing where the task's reward was not said (a typed task given its reward, review L6), `(was: <other task>)` else; the stops reported already after the lines (`researchAlready`: `Already reported: **task** · Gible at **Stop**, by **Misty** <t:R>.` and the link to the message of the pinned post that holds it, `postLinkOf` over `ctx.stopPostLinks`, `StopPostService.linkOf` as last drawn; none in rehearsal mode); where every stop was reported already only those lines, without Take back or "Same task at more stops…", and the use counts (R8, as `/rocket`'s `already`).
+- **"Same task at more stops…"** (R14) carries its version in its custom id (`research:<id>:more:<version, . for :>`), so a first report narrowed or replaced meanwhile does not stop it: `moreSubject` takes the first report while it stands with that version, else the version as the list has it, else as a report of the period keeps it (a typed task), else `REPORT_ENDED` (given back); a first report of an ended period is `REPORT_ENDED` too, and so is a first report gone (taken back, replaced) where the answer's message was made in another period than now (`interaction.message.createdTimestamp`, review L1: yesterday's task is not reported into today); a menu of before plan 8R-5 (no version) reports its first report's subject as before. Its stops leave out those where the version stands, and for "one of" those where any version of the task stands (R8). A contradiction there opens the same dialog, `you picked` in its words; the reads (the subject, the stops, `contested`) are raced against `DIALOG_READ_MS` of the pick (`readOrDefer`, review F1, the slow-read rule): back in time, a contest opens the dialog (`askToReplace` checks the clock once more, `SLOW_READ` with the use given back; review L2), and without one the answer is deferred; past the budget the pick is deferred privately at once, and when the reads come back a contest is answered `SLOW_READ` in the deferred reply, the use given back (no dialog can open after a deferral), while without one the report goes on. A contradiction met after the reads is said as reported already.
 
 ## Team GO Rocket (plan 8R-2)
 
@@ -45,11 +55,11 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 ## The pinned post "Today at the stops"
 
 - `StopPostService` (`src/services/stop-posts.ts`): one post per region channel and local day, made at the first report of the day in the region, pinned (the "pinned a message" notice deleted where the bot may; at Discord's pin limit, or without Pin Messages, it stands unpinned and that is logged once per channel), drawn anew `POST_DELAY_MS` (3 s) after the last change (`Gathered`, coalesced) in one queue per channel (`KeyedLock`), the midnight delete included; reads are done before any Discord call. A change of the reports is drawn only in the regions it touched: `StopReportListener.changed(serverId, stops)` names the stops of the reports made or taken back (a replaced report's too), and only the region channels whose outlines hold one of them are queued; the period changes and the research events draw every post. A message whose payload equals the one last drawn there (a hash per message id, in memory: the first draw after a restart edits) is not edited. An edit that fails is thrown (logged, the post stands, the next change draws it again); a message is deleted and sent anew only when it is gone or changes kind (components v2 to plain text, or back, as `mayPost` changes), and, its kind not known in the first draw after a restart, when Discord refuses its edit for what it holds (`isRefusedBody`); any other failure keeps it there too. A channel with no post in memory reads its kept rows from storage before it draws (a report before `start` has read them, or after that failed, edits the post a restart left; a failed read draws nothing), and `start` keeps what such a draw made, and deletes a post older than its channel's newest (one whose delete failed at its midnight). A timer at `nextPeriodChange` draws every kept post anew (`draw` deletes the post of an ended day and makes today's where reports stand); `start()` does the same for what a restart left (`StopPost` keeps the ids, each message's saved as soon as it is sent, before it is pinned), and sets the timer also when the kept posts cannot be read; a change of the research events (`onResearchChange`) draws the posts anew and sets the timer again (those redraws in a set of their own, which `flush` and `close` wait for and `messageOf` does not: it waits only for its own channel). It is kept, saying "Nothing reported right now.", when every report is taken back. None in rehearsal mode. The region's summary post links it (plan 8X-G, `parties-and-posts.md`): `summaryOf(channelId)` gives the server, the post's first message and how many tasks and hideouts it shows as last drawn (the hideouts as the post counts them, one per leader or decoy whatever its stops, review r0 C2), undefined without a post of today drawn since the start; `changed(channelId)` (`StopPostServiceOptions`, `app.ts`: `PartyService.summaryChanged` of the channel's region) is told after each draw and each delete, so the summary is drawn anew after every draw of the post and edited where the counts changed. Where the post lives, the region's channel or its forum, is open until the 8R staging.
-- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first, each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"), the reward's picture beside it; within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it), under an intra-day window when the day's research comes back. Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (the first catch's picture beside it) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
+- `stopPostMessages` (`src/render/stop-post.ts`): research grouped by task, most stops first (plan 8R-5, R9: one block per task, counted as tasks; a task of one version with its rewards beside it, of several a line of each version's rewards before its stops (`reward not said` for a typed task's version without its reward, review R1), the rewards' versions first and "one of" last, one picture; the versions as the decision sees them (`grouped` by `StopReportService.versionOf`, review R2: a report of before plan 8R-5 of a task of one reward under that reward's version, R10; "one of" before and now one group), each in the words of its newest report; the task's key and every version placed, so a DM of any version links the block), each with its rewards and up to 15 stops (`- **Stop** · address · **Reporter**`, whole lines only, as many as fit, the rest counted: "…and N more stops"), the reward's picture beside it; within 40 components and `TEXT_BUDGET` a message, spilling into a second and third (`MAX_POST_MESSAGES`), then "…and N more tasks"; under an event the event's line (its tasks `until …` as `periodEndWords` says it), under an intra-day window when the day's research comes back. Where the bot may not embed, plain text of 2,000 characters a message (`stopPostText`). Both give the layout's `placement` (which message holds each task), so `messageOf(channelId, subjectKey)` (the channel's waiting change drawn first, `Gathered.flushKey`) gives a DM its link; `linkOf(channelId, subjectKey)` (plan 8R-3) gives it as last drawn, else the post's first message, and draws nothing: the map asks on every poll, where `messageOf` would edit the post each time. The day's hideouts (plan 8R-2) go after the research under `### Team GO Rocket hideouts`: Giovanni, Cliff, Arlo, Sierra, the decoy (`hideoutsOf`), each with what can be caught (the first catch's picture beside it) and its stops as a task's are; tasks and hideouts are blocks of one layout, the rest counted as "…and N more tasks and M more hideouts", the placement keyed by the `rocketKey` too. A hideout makes the day's post where none is; a grunt is never in it; hideouts belong to the day, so an event's window does not hide them.
 - `PartyGateway.pinMessage` / `unpinMessage` (`PinOutcome`: `pinned`, `full`, `not-allowed`, `gone`); Pin Messages is optional in `REGION_CHANNEL_NEEDS`, so `cutover-check` warns where it lacks.
 
 ## Wants and DMs
 
 - `/want`'s dialog, `TargetWant` and the matching are in `notifications-and-dms.md` ("Wants and gym targets", "The notifier"). "Grunt (no type)" is typed as `no type`, `no type grunt` or `grunt (no type)`; `none` typed in full is zero IVs, the legacy word (fix F4), and the list of choices offers both for it.
-- A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority, one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, until when as `periodEndWords` says it; all through `plainNoLinks`), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
+- A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority (plan 8R-5: a "one of" by any of its encounters, its DM naming the member's reward first; see `notifications-and-dms.md`, "Research by version"), one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, until when as `periodEndWords` says it; all through `plainNoLinks`), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
 - A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`; a lineup's report by its type, `typeKeyOf`, plan 8R-4L: wants stay by type, `grunt:water` fires on both lineups and on "not sure which", and a lineup's key is never a want, `isRocketWho`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches; judged by the report's own catches, so a Shadow Magikarp fires on the lineup that gives it and on "not sure which", not on the other lineup: a Shadow want is how a lineup's catch is wanted). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`, keyed by the type's key; a grunt's announcement runs in its type's line, `rocket:<server>:<type key>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel. A grunt's reporter, and on a refine in place the reporter of the grunt it changed (`RocketNews.alsoActors`, review R3), are never told of it and have heard of its type for the hour. A refine changes no DM sent already (as with a grunt taken back early, B2): a DM of "not sure which" or of the other lineup can point at a lineup without the catch it named (review R7). A hideout goes at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, when it goes or until when it stands). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index ea97f5419352ccf1faf403314c05f6d1341181ff..63e6f223791070016688534bd8f38fd7ec36ad02 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -25,7 +25,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 ## Fake interactions
 
-- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu, checkbox group or radio group (Discord refuses the Submit without one) and at least a menu's or group's `min_values` chosen unless it may stay empty and is (plan 8R-4: a first want's required Tell me about), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). The bot's servers and their names (`interaction.client.guilds.cache`, what a press in a DM names a server by) are `serverNames` (plan 8R-4). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
+- Handler tests use the fakes of `test/support/fake-interactions.ts` (`fakeChatInput`, `fakeAutocomplete`, `fakeButton`, `fakeSelect`, `fakeModal`, `fakeMessageCommand` with the `targetMessage` it was used on, a forward's snapshot by `forwards`, `sent()`; a control's message, `fakeMessage`, has the interaction's time as its `createdTimestamp` unless a test sets one, plan 8R-5), which refuse what discord.js refuses (a second acknowledgement, a follow-up before any reply, a missing required option) and a form Discord would refuse (`checkModal`: a title of 45, 1 to 5 labels or rows, a label of 45, custom ids unique, string selects of 1 to 25 options, checkbox groups of 1 to 10 and radio groups of 2 to 10, values unique, labels and values of 100 and descriptions of 100, `min_values` / `max_values` within the options, no more defaults than may be chosen, a text display of 1 to 4,000 characters). A submitted form is as strict as discord.js (reading an input it did not submit, or as another type, throws) and carries `fields` (text), `selected` (select menus), `checked` (checkbox groups, `fields.getCheckboxGroup`) and `picked` (radio groups, `fields.getRadioGroup`); given the form the opener showed (`form`), it submits every input of it (an empty text as `''`, an unticked group or an optional menu as `[]`, an optional radio group as `null`), needs a value for a required menu, checkbox group or radio group (Discord refuses the Submit without one) and at least a menu's or group's `min_values` chosen unless it may stay empty and is (plan 8R-4: a first want's required Tell me about), a radio group's pick among its choices, and refuses inputs the form does not have (the `/gym` helper passes the form the bot showed); a control's message says who asked for it (`askedBy`: `interactionMetadata.user`) and whether it is private (`ephemeralMessage`). The bot's servers and their names (`interaction.client.guilds.cache`, what a press in a DM names a server by) are `serverNames` (plan 8R-4). Test a handler that has `defer` through `InteractionRouter.handle`, or give the fake `deferred: true`.
 - A dialog (plan 8Q, `discord-framework.md`) is read with `test/support/dialogs.ts`: `dialogOf(fake)` (undefined when none opened) or `shownDialog(fake)`, `withoutToken(customId)` (its id without the per-open token, failing when there is none; compare that with a literal id, and submit it to test a dialog from before the token), its `dialogTexts` / `dialogText`, and `dialogChoices` (value, label, description, and `picked` for a choice picked beforehand, Discord's `default`; of radio groups and, since plan 8X-1B, string selects). A Submit of a menu passes `selected`, of a line of text `fields`. Submit it with `fakeModal({ customId: dialog.custom_id, form: dialog, picked })`, so that the fake refuses a required choice left empty. The slow-read rule is tested by holding the read (a spy that resolves a promise when it is asked and never answers), then `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` before the press (the timer is set before the read is asked; the fake's `createdTimestamp` is the real now, so the budget is about `DIALOG_READ_MS`) and `vi.advanceTimersByTimeAsync(DIALOG_READ_MS)` once it was asked. A submitted form's `fields.fields` is the map of what it submitted, as discord.js's (`pickedOf` asks it). Plan 8R-4: a form's one tick box (`ComponentType.Checkbox` in a Label, nothing but its `custom_id` and `default`; `checkModal` refuses more) is submitted with `ticks` (by custom id; one not named comes back unticked) and read with `fields.getCheckbox`; `dialogFields(dialog)` / `dialogField(dialog, label)` give a dialog's fields with their labels, descriptions, kinds, a Checkbox's tick and a group's or menu's options as ticked to start with.
 
 ## Parties
@@ -58,8 +58,8 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 
 - Each repository of `stop-reports.md` and its twin run one set of cases: `stopReportCases` (`test/support/stop-report-cases.ts`, with `reportedStop(n, overrides)` (Yellow Mural `n` at 40.44…, −79.99: outside the invented regions, so a test that needs a region moves it, as `west(n)` in `stop-posts.test.ts`), `researchReport()`, `REPORT_NOW`, `REPORT_SERVER`, `DRATINI`), `pineStopCases` (`newPineStop()`), `researchEventCases`, `researchTaskCases` and `stopPostCases` (`test/support/research-store-cases.ts`, with `INTO_THE_WILD`, `PAWNIARD_DAY`, `listedTask()`; twins `MemoryResearchEvents`, `MemoryResearchTasks`, `MemoryStopPosts` in `test/support/research-store.ts`), `targetWantCases` (its constants of every kind of target), `wantBoxCases`.
 - The kept max and big events (plan 8X-F, `utilities.md`): `maxEventCases` (`test/support/max-event-store-cases.ts`, with `feedMaxEvents()` and `feedBigEvents()`, those of the recorded feed) run on `MaxEventRepository` and its twin `MemoryMaxEvents` (`test/support/max-event-store.ts`, `failing` per method).
-- The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?, staleAfterHours?)` (`test/support/research.ts`, a `ResearchTaskProvider`, `readAt` `null` for a list never read, out of date `staleAfterHours` (6) after `readAt`, `ctx.researchTasks` of `createTestContext()`). Events with spawns (plan 8R-4): `readSpawnEventFeed()` (ScrapedDuck's whole `events.json` of 2026-10-22, `test/fixtures/scrapedduck-events-2026-10-22.json`) and `readEventPage(file)` (Leek Duck's Halloween 2026 Part I and Teddiursa Spotlight Hour pages, cut to the sections read), `test/support/spawn-events.ts`; `createTestContext()` gives `ctx.eventSpawns` with no spawns, and `partyServiceWith([], { spawnCostumes })` a `SpawnService` that asks `spawnCostumes.sightingsAt`. Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
-- `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
+- The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?, staleAfterHours?)` (`test/support/research.ts`, a `ResearchTaskProvider` with the versions of its tasks, plan 8R-5, `versions(task)` and `byVersion`, `readAt` `null` for a list never read, out of date `staleAfterHours` (6) after `readAt`, `ctx.researchTasks` of `createTestContext()`). Events with spawns (plan 8R-4): `readSpawnEventFeed()` (ScrapedDuck's whole `events.json` of 2026-10-22, `test/fixtures/scrapedduck-events-2026-10-22.json`) and `readEventPage(file)` (Leek Duck's Halloween 2026 Part I and Teddiursa Spotlight Hour pages, cut to the sections read), `test/support/spawn-events.ts`; `createTestContext()` gives `ctx.eventSpawns` with no spawns, and `partyServiceWith([], { spawnCostumes })` a `SpawnService` that asks `spawnCostumes.sightingsAt`. Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
+- `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events, rewards hashed with the fixture's catalogue; a test that makes its own passes `rewardHash: fixtureRewardHash`, `test/support/stop-reports.ts`, the option being required), `ctx.stopPostLinks` (no post holds anything: a test of "Already reported" passes its own `linkOf`, plan 8R-5), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
 - `FakePartyGateway` pins (`pinMessage` / `unpinMessage`): `noPinning` (channels where it is `not-allowed`), `pinLimit`, `pinNotices` (the notices it deleted), `pinnedIn(channelId)`.
 - Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?, staleAfterHours?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `readAt` and `staleAfterHours` (24) as the task list's, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). Two lineups of a grunt type (plan 8R-4L): the fixture's water and untyped grunts have them (`feedChoice('grunt:water').lineups`: Mudkip's, then Magikarp's; `lineupChoice` and `lineupValue` make a choice and its picked value of one); `magikarpLineup(overrides)` and `MAGIKARP` (`stop-report-cases.ts`: the Magikarp lineup by Misty a minute after `REPORT_NOW`), `waterWithLineups()` (`rocket-store-cases.ts`, a short choice with both lineups and their fingerprints); a row of before (a bare list) and unreadable lineups are tested only against the repository, by a raw write (`rocket-repositories.db.test.ts`). A grunt's messages refined in place are edited on the fake gateway (`FakeMessage.edits`); `grunt-messages.test.ts` fails an edit per channel (`failEdit`) and holds a send or an edit (`hold(kind, channel)`, `rocket-reports.test.ts` `holdSend(channel)`: a `HeldCall` of `test/support/held-call.ts`, named by `heldCall(what)`, whose `reached` the test awaits to act while the call is on its way, then `release()`; review R1; `reached` gives up after `TALLY_LIMIT_MS`, naming the call, as `Tally.reached` does, fix round 2, F8), and records each edit's kind as it is asked for (`tried`: that nothing more was asked while an edit is held, after `settle()`, and the kinds a refine tries). The notifier of a restarted process, which remembers nothing it told, is `new NotifyService(made.notifyOptions)` over the same stores and `dms` (`partyServiceWith`; `notify-service.rocket.test.ts`'s `restart()`). A Take back whose id is gone is tested by moving the report's row of `MemoryStopReports` to another id, as a report put back would be (`rocket.test.ts`). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 705915b1e3a5ed14a7a21c6375317ced467a5548..84eee1a3f222d5e231af9b8bd1b5da43a3f499a2 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -100,9 +100,9 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **Scope** (Matt, 2026-10-22, as 8X-5): the server side alone: the data, the routes and the code paths they share with `/research` and `/rocket`. The page (`src/web/client/`) has none of it yet (no layer, popups, Report research / Report Rocket, right-click, filter): left for the UX pass (follow-ups, "From the 8R-3 prototype"). No migration, no command change.
 - **One code path per command** (spec 3.5; `stop-reports.md`, "Reports and `/research`"): `reportResearchAs` and `stopsByKey` (`src/commands/research/research-report.ts`), `reportRocketAs` and `hideoutQuestion` (`src/commands/rocket/rocket-report.ts`), `takeBackAs`; the answers' words are `researchWords` and `rocketWords` with the caller's `ChannelNamer` (on the map a region channel as `#west`, `Region 5` where the bot sees no name), the heading of the command's answer left out, made page text by `pageWords`. The web server is given what the commands read and call (`StopWebDeps.ctx`, `StopWebContext`), the channel names the bot sees (`channelName`), the pinned posts' messages as last drawn (`posts`: `StopPostService.linkOf`, which draws nothing and waits for nothing, unlike `messageOf`, which flushes the gathered redraw and would edit a post on every poll) and the grunts' messages (`grunts`: `GruntMessageService.messagesOfReports`, one read for every grunt of a request, `GruntMessageStorage.ofReports`); both undefined in rehearsal mode, which leaves the web server off anyway.
 - **Who sees which reports** (review R1): a report lies in the regions of the server whose outlines hold its stop's snapshot (`regionsAtPoints`: the server's regions taken once a request and each outline's box tried first, `containment` as the pinned post's; each report placed once, for who may see it and for the view alike; a stop renamed or gone later the same day stays, design 3), and shows unless the member is `barred` from the forum of every one of them (a region without a forum always shows it): the parties' rule, through the same `PartyViewers` (one for `/api/parties` and `/api/stop-reports`, made in `guildRoutes`, so that what Discord said of a forum serves both; read-only while Discord is away, 503 for a member it has not confirmed lately). No text channel is fetched. A report in no region now is shown to nobody.
-- **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`; whether somebody is a member is asked first, `PartyViewers.membership`, the directory's answer kept a minute, so that nothing of the server is read for anybody else, and the forums after the read, `viewer(…, forumsOf(places), membership)`, which does not ask Discord again): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the pinned post says it, `event` the event's name; `grunts`: until their `endsAt` (a lineup's with its label, `MapGrunt.lineup`, plan 8R-4L; `MapHideout` has none); `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `madeAt` (with `id` its version, which a take-back sends back, plan 8R-4L, review L1), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's pinned post that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (the task's key, `typed:<key>` for a typed task: it tells tasks apart and is never sent back as a report's `task`; the same task at more stops is sent as `sameAs` of the report's `id`), `text`, `category`, `typed`, `rewards`; grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (its first catch's, as the post shows it). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
-- **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards }`, `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note?, lineups? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), a grunt type's two lineups (plan 8R-4L, B9; `RocketLineupOption`: `key` `grunt:water:male`, `value` `<key>#<fingerprint>` as a report sends it, `label` the first slot in short, `fingerprint`, `catches`; in the feed's order, the type's own `key` then "not sure which"), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
-- **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, stops }` or `{ sameAs, stops }` (strict, one or the other, never both nor neither: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; `sameAs` the id of a research report, the page's "Same task at more stops…"; one to five stop keys, each up to 60). Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a power spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them; a `task` that is a typed task's key, `typed:…` in any case, 422 `TYPED_TASK_KEY`, never stored as text), or instead the report `sameAs` names, resolved as `researchControls` resolves its base (`StopReportService.get`: research of this server whose `periodKey` is the period on now, else 409 `REPORT_ENDED` in the command's words, logged `ended`), whose `{ subjectKey, research }` is reported as it stands (a typed task with its text and reward, a listed task gone from Leek Duck's list since). Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew +4`, a line per stop, where it shows), the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The pinned posts and DMs follow by themselves. Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `no-stops`, `no-stop`, `refused`, `ended`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route of its own: the page sends another report with `sameAs`, counted in `/research report`'s window as the command's menu is.
+- **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`; whether somebody is a member is asked first, `PartyViewers.membership`, the directory's answer kept a minute, so that nothing of the server is read for anybody else, and the forums after the read, `viewer(…, forumsOf(places), membership)`, which does not ask Discord again): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the pinned post says it, `event` the event's name; `grunts`: until their `endsAt` (a lineup's with its label, `MapGrunt.lineup`, plan 8R-4L; `MapHideout` has none); `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `madeAt` (with `id` its version, which a take-back sends back, plan 8R-4L, review L1), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's pinned post that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (its version, plan 8R-5: `<task key>:<reward hash>`, the task's key alone for "one of", `typed:<key>[:<hash>]` for a typed task: it tells versions apart; the same version at more stops is sent as `sameAs` of the report's `id` while the report stands, and once it is gone (narrowed or replaced since, where `sameAs` is `REPORT_ENDED`) as the report's `task` with `more: true` for a listed one (review R4, the controller's call; F3), a typed one's `task` being refused), `text`, `category`, `typed`, `oneOf` (R13: `isOneOf`, a report of before plan 8R-5 with every reward of its task too), `rewards` (the one reward, or those "one of" stands for); grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (its first catch's, as the post shows it). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
+- **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards, versions }` (`versions`, plan 8R-5, R13: `{ value, label, oneOf }` as `/research` offers them, `ResearchTaskProvider.versions`; a report sends a `value` as its `task`), `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note?, lineups? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), a grunt type's two lineups (plan 8R-4L, B9; `RocketLineupOption`: `key` `grunt:water:male`, `value` `<key>#<fingerprint>` as a report sends it, `label` the first slot in short, `fingerprint`, `catches`; in the feed's order, the type's own `key` then "not sure which"), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
+- **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, more?, stops, replacing? }` or `{ sameAs, stops, replacing? }` (strict, one or the other, never both nor neither; `replacing` the ids of the reports the member said to replace, up to five, plan 8R-5: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; `sameAs` the id of a research report, the page's "Same task at more stops…" while that report stands; `more: true` beside `task` for "Same task at more stops…" once it is gone, the report's `task` sent as `task` (review R4, F3); one to five stop keys, each up to 60). `sameAs` and `more` are "Same task at more stops…" alike: its question says the stops `picked` and `reportResearchAs` gets `also` (the "Also reported" of Discord's answer; the map's words leave the heading out). A listed report of before plan 8R-5 has its task's bare key as `task`: one whose rewards are only items names no one reward, and `more` with it is refused with `PICK_THE_REWARD` (422), accepted since such reports stand only on the day of the deploy. Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a power spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them; a `task` that is a typed task's key, `typed:…` in any case, 422 `TYPED_TASK_KEY`, never stored as text), or instead the report `sameAs` names, resolved as `researchControls` resolves its base (`StopReportService.get`: research of this server whose `periodKey` is the period on now, else 409 `REPORT_ENDED` in the command's words, logged `ended`), whose `{ subjectKey, research }` is reported as it stands (a typed task with its text and reward, a listed task gone from Leek Duck's list since). Without `replacing`, **the contradiction question** (plan 8R-5, R7), where `/research` opens its dialog: other members' reports at the stops that the version contradicts (`StopReportService.contested`), unless `/research report`'s window is full (429, nothing counted), 422 `{ ok: false, text: replaceQuestion(…), asks: { reports, hidden? } }` (the contested reports as the list shows them, where shown; those it does not show the member, in a region they are kept out of or all where `shownTo` fails, by id and stop name only as `hidden: { id, stop }[]`, review R5, so that the page can still overrule them); sent again with `replacing` (any of their ids, none for none), those are replaced and the others keep theirs, decided anew inside the store. Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research, already }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew`, a line per stop, where it shows; the stops reported already after them, R8, by the reporter's name and without a link), the stops reported already (the same version, or one that says more, standing there; or a contradiction met after the question) as `already`; where every stop was, 409 `{ ok: false, text, research: [], already }`, counted as `/research` counts it, the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The pinned posts and DMs follow by themselves. Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `already`, `asks`, `no-stops`, `no-stop`, `refused`, `ended`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route of its own: the page sends `sameAs` with the listed report's id; once that is `REPORT_ENDED`, the report's `task` with `more: true`; a typed task only `sameAs`. It is counted in `/research report`'s window as the command's menu is.
 - **A Rocket report** `POST /s/<guild>/api/rocket`, body `{ who, stop, replacing? }` (strict: `who` as `/rocket`'s `who:`, a key, a lineup's `value` (plan 8R-4L: a fingerprint not of now is `LINEUPS_CHANGED`, uncounted) or a name typed in full, 1 to 100; a lineup over "not sure which" or the other lineup refines the grunt in place, as `/rocket` does, its `grunt` keeping its id; the question names a lineup by `rocketLabel`; one stop key; `replacing` the id of the hideout the member said Replace to). The order as for research, `readWho` the reader (`LINEUPS_CHANGED` among its words); then **the hideout question**, where `/rocket` opens its dialog (a grunt at a stop whose standing Rocket report, `rocketAt`, is a hideout, unless `replacing` is that hideout's id): unless `/rocket report`'s window is full (429, nothing counted: `throttledOnTheMap` with `count: false`, as Discord opens no dialog then), 422 `{ ok: false, text: hideoutQuestion(…), asks: { replacing: <hideout id> }, hideout? }` (the hideout as the list shows it, where shown); the report sent again with that `replacing` replaces it, decided anew inside the store (`decideRocket`: another hideout by then is asked about again). No state is kept between the two requests (as 8X-5's ending-soon question). Then `/rocket report`'s throttle (`rocketWindow`), then `reportRocketAs`: 200 `{ ok: true, text, grunt | hideout }`; the same grunt standing 409 "Already reported: a Water-type grunt at …, by Bob 2 min ago; it goes away in 28 min." with the `grunt` and its `link` (counted, as `/rocket` counts it, 8R-2); a hideout reported between the route's look and the report 422 with the question (the use given back); a grunt posted in none of its region channels 503 in `/rocket`'s words with the channels named `#west` (`unposted`, the use given back); one overtaken while posted 409 (given back); an unexpected failure gives it back too. Logged `{ user, guild, stop?, outcome }` (the stop's key once found), "Team GO Rocket was reported on the map".
 - **Taking back** `POST /s/<guild>/api/stop-reports/<id>/remove` (body empty, `{}`, or `{ madeAt }`, the report's `madeAt` as the list gave it, plan 8R-4L, review L1; an id that is not 1 to 10 digits 404 before the body): after the session, the body and `actingOnTheMap`, the report by id of this server that has not ended (`StopReportService.get`: an unknown id, another server's and one gone answer alike, 409 `{ ok: false, text: NOTHING_LEFT }`, R14), the member's own or any for staff (`isMapStaff` of the member fetched fresh; 403 `{ ok: false, text: NOT_YOUR_REPORT }`), with a `madeAt` that is no longer the report's before that (a grunt refined in place since keeps its id: 409 `{ ok: false, text: REPORT_CHANGED }`, for its first reporter and staff alike, and again where `takeBackAs` meets a refine meanwhile, `changed`), none counted; then `MEMBER_WRITE_THROTTLE` in `/research remove`'s or `/rocket remove`'s window by the report's kind; then `takeBackAs`: 200 `{ ok: true, text: "Took back Catch a Dragon-type Pokémon at Yellow Mural." }`. A hideout put back under a new id (8R-2's fix S3) is found by the page's next poll, not by the old id. Logged `{ user, guild, report, outcome }`, "a report at a stop was taken back on the map".
 
diff --git a/docs/superpowers/specs/2026-10-21-stop-reports-design.md b/docs/superpowers/specs/2026-10-21-stop-reports-design.md
index d16cff6fa3ecbd6acc6be0b4be12d7249b71365e..bcf2064c1bac674780176ee63a44353ee3989f9d 100644
--- a/docs/superpowers/specs/2026-10-21-stop-reports-design.md
+++ b/docs/superpowers/specs/2026-10-21-stop-reports-design.md
@@ -5,7 +5,7 @@ Matt and Claude, 2026-10-21 (brainstorm in chat). Status: **approved by Matt (20
 ## 1. How they are played (what Matt said)
 
 **Field research.**
-- A PokéStop's task is the same for every player for the day; the reward is drawn per player from the task's pool (Leek Duck: "Catch 7 Pokémon" gives one of Magikarp, Stufful or Wimpod).
+- A PokéStop's task is the same for every player for the day; the reward is the same all day too, for every player at that stop: a task Leek Duck lists with several rewards ("Catch 7 Pokémon": Magikarp, Stufful or Wimpod) is in the game several tasks of that text, each with one reward (corrected 2026-10-23, Matt; it was thought to be drawn per player: plan 8R-5, `2026-10-23-research-rewards-apart-design.md`).
 - Members report only the good tasks, but often several stops at once: "2 Excellents for Dratini @ Yellow Mural, Paititi Inti, and Little's". During the week-long events one or two tasks are what everybody wants, and wanting them ("ping me for whichever stops have it today") would be popular.
 - Today members scroll back through the day's messages to find what was reported.
 - **Intra-day events** (every Community Day, for example) have research of their own. For their few hours the event's tasks replace the day's. When the event ends, the day's research comes back for the rest of the day, **with the same task at each stop as before the event**.
diff --git a/src/domain/research/task.ts b/src/domain/research/task.ts
index 342b57f7f9f16e00690466748a1b16a3185ffc38..5fe65a6eb5634e70e81a17481c913d9a6c17fe00 100644
--- a/src/domain/research/task.ts
+++ b/src/domain/research/task.ts
@@ -6,7 +6,10 @@ import { foldText } from '../search/text.js';
  * `leekduck.ts`, the list is kept by `ResearchTaskService`.
  */
 
-/** A reward a task may give (one is drawn per player from the task's rewards). */
+/**
+ * A reward a task may give. A task of several rewards is in the game several tasks of one text,
+ * each with one reward, the same all day at a stop (plan 8R-5: `versions.ts`).
+ */
 export type TaskReward =
   /**
    * A Pokémon to catch: `key` and `dex` are the catalogue's entry where the page's name and
````

