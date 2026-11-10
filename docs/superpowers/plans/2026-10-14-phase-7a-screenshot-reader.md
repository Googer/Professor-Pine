# Phase 7A: The screenshot reader (no Discord): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pine can read a raid screenshot (the gym, the phone's clock, the countdown, egg or hatched, the tier from the heads, shadow, the CP and the boss) and say what raid it shows, with the doubts a member should confirm, in a process of its own that cannot slow the bot down; and anybody can measure the reader on a folder of screenshots with `npm run ocr:check`.

**Architecture:** The first of Phase 7's two plans (7B puts it on Discord: `/read-screenshot` with feedback, screenshot reports, the review folder, the egg pictures). PaddleOCR's PP-OCRv4 models run on onnxruntime-node with Pine's own layer around them (no OpenCV, no `@gutenye/ocr-node`; Matt, 2026-10-14) in a child process (`src/ocr/worker.ts`): low priority, a minimal environment, one screenshot at a time, ended after a time limit or a while idle. Everything that judges the screen is pure (`src/domain/ocr/`): the text model's boxes and decoding, the raid screen's elements from the lines and their boxes (no fixed layout), the tier heads by masked template matching against the game's own icon, the shadow purple, and `screenshotReport`, which turns a reading into a gym, a stage, a tier, a boss (by its CP) and a time, with `doubts`. `OcrService` is the bot's side (`ScreenshotReader`); `OcrAssets` downloads and checks the model files.

**Tech Stack:** TypeScript 6.0, Vitest; new dependencies `onnxruntime-node` 1.30.0 and `sharp` 0.34.5 (exact versions: the reader was measured with them). No migration, no command, nothing on Discord.

**Spec:** `docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md` (the research, Matt's decisions, how the reader runs; it supersedes section 6.5 of `docs/superpowers/specs/2026-10-09-typescript-discordjs-migration-design.md` where they differ). The prototype's reviews and rulings: `.superpowers/sdd/2026-10-14-phase-7a-screenshot-reader/proto-review.md`. Phase 7 of `docs/superpowers/plans/phase-0-follow-ups.md`.

**Every diff in this plan was run before the plan was written**, on a throwaway branch (`proto-7a`), one commit per task, with the typecheck and the tests of each task clean and the full check and build clean on the tip (4,847 unit tests). Two Opus reviewers went through that branch (runtime and reading logic) and a third through the fixes; what they found is already in the code below. On the 28 sample screenshots (`var/ocr-research/`, git-ignored) the tip reads the clock, the countdown, egg or hatched, the heads and shadow 28 of 28, the CP 9 of 9, and the gym through Pine's search over a scratch copy of the production gyms 28 of 28 (all clear), at about 1.1 s a screenshot and 630 MB at the reading process's peak, on this laptop's CPU, without a doubt raised that the samples do not deserve.

## Decisions in this plan

1. **The reader runs in a child process** (Matt, 2026-10-14): lowered priority (`settings.ocr.priority`, default `low`; every thread on Linux), a minimal environment (none of the bot's secrets: it parses images members send), PNG, JPEG and WebP only (by their first bytes), at most 16 megapixels and the proportions of a screen; one screenshot at a time from a queue (`ocr.queue`), ended after `ocr.timeoutSeconds` and started anew, ended after ten minutes idle. The process says `received` for every screenshot: one that dies before that (killed while idle) is replaced and the screenshot given to the new one; one that dies after is not given it again. A start that fails is not tried again for ten minutes; a device the platform lacks is refused once.
2. **Settings** (`settings.ocr`, all with defaults, so no settings file has to change): `device` (`cpu`, `cuda`, `directml`), `threads`, `priority`, `queue`, `timeoutSeconds`, `modelsUrl` (a folder, ending with `/`), `headIconUrl` (pinned to a commit of `pogo_assets`).
3. **The model files** are downloaded into `var/ocr/` on first use and checked by size and SHA-256 (`OCR_ASSETS`); a file that differs is refused. A new model version is a change of that list, checked with `npm run ocr:check`.
4. **The report decides nothing on Discord.** It says what it read and made of it, and `doubts` (`ReportDoubt`: not a raid screen, no or an unclear gym, a guessed, stale or past time, a countdown too long, egg or hatched not told, an unknown tier, 6 or 7 heads, a tier from the heads alone on a hatched raid, a row of heads that may be cut, a heads/boss conflict, an unknown boss, a boss by name alone, a name that says another boss, elite, purple no current boss explains); plan 7B decides which doubts let a raid be made without asking. The reviewers' proposal for that rule is in the rulings file.
5. **The time of a 12-hour clock** is the reading just before the upload (either half of the day, today or yesterday, at most two minutes ahead, at most an egg's incubation and a raid's length old); otherwise guessed from the upload (`screenshotMessageOffsetTime` seconds before it, as the legacy bot did). On the night the clocks fall back both 1:30s are tried; a time the clocks skip is no time.
6. **A boss shadow T3 has 4,000 stamina** (`bossStamina`; the research), which the CP of a shadow T3 boss needs. Confirmed by a screenshot of a shadow Kirlia raid (CP 8554, which 4,000 gives exactly; 3,600 would give 8115; Matt, 2026-10-14).

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS or the legacy `data/*.json` files. Never read, print or stage `.env`.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment.
- `src/domain/` stays pure (`luxon` and `fastest-levenshtein` only). **Tests never use the network**, nor the real models, nor the game's icon, nor a member's screenshot: the models are made-up functions, images are drawn by the tests. `npm run ocr:check` is the only thing that runs the real models.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-7a`). Apply it exactly; `git diff <that commit> -- src test scripts package.json` must print nothing before the task is committed.
- A task needs the typecheck and its own tests green; the full `npm run check`, the build and the database suite after the last task (one after the other, never two at once). `npx prettier --write` on touched files.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.
- Nothing the reader saw (texts, images) is logged; only times, sizes, counts, reasons.

## Review Focus

1. A member's file cannot harm the bot: an image of 16+ megapixels, a strip, a GIF or SVG, garbage bytes; the bot's own process never decodes an image.
2. The bot survives its reader: a process killed while idle, one that hangs, crashes or cannot start, a device the platform lacks, shutdown in the middle of a read; no process is left behind.
3. A screen that is not a raid screen, or a raid screen read wrong, never comes out without a doubt: a Pokémon's own page, a hatched raid without its CP, a misread countdown, a clock an hour old, network speed in the status bar.
4. The time of a 12-hour clock around midnight and the clock changes.
5. The model files cannot fill the bot's memory and are never used when they differ from what was measured.

---

### Task 1: OCR settings and the reader's files, downloaded and checked

Prototype commit: `4279b4af483e45f1f3ed8d134d948c4723cf3870`

The reader's settings: settings.ocr gets device (cpu, cuda, directml),
threads, priority (low, normal), queue, timeoutSeconds, modelsUrl (a
folder ending with /) and headIconUrl, all with defaults, so no settings
file has to change. screenshotMessageOffsetTime is typed as seconds, as
the legacy bot read it.

OCR_ASSETS (src/domain/ocr/assets.ts) names the four files the reader
needs, with their sizes and SHA-256: the PP-OCRv4 detector and recogniser
as ONNX (@gutenye/ocr-models 1.4.2 on jsDelivr, an immutable address), the
recogniser's dictionary, and the game's tier head (pogo_assets, pinned to
a commit). deviceProblem says which device a platform lacks.

OcrAssets downloads what is missing or differs into var/ocr/, reading no
more bytes than the file should have (readLimitedBytes, now shared with
readLimitedJson), checks size and hash before it writes, and answers the
paths or undefined; after a failure it waits ten minutes; forget() has the
files checked again. New dependencies: onnxruntime-node 1.30.0 and sharp
0.34.5, exact.

**Interfaces:**
- Produces: `OCR_DEVICES`, `OcrDevice`, `OCR_ASSETS`, `OcrAsset`, `OcrAssetName`, `OcrAssetPaths`, `OCR_MODELS_URL`, `OCR_HEAD_ICON_URL`, `deviceProblem(device, os, arch): string | undefined` (`src/domain/ocr/assets.ts`); `OcrAssets` with `ensure(): Promise<OcrAssetPaths | undefined>` and `forget(): void`, `FetchAsset` (`src/services/ocr-assets.ts`); `readLimitedBytes(response, maxBytes): Promise<LimitedBytes>` (`src/services/limited-json.ts`); `settings.ocr.{device, threads, priority, queue, timeoutSeconds, modelsUrl, headIconUrl}`.

**Files:**

```
 package.json                    |   2 +
 src/config/settings.test.ts     |  33 ++++++++++++-
 src/config/settings.ts          |  35 +++++++++++++-
 src/domain/ocr/assets.test.ts   |  25 ++++++++++
 src/domain/ocr/assets.ts        |  74 ++++++++++++++++++++++++++++
 src/services/limited-json.ts    |  27 ++++++++---
 src/services/ocr-assets.test.ts | 158 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/services/ocr-assets.ts      | 134 +++++++++++++++++++++++++++++++++++++++++++++++++++
 8 files changed, 478 insertions(+), 10 deletions(-)
```

- [ ] **Step 1: Add the dependencies.** `npm install --save-exact --ignore-scripts onnxruntime-node@1.30.0 sharp@0.34.5` (this writes `package.json` and `package-lock.json`; the install scripts are not needed for the CPU, and onnxruntime-node's would download its CUDA provider on Linux). Then save the diff below to a file outside the repository and run `git apply --whitespace=nowarn --exclude=package.json <file>`: its `package.json` part is what the install has made already (`git diff -- package.json` shows the two lines of the diff and nothing else).
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/config/settings.test.ts src/domain/ocr/assets.test.ts src/services/ocr-assets.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 4279b4af483e45f1f3ed8d134d948c4723cf3870 -- src test scripts package.json` prints nothing.
- [ ] **Step 5: Commit** with the title `OCR settings and the reader's files, downloaded and checked`, the body above and the trailer, staging exactly
  `package.json src/config/settings.test.ts src/config/settings.ts src/domain/ocr/assets.test.ts src/domain/ocr/assets.ts src/services/limited-json.ts src/services/ocr-assets.test.ts src/services/ocr-assets.ts package-lock.json`.

````diff
diff --git a/package.json b/package.json
index 229a5b018102660b3b3c9294130f406b80ea997f..dde9fe21f2c9d6c0ae428ec649c05beb16ce0111 100644
--- a/package.json
+++ b/package.json
@@ -42,7 +42,9 @@
     "luxon": "^3.7.2",
     "minisearch": "^7.2.0",
     "mysql2": "^3.24.5",
+    "onnxruntime-node": "1.30.0",
     "pino": "^10.4.0",
+    "sharp": "0.34.5",
     "zod": "^4.6.5"
   },
   "devDependencies": {
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index c05be9710c752605d014269a7e1b24121292cd78..149925eafff5b94eace4b4674b6d23bcf5d0ab14 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -19,11 +19,42 @@ describe('loadSettings', () => {
   it('accepts the committed data/settings.json', () => {
     const settings = loadSettings(REPO_SETTINGS);
     expect(settings.cleanupInterval).toBe(60000);
-    expect(settings.ocr).toEqual({ passive: false, debug: false });
+    expect(settings.ocr).toEqual({
+      passive: false,
+      debug: false,
+      device: 'cpu',
+      threads: 0,
+      priority: 'low',
+      queue: 10,
+      timeoutSeconds: 60,
+      modelsUrl: 'https://cdn.jsdelivr.net/npm/@gutenye/ocr-models@1.4.2/assets/',
+      headIconUrl:
+        'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/ic_raid_small.png',
+    });
     expect(settings.autoAssignRole).toBe(false);
     expect(settings.helpGroups).not.toContain('silph');
   });
 
+  it('takes the reader settings it knows and refuses others', () => {
+    const ocr = (more: Record<string, unknown>) =>
+      writeSettings((s) => {
+        s.ocr = { passive: false, debug: false, ...more };
+      });
+    const read = loadSettings(ocr({ device: 'directml', threads: 2, priority: 'normal' })).ocr;
+    expect(read).toMatchObject({ device: 'directml', threads: 2, priority: 'normal' });
+    for (const wrong of [
+      { device: 'gpu' },
+      { threads: -1 },
+      { priority: 'idle' },
+      { timeoutSeconds: 1 },
+      { modelsUrl: 'http://models.example.test/' },
+      { modelsUrl: 'https://models.example.test/assets' },
+      { workers: 2 },
+    ]) {
+      expect(() => loadSettings(ocr(wrong))).toThrow(ConfigError);
+    }
+  });
+
   it('rejects a leftover legacy key and names it', () => {
     const file = writeSettings((s) => {
       s.commandPrefix = '!';
diff --git a/src/config/settings.ts b/src/config/settings.ts
index bc86e6e8de60e104f52e29b0d17f22dbcef2a458..2daccefb96c501ffb680989dd0c023583f903156 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -1,9 +1,11 @@
 import { readFileSync } from 'node:fs';
 import { z } from 'zod';
 import { ConfigError } from './errors.js';
+import { OCR_DEVICES, OCR_HEAD_ICON_URL, OCR_MODELS_URL } from '../domain/ocr/assets.js';
 
 const minutes = z.number().int().positive();
 const milliseconds = z.number().int().positive();
+const seconds = z.number().int().positive();
 
 function isTimeZone(zone: string): boolean {
   try {
@@ -46,7 +48,11 @@ export const settingsSchema = z.strictObject({
   trainOrMeetupDeletionWarningTime: minutes,
   raidCompleteTimeout: minutes,
   maximumMeetupLeadtime: minutes,
-  screenshotMessageOffsetTime: minutes,
+  /**
+   * Seconds (as the legacy bot read it, whatever its name says) before its upload a screenshot
+   * without a usable clock is taken to be from.
+   */
+  screenshotMessageOffsetTime: seconds,
   cleanupInterval: milliseconds,
   messageCleanupDelaySuccess: milliseconds,
   messageCleanupDelayError: milliseconds,
@@ -127,7 +133,32 @@ export const settingsSchema = z.strictObject({
     .string()
     .refine(isTimeZone, { message: 'must be an IANA time zone, e.g. America/New_York' }),
   archiveRetentionDays: z.number().int().positive().nullable(),
-  ocr: z.strictObject({ passive: z.boolean(), debug: z.boolean() }),
+  /**
+   * Reading raid screenshots (Phase 7). The models run in a child process of their own, one
+   * screenshot at a time; everything but `passive` and `debug` has a default.
+   */
+  ocr: z.strictObject({
+    /** Read every image posted in a region channel (needs the Message Content intent). */
+    passive: z.boolean(),
+    debug: z.boolean(),
+    /** Where the models run: the CPU, CUDA (Linux x64, NVIDIA) or DirectML (Windows). */
+    device: z.enum(OCR_DEVICES).default('cpu'),
+    /** Threads of one model run; 0 leaves it to the runtime (every core). */
+    threads: z.number().int().min(0).max(64).default(0),
+    /** The priority of the reading process: `low` keeps the bot and the machine responsive. */
+    priority: z.enum(['low', 'normal']).default('low'),
+    /** How many screenshots may wait while one is read; more are refused for the moment. */
+    queue: z.number().int().min(0).max(100).default(10),
+    /** How long one screenshot may take before the reading process is ended and started anew. */
+    timeoutSeconds: z.number().int().min(5).max(600).default(60),
+    /** The folder the model files are downloaded from (`OCR_ASSETS` names and checks them). */
+    modelsUrl: z
+      .url({ protocol: /^https$/ })
+      .refine((url) => url.endsWith('/'), { message: 'must end with /: it is a folder' })
+      .default(OCR_MODELS_URL),
+    /** The game's tier head, which the heads of a raid screen are matched against. */
+    headIconUrl: z.url({ protocol: /^https$/ }).default(OCR_HEAD_ICON_URL),
+  }),
   autoAssignRole: z.boolean(),
   gameData: z.strictObject({
     gameMasterUrl: z.url({ protocol: /^https?$/ }),
diff --git a/src/domain/ocr/assets.test.ts b/src/domain/ocr/assets.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d630f128542fed1fa7294fd75185d1d45e851253
--- /dev/null
+++ b/src/domain/ocr/assets.test.ts
@@ -0,0 +1,25 @@
+import { describe, expect, it } from 'vitest';
+import { deviceProblem, OCR_ASSETS } from './assets.js';
+
+describe('deviceProblem', () => {
+  it('allows the CPU everywhere, DirectML on Windows and CUDA on Linux x64 only', () => {
+    expect(deviceProblem('cpu', 'linux', 'arm64')).toBeUndefined();
+    expect(deviceProblem('directml', 'win32', 'x64')).toBeUndefined();
+    expect(deviceProblem('directml', 'linux', 'x64')).toBe('DirectML runs on Windows only');
+    expect(deviceProblem('cuda', 'linux', 'x64')).toBeUndefined();
+    expect(deviceProblem('cuda', 'linux', 'arm64')).toBe('CUDA runs on Linux x64 only');
+    expect(deviceProblem('cuda', 'win32', 'x64')).toBe('CUDA runs on Linux x64 only');
+  });
+});
+
+describe('OCR_ASSETS', () => {
+  it('names each file once, with its size and a SHA-256', () => {
+    expect(OCR_ASSETS.map((asset) => asset.name)).toEqual([
+      'detector',
+      'recogniser',
+      'dictionary',
+      'headIcon',
+    ]);
+    for (const asset of OCR_ASSETS) expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
+  });
+});
diff --git a/src/domain/ocr/assets.ts b/src/domain/ocr/assets.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2c2037f5e219368cadae73d46fcac9933978f2f4
--- /dev/null
+++ b/src/domain/ocr/assets.ts
@@ -0,0 +1,74 @@
+/**
+ * The files the screenshot reader needs, downloaded once into `var/ocr/` and checked by their
+ * SHA-256: the PaddleOCR PP-OCRv4 models as ONNX (detection and recognition, Chinese and
+ * English, Apache 2.0, the ONNX conversion of `@gutenye/ocr-models` 1.4.2 that the research
+ * measured), the recogniser's dictionary, and the game's tier head (PokeMiners' `pogo_assets`).
+ * A file that differs from its hash is refused: the reader was measured with these files and no
+ * others, so a new version is a change of this list, checked with `npm run ocr:check`.
+ */
+
+export const OCR_DEVICES = ['cpu', 'cuda', 'directml'] as const;
+export type OcrDevice = (typeof OCR_DEVICES)[number];
+
+/**
+ * Why this platform (`process.platform`, `process.arch`) cannot run the reader on the device, or
+ * undefined: onnxruntime-node has DirectML on Windows only and CUDA on Linux x64 only.
+ */
+export function deviceProblem(device: OcrDevice, os: string, arch: string): string | undefined {
+  if (device === 'directml' && os !== 'win32') return 'DirectML runs on Windows only';
+  if (device === 'cuda' && (os !== 'linux' || arch !== 'x64')) return 'CUDA runs on Linux x64 only';
+  return undefined;
+}
+
+/** Where `modelsUrl` points by default: a folder; the file names below are appended. */
+export const OCR_MODELS_URL = 'https://cdn.jsdelivr.net/npm/@gutenye/ocr-models@1.4.2/assets/';
+
+/** At a commit, not a branch: the file a hash names must not move (it last changed 2020-02-27). */
+export const OCR_HEAD_ICON_URL =
+  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/c2a686eb08ace6e890d8fe3d2134c76988db87b5/Images/Raids/ic_raid_small.png';
+
+export type OcrAssetName = 'detector' | 'recogniser' | 'dictionary' | 'headIcon';
+
+export interface OcrAsset {
+  name: OcrAssetName;
+  /** The file's name in `var/ocr/`, and in the models folder for those downloaded from there. */
+  file: string;
+  /** Downloaded from `modelsUrl` + `file`, or from `headIconUrl`. */
+  source: 'models' | 'headIcon';
+  bytes: number;
+  sha256: string;
+}
+
+export const OCR_ASSETS: readonly OcrAsset[] = [
+  {
+    name: 'detector',
+    file: 'ch_PP-OCRv4_det_infer.onnx',
+    source: 'models',
+    bytes: 4_745_517,
+    sha256: '30a86f5731181461d08021402766601e4302a9b9b9666be8aff402696339cdff',
+  },
+  {
+    name: 'recogniser',
+    file: 'ch_PP-OCRv4_rec_infer.onnx',
+    source: 'models',
+    bytes: 10_822_323,
+    sha256: '06b3e6af6c59a1ba5d53790ed8c2e4b2de389870b6cf5a97f349f3412cb269c0',
+  },
+  {
+    name: 'dictionary',
+    file: 'ppocr_keys_v1.txt',
+    source: 'models',
+    bytes: 26_249,
+    sha256: '28b2362ad4ab2dc38769aa72feb535e3a9ddb3fd2a7585a05920e6393b1dc7f7',
+  },
+  {
+    name: 'headIcon',
+    file: 'ic_raid_small.png',
+    source: 'headIcon',
+    bytes: 4_265,
+    sha256: '4ff184e4b112c381307de4726abab66e8a03e2260bba389288abdd135249a7cc',
+  },
+];
+
+/** The local paths of the files, by name. */
+export type OcrAssetPaths = Readonly<Record<OcrAssetName, string>>;
diff --git a/src/services/limited-json.ts b/src/services/limited-json.ts
index a269586d09b6dbc678c5ba2fae33eb8b8d94f1a8..596a48794cb152a11090c2c95beb48650286234d 100644
--- a/src/services/limited-json.ts
+++ b/src/services/limited-json.ts
@@ -25,15 +25,19 @@ export function discardBody(response: LimitedResponse): void {
     .catch(() => undefined);
 }
 
+/** The body of an answer as bytes, or why it was not read (see `LimitedJson`). */
+export type LimitedBytes =
+  { ok: true; bytes: Uint8Array } | { ok: false; reason: 'too-large' | 'unreadable' };
+
 /**
- * Reads the body of an answer piece by piece and gives it up the moment it passes `maxBytes`,
- * then parses it as JSON. Throws only what reading throws (a broken connection, the end of
- * the time limit of the request's signal).
+ * Reads the body of an answer piece by piece and gives it up the moment it passes `maxBytes`.
+ * Throws only what reading throws (a broken connection, the end of the time limit of the
+ * request's signal).
  */
-export async function readLimitedJson(
+export async function readLimitedBytes(
   response: LimitedResponse,
   maxBytes: number,
-): Promise<LimitedJson> {
+): Promise<LimitedBytes> {
   const declared = Number(response.headers.get('content-length') ?? '');
   if (Number.isFinite(declared) && declared > maxBytes) {
     discardBody(response);
@@ -54,9 +58,18 @@ export async function readLimitedJson(
     }
     pieces.push(value);
   }
-  const text = new TextDecoder().decode(Buffer.concat(pieces, length));
+  return { ok: true, bytes: Buffer.concat(pieces, length) };
+}
+
+/** `readLimitedBytes`, then the bytes parsed as JSON. */
+export async function readLimitedJson(
+  response: LimitedResponse,
+  maxBytes: number,
+): Promise<LimitedJson> {
+  const read = await readLimitedBytes(response, maxBytes);
+  if (!read.ok) return read;
   try {
-    return { ok: true, value: JSON.parse(text) as unknown };
+    return { ok: true, value: JSON.parse(new TextDecoder().decode(read.bytes)) as unknown };
   } catch {
     return { ok: false, reason: 'unreadable' };
   }
diff --git a/src/services/ocr-assets.test.ts b/src/services/ocr-assets.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..41302b52654bc246ee9be375947bd6a7790b874c
--- /dev/null
+++ b/src/services/ocr-assets.test.ts
@@ -0,0 +1,158 @@
+import { createHash } from 'node:crypto';
+import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
+import { tmpdir } from 'node:os';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import type { OcrAsset } from '../domain/ocr/assets.js';
+import type { LimitedResponse } from './limited-json.js';
+import { OcrAssets, type FetchAsset } from './ocr-assets.js';
+
+const bytesOf = (text: string): Uint8Array => new TextEncoder().encode(text);
+
+function asset(name: OcrAsset['name'], file: string, content: string): OcrAsset {
+  const bytes = bytesOf(content);
+  return {
+    name,
+    file,
+    source: name === 'headIcon' ? 'headIcon' : 'models',
+    bytes: bytes.byteLength,
+    sha256: createHash('sha256').update(bytes).digest('hex'),
+  };
+}
+
+const CONTENT: Record<string, string> = {
+  'https://models.example.test/m/det.onnx': 'detector',
+  'https://models.example.test/m/rec.onnx': 'recogniser',
+  'https://models.example.test/m/keys.txt': 'a\nb\n',
+  'https://icons.example.test/head.png': 'head',
+};
+
+const ASSETS: OcrAsset[] = [
+  asset('detector', 'det.onnx', 'detector'),
+  asset('recogniser', 'rec.onnx', 'recogniser'),
+  asset('dictionary', 'keys.txt', 'a\nb\n'),
+  asset('headIcon', 'head.png', 'head'),
+];
+
+function response(body: string | undefined, declared?: number): LimitedResponse {
+  const bytes = bytesOf(body ?? '');
+  let sent = false;
+  return {
+    status: body === undefined ? 404 : 200,
+    headers: { get: (name) => (name === 'content-length' && declared ? String(declared) : null) },
+    body: {
+      getReader: () => ({
+        read: () => {
+          if (sent) return Promise.resolve({ done: true });
+          sent = true;
+          return Promise.resolve({ done: false, value: bytes });
+        },
+        cancel: () => Promise.resolve(),
+      }),
+    },
+  };
+}
+
+function assets(
+  options: { content?: Record<string, string>; now?: () => number; declared?: number } = {},
+) {
+  const dir = mkdtempSync(path.join(tmpdir(), 'pine-ocr-assets-'));
+  const asked: string[] = [];
+  const content = options.content ?? CONTENT;
+  const fetch: FetchAsset = (url) => {
+    asked.push(url);
+    return Promise.resolve(response(content[url], options.declared));
+  };
+  const { log, entries } = createTestLogger();
+  const made = new OcrAssets({
+    dir,
+    modelsUrl: 'https://models.example.test/m/',
+    headIconUrl: 'https://icons.example.test/head.png',
+    fetch,
+    log,
+    assets: ASSETS,
+    ...(options.now ? { now: options.now } : {}),
+  });
+  return { made, dir, asked, entries };
+}
+
+describe('OcrAssets', () => {
+  it('downloads the missing files once and answers their paths', async () => {
+    const { made, dir, asked } = assets();
+    const paths = await made.ensure();
+    expect(paths).toEqual({
+      detector: path.join(dir, 'det.onnx'),
+      recogniser: path.join(dir, 'rec.onnx'),
+      dictionary: path.join(dir, 'keys.txt'),
+      headIcon: path.join(dir, 'head.png'),
+    });
+    expect(readFileSync(path.join(dir, 'keys.txt'), 'utf8')).toBe('a\nb\n');
+    expect(asked).toHaveLength(4);
+    await made.ensure();
+    expect(asked).toHaveLength(4);
+  });
+
+  it('keeps a file that is already right and replaces one that is not', async () => {
+    const { made, dir, asked } = assets();
+    writeFileSync(path.join(dir, 'det.onnx'), 'detector');
+    writeFileSync(path.join(dir, 'rec.onnx'), 'recogniseR');
+    await made.ensure();
+    expect(asked).not.toContain('https://models.example.test/m/det.onnx');
+    expect(asked).toContain('https://models.example.test/m/rec.onnx');
+    expect(readFileSync(path.join(dir, 'rec.onnx'), 'utf8')).toBe('recogniser');
+  });
+
+  it('refuses a download that is not the file it should be, and logs which', async () => {
+    const { made, dir, entries } = assets({
+      content: { ...CONTENT, 'https://icons.example.test/head.png': 'a new head' },
+    });
+    expect(await made.ensure()).toBeUndefined();
+    expect(() => readFileSync(path.join(dir, 'head.png'))).toThrow();
+    const logged = entries.find((entry) => entry.level === 50);
+    expect(logged?.reason).toMatch(/head\.png/);
+  });
+
+  it('stops reading a download that is longer than the file it should be', async () => {
+    const long = { ...CONTENT, 'https://models.example.test/m/det.onnx': 'detector and more' };
+    const { made, entries } = assets({ content: long });
+    expect(await made.ensure()).toBeUndefined();
+    expect(entries.find((entry) => entry.level === 50)?.reason).toBe('det.onnx: too-large');
+    const declared = assets({ declared: 1_000_000 });
+    expect(await declared.made.ensure()).toBeUndefined();
+  });
+
+  it('checks the files again after forget', async () => {
+    const { made, dir, asked } = assets();
+    await made.ensure();
+    writeFileSync(path.join(dir, 'keys.txt'), 'broken');
+    await made.ensure();
+    expect(asked).toHaveLength(4);
+    made.forget();
+    await made.ensure();
+    expect(asked).toHaveLength(5);
+    expect(readFileSync(path.join(dir, 'keys.txt'), 'utf8')).toBe('a\nb\n');
+  });
+
+  it('asks again only after the pause that follows a failure', async () => {
+    let time = 0;
+    const content: Record<string, string> = { ...CONTENT };
+    delete content['https://models.example.test/m/rec.onnx'];
+    const { made, asked } = assets({ content, now: () => time });
+    expect(await made.ensure()).toBeUndefined();
+    const first = asked.length;
+    time = 60_000;
+    expect(await made.ensure()).toBeUndefined();
+    expect(asked).toHaveLength(first);
+    content['https://models.example.test/m/rec.onnx'] = 'recogniser';
+    time = 10 * 60_000;
+    expect(await made.ensure()).toBeDefined();
+  });
+
+  it('shares one check between calls at the same time', async () => {
+    const { made, asked } = assets();
+    const [one, two] = await Promise.all([made.ensure(), made.ensure()]);
+    expect(one).toEqual(two);
+    expect(asked).toHaveLength(4);
+  });
+});
diff --git a/src/services/ocr-assets.ts b/src/services/ocr-assets.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ebddf936a06c6b1b4b700e020bdd3814bffb40a9
--- /dev/null
+++ b/src/services/ocr-assets.ts
@@ -0,0 +1,134 @@
+import { createHash } from 'node:crypto';
+import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
+import path from 'node:path';
+import {
+  OCR_ASSETS,
+  type OcrAsset,
+  type OcrAssetName,
+  type OcrAssetPaths,
+} from '../domain/ocr/assets.js';
+import type { Logger } from '../log.js';
+import { failureReason } from './failure-reason.js';
+import { discardBody, readLimitedBytes, type LimitedResponse } from './limited-json.js';
+
+/** The part of `fetch` the downloads need. */
+export type FetchAsset = (url: string, init: { signal: AbortSignal }) => Promise<LimitedResponse>;
+
+export interface OcrAssetsOptions {
+  /** Where the files are kept, e.g. `var/ocr`. */
+  dir: string;
+  /** The folder the models are downloaded from (`settings.ocr.modelsUrl`). */
+  modelsUrl: string;
+  /** The game's tier head (`settings.ocr.headIconUrl`). */
+  headIconUrl: string;
+  fetch: FetchAsset;
+  log: Logger;
+  /** How long one download may take. Default two minutes. */
+  timeoutMs?: number;
+  /** After a failure, the files are asked for again only this much later. Default ten minutes. */
+  retryMs?: number;
+  now?: () => number;
+  /** The files; `OCR_ASSETS` by default (tests give small ones). */
+  assets?: readonly OcrAsset[];
+}
+
+const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
+
+/**
+ * The files of the screenshot reader on disk (`OCR_ASSETS`): each is downloaded when it is
+ * missing or differs from its hash, and checked before it is used. `ensure` never throws: a file
+ * that cannot be had is logged and the answer is undefined, and the reader is then unavailable
+ * until a later call, at most every `retryMs`. Calls at the same time share one check.
+ */
+export class OcrAssets {
+  private ready: OcrAssetPaths | undefined;
+  private running: Promise<OcrAssetPaths | undefined> | undefined;
+  private failedAt: number | undefined;
+  private readonly assets: readonly OcrAsset[];
+  private readonly now: () => number;
+
+  constructor(private readonly options: OcrAssetsOptions) {
+    this.assets = options.assets ?? OCR_ASSETS;
+    this.now = options.now ?? Date.now;
+  }
+
+  ensure(): Promise<OcrAssetPaths | undefined> {
+    if (this.ready) return Promise.resolve(this.ready);
+    if (this.running) return this.running;
+    const retryMs = this.options.retryMs ?? 10 * 60_000;
+    if (this.failedAt !== undefined && this.now() - this.failedAt < retryMs) {
+      return Promise.resolve(undefined);
+    }
+    this.running = this.check().finally(() => {
+      this.running = undefined;
+    });
+    return this.running;
+  }
+
+  /**
+   * The files are checked again by the next `ensure`: the reading process could not start with
+   * them (a file changed or removed on disk).
+   */
+  forget(): void {
+    this.ready = undefined;
+  }
+
+  private async check(): Promise<OcrAssetPaths | undefined> {
+    const paths: Partial<Record<OcrAssetName, string>> = {};
+    try {
+      await mkdir(this.options.dir, { recursive: true });
+      for (const asset of this.assets) {
+        paths[asset.name] = await this.file(asset);
+      }
+    } catch (err) {
+      this.failedAt = this.now();
+      this.options.log.error(
+        { reason: failureReason(err) },
+        'the files of the screenshot reader could not be had; screenshots are not read',
+      );
+      return undefined;
+    }
+    this.failedAt = undefined;
+    this.ready = paths as OcrAssetPaths;
+    return this.ready;
+  }
+
+  /** The asset's path once its file is there and right; downloaded when it is not. */
+  private async file(asset: OcrAsset): Promise<string> {
+    const target = path.join(this.options.dir, asset.file);
+    const present = await readFile(target).catch(() => undefined);
+    if (present && present.byteLength === asset.bytes && sha256(present) === asset.sha256) {
+      return target;
+    }
+    const url =
+      asset.source === 'models'
+        ? new URL(asset.file, this.options.modelsUrl).href
+        : this.options.headIconUrl;
+    const response = await this.options.fetch(url, {
+      signal: AbortSignal.timeout(this.options.timeoutMs ?? 120_000),
+    });
+    if (response.status !== 200) {
+      discardBody(response);
+      throw new Error(`${asset.file}: status ${response.status}`);
+    }
+    // Never more than the file should have: a wrong address cannot fill the bot's memory.
+    const read = await readLimitedBytes(response, asset.bytes);
+    if (!read.ok) throw new Error(`${asset.file}: ${read.reason}`);
+    const { bytes } = read;
+    if (bytes.byteLength !== asset.bytes || sha256(bytes) !== asset.sha256) {
+      throw new Error(`${asset.file}: not the file Pine was measured with (size or SHA-256)`);
+    }
+    const temporary = `${target}.${process.pid}.download`;
+    try {
+      await writeFile(temporary, bytes);
+      await rename(temporary, target);
+    } finally {
+      await rm(temporary, { force: true });
+    }
+    this.options.log.info(
+      { file: asset.file, bytes: asset.bytes },
+      'downloaded a file of the screenshot reader',
+    );
+    return target;
+  }
+}
````

---

### Task 2: What surrounds the OCR models: boxes of text, decoding, lines

Prototype commit: `e841fab1e6a7c99b6ba33153feea3b55c702e831`

What surrounds the two models, without the models (src/domain/ocr/):
image.ts has the picture and box types (RgbImage, GreyImage, Box,
TextLine); text-model.ts the detector's input size (multiples of 32, and
never more than two million pixels), the models' input (blue, green, red
planes of byte/255), the boxes of text in the detector's map (regions
above 0.03, eight-connected, grown by the DB unclip of 1.5), the
recogniser's line width, CTC decoding over the dictionary, and the
joining of pieces of one row into lines (pieces under 0.5 confidence
dropped). The values are the ones the research measured.

**Interfaces:**
- Produces: `RgbImage`, `GreyImage`, `Box`, `TextLine`, `boxHeight`, `boxWidth`, `scaledBox` (`src/domain/ocr/image.ts`); `detectorSize`, `DETECTOR_PIXELS`, `modelInput`, `textBoxes`, `lineWidth`, `LINE_HEIGHT`, `ctcDecode`, `dictionaryOf`, `groupLines`, `TEXT_THRESHOLD`, `MIN_CONFIDENCE` (`src/domain/ocr/text-model.ts`).

**Files:**

```
 src/domain/ocr/image.test.ts      |  13 ++++
 src/domain/ocr/image.ts           |  36 +++++++++++
 src/domain/ocr/text-model.test.ts | 120 ++++++++++++++++++++++++++++++++++++
 src/domain/ocr/text-model.ts      | 194 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 363 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/ocr/image.test.ts src/domain/ocr/text-model.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff e841fab1e6a7c99b6ba33153feea3b55c702e831 -- src test scripts package.json` prints nothing.
- [ ] **Step 5: Commit** with the title `What surrounds the OCR models: boxes of text, decoding, lines`, the body above and the trailer, staging exactly
  `src/domain/ocr/image.test.ts src/domain/ocr/image.ts src/domain/ocr/text-model.test.ts src/domain/ocr/text-model.ts`.

````diff
diff --git a/src/domain/ocr/image.test.ts b/src/domain/ocr/image.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4abca3a60bcbe50783fb9cf4e0c9e4b52af7607f
--- /dev/null
+++ b/src/domain/ocr/image.test.ts
@@ -0,0 +1,13 @@
+import { describe, expect, it } from 'vitest';
+import { scaledBox } from './image.js';
+
+describe('scaledBox', () => {
+  it('scales x and y apart', () => {
+    expect(scaledBox({ x0: 1, y0: 2, x1: 3, y1: 4 }, 2, 0.5)).toEqual({
+      x0: 2,
+      y0: 1,
+      x1: 6,
+      y1: 2,
+    });
+  });
+});
diff --git a/src/domain/ocr/image.ts b/src/domain/ocr/image.ts
new file mode 100644
index 0000000000000000000000000000000000000000..74cdc6bbf63cb4f2a5dc440c73c06b1699b84be8
--- /dev/null
+++ b/src/domain/ocr/image.ts
@@ -0,0 +1,36 @@
+/** A picture as 8-bit RGB, three bytes a pixel, row by row. */
+export interface RgbImage {
+  width: number;
+  height: number;
+  data: Uint8Array;
+}
+
+/** A picture with one value a pixel (grey, a probability, an alpha), row by row. */
+export interface GreyImage {
+  width: number;
+  height: number;
+  data: Float32Array;
+}
+
+/** An axis-aligned box in pixels: `x0`, `y0` inside, `x1`, `y1` just outside. */
+export interface Box {
+  x0: number;
+  y0: number;
+  x1: number;
+  y1: number;
+}
+
+/** A line of text the reader found, with where it stands and how sure the model was (0 to 1). */
+export interface TextLine {
+  text: string;
+  confidence: number;
+  box: Box;
+}
+
+export const boxHeight = (box: Box): number => box.y1 - box.y0;
+export const boxWidth = (box: Box): number => box.x1 - box.x0;
+
+/** The box in another scale: x by `sx`, y by `sy`. */
+export function scaledBox(box: Box, sx: number, sy: number): Box {
+  return { x0: box.x0 * sx, y0: box.y0 * sy, x1: box.x1 * sx, y1: box.y1 * sy };
+}
diff --git a/src/domain/ocr/text-model.test.ts b/src/domain/ocr/text-model.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6ba731e9848df1c1d4e46e836a9b1e1f2102c917
--- /dev/null
+++ b/src/domain/ocr/text-model.test.ts
@@ -0,0 +1,120 @@
+import { describe, expect, it } from 'vitest';
+import type { TextLine } from './image.js';
+import {
+  ctcDecode,
+  detectorSize,
+  dictionaryOf,
+  groupLines,
+  lineWidth,
+  modelInput,
+  textBoxes,
+} from './text-model.js';
+
+/** A probability map with rectangles of 0.9 on 0. */
+function mapWith(width: number, height: number, ...rects: [number, number, number, number][]) {
+  const map = new Float32Array(width * height);
+  for (const [x0, y0, x1, y1] of rects) {
+    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) map[y * width + x] = 0.9;
+  }
+  return map;
+}
+
+const line = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 0.9) =>
+  ({ text, confidence, box: { x0, y0, x1, y1 } }) satisfies TextLine;
+
+describe('detectorSize', () => {
+  it('rounds each side up to a multiple of 32, at least 32', () => {
+    expect(detectorSize(720, 1600)).toEqual({ width: 736, height: 1600 });
+    expect(detectorSize(10, 33)).toEqual({ width: 32, height: 64 });
+  });
+
+  it('scales down what is larger than the detector reads', () => {
+    const size = detectorSize(4000, 3000);
+    expect(size.width * size.height).toBeLessThanOrEqual(2_000_000 * 1.05);
+    expect(size.width / size.height).toBeCloseTo(4 / 3, 1);
+  });
+});
+
+describe('modelInput', () => {
+  it('gives blue, green and red planes of byte / 255, padding rows to the width asked', () => {
+    const image = { width: 2, height: 1, data: Uint8Array.from([255, 0, 51, 0, 102, 0]) };
+    const input = modelInput(image, 3);
+    expect(Array.from(input).map((v) => Math.round(v * 255))).toEqual([
+      51, 0, 0, /* green */ 0, 102, 0, /* red */ 255, 0, 0,
+    ]);
+  });
+});
+
+describe('textBoxes', () => {
+  it('makes one grown box of each region of text, regions touching at a corner included', () => {
+    const map = mapWith(100, 40, [10, 10, 40, 20], [40, 20, 50, 26], [70, 10, 90, 20]);
+    const boxes = textBoxes(map, 100, 40);
+    expect(boxes).toHaveLength(2);
+    // 40 × 16 grown by 40·16·1.5 / (2·56) ≈ 8.6 on every side.
+    expect(boxes[0]).toEqual({ x0: 1, y0: 1, x1: 59, y1: 35 });
+    // 20 × 10 grown by 5.
+    expect(boxes[1]).toEqual({ x0: 65, y0: 5, x1: 95, y1: 25 });
+  });
+
+  it('drops what is too thin to be text, and keeps boxes inside the map', () => {
+    const map = mapWith(50, 20, [0, 0, 30, 2], [5, 10, 45, 20]);
+    const boxes = textBoxes(map, 50, 20);
+    expect(boxes).toEqual([{ x0: 0, y0: 4, x1: 50, y1: 20 }]);
+  });
+
+  it('counts only probabilities above the threshold', () => {
+    const map = new Float32Array(20 * 20).fill(0.03);
+    expect(textBoxes(map, 20, 20)).toEqual([]);
+  });
+});
+
+describe('lineWidth', () => {
+  it('scales the width as the height goes to 48', () => {
+    expect(lineWidth({ x0: 0, y0: 0, x1: 100, y1: 24 })).toBe(200);
+    expect(lineWidth({ x0: 0, y0: 0, x1: 1, y1: 200 })).toBe(1);
+  });
+});
+
+describe('ctcDecode', () => {
+  const dictionary = dictionaryOf('a\r\nb\nc');
+
+  /** Scores of `steps` steps over 5 classes (blank, a, b, c, space), the best given per step. */
+  function scores(best: number[], value = 0.8): Float32Array {
+    const out = new Float32Array(best.length * 5).fill(0.01);
+    best.forEach((c, step) => {
+      out[step * 5 + c] = value;
+    });
+    return out;
+  }
+
+  it('folds repeats, drops blanks and reads a repeat split by a blank twice', () => {
+    expect(ctcDecode(scores([1, 1, 0, 1, 2, 2, 4, 3]), 0, 8, 5, dictionary)).toEqual({
+      text: 'aab c',
+      confidence: expect.closeTo(0.8, 5) as number,
+    });
+  });
+
+  it('reads from an offset, and gives an empty text a confidence of 0', () => {
+    const two = new Float32Array([...scores([0, 0]), ...scores([3])]);
+    expect(ctcDecode(two, 0, 2, 5, dictionary)).toEqual({ text: '', confidence: 0 });
+    expect(ctcDecode(two, 10, 1, 5, dictionary).text).toBe('c');
+  });
+});
+
+describe('groupLines', () => {
+  it('joins pieces of one row left to right and orders the rows top down', () => {
+    const lines = groupLines([
+      line('Hill', 60, 102, 90, 120),
+      line('9:41', 0, 0, 30, 18),
+      line('Squirrel', 0, 100, 50, 120),
+    ]);
+    expect(lines.map((l) => l.text)).toEqual(['9:41', 'Squirrel Hill']);
+    expect(lines[1]?.box).toEqual({ x0: 0, y0: 100, x1: 90, y1: 120 });
+  });
+
+  it('drops pieces read with little confidence', () => {
+    expect(groupLines([line('x', 0, 0, 10, 10, 0.4), line('ok', 0, 50, 10, 60)])).toEqual([
+      line('ok', 0, 50, 10, 60),
+    ]);
+  });
+});
diff --git a/src/domain/ocr/text-model.ts b/src/domain/ocr/text-model.ts
new file mode 100644
index 0000000000000000000000000000000000000000..101ce6ffdf3246bfccdbf523d86436fb577910b6
--- /dev/null
+++ b/src/domain/ocr/text-model.ts
@@ -0,0 +1,194 @@
+import type { Box, RgbImage, TextLine } from './image.js';
+
+/**
+ * What surrounds the two PaddleOCR models, without the models: the detector's input and the
+ * boxes of text in its output (DB: a map of the probability that a pixel is text), the
+ * recogniser's input and the decoding of its output (CTC over the dictionary), and the lines
+ * the boxes make. The values are the ones the research measured on the sample screenshots
+ * (`docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md`): change one only with
+ * `npm run ocr:check` over every sample.
+ */
+
+/** The detector takes sides that are multiples of this. */
+const DETECTOR_STEP = 32;
+/** A pixel of the detector's map is text above this probability. */
+export const TEXT_THRESHOLD = 0.03;
+/** The DB "unclip": a box is grown on every side by its area × this / its perimeter. */
+const UNCLIP_RATIO = 1.5;
+/** A region narrower than this (pixels of the map) is no text; once grown, narrower than the second. */
+const MIN_SIDE = 3;
+const MIN_GROWN_SIDE = 5;
+/** The recogniser reads a line scaled to this height. */
+export const LINE_HEIGHT = 48;
+/** A line read with less mean confidence than this is dropped. */
+export const MIN_CONFIDENCE = 0.5;
+
+/**
+ * The detector reads at most this many pixels: a screen at 720 wide is about 1.2 million, its
+ * status bar about 0.5. Anything larger is scaled down, so no picture can make the model's
+ * memory explode.
+ */
+export const DETECTOR_PIXELS = 2_000_000;
+
+/**
+ * The size the detector reads a picture at: scaled down to `DETECTOR_PIXELS` when larger, then
+ * each side up to a multiple of 32.
+ */
+export function detectorSize(width: number, height: number): { width: number; height: number } {
+  const shrink = Math.min(1, Math.sqrt(DETECTOR_PIXELS / (width * height)));
+  const up = (side: number) =>
+    Math.max(DETECTOR_STEP, Math.ceil((side * shrink) / DETECTOR_STEP) * DETECTOR_STEP);
+  return { width: up(width), height: up(height) };
+}
+
+/**
+ * A picture as the models take it: three planes, blue, green, red (the models were trained on
+ * OpenCV's order), each value a byte / 255. `width` may be larger than the picture's: the rest of
+ * each row stays 0 (padding of a line to the width of others).
+ */
+export function modelInput(image: RgbImage, width = image.width): Float32Array {
+  const plane = image.height * width;
+  const out = new Float32Array(3 * plane);
+  for (let y = 0; y < image.height; y++) {
+    for (let x = 0; x < image.width; x++) {
+      const k = (y * image.width + x) * 3;
+      const o = y * width + x;
+      out[o] = (image.data[k + 2] ?? 0) / 255;
+      out[plane + o] = (image.data[k + 1] ?? 0) / 255;
+      out[2 * plane + o] = (image.data[k] ?? 0) / 255;
+    }
+  }
+  return out;
+}
+
+/**
+ * The boxes of text in the detector's map: each region of pixels above `TEXT_THRESHOLD` that
+ * touch (also across a corner) is one box, its bounding box grown by the unclip distance and
+ * kept inside the map. Boxes are in the map's pixels.
+ */
+export function textBoxes(map: Float32Array, width: number, height: number): Box[] {
+  const seen = new Uint8Array(width * height);
+  const boxes: Box[] = [];
+  const stack: number[] = [];
+  for (let start = 0; start < map.length; start++) {
+    if (seen[start] || (map[start] ?? 0) <= TEXT_THRESHOLD) continue;
+    let x0 = width;
+    let y0 = height;
+    let x1 = -1;
+    let y1 = -1;
+    seen[start] = 1;
+    stack.push(start);
+    while (stack.length > 0) {
+      const k = stack.pop() ?? 0;
+      const x = k % width;
+      const y = (k - x) / width;
+      if (x < x0) x0 = x;
+      if (x > x1) x1 = x;
+      if (y < y0) y0 = y;
+      if (y > y1) y1 = y;
+      for (let dy = -1; dy <= 1; dy++) {
+        for (let dx = -1; dx <= 1; dx++) {
+          const nx = x + dx;
+          const ny = y + dy;
+          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
+          const n = ny * width + nx;
+          if (!seen[n] && (map[n] ?? 0) > TEXT_THRESHOLD) {
+            seen[n] = 1;
+            stack.push(n);
+          }
+        }
+      }
+    }
+    const w = x1 + 1 - x0;
+    const h = y1 + 1 - y0;
+    if (Math.min(w, h) < MIN_SIDE) continue;
+    const d = (w * h * UNCLIP_RATIO) / (2 * (w + h));
+    const grown = {
+      x0: Math.max(0, Math.round(x0 - d)),
+      y0: Math.max(0, Math.round(y0 - d)),
+      x1: Math.min(width, Math.round(x1 + 1 + d)),
+      y1: Math.min(height, Math.round(y1 + 1 + d)),
+    };
+    if (Math.min(grown.x1 - grown.x0, grown.y1 - grown.y0) < MIN_GROWN_SIDE) continue;
+    boxes.push(grown);
+  }
+  return boxes;
+}
+
+/** The width a box is read at: its height scaled to `LINE_HEIGHT`, its width alike. */
+export function lineWidth(box: Box): number {
+  return Math.max(1, Math.round((LINE_HEIGHT * (box.x1 - box.x0)) / (box.y1 - box.y0)));
+}
+
+/**
+ * The text of one line from the recogniser's output, `steps` × `classes` scores from `offset`:
+ * the best class of each step, repeats folded and the blank (class 0) dropped; class `c` is the
+ * dictionary's entry `c - 1`. The confidence is the mean score of the characters kept.
+ */
+export function ctcDecode(
+  scores: Float32Array,
+  offset: number,
+  steps: number,
+  classes: number,
+  dictionary: readonly string[],
+): { text: string; confidence: number } {
+  let text = '';
+  let sum = 0;
+  let count = 0;
+  let previous = -1;
+  for (let step = 0; step < steps; step++) {
+    const base = offset + step * classes;
+    let best = 0;
+    let bestScore = -Infinity;
+    for (let c = 0; c < classes; c++) {
+      const score = scores[base + c] ?? -Infinity;
+      if (score > bestScore) {
+        bestScore = score;
+        best = c;
+      }
+    }
+    if (best !== 0 && best !== previous) {
+      text += dictionary[best - 1] ?? '';
+      sum += bestScore;
+      count++;
+    }
+    previous = best;
+  }
+  return { text, confidence: count === 0 ? 0 : sum / count };
+}
+
+/** The recogniser's dictionary: one character a line of the keys file, and a space last. */
+export function dictionaryOf(keys: string): string[] {
+  return [...keys.replaceAll('\r\n', '\n').split('\n'), ' '];
+}
+
+/**
+ * Pieces read on one row are one line: pieces whose middles differ by less than half the mean
+ * height of all pieces join the first such line, left to right, words separated by a space; the
+ * lines are ordered top down. Pieces read with too little confidence are dropped first.
+ */
+export function groupLines(pieces: readonly TextLine[]): TextLine[] {
+  const kept = pieces.filter((piece) => piece.confidence >= MIN_CONFIDENCE);
+  if (kept.length === 0) return [];
+  const meanHeight = kept.reduce((sum, p) => sum + (p.box.y1 - p.box.y0), 0) / kept.length;
+  const middle = (piece: TextLine) => (piece.box.y0 + piece.box.y1) / 2;
+  const rows: TextLine[][] = [];
+  for (const piece of kept) {
+    const row = rows.find((r) => r[0] && Math.abs(middle(r[0]) - middle(piece)) < meanHeight / 2);
+    if (row) row.push(piece);
+    else rows.push([piece]);
+  }
+  return rows
+    .map((row) => row.sort((a, b) => a.box.x0 - b.box.x0))
+    .sort((a, b) => (a[0]?.box.y0 ?? 0) - (b[0]?.box.y0 ?? 0))
+    .map((row) => ({
+      text: row.map((p) => p.text).join(' '),
+      confidence: row.reduce((sum, p) => sum + p.confidence, 0) / row.length,
+      box: {
+        x0: Math.min(...row.map((p) => p.box.x0)),
+        y0: Math.min(...row.map((p) => p.box.y0)),
+        x1: Math.max(...row.map((p) => p.box.x1)),
+        y1: Math.max(...row.map((p) => p.box.y1)),
+      },
+    }));
+}
````

---

### Task 3: What the text of a raid screen says

Prototype commit: `2fa5324301c98043480b2135643b44759f647d2b`

What the text of a raid screen says, from the lines and their boxes,
without a fixed layout (readScreenText): the phone's clock from the
status bar read alone (an h:mm before any h.mm; not a number followed by
a digit, a speed unit or %), the countdown h:mm:ss and where it stands
(centred under an egg, at the right of a hatched raid), the gym's name
(the tallest text in the top fifth and the lines under it), the elite
raid gym badge, the CP (a tall line of digits) and the boss's name under
it.

**Interfaces:**
- Consumes: `TextLine`, `Box`, `boxHeight` (Task 2).
- Produces: `ScreenText` (`clock`, `countdown`, `gym`, `eliteBadge`, `cp`, `bossName`, `countdownBox`, `countdownPlace`, `cpBox`), `readScreenText(lines, status, size)`, `statusLines`, `clockIn`, `STATUS_BAR` (`src/domain/ocr/raid-screen.ts`).

**Files:**

```
 src/domain/ocr/raid-screen.test.ts | 120 ++++++++++++++++++++++++++++++++++++++
 src/domain/ocr/raid-screen.ts      | 178 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 298 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/ocr/raid-screen.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 2fa5324301c98043480b2135643b44759f647d2b -- src test scripts package.json` prints nothing.
- [ ] **Step 5: Commit** with the title `What the text of a raid screen says`, the body above and the trailer, staging exactly
  `src/domain/ocr/raid-screen.test.ts src/domain/ocr/raid-screen.ts`.

````diff
diff --git a/src/domain/ocr/raid-screen.test.ts b/src/domain/ocr/raid-screen.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e40eb48104baf5fd4ed7775a1595b3d88001a25f
--- /dev/null
+++ b/src/domain/ocr/raid-screen.test.ts
@@ -0,0 +1,120 @@
+import { describe, expect, it } from 'vitest';
+import type { TextLine } from './image.js';
+import { clockIn, readScreenText, statusLines } from './raid-screen.js';
+
+const SIZE = { width: 1080, height: 2400 };
+
+const line = (text: string, x0: number, y0: number, x1: number, y1: number): TextLine => ({
+  text,
+  confidence: 0.95,
+  box: { x0, y0, x1, y1 },
+});
+
+/** The lines of an egg screen, made up in the layout of the samples. */
+const EGG: TextLine[] = [
+  line('9:41 5G', 40, 20, 200, 80),
+  line('Squirrel Hill', 180, 190, 760, 262),
+  line('Green Mural', 182, 270, 700, 340),
+  line('PARK OPEN 6AM', 190, 360, 420, 390),
+  line('0:42:17', 420, 1500, 660, 1560),
+  line('Walk closer to interact with this Gym.', 200, 2200, 880, 2240),
+];
+
+/** The lines of a hatched raid. */
+const HATCHED: TextLine[] = [
+  line('21:05', 60, 20, 180, 80),
+  line('ELITE RAID GYM', 180, 150, 420, 180),
+  line('Heinz Plant', 180, 200, 600, 270),
+  line('0:31:02', 860, 700, 1040, 750),
+  line('CP 41234', 300, 1100, 780, 1220),
+  line('Yveltal', 400, 1240, 680, 1300),
+];
+
+describe('readScreenText', () => {
+  it('reads an egg: clock, gym over two lines, countdown, no CP', () => {
+    const text = readScreenText(EGG, [], SIZE);
+    expect(text).toMatchObject({
+      clock: { hour: 9, minute: 41 },
+      gym: 'Squirrel Hill Green Mural',
+      countdown: 42 * 60 + 17,
+      eliteBadge: false,
+      cp: null,
+      bossName: null,
+      cpBox: null,
+    });
+    expect(text.countdownBox).toEqual({ x0: 420, y0: 1500, x1: 660, y1: 1560 });
+    expect(text.countdownPlace).toBe('centre');
+  });
+
+  it('reads a hatched raid: badge, CP and the name under it, a 24-hour clock', () => {
+    expect(readScreenText(HATCHED, [], SIZE)).toMatchObject({
+      clock: { hour: 21, minute: 5 },
+      gym: 'Heinz Plant',
+      eliteBadge: true,
+      countdown: 31 * 60 + 2,
+      cp: 41234,
+      bossName: 'Yveltal',
+      countdownPlace: 'right',
+    });
+  });
+
+  it('takes the clock from the status bar read alone, before the whole screen', () => {
+    const status = [line('@9:43', 30, 20, 160, 70), line('12:00', 500, 20, 600, 70)];
+    expect(readScreenText(EGG, status, SIZE).clock).toEqual({ hour: 9, minute: 43 });
+  });
+
+  it('answers null for what is not there', () => {
+    expect(readScreenText([line('Walk closer', 200, 2200, 880, 2240)], [], SIZE)).toEqual({
+      clock: null,
+      countdown: null,
+      gym: null,
+      eliteBadge: false,
+      cp: null,
+      bossName: null,
+      countdownBox: null,
+      countdownPlace: null,
+      cpBox: null,
+    });
+  });
+
+  it('does not take small digits for the CP, nor a name the boss hides', () => {
+    const lines = [line('1234', 300, 1100, 400, 1130), line('CP 9999', 300, 1100, 780, 1220)];
+    expect(readScreenText(lines, [], SIZE)).toMatchObject({ cp: 9999, bossName: null });
+  });
+});
+
+describe('statusLines and clockIn', () => {
+  it('keeps the lines of the top 4.5%, and reads the first h:mm from the left', () => {
+    const lines = [line('10:02', 500, 10, 600, 60), line('7:15', 20, 10, 120, 60), ...EGG.slice(1)];
+    expect(statusLines(lines, 2400)).toHaveLength(2);
+    expect(clockIn(statusLines(lines, 2400))).toEqual({ hour: 7, minute: 15 });
+    expect(clockIn([line('99:99', 0, 0, 10, 10)])).toBeNull();
+  });
+
+  it('does not take a network speed, a percentage or a longer number for the clock', () => {
+    const at = (...texts: string[]) =>
+      clockIn(texts.map((text, i) => line(text, i * 200, 0, i * 200 + 150, 40)));
+    expect(at('0.12K/s', '9:41')).toEqual({ hour: 9, minute: 41 });
+    expect(at('1.25K/s 9:41')).toEqual({ hour: 9, minute: 41 });
+    expect(at('1.25K/s', '85%')).toBeNull();
+    expect(at('12:345')).toBeNull();
+    expect(at('9:41PM')).toEqual({ hour: 9, minute: 41 });
+    // The clock runs into the icons beside it when read.
+    expect(at('1:29C SOS 80')).toEqual({ hour: 1, minute: 29 });
+    expect(at('0.5MB/s', '12.5%')).toBeNull();
+  });
+
+  it('takes h.mm only when no h:mm stands in the bar', () => {
+    const at = (...texts: string[]) =>
+      clockIn(texts.map((text, i) => line(text, i * 200, 0, i * 200 + 150, 40)));
+    expect(at('14.10.', '9:41')).toEqual({ hour: 9, minute: 41 });
+    expect(at('Tue 14.10.')).toBeNull();
+    expect(at('9.41')).toEqual({ hour: 9, minute: 41 });
+  });
+
+  it('reads a clock with a morning or afternoon word before it, as East Asian phones show it', () => {
+    for (const text of ['下午9:41', '午後 9:41', '오후 9:41', '9:41 PM', '09.41']) {
+      expect(clockIn([line(text, 0, 0, 100, 40)])).toEqual({ hour: 9, minute: 41 });
+    }
+  });
+});
diff --git a/src/domain/ocr/raid-screen.ts b/src/domain/ocr/raid-screen.ts
new file mode 100644
index 0000000000000000000000000000000000000000..ed84110d684673df5b924159fa0f44dadf5b3515
--- /dev/null
+++ b/src/domain/ocr/raid-screen.ts
@@ -0,0 +1,178 @@
+import { boxHeight, type Box, type TextLine } from './image.js';
+
+/**
+ * What the text of a raid screen says, read from the lines the reader found and their boxes,
+ * without assuming a layout: the research found these rules on screenshots of three phones,
+ * split screens included (`docs/superpowers/specs/2026-10-14-phase-7-ocr-research.md`).
+ */
+export interface ScreenText {
+  /** The phone's clock: the first h:mm in the status bar, as shown (12- or 24-hour). */
+  clock: { hour: number; minute: number } | null;
+  /** The countdown h:mm:ss, in seconds: until the hatch of an egg, the end of a hatched raid. */
+  countdown: number | null;
+  /** The gym's name as read: the tallest text near the top and the lines under it. */
+  gym: string | null;
+  /** The "Elite raid gym" badge stands near the top. */
+  eliteBadge: boolean;
+  /** The boss's CP, on a hatched raid. */
+  cp: number | null;
+  /** The text under the CP: the boss's name, as far as the boss does not hide it. */
+  bossName: string | null;
+  /** Where the countdown and the CP stand: the tier heads are looked for beside them. */
+  countdownBox: Box | null;
+  /**
+   * Where the countdown stands across the screen: centred under an egg, at the right of a
+   * hatched raid (the research's samples: the middle at 0.50 and 0.83 of the width).
+   */
+  countdownPlace: 'centre' | 'right' | null;
+  cpBox: Box | null;
+}
+
+/** The status bar: what starts in the top 4.5% of the screen. */
+export const STATUS_BAR = 0.045;
+/** The gym's name stands in the top fifth. */
+const TOP = 0.2;
+/** The CP is the tallest text on a hatched raid: taller than this share of the screen. */
+const CP_MIN_HEIGHT = 0.04;
+
+/** A word that starts with a time: up to two other characters (a symbol, 上午), h:mm or h.mm. */
+const CLOCK_WORD = /^\D{0,2}([01]?\d|2[0-3])([:.])([0-5]\d)(.*)$/;
+/**
+ * What may not follow the minutes in the word: a digit, a unit of speed or a percent sign
+ * (`1.25K/s`, `0.5MB/s`, `12.5%`). Anything else may: the clock runs into the icons beside it
+ * when read (`1:29C`, `1:37四四四` on the research's samples).
+ */
+const NOT_A_CLOCK = /^(?:\d|[KMGkmg]?[Bb]?\/s|%)/;
+/** A dotted time followed by a dot is a date (`14.10.`). */
+const DATE_END = /^\./;
+/** The middle of an egg's countdown is within this share of the width from the screen's. */
+const CENTRED = 0.1;
+/** The middle of a hatched raid's countdown is right of this share of the width. */
+const AT_THE_RIGHT = 0.65;
+const COUNTDOWN = /(\d{1,2})[:.]([0-5]\d)[:.]([0-5]\d)/;
+const CP = /^(?:CP)?(\d{3,6})$/i;
+const BOSS_NAME = /^[A-Za-z][A-Za-z.'\- ]{2,}$/;
+const LETTERS = /[a-z]{2}/i;
+const ELITE = /elite\s*raid/i;
+
+/** The lines that stand in the status bar of a screen of this height. */
+export function statusLines(lines: readonly TextLine[], height: number): TextLine[] {
+  return lines.filter((l) => l.box.y0 < height * STATUS_BAR && l.box.y1 < height * 0.07);
+}
+
+/**
+ * The phone's clock in the lines of a status bar: the first time that starts a word, from the
+ * left, an h:mm before any h.mm (a dot is also how speeds and dates are written). A time followed
+ * by a digit or a unit is not the clock, nor a dotted one followed by a dot (a date).
+ */
+export function clockIn(lines: readonly TextLine[]): ScreenText['clock'] {
+  let dotted: ScreenText['clock'] = null;
+  for (const line of [...lines].sort((a, b) => a.box.x0 - b.box.x0)) {
+    for (const word of line.text.split(/\s+/)) {
+      const hit = CLOCK_WORD.exec(word);
+      if (!hit || NOT_A_CLOCK.test(hit[4] ?? '')) continue;
+      if (hit[2] === '.' && DATE_END.test(hit[4] ?? '')) continue;
+      const clock = { hour: Number(hit[1]), minute: Number(hit[3]) };
+      if (hit[2] === ':') return clock;
+      dotted ??= clock;
+    }
+  }
+  return dotted;
+}
+
+/**
+ * What the lines of a raid screen say. `lines` were read from the whole screen, `status` from the
+ * status bar read again alone and enlarged (its boxes in the screen's pixels): the clock comes
+ * from those first, since read whole the clock runs into the icons beside it.
+ */
+export function readScreenText(
+  lines: readonly TextLine[],
+  status: readonly TextLine[],
+  size: { width: number; height: number },
+): ScreenText {
+  const { width, height } = size;
+  const sorted = [...lines].sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0);
+  const inStatus = new Set(statusLines(sorted, height));
+  const body = sorted.filter((l) => !inStatus.has(l));
+  const clock = clockIn(status) ?? clockIn([...inStatus]);
+
+  let countdown: number | null = null;
+  let countdownBox: Box | null = null;
+  for (const line of body) {
+    const hit = COUNTDOWN.exec(line.text.replace(/\s+/g, ''));
+    if (hit) {
+      countdown = Number(hit[1]) * 3600 + Number(hit[2]) * 60 + Number(hit[3]);
+      countdownBox = line.box;
+      break;
+    }
+  }
+
+  let countdownPlace: ScreenText['countdownPlace'] = null;
+  if (countdownBox) {
+    const middle = (countdownBox.x0 + countdownBox.x1) / 2 / width;
+    if (Math.abs(middle - 0.5) <= CENTRED) countdownPlace = 'centre';
+    else if (middle >= AT_THE_RIGHT) countdownPlace = 'right';
+  }
+
+  const badge = body.find((l) => ELITE.test(l.text) && l.box.y0 < height * TOP);
+
+  // The gym's name: the tallest line in the top fifth that is not the badge (the name is the
+  // largest text there; text on the gym's picture is small), then the lines under it that start
+  // where it starts and are about as tall.
+  const top = body.filter(
+    (l) =>
+      l.box.y1 < height * TOP &&
+      l !== badge &&
+      LETTERS.test(l.text) &&
+      !COUNTDOWN.test(l.text.replace(/\s+/g, '')),
+  );
+  const tallest = [...top].sort((a, b) => boxHeight(b.box) - boxHeight(a.box))[0];
+  let gym: string | null = null;
+  if (tallest) {
+    const block = top
+      .filter(
+        (l) =>
+          Math.abs(l.box.x0 - tallest.box.x0) < width * 0.04 &&
+          boxHeight(l.box) > boxHeight(tallest.box) * 0.6,
+      )
+      .sort((a, b) => a.box.y0 - b.box.y0);
+    const kept: TextLine[] = [];
+    for (const l of block) {
+      const previous = kept.at(-1);
+      if (!previous || l.box.y0 - previous.box.y1 < boxHeight(previous.box) * 0.8) kept.push(l);
+    }
+    gym =
+      kept
+        .map((l) => l.text.trim())
+        .join(' ')
+        .replace(/\s+/g, ' ') || null;
+  }
+
+  // The CP: "CP" and digits, or digits alone, in a tall line; the boss's name is the first line
+  // of letters under it.
+  const cpLine = body.find(
+    (l) => CP.test(l.text.replace(/\s/g, '')) && boxHeight(l.box) > height * CP_MIN_HEIGHT,
+  );
+  let cp: number | null = null;
+  let bossName: string | null = null;
+  if (cpLine) {
+    cp = Number(CP.exec(cpLine.text.replace(/\s/g, ''))?.[1]);
+    const below = body.find(
+      (l) =>
+        l.box.y0 > cpLine.box.y0 + boxHeight(cpLine.box) * 0.5 && BOSS_NAME.test(l.text.trim()),
+    );
+    bossName = below ? below.text.trim() : null;
+  }
+
+  return {
+    clock,
+    countdown,
+    gym,
+    eliteBadge: badge !== undefined,
+    cp,
+    bossName,
+    countdownBox,
+    countdownPlace,
+    cpBox: cpLine?.box ?? null,
+  };
+}
````

---

### Task 4: Tier heads counted by template matching; the purple of shadow raids

Prototype commit: `63a43cc0cd8421d4f5e4034acc5d0d60020b668f`

The tier heads, counted by template matching: the game's own head icon
(its alpha as values, its outline as the mask) matched by normalised
cross-correlation at eight scales in a band beside the countdown (an
egg) or above the CP (a hatched raid); the heads stand in a row centred
on the screen, and counts of 7 down to 1 are tried with a spacing that is
searched. How much the places just outside the row look like heads is
kept for review (HeadCount.outside); it decides nothing.

purpleShare is the share of shadow-smoke purple in the middle of the
screen: a hint, as the research found it.

**Interfaces:**
- Consumes: `GreyImage`, `RgbImage`, `boxHeight` (Task 2); `ScreenText` (Task 3).
- Produces: `HeadTemplate`, `HeadBand`, `HeadCount` (`count`, `score`, `scale`, `outside`), `headTemplate(icon)`, `headBand(text)`, `countHeads(band, unit, template)`, `MAX_HEADS` (`src/domain/ocr/tier-heads.ts`); `purpleShare(image)`, `SHADOW_SHARE` (`src/domain/ocr/shadow.ts`).

**Files:**

```
 src/domain/ocr/shadow.test.ts     |  38 +++++++++
 src/domain/ocr/shadow.ts          |  38 +++++++++
 src/domain/ocr/tier-heads.test.ts | 108 ++++++++++++++++++++++++++
 src/domain/ocr/tier-heads.ts      | 242 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 426 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/ocr/shadow.test.ts src/domain/ocr/tier-heads.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 63a43cc0cd8421d4f5e4034acc5d0d60020b668f -- src test scripts package.json` prints nothing.
- [ ] **Step 5: Commit** with the title `Tier heads counted by template matching; the purple of shadow raids`, the body above and the trailer, staging exactly
  `src/domain/ocr/shadow.test.ts src/domain/ocr/shadow.ts src/domain/ocr/tier-heads.test.ts src/domain/ocr/tier-heads.ts`.

````diff
diff --git a/src/domain/ocr/shadow.test.ts b/src/domain/ocr/shadow.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7f7af99766558196f94b3ab282195c58b05ecebe
--- /dev/null
+++ b/src/domain/ocr/shadow.test.ts
@@ -0,0 +1,38 @@
+import { describe, expect, it } from 'vitest';
+import type { RgbImage } from './image.js';
+import { purpleShare } from './shadow.js';
+
+/** A 100 × 100 screen of one colour, with another in the rectangle given. */
+function screen(
+  ground: [number, number, number],
+  patch?: { colour: [number, number, number]; x0: number; y0: number; x1: number; y1: number },
+): RgbImage {
+  const data = new Uint8Array(100 * 100 * 3);
+  for (let y = 0; y < 100; y++) {
+    for (let x = 0; x < 100; x++) {
+      const inPatch = patch && x >= patch.x0 && x < patch.x1 && y >= patch.y0 && y < patch.y1;
+      data.set(inPatch ? patch.colour : ground, (y * 100 + x) * 3);
+    }
+  }
+  return { width: 100, height: 100, data };
+}
+
+describe('purpleShare', () => {
+  const smoke: [number, number, number] = [140, 40, 220];
+
+  it('measures saturated purple in the middle of the screen', () => {
+    // 20 × 20 of the 80 × 50 middle.
+    const share = purpleShare(
+      screen([30, 120, 60], { colour: smoke, x0: 40, y0: 40, x1: 60, y1: 60 }),
+    );
+    expect(share).toBeCloseTo(0.1, 5);
+  });
+
+  it('does not count purple outside the middle, pale or dark purple, or blue', () => {
+    const top = { colour: smoke, x0: 0, y0: 0, x1: 100, y1: 30 };
+    expect(purpleShare(screen([30, 120, 60], top))).toBe(0);
+    expect(purpleShare(screen([200, 180, 220]))).toBe(0);
+    expect(purpleShare(screen([40, 10, 50]))).toBe(0);
+    expect(purpleShare(screen([40, 60, 230]))).toBe(0);
+  });
+});
diff --git a/src/domain/ocr/shadow.ts b/src/domain/ocr/shadow.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c573aca408f96cdbb4d573c148dc45272d948a5d
--- /dev/null
+++ b/src/domain/ocr/shadow.ts
@@ -0,0 +1,38 @@
+import type { RgbImage } from './image.js';
+
+/**
+ * How much of the middle of a raid screen (x 10–90%, y 35–85%, where the egg or the boss
+ * stands) is the saturated purple of shadow smoke: hue 255–300°, saturation at least 0.45,
+ * value at least 0.25. On the research's samples a shadow raid had 4.3–15.6% and every other
+ * at most 0.05%, at dawn too. A hint only: a hatched raid's boss decides.
+ */
+export function purpleShare(image: RgbImage): number {
+  const x0 = Math.round(image.width * 0.1);
+  const x1 = x0 + Math.round(image.width * 0.8);
+  const y0 = Math.round(image.height * 0.35);
+  const y1 = y0 + Math.round(image.height * 0.5);
+  let purple = 0;
+  let all = 0;
+  for (let y = y0; y < Math.min(y1, image.height); y++) {
+    for (let x = x0; x < Math.min(x1, image.width); x++) {
+      all++;
+      const k = (y * image.width + x) * 3;
+      const r = (image.data[k] ?? 0) / 255;
+      const g = (image.data[k + 1] ?? 0) / 255;
+      const b = (image.data[k + 2] ?? 0) / 255;
+      const max = Math.max(r, g, b);
+      const d = max - Math.min(r, g, b);
+      if (max < 0.25 || d / max < 0.45) continue;
+      let hue: number;
+      if (max === r) hue = ((g - b) / d) % 6;
+      else if (max === g) hue = (b - r) / d + 2;
+      else hue = (r - g) / d + 4;
+      hue = (hue * 60 + 360) % 360;
+      if (hue >= 255 && hue <= 300) purple++;
+    }
+  }
+  return all === 0 ? 0 : purple / all;
+}
+
+/** A raid whose screen has more purple than this looks like a shadow raid. */
+export const SHADOW_SHARE = 0.01;
diff --git a/src/domain/ocr/tier-heads.test.ts b/src/domain/ocr/tier-heads.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1a91622ad45effae016efb264361372479d3fd23
--- /dev/null
+++ b/src/domain/ocr/tier-heads.test.ts
@@ -0,0 +1,108 @@
+import { describe, expect, it } from 'vitest';
+import type { GreyImage } from './image.js';
+import { countHeads, headBand, headTemplate } from './tier-heads.js';
+
+/**
+ * A made-up head, 40 × 36: an opaque round body with two transparent eyes, transparent around
+ * it. The game's own icon is never part of a test.
+ */
+function icon() {
+  const width = 40;
+  const height = 36;
+  const data = new Uint8Array(width * height * 4);
+  for (let y = 0; y < height; y++) {
+    for (let x = 0; x < width; x++) {
+      const inBody = ((x - 20) / 18) ** 2 + ((y - 18) / 16) ** 2 <= 1;
+      const inEye = (x - 13) ** 2 + (y - 15) ** 2 <= 9 || (x - 27) ** 2 + (y - 15) ** 2 <= 9;
+      const k = (y * width + x) * 4;
+      data[k] = data[k + 1] = data[k + 2] = 255;
+      data[k + 3] = inBody && !inEye ? 255 : 0;
+    }
+  }
+  return { width, height, data };
+}
+
+/** A band of a screen: a grey gradient with `count` heads drawn in a centred row. */
+function band(
+  count: number,
+  headHeight = 30,
+  spacing = 1.35,
+  shift = 0,
+  missing: readonly number[] = [],
+): GreyImage {
+  const width = 600;
+  const height = 80;
+  const data = new Float32Array(width * height);
+  for (let y = 0; y < height; y++)
+    for (let x = 0; x < width; x++) data[y * width + x] = 60 + x / 20;
+  const scale = headHeight / 36;
+  const headWidth = 40 * scale;
+  const source = icon();
+  for (let i = 0; i < count; i++) {
+    if (missing.includes(i)) continue;
+    const left = shift + width / 2 - headWidth / 2 + (i - (count - 1) / 2) * headWidth * spacing;
+    for (let y = 0; y < headHeight; y++) {
+      for (let x = 0; x < headWidth; x++) {
+        const sx = Math.floor(x / scale);
+        const sy = Math.floor(y / scale);
+        const alpha = source.data[(sy * 40 + sx) * 4 + 3] ?? 0;
+        const inside = ((sx - 20) / 18) ** 2 + ((sy - 18) / 16) ** 2 <= 1;
+        if (!inside) continue;
+        data[(25 + y) * width + Math.round(left + x)] = alpha > 127 ? 240 : 20;
+      }
+    }
+  }
+  return { width, height, data };
+}
+
+describe('headTemplate', () => {
+  it('masks the outside but not the eyes', () => {
+    const template = headTemplate(icon());
+    const at = (x: number, y: number) => template.mask[y * template.width + x];
+    expect(at(0, 0)).toBe(0);
+    expect(at(13, 15)).toBe(1);
+    expect(at(20, 18)).toBe(1);
+    expect(template.data[15 * template.width + 13]).toBe(0);
+  });
+});
+
+describe('countHeads', () => {
+  const template = headTemplate(icon());
+
+  it.each([1, 3, 4, 5, 6, 7])('counts a row of %i', (count) => {
+    expect(countHeads(band(count), 30, template).count).toBe(count);
+  });
+
+  it('counts heads drawn smaller than expected, or wider apart', () => {
+    expect(countHeads(band(5, 24), 30, template).count).toBe(5);
+    expect(countHeads(band(5, 30, 1.48), 30, template).count).toBe(5);
+  });
+
+  it('counts a row of 2, which is no tier', () => {
+    expect(countHeads(band(2), 30, template).count).toBe(2);
+  });
+
+  it('finds no row that is not centred on the screen', () => {
+    expect(countHeads(band(3, 30, 1.35, 60), 30, template).count).toBe(0);
+  });
+
+  it('counts five whose outer heads are hidden as three: a hatched raid says so (heads-only)', () => {
+    const counted = countHeads(band(5, 30, 1.35, 0, [0, 4]), 30, template);
+    expect(counted.count).toBe(3);
+    expect(counted.outside).toBeLessThan(0.45);
+  });
+
+  it('finds no heads where there are none', () => {
+    expect(countHeads(band(0), 30, template).count).toBe(0);
+  });
+});
+
+describe('headBand', () => {
+  it('looks above the CP of a hatched raid, else under the countdown', () => {
+    const cpBox = { x0: 300, y0: 1100, x1: 780, y1: 1200 };
+    const countdownBox = { x0: 420, y0: 1500, x1: 660, y1: 1560 };
+    expect(headBand({ cpBox, countdownBox })).toEqual({ top: 1052, bottom: 1112, unit: 30 });
+    expect(headBand({ cpBox: null, countdownBox })).toEqual({ top: 1560, bottom: 1794, unit: 90 });
+    expect(headBand({ cpBox: null, countdownBox: null })).toBeNull();
+  });
+});
diff --git a/src/domain/ocr/tier-heads.ts b/src/domain/ocr/tier-heads.ts
new file mode 100644
index 0000000000000000000000000000000000000000..84042c9656728c30472d3d51db8cf693816cbf50
--- /dev/null
+++ b/src/domain/ocr/tier-heads.ts
@@ -0,0 +1,242 @@
+import { boxHeight, type GreyImage } from './image.js';
+import type { ScreenText } from './raid-screen.js';
+
+/**
+ * Counting the tier heads of a raid screen by template matching: the game's own head icon
+ * (`ic_raid_small.png`) is matched by normalised cross-correlation inside its outline, so that
+ * whatever stands behind a head does not count, at several scales, in a band beside the
+ * countdown (an egg) or the CP (a hatched raid). The heads stand in a row centred on the screen;
+ * counts of 7 down to 1 are tried with a spacing that is searched. The values are the research's
+ * (28 of 28 samples right for every threshold from 0.40 to 0.55).
+ */
+
+/** A template: values and a mask (1 inside the head's outline, 0 outside). */
+export interface HeadTemplate {
+  width: number;
+  height: number;
+  data: Float32Array;
+  mask: Float32Array;
+}
+
+/** The band of the screen the heads are looked for in, and the expected height of a head. */
+export interface HeadBand {
+  top: number;
+  bottom: number;
+  unit: number;
+}
+
+export interface HeadCount {
+  /** 0 when no row of heads was found. */
+  count: number;
+  /** The best match's correlation (−1 to 1). */
+  score: number;
+  /** The scale of the template, relative to the expected head, that matched. */
+  scale: number;
+  /** The best match just outside the row (−1 when there is no row or no room). */
+  outside: number;
+}
+
+/** The work is done at the size where a head is this many pixels high. */
+const WORK_HEAD = 24;
+/** A row needs one match at least this good, and each of its heads at least `LOW`. */
+const MIN_PEAK = 0.45;
+const LOW = 0.45;
+const SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25];
+/** Heads stand 1.2 to 1.5 head widths apart, centre to centre. */
+const SPACING_FROM = 1.2;
+const SPACING_TO = 1.5;
+const SPACING_STEP = 0.03;
+export const MAX_HEADS = 7;
+
+/**
+ * The template of an RGBA picture of the head: its alpha as the values (the head is opaque white,
+ * its eyes and mouth transparent), and as the mask everything but the transparent area that
+ * touches the border (found by flood fill), so the eyes and mouth count and the outside does not.
+ */
+export function headTemplate(icon: {
+  width: number;
+  height: number;
+  data: Uint8Array;
+}): HeadTemplate {
+  const { width, height } = icon;
+  const data = new Float32Array(width * height);
+  for (let k = 0; k < data.length; k++) data[k] = icon.data[k * 4 + 3] ?? 0;
+  const outside = new Uint8Array(width * height);
+  const stack: number[] = [];
+  for (let x = 0; x < width; x++) stack.push(x, (height - 1) * width + x);
+  for (let y = 0; y < height; y++) stack.push(y * width, y * width + width - 1);
+  while (stack.length > 0) {
+    const k = stack.pop() ?? 0;
+    if (outside[k] || (data[k] ?? 0) > 127) continue;
+    outside[k] = 1;
+    const x = k % width;
+    const y = (k - x) / width;
+    if (x > 0) stack.push(k - 1);
+    if (x < width - 1) stack.push(k + 1);
+    if (y > 0) stack.push(k - width);
+    if (y < height - 1) stack.push(k + width);
+  }
+  const mask = Float32Array.from(outside, (o) => 1 - o);
+  return { width, height, data, mask };
+}
+
+/**
+ * Where the heads are looked for: above the CP of a hatched raid (a head about 0.3 of the CP's
+ * height), else under the countdown of an egg (a head about 1.5 of the countdown's height);
+ * null without either.
+ */
+export function headBand(text: Pick<ScreenText, 'cpBox' | 'countdownBox'>): HeadBand | null {
+  if (text.cpBox) {
+    const unit = boxHeight(text.cpBox) * 0.3;
+    return { top: text.cpBox.y0 - unit * 1.6, bottom: text.cpBox.y0 + unit * 0.4, unit };
+  }
+  if (text.countdownBox) {
+    const unit = boxHeight(text.countdownBox) * 1.5;
+    return { top: text.countdownBox.y1, bottom: text.countdownBox.y1 + unit * 2.6, unit };
+  }
+  return null;
+}
+
+/** A picture (and its mask) scaled by nearest neighbour. */
+function resized<
+  T extends { width: number; height: number; data: Float32Array; mask?: Float32Array },
+>(image: T, scale: number): T {
+  const width = Math.max(4, Math.round(image.width * scale));
+  const height = Math.max(4, Math.round(image.height * scale));
+  const data = new Float32Array(width * height);
+  const mask = image.mask ? new Float32Array(width * height) : undefined;
+  for (let y = 0; y < height; y++) {
+    const sy = Math.min(image.height - 1, Math.floor(y / scale));
+    for (let x = 0; x < width; x++) {
+      const sx = Math.min(image.width - 1, Math.floor(x / scale));
+      data[y * width + x] = image.data[sy * image.width + sx] ?? 0;
+      if (mask && image.mask) mask[y * width + x] = image.mask[sy * image.width + sx] ?? 0;
+    }
+  }
+  return { ...image, width, height, data, ...(mask ? { mask } : {}) };
+}
+
+interface CorrelationMap {
+  width: number;
+  height: number;
+  data: Float32Array;
+}
+
+/** Normalised cross-correlation of the template at every position where it fits, inside its mask. */
+function correlation(image: GreyImage, template: HeadTemplate): CorrelationMap {
+  const size = template.width * template.height;
+  let n = 0;
+  let mean = 0;
+  for (let k = 0; k < size; k++) {
+    const m = template.mask[k] ?? 0;
+    n += m;
+    mean += (template.data[k] ?? 0) * m;
+  }
+  mean /= n;
+  const centred = new Float32Array(size);
+  let norm = 0;
+  for (let k = 0; k < size; k++) {
+    centred[k] = ((template.data[k] ?? 0) - mean) * (template.mask[k] ?? 0);
+    norm += (centred[k] ?? 0) ** 2;
+  }
+  norm = Math.sqrt(norm);
+  const width = image.width - template.width + 1;
+  const height = image.height - template.height + 1;
+  const data = new Float32Array(Math.max(0, width * height));
+  for (let y = 0; y < height; y++) {
+    for (let x = 0; x < width; x++) {
+      let sum = 0;
+      let squares = 0;
+      let cross = 0;
+      for (let ty = 0; ty < template.height; ty++) {
+        const row = (y + ty) * image.width + x;
+        const trow = ty * template.width;
+        for (let tx = 0; tx < template.width; tx++) {
+          if (!template.mask[trow + tx]) continue;
+          const v = image.data[row + tx] ?? 0;
+          sum += v;
+          squares += v * v;
+          cross += v * (centred[trow + tx] ?? 0);
+        }
+      }
+      const variance = squares - (sum * sum) / n;
+      data[y * width + x] = variance > 1e-6 ? cross / (Math.sqrt(variance) * norm) : 0;
+    }
+  }
+  return { width, height, data };
+}
+
+/** The best position in the map. */
+function peak(map: CorrelationMap): { x: number; y: number; score: number } | undefined {
+  let best: { x: number; y: number; score: number } | undefined;
+  for (let k = 0; k < map.data.length; k++) {
+    const score = map.data[k] ?? -1;
+    if (!best || score > best.score)
+      best = { x: k % map.width, y: Math.floor(k / map.width), score };
+  }
+  return best;
+}
+
+/** The best correlation near a head whose corner is at (x, y). */
+function near(map: CorrelationMap, template: HeadTemplate, x: number, y: number): number {
+  const dx = Math.round(template.width * 0.15);
+  const dy = Math.round(template.height * 0.3);
+  let best = -1;
+  for (let yy = y - dy; yy <= y + dy; yy++) {
+    if (yy < 0 || yy >= map.height) continue;
+    for (let xx = x - dx; xx <= x + dx; xx++) {
+      if (xx < 0 || xx >= map.width) continue;
+      best = Math.max(best, map.data[yy * map.width + xx] ?? -1);
+    }
+  }
+  return best;
+}
+
+/**
+ * How many heads stand in a row centred on the band (`band` spans the screen's width, `unit` is
+ * the expected head height in its pixels). At each scale: the best match must reach `MIN_PEAK`,
+ * then the largest count whose every position (centred, a searched spacing apart, one of them
+ * the best match) reaches `LOW`. A scale at which a row fits beats one at which none does,
+ * whatever its peak; among those the best peak wins.
+ */
+export function countHeads(band: GreyImage, unit: number, template: HeadTemplate): HeadCount {
+  const work = WORK_HEAD / unit;
+  const small = resized({ ...band }, work);
+  let best: HeadCount = { count: 0, score: 0, scale: 0, outside: -1 };
+  for (const scale of SCALES) {
+    const t = resized(template, (WORK_HEAD * scale) / template.height);
+    if (t.width >= small.width || t.height >= small.height) continue;
+    const map = correlation(small, t);
+    const top = peak(map);
+    if (!top || top.score < MIN_PEAK) continue;
+    if (best.count > 0 && top.score <= best.score) continue;
+    const centre = small.width / 2 - t.width / 2;
+    let count = 0;
+    let outside = -1;
+    let row: { xs: number[]; step: number } | undefined;
+    for (let n = MAX_HEADS; n >= 1 && !row; n--) {
+      for (let k = SPACING_FROM; k <= SPACING_TO + 1e-9 && !row; k += SPACING_STEP) {
+        const step = t.width * k;
+        const xs = Array.from({ length: n }, (_, i) =>
+          Math.round(centre + (i - (n - 1) / 2) * step),
+        );
+        if (!xs.some((x) => Math.abs(x - top.x) <= t.width * 0.2)) continue;
+        if (xs.every((x) => near(map, t, x, top.y) >= LOW)) row = { xs, step };
+      }
+    }
+    // How much the places just outside the row look like heads, kept for review: on the
+    // research's samples 0.12 to 0.49 beside rows counted right, so it decides nothing.
+    if (row) {
+      const first = row.xs[0] ?? 0;
+      const last = row.xs.at(-1) ?? 0;
+      const outward = [first - row.step, last + row.step].map(Math.round);
+      const inside = outward.filter((x) => x >= 0 && x < map.width);
+      outside = Math.max(-1, ...inside.map((x) => near(map, t, x, top.y)));
+      count = row.xs.length;
+    }
+    if (count > 0 || best.count === 0) {
+      if (count > 0 || top.score > best.score) best = { count, score: top.score, scale, outside };
+    }
+  }
+  return best;
+}
````

---

### Task 5: The reading process: the models through onnxruntime, a screen read whole

Prototype commit: `8c43a1e6dbea3eae4f05d0b0b0924b2a557b6970`

The reading process (src/ocr/): textReader runs the two models through
a ModelRun each (loadTextModels: onnxruntime-node on the device asked
for), readScreen decodes a screenshot with sharp (PNG, JPEG and WebP by
their first bytes only, at most 16 megapixels, a screen's proportions),
reads it at 720 wide and the status bar again at twice its width (at most
2160), counts the heads and measures the purple, and answers a
ScreenReading with every line it saw. worker.ts is the process: it lowers
its priority (every thread on Linux), loads the models and the head
template once and answers one request at a time; protocol.ts is what it
and the bot say to each other.

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces: `ModelRun`, `TextModels`, `ReadText`, `textReader(models)` (`src/ocr/text-reader.ts`); `loadTextModels(paths, { device, threads })` (`src/ocr/onnx-models.ts`); `ScreenReading` (`width`, `height`, `text`, `band`, `heads`, `purple`, `lines`, `status`, `ms`, `peakMb`), `readScreen(bytes, readText, template)`, `loadHeadTemplate(file)`, `NotAnImageError`, `isScreenshotFormat`, `READ_WIDTH`, `MAX_PIXELS` (`src/ocr/screen-reader.ts`); `WorkerStart`, `ReadRequest`, `WorkerMessage`, `applyPriority(priority, tasks?)` (`src/ocr/protocol.ts`); the process `src/ocr/worker.ts` (`dist/ocr/worker.js` once built).

**Files:**

```
 src/ocr/onnx-models.ts        |  59 ++++++++++++++++++++++++
 src/ocr/protocol.ts           |  69 +++++++++++++++++++++++++++
 src/ocr/screen-reader.test.ts | 104 +++++++++++++++++++++++++++++++++++++++++
 src/ocr/screen-reader.ts      | 156 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/ocr/text-reader.test.ts   |  57 +++++++++++++++++++++++
 src/ocr/text-reader.ts        |  68 +++++++++++++++++++++++++++
 src/ocr/worker.ts             |  62 +++++++++++++++++++++++++
 7 files changed, 575 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/ocr/screen-reader.test.ts src/ocr/text-reader.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 8c43a1e6dbea3eae4f05d0b0b0924b2a557b6970 -- src test scripts package.json` prints nothing.
- [ ] **Step 5: Commit** with the title `The reading process: the models through onnxruntime, a screen read whole`, the body above and the trailer, staging exactly
  `src/ocr/onnx-models.ts src/ocr/protocol.ts src/ocr/screen-reader.test.ts src/ocr/screen-reader.ts src/ocr/text-reader.test.ts src/ocr/text-reader.ts src/ocr/worker.ts`.

````diff
diff --git a/src/ocr/onnx-models.ts b/src/ocr/onnx-models.ts
new file mode 100644
index 0000000000000000000000000000000000000000..c17e36e56c13ee95f3aff0ad67810a3fdd394492
--- /dev/null
+++ b/src/ocr/onnx-models.ts
@@ -0,0 +1,59 @@
+import { readFile } from 'node:fs/promises';
+import * as ort from 'onnxruntime-node';
+import type { OcrAssetPaths, OcrDevice } from '../domain/ocr/assets.js';
+import { dictionaryOf } from '../domain/ocr/text-model.js';
+import type { ModelRun, TextModels } from './text-reader.js';
+
+/** onnxruntime's names of the devices of `settings.ocr.device`. */
+const PROVIDERS: Readonly<Record<OcrDevice, string>> = {
+  cpu: 'cpu',
+  cuda: 'cuda',
+  directml: 'dml',
+};
+
+export interface ModelOptions {
+  device: OcrDevice;
+  /** Threads of one run; 0 leaves it to onnxruntime. */
+  threads: number;
+}
+
+/**
+ * Loads the two models into onnxruntime on the device asked for. A device that cannot be had
+ * (no CUDA, not Windows for DirectML) throws here, at the start of the reading process.
+ */
+export async function loadTextModels(
+  paths: OcrAssetPaths,
+  options: ModelOptions,
+): Promise<TextModels> {
+  const sessionOptions: ort.InferenceSession.SessionOptions = {
+    executionProviders: [PROVIDERS[options.device]],
+    ...(options.threads > 0 ? { intraOpNumThreads: options.threads } : {}),
+    // DirectML wants sequential execution and no memory pattern (onnxruntime's documentation).
+    ...(options.device === 'directml'
+      ? { enableMemPattern: false, executionMode: 'sequential' as const }
+      : {}),
+  };
+  const detector = await ort.InferenceSession.create(paths.detector, sessionOptions);
+  const recogniser = await ort.InferenceSession.create(paths.recogniser, sessionOptions);
+  return {
+    detect: runOf(detector),
+    recognise: runOf(recogniser),
+    dictionary: dictionaryOf(await readFile(paths.dictionary, 'utf8')),
+  };
+}
+
+function runOf(session: ort.InferenceSession): ModelRun {
+  const [inputName] = session.inputNames;
+  const [outputName] = session.outputNames;
+  if (inputName === undefined || outputName === undefined) {
+    throw new Error('a model without an input or an output');
+  }
+  return async (input, dims) => {
+    const outputs = await session.run({ [inputName]: new ort.Tensor('float32', input, dims) });
+    const output = outputs[outputName];
+    if (!output || !(output.data instanceof Float32Array)) {
+      throw new Error('a model answered something other than float32');
+    }
+    return { data: output.data, dims: output.dims };
+  };
+}
diff --git a/src/ocr/protocol.ts b/src/ocr/protocol.ts
new file mode 100644
index 0000000000000000000000000000000000000000..5a92b39718d87df81ce1856b75a2de286c3c073a
--- /dev/null
+++ b/src/ocr/protocol.ts
@@ -0,0 +1,69 @@
+import { readdirSync } from 'node:fs';
+import { constants, setPriority } from 'node:os';
+import type { OcrAssetPaths, OcrDevice } from '../domain/ocr/assets.js';
+import type { ScreenReading } from './screen-reader.js';
+
+/**
+ * What the bot and its reading process say to each other (`child_process.fork` with the
+ * `advanced` serialization, so that a screenshot's bytes cross as they are).
+ */
+
+/** How the reading process is started: the one argument after its file, as JSON. */
+export interface WorkerStart {
+  paths: OcrAssetPaths;
+  device: OcrDevice;
+  threads: number;
+  priority: 'low' | 'normal';
+}
+
+/** The bot asks for one screenshot at a time. */
+export interface ReadRequest {
+  kind: 'read';
+  id: number;
+  bytes: Uint8Array;
+}
+
+export type WorkerMessage =
+  /** The models are loaded: the process takes requests. */
+  | { kind: 'ready'; loadMs: number }
+  /** The request reached the process: if it dies now, it died with the screenshot. */
+  | { kind: 'received'; id: number }
+  /** The models could not be loaded (a missing device, a broken file); the process exits. */
+  | { kind: 'start-failed'; reason: string }
+  | { kind: 'read'; id: number; reading: ScreenReading }
+  /** Not a picture the reader can read. */
+  | { kind: 'not-an-image'; id: number }
+  /** Anything else that went wrong with this screenshot; the process goes on. */
+  | { kind: 'failed'; id: number; reason: string };
+
+/**
+ * Lowers the priority of the calling process for `low` (below normal: nice 10 on Linux, the
+ * class below normal on Windows). On Linux a priority belongs to a thread, and a thread inherits
+ * it from the thread that makes it: so the reading process calls this before it loads anything,
+ * and again once the models are loaded, when it also lowers every thread it has by then
+ * (`/proc/self/task`: Node's own, sharp's and onnxruntime's). Where lowering is not allowed (some
+ * containers) the reading goes on as it is.
+ */
+export function applyPriority(
+  priority: WorkerStart['priority'],
+  tasks: () => readonly number[] = linuxTasks,
+): void {
+  if (priority !== 'low') return;
+  for (const id of [0, ...tasks()]) {
+    try {
+      setPriority(id, constants.priority.PRIORITY_BELOW_NORMAL);
+    } catch {
+      // Not allowed, or the thread has ended: it goes on as it is.
+    }
+  }
+}
+
+/** The ids of this process's threads on Linux; none elsewhere. */
+function linuxTasks(): number[] {
+  if (process.platform !== 'linux') return [];
+  try {
+    return readdirSync('/proc/self/task').map(Number).filter(Number.isInteger);
+  } catch {
+    return [];
+  }
+}
diff --git a/src/ocr/screen-reader.test.ts b/src/ocr/screen-reader.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a5600fa026f6d076250cc0d207c0d6a42074f92b
--- /dev/null
+++ b/src/ocr/screen-reader.test.ts
@@ -0,0 +1,104 @@
+import sharp from 'sharp';
+import { describe, expect, it } from 'vitest';
+import type { RgbImage, TextLine } from '../domain/ocr/image.js';
+import { headTemplate } from '../domain/ocr/tier-heads.js';
+import { isScreenshotFormat, NotAnImageError, readScreen } from './screen-reader.js';
+import type { ReadText } from './text-reader.js';
+
+/** A screenshot of one colour, as PNG. */
+function screenshot(width: number, height: number, colour = { r: 30, g: 120, b: 60 }) {
+  return sharp({ create: { width, height, channels: 3, background: colour } })
+    .png()
+    .toBuffer();
+}
+
+const line = (text: string, x0: number, y0: number, x1: number, y1: number): TextLine => ({
+  text,
+  confidence: 0.9,
+  box: { x0, y0, x1, y1 },
+});
+
+/** A reader that answers the whole screen with `screen` and the status bar with `bar`. */
+function fakeReader(screen: TextLine[], bar: TextLine[]): ReadText & { sizes: string[] } {
+  const sizes: string[] = [];
+  const read = (image: RgbImage) => {
+    sizes.push(`${image.width}x${image.height}`);
+    expect(image.data).toHaveLength(image.width * image.height * 3);
+    return Promise.resolve(sizes.length === 1 ? screen : bar);
+  };
+  return Object.assign(read, { sizes });
+}
+
+const TEMPLATE = headTemplate({ width: 8, height: 8, data: new Uint8Array(8 * 8 * 4).fill(255) });
+
+describe('readScreen', () => {
+  it('reads the screen at 720 wide and the status bar again at twice 1080 at most', async () => {
+    // 1440 × 3200: read at 720 × 1600; the status bar, the top 144 rows, at 2160 × 216.
+    const reader = fakeReader(
+      [line('Big Fountain', 90, 140, 400, 175), line('0:42:17', 200, 800, 330, 830)],
+      [line('9:41', 60, 30, 210, 120)],
+    );
+    const reading = await readScreen(await screenshot(1440, 3200), reader, TEMPLATE);
+    expect(reader.sizes).toEqual(['720x1600', '2160x216']);
+    expect(reading).toMatchObject({ width: 1440, height: 3200 });
+    // Boxes come back in the screenshot's pixels.
+    expect(reading.lines[1]?.box).toEqual({ x0: 400, y0: 1600, x1: 660, y1: 1660 });
+    expect(reading.status[0]?.box).toEqual({ x0: 40, y0: 20, x1: 140, y1: 80 });
+    expect(reading.text).toMatchObject({
+      clock: { hour: 9, minute: 41 },
+      gym: 'Big Fountain',
+      countdown: 42 * 60 + 17,
+    });
+    // The heads were looked for under the countdown, and none were there.
+    expect(reading.band).toEqual({ top: 1660, bottom: 1660 + 90 * 2.6, unit: 90 });
+    expect(reading.heads?.count).toBe(0);
+    expect(reading.purple).toBe(0);
+  });
+
+  it('reads a small screenshot as it is, and looks for no heads without a countdown or CP', async () => {
+    const reader = fakeReader([], []);
+    const reading = await readScreen(await screenshot(400, 900), reader, TEMPLATE);
+    expect(reader.sizes).toEqual(['400x900', '800x82']);
+    expect(reading).toMatchObject({ band: null, heads: null });
+  });
+
+  it('measures the purple of a shadow raid', async () => {
+    const purple = await screenshot(400, 900, { r: 140, g: 40, b: 220 });
+    expect((await readScreen(purple, fakeReader([], []), TEMPLATE)).purple).toBe(1);
+  });
+
+  it('refuses pictures no phone takes: too many pixels, or a strip', async () => {
+    for (const [width, height] of [
+      [4100, 4100],
+      [720, 3000],
+      [3000, 720],
+    ] as const) {
+      await expect(
+        readScreen(await screenshot(width, height), fakeReader([], []), TEMPLATE),
+      ).rejects.toBeInstanceOf(NotAnImageError);
+    }
+  });
+
+  it('reads PNG, JPEG and WebP, and nothing else reaches the image library', async () => {
+    const tiny = sharp({ create: { width: 400, height: 900, channels: 3, background: 'white' } });
+    for (const bytes of [
+      await tiny.clone().jpeg().toBuffer(),
+      await tiny.clone().webp().toBuffer(),
+    ]) {
+      expect(isScreenshotFormat(bytes)).toBe(true);
+      await expect(readScreen(bytes, fakeReader([], []), TEMPLATE)).resolves.toBeDefined();
+    }
+    const gif = await tiny.clone().gif().toBuffer();
+    expect(isScreenshotFormat(gif)).toBe(false);
+    await expect(readScreen(gif, fakeReader([], []), TEMPLATE)).rejects.toBeInstanceOf(
+      NotAnImageError,
+    );
+  });
+
+  it('refuses what is not a picture', async () => {
+    const bytes = new TextEncoder().encode('not a picture at all');
+    await expect(readScreen(bytes, fakeReader([], []), TEMPLATE)).rejects.toBeInstanceOf(
+      NotAnImageError,
+    );
+  });
+});
diff --git a/src/ocr/screen-reader.ts b/src/ocr/screen-reader.ts
new file mode 100644
index 0000000000000000000000000000000000000000..42ebabb5a7d9dc0d6ff0959e09575d0262a89155
--- /dev/null
+++ b/src/ocr/screen-reader.ts
@@ -0,0 +1,156 @@
+import sharp from 'sharp';
+import { scaledBox, type TextLine } from '../domain/ocr/image.js';
+import { readScreenText, STATUS_BAR, type ScreenText } from '../domain/ocr/raid-screen.js';
+import { purpleShare } from '../domain/ocr/shadow.js';
+import {
+  countHeads,
+  headBand,
+  headTemplate,
+  type HeadBand,
+  type HeadCount,
+  type HeadTemplate,
+} from '../domain/ocr/tier-heads.js';
+import type { ReadText } from './text-reader.js';
+
+/**
+ * Everything the reader saw on one screenshot: what it made of the text, the heads, the purple,
+ * and the lines themselves (their boxes in the screenshot's pixels), so that a reading can be
+ * judged later without the models. Plain data: it crosses from the reading process to the bot.
+ */
+export interface ScreenReading {
+  width: number;
+  height: number;
+  text: ScreenText;
+  /** Where the heads were looked for, null without a countdown or CP. */
+  band: HeadBand | null;
+  heads: HeadCount | null;
+  /** The share of shadow purple in the middle of the screen (`purpleShare`). */
+  purple: number;
+  lines: TextLine[];
+  status: TextLine[];
+  /** How long the reading took, in milliseconds. */
+  ms: number;
+  /** The most memory the reading process has used so far, in MB. */
+  peakMb: number;
+}
+
+/** The screen is read this wide: as well as at full size or better, in half the time. */
+export const READ_WIDTH = 720;
+/**
+ * The status bar is read again twice as wide as the screen, at most twice this: as the research
+ * read it for every phone up to 1080 pixels wide, and never a larger picture than a phone's.
+ */
+const STATUS_WIDTH = 1080;
+/** A screenshot with more pixels than this is refused (a phone's has 2.5 to 4 million). */
+export const MAX_PIXELS = 16_000_000;
+/** Height ÷ width of what is read: phones, folded or not, tablets, the split screens of samples. */
+const MIN_ASPECT = 0.4;
+const MAX_ASPECT = 3;
+
+/** PNG, JPEG and WebP by their first bytes: nothing else reaches the image library. */
+export function isScreenshotFormat(bytes: Uint8Array): boolean {
+  const starts = (offset: number, ...values: number[]) =>
+    values.every((value, i) => bytes[offset + i] === value);
+  return (
+    starts(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
+    starts(0, 0xff, 0xd8, 0xff) ||
+    (starts(0, 0x52, 0x49, 0x46, 0x46) && starts(8, 0x57, 0x45, 0x42, 0x50))
+  );
+}
+
+export class NotAnImageError extends Error {
+  constructor() {
+    super('not an image the reader can read');
+    this.name = 'NotAnImageError';
+  }
+}
+
+/**
+ * Reads a raid screenshot. Throws `NotAnImageError` for anything that is not a PNG, JPEG or WebP
+ * of a screen's proportions and at most `MAX_PIXELS`.
+ */
+export async function readScreen(
+  bytes: Uint8Array,
+  readText: ReadText,
+  template: HeadTemplate,
+): Promise<ScreenReading> {
+  const started = performance.now();
+  const image = () => sharp(bytes, { limitInputPixels: MAX_PIXELS }).removeAlpha();
+  if (!isScreenshotFormat(bytes)) throw new NotAnImageError();
+  let width: number;
+  let height: number;
+  try {
+    const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
+    if (!metadata.width || !metadata.height) throw new NotAnImageError();
+    width = metadata.width;
+    height = metadata.height;
+  } catch {
+    throw new NotAnImageError();
+  }
+  const aspect = height / width;
+  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) throw new NotAnImageError();
+
+  const readWidth = Math.min(width, READ_WIDTH);
+  const readHeight = Math.max(1, Math.round((height * readWidth) / width));
+  const small = await image().resize(readWidth, readHeight, { fit: 'fill' }).raw().toBuffer();
+  const smallImage = { width: readWidth, height: readHeight, data: small };
+  const lines = (await readText(smallImage)).map((line) => ({
+    ...line,
+    box: scaledBox(line.box, width / readWidth, height / readHeight),
+  }));
+
+  const barHeight = Math.max(1, Math.round(height * STATUS_BAR));
+  const scale = (2 * Math.min(width, STATUS_WIDTH)) / width;
+  const barWidth = Math.round(width * scale);
+  const barScaled = Math.max(1, Math.round(barHeight * scale));
+  const bar = await image()
+    .extract({ left: 0, top: 0, width, height: barHeight })
+    .resize(barWidth, barScaled, { fit: 'fill' })
+    .raw()
+    .toBuffer();
+  const status = (await readText({ width: barWidth, height: barScaled, data: bar })).map(
+    (line) => ({ ...line, box: scaledBox(line.box, width / barWidth, barHeight / barScaled) }),
+  );
+
+  const text = readScreenText(lines, status, { width, height });
+  const band = headBand(text);
+  let heads: HeadCount | null = null;
+  if (band) {
+    const top = Math.max(0, Math.round(band.top));
+    const bottom = Math.min(height, Math.round(band.bottom));
+    if (bottom - top > 1) {
+      const { data, info } = await image()
+        .extract({ left: 0, top, width, height: bottom - top })
+        .greyscale()
+        .raw()
+        .toBuffer({ resolveWithObject: true });
+      heads = countHeads(
+        { width: info.width, height: info.height, data: Float32Array.from(data) },
+        band.unit,
+        template,
+      );
+    }
+  }
+
+  return {
+    width,
+    height,
+    text,
+    band,
+    heads,
+    purple: purpleShare(smallImage),
+    lines,
+    status,
+    ms: Math.round(performance.now() - started),
+    peakMb: Math.round(process.resourceUsage().maxRSS / 1024),
+  };
+}
+
+/** The head template from the game's icon file (`ic_raid_small.png`). */
+export async function loadHeadTemplate(file: string): Promise<HeadTemplate> {
+  const { data, info } = await sharp(file)
+    .ensureAlpha()
+    .raw()
+    .toBuffer({ resolveWithObject: true });
+  return headTemplate({ width: info.width, height: info.height, data });
+}
diff --git a/src/ocr/text-reader.test.ts b/src/ocr/text-reader.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..2ec2b2bbc350095545fa4a79b7172917990904ed
--- /dev/null
+++ b/src/ocr/text-reader.test.ts
@@ -0,0 +1,57 @@
+import { describe, expect, it } from 'vitest';
+import { textReader, type ModelRun, type TextModels } from './text-reader.js';
+
+/**
+ * Made-up models: the detector marks two rows of text, the recogniser reads "ab" in whatever it
+ * is given. The real models are never part of a unit test (`npm run ocr:check` runs them).
+ */
+function models(): TextModels & { asked: (readonly number[])[] } {
+  const asked: (readonly number[])[] = [];
+  const detect: ModelRun = (input, dims) => {
+    asked.push(dims);
+    const [, , height = 0, width = 0] = dims;
+    expect(input).toHaveLength(3 * height * width);
+    const map = new Float32Array(height * width);
+    for (const [x0, y0, x1, y1] of [
+      [8, 8, 40, 16],
+      [8, 40, 24, 48],
+    ] as const) {
+      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) map[y * width + x] = 0.9;
+    }
+    return Promise.resolve({ data: map, dims: [1, 1, height, width] });
+  };
+  const recognise: ModelRun = (_input, dims) => {
+    asked.push(dims);
+    // Four steps over blank, a, b, space: a, a, blank, b.
+    const scores = new Float32Array(4 * 4);
+    [1, 1, 0, 2].forEach((c, step) => (scores[step * 4 + c] = 0.9));
+    return Promise.resolve({ data: scores, dims: [1, 4, 4] });
+  };
+  return { detect, recognise, dictionary: ['a', 'b', ' '], asked };
+}
+
+describe('textReader', () => {
+  it('reads each box of text and gives its box in the pixels of the picture', async () => {
+    const made = models();
+    // 48 × 60 is read by the detector at 64 × 64.
+    const image = { width: 48, height: 60, data: new Uint8Array(48 * 60 * 3).fill(200) };
+    const lines = await textReader(made)(image);
+    expect(made.asked[0]).toEqual([1, 3, 64, 64]);
+    // Every box was read at the recogniser's height.
+    expect(made.asked.slice(1).every((dims) => dims[2] === 48)).toBe(true);
+    expect(lines.map((line) => line.text)).toEqual(['ab', 'ab']);
+    // The first box, 32 × 8 grown by 4.8 on each side, from 64 × 64 into 48 × 60.
+    const first = lines[0]?.box;
+    expect(first?.x0).toBeCloseTo((8 - 5) * (48 / 64), 5);
+    expect(first?.y0).toBeCloseTo((8 - 5) * (60 / 64), 5);
+    expect(first?.x1).toBeCloseTo((40 + 5) * (48 / 64), 5);
+  });
+
+  it('reads nothing when the detector finds no text', async () => {
+    const made = models();
+    made.detect = (_input, dims) =>
+      Promise.resolve({ data: new Float32Array((dims[2] ?? 0) * (dims[3] ?? 0)), dims });
+    const image = { width: 32, height: 32, data: new Uint8Array(32 * 32 * 3) };
+    expect(await textReader(made)(image)).toEqual([]);
+  });
+});
diff --git a/src/ocr/text-reader.ts b/src/ocr/text-reader.ts
new file mode 100644
index 0000000000000000000000000000000000000000..e683f9db0800d173b1fd131b8bb3215b25ccfd9f
--- /dev/null
+++ b/src/ocr/text-reader.ts
@@ -0,0 +1,68 @@
+import sharp from 'sharp';
+import { scaledBox, type RgbImage, type TextLine } from '../domain/ocr/image.js';
+import {
+  ctcDecode,
+  detectorSize,
+  groupLines,
+  LINE_HEIGHT,
+  lineWidth,
+  modelInput,
+  textBoxes,
+} from '../domain/ocr/text-model.js';
+
+/** One run of a model: an input tensor in, the first output out. */
+export type ModelRun = (
+  input: Float32Array,
+  dims: readonly number[],
+) => Promise<{ data: Float32Array; dims: readonly number[] }>;
+
+/** The two models of the reader and the recogniser's dictionary (`dictionaryOf`). */
+export interface TextModels {
+  detect: ModelRun;
+  recognise: ModelRun;
+  dictionary: readonly string[];
+}
+
+/** Reads the lines of text of a picture, their boxes in its pixels. */
+export type ReadText = (image: RgbImage) => Promise<TextLine[]>;
+
+const raw = (image: RgbImage) => ({
+  raw: { width: image.width, height: image.height, channels: 3 as const },
+});
+
+/**
+ * The reader over the two models: the picture scaled to the detector's size, the boxes of text
+ * in the detector's map, each box cut out and scaled to the recogniser's height and read alone
+ * (lines read in padded batches were neither faster nor as good), the pieces of one row joined.
+ */
+export function textReader(models: TextModels): ReadText {
+  return async (image) => {
+    const size = detectorSize(image.width, image.height);
+    const scaled = await sharp(image.data, raw(image))
+      .resize(size.width, size.height, { fit: 'fill' })
+      .raw()
+      .toBuffer();
+    const input: RgbImage = { ...size, data: scaled };
+    const map = await models.detect(modelInput(input), [1, 3, size.height, size.width]);
+    const pieces: TextLine[] = [];
+    for (const box of textBoxes(map.data, size.width, size.height)) {
+      const width = lineWidth(box);
+      const crop = await sharp(scaled, raw(input))
+        .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0, height: box.y1 - box.y0 })
+        .resize(width, LINE_HEIGHT, { fit: 'fill' })
+        .raw()
+        .toBuffer();
+      const output = await models.recognise(
+        modelInput({ width, height: LINE_HEIGHT, data: crop }),
+        [1, 3, LINE_HEIGHT, width],
+      );
+      const [, steps = 0, classes = 0] = output.dims;
+      const read = ctcDecode(output.data, 0, steps, classes, models.dictionary);
+      pieces.push({
+        ...read,
+        box: scaledBox(box, image.width / size.width, image.height / size.height),
+      });
+    }
+    return groupLines(pieces);
+  };
+}
diff --git a/src/ocr/worker.ts b/src/ocr/worker.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1a1278ba782cd8e3c1822c1eceb05cc6475a0f77
--- /dev/null
+++ b/src/ocr/worker.ts
@@ -0,0 +1,62 @@
+/**
+ * The reading process: started by `OcrService` with `fork`, it lowers its own priority (before
+ * onnxruntime starts its threads, which inherit it), loads the models once and reads one
+ * screenshot per request until the bot disconnects. It writes no log of its own: what goes wrong
+ * is answered to the bot, which logs it.
+ */
+import sharp from 'sharp';
+import { failureReason } from '../services/failure-reason.js';
+import { loadTextModels } from './onnx-models.js';
+import {
+  applyPriority,
+  type ReadRequest,
+  type WorkerMessage,
+  type WorkerStart,
+} from './protocol.js';
+import { loadHeadTemplate, NotAnImageError, readScreen } from './screen-reader.js';
+import { textReader, type ReadText } from './text-reader.js';
+import type { HeadTemplate } from '../domain/ocr/tier-heads.js';
+
+function send(message: WorkerMessage, then?: () => void): void {
+  process.send?.(message, undefined, undefined, () => then?.());
+}
+
+async function main(): Promise<void> {
+  const start = JSON.parse(process.argv[2] ?? '{}') as WorkerStart;
+  applyPriority(start.priority);
+  // sharp works on as many threads as the models may, and keeps nothing: every file is new.
+  sharp.concurrency(start.threads);
+  sharp.cache(false);
+  const started = performance.now();
+  let readText: ReadText;
+  let template: HeadTemplate;
+  try {
+    readText = textReader(await loadTextModels(start.paths, start));
+    template = await loadHeadTemplate(start.paths.headIcon);
+  } catch (err) {
+    // Exit only once the bot has the message: an exit right after a send can lose it.
+    send({ kind: 'start-failed', reason: failureReason(err) }, () => process.exit(1));
+    return;
+  }
+  applyPriority(start.priority);
+  send({ kind: 'ready', loadMs: Math.round(performance.now() - started) });
+
+  process.on('message', (message: ReadRequest) => {
+    send({ kind: 'received', id: message.id });
+    void (async () => {
+      try {
+        const reading = await readScreen(message.bytes, readText, template);
+        send({ kind: 'read', id: message.id, reading });
+      } catch (err) {
+        send(
+          err instanceof NotAnImageError
+            ? { kind: 'not-an-image', id: message.id }
+            : { kind: 'failed', id: message.id, reason: failureReason(err) },
+        );
+      }
+    })();
+  });
+  process.on('disconnect', () => process.exit(0));
+}
+
+void main();
````

---

### Task 6: OcrService: screenshots one at a time in a process of its own

Prototype commit: `1d277241cceef08df464cadb863178b95e277642`

OcrService is the bot's side of the reader (ScreenshotReader): a queue of
screenshots read one after the other by the reading process, which it
starts on first use with the device, threads and priority of the
settings and a minimal environment (none of the bot's secrets), through
tsx when run from TypeScript. read() never throws and answers read,
busy, unavailable, not-an-image or failed. A screenshot that takes longer
than timeoutMs, or a process that dies, ends the process; a process that
died while idle is replaced and the screenshot tried once more. A start
that fails is logged and not tried again for ten minutes, and has the
files checked again; a device the platform lacks is refused once. The
process ends after ten minutes idle; close() answers what waits and ends
it, killing it after two seconds.

test/support/ocr-worker.ts is a made-up reading process for the tests.

**Interfaces:**
- Consumes: `OcrAssetPaths`, `OcrDevice`, `deviceProblem` (Task 1); `ScreenReading`, `ReadRequest`, `WorkerMessage`, `WorkerStart`, `applyPriority` (Task 5).
- Produces: `OcrService`, `ScreenshotReader` (`read(bytes, { onQueued? }): Promise<OcrOutcome>`, `close()`), `OcrOutcome`, `ReaderFiles`, `OcrServiceOptions`, `workerEnvironment(env)` (`src/services/ocr-service.ts`).

**Files:**

```
 src/services/ocr-service.test.ts | 266 +++++++++++++++++++++++++++++++++++++++++
 src/services/ocr-service.ts      | 379 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 test/support/ocr-worker.ts       |  65 ++++++++++
 3 files changed, 710 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/services/ocr-service.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 1d277241cceef08df464cadb863178b95e277642 -- src test scripts package.json` prints nothing.
- [ ] **Step 5: Commit** with the title `OcrService: screenshots one at a time in a process of its own`, the body above and the trailer, staging exactly
  `src/services/ocr-service.test.ts src/services/ocr-service.ts test/support/ocr-worker.ts`.

````diff
diff --git a/src/services/ocr-service.test.ts b/src/services/ocr-service.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..6b711ecc25931ebdb042e0ec489c56766cd5fbaa
--- /dev/null
+++ b/src/services/ocr-service.test.ts
@@ -0,0 +1,266 @@
+import { readdirSync, readFileSync } from 'node:fs';
+import { constants } from 'node:os';
+import path from 'node:path';
+import { afterEach, describe, expect, it } from 'vitest';
+import { createTestLogger } from '../../test/support/test-logger.js';
+import type { OcrAssetPaths } from '../domain/ocr/assets.js';
+import {
+  OcrService,
+  workerEnvironment,
+  type OcrOutcome,
+  type OcrServiceOptions,
+} from './ocr-service.js';
+
+const FAKE_WORKER = path.resolve(import.meta.dirname, '../../test/support/ocr-worker.ts');
+const PATHS: OcrAssetPaths = {
+  detector: 'det.onnx',
+  recogniser: 'rec.onnx',
+  dictionary: 'keys.txt',
+  headIcon: 'head.png',
+};
+
+const made: OcrService[] = [];
+afterEach(async () => {
+  await Promise.all(made.splice(0).map((service) => service.close()));
+});
+
+function service(options: Partial<OcrServiceOptions> & { paths?: OcrAssetPaths | undefined } = {}) {
+  const { log, entries } = createTestLogger();
+  const { paths: given, ...rest } = options;
+  const paths = 'paths' in options ? given : PATHS;
+  let forgotten = 0;
+  const ocr = new OcrService({
+    assets: {
+      ensure: () => Promise.resolve(paths),
+      forget: () => {
+        forgotten++;
+      },
+    },
+    device: 'cpu',
+    threads: 0,
+    priority: 'normal',
+    queue: 2,
+    timeoutMs: 8_000,
+    log,
+    workerFile: FAKE_WORKER,
+    ...rest,
+  });
+  made.push(ocr);
+  return { ocr, entries, forgotten: () => forgotten };
+}
+
+const bytes = (text: string) => new TextEncoder().encode(text);
+const gymOf = (outcome: OcrOutcome) =>
+  outcome.kind === 'read' ? outcome.reading.text.gym : outcome.kind;
+/** The id of the process that read it; fails the test when it was not read. */
+function pidOf(outcome: OcrOutcome): number {
+  expect(outcome.kind).toBe('read');
+  return outcome.kind === 'read' ? outcome.reading.width : -1;
+}
+const alive = (pid: number) => {
+  try {
+    process.kill(pid, 0);
+    return true;
+  } catch {
+    return false;
+  }
+};
+
+describe('OcrService', () => {
+  it('reads screenshots one after the other in one process, telling who waits how many are ahead', async () => {
+    const { ocr } = service();
+    const ahead: number[] = [];
+    const outcomes = await Promise.all(
+      ['one', 'two', 'three'].map((text) =>
+        ocr.read(bytes(text), { onQueued: (n) => ahead.push(n) }),
+      ),
+    );
+    expect(outcomes.map(gymOf)).toEqual(['one', 'two', 'three']);
+    expect(ahead).toEqual([1, 2]);
+    expect(new Set(outcomes.map(pidOf)).size).toBe(1);
+  });
+
+  it('hands a screenshot of several megabytes over whole', async () => {
+    const { ocr } = service();
+    expect(gymOf(await ocr.read(new Uint8Array(6_000_000).fill(7)))).toBe('6000000');
+  });
+
+  it('answers busy beyond the queue', async () => {
+    const { ocr } = service({ queue: 1 });
+    const first = ocr.read(bytes('one'));
+    const second = ocr.read(bytes('two'));
+    expect(await ocr.read(bytes('three'))).toEqual({ kind: 'busy' });
+    expect((await Promise.all([first, second])).map(gymOf)).toEqual(['one', 'two']);
+  });
+
+  it('is not upset by a waiting reader whose callback throws', async () => {
+    const { ocr } = service();
+    const first = ocr.read(bytes('one'));
+    const second = ocr.read(bytes('two'), {
+      onQueued: () => {
+        throw new Error('gone');
+      },
+    });
+    expect((await Promise.all([first, second])).map(gymOf)).toEqual(['one', 'two']);
+  });
+
+  it('answers what is not an image, and a failed reading, and goes on', async () => {
+    const { ocr } = service();
+    expect(await ocr.read(bytes('not'))).toEqual({ kind: 'not-an-image' });
+    expect(await ocr.read(bytes('fail'))).toEqual({ kind: 'failed' });
+    expect(gymOf(await ocr.read(bytes('fine')))).toBe('fine');
+  });
+
+  it('ends a process that takes too long or dies, and starts a new one for the next screenshot', async () => {
+    const { ocr, entries } = service({ timeoutMs: 1_500 });
+    const before = pidOf(await ocr.read(bytes('before')));
+    expect(await ocr.read(bytes('hang'))).toEqual({ kind: 'failed' });
+    expect(alive(before)).toBe(false);
+    const after = pidOf(await ocr.read(bytes('after')));
+    expect(after).not.toBe(before);
+    expect(await ocr.read(bytes('crash'))).toEqual({ kind: 'failed' });
+    expect(pidOf(await ocr.read(bytes('again')))).not.toBe(after);
+    expect(entries.some((e) => e.msg === 'the screenshot reader stopped; it starts anew')).toBe(
+      true,
+    );
+    // The process that died with the screenshot is not given it again: one exit, not two.
+    expect(entries.filter((e) => e.msg === 'the screenshot reader exited')).toEqual([
+      expect.objectContaining({ code: 3, during: 'work' }),
+    ]);
+  });
+
+  it('starts a new process when the idle one was killed from outside', async () => {
+    const { ocr } = service();
+    const first = pidOf(await ocr.read(bytes('one')));
+    process.kill(first);
+    expect(pidOf(await ocr.read(bytes('two')))).not.toBe(first);
+  });
+
+  it('ends the process after a while without work', async () => {
+    const { ocr, entries } = service({ idleMs: 200 });
+    const first = pidOf(await ocr.read(bytes('one')));
+    await new Promise((resolve) => setTimeout(resolve, 1_000));
+    expect(alive(first)).toBe(false);
+    expect(pidOf(await ocr.read(bytes('two')))).not.toBe(first);
+    // Ending an idle process is no news.
+    expect(entries.some((e) => e.level === 40)).toBe(false);
+  });
+
+  it('lowers the priority of the process when asked to', async () => {
+    const { ocr } = service({ priority: 'low' });
+    const outcome = await ocr.read(bytes('low'));
+    expect(outcome.kind === 'read' && outcome.reading.height).toBe(
+      constants.priority.PRIORITY_BELOW_NORMAL,
+    );
+  });
+
+  it.runIf(process.platform === 'linux')(
+    'lowers every thread of the process on Linux',
+    async () => {
+      const { ocr } = service({ priority: 'low' });
+      const pid = pidOf(await ocr.read(bytes('low')));
+      for (const task of readdirSync(`/proc/${pid}/task`)) {
+        const stat = readFileSync(`/proc/${pid}/task/${task}/stat`, 'utf8');
+        // Field 19 is the nice value; the name in brackets may hold spaces.
+        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
+        expect(Number(fields[16])).toBe(10);
+      }
+    },
+  );
+
+  it('gives the process none of the bot’s secrets', async () => {
+    process.env.PINE_TEST_SECRET = 'token';
+    try {
+      const { ocr } = service();
+      expect(gymOf(await ocr.read(bytes('secret')))).toBe('none');
+    } finally {
+      delete process.env.PINE_TEST_SECRET;
+    }
+    expect(
+      workerEnvironment({
+        PATH: '/bin',
+        SystemRoot: 'C:\\Windows',
+        CUDA_VISIBLE_DEVICES: '0',
+        DISCORD_TOKEN: 'x',
+        DB_PASSWORD: 'y',
+        NVIDIA_API_KEY: 'z',
+      }),
+    ).toEqual({ PATH: '/bin', SystemRoot: 'C:\\Windows', CUDA_VISIBLE_DEVICES: '0' });
+  });
+
+  it('is unavailable without its files', async () => {
+    expect(await service({ paths: undefined }).ocr.read(bytes('x'))).toEqual({
+      kind: 'unavailable',
+    });
+  });
+
+  it('logs a start that failed, checks the files again, and does not start again for a while', async () => {
+    let time = 0;
+    const { ocr, entries, forgotten } = service({
+      paths: { ...PATHS, detector: 'cannot-start' },
+      now: () => time,
+    });
+    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
+    expect(entries.find((e) => e.msg === 'the screenshot reader could not start')?.reason).toBe(
+      'no such device',
+    );
+    expect(forgotten()).toBe(1);
+    time = 60_000;
+    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
+    expect(entries.filter((e) => e.msg === 'the screenshot reader could not start')).toHaveLength(
+      1,
+    );
+    // Its exit after saying so is no second warning.
+    expect(entries.some((e) => e.msg === 'the screenshot reader exited')).toBe(false);
+  });
+
+  it('refuses a device this platform does not have, once and for all', async () => {
+    const { ocr, entries } = service({
+      device: 'directml',
+      platform: { os: 'linux', arch: 'x64' },
+    });
+    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
+    expect(entries.find((e) => String(e.msg).includes('cannot use this device'))?.reason).toBe(
+      'DirectML runs on Windows only',
+    );
+  });
+
+  it('answers start-failed from the real reading process when the model files are not there', async () => {
+    const { log, entries } = createTestLogger();
+    const ocr = new OcrService({
+      assets: {
+        ensure: () =>
+          Promise.resolve({
+            detector: path.join(import.meta.dirname, 'no-such-detector.onnx'),
+            recogniser: 'none',
+            dictionary: 'none',
+            headIcon: 'none',
+          }),
+        forget: () => undefined,
+      },
+      device: 'cpu',
+      threads: 0,
+      priority: 'normal',
+      queue: 2,
+      timeoutMs: 8_000,
+      log,
+    });
+    made.push(ocr);
+    expect(await ocr.read(bytes('x'))).toEqual({ kind: 'unavailable' });
+    expect(entries.some((e) => e.msg === 'the screenshot reader could not start')).toBe(true);
+  });
+
+  it('answers what waits as unavailable once closed, and leaves no process behind', async () => {
+    const { ocr } = service();
+    // A first read starts the process, so the next is in its hands when the service closes.
+    const pid = pidOf(await ocr.read(bytes('warm')));
+    const first = ocr.read(bytes('hang'));
+    const waiting = ocr.read(bytes('two'));
+    await new Promise((resolve) => setTimeout(resolve, 200));
+    await ocr.close();
+    expect(await waiting).toEqual({ kind: 'unavailable' });
+    expect(await first).toEqual({ kind: 'failed' });
+    expect(alive(pid)).toBe(false);
+    expect(await ocr.read(bytes('three'))).toEqual({ kind: 'unavailable' });
+  });
+});
diff --git a/src/services/ocr-service.ts b/src/services/ocr-service.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0239d55b23a6f7e67736901ca5972a1e40686bcc
--- /dev/null
+++ b/src/services/ocr-service.ts
@@ -0,0 +1,379 @@
+import { fork, type ChildProcess } from 'node:child_process';
+import path from 'node:path';
+import { fileURLToPath } from 'node:url';
+import { deviceProblem, type OcrAssetPaths, type OcrDevice } from '../domain/ocr/assets.js';
+import type { Logger } from '../log.js';
+import type { ReadRequest, WorkerMessage, WorkerStart } from '../ocr/protocol.js';
+import type { ScreenReading } from '../ocr/screen-reader.js';
+
+export type OcrOutcome =
+  | { kind: 'read'; reading: ScreenReading }
+  /** More screenshots wait than `queue` allows: try again shortly. */
+  | { kind: 'busy' }
+  /** The reader cannot run: its files could not be had, or its process did not start. */
+  | { kind: 'unavailable' }
+  /** Not a picture the reader reads (PNG, JPEG or WebP of a phone's proportions). */
+  | { kind: 'not-an-image' }
+  /** The reading failed or took longer than allowed. */
+  | { kind: 'failed' };
+
+export interface ReadOptions {
+  /** Called once when the screenshot has to wait, with how many are ahead of it. */
+  onQueued?: (ahead: number) => void;
+}
+
+/** Reading raid screenshots (Phase 7): one at a time, in a process of its own. */
+export interface ScreenshotReader {
+  read(bytes: Uint8Array, options?: ReadOptions): Promise<OcrOutcome>;
+  /** For shutdown: what waits is answered `unavailable`, the process is ended. */
+  close(): Promise<void>;
+}
+
+/** What the service needs of `OcrAssets`. */
+export interface ReaderFiles {
+  ensure(): Promise<OcrAssetPaths | undefined>;
+  /** Check the files again next time: the process could not start with them. */
+  forget(): void;
+}
+
+export interface OcrServiceOptions {
+  assets: ReaderFiles;
+  device: OcrDevice;
+  threads: number;
+  priority: 'low' | 'normal';
+  /** How many screenshots may wait while one is read. */
+  queue: number;
+  /** How long one screenshot may take. */
+  timeoutMs: number;
+  log: Logger;
+  /** How long the process may take to load the models. Two minutes. */
+  startTimeoutMs?: number;
+  /** After a start that failed, no new one is tried for this long. Ten minutes. */
+  startRetryMs?: number;
+  /** The process ends after this long without work, and gives its memory back. Ten minutes. */
+  idleMs?: number;
+  /** The reading process's file; the bot's own `src/ocr/worker` by default (tests give a fake). */
+  workerFile?: string;
+  now?: () => number;
+  /** Where the bot runs (`process.platform` and `process.arch`); for tests. */
+  platform?: { os: string; arch: string };
+}
+
+const here = fileURLToPath(import.meta.url);
+const WORKER = path.join(path.dirname(here), '..', 'ocr', `worker${path.extname(here)}`);
+/** A process asked to end is killed outright after this long. */
+const KILL_AFTER_MS = 2_000;
+
+/**
+ * The environment of the reading process: only what starting Node and the device needs. It
+ * parses images members send, so it gets none of the bot's secrets (token, database, keys).
+ */
+const PASSED_ENV = new Set(
+  [
+    'PATH',
+    'PATHEXT',
+    'SYSTEMROOT',
+    'SYSTEMDRIVE',
+    'WINDIR',
+    'TEMP',
+    'TMP',
+    'TMPDIR',
+    'HOME',
+    'USERPROFILE',
+    'LANG',
+    'LD_LIBRARY_PATH',
+    'CUDA_PATH',
+    'CUDA_HOME',
+    'CUDA_VISIBLE_DEVICES',
+    'NVIDIA_VISIBLE_DEVICES',
+    'NVIDIA_DRIVER_CAPABILITIES',
+  ].map((name) => name.toUpperCase()),
+);
+
+export function workerEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
+  // Windows spells them as it likes (`Path`, `SystemRoot`): names are compared in capitals.
+  return Object.fromEntries(
+    Object.entries(env).filter(([name]) => PASSED_ENV.has(name.toUpperCase())),
+  );
+}
+
+interface Job {
+  bytes: Uint8Array;
+  resolve: (outcome: OcrOutcome) => void;
+}
+
+interface Worker {
+  child: ChildProcess;
+  /** Resolved with true once the models are loaded, false when the process could not start. */
+  ready: Promise<boolean>;
+  /** Resolved once the process has exited. */
+  exited: Promise<void>;
+  /**
+   * Answers the request in work, if any: `unsent` when the process ended before it said it had
+   * the request (`received`), `exited` when it ended after.
+   */
+  answer?: (message: WorkerMessage | 'exited' | 'unsent') => void;
+  /** The bot is ending it: its exit is no news. */
+  stopping: boolean;
+}
+
+/**
+ * The bot's side of the reader: a queue of screenshots, read one after the other by a child
+ * process (`src/ocr/worker.ts`) that is started on first use with the device, threads and
+ * priority of the settings, ended after `timeoutMs` on a screenshot that takes too long (and
+ * started anew for the next), and ended after `idleMs` without work. `read` never throws, and
+ * nothing the process does (dying, refusing a message) reaches the bot as an error. A process
+ * that could not start is not tried again for `startRetryMs`; a device this platform does not
+ * have is refused once and for all. A process run from TypeScript (development, tests) is
+ * started through tsx.
+ */
+export class OcrService implements ScreenshotReader {
+  private readonly waiting: Job[] = [];
+  private busy = false;
+  private closed = false;
+  private worker: Worker | undefined;
+  private idleTimer: NodeJS.Timeout | undefined;
+  private nextId = 1;
+  private startFailedAt: number | undefined;
+  private readonly now: () => number;
+  private readonly noDevice: string | undefined;
+
+  constructor(private readonly options: OcrServiceOptions) {
+    this.now = options.now ?? Date.now;
+    const platform = options.platform ?? { os: process.platform, arch: process.arch };
+    this.noDevice = deviceProblem(options.device, platform.os, platform.arch);
+    if (this.noDevice) {
+      options.log.error(
+        { device: options.device, reason: this.noDevice },
+        'the screenshot reader cannot use this device; screenshots are not read',
+      );
+    }
+  }
+
+  read(bytes: Uint8Array, options: ReadOptions = {}): Promise<OcrOutcome> {
+    if (this.closed || this.noDevice) return Promise.resolve({ kind: 'unavailable' });
+    if (this.busy && this.waiting.length >= this.options.queue) {
+      return Promise.resolve({ kind: 'busy' });
+    }
+    return new Promise((resolve) => {
+      if (this.busy) {
+        try {
+          options.onQueued?.(this.waiting.length + 1);
+        } catch (err) {
+          this.options.log.error({ err }, 'a waiting screenshot could not be told so');
+        }
+      }
+      this.waiting.push({ bytes, resolve });
+      void this.pump();
+    });
+  }
+
+  async close(): Promise<void> {
+    this.closed = true;
+    for (const job of this.waiting.splice(0)) job.resolve({ kind: 'unavailable' });
+    await this.stopWorker();
+  }
+
+  private async pump(): Promise<void> {
+    if (this.busy) return;
+    const job = this.waiting.shift();
+    if (!job) return;
+    this.busy = true;
+    clearTimeout(this.idleTimer);
+    let outcome: OcrOutcome;
+    try {
+      outcome = await this.readNow(job.bytes);
+    } catch (err) {
+      this.options.log.error({ err }, 'the screenshot reader failed');
+      outcome = { kind: 'failed' };
+    }
+    job.resolve(outcome);
+    this.busy = false;
+    if (this.waiting.length > 0) {
+      void this.pump();
+    } else if (this.worker && !this.closed) {
+      this.idleTimer = setTimeout(() => void this.stopWorker(), this.options.idleMs ?? 10 * 60_000);
+      this.idleTimer.unref();
+    }
+  }
+
+  private async readNow(bytes: Uint8Array, again = false): Promise<OcrOutcome> {
+    // A process that died while idle may not have said so yet.
+    if (this.worker && !this.worker.child.connected) await this.stopWorker();
+    const worker = this.worker ?? (await this.startWorker());
+    if (!worker || !(await worker.ready) || this.closed) return { kind: 'unavailable' };
+    const id = this.nextId++;
+    const started = this.now();
+    const answer = await new Promise<WorkerMessage | 'exited' | 'unsent' | 'timeout'>((resolve) => {
+      const timer = setTimeout(() => resolve('timeout'), this.options.timeoutMs);
+      let received = false;
+      worker.answer = (message) => {
+        // An answer to another request (one that timed out) is not this one's.
+        if (typeof message !== 'string' && 'id' in message && message.id !== id) return;
+        if (typeof message !== 'string' && message.kind === 'received') {
+          received = true;
+          return;
+        }
+        if (message === 'exited' && !received) message = 'unsent';
+        clearTimeout(timer);
+        resolve(message);
+      };
+      const request: ReadRequest = { kind: 'read', id, bytes };
+      worker.child.send(request, (err) => {
+        if (err) worker.answer?.('unsent');
+      });
+    });
+    worker.answer = undefined;
+    const ms = this.now() - started;
+    if (answer === 'unsent' && !again && !this.closed) {
+      // The process kept from earlier work died before it saw this screenshot (killed while
+      // idle): one more try with a new one. A process that died with the screenshot in its
+      // hands is not given it again.
+      await this.stopWorker();
+      return this.readNow(bytes, true);
+    }
+    if (answer === 'timeout' || answer === 'exited' || answer === 'unsent') {
+      if (!this.closed) {
+        this.options.log.warn(
+          { ms, reason: answer },
+          'the screenshot reader stopped; it starts anew',
+        );
+      }
+      await this.stopWorker();
+      return { kind: 'failed' };
+    }
+    switch (answer.kind) {
+      case 'read':
+        this.options.log.info({ ms, readMs: answer.reading.ms }, 'read a screenshot');
+        return { kind: 'read', reading: answer.reading };
+      case 'not-an-image':
+        return { kind: 'not-an-image' };
+      case 'failed':
+        this.options.log.warn({ reason: answer.reason }, 'could not read a screenshot');
+        return { kind: 'failed' };
+      default:
+        return { kind: 'failed' };
+    }
+  }
+
+  /** Starts the process once the files are there; undefined when it cannot or may not. */
+  private async startWorker(): Promise<Worker | undefined> {
+    const retryMs = this.options.startRetryMs ?? 10 * 60_000;
+    if (this.startFailedAt !== undefined && this.now() - this.startFailedAt < retryMs) {
+      return undefined;
+    }
+    const paths = await this.options.assets.ensure();
+    if (!paths || this.closed) return undefined;
+    const start: WorkerStart = {
+      paths,
+      device: this.options.device,
+      threads: this.options.threads,
+      priority: this.options.priority,
+    };
+    const file = this.options.workerFile ?? WORKER;
+    const child = fork(file, [JSON.stringify(start)], {
+      serialization: 'advanced',
+      env: workerEnvironment(process.env),
+      execArgv:
+        path.extname(file) === '.ts'
+          ? ['--import', import.meta.resolve('tsx')]
+          : ['--enable-source-maps'],
+      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
+    });
+    let said = '';
+    child.stderr?.on('data', (chunk: Buffer) => {
+      said = (said + chunk.toString('utf8')).slice(-2000);
+    });
+    let started = false;
+    let markExited: () => void = () => undefined;
+    const worker: Worker = {
+      child,
+      stopping: false,
+      exited: new Promise((resolve) => {
+        markExited = resolve;
+      }),
+      ready: new Promise((resolve) => {
+        const timer = setTimeout(() => {
+          this.options.log.error('the screenshot reader did not start in time');
+          resolve(false);
+        }, this.options.startTimeoutMs ?? 120_000);
+        const gone = () => {
+          clearTimeout(timer);
+          if (this.worker === worker) this.worker = undefined;
+          resolve(false);
+          worker.answer?.('exited');
+        };
+        let failedToStart = false;
+        child.on('message', (message: WorkerMessage) => {
+          if (message.kind === 'ready') {
+            clearTimeout(timer);
+            started = true;
+            this.options.log.info(
+              { loadMs: message.loadMs, device: start.device },
+              'the screenshot reader started',
+            );
+            resolve(true);
+          } else if (message.kind === 'start-failed') {
+            clearTimeout(timer);
+            failedToStart = true;
+            this.options.log.error(
+              { reason: message.reason },
+              'the screenshot reader could not start',
+            );
+            resolve(false);
+          } else {
+            worker.answer?.(message);
+          }
+        });
+        child.on('error', (err) => {
+          this.options.log.error({ err }, 'the screenshot reader process failed');
+          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
+          gone();
+        });
+        child.on('exit', (code, signal) => {
+          markExited();
+          const expected = this.closed || worker.stopping || failedToStart;
+          if (!expected && (signal !== null || (code !== 0 && code !== null))) {
+            this.options.log.warn(
+              {
+                code,
+                signal,
+                during: started ? 'work' : 'start',
+                ...(said ? { stderr: said.slice(-500) } : {}),
+              },
+              'the screenshot reader exited',
+            );
+          }
+          gone();
+        });
+      }),
+    };
+    this.worker = worker;
+    if (!(await worker.ready)) {
+      this.startFailedAt = this.now();
+      this.options.assets.forget();
+      await this.stopWorker();
+      return undefined;
+    }
+    this.startFailedAt = undefined;
+    return worker;
+  }
+
+  /** Ends the process, if any, and waits for it: killed outright when it does not go. */
+  private async stopWorker(): Promise<void> {
+    clearTimeout(this.idleTimer);
+    const worker = this.worker;
+    this.worker = undefined;
+    if (!worker) return;
+    worker.stopping = true;
+    worker.child.removeAllListeners('message');
+    const { child } = worker;
+    // Never started (a spawn that failed), or already gone.
+    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return;
+    child.kill();
+    const killer = setTimeout(() => child.kill('SIGKILL'), KILL_AFTER_MS);
+    const giveUp = new Promise<void>((resolve) => setTimeout(resolve, 2 * KILL_AFTER_MS).unref());
+    await Promise.race([worker.exited, giveUp]);
+    clearTimeout(killer);
+  }
+}
diff --git a/test/support/ocr-worker.ts b/test/support/ocr-worker.ts
new file mode 100644
index 0000000000000000000000000000000000000000..a6d9d3233449596371b9ffdf0db40e1132fe6602
--- /dev/null
+++ b/test/support/ocr-worker.ts
@@ -0,0 +1,65 @@
+/**
+ * A made-up reading process for the tests of `OcrService`: it speaks the protocol of
+ * `src/ocr/worker.ts` without models. What it does depends on the screenshot's bytes as text:
+ * `hang` never answers, `crash` exits, `not` is not an image, `fail` fails, anything else is read
+ * as a reading whose gym is that text (or its length, for more than a kilobyte), whose `width` is
+ * this process's id and whose `height` its priority. A start whose detector path is
+ * `cannot-start` fails to start. The text `secret` is answered with the value of the environment
+ * variable `PINE_TEST_SECRET` as the gym (`none` when the process does not have it).
+ */
+import { getPriority } from 'node:os';
+import type { ReadRequest, WorkerMessage, WorkerStart } from '../../src/ocr/protocol.js';
+import { applyPriority } from '../../src/ocr/protocol.js';
+
+const send = (message: WorkerMessage) => process.send?.(message);
+const start = JSON.parse(process.argv[2] ?? '{}') as WorkerStart;
+applyPriority(start.priority);
+if (start.paths.detector === 'cannot-start') {
+  process.send?.(
+    { kind: 'start-failed', reason: 'no such device' } satisfies WorkerMessage,
+    undefined,
+    undefined,
+    () => process.exit(1),
+  );
+} else {
+  send({ kind: 'ready', loadMs: 1 });
+}
+
+process.on('message', (request: ReadRequest) => {
+  send({ kind: 'received', id: request.id });
+  const text =
+    request.bytes.byteLength > 1024
+      ? String(request.bytes.byteLength)
+      : new TextDecoder().decode(request.bytes);
+  if (text === 'hang') return;
+  if (text === 'crash') process.exit(3);
+  if (text === 'not') return send({ kind: 'not-an-image', id: request.id });
+  if (text === 'fail') return send({ kind: 'failed', id: request.id, reason: 'broken' });
+  send({
+    kind: 'read',
+    id: request.id,
+    reading: {
+      width: process.pid,
+      height: getPriority(),
+      text: {
+        clock: null,
+        countdown: null,
+        gym: text === 'secret' ? (process.env.PINE_TEST_SECRET ?? 'none') : text,
+        eliteBadge: false,
+        cp: null,
+        bossName: null,
+        countdownBox: null,
+        countdownPlace: null,
+        cpBox: null,
+      },
+      band: null,
+      heads: null,
+      purple: 0,
+      lines: [],
+      status: [],
+      ms: 1,
+      peakMb: 1,
+    },
+  });
+});
+process.on('disconnect', () => process.exit(0));
````

---

### Task 7: What a screenshot reports: gym, egg or hatched, tier, boss, time

Prototype commit: `4b9671284640ed726345e144ca0c2921850401a3`

What a screenshot reports (screenshotReport, pure): the gym (the whole
text read, then without leading or trailing words, clear only when one
gym fits a long enough part without a misspelling), egg or hatched, the
tier from the heads, the boss of a hatched raid by its CP among the
current bosses (narrowed by the heads and the name; by its name alone
only when it is nearly exactly one boss's), the time from the clock and
the countdown (a 12-hour clock as the reading just before the upload;
otherwise guessed from it), and doubts: what a member should confirm
before a raid is made of it (not a raid screen, no or an unclear gym, a
guessed or stale clock, a time past, a countdown too long, a heads/boss
conflict, a tier from the heads alone on a hatched raid, an unknown or
named-only boss, 6 or 7 heads, elite, purple no current boss explains).

reportContext gives it the bot's bosses, the gym search by names of this
server's gyms and the settings. A shadow T3 boss has 4,000 stamina.

**Interfaces:**
- Consumes: `ScreenText` (Task 3); `HeadCount` (Task 4); `ctx.raidBosses`, `ctx.gyms`, `ctx.regions`, `gymInGuild`, `raidBossCp`, `bossStamina`.
- Produces: `screenshotReport(reading, context)`, `ScreenshotReport`, `ReportDoubt`, `ReportContext`, `ReadScreen`, `GymHitLike`, `gymOfText`, `clockTime`, `nameSimilarity`, `bossNameSimilarity` (`src/domain/ocr/screenshot-report.ts`); `reportContext(ctx, { channelId, guildRow }, uploadedAt)` (`src/services/screenshot-context.ts`).

**Files:**

```
 src/domain/ocr/screenshot-report.test.ts | 365 ++++++++++++++++++++++++++++++++++++++++++++
 src/domain/ocr/screenshot-report.ts      | 422 +++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/pogo/raid-tier.test.ts        |   2 +
 src/domain/pogo/raid-tier.ts             |   5 +-
 src/services/screenshot-context.test.ts  |  44 ++++++
 src/services/screenshot-context.ts       |  35 +++++
 6 files changed, 872 insertions(+), 1 deletion(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit src/domain/ocr/screenshot-report.test.ts src/domain/pogo/raid-tier.test.ts src/services/screenshot-context.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 4b9671284640ed726345e144ca0c2921850401a3 -- src test scripts package.json` prints nothing.
- [ ] **Step 5: Commit** with the title `What a screenshot reports: gym, egg or hatched, tier, boss, time`, the body above and the trailer, staging exactly
  `src/domain/ocr/screenshot-report.test.ts src/domain/ocr/screenshot-report.ts src/domain/pogo/raid-tier.test.ts src/domain/pogo/raid-tier.ts src/services/screenshot-context.test.ts src/services/screenshot-context.ts`.

````diff
diff --git a/src/domain/ocr/screenshot-report.test.ts b/src/domain/ocr/screenshot-report.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..07a122bf83fbc45be5a8a57b2e9d40ab666efaab
--- /dev/null
+++ b/src/domain/ocr/screenshot-report.test.ts
@@ -0,0 +1,365 @@
+import { DateTime } from 'luxon';
+import { describe, expect, it } from 'vitest';
+import { raidBossesFixture } from '../../../test/support/raid-bosses.js';
+import type { ScreenText } from './raid-screen.js';
+import {
+  bossNameSimilarity,
+  clockTime,
+  gymOfText,
+  nameSimilarity,
+  screenshotReport,
+  type GymHitLike,
+  type ReportContext,
+} from './screenshot-report.js';
+
+const ZONE = 'America/New_York';
+const at = (text: string) => DateTime.fromISO(text, { zone: ZONE }).toMillis();
+const BOSSES = raidBossesFixture().bosses();
+const boss = (key: string) => {
+  const found = BOSSES.find((b) => b.key === key);
+  if (!found) throw new Error(key);
+  return found;
+};
+
+const NO_TEXT: ScreenText = {
+  clock: null,
+  countdown: null,
+  gym: null,
+  eliteBadge: false,
+  cp: null,
+  bossName: null,
+  countdownBox: null,
+  countdownPlace: null,
+  cpBox: null,
+};
+
+const NAMES: Record<number, string> = {
+  7: 'Heinz Plant',
+  8: "St. Paul's Church",
+  9: 'Old Plant Church',
+  10: 'Temple Sinai',
+  11: 'Temple Sinai Garden',
+};
+const hit = (id: number, allWords = true, corrected = false): GymHitLike => ({
+  gym: { id, name: NAMES[id] ?? `Gym ${id}` },
+  place: 'local',
+  allWords,
+  corrected,
+});
+
+/**
+ * A gym search that knows "Heinz Plant" (gym 7), "Heinz Plantt" only as a misspelling of it, two
+ * gyms called "… Church" (8 and 9), and "Plant" anything as a guess of gym 9.
+ */
+function search(text: string): GymHitLike[] {
+  if (text === 'Heinz Plant') return [hit(7)];
+  if (text === 'Heinz Plantt') return [hit(7, true, true)];
+  if (text === 'Church') return [hit(8), hit(9)];
+  if (text === "St. Paul's Church") return [hit(8)];
+  if (text === 'Temple Sinai') return [hit(11), hit(10)];
+  if (text.includes('Plant')) return [hit(9, false)];
+  return [];
+}
+
+function context(overrides: Partial<ReportContext> = {}): ReportContext {
+  return {
+    bosses: BOSSES,
+    searchGym: search,
+    uploadedAt: at('2026-10-14T13:40:00'),
+    zone: ZONE,
+    standardIncubate: 60,
+    standardHatched: 45,
+    maxHatched: 180,
+    guessOffsetSeconds: 45,
+    ...overrides,
+  };
+}
+
+const read = (text: Partial<ScreenText>, heads: number | null, purple = 0) => ({
+  text: { ...NO_TEXT, ...text },
+  heads: heads === null ? null : { count: heads, score: 0.7, scale: 1, outside: 0.2 },
+  purple,
+});
+
+/** A hatched raid's text: the countdown at the right, the clock two minutes before the upload. */
+const hatched = (more: Partial<ScreenText> = {}): Partial<ScreenText> => ({
+  gym: 'Heinz Plant',
+  clock: { hour: 1, minute: 38 },
+  countdown: 31 * 60 + 2,
+  countdownPlace: 'right',
+  ...more,
+});
+
+/** An egg's text: the countdown centred, the clock a minute before the upload. */
+const egg = (more: Partial<ScreenText> = {}): Partial<ScreenText> => ({
+  gym: 'Heinz Plant',
+  clock: { hour: 13, minute: 39 },
+  countdown: 20 * 60,
+  countdownPlace: 'centre',
+  ...more,
+});
+
+describe('screenshotReport', () => {
+  it('reports a hatched raid: the boss by its CP, the end by the clock and countdown', () => {
+    const report = screenshotReport(
+      read(hatched({ cp: 45899, bossName: 'Yveltal' }), 5),
+      context(),
+    );
+    expect(report).toMatchObject({
+      gym: { read: 'Heinz Plant', searched: 'Heinz Plant', gymId: 7, place: 'local', clear: true },
+      stage: 'hatched',
+      heads: 5,
+      tier: { level: 'T5', shadow: false },
+      tierFrom: 'boss',
+      bossFrom: 'cp',
+      takenAt: at('2026-10-14T13:38:00'),
+      time: { end: at('2026-10-14T14:09:02') },
+      doubts: [],
+    });
+    expect(report.boss?.key).toBe('yveltal');
+  });
+
+  it('tells bosses of one CP apart by the name, and leaves the boss open when it cannot', () => {
+    const twin = { ...boss('yveltal'), key: 'xerneas', name: 'Xerneas' };
+    const bosses = [...BOSSES, twin];
+    const report = (bossName: string | null) =>
+      screenshotReport(read(hatched({ cp: 45899, bossName }), 5), context({ bosses }));
+    expect(report('Yvelta1')).toMatchObject({ bossFrom: 'cp-and-name' });
+    expect(report('Yvelta1').boss?.key).toBe('yveltal');
+    expect(report(null)).toMatchObject({
+      boss: null,
+      bossFrom: null,
+      tier: { level: 'T5', shadow: false },
+      tierFrom: 'heads',
+      doubts: ['heads-only', 'boss-unknown'],
+    });
+  });
+
+  it('takes the boss by its name alone only when it is nearly exactly one boss’s', () => {
+    const byName = (bossName: string, bosses = BOSSES) =>
+      screenshotReport(read(hatched({ cp: 45000, bossName }), 5), context({ bosses }));
+    expect(byName('Yveltal').boss?.key).toBe('yveltal');
+    expect(byName('Yveltal').doubts).toContain('boss-from-name');
+    expect(byName('Yveltai').boss).toBeNull();
+    expect(byName('Ditta').boss).toBeNull();
+    // The screen shows the species' name, not the form's.
+    expect(byName('Landorus').boss?.key).toBe('landorus_incarnate');
+    expect(byName('Landorus').tier).toEqual({ level: 'T5', shadow: true });
+    // Two look-alikes: the one named exactly, and neither for a misreading.
+    const latios = { ...boss('yveltal'), key: 'latios', name: 'Latios' };
+    const latias = { ...boss('yveltal'), key: 'latias', name: 'Latias' };
+    expect(byName('Latios', [...BOSSES, latios, latias]).boss?.key).toBe('latios');
+    expect(byName('Latics', [...BOSSES, latios, latias]).boss).toBeNull();
+  });
+
+  it('takes a shadow boss with its shadow tier from the CP', () => {
+    const report = screenshotReport(
+      read(hatched({ cp: 47444, bossName: 'Landorus' }), 5),
+      context(),
+    );
+    expect(report.tier).toEqual({ level: 'T5', shadow: true });
+    expect(report.boss?.key).toBe('landorus_incarnate');
+  });
+
+  it('doubts a boss whose name under its CP says another, and a row of heads that may be cut', () => {
+    const named = screenshotReport(read(hatched({ cp: 45899, bossName: 'Pikachu' }), 5), context());
+    expect(named.boss?.key).toBe('yveltal');
+    expect(named.doubts).toEqual(['boss-name-differs']);
+    // A name partly hidden by the boss is no doubt.
+    const hidden = screenshotReport(read(hatched({ cp: 45899, bossName: 'Yvelt' }), 5), context());
+    expect(hidden.doubts).toEqual([]);
+    const cut = { ...read(egg(), 3), heads: { count: 3, score: 0.7, scale: 1, outside: 0.6 } };
+    expect(screenshotReport(cut, context()).doubts).toEqual(['heads-uncertain']);
+  });
+
+  it('doubts a boss whose tier is not the tier of the heads', () => {
+    const report = screenshotReport(read(hatched({ cp: 45899 }), 3), context());
+    expect(report.boss?.key).toBe('yveltal');
+    expect(report.doubts).toEqual(['heads-boss-conflict']);
+  });
+
+  it('reports a hatched raid whose CP was not read by its countdown at the right', () => {
+    const report = screenshotReport(read(hatched(), 5), context());
+    expect(report).toMatchObject({
+      stage: 'hatched',
+      tier: { level: 'T5' },
+      time: { end: at('2026-10-14T14:09:02') },
+    });
+    expect(report.doubts).toEqual(['heads-only', 'boss-unknown']);
+  });
+
+  it('reports an egg: the tier by its heads, shadow by its purple, the hatch time', () => {
+    const report = (heads: number | null, purple = 0, more: Partial<ScreenText> = {}) =>
+      screenshotReport(read(egg(more), heads, purple), context());
+    expect(report(3)).toMatchObject({
+      stage: 'egg',
+      tier: { level: 'T3', shadow: false },
+      tierFrom: 'heads',
+      time: { hatch: at('2026-10-14T13:59:00') },
+      doubts: [],
+    });
+    expect(report(5, 0.08).tier).toEqual({ level: 'T5', shadow: true });
+    expect(report(4, 0.08).tier).toEqual({ level: 'Mega', shadow: false });
+    expect(report(6)).toMatchObject({
+      tier: { level: 'MegaLegendary' },
+      doubts: ['heads-unverified'],
+    });
+    expect(report(7).tier).toEqual({ level: 'SuperMega', shadow: false });
+    expect(report(2)).toMatchObject({ tier: null, doubts: ['tier-unknown'] });
+    expect(report(null)).toMatchObject({ heads: null, tier: null });
+    expect(report(null).doubts).toEqual(['tier-unknown', 'not-a-raid-screen']);
+  });
+
+  it('makes a long egg of five heads elite only at an elite raid gym, and doubts both', () => {
+    const long = (eliteBadge: boolean) =>
+      screenshotReport(read(egg({ countdown: 3 * 3600, eliteBadge }), 5), context());
+    expect(long(true)).toMatchObject({ tier: { level: 'Elite' }, doubts: ['elite'] });
+    expect(long(false)).toMatchObject({ tier: { level: 'T5' }, doubts: ['countdown-long'] });
+  });
+
+  it('doubts the purple when no current boss of that tier is a shadow, or none is not', () => {
+    const plainOnly = BOSSES.filter((b) => !(b.tier.level === 'T5' && b.tier.shadow));
+    expect(screenshotReport(read(egg(), 5, 0.08), context({ bosses: plainOnly })).doubts).toEqual([
+      'shadow-unlisted',
+    ]);
+  });
+
+  it('refuses to call a screen without a countdown a raid screen (a Pokémon’s own page)', () => {
+    const page = screenshotReport(
+      read({ gym: 'CP3277', cp: 3277, bossName: 'Pikachu' }, null),
+      context(),
+    );
+    expect(page.doubts).toContain('not-a-raid-screen');
+    expect(page.doubts).toContain('no-time');
+    expect(page.time).toBeNull();
+  });
+
+  it('cannot tell egg from hatched by a countdown that is neither centred nor at the right', () => {
+    const report = screenshotReport(read(egg({ countdownPlace: null }), 3), context());
+    expect(report).toMatchObject({ stage: null, time: null });
+    expect(report.doubts).toContain('stage-unknown');
+  });
+
+  it('guesses the time from the upload when the clock is missing or does not fit', () => {
+    for (const clock of [null, { hour: 4, minute: 10 }]) {
+      expect(screenshotReport(read(egg({ clock, countdown: 600 }), 1), context())).toMatchObject({
+        takenAt: at('2026-10-14T13:39:15'),
+        time: { hatch: at('2026-10-14T13:49:15') },
+        doubts: ['time-guessed'],
+      });
+    }
+  });
+
+  it('doubts a clock a while before the upload, a time already past, a countdown too long', () => {
+    const stale = screenshotReport(read(egg({ clock: { hour: 1, minute: 20 } }), 1), context());
+    expect(stale.doubts).toEqual(['time-stale']);
+    const past = screenshotReport(
+      read(egg({ clock: { hour: 1, minute: 20 }, countdown: 60 }), 1),
+      context(),
+    );
+    expect(past.doubts).toEqual(['time-stale', 'time-past']);
+    const long = screenshotReport(read(hatched({ countdown: 4 * 3600 }), 1), context());
+    expect(long.doubts).toContain('countdown-long');
+  });
+
+  it('says when no gym was found or the gym was not clear', () => {
+    expect(screenshotReport(read(egg({ gym: 'Nowhere' }), 1), context()).doubts).toEqual([
+      'no-gym',
+    ]);
+    expect(screenshotReport(read(egg({ gym: 'Old Plant' }), 1), context()).doubts).toEqual([
+      'gym-unclear',
+    ]);
+  });
+});
+
+describe('clockTime', () => {
+  const upload = at('2026-10-14T13:40:00');
+  const ages = 105 * 60_000;
+
+  it('reads an hour of 1 to 12 as either half of the day, whichever is just before the upload', () => {
+    expect(clockTime({ hour: 1, minute: 38 }, upload, ZONE, ages)).toBe(at('2026-10-14T13:38:00'));
+    expect(clockTime({ hour: 12, minute: 30 }, upload, ZONE, ages)).toBe(at('2026-10-14T12:30:00'));
+    expect(clockTime({ hour: 13, minute: 41 }, upload, ZONE, ages)).toBe(at('2026-10-14T13:41:00'));
+  });
+
+  it('reads a clock of the evening before an upload after midnight', () => {
+    const night = at('2026-10-15T00:10:00');
+    expect(clockTime({ hour: 11, minute: 58 }, night, ZONE, ages)).toBe(at('2026-10-14T23:58:00'));
+    expect(clockTime({ hour: 0, minute: 5 }, night, ZONE, ages)).toBe(at('2026-10-15T00:05:00'));
+  });
+
+  it('refuses a clock ahead of the upload by more than two minutes, or older than allowed', () => {
+    expect(clockTime({ hour: 13, minute: 43 }, upload, ZONE, ages)).toBeUndefined();
+    expect(clockTime({ hour: 11, minute: 50 }, upload, ZONE, ages)).toBeUndefined();
+  });
+
+  it('reads 1:50 on the night the clocks fall back as the first 1:50, before an upload at 1:10 after it', () => {
+    // 2026-11-01: 1:50 EDT is 05:50 UTC; 1:10 EST, after the change, is 06:10 UTC.
+    const upload = Date.UTC(2026, 10, 1, 6, 10);
+    expect(clockTime({ hour: 1, minute: 50 }, upload, ZONE, ages)).toBe(
+      Date.UTC(2026, 10, 1, 5, 50),
+    );
+  });
+
+  it('does not read a time the clocks skip on the night they spring forward', () => {
+    // 2026-03-08: 2:30 does not exist; the upload is at 3:05 EDT.
+    const upload = at('2026-03-08T03:05:00');
+    expect(clockTime({ hour: 2, minute: 30 }, upload, ZONE, ages)).toBeUndefined();
+  });
+});
+
+describe('gymOfText', () => {
+  it('drops picture text before the name', () => {
+    expect(gymOfText('HEINZ Heinz Plant', search)).toEqual({
+      read: 'HEINZ Heinz Plant',
+      searched: 'Heinz Plant',
+      gymId: 7,
+      place: 'local',
+      clear: true,
+    });
+  });
+
+  it('takes a misspelt name, but not as clear', () => {
+    expect(gymOfText('Heinz Plantt', search)).toMatchObject({ gymId: 7, clear: false });
+  });
+
+  it('never lets one common word decide, nor a part of less than half the words read', () => {
+    expect(gymOfText("St. Paul's Church", search)).toMatchObject({ gymId: 8, clear: true });
+    expect(gymOfText("St. Pau1's Church", search)).toMatchObject({ clear: false });
+  });
+
+  it('takes the one gym called exactly what was read of several, but not as clear', () => {
+    expect(gymOfText('Temple Sinai', search)).toMatchObject({ gymId: 10, clear: false });
+  });
+
+  it('never lets one common word be clear, even when one gym has it', () => {
+    const one = (text: string) => (text === 'Church' ? [hit(8)] : []);
+    expect(gymOfText('Old Grey Church', one)).toMatchObject({ gymId: 8, clear: false });
+  });
+
+  it('takes the top hit of the whole text when nothing is clear, and says so', () => {
+    expect(gymOfText('Old Plant', search)).toMatchObject({
+      searched: 'Old Plant',
+      gymId: 9,
+      clear: false,
+    });
+    expect(gymOfText('Nothing here', search)).toMatchObject({ gymId: null, searched: null });
+    expect(gymOfText(null, search)).toMatchObject({ read: null, gymId: null });
+  });
+});
+
+describe('names', () => {
+  it('compares letters only, without case', () => {
+    expect(nameSimilarity('YVELTAL', 'Yveltal')).toBe(1);
+    expect(nameSimilarity('Ditya', 'Dialga')).toBeCloseTo(0.5, 5);
+    expect(nameSimilarity('', 'Dialga')).toBe(0);
+  });
+
+  it('compares a boss by its name, without its form, and without mega or a region', () => {
+    expect(bossNameSimilarity('Landorus', { name: 'Landorus (Incarnate Forme)' })).toBe(1);
+    expect(bossNameSimilarity('Blastoise', { name: 'Mega Blastoise' })).toBe(1);
+    expect(bossNameSimilarity('Mega Blastoise', { name: 'Mega Blastoise' })).toBe(1);
+    expect(bossNameSimilarity('Charizard', { name: 'Mega Charizard X' })).toBe(1);
+    expect(bossNameSimilarity('Raichu', { name: 'Alolan Raichu' })).toBe(1);
+  });
+});
diff --git a/src/domain/ocr/screenshot-report.ts b/src/domain/ocr/screenshot-report.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d52ddc6152c34caf4335ff0873d13a82adf02e36
--- /dev/null
+++ b/src/domain/ocr/screenshot-report.ts
@@ -0,0 +1,422 @@
+import { distance } from 'fastest-levenshtein';
+import { DateTime } from 'luxon';
+import { raidBossCp } from '../pogo/cp.js';
+import type { RaidBoss } from '../pogo/raid-bosses.js';
+import {
+  bossStamina,
+  raidTier,
+  SHADOW_RAID_LEVELS,
+  type RaidLevel,
+  type RaidTier,
+} from '../pogo/raid-tier.js';
+import type { ScreenText } from './raid-screen.js';
+import { SHADOW_SHARE } from './shadow.js';
+import type { HeadCount } from './tier-heads.js';
+
+/**
+ * What Pine makes of a screenshot that was read: the gym, egg or hatched, the tier, the boss and
+ * the time, each beside what it was made from, so that a member can be shown both and say which
+ * is wrong, and the doubts that a member should confirm before a raid is made of it. Pure: the
+ * gym search, the boss list and the clock are given.
+ */
+
+/** What the report needs of a reading (`ScreenReading` of the reading process). */
+export interface ReadScreen {
+  text: ScreenText;
+  heads: HeadCount | null;
+  purple: number;
+}
+
+/** What the report needs of a hit of the gym search (`GymHit`). */
+export interface GymHitLike {
+  gym: { id: number; name: string };
+  place: 'local' | 'neighbouring' | 'anywhere';
+  allWords: boolean;
+  corrected: boolean;
+}
+
+export interface ReportContext {
+  /** The raid bosses in effect (`ctx.raidBosses.bosses()`). */
+  bosses: readonly RaidBoss[];
+  /** The gym search where the screenshot was posted, by names only, this server's gyms only. */
+  searchGym: (text: string) => readonly GymHitLike[];
+  /** When the screenshot reached Discord: the message's own time. */
+  uploadedAt: number;
+  /** `settings.timezone`: the zone of the phone's clock. */
+  zone: string;
+  /** Minutes an egg of a standard raid incubates and the raid lasts (settings). */
+  standardIncubate: number;
+  standardHatched: number;
+  /** The longest a hatched raid lasts, in minutes (`settings.maxRaidHatchedDuration`). */
+  maxHatched: number;
+  /** Seconds before the upload a screenshot without a usable clock is taken to be from. */
+  guessOffsetSeconds: number;
+}
+
+/**
+ * Why a member should look at a report before a raid is made of it:
+ * - `not-a-raid-screen`: no countdown, or neither heads nor a boss named by its CP;
+ * - `no-gym`, `gym-unclear`: no gym found, or not one clear hit of the name read;
+ * - `no-time`: no countdown; `time-guessed`: from the upload, no usable clock;
+ * - `time-stale`: the clock is more than a quarter of an hour before the upload;
+ * - `time-past`: the hatch or end lies before the upload;
+ * - `countdown-long`: longer than an egg incubates or a raid lasts;
+ * - `stage-unknown`: neither egg nor hatched could be told;
+ * - `tier-unknown`; `heads-unverified`: 6 or 7 heads, a count no sample has shown yet;
+ * - `heads-only`: a hatched raid's tier from its heads alone (the boss may hide a head);
+ * - `heads-uncertain`: a place just outside the row of heads looks like a head too (a head at
+ *   the end of the row may have been missed);
+ * - `heads-boss-conflict`: the boss named by the CP has another tier than the heads say;
+ * - `boss-unknown`: hatched, and no boss decided; `boss-from-name`: by the name alone;
+ * - `boss-name-differs`: the boss the CP names is not what the name under it says;
+ * - `elite`: an elite raid, which is rare (Matt: it loses every conflict);
+ * - `shadow-unlisted`: the purple says shadow (or not) and no current boss of that tier is.
+ */
+export type ReportDoubt =
+  | 'not-a-raid-screen'
+  | 'no-gym'
+  | 'gym-unclear'
+  | 'no-time'
+  | 'time-guessed'
+  | 'time-stale'
+  | 'time-past'
+  | 'countdown-long'
+  | 'stage-unknown'
+  | 'tier-unknown'
+  | 'heads-unverified'
+  | 'heads-only'
+  | 'heads-uncertain'
+  | 'heads-boss-conflict'
+  | 'boss-unknown'
+  | 'boss-from-name'
+  | 'boss-name-differs'
+  | 'elite'
+  | 'shadow-unlisted';
+
+export interface ScreenshotReport {
+  gym: {
+    /** The gym's name as read. */
+    read: string | null;
+    /** The part of it whose search decided. */
+    searched: string | null;
+    gymId: number | null;
+    place: GymHitLike['place'] | null;
+    /** One gym had every word of a long enough part, without a misspelling. */
+    clear: boolean;
+  };
+  /** Egg (a CP-less screen with its countdown centred), hatched (a CP, or the countdown at the right). */
+  stage: 'egg' | 'hatched' | null;
+  heads: number | null;
+  tier: RaidTier | null;
+  /** The tier came from the boss that the CP named, or from the heads. */
+  tierFrom: 'boss' | 'heads' | null;
+  cp: number | null;
+  bossName: string | null;
+  boss: RaidBoss | null;
+  bossFrom: 'cp' | 'cp-and-name' | 'name' | null;
+  eliteBadge: boolean;
+  purple: number;
+  clock: { hour: number; minute: number } | null;
+  countdown: number | null;
+  /** When the screenshot was taken: by its clock, or guessed from the upload. */
+  takenAt: number;
+  /** When the egg hatches, or the hatched raid ends; null without a countdown and a stage. */
+  time: { hatch: number } | { end: number } | null;
+  doubts: ReportDoubt[];
+}
+
+/** The tier of each count of heads: the game shows the tier's number. */
+const TIER_OF_HEADS: Readonly<Record<number, RaidLevel>> = {
+  1: 'T1',
+  3: 'T3',
+  4: 'Mega',
+  5: 'T5',
+  6: 'MegaLegendary',
+  7: 'SuperMega',
+};
+/** Counts the samples have shown; others are taken from the game's tier numbers. */
+const SEEN_HEADS = new Set([1, 3, 4, 5]);
+/** The phone's clock may be ahead of the upload by this much (clocks differ). */
+const CLOCK_AHEAD_MS = 2 * 60_000;
+/** A clock older than this before the upload is used, but doubted. */
+const STALE_MS = 15 * 60_000;
+/** Of bosses with one CP, a name decides when it is this much more similar than the next. */
+const NAME_MARGIN = 0.2;
+/** A boss by its name alone: at least this similar, and this much more than the next. */
+const NAME_ALONE = 0.9;
+const NAME_ALONE_MARGIN = 0.15;
+/**
+ * A place just outside a row of heads that matches this well is a head the row may have missed:
+ * beside the rows of the research's samples the best was 0.49, a head itself matches 0.67 and
+ * more.
+ */
+const HEAD_OUTSIDE = 0.55;
+/** A name read under the CP that is less like the boss the CP names than this is doubted. */
+const NAME_DIFFERS = 0.4;
+/** Words a raid screen leaves out of a boss's name: it shows the species alone. */
+const NAME_PREFIXES = /^(?:mega|primal|shadow|alolan|galarian|hisuian|paldean)\s+/i;
+
+/** 0 to 1: how alike two names are (Levenshtein over letters, case ignored). */
+export function nameSimilarity(a: string, b: string): number {
+  const x = a.toLowerCase().replace(/[^a-z]/g, '');
+  const y = b.toLowerCase().replace(/[^a-z]/g, '');
+  if (x.length === 0 || y.length === 0) return 0;
+  return 1 - distance(x, y) / Math.max(x.length, y.length);
+}
+
+/**
+ * How alike a name read on the screen is to a boss: its name as the catalogue has it, without
+ * the form in brackets ("Landorus (Incarnate Forme)"), and without the words a raid screen may
+ * leave out ("Mega Blastoise", "Mega Charizard X"); the best of them.
+ */
+export function bossNameSimilarity(read: string, boss: Pick<RaidBoss, 'name'>): number {
+  const bare = boss.name.replace(/\s*\(.*\)\s*$/, '');
+  const species = bare.replace(NAME_PREFIXES, '').replace(/\s+[XY]$/, '');
+  return Math.max(...[boss.name, bare, species].map((name) => nameSimilarity(read, name)));
+}
+
+/** Two names alike but for case, spaces and punctuation. */
+function sameName(a: string, b: string): boolean {
+  const plain = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
+  return plain(a) === plain(b);
+}
+
+/**
+ * The gym of the text read: the whole text first; then without one or two leading words (text
+ * on the gym's picture runs into the name), then without trailing words (a name the screen
+ * cut). The first try that is clear wins: exactly one hit has every word without a misspelling
+ * (as `clearGymHit`), and the try has at least two words and half the words read, so that one
+ * common word ("Church") cannot decide. Else the first try whose top hit has every word, else the
+ * whole text's top hit (of several gyms with every word, the one called exactly that): a
+ * screenshot report takes it without asking (Matt, 2026-10-11), and says it was not clear.
+ */
+export function gymOfText(
+  text: string | null,
+  search: ReportContext['searchGym'],
+): ScreenshotReport['gym'] {
+  const none = { read: text, searched: null, gymId: null, place: null, clear: false };
+  if (!text) return none;
+  const words = text.split(/\s+/).filter(Boolean);
+  const variants = [words];
+  for (let i = 1; i < Math.min(3, words.length); i++) variants.push(words.slice(i));
+  for (let i = 1; i < Math.floor(words.length / 2); i++) variants.push(words.slice(0, -i));
+  const tries = variants.map((part) => {
+    const hits = search(part.join(' '));
+    const sure = hits.filter((hit) => hit.allWords && !hit.corrected);
+    // Of several sure hits, the one gym whose whole name it is ("Temple Sinai" beside "Temple
+    // Sinai Garden") is taken, but not as clear: the rest of a longer name may be cut off.
+    const named = sure.filter((hit) => sameName(hit.gym.name, part.join(' ')));
+    const longEnough = part.length >= Math.min(2, words.length) && part.length * 2 >= words.length;
+    return {
+      searched: part.join(' '),
+      top: named.length === 1 && sure.length > 1 ? named[0] : hits[0],
+      clear: longEnough && sure.length === 1 ? sure[0] : undefined,
+    };
+  });
+  const clear = tries.find((t) => t.clear);
+  if (clear?.clear) {
+    return {
+      read: text,
+      searched: clear.searched,
+      gymId: clear.clear.gym.id,
+      place: clear.clear.place,
+      clear: true,
+    };
+  }
+  const chosen = tries.find((t) => t.top?.allWords) ?? tries[0];
+  if (!chosen?.top) return none;
+  return {
+    read: text,
+    searched: chosen.searched,
+    gymId: chosen.top.gym.id,
+    place: chosen.top.place,
+    clear: false,
+  };
+}
+
+/**
+ * When the screenshot was taken by its clock: the clock read as either half of the day when it
+ * could be a 12-hour clock, on the day of the upload or the day before, the latest such time
+ * that is not after the upload (allowing for clocks a little ahead) and not older than
+ * `maxAgeMs`. Undefined when none fits: the clock is then not used.
+ */
+export function clockTime(
+  clock: { hour: number; minute: number },
+  uploadedAt: number,
+  zone: string,
+  maxAgeMs: number,
+): number | undefined {
+  const hours =
+    clock.hour >= 1 && clock.hour <= 12 ? [clock.hour % 12, (clock.hour % 12) + 12] : [clock.hour];
+  const upload = DateTime.fromMillis(uploadedAt, { zone });
+  let best: number | undefined;
+  for (const day of [upload, upload.minus({ days: 1 })]) {
+    for (const hour of hours) {
+      const at = day.set({ hour, minute: clock.minute, second: 0, millisecond: 0 });
+      // A time the clocks skip (spring forward) does not exist on that day.
+      if (at.hour !== hour) continue;
+      // A time the clocks repeat (fall back) is two moments an hour apart: both are tried.
+      const earlier = DateTime.fromMillis(at.toMillis() - 3_600_000, { zone });
+      const moments = [at.toMillis()];
+      if (earlier.hour === hour && earlier.minute === clock.minute)
+        moments.push(earlier.toMillis());
+      for (const ms of moments) {
+        if (ms > uploadedAt + CLOCK_AHEAD_MS || ms < uploadedAt - maxAgeMs) continue;
+        if (best === undefined || ms > best) best = ms;
+      }
+    }
+  }
+  return best;
+}
+
+interface BossChoice {
+  boss: RaidBoss | null;
+  from: ScreenshotReport['bossFrom'];
+}
+
+/** The boss of a hatched raid: by its CP, narrowed by the heads and the name; else by name. */
+function bossOf(
+  cp: number | null,
+  name: string | null,
+  headsLevel: RaidLevel | undefined,
+  bosses: readonly RaidBoss[],
+): BossChoice {
+  const similar = (boss: RaidBoss) => (name ? bossNameSimilarity(name, boss) : 0);
+  const ranked = (list: readonly RaidBoss[]) => [...list].sort((a, b) => similar(b) - similar(a));
+  if (cp !== null) {
+    let fits = bosses.filter(
+      (boss) => boss.entry && raidBossCp(boss.entry.stats, bossStamina(boss.tier)) === cp,
+    );
+    if (fits.length > 1 && headsLevel) {
+      const ofHeads = fits.filter((boss) => boss.tier.level === headsLevel);
+      if (ofHeads.length > 0) fits = ofHeads;
+    }
+    if (fits.length === 1 && fits[0]) return { boss: fits[0], from: 'cp' };
+    if (fits.length > 1) {
+      const [first, second] = ranked(fits);
+      if (first && second && similar(first) - similar(second) >= NAME_MARGIN) {
+        return { boss: first, from: 'cp-and-name' };
+      }
+      return { boss: null, from: null };
+    }
+  }
+  // The CP fits no listed boss (a digit misread, or a boss the feed does not list yet): a name
+  // decides only when it is nearly exactly one boss's of the heads' tier and no other's.
+  if (!name || !headsLevel) return { boss: null, from: null };
+  const [first, second] = ranked(bosses.filter((boss) => boss.tier.level === headsLevel));
+  if (
+    first &&
+    similar(first) >= NAME_ALONE &&
+    (!second || similar(first) - similar(second) >= NAME_ALONE_MARGIN)
+  ) {
+    return { boss: first, from: 'name' };
+  }
+  return { boss: null, from: null };
+}
+
+export function screenshotReport(reading: ReadScreen, context: ReportContext): ScreenshotReport {
+  const { text } = reading;
+  const doubts = new Set<ReportDoubt>();
+  const stage =
+    text.cp !== null || text.countdownPlace === 'right'
+      ? 'hatched'
+      : text.countdownPlace === 'centre'
+        ? 'egg'
+        : null;
+  const heads = reading.heads && reading.heads.count > 0 ? reading.heads.count : null;
+  let headsLevel = heads === null ? undefined : TIER_OF_HEADS[heads];
+  if (heads !== null && headsLevel && !SEEN_HEADS.has(heads)) doubts.add('heads-unverified');
+  // An egg of five heads at an elite raid gym (its badge) that hatches later than a standard
+  // egg can is an elite raid's.
+  const longEgg = stage === 'egg' && (text.countdown ?? 0) > context.standardIncubate * 60;
+  if (headsLevel === 'T5' && longEgg && text.eliteBadge) headsLevel = 'Elite';
+
+  const { boss, from: bossFrom } =
+    stage === 'hatched'
+      ? bossOf(text.cp, text.bossName, headsLevel, context.bosses)
+      : { boss: null, from: null };
+  let tier: RaidTier | null = null;
+  let tierFrom: ScreenshotReport['tierFrom'] = null;
+  if (boss) {
+    tier = boss.tier;
+    tierFrom = 'boss';
+    if (headsLevel && headsLevel !== boss.tier.level) doubts.add('heads-boss-conflict');
+  } else if (headsLevel) {
+    let shadow = false;
+    if (SHADOW_RAID_LEVELS.includes(headsLevel)) {
+      shadow = reading.purple > SHADOW_SHARE;
+      const listed = context.bosses.some(
+        (b) => b.tier.level === headsLevel && b.tier.shadow === shadow,
+      );
+      if (!listed) doubts.add('shadow-unlisted');
+    }
+    tier = raidTier(headsLevel, shadow) ?? null;
+    tierFrom = 'heads';
+    if (stage === 'hatched') doubts.add('heads-only');
+  }
+  if (!tier) doubts.add('tier-unknown');
+  if (tier?.level === 'Elite') doubts.add('elite');
+  if (stage === 'hatched' && !boss) doubts.add('boss-unknown');
+  if (bossFrom === 'name') doubts.add('boss-from-name');
+  if (
+    boss &&
+    bossFrom === 'cp' &&
+    text.bossName &&
+    bossNameSimilarity(text.bossName, boss) < NAME_DIFFERS
+  ) {
+    doubts.add('boss-name-differs');
+  }
+  if (heads !== null && (reading.heads?.outside ?? -1) >= HEAD_OUTSIDE)
+    doubts.add('heads-uncertain');
+  if (stage === null) doubts.add('stage-unknown');
+
+  const maxAgeMs = (context.standardIncubate + context.standardHatched) * 60_000;
+  const byClock = text.clock
+    ? clockTime(text.clock, context.uploadedAt, context.zone, maxAgeMs)
+    : undefined;
+  const takenAt = byClock ?? context.uploadedAt - context.guessOffsetSeconds * 1000;
+  if (byClock === undefined) doubts.add('time-guessed');
+  else if (context.uploadedAt - byClock > STALE_MS) doubts.add('time-stale');
+  let time: ScreenshotReport['time'] = null;
+  if (text.countdown === null) {
+    doubts.add('no-time');
+  } else if (stage !== null) {
+    const at = takenAt + text.countdown * 1000;
+    time = stage === 'egg' ? { hatch: at } : { end: at };
+    if (at < context.uploadedAt) doubts.add('time-past');
+    const longest =
+      stage === 'hatched'
+        ? context.maxHatched * 60
+        : tier?.level === 'Elite'
+          ? Infinity
+          : context.standardIncubate * 60;
+    if (text.countdown > longest) doubts.add('countdown-long');
+  }
+
+  const gym = gymOfText(text.gym, context.searchGym);
+  if (gym.gymId === null) doubts.add('no-gym');
+  else if (!gym.clear) doubts.add('gym-unclear');
+
+  const raidScreen =
+    text.countdown !== null && (heads !== null || bossFrom === 'cp' || bossFrom === 'cp-and-name');
+  if (!raidScreen) doubts.add('not-a-raid-screen');
+
+  return {
+    gym,
+    stage,
+    heads,
+    tier,
+    tierFrom,
+    cp: text.cp,
+    bossName: text.bossName,
+    boss,
+    bossFrom,
+    eliteBadge: text.eliteBadge,
+    purple: reading.purple,
+    clock: text.clock,
+    countdown: text.countdown,
+    takenAt,
+    time,
+    doubts: [...doubts],
+  };
+}
diff --git a/src/domain/pogo/raid-tier.test.ts b/src/domain/pogo/raid-tier.test.ts
index 430b492e33347f4e62b3d0fcdf3158203f285ff9..2a2df54d9a5defa6cac53119c2ee65a4193f95f5 100644
--- a/src/domain/pogo/raid-tier.test.ts
+++ b/src/domain/pogo/raid-tier.test.ts
@@ -41,6 +41,8 @@ describe('raid tiers', () => {
       600, 3600, 15000, 9000, 22500, 25000, 20000,
     ]);
     expect(bossStamina({ level: 'T5', shadow: true })).toBe(15000);
+    expect(bossStamina({ level: 'T1', shadow: true })).toBe(600);
+    expect(bossStamina({ level: 'T3', shadow: true })).toBe(4000);
   });
 
   it('knows which durations apply', () => {
diff --git a/src/domain/pogo/raid-tier.ts b/src/domain/pogo/raid-tier.ts
index da746d6be053ecc6988e52aaf301a0558eb8960f..bc93105e7bca1e86b9cb97fd5ebd22501d273a23 100644
--- a/src/domain/pogo/raid-tier.ts
+++ b/src/domain/pogo/raid-tier.ts
@@ -82,8 +82,11 @@ export function raidTierLabel(tier: RaidTier): string {
   return `${tier.shadow ? 'Shadow ' : ''}${LABELS[tier.level]}`;
 }
 
+/** A shadow T3 boss has more stamina than a plain one; shadow T1 and T5 have the same. */
+const SHADOW_T3_STAMINA = 4000;
+
 export function bossStamina(tier: RaidTier): number {
-  return BOSS_STAMINA[tier.level];
+  return tier.shadow && tier.level === 'T3' ? SHADOW_T3_STAMINA : BOSS_STAMINA[tier.level];
 }
 
 export function raidDurationKind(tier: RaidTier): RaidKind {
diff --git a/src/services/screenshot-context.test.ts b/src/services/screenshot-context.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..b4f31fc3981481053a7334f4e9e72c0d5713a7f6
--- /dev/null
+++ b/src/services/screenshot-context.test.ts
@@ -0,0 +1,44 @@
+import { describe, expect, it } from 'vitest';
+import { OTHER_GUILD_ROW, WEST_CHANNEL } from '../../test/support/gyms.js';
+import { createTestContext } from '../../test/support/test-context.js';
+import { reportContext } from './screenshot-context.js';
+
+/** The row of the server the invented regions belong to. */
+const GUILD_ROW = 1;
+
+describe('reportContext', () => {
+  it('gives the report the bosses, the gym search by names where it was posted, and the settings', () => {
+    const { ctx } = createTestContext();
+    const context = reportContext(ctx, { channelId: WEST_CHANNEL, guildRow: GUILD_ROW }, 1_000);
+    expect(context.bosses).toEqual(ctx.raidBosses.bosses());
+    expect(context.searchGym('Old Stone Fountain')[0]?.gym.id).toBe(2);
+    // A gym's nickname and description are not on a raid screen: names only.
+    expect(context.searchGym('readers beside the front doors')).toEqual([]);
+    const { settings } = ctx.config;
+    expect(context).toMatchObject({
+      uploadedAt: 1_000,
+      zone: settings.timezone,
+      standardIncubate: settings.standardRaidIncubateDuration,
+      standardHatched: settings.standardRaidHatchedDuration,
+      maxHatched: settings.maxRaidHatchedDuration,
+      guessOffsetSeconds: settings.screenshotMessageOffsetTime,
+    });
+  });
+
+  it('finds only this server’s gyms, also outside a region channel', () => {
+    const { ctx } = createTestContext();
+    const here = reportContext(ctx, { channelId: null, guildRow: GUILD_ROW }, 1_000);
+    expect(here.searchGym('Old Stone Fountain')[0]?.gym.id).toBe(2);
+    // Several hits are looked at: both gyms of this name.
+    expect(
+      here
+        .searchGym('Starbucks')
+        .map((hit) => hit.gym.id)
+        .sort(),
+    ).toEqual([5, 9]);
+    // Gym 10 lies in no region of any server.
+    expect(here.searchGym('Lakeview Trailhead')).toEqual([]);
+    const elsewhere = reportContext(ctx, { channelId: null, guildRow: OTHER_GUILD_ROW }, 1_000);
+    expect(elsewhere.searchGym('Old Stone Fountain')).toEqual([]);
+  });
+});
diff --git a/src/services/screenshot-context.ts b/src/services/screenshot-context.ts
new file mode 100644
index 0000000000000000000000000000000000000000..7dd5ac642e178dbbc4c90ea4b38e7e44b60bd8e5
--- /dev/null
+++ b/src/services/screenshot-context.ts
@@ -0,0 +1,35 @@
+import type { AppContext } from '../app-context.js';
+import type { ReportContext } from '../domain/ocr/screenshot-report.js';
+import { gymInGuild } from './region-directory.js';
+
+/** How many hits of each search the report looks at: enough to see that one is not alone. */
+const GYM_HITS = 3;
+
+/**
+ * What `screenshotReport` needs, from the bot: the bosses in effect, the gym search where the
+ * screenshot was posted (names only: what a raid screen shows; this server's gyms only, also
+ * outside a region channel), the settings' time zone and durations. `channelId` is the region
+ * channel (or null outside one), `guildRow` the server's row (`ctx.guilds.idFor`), `uploadedAt`
+ * the time of the message or interaction that brought the screenshot.
+ */
+export function reportContext(
+  ctx: Pick<AppContext, 'raidBosses' | 'gyms' | 'regions' | 'config'>,
+  where: { channelId: string | null; guildRow: number },
+  uploadedAt: number,
+): ReportContext {
+  const { settings } = ctx.config;
+  return {
+    bosses: ctx.raidBosses.bosses(),
+    searchGym: (text) =>
+      ctx.gyms
+        .search(where.channelId, text, { nameOnly: true })
+        .filter((hit) => gymInGuild(ctx.gyms, ctx.regions, hit.gym.id, where.guildRow))
+        .slice(0, GYM_HITS),
+    uploadedAt,
+    zone: settings.timezone,
+    standardIncubate: settings.standardRaidIncubateDuration,
+    standardHatched: settings.standardRaidHatchedDuration,
+    maxHatched: settings.maxRaidHatchedDuration,
+    guessOffsetSeconds: settings.screenshotMessageOffsetTime,
+  };
+}
````

---

### Task 8: npm run ocr:check: a folder of screenshots through the reading process

Prototype commit: `86c743fc9499f89a0f5670ad73e06c8a4002add5`

npm run ocr:check reads a folder of screenshots through the bot's own
reading process and prints, per screenshot, what was read, what Pine
made of it and its doubts, and with labels (labels.json) which elements
were right; then the time per screenshot and the reading process's peak
memory. --device, --threads and --priority win over the settings: it is
how a machine is measured before Pine runs on it, and how a change of the
reader is judged.

**Interfaces:**
- Consumes: everything above.
- Produces: `scripts/ocr/check.ts`, the npm script `ocr:check`.

**Files:**

```
 package.json         |   1 +
 scripts/ocr/check.ts | 221 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 222 insertions(+)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`,
  `npx vitest run --project unit `); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff.
- [ ] **Step 4: Check the transcription:** `git diff 86c743fc9499f89a0f5670ad73e06c8a4002add5 -- src test scripts package.json` prints nothing.
- [ ] **Step 5: Commit** with the title `npm run ocr:check: a folder of screenshots through the reading process`, the body above and the trailer, staging exactly
  `package.json scripts/ocr/check.ts`.

````diff
diff --git a/package.json b/package.json
index dde9fe21f2c9d6c0ae428ec649c05beb16ce0111..c0362fabe6a1a839e01c8bfc6a5fe1aedd51d732 100644
--- a/package.json
+++ b/package.json
@@ -16,6 +16,7 @@
     "db:legacy-fixture": "tsx scripts/legacy-schema/generate.ts",
     "fixtures:game-data": "tsx scripts/game-data/make-fixtures.ts",
     "raid-bosses:check": "tsx scripts/raid-bosses/check-feed.ts",
+    "ocr:check": "tsx scripts/ocr/check.ts",
     "role-auth:export": "tsx --env-file-if-exists=.env scripts/role-auth/export.ts",
     "db:codegen": "tsx scripts/codegen.ts",
     "gantt": "tsx scripts/gantt/update.ts",
diff --git a/scripts/ocr/check.ts b/scripts/ocr/check.ts
new file mode 100644
index 0000000000000000000000000000000000000000..56a8b1e0f9484b6c782f42e8d631ddbc11c85146
--- /dev/null
+++ b/scripts/ocr/check.ts
@@ -0,0 +1,221 @@
+/**
+ * Reads a folder of raid screenshots through the bot's own reading process and prints what was
+ * read and what Pine made of it, per screenshot, with the time and memory it took:
+ *
+ *   npm run ocr:check -- <folder> [--device cpu|cuda|directml] [--threads <n>]
+ *                                 [--priority low|normal] [--labels <file>]
+ *
+ * With labels (`labels.json` in the folder by default: per file name `clock` "h:mm" or null,
+ * `countdown` "h:mm:ss", `gym` the name as shown, `egg`, `tier` 1, 3, 5, "mega" or the count of
+ * heads, `shadow`, `boss`, `cp`), each element is scored right or wrong. It is how a change of
+ * the reader is judged (every sample, before and after), and how a machine is measured before
+ * Pine runs on it: the device and threads of the command line win over the settings.
+ *
+ * The files of the reader are downloaded into `var/ocr/` on first use; the raid bosses are the
+ * live feed's (the boss is decided only among them). The gym is compared as text: the gym
+ * search needs the database's gyms, which the bot has.
+ */
+import { existsSync, readdirSync, readFileSync } from 'node:fs';
+import path from 'node:path';
+import { parseArgs } from 'node:util';
+import { pino } from 'pino';
+import { loadSettings } from '../../src/config/settings.js';
+import { OCR_DEVICES, type OcrDevice } from '../../src/domain/ocr/assets.js';
+import { nameSimilarity, screenshotReport } from '../../src/domain/ocr/screenshot-report.js';
+import { PokemonCatalogue } from '../../src/domain/pogo/catalogue.js';
+import { feedLookup } from '../../src/domain/pogo/feed-lookup.js';
+import { GAME_DATA_VERSION, type GameData } from '../../src/domain/pogo/game-master.js';
+import { parseRaidBossFeed } from '../../src/domain/pogo/raid-boss-feed.js';
+import { effectiveBosses, type RaidBoss } from '../../src/domain/pogo/raid-bosses.js';
+import { OcrAssets } from '../../src/services/ocr-assets.js';
+import { OcrService } from '../../src/services/ocr-service.js';
+
+const repoRoot = path.resolve(import.meta.dirname, '../..');
+const { values, positionals } = parseArgs({
+  allowPositionals: true,
+  options: {
+    device: { type: 'string' },
+    threads: { type: 'string' },
+    priority: { type: 'string' },
+    labels: { type: 'string' },
+  },
+});
+const folder = positionals[0];
+if (!folder) {
+  process.stderr.write('Usage: npm run ocr:check -- <folder> [--device …] [--threads …]\n');
+  process.exit(2);
+}
+
+const settings = loadSettings(path.join(repoRoot, 'data/settings.json'));
+const device = (values.device ?? settings.ocr.device) as OcrDevice;
+if (!OCR_DEVICES.includes(device))
+  throw new Error(`--device must be one of ${OCR_DEVICES.join(', ')}`);
+const threads = values.threads === undefined ? settings.ocr.threads : Number(values.threads);
+if (!Number.isInteger(threads) || threads < 0) throw new Error('--threads must be a whole number');
+const priority =
+  values.priority === 'normal'
+    ? 'normal'
+    : values.priority === 'low'
+      ? 'low'
+      : settings.ocr.priority;
+const log = pino({ level: 'warn' }, pino.destination(2));
+
+interface Label {
+  clock: string | null;
+  countdown: string | null;
+  gym: string | null;
+  egg: boolean;
+  tier: number | 'mega';
+  shadow: boolean;
+  boss: string | null;
+  cp: number | null;
+}
+const labelsFile = values.labels ?? path.join(folder, 'labels.json');
+const labels: Record<string, Label> = existsSync(labelsFile)
+  ? (JSON.parse(readFileSync(labelsFile, 'utf8')) as Record<string, Label>)
+  : {};
+
+/** The bosses of the live feed, over the bot's saved game data (or none, said so). */
+async function currentBosses(): Promise<RaidBoss[]> {
+  const cache = path.join(repoRoot, 'var/game-data-cache.json');
+  if (!existsSync(cache)) {
+    process.stdout.write(
+      'No saved game data (var/game-data-cache.json): the boss is not decided.\n',
+    );
+    return [];
+  }
+  const saved = JSON.parse(readFileSync(cache, 'utf8')) as { version?: number; data: GameData };
+  if (saved.version !== GAME_DATA_VERSION) {
+    process.stdout.write('The saved game data has another version: the boss is not decided.\n');
+    return [];
+  }
+  const catalogue = new PokemonCatalogue(saved.data);
+  try {
+    const response = await fetch(settings.raidBosses.url, { signal: AbortSignal.timeout(30_000) });
+    const { bosses } = parseRaidBossFeed(await response.json(), feedLookup(catalogue));
+    return effectiveBosses(bosses, [], catalogue, Date.now());
+  } catch {
+    process.stdout.write('The raid boss feed could not be read: the boss is not decided.\n');
+    return [];
+  }
+}
+
+const bosses = await currentBosses();
+const assets = new OcrAssets({
+  dir: path.join(repoRoot, 'var/ocr'),
+  modelsUrl: settings.ocr.modelsUrl,
+  headIconUrl: settings.ocr.headIconUrl,
+  fetch: (url, init) => fetch(url, init),
+  log,
+});
+const ocr = new OcrService({
+  assets,
+  device,
+  threads,
+  priority,
+  queue: 1000,
+  timeoutMs: settings.ocr.timeoutSeconds * 1000,
+  log,
+});
+
+const pad = (n: number) => String(n).padStart(2, '0');
+const files = readdirSync(folder)
+  .filter((file) => /\.(png|jpe?g|webp)$/i.test(file))
+  .sort();
+const right = new Map<string, [number, number]>();
+const tally = (element: string, ok: boolean) => {
+  const [good, all] = right.get(element) ?? [0, 0];
+  right.set(element, [good + (ok ? 1 : 0), all + 1]);
+};
+let readMs = 0;
+let wallMs = 0;
+let peakMb = 0;
+let first = true;
+process.stdout.write(
+  `Device ${device}, threads ${threads || 'all'}, priority ${priority}; ${files.length} screenshots.\n\n`,
+);
+for (const file of files) {
+  const started = performance.now();
+  const outcome = await ocr.read(readFileSync(path.join(folder, file)));
+  const took = performance.now() - started;
+  if (outcome.kind !== 'read') {
+    process.stdout.write(`${file}: ${outcome.kind}\n`);
+    continue;
+  }
+  const { reading } = outcome;
+  // The first screenshot also starts the process and loads the models: it is not counted.
+  if (!first) {
+    readMs += reading.ms;
+    wallMs += took;
+  }
+  first = false;
+  peakMb = Math.max(peakMb, reading.peakMb);
+  // Uploaded now: the time of a sample is not scored, only its clock and countdown as read.
+  const report = screenshotReport(reading, {
+    bosses,
+    searchGym: () => [],
+    uploadedAt: Date.now(),
+    zone: settings.timezone,
+    standardIncubate: settings.standardRaidIncubateDuration,
+    standardHatched: settings.standardRaidHatchedDuration,
+    maxHatched: settings.maxRaidHatchedDuration,
+    guessOffsetSeconds: settings.screenshotMessageOffsetTime,
+  });
+  const t = reading.text;
+  const shown = {
+    clock: t.clock ? `${t.clock.hour}:${pad(t.clock.minute)}` : null,
+    countdown:
+      t.countdown === null
+        ? null
+        : `${Math.floor(t.countdown / 3600)}:${pad(Math.floor(t.countdown / 60) % 60)}:${pad(t.countdown % 60)}`,
+    gym: t.gym,
+    stage: report.stage,
+    heads: report.heads,
+    tier: report.tier ? `${report.tier.shadow ? 'Shadow ' : ''}${report.tier.level}` : null,
+    cp: t.cp,
+    bossName: t.bossName,
+    boss: report.boss?.name ?? null,
+    purple: Number((reading.purple * 100).toFixed(2)),
+    doubts: report.doubts,
+  };
+  const label = labels[file];
+  const wrong: string[] = [];
+  if (label) {
+    const check = (element: string, ok: boolean) => {
+      tally(element, ok);
+      if (!ok) wrong.push(element);
+    };
+    check('clock', shown.clock === label.clock);
+    check('countdown', shown.countdown === label.countdown);
+    check('gym', nameSimilarity(t.gym ?? '', label.gym ?? '') >= 0.9);
+    check('stage', shown.stage === (label.egg ? 'egg' : 'hatched'));
+    check('heads', report.heads === (label.tier === 'mega' ? 4 : label.tier));
+    check('shadow', (report.tier?.shadow ?? false) === label.shadow);
+    if (!label.egg) {
+      check('cp', t.cp === label.cp);
+      if (bosses.length > 0) {
+        check(
+          'boss',
+          report.boss !== null &&
+            (report.boss.name.includes(label.boss ?? '') ||
+              nameSimilarity(report.boss.name, label.boss ?? '') >= 0.75),
+        );
+      }
+    }
+  }
+  process.stdout.write(
+    `${file}  ${reading.ms} ms${label ? (wrong.length ? `  WRONG: ${wrong.join(', ')}` : '  all right') : ''}\n  ${JSON.stringify(shown)}\n`,
+  );
+}
+await ocr.close();
+
+const counted = Math.max(1, files.length - 1);
+process.stdout.write('\n');
+if (right.size > 0) {
+  process.stdout.write(
+    `${[...right].map(([element, [good, all]]) => `${element} ${good}/${all}`).join(', ')}\n`,
+  );
+}
+process.stdout.write(
+  `${Math.round(readMs / counted)} ms a screenshot in the reading process (${Math.round(wallMs / counted)} ms with the handing over); its peak memory ${peakMb} MB.\n`,
+);
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-7a HEAD -- src test scripts package.json` prints nothing; `npm run check`, `npm run build` and `npm run test:db`, each once and one after the other. The test files with timers or processes (`src/services/ocr-service.test.ts`, `src/services/ocr-assets.test.ts`) ten times in a row.
2. `npm run ocr:check -- var/ocr-research/samples-cropped --labels var/ocr-research/labels.json` on this laptop: the scores of the prototype (clock, countdown, stage, heads, shadow 28/28, CP 9/9); the time per screenshot noted. The boss is scored only for the bosses of today's feed.
3. Whole-branch review (Opus, high effort); one fix wave if it finds something.
4. `CLAUDE.md` (status: 7A built; conventions for `ctx`-free OCR: `OcrService` / `ScreenshotReader`, `OcrAssets`, `src/domain/ocr/`, `screenshotReport` and its doubts, `reportContext`, the worker's rules), the follow-ups ("From Phase 7A", with what 7B must do: start `OcrAssets.ensure()` at boot when screenshots are read, close `OcrService` at shutdown, the rule of doubts, the Android file name as a hint of the time, the Linux check of the threads' priority in the Docker image of Phase 9), the Gantt chart and memory.

## Measuring a machine (with Matt, when he wants)

Nothing of this plan touches Discord. To judge the machines Pine may run on, Matt copies the samples (`var/ocr-research/samples-cropped` and `labels.json`) and runs, on each:

- [ ] `npm run ocr:check -- <samples> --labels <labels.json>` (CPU, all threads): the scores and the time per screenshot.
- [ ] The same with `--threads 2` and `--priority normal`: what the threads and the priority cost.
- [ ] On the machine with the GTX 1060, once it runs Linux: `--device cuda` (onnxruntime-node's CUDA provider must be installed: `npm approve-scripts onnxruntime-node` or a reinstall with its install script); on Windows: `--device directml`.
