# Phase 8R-4L: Grunt Lineups Reported Apart: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the fifth plan of reports at stops (Gantt phase 17). It builds section 4b ("Two lineups of one grunt type") and S5–S11 of the design `docs/superpowers/specs/2026-10-22-costume-form-wants-design.md`, before the stagings of 8R-1 to 8R-4L.

ScrapedDuck lists some grunt types twice: a male and a female grunt with different lineups. 8R-2 merged them. Now:

- **Reporting.** A type with two lineups is offered three ways: "Water-type grunt · Magikarp, Feebas", "Water-type grunt · Mudkip, Tentacool, Krabby" and "Water-type grunt · not sure which".
  - Each lineup is named by its first slot, never its gender.
  - A report's catches are the chosen lineup's.
- **Wants stay by type.** A Shadow want fires only on the lineup that gives its Pokémon, and on "not sure which".
- **Narrowing a report** (Matt, 2026-10-22). A lineup reported over "not sure which" of its type, or over the other lineup, changes the standing report in place, so every DM's link keeps working. Its id is kept and its messages are edited.

**Architecture:**

- **The domain:**
  - `src/domain/rocket/lineups.ts`: lineup keys `grunt:<type>:male|female`, `typeKeyOf`, `lineupFingerprint`, `RocketChoice.lineups`;
  - `reports.ts`: `decideRocket` with `refine`;
  - `src/domain/short-hash.ts`: `whichHash`, moved out of `species-answer.ts`.
- **Storage:**
  - `RocketLineup` keeps a type's lineups inside its catches JSON;
  - `StopReportStorage.saveUnless` gives a verdict (`keep`, `replace` or `update`) and makes an in-place update strictly newer;
  - `remove` takes a version (id and `madeAt`);
  - `GruntMessageStorage.retime` is new.
- **Services:**
  - `StopReportService` answers `refined`, and has `kept` and `takeBack` by version;
  - `GruntMessageService` runs a report's turns in order (`KeyedLock`), with `refine`;
  - `RocketService` refines, and checks the version after posting;
  - `NotifyService` works by type, with `alsoActors`.
- **Commands:** `/rocket report`'s choices, `readWho` with fingerprints, Take back by version, and `/rocket remove` by version.
- **The map's server side:** `RocketWhoOption.lineups`, `MapGrunt.lineup`, and `madeAt` on every report, so a stale take-back gets 409.

**Tech stack:** TypeScript 6.0, Node 24, discord.js v14, Kysely, Vitest.
- No new dependency.
- **No migration**, no game data change and no party state change.
- **No command change** (`/rocket`'s options are unchanged), so no deploy is needed for this plan alone.

**Spec:**
- the design above;
- the brief `.superpowers/sdd/8r-4l-lineups/design.md`, with its review B1–B14 and Matt's B2 ruling;
- the fix rounds `fix-round-1.md` and `fix-round-2.md`;
- the ledger (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch `proto-8r4l` (tip `3df73667`, tag `proto-8r4l-r3`), one commit per task, on `stop-reports` 175c582a. Each commit typechecks and passes its tests. On the tip, the full check (9,102 tests), the build and the database suite (595) are clean.

**Reviews:**

- **The brief:** a fresh Opus reviewer read it before any code. Three Important findings (a lineup dropped when a report is read back, dead DM links after a narrowing, the order of the choices) and eleven Minor ones, all folded in. Matt ruled on the dead links: change the report in place.
- **The prototype:** two Opus reviewers went through it.
  - Tasks 1–3: one Important (an id no longer told the version after an in-place change) and five Minor.
  - Tasks 4–7: three Important (a refine racing its post, two refines racing each other, the first reporter told of their own grunt) and five Minor.
- **The fix rounds:**
  - The first fix review found one Important (versions taken from the clock before the lock) and nine Minor.
  - The second fix review found one Minor, which goes into this plan's fix wave with two doc notes.
  - Everything else is folded into the commits below.

## Decisions in this plan

Matt's rulings (2026-10-22) and the calls made while prototyping:

1. **Labels.** A lineup is named by its first slot, never its gender. A type's lineups come in the feed's order, then "not sure which".
   - With nothing typed, `/rocket report who:` lists one choice per type.
   - The lineups show once the typed words find a type, while the whole list fits 25.
   - A typed name (`water`) is "not sure which".
2. **Lineups are kept apart only when sure.** That means two lineups of the two genders with different first slots. Anything else stays merged, as in 8R-2.
3. **Wants stay by type.** There is no want of a lineup. A Shadow want is the way to want a lineup's catch.
4. **Narrowing in place** (Matt, B2). The same id, edited messages, a strictly newer version, and nothing ended.
   - DMs already sent are left as they are. A narrowing can leave an earlier DM pointing at a lineup without the catch it named; the follow-up on editing DMs of reports taken back early would cover it.
   - The first reporter is not told of their own grunt.
5. **A report's version is its id and `madeAt`.** An older Take back, `/rocket remove` and the map's take-back answer "changed" instead of removing a newer version.
6. **No migration.**
   - The lineups live in the type's JSON row.
   - A grunt message's kind is not kept, so after a restart an edit guesses it from the channel's permissions.
7. **The fingerprint** of a lineup is in its choice value (`<key>#<fp>`), so a choice made before a rotation changed the lineup is `LINEUPS_CHANGED`.

**For staging:** an older checkout on the shared dev database reads the new-shaped `RocketLineup` rows as unreadable and leaves those types out until its next refresh.

### Task 1: 8R-4L task 1: Grunt lineups in the domain

Prototype commit: `efcff0e64d0afc9821dd4fadcebdfed932b3cf10`

A grunt type that ScrapedDuck lists twice (a male and a female grunt
with different lineups) keeps both lineups inside its choice
(RocketChoice.lineups: which, the first slot's names, the catches and
a fingerprint), while its own catches stay the union. Only two lineups
of the two genders with different first slots are kept apart; the
gender is read from the feed's name, "female" before "male", as words.

Keys: grunt:<type>:male|female for a lineup (parseRocketKey reads the
third part only for a grunt), typeKeyOf for the type, lineupFingerprint
(whichHash of the first slot, "|", the catches), lineupChoice for a
lineup taken as a choice. decideRocket reads a report's key and its
lineup's first slot (RocketDetail.lineup): a lineup over "not sure
which" or the other lineup is 'refine', and so is the same lineup of
another first slot (rotated within the grunt's time); "not sure which"
over a lineup is 'already'. isRocketWho refuses a lineup: wants stay by
type.

whichHash moves to src/domain/short-hash.ts, which its users import:
lineups.ts importing species-answer made a cycle through target-wants.

**Files:**

```
 src/commands/notifications/want-boxes.ts  |   2 +-
 src/commands/notifications/want-dialog.ts |   2 +-
 src/commands/notifications/wants.ts       |   2 +-
 src/domain/notify/target-wants.test.ts    |   3 ++
 src/domain/notify/target-wants.ts         |   9 +++-
 src/domain/pogo/species-answer.test.ts    |   2 +-
 src/domain/pogo/species-answer.ts         |  20 --------
 src/domain/rocket/lineups.test.ts         | 144 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/rocket/lineups.ts              | 176 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/domain/rocket/reports.test.ts         |  69 +++++++++++++++++++++++-----
 src/domain/rocket/reports.ts              |  35 +++++++++++---
 src/domain/short-hash.ts                  |  25 ++++++++++
 src/domain/stops/report.ts                |   5 +-
 src/services/stop-reports.ts              |   4 +-
 14 files changed, 429 insertions(+), 69 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/notify/target-wants.test.ts src/domain/pogo/species-answer.test.ts src/domain/rocket/lineups.test.ts src/domain/rocket/reports.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff efcff0e64d0afc9821dd4fadcebdfed932b3cf10 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4L task 1: Grunt lineups in the domain`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/notifications/want-boxes.ts b/src/commands/notifications/want-boxes.ts
index 61d440c47341265a46ec60f0b86a4406c2bd3031..c7760134f256c9c6ae9e246c530bcfbd8564c6d4 100644
--- a/src/commands/notifications/want-boxes.ts
+++ b/src/commands/notifications/want-boxes.ts
@@ -37,11 +37,11 @@ import {
   answerScopeOf,
   boxesOf,
   heldRows,
-  whichHash,
   WHICH_CAP,
   type AnswerScope,
   type HeldRow,
 } from '../../domain/pogo/species-answer.js';
+import { whichHash } from '../../domain/short-hash.js';
 import { rewardCostumed } from '../../domain/notify/reasons.js';
 import { speciesNameOf, tierWantLabel } from '../../domain/pogo/wants.js';
 import { appearsInWild } from '../../domain/pogo/wild.js';
diff --git a/src/commands/notifications/want-dialog.ts b/src/commands/notifications/want-dialog.ts
index 76ad407608700f3d8f1f0c9ffc5741ec71b43498..90996d8c6d23b822ad324c8a7bb6653163d58b45 100644
--- a/src/commands/notifications/want-dialog.ts
+++ b/src/commands/notifications/want-dialog.ts
@@ -8,7 +8,7 @@ import { openToken, withoutOpenToken } from '../../discord/dialog.js';
 import { isSnowflake } from '../../db/snowflake.js';
 import { isFormKey, isPokedexNumber } from '../../domain/pogo/notification-target.js';
 import { isRaidLevel } from '../../domain/pogo/raid-tier.js';
-import { NO_WHICH } from '../../domain/pogo/species-answer.js';
+import { NO_WHICH } from '../../domain/short-hash.js';
 import {
   BOX_DESCRIPTIONS,
   BOX_WORDS,
diff --git a/src/commands/notifications/wants.ts b/src/commands/notifications/wants.ts
index fec946c07f1a9f6aab291d0362ade11b1b51d118..64405e0f7d105701a06f17ae79fd0468e55c459f 100644
--- a/src/commands/notifications/wants.ts
+++ b/src/commands/notifications/wants.ts
@@ -29,10 +29,10 @@ import {
   allCostumed,
   boxesOf,
   removalAnswer,
-  whichHash,
   type BoxAnswer,
   type HeldRow,
 } from '../../domain/pogo/species-answer.js';
+import { whichHash } from '../../domain/short-hash.js';
 import {
   BOX_WORDS,
   baseTarget,
diff --git a/src/domain/notify/target-wants.test.ts b/src/domain/notify/target-wants.test.ts
index 1a21ed52f01a954c0d3b905dc4c1f6cfef9c3a4e..0752a8f236bb8037804433269694c6285bb688a5 100644
--- a/src/domain/notify/target-wants.test.ts
+++ b/src/domain/notify/target-wants.test.ts
@@ -57,6 +57,9 @@ describe('the tokens of TargetWant', () => {
       'grunt:',
       'leader:jessie',
       'giovanni:1',
+      // A lineup is reported, never wanted (plan 8R-4L): wants stay by type.
+      'grunt:water:male',
+      'grunt:none:female',
       'research:pokemon:147:dratini:more',
     ]) {
       expect(parseTargetWantToken(token)).toBeUndefined();
diff --git a/src/domain/notify/target-wants.ts b/src/domain/notify/target-wants.ts
index 5e17bf04f4e1657199b7f9d5b7520fcdc1f3cc21..db1719b0b6672a342be6ed34d734baedb333062c 100644
--- a/src/domain/notify/target-wants.ts
+++ b/src/domain/notify/target-wants.ts
@@ -30,9 +30,14 @@ export type TargetWant =
 /** The Rocket target of any leader (design 7: "any leader"). */
 export const ANY_LEADER = 'leader:any';
 
-/** Whether a text is a Rocket target's `who`: a `rocketKey`, or any leader. */
+/**
+ * Whether a text is a Rocket target's `who`: a `rocketKey`, or any leader. Never a lineup's key
+ * (plan 8R-4L, S6): wants stay by grunt type, and a lineup's catch is wanted by its Shadow box.
+ */
 export function isRocketWho(text: string): boolean {
-  return text === ANY_LEADER || parseRocketKey(text) !== undefined;
+  if (text === ANY_LEADER) return true;
+  const who = parseRocketKey(text);
+  return who !== undefined && !(who.kind === 'grunt' && who.lineup !== undefined);
 }
 
 /** The kinds of `TargetWant` that are a Pokémon (a box of `/want`'s dialog). */
diff --git a/src/domain/pogo/species-answer.test.ts b/src/domain/pogo/species-answer.test.ts
index 2ed4d4de51dbf1aa311ca21e00c4bf78acfce020..342419ad7e379f536700eacbe097a0e96bfb2c29 100644
--- a/src/domain/pogo/species-answer.test.ts
+++ b/src/domain/pogo/species-answer.test.ts
@@ -6,11 +6,11 @@ import {
   boxesOf,
   heldRows,
   planAnswer,
-  whichHash,
   type AnswerScope,
   type BoxAnswer,
   type HeldRow,
 } from './species-answer.js';
+import { whichHash } from '../short-hash.js';
 import type { WantBox } from './want-boxes.js';
 
 const CORSOLA: AnswerScope = { subject: { kind: 'pokemon', dex: 222 }, wide: true };
diff --git a/src/domain/pogo/species-answer.ts b/src/domain/pogo/species-answer.ts
index 95c9da53aaea51defaa607623a8f488db9f40c01..81517da3d89c61db19f0a40eb7ea8acb18936601 100644
--- a/src/domain/pogo/species-answer.ts
+++ b/src/domain/pogo/species-answer.ts
@@ -273,23 +273,3 @@ export function planAnswer(
     ),
   };
 }
-
-/** The Which field's hash where a dialog shows none (`whichHash` of no keys). */
-export const NO_WHICH = '0';
-
-const FNV_OFFSET = 0x811c9dc5;
-const FNV_PRIME = 0x01000193;
-
-/**
- * A short hash of the keys a Which field showed, in its order (review R5): a Submit whose hash is
- * not that of the keys the field would show now is out of date. FNV-1a of the keys joined by
- * `,`, 32 bits in base 36.
- */
-export function whichHash(keys: readonly string[]): string {
-  if (keys.length === 0) return NO_WHICH;
-  let hash = FNV_OFFSET;
-  for (const byte of new TextEncoder().encode(keys.join(','))) {
-    hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
-  }
-  return hash.toString(36);
-}
diff --git a/src/domain/rocket/lineups.test.ts b/src/domain/rocket/lineups.test.ts
index c488e053dc7d8db4ebb1f8e41a8c0ebc5708ce32..ca775e7dc64465ee2e7a5d494fd53e0580600554 100644
--- a/src/domain/rocket/lineups.test.ts
+++ b/src/domain/rocket/lineups.test.ts
@@ -3,10 +3,13 @@ import { catalogueFixture } from '../../../test/support/game-data.js';
 import { feedChoice, readRocketFeed, rocketChoicesOfFeed } from '../../../test/support/rocket.js';
 import {
   isHideout,
+  lineupChoice,
+  lineupFingerprint,
   parseRocketKey,
   parseRocketLineups,
   rocketKey,
   rocketName,
+  typeKeyOf,
   type RocketWho,
 } from './lineups.js';
 
@@ -127,6 +130,119 @@ describe('parseRocketLineups', () => {
   });
 });
 
+describe('two lineups of one grunt type (plan 8R-4L)', () => {
+  /** A grunt of the feed's shape: the first slot's names, catches marked by `*`. */
+  const grunt = (name: string, type: string, first: string[]) => ({
+    name,
+    title: 'Team GO Rocket Grunt',
+    type,
+    firstPokemon: first.map((one) => ({
+      name: one.replace('*', ''),
+      image: '',
+      isEncounter: one.endsWith('*'),
+      canBeShiny: false,
+    })),
+  });
+  const parse = (feed: unknown[]) => parseRocketLineups(feed, catalogueFixture()).choices;
+
+  it('keeps both lineups of a type inside its choice, in the feed’s order, by gender', () => {
+    const water = feedChoice('grunt:water');
+    expect(water.lineups).toEqual([
+      {
+        lineup: 'female',
+        first: ['Mudkip', 'Tentacool', 'Krabby'],
+        catches: water.catches.slice(0, 3),
+        fingerprint: expect.any(String) as string,
+      },
+      {
+        lineup: 'male',
+        first: ['Magikarp', 'Feebas'],
+        catches: water.catches.slice(3),
+        fingerprint: expect.any(String) as string,
+      },
+    ]);
+    // The type's own catches stay the union.
+    expect(names('grunt:water')).toEqual(['Mudkip', 'Tentacool', 'Krabby', 'Magikarp', 'Feebas']);
+    expect(feedChoice('grunt:none').lineups?.map((one) => [one.lineup, one.first])).toEqual([
+      ['male', ['Bulbasaur', 'Charmander', 'Squirtle']],
+      ['female', ['Snorlax', 'Lapras']],
+    ]);
+    // A type of one lineup, and the decoy (a female grunt by the feed's name), have none.
+    expect(feedChoice('grunt:fire').lineups).toBeUndefined();
+    expect(feedChoice('decoy').lineups).toBeUndefined();
+    expect(rocketChoicesOfFeed().filter((choice) => choice.lineups !== undefined)).toHaveLength(2);
+  });
+
+  it('gives a lineup a fingerprint of its first slot and catches, computed from the data', () => {
+    const [female, male] = feedChoice('grunt:water').lineups ?? [];
+    if (!female || !male) throw new Error('the water grunt has two lineups');
+    expect(female.fingerprint).toBe(lineupFingerprint(female));
+    expect(female.fingerprint).toMatch(/^[0-9a-z]{1,7}$/);
+    expect(male.fingerprint).not.toBe(female.fingerprint);
+    // Another catch, or another first slot, is another fingerprint.
+    expect(lineupFingerprint({ ...male, catches: male.catches.slice(0, 1) })).not.toBe(
+      male.fingerprint,
+    );
+    expect(lineupFingerprint({ ...male, first: ['Magikarp'] })).not.toBe(male.fingerprint);
+  });
+
+  it('gives the merged choice only where the two lineups cannot be told apart by gender or slot', () => {
+    const same = parse([
+      grunt('Fire-type Male Grunt', 'fire', ['Litwick*', 'Ponyta*']),
+      grunt('Fire-type Female Grunt', 'fire', ['Litwick*', 'Ponyta*']),
+    ]);
+    expect(same[0]?.lineups).toBeUndefined();
+    const genderless = parse([
+      grunt('Fire-type Grunt', 'fire', ['Litwick*']),
+      grunt('Fire-type Female Grunt', 'fire', ['Ponyta*']),
+    ]);
+    expect(genderless[0]?.lineups).toBeUndefined();
+    expect(genderless[0]?.catches.map((one) => one.name)).toEqual(['Litwick', 'Ponyta']);
+    const twice = parse([
+      grunt('Fire-type Female Grunt', 'fire', ['Litwick*']),
+      grunt('Fire-type Female Grunt', 'fire', ['Ponyta*']),
+    ]);
+    expect(twice[0]?.lineups).toBeUndefined();
+    const three = parse([
+      grunt('Fire-type Female Grunt', 'fire', ['Litwick*']),
+      grunt('Fire-type Male Grunt', 'fire', ['Ponyta*']),
+      grunt('Fire-type Male Grunt', 'fire', ['Torchic*']),
+    ]);
+    expect(three[0]?.lineups).toBeUndefined();
+    // "Female" is read before "male", and only as a word.
+    const words = parse([
+      grunt('Fire-type FEMALE Grunt', 'fire', ['Litwick*']),
+      grunt('Fire-type Male Grunt', 'fire', ['Ponyta*']),
+    ]);
+    expect(words[0]?.lineups?.map((one) => one.lineup)).toEqual(['female', 'male']);
+    const glued = parse([
+      grunt('Fire-type Femalegrunt', 'fire', ['Litwick*']),
+      grunt('Fire-type Male Grunt', 'fire', ['Ponyta*']),
+    ]);
+    expect(glued[0]?.lineups).toBeUndefined();
+  });
+
+  it('takes a lineup as a choice of its own: its key, the type’s name, its catches and first slot', () => {
+    const water = feedChoice('grunt:water');
+    const [female, male] = water.lineups ?? [];
+    if (!female || !male) throw new Error('the water grunt has two lineups');
+    expect(lineupChoice(water, male)).toEqual({
+      key: 'grunt:water:male',
+      name: 'Water-type grunt',
+      catches: male.catches,
+      lineup: 'Magikarp, Feebas',
+    });
+    const untyped = feedChoice('grunt:none');
+    const [, snorlax] = untyped.lineups ?? [];
+    if (!snorlax) throw new Error('the untyped grunts have two lineups');
+    expect(lineupChoice(untyped, snorlax)).toMatchObject({
+      key: 'grunt:none:female',
+      name: 'Grunt (no type)',
+      lineup: 'Snorlax, Lapras',
+    });
+  });
+});
+
 describe('Rocket keys', () => {
   const every: RocketWho[] = [
     { kind: 'grunt', type: 'water' },
@@ -150,6 +266,34 @@ describe('Rocket keys', () => {
     }
   });
 
+  it('spells a lineup of a grunt type with its gender, and reads nothing else in a third part', () => {
+    const lineups: RocketWho[] = [
+      { kind: 'grunt', type: 'electric', lineup: 'female' },
+      { kind: 'grunt', type: null, lineup: 'male' },
+    ];
+    expect(lineups.map(rocketKey)).toEqual(['grunt:electric:female', 'grunt:none:male']);
+    for (const who of lineups) expect(parseRocketKey(rocketKey(who))).toEqual(who);
+    for (const text of [
+      'grunt:water:other',
+      'grunt:water:',
+      'grunt:water:male:female',
+      'leader:arlo:male',
+      'decoy:female',
+      'giovanni:male',
+      'grunt:shadow:male',
+    ]) {
+      expect(parseRocketKey(text)).toBeUndefined();
+    }
+  });
+
+  it('gives the type key of a lineup, and any other key as it is', () => {
+    expect(typeKeyOf('grunt:water:male')).toBe('grunt:water');
+    expect(typeKeyOf('grunt:none:female')).toBe('grunt:none');
+    for (const key of ['grunt:water', 'grunt:none', 'decoy', 'leader:arlo', 'giovanni', 'x:y:z']) {
+      expect(typeKeyOf(key)).toBe(key);
+    }
+  });
+
   it('names each who and tells hideouts from grunts', () => {
     expect(every.map(rocketName)).toEqual([
       'Water-type grunt',
diff --git a/src/domain/rocket/lineups.ts b/src/domain/rocket/lineups.ts
index b9199cfe93ac6b08980e23962061eea8dfd0c535..7ef51c34eabe488c3a01c044cb14043498fcbb89 100644
--- a/src/domain/rocket/lineups.ts
+++ b/src/domain/rocket/lineups.ts
@@ -3,13 +3,15 @@ import { feedLookupOf } from '../pogo/feed-lookup.js';
 import { identifyBoss } from '../pogo/raid-boss-feed.js';
 import { POKEMON_TYPES, type PokemonType } from '../pogo/types.js';
 import { leekDuckPicture } from '../research/leekduck.js';
+import { whichHash } from '../short-hash.js';
 
 /*
  * Team GO Rocket's lineups (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.1): who a
  * member can meet at a PokéStop and what they can catch from them, as ScrapedDuck's
  * `rocketLineups.json` lists it. A grunt type with two lineups (a male and a female water grunt)
- * is one choice whose catches are the union of both (design 5.1). Pure: the feed is read by
- * `RocketLineupService`.
+ * is one choice whose catches are the union of both (design 5.1); since plan 8R-4L (design
+ * `2026-10-22-costume-form-wants-design.md`, 4b and S5–S11) the choice also keeps both lineups,
+ * each reported apart by its first slot. Pure: the feed is read by `RocketLineupService`.
  */
 
 /** The three leaders. */
@@ -17,11 +19,20 @@ export const LEADERS = ['cliff', 'arlo', 'sierra'] as const;
 export type Leader = (typeof LEADERS)[number];
 
 /**
- * Who a Rocket report is of: a grunt of a type (null: the untyped grunts), the decoy grunt, a
- * leader, or Giovanni. The last three are hideouts: they hold their stop all day (Matt).
+ * Which of a grunt type's two lineups (plan 8R-4L): the feed keeps them apart by the grunt's
+ * gender, which is never shown (members tell them apart by the first slot).
+ */
+export type GruntLineup = 'male' | 'female';
+
+const GRUNT_LINEUPS: ReadonlySet<string> = new Set<GruntLineup>(['male', 'female']);
+
+/**
+ * Who a Rocket report is of: a grunt of a type (null: the untyped grunts; `lineup` one of its two
+ * lineups, absent for "not sure which" or a type of one lineup), the decoy grunt, a leader, or
+ * Giovanni. The last three are hideouts: they hold their stop all day (Matt).
  */
 export type RocketWho =
-  | { kind: 'grunt'; type: PokemonType | null }
+  | { kind: 'grunt'; type: PokemonType | null; lineup?: GruntLineup }
   | { kind: 'decoy' }
   | { kind: 'leader'; leader: Leader }
   | { kind: 'giovanni' };
@@ -38,15 +49,31 @@ export interface RocketCatch {
   image: string | null;
 }
 
+/**
+ * One of a grunt type's two lineups (plan 8R-4L, S5, S11): which (`lineup`), the names of its
+ * first slot in the feed's order (its label), what can be caught of it, and its `fingerprint`
+ * (`lineupFingerprint`, worked out from the data, never stored).
+ */
+export interface RocketLineupChoice {
+  lineup: GruntLineup;
+  first: string[];
+  catches: RocketCatch[];
+  fingerprint: string;
+}
+
 /**
  * A choice of `/rocket who:` (design 5.2), as the list keeps it: its key (`rocketKey`), its name
  * (`rocketName`) and the Pokémon that can be caught, in the feed's order (a type of two lineups:
- * the union of both).
+ * the union of both). Plan 8R-4L: a grunt type of two lineups keeps them (`lineups`, in the
+ * feed's order); a lineup taken as a choice (`lineupChoice`) has its key, its own catches and its
+ * first slot in short (`lineup`).
  */
 export interface RocketChoice {
   key: string;
   name: string;
   catches: RocketCatch[];
+  lineups?: RocketLineupChoice[];
+  lineup?: string;
 }
 
 /** What the feed gave: the choices, how many lineups were not read, the catches not known. */
@@ -61,11 +88,14 @@ export interface ParsedRocketLineups {
 const TYPES: ReadonlySet<string> = new Set(POKEMON_TYPES);
 const LEADER_NAMES: ReadonlySet<string> = new Set(LEADERS);
 
-/** `grunt:<type>`, `grunt:none`, `decoy`, `leader:<name>`, `giovanni`. */
+/**
+ * `grunt:<type>`, `grunt:none`, `decoy`, `leader:<name>`, `giovanni`; a lineup of a grunt type
+ * (plan 8R-4L) `grunt:<type|none>:male|female`.
+ */
 export function rocketKey(who: RocketWho): string {
   switch (who.kind) {
     case 'grunt':
-      return `grunt:${who.type ?? 'none'}`;
+      return `grunt:${who.type ?? 'none'}${who.lineup === undefined ? '' : `:${who.lineup}`}`;
     case 'leader':
       return `leader:${who.leader}`;
     default:
@@ -73,21 +103,64 @@ export function rocketKey(who: RocketWho): string {
   }
 }
 
-/** Who a key names (`rocketKey`); undefined for any other text. */
+/**
+ * Who a key names (`rocketKey`); undefined for any other text. A third part is read only for a
+ * grunt, and only as `male` or `female` (plan 8R-4L); four parts are nothing.
+ */
 export function parseRocketKey(key: string): RocketWho | undefined {
   if (key === 'decoy' || key === 'giovanni') return { kind: key };
-  const [head, value, ...more] = key.split(':');
+  const [head, value, lineup, ...more] = key.split(':');
   if (value === undefined || more.length > 0) return undefined;
   if (head === 'grunt') {
-    if (value === 'none') return { kind: 'grunt', type: null };
-    return TYPES.has(value) ? { kind: 'grunt', type: value as PokemonType } : undefined;
+    if (lineup !== undefined && !GRUNT_LINEUPS.has(lineup)) return undefined;
+    const side = lineup === undefined ? {} : { lineup: lineup as GruntLineup };
+    if (value === 'none') return { kind: 'grunt', type: null, ...side };
+    return TYPES.has(value) ? { kind: 'grunt', type: value as PokemonType, ...side } : undefined;
   }
+  if (lineup !== undefined) return undefined;
   if (head === 'leader' && LEADER_NAMES.has(value)) {
     return { kind: 'leader', leader: value as Leader };
   }
   return undefined;
 }
 
+/**
+ * The key of the grunt type a report's key is of (plan 8R-4L, S7): a lineup's type
+ * (`grunt:water:male` is `grunt:water`), any other key as it is. Wants, the hour a type is quiet
+ * and the notifier's line are by type.
+ */
+export function typeKeyOf(subjectKey: string): string {
+  const who = parseRocketKey(subjectKey);
+  return who?.kind === 'grunt' && who.lineup !== undefined
+    ? rocketKey({ kind: 'grunt', type: who.type })
+    : subjectKey;
+}
+
+/**
+ * A lineup's fingerprint (plan 8R-4L, S11, B13): `whichHash` of its first slot's names, `|`, and
+ * its catches' keys (a name where the catalogue has none), in order. A choice made before a
+ * rotation changed the lineup no longer matches it.
+ */
+export function lineupFingerprint(lineup: Pick<RocketLineupChoice, 'first' | 'catches'>): string {
+  return whichHash([...lineup.first, '|', ...lineup.catches.map((one) => one.key ?? one.name)]);
+}
+
+/**
+ * One lineup of a grunt type taken as a choice of its own (plan 8R-4L): its key
+ * (`grunt:water:male`), the type's name (the gender is never shown), its own catches, and its
+ * first slot in short as `lineup` (`Magikarp, Feebas`), which names it beside the type.
+ */
+export function lineupChoice(choice: RocketChoice, lineup: RocketLineupChoice): RocketChoice {
+  const who = parseRocketKey(choice.key);
+  const type = who?.kind === 'grunt' ? who.type : null;
+  return {
+    key: rocketKey({ kind: 'grunt', type, lineup: lineup.lineup }),
+    name: choice.name,
+    catches: lineup.catches,
+    lineup: catchesInShort(lineup.first.map((name) => ({ name }))),
+  };
+}
+
 /** Whether it holds its stop all day (a leader, Giovanni, the decoy), not for half an hour. */
 export function isHideout(who: RocketWho): boolean {
   return who.kind !== 'grunt';
@@ -157,16 +230,71 @@ function rank(who: RocketWho): number {
 /** The slots of a lineup in the feed. */
 const SLOTS = ['firstPokemon', 'secondPokemon', 'thirdPokemon'] as const;
 
+/**
+ * Which lineup a grunt of the feed is by its name (plan 8R-4L, S5): "female" before "male", each
+ * only as a word; undefined for a name with neither.
+ */
+function lineupOf(lineup: Record<string, unknown>): GruntLineup | undefined {
+  const name = line(lineup.name, 100).toLowerCase();
+  if (/\bfemale\b/.test(name)) return 'female';
+  return /\bmale\b/.test(name) ? 'male' : undefined;
+}
+
+/** The names of a lineup's first slot, in the feed's order. */
+function firstSlotOf(lineup: Record<string, unknown>): string[] {
+  const pokemon: unknown = lineup.firstPokemon;
+  if (!Array.isArray(pokemon)) return [];
+  return (pokemon as unknown[]).flatMap((one) => {
+    if (typeof one !== 'object' || one === null) return [];
+    const name = line((one as Record<string, unknown>).name, MAX_CATCH_NAME);
+    return name === '' ? [] : [name];
+  });
+}
+
+/** Whether two catches are one: by the catalogue's entry, else by name. */
+function sameCatch(one: RocketCatch, other: RocketCatch): boolean {
+  return one.key === null ? other.key === null && other.name === one.name : other.key === one.key;
+}
+
+/** A lineup of the feed as read, before it is known whether its type keeps lineups apart. */
+interface ReadLineup {
+  lineup: GruntLineup | undefined;
+  first: string[];
+  catches: RocketCatch[];
+}
+
+/**
+ * The lineups a grunt type keeps apart (plan 8R-4L, S11): exactly two, of the two genders, whose
+ * first slots differ, in the feed's order; anything else (no gender word, one gender twice, the
+ * same first slot, three lineups) none, and the type is its merged choice only.
+ */
+function apart(read: readonly ReadLineup[]): RocketLineupChoice[] | undefined {
+  const [one, other] = read;
+  if (read.length !== 2 || !one || !other) return undefined;
+  if (one.lineup === undefined || other.lineup === undefined || one.lineup === other.lineup) {
+    return undefined;
+  }
+  if (one.first.join('\n') === other.first.join('\n')) return undefined;
+  const kept = (each: ReadLineup, lineup: GruntLineup): RocketLineupChoice => ({
+    lineup,
+    first: each.first,
+    catches: each.catches,
+    fingerprint: lineupFingerprint(each),
+  });
+  return [kept(one, one.lineup), kept(other, other.lineup)];
+}
+
 /**
  * Reads ScrapedDuck's Rocket lineups (design 5.1). Throws when it holds no lineup this version
  * can place (not a list, another feed), so that a broken read never replaces a good list. The
  * catchable Pokémon are those marked `isEncounter`, in any slot; one named twice (two lineups of
- * a type, two slots) is kept once.
+ * a type, two slots) is kept once. A grunt type of two lineups keeps both apart (`lineups`, plan
+ * 8R-4L) where `apart` allows it; a decoy, a leader and Giovanni never do.
  */
 export function parseRocketLineups(raw: unknown, catalogue: PokemonCatalogue): ParsedRocketLineups {
   if (!Array.isArray(raw)) throw new Error('The Rocket lineups feed holds no lineup');
   const lookup = feedLookupOf(catalogue);
-  const byKey = new Map<string, { who: RocketWho; choice: RocketChoice }>();
+  const byKey = new Map<string, { who: RocketWho; choice: RocketChoice; read: ReadLineup[] }>();
   const unknown = new Set<string>();
   let skipped = 0;
   for (const item of raw as unknown[]) {
@@ -183,10 +311,10 @@ export function parseRocketLineups(raw: unknown, catalogue: PokemonCatalogue): P
     const key = rocketKey(who);
     let known = byKey.get(key);
     if (!known) {
-      known = { who, choice: { key, name: rocketName(who), catches: [] } };
+      known = { who, choice: { key, name: rocketName(who), catches: [] }, read: [] };
       byKey.set(key, known);
     }
-    const { catches } = known.choice;
+    const own: RocketCatch[] = [];
     for (const slot of SLOTS) {
       const pokemon: unknown = lineup[slot];
       if (!Array.isArray(pokemon)) continue;
@@ -208,18 +336,22 @@ export function parseRocketLineups(raw: unknown, catalogue: PokemonCatalogue): P
           shiny: shown.canBeShiny === true,
           image: leekDuckPicture(image),
         };
-        const same = (other: RocketCatch): boolean =>
-          caught.key === null
-            ? other.key === null && other.name === name
-            : other.key === caught.key;
-        if (!catches.some(same)) catches.push(caught);
+        if (!own.some((other) => sameCatch(caught, other))) own.push(caught);
       }
     }
+    const { catches } = known.choice;
+    for (const caught of own) {
+      if (!catches.some((other) => sameCatch(caught, other))) catches.push(caught);
+    }
+    known.read.push({ lineup: lineupOf(lineup), first: firstSlotOf(lineup), catches: own });
   }
   if (byKey.size === 0) throw new Error('The Rocket lineups feed holds no lineup');
   const choices = [...byKey.values()]
     .sort((a, b) => rank(a.who) - rank(b.who) || a.choice.name.localeCompare(b.choice.name))
-    .map(({ choice }) => choice);
+    .map(({ who, choice, read }) => {
+      const lineups = who.kind === 'grunt' ? apart(read) : undefined;
+      return lineups === undefined ? choice : { ...choice, lineups };
+    });
   return { choices, skipped, unknown: [...unknown] };
 }
 
diff --git a/src/domain/rocket/reports.test.ts b/src/domain/rocket/reports.test.ts
index 1a0435449537b84c35726fa3419456d4663c5179..858e0d0462bf5fdb90dbab2cc591757d69ae27c1 100644
--- a/src/domain/rocket/reports.test.ts
+++ b/src/domain/rocket/reports.test.ts
@@ -7,37 +7,84 @@ const at = (local: string): number => DateTime.fromISO(local, { zone: ZONE }).to
 const NOW = at('2026-10-22T12:00');
 
 /** What stands at the stop, as far as the decision looks at it. */
-const standing = (subjectKey: string, endsAt: number, id = 7) => ({
+const standing = (subjectKey: string, endsAt: number, id = 7, lineup?: string) => ({
   id,
   kind: 'rocket' as const,
   subjectKey,
   endsAt,
+  ...(lineup === undefined ? {} : { rocket: { lineup } }),
+});
+
+/** A new report of `subjectKey`, of a lineup whose first slot in short is `lineup`. */
+const who = (subjectKey: string, lineup?: string) => ({
+  subjectKey,
+  ...(lineup === undefined ? {} : { rocket: { lineup } }),
 });
 
 describe('decideRocket', () => {
   it('reports at a stop with nothing standing, or only what has ended', () => {
-    expect(decideRocket(undefined, 'grunt:water', NOW)).toBe('report');
-    expect(decideRocket(standing('grunt:water', NOW), 'grunt:water', NOW)).toBe('report');
-    expect(decideRocket(standing('leader:arlo', NOW - 1), 'grunt:water', NOW)).toBe('report');
+    expect(decideRocket(undefined, who('grunt:water'), NOW)).toBe('report');
+    expect(decideRocket(standing('grunt:water', NOW), who('grunt:water'), NOW)).toBe('report');
+    expect(decideRocket(standing('leader:arlo', NOW - 1), who('grunt:water'), NOW)).toBe('report');
   });
 
   it('answers the same grunt standing as reported already, another grunt replaces it', () => {
-    expect(decideRocket(standing('grunt:water', NOW + 1), 'grunt:water', NOW)).toBe('already');
-    expect(decideRocket(standing('grunt:none', NOW + 1), 'grunt:water', NOW)).toBe('report');
+    expect(decideRocket(standing('grunt:water', NOW + 1), who('grunt:water'), NOW)).toBe('already');
+    expect(decideRocket(standing('grunt:none', NOW + 1), who('grunt:water'), NOW)).toBe('report');
+  });
+
+  it('decides two lineups of one grunt type and "not sure which" (plan 8R-4L)', () => {
+    const stands = (key: string) => standing(key, NOW + 1);
+    // Not sure which, then a lineup: it refines the report standing, in place.
+    expect(decideRocket(stands('grunt:water'), who('grunt:water:male'), NOW)).toBe('refine');
+    // A lineup, then not sure which: the lineup says more already.
+    expect(decideRocket(stands('grunt:water:male'), who('grunt:water'), NOW)).toBe('already');
+    // One lineup over the other: it replaces it, in place.
+    expect(decideRocket(stands('grunt:water:male'), who('grunt:water:female'), NOW)).toBe('refine');
+    // The same key twice.
+    expect(decideRocket(stands('grunt:water:female'), who('grunt:water:female'), NOW)).toBe(
+      'already',
+    );
+    // Another type is another grunt, whatever its lineup.
+    expect(decideRocket(stands('grunt:water:male'), who('grunt:none:male'), NOW)).toBe('report');
+    expect(decideRocket(stands('grunt:none'), who('grunt:water:male'), NOW)).toBe('report');
+    // Ended, it is a report of its own.
+    expect(decideRocket(standing('grunt:water', NOW), who('grunt:water:male'), NOW)).toBe('report');
+    // A hideout stands: a lineup asks as any grunt does.
+    expect(decideRocket(stands('leader:arlo'), who('grunt:water:male'), NOW)).toBe('asks');
+  });
+
+  it('refines the same lineup key whose first slot rotated within the 30 minutes (L5)', () => {
+    const male = (lineup: string) => standing('grunt:water:male', NOW + 1, 7, lineup);
+    const table: [ReturnType<typeof standing>, ReturnType<typeof who>, string][] = [
+      // The same key and the same first slot: reported already.
+      [male('Magikarp, Feebas'), who('grunt:water:male', 'Magikarp, Feebas'), 'already'],
+      // The same key, another first slot (the lineups rotated meanwhile): it refines.
+      [male('Magikarp, Feebas'), who('grunt:water:male', 'Magikarp, Goldeen'), 'refine'],
+      // A label where none stood (a report of before) is news of the lineup too.
+      [standing('grunt:water:male', NOW + 1), who('grunt:water:male', 'Magikarp'), 'refine'],
+      // Not sure which over a lineup stays "already", whatever the label.
+      [male('Magikarp, Feebas'), who('grunt:water'), 'already'],
+      // The other lineup over one: refines.
+      [male('Magikarp, Feebas'), who('grunt:water:female', 'Mudkip'), 'refine'],
+    ];
+    for (const [stands, report, outcome] of table) {
+      expect(decideRocket(stands, report, NOW)).toBe(outcome);
+    }
   });
 
   it('asks before a grunt replaces a hideout, unless that very hideout was asked about', () => {
     const arlo = standing('leader:arlo', at('2026-10-23T00:00'), 7);
-    expect(decideRocket(arlo, 'grunt:water', NOW)).toBe('asks');
-    expect(decideRocket(arlo, 'grunt:water', NOW, 7)).toBe('report');
+    expect(decideRocket(arlo, who('grunt:water'), NOW)).toBe('asks');
+    expect(decideRocket(arlo, who('grunt:water'), NOW, 7)).toBe('report');
     // Another hideout came while the question was open: asked again.
-    expect(decideRocket(arlo, 'grunt:water', NOW, 6)).toBe('asks');
-    expect(decideRocket(standing('decoy', NOW + 1), 'grunt:none', NOW)).toBe('asks');
+    expect(decideRocket(arlo, who('grunt:water'), NOW, 6)).toBe('asks');
+    expect(decideRocket(standing('decoy', NOW + 1), who('grunt:none'), NOW)).toBe('asks');
   });
 
   it('lets a hideout replace whatever stands, the same hideout too', () => {
     for (const before of ['grunt:water', 'leader:arlo', 'giovanni', 'decoy']) {
-      expect(decideRocket(standing(before, NOW + 1), 'giovanni', NOW)).toBe('report');
+      expect(decideRocket(standing(before, NOW + 1), who('giovanni'), NOW)).toBe('report');
     }
   });
 });
diff --git a/src/domain/rocket/reports.ts b/src/domain/rocket/reports.ts
index 19f24fbb9d24368a6532e62ad3e02d018314ef8b..3dc17bc98304bbd1cede1e64746b4bbec74862e7 100644
--- a/src/domain/rocket/reports.ts
+++ b/src/domain/rocket/reports.ts
@@ -1,5 +1,5 @@
 import { DateTime } from 'luxon';
-import { isHideout, parseRocketKey } from './lineups.js';
+import { isHideout, parseRocketKey, typeKeyOf } from './lineups.js';
 
 /*
  * Rocket reports at a stop (plan 8R-2; design `2026-10-21-stop-reports-design.md`, 5.2, Matt's
@@ -9,21 +9,32 @@ import { isHideout, parseRocketKey } from './lineups.js';
 
 /**
  * What becomes of a Rocket report at a stop: `report` (made, in the place of what stood there),
+ * `refine` (plan 8R-4L, Matt's B2: a lineup of the grunt type that stands, over "not sure which"
+ * or the other lineup; the standing report is changed in place, keeping its id and messages),
  * `already` (the same grunt stands: nothing is posted or sent), or `asks` (a grunt where a
  * hideout stands today: the member is asked first).
  */
-export type RocketDecision = 'report' | 'already' | 'asks';
+export type RocketDecision = 'report' | 'refine' | 'already' | 'asks';
+
+/**
+ * What the decision reads of a Rocket report: its key (a `rocketKey`) and, of a lineup (plan
+ * 8R-4L), its first slot in short (`RocketDetail.lineup`), which tells a lineup rotated within a
+ * grunt's 30 minutes from the one that stands (review L5).
+ */
+export interface RocketWhoAt {
+  subjectKey: string;
+  rocket?: { lineup?: string };
+}
 
 /** What the decision reads of the report standing at the stop. */
-export interface StandingRocket {
+export interface StandingRocket extends RocketWhoAt {
   id: number;
   kind: string;
-  subjectKey: string;
   endsAt: number;
 }
 
 /**
- * The decision on a Rocket report of `subjectKey` (a `rocketKey`) at a stop where `standing` is
+ * The decision on a Rocket `report` (its key and lineup) at a stop where `standing` is
  * the stop's Rocket report that stands, of today or a grunt of yesterday past midnight (fix A2),
  * else today's ended one, at `now` (design 5.2):
  *
@@ -31,21 +42,31 @@ export interface StandingRocket {
  * - a hideout (a leader, Giovanni, the decoy) replaces whatever stands, the same hideout too;
  * - a grunt where the same grunt stands is reported already (Matt's answer 4); where another
  *   grunt stands it replaces it;
+ * - of one grunt type (plan 8R-4L, S10): "not sure which" where a lineup stands is reported
+ *   already (the lineup says more); a lineup where "not sure which" or the other lineup stands
+ *   refines it in place (`refine`, Matt's B2), and so does the same lineup of another first slot
+ *   (the lineups rotated within the grunt's time, review L5);
  * - a grunt where a hideout stands is asked about first, unless `replacing` is that very report
  *   (the member said Replace to it: a hideout reported meanwhile is asked about again).
  */
 export function decideRocket(
   standing: StandingRocket | undefined,
-  subjectKey: string,
+  report: RocketWhoAt,
   now: number,
   replacing?: number,
 ): RocketDecision {
   if (!standing || standing.endsAt <= now) return 'report';
+  const { subjectKey } = report;
   const who = parseRocketKey(subjectKey);
   if (!who || isHideout(who)) return 'report';
   const there = parseRocketKey(standing.subjectKey);
   if (there === undefined || !isHideout(there)) {
-    return standing.subjectKey === subjectKey ? 'already' : 'report';
+    // The same key of another first slot is the lineup rotated meanwhile (review L5).
+    if (standing.subjectKey === subjectKey) {
+      return standing.rocket?.lineup === report.rocket?.lineup ? 'already' : 'refine';
+    }
+    if (typeKeyOf(standing.subjectKey) !== typeKeyOf(subjectKey)) return 'report';
+    return typeKeyOf(subjectKey) === subjectKey ? 'already' : 'refine';
   }
   return standing.id === replacing ? 'report' : 'asks';
 }
diff --git a/src/domain/short-hash.ts b/src/domain/short-hash.ts
new file mode 100644
index 0000000000000000000000000000000000000000..849de87777ebce08c61f374ee19bc7dd4bbb3568
--- /dev/null
+++ b/src/domain/short-hash.ts
@@ -0,0 +1,25 @@
+/*
+ * A short hash of what a member was shown, to tell a choice made then from the data of now: the
+ * Which field of `/want`'s dialog (plan 8R-4, review R5) and a grunt type's lineup (plan 8R-4L,
+ * B13). Pure, and of no module of its own area, so that both can import it without a cycle.
+ */
+
+/** The Which field's hash where a dialog shows none (`whichHash` of no keys). */
+export const NO_WHICH = '0';
+
+const FNV_OFFSET = 0x811c9dc5;
+const FNV_PRIME = 0x01000193;
+
+/**
+ * A short hash of the keys a Which field showed, in its order (review R5): a Submit whose hash is
+ * not that of the keys the field would show now is out of date. FNV-1a of the keys joined by
+ * `,`, 32 bits in base 36.
+ */
+export function whichHash(keys: readonly string[]): string {
+  if (keys.length === 0) return NO_WHICH;
+  let hash = FNV_OFFSET;
+  for (const byte of new TextEncoder().encode(keys.join(','))) {
+    hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
+  }
+  return hash.toString(36);
+}
diff --git a/src/domain/stops/report.ts b/src/domain/stops/report.ts
index 8c21d651965b85a7341b5e2a6afec6b9449206ec..8b4bcd64c575e67283ba987604a5673d4a766c35 100644
--- a/src/domain/stops/report.ts
+++ b/src/domain/stops/report.ts
@@ -46,11 +46,14 @@ export interface Reporter {
 /**
  * What a Rocket report says (plan 8R-2): who it is of by name (`Water-type grunt`, `Arlo`), and
  * the Pokémon that can be caught, as the lineups had them when it was reported. Who it is of is
- * its `subjectKey` (`rocketKey`).
+ * its `subjectKey` (`rocketKey`). A lineup of a grunt type (plan 8R-4L) keeps its first slot in
+ * short (`lineup`: `Magikarp, Feebas`), which names it beside the type's name where a grunt is
+ * named apart from its catches; the name stays the type's.
  */
 export interface RocketDetail {
   name: string;
   catches: RocketCatch[];
+  lineup?: string;
 }
 
 /** What every report has, whatever its kind. */
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index 6a695e0d3d128205a2896b85055264e61d3634be..878b8f130a7be80389c37a770ad86fb8e8faecdb 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -281,8 +281,8 @@ export class StopReportService {
         madeAt,
       },
       (standing) => {
-        asked.decision = decideRocket(standing, input.subject.subjectKey, madeAt, input.replacing);
-        return asked.decision !== 'report';
+        asked.decision = decideRocket(standing, input.subject, madeAt, input.replacing);
+        return asked.decision === 'already' || asked.decision === 'asks';
       },
       // What still stands at the stop, also from yesterday past midnight (fix A2).
       madeAt,
````

### Task 2: 8R-4L task 2: Lineups and in-place reports in storage

Prototype commit: `9110f49be102760fce147b3418e358a2e2e960e6`

RocketLineup keeps a grunt type's two lineups inside its catches JSON
(no migration: the key column would not hold grunt:electric:female):
today's array (rows of before, choices without lineups) or
{ catches, lineups }, the lineups without their fingerprints, which
are worked out again on read. A row whose lineups cannot be read, or
that holds two of one gender or of one first slot, is the merged
choice, with a warning. MemoryRocketLineups keeps them without
fingerprints too; rocketLineupCases covers a choice with lineups and a
wrong fingerprint handed over.

A Rocket report's detail keeps a lineup's first slot (lineup).
StopReportStorage.saveUnless asks for a verdict, keep, replace or
update: update changes the standing report into the new one in place
under the stop's lock, keeping its id (Matt's B2), and says so
(inPlace). remove takes an expected madeAt: a report's version is its
id and madeAt, and one changed in place since is left as it is. Both
storages run the new cases. Nothing asks for update yet:
StopReportService still replaces.

**Files:**

```
 src/db/repositories/rocket-lineup-repository.ts       |  78 ++++++++++++++++++++++++++++++++++---
 src/db/repositories/rocket-repositories.db.test.ts    |  86 +++++++++++++++++++++++++++++++++++++++++
 src/db/repositories/stop-report-repository.db.test.ts |   3 +-
 src/db/repositories/stop-report-repository.ts         |  99 ++++++++++++++++++++++++++++++++---------------
 src/services/stop-reports.ts                          |   4 +-
 test/support/rocket-store-cases.ts                    |  53 ++++++++++++++++++++++++-
 test/support/rocket-store.ts                          |  36 +++++++++++++++--
 test/support/stop-report-cases.ts                     | 121 ++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 test/support/stop-reports.ts                          |  42 +++++++++++++-------
 9 files changed, 458 insertions(+), 64 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass. Its database test files (`src/db/repositories/rocket-repositories.db.test.ts`, `src/db/repositories/stop-report-repository.db.test.ts`) run with the database suite at the tip.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9110f49be102760fce147b3418e358a2e2e960e6 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4L task 2: Lineups and in-place reports in storage`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/db/repositories/rocket-lineup-repository.ts b/src/db/repositories/rocket-lineup-repository.ts
index 41726c919155312b648759c30264a74746aa0944..63da44752bd6460b17b71b779b5d28eb73bdd77c 100644
--- a/src/db/repositories/rocket-lineup-repository.ts
+++ b/src/db/repositories/rocket-lineup-repository.ts
@@ -1,6 +1,6 @@
 import { sql, type Kysely } from 'kysely';
 import { z } from 'zod';
-import type { RocketChoice } from '../../domain/rocket/lineups.js';
+import { lineupFingerprint, type RocketChoice } from '../../domain/rocket/lineups.js';
 import type { Logger } from '../../log.js';
 import { inTransaction } from '../transaction.js';
 import type { DB } from '../types.js';
@@ -22,6 +22,38 @@ export const catchesDocument = z.array(
   }),
 );
 
+/**
+ * What `RocketLineup.catches` holds: the catches as a list (a row of before plan 8R-4L, or a
+ * choice without lineups), or the catches with the grunt type's two lineups beside them (plan
+ * 8R-4L, B1; no migration: the key column would not hold a lineup's key). The lineups are read
+ * apart (`lineupsDocument`), so that ones it cannot read leave the merged choice (B11).
+ */
+const choiceDocument = catchesDocument.or(
+  z.object({ catches: catchesDocument, lineups: z.unknown() }),
+);
+
+/**
+ * A grunt type's two lineups as the row keeps them: without their fingerprints (B6), and only as
+ * the parser keeps them apart (review L2): of the two genders, with different first slots.
+ */
+const lineupsDocument = z
+  .array(
+    z.object({
+      lineup: z.enum(['male', 'female']),
+      first: z.array(z.string()),
+      catches: catchesDocument,
+    }),
+  )
+  .length(2)
+  .refine(
+    ([one, other]) =>
+      one !== undefined &&
+      other !== undefined &&
+      one.lineup !== other.lineup &&
+      one.first.join('\n') !== other.first.join('\n'),
+    'two lineups of the two genders and different first slots',
+  );
+
 /**
  * The last good Rocket lineups read from ScrapedDuck (plan 8R-2; design 5.1; table
  * `RocketLineup` of migration 028), as the task list is kept: a start without the network still
@@ -59,14 +91,37 @@ export class RocketLineupRepository implements RocketLineupStorage {
     let readAt: number | undefined;
     for (const row of rows) {
       readAt = Math.max(readAt ?? 0, Number(row.lastSeen));
-      const catches = catchesDocument.safeParse(
+      const kept = choiceDocument.safeParse(
         typeof row.catches === 'string' ? JSON.parse(row.catches) : row.catches,
       );
-      if (!catches.success) {
+      if (!kept.success) {
         this.log?.warn({ lineup: row.rocketKey }, 'a kept Rocket lineup cannot be read; left out');
         continue;
       }
-      choices.push({ key: row.rocketKey, name: row.name, catches: catches.data });
+      const choice = { key: row.rocketKey, name: row.name };
+      if (Array.isArray(kept.data)) {
+        choices.push({ ...choice, catches: kept.data });
+        continue;
+      }
+      const lineups = lineupsDocument.safeParse(kept.data.lineups);
+      if (!lineups.success) {
+        this.log?.warn(
+          { lineup: row.rocketKey },
+          'the lineups of a kept Rocket choice cannot be read; merged',
+        );
+      }
+      choices.push({
+        ...choice,
+        catches: kept.data.catches,
+        ...(lineups.success
+          ? {
+              lineups: lineups.data.map((one) => ({
+                ...one,
+                fingerprint: lineupFingerprint(one),
+              })),
+            }
+          : {}),
+      });
     }
     return { choices, readAt };
   }
@@ -75,10 +130,23 @@ export class RocketLineupRepository implements RocketLineupStorage {
     return inTransaction(this.db, async (trx) => {
       await trx.updateTable('RocketLineup').set({ active: 0 }).execute();
       if (choices.length === 0) return;
+      const document = (choice: RocketChoice): string =>
+        JSON.stringify(
+          choice.lineups === undefined
+            ? choice.catches
+            : {
+                catches: choice.catches,
+                lineups: choice.lineups.map(({ lineup, first, catches }) => ({
+                  lineup,
+                  first,
+                  catches,
+                })),
+              },
+        );
       const values = sql.join(
         choices.map(
           (choice, position) =>
-            sql`(${choice.key}, ${choice.name}, ${JSON.stringify(choice.catches)},
+            sql`(${choice.key}, ${choice.name}, ${document(choice)},
               ${String(at)}, ${String(at)}, 1, ${position})`,
         ),
       );
diff --git a/src/db/repositories/rocket-repositories.db.test.ts b/src/db/repositories/rocket-repositories.db.test.ts
index fd9613b3fbbfd48a73d6294ab90d3fd3af7c1ae0..8f7dfea6ad252acce1b83f335cacda26b9a46161 100644
--- a/src/db/repositories/rocket-repositories.db.test.ts
+++ b/src/db/repositories/rocket-repositories.db.test.ts
@@ -5,6 +5,7 @@ import {
   gruntMessageCases,
   listedChoice,
   rocketLineupCases,
+  waterWithLineups,
 } from '../../../test/support/rocket-store-cases.js';
 import { createTestLogger } from '../../../test/support/test-logger.js';
 import type { DB } from '../types.js';
@@ -51,5 +52,90 @@ describe('the repositories of Team GO Rocket', () => {
         entries.some((entry) => entry.msg === 'a kept Rocket lineup cannot be read; left out'),
       ).toBe(true);
     });
+
+    it('reads a row kept before plan 8R-4L, its catches a bare list, as no lineups', async () => {
+      await db.deleteFrom('RocketLineup').execute();
+      const water = listedChoice('grunt:water');
+      await db
+        .insertInto('RocketLineup')
+        .values({
+          rocketKey: 'grunt:water',
+          name: water.name,
+          catches: JSON.stringify(water.catches),
+          firstSeen: '1000',
+          lastSeen: '1000',
+          active: 1,
+          position: 0,
+        })
+        .execute();
+      expect(await new RocketLineupRepository(db).kept()).toEqual({
+        choices: [water],
+        readAt: 1_000,
+      });
+    });
+
+    it('keeps the lineups apart in the row, without their fingerprints', async () => {
+      await db.deleteFrom('RocketLineup').execute();
+      const water = waterWithLineups();
+      await new RocketLineupRepository(db).replace([water], 1_000);
+      const row = await db.selectFrom('RocketLineup').select('catches').executeTakeFirstOrThrow();
+      const kept = (typeof row.catches === 'string' ? JSON.parse(row.catches) : row.catches) as {
+        catches: unknown[];
+        lineups: Record<string, unknown>[];
+      };
+      expect(kept.catches).toEqual(water.catches);
+      expect(kept.lineups.map((one) => Object.keys(one).sort())).toEqual([
+        ['catches', 'first', 'lineup'],
+        ['catches', 'first', 'lineup'],
+      ]);
+    });
+
+    it('reads a choice whose lineups it cannot read as the merged choice, and says so', async () => {
+      await db.deleteFrom('RocketLineup').execute();
+      const { log, entries } = createTestLogger();
+      const store = new RocketLineupRepository(db, log);
+      const water = waterWithLineups();
+      await store.replace([water], 1_000);
+      await db
+        .updateTable('RocketLineup')
+        .set({
+          catches: JSON.stringify({ catches: water.catches, lineups: [{ lineup: 'other' }] }),
+        })
+        .execute();
+      const { lineups: _lineups, ...merged } = water;
+      expect((await store.kept()).choices).toEqual([merged]);
+      expect(
+        entries.some(
+          (entry) => entry.msg === 'the lineups of a kept Rocket choice cannot be read; merged',
+        ),
+      ).toBe(true);
+    });
+
+    it('reads lineups of one gender twice, or of one first slot, as the merged choice (L2)', async () => {
+      const water = waterWithLineups();
+      const [female, male] = water.lineups ?? [];
+      if (!female || !male) throw new Error('the water grunt has two lineups');
+      const { lineups: _lineups, ...merged } = water;
+      const kept = ({ fingerprint: _fp, ...one }: typeof male) => one;
+      for (const lineups of [
+        [kept(female), { ...kept(male), lineup: 'female' }],
+        [kept(female), { ...kept(male), first: female.first }],
+      ]) {
+        await db.deleteFrom('RocketLineup').execute();
+        const { log, entries } = createTestLogger();
+        const store = new RocketLineupRepository(db, log);
+        await store.replace([water], 1_000);
+        await db
+          .updateTable('RocketLineup')
+          .set({ catches: JSON.stringify({ catches: water.catches, lineups }) })
+          .execute();
+        expect((await store.kept()).choices).toEqual([merged]);
+        expect(
+          entries.some(
+            (entry) => entry.msg === 'the lineups of a kept Rocket choice cannot be read; merged',
+          ),
+        ).toBe(true);
+      }
+    });
   });
 });
diff --git a/src/db/repositories/stop-report-repository.db.test.ts b/src/db/repositories/stop-report-repository.db.test.ts
index 17751cd782ea4243dff7f104ad283c4da0fe9027..f841f77be3348c7928dc7967d538c7c7b4da84c9 100644
--- a/src/db/repositories/stop-report-repository.db.test.ts
+++ b/src/db/repositories/stop-report-repository.db.test.ts
@@ -44,7 +44,8 @@ describe('StopReportRepository', () => {
 
   it('decides two first reports of the same grunt at once as one, the other kept out (8R-2)', async () => {
     const store = await fresh();
-    const keepsSame = (standing: { subjectKey: string }) => standing.subjectKey === 'grunt:water';
+    const keepsSame = (standing: { subjectKey: string }) =>
+      standing.subjectKey === 'grunt:water' ? ('keep' as const) : ('replace' as const);
     const [one, two] = await Promise.all([
       store.saveUnless(rocketReport(), keepsSame),
       store.saveUnless(
diff --git a/src/db/repositories/stop-report-repository.ts b/src/db/repositories/stop-report-repository.ts
index c52859aab09bcd04b0d6bd51f9d16de4e7e5e751..5eecdb447435b632653e6cbd4554681ade060ec0 100644
--- a/src/db/repositories/stop-report-repository.ts
+++ b/src/db/repositories/stop-report-repository.ts
@@ -13,12 +13,21 @@ export interface SavedStopReport {
   replaced: StopReport | undefined;
 }
 
+/**
+ * What `saveUnless` does with the report standing in its place: keeps it as it is (`keep`),
+ * replaces it with a report of its own (`replace`, a new id), or changes it into the new report in
+ * place (`update`, plan 8R-4L, Matt's B2: its row and id stay, so that a grunt's messages and an
+ * answer's Take back still find it).
+ */
+export type StandingVerdict = 'keep' | 'replace' | 'update';
+
 /**
  * What came of a save that may keep the report standing in its place (`saveUnless`): saved, as
- * `save` saves; or not, the report standing there kept as it is.
+ * `save` saves (`inPlace` where the standing report was changed into it, keeping its id); or not,
+ * the report standing there kept as it is.
  */
 export type SaveOutcome =
-  ({ saved: true } & SavedStopReport) | { saved: false; standing: StopReport };
+  ({ saved: true; inPlace: boolean } & SavedStopReport) | { saved: false; standing: StopReport };
 
 /**
  * The reports at stops (plan 8R-1; table `StopReport` of migration 027); lets tests keep them in
@@ -32,17 +41,19 @@ export interface StopReportStorage {
    */
   save(report: NewStopReport): Promise<SavedStopReport>;
   /**
-   * `save`, unless `keeps` says the report standing in its place stays (plan 8R-2: one Rocket
-   * report per stop and day, design 5.2): asked with that report, while its row is locked in the
-   * same transaction, so that the decision and the write are one. Not asked where nothing stands
-   * (or what stands cannot be read: it is replaced). With `standingAt`, a report of the same
-   * server, stop and kind that still stands at that time in another period (a grunt of yesterday
-   * past midnight) counts as standing in its place too: it is asked about (the latest), locked,
-   * and replaced with the rest (fix A2: one Rocket report per stop, also across midnight).
+   * `save`, unless `decide` says the report standing in its place stays (plan 8R-2: one Rocket
+   * report per stop and day, design 5.2), or is to be changed into it in place (`update`, plan
+   * 8R-4L: its id kept; the other rows of its place go as a replacement takes them): asked with
+   * that report, while its row is locked in the same transaction, so that the decision and the
+   * write are one. Not asked where nothing stands (or what stands cannot be read: it is
+   * replaced). With `standingAt`, a report of the same server, stop and kind that still stands at
+   * that time in another period (a grunt of yesterday past midnight) counts as standing in its
+   * place too: it is asked about (the latest), locked, and replaced with the rest (fix A2: one
+   * Rocket report per stop, also across midnight).
    */
   saveUnless(
     report: NewStopReport,
-    keeps: (standing: StopReport) => boolean,
+    decide: (standing: StopReport) => StandingVerdict,
     standingAt?: number,
   ): Promise<SaveOutcome>;
   /** A report by its id, if it is kept. */
@@ -51,12 +62,27 @@ export interface StopReportStorage {
   standing(serverId: string, now: number): Promise<StopReport[]>;
   /** The servers with reports that have not ended at `now`. */
   serversStanding(now: number): Promise<string[]>;
-  /** Takes back a report of a server; gives it, or undefined when it is not kept (any more). */
-  remove(id: number, serverId: string): Promise<StopReport | undefined>;
+  /**
+   * Takes back a report of a server; gives it, or undefined when it is not kept (any more). With
+   * `madeAt`, only while the report by that id was made then (review L1: a report changed in
+   * place keeps its id, so its version is the id and `madeAt`); another is left as it is.
+   */
+  remove(id: number, serverId: string, madeAt?: number): Promise<StopReport | undefined>;
   /** Forgets the reports that ended at or before `before`; gives how many. */
   removeEnded(before: number): Promise<number>;
 }
 
+/**
+ * A report as it changes one made at `standingMadeAt` in place (fix round 2, F1): made at least a
+ * millisecond after it, its end moved by as much, so that its length stays. Two versions of one
+ * id are never equal, and the later write is always the newer one, also where the clock that
+ * made the report was behind (another process, a refine that waited for the lock).
+ */
+export function newerThan<T extends NewStopReport>(report: T, standingMadeAt: number): T {
+  const madeAt = Math.max(report.madeAt, standingMadeAt + 1);
+  return { ...report, madeAt, endsAt: report.endsAt + (madeAt - report.madeAt) };
+}
+
 const reward = z.discriminatedUnion('kind', [
   z.object({
     kind: z.literal('encounter'),
@@ -94,8 +120,12 @@ const researchDocument = z.object({
   typed: z.boolean(),
 });
 
-/** What a Rocket report's `detail` holds (plan 8R-2). */
-const rocketDocument = z.object({ name: z.string(), catches: catchesDocument });
+/** What a Rocket report's `detail` holds (plan 8R-2; a lineup's first slot, plan 8R-4L). */
+const rocketDocument = z.object({
+  name: z.string(),
+  catches: catchesDocument,
+  lineup: z.string().optional(),
+});
 
 const KINDS: ReadonlySet<string> = new Set<StopReportKind>(['research', 'rocket']);
 
@@ -178,24 +208,26 @@ export class StopReportRepository implements StopReportStorage {
    * replacing it.
    */
   async save(report: NewStopReport): Promise<SavedStopReport> {
-    const outcome = await this.saveUnless(report, () => false);
+    const outcome = await this.saveUnless(report, () => 'replace');
     if (!outcome.saved) throw new Error('a report kept what stood without being asked to');
     return outcome;
   }
 
   /**
-   * As `save`; `keeps` is asked inside the transaction, with the standing row locked. Two first
+   * As `save`; `decide` is asked inside the transaction, with the standing row locked. Two first
    * reports at once: the one whose insert meets the other's row runs again, and is asked then.
+   * The retry also covers the update in place (plan 8R-4L): a report of yesterday changed into
+   * today's period can meet a first report of today made meanwhile, and is asked again then.
    */
   async saveUnless(
     report: NewStopReport,
-    keeps: (standing: StopReport) => boolean,
+    decide: (standing: StopReport) => StandingVerdict,
     standingAt?: number,
   ): Promise<SaveOutcome> {
     for (let attempt = 1; ; attempt++) {
       try {
         return await retryOnDeadlock(this.db, () =>
-          inTransaction(this.db, (trx) => this.saveIn(trx, report, keeps, standingAt), {
+          inTransaction(this.db, (trx) => this.saveIn(trx, report, decide, standingAt), {
             isolation: 'read committed',
           }),
         );
@@ -208,7 +240,7 @@ export class StopReportRepository implements StopReportStorage {
   private async saveIn(
     trx: Kysely<DB>,
     report: NewStopReport,
-    keeps: (standing: StopReport) => boolean,
+    decide: (standing: StopReport) => StandingVerdict,
     standingAt: number | undefined,
   ): Promise<SaveOutcome> {
     // The row of the report's identity, and with `standingAt` every row of the stop and kind
@@ -232,26 +264,33 @@ export class StopReportRepository implements StopReportStorage {
       standingAt === undefined ? [] : rows.filter((row) => Number(row.endsAt) > standingAt);
     const before = live.at(-1) ?? rows.find((row) => row.periodKey === report.periodKey);
     const standing = before && this.read(before);
-    if (standing && keeps(standing)) return { saved: false, standing };
+    const verdict = standing ? decide(standing) : 'replace';
+    if (standing && verdict === 'keep') return { saved: false, standing };
+    // Changed in place (plan 8R-4L): the standing row keeps its id and takes the new report's
+    // columns; the other rows of its place go first, so that its period is free to take.
+    const kept = standing && verdict === 'update' ? standing.id : undefined;
     // A replacement is a report of its own (review A1): the replaced row is deleted and a new one
     // made, under the same lock, so an id never changes what it is; an old answer's Take back or
     // "Same task at more stops…" finds its report gone.
-    if (rows.length > 0) {
+    const gone = rows.filter((row) => row.id !== kept).map((row) => row.id);
+    if (gone.length > 0) await trx.deleteFrom('StopReport').where('id', 'in', gone).execute();
+    if (standing && kept !== undefined) {
+      // A version strictly newer than the one it changes (F1): the order of the writes of one id
+      // is the order of `madeAt`, whatever clock each report read.
+      const written = newerThan(report, standing.madeAt);
       await trx
-        .deleteFrom('StopReport')
-        .where(
-          'id',
-          'in',
-          rows.map((row) => row.id),
-        )
+        .updateTable('StopReport')
+        .set(this.columns(written))
+        .where('id', '=', kept)
         .execute();
+      return { saved: true, inPlace: true, report: { ...written, id: kept }, replaced: standing };
     }
     const made = await trx
       .insertInto('StopReport')
       .values(this.columns(report))
       .executeTakeFirstOrThrow();
     const id = Number(made.insertId);
-    return { saved: true, report: { ...report, id }, replaced: standing };
+    return { saved: true, inPlace: false, report: { ...report, id }, replaced: standing };
   }
 
   async byId(id: number): Promise<StopReport | undefined> {
@@ -286,7 +325,7 @@ export class StopReportRepository implements StopReportStorage {
     return rows.map((row) => row.serverId);
   }
 
-  async remove(id: number, serverId: string): Promise<StopReport | undefined> {
+  async remove(id: number, serverId: string, madeAt?: number): Promise<StopReport | undefined> {
     return inTransaction(this.db, async (trx) => {
       const row = await trx
         .selectFrom('StopReport')
@@ -295,7 +334,7 @@ export class StopReportRepository implements StopReportStorage {
         .where('serverId', '=', serverId)
         .forUpdate()
         .executeTakeFirst();
-      if (!row) return undefined;
+      if (!row || (madeAt !== undefined && Number(row.madeAt) !== madeAt)) return undefined;
       await trx.deleteFrom('StopReport').where('id', '=', id).execute();
       return this.read(row);
     });
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index 878b8f130a7be80389c37a770ad86fb8e8faecdb..3b2fce80a67e6d7705fc7c61807142e58ad42f18 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -282,7 +282,7 @@ export class StopReportService {
       },
       (standing) => {
         asked.decision = decideRocket(standing, input.subject, madeAt, input.replacing);
-        return asked.decision === 'already' || asked.decision === 'asks';
+        return asked.decision === 'already' || asked.decision === 'asks' ? 'keep' : 'replace';
       },
       // What still stands at the stop, also from yesterday past midnight (fix A2).
       madeAt,
@@ -376,7 +376,7 @@ export class StopReportService {
     // is no moment without a report; another report standing there is kept.
     const outcome = await this.options.store.saveUnless(
       again,
-      (standing) => standing.id !== grunt.id,
+      (standing) => (standing.id === grunt.id ? 'replace' : 'keep'),
       now,
     );
     if (!outcome.saved || !isRocketReport(outcome.report)) return undefined;
diff --git a/test/support/rocket-store-cases.ts b/test/support/rocket-store-cases.ts
index a420fded55323118ff5963f5e0d697cfe21c29b9..7cd16a34245c3dcdd349684414bf94458b01e53b 100644
--- a/test/support/rocket-store-cases.ts
+++ b/test/support/rocket-store-cases.ts
@@ -4,7 +4,12 @@ import type {
   GruntMessageStorage,
 } from '../../src/db/repositories/grunt-message-repository.js';
 import type { RocketLineupStorage } from '../../src/db/repositories/rocket-lineup-repository.js';
-import type { RocketChoice } from '../../src/domain/rocket/lineups.js';
+import {
+  lineupFingerprint,
+  type RocketCatch,
+  type RocketChoice,
+  type RocketLineupChoice,
+} from '../../src/domain/rocket/lineups.js';
 
 /** A choice of the list as the feed of 2026-10-22 has it, made shorter (`overrides` change it). */
 export function listedChoice(key: string, overrides: Partial<RocketChoice> = {}): RocketChoice {
@@ -25,6 +30,29 @@ export function listedChoice(key: string, overrides: Partial<RocketChoice> = {})
   };
 }
 
+/**
+ * The Water-type grunt with its two lineups (plan 8R-4L), made shorter: Mudkip's and Magikarp's,
+ * each with its fingerprint as the parser gives it.
+ */
+export function waterWithLineups(): RocketChoice {
+  const [magikarp, missingno] = listedChoice('grunt:water').catches;
+  if (!magikarp || !missingno) throw new Error('the listed water grunt has two catches');
+  const mudkip: RocketCatch = { ...magikarp, name: 'Mudkip', key: 'mudkip', dex: 258 };
+  const lineup = (side: RocketLineupChoice['lineup'], first: string[], catches: RocketCatch[]) => ({
+    lineup: side,
+    first,
+    catches,
+    fingerprint: lineupFingerprint({ first, catches }),
+  });
+  return listedChoice('grunt:water', {
+    catches: [mudkip, magikarp, missingno],
+    lineups: [
+      lineup('female', ['Mudkip', 'Tentacool'], [mudkip]),
+      lineup('male', ['Magikarp', 'Feebas'], [magikarp, missingno]),
+    ],
+  });
+}
+
 /** A grunt's message (`n` makes another), of report 1 unless said, due at 1,000 + n. */
 export function gruntRow(n: number, overrides: Partial<GruntMessageRow> = {}): GruntMessageRow {
   return {
@@ -88,6 +116,29 @@ export function rocketLineupCases(made: () => Promise<RocketLineupStorage>): voi
     expect(await store.kept()).toEqual({ choices: [], readAt: undefined });
   });
 
+  it('keeps a grunt type’s two lineups inside its choice (plan 8R-4L)', async () => {
+    const store = await made();
+    const water = waterWithLineups();
+    const arlo = listedChoice('leader:arlo');
+    await store.replace([water, arlo], 1_000);
+    expect(await store.kept()).toEqual({ choices: [water, arlo], readAt: 1_000 });
+    // A later read without them: the type is its merged choice again.
+    const merged = listedChoice('grunt:water');
+    await store.replace([merged], 2_000);
+    expect(await store.kept()).toEqual({ choices: [merged], readAt: 2_000 });
+  });
+
+  it('works a lineup’s fingerprint out from its data, never keeping one handed over (L3)', async () => {
+    const store = await made();
+    const water = waterWithLineups();
+    const wrong: RocketChoice = {
+      ...water,
+      lineups: (water.lineups ?? []).map((one) => ({ ...one, fingerprint: 'wrong' })),
+    };
+    await store.replace([wrong], 1_000);
+    expect(await store.kept()).toEqual({ choices: [water], readAt: 1_000 });
+  });
+
   it('keeps the last list read, in its order, a choice changed by a later read', async () => {
     const store = await made();
     const water = listedChoice('grunt:water');
diff --git a/test/support/rocket-store.ts b/test/support/rocket-store.ts
index 14ac7cd89f223f507c23be3f21e20da725195788..7f53e8ad3df1ad6073be1566df407044ad3b0a58 100644
--- a/test/support/rocket-store.ts
+++ b/test/support/rocket-store.ts
@@ -6,7 +6,11 @@ import type {
   KeptRocketList,
   RocketLineupStorage,
 } from '../../src/db/repositories/rocket-lineup-repository.js';
-import type { RocketChoice } from '../../src/domain/rocket/lineups.js';
+import {
+  lineupFingerprint,
+  type RocketChoice,
+  type RocketLineupChoice,
+} from '../../src/domain/rocket/lineups.js';
 
 /**
  * The grunts' messages in memory (`GruntMessageStorage`), the twin of `GruntMessageRepository`;
@@ -66,11 +70,16 @@ export class MemoryGruntMessages implements GruntMessageStorage {
   }
 }
 
+/** A choice as the kept list holds it: its lineups without their fingerprints. */
+type KeptChoice = Omit<RocketChoice, 'lineups'> & {
+  lineups?: Omit<RocketLineupChoice, 'fingerprint'>[];
+};
+
 /** The kept Rocket lineups in memory (`RocketLineupStorage`), the twin of `RocketLineupRepository`. */
 export class MemoryRocketLineups implements RocketLineupStorage {
   readonly rows = new Map<
     string,
-    { choice: RocketChoice; firstSeen: number; lastSeen: number; active: boolean; position: number }
+    { choice: KeptChoice; firstSeen: number; lastSeen: number; active: boolean; position: number }
   >();
   readonly failing = new Map<keyof RocketLineupStorage, Error>();
 
@@ -85,7 +94,17 @@ export class MemoryRocketLineups implements RocketLineupStorage {
       .filter((row) => row.active)
       .sort((a, b) => a.position - b.position || a.choice.key.localeCompare(b.choice.key));
     const readAt = active.length === 0 ? undefined : Math.max(...active.map((row) => row.lastSeen));
-    return Promise.resolve({ choices: active.map((row) => structuredClone(row.choice)), readAt });
+    // The fingerprints are worked out again, as the repository does (review L3).
+    const choices = active.map(({ choice }): RocketChoice => {
+      const { lineups, ...rest } = structuredClone(choice);
+      return lineups === undefined
+        ? rest
+        : {
+            ...rest,
+            lineups: lineups.map((one) => ({ ...one, fingerprint: lineupFingerprint(one) })),
+          };
+    });
+    return Promise.resolve({ choices, readAt });
   }
 
   replace(choices: readonly RocketChoice[], at: number): Promise<void> {
@@ -93,8 +112,17 @@ export class MemoryRocketLineups implements RocketLineupStorage {
     for (const row of this.rows.values()) row.active = false;
     for (const [position, choice] of choices.entries()) {
       const firstSeen = this.rows.get(choice.key)?.firstSeen ?? at;
+      // Kept without the fingerprints, as the repository keeps them (review L3).
+      const { lineups, ...rest } = choice;
+      const kept: KeptChoice =
+        lineups === undefined
+          ? rest
+          : {
+              ...rest,
+              lineups: lineups.map(({ lineup, first, catches }) => ({ lineup, first, catches })),
+            };
       this.rows.set(choice.key, {
-        choice: structuredClone(choice),
+        choice: structuredClone(kept),
         firstSeen,
         lastSeen: at,
         active: true,
diff --git a/test/support/stop-report-cases.ts b/test/support/stop-report-cases.ts
index 072e9839431398a2f9ac80e07f8b6838f062e978..4dd5c78aebd9577a66041807e8e777e26bc21199 100644
--- a/test/support/stop-report-cases.ts
+++ b/test/support/stop-report-cases.ts
@@ -65,6 +65,32 @@ export const MUDKIP: RocketCatch = {
   image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm258.icon.png',
 };
 
+/** The first catch of the water grunts' other lineup (plan 8R-4L). */
+export const MAGIKARP: RocketCatch = {
+  name: 'Magikarp',
+  key: 'magikarp',
+  dex: 129,
+  shiny: true,
+  image: 'https://cdn.leekduck.com/assets/img/pokemon_icons_crop/pm129.icon.png',
+};
+
+/**
+ * The Water-type grunt's lineup of Magikarp and Feebas (plan 8R-4L) by Misty at stop 1, a minute
+ * after `REPORT_NOW`, for half an hour from then.
+ */
+export function magikarpLineup(
+  overrides: Partial<Omit<RocketReport, 'id'>> = {},
+): Omit<RocketReport, 'id'> {
+  return rocketReport({
+    subjectKey: 'grunt:water:male',
+    rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
+    reporter: OTHER_REPORTER,
+    madeAt: REPORT_NOW + 60_000,
+    endsAt: REPORT_NOW + 31 * 60_000,
+    ...overrides,
+  });
+}
+
 /** A Water-type grunt by Brock at stop 1, for half an hour from `REPORT_NOW`. */
 export function rocketReport(
   overrides: Partial<Omit<RocketReport, 'id'>> = {},
@@ -183,19 +209,98 @@ export function stopReportCases(made: () => Promise<StopReportStorage>): void {
     expect(
       await store.saveUnless(arlo, (standing) => {
         asked.push(standing);
-        return true;
+        return 'keep';
       }),
     ).toEqual({ saved: false, standing: grunt.report });
     expect(asked).toEqual([grunt.report]);
     expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([grunt.report]);
-    const replaced = await store.saveUnless(arlo, () => false);
-    expect(replaced).toMatchObject({ saved: true, replaced: grunt.report });
+    const replaced = await store.saveUnless(arlo, () => 'replace');
+    expect(replaced).toMatchObject({ saved: true, inPlace: false, replaced: grunt.report });
     expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([
       replaced.saved ? replaced.report : undefined,
     ]);
     // Nothing standing: nothing to ask about.
-    const other = await store.saveUnless(rocketReport({ stop: reportedStop(2) }), () => true);
-    expect(other).toMatchObject({ saved: true, replaced: undefined });
+    const other = await store.saveUnless(rocketReport({ stop: reportedStop(2) }), () => 'keep');
+    expect(other).toMatchObject({ saved: true, inPlace: false, replaced: undefined });
+  });
+
+  it('keeps a grunt’s lineup with its report (plan 8R-4L)', async () => {
+    const store = await made();
+    const { report } = await store.save(magikarpLineup());
+    expect(report).toEqual({ ...magikarpLineup(), id: report.id });
+    expect(await store.byId(report.id)).toEqual(report);
+  });
+
+  it('changes the report standing in place when the decision says so (plan 8R-4L)', async () => {
+    const store = await made();
+    const notSure = await store.save(rocketReport());
+    const refined = await store.saveUnless(magikarpLineup(), () => 'update');
+    // The same row and id; who it is of, what it says, who reported and its times are the new.
+    const expected = { ...magikarpLineup(), id: notSure.report.id };
+    expect(refined).toEqual({
+      saved: true,
+      inPlace: true,
+      report: expected,
+      replaced: notSure.report,
+    });
+    expect(await store.byId(notSure.report.id)).toEqual(expected);
+    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([expected]);
+  });
+
+  it('changes a report in place into a strictly newer version, its length kept (F1)', async () => {
+    const store = await made();
+    const notSure = await store.save(rocketReport());
+    const { id } = notSure.report;
+    // A clock behind the one that made it: the version written is a millisecond newer, and the
+    // grunt ends as much later, its half hour kept.
+    const older = magikarpLineup({
+      madeAt: REPORT_NOW - 5_000,
+      endsAt: REPORT_NOW - 5_000 + 30 * 60_000,
+    });
+    const behind = await store.saveUnless(older, () => 'update');
+    const first = { ...older, id, madeAt: REPORT_NOW + 1, endsAt: REPORT_NOW + 1 + 30 * 60_000 };
+    expect(behind).toEqual({ saved: true, inPlace: true, report: first, replaced: notSure.report });
+    expect(await store.byId(id)).toEqual(first);
+    // The same moment as the standing version: a millisecond newer too, never equal.
+    const same = magikarpLineup({ madeAt: first.madeAt, endsAt: first.endsAt });
+    const again = await store.saveUnless(same, () => 'update');
+    const second = { ...same, id, madeAt: first.madeAt + 1, endsAt: first.endsAt + 1 };
+    expect(again).toMatchObject({ saved: true, inPlace: true, report: second });
+    expect(await store.byId(id)).toEqual(second);
+  });
+
+  it('takes back a report by its id only while it was made when expected (L1)', async () => {
+    const store = await made();
+    const notSure = await store.save(rocketReport());
+    await store.saveUnless(magikarpLineup(), () => 'update');
+    const { id } = notSure.report;
+    // The id stays, the version is gone: a Take back of the report as it stood removes nothing.
+    expect(await store.remove(id, REPORT_SERVER, REPORT_NOW)).toBeUndefined();
+    expect(await store.byId(id)).toEqual({ ...magikarpLineup(), id });
+    expect(await store.remove(id, REPORT_SERVER, REPORT_NOW + 60_000)).toEqual({
+      ...magikarpLineup(),
+      id,
+    });
+    expect(await store.byId(id)).toBeUndefined();
+  });
+
+  it('changes a report of yesterday that still stands into today’s, in place (plan 8R-4L)', async () => {
+    const store = await made();
+    const yesterday = await store.save(
+      rocketReport({ periodKey: 'day:2026-10-20', endsAt: REPORT_NOW + 60_000 }),
+    );
+    // Today's grunt at the stop, ended already: it goes, as a replacement takes it.
+    const ended = await store.save(rocketReport({ subjectKey: 'grunt:fire', endsAt: REPORT_NOW }));
+    const refined = await store.saveUnless(magikarpLineup(), () => 'update', REPORT_NOW);
+    const expected = { ...magikarpLineup(), id: yesterday.report.id };
+    expect(refined).toEqual({
+      saved: true,
+      inPlace: true,
+      report: expected,
+      replaced: yesterday.report,
+    });
+    expect(await store.byId(ended.report.id)).toBeUndefined();
+    expect(await store.standing(REPORT_SERVER, REPORT_NOW)).toEqual([expected]);
   });
 
   it('decides against what still stands at the stop in another period, if asked (fix A2)', async () => {
@@ -210,7 +315,7 @@ export function stopReportCases(made: () => Promise<StopReportStorage>): void {
       rocketReport({ subjectKey: 'grunt:fire' }),
       (standing) => {
         asked.push(standing);
-        return true;
+        return 'keep';
       },
       REPORT_NOW,
     );
@@ -218,7 +323,7 @@ export function stopReportCases(made: () => Promise<StopReportStorage>): void {
     expect(asked).toEqual([yesterday.report]);
     const replaced = await store.saveUnless(
       rocketReport({ subjectKey: 'grunt:fire' }),
-      () => false,
+      () => 'replace',
       REPORT_NOW,
     );
     expect(replaced).toMatchObject({ saved: true, replaced: yesterday.report });
@@ -230,7 +335,7 @@ export function stopReportCases(made: () => Promise<StopReportStorage>): void {
     // Without `standingAt` another period is no matter.
     const apart = await store.saveUnless(
       rocketReport({ periodKey: 'day:2026-10-22', subjectKey: 'decoy' }),
-      () => true,
+      () => 'keep',
     );
     expect(apart).toMatchObject({ saved: true, replaced: undefined });
   });
diff --git a/test/support/stop-reports.ts b/test/support/stop-reports.ts
index 57adcfbc59885d3e1ac90dac92a54811fcba4070..ecd8f4d5e666c16225dfcf48752f6bde9cb35b13 100644
--- a/test/support/stop-reports.ts
+++ b/test/support/stop-reports.ts
@@ -1,7 +1,9 @@
-import type {
-  SaveOutcome,
-  SavedStopReport,
-  StopReportStorage,
+import {
+  newerThan,
+  type SaveOutcome,
+  type SavedStopReport,
+  type StandingVerdict,
+  type StopReportStorage,
 } from '../../src/db/repositories/stop-report-repository.js';
 import type { NewStopReport, StopReport } from '../../src/domain/stops/report.js';
 
@@ -25,14 +27,14 @@ export class MemoryStopReports implements StopReportStorage {
 
   async save(report: NewStopReport): Promise<SavedStopReport> {
     this.fail('save');
-    const outcome = await this.saveUnless(report, () => false);
+    const outcome = await this.saveUnless(report, () => 'replace');
     if (!outcome.saved) throw new Error('a report kept what stood without being asked to');
     return outcome;
   }
 
   saveUnless(
     report: NewStopReport,
-    keeps: (standing: StopReport) => boolean,
+    decide: (standing: StopReport) => StandingVerdict,
     standingAt?: number,
   ): Promise<SaveOutcome> {
     this.fail('saveUnless');
@@ -48,15 +50,27 @@ export class MemoryStopReports implements StopReportStorage {
       .sort((a, b) => a.madeAt - b.madeAt || a.id - b.id);
     const live = standingAt === undefined ? [] : rows.filter((row) => row.endsAt > standingAt);
     const before = live.at(-1) ?? rows.find((row) => row.periodKey === report.periodKey);
-    if (before && keeps(structuredClone(before))) {
+    const verdict = before ? decide(structuredClone(before)) : 'replace';
+    if (before && verdict === 'keep') {
       return Promise.resolve({ saved: false, standing: structuredClone(before) });
     }
-    // A replacement is a report of its own: the replaced one's id is gone for good.
+    // A replacement is a report of its own: the replaced one's id is gone for good. Changed in
+    // place (plan 8R-4L), the standing one keeps its id.
     for (const row of rows) this.rows.delete(row.id);
-    const id = this.nextId++;
-    const kept: StopReport = structuredClone({ ...report, id });
+    const inPlace = before !== undefined && verdict === 'update';
+    const id = inPlace ? before.id : this.nextId++;
+    // A version strictly newer than the one it changes (F1), its length kept.
+    const kept: StopReport = structuredClone({
+      ...(inPlace ? newerThan(report, before.madeAt) : report),
+      id,
+    });
     this.rows.set(id, kept);
-    return Promise.resolve({ saved: true, report: structuredClone(kept), replaced: before });
+    return Promise.resolve({
+      saved: true,
+      inPlace,
+      report: structuredClone(kept),
+      replaced: before,
+    });
   }
 
   byId(id: number): Promise<StopReport | undefined> {
@@ -86,10 +100,12 @@ export class MemoryStopReports implements StopReportStorage {
     );
   }
 
-  remove(id: number, serverId: string): Promise<StopReport | undefined> {
+  remove(id: number, serverId: string, madeAt?: number): Promise<StopReport | undefined> {
     this.fail('remove');
     const row = this.rows.get(id);
-    if (row?.serverId !== serverId) return Promise.resolve(undefined);
+    if (row?.serverId !== serverId || (madeAt !== undefined && row.madeAt !== madeAt)) {
+      return Promise.resolve(undefined);
+    }
     this.rows.delete(id);
     return Promise.resolve(row);
   }
````

### Task 3: 8R-4L task 3: Reporting one lineup with the rocket command

Prototype commit: `18ded56ead73295472c896fe6d425e69835e23b1`

/rocket report who: offers a grunt type of two lineups three ways once
the typed words find it: each lineup by its first slot ("Water-type
grunt · Magikarp, Feebas", picked as <lineup key>#<fingerprint>), in
the feed's order, then "Water-type grunt · not sure which"; only while
the whole list fits 25, and with nothing typed one choice per type as
before. "Did you mean" suggests each type once.

readWho takes a lineup while the type's lineups hold it with that
fingerprint; a stale fingerprint, a lineup key without one, a merged
key with one, or a "#" value of no key is LINEUPS_CHANGED. A typed name
is the merged choice. The report keeps the lineup's catches and first
slot (rocketSubject); its name stays the type's.

rocketLabel names a lineup apart from its catches: the "was" line (a
grunt of the same type without a lineup as "not sure which"), "Already
reported", the hideout question. Take back writes and reads every ":"
of who as "." (replaceAll) and refuses a fourth argument.

**Files:**

```
 src/commands/rocket/rocket-input.ts |  84 ++++++++++++++++++++++++++----
 src/commands/rocket/rocket.test.ts  | 216 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/commands/rocket/rocket.ts       |  17 +++---
 src/domain/rocket/lineups.ts        |   9 ++++
 src/render/rocket.test.ts           |  86 +++++++++++++++++++++++++++++-
 src/render/rocket.ts                |  37 +++++++++++--
 src/services/rocket-reports.ts      |  14 ++++-
 7 files changed, 431 insertions(+), 32 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/rocket/rocket.test.ts src/render/rocket.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 18ded56ead73295472c896fe6d425e69835e23b1 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4L task 3: Reporting one lineup with the rocket command`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/rocket/rocket-input.ts b/src/commands/rocket/rocket-input.ts
index db1ba9a19abe5ce2c4edaf777f066d969482be43..bec1384d893b8f769c7b89f4cda75320575a5cc4 100644
--- a/src/commands/rocket/rocket-input.ts
+++ b/src/commands/rocket/rocket-input.ts
@@ -6,14 +6,18 @@ import type { Throttle } from '../../discord/throttle.js';
 import {
   catchesInShort,
   LEADERS,
+  lineupChoice,
+  lineupValue,
   parseRocketKey,
   rocketKey,
   rocketName,
+  typeKeyOf,
   type RocketChoice,
   type RocketWho,
 } from '../../domain/rocket/lineups.js';
 import { POKEMON_TYPES } from '../../domain/pogo/types.js';
 import { searchText, searchTokens } from '../../domain/search/text.js';
+import { NOT_SURE_WHICH } from '../../render/rocket.js';
 import { plain, truncate } from '../../render/text.js';
 import { CHOICE_NAME, MAX_CHOICES, type Choice } from '../choices.js';
 
@@ -72,6 +76,22 @@ export function whoChoice(choice: RocketChoice): Choice {
   };
 }
 
+/**
+ * A grunt type's choices once the typed words found it (plan 8R-4L, S8, B3): each lineup by its
+ * first slot (`Water-type grunt · Magikarp, Feebas`, picked as `lineupValue`), in the feed's
+ * order, then the type itself, "not sure which"; a type of one lineup is its one choice.
+ */
+function typeChoices(choice: RocketChoice): Choice[] {
+  if (choice.lineups === undefined) return [whoChoice(choice)];
+  return [
+    ...choice.lineups.map((lineup) => ({
+      name: truncate(`${choice.name} · ${lineupChoice(choice, lineup).lineup ?? ''}`, CHOICE_NAME),
+      value: lineupValue(choice, lineup),
+    })),
+    { name: truncate(`${choice.name} · ${NOT_SURE_WHICH}`, CHOICE_NAME), value: choice.key },
+  ];
+}
+
 /** Whether every typed word begins a word of a text. */
 function hasWords(text: string, words: readonly string[]): boolean {
   const own = searchTokens(text);
@@ -111,19 +131,52 @@ export function rocketChoices(ctx: Pick<AppContext, 'rocketLineups'>): readonly
 }
 
 /**
- * The choices of the `who` option: those whose name has every typed word (as the beginning of a
- * word), then those that have them among their catches' names (`noibat` finds the Dragon-type
- * grunt), each in the list's order.
+ * The choices of the list the typed words find: those whose name has every typed word (as the
+ * beginning of a word), then those that have them among their catches' names (`noibat` finds the
+ * Dragon-type grunt), each in the list's order; one per type.
  */
-export function whoChoices(ctx: Pick<AppContext, 'rocketLineups'>, typed: string): Choice[] {
-  const words = searchTokens(typed);
+function found(ctx: Pick<AppContext, 'rocketLineups'>, words: readonly string[]): RocketChoice[] {
   const choices = rocketChoices(ctx);
   const byName = choices.filter((choice) => hasWords(choice.name, words));
   const byCatch = choices.filter(
     (choice) =>
       !byName.includes(choice) && hasWords(choice.catches.map((one) => one.name).join(' '), words),
   );
-  return [...byName, ...byCatch].slice(0, MAX_CHOICES).map(whoChoice);
+  return [...byName, ...byCatch];
+}
+
+/**
+ * The choices of the `who` option (`found`). Plan 8R-4L (S8, B4): with nothing typed, one per
+ * type; once the words find something, a type of two lineups as its three choices
+ * (`typeChoices`), while the whole list fits Discord's 25, else one per type again.
+ */
+export function whoChoices(ctx: Pick<AppContext, 'rocketLineups'>, typed: string): Choice[] {
+  const words = searchTokens(typed);
+  const choices = found(ctx, words);
+  if (words.length > 0) {
+    const apart = choices.flatMap(typeChoices);
+    if (apart.length <= MAX_CHOICES) return apart;
+  }
+  return choices.slice(0, MAX_CHOICES).map(whoChoice);
+}
+
+/**
+ * The lineup a value `<lineup key>#<fingerprint>` picks, as a choice (`lineupChoice`), while the
+ * type's lineups hold that lineup with that fingerprint; `LINEUPS_CHANGED` else (a rotation
+ * changed it, the type lost its second lineup).
+ */
+function lineupOfNow(choices: readonly RocketChoice[], value: string): RocketChoice {
+  const mark = value.lastIndexOf('#');
+  const key = value.slice(0, mark);
+  const who = parseRocketKey(key);
+  // Only a lineup's key carries a fingerprint (B14).
+  if (who?.kind !== 'grunt' || who.lineup === undefined) throw new UserError(LINEUPS_CHANGED);
+  const type = choices.find((choice) => choice.key === typeKeyOf(key));
+  const lineup = type?.lineups?.find(
+    (one) => one.lineup === who.lineup && one.fingerprint === value.slice(mark + 1),
+  );
+  if (!type || !lineup) throw new UserError(LINEUPS_CHANGED);
+  return lineupChoice(type, lineup);
 }
 
 /** The names a choice is known by, typed: its own, and a grunt's type alone or with `grunt`. */
@@ -141,22 +194,31 @@ function namesOf(choice: RocketChoice): string[] {
 /**
  * Who `who:` names (design 5.2): a choice of the list (its key; one no longer in the lineups is
  * `LINEUPS_CHANGED`), or a name typed in full (`Water-type grunt`, `water`, `arlo`); refused
- * otherwise, with what the list offers for the words.
+ * otherwise, with what the list offers for the words. Plan 8R-4L (S11, B14): a lineup is picked
+ * as `<its key>#<fingerprint>` and taken while the lineups have it so (`lineupChoice`); any other
+ * value with `#`, or a lineup's key without one, is `LINEUPS_CHANGED`; a name typed is the merged
+ * choice ("not sure which").
  */
 export function readWho(ctx: Pick<AppContext, 'rocketLineups'>, value: string): RocketChoice {
   const text = value.trim();
   const choices = rocketChoices(ctx);
-  if (parseRocketKey(text) !== undefined) {
-    const chosen = choices.find((choice) => choice.key === text);
+  if (text.includes('#')) return lineupOfNow(choices, text);
+  const who = parseRocketKey(text);
+  if (who !== undefined) {
+    const chosen =
+      who.kind === 'grunt' && who.lineup !== undefined
+        ? undefined
+        : choices.find((choice) => choice.key === text);
     if (!chosen) throw new UserError(LINEUPS_CHANGED);
     return chosen;
   }
   const folded = searchText(text);
   const named = choices.find((choice) => namesOf(choice).includes(folded));
   if (named) return named;
-  const suggested = whoChoices(ctx, text)
+  // From one choice per type (B5): a type found by its catches is suggested once.
+  const suggested = found(ctx, searchTokens(text))
     .slice(0, 5)
-    .map((choice) => plain(choice.name.split(' · ')[0] ?? choice.name));
+    .map((choice) => plain(whoChoice(choice).name.split(' · ')[0] ?? choice.name));
   throw new UserError(
     `I do not know "${plain(truncate(text, 80))}" in Team GO Rocket’s lineups. ` +
       (suggested.length === 0 ? '' : `Did you mean ${suggested.join(', ')}? `) +
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index 9e50cd8ef47d86af34af46f21e247020231c583c..a50d5cb9a20f1337406873a60bd6fae4280a5033 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -14,7 +14,12 @@ import {
 } from '../../../test/support/fake-interactions.js';
 import { UNBOUNDED_CHANNEL, WEST_CHANNEL } from '../../../test/support/gyms.js';
 import { textOf } from '../../../test/support/messages.js';
-import { feedChoice, rocketLineupsFixture } from '../../../test/support/rocket.js';
+import {
+  feedChoice,
+  rocketChoicesOfFeed,
+  rocketLineupsFixture,
+} from '../../../test/support/rocket.js';
+import { lineupFingerprint, lineupValue } from '../../domain/rocket/lineups.js';
 import { MemoryGruntMessages } from '../../../test/support/rocket-store.js';
 import { MemoryStopReports } from '../../../test/support/stop-reports.js';
 import { createTestContext } from '../../../test/support/test-context.js';
@@ -258,9 +263,9 @@ describe('/rocket report', () => {
       }[];
     expect(await choices('dratini')).toEqual([]);
     expect((await choices('noibat')).map((one) => one.value)).toEqual(['grunt:dragon']);
-    expect(await choices('water')).toContainEqual({
-      name: 'Water-type grunt · Mudkip, Tentacool, Krabby +2',
-      value: 'grunt:water',
+    expect(await choices('fire')).toContainEqual({
+      name: 'Fire-type grunt · Litwick, Ponyta, Torchic',
+      value: 'grunt:fire',
     });
     expect(await choices('giov')).toEqual([
       { name: 'Giovanni (only when sure it is him) · Zekrom', value: 'giovanni' },
@@ -272,6 +277,209 @@ describe('/rocket report', () => {
   });
 });
 
+describe('/rocket report of one lineup of a grunt type (plan 8R-4L)', () => {
+  const water = feedChoice('grunt:water');
+  const [mudkips, magikarps] = water.lineups ?? [];
+  if (!mudkips || !magikarps) throw new Error('the water grunt has two lineups');
+  const MAGIKARPS = lineupValue(water, magikarps);
+  const MUDKIPS = lineupValue(water, mudkips);
+
+  async function choicesOf(made: Awaited<ReturnType<typeof setup>>, typed: string) {
+    return (await made.typing('who', typed)).respond.mock.calls[0]?.[0] as {
+      name: string;
+      value: string;
+    }[];
+  }
+
+  it('offers a type’s lineups by their first slot, then not sure which, once the words match it', async () => {
+    const made = await setup();
+    const three = [
+      { name: 'Water-type grunt · Mudkip, Tentacool, Krabby', value: MUDKIPS },
+      { name: 'Water-type grunt · Magikarp, Feebas', value: MAGIKARPS },
+      { name: 'Water-type grunt · not sure which', value: 'grunt:water' },
+    ];
+    expect(MAGIKARPS).toMatch(/^grunt:water:male#[0-9a-z]+$/);
+    expect(await choicesOf(made, 'water')).toEqual(three);
+    // Found by a catch of one lineup: the type's three all the same.
+    expect(await choicesOf(made, 'magikarp')).toEqual(three);
+    // With nothing typed, one choice per type (24; with the lineups, 28): as before.
+    const all = await choicesOf(made, '');
+    expect(all).toHaveLength(24);
+    expect(all).toContainEqual({
+      name: 'Water-type grunt · Mudkip, Tentacool, Krabby +2',
+      value: 'grunt:water',
+    });
+    expect(all.some((one) => one.value.includes('#'))).toBe(false);
+  });
+
+  it('offers the merged choices only where the lineups would pass 25 choices', async () => {
+    const made = await setup();
+    // Every grunt type with two lineups: "grunt" matches 20 choices, 58 with the lineups.
+    const doubled = rocketChoicesOfFeed().map((choice) =>
+      choice.key.startsWith('grunt:') ? { ...choice, lineups: water.lineups } : choice,
+    );
+    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture(doubled) });
+    const choices = await choicesOf(made, 'grunt');
+    expect(choices).toHaveLength(20);
+    expect(choices.some((one) => one.value.includes('#'))).toBe(false);
+    expect(choices).toContainEqual({
+      name: 'Water-type grunt · Mudkip, Tentacool, Krabby +2',
+      value: 'grunt:water',
+    });
+  });
+
+  it('expands a list of exactly 25 choices, and lists one of 26 merged only (L4)', async () => {
+    const made = await setup();
+    // Three grunt types with two lineups each (the feed's water and untyped grunts, and fire):
+    // six choices more where all three are found.
+    const doubled = rocketChoicesOfFeed().map((choice) =>
+      choice.key === 'grunt:fire' ? { ...choice, lineups: water.lineups } : choice,
+    );
+    expect(doubled.filter((choice) => choice.lineups !== undefined)).toHaveLength(3);
+    Object.assign(made.ctx, { rocketLineups: rocketLineupsFixture(doubled) });
+    // "type" finds the 18 typed grunts and "Grunt (no type)": 19 merged, 25 expanded.
+    const typeChoices = await choicesOf(made, 'type');
+    expect(typeChoices).toHaveLength(25);
+    expect(typeChoices.filter((one) => one.value.includes('#'))).toHaveLength(6);
+    // "grunt" also finds the decoy: 20 merged, 26 expanded, so merged only.
+    const gruntChoices = await choicesOf(made, 'grunt');
+    expect(gruntChoices).toHaveLength(20);
+    expect(gruntChoices.some((one) => one.value.includes('#'))).toBe(false);
+  });
+
+  it('reports a lineup with its own catches, named by its type everywhere it is posted', async () => {
+    const made = await setup();
+    const answer = answerOf(await made.report({ who: MAGIKARPS, stop: stop(1) }));
+    expect(said(answer)).toContain(
+      '**Water-type grunt** at **Yellow Mural** · catch one of Magikarp, Feebas',
+    );
+    const [kept] = [...made.store.rows.values()];
+    expect(kept).toMatchObject({
+      subjectKey: 'grunt:water:male',
+      rocket: { name: 'Water-type grunt', catches: magikarps.catches, lineup: 'Magikarp, Feebas' },
+    });
+    expect(posted(made)).toEqual([expect.stringContaining('### Water-type grunt\n')]);
+    expect(posted(made)[0]).not.toMatch(/male/i);
+  });
+
+  it('reads a typed type as not sure which, with both lineups’ catches', async () => {
+    const made = await setup();
+    await made.report({ who: 'water grunt', stop: stop(1) });
+    expect([...made.store.rows.values()][0]).toMatchObject({
+      subjectKey: 'grunt:water',
+      rocket: { catches: water.catches },
+    });
+    expect([...made.store.rows.values()][0]).not.toHaveProperty('rocket.lineup');
+  });
+
+  it('refuses a lineup whose fingerprint is not the lineup’s of now, before counting', async () => {
+    const made = await setup();
+    const refused = async (who: string) =>
+      said(answerOf(await made.report({ who, stop: stop(1) })));
+    // A rotation changed the lineup.
+    expect(await refused(`grunt:water:male#${mudkips.fingerprint}`)).toBe(LINEUPS_CHANGED);
+    // A lineup's key without its fingerprint, a merged key with one, a "#" value of no key.
+    expect(await refused('grunt:water:male')).toBe(LINEUPS_CHANGED);
+    expect(await refused(`grunt:water#${magikarps.fingerprint}`)).toBe(LINEUPS_CHANGED);
+    expect(await refused(`grunt:shadow:male#${magikarps.fingerprint}`)).toBe(LINEUPS_CHANGED);
+    // The type lost its second lineup.
+    const { lineups: _gone, ...merged } = water;
+    Object.assign(made.ctx, {
+      rocketLineups: rocketLineupsFixture(
+        rocketChoicesOfFeed().map((choice) => (choice.key === 'grunt:water' ? merged : choice)),
+      ),
+    });
+    expect(await refused(MAGIKARPS)).toBe(LINEUPS_CHANGED);
+    expect(made.store.rows.size).toBe(0);
+  });
+
+  it('suggests each type once for words that find it by its catches (B5)', async () => {
+    const made = await setup();
+    expect(said(answerOf(await made.report({ who: 'magikarp', stop: stop(1) })))).toBe(
+      'I do not know "magikarp" in Team GO Rocket’s lineups. Did you mean Water-type grunt? ' +
+        'Pick one from the list that appears while you type.',
+    );
+  });
+
+  it('answers not sure which over a lineup as reported already, naming the lineup', async () => {
+    const made = await setup();
+    await made.report({ who: MAGIKARPS, stop: stop(1) });
+    const answer = answerOf(await made.report({ who: 'water', stop: stop(1) }, made.as(MISTY)));
+    expect(said(answer)).toContain(
+      'Already reported: a **Water-type grunt · Magikarp, Feebas** at **Yellow Mural**',
+    );
+    expect(posted(made)).toHaveLength(1);
+  });
+
+  it('names what a lineup replaced of its type: not sure which, or the other lineup', async () => {
+    const made = await setup();
+    await made.report({ who: 'grunt:water', stop: stop(1) });
+    expect(said(answerOf(await made.report({ who: MAGIKARPS, stop: stop(1) })))).toContain(
+      '(was: Water-type grunt, not sure which)',
+    );
+    expect(said(answerOf(await made.report({ who: MUDKIPS, stop: stop(1) })))).toContain(
+      '(was: Water-type grunt · Magikarp, Feebas)',
+    );
+  });
+
+  it('asks before a lineup replaces a hideout, naming the lineup', async () => {
+    const made = await setup();
+    await made.report({ who: 'leader:arlo', stop: stop(1) });
+    expect(dialogText(shownDialog(await made.report({ who: MAGIKARPS, stop: stop(1) })))).toBe(
+      'Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s ' +
+        'report with the Water-type grunt · Magikarp, Feebas?\n\nSubmit replaces it.',
+    );
+  });
+
+  it('takes a lineup back by its meaning at the longest Wayfarer key (S9, B10)', async () => {
+    // The electric grunts with two lineups, at a stop of the longest Wayfarer id.
+    const electric = feedChoice('grunt:electric');
+    const [voltorb, magnemite] = [electric.catches.slice(0, 3), electric.catches.slice(3)];
+    const lineups = [
+      { lineup: 'female' as const, first: ['Voltorb', 'Shinx'], catches: voltorb },
+      { lineup: 'male' as const, first: ['Magnemite'], catches: magnemite },
+    ].map((one) => ({ ...one, fingerprint: lineupFingerprint(one) }));
+    const twoElectric = { ...electric, lineups };
+    const longest = `${'f'.repeat(32)}.999`;
+    const made = await setup([
+      keptRow(1, { id: longest, title: 'Yellow Mural', lat: 40.06, lon: -80.06, address: null }),
+    ]);
+    Object.assign(made.ctx, {
+      rocketLineups: rocketLineupsFixture(
+        rocketChoicesOfFeed().map((choice) =>
+          choice.key === 'grunt:electric' ? twoElectric : choice,
+        ),
+      ),
+    });
+    const [female] = lineups;
+    if (!female) throw new Error('two lineups');
+    /** Reports the lineup and moves its row to another id, as a report put back would be. */
+    const reportedUnderAnotherId = async (): Promise<string> => {
+      const answer = answerOf(
+        await made.report({ who: lineupValue(twoElectric, female), stop: `stop:${longest}` }),
+      );
+      const [[id, row] = []] = [...made.store.rows.entries()];
+      if (id === undefined || row === undefined) throw new Error('reported');
+      made.store.rows.delete(id);
+      made.store.rows.set(id + 100, { ...row, id: id + 100 });
+      return buttonId(answer, 'Take back');
+    };
+    const back = await reportedUnderAnotherId();
+    expect(back).toContain(`:back:${longest}:grunt.electric.female:`);
+    // Its id gone, it is found by what it is.
+    expect(said(answerOf(await made.press(back)))).toBe(
+      'Took back **Electric-type grunt** at **Yellow Mural**.',
+    );
+    expect(made.store.rows.size).toBe(0);
+    // A fourth argument is no Take back of this version.
+    const again = await reportedUnderAnotherId();
+    expect(said(answerOf(await made.press(`${again}:x`)))).toContain(
+      'There was nothing left to take back',
+    );
+    expect(made.store.rows.size).toBe(1);
+  });
+});
+
 describe('/rocket report’s throttle around the dialog (fix B7)', () => {
   const refusedLater = /^You can use \/rocket report again in/;
 
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index c3e3413c6bafd31b2ea5a8721255cdb397acdf5f..bbc8bae675866852435641d2565a0a25ce965778 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -25,6 +25,7 @@ import {
   ROCKET_COLOUR,
   ROCKET_KIND,
   rocketAnswer,
+  rocketLabel,
 } from '../../render/rocket.js';
 import { plain } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
@@ -120,7 +121,7 @@ function replaceDialog(token: string, ask: WaitingAsk) {
   return dialog({
     customId: encodeCustomId({ kind: ROCKET_KIND, id: token, action: ROCKET_ACTIONS.replace }),
     title: 'Replace a hideout?',
-    text: `${hideoutQuestion(ask.hideout.rocket.name, ask.choice.name)}\n\nSubmit replaces it.`,
+    text: `${hideoutQuestion(ask.hideout.rocket.name, rocketLabel(ask.choice))}\n\nSubmit replaces it.`,
   });
 }
 
@@ -176,10 +177,10 @@ async function report(
 
 /**
  * The report a Take back means where its id is gone (fix S3): the presser's own Rocket report of
- * the same who made at the same moment (`args`: the stop's key, the `rocketKey` with `.` for `:`
- * and `madeAt` in base 36) at the same stop, standing now: a hideout put back keeps its time, a
- * newer report of the same who has its own (fix F1). Undefined for none, or a button without
- * them.
+ * the same who made at the same moment (`args`: the stop's key, the `rocketKey` with `.` for
+ * every `:` (plan 8R-4L, S9: a lineup's key has two) and `madeAt` in base 36) at the same stop,
+ * standing now: a hideout put back keeps its time, a newer report of the same who has its own
+ * (fix F1). Undefined for none, a button without them, or one with more.
  */
 async function sameReportNow(
   ctx: AppContext,
@@ -187,11 +188,11 @@ async function sameReportNow(
   args: readonly string[],
   memberId: string,
 ): Promise<RocketReport | undefined> {
-  const [stopKey, who, made] = args;
+  const [stopKey, who, made, ...more] = args;
   if (stopKey === undefined || who === undefined || made === undefined) return undefined;
-  if (!/^[0-9a-z]{1,12}$/.test(made)) return undefined;
+  if (more.length > 0 || !/^[0-9a-z]{1,12}$/.test(made)) return undefined;
   const standing = await ctx.stopReports.rocketAt(serverId, stopKey);
-  return standing?.subjectKey === who.replace('.', ':') &&
+  return standing?.subjectKey === who.replaceAll('.', ':') &&
     standing.reporter.id === memberId &&
     standing.madeAt === parseInt(made, 36)
     ? standing
diff --git a/src/domain/rocket/lineups.ts b/src/domain/rocket/lineups.ts
index 7ef51c34eabe488c3a01c044cb14043498fcbb89..abaa0cdde1a30677fd35c379e767d43e2bd746cb 100644
--- a/src/domain/rocket/lineups.ts
+++ b/src/domain/rocket/lineups.ts
@@ -161,6 +161,15 @@ export function lineupChoice(choice: RocketChoice, lineup: RocketLineupChoice):
   };
 }
 
+/**
+ * The value a lineup is picked by (plan 8R-4L, S11): its key and its fingerprint,
+ * `grunt:water:male#<fingerprint>`, so that a pick made before a rotation changed the lineup is
+ * told from one of now (`/rocket report who:`, the map's options).
+ */
+export function lineupValue(choice: RocketChoice, lineup: RocketLineupChoice): string {
+  return `${lineupChoice(choice, lineup).key}#${lineup.fingerprint}`;
+}
+
 /** Whether it holds its stop all day (a leader, Giovanni, the decoy), not for half an hour. */
 export function isHideout(who: RocketWho): boolean {
   return who.kind !== 'grunt';
diff --git a/src/render/rocket.test.ts b/src/render/rocket.test.ts
index 8b6788d7b4bec2986ba503fb6fd465fb8cce0330..2c67d613868cc7647ac4ab3383c457248bc9a236 100644
--- a/src/render/rocket.test.ts
+++ b/src/render/rocket.test.ts
@@ -1,7 +1,18 @@
 import { describe, expect, it } from 'vitest';
-import { classic, galleryOf, textOf, thumbnailOf } from '../../test/support/messages.js';
+import {
+  classic,
+  customIdsOf,
+  galleryOf,
+  textOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
 import { feedChoice } from '../../test/support/rocket.js';
-import { reportedStop, rocketReport } from '../../test/support/stop-report-cases.js';
+import {
+  magikarpLineup,
+  MUDKIP,
+  reportedStop,
+  rocketReport,
+} from '../../test/support/stop-report-cases.js';
 import type { RocketReport } from '../domain/stops/report.js';
 import {
   alreadyReported,
@@ -12,6 +23,7 @@ import {
   ROCKET_COLOUR,
   rocketAnswer,
   rocketDmSentence,
+  rocketLabel,
   rocketWords,
   type GruntView,
   type RocketAnswerView,
@@ -234,6 +246,76 @@ describe('rocketAnswer', () => {
   });
 });
 
+describe('a lineup of a grunt type in the answer (plan 8R-4L)', () => {
+  const lineup = (overrides: Partial<Omit<RocketReport, 'id'>> = {}): RocketReport => ({
+    ...magikarpLineup(overrides),
+    id: 7,
+  });
+
+  it('names what it replaced of the same type by its lineup, or as not sure which (B8)', () => {
+    const { grunt } = answerViews();
+    const notSure: RocketReport = { ...rocketReport(), id: 7 };
+    const refined: RocketAnswerView = { ...grunt, report: lineup(), replaced: notSure };
+    expect(textOf(rocketAnswer(refined))).toMatchInlineSnapshot(`
+      "### Team GO Rocket reported
+      **Water-type grunt** at **Yellow Mural 1** · Market Street · catch Magikarp (was: Water-type grunt, not sure which)
+      -# Posted in <#100000000000000011>, <#100000000000000012>; it goes away <t:1792593060:R>."
+    `);
+    const mudkip = lineup({
+      subjectKey: 'grunt:water:female',
+      rocket: { name: 'Water-type grunt', catches: [MUDKIP], lineup: 'Mudkip, Tentacool, Krabby' },
+    });
+    expect(rocketWords({ ...refined, replaced: mudkip }, () => '#west').head).toContain(
+      '· catch Magikarp (was: Water-type grunt · Mudkip, Tentacool, Krabby)',
+    );
+    // Another type is named as before, a lineup of it with its first slot.
+    const fire: RocketReport = {
+      ...rocketReport({
+        subjectKey: 'grunt:fire',
+        rocket: { name: 'Fire-type grunt', catches: [] },
+      }),
+      id: 3,
+    };
+    expect(rocketWords({ ...refined, replaced: fire }, () => '#west').head).toContain(
+      '(was: Fire-type grunt)',
+    );
+    expect(rocketWords({ ...grunt, replaced: lineup() }, () => '#west').head).toContain(
+      '(was: Water-type grunt · Magikarp, Feebas)',
+    );
+  });
+
+  it('spells every colon of who in Take back, and leaves the arguments out where they do not fit', () => {
+    const { grunt } = answerViews();
+    // The longest Wayfarer key and the longest lineup key (B10): 90 characters, which fit.
+    const longest = lineup({
+      stop: reportedStop(1, { key: `${'f'.repeat(32)}.999` }),
+      subjectKey: 'grunt:electric:female',
+    });
+    const [id] = customIdsOf(rocketAnswer({ ...grunt, report: { ...longest, id: 9_999_999_999 } }));
+    expect(id).toBe(
+      `rocket:9999999999:back:${'f'.repeat(32)}.999:grunt.electric.female:` +
+        longest.madeAt.toString(36),
+    );
+    expect(id).toHaveLength(90);
+    const overlong = lineup({
+      stop: reportedStop(1, { key: `pine-${'9'.repeat(60)}` }),
+      subjectKey: 'grunt:electric:female',
+    });
+    expect(customIdsOf(rocketAnswer({ ...grunt, report: overlong }))).toEqual(['rocket:7:back']);
+  });
+
+  it('names the lineup that stands where it is reported already', () => {
+    expect(alreadyReported(lineup(), undefined)).toMatch(
+      /^Already reported: a \*\*Water-type grunt · Magikarp, Feebas\*\* at \*\*Yellow Mural 1\*\*/,
+    );
+  });
+
+  it('names a grunt apart from its catches by its lineup, the type alone without one', () => {
+    expect(rocketLabel(lineup().rocket)).toBe('Water-type grunt · Magikarp, Feebas');
+    expect(rocketLabel(rocketReport().rocket)).toBe('Water-type grunt');
+  });
+});
+
 describe('rocketWords', () => {
   it('names the channels through the namer the caller gives', () => {
     const names = new Map([
diff --git a/src/render/rocket.ts b/src/render/rocket.ts
index d0626c84b853df3fef7563a31897834dcf55a027..12cba83243448cdba0f318cd7bb49ef6dc0f7aac 100644
--- a/src/render/rocket.ts
+++ b/src/render/rocket.ts
@@ -6,8 +6,8 @@ import {
 } from 'discord.js';
 import { encodeCustomId, encodeCustomIdIfFits } from '../discord/custom-id.js';
 import type { ClassicMessage, V2Message } from '../discord/party-gateway.js';
-import { catchesInShort, type RocketCatch } from '../domain/rocket/lineups.js';
-import type { ReportedStop, RocketReport } from '../domain/stops/report.js';
+import { catchesInShort, typeKeyOf, type RocketCatch } from '../domain/rocket/lineups.js';
+import type { ReportedStop, RocketDetail, RocketReport } from '../domain/stops/report.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
 import { cutText } from './party-post.js';
 import { mapMarkdown } from './raid-post.js';
@@ -59,6 +59,32 @@ export function catchWords(catches: readonly Pick<RocketCatch, 'name'>[], most =
   return catches.length === 1 ? short : `one of ${short}`;
 }
 
+/**
+ * How a grunt type's merged choice is named beside its lineups, and a report of it that a lineup
+ * replaced (plan 8R-4L, S8, B8).
+ */
+export const NOT_SURE_WHICH = 'not sure which';
+
+/**
+ * Who a Rocket report is of, where it is named apart from its catches (plan 8R-4L, S10): a
+ * lineup of a grunt type by the type and its first slot (`Water-type grunt · Magikarp, Feebas`),
+ * anything else by its name. Not made plain: the caller does.
+ */
+export function rocketLabel(detail: Pick<RocketDetail, 'name' | 'lineup'>): string {
+  return detail.lineup === undefined ? detail.name : `${detail.name} · ${detail.lineup}`;
+}
+
+/**
+ * What a Rocket report replaced, as its answer names it (plan 8R-4L, B8): by `rocketLabel`, and a
+ * grunt of the same type without a lineup as "not sure which".
+ */
+function replacedLabel(replaced: RocketReport, report: RocketReport): string {
+  const sameType = typeKeyOf(replaced.subjectKey) === typeKeyOf(report.subjectKey);
+  return sameType && replaced.rocket.lineup === undefined
+    ? `${replaced.rocket.name}, ${NOT_SURE_WHICH}`
+    : rocketLabel(replaced.rocket);
+}
+
 /** A stop as a line names it in a public message or a DM: plain, without links, cut. */
 export function rocketStopLine(stop: Pick<ReportedStop, 'name' | 'address'>): string {
   const name = `**${plainNoLinks(truncate(stop.name, 80))}**`;
@@ -159,7 +185,7 @@ export function rocketAnswer(view: RocketAnswerView): V2Message {
         kind: ROCKET_KIND,
         id: String(report.id),
         action: ROCKET_ACTIONS.back,
-        args: [report.stop.key, report.subjectKey.replace(':', '.'), report.madeAt.toString(36)],
+        args: [report.stop.key, report.subjectKey.replaceAll(':', '.'), report.madeAt.toString(36)],
       }) ??
       encodeCustomId({ kind: ROCKET_KIND, id: String(report.id), action: ROCKET_ACTIONS.back }),
     label: 'Take back',
@@ -192,7 +218,7 @@ export function rocketWords(
       ? ''
       : replaced.subjectKey === report.subjectKey
         ? ' (again)'
-        : ` (was: ${plain(replaced.rocket.name)})`;
+        : ` (was: ${plain(replacedLabel(replaced, report))})`;
   const head = [
     '### Team GO Rocket reported',
     `**${plain(report.rocket.name)}** at ${stopLine(report.stop)}` +
@@ -230,8 +256,9 @@ export function alreadyReported(
   link: string | undefined,
   by = memberByName(standing.reporter),
 ): string {
+  const named = `**${plain(rocketLabel(standing.rocket))}**`;
   return (
-    `Already reported: ${withArticle(standing.rocket.name, `**${plain(standing.rocket.name)}**`)} at ` +
+    `Already reported: ${withArticle(standing.rocket.name, named)} at ` +
     `${stopLine(standing.stop)}, by ${by} ` +
     `${timestamp(standing.madeAt, 'R')}; it goes away ${timestamp(standing.endsAt, 'R')}.` +
     (link === undefined ? '' : ` ${link}`)
diff --git a/src/services/rocket-reports.ts b/src/services/rocket-reports.ts
index 01cfd12ae79ed1e5a167a92fe1ce580d4ba657a5..d7b3466555aa0bfa2699f1945ab1a45cc86ece49 100644
--- a/src/services/rocket-reports.ts
+++ b/src/services/rocket-reports.ts
@@ -50,9 +50,19 @@ export type RocketReported =
   /** A hideout stands today: the member is asked first (design 5.2). */
   | { kind: 'asks'; standing: RocketReport };
 
-/** What a choice of the lineups is reported as: its key, its name and catches as they are now. */
+/**
+ * What a choice of the lineups is reported as: its key, its name and catches as they are now; a
+ * lineup (plan 8R-4L) its own catches and its first slot in short.
+ */
 export function rocketSubject(choice: RocketChoice): RocketSubject {
-  return { subjectKey: choice.key, rocket: { name: choice.name, catches: choice.catches } };
+  return {
+    subjectKey: choice.key,
+    rocket: {
+      name: choice.name,
+      catches: choice.catches,
+      ...(choice.lineup === undefined ? {} : { lineup: choice.lineup }),
+    },
+  };
 }
 
 export interface RocketServiceOptions {
````

### Task 4: 8R-4L task 4: A lineup refines its grunt in place

Prototype commit: `df42197672d367f894f77f3466683fa435e629d4`

Matt's B2: where a lineup is reported over "not sure which" of its
type, or over the other lineup, the standing report is changed in
place. StopReportService asks the storage for an update and answers
refined (the id kept, nothing ended, no post drawn). RocketService
then has GruntMessageService edit that report's messages (their ids
kept, so every DM's "Go to report" still works; a message whose edit
fails stays as it was and is logged; one gone is forgotten), moves
their delete to the new end (GruntMessageStorage.retime), and tells
the notifier as of a new report. The reporter is answered as for a
report with the "was" line; Take back is the new reporter's.

A report's version is its id and madeAt: takeBack takes ids or
versions and gives those changed since apart (changed), so an old
Take back answers REPORT_CHANGED to anyone, its first reporter and
staff too; RocketService takes back, restores and reads a report again
(StopReportService.kept) by its version. GruntMessageService runs a
report's posting, refines and end in turn (KeyedLock): a refine edits
and retimes every message its posting sent, skips a version older than
the one shown, keeps nothing whose report ended while an edit was on
its way, and edits a message as the kind it was sent as. A report
refined while its messages were posted tells nobody and is answered as
it stands; a refine that leaves no message is taken back as unposted.

**Files:**

```
 src/commands/research/research-report.ts        |  13 ++-
 src/commands/rocket/rocket.test.ts              |  63 +++++++++++++-
 src/commands/rocket/rocket.ts                   |  28 ++++--
 src/db/repositories/grunt-message-repository.ts |  13 +++
 src/services/grunt-messages.test.ts             | 295 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/services/grunt-messages.ts                  | 255 ++++++++++++++++++++++++++++++++++++++++++++++---------
 src/services/rocket-reports.test.ts             | 242 +++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/services/rocket-reports.ts                  | 114 +++++++++++++++++++------
 src/services/stop-reports.test.ts               |  99 ++++++++++++++++++++++
 src/services/stop-reports.ts                    |  83 +++++++++++++++---
 test/support/held-call.test.ts                  |  31 +++++++
 test/support/held-call.ts                       |  69 +++++++++++++++
 test/support/rocket-store-cases.ts              |  10 +++
 test/support/rocket-store.ts                    |   7 ++
 14 files changed, 1223 insertions(+), 99 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/rocket/rocket.test.ts src/services/grunt-messages.test.ts src/services/rocket-reports.test.ts src/services/stop-reports.test.ts test/support/held-call.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff df42197672d367f894f77f3466683fa435e629d4 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4L task 4: A lineup refines its grunt in place`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/commands/research/research-report.ts b/src/commands/research/research-report.ts
index 43ce49c17f795dfe23431021d87659e34197f800..7e06e5aa6a5876ca476b50ccb53ad2bb4b2cf440 100644
--- a/src/commands/research/research-report.ts
+++ b/src/commands/research/research-report.ts
@@ -9,7 +9,7 @@ import {
   type ResearchWordsView,
 } from '../../render/research.js';
 import { endSentence } from '../../render/text.js';
-import type { ResearchOutcome, ResearchSubject } from '../../services/stop-reports.js';
+import type { ReportRef, ResearchOutcome, ResearchSubject } from '../../services/stop-reports.js';
 
 /*
  * What `/research` does beyond reading its interaction (plan 8R-3; web.md's one code path per
@@ -163,24 +163,29 @@ export function tookBackWords(report: StopReport): string {
 export type TakenBackAs =
   | { kind: 'removed'; report: StopReport; text: string }
   | { kind: 'not-yours'; report: StopReport }
+  /** Changed in place since the version given (review L1): nothing is taken back. */
+  | { kind: 'changed'; report: StopReport }
   /** None of this server by that id stands (ended, taken back, replaced, or never was). */
   | { kind: 'gone' };
 
 /**
  * Takes back a report of a server by its id (plan 8R-3: `/research remove`, `/rocket remove` and
  * the map): the member's own, or any for `staff`. A replacement is a report of its own, so a
- * report replaced since it was read is `gone`, and nothing is taken back.
+ * report replaced since it was read is `gone`, and nothing is taken back. Given by its version
+ * (`ReportRef`, review L1), a Rocket report refined in place since is `changed`.
  */
 export async function takeBackAs(
   ctx: Pick<AppContext, 'stopReports'>,
   serverId: string,
-  id: number,
+  ref: ReportRef,
   by: string,
   staff: boolean,
 ): Promise<TakenBackAs> {
-  const { removed, notYours } = await ctx.stopReports.takeBack(serverId, [id], by, staff);
+  const { removed, notYours, changed } = await ctx.stopReports.takeBack(serverId, [ref], by, staff);
   const [gone] = removed;
   if (gone) return { kind: 'removed', report: gone, text: tookBackWords(gone) };
+  const [since] = changed;
+  if (since) return { kind: 'changed', report: since };
   const [kept] = notYours;
   return kept ? { kind: 'not-yours', report: kept } : { kind: 'gone' };
 }
diff --git a/src/commands/rocket/rocket.test.ts b/src/commands/rocket/rocket.test.ts
index a50d5cb9a20f1337406873a60bd6fae4280a5033..af4396a793bf66f00dd20114a2a9016212c0b4cf 100644
--- a/src/commands/rocket/rocket.test.ts
+++ b/src/commands/rocket/rocket.test.ts
@@ -19,7 +19,7 @@ import {
   rocketChoicesOfFeed,
   rocketLineupsFixture,
 } from '../../../test/support/rocket.js';
-import { lineupFingerprint, lineupValue } from '../../domain/rocket/lineups.js';
+import { lineupChoice, lineupFingerprint, lineupValue } from '../../domain/rocket/lineups.js';
 import { MemoryGruntMessages } from '../../../test/support/rocket-store.js';
 import { MemoryStopReports } from '../../../test/support/stop-reports.js';
 import { createTestContext } from '../../../test/support/test-context.js';
@@ -30,10 +30,10 @@ import { InteractionRouter } from '../../discord/router.js';
 import { Throttles } from '../../discord/throttle.js';
 import { GruntMessageService } from '../../services/grunt-messages.js';
 import { Rehearsal } from '../../services/rehearsal.js';
-import { RocketService } from '../../services/rocket-reports.js';
+import { RocketService, rocketSubject } from '../../services/rocket-reports.js';
 import { StopReportService } from '../../services/stop-reports.js';
 import { NO_STOPS_HERE } from '../research/research-input.js';
-import { NOT_YOUR_REPORT } from '../research/research.js';
+import { NOT_YOUR_REPORT, REPORT_CHANGED } from '../research/research.js';
 import { HIDEOUT_CHANGED, NOTHING_AT_STOP, rocket, rocketControls } from './rocket.js';
 import { LINEUPS_CHANGED, NOT_A_ROCKET_STOP, ROCKET_FROM_A_REGION } from './rocket-input.js';
 
@@ -422,6 +422,34 @@ describe('/rocket report of one lineup of a grunt type (plan 8R-4L)', () => {
     );
   });
 
+  it('refines not sure which in place: one message, edited; Take back is the new reporter’s (B2, L1)', async () => {
+    const made = await setup();
+    const ash = answerOf(await made.report({ who: 'grunt:water', stop: stop(1) }));
+    vi.setSystemTime(Date.now() + 60_000);
+    const misty = answerOf(await made.report({ who: MAGIKARPS, stop: stop(1) }, made.as(MISTY)));
+    expect(said(misty)).toContain('(was: Water-type grunt, not sure which)');
+    await made.messages.flush();
+    expect(made.gateway.deleted).toEqual([]);
+    expect(made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
+    expect(posted(made)[0]).toContain('**Catch** one of Magikarp, Feebas');
+    // The same report by its id, another by its version (L1): Ash's Take back says it changed,
+    // and staff pressing it take back nothing either.
+    expect(buttonId(ash, 'Take back').split(':')[1]).toBe(
+      buttonId(misty, 'Take back').split(':')[1],
+    );
+    expect(said(answerOf(await made.press(buttonId(ash, 'Take back'))))).toBe(REPORT_CHANGED);
+    const moderator = { ...made.as(ASH), roleNames: ['Moderator'] };
+    expect(said(answerOf(await made.press(buttonId(ash, 'Take back'), moderator)))).toBe(
+      REPORT_CHANGED,
+    );
+    expect([...made.store.rows.values()].map((row) => row.subjectKey)).toEqual([
+      'grunt:water:male',
+    ]);
+    expect(said(answerOf(await made.press(buttonId(misty, 'Take back'), made.as(MISTY))))).toBe(
+      'Took back **Water-type grunt** at **Yellow Mural**.',
+    );
+  });
+
   it('asks before a lineup replaces a hideout, naming the lineup', async () => {
     const made = await setup();
     await made.report({ who: 'leader:arlo', stop: stop(1) });
@@ -727,6 +755,35 @@ describe('the Take back of /rocket report’s answer and /rocket remove', () =>
     ).toBe('Took back **Cliff** at **Yellow Mural**.');
     expect(said(answerOf(await made.remove(stop(1))))).toBe(NOTHING_AT_STOP);
   });
+
+  it('takes back by the version it read: a report refined meanwhile is not taken back (F6)', async () => {
+    const made = await setup();
+    await made.report({ who: 'grunt:water', stop: stop(1) });
+    const water = feedChoice('grunt:water');
+    const magikarps = water.lineups?.[1];
+    if (!magikarps) throw new Error('the water grunt has two lineups');
+    // Misty refines Ash's grunt between the read of what stands and the take back.
+    const { stopReports } = made.ctx;
+    const read = stopReports.rocketAt.bind(stopReports);
+    vi.spyOn(stopReports, 'rocketAt').mockImplementation(async (serverId, stopKey) => {
+      const standing = await read(serverId, stopKey);
+      if (standing?.reporter.id === ASH) {
+        vi.setSystemTime(Date.now() + 60_000);
+        await stopReports.reportRocket({
+          serverId,
+          stop: standing.stop,
+          subject: rocketSubject(lineupChoice(water, magikarps)),
+          reporter: { id: MISTY, name: 'Misty' },
+        });
+      }
+      return standing;
+    });
+    const moderator = { ...made.as(ASH), roleNames: ['Moderator'] };
+    expect(said(answerOf(await made.remove(stop(1), moderator)))).toBe(REPORT_CHANGED);
+    expect([...made.store.rows.values()].map((row) => row.subjectKey)).toEqual([
+      'grunt:water:male',
+    ]);
+  });
 });
 
 describe('/rocket in rehearsal mode', () => {
diff --git a/src/commands/rocket/rocket.ts b/src/commands/rocket/rocket.ts
index bbc8bae675866852435641d2565a0a25ce965778..065c71145cbdbe5bf470325da74425aac4242b1a 100644
--- a/src/commands/rocket/rocket.ts
+++ b/src/commands/rocket/rocket.ts
@@ -30,7 +30,7 @@ import {
 import { plain } from '../../render/text.js';
 import { textMessage } from '../../render/v2.js';
 import { PendingRequests } from '../../services/pending-requests.js';
-import { isHideoutReport } from '../../services/stop-reports.js';
+import { isHideoutReport, type ReportRef } from '../../services/stop-reports.js';
 import { MAX_PLACE_TEXT, nearChoices } from '../place-option.js';
 import { reporterOf } from '../research/research.js';
 import { namedStop, NO_STOPS_HERE } from '../research/research-input.js';
@@ -199,6 +199,17 @@ async function sameReportNow(
     : undefined;
 }
 
+/**
+ * The version of the report a Take back means (review L1): its id, and the `madeAt` its button
+ * carries (`args`, as `sameReportNow` reads them), which a report refined in place since no
+ * longer has. A button without them, or with more, means the id alone.
+ */
+function versionOf(id: number, args: readonly string[]): ReportRef {
+  const [, , made, ...more] = args;
+  if (made === undefined || more.length > 0 || !/^[0-9a-z]{1,12}$/.test(made)) return id;
+  return { id, madeAt: parseInt(made, 36) };
+}
+
 /** The `stop` option of both subcommands. */
 const stopOption = (option: SlashCommandStringOption) =>
   option
@@ -307,11 +318,12 @@ const removeRocket: SubcommandPart = {
     const serverId = guildIdOf(interaction);
     const standing = await ctx.stopReports.rocketAt(serverId, stop.key);
     if (!standing) throw new UserError(NOTHING_AT_STOP);
-    // By its id (a replacement is a report of its own): one replaced since is not taken back.
+    // By the version read (F6; a replacement is a report of its own, a refine keeps the id with
+    // another `madeAt`): one replaced or refined since is not taken back.
     const taken = await takeBackAs(
       ctx,
       serverId,
-      standing.id,
+      { id: standing.id, madeAt: standing.madeAt },
       interaction.user.id,
       isStaff(interaction, ctx),
     );
@@ -337,7 +349,8 @@ export const rocket = commandGroup({
 
 /**
  * The controls of `/rocket report` (kind `rocket`): "Take back" on its answer
- * (`rocket:<report id>:back`: the presser's own, any for staff, answered in the answer's place)
+ * (`rocket:<report id>:back`: the presser's own, any for staff, answered in the answer's place;
+ * by its version, review L1: a report refined in place since is `REPORT_CHANGED` for anyone)
  * and the dialog's Submit (`rocket:<token>:replace`: the grunt reported in the place of the
  * hideout it asked about, decided again; it carries on the use `/rocket report` counted).
  */
@@ -359,12 +372,15 @@ export const rocketControls: ComponentHandler = {
     }
     const serverId = guildIdOf(interaction);
     const staff = isStaff(interaction, ctx);
-    let { removed, notYours } = await ctx.stopReports.takeBack(
+    const taken = await ctx.stopReports.takeBack(
       serverId,
-      [Number(id.id)],
+      [versionOf(Number(id.id), id.args)],
       interaction.user.id,
       staff,
     );
+    // Refined in place since the answer (review L1): its first reporter and staff alike are told.
+    if (taken.changed.length > 0) throw new UserError(REPORT_CHANGED);
+    let { removed, notYours } = taken;
     if (removed.length === 0 && notYours.length === 0) {
       // Gone by its id: a hideout put back under a new id (fix S3) is found by its meaning, the
       // presser's report of the same who at the same stop and day standing now.
diff --git a/src/db/repositories/grunt-message-repository.ts b/src/db/repositories/grunt-message-repository.ts
index 25a46314097306fbb90a970d77f40b98264c8a71..2b64726f20d4b8f8cfe0d555ea8e126d660d7131 100644
--- a/src/db/repositories/grunt-message-repository.ts
+++ b/src/db/repositories/grunt-message-repository.ts
@@ -23,6 +23,11 @@ export interface GruntMessageStorage {
   add(row: GruntMessageRow): Promise<void>;
   /** Forgets a message; nothing happens for one that is not recorded. */
   remove(messageId: string): Promise<void>;
+  /**
+   * Moves when a message is due (plan 8R-4L: a grunt refined in place ends anew); nothing happens
+   * for one that is not recorded.
+   */
+  retime(messageId: string, deleteAt: number): Promise<void>;
   /** Every recorded message, the one due first at the head. */
   all(): Promise<GruntMessageRow[]>;
   /** The messages of a report (one per region channel it was posted in), in their order. */
@@ -50,6 +55,14 @@ export class GruntMessageRepository implements GruntMessageStorage {
     await this.db.deleteFrom('GruntMessage').where('messageId', '=', messageId).execute();
   }
 
+  async retime(messageId: string, deleteAt: number): Promise<void> {
+    await this.db
+      .updateTable('GruntMessage')
+      .set({ deleteAt: String(deleteAt) })
+      .where('messageId', '=', messageId)
+      .execute();
+  }
+
   async all(): Promise<GruntMessageRow[]> {
     const rows = await this.db
       .selectFrom('GruntMessage')
diff --git a/src/services/grunt-messages.test.ts b/src/services/grunt-messages.test.ts
index eaf7ea05887d9071dd384355f08d564286762a31..cb182036a32fcb020c6a7beabbd83e078dab2a17 100644
--- a/src/services/grunt-messages.test.ts
+++ b/src/services/grunt-messages.test.ts
@@ -1,10 +1,21 @@
 import { describe, expect, it } from 'vitest';
-import { FakePartyGateway, missingPermissions } from '../../test/support/fake-gateway.js';
+import {
+  FakePartyGateway,
+  missingPermissions,
+  refusedBody,
+} from '../../test/support/fake-gateway.js';
 import { EAST_CHANNEL, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { heldCall, type HeldCall } from '../../test/support/held-call.js';
 import { textOf } from '../../test/support/messages.js';
 import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
-import { REPORT_NOW, rocketReport } from '../../test/support/stop-report-cases.js';
+import {
+  magikarpLineup,
+  MUDKIP,
+  REPORT_NOW,
+  rocketReport,
+} from '../../test/support/stop-report-cases.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
+import { watchForTest } from '../../test/support/timers.js';
 import type { RocketReport, StopReport } from '../domain/stops/report.js';
 import { GIVE_UP_MS, GruntMessageService } from './grunt-messages.js';
 import type { StopReportListener } from './stop-reports.js';
@@ -26,13 +37,40 @@ function messagesWith() {
   const listeners: StopReportListener[] = [];
   /** Channels where a send fails with this error (Discord answering 500, say). */
   const failSend = new Map<string, Error>();
+  /** Channels where an edit fails with this error (plan 8R-4L). */
+  const failEdit = new Map<string, Error>();
+  /** Sends and edits held per channel (review R1), each taken by the next call there in turn. */
+  const holds = { send: new Map<string, HeldCall[]>(), edit: new Map<string, HeldCall[]>() };
+  /** Holds the next send or edit in a channel until `release`; `reached` once it waits. */
+  const hold = (kind: keyof typeof holds, channelId: string) => {
+    const held = heldCall(`the ${kind} in channel ${channelId}`);
+    holds[kind].set(channelId, [...(holds[kind].get(channelId) ?? []), held]);
+    return held;
+  };
+  /** Every edit asked for, in order, as it was asked (F4, F7): its channel and kind. */
+  const tried: { channelId: string; v2: boolean }[] = [];
+  const waitIn = async (kind: keyof typeof holds, channelId: string) => {
+    const held = holds[kind].get(channelId)?.shift();
+    if (!held) return;
+    held.arrive();
+    await held.released;
+  };
   const service = () => {
     const timers: { run: () => void; ms: number; cancelled: boolean }[] = [];
     const messages = new GruntMessageService({
       gateway: {
-        sendMessage: (channelId, message) => {
+        sendMessage: async (channelId, message) => {
+          await waitIn('send', channelId);
           const err = failSend.get(channelId);
-          return err ? Promise.reject(err) : gateway.sendMessage(channelId, message);
+          if (err) throw err;
+          return gateway.sendMessage(channelId, message);
+        },
+        editMessage: async (channelId, messageId, message) => {
+          tried.push({ channelId, v2: message.v2 === true });
+          await waitIn('edit', channelId);
+          const err = failEdit.get(channelId);
+          if (err) throw err;
+          return gateway.editMessage(channelId, messageId, message);
         },
         deleteMessage: (channelId, messageId) => gateway.deleteMessage(channelId, messageId),
         mayPost: (channelId) => gateway.mayPost(channelId),
@@ -59,7 +97,19 @@ function messagesWith() {
   const ended = (reports: readonly StopReport[]) => {
     for (const listener of listeners) listener.ended?.(reports);
   };
-  return { gateway, store, clock, entries, ended, failSend, ...service(), again: service };
+  return {
+    gateway,
+    store,
+    clock,
+    entries,
+    ended,
+    failSend,
+    failEdit,
+    hold,
+    tried,
+    ...service(),
+    again: service,
+  };
 }
 
 describe('GruntMessageService', () => {
@@ -171,8 +221,11 @@ describe('GruntMessageService', () => {
     expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([posted[0]?.messageId]);
     expect(made.store.rows).toEqual([]);
     // Replaced while its message was being sent: it goes as soon as it is there.
+    const send = made.hold('send', WEST_CHANNEL);
     const sending = made.messages.post(grunt(2), [WEST_CHANNEL]);
+    await send.reached;
     made.ended([grunt(2)]);
+    send.release();
     const late = await sending;
     await made.messages.flush();
     expect(made.gateway.deleted.map((one) => one.messageId)).toContain(late[0]?.messageId);
@@ -183,10 +236,242 @@ describe('GruntMessageService', () => {
     expect(made.gateway.deleted).toHaveLength(2);
   });
 
+  it('edits the messages of a grunt refined in place, keeping them, and deletes them at its new end (plan 8R-4L)', async () => {
+    const made = messagesWith();
+    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
+    const refined: RocketReport = { ...magikarpLineup(), id: 1 };
+    expect(await made.messages.refine(refined)).toEqual({ standing: posted, complete: true });
+    // Edited, not deleted and sent anew: every DM's "Go to report" still finds them.
+    expect(made.gateway.deleted).toEqual([]);
+    for (const channel of [WEST_CHANNEL, EAST_CHANNEL]) {
+      const [message, ...more] = made.gateway.messagesIn(channel);
+      expect(more).toEqual([]);
+      expect(message?.edits).toBe(1);
+      expect(textOf(message?.message)).toContain('### Water-type grunt');
+      expect(textOf(message?.message)).toContain('**Catch** Magikarp');
+      expect(textOf(message?.message)).toContain('Reported by **Misty**');
+    }
+    // Its delete follows the new end.
+    expect(made.store.rows.map((row) => row.deleteAt)).toEqual([refined.endsAt, refined.endsAt]);
+    // The deletes of the first end are cancelled; those of the new end wait.
+    expect(made.timers.filter((timer) => !timer.cancelled).map((timer) => timer.ms)).toEqual([
+      refined.endsAt - REPORT_NOW,
+      refined.endsAt - REPORT_NOW,
+    ]);
+    made.clock.now = refined.endsAt;
+    await made.fire();
+    expect(made.gateway.deleted.map((one) => one.messageId)).toEqual(
+      posted.map((one) => one.messageId),
+    );
+  });
+
+  describe('one report’s posting and refines in turn (reviews R1, R2, R4)', () => {
+    /** The other lineup, by Ash, a minute after Misty's Magikarp lineup. */
+    const mudkips: RocketReport = {
+      ...magikarpLineup({
+        subjectKey: 'grunt:water:female',
+        rocket: { name: 'Water-type grunt', catches: [MUDKIP], lineup: 'Mudkip, Tentacool' },
+        reporter: { id: '200000000000000061', name: 'Ash' },
+        madeAt: REPORT_NOW + 120_000,
+        endsAt: REPORT_NOW + 32 * 60_000,
+      }),
+      id: 1,
+    };
+    const magikarps: RocketReport = { ...magikarpLineup(), id: 1 };
+
+    it('edits and retimes every message of a post still on its way when it is refined', async () => {
+      const made = messagesWith();
+      const east = made.hold('send', EAST_CHANNEL);
+      const posting = made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
+      await east.reached;
+      const refining = made.messages.refine(magikarps);
+      east.release();
+      const posted = await posting;
+      expect(posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL, EAST_CHANNEL]);
+      expect(await refining).toEqual({ standing: posted, complete: true });
+      for (const channel of [WEST_CHANNEL, EAST_CHANNEL]) {
+        const [message] = made.gateway.messagesIn(channel);
+        expect(message?.edits).toBe(1);
+        expect(textOf(message?.message)).toContain('Reported by **Misty**');
+      }
+      expect(made.store.rows.map((row) => row.deleteAt)).toEqual([
+        magikarps.endsAt,
+        magikarps.endsAt,
+      ]);
+    });
+
+    it('edits for a newer refine only once the edit on its way is done, and skips an older one after it (F7)', async () => {
+      const made = messagesWith();
+      const background = watchForTest();
+      await made.messages.post(grunt(1), [WEST_CHANNEL]);
+      const first = made.hold('edit', WEST_CHANNEL);
+      const second = made.hold('edit', WEST_CHANNEL);
+      const older = made.messages.refine(magikarps);
+      const newer = made.messages.refine(mudkips);
+      await first.reached;
+      await background.settle();
+      // The newer refine waits in the report's queue: it has asked for no edit yet.
+      expect(made.tried).toEqual([{ channelId: WEST_CHANNEL, v2: true }]);
+      first.release();
+      await second.reached;
+      second.release();
+      await Promise.all([older, newer]);
+      const shown = () => textOf(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message);
+      expect(shown()).toContain('Reported by **Ash**');
+      expect(made.store.rows.map((row) => row.deleteAt)).toEqual([mudkips.endsAt]);
+      // Misty's refine coming in after Ash's: it is older than what is shown, and is skipped.
+      await made.messages.refine(magikarps);
+      expect(shown()).toContain('Reported by **Ash**');
+      expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.edits).toBe(2);
+    });
+
+    it('neither retimes nor keeps a message whose report was taken back while its edit was on its way', async () => {
+      const made = messagesWith();
+      const [posted] = await made.messages.post(grunt(1), [WEST_CHANNEL]);
+      const edit = made.hold('edit', WEST_CHANNEL);
+      const refining = made.messages.refine(magikarps);
+      await edit.reached;
+      made.ended([magikarps]);
+      edit.release();
+      expect(await refining).toEqual({ standing: [], complete: false });
+      await made.messages.flush();
+      expect(made.gateway.deleted.map((one) => one.messageId)).toEqual([posted?.messageId]);
+      expect(made.store.rows).toEqual([]);
+      expect(made.timers.filter((timer) => !timer.cancelled)).toEqual([]);
+    });
+
+    it('waits at shutdown for an edit on its way, and records its new end without a timer (F5)', async () => {
+      const made = messagesWith();
+      const background = watchForTest();
+      const [posted] = await made.messages.post(grunt(1), [WEST_CHANNEL]);
+      const edit = made.hold('edit', WEST_CHANNEL);
+      const refining = made.messages.refine(magikarps);
+      await edit.reached;
+      let closed = false;
+      const closing = made.messages.close().then(() => {
+        closed = true;
+      });
+      await background.settle();
+      expect(closed).toBe(false);
+      edit.release();
+      await closing;
+      expect(await refining).toEqual({ standing: [posted], complete: true });
+      expect(textOf(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message)).toContain(
+        'Reported by **Misty**',
+      );
+      // The next start's sweep deletes it at the refined end; nothing waits in this process.
+      expect(made.store.rows.map((row) => row.deleteAt)).toEqual([magikarps.endsAt]);
+      expect(made.timers.filter((timer) => !timer.cancelled)).toEqual([]);
+    });
+  });
+
+  describe('a refine’s edit keeps the message’s kind (review R6)', () => {
+    const magikarps: RocketReport = { ...magikarpLineup(), id: 1 };
+
+    it('edits a components-v2 message as one where the bot may no longer embed', async () => {
+      const made = messagesWith();
+      await made.messages.post(grunt(1), [WEST_CHANNEL]);
+      made.gateway.noEmbeds.add(WEST_CHANNEL);
+      await made.messages.refine(magikarps);
+      const [message] = made.gateway.messagesIn(WEST_CHANNEL);
+      expect(message?.edits).toBe(1);
+      expect(message?.message.v2).toBe(true);
+      expect(textOf(message?.message)).toContain('Reported by **Misty**');
+      expect(made.entries.some((entry) => entry.msg === 'could not edit a grunt report')).toBe(
+        false,
+      );
+    });
+
+    it('edits a message sent as plain text as plain text where the bot may embed by now', async () => {
+      const made = messagesWith();
+      made.gateway.noEmbeds.add(WEST_CHANNEL);
+      await made.messages.post(grunt(1), [WEST_CHANNEL]);
+      made.gateway.noEmbeds.delete(WEST_CHANNEL);
+      await made.messages.refine(magikarps);
+      const [message] = made.gateway.messagesIn(WEST_CHANNEL);
+      expect(message?.edits).toBe(1);
+      expect(made.gateway.converted).toEqual([]);
+      expect(message?.message.content).toContain('reported by **Misty**');
+    });
+
+    it('never edits a message known to be components v2 as plain text (F4)', async () => {
+      const made = messagesWith();
+      await made.messages.post(grunt(1), [WEST_CHANNEL]);
+      made.failEdit.set(WEST_CHANNEL, refusedBody('the edit is refused'));
+      await made.messages.refine(magikarps);
+      // Components v2, then without its pictures: never as plain text.
+      expect(made.tried).toEqual([
+        { channelId: WEST_CHANNEL, v2: true },
+        { channelId: WEST_CHANNEL, v2: true },
+      ]);
+      expect(made.entries.some((entry) => entry.msg === 'could not edit a grunt report')).toBe(
+        true,
+      );
+    });
+
+    it('edits a message of an earlier process as the bot may post in its channel, else as the other kind (F4)', async () => {
+      const made = messagesWith();
+      made.gateway.noEmbeds.add(WEST_CHANNEL);
+      await made.messages.post(grunt(1), [WEST_CHANNEL]);
+      const [east] = await made.messages.post(grunt(2), [EAST_CHANNEL]);
+      const next = made.again();
+      // Sent as plain text where the bot may not embed: edited as plain text, never converted.
+      await next.messages.refine(magikarps);
+      expect(made.tried).toEqual([{ channelId: WEST_CHANNEL, v2: false }]);
+      expect(made.gateway.converted).toEqual([]);
+      expect(made.gateway.messagesIn(WEST_CHANNEL)[0]?.message.content).toContain(
+        'reported by **Misty**',
+      );
+      // Sent as components v2 where the bot may no longer embed: plain text is refused, and it
+      // is edited as components v2.
+      made.gateway.noEmbeds.add(EAST_CHANNEL);
+      await next.messages.refine({ ...magikarpLineup(), id: 2 });
+      expect(made.tried.slice(1)).toEqual([
+        { channelId: EAST_CHANNEL, v2: false },
+        { channelId: EAST_CHANNEL, v2: true },
+      ]);
+      const [message] = made.gateway.messagesIn(EAST_CHANNEL);
+      expect(message?.id).toBe(east?.messageId);
+      expect(message?.message.v2).toBe(true);
+      expect(textOf(message?.message)).toContain('Reported by **Misty**');
+    });
+  });
+
+  it('tells every message found gone apart from messages it could not find (F2)', async () => {
+    const made = messagesWith();
+    const refined: RocketReport = { ...magikarpLineup(), id: 1 };
+    const [posted] = await made.messages.post(grunt(1), [WEST_CHANNEL]);
+    made.store.failing.set('ofReport', new Error('the database is away'));
+    expect(await made.messages.refine(refined)).toEqual({ standing: [], complete: false });
+    expect(made.entries.some((entry) => entry.msg === 'could not find a grunt’s messages')).toBe(
+      true,
+    );
+    made.store.failing.delete('ofReport');
+    made.gateway.gone.add(posted?.messageId ?? '');
+    expect(await made.messages.refine(refined)).toEqual({ standing: [], complete: true });
+    expect(made.store.rows).toEqual([]);
+  });
+
+  it('leaves a message whose edit fails as it was, says so, and deletes it at the new end', async () => {
+    const made = messagesWith();
+    const posted = await made.messages.post(grunt(1), [WEST_CHANNEL, EAST_CHANNEL]);
+    made.failEdit.set(EAST_CHANNEL, new Error('500 Internal Server Error'));
+    const refined: RocketReport = { ...magikarpLineup(), id: 1 };
+    expect(await made.messages.refine(refined)).toEqual({ standing: posted, complete: true });
+    const [east] = made.gateway.messagesIn(EAST_CHANNEL);
+    expect(east?.edits).toBe(0);
+    expect(textOf(east?.message)).toContain('Mudkip');
+    expect(made.entries.some((entry) => entry.msg === 'could not edit a grunt report')).toBe(true);
+    expect(made.store.rows.map((row) => row.deleteAt)).toEqual([refined.endsAt, refined.endsAt]);
+  });
+
   it('posts no more of a report that ended while its first message was on its way (fix F3)', async () => {
     const made = messagesWith();
+    const send = made.hold('send', WEST_CHANNEL);
     const sending = made.messages.post(grunt(4), [WEST_CHANNEL, EAST_CHANNEL]);
+    await send.reached;
     made.ended([grunt(4)]);
+    send.release();
     await sending;
     await made.messages.flush();
     // The first channel's message went out and is deleted; the second is never sent.
diff --git a/src/services/grunt-messages.ts b/src/services/grunt-messages.ts
index 0522fcf76a4345b54c7bb84a536e8985a1fd3643..a684558914e9d560940fdf471164c37fbf8faac0 100644
--- a/src/services/grunt-messages.ts
+++ b/src/services/grunt-messages.ts
@@ -9,6 +9,7 @@ import {
 import { isRocketReport, type RocketReport, type StopReport } from '../domain/stops/report.js';
 import type { Logger } from '../log.js';
 import { gruntMessage, gruntTextMessage, type GruntView } from '../render/rocket.js';
+import { KeyedLock } from './keyed-lock.js';
 import { isHideoutReport, type StopReportListener } from './stop-reports.js';
 
 /** A grunt's message in a region channel. */
@@ -17,17 +18,58 @@ export interface PostedGrunt {
   messageId: string;
 }
 
+/**
+ * What came of a refine (fix round 2, F2): the messages that stand, and whether every message of
+ * the report was looked at (`complete`). A complete pass that leaves none found each one gone; an
+ * incomplete one could not tell (its messages could not be read, or the report ended or the
+ * service shut down on the way), and what it gives is only what it knows to stand.
+ */
+export interface RefinedGrunt {
+  standing: PostedGrunt[];
+  complete: boolean;
+}
+
 /** How long after a delete that failed at its time it is tried once more. */
 export const DELETE_AGAIN_MS = 60_000;
 
 /** How long after its time a message that cannot be deleted is still tried at every sweep. */
 export const GIVE_UP_MS = 24 * 60 * 60_000;
 
-/** How many reports that ended early are remembered, for a message still on its way. */
+/**
+ * How many reports that ended early are remembered, for a message still on its way; as many
+ * reports' versions shown and messages' kinds.
+ */
 const ENDED_KEPT = 1_000;
 
+/** How a grunt's message was sent: components v2, or plain text where the bot may not embed. */
+type MessageKind = 'v2' | 'text';
+
+/** What a grunt's message shows of its report: the type's name, never a lineup's gender. */
+function viewOf(report: RocketReport): GruntView {
+  return {
+    name: report.rocket.name,
+    catches: report.rocket.catches,
+    stop: report.stop,
+    reporter: report.reporter,
+  };
+}
+
+/** A view without its pictures, for a message Discord refused for them. */
+function withoutPictures(view: GruntView): GruntView {
+  return {
+    ...view,
+    catches: view.catches.map((one) => ({ ...one, image: null })),
+    stop: { ...view.stop, image: null },
+  };
+}
+
+/** A grunt's message of a kind: components v2, or plain text where the bot may not embed. */
+function made(kind: MessageKind, view: GruntView, goneAt: number): OutgoingMessage {
+  return kind === 'v2' ? gruntMessage(view, goneAt) : gruntTextMessage(view, goneAt);
+}
+
 export interface GruntMessageServiceOptions {
-  gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage' | 'mayPost'>;
+  gateway: Pick<PartyGateway, 'sendMessage' | 'editMessage' | 'deleteMessage' | 'mayPost'>;
   store: GruntMessageStorage;
   /** The reports at stops: a grunt that ended early (replaced, taken back) is deleted at once. */
   reports: { listen(listener: StopReportListener): void };
@@ -48,7 +90,8 @@ export interface GruntMessageServiceOptions {
  * at once when it ends early (a newer report at the stop, taken back: `ended`). Every message
  * is recorded (`GruntMessageStorage`) until it is deleted; `sweep` (at start and hourly) takes
  * up what is recorded and does not wait in this process. A delete that fails is tried once more
- * a minute later, then by the sweeps until a day after its time.
+ * a minute later, then by the sweeps until a day after its time. A grunt refined in place (plan
+ * 8R-4L: a lineup of its type) has its messages edited and their delete moved (`refine`).
  *
  * Unlike spawn reports, a shutdown deletes nothing (`close`): the report stands on through a
  * restart, and so does its message; the next start's sweep deletes what is overdue then.
@@ -64,6 +107,21 @@ export class GruntMessageService {
   private readonly removing = new Set<string>();
   /** The reports that ended early (by id): a message of one still on its way goes at once. */
   private readonly endedEarly = new BoundedMap<number, true>(ENDED_KEPT);
+  /**
+   * A report's posting, refines and end, one after the other per report id (review R1): a refine
+   * finds every message its posting sent, and an end every message a refine kept.
+   */
+  private readonly turns = new KeyedLock<number>();
+  /**
+   * The newest version (`madeAt`) of each report its messages show (review R2): a refine of an
+   * older one that comes after it is not shown.
+   */
+  private readonly shown = new BoundedMap<number, number>(ENDED_KEPT);
+  /**
+   * How each message was sent (review R6): an edit keeps it so, whatever the bot may do in its
+   * channel by then. A message of an earlier process is guessed by the rule `send` used (F4).
+   */
+  private readonly sentAs = new BoundedMap<string, MessageKind>(ENDED_KEPT);
   private closed = false;
 
   constructor(private readonly options: GruntMessageServiceOptions) {
@@ -89,16 +147,20 @@ export class GruntMessageService {
    * ends; gives the messages posted and recorded. Never rejects (fix A1): a channel where the bot
    * may not post, one that is gone, and any other failure (Discord's 5xx, a time-out) is passed
    * over and logged, and the next channel is posted; a message that cannot be recorded is
-   * deleted at once (nothing would delete it after a restart) and counts as not posted.
+   * deleted at once (nothing would delete it after a restart) and counts as not posted. In turn
+   * with the report's refines and end (review R1).
    */
-  async post(report: RocketReport, channelIds: readonly string[]): Promise<PostedGrunt[]> {
+  post(report: RocketReport, channelIds: readonly string[]): Promise<PostedGrunt[]> {
+    return this.turns.run(report.id, () => this.postNow(report, channelIds));
+  }
+
+  private async postNow(
+    report: RocketReport,
+    channelIds: readonly string[],
+  ): Promise<PostedGrunt[]> {
     const posted: PostedGrunt[] = [];
-    const view: GruntView = {
-      name: report.rocket.name,
-      catches: report.rocket.catches,
-      stop: report.stop,
-      reporter: report.reporter,
-    };
+    const view = viewOf(report);
+    this.shown.set(report.id, Math.max(this.shown.get(report.id) ?? 0, report.madeAt));
     for (const channelId of channelIds) {
       // Ended meanwhile (replaced, taken back): nothing more of it is sent (fix F3).
       if (this.closed || this.endedEarly.has(report.id)) break;
@@ -127,6 +189,78 @@ export class GruntMessageService {
     return posted;
   }
 
+  /**
+   * Shows a grunt refined in place (plan 8R-4L, Matt's B2: a lineup of its type over "not sure
+   * which" or over the other lineup, the report's id kept) in the messages it has: each edited
+   * where it stands, keeping its id, so that every DM's "Go to report" still finds it, and deleted
+   * at the report's new end. A message whose edit fails stays as it was and is logged, and its
+   * delete follows the new end all the same; one that is gone is forgotten. Gives the messages
+   * that stand, and whether every message was looked at (`RefinedGrunt`, F2). Never rejects. In
+   * turn with the report's posting, other refines and end (review R1): it edits every message its
+   * posting sent. A refine older (`madeAt`) than what the messages show already edits nothing
+   * (review R2), and gives the messages as they stand, not looked at.
+   */
+  refine(report: RocketReport): Promise<RefinedGrunt> {
+    return this.turns.run(report.id, () => this.refineNow(report));
+  }
+
+  private async refineNow(report: RocketReport): Promise<RefinedGrunt> {
+    const { log } = this.options;
+    let messages: PostedGrunt[];
+    try {
+      messages = await this.messagesOf(report.id);
+    } catch (err) {
+      log.warn({ err, report: report.id }, 'could not find a grunt’s messages');
+      return { standing: [], complete: false };
+    }
+    const newest = this.shown.get(report.id);
+    if (newest !== undefined && report.madeAt < newest) {
+      return { standing: messages, complete: false };
+    }
+    this.shown.set(report.id, report.madeAt);
+    const view = viewOf(report);
+    const standing: PostedGrunt[] = [];
+    // Ended meanwhile (replaced, taken back): its messages go, nothing more is edited, retimed or
+    // kept; also where it ended while an edit was on its way (review R4). At shutdown nothing
+    // more is edited, but an edit made is recorded (F5).
+    const ended = () => this.endedEarly.has(report.id);
+    // A message whose delete is on its way is passed over: whether it goes is not known here.
+    let complete = true;
+    for (const { channelId, messageId } of messages) {
+      if (this.closed || ended()) return { standing, complete: false };
+      if (this.removing.has(messageId)) {
+        complete = false;
+        continue;
+      }
+      try {
+        if (!(await this.edit(channelId, messageId, view, report.endsAt))) {
+          await this.forget(channelId, messageId);
+          continue;
+        }
+      } catch (err) {
+        log.warn(
+          { err, guild: report.serverId, channel: channelId },
+          'could not edit a grunt report',
+        );
+      }
+      if (ended()) return { standing, complete: false };
+      if (this.removing.has(messageId)) {
+        complete = false;
+        continue;
+      }
+      try {
+        await this.options.store.retime(messageId, report.endsAt);
+      } catch (err) {
+        // The timer below deletes it in this process; a restart's sweep, at its first end.
+        log.warn({ err, channel: channelId }, 'could not record a grunt report’s new end');
+      }
+      // No timer once shut down (`deleteLater`): the next start's sweep deletes it at its end.
+      this.deleteLater(channelId, messageId, Math.max(0, report.endsAt - this.now()), true);
+      standing.push({ channelId, messageId });
+    }
+    return { standing, complete };
+  }
+
   /** Deletes a message now; one whose delete fails is tried once more a minute later (fix A3). */
   private removeNow(channelId: string, messageId: string): void {
     this.track(
@@ -173,22 +307,52 @@ export class GruntMessageService {
     goneAt: number,
   ): Promise<string | undefined> {
     const { gateway, log } = this.options;
-    const make = (shown: GruntView): OutgoingMessage =>
-      gateway.mayPost(channelId) ? gruntMessage(shown, goneAt) : gruntTextMessage(shown, goneAt);
+    const kind: MessageKind = gateway.mayPost(channelId) ? 'v2' : 'text';
+    let messageId: string | undefined;
     try {
-      return await gateway.sendMessage(channelId, make(view));
+      messageId = await gateway.sendMessage(channelId, made(kind, view, goneAt));
     } catch (err) {
       if (!isRefusedBody(err)) throw err;
       log.warn({ err, channel: channelId }, 'Discord refused the pictures of a grunt report');
-      return gateway.sendMessage(
-        channelId,
-        make({
-          ...view,
-          catches: view.catches.map((one) => ({ ...one, image: null })),
-          stop: { ...view.stop, image: null },
-        }),
-      );
+      messageId = await gateway.sendMessage(channelId, made(kind, withoutPictures(view), goneAt));
     }
+    if (messageId !== undefined) this.sentAs.set(messageId, kind);
+    return messageId;
+  }
+
+  /**
+   * Edits a grunt's message into a view (plan 8R-4L) of the kind it was sent as (review R6), never
+   * by what the bot may do in its channel now: Discord keeps a components-v2 message so. Where
+   * Discord refuses the edit for what it holds, components v2 is tried once more without its
+   * pictures. A message known to be components v2 is never edited as plain text (F4); one sent
+   * as plain text is tried as components v2 after. A message of an earlier process, whose kind is
+   * not known, is guessed by the rule `send` used (`mayPost`: components v2, else plain text),
+   * then tried as the other kind. False where the message is gone.
+   */
+  private async edit(
+    channelId: string,
+    messageId: string,
+    view: GruntView,
+    goneAt: number,
+  ): Promise<boolean> {
+    const { gateway, log } = this.options;
+    const known = this.sentAs.get(messageId);
+    const asV2 = [made('v2', view, goneAt), made('v2', withoutPictures(view), goneAt)];
+    const asText = made('text', view, goneAt);
+    const first: MessageKind = known ?? (gateway.mayPost(channelId) ? 'v2' : 'text');
+    const tries: OutgoingMessage[] =
+      first === 'text' ? [asText, ...asV2] : known === 'v2' ? asV2 : [...asV2, asText];
+    for (const [n, message] of tries.entries()) {
+      try {
+        const edited = await gateway.editMessage(channelId, messageId, message);
+        if (edited) this.sentAs.set(messageId, message.v2 === true ? 'v2' : 'text');
+        return edited;
+      } catch (err) {
+        if (!isRefusedBody(err) || n === tries.length - 1) throw err;
+        log.warn({ err, channel: channelId }, 'Discord refused the edit of a grunt report');
+      }
+    }
+    return false;
   }
 
   /** Records a message; whether it was. Never rejects (the failure is logged). */
@@ -215,24 +379,32 @@ export class GruntMessageService {
     }
   }
 
-  /** The reports that ended early: the messages of the grunts among them are deleted now. */
+  /**
+   * The reports that ended early: the messages of the grunts among them are deleted now, once
+   * the posting or refine on its way has settled (review R1), which sends and edits no more.
+   */
   private ended(reports: readonly StopReport[]): void {
     for (const report of reports) {
       if (!isRocketReport(report) || isHideoutReport(report)) continue;
       this.endedEarly.set(report.id, true);
       this.track(
-        this.messagesOf(report.id).then(
-          (messages) => {
-            for (const { channelId, messageId } of messages) {
-              this.waiting.get(messageId)?.cancel();
-              this.waiting.delete(messageId);
-              if (!this.removing.has(messageId)) this.removeNow(channelId, messageId);
-            }
-          },
-          (err: unknown) => {
-            this.options.log.warn({ err, report: report.id }, 'could not find a grunt’s messages');
-          },
-        ),
+        this.turns
+          .run(report.id, () => this.messagesOf(report.id))
+          .then(
+            (messages) => {
+              for (const { channelId, messageId } of messages) {
+                this.waiting.get(messageId)?.cancel();
+                this.waiting.delete(messageId);
+                if (!this.removing.has(messageId)) this.removeNow(channelId, messageId);
+              }
+            },
+            (err: unknown) => {
+              this.options.log.warn(
+                { err, report: report.id },
+                'could not find a grunt’s messages',
+              );
+            },
+          ),
       );
     }
   }
@@ -264,8 +436,12 @@ export class GruntMessageService {
     return taken;
   }
 
-  /** Has a message deleted after `ms`; one that fails then is tried once more (`again`). */
+  /**
+   * Has a message deleted after `ms`; one that fails then is tried once more (`again`). Nothing
+   * once shut down (F5): the next start's sweep takes up what is recorded.
+   */
   private deleteLater(channelId: string, messageId: string, ms: number, again: boolean): void {
+    if (this.closed) return;
     const cancel = this.setTimer(() => {
       this.waiting.delete(messageId);
       this.track(
@@ -315,13 +491,16 @@ export class GruntMessageService {
   }
 
   /**
-   * For shutdown: posts no more, cancels the timers and waits for the deletes on their way.
-   * What still stands is deleted by the next start's sweep (the report stands on as well).
+   * For shutdown: posts and edits no more, cancels the timers, and waits for the postings,
+   * refines and ends on their way (F5: an edit made is recorded with its new end, without a
+   * timer) and the deletes. What still stands is deleted by the next start's sweep (the report
+   * stands on as well).
    */
   async close(): Promise<void> {
     this.closed = true;
     for (const { cancel } of this.waiting.values()) cancel();
     this.waiting.clear();
+    await this.turns.whenIdle();
     await this.flush();
   }
 }
diff --git a/src/services/rocket-reports.test.ts b/src/services/rocket-reports.test.ts
index e3a68fed2893a9670cfcac04ae66b0d2db5763f6..32d3cf1f3266e1f4ff8056b9e3126bed2d71b49c 100644
--- a/src/services/rocket-reports.test.ts
+++ b/src/services/rocket-reports.test.ts
@@ -2,13 +2,16 @@ import { describe, expect, it } from 'vitest';
 import { FakePartyGateway } from '../../test/support/fake-gateway.js';
 import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
 import { EAST_CHANNEL, testRegions, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { heldCall, type HeldCall } from '../../test/support/held-call.js';
 import { textOf } from '../../test/support/messages.js';
 import { feedChoice } from '../../test/support/rocket.js';
 import { MemoryGruntMessages } from '../../test/support/rocket-store.js';
 import { REPORT_NOW, reportedStop } from '../../test/support/stop-report-cases.js';
 import { MemoryStopReports } from '../../test/support/stop-reports.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
+import { lineupChoice } from '../domain/rocket/lineups.js';
 import { rocketDay } from '../domain/rocket/reports.js';
+import type { RocketReport } from '../domain/stops/report.js';
 import { GruntMessageService } from './grunt-messages.js';
 import { RocketService, rocketSubject, type RocketNews } from './rocket-reports.js';
 import { StopReportService } from './stop-reports.js';
@@ -38,12 +41,28 @@ function rocketWith(options: { rehearsal?: boolean; overlap?: boolean } = {}) {
     /** Run once while a send that succeeds is on its way (fix F3). */
     duringSend?: () => Promise<unknown>;
     guildsFail?: Error;
+    /** Called as the service asks for a grunt's messages to be refined (review R1). */
+    refining?: () => void;
   } = {};
-  const messages = options.rehearsal
+  /** The next send in a channel, held until the test releases it (review R1). */
+  const heldSends = new Map<string, HeldCall>();
+  const holdSend = (channelId: string): HeldCall => {
+    const held = heldCall(`the send in channel ${channelId}`);
+    heldSends.set(channelId, held);
+    return held;
+  };
+  const gruntStore = new MemoryGruntMessages();
+  const service = options.rehearsal
     ? undefined
     : new GruntMessageService({
         gateway: {
           sendMessage: async (channelId, message) => {
+            const held = heldSends.get(channelId);
+            if (held) {
+              heldSends.delete(channelId);
+              held.arrive();
+              await held.released;
+            }
             const err = failSend.get(channelId);
             if (!err) {
               const during = hooks.duringSend;
@@ -55,15 +74,26 @@ function rocketWith(options: { rehearsal?: boolean; overlap?: boolean } = {}) {
             await hooks.beforeFail?.();
             throw err;
           },
+          editMessage: (channelId, messageId, message) =>
+            gateway.editMessage(channelId, messageId, message),
           deleteMessage: (channelId, messageId) => gateway.deleteMessage(channelId, messageId),
           mayPost: (channelId) => gateway.mayPost(channelId),
         },
-        store: new MemoryGruntMessages(),
+        store: gruntStore,
         reports,
         log,
         now: () => clock.now,
         setTimer: () => () => undefined,
       });
+  const messages = service && {
+    post: service.post.bind(service),
+    messagesOf: service.messagesOf.bind(service),
+    flush: service.flush.bind(service),
+    refine: (report: RocketReport) => {
+      hooks.refining?.();
+      return service.refine(report);
+    },
+  };
   const told: RocketNews[] = [];
   const rocket = new RocketService({
     reports,
@@ -94,7 +124,32 @@ function rocketWith(options: { rehearsal?: boolean; overlap?: boolean } = {}) {
       reporter: more.by ?? ASH,
       ...(more.replacing === undefined ? {} : { replacing: more.replacing }),
     });
-  return { clock, gateway, reports, messages, rocket, told, report, failSend, hooks };
+  /** Misty (unless said) reports the water grunt's Magikarp lineup at West, a refine of its type. */
+  const refine = (by = MISTY) => {
+    const water = feedChoice('grunt:water');
+    const magikarps = water.lineups?.[1];
+    if (!magikarps) throw new Error('the water grunt has two lineups');
+    return rocket.report({
+      serverId: FAKE_GUILD_ID,
+      stop: WEST,
+      subject: rocketSubject(lineupChoice(water, magikarps)),
+      reporter: by,
+    });
+  };
+  return {
+    clock,
+    gateway,
+    reports,
+    messages,
+    gruntStore,
+    rocket,
+    told,
+    report,
+    refine,
+    failSend,
+    hooks,
+    holdSend,
+  };
 }
 
 describe('RocketService', () => {
@@ -312,6 +367,187 @@ describe('RocketService', () => {
     expect(made.told).toHaveLength(1);
   });
 
+  it('refines a grunt by a lineup of its type in place: its messages edited, told again (plan 8R-4L)', async () => {
+    const made = rocketWith({ overlap: true });
+    const first = await made.report('grunt:water');
+    if (first.kind !== 'reported') throw new Error(first.kind);
+    const water = feedChoice('grunt:water');
+    const [, magikarps] = water.lineups ?? [];
+    if (!magikarps) throw new Error('the water grunt has two lineups');
+    const refined = await made.rocket.report({
+      serverId: FAKE_GUILD_ID,
+      stop: WEST,
+      subject: rocketSubject(lineupChoice(water, magikarps)),
+      reporter: MISTY,
+    });
+    expect(refined).toMatchObject({
+      kind: 'reported',
+      report: { id: first.report.id, subjectKey: 'grunt:water:male', reporter: MISTY },
+      replaced: first.report,
+      channels: first.channels,
+      posted: first.posted,
+    });
+    await made.messages?.flush();
+    // The same messages, edited; none deleted or sent anew.
+    expect(made.gateway.deleted).toEqual([]);
+    for (const channel of [WEST_CHANNEL, EAST_CHANNEL]) {
+      const [message, ...more] = made.gateway.messagesIn(channel);
+      expect(more).toEqual([]);
+      expect(message?.edits).toBe(1);
+      expect(textOf(message?.message)).toContain('**Catch** one of Magikarp, Feebas');
+    }
+    // Told as a new report, with its messages (the hour per type keeps a second DM away).
+    expect(made.told).toHaveLength(2);
+    expect(made.told[1]).toEqual({
+      serverId: FAKE_GUILD_ID,
+      report: refined.kind === 'reported' ? refined.report : undefined,
+      channels: first.posted,
+    });
+  });
+
+  it('tells once, of the refined grunt, when it is refined while its messages are posted (R1, R2)', async () => {
+    const made = rocketWith({ overlap: true });
+    const east = made.holdSend(EAST_CHANNEL);
+    const first = made.report('grunt:water');
+    await east.reached;
+    const queued = new Promise<void>((resolve) => {
+      made.hooks.refining = resolve;
+    });
+    made.clock.now += 60_000;
+    const refining = made.refine();
+    await queued;
+    east.release();
+    const [answered, refined] = await Promise.all([first, refining]);
+    await made.messages?.flush();
+    if (refined.kind !== 'reported') throw new Error(refined.kind);
+    expect(refined.report.subjectKey).toBe('grunt:water:male');
+    // The first reporter is answered with the report as it stands now.
+    expect(answered).toMatchObject({ kind: 'reported', report: refined.report });
+    // Both messages edited and retimed.
+    for (const channel of [WEST_CHANNEL, EAST_CHANNEL]) {
+      const [message, ...more] = made.gateway.messagesIn(channel);
+      expect(more).toEqual([]);
+      expect(message?.edits).toBe(1);
+      expect(textOf(message?.message)).toContain('**Catch** one of Magikarp, Feebas');
+    }
+    expect(made.gruntStore.rows.map((row) => row.deleteAt)).toEqual([
+      refined.report.endsAt,
+      refined.report.endsAt,
+    ]);
+    // One DM round, of the refined report, with both messages.
+    expect(made.told).toEqual([
+      {
+        serverId: FAKE_GUILD_ID,
+        report: refined.report,
+        channels: refined.posted,
+      },
+    ]);
+    expect(refined.posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL, EAST_CHANNEL]);
+  });
+
+  it('shows, keeps and tells one version where a refine of an older clock lands after the report (F1)', async () => {
+    const made = rocketWith();
+    const first = await made.report('grunt:water');
+    if (first.kind !== 'reported') throw new Error(first.kind);
+    // Misty's refine read a clock half a minute behind Ash's report, and is written after it.
+    made.clock.now = REPORT_NOW - 30_000;
+    const refined = await made.refine();
+    if (refined.kind !== 'reported') throw new Error(refined.kind);
+    await made.messages?.flush();
+    // The version written is a millisecond newer than Ash's, its half hour kept.
+    expect(refined.report).toMatchObject({
+      id: first.report.id,
+      madeAt: first.report.madeAt + 1,
+      endsAt: first.report.madeAt + 1 + 30 * 60_000,
+      reporter: MISTY,
+    });
+    // The stored row, the message and the DM are all of it.
+    expect(await made.reports.kept(FAKE_GUILD_ID, first.report.id)).toEqual(refined.report);
+    const [message] = made.gateway.messagesIn(WEST_CHANNEL);
+    expect(message?.edits).toBe(1);
+    expect(textOf(message?.message)).toContain('**Catch** one of Magikarp, Feebas');
+    expect(made.gruntStore.rows.map((row) => row.deleteAt)).toEqual([refined.report.endsAt]);
+    expect(made.told.map((news) => news.report)).toEqual([first.report, refined.report]);
+  });
+
+  it('says a grunt posted nowhere while it was refined was overtaken, and tells nobody (F9)', async () => {
+    const made = rocketWith();
+    made.failSend.set(WEST_CHANNEL, new Error('503 Service Unavailable'));
+    // Misty refines Ash's grunt while its only send is on its way, and the send fails.
+    let refining: ReturnType<typeof made.refine> | undefined;
+    const queued = new Promise<void>((resolve) => {
+      made.hooks.refining = resolve;
+    });
+    made.hooks.beforeFail = () => {
+      made.clock.now += 60_000;
+      refining = made.refine();
+      return queued;
+    };
+    expect(await made.report('grunt:water')).toEqual({
+      kind: 'overtaken',
+      channels: [WEST_CHANNEL],
+    });
+    // The refine finds no message of it either: it is taken back, Ash's grunt named as lost.
+    expect(await refining).toMatchObject({ kind: 'unposted', lost: { subjectKey: 'grunt:water' } });
+    expect(made.told).toEqual([]);
+    expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([]);
+  });
+
+  it('takes a refined grunt back whose messages are all gone, naming what is lost (R5)', async () => {
+    const made = rocketWith();
+    const first = await made.report('grunt:water');
+    if (first.kind !== 'reported') throw new Error(first.kind);
+    for (const { messageId } of first.posted) made.gateway.gone.add(messageId);
+    expect(await made.refine()).toEqual({
+      kind: 'unposted',
+      channels: [WEST_CHANNEL],
+      lost: first.report,
+    });
+    expect(await made.reports.standing(FAKE_GUILD_ID)).toEqual([]);
+    expect(made.told).toHaveLength(1);
+  });
+
+  it('keeps a refined grunt whose messages could not be found, and tells with what stands (F2)', async () => {
+    const made = rocketWith();
+    const first = await made.report('grunt:water');
+    if (first.kind !== 'reported') throw new Error(first.kind);
+    made.gruntStore.failing.set('ofReport', new Error('the database is away'));
+    const refined = await made.refine();
+    made.gruntStore.failing.delete('ofReport');
+    // Not known to be gone: no undo, the refined report stands.
+    expect(refined).toMatchObject({
+      kind: 'reported',
+      report: { id: first.report.id, subjectKey: 'grunt:water:male' },
+      channels: [WEST_CHANNEL],
+      posted: [],
+    });
+    expect(await made.reports.standing(FAKE_GUILD_ID)).toMatchObject([
+      { id: first.report.id, subjectKey: 'grunt:water:male' },
+    ]);
+    // Told with the messages known to stand: none.
+    expect(made.told.map((news) => [news.report.subjectKey, news.channels])).toEqual([
+      ['grunt:water', [{ channelId: WEST_CHANNEL, messageId: first.posted[0]?.messageId }]],
+      ['grunt:water:male', []],
+    ]);
+  });
+
+  it('refines in rehearsal mode, telling with the region channels (R5)', async () => {
+    const made = rocketWith({ rehearsal: true });
+    const first = await made.report('grunt:water');
+    if (first.kind !== 'reported') throw new Error(first.kind);
+    const refined = await made.refine();
+    expect(refined).toMatchObject({
+      kind: 'reported',
+      report: { id: first.report.id, subjectKey: 'grunt:water:male' },
+      posted: [],
+      channels: [WEST_CHANNEL],
+    });
+    expect(made.told.map((news) => [news.report.subjectKey, news.channels])).toEqual([
+      ['grunt:water', [{ channelId: WEST_CHANNEL, messageId: undefined }]],
+      ['grunt:water:male', [{ channelId: WEST_CHANNEL, messageId: undefined }]],
+    ]);
+  });
+
   it('deletes the message of the grunt another one replaces', async () => {
     const made = rocketWith();
     const first = await made.report('grunt:water');
diff --git a/src/services/rocket-reports.ts b/src/services/rocket-reports.ts
index d7b3466555aa0bfa2699f1945ab1a45cc86ece49..2790aaa39f8e66bec4172690d5130ec7ba7b4d94 100644
--- a/src/services/rocket-reports.ts
+++ b/src/services/rocket-reports.ts
@@ -1,6 +1,11 @@
 import type { Region } from '../db/repositories/region-repository.js';
 import type { RocketChoice } from '../domain/rocket/lineups.js';
-import type { Reporter, ReportedStop, RocketReport } from '../domain/stops/report.js';
+import {
+  isRocketReport,
+  type Reporter,
+  type ReportedStop,
+  type RocketReport,
+} from '../domain/stops/report.js';
 import type { Logger } from '../log.js';
 import type { GruntMessageService, PostedGrunt } from './grunt-messages.js';
 import { regionsAtPoint } from './region-directory.js';
@@ -44,7 +49,8 @@ export type RocketReported =
     }
   /**
    * A grunt that ended while its messages were being posted (a newer report at the stop, or
-   * taken back): nobody is told, its messages are deleted (fix F3).
+   * taken back): nobody is told, its messages are deleted (fix F3). Also one refined in place
+   * meanwhile that was posted nowhere (F9): the refine answers for what stands.
    */
   | { kind: 'overtaken'; channels: string[] }
   /** A hideout stands today: the member is asked first (design 5.2). */
@@ -66,9 +72,9 @@ export function rocketSubject(choice: RocketChoice): RocketSubject {
 }
 
 export interface RocketServiceOptions {
-  reports: Pick<StopReportService, 'reportRocket' | 'takeBack' | 'restore' | 'isKept'>;
+  reports: Pick<StopReportService, 'reportRocket' | 'takeBack' | 'restore' | 'kept'>;
   /** The grunts' messages; none in rehearsal mode, which posts nothing outside party posts. */
-  messages: Pick<GruntMessageService, 'post' | 'messagesOf'> | undefined;
+  messages: Pick<GruntMessageService, 'post' | 'refine' | 'messagesOf'> | undefined;
   regions: { all(): readonly Region[] };
   /** The row of a server in `Guild` (its regions name it so), by its snowflake. */
   guilds: { idFor(serverId: string): Promise<number | undefined> };
@@ -110,7 +116,7 @@ export class RocketService {
     reporter: Reporter;
     replacing?: number;
   }): Promise<RocketReported> {
-    const { messages, notify, log } = this.options;
+    const { messages, log } = this.options;
     const outcome = await this.options.reports.reportRocket(input);
     if (outcome.kind === 'asks') return outcome;
     if (outcome.kind === 'already') {
@@ -122,6 +128,7 @@ export class RocketService {
       );
       return { ...outcome, posted };
     }
+    if (outcome.kind === 'refined') return this.refined(input.serverId, outcome);
     const { report } = outcome;
     const grunt = !isHideoutReport(report);
     let channels: string[];
@@ -134,30 +141,79 @@ export class RocketService {
       throw err;
     }
     const posted = grunt && messages ? await messages.post(report, channels) : [];
-    if (grunt && messages && !(await this.stands(report))) {
+    if (grunt && messages) {
+      const now = await this.asNow(report);
       // Replaced or taken back while it was posted: its messages go, and nobody is told.
-      return { kind: 'overtaken', channels };
+      if (!now) return { kind: 'overtaken', channels };
+      // Refined meanwhile (review R2): the refine edits the messages and tells. The member is
+      // answered with the report as it stands, unless it was posted nowhere: then the refine
+      // finds no message either, and the member's grunt was overtaken (F9).
+      if (now !== report) {
+        if (posted.length === 0) return { kind: 'overtaken', channels };
+        return { kind: 'reported', report: now, replaced: outcome.replaced, channels, posted };
+      }
     }
     if (grunt && messages && channels.length > 0 && posted.length === 0) {
       return { kind: 'unposted', channels, ...(await this.undo(report, outcome.replaced)) };
     }
     // Outside rehearsal mode a grunt's DMs name the channels it was posted in (fix R3).
     const told = grunt && messages ? posted.map((one) => one.channelId) : channels;
-    if (outcome.news) {
-      try {
-        notify?.rocketReported({
-          serverId: input.serverId,
-          report,
-          channels: told.map((channelId) => ({
-            channelId,
-            messageId: posted.find((one) => one.channelId === channelId)?.messageId,
-          })),
-        });
-      } catch (err) {
-        log.error({ err, guild: input.serverId }, 'could not tell of a Rocket report');
+    if (outcome.news) this.tell(report, told, posted);
+    return { kind: 'reported', report, replaced: outcome.replaced, channels, posted };
+  }
+
+  /**
+   * A grunt refined in place (plan 8R-4L, Matt's B2): its messages edited (their ids kept, so
+   * every DM's "Go to report" still finds them), then the notifier told as of a new report; the
+   * hour per grunt type keeps a second DM from anyone told of the type already. Answered as a
+   * report, `replaced` what it refined. Nothing to take back where the edits fail: the messages
+   * stand as they were.
+   */
+  private async refined(
+    serverId: string,
+    outcome: { report: RocketReport; replaced: RocketReport },
+  ): Promise<RocketReported> {
+    const { messages, log } = this.options;
+    const { report, replaced } = outcome;
+    const edited = messages ? await messages.refine(report) : undefined;
+    const posted = edited?.standing ?? [];
+    let channels: string[];
+    try {
+      channels = await this.channelsAt(serverId, report.stop);
+    } catch (err) {
+      log.warn({ err, guild: serverId }, 'could not find the region channels of a Rocket report');
+      channels = posted.map((one) => one.channelId);
+    }
+    if (messages) {
+      const now = await this.asNow(report);
+      if (!now) return { kind: 'overtaken', channels };
+      // Refined again meanwhile (review R2): that refine tells.
+      if (now !== report) return { kind: 'reported', report: now, replaced, channels, posted };
+      // Its messages all found gone (review R5): unseen, it is taken back as a grunt posted
+      // nowhere is, and what it refined is lost with it. Where the refine could not tell (F2:
+      // its messages could not be read, or it stopped on the way), it is told with what stands.
+      if (edited?.complete === true && channels.length > 0 && posted.length === 0) {
+        return { kind: 'unposted', channels, ...(await this.undo(report, replaced)) };
       }
     }
-    return { kind: 'reported', report, replaced: outcome.replaced, channels, posted };
+    this.tell(report, messages ? posted.map((one) => one.channelId) : channels, posted);
+    return { kind: 'reported', report, replaced, channels, posted };
+  }
+
+  /** Tells the notifier of a report in these channels, with its messages there. */
+  private tell(report: RocketReport, channels: readonly string[], posted: PostedGrunt[]): void {
+    try {
+      this.options.notify?.rocketReported({
+        serverId: report.serverId,
+        report,
+        channels: channels.map((channelId) => ({
+          channelId,
+          messageId: posted.find((one) => one.channelId === channelId)?.messageId,
+        })),
+      });
+    } catch (err) {
+      this.options.log.error({ err, guild: report.serverId }, 'could not tell of a Rocket report');
+    }
   }
 
   /**
@@ -186,22 +242,28 @@ export class RocketService {
   }
 
   /**
-   * Whether a report is still kept (not replaced or taken back), read anew after its messages
-   * were posted (fix F3); one that cannot be read is taken as kept (the failure is logged).
+   * A report as it is kept now, read anew after its messages were posted or edited (fix F3):
+   * undefined where it is no longer kept (replaced or taken back); `report` itself while it is
+   * kept unchanged, its id and `madeAt` (review L1); the report as it stands where it was
+   * refined in place since. One that cannot be read is taken as kept (the failure is logged).
    */
-  private async stands(report: RocketReport): Promise<boolean> {
+  private async asNow(report: RocketReport): Promise<RocketReport | undefined> {
     try {
-      return await this.options.reports.isKept(report.serverId, report.id);
+      const kept = await this.options.reports.kept(report.serverId, report.id);
+      if (!kept || !isRocketReport(kept)) return undefined;
+      return kept.madeAt === report.madeAt ? report : kept;
     } catch (err) {
       this.options.log.warn({ err, report: report.id }, 'could not read a Rocket report again');
-      return true;
+      return report;
     }
   }
 
   /** Takes a report back that shows nowhere; a failure is logged (its row ends with its time). */
   private async takeBack(report: RocketReport): Promise<void> {
     try {
-      await this.options.reports.takeBack(report.serverId, [report.id], report.reporter.id, true);
+      // By its version (review L1): a refine meanwhile is not taken back with it.
+      const version = { id: report.id, madeAt: report.madeAt };
+      await this.options.reports.takeBack(report.serverId, [version], report.reporter.id, true);
     } catch (err) {
       this.options.log.warn({ err, report: report.id }, 'could not take back a Rocket report');
     }
diff --git a/src/services/stop-reports.test.ts b/src/services/stop-reports.test.ts
index abd1e2739d4997f20565359ba14e69b3e5bfa751..044cff5f8db007113b6cdaf4194821edc0ebc856 100644
--- a/src/services/stop-reports.test.ts
+++ b/src/services/stop-reports.test.ts
@@ -3,6 +3,7 @@ import { describe, expect, it } from 'vitest';
 import { PAWNIARD_DAY } from '../../test/support/research-store-cases.js';
 import {
   DRATINI,
+  MAGIKARP,
   MUDKIP,
   OTHER_REPORTER,
   REPORT_SERVER,
@@ -149,6 +150,7 @@ describe('StopReportService', () => {
     expect(await service.takeBack('100000000000000009', [one!], REPORTER.id, false)).toEqual({
       removed: [],
       notYours: [],
+      changed: [],
     });
     expect(
       (await service.takeBack(REPORT_SERVER, [one!], REPORTER.id, false)).removed.map((r) => r.id),
@@ -222,6 +224,103 @@ describe('StopReportService', () => {
       expect(await rocket(service, WATER)).toMatchObject({ kind: 'reported', news: true });
     });
 
+    it('refines a grunt by a lineup of its type in place: its id kept, nothing ended (plan 8R-4L)', async () => {
+      const { service, clock, ended, changed } = rocketServiceWith();
+      const magikarps: RocketSubject = {
+        subjectKey: 'grunt:water:male',
+        rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
+      };
+      const mudkips: RocketSubject = {
+        subjectKey: 'grunt:water:female',
+        rocket: { name: 'Water-type grunt', catches: [MUDKIP], lineup: 'Mudkip, Tentacool' },
+      };
+      const notSure = await rocket(service, WATER);
+      if (notSure.kind !== 'reported') throw new Error(notSure.kind);
+      clock.now += 5 * 60_000;
+      const refined = await rocket(service, magikarps, { reporter: OTHER_REPORTER });
+      expect(refined).toEqual({
+        kind: 'refined',
+        report: {
+          ...notSure.report,
+          subjectKey: 'grunt:water:male',
+          rocket: magikarps.rocket,
+          reporter: OTHER_REPORTER,
+          madeAt: clock.now,
+          endsAt: clock.now + 30 * 60_000,
+        },
+        replaced: notSure.report,
+      });
+      if (refined.kind !== 'refined') return;
+      // The other lineup over it, in place again; not sure which over a lineup says less.
+      const other = await rocket(service, mudkips);
+      expect(other).toMatchObject({ kind: 'refined', report: { id: notSure.report.id } });
+      expect(await rocket(service, WATER, { reporter: OTHER_REPORTER })).toMatchObject({
+        kind: 'already',
+        standing: { subjectKey: 'grunt:water:female' },
+      });
+      expect(ended).toEqual([]);
+      expect(changed).toEqual([]);
+      expect((await service.standing(REPORT_SERVER)).map((one) => one.id)).toEqual([
+        notSure.report.id,
+      ]);
+    });
+
+    describe('a report’s version: its id and madeAt (L1)', () => {
+      const MAGIKARPS: RocketSubject = {
+        subjectKey: 'grunt:water:male',
+        rocket: { name: 'Water-type grunt', catches: [MAGIKARP], lineup: 'Magikarp, Feebas' },
+      };
+
+      async function refinedByMisty() {
+        const made = rocketServiceWith();
+        const notSure = await rocket(made.service, WATER);
+        if (notSure.kind !== 'reported') throw new Error(notSure.kind);
+        made.clock.now += 5 * 60_000;
+        const refined = await rocket(made.service, MAGIKARPS, { reporter: OTHER_REPORTER });
+        if (refined.kind !== 'refined') throw new Error(refined.kind);
+        return { ...made, before: notSure.report, now: refined.report };
+      }
+
+      it('takes back nothing by a version refined since, for staff and the first reporter alike', async () => {
+        const { service, ended, before, now } = await refinedByMisty();
+        const stale = { id: before.id, madeAt: before.madeAt };
+        for (const [by, staff] of [
+          ['200000000000000099', true],
+          [REPORTER.id, false],
+        ] as const) {
+          expect(await service.takeBack(REPORT_SERVER, [stale], by, staff)).toEqual({
+            removed: [],
+            notYours: [],
+            changed: [now],
+          });
+        }
+        expect(ended).toEqual([]);
+        expect(await service.rocketAt(REPORT_SERVER, reportedStop(1).key)).toEqual(now);
+        // The version that stands is taken back.
+        const current = { id: now.id, madeAt: now.madeAt };
+        expect(
+          (await service.takeBack(REPORT_SERVER, [current], OTHER_REPORTER.id, false)).removed,
+        ).toEqual([now]);
+      });
+
+      it('gives a report as it is kept now, and puts no hideout back over a grunt refined since', async () => {
+        const made = rocketServiceWith();
+        const arlo = await rocket(made.service, ARLO);
+        if (arlo.kind !== 'reported') throw new Error(arlo.kind);
+        const grunt = await rocket(made.service, WATER, { replacing: arlo.report.id });
+        if (grunt.kind !== 'reported') throw new Error(grunt.kind);
+        made.clock.now += 60_000;
+        const refined = await rocket(made.service, MAGIKARPS, { reporter: OTHER_REPORTER });
+        if (refined.kind !== 'refined') throw new Error(refined.kind);
+        expect(await made.service.kept(REPORT_SERVER, grunt.report.id)).toEqual(refined.report);
+        // The grunt as it was when it replaced Arlo is no longer what stands.
+        expect(await made.service.restore(arlo.report, grunt.report)).toBeUndefined();
+        expect(await made.service.rocketAt(REPORT_SERVER, reportedStop(1).key)).toEqual(
+          refined.report,
+        );
+      });
+    });
+
     it('replaces a grunt by another at once, and tells that the first one ended', async () => {
       const { service, ended } = rocketServiceWith();
       const first = await rocket(service, WATER);
diff --git a/src/services/stop-reports.ts b/src/services/stop-reports.ts
index 3b2fce80a67e6d7705fc7c61807142e58ad42f18..2b62d0df44fc35707b257678c6ad2473fd317409 100644
--- a/src/services/stop-reports.ts
+++ b/src/services/stop-reports.ts
@@ -56,11 +56,14 @@ export interface RocketSubject {
 /**
  * What came of a Rocket report (plan 8R-2; design 5.2, Matt's answer 4): reported (in the place
  * of the stop's Rocket report of the day, if any, `replaced` only while that one stood; `news`
- * unless it is the same hideout again);
+ * unless it is the same hideout again); refined (plan 8R-4L, Matt's B2: a lineup of the grunt
+ * type that stood, over "not sure which" or the other lineup: that report changed in place, its
+ * id kept, nothing ended; always news, the hour per type keeps a second DM away);
  * or not: the same grunt stands (`already`), or a hideout does and the member is asked (`asks`).
  */
 export type RocketOutcome =
   | { kind: 'reported'; report: RocketReport; replaced: RocketReport | undefined; news: boolean }
+  | { kind: 'refined'; report: RocketReport; replaced: RocketReport }
   | { kind: 'already'; standing: RocketReport }
   | { kind: 'asks'; standing: RocketReport };
 
@@ -86,8 +89,19 @@ export interface TakenBack {
   removed: StopReport[];
   /** Another member's, which only staff may take back. */
   notYours: StopReport[];
+  /**
+   * Changed in place since the version asked for (review L1: another `madeAt` under the same
+   * id), as they stand now: nothing of them is taken back, by staff or anyone.
+   */
+  changed: StopReport[];
 }
 
+/**
+ * A report to take back: by its id, or by its version (review L1), its id and when it was made,
+ * which a Rocket report refined in place (plan 8R-4L) no longer is.
+ */
+export type ReportRef = number | { id: number; madeAt: number };
+
 /** How long a grunt stands unless said (`settings.rocket.gruntMinutes`). */
 const GRUNT_MS = 30 * 60_000;
 
@@ -146,11 +160,13 @@ export class StopReportService {
   }
 
   /**
-   * Whether a report of a server is still kept: neither replaced nor taken back, ended by its
-   * time or not (until the upkeep forgets it).
+   * A report of a server by its id as it is kept now: neither replaced nor taken back, ended by
+   * its time or not (until the upkeep forgets it). A Rocket report refined in place (plan 8R-4L)
+   * is kept under its id with another `madeAt` (review L1): the caller compares.
    */
-  async isKept(serverId: string, id: number): Promise<boolean> {
-    return (await this.options.store.byId(id))?.serverId === serverId;
+  async kept(serverId: string, id: number): Promise<StopReport | undefined> {
+    const report = await this.options.store.byId(id);
+    return report?.serverId === serverId ? report : undefined;
   }
 
   /**
@@ -252,7 +268,8 @@ export class StopReportService {
    * asks first, unless `replacing` is that hideout's id (the member said Replace). A grunt stands
    * `gruntMs`, a hideout until local midnight. What it replaced while it stood has ended
    * (`ended`); a hideout made or replaced changes the posts (`changed`). The same hideout again
-   * is no news. Throws what storing throws.
+   * is no news. A lineup of the grunt type that stands refines it in place (`refined`, plan
+   * 8R-4L): nothing ends and no post changes. Throws what storing throws.
    */
   async reportRocket(input: {
     serverId: string;
@@ -282,7 +299,15 @@ export class StopReportService {
       },
       (standing) => {
         asked.decision = decideRocket(standing, input.subject, madeAt, input.replacing);
-        return asked.decision === 'already' || asked.decision === 'asks' ? 'keep' : 'replace';
+        switch (asked.decision) {
+          case 'already':
+          case 'asks':
+            return 'keep';
+          case 'refine':
+            return 'update';
+          case 'report':
+            return 'replace';
+        }
       },
       // What still stands at the stop, also from yesterday past midnight (fix A2).
       madeAt,
@@ -298,6 +323,20 @@ export class StopReportService {
     if (!isRocketReport(report)) throw new Error('a Rocket report was saved as another');
     const replaced =
       outcome.replaced && isRocketReport(outcome.replaced) ? outcome.replaced : undefined;
+    if (outcome.inPlace && replaced) {
+      // Refined in place (plan 8R-4L): nothing ended, no post shows a grunt.
+      this.options.log.info(
+        {
+          guild: input.serverId,
+          by: input.reporter.id,
+          who: input.subject.subjectKey,
+          refined: replaced.subjectKey,
+          report: report.id,
+        },
+        'Team GO Rocket refined',
+      );
+      return { kind: 'refined', report, replaced };
+    }
     // What stood until now ended early: a grunt's message goes with it. A row that had ended
     // already replaced nothing a member saw, and is not named (fix F2).
     const stood = replaced !== undefined && replaced.endsAt > madeAt ? replaced : undefined;
@@ -325,26 +364,40 @@ export class StopReportService {
   }
 
   /**
-   * Takes back reports of a server by their ids: those of `by`, or every one for `staff`; one
-   * gone or ended already is passed over. A replaced report does not come back (design 9.13).
+   * Takes back reports of a server by their ids or versions (`ReportRef`): those of `by`, or
+   * every one for `staff`; one gone or ended already is passed over. A replaced report does not
+   * come back (design 9.13). One asked for by a version it no longer is (refined in place since,
+   * review L1) is `changed`, before whose it is: its first reporter is told it changed, not that
+   * it is another's.
    */
   async takeBack(
     serverId: string,
-    ids: readonly number[],
+    refs: readonly ReportRef[],
     by: string,
     staff: boolean,
   ): Promise<TakenBack> {
     const removed: StopReport[] = [];
     const notYours: StopReport[] = [];
-    for (const id of ids) {
+    const changed: StopReport[] = [];
+    for (const ref of refs) {
+      const { id, madeAt } = typeof ref === 'number' ? { id: ref, madeAt: undefined } : ref;
       const report = await this.get(serverId, id);
       if (!report) continue;
+      if (madeAt !== undefined && report.madeAt !== madeAt) {
+        changed.push(report);
+        continue;
+      }
       if (!staff && report.reporter.id !== by) {
         notYours.push(report);
         continue;
       }
-      const gone = await this.options.store.remove(id, serverId);
+      // With its row locked the version is asked again: one refined meanwhile is kept.
+      const gone = await this.options.store.remove(id, serverId, madeAt);
       if (gone) removed.push(gone);
+      else if (madeAt !== undefined) {
+        const now = await this.get(serverId, id);
+        if (now) changed.push(now);
+      }
     }
     if (removed.length > 0) {
       // Only research and hideouts are in the posts: a grunt taken back draws none (fix A4).
@@ -358,7 +411,7 @@ export class StopReportService {
         'stop reports taken back',
       );
     }
-    return { removed, notYours };
+    return { removed, notYours, changed };
   }
 
   /**
@@ -376,7 +429,9 @@ export class StopReportService {
     // is no moment without a report; another report standing there is kept.
     const outcome = await this.options.store.saveUnless(
       again,
-      (standing) => (standing.id === grunt.id ? 'replace' : 'keep'),
+      // The grunt as it was (review L1): one refined in place since keeps its id, not its time.
+      (standing) =>
+        standing.id === grunt.id && standing.madeAt === grunt.madeAt ? 'replace' : 'keep',
       now,
     );
     if (!outcome.saved || !isRocketReport(outcome.report)) return undefined;
diff --git a/test/support/held-call.test.ts b/test/support/held-call.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8c98132685ec3eefbd9da530c8460e4158764340
--- /dev/null
+++ b/test/support/held-call.test.ts
@@ -0,0 +1,31 @@
+import { describe, expect, it } from 'vitest';
+import { heldCall } from './held-call.js';
+
+describe('heldCall', () => {
+  it('is reached once the call waits, and goes on at release', async () => {
+    const held = heldCall('the send in West');
+    const order: string[] = [];
+    const call = (async () => {
+      held.arrive();
+      await held.released;
+      order.push('call went on');
+    })();
+    await held.reached;
+    expect(order).toEqual([]);
+    held.release();
+    await call;
+    expect(order).toEqual(['call went on']);
+  });
+
+  it('gives up waiting for a call that never comes, naming it (F8)', async () => {
+    const held = heldCall('the edit in East', 10);
+    await expect(held.reached).rejects.toThrow('still waiting for the edit in East to be reached');
+  });
+
+  it('resolves at once once the call has waited already', async () => {
+    const held = heldCall('the send in West', 10);
+    held.arrive();
+    await held.reached;
+    await held.reached;
+  });
+});
diff --git a/test/support/held-call.ts b/test/support/held-call.ts
new file mode 100644
index 0000000000000000000000000000000000000000..564ae5b12b88898a5a20ca39fdd8a2a11d296100
--- /dev/null
+++ b/test/support/held-call.ts
@@ -0,0 +1,69 @@
+import { onTestFinished } from 'vitest';
+import { TALLY_LIMIT_MS } from './tally.js';
+
+// The timers of the machine, taken before any test fakes them: a wait gives up by real time
+// also under `vi.useFakeTimers`.
+const realSetTimeout = globalThis.setTimeout;
+const realClearTimeout = globalThis.clearTimeout;
+
+/**
+ * A call a test holds (plan 8R-4L, review R1): the fake calls `arrive()` once it waits and goes on
+ * at the test's `release()`; the test awaits `reached` to act while the call is on its way, which
+ * waits on the event itself, never on time or a count of turns.
+ */
+export interface HeldCall {
+  /**
+   * Resolves once the call waits (at once when it has); rejects, naming the call, when it has not
+   * come within `TALLY_LIMIT_MS` of the read (fix round 2, F8), as `Tally.reached` does.
+   */
+  readonly reached: Promise<void>;
+  /** Resolves at `release()`. */
+  released: Promise<void>;
+  arrive(): void;
+  release(): void;
+}
+
+/** A held call; `what` names it in the failure of a wait that gives up. */
+export function heldCall(what = 'the held call', limitMs = TALLY_LIMIT_MS): HeldCall {
+  let arrived = false;
+  const waiting = new Set<() => void>();
+  let release = (): void => undefined;
+  const released = new Promise<void>((resolve) => {
+    release = resolve;
+  });
+  return {
+    // A wait of its own per read, so that a call held and never awaited rejects nothing.
+    get reached(): Promise<void> {
+      if (arrived) return Promise.resolve();
+      return new Promise((resolve, reject) => {
+        const done = () => {
+          realClearTimeout(timer);
+          resolve();
+        };
+        const timer = realSetTimeout(() => {
+          waiting.delete(done);
+          reject(new Error(`still waiting for ${what} to be reached`));
+        }, limitMs);
+        timer.unref();
+        waiting.add(done);
+        // A wait its test left behind is given up with that test: it never rejects into a later
+        // one. Outside a test (none is running) it keeps only its limit.
+        try {
+          onTestFinished(() => {
+            realClearTimeout(timer);
+            waiting.delete(done);
+          });
+        } catch {
+          // No test is running.
+        }
+      });
+    },
+    released,
+    arrive() {
+      arrived = true;
+      for (const done of [...waiting]) done();
+      waiting.clear();
+    },
+    release,
+  };
+}
diff --git a/test/support/rocket-store-cases.ts b/test/support/rocket-store-cases.ts
index 7cd16a34245c3dcdd349684414bf94458b01e53b..2e14f8c86f70e853f9cb3dd82691932654f4885b 100644
--- a/test/support/rocket-store-cases.ts
+++ b/test/support/rocket-store-cases.ts
@@ -82,6 +82,16 @@ export function gruntMessageCases(made: () => Promise<GruntMessageStorage>): voi
     expect(await store.all()).toEqual([gruntRow(2)]);
   });
 
+  it('moves the time a message is due (plan 8R-4L: a grunt refined in place)', async () => {
+    const store = await made();
+    await store.add(gruntRow(1));
+    await store.add(gruntRow(2));
+    await store.retime(gruntRow(1).messageId, 5_000);
+    // One not recorded: nothing happens.
+    await store.retime(gruntRow(9).messageId, 5_000);
+    expect(await store.all()).toEqual([gruntRow(2), gruntRow(1, { deleteAt: 5_000 })]);
+  });
+
   it('gives the messages of a report', async () => {
     const store = await made();
     await store.add(gruntRow(1));
diff --git a/test/support/rocket-store.ts b/test/support/rocket-store.ts
index 7f53e8ad3df1ad6073be1566df407044ad3b0a58..99c29b245ff8b08a315771a79edb9321213a9c47 100644
--- a/test/support/rocket-store.ts
+++ b/test/support/rocket-store.ts
@@ -43,6 +43,13 @@ export class MemoryGruntMessages implements GruntMessageStorage {
     });
   }
 
+  retime(messageId: string, deleteAt: number): Promise<void> {
+    return this.attempt('retime', () => {
+      const row = this.rows.find((one) => one.messageId === messageId);
+      if (row) row.deleteAt = deleteAt;
+    });
+  }
+
   all(): Promise<GruntMessageRow[]> {
     return this.attempt('all', () =>
       this.rows
````

### Task 5: 8R-4L task 5: The notifier by grunt type

Prototype commit: `457cf478d863fd581eab20f0bde7973d18371acb`

A lineup's report is wanted, quiet for an hour and announced by its
grunt type (typeKeyOf): rocketTargets and rocketWantsFiring, the quiet
key of NotifyService.rocketReported and its announce line
rocket:<server>:<type key>. So grunt:water fires on every lineup and on
"not sure which", at most once an hour, also for lineups reported at
once, and a grunt refined in place tells only who was not told of the
type. rocketShadowFiring stays per report: a Shadow Magikarp want fires
on the lineup that gives it and on "not sure which", not on the other.

A grunt's reporter, and on a refine the reporter of the grunt it
changed (RocketNews.alsoActors), are never told of it and have heard
of its type for the hour.

**Files:**

```
 src/domain/notify/reasons.test.ts          |   3 ++
 src/domain/notify/reasons.ts               |   8 ++--
 src/services/notify-service.rocket.test.ts | 137 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/services/notify-service.ts             |  19 +++++++---
 src/services/rocket-reports.test.ts        |   2 +
 src/services/rocket-reports.ts             |  17 ++++++++-
 test/support/party-service.ts              |  10 +++--
 7 files changed, 178 insertions(+), 18 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/notify/reasons.test.ts src/services/notify-service.rocket.test.ts src/services/rocket-reports.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 457cf478d863fd581eab20f0bde7973d18371acb -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4L task 5: The notifier by grunt type`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/notify/reasons.test.ts b/src/domain/notify/reasons.test.ts
index d8947d15596f0c0b8842b18cb36b2de711ce9011..8a358d37ce4aa017adce2a75da45488601713fe7 100644
--- a/src/domain/notify/reasons.test.ts
+++ b/src/domain/notify/reasons.test.ts
@@ -267,6 +267,9 @@ describe('Rocket wants (plan 8R-2)', () => {
     expect(rocketWantsFiring(wants, 'leader:arlo')).toEqual([wants[1], wants[2]]);
     expect(rocketWantsFiring(wants, 'leader:cliff')).toEqual([wants[1]]);
     expect(rocketWantsFiring(wants, 'giovanni')).toEqual([]);
+    // A lineup's report is wanted by its grunt type (plan 8R-4L).
+    expect(rocketWantsFiring(wants, 'grunt:water:male')).toEqual([wants[0]]);
+    expect(rocketTargets('grunt:water:female')).toEqual([{ kind: 'rocket', who: 'grunt:water' }]);
     expect(rocketTargets('leader:sierra')).toEqual([
       { kind: 'rocket', who: 'leader:sierra' },
       { kind: 'rocket', who: 'leader:any' },
diff --git a/src/domain/notify/reasons.ts b/src/domain/notify/reasons.ts
index 61b7e3430d635b0fa41ebe0905345df8ead182e3..b1e24191f30ca59263e8736dacf6b0eb8a77ce66 100644
--- a/src/domain/notify/reasons.ts
+++ b/src/domain/notify/reasons.ts
@@ -14,6 +14,7 @@ import { costumedByName } from '../pogo/costumes.js';
 import { pokemonWantFits, wantToken, type PokemonSighting } from '../pogo/wants.js';
 import type { BoxSubject } from '../pogo/want-boxes.js';
 import type { TaskReward } from '../research/task.js';
+import { typeKeyOf } from '../rocket/lineups.js';
 import {
   ANY_LEADER,
   boxTarget,
@@ -265,11 +266,12 @@ export function researchWantsFiring(
 
 /**
  * The targets a want for a Rocket report may be stored under (`TargetWant`; plan 8R-2, design
- * 7): its own who (`grunt:water`, `leader:arlo`, `giovanni`, `decoy`), and for a leader any
- * leader too. What `TargetWantStorage.wanting` is asked for.
+ * 7): its own who (`grunt:water`, `leader:arlo`, `giovanni`, `decoy`; a lineup's report its grunt
+ * type's, `typeKeyOf`, plan 8R-4L: wants stay by type), and for a leader any leader too. What
+ * `TargetWantStorage.wanting` is asked for.
  */
 export function rocketTargets(subjectKey: string): TargetWant[] {
-  const own: TargetWant = { kind: 'rocket', who: subjectKey };
+  const own: TargetWant = { kind: 'rocket', who: typeKeyOf(subjectKey) };
   return subjectKey.startsWith('leader:') ? [own, { kind: 'rocket', who: ANY_LEADER }] : [own];
 }
 
diff --git a/src/services/notify-service.rocket.test.ts b/src/services/notify-service.rocket.test.ts
index f67388e47fbfe7c63a095effd292d03f802d898b..7afe184d055ca6448e44a304fb64409bf27051d8 100644
--- a/src/services/notify-service.rocket.test.ts
+++ b/src/services/notify-service.rocket.test.ts
@@ -16,13 +16,13 @@ import { reportedStop } from '../../test/support/stop-report-cases.js';
 import { MemoryStopReports } from '../../test/support/stop-reports.js';
 import { watchEachTest } from '../../test/support/timers.js';
 import type { TargetWant } from '../domain/notify/target-wants.js';
+import { lineupChoice, type RocketLineupChoice } from '../domain/rocket/lineups.js';
 import { pokemonTarget } from '../domain/pogo/notification-target.js';
 import type { ReportedStop } from '../domain/stops/report.js';
 import { postLink } from '../render/notify-dm.js';
 import { DM_PRIORITY } from './dm-sender.js';
 import { GruntMessageService } from './grunt-messages.js';
-import type { NotifyServiceOptions } from './notify-service.js';
-import { MAX_WANT_QUIET_MS } from './notify-service.js';
+import { MAX_WANT_QUIET_MS, NotifyService, type NotifyServiceOptions } from './notify-service.js';
 import { RocketService, rocketSubject } from './rocket-reports.js';
 import { StopReportService } from './stop-reports.js';
 
@@ -55,6 +55,11 @@ async function rocketWith(notifying: Partial<NotifyServiceOptions> = {}, rehears
         now: () => made.clock.now,
         setTimer: () => () => undefined,
       });
+  /** The notifier the Rocket service tells; `restart()` puts in that of a new process (F3). */
+  const notifier = { current: made.notify };
+  const restart = () => {
+    notifier.current = new NotifyService(made.notifyOptions);
+  };
   const rocket = new RocketService({
     reports,
     messages,
@@ -62,7 +67,11 @@ async function rocketWith(notifying: Partial<NotifyServiceOptions> = {}, rehears
     guilds: {
       idFor: (snowflake) => Promise.resolve(snowflake === made.gateway.guildId ? 1 : undefined),
     },
-    notify: made.notify,
+    notify: {
+      rocketReported: (news) => {
+        notifier.current.rocketReported(news);
+      },
+    },
     log: made.log,
   });
   const want = (memberId: string, ...targets: TargetWant[]) =>
@@ -78,10 +87,10 @@ async function rocketWith(notifying: Partial<NotifyServiceOptions> = {}, rehears
       subject: rocketSubject(feedChoice(key)),
       reporter,
     });
-    await made.notify.flush();
+    await notifier.current.flush();
     return outcome;
   };
-  return { ...made, reports, rocket, want, report };
+  return { ...made, reports, rocket, want, report, notifier, restart };
 }
 
 describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () => {
@@ -147,6 +156,124 @@ describe('NotifyService: Team GO Rocket is reported (plan 8R-2, design 7)', () =
     expect(made.dms.to(ALICE)).toHaveLength(1);
   });
 
+  describe('two lineups of a grunt type (plan 8R-4L)', () => {
+    const water = feedChoice('grunt:water');
+    const [mudkips, magikarps] = water.lineups ?? [];
+    if (!mudkips || !magikarps) throw new Error('the water grunt has two lineups');
+
+    /** Reports one of the water grunts' lineups, as `/rocket report` would. */
+    async function reportLineup(
+      made: Awaited<ReturnType<typeof rocketWith>>,
+      lineup: RocketLineupChoice,
+      stop: ReportedStop,
+      reporter = RITA,
+    ) {
+      const outcome = await made.rocket.report({
+        serverId: made.gateway.guildId,
+        stop,
+        subject: rocketSubject(lineupChoice(water, lineup)),
+        reporter,
+      });
+      await made.notify.flush();
+      return outcome;
+    }
+
+    it('tells a Shadow Magikarp want of the lineup that gives it and of not sure which, not of the other', async () => {
+      const made = await rocketWith();
+      await made.wants.set(BOB, made.gateway.guildId, pokemonTarget(129, undefined, true), 'raid');
+      await reportLineup(made, mudkips, west(1));
+      expect(made.dms.to(BOB)).toEqual([]);
+      await reportLineup(made, magikarps, west(2));
+      expect(made.dms.to(BOB).map(dmReasons)).toEqual([['Magikarp · Shadow']]);
+      expect(dmSentence(made.dms.to(BOB)[0])).toBe(
+        `A **Water-type grunt** has been reported in <#${WEST_CHANNEL}> by **Rita**.`,
+      );
+      made.clock.now += MAX_WANT_QUIET_MS;
+      await made.report('grunt:water', west(3));
+      expect(made.dms.to(BOB)).toHaveLength(2);
+    });
+
+    it('tells a want of the grunt type of every lineup and of not sure which, once an hour', async () => {
+      const made = await rocketWith();
+      await made.want(ALICE, rocketWant('grunt:water'));
+      await reportLineup(made, mudkips, west(1));
+      expect(made.dms.to(ALICE).map(dmReasons)).toEqual([['Water-type grunt']]);
+      await reportLineup(made, magikarps, west(2));
+      await made.report('grunt:water', west(3));
+      expect(made.dms.to(ALICE)).toHaveLength(1);
+      made.clock.now += MAX_WANT_QUIET_MS;
+      await reportLineup(made, magikarps, west(4));
+      expect(made.dms.to(ALICE)).toHaveLength(2);
+    });
+
+    it('keeps the hour of a type for its lineups reported at once, in the type’s line', async () => {
+      const made = await rocketWith();
+      await made.want(ALICE, rocketWant('grunt:water'));
+      const report = (lineup: RocketLineupChoice, stop: ReportedStop) =>
+        made.rocket.report({
+          serverId: made.gateway.guildId,
+          stop,
+          subject: rocketSubject(lineupChoice(water, lineup)),
+          reporter: RITA,
+        });
+      await Promise.all([report(mudkips, west(1)), report(magikarps, west(2))]);
+      await made.notify.flush();
+      expect(made.dms.to(ALICE)).toHaveLength(1);
+    });
+
+    it('tells of a grunt refined in place only who was not told of the type (B2)', async () => {
+      const made = await rocketWith();
+      await made.want(ALICE, rocketWant('grunt:water'));
+      await made.wants.set(BOB, made.gateway.guildId, pokemonTarget(129, undefined, true), 'raid');
+      await reportLineup(made, mudkips, west(1));
+      expect(made.dms.recipients).toEqual([ALICE]);
+      // Misty sees the other lineup there: the report is refined, and Bob's Magikarp is told.
+      const refined = await reportLineup(made, magikarps, west(1), {
+        id: '200000000000000099',
+        name: 'Misty',
+      });
+      expect(refined).toMatchObject({
+        kind: 'reported',
+        report: { subjectKey: 'grunt:water:male' },
+      });
+      expect(made.dms.to(ALICE)).toHaveLength(1);
+      expect(made.dms.to(BOB).map(dmReasons)).toEqual([['Magikarp · Shadow']]);
+      expect(linksOf(made.dms.to(BOB)[0])).toEqual([
+        `Go to report ${postLink(
+          made.gateway.guildId,
+          WEST_CHANNEL,
+          refined.kind === 'reported' ? (refined.posted[0]?.messageId ?? '') : '',
+        )}`,
+      ]);
+    });
+  });
+
+  it('never tells the reporter of not sure which of a refine of their own grunt, nor of the type within the hour (R3)', async () => {
+    const made = await rocketWith();
+    const water = feedChoice('grunt:water');
+    const magikarps = water.lineups?.[1];
+    if (!magikarps) throw new Error('the water grunt has two lineups');
+    const misty = { id: '200000000000000099', name: 'Misty' };
+    await made.want(REPORTER, rocketWant('grunt:water'));
+    await made.report('grunt:water', west(1));
+    // A restart forgets the hour her own report gave her: only `alsoActors` keeps her untold.
+    made.restart();
+    made.clock.now += 60_000;
+    const refined = await made.rocket.report({
+      serverId: made.gateway.guildId,
+      stop: west(1),
+      subject: rocketSubject(lineupChoice(water, magikarps)),
+      reporter: misty,
+    });
+    await made.notifier.current.flush();
+    expect(refined).toMatchObject({ kind: 'reported', report: { reporter: misty } });
+    expect(made.dms.to(REPORTER)).toEqual([]);
+    // The refine she is an actor of gave her the hour of the type anew: another water grunt is no
+    // news to her.
+    await made.report('grunt:water', west(2), misty);
+    expect(made.dms.to(REPORTER)).toEqual([]);
+  });
+
   it('tells a Shadow want also where no TargetWant is kept (fix B8)', async () => {
     const made = await rocketWith({ targetWants: undefined });
     await made.wants.set(ALICE, made.gateway.guildId, pokemonTarget(258, undefined, true), 'raid');
diff --git a/src/services/notify-service.ts b/src/services/notify-service.ts
index 1cb01b2b870b4a59507af16fb71e325b8c7a3197..c1643b6d44355f1e1e2a55f76b83ee71184695f4 100644
--- a/src/services/notify-service.ts
+++ b/src/services/notify-service.ts
@@ -93,6 +93,7 @@ import type { PartyStore } from './party-store.js';
 import type { RaidBossProvider } from './raid-boss-service.js';
 import { regionsAtPoint, type RegionProvider } from './region-directory.js';
 import type { SpawnNews } from './spawn-service.js';
+import { typeKeyOf } from '../domain/rocket/lineups.js';
 import { isHideoutReport, type ResearchNews } from './stop-reports.js';
 import type { RocketNews } from './rocket-reports.js';
 import { gruntHourNote, rocketDmBrief, rocketDmSentence } from '../render/rocket.js';
@@ -905,7 +906,9 @@ export class NotifyService implements PartyNotifier {
 
   /**
    * Team GO Rocket was reported (`RocketService`; plan 8R-2, design 7): who wants it is told, one
-   * DM per region channel that holds its stop, when they can view the channel; not the reporter.
+   * DM per region channel that holds its stop, when they can view the channel; not the reporter,
+   * nor (plan 8R-4L, review R3) the reporter of the grunt a refine changed (`alsoActors`), and
+   * both have heard of a grunt's type for the hour.
    * A report fires a want of its grunt type, its leader (or any leader), Giovanni or the decoy
    * (`rocketWantsFiring`), and a Shadow want of a Pokémon it can give (`rocketShadowFiring`: the
    * shadow row means shadow raids and Rocket catches). A grunt goes at the spawn priority, at
@@ -928,10 +931,13 @@ export class NotifyService implements PartyNotifier {
     const named = report.subjectKey.startsWith('leader:') || report.subjectKey === 'giovanni';
     const targets = rocketTargets(report.subjectKey);
     const numbers = rocketShadowNumbers(report.rocket.catches);
-    // Per member and grunt type (a grunt), or per hideout at the stop in its day (a hideout).
-    const quietKey = (id: string): string => `${news.serverId} ${id} ${report.subjectKey}`;
+    // Per member and grunt type (a grunt; a lineup's report its type's, plan 8R-4L), or per
+    // hideout at the stop in its day (a hideout).
+    const type = typeKeyOf(report.subjectKey);
+    const quietKey = (id: string): string => `${news.serverId} ${id} ${type}`;
     const toldKey = (id: string): string =>
       `${news.serverId} ${id} ${report.periodKey} ${report.subjectKey} ${report.stop.key}`;
+    const actors = [report.reporter.id, ...(news.alsoActors ?? [])];
     for (const { channelId, messageId: posted } of news.channels) {
       const eventAt = this.now();
       let messageId = posted;
@@ -941,7 +947,7 @@ export class NotifyService implements PartyNotifier {
         // so that the second channel's DM knows whom the first one told.
         key: hideout
           ? `rocket:${news.serverId}:${String(report.id)}`
-          : `rocket:${news.serverId}:${report.subjectKey}`,
+          : `rocket:${news.serverId}:${type}`,
         partyId: undefined,
         guild: news.serverId,
         channelId,
@@ -985,8 +991,11 @@ export class NotifyService implements PartyNotifier {
             const last = this.rocketHeard.get(quietKey(id));
             return last !== undefined && now - last < MAX_WANT_QUIET_MS;
           };
+          // Who made the grunt known (review R3): its reporter, and the reporter of what a refine
+          // replaced, are not told of it, and have heard of its type for the hour.
+          if (!hideout) for (const id of actors) this.rocketHeard.set(quietKey(id), now);
           return {
-            ids: ids.filter((id) => !quiet(id)),
+            ids: ids.filter((id) => !quiet(id) && !actors.includes(id)),
             reasonsOf: (id) => [
               ...rocketWantsFiring(targeted.get(id) ?? [], report.subjectKey).map(
                 (want): NotifyReason => ({ kind: 'target', want }),
diff --git a/src/services/rocket-reports.test.ts b/src/services/rocket-reports.test.ts
index 32d3cf1f3266e1f4ff8056b9e3126bed2d71b49c..44b1af5b8bd87d0c23b25dbfd8a4971a7368d7af 100644
--- a/src/services/rocket-reports.test.ts
+++ b/src/services/rocket-reports.test.ts
@@ -402,6 +402,7 @@ describe('RocketService', () => {
       serverId: FAKE_GUILD_ID,
       report: refined.kind === 'reported' ? refined.report : undefined,
       channels: first.posted,
+      alsoActors: [ASH.id],
     });
   });
 
@@ -440,6 +441,7 @@ describe('RocketService', () => {
         serverId: FAKE_GUILD_ID,
         report: refined.report,
         channels: refined.posted,
+        alsoActors: [ASH.id],
       },
     ]);
     expect(refined.posted.map((one) => one.channelId)).toEqual([WEST_CHANNEL, EAST_CHANNEL]);
diff --git a/src/services/rocket-reports.ts b/src/services/rocket-reports.ts
index 2790aaa39f8e66bec4172690d5130ec7ba7b4d94..c5bb7f210272759a571144bab84a5369a44c5db3 100644
--- a/src/services/rocket-reports.ts
+++ b/src/services/rocket-reports.ts
@@ -20,6 +20,11 @@ export interface RocketNews {
   serverId: string;
   report: RocketReport;
   channels: { channelId: string; messageId: string | undefined }[];
+  /**
+   * Who else made it known and is not told (plan 8R-4L, review R3): the reporter of the grunt a
+   * refine changed in place, whose report it was.
+   */
+  alsoActors?: string[];
 }
 
 /** What came of a Rocket report, with what was posted. */
@@ -196,12 +201,19 @@ export class RocketService {
         return { kind: 'unposted', channels, ...(await this.undo(report, replaced)) };
       }
     }
-    this.tell(report, messages ? posted.map((one) => one.channelId) : channels, posted);
+    // The reporter of what it refined is not told of their own grunt (review R3).
+    const alsoActors = replaced.reporter.id === report.reporter.id ? [] : [replaced.reporter.id];
+    this.tell(report, messages ? posted.map((one) => one.channelId) : channels, posted, alsoActors);
     return { kind: 'reported', report, replaced, channels, posted };
   }
 
   /** Tells the notifier of a report in these channels, with its messages there. */
-  private tell(report: RocketReport, channels: readonly string[], posted: PostedGrunt[]): void {
+  private tell(
+    report: RocketReport,
+    channels: readonly string[],
+    posted: PostedGrunt[],
+    alsoActors: string[] = [],
+  ): void {
     try {
       this.options.notify?.rocketReported({
         serverId: report.serverId,
@@ -210,6 +222,7 @@ export class RocketService {
           channelId,
           messageId: posted.find((one) => one.channelId === channelId)?.messageId,
         })),
+        ...(alsoActors.length === 0 ? {} : { alsoActors }),
       });
     } catch (err) {
       this.options.log.error({ err, guild: report.serverId }, 'could not tell of a Rocket report');
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index 7e81390bbe3243c4a082b12f1d6a39e6233c7a28..01eca2b877fc7cba6eaad3a035153a3fb70483ed 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -302,7 +302,9 @@ export function restarted(made: Outliving, overrides: ServiceOverrides = {}) {
  * `notify` is the notifier over the same store, told by the services as in the bot: who wants
  * something is in `wants`, `gymTargets` and `newTrains` (nobody, until a test says so), everybody is a
  * member of the server and sees what the fake gateway lets them see (`members`), and what would
- * be sent is only recorded (`dms`). It works on the side: `notify.flush()` waits. `spawns` is
+ * be sent is only recorded (`dms`). It works on the side: `notify.flush()` waits.
+ * `notifyOptions` are its options: `new NotifyService(notifyOptions)` is the notifier of a
+ * restarted process over the same stores and `dms`, which remembers nothing it told. `spawns` is
  * the service of `/wild` over the same gateway; its deletion timers never run by themselves
  * (`spawnTimers`).
  *
@@ -397,7 +399,7 @@ export async function partyServiceWith(
   members.sees = (channelId, userId) =>
     gateway.canSee(channelId, userId) && !gateway.leftServer.has(userId);
   const dms = new RecordingDms();
-  const notify = new NotifyService({
+  const notifyOptions: NotifyServiceOptions = {
     store,
     posts: service,
     wants,
@@ -421,7 +423,8 @@ export async function partyServiceWith(
     // Long enough that nothing is told by itself during a test: `notify.flush()` does it.
     meetingDelayMs: 3_600_000,
     ...notifying,
-  });
+  };
+  const notify = new NotifyService(notifyOptions);
   service.announceTo(notify);
   /** The timers of the spawn reports that wait for their deletion: a test fires them by hand. */
   const spawnTimers: { run: () => void; ms: number; cancelled: boolean }[] = [];
@@ -536,6 +539,7 @@ export async function partyServiceWith(
     routes,
     scheduler,
     notify,
+    notifyOptions,
     spawns,
     spawnTimers,
     wants,
````

### Task 6: 8R-4L task 6: Grunt lineups on the map's server side

Prototype commit: `c3654043262527c4414228c0c9df8c2fff54c7e9`

GET /api/rocket-options lists a grunt type's two lineups beside its
option (RocketWhoOption.lineups: key, value <key>#<fingerprint>,
label = the first slot in short, fingerprint, catches). POST
/api/rocket takes a lineup's value through readWho's rule (a stale
fingerprint is LINEUPS_CHANGED, uncounted), refines "not sure which"
in place as /rocket does, and asks before a hideout with the lineup's
label (B7). A grunt on the map carries its lineup's label
(MapGrunt.lineup); MapHideout is unchanged. Every report on the map
carries its madeAt, which a take-back may send back: a report changed
in place since is 409 REPORT_CHANGED, before whose it is. The page
waits for the map's UX pass.

**Files:**

```
 src/domain/web/stop-report-data.ts      | 31 +++++++++++++++++++++--
 src/domain/web/stop-report-view.test.ts | 18 ++++++++++++++
 src/domain/web/stop-report-view.ts      |  2 ++
 src/web/stop-options.test.ts            | 25 +++++++++++++++++++
 src/web/stop-options.ts                 | 27 +++++++++++++++++---
 src/web/stop-report-post.test.ts        | 99 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/stop-routes.ts                  | 18 ++++++++++----
 7 files changed, 209 insertions(+), 11 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/stop-report-view.test.ts src/web/stop-options.test.ts src/web/stop-report-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c3654043262527c4414228c0c9df8c2fff54c7e9 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4L task 6: Grunt lineups on the map's server side`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/web/stop-report-data.ts b/src/domain/web/stop-report-data.ts
index 64ac82a3b4f6678a71a9403a4929d951e8081160..fbb99353c22e4ea20816486d3d9d7721fcb963df 100644
--- a/src/domain/web/stop-report-data.ts
+++ b/src/domain/web/stop-report-data.ts
@@ -40,6 +40,11 @@ interface MapStopReportBase {
    */
   id: number;
   stop: MapStop;
+  /**
+   * When it was made, epoch milliseconds: with `id` its version (plan 8R-4L, review L1: a grunt
+   * refined in place keeps its id), sent back as the take-back's `madeAt`.
+   */
+  madeAt: number;
   /** When it ends, epoch milliseconds. */
   endsAt: number;
   /** Who reported it, by the name shown then, as text ("a member" where none was kept). */
@@ -68,11 +73,16 @@ export interface MapResearch extends MapStopReportBase {
   rewards: MapReward[];
 }
 
-/** A grunt reported at a stop, for its half hour: who (`grunt:water`), its name, the catches. */
+/**
+ * A grunt reported at a stop, for its half hour: who (`grunt:water`; a lineup `grunt:water:male`),
+ * its name (the type's), the catches, and a lineup's label (plan 8R-4L, B9: its first slot in
+ * short, `Magikarp, Feebas`), which the page shows beside the name; the gender never.
+ */
 export interface MapGrunt extends MapStopReportBase {
   who: string;
   name: string;
   catches: MapReward[];
+  lineup?: string;
 }
 
 /**
@@ -127,10 +137,26 @@ export interface ResearchOptionsView {
   rewards: Array<{ value: string; name: string }>;
 }
 
+/**
+ * One of a grunt type's two lineups as the map offers it (plan 8R-4L, B9): its key
+ * (`grunt:water:male`), the value a report sends as `who` (`<key>#<fingerprint>`, refused as
+ * `LINEUPS_CHANGED` once a rotation changed it), its label (the first slot in short, `Magikarp,
+ * Feebas`; the gender is never shown), its fingerprint and its catches.
+ */
+export interface RocketLineupOption {
+  key: string;
+  value: string;
+  label: string;
+  fingerprint: string;
+  catches: MapReward[];
+}
+
 /**
  * Who of Team GO Rocket `/rocket` offers (`GET /s/<guild>/api/rocket-options`): its key (what a
  * report sends as `who`), its name, the catches, whether it is a hideout (it holds its stop all
- * day), and a note to show with it (Giovanni's: report him only when sure).
+ * day), and a note to show with it (Giovanni's: report him only when sure). A grunt type of two
+ * lineups lists them (`lineups`, plan 8R-4L), in the feed's order; the type's own key is then
+ * "not sure which", its catches both lineups'.
  */
 export interface RocketWhoOption {
   key: string;
@@ -138,6 +164,7 @@ export interface RocketWhoOption {
   hideout: boolean;
   catches: MapReward[];
   note?: string;
+  lineups?: RocketLineupOption[];
 }
 
 /**
diff --git a/src/domain/web/stop-report-view.test.ts b/src/domain/web/stop-report-view.test.ts
index c637e3f2c336b6e49c75fa15c42db0c41c6dea06..d6a3632b90eada5d61d77288b7e3d95e1c7facdc 100644
--- a/src/domain/web/stop-report-view.test.ts
+++ b/src/domain/web/stop-report-view.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import {
   DRATINI,
+  magikarpLineup,
   MUDKIP,
   REPORT_NOW,
   REPORTER,
@@ -99,6 +100,7 @@ describe('stopReportView', () => {
         lat: 40.123457,
         lon: -79.765432,
       },
+      madeAt: researchReport().madeAt,
       endsAt: researchReport().endsAt,
       reporter: 'a member',
       mayTakeBack: true,
@@ -137,6 +139,22 @@ describe('stopReportView', () => {
     });
   });
 
+  it('names a grunt of one lineup by its first slot, the gender never (plan 8R-4L)', () => {
+    const view = stopReportView(
+      input({ reports: [{ ...magikarpLineup({ stop: reportedStop(4) }), id: 7 }] }),
+    );
+    expect(view.grunts).toMatchObject([
+      {
+        who: 'grunt:water:male',
+        name: 'Water-type grunt',
+        lineup: 'Magikarp, Feebas',
+        // With its id the version a take-back names (review L1).
+        madeAt: magikarpLineup().madeAt,
+      },
+    ]);
+    expect(stopReportView(input()).grunts[0]).not.toHaveProperty('lineup');
+  });
+
   it('gives an encounter its catalogue key, and the day’s research when no window is on', () => {
     const view = stopReportView(input({ period: { key: 'day:2026-10-21' } }));
     expect(view.event).toBeNull();
diff --git a/src/domain/web/stop-report-view.ts b/src/domain/web/stop-report-view.ts
index 67d7a3a9e9ce53d069be4bc71471b235fe9db1b0..a18a71dcc8b7468088e2027d17f0a831f747f5e4 100644
--- a/src/domain/web/stop-report-view.ts
+++ b/src/domain/web/stop-report-view.ts
@@ -107,6 +107,7 @@ function base(report: StopReport, input: StopReportViewInput) {
   return {
     id: report.id,
     stop: mapStop(report),
+    madeAt: report.madeAt,
     endsAt: report.endsAt,
     reporter: report.reporter.name.trim() === '' ? 'a member' : report.reporter.name,
     mayTakeBack: !input.readOnly && (input.staff || report.reporter.id === input.memberId),
@@ -132,6 +133,7 @@ function mapGrunt(report: RocketReport, input: StopReportViewInput): MapGrunt {
     who: report.subjectKey,
     name: report.rocket.name,
     catches: report.rocket.catches.map((caught) => mapCatch(caught, input.pictureOrigins)),
+    ...(report.rocket.lineup === undefined ? {} : { lineup: report.rocket.lineup }),
   };
 }
 
diff --git a/src/web/stop-options.test.ts b/src/web/stop-options.test.ts
index 5e015c789a5af4cc59df1ecc0113eeb8b34ca57b..62dc5d0347213de7875122005f9e801eba36e591 100644
--- a/src/web/stop-options.test.ts
+++ b/src/web/stop-options.test.ts
@@ -16,6 +16,7 @@ import { stopsByKey } from '../commands/research/research-report.js';
 import type { StopsView } from '../domain/web/meetup-data.js';
 import type { ResearchOptionsView, RocketOptionsView } from '../domain/web/stop-report-data.js';
 import { GIOVANNI_ONLY_WHEN_SURE } from '../commands/rocket/rocket-input.js';
+import { lineupValue } from '../domain/rocket/lineups.js';
 
 const RESEARCH = `/s/${FAKE_GUILD_ID}/api/research-options`;
 const ROCKET = `/s/${FAKE_GUILD_ID}/api/rocket-options`;
@@ -129,6 +130,30 @@ describe('the pick lists of reports at stops', () => {
       shiny: true,
       image: feedChoice('grunt:water').catches[0]?.image,
     });
+    // A type of two lineups lists them beside it (plan 8R-4L, B9), as `/rocket` takes them.
+    const water = feedChoice('grunt:water');
+    const [mudkips, magikarps] = water.lineups ?? [];
+    if (!mudkips || !magikarps) throw new Error('the water grunt has two lineups');
+    const lineups = view.choices.find((choice) => choice.key === 'grunt:water')?.lineups;
+    expect(lineups?.map(({ catches: _catches, ...rest }) => rest)).toEqual([
+      {
+        key: 'grunt:water:female',
+        value: lineupValue(water, mudkips),
+        label: 'Mudkip, Tentacool, Krabby',
+        fingerprint: mudkips.fingerprint,
+      },
+      {
+        key: 'grunt:water:male',
+        value: lineupValue(water, magikarps),
+        label: 'Magikarp, Feebas',
+        fingerprint: magikarps.fingerprint,
+      },
+    ]);
+    expect(lineups?.[1]?.catches.map((caught) => caught.value)).toEqual([
+      'pokemon:magikarp',
+      'pokemon:feebas',
+    ]);
+    expect(view.choices.filter((choice) => choice.lineups !== undefined)).toHaveLength(2);
     expect(view.choices.at(-1)).toMatchObject({
       key: 'giovanni',
       hideout: true,
diff --git a/src/web/stop-options.ts b/src/web/stop-options.ts
index 057272a154c89d934c8f78a3692e9ee28eafea67..9741f052cacdc70a0e5c64431e7247827d975b9b 100644
--- a/src/web/stop-options.ts
+++ b/src/web/stop-options.ts
@@ -1,5 +1,11 @@
 import type { ResearchTask } from '../domain/research/task.js';
-import { isHideout, parseRocketKey, type RocketChoice } from '../domain/rocket/lineups.js';
+import {
+  isHideout,
+  lineupChoice,
+  lineupValue,
+  parseRocketKey,
+  type RocketChoice,
+} from '../domain/rocket/lineups.js';
 import type { ResearchOptionsView, RocketOptionsView } from '../domain/web/stop-report-data.js';
 import { mapCatch, mapReward } from '../domain/web/stop-report-view.js';
 
@@ -39,8 +45,9 @@ export function researchOptions(input: {
 /**
  * The pick list of a Rocket report on the map (plan 8R-3), as `/rocket` offers it
  * (`rocketChoices`, in its order): each who with its key, name, whether it is a hideout, the
- * catches (pictures only from `origins`), and Giovanni's note (`giovanniNote`); whether the
- * lineups are out of date (`stale`, their own rule) and when they were read. Pure.
+ * catches (pictures only from `origins`), Giovanni's note (`giovanniNote`), and a grunt type's
+ * two lineups (plan 8R-4L: key, the value `/rocket` takes, label, fingerprint, catches); whether
+ * the lineups are out of date (`stale`, their own rule) and when they were read. Pure.
  */
 export function rocketOptions(input: {
   choices: readonly RocketChoice[];
@@ -60,6 +67,20 @@ export function rocketOptions(input: {
         hideout: who !== undefined && isHideout(who),
         catches: choice.catches.map((caught) => mapCatch(caught, input.origins)),
         ...(who?.kind === 'giovanni' ? { note: input.giovanniNote } : {}),
+        ...(choice.lineups === undefined
+          ? {}
+          : {
+              lineups: choice.lineups.map((lineup) => {
+                const taken = lineupChoice(choice, lineup);
+                return {
+                  key: taken.key,
+                  value: lineupValue(choice, lineup),
+                  label: taken.lineup ?? '',
+                  fingerprint: lineup.fingerprint,
+                  catches: lineup.catches.map((caught) => mapCatch(caught, input.origins)),
+                };
+              }),
+            }),
       };
     }),
   };
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index b554490408ecd4b7ac401ef4e39911d74e26c28e..75e1c4672418e91b1a3587e07a0118f654034f83 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -11,6 +11,7 @@ import {
 import { FakeMemberDirectory } from '../../test/support/members.js';
 import { ALICE, BOB } from '../../test/support/parties.js';
 import { pageTask, researchTasksFixture } from '../../test/support/research.js';
+import { feedChoice } from '../../test/support/rocket.js';
 import { STOP_NOON, STOP_ROWS, stopReportingWith } from '../../test/support/stop-reporting.js';
 import { keptRow, wayspotId } from '../../test/support/wayspot-cases.js';
 import {
@@ -31,10 +32,12 @@ import {
 import {
   NOT_YOUR_REPORT,
   NOTHING_LEFT,
+  REPORT_CHANGED,
   REPORT_ENDED,
   stopsByKey,
 } from '../commands/research/research-report.js';
-import { rocketThrottle, rocketWindow } from '../commands/rocket/rocket-input.js';
+import { LINEUPS_CHANGED, rocketThrottle, rocketWindow } from '../commands/rocket/rocket-input.js';
+import { lineupValue } from '../domain/rocket/lineups.js';
 import { MEMBER_WRITE_THROTTLE, Throttles } from '../discord/throttle.js';
 import type { StopReportAnswer } from '../domain/web/stop-report-data.js';
 import { STOP_WRITES_PER_ADDRESS_MINUTE, TYPED_TASK_KEY, type StopWebDeps } from './stop-routes.js';
@@ -499,6 +502,71 @@ describe('reports at stops from the map', () => {
       expect(made.made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
     });
 
+    describe('one lineup of a grunt type (plan 8R-4L)', () => {
+      const water = feedChoice('grunt:water');
+      const [mudkips, magikarps] = water.lineups ?? [];
+      if (!mudkips || !magikarps) throw new Error('the water grunt has two lineups');
+
+      it('reports a lineup picked with its fingerprint, and shows it by its first slot', async () => {
+        const made = await setup();
+        web = made.web;
+        const who = lineupValue(water, magikarps);
+        const answer = await made.post('/rocket', { who, stop: wayspotId(1) });
+        expect(answer.status).toBe(200);
+        expect(answer.json.text).toMatch(
+          /^Water-type grunt at Yellow Mural · catch one of Magikarp, Feebas\nPosted in #west;/,
+        );
+        expect(answer.json.grunt).toMatchObject({
+          who: 'grunt:water:male',
+          name: 'Water-type grunt',
+          lineup: 'Magikarp, Feebas',
+        });
+      });
+
+      it('refuses a lineup whose fingerprint is not of now, uncounted', async () => {
+        const made = await setup();
+        web = made.web;
+        made.fillRocket(9);
+        const stale = await made.post('/rocket', {
+          who: `grunt:water:male#${mudkips.fingerprint}`,
+          stop: wayspotId(1),
+        });
+        expect(stale.status).toBe(422);
+        expect(stale.json.text).toBe(LINEUPS_CHANGED);
+        expect(
+          (await made.post('/rocket', { who: 'grunt:water:male', stop: wayspotId(1) })).json.text,
+        ).toBe(LINEUPS_CHANGED);
+        expect(
+          (await made.post('/rocket', { who: lineupValue(water, mudkips), stop: wayspotId(1) }))
+            .status,
+        ).toBe(200);
+      });
+
+      it('refines not sure which in place, and asks before a hideout naming the lineup', async () => {
+        const made = await setup();
+        web = made.web;
+        const notSure = await made.post('/rocket', { who: 'water', stop: wayspotId(1) }, made.bob);
+        const refined = await made.post('/rocket', {
+          who: lineupValue(water, magikarps),
+          stop: wayspotId(1),
+        });
+        expect(refined.status).toBe(200);
+        expect(refined.json.text).toContain('(was: Water-type grunt, not sure which)');
+        expect(refined.json.grunt?.id).toBe(notSure.json.grunt?.id);
+        expect(made.made.gateway.messagesIn(WEST_CHANNEL)).toHaveLength(1);
+        await made.post('/rocket', { who: 'leader:arlo', stop: wayspotId(2) }, made.bob);
+        const asked = await made.post('/rocket', {
+          who: lineupValue(water, mudkips),
+          stop: wayspotId(2),
+        });
+        expect(asked.status).toBe(422);
+        expect(asked.json.text).toBe(
+          'Arlo was reported here today, and a hideout keeps grunts away all day. Replace ' +
+            'Arlo’s report with the Water-type grunt · Mudkip, Tentacool, Krabby?',
+        );
+      });
+    });
+
     it('refuses who is not in the lineups and a stop of nowhere, uncounted', async () => {
       const made = await setup();
       web = made.web;
@@ -544,6 +612,35 @@ describe('reports at stops from the map', () => {
       );
     });
 
+    it('takes back nothing by a version of the list refined since, for its reporter and staff (L1)', async () => {
+      const made = await setup();
+      web = made.web;
+      const water = feedChoice('grunt:water');
+      const magikarps = water.lineups?.[1];
+      if (!magikarps) throw new Error('the water grunt has two lineups');
+      const notSure = await made.post('/rocket', { who: 'water', stop: wayspotId(1) });
+      const id = notSure.json.grunt?.id ?? 0;
+      const listed = notSure.json.grunt?.madeAt;
+      expect(listed).toBe(STOP_NOON);
+      vi.setSystemTime(STOP_NOON + 60_000);
+      const who = lineupValue(water, magikarps);
+      await made.post('/rocket', { who, stop: wayspotId(1) }, made.bob);
+      const remove = (madeAt: number | undefined, as = made.alice) =>
+        made.post(`/stop-reports/${String(id)}/remove`, { madeAt }, as);
+      // Alice took it back as she saw it in the list: it is Bob's now, changed since.
+      const hers = await remove(listed);
+      expect(hers.status).toBe(409);
+      expect(hers.json.text).toBe(REPORT_CHANGED);
+      made.acting.standing(ALICE, { roleNames: ['Moderator'], administrator: false });
+      expect((await remove(listed)).json.text).toBe(REPORT_CHANGED);
+      expect([...made.store.rows.values()].map((row) => row.subjectKey)).toEqual([
+        'grunt:water:male',
+      ]);
+      // The version that stands is taken back.
+      expect((await remove(STOP_NOON + 60_000, made.bob)).status).toBe(200);
+      expect(made.store.rows.size).toBe(0);
+    });
+
     // Final review of 8X-F, F3: the sentence ends once after a stop whose name ends in a period.
     it('ends its answer once after a stop whose name ends in a period', async () => {
       const made = await setup([
diff --git a/src/web/stop-routes.ts b/src/web/stop-routes.ts
index 3ec79a0766d2ae4565a65d11eb3def4fe729dffd..222baedbea3b301d159de6fc583ad8da1f9e2181 100644
--- a/src/web/stop-routes.ts
+++ b/src/web/stop-routes.ts
@@ -13,6 +13,7 @@ import {
 import {
   NOT_YOUR_REPORT,
   NOTHING_LEFT,
+  REPORT_CHANGED,
   REPORT_ENDED,
   reporterNamed,
   reportResearchAs,
@@ -49,7 +50,7 @@ import type { StopReportAnswer, StopReportsView } from '../domain/web/stop-repor
 import { stopReportView } from '../domain/web/stop-report-view.js';
 import { postLink } from '../render/notify-dm.js';
 import { researchWords, type ChannelNamer } from '../render/research.js';
-import { alreadyReported, rocketWords } from '../render/rocket.js';
+import { alreadyReported, rocketLabel, rocketWords } from '../render/rocket.js';
 import { plain } from '../render/text.js';
 import type { GruntMessageService } from '../services/grunt-messages.js';
 import { regionsAtPoints } from '../services/region-directory.js';
@@ -460,7 +461,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
     hideout: RocketReport,
     grunt: RocketChoice,
   ) =>
-    refuse(reply, 422, hideoutQuestion(hideout.rocket.name, grunt.name), {
+    refuse(reply, 422, hideoutQuestion(hideout.rocket.name, rocketLabel(grunt)), {
       asks: { replacing: hideout.id },
       ...(await rocketShown(guild, userId, hideout)),
     });
@@ -610,6 +611,11 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       };
       const report = await ctx.stopReports.get(guild, id);
       if (!report) return noted('gone', refuse(reply, 409, NOTHING_LEFT));
+      // The version the list showed (review L1): a grunt refined in place since keeps its id.
+      const { madeAt } = body.data;
+      if (madeAt !== undefined && report.madeAt !== madeAt) {
+        return noted('changed', refuse(reply, 409, REPORT_CHANGED));
+      }
       const staff = isMapStaff(acting.standing, userId, deps.parties.ownerId);
       if (!staff && report.reporter.id !== userId) {
         return noted('not-yours', refuse(reply, 403, NOT_YOUR_REPORT));
@@ -618,7 +624,7 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
       const throttled = throttledOnTheMap(deps, reply, key, userId, MEMBER_WRITE_THROTTLE);
       if (throttled) return noted('throttled', throttled);
       const taken = await countedOnTheMap(deps, key, userId, MEMBER_WRITE_THROTTLE, () =>
-        takeBackAs(ctx, guild, id, userId, staff),
+        takeBackAs(ctx, guild, madeAt === undefined ? id : { id, madeAt }, userId, staff),
       );
       switch (taken.kind) {
         case 'removed': {
@@ -627,6 +633,8 @@ export function stopRoutes(scope: FastifyInstance, deps: WebDeps, viewers: Party
         }
         case 'not-yours':
           return noted('not-yours', refuse(reply, 403, NOT_YOUR_REPORT));
+        case 'changed':
+          return noted('changed', refuse(reply, 409, REPORT_CHANGED));
         case 'gone':
           return noted('gone', refuse(reply, 409, NOTHING_LEFT));
       }
@@ -691,5 +699,5 @@ const rocketBodySchema = z
   })
   .strict();
 
-/** A take-back carries nothing. */
-const removeBodySchema = z.object({}).strict();
+/** A take-back's body: nothing, or the version the list showed (`madeAt`, review L1). */
+const removeBodySchema = z.object({ madeAt: z.number().int().nonnegative().optional() }).strict();
````

### Task 7: 8R-4L task 7: Docs for grunt lineups

Prototype commit: `3df73667f3b77ac39c7f525b3bbed643b68b6b3a`

stop-reports.md (Team GO Rocket, Wants and DMs): two lineups of a
grunt type, their keys, fingerprints and storage; the decisions of one
type and the in-place refinement; a report's version (id and madeAt);
/rocket report's choices, readWho and Take back; the edited messages,
in turn per report and of the kind they were sent as; wants, the hour
and Shadow wants by lineup, the reporters not told, and DMs a refine
leaves as they were. notifications-and-dms.md: no lineup is a want;
the notifier by type. web.md: the options' lineups, the POST,
MapGrunt.lineup and the take-back's madeAt. testing.md: the helpers of
plan 8R-4L.

**Files:**

```
 docs/architecture/notifications-and-dms.md |  4 ++--
 docs/architecture/stop-reports.md          | 16 ++++++++--------
 docs/architecture/testing.md               |  2 +-
 docs/architecture/web.md                   |  8 ++++----
 4 files changed, 15 insertions(+), 15 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 3df73667f3b77ac39c7f525b3bbed643b68b6b3a -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `8R-4L task 7: Docs for grunt lineups`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/notifications-and-dms.md b/docs/architecture/notifications-and-dms.md
index 6c1d3d67ade7fcd38362a391bd1924c37c6b4703..63790514995a18c8fd1a9aec133b1e82f3bd48e0 100644
--- a/docs/architecture/notifications-and-dms.md
+++ b/docs/architecture/notifications-and-dms.md
@@ -6,7 +6,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 - A want (`PokemonNotification`) is per member and server and is one of: a species (every form, megas included), one form (`form`, a catalogue key), the shadow raids of either (`shadow`; since plan 8R-2 shadow raids and Team GO Rocket catches, the Shadow box), a raid tier (raids only), perfect or zero IVs (spawns only); a mega is raids only. The columns are read and written only through the codec (`notification-target.ts`: `readNotification` gives the target and the scope in effect; a row it cannot read is skipped, counted and never deleted on its own) and the pure functions of `src/domain/pogo/wants.ts` (`readWants`, `planSetWant`, `rowsOfWant`: duplicate legacy rows are one want with the union of their scopes, two keys of one catalogue entry are one want, a row is rewritten only when its meaning changes). `ctx.wants` (`WantStorage`: `list`, `set`, `remove`, `removeAll`, `count`) is the repository; `MemoryWants` (`test/support/wants.ts`) is its twin and runs the same functions. `pokemonWantFits(catalogue, target, entry, shadowRaid)` says whether a want is for a boss or a spawn. Since plan 8R-1 a raid scope means raids only (no max battles), and the legacy `!wants` codec and the scope rules (`planSetWant`, `widerScope`) are unchanged.
 - **Costumed wants** (plan 8R-4, migration 030; design `2026-10-22-costume-form-wants-design.md`): `PokemonNotification.costumed` and `TargetWant.costumed` (tinyint, default 0) make a Pokémon's want costumed only, a property of the row like the scope, never part of its target, token, unique key or id (`Want.costumed?: true`, a Pokémon's `TargetWant.costumed?: true`; `boxTarget(kind, dex, form, costumed)`, `withCostume`, `isCostumedTarget`; a Stop or Remove takes the row whatever its costume). Rows of one target that disagree read as plain (`readWants`: plain wins, as the wider scope); `planSetWant(…, costumed)` rewrites a row whose costume differs; a `TargetWant` added again takes the costume of its add (an upsert per costume, `createdAt` kept). Every sighting carries `costumed` (`PokemonSighting`): a raid's boss as the list has it in the raid's tier (`ShownBoss.costumed`), a spawn as `SpawnNews.costumed` says (an event on lists it costumed, "Spawn reports"), a research reward by `rewardCostumed` (its Leek Duck name and picture, worked out when read), a max boss and a Rocket catch never. `pokemonWantFits(…, costumed)` fits a costumed want only to a costumed sighting, under the entry the costume copies; a plain want fits either. A mega or primal is never costumed (Matt's ruling 4: written plain, left out of Costumed), so a costumed want of the whole species (no form) fits its mega and primal entries as a plain want would (the catalogue's `kind`): every form and Costumed ticked still tells of the species' mega raids, while a costumed want of one form is no mega's. The matchers (`raidWantsFiring`, `spawnWantsFiring`, `rocketShadowFiring`) give the wants themselves, so a reason carries `costumed` (`wantReason`) and the DM names it "Costumed Pikachu" (`wantTargetLabel(…, costumed)`, `pokemonWantName({ costumed })`: no "(every form)", "Costumed Corsola"), a target "Costumed Pikachu (research)" (`targetWantLabel`); members told of one event share a message only where their reasons read alike (`shownReasonKey`).
-- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy (a grunt type at most one DM an hour for each type; since plan 8R-4 every Rocket target, and `/want rocket`, opens **the Team GO Rocket dialog**, design 4b: `rocketDialog` in `want-dialog.ts`, "Team GO Rocket: what for?", Grunts a string select of the twenty fixed grunts, `rocketOptions` (18 types, "Grunts without a type", "Decoy grunt"), Leaders a checkbox group of Cliff, Arlo, Sierra, Any leader and Giovanni, Remove where any Rocket want is held; ticked as the member's Rocket rows are, plus the target picked; its Submit `wantbox:r:rset1:<flags>[:<server>][:l<page>]:~<token>` (the per-open token of plan 8X-F, left out by `readRocketDialogId`; one without it is `STALE_COMPONENT`), a version and no hash of the lineups, S12, `readRocketDialogId`; `writeRocket` writes what is picked and takes every other Rocket target off in one `TargetWantStorage.change` under the member's lock, nothing picked or Remove takes them all off (`change` gives how many of those to remove were there, so that a first want with nothing picked, decided under the lock, says "Nothing picked: no Team GO Rocket wants.", B8), and "Any leader" beside named leaders is said to cover them; `opensDialog` is true for every Rocket use, F13; `/unwant`'s "Team GO Rocket" (`rocket`, `TEAM_ROCKET`, also typed `team go rocket`) takes every Rocket row off while a single target typed stays one; `/wants` has one line "Team GO Rocket: Fire and Water grunts, Arlo, Giovanni", over three types "7 grunt types", `rocketLine`, with Change… `wantlist:<p>:change:rocket`; a DM's Rocket reason keeps its 8R-2 label with Change… `dm:<server>:change:rocket`, `rocketChangeButtonId`, which opens the dialog for that server). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`; its checkbox group `boxes`, the dialog's other fields under "The Pokémon dialog of plan 8R-4" below): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); since plan 8R-4 what is written at once is a Pokémon or a tier whose dialog would show one box and no other field (S1, `asksAbout`: Mew, a tier without shadow raids), IVs and a reward; a mega (`/want mega charizard y`) opens its species' dialog with that form ticked (`dialogSubject`), and every Team GO Rocket target the Team GO Rocket dialog (above). **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list, today's task list or an event on has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed and the answer saying so in small print, "Only costumed ones are told: Change… in `/wants` can untick Only costumed." (F3; `asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"; since plan 8R-4 one line per species, `wantEntries`: its forms named together up to three, "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above that by count, "Vivillon (4 of 21 forms)", `Costumed` before it where every row is, an Unown letter a line of its own; in the order Pokémon by species name, tiers in tier order as "Tier 5 raids" (Matt's R-M4: on the list alone, `WantEntry.listLabel`; `/unwant`'s choices and answers keep "T5 raids"), Team GO Rocket, then the lines without a dialog: items and Mega Energy by name as "Rare Candy: Research", "Perfect IVs: Spawns", "Zero IVs: Spawns"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
+- What is no `PokemonNotification` is a `TargetWant` (plan 8R-1, `stop-reports.md`; table `TargetWant`, `ctx.targetWants`: `TargetWantStorage` `list`, `change`, `remove`, `removeAll`, `count`, `wanting(guildId, targets)` over the index `(guildId, target)`; twin `MemoryTargetWants`): a token per row (`src/domain/notify/target-wants.ts`: `research:pokemon:<dex>[:<form>]`, `research:item:<key>`, `research:energy:<dex>`, `dynamax:<dex>[:<form>]`, `gigantamax:<dex>[:<form>]`; plan 8R-2's Rocket targets `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra|any>`, `giovanni`; never a lineup's key `grunt:<type>:male|female`, plan 8R-4L, `isRocketWho`: wants stay by grunt type, and a lineup's catch is wanted by its Shadow box), written with an upsert that changes nothing (never `insert ignore`, which hides a foreign key's refusal). `/want target:` (no `type` since 8R-1; design 7, Matt's answers 2 and 9) takes a Pokémon, a form, a raid tier, perfect or zero IVs, an item or Mega Energy of the task list, or (plan 8R-2) a Team GO Rocket target: a grunt type, a leader, any leader, Giovanni or the decoy (a grunt type at most one DM an hour for each type; since plan 8R-4 every Rocket target, and `/want rocket`, opens **the Team GO Rocket dialog**, design 4b: `rocketDialog` in `want-dialog.ts`, "Team GO Rocket: what for?", Grunts a string select of the twenty fixed grunts, `rocketOptions` (18 types, "Grunts without a type", "Decoy grunt"), Leaders a checkbox group of Cliff, Arlo, Sierra, Any leader and Giovanni, Remove where any Rocket want is held; ticked as the member's Rocket rows are, plus the target picked; its Submit `wantbox:r:rset1:<flags>[:<server>][:l<page>]:~<token>` (the per-open token of plan 8X-F, left out by `readRocketDialogId`; one without it is `STALE_COMPONENT`), a version and no hash of the lineups, S12, `readRocketDialogId`; `writeRocket` writes what is picked and takes every other Rocket target off in one `TargetWantStorage.change` under the member's lock, nothing picked or Remove takes them all off (`change` gives how many of those to remove were there, so that a first want with nothing picked, decided under the lock, says "Nothing picked: no Team GO Rocket wants.", B8), and "Any leader" beside named leaders is said to cover them; `opensDialog` is true for every Rocket use, F13; `/unwant`'s "Team GO Rocket" (`rocket`, `TEAM_ROCKET`, also typed `team go rocket`) takes every Rocket row off while a single target typed stays one; `/wants` has one line "Team GO Rocket: Fire and Water grunts, Arlo, Giovanni", over three types "7 grunt types", `rocketLine`, with Change… `wantlist:<p>:change:rocket`; a DM's Rocket reason keeps its 8R-2 label with Change… `dm:<server>:change:rocket`, `rocketChangeButtonId`, which opens the dialog for that server). Its autocomplete offers the Pokémon, forms, tiers and IVs first (after the raid bosses, the Pokémon of today's Rocket lineups the text names by name, design 9.9), then the Rocket targets (`rocketWantChoices`: only on a word that names one by itself, a type, a leader, `any`, `giovanni`, `decoy`, in full or begun by three letters; `grunt`, `leader` or `gr` alone find none, fix B3; the untyped grunts by `no` in full or `none`, fix R1, `none` beside the zero IVs; typed in full, `no type`, `no type grunt` and `grunt (no type)` are the untyped grunts, fix S2, while `none` stays zero IVs, the legacy word a former legacy member's `/unwant target:none` uses, fix F4; labels `rocketTargetLabel`: "Water-type grunt", "Arlo (Team GO Rocket leader)", "Any Team GO Rocket leader", "Giovanni (Team GO Rocket boss)") and the items and Mega Energy, together at most five places (`REWARD_ROOM`) where the Pokémon would fill the list (`rewardWantChoices`; the design's "today's rewards first" is not built); `readWanted` reads typed text (`dragon grunt`, `arlo`, `any leader`). It declares `defer` as a function: none where the dialog opens (the dialog is the first answer), `late` for every use that writes at once (the use's target is read once per interaction). A Pokémon or a form opens a dialog "Dratini: what for?" (`wantDialog`; its checkbox group `boxes`, the dialog's other fields under "The Pokémon dialog of plan 8R-4" below): Raids; Dynamax and Gigantamax where the game master or the max boss list has them; Spawns where it appears in the wild; Research but for a mega; Shadow where the game master has a shadow, a shadow raid boss of now is one, or (plan 8R-2) it can be caught from today's Rocket lineups (`pokemonBoxes`, `src/domain/pogo/want-boxes.ts`; the shadow row means shadow raids and Rocket catches); a tier asks Raids and Shadow raids (`tierBoxes`). The boxes are ticked as the member's rows are (`WantBoxStorage.held`, read within the three seconds, `readInTime`); since plan 8R-4 what is written at once is a Pokémon or a tier whose dialog would show one box and no other field (S1, `asksAbout`: Mew, a tier without shadow raids), IVs and a reward; a mega (`/want mega charizard y`) opens its species' dialog with that form ticked (`dialogSubject`), and every Team GO Rocket target the Team GO Rocket dialog (above). **The Pokémon dialog of plan 8R-4** (design 3, the mockups of 2026-10-22; `wantDialog` / `WantDialogView` in `src/commands/notifications/want-dialog.ts`, `wantDialogFor` in `wants.ts`): the title by the species' name ("Corsola: what for?", `dialogName`), one text, then at most four fields, a dialog's five components being Discord's limit (every other sentence goes into the one text: the mega note "A mega is told for raids only.", "Your Ponyta wants differ by form; Submit sets them alike."; Charizard's is the largest, a test builds it): **Tell me about** (`boxes`, two boxes or more; their descriptions, `BOX_DESCRIPTIONS` with `{name}`, only without a Which field; Research no longer for a legendary, mythical or ultra beast unless today's task list rewards it or the member holds it, `shownBoxes` / `dialogBoxes`), **Which <species>** (`forms`, `whichEntries`: a species of 2 to `WHICH_CAP` 25 entries, megas included, by their catalogue names; a checkbox group to ten, a string select above; none for Unown, whose letters are dialogs of their own, `wantbox:p201:…:unown_a`), **Costumes** (`costumed`, one `ComponentType.Checkbox` under a Label `Only costumed <species>` / `Only costumed ones`, shown where the game data has a costume of any of its forms or the raid boss list, today's task list or an event on has it costumed now, `costumesShown`, or where a row held is costumed, A1: a Submit never drops a costume unseen; not shown, each row keeps its own) and **Remove** (`remove`, one Checkbox, `Remove <species> from my list`, where the member holds a want of it; it wins over everything). With one box and none of Which and Costumes it writes at once, a costumed row held staying costumed and the answer saying so in small print, "Only costumed ones are told: Change… in `/wants` can untick Only costumed." (F3; `asksAbout`, decided synchronously for the deferral, S1: Mew; what a use is about, `WantUse`, is read once per interaction, `useOf`, so the deferral and `execute` decide alike, A8); with one box and a Which field (Arceus) there is no Tell me about field and the text says what it is told for. A first want opens with no box ticked and every form ticked (a form picked from the list alone: `/want galarian corsola`, `/want mega charizard y`, `dialogSubject`), Costumed off, and its Tell me about and Which fields required (`required: true`, `min_values` 1: Discord lets no Submit through till a box and a form are ticked; Matt's R-M2, no "All" option), a tier's dialog alike; with wants, as stored (a box ticked where any row has it, Costumed only where every row but the megas is, `allCostumed`, the picked form added; the rows that differ leave a mega's out, A3), and the fields not required, so that nothing ticked still takes the want off (Q1). **In the post of a raid or a max battle** (Matt's R-M1; `postSubject` and `postBoxOf` in `wants.ts`, the party read from the post's id in memory by `partyOf`, so `opensDialog` stays synchronous and `showModal` the first answer): `/want` with nothing typed (the option is not required) is the boss (a form of a species with several picked in its species' dialog), an egg its tier; a boss the game data does not know is refused (Matt's Q1, F1: a raid's "Pine doesn't know this raid's boss yet: name a Pokémon, or `/want t5` for the tier.", the tier its own; a max battle's "Pine doesn't know this battle's boss yet: name a Pokémon."); the dialog ticks only the post's kind of battle for a first want (a raid's Raids, a shadow raid's Shadow, a tier's Raids or Shadow raids, a max battle's Dynamax or Gigantamax), also for a Pokémon typed there, and beside the rows held for a want held. Anywhere else nothing typed is a `UserError` (`NAME_A_POKEMON`: "Name a Pokémon: `/want <Pokémon>`. In the post of a raid or a max battle you can leave it out for its boss."; an ended raid's post is out of the store, so as any other). These refusals and a name it cannot read come from the guard `readsUse` (it reads the use, `useOf`), so they do not count against the throttle (F2). The Submit (`answerOfSubmit`, `readWantSubmit`: a Which field read as its forms, every form ticked as the species row; a missing field or another Which hash is `STALE_COMPONENT`) writes through `WantBoxStorage.set`, and the answer names the want as `/wants` does (`rowsLabel`: "Costumed Pikachu", "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above three by count) with its boxes, in small print where Costumed meets a box no costumed Pokémon has appeared in (`NEVER_COSTUMED_YET`: Dynamax, Gigantamax, Shadow; a warning, never a refusal) and where a mega ticked without Raids is off. `/unwant` of a form whose species row covers it (`coveringSpecies`, review R4e) removes nothing and says so. Raids and Spawns are the `PokemonNotification` row's scope, Shadow its shadow row, the others `TargetWant` rows: the Submit (since plan 8R-4 `wantbox:p<dex>:set2:<mask>:<flags>:<which>[:<server>][:<form>][:l<page>]:~<token>`, a tier `wantbox:t<level>:set2:…`; `src/commands/notifications/want-dialog.ts`, `wantDialogId` / `readWantDialogId`: `<mask>` the boxes the dialog showed as a bit per box of `allBoxes` in base 36, `<flags>` whether it showed Costumes (1) and Remove (2), `<which>` `whichHash` of the keys its Which field showed, `0` for none (`NO_WHICH`), the server where it was opened from a DM, the form only beyond the Which field (an Unown letter), the page of `/wants`, last `openToken` of when it opened (plan 8X-F: Discord's client shows what was last submitted under an id in place of what the dialog ticks), which `readWantDialogId` leaves out; an id of before (`set`) or of any other shape, one without its token, and a Which hash that is not the field's now, are `STALE_COMPONENT`; `wantBoxControls`, `NOTIFICATION_THROTTLE`; a Submit without its checkbox group is `STALE_COMPONENT`) writes the boxes it showed, whatever can happen by then, in one transaction under the member's lock; nothing ticked takes the target off. **One answer per species** (plan 8R-4, design 3; `src/domain/pogo/species-answer.ts`): an answer (`BoxAnswer`: the forms that stand, `undefined` the subject's own row, of a species the species row; the boxes ticked of those shown; costumed; Remove) covers a scope (`AnswerScope`, `scopeOf`: a species is `wide`, every row of its Pokédex number in both tables, `PokemonNotification.pokemon = <dex>` and `TargetWant.target` `<kind>:<dex>` exactly or `<kind>:<dex>:%`, so 25 never reads 251; a species with more entries than the Which field holds, `WHICH_CAP` 25, Unown, is not: its species row and each letter are answers of their own; a tier is its own). `WantBoxStorage.held(member, server, scope)` gives the rows by form (`HeldRow`: its boxes, costumed when every row of it is; `heldRows`), `set(member, server, answer, at)` carries out `planAnswer`: Remove, no form or no box shown ticked takes every row of the scope away, the boxes the dialog did not show included (A2, Q1); every form ticked gets the boxes ticked of those shown and keeps the others as its row had them (a new row: as the scope's rows had them together), all with the answer's costume (`costumed` undefined where the dialog did not show Costumes: each row keeps its own, a new row costumed where every row held is, `allCostumed`, A1); a mega a raid row and nothing else, always plain, nothing without Raids (review R4c, A-D3; `FormReader`'s `mega`); every other row goes; in one transaction under the member's lock (`WantBoxRepository`, twin `MemoryWantBoxes`, both `wantBoxCases`). `removalAnswer(scope)` is `/unwant`'s and a list's Remove. `/wants` lists each target once with its boxes ("Dratini: Raids, Research, Shadow"; since plan 8R-4 one line per species, `wantEntries`: its forms named together up to three, "Arceus, Arceus (Dragon-Type), Arceus (Fire-Type)", above that by count, "Vivillon (4 of 21 forms)", `Costumed` before it where every row is, an Unown letter a line of its own; in the order Pokémon by species name, tiers in tier order as "Tier 5 raids" (Matt's R-M4: on the list alone, `WantEntry.listLabel`; `/unwant`'s choices and answers keep "T5 raids"), Team GO Rocket, then the lines without a dialog: items and Mega Energy by name as "Rare Candy: Research", "Perfect IVs: Spawns", "Zero IVs: Spawns"), and `/settings show` counts those lines (`wantLineCount`), `/unwant` takes every box of a target off, `/unwant-all` and the DM Stop buttons cover both tables.
 - What a member picked in the `target` option of `/want` or `/unwant` is a want token (`wantToken` / `parseWantToken`: `pokemon:<dex>[:<form>][:shadow]`, `tier:<level>[:shadow]`, `iv:perfect|zero`): the value of an autocomplete choice, never part of a custom id. Text sent without picking never guesses (`readWantText`): it acts only when it is a tier or IV word in full (`wantWord`), exactly a species' name (every form) or exactly one form's own name, with `shadow` before either; anything else is refused with suggestions. A bare number is a tier or IV word, never a Pokédex number.
 - Wants are named in one way everywhere (`wantLabel` / `wantName` in `src/commands/notifications/want-input.ts`): "X (every form)" for a species with several entries, "X (base form)" for its plain entry, "Shadow X", and the scope after " · " in the choices of `/unwant`.
 - Gym targets (`GymNotification`; `gym` holds a gym id as text) are `ctx.gymTargets` (`GymTargetStorage`), with `MemoryGymTargets` as the twin. In code "target" alone is what a want is for; a gym a member wants raids of is a gym target.
@@ -14,7 +14,7 @@ What members ask to be told about (wants and `/want`'s boxes, gym targets, new t
 
 ## The notifier
 
-- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
+- Whoever changes a party tells `PartyNotifier` (`src/services/notify-service.ts`) explicitly, with who acted: `maxReported` and `maxChanged` (plan 8X-3: a max battle's report, once its post exists, and a boss that is another; who wants the boss, `maxWantsFiring`: since plan 8R-1 the Dynamax box of a Dynamax battle and the Gigantamax box of a Gigantamax one (`TargetWant` `dynamax:` / `gigantamax:`, of the species or of the boss's form; Matt's answer 9 of the stop reports design), never a raid, tier, shadow or spawn want, no gym target; at most one DM an hour per member, boss and kind (a Gigantamax Machamp is told within the hour of a Dynamax one), `MAX_WANT_QUIET_MS`, kept in memory and lost on a restart, read when the members are gathered and written as each message is put in line, so two reports of one boss moments apart at two spots may both reach a member; the DM says so in small print, `maxHourNote`: "You won't be told about more Dynamax Machamp battles for an hour."; the spot's and the boss's names through `plainNoLinks`), `raidReported`, `raidChanged(before, after, actorId)` (the one call for every change of a raid; the notifier decides whether boss, tier or gym differ; the clock passes null), `raidMoving` / `raidMoved`, `trainCreated` (the DM names a train of max battles by its kind, "A new Gigantamax Train has been announced", plan 8X-4; a raid train "A new train" as before), `meetingTimeChanged` (a group's meeting time in a raid or a max battle, `isBattle`; the DM names `the max battle at <spot>`), `startTimeChanged`, `spawnReported`, `researchReported` (plan 8R-1, `stop-reports.md`, "Wants and DMs": a research report's DM per region channel, with a member's own variant of the stops not told yet, `Announcement.variant`), `rocketReported` (plan 8R-2, the same section: a Rocket report's DM per region channel; a grunt at the spawn priority, one an hour per member and grunt type; a hideout once a day per stop; since plan 8R-4L a lineup's report is wanted, quiet and announced by its type, `typeKeyOf`, its Shadow wants judged by its own catches, and a grunt refined in place by a lineup is told again as a report, the hour per type keeping a second DM away, never to its reporter or the reporter of the grunt it changed, `RocketNews.alsoActors`, review R3, who have heard of the type for the hour; DMs sent before a refine are not changed). Every method returns at once and never throws (`safely`), and is called after the party's own effects. `NotifyService` matches with the pure functions of `src/domain/notify/reasons.ts`, asks `viewers`, and remembers per party which reasons it told which member: one DM per member and event, only for reasons not yet told, never to the actor (whose reasons count as told); the memory is shared by the two parties of a move across regions and forgotten at the party's end. A boss-set member is told every boss that differs from the last one they were told. Messages to everybody signed up (meeting and start times) have a line of their own per party, ask nobody and remember nothing. `close()` is for shutdown. Only meeting-time DMs are sent where `features.notifications` is off.
 - New-train DMs are per member and server: `ctx.newTrains` (`NewTrainStorage`: `isOn`, `set`, `wanting(guildId)`; table `NewTrainNotification`; twin `MemoryNewTrains`). The legacy column `User.newTrain` is neither read nor written. Boss-set is still one setting of the member.
 
 ## Sending direct messages
diff --git a/docs/architecture/stop-reports.md b/docs/architecture/stop-reports.md
index 89fb4f149d7d837985eb0464d1e7c0be3e407007..75c003660f9c83ce4195706afa725b539305c208 100644
--- a/docs/architecture/stop-reports.md
+++ b/docs/architecture/stop-reports.md
@@ -28,19 +28,19 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 
 ## Reports and `/research`
 
-- `StopReportService` (`ctx.stopReports`) reports a task at one to five stops in the period on now (`reportResearch`): each stop's report of the period is replaced, whoever made it (`StopReportStorage.save` gives the one replaced), and ends with the period (`endsAt`). Listeners hear `changed(serverId, stops)` (the posts of the regions those stops lie in) and `reported(news)` (the notifier: only stops that did not have this very task in the period). A replacement is a report of its own: the replaced row is deleted and a new one made under the same lock, so a report's id never changes what it is (an old answer's Take back or "Same task at more stops…" finds its report gone and answers so; `/research remove` takes back by the id it read, and says `REPORT_CHANGED` where the report was replaced meanwhile). `takeBack(serverId, ids, by, staff)` removes a member's own reports, any for staff; a replaced report does not come back. The hourly upkeep (`PartyScheduler`, `stops`) sweeps ended reports.
+- `StopReportService` (`ctx.stopReports`) reports a task at one to five stops in the period on now (`reportResearch`): each stop's report of the period is replaced, whoever made it (`StopReportStorage.save` gives the one replaced), and ends with the period (`endsAt`). Listeners hear `changed(serverId, stops)` (the posts of the regions those stops lie in) and `reported(news)` (the notifier: only stops that did not have this very task in the period). A replacement is a report of its own: the replaced row is deleted and a new one made under the same lock, so a report's version never changes what it is (its id; for Rocket, the id and `madeAt`, plan 8R-4L, review L1: a grunt refined in place keeps its id) (an old answer's Take back or "Same task at more stops…" finds its report gone and answers so; `/research remove` takes back by the id it read, and says `REPORT_CHANGED` where the report was replaced meanwhile). `takeBack(serverId, refs, by, staff)` removes a member's own reports, any for staff; a replaced report does not come back. A `ReportRef` is an id or a version `{ id, madeAt }` (review L1): one refined in place since is `changed`, before whose it is, and nothing of it is taken back (`StopReportStorage.remove(id, serverId, madeAt?)` asks the version again with the row locked); `kept(serverId, id)` gives a report by its id as it is kept now. The hourly upkeep (`PartyScheduler`, `stops`) sweeps ended reports.
 - `/research report task: stop: [stop2: … stop5:] [reward:]` and `/research remove stop:` (`src/commands/research/`): from a region's channel, forum or post (`RESEARCH_FROM_A_REGION`); where the server's regions hold no stop, `NO_STOPS_HERE` (Matt's answer 7). `task` is a choice of the list (found by reward words too) or text typed in full (free text, capped at 100 characters, shown through `plainNoLinks`; with `reward:` a Pokémon, item or Mega Energy); a key gone from the list is `TASK_LIST_CHANGED`. A stop is a choice of the stops (`stop:<key>`), typed text naming one, or a maps link (the nearest stop within 50 m, `PlaceFinder.nearestStop`). The guard reads all of it so a refusal does not count; the throttle is `settings.research.throttle` in a window of its own (`researchThrottle`, `researchWindow`); one report of five stops counts once. `defer: 'late'`.
-- **One code path with the map** (plan 8R-3; `src/commands/research/research-report.ts`): `reportResearchAs(ctx, serverId, { stops, subject, reporter }, also?)` is the report as the member and the view of its answer's words (`ResearchWordsView`: the region channels whose posts show it, until when, none named in rehearsal mode); `/research report`, "Same task at more stops…" and the map call it. `stopsByKey` names stops by their keys (a titled PokéStop in a region of the server, a stop of Pine's own by `pine-<id>`, each once; the menu's and the map's). `takeBackAs(ctx, serverId, id, by, staff)` takes a report back by id (`removed` with `tookBackWords`, `not-yours`, `gone`): `/research remove`, `/rocket remove` and the map. `reporterNamed` names a reporter (the name shown, else the account's, cut to 100). `NOT_YOUR_REPORT`, `REPORT_CHANGED` and `NOTHING_LEFT` (a Take back that finds nothing) are its words. `researchWords(view, channel)` (`src/render/research.ts`) words the answer with the caller's `ChannelNamer` (`DISCORD_CHANNEL`, `<#id>`, for the commands); `researchAnswer` wraps it with the controls and is the same message as before (an inline snapshot guards it).
+- **One code path with the map** (plan 8R-3; `src/commands/research/research-report.ts`): `reportResearchAs(ctx, serverId, { stops, subject, reporter }, also?)` is the report as the member and the view of its answer's words (`ResearchWordsView`: the region channels whose posts show it, until when, none named in rehearsal mode); `/research report`, "Same task at more stops…" and the map call it. `stopsByKey` names stops by their keys (a titled PokéStop in a region of the server, a stop of Pine's own by `pine-<id>`, each once; the menu's and the map's). `takeBackAs(ctx, serverId, ref, by, staff)` takes a report back by its `ReportRef` (`removed` with `tookBackWords`, `not-yours`, `changed` where it was refined in place since the version asked for, `gone`): `/research remove` by the id it read, `/rocket remove` by the version it read (`{ id, madeAt }`, fix round 2, F6: a report refined meanwhile is `REPORT_CHANGED`), and the map. `reporterNamed` names a reporter (the name shown, else the account's, cut to 100). `NOT_YOUR_REPORT`, `REPORT_CHANGED` and `NOTHING_LEFT` (a Take back that finds nothing) are its words. `researchWords(view, channel)` (`src/render/research.ts`) words the answer with the caller's `ChannelNamer` (`DISCORD_CHANNEL`, `<#id>`, for the commands); `researchAnswer` wraps it with the controls and is the same message as before (an inline snapshot guards it).
 - The answer (`researchAnswer`, `src/render/research.ts`, for the reporter alone): the task and rewards, each stop (with what it replaced, "again" for the same task), where it shows (in rehearsal mode, which makes no post, only until when) and until when (`periodEndWords`: "until midnight", the time, with its day when it is not today), "Same task at more stops…" (`research:<id>:more`: a menu of up to 25 stops within `MORE_STOPS_METRES` (2 km) of the first without this task in the period, five at once; it counts in `/research report`'s window through the throttle's `as`, gives the use back where the report has ended or was replaced (`REPORT_ENDED`, `givesBack`), and answers apart with its own Take back) and "Take back" (`research:<id>:back[:<id>…]`, as many ids as fit; the rest by `/research remove`).
 
 ## Team GO Rocket (plan 8R-2)
 
-- **The lineups.** `settings.rocket` has a default for every key (always on, no switch): `url` (ScrapedDuck's `rocketLineups.min.json`, `ROCKET_LINEUPS_URL`), `refreshHours` 6, `staleAfterHours` 24 (at least two refreshes), `gruntMinutes` 30, `throttle` `{ uses: 10, minutes: 30 }` (`/research`'s numbers in a window of its own, design 9.12). `RocketLineupService` (`ctx.rocketLineups`: `choices()`, `byKey`, `readAt`, `stale(now)` as the task list's) reads the feed with Pine's User-Agent and a byte cap (`readLimitedJson`, `MAX_ROCKET_FEED_BYTES`), keeps the last good list in `RocketLineup` and takes it at start without the network, with the guard of the task list (a read of fewer than half the choices is kept out unless the read before agrees or the list is out of date; a feed of no lineup throws, so it never empties the list; out of date said once). `parseRocketLineups` (`src/domain/rocket/lineups.ts`, pure) makes one choice per grunt type (a type of two lineups, the male and female water grunts, is their union), the untyped grunts, the decoy, Cliff, Arlo, Sierra and Giovanni, in that order (grunt types by name); keys `rocketKey`: `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra>`, `giovanni`; names `rocketName` ("Water-type grunt", "Grunt (no type)", "Decoy grunt"). The catches are the Pokémon marked `isEncounter` in any slot (Giovanni's is in the third), named by the catalogue (`identifyBoss` of name and picture), each once; a lineup of an unknown title, leader or type is skipped and counted. `/rocket` always offers and takes the hideouts (the decoy, Cliff, Arlo, Sierra, Giovanni), with their catches where the lineups have them, and the grunt types of the lineups (every type, without catches, before any lineups were ever read; `rocketChoices`, fix B5): only a grunt type gone from the lineups is `LINEUPS_CHANGED`.
-- **One Rocket report per stop and day** (design 5.2, Matt's answer 4). A report is a `StopReport` row of the kind `rocket` (`RocketReport`: the detail is who by name and the catches as the lineups had them; `subjectKey` its `rocketKey`) in the day's period (`rocketDay`: `day:<date>` to local midnight; events change no hideout). Grunt and hideout share the row of the unique `(serverId, stopKey, kind, periodKey)`, so which stands is decided with that row locked: `StopReportStorage.saveUnless(report, keeps)` asks `decideRocket` (`src/domain/rocket/reports.ts`, pure) inside the transaction: nothing standing (or ended), reported; a hideout (a leader, Giovanni, the decoy) replaces whatever stands; the same grunt standing is `already`; another grunt replaces it; a grunt where a hideout stands `asks`, unless the member said Replace to that very hideout (`replacing` its id). `StopReportService.reportRocket` gives the outcome; a grunt stands `gruntMs` (`gruntMinutes`), a hideout until midnight; what it replaced while it stood is told to the listeners as `ended`, a hideout made or replaced draws the posts (`changed`), the same hideout again is no news. The decision holds across midnight (fix A2): `reportRocket` passes `standingAt`, so a Rocket report of another period that still stands at the stop (a grunt of yesterday past midnight) is the one decided against, locked with the rest and replaced (told as `ended`). `rocketAt(serverId, stopKey)` is the stop's Rocket report; `at` is research only. `takeBack` tells what it removed as `ended` too, and `changed` only of research and hideouts (none for a grunt alone, fix A4).
-- **Reporting** goes through `RocketService` (`src/services/rocket-reports.ts`, `ctx.rocket`; `/rocket` and the map call it through `reportRocketAs`): the report (`rocketSubject(choice)`), then for a grunt its message in each region channel whose outline holds the stop (`channelsAt`, `regionsAtPoint`), then `NotifyService.rocketReported` with the messages (`RocketNews`); `already` comes back with the standing grunt's messages (`messagesOf`). Only storing throws, before anything is posted (fix A1): a channel whose message fails is passed over, and the notifier is told of what was posted. Outside rehearsal mode a grunt posted in none of its stop's region channels (all refused, or the bot shutting down) is taken back and answered `unposted` (fix A5: unseen, it would only answer "Already reported" without a link); a hideout it had replaced is put back under a new id in the grunt's place in one step under the stop's lock, so there is no moment without a report (`StopReportService.restore`, fix S4: unless its day has ended or another report than the grunt stands there by then; no new DM; the post is drawn anew), a grunt it had replaced cannot come back (its message is gone) and is named (fix R2); `/rocket` says so and gives the use back. A grunt that is no longer kept once its messages are posted (replaced by a newer report, or taken back, while they went out; `StopReportService.isKept`, read anew) is `overtaken` (fix F3): nobody is told, its messages are deleted, and `/rocket` answers that a newer report at the stop took its place and gives the use back. Outside rehearsal mode a grunt's DMs name only the channels it was posted in (fix R3). In rehearsal mode it has no message service: nothing is posted, the report is kept and told.
+- **The lineups.** `settings.rocket` has a default for every key (always on, no switch): `url` (ScrapedDuck's `rocketLineups.min.json`, `ROCKET_LINEUPS_URL`), `refreshHours` 6, `staleAfterHours` 24 (at least two refreshes), `gruntMinutes` 30, `throttle` `{ uses: 10, minutes: 30 }` (`/research`'s numbers in a window of its own, design 9.12). `RocketLineupService` (`ctx.rocketLineups`: `choices()`, `byKey`, `readAt`, `stale(now)` as the task list's) reads the feed with Pine's User-Agent and a byte cap (`readLimitedJson`, `MAX_ROCKET_FEED_BYTES`), keeps the last good list in `RocketLineup` and takes it at start without the network, with the guard of the task list (a read of fewer than half the choices is kept out unless the read before agrees or the list is out of date; a feed of no lineup throws, so it never empties the list; out of date said once). `parseRocketLineups` (`src/domain/rocket/lineups.ts`, pure) makes one choice per grunt type (a type of two lineups, the male and female water grunts, is their union), the untyped grunts, the decoy, Cliff, Arlo, Sierra and Giovanni, in that order (grunt types by name); keys `rocketKey`: `grunt:<type>`, `grunt:none`, `decoy`, `leader:<cliff|arlo|sierra>`, `giovanni`; names `rocketName` ("Water-type grunt", "Grunt (no type)", "Decoy grunt"). **Two lineups of one grunt type** (plan 8R-4L; design `2026-10-22-costume-form-wants-design.md`, 4b and S5–S11): a grunt type the feed lists exactly twice, of the two genders (read from the feed's `name`, "female" before "male", as words) with different first slots, keeps both lineups in its choice (`RocketChoice.lineups`, in the feed's order: `lineup` `male|female`, `first` the first slot's names, its own `catches`, and `fingerprint`, `lineupFingerprint`: `whichHash` of the first slot, `|` and the catches' keys or names, worked out from the data and never stored); anything else (no gender word, one gender twice, the same first slot, three lineups) and every hideout, the decoy included, is the merged choice only; the choice's own catches stay the union. A lineup's key is `grunt:<type|none>:male|female` (`parseRocketKey` reads a third part only for a grunt, only those two words; `typeKeyOf` gives its type's key, `grunt:water`, which wants, the hour a type is quiet and the notifier's line use); it exists only in reports and choices (`lineupChoice`: the type's name, the lineup's catches, its first slot in short as `lineup`, `Magikarp, Feebas`; `lineupValue`: `<key>#<fingerprint>`, what a choice is picked by). The gender is never shown. `RocketLineup` keeps the lineups inside its `catches` JSON (no migration: `rocketKey` is `varchar(20)`): a bare list (rows of before, choices without lineups) or `{ catches, lineups }` without the fingerprints; a row whose lineups cannot be read (also two of one gender or of one first slot, review L2) is the merged choice, with a warning; the twin keeps them without fingerprints too and works them out on reading (review L3). `choices()` stay one per type, so the shrink guard compares types. The catches are the Pokémon marked `isEncounter` in any slot (Giovanni's is in the third), named by the catalogue (`identifyBoss` of name and picture), each once; a lineup of an unknown title, leader or type is skipped and counted. `/rocket` always offers and takes the hideouts (the decoy, Cliff, Arlo, Sierra, Giovanni), with their catches where the lineups have them, and the grunt types of the lineups (every type, without catches, before any lineups were ever read; `rocketChoices`, fix B5): only a grunt type gone from the lineups is `LINEUPS_CHANGED`.
+- **One Rocket report per stop and day** (design 5.2, Matt's answer 4). A report is a `StopReport` row of the kind `rocket` (`RocketReport`: the detail is who by name and the catches as the lineups had them; `subjectKey` its `rocketKey`) in the day's period (`rocketDay`: `day:<date>` to local midnight; events change no hideout). Grunt and hideout share the row of the unique `(serverId, stopKey, kind, periodKey)`, so which stands is decided with that row locked: `StopReportStorage.saveUnless(report, keeps)` asks `decideRocket` (`src/domain/rocket/reports.ts`, pure) inside the transaction: nothing standing (or ended), reported; a hideout (a leader, Giovanni, the decoy) replaces whatever stands; the same grunt standing is `already`; another grunt replaces it; a grunt where a hideout stands `asks`, unless the member said Replace to that very hideout (`replacing` its id). Of one grunt type (plan 8R-4L, S10): "not sure which" where a lineup stands is `already` (the lineup says more); a lineup where "not sure which" or the other lineup stands, or the same lineup whose first slot differs (`StandingRocket.rocket.lineup`: the lineups rotated within the grunt's time, review L5), is `refine`, which changes the standing report **in place** (Matt's B2): `saveUnless`'s `decide` answers a `StandingVerdict` (`keep`, `replace`, `update`), and `update` gives that row the new report's who, detail, reporter, `madeAt` and `endsAt` under the stop's lock, keeping its id (a version strictly newer than the standing one, fix round 2, F1: `newerThan` makes `madeAt` at least a millisecond after the standing row's and moves `endsAt` as much, so the writes of one id come in the order of their `madeAt`, whatever clock each read, and two versions are never equal; the report given back is the one written, which the messages and the DMs show; `SaveOutcome.inPlace`; the other rows of its place go as a replacement takes them; a duplicate met by the update runs the whole again, as an insert's does); `reportRocket` answers `refined`, tells nothing `ended` and draws no post. `StopReportService.reportRocket` gives the outcome; a grunt stands `gruntMs` (`gruntMinutes`), a hideout until midnight; what it replaced while it stood is told to the listeners as `ended`, a hideout made or replaced draws the posts (`changed`), the same hideout again is no news. The decision holds across midnight (fix A2): `reportRocket` passes `standingAt`, so a Rocket report of another period that still stands at the stop (a grunt of yesterday past midnight) is the one decided against, locked with the rest and replaced (told as `ended`). `rocketAt(serverId, stopKey)` is the stop's Rocket report; `at` is research only. `takeBack` tells what it removed as `ended` too, and `changed` only of research and hideouts (none for a grunt alone, fix A4).
+- **Reporting** goes through `RocketService` (`src/services/rocket-reports.ts`, `ctx.rocket`; `/rocket` and the map call it through `reportRocketAs`): the report (`rocketSubject(choice)`), then for a grunt its message in each region channel whose outline holds the stop (`channelsAt`, `regionsAtPoint`), then `NotifyService.rocketReported` with the messages (`RocketNews`); `already` comes back with the standing grunt's messages (`messagesOf`). Only storing throws, before anything is posted (fix A1): a channel whose message fails is passed over, and the notifier is told of what was posted. Outside rehearsal mode a grunt posted in none of its stop's region channels (all refused, or the bot shutting down) is taken back and answered `unposted` (fix A5: unseen, it would only answer "Already reported" without a link); a hideout it had replaced is put back under a new id in the grunt's place in one step under the stop's lock, so there is no moment without a report (`StopReportService.restore`, fix S4: unless its day has ended or another report than the grunt stands there by then; no new DM; the post is drawn anew), a grunt it had replaced cannot come back (its message is gone) and is named (fix R2); `/rocket` says so and gives the use back. A grunt that is no longer kept once its messages are posted (replaced by a newer report, or taken back, while they went out; `StopReportService.kept`, read anew) is `overtaken` (fix F3): nobody is told, its messages are deleted, and `/rocket` answers that a newer report at the stop took its place and gives the use back. A grunt refined in place while its messages were posted (another `madeAt`, review R2) tells nobody, as its refine tells; it is answered with the report as it stands, or as `overtaken` where it was posted nowhere (fix round 2, F9). A grunt `refined` in place (plan 8R-4L) has its messages edited (`GruntMessageService.refine`), then the notifier told as of a new report (the hour per type keeps a second DM from anyone told of the type; a member with a Shadow want of the new lineup's catches who was not told is told), and is answered as `reported` with what it refined as `replaced` (the notifier is told the reporter of what it refined as `RocketNews.alsoActors`, who is not told of it, review R3; one refined again meanwhile tells nobody, review R2; one whose messages were all found gone, outside rehearsal mode, is taken back as `unposted`, what it refined named as lost, review R5, but only after a complete pass, `RefinedGrunt.complete`: one whose refine could not tell, its messages unread or the pass stopped on the way, is told with the messages known to stand, fix round 2, F2); its id, and so an answer's Take back (now the new reporter's) and every DM's "Go to report", stay. Outside rehearsal mode a grunt's DMs name only the channels it was posted in (fix R3). In rehearsal mode it has no message service: nothing is posted, the report is kept and told.
 - **One code path with the map** (plan 8R-3; `src/commands/rocket/rocket-report.ts`): `reportRocketAs(ctx, serverId, { choice, stop, reporter, replacing? }, channel)` reports through `ctx.rocket.report` and gives each outcome for the caller (`reported` with the view of `rocketWords`, `already` with the grunt's messages, `asks` with the hideout, `unposted` and `overtaken` with their words, the channels named by `channel`); `/rocket report`, its dialog's Submit and the map call it. `hideoutQuestion(hideout, grunt)` is the question's words (the dialog adds "Submit replaces it."); `rocketWords(view, channel)` the answer's, which `rocketAnswer` wraps (an inline snapshot guards it); `alreadyReported(standing, link, by?)` names the reporter as the caller gives them (the map: by name, never an id). `GIOVANNI_ONLY_WHEN_SURE` is the warning of `/rocket report`'s help and of Giovanni's choice on the map.
-- **Grunts' messages** (`GruntMessageService`, `src/services/grunt-messages.ts`): `gruntMessage` (`src/render/rocket.ts`, `ROCKET_COLOUR`): `### Water-type grunt`, `**Catch** one of …`, when it goes away, `**Where**` the stop's line with its maps link and picture, a gallery of the catches' pictures (ten at most), the reporter in the small print (`memberByName`); `gruntTextMessage` where the bot may not embed; a message refused for what it holds is sent once more without pictures; a channel where the send fails for any reason (refused, 5xx, a time-out) is passed over and logged, and a message that cannot be recorded is deleted at once and counts as not posted (`post` never rejects, fix A1); a delete after a report ended early that fails is tried once more a minute later (fix A3). `messagesOfReports(ids)` reads the messages of many reports at once (`GruntMessageStorage.ofReports`; the map's list, plan 8R-3). Each message is a `GruntMessage` row until deleted: at the report's end, at once when it ends early (`ended`: replaced, taken back; one still on its way goes as soon as it is there, `endedEarly`, and `post` sends nothing more of it, fix F3), a failed delete once more a minute later, then by `sweep` (the scheduler's `grunts`, hourly and at start) until a day after its time. A shutdown deletes nothing (`close`): the report stands on through a restart, and so does its message (unlike spawn reports).
-- **`/rocket report who: stop:`** and **`/rocket remove stop:`** (`src/commands/rocket/`, every server): `who` a choice (`whoChoices`: by name, then by what can be caught; `Name · catches in short`, Giovanni's "(only when sure it is him)") or a name typed in full (`readWho`: `water`, `water grunt`, `arlo`, `decoy`); a key gone from the lineups is `LINEUPS_CHANGED`. The stop as `/research` reads it (`namedStop` with Rocket's refusal `NOT_A_ROCKET_STOP`). Its guard (`requireRocketReport`: `ROCKET_FROM_A_REGION`, `NO_STOPS_HERE`, who, the stop, and the hideout standing there) runs before the throttle (`rocketThrottle`, `rocketWindow`). A grunt where a hideout stands today opens the dialog "Replace a hideout?" (`defer` none then; `readInTime` with nothing more to read; `PendingRequests`): "Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s report with the Water-type grunt? Submit replaces it." Its Submit (`rocket:<token>:replace`, `carriesOn` the command's use and window) reports with that hideout's id; another hideout meanwhile is `HIDEOUT_CHANGED` and gives the use back; one reported between the guard and the report (no dialog possible then) is refused and gives the use back. `already` answers "Already reported: a **Water-type grunt** at **Stop**, by **Ash** <t:R>; it goes away <t:R>." with a link to its message. The answer (`rocketAnswer`): who at which stop, what can be caught, what it replaced, where it shows (the grunt's channels and when it goes; a hideout's pinned posts until midnight; in rehearsal mode only until when) and Take back (`rocket:<id>:back:<stop key>:<rocketKey with . for :>:<madeAt in base 36>`, the bare `rocket:<id>:back` where that would pass 100 characters; `MEMBER_WRITE_THROTTLE`; where the id is gone it takes back the presser's report of the same who at the same stop made at the same moment and standing now, a hideout put back under a new id, which keeps its `madeAt` (fix S3), never a newer report of the same who (fix F1)). `/rocket remove` takes back one's own report at a stop, any for staff.
+- **Grunts' messages** (`GruntMessageService`, `src/services/grunt-messages.ts`): `gruntMessage` (`src/render/rocket.ts`, `ROCKET_COLOUR`): `### Water-type grunt`, `**Catch** one of …`, when it goes away, `**Where**` the stop's line with its maps link and picture, a gallery of the catches' pictures (ten at most), the reporter in the small print (`memberByName`); `gruntTextMessage` where the bot may not embed; a message refused for what it holds is sent once more without pictures; a channel where the send fails for any reason (refused, 5xx, a time-out) is passed over and logged, and a message that cannot be recorded is deleted at once and counts as not posted (`post` never rejects, fix A1); a delete after a report ended early that fails is tried once more a minute later (fix A3). A report's posting, refines and end run in turn per report id (`KeyedLock`, review R1): a refine edits every message its posting sent, and an end deletes what a refine kept. A grunt refined in place (plan 8R-4L, `refine`) has each of its messages edited where it stands as the kind it was sent as (`sentAs`, review R6: components v2, or plain text, never by what the bot may do in the channel by then; where Discord refuses the edit for what it holds, components v2 once more without pictures; a message known to be components v2 is never edited as plain text, one sent as plain text is tried as components v2 after; a message of an earlier process, whose kind is not known, is guessed by the rule `send` used, `mayPost`, then tried as the other kind, fix round 2, F4), keeping the message ids; it gives the messages that stand and whether it looked at every one (`RefinedGrunt`: `complete` false where its messages could not be read, or the report ended or the service shut down on the way, F2); a refine older (`madeAt`) than what the messages show already edits nothing (`shown`, review R2), and one whose report ended while an edit was on its way retimes and keeps nothing (review R4); a message whose edit fails stays as it was and is logged, one gone is forgotten; each one's delete follows the new `endsAt` (`GruntMessageStorage.retime`, the timer set anew). The heading stays the type's name (`### Water-type grunt`), never the gender. `messagesOfReports(ids)` reads the messages of many reports at once (`GruntMessageStorage.ofReports`; the map's list, plan 8R-3). Each message is a `GruntMessage` row until deleted: at the report's end, at once when it ends early (`ended`: replaced, taken back; one still on its way goes as soon as it is there, `endedEarly`, and `post` sends nothing more of it, fix F3), a failed delete once more a minute later, then by `sweep` (the scheduler's `grunts`, hourly and at start) until a day after its time. A shutdown deletes nothing (`close`): the report stands on through a restart, and so does its message (unlike spawn reports); it posts and edits no more, sets no timer, and waits for the postings, refines and ends on their way (`KeyedLock.whenIdle`, fix round 2, F5): an edit made meanwhile is recorded with its new end, which the next start's sweep keeps.
+- **`/rocket report who: stop:`** and **`/rocket remove stop:`** (`src/commands/rocket/`, every server): `who` a choice (`whoChoices`: by name, then by what can be caught; `Name · catches in short`, Giovanni's "(only when sure it is him)") or a name typed in full (`readWho`: `water`, `water grunt`, `arlo`, `decoy`); a key gone from the lineups is `LINEUPS_CHANGED`. Plan 8R-4L (S8, S11, B3–B5, B14): once the typed words find something, a grunt type of two lineups is three choices, each lineup by its first slot (`Water-type grunt · Magikarp, Feebas`, value `lineupValue`) in the feed's order, then `Water-type grunt · not sure which` (`NOT_SURE_WHICH`, the type's key and both lineups' catches), while the whole list fits 25, else one choice per type; with nothing typed one per type (24 today; 28 with the lineups); "Did you mean" names each type once. `readWho` takes `<lineup key>#<fingerprint>` while the type's lineups hold that lineup with that fingerprint (a rotation that changed it, or a type that lost its second lineup, is `LINEUPS_CHANGED`), as it does a lineup's key without `#`, a merged key with one and a `#` value of no key; a name typed is the merged choice. The report's `subjectKey` is the lineup's key and its catches the lineup's (`rocketSubject`, with `RocketDetail.lineup` the first slot in short); its name stays the type's in the grunt's message, the DMs and the pinned post. A grunt is named with its lineup where it is named apart from its catches (`rocketLabel`: `Water-type grunt · Magikarp, Feebas`): the answer's "was" line (a grunt of the same type without one as "Water-type grunt, not sure which"), "Already reported", the hideout question and the map's view. The stop as `/research` reads it (`namedStop` with Rocket's refusal `NOT_A_ROCKET_STOP`). Its guard (`requireRocketReport`: `ROCKET_FROM_A_REGION`, `NO_STOPS_HERE`, who, the stop, and the hideout standing there) runs before the throttle (`rocketThrottle`, `rocketWindow`). A grunt where a hideout stands today opens the dialog "Replace a hideout?" (`defer` none then; `readInTime` with nothing more to read; `PendingRequests`): "Arlo was reported here today, and a hideout keeps grunts away all day. Replace Arlo’s report with the Water-type grunt? Submit replaces it." Its Submit (`rocket:<token>:replace`, `carriesOn` the command's use and window) reports with that hideout's id; another hideout meanwhile is `HIDEOUT_CHANGED` and gives the use back; one reported between the guard and the report (no dialog possible then) is refused and gives the use back. `already` answers "Already reported: a **Water-type grunt** at **Stop**, by **Ash** <t:R>; it goes away <t:R>." with a link to its message. The answer (`rocketAnswer`): who at which stop, what can be caught, what it replaced, where it shows (the grunt's channels and when it goes; a hideout's pinned posts until midnight; in rehearsal mode only until when) and Take back (`rocket:<id>:back:<stop key>:<rocketKey with . for every :>:<madeAt in base 36>`, taking back that version only, review L1: a report refined in place since answers `REPORT_CHANGED` to anyone, its first reporter and staff too; `replaceAll` both ways since plan 8R-4L (S9), a fourth argument refused; the longest Wayfarer key with `grunt.electric.female` and a ten-digit id is 90 characters; the bare `rocket:<id>:back` where that would pass 100 characters; `MEMBER_WRITE_THROTTLE`; where the id is gone it takes back the presser's report of the same who at the same stop made at the same moment and standing now, a hideout put back under a new id, which keeps its `madeAt` (fix S3), never a newer report of the same who (fix F1)). `/rocket remove` takes back one's own report at a stop, any for staff.
 
 ## The pinned post "Today at the stops"
 
@@ -52,4 +52,4 @@ What members report at PokéStops (plan 8R-1; design `docs/superpowers/specs/202
 
 - `/want`'s dialog, `TargetWant` and the matching are in `notifications-and-dms.md` ("Wants and gym targets", "The notifier"). "Grunt (no type)" is typed as `no type`, `no type grunt` or `grunt (no type)`; `none` typed in full is zero IVs, the legacy word (fix F4), and the list of choices offers both for it.
 - A report that is news (`StopReportService`'s `reported`) goes to `NotifyService.researchReported`: who wants a reward of its task (`researchTargets` / `researchWantsFiring`, `src/domain/notify/reasons.ts`: a Pokémon's Research box, the species fitting any form, an item whatever the quantity, a species' Mega Energy) is told at the normal priority, one DM per report and region channel naming that region's stops with their addresses (`researchDmSentence`, `researchDmBrief`: "Field research has been reported in #region by **Name**: **task**.", the rewards, the stops, until when as `periodEndWords` says it; all through `plainNoLinks`), only members who can view the channel, never the reporter, only under `features.notifications`, expiring with the report, with "Go to post" to the message of the pinned post holding the task (`researchPosts`; none in rehearsal mode). A member told of a task at a stop in a period is not told again (`researchTold`, in memory: a restart can repeat one), so a later "Same task at more stops…" names only the new stops. The usual Stop buttons (`target` reasons, `stopArgs` `rp`/`ri`/`re`).
-- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`; a grunt's announcement runs in its type's line, `rocket:<server>:<rocketKey>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel; a hideout at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, when it goes or until when it stands). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
+- A Rocket report that is news goes to `NotifyService.rocketReported` (plan 8R-2, design 7): one DM per region channel holding the stop; a want of its grunt type, its leader or any leader, Giovanni or the decoy (`rocketTargets` / `rocketWantsFiring`, `TargetWant` tokens as `rocketKey` plus `leader:any`; a lineup's report by its type, `typeKeyOf`, plan 8R-4L: wants stay by type, `grunt:water` fires on both lineups and on "not sure which", and a lineup's key is never a want, `isRocketWho`) and a Shadow want of a Pokémon it can give (`rocketShadowFiring`, the `PokemonNotification` shadow row of the species or the very form: the Shadow box means shadow raids and Rocket catches; judged by the report's own catches, so a Shadow Magikarp fires on the lineup that gives it and on "not sure which", not on the other lineup: a Shadow want is how a lineup's catch is wanted). A grunt goes at the spawn priority, at most one DM an hour per member and grunt type (`rocketHeard`, in memory, `MAX_WANT_QUIET_MS`, keyed by the type's key; a grunt's announcement runs in its type's line, `rocket:<server>:<type key>`, so reports of one type made at once keep the hour, fix B1; the small print says so, `gruntHourNote`: "You won't be told about this grunt type again for an hour."; without `TargetWant` the Shadow wants still fire, fix B8), with "Go to report" to its message in that channel. A grunt's reporter, and on a refine in place the reporter of the grunt it changed (`RocketNews.alsoActors`, review R3), are never told of it and have heard of its type for the hour. A refine changes no DM sent already (as with a grunt taken back early, B2): a DM of "not sure which" or of the other lineup can point at a lineup without the catch it named (review R7). A hideout goes at the normal priority, never twice to a member for the same hideout at the same stop in a day (`rocketTold`, in memory), with "Go to post" to the message of the pinned post holding it (`researchPosts.messageOf(channel, rocketKey)`); no link in rehearsal mode. `rocketDmSentence` ("A **Water-type grunt** has been reported in #west by **Rita**.", "an" by the name's first letter, a leader by name), `rocketDmBrief` (what can be caught, the stop with its address line, when it goes or until when it stands). Since plan 8R-4 the Rocket wants are made in one dialog (`/want rocket`, `notifications-and-dms.md`), and a Rocket reason's button is Change… of that dialog.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index d3fda4dd2baf5c9dd6ccceeddad60cc99b7b2883..514a1906fa0e2420a36cbd45ed1b21d75be9d7fb 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -61,7 +61,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - The task list: `readResearchPage()` (Leek Duck's page of 2026-10-21, `test/fixtures/leekduck-research.html`, unchanged: 58 tasks, 299 rewards), `researchTasksOfPage()` (parsed once, frozen), `pageTask(text)` and `researchTasksFixture(tasks?, readAt?, staleAfterHours?)` (`test/support/research.ts`, a `ResearchTaskProvider`, `readAt` `null` for a list never read, out of date `staleAfterHours` (6) after `readAt`, `ctx.researchTasks` of `createTestContext()`). Events with spawns (plan 8R-4): `readSpawnEventFeed()` (ScrapedDuck's whole `events.json` of 2026-10-22, `test/fixtures/scrapedduck-events-2026-10-22.json`) and `readEventPage(file)` (Leek Duck's Halloween 2026 Part I and Teddiursa Spotlight Hour pages, cut to the sections read), `test/support/spawn-events.ts`; `createTestContext()` gives `ctx.eventSpawns` with no spawns, and `partyServiceWith([], { spawnCostumes })` a `SpawnService` that asks `spawnCostumes.sightingsAt`. Research events: `raidEventsFixture(zone, { research })`; the events feed fixture `test/fixtures/max-events.json` holds the two research events of November 2026.
 - `createTestContext()` gives `ctx.stopReports` (a `StopReportService` over `MemoryStopReports` and the context's events), `ctx.pineStops` (none, over memory and the context's Wayspots), `ctx.targetWants` and `ctx.wantBoxes` (`MemoryWantBoxes` over the context's wants and target wants); `partyServiceWith()` gives `targetWants` to the notifier (`made.targetWants`), and `notifying.researchPosts` a test's own links (`notify-service.research.test.ts`).
 - `FakePartyGateway` pins (`pinMessage` / `unpinMessage`): `noPinning` (channels where it is `not-allowed`), `pinLimit`, `pinNotices` (the notices it deleted), `pinnedIn(channelId)`.
-- Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?, staleAfterHours?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `readAt` and `staleAfterHours` (24) as the task list's, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
+- Team GO Rocket (plan 8R-2): `readRocketFeed()` (ScrapedDuck's `rocketLineups.min.json` of 2026-10-22, `test/fixtures/rocket-lineups.json`, unchanged: 26 lineups, 24 choices), `rocketChoicesOfFeed()` (parsed once, frozen), `feedChoice(key)` and `rocketLineupsFixture(choices?, readAt?, staleAfterHours?)` (`test/support/rocket.ts`, a `RocketLineupProvider`, `readAt` and `staleAfterHours` (24) as the task list's, `ctx.rocketLineups` of `createTestContext()`; `[]` is a list never read). `rocketReport(overrides)` and `MUDKIP` (`stop-report-cases.ts`, a Water-type grunt at stop 1 for half an hour) beside `researchReport`; `rocketLineupCases` (`listedChoice`) and `gruntMessageCases` (`gruntRow`) in `test/support/rocket-store-cases.ts`, twins `MemoryRocketLineups`, `MemoryGruntMessages` (`failing` per method). Two lineups of a grunt type (plan 8R-4L): the fixture's water and untyped grunts have them (`feedChoice('grunt:water').lineups`: Mudkip's, then Magikarp's; `lineupChoice` and `lineupValue` make a choice and its picked value of one); `magikarpLineup(overrides)` and `MAGIKARP` (`stop-report-cases.ts`: the Magikarp lineup by Misty a minute after `REPORT_NOW`), `waterWithLineups()` (`rocket-store-cases.ts`, a short choice with both lineups and their fingerprints); a row of before (a bare list) and unreadable lineups are tested only against the repository, by a raw write (`rocket-repositories.db.test.ts`). A grunt's messages refined in place are edited on the fake gateway (`FakeMessage.edits`); `grunt-messages.test.ts` fails an edit per channel (`failEdit`) and holds a send or an edit (`hold(kind, channel)`, `rocket-reports.test.ts` `holdSend(channel)`: a `HeldCall` of `test/support/held-call.ts`, named by `heldCall(what)`, whose `reached` the test awaits to act while the call is on its way, then `release()`; review R1; `reached` gives up after `TALLY_LIMIT_MS`, naming the call, as `Tally.reached` does, fix round 2, F8), and records each edit's kind as it is asked for (`tried`: that nothing more was asked while an edit is held, after `settle()`, and the kinds a refine tries). The notifier of a restarted process, which remembers nothing it told, is `new NotifyService(made.notifyOptions)` over the same stores and `dms` (`partyServiceWith`; `notify-service.rocket.test.ts`'s `restart()`). A Take back whose id is gone is tested by moving the report's row of `MemoryStopReports` to another id, as a report put back would be (`rocket.test.ts`). `createTestContext()` gives `ctx.rocket` (a `RocketService` over the context's reports that posts no message, as in rehearsal mode); a test of grunts' messages passes its own over a `GruntMessageService` on a `FakePartyGateway` (`rocket.test.ts`, `rocket-reports.test.ts`), with `setTimer` to keep or fire the deletes by hand.
 
 ## The Wayspot export tool (plan 8W-P)
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index d30bae7560e6f6dd581b1cfda59c5dd0c8dab1fe..bbe5fe7223707408c00570ebb3ec6a2e8a234974 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -100,11 +100,11 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - **Scope** (Matt, 2026-10-22, as 8X-5): the server side alone: the data, the routes and the code paths they share with `/research` and `/rocket`. The page (`src/web/client/`) has none of it yet (no layer, popups, Report research / Report Rocket, right-click, filter): left for the UX pass (follow-ups, "From the 8R-3 prototype"). No migration, no command change.
 - **One code path per command** (spec 3.5; `stop-reports.md`, "Reports and `/research`"): `reportResearchAs` and `stopsByKey` (`src/commands/research/research-report.ts`), `reportRocketAs` and `hideoutQuestion` (`src/commands/rocket/rocket-report.ts`), `takeBackAs`; the answers' words are `researchWords` and `rocketWords` with the caller's `ChannelNamer` (on the map a region channel as `#west`, `Region 5` where the bot sees no name), the heading of the command's answer left out, made page text by `pageWords`. The web server is given what the commands read and call (`StopWebDeps.ctx`, `StopWebContext`), the channel names the bot sees (`channelName`), the pinned posts' messages as last drawn (`posts`: `StopPostService.linkOf`, which draws nothing and waits for nothing, unlike `messageOf`, which flushes the gathered redraw and would edit a post on every poll) and the grunts' messages (`grunts`: `GruntMessageService.messagesOfReports`, one read for every grunt of a request, `GruntMessageStorage.ofReports`); both undefined in rehearsal mode, which leaves the web server off anyway.
 - **Who sees which reports** (review R1): a report lies in the regions of the server whose outlines hold its stop's snapshot (`regionsAtPoints`: the server's regions taken once a request and each outline's box tried first, `containment` as the pinned post's; each report placed once, for who may see it and for the view alike; a stop renamed or gone later the same day stays, design 3), and shows unless the member is `barred` from the forum of every one of them (a region without a forum always shows it): the parties' rule, through the same `PartyViewers` (one for `/api/parties` and `/api/stop-reports`, made in `guildRoutes`, so that what Discord said of a forum serves both; read-only while Discord is away, 503 for a member it has not confirmed lately). No text channel is fetched. A report in no region now is shown to nobody.
-- **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`; whether somebody is a member is asked first, `PartyViewers.membership`, the directory's answer kept a minute, so that nothing of the server is read for anybody else, and the forums after the read, `viewer(…, forumsOf(places), membership)`, which does not ask Discord again): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the pinned post says it, `event` the event's name; `grunts`: until their `endsAt`; `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's pinned post that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (the task's key, `typed:<key>` for a typed task: it tells tasks apart and is never sent back as a report's `task`; the same task at more stops is sent as `sameAs` of the report's `id`), `text`, `category`, `typed`, `rewards`; grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (its first catch's, as the post shows it). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
-- **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards }`, `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
+- **The view** `GET /s/<guild>/api/stop-reports` (members, as `/api/parties`: 401, 403, 503, `memberRole`; 30 a minute per address, `STOP_REPORTS_PER_MINUTE`; whether somebody is a member is asked first, `PartyViewers.membership`, the directory's answer kept a minute, so that nothing of the server is read for anybody else, and the forums after the read, `viewer(…, forumsOf(places), membership)`, which does not ask Discord again): `stopReportView` (`src/domain/web/stop-report-view.ts`, pure; its types in `stop-report-data.ts`, without imports, for the page), read anew per request from `StopReportService.standing` (one indexed query; no version in memory: a grunt tells the posts nothing and a period change is no report event, so design 9.16's "source of its own" is the reports themselves), filtered by the clock. `research`: the reports of the period on now only (`periodKey`), and `waiting` `{ stops, at }` where the day's research waits under an intra-day event's window, as the pinned post says it, `event` the event's name; `grunts`: until their `endsAt` (a lineup's with its label, `MapGrunt.lineup`, plan 8R-4L; `MapHideout` has none); `hideouts`: the day's. Each report: `id` (what a take-back sends), `stop` (the snapshot: key, name, address line, point to six decimals), `madeAt` (with `id` its version, which a take-back sends back, plan 8R-4L, review L1), `endsAt`, `reporter` (the name kept with the report as text, "a member" for none: never an id or `memberByName`'s markdown; stop reports have no anonymity, design 10), `mayTakeBack` (the member's own, any for staff by `isMapStaff` of the directory's standing; never while read-only), `link` (the message of today's pinned post that holds the task or hideout in a region the member sees, else its first message, as last drawn, `StopPostService.linkOf`: none past midnight until the posts are drawn anew; a grunt's own message in such a region; absent where there is none). Research: `task` (the task's key, `typed:<key>` for a typed task: it tells tasks apart and is never sent back as a report's `task`; the same task at more stops is sent as `sameAs` of the report's `id`), `text`, `category`, `typed`, `rewards`; grunts and hideouts: `who` (`rocketKey`), `name`, `catches`, a hideout's `picture` (its first catch's, as the post shows it). A reward or catch (`MapReward`): `kind` (`encounter`, `item`, `energy`), `name`, `value` (what a filter matches and `/want` names, as `reward:`'s choices: `pokemon:<catalogue key>`, `item:<key>`, `energy:<dex>`; null for a Pokémon the game data does not know), `quantity`, `shiny`, `image` only from `pictureOrigins` (Leek Duck's pictures are on `cdn.leekduck.com`, the origin of `POKEMON_ICON_BASE`: items and Mega Energy keep theirs). An ETag of the member's JSON (`etagOf`), `private, no-cache`, 304.
+- **The pick lists** (members, an ETag of the JSON, `private, no-cache`, 304; 30 a minute per address each; `src/web/stop-options.ts`, pure): `GET /s/<guild>/api/research-options` (`ResearchOptionsView`): the task list whole in the page's order (not the autocomplete's 25), each `{ key, text, category, rewards }`, `stale` (`ResearchTaskProvider.stale(now)`: not read for `settings.research.staleAfterHours`, or never; the rule the service's own warning follows), `readAt`, and `rewards`, the items and Mega Energy a typed task's `reward` may name (`listedRewards`, `{ value, name }`; a Pokémon is named as `pokemon:<catalogue key>` or by its name, as `readReward` reads it). `GET /s/<guild>/api/rocket-options` (`RocketOptionsView`): `rocketChoices` in `/rocket`'s order, each `{ key, name, hideout, catches, note?, lineups? }`, Giovanni's `note` `GIOVANNI_ONLY_WHEN_SURE` (also in `/rocket report`'s help), a grunt type's two lineups (plan 8R-4L, B9; `RocketLineupOption`: `key` `grunt:water:male`, `value` `<key>#<fingerprint>` as a report sends it, `label` the first slot in short, `fingerprint`, `catches`; in the feed's order, the type's own `key` then "not sure which"), `stale` (`RocketLineupProvider.stale(now)`, `settings.rocket.staleAfterHours`) and `readAt` of the lineups. The stops a report names come from `/api/stops` (8M-5M), which lists the stops of Pine's own by the `pine-<id>` key the reports take (`stop-options.test.ts`).
 - **A research report** `POST /s/<guild>/api/research`, body `{ task, reward?, stops }` or `{ sameAs, stops }` (strict, one or the other, never both nor neither: `task` as `/research`'s `task:` takes it, a key of the list or typed in full, up to 100; `reward` as its `reward:`, up to 100; `sameAs` the id of a research report, the page's "Same task at more stops…"; one to five stop keys, each up to 60). Before the body is read: 30 a minute per address (`STOP_WRITES_PER_ADDRESS_MINUTE`, shared with the Rocket reports and taking back) and `postGuard`. Then, none counted: the session (403) and the body (400); who reports (`actingOnTheMap`); the stops (`NO_STOPS_HERE` 422 where the server's regions hold no stop at all; a key that is no titled PokéStop in a region of this server, a power spot or another server's stop of its own among them, 404, so nobody learns of other servers' stops: `stopsByKey`, which dedupes); the task and reward (`readTask`: 422 in its words, `TASK_LIST_CHANGED` among them; a `task` that is a typed task's key, `typed:…` in any case, 422 `TYPED_TASK_KEY`, never stored as text), or instead the report `sameAs` names, resolved as `researchControls` resolves its base (`StopReportService.get`: research of this server whose `periodKey` is the period on now, else 409 `REPORT_ENDED` in the command's words, logged `ended`), whose `{ subjectKey, research }` is reported as it stands (a typed task with its text and reward, a listed task gone from Leek Duck's list since). Only then `/research report`'s throttle in its window (`{ command: RESEARCH_REPORT, varies: true }`, the router's `researchWindow`: one budget with Discord, design 9.12; 429); then `reportResearchAs` as the member (named as Discord has them now, `reporterNamed`), in `countedOnTheMap`. 200 `{ ok: true, text, research }`: the words (`Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew +4`, a line per stop, where it shows), the reports made as the list shows them to the member (`shownTo`: never one in a region the member is kept out of, though it is made, as from the command; R13). The deliberate exception, for research and Rocket alike: an answer's words name what stands at the stop the member named, as the command does (a hideout in the question, the reporter of a grunt standing, a barred region's `#channel` where a report shows or could not be posted); the report objects follow the GET. Where what shows the reports cannot be read just now (the server's row, the grunts' messages, the posts), the answer is still `ok: true` with the words and without the report(s), and the failure a warning ("could not show reports at stops made on the map"): the report stands and was counted, and the page's next poll shows it. The pinned posts and DMs follow by themselves. Logged at info `{ user, guild, stops, outcome }` (the keys of the stops found, else how many were sent, never a key that names no stop; `reported`, `no-stops`, `no-stop`, `refused`, `ended`, `throttled`), "field research was reported on the map", never a text. "Same task at more stops…" is no route of its own: the page sends another report with `sameAs`, counted in `/research report`'s window as the command's menu is.
-- **A Rocket report** `POST /s/<guild>/api/rocket`, body `{ who, stop, replacing? }` (strict: `who` as `/rocket`'s `who:`, a key or a name typed in full, 1 to 100; one stop key; `replacing` the id of the hideout the member said Replace to). The order as for research, `readWho` the reader (`LINEUPS_CHANGED` among its words); then **the hideout question**, where `/rocket` opens its dialog (a grunt at a stop whose standing Rocket report, `rocketAt`, is a hideout, unless `replacing` is that hideout's id): unless `/rocket report`'s window is full (429, nothing counted: `throttledOnTheMap` with `count: false`, as Discord opens no dialog then), 422 `{ ok: false, text: hideoutQuestion(…), asks: { replacing: <hideout id> }, hideout? }` (the hideout as the list shows it, where shown); the report sent again with that `replacing` replaces it, decided anew inside the store (`decideRocket`: another hideout by then is asked about again). No state is kept between the two requests (as 8X-5's ending-soon question). Then `/rocket report`'s throttle (`rocketWindow`), then `reportRocketAs`: 200 `{ ok: true, text, grunt | hideout }`; the same grunt standing 409 "Already reported: a Water-type grunt at …, by Bob 2 min ago; it goes away in 28 min." with the `grunt` and its `link` (counted, as `/rocket` counts it, 8R-2); a hideout reported between the route's look and the report 422 with the question (the use given back); a grunt posted in none of its region channels 503 in `/rocket`'s words with the channels named `#west` (`unposted`, the use given back); one overtaken while posted 409 (given back); an unexpected failure gives it back too. Logged `{ user, guild, stop?, outcome }` (the stop's key once found), "Team GO Rocket was reported on the map".
-- **Taking back** `POST /s/<guild>/api/stop-reports/<id>/remove` (body empty or `{}`; an id that is not 1 to 10 digits 404 before the body): after the session, the body and `actingOnTheMap`, the report by id of this server that has not ended (`StopReportService.get`: an unknown id, another server's and one gone answer alike, 409 `{ ok: false, text: NOTHING_LEFT }`, R14), the member's own or any for staff (`isMapStaff` of the member fetched fresh; 403 `{ ok: false, text: NOT_YOUR_REPORT }`), none counted; then `MEMBER_WRITE_THROTTLE` in `/research remove`'s or `/rocket remove`'s window by the report's kind; then `takeBackAs`: 200 `{ ok: true, text: "Took back Catch a Dragon-type Pokémon at Yellow Mural." }`. A hideout put back under a new id (8R-2's fix S3) is found by the page's next poll, not by the old id. Logged `{ user, guild, report, outcome }`, "a report at a stop was taken back on the map".
+- **A Rocket report** `POST /s/<guild>/api/rocket`, body `{ who, stop, replacing? }` (strict: `who` as `/rocket`'s `who:`, a key, a lineup's `value` (plan 8R-4L: a fingerprint not of now is `LINEUPS_CHANGED`, uncounted) or a name typed in full, 1 to 100; a lineup over "not sure which" or the other lineup refines the grunt in place, as `/rocket` does, its `grunt` keeping its id; the question names a lineup by `rocketLabel`; one stop key; `replacing` the id of the hideout the member said Replace to). The order as for research, `readWho` the reader (`LINEUPS_CHANGED` among its words); then **the hideout question**, where `/rocket` opens its dialog (a grunt at a stop whose standing Rocket report, `rocketAt`, is a hideout, unless `replacing` is that hideout's id): unless `/rocket report`'s window is full (429, nothing counted: `throttledOnTheMap` with `count: false`, as Discord opens no dialog then), 422 `{ ok: false, text: hideoutQuestion(…), asks: { replacing: <hideout id> }, hideout? }` (the hideout as the list shows it, where shown); the report sent again with that `replacing` replaces it, decided anew inside the store (`decideRocket`: another hideout by then is asked about again). No state is kept between the two requests (as 8X-5's ending-soon question). Then `/rocket report`'s throttle (`rocketWindow`), then `reportRocketAs`: 200 `{ ok: true, text, grunt | hideout }`; the same grunt standing 409 "Already reported: a Water-type grunt at …, by Bob 2 min ago; it goes away in 28 min." with the `grunt` and its `link` (counted, as `/rocket` counts it, 8R-2); a hideout reported between the route's look and the report 422 with the question (the use given back); a grunt posted in none of its region channels 503 in `/rocket`'s words with the channels named `#west` (`unposted`, the use given back); one overtaken while posted 409 (given back); an unexpected failure gives it back too. Logged `{ user, guild, stop?, outcome }` (the stop's key once found), "Team GO Rocket was reported on the map".
+- **Taking back** `POST /s/<guild>/api/stop-reports/<id>/remove` (body empty, `{}`, or `{ madeAt }`, the report's `madeAt` as the list gave it, plan 8R-4L, review L1; an id that is not 1 to 10 digits 404 before the body): after the session, the body and `actingOnTheMap`, the report by id of this server that has not ended (`StopReportService.get`: an unknown id, another server's and one gone answer alike, 409 `{ ok: false, text: NOTHING_LEFT }`, R14), the member's own or any for staff (`isMapStaff` of the member fetched fresh; 403 `{ ok: false, text: NOT_YOUR_REPORT }`), with a `madeAt` that is no longer the report's before that (a grunt refined in place since keeps its id: 409 `{ ok: false, text: REPORT_CHANGED }`, for its first reporter and staff alike, and again where `takeBackAs` meets a refine meanwhile, `changed`), none counted; then `MEMBER_WRITE_THROTTLE` in `/research remove`'s or `/rocket remove`'s window by the report's kind; then `takeBackAs`: 200 `{ ok: true, text: "Took back Catch a Dragon-type Pokémon at Yellow Mural." }`. A hideout put back under a new id (8R-2's fix S3) is found by the page's next poll, not by the old id. Logged `{ user, guild, report, outcome }`, "a report at a stop was taken back on the map".
 
 ## The region editor (plans 8M-2, 8M-2F)
 
````

