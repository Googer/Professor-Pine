# Phase 7B: Screenshots on Discord: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members report raids from screenshots (`/raid screenshot:`, a message that mentions the bot with up to ten screenshots, and passively where a server allows it), look at what Pine read (`/read-screenshot`, the "Screenshot feedback" button) and say when it is wrong; what goes wrong is kept for review, and a later Claude session improves the reader from it with `npm run ocr:review` and `npm run ocr:check`.

**Architecture:** The second of Phase 7's two plans; 7A built the reader (`OcrService`, `screenshotReport`). `ScreenshotService` (`ctx.screenshots`) downloads an attachment, has it read, makes the report, applies what the member typed, decides (`decide`: refuse only a screen that is no raid or has no gym, ask only which gym when it is not clear, otherwise report with what is known) and keeps the screenshot (`ScreenshotStore`, `var/ocr/held/` and `var/ocr/review/`, within a byte budget). `/raid`, the mention trigger (`ScreenshotTrigger`) and `/read-screenshot` are its users; a raid remembers its screenshot (state document version 8: `raid.screenshot { id, timeUncertain }`) for the post's "Screenshot feedback" button and the line that says its time is a guess. Egg posts show the game's egg. `/gym duplicates` and a warning on gym changes help staff give same-named gyms nicknames, which is what the gym question shows.

**Tech Stack:** TypeScript 6.0, discord.js 14.27 (a modal with a select menu: `LabelBuilder`), Vitest. No new dependency, no migration; the command definitions change (`/raid`'s options, `/read-screenshot`, `/gym duplicates`): `npm run deploy-commands -- --global` before staging.

**Spec:** `docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md` (its sections on how the reader runs, screenshots for review and feedback, the improvement cycle, the egg pictures), section 6.5 of `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md` where the research does not differ, and "Phase 7" and "From Phase 7A" of `docs/superpowers/plans/phase-0-follow-ups.md`. The design brief with every ruling and Matt's decisions is `.superpowers/sdd/2026-10-14-phase-7b-screenshots-on-discord/design.md`; the prototype's reviews and rulings are `proto-review.md` beside it.

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-7b`), one commit per task, each commit typechecked with its own tests green, and the full check and build clean on the tip (4,970 unit tests). Two Opus reviewers went through that branch (the Discord flows; data, domain and files), a third through the fixes; what they found and what Matt decided during the review is already in the code below. On the 28 sample screenshots (`var/ocr-research/samples-cropped`, git-ignored) the tip scores exactly as 7A did: clock, countdown, egg or hatched, heads and shadow 28/28, CP 9/9, the gym's raw text 25/28.

## Decisions in this plan (Matt, 2026-10-14)

1. **When a raid is made unasked.** Refused only when the screen is not a raid screen or no gym was found; the member is asked only which gym, when the gym is not clear (several gyms fit, also gyms of one name: the menu tells them apart by nickname, region and description; a clear gym in another region than the channel's is asked too); otherwise the raid is reported with what is known, as the legacy bot did: a hatched raid whose boss is not decided is reported hatched without a boss; an egg whose hatch has passed is reported hatched (its end from the tier's and the events' length, its boss as a hatch sets it); a hatched raid whose end has passed is refused (`raid-over`); a stage that cannot be told is an egg without a time. Typed values of `/raid` replace what was read.
2. **The time of a screenshot**, in this order: the Android file name (`Screenshot_20261014-132301…`, the shapes in `file-time.ts`), the phone's clock read off the screenshot, the upload minus `screenshotMessageOffsetTime`. A file name older than a raid can be marks the screenshot stale; when the file name and a clock disagree by more than two minutes the clock wins only when it was read with confidence (`CLOCK_SURE` 0.6; the samples' clocks read 0.74–0.98), and the time is uncertain. An uncertain time (guessed, stale, sources that differ) is used and the post says so until somebody sets it with `/hatch`, `/end` or "Set time" (`/duration` does not confirm it).
3. **The triggers.** `/raid` has an optional `screenshot` (and `boss`, `gym` become optional: without a screenshot both are still needed). A message in a region channel that mentions the bot is read, every image of it (up to Discord's ten), one after the other, each its own report and one use of the member's throttle (20 per 15 minutes); the message is deleted only when every image made or joined a raid and it says nothing but the mention. A gym question in the channel can be answered by its author alone and lasts two minutes. Passive reading (every image in a region channel) needs `ocr.passive` and the Message Content intent, which production does not have; a small server may switch it on, and passive reads are silent unless a raid is made.
4. **Feedback and review.** `/read-screenshot` shows what was read, raw and as Pine understood it; "Screenshot feedback" on the post of a raid made from a screenshot (and on the reporter's answer) shows the same privately, with the screenshot itself attached. "All right" / "Something is wrong" (a form: which elements, what they should be) is recorded with the member's id (records are for staff and development only). Screenshots are kept in `var/ocr/`: a raid's until a day after it ended, `/read-screenshot`'s a day, anything with a doubt, a question, a refusal or feedback in `review/` for `ocr.reviewDays` (30); within `ocr.keepMegabytes` (4096), the screenshots without issues going first; a picture that is no raid screen keeps its record only.
5. **Egg pictures** by URL from pogo_assets at the commit the tier head is pinned to: T1, T3, T5, mega, mega legendary, primal (when every current mega legendary boss is a primal), elite, the wormhole for a T5 egg whose current bosses are all ultra beasts; shadow eggs show the plain egg; super mega has none.
6. **Gyms of one name** (shown name compared by letters and digits only): `/gym duplicates` lists them per region; `/gym add`, `edit` and `move` warn (never refuse) when they make such a pair.
7. **Improving the reader** is done by a later Claude session from a copy of the production review folder: `npm run ocr:review` (triage), `npm run ocr:check` over every sample with `--baseline`, the skill `.claude/skills/improve-screenshot-reading/`, the log `docs/superpowers/ocr-improvements.md`. Pine never changes its own rules.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure. **Tests never use the network**, the real models or a member's screenshot: images are drawn by the tests, the reader is `FakeScreenshotReader` or the fake worker.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-7b`). Apply it exactly; `git diff <that commit> -- src test scripts docs .claude package.json CLAUDE.md` must print nothing before the task is committed.
- A task needs the typecheck and its own tests green; the full `npm run check` and the build after the last task (one after the other, never two at once). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.
- Nothing a member sent (texts, images, file names) is logged; only times, sizes, counts, reasons and ids of records.

## Review Focus

1. A member's message cannot flood a channel or the disk: ten images that are no raid screens, a busy or missing reader, a 32 MB image, many members at once (one reply per message for refusals, the byte budget, the review cap per server and day).
2. A screenshot never makes a raid in the wrong place without the member's say: a gym of another region, gyms of one name, a typed gym with several hits.
3. Every interaction is answered once, within its token's 15 minutes (a read that waits in the queue gives up before), and nothing is sent into an archived post or after shutdown.
4. What is kept is bounded and private: member ids and corrections only in the records, never printed or committed; status-bar text other than the clock dropped; nothing kept of a passive read that was refused.
5. A guessed time is never shown as certain, and a certain time is never marked a guess (the state document v8 and the time changes that confirm it).

---

### Task 1: Screenshot reader wired into the bot: settings, context, start and shutdown

Prototype commit: `168787e7dceafc830d84ad5006016ec3a7368258`

The reader on the bot: settings.ocr gains enabled (default true: false
switches screenshot reading off entirely), reviewDays, keepMegabytes,
reviewPerDay, and settings gain raidEggPicturesUrl, all with defaults.
ctx.screenshotReader is the OcrService over OcrAssets; at ClientReady
assets.ensure() runs in the background (logged on failure, never
awaited), and close() runs at shutdown before the database closes. A
config warning says when the review copies the settings allow cannot fit
the byte budget, or when a full queue could outlast an interaction's
fifteen minutes. The test context's reader answers unavailable;
FakeScreenshotReader answers what a test gives it.

**Interfaces:**
- Produces: `settings.ocr.{enabled, reviewDays, keepMegabytes, reviewPerDay}`, `settings.raidEggPicturesUrl`; `ctx.screenshotReader: ScreenshotReader`; `FakeScreenshotReader` (`test/support/`).

**Files:**

```
 src/app-context.ts           |   3 ++
 src/app.ts                   |  27 +++++++++++++++++
 src/config/settings.test.ts  |  11 +++++++
 src/config/settings.ts       |  27 +++++++++++++++++
 src/config/warnings.test.ts  |  65 ++++++++++++++++++++++++++++++++++++++++
 src/config/warnings.ts       |  34 +++++++++++++++++++--
 src/domain/pogo/raid-eggs.ts |   8 +++++
 test/support/screenshots.ts  | 103 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/test-context.ts |   3 ++
 9 files changed, 279 insertions(+), 2 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/config/settings.test.ts src/config/warnings.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 168787e7dceafc830d84ad5006016ec3a7368258 -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Screenshot reader wired into the bot: settings, context, start and shutdown`, the body above and the trailer, staging exactly
  `src/app-context.ts src/app.ts src/config/settings.test.ts src/config/settings.ts src/config/warnings.test.ts src/config/warnings.ts src/domain/pogo/raid-eggs.ts test/support/screenshots.ts test/support/test-context.ts`.

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index 387261d56a680573966f746287ed9da90ebda541..d2a8ff272b9d6b6fa4a5cead396f20e3b0f9e7e4 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -29,6 +29,7 @@ import type { RegionAdminService } from './services/region-admin-service.js';
 import type { RegionProvider } from './services/region-directory.js';
 import type { SelfRoleService } from './services/self-role-service.js';
 import type { SpawnService } from './services/spawn-service.js';
+import type { ScreenshotReader } from './services/ocr-service.js';
 import type { MapProvider } from './services/static-maps.js';
 import type { TimedPartyService } from './services/timed-party-service.js';
 import type { TrainService } from './services/train-service.js';
@@ -101,6 +102,8 @@ export interface AppContext {
   readonly pokebattler: PokebattlerGateway;
   /** Places by name (OpenStreetMap's Nominatim), which `/find-region` looks up. */
   readonly places: PlaceSearch;
+  /** The screenshot reader (Phase 7): one screenshot at a time, in a process of its own. */
+  readonly screenshotReader: ScreenshotReader;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
 }
diff --git a/src/app.ts b/src/app.ts
index e66309a7653d21611707a269be0bac5a6cffce15..ed71840cf72f741766f291486df708365c580c70 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -53,6 +53,8 @@ import { GymDirectory } from './services/gym-directory.js';
 import { GymUpkeep } from './services/gym-upkeep.js';
 import { ImageCache } from './services/image-cache.js';
 import { NotifyService } from './services/notify-service.js';
+import { OcrAssets } from './services/ocr-assets.js';
+import { OcrService } from './services/ocr-service.js';
 import { PartyLines } from './services/party-lines.js';
 import { PartyScheduler } from './services/party-scheduler.js';
 import { PartyService } from './services/party-service.js';
@@ -76,6 +78,8 @@ import { createShutdown } from './shutdown.js';
 const GAME_DATA_CACHE = 'var/game-data-cache.json';
 /** Downloaded map pictures are kept here; deleting the folder only costs new downloads. */
 const IMAGE_CACHE = 'var/images';
+/** The files of the screenshot reader (models, the tier head), downloaded on first use. */
+const OCR_DIR = 'var/ocr';
 const MINUTE_MS = 60_000;
 /** How long the party clock waits at start for the first read of the raid events. */
 const EVENTS_WAIT_MS = 15_000;
@@ -345,6 +349,23 @@ export async function startApp(
     settings: config.settings,
     log,
   });
+  // The screenshot reader: its files are checked (and downloaded) before its process starts.
+  const ocrAssets = new OcrAssets({
+    dir: OCR_DIR,
+    modelsUrl: config.settings.ocr.modelsUrl,
+    headIconUrl: config.settings.ocr.headIconUrl,
+    fetch: (url, init) => fetch(url, init),
+    log,
+  });
+  const screenshotReader = new OcrService({
+    assets: ocrAssets,
+    device: config.settings.ocr.device,
+    threads: config.settings.ocr.threads,
+    priority: config.settings.ocr.priority,
+    queue: config.settings.ocr.queue,
+    timeoutMs: config.settings.ocr.timeoutSeconds * 1000,
+    log,
+  });
   const clickAnswers = new ClickAnswers({ log });
   const pokemon = new PokemonSearchService(gameData, new PokemonRepository(db), log);
   try {
@@ -419,6 +440,7 @@ export async function startApp(
       fetch: (url, init) => fetch(url, init),
       log,
     }),
+    screenshotReader,
     features: requested,
   };
   // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
@@ -446,6 +468,9 @@ export async function startApp(
         botServers = () => [...ready.guilds.cache.keys()];
         bossAnnouncer.ready();
         markConnected();
+        // The reader's files (about 15 MB the first time) are had now, so that the first
+        // screenshot does not wait for them; never awaited, and `ensure` logs what fails.
+        if (config.settings.ocr.enabled) void ocrAssets.ensure();
       });
       client.on(Events.GuildCreate, (guild) => {
         guilds
@@ -551,6 +576,8 @@ export async function startApp(
       // Direct messages go on at their usual rate for ten seconds (spec 9); the rest is dropped.
       { name: 'direct messages', timeoutMs: 15_000, run: () => dms.drain(DM_DRAIN_MS) },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
+      // What waits is answered as unavailable; the reading process is ended.
+      { name: 'screenshot reader', timeoutMs: 5_000, run: () => screenshotReader.close() },
       { name: 'unown wants', timeoutMs: 5_000, run: () => unownWants.flush() },
       // A write in flight must finish before the pool closes.
       { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 149925eafff5b94eace4b4674b6d23bcf5d0ab14..8e48390147004b200d4b371b39fb8096b7cdf6fa 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -20,6 +20,7 @@ describe('loadSettings', () => {
     const settings = loadSettings(REPO_SETTINGS);
     expect(settings.cleanupInterval).toBe(60000);
     expect(settings.ocr).toEqual({
+      enabled: true,
       passive: false,
       debug: false,
       device: 'cpu',
@@ -30,7 +31,13 @@ describe('loadSettings', () => {
       modelsUrl: 'https://cdn.jsdelivr.net/npm/@gutenye/ocr-models@1.4.2/assets/',
       headIconUrl:
         'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/ic_raid_small.png',
+      reviewDays: 30,
+      keepMegabytes: 4096,
+      reviewPerDay: 50,
     });
+    expect(settings.raidEggPicturesUrl).toBe(
+      'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/',
+    );
     expect(settings.autoAssignRole).toBe(false);
     expect(settings.helpGroups).not.toContain('silph');
   });
@@ -50,6 +57,10 @@ describe('loadSettings', () => {
       { modelsUrl: 'http://models.example.test/' },
       { modelsUrl: 'https://models.example.test/assets' },
       { workers: 2 },
+      { reviewDays: 0 },
+      { keepMegabytes: 1 },
+      { reviewPerDay: -1 },
+      { enabled: 'yes' },
     ]) {
       expect(() => loadSettings(ocr(wrong))).toThrow(ConfigError);
     }
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 2daccefb96c501ffb680989dd0c023583f903156..ef444df5e23533e4447c41ab250f33293f7e24d4 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -2,6 +2,7 @@ import { readFileSync } from 'node:fs';
 import { z } from 'zod';
 import { ConfigError } from './errors.js';
 import { OCR_DEVICES, OCR_HEAD_ICON_URL, OCR_MODELS_URL } from '../domain/ocr/assets.js';
+import { RAID_EGG_PICTURES_URL } from '../domain/pogo/raid-eggs.js';
 
 const minutes = z.number().int().positive();
 const milliseconds = z.number().int().positive();
@@ -138,6 +139,11 @@ export const settingsSchema = z.strictObject({
    * screenshot at a time; everything but `passive` and `debug` has a default.
    */
   ocr: z.strictObject({
+    /**
+     * Whether screenshots are read at all: off, `/read-screenshot` is not offered, `/raid` has
+     * no screenshot option and a mention of the bot with a screenshot is not answered.
+     */
+    enabled: z.boolean().default(true),
     /** Read every image posted in a region channel (needs the Message Content intent). */
     passive: z.boolean(),
     debug: z.boolean(),
@@ -158,7 +164,28 @@ export const settingsSchema = z.strictObject({
       .default(OCR_MODELS_URL),
     /** The game's tier head, which the heads of a raid screen are matched against. */
     headIconUrl: z.url({ protocol: /^https$/ }).default(OCR_HEAD_ICON_URL),
+    /**
+     * How many days a screenshot kept for review (`var/ocr/review/`: one Pine was unsure of, or
+     * one a member said something about) is kept before it is deleted.
+     */
+    reviewDays: z.number().int().min(1).max(365).default(30),
+    /**
+     * How many megabytes the kept screenshots (`var/ocr/held/` and `review/`) may take together;
+     * beyond it, those without an issue go first, and a screenshot is read but not kept.
+     */
+    keepMegabytes: z.number().int().min(10).max(1_000_000).default(4096),
+    /** How many screenshots of one server are kept for review a day. */
+    reviewPerDay: z.number().int().min(0).max(10_000).default(50),
   }),
+  /**
+   * The folder the game's raid egg pictures are served from (`raid_egg_0_icon.png` and so on),
+   * which the post of an egg shows; a folder of PokeMiners' `pogo_assets` at a fixed commit by
+   * default.
+   */
+  raidEggPicturesUrl: z
+    .url({ protocol: /^https$/ })
+    .refine((url) => url.endsWith('/'), { message: 'must end with /: it is a folder' })
+    .default(RAID_EGG_PICTURES_URL),
   autoAssignRole: z.boolean(),
   gameData: z.strictObject({
     gameMasterUrl: z.url({ protocol: /^https?$/ }),
diff --git a/src/config/warnings.test.ts b/src/config/warnings.test.ts
index c0f0492f176aac288372d375591c874bb3501836..502a43ca8cfc52d15026d8b9a2b9b38ed43e3b35 100644
--- a/src/config/warnings.test.ts
+++ b/src/config/warnings.test.ts
@@ -1,4 +1,5 @@
 import { describe, expect, it } from 'vitest';
+import { loadSettings } from './settings.js';
 import { configWarnings } from './warnings.js';
 
 describe('configWarnings', () => {
@@ -23,4 +24,68 @@ describe('configWarnings', () => {
     expect(configWarnings({}, { regionMapLink: undefined })).toEqual([]);
     expect(configWarnings({ REGION_MAP_LINK: '  ' }, { regionMapLink: undefined })).toEqual([]);
   });
+
+  it('warns when the screenshots that may wait could not all be read within twelve minutes', () => {
+    const ocr = (queue: number, timeoutSeconds: number) =>
+      configWarnings(
+        {},
+        {
+          regionMapLink: undefined,
+          ocr: {
+            queue,
+            timeoutSeconds,
+            enabled: true,
+            reviewPerDay: 200,
+            reviewDays: 30,
+            keepMegabytes: 20_000,
+          },
+        },
+      );
+    expect(ocr(10, 60)).toEqual([]);
+    const [warning] = ocr(15, 60);
+    expect(warning).toMatch(/ocr\.queue/);
+    expect(warning).toMatch(/ocr\.timeoutSeconds/);
+    expect(
+      configWarnings(
+        {},
+        {
+          regionMapLink: undefined,
+          ocr: {
+            queue: 50,
+            timeoutSeconds: 600,
+            enabled: false,
+            reviewPerDay: 200,
+            reviewDays: 30,
+            keepMegabytes: 20_000,
+          },
+        },
+      ),
+    ).toEqual([]);
+  });
+
+  it('warns when the screenshots kept for review could fill the space of the kept screenshots', () => {
+    const ocr = (keepMegabytes: number) =>
+      configWarnings(
+        {},
+        {
+          regionMapLink: undefined,
+          ocr: {
+            queue: 10,
+            timeoutSeconds: 60,
+            enabled: true,
+            reviewPerDay: 200,
+            reviewDays: 30,
+            keepMegabytes,
+          },
+        },
+      );
+    expect(ocr(12_000)).toEqual([]);
+    const [warning] = ocr(2_048);
+    expect(warning).toMatch(/ocr\.reviewPerDay/);
+    expect(warning).toMatch(/ocr\.keepMegabytes/);
+  });
+
+  it('says nothing about the default settings', () => {
+    expect(configWarnings({}, loadSettings('data/settings.json'))).toEqual([]);
+  });
 });
diff --git a/src/config/warnings.ts b/src/config/warnings.ts
index 119609770c9924bc7ed42f1b6f41d63504138e84..3b53e8d85b437ee8784d4aa94be1f9900fc08b2b 100644
--- a/src/config/warnings.ts
+++ b/src/config/warnings.ts
@@ -4,11 +4,25 @@ import type { Settings } from './settings.js';
  * What the start says once about a configuration that works but is likely not what was meant.
  * `REGION_MAP_LINK`: the spec named an environment variable for the map of `/maps`, which plan 6A
  * made the setting `regionMapLink`; a variable left in `.env` is read by nothing, and without the
- * setting `/maps` is not offered. The value is never repeated.
+ * setting `/maps` is not offered. The value is never repeated. The screenshot reader: when every
+ * screenshot that may wait (`ocr.queue`) took as long as it may (`ocr.timeoutSeconds`), the last
+ * would start after more than twelve minutes, when its interaction can hardly still be answered
+ * (Discord allows fifteen): it is then answered as too busy. The review folder: when as many
+ * screenshots as `ocr.reviewPerDay` a day for `ocr.reviewDays` (about 2 MB each) would exceed
+ * `ocr.keepMegabytes`.
  */
 export function configWarnings(
   raw: Record<string, string | undefined>,
-  settings: Pick<Settings, 'regionMapLink'>,
+  settings: Pick<Settings, 'regionMapLink'> & {
+    ocr?: {
+      enabled: boolean;
+      queue: number;
+      timeoutSeconds: number;
+      reviewPerDay: number;
+      reviewDays: number;
+      keepMegabytes: number;
+    };
+  },
 ): string[] {
   const warnings: string[] = [];
   if ((raw.REGION_MAP_LINK ?? '').trim() !== '' && settings.regionMapLink === undefined) {
@@ -17,5 +31,21 @@ export function configWarnings(
         'setting regionMapLink, which is unset, so /maps is not offered',
     );
   }
+  const { ocr } = settings;
+  if (ocr?.enabled && (ocr.queue + 1) * ocr.timeoutSeconds > 12 * 60) {
+    warnings.push(
+      `(ocr.queue + 1) × ocr.timeoutSeconds is ${(ocr.queue + 1) * ocr.timeoutSeconds} seconds: ` +
+        'the last screenshot in line may wait longer than its command can be answered (twelve ' +
+        'minutes), and is then refused as busy. Lower ocr.queue or ocr.timeoutSeconds',
+    );
+  }
+  // A screenshot is about 2 MB: the review folder alone may outgrow the space given to all.
+  if (ocr?.enabled && ocr.reviewPerDay * ocr.reviewDays * 2 > ocr.keepMegabytes) {
+    warnings.push(
+      `ocr.reviewPerDay × ocr.reviewDays × 2 MB is ${ocr.reviewPerDay * ocr.reviewDays * 2} MB, ` +
+        `more than ocr.keepMegabytes (${ocr.keepMegabytes}): a busy server would fill the space of ` +
+        'the kept screenshots with review copies, the oldest of which then go before their time',
+    );
+  }
   return warnings;
 }
diff --git a/src/domain/pogo/raid-eggs.ts b/src/domain/pogo/raid-eggs.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7830b83b0a9b8147865e8dbb7c23f266877dbe42
--- /dev/null
+++ b/src/domain/pogo/raid-eggs.ts
@@ -0,0 +1,8 @@
+/**
+ * The game's raid egg pictures (PokeMiners' `pogo_assets`, `Images/Raids`), which the post of an
+ * egg shows as its thumbnail. Served from where `settings.raidEggPicturesUrl` points, by
+ * address: nothing is downloaded. At the commit the tier head of the screenshot reader is
+ * pinned to, so a picture never changes under a post.
+ */
+export const RAID_EGG_PICTURES_URL =
+  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/';
diff --git a/test/support/screenshots.ts b/test/support/screenshots.ts
new file mode 100644
index 0000000000000000000000000000000000000000..3c62ead3e699fe1683cc96df319b3d3203775ce3
--- /dev/null
+++ b/test/support/screenshots.ts
@@ -0,0 +1,103 @@
+import type { ScreenText } from '../../src/domain/ocr/raid-screen.js';
+import type { HeadCount } from '../../src/domain/ocr/tier-heads.js';
+import type { ScreenReading } from '../../src/ocr/screen-reader.js';
+import type { OcrOutcome, ReadOptions, ScreenshotReader } from '../../src/services/ocr-service.js';
+
+/** A reader that cannot run: every screenshot is answered `unavailable` (the test context's). */
+export const unavailableReader: ScreenshotReader = {
+  read: () => Promise.resolve({ kind: 'unavailable' }),
+  close: () => Promise.resolve(),
+};
+
+/** A reading with nothing on it: no clock, no countdown, no gym, no heads, no purple. */
+export function emptyText(): ScreenText {
+  return {
+    clock: null,
+    countdown: null,
+    gym: null,
+    eliteBadge: false,
+    cp: null,
+    bossName: null,
+    countdownBox: null,
+    countdownPlace: null,
+    cpBox: null,
+  };
+}
+
+/**
+ * A reading of a raid screen with this text, these heads (a count) and this share of purple: what
+ * the reading process would answer, without models. The lines are made up from the text, with
+ * boxes, so that what keeps a reading has something to keep.
+ */
+export function readingOf(
+  text: Partial<ScreenText>,
+  options: { heads?: number; purple?: number; outside?: number } = {},
+): ScreenReading {
+  const full = { ...emptyText(), ...text };
+  const heads: HeadCount | null =
+    options.heads === undefined
+      ? null
+      : { count: options.heads, score: 0.8, scale: 1, outside: options.outside ?? 0.1 };
+  return {
+    width: 1080,
+    height: 2400,
+    text: full,
+    band: heads ? { top: 1000, bottom: 1100, unit: 60 } : null,
+    heads,
+    purple: options.purple ?? 0,
+    lines: full.gym
+      ? [{ text: full.gym, confidence: 0.95, box: { x0: 100, y0: 150, x1: 900, y1: 220 } }]
+      : [],
+    status: [],
+    ms: 5,
+    peakMb: 100,
+  };
+}
+
+/**
+ * An egg of `heads` heads at `gym`, the phone's clock at `clock` and `countdown` seconds to go:
+ * the usual screenshot of a test.
+ */
+export function eggReading(
+  gym: string,
+  heads: number,
+  clock: { hour: number; minute: number } | null,
+  countdown = 30 * 60,
+): ScreenReading {
+  return readingOf({ gym, clock, countdown, countdownPlace: 'centre' }, { heads });
+}
+
+/**
+ * The reader of a test: a screenshot's bytes, read as text, name what it answers (`answers`,
+ * a reading or another outcome); anything else is `not-an-image`. `reads` counts what was read,
+ * `waiting` tells a reader with `ahead` set how many wait before it.
+ */
+export class FakeScreenshotReader implements ScreenshotReader {
+  readonly answers = new Map<string, ScreenReading | OcrOutcome>();
+  reads = 0;
+  /** When set, every screenshot waits behind this many (`onQueued`). */
+  ahead: number | undefined;
+
+  /** Gives the bytes a screenshot named `key` is, and what reading them answers. */
+  add(key: string, answer: ScreenReading | OcrOutcome): Uint8Array {
+    this.answers.set(key, answer);
+    return new TextEncoder().encode(key);
+  }
+
+  read(bytes: Uint8Array, options: ReadOptions = {}): Promise<OcrOutcome> {
+    this.reads++;
+    if (this.ahead !== undefined) options.onQueued?.(this.ahead);
+    const answer = this.answers.get(new TextDecoder().decode(bytes));
+    return new Promise((resolve) => {
+      setImmediate(() => {
+        if (answer === undefined) resolve({ kind: 'not-an-image' });
+        else if ('kind' in answer) resolve(answer);
+        else resolve({ kind: 'read', reading: answer });
+      });
+    });
+  }
+
+  close(): Promise<void> {
+    return Promise.resolve();
+  }
+}
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 1dc5fd11b0fe986a50f93a6e0317d9455a356370..239e599065998caec3795c68eec5d6eb110fbc9c 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -32,6 +32,7 @@ import { createTestLogger } from './test-logger.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 import { MemoryGymTargets } from './gym-targets.js';
 import { TEST_ENV } from './test-env.js';
+import { unavailableReader } from './screenshots.js';
 import { MemoryUsers } from './users.js';
 import { MemoryWants } from './wants.js';
 
@@ -132,6 +133,8 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     pokebattler: new FakePokebattler(),
     // No place is found by name; a test passes its own with places.
     places: new FakePlaces(),
+    // No screenshot can be read; a test passes a FakeScreenshotReader with its readings.
+    screenshotReader: unavailableReader,
     features: { ocrPassive: false, autoAssignRole: false },
     ...overrides,
   };
````

---

### Task 2: A screenshot's time from its file name; the purple on the name-alone path

Prototype commit: `5fb5c6ed250157dfce7a0907de801c224155aabc`

The time of a screenshot from its file name (takenAtFromFileName: the
Android shapes Screenshot_yyyyMMdd-HHmmss, _yyyyMMdd_HHmmss and
yyyy-MM-dd-HH-mm-ss, any case, anything after the time ignored; a date
that does not exist, a time the clocks skip or repeat gives none), used
by screenshotReport before the clock (ReportContext.fileTakenAt): within
the window it is the time; older, the screenshot is stale; disagreeing
with a clock read with confidence (CLOCK_SURE), the clock wins and the
doubt time-sources-differ is raised. The clock carries its line's
confidence. On the name-alone path the purple decides between a plain
and a shadow boss of one species, as on the CP path.

**Interfaces:**
- Produces: `takenAtFromFileName(name, zone)` (`src/domain/ocr/file-time.ts`); `ReportContext.fileTakenAt?`, `ScreenText.clock.confidence`, `CLOCK_SURE`, the doubt `time-sources-differ`, `ScreenshotReport` time source fields (`src/domain/ocr/screenshot-report.ts`).

**Files:**

```
 src/domain/ocr/file-time.test.ts         | 43 ++++++++++++++++++++++++
 src/domain/ocr/file-time.ts              | 38 ++++++++++++++++++++++
 src/domain/ocr/raid-screen.test.ts       | 28 ++++++++++------
 src/domain/ocr/raid-screen.ts            |  9 +++--
 src/domain/ocr/screenshot-report.test.ts | 88 +++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/ocr/screenshot-report.ts      | 92 ++++++++++++++++++++++++++++++++++++++++++++++++----
 6 files changed, 279 insertions(+), 19 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/ocr/file-time.test.ts src/domain/ocr/raid-screen.test.ts src/domain/ocr/screenshot-report.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 5fb5c6ed250157dfce7a0907de801c224155aabc -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `A screenshot's time from its file name; the purple on the name-alone path`, the body above and the trailer, staging exactly
  `src/domain/ocr/file-time.test.ts src/domain/ocr/file-time.ts src/domain/ocr/raid-screen.test.ts src/domain/ocr/raid-screen.ts src/domain/ocr/screenshot-report.test.ts src/domain/ocr/screenshot-report.ts`.

````diff
diff --git a/src/domain/ocr/file-time.test.ts b/src/domain/ocr/file-time.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..de05fc74d11b7d5e337d13c715327969f4c63329
--- /dev/null
+++ b/src/domain/ocr/file-time.test.ts
@@ -0,0 +1,43 @@
+import { DateTime } from 'luxon';
+import { describe, expect, it } from 'vitest';
+import { takenAtFromFileName } from './file-time.js';
+
+const ZONE = 'America/New_York';
+const at = (text: string) => DateTime.fromISO(text, { zone: ZONE }).toMillis();
+
+describe('takenAtFromFileName', () => {
+  it('reads the names Android gives a screenshot, in the zone of the phone', () => {
+    for (const name of [
+      'Screenshot_20261014-132301.jpg',
+      'Screenshot_20261014-132301_Pokemon GO.jpg',
+      'Screenshot_20261014_132301.png',
+      'Screenshot_2026-10-14-13-23-01-123_com.nianticlabs.pokemongo.jpg',
+      'screenshot_20261014-132301.webp',
+      'SCREENSHOT-20261014-132301.png',
+      'Screenshot_20261014-132301_Pokmon_GO.jpg',
+      'Screenshot_20261014-132301~2.png',
+      'Screenshot_20261014_132301(1).png',
+    ]) {
+      expect(takenAtFromFileName(name, ZONE), name).toBe(at('2026-10-14T13:23:01'));
+    }
+  });
+
+  it('reads nothing else, nor a date or time that does not exist', () => {
+    for (const name of [
+      'image.png',
+      'IMG_20261014_132301.jpg',
+      'Screenshot 2026-10-14 at 13.23.01.png',
+      'Screenshot_20261314-132301.jpg',
+      'Screenshot_20261014-256001.jpg',
+      'Screenshot_2026101-132301.jpg',
+      'MyScreenshot_20261014-132301.jpg',
+      'image0.jpg',
+      // 2:30 on the night the clocks spring forward does not exist.
+      'Screenshot_20260308-023000.png',
+      // 1:30 on the night they fall back is two moments: no hint.
+      'Screenshot_20261101-013000.png',
+    ]) {
+      expect(takenAtFromFileName(name, ZONE), name).toBeUndefined();
+    }
+  });
+});
diff --git a/src/domain/ocr/file-time.ts b/src/domain/ocr/file-time.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c0691ea0e40f0189816361bb4c23db9a86b14f3b
--- /dev/null
+++ b/src/domain/ocr/file-time.ts
@@ -0,0 +1,38 @@
+import { DateTime } from 'luxon';
+
+/**
+ * The names Android gives a screenshot, with the moment it was taken in the phone's own time:
+ * `Screenshot_20261014-132301…`, `Screenshot_20261014_132301…` and
+ * `Screenshot_2026-10-14-13-23-01…`, with `_` or `-` after the word, which may be in any case;
+ * whatever follows the time is not read (Samsung's app name, `~2`, `(1)`, the extension). An
+ * upload that arrives as `image0.jpg` (iOS, some ways of sharing) gives no hint.
+ */
+const ANDROID_NAMES = [
+  /^screenshot[_-](\d{4})(\d{2})(\d{2})[-_](\d{2})(\d{2})(\d{2})(?!\d)/i,
+  /^screenshot[_-](\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?!\d)/i,
+];
+
+/**
+ * When a screenshot was taken by the name of its file, read in `zone` (`settings.timezone`, the
+ * zone of the phone's clock as everywhere else); undefined for any other name, for a date or
+ * time that does not exist, and for one the clocks repeat (the night they fall back). A hint of the time only: the report decides whether it fits.
+ */
+export function takenAtFromFileName(name: string, zone: string): number | undefined {
+  for (const pattern of ANDROID_NAMES) {
+    const match = pattern.exec(name);
+    if (!match) continue;
+    const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
+    const time = DateTime.fromObject({ year, month, day, hour, minute, second }, { zone });
+    // A time the clocks skip (spring forward) is moved by Luxon: it did not exist.
+    const exists = time.isValid && time.hour === hour && time.minute === minute;
+    if (!exists) return undefined;
+    // A time the clocks repeat (fall back) is two moments an hour apart: no hint.
+    const hourLater = DateTime.fromMillis(time.toMillis() + 3_600_000, { zone });
+    const hourEarlier = DateTime.fromMillis(time.toMillis() - 3_600_000, { zone });
+    const repeated = [hourLater, hourEarlier].some(
+      (other) => other.hour === hour && other.minute === minute,
+    );
+    return repeated ? undefined : time.toMillis();
+  }
+  return undefined;
+}
diff --git a/src/domain/ocr/raid-screen.test.ts b/src/domain/ocr/raid-screen.test.ts
index 3d5fd354b2a8b58a548c64ce7897e2b3ab34dfd1..32ef47e319119ad1e3edc7d48032b01be09735fc 100644
--- a/src/domain/ocr/raid-screen.test.ts
+++ b/src/domain/ocr/raid-screen.test.ts
@@ -60,7 +60,11 @@ describe('readScreenText', () => {
 
   it('takes the clock from the status bar read alone, before the whole screen', () => {
     const status = [line('@9:43', 30, 20, 160, 70), line('12:00', 500, 20, 600, 70)];
-    expect(readScreenText(EGG, status, SIZE).clock).toEqual({ hour: 9, minute: 43 });
+    expect(readScreenText(EGG, status, SIZE).clock).toEqual({
+      hour: 9,
+      minute: 43,
+      confidence: 0.95,
+    });
   });
 
   it('answers null for what is not there', () => {
@@ -87,37 +91,41 @@ describe('statusLines and clockIn', () => {
   it('keeps the lines of the top 4.5%, and reads the first h:mm from the left', () => {
     const lines = [line('10:02', 500, 10, 600, 60), line('7:15', 20, 10, 120, 60), ...EGG.slice(1)];
     expect(statusLines(lines, 2400)).toHaveLength(2);
-    expect(clockIn(statusLines(lines, 2400))).toEqual({ hour: 7, minute: 15 });
+    expect(clockIn(statusLines(lines, 2400))).toEqual({ hour: 7, minute: 15, confidence: 0.95 });
     expect(clockIn([line('99:99', 0, 0, 10, 10)])).toBeNull();
   });
 
   it('does not take a network speed, a percentage or a longer number for the clock', () => {
     const at = (...texts: string[]) =>
       clockIn(texts.map((text, i) => line(text, i * 200, 0, i * 200 + 150, 40)));
-    expect(at('0.12K/s', '9:41')).toEqual({ hour: 9, minute: 41 });
-    expect(at('1.25K/s 9:41')).toEqual({ hour: 9, minute: 41 });
+    expect(at('0.12K/s', '9:41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
+    expect(at('1.25K/s 9:41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
     expect(at('1.25K/s', '85%')).toBeNull();
     expect(at('12:345')).toBeNull();
-    expect(at('9:41PM')).toEqual({ hour: 9, minute: 41 });
+    expect(at('9:41PM')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
     // The clock runs into the icons beside it when read.
-    expect(at('1:29C SOS 80')).toEqual({ hour: 1, minute: 29 });
+    expect(at('1:29C SOS 80')).toEqual({ hour: 1, minute: 29, confidence: 0.95 });
     expect(at('0.5MB/s', '12.5%')).toBeNull();
   });
 
   it('takes h.mm only when no h:mm stands in the bar', () => {
     const at = (...texts: string[]) =>
       clockIn(texts.map((text, i) => line(text, i * 200, 0, i * 200 + 150, 40)));
-    expect(at('14.10.', '9:41')).toEqual({ hour: 9, minute: 41 });
+    expect(at('14.10.', '9:41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
     expect(at('Tue 14.10.')).toBeNull();
-    expect(at('9.41')).toEqual({ hour: 9, minute: 41 });
+    expect(at('9.41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
     // A speed read apart from its unit.
     expect(at('1.25 K/s')).toBeNull();
-    expect(at('1.25 KB/s', '9.41')).toEqual({ hour: 9, minute: 41 });
+    expect(at('1.25 KB/s', '9.41')).toEqual({ hour: 9, minute: 41, confidence: 0.95 });
   });
 
   it('reads a clock with a morning or afternoon word before it, as East Asian phones show it', () => {
     for (const text of ['下午9:41', '午後 9:41', '오후 9:41', '9:41 PM', '09.41']) {
-      expect(clockIn([line(text, 0, 0, 100, 40)])).toEqual({ hour: 9, minute: 41 });
+      expect(clockIn([line(text, 0, 0, 100, 40)])).toEqual({
+        hour: 9,
+        minute: 41,
+        confidence: 0.95,
+      });
     }
   });
 });
diff --git a/src/domain/ocr/raid-screen.ts b/src/domain/ocr/raid-screen.ts
index c4044e3e64e6927812f605b9b63bfa303abb68a2..efee19cc81a64c043c3e27d6e60fd1a114989301 100644
--- a/src/domain/ocr/raid-screen.ts
+++ b/src/domain/ocr/raid-screen.ts
@@ -6,8 +6,11 @@ import { boxHeight, type Box, type TextLine } from './image.js';
  * split screens included (`docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md`).
  */
 export interface ScreenText {
-  /** The phone's clock: the first h:mm in the status bar, as shown (12- or 24-hour). */
-  clock: { hour: number; minute: number } | null;
+  /**
+   * The phone's clock: the first h:mm in the status bar, as shown (12- or 24-hour), with the
+   * reader's confidence (0 to 1) of the line it stands in.
+   */
+  clock: { hour: number; minute: number; confidence?: number } | null;
   /** The countdown h:mm:ss, in seconds: until the hatch of an egg, the end of a hatched raid. */
   countdown: number | null;
   /** The gym's name as read: the tallest text near the top and the lines under it. */
@@ -77,7 +80,7 @@ export function clockIn(lines: readonly TextLine[]): ScreenText['clock'] {
       if (!hit || NOT_A_CLOCK.test(hit[4] ?? '')) continue;
       if (hit[2] === '.' && DATE_END.test(hit[4] ?? '')) continue;
       if (hit[2] === '.' && !hit[4] && SPEED_UNIT.test(words[i + 1] ?? '')) continue;
-      const clock = { hour: Number(hit[1]), minute: Number(hit[3]) };
+      const clock = { hour: Number(hit[1]), minute: Number(hit[3]), confidence: line.confidence };
       if (hit[2] === ':') return clock;
       dotted ??= clock;
     }
diff --git a/src/domain/ocr/screenshot-report.test.ts b/src/domain/ocr/screenshot-report.test.ts
index 2996537ba1760db856401e851f162bcfaa490fce..a620305a8c718c020b09dbfa08f3135534cc3bf7 100644
--- a/src/domain/ocr/screenshot-report.test.ts
+++ b/src/domain/ocr/screenshot-report.test.ts
@@ -113,6 +113,7 @@ describe('screenshotReport', () => {
       tierFrom: 'boss',
       bossFrom: 'cp',
       takenAt: at('2026-10-14T13:38:00'),
+      timeFrom: 'clock',
       time: { end: at('2026-10-14T14:09:02') },
       doubts: [],
     });
@@ -194,6 +195,20 @@ describe('screenshotReport', () => {
     expect(both(0)).toMatchObject({ boss: plain, bossFrom: 'cp', doubts: [] });
   });
 
+  it('lets the purple decide between a shadow and a plain boss of one species by the name alone', () => {
+    const shadow = boss('landorus_incarnate');
+    const plain = { ...shadow, tier: { level: 'T5' as const, shadow: false } };
+    // A CP that fits no boss: the name decides, and both are called Landorus.
+    const both = (purple: number) =>
+      screenshotReport(
+        read(hatched({ cp: 45000, bossName: 'Landorus' }), 5, purple),
+        context({ bosses: [...BOSSES, plain] }),
+      );
+    expect(both(0.08)).toMatchObject({ boss: shadow, bossFrom: 'name' });
+    expect(both(0.08).doubts).toEqual(['boss-from-name']);
+    expect(both(0)).toMatchObject({ boss: plain, bossFrom: 'name' });
+  });
+
   it('doubts a boss whose name under its CP says another, and a row of heads that may be cut', () => {
     const named = screenshotReport(read(hatched({ cp: 45899, bossName: 'Pikachu' }), 5), context());
     expect(named.boss?.key).toBe('yveltal');
@@ -277,12 +292,85 @@ describe('screenshotReport', () => {
     for (const clock of [null, { hour: 4, minute: 10 }]) {
       expect(screenshotReport(read(egg({ clock, countdown: 600 }), 1), context())).toMatchObject({
         takenAt: at('2026-10-14T13:39:15'),
+        timeFrom: 'upload',
         time: { hatch: at('2026-10-14T13:49:15') },
         doubts: ['time-guessed'],
       });
     }
   });
 
+  it('takes the time from the name of the file when it fits the upload, before the clock', () => {
+    // Taken at 13:37:30 by the file's name; the clock says 13:39, a minute before the upload.
+    const report = screenshotReport(
+      read(egg({ countdown: 600 }), 1),
+      context({ fileTakenAt: at('2026-10-14T13:37:30') }),
+    );
+    expect(report).toMatchObject({
+      takenAt: at('2026-10-14T13:37:30'),
+      timeFrom: 'file',
+      time: { hatch: at('2026-10-14T13:47:30') },
+      doubts: [],
+    });
+    // Without a clock, the name is no guess either.
+    const noClock = screenshotReport(
+      read(egg({ clock: null, countdown: 600 }), 1),
+      context({ fileTakenAt: at('2026-10-14T13:37:30') }),
+    );
+    expect(noClock.takenAt).toBe(at('2026-10-14T13:37:30'));
+    expect(noClock.doubts).toEqual([]);
+  });
+
+  it('takes the time of a file older than the window, doubted as stale, and ignores one ahead', () => {
+    // Taken a day earlier at the same clock time: posted again. Its time is the file's, and
+    // the egg has hatched by now.
+    const reposted = screenshotReport(
+      read(egg({ countdown: 600 }), 1),
+      context({ fileTakenAt: at('2026-10-13T13:39:00') }),
+    );
+    expect(reposted.takenAt).toBe(at('2026-10-13T13:39:00'));
+    expect(reposted.doubts).toEqual(['time-stale', 'time-past']);
+    // Without a clock, too: stale, not guessed.
+    const noClock = screenshotReport(
+      read(egg({ clock: null, countdown: 600 }), 1),
+      context({ fileTakenAt: at('2026-10-13T13:39:00') }),
+    );
+    expect(noClock.takenAt).toBe(at('2026-10-13T13:39:00'));
+    expect(noClock.doubts).toEqual(['time-stale', 'time-past']);
+    // A phone whose clock is far ahead names its files by it: the name is not used.
+    const ahead = screenshotReport(
+      read(egg({ countdown: 600 }), 1),
+      context({ fileTakenAt: at('2026-10-14T13:45:00') }),
+    );
+    expect(ahead.takenAt).toBe(at('2026-10-14T13:39:00'));
+    expect(ahead.doubts).toEqual([]);
+  });
+
+  it('lets a sure clock win over a file name it disagrees with by more than two minutes, and doubts both', () => {
+    // The clock says 13:39, the file 13:30: the file was renamed or the phone's clock set apart.
+    const sure = screenshotReport(
+      read(egg({ clock: { hour: 13, minute: 39, confidence: 0.9 }, countdown: 600 }), 1),
+      context({ fileTakenAt: at('2026-10-14T13:30:00') }),
+    );
+    expect(sure.takenAt).toBe(at('2026-10-14T13:39:00'));
+    expect(sure.timeFrom).toBe('clock');
+    expect(sure.doubts).toEqual(['time-sources-differ']);
+    // A clock read with little confidence loses to the file's name.
+    const unsure = screenshotReport(
+      read(egg({ clock: { hour: 13, minute: 39, confidence: 0.4 }, countdown: 600 }), 1),
+      context({ fileTakenAt: at('2026-10-14T13:30:00') }),
+    );
+    expect(unsure.takenAt).toBe(at('2026-10-14T13:30:00'));
+    expect(unsure.timeFrom).toBe('file');
+    expect(unsure.doubts).toEqual(['time-sources-differ']);
+    // Within two minutes of the clock, the file's second-exact time stands, undoubted.
+    const close = screenshotReport(
+      read(egg({ countdown: 600 }), 1),
+      context({ fileTakenAt: at('2026-10-14T13:38:12') }),
+    );
+    expect(close.takenAt).toBe(at('2026-10-14T13:38:12'));
+    expect(close.doubts).toEqual([]);
+  });
+
   it('doubts a clock a while before the upload, a time already past, a countdown too long', () => {
     const stale = screenshotReport(read(egg({ clock: { hour: 1, minute: 20 } }), 1), context());
     expect(stale.doubts).toEqual(['time-stale']);
diff --git a/src/domain/ocr/screenshot-report.ts b/src/domain/ocr/screenshot-report.ts
index 662f07954e79ecc3403158ba54f214d41355989b..83b5d63412628e5bbed3e6d0323510ac36f7d2f3 100644
--- a/src/domain/ocr/screenshot-report.ts
+++ b/src/domain/ocr/screenshot-report.ts
@@ -51,6 +51,13 @@ export interface ReportContext {
   maxHatched: number;
   /** Seconds before the upload a screenshot without a usable clock is taken to be from. */
   guessOffsetSeconds: number;
+  /**
+   * When the screenshot was taken by the name of its file (`takenAtFromFileName`): an Android
+   * phone names it by the moment, to the second. It is the time unless a clock was read that it
+   * contradicts by more than two minutes, or it is ahead of the upload; older than the clock's
+   * window, the screenshot is doubted as stale (posted again later).
+   */
+  fileTakenAt?: number;
 }
 
 /**
@@ -58,7 +65,10 @@ export interface ReportContext {
  * - `not-a-raid-screen`: no countdown, or neither heads nor a boss named by its CP;
  * - `no-gym`, `gym-unclear`: no gym found, or not one clear hit of the name read;
  * - `no-time`: no countdown; `time-guessed`: from the upload, no usable clock;
- * - `time-stale`: the clock is more than a quarter of an hour before the upload;
+ * - `time-stale`: the clock is more than a quarter of an hour before the upload, or the name of
+ *   the file says it was taken longer ago than the clock could;
+ * - `time-sources-differ`: the name of the file and the clock read say other times (the clock
+ *   won when it was read surely, the file otherwise);
  * - `time-past`: the hatch or end lies before the upload;
  * - `countdown-long`: longer than an egg incubates or a raid lasts;
  * - `stage-unknown`: neither egg nor hatched could be told;
@@ -81,6 +91,7 @@ export type ReportDoubt =
   | 'no-time'
   | 'time-guessed'
   | 'time-stale'
+  | 'time-sources-differ'
   | 'time-past'
   | 'countdown-long'
   | 'stage-unknown'
@@ -121,8 +132,10 @@ export interface ScreenshotReport {
   purple: number;
   clock: { hour: number; minute: number } | null;
   countdown: number | null;
-  /** When the screenshot was taken: by its clock, or guessed from the upload. */
+  /** When the screenshot was taken: by its file's name, its clock, or guessed from the upload. */
   takenAt: number;
+  /** What `takenAt` was taken from. */
+  timeFrom: 'file' | 'clock' | 'upload';
   /** When the egg hatches, or the hatched raid ends; null without a countdown and a stage. */
   time: { hatch: number } | { end: number } | null;
   doubts: ReportDoubt[];
@@ -272,6 +285,11 @@ export function clockTime(
   return best;
 }
 
+/** Two bosses of one Pokémon: one entry, or one name for a boss the game master does not know. */
+function sameSpecies(a: RaidBoss, b: RaidBoss): boolean {
+  return a.entry && b.entry ? a.entry.key === b.entry.key : a.name === b.name;
+}
+
 interface BossChoice {
   boss: RaidBoss | null;
   from: ScreenshotReport['bossFrom'];
@@ -315,7 +333,20 @@ function bossOf(
   // The CP fits no listed boss (a digit misread, or a boss the feed does not list yet): a name
   // decides only when it is nearly exactly one boss's of the heads' tier and no other's.
   if (!name || !headsLevel) return { boss: null, from: null };
-  const [first, second] = ranked(bosses.filter((boss) => boss.tier.level === headsLevel));
+  let ofLevel = bosses.filter((boss) => boss.tier.level === headsLevel);
+  // A shadow and a plain boss of one species have one name: the purple tells them apart, as
+  // it does for one CP.
+  const [best] = ranked(ofLevel);
+  if (best) {
+    const twins = ofLevel.filter(
+      (boss) => sameSpecies(boss, best) && similar(boss) === similar(best),
+    );
+    const ofPurple = twins.filter((boss) => boss.tier.shadow === shadow);
+    if (twins.length > 1 && ofPurple.length > 0) {
+      ofLevel = ofLevel.filter((boss) => !twins.includes(boss) || ofPurple.includes(boss));
+    }
+  }
+  const [first, second] = ranked(ofLevel);
   if (
     first &&
     similar(first) >= NAME_ALONE &&
@@ -326,6 +357,41 @@ function bossOf(
   return { boss: null, from: null };
 }
 
+/**
+ * A clock read with at least this confidence (of its status-bar line) wins over a file name it
+ * disagrees with. On the 28 samples every clock was read right, its line at 0.74 to 0.98 (the
+ * icons beside the clock lower the line's confidence): below the lowest, with a margin.
+ */
+export const CLOCK_SURE = 0.6;
+
+/**
+ * The time of the file's name, and whether it disagrees with the clock read: undefined when it
+ * is ahead of the upload by more than a phone's clock may be. When a clock was read and the
+ * file's time of day is more than two minutes from it (either half for a 12-hour clock), the
+ * clock wins if it was read surely (`CLOCK_SURE`), and the file otherwise.
+ */
+function fileTime(
+  context: ReportContext,
+  clock: ScreenText['clock'],
+): { at: number | undefined; differs: boolean } {
+  const { fileTakenAt } = context;
+  if (fileTakenAt === undefined || fileTakenAt > context.uploadedAt + CLOCK_AHEAD_MS) {
+    return { at: undefined, differs: false };
+  }
+  if (!clock) return { at: fileTakenAt, differs: false };
+  const local = DateTime.fromMillis(fileTakenAt, { zone: context.zone });
+  const minutes = local.hour * 60 + local.minute + local.second / 60;
+  const hours =
+    clock.hour >= 1 && clock.hour <= 12 ? [clock.hour % 12, (clock.hour % 12) + 12] : [clock.hour];
+  const agrees = hours.some((hour) => {
+    const apart = Math.abs(minutes - (hour * 60 + clock.minute)) % 1440;
+    return Math.min(apart, 1440 - apart) <= CLOCK_AHEAD_MS / 60_000;
+  });
+  if (agrees) return { at: fileTakenAt, differs: false };
+  const sure = (clock.confidence ?? 0) >= CLOCK_SURE;
+  return { at: sure ? undefined : fileTakenAt, differs: true };
+}
+
 export function screenshotReport(reading: ReadScreen, context: ReportContext): ScreenshotReport {
   const { text } = reading;
   const doubts = new Set<ReportDoubt>();
@@ -390,9 +456,22 @@ export function screenshotReport(reading: ReadScreen, context: ReportContext): S
   const byClock = text.clock
     ? clockTime(text.clock, context.uploadedAt, context.zone, maxAgeMs)
     : undefined;
-  const takenAt = byClock ?? context.uploadedAt - context.guessOffsetSeconds * 1000;
-  if (byClock === undefined) doubts.add('time-guessed');
-  else if (context.uploadedAt - byClock > STALE_MS) doubts.add('time-stale');
+  // The file's name, to the second and dated, wins when it agrees with the clock read (within a
+  // phone's two minutes, by the time of day) or there is no clock: within the window it is the
+  // time; older, it is still the time, doubted as stale (a screenshot posted again later). A
+  // name ahead of the upload by more than a phone's clock may be, or one the clock contradicts,
+  // is not used.
+  const file = fileTime(context, text.clock);
+  if (file.differs) doubts.add('time-sources-differ');
+  const fileTakenAt = file.at;
+  const fileAge = fileTakenAt === undefined ? undefined : context.uploadedAt - fileTakenAt;
+  const takenAt = fileTakenAt ?? byClock ?? context.uploadedAt - context.guessOffsetSeconds * 1000;
+  if (fileAge !== undefined) {
+    if (fileAge > maxAgeMs) doubts.add('time-stale');
+  } else {
+    if (byClock === undefined) doubts.add('time-guessed');
+    else if (context.uploadedAt - byClock > STALE_MS) doubts.add('time-stale');
+  }
   let time: ScreenshotReport['time'] = null;
   if (text.countdown === null) {
     doubts.add('no-time');
@@ -432,6 +511,7 @@ export function screenshotReport(reading: ReadScreen, context: ReportContext): S
     clock: text.clock,
     countdown: text.countdown,
     takenAt,
+    timeFrom: fileTakenAt !== undefined ? 'file' : byClock !== undefined ? 'clock' : 'upload',
     time,
     doubts: [...doubts],
   };
````

---

### Task 3: Screenshots kept on disk: held for a day, copied for review, swept hourly

Prototype commit: `b1a540d6235073b4e0c3440f70c85eb8cdbe2423`

ScreenshotStore keeps screenshots on disk (var/ocr/held/ and
var/ocr/review/): a record (JSON) beside each image, named by a random
id of twelve URL-safe characters; written to a temporary file and
renamed; one change at a time per record. A screenshot read for
/read-screenshot is held a day, a raid's until a day after the raid
ended (the hourly sweep learns which records active raids show); one
with a doubt, a question, a refusal or feedback that it was wrong is
also linked into review/ (a hard link, a copy where linking fails) for
reviewDays, at most reviewPerDay per server. A byte budget
(keepMegabytes) is kept: the screenshots without issues go first,
oldest first, then the oldest review copies; a screenshot that does not
fit is read and answered but not kept. The sweep runs at start and
hourly with the scheduler's upkeep and also removes unreadable records
and orphan files. Feedback is recorded with the member's id.

**Interfaces:**
- Produces: `ScreenshotStore`, `ScreenshotKeeping`, `ScreenshotRecord`, `NewScreenshot`, `KeptScreenshot`, `hasIssue`, `newScreenshotId` (`src/services/screenshot-store.ts`); the stored shapes `StoredReport`, `StoredDecision`, `StoredTyped`, `Feedback`, `FeedbackElement`, `FEEDBACK_ELEMENTS`, `SampleLabel`, `MemberLabel`, `memberLabel`, `SCREENSHOT_USES` (`src/domain/ocr/screenshot-record.ts`).

**Files:**

```
 src/app.ts                               |  12 ++
 src/domain/ocr/image.ts                  |  13 ++
 src/domain/ocr/screenshot-record.test.ts |  82 ++++++++
 src/domain/ocr/screenshot-record.ts      | 130 +++++++++++++
 src/ocr/screen-reader.ts                 |  10 +-
 src/services/party-scheduler.ts          |   9 +-
 src/services/screenshot-store.test.ts    | 345 ++++++++++++++++++++++++++++++++++
 src/services/screenshot-store.ts         | 521 +++++++++++++++++++++++++++++++++++++++++++++++++++
 8 files changed, 1111 insertions(+), 11 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/ocr/screenshot-record.test.ts src/services/screenshot-store.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff b1a540d6235073b4e0c3440f70c85eb8cdbe2423 -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Screenshots kept on disk: held for a day, copied for review, swept hourly`, the body above and the trailer, staging exactly
  `src/app.ts src/domain/ocr/image.ts src/domain/ocr/screenshot-record.test.ts src/domain/ocr/screenshot-record.ts src/ocr/screen-reader.ts src/services/party-scheduler.ts src/services/screenshot-store.test.ts src/services/screenshot-store.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index ed71840cf72f741766f291486df708365c580c70..6c71885ac9c2ca3b193e3ba1bb3edb8247f670af 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -55,6 +55,7 @@ import { ImageCache } from './services/image-cache.js';
 import { NotifyService } from './services/notify-service.js';
 import { OcrAssets } from './services/ocr-assets.js';
 import { OcrService } from './services/ocr-service.js';
+import { ScreenshotStore } from './services/screenshot-store.js';
 import { PartyLines } from './services/party-lines.js';
 import { PartyScheduler } from './services/party-scheduler.js';
 import { PartyService } from './services/party-service.js';
@@ -333,6 +334,16 @@ export async function startApp(
     config.env.GOOGLE_API_KEY,
     new ImageCache({ dir: IMAGE_CACHE, fetch: (url, init) => fetch(url, init), log }),
   );
+  // The screenshots that were read, kept for a while and for review (`var/ocr/held`, `review`).
+  const screenshotStore = new ScreenshotStore({
+    dir: OCR_DIR,
+    reviewDays: config.settings.ocr.reviewDays,
+    keepMegabytes: config.settings.ocr.keepMegabytes,
+    reviewPerDay: config.settings.ocr.reviewPerDay,
+    gymName: (id) => gyms.get(id)?.name,
+    shown: () => new Set(),
+    log,
+  });
   const scheduler = new PartyScheduler({
     store: parties,
     posts: partyService,
@@ -341,6 +352,7 @@ export async function startApp(
     routes: trains,
     spawns,
     pictures: maps,
+    screenshots: screenshotStore,
     lines,
     gateway: partyGateway,
     raidBosses,
diff --git a/src/domain/ocr/image.ts b/src/domain/ocr/image.ts
index 74cdc6bbf63cb4f2a5dc440c73c06b1699b84be8..5751230c8496a7730df79fe5e5703b72ae19297a 100644
--- a/src/domain/ocr/image.ts
+++ b/src/domain/ocr/image.ts
@@ -34,3 +34,16 @@ export const boxWidth = (box: Box): number => box.x1 - box.x0;
 export function scaledBox(box: Box, sx: number, sy: number): Box {
   return { x0: box.x0 * sx, y0: box.y0 * sy, x1: box.x1 * sx, y1: box.y1 * sy };
 }
+
+/** The kinds of picture the reader reads, by the file extension each is kept under. */
+export type ImageFormat = 'png' | 'jpg' | 'webp';
+
+/** PNG, JPEG or WebP by the first bytes; undefined for anything else. */
+export function imageFormat(bytes: Uint8Array): ImageFormat | undefined {
+  const starts = (offset: number, ...values: number[]) =>
+    values.every((value, i) => bytes[offset + i] === value);
+  if (starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
+  if (starts(0, 0xff, 0xd8, 0xff)) return 'jpg';
+  if (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50)) return 'webp';
+  return undefined;
+}
diff --git a/src/domain/ocr/screenshot-record.test.ts b/src/domain/ocr/screenshot-record.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..40e5f8e71e4ad69a10b6d5cfb44b4d8e68e026a1
--- /dev/null
+++ b/src/domain/ocr/screenshot-record.test.ts
@@ -0,0 +1,82 @@
+import { describe, expect, it } from 'vitest';
+import { memberLabel, type StoredReport } from './screenshot-record.js';
+
+const NAMES: Record<number, string> = { 7: 'Heinz Plant' };
+const gymName = (id: number) => NAMES[id];
+
+function report(overrides: Partial<StoredReport> = {}): StoredReport {
+  return {
+    gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
+    stage: 'hatched',
+    heads: 5,
+    tier: { level: 'T5', shadow: true },
+    tierFrom: 'boss',
+    cp: 47444,
+    bossName: 'Landorus',
+    boss: { key: 'landorus_incarnate', name: 'Landorus', tier: { level: 'T5', shadow: true } },
+    bossFrom: 'cp',
+    eliteBadge: false,
+    purple: 0.08,
+    clock: { hour: 1, minute: 38 },
+    countdown: 1800,
+    takenAt: 0,
+    timeFrom: 'clock',
+    time: { end: 1 },
+    doubts: [],
+    ...overrides,
+  };
+}
+
+describe('memberLabel', () => {
+  it('makes what the reader decided of a hatched raid the answer key', () => {
+    expect(memberLabel(report(), null, gymName)).toEqual({
+      source: 'member',
+      gym: 'Heinz Plant',
+      egg: false,
+      tier: 5,
+      shadow: true,
+      boss: 'Landorus',
+    });
+  });
+
+  it('keys a mega egg by its four heads, with no boss', () => {
+    const mega = report({
+      stage: 'egg',
+      heads: 4,
+      tier: { level: 'Mega', shadow: false },
+      boss: null,
+      cp: null,
+    });
+    expect(memberLabel(mega, null, gymName)).toEqual({
+      source: 'member',
+      gym: 'Heinz Plant',
+      egg: true,
+      tier: 4,
+      shadow: false,
+    });
+  });
+
+  it('leaves out what the member typed, and is nothing when nothing is left', () => {
+    const typed = {
+      gymId: 7,
+      boss: {
+        tier: { level: 'T5' as const, shadow: true },
+        key: 'landorus_incarnate',
+        hatched: true,
+      },
+    };
+    expect(memberLabel(report(), typed, gymName)).toBeUndefined();
+    expect(memberLabel(report(), { gymId: 7 }, gymName)).not.toHaveProperty('gym');
+  });
+
+  it('keys the gym the member picked, else a gym read clearly, else none', () => {
+    const names: Record<number, string> = { 7: 'Heinz Plant', 9: 'Old Plant Church' };
+    const own = (id: number) => names[id];
+    const unclear = report({
+      gym: { read: 'Plant', searched: 'Plant', gymId: 7, place: 'local', clear: false },
+    });
+    expect(memberLabel(unclear, null, own)).not.toHaveProperty('gym');
+    expect(memberLabel(unclear, null, own, 9)?.gym).toBe('Old Plant Church');
+    expect(memberLabel(report(), null, own, 9)?.gym).toBe('Old Plant Church');
+  });
+});
diff --git a/src/domain/ocr/screenshot-record.ts b/src/domain/ocr/screenshot-record.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cc13e565c680947246c5a61f44000133210eac49
--- /dev/null
+++ b/src/domain/ocr/screenshot-record.ts
@@ -0,0 +1,130 @@
+import type { RaidTier } from '../pogo/raid-tier.js';
+import type { ScreenshotReport } from './screenshot-report.js';
+
+/**
+ * What is kept of a screenshot beside its file (`ScreenshotStore`): what was read, what Pine
+ * made of it, what it decided and what members said of it. Plain data, written as JSON and read
+ * back after a restart, by the feedback button and by `npm run ocr:review` and `ocr:check`.
+ * Records are for staff and development only (Matt, 2026-10-14): they hold the snowflakes of
+ * the member who sent the screenshot and of those who said something, which never go into a
+ * commit or a printout (`ocr:review` shows them only with `--show-text`).
+ */
+
+/** The report as it is kept: the boss by its name and tier, not the catalogue entry. */
+export type StoredReport = Omit<ScreenshotReport, 'boss'> & {
+  boss: { key: string; name: string; tier: RaidTier } | null;
+};
+
+export function storedReport(report: ScreenshotReport): StoredReport {
+  const { boss } = report;
+  return {
+    ...report,
+    boss: boss ? { key: boss.key, name: boss.name, tier: boss.tier } : null,
+  };
+}
+
+/** How a screenshot came to be read. */
+export const SCREENSHOT_USES = ['read-screenshot', 'raid', 'mention', 'passive'] as const;
+export type ScreenshotUse = (typeof SCREENSHOT_USES)[number];
+
+/** What was decided (`decide`): the kinds of `ScreenshotDecision`, with the doubts or reason. */
+export type StoredDecision =
+  { kind: 'report' } | { kind: 'ask'; doubts: string[] } | { kind: 'refuse'; reason: string };
+
+/** The elements a member may say were wrong. */
+export const FEEDBACK_ELEMENTS = ['gym', 'time', 'stage', 'tier', 'boss'] as const;
+export type FeedbackElement = (typeof FEEDBACK_ELEMENTS)[number];
+
+/** A member's correction is at most this long. */
+export const MAX_CORRECTION = 500;
+
+export type Feedback =
+  { verdict: 'right' } | { verdict: 'wrong'; elements: FeedbackElement[]; correction: string };
+
+/** One member's feedback on a screenshot: the newest replaces their earlier one. */
+export type FeedbackRecord = Feedback & {
+  /** The member's snowflake. */
+  memberId: string;
+  /** The member who sent the screenshot, or somebody else who saw it. */
+  by: 'reporter' | 'other';
+  at: number;
+};
+
+/**
+ * The answer key of a sample in the shape `npm run ocr:check` scores (the research's
+ * `labels.json`): the clock `h:mm`, the countdown `h:mm:ss`, the gym's name as shown, egg or
+ * not, the tier as the number of heads (4 or `mega` for a mega), shadow, the boss's name, the CP.
+ */
+export interface SampleLabel {
+  clock: string | null;
+  countdown: string | null;
+  gym: string | null;
+  egg: boolean;
+  tier: number | 'mega';
+  shadow: boolean;
+  boss: string | null;
+  cp: number | null;
+}
+
+/**
+ * What the member typed beside the screenshot (`/raid`), kept apart from what the reader made of
+ * it: the reader is judged by its own report, never by what a member typed.
+ */
+export interface StoredTyped {
+  gymId?: number;
+  /** A boss by its key (null for an egg, or a hatched raid whose boss was not given). */
+  boss?: { tier: RaidTier; key: string | null; hatched: boolean };
+  time?: { hatch: number } | { end: number };
+}
+
+/**
+ * The answer key of a sample members said was read right, for `ocr:check`: what the reader made
+ * of it is the answer, for the elements it read itself (an element the member typed is left
+ * out). Only these are scored: the gym by the decided gym's name, egg or hatched, the heads,
+ * shadow, the boss.
+ */
+export interface MemberLabel {
+  source: 'member';
+  /** The gym's own name (what the game shows). */
+  gym?: string;
+  egg?: boolean;
+  tier?: number | 'mega';
+  shadow?: boolean;
+  boss?: string | null;
+}
+
+const pad = (n: number): string => String(n).padStart(2, '0');
+
+export function clockText(clock: { hour: number; minute: number } | null): string | null {
+  return clock ? `${clock.hour}:${pad(clock.minute)}` : null;
+}
+
+export function countdownText(seconds: number | null): string | null {
+  if (seconds === null) return null;
+  return `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
+}
+
+/**
+ * The answer key of a reading a member said was right: what the reader made of it, without what
+ * the member typed (`typed`). The gym is the one the member picked when asked, or else the gym
+ * read when it was clear; none otherwise. `gymName` gives a gym's own name, as the game shows it
+ * (never a nickname). Undefined when nothing is left.
+ */
+export function memberLabel(
+  report: StoredReport,
+  typed: StoredTyped | null,
+  gymName: (gymId: number) => string | undefined,
+  pickedGymId: number | null = null,
+): MemberLabel | undefined {
+  const label: MemberLabel = { source: 'member' };
+  const gymId = pickedGymId ?? (report.gym.clear ? report.gym.gymId : null);
+  const gym = gymId === null ? undefined : gymName(gymId);
+  if (typed?.gymId === undefined && gym !== undefined) label.gym = gym;
+  if (!typed?.boss && report.stage !== null) {
+    label.egg = report.stage === 'egg';
+    if (report.heads !== null) label.tier = report.heads;
+    if (report.tier) label.shadow = report.tier.shadow;
+    if (report.stage === 'hatched') label.boss = report.boss?.name ?? null;
+  }
+  return Object.keys(label).length > 1 ? label : undefined;
+}
diff --git a/src/ocr/screen-reader.ts b/src/ocr/screen-reader.ts
index 42ebabb5a7d9dc0d6ff0959e09575d0262a89155..2cd5a5b6f9d282c5fb74881cf3981e0838dcda44 100644
--- a/src/ocr/screen-reader.ts
+++ b/src/ocr/screen-reader.ts
@@ -1,5 +1,5 @@
 import sharp from 'sharp';
-import { scaledBox, type TextLine } from '../domain/ocr/image.js';
+import { imageFormat, scaledBox, type TextLine } from '../domain/ocr/image.js';
 import { readScreenText, STATUS_BAR, type ScreenText } from '../domain/ocr/raid-screen.js';
 import { purpleShare } from '../domain/ocr/shadow.js';
 import {
@@ -49,13 +49,7 @@ const MAX_ASPECT = 3;
 
 /** PNG, JPEG and WebP by their first bytes: nothing else reaches the image library. */
 export function isScreenshotFormat(bytes: Uint8Array): boolean {
-  const starts = (offset: number, ...values: number[]) =>
-    values.every((value, i) => bytes[offset + i] === value);
-  return (
-    starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
-    starts(0, 0xff, 0xd8, 0xff) ||
-    (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50))
-  );
+  return imageFormat(bytes) !== undefined;
 }
 
 export class NotAnImageError extends Error {
diff --git a/src/services/party-scheduler.ts b/src/services/party-scheduler.ts
index 4ef2808bb612a1849148c740fb17f30bbaaeb2b1..7fcf4dae6441bf085e83fc8b94bf828512918ac2 100644
--- a/src/services/party-scheduler.ts
+++ b/src/services/party-scheduler.ts
@@ -41,6 +41,8 @@ export interface PartySchedulerOptions {
   spawns?: { sweep(): Promise<unknown> };
   /** The map pictures of places, of which those older than a day go with the upkeep. */
   pictures?: { prunePlaces(): Promise<unknown> };
+  /** The screenshots kept on disk, of which those that are due go with the upkeep. */
+  screenshots?: { sweep(): Promise<unknown> };
   lines: Pick<PartyLines, 'say'>;
   gateway: Pick<PartyGateway, 'sendMessage' | 'deleteMessage'>;
   raidBosses: Pick<RaidBossProvider, 'autoset'>;
@@ -213,11 +215,11 @@ export class PartyScheduler {
   /**
    * Archives open posts of ended parties, looks after the summaries, takes back the access to
    * forums that nothing calls for any more, takes stops off the routes of trains whose gym is
-   * gone, and has the spawn reports deleted that no process deleted at their time: at start and
-   * hourly.
+   * gone, has the spawn reports deleted that no process deleted at their time, and the kept
+   * screenshots that are due: at start and hourly.
    */
   private upkeep(): void {
-    const { posts, access, routes, spawns, pictures, log } = this.options;
+    const { posts, access, routes, spawns, pictures, screenshots, log } = this.options;
     this.lastUpkeep = this.now();
     // Each by itself: one that fails does not keep the others from running.
     const step = async (work: () => Promise<unknown>): Promise<void> => {
@@ -234,6 +236,7 @@ export class PartyScheduler {
       if (routes) await step(() => routes.removeUnknownStops());
       if (spawns) await step(() => spawns.sweep());
       if (pictures) await step(() => pictures.prunePlaces());
+      if (screenshots) await step(() => screenshots.sweep());
     })()
       .catch((err: unknown) => {
         log.error({ err }, 'the upkeep of the forums failed');
diff --git a/src/services/screenshot-store.test.ts b/src/services/screenshot-store.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5628a32b1771deb12d792e25af5c0c5d9e36f794
--- /dev/null
+++ b/src/services/screenshot-store.test.ts
@@ -0,0 +1,345 @@
+import {
+  mkdtempSync,
+  readdirSync,
+  readFileSync,
+  statSync,
+  utimesSync,
+  writeFileSync,
+} from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { eggReading } from '../../test/support/screenshots.js';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import { storedReport, type StoredReport } from '../domain/ocr/screenshot-record.js';
+import {
+  ScreenshotStore,
+  type NewScreenshot,
+  type ScreenshotStoreOptions,
+} from './screenshot-store.js';
+
+const DAY = 24 * 3_600_000;
+const MB = 1024 * 1024;
+const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
+const SENDER = '700000000000000001';
+const OTHER = '700000000000000002';
+
+const report = (doubts: StoredReport['doubts'] = []): StoredReport =>
+  storedReport({
+    gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
+    stage: 'egg',
+    heads: 5,
+    tier: { level: 'T5', shadow: false },
+    tierFrom: 'heads',
+    cp: null,
+    bossName: null,
+    boss: null,
+    bossFrom: null,
+    eliteBadge: false,
+    purple: 0,
+    clock: { hour: 13, minute: 39 },
+    countdown: 1800,
+    takenAt: 0,
+    timeFrom: 'clock',
+    time: { hatch: 1_800_000 },
+    doubts,
+  });
+
+function screenshot(
+  decision: NewScreenshot['decision'] = { kind: 'report' },
+  more: Partial<NewScreenshot> = {},
+): NewScreenshot {
+  return {
+    guildId: '412345678901234567',
+    use: 'raid',
+    senderId: SENDER,
+    uploadedAt: 1_000_000,
+    fileTakenAt: null,
+    timeFrom: 'clock',
+    reading: eggReading('Heinz Plant', 5, { hour: 13, minute: 39 }),
+    report: report(),
+    typed: null,
+    decision,
+    bosses: [],
+    ...more,
+  };
+}
+
+function storeWith(shown: Set<string> = new Set(), more: Partial<ScreenshotStoreOptions> = {}) {
+  const dir = mkdtempSync(path.join(tmpdir(), 'pine-shots-'));
+  const clock = { now: 1_000_000 };
+  const { log, entries } = createTestLogger();
+  const store = new ScreenshotStore({
+    dir,
+    reviewDays: 30,
+    keepMegabytes: 2048,
+    reviewPerDay: 200,
+    shown: () => shown,
+    gymName: (id) => (id === 7 ? 'Heinz Plant' : id === 9 ? 'Old Plant Church' : undefined),
+    log,
+    now: () => clock.now,
+    ...more,
+  });
+  const files = (folder: string) => {
+    try {
+      return readdirSync(path.join(dir, folder)).sort();
+    } catch {
+      return [];
+    }
+  };
+  const json = (folder: string, id: string) =>
+    JSON.parse(readFileSync(path.join(dir, folder, `${id}.json`), 'utf8')) as Record<
+      string,
+      unknown
+    >;
+  return { dir, clock, store, files, json, entries };
+}
+
+async function kept(store: ScreenshotStore, shot: NewScreenshot, bytes = PNG, image = true) {
+  const id = await store.keep(bytes, shot, image);
+  if (!id) throw new Error('not kept');
+  return id;
+}
+
+describe('ScreenshotStore', () => {
+  it('keeps a screenshot with its record for a day, the sender by their id', async () => {
+    const { store, files, json } = storeWith();
+    const id = await kept(store, screenshot());
+    expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/);
+    expect(files('held')).toEqual([`${id}.json`, `${id}.png`]);
+    expect(files('review')).toEqual([]);
+    expect(json('held', id)).toMatchObject({
+      id,
+      use: 'raid',
+      senderId: SENDER,
+      keepUntil: 1_000_000 + DAY,
+      pickedGymId: null,
+      feedback: [],
+    });
+    const found = await store.get(id);
+    if (!found || found === 'gone') throw new Error('not found');
+    expect(found.record.report.gym.gymId).toBe(7);
+    expect(readFileSync(found.path ?? '')).toEqual(Buffer.from(PNG));
+  });
+
+  it('keeps a record alone when asked, and says gone for a file that vanished', async () => {
+    const { store, files, dir } = storeWith();
+    const alone = await kept(
+      store,
+      screenshot({ kind: 'refuse', reason: 'not-a-raid-screen' }),
+      PNG,
+      false,
+    );
+    expect(files('held')).toEqual([`${alone}.json`]);
+    expect(files('review')).toEqual([`${alone}.json`]);
+    expect(await store.get(alone)).toMatchObject({ path: undefined, record: { file: null } });
+    const id = await kept(store, screenshot());
+    const { rmSync } = await import('node:fs');
+    rmSync(path.join(dir, 'held', `${id}.png`));
+    expect(await store.get(id)).toBe('gone');
+  });
+
+  it('keeps nothing that is no picture, and answers nothing for an id it does not have', async () => {
+    const { store, files } = storeWith();
+    expect(await store.keep(new TextEncoder().encode('text'), screenshot())).toBeUndefined();
+    expect(files('held')).toEqual([]);
+    expect(await store.get('../../etc/xx')).toBeUndefined();
+    expect(await store.get('AAAAAAAAAAAA')).toBeUndefined();
+  });
+
+  it('copies one it asked about or refused to review at once, at most so many a server a day', async () => {
+    const { store, files, json, clock } = storeWith(new Set(), { reviewPerDay: 2 });
+    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
+    expect(files('review')).toEqual([`${asked}.json`, `${asked}.png`]);
+    expect(json('review', asked).keepUntil).toBe(1_000_000 + 30 * DAY);
+    await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
+    const third = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
+    expect(files('review')).toHaveLength(4);
+    expect(files('review')).not.toContain(`${third}.json`);
+    clock.now += DAY;
+    const next = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
+    expect(files('review')).toContain(`${next}.json`);
+  });
+
+  it('records one feedback per member by id, copies it to review, and makes "All right" the key', async () => {
+    const { store, files, json } = storeWith();
+    const id = await kept(store, screenshot());
+    expect(await store.feedback(id, SENDER, { verdict: 'right' })).toBe('ok');
+    expect(files('review')).toEqual([`${id}.json`, `${id}.png`]);
+    expect(json('review', id)).toMatchObject({
+      feedback: [{ verdict: 'right', by: 'reporter', memberId: SENDER }],
+      label: { source: 'member', gym: 'Heinz Plant', egg: true, tier: 5, shadow: false },
+    });
+    // The reporter changes their mind; somebody else agrees with what was read at first.
+    await store.feedback(id, SENDER, { verdict: 'wrong', elements: ['gym'], correction: 'X' });
+    await store.feedback(id, OTHER, { verdict: 'right' });
+    const record = json('review', id);
+    expect(record.feedback).toMatchObject([
+      { verdict: 'wrong', by: 'reporter', elements: ['gym'], correction: 'X' },
+      { verdict: 'right', by: 'other', memberId: OTHER },
+    ]);
+    // Disputed: listed, never scored.
+    expect(record.label).toBeUndefined();
+    expect(await store.feedback('AAAAAAAAAAAA', SENDER, { verdict: 'right' })).toBe('gone');
+  });
+
+  it('keys the gym its member picked when asked', async () => {
+    const { store, json } = storeWith();
+    const id = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }));
+    await store.picked(id, 9);
+    await store.feedback(id, SENDER, { verdict: 'right' });
+    expect(json('review', id)).toMatchObject({
+      pickedGymId: 9,
+      label: { gym: 'Old Plant Church' },
+    });
+  });
+
+  it('leaves out of the key what the member typed', async () => {
+    const { store, json } = storeWith();
+    const id = await kept(
+      store,
+      screenshot(
+        { kind: 'report' },
+        {
+          typed: {
+            gymId: 7,
+            boss: { tier: { level: 'T5', shadow: false }, key: null, hatched: false },
+          },
+        },
+      ),
+    );
+    await store.feedback(id, SENDER, { verdict: 'right' });
+    expect(json('held', id).label).toBeUndefined();
+  });
+
+  it('writes the review copy of feedback given at the same time with all of it', async () => {
+    const { store, json } = storeWith();
+    const id = await kept(store, screenshot());
+    await Promise.all([
+      store.feedback(id, SENDER, { verdict: 'right' }),
+      store.feedback(id, OTHER, { verdict: 'wrong', elements: ['tier'], correction: '' }),
+      store.picked(id, 7),
+    ]);
+    expect(json('review', id)).toMatchObject({ pickedGymId: 7 });
+    expect((json('review', id).feedback as unknown[]).length).toBe(2);
+  });
+
+  it('sweeps what is due: a day for one in held, a day after its raid for one a raid shows', async () => {
+    const shown = new Set<string>();
+    const { store, clock, files, json } = storeWith(shown);
+    const plain = await kept(store, screenshot());
+    const ofRaid = await kept(store, screenshot());
+    void plain;
+    shown.add(ofRaid);
+    await store.inUse(ofRaid);
+    clock.now += DAY + 1;
+    await store.sweep();
+    expect(files('held')).toEqual([`${ofRaid}.json`, `${ofRaid}.png`]);
+    // The raid ended: a day from the sweep that sees it.
+    shown.delete(ofRaid);
+    await store.sweep();
+    expect(json('held', ofRaid).keepUntil).toBe(clock.now + DAY);
+    // A raid made from it again meanwhile keeps it, whatever its record says.
+    clock.now += DAY + 1;
+    shown.add(ofRaid);
+    await store.sweep();
+    expect(files('held')).toEqual([`${ofRaid}.json`, `${ofRaid}.png`]);
+    shown.delete(ofRaid);
+  });
+
+  it('sweeps review after reviewDays, and a stray file or an unreadable record after a day', async () => {
+    const { store, clock, files, dir } = storeWith();
+    const id = await kept(store, screenshot({ kind: 'refuse', reason: 'no-gym' }));
+    for (const name of ['strayfile.png', 'AAAAAAAAAAAA.json', 'AAAAAAAAAAAA.png']) {
+      const stray = path.join(dir, 'held', name);
+      writeFileSync(stray, name.endsWith('.json') ? '{ not json' : 'x');
+      utimesSync(stray, new Date(0), new Date(0));
+    }
+    clock.now += 2 * DAY;
+    await store.sweep();
+    expect(files('held')).toEqual([]);
+    expect(files('review')).toEqual([`${id}.json`, `${id}.png`]);
+    clock.now += 30 * DAY;
+    await store.sweep();
+    expect(files('review')).toEqual([]);
+  });
+
+  it('makes room within its budget by the oldest screenshots without an issue', async () => {
+    const shown = new Set<string>();
+    const { store, files, clock } = storeWith(shown, { keepMegabytes: 10 });
+    const big = new Uint8Array(3 * MB);
+    big.set(PNG);
+    const first = await kept(store, screenshot(), big);
+    // "All right" is no issue: it goes like any other plain screenshot.
+    await store.feedback(first, OTHER, { verdict: 'right' });
+    clock.now += 1;
+    // Held and in review, but linked: its bytes count once.
+    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }), big);
+    clock.now += 1;
+    const doubted = await kept(
+      store,
+      screenshot({ kind: 'report' }, { report: report(['time-guessed']) }),
+      big,
+    );
+    // Full: the plain one goes for a new plain one.
+    clock.now += 1;
+    const second = await kept(store, screenshot(), big);
+    expect(files('held')).not.toContain(`${first}.png`);
+    expect(files('held')).toContain(`${asked}.png`);
+    expect(files('held')).toContain(`${doubted}.png`);
+    // Only screenshots with an issue (and the one a raid shows) could make room: not kept.
+    shown.add(second);
+    expect(await store.keep(big, screenshot())).toBeUndefined();
+    expect(files('held')).toContain(`${second}.png`);
+  });
+
+  it('counts a screenshot held and in review once, and lets the oldest review copies go next', async () => {
+    const { store, files, clock } = storeWith(new Set(), { keepMegabytes: 4 });
+    const big = new Uint8Array(3 * MB);
+    big.set(PNG);
+    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }), big);
+    expect(files('review')).toContain(`${asked}.png`);
+    // 3 MB of 4: half a megabyte more fits, which a double count would refuse.
+    const small = new Uint8Array(MB / 2);
+    small.set(PNG);
+    await store.sweep();
+    expect(
+      await store.keep(small, screenshot({ kind: 'ask', doubts: ['gym-unclear'] })),
+    ).toBeDefined();
+    // Two days on the held ones are gone; the review copies stay, and the oldest makes room.
+    clock.now += 2 * 24 * 3_600_000;
+    await store.sweep();
+    expect(files('held')).toEqual([]);
+    const next = await store.keep(big, screenshot());
+    expect(next).toBeDefined();
+    expect(files('review')).not.toContain(`${asked}.png`);
+  });
+
+  it('copies a review screenshot where it cannot link one, and counts its bytes twice', async () => {
+    const noLinks = () =>
+      Promise.reject(Object.assign(new Error('cross-device link'), { code: 'EXDEV' }));
+    const { store, files, dir } = storeWith(new Set(), { keepMegabytes: 4, link: noLinks });
+    const shot = new Uint8Array(1.5 * MB);
+    shot.set(PNG);
+    const asked = await kept(store, screenshot({ kind: 'ask', doubts: ['gym-unclear'] }), shot);
+    // A copy of its own: another file than the held one.
+    const held = statSync(path.join(dir, 'held', `${asked}.png`));
+    const copy = statSync(path.join(dir, 'review', `${asked}.png`));
+    expect(copy.size).toBe(held.size);
+    expect(copy.ino === held.ino && copy.dev === held.dev).toBe(false);
+    // 3 MB of 4 are taken: 1.5 MB more fits only once the review copy has made room.
+    expect(await store.keep(shot, screenshot())).toBeDefined();
+    expect(files('review')).not.toContain(`${asked}.png`);
+    expect(files('held')).toContain(`${asked}.png`);
+  });
+
+  it('answers rather than throws when it cannot write, and says so in the log', async () => {
+    const { store, dir, entries } = storeWith();
+    // A file where the folder should be: nothing can be written under it.
+    writeFileSync(path.join(dir, 'held'), 'in the way');
+    expect(await store.keep(PNG, screenshot())).toBeUndefined();
+    expect(entries.some((entry) => entry.msg === 'could not keep a screenshot')).toBe(true);
+    expect(await store.feedback('AAAAAAAAAAAA', SENDER, { verdict: 'right' })).toBe('gone');
+    await store.sweep();
+  });
+});
diff --git a/src/services/screenshot-store.ts b/src/services/screenshot-store.ts
new file mode 100644
index 0000000000000000000000000000000000000000..39dcef307f859d731664bc95bdefc55de32d7c87
--- /dev/null
+++ b/src/services/screenshot-store.ts
@@ -0,0 +1,521 @@
+import { randomBytes } from 'node:crypto';
+import {
+  copyFile,
+  link,
+  mkdir,
+  readdir,
+  readFile,
+  rename,
+  rm,
+  stat,
+  writeFile,
+} from 'node:fs/promises';
+import path from 'node:path';
+import { BoundedMap } from '../bounded-map.js';
+import { imageFormat } from '../domain/ocr/image.js';
+import {
+  memberLabel,
+  type Feedback,
+  type FeedbackRecord,
+  type MemberLabel,
+  type ScreenshotUse,
+  type StoredDecision,
+  type StoredReport,
+  type StoredTyped,
+} from '../domain/ocr/screenshot-record.js';
+import type { RaidTier } from '../domain/pogo/raid-tier.js';
+import type { ScreenReading } from '../ocr/screen-reader.js';
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+
+const DAY_MS = 24 * 3_600_000;
+const MB = 1024 * 1024;
+
+/**
+ * What is kept beside a screenshot as `<id>.json`, in `held/` and, for review, in `review/`.
+ * Version 1. For staff and development only: it holds the snowflakes of the member who sent
+ * the screenshot and of those who said something about it (Matt, 2026-10-14), which never go
+ * into a commit or a printout.
+ */
+export interface ScreenshotRecord {
+  v: 1;
+  id: string;
+  /**
+   * The screenshot's file beside it (`<id>.png`, `.jpg` or `.webp`); null when only the record
+   * is kept (a picture that is no raid screen: a member's ordinary picture).
+   */
+  file: string | null;
+  readAt: number;
+  /** The server it was sent in. */
+  guildId: string;
+  use: ScreenshotUse;
+  /** The member who sent it. */
+  senderId: string;
+  /** When the message or interaction that brought it was made. */
+  uploadedAt: number;
+  /** When it was taken by the name of its file, when that was read (`takenAtFromFileName`). */
+  fileTakenAt: number | null;
+  /** What the report's time was taken from. */
+  timeFrom: 'file' | 'clock' | 'upload';
+  /**
+   * What the reader saw: the lines with their boxes, the heads, the purple; of the status bar
+   * only the lines that look like a clock or are short (notification previews are left out).
+   */
+  reading: ScreenReading;
+  /** What the reader made of it by itself. */
+  report: StoredReport;
+  /** What the member typed beside it (`/raid`), which the decision put in its place. */
+  typed: StoredTyped | null;
+  /** What was decided, from the report with what was typed. */
+  decision: StoredDecision;
+  /** The gym the member chose when they were asked. */
+  pickedGymId: number | null;
+  /** The raid bosses in effect at the read, which the boss was decided among (`ocr:check`). */
+  bosses: { key: string; name: string; tier: RaidTier }[];
+  /** When the files go; null while a raid made from it is active (its post shows it). */
+  keepUntil: number | null;
+  feedback: FeedbackRecord[];
+  /** The answer key `ocr:check` scores it by, once a member said the reading was right. */
+  label?: MemberLabel;
+}
+
+/** What a caller gives to keep a screenshot; the store adds the id, the file and the times. */
+export type NewScreenshot = Omit<
+  ScreenshotRecord,
+  'v' | 'id' | 'file' | 'readAt' | 'keepUntil' | 'feedback' | 'label' | 'pickedGymId'
+>;
+
+/** A screenshot that is kept: its record and where its file is (none for a record alone). */
+export interface KeptScreenshot {
+  record: ScreenshotRecord;
+  path: string | undefined;
+}
+
+/** What the rest of the bot asks of the store (`ScreenshotStore`; tests use it over a folder). */
+export interface ScreenshotKeeping {
+  /** `image: false` keeps the record alone. */
+  keep(bytes: Uint8Array, screenshot: NewScreenshot, image?: boolean): Promise<string | undefined>;
+  get(id: string): Promise<KeptScreenshot | 'gone' | undefined>;
+  /** The screenshot is shown by an active raid's post: kept while that lasts. */
+  inUse(id: string): Promise<void>;
+  /** The gym the member chose when asked. */
+  picked(id: string, gymId: number): Promise<void>;
+  feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'>;
+  sweep(): Promise<void>;
+}
+
+export interface ScreenshotStoreOptions {
+  /** The folder under which `held/` and `review/` are kept: `var/ocr`. */
+  dir: string;
+  /** How long a screenshot kept for review stays (`settings.ocr.reviewDays`). */
+  reviewDays: number;
+  /** How many megabytes both folders may hold together (`settings.ocr.keepMegabytes`). */
+  keepMegabytes: number;
+  /** How many screenshots of one server go to review a day (`settings.ocr.reviewPerDay`). */
+  reviewPerDay: number;
+  /** The ids of the screenshots active parties show (their raids' `screenshot.id`). */
+  shown: () => ReadonlySet<string>;
+  /** The own name of a gym (what the game shows, not a nickname), for a sample's answer key. */
+  gymName: (gymId: number) => string | undefined;
+  log: Logger;
+  now?: () => number;
+  /** How a review copy is linked to its held file (`fs.link`; tests make it fail). */
+  link?: (from: string, to: string) => Promise<void>;
+}
+
+const ID = /^[A-Za-z0-9_-]{12}$/;
+
+/**
+ * A screenshot worth keeping longest (Matt, 2026-10-14): one that was not reported unasked,
+ * raised a doubt, or that somebody said was read wrong. "All right" is no issue.
+ */
+export function hasIssue(
+  record: Pick<ScreenshotRecord, 'decision' | 'report' | 'feedback'>,
+): boolean {
+  return (
+    record.decision.kind !== 'report' ||
+    record.report.doubts.length > 0 ||
+    record.feedback.some((f) => f.verdict === 'wrong')
+  );
+}
+
+/** Twelve URL-safe characters: the id of a screenshot, in file names and custom ids. */
+export function newScreenshotId(): string {
+  return randomBytes(9).toString('base64url');
+}
+
+/**
+ * The screenshots Pine read, kept on disk (`var/ocr/`): every one in `held/` with its record,
+ * for a day (a raid's for a day after the raid ended); a copy in `review/` of every one that
+ * was refused or asked about, or that a member said something about, kept `reviewDays`, at
+ * most `reviewPerDay` of one server a day. A copy is a hard link where the file system allows
+ * one, so a screenshot in both folders takes its bytes once. Both folders hold at most
+ * `keepMegabytes` together: beyond it, held screenshots without an issue (`hasIssue`) go
+ * first, the oldest first and never one an active raid shows, then the oldest review copies;
+ * when that is not enough a screenshot is read and answered but not kept. The review folder is
+ * what a later session improves the reader from (`ocr:review`, `ocr:check`). Writes of one
+ * record go one after the other; nothing about what a screenshot shows is logged. Every method
+ * answers rather than throws: a screenshot that could not be kept is logged and the bot goes on.
+ */
+export class ScreenshotStore implements ScreenshotKeeping {
+  private readonly held: string;
+  private readonly review: string;
+  private readonly now: () => number;
+  private readonly writing = new Map<string, Promise<unknown>>();
+  /** Bytes in both folders (a linked pair once); undefined until they were counted. */
+  private used: number | undefined;
+  /** Held screenshots without an issue, by id, with when they were read: the first to go. */
+  private readonly plain = new Map<string, number>();
+  /** Review copies made per server and day. */
+  private readonly reviewed = new BoundedMap<string, number>(1_000);
+
+  constructor(private readonly options: ScreenshotStoreOptions) {
+    this.held = path.join(options.dir, 'held');
+    this.review = path.join(options.dir, 'review');
+    this.now = options.now ?? Date.now;
+  }
+
+  /**
+   * Keeps a screenshot that was read, for a day (`image: false`: its record alone); a copy goes
+   * to review at once when it was not reported unasked. Answers its id, or undefined when it
+   * was not kept.
+   */
+  async keep(
+    bytes: Uint8Array,
+    screenshot: NewScreenshot,
+    image = true,
+  ): Promise<string | undefined> {
+    const format = imageFormat(bytes);
+    if (!format) return undefined;
+    const id = newScreenshotId();
+    const now = this.now();
+    const record: ScreenshotRecord = {
+      v: 1,
+      id,
+      file: image ? `${id}.${format}` : null,
+      readAt: now,
+      ...screenshot,
+      pickedGymId: null,
+      keepUntil: now + DAY_MS,
+      feedback: [],
+    };
+    try {
+      if (!(await this.room(image ? bytes.byteLength : 0))) return undefined;
+      await mkdir(this.held, { recursive: true });
+      if (record.file) {
+        await writeFile(path.join(this.held, record.file), bytes);
+        this.grow(bytes.byteLength);
+      }
+      await this.serially(this.key(this.held, id), async () => {
+        await this.write(this.held, record);
+        this.index(record);
+        if (record.decision.kind !== 'report') await this.toReview(record);
+      });
+      return id;
+    } catch (err) {
+      this.options.log.error({ reason: failureReason(err) }, 'could not keep a screenshot');
+      return undefined;
+    }
+  }
+
+  /**
+   * The kept screenshot: undefined for one that is not kept, `gone` for one whose file has
+   * vanished (a record alone, kept so, comes without a path).
+   */
+  async get(id: string): Promise<KeptScreenshot | 'gone' | undefined> {
+    if (!ID.test(id)) return undefined;
+    const record = await this.read(this.held, id);
+    if (!record) return undefined;
+    if (record.file === null) return { record, path: undefined };
+    const file = path.join(this.held, record.file);
+    const there = await stat(file).catch(() => undefined);
+    return there ? { record, path: file } : 'gone';
+  }
+
+  inUse(id: string): Promise<void> {
+    return this.change(id, (record) => ({ ...record, keepUntil: null }));
+  }
+
+  picked(id: string, gymId: number): Promise<void> {
+    return this.change(id, (record) => ({ ...record, pickedGymId: gymId }), true);
+  }
+
+  /**
+   * Records a member's feedback (their earlier one is replaced) and copies the screenshot to
+   * review. "All right" makes the reading the screenshot's answer key, for what the reader
+   * read itself; anybody's "Something is wrong" takes the key away (listed, not scored).
+   */
+  async feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'> {
+    if (!ID.test(id)) return 'gone';
+    let found = false;
+    await this.change(
+      id,
+      (record) => {
+        found = true;
+        const entry: FeedbackRecord = {
+          ...feedback,
+          memberId,
+          by: memberId === record.senderId ? 'reporter' : 'other',
+          at: this.now(),
+        };
+        const others = record.feedback.filter((f) => f.memberId !== memberId);
+        const all = [...others, entry];
+        const { label: _old, ...rest } = record;
+        const disputed = all.some((f) => f.verdict === 'wrong');
+        const label = disputed
+          ? undefined
+          : memberLabel(record.report, record.typed, this.options.gymName, record.pickedGymId);
+        return { ...rest, feedback: all, ...(label ? { label } : {}) };
+      },
+      true,
+    );
+    return found ? 'ok' : 'gone';
+  }
+
+  /**
+   * Deletes what is due: in `held/`, a screenshot whose time has come (one shown by a raid that
+   * is no longer active gets a day from now; one an active raid shows at that moment never
+   * goes); in `review/`, one older than `reviewDays`; in both, a file without a record it
+   * belongs to, and a record that cannot be read, a day after they were written. The index of
+   * held screenshots without an issue is built anew.
+   */
+  async sweep(): Promise<void> {
+    const now = this.now();
+    await this.room(0);
+    let deleted = 0;
+    this.plain.clear();
+    for (const folder of [this.held, this.review]) {
+      const names = await readdir(folder).catch(() => [] as string[]);
+      const readable = new Set<string>();
+      for (const name of names.filter((n) => n.endsWith('.json'))) {
+        const id = name.slice(0, -5);
+        if (!ID.test(id)) continue;
+        await this.serially(this.key(folder, id), async () => {
+          const record = await this.read(folder, id);
+          if (!record) return;
+          readable.add(id);
+          if (folder === this.held && record.keepUntil === null) {
+            if (!this.options.shown().has(id)) {
+              await this.write(folder, { ...record, keepUntil: now + DAY_MS });
+            }
+            this.index(record);
+            return;
+          }
+          const due = record.keepUntil !== null && record.keepUntil <= now;
+          // Asked again at the moment of deletion: a raid made meanwhile shows it.
+          if (!due || (folder === this.held && this.options.shown().has(id))) {
+            if (folder === this.held) this.index(record);
+            return;
+          }
+          await this.removeRecord(folder, record);
+          readable.delete(id);
+          deleted++;
+        });
+      }
+      for (const name of names) {
+        const owner = name.replace(/\..*$/, '');
+        if (readable.has(owner)) continue;
+        const file = path.join(folder, name);
+        const info = await stat(file).catch(() => undefined);
+        if (info && now - info.mtimeMs > DAY_MS) await this.remove(file);
+      }
+    }
+    if (deleted > 0) this.options.log.info({ deleted }, 'deleted kept screenshots');
+  }
+
+  /**
+   * Copies the record (and the screenshot, as a hard link where it can) to review, kept
+   * `reviewDays` from now. Runs under the held record's turn, with the record just written
+   * there. A new copy takes one of the server's review places of the day once it is made.
+   */
+  private async toReview(record: ScreenshotRecord): Promise<void> {
+    const target = path.join(this.review, `${record.id}.json`);
+    const fresh = !(await stat(target).catch(() => undefined));
+    const day = `${record.guildId}:${new Date(this.now()).toISOString().slice(0, 10)}`;
+    const count = this.reviewed.get(day) ?? 0;
+    if (fresh && count >= this.options.reviewPerDay) {
+      if (count === this.options.reviewPerDay) {
+        this.options.log.warn(
+          { guild: record.guildId },
+          'a server reached its screenshots for review today; no more are kept for review',
+        );
+        this.reviewed.set(day, count + 1);
+      }
+      return;
+    }
+    await mkdir(this.review, { recursive: true });
+    if (record.file) {
+      const image = path.join(this.review, record.file);
+      if (!(await stat(image).catch(() => undefined))) {
+        const source = path.join(this.held, record.file);
+        try {
+          await (this.options.link ?? link)(source, image);
+        } catch {
+          // No hard links here: a copy, which takes its bytes again.
+          const size = (await stat(source)).size;
+          if (!(await this.room(size))) return;
+          await copyFile(source, image);
+          this.grow(size);
+        }
+      }
+    }
+    await this.serially(this.key(this.review, record.id), () =>
+      this.write(this.review, {
+        ...record,
+        keepUntil: this.now() + this.options.reviewDays * DAY_MS,
+      }),
+    );
+    if (fresh) this.reviewed.set(day, count + 1);
+  }
+
+  /**
+   * Changes the held record of `id`, one change at a time (`review`: and its copy in review);
+   * nothing when it is gone.
+   */
+  private async change(
+    id: string,
+    how: (record: ScreenshotRecord) => ScreenshotRecord,
+    review = false,
+  ): Promise<void> {
+    if (!ID.test(id)) return;
+    await this.serially(this.key(this.held, id), async () => {
+      const record = await this.read(this.held, id);
+      if (!record) return;
+      const changed = how(record);
+      await this.write(this.held, changed);
+      this.index(changed);
+      if (review) await this.toReview(changed);
+    }).catch((err: unknown) => {
+      this.options.log.error({ reason: failureReason(err) }, 'could not change a kept screenshot');
+    });
+  }
+
+  /** Notes in the index whether a held record is one of the first to go. */
+  private index(record: ScreenshotRecord): void {
+    if (record.file && !hasIssue(record)) this.plain.set(record.id, record.readAt);
+    else this.plain.delete(record.id);
+  }
+
+  /**
+   * Whether `bytes` more fit the budget; the folders are counted the first time (a linked pair
+   * once), which also builds the index. Over it, held screenshots of the index make room, the
+   * oldest first, each read again under its turn and left when it is gone, has an issue by now
+   * or an active raid shows it; then the oldest review copies; then nothing is kept.
+   */
+  private async room(bytes: number): Promise<boolean> {
+    if (this.used === undefined) await this.count();
+    const budget = this.options.keepMegabytes * MB;
+    const fits = () => (this.used ?? 0) + bytes <= budget;
+    if (bytes === 0 || fits()) return true;
+    const oldest = [...this.plain.entries()].sort(([, a], [, b]) => a - b).map(([id]) => id);
+    for (const id of oldest) {
+      if (fits()) break;
+      await this.serially(this.key(this.held, id), async () => {
+        const record = await this.read(this.held, id);
+        this.plain.delete(id);
+        if (!record || hasIssue(record) || this.options.shown().has(id)) return;
+        await this.removeRecord(this.held, record);
+      });
+    }
+    if (!fits()) {
+      const copies: ScreenshotRecord[] = [];
+      for (const name of await readdir(this.review).catch(() => [] as string[])) {
+        if (!name.endsWith('.json')) continue;
+        const record = await this.read(this.review, name.slice(0, -5));
+        if (record) copies.push(record);
+      }
+      copies.sort((a, b) => a.readAt - b.readAt);
+      for (const record of copies) {
+        if (fits()) break;
+        await this.serially(this.key(this.review, record.id), () =>
+          this.removeRecord(this.review, record),
+        );
+      }
+    }
+    if (fits()) return true;
+    this.options.log.warn(
+      { usedMb: Math.round((this.used ?? 0) / MB) },
+      'the kept screenshots fill their space; this one is not kept',
+    );
+    return false;
+  }
+
+  /** Counts both folders, a file with two links once, and indexes the held records. */
+  private async count(): Promise<void> {
+    let total = 0;
+    const seen = new Set<string>();
+    for (const folder of [this.held, this.review]) {
+      for (const name of await readdir(folder).catch(() => [] as string[])) {
+        const info = await stat(path.join(folder, name)).catch(() => undefined);
+        if (!info) continue;
+        const inode = `${info.dev}:${info.ino}`;
+        if (info.nlink > 1 && seen.has(inode)) continue;
+        seen.add(inode);
+        total += info.size;
+        if (folder === this.held && name.endsWith('.json')) {
+          const record = await this.read(folder, name.slice(0, -5));
+          if (record) this.index(record);
+        }
+      }
+    }
+    this.used = total;
+  }
+
+  private async removeRecord(folder: string, record: ScreenshotRecord): Promise<void> {
+    if (record.file) await this.remove(path.join(folder, record.file));
+    await this.remove(path.join(folder, `${record.id}.json`));
+    if (folder === this.held) this.plain.delete(record.id);
+  }
+
+  private grow(bytes: number): void {
+    if (this.used !== undefined) this.used = Math.max(0, this.used + bytes);
+  }
+
+  /** Removes a file; its bytes count as freed only when no other link holds them. */
+  private async remove(file: string): Promise<void> {
+    const info = await stat(file).catch(() => undefined);
+    await rm(file, { force: true });
+    if (info && info.nlink <= 1) this.grow(-info.size);
+  }
+
+  private key(folder: string, id: string): string {
+    return `${folder}\n${id}`;
+  }
+
+  private serially<T>(key: string, work: () => Promise<T>): Promise<T> {
+    const before = this.writing.get(key) ?? Promise.resolve();
+    const result = before.then(work, work);
+    const settled = result.catch(() => undefined);
+    this.writing.set(key, settled);
+    void settled.then(() => {
+      if (this.writing.get(key) === settled) this.writing.delete(key);
+    });
+    return result;
+  }
+
+  private async read(folder: string, id: string): Promise<ScreenshotRecord | undefined> {
+    const text = await readFile(path.join(folder, `${id}.json`), 'utf8').catch(() => undefined);
+    if (text === undefined) return undefined;
+    try {
+      const record = JSON.parse(text) as ScreenshotRecord;
+      return record.v === 1 && record.id === id ? record : undefined;
+    } catch {
+      return undefined;
+    }
+  }
+
+  /** Writes a record whole or not at all: to a file beside it, then renamed over it. */
+  private async write(folder: string, record: ScreenshotRecord): Promise<void> {
+    const target = path.join(folder, `${record.id}.json`);
+    const temporary = `${target}.${process.pid}.writing`;
+    const text = `${JSON.stringify(record, null, 2)}\n`;
+    const before = (await stat(target).catch(() => undefined))?.size ?? 0;
+    try {
+      await writeFile(temporary, text);
+      await rename(temporary, target);
+      this.grow(Buffer.byteLength(text) - before);
+    } finally {
+      await rm(temporary, { force: true });
+    }
+  }
+}
````

---

### Task 4: Reading a screenshot for Discord: the service, the rule of doubts, the words

Prototype commit: `abd7475740ed5ccc9b93e41600b259cc98b10d2f`

Reading a screenshot for Discord: ScreenshotService (ctx.screenshots)
downloads an attachment (AttachmentGateway, MAX_SCREENSHOT_BYTES), has it
read (a start deadline: it gives up as busy rather than outlast the
interaction), makes the report with the file name's time, applies what
the member typed (withTyped) and decides (decide): refuse a screen that
is no raid screen, has no gym or a raid already over; ask which gym when
it is not clear; otherwise report with what is known. It keeps the
screenshot (the reader's own report and what was typed apart; of the
status bar only the clock's lines; of a picture that is no raid screen
the record without the image or its texts). The pure rendering
(screenshot-reading.ts) words a reading, raw and as understood, its
doubts and refusals.

**Interfaces:**
- Consumes: Tasks 1 to 3.
- Produces: `ScreenshotService`, `Screenshots` (`read(source, where, typed?)`, `feedback`, `show`), `ScreenshotOutcome`, `ScreenshotSource`, `ScreenshotWhere`, `screenshotsOf`, `isImageAttachment`, `MAX_IMAGES_PER_MESSAGE`, `keptReading`, `unreadWords` (`src/services/screenshot-service.ts`); `decide`, `withTyped`, `ScreenshotDecision`, `ScreenshotRaid`, `DecideContext`, `TypedValues` (`src/domain/ocr/screenshot-decision.ts`); `readingLines`, `shortReading`, `doubtLines`, `doubtWords`, `refusalWords`, `GymNamer` (`src/render/screenshot-reading.ts`).

**Files:**

```
 src/app-context.ts                         |   3 +
 src/app.ts                                 |   8 ++
 src/domain/ocr/screenshot-decision.test.ts | 187 ++++++++++++++++++++++++++++++++++
 src/domain/ocr/screenshot-decision.ts      | 169 +++++++++++++++++++++++++++++++
 src/render/screenshot-reading.test.ts      |  87 ++++++++++++++++
 src/render/screenshot-reading.ts           | 144 ++++++++++++++++++++++++++
 src/services/ocr-service.test.ts           |  12 +++
 src/services/ocr-service.ts                |  13 ++-
 src/services/screenshot-context.ts         |   8 +-
 src/services/screenshot-service.test.ts    | 213 ++++++++++++++++++++++++++++++++++++++
 src/services/screenshot-service.ts         | 270 +++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/screenshot-service.ts         |  60 +++++++++++
 test/support/screenshots.ts                |  27 +++--
 test/support/test-context.ts               |   5 +
 14 files changed, 1197 insertions(+), 9 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/ocr/screenshot-decision.test.ts src/render/screenshot-reading.test.ts src/services/ocr-service.test.ts src/services/screenshot-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff abd7475740ed5ccc9b93e41600b259cc98b10d2f -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Reading a screenshot for Discord: the service, the rule of doubts, the words`, the body above and the trailer, staging exactly
  `src/app-context.ts src/app.ts src/domain/ocr/screenshot-decision.test.ts src/domain/ocr/screenshot-decision.ts src/render/screenshot-reading.test.ts src/render/screenshot-reading.ts src/services/ocr-service.test.ts src/services/ocr-service.ts src/services/screenshot-context.ts src/services/screenshot-service.test.ts src/services/screenshot-service.ts test/support/screenshot-service.ts test/support/screenshots.ts test/support/test-context.ts`.

````diff
diff --git a/src/app-context.ts b/src/app-context.ts
index d2a8ff272b9d6b6fa4a5cead396f20e3b0f9e7e4..16e9d0e363869c900f38f7ba8bbc2b740531c68f 100644
--- a/src/app-context.ts
+++ b/src/app-context.ts
@@ -30,6 +30,7 @@ import type { RegionProvider } from './services/region-directory.js';
 import type { SelfRoleService } from './services/self-role-service.js';
 import type { SpawnService } from './services/spawn-service.js';
 import type { ScreenshotReader } from './services/ocr-service.js';
+import type { Screenshots } from './services/screenshot-service.js';
 import type { MapProvider } from './services/static-maps.js';
 import type { TimedPartyService } from './services/timed-party-service.js';
 import type { TrainService } from './services/train-service.js';
@@ -104,6 +105,8 @@ export interface AppContext {
   readonly places: PlaceSearch;
   /** The screenshot reader (Phase 7): one screenshot at a time, in a process of its own. */
   readonly screenshotReader: ScreenshotReader;
+  /** Screenshots on Discord: read, decided on and kept, and what members say of them. */
+  readonly screenshots: Screenshots;
   /** Privileged-intent features actually granted at login (may be fewer than configured). */
   features: IntentFlags;
 }
diff --git a/src/app.ts b/src/app.ts
index 6c71885ac9c2ca3b193e3ba1bb3edb8247f670af..f4dbb27b503a4147440bf499f6627e0b78c7c471 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -55,6 +55,7 @@ import { ImageCache } from './services/image-cache.js';
 import { NotifyService } from './services/notify-service.js';
 import { OcrAssets } from './services/ocr-assets.js';
 import { OcrService } from './services/ocr-service.js';
+import { ScreenshotService } from './services/screenshot-service.js';
 import { ScreenshotStore } from './services/screenshot-store.js';
 import { PartyLines } from './services/party-lines.js';
 import { PartyScheduler } from './services/party-scheduler.js';
@@ -453,6 +454,13 @@ export async function startApp(
       log,
     }),
     screenshotReader,
+    // Screenshots from Discord: downloaded, read, decided on and kept.
+    screenshots: new ScreenshotService({
+      attachments,
+      reader: screenshotReader,
+      store: screenshotStore,
+      context: { raidBosses, raidEvents, gyms, regions, config },
+    }),
     features: requested,
   };
   // Read once, here: a species of `wildSpawnExceptions` that the game data does not know is
diff --git a/src/domain/ocr/screenshot-decision.test.ts b/src/domain/ocr/screenshot-decision.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..70bd5b5a4c49ef91f3c24984ba8a129dddf52e37
--- /dev/null
+++ b/src/domain/ocr/screenshot-decision.test.ts
@@ -0,0 +1,187 @@
+import { describe, expect, it } from 'vitest';
+import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
+import { decide as decideWith, withTyped, type DecideContext } from './screenshot-decision.js';
+import type { ReportDoubt, ScreenshotReport } from './screenshot-report.js';
+
+const YVELTAL = raidBossesFixture()
+  .bosses()
+  .find((boss) => boss.key === 'yveltal');
+
+function report(overrides: Partial<ScreenshotReport> = {}): ScreenshotReport {
+  return {
+    gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
+    stage: 'egg',
+    heads: 5,
+    tier: { level: 'T5', shadow: false },
+    tierFrom: 'heads',
+    cp: null,
+    bossName: null,
+    boss: null,
+    bossFrom: null,
+    eliteBadge: false,
+    purple: 0,
+    clock: { hour: 13, minute: 39 },
+    countdown: 600,
+    takenAt: 1_000,
+    timeFrom: 'clock',
+    time: { hatch: 601_000 },
+    doubts: [],
+    ...overrides,
+  };
+}
+
+const doubting = (...doubts: ReportDoubt[]) => report({ doubts });
+
+/** Uploaded at 2,000; T5 eggs hatch as Yveltal. */
+const CONTEXT: DecideContext = {
+  now: 2_000,
+  // A T5 raid lasts 45 minutes, an elite raid an hour.
+  hatchedMinutes: (tier) => (tier.level === 'Elite' ? 60 : 45),
+  autoset: (tier) => (tier.level === 'T5' ? YVELTAL : undefined),
+};
+const decide = (r: ScreenshotReport, context: Partial<DecideContext> = {}) =>
+  decideWith(r, { ...CONTEXT, ...context });
+
+describe('decide', () => {
+  it('reports an egg with its time unasked', () => {
+    expect(decide(report())).toEqual({
+      kind: 'report',
+      raid: {
+        gymId: 7,
+        tier: { level: 'T5', shadow: false },
+        boss: null,
+        hatched: false,
+        time: { hatch: 601_000 },
+        timeUncertain: false,
+      },
+      doubts: [],
+    });
+  });
+
+  it('refuses only a screen that is no raid’s, or one whose gym it does not know', () => {
+    expect(decide(doubting('not-a-raid-screen', 'no-gym'))).toEqual({
+      kind: 'refuse',
+      reason: 'not-a-raid-screen',
+    });
+    const noGym = report({
+      gym: { read: 'X', searched: null, gymId: null, place: null, clear: false },
+      doubts: ['no-gym'],
+    });
+    expect(decide(noGym)).toEqual({ kind: 'refuse', reason: 'no-gym' });
+  });
+
+  it('asks only which gym, when the gym is not clear', () => {
+    const unclear = report({
+      gym: { read: 'Plant', searched: 'Plant', gymId: 9, place: 'local', clear: false },
+      doubts: ['gym-unclear', 'time-guessed'],
+    });
+    expect(decide(unclear)).toEqual({ kind: 'ask', doubts: ['gym-unclear', 'time-guessed'] });
+  });
+
+  it('reports with what is known: a hatched raid without its boss, an unknown stage as an egg without a time', () => {
+    const noBoss = decide(
+      report({ stage: 'hatched', time: { end: 5 }, doubts: ['boss-unknown', 'heads-only'] }),
+    );
+    expect(noBoss).toMatchObject({
+      kind: 'report',
+      raid: { boss: null, hatched: true, time: { end: 5 } },
+      doubts: ['boss-unknown', 'heads-only'],
+    });
+    const noStage = decide(report({ stage: null, time: null, doubts: ['stage-unknown'] }));
+    expect(noStage).toMatchObject({ kind: 'report', raid: { hatched: false, time: undefined } });
+  });
+
+  it('leaves out a countdown too long, and says a guessed, stale or contested time is uncertain', () => {
+    expect(decide(doubting('countdown-long'))).toMatchObject({ raid: { time: undefined } });
+    for (const doubt of ['time-guessed', 'time-stale', 'time-sources-differ'] as const) {
+      expect(decide(doubting(doubt))).toMatchObject({
+        raid: { time: { hatch: 601_000 }, timeUncertain: true },
+      });
+    }
+  });
+
+  it('refuses a hatched raid that is over by its countdown', () => {
+    const over = report({ stage: 'hatched', time: { end: 1_500 }, doubts: ['time-past'] });
+    expect(decide(over)).toEqual({ kind: 'refuse', reason: 'raid-over' });
+  });
+
+  it('reports an egg past its hatch as hatched, its end certain, its boss as a hatch sets it', () => {
+    const hatched = report({ time: { hatch: 1_000 }, doubts: ['time-past'] });
+    expect(decide(hatched)).toMatchObject({
+      kind: 'report',
+      raid: {
+        hatched: true,
+        boss: { key: 'yveltal' },
+        time: { end: 1_000 + 45 * 60_000 },
+        timeUncertain: false,
+      },
+    });
+    // No boss certain for the tier: hatched without one.
+    expect(decide(hatched, { autoset: () => undefined })).toMatchObject({
+      raid: { hatched: true, boss: null },
+    });
+    // Its end has passed too: over.
+    expect(decide(hatched, { now: 1_000 + 46 * 60_000 })).toEqual({
+      kind: 'refuse',
+      reason: 'raid-over',
+    });
+  });
+
+  it('ends an egg past its hatch by its own tier, keeps a boss already named, and doubts a time it guessed', () => {
+    const elite = report({
+      tier: { level: 'Elite', shadow: false },
+      time: { hatch: 1_000 },
+      doubts: ['time-past'],
+    });
+    expect(decide(elite)).toMatchObject({ raid: { time: { end: 1_000 + 60 * 60_000 } } });
+    const named = report({
+      boss: YVELTAL ?? null,
+      time: { hatch: 1_000 },
+      doubts: ['time-past'],
+    });
+    expect(decide(named, { autoset: () => undefined })).toMatchObject({
+      raid: { boss: { key: 'yveltal' } },
+    });
+    for (const doubt of ['time-guessed', 'time-sources-differ'] as const) {
+      const guessed = report({ time: { hatch: 1_000 }, doubts: ['time-past', doubt] });
+      expect(decide(guessed)).toMatchObject({ raid: { hatched: true, timeUncertain: true } });
+    }
+  });
+
+  it('asks rather than report a raid without a tier', () => {
+    expect(decide(report({ tier: null, doubts: ['tier-unknown'] }))).toEqual({
+      kind: 'ask',
+      doubts: ['tier-unknown'],
+    });
+  });
+});
+
+describe('withTyped', () => {
+  it('takes the stage from a typed time when the screenshot did not tell it', () => {
+    const unknown = report({ stage: null, time: null, doubts: ['stage-unknown', 'no-time'] });
+    const egg = withTyped(unknown, { time: { hatch: 5_000 } });
+    expect(egg).toMatchObject({ stage: 'egg', doubts: [] });
+    expect(withTyped(unknown, { time: { end: 5_000 } }).stage).toBe('hatched');
+  });
+
+  it('takes what the member typed in the place of what was read, with its doubts', () => {
+    const read = report({
+      gym: { read: 'Plant', searched: 'Plant', gymId: 9, place: 'local', clear: false },
+      stage: 'hatched',
+      time: { end: 5 },
+      doubts: ['gym-unclear', 'boss-unknown', 'heads-only', 'time-guessed'],
+    });
+    const typed = withTyped(read, {
+      gymId: 7,
+      boss: { tier: { level: 'T5', shadow: false }, boss: YVELTAL ?? null, hatched: true },
+    });
+    expect(typed.doubts).toEqual(['time-guessed']);
+    expect(decide(typed)).toMatchObject({
+      kind: 'report',
+      raid: { gymId: 7, boss: { key: 'yveltal' }, hatched: true, timeUncertain: true },
+    });
+    const timed = withTyped(read, { gymId: 7, time: { end: 99 } });
+    expect(timed.doubts).toEqual(['boss-unknown', 'heads-only']);
+    expect(decide(timed)).toMatchObject({ raid: { time: { end: 99 }, timeUncertain: false } });
+  });
+});
diff --git a/src/domain/ocr/screenshot-decision.ts b/src/domain/ocr/screenshot-decision.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9f70e3660bfe0da60dddb2976071a183fbf831a7
--- /dev/null
+++ b/src/domain/ocr/screenshot-decision.ts
@@ -0,0 +1,169 @@
+import type { RaidBoss } from '../pogo/raid-bosses.js';
+import type { RaidTier } from '../pogo/raid-tier.js';
+import type { ReportDoubt, ScreenshotReport } from './screenshot-report.js';
+
+/**
+ * What Pine does with a screenshot it read (the rule of doubts, Matt 2026-10-14: the legacy bot
+ * made a raid even when nothing about the egg or boss could be told, and the reader is good at
+ * the rest). It refuses only a screen that is no raid's or a gym it does not know; it asks only
+ * which gym, when the gym read is not clear (a wrong gym is the one mistake members cannot
+ * easily mend); otherwise it reports the raid unasked with what is known, and the doubts that
+ * remain are what the "Screenshot feedback" button shows.
+ */
+export type ScreenshotDecision =
+  /** `raid-over`: by its countdown the raid has already ended. */
+  | { kind: 'refuse'; reason: 'not-a-raid-screen' | 'no-gym' | 'raid-over' }
+  /** The gym is not clear (or the tier, which a raid screen always has): the member chooses. */
+  | { kind: 'ask'; doubts: ReportDoubt[] }
+  | { kind: 'report'; raid: ScreenshotRaid; doubts: ReportDoubt[] };
+
+/** The raid a screenshot is reported as. */
+export interface ScreenshotRaid {
+  gymId: number;
+  tier: RaidTier;
+  /** Null for an egg, and for a hatched raid whose boss was not decided. */
+  boss: RaidBoss | null;
+  /** Seen hatched: with a boss, or without one when it was not decided. */
+  hatched: boolean;
+  /**
+   * When the egg hatches or the raid ends; undefined when the stage could not be told (reported
+   * as an egg without a time), or the time cannot be (already past, longer than a raid lasts).
+   */
+  time: { hatch: number } | { end: number } | undefined;
+  /**
+   * The time was guessed from the upload, the screenshot is older than it should be, or its
+   * file's name and its clock disagree.
+   */
+  timeUncertain: boolean;
+}
+
+/** What deciding needs besides the report. */
+export interface DecideContext {
+  /** When the screenshot was posted: what is over by then is over. */
+  now: number;
+  /**
+   * Minutes a raid of this tier lasts once hatched at this time (`raidDurationsAt` with the
+   * settings and the raid events: an elite raid, a Raid Hour).
+   */
+  hatchedMinutes: (tier: RaidTier, hatchTime: number) => number;
+  /** What an egg of a tier hatches as, when that is certain (`ctx.raidBosses.autoset`). */
+  autoset: (tier: RaidTier) => RaidBoss | undefined;
+}
+
+/** What a member typed beside a screenshot (`/raid`): it stands in the place of what was read. */
+export interface TypedValues {
+  gymId?: number;
+  /** A boss or an egg of a tier: `hatched` for a boss. */
+  boss?: { tier: RaidTier; boss: RaidBoss | null; hatched: boolean };
+  time?: { hatch: number } | { end: number };
+}
+
+const GYM_DOUBTS: readonly ReportDoubt[] = ['no-gym', 'gym-unclear'];
+const BOSS_DOUBTS: readonly ReportDoubt[] = [
+  'stage-unknown',
+  'tier-unknown',
+  'heads-unverified',
+  'heads-only',
+  'heads-uncertain',
+  'heads-boss-conflict',
+  'boss-unknown',
+  'boss-from-name',
+  'boss-name-differs',
+  'elite',
+  'shadow-unlisted',
+  'shadow-differs',
+];
+const TIME_DOUBTS: readonly ReportDoubt[] = [
+  'no-time',
+  'time-guessed',
+  'time-stale',
+  'time-sources-differ',
+  'time-past',
+  'countdown-long',
+];
+
+/**
+ * The report with what the member typed in the place of what was read: each typed element is
+ * taken as it is, and the doubts about it go. A screen that is no raid's stays one.
+ */
+export function withTyped(report: ScreenshotReport, typed: TypedValues): ScreenshotReport {
+  let changed = report;
+  const without = (doubts: readonly ReportDoubt[]) =>
+    changed.doubts.filter((doubt) => !doubts.includes(doubt));
+  if (typed.gymId !== undefined) {
+    changed = {
+      ...changed,
+      gym: { ...changed.gym, gymId: typed.gymId, place: 'local', clear: true },
+      doubts: without(GYM_DOUBTS),
+    };
+  }
+  if (typed.boss) {
+    changed = {
+      ...changed,
+      stage: typed.boss.hatched ? 'hatched' : 'egg',
+      tier: typed.boss.tier,
+      boss: typed.boss.boss,
+      doubts: without(BOSS_DOUBTS),
+    };
+  }
+  if (typed.time) {
+    // A typed time says the stage the screenshot did not: a hatch is an egg's, an end a raid's.
+    const stage = changed.stage ?? ('hatch' in typed.time ? 'egg' : 'hatched');
+    changed = {
+      ...changed,
+      stage,
+      time: typed.time,
+      doubts: without([...TIME_DOUBTS, 'stage-unknown']),
+    };
+  }
+  return changed;
+}
+
+const UNCERTAIN: readonly ReportDoubt[] = ['time-guessed', 'time-stale', 'time-sources-differ'];
+
+/**
+ * What to do with a report (see `ScreenshotDecision`). A time that has passed (Matt,
+ * 2026-10-14): a hatched raid's end means the raid is over (refused); an egg whose hatch has
+ * passed is reported hatched, ending its tier's length after its hatch (certain when the moment
+ * of the screenshot was known: then the countdown gave the hatch exactly), with the boss it was
+ * read with or the one a hatch would give it, and refused when that end has passed too. A countdown longer than a raid lasts is left out.
+ */
+export function decide(report: ScreenshotReport, context: DecideContext): ScreenshotDecision {
+  const { doubts } = report;
+  if (doubts.includes('not-a-raid-screen')) return { kind: 'refuse', reason: 'not-a-raid-screen' };
+  if (report.gym.gymId === null) return { kind: 'refuse', reason: 'no-gym' };
+  const past = doubts.includes('time-past') && report.time !== null;
+  if (past && report.time && 'end' in report.time) return { kind: 'refuse', reason: 'raid-over' };
+  let hatched = report.stage === 'hatched';
+  let boss = hatched ? report.boss : null;
+  let time = report.stage === null ? undefined : (report.time ?? undefined);
+  if (doubts.includes('countdown-long')) time = undefined;
+  if (past && report.time && 'hatch' in report.time) {
+    const { hatch } = report.time;
+    const minutes = report.tier ? context.hatchedMinutes(report.tier, hatch) : 0;
+    const end = hatch + minutes * 60_000;
+    if (end <= context.now) return { kind: 'refuse', reason: 'raid-over' };
+    hatched = true;
+    boss = report.boss ?? (report.tier ? (context.autoset(report.tier) ?? null) : null);
+    time = { end };
+  }
+  if (!report.gym.clear || report.tier === null) return { kind: 'ask', doubts };
+  // The countdown of an egg past its hatch gives the hatch exactly only when the moment of the
+  // screenshot is known (by its file or its clock), however long ago that was.
+  const unknownMoment = doubts.includes('time-guessed') || doubts.includes('time-sources-differ');
+  const uncertain =
+    time !== undefined &&
+    (past ? unknownMoment : doubts.some((doubt) => UNCERTAIN.includes(doubt)));
+  return {
+    kind: 'report',
+    raid: {
+      gymId: report.gym.gymId,
+      tier: report.tier,
+      boss,
+      hatched,
+      time,
+      timeUncertain: uncertain,
+    },
+    doubts,
+  };
+}
diff --git a/src/render/screenshot-reading.test.ts b/src/render/screenshot-reading.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5dd04d0f0033ded00b6974b03b30acf25684d85a
--- /dev/null
+++ b/src/render/screenshot-reading.test.ts
@@ -0,0 +1,87 @@
+import { describe, expect, it } from 'vitest';
+import type { StoredReport } from '../domain/ocr/screenshot-record.js';
+import { doubtWords, readingLines, refusalWords, shortReading } from './screenshot-reading.js';
+
+const NAMES: Record<number, string> = { 7: 'Heinz *Plant*' };
+const gymName = (id: number) => NAMES[id];
+
+function report(overrides: Partial<StoredReport> = {}): StoredReport {
+  return {
+    gym: { read: 'Heinz Plant`x', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
+    stage: 'hatched',
+    heads: 5,
+    tier: { level: 'T5', shadow: true },
+    tierFrom: 'boss',
+    cp: 47444,
+    bossName: 'Landorus',
+    boss: { key: 'landorus_incarnate', name: 'Landorus', tier: { level: 'T5', shadow: true } },
+    bossFrom: 'cp',
+    eliteBadge: false,
+    purple: 0.0832,
+    clock: { hour: 1, minute: 38 },
+    countdown: 31 * 60 + 2,
+    takenAt: 0,
+    timeFrom: 'clock',
+    time: { end: 1_800_000_000_000 },
+    doubts: [],
+    ...overrides,
+  };
+}
+
+describe('readingLines', () => {
+  it('shows each element as read and as understood, text read as code', () => {
+    expect(readingLines(report(), gymName)).toEqual([
+      "**Gym:** read `Heinz Plant'x` → **Heinz \\*Plant\\***",
+      '**Time:** clock `1:38`, countdown `0:31:02` → ends at <t:1800000000:t>',
+      '**Egg or hatched:** hatched',
+      '**Tier:** 5 heads → **Shadow T5**',
+      '**Boss:** CP `47444`, name read `Landorus` → **Landorus**',
+      '**Shadow purple:** 8.3% of the screen',
+    ]);
+  });
+
+  it('says what was not read, and the doubts in words', () => {
+    const lines = readingLines(
+      report({
+        gym: { read: null, searched: null, gymId: null, place: null, clear: false },
+        stage: 'egg',
+        heads: null,
+        tier: null,
+        clock: null,
+        countdown: null,
+        time: null,
+        doubts: ['no-gym', 'time-guessed'],
+      }),
+      gymName,
+    );
+    expect(lines.slice(0, 4)).toEqual([
+      '**Gym:** read nothing → no gym',
+      '**Time:** clock not read, countdown not read → no time (guessed from the upload)',
+      '**Egg or hatched:** an egg',
+      '**Tier:** no heads → no tier',
+    ]);
+    expect(lines.slice(-3)).toEqual([
+      'Not sure:',
+      `- ${doubtWords('no-gym')}`,
+      `- ${doubtWords('time-guessed')}`,
+    ]);
+  });
+});
+
+describe('shortReading', () => {
+  it('names the raid, the gym and the time in one line', () => {
+    expect(shortReading(report(), gymName)).toBe(
+      'Landorus (Shadow T5) at Heinz \\*Plant\\*, ending at <t:1800000000:t>',
+    );
+    expect(
+      shortReading(
+        report({ stage: 'egg', boss: null, time: { hatch: 1_800_000_000_000 } }),
+        gymName,
+      ),
+    ).toBe('Shadow T5 egg at Heinz \\*Plant\\*, hatching at <t:1800000000:t>');
+  });
+
+  it('words a refusal', () => {
+    expect(refusalWords({ kind: 'refuse', reason: 'no-gym' })).toMatch(/gym/);
+  });
+});
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1b07fbfec3ded112a2cd969881beb99a188ba4e9
--- /dev/null
+++ b/src/render/screenshot-reading.ts
@@ -0,0 +1,144 @@
+import type { ScreenshotDecision } from '../domain/ocr/screenshot-decision.js';
+import {
+  clockText,
+  countdownText,
+  type StoredDecision,
+  type StoredReport,
+} from '../domain/ocr/screenshot-record.js';
+import type { ReportDoubt } from '../domain/ocr/screenshot-report.js';
+import { raidTierLabel } from '../domain/pogo/raid-tier.js';
+import { plain, timestamp, truncate } from './text.js';
+
+/**
+ * What a screenshot showed Pine, in words: for `/read-screenshot`, the question of `/raid`, the
+ * answer to a mention and the "Screenshot feedback" button. Each element raw (as read) and as
+ * understood, so that a member can see where a mistake came from. Pure: the gym's name is given.
+ */
+
+/** The name of a gym by its id; undefined for one that no longer exists. */
+export type GymNamer = (gymId: number) => string | undefined;
+
+/** Text that was read off a member's screenshot, shown as code (so nothing in it is Markdown). */
+function quoted(text: string | null): string {
+  if (text === null || text.trim() === '') return 'nothing';
+  return `\`${truncate(text.replace(/`/g, "'"), 80)}\``;
+}
+
+/** The doubts in words, one short sentence each. */
+const DOUBT_WORDS: Readonly<Record<ReportDoubt, string>> = {
+  'not-a-raid-screen': 'This does not look like the screen of a raid.',
+  'no-gym': 'I found no gym of this server with that name.',
+  'gym-unclear': 'The gym’s name fits more than one gym, or only nearly.',
+  'no-time': 'I could not read the countdown.',
+  'time-guessed': 'The time is a guess from when the screenshot was posted: I found no clock.',
+  'time-stale': 'The screenshot was taken a while before it was posted.',
+  'time-sources-differ': 'The name of the file and the phone’s clock say different times.',
+  'time-past': 'The time it gives has already passed.',
+  'countdown-long': 'The countdown is longer than a raid or an egg lasts.',
+  'stage-unknown': 'I could not tell whether it is an egg or a hatched raid.',
+  'tier-unknown': 'I could not tell the tier.',
+  'heads-unverified': 'I have not seen that many tier heads on a screenshot before.',
+  'heads-only': 'The tier comes from the heads alone: the boss may hide one.',
+  'heads-uncertain': 'There may be a tier head I missed.',
+  'heads-boss-conflict': 'The boss I found is of another tier than the heads say.',
+  'boss-unknown': 'I could not tell the boss.',
+  'boss-from-name': 'The boss comes from its name alone; its CP fits no current boss.',
+  'boss-name-differs': 'The name under the CP is not the boss its CP belongs to.',
+  elite: 'It looks like an elite raid.',
+  'shadow-unlisted': 'No current boss of that tier is shadow (or plain) as this one looks.',
+  'shadow-differs': 'The boss’s shadow does not agree with the colour of the screen.',
+};
+
+export function doubtWords(doubt: string): string {
+  return DOUBT_WORDS[doubt as ReportDoubt] ?? doubt;
+}
+
+/** The doubts as a list, or nothing when there are none. */
+export function doubtLines(doubts: readonly string[]): string[] {
+  return doubts.map((doubt) => `- ${doubtWords(doubt)}`);
+}
+
+function gymLine(report: StoredReport, gymName: GymNamer): string {
+  const { gym } = report;
+  const found = gym.gymId === null ? undefined : gymName(gym.gymId);
+  const understood =
+    found === undefined ? 'no gym' : `**${plain(found)}**${gym.clear ? '' : ' (not sure)'}`;
+  return `**Gym:** read ${quoted(gym.read)} → ${understood}`;
+}
+
+function timeLine(report: StoredReport): string {
+  const clock = clockText(report.clock);
+  const countdown = countdownText(report.countdown);
+  const read = `clock ${clock === null ? 'not read' : `\`${clock}\``}, countdown ${
+    countdown === null ? 'not read' : `\`${countdown}\``
+  }`;
+  const { time } = report;
+  const understood =
+    time === null
+      ? 'no time'
+      : 'hatch' in time
+        ? `hatches at ${timestamp(time.hatch)}`
+        : `ends at ${timestamp(time.end)}`;
+  const guessed = report.doubts.includes('time-guessed') ? ' (guessed from the upload)' : '';
+  return `**Time:** ${read} → ${understood}${guessed}`;
+}
+
+function stageWords(report: StoredReport): string {
+  return report.stage === null ? 'cannot tell' : report.stage === 'egg' ? 'an egg' : 'hatched';
+}
+
+function tierLine(report: StoredReport): string {
+  const heads =
+    report.heads === null ? 'no heads' : `${report.heads} head${report.heads === 1 ? '' : 's'}`;
+  const tier = report.tier === null ? 'no tier' : `**${raidTierLabel(report.tier)}**`;
+  return `**Tier:** ${heads} → ${tier}`;
+}
+
+function bossLine(report: StoredReport): string {
+  const cp = report.cp === null ? 'no CP' : `CP \`${report.cp}\``;
+  const understood = report.boss ? `**${plain(report.boss.name)}**` : 'no boss';
+  return `**Boss:** ${cp}, name read ${quoted(report.bossName)} → ${understood}`;
+}
+
+/** Every element, raw and as understood, and what was not sure. */
+export function readingLines(report: StoredReport, gymName: GymNamer): string[] {
+  const lines = [
+    gymLine(report, gymName),
+    timeLine(report),
+    `**Egg or hatched:** ${stageWords(report)}`,
+    tierLine(report),
+  ];
+  if (report.stage !== 'egg') lines.push(bossLine(report));
+  lines.push(`**Shadow purple:** ${(report.purple * 100).toFixed(1)}% of the screen`);
+  if (report.doubts.length > 0) lines.push('', 'Not sure:', ...doubtLines(report.doubts));
+  return lines;
+}
+
+/** What the screenshot shows, in one line: `T5 egg at Heinz Plant, hatching at 13:49`. */
+export function shortReading(report: StoredReport, gymName: GymNamer): string {
+  const found = report.gym.gymId === null ? undefined : gymName(report.gym.gymId);
+  const what =
+    report.tier === null
+      ? 'A raid'
+      : report.boss && report.stage === 'hatched'
+        ? `${plain(report.boss.name)} (${raidTierLabel(report.tier)})`
+        : `${raidTierLabel(report.tier)} ${report.stage === 'hatched' ? 'raid' : 'egg'}`;
+  const where = found === undefined ? '' : ` at ${plain(found)}`;
+  const { time } = report;
+  const when =
+    time === null
+      ? ''
+      : 'hatch' in time
+        ? `, hatching at ${timestamp(time.hatch)}`
+        : `, ending at ${timestamp(time.end)}`;
+  return `${what}${where}${when}`;
+}
+
+/** Why a screenshot was not made into a raid. */
+export function refusalWords(
+  decision: Extract<ScreenshotDecision | StoredDecision, { kind: 'refuse' }>,
+): string {
+  return decision.reason === 'no-gym'
+    ? 'I could not find the gym of this screenshot among this server’s gyms.'
+    : 'This does not look like the screen of a raid, so I made nothing of it.';
+}
diff --git a/src/services/ocr-service.test.ts b/src/services/ocr-service.test.ts
index 3f64b08b30501164f65d7cb29c3983837e01f5e4..656a6887627ee910f8865b6c5ce18d7202a7b6d5 100644
--- a/src/services/ocr-service.test.ts
+++ b/src/services/ocr-service.test.ts
@@ -68,6 +68,18 @@ const alive = (pid: number) => {
 };
 
 describe('OcrService', () => {
+  it('answers busy for a screenshot whose turn comes too late to be answered', async () => {
+    const clock = { now: 1_000 };
+    const { ocr } = service({ now: () => clock.now });
+    expect(await ocr.read(bytes('late'), { startBy: 999 })).toEqual({ kind: 'busy' });
+    const first = ocr.read(bytes('one'));
+    const second = ocr.read(bytes('two'), { startBy: 1_500 });
+    clock.now = 2_000;
+    expect(gymOf(await first)).toBe('one');
+    expect(await second).toEqual({ kind: 'busy' });
+    expect(gymOf(await ocr.read(bytes('three'), { startBy: 3_000 }))).toBe('three');
+  });
+
   it('reads screenshots one after the other in one process, telling who waits how many are ahead', async () => {
     const { ocr } = service();
     const ahead: number[] = [];
diff --git a/src/services/ocr-service.ts b/src/services/ocr-service.ts
index 7a9c0485edf3c0688fc3dd488127a4b3aaa796c6..744c4948a65556fec9f181183c7b575b30e8243c 100644
--- a/src/services/ocr-service.ts
+++ b/src/services/ocr-service.ts
@@ -26,6 +26,11 @@ export const MAX_SCREENSHOT_BYTES = 32 * 1024 * 1024;
 export interface ReadOptions {
   /** Called once when the screenshot has to wait, with how many are ahead of it. */
   onQueued?: (ahead: number) => void;
+  /**
+   * A screenshot whose turn comes after this time (epoch milliseconds) is not read but answered
+   * `busy`: its interaction could no longer be answered when the reading was done.
+   */
+  startBy?: number;
 }
 
 /** Reading raid screenshots (Phase 7): one at a time, in a process of its own. */
@@ -104,6 +109,7 @@ export function workerEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
 
 interface Job {
   bytes: Uint8Array;
+  startBy: number | undefined;
   resolve: (outcome: OcrOutcome) => void;
 }
 
@@ -169,7 +175,7 @@ export class OcrService implements ScreenshotReader {
           this.options.log.error({ err }, 'a waiting screenshot could not be told so');
         }
       }
-      this.waiting.push({ bytes, resolve });
+      this.waiting.push({ bytes, startBy: options.startBy, resolve });
       void this.pump();
     });
   }
@@ -184,6 +190,11 @@ export class OcrService implements ScreenshotReader {
     if (this.busy) return;
     const job = this.waiting.shift();
     if (!job) return;
+    if (job.startBy !== undefined && this.now() > job.startBy) {
+      job.resolve({ kind: 'busy' });
+      void this.pump();
+      return;
+    }
     this.busy = true;
     clearTimeout(this.idleTimer);
     let outcome: OcrOutcome;
diff --git a/src/services/screenshot-context.ts b/src/services/screenshot-context.ts
index 7dd5ac642e178dbbc4c90ea4b38e7e44b60bd8e5..f6e813a1d4be8e7517de758ccfadd1f69adec2bd 100644
--- a/src/services/screenshot-context.ts
+++ b/src/services/screenshot-context.ts
@@ -1,5 +1,6 @@
 import type { AppContext } from '../app-context.js';
 import type { ReportContext } from '../domain/ocr/screenshot-report.js';
+import { takenAtFromFileName } from '../domain/ocr/file-time.js';
 import { gymInGuild } from './region-directory.js';
 
 /** How many hits of each search the report looks at: enough to see that one is not alone. */
@@ -10,14 +11,18 @@ const GYM_HITS = 3;
  * screenshot was posted (names only: what a raid screen shows; this server's gyms only, also
  * outside a region channel), the settings' time zone and durations. `channelId` is the region
  * channel (or null outside one), `guildRow` the server's row (`ctx.guilds.idFor`), `uploadedAt`
- * the time of the message or interaction that brought the screenshot.
+ * the time of the message or interaction that brought the screenshot, `fileName` the name of
+ * the screenshot's file (an Android phone names it by the moment it was taken).
  */
 export function reportContext(
   ctx: Pick<AppContext, 'raidBosses' | 'gyms' | 'regions' | 'config'>,
   where: { channelId: string | null; guildRow: number },
   uploadedAt: number,
+  fileName?: string,
 ): ReportContext {
   const { settings } = ctx.config;
+  const fileTakenAt =
+    fileName === undefined ? undefined : takenAtFromFileName(fileName, settings.timezone);
   return {
     bosses: ctx.raidBosses.bosses(),
     searchGym: (text) =>
@@ -31,5 +36,6 @@ export function reportContext(
     standardHatched: settings.standardRaidHatchedDuration,
     maxHatched: settings.maxRaidHatchedDuration,
     guessOffsetSeconds: settings.screenshotMessageOffsetTime,
+    ...(fileTakenAt === undefined ? {} : { fileTakenAt }),
   };
 }
diff --git a/src/services/screenshot-service.test.ts b/src/services/screenshot-service.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2491c54c4c5948babbb85e30c6d8b3c9dce897eb
--- /dev/null
+++ b/src/services/screenshot-service.test.ts
@@ -0,0 +1,213 @@
+import { DateTime } from 'luxon';
+import { describe, expect, it } from 'vitest';
+import { FAKE_GUILD_ID } from '../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../test/support/gyms.js';
+import { screenshotsWith } from '../../test/support/screenshot-service.js';
+import { eggReading, readingOf } from '../../test/support/screenshots.js';
+import { MAX_SCREENSHOT_BYTES } from './ocr-service.js';
+import {
+  isImageAttachment,
+  screenshotsOf,
+  unreadWords,
+  type ScreenshotWhere,
+} from './screenshot-service.js';
+
+const ZONE = 'America/New_York';
+const UPLOADED = DateTime.fromISO('2026-10-14T13:40:00', { zone: ZONE }).toMillis();
+const MEMBER = '700000000000000001';
+
+function where(more: Partial<ScreenshotWhere> = {}): ScreenshotWhere {
+  return {
+    guildId: FAKE_GUILD_ID,
+    guildRow: 1,
+    channelId: WEST_CHANNEL,
+    uploadedAt: UPLOADED,
+    use: 'raid',
+    senderId: MEMBER,
+    ...more,
+  };
+}
+
+describe('ScreenshotService', () => {
+  it('reads a screenshot, reports on it in the region, decides and keeps it', async () => {
+    const { screenshots, screenshot, files } = screenshotsWith();
+    const source = screenshot(
+      'egg.png',
+      eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600),
+    );
+    const outcome = await screenshots.read(source, where());
+    expect(outcome).toMatchObject({
+      kind: 'read',
+      report: { gym: { gymId: 2, clear: true }, stage: 'egg', tier: { level: 'T5' } },
+      decision: {
+        kind: 'report',
+        raid: { gymId: 2, hatched: false, timeUncertain: false },
+      },
+    });
+    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
+    expect(files('held')).toEqual([`${outcome.id}.json`, `${outcome.id}.png`]);
+    expect(files('review')).toEqual([]);
+    expect(await screenshots.get(outcome.id)).toMatchObject({ record: { use: 'raid' } });
+  });
+
+  it('takes the time from an Android file name', async () => {
+    const { screenshots, screenshot } = screenshotsWith();
+    const source = screenshot(
+      'Screenshot_20261014-133700.png',
+      eggReading('Old Stone Fountain', 5, null, 600),
+    );
+    const outcome = await screenshots.read(source, where());
+    expect(outcome).toMatchObject({
+      report: { takenAt: DateTime.fromISO('2026-10-14T13:37:00', { zone: ZONE }).toMillis() },
+      decision: { raid: { timeUncertain: false } },
+    });
+  });
+
+  it('puts in what the member typed, and keeps for review what it asks or refuses', async () => {
+    const { screenshots, screenshot, files } = screenshotsWith();
+    // Two gyms called Starbucks, outside a region channel (all of the server's gyms).
+    const unclear = screenshot('a.png', eggReading('Starbucks', 1, { hour: 13, minute: 39 }));
+    const asked = await screenshots.read(unclear, where({ channelId: null }));
+    expect(asked).toMatchObject({ decision: { kind: 'ask' } });
+    if (asked.kind !== 'read' || !asked.id) throw new Error('not kept');
+    expect(files('review')).toContain(`${asked.id}.json`);
+    const typed = await screenshots.read(unclear, where({ channelId: null, typed: { gymId: 5 } }));
+    expect(typed).toMatchObject({ decision: { kind: 'report', raid: { gymId: 5 } } });
+  });
+
+  it('keeps the reader’s own report apart from what the member typed, with where its time came from', async () => {
+    const { screenshots, screenshot } = screenshotsWith();
+    const unclear = screenshot(
+      'Screenshot_20261014-133800.png',
+      eggReading('Starbucks', 1, { hour: 13, minute: 39 }),
+    );
+    const outcome = await screenshots.read(
+      unclear,
+      where({ channelId: null, typed: { gymId: 5 } }),
+    );
+    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
+    expect(outcome.report.gym).toMatchObject({ gymId: 5, clear: true });
+    const kept = await screenshots.get(outcome.id);
+    expect(kept).toMatchObject({
+      record: {
+        report: { gym: { clear: false }, doubts: ['gym-unclear'] },
+        typed: { gymId: 5 },
+        decision: { kind: 'report' },
+        uploadedAt: UPLOADED,
+        fileTakenAt: DateTime.fromISO('2026-10-14T13:38:00', { zone: ZONE }).toMillis(),
+        timeFrom: 'file',
+      },
+    });
+    if (!kept || kept === 'gone') throw new Error('not kept');
+    expect(kept.record.bosses.length).toBeGreaterThan(0);
+  });
+
+  it('keeps of the status bar only a clock and short lines, never a notification', async () => {
+    const { screenshots, screenshot } = screenshotsWith();
+    const reading = eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600);
+    reading.status = [
+      { text: '13:39 5G', confidence: 0.9, box: { x0: 0, y0: 0, x1: 50, y1: 20 } },
+      {
+        text: 'Alice: are you coming to the raid?',
+        confidence: 0.9,
+        box: { x0: 60, y0: 0, x1: 500, y1: 20 },
+      },
+      {
+        text: 'Bob: meet at 12:30 by the park',
+        confidence: 0.9,
+        box: { x0: 60, y0: 0, x1: 500, y1: 20 },
+      },
+      { text: '76%', confidence: 0.9, box: { x0: 900, y0: 0, x1: 1000, y1: 20 } },
+    ];
+    const outcome = await screenshots.read(screenshot('egg.png', reading), where());
+    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
+    const kept = await screenshots.get(outcome.id);
+    if (!kept || kept === 'gone') throw new Error('not kept');
+    expect(kept.record.reading.status.map((line) => line.text)).toEqual(['13:39 5G', '76%']);
+  });
+
+  it('keeps of a picture that is no raid screen its record alone, without the text read', async () => {
+    const { screenshots, screenshot, files } = screenshotsWith();
+    const reading = readingOf({ gym: 'A private note' });
+    reading.status = [{ text: '13:39', confidence: 0.9, box: { x0: 0, y0: 0, x1: 50, y1: 20 } }];
+    const outcome = await screenshots.read(screenshot('cat.png', reading), where());
+    if (outcome.kind !== 'read' || !outcome.id) throw new Error('not kept');
+    expect(files('held')).toEqual([`${outcome.id}.json`]);
+    const kept = await screenshots.get(outcome.id);
+    if (!kept || kept === 'gone') throw new Error('not kept');
+    expect(kept.record.reading.lines).toEqual([
+      { text: '', confidence: 0.95, box: { x0: 100, y0: 150, x1: 900, y1: 220 } },
+    ]);
+    expect(kept.record.reading.status.map((line) => line.text)).toEqual(['']);
+    expect(JSON.stringify(kept.record)).not.toContain('A private note');
+  });
+
+  it('gives a screenshot up as busy when its turn comes too late', async () => {
+    const { screenshots, screenshot, reader } = screenshotsWith();
+    reader.lateAfter = 1_000;
+    const source = screenshot('q.png', eggReading('Old Stone Fountain', 1, null));
+    expect(await screenshots.read(source, where({ startBy: 999 }))).toEqual({ kind: 'busy' });
+    expect(await screenshots.read(source, where({ startBy: 1_001 }))).toMatchObject({
+      kind: 'read',
+    });
+  });
+
+  it('keeps nothing of a passive read it refused: that is a member’s ordinary picture', async () => {
+    const { screenshots, screenshot, files } = screenshotsWith();
+    const cat = screenshot('cat.jpg', readingOf({ gym: 'Old Stone Fountain' }));
+    const outcome = await screenshots.read(cat, where({ use: 'passive' }));
+    expect(outcome).toMatchObject({
+      kind: 'read',
+      id: undefined,
+      decision: { kind: 'refuse', reason: 'not-a-raid-screen' },
+    });
+    expect(files('held')).toEqual([]);
+  });
+
+  it('answers what kept it from reading: too large, the download, the reader', async () => {
+    const { screenshots, screenshot, attachments } = screenshotsWith();
+    const large = { ...screenshot('big.png', { kind: 'busy' }), size: MAX_SCREENSHOT_BYTES + 1 };
+    expect(await screenshots.read(large, where())).toEqual({ kind: 'too-large' });
+    expect(attachments.asked).toEqual([]);
+    expect(await screenshots.read(screenshot('busy.png', { kind: 'busy' }), where())).toEqual({
+      kind: 'busy',
+    });
+    attachments.failing = true;
+    expect(await screenshots.read(screenshot('x.png', { kind: 'busy' }), where())).toEqual({
+      kind: 'download-failed',
+    });
+    expect(unreadWords({ kind: 'busy' })).toMatch(/Too many screenshots are waiting/);
+  });
+
+  it('tells who waits how many are ahead', async () => {
+    const { screenshots, screenshot, reader } = screenshotsWith();
+    reader.ahead = 2;
+    const ahead: number[] = [];
+    await screenshots.read(
+      screenshot('q.png', eggReading('Old Stone Fountain', 1, null)),
+      where({ onQueued: (n) => ahead.push(n) }),
+    );
+    expect(ahead).toEqual([2]);
+  });
+});
+
+describe('screenshotsOf', () => {
+  it('takes pictures by their content type or, without one, their name; ten at most', () => {
+    const file = (name: string, contentType: string | null) => ({
+      url: `https://cdn.discordapp.com/${name}`,
+      name,
+      contentType,
+      size: 1,
+    });
+    expect(isImageAttachment(file('a.txt', 'image/png'))).toBe(true);
+    expect(isImageAttachment(file('a.png', 'text/plain'))).toBe(false);
+    expect(isImageAttachment(file('a.JPEG', null))).toBe(true);
+    expect(isImageAttachment(file('a.gif', null))).toBe(false);
+    const all = ['a.txt', ...Array.from({ length: 11 }, (_, i) => `${i}.png`)].map((n) =>
+      file(n, null),
+    );
+    expect(screenshotsOf(all).map((f) => f.name)).toEqual(
+      Array.from({ length: 10 }, (_, i) => `${i}.png`),
+    );
+  });
+});
diff --git a/src/services/screenshot-service.ts b/src/services/screenshot-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6d1ee2e0f177869cf137539d6b7a9ae457ca1690
--- /dev/null
+++ b/src/services/screenshot-service.ts
@@ -0,0 +1,270 @@
+import type { AppContext } from '../app-context.js';
+import {
+  decide,
+  withTyped,
+  type ScreenshotDecision,
+  type TypedValues,
+} from '../domain/ocr/screenshot-decision.js';
+import {
+  storedReport,
+  type Feedback,
+  type StoredReport,
+  type ScreenshotUse,
+  type StoredTyped,
+} from '../domain/ocr/screenshot-record.js';
+import { raidDurationKind, type RaidTier } from '../domain/pogo/raid-tier.js';
+import { raidDurationRules, raidDurationsAt } from '../domain/time/raid-durations.js';
+import type { TextLine } from '../domain/ocr/image.js';
+import type { ScreenReading } from '../ocr/screen-reader.js';
+import { screenshotReport, type ScreenshotReport } from '../domain/ocr/screenshot-report.js';
+import type { AttachmentGateway } from './attachment-gateway.js';
+import { MAX_SCREENSHOT_BYTES, type ScreenshotReader } from './ocr-service.js';
+import { reportContext } from './screenshot-context.js';
+import type { KeptScreenshot, ScreenshotKeeping } from './screenshot-store.js';
+
+/** The images of one message that are read, in order: as many as Discord allows a message. */
+export const MAX_IMAGES_PER_MESSAGE = 10;
+/** How long the download of one screenshot from Discord may take. */
+const DOWNLOAD_MS = 30_000;
+const IMAGE_NAME = /\.(?:png|jpe?g|webp)$/i;
+
+/** An attachment of a message or an interaction, as discord.js has it. */
+export interface ScreenshotSource {
+  url: string;
+  name: string;
+  contentType: string | null;
+  size: number;
+}
+
+/** Whether an attachment is a picture: by its content type, or by its name when it has none. */
+export function isImageAttachment(source: Pick<ScreenshotSource, 'name' | 'contentType'>): boolean {
+  return source.contentType
+    ? source.contentType.startsWith('image/')
+    : IMAGE_NAME.test(source.name);
+}
+
+/** The pictures of a message that are read: the first `MAX_IMAGES_PER_MESSAGE`, in order. */
+export function screenshotsOf<T extends ScreenshotSource>(attachments: Iterable<T>): T[] {
+  return [...attachments].filter(isImageAttachment).slice(0, MAX_IMAGES_PER_MESSAGE);
+}
+
+/** Where a screenshot came from and who sent it. */
+export interface ScreenshotWhere {
+  /** The server's snowflake and its row (`ctx.guilds.idFor`). */
+  guildId: string;
+  guildRow: number;
+  /** The region channel it was sent in (the gym search is that region's); null outside one. */
+  channelId: string | null;
+  /** When the message or interaction that brought it was made. */
+  uploadedAt: number;
+  use: ScreenshotUse;
+  senderId: string;
+  /** What the member typed beside it (`/raid`), in the place of what is read. */
+  typed?: TypedValues;
+  /** Told once when the screenshot has to wait, with how many are ahead. */
+  onQueued?: (ahead: number) => void;
+  /**
+   * A screenshot whose turn in the reader comes after this time is answered `busy` (its
+   * interaction could no longer be answered).
+   */
+  startBy?: number;
+}
+
+export type ScreenshotOutcome =
+  | {
+      kind: 'read';
+      /** The kept screenshot's id; undefined when it was not kept. */
+      id: string | undefined;
+      report: ScreenshotReport;
+      decision: ScreenshotDecision;
+    }
+  /** Larger than a screenshot can be. */
+  | { kind: 'too-large' }
+  /** The download from Discord failed. */
+  | { kind: 'download-failed' }
+  | { kind: 'not-an-image' }
+  | { kind: 'busy' }
+  | { kind: 'unavailable' }
+  | { kind: 'failed' };
+
+/** Screenshots on Discord: read, reported on, kept, and what members say of them. */
+export interface Screenshots {
+  read(source: ScreenshotSource, where: ScreenshotWhere): Promise<ScreenshotOutcome>;
+  /** The kept screenshot; `gone` when its file vanished. */
+  get(id: string): Promise<KeptScreenshot | 'gone' | undefined>;
+  /** A raid's post shows the screenshot: it is kept while the raid lasts. */
+  inUse(id: string): Promise<void>;
+  /** The gym the member chose when they were asked. */
+  picked(id: string, gymId: number): Promise<void>;
+  feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'>;
+}
+
+export interface ScreenshotServiceOptions {
+  attachments: AttachmentGateway;
+  reader: ScreenshotReader;
+  store: ScreenshotKeeping;
+  /** What the report needs of the bot: the bosses, the gyms, the regions, the settings. */
+  context: Pick<AppContext, 'raidBosses' | 'raidEvents' | 'gyms' | 'regions' | 'config'>;
+}
+
+/**
+ * A screenshot from Discord to what Pine makes of it: downloaded (`AttachmentGateway`, at most
+ * `MAX_SCREENSHOT_BYTES`), read (`ScreenshotReader`), reported on (`screenshotReport` in the
+ * channel's region, the time also from the file's name), what the member typed put in, decided
+ * (`decide`) and kept (`ScreenshotStore`). A passive read that was refused is not kept: it is a
+ * member's ordinary picture. Nothing about what a screenshot shows is logged.
+ */
+export class ScreenshotService implements Screenshots {
+  constructor(private readonly options: ScreenshotServiceOptions) {}
+
+  async read(source: ScreenshotSource, where: ScreenshotWhere): Promise<ScreenshotOutcome> {
+    const { attachments, reader, store, context } = this.options;
+    if (source.size > MAX_SCREENSHOT_BYTES) return { kind: 'too-large' };
+    const download = await attachments.download(source.url, {
+      maxBytes: MAX_SCREENSHOT_BYTES,
+      timeoutMs: DOWNLOAD_MS,
+    });
+    if (!download.ok) {
+      return download.reason === 'too-large' ? { kind: 'too-large' } : { kind: 'download-failed' };
+    }
+    const outcome = await reader.read(download.bytes, {
+      ...(where.onQueued ? { onQueued: where.onQueued } : {}),
+      ...(where.startBy === undefined ? {} : { startBy: where.startBy }),
+    });
+    if (outcome.kind !== 'read') return outcome;
+    const reportFrom = reportContext(
+      context,
+      { channelId: where.channelId, guildRow: where.guildRow },
+      where.uploadedAt,
+      source.name,
+    );
+    const read = screenshotReport(outcome.reading, reportFrom);
+    const { typed } = where;
+    const report = typed ? withTyped(read, typed) : read;
+    const { settings } = context.config;
+    const decision = decide(report, {
+      now: where.uploadedAt,
+      hatchedMinutes: (tier: RaidTier, hatchTime: number) =>
+        raidDurationsAt(
+          raidDurationKind(tier),
+          hatchTime,
+          raidDurationRules(settings, context.raidEvents.events()),
+        ).hatched,
+      autoset: (tier) => context.raidBosses.autoset(tier),
+    });
+    // A passive read that was refused is a member's ordinary picture: nothing is kept. A
+    // picture that is no raid screen keeps its record alone.
+    const passiveRefusal = where.use === 'passive' && decision.kind === 'refuse';
+    const image = !(decision.kind === 'refuse' && decision.reason === 'not-a-raid-screen');
+    const id = passiveRefusal
+      ? undefined
+      : await store.keep(
+          download.bytes,
+          {
+            guildId: where.guildId,
+            use: where.use,
+            senderId: where.senderId,
+            uploadedAt: where.uploadedAt,
+            fileTakenAt: reportFrom.fileTakenAt ?? null,
+            timeFrom: read.timeFrom,
+            reading: keptReading(outcome.reading, image),
+            // The reader's own report: it is judged by what it read, never by what was typed.
+            report: image ? storedReport(read) : withoutText(storedReport(read)),
+            typed: typed ? storedTyped(typed) : null,
+            decision: decision.kind === 'report' ? { kind: 'report' } : storedDecision(decision),
+            bosses: context.raidBosses
+              .bosses()
+              .map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier })),
+          },
+          image,
+        );
+    return { kind: 'read', id, report, decision };
+  }
+
+  get(id: string): Promise<KeptScreenshot | 'gone' | undefined> {
+    return this.options.store.get(id);
+  }
+
+  picked(id: string, gymId: number): Promise<void> {
+    return this.options.store.picked(id, gymId);
+  }
+
+  inUse(id: string): Promise<void> {
+    return this.options.store.inUse(id);
+  }
+
+  feedback(id: string, memberId: string, feedback: Feedback): Promise<'ok' | 'gone'> {
+    return this.options.store.feedback(id, memberId, feedback);
+  }
+}
+
+/** A status-bar line kept in a record: one that starts with a clock, or a short one. */
+const CLOCK_LIKE = /^\D{0,2}\d{1,2}[:.]\d{2}(?!\d)/;
+const SHORT_LINE = 8;
+
+/**
+ * The reading as it is kept: of the status bar's lines only those that start with a clock or are
+ * short (a notification's preview is somebody's message). Of a picture that is no raid screen
+ * (`raidScreen` false: a member's ordinary picture) no text at all: the lines keep their boxes
+ * and confidences.
+ */
+export function keptReading(reading: ScreenReading, raidScreen = true): ScreenReading {
+  const status = reading.status.filter(
+    (line) => CLOCK_LIKE.test(line.text) || line.text.length <= SHORT_LINE,
+  );
+  if (raidScreen) return { ...reading, status };
+  const blank = (line: TextLine): TextLine => ({ ...line, text: '' });
+  return {
+    ...reading,
+    text: { ...reading.text, gym: null, bossName: null },
+    lines: reading.lines.map(blank),
+    status: reading.status.map(blank),
+  };
+}
+
+/** The report of a picture that is no raid screen, without the texts read off it. */
+function withoutText(report: StoredReport): StoredReport {
+  return { ...report, gym: { ...report.gym, read: null, searched: null }, bossName: null };
+}
+
+function storedTyped(typed: TypedValues): StoredTyped {
+  return {
+    ...(typed.gymId === undefined ? {} : { gymId: typed.gymId }),
+    ...(typed.boss
+      ? {
+          boss: {
+            tier: typed.boss.tier,
+            key: typed.boss.boss?.key ?? null,
+            hatched: typed.boss.hatched,
+          },
+        }
+      : {}),
+    ...(typed.time ? { time: typed.time } : {}),
+  };
+}
+
+function storedDecision(
+  decision: Exclude<ScreenshotDecision, { kind: 'report' }>,
+): { kind: 'ask'; doubts: string[] } | { kind: 'refuse'; reason: string } {
+  return decision.kind === 'ask'
+    ? { kind: 'ask', doubts: [...decision.doubts] }
+    : { kind: 'refuse', reason: decision.reason };
+}
+
+/** What a member is told when a screenshot could not be read at all. */
+export function unreadWords(outcome: Exclude<ScreenshotOutcome, { kind: 'read' }>): string {
+  switch (outcome.kind) {
+    case 'too-large':
+      return 'That file is too large to be a screenshot.';
+    case 'download-failed':
+      return 'I could not download that screenshot from Discord. Try again in a moment.';
+    case 'not-an-image':
+      return 'That is not a screenshot I can read: send a PNG, JPEG or WebP of a phone’s screen.';
+    case 'busy':
+      return 'Too many screenshots are waiting to be read just now. Try again shortly.';
+    case 'unavailable':
+      return 'I cannot read screenshots at the moment. Report the raid with `/raid` and its options.';
+    case 'failed':
+      return 'Reading that screenshot went wrong. Try again, or report the raid with `/raid` and its options.';
+  }
+}
diff --git a/test/support/screenshot-service.ts b/test/support/screenshot-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e59902e83d155937fc0e94974f9380ef954cdeb9
--- /dev/null
+++ b/test/support/screenshot-service.ts
@@ -0,0 +1,60 @@
+import { mkdtempSync, readdirSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import type { AppContext } from '../../src/app-context.js';
+import type { ScreenReading } from '../../src/ocr/screen-reader.js';
+import type { OcrOutcome } from '../../src/services/ocr-service.js';
+import { ScreenshotService, type ScreenshotSource } from '../../src/services/screenshot-service.js';
+import { ScreenshotStore } from '../../src/services/screenshot-store.js';
+import { FakeAttachments } from './attachments.js';
+import { FakeScreenshotReader } from './screenshots.js';
+import { createTestContext } from './test-context.js';
+import { createTestLogger } from './test-logger.js';
+
+/**
+ * Screenshots for a test: the service over fake attachments, the fake reader and a store in a
+ * folder of its own under the system's temporary folder. `screenshot(name, answer)` gives an
+ * attachment whose download is a screenshot that reads as `answer`; `shown` is the set of
+ * screenshot ids active raids show (for the store's sweep); `files(folder)` lists `held` or
+ * `review`. The bosses, gyms and regions are the test context's, or those of `context`.
+ */
+export function screenshotsWith(
+  context: Pick<
+    AppContext,
+    'raidBosses' | 'raidEvents' | 'gyms' | 'regions' | 'config'
+  > = createTestContext().ctx,
+  now?: () => number,
+) {
+  const dir = mkdtempSync(path.join(tmpdir(), 'pine-screenshots-'));
+  const attachments = new FakeAttachments();
+  const reader = new FakeScreenshotReader();
+  const shown = new Set<string>();
+  const { log } = createTestLogger();
+  const store = new ScreenshotStore({
+    dir,
+    reviewDays: 30,
+    keepMegabytes: 2048,
+    reviewPerDay: 200,
+    shown: () => shown,
+    gymName: (id) => context.gyms.get(id)?.name,
+    log,
+    ...(now ? { now } : {}),
+  });
+  const screenshots = new ScreenshotService({ attachments, reader, store, context });
+  const screenshot = (
+    name: string,
+    answer: ScreenReading | OcrOutcome,
+    contentType: string | null = 'image/png',
+  ): ScreenshotSource => {
+    const bytes = reader.add(name, answer);
+    return { url: attachments.add(name, bytes), name, contentType, size: bytes.byteLength };
+  };
+  const files = (folder: 'held' | 'review') => {
+    try {
+      return readdirSync(path.join(dir, folder)).sort();
+    } catch {
+      return [];
+    }
+  };
+  return { screenshots, reader, attachments, store, shown, dir, screenshot, files };
+}
diff --git a/test/support/screenshots.ts b/test/support/screenshots.ts
index 3c62ead3e699fe1683cc96df319b3d3203775ce3..66781bb4a71974052d64ff24598fd2c42bae7bf4 100644
--- a/test/support/screenshots.ts
+++ b/test/support/screenshots.ts
@@ -67,27 +67,40 @@ export function eggReading(
   return readingOf({ gym, clock, countdown, countdownPlace: 'centre' }, { heads });
 }
 
+/** The first bytes of a PNG file: what a fake screenshot starts with, so that it is kept. */
+const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
+
+/** The bytes of a fake screenshot named `key`: a PNG's signature, then the key. */
+export function screenshotBytes(key: string): Uint8Array {
+  return Uint8Array.from([...PNG_SIGNATURE, ...new TextEncoder().encode(key)]);
+}
+
 /**
- * The reader of a test: a screenshot's bytes, read as text, name what it answers (`answers`,
- * a reading or another outcome); anything else is `not-an-image`. `reads` counts what was read,
- * `waiting` tells a reader with `ahead` set how many wait before it.
+ * The reader of a test: a screenshot's bytes (`screenshotBytes(key)`) name what it answers
+ * (`answers`, a reading or another outcome); anything else is `not-an-image`. `reads` counts
+ * what was read; with `ahead` set, every screenshot is told it waits behind that many; with
+ * `lateAfter`, a screenshot whose `startBy` is earlier is answered `busy`, as `OcrService` does.
  */
 export class FakeScreenshotReader implements ScreenshotReader {
   readonly answers = new Map<string, ScreenReading | OcrOutcome>();
   reads = 0;
-  /** When set, every screenshot waits behind this many (`onQueued`). */
   ahead: number | undefined;
+  /** When set, the time every screenshot's turn comes: one with an earlier `startBy` is busy. */
+  lateAfter: number | undefined;
 
-  /** Gives the bytes a screenshot named `key` is, and what reading them answers. */
+  /** What reading the screenshot named `key` answers; gives its bytes. */
   add(key: string, answer: ScreenReading | OcrOutcome): Uint8Array {
     this.answers.set(key, answer);
-    return new TextEncoder().encode(key);
+    return screenshotBytes(key);
   }
 
   read(bytes: Uint8Array, options: ReadOptions = {}): Promise<OcrOutcome> {
+    if (options.startBy !== undefined && this.lateAfter !== undefined) {
+      if (this.lateAfter > options.startBy) return Promise.resolve({ kind: 'busy' });
+    }
     this.reads++;
     if (this.ahead !== undefined) options.onQueued?.(this.ahead);
-    const answer = this.answers.get(new TextDecoder().decode(bytes));
+    const answer = this.answers.get(new TextDecoder().decode(bytes.subarray(PNG_SIGNATURE.length)));
     return new Promise((resolve) => {
       setImmediate(() => {
         if (answer === undefined) resolve({ kind: 'not-an-image' });
diff --git a/test/support/test-context.ts b/test/support/test-context.ts
index 239e599065998caec3795c68eec5d6eb110fbc9c..56d1a784b4f47e807d11df6af22d3a0e0063df02 100644
--- a/test/support/test-context.ts
+++ b/test/support/test-context.ts
@@ -11,6 +11,7 @@ import type { RaidBossAdmin } from '../../src/services/raid-boss-service.js';
 import type { PartyService } from '../../src/services/party-service.js';
 import type { RaidChangeService } from '../../src/services/raid-change-service.js';
 import type { RegionAdminService } from '../../src/services/region-admin-service.js';
+import type { Screenshots } from '../../src/services/screenshot-service.js';
 import type { SpawnService } from '../../src/services/spawn-service.js';
 import type { TimedPartyService } from '../../src/services/timed-party-service.js';
 import type { TrainService } from '../../src/services/train-service.js';
@@ -135,6 +136,10 @@ export function createTestContext(overrides: Partial<AppContext> = {}) {
     places: new FakePlaces(),
     // No screenshot can be read; a test passes a FakeScreenshotReader with its readings.
     screenshotReader: unavailableReader,
+    screenshots: unavailable<Screenshots>(
+      'screenshots',
+      'pass { screenshots } from screenshotsWith() (test/support/screenshot-service.ts)',
+    ),
     features: { ocrPassive: false, autoAssignRole: false },
     ...overrides,
   };
````

---

### Task 5: read-screenshot and the feedback controls

Prototype commit: `55ca27e09ca81fcfe31185798fe448020e7501aa`

/read-screenshot screenshot:<attachment>: a member command in servers,
deferred privately, 10 uses in 10 minutes; it answers what was read and
what Pine made of it, the doubts in words, and "All right" / "Something
is wrong". The second opens a form: a menu of the elements that were
wrong and a text of what they should be (at most 500 characters). The
custom-id kind shot belongs to these controls (and to the mention's gym
question of Task 8); "show" answers privately with the screenshot
attached. One feedback per member and screenshot; a later one replaces
it.

**Interfaces:**
- Consumes: Task 4.
- Produces: `readScreenshot` (command), `readAttached`, `waitingWords` (`src/commands/screenshots/read-screenshot.ts`); `screenshotControls`, `feedbackRow`, `showRow`, `feedbackForm`, `showScreenshot`, `decisionWords`, `GONE` (`src/commands/screenshots/feedback.ts`); `SHOT_KIND` (`shot-kind.ts`).

**Files:**

```
 src/commands/index.ts                            |   2 +
 src/commands/screenshots/feedback.ts             | 235 +++++++++++++++++++++++++++++++++++++++++++
 src/commands/screenshots/read-screenshot.test.ts | 188 ++++++++++++++++++++++++++++++++++
 src/commands/screenshots/read-screenshot.ts      | 113 +++++++++++++++++++++
 src/components/index.ts                          |   2 +
 src/render/screenshot-reading.test.ts            |   3 +-
 src/render/screenshot-reading.ts                 |  25 ++---
 test/support/fake-interactions.ts                |   7 +-
 8 files changed, 559 insertions(+), 16 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/screenshots/read-screenshot.test.ts src/render/screenshot-reading.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 55ca27e09ca81fcfe31185798fe448020e7501aa -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `read-screenshot and the feedback controls`, the body above and the trailer, staging exactly
  `src/commands/index.ts src/commands/screenshots/feedback.ts src/commands/screenshots/read-screenshot.test.ts src/commands/screenshots/read-screenshot.ts src/components/index.ts src/render/screenshot-reading.test.ts src/render/screenshot-reading.ts test/support/fake-interactions.ts`.

````diff
diff --git a/src/commands/index.ts b/src/commands/index.ts
index 43b5821827fb43e2ebca6f02f63308018c1b97df..6121c05a5a25139b3febdb0979d01c88d9b3b1f9 100644
--- a/src/commands/index.ts
+++ b/src/commands/index.ts
@@ -18,6 +18,7 @@ import { boss, moveset } from './raids/boss.js';
 import { location } from './raids/location.js';
 import { duration, end, hatch } from './raids/change.js';
 import { raid } from './raids/raid.js';
+import { readScreenshot } from './screenshots/read-screenshot.js';
 import { bounds } from './regions/bounds.js';
 import { region } from './regions/index.js';
 import { iam, iamnot } from './roles/iam.js';
@@ -39,6 +40,7 @@ import { rank } from './util/rank.js';
 export const commands: readonly CommandModule[] = [
   help,
   raid,
+  readScreenshot,
   train,
   meetup,
   join,
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
new file mode 100644
index 0000000000000000000000000000000000000000..308e7dc33d6c751b43b5cbf0fe146f2e2e6103ba
--- /dev/null
+++ b/src/commands/screenshots/feedback.ts
@@ -0,0 +1,235 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  MessageFlags,
+  TextInputStyle,
+  type APIActionRowComponent,
+  type APIComponentInMessageActionRow,
+  type APIModalInteractionResponseCallbackData,
+  type ButtonInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { ComponentHandler } from '../../discord/command.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { requireGuild } from '../../discord/guards.js';
+import { STALE_COMPONENT } from '../../discord/router.js';
+import { MEMBER_WRITE_THROTTLE } from '../../discord/throttle.js';
+import {
+  FEEDBACK_ELEMENTS,
+  MAX_CORRECTION,
+  type FeedbackElement,
+  type StoredDecision,
+} from '../../domain/ocr/screenshot-record.js';
+import { readingLines, refusalWords, type GymNamer } from '../../render/screenshot-reading.js';
+import { truncate } from '../../render/text.js';
+
+/**
+ * The custom-id kind of the controls about a screenshot. With a screenshot's id (12 characters):
+ * `shot:<id>:right` ("All right") and `shot:<id>:wrong` ("Something is wrong", which opens the
+ * form `shot:<id>:form`), and `shot:<id>:show` (the reporter's "Screenshot feedback", which
+ * shows the screenshot and what was read). With the token of a pending question (`PendingRequests`,
+ * 16 characters): the question about the gym of a screenshot a member mentioned the bot with
+ * (`src/commands/screenshots/mention.ts`).
+ */
+export const SHOT_KIND = 'shot';
+
+/** The ids of the form's two inputs. */
+const ELEMENTS_INPUT = 'elements';
+const CORRECTION_INPUT = 'correction';
+
+export const GONE = 'That screenshot is no longer kept.';
+
+const ELEMENT_LABELS: Readonly<Record<FeedbackElement, string>> = {
+  gym: 'Gym',
+  time: 'Time',
+  stage: 'Egg or hatched',
+  tier: 'Tier',
+  boss: 'Boss',
+};
+
+type Row = APIActionRowComponent<APIComponentInMessageActionRow>;
+
+function shotButton(
+  id: string,
+  action: string,
+  label: string,
+  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger,
+) {
+  return {
+    type: ComponentType.Button as const,
+    custom_id: encodeCustomId({ kind: SHOT_KIND, id, action }),
+    label,
+    style,
+  };
+}
+
+/** "All right" and "Something is wrong" under what was read. */
+export function feedbackRow(screenshotId: string): Row {
+  return {
+    type: ComponentType.ActionRow,
+    components: [
+      shotButton(screenshotId, 'right', 'All right', ButtonStyle.Success),
+      shotButton(screenshotId, 'wrong', 'Something is wrong', ButtonStyle.Secondary),
+    ],
+  };
+}
+
+/** The button of the reporter's private answer that shows the screenshot (R8). */
+export const SCREENSHOT_FEEDBACK_LABEL = 'Screenshot feedback';
+
+export function showRow(screenshotId: string): Row {
+  return {
+    type: ComponentType.ActionRow,
+    components: [
+      shotButton(screenshotId, 'show', SCREENSHOT_FEEDBACK_LABEL, ButtonStyle.Secondary),
+    ],
+  };
+}
+
+/** The form of "Something is wrong": which elements, and what they should be. */
+export function feedbackForm(screenshotId: string): APIModalInteractionResponseCallbackData {
+  return {
+    custom_id: encodeCustomId({ kind: SHOT_KIND, id: screenshotId, action: 'form' }),
+    title: 'What did I read wrong?',
+    components: [
+      {
+        type: ComponentType.Label,
+        label: 'Which parts are wrong?',
+        component: {
+          type: ComponentType.StringSelect,
+          custom_id: ELEMENTS_INPUT,
+          min_values: 1,
+          max_values: FEEDBACK_ELEMENTS.length,
+          options: FEEDBACK_ELEMENTS.map((element) => ({
+            label: ELEMENT_LABELS[element],
+            value: element,
+          })),
+        },
+      },
+      {
+        type: ComponentType.Label,
+        label: 'What should they be?',
+        component: {
+          type: ComponentType.TextInput,
+          custom_id: CORRECTION_INPUT,
+          style: TextInputStyle.Paragraph,
+          required: false,
+          max_length: MAX_CORRECTION,
+          placeholder: 'For example: the gym is Old Stone Fountain, the boss is Yveltal',
+        },
+      },
+    ],
+  };
+}
+
+/** The gym's name as members know it (its nickname first), by id. */
+export function gymNamerOf(ctx: Pick<AppContext, 'gyms'>): GymNamer {
+  return (id) => {
+    const gym = ctx.gyms.get(id);
+    return gym ? gym.nickname || gym.name : undefined;
+  };
+}
+
+/** What Pine did, or would do, with a screenshot, in one sentence. */
+export function decisionWords(decision: StoredDecision): string {
+  switch (decision.kind) {
+    case 'report':
+      return 'With a screenshot like this, I report the raid as above.';
+    case 'ask':
+      return 'With a screenshot like this, I ask which gym it is before I report the raid.';
+    case 'refuse':
+      return refusalWords(decision.reason);
+  }
+}
+
+/** A message's text stays within Discord's 2,000 characters. */
+const MESSAGE = 2_000;
+
+/**
+ * Shows a member privately the kept screenshot itself (so they can read what Pine could not),
+ * what was read and what Pine made of it, with "All right" and "Something is wrong". For the
+ * post's "Screenshot feedback" button and the reporter's.
+ */
+export async function showScreenshot(
+  interaction: ButtonInteraction,
+  ctx: AppContext,
+  screenshotId: string,
+): Promise<void> {
+  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
+  const kept = await ctx.screenshots.get(screenshotId);
+  // A screenshot of another server is none here: a custom id can be sent from anywhere.
+  if (!kept || kept === 'gone' || kept.record.guildId !== interaction.guildId) {
+    await interaction.editReply({ content: GONE });
+    return;
+  }
+  const { record } = kept;
+  const lines = [
+    ...readingLines(record.report, gymNamerOf(ctx)),
+    '',
+    decisionWords(record.decision),
+    record.file === null ? 'Is this what the picture shows?' : 'Is this what the screenshot shows?',
+  ];
+  await interaction.editReply({
+    content: truncate(lines.join('\n'), MESSAGE),
+    files:
+      kept.path === undefined || record.file === null
+        ? []
+        : [{ attachment: kept.path, name: record.file }],
+    components: [feedbackRow(screenshotId)],
+  });
+}
+
+const THANKS = 'Thank you: this helps me read screenshots better.';
+
+/** The controls of a screenshot: its feedback, and showing it. */
+export const screenshotControls: ComponentHandler = {
+  kind: SHOT_KIND,
+  guards: [requireGuild],
+  throttle: MEMBER_WRITE_THROTTLE,
+
+  async button(interaction, id, ctx) {
+    switch (id.action) {
+      case 'show':
+        return showScreenshot(interaction, ctx, id.id);
+      case 'right': {
+        const done = await ctx.screenshots.feedback(id.id, interaction.user.id, {
+          verdict: 'right',
+        });
+        await interaction.reply({
+          content: done === 'gone' ? GONE : THANKS,
+          flags: MessageFlags.Ephemeral,
+        });
+        return;
+      }
+      case 'wrong':
+        await interaction.showModal(feedbackForm(id.id));
+        return;
+      default:
+        throw new UserError(STALE_COMPONENT);
+    }
+  },
+
+  async modal(interaction, id, ctx) {
+    if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
+    const elements = interaction.fields
+      .getStringSelectValues(ELEMENTS_INPUT)
+      .filter((value): value is FeedbackElement =>
+        (FEEDBACK_ELEMENTS as readonly string[]).includes(value),
+      );
+    if (elements.length === 0) throw new UserError('Choose what was wrong.');
+    const correction = interaction.fields
+      .getTextInputValue(CORRECTION_INPUT)
+      .trim()
+      .slice(0, MAX_CORRECTION);
+    const done = await ctx.screenshots.feedback(id.id, interaction.user.id, {
+      verdict: 'wrong',
+      elements,
+      correction,
+    });
+    await interaction.reply({
+      content: done === 'gone' ? GONE : THANKS,
+      flags: MessageFlags.Ephemeral,
+    });
+  },
+};
diff --git a/src/commands/screenshots/read-screenshot.test.ts b/src/commands/screenshots/read-screenshot.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5f239fa93fe05b655c010952b6cf6a8caf96a673
--- /dev/null
+++ b/src/commands/screenshots/read-screenshot.test.ts
@@ -0,0 +1,188 @@
+import { readFileSync, rmSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import {
+  fakeButton,
+  fakeChatInput,
+  fakeModal,
+  sent,
+  type FakeInteraction,
+  type FakeOptions,
+} from '../../../test/support/fake-interactions.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { screenshotsWith } from '../../../test/support/screenshot-service.js';
+import { eggReading, readingOf } from '../../../test/support/screenshots.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import { InteractionRouter } from '../../discord/router.js';
+import type { ScreenReading } from '../../ocr/screen-reader.js';
+import type { OcrOutcome } from '../../services/ocr-service.js';
+import { screenshotControls } from './feedback.js';
+import { readScreenshot } from './read-screenshot.js';
+
+const MEMBER = '700000000000000001';
+const OTHER = '700000000000000002';
+
+function setup() {
+  const made = screenshotsWith();
+  const { ctx } = createTestContext({ screenshots: made.screenshots });
+  const router = new InteractionRouter(ctx, [readScreenshot], [screenshotControls]);
+  const handled = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const read = (name: string, answer: ScreenReading | OcrOutcome, extra: FakeOptions = {}) =>
+    handled(
+      fakeChatInput({
+        commandName: 'read-screenshot',
+        channelId: WEST_CHANNEL,
+        userId: MEMBER,
+        resolved: { screenshot: made.screenshot(name, answer) },
+        ...extra,
+      }),
+    );
+  const record = (id: string) =>
+    JSON.parse(readFileSync(path.join(made.dir, 'review', `${id}.json`), 'utf8')) as {
+      feedback: unknown[];
+      label?: unknown;
+    };
+  return { ...made, ctx, handled, read, record };
+}
+
+/** The id of the screenshot whose buttons are under an answer. */
+function shownId(payload: { components?: readonly unknown[] }): string {
+  const row = payload.components?.[0] as { components: { custom_id: string }[] } | undefined;
+  const id = row?.components[0]?.custom_id.split(':')[1];
+  if (!id) throw new Error('no buttons');
+  return id;
+}
+
+describe('/read-screenshot', () => {
+  it('shows what was read and what it makes of it, and creates nothing', async () => {
+    const { read, files } = setup();
+    const used = await read(
+      'egg.png',
+      eggReading('Old Stone Fountain', 5, { hour: 13, minute: 39 }, 600),
+    );
+    const answer = sent(used.editReply);
+    expect(answer.content).toContain('**Gym:** read `Old Stone Fountain` → **Old Stone Fountain**');
+    expect(answer.content).toContain('**Tier:** 5 heads → **T5**');
+    expect(answer.content).toContain('I report the raid as above');
+    const id = shownId(answer);
+    expect(answer.components).toEqual([
+      {
+        type: 1,
+        components: [
+          expect.objectContaining({ custom_id: `shot:${id}:right`, label: 'All right' }),
+          expect.objectContaining({ custom_id: `shot:${id}:wrong`, label: 'Something is wrong' }),
+        ],
+      },
+    ]);
+    expect(files('held')).toContain(`${id}.json`);
+  });
+
+  it('says why it could not read one, and refuses what is no raid', async () => {
+    const { read } = setup();
+    const busy = await read('busy.png', { kind: 'busy' });
+    expect(sent(busy.followUp).content).toMatch(/many screenshots/);
+    const cat = await read('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
+    expect(sent(cat.editReply).content).toContain('does not look like the screen of a raid');
+  });
+
+  it('records "All right" and "Something is wrong" with its form, one per member', async () => {
+    const { read, handled, record } = setup();
+    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
+    const id = shownId(sent(used.editReply));
+    const right = await handled(fakeButton({ customId: `shot:${id}:right`, userId: MEMBER }));
+    expect(sent(right.reply).content).toMatch(/Thank you/);
+    expect(record(id)).toMatchObject({ feedback: [{ verdict: 'right', by: 'reporter' }] });
+    expect(record(id).label).toBeDefined();
+
+    const wrong = await handled(fakeButton({ customId: `shot:${id}:wrong`, userId: OTHER }));
+    const form = wrong.showModal.mock.calls[0]?.[0] as { custom_id: string };
+    expect(form.custom_id).toBe(`shot:${id}:form`);
+    const sentForm = await handled(
+      fakeModal({
+        customId: `shot:${id}:form`,
+        userId: OTHER,
+        selected: { elements: ['gym', 'nonsense'] },
+        fields: { correction: '  It is the Library  ' },
+      }),
+    );
+    expect(sent(sentForm.reply).content).toMatch(/Thank you/);
+    expect(record(id).feedback).toMatchObject([
+      { verdict: 'right', by: 'reporter' },
+      { verdict: 'wrong', by: 'other', elements: ['gym'], correction: 'It is the Library' },
+    ]);
+    expect(record(id).label).toBeUndefined();
+  });
+
+  it('shows a screenshot only in its own server, and says so when its file has gone', async () => {
+    const { read, handled, dir } = setup();
+    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
+    const id = shownId(sent(used.editReply));
+    const elsewhere = await handled(
+      fakeButton({ customId: `shot:${id}:show`, guildId: '412345678901234599' }),
+    );
+    expect(sent(elsewhere.editReply).content).toBe('That screenshot is no longer kept.');
+    rmSync(path.join(dir, 'held', `${id}.png`));
+    const gone = await handled(fakeButton({ customId: `shot:${id}:show` }));
+    expect(sent(gone.editReply).content).toBe('That screenshot is no longer kept.');
+  });
+
+  it('shows what was read of a picture whose record alone is kept, without the picture', async () => {
+    const { read, handled } = setup();
+    const cat = await read('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
+    const id = shownId(sent(cat.editReply));
+    const show = await handled(fakeButton({ customId: `shot:${id}:show` }));
+    const answer = sent(show.editReply);
+    expect(answer.content).toContain('does not look like the screen of a raid');
+    expect(answer.files).toEqual([]);
+  });
+
+  it('gives up a screenshot whose turn would come too late to answer', async () => {
+    const { read, reader } = setup();
+    reader.lateAfter = Date.now() + 14 * 60_000;
+    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
+    expect(sent(used.followUp).content).toMatch(/Too many screenshots are waiting/);
+  });
+
+  it('says how many wait before the answer, never after it', async () => {
+    const { read, reader } = setup();
+    reader.ahead = 2;
+    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
+    const edits = used.editReply.mock.calls.map(
+      (call) => (call[0] as { content?: string }).content,
+    );
+    expect(edits[0]).toMatch(/2 screenshots are ahead of yours/);
+    expect(edits.at(-1)).toContain('**Gym:**');
+  });
+
+  it('answers feedback on a screenshot that is no longer kept', async () => {
+    const { handled } = setup();
+    const right = await handled(fakeButton({ customId: 'shot:AAAAAAAAAAAA:right' }));
+    expect(sent(right.reply).content).toBe('That screenshot is no longer kept.');
+    const show = await handled(fakeButton({ customId: 'shot:AAAAAAAAAAAA:show' }));
+    expect(sent(show.editReply).content).toBe('That screenshot is no longer kept.');
+  });
+
+  it('shows the screenshot itself with what was read', async () => {
+    const { read, handled } = setup();
+    const used = await read('egg.png', eggReading('Old Stone Fountain', 5, null, 600));
+    const id = shownId(sent(used.editReply));
+    const show = await handled(fakeButton({ customId: `shot:${id}:show`, userId: OTHER }));
+    const answer = sent(show.editReply);
+    expect(answer.content).toContain('Is this what the screenshot shows?');
+    expect(answer.files).toEqual([expect.objectContaining({ name: `${id}.png` })]);
+    expect(shownId(answer)).toBe(id);
+  });
+
+  it('is not offered when screenshots are not read', () => {
+    const { ctx } = createTestContext();
+    const off = {
+      ...ctx.config,
+      settings: { ...ctx.config.settings, ocr: { ...ctx.config.settings.ocr, enabled: false } },
+    };
+    expect(readScreenshot.enabled?.(off)).toBe(false);
+    expect(readScreenshot.enabled?.(ctx.config)).toBe(true);
+  });
+});
diff --git a/src/commands/screenshots/read-screenshot.ts b/src/commands/screenshots/read-screenshot.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9ba850e6402cec7ce99f009d3f1e4da7d473cbc8
--- /dev/null
+++ b/src/commands/screenshots/read-screenshot.ts
@@ -0,0 +1,113 @@
+import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { SimpleCommand } from '../../discord/command.js';
+import { UserError } from '../../discord/errors.js';
+import { guildIdOf, regionChannelOf, requireGuild } from '../../discord/guards.js';
+import { storedReport } from '../../domain/ocr/screenshot-record.js';
+import { readingLines } from '../../render/screenshot-reading.js';
+import { truncate } from '../../render/text.js';
+import {
+  unreadWords,
+  type ScreenshotOutcome,
+  type ScreenshotSource,
+  type ScreenshotWhere,
+} from '../../services/screenshot-service.js';
+import { decisionWords, feedbackRow, gymNamerOf } from './feedback.js';
+
+/** A message's text stays within Discord's 2,000 characters. */
+const MESSAGE = 2_000;
+/**
+ * A screenshot whose turn in the reader comes later than this after its interaction is given up
+ * as busy: the reading and the answer must fit into the fifteen minutes Discord allows.
+ */
+const START_BY_MS = 13 * 60_000;
+
+/** What `onQueued` says while a screenshot waits for the ones ahead of it. */
+export function waitingWords(ahead: number): string {
+  return ahead === 1
+    ? 'One screenshot is being read before yours. Yours is next.'
+    : `${ahead} screenshots are ahead of yours. I read them one at a time.`;
+}
+
+/**
+ * Reads a screenshot a command was given, for the member who gave it: the region of the channel
+ * (or the server's gyms outside one), the time of the interaction as the upload's, a line in the
+ * deferred answer while it waits. Throws a `UserError` for one that could not be read at all.
+ */
+export async function readAttached(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  source: ScreenshotSource,
+  more: Pick<ScreenshotWhere, 'use'> & Partial<Pick<ScreenshotWhere, 'typed'>>,
+): Promise<Extract<ScreenshotOutcome, { kind: 'read' }>> {
+  const guildId = guildIdOf(interaction);
+  const guildRow = await ctx.guilds.idFor(guildId);
+  if (guildRow === undefined) throw new UserError('This server is not set up for raids yet.');
+  // The line that says it waits is sent before the answer, never after it.
+  let waiting: Promise<unknown> = Promise.resolve();
+  const outcome = await ctx.screenshots.read(source, {
+    guildId,
+    guildRow,
+    channelId: regionChannelOf(interaction, ctx) ?? null,
+    uploadedAt: interaction.createdTimestamp,
+    senderId: interaction.user.id,
+    // Read later than this, the interaction could no longer be answered (fifteen minutes).
+    startBy: interaction.createdTimestamp + START_BY_MS,
+    onQueued: (ahead) => {
+      waiting = interaction.editReply({ content: waitingWords(ahead) }).catch((err: unknown) => {
+        ctx.log.warn({ err }, 'could not say that a screenshot waits');
+      });
+    },
+    ...more,
+  });
+  await waiting;
+  if (outcome.kind !== 'read') throw new UserError(unreadWords(outcome));
+  return outcome;
+}
+
+export const readScreenshot: SimpleCommand = {
+  data: new SlashCommandBuilder()
+    .setName('read-screenshot')
+    .setDescription('Show what I read on a raid screenshot, without reporting anything')
+    .addAttachmentOption((option) =>
+      option
+        .setName('screenshot')
+        .setDescription('A screenshot of a raid or an egg, as the game shows it')
+        .setRequired(true),
+    ),
+  help: {
+    category: 'raid-crud',
+    details:
+      'Reads the screenshot and tells you, privately, what I read on it and what I make of it: ' +
+      'the gym, the time, egg or hatched, the tier and the boss, each as read and as ' +
+      'understood. Nothing is reported. Tell me with the buttons whether I read it right: ' +
+      'screenshots with your answer are kept for a while to improve the reader. Outside a ' +
+      'region channel the gym is looked for among all of this server’s gyms.',
+    examples: ['/read-screenshot screenshot:(a raid screenshot)'],
+  },
+  enabled: (config) => config.settings.ocr.enabled,
+  guards: [requireGuild],
+  defer: 'ephemeral',
+  throttle: { uses: 10, perSeconds: 600 },
+
+  async execute(interaction, ctx) {
+    const attachment = interaction.options.getAttachment('screenshot', true);
+    const outcome = await readAttached(interaction, ctx, attachment, { use: 'read-screenshot' });
+    const decision =
+      outcome.decision.kind === 'report'
+        ? { kind: 'report' as const }
+        : outcome.decision.kind === 'ask'
+          ? { kind: 'ask' as const, doubts: outcome.decision.doubts }
+          : outcome.decision;
+    const lines = [
+      ...readingLines(storedReport(outcome.report), gymNamerOf(ctx)),
+      '',
+      decisionWords(decision),
+      ...(outcome.id === undefined ? [] : ['Did I read it right?']),
+    ];
+    await interaction.editReply({
+      content: truncate(lines.join('\n'), MESSAGE),
+      components: outcome.id === undefined ? [] : [feedbackRow(outcome.id)],
+    });
+  },
+};
diff --git a/src/components/index.ts b/src/components/index.ts
index c22f45d562f86a34e6ad2477a9414c28f323841a..06571189cb53dd2560cca61edc92a5be4c53fc1f 100644
--- a/src/components/index.ts
+++ b/src/components/index.ts
@@ -6,6 +6,7 @@ import { wantControls } from '../commands/notifications/wants.js';
 import { locationControls } from '../commands/raids/location.js';
 import { raidControls } from '../commands/raids/raid.js';
 import { roleControls } from '../commands/roles/menus.js';
+import { screenshotControls } from '../commands/screenshots/feedback.js';
 import type { ComponentHandler } from '../discord/command.js';
 import { dmControls } from './dm.js';
 import { partyButtons } from './party.js';
@@ -23,4 +24,5 @@ export const components: readonly ComponentHandler[] = [
   roleControls,
   gymControls,
   regionControls,
+  screenshotControls,
 ];
diff --git a/src/render/screenshot-reading.test.ts b/src/render/screenshot-reading.test.ts
index 5dd04d0f0033ded00b6974b03b30acf25684d85a..f09891b5b1b739cf9d29fd5b47fa576a37467690 100644
--- a/src/render/screenshot-reading.test.ts
+++ b/src/render/screenshot-reading.test.ts
@@ -82,6 +82,7 @@ describe('shortReading', () => {
   });
 
   it('words a refusal', () => {
-    expect(refusalWords({ kind: 'refuse', reason: 'no-gym' })).toMatch(/gym/);
+    expect(refusalWords('no-gym')).toMatch(/gym/);
+    expect(refusalWords('raid-over')).toBe('By its countdown this raid has already ended.');
   });
 });
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
index 1b07fbfec3ded112a2cd969881beb99a188ba4e9..706b23f64d131f92effdb688202083640b66a97f 100644
--- a/src/render/screenshot-reading.ts
+++ b/src/render/screenshot-reading.ts
@@ -1,10 +1,4 @@
-import type { ScreenshotDecision } from '../domain/ocr/screenshot-decision.js';
-import {
-  clockText,
-  countdownText,
-  type StoredDecision,
-  type StoredReport,
-} from '../domain/ocr/screenshot-record.js';
+import { clockText, countdownText, type StoredReport } from '../domain/ocr/screenshot-record.js';
 import type { ReportDoubt } from '../domain/ocr/screenshot-report.js';
 import { raidTierLabel } from '../domain/pogo/raid-tier.js';
 import { plain, timestamp, truncate } from './text.js';
@@ -134,11 +128,14 @@ export function shortReading(report: StoredReport, gymName: GymNamer): string {
   return `${what}${where}${when}`;
 }
 
-/** Why a screenshot was not made into a raid. */
-export function refusalWords(
-  decision: Extract<ScreenshotDecision | StoredDecision, { kind: 'refuse' }>,
-): string {
-  return decision.reason === 'no-gym'
-    ? 'I could not find the gym of this screenshot among this server’s gyms.'
-    : 'This does not look like the screen of a raid, so I made nothing of it.';
+/** Why a screenshot was not made into a raid (`refuse`'s reason). */
+export function refusalWords(reason: string): string {
+  switch (reason) {
+    case 'no-gym':
+      return 'I could not find the gym of this screenshot among this server’s gyms.';
+    case 'raid-over':
+      return 'By its countdown this raid has already ended.';
+    default:
+      return 'This does not look like the screen of a raid, so I made nothing of it.';
+  }
 }
diff --git a/test/support/fake-interactions.ts b/test/support/fake-interactions.ts
index 8dee77d93579badfd4a58d6e2ef41c99262e7867..df793f3b857c88ca5aa101d5962b1839b2594bc3 100644
--- a/test/support/fake-interactions.ts
+++ b/test/support/fake-interactions.ts
@@ -88,6 +88,8 @@ export interface FakeOptions {
   values?: string[];
   /** Modal: the text typed into each input, by the input's custom id. */
   fields?: Record<string, string>;
+  /** Modal: what was chosen in each select menu of the form, by the menu's custom id. */
+  selected?: Record<string, string[]>;
   /**
    * Modal: the form was opened by a slash command, not by a control of a message
    * (`isFromMessage()` is then false: there is no message to update).
@@ -340,7 +342,10 @@ function base(kind: Kind, o: FakeOptions) {
       getFocused: (full?: boolean) =>
         full ? { name: o.focusedName ?? 'option', value: o.focused ?? '' } : (o.focused ?? ''),
     },
-    fields: { getTextInputValue: (id: string) => o.fields?.[id] ?? '' },
+    fields: {
+      getTextInputValue: (id: string) => o.fields?.[id] ?? '',
+      getStringSelectValues: (id: string) => o.selected?.[id] ?? [],
+    },
     // As in discord.js, these are async: a refusal rejects.
     reply: vi.fn((payload: SentPayload) => {
       const refused = refuseIfAcknowledged();
````

---

### Task 6: A raid remembers its screenshot: state document version 8

Prototype commit: `e13e07392573f3a8a43ccdfdacbaccfd5d6468e8`

A raid remembers its screenshot: RaidDetails.screenshot { id (null when
it could not be kept), timeUncertain } in state document version 8
(versions 1 to 7 are read with none). While the time is uncertain the
post says it is a guess from the screenshot; /hatch, /end and "Set time"
confirm it (timeConfirmed in RaidChangeService), /duration and a new
boss do not. A move to another region carries it.

**Interfaces:**
- Produces: `RaidScreenshot`, `RaidDetails.screenshot` (`src/domain/party/party.ts`); the v8 state document (`party-state.ts`); `RaidReport.screenshot?` (`party-service.ts`).

**Files:**

```
 src/app.ts                           | 11 +++++++-
 src/domain/party/party-state.test.ts | 27 +++++++++++++++++---
 src/domain/party/party-state.ts      | 76 +++++++++++++++++++++++++++++++++++++++++++++-----------
 src/domain/party/party.ts            | 13 ++++++++++
 src/domain/party/raid.test.ts        | 30 ++++++++++++++++++++++
 src/domain/party/raid.ts             | 12 +++++++++
 src/domain/party/relocate.test.ts    |  5 ++++
 src/render/raid-post.test.ts         | 17 +++++++++++++
 src/render/raid-post.ts              | 12 +++++++++
 src/services/raid-change-service.ts  | 11 +++++---
 10 files changed, 192 insertions(+), 22 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/party/party-state.test.ts src/domain/party/raid.test.ts src/domain/party/relocate.test.ts src/render/raid-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff e13e07392573f3a8a43ccdfdacbaccfd5d6468e8 -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `A raid remembers its screenshot: state document version 8`, the body above and the trailer, staging exactly
  `src/app.ts src/domain/party/party-state.test.ts src/domain/party/party-state.ts src/domain/party/party.ts src/domain/party/raid.test.ts src/domain/party/raid.ts src/domain/party/relocate.test.ts src/render/raid-post.test.ts src/render/raid-post.ts src/services/raid-change-service.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index f4dbb27b503a4147440bf499f6627e0b78c7c471..ed25a35f16cc4f0395a651f7554b280b3ac33da0 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -36,6 +36,7 @@ import { DiscordRoleGateway } from './discord/role-gateway.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
+import { isRaid } from './domain/party/party.js';
 import { formReader } from './domain/pogo/wants.js';
 import { createLogger, type Logger } from './log.js';
 import { AccessService } from './services/access-service.js';
@@ -342,7 +343,15 @@ export async function startApp(
     keepMegabytes: config.settings.ocr.keepMegabytes,
     reviewPerDay: config.settings.ocr.reviewPerDay,
     gymName: (id) => gyms.get(id)?.name,
-    shown: () => new Set(),
+    // A raid's screenshot is kept while the raid is active, for its "Screenshot feedback" button.
+    shown: () =>
+      new Set(
+        parties
+          .active()
+          .flatMap((party) =>
+            isRaid(party) && party.raid.screenshot?.id ? [party.raid.screenshot.id] : [],
+          ),
+      ),
     log,
   });
   const scheduler = new PartyScheduler({
diff --git a/src/domain/party/party-state.test.ts b/src/domain/party/party-state.test.ts
index e70ee9f6537d2f5b5bfe7b1e876477f86bb5e26e..e0344fcc3d3385fd34329ed092140cc0dc1f90b9 100644
--- a/src/domain/party/party-state.test.ts
+++ b/src/domain/party/party-state.test.ts
@@ -138,7 +138,7 @@ describe('party state', () => {
       party: { ...raid, raid: { ...raid.raid, tier: { level: 'Elite', shadow: false } } },
     });
     // Nothing was added to the document for it: the version is what it was.
-    expect(document.v).toBe(7);
+    expect(document.v).toBe(8);
     // There were no shadow EX raids, and there are no shadow elite raids: still refused.
     const shadow = { ...document, raid: { ...document.raid, tier: { level: 'EX', shadow: true } } };
     expect(partyFromStored(columnsOf(raid), shadow, stored(raid.mirrorMessages))).toMatchObject({
@@ -153,7 +153,7 @@ describe('party state', () => {
 
   it('stores the version, and neither the columns nor a name for a known boss', () => {
     const state = partyState(fullRaid());
-    expect(state.v).toBe(7);
+    expect(state.v).toBe(8);
     expect(Object.keys(state).sort()).toEqual([
       'anonymous',
       'attendees',
@@ -175,6 +175,27 @@ describe('party state', () => {
     expect(back.ok && Object.keys(back.party.attendees)).toEqual(order);
   });
 
+  it('keeps the screenshot of a raid, and reads a version 7 document as a raid without one', () => {
+    const plain = testRaid();
+    const raid = {
+      ...plain,
+      raid: { ...plain.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true } },
+    };
+    const back = partyFromStored(columnsOf(raid), stored(partyState(raid)), []);
+    expect(back).toEqual({ ok: true, party: raid });
+    const v7 = stored(partyState(plain)) as { v: number; raid: Record<string, unknown> };
+    const { screenshot: _none, ...older } = v7.raid;
+    expect(partyFromStored(columnsOf(plain), { ...v7, v: 7, raid: older }, [])).toEqual({
+      ok: true,
+      party: plain,
+    });
+    const odd = {
+      ...plain,
+      raid: { ...plain.raid, screenshot: { id: '../x', timeUncertain: false } },
+    };
+    expect(() => partyState(odd)).toThrow(/cannot be stored/);
+  });
+
   it('keeps a boss known only by the name of the feed', () => {
     const raid = testRaid({ boss: { name: 'Newmon' } });
     const back = partyFromStored(columnsOf(raid), stored(partyState(raid)), []);
@@ -193,7 +214,7 @@ describe('party state', () => {
     expect(problem(state, { ...columns, type: 'train' })).toBe(
       'a train without its name and start',
     );
-    expect(problem({ ...state, v: 8 })).toMatch(/^state: /);
+    expect(problem({ ...state, v: 9 })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: undefined })).toMatch(/^state: /);
     expect(problem({ ...state, prompts: { completion: ['x'], warning: null } })).toMatch(
       /^state: /,
diff --git a/src/domain/party/party-state.ts b/src/domain/party/party-state.ts
index 3d12c63919c9836c977430b2a537acb9a1751056..3d2e7f95e1e5d6aba8dab72136028c2eadcfa6ae 100644
--- a/src/domain/party/party-state.ts
+++ b/src/domain/party/party-state.ts
@@ -33,10 +33,12 @@ import { PartyStatus } from './status.js';
  * and its boss): a train is `timed` and `train`. Version 6 (plan 3C) added a train's
  * `finishedFrom` (the stop its route was finished from); a train of a version 5 document
  * remembers none. Version 7 added `makerName` (the display name of the member who made the
- * party), which a document of an earlier version does not have. Documents of versions 1 to 3 are those of raids, and one of version 4 is that
- * of a raid or a meetup.
+ * party), which a document of an earlier version does not have. Version 8 (plan 7B) added a
+ * raid's `screenshot` (the screenshot it was reported from, and whether its time is a guess); a
+ * raid of an earlier document has none. Documents of versions 1 to 3 are those of raids, and one
+ * of version 4 is that of a raid or a meetup.
  */
-export const PARTY_STATE_VERSION = 7;
+export const PARTY_STATE_VERSION = 8;
 
 const snowflake = z.string().regex(/^\d{15,20}$/);
 const time = z.number().int().nonnegative();
@@ -105,7 +107,8 @@ const bossRef = z.union([
   z.object({ name: z.string().min(1) }),
 ]);
 
-const raid = z.object({
+/** A raid's details as versions 1 to 7 wrote them: without a screenshot. */
+const raidV7 = z.object({
   tier,
   boss: bossRef.nullable(),
   reportedHatched: z.boolean(),
@@ -115,6 +118,18 @@ const raid = z.object({
   stageSeen: z.enum(['egg', 'hatched', 'ended']),
 });
 
+const raid = raidV7.extend({
+  screenshot: z
+    .object({
+      id: z
+        .string()
+        .regex(/^[A-Za-z0-9_-]{12}$/)
+        .nullable(),
+      timeUncertain: z.boolean(),
+    })
+    .nullable(),
+});
+
 const timed = z.object({
   name: z.string().min(1).max(MAX_PARTY_NAME),
   startTime: time.nullable(),
@@ -191,17 +206,19 @@ function inconsistencies(value: {
   return problems;
 }
 
+/** What documents of versions 1 to 7 share; a raid's details without a screenshot. */
 const shared = {
   anonymous: z.boolean(),
   groups: z.array(group).min(1).max(GROUP_IDS.length),
   defaultGroupId: groupId,
-  raid: raid.optional(),
+  raid: raidV7.optional(),
 };
 
 const state = z
   .object({
     v: z.literal(PARTY_STATE_VERSION),
     ...shared,
+    raid: raid.optional(),
     makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
     timed: timed.optional(),
     meetup: meetup.optional(),
@@ -217,6 +234,22 @@ const state = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** Version 7, as plans 4A to 7A wrote it: read only. It is version 8 without a screenshot. */
+const stateV7 = z
+  .object({
+    v: z.literal(7),
+    ...shared,
+    makerName: z.string().min(1).max(MAX_MEMBER_NAME).optional(),
+    timed: timed.optional(),
+    meetup: meetup.optional(),
+    train: train.optional(),
+    attendees: z.array(attendee.extend({ id: snowflake })),
+    prompts,
+  })
+  .superRefine((value, context) => {
+    for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
+  });
+
 /** Version 6, as plan 3C wrote it: read only. It is version 7 without the maker's name. */
 const stateV6 = z
   .object({
@@ -299,25 +332,38 @@ const stateV2 = z
     for (const message of inconsistencies(value)) context.addIssue({ code: 'custom', message });
   });
 
+/** A raid of a document before version 8 had no screenshot. */
+function withScreenshot<T extends { raid?: z.output<typeof raidV7> | undefined }>(old: T) {
+  return old.raid ? { ...old, raid: { ...old.raid, screenshot: null } } : old;
+}
+
 /** Reads a stored document of any version this code knows, as the current version. */
 function readState(stored: unknown) {
   const version =
     typeof stored === 'object' && stored !== null && 'v' in stored ? stored.v : undefined;
+  if (version === PARTY_STATE_VERSION) return state.safeParse(stored);
+  const older = readOlderState(stored, version);
+  if (!older.success) return older;
+  return state.safeParse({ ...withScreenshot(older.data), v: PARTY_STATE_VERSION });
+}
+
+/** Reads a document of versions 1 to 7, upgraded to the shape of version 7. */
+function readOlderState(stored: unknown, version: unknown) {
   if (version === 1) {
     const old = stateV1.safeParse(stored);
     if (!old.success) return old;
-    return state.safeParse({
+    return stateV7.safeParse({
       ...old.data,
-      v: PARTY_STATE_VERSION,
+      v: 7,
       prompts: { completion: [], warning: null },
     });
   }
   if (version === 2) {
     const old = stateV2.safeParse(stored);
     if (!old.success) return old;
-    return state.safeParse({
+    return stateV7.safeParse({
       ...old.data,
-      v: PARTY_STATE_VERSION,
+      v: 7,
       prompts: {
         completion: old.data.prompts.completion.map((id) => ({ id, members: [] })),
         warning: old.data.prompts.warning,
@@ -327,20 +373,20 @@ function readState(stored: unknown) {
   if (version === 3) {
     const old = stateV3.safeParse(stored);
     if (!old.success) return old;
-    return state.safeParse({ ...old.data, v: PARTY_STATE_VERSION });
+    return stateV7.safeParse({ ...old.data, v: 7 });
   }
   if (version === 4) {
     const old = stateV4.safeParse(stored);
     if (!old.success) return old;
-    return state.safeParse({ ...old.data, v: PARTY_STATE_VERSION });
+    return stateV7.safeParse({ ...old.data, v: 7 });
   }
   if (version === 5) {
     const old = stateV5.safeParse(stored);
     if (!old.success) return old;
     const { train: oldTrain, ...rest } = old.data;
-    return state.safeParse({
+    return stateV7.safeParse({
       ...rest,
-      v: PARTY_STATE_VERSION,
+      v: 7,
       // Previous on a finished route of such a train leads to the last stop, as it did.
       ...(oldTrain ? { train: { ...oldTrain, finishedFrom: null } } : {}),
     });
@@ -348,9 +394,9 @@ function readState(stored: unknown) {
   if (version === 6) {
     const old = stateV6.safeParse(stored);
     if (!old.success) return old;
-    return state.safeParse({ ...old.data, v: PARTY_STATE_VERSION });
+    return stateV7.safeParse({ ...old.data, v: 7 });
   }
-  return state.safeParse(stored);
+  return stateV7.safeParse(stored);
 }
 
 const mirrors = z.array(
diff --git a/src/domain/party/party.ts b/src/domain/party/party.ts
index cb583859d7dad3b3d55869df3e183bec2ba32dec..5b0d8308b829613a1ce92e404c8d0701f008018a 100644
--- a/src/domain/party/party.ts
+++ b/src/domain/party/party.ts
@@ -204,6 +204,19 @@ export interface RaidDetails {
   hatchedDuration: number | null;
   /** The stage the post last showed; the scheduler compares it with the clock (see `partyTick`). */
   stageSeen: RaidStage;
+  /**
+   * The screenshot the raid was reported from, null for a raid reported without one. `id` is
+   * the kept screenshot (`ScreenshotStore`), which the post's "Screenshot feedback" button shows;
+   * null when it could not be kept. `timeUncertain`: its times were guessed from when the
+   * screenshot was posted, or the screenshot was taken a while before; the post says so until
+   * somebody sets a time (`/hatch`, `/end`, "Set time").
+   */
+  screenshot: RaidScreenshot | null;
+}
+
+export interface RaidScreenshot {
+  id: string | null;
+  timeUncertain: boolean;
 }
 
 export interface RaidParty extends PartyCore {
diff --git a/src/domain/party/raid.test.ts b/src/domain/party/raid.test.ts
index 36fcfcbdbdfe81cdc5fa390d8b4554b364b95447..e1fe064279e655a5c5315eeed2403462fb64622c 100644
--- a/src/domain/party/raid.test.ts
+++ b/src/domain/party/raid.test.ts
@@ -26,6 +26,7 @@ import {
   setHatchedDuration,
   setHatchTime,
   setMoveset,
+  timeConfirmed,
 } from './raid.js';
 import { PartyStatus } from './status.js';
 
@@ -210,6 +211,35 @@ describe('raid times', () => {
   });
 });
 
+describe('timeConfirmed', () => {
+  it('makes a time guessed from a screenshot sure, and leaves any other raid as it is', () => {
+    const plain = testRaid();
+    expect(timeConfirmed(plain)).toBe(plain);
+    const guessed = {
+      ...plain,
+      raid: { ...plain.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true } },
+    };
+    expect(timeConfirmed(guessed).raid.screenshot).toEqual({
+      id: 'Ab3_-xY9zQ12',
+      timeUncertain: false,
+    });
+    const sure = timeConfirmed(guessed);
+    expect(timeConfirmed(sure)).toBe(sure);
+  });
+
+  it('is not what a change of the boss does, also when it moves the times for another tier', () => {
+    const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
+    const guessed = {
+      ...egg,
+      raid: { ...egg.raid, screenshot: { id: null, timeUncertain: true } },
+    };
+    for (const tier of [T5, ELITE]) {
+      const changed = setBoss(guessed, { tier, boss: YVELTAL }, rules, PARTY_NOW).party;
+      expect(changed.raid.screenshot).toEqual({ id: null, timeUncertain: true });
+    }
+  });
+});
+
 describe('raidStage and blocksNewRaid', () => {
   const egg = setHatchTime(testRaid(), at('2026-10-13T14:30'), rules, PARTY_NOW);
 
diff --git a/src/domain/party/raid.ts b/src/domain/party/raid.ts
index fafa062762caec788e11afcb7a4c61dbc36d88a9..db2996a6bd0f0160fa865ff2e37f3cb53a738d8f 100644
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -204,11 +204,23 @@ export function createRaid(input: NewRaid, rules: RaidDurationRules): RaidParty
       reportedHatched: boss !== null,
       hatchedDuration: null,
       stageSeen: boss === null ? 'egg' : 'hatched',
+      screenshot: null,
     },
   };
   return settled(raid, rules, now);
 }
 
+/**
+ * The raid once a member has set its time (`/hatch`, `/end`, "Set time"; not `/duration`, which
+ * is no time): a time guessed from a screenshot is then no guess. The same raid when there was
+ * none.
+ */
+export function timeConfirmed(party: RaidParty): RaidParty {
+  const { screenshot } = party.raid;
+  if (!screenshot?.timeUncertain) return party;
+  return { ...party, raid: { ...party.raid, screenshot: { ...screenshot, timeUncertain: false } } };
+}
+
 /**
  * Sets when the egg hatches (or hatched); the end follows from it. Seconds are dropped. The
  * caller has checked the time (`resolvePartyTime`).
diff --git a/src/domain/party/relocate.test.ts b/src/domain/party/relocate.test.ts
index 2f3e4572ae5af8d7179fbfabda9cebc8fca88ffc..91ea7bdc5d114c29a1fae5b2905b545486185b09 100644
--- a/src/domain/party/relocate.test.ts
+++ b/src/domain/party/relocate.test.ts
@@ -64,6 +64,11 @@ describe('relocatedRaid', () => {
     const moved = relocatedRaid(source, PLACE);
     // Who reported it is still named in the new post.
     expect(relocatedRaid({ ...source, makerName: 'Rae' }, PLACE).makerName).toBe('Rae');
+    // So is the screenshot it was reported from, and whether its time is a guess.
+    const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
+    expect(
+      relocatedRaid({ ...source, raid: { ...source.raid, screenshot } }, PLACE).raid.screenshot,
+    ).toEqual(screenshot);
     expect(moved).toMatchObject({
       id: NEW_ID,
       type: 'raid',
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index e3b034fa1e2623f08a7de482c26e53652d1cb7df..8de6cb537faaa60e2ff0d21dcbd2e007e8c89467 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -21,6 +21,7 @@ import {
 import { raidBossesFixture } from '../../test/support/raid-bosses.js';
 import type { Attendee, RaidParty } from '../domain/party/party.js';
 import { FORUM_TAGS } from './party-post.js';
+import { UNCERTAIN_TIME } from './raid-post.js';
 import { setBoss, setHatchTime } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import {
@@ -499,6 +500,22 @@ describe('renderRaidPost', () => {
     expect(post.embed.fields?.map((field) => field.name)).toEqual(['Trainers (1)']);
   });
 
+  it('says when the times are a guess from a screenshot, until they are set or the raid is over', () => {
+    const guessed: RaidParty = {
+      ...egg,
+      raid: { ...egg.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: true } },
+    };
+    const lines = (party: RaidParty, now = PARTY_NOW) =>
+      renderRaidPost(view(party, { now })).embed.description?.split('\n') ?? [];
+    expect(lines(guessed)[2]).toBe(UNCERTAIN_TIME);
+    const sure: RaidParty = {
+      ...guessed,
+      raid: { ...guessed.raid, screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: false } },
+    };
+    expect(lines(sure)).not.toContain(UNCERTAIN_TIME);
+    expect(lines(guessed, PARTY_NOW + 6 * 60 * MINUTE)).not.toContain(UNCERTAIN_TIME);
+  });
+
   it('names the reporter by the name the party has, and by a mention when it has none', () => {
     const described = (party: RaidParty) => renderRaidPost(view(party)).embed.description;
     expect(described(testRaid())).toContain(`Reported by <@${REPORTER}>.`);
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index 4a2d13c1cbd59fb0eba21dc1bec405828b7b09d8..b329379b43b025f6a517b99d3abe07bd6b09604a 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -201,7 +201,19 @@ export function raidTags(party: RaidParty, now: number): ForumTag[] {
   ];
 }
 
+/** What the post says under the times of a raid whose times were guessed from a screenshot. */
+export const UNCERTAIN_TIME =
+  'These times are a guess from the screenshot (no clock on it, or taken a while before it was posted). `/hatch` or `/end` sets them right.';
+
 function describeTimes(view: RaidPostView, stage: RaidStage): string {
+  const times = timesOf(view, stage);
+  const uncertain = view.party.raid.screenshot?.timeUncertain === true;
+  return uncertain && stage !== 'ended' && view.party.hatchTime !== null
+    ? `${times}\n${UNCERTAIN_TIME}`
+    : times;
+}
+
+function timesOf(view: RaidPostView, stage: RaidStage): string {
   const { party, now, zone } = view;
   const { hatchTime, endTime } = party;
   if (hatchTime === null || endTime === null) {
diff --git a/src/services/raid-change-service.ts b/src/services/raid-change-service.ts
index 4093f7680c94f0ca91a4ab0d5c856ee016b48ccb..9221a7f8bdca5df5748dcec45e11d6eeabf910b5 100644
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -25,6 +25,7 @@ import {
   setHatchedDuration,
   setHatchTime,
   setMoveset,
+  timeConfirmed,
 } from '../domain/party/raid.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
@@ -152,14 +153,17 @@ export class RaidChangeService {
     return clockOrDate(time, this.now());
   }
 
-  /** When the egg hatches (or hatched); the end follows. The caller has checked the time. */
+  /**
+   * When the egg hatches (or hatched); the end follows. The caller has checked the time. A time
+   * guessed from a screenshot is then no guess (also for the end).
+   */
   setHatchTime(partyId: string, member: Member, time: number): Promise<RaidChangeOutcome> {
     return this.apply(
       partyId,
       member,
       (party, rules, now) => ({
         ok: true,
-        party: unlessSame(party, setHatchTime(party, time, rules, now)),
+        party: unlessSame(party, setHatchTime(timeConfirmed(party), time, rules, now)),
       }),
       (party) =>
         party.hatchTime === null
@@ -176,7 +180,7 @@ export class RaidChangeService {
       member,
       (party, rules, now) => ({
         ok: true,
-        party: unlessSame(party, setEndTime(party, time, rules, now)),
+        party: unlessSame(party, setEndTime(timeConfirmed(party), time, rules, now)),
       }),
       (party) =>
         party.endTime === null
@@ -193,6 +197,7 @@ export class RaidChangeService {
       partyId,
       member,
       (party, rules, now) => {
+        // The length is no time: a time guessed from a screenshot stays a guess.
         const set = setHatchedDuration(party, minutes, maxRaidHatchedDuration, rules, now);
         return set.ok ? { ...set, party: unlessSame(party, set.party) } : set;
       },
````

---

### Task 7: raid with a screenshot

Prototype commit: `758bb68e22807af0d7eb04a9a4502abce1001ecc`

/raid with a screenshot: a new optional attachment option; boss and gym
become optional (without a screenshot both are still needed: a guard
says so before the throttle counts). The screenshot is read with what
was typed in its place, decided and reported as Task 4 says; a gym that
is not clear (also a typed gym with several hits that the reading does
not settle) is asked with a menu built from a fresh search, every gym of
that name included, told apart by nickname, region and description
(gym-question.ts). RaidReport.hatched reports a hatched raid without a
boss. Boss and gym typed beside an unreadable screenshot report from what
was typed. SimpleCommand.forConfig drops the option where ocr.enabled is
off.

**Interfaces:**
- Consumes: Tasks 4 to 6.
- Produces: `RaidReport.hatched?`; `gymCandidates`, `menuDescription`, `gymMenuOptions`, `gymNamerOf` (`src/commands/screenshots/gym-question.ts`); `SimpleCommand.forConfig`.

**Files:**

```
 src/commands/raids/raid-input.ts           |  46 +++++
 src/commands/raids/raid-screenshot.test.ts | 313 +++++++++++++++++++++++++++++++
 src/commands/raids/raid.ts                 | 495 ++++++++++++++++++++++++++++++++++++++++---------
 src/commands/screenshots/gym-question.ts   |  74 ++++++++
 src/discord/command.ts                     |   7 +-
 src/domain/party/raid.ts                   |   6 +-
 src/services/party-service.ts              |  11 ++
 src/services/raid-change-service.test.ts   |  19 ++
 src/services/raid-change-service.ts        |   6 +-
 src/services/screenshot-service.ts         |  25 ++-
 test/support/gyms.ts                       |   3 +
 test/support/providers.ts                  |  10 +-
 12 files changed, 913 insertions(+), 102 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/raids/raid-screenshot.test.ts src/services/raid-change-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 758bb68e22807af0d7eb04a9a4502abce1001ecc -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `raid with a screenshot`, the body above and the trailer, staging exactly
  `src/commands/raids/raid-input.ts src/commands/raids/raid-screenshot.test.ts src/commands/raids/raid.ts src/commands/screenshots/gym-question.ts src/discord/command.ts src/domain/party/raid.ts src/services/party-service.ts src/services/raid-change-service.test.ts src/services/raid-change-service.ts src/services/screenshot-service.ts test/support/gyms.ts test/support/providers.ts`.

````diff
diff --git a/src/commands/raids/raid-input.ts b/src/commands/raids/raid-input.ts
index d332497eeacbda7cd2d53b2238e6cf108ff9d32b..bef7331407774e7557325dab2386967c593fd27a 100644
--- a/src/commands/raids/raid-input.ts
+++ b/src/commands/raids/raid-input.ts
@@ -135,6 +135,29 @@ const chosenBoss = (boss: RaidBoss): ReportedBoss => ({
   label: bossLabel(boss),
 });
 
+/**
+ * What a raid reported from a screenshot is, as `reportedBoss` words it: the boss decided, an
+ * egg, or a hatched raid whose boss nobody could tell (`T5 raid`).
+ */
+export function screenshotBoss(
+  tier: RaidTier,
+  boss: RaidBoss | null,
+  hatched: boolean,
+): ReportedBoss {
+  if (boss) return chosenBoss(boss);
+  return { tier, boss: null, label: hatched ? `${raidTierLabel(tier)} raid` : eggLabel(tier) };
+}
+
+/**
+ * A stand-in for what a member reported, for reading a time typed beside a screenshot by the
+ * stage the screenshot shows: `reportedTime` reads a hatch time for an egg and an end time for
+ * a raid seen hatched. The tier gives the durations; without one, a standard raid's.
+ */
+export function stageOnly(tier: RaidTier | null, hatched: boolean): ReportedBoss {
+  const shown = tier ?? { level: 'T5', shadow: false };
+  return { tier: shown, boss: hatched ? { name: 'unknown' } : null, label: '' };
+}
+
 /** "could be A, B or C": up to three of the bosses a text fits. */
 function couldBe(text: string, bosses: readonly RaidBoss[]): UserError {
   const names = bosses.slice(0, 3).map(bossLabel);
@@ -626,6 +649,29 @@ export function reportedTime(
   );
 }
 
+/**
+ * Whether a text typed beside a screenshot can be a time at all: read as the hatch of an egg or
+ * the end of a raid of any tier, it is something other than unreadable (whether it fits the raid
+ * is known only once the screenshot was read).
+ */
+export function readableTime(ctx: AppContext, text: string, now: number): boolean {
+  const { settings } = ctx.config;
+  const rules = raidDurationRules(settings, ctx.raidEvents.events());
+  return (['hatch', 'end'] as const).some((parameter) => {
+    const result = resolvePartyTime({
+      text,
+      now,
+      zone: settings.timezone,
+      parameter,
+      partyType: 'raid',
+      raidKind: 'standard',
+      settings,
+      durations: longestRaidDurations('standard', now, now, rules),
+    });
+    return result.kind !== 'unparseable';
+  });
+}
+
 /** What a member is told who sets a time for a raid without times that cannot be going on any more. */
 export const RAID_IS_OVER =
   'This raid is over by now. If it really lasts longer than usual, set its length first with `/duration`.';
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9c357a13f80ff4e8373a13ab7c65cad736d538d3
--- /dev/null
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -0,0 +1,313 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import {
+  fakeButton,
+  fakeChatInput,
+  fakeSelect,
+  sent,
+  type FakeInteraction,
+  type FakeOptions,
+} from '../../../test/support/fake-interactions.js';
+import { testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { at, MINUTE, PARTY_NOW } from '../../../test/support/parties.js';
+import { partyServiceWith } from '../../../test/support/party-service.js';
+import { gymsFixture } from '../../../test/support/providers.js';
+import { screenshotsWith } from '../../../test/support/screenshot-service.js';
+import { eggReading, readingOf } from '../../../test/support/screenshots.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import { enabledCommands } from '../../discord/command.js';
+import { InteractionRouter } from '../../discord/router.js';
+import { isRaid } from '../../domain/party/party.js';
+import type { ScreenReading } from '../../ocr/screen-reader.js';
+import { screenshotControls } from '../screenshots/feedback.js';
+import { raid, raidControls } from './raid.js';
+
+/** PARTY_NOW is 14:00 in New York: the phone's clock a minute before. */
+const CLOCK = { hour: 13, minute: 59 };
+
+async function setup(extraGyms: Gym[] = []) {
+  const gyms = gymsFixture(extraGyms);
+  const made = await partyServiceWith([], { gyms });
+  const base = createTestContext({ gyms });
+  const shots = screenshotsWith(base.ctx);
+  const { ctx } = createTestContext({
+    gyms,
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    screenshots: shots.screenshots,
+  });
+  const router = new InteractionRouter(ctx, [raid], [raidControls, screenshotControls]);
+  const handle = async (interaction: FakeInteraction) => {
+    await router.handle(interaction as never);
+    return interaction;
+  };
+  const report = (
+    reading: ScreenReading,
+    options: Record<string, string> = {},
+    extra: FakeOptions = {},
+    name = 'shot.png',
+  ) =>
+    handle(
+      fakeChatInput({
+        commandName: 'raid',
+        channelId: WEST_CHANNEL,
+        options,
+        resolved: { screenshot: shots.screenshot(name, reading) },
+        ...extra,
+      }),
+    );
+  return { ...shots, ...made, ctx, handle, report };
+}
+
+function rowsOf(payload: { components?: readonly unknown[] }) {
+  return (payload.components ?? []).map(
+    (row) =>
+      ((row as { toJSON?: () => unknown }).toJSON?.() ?? row) as {
+        components: {
+          custom_id: string;
+          label?: string;
+          options?: { label: string; value: string; description?: string }[];
+        }[];
+      },
+  );
+}
+
+describe('/raid with a screenshot', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reports the raid it reads unasked, with its screenshot, and offers feedback', async () => {
+    const { report, store, service, screenshots } = await setup();
+    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
+    await service.flush();
+    const [party] = store.active();
+    if (!party || !isRaid(party)) throw new Error('no raid');
+    expect(party).toMatchObject({
+      gymId: 2,
+      hatchTime: at('2026-10-13T14:19'),
+      raid: { tier: { level: 'T5', shadow: false }, boss: null },
+    });
+    const id = party.raid.screenshot?.id ?? '';
+    expect(party.raid.screenshot).toEqual({ id, timeUncertain: false });
+    const answer = sent(used.editReply);
+    expect(answer.content).toMatch(/^Reported: T5 egg at Old Stone Fountain\./);
+    expect(rowsOf(answer)[0]?.components[0]).toMatchObject({
+      custom_id: `shot:${id}:show`,
+      label: 'Screenshot feedback',
+    });
+    // Kept while the raid lasts.
+    expect(await screenshots.get(id)).toMatchObject({ record: { keepUntil: null } });
+  });
+
+  it('reports a guessed time as uncertain, and a hatched raid without its boss as hatched', async () => {
+    const { report, store } = await setup();
+    await report(
+      readingOf(
+        { gym: 'Old Stone Fountain', countdown: 30 * 60, countdownPlace: 'right' },
+        { heads: 5 },
+      ),
+    );
+    const [party] = store.active();
+    if (!party || !isRaid(party)) throw new Error('no raid');
+    expect(party.raid).toMatchObject({ boss: null, reportedHatched: true, stageSeen: 'hatched' });
+    expect(party.raid.screenshot?.timeUncertain).toBe(true);
+    expect(party.endTime).toBe(Math.floor((PARTY_NOW - 45_000 + 30 * MINUTE) / MINUTE) * MINUTE);
+  });
+
+  it('lets what the member typed count instead of what it read', async () => {
+    const { report, store } = await setup();
+    await report(eggReading('Nowhere at all', 5, CLOCK, 20 * 60), { gym: 'g:1', time: '30' });
+    const [party] = store.active();
+    expect(party).toMatchObject({ gymId: 1, hatchTime: at('2026-10-13T14:30') });
+  });
+
+  it('says why it reports nothing, with what it read and the feedback buttons', async () => {
+    const { report, store } = await setup();
+    const used = await report(readingOf({ gym: 'Old Stone Fountain' }));
+    expect(store.active()).toEqual([]);
+    const answer = sent(used.editReply);
+    expect(answer.content).toMatch(/does not look like the screen of a raid/);
+    expect(rowsOf(answer)[0]?.components.map((c) => c.label)).toEqual([
+      'All right',
+      'Something is wrong',
+    ]);
+  });
+
+  it('asks which gym when gyms of one region share the name, offering each told apart', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, {
+      nickname: 'Fountain by the bank',
+    });
+    const { report, handle, store, screenshots } = await setup([twin]);
+    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
+    expect(store.active()).toEqual([]);
+    const question = sent(used.editReply);
+    expect(question.content).toMatch(/Which gym is this\?/);
+    const [menu, buttons] = rowsOf(question);
+    const options = menu?.components[0]?.options ?? [];
+    expect(options.map((o) => o.value).sort()).toEqual(['13', '2']);
+    expect(options.find((o) => o.value === '13')?.description).toContain('Fountain by the bank');
+    expect(buttons?.components[0]?.label).toBe('Cancel');
+    const chose = await handle(
+      fakeSelect({ customId: menu?.components[0]?.custom_id ?? '', values: ['13'] }),
+    );
+    expect(sent(chose.editReply).content).toMatch(/^Reported: T5 egg at Fountain by the bank\./);
+    // The record keeps which gym the member chose.
+    const shot = store.active().flatMap((p) => (isRaid(p) ? [p.raid.screenshot?.id] : []))[0];
+    expect(await screenshots.get(shot ?? '')).toMatchObject({ record: { pickedGymId: 13 } });
+    const [party] = store.active();
+    expect(party?.gymId).toBe(13);
+  });
+
+  it('cancels the question about the gym', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
+    const { report, handle, store } = await setup([twin]);
+    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
+    const cancel = rowsOf(sent(used.editReply))[1]?.components[0]?.custom_id ?? '';
+    const pressed = await handle(fakeButton({ customId: cancel }));
+    expect(sent(pressed.update).content).toBe('Nothing was reported.');
+    expect(store.active()).toEqual([]);
+  });
+
+  it('takes a typed gym of several hits from the screenshot when it names one of them clearly', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
+    const { report, store } = await setup([twin]);
+    // "Fountain" fits both; the screenshot names neither clearly but the Library clearly.
+    const library = await report(eggReading('Pinewood Public Library', 5, CLOCK, 20 * 60), {
+      gym: 'Fountain',
+    });
+    expect(store.active()).toEqual([]);
+    const question = sent(library.editReply);
+    expect(question.content).toBe('Several gyms fit "Fountain". Which one do you mean?');
+    const options = rowsOf(question)[0]?.components[0]?.options ?? [];
+    expect(options.map((o) => o.value).sort()).toEqual(['13', '2']);
+    // A screenshot whose gym is not known: the typed hits are offered all the same.
+    const nowhere = await report(eggReading('Nowhere at all', 5, CLOCK, 20 * 60), {
+      gym: 'Fountain',
+    });
+    expect(sent(nowhere.editReply).content).toBe(
+      'Several gyms fit "Fountain". Which one do you mean?',
+    );
+  });
+
+  it('reports a clearly read gym that is one of several typed hits', async () => {
+    const { report, store } = await setup();
+    // "Stone" fits Old Stone Fountain and nothing else here; "Old" fits several.
+    await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60), { gym: 'Old' });
+    expect(store.active()[0]?.gymId).toBe(2);
+  });
+
+  it('reports what the member typed when the screenshot is no raid screen, and says so', async () => {
+    const { report, store } = await setup();
+    const used = await report(readingOf({ gym: 'Old Stone Fountain' }), {
+      boss: 'e:T5:0',
+      gym: 'g:1',
+    });
+    expect(store.active()[0]).toMatchObject({ gymId: 1, raid: { screenshot: null } });
+    expect(sent(used.editReply).content).toMatch(
+      /^I could not read the screenshot, so I used what you typed\.\nReported: T5 egg/,
+    );
+  });
+
+  it('asks among the typed gyms when the screenshot is no raid screen and several fit', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
+    const { report, handle, store } = await setup([twin]);
+    const used = await report(readingOf({ gym: 'Old Stone Fountain' }), {
+      boss: 'e:T5:0',
+      gym: 'Fountain',
+    });
+    const question = sent(used.editReply);
+    expect(question.content).toBe(
+      'I could not read the screenshot. Several gyms fit "Fountain". Which one do you mean?',
+    );
+    const menu = rowsOf(question)[0]?.components[0];
+    const chose = await handle(fakeSelect({ customId: menu?.custom_id ?? '', values: ['13'] }));
+    expect(sent(chose.editReply).content).toMatch(
+      /^I could not read the screenshot, so I used what you typed\.\nReported: T5 egg at Bank fountain/,
+    );
+    expect(store.active()[0]).toMatchObject({ gymId: 13, raid: { screenshot: null } });
+  });
+
+  it('carries the screenshot through the question about another region', async () => {
+    const { report, handle, store } = await setup();
+    const used = await report(eggReading('Harbor Lighthouse Mural', 5, CLOCK, 20 * 60));
+    const question = sent(used.editReply);
+    expect(question.content).toMatch(/not in this region\. Report the raid there\?$/);
+    const yes = rowsOf(question)[0]?.components[0]?.custom_id ?? '';
+    await handle(fakeButton({ customId: yes }));
+    const [party] = store.active();
+    if (!party || !isRaid(party)) throw new Error('no raid');
+    expect(party.gymId).toBe(7);
+    expect(party.raid.screenshot?.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
+  });
+
+  it('answers a screenshot of a raid that exists with its post and the screenshot’s feedback', async () => {
+    const { report, store, service } = await setup();
+    await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
+    await service.flush();
+    const again = await report(
+      eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60),
+      {},
+      {
+        userId: '700000000000000009',
+      },
+    );
+    const answer = sent(again.editReply);
+    expect(answer.content).toMatch(/^There is already a raid at Old Stone Fountain\./);
+    expect(rowsOf(answer)[0]?.components[0]?.label).toBe('Screenshot feedback');
+    expect(store.active()).toHaveLength(1);
+  });
+
+  it('refuses a typed time that is no time before reading, without using up the throttle', async () => {
+    const { report, reader } = await setup();
+    const bad = await report(eggReading('Old Stone Fountain', 5, CLOCK), { time: 'soonish' });
+    expect(sent(bad.reply).content).toMatch(/^I could not read "soonish" as a time/);
+    expect(reader.reads).toBe(0);
+    for (let i = 0; i < 25; i++) {
+      await report(eggReading('Old Stone Fountain', 5, CLOCK), { time: 'soonish' });
+    }
+    const good = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
+    expect(reader.reads).toBe(1);
+    expect(sent(good.editReply).content).toMatch(/^Reported/);
+  });
+
+  it('says it cannot tell the tier, and reports nothing', async () => {
+    const { report, store } = await setup();
+    const used = await report(
+      readingOf(
+        { gym: 'Old Stone Fountain', clock: CLOCK, countdown: 600, countdownPlace: 'centre' },
+        { heads: 2 },
+      ),
+    );
+    expect(store.active()).toEqual([]);
+    expect(sent(used.editReply).content).toMatch(/^I could not tell the tier of this raid/);
+  });
+
+  it('needs the boss and the gym without a screenshot, and no screenshot option where none are read', async () => {
+    const { handle } = await setup();
+    const used = await handle(
+      fakeChatInput({ commandName: 'raid', channelId: WEST_CHANNEL, options: { boss: 'e:T5:0' } }),
+    );
+    expect(sent(used.reply).content).toBe(
+      'Give the gym of the raid (or attach a screenshot of it).',
+    );
+    const { ctx } = createTestContext();
+    const off = {
+      ...ctx.config,
+      settings: { ...ctx.config.settings, ocr: { ...ctx.config.settings.ocr, enabled: false } },
+    };
+    const [without] = enabledCommands([raid], off);
+    const options = without?.data.toJSON().options ?? [];
+    expect(options.map((o) => [o.name, o.required ?? false])).toEqual([
+      ['boss', true],
+      ['gym', true],
+      ['time', false],
+    ]);
+    const [withShots] = enabledCommands([raid], ctx.config);
+    expect(withShots?.data.toJSON().options?.map((o) => o.name)).toContain('screenshot');
+  });
+});
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index f5d2b79e0fb2a938d034b5643784691a78b94064..8ed9263d69696d26af9352e547cf301d783e46c6 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -4,26 +4,38 @@ import {
   ButtonStyle,
   SlashCommandBuilder,
   StringSelectMenuBuilder,
+  type Attachment,
   type ButtonInteraction,
   type ChatInputCommandInteraction,
   type StringSelectMenuInteraction,
 } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
-import type { ComponentHandler, SimpleCommand } from '../../discord/command.js';
+import type { Guard, SimpleCommand } from '../../discord/command.js';
+import type { ComponentHandler } from '../../discord/command.js';
 import { encodeCustomId } from '../../discord/custom-id.js';
 import { UserError } from '../../discord/errors.js';
-import { regionChannelOf, requireRegion } from '../../discord/guards.js';
+import { guildIdOf, regionChannelOf, requireRegion } from '../../discord/guards.js';
 import { memberInfo } from '../../discord/member-info.js';
+import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
+import { storedReport } from '../../domain/ocr/screenshot-record.js';
+import type { ReportDoubt } from '../../domain/ocr/screenshot-report.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
+import { doubtLines, readingLines, refusalWords } from '../../render/screenshot-reading.js';
 import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
+import { feedbackRow, gymNamerOf, showRow } from '../screenshots/feedback.js';
+import { gymCandidates, gymMenuOptions } from '../screenshots/gym-question.js';
+import { readAttached } from '../screenshots/read-screenshot.js';
 import {
   bossChoices,
   gymChoices,
   reportedBoss,
   reportedGym,
   reportedTime,
+  readableTime,
+  screenshotBoss,
+  stageOnly,
   type ReportedBoss,
 } from './raid-input.js';
 
@@ -33,6 +45,18 @@ import {
  */
 const KIND = 'raid';
 const EXPIRED = 'That choice has expired. Use `/raid` again.';
+/** A message's text stays within Discord's 2,000 characters. */
+const MESSAGE = 2_000;
+
+/** What a report from a screenshot carries beside the raid itself. */
+interface FromScreenshot {
+  /** The kept screenshot; undefined when it could not be kept. */
+  id: string | undefined;
+  /** Its times were guessed from the upload, or it was taken a while before. */
+  timeUncertain: boolean;
+  /** What was not sure, for the member's answer. */
+  doubts: ReportDoubt[];
+}
 
 /** A report that waits for the member to choose a gym or to confirm one in another region. */
 interface PendingReport {
@@ -42,6 +66,11 @@ interface PendingReport {
   regionChannelId: string | undefined;
   /** The gyms offered in the menu; for a confirmation, the one gym. */
   gymIds: number[];
+  /** Seen hatched without a boss anybody could tell (from a screenshot). */
+  hatched?: boolean;
+  screenshot?: FromScreenshot;
+  /** Said before what came of the report. */
+  note?: string;
 }
 
 const pending = new PendingRequests<PendingReport>();
@@ -64,6 +93,7 @@ async function finish(
   gym: Gym,
 ): Promise<void> {
   const settings = await ctx.users.get(interaction.user.id);
+  const shot = request.screenshot;
   const outcome = await ctx.partyService.reportRaid({
     gym,
     reporterId: interaction.user.id,
@@ -72,6 +102,9 @@ async function finish(
     autoStatus: settings.autoStatus,
     tier: request.reported.tier,
     boss: request.reported.boss,
+    ...(request.hatched ? { hatched: true } : {}),
+    // The screenshot's id when it was kept, and whether the time is a guess either way.
+    ...(shot ? { screenshot: { id: shot.id ?? null, timeUncertain: shot.timeUncertain } } : {}),
     ...(request.regionChannelId === undefined ? {} : { regionChannelId: request.regionChannelId }),
     ...(request.time ? { time: request.time } : {}),
   });
@@ -81,6 +114,8 @@ async function finish(
       content =
         `Reported: ${request.reported.label} at ${gymName(gym)}.` +
         (outcome.party.forumPostId === null ? '' : ` Its post is <#${outcome.party.forumPostId}>.`);
+      // Its post shows the screenshot as long as the raid lasts.
+      if (shot?.id !== undefined) await ctx.screenshots.inUse(shot.id);
       break;
     case 'exists': {
       const post = outcome.party.forumPostId;
@@ -102,7 +137,18 @@ async function finish(
         'A moderator can create it with `/admin setup-forums`.';
       break;
   }
-  await interaction.editReply({ content, components: [] });
+  // What a screenshot left unsure is said, and its feedback is a button away.
+  const unsure =
+    shot && shot.doubts.length > 0
+      ? ['', 'From the screenshot I was not sure of this:', ...doubtLines(shot.doubts)]
+      : [];
+  await interaction.editReply({
+    content: truncate(
+      [...(request.note ? [request.note] : []), content, ...unsure].join('\n'),
+      MESSAGE,
+    ),
+    components: shot?.id === undefined ? [] : [showRow(shot.id)],
+  });
 }
 
 /**
@@ -145,37 +191,278 @@ async function withGym(
   });
 }
 
+/** The name of a region channel, from the cache of the interaction's server. */
+function regionNameOf(interaction: ChatInputCommandInteraction) {
+  return (channelId: string): string | undefined =>
+    interaction.guild?.channels.cache.get(channelId)?.name;
+}
+
 /**
- * What the menu says under a gym: its nickname, the region it lies in when that is not the region
- * the command was used in, and its own description.
+ * Asks the member which of these gyms they mean, with a menu (each gym told apart by its
+ * nickname, region and description), and the rest of the report kept for the answer.
  */
-function menuDescription(
+async function askGym(
   interaction: ChatInputCommandInteraction,
   ctx: AppContext,
+  request: PendingReport,
+  gyms: readonly Gym[],
+  content: string,
+  cancel = false,
+): Promise<void> {
+  const token = pending.put(interaction.user.id, {
+    ...request,
+    gymIds: gyms.map((gym) => gym.id),
+  });
+  const menu = new StringSelectMenuBuilder()
+    .setCustomId(encodeCustomId({ kind: KIND, id: token, action: 'gym' }))
+    .setPlaceholder('Choose the gym')
+    .addOptions(gymMenuOptions(ctx, request.regionChannelId, gyms, regionNameOf(interaction)));
+  const rows: (ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>)[] = [
+    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
+  ];
+  if (cancel) {
+    rows.push(
+      new ActionRowBuilder<ButtonBuilder>().addComponents(
+        new ButtonBuilder()
+          .setCustomId(encodeCustomId({ kind: KIND, id: token, action: 'no' }))
+          .setLabel('Cancel')
+          .setStyle(ButtonStyle.Secondary),
+      ),
+    );
+  }
+  await interaction.editReply({ content: truncate(content, MESSAGE), components: rows });
+}
+
+/** The report of a raid a screenshot was decided as, with what the member typed in its place. */
+function screenshotRequest(
+  raid: ScreenshotRaid,
+  typed: ReportedBoss | undefined,
   regionChannelId: string | undefined,
-  gym: Gym,
-): string | undefined {
-  const regions = ctx.gyms.regionsOf(gym.id);
-  const [elsewhere] = regions;
-  const region =
-    regionChannelId !== undefined && elsewhere !== undefined && !regions.includes(regionChannelId)
-      ? interaction.guild?.channels.cache.get(elsewhere)?.name
-      : undefined;
-  const parts = [gym.nickname, region, gym.description].filter(
-    (part): part is string => part !== null && part !== undefined && part.trim() !== '',
+  screenshot: FromScreenshot,
+): PendingReport {
+  return {
+    reported: typed ?? screenshotBoss(raid.tier, raid.boss, raid.hatched),
+    time: raid.time,
+    regionChannelId,
+    gymIds: [raid.gymId],
+    ...(typed === undefined && raid.hatched && raid.boss === null ? { hatched: true } : {}),
+    screenshot,
+  };
+}
+
+/**
+ * `/raid` with a screenshot: read it in the place of what was not typed, then report the raid
+ * unasked, ask only which gym when the gym read is not clear, or say why nothing is reported.
+ * What the member typed (boss, gym, time) stands in the place of what was read.
+ */
+async function reportFromScreenshot(
+  interaction: ChatInputCommandInteraction,
+  ctx: AppContext,
+  regionChannelId: string | undefined,
+  attachment: Attachment,
+): Promise<void> {
+  const typedBoss = interaction.options.getString('boss')?.trim() ?? '';
+  const typedGymText = interaction.options.getString('gym')?.trim() ?? '';
+  const typedTime = interaction.options.getString('time');
+  const reported = typedBoss === '' ? undefined : reportedBoss(ctx, typedBoss);
+  const gymAnswer =
+    typedGymText === '' ? undefined : reportedGym(ctx, regionChannelId, typedGymText);
+  if (gymAnswer?.kind === 'none') {
+    throw new UserError(
+      `I found no gym for "${plain(truncate(typedGymText, 80))}". Type part of its name and pick it from the list.`,
+    );
+  }
+  // Several gyms fit what was typed: the one the screenshot names, if it is one of them.
+  const typedHits = gymAnswer?.kind === 'several' ? gymAnswer.gyms : undefined;
+  const now = Date.now();
+  const outcome = await readAttached(interaction, ctx, attachment, {
+    use: 'raid',
+    typed: (report) => {
+      const time = reportedTime(
+        ctx,
+        reported ?? stageOnly(report.tier, report.stage === 'hatched'),
+        typedTime,
+        now,
+      );
+      // Only a gym the screenshot named clearly, never its guess.
+      const readGym = report.gym.clear ? report.gym.gymId : null;
+      const gymId =
+        gymAnswer?.kind === 'gym'
+          ? gymAnswer.gym.id
+          : typedHits?.some((gym) => gym.id === readGym)
+            ? (readGym ?? undefined)
+            : undefined;
+      return {
+        ...(gymId === undefined ? {} : { gymId }),
+        ...(reported
+          ? { boss: { tier: reported.tier, boss: null, hatched: reported.boss !== null } }
+          : {}),
+        ...(time ? { time } : {}),
+      };
+    },
+  });
+  const { report, decision, id } = outcome;
+  const read = readingLines(storedReport(report), gymNamerOf(ctx));
+  const feedback = id === undefined ? [] : [feedbackRow(id)];
+
+  // Not a raid screen, but the member typed the boss and the gym: what they typed is reported,
+  // or, when several gyms fit what they typed, they choose among those.
+  if (
+    decision.kind === 'refuse' &&
+    decision.reason === 'not-a-raid-screen' &&
+    reported &&
+    gymAnswer?.kind !== undefined
+  ) {
+    const time = reportedTime(ctx, reported, typedTime, now);
+    const typedOnly: PendingReport = {
+      reported,
+      time,
+      regionChannelId,
+      gymIds: [],
+      note: 'I could not read the screenshot, so I used what you typed.',
+    };
+    if (gymAnswer.kind === 'gym') {
+      await withGym(interaction, ctx, { ...typedOnly, gymIds: [gymAnswer.gym.id] }, gymAnswer.gym);
+    } else if (typedHits) {
+      await askGym(
+        interaction,
+        ctx,
+        typedOnly,
+        typedHits,
+        `I could not read the screenshot. Several gyms fit "${plain(truncate(typedGymText, 80))}". Which one do you mean?`,
+        true,
+      );
+    }
+    return;
+  }
+  // Several gyms fit what was typed and the screenshot named none of them: the member chooses.
+  const mustAsk =
+    typedHits !== undefined &&
+    !typedHits.some((gym) => gym.id === report.gym.gymId) &&
+    !(decision.kind === 'refuse' && decision.reason !== 'no-gym');
+  if (decision.kind === 'refuse' && !mustAsk) {
+    await interaction.editReply({
+      content: truncate(
+        [
+          refusalWords(decision.reason),
+          'Nothing was reported. This is what I read:',
+          '',
+          ...read,
+        ].join('\n'),
+        MESSAGE,
+      ),
+      components: feedback,
+    });
+    return;
+  }
+  const guildRow = await ctx.guilds.idFor(guildIdOf(interaction));
+  const gyms =
+    typedHits ??
+    (guildRow === undefined ? [] : gymCandidates(ctx, regionChannelId, guildRow, report.gym));
+  const [first] = gyms;
+  const assumed =
+    decision.kind === 'report' && !mustAsk
+      ? decision
+      : first
+        ? outcome.withGym(first.id)
+        : decision;
+  if (assumed.kind === 'ask') {
+    // A raid screen always shows its tier; this one did not, and no menu can settle that.
+    await interaction.editReply({
+      content: truncate(
+        [
+          'I could not tell the tier of this raid, so nothing was reported. Use `/raid` again and pick the boss or the egg.',
+          '',
+          ...read,
+        ].join('\n'),
+        MESSAGE,
+      ),
+      components: feedback,
+    });
+    return;
+  }
+  if (assumed.kind === 'refuse') {
+    await interaction.editReply({
+      content: truncate(
+        [
+          refusalWords(assumed.reason),
+          'Nothing was reported. This is what I read:',
+          '',
+          ...read,
+        ].join('\n'),
+        MESSAGE,
+      ),
+      components: feedback,
+    });
+    return;
+  }
+  const request = screenshotRequest(assumed.raid, reported, regionChannelId, {
+    id,
+    timeUncertain: assumed.raid.timeUncertain,
+    doubts: assumed.doubts.filter((doubt) => doubt !== 'gym-unclear'),
+  });
+  if (decision.kind === 'report' && !mustAsk) {
+    const gym = ctx.gyms.get(decision.raid.gymId);
+    if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
+    await withGym(interaction, ctx, request, gym);
+    return;
+  }
+  if (gyms.length === 0) {
+    await interaction.editReply({ content: refusalWords('no-gym'), components: feedback });
+    return;
+  }
+  const what = report.gym.read ? `"${plain(truncate(report.gym.read, 80))}"` : 'no gym name';
+  await askGym(
+    interaction,
+    ctx,
+    request,
+    gyms,
+    typedHits
+      ? `Several gyms fit "${plain(truncate(typedGymText, 80))}". Which one do you mean?`
+      : `Which gym is this? I read ${what}, and more than one gym fits.`,
+    true,
   );
-  return parts.length === 0 ? undefined : truncate(parts.join(' · '), 100);
 }
 
-export const raid: SimpleCommand = {
-  data: new SlashCommandBuilder()
+/**
+ * Without a screenshot, a report needs the boss and the gym; refused here, before the work, so
+ * that it does not count against the throttle.
+ */
+const requireWhatToReport: Guard = (interaction, ctx) => {
+  if (!interaction.isChatInputCommand()) return;
+  const screenshot =
+    ctx.config.settings.ocr.enabled && interaction.options.getAttachment('screenshot') !== null;
+  if (screenshot) {
+    // Beside a screenshot the time is read once the screenshot is: a text that is no time at
+    // all is refused now.
+    const time = interaction.options.getString('time');
+    if (time !== null && time.trim() !== '' && !readableTime(ctx, time, Date.now())) {
+      throw new UserError(
+        `I could not read "${plain(truncate(time, 80))}" as a time. Try \`20\` (minutes from now) or \`6:15pm\`.`,
+      );
+    }
+    return;
+  }
+  const missing = ['boss', 'gym'].filter(
+    (name) => (interaction.options.getString(name)?.trim() ?? '') === '',
+  );
+  if (missing.length > 0) {
+    throw new UserError(
+      `Give the ${missing.join(' and the ')} of the raid (or attach a screenshot of it).`,
+    );
+  }
+};
+
+/** The definition: with the option `screenshot` where screenshots are read. */
+function raidData(screenshots: boolean) {
+  const data = new SlashCommandBuilder()
     .setName('raid')
     .setDescription('Report a raid or an egg at a gym')
     .addStringOption((option) =>
       option
         .setName('boss')
         .setDescription('The boss, or the tier of an egg: pick from the list')
-        .setRequired(true)
+        .setRequired(!screenshots)
         .setMaxLength(100)
         .setAutocomplete(true),
     )
@@ -183,7 +470,7 @@ export const raid: SimpleCommand = {
       option
         .setName('gym')
         .setDescription('The gym: type part of its name and pick from the list')
-        .setRequired(true)
+        .setRequired(!screenshots)
         .setMaxLength(100)
         .setAutocomplete(true),
     )
@@ -194,76 +481,103 @@ export const raid: SimpleCommand = {
           'For an egg: when it hatches. For a boss: when the raid ends. E.g. 20 or 6:15pm',
         )
         .setMaxLength(40),
-    ),
-  help: {
-    category: 'raid-crud',
-    details:
-      "Creates a post for the raid in the raid forum of the gym's region. Pick the boss (or the " +
-      'tier, for an egg) and the gym from the lists that appear while you type. The time is ' +
-      'optional: minutes from now (`20`) or a clock time (`6:15pm`); for an egg it is when the ' +
-      'egg hatches, for a boss when the raid ends. If the gym already has a raid, you are shown ' +
-      'its post instead.',
-    examples: [
-      '/raid boss:t5 gym:Big Fountain time:25',
-      '/raid boss:yveltal gym:Library time:6:15pm',
-    ],
-  },
-  guards: [requireRegion],
-  defer: 'ephemeral',
-  throttle: { uses: 20, perSeconds: 900 },
+    );
+  if (screenshots) {
+    data.addAttachmentOption((option) =>
+      option
+        .setName('screenshot')
+        .setDescription('A screenshot of the raid: I read the gym, the time and the boss from it'),
+    );
+  }
+  return data;
+}
 
-  async execute(interaction, ctx) {
-    const regionChannelId = regionChannelOf(interaction, ctx);
-    const reported = reportedBoss(ctx, interaction.options.getString('boss', true));
-    const time = reportedTime(ctx, reported, interaction.options.getString('time'), Date.now());
-    const typedGym = interaction.options.getString('gym', true);
-    const answer = reportedGym(ctx, regionChannelId, typedGym);
-    const request: PendingReport = { reported, time, regionChannelId, gymIds: [] };
-    if (answer.kind === 'none') {
-      throw new UserError(
-        `I found no gym for "${plain(truncate(typedGym, 80))}". Type part of its name and pick it from the list.`,
+const DETAILS =
+  "Creates a post for the raid in the raid forum of the gym's region. Pick the boss (or the " +
+  'tier, for an egg) and the gym from the lists that appear while you type. The time is ' +
+  'optional: minutes from now (`20`) or a clock time (`6:15pm`); for an egg it is when the ' +
+  'egg hatches, for a boss when the raid ends. If the gym already has a raid, you are shown ' +
+  'its post instead.';
+
+const SCREENSHOT_DETAILS =
+  ' Or attach a screenshot of the raid instead: I read the gym, the time, the tier and the ' +
+  'boss from it, and ask only when I am not sure which gym it is. What you type beside it ' +
+  'counts instead of what I read.';
+
+function raidCommand(screenshots: boolean): SimpleCommand {
+  return {
+    data: raidData(screenshots),
+    help: {
+      category: 'raid-crud',
+      details: screenshots ? DETAILS + SCREENSHOT_DETAILS : DETAILS,
+      examples: [
+        '/raid boss:t5 gym:Big Fountain time:25',
+        '/raid boss:yveltal gym:Library time:6:15pm',
+        ...(screenshots ? ['/raid screenshot:(a raid screenshot)'] : []),
+      ],
+    },
+    guards: [requireRegion, requireWhatToReport],
+    defer: 'ephemeral',
+    throttle: { uses: 20, perSeconds: 900 },
+
+    async execute(interaction, ctx) {
+      const regionChannelId = regionChannelOf(interaction, ctx);
+      const attachment = ctx.config.settings.ocr.enabled
+        ? interaction.options.getAttachment('screenshot')
+        : null;
+      if (attachment) {
+        await reportFromScreenshot(interaction, ctx, regionChannelId, attachment);
+        return;
+      }
+      const reported = reportedBoss(ctx, interaction.options.getString('boss', true));
+      const time = reportedTime(ctx, reported, interaction.options.getString('time'), Date.now());
+      const typedGym = interaction.options.getString('gym', true);
+      const answer = reportedGym(ctx, regionChannelId, typedGym);
+      const request: PendingReport = { reported, time, regionChannelId, gymIds: [] };
+      if (answer.kind === 'none') {
+        throw new UserError(
+          `I found no gym for "${plain(truncate(typedGym, 80))}". Type part of its name and pick it from the list.`,
+        );
+      }
+      if (answer.kind === 'gym') {
+        await withGym(interaction, ctx, request, answer.gym);
+        return;
+      }
+      const several = `Several gyms fit "${plain(truncate(typedGym, 80))}". Which one do you mean?`;
+      await askGym(
+        interaction,
+        ctx,
+        request,
+        answer.gyms,
+        answer.gyms.length === 1 ? 'Did you mean this gym?' : several,
       );
-    }
-    if (answer.kind === 'gym') {
-      await withGym(interaction, ctx, request, answer.gym);
-      return;
-    }
-    const token = pending.put(interaction.user.id, {
-      ...request,
-      gymIds: answer.gyms.map((gym) => gym.id),
-    });
-    const menu = new StringSelectMenuBuilder()
-      .setCustomId(encodeCustomId({ kind: KIND, id: token, action: 'gym' }))
-      .setPlaceholder('Choose the gym')
-      .addOptions(
-        answer.gyms.map((gym) => {
-          const description = menuDescription(interaction, ctx, regionChannelId, gym);
-          return {
-            label: truncate(gym.name, 100),
-            value: String(gym.id),
-            ...(description === undefined ? {} : { description }),
-          };
-        }),
+    },
+
+    async autocomplete(interaction, ctx) {
+      const focused = interaction.options.getFocused(true);
+      if (focused.name === 'boss') {
+        await interaction.respond(bossChoices(ctx, focused.value));
+        return;
+      }
+      const regionName = (channelId: string): string | undefined =>
+        interaction.guild?.channels.cache.get(channelId)?.name;
+      await interaction.respond(
+        gymChoices(ctx, regionChannelOf(interaction, ctx), focused.value, regionName),
       );
-    const several = `Several gyms fit "${plain(truncate(typedGym, 80))}". Which one do you mean?`;
-    await interaction.editReply({
-      content: answer.gyms.length === 1 ? 'Did you mean this gym?' : several,
-      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
-    });
-  },
+    },
+  };
+}
 
-  async autocomplete(interaction, ctx) {
-    const focused = interaction.options.getFocused(true);
-    if (focused.name === 'boss') {
-      await interaction.respond(bossChoices(ctx, focused.value));
-      return;
-    }
-    const regionName = (channelId: string): string | undefined =>
-      interaction.guild?.channels.cache.get(channelId)?.name;
-    await interaction.respond(
-      gymChoices(ctx, regionChannelOf(interaction, ctx), focused.value, regionName),
-    );
-  },
+const withScreenshots = raidCommand(true);
+const withoutScreenshots = raidCommand(false);
+
+/**
+ * `/raid`: as an installation that reads screenshots offers it (`ocr.enabled`), with the option
+ * `screenshot` and the boss and the gym optional; otherwise without it, both required.
+ */
+export const raid: SimpleCommand = {
+  ...withScreenshots,
+  forConfig: (config) => (config.settings.ocr.enabled ? withScreenshots : withoutScreenshots),
 };
 
 /** The request a control of this command belongs to; answers the member when there is none. */
@@ -312,7 +626,12 @@ export const raidControls: ComponentHandler = {
     const gym = request.gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
     if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
     await interaction.deferUpdate();
-    await afterDeferral(interaction, () => withGym(interaction, ctx, request, gym));
+    // The screenshot's record keeps which gym its member chose.
+    const shot = request.screenshot?.id;
+    if (shot !== undefined && request.gymIds.length > 1) await ctx.screenshots.picked(shot, gym.id);
+    await afterDeferral(interaction, () =>
+      withGym(interaction, ctx, { ...request, gymIds: [gym.id] }, gym),
+    );
   },
 
   async button(interaction, id, ctx) {
diff --git a/src/commands/screenshots/gym-question.ts b/src/commands/screenshots/gym-question.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6fdeb16911147d5b09d17d76eee076855c4e546a
--- /dev/null
+++ b/src/commands/screenshots/gym-question.ts
@@ -0,0 +1,74 @@
+import type { APISelectMenuOption } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import type { ScreenshotReport } from '../../domain/ocr/screenshot-report.js';
+import { truncate } from '../../render/text.js';
+import { gymInGuild } from '../../services/region-directory.js';
+
+/** A select menu holds this many options. */
+const MENU_SIZE = 25;
+
+/**
+ * The gyms a screenshot's gym may be, for the member to choose from: a fresh search of the text
+ * whose search decided (or the whole text read), by names only, this server's gyms only, as
+ * many as a menu holds, so that every gym of that name is offered (several Starbucks of one
+ * region), and the gym the report took among them.
+ */
+export function gymCandidates(
+  ctx: Pick<AppContext, 'gyms' | 'regions'>,
+  regionChannelId: string | undefined,
+  guildRow: number,
+  gym: ScreenshotReport['gym'],
+): Gym[] {
+  const text = gym.searched ?? gym.read ?? '';
+  const found =
+    text.trim() === ''
+      ? []
+      : ctx.gyms
+          .search(regionChannelId ?? null, text, { nameOnly: true })
+          .filter((hit) => gymInGuild(ctx.gyms, ctx.regions, hit.gym.id, guildRow))
+          .map((hit) => hit.gym);
+  const taken = gym.gymId === null ? undefined : ctx.gyms.get(gym.gymId);
+  const all = taken && !found.some((g) => g.id === taken.id) ? [taken, ...found] : found;
+  return all.slice(0, MENU_SIZE);
+}
+
+/**
+ * What a gym menu says under a gym, so that gyms of one name are told apart: its nickname, the
+ * region it lies in when that is not the region the command was used in (`regionName` names a
+ * region channel), and its own description.
+ */
+export function menuDescription(
+  ctx: Pick<AppContext, 'gyms'>,
+  regionChannelId: string | undefined,
+  gym: Gym,
+  regionName: (channelId: string) => string | undefined,
+): string | undefined {
+  const regions = ctx.gyms.regionsOf(gym.id);
+  const [elsewhere] = regions;
+  const region =
+    regionChannelId !== undefined && elsewhere !== undefined && !regions.includes(regionChannelId)
+      ? regionName(elsewhere)
+      : undefined;
+  const parts = [gym.nickname, region, gym.description].filter(
+    (part): part is string => part !== null && part !== undefined && part.trim() !== '',
+  );
+  return parts.length === 0 ? undefined : truncate(parts.join(' · '), 100);
+}
+
+/** The options of a gym menu: each gym by its name, told apart by `menuDescription`. */
+export function gymMenuOptions(
+  ctx: Pick<AppContext, 'gyms'>,
+  regionChannelId: string | undefined,
+  gyms: readonly Gym[],
+  regionName: (channelId: string) => string | undefined,
+): APISelectMenuOption[] {
+  return gyms.map((gym) => {
+    const description = menuDescription(ctx, regionChannelId, gym, regionName);
+    return {
+      label: truncate(gym.name, 100),
+      value: String(gym.id),
+      ...(description === undefined ? {} : { description }),
+    };
+  });
+}
diff --git a/src/discord/command.ts b/src/discord/command.ts
index 32e650acdc0db691af3018d7e6f32540a85b7040..5f1db2d021b17c3fe663d2871c08acced366d6bc 100644
--- a/src/discord/command.ts
+++ b/src/discord/command.ts
@@ -97,6 +97,11 @@ interface CommandBase {
 /** A command without subcommands: `/join`, `/raid`. */
 export interface SimpleCommand extends CommandBase, CommandHandler {
   subcommands?: undefined;
+  /**
+   * For a command some of whose options need something optional (`/raid`'s screenshot): the
+   * command as an installation with this configuration offers it.
+   */
+  forConfig?: (config: Config) => SimpleCommand;
 }
 
 export interface SubcommandHandler extends CommandHandler {
@@ -132,7 +137,7 @@ export function enabledCommands(
 ): CommandModule[] {
   return commands
     .filter((command) => command.enabled?.(config) ?? true)
-    .map((command) => (command.subcommands ? (command.forConfig?.(config) ?? command) : command));
+    .map((command) => command.forConfig?.(config) ?? command);
 }
 
 /** The path of a subcommand as the keys of `GroupedCommand.subcommands` spell it. */
diff --git a/src/domain/party/raid.ts b/src/domain/party/raid.ts
index db2996a6bd0f0160fa865ff2e37f3cb53a738d8f..2d29744f941fa52d7b0733f8f1d6c0f5a7569137 100644
--- a/src/domain/party/raid.ts
+++ b/src/domain/party/raid.ts
@@ -37,6 +37,8 @@ export interface NewRaid {
   tier: RaidTier;
   /** Null for an egg; a boss means the raid was seen hatched. */
   boss: RaidBossRef | null;
+  /** Seen hatched without a boss anybody could tell (a screenshot report). */
+  hatched?: boolean;
   fastMove?: string | null;
   chargedMove?: string | null;
   now: number;
@@ -201,9 +203,9 @@ export function createRaid(input: NewRaid, rules: RaidDurationRules): RaidParty
       boss,
       fastMove: boss ? (input.fastMove ?? null) : null,
       chargedMove: boss ? (input.chargedMove ?? null) : null,
-      reportedHatched: boss !== null,
+      reportedHatched: boss !== null || input.hatched === true,
       hatchedDuration: null,
-      stageSeen: boss === null ? 'egg' : 'hatched',
+      stageSeen: boss === null && input.hatched !== true ? 'egg' : 'hatched',
       screenshot: null,
     },
   };
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 336a23cbafd7b8642a4a9f8472eaec3b6dbcc02d..77d9ba8b3e14101c93ea90b1424625fa76047d34 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -29,6 +29,7 @@ import {
   type TrainParty,
   setSaved,
   endParty,
+  type RaidScreenshot,
 } from '../domain/party/party.js';
 import { certainMoves, createRaid, setEndTime, setHatchTime } from '../domain/party/raid.js';
 import { carriedOver, relocatedRaid } from '../domain/party/relocate.js';
@@ -89,6 +90,13 @@ export interface RaidReport {
   tier: RaidTier;
   /** Null for an egg; a boss means the raid was seen hatched. */
   boss: RaidBossRef | null;
+  /** Seen hatched although nobody could tell the boss (a screenshot report): no egg. */
+  hatched?: boolean;
+  /**
+   * The screenshot the raid was reported from (`ctx.screenshots`), which its post offers for
+   * feedback, and whether its time is a guess.
+   */
+  screenshot?: RaidScreenshot;
   /** Left out, a move is set when the boss has only that one (`certainMoves`). */
   fastMove?: string | null;
   chargedMove?: string | null;
@@ -520,6 +528,7 @@ export class PartyService {
         autoStatus: report.autoStatus,
         tier: report.tier,
         boss: report.boss,
+        ...(report.hatched ? { hatched: true } : {}),
         fastMove: report.fastMove ?? certain.fastMove,
         chargedMove: report.chargedMove ?? certain.chargedMove,
         now,
@@ -529,6 +538,8 @@ export class PartyService {
     if (report.time && 'hatch' in report.time)
       raid = setHatchTime(raid, report.time.hatch, rules, now);
     else if (report.time) raid = setEndTime(raid, report.time.end, rules, now);
+    if (report.screenshot)
+      raid = { ...raid, raid: { ...raid.raid, screenshot: report.screenshot } };
     raid = noteMember(raid, report.reporterId, report.reporter ?? {});
     // The view does not depend on the stored row, so a renderer that fails stores nothing.
     const rendered = renderRaidPost(this.view({ ...raid, forumChannelId: forumId }));
diff --git a/src/services/raid-change-service.test.ts b/src/services/raid-change-service.test.ts
index b3c90d01174a3a4a9c3f59ef732e50ff360bae61..13c5de5e2ab087a6ca43a08df6073bb331b3760c 100644
--- a/src/services/raid-change-service.test.ts
+++ b/src/services/raid-change-service.test.ts
@@ -99,6 +99,25 @@ describe('RaidChangeService: times', () => {
     ]);
   });
 
+  it('makes a time guessed from a screenshot sure by a time set, also the same, not by a length', async () => {
+    const screenshot = { id: 'Ab3_-xY9zQ12', timeUncertain: true };
+    const made = await reportedRaid({ time: { hatch: HATCH }, screenshot });
+    expect(made.current()).toMatchObject({ raid: { screenshot } });
+    const outcome = await made.raids.setHatchTime(made.party.id, alice, HATCH);
+    expect(outcome).toMatchObject({ kind: 'ok', changed: true });
+    expect(made.current()).toMatchObject({
+      raid: { screenshot: { id: 'Ab3_-xY9zQ12', timeUncertain: false } },
+    });
+    // A length is no time: the guess stays a guess (Matt, 2026-10-14).
+    const lengthened = await reportedRaid({ time: { hatch: HATCH }, screenshot });
+    await lengthened.raids.setDuration(lengthened.party.id, alice, 30);
+    expect(lengthened.current()).toMatchObject({ raid: { screenshot } });
+    // An end set by a member does.
+    const ended = await reportedRaid({ time: { hatch: HATCH }, screenshot });
+    await ended.raids.setEndTime(ended.party.id, alice, END);
+    expect(ended.current()).toMatchObject({ raid: { screenshot: { timeUncertain: false } } });
+  });
+
   it('says nothing and writes nothing for the time the raid already has', async () => {
     const made = await reportedRaid({ time: { hatch: HATCH } });
     const writes = made.storage.writes.length;
diff --git a/src/services/raid-change-service.ts b/src/services/raid-change-service.ts
index 9221a7f8bdca5df5748dcec45e11d6eeabf910b5..cb6a31b04710ba74c67225ce47358bc12ea661ed 100644
--- a/src/services/raid-change-service.ts
+++ b/src/services/raid-change-service.ts
@@ -92,12 +92,16 @@ export interface RaidChangeServiceOptions {
  */
 export type GymMove = { kind: 'local' } | { kind: 'region'; region: Region } | { kind: 'nowhere' };
 
-/** The party as it was when setting a time or a length changed none of its times. */
+/**
+ * The party as it was when setting a time or a length changed none of its times (nor made a time
+ * guessed from a screenshot sure).
+ */
 function unlessSame(before: RaidParty, after: RaidParty): RaidParty {
   return before.hatchTime === after.hatchTime &&
     before.endTime === after.endTime &&
     before.lastPossibleTime === after.lastPossibleTime &&
     before.raid.hatchedDuration === after.raid.hatchedDuration &&
+    before.raid.screenshot === after.raid.screenshot &&
     before.deletionTime === after.deletionTime
     ? before
     : after;
diff --git a/src/services/screenshot-service.ts b/src/services/screenshot-service.ts
index 6d1ee2e0f177869cf137539d6b7a9ae457ca1690..935762dbd3ab150f9b26cd9a9c07906b29bbd973 100644
--- a/src/services/screenshot-service.ts
+++ b/src/services/screenshot-service.ts
@@ -59,8 +59,12 @@ export interface ScreenshotWhere {
   uploadedAt: number;
   use: ScreenshotUse;
   senderId: string;
-  /** What the member typed beside it (`/raid`), in the place of what is read. */
-  typed?: TypedValues;
+  /**
+   * What the member typed beside it (`/raid`), in the place of what is read; a function of the
+   * report for what can only be read once the report is known (a typed time is a hatch or an end
+   * by the stage).
+   */
+  typed?: TypedValues | ((report: ScreenshotReport) => TypedValues);
   /** Told once when the screenshot has to wait, with how many are ahead. */
   onQueued?: (ahead: number) => void;
   /**
@@ -77,6 +81,11 @@ export type ScreenshotOutcome =
       id: string | undefined;
       report: ScreenshotReport;
       decision: ScreenshotDecision;
+      /**
+       * The decision had the member named this gym (a question about the gym answered, or a
+       * gym typed beside the screenshot): what the raid would be.
+       */
+      withGym: (gymId: number) => ScreenshotDecision;
     }
   /** Larger than a screenshot can be. */
   | { kind: 'too-large' }
@@ -139,10 +148,10 @@ export class ScreenshotService implements Screenshots {
       source.name,
     );
     const read = screenshotReport(outcome.reading, reportFrom);
-    const { typed } = where;
+    const typed = typeof where.typed === 'function' ? where.typed(read) : where.typed;
     const report = typed ? withTyped(read, typed) : read;
     const { settings } = context.config;
-    const decision = decide(report, {
+    const deciding = {
       now: where.uploadedAt,
       hatchedMinutes: (tier: RaidTier, hatchTime: number) =>
         raidDurationsAt(
@@ -150,8 +159,10 @@ export class ScreenshotService implements Screenshots {
           hatchTime,
           raidDurationRules(settings, context.raidEvents.events()),
         ).hatched,
-      autoset: (tier) => context.raidBosses.autoset(tier),
-    });
+      autoset: (tier: RaidTier) => context.raidBosses.autoset(tier),
+    };
+    const decision = decide(report, deciding);
+    const withGym = (gymId: number) => decide(withTyped(report, { gymId }), deciding);
     // A passive read that was refused is a member's ordinary picture: nothing is kept. A
     // picture that is no raid screen keeps its record alone.
     const passiveRefusal = where.use === 'passive' && decision.kind === 'refuse';
@@ -178,7 +189,7 @@ export class ScreenshotService implements Screenshots {
           },
           image,
         );
-    return { kind: 'read', id, report, decision };
+    return { kind: 'read', id, report, decision, withGym };
   }
 
   get(id: string): Promise<KeptScreenshot | 'gone' | undefined> {
diff --git a/test/support/gyms.ts b/test/support/gyms.ts
index 8cc23434ec3c334f58bfdda5a6516acc367ad792..960e7b9890b30be8c9fa434e56db396ae69a2bad 100644
--- a/test/support/gyms.ts
+++ b/test/support/gyms.ts
@@ -119,6 +119,9 @@ function gym(id: number, name: string, lat: number, lon: number, more: Partial<G
   };
 }
 
+/** A gym with these values and nothing else, for a test that needs one beside `testGyms()`. */
+export const testGym = gym;
+
 /**
  * Invented gyms of an invented town. Ids 1 to 6 and 11, 12 lie in West, 7 to 9 in East, 10 in
  * no region. Gym 4 is close enough to the border to be a neighbour for East, gym 7 for West.
diff --git a/test/support/providers.ts b/test/support/providers.ts
index 81a5b8f5d20bf8f273202748197c0fa9b819df6b..0189f6a9e4b8f82df6229228786f22af046b267a 100644
--- a/test/support/providers.ts
+++ b/test/support/providers.ts
@@ -1,6 +1,7 @@
 import { CURATED_NICKNAMES } from '../../src/domain/pogo/nicknames.js';
 import { PokemonSearch, mergeNicknames } from '../../src/domain/pogo/pokemon-search.js';
 import { GymLookup } from '../../src/domain/search/gym-lookup.js';
+import type { Gym } from '../../src/db/repositories/gym-repository.js';
 import type { GymProvider } from '../../src/services/gym-directory.js';
 import type { RegionProvider } from '../../src/services/region-directory.js';
 import type { PokemonFinder } from '../../src/services/pokemon-search-service.js';
@@ -13,10 +14,13 @@ import { catalogueFixture } from './game-data.js';
 import { testGyms, testRegions } from './gyms.js';
 import { TEST_SETTINGS_PATH } from './test-settings.js';
 
-/** The invented gyms and regions, searchable, with the words the test settings ignore. */
-export function gymsFixture(): GymProvider {
+/**
+ * The invented gyms and regions, searchable, with the words the test settings ignore; `extra`
+ * gyms beside them for a test that needs more.
+ */
+export function gymsFixture(extra: readonly Gym[] = []): GymProvider {
   const { blacklistWords } = loadSettings(TEST_SETTINGS_PATH);
-  return new GymLookup(testGyms(), testRegions(), blacklistWords);
+  return new GymLookup([...testGyms(), ...extra], testRegions(), blacklistWords);
 }
 
 /**
````

---

### Task 8: Screenshots posted with a mention of the bot, and passively

Prototype commit: `46c677678ff80a298fe1aa3966556502ba614772`

Screenshots posted with a mention of the bot in a region channel (and,
with ocr.passive, without one): ScreenshotTrigger reads every image of
the message (up to ten) one after the other, each its own report and one
use of the member's throttle (20 in 15 minutes); a busy or missing
reader stops it and is said once; refusals of one message are one reply;
a gym question (only the author may answer; two minutes) is one per
image; a clear gym of another region is asked about. The message is
deleted when every image made or joined a raid and it says nothing else
(otherwise it gets ✅); a raid that exists is answered with its post.
Passive reads answer only when a raid is made. postedMessage adapts a
discord.js message; app.ts wires MessageCreate and closes the trigger at
shutdown before the reader.

**Interfaces:**
- Consumes: Tasks 4 and 7.
- Produces: `ScreenshotTrigger`, `PostedMessage`, `ReplyPayload`, `SentReply`, `pendingShots`, `chooseShotGym`, `cancelShot`, `MENTION_THROTTLE`, `QUESTION_MS`, `READING`, `DONE` (`src/commands/screenshots/mention.ts`); `postedMessage(message)` (`src/discord/screenshot-message.ts`).

**Files:**

```
 src/app.ts                                  |  21 +-
 src/commands/raids/raid.ts                  |   4 +-
 src/commands/screenshots/feedback.ts        |  33 ++-
 src/commands/screenshots/gym-question.ts    |   9 +
 src/commands/screenshots/mention.test.ts    | 378 +++++++++++++++++++++++++++++++++
 src/commands/screenshots/mention.ts         | 546 ++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/screenshots/read-screenshot.ts |   3 +-
 src/commands/screenshots/shot-kind.ts       |  10 +
 src/discord/screenshot-message.ts           |  58 +++++
 src/render/screenshot-reading.test.ts       |   9 +
 src/render/screenshot-reading.ts            |  17 +-
 11 files changed, 1059 insertions(+), 29 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/screenshots/mention.test.ts src/render/screenshot-reading.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 46c677678ff80a298fe1aa3966556502ba614772 -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Screenshots posted with a mention of the bot, and passively`, the body above and the trailer, staging exactly
  `src/app.ts src/commands/raids/raid.ts src/commands/screenshots/feedback.ts src/commands/screenshots/gym-question.ts src/commands/screenshots/mention.test.ts src/commands/screenshots/mention.ts src/commands/screenshots/read-screenshot.ts src/commands/screenshots/shot-kind.ts src/discord/screenshot-message.ts src/render/screenshot-reading.test.ts src/render/screenshot-reading.ts`.

````diff
diff --git a/src/app.ts b/src/app.ts
index ed25a35f16cc4f0395a651f7554b280b3ac33da0..b18231f6e0fc224a161315c257712bc450f566b9 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -3,6 +3,7 @@ import type { AppContext } from './app-context.js';
 import { commands as allCommands } from './commands/index.js';
 import { wildExceptionsOf } from './commands/notifications/wild.js';
 import { components } from './components/index.js';
+import { ScreenshotTrigger } from './commands/screenshots/mention.js';
 import { loadConfig } from './config/index.js';
 import { configWarnings } from './config/warnings.js';
 import { dbConfigFrom } from './db/db-config.js';
@@ -33,6 +34,7 @@ import { DiscordDmGateway } from './discord/dm-gateway.js';
 import { attachGatewayHandlers } from './discord/gateway-events.js';
 import { DiscordMemberDirectory } from './discord/member-directory.js';
 import { DiscordRoleGateway } from './discord/role-gateway.js';
+import { postedMessage } from './discord/screenshot-message.js';
 import { DiscordPartyGateway } from './discord/party-gateway.js';
 import { syncGuilds } from './discord/guild-sync.js';
 import { InteractionRouter } from './discord/router.js';
@@ -476,6 +478,8 @@ export async function startApp(
   // said in the log of the start, and the help of `/wild` names the ones it does.
   wildExceptionsOf(ctx);
   const router = new InteractionRouter(ctx, commands, components);
+  // Screenshots posted in a region channel with a mention of the bot (or, passive, without).
+  const screenshotTrigger = new ScreenshotTrigger({ ctx });
   // Resolved by the client that ends up connected (the login may try several).
   let markConnected: () => void = () => undefined;
   const connected = new Promise<void>((resolve) => {
@@ -530,7 +534,15 @@ export async function startApp(
       // Only that a member wrote, and where: the archive warning of a busy post is said again.
       // Bots (this one, others, webhooks) do not count.
       client.on(Events.MessageCreate, (message) => {
-        if (!message.author.bot) scheduler.activity(message.channelId);
+        if (message.author.bot) return;
+        scheduler.activity(message.channelId);
+        // Only a message with an attachment can be a screenshot; the trigger decides the rest.
+        if (message.attachments.size === 0) return;
+        try {
+          void screenshotTrigger.handle(postedMessage(message));
+        } catch (err) {
+          log.error({ err }, 'could not read the screenshots of a message');
+        }
       });
       client.on(Events.Error, (err) => log.error({ err }, 'discord client error'));
       client.on(Events.Warn, (message) => log.warn(message));
@@ -557,6 +569,11 @@ export async function startApp(
     [
       // First: nothing may start changing parties while the rest is being flushed.
       { name: 'party clock', timeoutMs: 10_000, run: () => scheduler.stop() },
+      // No screenshot is read from here on: the trigger first (it stops between images and sends
+      // nothing more; its replies go while Discord is there), then the reader. A report on its
+      // way finishes before the posts are flushed.
+      { name: 'screenshot replies', timeoutMs: 3_000, run: () => screenshotTrigger.close() },
+      { name: 'screenshot reader', timeoutMs: 5_000, run: () => screenshotReader.close() },
       {
         name: 'game data refresh',
         timeoutMs: 1_000,
@@ -605,8 +622,6 @@ export async function startApp(
       // Direct messages go on at their usual rate for ten seconds (spec 9); the rest is dropped.
       { name: 'direct messages', timeoutMs: 15_000, run: () => dms.drain(DM_DRAIN_MS) },
       { name: 'discord', timeoutMs: 5_000, run: () => client.destroy() },
-      // What waits is answered as unavailable; the reading process is ended.
-      { name: 'screenshot reader', timeoutMs: 5_000, run: () => screenshotReader.close() },
       { name: 'unown wants', timeoutMs: 5_000, run: () => unownWants.flush() },
       // A write in flight must finish before the pool closes.
       { name: 'parties', timeoutMs: 5_000, run: () => parties.whenIdle() },
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index 8ed9263d69696d26af9352e547cf301d783e46c6..93c70926880ff37c598e51689ce1be902535cc2e 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -24,8 +24,8 @@ import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { doubtLines, readingLines, refusalWords } from '../../render/screenshot-reading.js';
 import { plain, truncate } from '../../render/text.js';
 import { PendingRequests } from '../../services/pending-requests.js';
-import { feedbackRow, gymNamerOf, showRow } from '../screenshots/feedback.js';
-import { gymCandidates, gymMenuOptions } from '../screenshots/gym-question.js';
+import { feedbackRow, showRow } from '../screenshots/feedback.js';
+import { gymCandidates, gymMenuOptions, gymNamerOf } from '../screenshots/gym-question.js';
 import { readAttached } from '../screenshots/read-screenshot.js';
 import {
   bossChoices,
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
index 308e7dc33d6c751b43b5cbf0fe146f2e2e6103ba..43b69fa751df539b110e5e2764593257ec969ceb 100644
--- a/src/commands/screenshots/feedback.ts
+++ b/src/commands/screenshots/feedback.ts
@@ -21,18 +21,11 @@ import {
   type FeedbackElement,
   type StoredDecision,
 } from '../../domain/ocr/screenshot-record.js';
-import { readingLines, refusalWords, type GymNamer } from '../../render/screenshot-reading.js';
+import { readingLines, refusalWords } from '../../render/screenshot-reading.js';
 import { truncate } from '../../render/text.js';
-
-/**
- * The custom-id kind of the controls about a screenshot. With a screenshot's id (12 characters):
- * `shot:<id>:right` ("All right") and `shot:<id>:wrong` ("Something is wrong", which opens the
- * form `shot:<id>:form`), and `shot:<id>:show` (the reporter's "Screenshot feedback", which
- * shows the screenshot and what was read). With the token of a pending question (`PendingRequests`,
- * 16 characters): the question about the gym of a screenshot a member mentioned the bot with
- * (`src/commands/screenshots/mention.ts`).
- */
-export const SHOT_KIND = 'shot';
+import { gymNamerOf } from './gym-question.js';
+import { cancelShot, chooseShotGym } from './mention.js';
+import { SHOT_KIND } from './shot-kind.js';
 
 /** The ids of the form's two inputs. */
 const ELEMENTS_INPUT = 'elements';
@@ -123,14 +116,6 @@ export function feedbackForm(screenshotId: string): APIModalInteractionResponseC
   };
 }
 
-/** The gym's name as members know it (its nickname first), by id. */
-export function gymNamerOf(ctx: Pick<AppContext, 'gyms'>): GymNamer {
-  return (id) => {
-    const gym = ctx.gyms.get(id);
-    return gym ? gym.nickname || gym.name : undefined;
-  };
-}
-
 /** What Pine did, or would do, with a screenshot, in one sentence. */
 export function decisionWords(decision: StoredDecision): string {
   switch (decision.kind) {
@@ -205,11 +190,21 @@ export const screenshotControls: ComponentHandler = {
       case 'wrong':
         await interaction.showModal(feedbackForm(id.id));
         return;
+      case 'cancel':
+        return cancelShot(interaction, id.id);
       default:
         throw new UserError(STALE_COMPONENT);
     }
   },
 
+  /** The gym menu of the question about a screenshot posted with a mention of the bot. */
+  async select(interaction, id, ctx) {
+    if (id.action !== 'gym' || !interaction.isStringSelectMenu()) {
+      throw new UserError(STALE_COMPONENT);
+    }
+    await chooseShotGym(interaction, id.id, ctx);
+  },
+
   async modal(interaction, id, ctx) {
     if (id.action !== 'form') throw new UserError(STALE_COMPONENT);
     const elements = interaction.fields
diff --git a/src/commands/screenshots/gym-question.ts b/src/commands/screenshots/gym-question.ts
index 6fdeb16911147d5b09d17d76eee076855c4e546a..f600e05324a8c0eb9ffef470eadc91114fb426be 100644
--- a/src/commands/screenshots/gym-question.ts
+++ b/src/commands/screenshots/gym-question.ts
@@ -2,6 +2,7 @@ import type { APISelectMenuOption } from 'discord.js';
 import type { AppContext } from '../../app-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
 import type { ScreenshotReport } from '../../domain/ocr/screenshot-report.js';
+import type { GymNamer } from '../../render/screenshot-reading.js';
 import { truncate } from '../../render/text.js';
 import { gymInGuild } from '../../services/region-directory.js';
 
@@ -72,3 +73,11 @@ export function gymMenuOptions(
     };
   });
 }
+
+/** The gym's name as members know it (its nickname first), by id. */
+export function gymNamerOf(ctx: Pick<AppContext, 'gyms'>): GymNamer {
+  return (id) => {
+    const gym = ctx.gyms.get(id);
+    return gym ? gym.nickname || gym.name : undefined;
+  };
+}
diff --git a/src/commands/screenshots/mention.test.ts b/src/commands/screenshots/mention.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b546fb8d97556fe547909725d557606a19d762d8
--- /dev/null
+++ b/src/commands/screenshots/mention.test.ts
@@ -0,0 +1,378 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
+import { fakeButton, fakeSelect, sent } from '../../../test/support/fake-interactions.js';
+import { EAST_CHANNEL, testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { PARTY_NOW } from '../../../test/support/parties.js';
+import { partyServiceWith } from '../../../test/support/party-service.js';
+import { gymsFixture } from '../../../test/support/providers.js';
+import { screenshotsWith } from '../../../test/support/screenshot-service.js';
+import { eggReading, readingOf } from '../../../test/support/screenshots.js';
+import { createTestContext } from '../../../test/support/test-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import { InteractionRouter } from '../../discord/router.js';
+import type { ScreenReading } from '../../ocr/screen-reader.js';
+import type { OcrOutcome } from '../../services/ocr-service.js';
+import type { ScreenshotSource } from '../../services/screenshot-service.js';
+import { screenshotControls } from './feedback.js';
+import {
+  DONE,
+  READING,
+  ScreenshotTrigger,
+  type PostedMessage,
+  type ReplyPayload,
+} from './mention.js';
+
+const AUTHOR = '700000000000000001';
+const OTHER = '700000000000000002';
+const CLOCK = { hour: 13, minute: 59 };
+
+/** A posted message that records what the trigger did to it. */
+function posted(attachments: ScreenshotSource[], more: Partial<PostedMessage> = {}) {
+  const did: string[] = [];
+  const replies: ReplyPayload[] = [];
+  const message: PostedMessage = {
+    id: '800000000000000001',
+    channelId: WEST_CHANNEL,
+    guildId: '412345678901234567',
+    inThread: false,
+    authorId: AUTHOR,
+    authorBot: false,
+    member: { name: 'Rhea', team: 'instinct' },
+    createdAt: PARTY_NOW,
+    mentionsBot: true,
+    bare: true,
+    attachments,
+    channelName: (id) => (id === EAST_CHANNEL ? 'east' : id === WEST_CHANNEL ? 'west' : undefined),
+    react: (emoji) => {
+      did.push(`react ${emoji}`);
+      return Promise.resolve();
+    },
+    unreact: (emoji) => {
+      did.push(`unreact ${emoji}`);
+      return Promise.resolve();
+    },
+    reply: (payload) => {
+      replies.push(payload);
+      did.push('reply');
+      return Promise.resolve({
+        delete: () => {
+          did.push('reply deleted');
+          return Promise.resolve();
+        },
+      });
+    },
+    delete: () => {
+      did.push('deleted');
+      return Promise.resolve();
+    },
+    ...more,
+  };
+  return { message, did, replies };
+}
+
+async function setup(
+  options: { gyms?: Gym[]; passive?: boolean; enabled?: boolean; questionMs?: number } = {},
+) {
+  const gyms = gymsFixture(options.gyms ?? []);
+  const made = await partyServiceWith([], { gyms });
+  const shots = screenshotsWith(createTestContext({ gyms }).ctx);
+  const base = createTestContext({
+    gyms,
+    partyService: made.service,
+    parties: made.store,
+    regions: made.regions,
+    screenshots: shots.screenshots,
+  }).ctx;
+  const ocr = {
+    ...base.config.settings.ocr,
+    passive: options.passive ?? false,
+    enabled: options.enabled ?? true,
+  };
+  const ctx = {
+    ...base,
+    config: { ...base.config, settings: { ...base.config.settings, ocr } },
+    features: { ocrPassive: options.passive ?? false, autoAssignRole: false },
+  };
+  const trigger = new ScreenshotTrigger({
+    ctx,
+    replyMs: 20,
+    questionMs: options.questionMs ?? 60_000,
+  });
+  const router = new InteractionRouter(ctx, [], [screenshotControls]);
+  const image = (name: string, reading: ScreenReading | OcrOutcome) =>
+    shots.screenshot(name, reading);
+  return { ...shots, ...made, ctx, trigger, router, image };
+}
+
+const egg = () => eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60);
+const waitFor = async (check: () => boolean) => {
+  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
+};
+const menuOf = (reply: ReplyPayload | undefined) =>
+  reply?.components?.[0]?.components[0] as {
+    custom_id: string;
+    options: { value: string; description?: string }[];
+  };
+
+describe('screenshots posted with a mention of the bot', () => {
+  beforeEach(() => {
+    vi.useFakeTimers({ toFake: ['Date'], now: PARTY_NOW });
+  });
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it('reports the raid as the author, thinks meanwhile, and deletes the message', async () => {
+    const { trigger, image, store } = await setup();
+    const { message, did } = posted([image('a.png', egg())]);
+    await trigger.handle(message);
+    const [party] = store.active();
+    expect(party).toMatchObject({ gymId: 2, createdById: AUTHOR });
+    expect(Object.values(party?.attendees ?? {})).toMatchObject([
+      { name: 'Rhea', team: 'instinct' },
+    ]);
+    expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, 'deleted']);
+  });
+
+  it('marks a message that says more than the mention instead of deleting it', async () => {
+    const { trigger, image } = await setup();
+    const { message, did } = posted([image('a.png', egg())], { bare: false });
+    await trigger.handle(message);
+    expect(did).toEqual([`react ${READING}`, `unreact ${READING}`, `react ${DONE}`]);
+  });
+
+  it('answers in one reply what it could not make a raid of, and keeps the message', async () => {
+    const { trigger, image, store } = await setup();
+    const cat = readingOf({ gym: 'Old Stone Fountain' });
+    const { message, did, replies } = posted([
+      image('a.png', egg()),
+      image('b.png', cat),
+      image('c.png', cat),
+      image('d.png', eggReading('Nowhere at all', 5, CLOCK, 600)),
+    ]);
+    await trigger.handle(message);
+    expect(store.active()).toHaveLength(1);
+    expect(replies.map((r) => r.content)).toEqual([
+      '2 of 4: This does not look like the screen of a raid, so I made nothing of it.\n' +
+        '1 of 4: I could not find the gym of this screenshot among this server’s gyms.',
+    ]);
+    expect(did).not.toContain('deleted');
+    await waitFor(() => did.includes('reply deleted'));
+    expect(did).toContain('reply deleted');
+  });
+
+  it('answers a screenshot of a raid that exists with its post, and lets the message go', async () => {
+    const { trigger, image, store, service } = await setup();
+    await trigger.handle(posted([image('a.png', egg())]).message);
+    await service.flush();
+    const again = posted([image('b.png', egg())], { authorId: OTHER });
+    await trigger.handle(again.message);
+    expect(store.active()).toHaveLength(1);
+    expect(again.replies[0]?.content).toMatch(
+      /^There is already a raid at Old Stone Fountain: <#\d+>\. You have been signed up for it\.$/,
+    );
+    expect(again.did).toContain('deleted');
+  });
+
+  it('asks its author which gym, reports the one they choose, and then lets the message go', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061, { nickname: 'Bank fountain' });
+    const { trigger, image, store, router } = await setup({ gyms: [twin] });
+    const { message, replies, did } = posted([image('a.png', egg())]);
+    await trigger.handle(message);
+    expect(store.active()).toEqual([]);
+    expect(did).not.toContain('deleted');
+    const [question] = replies;
+    // The gym is what is asked: it is not named.
+    expect(question?.content).toMatch(
+      /^T5 egg, hatching at <t:\d+:t>\. Which gym is it\? I read "Old Stone Fountain"\.$/,
+    );
+    const menu = menuOf(question);
+    expect(menu.options.map((o) => o.value).sort()).toEqual(['13', '2']);
+    expect(menu.options.find((o) => o.value === '13')?.description).toBe('Bank fountain');
+
+    const stranger = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: OTHER });
+    await router.handle(stranger as never);
+    expect(sent(stranger.reply).content).toBe('That is somebody else’s screenshot.');
+    const author = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: AUTHOR });
+    await router.handle(author as never);
+    expect(author.deleteReply).toHaveBeenCalledTimes(1);
+    expect(sent(author.followUp).content).toMatch(/^Reported the raid at Bank fountain/);
+    expect(store.active()[0]).toMatchObject({ gymId: 13, createdById: AUTHOR });
+    expect(did).toContain('deleted');
+  });
+
+  it('asks about a clear gym of another region rather than report it there, naming the region', async () => {
+    const { trigger, image, store } = await setup();
+    const { message, replies } = posted([
+      image('a.png', eggReading('Harbor Lighthouse Mural', 5, CLOCK, 20 * 60)),
+    ]);
+    await trigger.handle(message);
+    expect(store.active()).toEqual([]);
+    expect(menuOf(replies[0]).options.find((o) => o.value === '7')?.description).toBe('east');
+  });
+
+  it('cancels the question, which goes at once', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
+    const { trigger, image, router, store } = await setup({ gyms: [twin] });
+    const { message, replies } = posted([image('a.png', egg())]);
+    await trigger.handle(message);
+    const cancel = replies[0]?.components?.[1]?.components[0] as { custom_id: string };
+    const pressed = fakeButton({ customId: cancel.custom_id, userId: AUTHOR });
+    await router.handle(pressed as never);
+    expect(pressed.deleteReply).toHaveBeenCalledTimes(1);
+    expect(store.active()).toEqual([]);
+  });
+
+  it('lets a message go once only, and answers a second pick of a gym without failing', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
+    const { trigger, image, router, store } = await setup({ gyms: [twin] });
+    const { message, replies, did } = posted([image('a.png', egg())]);
+    await trigger.handle(message);
+    const menu = menuOf(replies[0]);
+    const first = fakeSelect({ customId: menu.custom_id, values: ['13'], userId: AUTHOR });
+    await router.handle(first as never);
+    // A second press of the same question, as it can arrive before the first is answered.
+    const second = fakeSelect({ customId: menu.custom_id, values: ['2'], userId: AUTHOR });
+    await router.handle(second as never);
+    expect(store.active()).toHaveLength(1);
+    expect(did.filter((d) => d === 'deleted')).toHaveLength(1);
+  });
+
+  it('forgets a question when it goes unanswered', async () => {
+    const twin = testGym(13, 'Old Stone Fountain', 40.061, -80.061);
+    const { trigger, image, router, store } = await setup({ gyms: [twin], questionMs: 10 });
+    const { message, replies, did } = posted([image('a.png', egg())]);
+    await trigger.handle(message);
+    await waitFor(() => did.includes('reply deleted'));
+    const late = fakeSelect({
+      customId: menuOf(replies[0]).custom_id,
+      values: ['2'],
+      userId: AUTHOR,
+    });
+    await router.handle(late as never);
+    expect(sent(late.update).content).toMatch(/^That question has expired/);
+    expect(store.active()).toEqual([]);
+  });
+
+  it('stops at a reader that cannot read, says so once, and uses no more of the throttle', async () => {
+    const { trigger, image, reader } = await setup();
+    const { message, replies } = posted([
+      image('busy.png', { kind: 'busy' }),
+      image('a.png', egg()),
+      image('b.png', egg()),
+    ]);
+    await trigger.handle(message);
+    expect(reader.reads).toBe(1);
+    expect(replies.map((r) => r.content)).toEqual([
+      'Too many screenshots are waiting to be read just now. Try again shortly.',
+    ]);
+    // Nineteen uses are left of the twenty.
+    const cats = (prefix: string) =>
+      Array.from({ length: 10 }, (_, i) => image(`${prefix}${i}.png`, readingOf({})));
+    await trigger.handle(posted(cats('c')).message);
+    const last = posted(cats('d'));
+    await trigger.handle(last.message);
+    expect(reader.reads).toBe(20);
+    expect(last.replies.at(-1)?.content).toMatch(
+      /You have sent many screenshots just now, so I did not read one of them\. Try again in 15 minutes\.$/,
+    );
+  });
+
+  it('reads no further image and sends nothing once closed', async () => {
+    const { trigger, image, reader } = await setup();
+    const { message, replies, did } = posted([
+      image('a.png', readingOf({})),
+      image('b.png', readingOf({})),
+    ]);
+    const handled = trigger.handle(message);
+    await waitFor(() => reader.reads === 1);
+    await trigger.close();
+    await handled;
+    expect(reader.reads).toBe(1);
+    expect(replies).toEqual([]);
+    // Nothing is done to the message after the close either.
+    expect(did).toEqual([`react ${READING}`]);
+  });
+
+  it('leaves alone what is not for it: no mention, a bot, a thread, no region, no picture', async () => {
+    const { trigger, image, store } = await setup();
+    for (const more of [
+      { mentionsBot: false },
+      { authorBot: true },
+      { inThread: true },
+      { channelId: '100000000000000099' },
+      { guildId: null },
+    ]) {
+      const { message, did } = posted([image('a.png', egg())], more);
+      await trigger.handle(message);
+      expect(did).toEqual([]);
+    }
+    const { message, did } = posted([
+      {
+        url: 'https://cdn.discordapp.com/x/notes.txt',
+        name: 'notes.txt',
+        contentType: 'text/plain',
+        size: 3,
+      },
+    ]);
+    await trigger.handle(message);
+    expect(did).toEqual([]);
+    expect(store.active()).toEqual([]);
+  });
+
+  it('is silent where screenshots are not read', async () => {
+    const { trigger, image, store } = await setup({ enabled: false });
+    const { message, did } = posted([image('a.png', egg())]);
+    await trigger.handle(message);
+    expect(did).toEqual([]);
+    expect(store.active()).toEqual([]);
+  });
+
+  it('reads passively only with the setting, answers nothing but a report, keeps no refused picture', async () => {
+    const { trigger, image, store, files } = await setup({ passive: true });
+    const raid = posted([image('a.png', egg())], { mentionsBot: false });
+    await trigger.handle(raid.message);
+    expect(store.active()).toHaveLength(1);
+    // A passive read never deletes a member's message: it marks it.
+    expect(raid.did).toEqual([`react ${READING}`, `unreact ${READING}`, `react ${DONE}`]);
+    const again = posted([image('b.png', egg())], { mentionsBot: false, authorId: OTHER });
+    await trigger.handle(again.message);
+    expect(again.replies).toEqual([]);
+    expect(again.did).toEqual([`react ${READING}`, `unreact ${READING}`, `react ${DONE}`]);
+    const cat = posted([image('cat.png', readingOf({ gym: 'Old Stone Fountain' }))], {
+      mentionsBot: false,
+    });
+    const kept = files('held').length;
+    await trigger.handle(cat.message);
+    expect(cat.did).toEqual([`react ${READING}`, `unreact ${READING}`]);
+    expect(files('held')).toHaveLength(kept);
+  });
+
+  it('reads every image of a message as a report of its own, one after the other', async () => {
+    const twin = testGym(13, 'Starbucks', 40.021, -80.081);
+    const { trigger, image, store, reader } = await setup({ gyms: [twin] });
+    const { message, did, replies } = posted([
+      image('a.png', egg()),
+      image('b.png', eggReading('Starbucks', 1, CLOCK, 10 * 60)),
+    ]);
+    await trigger.handle(message);
+    expect(reader.reads).toBe(2);
+    expect(store.active()).toHaveLength(1);
+    expect(replies.map((r) => r.content)).toEqual([expect.stringMatching(/Which gym is it\?/)]);
+    // Not every image made a raid: the message stays.
+    expect(did).not.toContain('deleted');
+  });
+
+  it('holds a member to twenty screenshots a quarter of an hour, an image a use', async () => {
+    const { trigger, image, reader } = await setup();
+    const source = image('cat.png', readingOf({ gym: 'Old Stone Fountain' }));
+    for (let i = 0; i < 6; i++) await trigger.handle(posted([source, source, source]).message);
+    expect(reader.reads).toBe(18);
+    const late = posted([source, source, source, source]);
+    await trigger.handle(late.message);
+    expect(reader.reads).toBe(20);
+    expect(late.replies.at(-1)?.content).toMatch(
+      /You have sent many screenshots just now, so I did not read 2 of them\. Try again in 15 minutes\.$/,
+    );
+    await trigger.close();
+  });
+});
diff --git a/src/commands/screenshots/mention.ts b/src/commands/screenshots/mention.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f1c3548029c1e9a48e102824609934b938d69c41
--- /dev/null
+++ b/src/commands/screenshots/mention.ts
@@ -0,0 +1,546 @@
+import {
+  ButtonStyle,
+  ComponentType,
+  MessageFlags,
+  type APIActionRowComponent,
+  type APIComponentInMessageActionRow,
+  type ButtonInteraction,
+  type StringSelectMenuInteraction,
+} from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import { encodeCustomId } from '../../discord/custom-id.js';
+import { UserError } from '../../discord/errors.js';
+import { Throttles, waitText, type Throttle } from '../../discord/throttle.js';
+import type { MemberInfo } from '../../domain/party/attendance.js';
+import type { ScreenshotRaid } from '../../domain/ocr/screenshot-decision.js';
+import { storedReport } from '../../domain/ocr/screenshot-record.js';
+import { raidBossRef } from '../../domain/party/raid.js';
+import { RaidPrivacy } from '../../domain/party/status.js';
+import { refusalWords, shortReading } from '../../render/screenshot-reading.js';
+import { plain, truncate } from '../../render/text.js';
+import type { ReportOutcome } from '../../services/party-service.js';
+import { PendingRequests } from '../../services/pending-requests.js';
+import {
+  screenshotsOf,
+  unreadWords,
+  type ScreenshotOutcome,
+  type ScreenshotSource,
+} from '../../services/screenshot-service.js';
+import { gymCandidates, gymMenuOptions, gymNamerOf } from './gym-question.js';
+import { SHOT_KIND } from './shot-kind.js';
+
+/**
+ * A raid screenshot posted in a region channel with a mention of the bot (or, with
+ * `settings.ocr.passive` and the Message Content intent, without one): read and reported as the
+ * member who posted it, as the legacy bot did. A message that mentions the bot carries its
+ * attachments without the privileged intent. Every image of a message is a report of its own
+ * (up to Discord's ten), one after the other: the next goes to the reader only once the one
+ * before is answered, so one message never holds more than one place in the reader's queue.
+ *
+ * What is reported unasked makes no answer (the region channel gets the raid's link line); a
+ * screenshot of a raid that exists is answered with its post. A gym that is not clear, or one
+ * that lies in another region, is asked about in a reply only the author can answer; whatever
+ * could not be made a raid is said in one reply for the whole message. Once every image made or
+ * joined a raid the message has done its work: it is deleted when it says nothing but the
+ * mention, and marked ✅ otherwise. Replies go after a while (a question after two minutes,
+ * and as soon as it is answered). Passive reading answers nothing but what it reports:
+ * ordinary pictures draw no answer.
+ */
+
+/** The emoji the bot reacts with while it reads. */
+export const READING = '🤔';
+/** The emoji of a message whose screenshots all made raids but that says more than a mention. */
+export const DONE = '✅';
+/**
+ * As often as `/raid`: 20 screenshots a quarter of an hour per member, each image one use. A
+ * passive read uses the same: it is the same member posting the same pictures.
+ */
+export const MENTION_THROTTLE: Throttle = { uses: 20, perSeconds: 900 };
+/** How long a question about a gym stays unanswered (Matt, 2026-10-14). */
+export const QUESTION_MS = 2 * 60_000;
+
+type Row = APIActionRowComponent<APIComponentInMessageActionRow>;
+
+/** What a reply of the bot to the posted message offers. */
+export interface ReplyPayload {
+  content: string;
+  components?: Row[];
+}
+
+/** A reply the bot sent: deleted when its time is up, unless it is gone already. */
+export interface SentReply {
+  delete(): Promise<void>;
+}
+
+/** What the trigger needs of a message (`src/discord/screenshot-message.ts` over discord.js). */
+export interface PostedMessage {
+  id: string;
+  channelId: string;
+  /** Null in a DM. */
+  guildId: string | null;
+  /** The message is in a thread or a forum post, not a channel of its own. */
+  inThread: boolean;
+  authorId: string;
+  /** A bot or a webhook. */
+  authorBot: boolean;
+  /** The member's name and team, from the message's member (`memberInfo` for messages). */
+  member: MemberInfo;
+  createdAt: number;
+  /** The bot is mentioned by name (not by @everyone, @here or a role, nor by a reply alone). */
+  mentionsBot: boolean;
+  /** The message says nothing but the bot's mention(s): it may go once it has done its work. */
+  bare: boolean;
+  attachments: readonly ScreenshotSource[];
+  /** The name of a channel of the server, for naming a gym's region. */
+  channelName(channelId: string): string | undefined;
+  react(emoji: string): Promise<void>;
+  unreact(emoji: string): Promise<void>;
+  reply(payload: ReplyPayload): Promise<SentReply | undefined>;
+  delete(): Promise<void>;
+}
+
+/** The images of one message, and how many of them made or joined a raid by now. */
+interface Batch {
+  message: PostedMessage;
+  images: number;
+  made: number;
+  /** Read without a mention: the message is never deleted, only marked. */
+  passive: boolean;
+  /** The message was let go (or marked) already: it is done once only. */
+  done: boolean;
+  /** Called when one more image made or joined a raid: the message goes when all have. */
+  finish: () => Promise<void>;
+}
+
+/** What came of one image: a raid made or joined, a question asked, why not, or a reader that cannot read. */
+type ImageResult =
+  | { kind: 'made' }
+  | { kind: 'asked' }
+  | { kind: 'refused'; words: string }
+  | { kind: 'stopped'; outcome: Exclude<ScreenshotOutcome, { kind: 'read' }> };
+
+const refused = (words: string): ImageResult => ({ kind: 'refused', words });
+
+/** A question about the gym of a screenshot, kept until its author answers it. */
+interface PendingShot {
+  raid: ScreenshotRaid;
+  screenshotId: string | undefined;
+  gymIds: number[];
+  regionChannelId: string;
+  member: MemberInfo;
+  batch: Batch;
+}
+
+/** The questions of the trigger, for the controls of the kind `shot` that answer them. */
+export const pendingShots = new PendingRequests<PendingShot>({ ttlMs: QUESTION_MS + 60_000 });
+
+export interface ScreenshotTriggerOptions {
+  ctx: AppContext;
+  /** How long a reply stays (`settings.messageCleanupDelayError`). */
+  replyMs?: number;
+  /** How long a question stays unanswered (`QUESTION_MS`). */
+  questionMs?: number;
+  now?: () => number;
+}
+
+/** Reads the screenshots of posted messages; one per bot (`src/app.ts`). */
+export class ScreenshotTrigger {
+  private readonly throttles = new Throttles();
+  private readonly now: () => number;
+  private readonly waiting = new Map<NodeJS.Timeout, SentReply>();
+  private closed = false;
+
+  constructor(private readonly options: ScreenshotTriggerOptions) {
+    this.now = options.now ?? Date.now;
+  }
+
+  /** Handles one posted message; never throws (what fails is logged). */
+  async handle(message: PostedMessage): Promise<void> {
+    try {
+      await this.handleNow(message);
+    } catch (err) {
+      this.options.ctx.log.error({ err }, 'could not read the screenshots of a message');
+    }
+  }
+
+  /**
+   * For shutdown, while Discord is there: no further image is read and nothing more is sent,
+   * and the replies that wait for their time are deleted now.
+   */
+  async close(): Promise<void> {
+    this.closed = true;
+    const replies = [...this.waiting.values()];
+    for (const timer of this.waiting.keys()) clearTimeout(timer);
+    this.waiting.clear();
+    await Promise.all(replies.map((reply) => reply.delete().catch(() => undefined)));
+  }
+
+  private async handleNow(message: PostedMessage): Promise<void> {
+    const { ctx } = this.options;
+    if (this.closed || !ctx.config.settings.ocr.enabled) return;
+    if (message.authorBot || message.guildId === null || message.inThread) return;
+    const passive = !message.mentionsBot;
+    if (passive && !(ctx.config.settings.ocr.passive && ctx.features.ocrPassive)) return;
+    const region = ctx.regions.byChannel(message.channelId);
+    if (!region) return;
+    const images = screenshotsOf(message.attachments);
+    if (images.length === 0) return;
+    const guildRow = await ctx.guilds.idFor(message.guildId);
+    if (guildRow === undefined) return;
+    const batch: Batch = {
+      message,
+      images: images.length,
+      made: 0,
+      passive,
+      done: false,
+      finish: () => this.finished(batch),
+    };
+    const refusals = new Map<string, number>();
+    let held = 0;
+    let wait = 0;
+    let stopped: Exclude<ScreenshotOutcome, { kind: 'read' }> | undefined;
+    let reacted = false;
+    try {
+      for (const image of images) {
+        if (this.closed) return;
+        // The reader cannot read just now: the rest of the message waits for nothing.
+        if (stopped) break;
+        const until = this.throttles.use(
+          'screenshot',
+          message.authorId,
+          MENTION_THROTTLE,
+          this.now(),
+        );
+        if (until !== undefined) {
+          held++;
+          wait = until;
+          continue;
+        }
+        if (!reacted) {
+          reacted = true;
+          await message.react(READING).catch(() => undefined);
+        }
+        const result = await this.readOne(batch, image, guildRow, passive);
+        if (result.kind === 'made') batch.made++;
+        else if (result.kind === 'refused') {
+          refusals.set(result.words, (refusals.get(result.words) ?? 0) + 1);
+        } else if (result.kind === 'stopped') stopped = result.outcome;
+      }
+    } finally {
+      // After the close nothing more is done to the message.
+      if (reacted && !this.closed) await message.unreact(READING).catch(() => undefined);
+    }
+    if (!passive) {
+      const lines: string[] = [];
+      if (stopped) lines.push(unreadWords(stopped));
+      for (const [words, count] of refusals) {
+        lines.push(images.length === 1 ? words : `${count} of ${images.length}: ${words}`);
+      }
+      if (held > 0) {
+        const which =
+          held === images.length ? 'them' : held === 1 ? 'one of them' : `${held} of them`;
+        lines.push(
+          `You have sent many screenshots just now, so I did not read ${which}. Try again in ${waitText(wait)}.`,
+        );
+      }
+      if (lines.length > 0) await this.say(message, { content: truncate(lines.join('\n'), 2_000) });
+    }
+    await this.finished(batch);
+  }
+
+  /**
+   * Reads one image: `made` when it made or joined a raid, `asked` when its author was asked
+   * which gym, the words of why it made nothing, or the reader's answer when it could not read.
+   */
+  private async readOne(
+    batch: Batch,
+    image: ScreenshotSource,
+    guildRow: number,
+    passive: boolean,
+  ): Promise<ImageResult> {
+    const { ctx } = this.options;
+    const { message } = batch;
+    const outcome = await ctx.screenshots.read(image, {
+      guildId: message.guildId ?? '',
+      guildRow,
+      channelId: message.channelId,
+      uploadedAt: message.createdAt,
+      use: passive ? 'passive' : 'mention',
+      senderId: message.authorId,
+    });
+    if (outcome.kind === 'busy' || outcome.kind === 'unavailable' || outcome.kind === 'failed') {
+      return { kind: 'stopped', outcome };
+    }
+    if (outcome.kind !== 'read') return refused(unreadWords(outcome));
+    const { report, decision, id } = outcome;
+    if (decision.kind === 'refuse') return refused(refusalWords(decision.reason));
+    // A clear gym that lies in this region is reported unasked; one in another region is asked
+    // about like a gym that is not clear: a raid is never sent to another region unasked.
+    if (
+      decision.kind === 'report' &&
+      ctx.gyms.regionsOf(decision.raid.gymId).includes(message.channelId)
+    ) {
+      const gym = ctx.gyms.get(decision.raid.gymId);
+      if (!gym) return refused(refusalWords('no-gym'));
+      const reported = await reportShot(ctx, {
+        gym,
+        memberId: message.authorId,
+        member: message.member,
+        regionChannelId: message.channelId,
+        raid: decision.raid,
+        screenshotId: id,
+      });
+      if (reported.kind === 'exists' && !passive) {
+        await this.say(message, { content: outcomeWords(reported, gym) });
+      }
+      if (reported.kind === 'created' || reported.kind === 'exists') return { kind: 'made' };
+      return refused(outcomeWords(reported, gym));
+    }
+    if (passive) return { kind: 'asked' };
+    const gyms = gymCandidates(ctx, message.channelId, guildRow, report.gym);
+    const [first] = gyms;
+    const assumed =
+      decision.kind === 'report' ? decision : first ? outcome.withGym(first.id) : decision;
+    if (assumed.kind === 'ask')
+      return refused('I could not tell the tier of this raid. Report it with `/raid`.');
+    if (assumed.kind === 'refuse' || gyms.length === 0) return refused(refusalWords('no-gym'));
+    const token = pendingShots.put(message.authorId, {
+      raid: assumed.raid,
+      screenshotId: id,
+      gymIds: gyms.map((gym) => gym.id),
+      regionChannelId: message.channelId,
+      member: message.member,
+      batch,
+    });
+    // The gym is not named here: it is what is asked.
+    const what = shortReading(storedReport(report), gymNamerOf(ctx), { gym: false });
+    const read = report.gym.read ? ` I read "${plain(truncate(report.gym.read, 80))}".` : '';
+    await this.say(
+      message,
+      {
+        content: truncate(`${what}. Which gym is it?${read}`, 2_000),
+        components: gymQuestion(ctx, token, message, gyms),
+      },
+      this.options.questionMs ?? QUESTION_MS,
+      () => pendingShots.take(token, message.authorId),
+    );
+    return { kind: 'asked' };
+  }
+
+  /**
+   * Once every image of a message made or joined a raid, the message has done its work: it
+   * goes when it says nothing but the mention, and is marked ✅ otherwise.
+   */
+  private async finished(batch: Batch): Promise<void> {
+    if (this.closed || batch.done || batch.made < batch.images) return;
+    batch.done = true;
+    const { message } = batch;
+    // A passive read never deletes a member's message: it only marks it.
+    if (message.bare && !batch.passive) {
+      await message.delete().catch((err: unknown) => {
+        this.options.ctx.log.warn(
+          { err },
+          'could not delete a message whose screenshots were reported',
+        );
+      });
+    } else {
+      await message.react(DONE).catch(() => undefined);
+    }
+  }
+
+  /** Replies to the message; the reply goes after `ms` (by default `replyMs`), then `after`. */
+  private async say(
+    message: PostedMessage,
+    payload: ReplyPayload,
+    ms?: number,
+    after?: () => void,
+  ): Promise<void> {
+    const { ctx } = this.options;
+    if (this.closed) return;
+    const sent = await message.reply(payload).catch((err: unknown) => {
+      ctx.log.warn({ err }, 'could not answer a message with screenshots');
+      return undefined;
+    });
+    if (!sent) return;
+    const timer = setTimeout(
+      () => {
+        this.waiting.delete(timer);
+        after?.();
+        sent.delete().catch(() => undefined);
+      },
+      ms ?? this.options.replyMs ?? ctx.config.settings.messageCleanupDelayError,
+    );
+    timer.unref();
+    this.waiting.set(timer, sent);
+  }
+}
+
+/** The question's controls: the gym menu (each gym told apart) and "Cancel". */
+function gymQuestion(
+  ctx: AppContext,
+  token: string,
+  message: PostedMessage,
+  gyms: readonly Gym[],
+): Row[] {
+  return [
+    {
+      type: ComponentType.ActionRow,
+      components: [
+        {
+          type: ComponentType.StringSelect,
+          custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action: 'gym' }),
+          placeholder: 'Choose the gym',
+          options: gymMenuOptions(ctx, message.channelId, gyms, (id) => message.channelName(id)),
+        },
+      ],
+    },
+    {
+      type: ComponentType.ActionRow,
+      components: [
+        {
+          type: ComponentType.Button,
+          custom_id: encodeCustomId({ kind: SHOT_KIND, id: token, action: 'cancel' }),
+          label: 'Cancel',
+          style: ButtonStyle.Secondary,
+        },
+      ],
+    },
+  ];
+}
+
+/** Reports a raid from a screenshot as the member who posted it. */
+async function reportShot(
+  ctx: AppContext,
+  shot: {
+    gym: Gym;
+    memberId: string;
+    member: MemberInfo;
+    regionChannelId: string;
+    raid: ScreenshotRaid;
+    screenshotId: string | undefined;
+  },
+): Promise<ReportOutcome> {
+  const { raid } = shot;
+  const settings = await ctx.users.get(shot.memberId);
+  const outcome = await ctx.partyService.reportRaid({
+    gym: shot.gym,
+    reporterId: shot.memberId,
+    reporter: shot.member,
+    anonymous: settings.raidPrivacy === RaidPrivacy.Anonymous,
+    autoStatus: settings.autoStatus,
+    tier: raid.tier,
+    boss: raid.boss ? raidBossRef(raid.boss) : null,
+    ...(raid.hatched && !raid.boss ? { hatched: true } : {}),
+    screenshot: { id: shot.screenshotId ?? null, timeUncertain: raid.timeUncertain },
+    regionChannelId: shot.regionChannelId,
+    ...(raid.time ? { time: raid.time } : {}),
+  });
+  if (outcome.kind === 'created' && shot.screenshotId !== undefined) {
+    await ctx.screenshots.inUse(shot.screenshotId);
+  }
+  return outcome;
+}
+
+/** What came of a report, in a short sentence. */
+function outcomeWords(outcome: ReportOutcome, gym: Gym): string {
+  const name = plain(gym.nickname || gym.name);
+  switch (outcome.kind) {
+    case 'created':
+      return outcome.party.forumPostId === null
+        ? `Reported the raid at ${name}.`
+        : `Reported the raid at ${name}: <#${outcome.party.forumPostId}>.`;
+    case 'exists': {
+      const post = outcome.party.forumPostId === null ? '' : `: <#${outcome.party.forumPostId}>`;
+      const joined = outcome.joined ? ' You have been signed up for it.' : '';
+      return `There is already a raid at ${name}${post}.${joined}`;
+    }
+    case 'gym-gone':
+      return `${name} was removed from my gym list just now.`;
+    case 'no-region':
+      return `${name} is not in any region of this server.`;
+    case 'no-forum':
+      return `The region <#${outcome.region.channelId}> has no raid forum yet.`;
+  }
+}
+
+const EXPIRED = 'That question has expired. Post the screenshot again, or use `/raid`.';
+const NOT_YOURS = 'That is somebody else’s screenshot.';
+
+/** The pending question of a control, still kept: refuses anybody but its author. */
+function peeked(
+  interaction: ButtonInteraction | StringSelectMenuInteraction,
+  token: string,
+): PendingShot | undefined {
+  const found = pendingShots.peek(token, interaction.user.id);
+  if (found === 'not-yours') throw new UserError(NOT_YOURS);
+  return found === 'expired' ? undefined : found.value;
+}
+
+/** "Cancel" under the question about the gym: the question goes. */
+export async function cancelShot(interaction: ButtonInteraction, token: string): Promise<void> {
+  const request = peeked(interaction, token);
+  if (!request) {
+    await interaction.update({ content: EXPIRED, components: [] });
+    return;
+  }
+  await interaction.deferUpdate();
+  pendingShots.take(token, interaction.user.id);
+  await interaction.deleteReply().catch(() => undefined);
+}
+
+/**
+ * The gym chosen in the question: the raid is reported as its author, the question goes, and
+ * they are told what came of it privately; the message goes once every image made a raid.
+ */
+export async function chooseShotGym(
+  interaction: StringSelectMenuInteraction,
+  token: string,
+  ctx: AppContext,
+): Promise<void> {
+  const request = peeked(interaction, token);
+  if (!request) {
+    await interaction.update({ content: EXPIRED, components: [] });
+    return;
+  }
+  const gymId = Number(interaction.values[0]);
+  const gym = request.gymIds.includes(gymId) ? ctx.gyms.get(gymId) : undefined;
+  if (!gym) {
+    await interaction.update({ content: 'That gym no longer exists.', components: [] });
+    return;
+  }
+  // Taken only once acknowledged: a press that could not be acknowledged leaves the question.
+  await interaction.deferUpdate();
+  if (pendingShots.take(token, interaction.user.id) === 'expired') {
+    // Another press took the question meanwhile (and may have deleted it already).
+    await interaction.editReply({ content: EXPIRED, components: [] }).catch(() => undefined);
+    return;
+  }
+  let outcome: ReportOutcome;
+  try {
+    outcome = await reportShot(ctx, {
+      gym,
+      memberId: interaction.user.id,
+      member: request.member,
+      regionChannelId: request.regionChannelId,
+      raid: { ...request.raid, gymId: gym.id },
+      screenshotId: request.screenshotId,
+    });
+  } catch (err) {
+    await interaction
+      .editReply({ content: 'Nothing was reported.', components: [] })
+      .catch(() => undefined);
+    throw err;
+  }
+  if (request.screenshotId !== undefined)
+    await ctx.screenshots.picked(request.screenshotId, gym.id);
+  await interaction.deleteReply().catch(() => undefined);
+  await interaction.followUp({
+    content: outcomeWords(outcome, gym),
+    flags: MessageFlags.Ephemeral,
+  });
+  if (outcome.kind === 'created' || outcome.kind === 'exists') {
+    request.batch.made++;
+    await request.batch.finish();
+  }
+}
diff --git a/src/commands/screenshots/read-screenshot.ts b/src/commands/screenshots/read-screenshot.ts
index 9ba850e6402cec7ce99f009d3f1e4da7d473cbc8..3eb4517c604494fe1b6b2656158d65fff3e59a7d 100644
--- a/src/commands/screenshots/read-screenshot.ts
+++ b/src/commands/screenshots/read-screenshot.ts
@@ -12,7 +12,8 @@ import {
   type ScreenshotSource,
   type ScreenshotWhere,
 } from '../../services/screenshot-service.js';
-import { decisionWords, feedbackRow, gymNamerOf } from './feedback.js';
+import { decisionWords, feedbackRow } from './feedback.js';
+import { gymNamerOf } from './gym-question.js';
 
 /** A message's text stays within Discord's 2,000 characters. */
 const MESSAGE = 2_000;
diff --git a/src/commands/screenshots/shot-kind.ts b/src/commands/screenshots/shot-kind.ts
new file mode 100644
index 0000000000000000000000000000000000000000..78e506c4e5bab480eca781ebc367987eadbe8d01
--- /dev/null
+++ b/src/commands/screenshots/shot-kind.ts
@@ -0,0 +1,10 @@
+/**
+ * The custom-id kind of the controls about a screenshot (`screenshotControls`). With a
+ * screenshot's id (12 characters): `shot:<id>:right` ("All right"), `shot:<id>:wrong`
+ * ("Something is wrong", which opens the form `shot:<id>:form`) and `shot:<id>:show` (the
+ * reporter's "Screenshot feedback", which shows the screenshot and what was read). With the
+ * token of a pending question (`PendingRequests`, 16 characters): the question about the gym of
+ * a screenshot posted with a mention of the bot, `shot:<token>:gym` (the menu) and
+ * `shot:<token>:cancel`.
+ */
+export const SHOT_KIND = 'shot';
diff --git a/src/discord/screenshot-message.ts b/src/discord/screenshot-message.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b9179873b7cf5d25f723ff542a2ad47717ee927c
--- /dev/null
+++ b/src/discord/screenshot-message.ts
@@ -0,0 +1,58 @@
+import type { Message } from 'discord.js';
+import type { PostedMessage } from '../commands/screenshots/mention.js';
+import { teamOfRoles } from '../domain/party/party.js';
+
+/**
+ * A posted message as the screenshot trigger sees it (`PostedMessage`), over discord.js. Like
+ * `PartyGateway`'s implementation it has no unit tests: the staging run is its test. The bot is
+ * mentioned when its own mention is in the text (`parsedUsers`): a reply to one of its messages,
+ * @everyone, @here or a role does not count. A message that mentions the bot carries its text
+ * without the Message Content intent, which `bare` reads. The reply answers the message without pinging its
+ * author (the client's mentions are off).
+ */
+export function postedMessage(message: Message): PostedMessage {
+  const botId = message.client.user.id;
+  const { member } = message;
+  const team = member ? teamOfRoles(member.roles.cache.map((role) => role.name)) : undefined;
+  return {
+    id: message.id,
+    channelId: message.channelId,
+    guildId: message.guildId,
+    inThread: message.channel.isThread(),
+    authorId: message.author.id,
+    authorBot: message.author.bot || message.webhookId !== null,
+    member: {
+      ...(member ? { name: member.displayName } : {}),
+      ...(team ? { team } : {}),
+    },
+    createdAt: message.createdTimestamp,
+    mentionsBot: message.mentions.parsedUsers.has(botId),
+    // Nothing but the bot's own mention(s): the message may go once its screenshots are raids.
+    bare:
+      message.content.replaceAll(`<@${botId}>`, '').replaceAll(`<@!${botId}>`, '').trim() === '',
+    channelName: (channelId) => message.guild?.channels.cache.get(channelId)?.name,
+    attachments: [...message.attachments.values()].map((attachment) => ({
+      url: attachment.url,
+      name: attachment.name,
+      contentType: attachment.contentType,
+      size: attachment.size,
+    })),
+    react: async (emoji) => {
+      await message.react(emoji);
+    },
+    unreact: async (emoji) => {
+      await message.reactions.cache.get(emoji)?.users.remove(botId);
+    },
+    reply: async (payload) => {
+      const sent = await message.reply({ ...payload, allowedMentions: { parse: [] } });
+      return {
+        delete: async () => {
+          await sent.delete();
+        },
+      };
+    },
+    delete: async () => {
+      await message.delete();
+    },
+  };
+}
diff --git a/src/render/screenshot-reading.test.ts b/src/render/screenshot-reading.test.ts
index f09891b5b1b739cf9d29fd5b47fa576a37467690..316be66a46b462aa86bf1c7206c35c8142c1ca7f 100644
--- a/src/render/screenshot-reading.test.ts
+++ b/src/render/screenshot-reading.test.ts
@@ -81,6 +81,15 @@ describe('shortReading', () => {
     ).toBe('Shadow T5 egg at Heinz \\*Plant\\*, hatching at <t:1800000000:t>');
   });
 
+  it('leaves the gym out when it is asked about, and calls a raid of no stage a raid', () => {
+    expect(shortReading(report(), gymName, { gym: false })).toBe(
+      'Landorus (Shadow T5), ending at <t:1800000000:t>',
+    );
+    expect(shortReading(report({ stage: null, boss: null, time: null }), gymName)).toBe(
+      'Shadow T5 raid at Heinz \\*Plant\\*',
+    );
+  });
+
   it('words a refusal', () => {
     expect(refusalWords('no-gym')).toMatch(/gym/);
     expect(refusalWords('raid-over')).toBe('By its countdown this raid has already ended.');
diff --git a/src/render/screenshot-reading.ts b/src/render/screenshot-reading.ts
index 706b23f64d131f92effdb688202083640b66a97f..ebbdf34bba94c2a95e500aa3a4d1b25b19f47596 100644
--- a/src/render/screenshot-reading.ts
+++ b/src/render/screenshot-reading.ts
@@ -108,15 +108,24 @@ export function readingLines(report: StoredReport, gymName: GymNamer): string[]
   return lines;
 }
 
-/** What the screenshot shows, in one line: `T5 egg at Heinz Plant, hatching at 13:49`. */
-export function shortReading(report: StoredReport, gymName: GymNamer): string {
-  const found = report.gym.gymId === null ? undefined : gymName(report.gym.gymId);
+/**
+ * What the screenshot shows, in one line: `T5 egg at Heinz Plant, hatching at 13:49`. Without the
+ * gym (`gym: false`) when the gym is what is asked about; a raid whose stage was not told is a
+ * `raid`.
+ */
+export function shortReading(
+  report: StoredReport,
+  gymName: GymNamer,
+  options: { gym?: boolean } = {},
+): string {
+  const found =
+    options.gym === false || report.gym.gymId === null ? undefined : gymName(report.gym.gymId);
   const what =
     report.tier === null
       ? 'A raid'
       : report.boss && report.stage === 'hatched'
         ? `${plain(report.boss.name)} (${raidTierLabel(report.tier)})`
-        : `${raidTierLabel(report.tier)} ${report.stage === 'hatched' ? 'raid' : 'egg'}`;
+        : `${raidTierLabel(report.tier)} ${report.stage === 'egg' ? 'egg' : 'raid'}`;
   const where = found === undefined ? '' : ` at ${plain(found)}`;
   const { time } = report;
   const when =
````

---

### Task 9: Screenshot feedback on the post of a raid reported from a screenshot

Prototype commit: `21ace89b3ae54a7d2a0c09e788c9c9860bc9805a`

"Screenshot feedback" on the post of a raid with a kept screenshot: a
grey button on a row of its own (party:<id>:shot), for anybody who sees
the post while the raid lasts, answering privately as "show" does; the
reporter's private answer has it too. shot is documented in
custom-id.ts.

**Interfaces:**
- Consumes: Tasks 5 and 6.
- Produces: the party action `shot` (`PARTY_ACTIONS`, `partyControls`, `src/components/party.ts`).

**Files:**

```
 src/commands/raids/raid-screenshot.test.ts | 66 ++++++++++++++++++++++++++++++++++++++++++++++++--
 src/commands/screenshots/feedback.ts       |  9 +++----
 src/components/party.ts                    |  9 +++++++
 src/discord/custom-id.ts                   |  7 ++++++
 src/render/party-controls.ts               | 20 ++++++++++++---
 5 files changed, 100 insertions(+), 11 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/raids/raid-screenshot.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 21ace89b3ae54a7d2a0c09e788c9c9860bc9805a -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Screenshot feedback on the post of a raid reported from a screenshot`, the body above and the trailer, staging exactly
  `src/commands/raids/raid-screenshot.test.ts src/commands/screenshots/feedback.ts src/components/party.ts src/discord/custom-id.ts src/render/party-controls.ts`.

````diff
diff --git a/src/commands/raids/raid-screenshot.test.ts b/src/commands/raids/raid-screenshot.test.ts
index 9c357a13f80ff4e8373a13ab7c65cad736d538d3..6be29ee86aca56f3ad5e56e519cc397b44d66d64 100644
--- a/src/commands/raids/raid-screenshot.test.ts
+++ b/src/commands/raids/raid-screenshot.test.ts
@@ -8,7 +8,7 @@ import {
   type FakeOptions,
 } from '../../../test/support/fake-interactions.js';
 import { testGym, WEST_CHANNEL } from '../../../test/support/gyms.js';
-import { at, MINUTE, PARTY_NOW } from '../../../test/support/parties.js';
+import { at, MINUTE, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { gymsFixture } from '../../../test/support/providers.js';
 import { screenshotsWith } from '../../../test/support/screenshot-service.js';
@@ -19,6 +19,8 @@ import { enabledCommands } from '../../discord/command.js';
 import { InteractionRouter } from '../../discord/router.js';
 import { isRaid } from '../../domain/party/party.js';
 import type { ScreenReading } from '../../ocr/screen-reader.js';
+import { partyButtons } from '../../components/party.js';
+import { invitationControls, partyControls } from '../../render/party-controls.js';
 import { screenshotControls } from '../screenshots/feedback.js';
 import { raid, raidControls } from './raid.js';
 
@@ -37,7 +39,11 @@ async function setup(extraGyms: Gym[] = []) {
     regions: made.regions,
     screenshots: shots.screenshots,
   });
-  const router = new InteractionRouter(ctx, [raid], [raidControls, screenshotControls]);
+  const router = new InteractionRouter(
+    ctx,
+    [raid],
+    [raidControls, screenshotControls, partyButtons],
+  );
   const handle = async (interaction: FakeInteraction) => {
     await router.handle(interaction as never);
     return interaction;
@@ -104,6 +110,62 @@ describe('/raid with a screenshot', () => {
     expect(await screenshots.get(id)).toMatchObject({ record: { keepUntil: null } });
   });
 
+  it('offers the screenshot on the post to anybody, with what was read, while the raid lasts', async () => {
+    const { report, store, service, gateway, handle } = await setup();
+    await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
+    await service.flush();
+    const [party] = store.active();
+    if (!party || !isRaid(party)) throw new Error('no raid');
+    const id = party.raid.screenshot?.id ?? '';
+    const rows = gateway.posts.get(party.forumPostId ?? '')?.message.components ?? [];
+    const last = rows[rows.length - 1] as { components: { custom_id: string; label: string }[] };
+    expect(last.components).toEqual([
+      expect.objectContaining({
+        custom_id: `party:${party.id}:shot`,
+        label: 'Screenshot feedback',
+      }),
+    ]);
+    const pressed = await handle(
+      fakeButton({ customId: `party:${party.id}:shot`, userId: '700000000000000009' }),
+    );
+    const shown = sent(pressed.editReply);
+    expect(shown.files).toEqual([expect.objectContaining({ name: `${id}.png` })]);
+    expect(shown.content).toContain('**Gym:** read `Old Stone Fountain`');
+  });
+
+  it('keeps the button on the copies of the post, and answers it once the raid is over', async () => {
+    const { report, store, service, handle } = await setup();
+    const used = await report(eggReading('Old Stone Fountain', 5, CLOCK, 20 * 60));
+    await service.flush();
+    const [party] = store.active();
+    if (!party || !isRaid(party)) throw new Error('no raid');
+    const button = `party:${party.id}:shot`;
+    // The copies elsewhere carry the post's own controls, this one included.
+    const ids = invitationControls(partyControls(party)).flatMap((row) =>
+      row.components.map((c) => ('custom_id' in c ? c.custom_id : '')),
+    );
+    expect(ids).toContain(button);
+    await service.end(party.id);
+    const late = await handle(fakeButton({ customId: button }));
+    expect(sent(late.reply).content).toBe('This raid is over.');
+    // The reporter's own button still shows it for a while.
+    const own = rowsOf(sent(used.editReply))[0]?.components[0]?.custom_id ?? '';
+    const shown = await handle(fakeButton({ customId: own }));
+    expect(sent(shown.editReply).content).toContain('Is this what the screenshot shows?');
+  });
+
+  it('shows no button for a screenshot that could not be kept, and still says the time is a guess', () => {
+    const plain = testRaid();
+    const unkept = {
+      ...plain,
+      raid: { ...plain.raid, screenshot: { id: null, timeUncertain: true } },
+    };
+    const ids = partyControls(unkept).flatMap((row) =>
+      row.components.map((c) => ('custom_id' in c ? c.custom_id : '')),
+    );
+    expect(ids.some((id) => id.endsWith(':shot'))).toBe(false);
+  });
+
   it('reports a guessed time as uncertain, and a hatched raid without its boss as hatched', async () => {
     const { report, store } = await setup();
     await report(
diff --git a/src/commands/screenshots/feedback.ts b/src/commands/screenshots/feedback.ts
index 43b69fa751df539b110e5e2764593257ec969ceb..4ab102493cbae56236c950e3ee1578315f7ff164 100644
--- a/src/commands/screenshots/feedback.ts
+++ b/src/commands/screenshots/feedback.ts
@@ -22,6 +22,7 @@ import {
   type StoredDecision,
 } from '../../domain/ocr/screenshot-record.js';
 import { readingLines, refusalWords } from '../../render/screenshot-reading.js';
+import { SCREENSHOT_FEEDBACK } from '../../render/party-controls.js';
 import { truncate } from '../../render/text.js';
 import { gymNamerOf } from './gym-question.js';
 import { cancelShot, chooseShotGym } from './mention.js';
@@ -68,15 +69,11 @@ export function feedbackRow(screenshotId: string): Row {
   };
 }
 
-/** The button of the reporter's private answer that shows the screenshot (R8). */
-export const SCREENSHOT_FEEDBACK_LABEL = 'Screenshot feedback';
-
+/** The button of the reporter's private answer that shows the screenshot. */
 export function showRow(screenshotId: string): Row {
   return {
     type: ComponentType.ActionRow,
-    components: [
-      shotButton(screenshotId, 'show', SCREENSHOT_FEEDBACK_LABEL, ButtonStyle.Secondary),
-    ],
+    components: [shotButton(screenshotId, 'show', SCREENSHOT_FEEDBACK, ButtonStyle.Secondary)],
   };
 }
 
diff --git a/src/components/party.ts b/src/components/party.ts
index 935b76f5e1631cd5dc5baeedc3aa2fda9a88d47a..b36cd3afff70cae16ddf1079a5410838f1b0a8c9 100644
--- a/src/components/party.ts
+++ b/src/components/party.ts
@@ -11,6 +11,7 @@ import {
 } from '../commands/parties/reply.js';
 import { changeTime, timesAlready } from '../commands/raids/change.js';
 import { memberInfo } from '../discord/member-info.js';
+import { showScreenshot } from '../commands/screenshots/feedback.js';
 import { openTrainPanel, pressTrainPanel } from '../commands/trains/move.js';
 import { RAID_IS_OVER } from '../commands/raids/raid-input.js';
 import type { ComponentHandler } from '../discord/command.js';
@@ -134,6 +135,14 @@ export const partyButtons: ComponentHandler = {
         );
         return;
       }
+      case 'shot': {
+        // "Screenshot feedback": the screenshot the raid was reported from, privately.
+        const party = ctx.parties.get(partyId);
+        if (!party) throw new UserError(partyOver({ type: 'raid' }));
+        const shown = isRaid(party) ? party.raid.screenshot?.id : undefined;
+        if (!shown) throw new UserError(STALE_COMPONENT);
+        return showScreenshot(interaction, ctx, shown);
+      }
       case 'delete':
         // Only the form of `/delete` has this action.
         throw new UserError(STALE_COMPONENT);
diff --git a/src/discord/custom-id.ts b/src/discord/custom-id.ts
index 17205914c7183106c19e2b41c2939813c269fef8..9ee31fb5930898c64164c5c281daabec6fc2835f 100644
--- a/src/discord/custom-id.ts
+++ b/src/discord/custom-id.ts
@@ -31,6 +31,13 @@
  * import`: `region:<token>:import` and `region:<token>:cancel`; under the question of `/region
  * remove`: `region:<token>:keep` (remove, keep the forum), `region:<token>:delete` (remove and
  * delete the forum) and `region:<token>:cancel`.
+ *
+ * The controls about a screenshot have the kind `shot` (`src/commands/screenshots/shot-kind.ts`).
+ * With the id of a kept screenshot (twelve URL-safe characters): `shot:<id>:right`,
+ * `shot:<id>:wrong` (which opens the form `shot:<id>:form`) and `shot:<id>:show`. With the token
+ * of a pending question about the gym of a screenshot posted with a mention of the bot:
+ * `shot:<token>:gym` (the menu) and `shot:<token>:cancel`. The button "Screenshot feedback" of a
+ * raid's post is the party's own, `party:<party id>:shot`.
  */
 export const MAX_CUSTOM_ID_LENGTH = 100;
 const SEPARATOR = ':';
diff --git a/src/render/party-controls.ts b/src/render/party-controls.ts
index 0f5e0039cc023e0045af899a18a9da4c682f0dae..f998f7962f27b2be8e3435e03e7ae74baa5dcd71 100644
--- a/src/render/party-controls.ts
+++ b/src/render/party-controls.ts
@@ -28,7 +28,8 @@ export const PARTY_KIND = 'party';
  * the "Set time" button, and the form it opens, which carries `hatch` or `end`. `delete` is the
  * form of `/delete` for members who are not staff; no button has it. `move` is the button
  * "Move train…" of a train's post, which opens the panel whose buttons are `next`, `previous`,
- * `skip` and `finish` (`train-panel.ts`).
+ * `skip` and `finish` (`train-panel.ts`). `shot` is "Screenshot feedback" of a raid reported
+ * from a screenshot, which shows that screenshot privately.
  */
 export const PARTY_ACTIONS = [
   'maybe',
@@ -48,6 +49,7 @@ export const PARTY_ACTIONS = [
   'previous',
   'skip',
   'finish',
+  'shot',
 ] as const;
 export type PartyAction = (typeof PARTY_ACTIONS)[number];
 
@@ -59,7 +61,7 @@ export function isPartyAction(value: string): value is PartyAction {
  * The actions that only the controls of a raid have: no other post shows them. A group button
  * is not among them: a train has groups too.
  */
-const RAID_ACTIONS: readonly PartyAction[] = ['done', 'answer', 'time'];
+const RAID_ACTIONS: readonly PartyAction[] = ['done', 'answer', 'time', 'shot'];
 
 /** Whether a control with this action can only have been a raid's. */
 export function isRaidAction(value: string): boolean {
@@ -107,7 +109,9 @@ function groupLabel(party: Party, group: PartyGroup): string {
  * Leave is there. It has no "Set time" either (its times are `/meet` and `/end`), and never a
  * row of groups. A train is like a meetup in the first two, has its groups like a raid, and a
  * last row of its own: "Move train…", which opens the panel that moves it along its route. It is
- * always there, whoever looks: who may not move the train is told so when they press it.
+ * always there, whoever looks: who may not move the train is told so when they press it. A raid
+ * reported from a screenshot has a grey "Screenshot feedback" on a row of its own, for anybody
+ * who sees the post (spec 7B).
  */
 export function partyControls(party: Party): Row[] {
   const { id } = party;
@@ -145,6 +149,13 @@ export function partyControls(party: Party): Row[] {
       ),
     });
   }
+  // Only a kept screenshot can be shown.
+  if (isRaid(party) && party.raid.screenshot?.id) {
+    rows.push({
+      type: ComponentType.ActionRow,
+      components: [partyButton(id, 'shot', SCREENSHOT_FEEDBACK, ButtonStyle.Secondary)],
+    });
+  }
   if (isTrain(party)) {
     rows.push({
       type: ComponentType.ActionRow,
@@ -154,6 +165,9 @@ export function partyControls(party: Party): Row[] {
   return rows;
 }
 
+/** The label of the button of a raid's post that shows the screenshot it was reported from. */
+export const SCREENSHOT_FEEDBACK = 'Screenshot feedback';
+
 /** The label of the button of a train's post that opens the panel to move it. */
 export const MOVE_TRAIN_LABEL = 'Move train…';
 
````

---

### Task 10: The game's egg on the post of an egg

Prototype commit: `dbe0a0a18fe352ef881885b4abdac16d6d5664f8`

The game's egg on the post of an egg (raidEggPicture): pogo_assets'
Images/Raids at the commit the tier head is pinned to, by URL like the
Pokémon pictures: T1, T3, T5, mega, mega legendary, primal when every
current mega legendary boss is a primal, elite, the wormhole for a T5
egg whose current bosses are all ultra beasts; a shadow egg shows the
plain egg; super mega has none. The egg wins over the picture of the
boss it hatches as, until it hatches.

**Interfaces:**
- Produces: `raidEggPicture(tier, bosses, base)`, `EggBoss`, `RAID_EGG_PICTURES_URL` (`src/domain/pogo/raid-eggs.ts`).

**Files:**

```
 src/domain/pogo/raid-eggs.test.ts | 43 +++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/raid-eggs.ts      | 54 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/render/raid-post.test.ts      | 15 +++++++++++++++
 src/render/raid-post.ts           |  6 +++++-
 src/services/party-service.ts     |  7 +++++++
 5 files changed, 124 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/pogo/raid-eggs.test.ts src/render/raid-post.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff dbe0a0a18fe352ef881885b4abdac16d6d5664f8 -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `The game's egg on the post of an egg`, the body above and the trailer, staging exactly
  `src/domain/pogo/raid-eggs.test.ts src/domain/pogo/raid-eggs.ts src/render/raid-post.test.ts src/render/raid-post.ts src/services/party-service.ts`.

````diff
diff --git a/src/domain/pogo/raid-eggs.test.ts b/src/domain/pogo/raid-eggs.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..34e5ad29ed050f5669d9561aa7b7597eebf9ba3f
--- /dev/null
+++ b/src/domain/pogo/raid-eggs.test.ts
@@ -0,0 +1,43 @@
+import { describe, expect, it } from 'vitest';
+import { raidEggPicture, RAID_EGG_PICTURES_URL, type EggBoss } from './raid-eggs.js';
+
+const BASE = 'https://example.test/raids/';
+const tier = (level: Parameters<typeof raidEggPicture>[0]['level'], shadow = false) => ({
+  level,
+  shadow,
+});
+const boss = (key: string, cls: 'legendary' | 'ultra-beast' | null = null): EggBoss => ({
+  key,
+  entry: { key, class: cls },
+});
+
+describe('raidEggPicture', () => {
+  it('shows the egg of each tier, a shadow egg as the plain one, a super mega none', () => {
+    expect(raidEggPicture(tier('T1'), [], BASE)).toBe(`${BASE}raid_egg_0_icon.png`);
+    expect(raidEggPicture(tier('T3', true), [], BASE)).toBe(`${BASE}raid_egg_1_icon.png`);
+    expect(raidEggPicture(tier('T5'), [boss('yveltal', 'legendary')], BASE)).toBe(
+      `${BASE}raid_egg_2_icon.png`,
+    );
+    expect(raidEggPicture(tier('Mega'), [], BASE)).toBe(`${BASE}raid_egg_3_icon.png`);
+    expect(raidEggPicture(tier('MegaLegendary'), [], BASE)).toBe(`${BASE}raid_egg_4_icon.png`);
+    expect(raidEggPicture(tier('Elite'), [], BASE)).toBe(`${BASE}raid_egg_extended_icon.png`);
+    expect(raidEggPicture(tier('SuperMega'), [], BASE)).toBeUndefined();
+  });
+
+  it('shows the wormhole when every T5 boss is an ultra beast, the primal egg for primals', () => {
+    const beasts = [boss('nihilego', 'ultra-beast'), boss('buzzwole', 'ultra-beast')];
+    expect(raidEggPicture(tier('T5'), beasts, BASE)).toBe(`${BASE}raid_ultra_icon.png`);
+    expect(raidEggPicture(tier('T5'), [...beasts, boss('yveltal', 'legendary')], BASE)).toBe(
+      `${BASE}raid_egg_2_icon.png`,
+    );
+    expect(
+      raidEggPicture(tier('MegaLegendary'), [boss('groudon_primal'), boss('kyogre_primal')], BASE),
+    ).toBe(`${BASE}raid_egg_primal_icon.png`);
+  });
+
+  it('is served from pogo_assets at a fixed commit by default', () => {
+    expect(RAID_EGG_PICTURES_URL).toMatch(
+      /^https:\/\/raw\.githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/Raids\/$/,
+    );
+  });
+});
diff --git a/src/domain/pogo/raid-eggs.ts b/src/domain/pogo/raid-eggs.ts
index 7830b83b0a9b8147865e8dbb7c23f266877dbe42..f3aa827dd18966c97cdae4e6eceb269adf436c58 100644
--- a/src/domain/pogo/raid-eggs.ts
+++ b/src/domain/pogo/raid-eggs.ts
@@ -1,3 +1,6 @@
+import type { PokemonClass } from './game-master.js';
+import type { RaidLevel, RaidTier } from './raid-tier.js';
+
 /**
  * The game's raid egg pictures (PokeMiners' `pogo_assets`, `Images/Raids`), which the post of an
  * egg shows as its thumbnail. Served from where `settings.raidEggPicturesUrl` points, by
@@ -6,3 +9,54 @@
  */
 export const RAID_EGG_PICTURES_URL =
   'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/';
+
+/**
+ * The egg of each tier, by file name without `.png`. A super mega raid has none: pogo_assets has
+ * no egg for it (its `raid_egg_5_icon` is not known to be one). Shadow raids have no egg of their
+ * own there either (the folder at that commit, looked at on 2026-10-14, has none): a shadow egg
+ * shows the plain egg of its tier.
+ */
+const EGG_FILES: Readonly<Record<RaidLevel, string | undefined>> = {
+  T1: 'raid_egg_0_icon',
+  T3: 'raid_egg_1_icon',
+  T5: 'raid_egg_2_icon',
+  Mega: 'raid_egg_3_icon',
+  MegaLegendary: 'raid_egg_4_icon',
+  SuperMega: undefined,
+  Elite: 'raid_egg_extended_icon',
+};
+/** A mega legendary egg whose bosses are all primal shows the primal egg. */
+const PRIMAL_EGG = 'raid_egg_primal_icon';
+/** A T5 "egg" whose bosses are all ultra beasts is a wormhole. */
+const ULTRA_WORMHOLE = 'raid_ultra_icon';
+
+/** What the picture needs of the current bosses of the egg's tier. */
+export interface EggBoss {
+  key: string;
+  entry?: { key: string; class: PokemonClass | null };
+}
+
+/**
+ * The address of the picture of an egg of this tier, or undefined when the game has none. A T5
+ * egg whose current bosses are all ultra beasts shows the wormhole; a mega legendary egg whose
+ * bosses are all primal shows the primal egg.
+ */
+export function raidEggPicture(
+  tier: RaidTier,
+  bossesOfTier: readonly EggBoss[],
+  baseUrl: string,
+): string | undefined {
+  const all = (fits: (boss: EggBoss) => boolean) =>
+    bossesOfTier.length > 0 && bossesOfTier.every(fits);
+  let file = EGG_FILES[tier.level];
+  if (tier.level === 'T5' && all((boss) => boss.entry?.class === 'ultra-beast')) {
+    file = ULTRA_WORMHOLE;
+  }
+  if (
+    tier.level === 'MegaLegendary' &&
+    all((boss) => (boss.entry?.key ?? boss.key).endsWith('_primal'))
+  ) {
+    file = PRIMAL_EGG;
+  }
+  return file === undefined ? undefined : `${baseUrl}${file}.png`;
+}
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index 8de6cb537faaa60e2ff0d21dcbd2e007e8c89467..8428b38dcae98b94fb05617495129c309bfb1d9e 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -500,6 +500,21 @@ describe('renderRaidPost', () => {
     expect(post.embed.fields?.map((field) => field.name)).toEqual(['Trainers (1)']);
   });
 
+  it('shows an egg as the game shows the egg, also when its boss is known, and a hatched raid as its boss', () => {
+    const picture = 'https://example.test/raid_egg_2_icon.png';
+    const shown = (party: RaidParty, now = PARTY_NOW) =>
+      renderRaidPost(view(party, { now, eggPicture: picture })).embed.thumbnail?.url;
+    expect(shown(egg)).toBe(picture);
+    const named = setBoss(
+      egg,
+      { tier: { level: 'T5', shadow: false }, boss: { key: 'yveltal' } },
+      rules,
+      PARTY_NOW,
+    ).party;
+    expect(shown(named)).toBe(picture);
+    expect(shown(named, at('2026-10-13T14:40'))).not.toBe(picture);
+  });
+
   it('says when the times are a guess from a screenshot, until they are set or the raid is over', () => {
     const guessed: RaidParty = {
       ...egg,
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index b329379b43b025f6a517b99d3abe07bd6b09604a..f06ab31a5abc19b6f0c12003bdbd556a908b65fd 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -82,6 +82,8 @@ export interface RaidPostView {
   boss: ShownBoss | undefined;
   /** What an egg of this tier will hatch as, when that is certain. */
   hatchesAs?: ShownBoss;
+  /** The game's picture of an egg of this tier (`raidEggPicture`), shown while it is an egg. */
+  eggPicture?: string;
   catalogue: PokemonCatalogue;
   /** Show the moves line also while no move is known (`settings.showUnknownMoves`). */
   showUnknownMoves: boolean;
@@ -379,12 +381,14 @@ export function renderRaidPost(view: RaidPostView): RenderedPost {
   const kept = fields.slice(0, LIMITS.fields);
   fitEmbed(embedTitle, embedDescription, kept);
 
+  // An egg is shown as the game's egg until it hatches, also when its boss is known.
+  const thumbnail = (stage === 'egg' ? view.eggPicture : undefined) ?? shown?.image;
   const embed: APIEmbed = {
     title: embedTitle,
     ...(gym ? { url: gymMapsUrl(gym) } : {}),
     description: embedDescription,
     color: STAGE_COLOURS[stage],
-    ...(shown?.image === undefined ? {} : { thumbnail: { url: shown.image } }),
+    ...(thumbnail === undefined ? {} : { thumbnail: { url: thumbnail } }),
     fields: kept.map((f) => f.field),
   };
   return {
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index 77d9ba8b3e14101c93ea90b1424625fa76047d34..30b3d5a95c20a6e9b4b7842dce9e1df2375af775 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -36,6 +36,7 @@ import { carriedOver, relocatedRaid } from '../domain/party/relocate.js';
 import { PartyStatus } from '../domain/party/status.js';
 import type { NewTimedParty } from '../domain/party/timed.js';
 import { createTrain, currentStop } from '../domain/party/train.js';
+import { raidEggPicture } from '../domain/pogo/raid-eggs.js';
 import type { RaidTier } from '../domain/pogo/raid-tier.js';
 import { raidDurationRules, type RaidDurationRules } from '../domain/time/raid-durations.js';
 import type { Logger } from '../log.js';
@@ -353,12 +354,18 @@ export class PartyService {
     const hatchesAs = boss
       ? undefined
       : shownAutoset(party.raid.tier, raidBosses.autoset(party.raid.tier), gameData);
+    const eggPicture = raidEggPicture(
+      party.raid.tier,
+      raidBosses.bossesOf(party.raid.tier),
+      settings.raidEggPicturesUrl,
+    );
     return {
       party,
       now: this.now(),
       gym: party.gymId === null ? undefined : gyms.get(party.gymId),
       boss,
       ...(hatchesAs ? { hatchesAs } : {}),
+      ...(eggPicture === undefined ? {} : { eggPicture }),
       catalogue,
       showUnknownMoves: settings.showUnknownMoves,
       zone: settings.timezone,
````

---

### Task 11: Gyms that share a name: gym duplicates, and a warning when one is made

Prototype commit: `abfe41f68b2d2ca9aa4246e51e216f208752b8e1`

Gyms that share a name: their shown names (the nickname, else the name)
compared by letters and digits only (shared-names.ts). /gym duplicates
(staff) lists such groups per region of this server, every gym with its
number, name, nickname and description, over as many messages as it
takes (at most ten, with a count of the rest); /gym add, edit and move
warn, never refuse, when they make such a pair, and suggest a nickname.

**Interfaces:**
- Produces: `shownName`, `nameKey`, `namesakes`, `sharedNames`, `NamedGym` (`src/domain/gyms/shared-names.ts`); the `/gym duplicates` part; `namesakeNote`.

**Files:**

```
 src/commands/gyms/add.ts             |   2 +
 src/commands/gyms/duplicates.test.ts |  97 +++++++++++++++++++++++++++++++++++++++++++++
 src/commands/gyms/duplicates.ts      | 119 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/commands/gyms/edit.ts            |   2 +
 src/commands/gyms/index.ts           |   2 +
 src/commands/gyms/move.ts            |   2 +
 src/domain/gyms/shared-names.test.ts |  45 +++++++++++++++++++++
 src/domain/gyms/shared-names.ts      |  51 ++++++++++++++++++++++++
 8 files changed, 320 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/commands/gyms/duplicates.test.ts src/domain/gyms/shared-names.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff abfe41f68b2d2ca9aa4246e51e216f208752b8e1 -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Gyms that share a name: gym duplicates, and a warning when one is made`, the body above and the trailer, staging exactly
  `src/commands/gyms/add.ts src/commands/gyms/duplicates.test.ts src/commands/gyms/duplicates.ts src/commands/gyms/edit.ts src/commands/gyms/index.ts src/commands/gyms/move.ts src/domain/gyms/shared-names.test.ts src/domain/gyms/shared-names.ts`.

````diff
diff --git a/src/commands/gyms/add.ts b/src/commands/gyms/add.ts
index c54a0f7941c13ef726ef96fcc99ad0040625a7b5..e2c79ea4b1d18b1090f2c1561daf5bddd49ee86f 100644
--- a/src/commands/gyms/add.ts
+++ b/src/commands/gyms/add.ts
@@ -1,3 +1,4 @@
+import { namesakeNote } from './duplicates.js';
 import {
   ActionRowBuilder,
   ButtonStyle,
@@ -146,6 +147,7 @@ async function addAnswered(
       `Added ${gymWithId(gym)}.`,
       fetchNote(ctx),
       nameNote(ctx, gym),
+      namesakeNote(ctx, gym),
     ]),
   );
 }
diff --git a/src/commands/gyms/duplicates.test.ts b/src/commands/gyms/duplicates.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2a2bfcdc47ace7766f2514339837d28217faac23
--- /dev/null
+++ b/src/commands/gyms/duplicates.test.ts
@@ -0,0 +1,97 @@
+import { describe, expect, it } from 'vitest';
+import { sent } from '../../../test/support/fake-interactions.js';
+import { answerOf, buttonId, gymCommandsWith } from '../../../test/support/gym-commands.js';
+import { WEST_CHANNEL } from '../../../test/support/gyms.js';
+import { MAX_DUPLICATE_MESSAGES, pagedGroups } from './duplicates.js';
+
+const FREE = '40.015, -80.015';
+
+interface Form {
+  custom_id: string;
+  components: { components: { custom_id: string; value?: string }[] }[];
+}
+
+const filled = (form: Form): Record<string, string> =>
+  Object.fromEntries(
+    form.components.map((row) => [
+      row.components[0]?.custom_id ?? '',
+      row.components[0]?.value ?? '',
+    ]),
+  );
+
+describe('gyms that share a name', () => {
+  it('says so when there are none: two Starbucks of two regions are no pair', async () => {
+    const made = await gymCommandsWith();
+    const listed = answerOf(await made.use('duplicates'));
+    expect(listed.content).toBe(
+      'No two gyms of a region of this server are shown by the same name.',
+    );
+  });
+
+  it('warns, and adds all the same, when a new gym is shown by the name of another of its region', async () => {
+    const made = await gymCommandsWith();
+    const question = answerOf(await made.use('add', { location: FREE, name: 'STAR-BUCKS' }));
+    const added = answerOf(await made.press(buttonId(question, 'Add')));
+    expect(added.content).toContain('Added **STAR-BUCKS** (#13).');
+    expect(added.content).toContain(
+      'Another gym of its region is shown as "STAR-BUCKS" too: **Starbucks** (#5). Members and ' +
+        'screenshots can tell such gyms apart only by a nickname: give one with `/gym edit`.',
+    );
+    expect(made.gymStore.row(13)).toMatchObject({ name: 'STAR-BUCKS' });
+
+    const listed = answerOf(await made.use('duplicates'));
+    expect(listed.content).toBe(
+      'One name is shared by gyms of one region. Give each such gym a nickname with `/gym edit`.' +
+        `\n\n**<#${WEST_CHANNEL}>** "Starbucks":\n- **Starbucks** (#5) — Sponsored gym\n` +
+        '- **STAR-BUCKS** (#13)',
+    );
+  });
+
+  it('warns of a nickname that is the shown name of another gym of the region', async () => {
+    const made = await gymCommandsWith();
+    const used = await made.use('edit', { gym: 'id:6' });
+    const form = used.showModal.mock.calls[0]?.[0] as Form;
+    const submitted = await made.submit(
+      form.custom_id,
+      { ...filled(form), nickname: 'Old Stone Fountain' },
+      { modalFromCommand: true },
+    );
+    expect(answerOf(submitted).content).toContain(
+      'Another gym of its region is shown as "Old Stone Fountain" too: **Old Stone Fountain** (#2).',
+    );
+  });
+
+  it('warns when a gym is moved into a region with a gym of its name', async () => {
+    const made = await gymCommandsWith();
+    const question = answerOf(await made.use('move', { gym: 'id:9', location: '40.021, -80.07' }));
+    const moved = answerOf(await made.press(buttonId(question, 'Move anyway')));
+    expect(moved.content).toContain(
+      'Another gym of its region is shown as "Starbucks" too: **Starbucks** (#5).',
+    );
+  });
+
+  it('answers a long list in several messages, cut between groups, and says what did not fit', () => {
+    const group = (i: number) => `**<#1>** "Gym ${i}":\n- ${'x'.repeat(400)}`;
+    const pages = pagedGroups(
+      'Head.',
+      Array.from({ length: 60 }, (_, i) => group(i)),
+    );
+    expect(pages).toHaveLength(MAX_DUPLICATE_MESSAGES);
+    for (const page of pages) expect(page.length).toBeLessThanOrEqual(2_000);
+    expect(pages[0]?.startsWith('Head.')).toBe(true);
+    expect(pages.at(-1)).toMatch(/… and \d+ more not shown\.$/);
+    // Every group shown is whole.
+    expect(pages.join('\n\n').match(/"Gym \d+":\n- x{400}/g)?.length).toBe(
+      60 - Number(/and (\d+) more/.exec(pages.at(-1) ?? '')?.[1] ?? 0),
+    );
+    const few = pagedGroups('Head.', [group(1), group(2)]);
+    expect(few).toHaveLength(1);
+  });
+
+  it('sends the further messages as private follow-ups', async () => {
+    const made = await gymCommandsWith();
+    const listed = await made.use('duplicates');
+    expect(sent(listed.editReply).content).toMatch(/^No two gyms/);
+    expect(listed.followUp).not.toHaveBeenCalled();
+  });
+});
diff --git a/src/commands/gyms/duplicates.ts b/src/commands/gyms/duplicates.ts
new file mode 100644
index 0000000000000000000000000000000000000000..53fbf889adf3a61852b64c42e72c8e16646aff24
--- /dev/null
+++ b/src/commands/gyms/duplicates.ts
@@ -0,0 +1,119 @@
+import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
+import type { AppContext } from '../../app-context.js';
+import type { Gym } from '../../db/repositories/gym-repository.js';
+import type { SubcommandPart } from '../../discord/command-group.js';
+import { namesakes, sharedNames, shownName } from '../../domain/gyms/shared-names.js';
+import { gymWithId } from '../../render/gym-view.js';
+import { fitItems, plain, truncate } from '../../render/text.js';
+import { staffPlace } from './shared.js';
+
+/** A message's text stays within Discord's 2,000 characters. */
+const MESSAGE = 2_000;
+
+/**
+ * What staff are told after adding, changing or moving a gym that is now shown by the same name
+ * as another gym of a region it lies in (or was given a nickname that is another's shown name):
+ * a note, not a refusal. Undefined when there is none.
+ */
+export function namesakeNote(ctx: Pick<AppContext, 'gyms'>, gym: Gym): string | undefined {
+  const others = new Map<number, Gym>();
+  for (const channelId of ctx.gyms.regionsOf(gym.id)) {
+    for (const other of namesakes(gym, ctx.gyms.inRegion(channelId))) others.set(other.id, other);
+  }
+  if (others.size === 0) return undefined;
+  const named = fitItems([...others.values()].map(gymWithId), 1_000);
+  return (
+    `Another gym of its region is shown as "${plain(shownName(gym))}" too: ${named}. Members ` +
+    'and screenshots can tell such gyms apart only by a nickname: give one with `/gym edit`.'
+  );
+}
+
+/** A gym of a group: its number, name, nickname and description. */
+function gymLine(gym: Gym): string {
+  const description = gym.description?.trim() ? ` — ${plain(truncate(gym.description, 80))}` : '';
+  return `- ${gymWithId(gym)}${description}`;
+}
+
+/**
+ * `/gym duplicates`: per region of this server, the gyms shown by one name (the nickname where
+ * there is one), compared as the search compares names, so that staff see which need a
+ * nickname.
+ */
+export const duplicateGyms: SubcommandPart = {
+  data: new SlashCommandSubcommandBuilder()
+    .setName('duplicates')
+    .setDescription('List the gyms of a region that are shown by the same name'),
+  help: {
+    details:
+      'Gyms of one region with the same name (several Starbucks) can be told apart only by a ' +
+      'nickname: in the menu `/raid` shows, and when a screenshot names one. This lists them, ' +
+      'per region of this server, with their numbers and descriptions; give each a nickname ' +
+      'with `/gym edit`. Names are compared by their letters and digits alone (case, accents, ' +
+      'spaces and punctuation do not count: "P.N.C. Park" is "PNC Park"); a gym with a ' +
+      'nickname of its own is not listed.',
+    examples: ['/gym duplicates'],
+  },
+  defer: 'ephemeral',
+  async execute(interaction, ctx) {
+    const { guildId } = await staffPlace(interaction, ctx);
+    const regions = ctx.regions
+      .all()
+      .filter((region) => guildId !== undefined && region.guildId === guildId);
+    // Each group is an item of its own, with its region: a long list is cut between groups.
+    const groups: string[] = [];
+    for (const region of regions) {
+      for (const group of sharedNames(ctx.gyms.inRegion(region.channelId))) {
+        const [first] = group;
+        const name = first ? plain(shownName(first)) : '';
+        groups.push(
+          truncate(
+            [`**<#${region.channelId}>** "${name}":`, ...group.map(gymLine)].join('\n'),
+            MESSAGE - 200,
+          ),
+        );
+      }
+    }
+    if (groups.length === 0) {
+      await interaction.editReply({
+        content: 'No two gyms of a region of this server are shown by the same name.',
+      });
+      return;
+    }
+    const head =
+      `${groups.length === 1 ? 'One name is' : `${groups.length} names are`} shared by gyms of ` +
+      'one region. Give each such gym a nickname with `/gym edit`.';
+    const messages = pagedGroups(head, groups);
+    const [first, ...more] = messages;
+    await interaction.editReply({ content: first ?? head });
+    for (const content of more) {
+      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
+    }
+  },
+};
+
+/** At most this many messages answer `/gym duplicates`. */
+export const MAX_DUPLICATE_MESSAGES = 10;
+
+/**
+ * The groups in messages of at most `MESSAGE` characters, the first after `head`, at most
+ * `MAX_DUPLICATE_MESSAGES` of them; the last says how many groups did not fit.
+ */
+export function pagedGroups(head: string, groups: readonly string[]): string[] {
+  const messages: string[] = [];
+  let current = head;
+  let shown = 0;
+  const room = (text: string) => MESSAGE - 60 - text.length;
+  for (const group of groups) {
+    if (group.length + 2 > room(current)) {
+      if (messages.length + 1 >= MAX_DUPLICATE_MESSAGES) break;
+      messages.push(current);
+      current = '';
+    }
+    current = current === '' ? group : `${current}\n\n${group}`;
+    shown++;
+  }
+  const left = groups.length - shown;
+  if (left > 0) current += `\n\n… and ${left} more not shown.`;
+  messages.push(current);
+  return messages;
+}
diff --git a/src/commands/gyms/edit.ts b/src/commands/gyms/edit.ts
index 306912a193602898e7d40f1c833043ab3ae99b88..da48ec3b5aa9466ce887bf80f492b173f343be97 100644
--- a/src/commands/gyms/edit.ts
+++ b/src/commands/gyms/edit.ts
@@ -1,3 +1,4 @@
+import { namesakeNote } from './duplicates.js';
 import { MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
 import type { SubcommandPart } from '../../discord/command-group.js';
 import { UserError } from '../../discord/errors.js';
@@ -159,6 +160,7 @@ export const editForms: Readonly<Record<string, FormAnswer>> = {
           `Changed ${fieldList(names)} of ${gymWithId(gym)}.`,
           note,
           names.includes('name') || !findable ? nameNote(ctx, gym) : undefined,
+          names.includes('name') || names.includes('nickname') ? namesakeNote(ctx, gym) : undefined,
         ]),
       );
     });
diff --git a/src/commands/gyms/index.ts b/src/commands/gyms/index.ts
index bf1fae19a23755c9cb4b44d085f03e3571ca2098..f2b9847b07e6fb7c7b4ec9e3ab86d535e44a6e60 100644
--- a/src/commands/gyms/index.ts
+++ b/src/commands/gyms/index.ts
@@ -3,6 +3,7 @@ import { commandGroup, type SubcommandPart } from '../../discord/command-group.j
 import { requireBotManagement } from '../../discord/guards.js';
 import { addGym } from './add.js';
 import { deleteGym } from './delete.js';
+import { duplicateGyms } from './duplicates.js';
 import { editGym } from './edit.js';
 import { eliteGym } from './elite.js';
 import { moveGym } from './move.js';
@@ -19,6 +20,7 @@ const parts: readonly SubcommandPart[] = [
   deleteGym,
   refreshGym,
   exportGyms,
+  duplicateGyms,
 ];
 
 /**
diff --git a/src/commands/gyms/move.ts b/src/commands/gyms/move.ts
index ddb2bde9dbe5271881ceedfc7614220ce3a1c2ae..ce9f0a09cdde8ba6a5d16677b4e6f1556fb51b56 100644
--- a/src/commands/gyms/move.ts
+++ b/src/commands/gyms/move.ts
@@ -1,3 +1,4 @@
+import { namesakeNote } from './duplicates.js';
 import {
   ActionRowBuilder,
   ButtonStyle,
@@ -138,6 +139,7 @@ async function moveAnswered(
     await gymViewMessage(ctx, staff, gym, [
       `Moved ${gymWithId(gym)} from ${pointLink(from)} to ${pointLink(point)} (${distanceText(metres)}).`,
       fetchNote(ctx),
+      namesakeNote(ctx, gym),
       ...(elsewhere
         ? shown.raids.map((raid) =>
             raid.forumPostId === null
diff --git a/src/domain/gyms/shared-names.test.ts b/src/domain/gyms/shared-names.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a856f4970805e4a1f36cdd385caab6f060b18515
--- /dev/null
+++ b/src/domain/gyms/shared-names.test.ts
@@ -0,0 +1,45 @@
+import { describe, expect, it } from 'vitest';
+import { nameKey, namesakes, sharedNames, shownName } from './shared-names.js';
+
+const gym = (id: number, name: string, nickname: string | null = null) => ({ id, name, nickname });
+
+describe('gyms that share a name', () => {
+  it('compares shown names by their letters and digits alone', () => {
+    expect(nameKey("St. Mary's Café")).toBe(nameKey('st marys cafe'));
+    expect(nameKey('PNC  Park')).toBe(nameKey('pnc-park'));
+    expect(nameKey('P.N.C. Park')).toBe(nameKey('PNC Park'));
+    expect(nameKey('Park')).not.toBe(nameKey('Parks'));
+    expect(nameKey('Gym 1')).not.toBe(nameKey('Gym 2'));
+    expect(shownName(gym(1, 'Starbucks', 'Starbucks by the river'))).toBe('Starbucks by the river');
+    expect(shownName(gym(1, 'Starbucks', '  '))).toBe('Starbucks');
+  });
+
+  it('finds the other gyms shown by the same name, also by a nickname', () => {
+    const gyms = [
+      gym(1, 'Starbucks'),
+      gym(2, 'STARBUCKS'),
+      gym(3, 'Starbucks', 'Starbucks by the river'),
+      gym(4, 'Old Mill', 'Starbücks'),
+    ];
+    expect(namesakes(gyms[0] ?? gym(0, ''), gyms).map((g) => g.id)).toEqual([2, 4]);
+    expect(namesakes(gyms[2] ?? gym(0, ''), gyms)).toEqual([]);
+    // A nickname equal to another gym's shown name makes a pair as well.
+    expect(namesakes(gym(9, 'Library', 'Starbucks'), gyms).map((g) => g.id)).toEqual([1, 2, 4]);
+  });
+
+  it('groups the gyms shown by one name, leaving out those a nickname tells apart', () => {
+    const groups = sharedNames([
+      gym(5, 'PNC Park'),
+      gym(1, 'Starbucks'),
+      gym(2, "Starbuck's"),
+      gym(3, 'Starbucks', 'River Starbucks'),
+      gym(4, 'P.N.C. Park'),
+      gym(6, 'Library'),
+    ]);
+    expect(groups.map((group) => group.map((g) => g.id))).toEqual([
+      [4, 5],
+      [1, 2],
+    ]);
+    expect(sharedNames([gym(5, 'PNC Park'), gym(4, 'pnc park')]).map((g) => g.length)).toEqual([2]);
+  });
+});
diff --git a/src/domain/gyms/shared-names.ts b/src/domain/gyms/shared-names.ts
new file mode 100644
index 0000000000000000000000000000000000000000..dd5c8d59bebee0a5202a5ec8f96cd34b77272c7b
--- /dev/null
+++ b/src/domain/gyms/shared-names.ts
@@ -0,0 +1,51 @@
+import { foldText } from '../search/text.js';
+
+/**
+ * Gyms of one region that are shown by the same name (several Starbucks): a screenshot names a
+ * gym by what the game shows, and a menu of gyms can tell such gyms apart only by a nickname.
+ * Names are compared by their letters and digits alone (Matt, 2026-10-14): case, accents, spaces
+ * and punctuation do not count, so "P.N.C. Park" and "PNC Park" are one name. The gym search
+ * itself reads them otherwise.
+ */
+
+/** What is needed of a gym. */
+export interface NamedGym {
+  id: number;
+  name: string;
+  nickname: string | null;
+}
+
+/** The name a gym is shown by: its nickname where it has one, otherwise its name. */
+export function shownName(gym: NamedGym): string {
+  return gym.nickname?.trim() || gym.name;
+}
+
+/** The shown name by its letters and digits: `St. Mary's Café` and `stmaryscafe` are one. */
+export function nameKey(text: string): string {
+  return foldText(text).replace(/[^\p{L}\p{N}]+/gu, '');
+}
+
+/** The other gyms of `gyms` that are shown by the same name as `gym`. */
+export function namesakes<G extends NamedGym>(gym: NamedGym, gyms: readonly G[]): G[] {
+  const key = nameKey(shownName(gym));
+  if (key === '') return [];
+  return gyms.filter((other) => other.id !== gym.id && nameKey(shownName(other)) === key);
+}
+
+/**
+ * The groups of gyms shown by the same name, each sorted by number, the groups by name. A gym
+ * with a nickname of its own is not in a group with the gyms of its name: the nickname tells it
+ * apart.
+ */
+export function sharedNames<G extends NamedGym>(gyms: readonly G[]): G[][] {
+  const groups = new Map<string, G[]>();
+  for (const gym of gyms) {
+    const key = nameKey(shownName(gym));
+    if (key === '') continue;
+    groups.set(key, [...(groups.get(key) ?? []), gym]);
+  }
+  return [...groups.entries()]
+    .filter(([, group]) => group.length > 1)
+    .sort(([a], [b]) => a.localeCompare(b))
+    .map(([, group]) => [...group].sort((a, b) => a.id - b.id));
+}
````

---

### Task 12: ocr:review, ocr:check over a review folder with a baseline, the improvement skill

Prototype commit: `945390967cb7743400f3c315ec334a718a4d31eb`

The improvement cycle for a later session: npm run ocr:review -- <folder>
triages a review folder (per element how often it was said wrong and at
which stage; gym texts corrected to one gym twice as suggested
nicknames; ids and corrections only with --show-text); ocr:check also
scores a review folder (labels from "All right" and the gym the member
picked), and takes --baseline / --write-baseline (compareBaseline: a
sample or element no longer read counts as worse) and --bosses /
--write-bosses (a boss list snapshot to decide among). The skill
.claude/skills/improve-screenshot-reading/SKILL.md, the log
docs/superpowers/ocr-improvements.md, and CLAUDE.md (commands and
conventions).

**Interfaces:**
- Produces: `scripts/ocr/review.ts` (`ocr:review`), `reviewSummary`, `wrongAt`, `ReviewRecord` (`src/domain/ocr/review.ts`); `compareBaseline`, `Results`, `BossSnapshot`, `bossesOfSnapshot` (`src/domain/ocr/baseline.ts`); the skill and the log.

**Files:**

```
 .claude/skills/improve-screenshot-reading/SKILL.md |  71 ++++++++++++++
 CLAUDE.md                                          |  12 ++-
 docs/superpowers/ocr-improvements.md               |  20 ++++
 package.json                                       |   1 +
 scripts/ocr/check.ts                               | 204 ++++++++++++++++++++++++++++++-----------
 scripts/ocr/review.ts                              |  90 ++++++++++++++++++
 src/domain/ocr/baseline.test.ts                    |  37 ++++++++
 src/domain/ocr/baseline.ts                         |  60 ++++++++++++
 src/domain/ocr/review.test.ts                      |  82 +++++++++++++++++
 src/domain/ocr/review.ts                           | 146 +++++++++++++++++++++++++++++
 10 files changed, 666 insertions(+), 57 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/ocr/baseline.test.ts src/domain/ocr/review.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 945390967cb7743400f3c315ec334a718a4d31eb -- src test scripts docs .claude package.json CLAUDE.md` prints nothing.
- [ ] **Step 5: Commit** with the title `ocr:review, ocr:check over a review folder with a baseline, the improvement skill`, the body above and the trailer, staging exactly
  `.claude/skills/improve-screenshot-reading/SKILL.md CLAUDE.md docs/superpowers/ocr-improvements.md package.json scripts/ocr/check.ts scripts/ocr/review.ts src/domain/ocr/baseline.test.ts src/domain/ocr/baseline.ts src/domain/ocr/review.test.ts src/domain/ocr/review.ts`.

````diff
diff --git a/.claude/skills/improve-screenshot-reading/SKILL.md b/.claude/skills/improve-screenshot-reading/SKILL.md
new file mode 100644
index 0000000000000000000000000000000000000000..ff20bfe6314d4eb381c06fef66afa522234af649
--- /dev/null
+++ b/.claude/skills/improve-screenshot-reading/SKILL.md
@@ -0,0 +1,71 @@
+---
+name: improve-screenshot-reading
+description: Improve Professor Pine's raid screenshot reader from members' feedback. Use when Matt asks to improve the screenshot reader (OCR), hands over a review folder (a copy of production's var/ocr/review/), or asks why screenshots are misread.
+---
+
+# Improving the screenshot reader
+
+Pine reads raid screenshots with PaddleOCR models it never retrains: what goes wrong is nearly
+always Pine's own code around them (the layout rules of `src/domain/ocr/raid-screen.ts`, the head
+count of `tier-heads.ts`, the boss from the CP and the time of `screenshot-report.ts`, the gym
+search, a threshold). This is the cycle that fixes such things from what members said. Pine never
+changes its own rules: you do, here, and only the check over every sample shows that a change
+breaks nothing. Background: `docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md`
+("Improving the reader from the feedback").
+
+## Before anything
+
+1. Read `docs/superpowers/ocr-improvements.md`, the log of earlier fixes: a cause that was
+   chased before is not chased again.
+2. Find the samples. They never enter the repository:
+   - the research's 28 labelled samples: `var/ocr-research/` (with `labels.json`);
+   - review folders: copies of production's `var/ocr/review/`, which Matt puts under
+     `var/ocr/review-<date>/` (or names). Each screenshot `<id>.png|jpg|webp` has a record
+     `<id>.json` beside it: everything the reader saw (lines of text with their boxes, the band
+     where it looked for heads and the scores, the purple), what the reader made of it by itself
+     (`report`), what the member typed beside it (`typed`), what it decided, the boss list of the
+     moment (`bosses`), and members' feedback; `label` is the answer key when a member said it
+     was right. Records hold the ids of the members who sent the screenshots and gave feedback,
+     for staff and development only.
+
+## The cycle
+
+1. **Triage:** `npm run ocr:review -- <review folder>`. Per element, how often members said it
+   was wrong and where: the gym's text was read but the search chose another gym (a nickname
+   fixes it, no code: tell Matt which, `/gym edit`), or no gym was found or no text read (a
+   reading problem); no clock or no countdown; the heads counted; a CP read and no boss decided.
+   It also lists gym texts corrected the same way twice (suggested nicknames). Members'
+   corrections and their ids are printed only with `--show-text`; read them on this machine,
+   never copy them anywhere else.
+2. **Pick the largest group of one cause.** Open its screenshots and their records: the lines and
+   boxes say why without running the models. Write down the cause before changing anything.
+3. **Change one rule or threshold**, with a unit test that draws or describes the case (never a
+   member's screenshot as a fixture unless Matt agrees to that one).
+4. **Check every sample**, before and after. The research samples against the committed
+   baseline: `npm run ocr:check -- var/ocr-research --baseline docs/superpowers/ocr-baseline.json`.
+   Each review folder against a baseline of its own, written before the change and kept beside
+   the folder, never committed: `npm run ocr:check -- <folder> --write-baseline
+   <folder>.before.json` first, then `--baseline <folder>.before.json` after it (a review
+   folder's samples are decided among their own records' boss lists, so the comparison holds
+   whenever it is run). A threshold is chosen by a sweep over all samples, as in the research.
+5. **Judge:** no sample may go from right to wrong (`WORSE` lines, exit status 1) unless you can
+   say why the old answer was right by chance, and Matt agrees.
+6. **Update** the baseline (`--write-baseline docs/superpowers/ocr-baseline.json` over the
+   research samples) and append to `docs/superpowers/ocr-improvements.md`: the date, the failure
+   group, its cause, the fix, the scores before and after.
+7. Commit the code, its tests, the baseline and the log together. Never commit a screenshot, a
+   record from a review folder, or anything a member wrote.
+
+## What may never be committed
+
+Screenshots, review records (`<id>.json`), members' ids, names and corrections (neither in a
+commit nor in a printout you pass on), gym texts read off members' screenshots beyond what a test
+needs (and then invented ones), production gym rows, a review folder's own baseline. The committed
+baseline holds the research samples' file names and right/wrong only.
+
+## When the models are the problem
+
+If the triage ever shows text the model itself cannot read (the lines in the records are wrong
+where the screen is clear), say so to Matt: retraining the recogniser on crops of corrected
+samples is possible, but a project of its own. A new model version is a change of `OCR_ASSETS`
+(`src/domain/ocr/assets.ts`), measured with `ocr:check` over every sample first.
diff --git a/CLAUDE.md b/CLAUDE.md
index 90155bc54f39dfcd98c1170506894bfe59ecbd9e..d070bcb7077887a146236ecc819c9d3e53d91137 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -41,7 +41,8 @@ npm run fixtures:game-data   # rebuild the game-data test fixtures (add -- --dow
 npm run raid-bosses:check    # download the raid boss feed and print the list Pine makes of it (writes nothing)
 npm run role-auth:export     # print the legacy role authorization per server, mapped to the new commands (reads only; --json)
 npm run migrate        # run Kysely migrations against the configured database
-npm run ocr:check -- <folder> [--labels <file>] [--device cpu|cuda|directml] [--threads n] [--priority low|normal]   # read screenshots with the real models; scores and time
+npm run ocr:check -- <folder> [--labels <file>] [--baseline <file>] [--write-baseline <file>] [--bosses <file>] [--write-bosses <file>] [--device cpu|cuda|directml] [--threads n] [--priority low|normal]   # read screenshots with the real models; scores (also of a review folder), clocks' confidence and time
+npm run ocr:review -- <folder> [--show-text]   # triage of a review folder: what members said was wrong, and where (their texts and ids only with --show-text)
 ```
 
 Format the files you touch with `npx prettier --write <files>`; `format:check` is part of `check`.
@@ -105,7 +106,7 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - The bot has no member list: a member's display name and team (a role named `instinct`, `mystic` or `valor`) are read from each interaction with `memberInfo(interaction)` and stored with their attendee record by `noteMember` (the attendance service does this for every action). The post lists each status by team, then by that name, and writes a team's emoji once before the first of its members.
 - The controls of a post are part of what the renderer makes (`partyControls(party)` in `src/render/party-controls.ts`, in `rendered.message.components`): buttons only, none depending on the time. Their custom ids are `party:<party id>:<action>[:<arg>]` (`PARTY_ACTIONS`); the handler (`src/components/party.ts`) finds the party by that id, never by the channel, so the same controls work on a copy of the message elsewhere. `ComponentHandler` has `throttle` like commands (per member, over all controls of its kind); the party controls and each attendance command allow 30 uses a minute (`ACTION_THROTTLE`).
 - What the bot says in a post about what happened goes through `PartyLines.say(postId, text, key?)` (`src/services/party-lines.ts`): no pings, the first line at once, later ones gathered at most every two seconds, and of several unsent lines with one key only the newest is said (a member's standing has the key `member:<id>`). Lines for a post whose party is no longer active are dropped. How a member stands is worded by `standing` / `standingReply` / `standingLine`, a refusal by `problemText` (`src/render/activity.ts`).
-- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 7 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; exactly the parts that fit the type must be present); versions 1 to 6 are still read.
+- The completion question is a message in the post with the buttons "Yes, done" / "Not yet". `party.prompts.completion` keeps each question as `{ id, members }` (at most ten), and a question is deleted once none of the members it asked is still asked (`AttendanceService.ask`, `removeQuestions`, `servedQuestions`). An attendee asked by a member's Done records that member (`askedBy`); when that member is not done after all and nobody they asked has completed the raid, the question is taken back (`withdrawQuestions`, which the attendance service runs with every change; `withdrawn` in the outcome). `party.prompts.warning` is the archive warning. The state document is version 8 (plan 3A: the parts `timed` and `meetup` beside `raid`; plan 3B: `train`; plan 3C: `train.finishedFrom`; version 7: `makerName`; version 8: `raid.screenshot`; exactly the parts that fit the type must be present); versions 1 to 7 are still read.
 - Time passes through `PartyScheduler` (`src/services/party-scheduler.ts`): at every `cleanupInterval` it runs `partyTick` inside the store for every party and does what the tick asks for (render, a line at hatch, `ask`, "did not answer and counts as done", the warning, the end). It is started in `src/app.ts` after the connection to Discord and stopped first at shutdown; a test moves `clock.now` and calls `tick()`. Its effects happen at most once (the party is stored first); only the ending repeats. `activity(channelId)` (from `MessageCreate`; only the channel id is used) says the warning again after every fifth message of others in a warned post, deleting the earlier one.
 - A party ends through `PartyService.end(partyId, onlyIf?)`: the store first, then the link line, leftover questions and the warning are deleted, the post is shown once more without controls, then archived and locked (`PartyGateway.archivePost`). `onlyIf` is asked inside the store; whoever ends a party on a condition passes it there, never checks before. Anything sent or edited in an archived post opens it again, so nothing may follow the archiving; `sweepPosts()` (at start and hourly) archives open posts that the database says belong to an ended party, and nothing else.
 - What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`). It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
@@ -194,7 +195,12 @@ Format the files you touch with `npx prettier --write <files>`; `format:check` i
 - Screenshots are read through `ScreenshotReader` (`OcrService`, `src/services/ocr-service.ts`): `read(bytes, { onQueued })` never throws and answers `read` (with the `ScreenReading`), `not-an-image`, `failed`, `busy` (beyond `settings.ocr.queue`) or `unavailable`; more than `MAX_SCREENSHOT_BYTES` is no image. It reads in a child process (`src/ocr/worker.ts`, protocol in `src/ocr/protocol.ts`): forked on first use with a minimal environment (`workerEnvironment`: exact names, none of the bot's secrets), lowered priority (every thread on Linux), one screenshot at a time, killed after `ocr.timeoutSeconds`, ended after ten minutes idle; it answers `received` first, and only a process that died before that is given the screenshot again. A start that fails is not tried again for ten minutes; a device the platform lacks (`deviceProblem`) is refused once. `close()` at shutdown leaves no process behind. The bot's own process never decodes an image (it imports `sharp` as a type only). Tests use the fake worker `test/support/ocr-worker.ts`; only `npm run ocr:check` runs the real models.
 - The model files and the game's head icon (`OCR_ASSETS`, `src/domain/ocr/assets.ts`) are downloaded into `var/ocr/` by `OcrAssets` (`src/services/ocr-assets.ts`) and checked by size and SHA-256 before every start of the reading process; a file that differs is downloaded again, a download that still differs is refused. A new model version is a change of that list, measured with `ocr:check` first.
 - What the reader does with an image is pure (`src/domain/ocr/`): `text-model.ts` (detector boxes, CTC decoding, lines; caps `DETECTOR_PIXELS`, `MAX_LINE_WIDTH`), `raid-screen.ts` (the elements found from the text and its boxes, no fixed layout; the clock read again from the status bar; `clockIn`'s rules), `tier-heads.ts` (masked template matching against the game's icon), `shadow.ts` (the purple). Images are PNG, JPEG or WebP by their first bytes, at most `MAX_PIXELS`, of a screen's proportions (`src/ocr/screen-reader.ts`). Nothing the reader saw is logged.
-- `screenshotReport(reading, reportContext(...))` (`src/domain/ocr/screenshot-report.ts`; the context from `src/services/screenshot-context.ts`: the gym search of the channel limited to the server's gyms, the bosses, the settings) says what raid a screenshot shows: gym (`clear` only as `clearGymHit` would act), egg or hatched, tier, boss (by its CP; the purple decides between shadow and plain), time (a 12-hour clock as the reading just before the upload; otherwise guessed from the upload), and `doubts` (`ReportDoubt`). It decides nothing on Discord: what a doubt asks of the member is 7B's.
+- `screenshotReport(reading, reportContext(...))` (`src/domain/ocr/screenshot-report.ts`; the context from `src/services/screenshot-context.ts`: the gym search of the channel limited to the server's gyms, the bosses, the settings) says what raid a screenshot shows: gym (`clear` only as `clearGymHit` would act), egg or hatched, tier, boss (by its CP; the purple decides between shadow and plain), time (a 12-hour clock as the reading just before the upload; otherwise guessed from the upload), and `doubts` (`ReportDoubt`). What is done with it is `decide` (below); its doubts are what the "Screenshot feedback" button shows.
+- Screenshots on Discord go through `ctx.screenshots` (`ScreenshotService`, `src/services/screenshot-service.ts`): `read(source, where)` downloads the attachment (`MAX_SCREENSHOT_BYTES`), reads it, makes the report in the channel's region (the time also from an Android file name, `takenAtFromFileName`), puts in what the member typed (`withTyped`), decides and keeps it. The decision is pure (`decide`, `src/domain/ocr/screenshot-decision.ts`; Matt, 2026-10-14): `refuse` only a screen that is no raid's or a gym this server does not have, `ask` only which gym when the gym is not clear (a menu of every gym a fresh search of the text finds, `gymCandidates`, told apart by `menuDescription`), otherwise `report` unasked with what is known (a hatched raid without a boss is `RaidReport.hatched`; an unknown stage an egg without a time; a countdown too long is left out; a hatched raid over by its countdown is refused `raid-over`, an egg past its hatch reported hatched, ending its tier's length after the hatch (`hatchedMinutes`: `raidDurationsAt` with the raid events), certain when the moment of the screenshot is known (by its file or a clock without `time-guessed` / `time-sources-differ`), with the boss it was read with or the one a hatch gives, refused when that end has passed too; a guessed, stale or contested time is used and said in the post, `raid.screenshot.timeUncertain`, until `/hatch`, `/end` or "Set time" confirm it, `timeConfirmed`; `/duration` does not). The time of a screenshot is the file name's (`takenAtFromFileName`) unless the clock read disagrees by more than two minutes and was read surely (`CLOCK_SURE`, the confidence of its status-bar line), with the doubt `time-sources-differ` either way. The outcome's `withGym(id)` decides again as if the member had named a gym. A screenshot whose turn in the reader comes thirteen minutes after its interaction is given up as busy (`startBy`; a configuration that could make that happen is warned about at start). What it read is worded by `src/render/screenshot-reading.ts`. `ctx.screenshotReader` is the `OcrService` underneath; `settings.ocr.enabled` switches all of it off.
+- Screenshots are kept by `ScreenshotStore` (`src/services/screenshot-store.ts`, `var/ocr/held/` and `var/ocr/review/`): every one read, with a record (`ScreenshotRecord`: the reading with only clock-like or short status-bar lines, the reader's own report and apart from it what the member typed, the decision, the boss list of the moment, where the time came from, the gym picked when asked, feedback; the ids of the sender and of who gave feedback, for staff and development only, never in a commit or a printout) for a day, a raid's while the raid is active and a day after (an active raid's is never deleted); one refused or asked about, or with feedback, is copied to review for `ocr.reviewDays`, at most `ocr.reviewPerDay` of a server a day; the hourly upkeep sweeps both, also stray and unreadable files after a day. A review copy is a hard link where the file system allows one, so a pair counts once. Both folders hold at most `ocr.keepMegabytes` (a start warns when `reviewPerDay` × `reviewDays` × 2 MB exceeds it): over it the oldest held screenshots without an issue (`hasIssue`: not reported unasked, a doubt, or "Something is wrong"; kept in an index built by the sweep, each read again before it goes) make room, then the oldest review copies, and when that is not enough the screenshot is read but not kept. A passive read that was refused is not kept; a picture that is no raid screen keeps its record alone, with its lines' boxes and confidences but no text. "All right" makes the record's `label` (`memberLabel`: what the reader decided by itself; the gym the member picked, or else one read clearly, by its own name), "Something is wrong" by anybody takes it away.
+- Three ways to report from a screenshot: `/raid screenshot:` (boss and gym then optional, refused by a guard when neither is there; `SimpleCommand.forConfig` leaves the option out without `ocr.enabled`), a message in a region channel that mentions the bot (`ScreenshotTrigger`, `src/commands/screenshots/mention.ts`, over `PostedMessage`, whose discord.js side is `src/discord/screenshot-message.ts`: every image of the message one after the other, each one use of the member's throttle of 20 per 15 minutes; a reader that cannot read stops the rest; reported as the author unasked only for a clear gym of the message's own region, otherwise a question with the gym menu that only the author can answer and that goes after two minutes or once answered; a raid that exists is answered with its post; what made nothing is said in one reply for the message, gone after `messageCleanupDelayError`; once every image made or joined a raid the message is deleted when it says nothing but the mention, and marked ✅ otherwise, once), and the passive reading of the same without a mention (`ocr.passive` and the Message Content intent; silent but for what it reports, and it never deletes a message: it marks it ✅). `/read-screenshot` only reads. The controls of a screenshot are the kind `shot` (`src/commands/screenshots/feedback.ts`: "All right", "Something is wrong" with its form of a menu and a paragraph, `show`, and the mention's gym question); a raid's post has "Screenshot feedback" (`party:<id>:shot`) while the raid is active. Improving the reader from the feedback is a later session's work: the skill `.claude/skills/improve-screenshot-reading/SKILL.md`, the log `docs/superpowers/ocr-improvements.md`, the baseline `docs/superpowers/ocr-baseline.json`.
+- Gyms of one region shown by the same name (`src/domain/gyms/shared-names.ts`: the nickname where there is one, compared by letters and digits alone, so "P.N.C. Park" is "PNC Park"; the search is unchanged) are listed by `/gym duplicates` (in several private messages for a long list); `/gym add`, `/gym edit` and `/gym move` warn about such a pair without refusing (`namesakeNote`).
+- The post of an egg shows the game's egg (`raidEggPicture`, `src/domain/pogo/raid-eggs.ts`, served by address from `settings.raidEggPicturesUrl`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one.
 - A new gym and a deletion are announced in the server's channel for bot updates where `settings.postNewGyms` is on, only where the bot may post embeds (`PartyGateway.findChannel`), without a ping; edits are not announced.
 
 ## Gotchas
diff --git a/docs/superpowers/ocr-improvements.md b/docs/superpowers/ocr-improvements.md
new file mode 100644
index 0000000000000000000000000000000000000000..0cc1bf239863553fb0dee5cf722376eecee878a7
--- /dev/null
+++ b/docs/superpowers/ocr-improvements.md
@@ -0,0 +1,20 @@
+# Screenshot reader: the log of improvements
+
+What was changed in the screenshot reader, why, and what it did to the scores. A session that
+improves the reader (the skill `.claude/skills/improve-screenshot-reading/SKILL.md`) reads this
+first, so that a cause is not chased twice, and appends an entry with every fix.
+
+An entry:
+
+```
+## <date>: <the failure group, in a few words>
+
+- **Seen:** how many screenshots, from which review folder, and what `ocr:review` said of them.
+- **Cause:** what in Pine's code made them go wrong.
+- **Fix:** what was changed (files, the rule or the threshold and its new value).
+- **Scores:** per element, before and after, over the research samples and each review folder
+  (`ocr:check`); samples that went from right to wrong, if any, and why that was accepted.
+```
+
+No entries yet: the reader is as plan 7A built it and plan 7B put on Discord
+(`docs/superpowers/ocr-baseline.json` holds its scores over the research samples).
diff --git a/package.json b/package.json
index c0362fabe6a1a839e01c8bfc6a5fe1aedd51d732..5c0a6c771abc1399d523e61ef522641ce6f328f0 100644
--- a/package.json
+++ b/package.json
@@ -17,6 +17,7 @@
     "fixtures:game-data": "tsx scripts/game-data/make-fixtures.ts",
     "raid-bosses:check": "tsx scripts/raid-bosses/check-feed.ts",
     "ocr:check": "tsx scripts/ocr/check.ts",
+    "ocr:review": "tsx scripts/ocr/review.ts",
     "role-auth:export": "tsx --env-file-if-exists=.env scripts/role-auth/export.ts",
     "db:codegen": "tsx scripts/codegen.ts",
     "gantt": "tsx scripts/gantt/update.ts",
diff --git a/scripts/ocr/check.ts b/scripts/ocr/check.ts
index 461c0418ec9703b343080fd63345ef80e8172264..61f9ef14ff0818a34feae812d4043c24369e88e7 100644
--- a/scripts/ocr/check.ts
+++ b/scripts/ocr/check.ts
@@ -4,23 +4,49 @@
  *
  *   npm run ocr:check -- <folder> [--device cpu|cuda|directml] [--threads <n>]
  *                                 [--priority low|normal] [--labels <file>]
+ *                                 [--baseline <file>] [--write-baseline <file>]
+ *                                 [--bosses <file>] [--write-bosses <file>]
  *
- * With labels (`labels.json` in the folder by default: per file name `clock` "h:mm" or null,
- * `countdown` "h:mm:ss", `gym` the name as shown, `egg`, `tier` 1, 3, 5, "mega" or the count of
- * heads, `shadow`, `boss`, `cp`), each element is scored right or wrong. It is how a change of
- * the reader is judged (every sample, before and after), and how a machine is measured before
- * Pine runs on it: the device and threads of the command line win over the settings.
+ * With labels, each element is scored right or wrong. Labels come from `labels.json` in the
+ * folder (or `--labels`: per file name `clock` "h:mm" or null, `countdown` "h:mm:ss", `gym` the
+ * name as shown, `egg`, `tier` 1, 3, 5, "mega" or the count of heads, `shadow`, `boss`, `cp`),
+ * and from the record beside a screenshot of a review folder (`<id>.json`, `var/ocr/review/`):
+ * its `label`, which a member's "All right" made (`source: 'member'`: only the gym, by the name
+ * of the gym decided, egg or hatched, the heads, shadow and the boss are scored, and of those only
+ * what the member did not type); a screenshot somebody said was wrong has none and is listed,
+ * not scored. It is how a change of the reader is judged (every sample, before and after), and
+ * how a machine is measured before Pine runs on it: the device and threads of the command line
+ * win over the settings.
  *
- * The files of the reader are downloaded into `var/ocr/` on first use; the raid bosses are the
- * live feed's (the boss is decided only among them). The gym is compared as text: the gym
- * search needs the database's gyms, which the bot has.
+ * `--write-baseline <file>` writes what was right and wrong per sample and element (file names
+ * and booleans only: no text read, nothing a member wrote); `--baseline <file>` compares with
+ * such a file (`compareBaseline`) and lists every sample whose element went from right to wrong
+ * or was not read, with exit status 1 when there is one.
+ *
+ * The boss is decided among a boss list: a review record's own (the bosses at its read), else
+ * `--bosses <file>` (a list written by `--write-bosses <file>` from the live feed, so that a
+ * check can be repeated later against the same list), else the live feed. The gym is compared as
+ * text: the gym search needs the database's gyms, which the bot has. Each clock is printed with
+ * the confidence of its line (`CLOCK_SURE` was chosen from these).
  */
-import { existsSync, readdirSync, readFileSync } from 'node:fs';
+import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
 import path from 'node:path';
 import { parseArgs } from 'node:util';
 import { pino } from 'pino';
 import { loadSettings } from '../../src/config/settings.js';
 import { OCR_DEVICES, type OcrDevice } from '../../src/domain/ocr/assets.js';
+import {
+  bossesOfSnapshot,
+  compareBaseline,
+  type BossSnapshot,
+  type Results,
+} from '../../src/domain/ocr/baseline.js';
+import {
+  clockText,
+  countdownText,
+  type MemberLabel,
+  type SampleLabel,
+} from '../../src/domain/ocr/screenshot-record.js';
 import { nameSimilarity, screenshotReport } from '../../src/domain/ocr/screenshot-report.js';
 import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
 import { feedLookup } from '../../src/domain/pogo/feed-lookup.js';
@@ -38,6 +64,10 @@ const { values, positionals } = parseArgs({
     threads: { type: 'string' },
     priority: { type: 'string' },
     labels: { type: 'string' },
+    baseline: { type: 'string' },
+    'write-baseline': { type: 'string' },
+    bosses: { type: 'string' },
+    'write-bosses': { type: 'string' },
   },
 });
 const folder = positionals[0];
@@ -60,36 +90,52 @@ const priority =
       : settings.ocr.priority;
 const log = pino({ level: 'warn' }, pino.destination(2));
 
-interface Label {
-  clock: string | null;
-  countdown: string | null;
-  gym: string | null;
-  egg: boolean;
-  tier: number | 'mega';
-  shadow: boolean;
-  boss: string | null;
-  cp: number | null;
-}
 const labelsFile = values.labels ?? path.join(folder, 'labels.json');
-const labels: Record<string, Label> = existsSync(labelsFile)
-  ? (JSON.parse(readFileSync(labelsFile, 'utf8')) as Record<string, Label>)
+const labels: Record<string, SampleLabel> = existsSync(labelsFile)
+  ? (JSON.parse(readFileSync(labelsFile, 'utf8')) as Record<string, SampleLabel>)
   : {};
 
-/** The bosses of the live feed, over the bot's saved game data (or none, said so). */
-async function currentBosses(): Promise<RaidBoss[]> {
+/** What is read of the record beside a screenshot of a review folder. */
+interface KeptRecord {
+  label?: MemberLabel;
+  feedback?: { verdict: string }[];
+  bosses?: BossSnapshot;
+}
+
+function recordOf(file: string): KeptRecord | undefined {
+  const record = path.join(folder ?? '', `${file.replace(/\.[^.]+$/, '')}.json`);
+  if (!existsSync(record)) return undefined;
+  try {
+    return JSON.parse(readFileSync(record, 'utf8')) as KeptRecord;
+  } catch {
+    return undefined;
+  }
+}
+
+/** The saved game data's catalogue, or undefined (said so): without it no boss is decided. */
+function savedCatalogue(): PokemonCatalogue | undefined {
   const cache = path.join(repoRoot, 'var/game-data-cache.json');
   if (!existsSync(cache)) {
     process.stdout.write(
       'No saved game data (var/game-data-cache.json): the boss is not decided.\n',
     );
-    return [];
+    return undefined;
   }
   const saved = JSON.parse(readFileSync(cache, 'utf8')) as { version?: number; data: GameData };
   if (saved.version !== GAME_DATA_VERSION) {
     process.stdout.write('The saved game data has another version: the boss is not decided.\n');
-    return [];
+    return undefined;
+  }
+  return new PokemonCatalogue(saved.data);
+}
+
+/** The bosses of `--bosses`, or of the live feed (or none, said so). */
+async function currentBosses(catalogue: PokemonCatalogue | undefined): Promise<RaidBoss[]> {
+  if (!catalogue) return [];
+  if (values.bosses) {
+    const snapshot = JSON.parse(readFileSync(values.bosses, 'utf8')) as BossSnapshot;
+    return bossesOfSnapshot(snapshot, catalogue);
   }
-  const catalogue = new PokemonCatalogue(saved.data);
   try {
     const response = await fetch(settings.raidBosses.url, { signal: AbortSignal.timeout(30_000) });
     const { bosses } = parseRaidBossFeed(await response.json(), feedLookup(catalogue));
@@ -100,7 +146,13 @@ async function currentBosses(): Promise<RaidBoss[]> {
   }
 }
 
-const bosses = await currentBosses();
+const catalogue = savedCatalogue();
+const bosses = await currentBosses(catalogue);
+if (values['write-bosses']) {
+  const snapshot = bosses.map((boss) => ({ key: boss.key, name: boss.name, tier: boss.tier }));
+  writeFileSync(values['write-bosses'], `${JSON.stringify(snapshot, null, 2)}\n`);
+  process.stdout.write(`Wrote the boss list to ${values['write-bosses']}.\n`);
+}
 const assets = new OcrAssets({
   dir: path.join(repoRoot, 'var/ocr'),
   modelsUrl: settings.ocr.modelsUrl,
@@ -118,15 +170,12 @@ const ocr = new OcrService({
   log,
 });
 
-const pad = (n: number) => String(n).padStart(2, '0');
 const files = readdirSync(folder)
   .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
   .sort();
 const right = new Map<string, [number, number]>();
-const tally = (element: string, ok: boolean) => {
-  const [good, all] = right.get(element) ?? [0, 0];
-  right.set(element, [good + (ok ? 1 : 0), all + 1]);
-};
+const results: Results = {};
+const disputed: string[] = [];
 let readMs = 0;
 let wallMs = 0;
 let summed = 0;
@@ -152,9 +201,13 @@ for (const file of files) {
   }
   first = false;
   peakMb = Math.max(peakMb, reading.peakMb);
+  const record = recordOf(file);
+  // A review record's own bosses: the list the bot decided among.
+  const bossesHere =
+    record?.bosses && catalogue ? bossesOfSnapshot(record.bosses, catalogue) : bosses;
   // Uploaded now: the time of a sample is not scored, only its clock and countdown as read.
   const report = screenshotReport(reading, {
-    bosses,
+    bosses: bossesHere,
     searchGym: () => [],
     uploadedAt: Date.now(),
     zone: settings.timezone,
@@ -165,11 +218,10 @@ for (const file of files) {
   });
   const t = reading.text;
   const shown = {
-    clock: t.clock ? `${t.clock.hour}:${pad(t.clock.minute)}` : null,
-    countdown:
-      t.countdown === null
-        ? null
-        : `${Math.floor(t.countdown / 3600)}:${pad(Math.floor(t.countdown / 60) % 60)}:${pad(t.countdown % 60)}`,
+    clock: clockText(t.clock),
+    clockConfidence:
+      t.clock?.confidence === undefined ? null : Number(t.clock.confidence.toFixed(3)),
+    countdown: countdownText(t.countdown),
     gym: t.gym,
     stage: report.stage,
     heads: report.heads,
@@ -180,13 +232,22 @@ for (const file of files) {
     purple: Number((reading.purple * 100).toFixed(2)),
     doubts: report.doubts,
   };
-  const label = labels[file];
+  const wrongVerdict = record?.feedback?.some((f) => f.verdict === 'wrong') ?? false;
+  if (wrongVerdict) disputed.push(file);
   const wrong: string[] = [];
+  const scored: Record<string, boolean> = {};
+  const check = (element: string, ok: boolean) => {
+    const [good, all] = right.get(element) ?? [0, 0];
+    right.set(element, [good + (ok ? 1 : 0), all + 1]);
+    scored[element] = ok;
+    if (!ok) wrong.push(element);
+  };
+  const bossRight = (name: string | null) =>
+    report.boss !== null &&
+    (report.boss.name.includes(name ?? '') || nameSimilarity(report.boss.name, name ?? '') >= 0.75);
+  const label = labels[file];
+  const member = !label && !wrongVerdict ? record?.label : undefined;
   if (label) {
-    const check = (element: string, ok: boolean) => {
-      tally(element, ok);
-      if (!ok) wrong.push(element);
-    };
     check('clock', shown.clock === label.clock);
     check('countdown', shown.countdown === label.countdown);
     check('gym', nameSimilarity(t.gym ?? '', label.gym ?? '') >= 0.9);
@@ -195,19 +256,27 @@ for (const file of files) {
     check('shadow', (report.tier?.shadow ?? false) === label.shadow);
     if (!label.egg) {
       check('cp', t.cp === label.cp);
-      if (bosses.length > 0) {
-        check(
-          'boss',
-          report.boss !== null &&
-            (report.boss.name.includes(label.boss ?? '') ||
-              nameSimilarity(report.boss.name, label.boss ?? '') >= 0.75),
-        );
-      }
+      if (bossesHere.length > 0) check('boss', bossRight(label.boss));
+    }
+  } else if (member) {
+    // What a member said was right: only what the reader decided, by itself.
+    if (member.gym !== undefined) check('gym', nameSimilarity(t.gym ?? '', member.gym) >= 0.9);
+    if (member.egg !== undefined) check('stage', shown.stage === (member.egg ? 'egg' : 'hatched'));
+    if (member.tier !== undefined) {
+      check('heads', report.heads === (member.tier === 'mega' ? 4 : member.tier));
+    }
+    if (member.shadow !== undefined) {
+      check('shadow', (report.tier?.shadow ?? false) === member.shadow);
     }
+    if (member.boss !== undefined && bossesHere.length > 0) check('boss', bossRight(member.boss));
   }
-  process.stdout.write(
-    `${file}  ${reading.ms} ms${label ? (wrong.length ? `  WRONG: ${wrong.join(', ')}` : '  all right') : ''}\n  ${JSON.stringify(shown)}\n`,
-  );
+  if (Object.keys(scored).length > 0) results[file] = scored;
+  const verdict = Object.keys(scored).length
+    ? wrong.length
+      ? `  WRONG: ${wrong.join(', ')}`
+      : '  all right'
+    : '';
+  process.stdout.write(`${file}  ${reading.ms} ms${verdict}\n  ${JSON.stringify(shown)}\n`);
 }
 await ocr.close();
 
@@ -218,6 +287,33 @@ if (right.size > 0) {
     `${[...right].map(([element, [good, all]]) => `${element} ${good}/${all}`).join(', ')}\n`,
   );
 }
+if (disputed.length > 0) {
+  process.stdout.write(
+    `Not scored, a member said they were read wrong (see ocr:review): ${disputed.join(', ')}\n`,
+  );
+}
 process.stdout.write(
   `${Math.round(readMs / counted)} ms a screenshot in the reading process (${Math.round(wallMs / counted)} ms with the handing over); its peak memory ${peakMb} MB.\n`,
 );
+
+if (values.baseline) {
+  const before = (JSON.parse(readFileSync(values.baseline, 'utf8')) as { samples: Results })
+    .samples;
+  const { worse, better } = compareBaseline(before, results);
+  process.stdout.write(
+    `\nAgainst ${values.baseline}: ${worse.length} from right to wrong, ${better.length} from wrong to right.\n`,
+  );
+  for (const line of worse) process.stdout.write(`  WORSE  ${line}\n`);
+  for (const line of better) process.stdout.write(`  better ${line}\n`);
+  if (worse.length > 0) process.exitCode = 1;
+}
+if (values['write-baseline']) {
+  const totals = Object.fromEntries(
+    [...right].map(([element, [good, all]]) => [element, { right: good, of: all }]),
+  );
+  writeFileSync(
+    values['write-baseline'],
+    `${JSON.stringify({ samples: results, totals }, null, 2)}\n`,
+  );
+  process.stdout.write(`Wrote the baseline to ${values['write-baseline']}.\n`);
+}
diff --git a/scripts/ocr/review.ts b/scripts/ocr/review.ts
new file mode 100644
index 0000000000000000000000000000000000000000..fb536888b13a1009ab04e4b24ab0959c59009fd3
--- /dev/null
+++ b/scripts/ocr/review.ts
@@ -0,0 +1,90 @@
+/**
+ * The triage of a review folder of the screenshot reader (a copy of production's
+ * `var/ocr/review/`):
+ *
+ *   npm run ocr:review -- <folder> [--show-text]
+ *
+ * Reads the records beside the screenshots (`<id>.json`; never the screenshots themselves) and
+ * prints how many there are, how they were decided, which doubts were raised, and per element
+ * how often members said it was wrong, by where it went wrong (`wrongAt`): the gym's text read
+ * but another gym chosen (a nickname may fix it) or no gym found, no clock or no countdown, the
+ * heads counted, a CP read and no boss decided. Gym texts corrected the same way twice or more
+ * are suggested as nicknames. What members wrote, and who they are (their ids), is printed only
+ * with `--show-text`: it stays on the machine it was copied to. The procedure around it is the skill
+ * `.claude/skills/improve-screenshot-reading/SKILL.md`.
+ */
+import { readdirSync, readFileSync } from 'node:fs';
+import path from 'node:path';
+import { parseArgs } from 'node:util';
+import { reviewSummary, type ReviewRecord } from '../../src/domain/ocr/review.js';
+
+const { values, positionals } = parseArgs({
+  allowPositionals: true,
+  options: { 'show-text': { type: 'boolean' } },
+});
+const folder = positionals[0];
+if (!folder) {
+  process.stderr.write('Usage: npm run ocr:review -- <folder> [--show-text]\n');
+  process.exit(2);
+}
+
+const records: ReviewRecord[] = [];
+let unreadable = 0;
+for (const file of readdirSync(folder)
+  .filter((name) => name.endsWith('.json'))
+  .sort()) {
+  try {
+    const record = JSON.parse(readFileSync(path.join(folder, file), 'utf8')) as ReviewRecord & {
+      v?: number;
+    };
+    if (record.v === 1 && record.report && Array.isArray(record.feedback)) records.push(record);
+    else unreadable++;
+  } catch {
+    unreadable++;
+  }
+}
+
+const summary = reviewSummary(records);
+const out = (line = '') => process.stdout.write(`${line}\n`);
+const listed = (counts: Record<string, number>) =>
+  Object.entries(counts)
+    .sort(([, a], [, b]) => b - a)
+    .map(([key, n]) => `${key} ${n}`)
+    .join(', ') || 'none';
+
+out(`${summary.records} screenshots${unreadable ? ` (${unreadable} records not read)` : ''}.`);
+out(`Read for: ${listed(summary.byUse)}.`);
+out(`Decided: ${listed(summary.byDecision)}.`);
+out(`Doubts raised: ${listed(summary.doubts)}.`);
+out(`Said all right: ${summary.right}; said wrong: ${summary.wrong}.`);
+out();
+for (const [element, counts] of Object.entries(summary.elements)) {
+  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
+  if (total === 0) continue;
+  out(`${element}: wrong ${total} times`);
+  for (const [where, n] of Object.entries(counts).sort(([, a], [, b]) => b - a)) {
+    out(`  ${n}  ${where}`);
+  }
+}
+if (summary.nicknames.length > 0) {
+  out();
+  out('Gym texts corrected the same way more than once (suggested nicknames, `/gym edit`):');
+  for (const pair of summary.nicknames) {
+    const correction = values['show-text'] ? ` -> "${pair.correction}"` : '';
+    out(`  ${pair.times}x  "${pair.read}"${correction}`);
+  }
+  if (!values['show-text']) out('  (members’ corrections are shown with --show-text)');
+}
+if (summary.corrections.length > 0) {
+  out();
+  if (values['show-text']) {
+    out('What members wrote (never to be copied out of this machine):');
+    for (const c of summary.corrections) {
+      out(`  ${c.id}  member ${c.memberId}  [${c.elements.join(', ')}]  "${c.correction}"`);
+    }
+  } else {
+    out(
+      `${summary.corrections.length} corrections by members (shown, with who, with --show-text).`,
+    );
+  }
+}
diff --git a/src/domain/ocr/baseline.test.ts b/src/domain/ocr/baseline.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cd0e339c58bd3c027464f3b8afc5a408c5425a20
--- /dev/null
+++ b/src/domain/ocr/baseline.test.ts
@@ -0,0 +1,37 @@
+import { describe, expect, it } from 'vitest';
+import { catalogueFixture } from '../../../test/support/game-data.js';
+import { bossesOfSnapshot, compareBaseline } from './baseline.js';
+
+describe('compareBaseline', () => {
+  it('lists what went from right to wrong or was not read, and what got right', () => {
+    const before = {
+      'a.png': { gym: true, clock: true, boss: false },
+      'b.png': { gym: true },
+      'c.png': { tier: false },
+    };
+    const now = {
+      'a.png': { gym: false, boss: true },
+      'c.png': { tier: false },
+      'new.png': { gym: false },
+    };
+    expect(compareBaseline(before, now)).toEqual({
+      worse: ['a.png: gym', 'a.png: clock (not read)', 'b.png: gym (not read)'],
+      better: ['a.png: boss'],
+    });
+    expect(compareBaseline(before, before)).toEqual({ worse: [], better: [] });
+  });
+});
+
+describe('bossesOfSnapshot', () => {
+  it('gives the bosses of a kept list their catalogue entries, and none to one it does not know', () => {
+    const bosses = bossesOfSnapshot(
+      [
+        { key: 'yveltal', name: 'Yveltal', tier: { level: 'T5', shadow: false } },
+        { key: '~newmon', name: 'Newmon', tier: { level: 'T3', shadow: false } },
+      ],
+      catalogueFixture(),
+    );
+    expect(bosses[0]?.entry?.key).toBe('yveltal');
+    expect(bosses[1]).toMatchObject({ key: '~newmon', name: 'Newmon', entry: undefined });
+  });
+});
diff --git a/src/domain/ocr/baseline.ts b/src/domain/ocr/baseline.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0953bca9ea86954bc9bc2e86c34df1e9b1be451e
--- /dev/null
+++ b/src/domain/ocr/baseline.ts
@@ -0,0 +1,60 @@
+import type { PokemonCatalogue } from '../pogo/catalogue.js';
+import type { RaidBoss } from '../pogo/raid-bosses.js';
+import type { RaidTier } from '../pogo/raid-tier.js';
+
+/**
+ * What `npm run ocr:check` compares and keeps: per sample (by file name) and element, right or
+ * wrong. Numbers and file names only, never what was read (the baseline is committed).
+ */
+export type Results = Record<string, Record<string, boolean>>;
+
+export interface Comparison {
+  /** `file: element` that was right in the baseline and is wrong now, or was not read now. */
+  worse: string[];
+  /** `file: element` that was wrong in the baseline and is right now. */
+  better: string[];
+}
+
+/**
+ * How `now` compares with `before`, over every sample and element of the baseline: one that was
+ * right and is wrong, or that was not scored at all now (the sample unread, the element not
+ * checked), is worse; a sample that is new is not compared.
+ */
+export function compareBaseline(before: Results, now: Results): Comparison {
+  const worse: string[] = [];
+  const better: string[] = [];
+  for (const [file, elements] of Object.entries(before)) {
+    for (const [element, was] of Object.entries(elements)) {
+      const is = now[file]?.[element];
+      if (was && is !== true)
+        worse.push(`${file}: ${element}${is === undefined ? ' (not read)' : ''}`);
+      if (!was && is === true) better.push(`${file}: ${element}`);
+    }
+  }
+  return { worse, better };
+}
+
+/** A boss list as it is kept: by key, with its name and tier (a record's `bosses`, `--write-bosses`). */
+export type BossSnapshot = readonly { key: string; name: string; tier: RaidTier }[];
+
+/**
+ * The bosses of a snapshot, for deciding a boss among them as the bot did: each with its
+ * catalogue entry when the catalogue knows its key (a boss without one is never decided by its
+ * CP, as in the bot).
+ */
+export function bossesOfSnapshot(snapshot: BossSnapshot, catalogue: PokemonCatalogue): RaidBoss[] {
+  return snapshot.map(({ key, name, tier }) => {
+    const entry = catalogue.byKey(key);
+    return {
+      key,
+      name,
+      tier,
+      entry,
+      shiny: false,
+      source: 'feed',
+      autoset: false,
+      pokemonId: entry?.pokemonId ?? key,
+      form: null,
+    };
+  });
+}
diff --git a/src/domain/ocr/review.test.ts b/src/domain/ocr/review.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..abd45c04f8bc6ad8315365ecd72887a9882d6a4a
--- /dev/null
+++ b/src/domain/ocr/review.test.ts
@@ -0,0 +1,82 @@
+import { describe, expect, it } from 'vitest';
+import { reviewSummary, type ReviewRecord } from './review.js';
+import type { FeedbackElement, FeedbackRecord, StoredReport } from './screenshot-record.js';
+
+const REPORT: StoredReport = {
+  gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
+  stage: 'hatched',
+  heads: 5,
+  tier: { level: 'T5', shadow: false },
+  tierFrom: 'boss',
+  cp: 45000,
+  bossName: 'Yveltai',
+  boss: null,
+  bossFrom: null,
+  eliteBadge: false,
+  purple: 0,
+  clock: null,
+  countdown: 1800,
+  takenAt: 0,
+  timeFrom: 'upload',
+  time: { end: 1 },
+  doubts: ['time-guessed', 'boss-unknown'],
+};
+
+const wrong = (elements: FeedbackElement[], correction: string): FeedbackRecord => ({
+  verdict: 'wrong',
+  elements,
+  correction,
+  memberId: '700000000000000003',
+  by: 'other',
+  at: 0,
+});
+
+function record(
+  id: string,
+  feedback: FeedbackRecord[],
+  report: Partial<StoredReport> = {},
+): ReviewRecord {
+  return {
+    id,
+    use: 'raid',
+    decision: { kind: 'report' },
+    report: { ...REPORT, ...report },
+    feedback,
+  };
+}
+
+describe('reviewSummary', () => {
+  it('counts what was said wrong by where it went wrong, and the doubts', () => {
+    const summary = reviewSummary([
+      record('a', [wrong(['gym', 'boss'], 'Heinz Field')]),
+      record('b', [wrong(['gym', 'time'], 'heinz field!')]),
+      record('c', [{ verdict: 'right', memberId: '700000000000000004', by: 'reporter', at: 0 }]),
+      record('d', [], {
+        gym: { read: null, searched: null, gymId: null, place: null, clear: false },
+      }),
+    ]);
+    expect(summary).toMatchObject({ records: 4, right: 1, wrong: 2, byUse: { raid: 4 } });
+    expect(summary.elements.gym).toEqual({
+      'text read, the search chose another gym (a nickname may fix it)': 2,
+    });
+    expect(summary.elements.boss).toEqual({ 'CP read, no boss decided': 1 });
+    expect(summary.elements.time).toEqual({ 'no clock (guessed from the upload)': 1 });
+    expect(summary.doubts).toEqual({ 'time-guessed': 4, 'boss-unknown': 4 });
+    // The same text corrected the same way twice: a nickname to suggest.
+    expect(summary.corrections.map((c) => c.correction)).toEqual(['Heinz Field', 'heinz field!']);
+    expect(summary.nicknames).toEqual([
+      { read: 'Heinz Plant', correction: 'Heinz Field', times: 2 },
+    ]);
+  });
+
+  it('leaves out what the member typed: the reader does not answer for it', () => {
+    const summary = reviewSummary([
+      {
+        ...record('a', [wrong(['gym', 'boss'], '')]),
+        typed: { gymId: 7 },
+      },
+    ]);
+    expect(summary.elements.gym).toEqual({});
+    expect(summary.elements.boss).toEqual({ 'CP read, no boss decided': 1 });
+  });
+});
diff --git a/src/domain/ocr/review.ts b/src/domain/ocr/review.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7854c2e72945c08c4aa5e072ca8497e062e0696e
--- /dev/null
+++ b/src/domain/ocr/review.ts
@@ -0,0 +1,146 @@
+import { nameKey } from '../gyms/shared-names.js';
+import type {
+  FeedbackElement,
+  FeedbackRecord,
+  StoredDecision,
+  StoredReport,
+  StoredTyped,
+} from './screenshot-record.js';
+
+/**
+ * The triage of a review folder (`npm run ocr:review`): what members said was wrong, per element
+ * and by the stage where it went wrong, told apart by what was read and what Pine made of it.
+ * Pure: the script reads the records and prints this.
+ */
+
+/** What the triage needs of a kept record (`ScreenshotRecord`). */
+export interface ReviewRecord {
+  id: string;
+  use: string;
+  decision: StoredDecision;
+  /** What the reader made of it by itself. */
+  report: StoredReport;
+  /** What the member typed beside it: those elements are not the reader's to answer for. */
+  typed?: StoredTyped | null;
+  feedback: readonly FeedbackRecord[];
+}
+
+/** Where an element went wrong, as far as the record tells. */
+export type WrongAt = string;
+
+export interface ReviewSummary {
+  records: number;
+  byUse: Record<string, number>;
+  byDecision: Record<string, number>;
+  /** Records with "All right" and none with "Something is wrong". */
+  right: number;
+  /** Records somebody said were wrong. */
+  wrong: number;
+  /** Per element: how often it was said wrong, by where it went wrong. */
+  elements: Record<FeedbackElement, Record<WrongAt, number>>;
+  /** How often each doubt was raised, over all records. */
+  doubts: Record<string, number>;
+  /**
+   * Gym texts read that members corrected the same way at least twice: suggested nicknames.
+   * `correction` is the member's text: shown only when asked for.
+   */
+  nicknames: { read: string; correction: string; times: number }[];
+  /** Every correction with who wrote it: shown only when asked for. */
+  corrections: { id: string; memberId: string; elements: FeedbackElement[]; correction: string }[];
+}
+
+/** The elements a member typed, which the reader does not answer for. */
+function typedElements(typed: StoredTyped | null | undefined): Set<FeedbackElement> {
+  const elements = new Set<FeedbackElement>();
+  if (typed?.gymId !== undefined) elements.add('gym');
+  if (typed?.boss) {
+    elements.add('stage');
+    elements.add('tier');
+    elements.add('boss');
+  }
+  if (typed?.time) elements.add('time');
+  return elements;
+}
+
+function add(counts: Record<string, number>, key: string): void {
+  counts[key] = (counts[key] ?? 0) + 1;
+}
+
+/** Where an element said to be wrong went wrong, by what the record shows. */
+export function wrongAt(element: FeedbackElement, report: StoredReport): WrongAt {
+  switch (element) {
+    case 'gym':
+      if (report.gym.read === null) return 'no text read';
+      if (report.gym.gymId === null) return 'text read, no gym found';
+      return report.gym.clear
+        ? 'text read, the search chose another gym (a nickname may fix it)'
+        : 'text read, the gym was not clear';
+    case 'time':
+      if (report.countdown === null) return 'no countdown';
+      if (report.clock === null) return 'no clock (guessed from the upload)';
+      return 'clock and countdown read';
+    case 'stage':
+      return report.stage === null ? 'not told' : `read as ${report.stage}`;
+    case 'tier':
+      return report.heads === null ? 'no heads' : `${report.heads} heads`;
+    case 'boss':
+      if (report.cp === null) return 'no CP';
+      return report.boss === null ? 'CP read, no boss decided' : 'CP read, a boss decided';
+  }
+}
+
+export function reviewSummary(records: readonly ReviewRecord[]): ReviewSummary {
+  const summary: ReviewSummary = {
+    records: records.length,
+    byUse: {},
+    byDecision: {},
+    right: 0,
+    wrong: 0,
+    elements: { gym: {}, time: {}, stage: {}, tier: {}, boss: {} },
+    doubts: {},
+    nicknames: [],
+    corrections: [],
+  };
+  const corrected = new Map<string, { read: string; correction: string; times: number }>();
+  for (const record of records) {
+    add(summary.byUse, record.use);
+    add(summary.byDecision, record.decision.kind);
+    for (const doubt of record.report.doubts) add(summary.doubts, doubt);
+    const wrongs = record.feedback.filter((f) => f.verdict === 'wrong');
+    if (wrongs.length === 0) {
+      if (record.feedback.length > 0) summary.right++;
+      continue;
+    }
+    summary.wrong++;
+    const typed = typedElements(record.typed);
+    const elements = new Set(
+      wrongs
+        .flatMap((f) => (f.verdict === 'wrong' ? f.elements : []))
+        .filter((element) => !typed.has(element)),
+    );
+    for (const element of elements) add(summary.elements[element], wrongAt(element, record.report));
+    for (const f of wrongs) {
+      if (f.verdict === 'wrong' && f.correction.trim() !== '') {
+        summary.corrections.push({
+          id: record.id,
+          memberId: f.memberId,
+          elements: f.elements,
+          correction: f.correction.trim(),
+        });
+      }
+    }
+    const read = record.report.gym.read;
+    if (read === null || !elements.has('gym')) continue;
+    for (const f of wrongs) {
+      if (f.verdict !== 'wrong' || f.correction.trim() === '') continue;
+      const key = `${nameKey(read)}\n${nameKey(f.correction)}`;
+      const seen = corrected.get(key) ?? { read, correction: f.correction.trim(), times: 0 };
+      seen.times++;
+      corrected.set(key, seen);
+    }
+  }
+  summary.nicknames = [...corrected.values()]
+    .filter((pair) => pair.times >= 2)
+    .sort((a, b) => b.times - a.times);
+  return summary;
+}
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-7b HEAD -- src test scripts docs .claude package.json CLAUDE.md` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other. The test files with timers or waits (`src/commands/screenshots/*.test.ts`, `src/commands/raids/raid-screenshot.test.ts`, `src/services/screenshot-service.test.ts`, `src/services/screenshot-store.test.ts`, `src/services/ocr-service.test.ts`, `src/commands/gyms/duplicates.test.ts`) ten times in a row.
2. The Linux-only test of the reading process's thread priority (`src/services/ocr-service.test.ts`, skipped on Windows), once, in a `node:24-slim` container with a Linux install of the dependencies.
3. `npm run ocr:check -- var/ocr-research/samples-cropped --labels var/ocr-research/labels.json --write-baseline docs/superpowers/ocr-baseline.json --write-bosses docs/superpowers/ocr-baseline-bosses.json` on this laptop: the scores of the prototype (clock, countdown, stage, heads, shadow 28/28, CP 9/9, gym text 25/28); the baseline and its boss snapshot are committed (file names and right/wrong only).
4. Whole-branch review (Opus, high effort); one fix wave if it finds something.
5. `CLAUDE.md` status line, the follow-ups ("From Phase 7B": what only staging shows, the existing raid without a time that a later screenshot could fill, showing the screenshot in the post publicly as an option, the same-name list's paging), the Gantt chart and memory.

## Staging checklist (each step with Matt's go-ahead; both accounts where it says so)

Before: `npm run deploy-commands -- --global` (the `/raid` options changed; `/read-screenshot` and `/gym duplicates` are new); no migration; the models are already in `var/ocr/` (the first start checks them). The bot needs Manage Messages in `#test-region` to delete a reported message (or the step shows that it is left alone).

- [ ] `/read-screenshot` with the shadow Kirlia screenshot in `#test-region`: the private answer shows the clock, the countdown, egg or hatched, three heads, Shadow T3, CP 8554 and Kirlia decided by its CP; its gym is probably unknown (`no gym` or unclear). "All right" thanks; "Something is wrong" opens the form with the menu and the text box (the Label with a select must render), and its answer thanks.
- [ ] `/raid screenshot:` with a sample of a gym Pine knows (one of the research's, posted from Matt's own files): the raid is reported unasked, the answer has "Screenshot feedback"; the post has the grey "Screenshot feedback" button on its own row; pressing it (the second account) shows the screenshot privately, with what was read and the two buttons.
- [ ] A screenshot whose time cannot be read (one cropped above the status bar): the post says the time is a guess; `/hatch` (or "Set time") removes that line; `/duration` does not.
- [ ] `/raid screenshot:` with `gym:` typed for a gym with several hits: the gym question with a menu that names nicknames and regions.
- [ ] A message in `#test-region` that mentions the bot with two screenshots: 🤔 while reading, two raids (or one and a gym question that only Matt's account can answer, and that disappears after two minutes unanswered), the message deleted once both made a raid; with words beside the mention it stays and gets ✅.
- [ ] The same screenshot again (the raid exists): the answer links to the post.
- [ ] A message that mentions the bot with an ordinary picture: one short reply that it is no raid screen, deleted after a while; nothing kept of it but its record.
- [ ] An egg post shows the game's egg picture (T5, mega); a T5 egg while every current T5 boss is an ultra beast shows the wormhole (only if the feed has such a week).
- [ ] `/gym duplicates` (staff) lists the test server's gyms that share a shown name, or says there are none; `/gym edit` giving a gym the name of another of its region warns and still saves.
- [ ] `var/ocr/held/` and `var/ocr/review/` hold what the steps above say (records with ids, no member names), and the log has no text read off a screenshot.
- [ ] Passive reading only if Matt wants to see it: `ocr.passive` on, the Message Content intent on the dev application, a screenshot without a mention makes a raid, an ordinary picture draws no answer.
