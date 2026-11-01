# Phase 8M-6: The Web Map's Small Fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the small things the web-map plans 8M-1 to 8M-5M left open (follow-ups, "Left open (Minor)"), close `/raid`'s forum-access gap the map already refuses, and gather the page's look into named values for the visual pass Matt expects at staging.

**Architecture:** Each fix lives in the area it belongs to: the region editor's save and preview (`src/web/editor-save.ts`, `src/commands/regions/import.ts`, the editor page), the map's page and its data (`/api/me`, `MapRaid.place`), and one forum-access check shared by `/raid` and the map (`reportBarred`). The look is a set of CSS custom properties in one `theme.css`, read by Leaflet's drawing through `theme()`; nothing looks different.

**Tech Stack:** TypeScript 6.0, Fastify, Leaflet (all from 8M-1). No new package, no migration.

**Spec:** `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`, with the follow-ups sections "From Phase 8M-1" … "From Phase 8M-5M" of `docs/superpowers/plans/phase-0-follow-ups.md`. Ledger: `.superpowers/sdd/2026-10-17-phase-8m6-web-map-small-fixes/progress.md`.

**Where it runs:** in the worktree `C:\Users\<you>\IdeaProjects\Professor-Pine-wayfarer` on branch `wayfarer`, never in the main checkout.

**Every diff in this plan was run before the plan was written**, on the throwaway branch `proto-8m6` (worktree `var/proto-8m6`, on `wayfarer` 0c76ffe2), one commit per task, each typechecked (root and page) with its area's tests green; on the tip the full check (7,615 tests), the build, the userscript build and the database suite (448) were green. An Opus review went through the whole prototype; its findings (one Important, seven Minor) are folded into the commits below.

## Decisions in this plan

Rulings made while Matt was away (2026-10-17; ledger), for Matt to look at:

1. **`/raid` refuses a report the member could not follow, as the map does**: when the region's own raid forum, where the new raid would go, keeps the member out (every gym of that region, the common case), or when a raid already stands at the gym (one in two regions) in a forum that keeps them out; with the map's check and one sentence for both (also for raids read from screenshots, after the review) ("You cannot report a raid at this gym: you are kept out of the forum its raid would be in."); the map's 403 no longer says "Not allowed.".
2. **The editor's save is refused as stale only for what it uses:** this server's regions and the channels the save depends on; an unrelated channel or another server never refuses it.
3. **A refused channel name in the editor takes off the channel staged before it** (one undoable edit), so the panel never shows one name while Save would send another.
4. **A member without the member role is told which role they need** on the map (never on the region editor, never to someone outside the server).
5. **Every raid on the map carries its place**, so side-panel raids get address and Directions.
6. **The look as named values, no restyle:** one `theme.css`; Leaflet reads its colours from it; a test refuses colours anywhere else.

## Global Constraints

- Read `CLAUDE.md` first; its hard rules apply: never push, never start the bot or contact Discord, never edit legacy JS, never commit in the main checkout. Never read, print or stage `.env`. Read `docs/architecture/web.md` and `testing.md` ("How the suites run") before starting.
- Node 24, TypeScript **6.0.x**, ESM only; `.js` in relative imports; `strict`, `noUncheckedIndexedAccess`; no `any` without a justifying comment. `src/domain/` stays pure. **Tests never use the network.** A test that uses `vi.mock` is a `*.isolated.test.ts`; a test undoes its own fake timers, stubs and environment changes.
- Each task carries the full diff of the prototype commit it transcribes (branch `proto-8m6`). Apply it exactly (`git apply` of the diff saved outside the repository is fine); the task's Step 4 diff must print nothing before the task is committed.
- A task needs the typecheck (`npm run typecheck`, which covers the page) and its own tests green. The full `npm run check`, `npm run build` and `npm run test:db` after the last task (they wait on the machine-wide suite lock).
- Never `npm install`/`npm ci`.
- Commit after every task with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, as `Matt Legowski <googer@pobox.com>`; stage by explicit path; never `.idea/`, `var/`, `.env`; no title starting with a slash.

## Review Focus

1. **The page looks exactly as before** (every value one to one; the stylesheet loads before the script reads it).
2. **The editor's save:** never refused for what it does not use, always refused when a channel or region it uses changed while it waited.
3. **The editor's lines:** typed backslashes, backticks, `1.` and `<#id>` shown as typed; the bot's own code spans and mentions intact.
4. **`/raid` behaves as before** except the barred refusal (typed gym before the throttle; menu, screenshot and "Report it there" after).
5. **`missingRole`** reaches only members in the server who lack the role.

---

### Task 1: Region editor: the panel's wording, an honest outage answer, a stamp of this server (8M-6)

Prototype commit: `e000f5a517642eaf45e71de10669e7f4888d99ab`

The editor's preview says "a typo in a name" where `/region import` keeps "in the file". A member never confirmed as staff gets the page's `UNCONFIRMED` sentence while Discord is away, not a promise of saving later. The save's freshness check is two stamps of this server only: `regionsStamp` (versions, which channel holds which region; the verdict cache key with the left-out areas) and `channelsStamp` (only the channels the save depends on: the regions' channels and forums, those picked by id, and channels or categories named like those the plan would make), so another server's change or an unrelated channel never refuses a save. The editor's lines no longer escape a name twice (`plainWords`: the bot's code spans split off, split only on an unescaped backtick, mentions replaced before `unplain`). A refused channel name takes off the channel staged before it, as one undoable edit.

**Files:**

```
 src/commands/regions/import.ts      |  33 +++++++---
 src/domain/regions/region-import.ts |   2 +-
 src/web/client/editor-view.test.ts  |  36 +++++++++-
 src/web/client/editor-view.ts       |  16 +++--
 src/web/client/editor.ts            |   5 +-
 src/web/editor-routes.ts            |   8 ++-
 src/web/editor-save.test.ts         | 274 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/web/editor-save.ts              | 145 ++++++++++++++++++++++++++++++++--------
 8 files changed, 468 insertions(+), 51 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/editor-view.test.ts src/web/editor-save.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/regions/import.ts src/domain/regions/region-import.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor.ts src/web/editor-routes.ts src/web/editor-save.test.ts src/web/editor-save.ts` and `npx eslint src/commands/regions/import.ts src/domain/regions/region-import.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor.ts src/web/editor-routes.ts src/web/editor-save.test.ts src/web/editor-save.ts`.
- [ ] **Step 4: Check the transcription:** `git diff e000f5a517642eaf45e71de10669e7f4888d99ab -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Region editor: the panel's wording, an honest outage answer, a stamp of this server (8M-6)`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/regions/import.ts src/domain/regions/region-import.ts src/web/client/editor-view.test.ts src/web/client/editor-view.ts src/web/client/editor.ts src/web/editor-routes.ts src/web/editor-save.test.ts src/web/editor-save.ts`.

````diff
diff --git a/src/commands/regions/import.ts b/src/commands/regions/import.ts
index cd704400d3e27874c23e416030829244c192ed7e..fa5a2dffbe4afb708588675d73e3f7f12c6c8960 100644
--- a/src/commands/regions/import.ts
+++ b/src/commands/regions/import.ts
@@ -26,7 +26,7 @@ import {
   type LeftOutReason,
   type PlannedImport,
 } from '../../domain/regions/region-import.js';
-import { count, fitItems, plain, truncate } from '../../render/text.js';
+import { count, fitItems, plain, truncate, unplain } from '../../render/text.js';
 import { actionRow, container, fileComponent, separator, textDisplay } from '../../render/v2.js';
 import {
   importSummary,
@@ -301,18 +301,21 @@ export function previewWords(
       lines.push('Regions that are not in this file stay as they are.');
     }
   }
+  // The editor's names are typed into its panel, not read from a file.
+  const inFile = from === 'file' ? ' in the file' : '';
   const close = imports.filter((one) => one.nearMiss !== undefined).length;
   if (close > 0) {
     lines.push(
       close === 1
-        ? '**1 new channel has a name close to another**: is it a typo in the file?'
-        : `**${close} new channels have names close to others**: are they typos in the file?`,
+        ? `**1 new channel has a name close to another**: is it a typo${inFile}?`
+        : `**${close} new channels have names close to others**: are they typos${inFile}?`,
     );
   }
   if (newChannels.length > 0) {
     lines.push(
       `I would **create ${count(newChannels.length, 'channel')}**: ${names(newChannels, '#')}. ` +
-        'Check the names: a typo in the file makes a channel of that name.',
+        `Check the names: a typo ${from === 'file' ? 'in the file' : 'in a name'} makes a ` +
+        'channel of that name.',
     );
   }
   if (newCategories.length > 0) {
@@ -412,13 +415,25 @@ export function plainWords(
   lists: readonly ImportList[],
   channelNames: ReadonlyMap<string, string>,
 ): Worded {
-  // Names the bot made are code (`derived`), which strips backticks from them: every backtick
-  // is markdown. Names of a file or a member went through `plain`, whose escapes are undone.
+  // Names the bot made are code (`derived`), which strips backticks from them: a backtick after
+  // an even number of backslashes is markdown, and nothing inside one is escaped; one after an
+  // odd number was typed (`plain` wrote it as \`). Names of a file or a member went through
+  // `plain`, whose escapes outside code are undone (`unplain`: a typed backslash too, once).
+  // The bot's channel mentions are named first: a typed `<#…>` still has `plain`'s zero-width
+  // space after the `<` then, which `unplain` takes out.
   const plainText = (text: string): string =>
     text
-      .replace(/<#(\d+)>/gu, (_mention, id: string) => `#${channelNames.get(id) ?? id}`)
-      .replace(/\*\*|`/gu, '')
-      .replace(/\\([_*~|>#\-[\]()])/gu, '$1');
+      .split(/(?<=(?:^|[^\\])(?:\\\\)*)(`[^`]*`)/u)
+      .map((part, index) =>
+        index % 2 === 1
+          ? part.slice(1, -1)
+          : unplain(
+              part
+                .replace(/<#(\d+)>/gu, (_mention, id: string) => `#${channelNames.get(id) ?? id}`)
+                .replace(/\*\*/gu, ''),
+            ),
+      )
+      .join('');
   return {
     lines: lines.map(plainText),
     lists: lists
diff --git a/src/domain/regions/region-import.ts b/src/domain/regions/region-import.ts
index 3a8c43639492a662f976a213a26eb941456dc66f..0d64e338d263078e18aefe6698a8f18f018b65fd 100644
--- a/src/domain/regions/region-import.ts
+++ b/src/domain/regions/region-import.ts
@@ -59,7 +59,7 @@ export const MAX_CATEGORY_CHANNELS = 50;
 const NEAR_MISS = 2;
 
 /** By what two category names are the same: without case. */
-const categoryKey = (name: string): string => name.normalize('NFC').toLowerCase();
+export const categoryKey = (name: string): string => name.normalize('NFC').toLowerCase();
 
 /** A channel of the server as the plan needs it. `other`: voice, announcements, a stage. */
 export interface ServerChannel {
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index c29f42653f5813bc00d30d77eb343dafd089e6b4..d29076b0fde3205ac8328f44d84b009932aaa44d 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -450,11 +450,12 @@ describe('the region editor page', () => {
       category: 'Suburbs',
       refusal: undefined,
     };
-    const refused = pickerChange(state, DATA.channels, DATA.channels, LOADED);
+    const refused = pickerChange(state, null, DATA.channels, DATA.channels, LOADED);
     expect(refused.details).toBeUndefined();
     expect(refused.state).toEqual({ ...state, refusal: '#south exists: pick it from the list.' });
     const taken = pickerChange(
       { ...refused.state, name: ' North Hills ' },
+      null,
       DATA.channels,
       DATA.channels,
       LOADED,
@@ -463,6 +464,7 @@ describe('the region editor page', () => {
     expect(taken.state.refusal).toBeUndefined();
     const listed = pickerChange(
       { ...state, choice: 'id:100000000000000006' },
+      null,
       DATA.channels,
       DATA.channels,
       LOADED,
@@ -473,7 +475,37 @@ describe('the region editor page', () => {
     });
     // No name yet: no channel, the category kept for when it comes.
     expect(
-      pickerChange({ ...state, name: ' ' }, DATA.channels, DATA.channels, LOADED).details,
+      pickerChange({ ...state, name: ' ' }, null, DATA.channels, DATA.channels, LOADED).details,
+    ).toEqual({ channel: null, description: 'Suburbs' });
+  });
+
+  it('takes back the channel staged before when a name typed after it is refused', () => {
+    const state = {
+      key: newKey(0),
+      choice: 'new',
+      name: 'South',
+      category: 'Suburbs',
+      refusal: undefined,
+    };
+    // "North Hills" was staged; the panel now shows "South", refused: nothing hidden stays staged.
+    const refused = pickerChange(
+      state,
+      { create: 'North Hills' },
+      DATA.channels,
+      DATA.channels,
+      LOADED,
+    );
+    expect(refused.state.refusal).toBe('#south exists: pick it from the list.');
+    expect(refused.details).toEqual({ channel: null, description: 'Suburbs' });
+    // So does one after a channel picked from the list.
+    expect(
+      pickerChange(
+        state,
+        { id: '100000000000000006', name: 'north' },
+        DATA.channels,
+        DATA.channels,
+        LOADED,
+      ).details,
     ).toEqual({ channel: null, description: 'Suburbs' });
   });
 
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index 37cc22e5970d1b0c9291d5cc202c41d70493c341..ae01858554591f172f08be406ea3058d2c63e4c9 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -182,12 +182,15 @@ export function pickerShown(kept: PickerState | undefined, draft: Draft): Picker
 
 /**
  * What a change of the picker comes to: the picker as it is now, and the channel and category
- * to record for the region (a `details` edit), none when the name typed is refused as the
- * server would refuse it (`newChannelProblem`): the refusal is in the picker then. `choices`
- * are the channels the list offers (`channelChoices`).
+ * to record for the region (a `details` edit). A name typed that the server would refuse
+ * (`newChannelProblem`) puts the refusal in the picker and stages no channel: the one the region
+ * had (`staged`, a name typed before or a channel of the list) is taken off, so that what Save
+ * would send is never a name the picker no longer shows; nothing is recorded when it had none.
+ * `choices` are the channels the list offers (`channelChoices`).
  */
 export function pickerChange(
   state: PickerState,
+  staged: ChannelChoice | null,
   choices: EditorData['channels'],
   channels: EditorData['channels'],
   loaded: readonly LoadedRegion[],
@@ -210,7 +213,12 @@ export function pickerChange(
   const name = state.name.trim();
   if (name === '') return { state: shown, details: { channel: null, description } };
   const refusal = newChannelProblem(name, channels, loaded);
-  if (refusal !== undefined) return { state: { ...state, refusal }, details: undefined };
+  if (refusal !== undefined) {
+    return {
+      state: { ...state, refusal },
+      details: staged === null ? undefined : { channel: null, description },
+    };
+  }
   return { state: shown, details: { channel: { create: name }, description } };
 }
 
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index 0ae95d4c2b69992956ee415a3dd5c60972f767af..7775a09e05dfc0cbe24641be1ffc05b388487c41 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -951,8 +951,9 @@ class Editor {
       refusal: this.picker?.refusal,
     });
     const save = (): void => {
-      // A name the server would refuse records nothing: the refusal is shown instead.
-      const change = pickerChange(typed(), choices, this.data.channels, this.loaded);
+      // A name the server would refuse is shown refused, and takes off the channel staged before.
+      const staged = this.draft(draft.key)?.channel ?? null;
+      const change = pickerChange(typed(), staged, choices, this.data.channels, this.loaded);
       this.picker = change.state;
       refusal.textContent = change.state.refusal ?? '';
       showFields();
diff --git a/src/web/editor-routes.ts b/src/web/editor-routes.ts
index 24703467f0566941764f118a5f3dc6c3dfbab92c..e87a4d94e8c99b6b767878a57eb8e8b04848390b 100644
--- a/src/web/editor-routes.ts
+++ b/src/web/editor-routes.ts
@@ -61,7 +61,10 @@ const LOGIN_NOTICES: ReadonlyMap<string, string> = new Map([
   ['expired', 'This login link has expired. '],
 ]);
 
-/** What a preview or a save answers while Discord cannot say who asks. */
+/**
+ * What a preview or a save answers while Discord cannot say who asks, to staff it confirmed
+ * lately (`StaffSeen`); anybody else is told `UNCONFIRMED`, which promises no save.
+ */
 const UNREACHABLE =
   'Discord cannot be reached just now, so nothing can be saved. Try again in a moment.';
 
@@ -272,8 +275,9 @@ export function editorRoutes(scope: FastifyInstance, deps: WebDeps): void {
         case 'unknown-server':
           return sendFailure(request, reply, 503);
         case 'unreachable':
-        case 'unconfirmed':
           return reply.code(503).send({ error: UNREACHABLE });
+        case 'unconfirmed':
+          return reply.code(503).send({ error: UNCONFIRMED });
         case 'staff':
           break;
       }
diff --git a/src/web/editor-save.test.ts b/src/web/editor-save.test.ts
index e06bd82bb73917bf55d073e8c680e76d5bf1b1a6..97f638e3ddddbf28e2bd512f08f7c16ff7eebccf 100644
--- a/src/web/editor-save.test.ts
+++ b/src/web/editor-save.test.ts
@@ -195,6 +195,96 @@ describe('preview and save of the region editor', () => {
     expect(text).not.toContain('\\\\');
   });
 
+  it('says a name with a backslash or a leading number as it was typed', async () => {
+    const { post } = await made();
+    const answer = await post(
+      PREVIEW,
+      request({
+        additions: [
+          {
+            channel: { name: 'North\\Hills' },
+            description: null,
+            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+          },
+          {
+            channel: { name: '1. Uptown' },
+            description: null,
+            outline: points(squareRing(40.2, -80.1, 40.3, -80.0)),
+          },
+        ],
+      }),
+    );
+    expect(answer.status).toBe(200);
+    const items = answer.json.kind === 'preview' ? answer.json.worded.lists[0]?.items : [];
+    expect(items?.map((item) => item.split(' → ')[0])).toEqual(
+      expect.arrayContaining(['North\\Hills', '1. Uptown']),
+    );
+  });
+
+  it('says a name with a backtick as typed, next to the channel it makes', async () => {
+    const { post } = await made();
+    const answer = await post(
+      PREVIEW,
+      request({
+        additions: [
+          {
+            channel: { name: 'North`Hills' },
+            description: null,
+            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+          },
+        ],
+      }),
+    );
+    expect(answer.status).toBe(200);
+    const items = answer.json.kind === 'preview' ? answer.json.worded.lists[0]?.items : [];
+    expect(items?.[0]).toMatch(/^North`Hills → new channel #northhills /u);
+  });
+
+  it('keeps a typed channel mention as typed text', async () => {
+    const { post } = await made();
+    const typed = `<#${SOUTH_CHANNEL}>`;
+    const answer = await post(
+      PREVIEW,
+      request({
+        additions: [
+          {
+            channel: { name: `Near ${typed}` },
+            description: null,
+            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+          },
+        ],
+      }),
+    );
+    expect(answer.status).toBe(200);
+    const text = JSON.stringify(answer.json);
+    expect(text).toContain(`Near ${typed}`);
+    expect(text).not.toContain('#south');
+  });
+
+  it('words a new channel for the panel it was typed in, not for a file', async () => {
+    const { post } = await made();
+    const answer = await post(
+      PREVIEW,
+      request({
+        additions: [
+          {
+            channel: { name: 'Sooth' },
+            description: null,
+            outline: points(squareRing(39.9, -80.1, 40.0, -80.0)),
+          },
+        ],
+      }),
+    );
+    expect(answer.status).toBe(200);
+    const lines = answer.json.kind === 'preview' ? answer.json.worded.lines : [];
+    expect(lines).toContain('1 new channel has a name close to another: is it a typo?');
+    expect(lines).toContain(
+      'I would create 1 channel: #sooth. Check the names: a typo in a name makes a channel of ' +
+        'that name.',
+    );
+    expect(JSON.stringify(lines)).not.toContain('file');
+  });
+
   it('removes a region, keeping or deleting its forum, with what goes with it', async () => {
     const { post, editing } = await made();
     const removal = request({
@@ -398,10 +488,27 @@ describe('preview and save of the region editor', () => {
     const staff = new FakeRegionStaff();
     staff.failing = new Error('Discord is away');
     const { post, editing } = await made(staff);
-    const answer = await post(
-      SAVE,
-      request({ removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }] }),
-    );
+    const removal = request({
+      removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
+    });
+    // Never confirmed as staff: nothing is promised for later.
+    const unconfirmed = await post(SAVE, removal);
+    expect(unconfirmed.status).toBe(503);
+    expect(unconfirmed.json).toEqual({
+      error: 'Discord cannot be reached just now, so I cannot tell whether you are staff.',
+    });
+    expect(editing.regions.rows).toHaveLength(3);
+  });
+
+  it('tells staff seen lately that nothing can be saved while Discord is away', async () => {
+    const staff = new FakeRegionStaff().asStaff(STAFF);
+    const { post, editing } = await made(staff);
+    const removal = request({
+      removals: [{ regionId: 2, forum: 'keep', version: regionVersion(EAST, null) }],
+    });
+    expect((await post(PREVIEW, removal)).status).toBe(200);
+    staff.failing = new Error('Discord is away');
+    const answer = await post(SAVE, removal);
     expect(answer.status).toBe(503);
     expect(answer.json).toEqual({
       error: 'Discord cannot be reached just now, so nothing can be saved. Try again in a moment.',
@@ -549,6 +656,148 @@ describe('preview and save of the region editor', () => {
     expect(editing.regions.rows.find((region) => region.id === 2)?.bounds).toEqual(EAST);
   });
 
+  it("saves on when only another server's regions changed while the save waited", async () => {
+    const { post, editing } = await made();
+    let release: () => void = () => undefined;
+    const held = editing.lock.run(
+      () =>
+        new Promise<void>((resolve) => {
+          release = resolve;
+        }),
+    );
+    const reached = lockReached(editing.lock, 1);
+    const saving = post(
+      SAVE,
+      request({
+        changes: [
+          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
+        ],
+      }),
+    );
+    await reached;
+    // Another server's region, as its own editor or import adds it meanwhile.
+    const west = editing.regions.rows.find((region) => region.id === 1)!;
+    editing.regions.rows = [
+      ...editing.regions.rows,
+      { ...west, id: 9, guildId: 2, channelId: '800000000000000009', forumChannelId: null },
+    ];
+    release();
+    await held;
+    const answer = await saving;
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({ kind: 'saved' });
+    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
+  });
+
+  it("refuses a save when the server's channels changed while it waited", async () => {
+    const { post, editing } = await made();
+    let release: () => void = () => undefined;
+    const held = editing.lock.run(
+      () =>
+        new Promise<void>((resolve) => {
+          release = resolve;
+        }),
+    );
+    const reached = lockReached(editing.lock, 1);
+    const saving = post(
+      SAVE,
+      request({
+        additions: [
+          {
+            channel: { name: 'North Hills' },
+            description: null,
+            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+          },
+        ],
+      }),
+    );
+    await reached;
+    // Somebody made a channel of that name on Discord meanwhile.
+    editing.gateway.addChannel('800000000000000010', 'north-hills');
+    release();
+    await held;
+    const answer = await saving;
+    expect(answer.status).toBe(409);
+    expect(answer.json).toEqual({
+      kind: 'stale',
+      line: 'The regions changed meanwhile: preview again.',
+    });
+    expect(editing.regions.rows).toHaveLength(3);
+  });
+
+  it('refuses a save when the category its new channel names was made while it waited', async () => {
+    const { post, editing } = await made();
+    let release: () => void = () => undefined;
+    const held = editing.lock.run(
+      () =>
+        new Promise<void>((resolve) => {
+          release = resolve;
+        }),
+    );
+    const reached = lockReached(editing.lock, 1);
+    const saving = post(
+      SAVE,
+      request({
+        additions: [
+          {
+            channel: { name: 'North Hills' },
+            description: 'Suburbs',
+            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+          },
+        ],
+      }),
+    );
+    await reached;
+    // The import would now put the channel in that category rather than make one.
+    editing.gateway.addChannel('800000000000000011', 'SUBURBS', { kind: 'category' });
+    release();
+    await held;
+    const answer = await saving;
+    expect(answer.status).toBe(409);
+    expect(answer.json).toMatchObject({ kind: 'stale' });
+    expect(editing.regions.rows).toHaveLength(3);
+  });
+
+  it('saves on when only channels the save does not use came or went while it waited', async () => {
+    const { post, editing } = await made();
+    let release: () => void = () => undefined;
+    const held = editing.lock.run(
+      () =>
+        new Promise<void>((resolve) => {
+          release = resolve;
+        }),
+    );
+    const reached = lockReached(editing.lock, 1);
+    const saving = post(
+      SAVE,
+      request({
+        changes: [
+          { regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) },
+        ],
+        additions: [
+          {
+            channel: { name: 'North Hills' },
+            description: 'Suburbs',
+            outline: points(squareRing(40.1, -80.1, 40.2, -80.0)),
+          },
+        ],
+      }),
+    );
+    await reached;
+    // A ticket bot's channel and category, as such bots make and delete them all day.
+    editing.gateway.addChannel('800000000000000012', 'Tickets', { kind: 'category' });
+    editing.gateway.addChannel('800000000000000013', 'ticket-0042', {
+      categoryId: '800000000000000012',
+    });
+    release();
+    await held;
+    const answer = await saving;
+    expect(answer.status).toBe(200);
+    expect(answer.json).toMatchObject({ kind: 'saved' });
+    expect(editing.regions.rows.find((region) => region.id === 1)?.bounds).toEqual(WEST_SHRUNK);
+    expect(editing.regions.rows).toHaveLength(4);
+  });
+
   it('creates nothing for a region removed while its save waited', async () => {
     const { post, editing } = await made();
     let release: () => void = () => undefined;
@@ -698,6 +947,23 @@ describe('preview and save of the region editor', () => {
     expect(checks.count).toBe(2);
   });
 
+  it('checks a previewed save only once though a channel it does not use was made meanwhile', async () => {
+    const checks = new Tally();
+    const { post, editing } = await made(undefined, {
+      check: (before, after) => {
+        checks.add();
+        return inThisThread.check(before, after);
+      },
+    });
+    const change = request({
+      changes: [{ regionId: 1, outline: points(WEST_SHRUNK), version: regionVersion(WEST, null) }],
+    });
+    expect((await post(PREVIEW, change)).status).toBe(200);
+    editing.gateway.addChannel('800000000000000013', 'ticket-0042');
+    expect((await post(SAVE, change)).status).toBe(200);
+    expect(checks.count).toBe(1);
+  });
+
   it('never reads the body of a request it refuses, and limits each address', async () => {
     const { web, headers } = await made();
     let read = false;
diff --git a/src/web/editor-save.ts b/src/web/editor-save.ts
index 7e2ab6026c0c711ded97b0f255d221caffa9e356..6e0f5ec50968ddbbc8924b252c07b3c74ffc20dc 100644
--- a/src/web/editor-save.ts
+++ b/src/web/editor-save.ts
@@ -13,7 +13,12 @@ import type { Region } from '../db/repositories/region-repository.js';
 import { MAX_KML_AREAS, MAX_KML_CORNERS } from '../domain/geo/kml.js';
 import { MAX_OUTLINE_CORNERS } from '../domain/geo/outline.js';
 import type { Piece } from '../domain/regions/coverage.js';
-import type { ServerChannel } from '../domain/regions/region-import.js';
+import {
+  categoryKey,
+  categoryNameFor,
+  channelKey,
+  type ServerChannel,
+} from '../domain/regions/region-import.js';
 import {
   MAX_NEW_CATEGORY,
   MAX_NEW_CHANNEL_NAME,
@@ -212,26 +217,104 @@ export const CLOSING = 'Pine is shutting down: try again in a few minutes.';
  */
 export type SaveOutcome = SaveAnswer | { kind: 'later'; error: string };
 
+const byId = <T extends { id: string }>(a: T, b: T): number =>
+  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
+
+/** The regions of this server and those on its channels (`regionsStamp`). */
+function regionsHere(
+  guildId: number,
+  regions: readonly Region[],
+  channels: readonly ServerChannel[],
+): Region[] {
+  const own = new Set(channels.map((channel) => channel.id));
+  return regions.filter((region) => region.guildId === guildId || own.has(region.channelId));
+}
+
 /**
- * What a save is checked against, as text: the versions of all the server's regions and which
- * channel is the region of which row (of any server). A save runs only when this is the same
- * under the lock as when it was planned and checked: another save, an import or a removal
- * meanwhile, of any region of the server (two edits that together make a new overlap) or of the
- * channel it adds, makes it `stale`.
+ * The regions a save is checked against, as text, of this server alone: the versions of its
+ * regions and which of its channels is the region of which row (also a row of no server on one
+ * of them, which `planSave` counts as a region). Another save, an import or a removal meanwhile,
+ * of any region of the server (two edits that together make a new overlap), changes it; another
+ * server's regions do not. The verdict of a check is kept by it (`checkKey`).
  */
-function regionsStamp(guildId: number, regions: readonly Region[]): string {
+function regionsStamp(
+  guildId: number,
+  regions: readonly Region[],
+  channels: readonly ServerChannel[],
+): string {
   const versions = regions
     .filter((region) => region.guildId === guildId)
     .map((region) => [region.id, regionVersion(region.bounds, region.description)]);
-  const channels = regions
-    .map((region): [string, number] => [region.channelId, region.id])
-    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
-  return JSON.stringify([versions, channels]);
+  const regionChannels = regionsHere(guildId, regions, channels)
+    .map((region) => ({ id: region.channelId, region: region.id }))
+    .sort(byId)
+    .map(({ id, region }) => [id, region]);
+  return JSON.stringify([versions, regionChannels]);
 }
 
 /**
- * What the check of a save is of: the request and what it is checked against (`regionsStamp`;
- * `SaveChecks` keeps verdicts by it), as a hash.
+ * What of the server's channels a save depends on, by its plan: the channels it takes by id,
+ * the names its areas go to (`channelKey`: the channel the import takes or makes), and the
+ * categories a new channel of theirs would go into (`categoryKey`).
+ */
+interface Watched {
+  ids: ReadonlySet<string>;
+  names: ReadonlySet<string>;
+  categories: ReadonlySet<string>;
+}
+
+function watchedBy(plan: SavePlan, request: SaveRequest): Watched {
+  return {
+    ids: new Set(
+      request.additions.flatMap((addition) =>
+        'id' in addition.channel ? [addition.channel.id] : [],
+      ),
+    ),
+    names: new Set(plan.areas.map((area) => channelKey(area.name))),
+    categories: new Set(
+      plan.areas.flatMap((area) => {
+        const category = categoryNameFor(area);
+        return category === null ? [] : [categoryKey(category)];
+      }),
+    ),
+  };
+}
+
+/**
+ * The channels a save depends on, as text (id, name, kind, category): the channels and forums
+ * of the regions of `regionsStamp`, those `watched` names, and every channel or category whose
+ * name stands for a name the plan goes to or a category it names. A channel made, renamed or
+ * deleted there meanwhile (one of the name a new region would make) changes it; the server's
+ * other channels (a ticket or voice bot's, which come and go all day) do not.
+ */
+function channelsStamp(
+  guildId: number,
+  regions: readonly Region[],
+  channels: readonly ServerChannel[],
+  watched: Watched,
+): string {
+  const ids = new Set(watched.ids);
+  for (const region of regionsHere(guildId, regions, channels)) {
+    ids.add(region.channelId);
+    if (region.forumChannelId !== null) ids.add(region.forumChannelId);
+  }
+  return JSON.stringify(
+    channels
+      .filter(
+        (channel) =>
+          ids.has(channel.id) ||
+          watched.names.has(channelKey(channel.name)) ||
+          (channel.kind === 'category' && watched.categories.has(categoryKey(channel.name))),
+      )
+      .sort(byId)
+      .map(({ id, name, kind, categoryId }) => [id, name, kind, categoryId]),
+  );
+}
+
+/**
+ * What the check of a save is of: the request, the regions it is checked against
+ * (`regionsStamp`; never the channels: a channel coming or going leaves the outlines as they
+ * are) and the areas the import leaves out, as a hash (`SaveChecks` keeps verdicts by it).
  */
 function checkKey(staff: RegionStaff, request: SaveRequest, stamp: string): string {
   return createHash('sha256')
@@ -278,8 +361,10 @@ interface Prepared {
   channels: ServerChannel[];
   names: SaveNames;
   regions: ReadonlyMap<number, Region>;
-  /** What it was planned and checked against (`regionsStamp`). */
+  /** What it was planned and checked against (`regionsStamp` and `channelsStamp`). */
   stamp: string;
+  /** The channels it depends on (`channelsStamp`). */
+  watched: Watched;
 }
 
 /**
@@ -301,10 +386,12 @@ async function prepare(
 ): Promise<{ answer: SaveOutcome } | Prepared> {
   const { admin, log } = editing;
   const all = editing.regions.all();
-  const stamp = regionsStamp(staff.guildId, all);
-  const regions = new Map(all.map((region) => [region.id, region]));
   const channels = admin.channelsOf(staff);
+  const regionsNow = regionsStamp(staff.guildId, all, channels);
+  const regions = new Map(all.map((region) => [region.id, region]));
   const plan = planSave(request, { guildId: staff.guildId, regions: all, channels });
+  const watched = watchedBy(plan, request);
+  const stamp = regionsNow + channelsStamp(staff.guildId, all, channels, watched);
   const names = new SaveNames(regions, channels, request);
   if (plan.conflicts.length > 0) {
     return { answer: conflictAnswer(all, staff, channels, plan.conflicts) };
@@ -332,7 +419,7 @@ async function prepare(
   );
   // What the import will write is checked: the areas it leaves out are not written.
   const leftOut = new Set(preview.leftOut.map((left) => left.name));
-  const key = checkKey(staff, request, `${stamp}${JSON.stringify([...leftOut].sort())}`);
+  const key = checkKey(staff, request, `${regionsNow}${JSON.stringify([...leftOut].sort())}`);
   const verdict = await checks.check(key, plan.before, outlinesWritten(plan, leftOut));
   switch (verdict.kind) {
     case 'unavailable':
@@ -367,7 +454,7 @@ async function prepare(
       break;
   }
   if (refused.length > 0) return { answer: { kind: 'refused', lines: refused } };
-  return { plan, preview, channels, names, regions, stamp };
+  return { plan, preview, channels, names, regions, stamp, watched };
 }
 
 const channelNamesOf = (channels: readonly ServerChannel[]): Map<string, string> =>
@@ -432,12 +519,12 @@ export async function previewSave(
  * then `RegionAdminService.save` of the outlines the plan takes and the regions to remove, in
  * one run under the admin lock, which first looks again whether the regions are still as the
  * page loaded them (else nothing is done and the answer is the conflicts, as above), and then
- * whether all the server's regions and the channels of all regions are still as the save was
- * planned and checked against (`regionsStamp`; else nothing is done: `stale`). The answer
- * says what was done region by region in `/region import`'s and `/region remove`'s words; areas
- * left out of the plan are among "Not imported", a removal that failed is said. Logged as a
- * command is: who, which server, how many; never a name. When the web server began closing
- * (`closing`) while the save was checked, nothing is started: `later`.
+ * whether the server's regions, the regions of its channels and the channels the save depends on
+ * are still as it was planned and checked against (`regionsStamp`, `channelsStamp`; else nothing
+ * is done: `stale`). The answer says what was done region by region in `/region import`'s and
+ * `/region remove`'s words; areas left out of the plan are among "Not imported", a removal that
+ * failed is said. Logged as a command is: who, which server, how many; never a name. When the
+ * web server began closing (`closing`) while the save was checked, nothing is started: `later`.
  */
 export async function carryOutSave(
   editing: RegionEditing,
@@ -450,7 +537,7 @@ export async function carryOutSave(
   if ('answer' in prepared) return prepared.answer;
   // The bot began to shut down while the save was checked: nothing is started now.
   if (closing()) return { kind: 'later', error: CLOSING };
-  const { plan, preview, regions, stamp } = prepared;
+  const { plan, preview, regions, stamp, watched } = prepared;
   const { admin, log } = editing;
   const done = await admin.save(
     staff,
@@ -458,13 +545,17 @@ export async function carryOutSave(
     plan.removals,
     (): readonly ({ regionId: number; gone: boolean } | { stale: true })[] => {
       const now = editing.regions.all();
+      const channels = admin.channelsOf(staff);
       const conflicts = planSave(request, {
         guildId: staff.guildId,
         regions: now,
-        channels: admin.channelsOf(staff),
+        channels,
       }).conflicts;
       if (conflicts.length > 0) return conflicts;
-      return regionsStamp(staff.guildId, now) === stamp ? [] : [{ stale: true }];
+      const stampNow =
+        regionsStamp(staff.guildId, now, channels) +
+        channelsStamp(staff.guildId, now, channels, watched);
+      return stampNow === stamp ? [] : [{ stale: true }];
     },
   );
   if (done.kind === 'changed') {
````

### Task 2: Live map: log out on 2xx only, the member role's header, Directions in the side panel (8M-6)

Prototype commit: `0a68548c0b8996da5648645416c5582b07162386`

`logOut` counts only a 2xx as done. `/api/me` gains `missingRole` (the role's name, only for a member in the server who lacks `settings.web.memberRole`), and the map's header says they can look around but need that role to join or report; the region editor's header leaves that line out (`headerLines` takes the page). Every raid carries `place` (name, position, address), so a side-panel raid at a gym the map does not show has its name, address and Directions. A right click or long press on a raid's picture reaches "Report spawn here" (`contextMenuToMap`). The meetup editor compares information with line endings normalised.

**Files:**

```
 src/domain/web/party-data.ts                | 15 +++++++++++++++
 src/domain/web/party-view.test.ts           |  7 +++++++
 src/domain/web/party-view.ts                | 12 +++++++++++-
 src/render/raid-post.test.ts                | 23 +++++++++++++++++++++--
 src/render/raid-post.ts                     | 24 +++++++++++++++++++++---
 src/web/client/common.ts                    | 10 +++++++---
 src/web/client/editor.ts                    |  2 +-
 src/web/client/logout.test.ts               | 11 +++++++++++
 src/web/client/logout.ts                    | 11 +++++++----
 src/web/client/main.ts                      |  2 +-
 src/web/client/meetup-forms.test.ts         | 11 +++++++++++
 src/web/client/meetup-forms.ts              | 11 +++++++++--
 src/web/client/notice.test.ts               | 38 +++++++++++++++++++++++++++++++++-----
 src/web/client/notice.ts                    | 30 +++++++++++++++++++++++++++---
 src/web/client/parties.test.ts              | 25 ++++++++++++++++++++++++-
 src/web/client/parties.ts                   | 15 ++++++++++++---
 src/web/client/party-layer.isolated.test.ts | 25 ++++++++++++++++++++++++-
 src/web/client/party-layer.ts               | 16 ++++++++++++++++
 src/web/client/popup.ts                     |  2 +-
 src/web/client/raid-forms.test.ts           |  1 +
 src/web/guild-routes.ts                     | 19 +++++++++++++------
 src/web/login.test.ts                       | 21 +++++++++++++++++++--
 22 files changed, 292 insertions(+), 39 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/render/raid-post.test.ts src/web/client/logout.test.ts src/web/client/meetup-forms.test.ts src/web/client/notice.test.ts src/web/client/parties.test.ts src/web/client/party-layer.isolated.test.ts src/web/client/raid-forms.test.ts src/web/login.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/render/raid-post.test.ts src/render/raid-post.ts src/web/client/common.ts src/web/client/editor.ts src/web/client/logout.test.ts src/web/client/logout.ts src/web/client/main.ts src/web/client/meetup-forms.test.ts src/web/client/meetup-forms.ts src/web/client/notice.test.ts src/web/client/notice.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.isolated.test.ts src/web/client/party-layer.ts src/web/client/popup.ts src/web/client/raid-forms.test.ts src/web/guild-routes.ts src/web/login.test.ts` and `npx eslint src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/render/raid-post.test.ts src/render/raid-post.ts src/web/client/common.ts src/web/client/editor.ts src/web/client/logout.test.ts src/web/client/logout.ts src/web/client/main.ts src/web/client/meetup-forms.test.ts src/web/client/meetup-forms.ts src/web/client/notice.test.ts src/web/client/notice.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.isolated.test.ts src/web/client/party-layer.ts src/web/client/popup.ts src/web/client/raid-forms.test.ts src/web/guild-routes.ts src/web/login.test.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 0a68548c0b8996da5648645416c5582b07162386 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Live map: log out on 2xx only, the member role's header, Directions in the side panel (8M-6)`, the paragraph above as the body and the trailer, staging exactly
  `src/domain/web/party-data.ts src/domain/web/party-view.test.ts src/domain/web/party-view.ts src/render/raid-post.test.ts src/render/raid-post.ts src/web/client/common.ts src/web/client/editor.ts src/web/client/logout.test.ts src/web/client/logout.ts src/web/client/main.ts src/web/client/meetup-forms.test.ts src/web/client/meetup-forms.ts src/web/client/notice.test.ts src/web/client/notice.ts src/web/client/parties.test.ts src/web/client/parties.ts src/web/client/party-layer.isolated.test.ts src/web/client/party-layer.ts src/web/client/popup.ts src/web/client/raid-forms.test.ts src/web/guild-routes.ts src/web/login.test.ts`.

````diff
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index 5ed96c962ad18648f4e702526e44b9134c07d2f9..325011426a19ca0619715b61de4a9da876ff719e 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -37,6 +37,16 @@ export interface MapAttendance {
   actions: MapPress[];
 }
 
+/** A raid's gym as its post names it: the name it shows, its place, its address line. */
+export interface MapRaidPlace {
+  name: string;
+  /** Six decimals. */
+  lat: number;
+  lon: number;
+  /** The address line (`addressLine`), or null when nothing of it is known. */
+  address: string | null;
+}
+
 export interface MapRaid {
   kind: 'raid';
   id: string;
@@ -55,6 +65,11 @@ export interface MapRaid {
   endTime: number | null;
   /** The post on Discord (`https://discord.com/channels/…`, which opens the app). */
   link: string;
+  /**
+   * Where it is, as its post's Where names it (plan 8M-6): what the side panel shows of a raid at
+   * a gym the map does not show. Null once the gym was deleted.
+   */
+  place: MapRaidPlace | null;
   /**
    * Whether the member may change its times, boss and moves on the map (signed up, or staff;
    * plan 8M-4); never while read-only.
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index bea0eea6b6c7d6b87d6deff9569a1e743c51e73a..2358465f83e554629f182bfd457a85340724887a 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -78,6 +78,7 @@ describe('partyView', () => {
         hatchTime: at('2026-10-13T14:30'),
         endTime: egg.endTime,
         link: `https://discord.com/channels/${GUILD}/700000000000000001`,
+        place: null,
         mayChange: false,
         attendance: {
           groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
@@ -90,6 +91,12 @@ describe('partyView', () => {
     expect(view.meetups).toEqual([]);
   });
 
+  it("says where a raid is as its post's Where does, for a gym the map may not show", () => {
+    const place = { name: 'The Stacks', lat: 40.050000049, lon: -80.0500001, address: null };
+    const [raid] = partyView(input([egg], { look: () => ({ place }) })).raids;
+    expect(raid?.place).toEqual({ name: 'The Stacks', lat: 40.05, lon: -80.05, address: null });
+  });
+
   it('counts heads per status and group as the post does, a +1 counted and a member asked as present', () => {
     const raid = withAttendees(egg, {
       [ALICE]: { status: PartyStatus.Coming, number: 3 },
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index 90af25bf8d9b4c59c802dd8e3be1944bae64c626..d8c94fb42c05fefd9f78a2992ce708d22dd08dfa 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -31,6 +31,7 @@ import type {
   MapParty,
   MapPress,
   MapRaid,
+  MapRaidPlace,
   MapStatus,
   MapConductor,
   MapTrain,
@@ -49,12 +50,18 @@ export type * from './party-data.js';
  * them. The post, one tap away, shows names to whoever may see them.
  */
 
-/** How a raid's post looks: its picture and the boss it names (`raidLook` of the renderer). */
+/**
+ * How a raid's post looks: its picture, the boss it names and where it is (`raidLook` of the
+ * renderer).
+ */
 export interface RaidLook {
   picture?: string;
   boss?: string;
+  place?: MapRaidPlace;
 }
 
+const round = (value: number): number => Math.round(value * 1e6) / 1e6;
+
 export interface PartyViewInput {
   /** The server's snowflake, for the links to the posts. */
   guildId: string;
@@ -190,6 +197,9 @@ function raidOf(party: RaidParty, link: string, input: PartyViewInput): MapRaid
     hatchTime: party.hatchTime,
     endTime: party.endTime,
     link,
+    place: look.place
+      ? { ...look.place, lat: round(look.place.lat), lon: round(look.place.lon) }
+      : null,
     mayChange: !input.readOnly && mayChangeRaid(party, input.memberId, input.staff),
     attendance: attendanceOf(party, input, stage === 'hatched'),
   };
diff --git a/src/render/raid-post.test.ts b/src/render/raid-post.test.ts
index fbafa5a41c2968e31f036c8801fc82a2e7c5ba18..c809f796b654b9bf6b1a204f948127354993d854 100644
--- a/src/render/raid-post.test.ts
+++ b/src/render/raid-post.test.ts
@@ -438,14 +438,33 @@ describe('renderRaidPost', () => {
       expect(raidLook(shown).picture).toBe(thumbnailOf(renderRaidPost(shown).message));
       return raidLook(shown);
     };
-    expect(looked(egg)).toEqual({ picture });
-    expect(looked(named)).toEqual({ picture, boss: 'Yveltal' });
+    const place = { name: 'The Stacks', lat: 40.05, lon: -80.05, address: LIBRARY_ADDRESS };
+    expect(looked(egg)).toEqual({ picture, place });
+    expect(looked(named)).toEqual({ picture, boss: 'Yveltal', place });
     expect(looked(named, at('2026-10-13T14:40'))).toEqual({
       picture: expect.stringMatching(/pm717/) as unknown,
       boss: 'Yveltal',
+      place,
     });
   });
 
+  it('gives the live map where the raid is as its Where names it, without an address unknown', () => {
+    expect(raidLook(view(egg)).place).toEqual({
+      name: 'The Stacks',
+      lat: 40.05,
+      lon: -80.05,
+      address: LIBRARY_ADDRESS,
+    });
+    expect(raidLook(view(egg, { gym: { ...library!, geodata: null } })).place).toEqual({
+      name: 'The Stacks',
+      lat: 40.05,
+      lon: -80.05,
+      address: null,
+    });
+    // A gym that is gone: nowhere to go.
+    expect(raidLook(view(egg, { gym: undefined }))).not.toHaveProperty('place');
+  });
+
   it('shows a raid closed while it was an egg as that egg in its last showing', () => {
     // Seen in the staging of 8A: an egg moved to another region ended with its boss's picture.
     const picture = 'https://example.test/raid_egg_5_icon.png';
diff --git a/src/render/raid-post.ts b/src/render/raid-post.ts
index 5555db721e745c65abd8b57aad1ab9d8c861360d..ba38d3e1ea82aae0a2173ebbc98560b332466786 100644
--- a/src/render/raid-post.ts
+++ b/src/render/raid-post.ts
@@ -491,16 +491,34 @@ function pictureFileOf(view: RaidPostView): string | undefined {
 }
 
 /**
- * How the live map shows a raid (plan 8M-3): the post's picture, and the boss the post names
- * (what it is fought against, or what the egg hatches as), decided here as for the post.
+ * How the live map shows a raid (plan 8M-3): the post's picture, the boss the post names (what
+ * it is fought against, or what the egg hatches as), and where it is as Where names it (the
+ * gym's name as the post shows it, its place and address line, null when unknown; plan 8M-6:
+ * the side panel's raids at gyms the map does not show), decided here as for the post. No place
+ * for a gym that is gone.
  */
-export function raidLook(view: RaidPostView): { picture?: string; boss?: string } {
+export function raidLook(view: RaidPostView): {
+  picture?: string;
+  boss?: string;
+  place?: { name: string; lat: number; lon: number; address: string | null };
+} {
   const { fought, expected } = bosses(view);
   const picture = pictureOf(view);
   const boss = (fought ?? expected)?.name;
+  const { gym } = view;
   return {
     ...(picture === undefined ? {} : { picture }),
     ...(boss === undefined ? {} : { boss }),
+    ...(gym === undefined
+      ? {}
+      : {
+          place: {
+            name: gymName(gym),
+            lat: gym.lat,
+            lon: gym.lon,
+            address: addressLine(gym.geodata ?? null) || null,
+          },
+        }),
   };
 }
 
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
index 48025214c8cff94238246a581c130f0e40dcb74b..7304eff05dd0282dfa0e626b5e8ad178afb6d84b 100644
--- a/src/web/client/common.ts
+++ b/src/web/client/common.ts
@@ -8,7 +8,7 @@ import {
   type TileLayerSpec,
 } from './layers.js';
 import { LOGOUT_FAILED, logOut } from './logout.js';
-import { headerLines, type Me } from './notice.js';
+import { headerLines, type Me, type WebPage } from './notice.js';
 
 /**
  * What the map page and the region editor share (plans 8M-1, 8M-2): the elements of the page,
@@ -133,10 +133,14 @@ export async function whoIsAsking(guild: string): Promise<Me> {
 }
 
 /** The header's account: the login, or the member's name with Log out, and what they may not. */
-export async function showAccount(guild: string, login: 'discord' | 'links'): Promise<Me> {
+export async function showAccount(
+  guild: string,
+  login: 'discord' | 'links',
+  page: WebPage,
+): Promise<Me> {
   const account = byId('account');
   const me = await whoIsAsking(guild);
-  const header = headerLines(me, login);
+  const header = headerLines(me, login, page);
   account.replaceChildren();
   if (header.login) {
     const link = document.createElement('a');
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index 7775a09e05dfc0cbe24641be1ffc05b388487c41..a1f220f72ea41537b40c9db4963d0f8acea1a62a 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -1560,7 +1560,7 @@ async function start(): Promise<void> {
     say(notice.text);
     history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
   }
-  const me = await showAccount(guild, dataset.login === 'discord' ? 'discord' : 'links');
+  const me = await showAccount(guild, dataset.login === 'discord' ? 'discord' : 'links', 'editor');
   let data: EditorData;
   try {
     data = await getJson<EditorData>(`/s/${guild}/api/regions/edit`);
diff --git a/src/web/client/logout.test.ts b/src/web/client/logout.test.ts
index 285a55de99af6efcd1d5f5a5c91f2e570f289f2e..9e0f6447beafb5252f2e7357f0fb321398c23d70 100644
--- a/src/web/client/logout.test.ts
+++ b/src/web/client/logout.test.ts
@@ -64,6 +64,17 @@ describe('logOut', () => {
     }
   });
 
+  it('counts only a 2xx as logged out, also on the second try', async () => {
+    for (const status of [101, 199, 302, 304]) {
+      expect(await logOut('old', steps([status]).made), String(status)).toBe('failed');
+      expect(
+        await logOut('old', steps([403, status], LOGGED_IN('fresh')).made),
+        String(status),
+      ).toBe('failed');
+    }
+    expect(await logOut('old', steps([200]).made)).toBe('done');
+  });
+
   it('fails when the token cannot be asked for again', async () => {
     const { made } = steps([403], new Error('offline'));
     expect(await logOut('old', made)).toBe('failed');
diff --git a/src/web/client/logout.ts b/src/web/client/logout.ts
index 7cdfcd78240226ed8f541453b301e267f3c6d547..6b136a3997a762af7b4a4ae003e00dab5115f689 100644
--- a/src/web/client/logout.ts
+++ b/src/web/client/logout.ts
@@ -11,20 +11,23 @@ export interface LogoutSteps {
 /** What the page says when logging out did not happen. */
 export const LOGOUT_FAILED = 'Log out failed; try again.';
 
+/** Whether an answer's status says it was done: a 2xx only (`fetch` follows redirects). */
+const succeeded = (status: number): boolean => status >= 200 && status < 300;
+
 /**
  * Logs out with the page's CSRF token. A 403 means the token is stale (the bot restarted and
  * made a new key since the page loaded): the token is asked for again and the POST tried once
- * more; a session that is gone by then is as good as logged out. Any other refusal, a second
- * 403 or a broken connection is `failed`.
+ * more; a session that is gone by then is as good as logged out. Only a 2xx is done: any other
+ * status, a second 403 or a broken connection is `failed`.
  */
 export async function logOut(csrf: string, steps: LogoutSteps): Promise<'done' | 'failed'> {
   try {
     const first = await steps.post(csrf);
-    if (first < 300) return 'done';
+    if (succeeded(first)) return 'done';
     if (first !== 403) return 'failed';
     const me = await steps.me();
     if (!me.loggedIn) return 'done';
-    return (await steps.post(me.csrf)) < 300 ? 'done' : 'failed';
+    return succeeded(await steps.post(me.csrf)) ? 'done' : 'failed';
   } catch {
     return 'failed';
   }
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 0b1ee23251ffbe14b89bc9c4d09a4f9b7ac6e3b3..934b81cbbb8968ae5f76a6429bace86b82d1a272 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -128,7 +128,7 @@ function start(): void {
     say(notice.text);
     history.replaceState(null, '', `${location.pathname}${notice.search}${location.hash}`);
   }
-  const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links');
+  const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links', 'map');
   showGeo(map, guild)
     .then(async ({ gyms, names, regions }) => {
       // The parties of the server for a member who is logged in (plan 8M-3); while Discord
diff --git a/src/web/client/meetup-forms.test.ts b/src/web/client/meetup-forms.test.ts
index 1d3b6516541a59b6f33df61d123a94c8de81bc3c..c24ab1f250d558e18be51914310e662a2d904c59 100644
--- a/src/web/client/meetup-forms.test.ts
+++ b/src/web/client/meetup-forms.test.ts
@@ -273,6 +273,17 @@ describe('the editor of a meetup', () => {
     ).toEqual(['name', 'info', 'end']);
   });
 
+  it('takes information stored with other line endings, untouched, as not typed in', () => {
+    // Stored with `\r\n`; the browser's textarea gives it back with `\n`.
+    const stored = { ...MEETUP, info: 'Bring snacks.\r\nAnd water.\rAnd a hat.' };
+    const shown = { ...SHOWN, info: 'Bring snacks.\nAnd water.\nAnd a hat.' };
+    expect(editorTyped({ meetup: stored, filled: {} }, shown)).toEqual({});
+    // A real change still counts, drawn from what is stored.
+    expect(
+      editorTyped({ meetup: stored, filled: {} }, { ...shown, info: 'Bring snacks.' }),
+    ).toEqual({ info: { text: 'Bring snacks.', drawn: stored.info } });
+  });
+
   it('sends each change alone with the value it was drawn from', () => {
     const typed = (values: Record<string, string>) =>
       editorTyped({ meetup: MEETUP, filled: {} }, { ...SHOWN, ...values });
diff --git a/src/web/client/meetup-forms.ts b/src/web/client/meetup-forms.ts
index d532a66891ddd4864175f0dd5164e6f5866a448c..a02c18f5ba5a05ce6f2b1770917ba7fb400be17a 100644
--- a/src/web/client/meetup-forms.ts
+++ b/src/web/client/meetup-forms.ts
@@ -318,10 +318,17 @@ function shownOf(meetup: MapMeetup, change: MeetupChange): string {
 const isChange = (key: string): key is MeetupChange =>
   (MEETUP_CHANGES as readonly string[]).includes(key);
 
+/**
+ * A text with its line endings as a textarea gives them back (`\n`): information stored with
+ * `\r\n` or `\r` reads the same untouched.
+ */
+const oneLineEnding = (text: string): string => text.replace(/\r\n?/gu, '\n');
+
 /**
  * The fields typed in once the editor's fields read `typed` (by name): a field typed in before
  * keeps the value it was drawn from with its text now; one that no longer shows what it was drawn
- * with is typed in now, drawn from the meetup the editor shows; any other is not typed in.
+ * with (line endings aside) is typed in now, drawn from the meetup the editor shows; any other is
+ * not typed in.
  */
 export function editorTyped(
   state: EditorState,
@@ -332,7 +339,7 @@ export function editorTyped(
     if (!isChange(key)) continue;
     const before = filled[key];
     if (before !== undefined) filled[key] = { text, drawn: before.drawn };
-    else if (text !== shownOf(state.meetup, key)) {
+    else if (oneLineEnding(text) !== oneLineEnding(shownOf(state.meetup, key))) {
       filled[key] = { text, drawn: drawnOf(state.meetup, key) };
     }
   }
diff --git a/src/web/client/notice.test.ts b/src/web/client/notice.test.ts
index dce932ed3e4cd8d54682281719a9b20912fd8f66..78c863466679d532c1d5c5aaa6ca690daae52f20 100644
--- a/src/web/client/notice.test.ts
+++ b/src/web/client/notice.test.ts
@@ -26,8 +26,8 @@ describe('loginNotice', () => {
 
 describe('headerLines', () => {
   it('offers the login there is to somebody who is not logged in', () => {
-    expect(headerLines({ loggedIn: false }, 'discord')).toEqual({ login: true, lines: [] });
-    expect(headerLines({ loggedIn: false }, 'links')).toEqual({
+    expect(headerLines({ loggedIn: false }, 'discord', 'map')).toEqual({ login: true, lines: [] });
+    expect(headerLines({ loggedIn: false }, 'links', 'map')).toEqual({
       login: false,
       lines: ['Use /maps in Discord to log in.'],
     });
@@ -35,16 +35,44 @@ describe('headerLines', () => {
 
   it('names the member, and says when they belong to no server here or Discord is away', () => {
     const me = { loggedIn: true as const, name: 'Ash', csrf: 't', member: true, readOnly: false };
-    expect(headerLines(me, 'discord')).toEqual({ login: false, name: 'Ash', lines: [] });
-    expect(headerLines({ ...me, member: false }, 'discord')).toEqual({
+    expect(headerLines(me, 'discord', 'map')).toEqual({ login: false, name: 'Ash', lines: [] });
+    expect(headerLines({ ...me, member: false }, 'discord', 'map')).toEqual({
       login: false,
       name: 'Ash',
       lines: ['You are not a member of this server.'],
     });
-    expect(headerLines({ ...me, member: false, readOnly: true }, 'links')).toEqual({
+    // In the server, without the map's member role: they may browse, and are told what to get.
+    expect(
+      headerLines({ ...me, member: false, missingRole: 'Verified' }, 'discord', 'map'),
+    ).toEqual({
+      login: false,
+      name: 'Ash',
+      lines: [
+        'You can look around the map. To join or report here, you need the Verified role in ' +
+          'this server.',
+      ],
+    });
+    expect(headerLines({ ...me, member: false, readOnly: true }, 'links', 'map')).toEqual({
       login: false,
       name: 'Ash',
       lines: ['Discord cannot be reached just now, so the map is read-only.'],
     });
   });
+
+  it("tells nobody in the region editor to get the map's member role", () => {
+    // A moderator without the role: the editor is theirs as staff, the role is for the map.
+    const me = {
+      loggedIn: true as const,
+      name: 'Brock',
+      csrf: 't',
+      member: false,
+      readOnly: false,
+      missingRole: 'Verified',
+    };
+    expect(headerLines(me, 'discord', 'editor')).toEqual({
+      login: false,
+      name: 'Brock',
+      lines: [],
+    });
+  });
 });
diff --git a/src/web/client/notice.ts b/src/web/client/notice.ts
index cc9bbb391612486eb569d2083b71acefb68cacc1..796b960740300257a9b7937ebdc9dbedfda9985f 100644
--- a/src/web/client/notice.ts
+++ b/src/web/client/notice.ts
@@ -1,7 +1,18 @@
 /** Who is asking, as `/s/<guild>/api/me` answers. */
 export type Me =
   | { loggedIn: false }
-  | { loggedIn: true; name: string; csrf: string; member: boolean; readOnly: boolean };
+  | {
+      loggedIn: true;
+      name: string;
+      csrf: string;
+      member: boolean;
+      readOnly: boolean;
+      /**
+       * For one in the server who lacks the map's member role (`settings.web.memberRole`): the
+       * role's name, which they need to join and report on the map.
+       */
+      missingRole?: string;
+    };
 
 /** What `?login=` may say; a `Map`, so that no name of `Object.prototype` is one of them. */
 const NOTICES: ReadonlyMap<string, string> = new Map([
@@ -22,13 +33,19 @@ export function loginNotice(search: string): { text: string; search: string } |
   return { text, search: rest === '' ? '' : `?${rest}` };
 }
 
+/** Which of the web pages a header is of: the live map or the region editor. */
+export type WebPage = 'map' | 'editor';
+
 /**
  * What the page's header says: "Log in with Discord" (only where it is offered) or how else to
- * log in, or the member's name with what keeps them from more than the public map.
+ * log in, or the member's name with what keeps them from more than the public map: Discord away,
+ * the map's member role they lack (only on the map: the editor is for staff, whom the role does
+ * not concern), or not being in the server.
  */
 export function headerLines(
   me: Me,
   login: 'discord' | 'links',
+  page: WebPage,
 ): { login: boolean; name?: string; lines: string[] } {
   if (!me.loggedIn) {
     return login === 'discord'
@@ -39,6 +56,13 @@ export function headerLines(
     ? ['Discord cannot be reached just now, so the map is read-only.']
     : me.member
       ? []
-      : ['You are not a member of this server.'];
+      : me.missingRole === undefined
+        ? ['You are not a member of this server.']
+        : page === 'editor'
+          ? []
+          : [
+              'You can look around the map. To join or report here, you need the ' +
+                `${me.missingRole} role in this server.`,
+            ];
   return { login: false, name: me.name, lines };
 }
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index e20be0a060edc83320fcddd21907e6101b30036a..e15b22c2c128b1bfe32f02ee82c56502526292a7 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -45,6 +45,7 @@ const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   hatchTime: NOW + 30 * MINUTE,
   endTime: NOW + 75 * MINUTE,
   link: LINK,
+  place: null,
   mayChange: false,
   attendance: attendance(),
   ...more,
@@ -124,6 +125,8 @@ describe('raidPopup', () => {
     const popup = raidPopup(raid(), context);
     expect(texts(popup)).toEqual([
       'Pinewood Public Library',
+      '12 Main St, Pinewood',
+      'Directions',
       'Level 5 raid (egg)',
       'Hatches as Yveltal',
       'Hatches at 2:30 PM',
@@ -141,11 +144,29 @@ describe('raidPopup', () => {
       { type: 'button', 'data-party': 'r1', 'data-action': 'join' },
       { type: 'button', 'data-party': 'r1', 'data-action': 'here' },
     ]);
+    expect(tagged(popup, 'a').map((link) => link.attributes)).toEqual([
+      { href: directions(1), target: '_blank', rel: 'noopener noreferrer' },
+      { href: LINK, target: '_blank', rel: 'noopener noreferrer' },
+    ]);
+  });
+
+  it('shows a raid at a gym the map does not show by where its post says it is', () => {
+    const place = { name: 'Hilltop Shrine', lat: 40.5, lon: -80.25, address: '1 Hill Rd' };
+    const popup = raidPopup(raid({ gymId: 77, place }), context);
+    expect(texts(popup).slice(0, 4)).toEqual([
+      'Hilltop Shrine',
+      '1 Hill Rd',
+      'Directions',
+      'Level 5 raid (egg)',
+    ]);
     expect(tagged(popup, 'a')[0]?.attributes).toEqual({
-      href: LINK,
+      href: 'https://www.google.com/maps/dir/?api=1&destination=40.5,-80.25',
       target: '_blank',
       rel: 'noopener noreferrer',
     });
+    // Without an address: the name and Directions.
+    const bare = raidPopup(raid({ gymId: 77, place: { ...place, address: null } }), context);
+    expect(texts(bare).slice(0, 3)).toEqual(['Hilltop Shrine', 'Directions', 'Level 5 raid (egg)']);
   });
 
   it('shows a hatched raid against its boss, the end, the groups and how the member stands', () => {
@@ -170,6 +191,8 @@ describe('raidPopup', () => {
     );
     expect(texts(popup)).toEqual([
       'Pinewood Public Library',
+      '12 Main St, Pinewood',
+      'Directions',
       'Level 5 raid against Yveltal',
       'Ends at 3:15 PM',
       'in 35 min',
diff --git a/src/web/client/parties.ts b/src/web/client/parties.ts
index a8624696228d1c9fba12e614de17bc450c8b1551..8b0b5d10808711000521875479cc16879cc492c5 100644
--- a/src/web/client/parties.ts
+++ b/src/web/client/parties.ts
@@ -183,17 +183,26 @@ const gymHeading = (gymId: number | null, context: ShowContext): PageNode => ({
   text: context.gym(gymId)?.name ?? 'Unknown gym',
 });
 
-/** A raid's popup (or its item in the side panel): its gym, then the raid (`raidNodes`). */
+/**
+ * A raid's item in the side panel (a raid at a gym the map does not show): its gym, as the map
+ * has it or else as the post names it (`MapRaid.place`, plan 8M-6), with the address line and
+ * Directions as a gym's popup has them, then the raid (`raidNodes`).
+ */
 export function raidPopup(raid: MapRaid, context: ShowContext): PageNode {
+  const gym = context.gym(raid.gymId) ?? raid.place ?? undefined;
   return {
     tag: 'div',
     className: 'party-popup raid',
-    children: [gymHeading(raid.gymId, context), ...raidNodes(raid, context)],
+    children: [
+      { tag: 'strong', className: 'name', text: gym?.name ?? 'Unknown gym' },
+      ...wayTo(gym),
+      ...raidNodes(raid, context),
+    ],
   };
 }
 
 /** How to get to a gym, as its own popup says it: its address line and "Directions". */
-function wayTo(gym: MapGym | undefined): PageNode[] {
+function wayTo(gym: Pick<MapGym, 'lat' | 'lon' | 'address'> | undefined): PageNode[] {
   return gym ? [...addressLine(gym), directionsLink(gym)] : [];
 }
 
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index 348019e0e223206163d9bc8c21e59b6adf50364f..d91a9770de7dde63ee53ba7725f2c69d49075e31 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it, vi } from 'vitest';
-import { gymClicks } from './party-layer.js';
+import { contextMenuToMap, gymClicks } from './party-layer.js';
 
 // Leaflet reads the browser's `window` as it loads: what `gymClicks` uses of it is how an event
 // is stopped, recorded here. Isolated: a mocked module needs a module graph of its own.
@@ -55,6 +55,29 @@ describe("a gym's clicks (gymClicks)", () => {
     expect(stopped).toEqual([...clicks, double]);
   });
 
+  it("hands a right click or long press on a raid's marker to the map's own, at that point", () => {
+    stopped.length = 0;
+    const layer = gymLayer();
+    const fired: { type: string; event: unknown }[] = [];
+    const map = {
+      fire(type: string, event: unknown) {
+        fired.push({ type, event });
+        return map;
+      },
+    };
+    contextMenuToMap(
+      layer as unknown as Parameters<typeof contextMenuToMap>[0],
+      map as unknown as Parameters<typeof contextMenuToMap>[1],
+    );
+    const press = { type: 'contextmenu', latlng: { lat: 40.1, lng: -80.05 } };
+    layer.fire('contextmenu', press);
+    expect(fired).toEqual([
+      { type: 'contextmenu', event: expect.objectContaining({ latlng: press.latlng }) as unknown },
+    ]);
+    // Once: the marker's own event goes no further.
+    expect(stopped).toEqual([press]);
+  });
+
   it('leaves a double click on a gym to the map out of route mode, its popup opened', () => {
     stopped.length = 0;
     const layer = gymLayer();
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 7259ea601c45144f0dbb251da3007b25bce50267..17f47f21537013a067d6879bd430b61d66f4a681 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -87,6 +87,19 @@ export function gymClicks(layer: L.Layer, routeClick: () => boolean): void {
   });
 }
 
+/**
+ * A right click or a long press on a marker (a raid's picture) handed to the map, at that point:
+ * Leaflet keeps a marker's mouse events from the map (unlike a circle's), so the map's own
+ * `contextmenu` ("Report spawn here", plan 8M-4S) would never hear of it (plan 8M-6). Only this
+ * event: a click on the marker must stay the marker's (a map click picks a meetup's place).
+ */
+export function contextMenuToMap(layer: L.Layer, map: L.Map): void {
+  layer.on('contextmenu', (event: L.LeafletMouseEvent) => {
+    L.DomEvent.stop(event);
+    map.fire('contextmenu', { latlng: event.latlng, originalEvent: event.originalEvent });
+  });
+}
+
 /**
  * What the map page's gym dots need of the parties: "Report raid" and "Report spawn here", and
  * whether a form is open.
@@ -280,6 +293,9 @@ export function showParties(
       // In route mode a gym with raids is a stop to add like any other, its popup not opened;
       // while a meetup's place is picked, it is the place.
       gymClicks(marker, () => gymClicked(gym));
+      // A right click or long press on the picture reaches the map's "Report spawn here" (a
+      // circle hands it on by itself).
+      if (picture !== null) contextMenuToMap(marker, map);
     }
     // Trains the map cannot draw (no route yet, or none of its gyms on the map) are listed; the
     // train being routed is left to route mode, which draws its stops as they are edited.
diff --git a/src/web/client/popup.ts b/src/web/client/popup.ts
index 8a33d52a6ad7fd9fed599e700a2f4ca3c7b4a532..3ef399e6bf5198f89688b98251012edf2247f734 100644
--- a/src/web/client/popup.ts
+++ b/src/web/client/popup.ts
@@ -51,7 +51,7 @@ const line = (className: string, text: string | null): PageNode[] =>
   text === null || text.trim() === '' ? [] : [{ tag: 'div', className, text }];
 
 /** A gym's address line, when anything of it is known (the gym's popup, the parties' popups). */
-export function addressLine(gym: MapGym): PageNode[] {
+export function addressLine(gym: Pick<MapGym, 'address'>): PageNode[] {
   return line('address', gym.address);
 }
 
diff --git a/src/web/client/raid-forms.test.ts b/src/web/client/raid-forms.test.ts
index 5f73d20af9c662b8d2c0e4407d569f0b205ce221..43bd2eaaf678d0462a4a684cdd2d2b6170188af5 100644
--- a/src/web/client/raid-forms.test.ts
+++ b/src/web/client/raid-forms.test.ts
@@ -71,6 +71,7 @@ const raid = (more: Partial<MapRaid> = {}): MapRaid => ({
   hatchTime: null,
   endTime: null,
   link: 'https://discord.com/channels/1/2',
+  place: null,
   mayChange: true,
   attendance: {
     groups: [{ id: 'A', interested: 1, coming: 0, present: 0 }],
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 5159b9e8bcfdc244bb8fe06a6448be24f9741732..16bd2d2d062d5a90e911654bc2b9bd0e77fe3790 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -3,7 +3,7 @@ import { isSnowflake } from '../db/snowflake.js';
 import { sendFailure, shortPage } from './answers.js';
 import { editorRoutes } from './editor-routes.js';
 import { etagMatches } from './geo-cache.js';
-import { mapMembers } from './map-members.js';
+import { countsOnTheMap, mapMembers } from './map-members.js';
 import { meetupRoutes } from './meetup-routes.js';
 import { mapPage } from './page.js';
 import { partyRoutes } from './party-routes.js';
@@ -27,8 +27,9 @@ export type GuildRequest = FastifyRequest<{ Params: { guild: string } }>;
  */
 export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
   const { sessions } = deps;
-  // Who counts as a member on the map (`settings.web.memberRole`): `/api/me` and the parties;
-  // the region editor asks its own question (staff) and is not affected.
+  // Who counts as a member on the map (`settings.web.memberRole`): the parties (`/api/me` judges
+  // it by `countsOnTheMap` itself, to tell a member without the role which role it is); the
+  // region editor asks its own question (staff) and is not affected.
   const map: WebDeps = { ...deps, members: mapMembers(deps.members, deps.settings.memberRole) };
   scope.addHook('onRequest', async (request: GuildRequest, reply) => {
     const { guild } = request.params;
@@ -60,10 +61,12 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
 
   // Who is asking (spec 2.5): the page's header, whether they are a member of this server (one
   // login for every server: membership is asked per server, from Discord, kept a minute by the
-  // directory; without the map's member role a member is none here), and the CSRF token its
-  // POSTs carry. When Discord cannot say, the page is read-only. Every request counts against
+  // directory; without the map's member role a member is none here, and is told the role's name,
+  // `missingRole`: they are in the server, whose roles they see on Discord), and the CSRF token
+  // its POSTs carry. When Discord cannot say, the page is read-only. Every request counts against
   // the address, as it may ask Discord.
   const meLimiter = new RateLimiter({ uses: ME_PER_MINUTE, perMs: 60_000 });
+  const { memberRole } = deps.settings;
   scope.get(
     '/api/me',
     { onRequest: limitedPerAddress(meLimiter, { now: deps.now }) },
@@ -72,9 +75,12 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
       const session = await sessions.of(request, reply);
       if (!session) return { loggedIn: false };
       let member = false;
+      let missingRole: string | undefined;
       let readOnly = false;
       try {
-        member = (await map.members.find(request.params.guild, session.userId)) !== undefined;
+        const found = await deps.members.find(request.params.guild, session.userId);
+        member = found !== undefined && countsOnTheMap(found.standing, memberRole);
+        if (found !== undefined && !member) missingRole = memberRole;
       } catch (err) {
         deps.log.warn(
           { err, guild: request.params.guild, user: session.userId },
@@ -88,6 +94,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
         member,
         csrf: sessions.csrfToken(session),
         readOnly,
+        ...(missingRole === undefined ? {} : { missingRole }),
       };
     },
   );
diff --git a/src/web/login.test.ts b/src/web/login.test.ts
index 4f89beda8ffb3059d243104fe678076e5f705509..e0714e6d2a0a252a069392773174b7b45be72544 100644
--- a/src/web/login.test.ts
+++ b/src/web/login.test.ts
@@ -372,16 +372,33 @@ describe('who is asking', () => {
     web = map;
     const cookie = await map.loggedIn(ASH, 'Ash');
     const ask = async () => (await map.app.inject({ url: ME, headers: { cookie } })).json<object>();
-    expect(await ask()).toMatchObject({ loggedIn: true, member: false, readOnly: false });
+    // In the server without the role: told which role lets them do more.
+    expect(await ask()).toMatchObject({
+      loggedIn: true,
+      member: false,
+      readOnly: false,
+      missingRole: 'Verified',
+    });
     members.standing(ASH, { roleNames: ['Trainer'], administrator: false });
-    expect(await ask()).toMatchObject({ member: false });
+    expect(await ask()).toMatchObject({ member: false, missingRole: 'Verified' });
     // By name, as Pine's other role settings: trimmed, whatever its letter case.
     members.standing(ASH, { roleNames: ['Trainer', ' VERIFIED '], administrator: false });
     expect(await ask()).toMatchObject({ member: true, readOnly: false });
+    expect(await ask()).not.toHaveProperty('missingRole');
     members.standing(ASH, { roleNames: [], administrator: true });
     expect(await ask()).toMatchObject({ member: true });
   });
 
+  it('names no role to somebody who is not in the server', async () => {
+    const members = new FakeMemberDirectory();
+    const map = webServerWith({ members, web: { memberRole: 'Verified' } });
+    web = map;
+    const cookie = await map.loggedIn(ASH, 'Ash');
+    const me = (await map.app.inject({ url: ME, headers: { cookie } })).json<object>();
+    expect(me).toMatchObject({ loggedIn: true, member: false });
+    expect(me).not.toHaveProperty('missingRole');
+  });
+
   it('is read-only when Discord cannot say whether they are a member', async () => {
     const members = new FakeMemberDirectory().add(ASH, 'Ash');
     members.failing = new Error('Discord is away');
````

### Task 3: Raid reports: /raid refuses a forum the member is kept out of, as the map does (8M-6)

Prototype commit: `d816b0fc3cc0f4acd464ed5f36a2bae129faa395`

One check, `reportBarred` (`src/commands/raids/report.ts`), shared by the map and `/raid`: a gym in two regions whose standing raid is in a forum the member is kept out of. `/raid` asks it in a guard before the throttle for a gym typed outright, again in `withGym` for a gym from a menu or a screenshot, and again when "Report it there" is pressed. Both say "You cannot report a raid at this gym: you are kept out of the forum its raid would be in." (`REPORT_BARRED`). `PartyService.memberAccess` lets `/raid` reach the gateway.

**Files:**

```
 src/commands/raids/raid.test.ts | 72 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/commands/raids/raid.ts      | 79 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 src/commands/raids/report.ts    | 56 ++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/services/party-service.ts   | 10 ++++++++++
 src/web/raid-report.test.ts     |  8 ++++++--
 src/web/raid-routes.ts          | 33 +++++++++++++++++----------------
 6 files changed, 232 insertions(+), 26 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/commands/raids/raid.test.ts src/web/raid-report.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/commands/raids/report.ts src/services/party-service.ts src/web/raid-report.test.ts src/web/raid-routes.ts` and `npx eslint src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/commands/raids/report.ts src/services/party-service.ts src/web/raid-report.test.ts src/web/raid-routes.ts`.
- [ ] **Step 4: Check the transcription:** `git diff d816b0fc3cc0f4acd464ed5f36a2bae129faa395 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Raid reports: /raid refuses a forum the member is kept out of, as the map does (8M-6)`, the paragraph above as the body and the trailer, staging exactly
  `src/commands/raids/raid.test.ts src/commands/raids/raid.ts src/commands/raids/report.ts src/services/party-service.ts src/web/raid-report.test.ts src/web/raid-routes.ts`.

````diff
diff --git a/src/commands/raids/raid.test.ts b/src/commands/raids/raid.test.ts
index a543cad276c4efb7429f667023b02e92ca8ae7ae..9e0005c06fb962a0f056f545ba45f349f626511f 100644
--- a/src/commands/raids/raid.test.ts
+++ b/src/commands/raids/raid.test.ts
@@ -15,16 +15,19 @@ import {
   WEST_FORUM,
 } from '../../../test/support/gyms.js';
 import { gymsFixture } from '../../../test/support/providers.js';
-import { at, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
+import { ALICE, at, BOB, PARTY_NOW, testRaid } from '../../../test/support/parties.js';
 import { partyServiceWith } from '../../../test/support/party-service.js';
 import { createTestContext } from '../../../test/support/test-context.js';
 import { MemoryUsers } from '../../../test/support/users.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
 import { InteractionRouter } from '../../discord/router.js';
+import { Throttles } from '../../discord/throttle.js';
+import type { GymProvider } from '../../services/gym-directory.js';
 import type { GymLookup } from '../../domain/search/gym-lookup.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { FORUM_TAGS } from '../../render/party-post.js';
 import { raid, raidControls } from './raid.js';
+import { REPORT_BARRED } from './report.js';
 
 const OTHER_MEMBER = '700000000000000002';
 
@@ -194,6 +197,60 @@ describe('/raid', () => {
     expect(store.active()).toEqual([]);
   });
 
+  it('refuses a report that would put the member in a forum they are kept out of, before counting it', async () => {
+    // The Bridge (gym 4) lies in West and East.
+    const base = gymsFixture();
+    const gyms = Object.assign(Object.create(base) as GymProvider, {
+      regionsOf: (gymId: number) =>
+        gymId === 4 ? [WEST_CHANNEL, EAST_CHANNEL] : base.regionsOf(gymId),
+    });
+    const made = await partyServiceWith([], { gyms });
+    const { ctx } = createTestContext({
+      partyService: made.service,
+      parties: made.store,
+      regions: made.regions,
+      gyms,
+    });
+    const throttles = new Throttles();
+    const router = new InteractionRouter(ctx, [raid], [raidControls], { throttles });
+    const use = async (userId: string, channelId: string, gym: string) => {
+      const used = fakeChatInput({
+        commandName: 'raid',
+        channelId,
+        userId,
+        options: { boss: 'e:T5:0', gym },
+      });
+      await router.handle(used as never);
+      return used;
+    };
+    // Bob reports the Bridge from East: its raid stands in East's forum.
+    await use(BOB, EAST_CHANNEL, 'g:4');
+    expect(made.store.active()[0]).toMatchObject({ gymId: 4, regionId: 2 });
+    expect(throttles.size).toBe(1);
+    made.gateway.barred.set(EAST_FORUM, new Set([ALICE]));
+    // West, which Alice may see, would take a new raid; but /raid would sign her up in East's.
+    const refused = await use(ALICE, WEST_CHANNEL, 'g:4');
+    expect(sent(refused.reply).content).toBe(REPORT_BARRED);
+    expect(made.store.active()).toHaveLength(1);
+    expect(made.store.active()[0]?.attendees[ALICE]).toBeUndefined();
+    // So is one whose new raid would go to a forum she is kept out of.
+    made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
+    expect(sent((await use(ALICE, WEST_CHANNEL, 'g:1')).reply).content).toBe(REPORT_BARRED);
+    expect(made.store.active()).toHaveLength(1);
+    // Neither was counted against /raid's limit.
+    expect(throttles.size).toBe(1);
+  });
+
+  it('refuses a gym chosen from the menu whose forum the member is kept out of', async () => {
+    const { run, handle, store, gateway } = await setup();
+    const interaction = await run({ boss: 'e:T5:0', gym: 'pinewood' });
+    gateway.barred.set(WEST_FORUM, new Set([interaction.user.id]));
+    const select = await handle(fakeSelect({ customId: customId(interaction), values: ['12'] }));
+    expect(sent(select.editReply).content).toBe('Nothing was reported.');
+    expect(JSON.stringify(select.followUp.mock.calls)).toContain(REPORT_BARRED);
+    expect(store.active()).toEqual([]);
+  });
+
   it('asks before reporting at a gym of another region, and reports there on yes', async () => {
     const { run, handle, store, gateway } = await setup();
     // Gym 7 lies in East; the command is used in West.
@@ -208,6 +265,19 @@ describe('/raid', () => {
     expect(sent(yes.editReply).content).toContain('Reported: T5 egg at Harbor Lighthouse Mural.');
   });
 
+  it('refuses "Report it there" when the member was kept out of that forum since the question', async () => {
+    const { run, handle, store, gateway } = await setup();
+    // Gym 7 lies in East; the command is used in West.
+    const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
+    expect(sent(interaction.editReply).content).toMatch(/Report the raid there\?$/);
+    gateway.barred.set(EAST_FORUM, new Set([interaction.user.id]));
+    const yes = await handle(fakeButton({ customId: customId(interaction, 0) }));
+    expect(sent(yes.editReply).content).toBe('Nothing was reported.');
+    expect(JSON.stringify(yes.followUp.mock.calls)).toContain(REPORT_BARRED);
+    expect(store.active()).toEqual([]);
+    expect(gateway.postsIn(EAST_FORUM)).toHaveLength(0);
+  });
+
   it('reports nothing on cancel', async () => {
     const { run, handle, store } = await setup();
     const interaction = await run({ boss: 'e:T5:0', gym: 'g:7' });
diff --git a/src/commands/raids/raid.ts b/src/commands/raids/raid.ts
index a89c37549f1587db6669e77e6ca5969cfa3746d5..eaae9bbd94c7b83069db70ef9607eb776278f535 100644
--- a/src/commands/raids/raid.ts
+++ b/src/commands/raids/raid.ts
@@ -38,7 +38,15 @@ import {
   stageOnly,
   type ReportedBoss,
 } from './raid-input.js';
-import { DISCORD_NAMES, RAID_THROTTLE, reportRaidAs, reportWords } from './report.js';
+import {
+  DISCORD_NAMES,
+  RAID_THROTTLE,
+  REPORT_BARRED,
+  reportBarred,
+  reportRaidAs,
+  reportWords,
+  type ReportAccess,
+} from './report.js';
 
 /**
  * The custom-id kind of the controls this command shows. It belongs to `/raid`'s own controls
@@ -119,8 +127,33 @@ async function finish(
 }
 
 /**
- * Goes on with a report once its gym is known: a gym outside the region the command was used
- * in is confirmed first, otherwise the raid is reported.
+ * Refuses a report at this gym that would put the member in a forum somebody keeps them out of
+ * (`reportBarred`, the map's own check, plan 8M-6), in the map's words.
+ */
+async function refuseBarred(
+  ctx: AppContext,
+  guildId: string,
+  memberId: string,
+  gym: Gym,
+  regionChannelId: string | undefined,
+): Promise<void> {
+  const guildRow = await ctx.guilds.idFor(guildId);
+  if (guildRow === undefined) return;
+  const access: ReportAccess = {
+    partyService: ctx.partyService,
+    parties: ctx.parties,
+    memberAccess: (forumId, member) => ctx.partyService.memberAccess(forumId, member),
+  };
+  if (await reportBarred(access, gym, regionChannelId, guildRow, memberId)) {
+    throw new UserError(REPORT_BARRED);
+  }
+}
+
+/**
+ * Goes on with a report once its gym is known: one that would put the member in a forum they
+ * are kept out of is refused (`refuseBarred`: for a gym typed outright the guard asked it before
+ * the throttle; a gym chosen from a menu or read from a screenshot is known only now), a gym
+ * outside the region the command was used in is confirmed first, otherwise the raid is reported.
  */
 async function withGym(
   interaction: Answerable,
@@ -128,6 +161,13 @@ async function withGym(
   request: PendingReport,
   gym: Gym,
 ): Promise<void> {
+  await refuseBarred(
+    ctx,
+    guildIdOf(interaction),
+    interaction.user.id,
+    gym,
+    request.regionChannelId,
+  );
   const here = request.regionChannelId;
   // The service knows which region of this server the raid would go to; no such region at all is
   // answered by the report itself, at once.
@@ -428,6 +468,25 @@ const requireWhatToReport: Guard = (interaction, ctx) => {
   }
 };
 
+/**
+ * A report at a gym typed outright (one clear gym, no screenshot) that would put the member in a
+ * forum somebody keeps them out of (the forum the raid would go to, or that of a raid already at
+ * the gym, which may stand in another region's), refused here, before the throttle, as the map
+ * refuses it (plan 8M-6). The gym is looked up again in `execute`, as `/wild` does.
+ */
+const requireForumAccess: Guard = async (interaction, ctx) => {
+  if (!interaction.isChatInputCommand()) return;
+  if (ctx.config.settings.ocr.enabled && interaction.options.getAttachment('screenshot') !== null) {
+    return;
+  }
+  const typed = interaction.options.getString('gym')?.trim() ?? '';
+  if (typed === '') return;
+  const regionChannelId = regionChannelOf(interaction, ctx);
+  const answer = reportedGym(ctx, regionChannelId, typed);
+  if (answer.kind !== 'gym') return;
+  await refuseBarred(ctx, guildIdOf(interaction), interaction.user.id, answer.gym, regionChannelId);
+};
+
 /** The definition: with the option `screenshot` where screenshots are read. */
 function raidData(screenshots: boolean) {
   const data = new SlashCommandBuilder()
@@ -494,7 +553,7 @@ function raidCommand(screenshots: boolean): SimpleCommand {
         ...(screenshots ? ['/raid screenshot:(a raid screenshot)'] : []),
       ],
     },
-    guards: [requireRegion, requireWhatToReport],
+    guards: [requireRegion, requireWhatToReport, requireForumAccess],
     defer: 'ephemeral',
     throttle: RAID_THROTTLE,
 
@@ -622,6 +681,16 @@ export const raidControls: ComponentHandler = {
     const gym = ctx.gyms.get(request.gymIds[0] ?? -1);
     if (!gym) throw new UserError('That gym no longer exists. Use `/raid` again.');
     await interaction.deferUpdate();
-    await afterDeferral(interaction, () => finish(interaction, ctx, request, gym));
+    await afterDeferral(interaction, async () => {
+      // Who is kept out of which forum may have changed since the question was asked.
+      await refuseBarred(
+        ctx,
+        guildIdOf(interaction),
+        interaction.user.id,
+        gym,
+        request.regionChannelId,
+      );
+      await finish(interaction, ctx, request, gym);
+    });
   },
 };
diff --git a/src/commands/raids/report.ts b/src/commands/raids/report.ts
index 3dace2ed940414c1d1ae2a5fe6f90c13b76472c3..c5b1141eac6c2788b8fcdacfb5b7576502d98b63 100644
--- a/src/commands/raids/report.ts
+++ b/src/commands/raids/report.ts
@@ -1,12 +1,13 @@
 import type { AppContext } from '../../app-context.js';
 import type { Gym } from '../../db/repositories/gym-repository.js';
+import type { MemberAccess } from '../../discord/party-gateway.js';
 import type { Throttle } from '../../discord/throttle.js';
 import { PartyStatus, RaidPrivacy } from '../../domain/party/status.js';
 import { NO_POST_MADE } from '../../render/activity.js';
 import { plain } from '../../render/text.js';
 import type { Member } from '../../services/attendance-service.js';
-import type { RaidScreenshot } from '../../domain/party/party.js';
-import type { ReportOutcome } from '../../services/party-service.js';
+import { isRaid, type Party, type RaidScreenshot } from '../../domain/party/party.js';
+import type { PartyService, ReportOutcome } from '../../services/party-service.js';
 import type { ReportedBoss } from './raid-input.js';
 
 /**
@@ -73,6 +74,57 @@ export async function reportRaidAs(
   return { outcome, autoStatus: settings.autoStatus };
 }
 
+/** What `/raid` and the map answer a report that would put the member in a forum barred to them. */
+export const REPORT_BARRED =
+  'You cannot report a raid at this gym: you are kept out of the forum its raid would be in.';
+
+/**
+ * What the check of a report's forums needs: where a new raid would go (`regionFor`), the
+ * active parties, and how a member stands to a forum (`PartyGateway.memberAccess`; on Discord
+ * through the party service, on the map through the parties' own deps).
+ */
+export interface ReportAccess {
+  partyService: Pick<PartyService, 'regionFor'>;
+  parties: { active(): Party[] };
+  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined>;
+}
+
+/**
+ * Whether a report at this gym, made in this region channel (on the map: the region picked),
+ * would put the member in a forum somebody keeps them out of (`barred`: `AccessService` would
+ * not let them in), as `/raid` and the map both ask it before their throttle (plans 8M-4, 8M-6):
+ * the forum a new raid would go to (`regionFor`, as `reportRaid` decides), then that of every
+ * active raid of the server already at the gym, of either kind, which the report would join and
+ * which may stand in another region's forum. Rejects while Discord cannot say.
+ */
+export async function reportBarred(
+  access: ReportAccess,
+  gym: Gym,
+  regionChannelId: string | undefined,
+  guildRow: number,
+  memberId: string,
+): Promise<boolean> {
+  const forum = access.partyService.regionFor(gym, regionChannelId).region?.forumChannelId ?? null;
+  const standing = new Set(
+    access.parties
+      .active()
+      .filter(
+        (party) =>
+          party.guildId === guildRow &&
+          isRaid(party) &&
+          party.gymId === gym.id &&
+          party.forumChannelId !== forum,
+      )
+      .map((party) => party.forumChannelId),
+  );
+  for (const forumId of [forum, ...standing]) {
+    if (forumId !== null && (await access.memberAccess(forumId, memberId)) === 'barred') {
+      return true;
+    }
+  }
+  return false;
+}
+
 /**
  * How an answer names a post and a region channel: as mentions on Discord; on the map no post
  * (the page opens the raid instead: undefined leaves the sentence out) and a channel by its name.
diff --git a/src/services/party-service.ts b/src/services/party-service.ts
index b94ea425f61d4b39284b541f7f79942c48c08804..c8e074e7ae447b23f8343b79b9734466f6e8383e 100644
--- a/src/services/party-service.ts
+++ b/src/services/party-service.ts
@@ -10,6 +10,7 @@ import {
   rateLimitWaitMs,
   type ForumAccess,
   type ForumHiding,
+  type MemberAccess,
   type NewPost,
   type PartyGateway,
   type TagIds,
@@ -659,6 +660,15 @@ export class PartyService {
     }
   }
 
+  /**
+   * How a member stands to a forum (`PartyGateway.memberAccess`), as Discord says it now: what
+   * `/raid` asks before a report puts the member in a forum (`reportBarred`, plan 8M-6). Rejects
+   * while Discord cannot say.
+   */
+  memberAccess(forumId: string, memberId: string): Promise<MemberAccess | undefined> {
+    return this.options.gateway.memberAccess(forumId, memberId);
+  }
+
   /**
    * The region whose forum takes a raid at this gym, among the regions the gym lies in: the
    * region the report was made in; else a region of the same server; else, when the report names
diff --git a/src/web/raid-report.test.ts b/src/web/raid-report.test.ts
index b214851bef300a3cc13f6e87f9816a1e3c1acc9a..fefe99405045c27e729bc1868c90ee0234993907 100644
--- a/src/web/raid-report.test.ts
+++ b/src/web/raid-report.test.ts
@@ -16,7 +16,7 @@ import {
   type TestWeb,
 } from '../../test/support/web.js';
 import { raid, raidControls } from '../commands/raids/raid.js';
-import { RAID_COMMAND, RAID_THROTTLE } from '../commands/raids/report.js';
+import { RAID_COMMAND, RAID_THROTTLE, REPORT_BARRED } from '../commands/raids/report.js';
 import type { UserSettings } from '../db/repositories/user-repository.js';
 import { InteractionRouter } from '../discord/router.js';
 import { Throttles } from '../discord/throttle.js';
@@ -250,6 +250,8 @@ describe('reporting a raid on the map', () => {
     // West, which Alice may see, would take a new raid; but the one there is in East.
     const refused = await map.report({ gym: 4, region: 1, boss: 'e:T5:0' });
     expect(refused.status).toBe(403);
+    // In the words /raid refuses it with (plan 8M-6: one check for both).
+    expect(refused.json).toEqual({ error: REPORT_BARRED });
     const [party] = map.made.store.active();
     expect(map.made.store.active()).toHaveLength(1);
     expect(party?.attendees[ALICE]).toBeUndefined();
@@ -290,7 +292,9 @@ describe('reporting a raid on the map', () => {
     expect((await map.report({ gym: 10, boss: 'e:T5:0' })).status).toBe(404);
     expect((await map.report({ gym: 999, boss: 'e:T5:0' })).status).toBe(404);
     map.made.gateway.barred.set(WEST_FORUM, new Set([ALICE]));
-    expect((await map.report({ gym: 1, boss: 'e:T5:0' })).status).toBe(403);
+    const barred = await map.report({ gym: 1, boss: 'e:T5:0' });
+    expect(barred.status).toBe(403);
+    expect(barred.json).toEqual({ error: REPORT_BARRED });
     map.acting.holdBack(ALICE, 'timed-out');
     expect((await map.report({ gym: 2, boss: 'e:T5:0' })).json).toEqual({
       error: 'You are timed out in this server, so you cannot do that now.',
diff --git a/src/web/raid-routes.ts b/src/web/raid-routes.ts
index f004d6baed19220334cbf6b47a1f199e581e1164..66af2c4e4e133d0d5bfa0b36dbaf6079e196e463 100644
--- a/src/web/raid-routes.ts
+++ b/src/web/raid-routes.ts
@@ -15,9 +15,12 @@ import { reportedBoss, reportedTime, type ReportedBoss } from '../commands/raids
 import {
   RAID_COMMAND,
   RAID_THROTTLE,
+  REPORT_BARRED,
+  reportBarred,
   reportRaidAs,
   reportWords,
   type RaidReporting,
+  type ReportAccess,
   type ReportNames,
 } from '../commands/raids/report.js';
 import type { Region } from '../db/repositories/region-repository.js';
@@ -199,6 +202,16 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
   const accessTo = (forumId: string | null, userId: string): Promise<MemberAccess | undefined> =>
     forumId === null ? Promise.resolve(undefined) : parties.forums.memberAccess(forumId, userId);
 
+  /**
+   * What `/raid`'s check of a report's forums (`reportBarred`) asks, on the map's deps; made per
+   * report, as the raids' deps are read only when used (a server without them still starts).
+   */
+  const reportAccess = (): ReportAccess => ({
+    partyService: ctx.partyService,
+    parties: parties.store,
+    memberAccess: (forumId, memberId) => parties.forums.memberAccess(forumId, memberId),
+  });
+
   /** A raid as the member sees it on the map now (`mapParty`): none without its post yet. */
   const viewOf = (
     guildId: string,
@@ -313,23 +326,11 @@ export function raidRoutes(scope: FastifyInstance, deps: WebDeps): void {
     }
     const regionChannelId = picked.channelId;
     const forum = ctx.partyService.regionFor(gym, regionChannelId).region?.forumChannelId ?? null;
-    // A report joins a raid already at the gym, which may stand in another forum of the server:
-    // refused too when the member is kept out of that one.
-    const standing = new Set(
-      parties.store
-        .active()
-        .filter(
-          (party) =>
-            party.guildId === row &&
-            isRaid(party) &&
-            party.gymId === gym.id &&
-            party.forumChannelId !== forum,
-        )
-        .map((party) => party.forumChannelId),
-    );
+    // The forum the raid would go to, and that of a raid already at the gym, which the report
+    // would join and which may stand in another forum of the server: `/raid`'s own check.
     try {
-      for (const forumId of [forum, ...standing]) {
-        if ((await accessTo(forumId, userId)) === 'barred') return sendFailure(request, reply, 403);
+      if (await reportBarred(reportAccess(), gym, regionChannelId, row, userId)) {
+        return reply.code(403).send({ error: REPORT_BARRED });
       }
     } catch (err) {
       return unreachable(reply, err, guild, userId, 'reported a raid');
````

### Task 4: Web pages: the look as named values in theme.css (8M-6)

Prototype commit: `434f6d36356f8a3d8869d4fc1efbf840c337f903`

No visible change. Every colour and the sizes a restyle touches (`--font`, `--font-size`, `--radius`, `--panel-width`, `--editor-panel-width`) are custom properties in `src/web/client/theme.css`, which `map.css` imports (and `editor.css` through it). Leaflet's colours are read from the same properties by `theme()` (`theme.ts`). `src/web/page-theme.test.ts` refuses a colour anywhere else in the page's code or stylesheets (hex, colour functions, named colours). `web.md` gains "Restyling the page".

**Files:**

```
 docs/architecture/web.md      |   5 +++
 src/web/client/editor.css     |  30 ++++++-------
 src/web/client/editor.ts      |  63 +++++++++++++---------------
 src/web/client/main.ts        |   7 ++--
 src/web/client/map.css        |  91 ++++++++++++++++++++--------------------
 src/web/client/party-layer.ts |  26 +++++++-----
 src/web/client/theme.css      |  78 ++++++++++++++++++++++++++++++++++
 src/web/client/theme.test.ts  |  22 ++++++++++
 src/web/client/theme.ts       |  83 ++++++++++++++++++++++++++++++++++++
 src/web/page-theme.test.ts    | 188 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 10 files changed, 485 insertions(+), 108 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/theme.test.ts src/web/page-theme.test.ts`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check docs/architecture/web.md src/web/client/editor.ts src/web/client/main.ts src/web/client/party-layer.ts src/web/client/theme.test.ts src/web/client/theme.ts src/web/page-theme.test.ts` and `npx eslint src/web/client/editor.ts src/web/client/main.ts src/web/client/party-layer.ts src/web/client/theme.test.ts src/web/client/theme.ts src/web/page-theme.test.ts`.
- [ ] **Step 4: Check the transcription:** `git diff 434f6d36356f8a3d8869d4fc1efbf840c337f903 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Web pages: the look as named values in theme.css (8M-6)`, the paragraph above as the body and the trailer, staging exactly
  `docs/architecture/web.md src/web/client/editor.css src/web/client/editor.ts src/web/client/main.ts src/web/client/map.css src/web/client/party-layer.ts src/web/client/theme.css src/web/client/theme.test.ts src/web/client/theme.ts src/web/page-theme.test.ts`.

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index f14489b37176135765f788a14599fc160357c6ae..cbae0cd5b76430fae349640479c01c7d3919665a 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -96,6 +96,11 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5M; spec `docs/superpow
 - **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, power spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
 - **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
 
+## Restyling the page
+
+- Every colour of the map and the region editor, and the sizes a restyle would touch (the font and its size, the corners' radius, the widths of the map's side panel and the editor's panel), is a custom property in one block, `:root` of `src/web/client/theme.css` (plan 8M-6). `map.css` imports it and `editor.css` imports `map.css`, so both pages have it; their rules use `var(--…)` and write no colour themselves. The colours Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties once, at the page's first drawing (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; the stylesheet loads before the deferred script; a property it lacks draws grey). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
+- To try a change: edit a value in `theme.css`, run `npm run web:build`, and reload the page (the bundle's names change with its content). A new colour is a new property in `theme.css`, used through `var(--…)`, or named in `theme.ts` for what Leaflet draws. `page-theme.test.ts` refuses a colour written anywhere else in `src/web/client/` and its folders: in a stylesheet but `theme.css`, a hex value, a colour function (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `color-mix(`) or one of the usual named colours (`white`, `red`, … ; `transparent`, `inherit`, `currentColor` and `none` are allowed) anywhere in a value; in the pages' TypeScript, a hex value or a colour function anywhere in a string or a template (read with the TypeScript parser, comments aside), or a string that is a named colour (a sentence may name a colour: "shown in red"), but for `MISSING_COLOUR` of `theme.ts`, the grey of a property the stylesheet lacks. It also refuses a property used or drawn that `theme.css` does not define. The CSP is unchanged: the properties are in the bundled stylesheet, never inline.
+
 ## Adding a route
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index f2dfaaa206624278d71d76395a7c1fa9482022e2..83de111296f6f9928bbb8d4111ac046f9f1f0aae 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -8,10 +8,10 @@
 }
 
 #tools button {
-  color: #1f2328;
-  background: #e8efe9;
+  color: var(--text);
+  background: var(--tool-bg);
   border: 0;
-  border-radius: 4px;
+  border-radius: var(--radius);
   padding: 4px 10px;
   font: inherit;
   cursor: pointer;
@@ -29,11 +29,11 @@
 }
 
 #panel {
-  width: 360px;
+  width: var(--editor-panel-width);
   max-width: 45vw;
   overflow-y: auto;
   padding: 8px 12px;
-  border-left: 1px solid #ccd;
+  border-left: 1px solid var(--panel-border);
   font-size: 14px;
 }
 
@@ -74,7 +74,7 @@
 
 #panel .reasons li,
 #panel .warning {
-  color: #8a5a00;
+  color: var(--warning);
 }
 
 #panel .region-list li,
@@ -87,15 +87,15 @@
 }
 
 #panel .piece-list li.fresh {
-  color: #b00020;
+  color: var(--fresh-piece);
   font-weight: 600;
 }
 
 #panel .dialog {
-  border: 1px solid #8aa;
-  border-radius: 4px;
+  border: 1px solid var(--field-border);
+  border-radius: var(--radius);
   padding: 4px 10px 10px;
-  background: #f7faf7;
+  background: var(--dialog-bg);
 }
 
 #panel .conflict {
@@ -109,7 +109,7 @@
 }
 
 #panel .piece-list .cannot-fix {
-  color: #6b6b6b;
+  color: var(--cannot-fix);
   font-size: 12px;
 }
 
@@ -120,14 +120,14 @@
 }
 
 #panel .fix-option.chosen {
-  border-left-color: #111111;
-  background: #eef3ee;
+  border-left-color: var(--fix-line);
+  background: var(--fix-chosen-bg);
 }
 
 /* Where three regions meet, dragged on the map before a fix is applied. */
 .fix-corner {
-  background: #ffffff;
-  border: 3px solid #111111;
+  background: var(--fix-corner-bg);
+  border: 3px solid var(--fix-line);
   border-radius: 50%;
   box-sizing: border-box;
   cursor: move;
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index a1f220f72ea41537b40c9db4963d0f8acea1a62a..f432be156e921a799843c49c8f8da097b87e059d 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -72,6 +72,7 @@ import { tileLayers } from './layers.js';
 import { loginNotice, type Me } from './notice.js';
 import { regionLabel, renderNode } from './popup.js';
 import { browserStorage, readStaged, writeStaged } from './staged-storage.js';
+import { theme, type Theme } from './theme.js';
 
 /**
  * The region editor (spec 4, plan 8M-2), bundled by `scripts/web/build.ts` beside the map:
@@ -80,30 +81,13 @@ import { browserStorage, readStaged, writeStaged } from './staged-storage.js';
  * with their channels and gym counts, other servers' in grey; the gyms, stops, power spots and
  * Wayfarer gyms, those in no region in a warning colour; the overlaps and gaps (worked out in a
  * worker) shaded and listed. Every change is a staged edit (`edits.ts`), kept in the browser,
- * undone and redone, and saved through a preview. Everything from data is set as text.
+ * undone and redone, and saved through a preview. Everything from data is set as text. Its
+ * colours are the page's theme (`theme.css`, read by `theme.ts`).
  */
 
-const PALETTE = [
-  '#3060c0',
-  '#2d7a3a',
-  '#a05a00',
-  '#7a3ab0',
-  '#00838f',
-  '#9e2a5e',
-  '#5d6d00',
-  '#c0392b',
-];
-const BROKEN = '#d00000';
-const OTHERS = '#8a8a8a';
-const GYM = '#2d7a3a';
-const STOP = '#1e88e5';
-const POWERSPOT = '#8e24aa';
-const WAYFARER_GYM = '#6d4c41';
-const OUTSIDE = '#ff8f00';
-const OVERLAP = '#e53935';
-const GAP = '#6a1b9a';
-const THEIRS = '#1565c0';
-const PREVIEW = '#111111';
+/** The colours the editor draws, from the page's theme. */
+const colours = (): Theme['colours'] => theme().colours;
+
 /** How long the editor waits after an edit before the overlaps and gaps are worked out again. */
 const CHECK_DELAY_MS = 400;
 /** How many overlaps and gaps the panel lists; the map shades them all. */
@@ -301,7 +285,7 @@ class Editor {
       data.others.map((other) =>
         // Not editable, but snapped to: shared borders meet.
         L.polygon(other.outline, {
-          color: OTHERS,
+          color: colours().others,
           weight: 1,
           dashArray: '4 4',
           fillOpacity: 0.03,
@@ -321,13 +305,19 @@ class Editor {
       });
     // Tooltips are made when shown: tens of thousands of places.
     this.gymDots = data.gyms.map(([, lat, lon, name]) =>
-      dot(lat, lon, GYM, 5).bindTooltip(() => renderNode({ tag: 'span', text: name }, document)),
+      dot(lat, lon, colours().editorGym, 5).bindTooltip(() =>
+        renderNode({ tag: 'span', text: name }, document),
+      ),
     );
     this.wayspotDots = data.wayspots.map(([kind, lat, lon, title]) =>
       dot(
         lat,
         lon,
-        kind === 'stop' ? STOP : kind === 'powerspot' ? POWERSPOT : WAYFARER_GYM,
+        kind === 'stop'
+          ? colours().editorStop
+          : kind === 'powerspot'
+            ? colours().powerSpot
+            : colours().wayfarerGym,
         kind === 'stop' ? 3 : 4,
       ).bindTooltip(() => renderNode({ tag: 'span', text: title }, document)),
     );
@@ -499,9 +489,10 @@ class Editor {
 
   /** The colour of a region: its own, or red when its outline cannot be saved. */
   private colour(draft: Draft, index: number, problems: ReadonlyMap<string, string>): string {
+    const { palette } = theme();
     return problems.has(draft.key)
-      ? BROKEN
-      : (PALETTE[index % PALETTE.length] ?? PALETTE[0] ?? '#3060c0');
+      ? colours().broken
+      : (palette[index % palette.length] ?? colours().region);
   }
 
   /** Draws every region anew (after an undo, a split, a file): Geoman's modes are kept. */
@@ -526,7 +517,7 @@ class Editor {
       if (draft.outline === null) return;
       if (draft.removed !== null) {
         L.polygon(latLngs(draft.outline), {
-          color: OTHERS,
+          color: colours().others,
           weight: 2,
           dashArray: '6 6',
           fillOpacity: 0,
@@ -559,7 +550,7 @@ class Editor {
       const region = this.loaded.find((one) => one.id === id);
       if (region?.outline) {
         L.polygon(latLngs(region.outline), {
-          color: THEIRS,
+          color: colours().theirs,
           weight: 2,
           dashArray: '2 6',
           fillOpacity: 0,
@@ -606,13 +597,17 @@ class Editor {
     ): void => {
       dots.forEach((dot, i) => {
         if (this.coloured && before.has(i) === now.has(i)) return;
-        dot.setStyle({ color: now.has(i) ? OUTSIDE : colourOf(i) });
+        dot.setStyle({ color: now.has(i) ? colours().outside : colourOf(i) });
       });
     };
-    restyle(this.gymDots, this.outsideBefore.gyms, gyms, () => GYM);
+    restyle(this.gymDots, this.outsideBefore.gyms, gyms, () => colours().editorGym);
     restyle(this.wayspotDots, this.outsideBefore.wayspots, wayspots, (i) => {
       const kind = this.data.wayspots[i]?.[0];
-      return kind === 'stop' ? STOP : kind === 'powerspot' ? POWERSPOT : WAYFARER_GYM;
+      return kind === 'stop'
+        ? colours().editorStop
+        : kind === 'powerspot'
+          ? colours().powerSpot
+          : colours().wayfarerGym;
     });
     this.outsideBefore = { gyms, wayspots };
     this.coloured = true;
@@ -723,7 +718,7 @@ class Editor {
     this.shaded.clearLayers();
     for (const piece of this.pieces) {
       L.polygon(piece.rings, {
-        color: piece.kind === 'overlap' ? OVERLAP : GAP,
+        color: piece.kind === 'overlap' ? colours().overlap : colours().gap,
         weight: piece.fresh ? 3 : 1,
         fillOpacity: piece.fresh ? 0.5 : 0.3,
         pmIgnore: true,
@@ -1129,7 +1124,7 @@ class Editor {
     this.fixPreview.clearLayers();
     for (const { outline } of outlines) {
       L.polygon(outline, {
-        color: PREVIEW,
+        color: colours().preview,
         weight: 2,
         dashArray: '6 4',
         fill: false,
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 934b81cbbb8968ae5f76a6429bace86b82d1a272..227cd15c5362f5f61851f4501c9cf31c2a00955c 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -7,6 +7,7 @@ import { loginNotice } from './notice.js';
 import { gymClicks, showParties } from './party-layer.js';
 import { gymPopup, regionLabel, renderNode, type MapGym } from './popup.js';
 import { heldContent } from './raid-forms.js';
+import { theme } from './theme.js';
 
 /**
  * The map page (spec 3.1), bundled by `scripts/web/build.ts`: Leaflet with the tiles of
@@ -19,8 +20,6 @@ import { heldContent } from './raid-forms.js';
 
 /** From this zoom on the regions' names are shown. */
 const LABEL_ZOOM = 12;
-const GYM_COLOUR = '#2d7a3a';
-const REGION_COLOUR = '#3060c0';
 
 /**
  * What a gym's popup shows beyond the gym itself, once the page knows who is asking: "Report raid"
@@ -50,7 +49,7 @@ async function showGeo(
   const names = new Map(view.regions.map((region) => [region.id, region.name]));
   const regions = L.featureGroup();
   for (const region of view.regions) {
-    L.polygon(region.outline, { color: REGION_COLOUR, weight: 2, fillOpacity: 0.05 })
+    L.polygon(region.outline, { color: theme().colours.region, weight: 2, fillOpacity: 0.05 })
       .bindTooltip(renderNode(regionLabel(region.name), document), {
         permanent: true,
         direction: 'center',
@@ -64,7 +63,7 @@ async function showGeo(
     dot: L.circleMarker([gym.lat, gym.lon], {
       radius: 6,
       weight: 2,
-      color: GYM_COLOUR,
+      color: theme().colours.gym,
       fillOpacity: 0.8,
     }).bindPopup(
       heldContent(
diff --git a/src/web/client/map.css b/src/web/client/map.css
index da2fdd5ae586f7a2584bea69d44dfcc6f6df9092..88c35fe68fb8caf23aa1a76170ff7dda0eb5b780 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1,4 +1,5 @@
 @import 'leaflet/dist/leaflet.css';
+@import './theme.css';
 
 html,
 body {
@@ -9,9 +10,9 @@ body {
 body {
   display: flex;
   flex-direction: column;
-  font-family: system-ui, sans-serif;
-  font-size: 15px;
-  color: #1f2328;
+  font-family: var(--font);
+  font-size: var(--font-size);
+  color: var(--text);
 }
 
 [hidden] {
@@ -24,8 +25,8 @@ body {
   align-items: center;
   gap: 8px 16px;
   padding: 8px 12px;
-  background: #1f3d2b;
-  color: #fff;
+  background: var(--header-bg);
+  color: var(--header-text);
 }
 
 #header .title {
@@ -36,8 +37,8 @@ body {
   flex: 1 1 180px;
   max-width: 320px;
   padding: 4px 8px;
-  border: 1px solid #8aa;
-  border-radius: 4px;
+  border: 1px solid var(--field-border);
+  border-radius: var(--radius);
   font: inherit;
 }
 
@@ -51,10 +52,10 @@ body {
 
 #account a,
 #account button {
-  color: #fff;
-  background: #5865f2;
+  color: var(--login-text);
+  background: var(--login-bg);
   border: 0;
-  border-radius: 4px;
+  border-radius: var(--radius);
   padding: 4px 10px;
   font: inherit;
   text-decoration: none;
@@ -70,8 +71,8 @@ body {
 #read-only {
   margin: 0;
   padding: 6px 12px;
-  background: #fff4cc;
-  border-bottom: 1px solid #e0c060;
+  background: var(--notice-bg);
+  border-bottom: 1px solid var(--notice-border);
 }
 
 #content {
@@ -86,11 +87,11 @@ body {
 }
 
 #parties {
-  width: 300px;
+  width: var(--panel-width);
   overflow-y: auto;
   padding: 8px 12px;
-  border-left: 1px solid #ccd;
-  background: #fafbfc;
+  border-left: 1px solid var(--panel-border);
+  background: var(--panel-bg);
 }
 
 #parties h2 {
@@ -107,7 +108,7 @@ body {
     width: auto;
     max-height: 40vh;
     border-left: 0;
-    border-top: 1px solid #ccd;
+    border-top: 1px solid var(--panel-border);
   }
 }
 
@@ -119,7 +120,7 @@ body {
 
 .party-list > li {
   padding: 8px 0;
-  border-bottom: 1px solid #e3e6ea;
+  border-bottom: 1px solid var(--divider);
 }
 
 .party-popup .name {
@@ -134,17 +135,17 @@ body {
 .party-popup.raids > .raid + .raid {
   margin-top: 8px;
   padding-top: 8px;
-  border-top: 1px solid #e3e6ea;
+  border-top: 1px solid var(--divider);
 }
 
 .party-popup .countdown {
   margin-left: 6px;
-  color: #555;
+  color: var(--muted);
 }
 
 .party-popup .counts,
 .party-popup .stop {
-  color: #444;
+  color: var(--text-soft);
 }
 
 .party-popup .mine {
@@ -161,9 +162,9 @@ body {
 
 .party-popup .press {
   padding: 3px 10px;
-  border: 1px solid #8a94a6;
-  border-radius: 4px;
-  background: #fff;
+  border: 1px solid var(--button-border);
+  border-radius: var(--radius);
+  background: var(--button-bg);
   font: inherit;
   cursor: pointer;
 }
@@ -180,16 +181,16 @@ body {
 
 .raid-icon {
   border-radius: 50%;
-  background: rgba(255, 255, 255, 0.85);
-  box-shadow: 0 0 0 2px #c0392b;
+  background: var(--raid-icon-bg);
+  box-shadow: 0 0 0 2px var(--raid);
 }
 
 .region-label {
-  background: rgba(255, 255, 255, 0.85);
+  background: var(--label-bg);
   border: 0;
   box-shadow: none;
   font-weight: 600;
-  color: #203060;
+  color: var(--region-label);
 }
 
 .labels-hidden .region-label {
@@ -205,7 +206,7 @@ body {
 .gym-popup .regions,
 .gym-popup .address,
 .party-popup .address {
-  color: #555;
+  color: var(--muted);
 }
 
 .gym-popup .notice {
@@ -234,9 +235,9 @@ body {
 .party-popup .change-raid {
   margin-top: 6px;
   padding: 3px 10px;
-  border: 1px solid #8a94a6;
-  border-radius: 4px;
-  background: #fff;
+  border: 1px solid var(--button-border);
+  border-radius: var(--radius);
+  background: var(--button-bg);
   font: inherit;
   cursor: pointer;
 }
@@ -257,7 +258,7 @@ body {
 
 .raid-form .form-row > span {
   flex: 0 0 100%;
-  color: #444;
+  color: var(--text-soft);
 }
 
 .raid-form input,
@@ -279,7 +280,7 @@ body {
 }
 
 .raid-form .form-answer {
-  color: #8a3b00;
+  color: var(--form-answer);
 }
 
 /* Trains from the map (plan 8M-5): "New train", a train's actions, route mode, the panel. */
@@ -291,9 +292,9 @@ body {
 .train-actions .press {
   margin-top: 6px;
   padding: 3px 10px;
-  border: 1px solid #8a94a6;
-  border-radius: 4px;
-  background: #fff;
+  border: 1px solid var(--button-border);
+  border-radius: var(--radius);
+  background: var(--button-bg);
   font: inherit;
   cursor: pointer;
 }
@@ -313,7 +314,7 @@ body {
 .party-popup .conductor,
 .raid-form .hint {
   margin: 0;
-  color: #555;
+  color: var(--muted);
 }
 
 .route-editor .form-buttons,
@@ -352,16 +353,16 @@ body {
   align-items: center;
   justify-content: center;
   border-radius: 50%;
-  background: #fff;
-  box-shadow: 0 0 0 2px #d35400;
+  background: var(--stop-number-bg);
+  box-shadow: 0 0 0 2px var(--train);
   font-size: 12px;
   font-weight: 600;
-  color: #6b2a00;
+  color: var(--stop-number-text);
 }
 
 .stop-number.here {
-  background: #d35400;
-  color: #fff;
+  background: var(--train);
+  color: var(--stop-number-here-text);
 }
 
 /* Meetups from the map (plan 8M-5M): "New meetup", "Meetup here", the form, the editor. */
@@ -371,9 +372,9 @@ body {
   margin-top: 6px;
   margin-left: 4px;
   padding: 3px 10px;
-  border: 1px solid #8a94a6;
-  border-radius: 4px;
-  background: #fff;
+  border: 1px solid var(--button-border);
+  border-radius: var(--radius);
+  background: var(--button-bg);
   font: inherit;
   cursor: pointer;
 }
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 17f47f21537013a067d6879bd430b61d66f4a681..580cc4e978f811c3967d8761775ee8698c7cd38c 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -32,6 +32,7 @@ import {
   trainActions,
 } from './train-forms.js';
 import { trainUi } from './train-ui.js';
+import { theme } from './theme.js';
 
 /**
  * The parties on the live map for a member (plan 8M-3, spec 3.2 to 3.4): one marker per gym
@@ -48,11 +49,7 @@ import { trainUi } from './train-ui.js';
 
 const EVERY_MS = 20_000;
 const COUNTDOWN_MS = 15_000;
-const RAID_COLOUR = '#c0392b';
-const TRAIN_COLOUR = '#d35400';
 const ICON_SIZE = 36;
-const MEETUP_COLOUR = '#8e44ad';
-const STOP_COLOUR = '#2980b9';
 /** The pane of the meetups' rings: above Leaflet's markers (600), below its tooltips (650). */
 const MEETUP_PANE = 'meetups';
 const MEETUP_PANE_Z = 625;
@@ -275,7 +272,11 @@ export function showParties(
       const picture = gymPicture(raids);
       const marker =
         picture === null
-          ? L.circleMarker([gym.lat, gym.lon], { radius: 10, color: RAID_COLOUR, fillOpacity: 0.9 })
+          ? L.circleMarker([gym.lat, gym.lon], {
+              radius: 10,
+              color: theme().colours.raid,
+              fillOpacity: 0.9,
+            })
           : L.marker([gym.lat, gym.lon], {
               icon: L.icon({
                 iconUrl: picture,
@@ -315,7 +316,7 @@ export function showParties(
       withPopup(
         L.circleMarker(gym ? [gym.lat, gym.lon] : [place.lat, place.lon], {
           radius: 12,
-          color: MEETUP_COLOUR,
+          color: theme().colours.meetup,
           weight: 4,
           fill: false,
           interactive,
@@ -334,7 +335,12 @@ export function showParties(
       if (places.length === 0) unplaced.push(train);
       if (places.length > 1) {
         withPopup(
-          L.polyline(places, { color: TRAIN_COLOUR, weight: 4, opacity: 0.8, interactive }),
+          L.polyline(places, {
+            color: theme().colours.train,
+            weight: 4,
+            opacity: 0.8,
+            interactive,
+          }),
           `route:${train.id}`,
           popup,
         ).addTo(layer);
@@ -345,7 +351,7 @@ export function showParties(
         withPopup(
           L.circleMarker(where, {
             radius: 9,
-            color: TRAIN_COLOUR,
+            color: theme().colours.train,
             fillOpacity: at ? 1 : 0.3,
             interactive,
           }),
@@ -474,7 +480,7 @@ export function showParties(
         if (stops.length > 1) {
           L.polyline(
             stops.map(({ gym }) => L.latLng(gym.lat, gym.lon)),
-            { color: TRAIN_COLOUR, weight: 4, dashArray: '6 6', interactive: false },
+            { color: theme().colours.train, weight: 4, dashArray: '6 6', interactive: false },
           ).addTo(routeLayer);
         }
         for (const { gym, number, here } of stops) {
@@ -557,7 +563,7 @@ export function showParties(
           const marker = L.circleMarker([lat, lon], {
             radius: 6,
             weight: 2,
-            color: STOP_COLOUR,
+            color: theme().colours.stop,
             fillOpacity: 0.8,
           });
           // The title as text of an element of ours: Leaflet sets a string as HTML.
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
new file mode 100644
index 0000000000000000000000000000000000000000..b3fecfac915621536135ada8f320d2e6cf5e35e2
--- /dev/null
+++ b/src/web/client/theme.css
@@ -0,0 +1,78 @@
+/*
+ * The look of the map and the region editor as named values (plan 8M-6): every colour of the
+ * pages, and the sizes a restyle would touch. `map.css` and `editor.css` use them; the colours
+ * Leaflet draws (outlines, dots, lines, rings) are read from here by `theme.ts`. Change a value
+ * here and run `npm run web:build` (web.md, "Restyling the page").
+ */
+:root {
+  /* Type and shape. */
+  --font: system-ui, sans-serif;
+  --font-size: 15px;
+  --radius: 4px;
+  /* The map's side panel (parties, forms) and the region editor's panel. */
+  --panel-width: 300px;
+  --editor-panel-width: 360px;
+
+  /* The page. */
+  --text: #1f2328;
+  --text-soft: #444;
+  --muted: #555;
+  --header-bg: #1f3d2b;
+  --header-text: #fff;
+  --field-border: #8aa;
+  --login-bg: #5865f2;
+  --login-text: #fff;
+  --notice-bg: #fff4cc;
+  --notice-border: #e0c060;
+  --panel-bg: #fafbfc;
+  --panel-border: #ccd;
+  --divider: #e3e6ea;
+  --button-bg: #fff;
+  --button-border: #8a94a6;
+  --form-answer: #8a3b00;
+  --label-bg: rgba(255, 255, 255, 0.85);
+  --region-label: #203060;
+  --raid-icon-bg: rgba(255, 255, 255, 0.85);
+  --stop-number-bg: #fff;
+  --stop-number-text: #6b2a00;
+  --stop-number-here-text: #fff;
+
+  /* What the map draws (`theme.ts`); the raid's ring and route mode's numbers share them. */
+  --gym: #2d7a3a;
+  --region: #3060c0;
+  --raid: #c0392b;
+  --train: #d35400;
+  --meetup: #8e44ad;
+  --stop: #2980b9;
+
+  /* The region editor's panel. */
+  --tool-bg: #e8efe9;
+  --warning: #8a5a00;
+  --fresh-piece: #b00020;
+  --dialog-bg: #f7faf7;
+  --cannot-fix: #6b6b6b;
+  --fix-chosen-bg: #eef3ee;
+  --fix-line: #111111;
+  --fix-corner-bg: #ffffff;
+
+  /* What the region editor draws (`theme.ts`): regions in turn, and the rest. */
+  --region-1: #3060c0;
+  --region-2: #2d7a3a;
+  --region-3: #a05a00;
+  --region-4: #7a3ab0;
+  --region-5: #00838f;
+  --region-6: #9e2a5e;
+  --region-7: #5d6d00;
+  --region-8: #c0392b;
+  --others: #8a8a8a;
+  --broken: #d00000;
+  --editor-gym: #2d7a3a;
+  --editor-stop: #1e88e5;
+  --power-spot: #8e24aa;
+  --wayfarer-gym: #6d4c41;
+  --outside: #ff8f00;
+  --overlap: #e53935;
+  --gap: #6a1b9a;
+  --theirs: #1565c0;
+  --preview: #111111;
+}
diff --git a/src/web/client/theme.test.ts b/src/web/client/theme.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..73c35e682da9024a2e92012ec02ae8f474997f4d
--- /dev/null
+++ b/src/web/client/theme.test.ts
@@ -0,0 +1,22 @@
+import { describe, expect, it } from 'vitest';
+import { DRAWN_COLOURS, MISSING_COLOUR, readTheme, REGION_PALETTE } from './theme.js';
+
+describe('readTheme', () => {
+  it("reads each drawn colour and the editor's palette from their custom properties", () => {
+    const asked: string[] = [];
+    const theme = readTheme((property) => {
+      asked.push(property);
+      return property === '--raid' ? '  #c0392b ' : `value of ${property}`;
+    });
+    expect(theme.colours.raid).toBe('#c0392b');
+    expect(theme.colours.train).toBe('value of --train');
+    expect(theme.palette).toEqual(REGION_PALETTE.map((property) => `value of ${property}`));
+    expect(asked.sort()).toEqual([...Object.values(DRAWN_COLOURS), ...REGION_PALETTE].sort());
+  });
+
+  it('draws a property the stylesheet lacks in grey, so that the shape still shows', () => {
+    const theme = readTheme((property) => (property === '--gap' ? ' ' : '#123456'));
+    expect(theme.colours.gap).toBe(MISSING_COLOUR);
+    expect(theme.colours.overlap).toBe('#123456');
+  });
+});
diff --git a/src/web/client/theme.ts b/src/web/client/theme.ts
new file mode 100644
index 0000000000000000000000000000000000000000..04a2df8e351aa140e0e98a55b37a01d11539e718
--- /dev/null
+++ b/src/web/client/theme.ts
@@ -0,0 +1,83 @@
+/**
+ * The colours the pages draw with Leaflet (plan 8M-6): outlines, dots, lines and rings, which no
+ * stylesheet reaches. Their values are custom properties of `theme.css`, beside every other
+ * colour and the sizes a restyle would touch, so that the look is changed in one file; the page
+ * reads them once, at its first drawing (`theme()`), the stylesheet having loaded before the
+ * script. No colour is written anywhere else in the pages' code (`page-theme.test.ts`).
+ */
+
+/** Each colour drawn from TypeScript, by the custom property of `theme.css` that holds it. */
+export const DRAWN_COLOURS = {
+  /** The map's gym dots. */
+  gym: '--gym',
+  /** The map's region outlines. */
+  region: '--region',
+  /** A raid's dot, and the ring round its picture. */
+  raid: '--raid',
+  /** A train's line and stop, and route mode's numbers. */
+  train: '--train',
+  /** A meetup's ring. */
+  meetup: '--meetup',
+  /** The PokéStops shown while a meetup's place is picked. */
+  stop: '--stop',
+  /** The region editor: other servers' outlines. */
+  others: '--others',
+  /** The region editor: an outline that cannot be saved. */
+  broken: '--broken',
+  /** The region editor: gyms, PokéStops, power spots and Wayfarer gyms. */
+  editorGym: '--editor-gym',
+  editorStop: '--editor-stop',
+  powerSpot: '--power-spot',
+  wayfarerGym: '--wayfarer-gym',
+  /** The region editor: a place in no region. */
+  outside: '--outside',
+  /** The region editor: overlaps and gaps. */
+  overlap: '--overlap',
+  gap: '--gap',
+  /** The region editor: a region somebody else changed. */
+  theirs: '--theirs',
+  /** The region editor: the outlines a fix would draw. */
+  preview: '--preview',
+} as const;
+
+/** The region editor's colours of regions, in turn. */
+export const REGION_PALETTE = [
+  '--region-1',
+  '--region-2',
+  '--region-3',
+  '--region-4',
+  '--region-5',
+  '--region-6',
+  '--region-7',
+  '--region-8',
+] as const;
+
+export type DrawnColour = keyof typeof DRAWN_COLOURS;
+
+export interface Theme {
+  colours: Readonly<Record<DrawnColour, string>>;
+  /** Never empty. */
+  palette: readonly string[];
+}
+
+/** What a property the stylesheet lacks gives: grey, so that what is drawn still shows. */
+export const MISSING_COLOUR = 'gray';
+
+/** The theme as `read` gives each custom property (its value, or empty when there is none). */
+export function readTheme(read: (property: string) => string): Theme {
+  const value = (property: string): string => read(property).trim() || MISSING_COLOUR;
+  const colours = Object.fromEntries(
+    Object.entries(DRAWN_COLOURS).map(([name, property]) => [name, value(property)]),
+  ) as Record<DrawnColour, string>;
+  return { colours, palette: REGION_PALETTE.map(value) };
+}
+
+let current: Theme | undefined;
+
+/** The page's theme, read from `:root` at the first call. */
+export function theme(): Theme {
+  current ??= readTheme((property) =>
+    getComputedStyle(document.documentElement).getPropertyValue(property),
+  );
+  return current;
+}
diff --git a/src/web/page-theme.test.ts b/src/web/page-theme.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..265a0235873ed6af62576d899521c8868ccddc07
--- /dev/null
+++ b/src/web/page-theme.test.ts
@@ -0,0 +1,188 @@
+import { readdirSync, readFileSync } from 'node:fs';
+import path from 'node:path';
+import ts from 'typescript';
+import { describe, expect, it } from 'vitest';
+
+/**
+ * The pages' look as named values (plan 8M-6): every colour is a custom property of
+ * `src/web/client/theme.css`, the stylesheets use them, and the colours Leaflet draws come
+ * through `theme.ts` from the same properties. Read from the sources, as a restyle would touch
+ * them.
+ */
+
+const CLIENT = path.resolve(import.meta.dirname, 'client');
+const read = (file: string): string => readFileSync(path.join(CLIENT, file), 'utf8');
+/** Block comments blanked, their line breaks kept (so that a line number stays true). */
+const withoutComments = (text: string): string =>
+  text.replace(/\/\*[\s\S]*?\*\//gu, (comment) => comment.replace(/[^\n]/gu, ''));
+
+/** Every file of the client folder and the folders in it, by its path from there (`/`). */
+const files = readdirSync(CLIENT, { recursive: true, withFileTypes: true })
+  .filter((entry) => entry.isFile())
+  .map((entry) =>
+    path.relative(CLIENT, path.join(entry.parentPath, entry.name)).replace(/\\/gu, '/'),
+  );
+
+/**
+ * Colours by name: the usual ones, which a restyle could write in place of a property.
+ * `transparent`, `inherit`, `currentColor` and `none` are no colour of the theme and stay allowed.
+ */
+const NAMED = [
+  'black',
+  'white',
+  'gray',
+  'grey',
+  'silver',
+  'red',
+  'maroon',
+  'crimson',
+  'orange',
+  'gold',
+  'yellow',
+  'olive',
+  'lime',
+  'green',
+  'teal',
+  'cyan',
+  'aqua',
+  'blue',
+  'navy',
+  'indigo',
+  'purple',
+  'violet',
+  'magenta',
+  'fuchsia',
+  'pink',
+  'brown',
+];
+const WRITTEN = String.raw`#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|color-mix)\(`;
+const NAME = `(?:${NAMED.join('|')})`;
+/** A colour in a stylesheet's value: hex, a colour function or a named colour, anywhere. */
+const COLOUR = new RegExp(String.raw`${WRITTEN}|(?<![\w-])${NAME}(?![\w-])`, 'iu');
+/**
+ * A colour in a text of TypeScript: hex or a colour function anywhere; a named colour as the
+ * whole text, as Leaflet's options take one (the page's sentences may name the colours a shape
+ * is drawn in: "shown in red").
+ */
+const COLOUR_TEXT = new RegExp(String.raw`${WRITTEN}|^\s*${NAME}\s*$`, 'iu');
+
+/** The declarations of a stylesheet, block by block: `[selector, property, value]`. */
+function declarations(css: string): [string, string, string][] {
+  const found: [string, string, string][] = [];
+  for (const block of withoutComments(css).matchAll(/([^{}]*)\{([^{}]*)\}/gu)) {
+    const selector = (block[1] ?? '').trim();
+    for (const declaration of (block[2] ?? '').split(';')) {
+      const colon = declaration.indexOf(':');
+      if (colon < 0) continue;
+      found.push([
+        selector,
+        declaration.slice(0, colon).trim(),
+        declaration.slice(colon + 1).trim(),
+      ]);
+    }
+  }
+  return found;
+}
+
+/** A value of a stylesheet without the custom properties it names (`var(--red)` is no colour). */
+const withoutProperties = (value: string): string => value.replace(/--[\w-]+/gu, '');
+
+/**
+ * The texts of a TypeScript file's string and template literals (the parts of a template
+ * between its `${…}` too), each with its line: what could hold a colour Leaflet or the page
+ * would draw. Comments and code are no texts.
+ */
+function texts(file: string): { line: number; text: string }[] {
+  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
+  const found: { line: number; text: string }[] = [];
+  const visit = (node: ts.Node): void => {
+    // The one colour of the code: what a property the stylesheet lacks is drawn in.
+    if (
+      file === 'theme.ts' &&
+      ts.isVariableDeclaration(node) &&
+      node.name.getText(source) === 'MISSING_COLOUR'
+    ) {
+      return;
+    }
+    if (
+      ts.isStringLiteral(node) ||
+      ts.isNoSubstitutionTemplateLiteral(node) ||
+      ts.isTemplateHead(node) ||
+      ts.isTemplateMiddle(node) ||
+      ts.isTemplateTail(node)
+    ) {
+      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
+      found.push({ line: line + 1, text: node.text });
+    }
+    ts.forEachChild(node, visit);
+  };
+  visit(source);
+  return found;
+}
+
+describe("the pages' look", () => {
+  it('finds a colour anywhere in a text or a value, and allows the keywords that are none', () => {
+    const anywhere = [
+      '#c0392b',
+      '1px solid #fff',
+      '0 0 4px rgba(0, 0, 0, 0.3)',
+      'background: hsl(120 50% 50%)',
+      'oklch(70% 0.1 200)',
+      'color-mix(in srgb, var(--a) 50%, transparent)',
+    ];
+    for (const text of [...anywhere, 'white', ' Red ']) {
+      expect(COLOUR.test(text), text).toBe(true);
+      expect(COLOUR_TEXT.test(text), text).toBe(true);
+    }
+    expect(COLOUR.test('1px solid red')).toBe(true);
+    expect(COLOUR_TEXT.test('2 outlines cannot be saved (shown in red).')).toBe(false);
+    for (const text of ['transparent', 'inherit', 'currentColor', 'none', 'Reported', 'redraw']) {
+      expect(COLOUR.test(text), text).toBe(false);
+      expect(COLOUR_TEXT.test(text), text).toBe(false);
+    }
+    expect(COLOUR.test(withoutProperties('1px solid var(--red)'))).toBe(false);
+  });
+
+  it('writes no colour in the TypeScript of the pages: Leaflet draws theme.css colours', () => {
+    const sources = files.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
+    expect(sources).toContain('theme.ts');
+    const written = sources.flatMap((file) =>
+      texts(file).flatMap(({ line, text }) => (COLOUR_TEXT.test(text) ? [`${file}:${line}`] : [])),
+    );
+    expect(written).toEqual([]);
+  });
+
+  it('writes colours in the stylesheets only as custom properties of theme.css', () => {
+    const sheets = files.filter((file) => file.endsWith('.css') && file !== 'theme.css');
+    expect(sheets).toEqual(expect.arrayContaining(['map.css', 'editor.css']));
+    for (const file of sheets) {
+      const written = declarations(read(file)).filter(([, , value]) =>
+        COLOUR.test(withoutProperties(value)),
+      );
+      expect(written, file).toEqual([]);
+    }
+    const theme = declarations(read('theme.css'));
+    expect(theme.length).toBeGreaterThan(0);
+    for (const [selector, property] of theme) {
+      expect(selector, property).toBe(':root');
+      expect(property).toMatch(/^--[a-z0-9-]+$/u);
+    }
+    // Both pages load it: the editor's stylesheet takes the map's.
+    expect(read('map.css')).toMatch(/@import '\.\/theme\.css';/u);
+    expect(read('editor.css')).toMatch(/@import '\.\/map\.css';/u);
+  });
+
+  it('defines every property the pages use or draw with', () => {
+    const defined = new Set(declarations(read('theme.css')).map(([, property]) => property));
+    const used = new Set([
+      ...files
+        .filter((file) => file.endsWith('.css'))
+        .flatMap((file) =>
+          [...read(file).matchAll(/var\((--[a-z0-9-]+)\)/gu)].map((match) => match[1] ?? ''),
+        ),
+      ...[...read('theme.ts').matchAll(/'(--[a-z0-9-]+)'/gu)].map((match) => match[1] ?? ''),
+    ]);
+    expect(used.size).toBeGreaterThan(20);
+    expect([...used].filter((property) => !defined.has(property))).toEqual([]);
+  });
+});
````

### Task 5: Docs: the web map's small fixes and their staging checklist (8M-6)

Prototype commit: `ceb0f26ceef9a14aa0b185a7e50bdaa826fcd256`

`web.md`, `gyms-and-regions.md`, `parties-and-posts.md` and `testing.md` where behaviour changed; the staging checklist `docs/superpowers/plans/2026-10-17-phase-8m6-staging.md`.

**Files:**

```
 docs/architecture/gyms-and-regions.md                  |  2 +-
 docs/architecture/parties-and-posts.md                 |  4 ++--
 docs/architecture/testing.md                           |  3 ++-
 docs/architecture/web.md                               | 20 ++++++++++----------
 docs/superpowers/plans/2026-10-17-phase-8m6-staging.md | 32 ++++++++++++++++++++++++++++++++
 5 files changed, 47 insertions(+), 14 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>` (or type it in). The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's tests:** `npm run typecheck`; all pass.
- [ ] **Step 3: Format and lint:** `npx prettier --check docs/architecture/gyms-and-regions.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m6-staging.md`.
- [ ] **Step 4: Check the transcription:** `git diff ceb0f26ceef9a14aa0b185a7e50bdaa826fcd256 -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m6-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `Docs: the web map's small fixes and their staging checklist (8M-6)`, the paragraph above as the body and the trailer, staging exactly
  `docs/architecture/gyms-and-regions.md docs/architecture/parties-and-posts.md docs/architecture/testing.md docs/architecture/web.md docs/superpowers/plans/2026-10-17-phase-8m6-staging.md`.

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index ef10ee4260757546159f4b7866106fa7046748de..76199e6adaf4e705983e5e2d6e0c6e3349942837 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -34,6 +34,6 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 ## Regions
 
 - Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id. `preview` takes the regions removed in the same save (`removing`, the region editor's): `planImport` counts their gyms among those left in no region.
-- The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use) and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits), `fix.ts` and `fix-all.ts` (Fix and "Fix all slivers", plan 8M-2F, with `lines.ts`: lines measured flat in metres); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
+- The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, and the server's regions, the regions of its channels and the channels the save depends on compared with those the save was planned against, `regionsStamp` and `channelsStamp` of `src/web/editor-save.ts`, another server's regions and the server's other channels left out (plan 8M-6); then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use; `'editor'` words a new channel's name as typed in the panel, "a typo in a name", where a file's preview says "a typo in the file") and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`: the escapes of `plain` undone by `unplain` outside the code spans of derived names, so a typed backslash shows once). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits), `fix.ts` and `fix-all.ts` (Fix and "Fix all slivers", plan 8M-2F, with `lines.ts`: lines measured flat in metres); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
 - KML is read by pure code: `src/domain/geo/xml.ts` (a linear reader that never throws; DOCTYPE refused), `kml.ts` (`readKml`, `writeKml`, `kmlFiles`; at most `MAX_KML_AREAS` areas and `MAX_KML_CORNERS` corners in a file, descriptions as one line of plain text), `outline.ts` (`tidyOutline`: closed, latitude first, at most 5,000 corners, no self-crossing; checked by a longitude sweep), and `src/domain/regions/region-import.ts` (`planImport`, the channel a name stands for by the legacy rule, near misses, crowded categories). Gyms are tested against an outline's bounding box before the ring. The picture of a region is drawn from a simplified outline when the address would be too long; the stored outline never is.
 - `/bounds` is a members' command (the picture and the gym count of the region of the channel; `boundsMessage`: `### The area of <#channel>`, the count, the map as a gallery). `/find-region` answers with `findRegionMessage` (the sentence, the map, `OSM_ATTRIBUTION` in small print). Every message of `/region` is v2 (plan 8B-4, `REGION_COLOUR`): the preview of `/region import` and its outcome are one container (`### Import regions` and the sentences within `SENTENCES`, a line, **Would be imported** / **Left out** or **Imported** / **Not imported** within `IMPORT_LIST` and `LEFT_OUT_LIST`, `preview.txt` (of the outcome `outcome.txt`, `OUTCOME_FILE`) as a file component and a file of the message (`V2Message.files`) whenever a list or the sentences are cut, every line in it with channels by their names; **Not imported** has the larger room, the buttons inside; `importMessage`); the question and outcome of `/region remove` are `regionQuestion`s; answers go through `answerRegion`, and what the controls say (working, expired, cancelled, a refusal) through `sayRegion`. Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
diff --git a/docs/architecture/parties-and-posts.md b/docs/architecture/parties-and-posts.md
index be385e656d23733d8120dc152f10e002b9d86164..2be51e7bab7b9d9e47e492c272a9475d648ebad8 100644
--- a/docs/architecture/parties-and-posts.md
+++ b/docs/architecture/parties-and-posts.md
@@ -25,9 +25,9 @@ A party is a raid, a meetup or a train: an immutable object changed by pure func
 
 ## Raids
 
-- What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`; the words are `raidChangeAnswer`'s, `src/commands/raids/raid-changes.ts`, which a refusal or a raid that ended throws). `/hatch`, `/end` (of a raid), the "Set time" form, `/boss` (of a raid) and `/moveset` go through `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` there (read, change as the member, answer), the one code path the live map calls too (plan 8M-4, `web.md`); `/raid` reports through `reportRaidAs` and words the outcome with `reportWords` (`src/commands/raids/report.ts`), which the map shares. It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
+- What members change about a raid itself goes through `ctx.raids` (`RaidChangeService`): `setHatchTime`, `setEndTime`, `setDuration`, `setBoss`, `setMoveset`, `setGym`, each answering `RaidChangeOutcome` (`gone`, `refused` with `reason` and for `gym-taken` the `other` raid, `ok` with `changed`), which a handler turns into the private answer with `answerRaidChange` (`src/commands/raids/change.ts`; the words are `raidChangeAnswer`'s, `src/commands/raids/raid-changes.ts`, which a refusal or a raid that ended throws). `/hatch`, `/end` (of a raid), the "Set time" form, `/boss` (of a raid) and `/moveset` go through `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` there (read, change as the member, answer), the one code path the live map calls too (plan 8M-4, `web.md`); `/raid` reports through `reportRaidAs` and words the outcome with `reportWords` (`src/commands/raids/report.ts`), which the map shares; a report that would put the member in a forum somebody keeps them out of (the forum the new raid would go to, or that of an active raid already at the gym, which may stand in another region's forum: `reportBarred`, the map's check too) is refused with `REPORT_BARRED` (plan 8M-6), by `/raid`'s guard before its throttle for a gym typed outright, and once the gym is known (`withGym`) for one chosen from a menu or read from a screenshot (counted then), and again on "Report it there" after the question about a gym of another region (the access may have changed since); a failure of Discord to say propagates. It decides inside the store under the locks of the gyms concerned, refuses a change that would make two raids of one kind block one gym, moves or cancels meeting times that no longer fit (`fitMeetingTimes`), releases who is asked when a correction makes the raid an egg again, and says a line in the post. A meeting time is `ctx.attendance.setMeetingTime`.
 - A raid that moves to a gym of another region becomes a new party (`PartyService.relocate`, reached through `ctx.raids.setGym`; `RaidChangeService.gymMove(party, gym)` says `local`, `region` or `nowhere`): the new party is stored and gets its post, the old post is told where the raid went (pinging who is signed up and allows it) while its party is still active, then the old party ends inside the store and the new one takes over what the raid was at that moment (`relocatedRaid`, `carriedOver` in `src/domain/party/relocate.ts`); the old post is closed by the usual end path. Whatever fails before the old party has ended takes the new post back (`takeBack`) and leaves the raid where it was; a raid that ended meanwhile does not come back. The party id changes with a move. `moved` (of `relocate` and `setGym`) is the answer to an interaction in the old post, given before that post is closed.
-- The post of an egg shows the game's egg (`raidEggName`, `src/domain/pogo/raid-eggs.ts`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one. `raidLook(view)` (`src/render/raid-post.ts`) gives the live map the post's picture and the boss it names, decided as for the post. The pictures are square (plan 8D-F, Matt, 2026-10-17: PokeMiners' icons are 112 by 128 and a phone crops a thumbnail to a square, cutting the egg's bottom off): `scripts/eggs/make-eggs.ts` (`npm run eggs:make`, the one step that downloads them, from `RAID_EGG_PICTURES_URL`'s pinned commit) padded each with transparency to a square of its longer side, the egg centred and unscaled, into `pictures/eggs/`, which is committed and in the image; nothing is fetched at run time, and `settings.raidEggPicturesUrl` is retired (`RETIRED_SETTINGS`). `EggPictures` (`src/services/egg-pictures.ts`, `PartyServiceOptions.eggPictures`) says where a post takes one from: once the web server listens (`src/app.ts` calls `serving()` when `startWebServer` answered true, so a port it could not take leaves the files) with `settings.web` at a public address that is not this machine's, the bot's own web server (`<publicUrl>/eggs/<name>.png?v=<8 hex>`, the start of the file's SHA-256, so that a cached picture never hides an egg made again; `web.md`); otherwise, and until then, the message carries the file and shows it as `attachment://<name>.png` (`RaidPostView.eggFile`, `PostLayout.pictureFile`, `PartyBrief.pictureFile`). Every post message says which files it has (`files`, `[]` when none: `postMessage`), and an edit that says so replaces the files the message had (`editAs` sends `attachments: []` and the files uploaded again; a conversion sends them through the REST route with `attachments` by index, `uploadsOf`), as Discord documents it: an edit keeps only the attachments it names. So the egg's file is uploaded again with every edit while it is an egg (some 22 KB), and the edit at hatch takes it away. A copy in another channel and the direct message's brief carry the same file. Where the bot may not attach files Discord answers Missing Permissions (50013), not Invalid Form Body: `isRefusedFile` (`src/discord/party-gateway.ts`, over `looksLikeRefusedFile`: 50013, 50035, 40005 or an error of reading the file, for a message that carries files) has a post, its edit and a copy sent once more without the file (`PostVariant.files: false`: the egg left out, pictures by address kept; `postForms`, `sendInForms`, `src/services/refused-files.ts`), and then in its other forms if Discord refuses one (`FormTrail`, below the controls); once a form without the file goes through (also one that needed plain emoji or no pictures as well), the forum, the post or the channel of copies is remembered for ten minutes (`RefusedFiles`, shared by `PartyService` and `PartyMirrors`), so that its next messages go without the file at once, with no refused call and no warning each time; a post made by its line of text after the first way had its file refused edits the line in without the file at once. Invalid Form Body is never noted as refused files (when a post is made it is taken as a refused first message; an edit or a copy refused so may have been refused for what it holds): only another refusal of the file is.
+- The post of an egg shows the game's egg (`raidEggName`, `src/domain/pogo/raid-eggs.ts`): the wormhole for a T5 of ultra beasts, the primal egg for primals, none for a super mega, the plain egg for a shadow one. `raidLook(view)` (`src/render/raid-post.ts`) gives the live map the post's picture, the boss it names and where Where says it is (`place`: the gym's name as the post shows it, its point and address line; plan 8M-6), decided as for the post. The pictures are square (plan 8D-F, Matt, 2026-10-17: PokeMiners' icons are 112 by 128 and a phone crops a thumbnail to a square, cutting the egg's bottom off): `scripts/eggs/make-eggs.ts` (`npm run eggs:make`, the one step that downloads them, from `RAID_EGG_PICTURES_URL`'s pinned commit) padded each with transparency to a square of its longer side, the egg centred and unscaled, into `pictures/eggs/`, which is committed and in the image; nothing is fetched at run time, and `settings.raidEggPicturesUrl` is retired (`RETIRED_SETTINGS`). `EggPictures` (`src/services/egg-pictures.ts`, `PartyServiceOptions.eggPictures`) says where a post takes one from: once the web server listens (`src/app.ts` calls `serving()` when `startWebServer` answered true, so a port it could not take leaves the files) with `settings.web` at a public address that is not this machine's, the bot's own web server (`<publicUrl>/eggs/<name>.png?v=<8 hex>`, the start of the file's SHA-256, so that a cached picture never hides an egg made again; `web.md`); otherwise, and until then, the message carries the file and shows it as `attachment://<name>.png` (`RaidPostView.eggFile`, `PostLayout.pictureFile`, `PartyBrief.pictureFile`). Every post message says which files it has (`files`, `[]` when none: `postMessage`), and an edit that says so replaces the files the message had (`editAs` sends `attachments: []` and the files uploaded again; a conversion sends them through the REST route with `attachments` by index, `uploadsOf`), as Discord documents it: an edit keeps only the attachments it names. So the egg's file is uploaded again with every edit while it is an egg (some 22 KB), and the edit at hatch takes it away. A copy in another channel and the direct message's brief carry the same file. Where the bot may not attach files Discord answers Missing Permissions (50013), not Invalid Form Body: `isRefusedFile` (`src/discord/party-gateway.ts`, over `looksLikeRefusedFile`: 50013, 50035, 40005 or an error of reading the file, for a message that carries files) has a post, its edit and a copy sent once more without the file (`PostVariant.files: false`: the egg left out, pictures by address kept; `postForms`, `sendInForms`, `src/services/refused-files.ts`), and then in its other forms if Discord refuses one (`FormTrail`, below the controls); once a form without the file goes through (also one that needed plain emoji or no pictures as well), the forum, the post or the channel of copies is remembered for ten minutes (`RefusedFiles`, shared by `PartyService` and `PartyMirrors`), so that its next messages go without the file at once, with no refused call and no warning each time; a post made by its line of text after the first way had its file refused edits the line in without the file at once. Invalid Form Body is never noted as refused files (when a post is made it is taken as a refused first message; an edit or a copy refused so may have been refused for what it holds): only another refusal of the file is.
 
 ## Meetups and timed parties
 
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index dc62039b32fb1d30c62dba6dc6c20de42ed27318..1fe68adb72778c1492784a1e5887bd2946ffbc65 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -53,10 +53,11 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Route tests build the server with `webServerWith(options)` (`test/support/web.ts`) and ask it with Fastify's `inject` (no port, no network); close `app` after each test. It gives `TEST_WEB` (`https://map.example.test`, OpenStreetMap) changed by `web`, the server of the fake interactions as the only one the bot is in (`servers`), nobody a member (`members`: a `FakeMemberDirectory`), a `FakeOAuth` (`knows(code, user)`, `exchanged`, `whoFails`; `oauth: undefined` is no client secret), sessions in memory (`sessions`: `MemoryWebSessions`, `sessionService`) on a clock of the test's (`clock.now`, from `WEB_START`), `loginLinks`, and `loggedIn(userId, name)` for the `cookie` header of a session. `setCookies(answer)` and `cookieOf(answer, name)` read what an answer set. The map's data comes from `geoSourcesWith()` (the invented gyms and regions under real directories, channels named `west` and `east`; pass `{ geo: sources }`), the page's bundle from `builtAssets()` (a folder with hashed names, made in the temp folder and removed when the test that called it is over, through `onTestFinished`: call it inside a test, not in a `beforeAll`; without it the page answers that it is not built). The cookie names follow the public address: `__Host-pine_session` and `__Secure-pine_oauth` under `TEST_WEB`, the plain names under `web: { publicUrl: 'http://localhost:…' }`; `loggedIn` uses `sessionService.cookieName`. The address of a request is `inject`'s `remoteAddress` (behind a proxy: `web: { trustProxy: true }`, a nearby `remoteAddress` and an `x-forwarded-for` header).
 - The region editor (plan 8M-2): who is staff is `FakeRegionStaff` (pass it as `staff`; nobody is staff until `asStaff(userId, mayManageChannels)` or `answer(userId, staffAnswer)`; `asked` records every question, `failing` makes Discord away); its data comes from `editorSourcesWith(wayspotRows)` (the sources of `geoSourcesWith` with kept Wayspots and the channels as `ServerChannel`s: `west`, `east` in `Town`, `south`, a forum; pass `{ editor: sources }`); preview and save run over region administration on fakes, `regionEditingWith()` (`regionAdminWith` as the bot wires it, but the new overlaps and gaps worked out on the test's thread, `inThisThread`; pass `editing`, with a `checker` of the test's own to count or refuse checks; its `regions.rows`, `lock`, `store`, `gateway.auditReasons`, `entries` for the service's log). `SaveCheckWorker` is tested with its real thread through tsx and with `test/support/hanging-thread.ts`, which never answers (its limit by faked `setTimeout`). `posting(userId, name)` gives the headers of a POST of Pine's own page (cookie, `Origin`, CSRF token). `builtAssets()` holds the editor's script, style and worker too. Fix and Fix all (plan 8M-2F) are tested on invented outlines at 40° north, where a thousandth of a degree of longitude is about 85 m (`fix.test.ts`, `fix-all.test.ts`, `coverage-check.test.ts`: squares reaching into each other, a border bowing away, a strip closed by a third region, a U-shaped gap round a tongue, borders that touch at a point, a slanted border at six decimals, an outline wound the other way, two regions stacked along a gap's straight side, two regions of 5,000 corners each that no choice can rebuild, their many corners along a horizontal edge so that polyclip's sweep stays quick), and on borders generated from a seed (`fix-all.test.ts`, its own little generator: every choice offered gives tidy outlines, nothing new against the regions as loaded, every place that changes region named); Fix all's questions after an answer moved a border from a `FixAllState` built by hand (`waitingFor`, stretches found on outlines since changed); the worker's failures by a `CoverageChecker` given work that throws (`new CoverageChecker({ fixOptions: broken })`, also `findStretches` and `nextQuestion`); a region's real outlines are read only by scratch scripts.
 - The parties on the map (plan 8M-3): `partyWebWith(made, { acting, throttles })` (`test/support/web.ts`) gives the web server the party services of a test (`partyServiceWith`, `reportedRaid`, `createdMeetup`, …: the store, the attendance service, the fake gateway's forums and `memberAccess`, the party service's `raidLook`, the fakes' server as row 1); pass it as `parties`, and set the web server's `clock.now` to the parties' (`PARTY_NOW`). Who presses is `FakeActingMembers` (nobody until `add(userId, name, team?)`; `holdBack(userId, 'timed-out' | 'pending')` for a member who may not act now, `standing(userId, { roleNames, administrator })` for the map's member role (no role by default), `remove`, `asked`, `failing` for Discord away), asked only for somebody the web server's `members` has (a press asks the directory first); who sees the list is the web server's `members` (`FakeMemberDirectory`; its `standing(userId, { roleNames, administrator })` gives the roles the map's member role is judged by, `web: { memberRole }` names it), who is barred `gateway.barred`, who cannot see a forum `gateway.shutOut` (a press then lets them in: `access.flush()`). `throttles` is a `Throttles` of the test's, to fill in the window of the post's controls (`controlThrottleKey(PARTY_KIND)`) before a press; `InteractionRouter` takes one too (`RouterOptions.throttles`). `PartyViewers` is tested over a `FakeMemberDirectory` and a `FakePartyGateway` (`failing.set('memberAccess', …)` for Discord away), `DiscordWebMembers` against a stub of discord.js's guild as `DiscordRegionStaff` is. The bot's owner of the parties' deps is `TEST_OWNER_ID` (`TEST_ENV.OWNER_ID`), staff in every server: add them to `members` and `acting` to change a raid as staff; a moderator is a member with the role `Moderator` (`standing`).
-- Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`).
+- Raids on the map (plan 8M-4): `raidWebWith(ctx, { channelName })` gives the web server what the raid commands read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `raids`, `parties`, `regions` of `partyServiceWith` or `reportedRaid`, and `users: new MemoryUsers(settings)` for a member's privacy); pass it as `raids` beside `partyWebWith(made, …)` as `parties`, the same `throttles` in both a router and the map to see a command's window shared (fill it under the command's name, `RAID_COMMAND` or `hatch`, before a request). Without it every use of the raids' deps throws, saying to give it. A gym in several regions: the invented gyms with `regionsOf` overridden (`Object.create(gymsFixture())`), given to `partyServiceWith({ gyms })` and to the context alike (`raid-report.test.ts`; `/raid`'s own refusal of a forum the member is kept out of in `raid.test.ts`, with `gateway.barred` and a router's `Throttles` to see it uncounted, plan 8M-6).
 - Spawns on the map (plan 8M-4S): `spawnWebWith(ctx, { channelName, channels })` gives the web server what `/wild` reads and calls, from a test's context (`createTestContext` with `spawns`, `wants`, `regions` of `partyServiceWith`, and `config` with other `wildSpawnExceptions` to test them); pass it as `spawns` beside `partyWebWith(made, …)`, the same `throttles` in a router to see `/wild`'s window shared (`WILD_COMMAND`). Without it every use of the spawns' deps throws. `channels: made.gateway` lets the fake gateway say who an overwrite of their own keeps out of a region's channel (`gateway.ownViewDenials`, by channel; `failing.set('ownViewDenied', …)` for Discord away); without it nobody is. A point in several regions: change `made.regions.rows` (East's outline reaching into West, `spawn-report.test.ts`); the DMs are `made.notify.flush()` and `made.dms`. The bot refused in a region's channel: `gateway.failing.set('sendMessage', missingPermissions('POST'))`. The page's spawn form itself (`spawnUi`) imports Leaflet, which needs a browser as it loads: its test mocks `leaflet` and is `spawn-ui.isolated.test.ts`, with a `document` of its own (`vi.stubGlobal`, `vi.unstubAllGlobals()` afterwards) and a real `FormHold`.
 - Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a power spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode, the Move panel) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events, the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
+- The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a colour written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define; `theme.test.ts` reads a theme through a fake reader (`readTheme`). It lives outside `src/web/client/` because the client's type check has no Node.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index cbae0cd5b76430fae349640479c01c7d3919665a..959b9ac30e79fa5fb432bf9c664ad298bf3f3ba5 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -1,6 +1,6 @@
 # The web server and the map
 
-The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5M; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
+The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowers/specs/2026-10-15-web-map-region-editor-design.md`): its settings and secrets, how it is built, started and stopped, sessions and CSRF, logging in with Discord and with the links of `/maps` and `/region edit`, rate limits, the public map's data and page, the parties on the map and joining them, reporting and changing raids on the map, reporting wild Pokémon on the map, starting, arranging and moving trains on the map, making and changing meetups on the map, the region editor, the Content Security Policy, and the rules for adding a route. Read before changing anything under `src/web/` or adding a page or an address. How an operator sets it up is `docs/web-setup.md`.
 
 ## Settings, secrets, start and stop
 
@@ -22,7 +22,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5M; spec `docs/superpow
 ## Sessions and CSRF
 
 - A session (`Sessions`, `src/web/sessions.ts`) is 32 random bytes in the cookie `__Host-pine_session` (`sessionCookieName`, `sessions.cookieName`; `sessionCookie`: HttpOnly, Secure, SameSite=Lax, path `/`, no Domain, 30 days). The `__Host-` prefix keeps a sibling host of the domain from setting or shadowing it (cookie tossing); a cookie of the plain name is not read then. Where `publicUrl` is plain http (this machine only) the browser keeps no Secure cookie: the name is plain `pine_session`, without Secure. The session is stored as the hex SHA-256 of the cookie in `WebSession` (migration 015; `WebSessionRepository`, its twin `MemoryWebSessions`; what a stored session is, `WebSession`, `WebSessionStore` and `SESSION_MS`, is in `src/web/session-model.ts`, which imports no Fastify, so that the repository does not depend on the web server). It says who the member is (`userId`, the name for the header), never what they may do. `sessions.of(request, reply)` reads the cookie once per request; a session last used an hour ago or more is renewed (row and cookie: 30 days from now). A login (`sessions.start(request, reply, user)`) first deletes the row of the session the request's cookie stands for, if any: a browser has one session, and the old cookie leaves no row behind. Logging out deletes the row and the cookie; the hourly upkeep (`PartyScheduler`, `webSessions`) deletes expired rows.
-- What a member may do is asked per request, from fresh data (spec 2.5): `/api/me` asks `members.find(guild, user)` (kept a minute by the directory; a member who does not count on the map by `settings.web.memberRole` is none) and answers `{ loggedIn, name, member, csrf, readOnly }`; when Discord cannot say, `member: false, readOnly: true`, and the page says it is read-only. One login serves every server; membership is asked per server.
+- What a member may do is asked per request, from fresh data (spec 2.5): `/api/me` asks `members.find(guild, user)` (kept a minute by the directory; a member who does not count on the map by `settings.web.memberRole` is none) and answers `{ loggedIn, name, member, csrf, readOnly }`, and `missingRole` (the name `settings.web.memberRole` gives, plan 8M-6) for a member of the server who does not count on the map for lack of that role (`countsOnTheMap`, judged on the directory's answer by the route itself), never for somebody not in the server: a member sees the server's roles on Discord, so naming it tells nothing a stranger could learn here; when Discord cannot say, `member: false, readOnly: true`, and the page says it is read-only. The header names the missing role on the map only (`headerLines(me, login, page)`, `src/web/client/notice.ts`): the region editor is for staff, whom the map's role does not concern. One login serves every server; membership is asked per server.
 - Every POST runs `postGuard(sessions, publicUrl)` (`src/web/csrf.ts`) as its `preHandler`, or in `onRequest` where the route has a body (the region editor's, a party's press), so that a refused request is never parsed: `Origin` must equal `publicUrl` and `X-Pine-CSRF` must be the session's token (`csrfToken`: an HMAC-SHA256 of the session id under a key made at start, compared in constant time); anything else is 403. The one exception is the POST of a login link's page, which has no session yet: it checks `Origin` alone. GETs (and HEADs) change nothing.
 
 ## Logging in
@@ -36,21 +36,21 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5M; spec `docs/superpow
 - `GET /s/<guild>/api/geo` is public: `geoView` (`src/domain/web/geo-view.ts`, pure; its types in `geo-data.ts`, which has no imports so the page can take them) gives the server's regions with an outline (named by their channels as the bot sees them, by their number where it sees none) and the gyms that lie in them (regions, address line, description, notice; places to six decimals; no elite raid gym mark, which Matt took out of everything members see, 2026-10-17: `isEliteGym` and the data stay). Gyms in no region of any server are left out. `GeoCache` (`src/web/geo-cache.ts`) keeps each server's JSON with a strong ETag (the SHA-256 of the JSON, cut) and builds it anew when `GymDirectory.generation` or `RegionDirectory.generation` changed (every load, gym re-read or forget) or a region's channel was renamed; an `If-None-Match` that names it is answered 304 (`etagMatches`: a list of tags compared weakly, `W/` ignored, or `*`), `Cache-Control: no-cache`.
 - The page `/s/<guild>/map` is a static template (`mapPage`, `src/web/page.ts`) that loads the bundle's script and style; what the page needs is in escaped `data-` attributes of `<body>` (`data-guild`, `data-tiles`, `data-google-key` only with Google's tiles, `data-login` `discord | links`). Without a built bundle it answers 503 saying `npm run web:build`.
 - The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with Geoman, `editor-<hash>.css` with Geoman's CSS, and its worker `editor-worker-<hash>.js`); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
-- The page: Leaflet; OpenStreetMap's tiles with their attribution; with Google's tiles a layer switch (roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, all in one colour; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; a second refusal, any other or a broken connection says "Log out failed; try again.") and why they see only the public map. `?login=failed|expired` is said once and taken out of the address.
+- The page: Leaflet; OpenStreetMap's tiles with their attribution; with Google's tiles a layer switch (roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names from zoom 12; gyms as dots, all in one colour; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server."). `?login=failed|expired` is said once and taken out of the address.
 
 ## The parties on the map (plan 8M-3)
 
 - **Who sees what** (spec 2.5; `PartyViewers`, `src/web/party-viewers.ts`, decided per request, never from the session): a member of the server (`members.find`, kept a minute by the directory) sees every active party of it except those in a forum `PartyGateway.memberAccess` says they are `barred` from (an overwrite somebody set to keep them out); a forum hidden from @everyone and allowed to a role is not `barred` for a member without that role, so its parties show and Join opens the forum to them, as signing up on a copy does (spec 2.5: the map crosses region roles). A server whose members must earn a role first (a verification role, `Verified`) names it in `settings.web.memberRole` (Matt, 2026-10-17: "unverified members can browse the map in read-only, same as someone that hasn't logged in"): a member without a role of that name (compared as Pine's other role settings: trimmed, whatever its letter case), unless an administrator, is treated as a visitor who is not logged in: `/api/me` says `member: false`, `/api/parties` 403 (the page shows regions and gyms only), a press 403 (`countsOnTheMap`, `src/web/map-members.ts`). It is decided where membership is: the directory's answer, kept a minute (`mapMembers` over `members.find`, given to `/api/me` and the parties by `guildRoutes`; `ServerMember.standing`: the roles by name and Administrator, `memberStanding`), and for a press also the member fetched fresh (`ActingAnswer.standing`). Unset (the default) every member counts; the region editor does not ask it (staff only). what Discord said of a member and a forum is used for a minute (`BARRED_FRESH_MS`, a `BoundedMap` of 10,000), so a page that asks every 20 s does not have every forum looked at each time. While Discord cannot be asked: a member it confirmed within 30 minutes (`MEMBER_SEEN_MS`) gets the list read-only, by what it said last of each forum (a forum it said nothing of lately is hidden); once Discord failed in a request (the member or any forum), nothing more is asked of it in that request, the forums left go by what it said lately (or are hidden), and one warning is logged; anybody else 503 "Discord cannot be reached just now, so I cannot tell whether you are a member." Not logged in 401, not a member 403.
-- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post). A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (with one group Interested, Join, Here; with several a Join for each group, Interested, Here; Done for a raid that has hatched; Leave for a member signed up; none while read-only); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
+- **The view** `GET /s/<guild>/api/parties` (`partyView`, `src/domain/web/party-view.ts`, pure; its types and `MAP_ACTIONS` in `party-data.ts`, without imports, for the page): the server's active parties from `PartyStore` (an ended party's row is deleted once its history is written, plan 8H: nothing is read by id from the database), less those of other servers, without a post yet, in a barred forum, or over by the clock (a raid at its end, a meetup or train past its end time) though the store has not ended them yet. A raid: gym id, the post's picture and the boss it names (`raidLook`, `src/render/raid-post.ts`, over `PartyService.view`: the egg until it hatches) with the picture only from `pictureOrigins`, the tier in the posts' words (`raidWords`), `stage`, hatch and end time, the post's address (`https://discord.com/channels/<guild>/<post>`, as the DMs link a post), and `place`, where the post's Where says it is (`raidLook`'s: the gym's name as the post shows it, its point to six decimals, its address line or null; null for a gym that is gone; plan 8M-6), which the side panel shows of a raid at a gym the map does not show. A train: name, start, the route's gym ids, the index of the current stop (null without a route or once finished). A meetup: name, start, end. Each with its attendance: the heads Interested / Coming / Here per group as the post counts them (+1s counted, a member asked whether they completed as Here), the member's own status and group, and the buttons that apply (with one group Interested, Join, Here; with several a Join for each group, Interested, Here; Done for a raid that has hatched; Leave for a member signed up; none while read-only); for a raid also `mayChange`, whether the member may change it on the map (plan 8M-4: `mayChangeRaid`, signed up or staff, `PartyViewInput.staff` from the directory's `standing` by `isMapStaff`; never while read-only). Nobody is named: no reporter, maker, attendee, name or id, whatever anybody's privacy; group labels are left out (members write them). The zone (`settings.timezone`) is sent with the view. An ETag of the member's view (`etagOf`, shared with `GeoCache`), `private, no-cache`, 304 on `If-None-Match`.
 - **A press** `POST /s/<guild>/api/parties/<party id>/<action>`, action `interested`, `join` (body `{ group }` for "Join B"), `here`, `leave`, `done`; any other action 404, a body other than an optional group letter with `join` 400 (`pressBodySchema`, strict). Before the body is read (`onRequest`): 60 a minute per address (`PRESSES_PER_ADDRESS_MINUTE`), `postGuard`, the action. Then, in this order: the session (403) and the body (400); who presses (`actingOnTheMap`, `src/web/acting.ts`, the checks of every write of a member on the map, shared with the raids of 8M-4): whether they are a member (`members.find`, kept a minute by the directory, also "not a member", and with `settings.web.memberRole` one without that role: 403 without asking Discord anything more, so that a non-member's presses cost no fetch); the member fetched fresh (`ActingMembers`, `DiscordWebMembers`, `src/discord/web-members.ts`: `fetchGuildMember(…, true)` and `guildMemberInfo`, the name and team a button carries; not in the server 403, whatever the party id, so that nobody but a member learns which ids exist, and so is a member without the map's member role (`countsOnTheMap` of the fresh `standing`); a member Discord has timed out (`isCommunicationDisabled()`) 403 "You are timed out in this server, so you cannot do that now.", one who has not finished the server's membership screening (`pending`) 403 "Finish this server's membership screening first.", neither for an administrator; none of these counts against the throttle; Discord unreachable 503 "Discord cannot be reached just now, so nothing can be changed. Try again in a moment."); the party as `PartyStore` has it (not there, of another server or not active: 409 with the button's words, `partyOver`: "This raid is over." for Done, which only a raid has, otherwise "This has ended.", as `answerClick` says it); `memberAccess` of the party's forum (`barred` 403: `AccessService` would not let them in; unreachable 503); only then `ACTION_THROTTLE` shared with the post's controls (429 "That was a lot of clicks. Try again in …", the router's words, with `Retry-After`), so that a press refused for who presses or for its party is not counted, as a use a guard refused is not; then `pressStatus` (`src/commands/parties/reply.ts`), the one code path of the post's buttons and the map's, through `AttendanceService`, so the line in the post, the completion question and access follow by themselves: `AccessService` lets a member into a forum they could not see and takes it back when they leave, as for a sign-up on a copy. The answer (`PressAnswer`): `ok`, `text` (`outcomeWords`, the words `answerOutcome` uses, made plain text by `unplain`, `src/render/text.ts`, the exact reverse of `plain`: a group's label reads as the member wrote it, `1. north_hills`, backticks and all), nothing more: the page asks for the list again after a press, which shows the party as it is now; 200, 422 for a refusal ("This raid has not hatched yet."), 409 when over. Logged at info as a command is: `{ user, guild, party, action, outcome }`, "a party was pressed on the map", never a text.
 - **Rehearsal mode** (8C) leaves the web server off (`servedSettings`); were it on, a press would still go through `AttendanceService` over the wrapped party gateway, as every click does.
-- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked, meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
+- **The page** (`src/web/client/party-layer.ts` over the pure `parties.ts`): for a member logged in (or `readOnly` from `/api/me`), after the gyms are drawn, `Poller` asks `/api/parties` at once, every 20 s while `document.visibilityState` is `visible`, at once when it is shown again and after a press, one question at a time; 401/403 stop it. The browser revalidates by the ETag (`no-cache`); the page redraws only when the JSON changed, opening again the popup that was open (every popup is bound through `withPopup` under a key that names it across redraws: `gym:<id>`, `train:<id>`, `route:<id>` for a train's line). Raids are one marker per gym (`raidsAtGyms`; the picture of its first raid that has one as a 36 px icon, `gymPicture`, `raid-icon`; a red dot without one), whose popup names the gym once with its address line and Directions (`addressLine`, `directionsLink`, the nodes of `gymPopup`), then lists every raid there, a standard and an elite raid alike, each with its own time, counts, buttons and post (`gymRaidsPopup`); a train's popup gives the address line and Directions of the stop it is at (`trainPopup`); trains a line over the gyms of their route with the current stop marked, meetups and raids at gyms the map does not show in the side panel `#parties` (in the template, hidden until it has something; such a raid is named by its `place`, with the address line and Directions a gym's popup has, `raidPopup`, plan 8M-6). That the parties are read-only is said on a line of its own, `#read-only` (in the template, `readOnlyLine`), hidden again once the list is not read-only; `#notice` is for the moment's news, a press's answer among them, which the read-only line never takes the place of. Popups and items are trees of nodes (`raidPopup`, `gymRaidsPopup`, `trainPopup`, `meetupItem`; `renderNode`, text only): the gym, the tier and boss, the time in the posts' zone (`clockTime`, the day when not today) with a countdown (`countdown`, kept current every 15 s through `data-until`), the counts, "You: Coming, group B", the buttons (`data-party`, `data-action`, `data-group`, one click handler per popup), "Open the post" (only a `https://discord.com/channels/` address, `noopener noreferrer`). `pressParty` POSTs with the CSRF token, asks `/api/me` once for a new token after a 403 when it changed (a restart), and the answer's text is said under the header ("That did not get through; try again." when the connection broke). Leaflet, the icons and the polling are tried at staging.
 
 ## Raids on the map (plan 8M-4)
 
 - **One code path per command** (spec 3.5): what `/raid` does beyond its gym question is `reportRaidAs` and `reportWords` (`src/commands/raids/report.ts`: the report as the member, anonymous by their `raidPrivacy`, signed up by their `autoStatus` under their name and team; the command's words for each `ReportOutcome`, a post and a region channel named by the caller's `ReportNames`: mentions on Discord, on the map no post and a channel as `#name`); what `/hatch`, `/end`, `/boss` and `/moveset` do is `changeRaidTime`, `changeRaidBoss` and `changeRaidMoves` (`src/commands/raids/raid-changes.ts`: the command's reader, `RaidChangeService` as the member, the answer `raidChangeAnswer`, `ok` / `refused` / `gone`; a reader's refusal is thrown as a `UserError`). The commands reply with these or throw them; the map answers them. The readers (`reportedBoss`, `reportedTime`, `typedPartyTime`) take only what they read (`RaidReading`), so the web server is given exactly what the commands read and call (`RaidWebDeps.ctx`, `RaidWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
 - **The pick lists** `GET /s/<guild>/api/raid-options` (members, as `/api/parties`; 30 a minute per address): `raidOptions` (`src/web/raid-options.ts`, pure; types in `src/domain/web/raid-options-data.ts`, which imports no server code): the current bosses in the boss list's order, each with the value its choice of `/raid` has (`bossChoiceValue`: `b:yveltal:T5:0`; `/raid`'s own list uses it too, and `reportedBoss` reads it back), then an egg of every tier (`eggChoiceValue`, `e:T5:0`), tiers in the posts' words (`raidWords`), the posts' zone; nothing of gyms (no elite raid gym mark). An ETag of its JSON, `private, no-cache`, 304. A raid's moves `GET /s/<guild>/api/raids/<id>/moves` (members; the same limiter as the pick lists; an active raid of the server, 409 otherwise; its forum by `memberAccess` as a change asks it, `barred` 403, Discord unreachable 503; 422 without a boss whose moves are known): `bossMoves`, the moves of the boss the post shows, by id and name, as `/moveset` lists them.
-- **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum: `barred` from any of them 403, Discord unreachable 503; only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is: `{ user, guild, gym, outcome }`, "a raid was reported on the map", never the text.
+- **A report** `POST /s/<guild>/api/raids`, body `{ gym, region?, boss, time? }` (strict: the gym's id, the region's id when the gym lies in several, `boss` as `/raid` takes it, a choice's value or typed, up to 100 characters, `time` as `/raid` takes it, minutes from now or a clock time, up to 40). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); the gym, which must lie in a region of this server (`gymRegionsInGuild`; any other id 404, so nobody learns of other servers' gyms); a gym in several regions without one of them picked answers 422 `{ ok: false, text: "This gym lies in several regions: pick the one to report the raid in.", regions: [{ id, name }] }` (names as the bot sees the channels, `Region <id>` without one): any region of the server, whatever the member's Discord regions (spec 2.5); the forum the raid would go to (`PartyService.regionFor` with the region's channel, as `/raid` in that channel) and that of every active raid of the server already at the gym, of either kind (`PartyStore.active()`), which the report would join and which may stand in another region's forum (`reportBarred`, `src/commands/raids/report.ts`, the check `/raid` makes too, plan 8M-6): `barred` from any of them 403 `{ error: REPORT_BARRED }`, "You cannot report a raid at this gym: you are kept out of the forum its raid would be in.", Discord unreachable 503; only then `/raid`'s throttle in its window, so a report refused for who reports or where is not counted; then `/raid`'s readers (a refusal 422 in their words: an unknown boss, a time the raid cannot have, as `pageWords` text in the posts' zone) and `reportRaidAs`, which tells who wants the raid (`NotifyService.raidReported`) and names the member in the post only as their privacy allows. The answer (`RaidAnswer`): 200 `{ ok: true, text: "Reported: T5 egg at The Stacks.", raid }` with the raid as the map shows it to the member (`mapParty`), and "It was posted in #east." after the words when the raid went to another region of the gym than the one picked (which has no forum); a region is named in the words as in the list of regions (`regionName`: `#` and its channel's name, `Region <id>` where the bot sees no channel), never by a channel's id; a raid already there 409 `{ ok: false, text: "There is already a raid at … You have been marked as interested.", raid }` (that raid, unless the member is barred from its forum), so the page can open it; `gym-gone`, `no-region`, `no-forum` and `no-post` 422 with `/raid`'s words. Logged at info as a command is: `{ user, guild, gym, outcome }`, "a raid was reported on the map", never the text.
 - **A change** `POST /s/<guild>/api/raids/<id>/<change>`, change `hatch` or `end` (body `{ time }`, up to 40), `boss` (`{ boss }`, up to 100), `moves` (`{ quick?, charge? }`, move ids or names, up to 100 each); any other change 404 before the body is read, a body other than the command's options 400. The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active raid of this server as the store has it (anything else, a meetup's id among them, 409 "This raid is over.", as the post's buttons answer: never read from the database); its forum (`barred` 403); whether the member may change it (`mayChangeRaid`: signed up for it, as `mayArrange` has it, or staff by the commands' `isManagement`, an admin or a moderator by role or the bot's owner, `isMapStaff` of the member fetched fresh; 403 "Only members signed up for this raid, and moderators, can change it here." otherwise); only then the command's throttle (`CHANGE_THROTTLE` under `hatch`, `end`, `boss` or `moveset`, one window per command as the router counts them); then the command's code path and its words: 200 `{ ok: true, text: "Done. It hatches at 2:30 PM and ends at 3:15 PM.", raid }`, 422 for a refusal (the reader's or the service's, `gym-taken` without naming the other post), 409 when the raid ended meanwhile. The commands themselves let anybody in the post change a raid; the map, which crosses forums (spec 2.5), asks a sign-up or staff (spec 3.6). Logged at info: `{ user, guild, party, change, outcome }`, "a raid was changed on the map", never the text.
 - **The page** (`src/web/client/raid-forms.ts`, pure: the forms as trees of nodes, their bodies, reading an answer, `sendRaidForm` over `pressParty`, so a stale token is renewed once as for a press; the DOM side `raid-ui.ts`): a member's gym popups (not while read-only) get "Report raid" (`reportBox`: through `gymExtras` of `main.ts` once `/api/me` says who asks, and after the raids in the popup of a gym that shows raids, `gymRaidsPopup`'s `extras`, since an elite raid can be beside a standard one), which opens the report form in its place (`reportForm`: the boss or egg, nothing picked at first, the bosses grouped by tier in the list's order, then the eggs; "Hatches in" or "Ends in" by what is picked, `timeLabel`, minutes or a clock time; the region where the gym lies in several of the server's regions, from `/api/geo`); a raid with `mayChange` gets "Change…" (`data-change-raid`), which opens the change form in place of that raid's section (`changeForm`: hatch time, end time, boss, and the moves when its boss's are known, each with its own Set). What is missing is said in the page (`reportBody`, `changeBody`); everything else is the server's to read; of an answer the page reads only `ok` and the raid (`raidAnswerOf`: the regions of a 422 it has from `/api/geo` already). After a success the list is asked for at once and the raid's gym popup opened (`done`): a report's form closes on `ok` whether or not the answer names a raid, and on a raid already there (`reportClosesForm`); a refusal is said under the form and in the notice. "Report raid" follows the list at each draw (`reportOffered`: off while it is read-only, back once Discord answers again; by `/api/me` only before the first list). One form at a time (`FormHold`): the click that opens one takes the hold before its lists are asked for (`take`, a claim; none while another form holds, so a second click opens nothing), and the controls that open the others ("Report raid", "Change…": `formControls`, also in a popup opened meanwhile) are off until it lets go; once the lists came the form is drawn only when its claim still holds and its place is still in the page (`ready`); a form lets go only with its own claim (`release`), so the late answer of a form gone with its popup closes nothing of the form open now (it asks for the list again and opens no raid). While a form holds, the list is not drawn anew under it (it is drawn once the form closes, or its popup does), and the popup is fitted to the form (`fit`, `popup.update()`). Leaflet tells the map of a popup's opening and closing before its layer, and closes the open popup inside opening another: the map's close forgets the popup and its key at once (`OpenPopup`), and `popupClosed` lets a popup's form go at once but draws what waited after Leaflet's handling (`later`, `setTimeout(…, 0)`), never inside it, where the redraw would open the closing popup again beside the new one; a form in the side panel stays when a popup closes. Leaflet's `update()` asks a function content again, which would draw the popup anew and wipe the form: every popup's content (the gym dots' in `main.ts`, the parties' in `withPopup`) is `heldContent`, the node already drawn while a form is open, drawn anew otherwise.
 - **Not in it:** spawns from the map (spec 3.8) are plan 8M-4S (below); trains are 8M-5 (below), meetups 8M-5M; `/duration` and moving a raid to another gym (`/where`) stay on Discord.
@@ -60,7 +60,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5M; spec `docs/superpow
 - **One code path with `/wild`** (spec 3.5, 3.8): what `/wild` does beyond `SpawnService.report` is `readSpawn` (`src/commands/notifications/wild.ts`: the Pokémon by `wildPokemon`, `appearsInWild` with the settings' exceptions; then the details, which must say something, `SAY_WHERE`, trimmed and cut to `MAX_DETAILS`; a refusal thrown as a `UserError`) and `reportSpawnAs` (`src/commands/notifications/spawn-report.ts`: the report through `SpawnService`, the command's words, a report's link and a region's channel named by the caller's `SpawnNames`: the link and a mention on Discord, `DISCORD_SPAWN_NAMES`; on the map no link and a channel as `#name`; `no-channel`, `refused` and `closed` thrown in `/wild`'s words as a `SpawnNotMade`, a `UserError` with that `kind`). The command's guard and handler and the map call them; the web server is given what `/wild` reads and calls (`SpawnWebDeps.ctx`, `SpawnWebContext`: the bot's context in `src/app.ts`), the channel names the bot sees (`channelName`) and the gateway's `ownViewDenied` (`channels`).
 - **The pick list** `GET /s/<guild>/api/wild-options` (members, as `/api/raid-options`: 401, 403, 503; 30 a minute per address): `wildOptions` (`src/web/wild-options.ts`, pure; types in `src/domain/web/spawn-data.ts`, without imports): every catalogue entry `/wild` takes (`appearsInWild` with `wildExceptionsOf(ctx).species`), a form as that form, in the catalogue's order, as `[key, name]` (about 1,180, 33 KB); kept per catalogue and settings (a `WeakMap` by the `WildExceptions` read), an ETag of its JSON, `private, no-cache`, 304.
 - **A report** `POST /s/<guild>/api/spawns`, body `{ pokemon, details, iv?, lat, lon, region? }` (strict: `pokemon` as `/wild` takes it, a key of the list or typed, 1 to 100 characters; `details` up to 200, blanks allowed so that they are refused in `/wild`'s words; `iv` `perfect` or `zero`; the point, latitude and longitude in range, kept to six decimals; the region's id when the point lies in several). Before the body is read (`onRequest`): 30 a minute per address and `postGuard`. Then the session (403) and the body (400); who reports (`actingOnTheMap`: the presses' checks in their order); where: the regions of this server whose outlines hold the point (`regionsAtPoint`, `src/services/region-directory.ts`: one per channel, in the regions' order), none 422 in `/wild`'s words for a pin outside them (`PIN_NOT_HERE`), several without one of them picked 422 `{ ok: false, text: "This point lies in several regions: pick the one to report the spawn in.", regions: [{ id, name }] }` (any region of the server, spec 2.5; names as the raids' list names them); the region by an id the body names counts only where the point lies in several (a point in one region is reported there whatever it names); the forum of the region picked (`memberAccess`: `barred` 403, as for a raid there; a region without a forum is not asked) and its text channel, where the report goes (`PartyGateway.ownViewDenied`: an overwrite of the member's own that denies View Channel 403, with a forum or without one; not asked of an administrator, whom Discord shows every channel, the server's owner included (`MemberStanding.administrator`); Discord unreachable 503 for either); the limit: a role's overwrite that denies View Channel on the text channel is not looked at, as the raids' checks look at none on the region's channel; `/wild`'s readers (`readSpawn`: 422 in its words as `pageWords` text, "Mewtwo does not appear in the wild.", "Say in details where …") and the pin (`PlaceFinder.pin(row, point, null)`: named by the nearest gym, PokéStop or power spot within 50 m, else a dropped pin), as `/wild`'s guard reads them; only then `/wild`'s throttle in its window (`throttledOnTheMap`, `WILD_COMMAND`, `WILD_THROTTLE`: five in half an hour from Discord and the map together, 429 "You can use /wild again in 30 minutes."), so that a report refused for who reports, where or what is not counted; then `reportSpawnAs` as the member (named by the name Discord has now, `ActingMembers`, as `/wild` names the member who uses it: spawns have no privacy setting), the point as the report's `near` (a `DroppedPin`: the region's message, the Unown copy and the DMs show it as `/wild near:` with a pin shows it), and who wants the Pokémon is told (`NotifyService.spawnReported`, through `DmSender`). The answer (`SpawnAnswer`): 200 `{ ok: true, text: "Reported: a wild Dratini near The Stacks.\nThe report is removed in 30 minutes." }` (`/wild`'s words without the report's link; a pin named by nothing is "at your pin"), 422 `{ ok: false, text }` for a report that was not made (the channel gone, the bot not allowed to post there: "I am not allowed to post in #west, …", a channel the bot sees no name of as `Region 1`), 503 with `Retry-After: 60` and `{ error: "I am restarting just now, so the report was not made. Report it again in a minute." }` for one that came while the bot shuts down (`kind` `closed`: no refusal, the page may try again). Nobody is named in an answer. Logged at info as a command is: `{ user, guild, region, outcome }` (`posted`, `not-made` or `closed`), "a spawn was reported on the map", never a text or the point.
-- **The page** (`src/web/client/spawn-forms.ts`, pure: "Report spawn here" (`spawnBox`), the regions a point lies in by the outlines of `/api/geo` (`regionsAt`, `ringContains`), the form as a tree of nodes, its body, reading an answer, `sendSpawnForm` over `pressParty`; the DOM side `spawn-ui.ts`): for a member while the map is not read-only (`reportOffered`, as "Report raid"), a long press or a right click on the map (Leaflet's `contextmenu`, which it also fires for a long press on a phone) opens the form in a popup of its own at that point (`spawnAt`; with another form open it says "Close the form that is open first." and opens nothing; at a point in no region of the map's outlines it says "That point is not in a region of this server." at once and opens nothing, `pressedWhere`: the server still decides by its own outlines, at their edges too), and "Report spawn here" in a gym's popup (its own, and that of a gym that shows raids, after "Report raid") opens it in place of its button, the gym's place being the point (the map shows no Wayspots, so no Wayspot popup has it). The form (`spawnForm`): the Pokémon, typed and picked by name from a `datalist` of the pick list (the browser filters it), sent as its key when the name is one of the list's (whatever its letter case), else as typed for the server to read; "Where it is" (required: "Say where it is first: …", the page's own); the IVs, "Not checked" by default; the region where the point lies in several of the map's outlines; whenever the server's answer names regions, the form is drawn again with those, keeping what was filled in (`redrawnAfter`: a region picked stays picked only while it is among them). It is held like the raid forms (`FormHold`: the hold taken before the list is asked for, the controls that open a form, `data-spawn` among them, off meanwhile, a popup's content held, `ready` before it is drawn); a success is said in the notice and closes the form; a refusal is said under the form and in the notice. Spawns are not drawn on the map.
+- **The page** (`src/web/client/spawn-forms.ts`, pure: "Report spawn here" (`spawnBox`), the regions a point lies in by the outlines of `/api/geo` (`regionsAt`, `ringContains`), the form as a tree of nodes, its body, reading an answer, `sendSpawnForm` over `pressParty`; the DOM side `spawn-ui.ts`): for a member while the map is not read-only (`reportOffered`, as "Report raid"), a long press or a right click on the map (Leaflet's `contextmenu`, which it also fires for a long press on a phone; also on a raid's picture, whose mouse events Leaflet keeps from the map as a marker's: `contextMenuToMap`, `party-layer.ts`, hands it to the map's own handler, plan 8M-6; a raid's dot, a circle, passes it on by itself) opens the form in a popup of its own at that point (`spawnAt`; with another form open it says "Close the form that is open first." and opens nothing; at a point in no region of the map's outlines it says "That point is not in a region of this server." at once and opens nothing, `pressedWhere`: the server still decides by its own outlines, at their edges too), and "Report spawn here" in a gym's popup (its own, and that of a gym that shows raids, after "Report raid") opens it in place of its button, the gym's place being the point (the map shows no Wayspots, so no Wayspot popup has it). The form (`spawnForm`): the Pokémon, typed and picked by name from a `datalist` of the pick list (the browser filters it), sent as its key when the name is one of the list's (whatever its letter case), else as typed for the server to read; "Where it is" (required: "Say where it is first: …", the page's own); the IVs, "Not checked" by default; the region where the point lies in several of the map's outlines; whenever the server's answer names regions, the form is drawn again with those, keeping what was filled in (`redrawnAfter`: a region picked stays picked only while it is among them). It is held like the raid forms (`FormHold`: the hold taken before the list is asked for, the controls that open a form, `data-spawn` among them, off meanwhile, a popup's content held, `ready` before it is drawn); a success is said in the notice and closes the form; a refusal is said under the form and in the notice. Spawns are not drawn on the map.
 
 ## Trains on the map (plan 8M-5)
 
@@ -81,7 +81,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5M; spec `docs/superpow
 - **The PokéStops of a box** `GET /s/<guild>/api/stops?south&west&north&east` (members, as the pick lists: 401, 403, 503; 60 a minute per address; a box that is none, beyond the world or inverted 400; the page keeps the map's view to the world first, `stopsBox`: latitude to [-90, 90], longitude to [-180, 180]): `StopsView`, the kept stops with a title in a region of this server inside the box, as `[id, lat, lon, title]`, the nearest to the box's middle first, at most `MAX_MAP_STOPS` (300), `more` when the box holds more (the page says to zoom in). Power spots and other Wayspots are never offered; gyms are on the map already. `private, no-store`. The editor's data (staff only) is the only other Wayspot route, so the map has its own.
 - **Changing one** `POST /s/<guild>/api/meetups/<id>/<change>`, change `name` (`{ drawn, name }`), `info` (`{ drawn, info }`; empty removes it, as `/info` sent back empty), `start` (`{ drawn, time }`, as `/meet` takes it; `cancel` removes it, as `/meet time:cancel` does, in `/meet`'s window: `/cancel-meet` has a window of its own, which the map does not use), `end` (`{ drawn, time }`, as `/end`; `none` removes it); any other change 404 before the body is read, a body other than these 400. **Each change carries the value it was drawn from** (`drawn`: the meetup's name, information, start or end as the view gave it). The order: the per-address limit and `postGuard`; the session and the body; who changes it (`actingOnTheMap`); an active meetup of this server as the store has it (anything else, a raid's id among them, 409 "This meetup is over.", never read from the database); its forum (`barred` 403, unreachable 503); whether the member may change it here (`mayEditMeetup`: its maker or staff; 403 `NOT_YOURS`, "Only its maker and moderators can change this meetup here.", with the meetup: the commands let anybody in the post change its name, information and end, the map, which crosses forums, asks more, as for raids); a change drawn from what the meetup no longer is (409 "This meetup changed meanwhile: here it is as it is now." with the meetup as it is now, uncounted; `TimedPartyService` refuses it again inside the store, `asDrawn`, reason `changed-meanwhile`, for a change on its way meanwhile; the commands give no `drawn`); for a start what `/meet`'s guard refuses before its limit (not signed up: 403 "You are not signed up for this meetup.", with the meetup; a time it cannot read: 422); only then the command's window (`/name`, `/info`, `/end`: `CHANGE_THROTTLE` under their names; a start in `/meet`'s window in a timed party, `START_THROTTLE` under `variedThrottleKey('meet', …)`, the key the router counts a varying limit under; `throttledOnTheMap` with `varies`); then the command's code path with the value drawn (`/end`'s reader after its limit, as in the command: 422). 200 `ok`, 409 for `gone` and `changed-meanwhile`, 422 for any other refusal; every answer but `gone` carries the meetup as the member sees it now. The post's lines and the start's announcement (with its pings, gathered) follow as for the commands. Logged `{ user, guild, party, change, outcome }`, "a meetup was changed on the map", never a text.
 - **Words:** `pageWords` writes a relative timestamp (`<t:…:R>`) as how long until then or since (`relativeTime`, `src/domain/web/clock.ts`: "in 5 h", "1 h 30 min ago", "now"), so that "starts at 7:00 PM (in 5 h)" does not read the clock time twice.
-- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on a pane of its own, `meetups`, above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
+- **The page** (`src/web/client/meetup-forms.ts`, pure: "New meetup" and "Meetup here", the places picked, `PlacePicking`, the form and its body, the editor and the body of each change, reading an answer, `sendMeetupForm` over `pressParty`; the DOM side `meetup-ui.ts`; the map's side in `party-layer.ts`): a meetup with a place is a purple ring at it (at the gym's dot as the map has it now, else the snapshot's point; without a fill, so that it takes clicks on its line alone and a gym's dot inside it stays a dot to click; on a pane of its own, `meetups`, above Leaflet's markers, so that a raid's picture or route mode's numbers do not hide it), its popup (`meetupPopup`, key `meetup:<id>`) and its item in the side panel (`meetupItem`, every meetup) saying where it is (`words`, Directions to its point), its times, its information as text, the counts and buttons, "Edit…" for who may (`meetupActions`), the post. For a member while the map is not read-only, "New meetup" stands beside "New train" in the side panel's box (`newTrainButton`) and "Meetup here" in every gym's popup (`meetupHereBox`, after "Report spawn here"); either opens the form of a new meetup in the box (`newMeetupForm`: Name, Region (any of the server's; the first region the place lies in, following each place picked, until the member chooses one in the list: `regionChosen`, set by `regionChosenBy`, which choosing none again clears), Place (what was picked, or "No place yet.", with "Pick on the map" / "Pick again"; a pin says it needs a moderator's approval), Starts, Information, "Make the meetup", Cancel; what is missing is said in the page, `newMeetupBody`). **"Pick a place" mode** ("Pick on the map", `PlacePicking`): the form says "Click a gym, a PokéStop or a point of the map." with "Stop picking"; the PokéStops of the map's view are drawn as small blue dots (their titles as tooltips of nodes of ours) from `/api/stops`, asked as the mode starts and again once the map has rested 300 ms after it moved (`StopLoads`: the questions numbered and only the last one's answer shown, none once the mode ended; "Zoom in to see every PokéStop here." said only when whether there are more changes); a gym clicked (its dot or the marker of its raids, through `gymClicks`, before route mode's click), a stop clicked or a point of the map clicked (Leaflet's `click`) becomes the place and ends the mode, no popup opened; the trains' and meetups' lines and markers let clicks through meanwhile (`interactive: false`, as in route mode). Power spots are never offered. After a success the form closes, the words are said, the list is asked for at once and the meetup's popup opened (when it has a place); a held meetup is said in the notice. **The editor** ("Edit…", `meetupEditor`) in the box: the name and the information, filled with what the meetup has, each with Set; "Starts now: 6:00 PM" and Starts with Set (for a member not signed up "Sign up for it to change when it starts."); "Ends now: none" and Ends with Set; Done. The editor keeps, per field, whether the member typed in it and the value it was drawn from (`EditorState`, `editorTyped`: a field typed in is one that no longer shows what it was drawn with, line endings aside (information stored with `\r\n` comes back from the textarea with `\n`, plan 8M-6), and keeps its text and that value from then on). Each Set sends its change alone (`meetupChangeBody`) with `drawn`: for a field typed in the value it was drawn from, for one not typed in the value it shows. Each answer draws the editor anew from the meetup it gives (`editorAfter`): a field not typed in shows what the meetup has now (a name or information changed by somebody else shows up), a field typed in keeps its text and its own `drawn`, so its Set after somebody else changed that value answers 409; the field of a change made shows the meetup's value again, that of a refused one keeps its text, drawn from the meetup the answer gives (the member has been shown it). Its words are said under it, and the list asked for again; an answer that the meetup is gone (409 without a meetup) or that it is no longer the member's to change (its `panel` null: no longer staff, say) closes the editor and says the words (`editorEnds`; `editorStep` decides between closing, drawing anew and, for an editor closed meanwhile, only saying the words). Both forms are forms of the box (`take(false, true)`, `aside`), one form at a time with the raid, spawn and train forms (`formControls` also turns "New meetup", "Meetup here" and "Edit…" off).
 - **Not in it:** a meetup's place cannot change after it is made (no route for it); a member cannot withdraw a pending request; Report on a meetup (8S-2); meetups on Campfire; the PokéStops are drawn only in "pick a place" mode, not from a zoom level up (a question per pan for every member, for little: left for staging to say whether it is wanted); an end given when the meetup is made (`/meetup` takes none, and a request kept for the moderators has no end: it is set with the editor once the meetup is posted).
 
 ## The region editor (plans 8M-2, 8M-2F)
@@ -90,8 +90,8 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-5M; spec `docs/superpow
 - **The page** `/s/<guild>/regions/edit` (`editorPage`): the template with `data-worker` (the worker's script). Logged out: 401, a page with "Log in with Discord" (when offered, to `/auth/login?next=…`) and "/region edit", saying why the last login did not happen (`?login=failed|expired`); it never sends anybody to Discord by itself, so a failed login cannot loop. Not staff or no member: 403 "Only staff of this server may edit its regions." Discord unreachable: the page, read-only by its data, only for a member Discord said is staff of the server within the last 30 minutes (`StaffSeen`, `src/web/editor-routes.ts`: a `BoundedMap` of `<guild>:<user>` set by every fresh `staff` answer, dropped by any other answer but `unreachable`); anybody else gets 503 "Discord cannot be reached just now, so I cannot tell whether you are staff." (a page; the data as `{ error }`), so that an outage never shows a server's editor data to somebody who is not staff. 20 a minute per address (each load asks Discord).
 - **The data** `GET /s/<guild>/api/regions/edit` (`EditorCache` over `editorView`, `src/domain/web/editor-view.ts`; types in `editor-data.ts`, without imports): the server's regions (id, channel id and name, category, description, outline, `version`), other servers' regions whose boxes meet the box of the server's outlines grown by 2 km (outlines only), the gyms in its regions and those in no region of any server inside that box (`[id, lat, lon, name]`), the kept Wayspots inside it (`[kind, lat, lon, title]`, no addresses or pictures), the text channels that are no region of any server; places at six decimals. The static part is kept per server until the generations of gyms, regions and Wayspots or the server's channels change; who asks (`userId`, `readOnly`, `mayManageChannels`, and the channels, none while read-only) is put in front per request; the ETag covers both; `private, no-cache`; 20 a minute per address (each asks Discord). 401, 403, 503 as the page (read-only while Discord is unreachable only for staff seen lately, as the page).
 - **Versions:** `regionVersion` (`src/domain/regions/version.ts`): base64url of SHA-256 (written out in pure code, so the page has it too) over the outline at six decimals and the region's description, cut to 16. A changed or removed region is sent with the version its first staged edit saw. Wherever an outline enters a draft (drawn, split, of a file: `record`) and wherever the server takes one (`planSave`), it is `normalisedOutline` (six decimals, a corner the rounding repeats dropped), so page and server see the same corners.
-- **Preview and save** `POST /s/<guild>/api/regions/preview` and `…/save` (`src/web/editor-save.ts`): before the body is read (`onRequest`, so a refused request never has its 2 MB parsed): 30 a minute per address, `postGuard` (Origin, session, CSRF token), `REGION_CHECK_THROTTLE` (6 a minute per member by the session's user, `Throttles` key `region edit`); then 2 MB, staff as Discord has them now (503 with its own words while unreachable), `saveRequestSchema` (zod; at most 200 of each kind, the corners of a KML file, names and categories up to 1,000 characters: anything beyond is malformed, 400; a new channel's name over 100 characters or its category over 200 is refused by `planSave` with a line naming the region, 422, and the page's fields have those `maxlength`s, a KML description being cut to 200 by `kmlEdit`). Both check everything again: `planSave` (`src/domain/regions/save-plan.ts`: a changed region named by its channel's current name, so `planImport` finds it; a new region on a text channel by id, or a new channel by a name no channel of the server has by `channelKey`, categories aside ("#south exists: pick it from the list …", or "… exists already: pick another name …"), in the category of its description read as `plainDescription` (empty: a category named after the channel); conflicts by version; outlines `normalisedOutline` and tidied), deleting a forum needs Manage Channels, something to do, and no new overlap or gap (`newProblems`) in what the import will write (`outlinesWritten`: the areas the preview of `RegionAdminService` leaves out are not written, so a removal whose replacement is left out is checked as a removal alone), worked out off the bot's thread: `SaveChecks` over `SaveCheckWorker` (`src/web/save-check.ts`; a `node:worker_threads` thread per check, `save-check-thread.ts`, compiled beside it into `dist/web/`, run through tsx in tests; one at a time, at most three waiting beyond it, any more 503 "Busy checking other saves: try again in a minute."; ended after 10 s or past 256 MB: 422 "Too complex to check: simplify the outlines."; polyclip throwing in the thread (its answer `{ ok: false }`) is logged and does not block; a thread that does not start, fails otherwise or ends without an answer is 503 "I cannot check the outlines just now: try again in a minute."), its verdict kept five minutes by a hash of the request and the versions of the server's regions, so the save of what was just previewed is not checked again. Answers (`SaveAnswer`): 200 `preview` (`/region import`'s words through `previewWords(…, 'editor')`, "Saving would …", and the removals with what goes with each, `goesWith`) or `saved` (`RegionAdminService.save`: one run under the admin lock that first plans the request again against the regions as they are inside the lock and does nothing when one of the save changed meanwhile, 409 `conflicts`; then compares the versions of all the server's regions and which channel is which region (`regionsStamp`) with those the save was planned and checked against, and does nothing when anything differs (another save adding the same channel, two saves that together make a new overlap), 409 `stale` "The regions changed meanwhile: preview again.", on which the page loads the regions and previews again; then the import's steps and each removal, a removal that rejects said as "I could not remove … (the log says what failed)" while the rest goes on; the audit log says `region editor by <id>`; `outcomeWords` and `/region remove`'s `outcomeLines`; areas the plan left out among "Not imported"), 409 `conflicts` (each region as it is now, or null when gone), 422 `refused` (lines). Everything is plain text (`plainWords`: mentions as `#name`, no markdown, and the escapes of `plain` undone: `north_hills`, not `north\_hills`); the page sets it as text. A save is logged by numbers (`regions were saved in the web editor`), never names. The save is stateless: it plans again rather than keeping the preview's plan.
-- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name records no edit (`pickerChange`). What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most; `pieceOrder`) with the gyms, stops, power spots and Wayfarer gyms in them, and when the page was opened with nothing staged for the server (spec 4.3, "the first time … worst first"; decided once, at the start) new first, then by the number of places in them, then by area; each with "Fix…" or why it cannot be fixed (below). Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
+- **Preview and save** `POST /s/<guild>/api/regions/preview` and `…/save` (`src/web/editor-save.ts`): before the body is read (`onRequest`, so a refused request never has its 2 MB parsed): 30 a minute per address, `postGuard` (Origin, session, CSRF token), `REGION_CHECK_THROTTLE` (6 a minute per member by the session's user, `Throttles` key `region edit`); then 2 MB, staff as Discord has them now (503 while unreachable: "Discord cannot be reached just now, so nothing can be saved. Try again in a moment." to staff it confirmed within 30 minutes, `StaffSeen`, and to anybody else the page's "… so I cannot tell whether you are staff.", which promises no save, plan 8M-6), `saveRequestSchema` (zod; at most 200 of each kind, the corners of a KML file, names and categories up to 1,000 characters: anything beyond is malformed, 400; a new channel's name over 100 characters or its category over 200 is refused by `planSave` with a line naming the region, 422, and the page's fields have those `maxlength`s, a KML description being cut to 200 by `kmlEdit`). Both check everything again: `planSave` (`src/domain/regions/save-plan.ts`: a changed region named by its channel's current name, so `planImport` finds it; a new region on a text channel by id, or a new channel by a name no channel of the server has by `channelKey`, categories aside ("#south exists: pick it from the list …", or "… exists already: pick another name …"), in the category of its description read as `plainDescription` (empty: a category named after the channel); conflicts by version; outlines `normalisedOutline` and tidied), deleting a forum needs Manage Channels, something to do, and no new overlap or gap (`newProblems`) in what the import will write (`outlinesWritten`: the areas the preview of `RegionAdminService` leaves out are not written, so a removal whose replacement is left out is checked as a removal alone), worked out off the bot's thread: `SaveChecks` over `SaveCheckWorker` (`src/web/save-check.ts`; a `node:worker_threads` thread per check, `save-check-thread.ts`, compiled beside it into `dist/web/`, run through tsx in tests; one at a time, at most three waiting beyond it, any more 503 "Busy checking other saves: try again in a minute."; ended after 10 s or past 256 MB: 422 "Too complex to check: simplify the outlines."; polyclip throwing in the thread (its answer `{ ok: false }`) is logged and does not block; a thread that does not start, fails otherwise or ends without an answer is 503 "I cannot check the outlines just now: try again in a minute."), its verdict kept five minutes by a hash of the request, the server's regions (`regionsStamp`) and the areas the import leaves out, never its channels (plan 8M-6: a channel coming or going leaves the outlines as they are), so the save of what was just previewed is not checked again. Answers (`SaveAnswer`): 200 `preview` (`/region import`'s words through `previewWords(…, 'editor')`, "Saving would …", a new channel's name said as typed in the panel, not read from a file: "is it a typo?", "a typo in a name makes a channel of that name", plan 8M-6; and the removals with what goes with each, `goesWith`) or `saved` (`RegionAdminService.save`: one run under the admin lock that first plans the request again against the regions as they are inside the lock and does nothing when one of the save changed meanwhile, 409 `conflicts`; then compares what the save was planned and checked against with this server's regions now (`regionsStamp` and `channelsStamp`, plan 8M-6: the versions of its regions, which of its channels is which region, also a row of no server on one of them, and, by id, name, kind and category, only the channels the save depends on: the channels and forums of those regions, the channels it takes by id, and every channel or category whose `channelKey` is a name its areas go to or whose `categoryKey` is a category a new channel of theirs names; another server's regions and the server's other channels, such as a ticket or voice bot's that come and go all day, are no part of it), and does nothing when anything differs (another save adding the same channel, two saves that together make a new overlap, a channel or category of a name the save would make or use made or renamed on Discord meanwhile), 409 `stale` "The regions changed meanwhile: preview again.", on which the page loads the regions and previews again; then the import's steps and each removal, a removal that rejects said as "I could not remove … (the log says what failed)" while the rest goes on; the audit log says `region editor by <id>`; `outcomeWords` and `/region remove`'s `outcomeLines`; areas the plan left out among "Not imported"), 409 `conflicts` (each region as it is now, or null when gone), 422 `refused` (lines). Everything is plain text (`plainWords`: the bot's mentions as `#name`, no markdown, and outside the code spans of names the bot made (a backtick after an even number of backslashes; one after an odd number was typed) the escapes of `plain` undone by `unplain`: `north_hills`, not `north\_hills`, one backslash for a typed one, `1. Uptown`, a typed backtick as typed; the mentions are named before `unplain`, so a typed `<#…>` stays text; plan 8M-6); the page sets it as text. A save is logged by numbers (`regions were saved in the web editor`), never names. The save is stateless: it plans again rather than keeping the preview's plan.
+- **The page's code** (`src/web/client/editor.ts`): Leaflet with `preferCanvas`, Geoman (free) for drawing polygons and rectangles, reshaping and moving, snapping (`snapDistance` 15) to every outline (other servers' outlines are `pmIgnore` with `snapIgnore: false`: snapped to, not editable; places are never snapped to); removal, restore, split (a drawn line, `splitOutline`; the larger part keeps the region; Swap), a new region's channel or new channel with its category, in the side panel. Every change is a staged edit (`src/domain/regions/edits.ts`), applied to the regions as loaded, undone and redone, kept in `localStorage` under `pine-region-edits:<guild>:<user>` (`staged-storage.ts`, never throws; a full storage says "This browser's storage for the page is full: save or discard some changes."), and after a save, full or partial, rebased on the regions as the server has them (`rebaseAfterSave`: what the server has as staged is dropped, the rest keeps the version its first edit saw, so a change by somebody else meanwhile is a conflict). Outline edits of one region within 2 s of each other are one step of undo (a drag); undo goes back 200 steps at most, the oldest edits beyond being one step. A region the server has as it is staged is no conflict (a save whose answer never came). Save sends exactly the body it previewed (`saveBody`) and previews again when the drafts changed since; an answer that fails or cannot be read (`readSaveAnswer`: `unknown`) loads the data again, rebases and says "The outcome is not known: here is what the server has now."; when the data cannot be loaded after an outcome that is shown (saved, conflicts, stale), the outcome is shown all the same with "Reload the page to see the regions as saved." (or "… as they are now.", `reloadFailedLine`) A new channel's name the server has is refused in the panel as the server would (`newChannelProblem`), and a refused name stages no channel (`pickerChange`): the channel the region had staged (a name typed before, or one of the list) is taken off with one edit (plan 8M-6: what Save sends is never a name the panel no longer shows), and nothing is recorded when it had none. What is being filled into a new region's channel picker (its list, the name, the category, the refusal: `PickerState`) is kept on the editor while the panel is drawn anew (`pickerShown`) and dropped by any other edit, undo, redo or reload; an answer of the worker redraws only the toolbar, why Save is off and the list of overlaps and gaps, never the selected region's section. Gym counts, places in no region (orange), outlines that cannot be saved (red), why Save is off: `editor-view.ts`. Overlaps and gaps: worked out in a worker (`editor-worker.ts`, `CoverageChecker`, `coverage-check.ts`) after edits rest 400 ms (a worker that fails to load or to cut keeps Save waiting for nothing: the server checks a save itself); shaded, new ones thicker, listed new first then by area (200 at most; `pieceOrder`) with the gyms, stops, power spots and Wayfarer gyms in them, and when the page was opened with nothing staged for the server (spec 4.3, "the first time … worst first"; decided once, at the start) new first, then by the number of places in them, then by area; each with "Fix…" or why it cannot be fixed (below). Regions changed by somebody else show dashed in blue with "Take theirs" / "Keep mine". KML in with `readKml` (one edit) and out with `writeKml` (`<server name>-regions.kml`).
 - **Overlaps and gaps** (`src/domain/regions/coverage.ts`, polyclip-ts): pairwise intersections of outlines whose boxes meet (cached per pair of outlines by identity), gaps the holes of the union less what lies in them (`newProblems` cuts the gaps over the outlines whose boxes chain to what changed, `chainedTo`, so a region that closes a ring of regions is seen to close its hole); areas on the sphere (Lambert cylindrical equal-area); a piece thinner than 0.5 m on average (twice its area over its perimeter) is the six-decimal rounding and left out. A piece is new unless 90 % of its area lies inside one piece of its kind of the loaded outlines (so a shrunk overlap, or one split between two regions, is not new).
 - **Fix and "Fix all slivers"** (plan 8M-2F; spec 4.3 "How Fix works"; pure, `src/domain/regions/fix.ts`, `fix-all.ts`, flat measures in metres in `lines.ts`): worked out only in the page's worker, never on the server; a fix becomes ordinary staged edits (`outline` edits of the regions it changes in one `batch`: one undo step), which Save checks and saves as any other (8M-2's version and coverage checks stay the authority). `findStretches` reads every piece as a sliver: its outer ring split into chains along the borders of the regions around it (polyclip leaves out a corner that lies in line, so the ring first gets a corner wherever a corner of a region around it lies on one of its sides, within a centimetre: a straight side along two regions stacked one above the other goes to each its part, found through `SegmentGrid.sidesNear`; a part along two borders at once, where they run together, split at the middle of that run; a border's sides are found through a `SegmentGrid`, square cells searched in rings round a place, so that a border traced with thousands of corners is not gone through for each part), two sides meeting at two ends, one region along each, or one along one side and two along the other (a gap where three meet: of the three ways to split it, the one whose sides lie closest together, so that a U-shaped gap is not its cut across one arm against all the rest; at Pittsburgh such gaps are long strips capped or split by the third). A sliver is fixable when its sides run within `FIX_REACH_METRES` (150 m) of each other all along (their corners and places every 20 m); wider is `too-wide`, anything else (more regions, a region inside another or inside the gap, borders that touch along it) `tangled`, both listed as "… draw it by hand." Slivers of the same two regions that meet end to end (also where two regions touch at a point between two of them) are one stretch; a gap where three meet is a stretch of its own. A fix (`fixStretch`, choice `0`/`1` for a side's border or `midline`) makes the shared line one side (the other side's regions take it) or the midline (both sides resampled evenly, ignoring their corners, every 10 m or farther so that a side has at most 1,500 places, matched by dynamic time warping within a band round the diagonal of a tenth of the longer side and at least 50, the midpoints simplified to 1 m); where three meet, the line gets a corner across from where two meet along a side (`proposedCorner`; with the midline it is a marker to drag, the others put it on that border) and the third border runs to it. A corner dragged out of the stretch's slivers (more than a metre) is `corner-outside` ("The corner must stay inside the sliver."): the rule keeps a dragged corner near the strip, but does not keep land beyond the slivers from changing region (the lines to the corner can cut across a neighbour's border, as the proposed corner's can, which is not held to it); what protects that land is that every choice draws the outlines it makes dashed and names every place it moves, in the slivers or beyond them, for every choice (the landings below). Each region's chain is replaced in its ring whichever way the ring runs, folds where a taken border ran along the region's own are removed, the outline is tidied (`tidyOutline`); a chain no longer on its border is `stale` (the choices are worked out on the regions as they are, so the page words it as the worker's failure, "I could not work this fix out: draw it by hand."), and a fix whose outlines would make a new overlap or gap (`newProblems` against the regions before it) is refused. Each choice (`fixOptions`) names every place whose region it changes, in the slivers or beyond them (tested in the box of what changed, against every region), and where it ends up (`landings`; "Gym #3092 “Library” ends up in #east."). Fix all (`fixAllStart`) takes the midline of every stretch whose midline moves no gym, stop, power spot or Wayfarer gym into another region, in rounds that find the stretches anew (a fix can move another's border), each round checked as a whole and fix by fix when it made something new; the stretches left are asked about (a place in their slivers, or one their midline moves) or counted as refused, each once; `nextQuestion` asks about each, its choices worked out on the regions as answered so far, a stretch an answer before moved found again by its regions and where its slivers lie (those found are marked and never looked for again, and the stretches waiting that they cover are dropped: each is asked about once, a stretch with no valid choice is refused once, and the search ends), the state returned also with no question left (it counts those refused on the way); `answer` takes a choice or a skip; `fixAllFinish` at the end takes back the fixes that together made an overlap or gap neither the regions as loaded nor those Fix all began from have (each fix is checked against the regions before it, a save against the regions as loaded), with every fix of the regions they changed, and counts them ("… taken back, as it would make a new overlap or gap: draw it by hand"). The worker's requests: `fix-options` (a stretch of the last check, the corner as dragged) and `fix-all` / `fix-all-answer` (a choice, `skip`, or `stop` with what was fixed so far, for the question of its number: an answer to another is ignored); the page numbers its Fix all requests (`ask`) and takes only the answer to its last, and sends each answer once. Every fix request is answered: when the work throws, with `failed` (also Fix all before any check), and the page says "I could not work this fix out: draw it by hand." and closes the dialog. A check forgets the stretches of the one before when it starts; when `findStretches` throws, the pieces are listed all the same, none fixable; after a failed check or a worker error the page offers neither Fix nor "Fix all slivers…" until a check is through (`fixesOffered`). After a drag of the corner the midline stays shown, refused or not, and Apply waits for the answer to the last drag (`fixPick`), counted from the drag's start so that no answer to a drag before redraws the marker under the pointer (`fixWaiting`); the marker is made once per fix and moved with `setLatLng`, above Geoman's (`zIndexOffset`). Any edit drops a fix shown. The budget: one Fix's choices under a second and Fix all under 5 s for Pittsburgh; a densely traced border, under 2 s and 50 MB a midline. Pittsburgh's 28 outlines (2026-10-14 dump, at six decimals as the editor has them): 96 pieces in 71 stretches, all fixable, every choice valid; the stretches 24 ms after coverage's 190 ms, a stretch's three choices 290 ms median and 625 ms at most in the worker with 20,000 places strewn over the city, Fix all 1.8 s with them (0.9 s without), after which no overlap or gap is left; measured again in Node after the fix wave of the whole-branch review (2026-10-16): still 96 pieces in 71 stretches (6 of three regions), all 213 choices valid, a stretch's choices 213 ms median and 297 ms at most without places, Fix all 0.76 s leaving none. A 10 km sliver between two borders of 4,000 corners each: coverage 0.6 to 0.8 s, the stretches 0.1 s, a midline 0.07 s and under 20 MB, a choice with its check 0.9 to 1.9 s (polyclip's check), so that the Fix of such a stretch takes about 4 s.
 - **CSP:** unchanged. The worker is a script of Pine's (`worker-src` falls back to `script-src 'self'`). Geoman sets no style element and its CSS is bundled; its toolbar sets constants of its own as HTML; lodash's `Function("return this")` in its bundle is never reached in a browser.
diff --git a/docs/superpowers/plans/2026-10-17-phase-8m6-staging.md b/docs/superpowers/plans/2026-10-17-phase-8m6-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..9ad08c6ebb1dac20cd40f23b55a43f07aab29686
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-17-phase-8m6-staging.md
@@ -0,0 +1,32 @@
+# Phase 8M-6 staging checklist: the web map's small fixes
+
+Every step with Matt's go-ahead. Matt starts the bot (the permission classifier refuses it to Claude); Claude drives Discord and the pages in the built-in browser. Claude never types a password and never opens `.env`. The dev application "Professor Pine (Dev instance)", its test server and the local database in `pine-dev-mysql`. The web settings of 8M-1's staging stay (`"web": { "port": 8080, "publicUrl": "http://localhost:8080" }`). Two accounts: **Googer** (Claude, a moderator with Manage Server) and **Tester** (Matt, a member without a staff role).
+
+## Before
+
+1. Stage from `typescript-migration` once this plan is merged there. No migration, no command change (`/raid` keeps its options, help and answers but for the new refusal): no deploy. `npm run build` (it runs `npm run web:build`): new `dist/web/assets/map-<hash>.css` and `editor-<hash>.css`, which now hold the `:root` block of `theme.css`.
+2. Before the build, take screenshots of the map (logged in as Tester, with a raid, a train and a meetup on it, a gym popup open, the side panel showing) and of the region editor (Googer, a region selected, an overlap shaded, the Fix dialog open) on the commit before this plan, for step 14.
+
+## The region editor (Googer)
+
+3. Draw a new region with "A new channel…" named `Sooth` (close to `south`): the preview says "1 new channel has a name close to another: is it a typo?" and "Check the names: a typo in a name makes a channel of that name." (no "file" anywhere). `/region import` with a KML file of such a name still says "… a typo in the file …".
+4. A new channel named `North\Hills` (a backslash) and one named `1. Uptown`: the preview's list says `North\Hills →` with one backslash and `1. Uptown →` without a backslash before the dot. Discard them.
+5. A region with "A new channel…" `north-hills`, then the name changed to `south` (a channel the server has): the panel says "#south exists: pick it from the list."; the region's label in the list shows no channel any more, and Save is off for want of a channel (not "Saving would create #north-hills"). Undo brings `north-hills` back.
+6. Preview a change of a region's outline; on Discord create, rename or delete a channel the save does not use (one of no region, named like nothing the save would make); Save: saved, not "The regions changed meanwhile". If a second test server with regions is at hand: preview a change, change one of that server's regions (its own editor or `/region import` there), Save: saved too. (The refusal itself, a channel of the name a new region would make created between the save's planning and its run under the lock, cannot be timed by hand: the save takes its stamp at the start of its own request; covered by `editor-save.test.ts`.)
+7. While Discord cannot be reached (not stageable on demand; covered by `editor-save.test.ts`): a member never confirmed as staff gets "Discord cannot be reached just now, so I cannot tell whether you are staff." for a preview or save, staff seen within 30 minutes "… so nothing can be saved. Try again in a moment."
+
+## The map
+
+8. With `settings.web.memberRole` set to a role Tester lacks (for example `Verified`), Tester logs in with `/maps`: the header says "You can look around the map. To join or report here, you need the Verified role in this server." (not "You are not a member of this server."); regions and gyms show, no parties and no "Report raid". Googer, lacking the role too, opens the region editor (`/region edit`): its header names Googer and says nothing of the role. Give Tester the role, reload: the line is gone and the parties show. A Discord account that is not in the server, logged in with Discord: "You are not a member of this server.", no role named. Unset `memberRole` afterwards.
+9. Log out: the header goes back to "Log in with Discord" / "Use /maps in Discord to log in." (only a 2xx counts as logged out; a redirect or 1xx cannot be produced by hand: covered by `logout.test.ts`).
+10. A raid at a gym the map does not show (a gym of a region without an outline, or reported before its region got one): its item in the side panel names the gym as its post does, with the address line under it when the gym has one, and "Directions" (Google Maps, a new tab, to the gym's place). Before this plan it said "Unknown gym" with neither.
+11. A raid with a boss or egg picture on the map: a right click on the picture (and a long press on a phone) opens "Report spawn here" at that point, as on the map beside it; a raid shown as a red dot (no picture) did so already. In a point in no region the usual "That point is not in a region of this server." With another form open: "Close the form that is open first."
+12. Tester's meetup whose information has several lines (written with `/info` on Discord, which may store `\r\n`): "Edit…", change only the name and Set; then Set the information untouched: no "This meetup changed meanwhile" and the information unchanged (the textarea's line endings no longer count as typed).
+
+## `/raid` and the map's report, a gym in two regions
+
+13. Needs a gym lying in two regions (West and East) and an overwrite for Tester that denies View Channel on East's forum. Googer reports a raid at that gym from East's channel (`/raid`): the post is in East's forum. Tester, in West's channel, `/raid` at the same gym: "You cannot report a raid at this gym: you are kept out of the forum its raid would be in."; Tester is not on the post, and `/raid`'s limit is not counted (an immediate report at another gym goes through; the count is covered by `raid.test.ts`). With the overwrite taken off, Tester, in West's channel, `/raid` at a gym only in East: "… Report the raid there?"; Googer puts the overwrite back before Tester presses "Report it there": the same refusal, nothing reported. The same from the map ("Report raid" in that gym's popup, region West): the same words under the form. Remove the overwrite afterwards.
+
+## The look
+
+14. Compare the map and the region editor with the screenshots of step 2: colours of the header, notices, side panel, buttons, popups, the raid ring, the route numbers, the gym dots, region outlines, trains, meetups, the editor's regions, places, overlaps, gaps and the fix corner are exactly as before; the side panel and the editor's panel have their old widths. In the browser's developer tools, `:root` lists the custom properties of `theme.css`; changing `--raid` there recolours the raid ring at once, while Leaflet's shapes keep theirs (they read the properties once, at the first drawing: a value changed in `theme.css`, rebuilt and reloaded, reaches them, as `web.md`, "Restyling the page", says). The CSP reports nothing in the console.
````

---

## After the last task

The controller, not an implementer, does these:

1. `git diff proto-8m6 HEAD -- src test scripts userscript docs/architecture docs/web-setup.md package.json package-lock.json CLAUDE.md vitest.config.ts tsconfig.json tsconfig.build.json docs/superpowers/plans/2026-10-17-phase-8m6-staging.md` prints nothing; then `npm run check`, `npm run build` and `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db`, once each and one after the other.
2. Whole-branch review (`pine-reviewer`, Opus, high effort); one fix wave if it finds something (`pine-prototyper`, RED first).
3. If `typescript-migration` moved: merge it into `wayfarer`, settle conflicts (likely the follow-ups, `docs/superpowers/gantt-data.js`, `CLAUDE.md`), run the full check and the database suite again. Fast-forward `typescript-migration` to `wayfarer` when the main checkout is clean and no session holds it for staging. Never push.
4. `CLAUDE.md` status line, the follow-ups ("From Phase 8M-6": the decisions above for Matt, what only staging shows), the Gantt chart (`npm run gantt -- done 8M-6.<n> <commit>` per task, then `review`), the ledger and memory; tell the sessions working on typescript-migration.

## Staging checklist

The checklist is `docs/superpowers/plans/2026-10-17-phase-8m6-staging.md` (added by the last task). Each step with Matt's go-ahead, on the test server with the dev application: `npm run build`, Matt starts the bot; the region editor's wordings and save, the map's header for a member without the member role, Directions for a side-panel raid, a right click on a raid's picture, `/raid`'s refusal of a barred forum, and screenshots showing the page looks as before.
