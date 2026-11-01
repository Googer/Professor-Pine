# Phase 8X-1: Lobby Sizes and the Group Ping: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first plan of max battles (design `docs/superpowers/specs/2026-10-20-max-battles-design.md`, sections 4 and 5, Q5 and Q6): the machinery that max battles (8X-3) and Gigantamax trains (8X-4) switch on, and the group ping. In detail:

- `settings.lobbies` `{ raid, dynamax, gigantamax }` (1 to 100; defaults 20, 4, 100). `raid` takes the place of the fixed 20 of the "split up" note of raids and trains (Matt, 2026-10-20); the note counts as today.
- `lobbySize(party, lobbies)`: the size of a party's lobby; **none for every kind of party that exists today** (raids, trains, meetups), so they behave and render exactly as today (Q6). 8X-3 (a max battle by its tier) and 8X-4 (a Gigantamax train) add their cases; the switch is checked exhaustive.
- `lobbyCount`: committed heads only (Coming, Present, asked whether done; remote included; not Interested) (Q5).
- Where a party has a size, Join chooses the group (`chooseGroup`): the default group if it has room, else the first by letter with room, else a new group opened silently while there are fewer than five, else the group with most room; a member bigger than a lobby goes straight to the group with most room. A group's heading reads `3/4 coming · 1 interested`; over the size, a line under it says so in place of the split-up note.
- `/shout` pings in as many messages as its mentions need (`inMessages`, `pingInMessages`), and `/shout group:` pings only one's own group. A shout cut short says how many it pinged, and whether the party ended or moved to another post.

**Architecture:**

- **Domain** (`src/domain/party/`): `lobby.ts` (`Lobbies`, `DEFAULT_LOBBIES`, `lobbySize`); `isCommitted` and `lobbyCount` in `party.ts`; `chooseGroup` and the placing in `setAttendance` / `applyAutoStatus` in `attendance.ts`, the size arriving as `AttendanceLimits.lobbySize` (optional; absent is today's behaviour).
- **Services:** `AttendanceService.limitsOf(party)` fills the size inside each change; `PartyService`'s views carry `lobbySize` and the raid lobby to the renderers. Both services take an optional `lobbySize` hook for tests (no party has a size before 8X-3).
- **Posts** (`src/render/party-post.ts`): `lobbyLine`, `LOBBY_OVER`; `LOBBY_SIZE` is gone.
- **Mentions:** `inMessages` (`src/render/text.ts`) splits a text and its mentions into messages; `pingInMessages` (`src/services/party-change.ts`) sends them, checking before each that the party still has that post. Only `/shout` uses it; the other group pings keep `withMentions` (follow-up for 8X-4, where Gigantamax trains make them large).

**Tech Stack:** TypeScript 6.0, Node 24, discord.js v14, Vitest. No new dependency, no migration, party state stays at version 11. **A command changes** (`/shout` gains `group`): the commands must be deployed again before staging.

**Spec:** the design above and the brief `.superpowers/sdd/8x-1-lobbies/design.md` (git-ignored).

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8x1`, tip `e79c6b99`), one commit per task, on `max-battles` ab3c3496 (typescript-migration 2cc81d80 and the design). Each commit typechecks and its tests pass; on the tip the full check (8,002 tests) and the build are clean. No database file changes.

**Reviews:** an Opus reviewer went through the prototype (F1..F7: one Important, the split-up note beside the lobby's; six Minor), then the fix round (ready; R1-1 Minor, the wording of a shout cut short by a move); every finding is folded into the commits below. The final whole-branch review (Opus, high): ready after fixes, eight Minor and one Important design seam for 8X-3 (a post with several groups has a Join per letter, which never reaches the chooser: follow-ups, "From Phase 8X-1"); the code fixes are one commit after Task 4 (`298cc585`, not in this plan: the split-up size per kind, `splitLobby`; a moved shout with nobody pinged gives its use back; docs).

## Decisions in this plan

These were made while prototyping and reviewing, for Matt to look at:

1. **Nothing visible changes today but `/shout`.** No party has a lobby size before 8X-3 and 8X-4; the placing and the `n/cap` line are reached only in tests, through the services' `lobbySize` hook. A test compares a raid's whole post with and without the hook.
2. **Who is placed:** a new attendee with no group named (Interested included, by their heads, as if they come; also one signed up by +1 or Remote); an Interested member who becomes Coming or Present stays while their group has room, else is placed. Complete back to Coming, the count, Remote and every change that names a group never move anybody.
3. **A member bigger than a lobby** (a +5 in a Dynamax battle) never opens a group: they go to the group with most room, first by letter on a tie.
4. **The over-size sentence is a line of its own** under the group's heading ("Over the lobby size: somebody could move to another group."), not on the heading line: the heading sits beside the Join button, and a heading longer than a line drops the button below it on a phone (8D-F). Where a party has a size it replaces the split-up note.
5. **`lobbySize` throws for a kind it does not know** (`never`): a new kind without its case does not compile; a stored party of another kind is refused when read, before it gets here.
6. **`/shout group:`** says `**Name** to everybody in group B:`; refused in a party of one group ("This raid has one group: `/shout` without `group` pings everybody."); nobody else in the group is said as for the whole party.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment.
- `src/domain/` stays pure. Tests never use the network and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8x1`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check` and the build run after the last task, through the npm scripts (the suite lock). Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/`, `.superpowers/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **Q6:** with no size, every party behaves and renders exactly as before; no existing test expectation changed except the one `/shout` test of one message.
2. **The placing** decides inside `PartyStore.update`'s callback, never moves a member who named a group, never splits a member, never opens a sixth group, never pings for a group it opened.
3. **The shout's messages:** each within 2,000 characters and 100 pings, everybody pinged once, nothing sent into a post that is no longer the party's.

### Task 1: Plan 8X-1 T1: Lobby sizes: settings.lobbies, lobbySize, lobbyCount

Prototype commit: `ae9bc3a0b98f7c1772e4757a9c9da5bfd91335b9`

settings.lobbies ({ raid, dynamax, gigantamax }, each 1 to 100, defaults
20, 4, 100; a file without it, or without one size, loads as before).
lobbySize(party, lobbies) is undefined for every kind there is today (an
exhaustive switch that 8X-3 and 8X-4 fill in); lobbyCount counts the heads
of a group's committed members (Coming, Present, CompletePending).

**Files:**

```
 data/settings.json                     |  1 +
 docs/architecture/parties-and-posts.md |  1 +
 docs/guides/new-instance.md            |  2 +-
 src/config/settings.test.ts            | 31 +++++++++++++++++++++++++++++++
 src/config/settings.ts                 | 16 ++++++++++++++++
 src/domain/party/lobby.test.ts         | 50 ++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/lobby.ts              | 49 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/party.ts              | 22 ++++++++++++++++++++++
 8 files changed, 171 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/config/settings.test.ts src/domain/party/lobby.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff ae9bc3a0b98f7c1772e4757a9c9da5bfd91335b9 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8X-1 T1: Lobby sizes: settings.lobbies, lobbySize, lobbyCount`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/data/settings.json b/data/settings.json
index 9da5049a474a54fd981c473a161008011a47b7a6..61ae567e0f2f252b873887d26b406562f79378ae 100644
--- a/data/settings.json
+++ b/data/settings.json
@@ -6,6 +6,7 @@
   "maxRaidHatchedDuration": 180,
   "maxMeetupLeadupDuration": 133920,
   "maximumAdditionalAttendees": 20,
+  "lobbies": { "raid": 20, "dynamax": 4, "gigantamax": 100 },
   "startClearTime": 10,
   "deletionGraceTime": 5,
   "deletionWarningTime": 10,
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index cbc474e83e0f4d7e5274d40662fb037870cd809d..7833051aa1f8814e488e9e5e571279d01abad53a 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -12,6 +12,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - A raid's boss is stored as a reference, `{ key }` (catalogue key) or `{ name }` (a boss the game master does not know): make it with `raidBossRef(boss)` from a `RaidBoss` of `ctx.raidBosses`, never by passing that object itself. An egg has no boss; `raid.reportedHatched` says whether a raid without times was seen hatched.
 - `PartyRepository` keeps what is searched by in columns and the rest in one versioned JSON document (`party-state.ts`), checked when written and when read; a row it cannot read is reported and left alone. Attendees are a list there, because MySQL sorts the keys of a JSON object. Any new field in the document is a new version with a reader for the old one.
+- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is read by nothing yet) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold, undefined for every party that exists today (a raid, a raid train, a meetup: Q6), an exhaustive switch on the kind that the max battle (8X-3, by its tier) and the Gigantamax train (8X-4) fill in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete.
 - How long a raid lasts comes from `raidDurationsAt` / `hatchTimeForEnd` / `longestRaidDurations` (`src/domain/time/raid-durations.ts`) with `raidDurationRules(settings, ctx.raidEvents.events())`: the configured durations, changed for a standard raid that hatches during a Raid Hour or Raid Day (`settings.raidEvents`; events come from the feed, and the weekly Raid Hour of the settings applies in a week for which the feed lists none). Pass `longestRaidDurations(...)` as `durations` to `resolvePartyTime`.
 
 ## Commands and controls in a post
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index dd34805eadf97afb9ac6d8d6c47307698cc0abb9..399f84cc0436d380e0e73ab0add6d315538dc27d 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -120,7 +120,7 @@ The settings that matter first:
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
 - `raidEvents.weeklyRaidHour`: the weekly Raid Hour, in your time zone.
 
-The rest has working defaults. The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
+The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game). The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
 
 ## 4. Start the bot
 
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 49db5a4bf02dac5df07f10a447968585a328ad64..bd1b9b51fb31048dd7edb0158eb4f09d63f75bca 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -453,6 +453,37 @@ describe('loadSettings', () => {
     });
   });
 
+  it('takes the lobby sizes, each with its default, and all of them for a file without any', () => {
+    const defaults = { raid: 20, dynamax: 4, gigantamax: 100 };
+    expect(loadSettings(REPO_SETTINGS).lobbies).toEqual(defaults);
+    expect(loadSettings('test/fixtures/settings.json').lobbies).toEqual(defaults);
+    const without = writeSettings((s) => {
+      delete s.lobbies;
+    });
+    expect(loadSettings(without).lobbies).toEqual(defaults);
+    const some = writeSettings((s) => {
+      s.lobbies = { dynamax: 6 };
+    });
+    expect(loadSettings(some).lobbies).toEqual({ ...defaults, dynamax: 6 });
+    const edges = writeSettings((s) => {
+      s.lobbies = { raid: 1, dynamax: 100, gigantamax: 50 };
+    });
+    expect(loadSettings(edges).lobbies).toEqual({ raid: 1, dynamax: 100, gigantamax: 50 });
+  });
+
+  it('refuses a lobby size that is no whole number from 1 to 100, or a kind it does not know', () => {
+    for (const value of [0, 101, 4.5, '4', null]) {
+      const file = writeSettings((s) => {
+        s.lobbies = { dynamax: value };
+      });
+      expect(() => loadSettings(file), `dynamax = ${String(value)}`).toThrow(/dynamax/);
+    }
+    const unknown = writeSettings((s) => {
+      s.lobbies = { mega: 10 };
+    });
+    expect(() => loadSettings(unknown)).toThrow(/mega/);
+  });
+
   it('rejects a missing required key', () => {
     const file = writeSettings((s) => {
       delete s.cleanupInterval;
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 6da9e92a36b37304822226fb38f7ed46af13a67b..8f7a61e914abad7a904ebc2fc06e925cefab76c6 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -2,10 +2,12 @@ import { readFileSync } from 'node:fs';
 import { z } from 'zod';
 import { ConfigError } from './errors.js';
 import { OCR_DEVICES, OCR_HEAD_ICON_URL, OCR_MODELS_URL } from '../domain/ocr/assets.js';
+import { DEFAULT_LOBBIES, MAX_LOBBY, MIN_LOBBY } from '../domain/party/lobby.js';
 
 const minutes = z.number().int().positive();
 const milliseconds = z.number().int().positive();
 const seconds = z.number().int().positive();
+const lobby = z.number().int().min(MIN_LOBBY).max(MAX_LOBBY);
 
 function isTimeZone(zone: string): boolean {
   try {
@@ -78,6 +80,20 @@ export const settingsSchema = z.strictObject({
   maxRaidHatchedDuration: minutes,
   maxMeetupLeadupDuration: minutes,
   maximumAdditionalAttendees: z.number().int().positive(),
+  /**
+   * How many trainers one lobby holds, by the kind of battle (design
+   * `2026-10-20-max-battles-design.md`, section 4): `dynamax` and `gigantamax` are the sizes Join
+   * fills a max battle's groups to (and a Gigantamax train's), and the `3/4 coming` of a group's
+   * line; `raid` is kept for a later use and read by nothing yet (a raid's members choose their
+   * groups). Each 1 to 100; a file without them, or without one, takes the game's: 20, 4, 100.
+   */
+  lobbies: z
+    .strictObject({
+      raid: lobby.default(DEFAULT_LOBBIES.raid),
+      dynamax: lobby.default(DEFAULT_LOBBIES.dynamax),
+      gigantamax: lobby.default(DEFAULT_LOBBIES.gigantamax),
+    })
+    .default(() => ({ ...DEFAULT_LOBBIES })),
   startClearTime: minutes,
   deletionGraceTime: minutes,
   deletionWarningTime: minutes,
diff --git a/src/domain/party/lobby.test.ts b/src/domain/party/lobby.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5b1516296659753e0938233d68f789ed0b3b84fe
--- /dev/null
+++ b/src/domain/party/lobby.test.ts
@@ -0,0 +1,50 @@
+import { describe, expect, it } from 'vitest';
+import {
+  ALICE,
+  BOB,
+  CAROL,
+  REPORTER,
+  testMeetup,
+  testRaid,
+  testTrain,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import { DEFAULT_LOBBIES, lobbySize } from './lobby.js';
+import { lobbyCount, type Party } from './party.js';
+import { PartyStatus } from './status.js';
+
+const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;
+
+describe('lobbySize', () => {
+  it('is none for every kind of party there is today: a raid, a meetup, a train', () => {
+    const lobbies = { raid: 20, dynamax: 4, gigantamax: 100 };
+    expect(DEFAULT_LOBBIES).toEqual(lobbies);
+    expect(lobbySize(testRaid(), lobbies)).toBeUndefined();
+    expect(lobbySize(testRaid({ tier: { level: 'Elite', shadow: false } }), lobbies)).toBe(
+      undefined,
+    );
+    expect(lobbySize(testMeetup(), lobbies)).toBeUndefined();
+    expect(lobbySize(testTrain(), lobbies)).toBeUndefined();
+  });
+
+  it('refuses a kind of party it does not know, rather than give it no size', () => {
+    const unknown = { ...testRaid(), type: 'max' } as unknown as Party;
+    expect(() => lobbySize(unknown, DEFAULT_LOBBIES)).toThrow(/max/);
+  });
+});
+
+describe('lobbyCount', () => {
+  it('counts the heads of the committed members of a group: coming, here and asked', () => {
+    const party = withAttendees(testRaid(), {
+      [REPORTER]: { status: Interested, number: 5 },
+      [ALICE]: { status: Coming, number: 2, remote: true },
+      [BOB]: { status: Present, number: 3 },
+      [CAROL]: { status: CompletePending, pendingUntil: 1, number: 4 },
+      '200000000000000005': { status: Complete, number: 6 },
+      '200000000000000006': { status: Coming, number: 7, group: 'B' },
+    });
+    expect(lobbyCount(party, 'A')).toBe(2 + 3 + 4);
+    expect(lobbyCount(party, 'B')).toBe(7);
+    expect(lobbyCount(party, 'C')).toBe(0);
+  });
+});
diff --git a/src/domain/party/lobby.ts b/src/domain/party/lobby.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b7b1d574fbb39af38ea5c21fb1b4536ed295408c
--- /dev/null
+++ b/src/domain/party/lobby.ts
@@ -0,0 +1,49 @@
+import type { Party } from './party.js';
+
+/**
+ * How many trainers one lobby of each kind of battle holds (`settings.lobbies`; design
+ * `2026-10-20-max-battles-design.md`, section 4): a raid, a Dynamax battle, a Gigantamax battle.
+ * `raid` is kept for a later use: no party reads it yet (a raid and a raid train choose their
+ * groups themselves, Q6).
+ */
+export interface Lobbies {
+  raid: number;
+  dynamax: number;
+  gigantamax: number;
+}
+
+/** The sizes of the game's lobbies, which a settings file without `lobbies` takes. */
+export const DEFAULT_LOBBIES: Lobbies = { raid: 20, dynamax: 4, gigantamax: 100 };
+
+/** The smallest and the largest lobby size the settings take. */
+export const MIN_LOBBY = 1;
+export const MAX_LOBBY = 100;
+
+/**
+ * How many trainers one group of this party should hold, or undefined where its groups have no
+ * size: then Join puts a member in the default group and the post counts no lobby, as for every
+ * party before max battles. Where there is a size, Join fills the groups (`chooseGroup`) and a
+ * group's line shows `3/4 coming`.
+ */
+export function lobbySize(party: Party, _lobbies: Lobbies): number | undefined {
+  switch (party.type) {
+    // Coming (plan 8X-3): a max battle, by its tier: `dynamax` or `gigantamax`.
+    // A raid and a raid train choose their groups themselves (Q6): no size.
+    case 'raid':
+      return undefined;
+    // Coming (plan 8X-4): a Gigantamax train is `gigantamax`; a raid train and a Dynamax train
+    // have none (a Dynamax train forms its lobbies on the spot).
+    case 'train':
+      return undefined;
+    // A meetup has its one group for good.
+    case 'meetup':
+      return undefined;
+    default:
+      return unknownKind(party);
+  }
+}
+
+/** A kind of party this switch was not told about: the compiler refuses it, a stored one throws. */
+function unknownKind(party: never): never {
+  throw new Error(`No lobby size for a party of kind ${(party as { type: string }).type}`);
+}
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index eab0ac10405c2da23ab60c11cb4854351309682b..60f3a863ad6f666e18833b118c5ceed005ada0a0 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -613,6 +613,28 @@ export function headCount(party: PartyCore, groupId?: GroupId): number {
   return total;
 }
 
+/** The statuses that hold a place in a lobby: coming, here, and asked whether they are done. */
+export function isCommitted(status: AttendeeStatus): boolean {
+  return (
+    status === PartyStatus.Coming ||
+    status === PartyStatus.Present ||
+    status === PartyStatus.CompletePending
+  );
+}
+
+/**
+ * Heads in a group's lobby (design `2026-10-20-max-battles-design.md`, Q5): the numbers of its
+ * committed members (`isCommitted`), remote players included; not who is interested, nor who has
+ * completed it.
+ */
+export function lobbyCount(party: PartyCore, groupId: GroupId): number {
+  let total = 0;
+  for (const attendee of Object.values(party.attendees)) {
+    if (attendee.group === groupId && isCommitted(attendee.status)) total += attendee.number;
+  }
+  return total;
+}
+
 /** Snowflakes of the attendees for which `keep` holds, in the order they signed up. */
 export function membersWhere(
   party: PartyCore,
````

### Task 2: Plan 8X-1 T2: Join chooses the group where a party has a lobby size

Prototype commit: `8c887ece6e775a00616a3bd031fc7a9f063320cb`

chooseGroup: the default group while the member and their +1s fit, else
the first group by letter with room, else a new group opened silently
while there are fewer than five, else the group with the most room, over
its size. setAttendance places a new attendee and an Interested one who
comes; applyAutoStatus a reporter it signs up. A size reaches the domain
as AttendanceLimits.lobbySize, per party (lobbySize of the settings, or
the services' lobbySize option in tests). Without a size nothing changes.

**Files:**

```
 docs/architecture/parties-and-posts.md        |   2 +-
 src/domain/party/attendance.lobby.test.ts     | 237 ++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/party/attendance.ts                |  98 ++++++++++++++++++-
 src/domain/party/party.ts                     |   7 +-
 src/services/attendance-service.lobby.test.ts |  70 ++++++++++++++
 src/services/attendance-service.ts            |  27 ++++--
 src/services/party-service.ts                 |  16 +++-
 test/support/party-service.ts                 |   2 +
 8 files changed, 443 insertions(+), 16 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/party/attendance.lobby.test.ts src/services/attendance-service.lobby.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 8c887ece6e775a00616a3bd031fc7a9f063320cb -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8X-1 T2: Join chooses the group where a party has a lobby size`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 7833051aa1f8814e488e9e5e571279d01abad53a..b7dfac7c5afe7f8b7618fd2eff4072efb61bb744 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -12,7 +12,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - A raid's boss is stored as a reference, `{ key }` (catalogue key) or `{ name }` (a boss the game master does not know): make it with `raidBossRef(boss)` from a `RaidBoss` of `ctx.raidBosses`, never by passing that object itself. An egg has no boss; `raid.reportedHatched` says whether a raid without times was seen hatched.
 - `PartyRepository` keeps what is searched by in columns and the rest in one versioned JSON document (`party-state.ts`), checked when written and when read; a row it cannot read is reported and left alone. Attendees are a list there, because MySQL sorts the keys of a JSON object. Any new field in the document is a new version with a reader for the old one.
-- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is read by nothing yet) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold, undefined for every party that exists today (a raid, a raid train, a meetup: Q6), an exhaustive switch on the kind that the max battle (8X-3, by its tier) and the Gigantamax train (8X-4) fill in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete.
+- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is read by nothing yet) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold, undefined for every party that exists today (a raid, a raid train, a meetup: Q6), an exhaustive switch on the kind that the max battle (8X-3, by its tier) and the Gigantamax train (8X-4) fill in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete. Where a party has a size, Join fills its groups: the services put `lobbySize` into the `AttendanceLimits` of each change (`AttendanceService.limitsOf(party)`; `PartyService` passes it to `applyAutoStatus`; both take `lobbySize` as an option, which tests use to give a raid a size), and `setAttendance` places a member who is not yet an attendee and names no group, whatever the status, and an Interested one who becomes Coming or Present (their own group while it has room for them) through `chooseGroup(party, member, heads, size)` (`attendance.ts`): the default group while they and their +1s fit, else the first group by letter with room, else a new group while there are fewer than five, opened silently (no line, no ping, unlike `createGroup`) and made the default, else the group with the most room, the first by letter on a tie, over its size; the member is never counted against their own group. A member larger than a lobby by themself goes straight to the group with the most room (no new group would hold them either), and a party without groups (a meetup) keeps its one. `+1` and Remote sign a new member up the same way. Nothing else moves anybody: a count or a change to Coming that puts a group over its size leaves them there, and `/group join`, a group's Join and anything that names a group put the member where they asked, over the size if so. Without a size every change is what it was.
 - How long a raid lasts comes from `raidDurationsAt` / `hatchTimeForEnd` / `longestRaidDurations` (`src/domain/time/raid-durations.ts`) with `raidDurationRules(settings, ctx.raidEvents.events())`: the configured durations, changed for a standard raid that hatches during a Raid Hour or Raid Day (`settings.raidEvents`; events come from the feed, and the weekly Raid Hour of the settings applies in a week for which the feed lists none). Pass `longestRaidDurations(...)` as `durations` to `resolvePartyTime`.
 
 ## Commands and controls in a post
diff --git a/src/domain/party/attendance.lobby.test.ts b/src/domain/party/attendance.lobby.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..82e3889833adcce9a5c258c15b249c68cc5b15cb
--- /dev/null
+++ b/src/domain/party/attendance.lobby.test.ts
@@ -0,0 +1,237 @@
+import { describe, expect, it } from 'vitest';
+import {
+  ALICE,
+  BOB,
+  CAROL,
+  REPORTER,
+  testMeetup,
+  testRaid,
+  withAttendees,
+} from '../../../test/support/parties.js';
+import {
+  applyAutoStatus,
+  attendanceLimits,
+  changeNumber,
+  chooseGroup,
+  joinGroup,
+  joinInto,
+  setAttendance,
+  setRemote,
+} from './attendance.js';
+import { lobbyCount, type Change, type GroupId, type RaidParty } from './party.js';
+import { PartyStatus } from './status.js';
+
+const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;
+const limits = attendanceLimits({ maximumAdditionalAttendees: 20 });
+/** The limits of a party whose groups hold four trainers each, as a Dynamax battle's. */
+const lobby4 = { ...limits, lobbySize: 4 };
+
+const DAVE = '200000000000000005';
+const ERIN = '200000000000000006';
+const FRANK = '200000000000000007';
+
+function done<Extra>(change: Change<RaidParty, Extra>): RaidParty {
+  if (!change.ok) throw new Error(`refused: ${change.reason}`);
+  return change.party;
+}
+
+/** The test raid with these groups, the last the default one, as members would have opened them. */
+function withGroups(ids: readonly GroupId[], party: RaidParty = testRaid()): RaidParty {
+  const last = ids.at(-1) ?? 'A';
+  return { ...party, groups: ids.map((id) => ({ id })), defaultGroupId: last };
+}
+
+describe('chooseGroup', () => {
+  it('takes the default group while the member and their +1s fit in it', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'B', number: 2 },
+    });
+    const chosen = chooseGroup(party, BOB, 2, 4);
+    expect(chosen.group).toBe('B');
+    expect(chosen.party).toBe(party);
+  });
+
+  it('takes the first group by letter with room when the default group has none', () => {
+    const party = withAttendees(withGroups(['A', 'B', 'C']), {
+      [ALICE]: { group: 'C', number: 4 },
+      [BOB]: { group: 'A', number: 3 },
+    });
+    expect(chooseGroup(party, CAROL, 1, 4).group).toBe('A');
+    expect(chooseGroup(party, CAROL, 2, 4).group).toBe('B');
+  });
+
+  it('counts only who is committed: the interested and the done take no place', () => {
+    const party = withAttendees(withGroups(['A']), {
+      [ALICE]: { status: Interested, number: 3 },
+      [BOB]: { status: Complete, number: 3 },
+      [CAROL]: { status: CompletePending, pendingUntil: 1, number: 1 },
+    });
+    expect(chooseGroup(party, DAVE, 3, 4).group).toBe('A');
+  });
+
+  it('does not count the member against their own group', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'B', number: 2 },
+      [BOB]: { group: 'B', number: 2 },
+    });
+    expect(chooseGroup(party, ALICE, 2, 4).group).toBe('B');
+  });
+
+  it('opens the next group silently when none has room, and makes it the default', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'A', number: 4 },
+      [BOB]: { group: 'B', number: 3 },
+    });
+    const chosen = chooseGroup(party, CAROL, 2, 4);
+    expect(chosen.group).toBe('C');
+    expect(chosen.party.groups.map((group) => group.id)).toEqual(['A', 'B', 'C']);
+    expect(chosen.party.defaultGroupId).toBe('C');
+    expect(chosen.party.attendees).toBe(party.attendees);
+  });
+
+  it('puts them over the size in the group with the most room once five groups are full', () => {
+    const party = withAttendees(withGroups(['A', 'B', 'C', 'D', 'E']), {
+      [ALICE]: { group: 'A', number: 4 },
+      [BOB]: { group: 'B', number: 3 },
+      [CAROL]: { group: 'C', number: 4 },
+      [DAVE]: { group: 'D', number: 3 },
+      [ERIN]: { group: 'E', number: 4 },
+    });
+    const chosen = chooseGroup(party, FRANK, 2, 4);
+    expect(chosen.group).toBe('B');
+    expect(chosen.party).toBe(party);
+  });
+
+  it('never opens a group for a member who alone is larger than a lobby: the most room', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [BOB]: { group: 'A', number: 2 },
+      [CAROL]: { group: 'B', number: 1 },
+    });
+    const chosen = chooseGroup(party, ALICE, 5, 4);
+    expect(chosen.group).toBe('B');
+    expect(chosen.party).toBe(party);
+    // The first by letter on a tie, a group nobody is in included.
+    const empty = withGroups(['A']);
+    expect(chooseGroup(empty, ALICE, 5, 4)).toEqual({ party: empty, group: 'A' });
+    const tied = withAttendees(withGroups(['A', 'B', 'C']), {
+      [BOB]: { group: 'A', number: 2 },
+      [CAROL]: { group: 'C', number: 1 },
+      [DAVE]: { group: 'B', number: 1 },
+    });
+    expect(chooseGroup(tied, ALICE, 5, 4).group).toBe('B');
+  });
+
+  it('keeps a party without groups (a meetup) in its one group, however full', () => {
+    const meetup = withAttendees(testMeetup(), { [BOB]: { number: 4 } });
+    expect(chooseGroup(meetup, ALICE, 1, 4)).toEqual({ party: meetup, group: 'A' });
+    const joined = setAttendance(meetup, ALICE, Coming, {}, lobby4);
+    if (!joined.ok) throw new Error(joined.reason);
+    expect(joined.party.groups).toBe(meetup.groups);
+    expect(joined.party.attendees[ALICE]?.group).toBe('A');
+  });
+});
+
+describe('Join choosing the group where there is a lobby size', () => {
+  it('places a new member by their heads, also one who is only interested', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'B', number: 3 },
+    });
+    const coming = done(setAttendance(party, BOB, Coming, { number: 2 }, lobby4));
+    expect(coming.attendees[BOB]).toMatchObject({ group: 'A', number: 2, status: Coming });
+    const interested = done(setAttendance(party, BOB, Interested, { number: 2 }, lobby4));
+    expect(interested.attendees[BOB]).toMatchObject({ group: 'A', status: Interested });
+  });
+
+  it('opens a group silently for a new member when none has room', () => {
+    const party = withAttendees(testRaid(), { [ALICE]: { number: 4 } });
+    const change = setAttendance(party, BOB, Present, {}, lobby4);
+    expect(change).toMatchObject({ ok: true, joined: true });
+    const placed = done(change);
+    expect(placed.groups.map((group) => group.id)).toEqual(['A', 'B']);
+    expect(placed.defaultGroupId).toBe('B');
+    expect(placed.attendees[BOB]?.group).toBe('B');
+  });
+
+  it('puts a member who names a group there, over the size if so', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'A', number: 4 },
+    });
+    const named = done(setAttendance(party, BOB, Coming, { group: 'A' }, lobby4));
+    expect(named.attendees[BOB]?.group).toBe('A');
+    expect(lobbyCount(named, 'A')).toBe(5);
+    expect(done(joinGroup(party, BOB, 'A', lobby4)).attendees[BOB]?.group).toBe('A');
+    expect(done(joinInto(party, BOB, 'A', lobby4)).attendees[BOB]?.group).toBe('A');
+    const interested = withAttendees(party, { [CAROL]: { group: 'B', status: Interested } });
+    expect(done(joinInto(interested, CAROL, 'A', lobby4)).attendees[CAROL]).toMatchObject({
+      group: 'A',
+      status: Coming,
+    });
+  });
+
+  it('keeps an interested member in their group when they come and it has room', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'A', number: 2 },
+      [BOB]: { group: 'A', status: Interested, number: 2 },
+    });
+    const coming = done(setAttendance(party, BOB, Coming, {}, lobby4));
+    expect(coming.attendees[BOB]).toMatchObject({ group: 'A', status: Coming });
+  });
+
+  it('places an interested member anew when they come and their group has no room for them', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'A', number: 3 },
+      [BOB]: { group: 'A', status: Interested, number: 2 },
+    });
+    expect(done(setAttendance(party, BOB, Present, {}, lobby4)).attendees[BOB]?.group).toBe('B');
+    // Their new count is what is placed.
+    const more = done(setAttendance(party, BOB, Coming, { number: 1 }, lobby4));
+    expect(more.attendees[BOB]).toMatchObject({ group: 'A', number: 1 });
+    // Interested they stay where they are.
+    const still = setAttendance(party, BOB, Interested, { number: 4 }, lobby4);
+    expect(done(still).attendees[BOB]?.group).toBe('A');
+  });
+
+  it('never moves a member who is coming, here or done, whatever their count does', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'A', number: 3 },
+      [BOB]: { group: 'A', number: 1 },
+      [CAROL]: { group: 'A', status: Complete },
+    });
+    const more = done(setAttendance(party, BOB, Present, { number: 3 }, lobby4));
+    expect(more.attendees[BOB]).toMatchObject({ group: 'A', number: 3 });
+    expect(lobbyCount(more, 'A')).toBe(6);
+    let counted = party;
+    for (let i = 0; i < 3; i++) counted = done(changeNumber(counted, BOB, 1, lobby4));
+    expect(counted.attendees[BOB]).toMatchObject({ group: 'A', number: 4 });
+    expect(done(setRemote(party, BOB, true, { number: 3 }, lobby4)).attendees[BOB]?.group).toBe(
+      'A',
+    );
+    expect(done(setAttendance(party, CAROL, Coming, {}, lobby4)).attendees[CAROL]?.group).toBe('A');
+  });
+
+  it('places somebody whom +1 or Remote signs up, as any new member', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'B', number: 4 },
+    });
+    expect(done(changeNumber(party, BOB, 1, lobby4)).attendees[BOB]?.group).toBe('A');
+    expect(done(setRemote(party, BOB, true, {}, lobby4)).attendees[BOB]?.group).toBe('A');
+  });
+
+  it('places a reporter whose automatic status signs them up', () => {
+    const party = withAttendees(testRaid(), { [ALICE]: { number: 4 } });
+    const signedUp = applyAutoStatus(party, BOB, Coming, 4);
+    expect(signedUp.joined).toBe(true);
+    expect(signedUp.party.attendees[BOB]?.group).toBe('B');
+    expect(signedUp.party.defaultGroupId).toBe('B');
+    expect(applyAutoStatus(party, BOB, Coming).party.attendees[BOB]?.group).toBe('A');
+  });
+
+  it('changes nothing without a size: the default group, however full', () => {
+    const party = withAttendees(withGroups(['A', 'B']), {
+      [ALICE]: { group: 'B', number: 20 },
+      [REPORTER]: { group: 'B', status: Interested },
+    });
+    expect(done(setAttendance(party, BOB, Coming, {}, limits)).attendees[BOB]?.group).toBe('B');
+    expect(done(setAttendance(party, REPORTER, Coming, {}, limits)).groups).toBe(party.groups);
+  });
+});
diff --git a/src/domain/party/attendance.ts b/src/domain/party/attendance.ts
index 8af72061463accdc75fc8730b9a653909dfa22e9..030e3ecaeb9c42bcf9cf34717ff1659f03ba2b3b 100644
--- a/src/domain/party/attendance.ts
+++ b/src/domain/party/attendance.ts
@@ -6,6 +6,7 @@ import {
   isRaid,
   isTimed,
   isTrain,
+  lobbyCount,
   MAX_MEMBER_NAME,
   membersWhere,
   refused,
@@ -29,6 +30,12 @@ export const MAX_GROUP_LABEL = 100;
 export interface AttendanceLimits {
   /** The largest head count one member may bring, themself included. */
   maxNumber: number;
+  /**
+   * How many trainers one group of this party holds (`lobbySize`), where it has a size: then a
+   * member who joins without naming a group is placed by `chooseGroup`. Undefined: the default
+   * group, as always.
+   */
+  lobbySize?: number | undefined;
 }
 
 /** `maximumAdditionalAttendees` of the settings counts the people a member brings along. */
@@ -165,15 +172,89 @@ export function setAttendance<P extends Party>(
   const problem = checked(party, options, limits);
   if (problem) return refused(problem);
   const existing = attendeeOf(party, memberId);
+  const number = options.number ?? existing?.number ?? 1;
+  const placed = placedFor(party, memberId, existing, status, number, options, limits);
   const attendee: Attendee = {
-    number: options.number ?? existing?.number ?? 1,
+    number,
     status,
-    group: options.group ?? existing?.group ?? party.defaultGroupId,
+    group: placed.group,
     remote: options.remote ?? existing?.remote ?? false,
     ...(existing?.name === undefined ? {} : { name: existing.name }),
     ...(existing?.team === undefined ? {} : { team: existing.team }),
   };
-  return { ok: true, party: withAttendee(party, memberId, attendee), joined: !existing };
+  return { ok: true, party: withAttendee(placed.party, memberId, attendee), joined: !existing };
+}
+
+/**
+ * The group `setAttendance` puts a member in, and the party with it (a group `chooseGroup`
+ * opened): the group they named; where the party has a lobby size and they named none, a new
+ * attendee by `chooseGroup`, and an interested one who comes their own group while it has room
+ * for them, else by `chooseGroup` too; anybody else stays where they are (a new attendee without
+ * a size: the default group).
+ */
+function placedFor<P extends Party>(
+  party: P,
+  memberId: string,
+  existing: Attendee | undefined,
+  status: PartyStatus,
+  number: number,
+  options: AttendanceOptions,
+  limits: AttendanceLimits,
+): { party: P; group: GroupId } {
+  if (options.group !== undefined) return { party, group: options.group };
+  const size = limits.lobbySize;
+  if (!existing) {
+    return size === undefined
+      ? { party, group: party.defaultGroupId }
+      : chooseGroup(party, memberId, number, size);
+  }
+  const comes = status === PartyStatus.Coming || status === PartyStatus.Present;
+  if (size === undefined || existing.status !== PartyStatus.Interested || !comes) {
+    return { party, group: existing.group };
+  }
+  if (lobbyCount(party, existing.group, memberId) + number <= size) {
+    return { party, group: existing.group };
+  }
+  return chooseGroup(party, memberId, number, size);
+}
+
+/**
+ * The group a member and their +1s (`heads`) are put in where the party's groups hold `size`
+ * trainers each (design `2026-10-20-max-battles-design.md`, section 4), counting the committed
+ * members of each (`lobbyCount`) but the member themself: the default group while they fit in
+ * it; else the first group by letter that has room for them; else a new group while the party
+ * has fewer than five (`nextGroupId`), opened silently (no line, nobody told) and made the
+ * default; else the group with the most room left, the first by letter on a tie, over its size.
+ * A member larger than a lobby by themself fits nowhere, a new group included: they go straight
+ * to the group with the most room. A party without groups (a meetup) keeps its one. The party
+ * comes back with the group opened, else the very same.
+ */
+export function chooseGroup<P extends Party>(
+  party: P,
+  memberId: string,
+  heads: number,
+  size: number,
+): { party: P; group: GroupId } {
+  if (!hasGroups(party)) return { party, group: party.defaultGroupId };
+  const count = (id: GroupId) => lobbyCount(party, id, memberId);
+  const byLetter = GROUP_IDS.filter((id) => groupOf(party, id) !== undefined);
+  // Larger than a lobby by themself: no group has room, a new one would not either.
+  const fits = heads <= size;
+  if (fits && count(party.defaultGroupId) + heads <= size) {
+    return { party, group: party.defaultGroupId };
+  }
+  const roomy = fits ? byLetter.find((id) => count(id) + heads <= size) : undefined;
+  if (roomy !== undefined) return { party, group: roomy };
+  const id = fits ? nextGroupId(party) : undefined;
+  if (id !== undefined) {
+    return {
+      party: { ...party, groups: [...party.groups, { id }], defaultGroupId: id },
+      group: id,
+    };
+  }
+  let least = byLetter[0] ?? party.defaultGroupId;
+  for (const group of byLetter) if (count(group) < count(least)) least = group;
+  return { party, group: least };
 }
 
 /**
@@ -614,11 +695,14 @@ export function setMeetingTime<P extends Party>(
 /**
  * The reporter's automatic status when they report a raid that already exists: applied only to
  * somebody who is not signed up, so that a second report never resets what a member chose.
+ * Where the party's groups hold `lobbySize` trainers, the group is chosen as Join chooses it
+ * (`chooseGroup`); otherwise it is the default group.
  */
 export function applyAutoStatus<P extends Party>(
   party: P,
   memberId: string,
   status: PartyStatus,
+  lobbySize?: number,
 ): { party: P; joined: boolean } {
   if (attendeeOf(party, memberId)) return { party, joined: false };
   if (
@@ -627,6 +711,10 @@ export function applyAutoStatus<P extends Party>(
     status !== PartyStatus.Present
   )
     return { party, joined: false };
-  const attendee: Attendee = { number: 1, status, group: party.defaultGroupId, remote: false };
-  return { party: withAttendee(party, memberId, attendee), joined: true };
+  const placed =
+    lobbySize === undefined
+      ? { party, group: party.defaultGroupId }
+      : chooseGroup(party, memberId, 1, lobbySize);
+  const attendee: Attendee = { number: 1, status, group: placed.group, remote: false };
+  return { party: withAttendee(placed.party, memberId, attendee), joined: true };
 }
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index 60f3a863ad6f666e18833b118c5ceed005ada0a0..3ccef8245a6571270f0537ba28dcc862842c53e6 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -625,11 +625,12 @@ export function isCommitted(status: AttendeeStatus): boolean {
 /**
  * Heads in a group's lobby (design `2026-10-20-max-battles-design.md`, Q5): the numbers of its
  * committed members (`isCommitted`), remote players included; not who is interested, nor who has
- * completed it.
+ * completed it. `except` is a member left out of the count (the one being placed).
  */
-export function lobbyCount(party: PartyCore, groupId: GroupId): number {
+export function lobbyCount(party: PartyCore, groupId: GroupId, except?: string): number {
   let total = 0;
-  for (const attendee of Object.values(party.attendees)) {
+  for (const [memberId, attendee] of Object.entries(party.attendees)) {
+    if (memberId === except) continue;
     if (attendee.group === groupId && isCommitted(attendee.status)) total += attendee.number;
   }
   return total;
diff --git a/src/services/attendance-service.lobby.test.ts b/src/services/attendance-service.lobby.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c1a0660558a03c698530e6cad2c95a658c4ad74a
--- /dev/null
+++ b/src/services/attendance-service.lobby.test.ts
@@ -0,0 +1,70 @@
+import { describe, expect, it } from 'vitest';
+import { gymsFixture } from '../../test/support/providers.js';
+import { ALICE, BOB, CAROL, REPORTER } from '../../test/support/parties.js';
+import { reportedRaid } from '../../test/support/party-service.js';
+import { attendeeOf } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import type { Member } from './attendance-service.js';
+
+const alice: Member = { id: ALICE, name: 'Alice' };
+const bob: Member = { id: BOB, name: 'Bob' };
+const carol: Member = { id: CAROL, name: 'Carol' };
+
+/** A raid whose groups hold four trainers, as a Dynamax battle's will (plan 8X-3). */
+const inLobbiesOf4 = { lobbySize: () => 4 };
+
+describe('AttendanceService: Join where the party has a lobby size', () => {
+  it('opens a group for whoever does not fit, silently: the line says only how they stand', async () => {
+    const made = await reportedRaid({}, inLobbiesOf4);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 4 });
+    const outcome = await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
+    expect(outcome).toMatchObject({ kind: 'ok', acted: true, attendee: { group: 'B' } });
+    expect(made.current().groups.map((group) => group.id)).toEqual(['A', 'B']);
+    expect(made.current().defaultGroupId).toBe('B');
+    await made.attendance.signUp(made.party.id, carol, PartyStatus.Interested, { number: 4 });
+    expect(attendeeOf(made.current(), CAROL)?.group).toBe('C');
+    await made.attendance.flush();
+    await made.service.flush();
+    expect(made.said()).toEqual([
+      `**Alice** (<@${ALICE}>) is coming with 3 more.`,
+      `**Bob** (<@${BOB}>) is coming, in group B.\n` +
+        `**Carol** (<@${CAROL}>) is interested with 3 more, in group C.`,
+    ]);
+    // Nobody pinged, no message but the lines.
+    expect(made.gateway.messagesIn(made.postId).every((m) => !m.message.mention)).toBe(true);
+  });
+
+  it('puts a member who names a group there, over its size', async () => {
+    const made = await reportedRaid({}, inLobbiesOf4);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 4 });
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
+    const back = await made.attendance.joinGroup(made.party.id, bob, 'A');
+    expect(back).toMatchObject({ kind: 'ok', attendee: { group: 'A' } });
+  });
+
+  it('places a reporter whom a second report signs up', async () => {
+    const made = await reportedRaid({ autoStatus: PartyStatus.Coming }, inLobbiesOf4);
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 3 });
+    const gym = gymsFixture().get(1);
+    if (!gym) throw new Error('no gym 1');
+    const again = await made.service.reportRaid({
+      gym,
+      reporterId: BOB,
+      anonymous: false,
+      autoStatus: PartyStatus.Coming,
+      tier: { level: 'T5', shadow: false },
+      boss: null,
+    });
+    expect(again).toMatchObject({ kind: 'exists', joined: true });
+    expect(attendeeOf(made.current(), REPORTER)?.group).toBe('A');
+    expect(attendeeOf(made.current(), BOB)?.group).toBe('B');
+  });
+
+  it('keeps the default group for every party there is today', async () => {
+    const made = await reportedRaid();
+    await made.attendance.signUp(made.party.id, alice, PartyStatus.Coming, { number: 20 });
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
+    expect(attendeeOf(made.current(), BOB)?.group).toBe('A');
+    expect(made.current().groups).toHaveLength(1);
+  });
+});
diff --git a/src/services/attendance-service.ts b/src/services/attendance-service.ts
index c79d84de295bc48bef33202d2773cd3a2913efe7..449e6784292357304d10613c5ccfa680757271fd 100644
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -23,6 +23,7 @@ import {
   type MemberInfo,
   withdrawQuestions,
 } from '../domain/party/attendance.js';
+import { lobbySize } from '../domain/party/lobby.js';
 import {
   attendeeOf,
   groupOf,
@@ -89,6 +90,11 @@ export interface AttendanceServiceOptions {
   settings: Settings;
   log: Logger;
   now?: () => number;
+  /**
+   * How many trainers one group of a party holds; by default `lobbySize` of the settings, which
+   * no party of today has. Tests give a size here to reach what max battles (plan 8X-3) switch on.
+   */
+  lobbySize?: (party: Party) => number | undefined;
 }
 
 /** What the post is told when a member has left; the conductor of a train leaves it without one. */
@@ -121,8 +127,12 @@ export class AttendanceService {
   /** Messages being sent or deleted on the side; `flush` waits for them. */
   private readonly background = new Set<Promise<void>>();
 
+  /** How many trainers one group of a party holds, where it has a size (`lobbySize`). */
+  private readonly lobbySize: (party: Party) => number | undefined;
+
   constructor(private readonly options: AttendanceServiceOptions) {
     this.now = options.now ?? (() => Date.now());
+    this.lobbySize = options.lobbySize ?? ((party) => lobbySize(party, options.settings.lobbies));
   }
 
   /** The largest head count a member may bring, from the settings. */
@@ -130,6 +140,11 @@ export class AttendanceService {
     return attendanceLimits(this.options.settings);
   }
 
+  /** The limits of a change of this party: with the size of its groups where it has one. */
+  private limitsOf(party: Party): AttendanceLimits {
+    return { ...this.limits(), lobbySize: this.lobbySize(party) };
+  }
+
   /** Interested, coming or here; what `options` leaves out stays as it is. */
   signUp(
     partyId: string,
@@ -138,7 +153,7 @@ export class AttendanceService {
     options: AttendanceOptions = {},
   ): Promise<AttendanceOutcome> {
     return this.apply(partyId, member, (party) =>
-      setAttendance(party, member.id, status, options, this.limits()),
+      setAttendance(party, member.id, status, options, this.limitsOf(party)),
     );
   }
 
@@ -156,7 +171,7 @@ export class AttendanceService {
         if (isDone(party, member.id)) return refused('already-done');
         const wanted =
           remote === 'toggle' ? !(attendeeOf(party, member.id)?.remote ?? false) : remote;
-        return setRemote(party, member.id, wanted, options, this.limits());
+        return setRemote(party, member.id, wanted, options, this.limitsOf(party));
       },
       (party) => {
         const attendee = attendeeOf(party, member.id);
@@ -172,7 +187,7 @@ export class AttendanceService {
     return this.apply(partyId, member, (party) =>
       isDone(party, member.id)
         ? refused('already-done')
-        : changeNumber(party, member.id, delta, this.limits()),
+        : changeNumber(party, member.id, delta, this.limitsOf(party)),
     );
   }
 
@@ -226,7 +241,7 @@ export class AttendanceService {
     return this.apply(partyId, member, (party) =>
       isDone(party, member.id)
         ? refused('already-done')
-        : joinGroup(party, member.id, group, this.limits()),
+        : joinGroup(party, member.id, group, this.limitsOf(party)),
     );
   }
 
@@ -235,7 +250,7 @@ export class AttendanceService {
     return this.apply(partyId, member, (party) =>
       isDone(party, member.id)
         ? refused('already-done')
-        : joinInto(party, member.id, group, this.limits()),
+        : joinInto(party, member.id, group, this.limitsOf(party)),
     );
   }
 
@@ -247,7 +262,7 @@ export class AttendanceService {
     const outcome = await this.apply(
       partyId,
       member,
-      (party) => createGroup(party, member.id, this.limits()),
+      (party) => createGroup(party, member.id, this.limitsOf(party)),
       'none',
     );
     if (outcome.kind === 'ok' && outcome.acted) {
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 81be676c9e969d14ad7835e9b9261b521e4dccf2..92d93942ad40caf125134fe82805fb4176be58a2 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -22,6 +22,7 @@ import { MAX_CATEGORY_CHANNELS, MAX_SERVER_CHANNELS } from '../domain/regions/re
 import type { PartyEnd } from '../domain/history/party-history.js';
 import type { PostRemoval } from '../domain/moderation/reports.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
+import { lobbySize } from '../domain/party/lobby.js';
 import { createMeetup, tidyDescription } from '../domain/party/meetup.js';
 import type { PostsRefused } from '../domain/party/post-permissions.js';
 import {
@@ -438,6 +439,11 @@ export interface PartyServiceOptions {
   settings: Settings;
   log: Logger;
   now?: () => number;
+  /**
+   * How many trainers one group of a party holds; by default `lobbySize` of the settings, which
+   * no party of today has. Tests give a size here to reach what max battles (plan 8X-3) switch on.
+   */
+  lobbySize?: (party: Party) => number | undefined;
   /** How long changes of one post are gathered into one edit. Default two seconds. */
   renderDelayMs?: number;
   /** The same for a party's copies in the server's shared channels. Default ten seconds. */
@@ -528,10 +534,13 @@ export class PartyService {
   private readonly refusedFiles: RefusedFiles;
   /** The forums where the bot was found not to be allowed to make posts, said once each. */
   private readonly refusedForums = new BoundedMap<string, true>(1_000);
+  /** How many trainers one group of a party holds, where it has a size (`lobbySize`). */
+  private readonly lobbySize: (party: Party) => number | undefined;
 
   constructor(private readonly options: PartyServiceOptions) {
     this.now = options.now ?? (() => Date.now());
     this.eggPictures = options.eggPictures ?? new EggPictures(options.settings);
+    this.lobbySize = options.lobbySize ?? ((party) => lobbySize(party, options.settings.lobbies));
     this.refusedFiles = new RefusedFiles(this.now);
     this.mirrors = new PartyMirrors({
       store: options.store,
@@ -909,7 +918,12 @@ export class PartyService {
           elsewhere = true;
           return { party, joined: false };
         }
-        const applied = applyAutoStatus(party, report.reporterId, report.autoStatus);
+        const applied = applyAutoStatus(
+          party,
+          report.reporterId,
+          report.autoStatus,
+          this.lobbySize(party),
+        );
         // Only somebody this report signed up: an attendee's record is theirs to change.
         return applied.joined
           ? {
diff --git a/test/support/party-service.ts b/test/support/party-service.ts
index e601a9cfdf82619c1763b3d542edf16c27667bc2..7a4e225d63220b226786fb7be77cbe95d9011e2d 100644
--- a/test/support/party-service.ts
+++ b/test/support/party-service.ts
@@ -439,6 +439,8 @@ export async function partyServiceWith(
     settings,
     log,
     now,
+    // A size given to the party service (a test of lobbies) is the attendance service's too.
+    ...(forService.lobbySize === undefined ? {} : { lobbySize: forService.lobbySize }),
   });
   const raids = new RaidChangeService({
     store,
````

### Task 3: Plan 8X-1 T3: A group's line counts its lobby, n/cap coming

Prototype commit: `c4d9af39456b98a55dcbbc9d67247f63a5d197f3`

Where a party has a lobby size, a group's heading shows `3/4 coming ·
1 interested` in the place of `N trainers` (with one group, above the
statuses), and a group over its size says under its heading that somebody
could move to another group. The split-up note of a raid or a train reads
settings.lobbies.raid (the LOBBY_SIZE constant is gone; default 20, so the
post is unchanged). PartyService's views carry both sizes.

**Files:**

```
 docs/architecture/parties-and-posts.md   |   4 +-
 src/config/settings.ts                   |   4 +-
 src/domain/party/lobby.ts                |   4 +-
 src/render/party-post.lobby.test.ts      | 141 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/party-post.ts                 |  52 ++++++++++++++++---
 src/render/raid-post.test.ts             |  14 +++++
 src/render/raid-post.ts                  |   3 ++
 src/render/timed-post.ts                 |   3 ++
 src/render/train-post.test.ts            |  15 ++++++
 src/services/party-service.lobby.test.ts |  83 ++++++++++++++++++++++++++++++
 src/services/party-service.ts            |  11 ++++
 11 files changed, 320 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/render/party-post.lobby.test.ts src/render/raid-post.test.ts src/render/train-post.test.ts src/services/party-service.lobby.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c4d9af39456b98a55dcbbc9d67247f63a5d197f3 -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8X-1 T3: A group's line counts its lobby, n/cap coming`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index b7dfac7c5afe7f8b7618fd2eff4072efb61bb744..997c77319b2afc0e760a006bc35f12d3dd041011 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -12,7 +12,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - `PartyStore.onChange(listener)` tells of every added party and every stored change, `(before, after)`, right after memory was replaced; a listener decides and returns (never `async`), and what takes time it does on the side. It is for what follows from a change whoever made it.
 - A raid's boss is stored as a reference, `{ key }` (catalogue key) or `{ name }` (a boss the game master does not know): make it with `raidBossRef(boss)` from a `RaidBoss` of `ctx.raidBosses`, never by passing that object itself. An egg has no boss; `raid.reportedHatched` says whether a raid without times was seen hatched.
 - `PartyRepository` keeps what is searched by in columns and the rest in one versioned JSON document (`party-state.ts`), checked when written and when read; a row it cannot read is reported and left alone. Attendees are a list there, because MySQL sorts the keys of a JSON object. Any new field in the document is a new version with a reader for the old one.
-- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is read by nothing yet) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold, undefined for every party that exists today (a raid, a raid train, a meetup: Q6), an exhaustive switch on the kind that the max battle (8X-3, by its tier) and the Gigantamax train (8X-4) fill in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete. Where a party has a size, Join fills its groups: the services put `lobbySize` into the `AttendanceLimits` of each change (`AttendanceService.limitsOf(party)`; `PartyService` passes it to `applyAutoStatus`; both take `lobbySize` as an option, which tests use to give a raid a size), and `setAttendance` places a member who is not yet an attendee and names no group, whatever the status, and an Interested one who becomes Coming or Present (their own group while it has room for them) through `chooseGroup(party, member, heads, size)` (`attendance.ts`): the default group while they and their +1s fit, else the first group by letter with room, else a new group while there are fewer than five, opened silently (no line, no ping, unlike `createGroup`) and made the default, else the group with the most room, the first by letter on a tie, over its size; the member is never counted against their own group. A member larger than a lobby by themself goes straight to the group with the most room (no new group would hold them either), and a party without groups (a meetup) keeps its one. `+1` and Remote sign a new member up the same way. Nothing else moves anybody: a count or a change to Coming that puts a group over its size leaves them there, and `/group join`, a group's Join and anything that names a group put the member where they asked, over the size if so. Without a size every change is what it was.
+- Lobbies (plan 8X-1; design `2026-10-20-max-battles-design.md`, section 4): `settings.lobbies` (`{ raid, dynamax, gigantamax }`, each 1 to 100, defaults 20, 4, 100, `DEFAULT_LOBBIES`; `raid` is only the size above which a group of a raid or a train is told to split up, `TrainersView.raidLobby`) and `lobbySize(party, lobbies)` (`src/domain/party/lobby.ts`): how many trainers one group should hold, undefined for every party that exists today (a raid, a raid train, a meetup: Q6), an exhaustive switch on the kind that the max battle (8X-3, by its tier) and the Gigantamax train (8X-4) fill in. A group's lobby is `lobbyCount(party, group)` (`party.ts`, beside `headCount`): the heads of its committed members (`isCommitted`: Coming, Present, CompletePending), remote included; not Interested, not Complete. Where a party has a size, Join fills its groups: the services put `lobbySize` into the `AttendanceLimits` of each change (`AttendanceService.limitsOf(party)`; `PartyService` passes it to `applyAutoStatus`; both take `lobbySize` as an option, which tests use to give a raid a size), and `setAttendance` places a member who is not yet an attendee and names no group, whatever the status, and an Interested one who becomes Coming or Present (their own group while it has room for them) through `chooseGroup(party, member, heads, size)` (`attendance.ts`): the default group while they and their +1s fit, else the first group by letter with room, else a new group while there are fewer than five, opened silently (no line, no ping, unlike `createGroup`) and made the default, else the group with the most room, the first by letter on a tie, over its size; the member is never counted against their own group. A member larger than a lobby by themself goes straight to the group with the most room (no new group would hold them either), and a party without groups (a meetup) keeps its one. `+1` and Remote sign a new member up the same way. Nothing else moves anybody: a count or a change to Coming that puts a group over its size leaves them there, and `/group join`, a group's Join and anything that names a group put the member where they asked, over the size if so. Without a size every change is what it was.
 - How long a raid lasts comes from `raidDurationsAt` / `hatchTimeForEnd` / `longestRaidDurations` (`src/domain/time/raid-durations.ts`) with `raidDurationRules(settings, ctx.raidEvents.events())`: the configured durations, changed for a standard raid that hatches during a Raid Hour or Raid Day (`settings.raidEvents`; events come from the feed, and the weekly Raid Hour of the settings applies in a week for which the feed lists none). Pass `longestRaidDurations(...)` as `durations` to `resolvePartyTime`.
 
 ## Commands and controls in a post
@@ -43,7 +43,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - What every post shares is in `src/render/party-post.ts` (`RenderedPost`, `renderedPost`, `PostLayout`, `postMessage`, `fittedLayout`, `trainerBlocks`, `FORUM_TAGS` and `RETIRED_TAGS` (tags the bot once used: `/admin setup-forums` takes them off a forum, never a tag the server made), `inShownOrder`), the components in `src/render/v2.ts` (with `countComponents`, the count Discord's limit is about, the one every renderer uses); `renderRaidPost`, `renderMeetupPost` and `renderTrainPost` build on it. Text of several lines a member wrote is shown through `plainLines()`; `plain()` also breaks masked links. A time in a sentence is `clockOrDate(time, now)` for a raid and `clockOrDay(time, now, zone)` for a timed party (the date whenever it is not today). The information of a meetup stands under "Meeting Information" and is never cut. Every post says where the party is under **Where** (plan 8D, Matt, 2026-10-17, like the `/wild` report's Where; the layout below).
 - The layout of a post (plan 8D; Matt, 2026-10-17, mockup version 4): a heading block says what the party is, with the post's picture beside it (`accessory: 'picture'`): a raid `### Level 5 raid against Yveltal ✨` / `### Level 5 raid (egg)` (`heading`; the DM brief keeps the bold `headline`), its times or `closed`, `KEPT_OPEN`, then the boss's lines (`bossLines`: "Hatches as …" for an egg, weaknesses, catch CP, moves), which are no block of their own; a train `### Raid Train: <name>`, "After …", times, conductor, `KEPT_OPEN` and the boss's facts; a meetup its name and times. The gym's name no longer opens a raid's post (its thread title keeps it), and a copy's line (`lead`) still opens the first text. Then **Where**: for a raid and a train's current stop `gymWhere(heading, gym, fit)` (`src/render/raid-post.ts`): one line `**<gym>** · <address> · [Map](<…>)` (the name plain bold, never a link; `addressLine` made plain and cut to `ADDRESS_ROOM`; the one Map of the post, masked, in angle brackets so that it shows no preview), then the gym's notice (`plainLines`, cut to `LOCATION_ROOM` through `fit.part`), with the gym's picture from Wayfarer beside them (`placeSection`, a `PostThumbnail`; plan 8W-2: `Gym.imageUrl`, only an address `wayspotPicture` allows, `src/domain/wayspots/picture.ts`, Google's `lh3.googleusercontent.com` by https, one by plain http shown by https on the same host, and always asked for small: any size option after the last path segment becomes `=s400`, `WAYSPOT_PICTURE_SIZE`, the query kept). Without an address the line is `**<gym>** · [Map](…)`; beside a picture it says `(no address available)` (`NO_ADDRESS`) so that the picture never sits beside a bare name, and where the message leaves the picture out (`picture: false`, or over `MAX_COMPONENTS`) those words go with it (`PostThumbnail.withoutPicture`). A raid whose gym is gone says `**Unknown gym**`, without a map. No post says that a gym is an elite raid gym (Matt, 2026-10-17: it mattered for EX raids; the gym keeps its flags for staff's views, `/gym elite` and the `#elite-gym-raids` copies). A train's Where is in `trains.md`, a meetup's below ("Meetups and timed parties"). Everything from the sign-up lists down is as it was. The gym's picture goes with the post's (`picture: false`): a post, an edit and a copy that Discord refuses are sent once more without them whenever the layout holds either (`layoutPicture`), and `postMessage` leaves it out of a post that would otherwise hold more than `MAX_COMPONENTS` (two components more) once the trainers' details are back inside their sections (below).
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members (the `teamless` emoji before members without a team, only where one of that name exists).
-- The trainers (`trainerBlocks`, plan 8D-F, Matt's mockup of 2026-10-17): the Discord app on a phone puts a section's button under its text whenever the text has more than one line, so the text beside a button is one line. With one group each status is a section of its heading alone (`**Interested (2)**`) with its button, and its names (`fit.list`) are the section's `details`, a text display right under it; with several each group's section holds only its heading line (`**Group A: label** · 3 trainers · meeting at …`) with its Join (the letter "A" with Join's icon), and its lobby note, its status lines (or "Nobody yet") are its details. The heading text of a single group with a label or a meeting time and the complete list of a raid of several groups stay texts. A raid that is not over (`meetHint`, plan 8D-F F4, Matt, 2026-10-17; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while there is none: with one group ``-# No meeting time yet: `/meet` sets one.`` (`NO_MEETING_TIME`) under the group's label, or as a heading text of its own without one; with several, groups with a time keep their "meeting at …" and one small-print text after the groups, ``-# `/meet` sets your group's meeting time.`` (`GROUP_MEETING_HINT`: `/meet` sets the meeting time of the member's own group), while at least one group that somebody is in has none. Both lines are the post's own (`postOnly` of a text block): a copy in another channel (`lead`: the remote, elite and region copies, where `/meet` does not work) leaves them out, the copy at the bottom of the post (`status`) keeps them. The worst raid without meeting times holds 40 with both pictures, one more group's lines beside its Join. Each details text is one component more: `postMessage` puts details back into their section (`content\ndetails`), the last first and as few as make the message fit `MAX_COMPONENTS`, before it leaves out the gym's picture (the least harm: a section with its details inside is how every post looked before), and into one text display where no button stands beside it (`controls: false`). The worst cases (5 groups, every control, both pictures): a raid would hold 43, so groups C to E keep their lines beside their Join and it holds 40 with both pictures; a train 44 with Split group… (plan 8T), four groups folded, 40 (43 and three folded before 8T); a raid of one group 35 (34 without Screenshot feedback), a meetup 28, nothing folded (before 8D-G, with the buttons below the lists in up to three rows: a raid 44, B to E folded; before 8D-F: 39, 38, 32, 25). Tests read a status with its names as one text through `partTexts` and the sections with their buttons through `sectionsOf` (`test/support/messages.ts`).
+- The trainers (`trainerBlocks`, plan 8D-F, Matt's mockup of 2026-10-17): the Discord app on a phone puts a section's button under its text whenever the text has more than one line, so the text beside a button is one line. With one group each status is a section of its heading alone (`**Interested (2)**`) with its button, and its names (`fit.list`) are the section's `details`, a text display right under it; with several each group's section holds only its heading line (`**Group A: label** · 3 trainers · meeting at …`) with its Join (the letter "A" with Join's icon), and its lobby note, its status lines (or "Nobody yet") are its details. The heading text of a single group with a label or a meeting time and the complete list of a raid of several groups stay texts. A raid that is not over (`meetHint`, plan 8D-F F4, Matt, 2026-10-17; not once its stage is ended or it was closed, never on a meetup or a train, whose heading block says how to set their start) says how to get a meeting time while there is none: with one group ``-# No meeting time yet: `/meet` sets one.`` (`NO_MEETING_TIME`) under the group's label, or as a heading text of its own without one; with several, groups with a time keep their "meeting at …" and one small-print text after the groups, ``-# `/meet` sets your group's meeting time.`` (`GROUP_MEETING_HINT`: `/meet` sets the meeting time of the member's own group), while at least one group that somebody is in has none. Both lines are the post's own (`postOnly` of a text block): a copy in another channel (`lead`: the remote, elite and region copies, where `/meet` does not work) leaves them out, the copy at the bottom of the post (`status`) keeps them. The worst raid without meeting times holds 40 with both pictures, one more group's lines beside its Join. Each details text is one component more: `postMessage` puts details back into their section (`content\ndetails`), the last first and as few as make the message fit `MAX_COMPONENTS`, before it leaves out the gym's picture (the least harm: a section with its details inside is how every post looked before), and into one text display where no button stands beside it (`controls: false`). The worst cases (5 groups, every control, both pictures): a raid would hold 43, so groups C to E keep their lines beside their Join and it holds 40 with both pictures; a train 44 with Split group… (plan 8T), four groups folded, 40 (43 and three folded before 8T); a raid of one group 35 (34 without Screenshot feedback), a meetup 28, nothing folded (before 8D-G, with the buttons below the lists in up to three rows: a raid 44, B to E folded; before 8D-F: 39, 38, 32, 25). Tests read a status with its names as one text through `partTexts` and the sections with their buttons through `sectionsOf` (`test/support/messages.ts`). A group of a raid or a train with more heads than `settings.lobbies.raid` (`TrainersView.raidLobby`, the settings' 20 by default; Interested included, as before) is told `More than 20 trainers: a lobby holds 20, so split up.` Where the party has a lobby size (`TrainersView.lobbySize`, which `PartyService`'s views take from `lobbySize`; plan 8X-1) a group's heading counts its lobby in the place of `N trainers`: `**Group A** · 3/4 coming · 1 interested` (`lobbyLine`: `lobbyCount` over the size, here and asked counted as coming, then the Interested heads only when there are any), and with one group that line (after the group's name where it has a label or a meeting time) heads the statuses; a group over its size gets `LOBBY_OVER` ("Over the lobby size: somebody could move to another group.") under its heading, as its first detail, in the place of the split-up note (a party with a lobby size never shows that one), so that the heading beside Join stays one short line. Without a size the post is as it was.
 - The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`): with one group a status's button stands beside its heading (`statusButton`: Interested, Join, Here, Done, an icon without a label, plan 8D-G, Matt, 2026-10-17: a phone drops a section's button under its line when the button is wider than it allows, and "🤔 Interested" was; the line says what the button does, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name after the line), with several the group's letter with Join's icon beside each group ("A", `joinGroupButton`, the action `group`: `AttendanceService.joinInto` makes the member coming in that group from any status, and only moves one who is coming; the Join of the member's own group changes only Interested and leaves Present, and a member who is asked whether they completed the raid, as they are; `/group join` keeps the status) and the statuses' buttons in a row below; then the rows of `bottomControls` (no Map: a post's one Map is in its Where, plan 8D): with several groups the statuses' row (Interested, Here, Done for a raid, Leave), then one row of Leave (with one group), −1, +1, Remote (not for an elite raid), Set time (a raid without times) and Screenshot feedback (a raid from a kept screenshot), cut into rows of five (Matt, 2026-10-17, plan 8D-G: a phone wraps a row as it likes; one row is one component fewer). So a raid of one group has one row, two only with Set time and Screenshot feedback both (the latter alone in the second); a raid of several groups two; an elite raid of one group one; a meetup one; a train one, or two with groups, every button with its emoji: buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin` (Join and a group's Join), `pinehere`, `pinedone`, `pineleave` (Leave, which keeps its word) and `pineremote` (Remote, which keeps its word), else the plain ones (🏃 ✅ 🎉 👋 📡); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `statusButton`, `joinGroupButton` and `bottomControls`. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 8f7a61e914abad7a904ebc2fc06e925cefab76c6..95151a33ac8ef5b5aab7f4ede002b510c2401a86 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -84,8 +84,8 @@ export const settingsSchema = z.strictObject({
    * How many trainers one lobby holds, by the kind of battle (design
    * `2026-10-20-max-battles-design.md`, section 4): `dynamax` and `gigantamax` are the sizes Join
    * fills a max battle's groups to (and a Gigantamax train's), and the `3/4 coming` of a group's
-   * line; `raid` is kept for a later use and read by nothing yet (a raid's members choose their
-   * groups). Each 1 to 100; a file without them, or without one, takes the game's: 20, 4, 100.
+   * line; `raid` is only the size above which a raid's or a train's group is told to split up
+   * (their members choose their groups). Each 1 to 100; a file without them, or without one, takes the game's: 20, 4, 100.
    */
   lobbies: z
     .strictObject({
diff --git a/src/domain/party/lobby.ts b/src/domain/party/lobby.ts
index b7b1d574fbb39af38ea5c21fb1b4536ed295408c..31317a79a2d3f4a6e56e3c9f055b25ed0d27165a 100644
--- a/src/domain/party/lobby.ts
+++ b/src/domain/party/lobby.ts
@@ -3,8 +3,8 @@ import type { Party } from './party.js';
 /**
  * How many trainers one lobby of each kind of battle holds (`settings.lobbies`; design
  * `2026-10-20-max-battles-design.md`, section 4): a raid, a Dynamax battle, a Gigantamax battle.
- * `raid` is kept for a later use: no party reads it yet (a raid and a raid train choose their
- * groups themselves, Q6).
+ * `raid` is only the size above which the post tells a group of a raid or a train to split up:
+ * their members choose their groups themselves (Q6), so it is no `lobbySize`.
  */
 export interface Lobbies {
   raid: number;
diff --git a/src/render/party-post.lobby.test.ts b/src/render/party-post.lobby.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..58eb378dc4d4365642273cbbc1296304f9bc2f8e
--- /dev/null
+++ b/src/render/party-post.lobby.test.ts
@@ -0,0 +1,141 @@
+import { describe, expect, it } from 'vitest';
+import { sectionsOf, textDisplays } from '../../test/support/messages.js';
+import { testRaid, withAttendees } from '../../test/support/parties.js';
+import type { Attendee, GroupId, RaidParty } from '../domain/party/party.js';
+import { PartyStatus } from '../domain/party/status.js';
+import {
+  LOBBY_OVER,
+  postMessage,
+  trainerBlocks,
+  type Fit,
+  type PostBlock,
+  type PostEmoji,
+} from './party-post.js';
+
+const { Interested, Coming, Present, CompletePending, Complete } = PartyStatus;
+const emoji: PostEmoji = {
+  shiny: '✨',
+  remote: '📡',
+  teams: { instinct: '⚡', mystic: '❄️', valor: '🔥' },
+};
+const all: Fit = { list: (items) => items.join(', '), part: (make) => make(Infinity) };
+const ALL = { complete: true, lobby: true, meetHint: false };
+const shown = (blocks: PostBlock[]) => postMessage({ accent: 1, blocks });
+const contents = (blocks: PostBlock[]) =>
+  blocks.map((block) => (block.type === 'text' || block.type === 'section' ? block.content : ''));
+
+function raidOf(
+  attendees: Record<string, Partial<Attendee>>,
+  groups: GroupId[] = ['A'],
+): RaidParty {
+  const raid = testRaid();
+  return withAttendees(
+    { ...raid, attendees: {}, groups: groups.map((id) => ({ id })), defaultGroupId: 'A' },
+    attendees,
+  );
+}
+
+describe('trainerBlocks with a lobby size', () => {
+  it('heads one group with its committed heads over the size, and who is interested', () => {
+    const party = raidOf({
+      '300000000000000001': { name: 'Ann', status: Coming, number: 2, remote: true },
+      '300000000000000002': { name: 'Bea', status: Present },
+      '300000000000000003': { name: 'Cid', status: Interested },
+      '300000000000000004': { name: 'Dot', status: Complete, number: 3 },
+    });
+    const blocks = trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all);
+    expect(contents(blocks)[0]).toBe('3/4 coming · 1 interested');
+    // The status lines stay as they are.
+    expect(sectionsOf(shown(blocks)).map((section) => section.text)).toEqual([
+      '**Interested (1)**',
+      '**Coming (2)**',
+      '**Present (1)**',
+      '**Complete (3)**',
+    ]);
+  });
+
+  it('leaves out who is interested when nobody is, and names the group when it has a label', () => {
+    const party = raidOf({ '300000000000000001': { name: 'Ann', status: Coming } });
+    expect(contents(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toBe('1/4 coming');
+    const labelled = { ...party, groups: [{ id: 'A' as const, label: 'north' }] };
+    expect(contents(trainerBlocks({ party: labelled, emoji, lobbySize: 4 }, ALL, all))[0]).toBe(
+      '**Group A: north** · 1/4 coming',
+    );
+  });
+
+  it('says a group over its size could lose somebody to another group', () => {
+    const party = raidOf({
+      '300000000000000001': { name: 'Ann', status: Coming, number: 3 },
+      '300000000000000002': { name: 'Bea', status: CompletePending, pendingUntil: 1, number: 2 },
+      '300000000000000003': { name: 'Cid', status: Interested },
+    });
+    expect(LOBBY_OVER).toBe('Over the lobby size: somebody could move to another group.');
+    expect(contents(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all))[0]).toBe(
+      `5/4 coming · 1 interested\n${LOBBY_OVER}`,
+    );
+  });
+
+  it('heads each of several groups so beside its Join, the note over the size under it', () => {
+    const party = raidOf(
+      {
+        '300000000000000001': { name: 'Ann', status: Coming, number: 4 },
+        '300000000000000002': { name: 'Bea', status: Interested, group: 'A' },
+        '300000000000000003': { name: 'Cid', status: Present, group: 'B', number: 5 },
+      },
+      ['A', 'B', 'C'],
+    );
+    const message = shown(trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all));
+    expect(sectionsOf(message)).toEqual([
+      { text: '**Group A** · 4/4 coming · 1 interested', button: 'A' },
+      { text: '**Group B** · 5/4 coming', button: 'B' },
+      { text: '**Group C** · 0/4 coming', button: 'C' },
+    ]);
+    expect(textDisplays(message)).toEqual([
+      '**Group A** · 4/4 coming · 1 interested',
+      'Interested (1): Bea\nComing (4): Ann +3',
+      '**Group B** · 5/4 coming',
+      `${LOBBY_OVER}\nPresent (5): Cid +4`,
+      '**Group C** · 0/4 coming',
+      'Nobody yet',
+    ]);
+  });
+
+  it('tells a group of a raid to split up by the raid lobby of the settings', () => {
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 4; n++) crowd[`31000000000000000${n}`] = { number: 3 };
+    const party = raidOf(crowd);
+    expect(contents(trainerBlocks({ party, emoji, raidLobby: 11 }, ALL, all))[0]).toBe(
+      'More than 11 trainers: a lobby holds 11, so split up.',
+    );
+    // Not over it: no note; and without the setting, the game's 20.
+    expect(contents(trainerBlocks({ party, emoji, raidLobby: 12 }, ALL, all))[0]).toBe(
+      '**Interested (0)**',
+    );
+    expect(contents(trainerBlocks({ party, emoji }, ALL, all))[0]).toBe('**Interested (0)**');
+  });
+
+  it('tells a sized group of more than a raid lobby only that it is over its size', () => {
+    const crowd: Record<string, Partial<Attendee>> = {};
+    for (let n = 0; n < 7; n++) crowd[`31000000000000000${n}`] = { number: 3 };
+    const party = raidOf(crowd, ['A', 'B']);
+    const blocks = trainerBlocks({ party, emoji, lobbySize: 4 }, ALL, all);
+    const texts = textDisplays(shown(blocks));
+    expect(texts[1]).toMatch(new RegExp(`^${LOBBY_OVER}\\nComing \\(21\\): `));
+    expect(texts.join('\n')).not.toContain('so split up');
+    const one = trainerBlocks({ party: raidOf(crowd), emoji, lobbySize: 4 }, ALL, all);
+    expect(contents(one)[0]).toBe(`21/4 coming\n${LOBBY_OVER}`);
+  });
+
+  it('shows the post of today without a size', () => {
+    const party = raidOf({ '300000000000000001': { name: 'Ann', status: Coming, number: 4 } }, [
+      'A',
+      'B',
+    ]);
+    expect(sectionsOf(shown(trainerBlocks({ party, emoji }, ALL, all)))[0]).toEqual({
+      text: '**Group A** · 4 trainers',
+      button: 'A',
+    });
+    const one = raidOf({ '300000000000000001': { name: 'Ann', status: Coming } });
+    expect(contents(trainerBlocks({ party: one, emoji }, ALL, all))[0]).toBe('**Interested (0)**');
+  });
+});
diff --git a/src/render/party-post.ts b/src/render/party-post.ts
index 36b83a68263e03881ce377d36e276298cd8bd36f..434a2b57a07482417069e3383884b11dcceb0d7b 100644
--- a/src/render/party-post.ts
+++ b/src/render/party-post.ts
@@ -2,12 +2,14 @@ import { ComponentType, type APIButtonComponent, type APIComponentInContainer }
 import type { MessageFile, V2Message } from '../discord/party-gateway.js';
 import {
   headCount,
+  lobbyCount,
   membersWhere,
   type Attendee,
   type Party,
   type PartyGroup,
   type Team,
 } from '../domain/party/party.js';
+import { DEFAULT_LOBBIES } from '../domain/party/lobby.js';
 import { PartyStatus } from '../domain/party/status.js';
 import { joinGroupButton, statusButton, type ShownStatus } from './party-controls.js';
 import { count, memberName, plain, timestamp } from './text.js';
@@ -43,9 +45,6 @@ export type ForumTag = (typeof FORUM_TAGS)[number];
  */
 export const RETIRED_TAGS = ['EX'] as const;
 
-/** A lobby holds this many trainers; a bigger group of a raid is told to split. */
-export const LOBBY_SIZE = 20;
-
 /** The colour of the post of a party that is over, whatever its kind. */
 export const ENDED_COLOUR = 0xe74c3c;
 
@@ -80,6 +79,17 @@ export interface PostEmoji {
 export interface TrainersView {
   party: Party;
   emoji: PostEmoji;
+  /**
+   * How many trainers one group holds (`lobbySize`), where the party has a size: each group's
+   * heading then counts its lobby, `3/4 coming · 1 interested`. Undefined for every party of
+   * today, whose post is as it was.
+   */
+  lobbySize?: number | undefined;
+  /**
+   * How many trainers a raid's lobby holds (`settings.lobbies.raid`): a bigger group of a raid
+   * or a train is told to split up. The settings' default (`DEFAULT_LOBBIES.raid`) when unset.
+   */
+  raidLobby?: number | undefined;
 }
 
 /** What a forum post of a party shows. */
@@ -687,12 +697,35 @@ function groupName(group: PartyGroup, fit: Fit): string {
   return `Group ${group.id}${label ? `: ${fit.part((room) => cutText(plain(label), room))}` : ''}`;
 }
 
+/** Under the heading of a group that holds more than its lobby size (a member's +1s, a choice). */
+export const LOBBY_OVER = 'Over the lobby size: somebody could move to another group.';
+
 function lobbyNote(view: TrainersView, group: PartyGroup, options: TrainerOptions): string[] {
-  return options.lobby && headCount(view.party, group.id) > LOBBY_SIZE
-    ? [`More than ${LOBBY_SIZE} trainers: a lobby holds ${LOBBY_SIZE}, so split up.`]
+  // A party with a lobby size has its own note, in the place of the raid's.
+  if (view.lobbySize !== undefined) {
+    return lobbyCount(view.party, group.id) > view.lobbySize ? [LOBBY_OVER] : [];
+  }
+  const raidLobby = view.raidLobby ?? DEFAULT_LOBBIES.raid;
+  return options.lobby && headCount(view.party, group.id) > raidLobby
+    ? [`More than ${raidLobby} trainers: a lobby holds ${raidLobby}, so split up.`]
     : [];
 }
 
+/**
+ * A group's lobby, where the party has a size: `3/4 coming · 1 interested`, its committed heads
+ * (`lobbyCount`: here and asked count as coming) over the size, then the heads of who is
+ * interested, only when there are any. Undefined without a size.
+ */
+function lobbyLine(view: TrainersView, group: PartyGroup): string | undefined {
+  const size = view.lobbySize;
+  if (size === undefined) return undefined;
+  const interested = Object.values(view.party.attendees)
+    .filter((attendee) => attendee.group === group.id && attendee.status === PartyStatus.Interested)
+    .reduce((sum, attendee) => sum + attendee.number, 0);
+  const coming = `${lobbyCount(view.party, group.id)}/${size} coming`;
+  return interested > 0 ? `${coming} · ${interested} interested` : coming;
+}
+
 /**
  * Who comes, as the post lists them. A party with one group has a line per status, its head
  * count in the heading, with the status's button beside it (an empty status too: its button
@@ -710,11 +743,14 @@ export function trainerBlocks(view: TrainersView, options: TrainerOptions, fit:
   const [only] = party.groups;
   if (only && party.groups.length === 1) {
     const blocks: PostBlock[] = [];
+    const lobby = lobbyLine(view, only);
+    const named = only.label || only.startTime !== undefined;
     const heading = [
-      ...(only.label || only.startTime !== undefined
+      ...(named || lobby !== undefined
         ? [
             [
-              `**${groupName(only, fit)}**`,
+              ...(named ? [`**${groupName(only, fit)}**`] : []),
+              ...(lobby === undefined ? [] : [lobby]),
               ...(only.startTime === undefined ? [] : [`meeting at ${timestamp(only.startTime)}`]),
             ].join(' · '),
           ]
@@ -747,7 +783,7 @@ export function trainerBlocks(view: TrainersView, options: TrainerOptions, fit:
     });
     const heading = [
       `**${groupName(group, fit)}**`,
-      count(headCount(party, group.id), 'trainer'),
+      lobbyLine(view, group) ?? count(headCount(party, group.id), 'trainer'),
       ...(group.startTime === undefined ? [] : [`meeting at ${timestamp(group.startTime)}`]),
     ].join(' · ');
     return {
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index c809f796b654b9bf6b1a204f948127354993d854..bed71e3d48bc4b507079e2c5166d92a37f637de0 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -43,6 +43,7 @@ import {
   KEPT_OPEN,
   layoutTextLength,
   LEAD_ROOM,
+  LOBBY_OVER,
   MAX_COMPONENTS,
   postMessage,
   TEXT_BUDGET,
@@ -952,6 +953,19 @@ describe('renderRaidPost', () => {
       /^\*\*Where\*\*\n\*\*The Stacks\*\* · \[Map\]\(<[^>]+>\)\nn{100}/,
     );
     expectSendable(lost);
+    // With a lobby size (plan 8X-1) every group counts its lobby, and each, over its size, says
+    // so in the place of the split-up note: the post still fits.
+    const lobbies = renderRaidPost(view(party, { gym, now: at('2026-10-13T14:40'), lobbySize: 4 }));
+    const lobbyHeadings = textDisplays(lobbies.message)
+      .filter((text) => text.startsWith('**Group'))
+      .map((text) => text.split('\n')[0]);
+    expect(lobbyHeadings[0]).toBe(
+      `**Group A: ${'L'.repeat(100)}** · 30/4 coming · 16 interested · meeting at ${meeting}`,
+    );
+    expect(textOf(lobbies.message)).toContain(LOBBY_OVER);
+    expect(textOf(lobbies.message)).not.toContain('so split up');
+    expect(layoutTextLength(lobbies.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
+    expectSendable(lobbies);
   });
 
   it('keeps within those limits with the longest texts that need escaping everywhere', () => {
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index ba38d3e1ea82aae0a2173ebbc98560b332466786..5c687ad13ab36177121678b2763fac9f61440c96 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -99,6 +99,9 @@ export interface RaidPostView {
    */
   closed?: string;
   emoji: PostEmoji;
+  /** The size of the raid's groups, where it has one, and of a raid's lobby (`TrainersView`). */
+  lobbySize?: number | undefined;
+  raidLobby?: number | undefined;
 }
 
 /**
diff --git a/src/render/timed-post.ts b/src/render/timed-post.ts
index ad3ab58a53d5cf51caf3c6248c59fc4b4a10d953..456805a228eea5fb82521595455a0a7664026cf5 100644
--- a/src/render/timed-post.ts
+++ b/src/render/timed-post.ts
@@ -28,6 +28,9 @@ export interface TimedPostView<P extends TimedParty = TimedParty> {
    */
   closed?: string;
   emoji: PostEmoji;
+  /** The size of the party's groups, where it has one, and of a raid's lobby (`TrainersView`). */
+  lobbySize?: number | undefined;
+  raidLobby?: number | undefined;
 }
 
 /**
diff --git a/src/render/train-post.test.ts b/src/render/train-post.test.ts
index dfb1fa90220aa8e54b98598e4bceefaf1f8e39ac..d575df1662a73ecd93bdc0ff3d0d486087943701 100644
--- a/src/render/train-post.test.ts
+++ b/src/render/train-post.test.ts
@@ -53,6 +53,7 @@ import {
   KEPT_OPEN,
   layoutTextLength,
   LEAD_ROOM,
+  LOBBY_OVER,
   MAX_COMPONENTS,
   postMessage,
   TEXT_BUDGET,
@@ -623,6 +624,20 @@ describe('renderTrainPost', () => {
       /^-# Next: 32\. Long gym name [^·]+ · 33\. Long gym name [^·]+, and 17 more to the end$/,
     );
     expect(buttonLabels(post.message).slice(0, 2)).toEqual(['Move train…', 'Whole route']);
+    // With a lobby size (plan 8X-1; a Gigantamax train's will be 100) every group counts its
+    // lobby and, over its size, says so in the place of the split-up note: it still fits.
+    const sized = renderTrainPost(view(train, { gym: long, lobbySize: 4 }));
+    expect(componentCount(sized.message)).toBeLessThanOrEqual(MAX_COMPONENTS);
+    expect(layoutTextLength(sized.layout)).toBeLessThanOrEqual(TEXT_BUDGET - LEAD_ROOM);
+    expectSendable(sized);
+    const headings = sectionsOf(sized.message)
+      .filter(({ button }) => button !== undefined && /^[A-E]$/.test(button))
+      .map(({ text }) => text.split('\n')[0]);
+    expect(headings).toHaveLength(5);
+    for (const heading of headings) expect(heading).toMatch(/ · \d+\/4 coming · \d+ interested · /);
+    expect(textOf(sized.message)).toContain(LOBBY_OVER);
+    expect(textOf(sized.message)).not.toContain('so split up');
+    expect(buttonLabels(sized.message)).toContain('Split group…');
   });
 });
 
diff --git a/src/services/party-service.lobby.test.ts b/src/services/party-service.lobby.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..feadfb73e74d3378be21b526b05274b6b15fd409
--- /dev/null
+++ b/src/services/party-service.lobby.test.ts
@@ -0,0 +1,83 @@
+import { describe, expect, it } from 'vitest';
+import { sectionsOf, textDisplays, textOf } from '../../test/support/messages.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { createdTrain, reportedRaid } from '../../test/support/party-service.js';
+import { TEST_SETTINGS_PATH } from '../../test/support/test-settings.js';
+import { loadSettings } from '../config/settings.js';
+import { PartyStatus } from '../domain/party/status.js';
+import { NO_MEETING_TIME } from '../render/party-post.js';
+
+/** Parties whose groups hold four trainers, as a Dynamax battle's will (plan 8X-3). */
+const inLobbiesOf4 = { lobbySize: () => 4 };
+
+describe('PartyService: the lobby of a group in the post', () => {
+  it('counts a raid’s lobby in its post where the raid has a size', async () => {
+    const made = await reportedRaid({}, inLobbiesOf4);
+    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming, {
+      number: 3,
+    });
+    await made.service.flush();
+    const message = made.gateway.posts.get(made.postId)?.message;
+    expect(textDisplays(message)).toContain(`3/4 coming · 1 interested\n${NO_MEETING_TIME}`);
+    // Bob does not fit in A: Join opens B for him.
+    await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Coming, {
+      number: 2,
+    });
+    await made.service.flush();
+    const groups = sectionsOf(made.gateway.posts.get(made.postId)?.message).filter((section) =>
+      section.text.startsWith('**Group'),
+    );
+    expect(groups).toEqual([
+      { text: '**Group A** · 3/4 coming · 1 interested', button: 'A' },
+      { text: '**Group B** · 2/4 coming', button: 'B' },
+    ]);
+  });
+
+  it('counts a train’s lobby in its post where the train has a size', async () => {
+    const made = await createdTrain({}, inLobbiesOf4);
+    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming);
+    await made.service.flush();
+    const postId = made.party.forumPostId ?? '';
+    expect(textDisplays(made.gateway.posts.get(postId)?.message)).toContain(
+      '1/4 coming · 1 interested',
+    );
+  });
+
+  it('tells a raid’s group to split up by the raid lobby of the settings', async () => {
+    const settings = loadSettings(TEST_SETTINGS_PATH);
+    const made = await reportedRaid(
+      {},
+      { settings: { ...settings, lobbies: { ...settings.lobbies, raid: 3 } } },
+    );
+    await made.attendance.signUp(made.party.id, { id: ALICE, name: 'Alice' }, PartyStatus.Coming, {
+      number: 3,
+    });
+    await made.service.flush();
+    expect(textOf(made.gateway.posts.get(made.postId)?.message)).toContain(
+      'More than 3 trainers: a lobby holds 3, so split up.',
+    );
+  });
+
+  it('shows the post of a raid of today exactly as a raid without a size', async () => {
+    /** The post after Alice and Bob signed up, with the party's id made one for both raids. */
+    const shownWith = async (overrides: object) => {
+      const made = await reportedRaid({}, overrides);
+      await made.attendance.signUp(
+        made.party.id,
+        { id: ALICE, name: 'Alice' },
+        PartyStatus.Coming,
+        {
+          number: 3,
+        },
+      );
+      await made.attendance.signUp(made.party.id, { id: BOB, name: 'Bob' }, PartyStatus.Present);
+      await made.service.flush();
+      const message = JSON.stringify(made.gateway.posts.get(made.postId)?.message);
+      return message.replaceAll(made.party.id, '<party>');
+    };
+    const unsized = await shownWith({ lobbySize: () => undefined });
+    expect(await shownWith({})).toBe(unsized);
+    // And the hook is what makes it differ.
+    expect(await shownWith(inLobbiesOf4)).not.toBe(unsized);
+  });
+});
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 92d93942ad40caf125134fe82805fb4176be58a2..c08f973d8431725aca7056e842176384df94732d 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -664,6 +664,16 @@ export class PartyService {
       showUnknownMoves: settings.showUnknownMoves,
       zone: settings.timezone,
       emoji: this.emoji(party),
+      ...this.lobbiesOf(party),
+    };
+  }
+
+  /** The lobbies a post counts: the size of the party's groups, where it has one, and a raid's. */
+  private lobbiesOf(party: Party): { lobbySize?: number; raidLobby: number } {
+    const size = this.lobbySize(party);
+    return {
+      ...(size === undefined ? {} : { lobbySize: size }),
+      raidLobby: this.options.settings.lobbies.raid,
     };
   }
 
@@ -679,6 +689,7 @@ export class PartyService {
         warningMinutes: settings.trainOrMeetupDeletionWarningTime,
       },
       emoji: this.emoji(party),
+      ...this.lobbiesOf(party),
     };
   }
 
````

### Task 4: Plan 8X-1 T4: Shout in as many messages as it takes, and group:

Prototype commit: `e79c6b99f69e67cc19ac287cbcdbb14dec9fc55e`

inMessages: the text with as many mentions as fit, then messages of
mentions alone (2,000 characters and 100 pings each) until everybody is
in one. /shout pings everybody it may in them, one after the other, and
stops when the party ends between two. /shout group:True pings only the
others of the shouter's own group; refused in a party of one group.

**Files:**

```
 docs/architecture/parties-and-posts.md |   2 +-
 src/commands/parties/shout.test.ts     | 172 ++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/commands/parties/shout.ts          |  47 +++++++++++++--
 src/render/text.test.ts                |  55 +++++++++++++++++
 src/render/text.ts                     |  29 +++++++++
 src/services/attendance-service.ts     |  53 ++++++++++++-----
 src/services/party-change.test.ts      |  95 ++++++++++++++++++++++++++++-
 src/services/party-change.ts           |  41 +++++++++++++
 8 files changed, 461 insertions(+), 33 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/parties/shout.test.ts src/render/text.test.ts src/services/party-change.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e79c6b99f69e67cc19ac287cbcdbb14dec9fc55e -- src test scripts data docs/architecture docs/guides` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8X-1 T4: Shout in as many messages as it takes, and group:`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 997c77319b2afc0e760a006bc35f12d3dd041011..4f2f0f63cb755b64c0743caaee7bd22674db80ba 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -47,7 +47,7 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 - The controls of a post are part of what the renderer makes (`src/render/party-controls.ts`): with one group a status's button stands beside its heading (`statusButton`: Interested, Join, Here, Done, an icon without a label, plan 8D-G, Matt, 2026-10-17: a phone drops a section's button under its line when the button is wider than it allows, and "🤔 Interested" was; the line says what the button does, and Discord has no accessible name for a button but its label, so a screen reader reads the emoji's name after the line), with several the group's letter with Join's icon beside each group ("A", `joinGroupButton`, the action `group`: `AttendanceService.joinInto` makes the member coming in that group from any status, and only moves one who is coming; the Join of the member's own group changes only Interested and leaves Present, and a member who is asked whether they completed the raid, as they are; `/group join` keeps the status) and the statuses' buttons in a row below; then the rows of `bottomControls` (no Map: a post's one Map is in its Where, plan 8D): with several groups the statuses' row (Interested, Here, Done for a raid, Leave), then one row of Leave (with one group), −1, +1, Remote (not for an elite raid), Set time (a raid without times) and Screenshot feedback (a raid from a kept screenshot), cut into rows of five (Matt, 2026-10-17, plan 8D-G: a phone wraps a row as it likes; one row is one component fewer). So a raid of one group has one row, two only with Set time and Screenshot feedback both (the latter alone in the second); a raid of several groups two; an elite raid of one group one; a meetup one; a train one, or two with groups, every button with its emoji: buttons only, none depending on the time. The emoji are legacy Pine's reaction icons where the application has them (never a server's: its cache goes stale without the expressions intent, the bot may not be allowed to use it, and a button with an emoji Discord refuses has the whole message refused, where text only shows `:name:`), `pinejoin` (Join and a group's Join), `pinehere`, `pinedone`, `pineleave` (Leave, which keeps its word) and `pineremote` (Remote, which keeps its word), else the plain ones (🏃 ✅ 🎉 👋 📡); Interested is always 🤔, −1 and +1 ⬇️ ⬆️. Once `pineremote` is uploaded it is also the remote marker in the lists of trainers (`settings.emoji.remote` names it), and a custom emoji's text (some thirty characters for each member remote) costs more of the text budget than 🛰️ did. `controlEmoji(icons, name, plain)` is the one place that looks them up: `PostEmoji.controlIcon` (the application's emoji alone, `PartyService.emoji`) gives the emoji as message text, which it turns into a button's `{ id, name, animated }` (anything that is not `<:name:id>` or `<a:name:id>` gives the plain one); a button with a custom emoji carries its plain one (`PostButton.plain`, shown with `customEmoji: false`). A post, its edit and a copy that Discord refuses are sent in their forms (`FormTrail`, `src/services/refused-files.ts`, over `MessageForms`: the message and `without(left)`, `LeftOut` naming `files`, `customEmoji`, `picture`; plan 8D-H, Matt, 2026-10-17, after a deleted `pinedone` had every edit refused with `emoji.id[COMPONENT_INVALID_EMOJI]`): the message (without its files where the channel refused them lately), without its files, with plain emoji and its pictures kept, bare (`picture: false, customEmoji: false`); a form identical to one tried is left out and none is tried twice. Which form is next depends on what the refusal names (`refusedPart`, `src/discord/party-gateway.ts`, over Invalid Form Body's `errors`): an emoji (a field under `emoji`, or a code with `EMOJI`, also read in the message) goes straight to the plain emoji, files and pictures kept, and the pictures go only if that is refused too; files the message carries come next (`isRefusedFile`); a picture (a field under `media`) goes to the form without pictures with the custom emoji kept, then bare; a refusal that names neither to the plain emoji first (after the files, for a message that carries them: an unnamed Invalid Form Body is taken as of the files first), then bare. Discord's answer for a refused picture is not documented: the fake names `….accessory.media.url`. Post creation tries the forms on both ways of making a post, an emoji named and files refused on the first way left out of the line's edit at once; the refusals a form got round are warned of (`refusalSaid`), the first half naming what the refusal was taken to be ("an emoji of a button", "a picture", "the picture or an emoji of a button" for one not named, "the files"), the second what the next form newly leaves out (`FormStep.dropped`: "with plain emoji", "without the pictures", "without the files"), so "Discord refused an emoji of a button; editing with plain emoji", then where that is refused too "Discord refused the picture or an emoji of a button; editing without the pictures"; with `posting`, `editing`, `sending a copy`, `editing a copy`. A refusal naming an emoji also tells `ApplicationEmoji.refused()` (`PartyServiceOptions.appEmoji.refused`, `PartyMirrorsOptions.emojiRefused`), which reads the application's emoji at once, at most once a minute (`REFUSED_REREAD_GAP_MS`): its change shows every post anew (`emojiChanged`), so the posts go back to the custom icons that still exist and stop sending the deleted one; the renderers pass `view.emoji` (`ControlIcons`) to `statusButton`, `joinGroupButton` and `bottomControls`. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - A member is never named by a bare mention in text that does not ping them: a client that has not loaded the member shows "@unknown-user", and a message without pings brings no member data. A sentence uses `memberText(member)` (`**Name** (<@id>)`), the small print of a post ("Reported by", "Created by", which pings nobody) `memberByName(member)` (`**Name**`: a mention there read "@unknown-user"; Matt, 2026-10-15), a list `memberName(member)` (the name alone: the trainer lists of a post, "Conductor", the sentence of a DM); all three fall back to the mention for a member without a name. The acting `Member` carries the name of its interaction; for anybody else it is `memberOf(party, id)` (`party.ts`): the attendee record's name, and for the member who made the party `party.makerName`, which `noteMember` keeps also when they are not signed up. Only what pings (the mentions `withMentions` appends, the completion question) stays a bare mention. The direct message about a meeting or start time (`meetingDmSentence`) has no markdown at all: it exists for its notification, which a phone shows raw; the time and what it is for first (`the raid at <gym>`, `the train <name>`, `the meetup <name>`), a meetup's place last, on a line of its own (`Where: Near Fountain Square (PokéStop)`, `placeSummary` without links, the place as its post shows it now).
 - A line in a post names who did something through `doer(party, member)` (`src/render/activity.ts`) wherever the maker of a train may act without being signed up (the route, the boss, the name, the times): undefined for a maker who asked not to be named, and the line then says what happened ("Stop 2 was added to the route"); the DM about a start time does the same. The lines about a raid (times, length, boss, moves, gym, a meeting time) do it for a reporter who asked not to be named (`said` in `raid-change-service.ts`).
-- `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit.
+- `withMentions(text, members)` (`src/render/text.ts`) makes a message that pings as many of these members as fit (some 86 snowflakes after a short text, 100 at most). `inMessages(text, members)` (plan 8X-1) pings them all: the text with as many as fit, then messages of mentions alone, each within 2,000 characters and 100 pings. `pingInMessages(deps, partyId, postId, text, members)` (`src/services/party-change.ts`) sends them one after the other, asking the store before each whether the party is still active with that post (a moved raid has another), and stops otherwise or when Discord says the post is gone (`complete`, `pinged`, and `stopped`: `gone`, or `moved` for a party still active with another post); `/shout` (`AttendanceService.shout`) goes through it, answering `gone` with how many it `pinged` before ("This raid is over. I pinged 86 trainers before it ended."), or `moved` ("This raid moved to another post: I pinged 86 trainers before it moved. Shout again there.", without the count when nobody was pinged yet); `/shout group:True` pings only the others of the shouter's own group (not Complete, those who allow shout pings; the text says `to everybody in group B:`), refused in a party of one group (`one-group`: "This raid has one group: `/shout` without `group` pings everybody."), `nobody` with the group when nobody else is in it. The other callers of `withMentions` (a meeting time, a new group, a start, a train's movement, a move's notice, the scheduler's) still ping at most one message's worth.
 
 ## Discord: the gateway and the party service
 
diff --git a/src/commands/parties/shout.test.ts b/src/commands/parties/shout.test.ts
index 44beda2891f6f862b361319e4f873d131973aad6..c1de78a8cd755604737dd3516bfa622cf324063d 100644
--- a/src/commands/parties/shout.test.ts
+++ b/src/commands/parties/shout.test.ts
@@ -121,19 +121,173 @@ describe('/shout', () => {
     expect(content).not.toContain('<#123>');
   });
 
-  it('keeps within one message and one hundred pings for a very large raid', async () => {
+  it('pings everybody of a very large raid in as many messages as it takes', async () => {
     const made = await setup();
     const crowd: Record<string, object> = {};
     for (let n = 0; n < 150; n++) crowd[`70000000000000${String(1000 + n)}`] = {};
     await made.store.update(made.party.id, (party) => ({ party: withAttendees(party, crowd) }));
-    await made.run('x'.repeat(500));
-    const said = made.gateway.messagesIn(made.postId).at(-1)?.message;
-    expect((said?.content ?? '').length).toBeLessThanOrEqual(2000);
-    const users = said?.mention?.users ?? [];
-    expect(users.length).toBeGreaterThan(40);
-    expect(users.length).toBeLessThanOrEqual(100);
-    const named = [...(said?.content ?? '').matchAll(/<@(\d+)>/g)].map((m) => m[1]);
-    expect(named).toEqual([ALICE, ...users]);
+    const used = await made.run('x'.repeat(500));
+    const said = made.gateway.messagesIn(made.postId).map((m) => m.message);
+    expect(said.length).toBeGreaterThan(1);
+    expect(said[0]?.content).toMatch(
+      /^\*\*Member\*\* \(<@\d+>\) to everybody in this raid:\n> x{500}\n/,
+    );
+    for (const message of said) {
+      expect((message.content ?? '').length).toBeLessThanOrEqual(2000);
+      expect(message.mention?.users?.length ?? 0).toBeLessThanOrEqual(100);
+    }
+    const users = said.flatMap((message) => message.mention?.users ?? []);
+    expect(users).toEqual([REPORTER, ...Object.keys(crowd)]);
+    expect(sent(used.editReply).content).toBe(
+      'Your message is in the post. I pinged 151 trainers.',
+    );
+  });
+
+  it('stops pinging when the raid ends between two of its messages', async () => {
+    const made = await setup();
+    const crowd: Record<string, object> = {};
+    for (let n = 0; n < 150; n++) crowd[`70000000000000${String(1000 + n)}`] = {};
+    await made.store.update(made.party.id, (party) => ({ party: withAttendees(party, crowd) }));
+    const send = made.gateway.sendMessage.bind(made.gateway);
+    let sends = 0;
+    made.gateway.sendMessage = async (channelId, message) => {
+      const id = await send(channelId, message);
+      if (++sends === 1) await made.service.end(made.party.id);
+      return id;
+    };
+    const used = await made.run('x'.repeat(500));
+    // Only the first message of the shout went (the end's own messages aside).
+    const shouts = made.gateway
+      .messagesIn(made.postId)
+      .filter((m) => (m.message.mention?.users?.length ?? 0) > 0);
+    expect(shouts).toHaveLength(1);
+    const pinged = shouts[0]?.message.mention?.users?.length ?? 0;
+    expect(used.followUp).toHaveBeenCalledWith({
+      content: `This raid is over. I pinged ${pinged} trainers before it ended.`,
+      flags: MessageFlags.Ephemeral,
+    });
+    expect(made.gateway.posts.get(made.postId)).toMatchObject({ archived: true, reopened: 0 });
+  });
+
+  it('sends nothing more into a post that is no longer the party’s', async () => {
+    const made = await setup();
+    const crowd: Record<string, object> = {};
+    for (let n = 0; n < 150; n++) crowd[`70000000000000${String(1000 + n)}`] = {};
+    await made.store.update(made.party.id, (party) => ({ party: withAttendees(party, crowd) }));
+    const send = made.gateway.sendMessage.bind(made.gateway);
+    let sends = 0;
+    made.gateway.sendMessage = async (channelId, message) => {
+      const id = await send(channelId, message);
+      if (++sends === 1) {
+        await made.store.update(made.party.id, (party) => ({
+          party: { ...party, forumPostId: '990000000000000001' },
+        }));
+      }
+      return id;
+    };
+    const used = await made.run('x'.repeat(500));
+    expect(sends).toBe(1);
+    const pinged = made.gateway.messagesIn(made.postId).at(-1)?.message.mention?.users?.length;
+    expect(used.followUp).toHaveBeenCalledWith({
+      content: `This raid moved to another post: I pinged ${pinged} trainers before it moved. Shout again there.`,
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  it('says only that the raid moved when it moved before anybody was pinged', async () => {
+    const made = await setup();
+    await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
+    await made.attendance.flush();
+    // The settings are read before the first message: the raid moves meanwhile.
+    const read = made.users.getMany.bind(made.users);
+    made.users.getMany = async (snowflakes) => {
+      await made.store.update(made.party.id, (party) => ({
+        party: { ...party, forumPostId: '990000000000000001' },
+      }));
+      return read(snowflakes);
+    };
+    const used = await made.run('Hi');
+    expect(used.followUp).toHaveBeenCalledWith({
+      content: 'This raid moved to another post. Shout again there.',
+      flags: MessageFlags.Ephemeral,
+    });
+  });
+
+  describe('group:', () => {
+    /** Alice and Bob in group B, Carol and the reporter in A. */
+    async function inGroups() {
+      const made = await setup();
+      await made.store.update(made.party.id, (party) => ({
+        party: withAttendees(
+          { ...party, groups: [{ id: 'A' }, { id: 'B' }], defaultGroupId: 'B' },
+          { [ALICE]: { group: 'B' }, [BOB]: { group: 'B' }, [CAROL]: { group: 'A' } },
+        ),
+      }));
+      return made;
+    }
+
+    it('pings only the others of the shouter’s own group', async () => {
+      const made = await inGroups();
+      const used = await made.run('Our lobby is up', {
+        options: { message: 'Our lobby is up', group: true },
+      });
+      expect(sent(used.editReply).content).toBe('Your message is in the post. I pinged 1 trainer.');
+      expect(made.gateway.messagesIn(made.postId).at(-1)?.message).toEqual({
+        content: `**Member** (<@${ALICE}>) to everybody in group B:\n> Our lobby is up\n<@${BOB}>`,
+        mention: { users: [BOB] },
+      });
+    });
+
+    it('leaves out who in the group is done or switched shout pings off', async () => {
+      const made = await inGroups();
+      await made.store.update(made.party.id, (party) => ({
+        party: withAttendees(party, {
+          [CAROL]: { group: 'B', status: PartyStatus.Complete },
+          [REPORTER]: { group: 'B' },
+          // In group A: not pinged.
+          '200000000000000005': { group: 'A' },
+        }),
+      }));
+      made.userSettings.set(BOB, { mentionsShouts: false });
+      await made.run('Go', { options: { message: 'Go', group: true } });
+      expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
+        users: [REPORTER],
+      });
+    });
+
+    it('says nothing when nobody else is in the group', async () => {
+      const made = await inGroups();
+      await made.store.update(made.party.id, (party) => ({
+        party: withAttendees(party, { [BOB]: { group: 'A' } }),
+      }));
+      const before = made.gateway.calls.length;
+      const used = await made.run('Anybody?', { options: { message: 'Anybody?', group: true } });
+      expect(sent(used.editReply).content).toBe(
+        'Nobody else is in group B of this raid, so I said nothing.',
+      );
+      expect(made.gateway.calls).toHaveLength(before);
+    });
+
+    it('is refused in a party of one group', async () => {
+      const made = await setup();
+      await made.attendance.signUp(made.party.id, bob, PartyStatus.Coming);
+      await made.attendance.flush();
+      const before = made.gateway.calls.length;
+      const used = await made.run('Hi', { options: { message: 'Hi', group: true } });
+      expect(used.followUp).toHaveBeenCalledWith({
+        content: 'This raid has one group: `/shout` without `group` pings everybody.',
+        flags: MessageFlags.Ephemeral,
+      });
+      expect(made.gateway.calls).toHaveLength(before);
+    });
+
+    it('with group:False pings everybody, as without it', async () => {
+      const made = await inGroups();
+      await made.run('All', { options: { message: 'All', group: false } });
+      expect(made.gateway.messagesIn(made.postId).at(-1)?.message.mention).toEqual({
+        users: [REPORTER, BOB, CAROL],
+      });
+    });
   });
 
   it('refuses a message of nothing but spaces, and a place that is no raid post', async () => {
diff --git a/src/commands/parties/shout.ts b/src/commands/parties/shout.ts
index 0e9500e1f93d60e753282e43f29b2f72b9b5f612..e61c44004ae2baeb8d5b1b4b426ac605dabd6a90 100644
--- a/src/commands/parties/shout.ts
+++ b/src/commands/parties/shout.ts
@@ -28,15 +28,25 @@ export const shout: SimpleCommand = {
         .setDescription('What to tell them')
         .setRequired(true)
         .setMaxLength(MAX_SHOUT),
+    )
+    .addBooleanOption((option) =>
+      option
+        .setName('group')
+        .setDescription('Ping only the others of your own group (default: everybody)'),
     ),
   help: {
     category: 'basic-raid',
     details:
       'For members who are signed up for the raid, train or meetup. ' +
       'Says your message in the post and pings everybody else who is signed up and not done, ' +
-      'in every group, unless they switched such pings off. For what cannot wait: the lobby is ' +
+      'in every group, unless they switched such pings off; with `group:True` only the others ' +
+      'of your own group (in a party of several groups). However many they are, everybody is ' +
+      'pinged, in several messages if it takes them. For what cannot wait: the lobby is ' +
       'starting, the gym was wrong. Use it in the post of the raid, train or meetup.',
-    examples: ['/shout message:Starting the lobby in two minutes'],
+    examples: [
+      '/shout message:Starting the lobby in two minutes',
+      '/shout message:Our lobby is up, join now group:True',
+    ],
   },
   guards: [requireParty],
   defer: 'ephemeral',
@@ -45,16 +55,43 @@ export const shout: SimpleCommand = {
     const party = commandParty(interaction, ctx);
     const text = interaction.options.getString('message', true).trim();
     if (text === '') throw new UserError('Say what you want to tell them.');
+    const group = interaction.options.getBoolean('group') ?? false;
     const word = partyWord(party);
-    const outcome = await ctx.attendance.shout(party.id, actingMember(interaction), text);
-    if (outcome.kind === 'gone') throw new UserError(partyOver(party));
+    const outcome = await ctx.attendance.shout(party.id, actingMember(interaction), text, {
+      group,
+    });
+    if (outcome.kind === 'gone') {
+      // Cut short after some of its messages: who was pinged before it ended.
+      const before = outcome.pinged ?? 0;
+      throw new UserError(
+        before > 0
+          ? `${partyOver(party)} I pinged ${count(before, 'trainer')} before it ended.`
+          : partyOver(party),
+      );
+    }
+    if (outcome.kind === 'moved') {
+      // Its post is another now (a raid moved to another region's forum): the rest go there.
+      const moved = `This ${word} moved to another post`;
+      throw new UserError(
+        outcome.pinged > 0
+          ? `${moved}: I pinged ${count(outcome.pinged, 'trainer')} before it moved. Shout again there.`
+          : `${moved}. Shout again there.`,
+      );
+    }
     if (outcome.kind === 'refused') {
       throw new UserError(problemText(outcome.reason, ctx.attendance.limits(), word));
     }
+    if (outcome.kind === 'one-group') {
+      throw new UserError(
+        `This ${word} has one group: \`/shout\` without \`group\` pings everybody.`,
+      );
+    }
     await interaction.editReply({
       content:
         outcome.kind === 'nobody'
-          ? `Nobody else is signed up for this ${word}, so I said nothing.`
+          ? outcome.group === undefined
+            ? `Nobody else is signed up for this ${word}, so I said nothing.`
+            : `Nobody else is in group ${outcome.group} of this ${word}, so I said nothing.`
           : `Your message is in the post. I pinged ${count(outcome.pinged, 'trainer')}.`,
     });
   },
diff --git a/src/render/text.test.ts b/src/render/text.test.ts
index e6598cc4410ccbf86d290bf68afc997e8b40a208..6fa0d193bda86f73054ceac80de9c7669abafc8c 100644
--- a/src/render/text.test.ts
+++ b/src/render/text.test.ts
@@ -7,6 +7,7 @@ import {
   cutMarkdown,
   fitItems,
   fitMessages,
+  inMessages,
   isFarOff,
   memberName,
   memberText,
@@ -366,3 +367,57 @@ describe('fitMessages', () => {
     expect(fitMessages(['', '', 'a'])).toEqual(['a']);
   });
 });
+
+describe('inMessages', () => {
+  const members = (n: number) =>
+    Array.from({ length: n }, (_, i) => `7000000000000${String(10000 + i)}`);
+  const pinged = (messages: { mention: { users: string[] } }[]) =>
+    messages.flatMap((message) => message.mention.users);
+
+  it('is one message with the text and its mentions while they fit', () => {
+    const three = members(3);
+    expect(inMessages('Lobby up', three)).toEqual([
+      {
+        content: `Lobby up\n<@${three[0]}> <@${three[1]}> <@${three[2]}>`,
+        mention: { users: three },
+      },
+    ]);
+    expect(inMessages('Lobby up', [])).toEqual([{ content: 'Lobby up', mention: { users: [] } }]);
+  });
+
+  it('pings everybody, in order and once, in as many messages as it takes', () => {
+    const all = members(250);
+    const text = `**Alice** (<@100000000000000001>) to everybody in this raid:\n> ${'x'.repeat(500)}`;
+    const messages = inMessages(text, all);
+    expect(messages.length).toBeGreaterThan(2);
+    expect(pinged(messages)).toEqual(all);
+    // The text goes first, once; the others hold only mentions, each of those it pings.
+    expect(messages[0]?.content.startsWith(text)).toBe(true);
+    for (const [index, message] of messages.entries()) {
+      expect(message.content.length).toBeLessThanOrEqual(2000);
+      expect(message.mention.users.length).toBeLessThanOrEqual(100);
+      expect(message.mention.users.length).toBeGreaterThan(0);
+      const named = [...message.content.matchAll(/<@(\d+)>/g)].map((m) => m[1]);
+      expect(named).toEqual(
+        index === 0 ? ['100000000000000001', ...message.mention.users] : message.mention.users,
+      );
+      if (index > 0) expect(message.content).toMatch(/^(<@\d+> ?)+$/);
+    }
+  });
+
+  it('keeps a message of short mentions to one hundred pings', () => {
+    // Real snowflakes fill 2,000 characters first (some 86 to a message); short ids do not.
+    const all = Array.from({ length: 230 }, (_, i) => String(i + 1));
+    const messages = inMessages('Go', all);
+    expect(messages.map((message) => message.mention.users.length)).toEqual([100, 100, 30]);
+  });
+
+  it('sends the text alone first when no mention fits beside it', () => {
+    const all = members(2);
+    const text = 'y'.repeat(2000);
+    expect(inMessages(text, all)).toEqual([
+      { content: text, mention: { users: [] } },
+      { content: `<@${all[0]}> <@${all[1]}>`, mention: { users: all } },
+    ]);
+  });
+});
diff --git a/src/render/text.ts b/src/render/text.ts
index 2f44f0251295edb8d58555bacff791a751e7b4e2..9ddbb12dfbcc43f7c1e7de705fa43bbeceb2c8b3 100644
--- a/src/render/text.ts
+++ b/src/render/text.ts
@@ -37,6 +37,35 @@ export function withMentions(
   return { content, mention: { users } };
 }
 
+/**
+ * Messages that ping every one of these members, in order and each once: the text with as many
+ * mentions as fit (`withMentions`), then as many messages of mentions alone as it takes, each
+ * within what one message holds and may ping. For a ping that must reach a group of a hundred
+ * (`/shout`; design `2026-10-20-max-battles-design.md`, section 5), where `withMentions` alone
+ * reaches some sixty to ninety.
+ */
+export function inMessages(
+  text: string,
+  members: readonly string[],
+): { content: string; mention: { users: string[] } }[] {
+  const first = withMentions(text, members);
+  const messages = [first];
+  let left = members.slice(first.mention.users.length);
+  while (left.length > 0) {
+    const users: string[] = [];
+    let content = '';
+    for (const id of left.slice(0, LIMITS.pings)) {
+      const mention = `${users.length === 0 ? '' : ' '}<@${id}>`;
+      if (content.length + mention.length > LIMITS.content) break;
+      content += mention;
+      users.push(id);
+    }
+    messages.push({ content, mention: { users } });
+    left = left.slice(users.length);
+  }
+  return messages;
+}
+
 /**
  * Text that members or a feed wrote, made safe to show: Markdown is escaped, and a mention or
  * channel link typed as text stays text (`@everyone` would not ping, since the client sends no
diff --git a/src/services/attendance-service.ts b/src/services/attendance-service.ts
index 449e6784292357304d10613c5ccfa680757271fd..0f98b1b79449d47b1e865fd69ccd606f97032988 100644
--- a/src/services/attendance-service.ts
+++ b/src/services/attendance-service.ts
@@ -43,7 +43,7 @@ import { doer, standingLine } from '../render/activity.js';
 import { completionQuestion, groupWords } from '../render/party-controls.js';
 import { LIMITS, memberText, plain, timestamp, withMentions } from '../render/text.js';
 import type { PartyNotifier } from './notify-service.js';
-import { anyParty, settingsOf, storedChange } from './party-change.js';
+import { anyParty, pingInMessages, settingsOf, storedChange } from './party-change.js';
 import type { PartyLines } from './party-lines.js';
 import type { PartyStore } from './party-store.js';
 
@@ -360,37 +360,56 @@ export class AttendanceService {
    * `/shout`: says a member's message in the post to everybody else who is signed up and has
    * not completed the raid, in whatever group; those who allow it are pinged. Only somebody who
    * is signed up themself may (Matt, 2026-10-11), done or not: `not-attending` otherwise.
-   * `nobody` when there is nobody else: nothing is said then.
+   * `nobody` when there is nobody else: nothing is said then. With `group` (design
+   * `2026-10-20-max-battles-design.md`, section 5) only the others of the member's own group:
+   * `one-group` in a party that has one, `nobody` (with the group) when nobody else is in it.
+   * Everybody it pings is pinged, in as many messages as it takes (`pingInMessages`), one after
+   * the other; when the party ends between two, or its post is another now, the rest is not sent
+   * (`gone`, or `moved` when the party has another post now, with how many were `pinged`
+   * before).
    */
   async shout(
     partyId: string,
     member: Member,
     text: string,
+    options: { group?: boolean } = {},
   ): Promise<
-    | { kind: 'gone' }
+    | { kind: 'gone'; pinged?: number }
+    | { kind: 'moved'; pinged: number }
     | { kind: 'refused'; reason: 'not-attending' }
-    | { kind: 'nobody' }
+    | { kind: 'one-group' }
+    | { kind: 'nobody'; group?: GroupId }
     | { kind: 'ok'; pinged: number }
   > {
     const { store, gateway } = this.options;
     const party = store.get(partyId);
     const postId = party?.forumPostId ?? null;
     if (!party || postId === null) return { kind: 'gone' };
-    if (!attendeeOf(party, member.id)) return { kind: 'refused', reason: 'not-attending' };
+    const shouter = attendeeOf(party, member.id);
+    if (!shouter) return { kind: 'refused', reason: 'not-attending' };
+    if (options.group && party.groups.length < 2) return { kind: 'one-group' };
+    const group = options.group ? shouter.group : undefined;
     const others = membersWhere(
       party,
-      (attendee, id) => id !== member.id && attendee.status !== PartyStatus.Complete,
+      (attendee, id) =>
+        id !== member.id &&
+        attendee.status !== PartyStatus.Complete &&
+        (group === undefined || attendee.group === group),
     );
-    if (others.length === 0) return { kind: 'nobody' };
-    const pingable = await this.pingable(others, (settings) => settings.mentionsShouts);
-    // A message into the post of a party that has ended would open an archived post again.
-    if (!store.get(partyId)) return { kind: 'gone' };
-    const message = withMentions(
-      `${memberText(member)} to everybody in this ${partyWord(party)}:\n> ${plain(text)}`,
+    if (others.length === 0)
+      return group === undefined ? { kind: 'nobody' } : { kind: 'nobody', group };
+    const pingable = await this.pingable(others, (settings) => settings.mentionsShouts, Infinity);
+    const to = group === undefined ? `this ${partyWord(party)}` : `group ${group}`;
+    const said = await pingInMessages(
+      { store, gateway },
+      partyId,
+      postId,
+      `${memberText(member)} to everybody in ${to}:\n> ${plain(text)}`,
       pingable,
     );
-    if ((await gateway.sendMessage(postId, message)) === undefined) return { kind: 'gone' };
-    return { kind: 'ok', pinged: message.mention.users.length };
+    return said.complete
+      ? { kind: 'ok', pinged: said.pinged }
+      : { kind: said.stopped, pinged: said.pinged };
   }
 
   /**
@@ -457,11 +476,13 @@ export class AttendanceService {
 
   /**
    * The members of `ids` who let the bot ping them, for this kind of message; at most as many as
-   * one message may name. A member whose settings cannot be read is not pinged.
+   * one message may name, unless `most` says otherwise (a shout, sent in as many messages as it
+   * takes). A member whose settings cannot be read is not pinged.
    */
   private async pingable(
     ids: readonly string[],
     allows: (settings: UserSettings) => boolean,
+    most: number = LIMITS.pings,
   ): Promise<string[]> {
     const settings = await settingsOf(this.options.users, ids, this.options.log);
     return ids
@@ -469,7 +490,7 @@ export class AttendanceService {
         const found = settings.get(id);
         return found !== undefined && found.mentions && allows(found);
       })
-      .slice(0, LIMITS.pings);
+      .slice(0, most);
   }
 
   /** Deletes messages of a post, each by itself; gives the ids that are gone now. */
diff --git a/src/services/party-change.test.ts b/src/services/party-change.test.ts
index 5c8391490bfece826678fdda5c6680e755458091..1cc5f45992c607073787566116a304fb2cec3afc 100644
--- a/src/services/party-change.test.ts
+++ b/src/services/party-change.test.ts
@@ -2,8 +2,99 @@ import { describe, expect, it } from 'vitest';
 import { ALICE, BOB, partyStoreWith, testMeetup, testRaid } from '../../test/support/parties.js';
 import { createTestLogger } from '../../test/support/test-logger.js';
 import { MemoryUsers } from '../../test/support/users.js';
-import { isRaid, refused, setSaved } from '../domain/party/party.js';
-import { anyParty, settingsOf, storedChange } from './party-change.js';
+import type { OutgoingMessage } from '../discord/party-gateway.js';
+import { isRaid, refused, setSaved, type Party } from '../domain/party/party.js';
+import { anyParty, pingInMessages, settingsOf, storedChange } from './party-change.js';
+
+describe('pingInMessages', () => {
+  const POST = '900000000000000001';
+  const crowd = Array.from({ length: 200 }, (_, n) => `7000000000000${String(10000 + n)}`);
+
+  /** A store that holds the raid with its post until a test says otherwise, and the sends. */
+  function stubs() {
+    let party: Party | undefined = { ...testRaid(), forumPostId: POST };
+    const sent: { channelId: string; users: string[] }[] = [];
+    let afterSend: (count: number) => void = () => undefined;
+    return {
+      sent,
+      set party(value: Party | undefined) {
+        party = value;
+      },
+      get party() {
+        return party;
+      },
+      afterSend(run: (count: number) => void) {
+        afterSend = run;
+      },
+      deps: {
+        store: { get: (id: string) => (party?.id === id ? party : undefined) },
+        gateway: {
+          sendMessage: (channelId: string, message: OutgoingMessage) => {
+            sent.push({ channelId, users: message.mention?.users ?? [] });
+            afterSend(sent.length);
+            return Promise.resolve<string | undefined>(`8${String(sent.length).padStart(17, '0')}`);
+          },
+        },
+      },
+    };
+  }
+
+  it('pings everybody in as many messages as it takes, one after the other', async () => {
+    const made = stubs();
+    const id = testRaid().id;
+    const outcome = await pingInMessages(made.deps, id, POST, 'Lobby up', crowd);
+    expect(outcome).toEqual({ complete: true, pinged: 200 });
+    expect(made.sent.length).toBeGreaterThan(2);
+    expect(made.sent.every((send) => send.channelId === POST)).toBe(true);
+    expect(made.sent.flatMap((send) => send.users)).toEqual(crowd);
+  });
+
+  it('stops before a message once the party is gone, and says how many it pinged', async () => {
+    const made = stubs();
+    made.afterSend((count) => {
+      if (count === 1) made.party = undefined;
+    });
+    const outcome = await pingInMessages(made.deps, testRaid().id, POST, 'Lobby up', crowd);
+    expect(made.sent).toHaveLength(1);
+    expect(outcome).toEqual({
+      complete: false,
+      stopped: 'gone',
+      pinged: made.sent[0]?.users.length,
+    });
+  });
+
+  it('stops once the party has another post (it moved): nothing goes into the old one', async () => {
+    const made = stubs();
+    made.afterSend(() => {
+      if (made.party) made.party = { ...made.party, forumPostId: '900000000000000002' };
+    });
+    const outcome = await pingInMessages(made.deps, testRaid().id, POST, 'Lobby up', crowd);
+    expect(made.sent).toHaveLength(1);
+    expect(outcome).toEqual({
+      complete: false,
+      stopped: 'moved',
+      pinged: made.sent[0]?.users.length,
+    });
+    const none = stubs();
+    none.party = { ...testRaid(), forumPostId: '900000000000000002' };
+    expect(await pingInMessages(none.deps, testRaid().id, POST, 'Hi', crowd)).toEqual({
+      complete: false,
+      stopped: 'moved',
+      pinged: 0,
+    });
+    expect(none.sent).toEqual([]);
+  });
+
+  it('stops when the post is gone on Discord', async () => {
+    const made = stubs();
+    made.deps.gateway.sendMessage = () => Promise.resolve(undefined);
+    expect(await pingInMessages(made.deps, testRaid().id, POST, 'Hi', crowd)).toEqual({
+      complete: false,
+      stopped: 'gone',
+      pinged: 0,
+    });
+  });
+});
 
 describe('settingsOf', () => {
   it('reads the settings of all the members at once', async () => {
diff --git a/src/services/party-change.ts b/src/services/party-change.ts
index 825d862671c20563c754c551c1e381f3766cec5f..53cb289939cc8331e61ab1bb4c64f9ba42e7d82d 100644
--- a/src/services/party-change.ts
+++ b/src/services/party-change.ts
@@ -1,6 +1,8 @@
 import type { UserSettings, UserSettingsReader } from '../db/repositories/user-repository.js';
+import type { PartyGateway } from '../discord/party-gateway.js';
 import type { Party, Refusal } from '../domain/party/party.js';
 import type { Logger } from '../log.js';
+import { inMessages } from '../render/text.js';
 import type { PartyStore } from './party-store.js';
 
 /**
@@ -22,6 +24,45 @@ export async function settingsOf(
   }
 }
 
+/**
+ * Says `text` in a party's post and pings every one of `members`, in as many messages as it
+ * takes (`inMessages`), one after the other. Before each message it asks the store whether the
+ * party is still active and still has this post (a message into an archived post would open it
+ * again; a raid that moved has another): if not, or when Discord says the post is gone, the rest
+ * is not sent. `complete` says whether every message went, `stopped` why not (`PingStop`),
+ * `pinged` how many were pinged.
+ */
+export async function pingInMessages(
+  deps: {
+    store: Pick<PartyStore, 'get'>;
+    gateway: Pick<PartyGateway, 'sendMessage'>;
+  },
+  partyId: string,
+  postId: string,
+  text: string,
+  members: readonly string[],
+): Promise<
+  { complete: true; pinged: number } | { complete: false; stopped: PingStop; pinged: number }
+> {
+  let pinged = 0;
+  for (const message of inMessages(text, members)) {
+    const party = deps.store.get(partyId);
+    if (party === undefined) return { complete: false, stopped: 'gone', pinged };
+    if (party.forumPostId !== postId) return { complete: false, stopped: 'moved', pinged };
+    if ((await deps.gateway.sendMessage(postId, message)) === undefined) {
+      return { complete: false, stopped: 'gone', pinged };
+    }
+    pinged += message.mention.users.length;
+  }
+  return { complete: true, pinged };
+}
+
+/**
+ * Why `pingInMessages` stopped: the party ended (or its post is gone on Discord), or it is still
+ * active with another post (a raid moved to another region's forum).
+ */
+export type PingStop = 'gone' | 'moved';
+
 /**
  * What came of one change of a party that was decided inside the store. `gone`: there is no
  * such active party of the kind the change is for. `refused`: the party stays as it was;
````
