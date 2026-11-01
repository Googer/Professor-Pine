# Phase 8S-1: Meetup Safety: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A meetup at a place that might be private waits for a moderator before anything is posted. A place might be private when it is a pin, or a Wayspot whose name looks like a front-yard feature. The moderators answer in a staff-only channel and can:

- approve the meetup, once or allowing the place for good;
- refuse it, once or refusing the place for good;
- block its maker, who may appeal.

`/meetup` asks for the place, the start and the description up front.

**Architecture:**

- **The check** is pure: `meetupPlaceVerdict` in `src/domain/meetups/safety.ts`, giving allowed / review / refused / blocked.
  - Staff skip the check; a pin always goes to review; rulings decide Wayspots.
  - A Wayspot is flagged by the default words plus `settings.meetupSafety.flaggedWords`.
  - The check is off while `settings.channels.moderation` is unset.
- **The service** is `MeetupSafety` (`src/services/meetup-safety.ts`, `ctx.meetupSafety`):
  - `verdict` and `submit`, which 8M-5M (meetups from the web map) calls too;
  - the moderators' post, the decisions, Block, the appeals;
  - the expiry and stranded-work sweeps, which run in the background with the party clock;
  - the start warning.
- **Storage:** four tables in migration 019 (requests, place rulings, blocks, appeals), behind `MeetupSafetyRepository`, with the twin `MemoryMeetupSafety`.
  - A decision is a conditional update, so the first press wins.
  - Block member is one read-committed transaction (`inTransaction` gains `isolation`).
- **Controls:** `msafety:<request id>:<decision>` and `mappeal:…`, staff only for the decisions.
- **`/meetup`:** the guard reads the place, the start and the verdict. The form asks for the description, and its submit creates the meetup or holds it for the moderators.
- **Rehearsal:** in rehearsal mode the moderators' posts reach the moderation channel and nothing else outside party posts.

**Tech Stack:**

- TypeScript 6.0, Node 24, discord.js v14 components-v2, Kysely on MySQL 8.4, Vitest.
- No new dependency. **Migration 019** `2026_10_17_019_meetup_safety` (additive; renumber it if another plan takes 019 first).
- The party state document stays at version 10.
- `/meetup`'s options change, so the commands are registered again at staging.

**Spec:** `docs/superpowers/specs/2026-10-17-meetup-safety-design.md`, approved by Matt on 2026-10-17. The brief is `.superpowers/sdd/2026-10-17-phase-8s1-meetup-safety/design.md` (git-ignored).

**Matt's decisions** are the spec's, plus one: in rehearsal mode the moderators' posts go through to the staff-only moderation channel.

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-8s1`), one commit per task. That branch was rebased onto typescript-migration 40dd2348, which includes 8D, 8M-4S and 8M-5. Each commit typechecks. On the tip the full check, the build and the database suite are clean.

**Reviews:** three Opus reviewers went through the prototype (tasks 1–2, 3–4, 5–6), and a fourth through fix round 1. Every finding of both rounds is folded into the commits below.

## Decisions in this plan

These were made while prototyping and reviewing, for Matt to look at:

1. **Flagged words:** little free library, apartment(s), apt(s), condo(s), condominium(s), townhome(s), townhouse(s), residence, private, salon, studio, LLC, daycare.
   - "home of" was dropped: it flags town signs ("Home of the 1972 State Champions").
   - Words match whole words only, case-insensitively.
   - A gym is checked by its official name and by its nickname.
2. **A start too soon:** a meetup that needs approval must start at least two hours ahead, so that the moderators have an hour.
3. **Expiry:** a request expires 48 hours after it was made or an hour before the start, whichever comes first. The sweep runs with every tick of the party clock, in the background.
4. **The order of a request:** the moderators' post is sent first, then the request is stored. If the post cannot be sent, nothing is stored and the member is told to try later.
5. **Approve:**
   - It writes the "allowed" ruling only once the meetup is made, so an approval that fails leaves no ruling.
   - If the maker was blocked in the meantime, no meetup is made.
   - An approval left without its meetup is put right by a sweep after five minutes: it is linked to its meetup if one exists, else marked failed and the maker told.
6. **Blocks:**
   - Block member refuses the request, blocks the member, withdraws their other pending requests and closes their active meetups.
   - The member gets one DM.
   - Only the last lift of a block is kept.
7. **Appeals:**
   - One appeal may be open at a time, with seven days' wait after a Keep.
   - An open appeal whose post was never made (after five minutes), or that is seven days old, expires.
8. **The settings example:** `data/settings.json` has `"moderation": ""`, and blank means unset.
9. **`cutover-check`** warns on each of these:
   - the moderation setting is unset;
   - the channel is missing or is not a text channel;
   - the bot lacks View, Send or Embed Links there;
   - @everyone can view it.
10. **Follow-ups:**
    - The party history does not record whether a meetup was reviewed.
    - Members cannot withdraw a pending request.
    - 8S-2 brings Report and `/admin places`.

## Global Constraints

- Read `CLAUDE.md` first. Its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only, with `.js` in relative imports; `strict` and `noUncheckedIndexedAccess`; no `any` without a comment justifying it.
- `src/domain/` stays pure. **Tests never use the network** and never wait on real time (`docs/architecture/testing.md`).
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8s1`). Apply it exactly; the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck and its own tests green. The full `npm run check`, the build and `npm run test:db` run after the last task, through the npm scripts (the suite lock). Run `npx prettier --write` on touched files.
- Commit after every task as `Matt Legowski <googer@pobox.com>`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by explicit path, never `.idea/`, `var/` or `.env`. No commit title starts with a slash.

## Review Focus

1. **The check:** its order, staff, pins, rulings, the flagged words, off when unset.
2. **First press wins:**
   - every decision, Block and Lift are conditional updates;
   - the read-committed transaction of Block member;
   - races of a block with an approval or a submit.
3. **Nothing stuck:**
   - expiry;
   - stranded approvals;
   - stale appeals;
   - unreadable rows.
4. **What members are told:** "needs a moderator's approval" and "A meetup can't be held there.", never why. DMs only through `DmSender`.
5. **`/meetup`:** refusals in guards (not counted against the throttle); the form without deferral; the guard's reading reused by `execute`.
6. **The moderators' post:** components-v2 within the limits, and text through `plain` / `plainNoLinks`.
7. **The rehearsal exception:** the moderation channel alone, by name and as a text channel.

### Task 1: Plan 8S-1 T1: Meetup safety: the settings and the check of a place

Prototype commit: `0df9f4faba09dc6f753fc8c7aad7b699b7997a92`

settings.channels.moderation (optional, blank unset: the safety is off
without it) and settings.meetupSafety.flaggedWords. The pure check
meetupPlaceVerdict (staff, block, ruling, pin, flagged title), the
default flagged words matched as whole words, the ruling key of a place,
and when a request expires (48 hours, or an hour before the start).

**Files:**

```
 src/app.ts                        |   3 +-
 src/config/settings.test.ts       |  57 +++++++++++++++++++-
 src/config/settings.ts            |  38 +++++++++++++
 src/domain/meetups/safety.test.ts | 171 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/meetups/safety.ts      | 169 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/ops/cutover-check.ts          |   4 +-
 6 files changed, 438 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/config/settings.test.ts src/domain/meetups/safety.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 0df9f4faba09dc6f753fc8c7aad7b699b7997a92 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8s1-meetup-safety.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-1 T1: Meetup safety: the settings and the check of a place`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 7f6e65bb..c5f0f123 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -6,6 +6,7 @@ import { wildExceptionsOf } from './commands/notifications/wild.js';
 import { components } from './components/index.js';
 import { ScreenshotTrigger } from './commands/screenshots/mention.js';
 import { loadConfig } from './config/index.js';
+import { channelNamesOf } from './config/settings.js';
 import { configWarnings } from './config/warnings.js';
 import { dbConfigFrom } from './db/db-config.js';
 import { createDb } from './db/kysely.js';
@@ -559,7 +560,7 @@ export async function startApp(
     rest: () => liveClient?.rest,
     botId: () => liveClient?.user?.id,
     partiesDir: config.env.LEGACY_PARTIES_DIR,
-    settingsChannelNames: Object.values(config.settings.channels),
+    settingsChannelNames: channelNamesOf(config.settings),
     log,
   });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db), log);
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 079cb0ee..14e7675b 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -3,7 +3,12 @@ import { tmpdir } from 'node:os';
 import path from 'node:path';
 import { describe, expect, it } from 'vitest';
 import { ConfigError } from './errors.js';
-import { loadSettings, RETIRED_SETTINGS, withoutRetiredSettings } from './settings.js';
+import {
+  channelNamesOf,
+  loadSettings,
+  RETIRED_SETTINGS,
+  withoutRetiredSettings,
+} from './settings.js';
 
 const REPO_SETTINGS = 'data/settings.json';
 
@@ -155,6 +160,56 @@ describe('loadSettings', () => {
     });
   });
 
+  it('has no moderators’ channel and no flagged words unless the file names them', () => {
+    const settings = loadSettings(REPO_SETTINGS);
+    expect(settings.channels.moderation).toBeUndefined();
+    expect(settings.meetupSafety).toBeUndefined();
+    const named = loadSettings(
+      writeSettings((s) => {
+        s.channels = { ...(s.channels as object), moderation: ' meetup-review ' };
+        s.meetupSafety = { flaggedWords: ['duplex'] };
+      }),
+    );
+    expect(named.channels.moderation).toBe('meetup-review');
+    expect(named.meetupSafety).toEqual({ flaggedWords: ['duplex'] });
+    const blank = loadSettings(
+      writeSettings((s) => {
+        s.channels = { ...(s.channels as object), moderation: '  ' };
+        s.meetupSafety = {};
+      }),
+    );
+    expect(blank.channels.moderation).toBeUndefined();
+    expect(blank.meetupSafety).toEqual({ flaggedWords: [] });
+    expect(() =>
+      loadSettings(
+        writeSettings((s) => {
+          s.meetupSafety = { flaggedWords: [''] };
+        }),
+      ),
+    ).toThrow(/flaggedWords/);
+    expect(() =>
+      loadSettings(
+        writeSettings((s) => {
+          s.channels = { ...(s.channels as object), moderation: '#mods' };
+        }),
+      ),
+    ).toThrow(/moderation/);
+  });
+
+  it('names the channels the settings name, an unset moderators’ channel not among them', () => {
+    const settings = loadSettings(REPO_SETTINGS);
+    const names = channelNamesOf(settings);
+    expect(names).toContain(settings.channels['bot-updates']);
+    expect(names).not.toContain(undefined);
+    expect(names).toContain(settings.channels.pvp);
+    const named = loadSettings(
+      writeSettings((s) => {
+        s.channels = { ...(s.channels as object), moderation: 'meetup-review' };
+      }),
+    );
+    expect(channelNamesOf(named)).toContain('meetup-review');
+  });
+
   it("reads the map's member role by name, blank as unset", () => {
     const web = (memberRole: unknown) =>
       loadSettings(
diff --git a/src/config/settings.ts b/src/config/settings.ts
index de2b7537..43d5a7a9 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -129,8 +129,38 @@ export const settingsSchema = z.strictObject({
     'remote-raids': z.string().min(1),
     pvp: z.string().min(1),
     'bot-updates': z.string().min(1),
+    /**
+     * The moderators' channel of meetup safety (plan 8S-1; spec
+     * `2026-10-17-meetup-safety-design.md`): a meetup at a place that might be private (a pin,
+     * a Wayspot whose title looks like a front-yard feature) waits there for a moderator, and
+     * appeals of blocked members go there. It must be seen by staff only, and never be the
+     * public bot updates channel. Unset (the default; blank is unset): meetup safety is off,
+     * every place is allowed, and there are no requests or blocks; the start logs a warning
+     * per server and `cutover-check` warns. Unlike the other channels it is optional.
+     */
+    moderation: z.preprocess(
+      (value) => (typeof value === 'string' ? value.trim() || undefined : value),
+      z
+        .string()
+        .refine((name) => !name.startsWith('#'), {
+          message: "must be a channel's name as it is written, without #",
+        })
+        .optional(),
+    ),
   }),
   categories: z.strictObject({ pvp: z.string().min(1) }),
+  /**
+   * Meetup safety (plan 8S-1): `flaggedWords` are words and phrases that, in the title of a gym,
+   * PokéStop or power spot, send a meetup there to the moderators first, besides the list in
+   * the code (`DEFAULT_FLAGGED_WORDS`: little free library, apartments, condos and the like);
+   * matched without regard to letter case, as whole words. Absent: the list in the code alone.
+   * Whether the safety is on at all is `channels.moderation`.
+   */
+  meetupSafety: z
+    .strictObject({
+      flaggedWords: z.array(z.string().trim().min(1).max(100)).max(500).default([]),
+    })
+    .optional(),
   helpGroups: z.array(z.string().min(1)),
   blacklistWords: z.array(z.string()),
   /**
@@ -335,6 +365,14 @@ export const settingsSchema = z.strictObject({
 
 export type Settings = z.output<typeof settingsSchema>;
 
+/**
+ * The names of the channels the settings name (`settings.channels`), without one left unset
+ * (the moderators' channel is optional).
+ */
+export function channelNamesOf(settings: Pick<Settings, 'channels'>): string[] {
+  return Object.values(settings.channels).filter((name) => name !== undefined);
+}
+
 export function loadSettings(path: string): Settings {
   let raw: unknown;
   try {
diff --git a/src/domain/meetups/safety.test.ts b/src/domain/meetups/safety.test.ts
new file mode 100644
index 00000000..db21d4bc
--- /dev/null
+++ b/src/domain/meetups/safety.test.ts
@@ -0,0 +1,171 @@
+import { describe, expect, it } from 'vitest';
+import type { DroppedPin, KnownPlace } from '../geo/place.js';
+import {
+  DEFAULT_FLAGGED_WORDS,
+  flaggedWordIn,
+  flaggedWordsOf,
+  meetupPlaceVerdict,
+  mayRequestReview,
+  requestExpiry,
+  rulingKeyOf,
+  type PlaceCheck,
+} from './safety.js';
+
+const HOUR = 3_600_000;
+const NOW = 1_792_000_000_000;
+
+function stop(title: string, kind: KnownPlace['kind'] = 'stop'): KnownPlace {
+  return { kind, id: 'a1b2c3.16', title, lat: 40.06, lon: -80.06, address: null, image: null };
+}
+
+const PIN: DroppedPin = { kind: 'pin', lat: 40.02, lon: -80.02, near: null, linkName: null };
+
+const WORDS = flaggedWordsOf(undefined);
+
+/** The check of an ordinary member at a place with no ruling, the safety on. */
+function check(place: PlaceCheck['place'], more: Partial<PlaceCheck> = {}): PlaceCheck {
+  return {
+    on: true,
+    place,
+    staff: false,
+    blocked: false,
+    ruling: undefined,
+    flaggedWords: WORDS,
+    ...more,
+  };
+}
+
+describe('flaggedWordIn', () => {
+  it('finds the words of a front-yard feature in real titles, and nothing in the others', () => {
+    const flagged = (title: string) => flaggedWordIn(title, WORDS);
+    expect(flagged('Little Free Library at St. Paul’s')).toBe('little free library');
+    expect(flagged('Oakland Apartments sign')).toBe('apartments');
+    expect(flagged('LITTLE FREE LIBRARY #48213')).toBe('little free library');
+    expect(flagged('Maple Court Condominiums')).toBe('condominiums');
+    expect(flagged('Smith Apt 3 Garden')).toBe('apt');
+    expect(flagged('Home of the 1972 State Champions')).toBeUndefined();
+    expect(flagged('Smith Family Daycare')).toBe('daycare');
+    expect(flagged('St. Paul’s Church')).toBeUndefined();
+    expect(flagged('Riverside Park')).toBeUndefined();
+    expect(flagged('Mural on Liberty Ave')).toBeUndefined();
+    expect(flagged('Fountain Square')).toBeUndefined();
+  });
+
+  it('matches whole words only, not a part of another word', () => {
+    expect(flaggedWordIn('Apartmentalized Art', WORDS)).toBeUndefined();
+    expect(flaggedWordIn('Privateer Memorial', WORDS)).toBeUndefined();
+    expect(flaggedWordIn('Studios', WORDS)).toBeUndefined();
+    expect(flaggedWordIn('Art-Studio Gate', WORDS)).toBe('studio');
+  });
+
+  it('takes the words of a phrase across any white space, and a word with signs in it as written', () => {
+    expect(flaggedWordIn('Little  Free\nLibrary', WORDS)).toBe('little free library');
+    expect(flaggedWordIn('Corner (apt.) Bench', flaggedWordsOf(['(apt.)']))).toBe('(apt.)');
+  });
+});
+
+describe('flaggedWordsOf', () => {
+  it('is the default list with the words of the settings added, in lower case, once each', () => {
+    expect(DEFAULT_FLAGGED_WORDS).toEqual(
+      expect.arrayContaining([
+        'little free library',
+        'apartment',
+        'apartments',
+        'apts',
+        'condo',
+        'condos',
+        'condominium',
+        'condominiums',
+        'townhome',
+        'townhomes',
+        'townhouse',
+        'townhouses',
+        'residence',
+        'private',
+        'salon',
+        'studio',
+        'llc',
+        'daycare',
+        'apt',
+      ]),
+    );
+    expect(DEFAULT_FLAGGED_WORDS).not.toContain('home of');
+    const words = flaggedWordsOf([' Duplex ', 'PRIVATE', '  ']);
+    expect(words).toContain('duplex');
+    expect(words.filter((word) => word === 'private')).toHaveLength(1);
+    expect(words).not.toContain('');
+    expect(flaggedWordIn('Blue Duplex', words)).toBe('duplex');
+  });
+});
+
+describe('meetupPlaceVerdict', () => {
+  it('allows an ordinary Wayspot and holds a pin and a flagged title for a moderator', () => {
+    expect(meetupPlaceVerdict(check(stop('Riverside Park')))).toBe('allowed');
+    expect(meetupPlaceVerdict(check(stop('Old Stone Fountain', 'gym')))).toBe('allowed');
+    expect(meetupPlaceVerdict(check(PIN))).toBe('review');
+    expect(meetupPlaceVerdict(check(stop('Little Free Library')))).toBe('review');
+    expect(meetupPlaceVerdict(check(stop('Oakland Apartments sign', 'powerspot')))).toBe('review');
+  });
+
+  it('follows a ruling of the place over its title', () => {
+    expect(meetupPlaceVerdict(check(stop('Little Free Library'), { ruling: 'allow' }))).toBe(
+      'allowed',
+    );
+    expect(meetupPlaceVerdict(check(stop('Riverside Park'), { ruling: 'refuse' }))).toBe('refused');
+  });
+
+  it('never lets a ruling decide for a pin', () => {
+    expect(meetupPlaceVerdict(check(PIN, { ruling: 'allow' }))).toBe('review');
+    expect(meetupPlaceVerdict(check(PIN, { ruling: 'refuse' }))).toBe('review');
+  });
+
+  it('holds a place whose other name is flagged: a gym by its official name or its nickname', () => {
+    const gym = stop('Old Stone Fountain', 'gym');
+    expect(meetupPlaceVerdict(check(gym, { otherTitles: ['Maple Court Condominiums Sign'] }))).toBe(
+      'review',
+    );
+    expect(meetupPlaceVerdict(check(gym, { otherTitles: ['Fountain on Main'] }))).toBe('allowed');
+    expect(
+      meetupPlaceVerdict(
+        check(gym, { otherTitles: ['Maple Court Condominiums Sign'], ruling: 'allow' }),
+      ),
+    ).toBe('allowed');
+  });
+
+  it('refuses a blocked member anywhere, and lets staff skip everything', () => {
+    expect(meetupPlaceVerdict(check(stop('Riverside Park'), { blocked: true }))).toBe('blocked');
+    expect(meetupPlaceVerdict(check(PIN, { blocked: true }))).toBe('blocked');
+    for (const place of [PIN, stop('Little Free Library')]) {
+      expect(
+        meetupPlaceVerdict(check(place, { staff: true, ruling: 'refuse', blocked: true })),
+      ).toBe('allowed');
+    }
+  });
+
+  it('allows everything while the safety is off: no moderators to ask, no blocks', () => {
+    const off = { on: false, blocked: true, ruling: 'refuse' as const };
+    expect(meetupPlaceVerdict(check(PIN, off))).toBe('allowed');
+    expect(meetupPlaceVerdict(check(stop('Little Free Library'), off))).toBe('allowed');
+  });
+});
+
+describe('rulingKeyOf', () => {
+  it('is the kind and id of a known place, and nothing for a pin', () => {
+    expect(rulingKeyOf(stop('Riverside Park'))).toEqual({ kind: 'stop', id: 'a1b2c3.16' });
+    expect(rulingKeyOf(PIN)).toBeUndefined();
+  });
+});
+
+describe('requestExpiry', () => {
+  it('is 48 hours after the request, or an hour before the start when that is sooner', () => {
+    expect(requestExpiry(NOW, NOW + 72 * HOUR)).toBe(NOW + 48 * HOUR);
+    expect(requestExpiry(NOW, NOW + 5 * HOUR)).toBe(NOW + 4 * HOUR);
+  });
+
+  it('leaves a request at least an hour for the moderators: a start two hours ahead', () => {
+    expect(mayRequestReview(NOW, NOW + 2 * HOUR)).toBe(true);
+    expect(mayRequestReview(NOW, NOW + 2 * HOUR - 60_000)).toBe(false);
+    expect(mayRequestReview(NOW, NOW + 30 * 60_000)).toBe(false);
+    expect(mayRequestReview(NOW, NOW + 30 * 24 * HOUR)).toBe(true);
+  });
+});
diff --git a/src/domain/meetups/safety.ts b/src/domain/meetups/safety.ts
new file mode 100644
index 00000000..71fd6a88
--- /dev/null
+++ b/src/domain/meetups/safety.ts
@@ -0,0 +1,169 @@
+import type { Place } from '../geo/place.js';
+import type { PlaceKind } from '../search/place-merge.js';
+
+/**
+ * Meetup safety (plan 8S-1; spec `2026-10-17-meetup-safety-design.md`, Matt's lighter rule): a
+ * meetup at a place that might be a private home is held for a moderator. Pins always are; a
+ * gym, PokéStop or power spot is when its title looks like a front-yard feature (Niantic refuses
+ * private homes as Wayspots, so these leftovers are the risk); a moderator's ruling of a place
+ * overrides its title; a blocked member makes no meetups; staff skip all of it.
+ */
+
+/**
+ * The words and phrases of a title that send a meetup to the moderators first (the research
+ * of 2026-10-17: what is left of private homes among Wayspots): little free libraries,
+ * apartment and condominium buildings (and an apartment's number, "Apt 3"), townhomes,
+ * residences, what calls itself private, and the businesses people run from home. Compared in
+ * lower case, as whole words. Not "home of": public signs say it ("Home of the 1972 State
+ * Champions"), and the moderators should see few requests.
+ */
+export const DEFAULT_FLAGGED_WORDS: readonly string[] = [
+  'little free library',
+  'apartment',
+  'apartments',
+  'apts',
+  'condo',
+  'condos',
+  'condominium',
+  'condominiums',
+  'townhome',
+  'townhomes',
+  'townhouse',
+  'townhouses',
+  'residence',
+  'private',
+  'salon',
+  'studio',
+  'llc',
+  'daycare',
+  'apt',
+];
+
+/**
+ * The words in effect: the default list and the server's own (`settings.meetupSafety.flaggedWords`),
+ * trimmed, in lower case, each once.
+ */
+export function flaggedWordsOf(extra: readonly string[] | undefined): string[] {
+  const words = [...DEFAULT_FLAGGED_WORDS, ...(extra ?? [])]
+    .map((word) => word.trim().toLowerCase().replace(/\s+/gu, ' '))
+    .filter((word) => word !== '');
+  return [...new Set(words)];
+}
+
+/** A letter or a digit: what a word is made of, so that a word ends where none follows. */
+const WORDISH = '[\\p{L}\\p{N}]';
+
+function escaped(text: string): string {
+  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
+}
+
+/** The one expression of a list of words, made once per list (`flaggedWordsOf` gives one each). */
+const matchers = new WeakMap<readonly string[], RegExp | null>();
+
+function matcherOf(words: readonly string[]): RegExp | null {
+  let matcher = matchers.get(words);
+  if (matcher === undefined) {
+    const bodies = words.map((word) => word.split(' ').map(escaped).join('\\s+'));
+    matcher =
+      bodies.length === 0
+        ? null
+        : new RegExp(`(?<!${WORDISH})(?:${bodies.join('|')})(?!${WORDISH})`, 'iu');
+    matchers.set(words, matcher);
+  }
+  return matcher;
+}
+
+/**
+ * A flagged word that stands in `title` as a whole word (no letter or digit right before or
+ * after it; the words of a phrase across any white space), without regard to letter case, as
+ * the list has it; undefined for none. The words are one expression, made once per list.
+ */
+export function flaggedWordIn(title: string, words: readonly string[]): string | undefined {
+  const found = matcherOf(words)?.exec(title)?.[0];
+  if (found === undefined) return undefined;
+  const said = found.toLowerCase().replace(/\s+/gu, ' ');
+  return words.find((word) => word === said) ?? said;
+}
+
+/** A moderator's ruling of a place, for good: allowed (Approve) or refused (Refuse from now on). */
+export type PlaceRuling = 'allow' | 'refuse';
+
+/** What a ruling is kept by: the place's kind and id (a gym's number, a Wayspot's Wayfarer id). */
+export interface RulingKey {
+  kind: PlaceKind;
+  id: string;
+}
+
+/** The key of a place's ruling; a pin has none (an approval of a pin is for that meetup only). */
+export function rulingKeyOf(place: Place): RulingKey | undefined {
+  return place.kind === 'pin' ? undefined : { kind: place.kind, id: place.id };
+}
+
+/** What may be asked of the check; 8M-5 (meetups from the web map) asks the same. */
+export interface PlaceCheck {
+  /** Whether meetup safety is on in the server (`settings.channels.moderation` is set). */
+  on: boolean;
+  /** The place the meetup is to be at, as it was named. */
+  place: Place;
+  /** The maker is an admin, a moderator or the owner (`isStaff`). */
+  staff: boolean;
+  /** The maker is blocked from making meetups in the server. */
+  blocked: boolean;
+  /** The server's ruling of the place, if any (never asked for a pin, and ignored for one). */
+  ruling: PlaceRuling | undefined;
+  /** The flagged words in effect (`flaggedWordsOf`). */
+  flaggedWords: readonly string[];
+  /**
+   * The place's other names, checked as its title is: a gym's official name and its nickname
+   * (its title is the one its post shows, the nickname first).
+   */
+  otherTitles?: readonly string[];
+}
+
+/**
+ * Whether a meetup may be posted at once (`allowed`), needs a moderator's approval (`review`),
+ * may not be held there (`refused`) or may not be made by this member (`blocked`). In this
+ * order: the safety off, or a member of staff, allows everything (staff are never blocked);
+ * a block; a pin always needs approval (a pin has no ruling, and one given is ignored); a
+ * refusal of the place; an allowed place; a flagged title (or other name); anything else is
+ * allowed.
+ */
+export function meetupPlaceVerdict(
+  check: PlaceCheck,
+): 'allowed' | 'review' | 'refused' | 'blocked' {
+  if (!check.on || check.staff) return 'allowed';
+  if (check.blocked) return 'blocked';
+  if (check.place.kind === 'pin') return 'review';
+  if (check.ruling === 'refuse') return 'refused';
+  if (check.ruling === 'allow') return 'allowed';
+  const titles = [check.place.title, ...(check.otherTitles ?? [])];
+  return titles.some((title) => flaggedWordIn(title, check.flaggedWords) !== undefined)
+    ? 'review'
+    : 'allowed';
+}
+
+export type MeetupVerdict = ReturnType<typeof meetupPlaceVerdict>;
+
+const HOUR = 3_600_000;
+
+/** How long a request waits at most for a moderator. */
+export const REQUEST_HOURS = 48;
+
+/** How long before the meetup's start a request expires: the members need time to come. */
+export const REQUEST_LEAD_HOURS = 1;
+
+/** How long the moderators have at least: a request that would expire sooner is not made. */
+export const REVIEW_HOURS = 1;
+
+/** When a request made at `createdAt` for a meetup that starts at `startTime` expires. */
+export function requestExpiry(createdAt: number, startTime: number): number {
+  return Math.min(createdAt + REQUEST_HOURS * HOUR, startTime - REQUEST_LEAD_HOURS * HOUR);
+}
+
+/**
+ * Whether a request made now leaves the moderators `REVIEW_HOURS` before it expires: a start at
+ * least two hours ahead.
+ */
+export function mayRequestReview(now: number, startTime: number): boolean {
+  return requestExpiry(now, startTime) - now >= REVIEW_HOURS * HOUR;
+}
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
index 97fac7db..43f8ca09 100644
--- a/src/ops/cutover-check.ts
+++ b/src/ops/cutover-check.ts
@@ -1,5 +1,5 @@
 import { ApplicationFlags, ChannelType, Routes } from 'discord.js';
-import type { Settings } from '../config/settings.js';
+import { channelNamesOf, type Settings } from '../config/settings.js';
 import type { MigrationPlan } from '../db/migrator.js';
 import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
 import type { LegacyCommandRoles } from '../db/repositories/role-authorization-repository.js';
@@ -491,7 +491,7 @@ async function cleanupLine(
     regionForumIds: server.regions.flatMap((one) =>
       one.forumChannelId === null ? [] : [one.forumChannelId],
     ),
-    settingsChannelNames: Object.values(server.settings.channels),
+    settingsChannelNames: channelNamesOf(server.settings),
     legacyChannelIds: [...named],
   });
   const byFile = list.remove.filter((entry) => named.has(entry.channelId)).length;
````

### Task 2: Plan 8S-1 T2: Meetup safety: requests, rulings, blocks and appeals in the database

Prototype commit: `9c6de33b8261e4e3c8c54b9980df9de91e760162`

Migration 019 adds MeetupRequest, MeetupPlaceRuling, MeetupBlock and
MeetupAppeal (servers and members by snowflake, times in epoch ms).
MeetupSafetyRepository and its twin MemoryMeetupSafety run the same
cases: a ruling per server and place, a block until lifted (who lifted
it kept), a pending request decided once by a conditional update, one
open appeal per member and server, when a block was last kept.

**Files:**

```
 src/db/errors.test.ts                                   |  32 +++
 src/db/errors.ts                                        |  13 +
 src/db/migrations/2026_10_17_019_meetup_safety.ts       | 106 ++++++++
 src/db/migrations/index.ts                              |   2 +
 src/db/migrator.db.test.ts                              |   5 +
 src/db/repositories/meetup-safety-repository.db.test.ts | 148 +++++++++++
 src/db/repositories/meetup-safety-repository.ts         | 486 ++++++++++++++++++++++++++++++++++++
 src/db/repositories/region-repository.ts                |   6 +-
 src/db/repositories/self-role-repository.db.test.ts     |   7 +-
 src/db/repositories/self-role-repository.ts             |   6 +-
 src/db/table-names.ts                                   |   4 +
 src/db/transaction.test.ts                              |  24 ++
 src/db/transaction.ts                                   |  20 +-
 src/db/types.ts                                         |  63 +++++
 src/domain/meetups/records.ts                           | 207 +++++++++++++++
 src/domain/party/party-state.ts                         |   9 +-
 test/support/meetup-safety-cases.ts                     | 363 +++++++++++++++++++++++++++
 test/support/meetup-safety.test.ts                      |   7 +
 test/support/meetup-safety.ts                           | 289 +++++++++++++++++++++
 19 files changed, 1776 insertions(+), 21 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/db/errors.test.ts src/db/transaction.test.ts test/support/meetup-safety.test.ts`, and with Docker `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npx vitest run --project db src/db/migrator.db.test.ts src/db/repositories/meetup-safety-repository.db.test.ts src/db/repositories/self-role-repository.db.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 9c6de33b8261e4e3c8c54b9980df9de91e760162 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8s1-meetup-safety.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-1 T2: Meetup safety: requests, rulings, blocks and appeals in the database`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/db/errors.test.ts b/src/db/errors.test.ts
new file mode 100644
index 00000000..ffb64fa7
--- /dev/null
+++ b/src/db/errors.test.ts
@@ -0,0 +1,32 @@
+import { describe, expect, it } from 'vitest';
+import { isDuplicateEntry } from './errors.js';
+
+/** MySQL's duplicate-key error as mysql2 gives it. */
+function duplicate(key: string): Error {
+  return Object.assign(new Error(`Duplicate entry 'x' for key '${key}'`), {
+    errno: 1062,
+    code: 'ER_DUP_ENTRY',
+    sqlMessage: `Duplicate entry 'x' for key '${key}'`,
+  });
+}
+
+describe('isDuplicateEntry', () => {
+  it('knows MySQL’s duplicate-key error, and nothing else', () => {
+    expect(isDuplicateEntry(duplicate('Region.PRIMARY'))).toBe(true);
+    expect(isDuplicateEntry(Object.assign(new Error('Deadlock'), { errno: 1213 }))).toBe(false);
+    expect(isDuplicateEntry('Duplicate entry')).toBe(false);
+    expect(isDuplicateEntry(undefined)).toBe(false);
+  });
+
+  it('asked of one key, knows only a duplicate of that key', () => {
+    const open = duplicate('MeetupAppeal.meetupappeal_openkey_unique');
+    expect(isDuplicateEntry(open, 'meetupappeal_openkey_unique')).toBe(true);
+    expect(isDuplicateEntry(duplicate('MeetupAppeal.PRIMARY'), 'meetupappeal_openkey_unique')).toBe(
+      false,
+    );
+    // MySQL before 8.0.19 names the key without its table.
+    expect(
+      isDuplicateEntry(duplicate('meetupappeal_openkey_unique'), 'meetupappeal_openkey_unique'),
+    ).toBe(true);
+  });
+});
diff --git a/src/db/errors.ts b/src/db/errors.ts
new file mode 100644
index 00000000..f4920486
--- /dev/null
+++ b/src/db/errors.ts
@@ -0,0 +1,13 @@
+/**
+ * MySQL's duplicate-key error (ER_DUP_ENTRY, errno 1062); with `key`, only a duplicate of that
+ * key (its name as the migration gave it: MySQL says `Table.key`, before 8.0.19 `key` alone), so
+ * that a duplicate of another key (a primary key made twice) is not taken for the one expected.
+ */
+export function isDuplicateEntry(error: unknown, key?: string): boolean {
+  if (typeof error !== 'object' || error === null || !('errno' in error)) return false;
+  if (error.errno !== 1062) return false;
+  if (key === undefined) return true;
+  const message =
+    'sqlMessage' in error && typeof error.sqlMessage === 'string' ? error.sqlMessage : '';
+  return message.endsWith(`.${key}'`) || message.endsWith(` '${key}'`);
+}
diff --git a/src/db/migrations/2026_10_17_019_meetup_safety.ts b/src/db/migrations/2026_10_17_019_meetup_safety.ts
new file mode 100644
index 00000000..ed1f826e
--- /dev/null
+++ b/src/db/migrations/2026_10_17_019_meetup_safety.ts
@@ -0,0 +1,106 @@
+import { sql, type Kysely } from 'kysely';
+import type { Migration } from 'kysely/migration';
+
+/**
+ * Meetup safety (plan 8S-1; spec `2026-10-17-meetup-safety-design.md`): what is kept of the
+ * meetups held for the moderators, so that a press on a moderators' post still works after a
+ * restart. Servers and members are snowflakes without a foreign key (as the party history's):
+ * a kick and a new invite neither delete nor split them. Times are epoch milliseconds.
+ *
+ * - `MeetupRequest`: a meetup its maker asked for at a place that needs a moderator's approval,
+ *   by a UUID (in the custom ids of its post): the server, the region channel it was asked in,
+ *   the maker (id, display name and team when they asked), the place as it was named (`place`,
+ *   JSON: a gym, PokéStop or power spot as a snapshot, or a pin), the meetup's name, start and
+ *   description, when it was made and expires, its `status` (`pending`, `approved`, `refused`,
+ *   `expired`, `failed`, `withdrawn`), the moderators' post (`channelId`, `messageId`: it is
+ *   sent first), what was decided (`decision`: `approve`, `approve-once`, `refuse`,
+ *   `refuse-forever`, `block`), by whom and when, and the meetup an approval made (`partyId`).
+ * - `MeetupPlaceRuling`: a server's ruling of a gym, PokéStop or power spot (`placeKind`,
+ *   `placeId`: a gym's number as text, a Wayspot's Wayfarer id), `allow` or `refuse`, for good;
+ *   one per server and place, the later in place of the earlier. Pins have none.
+ * - `MeetupBlock`: a member blocked from making meetups in a server, one row per server and
+ *   member; a lifted block keeps who lifted it (`liftedBy`, `liftedByName`) and when until the
+ *   member is blocked again: only the last lift is kept.
+ * - `MeetupAppeal`: a blocked member's appeal (`text`), `open`, `lifted`, `kept` or `expired`,
+ *   with its post and who decided. `openKey` (`<server> <member>` while open, null once decided) is
+ *   unique: one open appeal per member and server.
+ *
+ * 019: after 8H's `018_party_history`; renumbered at the merge if another branch took it first.
+ *
+ * Safe to run again after a failure half-way: each table is created only when it is missing.
+ */
+export const meetupSafety: Migration = {
+  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations are schema-agnostic
+  async up(db: Kysely<any>) {
+    await sql`
+      create table if not exists MeetupRequest (
+        id char(36) not null,
+        serverId varchar(30) not null,
+        regionChannelId varchar(30) not null,
+        makerId varchar(30) not null,
+        makerName varchar(100) default null,
+        makerTeam varchar(10) default null,
+        place json not null,
+        name varchar(100) not null,
+        startTime bigint not null,
+        description text not null,
+        createdAt bigint not null,
+        expiresAt bigint not null,
+        status varchar(10) not null,
+        channelId varchar(30) not null,
+        messageId varchar(30) not null,
+        decision varchar(16) default null,
+        decidedBy varchar(30) default null,
+        decidedByName varchar(100) default null,
+        decidedAt bigint default null,
+        partyId char(36) default null,
+        primary key (id),
+        key meetuprequest_status_expiresat_index (status, expiresAt),
+        key meetuprequest_maker_index (serverId, makerId, status)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists MeetupPlaceRuling (
+        serverId varchar(30) not null,
+        placeKind varchar(10) not null,
+        placeId varchar(64) not null,
+        ruling varchar(8) not null,
+        ruledBy varchar(30) not null,
+        ruledAt bigint not null,
+        primary key (serverId, placeKind, placeId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists MeetupBlock (
+        serverId varchar(30) not null,
+        memberId varchar(30) not null,
+        blockedBy varchar(30) not null,
+        blockedByName varchar(100) default null,
+        blockedAt bigint not null,
+        liftedBy varchar(30) default null,
+        liftedByName varchar(100) default null,
+        liftedAt bigint default null,
+        primary key (serverId, memberId)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+    await sql`
+      create table if not exists MeetupAppeal (
+        id char(36) not null,
+        serverId varchar(30) not null,
+        memberId varchar(30) not null,
+        memberName varchar(100) default null,
+        text text not null,
+        createdAt bigint not null,
+        status varchar(8) not null,
+        openKey varchar(64) default null,
+        channelId varchar(30) default null,
+        messageId varchar(30) default null,
+        decidedBy varchar(30) default null,
+        decidedByName varchar(100) default null,
+        decidedAt bigint default null,
+        primary key (id),
+        unique key meetupappeal_openkey_unique (openKey),
+        key meetupappeal_member_index (serverId, memberId, status)
+      ) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_0900_ai_ci`.execute(db);
+  },
+  async down() {
+    // Additive only: nothing is ever dropped.
+  },
+};
diff --git a/src/db/migrations/index.ts b/src/db/migrations/index.ts
index f91aa4c0..0d18c715 100644
--- a/src/db/migrations/index.ts
+++ b/src/db/migrations/index.ts
@@ -17,6 +17,7 @@ import { gymLookups } from './2026_10_16_014_gym_lookups.js';
 import { webSession } from './2026_10_16_015_web_session.js';
 import { wayspot } from './2026_10_16_017_wayspot.js';
 import { partyHistory } from './2026_10_16_018_party_history.js';
+import { meetupSafety } from './2026_10_17_019_meetup_safety.js';
 
 /**
  * Every migration, keyed by name. Kysely applies them in name order, so names are
@@ -41,4 +42,5 @@ export const migrations: Record<string, Migration> = {
   '2026_10_16_015_web_session': webSession,
   '2026_10_16_017_wayspot': wayspot,
   '2026_10_16_018_party_history': partyHistory,
+  '2026_10_17_019_meetup_safety': meetupSafety,
 };
diff --git a/src/db/migrator.db.test.ts b/src/db/migrator.db.test.ts
index ff1e6239..e35367e2 100644
--- a/src/db/migrator.db.test.ts
+++ b/src/db/migrator.db.test.ts
@@ -48,6 +48,10 @@ const ADDED_TABLES = [
   'HistoryOptIn',
   'PartyHistoryStep',
   'EndedPartyPost',
+  'MeetupRequest',
+  'MeetupPlaceRuling',
+  'MeetupBlock',
+  'MeetupAppeal',
 ];
 /** The columns it adds to tables of the legacy bot, as `Table.column`. */
 const ADDED_COLUMNS = [
@@ -161,6 +165,7 @@ describe('runMigrations', () => {
       '2026_10_16_015_web_session',
       '2026_10_16_017_wayspot',
       '2026_10_16_018_party_history',
+      '2026_10_17_019_meetup_safety',
     ]);
     expect(
       await describeSchema(
diff --git a/src/db/repositories/meetup-safety-repository.db.test.ts b/src/db/repositories/meetup-safety-repository.db.test.ts
new file mode 100644
index 00000000..ace825fb
--- /dev/null
+++ b/src/db/repositories/meetup-safety-repository.db.test.ts
@@ -0,0 +1,148 @@
+import type { Kysely } from 'kysely';
+import { afterAll, beforeAll, describe, expect, it } from 'vitest';
+import {
+  MAKER,
+  meetupSafetyCases,
+  newAppeal,
+  MOD,
+  MODERATOR,
+  newRequest,
+  requestId,
+  SAFETY_NOW,
+  SAFETY_SERVER,
+} from '../../../test/support/meetup-safety-cases.js';
+import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
+import { createTestLogger } from '../../../test/support/test-logger.js';
+import type { DB } from '../types.js';
+import { MeetupSafetyRepository } from './meetup-safety-repository.js';
+
+describe('MeetupSafetyRepository', () => {
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
+  const fresh = async () => {
+    for (const table of [
+      'MeetupRequest',
+      'MeetupPlaceRuling',
+      'MeetupBlock',
+      'MeetupAppeal',
+    ] as const) {
+      await db.deleteFrom(table).execute();
+    }
+    return new MeetupSafetyRepository(db);
+  };
+
+  meetupSafetyCases(fresh);
+
+  it('keeps times beyond 2^31 and snowflakes as written', async () => {
+    const store = await fresh();
+    const far = SAFETY_NOW * 2;
+    await store.addRequest(
+      newRequest(1, { makerId: '1234567890123456789', startTime: far, expiresAt: far - 1 }),
+    );
+    expect(await store.request(requestId(1))).toMatchObject({
+      makerId: '1234567890123456789',
+      startTime: far,
+      expiresAt: far - 1,
+    });
+  });
+
+  it('marks a due request whose place is no place failed, and says so once', async () => {
+    await fresh();
+    const { log, entries } = createTestLogger();
+    const store = new MeetupSafetyRepository(db, log);
+    await store.addRequest(newRequest(1));
+    await store.addRequest(newRequest(2, { expiresAt: SAFETY_NOW * 3 }));
+    await db
+      .updateTable('MeetupRequest')
+      .set({ place: JSON.stringify({ kind: 'castle' }) })
+      .execute();
+    expect(await store.request(requestId(1))).toBeUndefined();
+    expect(await store.duePending(SAFETY_NOW * 2)).toEqual([]);
+    expect(await store.duePending(SAFETY_NOW * 2)).toEqual([]);
+    const rows = await db
+      .selectFrom('MeetupRequest')
+      .select(['id', 'status'])
+      .orderBy('id')
+      .execute();
+    // The one not due yet stays as it was.
+    expect(rows).toEqual([
+      { id: requestId(1), status: 'failed' },
+      { id: requestId(2), status: 'pending' },
+    ]);
+    expect(
+      entries.filter((entry) => entry.msg === 'a due meetup request cannot be read; it is failed'),
+    ).toHaveLength(1);
+  });
+
+  it('decides a request once when two decide it at the same moment', async () => {
+    const store = await fresh();
+    await store.addRequest(newRequest(1));
+    const both = await Promise.all([
+      store.decideRequest(requestId(1), 'approved', 'approve', MOD),
+      store.decideRequest(requestId(1), 'refused', 'refuse', { ...MOD, id: MAKER }),
+    ]);
+    expect(both.filter(Boolean)).toHaveLength(1);
+  });
+
+  it('blocks a member once when two block them at the same moment', async () => {
+    const store = await fresh();
+    const both = await Promise.all([
+      store.addBlock(SAFETY_SERVER, MAKER, MOD),
+      store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 1 }),
+    ]);
+    expect([...both].sort()).toEqual([false, true]);
+    // Over two requests of the maker: both refused, one block, no deadlock.
+    const again = await fresh();
+    await again.addRequest(newRequest(1));
+    await again.addRequest(newRequest(2));
+    const blocks = await Promise.all([
+      again.blockMaker(newRequest(1), MOD),
+      again.blockMaker(newRequest(2), { ...MOD, at: MOD.at + 1 }),
+    ]);
+    expect(blocks.map((one) => one.decided)).toEqual([true, true]);
+    expect(blocks.filter((one) => one.newBlock)).toHaveLength(1);
+    // And again once the block was lifted (the row is there).
+    await again.liftBlock(SAFETY_SERVER, MAKER, MOD);
+    await again.addRequest(newRequest(3));
+    await again.addRequest(newRequest(4));
+    const anew = await Promise.all([
+      again.blockMaker(newRequest(3), MOD),
+      again.blockMaker(newRequest(4), { ...MOD, at: MOD.at + 1 }),
+    ]);
+    expect(anew.filter((one) => one.newBlock)).toHaveLength(1);
+  });
+
+  it('takes a second appeal of one id as the fault it is, not as an open appeal', async () => {
+    const store = await fresh();
+    const appeal = newAppeal(1);
+    expect(await store.addAppeal(appeal)).toBe('added');
+    await store.decideAppeal(appeal.id, 'kept', MOD);
+    await expect(store.addAppeal(appeal)).rejects.toThrow(/Duplicate entry/);
+  });
+
+  it('keeps who lifted a block last, until the member is blocked again', async () => {
+    const store = await fresh();
+    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
+    await store.liftBlock(SAFETY_SERVER, MAKER, { id: MODERATOR, name: 'Mod', at: MOD.at + 5 });
+    const lifted = () =>
+      db
+        .selectFrom('MeetupBlock')
+        .select(['liftedBy', 'liftedByName', 'liftedAt'])
+        .executeTakeFirstOrThrow();
+    expect(await lifted()).toEqual({
+      liftedBy: MODERATOR,
+      liftedByName: 'Mod',
+      liftedAt: String(MOD.at + 5),
+    });
+    await store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 9 });
+    expect(await lifted()).toEqual({ liftedBy: null, liftedByName: null, liftedAt: null });
+  });
+});
diff --git a/src/db/repositories/meetup-safety-repository.ts b/src/db/repositories/meetup-safety-repository.ts
new file mode 100644
index 00000000..c3a6c562
--- /dev/null
+++ b/src/db/repositories/meetup-safety-repository.ts
@@ -0,0 +1,486 @@
+import type { Kysely, Selectable } from 'kysely';
+import { REQUEST_DECISIONS } from '../../domain/meetups/records.js';
+import type {
+  ApprovalOutcome,
+  AppealStatus,
+  Decider,
+  MeetupAppeal,
+  MeetupBlock,
+  MeetupRequestRecord,
+  MeetupSafetyStore,
+  NewMeetupAppeal,
+  NewMeetupRequest,
+  RequestDecision,
+  RequestStatus,
+} from '../../domain/meetups/records.js';
+import type { PlaceRuling, RulingKey } from '../../domain/meetups/safety.js';
+import { placeDocument } from '../../domain/party/party-state.js';
+import { TEAMS, type Team } from '../../domain/party/party.js';
+import type { Logger } from '../../log.js';
+import { inTransaction } from '../transaction.js';
+import type { DB, MeetupAppeal as AppealRow, MeetupRequest as RequestRow } from '../types.js';
+import { isDuplicateEntry } from '../errors.js';
+
+const STATUSES: readonly RequestStatus[] = [
+  'pending',
+  'approved',
+  'refused',
+  'expired',
+  'failed',
+  'withdrawn',
+];
+const APPEAL_STATUSES: readonly AppealStatus[] = ['open', 'lifted', 'kept', 'expired'];
+
+const epoch = (value: string | null): number | null => (value === null ? null : Number(value));
+
+/**
+ * What meetup safety keeps (plan 8S-1), in the tables of migration 019: `MeetupRequest`,
+ * `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`. Its twin in memory is
+ * `MemoryMeetupSafety`; both run `meetupSafetyCases` (`test/support/meetup-safety-cases.ts`).
+ * A request whose row cannot be read (its place is no place) is logged and left alone, as if it
+ * were not there.
+ */
+export class MeetupSafetyRepository implements MeetupSafetyStore {
+  constructor(
+    private readonly db: Kysely<DB>,
+    private readonly log?: Logger,
+  ) {}
+
+  async ruling(serverId: string, key: RulingKey): Promise<PlaceRuling | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupPlaceRuling')
+      .select('ruling')
+      .where('serverId', '=', serverId)
+      .where('placeKind', '=', key.kind)
+      .where('placeId', '=', key.id)
+      .executeTakeFirst();
+    return row?.ruling === 'allow' || row?.ruling === 'refuse' ? row.ruling : undefined;
+  }
+
+  async rule(serverId: string, key: RulingKey, ruling: PlaceRuling, by: Decider): Promise<void> {
+    await this.db
+      .insertInto('MeetupPlaceRuling')
+      .values({
+        serverId,
+        placeKind: key.kind,
+        placeId: key.id,
+        ruling,
+        ruledBy: by.id,
+        ruledAt: String(by.at),
+      })
+      .onDuplicateKeyUpdate({ ruling, ruledBy: by.id, ruledAt: String(by.at) })
+      .execute();
+  }
+
+  async block(serverId: string, memberId: string): Promise<MeetupBlock | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupBlock')
+      .select(['serverId', 'memberId', 'blockedBy', 'blockedByName', 'blockedAt'])
+      .where('serverId', '=', serverId)
+      .where('memberId', '=', memberId)
+      .where('liftedAt', 'is', null)
+      .executeTakeFirst();
+    return row && { ...row, blockedAt: Number(row.blockedAt) };
+  }
+
+  addBlock(serverId: string, memberId: string, by: Decider): Promise<boolean> {
+    return blockIn(this.db, serverId, memberId, by);
+  }
+
+  blockMaker(
+    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId'>,
+    by: Decider,
+  ): Promise<{ decided: boolean; newBlock: boolean }> {
+    // Read committed: the block's row may not be there yet, and gap locks on it would deadlock
+    // two blocks of one maker over two requests. So never inside a caller's transaction.
+    return inTransaction(
+      this.db,
+      async (trx) => {
+        const [result] = await trx
+          .updateTable('MeetupRequest')
+          .set({
+            status: 'refused',
+            decision: 'block',
+            decidedBy: by.id,
+            decidedByName: by.name,
+            decidedAt: String(by.at),
+          })
+          .where('id', '=', request.id)
+          .where('status', '=', 'pending')
+          .execute();
+        if (Number(result?.numUpdatedRows ?? 0) === 0) return { decided: false, newBlock: false };
+        return {
+          decided: true,
+          newBlock: await blockIn(trx, request.serverId, request.makerId, by),
+        };
+      },
+      { isolation: 'read committed' },
+    );
+  }
+
+  liftOnAppeal(
+    appeal: Pick<MeetupAppeal, 'id' | 'serverId' | 'memberId'>,
+    by: Decider,
+  ): Promise<boolean> {
+    return inTransaction(this.db, async (trx) => {
+      const [decided] = await trx
+        .updateTable('MeetupAppeal')
+        .set({
+          status: 'lifted',
+          openKey: null,
+          decidedBy: by.id,
+          decidedByName: by.name,
+          decidedAt: String(by.at),
+        })
+        .where('id', '=', appeal.id)
+        .where('status', '=', 'open')
+        .execute();
+      if (Number(decided?.numUpdatedRows ?? 0) === 0) return false;
+      await liftIn(trx, appeal.serverId, appeal.memberId, by);
+      return true;
+    });
+  }
+
+  liftBlock(serverId: string, memberId: string, by: Decider): Promise<boolean> {
+    return liftIn(this.db, serverId, memberId, by);
+  }
+
+  async addRequest(request: NewMeetupRequest): Promise<void> {
+    await this.db
+      .insertInto('MeetupRequest')
+      .values({
+        id: request.id,
+        serverId: request.serverId,
+        regionChannelId: request.regionChannelId,
+        makerId: request.makerId,
+        makerName: request.makerName,
+        makerTeam: request.makerTeam,
+        place: JSON.stringify(request.place),
+        name: request.name,
+        startTime: String(request.startTime),
+        description: request.description,
+        createdAt: String(request.createdAt),
+        expiresAt: String(request.expiresAt),
+        status: 'pending',
+        channelId: request.channelId,
+        messageId: request.messageId,
+      })
+      .execute();
+  }
+
+  async request(id: string): Promise<MeetupRequestRecord | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupRequest')
+      .selectAll()
+      .where('id', '=', id)
+      .executeTakeFirst();
+    return row && this.readRequest(row);
+  }
+
+  async decideRequest(
+    id: string,
+    status: Exclude<RequestStatus, 'pending' | 'failed'>,
+    decision: RequestDecision | null,
+    by: Decider | null,
+  ): Promise<boolean> {
+    const [result] = await this.db
+      .updateTable('MeetupRequest')
+      .set({
+        status,
+        decision,
+        decidedBy: by?.id ?? null,
+        decidedByName: by?.name ?? null,
+        decidedAt: by === null ? null : String(by.at),
+      })
+      .where('id', '=', id)
+      .where('status', '=', 'pending')
+      .execute();
+    return Number(result?.numUpdatedRows ?? 0) > 0;
+  }
+
+  async settleApproval(id: string, outcome: ApprovalOutcome): Promise<boolean> {
+    const [result] = await this.db
+      .updateTable('MeetupRequest')
+      .set(typeof outcome === 'string' ? { status: outcome } : { partyId: outcome.partyId })
+      .where('id', '=', id)
+      .where('status', '=', 'approved')
+      .where('partyId', 'is', null)
+      .execute();
+    return Number(result?.numUpdatedRows ?? 0) > 0;
+  }
+
+  async strandedApprovals(decidedBefore: number): Promise<MeetupRequestRecord[]> {
+    const rows = await this.db
+      .selectFrom('MeetupRequest')
+      .selectAll()
+      .where('status', '=', 'approved')
+      .where('partyId', 'is', null)
+      .where('decidedAt', '<=', String(decidedBefore))
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return this.readRequests(rows);
+  }
+
+  async pendingOf(serverId: string, makerId: string): Promise<MeetupRequestRecord[]> {
+    const rows = await this.db
+      .selectFrom('MeetupRequest')
+      .selectAll()
+      .where('serverId', '=', serverId)
+      .where('makerId', '=', makerId)
+      .where('status', '=', 'pending')
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return this.readRequests(rows);
+  }
+
+  async duePending(now: number): Promise<MeetupRequestRecord[]> {
+    const rows = await this.db
+      .selectFrom('MeetupRequest')
+      .selectAll()
+      .where('status', '=', 'pending')
+      .where('expiresAt', '<=', String(now))
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    const due: MeetupRequestRecord[] = [];
+    for (const row of rows) {
+      const request = this.readRequest(row, false);
+      if (request) {
+        due.push(request);
+        continue;
+      }
+      // Never expired otherwise: failed once, so that it is said once and not at every tick.
+      const [result] = await this.db
+        .updateTable('MeetupRequest')
+        .set({ status: 'failed' })
+        .where('id', '=', row.id)
+        .where('status', '=', 'pending')
+        .execute();
+      if (Number(result?.numUpdatedRows ?? 0) > 0) {
+        this.log?.error({ request: row.id }, 'a due meetup request cannot be read; it is failed');
+      }
+    }
+    return due;
+  }
+
+  async addAppeal(appeal: NewMeetupAppeal): Promise<'added' | 'open'> {
+    try {
+      await this.db
+        .insertInto('MeetupAppeal')
+        .values({
+          id: appeal.id,
+          serverId: appeal.serverId,
+          memberId: appeal.memberId,
+          memberName: appeal.memberName,
+          text: appeal.text,
+          createdAt: String(appeal.createdAt),
+          status: 'open',
+          openKey: `${appeal.serverId} ${appeal.memberId}`,
+        })
+        .execute();
+      return 'added';
+    } catch (err) {
+      if (isDuplicateEntry(err, 'meetupappeal_openkey_unique')) return 'open';
+      throw err;
+    }
+  }
+
+  async discardAppeal(id: string): Promise<void> {
+    await this.db.deleteFrom('MeetupAppeal').where('id', '=', id).execute();
+  }
+
+  async setAppealPost(id: string, channelId: string, messageId: string): Promise<void> {
+    await this.db
+      .updateTable('MeetupAppeal')
+      .set({ channelId, messageId })
+      .where('id', '=', id)
+      .execute();
+  }
+
+  async appeal(id: string): Promise<MeetupAppeal | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupAppeal')
+      .selectAll()
+      .where('id', '=', id)
+      .executeTakeFirst();
+    return row && readAppeal(row);
+  }
+
+  async openAppeal(serverId: string, memberId: string): Promise<MeetupAppeal | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupAppeal')
+      .selectAll()
+      .where('openKey', '=', `${serverId} ${memberId}`)
+      .executeTakeFirst();
+    return row && readAppeal(row);
+  }
+
+  async lastKept(serverId: string, memberId: string): Promise<number | undefined> {
+    const row = await this.db
+      .selectFrom('MeetupAppeal')
+      .select((eb) => eb.fn.max('decidedAt').as('last'))
+      .where('serverId', '=', serverId)
+      .where('memberId', '=', memberId)
+      .where('status', '=', 'kept')
+      .executeTakeFirst();
+    return row?.last === null || row?.last === undefined ? undefined : Number(row.last);
+  }
+
+  async decideAppeal(
+    id: string,
+    status: Exclude<AppealStatus, 'open'>,
+    by: Decider | null,
+  ): Promise<boolean> {
+    const [result] = await this.db
+      .updateTable('MeetupAppeal')
+      .set({
+        status,
+        openKey: null,
+        decidedBy: by?.id ?? null,
+        decidedByName: by?.name ?? null,
+        decidedAt: by === null ? null : String(by.at),
+      })
+      .where('id', '=', id)
+      .where('status', '=', 'open')
+      .execute();
+    return Number(result?.numUpdatedRows ?? 0) > 0;
+  }
+
+  async staleAppeals(stale: {
+    unpostedBefore: number;
+    openedBefore: number;
+  }): Promise<MeetupAppeal[]> {
+    const rows = await this.db
+      .selectFrom('MeetupAppeal')
+      .selectAll()
+      .where('status', '=', 'open')
+      .where((eb) =>
+        eb.or([
+          eb.and([
+            eb('messageId', 'is', null),
+            eb('createdAt', '<=', String(stale.unpostedBefore)),
+          ]),
+          eb('createdAt', '<=', String(stale.openedBefore)),
+        ]),
+      )
+      .orderBy('createdAt')
+      .orderBy('id')
+      .execute();
+    return rows.map(readAppeal);
+  }
+
+  private readRequests(rows: Selectable<RequestRow>[]): MeetupRequestRecord[] {
+    return rows.flatMap((row) => {
+      const request = this.readRequest(row);
+      return request ? [request] : [];
+    });
+  }
+
+  /** A request as it was stored; undefined (logged, unless `say` is false) for one that does not read. */
+  private readRequest(row: Selectable<RequestRow>, say = true): MeetupRequestRecord | undefined {
+    const place = placeDocument.safeParse(
+      typeof row.place === 'string' ? JSON.parse(row.place) : row.place,
+    );
+    const status = STATUSES.find((one) => one === row.status);
+    const decision =
+      row.decision === null ? null : REQUEST_DECISIONS.find((one) => one === row.decision);
+    if (!place.success || status === undefined || decision === undefined) {
+      if (say) {
+        this.log?.error({ request: row.id }, 'a meetup request cannot be read; it is left alone');
+      }
+      return undefined;
+    }
+    return {
+      id: row.id,
+      serverId: row.serverId,
+      regionChannelId: row.regionChannelId,
+      makerId: row.makerId,
+      makerName: row.makerName,
+      makerTeam: teamOf(row.makerTeam),
+      place: place.data,
+      name: row.name,
+      startTime: Number(row.startTime),
+      description: row.description,
+      createdAt: Number(row.createdAt),
+      expiresAt: Number(row.expiresAt),
+      status,
+      channelId: row.channelId,
+      messageId: row.messageId,
+      decision,
+      decidedBy: row.decidedBy,
+      decidedByName: row.decidedByName,
+      decidedAt: epoch(row.decidedAt),
+      partyId: row.partyId,
+    };
+  }
+}
+
+/**
+ * Blocks a member without reading first (no lock on a row that is not there): a lifted block's
+ * row is blocked again in its place (only the last lift is kept), else a row is made unless one
+ * is there (a block that stands, or one made at the same moment: the first stands). True for a
+ * new block.
+ */
+async function blockIn(
+  db: Kysely<DB>,
+  serverId: string,
+  memberId: string,
+  by: Decider,
+): Promise<boolean> {
+  const blocked = { blockedBy: by.id, blockedByName: by.name, blockedAt: String(by.at) };
+  const [renewed] = await db
+    .updateTable('MeetupBlock')
+    .set({ ...blocked, liftedBy: null, liftedByName: null, liftedAt: null })
+    .where('serverId', '=', serverId)
+    .where('memberId', '=', memberId)
+    .where('liftedAt', 'is not', null)
+    .execute();
+  if (Number(renewed?.numUpdatedRows ?? 0) > 0) return true;
+  const [made] = await db
+    .insertInto('MeetupBlock')
+    .ignore()
+    .values({ serverId, memberId, ...blocked })
+    .execute();
+  return Number(made?.numInsertedOrUpdatedRows ?? 0) > 0;
+}
+
+/** Lifts a member's block, keeping who lifted it; false when none stood. */
+async function liftIn(
+  db: Kysely<DB>,
+  serverId: string,
+  memberId: string,
+  by: Decider,
+): Promise<boolean> {
+  const [result] = await db
+    .updateTable('MeetupBlock')
+    .set({ liftedBy: by.id, liftedByName: by.name, liftedAt: String(by.at) })
+    .where('serverId', '=', serverId)
+    .where('memberId', '=', memberId)
+    .where('liftedAt', 'is', null)
+    .execute();
+  return Number(result?.numUpdatedRows ?? 0) > 0;
+}
+
+function teamOf(text: string | null): Team | null {
+  return TEAMS.find((team) => team === text) ?? null;
+}
+
+function readAppeal(row: Selectable<AppealRow>): MeetupAppeal {
+  return {
+    id: row.id,
+    serverId: row.serverId,
+    memberId: row.memberId,
+    memberName: row.memberName,
+    text: row.text,
+    createdAt: Number(row.createdAt),
+    // A status the code does not know is read as decided: it is never offered again.
+    status: APPEAL_STATUSES.find((one) => one === row.status) ?? 'kept',
+    channelId: row.channelId,
+    messageId: row.messageId,
+    decidedBy: row.decidedBy,
+    decidedByName: row.decidedByName,
+    decidedAt: epoch(row.decidedAt),
+  };
+}
diff --git a/src/db/repositories/region-repository.ts b/src/db/repositories/region-repository.ts
index f92a804e..02698809 100644
--- a/src/db/repositories/region-repository.ts
+++ b/src/db/repositories/region-repository.ts
@@ -1,5 +1,6 @@
 import { sql, type Kysely } from 'kysely';
 import type { LatLon } from '../../domain/geo/lat-lon.js';
+import { isDuplicateEntry } from '../errors.js';
 import { snowflakeParam } from '../snowflake.js';
 import { inTransaction } from '../transaction.js';
 import { polygonWkt, ringFromPolygon } from '../spatial.js';
@@ -89,11 +90,6 @@ const COLUMNS = [
   'summaryMessageId',
 ] as const;
 
-/** MySQL's duplicate-key error (ER_DUP_ENTRY, errno 1062). */
-function isDuplicateEntry(error: unknown): boolean {
-  return typeof error === 'object' && error !== null && 'errno' in error && error.errno === 1062;
-}
-
 /** The Region table. All spatial SQL for regions lives here. */
 export class RegionRepository implements RegionAdminStorage {
   constructor(private readonly db: Kysely<DB>) {}
diff --git a/src/db/repositories/self-role-repository.db.test.ts b/src/db/repositories/self-role-repository.db.test.ts
index f312c1d6..3d0e3caf 100644
--- a/src/db/repositories/self-role-repository.db.test.ts
+++ b/src/db/repositories/self-role-repository.db.test.ts
@@ -2,13 +2,10 @@ import { sql, type Kysely } from 'kysely';
 import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
 import { startMigratedDatabase } from '../../../test/support/migrated-db.js';
 import { MemorySelfRoles } from '../../../test/support/self-roles.js';
+import { isDuplicateEntry } from '../errors.js';
 import type { DB } from '../types.js';
 import { GuildRepository } from './guild-repository.js';
-import {
-  isDuplicateEntry,
-  SelfRoleRepository,
-  type SelfRoleStorage,
-} from './self-role-repository.js';
+import { SelfRoleRepository, type SelfRoleStorage } from './self-role-repository.js';
 
 const HOME = '412345678901234567';
 const AWAY = '412345678901234568';
diff --git a/src/db/repositories/self-role-repository.ts b/src/db/repositories/self-role-repository.ts
index 81e665e9..b5be0511 100644
--- a/src/db/repositories/self-role-repository.ts
+++ b/src/db/repositories/self-role-repository.ts
@@ -13,6 +13,7 @@ import {
   type SelfRoleGroup,
   type SelfRoleRow,
 } from '../../domain/roles/self-roles.js';
+import { isDuplicateEntry } from '../errors.js';
 import { inTransaction } from '../transaction.js';
 import type { DB } from '../types.js';
 
@@ -57,11 +58,6 @@ export interface SelfRoleStorage {
   ): Promise<{ group: SelfRoleGroup; roles: number } | undefined>;
 }
 
-/** MySQL's duplicate-key error (ER_DUP_ENTRY, errno 1062). */
-export function isDuplicateEntry(error: unknown): boolean {
-  return typeof error === 'object' && error !== null && 'errno' in error && error.errno === 1062;
-}
-
 /**
  * The legacy tables `Role` and `Alias` with what plan 4C added: `Role.roleSnowflake` (the
  * Discord role's id), `Role.groupId` and the table `RoleGroup`. The legacy bot keeps reading
diff --git a/src/db/table-names.ts b/src/db/table-names.ts
index bd94fbcf..7e12fc8a 100644
--- a/src/db/table-names.ts
+++ b/src/db/table-names.ts
@@ -20,6 +20,10 @@ export const PINE_TABLES: readonly string[] = [
   'GymWayfarer',
   'EndedPartyPost',
   'HistoryOptIn',
+  'MeetupAppeal',
+  'MeetupBlock',
+  'MeetupPlaceRuling',
+  'MeetupRequest',
   'NewTrainNotification',
   'Party',
   'PartyAccessGrant',
diff --git a/src/db/transaction.test.ts b/src/db/transaction.test.ts
new file mode 100644
index 00000000..4e15ab0f
--- /dev/null
+++ b/src/db/transaction.test.ts
@@ -0,0 +1,24 @@
+import type { Kysely } from 'kysely';
+import { describe, expect, it, vi } from 'vitest';
+import { inTransaction } from './transaction.js';
+
+/** A Kysely that is a caller's transaction already, as far as `inTransaction` looks. */
+function joined(): Kysely<unknown> {
+  return { isTransaction: true } as unknown as Kysely<unknown>;
+}
+
+describe('inTransaction', () => {
+  it('joins a caller’s transaction', async () => {
+    const work = vi.fn(() => Promise.resolve(7));
+    expect(await inTransaction(joined(), work)).toBe(7);
+    expect(work).toHaveBeenCalledOnce();
+  });
+
+  it('refuses an isolation level it cannot set: a caller’s transaction has its own', async () => {
+    const work = vi.fn(() => Promise.resolve(7));
+    await expect(inTransaction(joined(), work, { isolation: 'read committed' })).rejects.toThrow(
+      /isolation/,
+    );
+    expect(work).not.toHaveBeenCalled();
+  });
+});
diff --git a/src/db/transaction.ts b/src/db/transaction.ts
index 5ad2830d..d8222787 100644
--- a/src/db/transaction.ts
+++ b/src/db/transaction.ts
@@ -1,13 +1,27 @@
-import type { Kysely } from 'kysely';
+import type { IsolationLevel, Kysely } from 'kysely';
 
 /**
  * Runs `fn` in a transaction. When `db` already is one (the caller opened it), `fn` joins it
  * instead of starting a nested one, so the caller decides whether everything commits.
+ * `isolation` sets the level of a transaction started here (`read committed` takes no gap
+ * locks, so two writers of a row that is not there yet do not deadlock); a method that asks for
+ * one cannot join a caller's transaction, whose level is set already: that throws.
  */
 export async function inTransaction<DB, T>(
   db: Kysely<DB>,
   fn: (trx: Kysely<DB>) => Promise<T>,
+  options: { isolation?: IsolationLevel } = {},
 ): Promise<T> {
-  if (db.isTransaction) return fn(db);
-  return db.transaction().execute(fn);
+  if (db.isTransaction) {
+    if (options.isolation !== undefined) {
+      throw new Error(
+        `a transaction at isolation level ${options.isolation} cannot join a caller's transaction`,
+      );
+    }
+    return fn(db);
+  }
+  const builder = db.transaction();
+  return (
+    options.isolation === undefined ? builder : builder.setIsolationLevel(options.isolation)
+  ).execute(fn);
 }
diff --git a/src/db/types.ts b/src/db/types.ts
index e02dbf77..eb1caa35 100644
--- a/src/db/types.ts
+++ b/src/db/types.ts
@@ -146,6 +146,65 @@ export interface HistoryOptIn {
   serverId: string;
 }
 
+export interface MeetupAppeal {
+  channelId: string | null;
+  createdAt: string;
+  decidedAt: string | null;
+  decidedBy: string | null;
+  decidedByName: string | null;
+  id: string;
+  memberId: string;
+  memberName: string | null;
+  messageId: string | null;
+  openKey: string | null;
+  serverId: string;
+  status: string;
+  text: string;
+}
+
+export interface MeetupBlock {
+  blockedAt: string;
+  blockedBy: string;
+  blockedByName: string | null;
+  liftedAt: string | null;
+  liftedBy: string | null;
+  liftedByName: string | null;
+  memberId: string;
+  serverId: string;
+}
+
+export interface MeetupPlaceRuling {
+  placeId: string;
+  placeKind: string;
+  ruledAt: string;
+  ruledBy: string;
+  ruling: string;
+  serverId: string;
+}
+
+export interface MeetupRequest {
+  channelId: string;
+  createdAt: string;
+  decidedAt: string | null;
+  decidedBy: string | null;
+  decidedByName: string | null;
+  decision: string | null;
+  description: string;
+  expiresAt: string;
+  id: string;
+  makerId: string;
+  makerName: string | null;
+  makerTeam: string | null;
+  messageId: string;
+  name: string;
+  partyId: string | null;
+  place: Json;
+  regionChannelId: string;
+  serverId: string;
+  startTime: string;
+  status: string;
+}
+
 export interface NewTrainNotification {
   createdAt: string;
   guildId: number;
@@ -435,6 +494,10 @@ export interface DB {
   GymReview: GymReview;
   GymWayfarer: GymWayfarer;
   HistoryOptIn: HistoryOptIn;
+  MeetupAppeal: MeetupAppeal;
+  MeetupBlock: MeetupBlock;
+  MeetupPlaceRuling: MeetupPlaceRuling;
+  MeetupRequest: MeetupRequest;
   NewTrainNotification: NewTrainNotification;
   Party: Party;
   PartyAccessGrant: PartyAccessGrant;
diff --git a/src/domain/meetups/records.ts b/src/domain/meetups/records.ts
new file mode 100644
index 00000000..9e490d41
--- /dev/null
+++ b/src/domain/meetups/records.ts
@@ -0,0 +1,207 @@
+import type { Place } from '../geo/place.js';
+import type { Team } from '../party/party.js';
+import type { PlaceRuling, RulingKey } from './safety.js';
+
+/**
+ * What meetup safety keeps (plan 8S-1): the requests held for the moderators, the rulings of
+ * places, the blocks of members and their appeals. Servers and members are snowflakes; times are
+ * epoch milliseconds. Kept in the database (`MeetupSafetyRepository`), so that a press on a
+ * moderators' post still works after a restart.
+ */
+
+/**
+ * Where a request stands: waiting for a moderator; approved (the meetup is made, `partyId`);
+ * refused (also by a block of its maker); expired unanswered; failed (approved, but the meetup
+ * could not be made, or the bot stopped before it was); withdrawn (its maker was blocked over
+ * another request, while it waited or while it was being approved: no meetup).
+ */
+export type RequestStatus = 'pending' | 'approved' | 'refused' | 'expired' | 'failed' | 'withdrawn';
+
+/** What a moderator pressed on a request's post. */
+export type RequestDecision = 'approve' | 'approve-once' | 'refuse' | 'refuse-forever' | 'block';
+
+export const REQUEST_DECISIONS: readonly RequestDecision[] = [
+  'approve',
+  'approve-once',
+  'refuse',
+  'refuse-forever',
+  'block',
+];
+
+/** A meetup as its maker asked for it, held for a moderator. */
+export interface MeetupRequestRecord {
+  /** A UUID, made before the row: it is in the custom ids of the moderators' post. */
+  id: string;
+  serverId: string;
+  /** The region channel `/meetup` was used in: the meetup's post goes into that region's forum. */
+  regionChannelId: string;
+  makerId: string;
+  /** The maker's display name and team when they asked (for the post's sign-up list). */
+  makerName: string | null;
+  makerTeam: Team | null;
+  place: Place;
+  name: string;
+  startTime: number;
+  description: string;
+  createdAt: number;
+  expiresAt: number;
+  status: RequestStatus;
+  /** The moderators' post: its channel and message (sent before the request is stored). */
+  channelId: string;
+  messageId: string;
+  decision: RequestDecision | null;
+  decidedBy: string | null;
+  decidedByName: string | null;
+  decidedAt: number | null;
+  /** The meetup an approval made. */
+  partyId: string | null;
+}
+
+/** A request as it is first stored: pending, with its post, without a decision. */
+export type NewMeetupRequest = Omit<
+  MeetupRequestRecord,
+  'status' | 'decision' | 'decidedBy' | 'decidedByName' | 'decidedAt' | 'partyId'
+>;
+
+/**
+ * What came of an approval: the meetup made (`partyId`), none (`failed`), or none because its
+ * maker was blocked meanwhile (`withdrawn`).
+ */
+export type ApprovalOutcome = { partyId: string } | 'failed' | 'withdrawn';
+
+/** Who decided something, and when. */
+export interface Decider {
+  id: string;
+  name: string | null;
+  at: number;
+}
+
+/** A member blocked from making meetups in a server, until a moderator lifts it. */
+export interface MeetupBlock {
+  serverId: string;
+  memberId: string;
+  blockedBy: string;
+  blockedByName: string | null;
+  blockedAt: number;
+}
+
+/**
+ * Where an appeal stands: with the moderators; lifted or kept by one; or expired (nobody
+ * decided in time, or its post was never made: the member may appeal again).
+ */
+export type AppealStatus = 'open' | 'lifted' | 'kept' | 'expired';
+
+/** A blocked member's appeal to the moderators. */
+export interface MeetupAppeal {
+  /** A UUID, in the custom ids of its post. */
+  id: string;
+  serverId: string;
+  memberId: string;
+  memberName: string | null;
+  text: string;
+  createdAt: number;
+  status: AppealStatus;
+  channelId: string | null;
+  messageId: string | null;
+  decidedBy: string | null;
+  decidedByName: string | null;
+  decidedAt: number | null;
+}
+
+export type NewMeetupAppeal = Pick<
+  MeetupAppeal,
+  'id' | 'serverId' | 'memberId' | 'memberName' | 'text' | 'createdAt'
+>;
+
+/** What meetup safety keeps: `MeetupSafetyRepository`, and `MemoryMeetupSafety` in tests. */
+export interface MeetupSafetyStore {
+  /** A server's ruling of a place; undefined for none. */
+  ruling(serverId: string, key: RulingKey): Promise<PlaceRuling | undefined>;
+  /** Rules a place for good, in place of a ruling it had. */
+  rule(serverId: string, key: RulingKey, ruling: PlaceRuling, by: Decider): Promise<void>;
+
+  /** The member's block in a server, while it stands. */
+  block(serverId: string, memberId: string): Promise<MeetupBlock | undefined>;
+  /**
+   * Blocks a member; false when they are blocked already (the first block stands). A block
+   * lifted before is blocked again in its place: only the last lift is kept.
+   */
+  addBlock(serverId: string, memberId: string, by: Decider): Promise<boolean>;
+  /**
+   * Block member on a request, in one step: the request, while pending, is refused (`decision`
+   * `block`), and its maker blocked in its server. `decided` false: it was not pending any more
+   * (the first press won), and nobody is blocked by this one; `newBlock` false: a block stood
+   * already. Its own transaction (read committed, against deadlocks): it never joins a
+   * caller's, and throws when asked to (`inTransaction`).
+   */
+  blockMaker(
+    request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId'>,
+    by: Decider,
+  ): Promise<{ decided: boolean; newBlock: boolean }>;
+  /** Lifts a member's block, keeping who lifted it (the last lift); false when none stood. */
+  liftBlock(serverId: string, memberId: string, by: Decider): Promise<boolean>;
+  /**
+   * Lift block on an appeal, in one step: the appeal, while open, is decided `lifted`, and the
+   * member's block in its server lifted. False when it was not open any more (the first press
+   * won): nothing is lifted.
+   */
+  liftOnAppeal(
+    appeal: Pick<MeetupAppeal, 'id' | 'serverId' | 'memberId'>,
+    by: Decider,
+  ): Promise<boolean>;
+
+  /** Stores a new request, pending, with its post. */
+  addRequest(request: NewMeetupRequest): Promise<void>;
+  request(id: string): Promise<MeetupRequestRecord | undefined>;
+  /**
+   * Decides a pending request: one conditional change, so that of two presses the first wins.
+   * False when it was not pending any more (or is gone).
+   */
+  decideRequest(
+    id: string,
+    status: Exclude<RequestStatus, 'pending' | 'failed'>,
+    decision: RequestDecision | null,
+    by: Decider | null,
+  ): Promise<boolean>;
+  /**
+   * What came of an approval (`ApprovalOutcome`), once: false when the request is not approved
+   * and without its meetup any more (settled before).
+   */
+  settleApproval(id: string, outcome: ApprovalOutcome): Promise<boolean>;
+  /**
+   * The approvals decided at `decidedBefore` or earlier that never got their meetup (the bot
+   * stopped between the decision and the meetup), oldest first.
+   */
+  strandedApprovals(decidedBefore: number): Promise<MeetupRequestRecord[]>;
+  /** A member's pending requests in a server, oldest first. */
+  pendingOf(serverId: string, makerId: string): Promise<MeetupRequestRecord[]>;
+  /**
+   * The pending requests whose time is up at `now`, oldest first. One of them that cannot be
+   * read is marked failed instead (and logged, once).
+   */
+  duePending(now: number): Promise<MeetupRequestRecord[]>;
+
+  /** Stores a new appeal, open; `open` when the member has one open already in that server. */
+  addAppeal(appeal: NewMeetupAppeal): Promise<'added' | 'open'>;
+  discardAppeal(id: string): Promise<void>;
+  setAppealPost(id: string, channelId: string, messageId: string): Promise<void>;
+  appeal(id: string): Promise<MeetupAppeal | undefined>;
+  /** The member's open appeal in a server. */
+  openAppeal(serverId: string, memberId: string): Promise<MeetupAppeal | undefined>;
+  /** When a moderator last kept the member's block on an appeal; undefined for never. */
+  lastKept(serverId: string, memberId: string): Promise<number | undefined>;
+  /**
+   * Decides an open appeal, the first press winning (`expired` without a decider); false when
+   * it was not open.
+   */
+  decideAppeal(
+    id: string,
+    status: Exclude<AppealStatus, 'open'>,
+    by: Decider | null,
+  ): Promise<boolean>;
+  /**
+   * The open appeals that are stale: whose post was never recorded and that were made at
+   * `unpostedBefore` or earlier, or that were made at `openedBefore` or earlier. Oldest first.
+   */
+  staleAppeals(stale: { unpostedBefore: number; openedBefore: number }): Promise<MeetupAppeal[]>;
+}
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index b3ce649e..9dc24f4b 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -150,8 +150,11 @@ const placeKind = z.enum(['gym', 'stop', 'powerspot']);
 const latitude = z.number().min(-90).max(90);
 const longitude = z.number().min(-180).max(180);
 
-/** A gym, PokéStop or power spot as it was named, or a pin (`MeetupPlace`). */
-const place = z.union([
+/**
+ * A gym, PokéStop or power spot as it was named, or a pin (`MeetupPlace`); also what a request
+ * of meetup safety keeps of its place (`MeetupSafetyRepository`).
+ */
+export const placeDocument = z.union([
   z.object({
     kind: placeKind,
     id: z.string().min(1).max(64),
@@ -171,7 +174,7 @@ const place = z.union([
 ]);
 
 const meetup = meetupV9.extend({
-  place: place.nullable(),
+  place: placeDocument.nullable(),
 });
 
 const gymId = z.number().int().positive();
diff --git a/test/support/meetup-safety-cases.ts b/test/support/meetup-safety-cases.ts
new file mode 100644
index 00000000..a7b1d047
--- /dev/null
+++ b/test/support/meetup-safety-cases.ts
@@ -0,0 +1,363 @@
+import { expect, it } from 'vitest';
+import type { DroppedPin, KnownPlace } from '../../src/domain/geo/place.js';
+import type {
+  Decider,
+  MeetupSafetyStore,
+  NewMeetupAppeal,
+  NewMeetupRequest,
+} from '../../src/domain/meetups/records.js';
+
+export const SAFETY_SERVER = '412345678901234567';
+export const OTHER_SERVER = '412345678901234599';
+export const MAKER = '200000000000000002';
+export const MODERATOR = '200000000000000009';
+export const SAFETY_NOW = 1_792_000_000_000;
+const HOUR = 3_600_000;
+
+export const LIBRARY: KnownPlace = {
+  kind: 'stop',
+  id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90.16',
+  title: 'Little Free Library',
+  lat: 40.0601,
+  lon: -80.0601,
+  address: '12 Market Street',
+  image: 'https://lh3.googleusercontent.com/abc=s400',
+};
+
+export const SAFETY_PIN: DroppedPin = {
+  kind: 'pin',
+  lat: 40.02,
+  lon: -80.02,
+  near: { kind: 'stop', title: 'Fountain Square' },
+  linkName: 'Blue Tent',
+};
+
+/** A request id: a UUID with `n` at its end. */
+export function requestId(n: number): string {
+  return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
+}
+
+/** A request of `MAKER` in `SAFETY_SERVER`, made at `SAFETY_NOW`, for a start a day later. */
+export function newRequest(n: number, overrides: Partial<NewMeetupRequest> = {}): NewMeetupRequest {
+  return {
+    id: requestId(n),
+    serverId: SAFETY_SERVER,
+    regionChannelId: '100000000000000001',
+    makerId: MAKER,
+    makerName: 'Alice',
+    makerTeam: 'mystic',
+    place: LIBRARY,
+    name: 'Book swap',
+    startTime: SAFETY_NOW + 24 * HOUR,
+    description: 'Bring a book.\n\nTake a book.',
+    createdAt: SAFETY_NOW,
+    expiresAt: SAFETY_NOW + 23 * HOUR,
+    channelId: '600000000000000001',
+    messageId: `6000000000000${String(10_000 + n)}`,
+    ...overrides,
+  };
+}
+
+export function newAppeal(n: number, overrides: Partial<NewMeetupAppeal> = {}): NewMeetupAppeal {
+  return {
+    id: requestId(100 + n),
+    serverId: SAFETY_SERVER,
+    memberId: MAKER,
+    memberName: 'Alice',
+    text: 'It was a public library box.',
+    createdAt: SAFETY_NOW,
+    ...overrides,
+  };
+}
+
+export const MOD: Decider = { id: MODERATOR, name: 'Mod', at: SAFETY_NOW + HOUR };
+
+/**
+ * What meetup safety keeps, run against the repository and its twin in memory alike. `made`
+ * gives a fresh, empty store.
+ */
+export function meetupSafetyCases(made: () => Promise<MeetupSafetyStore>): void {
+  it('keeps a ruling per server and place, the later one in place of the earlier', async () => {
+    const store = await made();
+    const key = { kind: 'stop' as const, id: LIBRARY.id };
+    expect(await store.ruling(SAFETY_SERVER, key)).toBeUndefined();
+    await store.rule(SAFETY_SERVER, key, 'allow', MOD);
+    expect(await store.ruling(SAFETY_SERVER, key)).toBe('allow');
+    await store.rule(SAFETY_SERVER, key, 'refuse', { ...MOD, at: MOD.at + 1 });
+    expect(await store.ruling(SAFETY_SERVER, key)).toBe('refuse');
+    expect(await store.ruling(OTHER_SERVER, key)).toBeUndefined();
+    expect(
+      await store.ruling(SAFETY_SERVER, { kind: 'powerspot', id: LIBRARY.id }),
+    ).toBeUndefined();
+    await store.rule(SAFETY_SERVER, { kind: 'gym', id: '7' }, 'allow', MOD);
+    expect(await store.ruling(SAFETY_SERVER, { kind: 'gym', id: '7' })).toBe('allow');
+  });
+
+  it('blocks a member per server until the block is lifted, and blocks again afterwards', async () => {
+    const store = await made();
+    expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
+    expect(await store.addBlock(SAFETY_SERVER, MAKER, MOD)).toBe(true);
+    expect(await store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, id: MAKER, at: 1 })).toBe(false);
+    expect(await store.block(SAFETY_SERVER, MAKER)).toEqual({
+      serverId: SAFETY_SERVER,
+      memberId: MAKER,
+      blockedBy: MODERATOR,
+      blockedByName: 'Mod',
+      blockedAt: MOD.at,
+    });
+    expect(await store.block(OTHER_SERVER, MAKER)).toBeUndefined();
+    expect(await store.liftBlock(SAFETY_SERVER, MAKER, MOD)).toBe(true);
+    expect(await store.liftBlock(SAFETY_SERVER, MAKER, MOD)).toBe(false);
+    expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
+    const later = { ...MOD, at: MOD.at + HOUR, name: null };
+    expect(await store.addBlock(SAFETY_SERVER, MAKER, later)).toBe(true);
+    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({
+      blockedAt: later.at,
+      blockedByName: null,
+    });
+  });
+
+  it('keeps a request with its place, text and maker as they were given', async () => {
+    const store = await made();
+    const request = newRequest(1, { description: 'Zoë 🌲 <b>\nline two', place: SAFETY_PIN });
+    await store.addRequest(request);
+    expect(await store.request(requestId(1))).toEqual({
+      ...request,
+      status: 'pending',
+      decision: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+      partyId: null,
+    });
+    await store.addRequest(newRequest(2, { makerTeam: null, makerName: null }));
+    expect(await store.request(requestId(2))).toMatchObject({
+      makerTeam: null,
+      makerName: null,
+      place: LIBRARY,
+    });
+    expect(await store.request(requestId(3))).toBeUndefined();
+    expect(await store.request(requestId(1))).toMatchObject({
+      channelId: '600000000000000001',
+      messageId: '600000000000010001',
+    });
+  });
+
+  it('decides a pending request once: the first decision wins', async () => {
+    const store = await made();
+    await store.addRequest(newRequest(1));
+    expect(await store.decideRequest(requestId(1), 'approved', 'approve', MOD)).toBe(true);
+    expect(
+      await store.decideRequest(requestId(1), 'refused', 'refuse', { ...MOD, id: MAKER }),
+    ).toBe(false);
+    expect(await store.request(requestId(1))).toMatchObject({
+      status: 'approved',
+      decision: 'approve',
+      decidedBy: MODERATOR,
+      decidedByName: 'Mod',
+      decidedAt: MOD.at,
+    });
+    expect(await store.settleApproval(requestId(1), { partyId: PARTY })).toBe(true);
+    expect(await store.request(requestId(1))).toMatchObject({
+      status: 'approved',
+      partyId: PARTY,
+    });
+    await store.addRequest(newRequest(2));
+    await store.decideRequest(requestId(2), 'approved', 'approve-once', MOD);
+    expect(await store.settleApproval(requestId(2), 'failed')).toBe(true);
+    expect(await store.request(requestId(2))).toMatchObject({ status: 'failed', partyId: null });
+    expect(await store.decideRequest(requestId(9), 'refused', 'refuse', MOD)).toBe(false);
+  });
+
+  it('expires and withdraws without a decider', async () => {
+    const store = await made();
+    await store.addRequest(newRequest(1));
+    expect(await store.decideRequest(requestId(1), 'expired', null, null)).toBe(true);
+    expect(await store.request(requestId(1))).toMatchObject({
+      status: 'expired',
+      decision: null,
+      decidedBy: null,
+      decidedAt: null,
+    });
+  });
+
+  it('lists a member’s pending requests per server, and those whose time is up', async () => {
+    const store = await made();
+    await store.addRequest(newRequest(1, { expiresAt: SAFETY_NOW + 2 * HOUR }));
+    await store.addRequest(
+      newRequest(2, { createdAt: SAFETY_NOW + 1, expiresAt: SAFETY_NOW + HOUR }),
+    );
+    await store.addRequest(newRequest(3, { serverId: OTHER_SERVER, expiresAt: SAFETY_NOW }));
+    await store.addRequest(newRequest(4, { makerId: MODERATOR }));
+    await store.addRequest(newRequest(5));
+    await store.decideRequest(requestId(5), 'refused', 'refuse', MOD);
+    expect((await store.pendingOf(SAFETY_SERVER, MAKER)).map((one) => one.id)).toEqual([
+      requestId(1),
+      requestId(2),
+    ]);
+    expect((await store.duePending(SAFETY_NOW + HOUR)).map((one) => one.id)).toEqual([
+      requestId(3),
+      requestId(2),
+    ]);
+    expect(await store.duePending(SAFETY_NOW - 1)).toEqual([]);
+  });
+
+  it('keeps one open appeal per member and server, and when a block was last kept', async () => {
+    const store = await made();
+    expect(await store.addAppeal(newAppeal(1))).toBe('added');
+    expect(await store.addAppeal(newAppeal(2))).toBe('open');
+    expect(await store.addAppeal(newAppeal(3, { serverId: OTHER_SERVER }))).toBe('added');
+    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toMatchObject({
+      id: requestId(101),
+      status: 'open',
+      text: 'It was a public library box.',
+      memberName: 'Alice',
+      channelId: null,
+    });
+    await store.setAppealPost(requestId(101), '600000000000000001', '600000000000000003');
+    expect(await store.appeal(requestId(101))).toMatchObject({ messageId: '600000000000000003' });
+    expect(await store.lastKept(SAFETY_SERVER, MAKER)).toBeUndefined();
+    expect(await store.decideAppeal(requestId(101), 'kept', MOD)).toBe(true);
+    expect(await store.decideAppeal(requestId(101), 'lifted', MOD)).toBe(false);
+    expect(await store.appeal(requestId(101))).toMatchObject({
+      status: 'kept',
+      decidedBy: MODERATOR,
+      decidedByName: 'Mod',
+      decidedAt: MOD.at,
+    });
+    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toBeUndefined();
+    expect(await store.lastKept(SAFETY_SERVER, MAKER)).toBe(MOD.at);
+    expect(await store.addAppeal(newAppeal(4))).toBe('added');
+    await store.discardAppeal(requestId(104));
+    expect(await store.appeal(requestId(104))).toBeUndefined();
+    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toBeUndefined();
+    expect(await store.addAppeal(newAppeal(5))).toBe('added');
+  });
+
+  it('expires an open appeal without a decider, and lists those that are stale', async () => {
+    const store = await made();
+    // Never posted, made long enough ago; posted, made long ago; posted and recent; another's.
+    await store.addAppeal(newAppeal(1, { createdAt: SAFETY_NOW - 10 * HOUR }));
+    await store.addAppeal(
+      newAppeal(2, { memberId: MODERATOR, createdAt: SAFETY_NOW - 9 * 24 * HOUR }),
+    );
+    await store.setAppealPost(requestId(102), '600000000000000001', '600000000000000003');
+    await store.addAppeal(newAppeal(3, { serverId: OTHER_SERVER }));
+    await store.setAppealPost(requestId(103), '600000000000000001', '600000000000000004');
+    const stale = { unpostedBefore: SAFETY_NOW - HOUR, openedBefore: SAFETY_NOW - 7 * 24 * HOUR };
+    expect((await store.staleAppeals(stale)).map((one) => one.id)).toEqual([
+      requestId(102),
+      requestId(101),
+    ]);
+    expect(await store.decideAppeal(requestId(101), 'expired', null)).toBe(true);
+    expect(await store.decideAppeal(requestId(101), 'kept', MOD)).toBe(false);
+    expect(await store.appeal(requestId(101))).toMatchObject({
+      status: 'expired',
+      decidedBy: null,
+      decidedAt: null,
+    });
+    expect(await store.openAppeal(SAFETY_SERVER, MAKER)).toBeUndefined();
+    expect(await store.lastKept(SAFETY_SERVER, MAKER)).toBeUndefined();
+    expect(await store.addAppeal(newAppeal(4))).toBe('added');
+    expect((await store.staleAppeals(stale)).map((one) => one.id)).toEqual([requestId(102)]);
+  });
+
+  it('lifts a block on an open appeal in one step, once', async () => {
+    const store = await made();
+    await store.addBlock(SAFETY_SERVER, MAKER, MOD);
+    await store.addAppeal(newAppeal(1));
+    const appeal = { id: requestId(101), serverId: SAFETY_SERVER, memberId: MAKER };
+    const later = { ...MOD, at: MOD.at + HOUR };
+    expect(await store.liftOnAppeal(appeal, later)).toBe(true);
+    expect(await store.block(SAFETY_SERVER, MAKER)).toBeUndefined();
+    expect(await store.appeal(requestId(101))).toMatchObject({
+      status: 'lifted',
+      decidedBy: MODERATOR,
+      decidedAt: later.at,
+    });
+    // Decided already: a block made since stands.
+    await store.addBlock(SAFETY_SERVER, MAKER, { ...MOD, at: MOD.at + 2 * HOUR });
+    expect(await store.liftOnAppeal(appeal, { ...MOD, at: MOD.at + 3 * HOUR })).toBe(false);
+    expect(await store.block(SAFETY_SERVER, MAKER)).toBeDefined();
+    // Kept before it was lifted: nothing lifted.
+    await store.addAppeal(newAppeal(2));
+    await store.decideAppeal(requestId(102), 'kept', MOD);
+    expect(
+      await store.liftOnAppeal(
+        { ...appeal, id: requestId(102) },
+        { ...MOD, at: MOD.at + 4 * HOUR },
+      ),
+    ).toBe(false);
+    expect(await store.block(SAFETY_SERVER, MAKER)).toBeDefined();
+  });
+
+  it('blocks the maker of a pending request and refuses it in one step, once', async () => {
+    const store = await made();
+    await store.addRequest(newRequest(1));
+    await store.addRequest(newRequest(2));
+    expect(await store.blockMaker(newRequest(1), MOD)).toEqual({ decided: true, newBlock: true });
+    expect(await store.request(requestId(1))).toMatchObject({
+      status: 'refused',
+      decision: 'block',
+      decidedBy: MODERATOR,
+    });
+    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({ blockedAt: MOD.at });
+    // A second press on the same request: decided before, nobody blocked by it.
+    expect(await store.blockMaker(newRequest(1), { ...MOD, at: MOD.at + 1 })).toEqual({
+      decided: false,
+      newBlock: false,
+    });
+    // Another request of the blocked maker: refused, the block stands as it was.
+    expect(await store.blockMaker(newRequest(2), { ...MOD, at: MOD.at + 2 })).toEqual({
+      decided: true,
+      newBlock: false,
+    });
+    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({ blockedAt: MOD.at });
+    // Lifted, the maker is blocked anew by a later request.
+    await store.liftBlock(SAFETY_SERVER, MAKER, MOD);
+    await store.addRequest(newRequest(3));
+    expect(await store.blockMaker(newRequest(3), { ...MOD, at: MOD.at + 3 })).toEqual({
+      decided: true,
+      newBlock: true,
+    });
+    expect(await store.block(SAFETY_SERVER, MAKER)).toMatchObject({ blockedAt: MOD.at + 3 });
+    // A request that is gone blocks nobody.
+    expect(
+      await store.blockMaker(newRequest(9, { makerId: MODERATOR }), { ...MOD, at: MOD.at + 4 }),
+    ).toEqual({ decided: false, newBlock: false });
+    expect(await store.block(SAFETY_SERVER, MODERATOR)).toBeUndefined();
+  });
+
+  it('settles an approval once, and lists the approvals that never got their meetup', async () => {
+    const store = await made();
+    for (const n of [1, 2, 3, 4]) {
+      await store.addRequest(newRequest(n));
+      await store.decideRequest(requestId(n), 'approved', 'approve-once', {
+        ...MOD,
+        at: MOD.at + n,
+      });
+    }
+    await store.addRequest(newRequest(5));
+    expect(await store.strandedApprovals(MOD.at + 3)).toEqual([
+      expect.objectContaining({ id: requestId(1), status: 'approved', partyId: null }),
+      expect.objectContaining({ id: requestId(2) }),
+      expect.objectContaining({ id: requestId(3) }),
+    ]);
+    expect(await store.settleApproval(requestId(1), 'withdrawn')).toBe(true);
+    expect(await store.settleApproval(requestId(1), 'failed')).toBe(false);
+    expect(await store.request(requestId(1))).toMatchObject({
+      status: 'withdrawn',
+      decision: 'approve-once',
+    });
+    expect(await store.settleApproval(requestId(2), { partyId: PARTY })).toBe(true);
+    expect(await store.settleApproval(requestId(2), 'failed')).toBe(false);
+    expect(await store.request(requestId(2))).toMatchObject({ status: 'approved', partyId: PARTY });
+    expect(await store.settleApproval(requestId(5), 'failed')).toBe(false);
+    expect((await store.strandedApprovals(MOD.at + 4)).map((one) => one.id)).toEqual([
+      requestId(3),
+      requestId(4),
+    ]);
+  });
+}
+
+const PARTY = '00000000-0000-4000-8000-00000000aaaa';
diff --git a/test/support/meetup-safety.test.ts b/test/support/meetup-safety.test.ts
new file mode 100644
index 00000000..4da2ab4c
--- /dev/null
+++ b/test/support/meetup-safety.test.ts
@@ -0,0 +1,7 @@
+import { describe } from 'vitest';
+import { meetupSafetyCases } from './meetup-safety-cases.js';
+import { MemoryMeetupSafety } from './meetup-safety.js';
+
+describe('MemoryMeetupSafety', () => {
+  meetupSafetyCases(() => Promise.resolve(new MemoryMeetupSafety()));
+});
diff --git a/test/support/meetup-safety.ts b/test/support/meetup-safety.ts
new file mode 100644
index 00000000..85bff5b3
--- /dev/null
+++ b/test/support/meetup-safety.ts
@@ -0,0 +1,289 @@
+import type {
+  ApprovalOutcome,
+  AppealStatus,
+  Decider,
+  MeetupAppeal,
+  MeetupBlock,
+  MeetupRequestRecord,
+  MeetupSafetyStore,
+  NewMeetupAppeal,
+  NewMeetupRequest,
+  RequestDecision,
+  RequestStatus,
+} from '../../src/domain/meetups/records.js';
+import type { PlaceRuling, RulingKey } from '../../src/domain/meetups/safety.js';
+
+/** A block as it is kept: while it stands, and who lifted it last once lifted. */
+type KeptBlock = MeetupBlock & {
+  liftedBy: string | null;
+  liftedByName: string | null;
+  liftedAt: number | null;
+};
+
+/**
+ * `MeetupSafetyRepository` in memory, for tests: the same answers (`meetupSafetyCases` runs on
+ * both). `failing` makes every method of that name reject.
+ */
+export class MemoryMeetupSafety implements MeetupSafetyStore {
+  readonly rulings = new Map<string, PlaceRuling>();
+  readonly blocks = new Map<string, KeptBlock>();
+  readonly requests = new Map<string, MeetupRequestRecord>();
+  readonly appeals = new Map<string, MeetupAppeal>();
+  readonly failing = new Set<keyof MeetupSafetyStore>();
+
+  private check(method: keyof MeetupSafetyStore): Promise<void> {
+    return this.failing.has(method)
+      ? Promise.reject(new Error(`the database refused ${method}`))
+      : Promise.resolve();
+  }
+
+  async ruling(serverId: string, key: RulingKey) {
+    await this.check('ruling');
+    return this.rulings.get(`${serverId} ${key.kind} ${key.id}`);
+  }
+
+  async rule(serverId: string, key: RulingKey, ruling: PlaceRuling, _by: Decider) {
+    await this.check('rule');
+    this.rulings.set(`${serverId} ${key.kind} ${key.id}`, ruling);
+  }
+
+  async block(serverId: string, memberId: string) {
+    await this.check('block');
+    const found = this.blocks.get(`${serverId} ${memberId}`);
+    if (!found || found.liftedAt !== null) return undefined;
+    const { liftedBy: _by, liftedByName: _name, liftedAt: _at, ...block } = found;
+    return block;
+  }
+
+  async addBlock(serverId: string, memberId: string, by: Decider) {
+    await this.check('addBlock');
+    return this.blockNow(serverId, memberId, by);
+  }
+
+  private blockNow(serverId: string, memberId: string, by: Decider): boolean {
+    const key = `${serverId} ${memberId}`;
+    const found = this.blocks.get(key);
+    if (found && found.liftedAt === null) return false;
+    this.blocks.set(key, {
+      serverId,
+      memberId,
+      blockedBy: by.id,
+      blockedByName: by.name,
+      blockedAt: by.at,
+      liftedBy: null,
+      liftedByName: null,
+      liftedAt: null,
+    });
+    return true;
+  }
+
+  async blockMaker(request: Pick<MeetupRequestRecord, 'id' | 'serverId' | 'makerId'>, by: Decider) {
+    await this.check('blockMaker');
+    const found = this.requests.get(request.id);
+    if (!found || found.status !== 'pending') return { decided: false, newBlock: false };
+    this.requests.set(request.id, {
+      ...found,
+      status: 'refused',
+      decision: 'block',
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    });
+    return { decided: true, newBlock: this.blockNow(request.serverId, request.makerId, by) };
+  }
+
+  async liftBlock(serverId: string, memberId: string, by: Decider) {
+    await this.check('liftBlock');
+    const found = this.blocks.get(`${serverId} ${memberId}`);
+    if (!found || found.liftedAt !== null) return false;
+    found.liftedBy = by.id;
+    found.liftedByName = by.name;
+    found.liftedAt = by.at;
+    return true;
+  }
+
+  async liftOnAppeal(appeal: Pick<MeetupAppeal, 'id' | 'serverId' | 'memberId'>, by: Decider) {
+    await this.check('liftOnAppeal');
+    const found = this.appeals.get(appeal.id);
+    if (!found || found.status !== 'open') return false;
+    this.appeals.set(appeal.id, {
+      ...found,
+      status: 'lifted',
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    });
+    const block = this.blocks.get(`${appeal.serverId} ${appeal.memberId}`);
+    if (block && block.liftedAt === null) {
+      block.liftedBy = by.id;
+      block.liftedByName = by.name;
+      block.liftedAt = by.at;
+    }
+    return true;
+  }
+
+  async addRequest(request: NewMeetupRequest) {
+    await this.check('addRequest');
+    this.requests.set(request.id, {
+      ...structuredClone(request),
+      status: 'pending',
+      decision: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+      partyId: null,
+    });
+  }
+
+  async request(id: string) {
+    await this.check('request');
+    const found = this.requests.get(id);
+    return found && structuredClone(found);
+  }
+
+  async decideRequest(
+    id: string,
+    status: Exclude<RequestStatus, 'pending' | 'failed'>,
+    decision: RequestDecision | null,
+    by: Decider | null,
+  ) {
+    await this.check('decideRequest');
+    const found = this.requests.get(id);
+    if (!found || found.status !== 'pending') return false;
+    this.requests.set(id, {
+      ...found,
+      status,
+      decision,
+      decidedBy: by?.id ?? null,
+      decidedByName: by?.name ?? null,
+      decidedAt: by?.at ?? null,
+    });
+    return true;
+  }
+
+  async settleApproval(id: string, outcome: ApprovalOutcome) {
+    await this.check('settleApproval');
+    const found = this.requests.get(id);
+    if (!found || found.status !== 'approved' || found.partyId !== null) return false;
+    this.requests.set(
+      id,
+      typeof outcome === 'string'
+        ? { ...found, status: outcome }
+        : { ...found, partyId: outcome.partyId },
+    );
+    return true;
+  }
+
+  async strandedApprovals(decidedBefore: number) {
+    await this.check('strandedApprovals');
+    return this.sorted(
+      (one) =>
+        one.status === 'approved' &&
+        one.partyId === null &&
+        one.decidedAt !== null &&
+        one.decidedAt <= decidedBefore,
+    );
+  }
+
+  async pendingOf(serverId: string, makerId: string) {
+    await this.check('pendingOf');
+    return this.sorted(
+      (one) => one.serverId === serverId && one.makerId === makerId && one.status === 'pending',
+    );
+  }
+
+  async duePending(now: number) {
+    await this.check('duePending');
+    return this.sorted((one) => one.status === 'pending' && one.expiresAt <= now);
+  }
+
+  private sorted(which: (request: MeetupRequestRecord) => boolean): MeetupRequestRecord[] {
+    return [...this.requests.values()]
+      .filter(which)
+      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
+      .map((one) => structuredClone(one));
+  }
+
+  async addAppeal(appeal: NewMeetupAppeal) {
+    await this.check('addAppeal');
+    const open = [...this.appeals.values()].some(
+      (one) =>
+        one.serverId === appeal.serverId &&
+        one.memberId === appeal.memberId &&
+        one.status === 'open',
+    );
+    if (open) return 'open' as const;
+    this.appeals.set(appeal.id, {
+      ...appeal,
+      status: 'open',
+      channelId: null,
+      messageId: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+    });
+    return 'added' as const;
+  }
+
+  async discardAppeal(id: string) {
+    await this.check('discardAppeal');
+    this.appeals.delete(id);
+  }
+
+  async setAppealPost(id: string, channelId: string, messageId: string) {
+    await this.check('setAppealPost');
+    const found = this.appeals.get(id);
+    if (found) this.appeals.set(id, { ...found, channelId, messageId });
+  }
+
+  async appeal(id: string) {
+    await this.check('appeal');
+    const found = this.appeals.get(id);
+    return found && { ...found };
+  }
+
+  async openAppeal(serverId: string, memberId: string) {
+    await this.check('openAppeal');
+    const found = [...this.appeals.values()].find(
+      (one) => one.serverId === serverId && one.memberId === memberId && one.status === 'open',
+    );
+    return found && { ...found };
+  }
+
+  async lastKept(serverId: string, memberId: string) {
+    await this.check('lastKept');
+    const times = [...this.appeals.values()]
+      .filter(
+        (one) => one.serverId === serverId && one.memberId === memberId && one.status === 'kept',
+      )
+      .map((one) => one.decidedAt ?? 0);
+    return times.length === 0 ? undefined : Math.max(...times);
+  }
+
+  async decideAppeal(id: string, status: Exclude<AppealStatus, 'open'>, by: Decider | null) {
+    await this.check('decideAppeal');
+    const found = this.appeals.get(id);
+    if (!found || found.status !== 'open') return false;
+    this.appeals.set(id, {
+      ...found,
+      status,
+      decidedBy: by?.id ?? null,
+      decidedByName: by?.name ?? null,
+      decidedAt: by?.at ?? null,
+    });
+    return true;
+  }
+
+  async staleAppeals(stale: { unpostedBefore: number; openedBefore: number }) {
+    await this.check('staleAppeals');
+    return [...this.appeals.values()]
+      .filter(
+        (one) =>
+          one.status === 'open' &&
+          ((one.messageId === null && one.createdAt <= stale.unpostedBefore) ||
+            one.createdAt <= stale.openedBefore),
+      )
+      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
+      .map((one) => ({ ...one }));
+  }
+}
````

### Task 3: Plan 8S-1 T3: Meetup safety: /meetup asks for place, start and information, and holds a place for the moderators

Prototype commit: `df25363a3250b0cdadf6c108fc616003f81111ba`

/meetup takes name, near and start (all required) and opens the form of
the information (as /info asks for it; what the command was used with
is kept for half an hour under the form's token). Its guards read the
place, the start and the check of the place, so that a refusal does not
count: a place refused for good, a blocked member, a start too soon for
the moderators. On the form's submit an allowed place makes the meetup
with its start and information at once (createMeetup takes them: one
post, nothing announced); a place that needs approval is stored as a
request and posted in the moderators' channel (MeetupSafety.submit;
nothing kept when that fails), and the member is told they will hear by
DM. Staff skip the check. A UserError may carry a message of its own,
which the router shows privately.

**Files:**

```
 src/app-context.ts                        |   6 +
 src/app.ts                                |  18 ++-
 src/commands/meetups/info.ts              |  44 ++++--
 src/commands/meetups/meetup.test.ts       | 429 ++++++++++++++++++++++++++++++++++++--------------
 src/commands/meetups/meetup.ts            | 340 ++++++++++++++++++++++++++++++++-------
 src/commands/parties/timed.ts             |   3 +-
 src/components/index.ts                   |   2 +
 src/discord/custom-id.ts                  |   4 +
 src/discord/errors.ts                     |  13 +-
 src/discord/router.test.ts                |  46 ++++++
 src/discord/router.ts                     |  15 +-
 src/domain/party/meetup.test.ts           |  21 +++
 src/domain/party/meetup.ts                |  57 +++++--
 src/render/meetup-safety.test.ts          | 106 +++++++++++++
 src/render/meetup-safety.ts               | 169 ++++++++++++++++++++
 src/services/meetup-safety.test.ts        | 176 +++++++++++++++++++++
 src/services/meetup-safety.ts             | 195 +++++++++++++++++++++++
 src/services/party-service.meetup.test.ts |  27 ++++
 src/services/party-service.ts             |  29 +++-
 src/services/rehearsal.test.ts            |  34 ++++
 src/services/rehearsal.ts                 |  31 +++-
 test/support/meetup-safety-service.ts     |  50 ++++++
 test/support/test-context.ts              |  17 ++
 23 files changed, 1610 insertions(+), 222 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/commands/meetups/meetup.test.ts src/discord/router.test.ts src/domain/party/meetup.test.ts src/render/meetup-safety.test.ts src/services/meetup-safety.test.ts src/services/party-service.meetup.test.ts src/services/rehearsal.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff df25363a3250b0cdadf6c108fc616003f81111ba -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8s1-meetup-safety.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-1 T3: Meetup safety: /meetup asks for place, start and information, and holds a place for the moderators`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 2c4d3dbc..82c91aef 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -43,6 +43,7 @@ import type { WayspotProvider } from './services/wayspot-directory.js';
 import type { Rehearsal } from './services/rehearsal.js';
 import type { LegacyCleanup } from './services/legacy-cleanup.js';
 import type { LoginLinks } from './web/login-links.js';
+import type { MeetupSafety } from './services/meetup-safety.js';
 
 /** Everything a handler may use. Later phases add services here. */
 export interface AppContext {
@@ -91,6 +92,11 @@ export interface AppContext {
   readonly attendance: AttendanceService;
   /** What members change about a raid itself: times, length, boss, moves, gym. */
   readonly raids: RaidChangeService;
+  /**
+   * Meetup safety (plan 8S-1): the check of a meetup's place, the requests held for the
+   * moderators and their decisions, blocks and appeals. Off without `settings.channels.moderation`.
+   */
+  readonly meetupSafety: MeetupSafety;
   /** What members change about a meetup or a train: its name, its times, what a meetup says. */
   readonly timedParties: TimedPartyService;
   /** What members change about a train as such: its route, where it is, its conductor, its boss. */
diff --git a/src/app.ts b/src/app.ts
index c5f0f123..f7b8dcb9 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -32,6 +32,7 @@ import { UserRepository } from './db/repositories/user-repository.js';
 import { WayfarerRepository } from './db/repositories/wayfarer-repository.js';
 import { WayspotRepository } from './db/repositories/wayspot-repository.js';
 import { WebSessionRepository } from './db/repositories/web-session-repository.js';
+import { MeetupSafetyRepository } from './db/repositories/meetup-safety-repository.js';
 import type { DB } from './db/types.js';
 import { ClickAnswers } from './discord/click-answers.js';
 import { createClient, loginWithFallback } from './discord/client.js';
@@ -93,6 +94,7 @@ import { WayfarerReviewService } from './services/wayfarer-review-service.js';
 import { RegionDirectory } from './services/region-directory.js';
 import { SelfRoleService } from './services/self-role-service.js';
 import { SpawnService } from './services/spawn-service.js';
+import { MeetupSafety } from './services/meetup-safety.js';
 import { StaticMaps } from './services/static-maps.js';
 import { LegacyCleanup } from './services/legacy-cleanup.js';
 import {
@@ -246,7 +248,8 @@ export async function startApp(
   });
   const parties = new PartyStore({ storage: partyRepository, log, history: partyHistory });
   const discordGateway = new DiscordPartyGateway(log);
-  // In rehearsal mode nothing is posted but into the posts of parties in the rehearsed forums.
+  // In rehearsal mode nothing is posted but into the posts of parties in the rehearsed forums
+  // and the moderators' posts of meetup safety into their channel.
   const partyGateway = rehearsal
     ? rehearsalGateway(
         discordGateway,
@@ -255,6 +258,10 @@ export async function startApp(
           byPost: (postId) => parties.byPost(postId),
           regions: () => regions.all(),
           channelName: (channelId) => discordGateway.channelName(channelId),
+          channelKind: (channelId) => discordGateway.channelKind(channelId),
+          ...(config.settings.channels.moderation === undefined
+            ? {}
+            : { moderationChannel: config.settings.channels.moderation }),
         }),
         log,
       )
@@ -554,6 +561,14 @@ export async function startApp(
     log,
   });
   const clickAnswers = new ClickAnswers({ log });
+  // Meetup safety (plan 8S-1): off without settings.channels.moderation.
+  const meetupSafety = new MeetupSafety({
+    storage: new MeetupSafetyRepository(db, log),
+    gateway: partyGateway,
+    gyms,
+    settings: config.settings,
+    log,
+  });
   // The client that ended up connected, for what talks to Discord's REST API through it.
   let liveClient: Client | undefined;
   const legacyCleanup = new LegacyCleanup({
@@ -621,6 +636,7 @@ export async function startApp(
     attendance,
     raids,
     timedParties,
+    meetupSafety,
     trains,
     clickAnswers,
     users,
diff --git a/src/commands/meetups/info.ts b/src/commands/meetups/info.ts
index 15381b20..c233a6ac 100644
--- a/src/commands/meetups/info.ts
+++ b/src/commands/meetups/info.ts
@@ -32,21 +32,39 @@ export function infoForm(party: MeetupParty): APIModalInteractionResponseCallbac
   return {
     custom_id: encodeCustomId({ kind: INFO_KIND, id: party.id, action: 'set' }),
     title: 'About this meetup',
+    components: [
+      infoInput({
+        required: false,
+        placeholder: 'Where to meet, what to bring. Leave it empty to remove what is there.',
+        value: party.meetup.description,
+      }),
+    ],
+  };
+}
+
+/**
+ * The one input of a meetup's information, as `/info` and `/meetup` ask for it: a paragraph of
+ * at most `MAX_MEETUP_DESCRIPTION` characters (at least one where it is required), labelled
+ * "Information", with `value` in it.
+ */
+export function infoInput(input: {
+  required: boolean;
+  placeholder: string;
+  value?: string | null;
+}): APIModalInteractionResponseCallbackData['components'][number] {
+  return {
+    type: ComponentType.ActionRow,
     components: [
       {
-        type: ComponentType.ActionRow,
-        components: [
-          {
-            type: ComponentType.TextInput,
-            custom_id: INFO_INPUT,
-            label: 'Information',
-            style: TextInputStyle.Paragraph,
-            required: false,
-            max_length: MAX_MEETUP_DESCRIPTION,
-            placeholder: 'Where to meet, what to bring. Leave it empty to remove what is there.',
-            ...(party.meetup.description === null ? {} : { value: party.meetup.description }),
-          },
-        ],
+        type: ComponentType.TextInput,
+        custom_id: INFO_INPUT,
+        label: 'Information',
+        style: TextInputStyle.Paragraph,
+        required: input.required,
+        ...(input.required ? { min_length: 1 } : {}),
+        max_length: MAX_MEETUP_DESCRIPTION,
+        placeholder: input.placeholder,
+        ...(input.value === undefined || input.value === null ? {} : { value: input.value }),
       },
     ],
   };
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index d5329cff..e370d2c6 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -1,7 +1,8 @@
 import { MessageFlags } from 'discord.js';
-import { describe, expect, it } from 'vitest';
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
   fakeChatInput,
+  fakeModal,
   sent,
   type FakeInteraction,
 } from '../../../test/support/fake-interactions.js';
@@ -12,63 +13,143 @@ import {
   WEST_CHANNEL,
   WEST_FORUM,
 } from '../../../test/support/gyms.js';
-import { ALICE, BOB, testRaid } from '../../../test/support/parties.js';
-import { partyServiceWith } from '../../../test/support/party-service.js';
+import { MOD } from '../../../test/support/meetup-safety-cases.js';
+import {
+  MOD_CHANNEL,
+  meetupSafetyWith,
+  type SafetyOptions,
+} from '../../../test/support/meetup-safety-service.js';
+import { textDisplays, textOf } from '../../../test/support/messages.js';
+import { ALICE, BOB, MINUTE, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
+import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
+import { wayspotsWith } from '../../../test/support/wayspots.js';
 import type { AppContext } from '../../app-context.js';
 import { InteractionRouter } from '../../discord/router.js';
+import { MAX_MEETUP_DESCRIPTION } from '../../domain/party/party.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { commands } from '../index.js';
-import { FROM_A_REGION, meetup, MEETUP_THROTTLE } from './meetup.js';
-import { textDisplays } from '../../../test/support/messages.js';
-import { keptRow, wayspotId } from '../../../test/support/wayspot-cases.js';
-import { wayspotsWith } from '../../../test/support/wayspots.js';
+import { INFO_INPUT } from './info.js';
+import {
+  FROM_A_REGION,
+  MEETUP_HELD,
+  MEETUP_NOT_SENT,
+  MEETUP_THROTTLE,
+  MEETUP_TOO_SOON,
+  NO_INFORMATION,
+  NO_MEETUP_HERE,
+  NO_MEETUPS_FOR_YOU,
+  meetup,
+  meetupFormControls,
+} from './meetup.js';
 
 const RAID_POST = '300000000000000055';
+const HOUR = 60 * MINUTE;
+/** A start the fixtures' clock reads as six in the evening of its day. */
+const SIX_PM = PARTY_NOW + 4 * HOUR;
 
-async function setup(overrides: Partial<AppContext> = {}) {
+beforeEach(() => {
+  vi.useFakeTimers({ toFake: ['Date'] });
+  vi.setSystemTime(PARTY_NOW);
+});
+afterEach(() => {
+  vi.useRealTimers();
+});
+
+async function setup(
+  overrides: Partial<AppContext> = {},
+  safety: SafetyOptions = { moderation: null },
+) {
   const raid = { ...testRaid(), forumChannelId: WEST_FORUM, forumPostId: RAID_POST };
-  const made = await partyServiceWith([raid]);
+  const made = await meetupSafetyWith(safety, [raid]);
   const { ctx } = createTestContext({
     partyService: made.service,
     attendance: made.attendance,
     timedParties: made.timed,
     parties: made.store,
     regions: made.regions,
+    meetupSafety: made.safety,
     ...overrides,
   });
-  const router = new InteractionRouter(ctx, [meetup], []);
-  /** `/meetup` by Alice, in the channel of West unless `extra` says otherwise. */
-  const run = async (name: string, extra: object = {}): Promise<FakeInteraction> => {
+  const router = new InteractionRouter(ctx, [meetup], [meetupFormControls]);
+  /** `/meetup` by Alice in the channel of West, near the fountain, at six, unless `extra` says otherwise. */
+  const command = async (name: string, extra: object = {}): Promise<FakeInteraction> => {
+    const { options, ...rest } = extra as { options?: object };
     const interaction = fakeChatInput({
       commandName: 'meetup',
       channelId: WEST_CHANNEL,
       userId: ALICE,
       displayName: 'Alice',
       roleNames: ['Mystic'],
-      options: { name },
+      ...rest,
+      options: { name, near: 'gym:2', start: '6pm', ...options },
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  /** The form `/meetup` opened, sent with `text`; undefined when it opened none. */
+  const submit = async (
+    used: FakeInteraction,
+    text = 'Bring snacks.',
+    extra: object = {},
+  ): Promise<FakeInteraction | undefined> => {
+    if (used.showModal.mock.calls.length === 0) return undefined;
+    const form = used.showModal.mock.calls[0]?.[0] as { custom_id: string };
+    const interaction = fakeModal({
+      customId: form.custom_id,
+      form,
+      fields: { [INFO_INPUT]: text },
+      channelId: WEST_CHANNEL,
+      userId: ALICE,
+      displayName: 'Alice',
+      roleNames: ['Mystic'],
+      modalFromCommand: true,
       ...extra,
     });
     await router.handle(interaction as never);
     return interaction;
   };
-  /** What the member was told: the edit of the deferred answer, or what came in its place. */
-  const answer = async (name: string, extra: object = {}): Promise<string | undefined> => {
-    const used = await run(name, extra);
-    for (const responder of [used.editReply, used.followUp, used.reply]) {
-      if (responder.mock.calls.length > 0) return sent(responder).content;
-    }
-    return undefined;
+  /** `/meetup` and its form: what the member was told last. */
+  const run = async (name: string, extra: object = {}, text?: string) => {
+    const used = await command(name, extra);
+    const submitted = await submit(
+      used,
+      text,
+      pick(extra, ['userId', 'roleNames', 'channelId', 'thread']),
+    );
+    return { used, submitted, told: told(submitted ?? used) };
   };
   const meetups = () => made.store.active().filter((party) => party.type === 'meetup');
-  return { ...made, ctx, run, answer, meetups };
+  return { ...made, ctx, command, submit, run, meetups };
+}
+
+function pick(from: object, keys: readonly string[]): object {
+  return Object.fromEntries(Object.entries(from).filter(([key]) => keys.includes(key)));
+}
+
+/** What a member was told last: an edit of the deferred answer, a follow-up or a reply. */
+function told(used: FakeInteraction): string | undefined {
+  for (const responder of [used.followUp, used.editReply, used.reply]) {
+    if (responder.mock.calls.length > 0) {
+      const payload = sent(responder);
+      return payload.content ?? textOf({ v2: true, components: payload.components as never });
+    }
+  }
+  return undefined;
 }
 
 describe('/meetup', () => {
-  it('makes a meetup with its post in the forum of the region, and links to it privately', async () => {
+  it('asks for the information in a form and makes the meetup with all of it in one post', async () => {
     const made = await setup();
-    const used = await made.run('  Community Day   picnic ');
+    const { used, submitted } = await made.run('  Community Day   picnic ');
+    // The form: the information, required, as /info asks for it.
+    const form = used.showModal.mock.calls[0]?.[0] as { title: string; components: unknown[] };
+    expect(form.title).toBe('About this meetup');
+    expect(JSON.stringify(form.components)).toContain(
+      `"custom_id":"${INFO_INPUT}","label":"Information","style":2,"required":true,"min_length":1,"max_length":${MAX_MEETUP_DESCRIPTION}`,
+    );
+    expect(used.deferReply).not.toHaveBeenCalled();
     const [party] = made.meetups();
     expect(party).toMatchObject({
       type: 'meetup',
@@ -76,38 +157,40 @@ describe('/meetup', () => {
       forumChannelId: WEST_FORUM,
       createdById: ALICE,
       anonymous: false,
-      timed: { name: 'Community Day picnic', startTime: null },
-      meetup: { description: null },
+      timed: { name: 'Community Day picnic', startTime: SIX_PM },
+      meetup: { description: 'Bring snacks.', place: { kind: 'gym', id: '2' } },
     });
-    // Who made it is interested, whatever their automatic status for raids.
-    expect(party?.attendees).toEqual({
-      [ALICE]: {
-        number: 1,
-        status: PartyStatus.Interested,
-        group: 'A',
-        remote: false,
-        name: 'Alice',
-        team: 'mystic',
-      },
+    expect(party?.attendees[ALICE]).toMatchObject({
+      status: PartyStatus.Interested,
+      team: 'mystic',
     });
     const postId = party?.forumPostId ?? '';
     expect(made.gateway.posts.get(postId)).toMatchObject({
       forumId: WEST_FORUM,
       title: 'Meetup · Community Day picnic',
+      edits: 0,
     });
-    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
-    expect(sent(used.editReply).content).toBe(
-      `Your meetup is made. Its post is <#${postId}>. There, \`/meet\` sets when it starts, ` +
-        '`/end` when it ends, and `/info` what else there is to know.',
+    expect(submitted?.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(sent((submitted as FakeInteraction).editReply).content).toBe(
+      `Your meetup is made. Its post is <#${postId}>. There, \`/meet\` changes when it starts, ` +
+        '`/end` sets when it ends, and `/info` changes what it says.',
     );
     expect(made.gateway.messagesIn(WEST_CHANNEL).map((message) => message.message.content)).toEqual(
       [`New meetup: <#${postId}>`],
     );
   });
 
+  it('asks for the name, the place and the start every time', () => {
+    const options = meetup.data.toJSON().options ?? [];
+    expect(options.map((option) => [option.name, option.required])).toEqual([
+      ['name', true],
+      ['near', true],
+      ['start', true],
+    ]);
+  });
+
   it('works in a post of the forum that is no party, and the meetup belongs to that region', async () => {
     const made = await setup();
-    // The pinned list of the forum of East, say: a thread whose parent is that forum.
     await made.run('Trade evening', {
       channelId: '300000000000000066',
       thread: { parentId: EAST_FORUM },
@@ -116,25 +199,23 @@ describe('/meetup', () => {
     expect(made.gateway.messagesIn(EAST_CHANNEL)).toHaveLength(1);
   });
 
-  it('is refused in the post of a party and anywhere that is no region', async () => {
+  it('is refused in the post of a party and anywhere that is no region, before any form', async () => {
     const made = await setup();
     const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
-    expect(await made.answer('Picnic', inPost)).toBe(FROM_A_REGION);
-    expect(await made.answer('Picnic', { channelId: '600000000000000009' })).toBe(FROM_A_REGION);
-    expect(FROM_A_REGION).toBe('Create a meetup from a region channel.');
-    expect(await made.answer('Picnic', { isDm: true })).toBe('This only works in a server.');
+    expect((await made.run('Picnic', inPost)).told).toBe(FROM_A_REGION);
+    expect((await made.run('Picnic', { channelId: '600000000000000009' })).told).toBe(
+      FROM_A_REGION,
+    );
+    expect((await made.run('Picnic', { isDm: true })).told).toBe('This only works in a server.');
     expect(made.meetups()).toEqual([]);
   });
 
   it('says so when the region has no forum yet', async () => {
     const made = await setup();
-    // The region without an outline has no forum; it is a region for the directory of gyms
-    // only when gyms lie in it, so the channel is made one here.
     const gyms = { ...made.ctx.gyms, isRegion: (id: string) => id === UNBOUNDED_CHANNEL };
     const other = await setup({ gyms });
-    // As often as it is tried: a use that is refused here is not counted.
     for (let n = 0; n < 3; n++) {
-      expect(await other.answer('Picnic', { channelId: UNBOUNDED_CHANNEL })).toBe(
+      expect((await other.run('Picnic', { channelId: UNBOUNDED_CHANNEL })).told).toBe(
         `The region <#${UNBOUNDED_CHANNEL}> has no forum yet. ` +
           'A moderator can create it with `/admin setup-forums`.',
       );
@@ -142,10 +223,27 @@ describe('/meetup', () => {
     expect(other.meetups()).toEqual([]);
   });
 
-  it('refuses a name of nothing but white space, and one that is too long', async () => {
+  it('refuses a name of nothing but white space, one that is too long, and one of nothing seen', async () => {
+    const made = await setup();
+    expect((await made.run('   ')).told).toBe('Give a name of 1 to 80 characters.');
+    expect((await made.run('x'.repeat(81))).told).toBe('Give a name of 1 to 80 characters.');
+    expect((await made.run('​​')).told).toBe('Give a name of 1 to 80 characters.');
+    expect(made.meetups()).toEqual([]);
+    await made.run('‮Picnic');
+    expect(made.meetups()[0]?.timed.name).toBe('Picnic');
+  });
+
+  it('refuses a start it cannot read, one in the past and none, before the form', async () => {
     const made = await setup();
-    expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
-    expect(await made.answer('x'.repeat(81))).toBe('Give a name of 1 to 80 characters.');
+    expect((await made.run('Picnic', { options: { start: 'soonish' } })).told).toMatch(
+      /^I could not read "soonish" as the time the meetup starts\./,
+    );
+    expect((await made.run('Picnic', { options: { start: '10-12 6pm' } })).told).toMatch(
+      /^"10-12 6pm" cannot be the time the meetup starts/,
+    );
+    expect((await made.run('Picnic', { options: { start: 'none' } })).told).toMatch(
+      /^Give the time the meetup starts\./,
+    );
     expect(made.meetups()).toEqual([]);
   });
 
@@ -153,10 +251,12 @@ describe('/meetup', () => {
     const made = await setup();
     await made.run('Picnic');
     await made.run('Picnic', { userId: BOB });
-    // Both were made in the same moment, so their order is that of their ids.
-    const makers = made.meetups().map((party) => party.createdById);
-    expect(makers.sort()).toEqual([ALICE, BOB]);
-    expect(new Set(made.meetups().map((party) => party.forumPostId)).size).toBe(2);
+    expect(
+      made
+        .meetups()
+        .map((party) => party.createdById)
+        .sort(),
+    ).toEqual([ALICE, BOB]);
   });
 
   it('names who made it, whatever they chose for the raids they report', async () => {
@@ -173,62 +273,46 @@ describe('/meetup', () => {
     expect(textDisplays(post?.message).at(-1)).toBe(`-# Created by **Alice**`);
   });
 
-  it('lets a member make two in a quarter of an hour, as the legacy bot did', async () => {
+  it('lets a member ask twice in a quarter of an hour, a form left unsent counting too', async () => {
     const made = await setup();
     expect(MEETUP_THROTTLE).toEqual({ uses: 2, perSeconds: 900 });
     await made.run('First');
-    await made.run('Second');
-    expect(await made.answer('Third')).toMatch(/^You can use \/meetup again in 1\d minutes\.$/);
-    expect(made.meetups()).toHaveLength(2);
-    // Another member is not held back.
+    await made.command('Second');
+    expect((await made.run('Third')).told).toMatch(/^You can use \/meetup again in 1\d minutes\.$/);
+    expect(made.meetups()).toHaveLength(1);
     await made.run('Fourth', { userId: BOB });
-    expect(made.meetups()).toHaveLength(3);
+    expect(made.meetups()).toHaveLength(2);
   });
 
-  it('does not count a use that made nothing: what can be known beforehand is refused first', async () => {
+  it('does not count a use that was refused before the form', async () => {
     const made = await setup();
     const inPost = { channelId: RAID_POST, thread: { parentId: WEST_FORUM } };
-    expect(await made.answer('   ')).toBe('Give a name of 1 to 80 characters.');
-    expect(await made.answer('x'.repeat(81))).toBe('Give a name of 1 to 80 characters.');
-    expect(await made.answer('Picnic', inPost)).toBe(FROM_A_REGION);
-    // None of them was acknowledged as a use that takes its time, and none was counted.
+    await made.run('   ');
+    await made.run('Picnic', inPost);
+    await made.run('Picnic', { options: { start: 'soonish' } });
+    await made.run('Picnic', { options: { near: 'qwxzy' } });
     await made.run('First');
     await made.run('Second');
     expect(made.meetups()).toHaveLength(2);
-    expect(await made.answer('Third')).toMatch(/^You can use \/meetup again/);
-  });
-
-  it('makes a meetup near a gym, PokéStop or power spot, or at a pin', async () => {
-    const made = await setup();
-    await made.run('Picnic', { options: { name: 'Picnic', near: 'gym:2' } });
-    expect(made.meetups()[0]?.meetup).toEqual({
-      description: null,
-      place: {
-        kind: 'gym',
-        id: '2',
-        title: 'Old Stone Fountain',
-        lat: 40.06,
-        lon: -80.06,
-        address: '12 Market Street, Pinewood, Pennsylvania 15999',
-        image: null,
-      },
-    });
-    const postId = made.meetups()[0]?.forumPostId ?? '';
-    expect(textDisplays(made.gateway.posts.get(postId)?.message)[1]).toMatch(
-      /^\*\*Where\*\*\nNear \*\*Old Stone Fountain\*\* \(gym\) · /,
-    );
-    await made.run('Lake picnic', { options: { name: 'Lake picnic', near: '40.02, -80.02' } });
-    const lake = made.meetups().find((party) => party.timed.name === 'Lake picnic');
-    expect(lake?.meetup.place).toMatchObject({ kind: 'pin', lat: 40.02 });
+    expect((await made.run('Third')).told).toMatch(/^You can use \/meetup again/);
   });
 
-  it('keeps a place without a picture or an address as having none', async () => {
+  it('makes a meetup near a PokéStop or at a pin', async () => {
     const { wayspots } = await wayspotsWith([
       keptRow(1, { title: 'Fountain Square', lat: 40.0601, lon: -80.0601, image: '', address: '' }),
     ]);
     const made = await setup({ wayspots });
-    await made.run('Picnic', { options: { name: 'Picnic', near: `stop:${wayspotId(1)}` } });
-    expect(made.meetups()[0]?.meetup.place).toMatchObject({ image: null, address: null });
+    await made.run('Picnic', { options: { near: `stop:${wayspotId(1)}` } });
+    expect(made.meetups()[0]?.meetup.place).toMatchObject({
+      kind: 'stop',
+      image: null,
+      address: null,
+    });
+    await made.run('Lake picnic', { options: { near: '40.02, -80.02' } });
+    const lake = made.meetups().find((party) => party.timed.name === 'Lake picnic');
+    expect(lake?.meetup.place).toMatchObject({ kind: 'pin', lat: 40.02 });
+    const postId = lake?.forumPostId ?? '';
+    expect(textDisplays(made.gateway.posts.get(postId)?.message)[1]).toMatch(/^\*\*Where\*\*\n📍/);
   });
 
   it('takes no Wayspot without a title, picked or typed by its street, and makes no meetup', async () => {
@@ -242,7 +326,7 @@ describe('/meetup', () => {
     ]);
     const made = await setup({ wayspots });
     await made.ctx.placeFinder.built();
-    const refusal = (near: string) => made.answer('Picnic', { options: { name: 'Picnic', near } });
+    const refusal = async (near: string) => (await made.run('Picnic', { options: { near } })).told;
     expect(await refusal(`stop:${wayspotId(1)}`)).toBe(
       'That place is gone from the list; pick it again.',
     );
@@ -259,10 +343,10 @@ describe('/meetup', () => {
     const { wayspots } = await wayspotsWith([keptRow(1, { title, lat: 40.0601, lon: -80.0601 })]);
     const made = await setup({ wayspots });
     await made.ctx.placeFinder.built();
-    await made.run('Picnic', { options: { name: 'Picnic', near: `stop:${wayspotId(1)}` } });
+    await made.run('Picnic', { options: { near: `stop:${wayspotId(1)}` } });
     expect(made.meetups()[0]?.meetup.place).toMatchObject({ title: '🦊'.repeat(127) });
     // A pin near it is named by it, cut the same way.
-    await made.run('Fox picnic', { options: { name: 'Fox picnic', near: '40.0602, -80.0602' } });
+    await made.run('Fox picnic', { options: { near: '40.0602, -80.0602' } });
     const fox = made.meetups().find((party) => party.timed.name === 'Fox picnic');
     expect(fox?.meetup.place).toMatchObject({
       kind: 'pin',
@@ -270,25 +354,15 @@ describe('/meetup', () => {
     });
   });
 
-  it('names a gym as its post does, by its nickname', async () => {
-    const made = await setup();
-    await made.run('Picnic', { options: { name: 'Picnic', near: 'gym:1' } });
-    expect(made.meetups()[0]?.meetup.place).toMatchObject({ kind: 'gym', title: 'The Stacks' });
-  });
-
   it('refuses a place it cannot take, without counting it', async () => {
     const made = await setup();
-    const refusal = (options: Record<string, string>) =>
-      made.answer('Picnic', { options: { name: 'Picnic', ...options } });
-    expect(await refusal({ near: 'https://maps.app.goo.gl/AbC123xyz' })).toMatch(
+    const refusal = async (near: string) => (await made.run('Picnic', { options: { near } })).told;
+    expect(await refusal('https://maps.app.goo.gl/AbC123xyz')).toMatch(
       /^I do not follow short links\./,
     );
-    expect(await refusal({ near: 'qwxzy' })).toBe(
+    expect(await refusal('qwxzy')).toBe(
       'I know no gym, PokéStop or power spot called "qwxzy" here. Pick one from the list that ' +
-        'appears while you type, or leave `near` out and say where with `/info` in its post.',
-    );
-    expect(await refusal({ near: 'https://www.google.com/maps/search/coffee' })).toMatch(
-      /^That link shows no one place/,
+        'appears while you type, or paste a maps link or coordinates.',
     );
     expect(made.meetups()).toEqual([]);
     await made.run('First');
@@ -296,22 +370,135 @@ describe('/meetup', () => {
     expect(made.meetups()).toHaveLength(MEETUP_THROTTLE.uses);
   });
 
-  it('says in its help that near says where it is, once and for good', () => {
-    expect(meetup.help.details).toContain('`near`');
-    expect(meetup.help.details).toContain('cannot be changed afterwards');
-    expect(meetup.help.examples).toContain('/meetup name:Trade evening near:Fountain Square');
+  it('refuses information of nothing but white space', async () => {
+    const made = await setup();
+    expect((await made.run('Picnic', {}, '  \n  ')).told).toBe(NO_INFORMATION);
+    expect((await made.run('Lake picnic', { options: { near: '40.02, -80.02' } }, ' ')).told).toBe(
+      NO_INFORMATION,
+    );
+    expect(made.meetups()).toEqual([]);
   });
 
-  it('refuses a name of nothing that can be seen', async () => {
+  it('refuses a start that has passed while the form was open', async () => {
     const made = await setup();
-    expect(await made.answer('\u200b\u200b')).toBe('Give a name of 1 to 80 characters.');
-    await made.run('\u202ePicnic');
-    expect(made.meetups()[0]?.timed.name).toBe('Picnic');
+    const used = await made.command('Picnic', { options: { start: 'in 10' } });
+    vi.setSystemTime(PARTY_NOW + 11 * MINUTE);
+    expect(told((await made.submit(used)) as FakeInteraction)).toMatch(
+      /^That start has passed meanwhile\. Use `\/meetup` again with a later one\./,
+    );
+    expect(made.meetups()).toEqual([]);
+  });
+
+  it('gives the information back when the form comes after its time', async () => {
+    const made = await setup();
+    const used = await made.command('Picnic');
+    vi.setSystemTime(PARTY_NOW + 31 * MINUTE);
+    const submitted = await made.submit(used, 'Bring snacks.');
+    expect(told(submitted as FakeInteraction)).toBe(
+      'That has expired. Use the command again.\nWhat you wrote:\n```\nBring snacks.\n```',
+    );
+    expect(made.meetups()).toEqual([]);
+  });
+
+  it('says in its help what it asks for, and that the place may need a moderator', () => {
+    const details = typeof meetup.help.details === 'string' ? meetup.help.details : '';
+    expect(details).toContain('`near`');
+    expect(details).toContain('`start`');
+    expect(details).toContain('cannot be changed afterwards');
+    expect(details).toContain("moderator's approval");
+    expect(meetup.help.examples).toContain(
+      '/meetup name:Trade evening near:Fountain Square start:6:30pm',
+    );
   });
 
   it('is listed with the commands, under the meetups, with /name and /info', () => {
     const filed = commands.filter((command) => command.help.category === 'meetup');
     expect(filed.map((command) => command.data.name).sort()).toEqual(['info', 'meetup', 'name']);
-    for (const command of filed) expect(command.help.details).toBeTruthy();
+  });
+});
+
+describe('/meetup with meetup safety on', () => {
+  const PIN = '40.02, -80.02';
+
+  it('sends a meetup at a pin to the moderators, and tells the member they will hear by DM', async () => {
+    const made = await setup({}, {});
+    const { told: answer } = await made.run(
+      'Lake picnic',
+      { options: { near: PIN } },
+      'By the tent.',
+    );
+    expect(answer).toBe(MEETUP_HELD);
+    expect(made.meetups()).toEqual([]);
+    const [request] = made.storage.requests.values();
+    expect(request).toMatchObject({
+      makerId: ALICE,
+      makerName: 'Alice',
+      makerTeam: 'mystic',
+      name: 'Lake picnic',
+      startTime: SIX_PM,
+      description: 'By the tent.',
+      status: 'pending',
+      place: { kind: 'pin' },
+    });
+    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('Lake picnic');
+  });
+
+  it('posts a staff member’s meetup at once, wherever it is', async () => {
+    const made = await setup({}, {});
+    await made.run('Lake picnic', { roleNames: ['Moderator'], options: { near: PIN } });
+    expect(made.meetups()).toHaveLength(1);
+    expect(made.storage.requests.size).toBe(0);
+  });
+
+  it('refuses a place refused for good, and a blocked member, before the form and uncounted', async () => {
+    const made = await setup({}, {});
+    await made.storage.rule(made.gateway.guildId, { kind: 'gym', id: '2' }, 'refuse', MOD);
+    for (let n = 0; n < 3; n++) expect((await made.run('Picnic')).told).toBe(NO_MEETUP_HERE);
+    await made.storage.addBlock(made.gateway.guildId, BOB, MOD);
+    for (let n = 0; n < 3; n++) {
+      expect((await made.run('Picnic', { userId: BOB, options: { near: 'gym:1' } })).told).toBe(
+        NO_MEETUPS_FOR_YOU,
+      );
+    }
+    expect(made.meetups()).toEqual([]);
+    await made.run('First', { options: { near: 'gym:1' } });
+    await made.run('Second', { options: { near: 'gym:1' } });
+    expect(made.meetups()).toHaveLength(2);
+  });
+
+  it('reads the place and its check once before the form, in the guard', async () => {
+    const made = await setup({}, {});
+    const blocks = vi.spyOn(made.storage, 'block');
+    const rulings = vi.spyOn(made.storage, 'ruling');
+    const used = await made.command('Picnic');
+    expect(used.showModal).toHaveBeenCalledOnce();
+    expect(blocks).toHaveBeenCalledOnce();
+    expect(rulings).toHaveBeenCalledOnce();
+  });
+
+  it('asks again on the submit: a place refused while the form was open is refused', async () => {
+    const made = await setup({}, {});
+    const used = await made.command('Picnic');
+    await made.storage.rule(made.gateway.guildId, { kind: 'gym', id: '2' }, 'refuse', MOD);
+    expect(told((await made.submit(used, 'Bring snacks.')) as FakeInteraction)).toBe(
+      `${NO_MEETUP_HERE}\nWhat you wrote:\n\`\`\`\nBring snacks.\n\`\`\``,
+    );
+    expect(made.meetups()).toEqual([]);
+  });
+
+  it('asks for a start two hours ahead when the place needs a moderator', async () => {
+    const made = await setup({}, {});
+    expect((await made.run('Picnic', { options: { near: PIN, start: 'in 90' } })).told).toBe(
+      MEETUP_TOO_SOON,
+    );
+    expect(made.storage.requests.size).toBe(0);
+  });
+
+  it('says so, with the information given back, when the moderators cannot be asked', async () => {
+    const made = await setup({}, { channel: false });
+    const { told: answer } = await made.run('Picnic', { options: { near: PIN } }, 'By the tent.');
+    expect(answer).toBe(`${MEETUP_NOT_SENT}\nWhat you wrote:\n\`\`\`\nBy the tent.\n\`\`\``);
+    expect(made.storage.requests.size).toBe(0);
+    expect(made.meetups()).toEqual([]);
   });
 });
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index f6d60eb4..937725ff 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -1,13 +1,38 @@
-import { SlashCommandBuilder } from 'discord.js';
-import type { Guard, SimpleCommand } from '../../discord/command.js';
+import {
+  MessageFlags,
+  SlashCommandBuilder,
+  type APIModalInteractionResponseCallbackData,
+  type ChatInputCommandInteraction,
+  type ModalSubmitInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type {
+  ComponentHandler,
+  Guard,
+  LocatedInteraction,
+  SimpleCommand,
+} from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
-import { regionChannelOf, requireGuild } from '../../discord/guards.js';
+import { guildIdOf, isStaff, regionChannelOf, requireGuild } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
 import type { Throttle } from '../../discord/throttle.js';
+import type { Place } from '../../domain/geo/place.js';
+import { mayRequestReview, type MeetupVerdict } from '../../domain/meetups/safety.js';
+import { tidyDescription } from '../../domain/party/meetup.js';
 import { MAX_PARTY_NAME } from '../../domain/party/party.js';
 import { NO_POST_MADE, problemText } from '../../render/activity.js';
-import { noForumYet, requirePlaceForNew } from '../parties/timed.js';
+import { EXPIRED, PendingRequests } from '../../services/pending-requests.js';
+import {
+  newPartyTimes,
+  noForumYet,
+  requirePlaceForNew,
+  TIMED_TIME_HINT,
+  typedTimedTime,
+} from '../parties/timed.js';
 import { MAX_PLACE_TEXT, namedPlace, nearChoices } from '../place-option.js';
+import { INFO_INPUT, infoInput, refusedWithText } from './info.js';
 
 /** Where `/meetup` works, said wherever it does not. */
 export const FROM_A_REGION = 'Create a meetup from a region channel.';
@@ -15,8 +40,53 @@ export const FROM_A_REGION = 'Create a meetup from a region channel.';
 /** As the legacy bot allowed: a meetup is a post that stays for days. */
 export const MEETUP_THROTTLE: Throttle = { uses: 2, perSeconds: 900 };
 
-/** What a refusal of a place nobody can find offers instead. */
-const OR_INFO = 'or leave `near` out and say where with `/info` in its post';
+/** What a refusal of a place nobody can find offers instead (`near` is required). */
+const OR_A_PIN = 'or paste a maps link or coordinates';
+
+/** Said of a place a moderator refused for good (plan 8S-1; the design's words). */
+export const NO_MEETUP_HERE = "A meetup can't be held there.";
+
+/** Said to a member blocked from making meetups in the server (the design's words). */
+export const NO_MEETUPS_FOR_YOU = "You can't create meetups on this server.";
+
+/** Said of a meetup held for a moderator: nothing is posted, and the member is never told why. */
+export const MEETUP_HELD =
+  "Your meetup needs a moderator's approval before it is posted. I will tell you by direct " +
+  'message once a moderator has decided.';
+
+/** Said when the moderators could not be asked (no channel, Discord refused): nothing is kept. */
+export const MEETUP_NOT_SENT =
+  "Your meetup needs a moderator's approval, but I could not send it to the moderators. Try " +
+  'again later.';
+
+/** Said of a start too soon for the moderators to look at the meetup first. */
+export const MEETUP_TOO_SOON =
+  "A meetup there needs a moderator's approval, which takes time: pick a start at least two " +
+  'hours from now.';
+
+/** Said of information of nothing but white space: a meetup made by `/meetup` has some. */
+export const NO_INFORMATION =
+  'Say what there is to know about the meetup: where to meet, what to bring.';
+
+/** Said of a start that has passed while the form was open. */
+const START_PASSED = 'That start has passed meanwhile. Use `/meetup` again with a later one.';
+
+/** The custom-id kind of the form `/meetup` opens (`meetup:<token>:form`). */
+export const MEETUP_KIND = 'meetup';
+
+/** How long the form of `/meetup` may stay open: what it was opened with is kept that long. */
+const FORM_MS = 30 * 60_000;
+
+/** What `/meetup` was used with, kept between the command and its form. */
+interface PendingMeetup {
+  serverId: string;
+  regionChannelId: string;
+  name: string;
+  place: Place;
+  startTime: number;
+}
+
+const pending = new PendingRequests<PendingMeetup>({ ttlMs: FORM_MS });
 
 /**
  * `/meetup` is used in the text channel of a region, or in a post of its forum that is no
@@ -24,21 +94,100 @@ const OR_INFO = 'or leave `near` out and say where with `/info` in its post';
  */
 const requireMeetupPlace = requirePlaceForNew('meetup', FROM_A_REGION);
 
+/** What `/meetup` was asked: the place, the start, and what the check of the place says. */
+interface Asked {
+  place: Place;
+  startTime: number;
+  verdict: MeetupVerdict;
+}
+
+/** The refusal of a verdict, or nothing when the meetup may go on (posted or held). */
+function refusalOf(verdict: MeetupVerdict, startTime: number, now: number): string | undefined {
+  if (verdict === 'refused') return NO_MEETUP_HERE;
+  if (verdict === 'blocked') return NO_MEETUPS_FOR_YOU;
+  if (verdict === 'review' && !mayRequestReview(now, startTime)) return MEETUP_TOO_SOON;
+  return undefined;
+}
+
+/** The check of a place for the member of an interaction (staff skip it). */
+function verdictFor(
+  interaction: LocatedInteraction,
+  ctx: AppContext,
+  place: Place,
+): Promise<MeetupVerdict> {
+  return ctx.meetupSafety.verdict({
+    serverId: guildIdOf(interaction),
+    place,
+    makerId: interaction.user.id,
+    staff: isStaff(interaction, ctx),
+  });
+}
+
+/**
+ * Reads what `/meetup` was used with: the place (`namedPlace`: a gym, PokéStop or power spot,
+ * or a pin), the start (`typedTimedTime` for a meetup about to be made), and the check of the
+ * place. Throws a `UserError` for what cannot be: a guard and the command each read it, so that
+ * a refusal does not count against the limit.
+ */
+async function readAsked(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  now: number,
+): Promise<Asked> {
+  const place = await namedPlace(interaction, ctx, interaction.options.getString('near'), OR_A_PIN);
+  if (place === undefined) throw new UserError('Say where it is with `near`.');
+  const typed = typedTimedTime(
+    ctx,
+    newPartyTimes('meetup', now),
+    'meet',
+    interaction.options.getString('start') ?? '',
+    now,
+  );
+  if (typed === 'unset') {
+    throw new UserError(`Give the time the meetup starts. ${TIMED_TIME_HINT}`);
+  }
+  const verdict = await verdictFor(interaction, ctx, place);
+  const refusal = refusalOf(verdict, typed.at, now);
+  if (refusal !== undefined) throw new UserError(refusal);
+  return { place, startTime: typed.at, verdict };
+}
+
 /**
- * Where the meetup is, refused before it is made so that a use that came to nothing does not
- * count: a `near` that names no place it can take (`namedPlace`).
+ * What the guard read of a use of `/meetup`, for its `execute` (no second search and check
+ * before the form, which must open within three seconds).
  */
-const requireMeetupNear: Guard = async (interaction, ctx) => {
+const readings = new WeakMap<ChatInputCommandInteraction, Asked>();
+
+/**
+ * Everything that can be known before the form: a `near` that names no place it can take, a
+ * start it cannot read or that has passed, a place refused for good, a member blocked from
+ * making meetups, a start too soon for the moderators. Refused here, so that it does not count;
+ * what it read is kept for `execute`.
+ */
+const requireMeetupAsked: Guard = async (interaction, ctx) => {
   if (!interaction.isChatInputCommand()) return;
-  await namedPlace(interaction, ctx, interaction.options.getString('near'), OR_INFO);
+  readings.set(interaction, await readAsked(interaction, ctx, Date.now()));
 };
 
+/** The form `/meetup` opens: the meetup's information, required (plan 8S-1). */
+export function meetupForm(token: string): APIModalInteractionResponseCallbackData {
+  return {
+    custom_id: encodeCustomId({ kind: MEETUP_KIND, id: token, action: 'form' }),
+    title: 'About this meetup',
+    components: [
+      infoInput({ required: true, placeholder: 'Where to meet, what to bring, how long it goes.' }),
+    ],
+  };
+}
+
 /**
- * `/meetup` (spec 4.2): a meetup with a post of its own in the forum of the region it is made
- * in. It starts with its name, and where it is when the member says (`near`: a gym, PokéStop or
- * power spot, or a pin from a maps link or coordinates; Matt, 2026-10-17): set once, here, and
- * never changed afterwards. Its times and what there is to say about it are set in its post
- * (`/meet`, `/end`, `/info`). Who makes it is signed up as interested, and named.
+ * `/meetup` (spec 4.2; plan 8S-1): a meetup with a post of its own in the forum of the region it
+ * is made in. It asks every time for the name, the place (`near`: a gym, PokéStop or power spot,
+ * or a pin from a maps link or coordinates; Matt, 2026-10-17), set once and never changed
+ * afterwards, the start, and in a form the information. A place that might be private (a pin, a
+ * Wayspot whose title looks like a front-yard feature) waits for a moderator's approval
+ * (`ctx.meetupSafety`): nothing is posted, and the member is told by DM what was decided. Who
+ * makes it is signed up as interested, and named.
  */
 export const meetup: SimpleCommand = {
   data: new SlashCommandBuilder()
@@ -57,8 +206,16 @@ export const meetup: SimpleCommand = {
         .setDescription(
           'A gym, PokéStop or power spot it is near (pick from the list), or a maps link',
         )
+        .setRequired(true)
         .setMaxLength(MAX_PLACE_TEXT)
         .setAutocomplete(true),
+    )
+    .addStringOption((option) =>
+      option
+        .setName('start')
+        .setDescription('When it starts, such as 6:30pm or 10-18 11am (month-day)')
+        .setRequired(true)
+        .setMaxLength(100),
     ),
   help: {
     category: 'meetup',
@@ -67,57 +224,36 @@ export const meetup: SimpleCommand = {
       'evening. Use it in the channel of a region; the meetup gets a post in the forum of that ' +
       'region, and you are marked as interested. `near` says the gym, PokéStop or power spot ' +
       'it is near (pick one from the list that appears while you type), or a place you paste ' +
-      'as a link from a maps app or as coordinates. The post shows the place with a map link; ' +
-      'it is set here and cannot be changed afterwards. In the post, set ' +
-      'when it starts with `/meet` and when it ends with `/end`, say more about it with ' +
-      '`/info`, and rename it with `/name`. Members sign up with the buttons, as for a raid. A ' +
-      'meetup is archived an hour after it is over: after its end, or without one a day after ' +
-      'its start. One without any time goes a day after it was made, or after its last time ' +
-      'was removed; its post says when.',
+      'as a link from a maps app or as coordinates; the post shows the place with a map link, ' +
+      'and it cannot be changed afterwards. `start` says when it starts. A form then asks what ' +
+      'there is to know: where exactly to meet, what to bring. A meetup at a pin, or at a place ' +
+      "that might be somebody's home, needs a moderator's approval before it is posted: you " +
+      'are told by direct message once they have decided (so give a start at least two hours ' +
+      'ahead). In the post, change when it starts with `/meet`, set when it ends with `/end`, ' +
+      'change the information with `/info`, and rename it with `/name`. Members sign up with ' +
+      'the buttons, as for a raid. A meetup is archived an hour after it is over: after its ' +
+      'end, or without one a day after its start. One whose start was removed goes a day after ' +
+      'it was made, or after its last time was removed; its post says when.',
     examples: [
-      '/meetup name:Community Day picnic',
-      '/meetup name:Trade evening near:Fountain Square',
+      '/meetup name:Community Day picnic near:Riverside Park start:2pm',
+      '/meetup name:Trade evening near:Fountain Square start:6:30pm',
     ],
   },
-  guards: [requireGuild, requireMeetupPlace, requireMeetupNear],
-  defer: 'ephemeral',
+  guards: [requireGuild, requireMeetupPlace, requireMeetupAsked],
   throttle: MEETUP_THROTTLE,
   async execute(interaction, ctx) {
     const regionChannelId = regionChannelOf(interaction, ctx);
     if (regionChannelId === undefined) throw new UserError(FROM_A_REGION);
-    const place = await namedPlace(
-      interaction,
-      ctx,
-      interaction.options.getString('near'),
-      OR_INFO,
-    );
-    const outcome = await ctx.partyService.createMeetup({
-      name: interaction.options.getString('name', true),
-      creatorId: interaction.user.id,
-      creator: memberInfo(interaction),
+    const asked = readings.get(interaction) ?? (await readAsked(interaction, ctx, Date.now()));
+    readings.delete(interaction);
+    const token = pending.put(interaction.user.id, {
+      serverId: guildIdOf(interaction),
       regionChannelId,
-      ...(place === undefined ? {} : { place }),
+      name: interaction.options.getString('name', true),
+      place: asked.place,
+      startTime: asked.startTime,
     });
-    // The guard has looked at all of these; what follows is for what changed in between.
-    switch (outcome.kind) {
-      case 'bad-name':
-        throw new UserError(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
-      case 'no-region':
-        throw new UserError(FROM_A_REGION);
-      case 'no-forum':
-        throw new UserError(noForumYet(outcome.region.channelId));
-      case 'no-post':
-        throw new UserError(NO_POST_MADE);
-      case 'created': {
-        const post = outcome.party.forumPostId;
-        await interaction.editReply({
-          content:
-            `Your meetup is made.${post === null ? '' : ` Its post is <#${post}>.`} ` +
-            'There, `/meet` sets when it starts, `/end` when it ends, and `/info` what else ' +
-            'there is to know.',
-        });
-      }
-    }
+    await interaction.showModal(meetupForm(token));
   },
   async autocomplete(interaction, ctx) {
     const focused = interaction.options.getFocused(true);
@@ -126,3 +262,93 @@ export const meetup: SimpleCommand = {
     );
   },
 };
+
+/**
+ * The form of `/meetup`. It has no limit of its own: every form was opened by a use of
+ * `/meetup`, which has the limit, and counted there.
+ */
+export const meetupFormControls: ComponentHandler = {
+  kind: MEETUP_KIND,
+  guards: [requireGuild],
+
+  async modal(interaction, id, ctx) {
+    if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
+    const text = interaction.fields.getTextInputValue(INFO_INPUT);
+    const taken = pending.take(id.id, interaction.user.id);
+    if (taken === 'expired' || taken === 'not-yours') {
+      throw new UserError(refusedWithText(EXPIRED, text));
+    }
+    await submitted(interaction, ctx, taken.value, text);
+  },
+};
+
+/** What the form of `/meetup` does with the information: the meetup, or the moderators asked. */
+async function submitted(
+  interaction: ModalSubmitInteraction,
+  ctx: AppContext,
+  asked: PendingMeetup,
+  text: string,
+): Promise<void> {
+  const refuse = (refusal: string): UserError => new UserError(refusedWithText(refusal, text));
+  const now = Date.now();
+  if (tidyDescription(text) === null) throw refuse(NO_INFORMATION);
+  if (asked.startTime <= now) throw refuse(START_PASSED);
+  // Asked again: a ruling or a block may have come meanwhile.
+  const verdict = await verdictFor(interaction, ctx, asked.place);
+  const refusal = refusalOf(verdict, asked.startTime, now);
+  if (refusal !== undefined) throw refuse(refusal);
+  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+  const maker = { id: interaction.user.id, ...memberInfo(interaction) };
+  if (verdict === 'review') {
+    const outcome = await ctx.meetupSafety.submit({
+      serverId: asked.serverId,
+      regionChannelId: asked.regionChannelId,
+      maker,
+      place: asked.place,
+      name: asked.name,
+      startTime: asked.startTime,
+      description: text,
+    });
+    if (outcome.kind === 'too-soon') throw refuse(MEETUP_TOO_SOON);
+    if (outcome.kind === 'not-sent') throw refuse(MEETUP_NOT_SENT);
+    if (outcome.kind === 'bad-name') {
+      throw refuse(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
+    }
+    if (outcome.kind === 'bad-description') {
+      throw refuse(problemText('description-too-long', ctx.attendance.limits(), 'meetup'));
+    }
+    await interaction.editReply({ content: MEETUP_HELD });
+    return;
+  }
+  const outcome = await ctx.partyService.createMeetup({
+    name: asked.name,
+    creatorId: maker.id,
+    creator: memberInfo(interaction),
+    regionChannelId: asked.regionChannelId,
+    place: asked.place,
+    startTime: asked.startTime,
+    description: text,
+  });
+  // The guard has looked at all of these; what follows is for what changed in between.
+  switch (outcome.kind) {
+    case 'bad-name':
+      throw refuse(problemText('bad-name', ctx.attendance.limits(), 'meetup'));
+    case 'bad-description':
+      throw refuse(problemText('description-too-long', ctx.attendance.limits(), 'meetup'));
+    case 'no-region':
+      throw refuse(FROM_A_REGION);
+    case 'no-forum':
+      throw refuse(noForumYet(outcome.region.channelId));
+    case 'no-post':
+      throw refuse(NO_POST_MADE);
+    case 'created': {
+      const post = outcome.party.forumPostId;
+      await interaction.editReply({
+        content:
+          `Your meetup is made.${post === null ? '' : ` Its post is <#${post}>.`} ` +
+          'There, `/meet` changes when it starts, `/end` sets when it ends, and `/info` ' +
+          'changes what it says.',
+      });
+    }
+  }
+}
diff --git a/src/commands/parties/timed.ts b/src/commands/parties/timed.ts
index fecfd191..489375f1 100644
--- a/src/commands/parties/timed.ts
+++ b/src/commands/parties/timed.ts
@@ -88,7 +88,8 @@ export function newPartyTimes(type: TimedParty['type'], now: number): TimedTimes
 }
 
 /**
- * A time a member typed for a timed party that exists (a meetup or a train): when it
+ * A time a member typed for a timed party that exists (a meetup or a train), or for a meetup
+ * about to be made (`newPartyTimes`): when it
  * starts (`meet`) or when it ends. `'unset'` when the member asked to remove it (`cancel`,
  * `none`, `unset`). Throws a `UserError` for a text that is no time or lies outside what the
  * party can have: a start from now, an end from the start or from now, both within some three
diff --git a/src/components/index.ts b/src/components/index.ts
index 1b8b06c9..81bbe9bc 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -3,6 +3,7 @@ import { gymControls } from '../commands/gyms/controls.js';
 import { gymViewControls } from '../commands/gyms/view-controls.js';
 import { regionControls } from '../commands/regions/controls.js';
 import { infoControls } from '../commands/meetups/info.js';
+import { meetupFormControls } from '../commands/meetups/meetup.js';
 import {
   targetControls,
   targetListControls,
@@ -26,6 +27,7 @@ export const components: readonly ComponentHandler[] = [
   raidControls,
   locationControls,
   infoControls,
+  meetupFormControls,
   wantControls,
   wantListControls,
   targetControls,
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index e4702089..9579baac 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -93,6 +93,10 @@
  * `help:group:<category>:overview`, `help:command:<path>:back`, `…:overview` and `…:subgroup`
  * (`HELP_PAGES`, `src/commands/util/help-render.ts`).
  *
+ * The form `/meetup` opens for a meetup's information (plan 8S-1) is `meetup:<token>:form`: the
+ * token is that of what the command was used with (name, place, start), kept for half an hour
+ * (`src/commands/meetups/meetup.ts`).
+ *
  * "Change options…" under an answer of `/counters` is `counters:<token>:options`, and the dialog
  * it opens `counters:<token>:dialog`: the token is that of the answer's options, kept for a day
  * (`keptCounters`, `src/commands/util/counters.ts`).
diff --git a/src/discord/errors.ts b/src/discord/errors.ts
index 6fd64f91..49a4cd55 100644
--- a/src/discord/errors.ts
+++ b/src/discord/errors.ts
@@ -1,7 +1,18 @@
+import type { V2Message } from './party-gateway.js';
+
 /**
  * A problem caused by the user's input or situation (wrong channel, bad value).
- * The router shows the message ephemerally and does not log it as an error.
+ * The router shows the message ephemerally and does not log it as an error. With `answer`, the
+ * router shows that message instead of the text (a refusal with a control of its own: the
+ * Appeal of a member blocked from making meetups), where the interaction can still be answered
+ * privately; the text stays what the log and a public deferral's answer say.
  */
 export class UserError extends Error {
   override name = 'UserError';
+  readonly answer: V2Message | undefined;
+
+  constructor(message: string, options: { answer?: V2Message } = {}) {
+    super(message);
+    this.answer = options.answer;
+  }
 }
diff --git a/src/discord/router.test.ts b/src/discord/router.test.ts
index 6c65bc9b..a4a1403d 100644
--- a/src/discord/router.test.ts
+++ b/src/discord/router.test.ts
@@ -1,4 +1,6 @@
 import {
+  ButtonStyle,
+  ComponentType,
   MessageFlags,
   PermissionFlagsBits,
   SlashCommandBuilder,
@@ -24,6 +26,7 @@ import { Throttles } from './throttle.js';
 import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import type { ChatInputCommandInteraction } from 'discord.js';
 import { Rehearsal, REHEARSAL_REFUSAL } from '../services/rehearsal.js';
+import { actionRow, textMessage } from '../render/v2.js';
 
 const asInteraction = (fake: unknown) => fake as Interaction;
 
@@ -92,6 +95,49 @@ describe('InteractionRouter', () => {
     expect(entries.filter((e) => e.level === 50)).toHaveLength(0);
   });
 
+  it('shows a UserError that carries a message of its own as that message, privately', async () => {
+    const { ctx } = createTestContext();
+    const shown = textMessage(
+      0xed4245,
+      ['You can’t do that here.'],
+      [
+        actionRow([
+          {
+            type: ComponentType.Button,
+            style: ButtonStyle.Primary,
+            label: 'Ask',
+            custom_id: 'x:1:ask',
+          },
+        ]),
+      ],
+    );
+    const cmd = command({
+      guards: [
+        () => {
+          throw new UserError('You can’t do that here.', { answer: shown });
+        },
+      ],
+      execute: () => Promise.resolve(),
+    });
+    const i = fakeChatInput();
+    await new InteractionRouter(ctx, [cmd], []).handle(asInteraction(i));
+    expect(i.reply).toHaveBeenCalledWith({
+      components: shown.components,
+      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
+    });
+    // After a deferral it is the answer's edit, as any answer apart.
+    const deferred = command({
+      defer: 'ephemeral',
+      execute: () => Promise.reject(new UserError('You can’t do that here.', { answer: shown })),
+    });
+    const later = fakeChatInput();
+    await new InteractionRouter(ctx, [deferred], []).handle(asInteraction(later));
+    expect(later.editReply).toHaveBeenCalledWith({
+      components: shown.components,
+      flags: MessageFlags.IsComponentsV2,
+    });
+  });
+
   it('writes one debug line per handled command or control, and none for autocomplete', async () => {
     const { ctx, entries } = createTestContext();
     const router = new InteractionRouter(ctx, [], []);
diff --git a/src/discord/router.ts b/src/discord/router.ts
index 99a628b6..26a09f50 100644
--- a/src/discord/router.ts
+++ b/src/discord/router.ts
@@ -22,7 +22,7 @@ import {
 import { channelContext } from './channel-context.js';
 import { decodeCustomId, type CustomId } from './custom-id.js';
 import { UserError } from './errors.js';
-import { deferLate, LATE_DEFER_MS } from './late-reply.js';
+import { answerApart, deferLate, LATE_DEFER_MS } from './late-reply.js';
 import { Throttles, waitText } from './throttle.js';
 import { REHEARSAL_REFUSAL } from '../services/rehearsal.js';
 
@@ -405,6 +405,19 @@ export class InteractionRouter {
       let ref: string | undefined;
       if (err instanceof UserError) {
         content = err.message;
+        // A refusal with a message of its own, where it can still be the member's alone.
+        const apart =
+          !interaction.replied && (!interaction.deferred || interaction.ephemeral === true);
+        if (err.answer && apart) {
+          const shown = err.answer;
+          await answerApart(interaction, shown).catch((replyErr: unknown) =>
+            this.ctx.log.warn(
+              { err: replyErr, interaction: describe(interaction) },
+              'could not send error reply',
+            ),
+          );
+          return;
+        }
       } else {
         ref = randomBytes(3).toString('hex');
         this.ctx.log.error({ err, ref, interaction: describe(interaction) }, 'interaction failed');
diff --git a/src/domain/party/meetup.test.ts b/src/domain/party/meetup.test.ts
index 8c4c2d66..25fc4143 100644
--- a/src/domain/party/meetup.test.ts
+++ b/src/domain/party/meetup.test.ts
@@ -71,6 +71,27 @@ describe('createMeetup', () => {
     expect(made.ok && made.party.timed.name).toBe('Community Day picnic');
   });
 
+  it('starts with its start and information when they are given (plan 8S-1), at once', () => {
+    const start = PARTY_NOW + 3 * HOUR + 59_999;
+    const made = createMeetup({
+      ...fresh,
+      startTime: start,
+      description: '  Bring snacks. \n\n\n\nSee you! ',
+    });
+    if (!made.ok) throw new Error(made.reason);
+    expect(made.party.timed.startTime).toBe(PARTY_NOW + 3 * HOUR);
+    expect(made.party.meetup.description).toBe('Bring snacks.\n\nSee you!');
+    // A day after its start, as a start set later would give it.
+    expect(made.party.lastPossibleTime).toBe(PARTY_NOW + 27 * HOUR);
+    expect(createMeetup({ ...fresh, description: ' \n ' })).toMatchObject({
+      ok: true,
+      party: { meetup: { description: null } },
+    });
+    expect(createMeetup({ ...fresh, description: 'x'.repeat(MAX_MEETUP_DESCRIPTION + 1) })).toEqual(
+      { ok: false, reason: 'description-too-long' },
+    );
+  });
+
   it('refuses a name that is empty or too long', () => {
     expect(createMeetup({ ...fresh, name: ' \n ' })).toEqual({ ok: false, reason: 'bad-name' });
     expect(createMeetup({ ...fresh, name: 'x'.repeat(MAX_PARTY_NAME) }).ok).toBe(true);
diff --git a/src/domain/party/meetup.ts b/src/domain/party/meetup.ts
index f1360d67..661fb77b 100644
--- a/src/domain/party/meetup.ts
+++ b/src/domain/party/meetup.ts
@@ -9,45 +9,70 @@ import { newTimedParty, settled, tidyName, type NewTimedParty } from './timed.js
 
 /**
  * A new meetup: its name, and where it is when the member who made it said (`/meetup near:`).
- * The place is set once, here, and never changes afterwards (Matt, 2026-10-17).
+ * The place is set once, here, and never changes afterwards (Matt, 2026-10-17). Since plan 8S-1
+ * `/meetup` also asks for its start and its information up front: the moderators need them, and
+ * a meetup held for them has no post to set them in.
  */
-export interface NewMeetup extends NewTimedParty {
+export interface NewMeetup extends Omit<NewTimedParty, 'startTime'> {
   place?: MeetupPlace | null;
+  /** When it starts; the caller has checked it (`resolvePartyTime`). */
+  startTime?: number | null;
+  /** What its post says about it under "Meeting Information", as typed (`tidyDescription`). */
+  description?: string | null;
 }
 
 /**
- * A new meetup: a name and, when given, its place, with the member who made it signed up as
- * interested (as the legacy bot did; their automatic status is for raids they report and trains
- * they make). It names who made it, whatever they chose for those: they are the first trainer
- * in its list anyway. It has no times, so it counts as going on for a day (`OPEN_PARTY_HOURS`)
- * until somebody sets one. Refused with `bad-name` when the text is no name.
+ * A new meetup: a name and, when given, its place, start and information, with the member who
+ * made it signed up as interested (as the legacy bot did; their automatic status is for raids
+ * they report and trains they make). It names who made it, whatever they chose for those: they
+ * are the first trainer in its list anyway. Without a start it counts as going on for a day
+ * (`OPEN_PARTY_HOURS`) until somebody sets one. Refused with `bad-name` when the text is no
+ * name, `description-too-long` when the information is longer than it may be. A start and
+ * information given here are what the meetup is made with: nothing announces them as a change.
  */
 export function createMeetup(input: NewMeetup): Change<MeetupParty> {
   const name = tidyName(input.name);
   if (name === undefined) return refused('bad-name');
+  const description = tidyDescription(input.description ?? '');
+  if (description === undefined) return refused('description-too-long');
+  const { startTime, ...rest } = input;
+  const core = newTimedParty(
+    startTime === undefined || startTime === null ? rest : { ...rest, startTime },
+    name,
+  );
   const meetup: MeetupParty = {
-    ...newTimedParty(input, name),
+    ...core,
     type: 'meetup',
-    meetup: { description: null, place: input.place ?? null },
+    meetup: { description, place: input.place ?? null },
   };
   return { ok: true, party: settled(meetup, input.now) };
 }
 
 /**
- * Sets what the post says about the meetup (`/info`); a text of nothing but white space removes
- * it. The lines stay as they were typed, without white space at their ends and without more than
- * one empty line in a row. Refused with `description-too-long`; the very same party comes back
- * when the text is what it was.
+ * The information of a meetup as it is kept: the lines as they were typed, without white space
+ * at their ends and without more than one empty line in a row; null for a text of nothing but
+ * white space; undefined when it is longer than `MAX_MEETUP_DESCRIPTION` once tidied.
  */
-export function setDescription(party: MeetupParty, text: string): Change<MeetupParty> {
+export function tidyDescription(text: string): string | null | undefined {
   const tidy = text
     .split(/\r\n|\r|\n/)
     .map((line) => line.trimEnd())
     .join('\n')
     .replace(/\n{3,}/g, '\n\n')
     .trim();
-  if (tidy.length > MAX_MEETUP_DESCRIPTION) return refused('description-too-long');
-  const description = tidy === '' ? null : tidy;
+  if (tidy.length > MAX_MEETUP_DESCRIPTION) return undefined;
+  return tidy === '' ? null : tidy;
+}
+
+/**
+ * Sets what the post says about the meetup (`/info`); a text of nothing but white space removes
+ * it. The lines stay as they were typed, without white space at their ends and without more than
+ * one empty line in a row (`tidyDescription`). Refused with `description-too-long`; the very
+ * same party comes back when the text is what it was.
+ */
+export function setDescription(party: MeetupParty, text: string): Change<MeetupParty> {
+  const description = tidyDescription(text);
+  if (description === undefined) return refused('description-too-long');
   if (description === party.meetup.description) return { ok: true, party };
   return { ok: true, party: { ...party, meetup: { ...party.meetup, description } } };
 }
diff --git a/src/render/meetup-safety.test.ts b/src/render/meetup-safety.test.ts
new file mode 100644
index 00000000..0824aa7d
--- /dev/null
+++ b/src/render/meetup-safety.test.ts
@@ -0,0 +1,106 @@
+import { ButtonStyle } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  LIBRARY,
+  newRequest,
+  requestId,
+  SAFETY_NOW,
+  SAFETY_PIN,
+} from '../../test/support/meetup-safety-cases.js';
+import {
+  accentOf,
+  buttonsOf,
+  textDisplays,
+  textOf,
+  thumbnailOf,
+} from '../../test/support/messages.js';
+import { expectV2Sendable } from '../../test/support/post-limits.js';
+import type { MeetupRequestRecord } from '../domain/meetups/records.js';
+import { MAX_MEETUP_DESCRIPTION, MAX_PARTY_NAME } from '../domain/party/party.js';
+import { PENDING_ACCENT, requestMessage } from './meetup-safety.js';
+import { plainLines } from './text.js';
+
+function pending(overrides: Partial<MeetupRequestRecord> = {}): MeetupRequestRecord {
+  return {
+    ...newRequest(1),
+    status: 'pending',
+    decision: null,
+    decidedBy: null,
+    decidedByName: null,
+    decidedAt: null,
+    partyId: null,
+    ...overrides,
+  };
+}
+
+describe('requestMessage', () => {
+  it('shows the moderators who asked, where, the name, the start and the information', () => {
+    const message = requestMessage(pending());
+    expect(accentOf(message)).toBe(PENDING_ACCENT);
+    expect(textDisplays(message)[0]).toMatch(/^### Meetup waiting for approval\n/);
+    const text = textOf(message);
+    expect(text).toContain('**Book swap**');
+    expect(text).toContain(`Starts <t:${String((SAFETY_NOW + 24 * 3_600_000) / 1000)}:F>`);
+    expect(text).toContain(`Asked by **Alice** (<@200000000000000002>) in <#100000000000000001>`);
+    expect(text).toContain(
+      '**Where**\nNear **Little Free Library** (PokéStop) · 12 Market Street · [Map](<',
+    );
+    expect(text).toContain('**Information**\nBring a book.\n\nTake a book.');
+    expect(text).toContain(`Expires <t:${String((SAFETY_NOW + 23 * 3_600_000) / 1000)}:R>`);
+    // The Wayspot's picture beside where it is.
+    expect(thumbnailOf(message)).toBe(LIBRARY.image);
+    expect(
+      buttonsOf(message).map(({ label, customId, style }) => [label, customId, style]),
+    ).toEqual([
+      ['Approve', `msafety:${requestId(1)}:approve`, ButtonStyle.Success],
+      ['Approve once', `msafety:${requestId(1)}:approve-once`, ButtonStyle.Primary],
+      ['Refuse', `msafety:${requestId(1)}:refuse`, ButtonStyle.Secondary],
+      ['Refuse from now on', `msafety:${requestId(1)}:refuse-forever`, ButtonStyle.Danger],
+      ['Block member', `msafety:${requestId(1)}:block`, ButtonStyle.Danger],
+    ]);
+    expectV2Sendable(message);
+  });
+
+  it('offers no ruling for a pin: Approve once, Refuse and Block member', () => {
+    const message = requestMessage(pending({ place: SAFETY_PIN }));
+    expect(textOf(message)).toContain(
+      '**Where**\n📍 Near **Fountain Square** (PokéStop) · [Map](<',
+    );
+    expect(textOf(message)).toContain('A pin is approved for this meetup alone.');
+    expect(thumbnailOf(message)).toBeUndefined();
+    expect(buttonsOf(message).map((button) => button.label)).toEqual([
+      'Approve once',
+      'Refuse',
+      'Block member',
+    ]);
+  });
+
+  it('shows what members wrote as text, never as markdown, mentions or links', () => {
+    const message = requestMessage(
+      pending({
+        name: '**Big** @everyone',
+        description: '# Heading\n<@1234> [click](https://evil.example)',
+        makerName: '__Alice__',
+      }),
+    );
+    const text = textOf(message);
+    expect(text).not.toContain('**Big**');
+    expect(text).not.toMatch(/^# Heading/m);
+    expect(text).not.toContain('[click](');
+    expect(text).not.toContain('__Alice__');
+  });
+
+  it('fits the longest name, title and information with every character escaped', () => {
+    const message = requestMessage(
+      pending({
+        name: '*'.repeat(MAX_PARTY_NAME),
+        makerName: '_'.repeat(100),
+        description: '*'.repeat(MAX_MEETUP_DESCRIPTION),
+        place: { ...LIBRARY, title: '_'.repeat(255), address: '*'.repeat(500) },
+      }),
+    );
+    expectV2Sendable(message);
+    // The information is never cut.
+    expect(textOf(message)).toContain(plainLines('*'.repeat(MAX_MEETUP_DESCRIPTION)));
+  });
+});
diff --git a/src/render/meetup-safety.ts b/src/render/meetup-safety.ts
new file mode 100644
index 00000000..92eae5d7
--- /dev/null
+++ b/src/render/meetup-safety.ts
@@ -0,0 +1,169 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  type APIButtonComponent,
+  type APIComponentInContainer,
+} from 'discord.js';
+import { encodeCustomId } from '../discord/custom-id.js';
+import type { V2Message } from '../discord/party-gateway.js';
+import type { Place } from '../domain/geo/place.js';
+import type { MeetupRequestRecord, RequestDecision } from '../domain/meetups/records.js';
+import { wayspotPicture } from '../domain/wayspots/picture.js';
+import { nearLine } from './spawn.js';
+import { memberText, plain, plainLines, timestamp, truncate } from './text.js';
+import { actionRow, container, section, textDisplay, thumbnail } from './v2.js';
+
+/** The custom-id kind of the buttons of a moderators' post of a request (`msafety:<id>:<action>`). */
+export const SAFETY_KIND = 'msafety';
+
+/** The edge of a post that waits for a moderator: amber. */
+export const PENDING_ACCENT = 0xf0b232;
+/** The edge of a request that was approved: green. */
+export const APPROVED_ACCENT = 0x57f287;
+/** The edge of one that was refused or failed: red. */
+export const REFUSED_ACCENT = 0xed4245;
+/** The edge of one nobody decided in time: grey. */
+export const EXPIRED_ACCENT = 0x99aab5;
+
+/** As much of a place's title and address as the post shows: the information is never cut. */
+const TITLE_ROOM = 100;
+const ADDRESS_ROOM = 200;
+
+/** The buttons of a request's post, with their labels and styles, in their order. */
+type ActionStyle =
+  ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger;
+
+const BUTTONS: readonly [RequestDecision, string, ActionStyle][] = [
+  ['approve', 'Approve', ButtonStyle.Success],
+  ['approve-once', 'Approve once', ButtonStyle.Primary],
+  ['refuse', 'Refuse', ButtonStyle.Secondary],
+  ['refuse-forever', 'Refuse from now on', ButtonStyle.Danger],
+  ['block', 'Block member', ButtonStyle.Danger],
+];
+
+/** The decisions a request of this place may get: a pin has no ruling, so neither for good. */
+export function decisionsFor(place: Place): RequestDecision[] {
+  return BUTTONS.map(([decision]) => decision).filter(
+    (decision) => place.kind !== 'pin' || (decision !== 'approve' && decision !== 'refuse-forever'),
+  );
+}
+
+/** A place as the moderators' post shows it: title and address cut, the information never. */
+function placeLine(place: Place): string {
+  if (place.kind === 'pin') return nearLine(place);
+  return nearLine({
+    ...place,
+    title: truncate(place.title, TITLE_ROOM),
+    address: place.address === null ? null : truncate(place.address, ADDRESS_ROOM),
+  });
+}
+
+/** Who decided, as a sentence names them. */
+function decider(request: MeetupRequestRecord): string {
+  if (request.decidedBy === null) return 'a moderator';
+  return memberText({ id: request.decidedBy, name: request.decidedByName ?? undefined });
+}
+
+/** When it was decided, for the outcome's line. */
+function decidedWhen(request: MeetupRequestRecord): string {
+  return request.decidedAt === null ? '' : ` ${timestamp(request.decidedAt, 'R')}`;
+}
+
+/** What came of a request that is no longer pending, as the post's last line, and its edge. */
+function outcomeOf(
+  request: MeetupRequestRecord,
+  postId: string | undefined,
+): { line: string; accent: number } {
+  const by = `by ${decider(request)}${decidedWhen(request)}`;
+  const post = postId === undefined ? '' : ` Its post: <#${postId}>.`;
+  switch (request.status) {
+    case 'approved':
+      return {
+        accent: APPROVED_ACCENT,
+        line:
+          request.decision === 'approve'
+            ? `**Approved** ${by}: the meetup is posted, and the place is allowed from now on.${post}`
+            : `**Approved once** ${by}: the meetup is posted; the place is not allowed beyond it.${post}`,
+      };
+    case 'failed':
+      return {
+        accent: REFUSED_ACCENT,
+        line: `**Approved** ${by}, but the meetup could not be made. Its maker was told.`,
+      };
+    case 'refused':
+      return {
+        accent: REFUSED_ACCENT,
+        line:
+          request.decision === 'refuse-forever'
+            ? `**Refused from now on** ${by}: no meetup can be held at this place.`
+            : request.decision === 'block'
+              ? `**Refused** ${by}, and its maker is blocked from making meetups here.`
+              : `**Refused** ${by}.`,
+      };
+    case 'withdrawn':
+      return {
+        accent: REFUSED_ACCENT,
+        line: `**Refused** ${by}: its maker was blocked from making meetups here.`,
+      };
+    case 'expired':
+      return {
+        accent: EXPIRED_ACCENT,
+        line: `**Expired** ${timestamp(request.expiresAt, 'R')}: no moderator decided in time. Its maker was told.`,
+      };
+    case 'pending':
+      return { accent: PENDING_ACCENT, line: '' };
+  }
+}
+
+/**
+ * The moderators' post of a request (plan 8S-1): who asked (by `memberText`, so that a
+ * moderator can open their profile), in which region, the meetup's name and start, where it is
+ * (the place's kind, title, address and Map, a pin as `pinLine` shows it; the Wayspot's picture
+ * beside it), its information (never cut), and when the request expires; with the buttons of
+ * `decisionsFor` while it waits, and what came of it afterwards (who decided, and `postId`, the
+ * meetup's post, when one was made). Text members wrote is shown through `plain` (the name),
+ * `plainLines` (the information) and `plainNoLinks` (names and the place).
+ */
+export function requestMessage(
+  request: MeetupRequestRecord,
+  more: { postId?: string } = {},
+): V2Message {
+  const waiting = request.status === 'pending';
+  const outcome = outcomeOf(request, more.postId);
+  const maker = memberText({ id: request.makerId, name: request.makerName ?? undefined });
+  const head = [
+    waiting ? '### Meetup waiting for approval' : '### Meetup request',
+    `**${plain(request.name)}**`,
+    `Starts ${timestamp(request.startTime, 'F')} (${timestamp(request.startTime, 'R')})`,
+    `Asked by ${maker} in <#${request.regionChannelId}>`,
+  ].join('\n');
+  const where = `**Where**\n${placeLine(request.place)}`;
+  const picture = request.place.kind === 'pin' ? undefined : wayspotPicture(request.place.image);
+  const components: APIComponentInContainer[] = [
+    textDisplay(head),
+    picture === undefined ? textDisplay(where) : section(where, thumbnail(picture)),
+    textDisplay(`**Information**\n${plainLines(request.description)}`),
+  ];
+  if (waiting) {
+    const pinNote = request.place.kind === 'pin' ? ' A pin is approved for this meetup alone.' : '';
+    components.push(
+      textDisplay(
+        `-# Expires ${timestamp(request.expiresAt, 'R')} unless a moderator decides first.${pinNote}`,
+      ),
+      actionRow(
+        decisionsFor(request.place).map((decision): APIButtonComponent => {
+          const [, label, style] = BUTTONS.find(([one]) => one === decision) ?? BUTTONS[0]!;
+          return {
+            type: ComponentType.Button,
+            style,
+            label,
+            custom_id: encodeCustomId({ kind: SAFETY_KIND, id: request.id, action: decision }),
+          };
+        }),
+      ),
+    );
+  } else {
+    components.push(textDisplay(outcome.line));
+  }
+  return { v2: true, components: [container(outcome.accent, components)] };
+}
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
new file mode 100644
index 00000000..fe09cde0
--- /dev/null
+++ b/src/services/meetup-safety.test.ts
@@ -0,0 +1,176 @@
+import { describe, expect, it } from 'vitest';
+import { LIBRARY, MOD, SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
+import {
+  MOD_CHANNEL,
+  MODERATION,
+  meetupSafetyWith,
+} from '../../test/support/meetup-safety-service.js';
+import { buttonLabels, textOf } from '../../test/support/messages.js';
+import { ALICE, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import type { KnownPlace } from '../domain/geo/place.js';
+import { MAX_MEETUP_DESCRIPTION } from '../domain/party/party.js';
+import type { RequestAsk } from './meetup-safety.js';
+
+const HOUR = 60 * MINUTE;
+const SERVER = '412345678901234567';
+
+const PARK: KnownPlace = {
+  ...LIBRARY,
+  id: 'f0e1d2c3b4a5968778695a4b3c2d1e0f.16',
+  title: 'Riverside Park',
+};
+
+/** What `/meetup` asks the moderators for: Alice's book swap at the library, a day ahead. */
+function asked(more: Partial<RequestAsk> = {}): RequestAsk {
+  return {
+    serverId: SERVER,
+    regionChannelId: WEST_CHANNEL,
+    maker: { id: ALICE, name: 'Alice', team: 'mystic' as const },
+    place: LIBRARY,
+    name: '  Book   swap ',
+    startTime: PARTY_NOW + 24 * HOUR,
+    description: 'Bring a book.  \n\n\n\nTake a book.',
+    ...more,
+  };
+}
+
+describe('MeetupSafety.verdict', () => {
+  it('is off without a moderators’ channel: every place allowed, the storage never asked', async () => {
+    const made = await meetupSafetyWith({ moderation: null });
+    made.storage.failing.add('ruling');
+    made.storage.failing.add('block');
+    expect(made.safety.on).toBe(false);
+    for (const place of [SAFETY_PIN, LIBRARY]) {
+      expect(
+        await made.safety.verdict({ serverId: SERVER, place, makerId: ALICE, staff: false }),
+      ).toBe('allowed');
+    }
+  });
+
+  it('holds a pin and a flagged Wayspot, and follows the rulings and blocks of the server', async () => {
+    const made = await meetupSafetyWith();
+    expect(made.safety.on).toBe(true);
+    const verdict = (place: typeof LIBRARY | typeof SAFETY_PIN, staff = false) =>
+      made.safety.verdict({ serverId: SERVER, place, makerId: ALICE, staff });
+    expect(await verdict(PARK)).toBe('allowed');
+    expect(await verdict(LIBRARY)).toBe('review');
+    expect(await verdict(SAFETY_PIN)).toBe('review');
+    await made.storage.rule(SERVER, { kind: 'stop', id: LIBRARY.id }, 'allow', MOD);
+    expect(await verdict(LIBRARY)).toBe('allowed');
+    await made.storage.rule(SERVER, { kind: 'stop', id: PARK.id }, 'refuse', MOD);
+    expect(await verdict(PARK)).toBe('refused');
+    expect(await verdict(PARK, true)).toBe('allowed');
+    await made.storage.addBlock(SERVER, ALICE, MOD);
+    expect(await verdict(LIBRARY)).toBe('blocked');
+    expect(await verdict(SAFETY_PIN, true)).toBe('allowed');
+  });
+
+  it('adds the words of the settings to the flagged ones', async () => {
+    const made = await meetupSafetyWith({ flaggedWords: ['park'] });
+    expect(
+      await made.safety.verdict({ serverId: SERVER, place: PARK, makerId: ALICE, staff: false }),
+    ).toBe('review');
+  });
+
+  it('checks a gym by its official name as well as by the nickname its post shows', async () => {
+    const made = await meetupSafetyWith({ flaggedWords: ['public library'] });
+    // Gym 1 is the Pinewood Public Library, "The Stacks" to its members.
+    const stacks: KnownPlace = { ...LIBRARY, kind: 'gym', id: '1', title: 'The Stacks' };
+    expect(
+      await made.safety.verdict({ serverId: SERVER, place: stacks, makerId: ALICE, staff: false }),
+    ).toBe('review');
+    const fountain: KnownPlace = { ...stacks, id: '2', title: 'Old Stone Fountain' };
+    expect(
+      await made.safety.verdict({
+        serverId: SERVER,
+        place: fountain,
+        makerId: ALICE,
+        staff: false,
+      }),
+    ).toBe('allowed');
+  });
+});
+
+describe('MeetupSafety.submit', () => {
+  it('posts the request in the moderators’ channel and keeps it, pending', async () => {
+    const made = await meetupSafetyWith();
+    const outcome = await made.safety.submit(asked());
+    expect(outcome.kind).toBe('sent');
+    const [stored] = made.storage.requests.values();
+    expect(stored).toMatchObject({
+      serverId: SERVER,
+      regionChannelId: WEST_CHANNEL,
+      makerId: ALICE,
+      makerName: 'Alice',
+      makerTeam: 'mystic',
+      place: LIBRARY,
+      name: 'Book swap',
+      description: 'Bring a book.\n\nTake a book.',
+      createdAt: PARTY_NOW,
+      expiresAt: PARTY_NOW + 23 * HOUR,
+      status: 'pending',
+      channelId: MOD_CHANNEL,
+    });
+    const [post] = made.gateway.messagesIn(MOD_CHANNEL);
+    expect(stored?.messageId).toBe(post?.id);
+    expect(textOf(post?.message)).toContain('### Meetup waiting for approval');
+    expect(buttonLabels(post?.message)).toContain('Approve');
+  });
+
+  it('keeps nothing when the moderators’ channel is not there, and says so in the log', async () => {
+    const made = await meetupSafetyWith({ channel: false });
+    expect((await made.safety.submit(asked())).kind).toBe('not-sent');
+    expect(made.storage.requests.size).toBe(0);
+    expect(made.entries.map((entry) => entry.msg)).toContain(
+      `the moderators' channel #${MODERATION} is not there: a meetup was not sent for approval`,
+    );
+  });
+
+  it('keeps nothing when the post is refused', async () => {
+    const made = await meetupSafetyWith();
+    made.gateway.failing.set('sendMessage', new Error('Missing Access'));
+    expect((await made.safety.submit(asked())).kind).toBe('not-sent');
+    expect(made.storage.requests.size).toBe(0);
+    expect(made.entries.map((entry) => entry.msg)).toContain(
+      'could not send a meetup to the moderators for approval',
+    );
+  });
+
+  it('sends the post first, and takes it back when the request cannot be kept', async () => {
+    const made = await meetupSafetyWith();
+    made.storage.failing.add('addRequest');
+    expect((await made.safety.submit(asked())).kind).toBe('not-sent');
+    expect(made.storage.requests.size).toBe(0);
+    expect(made.gateway.deleted.map((one) => one.channelId)).toEqual([MOD_CHANNEL]);
+    expect(made.entries.map((entry) => entry.msg)).toContain(
+      'could not send a meetup to the moderators for approval',
+    );
+  });
+
+  it('refuses a name or information a meetup cannot have, and sends nothing', async () => {
+    const made = await meetupSafetyWith();
+    expect((await made.safety.submit(asked({ name: ' \u200b ' }))).kind).toBe('bad-name');
+    expect((await made.safety.submit(asked({ description: '  \n ' }))).kind).toBe(
+      'bad-description',
+    );
+    expect(
+      (await made.safety.submit(asked({ description: 'x'.repeat(MAX_MEETUP_DESCRIPTION + 1) })))
+        .kind,
+    ).toBe('bad-description');
+    expect(made.storage.requests.size).toBe(0);
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+  });
+
+  it('makes no request that would expire within the hour: a start two hours ahead at least', async () => {
+    const made = await meetupSafetyWith();
+    expect(
+      (await made.safety.submit(asked({ startTime: PARTY_NOW + 2 * HOUR - MINUTE }))).kind,
+    ).toBe('too-soon');
+    expect(made.storage.requests.size).toBe(0);
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+    expect((await made.safety.submit(asked({ startTime: PARTY_NOW + 2 * HOUR }))).kind).toBe(
+      'sent',
+    );
+  });
+});
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
new file mode 100644
index 00000000..35758e22
--- /dev/null
+++ b/src/services/meetup-safety.ts
@@ -0,0 +1,195 @@
+import { randomUUID } from 'node:crypto';
+import type { Settings } from '../config/settings.js';
+import type { PartyGateway } from '../discord/party-gateway.js';
+import type { Place } from '../domain/geo/place.js';
+import type { MeetupSafetyStore, MeetupRequestRecord } from '../domain/meetups/records.js';
+import {
+  flaggedWordsOf,
+  mayRequestReview,
+  meetupPlaceVerdict,
+  requestExpiry,
+  rulingKeyOf,
+  type MeetupVerdict,
+} from '../domain/meetups/safety.js';
+import type { MemberInfo } from '../domain/party/attendance.js';
+import { tidyDescription } from '../domain/party/meetup.js';
+import { tidyName } from '../domain/party/timed.js';
+import type { Logger } from '../log.js';
+import { requestMessage } from '../render/meetup-safety.js';
+import type { GymProvider } from './gym-directory.js';
+
+/** Who asks for a check of a place: the maker, in a server, and whether they are staff. */
+export interface PlaceAsk {
+  /** The server's snowflake. */
+  serverId: string;
+  place: Place;
+  makerId: string;
+  /** An admin, a moderator or the owner (`isStaff`): they skip the check. */
+  staff: boolean;
+}
+
+/** A meetup its maker asks for, as the moderators are asked about it. */
+export interface RequestAsk {
+  serverId: string;
+  /** The region channel `/meetup` was used in. */
+  regionChannelId: string;
+  maker: { id: string } & MemberInfo;
+  place: Place;
+  /** As typed: it is tidied as a meetup's name is. */
+  name: string;
+  startTime: number;
+  /** As typed: it is tidied as a meetup's information is. */
+  description: string;
+}
+
+/** What came of asking the moderators. */
+export type SubmitOutcome =
+  /** The post is in the moderators' channel and the request is kept. */
+  | { kind: 'sent'; request: MeetupRequestRecord }
+  /** The moderators' channel is not there, or the post failed: nothing is kept. */
+  | { kind: 'not-sent' }
+  /** The request would expire within the hour (`mayRequestReview`): nothing was sent. */
+  | { kind: 'too-soon' }
+  /** The name is no name a meetup may have (`tidyName`): nothing was sent. */
+  | { kind: 'bad-name' }
+  /** The information is empty or too long (`tidyDescription`): nothing was sent. */
+  | { kind: 'bad-description' };
+
+export interface MeetupSafetyOptions {
+  storage: MeetupSafetyStore;
+  gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage'>;
+  /** The gyms, by which a gym is checked by its official name and its nickname alike. */
+  gyms?: Pick<GymProvider, 'get'>;
+  settings: Settings;
+  log: Logger;
+  now?: () => number;
+}
+
+/**
+ * Meetup safety (plan 8S-1; spec `2026-10-17-meetup-safety-design.md`): the shared check of a
+ * place (`verdict`, which `/meetup` asks and 8M-5's meetups from the web map will ask), the
+ * requests held for the moderators in the channel `settings.channels.moderation` names (`submit`),
+ * their decisions and expiry, blocks and appeals. Everything is kept in the database
+ * (`MeetupSafetyStore`), so a press on a moderators' post works after a restart. Off (`on`
+ * false) without that setting: every place is allowed and nothing is kept.
+ */
+export class MeetupSafety {
+  private readonly now: () => number;
+  private readonly flaggedWords: readonly string[];
+
+  constructor(private readonly options: MeetupSafetyOptions) {
+    this.now = options.now ?? (() => Date.now());
+    this.flaggedWords = flaggedWordsOf(options.settings.meetupSafety?.flaggedWords);
+  }
+
+  /** Whether meetup safety is on: the settings name a moderators' channel. */
+  get on(): boolean {
+    return this.options.settings.channels.moderation !== undefined;
+  }
+
+  /** The name of the moderators' channel; undefined while the safety is off. */
+  get channelName(): string | undefined {
+    return this.options.settings.channels.moderation;
+  }
+
+  /**
+   * Whether a meetup at `place` may be posted at once, needs a moderator's approval, may not be
+   * held there or may not be made by this member (`meetupPlaceVerdict`), with the server's
+   * ruling of the place and the maker's block read from the storage. Nothing is read for staff
+   * or while the safety is off.
+   */
+  async verdict(ask: PlaceAsk): Promise<MeetupVerdict> {
+    const { storage } = this.options;
+    if (!this.on || ask.staff) return 'allowed';
+    const key = rulingKeyOf(ask.place);
+    const [block, ruling] = await Promise.all([
+      storage.block(ask.serverId, ask.makerId),
+      key === undefined ? Promise.resolve(undefined) : storage.ruling(ask.serverId, key),
+    ]);
+    return meetupPlaceVerdict({
+      on: true,
+      place: ask.place,
+      staff: false,
+      blocked: block !== undefined,
+      ruling,
+      flaggedWords: this.flaggedWords,
+      otherTitles: this.otherTitles(ask.place),
+    });
+  }
+
+  /** A gym's official name and nickname, which its title (the nickname first) may not show. */
+  private otherTitles(place: Place): string[] {
+    if (place.kind !== 'gym') return [];
+    const gym = this.options.gyms?.get(Number(place.id));
+    return gym === undefined ? [] : [gym.name, gym.nickname ?? ''].filter((title) => title !== '');
+  }
+
+  /**
+   * Asks the moderators about a meetup: its post is sent into the moderators' channel of the
+   * region's server, then the request is stored (pending) with it. Whatever fails leaves
+   * nothing behind (`not-sent`, logged; a post sent is taken back): the member is told to try
+   * later. A name or information a meetup cannot have (`tidyName`; `tidyDescription`, which must
+   * leave something) is refused (`bad-name`, `bad-description`), and a request that would leave
+   * the moderators less than an hour is not made (`too-soon`): nothing is sent.
+   */
+  async submit(ask: RequestAsk): Promise<SubmitOutcome> {
+    const { storage, gateway, log } = this.options;
+    const now = this.now();
+    const meetupName = tidyName(ask.name);
+    if (meetupName === undefined) return { kind: 'bad-name' };
+    const description = tidyDescription(ask.description);
+    if (description === undefined || description === null) return { kind: 'bad-description' };
+    if (!mayRequestReview(now, ask.startTime)) return { kind: 'too-soon' };
+    const name = this.channelName;
+    const channelId =
+      name === undefined ? undefined : gateway.findChannel(ask.regionChannelId, name);
+    if (channelId === undefined) {
+      log.warn(
+        { server: ask.serverId, channel: name },
+        `the moderators' channel #${name ?? ''} is not there: a meetup was not sent for approval`,
+      );
+      return { kind: 'not-sent' };
+    }
+    const request: MeetupRequestRecord = {
+      id: randomUUID(),
+      serverId: ask.serverId,
+      regionChannelId: ask.regionChannelId,
+      makerId: ask.maker.id,
+      makerName: ask.maker.name ?? null,
+      makerTeam: ask.maker.team ?? null,
+      place: ask.place,
+      name: meetupName,
+      startTime: ask.startTime,
+      description,
+      createdAt: now,
+      expiresAt: requestExpiry(now, ask.startTime),
+      status: 'pending',
+      channelId,
+      // The post is sent first: a request is never kept without one.
+      messageId: '',
+      decision: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+      partyId: null,
+    };
+    let messageId: string | undefined;
+    try {
+      messageId = await gateway.sendMessage(channelId, requestMessage(request));
+      if (messageId === undefined) throw new Error('the moderators’ channel is gone');
+      await storage.addRequest({ ...request, messageId });
+    } catch (err) {
+      log.warn(
+        { err, request: request.id },
+        'could not send a meetup to the moderators for approval',
+      );
+      if (messageId !== undefined) {
+        await gateway.deleteMessage(channelId, messageId).catch((deleteErr: unknown) => {
+          log.warn({ err: deleteErr }, 'could not take back the post of a meetup request');
+        });
+      }
+      return { kind: 'not-sent' };
+    }
+    return { kind: 'sent', request: { ...request, messageId } };
+  }
+}
diff --git a/src/services/party-service.meetup.test.ts b/src/services/party-service.meetup.test.ts
index 3ccb94af..779f6290 100644
--- a/src/services/party-service.meetup.test.ts
+++ b/src/services/party-service.meetup.test.ts
@@ -176,6 +176,33 @@ describe('PartyService.createMeetup', () => {
     expect(made.gateway.posts.get(made.postId)).toMatchObject({ edits: 0, renames: 0, retags: 0 });
   });
 
+  it('makes a meetup with its start and information in one post, announcing nothing', async () => {
+    const made = await createdMeetup({ startTime: START, description: 'Bring snacks.' });
+    expect(made.party).toMatchObject({
+      timed: { startTime: START },
+      meetup: { description: 'Bring snacks.' },
+    });
+    expect(made.gateway.posts.get(made.postId)).toMatchObject({ edits: 0 });
+    const shown = textOf(made.gateway.posts.get(made.postId)?.message);
+    expect(shown).toContain('Bring snacks.');
+    expect(shown).toContain(`<t:${String(START / 1000)}:`);
+    // No line in the post about a new start: the meetup was made with it.
+    expect(made.said()).toEqual([]);
+  });
+
+  it('makes nothing for information that is too long', async () => {
+    const made = await partyServiceWith();
+    expect(
+      await made.service.createMeetup({
+        name: 'Picnic',
+        creatorId: REPORTER,
+        regionChannelId: WEST_CHANNEL,
+        description: 'x'.repeat(1001),
+      }),
+    ).toEqual({ kind: 'bad-description' });
+    expect(made.storage.writes).toEqual([]);
+  });
+
   it('keeps meetups apart by nothing: two with one name are two meetups', async () => {
     const made = await createdMeetup();
     const second = await made.service.createMeetup({
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index aa122dab..4138fbc2 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -18,7 +18,7 @@ import {
 } from '../discord/party-gateway.js';
 import type { PartyEnd } from '../domain/history/party-history.js';
 import { applyAutoStatus, noteMember, type MemberInfo } from '../domain/party/attendance.js';
-import { createMeetup } from '../domain/party/meetup.js';
+import { createMeetup, tidyDescription } from '../domain/party/meetup.js';
 import {
   asKindOf,
   isMeetup,
@@ -175,9 +175,15 @@ export interface TimedRequest {
   regionChannelId: string;
 }
 
-/** A meetup, with where it is when its maker said (`/meetup near:`): set once, never changed. */
+/**
+ * A meetup, with where it is when its maker said (`/meetup near:`): set once, never changed;
+ * and since plan 8S-1 its start and information, which it is made with (no line announces
+ * them).
+ */
 export interface MeetupRequest extends TimedRequest {
   place?: MeetupPlace | null;
+  startTime?: number | null;
+  description?: string | null;
 }
 
 /** A train follows what its maker has set for the raids they report (`NewTrain`). */
@@ -207,7 +213,10 @@ export type TimedOutcome<P extends TimedParty> =
   /** The post went while it was being made (`NO_POST_MADE`): nothing was kept. */
   | { kind: 'no-post' };
 
-export type MeetupOutcome = TimedOutcome<MeetupParty>;
+export type MeetupOutcome =
+  | TimedOutcome<MeetupParty>
+  /** The information is longer than a meetup's may be (`tidyDescription`). */
+  | { kind: 'bad-description' };
 export type TrainOutcome = TimedOutcome<TrainParty>;
 
 /** What came of moving a raid to a gym of another region. */
@@ -759,10 +768,18 @@ export class PartyService {
    * are not kept apart by anything: two with one name are two meetups. Like a raid, a meetup is
    * never left active without a post, nor a post without its meetup.
    */
-  createMeetup(request: MeetupRequest): Promise<MeetupOutcome> {
-    const { place } = request;
+  async createMeetup(request: MeetupRequest): Promise<MeetupOutcome> {
+    const { place, startTime, description } = request;
+    if (description !== undefined && description !== null) {
+      if (tidyDescription(description) === undefined) return { kind: 'bad-description' };
+    }
     return this.createTimed(request, 'meetup', (input) =>
-      createMeetup({ ...input, ...(place === undefined ? {} : { place }) }),
+      createMeetup({
+        ...input,
+        ...(place === undefined ? {} : { place }),
+        ...(startTime === undefined ? {} : { startTime }),
+        ...(description === undefined ? {} : { description }),
+      }),
     );
   }
 
diff --git a/src/services/rehearsal.test.ts b/src/services/rehearsal.test.ts
index 21a478a9..8ed2105c 100644
--- a/src/services/rehearsal.test.ts
+++ b/src/services/rehearsal.test.ts
@@ -3,6 +3,7 @@ import { describe, expect, it, vi } from 'vitest';
 import { RecordingDms } from '../../test/support/dms.js';
 import { FakePartyGateway } from '../../test/support/fake-gateway.js';
 import { EAST_CHANNEL, EAST_FORUM, WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
+import { MOD_CHANNEL } from '../../test/support/meetup-safety-service.js';
 import { gymsFixture } from '../../test/support/providers.js';
 import { REPORTER } from '../../test/support/parties.js';
 import { partyServiceWith } from '../../test/support/party-service.js';
@@ -149,6 +150,7 @@ describe('rehearsalGateway', () => {
         byPost: (postId) => later.made?.store.byPost(postId),
         regions: () => later.made?.regions.all() ?? [],
         channelName: (channelId) => fake.channelName(channelId),
+        channelKind: (channelId) => fake.channelKind(channelId),
       }),
       log,
     );
@@ -194,6 +196,38 @@ describe('rehearsalGateway', () => {
     expect(fake.messagesIn('100000000000000099')).toEqual([]);
   });
 
+  it('lets the moderators’ posts of meetup safety into their channel, and nothing else beside', async () => {
+    const { log } = createTestLogger();
+    const fake = new FakePartyGateway();
+    fake.addChannel(MOD_CHANNEL, 'meetup-review');
+    fake.addChannel(WEST_CHANNEL, 'west');
+    // A forum (or any channel that is no text channel) of that name is not the one.
+    const forum = '600000000000000778';
+    fake.addChannel(forum, 'meetup-review', { kind: 'forum' });
+    const posts = (moderationChannel?: string) =>
+      rehearsalGateway(
+        fake,
+        rehearsalPosts({
+          rehearsal,
+          byPost: () => undefined,
+          regions: () => [],
+          channelName: (channelId) => fake.channelName(channelId),
+          channelKind: (channelId) => fake.channelKind(channelId),
+          ...(moderationChannel === undefined ? {} : { moderationChannel }),
+        }),
+        log,
+      );
+    const gateway = posts('meetup-review');
+    expect(await gateway.sendMessage(MOD_CHANNEL, { content: 'Meetup waiting' })).toBeDefined();
+    expect(await gateway.sendMessage(forum, { content: 'Meetup waiting' })).toBeUndefined();
+    expect(await gateway.sendMessage(WEST_CHANNEL, { content: 'New meetup' })).toBeUndefined();
+    // Without the setting, that channel is like any other.
+    expect(await posts().sendMessage(MOD_CHANNEL, { content: 'Appeal' })).toBeUndefined();
+    expect(fake.messagesIn(MOD_CHANNEL).map((one) => one.message.content)).toEqual([
+      'Meetup waiting',
+    ]);
+  });
+
   it('makes no post in the forum of a region it does not rehearse, nor a forum for it', async () => {
     const { service, gateway, fake, store } = await rehearsed();
     // Gym 8 lies in East: the report is refused as one where the forum is gone, leaving nothing.
diff --git a/src/services/rehearsal.ts b/src/services/rehearsal.ts
index 26b36ac1..62368ecc 100644
--- a/src/services/rehearsal.ts
+++ b/src/services/rehearsal.ts
@@ -1,6 +1,7 @@
 import { PermissionFlagsBits } from 'discord.js';
 import type { Settings } from '../config/settings.js';
 import { staffRoleKey, type CreatedChannel, type PartyGateway } from '../discord/party-gateway.js';
+import type { ServerChannel } from '../domain/regions/region-import.js';
 import type { Logger } from '../log.js';
 import type { DmJob, DmSender } from './dm-sender.js';
 
@@ -8,8 +9,9 @@ import type { DmJob, DmSender } from './dm-sender.js';
  * Rehearsal mode (`settings.rehearsal`, plan 8C): the bot with a production token against a copy
  * of the production database, while the legacy bot is off for a short while. Nothing of it may
  * reach members who are not in on it: direct messages go to the allowlist only (`RehearsalDms`),
- * nothing is posted but into the posts of parties in the rehearsed regions' forums
- * (`rehearsalGateway`), only staff and the allowlist are answered (the router), forums are made
+ * nothing is posted but into the posts of parties in the rehearsed regions' forums and the
+ * moderators' posts of meetup safety into their staff-only channel (`rehearsalGateway`; Matt,
+ * 2026-10-17), only staff and the allowlist are answered (the router), forums are made
  * only for the rehearsed regions and seen only by staff and the allowlist (`PartyService`), and
  * the cleanup of legacy channels only lists.
  */
@@ -123,7 +125,10 @@ export class RehearsalDms implements DmSender {
 
 /** Where the bot may post during a rehearsal (`rehearsalPosts`). */
 export interface RehearsalPosts {
-  /** A message into this channel: only into the post of a party in a rehearsed forum. */
+  /**
+   * A message into this channel: only into the post of a party in a rehearsed forum, or into the
+   * moderators' channel of meetup safety (its requests and appeals; staff-only).
+   */
   mayPostIn(channelId: string): boolean;
   /** A post in this forum: only in the forum of a rehearsed region. */
   mayCreatePostIn(forumId: string): boolean;
@@ -139,11 +144,20 @@ export interface RehearsalPostsOptions {
   regions: () => readonly { channelId: string; forumChannelId: string | null }[];
   /** A channel's name (`PartyGateway.channelName`). */
   channelName: (channelId: string) => string | undefined;
+  /** A channel's kind (`PartyGateway.channelKind`): the moderators' channel is a text channel. */
+  channelKind: (channelId: string) => ServerChannel['kind'] | undefined;
+  /**
+   * The name of the moderators' channel of meetup safety (`settings.channels.moderation`): the
+   * requests and appeals are posted there during a rehearsal too, for the staff who rehearse
+   * (Matt, 2026-10-17), into a text channel of that name alone, as `findChannel` finds it.
+   * Nothing else of the bot posts there.
+   */
+  moderationChannel?: string;
 }
 
 /** The rules of `RehearsalPosts` over the parties, the regions and the channels' names. */
 export function rehearsalPosts(options: RehearsalPostsOptions): RehearsalPosts {
-  const { rehearsal, byPost, regions, channelName } = options;
+  const { rehearsal, byPost, regions, channelName, channelKind, moderationChannel } = options;
   const rehearsedForum = (forumId: string): boolean =>
     regions().some(
       (region) =>
@@ -151,6 +165,13 @@ export function rehearsalPosts(options: RehearsalPostsOptions): RehearsalPosts {
     );
   return {
     mayPostIn(channelId) {
+      if (
+        moderationChannel !== undefined &&
+        channelName(channelId) === moderationChannel &&
+        channelKind(channelId) === 'text'
+      ) {
+        return true;
+      }
       const forumId = byPost(channelId)?.forumChannelId;
       return forumId !== undefined && forumId !== null && rehearsedForum(forumId);
     },
@@ -178,7 +199,7 @@ const GUARDED: ReadonlySet<string> = new Set<GuardedMethod>([
 
 /**
  * The gateway as a rehearsal uses it: a message, a post or a forum where `posts` does not allow
- * it is not sent (logged, answered as Discord answers for a channel that is gone: undefined);
+ * it (beside the posts of parties, only the moderators' posts of meetup safety) is not sent (logged, answered as Discord answers for a channel that is gone: undefined);
  * everything else goes to `inner` as it is. So no announcement reaches a channel (the boss list,
  * gyms and Wayfarer imports, the link to a new post in its region's channel, copies in the
  * remote and elite channels, spawn reports and their Unown copies), whoever sends it. No
diff --git a/test/support/meetup-safety-service.ts b/test/support/meetup-safety-service.ts
new file mode 100644
index 00000000..f411abaf
--- /dev/null
+++ b/test/support/meetup-safety-service.ts
@@ -0,0 +1,50 @@
+import type { Party } from '../../src/domain/party/party.js';
+import { MeetupSafety } from '../../src/services/meetup-safety.js';
+import { MemoryMeetupSafety } from './meetup-safety.js';
+import { partyServiceWith, type ServiceOverrides } from './party-service.js';
+
+/** The name of the moderators' channel in the tests of meetup safety. */
+export const MODERATION = 'meetup-review';
+/** The moderators' channel on the fake gateway. */
+export const MOD_CHANNEL = '600000000000000777';
+
+export interface SafetyOptions {
+  /** The name the settings give the moderators' channel; null for none (the safety off). */
+  moderation?: string | null;
+  /** Whether the server has that channel. Default yes. */
+  channel?: boolean;
+  /** `settings.meetupSafety.flaggedWords`. */
+  flaggedWords?: string[];
+}
+
+/**
+ * Meetup safety over the services of `partyServiceWith` (the fake gateway, the party service,
+ * the store, the clock, the recorded DMs) and `MemoryMeetupSafety` (`storage`): the settings
+ * name the moderators' channel `MODERATION`, which the server has as `MOD_CHANNEL`, unless
+ * `options` say otherwise.
+ */
+export async function meetupSafetyWith(
+  options: SafetyOptions = {},
+  parties: readonly Party[] = [],
+  overrides: ServiceOverrides = {},
+) {
+  const made = await partyServiceWith(parties, overrides);
+  const { moderation = MODERATION, channel = true, flaggedWords } = options;
+  const { moderation: _none, ...channels } = made.settings.channels;
+  const settings = {
+    ...made.settings,
+    channels: moderation === null ? channels : { ...channels, moderation },
+    ...(flaggedWords === undefined ? {} : { meetupSafety: { flaggedWords } }),
+  };
+  if (channel && moderation !== null) made.gateway.addChannel(MOD_CHANNEL, moderation);
+  const storage = new MemoryMeetupSafety();
+  const safety = new MeetupSafety({
+    storage,
+    gateway: made.gateway,
+    gyms: made.gyms,
+    settings,
+    log: made.log,
+    now: () => made.clock.now,
+  });
+  return { ...made, settings, storage, safety };
+}
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index ea5dfd98..3e7a9ce6 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -43,6 +43,9 @@ import { MemoryUsers } from './users.js';
 import { MemoryWants } from './wants.js';
 import { noWayspots } from './wayspots.js';
 import { LoginLinks } from '../../src/web/login-links.js';
+import { MeetupSafety } from '../../src/services/meetup-safety.js';
+import type { PartyGateway } from '../../src/discord/party-gateway.js';
+import { MemoryMeetupSafety } from './meetup-safety.js';
 
 export { TEST_SETTINGS_PATH };
 
@@ -142,6 +145,9 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       'spawns',
       'pass { spawns } from partyServiceWith(), or a SpawnService over a fake gateway',
     ),
+    // Off, as the test settings have no moderators' channel; a test of meetup safety passes its
+    // own from meetupSafetyWith().
+    meetupSafety: undefined as unknown as MeetupSafety,
     // Every click is answered by itself; a test of bursts passes its own with a window.
     clickAnswers: new ClickAnswers({ log, windowMs: 0 }),
     // Searches the catalogue of the context's own game data, built when first used.
@@ -172,6 +178,17 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     placeFinder: undefined as unknown as PlaceFinder,
     ...overrides,
   };
+  if (overrides.meetupSafety === undefined) {
+    (ctx as { meetupSafety: MeetupSafety }).meetupSafety = new MeetupSafety({
+      storage: new MemoryMeetupSafety(),
+      gateway: unavailable<PartyGateway>(
+        'gateway for meetup safety',
+        'pass { meetupSafety: safety } from meetupSafetyWith()',
+      ),
+      settings: ctx.config.settings,
+      log,
+    });
+  }
   if (overrides.placeFinder === undefined) {
     (ctx as { placeFinder: PlaceFinder }).placeFinder = new PlaceFinder({
       gyms: ctx.gyms,
````

### Task 4: Plan 8S-1 T4: Meetup safety: the moderators decide, and requests expire

Prototype commit: `27076c273e182efd6bc04b08add40d640396e1b8`

The buttons of a moderators' post (msafety:<request id>:<decision>,
staff only, a throttle of their own) are decided by MeetupSafety.decide:
one conditional change of the stored request, so the first press wins
and a later one is told who decided what. Approve and Approve once make
the meetup as its maker asked (a failure marks the request failed and
says why); Approve allows the place for good, Refuse from now on refuses
it; a pin has neither. The post is edited to the outcome without its
buttons and the maker is told by DM (approved with Go to post, refused,
expired; never why). Pending requests whose time is up expire at every
tick of the party clock.

**Files:**

```
 src/app.ts                            |  20 +++--
 src/components/index.ts               |   2 +
 src/components/meetup-safety.test.ts  | 128 ++++++++++++++++++++++++++
 src/components/meetup-safety.ts       | 104 +++++++++++++++++++++
 src/discord/custom-id.ts              |   5 +-
 src/render/meetup-safety.ts           |  49 +++++++++-
 src/services/meetup-safety.test.ts    | 265 ++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/services/meetup-safety.ts         | 265 +++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/services/party-scheduler.test.ts  |  68 ++++++++++++++
 src/services/party-scheduler.ts       |  25 ++++++
 test/support/meetup-safety-service.ts |  34 ++++++-
 test/support/test-context.ts          |   2 +
 12 files changed, 946 insertions(+), 21 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/components/meetup-safety.test.ts src/services/meetup-safety.test.ts src/services/party-scheduler.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 27076c273e182efd6bc04b08add40d640396e1b8 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8s1-meetup-safety.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-1 T4: Meetup safety: the moderators decide, and requests expire`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/app.ts b/src/app.ts
index f7b8dcb9..42e590c9 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -523,9 +523,21 @@ export async function startApp(
       store: new WebSessionRepository(db),
       secure: config.settings.web.publicUrl.startsWith('https:'),
     });
+  // Meetup safety (plan 8S-1): off without settings.channels.moderation. Its requests expire
+  // with the clock.
+  const meetupSafety = new MeetupSafety({
+    storage: new MeetupSafetyRepository(db, log),
+    gateway: partyGateway,
+    gyms,
+    parties: partyService,
+    dms: memberDms,
+    settings: config.settings,
+    log,
+  });
   const scheduler = new PartyScheduler({
     store: parties,
     history: partyHistory,
+    requests: meetupSafety,
     posts: partyService,
     attendance,
     access,
@@ -561,14 +573,6 @@ export async function startApp(
     log,
   });
   const clickAnswers = new ClickAnswers({ log });
-  // Meetup safety (plan 8S-1): off without settings.channels.moderation.
-  const meetupSafety = new MeetupSafety({
-    storage: new MeetupSafetyRepository(db, log),
-    gateway: partyGateway,
-    gyms,
-    settings: config.settings,
-    log,
-  });
   // The client that ended up connected, for what talks to Discord's REST API through it.
   let liveClient: Client | undefined;
   const legacyCleanup = new LegacyCleanup({
diff --git a/src/components/index.ts b/src/components/index.ts
index 81bbe9bc..dc051d46 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -20,6 +20,7 @@ import { screenshotControls } from '../commands/screenshots/feedback.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { dmControls } from './dm.js';
 import { gymReviewControls } from './gym-review.js';
+import { meetupSafetyControls } from './meetup-safety.js';
 import { partyButtons } from './party.js';
 
 /** Every handler of buttons, select menus and modals. The router reads this list. */
@@ -28,6 +29,7 @@ export const components: readonly ComponentHandler[] = [
   locationControls,
   infoControls,
   meetupFormControls,
+  meetupSafetyControls,
   wantControls,
   wantListControls,
   targetControls,
diff --git a/src/components/meetup-safety.test.ts b/src/components/meetup-safety.test.ts
new file mode 100644
index 00000000..478d25bf
--- /dev/null
+++ b/src/components/meetup-safety.test.ts
@@ -0,0 +1,128 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import { fakeButton, sent, type FakeInteraction } from '../../test/support/fake-interactions.js';
+import { MODERATOR, requestId, SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL, meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
+import { ALICE, BOB } from '../../test/support/parties.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
+import { meetupSafetyControls, SAFETY_THROTTLE } from './meetup-safety.js';
+
+async function setup() {
+  const made = await meetupSafetyWith();
+  const { ctx } = createTestContext({
+    partyService: made.service,
+    attendance: made.attendance,
+    parties: made.store,
+    regions: made.regions,
+    meetupSafety: made.safety,
+  });
+  const router = new InteractionRouter(ctx, [], [meetupSafetyControls]);
+  /** A press of a button of a request's post, by the moderator unless `extra` says otherwise. */
+  const press = async (
+    id: string,
+    action: string,
+    extra: object = {},
+  ): Promise<FakeInteraction> => {
+    const interaction = fakeButton({
+      customId: `msafety:${id}:${action}`,
+      channelId: MOD_CHANNEL,
+      userId: MODERATOR,
+      displayName: 'Mod',
+      roleNames: ['Moderator'],
+      v2Message: true,
+      ...extra,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const meetups = () => made.store.active().filter((party) => party.type === 'meetup');
+  return { ...made, ctx, press, meetups };
+}
+
+/** What the presser was told, privately. */
+function told(used: FakeInteraction): string | undefined {
+  for (const responder of [used.editReply, used.reply, used.followUp]) {
+    if (responder.mock.calls.length > 0) return sent(responder).content;
+  }
+  return undefined;
+}
+
+describe('the buttons of a moderators’ post', () => {
+  it('approves, and tells the moderator privately what came of it', async () => {
+    const made = await setup();
+    const request = await made.held();
+    const used = await made.press(request.id, 'approve');
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    const [party] = made.meetups();
+    expect(told(used)).toBe(
+      `Approved: the meetup is posted (<#${party?.forumPostId ?? ''}>), and the place is ` +
+        'allowed from now on. Its maker is told.',
+    );
+  });
+
+  it('says what each decision did', async () => {
+    const made = await setup();
+    const once = await made.held({ place: SAFETY_PIN });
+    const refuse = await made.held({ name: 'Two' });
+    const forGood = await made.held({ name: 'Three' });
+    const approved = await made.press(once.id, 'approve-once');
+    expect(told(approved)).toBe(
+      `Approved once: the meetup is posted (<#${made.meetups()[0]?.forumPostId ?? ''}>). ` +
+        'Its maker is told.',
+    );
+    expect(told(await made.press(refuse.id, 'refuse'))).toBe('Refused. Its maker is told.');
+    expect(told(await made.press(forGood.id, 'refuse-forever'))).toBe(
+      'Refused, and no meetup can be held at this place from now on. Its maker is told.',
+    );
+  });
+
+  it('tells a later press who decided what', async () => {
+    const made = await setup();
+    const request = await made.held();
+    await made.press(request.id, 'refuse');
+    const later = await made.press(request.id, 'approve', { userId: BOB, displayName: 'Bob' });
+    expect(told(later)).toMatch(
+      new RegExp(
+        `^\\*\\*Mod\\*\\* \\(<@${MODERATOR}>\\) decided this already <t:\\d+:R>: refused\\.$`,
+      ),
+    );
+    expect(made.meetups()).toEqual([]);
+  });
+
+  it('refuses anybody but staff, privately and without counting', async () => {
+    const made = await setup();
+    const request = await made.held();
+    for (let n = 0; n < SAFETY_THROTTLE.uses + 1; n++) {
+      const used = await made.press(request.id, 'approve', { userId: ALICE, roleNames: [] });
+      expect(told(used)).toBe('Only admins and moderators can do that.');
+    }
+    expect(made.storage.requests.get(request.id)?.status).toBe('pending');
+  });
+
+  it('answers a press it does not know as a control no longer active', async () => {
+    const made = await setup();
+    const request = await made.held();
+    expect(told(await made.press(request.id, 'cheer'))).toBe(STALE_COMPONENT);
+    expect(told(await made.press(requestId(9), 'approve'))).toBe(STALE_COMPONENT);
+    expect(told(await made.press(request.id, 'approve'))).toMatch(/^Approved/);
+  });
+
+  it('says that nobody decided in time of a request whose time is up', async () => {
+    const made = await setup();
+    const request = await made.held();
+    made.clock.now = request.expiresAt;
+    expect(told(await made.press(request.id, 'approve'))).toBe(
+      'This request has expired: nobody decided in time.',
+    );
+    expect(made.meetups()).toEqual([]);
+  });
+
+  it('says that a pin has no ruling', async () => {
+    const made = await setup();
+    const request = await made.held({ place: SAFETY_PIN });
+    expect(told(await made.press(request.id, 'approve'))).toBe(
+      'A pin has no ruling: approve it or refuse it for this meetup alone.',
+    );
+  });
+});
diff --git a/src/components/meetup-safety.ts b/src/components/meetup-safety.ts
new file mode 100644
index 00000000..14b9173d
--- /dev/null
+++ b/src/components/meetup-safety.ts
@@ -0,0 +1,104 @@
+import { MessageFlags } from 'discord.js';
+import type { ComponentHandler } from '../discord/command.js';
+import { UserError } from '../discord/errors.js';
+import { guildIdOf, requireGuild, requireManagement } from '../discord/guards.js';
+import { memberInfo } from '../discord/member-info.js';
+import { STALE_COMPONENT } from '../discord/router.js';
+import type { Throttle } from '../discord/throttle.js';
+import { REQUEST_DECISIONS, type MeetupRequestRecord } from '../domain/meetups/records.js';
+import { SAFETY_KIND } from '../render/meetup-safety.js';
+import { memberText, timestamp } from '../render/text.js';
+import type { DecideOutcome } from '../services/meetup-safety.js';
+
+/** How often one moderator may press the buttons of the moderators' posts. */
+export const SAFETY_THROTTLE: Throttle = { uses: 20, perSeconds: 60 };
+
+/** What a request's decision was, for a press that came second. */
+function decidedAs(request: MeetupRequestRecord): string {
+  switch (request.status) {
+    case 'approved':
+      return request.decision === 'approve' ? 'approved' : 'approved once';
+    case 'failed':
+      return 'approved, but the meetup could not be made';
+    case 'refused':
+      return request.decision === 'refuse-forever'
+        ? 'refused from now on'
+        : request.decision === 'block'
+          ? 'refused, and its maker blocked'
+          : 'refused';
+    case 'withdrawn':
+      return 'refused: its maker was blocked';
+    case 'expired':
+    case 'pending':
+      return 'expired';
+  }
+}
+
+/** What the moderator who pressed is told, privately. */
+export function decisionWords(outcome: DecideOutcome): string {
+  switch (outcome.kind) {
+    case 'gone':
+      return STALE_COMPONENT;
+    case 'not-for-a-pin':
+      return 'A pin has no ruling: approve it or refuse it for this meetup alone.';
+    case 'expired':
+      return 'This request has expired: nobody decided in time.';
+    case 'decided-before': {
+      const { request } = outcome;
+      if (request.status === 'expired') {
+        return `This request expired ${timestamp(request.expiresAt, 'R')}: nobody decided in time.`;
+      }
+      const who =
+        request.decidedBy === null
+          ? 'A moderator'
+          : memberText({ id: request.decidedBy, name: request.decidedByName ?? undefined });
+      const when = request.decidedAt === null ? '' : ` ${timestamp(request.decidedAt, 'R')}`;
+      return `${who} decided this already${when}: ${decidedAs(request)}.`;
+    }
+    case 'done': {
+      const { request, postId, failure } = outcome;
+      const post = postId === undefined ? '' : ` (<#${postId}>)`;
+      if (failure !== undefined) {
+        return `Approved, but the meetup could not be made: ${failure}. Its maker is told.`;
+      }
+      switch (request.decision) {
+        case 'approve':
+          return `Approved: the meetup is posted${post}, and the place is allowed from now on. Its maker is told.`;
+        case 'approve-once':
+          return `Approved once: the meetup is posted${post}. Its maker is told.`;
+        case 'refuse-forever':
+          return 'Refused, and no meetup can be held at this place from now on. Its maker is told.';
+        default:
+          return 'Refused. Its maker is told.';
+      }
+    }
+  }
+}
+
+/**
+ * The buttons of a moderators' post of a meetup request (plan 8S-1; custom-id kind `msafety`):
+ * `msafety:<request id>:approve|approve-once|refuse|refuse-forever|block`. Only staff may press
+ * them (admins, moderators and the owner, as for `/delete`); anybody else is refused privately,
+ * uncounted. The request is read from the database, so a post from before a restart works; the
+ * decision is the service's (`MeetupSafety.decide`), which edits the post for everybody, and the
+ * presser is told privately what came of it.
+ */
+export const meetupSafetyControls: ComponentHandler = {
+  kind: SAFETY_KIND,
+  guards: [requireGuild, requireManagement],
+  throttle: SAFETY_THROTTLE,
+
+  async button(interaction, id, ctx) {
+    const decision = REQUEST_DECISIONS.find((one) => one === id.action);
+    if (decision === undefined) throw new UserError(STALE_COMPONENT);
+    // Making the meetup takes longer than Discord waits for an answer.
+    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+    const outcome = await ctx.meetupSafety.decide(
+      id.id,
+      decision,
+      { id: interaction.user.id, name: memberInfo(interaction).name },
+      guildIdOf(interaction),
+    );
+    await interaction.editReply({ content: decisionWords(outcome) });
+  },
+};
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 9579baac..658d4d37 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -95,7 +95,10 @@
  *
  * The form `/meetup` opens for a meetup's information (plan 8S-1) is `meetup:<token>:form`: the
  * token is that of what the command was used with (name, place, start), kept for half an hour
- * (`src/commands/meetups/meetup.ts`).
+ * (`src/commands/meetups/meetup.ts`). The buttons of the moderators' post of a meetup held for
+ * them have the kind `msafety` and the request's UUID as the id:
+ * `msafety:<request id>:approve|approve-once|refuse|refuse-forever|block`
+ * (`src/components/meetup-safety.ts`); the request is read from the database.
  *
  * "Change options…" under an answer of `/counters` is `counters:<token>:options`, and the dialog
  * it opens `counters:<token>:dialog`: the token is that of the answer's options, kept for a day
diff --git a/src/render/meetup-safety.ts b/src/render/meetup-safety.ts
index 92eae5d7..3b855bb4 100644
--- a/src/render/meetup-safety.ts
+++ b/src/render/meetup-safety.ts
@@ -10,8 +10,16 @@ import type { Place } from '../domain/geo/place.js';
 import type { MeetupRequestRecord, RequestDecision } from '../domain/meetups/records.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
 import { nearLine } from './spawn.js';
-import { memberText, plain, plainLines, timestamp, truncate } from './text.js';
-import { actionRow, container, section, textDisplay, thumbnail } from './v2.js';
+import { memberText, plain, plainLines, plainNoLinks, timestamp, truncate } from './text.js';
+import {
+  actionRow,
+  container,
+  linkButton,
+  section,
+  textDisplay,
+  textMessage,
+  thumbnail,
+} from './v2.js';
 
 /** The custom-id kind of the buttons of a moderators' post of a request (`msafety:<id>:<action>`). */
 export const SAFETY_KIND = 'msafety';
@@ -115,6 +123,43 @@ function outcomeOf(
   }
 }
 
+/**
+ * The direct message that tells a request's maker what came of it (the design: approved with a
+ * link to the post, refused, expired; never why). `postUrl` is the address of the meetup's post
+ * (`postLink`), `failure` why an approved meetup could not be made. The name goes through
+ * `plainNoLinks`, as all text of members in DMs.
+ */
+export function requestOutcomeDm(
+  request: MeetupRequestRecord,
+  more: { postUrl?: string; failure?: string } = {},
+): V2Message {
+  const name = `**${plainNoLinks(request.name)}**`;
+  switch (request.status) {
+    case 'approved':
+      return textMessage(
+        APPROVED_ACCENT,
+        [`A moderator approved your meetup ${name}: it is posted.`],
+        more.postUrl === undefined
+          ? []
+          : [actionRow([linkButton('Go to post', undefined, more.postUrl)])],
+      );
+    case 'failed':
+      return textMessage(REFUSED_ACCENT, [
+        `A moderator approved your meetup ${name}, but I could not make it: ` +
+          `${more.failure ?? 'something went wrong'}. Use \`/meetup\` again later.`,
+      ]);
+    case 'expired':
+      return textMessage(EXPIRED_ACCENT, [
+        `No moderator decided on your meetup ${name} in time, so it is not posted. Use ` +
+          '`/meetup` again with a later start.',
+      ]);
+    default:
+      return textMessage(REFUSED_ACCENT, [
+        `A moderator did not approve your meetup ${name}, so it is not posted.`,
+      ]);
+  }
+}
+
 /**
  * The moderators' post of a request (plan 8S-1): who asked (by `memberText`, so that a
  * moderator can open their profile), in which region, the meetup's name and start, where it is
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
index fe09cde0..07444e0d 100644
--- a/src/services/meetup-safety.test.ts
+++ b/src/services/meetup-safety.test.ts
@@ -1,13 +1,21 @@
-import { describe, expect, it } from 'vitest';
-import { LIBRARY, MOD, SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
+import { describe, expect, it, vi } from 'vitest';
+import {
+  LIBRARY,
+  MOD,
+  MODERATOR,
+  newRequest,
+  OTHER_SERVER,
+  requestId,
+  SAFETY_PIN,
+} from '../../test/support/meetup-safety-cases.js';
 import {
   MOD_CHANNEL,
   MODERATION,
   meetupSafetyWith,
 } from '../../test/support/meetup-safety-service.js';
-import { buttonLabels, textOf } from '../../test/support/messages.js';
-import { ALICE, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
-import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { buttonLabels, linksOf, textOf } from '../../test/support/messages.js';
+import { ALICE, BOB, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
+import { WEST_CHANNEL, WEST_FORUM } from '../../test/support/gyms.js';
 import type { KnownPlace } from '../domain/geo/place.js';
 import { MAX_MEETUP_DESCRIPTION } from '../domain/party/party.js';
 import type { RequestAsk } from './meetup-safety.js';
@@ -174,3 +182,250 @@ describe('MeetupSafety.submit', () => {
     );
   });
 });
+
+const MODERATOR_MEMBER = { id: MODERATOR, name: 'Mod' };
+
+describe('MeetupSafety.decide', () => {
+  it('approves: the meetup is made as its maker asked, the place allowed for good', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    made.clock.now += HOUR;
+    const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
+    expect(outcome.kind).toBe('done');
+    const [party] = made.store.active().filter((one) => one.type === 'meetup');
+    expect(party).toMatchObject({
+      createdById: ALICE,
+      forumChannelId: WEST_FORUM,
+      timed: { name: 'Book swap', startTime: request.startTime },
+      meetup: { description: 'Bring a book.', place: LIBRARY },
+    });
+    expect(party?.attendees[ALICE]).toMatchObject({ name: 'Alice', team: 'mystic' });
+    expect(made.storage.requests.get(request.id)).toMatchObject({
+      status: 'approved',
+      decision: 'approve',
+      decidedBy: MODERATOR,
+      decidedByName: 'Mod',
+      decidedAt: PARTY_NOW + HOUR,
+      partyId: party?.id,
+    });
+    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBe('allow');
+    // The moderators' post says what came of it, without its buttons.
+    const post = made.postOf(request);
+    expect(textOf(post?.message)).toContain(
+      `**Approved** by **Mod** (<@${MODERATOR}>) <t:${String((PARTY_NOW + HOUR) / 1000)}:R>`,
+    );
+    expect(textOf(post?.message)).toContain(`<#${party?.forumPostId ?? ''}>`);
+    expect(buttonLabels(post?.message)).toEqual([]);
+    // The maker is told, with a way to the post.
+    const [dm] = made.dms.to(ALICE);
+    expect(textOf(dm)).toBe('A moderator approved your meetup **Book swap**: it is posted.');
+    expect(linksOf(dm)).toEqual([
+      `Go to post https://discord.com/channels/${SERVER}/${party?.forumPostId ?? ''}`,
+    ]);
+  });
+
+  it('approves once: the meetup is made, and the place has no ruling', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held({ place: SAFETY_PIN });
+    expect(
+      (await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SERVER)).kind,
+    ).toBe('done');
+    expect(made.store.active().filter((one) => one.type === 'meetup')).toHaveLength(1);
+    expect(made.storage.rulings.size).toBe(0);
+    expect(textOf(made.postOf(request)?.message)).toContain('**Approved once** by **Mod**');
+  });
+
+  it('refuses, for this meetup or for good, and tells the maker without saying why', async () => {
+    const made = await meetupSafetyWith();
+    const once = await made.held();
+    const forGood = await made.held({ name: 'Book swap two' });
+    await made.safety.decide(once.id, 'refuse', MODERATOR_MEMBER, SERVER);
+    expect(made.storage.rulings.size).toBe(0);
+    await made.safety.decide(forGood.id, 'refuse-forever', MODERATOR_MEMBER, SERVER);
+    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBe('refuse');
+    expect(made.store.active().filter((one) => one.type === 'meetup')).toEqual([]);
+    expect(made.storage.requests.get(forGood.id)).toMatchObject({
+      status: 'refused',
+      decision: 'refuse-forever',
+    });
+    expect(textOf(made.postOf(once)?.message)).toContain('**Refused** by **Mod**');
+    expect(textOf(made.postOf(forGood)?.message)).toContain('**Refused from now on** by **Mod**');
+    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
+      'A moderator did not approve your meetup **Book swap**, so it is not posted.',
+      'A moderator did not approve your meetup **Book swap two**, so it is not posted.',
+    ]);
+  });
+
+  it('lets the first decision win and tells a later one who decided what', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    await made.safety.decide(request.id, 'refuse', MODERATOR_MEMBER, SERVER);
+    const later = await made.safety.decide(request.id, 'approve', { id: BOB, name: 'Bob' }, SERVER);
+    expect(later).toMatchObject({
+      kind: 'decided-before',
+      request: { status: 'refused', decidedBy: MODERATOR },
+    });
+    expect(made.store.active().filter((one) => one.type === 'meetup')).toEqual([]);
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('gives a pin no ruling: Approve and Refuse from now on are not for it', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held({ place: SAFETY_PIN });
+    for (const decision of ['approve', 'refuse-forever'] as const) {
+      expect((await made.safety.decide(request.id, decision, MODERATOR_MEMBER, SERVER)).kind).toBe(
+        'not-for-a-pin',
+      );
+    }
+    expect(made.storage.requests.get(request.id)?.status).toBe('pending');
+  });
+
+  it('knows no request of another server, nor one that is gone', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    expect(
+      (await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, OTHER_SERVER)).kind,
+    ).toBe('gone');
+    expect((await made.safety.decide(requestId(9), 'approve', MODERATOR_MEMBER, SERVER)).kind).toBe(
+      'gone',
+    );
+  });
+
+  it('marks an approval failed when the meetup cannot be made, and tells the maker', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    // The region's forum is gone meanwhile.
+    await made.regions.setForum(1, null);
+    const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
+    expect(outcome).toMatchObject({ kind: 'done', failure: 'its region has no forum' });
+    expect(made.storage.requests.get(request.id)).toMatchObject({
+      status: 'failed',
+      partyId: null,
+    });
+    expect(textOf(made.postOf(request)?.message)).toContain('but the meetup could not be made');
+    expect(textOf(made.dms.to(ALICE)[0])).toBe(
+      'A moderator approved your meetup **Book swap**, but I could not make it: its region has ' +
+        'no forum. Use `/meetup` again later.',
+    );
+  });
+
+  it('writes no ruling for an approval whose meetup could not be made', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    await made.regions.setForum(1, null);
+    await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
+    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBeUndefined();
+  });
+
+  it('shows the outcome and tells the maker even when what is kept of it cannot be written', async () => {
+    for (const failing of ['rule', 'settleApproval'] as const) {
+      const made = await meetupSafetyWith();
+      const request = await made.held();
+      made.storage.failing.add(failing);
+      const outcome = await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
+      expect(outcome.kind).toBe('done');
+      const [party] = made.store.active().filter((one) => one.type === 'meetup');
+      expect(party).toBeDefined();
+      expect(textOf(made.postOf(request)?.message)).toContain('**Approved** by **Mod**');
+      expect(textOf(made.dms.to(ALICE)[0])).toBe(
+        'A moderator approved your meetup **Book swap**: it is posted.',
+      );
+      expect(made.entries.map((entry) => entry.msg)).toContain(
+        'could not keep what came of an approved meetup request',
+      );
+    }
+  });
+
+  it('tries once more to keep the meetup of an approval when the first write fails', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    vi.spyOn(made.storage, 'settleApproval').mockRejectedValueOnce(
+      new Error('the database blinked'),
+    );
+    await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER);
+    const [party] = made.store.active().filter((one) => one.type === 'meetup');
+    expect(made.storage.requests.get(request.id)).toMatchObject({
+      status: 'approved',
+      partyId: party?.id,
+    });
+  });
+
+  it('lets one of two decisions at the same moment win, and makes one meetup at most', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    const both = await Promise.all([
+      made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SERVER),
+      made.safety.decide(request.id, 'refuse', { id: BOB, name: 'Bob' }, SERVER),
+    ]);
+    expect(both.map((one) => one.kind).sort()).toEqual(['decided-before', 'done']);
+    expect(made.store.active().filter((one) => one.type === 'meetup').length).toBeLessThanOrEqual(
+      1,
+    );
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('expires a request whose time is up instead of deciding it', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    made.clock.now = request.expiresAt;
+    expect((await made.safety.decide(request.id, 'approve', MODERATOR_MEMBER, SERVER)).kind).toBe(
+      'expired',
+    );
+    expect(made.storage.requests.get(request.id)?.status).toBe('expired');
+    expect(made.store.active().filter((one) => one.type === 'meetup')).toEqual([]);
+  });
+});
+
+describe('MeetupSafety.expire', () => {
+  it('expires the pending requests whose time is up, edits their posts and tells their makers', async () => {
+    const made = await meetupSafetyWith();
+    const soon = await made.held({ startTime: PARTY_NOW + 3 * HOUR });
+    const later = await made.held({ name: 'Later swap' });
+    made.clock.now = soon.expiresAt;
+    expect(await made.safety.expire()).toBe(1);
+    expect(made.storage.requests.get(soon.id)?.status).toBe('expired');
+    expect(made.storage.requests.get(later.id)?.status).toBe('pending');
+    expect(textOf(made.postOf(soon)?.message)).toContain('**Expired**');
+    expect(buttonLabels(made.postOf(soon)?.message)).toEqual([]);
+    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
+      'No moderator decided on your meetup **Book swap** in time, so it is not posted. Use ' +
+        '`/meetup` again with a later start.',
+    ]);
+    expect(await made.safety.expire()).toBe(0);
+  });
+
+  it('expires the requests left when the safety was turned off', async () => {
+    const made = await meetupSafetyWith({ moderation: null });
+    await made.storage.addRequest(
+      newRequest(1, { serverId: SERVER, makerId: ALICE, expiresAt: PARTY_NOW }),
+    );
+    expect(await made.safety.expire()).toBe(1);
+    expect(made.storage.requests.get(requestId(1))?.status).toBe('expired');
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('fails an approval that never got its meetup, once it is five minutes old', async () => {
+    const made = await meetupSafetyWith();
+    const request = await made.held();
+    // The bot stopped between the approval and the meetup.
+    await made.storage.decideRequest(request.id, 'approved', 'approve', MOD);
+    made.clock.now = MOD.at + 5 * MINUTE - 1;
+    await made.safety.expire();
+    expect(made.storage.requests.get(request.id)?.status).toBe('approved');
+    made.clock.now = MOD.at + 5 * MINUTE;
+    await made.safety.expire();
+    expect(made.storage.requests.get(request.id)).toMatchObject({
+      status: 'failed',
+      partyId: null,
+    });
+    expect(textOf(made.postOf(request)?.message)).toContain('but the meetup could not be made');
+    expect(buttonLabels(made.postOf(request)?.message)).toEqual([]);
+    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
+      'A moderator approved your meetup **Book swap**, but I could not make it: something went ' +
+        'wrong. Use `/meetup` again later.',
+    ]);
+    await made.safety.expire();
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+    expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBeUndefined();
+  });
+});
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index 35758e22..2047c40a 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -2,7 +2,12 @@ import { randomUUID } from 'node:crypto';
 import type { Settings } from '../config/settings.js';
 import type { PartyGateway } from '../discord/party-gateway.js';
 import type { Place } from '../domain/geo/place.js';
-import type { MeetupSafetyStore, MeetupRequestRecord } from '../domain/meetups/records.js';
+import type {
+  Decider,
+  MeetupRequestRecord,
+  MeetupSafetyStore,
+  RequestDecision,
+} from '../domain/meetups/records.js';
 import {
   flaggedWordsOf,
   mayRequestReview,
@@ -10,12 +15,16 @@ import {
   requestExpiry,
   rulingKeyOf,
   type MeetupVerdict,
+  type PlaceRuling,
 } from '../domain/meetups/safety.js';
 import type { MemberInfo } from '../domain/party/attendance.js';
 import { tidyDescription } from '../domain/party/meetup.js';
 import { tidyName } from '../domain/party/timed.js';
 import type { Logger } from '../log.js';
-import { requestMessage } from '../render/meetup-safety.js';
+import { requestMessage, requestOutcomeDm } from '../render/meetup-safety.js';
+import { postLink } from '../render/notify-dm.js';
+import { DM_PRIORITY, type DmSender } from './dm-sender.js';
+import type { MeetupOutcome, PartyService } from './party-service.js';
 import type { GymProvider } from './gym-directory.js';
 
 /** Who asks for a check of a place: the maker, in a server, and whether they are staff. */
@@ -58,6 +67,10 @@ export type SubmitOutcome =
 export interface MeetupSafetyOptions {
   storage: MeetupSafetyStore;
   gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage'>;
+  /** Where an approved meetup is made. */
+  parties: Pick<PartyService, 'createMeetup'>;
+  /** How the makers are told what came of their requests. */
+  dms: DmSender;
   /** The gyms, by which a gym is checked by its official name and its nickname alike. */
   gyms?: Pick<GymProvider, 'get'>;
   settings: Settings;
@@ -192,4 +205,252 @@ export class MeetupSafety {
     }
     return { kind: 'sent', request: { ...request, messageId } };
   }
+
+  /**
+   * A moderator's decision of a request (a press on its post): one conditional change of the
+   * stored request, so the first press wins (`decided-before` for a later one, with the request
+   * as it was decided). Approve and Approve once make the meetup as its maker asked
+   * (`PartyService.createMeetup`; one that cannot be made marks the request failed, with
+   * `failure` said to the moderator and the maker); Approve allows the place for good once the
+   * meetup is made, Refuse from now on refuses it (a pin has no ruling: `not-for-a-pin`). Then
+   * the post is edited to the outcome without buttons and the maker is told by DM, whatever
+   * could not be kept. A request whose time is up is expired instead (`expired`). `serverId` is
+   * the presser's: a request of another server is `gone`.
+   */
+  async decide(
+    requestId: string,
+    decision: RequestDecision,
+    moderator: { id: string; name?: string | undefined },
+    serverId: string,
+  ): Promise<DecideOutcome> {
+    const { storage, log } = this.options;
+    const request = await storage.request(requestId);
+    if (!request || request.serverId !== serverId) return { kind: 'gone' };
+    if (request.status !== 'pending') return { kind: 'decided-before', request };
+    const now = this.now();
+    if (request.expiresAt <= now) {
+      return (await this.expireOne(request)) ? { kind: 'expired' } : this.decidedBefore(request);
+    }
+    if (request.place.kind === 'pin' && (decision === 'approve' || decision === 'refuse-forever')) {
+      return { kind: 'not-for-a-pin' };
+    }
+    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
+    const approving = decision === 'approve' || decision === 'approve-once';
+    const status = approving ? 'approved' : 'refused';
+    if (!(await storage.decideRequest(request.id, status, decision, by))) {
+      return this.decidedBefore(request);
+    }
+    const decided: MeetupRequestRecord = {
+      ...request,
+      status,
+      decision,
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    };
+    if (!approving) {
+      if (decision === 'refuse-forever') {
+        await this.rule(decided, 'refuse', by).catch((err: unknown) => {
+          log.error(
+            { err, request: decided.id },
+            'could not refuse the place of a meetup for good',
+          );
+        });
+      }
+      await this.tell(decided);
+      return { kind: 'done', request: decided };
+    }
+    return this.approve(decided, by);
+  }
+
+  /**
+   * Makes the meetup of a request just approved, and keeps what came of it: its party, and for
+   * Approve the place allowed for good (only once the meetup is made: an approval that fails
+   * allows nothing); or `failed`. What cannot be kept is logged (an approval left without its
+   * meetup fails with the sweep); the post and the maker's DM come in any case.
+   */
+  private async approve(decided: MeetupRequestRecord, by: Decider): Promise<DecideOutcome> {
+    const { storage, log } = this.options;
+    const made = await this.make(decided);
+    try {
+      if (made.partyId === undefined) {
+        await storage.settleApproval(decided.id, 'failed');
+      } else {
+        const party = { partyId: made.partyId };
+        // The meetup is there: a write that fails once is tried again before the sweep would
+        // take the approval for one left without it.
+        await storage
+          .settleApproval(decided.id, party)
+          .catch(() => storage.settleApproval(decided.id, party));
+        if (decided.decision === 'approve') await this.rule(decided, 'allow', by);
+      }
+    } catch (err) {
+      log.error(
+        { err, request: decided.id },
+        'could not keep what came of an approved meetup request',
+      );
+    }
+    const settled: MeetupRequestRecord =
+      made.partyId === undefined
+        ? { ...decided, status: 'failed' }
+        : { ...decided, partyId: made.partyId };
+    await this.tell(settled, made);
+    return {
+      kind: 'done',
+      request: settled,
+      ...(made.postId === undefined ? {} : { postId: made.postId }),
+      ...(made.failure === undefined ? {} : { failure: made.failure }),
+    };
+  }
+
+  /** Rules the place of a request for good (a pin has no ruling). */
+  private async rule(
+    request: MeetupRequestRecord,
+    ruling: PlaceRuling,
+    by: Decider,
+  ): Promise<void> {
+    const key = rulingKeyOf(request.place);
+    if (key !== undefined) await this.options.storage.rule(request.serverId, key, ruling, by);
+  }
+
+  /**
+   * Expires the pending requests whose time is up (with the clock's tick): each is marked
+   * expired, its post edited and its maker told. Answers how many. Also while the safety is off:
+   * the requests made before it was turned off end all the same. Then the approvals that never
+   * got their meetup (the bot stopped in between) fail once they are `STRANDED_MS` old: their
+   * posts are edited and their makers told.
+   */
+  async expire(): Promise<number> {
+    const { storage, log } = this.options;
+    const now = this.now();
+    const due = await storage.duePending(now);
+    let expired = 0;
+    for (const request of due) {
+      try {
+        if (await this.expireOne(request)) expired += 1;
+      } catch (err) {
+        log.error({ err, request: request.id }, 'could not expire a meetup request');
+      }
+    }
+    for (const request of await storage.strandedApprovals(now - STRANDED_MS)) {
+      try {
+        if (await storage.settleApproval(request.id, 'failed')) {
+          await this.tell({ ...request, status: 'failed' }, { failure: FAILURE });
+        }
+      } catch (err) {
+        log.error({ err, request: request.id }, 'could not fail an approval without its meetup');
+      }
+    }
+    return expired;
+  }
+
+  /** Marks one request expired (false when it was decided meanwhile), edits its post, tells. */
+  private async expireOne(request: MeetupRequestRecord): Promise<boolean> {
+    if (!(await this.options.storage.decideRequest(request.id, 'expired', null, null)))
+      return false;
+    await this.tell({ ...request, status: 'expired' });
+    return true;
+  }
+
+  /** A decision that came second: the request as the first one left it. */
+  private async decidedBefore(request: MeetupRequestRecord): Promise<DecideOutcome> {
+    const now = await this.options.storage.request(request.id);
+    return now ? { kind: 'decided-before', request: now } : { kind: 'gone' };
+  }
+
+  /** Makes the meetup of an approved request, as its maker asked for it. */
+  private async make(
+    request: MeetupRequestRecord,
+  ): Promise<{ partyId?: string; postId?: string; failure?: string }> {
+    const { parties, log } = this.options;
+    try {
+      const outcome = await parties.createMeetup({
+        name: request.name,
+        creatorId: request.makerId,
+        creator: {
+          ...(request.makerName === null ? {} : { name: request.makerName }),
+          ...(request.makerTeam === null ? {} : { team: request.makerTeam }),
+        },
+        regionChannelId: request.regionChannelId,
+        place: request.place,
+        startTime: request.startTime,
+        description: request.description,
+      });
+      if (outcome.kind === 'created') {
+        const postId = outcome.party.forumPostId;
+        return { partyId: outcome.party.id, ...(postId === null ? {} : { postId }) };
+      }
+      return { failure: FAILURES[outcome.kind] };
+    } catch (err) {
+      log.error({ err, request: request.id }, 'could not make an approved meetup');
+      return { failure: FAILURE };
+    }
+  }
+
+  /**
+   * Shows what came of a request in its post (without buttons) and tells its maker by DM. What
+   * fails on Discord is logged: the decision stands.
+   */
+  private async tell(
+    request: MeetupRequestRecord,
+    made: { postId?: string; failure?: string } = {},
+  ): Promise<void> {
+    const { gateway, dms, log } = this.options;
+    const now = this.now();
+    if (request.channelId !== null && request.messageId !== null) {
+      const shown = requestMessage(
+        request,
+        made.postId === undefined ? {} : { postId: made.postId },
+      );
+      try {
+        await gateway.editMessage(request.channelId, request.messageId, shown);
+      } catch (err) {
+        log.warn({ err, request: request.id }, 'could not show the outcome of a meetup request');
+      }
+    }
+    dms.send({
+      userId: request.makerId,
+      message: requestOutcomeDm(request, {
+        ...(made.postId === undefined ? {} : { postUrl: postLink(request.serverId, made.postId) }),
+        ...(made.failure === undefined ? {} : { failure: made.failure }),
+      }),
+      priority: DM_PRIORITY.normal,
+      eventAt: now,
+      expiresAt: Math.max(request.startTime, now + DM_HOURS * 3_600_000),
+    });
+  }
 }
+
+/** How long the DM of an outcome may wait at least: past the meetup's start it says nothing. */
+const DM_HOURS = 1;
+
+/** Why an approval failed that nothing else explains: a throw, or the bot stopping meanwhile. */
+const FAILURE = 'something went wrong';
+
+/**
+ * How old an approval without its meetup must be before the sweep fails it: making a meetup
+ * takes seconds, so one this old was left by a stop in between.
+ */
+const STRANDED_MS = 5 * 60_000;
+
+/** Why an approved meetup could not be made, as the moderator and the maker are told. */
+const FAILURES: Record<Exclude<MeetupOutcome['kind'], 'created'>, string> = {
+  'bad-name': 'its name is no name',
+  'bad-description': 'its information is too long',
+  'no-region': 'its region is gone',
+  'no-forum': 'its region has no forum',
+  'no-post': 'its post could not be made',
+};
+
+/** What came of a moderator's press on a request's post. */
+export type DecideOutcome =
+  /** There is no such request in the presser's server. */
+  | { kind: 'gone' }
+  /** Somebody decided it first (or it expired): the request as it was decided. */
+  | { kind: 'decided-before'; request: MeetupRequestRecord }
+  /** Its time was up: it is expired now. */
+  | { kind: 'expired' }
+  /** Approve and Refuse from now on are not for a pin. */
+  | { kind: 'not-for-a-pin' }
+  /** Decided: `postId` the meetup's post, `failure` why an approved one could not be made. */
+  | { kind: 'done'; request: MeetupRequestRecord; postId?: string; failure?: string };
diff --git a/src/services/party-scheduler.test.ts b/src/services/party-scheduler.test.ts
index 31486728..478f79c3 100644
--- a/src/services/party-scheduler.test.ts
+++ b/src/services/party-scheduler.test.ts
@@ -715,6 +715,74 @@ describe('PartyScheduler: running', () => {
     expect(swept).toBe(1);
   });
 
+  it('expires the meetup requests whose time is up at every tick, a failure only logged', async () => {
+    const made = await reportedRaid();
+    let expired = 0;
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      requests: {
+        expire: () => {
+          expired += 1;
+          return expired === 1
+            ? Promise.reject(new Error('the database is away'))
+            : Promise.resolve(0);
+        },
+      },
+      lines: made.lines,
+      gateway: made.gateway,
+      raidBosses: { autoset: () => undefined },
+      settings: made.settings,
+      log: made.log,
+      now: () => made.clock.now,
+    });
+    await scheduler.tick();
+    await scheduler.tick();
+    await scheduler.whenIdle();
+    expect(expired).toBe(2);
+    expect(made.entries.map((entry) => entry.msg)).toContain(
+      'could not expire the meetup requests whose time is up',
+    );
+  });
+
+  it('does not wait for the expiry of the meetup requests, and never runs two at once', async () => {
+    const made = await reportedRaid();
+    let calls = 0;
+    let finish: (() => void) | undefined;
+    const { PartyScheduler } = await import('./party-scheduler.js');
+    const scheduler = new PartyScheduler({
+      store: made.store,
+      posts: made.service,
+      attendance: made.attendance,
+      requests: {
+        expire: () => {
+          calls += 1;
+          return new Promise<number>((resolve) => {
+            finish = () => resolve(0);
+          });
+        },
+      },
+      lines: made.lines,
+      gateway: made.gateway,
+      raidBosses: { autoset: () => undefined },
+      settings: made.settings,
+      log: made.log,
+      now: () => made.clock.now,
+    });
+    // The ticks end while the first expiry is still under way, and start no second one.
+    await scheduler.tick();
+    await scheduler.tick();
+    expect(calls).toBe(1);
+    finish?.();
+    await scheduler.whenIdle();
+    await scheduler.tick();
+    expect(calls).toBe(2);
+    finish?.();
+    await scheduler.whenIdle();
+  });
+
   it('has the expired sessions of the web pages deleted with the upkeep', async () => {
     const made = await reportedRaid();
     let swept = 0;
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index 17377d33..d8ee3e7a 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -53,6 +53,13 @@ export interface PartySchedulerOptions {
   emoji?: { refresh(): Promise<unknown> };
   /** The sessions of the web pages, of which those that expired go with the upkeep. */
   webSessions?: { sweep(): Promise<unknown> };
+  /**
+   * The meetup requests held for the moderators (`MeetupSafety.expire`), of which those whose
+   * time is up expire at every tick: an hour before the meetup's start is too fine for the
+   * hourly upkeep. In the background, as the upkeep: the tick does not wait for it, and a tick
+   * while one is under way starts none.
+   */
+  requests?: { expire(): Promise<unknown> };
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
@@ -90,6 +97,8 @@ export class PartyScheduler {
   private timer: NodeJS.Timeout | undefined;
   private running: Promise<void> | undefined;
   private upkeeping: Promise<void> | undefined;
+  /** The expiry of the meetup requests under way (`requests`), started by a tick. */
+  private expiring: Promise<void> | undefined;
   private previous: number | null = null;
   private lastUpkeep: number;
   private stopped = false;
@@ -147,6 +156,7 @@ export class PartyScheduler {
   async whenIdle(): Promise<void> {
     await this.running;
     await this.upkeeping;
+    await this.expiring;
     await Promise.all(this.repeating.values());
   }
 
@@ -217,6 +227,21 @@ export class PartyScheduler {
       }
     }
     this.previous = now;
+    const { requests } = this.options;
+    if (requests && !this.stopped) {
+      // In the background, as the upkeep: one at a time, and the tick does not wait for it.
+      this.expiring ??= requests
+        .expire()
+        .then(
+          () => undefined,
+          (err: unknown) => {
+            log.error({ err }, 'could not expire the meetup requests whose time is up');
+          },
+        )
+        .finally(() => {
+          this.expiring = undefined;
+        });
+    }
     if (now - this.lastUpkeep >= (this.options.upkeepMs ?? HOUR_MS) && !this.stopped) {
       this.upkeep();
     }
diff --git a/test/support/meetup-safety-service.ts b/test/support/meetup-safety-service.ts
index f411abaf..5eba0171 100644
--- a/test/support/meetup-safety-service.ts
+++ b/test/support/meetup-safety-service.ts
@@ -1,5 +1,8 @@
+import type { MeetupRequestRecord } from '../../src/domain/meetups/records.js';
 import type { Party } from '../../src/domain/party/party.js';
-import { MeetupSafety } from '../../src/services/meetup-safety.js';
+import { MeetupSafety, type RequestAsk } from '../../src/services/meetup-safety.js';
+import { WEST_CHANNEL } from './gyms.js';
+import { LIBRARY, MAKER, SAFETY_SERVER } from './meetup-safety-cases.js';
 import { MemoryMeetupSafety } from './meetup-safety.js';
 import { partyServiceWith, type ServiceOverrides } from './party-service.js';
 
@@ -21,7 +24,8 @@ export interface SafetyOptions {
  * Meetup safety over the services of `partyServiceWith` (the fake gateway, the party service,
  * the store, the clock, the recorded DMs) and `MemoryMeetupSafety` (`storage`): the settings
  * name the moderators' channel `MODERATION`, which the server has as `MOD_CHANNEL`, unless
- * `options` say otherwise.
+ * `options` say otherwise. `held(ask?)` asks the moderators about Alice's book swap at the
+ * Little Free Library (a PokéStop), a day ahead, and gives the request as it was stored.
  */
 export async function meetupSafetyWith(
   options: SafetyOptions = {},
@@ -41,10 +45,34 @@ export async function meetupSafetyWith(
   const safety = new MeetupSafety({
     storage,
     gateway: made.gateway,
+    parties: made.service,
+    dms: made.dms,
     gyms: made.gyms,
     settings,
     log: made.log,
     now: () => made.clock.now,
   });
-  return { ...made, settings, storage, safety };
+  const held = async (ask: Partial<RequestAsk> = {}): Promise<MeetupRequestRecord> => {
+    const outcome = await safety.submit(bookSwap(made.clock.now, ask));
+    if (outcome.kind !== 'sent') throw new Error(`the request was not sent: ${outcome.kind}`);
+    return outcome.request;
+  };
+  /** The moderators' post of a request, as it is now. */
+  const postOf = (request: MeetupRequestRecord) =>
+    made.gateway.messagesIn(MOD_CHANNEL).find((message) => message.id === request.messageId);
+  return { ...made, settings, storage, safety, held, postOf };
+}
+
+/** Alice's book swap at the Little Free Library, a day after `now`, as `/meetup` asks for it. */
+export function bookSwap(now: number, ask: Partial<RequestAsk> = {}): RequestAsk {
+  return {
+    serverId: SAFETY_SERVER,
+    regionChannelId: WEST_CHANNEL,
+    maker: { id: MAKER, name: 'Alice', team: 'mystic' },
+    place: LIBRARY,
+    name: 'Book swap',
+    startTime: now + 24 * 3_600_000,
+    description: 'Bring a book.',
+    ...ask,
+  };
 }
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 3e7a9ce6..75725959 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -185,6 +185,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
         'gateway for meetup safety',
         'pass { meetupSafety: safety } from meetupSafetyWith()',
       ),
+      parties: ctx.partyService,
+      dms: ctx.dms,
       settings: ctx.config.settings,
       log,
     });
````

### Task 5: Plan 8S-1 T5: Meetup safety: Block member, and appeals

Prototype commit: `f3783296215cb6782281881182aa5087f29acc08`

Block member refuses the request, blocks its maker in the server,
withdraws their other pending requests there (posts edited, nobody told),
closes their active meetups there as /delete does ("This meetup was
closed by the moderators.") and tells them once by DM that they may
appeal with /meetup. A blocked member's /meetup answers with an Appeal
button (a UserError with a message of its own); it opens the form of an
appeal, which goes to the moderators' channel with who blocked them and
when, and Lift block / Keep block (staff only, first press wins; the
member is told by DM). One open appeal at a time; after Keep block no
new one for seven days.

**Files:**

```
 src/app.ts                                |   2 +
 src/commands/meetups/meetup.test.ts       |  42 ++++-
 src/commands/meetups/meetup.ts            |  31 +++-
 src/components/index.ts                   |   2 +
 src/components/meetup-appeal.test.ts      | 176 ++++++++++++++++++
 src/components/meetup-appeal.ts           | 166 +++++++++++++++++
 src/components/meetup-safety.test.ts      |  12 ++
 src/components/meetup-safety.ts           |  22 ++-
 src/discord/custom-id.ts                  |   6 +-
 src/discord/party-gateway.ts              |   6 +
 src/domain/meetups/records.ts             |   3 +
 src/render/meetup-safety.test.ts          |  54 +++++-
 src/render/meetup-safety.ts               | 151 +++++++++++++++-
 src/services/meetup-safety.blocks.test.ts | 449 ++++++++++++++++++++++++++++++++++++++++++++++
 src/services/meetup-safety.ts             | 484 +++++++++++++++++++++++++++++++++++++++++++++++---
 test/support/fake-gateway.ts              |   7 +
 test/support/meetup-safety-service.ts     |   4 +
 test/support/test-context.ts              |   2 +
 18 files changed, 1583 insertions(+), 36 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/commands/meetups/meetup.test.ts src/components/meetup-appeal.test.ts src/components/meetup-safety.test.ts src/render/meetup-safety.test.ts src/services/meetup-safety.blocks.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff f3783296215cb6782281881182aa5087f29acc08 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8s1-meetup-safety.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-1 T5: Meetup safety: Block member, and appeals`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/src/app.ts b/src/app.ts
index 42e590c9..b4e38fe7 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -531,6 +531,8 @@ export async function startApp(
     gyms,
     parties: partyService,
     dms: memberDms,
+    store: parties,
+    guilds,
     settings: config.settings,
     log,
   });
diff --git a/src/commands/meetups/meetup.test.ts b/src/commands/meetups/meetup.test.ts
index e370d2c6..4e85bbec 100644
--- a/src/commands/meetups/meetup.test.ts
+++ b/src/commands/meetups/meetup.test.ts
@@ -1,6 +1,7 @@
 import { MessageFlags } from 'discord.js';
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
 import {
+  asV2,
   fakeChatInput,
   fakeModal,
   sent,
@@ -19,7 +20,7 @@ import {
   meetupSafetyWith,
   type SafetyOptions,
 } from '../../../test/support/meetup-safety-service.js';
-import { textDisplays, textOf } from '../../../test/support/messages.js';
+import { buttonsOf, textDisplays, textOf } from '../../../test/support/messages.js';
 import { ALICE, BOB, MINUTE, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
@@ -466,6 +467,19 @@ describe('/meetup with meetup safety on', () => {
     expect(made.meetups()).toHaveLength(2);
   });
 
+  it('answers a blocked member with an Appeal button for this server', async () => {
+    const made = await setup({}, {});
+    await made.storage.addBlock(made.gateway.guildId, BOB, MOD);
+    const { used } = await made.run('Picnic', { userId: BOB });
+    const payload = sent(used.reply);
+    expect(payload.flags).toBe(MessageFlags.Ephemeral | MessageFlags.IsComponentsV2);
+    const shown = asV2(payload);
+    expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
+    expect(buttonsOf(shown).map((button) => [button.label, button.customId])).toEqual([
+      ['Appeal', `mappeal:${made.gateway.guildId}:open`],
+    ]);
+  });
+
   it('reads the place and its check once before the form, in the guard', async () => {
     const made = await setup({}, {});
     const blocks = vi.spyOn(made.storage, 'block');
@@ -486,6 +500,32 @@ describe('/meetup with meetup safety on', () => {
     expect(made.meetups()).toEqual([]);
   });
 
+  it('answers a member blocked while the form was open with Appeal too', async () => {
+    const made = await setup({}, {});
+    const used = await made.command('Picnic');
+    await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
+    const submitted = (await made.submit(used)) as FakeInteraction;
+    const shown = asV2(sent(submitted.reply));
+    expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
+    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Appeal']);
+    expect(made.meetups()).toEqual([]);
+  });
+
+  it('closes a meetup at once whose maker was blocked while it was being made', async () => {
+    const made = await setup({}, {});
+    const create = made.service.createMeetup.bind(made.service);
+    vi.spyOn(made.service, 'createMeetup').mockImplementationOnce(async (asked) => {
+      const outcome = await create(asked);
+      await made.storage.addBlock(made.gateway.guildId, ALICE, MOD);
+      return outcome;
+    });
+    const { submitted } = await made.run('Picnic');
+    const shown = asV2(sent((submitted as FakeInteraction).editReply));
+    expect(textOf(shown)).toBe(NO_MEETUPS_FOR_YOU);
+    expect(buttonsOf(shown).map((button) => button.label)).toEqual(['Appeal']);
+    expect(made.meetups()).toEqual([]);
+  });
+
   it('asks for a start two hours ahead when the place needs a moderator', async () => {
     const made = await setup({}, {});
     expect((await made.run('Picnic', { options: { near: PIN, start: 'in 90' } })).told).toBe(
diff --git a/src/commands/meetups/meetup.ts b/src/commands/meetups/meetup.ts
index 937725ff..4c19b3af 100644
--- a/src/commands/meetups/meetup.ts
+++ b/src/commands/meetups/meetup.ts
@@ -23,6 +23,7 @@ import { mayRequestReview, type MeetupVerdict } from '../../domain/meetups/safet
 import { tidyDescription } from '../../domain/party/meetup.js';
 import { MAX_PARTY_NAME } from '../../domain/party/party.js';
 import { NO_POST_MADE, problemText } from '../../render/activity.js';
+import { blockedAnswer } from '../../render/meetup-safety.js';
 import { EXPIRED, PendingRequests } from '../../services/pending-requests.js';
 import {
   newPartyTimes,
@@ -101,14 +102,27 @@ interface Asked {
   verdict: MeetupVerdict;
 }
 
-/** The refusal of a verdict, or nothing when the meetup may go on (posted or held). */
+/**
+ * The refusal of a verdict other than `blocked` (`blockedRefusal`), or nothing when the meetup
+ * may go on (posted or held).
+ */
 function refusalOf(verdict: MeetupVerdict, startTime: number, now: number): string | undefined {
   if (verdict === 'refused') return NO_MEETUP_HERE;
-  if (verdict === 'blocked') return NO_MEETUPS_FOR_YOU;
   if (verdict === 'review' && !mayRequestReview(now, startTime)) return MEETUP_TOO_SOON;
   return undefined;
 }
 
+/**
+ * The refusal of a member blocked from making meetups in the server, wherever `/meetup` finds
+ * it (before the form, on its submit, after the meetup was made): with Appeal, by which the
+ * member may ask the moderators to lift the block.
+ */
+function blockedRefusal(serverId: string): UserError {
+  return new UserError(NO_MEETUPS_FOR_YOU, {
+    answer: blockedAnswer(NO_MEETUPS_FOR_YOU, serverId),
+  });
+}
+
 /** The check of a place for the member of an interaction (staff skip it). */
 function verdictFor(
   interaction: LocatedInteraction,
@@ -126,8 +140,8 @@ function verdictFor(
 /**
  * Reads what `/meetup` was used with: the place (`namedPlace`: a gym, PokéStop or power spot,
  * or a pin), the start (`typedTimedTime` for a meetup about to be made), and the check of the
- * place. Throws a `UserError` for what cannot be: a guard and the command each read it, so that
- * a refusal does not count against the limit.
+ * place. Throws a `UserError` for what cannot be: the guard reads it (and `execute` takes what
+ * it read), so that a refusal does not count against the limit.
  */
 async function readAsked(
   interaction: ChatInputCommandInteraction,
@@ -147,6 +161,7 @@ async function readAsked(
     throw new UserError(`Give the time the meetup starts. ${TIMED_TIME_HINT}`);
   }
   const verdict = await verdictFor(interaction, ctx, place);
+  if (verdict === 'blocked') throw blockedRefusal(guildIdOf(interaction));
   const refusal = refusalOf(verdict, typed.at, now);
   if (refusal !== undefined) throw new UserError(refusal);
   return { place, startTime: typed.at, verdict };
@@ -295,6 +310,7 @@ async function submitted(
   if (asked.startTime <= now) throw refuse(START_PASSED);
   // Asked again: a ruling or a block may have come meanwhile.
   const verdict = await verdictFor(interaction, ctx, asked.place);
+  if (verdict === 'blocked') throw blockedRefusal(asked.serverId);
   const refusal = refusalOf(verdict, asked.startTime, now);
   if (refusal !== undefined) throw refuse(refusal);
   await interaction.deferReply({ flags: MessageFlags.Ephemeral });
@@ -342,6 +358,13 @@ async function submitted(
     case 'no-post':
       throw refuse(NO_POST_MADE);
     case 'created': {
+      // A block that came after the check, its sweep before this meetup was there.
+      const closed = await ctx.meetupSafety.closeIfBlocked({
+        serverId: asked.serverId,
+        makerId: maker.id,
+        partyId: outcome.party.id,
+      });
+      if (closed) throw blockedRefusal(asked.serverId);
       const post = outcome.party.forumPostId;
       await interaction.editReply({
         content:
diff --git a/src/components/index.ts b/src/components/index.ts
index dc051d46..40e1cb05 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -20,6 +20,7 @@ import { screenshotControls } from '../commands/screenshots/feedback.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { dmControls } from './dm.js';
 import { gymReviewControls } from './gym-review.js';
+import { meetupAppealControls } from './meetup-appeal.js';
 import { meetupSafetyControls } from './meetup-safety.js';
 import { partyButtons } from './party.js';
 
@@ -30,6 +31,7 @@ export const components: readonly ComponentHandler[] = [
   infoControls,
   meetupFormControls,
   meetupSafetyControls,
+  meetupAppealControls,
   wantControls,
   wantListControls,
   targetControls,
diff --git a/src/components/meetup-appeal.test.ts b/src/components/meetup-appeal.test.ts
new file mode 100644
index 00000000..17cf648c
--- /dev/null
+++ b/src/components/meetup-appeal.test.ts
@@ -0,0 +1,176 @@
+import { MessageFlags } from 'discord.js';
+import { describe, expect, it } from 'vitest';
+import {
+  fakeButton,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+} from '../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { MOD, MODERATOR } from '../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL, meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
+import { textOf } from '../../test/support/messages.js';
+import { ALICE, BOB, PARTY_NOW } from '../../test/support/parties.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
+import { MEMBER_READ_THROTTLE } from '../discord/throttle.js';
+import {
+  APPEAL_INPUT,
+  APPEAL_THROTTLE,
+  appealForm,
+  meetupAppealControls,
+} from './meetup-appeal.js';
+
+const DAY = 86_400_000;
+
+async function setup() {
+  const made = await meetupSafetyWith();
+  const server = made.gateway.guildId;
+  await made.storage.addBlock(server, ALICE, { ...MOD, at: PARTY_NOW - DAY });
+  const { ctx } = createTestContext({ meetupSafety: made.safety, parties: made.store });
+  const router = new InteractionRouter(ctx, [], [meetupAppealControls]);
+  /** Alice presses Appeal under the refusal of `/meetup`. */
+  const open = async (userId = ALICE, id = server): Promise<FakeInteraction> => {
+    const interaction = fakeButton({
+      customId: `mappeal:${id}:open`,
+      channelId: WEST_CHANNEL,
+      userId,
+      displayName: userId === ALICE ? 'Alice' : 'Bob',
+      ephemeralMessage: true,
+      v2Message: true,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  /** Alice sends the form of an appeal with `text`. */
+  const send = async (text: string, userId = ALICE): Promise<FakeInteraction> => {
+    const interaction = fakeModal({
+      customId: `mappeal:${server}:form`,
+      form: appealForm(server),
+      fields: { [APPEAL_INPUT]: text },
+      channelId: WEST_CHANNEL,
+      userId,
+      displayName: 'Alice',
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  /** A moderator presses Lift block or Keep block on the appeal's post. */
+  const decide = async (appealId: string, action: string, extra: object = {}) => {
+    const interaction = fakeButton({
+      customId: `mappeal:${appealId}:${action}`,
+      channelId: MOD_CHANNEL,
+      userId: MODERATOR,
+      displayName: 'Mod',
+      roleNames: ['Moderator'],
+      v2Message: true,
+      ...extra,
+    });
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  return { ...made, server, open, send, decide };
+}
+
+function told(used: FakeInteraction): string | undefined {
+  for (const responder of [used.editReply, used.reply, used.followUp]) {
+    if (responder.mock.calls.length > 0) return sent(responder).content;
+  }
+  return undefined;
+}
+
+describe('appeals of a meetup block', () => {
+  it('opens the form of an appeal for a blocked member', async () => {
+    const made = await setup();
+    const used = await made.open();
+    expect(used.showModal).toHaveBeenCalledExactlyOnceWith(appealForm(made.server));
+    const form = appealForm(made.server);
+    expect(form.title).toBe('Appeal your block');
+    expect(JSON.stringify(form.components)).toContain('"label":"Why should the block be lifted?"');
+  });
+
+  it('sends the appeal to the moderators and tells the member they will hear by DM', async () => {
+    const made = await setup();
+    const used = await made.send('It was a library box at the church.');
+    expect(used.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
+    expect(told(used)).toBe(
+      'Your appeal is with the moderators. I will tell you by direct message what they decide.',
+    );
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+  });
+
+  it('opens no form for a member who is not blocked, who has an appeal open or must wait', async () => {
+    const made = await setup();
+    expect(told(await made.open(BOB))).toBe('You are not blocked from creating meetups here.');
+    await made.send('Please.');
+    expect(told(await made.open())).toBe(
+      'Your appeal is with the moderators already. I will tell you by direct message what they decide.',
+    );
+    const [appeal] = made.storage.appeals.values();
+    await made.decide(appeal?.id ?? '', 'keep');
+    expect(told(await made.open())).toBe(
+      `You can appeal again <t:${String((PARTY_NOW + 7 * DAY) / 1000)}:R>.`,
+    );
+  });
+
+  it('answers Appeal of another server as no longer active', async () => {
+    const made = await setup();
+    expect(told(await made.open(ALICE, '412345678901234599'))).toBe(STALE_COMPONENT);
+  });
+
+  it('lets staff alone lift or keep a block, the first press winning', async () => {
+    const made = await setup();
+    await made.send('Please.');
+    const [appeal] = made.storage.appeals.values();
+    const id = appeal?.id ?? '';
+    expect(told(await made.decide(id, 'lift', { userId: BOB, roleNames: [] }))).toBe(
+      'Only admins and moderators can do that.',
+    );
+    expect(told(await made.decide(id, 'lift'))).toBe(
+      `Lifted: **Alice** (<@${ALICE}>) can create meetups again. They are told.`,
+    );
+    expect(await made.storage.block(made.server, ALICE)).toBeUndefined();
+    expect(told(await made.decide(id, 'keep'))).toMatch(
+      new RegExp(
+        `^\\*\\*Mod\\*\\* \\(<@${MODERATOR}>\\) decided this already <t:\\d+:R>: lifted\\.$`,
+      ),
+    );
+  });
+
+  it('counts the presses of Appeal lightly, and the appeals sent three an hour', async () => {
+    const made = await setup();
+    for (let n = 0; n < MEMBER_READ_THROTTLE.uses; n++) {
+      expect(told(await made.open(BOB))).toBe('You are not blocked from creating meetups here.');
+    }
+    expect(told(await made.open(BOB))).toMatch(/again in/);
+    for (let n = 0; n < APPEAL_THROTTLE.uses; n++) await made.send(`Please ${String(n)}.`);
+    expect(told(await made.send('Please again.'))).toMatch(/again in/);
+  });
+
+  it('sends no appeal of a block lifted while its form was open', async () => {
+    const made = await setup();
+    await made.open();
+    await made.storage.liftBlock(made.server, ALICE, MOD);
+    expect(told(await made.send('Please.'))).toBe(
+      'You are not blocked from creating meetups here.\nWhat you wrote:\n```\nPlease.\n```',
+    );
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toEqual([]);
+  });
+
+  it('names the server in what it tells the member', async () => {
+    const made = await setup();
+    await made.send('Please.');
+    const [appeal] = made.storage.appeals.values();
+    await made.decide(appeal?.id ?? '', 'lift');
+    expect(textOf(made.dms.to(ALICE)[0])).toContain('on **Test Server**');
+  });
+
+  it('keeps a block and says when they may appeal again', async () => {
+    const made = await setup();
+    await made.send('Please.');
+    const [appeal] = made.storage.appeals.values();
+    expect(told(await made.decide(appeal?.id ?? '', 'keep'))).toBe(
+      `Kept: **Alice** (<@${ALICE}>) stays blocked, and may appeal again in 7 days. They are told.`,
+    );
+  });
+});
diff --git a/src/components/meetup-appeal.ts b/src/components/meetup-appeal.ts
new file mode 100644
index 00000000..1be1d696
--- /dev/null
+++ b/src/components/meetup-appeal.ts
@@ -0,0 +1,166 @@
+import {
+  ComponentType,
+  MessageFlags,
+  TextInputStyle,
+  type APIModalInteractionResponseCallbackData,
+} from 'discord.js';
+import { refusedWithText } from '../commands/meetups/info.js';
+import type { ComponentHandler, ControlThrottle, Guard } from '../discord/command.js';
+import { decodeCustomId, encodeCustomId } from '../discord/custom-id.js';
+import { UserError } from '../discord/errors.js';
+import { guildIdOf, requireGuild, requireManagement } from '../discord/guards.js';
+import { memberInfo } from '../discord/member-info.js';
+import { STALE_COMPONENT } from '../discord/router.js';
+import { MEMBER_READ_THROTTLE, type Throttle } from '../discord/throttle.js';
+import { MAX_APPEAL, type MeetupAppeal } from '../domain/meetups/records.js';
+import { APPEAL_KIND, APPEAL_WAIT_DAYS } from '../render/meetup-safety.js';
+import { memberText, timestamp } from '../render/text.js';
+import type { AppealDecision, AppealOutcome } from '../services/meetup-safety.js';
+import { SAFETY_THROTTLE } from './meetup-safety.js';
+
+/** The id of the one input of the form of an appeal. */
+export const APPEAL_INPUT = 'text';
+
+/** How often a member may send an appeal: a post in the moderators' channel each. */
+export const APPEAL_THROTTLE: Throttle = { uses: 3, perSeconds: 3600 };
+
+const NOT_BLOCKED = 'You are not blocked from creating meetups here.';
+const ALREADY_OPEN =
+  'Your appeal is with the moderators already. I will tell you by direct message what they decide.';
+const SENT =
+  'Your appeal is with the moderators. I will tell you by direct message what they decide.';
+const NOT_SENT = 'I could not send your appeal to the moderators. Try again later.';
+
+/** The form of an appeal (plan 8S-1): one paragraph, required. */
+export function appealForm(serverId: string): APIModalInteractionResponseCallbackData {
+  return {
+    custom_id: encodeCustomId({ kind: APPEAL_KIND, id: serverId, action: 'form' }),
+    title: 'Appeal your block',
+    components: [
+      {
+        type: ComponentType.ActionRow,
+        components: [
+          {
+            type: ComponentType.TextInput,
+            custom_id: APPEAL_INPUT,
+            label: 'Why should the block be lifted?',
+            style: TextInputStyle.Paragraph,
+            required: true,
+            min_length: 5,
+            max_length: MAX_APPEAL,
+          },
+        ],
+      },
+    ],
+  };
+}
+
+/** What a member is told who may not appeal now, or of an appeal that was not sent. */
+function appealWords(outcome: AppealOutcome): string {
+  switch (outcome.kind) {
+    case 'not-blocked':
+      return NOT_BLOCKED;
+    case 'open':
+      return ALREADY_OPEN;
+    case 'wait':
+      return `You can appeal again ${timestamp(outcome.until, 'R')}.`;
+    case 'not-sent':
+      return NOT_SENT;
+    case 'sent':
+      return SENT;
+  }
+}
+
+/** The member of an appeal, in a sentence. */
+function memberOf(appeal: MeetupAppeal): string {
+  return memberText({ id: appeal.memberId, name: appeal.memberName ?? undefined });
+}
+
+/** What a moderator who pressed Lift block or Keep block is told. */
+function decisionWords(outcome: AppealDecision): string {
+  switch (outcome.kind) {
+    case 'gone':
+      return STALE_COMPONENT;
+    case 'decided-before': {
+      const { appeal } = outcome;
+      const who =
+        appeal.decidedBy === null
+          ? 'A moderator'
+          : memberText({ id: appeal.decidedBy, name: appeal.decidedByName ?? undefined });
+      const when = appeal.decidedAt === null ? '' : ` ${timestamp(appeal.decidedAt, 'R')}`;
+      if (appeal.status === 'expired') return 'This appeal has expired: nobody decided in time.';
+      return `${who} decided this already${when}: ${appeal.status === 'lifted' ? 'lifted' : 'kept'}.`;
+    }
+    case 'done':
+      return outcome.appeal.status === 'lifted'
+        ? `Lifted: ${memberOf(outcome.appeal)} can create meetups again. They are told.`
+        : `Kept: ${memberOf(outcome.appeal)} stays blocked, and may appeal again in ` +
+            `${APPEAL_WAIT_DAYS} days. They are told.`;
+  }
+}
+
+/** Lift block and Keep block are for staff (admins, moderators, the owner), as for `/delete`. */
+const requireStaffToDecide: Guard = (interaction, ctx) => {
+  if (!interaction.isButton()) return;
+  const id = decodeCustomId(interaction.customId);
+  if (id?.action === 'lift' || id?.action === 'keep') return requireManagement(interaction, ctx);
+};
+
+/** The server of Appeal and its form must be the server it is pressed in. */
+function ownServer(serverId: string, interaction: { guildId: string | null }): void {
+  if (serverId !== guildIdOf(interaction)) throw new UserError(STALE_COMPONENT);
+}
+
+/**
+ * Appeals of a meetup block (plan 8S-1; custom-id kind `mappeal`): Appeal under `/meetup`'s
+ * refusal of a blocked member (`mappeal:<server>:open`) opens the form (`mappeal:<server>:form`)
+ * unless the member may not appeal now; the form sends the appeal to the moderators
+ * (`MeetupSafety.appeal`, three an hour; the presses of Appeal count lightly, as reading
+ * does). Lift block and Keep block on the appeal's post (`mappeal:<appeal id>:lift|keep`) are
+ * for staff, the first press winning; the member is told by DM, the server named.
+ */
+export const meetupAppealControls: ComponentHandler = {
+  kind: APPEAL_KIND,
+  guards: [requireGuild, requireStaffToDecide],
+  throttle: (_interaction, id): ControlThrottle | undefined =>
+    id.action === 'form'
+      ? APPEAL_THROTTLE
+      : id.action === 'lift' || id.action === 'keep'
+        ? SAFETY_THROTTLE
+        : MEMBER_READ_THROTTLE,
+
+  async button(interaction, id, ctx) {
+    if (id.action === 'open') {
+      ownServer(id.id, interaction);
+      const state = await ctx.meetupSafety.appealState(id.id, interaction.user.id);
+      if (state.kind !== 'may') throw new UserError(appealWords(state));
+      await interaction.showModal(appealForm(id.id));
+      return;
+    }
+    if (id.action !== 'lift' && id.action !== 'keep') throw new UserError(STALE_COMPONENT);
+    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+    const outcome = await ctx.meetupSafety.decideAppeal(
+      id.id,
+      id.action,
+      { id: interaction.user.id, name: memberInfo(interaction).name },
+      guildIdOf(interaction),
+      interaction.guild?.name,
+    );
+    await interaction.editReply({ content: decisionWords(outcome) });
+  },
+
+  async modal(interaction, id, ctx) {
+    if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
+    ownServer(id.id, interaction);
+    const text = interaction.fields.getTextInputValue(APPEAL_INPUT);
+    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+    const outcome = await ctx.meetupSafety.appeal({
+      serverId: id.id,
+      nearChannelId: interaction.channelId ?? '',
+      member: { id: interaction.user.id, name: memberInfo(interaction).name },
+      text,
+    });
+    if (outcome.kind !== 'sent') throw new UserError(refusedWithText(appealWords(outcome), text));
+    await interaction.editReply({ content: SENT });
+  },
+};
diff --git a/src/components/meetup-safety.test.ts b/src/components/meetup-safety.test.ts
index 478d25bf..f114bc92 100644
--- a/src/components/meetup-safety.test.ts
+++ b/src/components/meetup-safety.test.ts
@@ -3,6 +3,7 @@ import { describe, expect, it } from 'vitest';
 import { fakeButton, sent, type FakeInteraction } from '../../test/support/fake-interactions.js';
 import { MODERATOR, requestId, SAFETY_PIN } from '../../test/support/meetup-safety-cases.js';
 import { MOD_CHANNEL, meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
+import { textOf } from '../../test/support/messages.js';
 import { ALICE, BOB } from '../../test/support/parties.js';
 import { createTestContext } from '../../test/support/test-context.js';
 import { InteractionRouter, STALE_COMPONENT } from '../discord/router.js';
@@ -77,6 +78,17 @@ describe('the buttons of a moderators’ post', () => {
     );
   });
 
+  it('blocks the member, and says what went with it', async () => {
+    const made = await setup();
+    const request = await made.held();
+    await made.held({ name: 'Second swap' });
+    expect(told(await made.press(request.id, 'block'))).toBe(
+      `Refused, and **Alice** (<@${ALICE}>) is blocked from creating meetups here (1 other ` +
+        'request withdrawn, no meetup closed). They are told, and may appeal.',
+    );
+    expect(textOf(made.dms.to(ALICE)[0])).toContain('creating meetups on **Test Server**');
+  });
+
   it('tells a later press who decided what', async () => {
     const made = await setup();
     const request = await made.held();
diff --git a/src/components/meetup-safety.ts b/src/components/meetup-safety.ts
index 14b9173d..ae28dd68 100644
--- a/src/components/meetup-safety.ts
+++ b/src/components/meetup-safety.ts
@@ -7,7 +7,7 @@ import { STALE_COMPONENT } from '../discord/router.js';
 import type { Throttle } from '../discord/throttle.js';
 import { REQUEST_DECISIONS, type MeetupRequestRecord } from '../domain/meetups/records.js';
 import { SAFETY_KIND } from '../render/meetup-safety.js';
-import { memberText, timestamp } from '../render/text.js';
+import { count, memberText, timestamp } from '../render/text.js';
 import type { DecideOutcome } from '../services/meetup-safety.js';
 
 /** How often one moderator may press the buttons of the moderators' posts. */
@@ -27,7 +27,9 @@ function decidedAs(request: MeetupRequestRecord): string {
           ? 'refused, and its maker blocked'
           : 'refused';
     case 'withdrawn':
-      return 'refused: its maker was blocked';
+      return request.decision === 'approve' || request.decision === 'approve-once'
+        ? 'approved, but its maker was blocked meanwhile: no meetup'
+        : 'refused: its maker was blocked';
     case 'expired':
     case 'pending':
       return 'expired';
@@ -58,6 +60,9 @@ export function decisionWords(outcome: DecideOutcome): string {
     case 'done': {
       const { request, postId, failure } = outcome;
       const post = postId === undefined ? '' : ` (<#${postId}>)`;
+      if (request.status === 'withdrawn') {
+        return 'Its maker was blocked from making meetups here meanwhile, so no meetup is posted.';
+      }
       if (failure !== undefined) {
         return `Approved, but the meetup could not be made: ${failure}. Its maker is told.`;
       }
@@ -68,6 +73,18 @@ export function decisionWords(outcome: DecideOutcome): string {
           return `Approved once: the meetup is posted${post}. Its maker is told.`;
         case 'refuse-forever':
           return 'Refused, and no meetup can be held at this place from now on. Its maker is told.';
+        case 'block': {
+          const maker = memberText({ id: request.makerId, name: request.makerName ?? undefined });
+          const withdrawn = outcome.withdrawn ?? 0;
+          const closed = outcome.closed ?? 0;
+          const others =
+            withdrawn === 0 ? 'no other request' : `${count(withdrawn, 'other request')}`;
+          const meetups = closed === 0 ? 'no meetup' : count(closed, 'meetup');
+          return (
+            `Refused, and ${maker} is blocked from creating meetups here (${others} withdrawn, ` +
+            `${meetups} closed). They are told, and may appeal.`
+          );
+        }
         default:
           return 'Refused. Its maker is told.';
       }
@@ -98,6 +115,7 @@ export const meetupSafetyControls: ComponentHandler = {
       decision,
       { id: interaction.user.id, name: memberInfo(interaction).name },
       guildIdOf(interaction),
+      interaction.guild?.name,
     );
     await interaction.editReply({ content: decisionWords(outcome) });
   },
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 658d4d37..3a43debd 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -98,7 +98,11 @@
  * (`src/commands/meetups/meetup.ts`). The buttons of the moderators' post of a meetup held for
  * them have the kind `msafety` and the request's UUID as the id:
  * `msafety:<request id>:approve|approve-once|refuse|refuse-forever|block`
- * (`src/components/meetup-safety.ts`); the request is read from the database.
+ * (`src/components/meetup-safety.ts`); the request is read from the database. Appeals of a
+ * meetup block have the kind `mappeal` (`src/components/meetup-appeal.ts`): Appeal under the
+ * refusal of a blocked member is `mappeal:<server>:open` and its form `mappeal:<server>:form`
+ * (the server's snowflake), Lift block and Keep block on the moderators' post of an appeal
+ * `mappeal:<appeal id>:lift|keep` (its UUID).
  *
  * "Change options…" under an answer of `/counters` is `counters:<token>:options`, and the dialog
  * it opens `counters:<token>:dialog`: the token is that of the answer's options, kept for a day
diff --git a/src/discord/party-gateway.ts b/src/discord/party-gateway.ts
index ed1a8000..656a735a 100644
--- a/src/discord/party-gateway.ts
+++ b/src/discord/party-gateway.ts
@@ -213,6 +213,8 @@ export interface PartyGateway {
   dismissMember(forumId: string, memberId: string): Promise<boolean>;
   /** The name of a channel the bot can see, from the cache. */
   channelName(channelId: string): string | undefined;
+  /** The name of a server the bot is in, from the cache (for a DM that names it). */
+  guildName(guildId: string): string | undefined;
   /**
    * The text channel with this name in the server that `nearChannelId` is in, in which the bot
    * may send messages with embeds, from the cache: its id, or undefined when that server has
@@ -1147,6 +1149,10 @@ export class DiscordPartyGateway implements PartyGateway {
     return true;
   }
 
+  guildName(guildId: string): string | undefined {
+    return this.client.guilds.cache.get(guildId)?.name;
+  }
+
   channelName(channelId: string): string | undefined {
     const channel = this.client.channels.cache.get(channelId);
     return channel && 'name' in channel && typeof channel.name === 'string'
diff --git a/src/domain/meetups/records.ts b/src/domain/meetups/records.ts
index 9e490d41..fa6c0c28 100644
--- a/src/domain/meetups/records.ts
+++ b/src/domain/meetups/records.ts
@@ -85,6 +85,9 @@ export interface MeetupBlock {
   blockedAt: number;
 }
 
+/** As much as an appeal says. */
+export const MAX_APPEAL = 1000;
+
 /**
  * Where an appeal stands: with the moderators; lifted or kept by one; or expired (nobody
  * decided in time, or its post was never made: the member may appeal again).
diff --git a/src/render/meetup-safety.test.ts b/src/render/meetup-safety.test.ts
index 0824aa7d..1f032b9e 100644
--- a/src/render/meetup-safety.test.ts
+++ b/src/render/meetup-safety.test.ts
@@ -2,6 +2,7 @@ import { ButtonStyle } from 'discord.js';
 import { describe, expect, it } from 'vitest';
 import {
   LIBRARY,
+  newAppeal,
   newRequest,
   requestId,
   SAFETY_NOW,
@@ -15,9 +16,13 @@ import {
   thumbnailOf,
 } from '../../test/support/messages.js';
 import { expectV2Sendable } from '../../test/support/post-limits.js';
-import type { MeetupRequestRecord } from '../domain/meetups/records.js';
+import {
+  MAX_APPEAL,
+  type MeetupAppeal,
+  type MeetupRequestRecord,
+} from '../domain/meetups/records.js';
 import { MAX_MEETUP_DESCRIPTION, MAX_PARTY_NAME } from '../domain/party/party.js';
-import { PENDING_ACCENT, requestMessage } from './meetup-safety.js';
+import { appealMessage, PENDING_ACCENT, requestMessage } from './meetup-safety.js';
 import { plainLines } from './text.js';
 
 function pending(overrides: Partial<MeetupRequestRecord> = {}): MeetupRequestRecord {
@@ -104,3 +109,48 @@ describe('requestMessage', () => {
     expect(textOf(message)).toContain(plainLines('*'.repeat(MAX_MEETUP_DESCRIPTION)));
   });
 });
+
+describe('appealMessage', () => {
+  const appeal: MeetupAppeal = {
+    ...newAppeal(1),
+    status: 'open',
+    channelId: null,
+    messageId: null,
+    decidedBy: null,
+    decidedByName: null,
+    decidedAt: null,
+  };
+  const block = {
+    serverId: appeal.serverId,
+    memberId: appeal.memberId,
+    blockedBy: '200000000000000009',
+    blockedByName: 'Mod',
+    blockedAt: SAFETY_NOW,
+  };
+
+  it('fits the longest words and names with every character escaped, never cutting the words', () => {
+    const message = appealMessage(
+      { ...appeal, memberName: '_'.repeat(100), text: '*'.repeat(MAX_APPEAL) },
+      { ...block, blockedByName: '_'.repeat(100) },
+    );
+    expectV2Sendable(message);
+    expect(textOf(message)).toContain(plainLines('*'.repeat(MAX_APPEAL)));
+  });
+
+  it('shows the outcome without buttons once decided', () => {
+    const kept = appealMessage(
+      {
+        ...appeal,
+        status: 'kept',
+        decidedBy: '200000000000000009',
+        decidedByName: 'Mod',
+        decidedAt: SAFETY_NOW,
+      },
+      block,
+    );
+    expect(buttonsOf(kept)).toEqual([]);
+    expect(textOf(kept)).toContain(
+      `**Kept** by **Mod** (<@200000000000000009>) <t:${String(SAFETY_NOW / 1000)}:R>: they can appeal again <t:${String((SAFETY_NOW + 7 * 86_400_000) / 1000)}:R>.`,
+    );
+  });
+});
diff --git a/src/render/meetup-safety.ts b/src/render/meetup-safety.ts
index 3b855bb4..b77be27a 100644
--- a/src/render/meetup-safety.ts
+++ b/src/render/meetup-safety.ts
@@ -7,7 +7,12 @@ import {
 import { encodeCustomId } from '../discord/custom-id.js';
 import type { V2Message } from '../discord/party-gateway.js';
 import type { Place } from '../domain/geo/place.js';
-import type { MeetupRequestRecord, RequestDecision } from '../domain/meetups/records.js';
+import type {
+  MeetupAppeal,
+  MeetupBlock,
+  MeetupRequestRecord,
+  RequestDecision,
+} from '../domain/meetups/records.js';
 import { wayspotPicture } from '../domain/wayspots/picture.js';
 import { nearLine } from './spawn.js';
 import { memberText, plain, plainLines, plainNoLinks, timestamp, truncate } from './text.js';
@@ -111,7 +116,10 @@ function outcomeOf(
     case 'withdrawn':
       return {
         accent: REFUSED_ACCENT,
-        line: `**Refused** ${by}: its maker was blocked from making meetups here.`,
+        line:
+          request.decision === 'approve' || request.decision === 'approve-once'
+            ? 'Not posted: its maker was blocked from making meetups here meanwhile.'
+            : `**Refused** ${by}: its maker was blocked from making meetups here.`,
       };
     case 'expired':
       return {
@@ -123,6 +131,145 @@ function outcomeOf(
   }
 }
 
+/**
+ * The custom-id kind of appeals (`mappeal`): `mappeal:<server>:open` (the Appeal button of
+ * `/meetup`'s refusal of a blocked member) and `mappeal:<server>:form` (its form), with the
+ * server's snowflake; `mappeal:<appeal id>:lift|keep` on the moderators' post of an appeal.
+ */
+export const APPEAL_KIND = 'mappeal';
+
+/**
+ * What a blocked member is told who uses `/meetup` (the design's words), with Appeal, which
+ * opens the form of an appeal to the moderators of `serverId`.
+ */
+export function blockedAnswer(text: string, serverId: string): V2Message {
+  return textMessage(
+    REFUSED_ACCENT,
+    [text],
+    [
+      actionRow([
+        {
+          type: ComponentType.Button,
+          style: ButtonStyle.Secondary,
+          label: 'Appeal',
+          custom_id: encodeCustomId({ kind: APPEAL_KIND, id: serverId, action: 'open' }),
+        },
+      ]),
+    ],
+  );
+}
+
+/**
+ * The one direct message of a member a moderator blocked (from a request's post): they can no
+ * longer make meetups on the server (`serverName`, when known), and may appeal with `/meetup`.
+ */
+export function blockedDm(serverName: string | undefined): V2Message {
+  const server = serverName === undefined ? 'this server' : `**${plainNoLinks(serverName)}**`;
+  return textMessage(REFUSED_ACCENT, [
+    `A moderator blocked you from creating meetups on ${server}. If you think that is wrong, ` +
+      'use `/meetup` there and press Appeal.',
+  ]);
+}
+
+/**
+ * The moderators' post of an appeal: the member (`memberText`), who blocked them and when
+ * (`block`, while it stands), their words (`plainLines`, never cut), with Lift block and Keep
+ * block while it is open, and who decided what afterwards (`APPEAL_WAIT_DAYS` after a kept one
+ * the member may appeal again).
+ */
+export function appealMessage(appeal: MeetupAppeal, block: MeetupBlock | undefined): V2Message {
+  const member = memberText({ id: appeal.memberId, name: appeal.memberName ?? undefined });
+  const blockedBy =
+    block === undefined
+      ? undefined
+      : `Blocked by ${memberText({ id: block.blockedBy, name: block.blockedByName ?? undefined })} ` +
+        `${timestamp(block.blockedAt, 'F')}`;
+  const head = [
+    '### Appeal of a meetup block',
+    `${member} asks for their block to be lifted.`,
+    ...(blockedBy === undefined ? [] : [blockedBy]),
+  ].join('\n');
+  const components: APIComponentInContainer[] = [
+    textDisplay(head),
+    textDisplay(`**Their words**\n${plainLines(appeal.text)}`),
+  ];
+  let accent = PENDING_ACCENT;
+  if (appeal.status === 'open') {
+    components.push(
+      actionRow(
+        (
+          [
+            ['lift', 'Lift block', ButtonStyle.Success],
+            ['keep', 'Keep block', ButtonStyle.Danger],
+          ] as const
+        ).map(([action, label, style]): APIButtonComponent => ({
+          type: ComponentType.Button,
+          style,
+          label,
+          custom_id: encodeCustomId({ kind: APPEAL_KIND, id: appeal.id, action }),
+        })),
+      ),
+    );
+  } else {
+    const by =
+      appeal.decidedBy === null
+        ? 'a moderator'
+        : memberText({ id: appeal.decidedBy, name: appeal.decidedByName ?? undefined });
+    const when = appeal.decidedAt === null ? '' : ` ${timestamp(appeal.decidedAt, 'R')}`;
+    accent =
+      appeal.status === 'lifted'
+        ? APPROVED_ACCENT
+        : appeal.status === 'expired'
+          ? EXPIRED_ACCENT
+          : REFUSED_ACCENT;
+    const again = timestamp(appealAgainAt(appeal), 'R');
+    components.push(
+      textDisplay(
+        appeal.status === 'lifted'
+          ? `**Lifted** by ${by}${when}: they can create meetups again.`
+          : appeal.status === 'expired'
+            ? '**Expired**: no moderator decided in time. They can appeal again.'
+            : `**Kept** by ${by}${when}: they can appeal again ${again}.`,
+      ),
+    );
+  }
+  return { v2: true, components: [container(accent, components)] };
+}
+
+/** When a member may appeal again after a moderator kept their block on this appeal. */
+function appealAgainAt(appeal: MeetupAppeal): number {
+  return (appeal.decidedAt ?? appeal.createdAt) + APPEAL_WAIT_DAYS * 86_400_000;
+}
+
+/**
+ * What a member is told of their appeal, naming the server (`serverName`, when known): lifted,
+ * kept (and when they may appeal again), or expired (nobody decided in time).
+ */
+export function appealOutcomeDm(appeal: MeetupAppeal, serverName?: string): V2Message {
+  const on = serverName === undefined ? '' : ` on **${plainNoLinks(serverName)}**`;
+  if (appeal.status === 'lifted') {
+    return textMessage(APPROVED_ACCENT, [
+      `A moderator lifted your block${on}: you can create meetups ${on === '' ? 'again' : 'there again'}.`,
+    ]);
+  }
+  if (appeal.status === 'expired') {
+    return textMessage(EXPIRED_ACCENT, [
+      on === ''
+        ? 'No moderator decided on your appeal of your meetup block in time. You can appeal ' +
+          'again: use `/meetup` on that server and press Appeal.'
+        : `No moderator decided on your appeal of your meetup block${on} in time. You can ` +
+          'appeal again: use `/meetup` there and press Appeal.',
+    ]);
+  }
+  return textMessage(REFUSED_ACCENT, [
+    `A moderator kept your block on creating meetups${on}. You can appeal again ` +
+      `${timestamp(appealAgainAt(appeal), 'R')}.`,
+  ]);
+}
+
+/** After a moderator kept a block, the member may appeal again this many days later. */
+export const APPEAL_WAIT_DAYS = 7;
+
 /**
  * The direct message that tells a request's maker what came of it (the design: approved with a
  * link to the post, refused, expired; never why). `postUrl` is the address of the meetup's post
diff --git a/src/services/meetup-safety.blocks.test.ts b/src/services/meetup-safety.blocks.test.ts
new file mode 100644
index 00000000..6d25586d
--- /dev/null
+++ b/src/services/meetup-safety.blocks.test.ts
@@ -0,0 +1,449 @@
+import { describe, expect, it, vi } from 'vitest';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import {
+  LIBRARY,
+  MOD,
+  MODERATOR,
+  newRequest,
+  OTHER_SERVER,
+  requestId,
+  SAFETY_SERVER,
+} from '../../test/support/meetup-safety-cases.js';
+import { MOD_CHANNEL, meetupSafetyWith } from '../../test/support/meetup-safety-service.js';
+import { buttonsOf, textOf } from '../../test/support/messages.js';
+import { ALICE, BOB, MINUTE, PARTY_NOW } from '../../test/support/parties.js';
+
+const HOUR = 60 * MINUTE;
+const DAY = 24 * HOUR;
+const MODERATOR_MEMBER = { id: MODERATOR, name: 'Mod' };
+
+/** Meetup safety with a meetup of Alice's and one of Bob's posted already. */
+async function withMeetups() {
+  const made = await meetupSafetyWith();
+  const make = async (creatorId: string, name: string) => {
+    const outcome = await made.service.createMeetup({
+      name,
+      creatorId,
+      regionChannelId: WEST_CHANNEL,
+    });
+    if (outcome.kind !== 'created') throw new Error(outcome.kind);
+    return outcome.party;
+  };
+  const alices = await make(ALICE, 'Alice’s picnic');
+  const bobs = await make(BOB, 'Bob’s picnic');
+  await made.service.flush();
+  return { ...made, alices, bobs };
+}
+
+describe('MeetupSafety: Block member', () => {
+  it('refuses the request, blocks its maker, withdraws their others and closes their meetups', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    const other = await made.held({ name: 'Second swap' });
+    const outcome = await made.safety.decide(
+      request.id,
+      'block',
+      MODERATOR_MEMBER,
+      SAFETY_SERVER,
+      'Pine Town',
+    );
+    expect(outcome).toMatchObject({ kind: 'done', closed: 1, withdrawn: 1 });
+    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toMatchObject({ blockedBy: MODERATOR });
+    expect(made.storage.requests.get(request.id)).toMatchObject({
+      status: 'refused',
+      decision: 'block',
+    });
+    expect(made.storage.requests.get(other.id)).toMatchObject({
+      status: 'withdrawn',
+      decidedBy: MODERATOR,
+    });
+    expect(textOf(made.postOf(request)?.message)).toContain('and its maker is blocked');
+    expect(textOf(made.postOf(other)?.message)).toContain('its maker was blocked');
+    expect(buttonsOf(made.postOf(other)?.message)).toEqual([]);
+    // Alice's meetup is closed as /delete closes one, with the moderators' line; Bob's stays.
+    expect(made.store.get(made.alices.id)).toBeUndefined();
+    expect(
+      made.gateway.messagesIn(made.alices.forumPostId ?? '').map((one) => one.message.content),
+    ).toContain('This meetup was closed by the moderators.');
+    expect(made.store.get(made.bobs.id)).toBeDefined();
+    // One direct message, about the block; none for each request.
+    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
+      'A moderator blocked you from creating meetups on **Pine Town**. If you think that is ' +
+        'wrong, use `/meetup` there and press Appeal.',
+    ]);
+  });
+
+  it('blocks a member in that server alone, and never a member of staff', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    await made.safety.decide(request.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER);
+    const place = request.place;
+    expect(
+      await made.safety.verdict({ serverId: SAFETY_SERVER, place, makerId: ALICE, staff: false }),
+    ).toBe('blocked');
+    expect(
+      await made.safety.verdict({ serverId: OTHER_SERVER, place, makerId: ALICE, staff: false }),
+    ).toBe('review');
+    // Made staff since, Alice is blocked by nothing.
+    expect(
+      await made.safety.verdict({ serverId: SAFETY_SERVER, place, makerId: ALICE, staff: true }),
+    ).toBe('allowed');
+  });
+
+  it('tells a member of their block once, however many Blocks come', async () => {
+    const made = await withMeetups();
+    const first = await made.held();
+    const second = await made.held({ name: 'Second swap' });
+    const both = await Promise.all([
+      made.safety.decide(first.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER, 'Pine Town'),
+      made.safety.decide(second.id, 'block', { id: BOB, name: 'Bob' }, SAFETY_SERVER, 'Pine Town'),
+    ]);
+    expect(both.map((one) => one.kind)).toEqual(['done', 'done']);
+    // A request made before the block, decided after it.
+    await made.storage.addRequest(newRequest(7, { serverId: SAFETY_SERVER, makerId: ALICE }));
+    await made.safety.decide(requestId(7), 'block', MODERATOR_MEMBER, SAFETY_SERVER, 'Pine Town');
+    expect(made.storage.requests.get(requestId(7))).toMatchObject({ status: 'refused' });
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('blocks and refuses in one step: a second press on the same request does nothing', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    await made.safety.decide(request.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER);
+    const later = await made.safety.decide(
+      request.id,
+      'block',
+      { id: BOB, name: 'Bob' },
+      SAFETY_SERVER,
+    );
+    expect(later).toMatchObject({
+      kind: 'decided-before',
+      request: { status: 'refused', decision: 'block', decidedBy: MODERATOR },
+    });
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('closes what meetups it can of a blocked member, and says what it could not', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    vi.spyOn(made.service, 'end').mockRejectedValueOnce(new Error('Discord is away'));
+    const outcome = await made.safety.decide(request.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER);
+    expect(outcome).toMatchObject({ kind: 'done', closed: 0 });
+    expect(made.entries.map((entry) => entry.msg)).toContain(
+      'could not close a meetup of a blocked member',
+    );
+    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toBeDefined();
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('edits the post and tells the maker of a Block whose sweep fails', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    made.storage.failing.add('pendingOf');
+    const outcome = await made.safety.decide(request.id, 'block', MODERATOR_MEMBER, SAFETY_SERVER);
+    expect(outcome.kind).toBe('done');
+    expect(textOf(made.postOf(request)?.message)).toContain('and its maker is blocked');
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+    expect(made.entries.map((entry) => entry.msg)).toContain(
+      'could not withdraw the other requests of a blocked member',
+    );
+  });
+
+  it('approves even when the block cannot be read first: the check after the meetup decides', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    vi.spyOn(made.storage, 'block').mockRejectedValueOnce(new Error('the database blinked'));
+    const outcome = await made.safety.decide(
+      request.id,
+      'approve-once',
+      MODERATOR_MEMBER,
+      SAFETY_SERVER,
+    );
+    expect(outcome).toMatchObject({ kind: 'done', request: { status: 'approved' } });
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('finds the meetup of an approval the bot could not record, and settles it without a DM', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    made.storage.failing.add('settleApproval');
+    await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SAFETY_SERVER);
+    const swap = made.store
+      .active()
+      .find((one) => one.createdById === ALICE && one.id !== made.alices.id);
+    expect(swap).toBeDefined();
+    made.storage.failing.clear();
+    made.clock.now += 5 * MINUTE;
+    await made.safety.expire();
+    expect(made.storage.requests.get(request.id)).toMatchObject({
+      status: 'approved',
+      partyId: swap?.id,
+    });
+    // The approval's DM alone.
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('withdraws an unrecorded approval whose maker was blocked since, and closes its meetup', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    made.storage.failing.add('settleApproval');
+    await made.safety.decide(request.id, 'approve-once', MODERATOR_MEMBER, SAFETY_SERVER);
+    made.storage.failing.clear();
+    await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
+    made.clock.now += 5 * MINUTE;
+    await made.safety.expire();
+    expect(made.storage.requests.get(request.id)).toMatchObject({ status: 'withdrawn' });
+    expect(
+      made.store.active().filter((one) => one.createdById === ALICE && one.id !== made.alices.id),
+    ).toEqual([]);
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('makes no meetup of an approval when its maker was blocked meanwhile', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    // Blocked over another request a moment before the approval.
+    await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
+    const outcome = await made.safety.decide(
+      request.id,
+      'approve',
+      MODERATOR_MEMBER,
+      SAFETY_SERVER,
+    );
+    expect(outcome).toMatchObject({ kind: 'done', request: { status: 'withdrawn' } });
+    expect(made.storage.requests.get(request.id)).toMatchObject({
+      status: 'withdrawn',
+      decision: 'approve',
+      partyId: null,
+    });
+    expect(made.store.active().filter((one) => one.createdById === ALICE)).toHaveLength(1);
+    expect(textOf(made.postOf(request)?.message)).toContain(
+      'Not posted: its maker was blocked from making meetups here meanwhile.',
+    );
+    expect(buttonsOf(made.postOf(request)?.message)).toEqual([]);
+    expect(
+      await made.storage.ruling(SAFETY_SERVER, { kind: 'stop', id: LIBRARY.id }),
+    ).toBeUndefined();
+    expect(made.dms.to(ALICE)).toEqual([]);
+  });
+
+  it('closes the meetup of an approval at once when its maker was blocked while it was made', async () => {
+    const made = await withMeetups();
+    const request = await made.held();
+    const create = made.service.createMeetup.bind(made.service);
+    vi.spyOn(made.service, 'createMeetup').mockImplementationOnce(async (asked) => {
+      const outcome = await create(asked);
+      await made.storage.addBlock(SAFETY_SERVER, ALICE, MOD);
+      return outcome;
+    });
+    const outcome = await made.safety.decide(
+      request.id,
+      'approve',
+      MODERATOR_MEMBER,
+      SAFETY_SERVER,
+    );
+    expect(outcome).toMatchObject({ kind: 'done', request: { status: 'withdrawn' } });
+    const swap = [...made.store.active()].find(
+      (one) => one.createdById === ALICE && one.id !== made.alices.id,
+    );
+    expect(swap).toBeUndefined();
+    expect(made.dms.to(ALICE)).toEqual([]);
+  });
+});
+
+describe('MeetupSafety: appeals', () => {
+  async function blocked() {
+    const made = await meetupSafetyWith();
+    await made.storage.addBlock(SAFETY_SERVER, ALICE, { ...MOD, at: PARTY_NOW - DAY });
+    const appeal = (text = 'It was a library box at the church.') =>
+      made.safety.appeal({
+        serverId: SAFETY_SERVER,
+        nearChannelId: WEST_CHANNEL,
+        member: { id: ALICE, name: 'Alice' },
+        text,
+      });
+    return { ...made, appeal };
+  }
+
+  it('sends an appeal to the moderators with who blocked the member and when', async () => {
+    const made = await blocked();
+    const outcome = await made.appeal();
+    expect(outcome.kind).toBe('sent');
+    const [post] = made.gateway.messagesIn(MOD_CHANNEL);
+    const text = textOf(post?.message);
+    expect(text).toContain('### Appeal of a meetup block');
+    expect(text).toContain(`**Alice** (<@${ALICE}>) asks for their block to be lifted.`);
+    expect(text).toContain(
+      `Blocked by **Mod** (<@${MODERATOR}>) <t:${String((PARTY_NOW - DAY) / 1000)}:F>`,
+    );
+    expect(text).toContain('It was a library box at the church.');
+    const [stored] = made.storage.appeals.values();
+    expect(buttonsOf(post?.message).map((button) => [button.label, button.customId])).toEqual([
+      ['Lift block', `mappeal:${stored?.id ?? ''}:lift`],
+      ['Keep block', `mappeal:${stored?.id ?? ''}:keep`],
+    ]);
+    expect(stored).toMatchObject({ status: 'open', messageId: post?.id, channelId: MOD_CHANNEL });
+  });
+
+  it('takes one open appeal at a time, and none from a member who is not blocked', async () => {
+    const made = await blocked();
+    await made.appeal();
+    expect((await made.appeal()).kind).toBe('open');
+    const free = await made.safety.appeal({
+      serverId: SAFETY_SERVER,
+      nearChannelId: WEST_CHANNEL,
+      member: { id: BOB, name: 'Bob' },
+      text: 'Why not?',
+    });
+    expect(free.kind).toBe('not-blocked');
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+  });
+
+  it('lifts a block: the member may make meetups again and is told', async () => {
+    const made = await blocked();
+    const sent = await made.appeal();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    const outcome = await made.safety.decideAppeal(
+      sent.appeal.id,
+      'lift',
+      MODERATOR_MEMBER,
+      SAFETY_SERVER,
+      'Pine Town',
+    );
+    expect(outcome.kind).toBe('done');
+    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toBeUndefined();
+    const post = made.gateway.messagesIn(MOD_CHANNEL)[0];
+    expect(textOf(post?.message)).toContain('**Lifted** by **Mod**');
+    // Who blocked them stays on the post.
+    expect(textOf(post?.message)).toContain(`Blocked by **Mod** (<@${MODERATOR}>)`);
+    expect(buttonsOf(post?.message)).toEqual([]);
+    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
+      'A moderator lifted your block on **Pine Town**: you can create meetups there again.',
+    ]);
+    // The first decision wins.
+    expect(
+      (await made.safety.decideAppeal(sent.appeal.id, 'keep', MODERATOR_MEMBER, SAFETY_SERVER))
+        .kind,
+    ).toBe('decided-before');
+  });
+
+  it('keeps a block: no new appeal for seven days', async () => {
+    const made = await blocked();
+    const sent = await made.appeal();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    await made.safety.decideAppeal(
+      sent.appeal.id,
+      'keep',
+      MODERATOR_MEMBER,
+      SAFETY_SERVER,
+      'Pine Town',
+    );
+    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toBeDefined();
+    const again = PARTY_NOW + 7 * DAY;
+    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
+      `A moderator kept your block on creating meetups on **Pine Town**. You can appeal again <t:${String(again / 1000)}:R>.`,
+    ]);
+    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain(
+      `they can appeal again <t:${String(again / 1000)}:R>.`,
+    );
+    expect(await made.appeal()).toEqual({ kind: 'wait', until: again });
+    made.clock.now = again;
+    expect((await made.appeal()).kind).toBe('sent');
+  });
+
+  it('takes no appeal kept meanwhile within the seven days, and keeps nothing of it', async () => {
+    const made = await blocked();
+    const sent = await made.appeal();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    await made.safety.decideAppeal(sent.appeal.id, 'keep', MODERATOR_MEMBER, SAFETY_SERVER);
+    // The member's look before the keep saw no kept appeal.
+    vi.spyOn(made.storage, 'lastKept').mockResolvedValueOnce(undefined);
+    expect(await made.appeal()).toEqual({ kind: 'wait', until: PARTY_NOW + 7 * DAY });
+    expect(made.storage.appeals.size).toBe(1);
+    expect(made.gateway.messagesIn(MOD_CHANNEL)).toHaveLength(1);
+  });
+
+  it('closes an open appeal whose post was never made, when the member appeals again', async () => {
+    const made = await blocked();
+    // The bot stopped between keeping the appeal and posting it.
+    await made.storage.addAppeal({
+      id: requestId(150),
+      serverId: SAFETY_SERVER,
+      memberId: ALICE,
+      memberName: 'Alice',
+      text: 'Lost.',
+      createdAt: PARTY_NOW - 10 * MINUTE,
+    });
+    expect((await made.appeal()).kind).toBe('sent');
+    expect(made.storage.appeals.get(requestId(150))?.status).toBe('expired');
+  });
+
+  it('closes an appeal nobody decided in seven days with the sweep, and tells the member', async () => {
+    const made = await blocked();
+    const sent = await made.appeal();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    made.clock.now = PARTY_NOW + 7 * DAY - 1;
+    await made.safety.expire();
+    expect(made.storage.appeals.get(sent.appeal.id)?.status).toBe('open');
+    made.clock.now = PARTY_NOW + 7 * DAY;
+    await made.safety.expire();
+    expect(made.storage.appeals.get(sent.appeal.id)?.status).toBe('expired');
+    const post = made.gateway.messagesIn(MOD_CHANNEL)[0];
+    expect(textOf(post?.message)).toContain('**Expired**: no moderator decided in time.');
+    expect(buttonsOf(post?.message)).toEqual([]);
+    expect(made.dms.to(ALICE).map((dm) => textOf(dm))).toEqual([
+      'No moderator decided on your appeal of your meetup block on **Test Server** in time. You ' +
+        'can appeal again: use `/meetup` there and press Appeal.',
+    ]);
+    expect((await made.appeal()).kind).toBe('sent');
+  });
+
+  it('does not wait for the edit of a stale appeal’s post before taking a new one', async () => {
+    const made = await blocked();
+    const first = await made.appeal();
+    if (first.kind !== 'sent') throw new Error(first.kind);
+    made.clock.now = PARTY_NOW + 7 * DAY;
+    // Discord never answers the edit.
+    vi.spyOn(made.gateway, 'editMessage').mockReturnValue(new Promise(() => undefined));
+    expect(await made.safety.appealState(SAFETY_SERVER, ALICE)).toMatchObject({ kind: 'may' });
+    expect(made.storage.appeals.get(first.appeal.id)?.status).toBe('expired');
+  });
+
+  it('lifts the block and decides the appeal in one step', async () => {
+    const made = await blocked();
+    const sent = await made.appeal();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    made.storage.failing.add('liftBlock');
+    made.storage.failing.add('block');
+    const outcome = await made.safety.decideAppeal(
+      sent.appeal.id,
+      'lift',
+      MODERATOR_MEMBER,
+      SAFETY_SERVER,
+      'Pine Town',
+    );
+    expect(outcome.kind).toBe('done');
+    made.storage.failing.clear();
+    expect(await made.storage.block(SAFETY_SERVER, ALICE)).toBeUndefined();
+    expect(made.storage.appeals.get(sent.appeal.id)?.status).toBe('lifted');
+    // Who blocked them could not be read: the post and the DM come all the same.
+    expect(textOf(made.gateway.messagesIn(MOD_CHANNEL)[0]?.message)).toContain('**Lifted** by');
+    expect(made.dms.to(ALICE)).toHaveLength(1);
+  });
+
+  it('keeps nothing when the appeal cannot be posted', async () => {
+    const made = await blocked();
+    made.gateway.failing.set('sendMessage', new Error('Missing Access'));
+    expect((await made.appeal()).kind).toBe('not-sent');
+    expect(made.storage.appeals.size).toBe(0);
+  });
+
+  it('knows no appeal of another server', async () => {
+    const made = await blocked();
+    const sent = await made.appeal();
+    if (sent.kind !== 'sent') throw new Error(sent.kind);
+    expect(
+      (await made.safety.decideAppeal(sent.appeal.id, 'lift', MODERATOR_MEMBER, OTHER_SERVER)).kind,
+    ).toBe('gone');
+  });
+});
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index 2047c40a..fd90833f 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -4,10 +4,13 @@ import type { PartyGateway } from '../discord/party-gateway.js';
 import type { Place } from '../domain/geo/place.js';
 import type {
   Decider,
+  MeetupAppeal,
+  MeetupBlock,
   MeetupRequestRecord,
   MeetupSafetyStore,
   RequestDecision,
 } from '../domain/meetups/records.js';
+import { isMeetup, type MeetupParty } from '../domain/party/party.js';
 import {
   flaggedWordsOf,
   mayRequestReview,
@@ -21,11 +24,19 @@ import type { MemberInfo } from '../domain/party/attendance.js';
 import { tidyDescription } from '../domain/party/meetup.js';
 import { tidyName } from '../domain/party/timed.js';
 import type { Logger } from '../log.js';
-import { requestMessage, requestOutcomeDm } from '../render/meetup-safety.js';
+import {
+  APPEAL_WAIT_DAYS,
+  appealMessage,
+  appealOutcomeDm,
+  blockedDm,
+  requestMessage,
+  requestOutcomeDm,
+} from '../render/meetup-safety.js';
 import { postLink } from '../render/notify-dm.js';
 import { DM_PRIORITY, type DmSender } from './dm-sender.js';
 import type { MeetupOutcome, PartyService } from './party-service.js';
 import type { GymProvider } from './gym-directory.js';
+import type { PartyProvider } from './party-store.js';
 
 /** Who asks for a check of a place: the maker, in a server, and whether they are staff. */
 export interface PlaceAsk {
@@ -66,9 +77,16 @@ export type SubmitOutcome =
 
 export interface MeetupSafetyOptions {
   storage: MeetupSafetyStore;
-  gateway: Pick<PartyGateway, 'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage'>;
-  /** Where an approved meetup is made. */
-  parties: Pick<PartyService, 'createMeetup'>;
+  gateway: Pick<
+    PartyGateway,
+    'guildName' | 'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage'
+  >;
+  /** Where an approved meetup is made, and a blocked member's meetups are closed. */
+  parties: Pick<PartyService, 'createMeetup' | 'end'>;
+  /** The active parties: a blocked member's meetups are found there. */
+  store: Pick<PartyProvider, 'active'>;
+  /** The row of a server, by which its parties say whose they are. */
+  guilds: { idFor(snowflake: string): Promise<number | undefined> };
   /** How the makers are told what came of their requests. */
   dms: DmSender;
   /** The gyms, by which a gym is checked by its official name and its nickname alike. */
@@ -222,6 +240,7 @@ export class MeetupSafety {
     decision: RequestDecision,
     moderator: { id: string; name?: string | undefined },
     serverId: string,
+    serverName?: string,
   ): Promise<DecideOutcome> {
     const { storage, log } = this.options;
     const request = await storage.request(requestId);
@@ -237,9 +256,6 @@ export class MeetupSafety {
     const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
     const approving = decision === 'approve' || decision === 'approve-once';
     const status = approving ? 'approved' : 'refused';
-    if (!(await storage.decideRequest(request.id, status, decision, by))) {
-      return this.decidedBefore(request);
-    }
     const decided: MeetupRequestRecord = {
       ...request,
       status,
@@ -248,6 +264,15 @@ export class MeetupSafety {
       decidedByName: by.name,
       decidedAt: by.at,
     };
+    if (decision === 'block') {
+      // The refusal and the block in one step: the first press wins, and one block is made.
+      const blocked = await storage.blockMaker(request, by);
+      if (!blocked.decided) return this.decidedBefore(request);
+      return this.block(decided, by, blocked.newBlock, serverName);
+    }
+    if (!(await storage.decideRequest(request.id, status, decision, by))) {
+      return this.decidedBefore(request);
+    }
     if (!approving) {
       if (decision === 'refuse-forever') {
         await this.rule(decided, 'refuse', by).catch((err: unknown) => {
@@ -271,7 +296,22 @@ export class MeetupSafety {
    */
   private async approve(decided: MeetupRequestRecord, by: Decider): Promise<DecideOutcome> {
     const { storage, log } = this.options;
+    // A block of its maker that came meanwhile (over another request) wins: no meetup. One that
+    // cannot be read is looked for again once the meetup is made (`closeIfBlocked`).
+    const blocked = await storage.block(decided.serverId, decided.makerId).catch((err: unknown) => {
+      log.error({ err, request: decided.id }, 'could not look for a block before an approval');
+      return undefined;
+    });
+    if (blocked) return this.withdraw(decided);
     const made = await this.make(decided);
+    if (made.partyId !== undefined) {
+      const closed = await this.closeIfBlocked({
+        serverId: decided.serverId,
+        makerId: decided.makerId,
+        partyId: made.partyId,
+      });
+      if (closed) return this.withdraw(decided);
+    }
     try {
       if (made.partyId === undefined) {
         await storage.settleApproval(decided.id, 'failed');
@@ -303,6 +343,47 @@ export class MeetupSafety {
     };
   }
 
+  /**
+   * An approval that came when its maker was blocked: withdrawn, its post says so; the maker
+   * hears of their block alone.
+   */
+  private async withdraw(decided: MeetupRequestRecord): Promise<DecideOutcome> {
+    await this.options.storage.settleApproval(decided.id, 'withdrawn').catch((err: unknown) => {
+      this.options.log.error({ err, request: decided.id }, 'could not withdraw an approval');
+    });
+    const withdrawn: MeetupRequestRecord = { ...decided, status: 'withdrawn' };
+    await this.show(withdrawn);
+    return { kind: 'done', request: withdrawn };
+  }
+
+  /**
+   * After a meetup was made (`/meetup` with an allowed place, or an approval): when its maker
+   * was blocked in the server meanwhile (the block came after the check, and its sweep of the
+   * maker's meetups before the meetup was there), the meetup is closed at once as Block member
+   * closes one (`CLOSED_BY_MODERATORS`). True when the maker is blocked (a close that failed is
+   * logged). Never throws; nothing while the safety is off.
+   */
+  async closeIfBlocked(made: {
+    serverId: string;
+    makerId: string;
+    partyId: string;
+  }): Promise<boolean> {
+    const { storage, parties, log } = this.options;
+    if (!this.on) return false;
+    try {
+      if (!(await storage.block(made.serverId, made.makerId))) return false;
+    } catch (err) {
+      log.error({ err, party: made.partyId }, 'could not look for a block after making a meetup');
+      return false;
+    }
+    try {
+      await parties.end(made.partyId, undefined, { lastWords: CLOSED_BY_MODERATORS });
+    } catch (err) {
+      log.error({ err, party: made.partyId }, 'could not close a meetup of a blocked member');
+    }
+    return true;
+  }
+
   /** Rules the place of a request for good (a pin has no ruling). */
   private async rule(
     request: MeetupRequestRecord,
@@ -313,6 +394,275 @@ export class MeetupSafety {
     if (key !== undefined) await this.options.storage.rule(request.serverId, key, ruling, by);
   }
 
+  /**
+   * Block member, after the request was refused and its maker blocked in one step
+   * (`blockMaker`): their other pending requests there are withdrawn (their posts edited,
+   * nobody told), their active meetups there are closed as `/delete` closes one, with the
+   * moderators' line, and they are told by DM, once (`newBlock`: not again for a block that
+   * stood already), that they may appeal with `/meetup`. `closed` and `withdrawn` count what
+   * went.
+   */
+  private async block(
+    request: MeetupRequestRecord,
+    by: Decider,
+    newBlock: boolean,
+    serverName: string | undefined,
+  ): Promise<DecideOutcome> {
+    const { storage, parties, guilds, dms, log } = this.options;
+    // The block is kept: what follows is caught and logged, so the post and the DM always come.
+    let withdrawn = 0;
+    try {
+      for (const other of await storage.pendingOf(request.serverId, request.makerId)) {
+        if (!(await storage.decideRequest(other.id, 'withdrawn', null, by))) continue;
+        withdrawn += 1;
+        await this.show({
+          ...other,
+          status: 'withdrawn',
+          decidedBy: by.id,
+          decidedByName: by.name,
+          decidedAt: by.at,
+        });
+      }
+    } catch (err) {
+      log.error(
+        { err, request: request.id },
+        'could not withdraw the other requests of a blocked member',
+      );
+    }
+    let closed = 0;
+    try {
+      const row = await guilds.idFor(request.serverId);
+      for (const party of this.meetupsOf(row, request.makerId)) {
+        try {
+          const ended = await parties.end(party.id, undefined, {
+            lastWords: CLOSED_BY_MODERATORS,
+          });
+          if (ended) closed += 1;
+        } catch (err) {
+          log.error({ err, party: party.id }, 'could not close a meetup of a blocked member');
+        }
+      }
+    } catch (err) {
+      log.error({ err, request: request.id }, 'could not close the meetups of a blocked member');
+    }
+    await this.show(request);
+    if (newBlock) {
+      const now = this.now();
+      dms.send({
+        userId: request.makerId,
+        message: blockedDm(serverName),
+        priority: DM_PRIORITY.normal,
+        eventAt: now,
+        expiresAt: now + DAY,
+      });
+    }
+    return { kind: 'done', request, closed, withdrawn };
+  }
+
+  /**
+   * A blocked member's appeal (the Appeal button of `/meetup`'s refusal and its form): kept
+   * (open) and posted in the moderators' channel of the server with who blocked them and when,
+   * and their words, with Lift block and Keep block. One open appeal at a time (`open`); after a
+   * block was kept, none for `APPEAL_WAIT_DAYS` (`wait`, with when); none from a member who is
+   * not blocked. A post that fails leaves nothing behind (`not-sent`, logged). `nearChannelId`
+   * is a channel of the server, by which its moderators' channel is found.
+   */
+  async appeal(ask: {
+    serverId: string;
+    nearChannelId: string;
+    member: { id: string; name?: string | undefined };
+    text: string;
+  }): Promise<AppealOutcome> {
+    const { storage, gateway, log } = this.options;
+    const state = await this.appealState(ask.serverId, ask.member.id);
+    if (state.kind !== 'may') return state;
+    const name = this.channelName;
+    const channelId = name === undefined ? undefined : gateway.findChannel(ask.nearChannelId, name);
+    if (channelId === undefined) {
+      log.warn(
+        { server: ask.serverId, channel: name },
+        `the moderators' channel #${name ?? ''} is not there: an appeal was not sent`,
+      );
+      return { kind: 'not-sent' };
+    }
+    const appeal: MeetupAppeal = {
+      id: randomUUID(),
+      serverId: ask.serverId,
+      memberId: ask.member.id,
+      memberName: ask.member.name ?? null,
+      text: ask.text.trim(),
+      createdAt: this.now(),
+      status: 'open',
+      channelId,
+      messageId: null,
+      decidedBy: null,
+      decidedByName: null,
+      decidedAt: null,
+    };
+    if ((await storage.addAppeal(appeal)) === 'open') return { kind: 'open' };
+    // A keep that came between the look and the appeal: the seven days stand.
+    const lastKept = await storage.lastKept(ask.serverId, ask.member.id);
+    const wait = this.waitAfterKept(lastKept, state.block);
+    if (wait !== undefined) {
+      await storage.discardAppeal(appeal.id);
+      return wait;
+    }
+    let messageId: string | undefined;
+    try {
+      messageId = await gateway.sendMessage(channelId, appealMessage(appeal, state.block));
+      if (messageId === undefined) throw new Error('the moderators’ channel is gone');
+      await storage.setAppealPost(appeal.id, channelId, messageId);
+    } catch (err) {
+      log.warn({ err, appeal: appeal.id }, 'could not send an appeal to the moderators');
+      if (messageId !== undefined) {
+        await gateway.deleteMessage(channelId, messageId).catch((deleteErr: unknown) => {
+          log.warn({ err: deleteErr }, 'could not take back the post of an appeal');
+        });
+      }
+      await storage.discardAppeal(appeal.id).catch((discardErr: unknown) => {
+        log.error({ err: discardErr, appeal: appeal.id }, 'could not forget an appeal');
+      });
+      return { kind: 'not-sent' };
+    }
+    return { kind: 'sent', appeal: { ...appeal, messageId } };
+  }
+
+  /**
+   * Whether a member may appeal now: `may` (with the block), `not-blocked`, `open` (one is
+   * with the moderators), or `wait` until seven days after a moderator last kept the block.
+   */
+  async appealState(serverId: string, memberId: string): Promise<AppealState> {
+    const { storage } = this.options;
+    const block = await storage.block(serverId, memberId);
+    if (!block) return { kind: 'not-blocked' };
+    const open = await storage.openAppeal(serverId, memberId);
+    // One that went astray (never posted, or nobody decided in time) is closed: they may again.
+    if (open && !(this.isStale(open) && (await this.expireAppeal(open, false)))) {
+      return { kind: 'open' };
+    }
+    const wait = this.waitAfterKept(await storage.lastKept(serverId, memberId), block);
+    return wait ?? { kind: 'may', block };
+  }
+
+  /** The wait after a block was last kept (`kept`), while it lasts. */
+  private waitAfterKept(
+    kept: number | undefined,
+    block: MeetupBlock,
+  ): { kind: 'wait'; until: number } | undefined {
+    if (kept === undefined || kept <= block.blockedAt) return undefined;
+    const until = kept + APPEAL_WAIT_DAYS * DAY;
+    return this.now() < until ? { kind: 'wait', until } : undefined;
+  }
+
+  /** The bounds of a stale open appeal at this moment (`MeetupSafetyStore.staleAppeals`). */
+  private staleBounds(): { unpostedBefore: number; openedBefore: number } {
+    const now = this.now();
+    return { unpostedBefore: now - STRANDED_MS, openedBefore: now - APPEAL_OPEN_DAYS * DAY };
+  }
+
+  /** Whether an open appeal is stale: never posted after a while, or open too long. */
+  private isStale(appeal: MeetupAppeal): boolean {
+    const { unpostedBefore, openedBefore } = this.staleBounds();
+    return (
+      (appeal.messageId === null && appeal.createdAt <= unpostedBefore) ||
+      appeal.createdAt <= openedBefore
+    );
+  }
+
+  /**
+   * Closes a stale open appeal as expired (false when it was decided meanwhile): its post, if
+   * any, says so without buttons, and with `tell` the member hears they may appeal again.
+   */
+  private async expireAppeal(appeal: MeetupAppeal, tell: boolean): Promise<boolean> {
+    const { storage, gateway, dms, log } = this.options;
+    if (!(await storage.decideAppeal(appeal.id, 'expired', null))) return false;
+    const expired: MeetupAppeal = { ...appeal, status: 'expired' };
+    const { channelId, messageId } = expired;
+    if (channelId !== null && messageId !== null) {
+      const shown = (async () => {
+        const block = await storage.block(appeal.serverId, appeal.memberId);
+        await gateway.editMessage(channelId, messageId, appealMessage(expired, block));
+      })().catch((err: unknown) => {
+        log.warn({ err, appeal: appeal.id }, 'could not show that an appeal expired');
+      });
+      // The sweep waits for it; a member who appeals again (a form to open within three
+      // seconds) does not.
+      if (tell) await shown;
+    }
+    if (tell) {
+      const now = this.now();
+      dms.send({
+        userId: appeal.memberId,
+        message: appealOutcomeDm(expired, gateway.guildName(appeal.serverId)),
+        priority: DM_PRIORITY.normal,
+        eventAt: now,
+        expiresAt: now + DAY,
+      });
+    }
+    return true;
+  }
+
+  /**
+   * A moderator's decision of an appeal: Lift block lifts it (who lifted it is kept), Keep block
+   * keeps it; the first press wins (`decided-before`). The post is edited to the outcome and the
+   * member told by DM. An appeal of another server is `gone`.
+   */
+  async decideAppeal(
+    appealId: string,
+    decision: 'lift' | 'keep',
+    moderator: { id: string; name?: string | undefined },
+    serverId: string,
+    serverName?: string,
+  ): Promise<AppealDecision> {
+    const { storage, gateway, dms, log } = this.options;
+    const appeal = await storage.appeal(appealId);
+    if (!appeal || appeal.serverId !== serverId) return { kind: 'gone' };
+    if (appeal.status !== 'open') return { kind: 'decided-before', appeal };
+    const now = this.now();
+    const by: Decider = { id: moderator.id, name: moderator.name ?? null, at: now };
+    const status = decision === 'lift' ? 'lifted' : 'kept';
+    // Read before it is lifted: the post keeps saying who blocked them and when (when it can).
+    const block = await storage.block(appeal.serverId, appeal.memberId).catch((err: unknown) => {
+      log.warn({ err, appeal: appeal.id }, 'could not read the block of an appeal');
+      return undefined;
+    });
+    // Lift block decides the appeal and lifts the block in one step.
+    const decidedNow =
+      decision === 'lift'
+        ? await storage.liftOnAppeal(appeal, by)
+        : await storage.decideAppeal(appeal.id, status, by);
+    if (!decidedNow) {
+      const later = await storage.appeal(appeal.id);
+      return later ? { kind: 'decided-before', appeal: later } : { kind: 'gone' };
+    }
+    const decided: MeetupAppeal = {
+      ...appeal,
+      status,
+      decidedBy: by.id,
+      decidedByName: by.name,
+      decidedAt: by.at,
+    };
+    if (decided.channelId !== null && decided.messageId !== null) {
+      try {
+        await gateway.editMessage(
+          decided.channelId,
+          decided.messageId,
+          appealMessage(decided, block),
+        );
+      } catch (err) {
+        log.warn({ err, appeal: appeal.id }, 'could not show the outcome of an appeal');
+      }
+    }
+    dms.send({
+      userId: appeal.memberId,
+      message: appealOutcomeDm(decided, serverName),
+      priority: DM_PRIORITY.normal,
+      eventAt: now,
+      expiresAt: now + DAY,
+    });
+    return { kind: 'done', appeal: decided };
+  }
+
   /**
    * Expires the pending requests whose time is up (with the clock's tick): each is marked
    * expired, its post edited and its maker told. Answers how many. Also while the safety is off:
@@ -332,11 +682,16 @@ export class MeetupSafety {
         log.error({ err, request: request.id }, 'could not expire a meetup request');
       }
     }
+    for (const appeal of await storage.staleAppeals(this.staleBounds())) {
+      try {
+        await this.expireAppeal(appeal, true);
+      } catch (err) {
+        log.error({ err, appeal: appeal.id }, 'could not close an appeal nobody decided');
+      }
+    }
     for (const request of await storage.strandedApprovals(now - STRANDED_MS)) {
       try {
-        if (await storage.settleApproval(request.id, 'failed')) {
-          await this.tell({ ...request, status: 'failed' }, { failure: FAILURE });
-        }
+        await this.settleStranded(request);
       } catch (err) {
         log.error({ err, request: request.id }, 'could not fail an approval without its meetup');
       }
@@ -344,6 +699,48 @@ export class MeetupSafety {
     return expired;
   }
 
+  /**
+   * An approval left without its recorded meetup: when the meetup is there all the same (the
+   * bot stopped, or the database failed, after it was made: an active meetup of the maker in
+   * the server with the request's name and start), it is settled with it, the post shown, and
+   * nobody told again (closed and `withdrawn` when its maker was blocked since); otherwise it
+   * failed, the post says so and the maker is told.
+   */
+  private async settleStranded(request: MeetupRequestRecord): Promise<void> {
+    const { storage, guilds } = this.options;
+    const row = await guilds.idFor(request.serverId);
+    const party = this.meetupsOf(row, request.makerId).find(
+      (one) => one.timed.name === request.name && one.timed.startTime === request.startTime,
+    );
+    if (party === undefined) {
+      if (await storage.settleApproval(request.id, 'failed')) {
+        await this.tell({ ...request, status: 'failed' }, { failure: FAILURE });
+      }
+      return;
+    }
+    const made = { serverId: request.serverId, makerId: request.makerId, partyId: party.id };
+    if (await this.closeIfBlocked(made)) {
+      if (await storage.settleApproval(request.id, 'withdrawn')) {
+        await this.show({ ...request, status: 'withdrawn' });
+      }
+      return;
+    }
+    if (await storage.settleApproval(request.id, { partyId: party.id })) {
+      const postId = party.forumPostId ?? undefined;
+      await this.show({ ...request, partyId: party.id }, postId);
+    }
+  }
+
+  /** The active meetups a member made in the server of this row. */
+  private meetupsOf(row: number | undefined, makerId: string): MeetupParty[] {
+    return this.options.store
+      .active()
+      .filter(
+        (party): party is MeetupParty =>
+          isMeetup(party) && party.guildId === row && party.createdById === makerId,
+      );
+  }
+
   /** Marks one request expired (false when it was decided meanwhile), edits its post, tells. */
   private async expireOne(request: MeetupRequestRecord): Promise<boolean> {
     if (!(await this.options.storage.decideRequest(request.id, 'expired', null, null)))
@@ -395,19 +792,9 @@ export class MeetupSafety {
     request: MeetupRequestRecord,
     made: { postId?: string; failure?: string } = {},
   ): Promise<void> {
-    const { gateway, dms, log } = this.options;
+    const { dms } = this.options;
     const now = this.now();
-    if (request.channelId !== null && request.messageId !== null) {
-      const shown = requestMessage(
-        request,
-        made.postId === undefined ? {} : { postId: made.postId },
-      );
-      try {
-        await gateway.editMessage(request.channelId, request.messageId, shown);
-      } catch (err) {
-        log.warn({ err, request: request.id }, 'could not show the outcome of a meetup request');
-      }
-    }
+    await this.show(request, made.postId);
     dms.send({
       userId: request.makerId,
       message: requestOutcomeDm(request, {
@@ -419,6 +806,18 @@ export class MeetupSafety {
       expiresAt: Math.max(request.startTime, now + DM_HOURS * 3_600_000),
     });
   }
+
+  /** Shows what came of a request in its post, without buttons; a failure is logged. */
+  private async show(request: MeetupRequestRecord, postId?: string): Promise<void> {
+    const { gateway, log } = this.options;
+    if (request.channelId === null || request.messageId === null) return;
+    const shown = requestMessage(request, postId === undefined ? {} : { postId });
+    try {
+      await gateway.editMessage(request.channelId, request.messageId, shown);
+    } catch (err) {
+      log.warn({ err, request: request.id }, 'could not show the outcome of a meetup request');
+    }
+  }
 }
 
 /** How long the DM of an outcome may wait at least: past the meetup's start it says nothing. */
@@ -433,6 +832,33 @@ const FAILURE = 'something went wrong';
  */
 const STRANDED_MS = 5 * 60_000;
 
+const DAY = 24 * 3_600_000;
+
+/** How long an appeal waits for a moderator: after that it is closed, and may be made again. */
+const APPEAL_OPEN_DAYS = 7;
+
+/** What the post of a meetup closed because its maker was blocked says last. */
+export const CLOSED_BY_MODERATORS = 'This meetup was closed by the moderators.';
+
+/** Whether a member may appeal their block now. */
+export type AppealState =
+  | { kind: 'may'; block: MeetupBlock }
+  | { kind: 'not-blocked' }
+  | { kind: 'open' }
+  | { kind: 'wait'; until: number };
+
+/** What came of an appeal. */
+export type AppealOutcome =
+  | Exclude<AppealState, { kind: 'may' }>
+  | { kind: 'sent'; appeal: MeetupAppeal }
+  | { kind: 'not-sent' };
+
+/** What came of a moderator's press on an appeal's post. */
+export type AppealDecision =
+  | { kind: 'gone' }
+  | { kind: 'decided-before'; appeal: MeetupAppeal }
+  | { kind: 'done'; appeal: MeetupAppeal };
+
 /** Why an approved meetup could not be made, as the moderator and the maker are told. */
 const FAILURES: Record<Exclude<MeetupOutcome['kind'], 'created'>, string> = {
   'bad-name': 'its name is no name',
@@ -452,5 +878,15 @@ export type DecideOutcome =
   | { kind: 'expired' }
   /** Approve and Refuse from now on are not for a pin. */
   | { kind: 'not-for-a-pin' }
-  /** Decided: `postId` the meetup's post, `failure` why an approved one could not be made. */
-  | { kind: 'done'; request: MeetupRequestRecord; postId?: string; failure?: string };
+  /**
+   * Decided: `postId` the meetup's post, `failure` why an approved one could not be made; of a
+   * block, how many active meetups of the maker were `closed` and pending requests `withdrawn`.
+   */
+  | {
+      kind: 'done';
+      request: MeetupRequestRecord;
+      postId?: string;
+      failure?: string;
+      closed?: number;
+      withdrawn?: number;
+    };
diff --git a/test/support/fake-gateway.ts b/test/support/fake-gateway.ts
index 13f71737..52f7d497 100644
--- a/test/support/fake-gateway.ts
+++ b/test/support/fake-gateway.ts
@@ -1110,6 +1110,13 @@ export class FakePartyGateway implements PartyGateway {
     return this.channelNames.get(channelId);
   }
 
+  /** The name of the fake's server, as the fake interactions name it; none of another. */
+  serverName = 'Test Server';
+
+  guildName(guildId: string): string | undefined {
+    return guildId === this.guildId ? this.serverName : undefined;
+  }
+
   /**
    * Every channel of the fake is in the one server: the channel named so in `channelNames`,
    * and like the real gateway only one in which the bot may post embeds (`noEmbeds`).
diff --git a/test/support/meetup-safety-service.ts b/test/support/meetup-safety-service.ts
index 5eba0171..48da877a 100644
--- a/test/support/meetup-safety-service.ts
+++ b/test/support/meetup-safety-service.ts
@@ -48,6 +48,10 @@ export async function meetupSafetyWith(
     parties: made.service,
     dms: made.dms,
     gyms: made.gyms,
+    store: made.store,
+    guilds: {
+      idFor: (snowflake) => Promise.resolve(snowflake === made.gateway.guildId ? 1 : undefined),
+    },
     settings,
     log: made.log,
     now: () => made.clock.now,
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 75725959..8ee896ef 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -187,6 +187,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
       ),
       parties: ctx.partyService,
       dms: ctx.dms,
+      store: ctx.parties,
+      guilds: ctx.guilds,
       settings: ctx.config.settings,
       log,
     });
````

### Task 6: Plan 8S-1 T6: Meetup safety: start warning, cutover-check, docs and staging

Prototype commit: `d0cd14b6d12f85835b52ac508ccc0731e64f8556`

At the start the log warns once per server where meetup safety cannot
work (no settings.channels.moderation, or no such text channel there).
cutover-check has a moderation line: a warning while the setting is
unset, the server lacks the channel or the bot may not post there.
docs/architecture/meetup-safety.md describes the check, /meetup, the
requests, decisions, expiry, blocks and appeals; the other area files,
the guides and a staging checklist draft follow.

**Files:**

```
 data/settings.json                                     |  3 +-
 docs/architecture/discord-framework.md                 |  1 +
 docs/architecture/meetup-safety.md                     | 33 ++++++++++++++
 docs/architecture/operations.md                        |  4 +-
 docs/architecture/parties-and-posts.md                 |  4 +-
 docs/architecture/testing.md                           |  4 ++
 docs/guides/migrating-a-legacy-instance.md             |  2 +
 docs/guides/new-instance.md                            |  1 +
 docs/superpowers/plans/2026-10-17-phase-8s1-staging.md | 57 +++++++++++++++++++++++
 src/app.ts                                             |  2 +
 src/ops/cutover-check.test.ts                          | 93 +++++++++++++++++++++++++++++++++++++-
 src/ops/cutover-check.ts                               | 72 ++++++++++++++++++++++++++++-
 src/ops/permissions.ts                                 |  6 +++
 src/services/meetup-safety.test.ts                     | 37 +++++++++++++++
 src/services/meetup-safety.ts                          | 49 +++++++++++++++++++-
 15 files changed, 360 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit src/ops/cutover-check.test.ts src/services/meetup-safety.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d0cd14b6d12f85835b52ac508ccc0731e64f8556 -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8s1-meetup-safety.md'` prints nothing.
- [ ] **Step 5: Commit** with the title `Plan 8S-1 T6: Meetup safety: start warning, cutover-check, docs and staging`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`, deletions with `git rm`).

````diff
diff --git a/data/settings.json b/data/settings.json
index e87bb09d..3799109c 100644
--- a/data/settings.json
+++ b/data/settings.json
@@ -46,7 +46,8 @@
     "elite-gym-raids": "elite-gym-raids",
     "remote-raids": "remote-raids",
     "pvp": "rank-checker",
-    "bot-updates": "bot-updates"
+    "bot-updates": "bot-updates",
+    "moderation": ""
   },
   "categories": {
     "pvp": "PVP CHAT AND TOURNAMENTS"
diff --git a/docs/architecture/discord-framework.md b/docs/architecture/discord-framework.md
index fcac44eb..fb61cab2 100644
--- a/docs/architecture/discord-framework.md
+++ b/docs/architecture/discord-framework.md
@@ -10,6 +10,7 @@ How the bot talks to Discord apart from parties: slash commands and their router
 - A part of a `commandGroup` may have `enabled(config)` (`SubcommandPart.enabled`): `enabledCommands()` then narrows the command to the subcommands its settings offer, for the router, `/help` and the deploy script alike (`/admin self-roles` exists only where `features.roles` is on).
 - For a command with `default_member_permissions` the router runs the command-level guards also for an autocomplete interaction and answers an empty list when one refuses; such a guard must cope with an autocomplete interaction and read no options. Ordinary commands' autocomplete runs no guards.
 - `/admin` is a `commandGroup` whose parts are listed in `src/commands/admin/index.ts`: a new subcommand is a file there, appended to that list. `/raid` reads what a member picked or typed through `src/commands/raids/raid-input.ts` (`reportedBoss`, `reportedGym`, `reportedTime`); a question to the member (a menu, a confirmation) keeps its values in a `PendingRequests` store under a token that is the id of the controls' custom id. The custom-id kind `raid` belongs to `/raid`'s own controls.
+- A refusal that needs a control of its own (the Appeal of a member blocked from making meetups, `meetup-safety.md`) is a `UserError` with `answer` (a `V2Message`): the router shows that message privately (`answerApart`) where the interaction is not answered yet or was deferred privately, and the text otherwise.
 - A command's `throttle` may be a function of the interaction (`/meet`: 3 per 180 seconds in a timed party); a use that a guard refused does not count, so what can be known before the work (a bad name, no region, an unreadable time) is refused by a guard that reads the options (`/meetup`, `/meet`), and `execute` keeps its own checks.
 
 ## The router and deferral
diff --git a/docs/architecture/meetup-safety.md b/docs/architecture/meetup-safety.md
new file mode 100644
index 00000000..976cdd0f
--- /dev/null
+++ b/docs/architecture/meetup-safety.md
@@ -0,0 +1,33 @@
+# Meetup safety
+
+A meetup at a place that might be private is held for a moderator before anything is posted (plan 8S-1; spec `docs/superpowers/specs/2026-10-17-meetup-safety-design.md`, Matt, 2026-10-17): the check of a place, the requests and the moderators' posts with their decisions, expiry, place rulings, blocks and appeals. Read before changing `/meetup`, the check, or anything under `src/domain/meetups/`, `src/services/meetup-safety.ts`, `src/components/meetup-safety.ts` or `src/components/meetup-appeal.ts`.
+
+## The check
+
+- `meetupPlaceVerdict(check)` (`src/domain/meetups/safety.ts`, pure) answers `allowed`, `review`, `refused` or `blocked` from: whether the safety is `on`, the place (8D's `Place`: a gym, PokéStop or power spot as a snapshot, or a pin), whether the maker is `staff` (`isStaff`: admins, moderators, the owner), whether they are `blocked`, the server's `ruling` of the place, and the `flaggedWords`. In this order: off or staff, allowed (staff are never blocked); blocked; a pin, review (a pin has no ruling, and one given is ignored: an approval of a pin is for that meetup alone); a ruling `refuse`, refused; a ruling `allow`, allowed; a flagged title or other name (`otherTitles`), review; else allowed.
+- `MeetupSafety.verdict({ serverId, place, makerId, staff })` (`src/services/meetup-safety.ts`) is the shared check: it reads the block and the ruling from the storage (nothing for staff or while the safety is off), and for a gym its official name and nickname (`MeetupSafetyOptions.gyms`), either of which flags it. `/meetup` asks it; plan 8M-5 (meetups from the web map) must ask the same, and may end in "sent to the moderators" (`submit`) instead of a post.
+- Flagged words: `DEFAULT_FLAGGED_WORDS` (little free library, apartment(s), apts, apt, condo(s), condominium(s), townhome(s), townhouse(s), residence, private, salon, studio, LLC, daycare; not "home of", which public signs say) and `settings.meetupSafety.flaggedWords`, in lower case, each once (`flaggedWordsOf`); a word matches the place's title as a whole word (no letter or digit beside it; the words of a phrase across any white space), whatever the letter case (`flaggedWordIn`; the words of a list are one expression, made once per list). A gym's title is the name its post shows (the nickname first); its other name is checked too.
+- Rulings are kept per server by the place's kind and id (`rulingKeyOf`: a gym's number as text, a Wayspot's Wayfarer id); a pin has none.
+- The safety is on only where `settings.channels.moderation` names a channel (optional, blank unset, without `#`). Unset: every place is allowed and nothing is stored; the start logs a warning per server (`MeetupSafety.warnAtStart`, also for a server that lacks the channel) and `cutover-check` warns (`moderation` line).
+
+## `/meetup`
+
+- `/meetup name near start` (all required since 8S-1) is refused by its guards for everything that can be known before the form, so that a refusal does not count: no region or forum, a bad name, a place `namedPlace` cannot take, a start `typedTimedTime` cannot read for a meetup still to be made (`newMeetupTimes`), and the verdict: `refused` (`NO_MEETUP_HERE`, "A meetup can't be held there."), `blocked` (`NO_MEETUPS_FOR_YOU`, with an Appeal button: `blockedRefusal`, a `UserError` with `answer`, which the router shows privately; the same before the form, on its submit and after a meetup made meanwhile), `review` with a start less than two hours ahead (`MEETUP_TOO_SOON`). Its throttle (`MEETUP_THROTTLE`, two a quarter of an hour) counts the command, so a form left unsent counts too, and requests count like meetups.
+- The guard keeps what it read for `execute` (a `WeakMap` by the interaction), so nothing is searched or checked twice before the form must open. The command then opens the form of the information (`meetupForm`, `infoInput` shared with `/info`: required here, at least one character; information of nothing but white space is refused, `NO_INFORMATION`), keeping what it was used with in a `PendingRequests` under the form's token for half an hour (`meetup:<token>:form`; a form open across a restart expires). On the submit (`meetupFormControls`) the verdict is asked again (a ruling or block may have come meanwhile), then: allowed, `PartyService.createMeetup` with the start and information (`MeetupRequest.startTime`, `.description`; the meetup is made with them, so one post and no line announcing a start); review, `MeetupSafety.submit`, and the member is told `MEETUP_HELD` (never why). After a meetup is made, `MeetupSafety.closeIfBlocked` looks for a block once more (one that came after the check, whose sweep of the maker's meetups ran before this one was there): it closes the meetup as Block member does, and the member gets the blocked answer. Refusals of the form give the typed information back (`refusedWithText`).
+
+## Requests and the moderators' post
+
+- `MeetupSafety.submit` sends the moderators' post into the channel `findChannel(regionChannelId, moderation)` finds, then stores the request with it (a UUID, `MeetupRequestRecord`, `src/domain/meetups/records.ts`; a request is never kept without its post); whatever fails (no channel, Discord refuses, the record: the post is then taken back) leaves nothing behind (`not-sent`: the member is told to try later, the reason is logged). A name or information a meetup cannot have is `bad-name` / `bad-description` (8M-5 calls it without `/meetup`'s guards). A request expires at `requestExpiry(createdAt, startTime)`: 48 hours, or an hour before the start when that is sooner; one that would leave the moderators less than an hour is not made (`too-soon`). In rehearsal mode the rehearsal gateway lets the moderators' posts (requests and appeals) into their channel and nothing else outside the posts of parties (`RehearsalPostsOptions.moderationChannel`; Matt, 2026-10-17), so the staff who rehearse see them (a text channel of that name only).
+- The post (`requestMessage`, `src/render/meetup-safety.ts`): `### Meetup waiting for approval`, the name, the start, who asked (`memberText`) in which region channel, **Where** (`nearLine`: kind, title and address cut to 100 and 200 characters, Map; a pin as `pinLine`; the Wayspot's picture beside it), **Information** (`plainLines`, never cut), when it expires, and the buttons: Approve, Approve once, Refuse, Refuse from now on, Block member (a pin: Approve once, Refuse, Block member). Custom ids `msafety:<request id>:<decision>`.
+- The buttons (`meetupSafetyControls`, `src/components/meetup-safety.ts`) are for staff (`requireManagement`; others are refused privately and uncounted) with a throttle of their own (`SAFETY_THROTTLE`). The handler defers privately and asks `MeetupSafety.decide`, which reads the request from the database (a post from before a restart works): one conditional update `pending` → decided (`decideRequest`; Block member `blockMaker`), so the first press wins and a later one is told who decided what. Approve and Approve once read the maker's block again (one that came meanwhile wins: the request becomes `withdrawn`, its post says so, no meetup, no DM), then make the meetup as its maker asked (`createMeetup`, the maker's name and team as they were when they asked; a failure marks the request `failed` and says why to the moderator and the maker), and `closeIfBlocked` after it; Approve allows the place for good only once the meetup is made (`settleApproval`, then `rule`), Refuse from now on refuses it. A meetup made whose record fails is written once more (`settleApproval` retried). Every step after the decision is caught and logged (also the first look for a block, which `closeIfBlocked` repeats), so the post is always edited to the outcome without buttons and the maker always told by DM through `DmSender` (`requestOutcomeDm`: approved with Go to post, not approved, expired; never why).
+- Expiry runs with every tick of the party clock, in the background and one at a time (`PartySchedulerOptions.requests`, `MeetupSafety.expire`), also while the safety is off (requests made before it was turned off end): pending requests past `expiresAt` become `expired`, their posts edited, their makers told (a due row that cannot be read becomes `failed`, logged once); approvals left without their recorded meetup for five minutes (`strandedApprovals`) are settled with the meetup when one is active (the maker's, in the server, with the request's name and start: the bot stopped or the database failed after it was made; no DM; closed and `withdrawn` when the maker was blocked since), else become `failed`, posts edited, makers told; open appeals that are stale are closed (below). A press on a request whose time is up expires it instead of deciding it ("This request has expired: nobody decided in time.").
+
+## Blocks and appeals
+
+- Block member refuses the request (`decision` `block`) and blocks its maker in that server in one transaction (`blockMaker`, read committed: no gap locks, so two Blocks of one maker never deadlock; it never joins a caller's transaction: `inTransaction` throws when an isolation level is asked for inside one; `MeetupBlock`, one row per server and member, blocked again in place of a lifted one: only the last lift is kept, `liftedBy`, `liftedByName`, `liftedAt`), then, each step caught and logged so that the post and the DM always come, withdraws their other pending requests there (status `withdrawn`, posts edited, no DM each), closes their active meetups there as `/delete` does with `CLOSED_BY_MODERATORS` ("This meetup was closed by the moderators.", `PartyService.end` with `lastWords`), and DMs them (`blockedDm`) that they may appeal with `/meetup`, only when the block is new (`newBlock`): two Blocks give one DM.
+- A blocked member's `/meetup` answers with Appeal (`mappeal:<server>:open`), which opens the form of an appeal (`appealForm`, "Why should the block be lifted?", `mappeal:<server>:form`) unless the member may not appeal now (`appealState`: not blocked, one appeal open, or within `APPEAL_WAIT_DAYS` (7) after a block was kept); an open appeal that is stale (its post never recorded after five minutes, or open for seven days) is closed as `expired` then (its post edited without waiting: the form must open within three seconds), and by the sweep (which edits its post and DMs the member, the server named through `PartyGateway.guildName`, that they may appeal again). The presses of Appeal count as reading (`MEMBER_READ_THROTTLE`); the submit (three an hour, `APPEAL_THROTTLE`) stores the appeal (one open per member and server: a unique `openKey`) and posts it to the moderators' channel (`appealMessage`: the member, who blocked them and when, their words) with Lift block and Keep block (`mappeal:<appeal id>:lift|keep`, staff only, first press wins; Lift block decides the appeal and lifts the block in one transaction, `liftOnAppeal`); the seven days are checked again once the appeal is stored (a keep that came in between discards it). The post keeps who blocked them after a Lift (the block is read before it is lifted) and says when they may appeal again after a Keep; the member is told by DM, the server named (`appealOutcomeDm`). Lifting never restores refused requests or closed meetups.
+
+## Storage
+
+- Migration 019 (`MeetupRequest`, `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`): servers and members by snowflake without a foreign key, times in epoch milliseconds, a request's place as JSON read through `placeDocument` (`party-state.ts`; a row that does not read is logged and left alone, a due one failed), its post (`channelId`, `messageId`) never null. `isDuplicateEntry(err, key)` (`src/db/errors.ts`) tells the open-appeal key's duplicate from others. `MeetupSafetyRepository` and its twin `MemoryMeetupSafety` (`test/support/meetup-safety.ts`) run the same cases (`meetupSafetyCases`).
+- Tests of the service and the controls build it with `meetupSafetyWith(options)` (`test/support/meetup-safety-service.ts`): the services of `partyServiceWith`, the moderators' channel `MODERATION` as `MOD_CHANNEL` on the fake gateway (`moderation: null` for the safety off, `channel: false` for a server without it), `held(ask?)` for a request of Alice's at the Little Free Library a day ahead, `postOf(request)`. `createTestContext`'s own `meetupSafety` is off (the test settings name no moderators' channel).
diff --git a/docs/architecture/operations.md b/docs/architecture/operations.md
index b52eff76..c8f4f27f 100644
--- a/docs/architecture/operations.md
+++ b/docs/architecture/operations.md
@@ -70,9 +70,9 @@ How Pine runs: the Docker stack, the image, the operator script `./pine`, the bo
 The tools of the cutover, for every legacy instance (Pittsburgh's night: `docs/superpowers/plans/2026-10-16-phase-8c-cutover-runbook.md`).
 
 - `./pine convert-settings <legacy data folder> [--out <folder>] [--force]` (`npm run settings:convert -- …` on a checkout; `convertSettings` / `convertInstallation`, `src/ops/convert-settings.ts`): reads the legacy `settings.json` and `private-settings.json` and writes `pine-settings.json` and `env-from-legacy.txt` beside `compose.yaml` (or into `--out`), never `.env` itself, and neither file when either exists unless `--force`. The settings start from the repository's `data/settings.json` (the new keys' defaults: the timezone, the screen reader, the feeds), and every key the new bot reads takes the legacy value; renamed keys are mapped (`RENAMED`: `channels.ex-gym-raids` to `channels.elite-gym-raids`), help groups the new bot does not have are dropped from `helpGroups`, every key nothing reads (the EX durations, `commandPrefix`, the reactions) is dropped and named, and a feature flag the legacy file lacks is off (`offByAbsence`: the legacy bot read it as undefined); the result must pass the bot's own schema, or nothing is written. `regionMapLink` comes from the private settings. The private settings map to `.env` (`PRIVATE_TO_ENV`: the token, the owner, the database, the picture address (`POKEMON_IMAGE_BASE`, optional: nothing reads it any more, so it is never asked for by hand), Google, GitHub's token and repository); secrets are copied as written (never trimmed; a snowflake written as a JSON number is refused: it has lost digits); both files go to temporary files first (the fragment owner-only from its creation) and are renamed into place only when both were written; the fragment lists what the operator adds by hand (`DISCORD_APP_ID`, which the legacy bot never had, `DB_ROOT_PASSWORD`, `BACKUP_DIR`, written as `./backups` meanwhile, since a blank one switches the backups off; a `DB_USER` of `root`, which the stack cannot make). A file that starts with a byte order mark is read. It prints names and "set" / "empty", never a value. In the stack it runs without Compose (Compose refuses `compose.yaml` without `.env`): `docker build` under a tag of its own (`professor-pine:convert-settings`: under a stack's tag it would re-tag the image that stack runs), then `docker run` of that image as the operator's own user with the legacy folder mounted read-only and the output folder writable; a folder is handed to Docker as `docker_folder` makes it (`pwd -W` in Git Bash).
-- `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; in rehearsal mode the application's global commands (a warning: every member sees them; one that cannot be read is a warning too, and the rest is still checked) and, per server, what the bot's own roles must give it to make a hidden forum (`HIDDEN_FORUM_NEEDS`: Manage Channels, Manage Roles, View Channel, Send Messages, Read Message History, Send Messages in Threads and Add Reactions, all required; one FAIL line names those missing: a hidden forum's creation may give only what the bot has in the server, so a category's overwrite does not count; the server's warning of optional permissions leaves out what that line names, so one problem gives one line); the servers of `Guild` the bot is in (a FAIL when it is in none of them, and when a legacy or Pine database names no server or has no regions: the wrong copy; a warning for a new install); per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
+- `./pine cutover-check` (`npm run cutover:check` on a checkout against the configured database; `cutoverCheck`, `src/ops/cutover-check.ts`) is the go / no-go of a cutover, read only: the database in a read-only transaction (`CutoverRepository`, which reads a legacy database as a Pine one, `migrationPlan` and the legacy restriction tables), Discord through its REST API with the bot's token, GETs only (`DiscordRead`; no gateway login, so the legacy bot keeps running). It prints `PASS` / `WARN` / `FAIL` lines and exits 1 when any fails: the database (what the migrator would do, in its own words: `migrationPlan`, `src/db/migrator.ts`, shares the refusals with `runMigrations`, and the pending migrations come from Kysely's own list, which writes nothing); the application (`DISCORD_APP_ID` must be the token's), the privileged intents the settings ask for against those it has, the game's icons it lacks as emoji; in rehearsal mode the application's global commands (a warning: every member sees them; one that cannot be read is a warning too, and the rest is still checked) and, per server, what the bot's own roles must give it to make a hidden forum (`HIDDEN_FORUM_NEEDS`: Manage Channels, Manage Roles, View Channel, Send Messages, Read Message History, Send Messages in Threads and Add Reactions, all required; one FAIL line names those missing: a hidden forum's creation may give only what the bot has in the server, so a category's overwrite does not count; the server's warning of optional permissions leaves out what that line names, so one problem gives one line); the servers of `Guild` the bot is in (a FAIL when it is in none of them, and when a legacy or Pine database names no server or has no regions: the wrong copy; a warning for a new install); per server the bot's roles and the permissions it needs (`SERVER_NEEDS`), per region those in its channel (`REGION_CHANNEL_NEEDS`) and in its category and forum (`FORUM_NEEDS`), computed from the roles and overwrites as Discord does (`src/ops/permissions.ts`; the lists name what the code asks of Discord, a missing optional one is a warning); the regions without a forum; the channels, the category and the role the settings name that the server lacks; rows of the legacy restriction tables, listed as `role-auth-export` lists them; whether the bot may post in the channels it announces in (`ANNOUNCE_NEEDS`: bot-updates, the moderators' channel, Unown sightings, the elite and remote channels); meetup safety's moderators' channel (`moderation`, plan 8S-1: a warning when `settings.channels.moderation` is unset, so the safety is off, when the server has no text channel of that name, when the bot lacks what it needs there (`MODERATION_NEEDS`: View Channel, Send Messages, Embed Links), or when everyone can see it (it must be staff-only); a pass otherwise); the self-assigned roles of `Role` that sit at or above the bot's highest role, which it cannot give (by snowflake, or by name where a legacy row has none; names compared trimmed and lower case, as the bot compares them). Manage Messages in a region channel is optional (the screenshot it read is taken away). `migrationPlan` also refuses what Kysely's `migrateToLatest` would (a migration run that the bot does not know, migrations run out of order), in its words. Each section of the database that cannot be read (`databaseStore`, `src/ops/cutover-store.ts`, reads a database of any shape and gives nothing for a table it lacks) and each server that cannot be read is a FAIL line of its own, and the rest is still checked; `/users/@me/guilds` is read unpaginated (the first 200 servers). A new permission the bot needs goes into those lists.
 - `/admin cleanup-legacy` (staff, `defer: 'ephemeral'`; `src/commands/admin/cleanup-legacy.ts`, `LegacyCleanup` in `src/services/legacy-cleanup.ts`, the rules in `src/ops/legacy-cleanup.ts`) deletes the legacy bot's party channels in two steps. The list, read only through Discord's REST API (the client's own `rest`; `cleanupList`): the text channels the legacy `active/` files name (`readLegacyActive`, `src/ops/legacy-parties.ts`: only the channel, the kind and the region channel are taken, never the members), and orphans: text channels in a scanned category (those of the region channels and of the channels the files name; never the channels in no category, the server's own, where a region channel without a category also sits) whose name is a legacy party name (`legacyNameOf`: `train-…`, `meetup-…`, `egg-<tier>-…`, `boss-<tier>-…`, `expired-…`, `ex-raid-…`, `elite-raid-…` are sure) and whose oldest message (`GET /channels/{id}/messages?after=0&limit=1`) is the bot's. A hatched raid's `<pokemon>-<gym words>` is any name of two words: it is deleted only when its first message is the legacy bot's status (`LEGACY_STATUS`: "Use #region to return to this raid's regional channel.", as `getSourceChannelMessageHeader` of the legacy `app/raid.js`, `train.js`, `meetup.js` wrote it), and listed apart when the bot wrote something else first. Never listed, whatever a file says: a region channel, a region's forum, a channel the settings name (`settings.channels`). A channel with a sure name whose first message is not the bot's (a member's, none, unreadable), or one with the bot first and no legacy name, is listed apart as "Not deleted" for a person. The answer is a components-v2 message (the whole list as `legacy-cleanup.txt` when it does not fit), with "Delete these n channels" and Cancel, which only the one who asked may press within `CLEANUP_MINUTES` (10; `PendingRequests`); the deletion goes one channel at a time, a second apart (discord.js waits out a 429 besides; `LegacyCleanup` takes a `wait`, which tests pass), logs each, shows how far it is every ten channels in the answer (so that a long run says something before the interaction's quarter of an hour ends), counts what was gone already and says what failed (by whole lines, then "…and n more"); a second press meanwhile is only acknowledged. One press deletes at most `CLEANUP_PER_RUN` (400) channels, so that the run ends while the press's quarter of an hour still lets it say so: the button then reads "Delete 400 of these n" and the answer says to run the command again for the rest. The legacy files come from `LEGACY_PARTIES_DIR`, a folder the stack mounts read-only at `/legacy-parties` (blank: none; the list is then made of orphans alone, which the legacy active parties' channels also are when the bot wrote first); `./pine up`, `restart` and `update` refuse a `LEGACY_PARTIES_DIR` without `active/`. A folder rather than attachments: the same reading serves `cutover-check`, nineteen files need no upload, and the files' member ids never go to Discord. `./pine cutover-check --legacy-parties <folder>` mounts that folder for the check alone and counts the list without deleting.
-- **Rehearsal mode** (`settings.rehearsal`: `allowlist` of member ids, `regions` by their channels' names as written, a leading `#` refused, and those no region channel of the server has named in the answer of `/admin setup-forums` (a failure to compare them is a line of that answer and a warning in the log), `staffRoles` by name; `src/services/rehearsal.ts`) runs the bot with a production token against a copy of the production database while the legacy bot is off for a short while, and nothing of it may reach members (spec 2, anti-goals). While it is set: `RehearsalDms` passes direct messages to the allowlist only (the others are dropped, and one line a minute says how many); `rehearsalGateway` wraps the party gateway so that a message goes only into the post of a party in a rehearsed forum, a post only into such a forum and a forum only beside a rehearsed region's channel (everything else is dropped and logged: the boss list's announcements and staleness warnings, the gym and Wayfarer announcements, the link to a new post in its region's channel, the copies in the remote and elite channels, spawn reports and their Unown copies, so also any announcement added later), no forum is made but a hidden one, no category or text channel is made (answered as a refused permission) and no channel is deleted but a forum made through it; the count of dropped direct messages is logged once more at shutdown, after the client is down (`RehearsalDms.flush`); the router answers only the allowlist and staff (Manage Server, Administrator or a role of `staffRoles`, a name compared trimmed and in any case, `staffRoleKey`, as the hidden forums compare it) and everybody else with `REHEARSAL_REFUSAL`; outside the posts of the rehearsed forums every answer is private (`answeredInRehearsal`: each reply, deferral and follow-up gets the Ephemeral flag), so that no channel shows a command's answer; `/request` is refused (`REQUEST_IN_REHEARSAL`: it would file a real GitHub issue); the screenshot trigger reads nothing (it reacts and answers in the channel; the testers use `/raid` with a screenshot); `/admin setup-forums` makes forums only for the rehearsed regions and hides them before anything is posted in them: a new forum is made hidden (`createForum` with `hidden`; a forum that cannot be made so is not made), one that is there gets its overwrites set as a whole (`PartyGateway.hideForum`, `hiddenForumOverwrites`: every overwrite it had, also those taken over from its category, replaced; View Channel and Send Messages denied to everyone, the bot allowed (and, on its own overwrite, every permission of a forum it has where Discord checks the set, but Manage Roles, which only an administrator may set in a channel and the bot keeps through its role: in the server for a new forum, whose creation may give only that, then in the category when `setupForum` hides the new forum once more; a forum Discord refuses to make hidden is said as `HIDDEN_FORUM_REFUSED`, which no other refusal is; a refusal of the second hide leaves the new forum hidden as it was made and set up all the same, with a warning in the log and a parenthesis in the answer that name what only the category would have given the bot (`categoryOnlyPermissions`); a forum that was there and whose hide is refused is set up the same way only when its own overwrites hide it already (`isHiddenForum`: View Channel denied to everyone, everyone's own server permissions counted, and allowed only to the bot (its member, or the role Discord made for it, `role.tags.botId`), the staff roles by the same rule and the allowlist), and its answer says "it was already hidden from members (Discord refused to set its permissions…)", without naming a cause; else it gets nothing posted: a refusal alone never counts as hidden, since production's forums are there too), the staff roles by name and every role that may manage the server allowed, and each allowlisted member with one permission more than an admission, so that `dismissMember` leaves it), and a forum that cannot be hidden gets nothing posted, its answer saying how to hide it by hand so that a second run accepts it: View Channel denied to @everyone, and allowed only to Professor Pine itself (its member or its own role), the staff roles (those `settings.rehearsal.staffRoles` names, and every role with Manage Server or Administrator) and the testers; the fake gateway computes who sees a forum from its overwrites and the members' roles (`src/ops/permissions.ts`); `/admin cleanup-legacy` only lists. `./pine deploy-commands --rehearsal` registers the commands as the commands of the servers of `Guild` that the bot is in (`GET /users/@me/guilds`; each named before anything is sent, those it is not in left out; a registration that fails is said and the others go on, `sendDeploy`), each command as it is (the staff commands with their Manage Server default); the admin restricts the application to staff and the testers under Server Settings > Integrations (@everyone off for the application as a whole) and adds a tester without Manage Server to `/admin`, `/gym` and `/region` one by one, since an allow for the application does not beat a command's default permission (staging 2026-10-16; runbook R1). It refuses `--global` / `--guild` while the mode is on; `--clear-guild` takes them away at the end (`deployPlan`, `src/discord/deploy.ts`). The start logs a warning, the heartbeat carries `rehearsal: true` and every health line (so `./pine status`) ends with "REHEARSAL MODE IS ON", and the owner gets an alert (`REHEARSAL_ALERT`) at a start (as every alert of a kind, not again within fifteen minutes: `minIntervalMs`). The web pages stay off (`servedSettings` drops `settings.web`, for the bot and for the commands `deploy-commands` registers; `configWarnings` says so): the rehearsal's `.env` sets no `COMPOSE_PROFILES=tunnel`. `/region` makes, renames, moves or deletes no channel (`REHEARSAL_CHANNELS`, `src/commands/regions/shared.ts`): an import that would create a channel, and a removal that would delete the forum, are refused with that sentence; outlines alone and a removal that keeps the forum go on. The Unown want a holder of the old role is given (`UnownWantService.noticed`) is still given to a member the rehearsal does not answer: it is written to the copy of the database only, which the night replaces with a fresh dump.
+- **Rehearsal mode** (`settings.rehearsal`: `allowlist` of member ids, `regions` by their channels' names as written, a leading `#` refused, and those no region channel of the server has named in the answer of `/admin setup-forums` (a failure to compare them is a line of that answer and a warning in the log), `staffRoles` by name; `src/services/rehearsal.ts`) runs the bot with a production token against a copy of the production database while the legacy bot is off for a short while, and nothing of it may reach members (spec 2, anti-goals). While it is set: `RehearsalDms` passes direct messages to the allowlist only (the others are dropped, and one line a minute says how many); `rehearsalGateway` wraps the party gateway so that a message goes only into the post of a party in a rehearsed forum or into meetup safety's moderators' channel (`RehearsalPostsOptions.moderationChannel`, the text channel `settings.channels.moderation` names: its requests and appeals reach the staff who rehearse; Matt, 2026-10-17; nothing else of the bot posts there), a post only into such a forum and a forum only beside a rehearsed region's channel (everything else is dropped and logged: the boss list's announcements and staleness warnings, the gym and Wayfarer announcements, the link to a new post in its region's channel, the copies in the remote and elite channels, spawn reports and their Unown copies, so also any announcement added later), no forum is made but a hidden one, no category or text channel is made (answered as a refused permission) and no channel is deleted but a forum made through it; the count of dropped direct messages is logged once more at shutdown, after the client is down (`RehearsalDms.flush`); the router answers only the allowlist and staff (Manage Server, Administrator or a role of `staffRoles`, a name compared trimmed and in any case, `staffRoleKey`, as the hidden forums compare it) and everybody else with `REHEARSAL_REFUSAL`; outside the posts of the rehearsed forums every answer is private (`answeredInRehearsal`: each reply, deferral and follow-up gets the Ephemeral flag), so that no channel shows a command's answer; `/request` is refused (`REQUEST_IN_REHEARSAL`: it would file a real GitHub issue); the screenshot trigger reads nothing (it reacts and answers in the channel; the testers use `/raid` with a screenshot); `/admin setup-forums` makes forums only for the rehearsed regions and hides them before anything is posted in them: a new forum is made hidden (`createForum` with `hidden`; a forum that cannot be made so is not made), one that is there gets its overwrites set as a whole (`PartyGateway.hideForum`, `hiddenForumOverwrites`: every overwrite it had, also those taken over from its category, replaced; View Channel and Send Messages denied to everyone, the bot allowed (and, on its own overwrite, every permission of a forum it has where Discord checks the set, but Manage Roles, which only an administrator may set in a channel and the bot keeps through its role: in the server for a new forum, whose creation may give only that, then in the category when `setupForum` hides the new forum once more; a forum Discord refuses to make hidden is said as `HIDDEN_FORUM_REFUSED`, which no other refusal is; a refusal of the second hide leaves the new forum hidden as it was made and set up all the same, with a warning in the log and a parenthesis in the answer that name what only the category would have given the bot (`categoryOnlyPermissions`); a forum that was there and whose hide is refused is set up the same way only when its own overwrites hide it already (`isHiddenForum`: View Channel denied to everyone, everyone's own server permissions counted, and allowed only to the bot (its member, or the role Discord made for it, `role.tags.botId`), the staff roles by the same rule and the allowlist), and its answer says "it was already hidden from members (Discord refused to set its permissions…)", without naming a cause; else it gets nothing posted: a refusal alone never counts as hidden, since production's forums are there too), the staff roles by name and every role that may manage the server allowed, and each allowlisted member with one permission more than an admission, so that `dismissMember` leaves it), and a forum that cannot be hidden gets nothing posted, its answer saying how to hide it by hand so that a second run accepts it: View Channel denied to @everyone, and allowed only to Professor Pine itself (its member or its own role), the staff roles (those `settings.rehearsal.staffRoles` names, and every role with Manage Server or Administrator) and the testers; the fake gateway computes who sees a forum from its overwrites and the members' roles (`src/ops/permissions.ts`); `/admin cleanup-legacy` only lists. `./pine deploy-commands --rehearsal` registers the commands as the commands of the servers of `Guild` that the bot is in (`GET /users/@me/guilds`; each named before anything is sent, those it is not in left out; a registration that fails is said and the others go on, `sendDeploy`), each command as it is (the staff commands with their Manage Server default); the admin restricts the application to staff and the testers under Server Settings > Integrations (@everyone off for the application as a whole) and adds a tester without Manage Server to `/admin`, `/gym` and `/region` one by one, since an allow for the application does not beat a command's default permission (staging 2026-10-16; runbook R1). It refuses `--global` / `--guild` while the mode is on; `--clear-guild` takes them away at the end (`deployPlan`, `src/discord/deploy.ts`). The start logs a warning, the heartbeat carries `rehearsal: true` and every health line (so `./pine status`) ends with "REHEARSAL MODE IS ON", and the owner gets an alert (`REHEARSAL_ALERT`) at a start (as every alert of a kind, not again within fifteen minutes: `minIntervalMs`). The web pages stay off (`servedSettings` drops `settings.web`, for the bot and for the commands `deploy-commands` registers; `configWarnings` says so): the rehearsal's `.env` sets no `COMPOSE_PROFILES=tunnel`. `/region` makes, renames, moves or deletes no channel (`REHEARSAL_CHANNELS`, `src/commands/regions/shared.ts`): an import that would create a channel, and a removal that would delete the forum, are refused with that sentence; outlines alone and a removal that keeps the forum go on. The Unown want a holder of the old role is given (`UnownWantService.noticed`) is still given to a member the rehearsal does not answer: it is written to the copy of the database only, which the night replaces with a fresh dump.
 
 ## Open items
 
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index 2b116cad..95bbf355 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -33,8 +33,8 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 - A timed party (a meetup or a train) has `party.timed` (`name`, `startTime`: one start for the whole party, not a group's meeting time) and changes through `ctx.timedParties` (`TimedPartyService`: `setName`, `setDescription`, `setStartTime`, `setEndTime`, `flush`) over the pure functions of `src/domain/party/timed.ts` (and `meetup.ts`). It is over at its end time; without one, a day after its start; without either, a day after it was made or its last time was removed (`latestTime(party, now)`, `settled`). The clock warns it `trainOrMeetupDeletionWarningTime` ahead, and an ended one is always shown as over. A new start is announced in the post gathered (one message a few seconds after the last change).
 - A meetup has one group and no completion: Done means leave (`finishParty`), `/group` and a group's meeting time are refused (`no-groups`, `party-wide-start`), its post has no Done and no Set time button, and its maker is always named.
-- A meetup's place (plan 8D, Matt, 2026-10-17) is `meetup.place` (`MeetupPlace`, `src/domain/geo/place.ts`: a `KnownPlace`, a gym, PokéStop or power spot as it was when it was named, a snapshot; or a `DroppedPin`, a point with the place `near` it within `PIN_NEAR_METRES` 50 and the `linkName` its maps link gave). It is set once, by `/meetup near:` when the meetup is made (`createMeetup`; `near` optional), and never changes afterwards (Matt, 2026-10-17): no command adds, changes or clears it, since a new public place would skip the moderators' check of plan 8S, and what more there is to say about where goes in the information (`/info`). `/location` is for raids alone. `near` is read by `namedPlace` (`src/commands/place-option.ts`, shared with `/wild near:`). The post shows the place as it is now while it is the same place (`shownPlace`: the gym by id from `MeetupPostView.gym`, the kept Wayspot from `MeetupPostView.wayspot`, of the same kind and within `PLACE_MOVE_METRES` 25 of the snapshot, so a rename, a new picture, address or a gym's notice show), else the snapshot; the stored place is never rewritten. A gym edit shows the meetups at it anew (`GymUpkeep.showAnew`), a load of the kept Wayspots those near a PokéStop or power spot (`PartyService` over `WayspotProvider.whenChanged`). Its Where, after the heading block and before "Meeting Information": a known place `Near **<title>** (<kind>) · <address> · [Map](…)` (the `NO_ADDRESS` rule of a raid's Where), a gym's notice under it, its picture beside; a pin `📍 Near **<title>** (<kind>)` (the nearest place within 50 m), else `📍 **<linkName>**`, else `📍 Dropped pin`, with its Map and no picture (`pinLine`, `src/render/place.ts`); nothing without a place. The DM brief has the first line of the Where without links or Map, and the place's point as its `map`; the DM of a start time names the place as the post shows it now (`PartyService.placeOf`, `meetupPlaceNow`).
-- A time typed for a timed party is read by `typedTimedTime` (`src/commands/parties/timed.ts`) over `resolvePartyTime`: never into the past, on the day of its start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`. Raids keep `typedPartyTime`.
+- A meetup's place (plan 8D, Matt, 2026-10-17) is `meetup.place` (`MeetupPlace`, `src/domain/geo/place.ts`: a `KnownPlace`, a gym, PokéStop or power spot as it was when it was named, a snapshot; or a `DroppedPin`, a point with the place `near` it within `PIN_NEAR_METRES` 50 and the `linkName` its maps link gave). It is set once, by `/meetup near:` when the meetup is made (`createMeetup`; `near` required since plan 8S-1, which also asks for the start and, in a form, the information, and holds a place that might be private for the moderators: `meetup-safety.md`; a meetup made before may have no place), and never changes afterwards (Matt, 2026-10-17): no command adds, changes or clears it, since a new public place would skip the moderators' check of plan 8S, and what more there is to say about where goes in the information (`/info`). `/location` is for raids alone. `near` is read by `namedPlace` (`src/commands/place-option.ts`, shared with `/wild near:`). The post shows the place as it is now while it is the same place (`shownPlace`: the gym by id from `MeetupPostView.gym`, the kept Wayspot from `MeetupPostView.wayspot`, of the same kind and within `PLACE_MOVE_METRES` 25 of the snapshot, so a rename, a new picture, address or a gym's notice show), else the snapshot; the stored place is never rewritten. A gym edit shows the meetups at it anew (`GymUpkeep.showAnew`), a load of the kept Wayspots those near a PokéStop or power spot (`PartyService` over `WayspotProvider.whenChanged`). Its Where, after the heading block and before "Meeting Information": a known place `Near **<title>** (<kind>) · <address> · [Map](…)` (the `NO_ADDRESS` rule of a raid's Where), a gym's notice under it, its picture beside; a pin `📍 Near **<title>** (<kind>)` (the nearest place within 50 m), else `📍 **<linkName>**`, else `📍 Dropped pin`, with its Map and no picture (`pinLine`, `src/render/place.ts`); nothing without a place. The DM brief has the first line of the Where without links or Map, and the place's point as its `map`; the DM of a start time names the place as the post shows it now (`PartyService.placeOf`, `meetupPlaceNow`).
+- A time typed for a timed party is read by `typedTimedTime` (`src/commands/parties/timed.ts`) over `resolvePartyTime` (for a meetup still to be made, `/meetup start:`, against `newMeetupTimes(now)`): never into the past, on the day of its start or end while that day has not passed, an hour from 1 to 6 without am or pm as the afternoon for a start, an end on the next day only within twelve hours of the start. A bare number is an hour; minutes need `in`. Raids keep `typedPartyTime`.
 
 ## How a post is rendered
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 44fe4752..c422adbd 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -32,6 +32,10 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Service tests use `partyServiceWith()` (`test/support/party-service.ts`: a service over the fake gateway, the invented regions and a clock, with `attendance`, `raids`, `scheduler` and `lines` over the same store); command tests pass `{ partyService, attendance, raids, parties, regions }` from it to `createTestContext`, whose own `partyService`, `attendance` and `raids` throw when used. `restarted(made)` gives new services over the same storage, gateway and clock, as after a restart; the fake gateway keeps `archived`, `locked` and `reopened` per post. A server with the two channels for copies is `gatewayWithMirrorChannels()` (pass it as `kept.gateway`; `REMOTE_CHANNEL`, `EX_CHANNEL`); without it, as in most tests, a raid has no copies. A test that needs renders to run by themselves passes `{ renderDelayMs: 0, sharedDelayMs: 0 }`. The fake interactions take `guildRoleNames`. On the fake gateway everybody sees every forum unless `gateway.shutOut(forumId, ...members)` says otherwise, or the forum has overwrites (`forumOverwrites`: given by a test, taken over from `categoryOverwrites` when a forum is made in that category, or set by `hideForum` / `createForum` with `hidden` through `hiddenForumOverwrites`): then `canSee` computes them as Discord does, with `serverRoles` and `memberRoles`; `noHiding` refuses the hiding of a forum (or of one made beside that region channel; `hideForum` then says whether the forum's overwrites hide it already, `isHiddenForum`) (`canSee`, `admitted`, `barred`, `leftServer`); `botPermissions` is what the bot has in the server (everything, an administrator, unless a test gives fewer), and with the bot's own overwrite of a category (`categoryOverwrites`, `FakePartyGateway.BOT_ID`) the fake computes what it has where a forum is made or hidden, as Discord does: a creation without Manage Channels there is refused, a new hidden forum's overwrites are set with the bot's permissions in the server and its second hide (`hideForum`) with those in the category, and a hiding is refused as Discord refuses a bot that is no administrator (no Manage Roles there, a permission it lacks there, Manage Roles in any overwrite); `unsettable` has Discord refuse such permissions in a set all the same (the second hide of a new forum refused); `partyServiceWith` also gives `access` (the access service over the same store) and `grants` (`MemoryAccessGrants`). `reportedRaid(report?, overrides?, kept?)` gives all of that with a raid reported through the service (`party`, `postId`, `current()`, `said()`); `userSettings` holds what differs from the default member settings. Lines go out only on `attendance.flush()`, post edits only on `service.flush()`.
 - Meetups in tests: `testMeetup()` (which takes `place`), `asRaid()`, `asMeetup()` (`test/support/parties.ts`) and `createdMeetup()` (`test/support/party-service.ts`, like `reportedRaid`, with `timed`; a meetup with a place passes `place`, and a directory of kept Wayspots as the override `wayspots`, `wayspotsWith`). A meetup's post shows its place as it is now from `MeetupPostView.gym` and `.wayspot`; a test of the renderer passes them to see a place as it is now, and leaves them out for the snapshot. The fake gateway refuses an embed that Discord would refuse (lengths, empty fields, 6,000 in all). `FakeDmGateway` and `RecordingDms` hold every DM to what Discord takes (`checkDm`: `FakePartyGateway.checkMessage`, and no pings), and the fake interactions refuse a reply, edit, follow-up or update that Discord would refuse as v2 (`checkComponents`: the same checks with the flag; components other than rows without it). A v2 message that is no post (a DM, a private list, a summary) is held to 40 components and `TEXT_BUDGET` by `expectV2Sendable` (`test/support/post-limits.ts`); a payload a handler sent with the flag is read as a message with `asV2(payload)` (`test/support/fake-interactions.ts`), a DM with `dmSentence`, `dmBrief`, `dmReasons`, `linksOf`, `dmSummary`, the menus of a message with `selectsOf` (`test/support/messages.ts`).
 
+## Meetup safety
+
+- `MeetupSafetyRepository` and `MemoryMeetupSafety` (`test/support/meetup-safety.ts`, `failing` per method) run the same cases (`meetupSafetyCases`, `test/support/meetup-safety-cases.ts`, with `LIBRARY`, `SAFETY_PIN`, `newRequest`, `newAppeal`, `MOD`). The service and the controls are tested over `meetupSafetyWith(options)` (`test/support/meetup-safety-service.ts`; `meetup-safety.md`); `createTestContext`'s own `meetupSafety` is off.
+
 ## The party history
 
 - `partyServiceWith()` records every party that ends into `history` (`MemoryHistory`, `test/support/history.ts`: `records`, `steps`, `posts`, `optIn(guildRow, member)`, `failing`; it shares the memory storage's rows and deletes a recorded party's, as the repository does, so a test of an ended party reads `history.records`, not `storage.rows`), through `recorder` (`PartyHistory`, whose tries of what failed run only on `recorder.flush()`; over a database, `kept.historyStorage` takes them); `MemoryPartyStorage` writes each write's note into it as `PartyRepository` does. A `PartyRepository` in a test that expects no failure of the history takes `HISTORY_MUST_NOT_FAIL`. The recorder's `sweep()` reads the memory storage's rows (`storage.unreadable` names rows that read back unreadable) and runs with the scheduler's upkeep; `historySweepProgressEvery` sets how often it says how far it got. `MemoryHistoryOptIns` is `ctx.historyOptIns` for `/settings history` (`named(member, server, n)` says in how many parties opting out takes them out of). The legacy import's db test reads the invented folder `test/fixtures/legacy-parties/`; the queries of `history.md` are run from the doc by `history-queries.db.test.ts`.
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index c31566f8..e7e14fe2 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -126,6 +126,7 @@ Read what it prints, especially:
 - **"New settings at their defaults"**: settings the legacy bot did not have. The **`timezone`** is among them, and its default is `America/New_York`. Change it in `pine-settings.json` to yours (an IANA name such as `Europe/London` or `America/Chicago`): every time members type is read in it.
 - **"Off, because the legacy file lacks them"**: switches the legacy bot read as off. They stay off.
 - The **channel names** under `channels` (the bot lab, the moderators' channel, Unown sightings, the elite and remote raid channels, the PvP channel, bot updates) must be the names your server uses. `cutover-check` (4.7) tells you which it cannot find.
+- **Meetup safety** is new and off until you add `"moderation": "<channel>"` under `channels`: a staff-only channel (never bot updates) where meetups at a pin, or at a place whose name sounds private, wait for a moderator's approval, and blocked members' appeals arrive. Add it now or after the move; `cutover-check` warns while it is missing. During a rehearsal its posts go through (the testing staff see them); nothing else of the bot is posted there. `"meetupSafety": { "flaggedWords": [...] }` adds words to the names held for a moderator.
 
 ### 4.4 Fill in `.env`
 
@@ -224,6 +225,7 @@ It reads the database and, with the bot's token, Discord's API (reading only; it
 - **forums**: every region without a forum warns. That is expected: step 4.9 makes them.
 - **names**: channels, a category or a role the settings name that your server does not have. Fix `pine-settings.json` or the server.
 - **announcements**: whether the bot may post in the channels it announces in (bot updates, the moderators' channel, Unown sightings, the elite and remote raid channels).
+- **moderation**: meetup safety's channel: a warning while `channels.moderation` is not set (the safety is off), when the server has no such text channel, when the bot may not see it, send or embed links there, or when everyone can see it (make it staff-only).
 - **restrictions**: rows of the legacy `!require-role` restrictions. The new bot does not use them; `./pine role-auth-export` lists them as the new commands, and an admin sets the same under Server Settings → Integrations → Professor Pine.
 - **roles**: self-assigned roles at or above the bot's highest role, which the bot cannot give. Move the bot's role above them.
 - **cleanup**: how many legacy channels `/admin cleanup-legacy` would delete, and which it would leave to a person.
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index d7485e98..922268e6 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -114,6 +114,7 @@ The settings that matter first:
 
 - `timezone`: yours, as an IANA name (`America/Chicago`, `Europe/London`). Every time members type is read in it. The file comes with `America/New_York`.
 - `channels`: the names of channels the bot uses in your server: `bot-lab` (where members try commands), `mod-bot-lab` (the moderators'), `unown` (Unown sightings), `elite-gym-raids` and `remote-raids` (copies of elite and remote raids), `pvp`, `bot-updates` (announcements). Make the channels or change the names.
+- Meetup safety (optional, and off until you set it): a meetup at a place that might be private (a pin from a maps link, or a gym, PokéStop or power spot whose name sounds like a front yard: a little free library, apartments) is held for a moderator, and posted only when one approves it. Make a text channel that only your staff can see (never the public bot updates channel), where the bot may view, send messages and embed links, and name it in `channels`, for example `"moderation": "meetup-review"` (the example settings have it blank, which is unset). The requests and the appeals of blocked members go there, with buttons for admins and moderators. Without it every meetup is posted at once, and the bot's log warns of it at every start. To hold more names for a moderator, add `"meetupSafety": { "flaggedWords": ["duplex", "cottage"] }` (whole words, any letter case).
 - `categories.pvp`: the category of your PvP channels: `/rank` and its short forms work only there and in a direct message with the bot.
 - `features`: `exGymChannel` and `remoteRaidChannel` (whether raids are copied into those channels), `notifications` (direct messages for wants and gym targets), `roles` (self-assigned roles with `/iam`).
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
diff --git a/docs/superpowers/plans/2026-10-17-phase-8s1-staging.md b/docs/superpowers/plans/2026-10-17-phase-8s1-staging.md
new file mode 100644
index 00000000..1949fb9b
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8s1-staging.md
@@ -0,0 +1,57 @@
+# Phase 8S-1 staging checklist: meetup safety (draft)
+
+Every step with Matt's go-ahead. Matt starts the bot; Claude drives Discord in its own tab. Three accounts are needed: a member without staff roles (the maker), a moderator (Admin or Moderator role), and a second member without staff roles who is given View Channel on the moderators' channel by a member overwrite (for step 13: a non-staff member who can see the buttons). The design is `docs/superpowers/specs/2026-10-17-meetup-safety-design.md`; the conventions `docs/architecture/meetup-safety.md`.
+
+## Before
+
+1. Migration 019 (`MeetupRequest`, `MeetupPlaceRuling`, `MeetupBlock`, `MeetupAppeal`) runs at the start, additive only; the dev database is at 018 before it (check `kysely_migration`). The plan renumbers it at the merge if another branch took 019 first (8M-4S): check the number in `kysely_migration` against the file's name.
+2. `/meetup` has new required options `near` and `start`: register the commands again, only on Matt's go-ahead (`npm run deploy-commands -- --global`). A client may need Ctrl+R.
+
+## With the safety off
+
+3. Start without `channels.moderation` (blank or absent): the log warns once per server that meetup safety is off.
+4. As the maker, a pin (`near:` coordinates, start in three hours): posted at once, no form step skipped (the form still asks for the information).
+
+## Turning it on
+
+5. Make a text channel `meetup-review` on the test server that only staff can see (deny View Channel to @everyone; allow it to the staff roles and to Professor Pine), add `"moderation": "meetup-review"` under `channels` in the settings, and restart: no warning for the test server.
+6. Start warnings: rename the channel (or set the setting to a name the server lacks) and restart: one warning that the server has no text channel of that name. Then deny the bot Send Messages there and restart: one warning that the bot cannot post in it. Put both back.
+
+## /meetup
+
+7. As the maker: `/meetup name:Picnic near:<a park PokéStop> start:<in three hours>`: a form "About this meetup" asks for the information (required). Send it: the meetup is posted at once with its start and information, the answer links to the post, and the post shows no line about a new start. Send the form once with nothing but spaces in it (Discord may refuse an empty field itself): "Say what there is to know about the meetup…".
+8. `start:` that cannot be read, one in the past, `none`: refused before the form, and none of them counts against the two meetups a quarter of an hour.
+9. The help (`/help meetup`) names `near`, `start`, the form and the moderator's approval.
+
+## Requests
+
+10. As the maker, a pin: the form, then "Your meetup needs a moderator's approval…"; nothing in the forum or the region channel. In `#meetup-review`: "Meetup waiting for approval" with the name, the start, the maker named (open their profile from it), the region, Where (📍 line with Map), the information, when it expires, and Approve once, Refuse, Block member (no Approve, no Refuse from now on).
+11. As the maker, a PokéStop whose title has "Little Free Library" (or a word added under `meetupSafety.flaggedWords`): the same, with the stop's picture beside Where and five buttons. A gym whose official name has a flagged word but whose nickname does not: held too.
+12. As the moderator: `/meetup` at a pin is posted at once. A start less than two hours ahead at a pin, as the maker: refused before the form, asking for two hours.
+
+## Decisions
+
+13. As the second member (non-staff, with View on `#meetup-review`), press Approve on a post: "Only admins and moderators can do that." privately.
+14. As the moderator, Approve on step 11's request: the private answer links to the post; the post is made as the maker asked (they are signed up as interested, "Created by" them); the moderators' post shows "Approved by …" without buttons; the maker gets a DM with Go to post naming the meetup. `/meetup` at the same stop by the maker is now posted at once.
+15. Approve once on step 10's pin: posted; another `/meetup` at the same coordinates is held again.
+16. Refuse and Refuse from now on on two new requests: the maker's DMs say it was not approved (never why); a later `/meetup` at the refused stop answers "A meetup can't be held there." before the form.
+17. Press a decided post's old button from a second client (or two moderators at once): "… decided this already …".
+18. Restart the bot with a request pending: its buttons still work.
+19. A request at a pin with a start three hours ahead: about two hours later (an hour before the start) the post turns "Expired" and the maker gets a DM; a press on it says "This request has expired: nobody decided in time."
+
+## Blocks and appeals
+
+20. With the maker owning an active meetup and one more pending request: Block member on a request. The other request's post turns "Refused … its maker was blocked", the meetup's post says "This meetup was closed by the moderators." and is archived, and the maker gets one DM about the block, naming the server. Block member on a second request of theirs: no second DM.
+21. Block while the form is open: the maker runs `/meetup` (allowed place), a moderator blocks them over another request before they send the form; on sending: "You can't create meetups on this server." with Appeal.
+22. As the maker, `/meetup` anything: "You can't create meetups on this server." with Appeal. Press it: the form "Why should the block be lifted?". Send: the appeal is in `#meetup-review` with who blocked them and when, Lift block and Keep block. Press Appeal again: the appeal is with the moderators already.
+23. Keep block: the post says when they may appeal again (a relative time); the maker's DM names the server and says when; Appeal now says the same.
+24. In the database, set that appeal's `decidedAt` back eight days (or block a second test member), appeal again and Lift block: the post shows "Lifted by …" and still says who blocked them and when; the maker's DM names the server and says they can create meetups there again, and `/meetup` works.
+25. Delete an open appeal's post by hand, and in the database set its `createdAt` back eight days: within a minute the sweep closes it (the maker gets a DM that they may appeal again), and Appeal opens the form again.
+
+## Rehearsal mode
+
+26. In rehearsal mode (Matt, 2026-10-17: the moderators' posts go through to the staff-only channel): a request and an appeal reach `#meetup-review`; nothing else of the bot is posted outside the posts of rehearsed parties (the region channel gets no link to a new post).
+
+## Cutover check
+
+27. `npm run cutover:check` (only on Matt's go-ahead): a `moderation` PASS line with the channel; without the setting a WARN that meetup safety is off; with a channel the bot may not post in, a WARN naming the permissions (View Channel, Send Messages, Embed Links); with the channel visible to @everyone, a WARN to make it staff-only; an announcement channel of that name counts as none.
diff --git a/src/app.ts b/src/app.ts
index b4e38fe7..f5860363 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -725,6 +725,8 @@ export async function startApp(
         void syncGuilds(guilds, [...ready.guilds.cache.keys()], log);
         botServers = () => [...ready.guilds.cache.keys()];
         bossAnnouncer.ready();
+        // Where meetup safety cannot work: once per server, in the log of the start.
+        meetupSafety.warnAtStart([...ready.guilds.cache.keys()]);
         // Before the first posts are shown; `refresh` logs what fails and never throws.
         void appEmoji.refresh();
         markConnected();
diff --git a/src/ops/cutover-check.test.ts b/src/ops/cutover-check.test.ts
index b56f522e..aa6ff21d 100644
--- a/src/ops/cutover-check.test.ts
+++ b/src/ops/cutover-check.test.ts
@@ -75,6 +75,7 @@ const NAMED_CHANNELS = [
   'remote-raids',
   'rank-checker',
   'bot-updates',
+  'meetup-review',
 ];
 
 interface Server {
@@ -96,6 +97,14 @@ function server(api: FakeDiscordApi, store: MemoryCutoverStore): Server {
   const north = api.addChannel(guild, 'north', { parentId: category.id });
   const south = api.addChannel(guild, 'south', { parentId: category.id });
   for (const name of NAMED_CHANNELS) api.addChannel(guild, name);
+  // The moderators' channel of meetup safety is seen by staff (and the bot) alone.
+  const review = guild.channels.find((one) => one.name === 'meetup-review');
+  if (review) {
+    review.overwrites = [
+      overwrite(guild.id, [], [P.ViewChannel]),
+      overwrite(botRole, [P.ViewChannel]),
+    ];
+  }
   api.addChannel(guild, 'PVP CHAT AND TOURNAMENTS', { type: ChannelType.GuildCategory });
   api.addRole(guild, 'unown');
   api.emoji = [...GAME_ICON_NAMES];
@@ -116,7 +125,9 @@ describe('cutoverCheck', () => {
   beforeEach(() => {
     api = new FakeDiscordApi();
     store = new MemoryCutoverStore();
-    settings = loadSettings(TEST_SETTINGS_PATH);
+    // The test settings have no moderators' channel: a server set up right has one.
+    const loaded = loadSettings(TEST_SETTINGS_PATH);
+    settings = { ...loaded, channels: { ...loaded.channels, moderation: 'meetup-review' } };
     shape = server(api, store);
   });
 
@@ -242,6 +253,86 @@ describe('cutoverCheck', () => {
     });
   });
 
+  describe('meetup safety', () => {
+    it("passes a moderators' channel the bot may post in", async () => {
+      expect(line(await check(), 'moderation')).toEqual({
+        what: 'moderation',
+        status: 'pass',
+        text: 'moderation: in Pittsburgh meetups that need approval go to #meetup-review',
+      });
+    });
+
+    it('warns that meetup safety is off without the setting', async () => {
+      const { moderation: _unset, ...channels } = settings.channels;
+      settings = { ...settings, channels };
+      expect(line(await check(), 'moderation')).toEqual({
+        what: 'moderation',
+        status: 'warn',
+        text:
+          'moderation: settings.channels.moderation is not set, so meetup safety is off: ' +
+          'every meetup is posted at once, wherever it is',
+      });
+    });
+
+    it("warns of a moderators' channel the server lacks, or where the bot may not post", async () => {
+      settings = { ...settings, channels: { ...settings.channels, moderation: 'mods-only' } };
+      expect(line(await check(), 'moderation')).toMatchObject({
+        status: 'warn',
+        text:
+          'moderation: Pittsburgh has no channel #mods-only: a meetup that needs approval ' +
+          'cannot be made there',
+      });
+      settings = { ...settings, channels: { ...settings.channels, moderation: 'meetup-review' } };
+      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
+      if (review) {
+        review.overwrites = [
+          overwrite(shape.guild.id, [], [P.ViewChannel]),
+          overwrite(shape.botRole, [P.ViewChannel], [P.SendMessages, P.EmbedLinks]),
+        ];
+      }
+      expect(line(await check(), 'moderation')).toMatchObject({
+        status: 'warn',
+        text:
+          'moderation: in Pittsburgh the bot lacks Send Messages, Embed Links in #meetup-review: ' +
+          'a meetup that needs approval cannot be made there',
+      });
+    });
+
+    it("needs no more than to see, send and embed in the moderators' channel", async () => {
+      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
+      if (review) {
+        review.overwrites = [
+          overwrite(shape.guild.id, [], [P.ViewChannel]),
+          overwrite(shape.botRole, [P.ViewChannel], [P.AttachFiles]),
+        ];
+      }
+      expect(line(await check(), 'moderation')).toMatchObject({ status: 'pass' });
+    });
+
+    it("takes a text channel alone as the moderators' channel", async () => {
+      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
+      if (review) review.type = ChannelType.GuildAnnouncement;
+      expect(line(await check(), 'moderation')).toMatchObject({
+        status: 'warn',
+        text:
+          'moderation: Pittsburgh has no channel #meetup-review: a meetup that needs approval ' +
+          'cannot be made there',
+      });
+    });
+
+    it("warns of a moderators' channel everybody can see", async () => {
+      const review = shape.guild.channels.find((one) => one.name === 'meetup-review');
+      if (review) review.overwrites = [];
+      expect(line(await check(), 'moderation')).toEqual({
+        what: 'moderation',
+        status: 'warn',
+        text:
+          'moderation: in Pittsburgh everyone can see #meetup-review: its posts name members ' +
+          'and where they meet; make it staff-only',
+      });
+    });
+  });
+
   describe('the global commands', () => {
     it('warns in rehearsal mode of commands every member would see', async () => {
       api.globalCommands = ['raid', 'help'];
diff --git a/src/ops/cutover-check.ts b/src/ops/cutover-check.ts
index 43f8ca09..44a4e5ee 100644
--- a/src/ops/cutover-check.ts
+++ b/src/ops/cutover-check.ts
@@ -1,4 +1,4 @@
-import { ApplicationFlags, ChannelType, Routes } from 'discord.js';
+import { ApplicationFlags, ChannelType, PermissionFlagsBits, Routes } from 'discord.js';
 import { channelNamesOf, type Settings } from '../config/settings.js';
 import type { MigrationPlan } from '../db/migrator.js';
 import type { CutoverRegion, CutoverSelfRole } from '../db/repositories/cutover-repository.js';
@@ -11,6 +11,7 @@ import {
   basePermissions,
   channelPermissions,
   ANNOUNCE_NEEDS,
+  MODERATION_NEEDS,
   FORUM_NEEDS,
   HIDDEN_FORUM_NEEDS,
   missingNeeds,
@@ -62,6 +63,7 @@ export interface CheckLine {
     | 'restrictions'
     | 'cleanup'
     | 'announcements'
+    | 'moderation'
     | 'roles'
     | 'discord';
   status: CheckStatus;
@@ -325,6 +327,18 @@ async function serverLines(
 
   lines.push(namesLine(guild.name, channels, guild.roles, settings));
   lines.push(announceLine(guild.name, channels, settings, permissionsIn));
+  // What everyone (the server's everyone role) may do in a channel, for a staff-only one.
+  const everyoneBase = BigInt(guild.roles.find((role) => role.id === guild.id)?.permissions ?? '0');
+  const everyoneSees = (channel: ApiChannel): boolean =>
+    (channelPermissions(
+      everyoneBase,
+      guild.id,
+      { id: '', roleIds: [] },
+      channel.permission_overwrites ?? [],
+    ) &
+      PermissionFlagsBits.ViewChannel) !==
+    0n;
+  lines.push(moderationLine(guild.name, channels, settings, permissionsIn, everyoneSees));
   const rolesCheck = rolesLine(guild.name, guild.roles, member.roles, selfRoles);
   if (rolesCheck) lines.push(rolesCheck);
   return { lines, withoutForum };
@@ -372,6 +386,62 @@ function announceLine(
       };
 }
 
+/**
+ * Meetup safety (plan 8S-1): whether the moderators' channel is set, the server has it (a text
+ * channel, as the bot finds it), the bot may post in it (`MODERATION_NEEDS`) and it is
+ * staff-only (not seen by everyone). A warning, never a failure: without it every meetup is
+ * posted at once, as before.
+ */
+function moderationLine(
+  server: string,
+  channels: readonly ApiChannel[],
+  settings: Settings,
+  permissionsIn: (channel: ApiChannel) => bigint,
+  everyoneSees: (channel: ApiChannel) => boolean,
+): CheckLine {
+  const name = settings.channels.moderation;
+  if (name === undefined) {
+    return {
+      what: 'moderation',
+      status: 'warn',
+      text:
+        'moderation: settings.channels.moderation is not set, so meetup safety is off: every ' +
+        'meetup is posted at once, wherever it is',
+    };
+  }
+  const channel = channels.find((one) => one.name === name && one.type === ChannelType.GuildText);
+  const cannot = 'a meetup that needs approval cannot be made there';
+  if (!channel) {
+    return {
+      what: 'moderation',
+      status: 'warn',
+      text: `moderation: ${server} has no channel #${name}: ${cannot}`,
+    };
+  }
+  const missing = missingNeeds(permissionsIn(channel), MODERATION_NEEDS).required;
+  if (missing.length > 0) {
+    return {
+      what: 'moderation',
+      status: 'warn',
+      text: `moderation: in ${server} the bot lacks ${needNames(missing)} in #${name}: ${cannot}`,
+    };
+  }
+  if (everyoneSees(channel)) {
+    return {
+      what: 'moderation',
+      status: 'warn',
+      text:
+        `moderation: in ${server} everyone can see #${name}: its posts name members and where ` +
+        'they meet; make it staff-only',
+    };
+  }
+  return {
+    what: 'moderation',
+    status: 'pass',
+    text: `moderation: in ${server} meetups that need approval go to #${name}`,
+  };
+}
+
 /** A role's name as the bot compares it (`unown-want-service.ts`): trimmed, lower case. */
 const roleKey = (name: string) => name.trim().toLowerCase();
 
diff --git a/src/ops/permissions.ts b/src/ops/permissions.ts
index bcf7be52..649479ec 100644
--- a/src/ops/permissions.ts
+++ b/src/ops/permissions.ts
@@ -157,6 +157,12 @@ export const REGION_CHANNEL_NEEDS: readonly Need[] = [
  */
 export const ANNOUNCE_NEEDS: readonly Need[] = [VIEW, SEND, EMBED, ATTACH];
 
+/**
+ * What it needs in the moderators' channel of meetup safety (`settings.channels.moderation`,
+ * plan 8S-1): its posts of requests and appeals, with their buttons and the Wayspot's picture.
+ */
+export const MODERATION_NEEDS: readonly Need[] = [VIEW, SEND, EMBED];
+
 /**
  * What it needs in a region's forum, and in the category the forum is made in (a new forum
  * takes the category's overwrites): posts, their messages, archiving them, who may see them.
diff --git a/src/services/meetup-safety.test.ts b/src/services/meetup-safety.test.ts
index 07444e0d..a57fb529 100644
--- a/src/services/meetup-safety.test.ts
+++ b/src/services/meetup-safety.test.ts
@@ -429,3 +429,40 @@ describe('MeetupSafety.expire', () => {
     expect(await made.storage.ruling(SERVER, { kind: 'stop', id: LIBRARY.id })).toBeUndefined();
   });
 });
+
+describe('MeetupSafety.warnAtStart', () => {
+  it('says once per server that meetup safety is off without the setting', async () => {
+    const made = await meetupSafetyWith({ moderation: null });
+    made.safety.warnAtStart([SERVER, OTHER_SERVER]);
+    const warned = made.entries.filter((entry) => entry.level === 40);
+    expect(warned.map((entry) => [entry.msg, entry.server])).toEqual([
+      ['meetup safety is off: settings.channels.moderation is not set', SERVER],
+      ['meetup safety is off: settings.channels.moderation is not set', OTHER_SERVER],
+    ]);
+  });
+
+  it('says so of a server whose moderators’ channel the bot cannot post in', async () => {
+    const made = await meetupSafetyWith();
+    made.gateway.noEmbeds.add(MOD_CHANNEL);
+    made.safety.warnAtStart([SERVER]);
+    const warned = made.entries.filter((entry) => entry.level === 40);
+    expect(warned.map((entry) => [entry.msg, entry.server])).toEqual([
+      [
+        `the bot cannot post in #${MODERATION} (View Channel, Send Messages, Embed Links): meetups that need a moderator's approval cannot be made there`,
+        SERVER,
+      ],
+    ]);
+  });
+
+  it('says so of a server that has no such channel, and nothing of one that has it', async () => {
+    const made = await meetupSafetyWith();
+    made.safety.warnAtStart([SERVER, OTHER_SERVER]);
+    const warned = made.entries.filter((entry) => entry.level === 40);
+    expect(warned.map((entry) => [entry.msg, entry.server])).toEqual([
+      [
+        `the server has no text channel #${MODERATION}: meetups that need a moderator's approval cannot be made there`,
+        OTHER_SERVER,
+      ],
+    ]);
+  });
+});
diff --git a/src/services/meetup-safety.ts b/src/services/meetup-safety.ts
index fd90833f..78da6620 100644
--- a/src/services/meetup-safety.ts
+++ b/src/services/meetup-safety.ts
@@ -79,7 +79,13 @@ export interface MeetupSafetyOptions {
   storage: MeetupSafetyStore;
   gateway: Pick<
     PartyGateway,
-    'guildName' | 'findChannel' | 'sendMessage' | 'editMessage' | 'deleteMessage'
+    | 'guildName'
+    | 'findChannel'
+    | 'sendMessage'
+    | 'editMessage'
+    | 'deleteMessage'
+    | 'serverChannels'
+    | 'mayPost'
   >;
   /** Where an approved meetup is made, and a blocked member's meetups are closed. */
   parties: Pick<PartyService, 'createMeetup' | 'end'>;
@@ -123,6 +129,47 @@ export class MeetupSafety {
     return this.options.settings.channels.moderation;
   }
 
+  /**
+   * Says at the start, once per server the bot is in, where meetup safety cannot work: off
+   * without the setting, a server without a text channel of that name, or one where the bot may
+   * not post in it (`mayPost`: View Channel, Send Messages, Embed Links). Meetups that need a
+   * moderator's approval cannot be made there; a channel made or fixed later is found then.
+   * Never throws.
+   */
+  warnAtStart(guildIds: readonly string[]): void {
+    const { gateway, log } = this.options;
+    const name = this.channelName;
+    for (const server of guildIds) {
+      if (name === undefined) {
+        log.warn({ server }, 'meetup safety is off: settings.channels.moderation is not set');
+        continue;
+      }
+      let found: string | undefined;
+      let mayPost: boolean;
+      try {
+        found = gateway
+          .serverChannels(server)
+          ?.find((channel) => channel.kind === 'text' && channel.name === name)?.id;
+        mayPost = found !== undefined && gateway.mayPost(found);
+      } catch (err) {
+        // Only a warning was to be said: it never stands in the way of the start.
+        log.warn({ err, server }, "could not look for the moderators' channel");
+        continue;
+      }
+      if (found === undefined) {
+        log.warn(
+          { server, channel: name },
+          `the server has no text channel #${name}: meetups that need a moderator's approval cannot be made there`,
+        );
+      } else if (!mayPost) {
+        log.warn(
+          { server, channel: name },
+          `the bot cannot post in #${name} (View Channel, Send Messages, Embed Links): meetups that need a moderator's approval cannot be made there`,
+        );
+      }
+    }
+  }
+
   /**
    * Whether a meetup at `place` may be posted at once, needs a moderator's approval, may not be
    * held there or may not be made by this member (`meetupPlaceVerdict`), with the server's
````

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8s1 HEAD -- . ':!docs/superpowers/gantt-data.js' ':!docs/superpowers/plans/2026-10-17-phase-8s1-meetup-safety.md'` prints nothing. Then `npm run check`, `npm run build` and `npm run test:db`, one after the other through the npm scripts.
2. Whole-branch review (Opus, high effort); one more fix wave if it finds something.
3. Bring these up to date: the `CLAUDE.md` status line and area index (`meetup-safety.md`), the follow-ups ("From Phase 8S-1"), the Gantt chart and memory.
4. Tell the other sessions that 8S-1 is merged: the web map (8M-5M builds on `ctx.meetupSafety`) and the train split (8T numbers its migration after 019).

## Staging checklist

`docs/superpowers/plans/2026-10-17-phase-8s1-staging.md` (task 6): on the dev application and the test server, each step with Matt's go-ahead. It starts with migration 019 on the dev database and registering the commands again (`npm run deploy-commands -- --global`).
