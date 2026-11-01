# Phase 8M-11C: The Web Map's Fix Pass, the Region Editor: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the third and last plan of the web map's fix pass: the region editor's findings S29 to S32 from the web polish staging.

- **Task 1:** S29. The editor is offered on a computer with a mouse and a screen 1024 px wide: one rule, `EDITOR_MEDIA` = `(min-width: 1024px) and (pointer: fine)` in `src/web/client/editor-media.ts`, used by the menu, the address `?edit=regions` and `map.css` (a test keeps the stylesheet's query equal to the constant). The refusal: "Edit regions on a computer with a mouse and a screen 1024 pixels wide or more."
- **Task 2:** S30. The editor's gyms, stops, Power Spots and Wayfarer gyms clustered by the live map's clusterer; one Leaflet-side `ClusterLayer` (`cluster-layer.ts`) shared with the live map's gyms; the `--outside` warning color on dots and on the ring of a cluster holding an outside place.
- **Task 3:** S31. "Edit regions · 3 unsaved" in the menu and "3 regions have unsaved changes. They wait here until you save or undo them." in the editor; the count is regions, not steps (`regionsChanged` in the import-free `src/domain/regions/staged-format.ts`, with `newKey`/`isNewKey`); `/api/me` gives `userId`; once the editor has been open, the count comes from its state on close.
- **Task 4:** S32. With "Move shared corners together" on, deleting a shared corner deletes it in every region of the server that has it, as one undo step; refused with "Not deleted: <region> would have fewer than three corners." (`removedCorner`, `sharedCornerRemoval`, `cornerRemoval` in `shared-corners.ts`; Geoman refused in `removeVertexValidation` before it removes anything).
- **Task 5:** docs (`web.md`, `gyms-and-regions.md`, `testing.md`) and the staging checklist `2026-10-28-phase-8m11c-staging.md`, which also runs the 8M-10 steps one staff account can do (drags, Fix… on a gap, Fix all, the save).

**Tech stack:**
- TypeScript 6.0, Node 26, Leaflet with Geoman 2.20.4, esbuild, Fastify and Vitest.
- No new dependency, no migration, no setting, no command change, so no deploy. The CSP is unchanged.

**Spec:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11C: the region editor"), approved by Matt 2026-10-28. With it: the brief `.superpowers/sdd/2026-10-28-phase-8m11c-region-editor/design.md` (git-ignored), its fix list and `progress.md`.

**Every diff in this plan was run before the plan was written.**
- They were made on a throwaway branch `proto-8m11c` (tip `669def8e`), one commit per task, on web-fix-pass b31a3493 (typescript-migration with 8M-11B).
- Each commit typechecks and passes its tests.
- On the tip, the full check (10,822 tests), the build and the database suite (612 tests) pass (before a last doc-only amend of task 5).

**Reviews:**
- **The prototype:** an Opus review returned "ready after fixes": 1 Important (the editor's clusters copied the live map's Leaflet side, untested), 6 Minor (the clusters' place worded wrong, two stale comments, the menu's count without storage, `cornerRemovable`'s decision untested, a second copy of the new-key format, two checklist steps). Its calls were accepted (Wayfarer gyms clustered, each layer's cluster nudged to its own corner of the cell, the count approximate, the refusal before Geoman removes). Ruling: clusters stay at the mean of their places, nudged toward their corner.
- **Fix round 1:** folded in; a scoped re-review returned "ready", with one stale doc reference, fixed in task 5.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md`, `gyms-and-regions.md` and `testing.md`.

**Inside the plan:**
- Each commit needs only the typecheck (root and `src/web/client`) and its own test files.
- The full check, the build and the database suite run once, on the tip.
- Work in `../Professor-Pine-fixpass` on `web-fix-pass`; never commit in the main checkout.

## Review Focus

- The editor is offered by one rule: the menu, the address and the stylesheet never disagree (a touch laptop with a trackpad qualifies, a large tablet does not).
- The live map's gym clusters behave exactly as after 8M-11B now that they share `ClusterLayer` with the editor (open gym never removed, nothing redrawn for nothing).
- The unsaved count counts regions for splits, batches, undo and new regions removed again, and never throws where storage is blocked.
- A shared delete is one undo step, never touches another server's outlines, leaves Geoman consistent after a refusal, and with the option off changes only its own region.
- The map's page imports nothing it may not (`page-imports.test.ts`); nothing newer than ES2023, no Temporal.

---

### Task 1: 8M-11C task 1: the region editor offered with a mouse and 1024 pixels (S29)

Prototype commit: `929aded92268f91e8949218671bbe6210eec2064`

One rule decides whether "Edit regions" is offered: EDITOR_MEDIA,
"(min-width: 1024px) and (pointer: fine)" in editor-media.ts (no DOM types,
so the stylesheet's test reads it). The menu's item (editItemPressed) and
the address (editorByAddress) ask editorFits of the browser; map.css hides
the item but under that very query, and phone-header.test.ts holds the two
to each other. The refusal: "Edit regions on a computer with a mouse and a
screen 1024 pixels wide or more."

**Files:**

```
 src/web/client/editor-media.ts       | 14 ++++++++++++++
 src/web/client/editor-toggle.test.ts | 51 ++++++++++++++++++++++++++++++++++++++++++++++-----
 src/web/client/editor-toggle.ts      | 36 +++++++++++++++++++++++-------------
 src/web/client/main.ts               | 25 ++++++++++++++++++-------
 src/web/client/map.css               | 14 +++++++++++---
 src/web/phone-header.test.ts         | 21 +++++++++++++++++++++
 6 files changed, 133 insertions(+), 28 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/editor-toggle.test.ts src/web/phone-header.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 929aded92268f91e8949218671bbe6210eec2064 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11C task 1: the region editor offered with a mouse and 1024 pixels (S29)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/editor-media.ts b/src/web/client/editor-media.ts
new file mode 100644
index 0000000000000000000000000000000000000000..826f7c2e59f3497c9913c7c192d24adaf3b537d6
--- /dev/null
+++ b/src/web/client/editor-media.ts
@@ -0,0 +1,14 @@
+/**
+ * Where the region editor is offered (plan 8M-11C, S29): a screen of 1024 pixels or more, where
+ * the header's row of layers shows, whose main pointer is a mouse or a trackpad (a touch laptop
+ * with a trackpad is one; a large tablet is not). The one source: the page asks it
+ * (`editorFits`) for the menu and the address, and `map.css` shows "Edit regions" under this very
+ * query (`phone-header.test.ts` holds them to each other). Without the DOM's types, so that the
+ * stylesheet's test reads it.
+ */
+export const EDITOR_MEDIA = '(min-width: 1024px) and (pointer: fine)';
+
+/** Whether the editor is offered here (S29), asked of the browser (`matchMedia`'s `matches`). */
+export function editorFits(matches: (query: string) => boolean): boolean {
+  return matches(EDITOR_MEDIA);
+}
diff --git a/src/web/client/editor-toggle.test.ts b/src/web/client/editor-toggle.test.ts
index f0634ac3620971c7588f445f0dd6d018be6703a5..424b6379a521381a3d6084d75944d154ce53fd7e 100644
--- a/src/web/client/editor-toggle.test.ts
+++ b/src/web/client/editor-toggle.test.ts
@@ -13,11 +13,13 @@ import {
   EditorToggle,
   editingAsked,
   editingOffered,
+  editItemPressed,
   loadOnce,
-  NARROW_WORDS,
+  NOT_HERE_WORDS,
   OPENING_WORDS,
   type FilesDocument,
 } from './editor-toggle.js';
+import { EDITOR_MEDIA, editorFits } from './editor-media.js';
 import type { Me } from './notice.js';
 
 const ME: Me = { loggedIn: true, name: 'Brock', csrf: 't', member: true, readOnly: false };
@@ -42,7 +44,8 @@ describe("the region editor's address (plan 8M-10, C5)", () => {
 
 describe('who is offered "Edit regions" (C1, C6)', () => {
   // Branch review W5: built by the hint alone, whatever the width the page loaded at (a window
-  // widened later finds it); the media rule hides it below 1024 and its click checks the width.
+  // widened later finds it); the media rule hides it where it does not fit and its click asks
+  // again (S29).
   it('is staff by the hint', () => {
     expect(editingOffered({ ...ME, mayEditRegions: true })).toBe(true);
     expect(editingOffered({ ...ME, mayEditRegions: false })).toBe(false);
@@ -51,6 +54,44 @@ describe('who is offered "Edit regions" (C1, C6)', () => {
   });
 });
 
+// Plan 8M-11C, S29: one rule for the menu, the address and the stylesheet (`phone-header.test.ts`
+// holds `map.css` to `EDITOR_MEDIA`).
+describe('where the editor is offered (S29)', () => {
+  it('is a screen of 1024 pixels or more whose main pointer is a mouse or a trackpad', () => {
+    expect(EDITOR_MEDIA).toBe('(min-width: 1024px) and (pointer: fine)');
+    const asked: string[] = [];
+    const matches = (yes: boolean) => (query: string) => {
+      asked.push(query);
+      return yes;
+    };
+    expect(editorFits(matches(true))).toBe(true);
+    expect(editorFits(matches(false))).toBe(false);
+    expect(asked).toEqual([EDITOR_MEDIA, EDITOR_MEDIA]);
+  });
+
+  it('is said in words naming both', () => {
+    expect(NOT_HERE_WORDS).toBe(
+      'Edit regions on a computer with a mouse and a screen 1024 pixels wide or more.',
+    );
+  });
+
+  it('turns the editor on from the menu where it fits, else says why', () => {
+    const calls: string[] = [];
+    const page = (fits: boolean) => ({
+      fits: () => fits,
+      turnOn: () => {
+        calls.push('on');
+      },
+      say: (text: string) => {
+        calls.push(`say ${text}`);
+      },
+    });
+    editItemPressed(page(true));
+    editItemPressed(page(false));
+    expect(calls).toEqual(['on', `say ${NOT_HERE_WORDS}`]);
+  });
+});
+
 /** A page of a script and a stylesheet loading, as the test lets them. */
 function filesPage() {
   const appended: FakeFile[] = [];
@@ -342,7 +383,7 @@ describe('the editor asked for by the address (C5)', () => {
     return {
       calls,
       page: {
-        wide: () => wide,
+        fits: () => wide,
         turnOn: () => {
           calls.push('on');
         },
@@ -378,10 +419,10 @@ describe('the editor asked for by the address (C5)', () => {
     expect(calls).toEqual(['on']);
   });
 
-  it('on a narrow screen leaves the address and says why', async () => {
+  it('where the editor is not offered leaves the address and says why', async () => {
     const { calls, page } = addressPage(false);
     await editorByAddress(true, [Promise.reject(new Error('no geo'))], page);
-    expect(calls).toEqual(['leave', `say ${NARROW_WORDS}`]);
+    expect(calls).toEqual(['leave', `say ${NOT_HERE_WORDS}`]);
   });
 
   it('does nothing when the address does not ask', async () => {
diff --git a/src/web/client/editor-toggle.ts b/src/web/client/editor-toggle.ts
index c5d0b5f7867a331aa61f97d3ec9e0370219c6ef1..0a996f4447a42d73c2cc3d489aa305da2d2b6ebf 100644
--- a/src/web/client/editor-toggle.ts
+++ b/src/web/client/editor-toggle.ts
@@ -15,15 +15,28 @@ import type { Me } from './notice.js';
  * page's parts it is handed; `main.ts` wires it.
  */
 
-/** Said when the editor is asked for on a screen narrower than the header's row (C6). */
-export const NARROW_WORDS = 'Edit regions on a wider screen (1024 pixels or more).';
+/** Said when the editor is asked for where it is not offered (S29). */
+export const NOT_HERE_WORDS =
+  'Edit regions on a computer with a mouse and a screen 1024 pixels wide or more.';
 /**
  * Said as the editor starts to turn on (branch review W4): its files and data may take a moment;
  * the page shown with the editor empties it, a refusal takes its place.
  */
 export const OPENING_WORDS = 'Opening the region editor…';
-/** The narrowest screen the editor is offered on: where the header's row of layers shows. */
-export const EDITOR_MIN_WIDTH = '(min-width: 1024px)';
+
+/** What the menu's item and the address need of the page. */
+export interface OfferPage {
+  /** `editorFits` of the browser, asked at each use (a window resized, a mouse plugged in). */
+  fits(): boolean;
+  turnOn(): void;
+  say(text: string): void;
+}
+
+/** "Edit regions" pressed: the editor turned on where it is offered, else why not said (S29). */
+export function editItemPressed(page: OfferPage): void {
+  if (page.fits()) page.turnOn();
+  else page.say(NOT_HERE_WORDS);
+}
 
 /** Whether the address asks for the editor (`?edit=regions`, C5). */
 export function editingAsked(search: string): boolean {
@@ -42,8 +55,8 @@ export function addressWith(pathname: string, search: string, hash: string, on:
 /**
  * Whether "Edit regions" is built: for a member `/api/me` says may edit the server's regions (a
  * hint, C1: the editor's data asks Discord and decides). By the hint alone (branch review W5): a
- * window widened after the load finds it; `map.css` hides it narrower than the header's row, and
- * its click checks the width again (C6).
+ * window widened after the load finds it; `map.css` hides it where the editor is not offered
+ * (`EDITOR_MEDIA`), and its click asks again (C6, S29).
  */
 export function editingOffered(me: Me): boolean {
   return me.loggedIn && me.mayEditRegions === true;
@@ -52,26 +65,23 @@ export function editingOffered(me: Me): boolean {
 /**
  * `/s/<guild>/regions/edit` led to the map (C5): once what it `waits` for settled, whether it
  * loaded or not (review 1, F8: the editor does not need the live map's layers), the editor turned
- * on, whatever the hint says (its data decides), on a screen of the header's row; narrower, the
+ * on, whatever the hint says (its data decides), where the editor is offered (S29); elsewhere, the
  * address left and why said (C6).
  */
 export async function editorByAddress(
   asked: boolean,
   waits: readonly Promise<unknown>[],
-  page: {
-    wide(): boolean;
-    turnOn(): void;
+  page: OfferPage & {
     /** Drops `?edit=regions` from the address. */
     leave(): void;
-    say(text: string): void;
   },
 ): Promise<void> {
   await Promise.allSettled(waits);
   if (!asked) return;
-  if (page.wide()) page.turnOn();
+  if (page.fits()) page.turnOn();
   else {
     page.leave();
-    page.say(NARROW_WORDS);
+    page.say(NOT_HERE_WORDS);
   }
 }
 
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index b886c313df550963a885da7ba94fed657a2a0c37..7e541383a9f17657a3943dd99c66d9ad0c37f87f 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -7,10 +7,10 @@ import {
   EditorToggle,
   editingAsked,
   editingOffered,
-  EDITOR_MIN_WIDTH,
+  editItemPressed,
   loadOnce,
-  NARROW_WORDS,
 } from './editor-toggle.js';
+import { editorFits } from './editor-media.js';
 import { showGymDots, type GymDots } from './gyms-ui.js';
 import { LayerRegistry, MAP_LAYERS, regionLabelsShown } from './layer-registry.js';
 import { showLayerControls } from './layers-ui.js';
@@ -265,9 +265,13 @@ function editorToggle(
   return toggle;
 }
 
+/** Whether the region editor is offered on this browser now (S29). */
+const editorHere = (): boolean => editorFits((query) => window.matchMedia(query).matches);
+
 /**
- * The account menu's "Edit regions" (plan 8M-10, C7): built for the hint, shown on a screen of the
- * header's row (`map.css`), the width checked again at the click (branch review W5).
+ * The account menu's "Edit regions" (plan 8M-10, C7): built for the hint, shown where the editor
+ * is offered (`map.css` under `EDITOR_MEDIA`, plan 8M-11C, S29), asked again at the click
+ * (branch review W5).
  */
 function editItem(toggle: EditorToggle, load: MapLoad): HTMLElement {
   const item = document.createElement('button');
@@ -275,8 +279,15 @@ function editItem(toggle: EditorToggle, load: MapLoad): HTMLElement {
   item.className = 'edit-regions';
   item.textContent = 'Edit regions';
   item.addEventListener('click', () => {
-    if (window.matchMedia(EDITOR_MIN_WIDTH).matches) void toggle.turnOn();
-    else sayOverMap(NARROW_WORDS, load);
+    editItemPressed({
+      fits: editorHere,
+      turnOn: () => {
+        void toggle.turnOn();
+      },
+      say: (text) => {
+        sayOverMap(text, load);
+      },
+    });
   });
   return item;
 }
@@ -491,7 +502,7 @@ function start(): void {
   // `/s/<guild>/regions/edit` led here (plan 8M-10, C5): once the map is drawn or could not be
   // (review 1, F8: the editor opens at its view either way), and the member is known.
   void editorByAddress(editingAsked(location.search), [loaded, account], {
-    wide: () => window.matchMedia(EDITOR_MIN_WIDTH).matches,
+    fits: editorHere,
     turnOn: () => {
       void toggle.turnOn();
     },
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 00e0f34a9b194e3b56a8aa452443343a701ff29b..fdab3deacdb077d8b79ad9ff88bfcbd8502ecbb7 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -168,10 +168,18 @@ a {
   gap: 6px;
 }
 
-/* "Edit regions" only where the header's row shows (plan 8M-10, C6). */
-@media (max-width: 1023px) {
+/*
+ * "Edit regions" only where the editor is offered (plan 8M-11C, S29): a screen of 1024 pixels or
+ * more, where the header's row shows, with a mouse or a trackpad. The query is `EDITOR_MEDIA` of
+ * `editor-media.ts` word for word (`phone-header.test.ts` holds them to each other).
+ */
+.account-menu .edit-regions {
+  display: none;
+}
+
+@media (min-width: 1024px) and (pointer: fine) {
   .account-menu .edit-regions {
-    display: none;
+    display: block;
   }
 }
 
diff --git a/src/web/phone-header.test.ts b/src/web/phone-header.test.ts
index 54a03b53453367f4364a1a9e7827dd96ce53a6ed..789969c4e46fc4227ab7fd0104dd55f6673c08ee 100644
--- a/src/web/phone-header.test.ts
+++ b/src/web/phone-header.test.ts
@@ -1,6 +1,7 @@
 import { readFileSync } from 'node:fs';
 import path from 'node:path';
 import { describe, expect, it } from 'vitest';
+import { EDITOR_MEDIA } from './client/editor-media.js';
 
 /** A rule of a stylesheet: its selectors, its declarations, and the `@media` it is under. */
 interface Rule {
@@ -159,3 +160,23 @@ describe("the server's invite in the header on a phone", () => {
     );
   });
 });
+
+// Plan 8M-11C, S29: "Edit regions" by one rule, a mouse and 1024 pixels, the stylesheet's query
+// the very one the page asks (`EDITOR_MEDIA`).
+describe('"Edit regions" in the account menu', () => {
+  const rules = rulesOf(
+    readFileSync(path.resolve(import.meta.dirname, 'client', 'map.css'), 'utf8'),
+  );
+  const item = rules.filter((rule) => rule.selectors.includes('.account-menu .edit-regions'));
+
+  it('is hidden but where the page offers the editor, by its own query', () => {
+    expect(
+      item
+        .filter((rule) => rule.media === undefined)
+        .map((rule) => rule.declarations.get('display')),
+    ).toEqual(['none']);
+    const shownBy = item.filter((rule) => rule.media !== undefined);
+    expect(shownBy.map((rule) => rule.media)).toEqual([EDITOR_MEDIA]);
+    expect(shownBy[0]?.declarations.get('display')).toBe('block');
+  });
+});
````

### Task 2: 8M-11C task 2: the editor's places clustered, the warning ring (S30)

Prototype commit: `c28113e8f6c3795ac962eb4fec730fe64f913cd4`

The region editor's gyms, PokéStops, Power Spots and Wayfarer gyms keep
their toggles in the layer switch and are drawn by the live map's
clusterer and planning (wantedDots, planDots, cellPixels): the view and
half its size round it, clustered below zoom 16, drawn anew at each
moveend and when a layer is turned on (ClusteredPlaces, editor-places.ts).
The Leaflet side of the clusters is one ClusterLayer (cluster-layer.ts),
taken out of gyms-ui.ts so that the live map's gyms and the editor's
places apply the plan alike; a cluster's ring is set again whenever
Leaflet makes its element anew (its layer turned back on) and when its
marker goes to another cluster.
A place is known by its index in the data (placeLayers), the index
placeCounts names the places in no region by; their dots keep the warning
edge, and a cluster holding one has its ring in the warning color
(clusterWarns, .cluster.outside). A cluster is filled in its layer's color
(editor.css, theme.css's values), and since every layer is clustered by
the same grid, each cluster at the mean of its places, each layer's is
moved toward its own corner (translate; editor-clusters.test.ts keeps
them apart).

**Files:**

```
 src/web/client/cluster-layer.ts               | 185 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor-places.isolated.test.ts | 218 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor-places.ts               |  97 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor-view.test.ts            |  45 ++++++++++++++++++++++++++++++
 src/web/client/editor-view.ts                 |  43 +++++++++++++++++++++++++++++
 src/web/client/editor.css                     |  32 ++++++++++++++++++++++
 src/web/client/editor.ts                      | 128 ++++++++++++++++++++++++++++++++++++++++++++++++--------------------------------------
 src/web/client/gym-dots.ts                    |   7 +++--
 src/web/client/gyms-ui.ts                     | 107 ++++++++----------------------------------------------------------------
 src/web/editor-clusters.test.ts               |  38 ++++++++++++++++++++++++++
 10 files changed, 745 insertions(+), 155 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/editor-places.isolated.test.ts src/web/client/editor-view.test.ts src/web/editor-clusters.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c28113e8f6c3795ac962eb4fec730fe64f913cd4 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11C task 2: the editor's places clustered, the warning ring (S30)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/cluster-layer.ts b/src/web/client/cluster-layer.ts
new file mode 100644
index 0000000000000000000000000000000000000000..291e031891f70ddd55f5f17d739c200a9bd3f481
--- /dev/null
+++ b/src/web/client/cluster-layer.ts
@@ -0,0 +1,185 @@
+import * as L from 'leaflet';
+import { CLUSTER_BELOW } from './cluster.js';
+import { dotKey, planDots, wantedDots, type DrawnDot, type WantedDot } from './gym-dots.js';
+import type { Box } from './view.js';
+
+/**
+ * The Leaflet side of Pine's clustered places (plans 8M-7, 8M-11B, 8M-11C review C1), one for
+ * the live map's gyms (`showGymDots`) and the region editor's places (`ClusteredPlaces`): what is
+ * wanted for a view (`wantedDots`) drawn into a group touching only the difference (`planDots`):
+ * a place's own dot from `look.dot`, a cluster a circle with its count (`.cluster` and the look's
+ * class) whose marker is changed in place or given to a new cluster rather than made anew, a tap
+ * on it zooming in on its places. The `open` place is drawn on its own and never taken off. A
+ * cluster may warn by its ring (`look.ring`, the class `outside`), set again whenever Leaflet makes
+ * its element anew (its group put back on the map) and whenever `rings` is asked.
+ */
+
+/** How far a tap on a cluster zooms in at least. */
+const CLUSTER_STEP = 2;
+
+/** A place the layer draws: its id (its own dot's key), and where it is. */
+export interface ClusterPlace {
+  id: number;
+  lat: number;
+  lon: number;
+}
+
+/** How a layer's places and clusters look. */
+export interface ClusterLook<P extends ClusterPlace> {
+  /** The class its clusters carry beside `.cluster`; empty for none. */
+  className: string;
+  /** A cluster's title (its tooltip, what a screen reader says): "12 gyms". */
+  title(count: number): string;
+  /** A place's own dot, kept by the caller (the very same layer at each call). */
+  dot(place: P): L.Layer;
+  /** Whether a cluster of these places warns by its ring; never, without it. */
+  ring?: (points: readonly P[]) => boolean;
+}
+
+/** A cluster as drawn: its marker, its count's text, and its places. */
+interface Bubble<P> {
+  marker: L.Marker;
+  label: HTMLElement;
+  points: readonly P[];
+}
+
+export class ClusterLayer<P extends ClusterPlace> {
+  /** What is drawn, by its key (`wantedDots`), with what a cluster shows (`planDots`). */
+  private readonly drawn = new Map<string, { layer: L.Layer; shows: DrawnDot }>();
+  /** The clusters' markers by key: their count's text and their places, set in place. */
+  private readonly bubbles = new Map<string, Bubble<P>>();
+
+  constructor(
+    private readonly map: L.Map,
+    readonly group: L.LayerGroup,
+    private readonly look: ClusterLook<P>,
+  ) {}
+
+  /**
+   * Draws `places` for the view and its margin at `zoom`: the `open` place on its own, never
+   * clustered nor taken off.
+   */
+  draw(places: readonly P[], view: Box, zoom: number, open?: number): void {
+    const wanted = wantedDots(places, zoom, view, open);
+    const shows = new Map([...this.drawn].map(([key, { shows: what }]) => [key, what]));
+    const plan = planDots(shows, wanted, open === undefined ? undefined : dotKey(open));
+    for (const key of plan.remove) {
+      const layer = this.drawn.get(key)?.layer;
+      if (layer) this.group.removeLayer(layer);
+      this.drawn.delete(key);
+      this.bubbles.delete(key);
+    }
+    for (const [from, to] of plan.move) {
+      const shown = this.bubbles.get(from);
+      const item = wanted.get(to);
+      this.bubbles.delete(from);
+      this.drawn.delete(from);
+      if (!shown || item?.kind !== 'cluster') continue;
+      this.reshow(shown, item);
+      this.bubbles.set(to, shown);
+      this.drawn.set(to, { layer: shown.marker, shows: showsOf(item) });
+    }
+    for (const key of plan.change) {
+      const shown = this.bubbles.get(key);
+      const item = wanted.get(key);
+      if (!shown || item?.kind !== 'cluster') continue;
+      this.reshow(shown, item);
+      this.drawn.set(key, { layer: shown.marker, shows: showsOf(item) });
+    }
+    for (const key of plan.add) {
+      const item = wanted.get(key);
+      if (!item) continue;
+      if (item.kind === 'dot') {
+        const dot = this.look.dot(item.gym);
+        dot.addTo(this.group);
+        this.drawn.set(key, { layer: dot, shows: undefined });
+        continue;
+      }
+      const made = this.bubble(item.points, item.lat, item.lon);
+      made.marker.addTo(this.group);
+      this.bubbles.set(key, made);
+      this.drawn.set(key, { layer: made.marker, shows: showsOf(item) });
+    }
+  }
+
+  /** A place's dot drawn outside the plan (its popup opened by the page), kept as drawn. */
+  keep(place: P): void {
+    const dot = this.look.dot(place);
+    if (!this.group.hasLayer(dot)) {
+      dot.addTo(this.group);
+      this.drawn.set(dotKey(place.id), { layer: dot, shows: undefined });
+    }
+  }
+
+  /** Every cluster's ring set again (what it warns of changed). */
+  rings(): void {
+    for (const bubble of this.bubbles.values()) this.ring(bubble);
+  }
+
+  /** Everything taken off the map and forgotten (new places). */
+  clear(): void {
+    this.group.clearLayers();
+    this.drawn.clear();
+    this.bubbles.clear();
+  }
+
+  private ring(bubble: Bubble<P>): void {
+    const { ring } = this.look;
+    if (ring) bubble.marker.getElement()?.classList.toggle('outside', ring(bubble.points));
+  }
+
+  private bubble(points: readonly P[], lat: number, lon: number): Bubble<P> {
+    // The count as text of an element of ours: Leaflet sets a string as HTML.
+    const label = document.createElement('span');
+    label.textContent = String(points.length);
+    const { className } = this.look;
+    const marker = L.marker([lat, lon], {
+      icon: L.divIcon({
+        html: label,
+        className: className === '' ? 'cluster' : `cluster ${className}`,
+        iconSize: [34, 34],
+      }),
+      keyboard: true,
+      title: this.look.title(points.length),
+      pmIgnore: true,
+    });
+    const made: Bubble<P> = { marker, label, points };
+    marker.on('click', () => {
+      const box = L.latLngBounds(made.points.map((point) => [point.lat, point.lon]));
+      const zoom = Math.min(
+        Math.max(
+          this.map.getBoundsZoom(box, false, L.point(40, 40)),
+          this.map.getZoom() + CLUSTER_STEP,
+        ),
+        CLUSTER_BELOW,
+      );
+      this.map.setView(box.getCenter(), zoom);
+    });
+    // Leaflet makes the element anew each time its group is put back on the map: its ring too.
+    marker.on('add', () => {
+      this.ring(made);
+    });
+    return made;
+  }
+
+  /**
+   * A cluster's marker shows `item` (plan 8M-11B, S13): its count, its title, its places and its
+   * ring, and it moves to their middle; only what changed is touched.
+   */
+  private reshow(shown: Bubble<P>, item: { points: P[]; lat: number; lon: number }): void {
+    const count = String(item.points.length);
+    if (shown.label.textContent !== count) {
+      shown.label.textContent = count;
+      shown.marker.getElement()?.setAttribute('title', this.look.title(item.points.length));
+    }
+    shown.points = item.points;
+    this.ring(shown);
+    shown.marker.setLatLng([item.lat, item.lon]);
+  }
+}
+
+function showsOf<P>(item: WantedDot<P>): DrawnDot {
+  return item.kind === 'cluster'
+    ? { count: item.points.length, lat: item.lat, lon: item.lon }
+    : undefined;
+}
diff --git a/src/web/client/editor-places.isolated.test.ts b/src/web/client/editor-places.isolated.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..26e3a85514a213e00bb3d043db4f6f65712646a5
--- /dev/null
+++ b/src/web/client/editor-places.isolated.test.ts
@@ -0,0 +1,218 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { ClusteredPlaces, type PlaceLook } from './editor-places.js';
+import type { EditorPlace } from './editor-view.js';
+
+/**
+ * One layer of the region editor's places (plan 8M-11C, S30, review C1) over a Leaflet of fakes
+ * that behave as Leaflet does where it matters here: a marker's element exists only while its
+ * group is on the map, and is made anew (without the classes the page gave the old one) each time
+ * the group is put back. Isolated: Leaflet is mocked.
+ */
+const fake = vi.hoisted(() => {
+  type Handler = () => void;
+  /** An element as Leaflet makes it for a marker: its classes and attributes. */
+  class Element {
+    readonly classes = new Set<string>();
+    readonly classList = {
+      toggle: (name: string, on: boolean) => {
+        if (on) this.classes.add(name);
+        else this.classes.delete(name);
+      },
+    };
+    setAttribute() {
+      return undefined;
+    }
+  }
+  class Layer {
+    readonly handlers = new Map<string, Handler[]>();
+    group: Group | undefined;
+    element: Element | undefined;
+    constructor(
+      public at: [number, number],
+      readonly options: Record<string, unknown> = {},
+    ) {}
+    on(type: string, handler: Handler) {
+      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
+      return this;
+    }
+    fire(type: string) {
+      for (const handler of this.handlers.get(type) ?? []) handler();
+    }
+    bindTooltip() {
+      return this;
+    }
+    setStyle(style: Record<string, unknown>) {
+      Object.assign(this.options, style);
+      return this;
+    }
+    setLatLng(at: [number, number]) {
+      this.at = at;
+      return this;
+    }
+    getElement() {
+      return this.element;
+    }
+    addTo(group: Group) {
+      group.addLayer(this);
+      return this;
+    }
+    /** Put on the map: a new element, then Leaflet's `add`. */
+    shown() {
+      this.element = new Element();
+      this.fire('add');
+    }
+  }
+  class Group {
+    readonly layers = new Set<Layer>();
+    onMap = false;
+    addLayer(layer: Layer) {
+      layer.group = this;
+      this.layers.add(layer);
+      if (this.onMap) layer.shown();
+      return this;
+    }
+    removeLayer(layer: Layer) {
+      layer.group = undefined;
+      layer.element = undefined;
+      this.layers.delete(layer);
+      return this;
+    }
+    clearLayers() {
+      for (const layer of [...this.layers]) this.removeLayer(layer);
+      return this;
+    }
+    /** The layer switch turns it on: every element made anew. */
+    putOn() {
+      this.onMap = true;
+      for (const layer of this.layers) layer.shown();
+    }
+    takeOff() {
+      this.onMap = false;
+      for (const layer of this.layers) layer.element = undefined;
+    }
+  }
+  return { Layer, Group, Element };
+});
+
+vi.mock('leaflet', () => ({
+  marker: (at: [number, number], options: Record<string, unknown>) => new fake.Layer(at, options),
+  divIcon: (options: Record<string, unknown>) => ({ options }),
+  latLngBounds: () => ({ getCenter: () => ({ lat: 0, lng: 0 }) }),
+  point: (x: number, y: number) => ({ x, y }),
+}));
+
+type FakeLayer = InstanceType<typeof fake.Layer>;
+
+afterEach(() => {
+  vi.unstubAllGlobals();
+});
+
+/** Two stops of one cell at zoom 12 (a cluster), and one on its own there, in their cell at 8. */
+const PLACES: EditorPlace[] = [
+  { id: 0, lat: 40.03, lon: -80.05, name: 'Mural' },
+  { id: 1, lat: 40.031, lon: -80.051, name: 'Bench' },
+  { id: 2, lat: 40.1, lon: -80.2, name: 'Kiosk' },
+];
+
+/** A layer of the editor's places on a map at `zoom` that shows them all. */
+function placed(zoom = 12) {
+  vi.stubGlobal('document', { createElement: () => ({ textContent: null }) });
+  const group = new fake.Group();
+  group.onMap = true;
+  let viewAsked = 0;
+  const map = {
+    zoom,
+    hasLayer: (layer: unknown) => layer === group && group.onMap,
+    getZoom: () => map.zoom,
+    getBounds: () => {
+      viewAsked += 1;
+      return {
+        getSouth: () => 39.9,
+        getWest: () => -80.2,
+        getNorth: () => 40.3,
+        getEast: () => -79.6,
+      };
+    },
+  };
+  const look: PlaceLook = {
+    className: 'places-stops',
+    title: (n) => `${String(n)} PokéStops`,
+    colour: (outside) => (outside ? 'warn' : 'stop'),
+    dot: (place, outside) =>
+      new fake.Layer([place.lat, place.lon], {
+        name: place.name,
+        color: outside ? 'warn' : 'stop',
+      }) as never,
+  };
+  const places = new ClusteredPlaces(map as never, group as never, look);
+  places.setPlaces(PLACES);
+  /** What the group holds: its clusters and its dots. */
+  const clusters = () => [...group.layers].filter((layer) => layer.options.icon !== undefined);
+  const dots = () => [...group.layers].filter((layer) => layer.options.icon === undefined);
+  const ringed = (layer: FakeLayer | undefined) =>
+    layer?.getElement()?.classes.has('outside') ?? false;
+  return { places, group, map, clusters, dots, ringed, viewAsked: () => viewAsked };
+}
+
+describe("the editor's clustered places (review C1)", () => {
+  it('keep the ring of a cluster when its layer is turned off and on again', () => {
+    const { places, group, clusters, ringed } = placed();
+    places.setOutside(new Set([1]));
+    places.refresh();
+    expect(ringed(clusters()[0])).toBe(true);
+    group.takeOff();
+    group.putOn();
+    // Leaflet made its element anew: the ring is put back with it, before any move.
+    expect(ringed(clusters()[0])).toBe(true);
+  });
+
+  it('ring a cluster whose place left every region while its layer was off', () => {
+    const { places, group, clusters, ringed } = placed();
+    places.refresh();
+    expect(ringed(clusters()[0])).toBe(false);
+    group.takeOff();
+    places.setOutside(new Set([0]));
+    group.putOn();
+    expect(ringed(clusters()[0])).toBe(true);
+  });
+
+  it('work nothing out while their layer is off', () => {
+    const { places, group, viewAsked } = placed();
+    group.takeOff();
+    places.refresh();
+    expect(viewAsked()).toBe(0);
+    expect(group.layers.size).toBe(0);
+  });
+
+  it('draw the new places alone once the data is loaded anew', () => {
+    const { places, dots, map } = placed(16);
+    places.refresh();
+    expect(dots().map((dot) => dot.options.name)).toEqual(['Mural', 'Bench', 'Kiosk']);
+    places.setPlaces([{ id: 0, lat: 40.05, lon: -80.0, name: 'Fountain' }]);
+    map.zoom = 16;
+    places.refresh();
+    expect(dots().map((dot) => [dot.options.name, dot.at])).toEqual([['Fountain', [40.05, -80.0]]]);
+  });
+
+  it("set a cluster's ring anew when its marker is given to another zoom's cluster", () => {
+    const { places, clusters, ringed, map } = placed(12);
+    places.setOutside(new Set([2]));
+    places.refresh();
+    const [cluster] = clusters();
+    expect(ringed(cluster)).toBe(false);
+    // Zoom 8: the three are one cluster, on the marker of the two; the third is in no region.
+    map.zoom = 8;
+    places.refresh();
+    expect(clusters()).toEqual([cluster]);
+    expect(ringed(cluster)).toBe(true);
+    places.setOutside(new Set());
+    expect(ringed(cluster)).toBe(false);
+  });
+
+  it('edge a dot in the warning color while its place is in no region', () => {
+    const { places, dots } = placed(16);
+    places.refresh();
+    places.setOutside(new Set([2]));
+    expect(dots().map((dot) => dot.options.color)).toEqual(['stop', 'stop', 'warn']);
+  });
+});
diff --git a/src/web/client/editor-places.ts b/src/web/client/editor-places.ts
new file mode 100644
index 0000000000000000000000000000000000000000..1eb48a90733a297b956ea060bbea83885306c3da
--- /dev/null
+++ b/src/web/client/editor-places.ts
@@ -0,0 +1,97 @@
+import type * as L from 'leaflet';
+import { ClusterLayer } from './cluster-layer.js';
+import { clusterWarns, type EditorPlace } from './editor-view.js';
+import { renderNode } from './popup.js';
+
+/**
+ * One layer of the region editor's places (plan 8M-11C, S30): gyms, PokéStops, Power Spots or
+ * Wayfarer gyms, drawn for the view and a margin round it and clustered below street level by the
+ * live map's clusterer and its Leaflet side (`ClusterLayer`, which the live map's gyms use too): a
+ * place a dot of its kind's color, made once and kept, edged in the warning color while it lies in
+ * no region; a cluster a circle with its count (`.cluster` of `map.css`, `places-<layer>` of
+ * `editor.css`), its ring in the warning color while one of its places lies in no region
+ * (`clusterWarns`, `.outside`); a tap zooms in on it. Drawn anew at each `moveend`, while its
+ * layer is on (the layer switch keeps its toggle: off, nothing is worked out; on again, drawn at
+ * once, the rings with it).
+ */
+
+/** What a layer needs of the editor. */
+export interface PlaceLook {
+  /** The class its clusters carry beside `.cluster` (`editor.css`). */
+  className: string;
+  /** A cluster's title (its tooltip, what a screen reader says): "12 gyms". */
+  title(count: number): string;
+  /** A place's dot: filled in its kind's color, edged in it or in the warning one. */
+  dot(place: EditorPlace, outside: boolean): L.CircleMarker;
+  /** The edge of a dot: its kind's color, or the warning one. */
+  colour(outside: boolean): string;
+}
+
+export class ClusteredPlaces {
+  private places: readonly EditorPlace[] = [];
+  /** The places in no region, by `id`. */
+  private outside: ReadonlySet<number> = new Set();
+  private readonly dots = new Map<number, L.CircleMarker>();
+  private readonly layer: ClusterLayer<EditorPlace>;
+
+  constructor(
+    private readonly map: L.Map,
+    /** The layer the switch toggles: everything is drawn into it. */
+    readonly group: L.LayerGroup,
+    private readonly look: PlaceLook,
+  ) {
+    this.layer = new ClusterLayer(map, group, {
+      className: look.className,
+      title: (count) => look.title(count),
+      dot: (place) => this.dot(place),
+      ring: (points) => clusterWarns(points, this.outside),
+    });
+  }
+
+  /** New places (the data loaded anew): everything drawn before is taken off. */
+  setPlaces(places: readonly EditorPlace[]): void {
+    this.places = places;
+    this.layer.clear();
+    this.dots.clear();
+  }
+
+  /**
+   * The places in no region changed: dots and rings colored anew, nothing else redrawn (while
+   * the layer is off, the rings are set as it is put back).
+   */
+  setOutside(outside: ReadonlySet<number>): void {
+    const before = this.outside;
+    this.outside = outside;
+    for (const [id, dot] of this.dots) {
+      if (before.has(id) !== outside.has(id)) {
+        dot.setStyle({ color: this.look.colour(outside.has(id)) });
+      }
+    }
+    this.layer.rings();
+  }
+
+  /** Draws what the view wants (its layer on), touching only the difference. */
+  refresh(): void {
+    const { map } = this;
+    if (!map.hasLayer(this.group)) return;
+    const bounds = map.getBounds();
+    const view = {
+      south: bounds.getSouth(),
+      west: bounds.getWest(),
+      north: bounds.getNorth(),
+      east: bounds.getEast(),
+    };
+    this.layer.draw(this.places, view, map.getZoom());
+  }
+
+  /** A place's dot, made on first use with its tooltip (made when shown). */
+  private dot(place: EditorPlace): L.CircleMarker {
+    const made = this.dots.get(place.id);
+    if (made) return made;
+    const dot = this.look
+      .dot(place, this.outside.has(place.id))
+      .bindTooltip(() => renderNode({ tag: 'span', text: place.name }, document));
+    this.dots.set(place.id, dot);
+    return dot;
+  }
+}
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index 352bb87df0179b0a62cdc6de1d4538ac48a3ee71..0a7f2c596cb46f29ba99e988ee4a4792323e1ebd 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -47,7 +47,10 @@ import {
   reopenRefusal,
   START_VIEW,
   type ListedPiece,
+  clusterWarns,
+  placeLayers,
 } from './editor-view.js';
+import { wantedDots } from './gym-dots.js';
 
 const p = (lat: number, lon: number): LatLon => ({ lat, lon });
 function square(south: number, west: number, north: number, east: number): LatLon[] {
@@ -691,3 +694,45 @@ describe('the region editor page', () => {
     expect(ACCOUNT_CHANGED).toBe('You are logged in as someone else now: reload the page.');
   });
 });
+
+// Plan 8M-11C, S30: the editor's places by layer, clustered by the live map's clusterer.
+describe("the editor's places", () => {
+  const MORE: EditorData = {
+    ...DATA,
+    wayspots: [
+      ['stop', 40.03, -80.05, 'Mural'],
+      ['gym', 40.02, -80.02, 'Old fountain'],
+      ['powerspot', 40.2, -80.0, 'Kiosk'],
+      ['stop', 40.031, -80.051, 'Bench'],
+    ],
+  };
+
+  it('are in a layer each, known by their place in the data, as the places in no region are', () => {
+    const layers = placeLayers(MORE);
+    expect(layers.gyms.map(({ id, name }) => [id, name])).toEqual([
+      [0, 'Library'],
+      [1, 'Bridge'],
+      [2, 'Trailhead'],
+    ]);
+    expect(layers.stops.map(({ id, name }) => [id, name])).toEqual([
+      [0, 'Mural'],
+      [3, 'Bench'],
+    ]);
+    expect(layers.wayfarerGyms.map(({ id, name }) => [id, name])).toEqual([[1, 'Old fountain']]);
+    expect(layers.powerspots.map(({ id, lat, lon }) => [id, lat, lon])).toEqual([[2, 40.2, -80.0]]);
+  });
+
+  it("warn on a cluster's ring when one of its places is in no region", () => {
+    const view = { south: 39.9, west: -80.2, north: 40.3, east: -79.8 };
+    const zoomedOut = [...wantedDots(placeLayers(MORE).stops, 12, view, undefined).values()];
+    expect(zoomedOut).toHaveLength(1);
+    const [cluster] = zoomedOut;
+    if (cluster?.kind !== 'cluster') throw new Error('expected one cluster of both stops');
+    expect(clusterWarns(cluster.points, new Set([3]))).toBe(true);
+    expect(clusterWarns(cluster.points, new Set([1, 2]))).toBe(false);
+    expect(clusterWarns(cluster.points, new Set())).toBe(false);
+    // Zoomed in, each place on its own.
+    const zoomedIn = [...wantedDots(placeLayers(MORE).stops, 16, view, undefined).values()];
+    expect(zoomedIn.map((item) => item.kind)).toEqual(['dot', 'dot']);
+  });
+});
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index 738b7a1c3ec9776385b7ba177964b36d78742def..60d340ffab0297ee56e40f923725ea4b0825cdd6 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -86,6 +86,49 @@ export function placeCounts(
   return { gyms, outsideGyms, outsideWayspots };
 }
 
+/**
+ * A place the editor draws (plan 8M-11C, S30): `id` is its index in the data's own list
+ * (`EditorData.gyms` for a gym, `EditorData.wayspots` for the rest), the index `placeCounts`
+ * names the places in no region by.
+ */
+export interface EditorPlace {
+  id: number;
+  lat: number;
+  lon: number;
+  name: string;
+}
+
+/** The layers of places the editor clusters, as its layer switch names them. */
+export type PlaceLayer = 'gyms' | 'stops' | 'powerspots' | 'wayfarerGyms';
+
+/** The data's places by the layer that draws them (S30). */
+export function placeLayers(
+  data: Pick<EditorData, 'gyms' | 'wayspots'>,
+): Record<PlaceLayer, EditorPlace[]> {
+  const layers: Record<PlaceLayer, EditorPlace[]> = {
+    gyms: data.gyms.map(([, lat, lon, name], id) => ({ id, lat, lon, name })),
+    stops: [],
+    powerspots: [],
+    wayfarerGyms: [],
+  };
+  data.wayspots.forEach(([kind, lat, lon, name], id) => {
+    const layer = kind === 'stop' ? 'stops' : kind === 'powerspot' ? 'powerspots' : 'wayfarerGyms';
+    layers[layer].push({ id, lat, lon, name });
+  });
+  return layers;
+}
+
+/**
+ * Whether a cluster's ring is drawn in the warning color (S30): one of its places lies in no
+ * region (`outside`, by the places' `id`s of one list).
+ */
+export function clusterWarns(
+  points: readonly { id: number }[],
+  outside: ReadonlySet<number>,
+): boolean {
+  return points.some((point) => outside.has(point.id));
+}
+
 /** How a region is named on the page: `#west`, or what a new one takes or makes. */
 export function draftLabel(draft: Draft): string {
   const { channel } = draft;
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index de17c9f4265707dbd3e99187cbda1c1eb68d63b3..d4d1fc8d3f8836aa044aa9a588c15fb480808972 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -282,6 +282,38 @@
   background: var(--outside);
 }
 
+/*
+ * The places' clusters (plan 8M-11C, S30): the live map's `.cluster`, filled in the color of the
+ * layer's dots; the ring in the warning color while one of its places is in no region. Every
+ * layer is clustered by the same grid and a cluster sits at the mean of its places, so the
+ * clusters of one cell sit near each other: each layer's is moved toward its own corner
+ * (`translate`, beside Leaflet's own `transform`), gyms top left, PokéStops top right, Power
+ * Spots bottom right, Wayfarer gyms bottom left, staying near its places.
+ */
+.cluster.places-gyms {
+  background: var(--editor-gym);
+  translate: -14px -14px;
+}
+
+.cluster.places-stops {
+  background: var(--editor-stop);
+  translate: 14px -14px;
+}
+
+.cluster.places-powerspots {
+  background: var(--power-spot);
+  translate: 14px 14px;
+}
+
+.cluster.places-wayfarer-gyms {
+  background: var(--wayfarer-gym);
+  translate: -14px 14px;
+}
+
+.cluster.outside {
+  border-color: var(--outside);
+}
+
 .swatch-theirs {
   width: 14px;
   border: 2px dashed var(--theirs);
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index b6a437c7e202cb330e10152290903bc3db27614d..ca3be7577d5c5c0f0ac948d5bb3354a23ecb9336 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -80,9 +80,12 @@ import {
   stretchTitle,
   type PickerState,
   type PlaceCounts,
+  placeLayers,
+  type PlaceLayer,
   type ReadAnswer,
 } from './editor-view.js';
 import { CLOSE_FORM_FIRST, EDITOR_FAILED, type EditorHosts, type MapView } from './editor-mount.js';
+import { ClusteredPlaces } from './editor-places.js';
 import type { Me } from './notice.js';
 import { regionLabel, renderNode } from './popup.js';
 import { failureWords, timed } from './request-error.js';
@@ -327,10 +330,8 @@ class Editor {
     wayfarerGyms: L.layerGroup(),
     others: L.layerGroup(),
   };
-  private gymDots: L.CircleMarker[] = [];
-  private wayspotDots: L.CircleMarker[] = [];
-  private outsideBefore = { gyms: new Set<number>(), wayspots: new Set<number>() };
-  private coloured = false;
+  /** The places of each layer, clustered when zoomed out (plan 8M-11C, S30). */
+  private readonly clustered: Record<PlaceLayer, ClusteredPlaces>;
   private readonly versions = new WeakMap<readonly LatLon[], string>();
   private versionCount = 0;
   /** The browser's storage, or none where it keeps nothing for the page. */
@@ -354,6 +355,45 @@ class Editor {
     this.worstFirst = this.state.edits.length === 0 && this.state.undone.length === 0;
     this.applied = applyEdits(this.loaded, this.state);
     this.counts = placeCounts(this.applied.drafts, data);
+    const layer = (
+      group: L.LayerGroup,
+      className: string,
+      word: string,
+      colour: () => string,
+      radius: number,
+    ): ClusteredPlaces =>
+      new ClusteredPlaces(map, group, {
+        className,
+        title: (n) => count(n, word),
+        colour: (outside) => (outside ? colours().outside : colour()),
+        dot: (place, outside) =>
+          L.circleMarker([place.lat, place.lon], {
+            radius,
+            weight: 1,
+            color: outside ? colours().outside : colour(),
+            fillColor: colour(),
+            fillOpacity: 0.8,
+            pmIgnore: true,
+          }),
+      });
+    this.clustered = {
+      gyms: layer(this.places.gyms, 'places-gyms', 'gym', () => colours().editorGym, 5),
+      stops: layer(this.places.stops, 'places-stops', 'PokéStop', () => colours().editorStop, 3),
+      powerspots: layer(
+        this.places.powerspots,
+        'places-powerspots',
+        'Power Spot',
+        () => colours().powerSpot,
+        4,
+      ),
+      wayfarerGyms: layer(
+        this.places.wayfarerGyms,
+        'places-wayfarer-gyms',
+        'Wayfarer gym',
+        () => colours().wayfarerGym,
+        4,
+      ),
+    };
     worker.addEventListener('message', (event: MessageEvent<CoverageAnswer>) => {
       const answer = event.data;
       if (answer.kind === 'check') this.answered(answer);
@@ -409,6 +449,11 @@ class Editor {
     map.on('pm:create', (event: { shape: string; layer: L.Layer }) => {
       this.created(event.shape, event.layer);
     });
+    // The places of the view, clustered when zoomed out (S30): at each move, and a layer the
+    // switch turns on at once.
+    map.on('moveend overlayadd', () => {
+      this.refreshPlaces();
+    });
     this.drawPlaces();
     this.tools();
     this.toolbar();
@@ -488,36 +533,20 @@ class Editor {
         snapIgnore: false,
       }).addTo(others);
     }
-    const dot = (lat: number, lon: number, colour: string, radius: number): L.CircleMarker =>
-      L.circleMarker([lat, lon], {
-        radius,
-        weight: 1,
-        color: colour,
-        fillColor: colour,
-        fillOpacity: 0.8,
-        pmIgnore: true,
-      });
-    // Tooltips are made when shown: tens of thousands of places.
-    this.gymDots = data.gyms.map(([, lat, lon, name]) =>
-      dot(lat, lon, colours().editorGym, 5)
-        .bindTooltip(() => renderNode({ tag: 'span', text: name }, document))
-        .addTo(gyms),
-    );
-    this.wayspotDots = data.wayspots.map(([kind, lat, lon, title]) =>
-      dot(
-        lat,
-        lon,
-        kind === 'stop'
-          ? colours().editorStop
-          : kind === 'powerspot'
-            ? colours().powerSpot
-            : colours().wayfarerGym,
-        kind === 'stop' ? 3 : 4,
-      )
-        .bindTooltip(() => renderNode({ tag: 'span', text: title }, document))
-        .addTo(kind === 'stop' ? stops : kind === 'powerspot' ? powerspots : wayfarerGyms),
-    );
-    this.coloured = false;
+    const layers = placeLayers(data);
+    for (const [name, places] of Object.entries(this.clustered) as [
+      PlaceLayer,
+      ClusteredPlaces,
+    ][]) {
+      places.setPlaces(layers[name]);
+    }
+    this.recolour();
+    this.refreshPlaces();
+  }
+
+  /** The places of the view drawn anew in every layer that is on (S30). */
+  private refreshPlaces(): void {
+    for (const places of Object.values(this.clustered)) places.refresh();
   }
 
   /** A shape drawn with Geoman's tools: a new region, or the line of a split. */
@@ -849,32 +878,17 @@ class Editor {
     }, 0);
   }
 
-  /** The places in no region in the warning colour; after the first time, only those that changed. */
+  /**
+   * The places in no region in the warning color, and the rings of the clusters that hold one
+   * (S30); only the dots whose state changed are touched.
+   */
   private recolour(): void {
     const gyms = new Set(this.counts.outsideGyms);
     const wayspots = new Set(this.counts.outsideWayspots);
-    const restyle = (
-      dots: L.CircleMarker[],
-      before: Set<number>,
-      now: Set<number>,
-      colourOf: (i: number) => string,
-    ): void => {
-      dots.forEach((dot, i) => {
-        if (this.coloured && before.has(i) === now.has(i)) return;
-        dot.setStyle({ color: now.has(i) ? colours().outside : colourOf(i) });
-      });
-    };
-    restyle(this.gymDots, this.outsideBefore.gyms, gyms, () => colours().editorGym);
-    restyle(this.wayspotDots, this.outsideBefore.wayspots, wayspots, (i) => {
-      const kind = this.data.wayspots[i]?.[0];
-      return kind === 'stop'
-        ? colours().editorStop
-        : kind === 'powerspot'
-          ? colours().powerSpot
-          : colours().wayfarerGym;
-    });
-    this.outsideBefore = { gyms, wayspots };
-    this.coloured = true;
+    this.clustered.gyms.setOutside(gyms);
+    this.clustered.stops.setOutside(wayspots);
+    this.clustered.powerspots.setOutside(wayspots);
+    this.clustered.wayfarerGyms.setOutside(wayspots);
   }
 
   private select(key: string | undefined): void {
diff --git a/src/web/client/gym-dots.ts b/src/web/client/gym-dots.ts
index ac5070e271f3e609991aed2d42eaa6b97c6bdedd..32c1539eca5586e49e7fb328471102764b5073fa 100644
--- a/src/web/client/gym-dots.ts
+++ b/src/web/client/gym-dots.ts
@@ -6,6 +6,9 @@ import { inBox, paddedBox, type Box } from './view.js';
 /** How far beyond the view the dots are drawn, as a share of its size each way. */
 export const DOTS_MARGIN = 0.5;
 
+/** The key a place's own dot is drawn by (`wantedDots`, `planDots`'s `open`). */
+export const dotKey = (id: number): string => `gym:${String(id)}`;
+
 /** A thing the gyms' layer draws: a gym's dot, or a cluster with its count. */
 export type WantedDot<G> =
   { kind: 'dot'; gym: G } | { kind: 'cluster'; points: G[]; lat: number; lon: number };
@@ -30,7 +33,7 @@ export function wantedDots<G extends { id: number; lat: number; lon: number }>(
   for (const cluster of clustersAt(near, zoom)) {
     const [first] = cluster.points;
     if (!first) continue;
-    if (cluster.points.length === 1) wanted.set(`gym:${first.id}`, { kind: 'dot', gym: first });
+    if (cluster.points.length === 1) wanted.set(dotKey(first.id), { kind: 'dot', gym: first });
     else {
       wanted.set(`cluster:${String(zoom)}:${cluster.cell ?? ''}`, {
         kind: 'cluster',
@@ -41,7 +44,7 @@ export function wantedDots<G extends { id: number; lat: number; lon: number }>(
     }
   }
   const opened = gyms.find((gym) => gym.id === open);
-  if (opened) wanted.set(`gym:${opened.id}`, { kind: 'dot', gym: opened });
+  if (opened) wanted.set(dotKey(opened.id), { kind: 'dot', gym: opened });
   return wanted;
 }
 
diff --git a/src/web/client/gyms-ui.ts b/src/web/client/gyms-ui.ts
index f5e7b23f10e68a1c36d0250632578fe143c5ba01..72654caeaf196f544aa821f0baed67cf3bacd51b 100644
--- a/src/web/client/gyms-ui.ts
+++ b/src/web/client/gyms-ui.ts
@@ -1,6 +1,6 @@
 import * as L from 'leaflet';
-import { CLUSTER_BELOW } from './cluster.js';
-import { planDots, shownGyms, wantedDots, type DrawnDot, type WantedDot } from './gym-dots.js';
+import { ClusterLayer } from './cluster-layer.js';
+import { shownGyms } from './gym-dots.js';
 import type { LayerRegistry } from './layer-registry.js';
 import { GYM_DOT, gymClicks } from './party-layer.js';
 import { gymPopup, renderNode, type MapGym } from './popup.js';
@@ -49,16 +49,6 @@ export interface GymDotsDeps {
   tapped(gym: MapGym, own: () => void): void;
 }
 
-/** How far a tap on a cluster zooms in at least. */
-const CLUSTER_STEP = 2;
-
-/** A cluster's marker as drawn: its count's text, and the gyms a tap zooms in on. */
-interface Bubble {
-  marker: L.Marker;
-  label: HTMLElement;
-  points: readonly MapGym[];
-}
-
 /** A cluster's title (its tooltip, what a screen reader says). */
 const gymsTitle = (count: number): string => `${String(count)} gyms`;
 
@@ -66,10 +56,6 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
   const { map, registry } = deps;
   const group = L.layerGroup().addTo(map);
   const dots = new Map<number, L.CircleMarker>();
-  /** What is drawn, by its key (`wantedDots`), with what a cluster shows (`planDots`). */
-  const drawn = new Map<string, { layer: L.Layer; shows: DrawnDot }>();
-  /** The clusters' markers by key: their count's text and their gyms, set in place. */
-  const bubbles = new Map<string, Bubble>();
   /** The gym whose popup is open. */
   let open: number | undefined;
 
@@ -114,44 +100,15 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
     return marker;
   };
 
-  const bubble = (points: readonly MapGym[], lat: number, lon: number): Bubble => {
-    // The count as text of an element of ours: Leaflet sets a string as HTML.
-    const label = document.createElement('span');
-    label.textContent = String(points.length);
-    const marker = L.marker([lat, lon], {
-      icon: L.divIcon({ html: label, className: 'cluster', iconSize: [34, 34] }),
-      keyboard: true,
-      title: gymsTitle(points.length),
-    });
-    const made: Bubble = { marker, label, points };
-    marker.on('click', () => {
-      const box = L.latLngBounds(made.points.map((point) => [point.lat, point.lon]));
-      const zoom = Math.min(
-        Math.max(map.getBoundsZoom(box, false, L.point(40, 40)), map.getZoom() + CLUSTER_STEP),
-        CLUSTER_BELOW,
-      );
-      map.setView(box.getCenter(), zoom);
-    });
-    return made;
-  };
-
   /**
-   * A cluster's marker shows `item` (plan 8M-11B, S13): its count, its title and its gyms, and it
-   * moves to their middle; only what changed is touched.
+   * The gyms' dots and clusters (`ClusterLayer`, shared with the region editor's places, plan
+   * 8M-11C review C1).
    */
-  const reshow = (shown: Bubble, item: { points: MapGym[]; lat: number; lon: number }): void => {
-    const count = String(item.points.length);
-    if (shown.label.textContent !== count) {
-      shown.label.textContent = count;
-      shown.marker.getElement()?.setAttribute('title', gymsTitle(item.points.length));
-    }
-    shown.points = item.points;
-    shown.marker.setLatLng([item.lat, item.lon]);
-  };
-  const showsOf = (item: WantedDot<MapGym>): DrawnDot =>
-    item.kind === 'cluster'
-      ? { count: item.points.length, lat: item.lat, lon: item.lon }
-      : undefined;
+  const clusters = new ClusterLayer<MapGym>(map, group, {
+    className: '',
+    title: gymsTitle,
+    dot,
+  });
 
   /**
    * Draws what is wanted for the view and a margin (`wantedDots`), touching only the difference
@@ -173,45 +130,7 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
       north: bounds.getNorth(),
       east: bounds.getEast(),
     };
-    const wanted = wantedDots(shown, map.getZoom(), view, open);
-    const shows = new Map([...drawn].map(([key, { shows: what }]) => [key, what]));
-    const plan = planDots(shows, wanted, open === undefined ? undefined : `gym:${open}`);
-    for (const key of plan.remove) {
-      const layer = drawn.get(key)?.layer;
-      if (layer) group.removeLayer(layer);
-      drawn.delete(key);
-      bubbles.delete(key);
-    }
-    for (const [from, to] of plan.move) {
-      const shown = bubbles.get(from);
-      const item = wanted.get(to);
-      bubbles.delete(from);
-      drawn.delete(from);
-      if (!shown || item?.kind !== 'cluster') continue;
-      reshow(shown, item);
-      bubbles.set(to, shown);
-      drawn.set(to, { layer: shown.marker, shows: showsOf(item) });
-    }
-    for (const key of plan.change) {
-      const shown = bubbles.get(key);
-      const item = wanted.get(key);
-      if (!shown || item?.kind !== 'cluster') continue;
-      reshow(shown, item);
-      drawn.set(key, { layer: shown.marker, shows: showsOf(item) });
-    }
-    for (const key of plan.add) {
-      const item = wanted.get(key);
-      if (!item) continue;
-      if (item.kind === 'dot') {
-        dot(item.gym).addTo(group);
-        drawn.set(key, { layer: dot(item.gym), shows: undefined });
-        continue;
-      }
-      const made = bubble(item.points, item.lat, item.lon);
-      made.marker.addTo(group);
-      bubbles.set(key, made);
-      drawn.set(key, { layer: made.marker, shows: showsOf(item) });
-    }
+    clusters.draw(shown, view, map.getZoom(), open);
     registry.setCount('gyms', shown.filter((gym) => bounds.contains([gym.lat, gym.lon])).length);
   };
 
@@ -247,11 +166,7 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
    */
   const openGym = (gym: MapGym): HTMLElement | undefined => {
     const marker = dot(gym);
-    const key = `gym:${String(gym.id)}`;
-    if (!group.hasLayer(marker)) {
-      marker.addTo(group);
-      drawn.set(key, { layer: marker, shows: undefined });
-    }
+    clusters.keep(gym);
     marker.openPopup();
     return marker.getPopup()?.getElement();
   };
diff --git a/src/web/editor-clusters.test.ts b/src/web/editor-clusters.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4740c9bbfc9d080ab207cee168c090c2b8a857ee
--- /dev/null
+++ b/src/web/editor-clusters.test.ts
@@ -0,0 +1,38 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+
+// Plan 8M-11C, S30: each layer of the region editor is clustered by the same grid, each cluster at
+// the mean of its places, so the clusters of gyms, PokéStops, Power Spots and Wayfarer gyms of one
+// cell sit near each other. Each layer's is moved apart from the others' (seen stacked in the
+// preview), as `editor.css` places them.
+
+const CSS = readFileSync(path.resolve(import.meta.dirname, 'client', 'editor.css'), 'utf8').replace(
+  /\/\*[\s\S]*?\*\//gu,
+  '',
+);
+const LAYERS = ['gyms', 'stops', 'powerspots', 'wayfarer-gyms'];
+/** The clusters' circle (`iconSize` of `editor-places.ts`). */
+const CIRCLE = 34;
+
+/** Where a layer's clusters are moved from the cell's middle, by `translate`, in pixels. */
+function offset(layer: string): { x: number; y: number } | undefined {
+  const rule = new RegExp(`\\.cluster\\.places-${layer}\\s*\\{([^}]*)\\}`, 'u').exec(CSS);
+  const found = /translate:\s*(-?\d+)px\s+(-?\d+)px/u.exec(rule?.[1] ?? '');
+  return found ? { x: Number(found[1]), y: Number(found[2]) } : undefined;
+}
+
+describe("the editor's clusters of one cell", () => {
+  it('sit apart by layer, overlapping by less than a third of a circle', () => {
+    const offsets = LAYERS.map((layer) => {
+      const found = offset(layer);
+      expect(found, layer).toBeDefined();
+      return found ?? { x: 0, y: 0 };
+    });
+    for (const [i, a] of offsets.entries()) {
+      for (const b of offsets.slice(i + 1)) {
+        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual((CIRCLE * 2) / 3);
+      }
+    }
+  });
+});
````

### Task 3: 8M-11C task 3: what is unsaved, in the menu and the editor (S31)

Prototype commit: `ca7665256504e3eecbbaf4dbb28303674ee97a7c`

The account menu's item reads "Edit regions · 3 unsaved" while the
browser holds staged edits of this server's member (editItemLabel over
stagedRegions), drawn again whenever the editor closes: once it was
opened, by the editor's own count as it closed (EditorMount.close gives
it with the view, unsavedCount), so that a browser that keeps nothing
still shows it; before, from what the browser keeps. The count is the
regions the edits change, not the steps (regionsChanged, read from the
edits alone so that the map needs no editor data, in staged-format.ts
with the format the browser keeps the edits in, parseEdits and
serialiseEdits, and newKey with isNewKey, which regionsChanged and
record read, moved out of edits.ts, which passes them on: a module
that imports nothing at run time, as the map's page needs: a new region
removed again and a region taken as theirs count no more, what is undone
does not count). /api/me answers userId, whose key the page reads
(storageKey, moved to staged-storage.ts; the key has named the member
since 8M-2, so no older key exists to read). The editor's panel opens
with "3 regions have unsaved changes. They wait here until you save or
undo them." (unsavedLine; one region in the singular). Back to the map
leaves without asking, as before.

**Files:**

```
 src/domain/regions/edits.test.ts      |  72 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/domain/regions/edits.ts           | 103 +++++++++++++------------------------------------------------------------------------------------------
 src/domain/regions/staged-format.ts   | 137 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor-mount.ts        |  13 +++++++++++--
 src/web/client/editor-toggle.test.ts  |  30 +++++++++++++++++++++++++++++-
 src/web/client/editor-toggle.ts       |  33 +++++++++++++++++++++++++++++++--
 src/web/client/editor-view.test.ts    |  16 +++++++++++++++-
 src/web/client/editor-view.ts         |  13 ++++++++++---
 src/web/client/editor.css             |  12 ++++++++++++
 src/web/client/editor.ts              |  24 +++++++++++++++++++-----
 src/web/client/main.ts                |  46 ++++++++++++++++++++++++++++++++++++++++------
 src/web/client/notice.ts              |   5 +++++
 src/web/client/staged-storage.test.ts |  26 +++++++++++++++++++++++++-
 src/web/client/staged-storage.ts      |  25 +++++++++++++++++++++++--
 src/web/guild-routes.ts               |   3 +++
 src/web/login.test.ts                 |   2 ++
 16 files changed, 447 insertions(+), 113 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/edits.test.ts src/web/client/editor-toggle.test.ts src/web/client/editor-view.test.ts src/web/client/staged-storage.test.ts src/web/login.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff ca7665256504e3eecbbaf4dbb28303674ee97a7c -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11C task 3: what is unsaved, in the menu and the editor (S31)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/regions/edits.test.ts b/src/domain/regions/edits.test.ts
index b9f380961cfd5cb6dbbca2d5ab22f9b04c3c840f..60d91985ffa3a9b4d989e20c4270673e135414b8 100644
--- a/src/domain/regions/edits.test.ts
+++ b/src/domain/regions/edits.test.ts
@@ -5,12 +5,14 @@ import {
   applyEdits,
   emptyEdits,
   exportAreas,
+  isNewKey,
   kmlEdit,
   newKey,
   parseEdits,
   rebaseAfterSave,
   record,
   redo,
+  regionsChanged,
   regionKey,
   saveRequest,
   serialiseEdits,
@@ -328,6 +330,76 @@ describe('keeping staged edits in the browser', () => {
   });
 });
 
+// Plan 8M-11C, S31: what "Edit regions · 3 unsaved" and the editor's line count.
+describe('the regions the staged edits change', () => {
+  const bases = { [W]: versionOf(1), [E]: versionOf(2) };
+
+  // Review C6: one rule for a new region's key, which the count and `record` read.
+  it('know a new region by its key', () => {
+    expect(isNewKey(newKey(0))).toBe(true);
+    expect(isNewKey(newKey(12))).toBe(true);
+    expect(isNewKey(regionKey(3))).toBe(false);
+    expect(isNewKey('n')).toBe(false);
+    expect(isNewKey('nx')).toBe(false);
+  });
+
+  it('are counted once each, however many steps changed them', () => {
+    expect(regionsChanged(emptyEdits())).toBe(0);
+    const state = staged(
+      { kind: 'outline', key: W, outline: WEST, bases },
+      { kind: 'remove', key: E, forum: 'keep', bases },
+      { kind: 'restore', key: E, bases },
+      { kind: 'outline', key: W, outline: EAST, bases },
+    );
+    expect(state.edits).toHaveLength(4);
+    expect(regionsChanged(state)).toBe(2);
+  });
+
+  it('count a split as both its parts, and a batch by what is in it', () => {
+    expect(
+      regionsChanged(
+        staged({ kind: 'split', key: W, keep: WEST, newKey: newKey(0), other: EAST, bases }),
+      ),
+    ).toBe(2);
+    expect(
+      regionsChanged(
+        staged({
+          kind: 'batch',
+          edits: [
+            { kind: 'outline', key: W, outline: WEST, bases },
+            { kind: 'outline', key: E, outline: EAST, bases },
+          ],
+        }),
+      ),
+    ).toBe(2);
+  });
+
+  it('leave out what is undone, a new region removed again and a region taken as theirs', () => {
+    const added = staged(
+      { kind: 'add', key: newKey(0), outline: EAST, channel: null, description: null },
+      { kind: 'outline', key: W, outline: EAST, bases },
+    );
+    expect(regionsChanged(added)).toBe(2);
+    expect(regionsChanged(undo(added))).toBe(1);
+    expect(
+      regionsChanged(
+        staged(
+          { kind: 'add', key: newKey(0), outline: EAST, channel: null, description: null },
+          { kind: 'remove', key: newKey(0), forum: 'keep', bases: {} },
+        ),
+      ),
+    ).toBe(0);
+    expect(
+      regionsChanged(
+        staged(
+          { kind: 'outline', key: W, outline: EAST, bases },
+          { kind: 'take-theirs', key: W, version: versionOf(1) },
+        ),
+      ),
+    ).toBe(0);
+  });
+});
+
 describe('regions changed by somebody else', () => {
   it('are told by the version they were loaded as', () => {
     const state = staged({
diff --git a/src/domain/regions/edits.ts b/src/domain/regions/edits.ts
index a98a6199245a7718f5dedbeb060ebfb13a0d4de3..dc552293163252637e2af4518b670332a79c186b 100644
--- a/src/domain/regions/edits.ts
+++ b/src/domain/regions/edits.ts
@@ -3,8 +3,20 @@ import type { LatLon } from '@pine/wayspot-core/lat-lon';
 import type { Point, SaveRequest } from '../web/editor-data.js';
 import { channelKey } from './region-import.js';
 import { MAX_NEW_CATEGORY } from './save-plan.js';
+import { isNewKey, newKey } from './staged-format.js';
 import { normalisedOutline, regionVersion, roundSix } from './version.js';
 
+// The staged edits as the browser keeps them, and what the map counts of them (plan 8M-11C),
+// live in a module that imports nothing at run time, so that the map's page takes it whole.
+export {
+  emptyEdits,
+  isNewKey,
+  newKey,
+  parseEdits,
+  regionsChanged,
+  serialiseEdits,
+} from './staged-format.js';
+
 /**
  * A description cut to what a save takes as a new channel's category (`MAX_NEW_CATEGORY`
  * UTF-16 units, as the page's field counts them), never through the middle of a character.
@@ -120,12 +132,6 @@ export const MAX_UNDO_STEPS = 200;
 
 /** The key of a loaded region. */
 export const regionKey = (id: number): string => `r${id}`;
-/** The key of the `n`-th new region. */
-export const newKey = (n: number): string => `n${n}`;
-
-export function emptyEdits(): EditState {
-  return { edits: [], undone: [], next: 0 };
-}
 
 /** The keys of new regions an edit makes. */
 function madeKeys(edit: Edit): string[] {
@@ -162,10 +168,7 @@ const stepEdits = (edit: Edit): Edit[] => (edit.kind === 'batch' ? edit.edits :
 export function record(state: EditState, edit: Edit, when?: { at: number }): EditState {
   const at = when?.at;
   const made = normalised(edit);
-  const numbers = madeKeys(made).flatMap((key) => {
-    const n = /^n(\d+)$/.exec(key)?.[1];
-    return n === undefined ? [] : [Number(n)];
-  });
+  const numbers = madeKeys(made).flatMap((key) => (isNewKey(key) ? [Number(key.slice(1))] : []));
   const last = state.edits[state.edits.length - 1];
   const sameStep =
     made.kind === 'outline' &&
@@ -402,86 +405,6 @@ export function draftName(draft: Draft): string | undefined {
   return 'id' in draft.channel ? draft.channel.name : draft.channel.create;
 }
 
-/** The format of what is kept in the browser; another is not read. */
-const FORMAT = 1;
-
-/** The staged edits as the browser keeps them (`localStorage`). */
-export function serialiseEdits(state: EditState): string {
-  const { edits, undone, next } = state;
-  return JSON.stringify({ v: FORMAT, edits, undone, next });
-}
-
-const isObject = (value: unknown): value is Record<string, unknown> =>
-  typeof value === 'object' && value !== null && !Array.isArray(value);
-const isText = (value: unknown): value is string => typeof value === 'string';
-const isTextOrNull = (value: unknown): boolean => value === null || isText(value);
-const isOutline = (value: unknown): value is LatLon[] =>
-  Array.isArray(value) &&
-  value.every(
-    (point) => isObject(point) && Number.isFinite(point.lat) && Number.isFinite(point.lon),
-  );
-const isBases = (value: unknown): boolean => isObject(value) && Object.values(value).every(isText);
-const isChannel = (value: unknown): boolean =>
-  value === null ||
-  (isObject(value) &&
-    ((isText(value.id) && isText(value.name)) || (value.id === undefined && isText(value.create))));
-const isForum = (value: unknown): boolean => value === 'keep' || value === 'delete';
-
-/** Whether a value read back is an edit this code made. */
-function isEdit(value: unknown): value is Edit {
-  if (!isObject(value)) return false;
-  switch (value.kind) {
-    case 'add':
-      return (
-        isText(value.key) &&
-        isOutline(value.outline) &&
-        isChannel(value.channel) &&
-        isTextOrNull(value.description)
-      );
-    case 'outline':
-      return isText(value.key) && isOutline(value.outline) && isBases(value.bases);
-    case 'details':
-      return isText(value.key) && isChannel(value.channel) && isTextOrNull(value.description);
-    case 'remove':
-      return isText(value.key) && isForum(value.forum) && isBases(value.bases);
-    case 'restore':
-      return isText(value.key) && isBases(value.bases);
-    case 'split':
-      return (
-        isText(value.key) &&
-        isOutline(value.keep) &&
-        isText(value.newKey) &&
-        isOutline(value.other) &&
-        isBases(value.bases)
-      );
-    case 'swap':
-      return isText(value.a) && isText(value.b) && isBases(value.bases);
-    case 'take-theirs':
-    case 'keep-mine':
-      return isText(value.key) && isText(value.version);
-    case 'batch':
-      return Array.isArray(value.edits) && value.edits.every(isEdit);
-    default:
-      return false;
-  }
-}
-
-/** Staged edits read back from the browser; undefined for anything this code did not write. */
-export function parseEdits(text: string): EditState | undefined {
-  let value: unknown;
-  try {
-    value = JSON.parse(text);
-  } catch {
-    return undefined;
-  }
-  if (!isObject(value) || value.v !== FORMAT) return undefined;
-  const { edits, undone, next } = value;
-  if (!Array.isArray(edits) || !edits.every(isEdit)) return undefined;
-  if (!Array.isArray(undone) || !undone.every(isEdit)) return undefined;
-  if (typeof next !== 'number' || !Number.isInteger(next) || next < 0) return undefined;
-  return { edits, undone, next };
-}
-
 /**
  * The staged edits left after a save, full or partial (spec 6): the drafts as they were, against
  * the regions the server has now. What it has as the draft has it (an outline saved, a region
diff --git a/src/domain/regions/staged-format.ts b/src/domain/regions/staged-format.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0a553b49332bc4d3e32d2f83d52b98bbb7c9b4a3
--- /dev/null
+++ b/src/domain/regions/staged-format.ts
@@ -0,0 +1,137 @@
+import type { LatLon } from '@pine/wayspot-core/lat-lon';
+import type { Edit, EditState } from './edits.js';
+
+/**
+ * The region editor's staged edits as the browser keeps them (spec 4.4, `serialiseEdits`,
+ * `parseEdits`), an empty state, and how many regions they change (plan 8M-11C, S31,
+ * `regionsChanged`): what the map's page reads of them for "Edit regions · 3 unsaved". Imports
+ * nothing at run time (`src/web/page-imports.test.ts`), so that the map's bundle takes it whole;
+ * `edits.ts` gives the rest of the staged edits and passes these on.
+ */
+
+/** The key of the `n`-th new region. */
+export const newKey = (n: number): string => `n${n}`;
+
+/** Whether a key is a new region's (`newKey`), not a loaded region's (`regionKey`). */
+export const isNewKey = (key: string): boolean => /^n\d+$/u.test(key);
+
+export function emptyEdits(): EditState {
+  return { edits: [], undone: [], next: 0 };
+}
+
+/**
+ * How many regions the staged edits change (plan 8M-11C, S31: "Edit regions · 3 unsaved" and the
+ * editor's line), not how many steps: every region an edit made (not undone) touches, by key, in
+ * the order of the edits; a new region removed again, and a region taken as somebody else has it
+ * (`take-theirs`), count no more. Read from the edits alone, so that the map counts them without
+ * the editor's data.
+ */
+export function regionsChanged(state: EditState): number {
+  const keys = new Set<string>();
+  const count = (edit: Edit): void => {
+    switch (edit.kind) {
+      case 'take-theirs':
+        keys.delete(edit.key);
+        return;
+      case 'remove':
+        if (isNewKey(edit.key)) keys.delete(edit.key);
+        else keys.add(edit.key);
+        return;
+      case 'split':
+        keys.add(edit.key);
+        keys.add(edit.newKey);
+        return;
+      case 'swap':
+        keys.add(edit.a);
+        keys.add(edit.b);
+        return;
+      case 'batch':
+        for (const inner of edit.edits) count(inner);
+        return;
+      default:
+        keys.add(edit.key);
+    }
+  };
+  for (const edit of state.edits) count(edit);
+  return keys.size;
+}
+
+/** The format of what is kept in the browser; another is not read. */
+const FORMAT = 1;
+
+/** The staged edits as the browser keeps them (`localStorage`). */
+export function serialiseEdits(state: EditState): string {
+  const { edits, undone, next } = state;
+  return JSON.stringify({ v: FORMAT, edits, undone, next });
+}
+
+const isObject = (value: unknown): value is Record<string, unknown> =>
+  typeof value === 'object' && value !== null && !Array.isArray(value);
+const isText = (value: unknown): value is string => typeof value === 'string';
+const isTextOrNull = (value: unknown): boolean => value === null || isText(value);
+const isOutline = (value: unknown): value is LatLon[] =>
+  Array.isArray(value) &&
+  value.every(
+    (point) => isObject(point) && Number.isFinite(point.lat) && Number.isFinite(point.lon),
+  );
+const isBases = (value: unknown): boolean => isObject(value) && Object.values(value).every(isText);
+const isChannel = (value: unknown): boolean =>
+  value === null ||
+  (isObject(value) &&
+    ((isText(value.id) && isText(value.name)) || (value.id === undefined && isText(value.create))));
+const isForum = (value: unknown): boolean => value === 'keep' || value === 'delete';
+
+/** Whether a value read back is an edit this code made. */
+function isEdit(value: unknown): value is Edit {
+  if (!isObject(value)) return false;
+  switch (value.kind) {
+    case 'add':
+      return (
+        isText(value.key) &&
+        isOutline(value.outline) &&
+        isChannel(value.channel) &&
+        isTextOrNull(value.description)
+      );
+    case 'outline':
+      return isText(value.key) && isOutline(value.outline) && isBases(value.bases);
+    case 'details':
+      return isText(value.key) && isChannel(value.channel) && isTextOrNull(value.description);
+    case 'remove':
+      return isText(value.key) && isForum(value.forum) && isBases(value.bases);
+    case 'restore':
+      return isText(value.key) && isBases(value.bases);
+    case 'split':
+      return (
+        isText(value.key) &&
+        isOutline(value.keep) &&
+        isText(value.newKey) &&
+        isOutline(value.other) &&
+        isBases(value.bases)
+      );
+    case 'swap':
+      return isText(value.a) && isText(value.b) && isBases(value.bases);
+    case 'take-theirs':
+    case 'keep-mine':
+      return isText(value.key) && isText(value.version);
+    case 'batch':
+      return Array.isArray(value.edits) && value.edits.every(isEdit);
+    default:
+      return false;
+  }
+}
+
+/** Staged edits read back from the browser; undefined for anything this code did not write. */
+export function parseEdits(text: string): EditState | undefined {
+  let value: unknown;
+  try {
+    value = JSON.parse(text);
+  } catch {
+    return undefined;
+  }
+  if (!isObject(value) || value.v !== FORMAT) return undefined;
+  const { edits, undone, next } = value;
+  if (!Array.isArray(edits) || !edits.every(isEdit)) return undefined;
+  if (!Array.isArray(undone) || !undone.every(isEdit)) return undefined;
+  if (typeof next !== 'number' || !Number.isInteger(next) || next < 0) return undefined;
+  return { edits, undone, next };
+}
diff --git a/src/web/client/editor-mount.ts b/src/web/client/editor-mount.ts
index 68ce0c1f94d31ed912040f9f9252df703b466bc7..8743c6d96f32d85f6beae02a14c7e2609bb52be1 100644
--- a/src/web/client/editor-mount.ts
+++ b/src/web/client/editor-mount.ts
@@ -55,6 +55,15 @@ export interface EditorOpening {
   show(): boolean;
 }
 
+/**
+ * What the editor leaves as it closes (plan 8M-11C, review C4): where its map was, and how many
+ * regions its staged edits change (`regionsChanged`), which the account menu counts.
+ */
+export interface EditorClosed {
+  view: MapView;
+  unsaved: number;
+}
+
 /** Whether the editor opened, or the words of why not (the data route's refusal, C2). */
 export type EditorOpened = { ok: true } | { ok: false; words: string };
 
@@ -65,8 +74,8 @@ export interface EditorMount {
    * hosts shown and drawn; the staged edits kept by the browser as they are. Never rejects.
    */
   open(opening: EditorOpening): Promise<EditorOpened>;
-  /** Turns it off (its hosts are hidden by the map): where its map was. */
-  close(): MapView | undefined;
+  /** Turns it off (its hosts are hidden by the map): where its map was, what is unsaved. */
+  close(): EditorClosed | undefined;
 }
 
 declare global {
diff --git a/src/web/client/editor-toggle.test.ts b/src/web/client/editor-toggle.test.ts
index 424b6379a521381a3d6084d75944d154ce53fd7e..275edf577bb6e9b10452a9a2066680493bd69b2b 100644
--- a/src/web/client/editor-toggle.test.ts
+++ b/src/web/client/editor-toggle.test.ts
@@ -13,7 +13,9 @@ import {
   EditorToggle,
   editingAsked,
   editingOffered,
+  editItemLabel,
   editItemPressed,
+  unsavedCount,
   loadOnce,
   NOT_HERE_WORDS,
   OPENING_WORDS,
@@ -54,6 +56,29 @@ describe('who is offered "Edit regions" (C1, C6)', () => {
   });
 });
 
+// Plan 8M-11C, S31: what the browser holds for this server, by the regions it changes.
+describe('"Edit regions" with edits staged', () => {
+  // Review C4: once the editor was opened, its own count as it closed (a browser that keeps
+  // nothing still shows it); before, what the browser keeps.
+  it('counts from the editor once it closed, else from what the browser keeps', () => {
+    let read = 0;
+    const stored = () => {
+      read += 1;
+      return 2;
+    };
+    expect(unsavedCount(undefined, stored)).toBe(2);
+    expect(unsavedCount(5, stored)).toBe(5);
+    expect(unsavedCount(0, stored)).toBe(0);
+    expect(read).toBe(1);
+  });
+
+  it('says how many regions are unsaved, and nothing more without any', () => {
+    expect(editItemLabel(0)).toBe('Edit regions');
+    expect(editItemLabel(1)).toBe('Edit regions · 1 unsaved');
+    expect(editItemLabel(3)).toBe('Edit regions · 3 unsaved');
+  });
+});
+
 // Plan 8M-11C, S29: one rule for the menu, the address and the stylesheet (`phone-header.test.ts`
 // holds `map.css` to `EDITOR_MEDIA`).
 describe('where the editor is offered (S29)', () => {
@@ -228,7 +253,7 @@ function toggleWith(
     },
     close() {
       calls.push('close');
-      return { lat: 40.5, lon: -80, zoom: 9 };
+      return { view: { lat: 40.5, lon: -80, zoom: 9 }, unsaved: 3 };
     },
   };
   const toggle = new EditorToggle({
@@ -364,6 +389,7 @@ describe('turning the editor on and off (C4, C8)', () => {
 
   it('turned off, shows the live map and hands it the editor’s view', async () => {
     const made = toggleWith();
+    expect(made.toggle.unsaved).toBeUndefined();
     const on = made.toggle.turnOn();
     (await made.opened()).show();
     made.answer({ ok: true });
@@ -371,6 +397,8 @@ describe('turning the editor on and off (C4, C8)', () => {
     made.toggle.turnOff();
     expect(made.calls).toEqual([OPENING, 'shown', 'close', 'live', 'back 9']);
     expect(made.toggle.on).toBe(false);
+    // What the editor left staged (plan 8M-11C, review C4), for the menu's count.
+    expect(made.toggle.unsaved).toBe(3);
     made.toggle.turnOff();
     expect(made.calls).toHaveLength(5);
   });
diff --git a/src/web/client/editor-toggle.ts b/src/web/client/editor-toggle.ts
index 0a996f4447a42d73c2cc3d489aa305da2d2b6ebf..9e72fafb30d5539e4cc7dd9f30ee36384ce0b3fa 100644
--- a/src/web/client/editor-toggle.ts
+++ b/src/web/client/editor-toggle.ts
@@ -2,6 +2,7 @@ import { EDIT_QUERY_NAME, EDIT_QUERY_VALUE } from '../../domain/web/editor-addre
 import {
   CLOSE_FORM_FIRST,
   EDITOR_FAILED,
+  type EditorClosed,
   type EditorMount,
   type EditorOpened,
   type EditorOpening,
@@ -24,6 +25,23 @@ export const NOT_HERE_WORDS =
  */
 export const OPENING_WORDS = 'Opening the region editor…';
 
+/**
+ * The account menu's item (S31): "Edit regions", with "· 3 unsaved" while the browser holds edits
+ * of this server's member that change three regions (`stagedRegions`).
+ */
+export function editItemLabel(unsaved: number): string {
+  return unsaved === 0 ? 'Edit regions' : `Edit regions · ${unsaved} unsaved`;
+}
+
+/**
+ * How many regions the menu counts as unsaved (review C4): once the editor was opened, its own
+ * count as it last closed (`fromEditor`), so that a browser that keeps nothing still shows it;
+ * before, what the browser keeps (`fromStorage`, asked only then).
+ */
+export function unsavedCount(fromEditor: number | undefined, fromStorage: () => number): number {
+  return fromEditor ?? fromStorage();
+}
+
 /** What the menu's item and the address need of the page. */
 export interface OfferPage {
   /** `editorFits` of the browser, asked at each use (a window resized, a mouse plugged in). */
@@ -195,6 +213,11 @@ export interface ToggleDeps {
 export class EditorToggle {
   private state: 'off' | 'opening' | 'on' = 'off';
   private mount: EditorMount | undefined;
+  /**
+   * How many regions the editor's staged edits changed as it last closed (review C4); none
+   * before it was first closed.
+   */
+  unsaved: number | undefined;
 
   constructor(private readonly deps: ToggleDeps) {}
 
@@ -238,18 +261,24 @@ export class EditorToggle {
       this.state = 'on';
       return;
     }
-    if (shown) this.mount?.close();
+    if (shown) this.closed(this.mount?.close());
     this.refused(heldMeanwhile ? CLOSE_FORM_FIRST : opened.words, shown);
   }
 
   turnOff(): void {
     if (this.state !== 'on') return;
-    const view = this.mount?.close();
+    const view = this.closed(this.mount?.close());
     this.state = 'off';
     this.deps.shown(false, true);
     this.deps.handBack(view);
   }
 
+  /** What the editor left as it closed: its count kept, its view given. */
+  private closed(left: EditorClosed | undefined): MapView | undefined {
+    if (left) this.unsaved = left.unsaved;
+    return left?.view;
+  }
+
   /** Off with `words` said; the focus moved only when the editor had been shown (R1). */
   private refused(words: string, wasShown: boolean): void {
     this.state = 'off';
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index 0a7f2c596cb46f29ba99e988ee4a4792323e1ebd..56278666bb146ccb412feb873ebd10293581297f 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -34,7 +34,6 @@ import {
   saveBody,
   saveReadiness,
   splitPartner,
-  storageKey,
   stretchTitle,
   coverageSummary,
   fixBoxPadding,
@@ -49,8 +48,10 @@ import {
   type ListedPiece,
   clusterWarns,
   placeLayers,
+  unsavedLine,
 } from './editor-view.js';
 import { wantedDots } from './gym-dots.js';
+import { storageKey } from './staged-storage.js';
 
 const p = (lat: number, lon: number): LatLon => ({ lat, lon });
 function square(south: number, west: number, north: number, east: number): LatLon[] {
@@ -736,3 +737,16 @@ describe("the editor's places", () => {
     expect(zoomedIn.map((item) => item.kind)).toEqual(['dot', 'dot']);
   });
 });
+
+// Plan 8M-11C, S31: the editor's line under its tools.
+describe("the editor's unsaved line", () => {
+  it('counts the regions with unsaved changes, and says nothing without any', () => {
+    expect(unsavedLine(0)).toBeUndefined();
+    expect(unsavedLine(1)).toBe(
+      '1 region has unsaved changes. It waits here until you save or undo it.',
+    );
+    expect(unsavedLine(3)).toBe(
+      '3 regions have unsaved changes. They wait here until you save or undo them.',
+    );
+  });
+});
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index 60d340ffab0297ee56e40f923725ea4b0825cdd6..d61e291eb5c8fbb01b6fdf65855b36d01555e46f 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -739,9 +739,16 @@ export function reopenRefusal(kept: string | undefined, userId: string): string
   return kept !== undefined && kept !== userId ? ACCOUNT_CHANGED : undefined;
 }
 
-/** Where the staged edits of a member are kept in the browser, per server. */
-export const storageKey = (guildId: string, userId: string): string =>
-  `pine-region-edits:${guildId}:${userId}`;
+/**
+ * The line under the editor's tools (plan 8M-11C, S31): how many regions have changes that wait
+ * in the browser (`regionsChanged`); nothing without any.
+ */
+export function unsavedLine(regions: number): string | undefined {
+  if (regions === 0) return undefined;
+  return regions === 1
+    ? '1 region has unsaved changes. It waits here until you save or undo it.'
+    : `${regions} regions have unsaved changes. They wait here until you save or undo them.`;
+}
 
 /** The name of an exported file: the server's name as letters, digits and hyphens, or its id. */
 export function exportFileName(guild: { id: string; name: string }): string {
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index d4d1fc8d3f8836aa044aa9a588c15fb480808972..3729d2d6c7a8131fb1d16a51d178ba7222018c9c 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -189,6 +189,18 @@
   color: var(--warning);
 }
 
+/*
+ * What waits in the browser (plan 8M-11C, S31), the panel's first line under the tools: quiet,
+ * on the panel's own ground, set apart from what follows by a line.
+ */
+#editor-panel .unsaved {
+  margin: 4px 0 8px;
+  padding-bottom: 8px;
+  border-bottom: 1px solid var(--line);
+  color: var(--text-soft);
+  font-size: 13px;
+}
+
 /* "No overlaps or gaps." (plan 8M-10, C11). */
 #editor-panel .clean {
   color: var(--going);
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index ca3be7577d5c5c0f0ac948d5bb3354a23ecb9336..e82540e7fabbf3496475f288c3af0471f9339080 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -11,6 +11,7 @@ import {
   rebaseAfterSave,
   record,
   redo,
+  regionsChanged,
   saveRequest,
   toLatLons,
   undo,
@@ -76,15 +77,20 @@ import {
   saveBody,
   saveReadiness,
   splitPartner,
-  storageKey,
   stretchTitle,
   type PickerState,
   type PlaceCounts,
   placeLayers,
   type PlaceLayer,
+  unsavedLine,
   type ReadAnswer,
 } from './editor-view.js';
-import { CLOSE_FORM_FIRST, EDITOR_FAILED, type EditorHosts, type MapView } from './editor-mount.js';
+import {
+  CLOSE_FORM_FIRST,
+  EDITOR_FAILED,
+  type EditorClosed,
+  type EditorHosts,
+} from './editor-mount.js';
 import { ClusteredPlaces } from './editor-places.js';
 import type { Me } from './notice.js';
 import { regionLabel, renderNode } from './popup.js';
@@ -93,6 +99,7 @@ import {
   browserStorage,
   readMoveTogether,
   readStaged,
+  storageKey,
   writeMoveTogether,
   writeStaged,
 } from './staged-storage.js';
@@ -487,9 +494,9 @@ class Editor {
 
   /**
    * Turned off (plan 8M-10; the map hides its hosts): a drawing under way is dropped, the staged
-   * edits stay. Where its map was.
+   * edits stay. Where its map was, and how many regions the staged edits change (review C4).
    */
-  hidden(): MapView {
+  hidden(): EditorClosed {
     this.splitting = undefined;
     if (!this.data.readOnly) this.map.pm.disableDraw();
     // Work in flight is not taken once hidden (review 1, F2): a fix shown or asked for is
@@ -499,7 +506,10 @@ class Editor {
     this.fixAsk += 1;
     this.closeFix();
     const center = this.map.getCenter();
-    return { lat: center.lat, lon: center.lng, zoom: this.map.getZoom() };
+    return {
+      view: { lat: center.lat, lon: center.lng, zoom: this.map.getZoom() },
+      unsaved: regionsChanged(this.state),
+    };
   }
 
   /** Its map fitted to the regions drawn, where there are any (W2). */
@@ -1034,6 +1044,10 @@ class Editor {
   private panel(): void {
     const panel = this.hosts.panel;
     panel.replaceChildren();
+    // What waits in the browser, first under the tools (plan 8M-11C, S31): by the regions the
+    // staged edits change, as "Edit regions · 3 unsaved" counts them on the map.
+    const unsaved = unsavedLine(regionsChanged(this.state));
+    if (unsaved !== undefined) panel.append(element('p', unsaved, 'unsaved'));
     if (this.dialog) panel.append(this.dialog);
     this.fixBox();
     const { reasons, warning, pieces } = this.checkedParts;
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 7e541383a9f17657a3943dd99c66d9ad0c37f87f..b557d30776244bb8916657ea31ba0229e1c93f46 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -7,10 +7,13 @@ import {
   EditorToggle,
   editingAsked,
   editingOffered,
+  editItemLabel,
   editItemPressed,
+  unsavedCount,
   loadOnce,
 } from './editor-toggle.js';
 import { editorFits } from './editor-media.js';
+import { browserStorage as stagedStorage, stagedRegions } from './staged-storage.js';
 import { showGymDots, type GymDots } from './gyms-ui.js';
 import { LayerRegistry, MAP_LAYERS, regionLabelsShown } from './layer-registry.js';
 import { showLayerControls } from './layers-ui.js';
@@ -197,6 +200,8 @@ function editorToggle(
   activity: MapActivity,
   account: { me: Me; held: () => boolean },
   load: MapLoad,
+  /** "Edit regions" drawn again with what the browser holds now (S31). */
+  editLabel: { redraw(): void },
 ): EditorToggle {
   const data = document.body.dataset;
   const back = byId('editor-back') as HTMLButtonElement;
@@ -243,7 +248,11 @@ function editorToggle(
         addressWith(location.pathname, location.search, location.hash, on),
       );
       activity.setEditing(on);
-      if (!on) map.invalidateSize();
+      if (!on) {
+        map.invalidateSize();
+        // What the editor left staged, counted again in the account menu (plan 8M-11C, S31).
+        editLabel.redraw();
+      }
       // The focus where the member goes on (F7): "Back to the map", or the account's menu; left
       // where it is on a refusal before the editor was shown (review 2, R1).
       if (!focus) return;
@@ -271,13 +280,33 @@ const editorHere = (): boolean => editorFits((query) => window.matchMedia(query)
 /**
  * The account menu's "Edit regions" (plan 8M-10, C7): built for the hint, shown where the editor
  * is offered (`map.css` under `EDITOR_MEDIA`, plan 8M-11C, S29), asked again at the click
- * (branch review W5).
+ * (branch review W5). It says how many regions the browser holds unsaved changes of for this
+ * server and member (plan 8M-11C, S31: `/api/me`'s `userId`), drawn again when the editor closes.
  */
-function editItem(toggle: EditorToggle, load: MapLoad): HTMLElement {
+function editItem(
+  toggle: EditorToggle,
+  load: MapLoad,
+  guild: string,
+  me: Me,
+  editLabel: { redraw(): void },
+): HTMLElement {
   const item = document.createElement('button');
   item.type = 'button';
   item.className = 'edit-regions';
-  item.textContent = 'Edit regions';
+  editLabel.redraw = () => {
+    // The editor's own count once it was opened (review C4), else what the browser keeps.
+    const unsaved = unsavedCount(toggle.unsaved, () =>
+      me.loggedIn && me.userId !== undefined
+        ? stagedRegions(
+            stagedStorage(() => window.localStorage),
+            guild,
+            me.userId,
+          )
+        : 0,
+    );
+    item.textContent = editItemLabel(unsaved);
+  };
+  editLabel.redraw();
   item.addEventListener('click', () => {
     editItemPressed({
       fits: editorHere,
@@ -310,14 +339,19 @@ function start(): void {
   });
   const asker: { me: Me; held: () => boolean } = { me: { loggedIn: false }, held: () => false };
   const load: MapLoad = { failed: false };
-  const toggle = editorToggle(map, guild, activity, asker, load);
+  const editLabel = {
+    redraw: () => {
+      // Drawn once "Edit regions" is built (`editItem`).
+    },
+  };
+  const toggle = editorToggle(map, guild, activity, asker, load, editLabel);
   // The layers (plan 8M-7): the member's choice kept per browser.
   const registry = new LayerRegistry(browserStorage());
   for (const layer of MAP_LAYERS) registry.register(layer);
   const controls = showLayerControls(registry, byId('layers'));
   const quiet = quietLine(map);
   const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links', 'map', (me) =>
-    editingOffered(me) ? [editItem(toggle, load)] : [],
+    editingOffered(me) ? [editItem(toggle, load, guild, me, editLabel)] : [],
   ).then((me) => {
     asker.me = me;
     return me;
diff --git a/src/web/client/notice.ts b/src/web/client/notice.ts
index 1b812d2d76a324ca777a87e3782528372d90538e..9f907a4ade0d1dc073070ab1087025a9f4cc8078 100644
--- a/src/web/client/notice.ts
+++ b/src/web/client/notice.ts
@@ -6,6 +6,11 @@ export type Me =
   | {
       loggedIn: true;
       name: string;
+      /**
+       * The member's id (plan 8M-11C, S31): whose staged region edits the browser keeps, which
+       * "Edit regions" counts. Absent from a server before it, where nothing is counted.
+       */
+      userId?: string;
       csrf: string;
       member: boolean;
       readOnly: boolean;
diff --git a/src/web/client/staged-storage.test.ts b/src/web/client/staged-storage.test.ts
index ea383b826b32db0f36d4f2fac945ea1aa5f6a28d..f14c54b24f64debf02c929b8a8be603592f39076 100644
--- a/src/web/client/staged-storage.test.ts
+++ b/src/web/client/staged-storage.test.ts
@@ -1,9 +1,11 @@
 import { describe, expect, it } from 'vitest';
-import { emptyEdits, newKey, record } from '../../domain/regions/edits.js';
+import { emptyEdits, newKey, record, serialiseEdits } from '../../domain/regions/edits.js';
 import {
   browserStorage,
   readMoveTogether,
   readStaged,
+  stagedRegions,
+  storageKey,
   writeMoveTogether,
   writeStaged,
   type KeyValueStorage,
@@ -110,3 +112,25 @@ describe('"Move shared corners together" (plan 8M-10, C13)', () => {
     expect(() => writeMoveTogether(undefined, false)).not.toThrow();
   });
 });
+
+// Plan 8M-11C, S31: "Edit regions · 3 unsaved" on the map, by the member `/api/me` names.
+describe("the regions staged for a server's member", () => {
+  it('are counted from what the browser keeps for that server and member alone', () => {
+    const storage = new MemoryStorage();
+    storage.items.set(storageKey('1', '2'), serialiseEdits(STAGED));
+    expect(stagedRegions(storage, '1', '2')).toBe(1);
+    expect(stagedRegions(storage, '1', '3')).toBe(0);
+    expect(stagedRegions(storage, '4', '2')).toBe(0);
+  });
+
+  it('are none where the browser keeps nothing or refuses to be read', () => {
+    const storage = new MemoryStorage();
+    storage.items.set(storageKey('1', '2'), serialiseEdits(STAGED));
+    storage.failing = true;
+    expect(stagedRegions(storage, '1', '2')).toBe(0);
+    expect(stagedRegions(undefined, '1', '2')).toBe(0);
+    storage.failing = false;
+    storage.items.set(storageKey('1', '2'), 'not ours');
+    expect(stagedRegions(storage, '1', '2')).toBe(0);
+  });
+});
diff --git a/src/web/client/staged-storage.ts b/src/web/client/staged-storage.ts
index 42928e158c1f2c87c53594995c9ce4518b7503d8..6ccbd15b2a152f546169f0e06410f78ab952c785 100644
--- a/src/web/client/staged-storage.ts
+++ b/src/web/client/staged-storage.ts
@@ -1,9 +1,17 @@
 import {
   emptyEdits,
   parseEdits,
+  regionsChanged,
   serialiseEdits,
-  type EditState,
-} from '../../domain/regions/edits.js';
+} from '../../domain/regions/staged-format.js';
+import type { EditState } from '../../domain/regions/edits.js';
+
+/**
+ * Where the staged edits of a member are kept in the browser, per server: the member's own key
+ * since plan 8M-2, so that no older key without a member exists to be read.
+ */
+export const storageKey = (guildId: string, userId: string): string =>
+  `pine-region-edits:${guildId}:${userId}`;
 
 /** What the page needs of `localStorage`. */
 export interface KeyValueStorage {
@@ -38,6 +46,19 @@ export function readStaged(storage: KeyValueStorage | undefined, key: string): E
   }
 }
 
+/**
+ * How many regions the edits a member staged for a server change (plan 8M-11C, S31: the map's
+ * "Edit regions · 3 unsaved", `regionsChanged`); none where the browser keeps nothing for the page
+ * or what it keeps is not ours.
+ */
+export function stagedRegions(
+  storage: KeyValueStorage | undefined,
+  guildId: string,
+  userId: string,
+): number {
+  return regionsChanged(readStaged(storage, storageKey(guildId, userId)));
+}
+
 /** Whether an error of the storage says that it is full (each browser names it its own way). */
 function isFull(err: unknown): boolean {
   const name = typeof err === 'object' && err !== null && 'name' in err ? err.name : undefined;
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index b79e3dfd79c871879aa7d8b58edd0e8e426fc124..30502231c6078996272c38a05758a3dad175567c 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -108,6 +108,9 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
       return {
         loggedIn: true,
         name: session.userName,
+        // Whose staged region edits the page counts in "Edit regions" (plan 8M-11C, S31): the
+        // browser keeps them per server and member. The member's own id, to themselves alone.
+        userId: session.userId,
         member,
         csrf: sessions.csrfToken(session),
         readOnly,
diff --git a/src/web/login.test.ts b/src/web/login.test.ts
index 4b0b48419700e131f03e34be16b7fe78fe7a2817..938773568c967adcc92daf991cd84773a9b88ce0 100644
--- a/src/web/login.test.ts
+++ b/src/web/login.test.ts
@@ -453,6 +453,8 @@ describe('who is asking', () => {
     expect(here).toEqual({
       loggedIn: true,
       name: 'Ash',
+      // Whose the page's staged region edits are (plan 8M-11C, S31).
+      userId: ASH,
       member: true,
       readOnly: false,
       mayEditRegions: false,
````

### Task 4: 8M-11C task 4: a shared corner deleted in every region that has it (S32)

Prototype commit: `d63ce95209c5025cc2323d744ab0cd2a21140358`

With "Move shared corners together" on, a corner deleted in Geoman's edit
mode (a right click) that other regions of this server share is deleted
in all of them as one batch, one step of undo (cornerRemoval decides
allow, stage or refuse, over sharedCornerRemoval and removedCorner in
shared-corners.ts: every corner at the point taken out
at six decimals, a closed ring closed again at its new first corner).
When one of them, the region's own included, would keep fewer than three
distinct corners, nothing is deleted: Geoman's removeVertexValidation
answers false before it removes anything, and the editor says "Not
deleted: <region> would have fewer than three corners."
(notDeletedWords). Regions staged for removal and other servers'
outlines are never touched; with the switch off, or a corner nobody
shares, a delete is the region's own edit as before.

**Files:**

```
 src/domain/regions/shared-corners.test.ts | 151 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/domain/regions/shared-corners.ts      |  67 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/editor-view.test.ts        |  10 ++++++++++
 src/web/client/editor-view.ts             |   7 +++++++
 src/web/client/editor.ts                  |  54 ++++++++++++++++++++++++++++++++++++++++++++++++++++++
 5 files changed, 287 insertions(+), 2 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/regions/shared-corners.test.ts src/web/client/editor-view.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff d63ce95209c5025cc2323d744ab0cd2a21140358 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11C task 4: a shared corner deleted in every region that has it (S32)`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/regions/shared-corners.test.ts b/src/domain/regions/shared-corners.test.ts
index 17caaa86c38fe6d79bd84634866da48ef9a188e5..c1878f0ad84027ae25d1d45fa058a60e8287de95 100644
--- a/src/domain/regions/shared-corners.test.ts
+++ b/src/domain/regions/shared-corners.test.ts
@@ -1,7 +1,14 @@
 import type { LatLon } from '@pine/wayspot-core/lat-lon';
 import { describe, expect, it } from 'vitest';
-import type { Draft } from './edits.js';
-import { cornerSharers, movedCorner, sharedCornerEdit } from './shared-corners.js';
+import { applyEdits, emptyEdits, record, undo, type Draft, type LoadedRegion } from './edits.js';
+import {
+  cornerRemoval,
+  cornerSharers,
+  movedCorner,
+  removedCorner,
+  sharedCornerEdit,
+  sharedCornerRemoval,
+} from './shared-corners.js';
 
 const p = (lat: number, lon: number): LatLon => ({ lat, lon });
 function square(south: number, west: number, north: number, east: number): LatLon[] {
@@ -112,3 +119,143 @@ describe('shared corners (plan 8M-10, C13)', () => {
     });
   });
 });
+
+// Plan 8M-11C, S32: a corner deleted with "Move shared corners together" on.
+describe('a shared corner deleted', () => {
+  const bases = (keys: readonly string[]) =>
+    Object.fromEntries(keys.map((key) => [key, `v${key}`]));
+  const TRIANGLE = draft('r4', [p(40.1, -80.0), p(40.15, -80.0), p(40.15, -79.99), p(40.1, -80.0)]);
+
+  it('leaves an outline without every corner at the point, still closed when it was', () => {
+    // West's corner at the point is its third: the ring keeps its first corner as its last.
+    expect(removedCorner(WEST.outline ?? [], CORNER)).toEqual([
+      p(40.0, -80.05),
+      p(40.1, -80.05),
+      p(40.0, -80.0),
+      p(40.0, -80.05),
+    ]);
+    // Its first corner (and so its closing one) taken: closed again at its new first.
+    expect(removedCorner(EAST.outline ?? [], p(40.0, -80.0))).toEqual([
+      p(40.1, -80.0),
+      p(40.1, -79.95),
+      p(40.0, -79.95),
+      p(40.1, -80.0),
+    ]);
+    // An open ring stays open.
+    expect(
+      removedCorner([p(40, -80), p(40.1, -80), p(40.1, -79.9), p(40, -79.9)], p(40, -80)),
+    ).toEqual([p(40.1, -80), p(40.1, -79.9), p(40, -79.9)]);
+  });
+
+  it('is refused for an outline left with fewer than three distinct corners', () => {
+    expect(removedCorner(TRIANGLE.outline ?? [], CORNER)).toBeUndefined();
+    expect(removedCorner([p(40, -80), p(40.1, -80), p(40.1, -79.9)], p(40, -80))).toBeUndefined();
+  });
+
+  it('is deleted in every region of the server that has it, as one batch', () => {
+    const removal = sharedCornerRemoval([WEST, EAST, NORTH], 'r1', CORNER, bases);
+    expect(removal).toEqual({
+      ok: true,
+      edit: {
+        kind: 'batch',
+        edits: [
+          {
+            kind: 'outline',
+            key: 'r1',
+            outline: removedCorner(WEST.outline ?? [], CORNER),
+            bases: { r1: 'vr1' },
+          },
+          {
+            kind: 'outline',
+            key: 'r2',
+            outline: removedCorner(EAST.outline ?? [], CORNER),
+            bases: { r2: 'vr2' },
+          },
+        ],
+      },
+    });
+  });
+
+  it('is one step of undo', () => {
+    const loaded = (one: Draft): LoadedRegion => ({
+      id: one.regionId ?? 0,
+      channelId: '1',
+      name: one.key,
+      category: null,
+      description: null,
+      outline: one.outline,
+      version: `v${one.key}`,
+    });
+    const removal = sharedCornerRemoval([WEST, EAST], 'r1', CORNER, bases);
+    if (!removal.ok) throw new Error('expected the corner deleted');
+    const state = record(emptyEdits(), removal.edit);
+    const outlines = (drafts: Draft[]) => drafts.map((one) => one.outline);
+    const regions = [loaded(WEST), loaded(EAST)];
+    expect(outlines(applyEdits(regions, state).drafts)).toEqual([
+      removedCorner(WEST.outline ?? [], CORNER),
+      removedCorner(EAST.outline ?? [], CORNER),
+    ]);
+    expect(outlines(applyEdits(regions, undo(state)).drafts)).toEqual([WEST.outline, EAST.outline]);
+  });
+
+  it('is refused whole when a region that has it would keep fewer than three corners', () => {
+    expect(sharedCornerRemoval([WEST, EAST, TRIANGLE], 'r1', CORNER, bases)).toEqual({
+      ok: false,
+      region: 'r4',
+    });
+    // The region it is deleted from counts too.
+    expect(sharedCornerRemoval([TRIANGLE, WEST], 'r4', CORNER, bases)).toEqual({
+      ok: false,
+      region: 'r4',
+    });
+  });
+
+  it('never touches a region staged for removal, nor one that only has it on a side', () => {
+    const removed = { ...EAST, removed: 'keep' as const };
+    expect(sharedCornerRemoval([WEST, removed, NORTH], 'r1', CORNER, bases)).toEqual({
+      ok: true,
+      edit: {
+        kind: 'outline',
+        key: 'r1',
+        outline: removedCorner(WEST.outline ?? [], CORNER),
+        bases: { r1: 'vr1' },
+      },
+    });
+  });
+});
+
+// Review C5: what the editor does with a corner Geoman is about to delete, decided in one place.
+describe('a corner about to be deleted', () => {
+  const bases = (keys: readonly string[]) =>
+    Object.fromEntries(keys.map((key) => [key, `v${key}`]));
+  const TRIANGLE = draft('r4', [p(40.1, -80.0), p(40.15, -80.0), p(40.15, -79.99), p(40.1, -80.0)]);
+
+  it('is left to Geoman with "Move shared corners together" off', () => {
+    expect(cornerRemoval(false, [WEST, EAST, TRIANGLE], 'r1', CORNER, bases)).toEqual({
+      kind: 'allow',
+    });
+  });
+
+  it('is left to Geoman where nobody shares it', () => {
+    expect(cornerRemoval(true, [WEST, EAST], 'r1', p(40.0, -80.05), bases)).toEqual({
+      kind: 'allow',
+    });
+  });
+
+  it('is refused, naming the region, where one that has it would keep fewer than three corners', () => {
+    expect(cornerRemoval(true, [WEST, EAST, TRIANGLE], 'r1', CORNER, bases)).toEqual({
+      kind: 'refuse',
+      region: 'r4',
+    });
+  });
+
+  it('is staged as one batch where every region that has it keeps three corners', () => {
+    const removal = sharedCornerRemoval([WEST, EAST], 'r1', CORNER, bases);
+    if (!removal.ok) throw new Error('expected the corner deleted');
+    expect(cornerRemoval(true, [WEST, EAST], 'r1', CORNER, bases)).toEqual({
+      kind: 'stage',
+      edit: removal.edit,
+    });
+    expect(removal.edit.kind).toBe('batch');
+  });
+});
diff --git a/src/domain/regions/shared-corners.ts b/src/domain/regions/shared-corners.ts
index 00467b2c8571b60406d9a007b48cb630ea4a7f33..83759568970903275b7c81c8887baffffab27854 100644
--- a/src/domain/regions/shared-corners.ts
+++ b/src/domain/regions/shared-corners.ts
@@ -40,6 +40,73 @@ export function movedCorner(outline: readonly LatLon[], from: LatLon, to: LatLon
   );
 }
 
+/**
+ * An outline without its corner at `at` (plan 8M-11C, S32): every corner at the point taken out,
+ * at six decimals as the editor keeps outlines (`normalisedOutline`); a closed ring (its last
+ * corner its first) stays closed, at its new first corner when the first was taken; an open one
+ * stays open. Undefined when fewer than three distinct corners would be left: no area.
+ */
+export function removedCorner(outline: readonly LatLon[], at: LatLon): LatLon[] | undefined {
+  const first = outline[0];
+  const last = outline[outline.length - 1];
+  const closed = outline.length > 1 && first && last ? samePoint(first, last) : false;
+  const ring = normalisedOutline(
+    (closed ? outline.slice(0, -1) : outline).filter((corner) => !samePoint(corner, at)),
+  );
+  // Taking a corner out can bring the first and last corners of an open list together.
+  const start = ring[0];
+  if (start && ring.length > 1 && samePoint(start, ring[ring.length - 1] ?? start)) ring.pop();
+  if (new Set(ring.map(({ lat, lon }) => `${lat} ${lon}`)).size < 3) return undefined;
+  return closed && start ? [...ring, { ...start }] : ring;
+}
+
+/**
+ * The staged edit of a corner deleted at `at` from the region `key` with "Move shared corners
+ * together" on (S32): every region of the server that has the corner too (`cornerSharers`: not
+ * one staged for removal, not one that has the point on a side) without it, the region's own
+ * first, as one `batch` (one step of undo); without a sharer, the region's own `outline` edit.
+ * Refused whole, naming the first region (its own first) that would keep fewer than three
+ * corners (`removedCorner`). Other servers' outlines are no drafts: they are never touched.
+ */
+export function sharedCornerRemoval(
+  drafts: readonly Draft[],
+  key: string,
+  at: LatLon,
+  bases: (keys: readonly string[]) => Bases,
+): { ok: true; edit: Edit } | { ok: false; region: string } {
+  const edits: Edit[] = [];
+  for (const region of [key, ...cornerSharers(drafts, key, at)]) {
+    const outline = drafts.find((draft) => draft.key === region)?.outline;
+    if (!outline) continue;
+    const left = removedCorner(outline, at);
+    if (left === undefined) return { ok: false, region };
+    edits.push({ kind: 'outline', key: region, outline: left, bases: bases([region]) });
+  }
+  const [own] = edits;
+  return { ok: true, edit: edits.length === 1 && own ? own : { kind: 'batch', edits } };
+}
+
+/**
+ * What the editor does with a region's corner Geoman is about to delete (plan 8M-11C, S32, review
+ * C5): with "Move shared corners together" off, or a corner nobody shares, `allow` (Geoman deletes
+ * it, the region's own edit, as before); shared, `refuse` naming the region that would keep fewer
+ * than three corners (nothing is deleted), or `stage` the batch that deletes it in every region
+ * that has it (`sharedCornerRemoval`).
+ */
+export function cornerRemoval(
+  moveTogether: boolean,
+  drafts: readonly Draft[],
+  key: string,
+  corner: LatLon,
+  bases: (keys: readonly string[]) => Bases,
+): { kind: 'allow' } | { kind: 'stage'; edit: Edit } | { kind: 'refuse'; region: string } {
+  if (!moveTogether || cornerSharers(drafts, key, corner).length === 0) return { kind: 'allow' };
+  const removal = sharedCornerRemoval(drafts, key, corner, bases);
+  return removal.ok
+    ? { kind: 'stage', edit: removal.edit }
+    : { kind: 'refuse', region: removal.region };
+}
+
 /**
  * The staged edit of a corner dragged from `from` to `to` with "Move shared corners together" on:
  * the dragged region's outline as it was drawn, and every region that had a corner at `from`
diff --git a/src/web/client/editor-view.test.ts b/src/web/client/editor-view.test.ts
index 56278666bb146ccb412feb873ebd10293581297f..639a67518f58bc33033cc756eee994ba5cbc4c73 100644
--- a/src/web/client/editor-view.test.ts
+++ b/src/web/client/editor-view.test.ts
@@ -49,6 +49,7 @@ import {
   clusterWarns,
   placeLayers,
   unsavedLine,
+  notDeletedWords,
 } from './editor-view.js';
 import { wantedDots } from './gym-dots.js';
 import { storageKey } from './staged-storage.js';
@@ -750,3 +751,12 @@ describe("the editor's unsaved line", () => {
     );
   });
 });
+
+// Plan 8M-11C, S32: a shared corner's deletion refused.
+describe('a shared corner not deleted', () => {
+  it('names the region that would be left without an area', () => {
+    expect(notDeletedWords('#east')).toBe(
+      'Not deleted: #east would have fewer than three corners.',
+    );
+  });
+});
diff --git a/src/web/client/editor-view.ts b/src/web/client/editor-view.ts
index d61e291eb5c8fbb01b6fdf65855b36d01555e46f..b8db70cc7528788467c14b4531f3be1789d37221 100644
--- a/src/web/client/editor-view.ts
+++ b/src/web/client/editor-view.ts
@@ -739,6 +739,13 @@ export function reopenRefusal(kept: string | undefined, userId: string): string
   return kept !== undefined && kept !== userId ? ACCOUNT_CHANGED : undefined;
 }
 
+/**
+ * Why a corner was not deleted with "Move shared corners together" on (plan 8M-11C, S32): a
+ * region that has it (`name`, `draftLabel`) would be left with fewer than three corners.
+ */
+export const notDeletedWords = (name: string): string =>
+  `Not deleted: ${name} would have fewer than three corners.`;
+
 /**
  * The line under the editor's tools (plan 8M-11C, S31): how many regions have changes that wait
  * in the browser (`regionsChanged`); nothing without any.
diff --git a/src/web/client/editor.ts b/src/web/client/editor.ts
index e82540e7fabbf3496475f288c3af0471f9339080..7a86a5778d7c05c08adcbecab090299191edd9b0 100644
--- a/src/web/client/editor.ts
+++ b/src/web/client/editor.ts
@@ -28,6 +28,7 @@ import { MAX_NEW_CATEGORY, MAX_NEW_CHANNEL_NAME } from '../../domain/regions/sav
 import {
   cornerSharers,
   movedCorner,
+  cornerRemoval,
   sharedCornerEdit,
 } from '../../domain/regions/shared-corners.js';
 import { splitOutline, type Split } from '../../domain/regions/split.js';
@@ -83,6 +84,7 @@ import {
   placeLayers,
   type PlaceLayer,
   unsavedLine,
+  notDeletedWords,
   type ReadAnswer,
 } from './editor-view.js';
 import {
@@ -302,6 +304,11 @@ class Editor {
    * the regions that share it, and where it was let go.
    */
   private cornerDrag: { key: string; from: LatLon; sharers: string[]; to?: LatLon } | undefined;
+  /**
+   * A shared corner being deleted (plan 8M-11C, S32): the region Geoman deletes it from and the
+   * batch that deletes it in every region that has it, for the `pm:edit` of that deletion.
+   */
+  private pendingRemoval: { key: string; edit: Edit } | undefined;
   /** "Move shared corners together": on unless the browser keeps it off (`readMoveTogether`). */
   private moveTogether: boolean;
   /** Fix all: waiting for the worker, or its question. */
@@ -781,6 +788,13 @@ class Editor {
       layer.on('pm:markerdragend', (event: { markerEvent: L.LeafletEvent }) => {
         this.cornerDropped(event.markerEvent.target as L.Marker);
       });
+      // A corner deleted (a right click in Geoman's edit mode): where others share it, they lose
+      // it too, or nothing is deleted (plan 8M-11C, S32).
+      if (!this.data.readOnly) {
+        layer.pm.setOptions({
+          removeVertexValidation: ({ marker }) => this.cornerRemovable(draft.key, marker),
+        });
+      }
       layer.addTo(this.regions);
       this.regionLayers.set(draft.key, layer);
     });
@@ -819,6 +833,17 @@ class Editor {
 
   /** A region reshaped or moved with Geoman's tools: its outline, staged. */
   private reshaped(key: string, layer: L.Polygon): void {
+    const removal = this.pendingRemoval;
+    this.pendingRemoval = undefined;
+    // A shared corner deleted (S32): the batch worked out before Geoman deleted it, one step of
+    // undo; every region drawn anew once Geoman is through (it took the corner from one alone).
+    if (removal?.key === key) {
+      this.edit(removal.edit);
+      window.setTimeout(() => {
+        this.redraw();
+      }, 0);
+      return;
+    }
     const outline = ringOf(layer);
     const drag = this.cornerDrag;
     this.cornerDrag = undefined;
@@ -860,6 +885,35 @@ class Editor {
     this.cornerDrag = { key, from, sharers };
   }
 
+  /**
+   * Whether Geoman may delete a region's corner (its `removeVertexValidation`, S32). With "Move
+   * shared corners together" off, or a corner nobody shares, yes: the region's own edit, as
+   * before. Shared, the deletion in every region that has it is worked out first: refused when
+   * one of them would keep fewer than three corners (nothing deleted, and why said), else kept
+   * for the `pm:edit` Geoman fires at once, and forgotten after this turn whatever Geoman did.
+   */
+  private cornerRemovable(key: string, marker: L.Marker): boolean {
+    this.pendingRemoval = undefined;
+    const at = marker.getLatLng();
+    const decided = cornerRemoval(
+      this.moveTogether,
+      this.applied.drafts,
+      key,
+      { lat: roundSix(at.lat), lon: roundSix(at.lng) },
+      (keys) => this.bases(keys),
+    );
+    if (decided.kind === 'allow') return true;
+    if (decided.kind === 'refuse') {
+      say(notDeletedWords(this.name(decided.region)));
+      return false;
+    }
+    this.pendingRemoval = { key, edit: decided.edit };
+    window.setTimeout(() => {
+      this.pendingRemoval = undefined;
+    }, 0);
+    return true;
+  }
+
   /** The corner dragged on: the sharers' outlines drawn with it where it is now. */
   private cornerDragged(marker: L.Marker): void {
     const drag = this.cornerDrag;
````

### Task 5: 8M-11C task 5: docs and the staging checklist

Prototype commit: `669def8ef6b022288ad2c5a65004f3d864da0a59`

web.md gets "The fix pass: the region editor (plan 8M-11C)" (S29 to
S32: the one rule and its query, the clustered places and their warning
rings, the unsaved count and line with /api/me's userId, a shared corner
deleted everywhere or not at all), and its 8M-10 section names the new
rule and refusal (and the clusters' shared ClusterLayer, the menu's count
from the editor as it closes, cornerRemoval); gyms-and-regions.md lists
shared-corners.ts among the
editor's pure parts, testing.md the new tests. The staging checklist
2026-10-28-phase-8m11c-staging.md, for one staff account on a desktop
(and a tablet emulated, Matt's phone for S29), also runs the 8M-10 steps
left unrun that one staff account can do: Geoman's drags, Fix… on a gap,
Fix all, the address's logged-out and blocked-geo parts, and a save.

**Files:**

```
 docs/architecture/gyms-and-regions.md                    |  2 +-
 docs/architecture/testing.md                             |  2 +-
 docs/architecture/web.md                                 | 16 +++++++++++++---
 docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md | 79 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 4 files changed, 94 insertions(+), 5 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 669def8ef6b022288ad2c5a65004f3d864da0a59 -- src test docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11C task 5: docs and the staging checklist`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/gyms-and-regions.md b/docs/architecture/gyms-and-regions.md
index 40b7d47c7e2bb0378c15c5a737a813753cb60836..afd821625d7839229c1149ed4537836189707859 100644
--- a/docs/architecture/gyms-and-regions.md
+++ b/docs/architecture/gyms-and-regions.md
@@ -39,6 +39,6 @@ Gyms held in memory and searched, which server a gym belongs to, gym administrat
 ## Regions
 
 - Regions are administered through `ctx.regionAdmin` (`RegionAdminService`, `src/services/region-admin-service.ts`): `preview`, `import`, `list`, `exported`, `remove`, under the `AdminLock` (`src/services/admin-lock.ts`) it shares with `GymAdminService`. An import creates channels and categories first (at most `MAX_NEW_CHANNELS` per import; each in the very category the plan named, by its id while it is there), writes every outline in one transaction (`RegionRepository.saveOutlines`), reloads both directories, takes back an orphan forum beside its channel or sets up a forum (`PartyService.setupForums(guildId, only)`), all inside the lock; what Discord still refuses for want of room (a race, the server's 500) is said plainly: `CreatedChannel`'s `category-full` (with the category's name, `NotImported.category`) or `server-full` (`channelLimitOf`, `src/discord/party-gateway.ts`: the server's code, or Invalid Form Body with `CHANNEL_PARENT_MAX_CHANNELS`, no other refusal of the parent), and a forum refused so says which category is full (`setupForums`' reason); nothing is written before staff press Import. A removal closes the region (`PartyStore.closeRegion`: an add for it throws `RegionClosedError`, which reports, meetups, trains and moves answer as no region), ends its parties, deletes the row (forum and summary ids from the locked row; `SavedRoutes` go by their foreign key), reloads, and keeps or deletes the forum. Regions are never deleted by themselves. Creating channels and deleting a forum need the staff member's own Manage Channels; audit-log reasons carry their id. `/region remove` asks in a dialog (plan 8Q, `removalDialog` in `src/commands/regions/remove.ts`; no `defer`): titled `Remove a region`, what goes with the region counted (`removalQuestion`, read within `DIALOG_READ_MS`), the text channel's line and the forum's, then `Submit removes it.`, channels named (`#west`, `regionInDialog` and `channelInDialog`), not mentioned. With a forum the staff member may delete, the required radio group `Its forum` (`FORUM_INPUT`) with nothing picked: Keep it as history (`Its posts are archived and locked.`) or Delete it (`Deletes every post in it for good.`); with one they may not delete (no Manage Channels, or rehearsal mode) no choice and the line that says it stays and why; without one, that line. Its custom id carries the region, `region:<region id>:remove` (`:keep` without the choice; then a per-open token `:~<token>`, left out at Submit): no pending request. Its Submit (`submitRemoval`, a `modal` of `regionControls`) is acknowledged privately, refuses deleting the forum in rehearsal mode and to staff without Manage Channels (as the press did, nothing removed), and answers `outcomeLines` in a message of its own; Discord's Cancel replaces Cancel, and the buttons of the question before plan 8Q find no request and say that it expired. `preview` takes the regions removed in the same save (`removing`, the region editor's): `planImport` counts their gyms among those left in no region.
-- The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, and the server's regions, the regions of its channels and the channels the save depends on compared with those the save was planned against, `regionsStamp` and `channelsStamp` of `src/web/editor-save.ts`, another server's regions and the server's other channels left out (plan 8M-6); then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use; `'editor'` words a new channel's name as typed in the panel, "a typo in a name", where a file's preview says "a typo in the file") and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`: the escapes of `plain` undone by `unplain` outside the code spans of derived names, so a typed backslash shows once). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits), `fix.ts` and `fix-all.ts` (Fix and "Fix all slivers", plan 8M-2F, with `lines.ts`: lines measured flat in metres); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
+- The region editor on Pine's web pages (plan 8M-2; `docs/architecture/web.md`, "The region editor") saves through the same service: its save is `planSave` (`src/domain/regions/save-plan.ts`, the areas of an import named by their channels' current names, and the removals), then `preview` and `save` (one run under the lock: the versions checked again inside it, and the server's regions, the regions of its channels and the channels the save depends on compared with those the save was planned against, `regionsStamp` and `channelsStamp` of `src/web/editor-save.ts`, another server's regions and the server's other channels left out (plan 8M-6); then the import's steps and each removal through the inner `importNow` / `removeNow`, which `import` and `remove` also run under the lock; audit-log reasons `region editor by <id>`), worded by `previewWords(…, 'editor')` / `outcomeWords` (`src/commands/regions/import.ts`, which `renderPreview` and `renderOutcome` also use; `'editor'` words a new channel's name as typed in the panel, "a typo in a name", where a file's preview says "a typo in the file") and `/region remove`'s `goesWith` / `outcomeLines`, as plain text (`plainWords`: the escapes of `plain` undone by `unplain` outside the code spans of derived names, so a typed backslash shows once). `/region edit` (`src/commands/regions/edit.ts`, only with `settings.web`) gives its address and a login link. The pure parts of the editor are in `src/domain/regions/`: `version.ts` (`regionVersion`), `coverage.ts` (overlaps, gaps, their areas, `newPieces`, `newProblems`), `split.ts` (`splitOutline`), `edits.ts` (the staged edits), `fix.ts` and `fix-all.ts` (Fix and "Fix all slivers", plan 8M-2F, with `lines.ts`: lines measured flat in metres); `shared-corners.ts` (corners several regions share, moved together, plan 8M-10, and deleted together, plan 8M-11C: `removedCorner`, `sharedCornerRemoval`); the web staff check reuses `isBotManagement`, the logic of `requireBotManagement`.
 - KML is read by pure code: `packages/wayspot-core/src/xml.ts` (a linear reader that never throws; DOCTYPE refused), `kml.ts` (`readKml`, `writeKml`, `kmlFiles`; at most `MAX_KML_AREAS` areas and `MAX_KML_CORNERS` corners in a file, descriptions as one line of plain text), `outline.ts` (`tidyOutline`: closed, latitude first, at most 5,000 corners, no self-crossing; checked by a longitude sweep), and `src/domain/regions/region-import.ts` (`planImport`, the channel a name stands for by the legacy rule, near misses, the room of categories and of the server: plan 8S-4. Discord allows `MAX_CATEGORY_CHANNELS` (50, forums included) in a category and `MAX_SERVER_CHANNELS` (500) in a server, and every region written without a forum gets one beside its channel. The forums of channels that exist take their room first; where the category is full, a channel that is no region yet leaves its area out (`category-full`, the category named: a forum in another category would not have the channel's permissions, so staff move channels out and import again), and a region that is one already gets its outline, its forum `forumBlocked` (the preview says "keeps no forum", `newForums` leaves it out, and the forum step's refusal names the full category). A new channel whose category has no room for it and its forum goes into the overflow category `<name> 2` (then `3` …, the name cut to `MAX_CHANNEL_NAME`): one of that name, without case, that has room, else a new one the areas after it share, which continues the full one (`PlannedCategory` `{ create, like }`; an existing overflow category carries `like` too, so one deleted before Import is made again as the full one's continuation: `createCategory` makes it with that category's permission overwrites and moves it right after it; Discord refusing the overwrites is `copy-refused`, said with both names, where the bot may create channels at all (else `no-permission`), and a continued category deleted meanwhile is `base-gone`: none is made without its permissions; one such refusal stands for every later area of that category in the run, unasked); `ImportPlan.overflow` says which category had how much room before the import, how much of it its regions' new forums take, and where how many went, and the preview says it in one line. What would take the server beyond its channels (a new category counted too) is left out, `server-full`. Nothing is planned beyond what Discord allows, so there is no warning of a crowded category any more). Gyms are tested against an outline's bounding box before the ring. The picture of a region is drawn from a simplified outline when the address would be too long; the stored outline never is.
 - `/bounds` is a members' command (the picture and the gym count of the region of the channel; `boundsMessage`: `### The area of <#channel>`, the count, the map as a gallery). `/find-region` answers with `findRegionMessage` (the sentence, the map, `OSM_ATTRIBUTION` in small print). Every message of `/region` is v2 (plan 8B-4, `REGION_COLOUR`): the preview of `/region import` and its outcome are one container (`### Import regions` and the sentences within `SENTENCES`, a line, **Would be imported** / **Left out** or **Imported** / **Not imported** within `IMPORT_LIST` and `LEFT_OUT_LIST`, `preview.txt` (of the outcome `outcome.txt`, `OUTCOME_FILE`) as a file component and a file of the message (`V2Message.files`) whenever a list or the sentences are cut, every line in it with channels by their names; **Not imported** has the larger room, the buttons inside; `importMessage`); the outcome of `/region remove` is a `regionQuestion`; answers go through `answerRegion`, and what the controls say (working, expired, cancelled, a refusal) through `sayRegion`. Forums that party rows name and no region has are `PartyService.orphanForums(guildId)`: named by `/region list` and `/admin setup-forums`, swept by `sweepPosts`. Region tests use `test/support/region-admin.ts` and `region-commands.ts`; the custom-id kind `region` belongs to the questions of `/region`.
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 7be4d01c25147198c3ab5f5a8a7181349e367549..fa4a0a1d52486fc8d0e06a7afb7e8efe532d36dc 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -92,7 +92,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. `showParties` drawing a list runs in `party-layer-draw.isolated.test.ts` (plan 8M-9A, reviews B1 to B9): Leaflet mocked down to layers and groups that say whether they are on the map, markers whose popup opens only there and tells the map before the layer (as Leaflet's), the circles drawn with their options; a page of `PageElement`s (attributes and `dataset`, the tree, simple selectors, bubbling clicks, the focus) with the document's own listeners (Escape, `visibilitychange`, which a test fires to have the list asked for again and drawn, `poll`); `fetch` answering `/api/parties` with the test's list; the theme, the list of what is on and the phone card stubbed (`fake.card`), and the hooks the party layer hands `raidUi` and `maxUi` taken as they are made (their `done`, `pickSpot`); route mode a stub of `trainUi`'s `spotClicked` (`fake.route`). It waits for each draw through `afterDraw`; its `started` takes an `activity` (`MapActivity`, plan 8M-10) to turn the region editor on and off under both pollers. The Power Spots' and PokéStops' dots (`showPlaces`) run over a Leaflet of dots and popups in `places-ui.isolated.test.ts`. Plan 8M-11B: the draw test records the lines drawn (`fake.shown.lines`, whose group says whether they are drawn now) and its map projects by a scale a test changes with `zoomedTo(pixels)`, which fires `zoomend` (a train's faint legs, its loop and its arrowheads); `train-line.test.ts` tests the legs and arrowheads over a projection of its own; `train-ui.isolated.test.ts` records the drag line (`dragLines`) and the held map (`map`: holds, held) for each way a drag ends; the gyms' layer (`showGymDots`) runs in `gyms-ui.isolated.test.ts` over a Leaflet of fakes that count the layers added to and taken off its group, the markers moved and a cluster's count written, with the party layer, `raid-forms`, `train-forms` and the theme mocked down to what it takes of them. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node.
-- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand (whether it asks is its `active()`, the page's `MapActivity` since plan 8M-10: visible and the region editor off); the region editor's toggle over a fake document and a fake mount (`editor-toggle.test.ts`, plan 8M-10); the reports at stops' popups, list, filters and forms over the cases of `src/web/client/stop-report-cases.ts`, plan 8M-9B, which the page never imports); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
+- `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand (whether it asks is its `active()`, the page's `MapActivity` since plan 8M-10: visible and the region editor off); the region editor's toggle over a fake document and a fake mount (`editor-toggle.test.ts`, plan 8M-10); the editor's places by layer, the warning ring of a cluster, the unsaved count and line, and where the editor is offered against `map.css` (plan 8M-11C: `editor-view.test.ts`, `editor-toggle.test.ts`, `staged-storage.test.ts`, `src/web/phone-header.test.ts`; `src/web/editor-clusters.test.ts` reads `editor.css`; the editor's clustered places over a Leaflet of fakes whose markers get a new element each time their group is put back on the map, as Leaflet's do, in `editor-places.isolated.test.ts`); the reports at stops' popups, list, filters and forms over the cases of `src/web/client/stop-report-cases.ts`, plan 8M-9B, which the page never imports); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 17d6630d89de820eb57ed2585b87cb6757aa7ccd..c3364622865ae72d88e1f8e28afddee2b7d64dab 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -221,11 +221,11 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m9b-stop-reports-map/design.md` (rulin
 Design: `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("Admins"); the brief's rulings C1 to C14 (`.superpowers/sdd/2026-10-28-phase-8m10-editor-toggle/design.md`). The editor's rules (versions, edits, coverage, Fix, the save) are those of the section above, unchanged; this is where it lives and how it looks.
 
 - **Who is offered it (C1):** `/api/me` answers `mayEditRegions`, a hint by the member as the directory keeps them (`MemberStanding.manageGuild`, from the member it fetched anyway; `memberStanding`), judged by `mayEditRegions(facts, userId, ownerId)` of `src/web/region-staff.ts`, the one rule `regionStaffAnswer` decides with (a bot management role or the owner, and Manage Server); false while Discord fails, and not concerned by the map's member role. A hint only: the editor's data route asks Discord fresh at every turn-on and decides. Going in by the address opens the editor whatever the hint says (read-only staff during an outage, `StaffSeen`).
-- **The toggle (C6, C7, C8; `editor-toggle.ts`, wired in `main.ts`):** "Edit regions" is an item of the account menu (`showAccount`'s `items`), built for a member with the hint whatever the width (`editingOffered`; branch review W5: a window widened after the load finds it), shown from 1024 pixels (`EDITOR_MIN_WIDTH`, where the header's row of layers shows; `map.css` hides it narrower, and its click checks the width again and says `NARROW_WORDS`). Turned on (`EditorToggle.turnOn`): "Opening the region editor…" said in `#notice` at once (`OPENING_WORDS`; the page shown with the editor empties it, a refusal takes its place); refused while a form of the map holds (`FormHold`: route mode, Meet…, a report's step 2, any form), at the press and again when the editor would be shown (a form opened while it loaded: `EditorOpening.show` answers false and nothing shows): "Close the form first."; the editor's script and stylesheet added once and both waited for (`loadOnce`: the stylesheet before anything shows; each file kept or tried again on its own, so that a failed one is added anew at the next press and a loaded script never runs twice, and a script that loaded without registering its mount is added anew: "The region editor could not be loaded. Try again in a moment.", `EDITOR_FAILED`); its data asked (`api/regions/edit`, `cache: no-cache`), a refusal turning it back off with the server's `{ error }` words (`RequestError`, `failureWords`, `src/web/client/request-error.ts`: `getJson` keeps them); then the page shown with it. Anything that fails after (the editor's map, its worker, its start) answers `EDITOR_FAILED`: the mount never rejects, a first build that failed is taken down, and the toggle closes an editor it showed and is off again, ready for the next press. Each toggle empties and hides `#notice` before the other side speaks (a line of the live map is not left over the editor, nor the editor's over the map), and puts the focus on "Back to the map", or back on the account menu's button when off. While it is on, `body.editing-regions` (`map.css`) hides the list pane, the read-only line, the layers' row, Report, List, Find and the item (`display: none`), and the live map under the editor's map at a size of its own (absolute over `#content`, `visibility: hidden`, never `display: none`: a window resized while editing never leaves it 0 by 0, branch review W1); its parties are not drawn anew meanwhile (`MapActivity.editingRegions`: the light/dark switch, a layer or the reports at stops leave the list waiting, drawn once the editor is off), so it is neither sized nor asks for posts; the editor's hosts (`#editor-bar` with "Back to the map" and `#editor-tools`, `#editor-map` with `role="region"` (the live map's `<main>` is hidden meanwhile), `#editor-panel`, hidden by `hidden` while off) show; the address keeps `?edit=regions` (`addressWith`, `replaceState`). "Back to the map" (`turnOff`): the editor closed, the live map shown at the editor's view (Leaflet's `setView` keeps it within the live map's least zoom and bounds), `invalidateSize`; the live layers come back as they were (they were never changed, only hidden), and the staged edits stay in the browser.
+- **The toggle (C6, C7, C8; `editor-toggle.ts`, wired in `main.ts`):** "Edit regions" is an item of the account menu (`showAccount`'s `items`), built for a member with the hint whatever the width (`editingOffered`; branch review W5: a window widened after the load finds it), shown where the editor is offered (since plan 8M-11C a screen of 1024 pixels or more with a mouse or trackpad, `EDITOR_MEDIA`, below; `map.css` hides it elsewhere, and its click asks again and says `NOT_HERE_WORDS`). Turned on (`EditorToggle.turnOn`): "Opening the region editor…" said in `#notice` at once (`OPENING_WORDS`; the page shown with the editor empties it, a refusal takes its place); refused while a form of the map holds (`FormHold`: route mode, Meet…, a report's step 2, any form), at the press and again when the editor would be shown (a form opened while it loaded: `EditorOpening.show` answers false and nothing shows): "Close the form first."; the editor's script and stylesheet added once and both waited for (`loadOnce`: the stylesheet before anything shows; each file kept or tried again on its own, so that a failed one is added anew at the next press and a loaded script never runs twice, and a script that loaded without registering its mount is added anew: "The region editor could not be loaded. Try again in a moment.", `EDITOR_FAILED`); its data asked (`api/regions/edit`, `cache: no-cache`), a refusal turning it back off with the server's `{ error }` words (`RequestError`, `failureWords`, `src/web/client/request-error.ts`: `getJson` keeps them); then the page shown with it. Anything that fails after (the editor's map, its worker, its start) answers `EDITOR_FAILED`: the mount never rejects, a first build that failed is taken down, and the toggle closes an editor it showed and is off again, ready for the next press. Each toggle empties and hides `#notice` before the other side speaks (a line of the live map is not left over the editor, nor the editor's over the map), and puts the focus on "Back to the map", or back on the account menu's button when off. While it is on, `body.editing-regions` (`map.css`) hides the list pane, the read-only line, the layers' row, Report, List, Find and the item (`display: none`), and the live map under the editor's map at a size of its own (absolute over `#content`, `visibility: hidden`, never `display: none`: a window resized while editing never leaves it 0 by 0, branch review W1); its parties are not drawn anew meanwhile (`MapActivity.editingRegions`: the light/dark switch, a layer or the reports at stops leave the list waiting, drawn once the editor is off), so it is neither sized nor asks for posts; the editor's hosts (`#editor-bar` with "Back to the map" and `#editor-tools`, `#editor-map` with `role="region"` (the live map's `<main>` is hidden meanwhile), `#editor-panel`, hidden by `hidden` while off) show; the address keeps `?edit=regions` (`addressWith`, `replaceState`). "Back to the map" (`turnOff`): the editor closed, the live map shown at the editor's view (Leaflet's `setView` keeps it within the live map's least zoom and bounds), `invalidateSize`; the live layers come back as they were (they were never changed, only hidden), and the staged edits stay in the browser.
 - **Nothing polled (C9):** `MapActivity` (`parties.ts`) says whether the live map is in use: the page visible and the editor off. The pollers of the parties and of the reports at stops ask `Poller`'s `active()` (formerly `visible()`) and are told `activeChanged()` at each change (`PartyFrame.activity`, `StopReportLayerDeps.activity`); off, both ask at once. The places in view are asked only as the live map moves; the hidden map can still move (a window resized, a light/dark switch), so its moves and resizes while the editor is on ask for no places, set no zoom limits and store no last view (`MapActivity.whenLive`, re-review V1: wrapped round `showPlaces`' and `placeTheMap`'s handlers), and each that was missed is done once when the editor turns off. A page opened by the address starts its pollers once before the editor turns on (it waits for the live map's view and `/api/me`).
 - **Loading (C3):** the editor stays its own IIFE (`editor.ts`, no chunk), named on the map page in `data-editor-script`, `data-editor-style` and `data-worker`; it registers one typed mount, `window.pineRegionEditor` (`EditorMount`, `src/web/client/editor-mount.ts`, types and the two sentences both sides say only), which the map opens with its hosts, the member (`Me`), the units, the tiles and the live map's view, and closes. It bundles its own Leaflet (which sets `window.L` to itself as it loads) and Geoman (which patches that one); the map's code reads its Leaflet only through its imports, never `window.L`.
 - **Its own map in place (C4):** the editor keeps its Leaflet map in `#editor-map`, built at the first opening at the live map's center and zoom, without limits, and kept while hidden; while the live map could not be loaded (or has no view yet) the opening has no view (`EditorOpening.view` undefined, branch review W2): a first build starts at `START_VIEW` and is fitted to its regions (`firstView`, as the editor's own page did), a later opening keeps its own view. Every opening asks for the data anew (the staff check, fresh); data that names another member than the one the editor was first opened for is refused before anything shows, "You are logged in as someone else now: reload the page." (`reopenRefusal`, W6: one member's staged edits are never shown or saved as another's); else it takes it (`Editor.reopened`: the regions as the server has them, the staged edits applied, the places drawn anew only when they changed, Geoman's tools taken away while read-only and given back); closing (`hidden`) drops a drawing under way and a fix shown or asked for, makes the worker's late answers stale (`seq` and `fixAsk` moved on, the check's timer cleared) and gives back the view; hidden, the editor says nothing and moves no map. "Back to the map" is off while a preview or a save is being sent (`whileSending`; its title says why), so that their answers, the reload and a preview again land in the editor.
-- **Addresses (C5, C6):** `/s/<guild>/regions/edit` keeps its staff check and its 401, 403 and 503 pages; staff are led (303) to `/s/<guild>/map?edit=regions`, also from a login link of `/region edit` (its POST lands on the address). The map then turns the editor on once the live map is drawn, or could not be (`editorByAddress`), and `/api/me` answered, whatever the hint (the data decides). Narrower than 1024 pixels (a phone opening the address) it shows the live map with "Edit regions on a wider screen (1024 pixels or more)." and drops the query: never a dead end. Today's editor never had a layout for phones; the spec leaves a phone layout out.
+- **Addresses (C5, C6):** `/s/<guild>/regions/edit` keeps its staff check and its 401, 403 and 503 pages; staff are led (303) to `/s/<guild>/map?edit=regions`, also from a login link of `/region edit` (its POST lands on the address). The map then turns the editor on once the live map is drawn, or could not be (`editorByAddress`), and `/api/me` answered, whatever the hint (the data decides). Where the editor is not offered (since plan 8M-11C narrower than 1024 pixels, or a touch screen as the main pointer: a phone or a tablet opening the address) it shows the live map with "Edit regions on a computer with a mouse and a screen 1024 pixels wide or more." and drops the query: never a dead end. Today's editor never had a layout for phones; the spec leaves a phone layout out.
 - **The look (C10):** the tool row in the place of the layers' row, led by "Back to the map", then Undo, Redo, Fix all slivers…, Load KML, Export KML, Save… (blurple) and the switch "Move shared corners together"; below 1280 pixels the title is "Pine" and the switch's words smaller, so that the header is one row from 1024 (measured in the preview). The panel as the map's side pane: quiet upper-case headings, the regions and the overlaps and gaps as rows, the selected region and Save's dialog as cards with a side bar, gray buttons, blurple for the step a dialog leads to (Save…, Apply, Save these changes), red for "Remove and delete its forum"; Geoman's icons turned light in dark. No sentence names a color: "1 outline cannot be saved.", "In no region: …", "#name: theirs is drawn dashed." stand beside a swatch of what is drawn (`Swatched`, `outsideLine`, `theirsLine`; `.swatch-broken`, `-outside`, `-theirs` in `editor.css`, colored by `theme.css`).
 - **"No overlaps or gaps." (C11, Matt's note c):** said where the list would be only after a check that went through and found none (`coverageSummary`), never while the next check is worked out, before the first, or after a check or the worker failed.
 - **Fix in view (C12, Matt's note d):** Fix… and Fix all slivers… show in a box pinned over the editor map's top right corner, under the layer switch (a Leaflet control taking its own clicks and scrolls; `--fix-box-width`), as a card: its choices scroll inside it, its buttons (Apply, Cancel; Leave it, Stop here, Cancel) stay at its foot. The map is fitted to the stretch in the part the box leaves free (`fixBoxPadding`: a narrow map keeps a third of its width for the stretch), once the box shows the choices. Its redraws never drop the focus to the page (branch review W3): shown, or its title changed, the focus goes to its title (`tabindex=-1`) or, without one, its first choice; drawn anew with the focus inside, it stays on the button of the same words; a new question of Fix all (another `question.number`, the first one too) takes the focus, where it was in the box or lost, to its first paragraph ("… fixed so far.", `.fix-lead`, `tabindex=-1`), so that a screen reader reads it under the same title and buttons (re-review V3: focus rather than `aria-live`, since the box's content is built anew at each redraw and a live region made with its content is not read); the rule is `fixFocus` (`editor-view.ts`); closed with the focus in it, it goes to `#editor-panel` (`tabindex=-1`, never replaced by the panel's redraws).
@@ -304,9 +304,19 @@ Design `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md`, "8M-11B"; fin
   - Route mode's dashed editing line is unchanged.
 - **The drag line (S24):** while a stop is dragged in the route editor, `TrainUiDeps.dragLine` shows its new legs: from the stop it would follow and to the one it would precede (`dropNeighbors`, `dropLegs` beside `dropPosition` in `train-forms.ts`: positions from 1, as `/route move` takes them; one leg at either end, none to a stop off the map), drawn again only when the position changes, dotted in the train's color (`2 9`, round caps, weight 5) on a layer of their own over route mode's line, and cleared when the drag ends by any path. The row under the pointer stays marked in the list.
 - **The held map (S25):** while a stop's handle is held, the map's `touchZoom` and `dragging` are off (`TrainUiDeps.holdMap`, `holdMap` of `train-forms.ts`), and the drag's end puts back only those that were on, once. Both end in `endDrag`: a drop (in place or elsewhere), Escape, `pointercancel`, `lostpointercapture`, an edit begun, the editor drawn anew and route mode ending.
-- **The gyms' clusters (S13):** a cluster is keyed by its zoom and cell (`cluster:<zoom>:<x>:<y>`), not by its gyms, and `planDots` (`gym-dots.ts`) turns what is drawn (`DrawnDot`: a cluster's count and place) into what is wanted with the least change: nothing where nothing changed (a poll that changes no gym redraws nothing), a cluster changed in place (`reshow` of `gyms-ui.ts`: its count's text and title only when the count changed, then `setLatLng`), the marker of a cluster no longer wanted given to a new one (a zoom, a pan), the rest added or taken off. The cell is `cellPixels(zoom)`: 60 from zoom 15, 90 at 13 and 14, 120 at 12 and below. Profiled over the 5,886 gyms of Pittsburgh's Wayfarer export (a 1200 by 800 view with the layer's margin): drawn at zoom 12 from 715 to 252; a zoom from 12 to 13 from about 1,380 markers made and taken off to about 210, with 224 moved; the work of a refresh was a few milliseconds before and after.
+- **The gyms' clusters (S13):** a cluster is keyed by its zoom and cell (`cluster:<zoom>:<x>:<y>`), not by its gyms, and `planDots` (`gym-dots.ts`) turns what is drawn (`DrawnDot`: a cluster's count and place) into what is wanted with the least change: nothing where nothing changed (a poll that changes no gym redraws nothing), a cluster changed in place (`reshow` of `ClusterLayer`, `cluster-layer.ts`, shared with the region editor: its count's text and title only when the count changed, then `setLatLng`), the marker of a cluster no longer wanted given to a new one (a zoom, a pan), the rest added or taken off. The cell is `cellPixels(zoom)`: 60 from zoom 15, 90 at 13 and 14, 120 at 12 and below. Profiled over the 5,886 gyms of Pittsburgh's Wayfarer export (a 1200 by 800 view with the layer's margin): drawn at zoom 12 from 715 to 252; a zoom from 12 to 13 from about 1,380 markers made and taken off to about 210, with 224 moved; the work of a refresh was a few milliseconds before and after.
 - **An invite for a visitor who is not a member:** `/api/me` carries `invite` (from `settings.web.invites`) only for somebody logged in whom the directory finds not in the server: nobody logged out (they may be a member who has not logged in), no member without the map's member role (they keep the role line), nobody while Discord cannot say (read-only). The header shows "Join the server on Discord" (`inviteNode` of `notice.ts`, `#account a.invite`; beside the line on a wide screen, on a line of its own under it on a phone, its words wrapping, branch review BR-2) under "You are not a member of this server." only (`headerLines`), opening the invite in a new tab with `rel="noopener"`. Pine calls Discord for nothing new and needs no permission: a paused or deleted invite fails as it would anywhere. After joining, a reload makes them a member within the directory's minute.
 
+## The fix pass: the region editor (plan 8M-11C)
+
+Design `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md`, "8M-11C"; findings S29 to S32 of the web polish's staging (follow-ups, "From the staging run of the web polish"). The editor's rules above hold but for what this section says.
+
+- **A computer with a mouse (S29):** the editor is offered where `(min-width: 1024px) and (pointer: fine)` holds (`EDITOR_MEDIA`, `src/web/client/editor-media.ts`, a module without the DOM's types; `editorFits` asks it of the browser's `matchMedia`): a screen of 1024 pixels or more whose main pointer is a mouse or a trackpad (a touch laptop with a trackpad qualifies; a large tablet does not). One rule for the three places that decide it: the menu's item (`editItemPressed`), the address `?edit=regions` (`editorByAddress`; both ask at each use: a window resized, a mouse plugged in) and `map.css`, which hides "Edit regions" but under that very query (CSS cannot import the constant: `src/web/phone-header.test.ts` holds the stylesheet's query to `EDITOR_MEDIA` word for word). Elsewhere: "Edit regions on a computer with a mouse and a screen 1024 pixels wide or more." (`NOT_HERE_WORDS`). The hint (`editingOffered`) still builds the item whatever the device.
+- **The places clustered (S30):** the editor's layer switch keeps its toggles (Gyms, Stops, Power Spots, Wayfarer gyms Pine did not take, other servers' regions, overlaps and gaps). The places are no longer drawn all at once: each layer of places is a `ClusteredPlaces` (`src/web/client/editor-places.ts`, bundled into the editor alone) that draws the view and half its size round it through the live map's clusterer, planning and Leaflet side (`ClusterLayer` of `src/web/client/cluster-layer.ts`, review C1, which the live map's gyms use too, `showGymDots`: a place's own dot from the caller, a cluster's marker changed in place or given to a new cluster, a tap zooming in, the `open` place never taken off, and an optional `ring(points)` that sets the class `outside` whenever Leaflet makes the cluster's element anew (its layer put back on the map), whenever the marker goes to another cluster and at `rings()`; over `wantedDots` and `planDots` of `gym-dots.ts`, `clustersAt` and `cellPixels` of `cluster.ts`: the same cells, 60 pixels from zoom 15, 90 at 13 and 14, 120 at 12 and below, places one by one from zoom 16), drawn anew at each `moveend` and when the switch turns a layer on (`overlayadd`); nothing is worked out for a layer that is off. A place is known by its index in the data's own list (`placeLayers` of `editor-view.ts`: `EditorData.gyms` for gyms, `EditorData.wayspots` for the rest), the index `placeCounts` names the places in no region by. A place's dot is made once, filled in its kind's color and edged in the warning color (`--outside`) while it lies in no region (`recolour` gives each layer the places in no region, `setOutside`: only the dots whose state changed are touched); a cluster is the live map's `.cluster` filled in its layer's color (`editor.css`: `.places-gyms`, `.places-stops`, `.places-powerspots`, `.places-wayfarer-gyms`), its ring in the warning color while one of its places lies in no region (`clusterWarns`, `.outside`), and a tap zooms in on it as on the live map. Every layer is clustered by the same grid and a cluster sits at the mean of its places, so the clusters of one cell sit near each other: each layer's is moved toward its own corner (`translate`, beside Leaflet's own `transform`; gyms top left, PokéStops top right, Power Spots bottom right, Wayfarer gyms bottom left; `src/web/editor-clusters.test.ts` keeps them apart), staying near its places (the review's ruling, C2). Tried in a preview with Pittsburgh's export round three regions (2,166 gyms and 14,618 Wayspots): at zoom 11 some 180 clusters with the Gyms and Power Spots layers, 280 with the Stops too.
+- **What is unsaved (S31):** `/api/me` answers `userId` to somebody logged in (their own id: whose staged edits the browser keeps; `Me.userId` is optional, for an answer of a server before it, which counts nothing). The account menu's item reads "Edit regions · 3 unsaved" while the browser holds staged edits of this server's member (`editItemLabel` over `stagedRegions` of `staged-storage.ts`, which never throws), drawn when the item is built and again whenever the editor closes (`editLabel.redraw`, from the toggle's `shown(false)`): once the editor was opened, by its own count as it closed (`EditorMount.close` gives `EditorClosed`, its view and `unsaved`, kept as `EditorToggle.unsaved`; `unsavedCount`, review C4), so that a browser that keeps nothing still shows it; before, from what the browser keeps. The count is the regions the edits change, not the steps (`regionsChanged` of `src/domain/regions/staged-format.ts`, beside the format the browser keeps the staged edits in, `parseEdits` and `serialiseEdits`, and `newKey` with `isNewKey`, which `regionsChanged` and `record` read (review C6), moved out of `edits.ts`, which passes them on: a module that imports nothing at run time, as what the map's page imports must be, `page-imports.test.ts`; read from the edits alone so that the map needs none of the editor's data: every region an edit not undone touches, a split both its parts, a batch what is in it; a new region removed again, and a region taken as somebody else has it, count no more; an edit drawn back to where it was still counts). The key is `storageKey` (moved to `staged-storage.ts`), `pine-region-edits:<guild>:<user>`, as it has been since plan 8M-2: no older key without a member exists to be read. In the editor the panel's first line, right under the tools, says "3 regions have unsaved changes. They wait here until you save or undo them." ("1 region has unsaved changes. It waits here until you save or undo it."; `unsavedLine`, `.unsaved`) by the same count, drawn with the panel at each edit, undo and redo. Back to the map leaves without asking, as before (Matt agreed: no warning).
+- **A shared corner deleted (S32):** with "Move shared corners together" on, a corner deleted in Geoman's edit mode (its right click) that other regions of this server have at the same point (`cornerSharers`) is deleted in all of them, as one `batch` of `outline` edits, one step of undo (`sharedCornerRemoval` beside `movedCorner` in `src/domain/regions/shared-corners.ts`, over `removedCorner(outline, at)`: every corner at the point taken out at six decimals, `normalisedOutline`, a closed ring closed again at its new first corner, an open one left open; undefined when fewer than three distinct corners would be left). The decision is taken before Geoman removes anything, in its `removeVertexValidation` (set on each region's layer; `cornerRemovable` over the pure `cornerRemoval(moveTogether, drafts, key, corner, bases)` of `shared-corners.ts`, review C5: `allow`, `stage` the batch, or `refuse` naming the region): when any of those regions, the region's own first, would keep fewer than three corners, it answers false, so that nothing is deleted (Geoman's removal never happens: there is nothing to put back), and the editor says "Not deleted: <region> would have fewer than three corners." (`notDeletedWords`, the region as `draftLabel` names it). Else the batch is kept for the `pm:edit` Geoman fires at once for that removal (`reshaped` stages it; it is forgotten after the turn whatever Geoman did), and every region is drawn anew on the next turn. Regions staged for removal and a region that has the point on a side only are not touched, nor other servers' outlines (they are no drafts); with the switch off, or a corner nobody shares, a delete is the region's own edit, as before (Geoman refuses a triangle's corner by itself, flashing the region).
+- **Tests:** `editor-toggle.test.ts` (the query, `editorFits`, the item's press and label, the address's refusal), `phone-header.test.ts` (the stylesheet's query), `editor-view.test.ts` (`placeLayers`, `clusterWarns` over `wantedDots`, `unsavedLine`, `notDeletedWords`), `editor-clusters.test.ts`, `editor-places.isolated.test.ts` (over Leaflet fakes whose elements are made anew as a layer is put back: rings after a layer is turned on again, `setOutside` while off, `setPlaces` on a reload, a marker given to another cluster, nothing worked out while off), `gyms-ui.isolated.test.ts` (the gyms over the same `ClusterLayer`), `staged-storage.test.ts` (`stagedRegions`), `editor-toggle.test.ts` (`unsavedCount`, the count kept at closing), `src/domain/regions/edits.test.ts` (`regionsChanged`), `src/domain/regions/shared-corners.test.ts` (`removedCorner`, `sharedCornerRemoval`, `cornerRemoval`, one step of undo), `login.test.ts` (`userId`). Leaflet and Geoman (the clusters drawn, the right click on a shared corner, the refusal, Undo, the switch off, the menu's count) were tried in a preview without Discord (headless Chrome; a touch screen emulated for S29) and are tried at staging (`docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md`).
+
 ## Adding a route
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. The only exception is the Wayspot export tool's `/userscript` (above), which belongs to no server; another address outside `/s/<guild>/` needs the same reason. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
diff --git a/docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md b/docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..446cc567037f189488d815480700dc1209013a04
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md
@@ -0,0 +1,79 @@
+# Phase 8M-11C staging checklist: the region editor
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives the map in its own tab as Googer; Matt's hand is needed where a step says so (a touch device, a right click Claude's tab cannot make).
+
+- **Accounts:** Googer (the owner, staff: Manage Server and a moderator role). One staff account is enough: no step needs Tester but step 6's glance.
+- **Brief:** `.superpowers/sdd/2026-10-28-phase-8m11c-region-editor/design.md`.
+- **Design:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11C: the region editor").
+- **Conventions:** `docs/architecture/web.md` ("The fix pass: the region editor (plan 8M-11C)", "The region editor on the map (plan 8M-10)", "The region editor (plans 8M-2, 8M-2F)").
+- **Devices:** a desktop browser with a mouse, light and dark, at 1280 and 1024 pixels and narrowed to 1023; the browser's device emulation of a tablet (touch) at 1280 or wider; Matt's phone for step 5.
+- **Findings:** each step names the finding it closes (S29 to S32, follow-ups "From the staging run of the web polish"). Steps 22 to 29 are the steps of `2026-10-28-phase-8m10-staging.md` left unrun on 2026-10-28 that one staff account can do (Geoman's drags, Fix… on a gap, Fix all, a save, the address's logged-out and blocked-geo parts).
+- **Do not save** on the test server but in step 28, which saves one small change and saves it back (Matt's go-ahead). Every other step stages edits and takes them back (Undo, or the browser's storage cleared).
+
+## Before
+
+0. **The page built, the bot started after it.** Run `npm run web:build`, then start (or restart) the bot: it reads `dist/web/assets.json` once at startup, and `/api/me` now answers `userId`. No migration, no setting, no command change: no deploy.
+1. **The test server's regions.** The dev database's regions of the test server (`var/stage/TEST-SERVER-STATE.md`, Pittsburgh's 28). Note:
+   - one corner two regions share (the outlines after a Fix all share theirs exactly), and if there is one, a corner three share;
+   - that the test server's regions are clean ("No overlaps or gaps."): steps 24 and 25 make a gap by moving a shared corner apart.
+2. **The browser's storage clean.** In devtools › Application › Local storage of the map's origin, no `pine-region-edits:<guild>:<Googer's id>` yet (or note what it holds).
+
+## A computer with a mouse (S29)
+
+3. **Desktop with a mouse.** As Googer at 1280: the account menu holds "Edit regions" above Log out. Narrow the window to 1023: the item is gone; widen it back to 1280 without a reload: it is back.
+4. **A touch screen, wide.** In devtools' device toolbar, a tablet in landscape at 1280 or wider (iPad Pro, 1366 by 1024, touch), reload:
+   - the account menu has no "Edit regions";
+   - open `/s/<guild>/map?edit=regions` in that tab: the live map, the line "Edit regions on a computer with a mouse and a screen 1024 pixels wide or more.", the address without `?edit=regions`, nothing broken (the list, Layers).
+   - Turn the device toolbar off and reload: the item is back.
+5. **The phone (Matt).** On the phone, `/region edit`'s button in Discord (or `/s/<guild>/regions/edit`): the live map with the same line, the address without `?edit=regions`.
+6. **Tester (glance, optional).** As Tester nothing changes: no "Edit regions", `?edit=regions` answers "Only staff of this server may edit its regions."
+
+## The places clustered (S30)
+
+7. **Zoomed out.** As Googer at 1280, "Edit regions" over the whole of Pittsburgh (zoom 11):
+   - the gyms and the Power Spots are circles with a count, each layer's in its own corner of a cell (gyms top left, Power Spots bottom right), filled in the color of its dots (gyms green, Power Spots purple);
+   - a cluster that holds a place in no region has an orange ring; one whose places are all in a region keeps the pale gray ring;
+   - "In no region: …" in the panel as before.
+   - The editor opened and draws without a freeze (on 2026-10-28 the first opening took 30 to 40 s with every place drawn at once: observation O1). Note how long it takes from "Edit regions" to the drawn map.
+8. **The layer switch.** Open the layer switch (top right):
+   - tick "Stops (many: off at first)": its clusters (blue, top right of each cell) appear at once;
+   - untick "Gyms": the gyms' clusters go; tick it again: back;
+   - "Wayfarer gyms Pine did not take", "Other servers' regions" and "Overlaps and gaps" toggle as before.
+9. **Zooming and panning.** Zoom in step by step to 16: the clusters split as the cells shrink (120 pixels at 12 and below, 90 at 13 and 14, 60 at 15), and from 16 every place is a dot, a place in no region edged in orange, its name on hover. Pan: the places come with the view, no freeze. A click on a cluster zooms in on its places.
+10. **The warning follows an edit.** In Geoman's edit mode, drag a corner of a region so that a gym near its border leaves it, and drop: that gym's dot (zoomed in) is edged in orange, and zoomed out the cluster that holds it gets an orange ring; Undo: both back to how they were.
+11. **Light and dark.** Switch the device to dark and back: the clusters' colors and counts readable in both, the rings visible.
+
+## What is unsaved (S31)
+
+12. **The line in the editor.** Stage three edits of two regions (move a corner of region B, then a corner of region A twice, more than two seconds apart; each a corner no other region shares, so that the move stays in its own region): the panel's first line, under the tools, says "2 regions have unsaved changes. They wait here until you save or undo them." Undo once: still 2 (region A's first move remains). Undo again: "1 region has unsaved changes. It waits here until you save or undo it." Redo twice: "2 regions …".
+13. **Back to the map.** "Back to the map": the live map at once, no question asked. Open the account menu: "Edit regions · 2 unsaved".
+14. **Kept per server and member.** In devtools' network, `/api/me` answers `userId` (Googer's id); in Local storage the key is `pine-region-edits:<guild>:<Googer's id>`. Reload the page: the menu still says "Edit regions · 2 unsaved".
+15. **Undone to nothing.** "Edit regions", Undo until Undo is off: no line in the panel. "Back to the map": the menu says "Edit regions" alone.
+16. **Where nothing is kept.** A private window logged in as Googer (its own storage): "Edit regions" without a count.
+
+## A shared corner deleted (S32)
+
+These need a right click on a corner in Geoman's edit mode (the pencil tool on the left); Claude's tab can do it with the browser's own right click, or Matt does.
+
+17. **In every region that has it.** "Move shared corners together" ticked. Right click the noted corner two regions share: it is gone from both outlines (one border straight across now), both regions staged; the panel's line says "2 regions have unsaved changes. They wait here until you save or undo them." (with nothing staged before). One Undo: both corners back, and the line gone. Redo: both gone, "2 regions …" again; Undo again.
+18. **Refused.** Draw a small triangle (Geoman's polygon tool, three corners) with one corner snapped onto the noted shared corner. Right click that corner: nothing is deleted from any region, and the line "Not deleted: new region (no channel yet) would have fewer than three corners." shows under the header. Right click one of the triangle's other corners (shared with nobody): Geoman flashes the triangle and deletes nothing, as before. Undo the triangle (it was one edit).
+19. **The switch off.** Untick "Move shared corners together" and right click the shared corner again: it goes from the region whose corner was clicked alone (a gap or overlap shows in the list once checked). Undo; tick the switch again.
+20. **Not shared.** A corner no other region has (and a corner of one region that lies on another's side, a T-junction): right click deletes it from its own region alone, as before. Undo.
+21. **Another server's outline (if one is drawn near the test server's regions):** a corner one of our regions shares with another server's dashed gray outline: right click deletes ours alone; the other server's outline stays.
+
+## The 8M-10 steps left (one staff account)
+
+From `2026-10-28-phase-8m10-staging.md`; not run on 2026-10-28 ("Not run: … 12-15 (Geoman drags and Fix… need a gap: Matt's hand), 16", and step 8's logged-out and blocked-geo parts).
+
+22. **Shared corners dragged (8M-10 step 12).** In edit mode, drag the noted shared corner: both regions' outlines follow it as it moves, both staged; one Undo takes both back. Untick "Move shared corners together" and drag it again: only the dragged region's corner moves (a gap or overlap appears in the list). Reload: the switch is still unticked; tick it. A corner on another region's side (a T-junction) moves alone. A corner shared with another server's outline (dashed gray) comes apart from it.
+23. **A gap to fix.** With the switch unticked, drag the shared corner of step 22 a few meters apart, so that the list shows a gap (or an overlap) with "Fix…". Keep it for steps 24 and 25.
+24. **Fix… (8M-10 step 13).** Scroll the panel to the bottom, then Fix… of the gap: the box at the map's top right corner, its choices inside it, Apply and Cancel at its foot in sight without scrolling; the map fitted to the sliver left of the box. Take each choice: dashed on the map; Apply stages it as one change ("Fixed, as one change: Undo takes it back."); Undo. With the keyboard alone (Tab to Fix…, Enter): the focus goes into the box (its title, once the choices came), stays on a choice taken, and Cancel puts it on the panel, never on the page.
+25. **Fix all slivers… (8M-10 step 14).** The box with its question, Leave it, Stop here and Cancel at its foot; the map at each stretch beside the box; Cancel. With the keyboard and a screen reader (NVDA or Narrator, Matt): each question, the first and every one after Leave it or a choice taken, is read from its first line ("… fixed so far."), where the focus goes. Then Undo to nothing (the panel's line gone), and tick the switch.
+26. **The address, logged out (8M-10 step 8, part).** In a private window, `/s/<guild>/regions/edit`: the login page (401) with "Log in with Discord" and "/region edit", as before.
+27. **The address without the live map (8M-10 step 8, part).** With `/api/geo` blocked in devtools (request blocking), open `/s/<guild>/map?edit=regions` as Googer: the editor fitted to the server's regions, not the default view of Pittsburgh's center at zoom 11. Unblock it.
+28. **One save (8M-10 step 15; Matt's go-ahead).** Move one shared corner a few meters (the switch ticked), Save…: the preview names both regions; Save these changes: saved, the editor reloaded with the new outlines, the panel's line gone, and back on the map the menu says "Edit regions" alone. While the preview and the save are being sent, "Back to the map" is off, its title "Wait for the answer of the preview or the save." (devtools' network throttling makes the moment long enough to see). Then move it back and save again. Nothing else is saved.
+29. **Discord away (8M-10 step 9, optional).** With the bot's network to Discord cut for a moment: turning the editor on as Googer shows it read-only ("Discord cannot be reached just now, so the editor is read-only.", no Geoman tools, Save off); the clusters are drawn as in step 7.
+
+## After
+
+30. **Back to how it was.** Undo to nothing (or clear `pine-region-edits:<guild>:<Googer's id>` in Local storage), the switch ticked, the device toolbar off, the editor's layer switch as before (Stops off), the map's layers as before the run.
````

## After the last task

- [ ] `npm run check > var/8m11c-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 669def8ef6b022288ad2c5a65004f3d864da0a59 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
