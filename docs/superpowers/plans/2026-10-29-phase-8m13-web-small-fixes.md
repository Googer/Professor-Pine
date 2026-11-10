# Phase 8M-13: The Web Map's Last Small Fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the web map's last small fixes before the cutover, from the stagings of 2026-10-28 and 2026-10-29: a train shows its direction and its next stops, answers keep their lines, a refusal on a phone is seen, visitors see only what works for them, Find shows misspelled places only when nothing else is found, and the page offers Light, Dark or Device.

- **Task 1:** a train's direction (T1): arrowheads of 24 px; a flow along the legs ahead and a loop's closing leg, under `prefers-reduced-motion: no-preference`, kept in step across redraws (`train-flow.ts`, `FLOW_CYCLE_MS` held to `--flow-time`).
- **Task 2:** a train's stops ahead as numbered badges (S7): set off left of the stop like the raid time badge, from zoom 15, redrawn on `zoomend`; a 44 px tap box centered on each 20 px number, below raid and max markers (`BADGE_Z_OFFSET`); a tap opens the train's popup.
- **Task 3:** answers (A1, A2): `pageWords` writes a line-start list mark as "• "; the band and the answer line keep line breaks; `PhoneCard.nudge()` and refusals of presses and dialogs routed to it.
- **Task 4:** visitors (L1, I1, L2): a visitor's layers only Gyms and Region outlines; the invite stacked on a phone; "Find a gym" hidden while Gyms is off for members who thin the gyms, and a word typed while Gyms is off turns it on; the checklist fixes (8M-11A step 5, 8M-11C steps 25 and 27).
- **Task 5:** Find (O1): `FoundPlace.guess`; guesses shown only when nothing else is found.
- **Task 6:** Light, Dark or Device (S10): "Theme" in the account menu and a ⋮ button beside "Log in" for visitors; `data-theme` set by a head script before the first paint (`theme-head.ts`); the dark blocks written once and the forced-dark copy made by the build (`scripts/web/forced-dark.ts`); `ThemeWatch` following the choice; `localStorage` key `pine-map-theme`.

**Tech stack:**
- TypeScript 6.0, Node 26, Leaflet, esbuild, Vitest.
- No new dependency, no migration, no setting, no command change (no deploy).

**Spec:** `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, section "Plan 8M-13" (approved by Matt 2026-10-29). With it: the brief `.superpowers/sdd/2026-10-29-small-pass/brief-8m13.md` (git-ignored).

**Every diff in this plan was run before the plan was written.**
- They were made on a throwaway branch `proto-8m13` (tip `4ac9d029`), one commit per task, on `small-pass` ebb00168.
- Each commit typechecks (root and `src/web/client`) and passes its tests.
- On the final tip the full check, the build and the database suite passed.

**Reviews:**
- **The prototype:** an Opus review found 1 Important (a visitor's map empty by default and "Find a gym" silent while Gyms is off) and 4 Minor (Split…'s dialog lines lost their marks; the flow jumped on each redraw; badges smaller than a finger; `web.md`'s theme bullet out of date).
- **Matt's ruling:** a word typed in "Find a gym" while Gyms is off turns Gyms on; visitors keep Gyms off by default.
- **Fix round 1:** folded in; a scoped re-review found 1 Minor (the tap box pushed the numbers out and covered nearby gyms).
- **Fix round 2:** folded in (the numbers back in place, the box centered on them and stacked under raid markers).
- **The controller's ruling:** where two badges' boxes overlap, Leaflet's order decides; both open the same train's popup unless two trains share the stop.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md` and `testing.md`.

**Inside the plan:**
- Each commit needs only the typecheck (root and client) and its own test files.
- The full check, the build and the database suite run once, on the tip (after 8F-1's tasks, already on the branch).
- Work in `../Professor-Pine-smallpass` on `small-pass`; never commit in the main checkout.

## Review Focus

- No `style` attribute anywhere (CSP): the flow's delay and every size go through the CSSOM or classes.
- The theme never flashes: the head script's hash in the CSP matches what is served, and a stored choice is read before the first paint.
- A gym and a raid keep their taps beside a train's badges.
- A visitor's map shows something to find, and every layer offered to a visitor works for them.
- A member's text with a literal "- " escaped stays as typed; only a bare line-start mark becomes "• ".

---

### Task 1: 8M-13 task 1: a train's direction

Prototype commit: `65a0b2530033296f31024890a7abf6922b8fac34`

Arrowheads of 24 pixels; a thin line over the legs ahead whose dashes
move slowly along the way, and the dashes of a loop's closing leg too,
only under prefers-reduced-motion: no-preference (T1). The pattern, the
cycle and the color are tokens of theme.css; the keyframes move the
offset by one whole period.

**Files:**

```
 docs/architecture/web.md                         |   8 +++++++-
 src/web/client/map.css                           |  34 ++++++++++++++++++++++++++++++++++
 src/web/client/party-layer-draw.isolated.test.ts |  77 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++----
 src/web/client/party-layer.ts                    |  61 ++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/web/client/theme.css                         |   9 +++++++++
 src/web/client/train-flow.ts                     |  17 +++++++++++++++++
 src/web/client/train-line.test.ts                |  45 ++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/train-line.ts                     |   4 ++--
 src/web/train-flow.test.ts                       | 135 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 9 files changed, 373 insertions(+), 17 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/party-layer-draw.isolated.test.ts src/web/client/train-line.test.ts src/web/train-flow.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 65a0b2530033296f31024890a7abf6922b8fac34 -- src test scripts docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-13 task 1: a train's direction`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 91bde7976e6dedf7e1b6f0cdfca0cc12980fa18c..aef02614f3b129b77afabcf37ff378e014614822 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -300,7 +300,7 @@ Design `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md`, "8M-11B"; fin
 
 - **A train's line shows its way (S27):** `trainLegs` (`src/web/client/train-line.ts`, pure) cuts the line into legs between the stops the map can place, in the route's stored order: a leg is done when the stop it leads to is at or before the train's (`MapTrain.stop`), and every leg of a finished route is. A turn-back train's route is stored reversed when it turns, so its legs ahead point back after the turn by themselves; at its last stop the leg back to the stop before it is drawn ahead, with its arrowhead, the rest faint (branch review BR-4, Matt's S27: the arrows flip when it turns; a shuttle of two stops, stored reversed at its index 1 after every turn, always shows its way back). A loop (`MapTrain.atEnd`) gets its closing leg, from the last stop it can place back to the first, ahead; a finished loop has none.
   - `party-layer.ts` draws the done legs as one line at `--train-done` (0.35), those ahead as one at `--train-ahead` (0.8; `DRAWN_OPACITIES` of `theme.ts`, read as numbers from 0 to 1, the usual ones otherwise), and the closing leg dashed (`8 8`), all three in one `L.featureGroup` bound once to the train's popup under `route:<id>` (review R1: the key `showsParty` knows, so a post that comes draws the popup anew whichever piece opened it, and a piece gone after a move takes no popup with it). The arrowheads are drawn anew at every `zoomend`, also while a form holds the parties (review R2).
-  - The arrowheads (`legArrows`): one at the middle of each leg ahead at least `ARROW_MIN_PIXELS` (40) long on the screen, turned by its bearing in pixels (degrees clockwise from east), drawn anew at every draw and every `zoomend` (`drawArrows`, a group of their own in the trains' layer). A leg whose way back is ahead too (a loop of two stops) has its arrowhead two thirds of the way along, so that the two do not meet. Each is a `divIcon` of class `train-arrow` holding an SVG triangle of ours (`arrowElement`, `ARROW_PIXELS` 16, built through the DOM, never markup: the CSP lets no `style` attribute in) in `--train`, not interactive, on Leaflet's `overlayPane` (over the line, under the parties' markers). No library.
+  - The arrowheads (`legArrows`): one at the middle of each leg ahead at least `ARROW_MIN_PIXELS` (40) long on the screen, turned by its bearing in pixels (degrees clockwise from east), drawn anew at every draw and every `zoomend` (`drawArrows`, a group of their own in the trains' layer). A leg whose way back is ahead too (a loop of two stops) has its arrowhead two thirds of the way along, so that the two do not meet. Each is a `divIcon` of class `train-arrow` holding an SVG triangle of ours (`arrowElement`, `ARROW_PIXELS` 24 since plan 8M-13, built through the DOM, never markup: the CSP lets no `style` attribute in) in `--train`, not interactive, on Leaflet's `overlayPane` (over the line, under the parties' markers). No library.
   - Route mode's dashed editing line is unchanged.
 - **The drag line (S24):** while a stop is dragged in the route editor, `TrainUiDeps.dragLine` shows its new legs: from the stop it would follow and to the one it would precede (`dropNeighbors`, `dropLegs` beside `dropPosition` in `train-forms.ts`: positions from 1, as `/route move` takes them; one leg at either end, none to a stop off the map), drawn again only when the position changes, dotted in the train's color (`2 9`, round caps, weight 5) on a layer of their own over route mode's line, and cleared when the drag ends by any path. The row under the pointer stays marked in the list.
 - **The held map (S25):** while a stop's handle is held, the map's `touchZoom` and `dragging` are off (`TrainUiDeps.holdMap`, `holdMap` of `train-forms.ts`), and the drag's end puts back only those that were on, once. Both end in `endDrag`: a drop (in place or elsewhere), Escape, `pointercancel`, `lostpointercapture`, an edit begun, the editor drawn anew and route mode ending.
@@ -337,6 +337,12 @@ Design `docs/superpowers/specs/2026-10-28-find-design.md` (approved 2026-10-28;
 - **Speed** (measured 2026-10-29 on the laptop, an upper bound): `PlaceFinder.find` over Pittsburgh's Wayfarer export in one region (5,886 gyms, 20,618 PokéStops, 16,553 Power Spots; the indexes built in about 0.5 s) took a median of 25 ms per request over twelve texts, 11 ms for a text that finds nothing, 44 to 54 ms for the commonest words ("church", "st"), what Discord's autocomplete of `/research stop:` costs per keystroke; the page's match over 400 research reports, 100 grunts, 20 hideouts, 80 raids, 10 trains and 10 meetups with the 5,886 gyms in the map took a median of 0.6 ms, at most 1.9 ms.
 - **Tests:** `src/domain/stops/report-search.test.ts` (the words and marks over real tasks and lineups: Spinda's curveball, Skiddo in a pool of six, the costumed Pikachu, a Cosmog, a dragon grunt, the water grunt "not sure which", Giovanni), `stop-report-view.test.ts` and `src/web/stop-reports.test.ts` (the view carries them), `src/web/find-places.test.ts` (the route, a member without the map's role refused: review F8), `src/web/client/find.test.ts` (words, groups, the timing over fake timers), `list-ui.test.ts` (the rows, the scroll given back), `what-is-on.test.ts` (a place's line, the mark), `gyms-ui.isolated.test.ts` (no thinning for a member), `party-layer-draw.isolated.test.ts` (a pick turns the layer on and opens the stop, lifts a hiding filter, opens a place without its layer; the list opens as a search begins and not when its places come after a pick; a found line's popup under its row; typing draws nothing). Tried in a preview without Discord and at staging (`docs/superpowers/plans/2026-10-29-phase-8m12-staging.md`).
 
+## The last small fixes (plan 8M-13)
+
+Design `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, "Plan 8M-13"; findings T1, A1, A2, I1, L1, L2, O1 of the web fix pass's staging, S7 and S10 of the web polish's.
+
+- **A train's direction (T1):** the arrowheads are 24 pixels. The legs ahead carry a slow flow: one more polyline per train over the points of its legs ahead, weight 2, `interactive: false`, in the train's line group, of classes `train-flow train-flow-line`; a loop's closing leg (Leaflet's `8 8`) takes `train-flow` itself. `map.css` gives `.train-flow` its pattern (`--flow-dash`, `--flow-gap`) and the animation `train-flow` (`--flow-time`, 2.5 s, linear, endless: the offset from 0 to minus one period, so the loop does not jump and the dashes run toward the line's last point), and the flow line its color (`--train-flow`), all under `@media (prefers-reduced-motion: no-preference)`; elsewhere `.train-flow-line` is hidden and the closing leg keeps its still dashes. The train being routed is not drawn by the parties' draw, so it has no flow. Each flowing path starts in step with the clock (fix round 1, R1-3): once Leaflet made it (`add`), `inFlowStep` sets its `animationDelay` through the CSSOM to `flowDelay(Date.now())`, minus the clock's place in the cycle (`FLOW_CYCLE_MS`, 2,500, `--flow-time`'s, held to it by `train-flow.test.ts`; both in `train-flow.ts`, a module without the DOM's types), so the paths a draw of the parties makes anew go on where the old ones were. `src/web/train-flow.test.ts` reads the stylesheets (a period, the media query).
+
 ## Adding a route
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. The only exception is the Wayspot export tool's `/userscript` (above), which belongs to no server; another address outside `/s/<guild>/` needs the same reason. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 4fb10911b41fb48f14cc52dec635ffe74b5eea3a..6707b2c232e78a0efc27b2f4c713c40a0abc8af5 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -2186,6 +2186,40 @@ path.highlighted {
   }
 }
 
+/*
+ * A train's flow (plan 8M-13, T1): the dashes of a thin line over its legs ahead, and those of a
+ * loop's closing leg, move slowly along its way. The keyframes move them by exactly one period of
+ * the pattern, so the loop does not jump; from 0 to minus a period runs them from the line's
+ * first point toward its last. Where the device asks for less motion the flow line is hidden and
+ * the closing leg keeps Leaflet's still dashes: the arrowheads carry the direction.
+ */
+@keyframes train-flow {
+  from {
+    stroke-dashoffset: 0;
+  }
+
+  to {
+    stroke-dashoffset: calc(-1 * (var(--flow-dash) + var(--flow-gap)));
+  }
+}
+
+.train-flow-line {
+  visibility: hidden;
+}
+
+@media (prefers-reduced-motion: no-preference) {
+  .train-flow {
+    stroke-dasharray: var(--flow-dash) var(--flow-gap);
+    animation: train-flow var(--flow-time) linear infinite;
+  }
+
+  .train-flow-line {
+    visibility: visible;
+    stroke: var(--train-flow);
+    stroke-opacity: 1;
+  }
+}
+
 .post-popup .mine-part {
   display: flex;
   flex-direction: column;
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 30a670c576b9d9d135423a5de27f6c8b9ae9f031..b9b249470de11de0aac8e854382ed75f68ba0a39 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -11,6 +11,7 @@ import type { ResearchOptionsView, StopReportsView } from '../../domain/web/stop
 import { LayerRegistry, LAYERS_KEY, MAP_LAYERS } from './layer-registry.js';
 import type { MapSpot, MaxUiDeps } from './max-ui.js';
 import { showParties } from './party-layer.js';
+import { FLOW_CYCLE_MS } from './train-flow.js';
 import { MapActivity } from './parties.js';
 import type { MapGym } from './popup.js';
 import type { RaidUiDeps } from './raid-ui.js';
@@ -118,7 +119,7 @@ const fake = vi.hoisted(() => {
       const [lat, lng] = this.at as [number, number];
       return { lat, lng };
     }
-    getElement() {
+    getElement(): unknown {
       return undefined;
     }
     setStyle() {
@@ -140,7 +141,13 @@ const fake = vi.hoisted(() => {
       return this.layers;
     }
   }
-  class Path extends Layer {}
+  class Path extends Layer {
+    /** A line's path element, with the style the page sets on it (a train's flow, R1-3). */
+    element: { style: Record<string, string> } | undefined;
+    override getElement(): unknown {
+      return this.element;
+    }
+  }
   class CircleMarker extends Path {}
 
   /** A layer group: its layers, and whether it is on the map. */
@@ -262,6 +269,7 @@ vi.mock('leaflet', () => ({
   },
   polyline: (at: unknown, options: Record<string, unknown>) => {
     const made = new fake.Path(at, options);
+    made.element = { style: {} };
     fake.shown.lines.push(made);
     return made;
   },
@@ -1218,10 +1226,24 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
       if (group?.layers.includes(layer) !== true) return false;
       return group instanceof fake.FeatureGroup ? drawnNow(group) : true;
     };
-    /** The lines drawn now, by their points, opacity and dashes. */
+    /** The classes Leaflet puts on a line's path. */
+    const classesOf = (line: InstanceType<typeof fake.Path>): string[] =>
+      (typeof line.options.className === 'string' ? line.options.className : '')
+        .split(' ')
+        .filter((name) => name !== '');
+    /** The lines drawn now that only carry the flow (plan 8M-13, T1), by their points. */
+    const flowLines = () =>
+      fake.shown.lines
+        .filter((line) => drawnNow(line) && classesOf(line).includes('train-flow-line'))
+        .map((line) => ({
+          points: (line.at as Array<{ lat: number; lng: number }>).length,
+          interactive: line.options.interactive,
+          moving: classesOf(line).includes('train-flow'),
+        }));
+    /** The lines drawn now, by their points, opacity and dashes (the flow's own aside). */
     const lines = () =>
       fake.shown.lines
-        .filter((line) => drawnNow(line))
+        .filter((line) => drawnNow(line) && !classesOf(line).includes('train-flow-line'))
         .map((line) => ({
           points: (line.at as Array<{ lat: number; lng: number }>).length,
           opacity: line.options.opacity,
@@ -1265,6 +1287,53 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
       expect(arrows()).toEqual([]);
     });
 
+    // Plan 8M-13 (T1): a slow flow along the legs ahead says which way the train goes.
+    it('runs a flow over the legs ahead and moves the dashes of a loop’s closing leg', async () => {
+      await started({ raids: false, parties: view({ trains: [trainAt('t1', 0)] }) });
+      // One thin line over the leg ahead, letting clicks through to the train's own line.
+      expect(flowLines()).toEqual([{ points: 2, interactive: false, moving: true }]);
+      await started({ raids: false, parties: view({ trains: [loop(1)] }) });
+      expect(flowLines()).toEqual([{ points: 2, interactive: false, moving: true }]);
+      // The closing leg is no second line: its own dashes move.
+      const closing = fake.shown.lines.filter(
+        (line) => drawnNow(line) && line.options.dashArray !== undefined,
+      );
+      expect(closing.map((line) => classesOf(line))).toEqual([['train-flow']]);
+      // Done legs, and a finished train, stay still.
+      await started({ raids: false, parties: view({ trains: [trainAt('t1', 1)] }) });
+      expect(flowLines()).toEqual([]);
+      await started({ raids: false, parties: view({ trains: [loop(null)] }) });
+      expect(flowLines()).toEqual([]);
+      expect(
+        fake.shown.lines.filter((line) => drawnNow(line) && classesOf(line).length > 0),
+      ).toEqual([]);
+    });
+
+    // Fix round 1 of 8M-13 (R1-3): every draw makes new paths; the flow goes on where it was.
+    it('starts each flowing path where the flow is by the clock, so a redraw does not jump', async () => {
+      vi.useFakeTimers({ toFake: ['Date'], now: 400 * FLOW_CYCLE_MS + 700 });
+      try {
+        await started({ raids: false, parties: view({ trains: [loop(1)] }) });
+        const flowing = fake.shown.lines.filter(
+          (line) => drawnNow(line) && classesOf(line).includes('train-flow'),
+        );
+        expect(flowing).toHaveLength(2);
+        for (const line of flowing) line.fire('add');
+        expect(flowing.map((line) => line.element?.style.animationDelay)).toEqual([
+          '-700ms',
+          '-700ms',
+        ]);
+        // The legs that do not flow keep no delay.
+        const still = fake.shown.lines.find(
+          (line) => drawnNow(line) && !classesOf(line).includes('train-flow'),
+        );
+        still?.fire('add');
+        expect(still?.element?.style.animationDelay).toBeUndefined();
+      } finally {
+        vi.useRealTimers();
+      }
+    });
+
     // Review R1 of 8M-11B: one popup per train's line, under the key the post's rules know.
     describe('opened from its faint leg', () => {
       /** The layer whose popup a click on `line` opens: its own, or its group's. */
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index af0409fd8c092e53d884fbba78aa9beddadd87ae..280ef4f4790f9a14ee98621ccb86cae14953045a 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -47,6 +47,7 @@ import {
 } from './train-forms.js';
 import { trainUi } from './train-ui.js';
 import { ARROW_PIXELS, arrowElement, legArrows, trainLegs, type TrainLeg } from './train-line.js';
+import { flowDelay } from './train-flow.js';
 import { onThemeChange, theme } from './theme.js';
 import type { LayerRegistry } from './layer-registry.js';
 import { PLACES_FROM, placesWanted } from './cluster.js';
@@ -134,6 +135,21 @@ export const GYM_DOT = { radius: 6, weight: 2 } as const;
 /** The ring of a meetup at its place. */
 export const MEETUP_RING = ringSizes(undefined).meetup;
 
+/**
+ * A flowing path of a train's line (fix round 1 of 8M-13, R1-3): once Leaflet made its element,
+ * its animation starts where the clock is in the cycle (`flowDelay`), so that a path drawn anew
+ * at each draw of the parties goes on where the one before was. The CSSOM, not a `style`
+ * attribute: the CSP lets no inline style in.
+ */
+function inFlowStep<T extends L.Path>(path: T): T {
+  return path.on('add', () => {
+    const element = path.getElement();
+    if (element && 'style' in element) {
+      (element.style as CSSStyleDeclaration).animationDelay = flowDelay(Date.now());
+    }
+  });
+}
+
 /**
  * Where a train is on the map (plan 8S-4): a ring around the gym of its stop, unfilled, so that a
  * click inside it reaches the gym's dot or the marker of its raids, and its line opens the train's
@@ -1734,17 +1750,44 @@ export function showParties(
           },
         ).addTo(line);
       }
+      // Its flow (plan 8M-13, T1): one thin line over the legs ahead whose dashes move along the
+      // way (`map.css`, `.train-flow`: their pattern, color and motion, hidden where the device
+      // asks for less motion), letting clicks through to the line under it.
+      const ahead = pieces[1]?.legs ?? [];
+      const [firstAhead] = ahead;
+      if (firstAhead) {
+        inFlowStep(
+          L.polyline(
+            [firstAhead.from, ...ahead.map((leg) => leg.to)].map((place) =>
+              L.latLng(place.lat, place.lon),
+            ),
+            {
+              color: colours.train,
+              weight: 2,
+              className: 'train-flow train-flow-line',
+              interactive: false,
+            },
+          ),
+        ).addTo(line);
+      }
       const closing = legs.find((leg) => leg.closing);
       if (closing) {
-        L.polyline(
-          [L.latLng(closing.from.lat, closing.from.lon), L.latLng(closing.to.lat, closing.to.lon)],
-          {
-            color: colours.train,
-            weight: 4,
-            opacity: opacities.trainAhead,
-            dashArray: '8 8',
-            interactive,
-          },
+        // Its own dashes move (`.train-flow`), where motion is welcome.
+        inFlowStep(
+          L.polyline(
+            [
+              L.latLng(closing.from.lat, closing.from.lon),
+              L.latLng(closing.to.lat, closing.to.lon),
+            ],
+            {
+              color: colours.train,
+              weight: 4,
+              opacity: opacities.trainAhead,
+              dashArray: '8 8',
+              className: 'train-flow',
+              interactive,
+            },
+          ),
         ).addTo(line);
       }
       if (line.getLayers().length > 0) {
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index 09747c49fc1e81fab46a62cdb25b0d4b06fcdf9f..55b1ff3e4ff270e6dcb7c051e21f886b32138fce 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -22,6 +22,11 @@
   /* A train's line (8M-11B, S27): the legs ahead, and the legs it has done, fainter (0 to 1). */
   --train-ahead: 0.8;
   --train-done: 0.35;
+  /* Its flow over the legs ahead (8M-13, T1): dash and gap, one cycle, the moving dashes' color. */
+  --flow-dash: 8px;
+  --flow-gap: 8px;
+  --flow-time: 2.5s;
+  --train-flow: rgba(255, 255, 255, 0.9);
   /* The map's side pane (the list, forms), the region editor's panel and its Fix box (8M-10). */
   --panel-width: 340px;
   --editor-panel-width: 360px;
@@ -173,6 +178,10 @@
     --raid-small: 20px;
     --train-ahead: 0.8;
     --train-done: 0.35;
+    --flow-dash: 8px;
+    --flow-gap: 8px;
+    --flow-time: 2.5s;
+    --train-flow: rgba(255, 255, 255, 0.9);
     --panel-width: 340px;
     --editor-panel-width: 360px;
     --fix-box-width: 340px;
diff --git a/src/web/client/train-flow.ts b/src/web/client/train-flow.ts
new file mode 100644
index 0000000000000000000000000000000000000000..d630a6aeb1f1fd33bf86c81ed6b0882805c2a6cd
--- /dev/null
+++ b/src/web/client/train-flow.ts
@@ -0,0 +1,17 @@
+/**
+ * A train's flow in step with the clock (fix round 1 of 8M-13, R1-3). A module without the DOM's
+ * types, so that the stylesheet's test (`src/web/train-flow.test.ts`) holds the cycle to
+ * `--flow-time` of `theme.css`.
+ */
+
+/** One cycle of a train's flow, as `--flow-time` of `theme.css` says (2.5 s). */
+export const FLOW_CYCLE_MS = 2500;
+
+/**
+ * Where a flowing path starts its cycle, as its `animationDelay`: the clock's place in the cycle,
+ * behind, so that every path is in step with the clock and a path drawn anew (every draw of the
+ * parties) goes on where the one before was, not from 0.
+ */
+export function flowDelay(now: number): string {
+  return `${String(-(now % FLOW_CYCLE_MS))}ms`;
+}
diff --git a/src/web/client/train-line.test.ts b/src/web/client/train-line.test.ts
index 2cd906abdac1c6bd7bc71fbae4bf381804f7032f..e27b2eae66bef2e6c4a7afc9627883ed03321ae5 100644
--- a/src/web/client/train-line.test.ts
+++ b/src/web/client/train-line.test.ts
@@ -1,6 +1,12 @@
 import { describe, expect, it } from 'vitest';
 import type { MapAtEnd } from '../../domain/web/party-data.js';
-import { ARROW_MIN_PIXELS, legArrows, trainLegs, type TrainLeg } from './train-line.js';
+import {
+  ARROW_MIN_PIXELS,
+  arrowElement,
+  legArrows,
+  trainLegs,
+  type TrainLeg,
+} from './train-line.js';
 
 /** Stops on a line going east, a hundredth of a degree apart, by their gym ids. */
 const GYMS = new Map([
@@ -162,3 +168,40 @@ describe('legArrows (plan 8M-11B, S27)', () => {
     expect(two[1]?.lon).toBeCloseTo(-79.99 - 0.01 * (2 / 3), 9);
   });
 });
+
+// Plan 8M-13 (T1): the arrowheads were hard to see at 16 pixels.
+describe('arrowElement', () => {
+  /** A document that makes elements keeping their attributes and children. */
+  const fakeDocument = () => {
+    interface Made {
+      name: string;
+      attributes: Map<string, string>;
+      children: Made[];
+      setAttribute(name: string, value: string): void;
+      append(child: Made): void;
+    }
+    const make = (_space: string, name: string): Made => {
+      const made: Made = {
+        name,
+        attributes: new Map(),
+        children: [],
+        setAttribute: (key, value) => made.attributes.set(key, value),
+        append: (child) => made.children.push(child),
+      };
+      return made;
+    };
+    return { createElementNS: make } as unknown as Document;
+  };
+
+  it('is a square of 24 pixels, its triangle filling it but for a margin of 3', () => {
+    const svg = arrowElement(fakeDocument(), 'orange-ish', 90) as unknown as {
+      attributes: Map<string, string>;
+      children: Array<{ attributes: Map<string, string> }>;
+    };
+    expect(svg.attributes.get('width')).toBe('24');
+    expect(svg.attributes.get('height')).toBe('24');
+    expect(svg.attributes.get('viewBox')).toBe('0 0 24 24');
+    expect(svg.children[0]?.attributes.get('points')).toBe('3,3 21,12 3,21');
+    expect(svg.children[0]?.attributes.get('transform')).toBe('rotate(90.0 12 12)');
+  });
+});
diff --git a/src/web/client/train-line.ts b/src/web/client/train-line.ts
index 4465c91a9f148a731cabd1e82f3f8acc127804bf..1883e044a4f5d0e8706028e867161b8413a0a24e 100644
--- a/src/web/client/train-line.ts
+++ b/src/web/client/train-line.ts
@@ -111,8 +111,8 @@ export function legArrows(
 
 const SVG = 'http://www.w3.org/2000/svg';
 
-/** The side of an arrowhead's square, in pixels: a triangle over the line's 4. */
-export const ARROW_PIXELS = 16;
+/** The side of an arrowhead's square, in pixels: a triangle over the line's 4 (24 since plan 8M-13, T1). */
+export const ARROW_PIXELS = 24;
 
 /**
  * An arrowhead as SVG of ours (no markup string: the page's CSP lets no `style` attribute in):
diff --git a/src/web/train-flow.test.ts b/src/web/train-flow.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..9b750e16b6507ae9db24e27756cc655aedc68d03
--- /dev/null
+++ b/src/web/train-flow.test.ts
@@ -0,0 +1,135 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { FLOW_CYCLE_MS, flowDelay } from './client/train-flow.js';
+
+/**
+ * A train's flow (plan 8M-13, T1): the dashes over its legs ahead move along its way, slowly,
+ * only where the device does not ask for less motion, and the loop of the animation does not
+ * jump. Read from the stylesheets, as the browser reads them.
+ */
+
+const CLIENT = path.resolve(import.meta.dirname, 'client');
+const read = (file: string): string =>
+  readFileSync(path.join(CLIENT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
+
+/** The light set of `theme.css`'s custom properties, by name. */
+function tokens(): Map<string, string> {
+  const light = /^\s*:root\s*\{([^{}]*)\}/u.exec(read('theme.css'))?.[1] ?? '';
+  return new Map(
+    [...light.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gu)].map((match) => [
+      match[1] ?? '',
+      (match[2] ?? '').trim(),
+    ]),
+  );
+}
+
+/** A length of the stylesheet in pixels: `var(…)` of the tokens, `calc` of + − × and brackets. */
+function pixels(text: string, values: Map<string, string>): number {
+  const resolved = text
+    .replace(/var\((--[a-z0-9-]+)\)/gu, (_whole, name: string) => {
+      const value = values.get(name);
+      if (value === undefined) throw new Error(`${name} is not in theme.css`);
+      return `(${value})`;
+    })
+    .replace(/calc\(/gu, '(')
+    .replace(/px/gu, '');
+  const parts = resolved.match(/\d+(?:\.\d+)?|[-+*()]/gu) ?? [];
+  let at = 0;
+  const sum = (): number => {
+    let total = product();
+    while (parts[at] === '+' || parts[at] === '-') {
+      const sign = parts[at] === '+' ? 1 : -1;
+      at += 1;
+      total += sign * product();
+    }
+    return total;
+  };
+  const product = (): number => {
+    let total = unit();
+    while (parts[at] === '*') {
+      at += 1;
+      total *= unit();
+    }
+    return total;
+  };
+  const unit = (): number => {
+    const part = parts[at];
+    at += 1;
+    if (part === '-') return -unit();
+    if (part === '(') {
+      const inner = sum();
+      at += 1;
+      return inner;
+    }
+    return Number(part);
+  };
+  return sum();
+}
+
+/** The body of the first `@media` block with this condition (one level of nesting). */
+function mediaBlock(css: string, condition: RegExp): string {
+  const start = css.search(condition);
+  if (start < 0) return '';
+  const open = css.indexOf('{', start);
+  let depth = 0;
+  for (let at = open; at < css.length; at += 1) {
+    if (css[at] === '{') depth += 1;
+    if (css[at] === '}') depth -= 1;
+    if (depth === 0) return css.slice(open + 1, at);
+  }
+  return '';
+}
+
+const MOTION = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^@]*?\.train-flow/u;
+
+describe("a train's flow (plan 8M-13, T1)", () => {
+  it('reads lengths through the tokens', () => {
+    const values = new Map([
+      ['--a', '8px'],
+      ['--b', '4px'],
+    ]);
+    expect(pixels('calc(-1 * (var(--a) + var(--b)))', values)).toBe(-12);
+  });
+
+  it('moves the dashes by one whole period, forward along the line, in a loop', () => {
+    const css = read('map.css');
+    const values = tokens();
+    const keyframes = /@keyframes\s+train-flow\s*\{([\s\S]*?\})\s*\}/u.exec(css)?.[1] ?? '';
+    const offsets = [...keyframes.matchAll(/stroke-dashoffset:\s*([^;]+);/gu)].map((match) =>
+      pixels(match[1] ?? '', values),
+    );
+    const motion = mediaBlock(css, MOTION);
+    const pattern = /\.train-flow\s*\{[^}]*stroke-dasharray:\s*([^;]+);/u.exec(motion)?.[1] ?? '';
+    const period = pattern
+      .split(/\s+(?![^(]*\))/u)
+      .map((part) => pixels(part, values))
+      .reduce((total, part) => total + part, 0);
+    expect(period).toBeGreaterThan(0);
+    // From 0 to minus a period: the dashes run from the line's first point toward its last.
+    expect(offsets).toEqual([0, -period]);
+    expect(motion).toMatch(
+      /\.train-flow\s*\{[^}]*animation:\s*train-flow\s+var\(--flow-time\)\s+linear\s+infinite/u,
+    );
+    expect(values.get('--flow-time')).toBe('2.5s');
+    // The page sets each path's delay by the same cycle (fix round 1, R1-3: `flowDelay`).
+    expect(FLOW_CYCLE_MS).toBe(Number.parseFloat(values.get('--flow-time') ?? '') * 1000);
+  });
+
+  // Fix round 1 (R1-3): a path drawn anew starts where the flow is by the clock.
+  it("starts a path's flow where the clock says, the same for every path at one moment", () => {
+    expect(flowDelay(0)).toBe('0ms');
+    expect(flowDelay(FLOW_CYCLE_MS * 1_000 + 1_234)).toBe('-1234ms');
+    expect(flowDelay(FLOW_CYCLE_MS - 1)).toBe(`-${String(FLOW_CYCLE_MS - 1)}ms`);
+  });
+
+  it('moves nothing and hides the flow line where the device asks for less motion', () => {
+    const css = read('map.css');
+    const motion = mediaBlock(css, MOTION);
+    // Every rule of the flow but the hidden line's is inside the media query.
+    const outside = css.replace(motion, '');
+    expect(outside).not.toMatch(/animation:\s*train-flow/u);
+    expect(outside).toMatch(/\.train-flow-line\s*\{[^}]*visibility:\s*hidden/u);
+    expect(motion).toMatch(/\.train-flow-line\s*\{[^}]*visibility:\s*visible/u);
+  });
+});
````

### Task 2: 8M-13 task 2: a train's stops ahead as numbered badges

Prototype commit: `186892bf7865c43ce0611d00d7bef041bd0af92e`

Each stop ahead of a train gets a small badge in the train's color with
its number in the route, set off to the left of the stop clear of a
raid's full marker, side by side where a stop is listed twice or ahead of
several trains (S7). From zoom 15 up, drawn anew on zoomend; a tap opens
the train's popup there. The gym's dot and a raid's marker keep their
own clicks.

**Files:**

```
 docs/architecture/web.md                         |  1 +
 src/web/client/map.css                           | 29 +++++++++++++++++++++++++++++
 src/web/client/party-layer-draw.isolated.test.ts | 72 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/party-layer.ts                    | 66 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++---
 src/web/client/theme.css                         |  3 +++
 src/web/client/theme.test.ts                     |  9 ++++++++-
 src/web/client/theme.ts                          |  6 ++++++
 src/web/client/train-line.test.ts                | 81 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-line.ts                     | 67 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 9 files changed, 330 insertions(+), 4 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/party-layer-draw.isolated.test.ts src/web/client/theme.test.ts src/web/client/train-line.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 186892bf7865c43ce0611d00d7bef041bd0af92e -- src test scripts docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-13 task 2: a train's stops ahead as numbered badges`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index aef02614f3b129b77afabcf37ff378e014614822..f86078541e84a0890bfb070055f2c859a433ff04 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -342,6 +342,7 @@ Design `docs/superpowers/specs/2026-10-28-find-design.md` (approved 2026-10-28;
 Design `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, "Plan 8M-13"; findings T1, A1, A2, I1, L1, L2, O1 of the web fix pass's staging, S7 and S10 of the web polish's.
 
 - **A train's direction (T1):** the arrowheads are 24 pixels. The legs ahead carry a slow flow: one more polyline per train over the points of its legs ahead, weight 2, `interactive: false`, in the train's line group, of classes `train-flow train-flow-line`; a loop's closing leg (Leaflet's `8 8`) takes `train-flow` itself. `map.css` gives `.train-flow` its pattern (`--flow-dash`, `--flow-gap`) and the animation `train-flow` (`--flow-time`, 2.5 s, linear, endless: the offset from 0 to minus one period, so the loop does not jump and the dashes run toward the line's last point), and the flow line its color (`--train-flow`), all under `@media (prefers-reduced-motion: no-preference)`; elsewhere `.train-flow-line` is hidden and the closing leg keeps its still dashes. The train being routed is not drawn by the parties' draw, so it has no flow. Each flowing path starts in step with the clock (fix round 1, R1-3): once Leaflet made it (`add`), `inFlowStep` sets its `animationDelay` through the CSSOM to `flowDelay(Date.now())`, minus the clock's place in the cycle (`FLOW_CYCLE_MS`, 2,500, `--flow-time`'s, held to it by `train-flow.test.ts`; both in `train-flow.ts`, a module without the DOM's types), so the paths a draw of the parties makes anew go on where the old ones were. `src/web/train-flow.test.ts` reads the stylesheets (a period, the media query).
+- **A train picked at any stop ahead (S7):** `stopBadges` (`train-line.ts`, pure) gives a badge per listing after the stop each train is at, numbered by its place in the route from 1 (the current stop keeps the ring; a finished train, and the stops a loop has done, get none; a stop the map cannot place is passed over), the badges of one stop (listed twice, or ahead of several trains) side by side by `slot`. `badgeAnchor(slot, raidFull, badgeSize, tapSize)` sets each number (`.number`, `--badge-size`, 20 px, the train's color, the number white) to the left of its stop, clear of a raid's full marker (`--raid-full`) by `BADGE_GAP` (3), centered on it, further slots further out: their centers 35, 58, 81 … px left of the stop. Each number sits in the middle of a box of a finger's size (`--tap-size`, 44 px; fix round 1, R1-4), class `train-badge`, empty to the eye, that takes the taps round it; the box is centered on its number (fix round 2, R2-1), so its right edge lies about 13 px left of the stop, clear of a gym's dot (8 px), and it overlaps only the left corners of a raid's or max battle's marker, which lies above it (`zIndexOffset` `BADGE_Z_OFFSET`, −1000) and keeps those taps. The boxes of one stop's neighboring numbers overlap; there Leaflet's order of the markers decides. `party-layer.ts` draws them in a group of the trains' layer from `BADGE_MIN_ZOOM` (15) up, anew at every draw and every `zoomend` (`drawBadges`, beside `drawArrows`); a tap opens the train's popup (`route:<id>`, else `train:<id>`) where the badge is. They take no click while the trains let clicks through (route mode, a place picked). Tests: `train-line.test.ts`, `party-layer-draw.isolated.test.ts`.
 
 ## Adding a route
 
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 6707b2c232e78a0efc27b2f4c713c40a0abc8af5..1de6d3dcf5e1691dafe91c69454e137b1b5fbe28 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -1952,6 +1952,35 @@ path.highlighted {
   color: var(--stop-number-text);
 }
 
+/*
+ * A train's stop ahead (plan 8M-13, S7): its number in the route on the train's color, beside the
+ * stop (`badgeAnchor`), a tap opening the train's popup.
+ */
+.train-badge {
+  /* A box of a finger's size, empty to the eye, that takes the taps (fix round 1, R1-4). */
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  background: none;
+  border: 0;
+}
+
+.train-badge .number {
+  display: flex;
+  align-items: center;
+  justify-content: center;
+  width: var(--badge-size);
+  height: var(--badge-size);
+  box-sizing: border-box;
+  border: 2px solid var(--marker-bg);
+  border-radius: 50%;
+  background: var(--train);
+  box-shadow: 0 1px 3px var(--shadow);
+  color: var(--stop-number-here-text);
+  font-size: 11px;
+  font-weight: 700;
+}
+
 .stop-number.here {
   background: var(--train);
   color: var(--stop-number-here-text);
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index b9b249470de11de0aac8e854382ed75f68ba0a39..45655adae180292614ebc72af87b9a210a42b388 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -1389,6 +1389,78 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
       });
     });
 
+    // Plan 8M-13 (S7): a badge with its number at each stop ahead picks the train.
+    describe('its stops ahead', () => {
+      /** The badges drawn now, by their numbers, in the order drawn. */
+      const badges = () =>
+        fake.shown.markers.filter(
+          (marker) =>
+            drawnNow(marker) &&
+            (marker.options.icon as { options: { className?: string } } | undefined)?.options
+              .className === 'train-badge',
+        );
+      const numbers = () =>
+        badges().map(
+          (marker) =>
+            (marker.options.icon as { options: { html: { textContent: string } } }).options.html
+              .textContent,
+        );
+
+      it('numbers the stops ahead from zoom 15 up, drawn anew at each zoom', async () => {
+        const shown = await started({ raids: false, parties: view({ trains: [loop(1)] }) });
+        // At Lake Gazebo now: the Fountain ahead, the Library done.
+        expect(numbers()).toEqual(['3']);
+        shown.zoomedTo(10_000, 14);
+        expect(numbers()).toEqual([]);
+        shown.zoomedTo(10_000, 15);
+        expect(numbers()).toEqual(['3']);
+        expect(badges()[0]?.getLatLng()).toEqual({ lat: 40.43, lng: -79.93 });
+        // Fix round 1 (R1-4): a box of a finger's size (`--tap-size`) takes its taps, the
+        // number drawn small in its middle.
+        const icon = (
+          badges()[0]?.options.icon as {
+            options: { iconSize: number[]; html: { className: string } };
+          }
+        ).options;
+        expect(icon.iconSize).toEqual([44, 44]);
+        expect(icon.html.className).toBe('number');
+      });
+
+      // Fix round 2 (R2-1): a badge's box under a raid's or max battle's marker, which keeps the
+      // taps where the two overlap.
+      it("lies under a raid's marker", async () => {
+        await started({
+          raids: true,
+          parties: view({ trains: [loop(0)], raids: [raidAt(1)] }),
+        });
+        const raidMarker = fake.shown.markers.find(
+          (marker) =>
+            drawnNow(marker) &&
+            (marker.options.icon as { options: { className?: string } } | undefined)?.options
+              .className === 'raid-icon',
+        );
+        expect(raidMarker).toBeDefined();
+        const z = (marker: { options: Record<string, unknown> } | undefined) =>
+          Number(marker?.options.zIndexOffset ?? 0);
+        expect(badges().length).toBeGreaterThan(0);
+        for (const badge of badges()) expect(z(badge)).toBeLessThan(z(raidMarker));
+      });
+
+      it("opens the train's popup where it is tapped", async () => {
+        await started({
+          raids: false,
+          parties: view({ trains: [{ ...loop(0), postKey: 'p1' }] }),
+        });
+        expect(numbers()).toEqual(['2', '3']);
+        badges()[1]?.fire('click', {});
+        const open = fake.shown.popupOf;
+        expect(open !== undefined && drawnNow(open)).toBe(true);
+        // The line's popup, under the key the post's rules know.
+        expect(open).toBeInstanceOf(fake.FeatureGroup);
+        expect(open?.openedAt).toEqual({ lat: 40.43, lng: -79.93 });
+      });
+    });
+
     // Review R2 of 8M-11B: the arrowheads follow every zoom, also while a form holds the parties.
     it('draws the arrowheads for the new zoom while a form holds the parties', async () => {
       const shown = await started({ raids: false, parties: view({ trains: [loop(0)] }) });
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 280ef4f4790f9a14ee98621ccb86cae14953045a..39e99c03fa7546c2484d9c6275bda98c3fd5851d 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -46,7 +46,17 @@ import {
   trainActions,
 } from './train-forms.js';
 import { trainUi } from './train-ui.js';
-import { ARROW_PIXELS, arrowElement, legArrows, trainLegs, type TrainLeg } from './train-line.js';
+import {
+  ARROW_PIXELS,
+  arrowElement,
+  BADGE_MIN_ZOOM,
+  BADGE_Z_OFFSET,
+  badgeAnchor,
+  legArrows,
+  stopBadges,
+  trainLegs,
+  type TrainLeg,
+} from './train-line.js';
 import { flowDelay } from './train-flow.js';
 import { onThemeChange, theme } from './theme.js';
 import type { LayerRegistry } from './layer-registry.js';
@@ -73,7 +83,7 @@ import {
   startWords,
   type PlacedThing,
 } from './shared-place.js';
-import type { MapParty, MapRaid, PostView } from '../../domain/web/party-data.js';
+import type { MapParty, MapRaid, MapTrain, PostView } from '../../domain/web/party-data.js';
 import {
   ALL_RAIDS_HERE,
   gymWithRaidBoxes,
@@ -1208,9 +1218,56 @@ export function showParties(
   let drawnSize: MarkerSize | undefined;
   map.on('zoomend', () => {
     if (markerSize(map.getZoom()) !== drawnSize) redrawParties();
-    // The arrowheads follow every zoom, also while a form holds the parties (review R2).
+    // The arrowheads follow every zoom, also while a form holds the parties (review R2), and so
+    // do the stops' badges (plan 8M-13, S7).
     drawArrows();
+    drawBadges();
   });
+  /** The trains drawn whose stops ahead get badges, and whether they take clicks now. */
+  let badgeTrains: { trains: MapTrain[]; interactive: boolean } = {
+    trains: [],
+    interactive: false,
+  };
+  /** The badges of the trains' stops ahead (plan 8M-13, S7), in the trains' layer. */
+  const trainBadges = L.layerGroup();
+  /**
+   * The badges of the stops ahead, from zoom 15 up (`stopBadges`): each in the train's color
+   * with its number, beside the stop (`badgeAnchor`); a tap opens the train's popup there, as a
+   * tap on its line does. Drawn anew at every draw of the parties and every zoom.
+   */
+  const drawBadges = (): void => {
+    trainBadges.clearLayers();
+    if (map.getZoom() < BADGE_MIN_ZOOM) return;
+    const { interactive } = badgeTrains;
+    const { raidFull: marker, tapSize: box, badgeSize } = theme().sizes;
+    for (const badge of stopBadges(badgeTrains.trains, gyms)) {
+      // The small number in the middle of a box of a finger's size, which takes the taps round
+      // it (fix round 1, R1-4), centered on the number (fix round 2, R2-1); under the raids' and
+      // max battles' markers, which keep the taps where they overlap it.
+      const number = document.createElement('span');
+      number.className = 'number';
+      number.textContent = String(badge.number);
+      const at = L.latLng(badge.lat, badge.lon);
+      const made = L.marker([badge.lat, badge.lon], {
+        icon: L.divIcon({
+          html: number,
+          className: 'train-badge',
+          iconSize: [box, box],
+          iconAnchor: badgeAnchor(badge.slot, marker, badgeSize, box),
+        }),
+        zIndexOffset: BADGE_Z_OFFSET,
+        interactive,
+        keyboard: false,
+      }).addTo(trainBadges);
+      if (interactive) {
+        made.on('click', (event: L.LeafletEvent) => {
+          L.DomEvent.stop(event);
+          const id = badge.trainId;
+          (popups.get(`route:${id}`) ?? popups.get(`train:${id}`))?.openPopup(at);
+        });
+      }
+    }
+  };
   /** The legs of each train drawn (plan 8M-11B, S27), whose arrowheads follow the zoom. */
   let trainLines: TrainLeg[][] = [];
   /** The arrowheads of the trains drawn, in the trains' layer, under the markers. */
@@ -1719,6 +1776,8 @@ export function showParties(
     trainLines = [];
     trainArrows.clearLayers();
     trainArrows.addTo(groups.trains);
+    badgeTrains = { trains: drawn.trains, interactive };
+    trainBadges.addTo(groups.trains);
     for (const train of drawn.trains) {
       // Through its gyms and the power spots its data gives (plan 8X-4).
       const { ring } = trainPlaces(train, gyms);
@@ -1834,6 +1893,7 @@ export function showParties(
       }
     }
     drawArrows();
+    drawBadges();
     // The reports at stops (plan 8M-9B): a marker per stop with reports of the layers on, its
     // popup bound as a party's (the card, the held content), the stop whose popup or card is open
     // kept with its ended reports (B14).
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index 55b1ff3e4ff270e6dcb7c051e21f886b32138fce..3a67a97d64505429c5e12d39d8458cc9faadda5d 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -36,6 +36,8 @@
   --shake-distance: 6px;
   /* The least a finger's button is, on a coarse pointer (plan 8M-11A, S3). */
   --tap-size: 44px;
+  /* A train's stop badge (plan 8M-13, S7): its number's circle, in a box of --tap-size. */
+  --badge-size: 20px;
 
   /* Discord's surfaces, light. */
   --page-bg: #ffffff;
@@ -188,6 +190,7 @@
     --shake-time: 300ms;
     --shake-distance: 6px;
     --tap-size: 44px;
+    --badge-size: 20px;
 
     /* Discord's surfaces, dark. */
     --page-bg: #313338;
diff --git a/src/web/client/theme.test.ts b/src/web/client/theme.test.ts
index 8dd28e2e4d1221140d58bef2daeb11a594f4c220..0c42a0762f70007ac4db107444d1359fd8ca8205 100644
--- a/src/web/client/theme.test.ts
+++ b/src/web/client/theme.test.ts
@@ -84,7 +84,14 @@ describe('readTheme', () => {
 describe('the sizes of a raid marker (Matt, 2026-10-25)', () => {
   it('are read from theme.css in pixels, the usual ones where it lacks them', () => {
     const theme = readTheme((property) => (property === '--raid-middle' ? ' 32px ' : ''));
-    expect(theme.sizes).toEqual({ raidFull: 44, raidMiddle: 32, raidSmall: 20 });
+    // A finger's least target too, a train's stop badge's box (plan 8M-13, R1-4).
+    expect(theme.sizes).toEqual({
+      raidFull: 44,
+      raidMiddle: 32,
+      raidSmall: 20,
+      tapSize: 44,
+      badgeSize: 20,
+    });
   });
 });
 
diff --git a/src/web/client/theme.ts b/src/web/client/theme.ts
index e5d1bfac2550427b7b680da30ce8fdd7a696ad98..88a1e9a9843944371b9542b325821ec723b4d45f 100644
--- a/src/web/client/theme.ts
+++ b/src/web/client/theme.ts
@@ -68,6 +68,10 @@ export const DRAWN_SIZES = {
   raidFull: '--raid-full',
   raidMiddle: '--raid-middle',
   raidSmall: '--raid-small',
+  /** A finger's least target (plan 8M-11A, S3): a train's stop badge takes taps that wide. */
+  tapSize: '--tap-size',
+  /** A train's stop badge's number (plan 8M-13, R2-1), in the middle of that box. */
+  badgeSize: '--badge-size',
 } as const;
 
 /** What a size the stylesheet lacks gives. */
@@ -75,6 +79,8 @@ const SIZE_DEFAULTS: Readonly<Record<keyof typeof DRAWN_SIZES, number>> = {
   raidFull: 44,
   raidMiddle: 30,
   raidSmall: 20,
+  tapSize: 44,
+  badgeSize: 20,
 };
 
 /**
diff --git a/src/web/client/train-line.test.ts b/src/web/client/train-line.test.ts
index e27b2eae66bef2e6c4a7afc9627883ed03321ae5..10b52f1a35e53b5af474813e7f9f5225dd1035d1 100644
--- a/src/web/client/train-line.test.ts
+++ b/src/web/client/train-line.test.ts
@@ -3,7 +3,10 @@ import type { MapAtEnd } from '../../domain/web/party-data.js';
 import {
   ARROW_MIN_PIXELS,
   arrowElement,
+  BADGE_GAP,
+  badgeAnchor,
   legArrows,
+  stopBadges,
   trainLegs,
   type TrainLeg,
 } from './train-line.js';
@@ -205,3 +208,81 @@ describe('arrowElement', () => {
     expect(svg.children[0]?.attributes.get('transform')).toBe('rotate(90.0 12 12)');
   });
 });
+
+// Plan 8M-13 (S7): a train is picked at any stop ahead by a numbered badge beside it.
+describe('stopBadges', () => {
+  /** A badge as its train, number, stop (by longitude) and place in the row beside the stop. */
+  const badgesOf = (trains: Array<ReturnType<typeof train> & { id: string }>) =>
+    stopBadges(trains, GYMS).map((badge) => ({
+      train: badge.trainId,
+      number: badge.number,
+      at: badge.lon,
+      slot: badge.slot,
+    }));
+
+  it('numbers each stop ahead by its place in the route; the current and done stops get none', () => {
+    expect(badgesOf([{ id: 't', ...train(['1', '2', '3', '4'], 1) }])).toEqual([
+      { train: 't', number: 3, at: -79.98, slot: 0 },
+      { train: 't', number: 4, at: -79.97, slot: 0 },
+    ]);
+    // A Power Spot ahead too, by its own place.
+    expect(badgesOf([{ id: 't', ...train(['1', SPOT.key], 0) }])).toEqual([
+      { train: 't', number: 2, at: -79.98, slot: 0 },
+    ]);
+  });
+
+  it('gives none to a finished train, nor to the stops a loop has done', () => {
+    expect(badgesOf([{ id: 't', ...train(['1', '2', '3'], null) }])).toEqual([]);
+    expect(badgesOf([{ id: 't', ...train(['1', '2', '3'], 2, 'loop') }])).toEqual([]);
+  });
+
+  it('passes over a stop the map cannot place, keeping the numbers of the route', () => {
+    expect(badgesOf([{ id: 't', ...train(['1', '9', '3'], 0) }])).toEqual([
+      { train: 't', number: 3, at: -79.98, slot: 0 },
+    ]);
+  });
+
+  it('sets the badges of one stop side by side: a stop listed twice, or ahead of two trains', () => {
+    expect(badgesOf([{ id: 't', ...train(['1', '2', '3', '2'], 0) }])).toEqual([
+      { train: 't', number: 2, at: -79.99, slot: 0 },
+      { train: 't', number: 3, at: -79.98, slot: 0 },
+      { train: 't', number: 4, at: -79.99, slot: 1 },
+    ]);
+    expect(
+      badgesOf([
+        { id: 'a', ...train(['1', '3'], 0) },
+        { id: 'b', ...train(['2', '3'], 0) },
+      ]),
+    ).toEqual([
+      { train: 'a', number: 2, at: -79.98, slot: 0 },
+      { train: 'b', number: 2, at: -79.98, slot: 1 },
+    ]);
+  });
+});
+
+describe('badgeAnchor', () => {
+  /** A badge's number (`--badge-size`) and the box round it that takes taps (`--tap-size`). */
+  const NUMBER = 20;
+  const TAP = 44;
+  /** A badge's box on the screen, from its anchor, and its number's center: the stop at 0, 0. */
+  const box = (slot: number, marker: number) => {
+    const [x, y] = badgeAnchor(slot, marker, NUMBER, TAP);
+    return { left: -x, right: -x + TAP, top: -y, bottom: -y + TAP, center: -x + TAP / 2 };
+  };
+
+  // Fix round 2 of 8M-13 (R2-1): the numbers where they were before round 1, each in a box of a
+  // finger's size centered on it, clear of a gym's dot.
+  it("keeps each number 35, 58, … pixels left of its stop, clear of a raid's full marker", () => {
+    expect([0, 1, 2].map((slot) => box(slot, 44).center)).toEqual([-35, -58, -81]);
+    // The number itself clear of the marker by the gap.
+    expect(box(0, 44).center + NUMBER / 2).toBe(-22 - BADGE_GAP);
+  });
+
+  it("centers a finger's box on the number, its right edge clear of a gym's dot of 8 pixels", () => {
+    const first = box(0, 44);
+    expect(first.right - first.left).toBe(TAP);
+    expect((first.left + first.right) / 2).toBe(first.center);
+    expect(first.right).toBeLessThan(-4);
+    expect(first.top + first.bottom).toBe(0);
+  });
+});
diff --git a/src/web/client/train-line.ts b/src/web/client/train-line.ts
index 1883e044a4f5d0e8706028e867161b8413a0a24e..81a552d0760d07f4244341b055b16a9108167072 100644
--- a/src/web/client/train-line.ts
+++ b/src/web/client/train-line.ts
@@ -139,3 +139,70 @@ export function arrowElement(document: Document, color: string, angle: number):
   svg.append(triangle);
   return svg;
 }
+
+/** The room between a stop's marker and its first badge, and between two badges, in pixels. */
+export const BADGE_GAP = 3;
+/** The badges show from this zoom up; below it the ring and the line pick a train, as before. */
+export const BADGE_MIN_ZOOM = 15;
+
+/** A badge of a stop ahead: its train, its number in the route, where, and its place in a row. */
+export interface StopBadge {
+  trainId: string;
+  /** Its listing's place in the route, from 1, as `/route` numbers stops. */
+  number: number;
+  lat: number;
+  lon: number;
+  /** Its place in the row of badges beside the stop, from 0 next to it. */
+  slot: number;
+}
+
+/**
+ * The badges of the trains' stops ahead (plan 8M-13, S7): one per listing after the stop each
+ * train is at (none for a finished train, nor for the stops a loop has done though its closing
+ * leg leads back to them; the current stop keeps the ring), numbered by its place in the route,
+ * a stop the map cannot place passed over. The badges of one stop, a stop listed twice or ahead
+ * of several trains, are set side by side in the trains' order.
+ */
+export function stopBadges(
+  trains: ReadonlyArray<Pick<MapTrain, 'id' | 'route' | 'stop' | 'spots'>>,
+  gyms: ReadonlyMap<number, StopPlace>,
+): StopBadge[] {
+  const taken = new Map<string, number>();
+  return trains.flatMap((train) => {
+    const { stop } = train;
+    if (stop === null) return [];
+    return train.route.flatMap((key, index) => {
+      if (index <= stop) return [];
+      const place = stopPlace(train, key, gyms);
+      if (!place) return [];
+      const slot = taken.get(key) ?? 0;
+      taken.set(key, slot + 1);
+      return [{ trainId: train.id, number: index + 1, lat: place.lat, lon: place.lon, slot }];
+    });
+  });
+}
+
+/**
+ * Where a badge sits by its stop, as Leaflet's `iconAnchor` (the stop's point within the badge's
+ * box). Its number (`numberPixels`, `--badge-size`) lies to the left of the stop and centered on
+ * it, clear of a marker `markerPixels` wide there (a raid's or a max battle's full marker; a gym's
+ * dot is smaller) by `BADGE_GAP`, the numbers of one stop side by side further out: their centers
+ * 35, 58, … pixels left of the stop beside a full marker of 44. The box, `boxPixels` square, a
+ * finger's least target (`--tap-size`, fix round 1, R1-4), is centered on the number and takes the
+ * taps round it (fix round 2, R2-1): its right edge stays clear of a gym's dot; it overlaps the
+ * left corners of a raid's or max battle's marker, which lies above it (`BADGE_Z_OFFSET`), and
+ * the boxes of neighboring numbers, where the later one takes a tap between them.
+ */
+export function badgeAnchor(
+  slot: number,
+  markerPixels: number,
+  numberPixels: number,
+  boxPixels: number,
+): [number, number] {
+  const center =
+    markerPixels / 2 + BADGE_GAP + numberPixels / 2 + slot * (numberPixels + BADGE_GAP);
+  return [center + boxPixels / 2, boxPixels / 2];
+}
+
+/** A badge's marker lies under the raids' and max battles' (Leaflet's `zIndexOffset`, R2-1). */
+export const BADGE_Z_OFFSET = -1000;
````

### Task 3: 8M-13 task 3: answers without list marks, the phone card nudged

Prototype commit: `1fcb4dedfa914deb11dfd2d6fc99f3ffda4a842e`

pageWords drops the bot's unescaped list marks at the starts of lines,
each item kept on its own line; a member's escaped mark stays (A1). A
form's answer keeps line breaks, as the notice band and the answer line
do.

A refusal moves the phone card itself: PhoneCard.nudge() bounces the
element it keeps, since the card's content is drawn anew under a press.
refusalMoves nudges the card that shows the party or holds the form,
else shakes the popup; the presses, the post's forms (refused) and the
raid's Change... go through it (A2). Only under prefers-reduced-motion:
no-preference.

**Files:**

```
 docs/architecture/testing.md                  |  2 +-
 docs/architecture/web.md                      |  2 ++
 src/web/answer-look.test.ts                   | 59 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/map.css                        | 26 ++++++++++++++++++++++++++
 src/web/client/party-layer.ts                 | 19 +++++++++++++++----
 src/web/client/phone-card.test.ts             | 91 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
 src/web/client/phone-card.ts                  | 34 ++++++++++++++++++++++++++++++++++
 src/web/client/post-forms-ui.isolated.test.ts | 39 ++++++++++++++++++++++++++++++++++++++-
 src/web/client/post-forms-ui.ts               | 12 +++++++++---
 src/web/client/press-answer.test.ts           | 59 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
 src/web/client/press-answer.ts                | 17 +++++++++++++++++
 src/web/client/theme.css                      |  3 +++
 src/web/page-words.test.ts                    | 20 ++++++++++++++++++++
 src/web/page-words.ts                         | 12 +++++++++++-
 src/web/stop-report-post.test.ts              |  4 ++--
 src/web/train-flow.test.ts                    | 98 ++++++++++++++------------------------------------------------------------------------------------
 src/web/train-split.test.ts                   |  7 ++++---
 test/support/stylesheets.ts                   | 98 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 18 files changed, 500 insertions(+), 102 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/answer-look.test.ts src/web/client/phone-card.test.ts src/web/client/post-forms-ui.isolated.test.ts src/web/client/press-answer.test.ts src/web/page-words.test.ts src/web/stop-report-post.test.ts src/web/train-flow.test.ts src/web/train-split.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1fcb4dedfa914deb11dfd2d6fc99f3ffda4a842e -- src test scripts docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-13 task 3: answers without list marks, the phone card nudged`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 6ee8deade9cae1309ed8307ccf578d1c92bd392c..23a0d7189c8550a01a68042f677d06d28d0d3ff5 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -93,7 +93,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. `showParties` drawing a list runs in `party-layer-draw.isolated.test.ts` (plan 8M-9A, reviews B1 to B9): Leaflet mocked down to layers and groups that say whether they are on the map, markers whose popup opens only there and tells the map before the layer (as Leaflet's), the circles drawn with their options; a page of `PageElement`s (attributes and `dataset`, the tree, simple selectors, bubbling clicks, the focus) with the document's own listeners (Escape, `visibilitychange`, which a test fires to have the list asked for again and drawn, `poll`); `fetch` answering `/api/parties` with the test's list; the theme, the list of what is on and the phone card stubbed (`fake.card`), and the hooks the party layer hands `raidUi` and `maxUi` taken as they are made (their `done`, `pickSpot`); route mode a stub of `trainUi`'s `spotClicked` (`fake.route`). It waits for each draw through `afterDraw`; its `started` takes an `activity` (`MapActivity`, plan 8M-10) to turn the region editor on and off under both pollers. The Power Spots' and PokéStops' dots (`showPlaces`) run over a Leaflet of dots and popups in `places-ui.isolated.test.ts`. Plan 8M-11B: the draw test records the lines drawn (`fake.shown.lines`, whose group says whether they are drawn now) and its map projects by a scale a test changes with `zoomedTo(pixels)`, which fires `zoomend` (a train's faint legs, its loop and its arrowheads); `train-line.test.ts` tests the legs and arrowheads over a projection of its own; `train-ui.isolated.test.ts` records the drag line (`dragLines`) and the held map (`map`: holds, held) for each way a drag ends; the gyms' layer (`showGymDots`) runs in `gyms-ui.isolated.test.ts` over a Leaflet of fakes that count the layers added to and taken off its group, the markers moved and a cluster's count written, with the party layer, `raid-forms`, `train-forms` and the theme mocked down to what it takes of them. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - Find on the map (plan 8M-12): the route over `stopReportingWith(rows)` and `stopWebWith(made.ctx)` (`find-places.test.ts`: the kept stops of `STOP_ROWS` and twelve "Little Free Library" rows for the cap of ten, the invented gyms, a `remoteAddress` of another address for the limit); the words and marks of reports over the real task list and lineups (`pageTask`, `pikachuTask`, `feedChoice`, `taskVersions` of the catalogue fixture, `report-search.test.ts`); the page's pure part over the cases of `stop-report-cases.ts`, which carry `words` as the server gives them, its timing over fake timers and a `places` that answers each text when the test says (`find.test.ts`); the rows and the scroll in `list-ui.test.ts` (`scroller` a plain object); a pick in `party-layer-draw.isolated.test.ts` (`raids.find`, `raids.findFirst`). Speed is measured by a scratch script over the Wayfarer export, never by a test.
-- The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node.
+- The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node. A test of what a stylesheet does (plan 8M-13: a train's flow, `train-flow.test.ts`; the answer lines and the card's nudge, `answer-look.test.ts`) reads it through `test/support/stylesheets.ts`: `clientSheet(file)` without comments, `themeTokens()` (the light set), `cssPixels(text, tokens)` (a length through `var()` and `calc`), `blockAt` and `motionBlock(css, selector)` (the reduced-motion block that holds a rule).
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand (whether it asks is its `active()`, the page's `MapActivity` since plan 8M-10: visible and the region editor off); the region editor's toggle over a fake document and a fake mount (`editor-toggle.test.ts`, plan 8M-10); the editor's places by layer, the warning ring of a cluster, the unsaved count and line, and where the editor is offered against `map.css` (plan 8M-11C: `editor-view.test.ts`, `editor-toggle.test.ts`, `staged-storage.test.ts`, `src/web/phone-header.test.ts`; `src/web/editor-clusters.test.ts` reads `editor.css`; the editor's clustered places over a Leaflet of fakes whose markers get a new element each time their group is put back on the map, as Leaflet's do, in `editor-places.isolated.test.ts`); the reports at stops' popups, list, filters and forms over the cases of `src/web/client/stop-report-cases.ts`, plan 8M-9B, which the page never imports); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index f86078541e84a0890bfb070055f2c859a433ff04..825a75b9a9d42fde9e91e24509a674ed06719805 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -343,6 +343,8 @@ Design `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, "Pl
 
 - **A train's direction (T1):** the arrowheads are 24 pixels. The legs ahead carry a slow flow: one more polyline per train over the points of its legs ahead, weight 2, `interactive: false`, in the train's line group, of classes `train-flow train-flow-line`; a loop's closing leg (Leaflet's `8 8`) takes `train-flow` itself. `map.css` gives `.train-flow` its pattern (`--flow-dash`, `--flow-gap`) and the animation `train-flow` (`--flow-time`, 2.5 s, linear, endless: the offset from 0 to minus one period, so the loop does not jump and the dashes run toward the line's last point), and the flow line its color (`--train-flow`), all under `@media (prefers-reduced-motion: no-preference)`; elsewhere `.train-flow-line` is hidden and the closing leg keeps its still dashes. The train being routed is not drawn by the parties' draw, so it has no flow. Each flowing path starts in step with the clock (fix round 1, R1-3): once Leaflet made it (`add`), `inFlowStep` sets its `animationDelay` through the CSSOM to `flowDelay(Date.now())`, minus the clock's place in the cycle (`FLOW_CYCLE_MS`, 2,500, `--flow-time`'s, held to it by `train-flow.test.ts`; both in `train-flow.ts`, a module without the DOM's types), so the paths a draw of the parties makes anew go on where the old ones were. `src/web/train-flow.test.ts` reads the stylesheets (a period, the media query).
 - **A train picked at any stop ahead (S7):** `stopBadges` (`train-line.ts`, pure) gives a badge per listing after the stop each train is at, numbered by its place in the route from 1 (the current stop keeps the ring; a finished train, and the stops a loop has done, get none; a stop the map cannot place is passed over), the badges of one stop (listed twice, or ahead of several trains) side by side by `slot`. `badgeAnchor(slot, raidFull, badgeSize, tapSize)` sets each number (`.number`, `--badge-size`, 20 px, the train's color, the number white) to the left of its stop, clear of a raid's full marker (`--raid-full`) by `BADGE_GAP` (3), centered on it, further slots further out: their centers 35, 58, 81 … px left of the stop. Each number sits in the middle of a box of a finger's size (`--tap-size`, 44 px; fix round 1, R1-4), class `train-badge`, empty to the eye, that takes the taps round it; the box is centered on its number (fix round 2, R2-1), so its right edge lies about 13 px left of the stop, clear of a gym's dot (8 px), and it overlaps only the left corners of a raid's or max battle's marker, which lies above it (`zIndexOffset` `BADGE_Z_OFFSET`, −1000) and keeps those taps. The boxes of one stop's neighboring numbers overlap; there Leaflet's order of the markers decides. `party-layer.ts` draws them in a group of the trains' layer from `BADGE_MIN_ZOOM` (15) up, anew at every draw and every `zoomend` (`drawBadges`, beside `drawArrows`); a tap opens the train's popup (`route:<id>`, else `train:<id>`) where the badge is. They take no click while the trains let clicks through (route mode, a place picked). Tests: `train-line.test.ts`, `party-layer-draw.isolated.test.ts`.
+- **Answers without Discord's list marks (A1):** `pageWords` writes the bot's list mark at the start of a line (`- ` or `* `, `LIST_MARK`) as a bullet, `• ` (fix round 1, R1-2: dropped, the items no longer read as a list), before the markdown and `unplain`, each item kept on its own line: a research report of several stops, Split…'s dialog text. A member's own mark arrives escaped (`\- `, `plain()`'s `bulletedList`) and stays as typed. Discord keeps its list. The notice band, the answer line and a form's answer (`.form-answer`) keep line breaks (`white-space: pre-line`; `src/web/answer-look.test.ts`).
+- **A refusal nudges the phone card (A2):** the card's content is drawn anew under a press, so the control pressed is out of it when the answer comes and `shake` found no card. `PhoneCard` moves itself: `nudge()` bounces the element it keeps once (`@keyframes nudge`, up by `--nudge-distance`, 6 px, and back over `--shake-time`, class `nudge` taken off and put back as `shake` does), only under `prefers-reduced-motion: no-preference`; `shows(partyId)` says whether its body holds that party's `.post`, `holds(element)` whether an element is in it. `refusalMoves(from, partyId, card)` (`press-answer.ts`) nudges the card that holds `from` or shows the party, else shakes `from`'s popup: the party layer's `answered`, the post's forms' refusal that keeps its form (`PostFormsDeps.refused`, in place of their own `shake`) and the raid's Change… (`RaidUiDeps.refused`) all go through it.
 
 ## Adding a route
 
diff --git a/src/web/answer-look.test.ts b/src/web/answer-look.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..241e7eec10db9a9ed4eeb060aeb1888d5ef6854f
--- /dev/null
+++ b/src/web/answer-look.test.ts
@@ -0,0 +1,59 @@
+import { describe, expect, it } from 'vitest';
+import {
+  clientSheet,
+  cssPixels,
+  motionBlock,
+  themeTokens,
+} from '../../test/support/stylesheets.js';
+
+/**
+ * Where the page answers (plan 8M-13, A1, A2): the lines that carry an answer keep its line
+ * breaks, and the phone card moves for a refusal with a small upward bounce, only where the device
+ * does not ask for less motion. Read from the stylesheets, as the browser reads them.
+ */
+
+/** The value of `property` in the rule of exactly `selector` (the first such rule), if any. */
+const valueIn = (css: string, selector: string, property: string): string | undefined => {
+  for (const rule of css.matchAll(/([^{}]*)\{([^{}]*)\}/gu)) {
+    const selectors = (rule[1] ?? '').split(',').map((one) => one.trim());
+    if (!selectors.includes(selector)) continue;
+    const found = new RegExp(String.raw`(?:^|;)\s*${property}\s*:\s*([^;]+)`, 'u').exec(
+      rule[2] ?? '',
+    );
+    if (found) return found[1]?.trim();
+  }
+  return undefined;
+};
+
+describe('the lines that answer (plan 8M-13, A1)', () => {
+  it('keep the line breaks of an answer: the notice band, the answer line, a form’s answer', () => {
+    const css = clientSheet('map.css');
+    for (const selector of ['#notice', '.post .press-answer', '.form-answer']) {
+      expect(valueIn(css, selector, 'white-space'), selector).toBe('pre-line');
+    }
+  });
+});
+
+describe('the phone card nudged (plan 8M-13, A2)', () => {
+  it('bounces up and back once, by --nudge-distance over --shake-time', () => {
+    const css = clientSheet('map.css');
+    const values = themeTokens();
+    const keyframes = /@keyframes\s+nudge\s*\{([\s\S]*?\})\s*\}/u.exec(css)?.[1] ?? '';
+    /** Each step of the keyframes (`0%`, `40%`, …) by how far up it moves the card. */
+    const steps = new Map<string, number>();
+    for (const rule of keyframes.matchAll(/([^{}]*)\{[^{}]*translateY\(([^;]+)\);[^{}]*\}/gu)) {
+      const moved = cssPixels((rule[2] ?? '').replace(/\)$/u, ''), values);
+      for (const step of (rule[1] ?? '').split(',')) steps.set(step.trim(), moved);
+    }
+    // Back where it was at both ends; up by the distance on the way.
+    expect(steps.get('0%')).toBe(0);
+    expect(steps.get('100%')).toBe(0);
+    expect(Math.min(...steps.values())).toBe(-cssPixels('var(--nudge-distance)', values));
+    expect(values.get('--nudge-distance')).toBe('6px');
+    const motion = motionBlock(css, '.party-card.nudge');
+    expect(valueIn(motion, '.party-card.nudge', 'animation')).toBe(
+      'nudge var(--shake-time) ease-out 1',
+    );
+    expect(css.replace(motion, '')).not.toMatch(/animation:\s*nudge/u);
+  });
+});
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 1de6d3dcf5e1691dafe91c69454e137b1b5fbe28..c7823381fe8a99aca59e4a1e18cbdab5f9ccb810 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -2215,6 +2215,32 @@ path.highlighted {
   }
 }
 
+/*
+ * The phone card bounces up and back once for a refusal (plan 8M-13, A2: it is drawn anew under a
+ * press, so it moves itself, `PhoneCard.nudge`), unless the device asks for less motion.
+ */
+@keyframes nudge {
+  0%,
+  100% {
+    transform: translateY(0);
+  }
+
+  40% {
+    transform: translateY(calc(-1 * var(--nudge-distance)));
+  }
+}
+
+@media (prefers-reduced-motion: no-preference) {
+  .party-card.nudge {
+    animation: nudge var(--shake-time) ease-out 1;
+  }
+}
+
+/* An answer under a form keeps its line breaks, as the notice band and the answer line do. */
+.form-answer {
+  white-space: pre-line;
+}
+
 /*
  * A train's flow (plan 8M-13, T1): the dashes of a thin line over its legs ahead, and those of a
  * loop's closing leg, move slowly along its way. The keyframes move them by exactly one period of
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 39e99c03fa7546c2484d9c6275bda98c3fd5851d..06f361a10f1b24f47ee3c780276c21bb4a6c9572 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -30,7 +30,13 @@ import { gymPopup as gymOwnPopup, renderNode, type MapGym, type PageNode } from
 import { FormHold, keepClicksInPopup, OpenPopup, reportOffered } from './raid-forms.js';
 import { formControls, raidUi } from './raid-ui.js';
 import { postFormsUi } from './post-forms-ui.js';
-import { ANSWER_MS, PressAnswers, shake, writeAnswer, type PressAnswer } from './press-answer.js';
+import {
+  ANSWER_MS,
+  PressAnswers,
+  refusalMoves,
+  writeAnswer,
+  type PressAnswer,
+} from './press-answer.js';
 import { showsParty } from './post-forms.js';
 import { spawnPoint } from './spawn-forms.js';
 import { spawnUi } from './spawn-ui.js';
@@ -880,13 +886,14 @@ export function showParties(
   /**
    * An answer of a press or a form on a party (plan 8M-11A, S9, S20): kept for its post's answer
    * line, written into the lines drawn now (the notice where the party shows none: its popup not
-   * drawn from its post yet), its popup or card shaken for a refusal, and taken out of the lines
+   * drawn from its post yet), its popup shaken or its card nudged for a refusal (plan 8M-13, A2:
+   * the card that shows the party, though the control pressed was drawn anew), and taken out of the lines
    * after `ANSWER_MS` unless a newer one came.
    */
   const answered = (partyId: string, answer: PressAnswer, from: Element): void => {
     answers.set(partyId, answer);
     if (!writeAnswer(document, partyId, answer)) say(answer.text);
-    if (!answer.ok) shake(from);
+    if (!answer.ok) refusalMoves(from, partyId, card);
     window.setTimeout(() => {
       if (answers.of(partyId) === undefined) writeAnswer(document, partyId, undefined);
     }, ANSWER_MS);
@@ -963,6 +970,10 @@ export function showParties(
     answered: (party, answer, from) => {
       answered(party.id, answer, from);
     },
+    // A refusal said under a form that stays: its card nudged, its popup shaken (plan 8M-13, A2).
+    refused: (party, form) => {
+      refusalMoves(form, party.id, card);
+    },
   });
 
   const press = async (button: HTMLButtonElement): Promise<void> => {
@@ -2034,7 +2045,7 @@ export function showParties(
       answered(raidId, answer, from);
     },
     refused: (form) => {
-      shake(form);
+      refusalMoves(form, undefined, card);
     },
     guild,
     csrf: {
diff --git a/src/web/client/phone-card.test.ts b/src/web/client/phone-card.test.ts
index 7777ca329586e24de8bd0a43dab634d63df00947..3e68b8a0fccfc8c0959912f1649b2b774463785c 100644
--- a/src/web/client/phone-card.test.ts
+++ b/src/web/client/phone-card.test.ts
@@ -41,7 +41,20 @@ class FakeElement {
       this.className = [...names].join(' ');
     },
     contains: (name: string) => this.className.split(' ').includes(name),
+    add: (name: string) => {
+      this.classList.toggle(name, true);
+    },
+    remove: (name: string) => {
+      this.classList.toggle(name, false);
+    },
   };
+  readonly dataset: Record<string, string> = {};
+  /** How many times a size was read (the browser's restyle before a class comes back). */
+  sizeReads = 0;
+  get offsetWidth(): number {
+    this.sizeReads += 1;
+    return 0;
+  }
 
   constructor(
     readonly tagName: string,
@@ -64,14 +77,37 @@ class FakeElement {
     this.attributes.set(name, value);
   }
 
-  addEventListener(type: string, listener: (event: unknown) => void): void {
-    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
+  addEventListener(
+    type: string,
+    listener: (event: unknown) => void,
+    options?: { once?: boolean },
+  ): void {
+    const run =
+      options?.once === true
+        ? (event: unknown) => {
+            this.listeners.set(
+              type,
+              (this.listeners.get(type) ?? []).filter((one) => one !== run),
+            );
+            listener(event);
+          }
+        : listener;
+    this.listeners.set(type, [...(this.listeners.get(type) ?? []), run]);
   }
 
   fire(type: string, event: object = {}): void {
     for (const listener of this.listeners.get(type) ?? []) listener(event);
   }
 
+  /** Every element under it of one class (`.name`). */
+  querySelectorAll(selector: string): FakeElement[] {
+    const name = selector.replace(/^\./u, '');
+    return this.children.flatMap((child) => [
+      ...(child.classList.contains(name) ? [child] : []),
+      ...child.querySelectorAll(selector),
+    ]);
+  }
+
   focus(): void {
     this.doc.activeElement = this;
   }
@@ -236,4 +272,55 @@ describe('the phone card on the page (review 8A-1, 8A-8)', () => {
     card.refresh(() => summary as unknown as HTMLElement);
     expect(element.attributes.get('aria-label')).toBe('Library');
   });
+
+  // Plan 8M-13 (A2): the card is drawn anew under a press, so it moves itself for a refusal.
+  describe('nudged for a refusal', () => {
+    /** A post of the party `id` with a button in it, as the popup's content draws it. */
+    const postOf = (doc: FakeDocument, id: string) => {
+      const content = doc.createElement('div');
+      const post = doc.createElement('div');
+      post.className = 'post';
+      post.dataset.post = id;
+      const button = doc.createElement('button');
+      post.append(button);
+      content.append(post);
+      return { content, button };
+    };
+
+    it('bounces once per refusal, again for the next one, on the element it keeps', () => {
+      const { card, element } = opened();
+      card.nudge();
+      expect(element.classList.contains('nudge')).toBe(true);
+      // Taken off and read before it comes back, so that a second refusal bounces again.
+      const reads = element.sizeReads;
+      card.nudge();
+      expect(element.sizeReads).toBe(reads + 1);
+      expect(element.classList.contains('nudge')).toBe(true);
+      element.fire('animationend');
+      expect(element.classList.contains('nudge')).toBe(false);
+    });
+
+    it('does not move while closed', () => {
+      const { card, element } = opened();
+      card.close();
+      card.nudge();
+      expect(element.classList.contains('nudge')).toBe(false);
+    });
+
+    it("says whether it shows a party's post, and holds an element, through its redraws", () => {
+      const { doc, card } = opened();
+      const first = postOf(doc, 'r1');
+      card.open('gym:1', () => first.content as unknown as HTMLElement);
+      expect(card.shows('r1')).toBe(true);
+      expect(card.shows('r2')).toBe(false);
+      expect(card.holds(first.button as unknown as Element)).toBe(true);
+      // Drawn anew: the button pressed is gone, the party still shown.
+      const again = postOf(doc, 'r1');
+      card.refresh(() => again.content as unknown as HTMLElement);
+      expect(card.holds(first.button as unknown as Element)).toBe(false);
+      expect(card.shows('r1')).toBe(true);
+      card.close();
+      expect(card.shows('r1')).toBe(false);
+    });
+  });
 });
diff --git a/src/web/client/phone-card.ts b/src/web/client/phone-card.ts
index a4ed2db6ed6021abcb67800ff5a17788f17e8907..9a04247d496a6ac21b65def8b0f93a73b54a5fdd 100644
--- a/src/web/client/phone-card.ts
+++ b/src/web/client/phone-card.ts
@@ -127,6 +127,40 @@ export class PhoneCard {
     if (this.state !== 'closed') this.go('closed');
   }
 
+  /**
+   * A refusal (plan 8M-13, A2): a small upward bounce of the card, on the element it keeps (its
+   * content is drawn anew under a press, so a control pressed is no longer in it when the answer
+   * comes). The class taken off and a size read before it comes back, so that the next refusal
+   * bounces again; `map.css` runs it only where the device allows motion.
+   */
+  nudge(): void {
+    if (this.state === 'closed' || !this.parts) return;
+    const { element } = this.parts;
+    element.classList.remove('nudge');
+    void element.offsetWidth;
+    element.classList.add('nudge');
+    element.addEventListener(
+      'animationend',
+      () => {
+        element.classList.remove('nudge');
+      },
+      { once: true },
+    );
+  }
+
+  /** Whether the card shows the post of the party `partyId` now. */
+  shows(partyId: string): boolean {
+    if (this.state === 'closed' || !this.parts) return false;
+    return [...this.parts.body.querySelectorAll<HTMLElement>('.post')].some(
+      (post) => post.dataset.post === partyId,
+    );
+  }
+
+  /** Whether `element` is in the card now (a form drawn in it). */
+  holds(element: Element): boolean {
+    return this.state !== 'closed' && this.parts?.element.contains(element) === true;
+  }
+
   private go(state: CardState): void {
     const { element, handle, body } = this.made();
     const was = this.state;
diff --git a/src/web/client/post-forms-ui.isolated.test.ts b/src/web/client/post-forms-ui.isolated.test.ts
index 7a6e498638854fab51d316e5b5ea94251f472b7a..08931b6888658df351e568a26687dfd5d550a8dd 100644
--- a/src/web/client/post-forms-ui.isolated.test.ts
+++ b/src/web/client/post-forms-ui.isolated.test.ts
@@ -105,6 +105,8 @@ function page() {
   const closed: unknown[] = [];
   /** What the forms answered into the post's answer line (plan 8M-11A, S9). */
   const answers: { party: string; text: string; ok: boolean }[] = [];
+  /** The refusals that kept their form, moving its popup or card (plan 8M-13, A2). */
+  const moved: { party: string; form: string }[] = [];
   let drawn: () => void = () => undefined;
   const done = new Promise<void>((resolve) => {
     drawn = resolve;
@@ -128,8 +130,11 @@ function page() {
     answered: (party, answer) => {
       answers.push({ party: party.id, ...answer });
     },
+    refused: (party, from) => {
+      moved.push({ party: party.id, form: from.className });
+    },
   });
-  return { ui, button, post, done, redrawn: () => redrawn, closed, answers };
+  return { ui, button, post, done, redrawn: () => redrawn, closed, answers, moved };
 }
 
 /**
@@ -224,6 +229,7 @@ function popupPage(data: string, answer: { status: number; body: unknown }) {
       });
       told();
     },
+    refused: () => undefined,
   });
   return {
     ui,
@@ -393,6 +399,37 @@ describe('the forms of the post’s controls in the page (plan 8M-8B)', () => {
     await done;
     expect(closed).toEqual([staffs]);
   });
+
+  // Plan 8M-13 (A2): a refusal that keeps its form moves the form's popup or card as the page
+  // decides (the card nudged where it holds the form), not by a shake of its own.
+  it('hands a refusal that keeps its form to the page, with the form, said under it', async () => {
+    const { ui, button, post, answers, moved } = page();
+    const refusal = 'You may not delete this raid.';
+    let refused: () => void = () => undefined;
+    const said = new Promise<void>((resolve) => {
+      refused = resolve;
+    });
+    vi.stubGlobal('fetch', () => {
+      refused();
+      return Promise.resolve({
+        ok: false,
+        status: 422,
+        json: () => Promise.resolve({ ok: false, text: refusal }),
+      });
+    });
+    const staffs = { ...raid, close: { mayDelete: false, forum: '#west-raids', word: 'raid' } };
+    ui.closeClicked(button as unknown as HTMLButtonElement, staffs);
+    await Promise.resolve();
+    await Promise.resolve();
+    post.querySelector('button[data-submit]')?.dispatch('click');
+    await said;
+    await focusOn(undefined);
+    expect(moved).toHaveLength(1);
+    expect(moved[0]?.party).toBe('r1');
+    // The form stays, its words under it; nothing in the answer line.
+    expect(post.querySelector('button[data-submit]')).not.toBeNull();
+    expect(answers).toEqual([]);
+  });
 });
 
 describe("a train's forms in the page (plan 8M-8C)", () => {
diff --git a/src/web/client/post-forms-ui.ts b/src/web/client/post-forms-ui.ts
index 65008767ebd31b181480a3627510b0a52bf99138..b0ea6caa8e4de0b9d8ea73fe7311bd95cd686cad 100644
--- a/src/web/client/post-forms-ui.ts
+++ b/src/web/client/post-forms-ui.ts
@@ -31,7 +31,7 @@ import {
 import { sameControl } from './list-ui.js';
 import { formPlace, type FormHold } from './raid-forms.js';
 import { fieldsOf, sayInForm } from './raid-ui.js';
-import { shake, type PressAnswer } from './press-answer.js';
+import type { PressAnswer } from './press-answer.js';
 
 /**
  * The post's controls that open a dialog on Discord, as forms of the live map in the page (plan
@@ -62,6 +62,11 @@ export interface PostFormsDeps {
    * popup or card a refusal shakes.
    */
   answered(party: MapParty, answer: PressAnswer, from: HTMLElement): void;
+  /**
+   * A refusal said under a form that stays (plan 8M-13, A2): the page moves the form's popup or
+   * card (`refusalMoves`: the card bounces, a popup shakes).
+   */
+  refused(party: MapParty, form: HTMLElement): void;
 }
 
 export function postFormsUi(deps: PostFormsDeps) {
@@ -152,10 +157,11 @@ export function postFormsUi(deps: PostFormsDeps) {
       deps.csrf.set(sent.csrf);
       for (const each of buttons) each.disabled = false;
       // A refusal keeps the form, unless its choices may be stale (review W-2: Group…'s came with
-      // the list, which is asked for again): said under the form, which shakes (plan 8M-11A).
+      // the list, which is asked for again): said under the form, whose popup or card the page
+      // moves (plan 8M-11A; plan 8M-13, A2).
       if (formStep(sent, { refusalCloses: loaded.refusalCloses === true }) === 'stay') {
         sayInForm(element, sent.text);
-        shake(element);
+        deps.refused(party, element);
         target.focus();
         return;
       }
diff --git a/src/web/client/press-answer.test.ts b/src/web/client/press-answer.test.ts
index bf86a78a19efcc555ecbc337bf6d79546c94a7f3..da44bfe7d416b9fbb54665a0e3538b6c71e555cc 100644
--- a/src/web/client/press-answer.test.ts
+++ b/src/web/client/press-answer.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest';
-import { ANSWER_MS, answerLine, PressAnswers } from './press-answer.js';
+import { ANSWER_MS, answerLine, PressAnswers, refusalMoves } from './press-answer.js';
 
 describe('the answers of presses, by party (plan 8M-11A, S9)', () => {
   it('keeps an answer for ten seconds, the newest in the place of the one before', () => {
@@ -26,3 +26,60 @@ describe('the answers of presses, by party (plan 8M-11A, S9)', () => {
     expect(answerLine({ text: 'No.', ok: false }).className).toBe('press-answer refused');
   });
 });
+
+// Plan 8M-13 (A2): the card is drawn anew under a press; the popup is not.
+describe('what a refusal moves (refusalMoves)', () => {
+  /** A popup's box with its classes, and a control in it. */
+  const popupControl = () => {
+    const classes = new Set<string>();
+    const box = {
+      classList: {
+        add: (name: string) => classes.add(name),
+        remove: (name: string) => classes.delete(name),
+      },
+      offsetWidth: 0,
+      addEventListener: () => undefined,
+    };
+    const control = {
+      closest: (selector: string) => (selector.includes('.leaflet-popup') ? box : null),
+    };
+    return { control: control as unknown as Element, classes };
+  };
+  /** The phone card: whether it shows the party or holds the control, and its nudges. */
+  const cardThat = (shows: string | undefined, holds: boolean) => {
+    const nudges: number[] = [];
+    return {
+      nudges,
+      card: {
+        shows: (partyId: string) => partyId === shows,
+        holds: () => holds,
+        nudge: () => {
+          nudges.push(1);
+        },
+      },
+    };
+  };
+
+  it('nudges the card that shows the party, though the control pressed is gone from it', () => {
+    const { control, classes } = popupControl();
+    const { card, nudges } = cardThat('r1', false);
+    refusalMoves(control, 'r1', card);
+    expect(nudges).toEqual([1]);
+    expect(classes.has('shake')).toBe(false);
+  });
+
+  it('nudges the card that holds the form refused', () => {
+    const { control } = popupControl();
+    const { card, nudges } = cardThat(undefined, true);
+    refusalMoves(control, undefined, card);
+    expect(nudges).toEqual([1]);
+  });
+
+  it('shakes the popup otherwise', () => {
+    const { control, classes } = popupControl();
+    const { card, nudges } = cardThat('r2', false);
+    refusalMoves(control, 'r1', card);
+    expect(nudges).toEqual([]);
+    expect(classes.has('shake')).toBe(true);
+  });
+});
diff --git a/src/web/client/press-answer.ts b/src/web/client/press-answer.ts
index 5f672f251e97a220a0fbd2561585e46c4cc10f05..a1a46ff9151b4e3b5b125d9f73ae1fdc9e690168 100644
--- a/src/web/client/press-answer.ts
+++ b/src/web/client/press-answer.ts
@@ -70,6 +70,23 @@ export function writeAnswer(
   return lines.length > 0;
 }
 
+/** What `refusalMoves` asks of the phone card (`PhoneCard`). */
+export interface NudgingCard {
+  shows(partyId: string): boolean;
+  holds(element: Element): boolean;
+  nudge(): void;
+}
+
+/**
+ * What a refusal moves (plan 8M-13, A2): the phone card bounces where it shows the party's post
+ * (its content drawn anew since the press, so `from` is out of it) or holds `from` (a form in
+ * it); else the popup of `from` shakes, as Leaflet keeps its element.
+ */
+export function refusalMoves(from: Element, partyId: string | undefined, card: NudgingCard): void {
+  if (card.holds(from) || (partyId !== undefined && card.shows(partyId))) card.nudge();
+  else shake(from);
+}
+
 /**
  * Shakes the popup or card of `from` once (a refusal): the class taken off and put back, so that a
  * second refusal shakes again; `map.css` runs it only where the device allows motion.
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index 3a67a97d64505429c5e12d39d8458cc9faadda5d..f6f99fdc4afec14ad8ae896074d2d25ac384b68d 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -34,6 +34,8 @@
   /* A refusal shakes its popup or card once (plan 8M-11A): how long, and how far each way. */
   --shake-time: 300ms;
   --shake-distance: 6px;
+  /* The phone card bounces up for a refusal instead (plan 8M-13, A2), over --shake-time. */
+  --nudge-distance: 6px;
   /* The least a finger's button is, on a coarse pointer (plan 8M-11A, S3). */
   --tap-size: 44px;
   /* A train's stop badge (plan 8M-13, S7): its number's circle, in a box of --tap-size. */
@@ -189,6 +191,7 @@
     --fix-box-width: 340px;
     --shake-time: 300ms;
     --shake-distance: 6px;
+    --nudge-distance: 6px;
     --tap-size: 44px;
     --badge-size: 20px;
 
diff --git a/src/web/page-words.test.ts b/src/web/page-words.test.ts
index 1fa1bdec1e94ec96a469949022b9ebefa1f4ae48..ba20b5c311f8448bc3024b9f682f3c3f06080a4c 100644
--- a/src/web/page-words.test.ts
+++ b/src/web/page-words.test.ts
@@ -65,4 +65,24 @@ describe('the words of a command as the map shows them (pageWords)', () => {
       'At Gym [old] north_hills [sic]',
     );
   });
+
+  // Plan 8M-13 (A1): a research report of several stops lists them as Discord's list.
+  // Fix round 1 (R1-2): a bullet in the mark's place, so that the items still read as a list.
+  it("writes the bot's list marks at the starts of lines as bullets, each item on its own line", () => {
+    expect(
+      pageWords(
+        '**Catch 5 Pokémon** · Pikachu\n- Yellow Mural\n- Blue Door\n* Red Bench',
+        ZONE,
+        NOW,
+      ),
+    ).toBe('Catch 5 Pokémon · Pikachu\n• Yellow Mural\n• Blue Door\n• Red Bench');
+    // A mark inside a line is a member's or no mark at all.
+    expect(pageWords('Left - right * up', ZONE, NOW)).toBe('Left - right * up');
+  });
+
+  it("keeps a member's own escaped list mark as they wrote it", () => {
+    // `plain()` escapes a member's line-start mark (`bulletedList`).
+    expect(pageWords('\\- my notes\n- Yellow Mural', ZONE, NOW)).toBe('- my notes\n• Yellow Mural');
+    expect(pageWords('\\* starred', ZONE, NOW)).toBe('* starred');
+  });
 });
diff --git a/src/web/page-words.ts b/src/web/page-words.ts
index 5b9663a5d5ed6a885ba6a7b5d0bfed977791fc97..618fafe26317648a0398b3828a501e7c44a5e5a9 100644
--- a/src/web/page-words.ts
+++ b/src/web/page-words.ts
@@ -14,13 +14,22 @@ const TIMESTAMP = /<t:(-?\d+)(?::([tTdDfFR]))?>/gu;
  */
 const ESCAPE_LINK_OR_MARKDOWN = /\\.|\[((?:\\.|[^\]\\])*)\]\((?:<[^>\s]*>|[^)\s]*)\)|`|\*\*/gsu;
 
+/**
+ * A list mark of the bot's at the start of a line (`- ` or `* `, plan 8M-13, A1: a research
+ * report of several stops). A member's own arrives escaped (`\- `, `plain()`'s `bulletedList`)
+ * and is no mark here. The page writes a bullet (`• `) in its place (fix round 1, R1-2), so that
+ * the items still read as a list.
+ */
+const LIST_MARK = /^[ \t]*[-*][ \t]+/gmu;
+
 /**
  * The words of a command as the live map shows them, as plain text (plans 8M-4, 8M-5): Discord's
  * timestamps as clock times in the posts' zone (`clockTime`, as the page writes times) and a
  * relative one as how long until then or since as Discord's client says it (`relativeStamp`, plan
  * 8M-11A: "in 5 hours", "in a day"; in English, the bot's language), the
  * bot's masked links as their text (the page links nothing of a command's words), the bot's own
- * markdown taken out (escapes kept as they are), then the escapes of what members and feeds
+ * markdown taken out and its list marks at the starts of lines written as bullets (escapes kept
+ * as they are; each item stays on its own line), then the escapes of what members and feeds
  * wrote undone (`unplain`). Pure.
  */
 export function pageWords(text: string, zone: string, now: number): string {
@@ -31,6 +40,7 @@ export function pageWords(text: string, zone: string, now: number): string {
           ? relativeStamp(Number(seconds) * 1000, now, 'en-US')
           : clockTime(Number(seconds) * 1000, zone, now),
       )
+      .replace(LIST_MARK, '• ')
       .replace(ESCAPE_LINK_OR_MARKDOWN, (match, linked: string | undefined) =>
         match.startsWith('\\') ? match : (linked ?? ''),
       ),
diff --git a/src/web/stop-report-post.test.ts b/src/web/stop-report-post.test.ts
index 2880d70c085f33060245eb6f28fbff97d1b34c9b..42d434ece3e9e5821fa08045993d16d09c259c2a 100644
--- a/src/web/stop-report-post.test.ts
+++ b/src/web/stop-report-post.test.ts
@@ -359,7 +359,7 @@ describe('reports at stops from the map', () => {
       expect(answer.json.ok).toBe(true);
       expect(answer.json.text).toBe(
         'Catch a Dragon-type Pokémon · one of Dratini, Bagon, Axew\n' +
-          '- Yellow Mural\n- Paititi Inti\n' +
+          '• Yellow Mural\n• Paititi Inti\n' +
           'In "Today’s Stops" on the board of #west, until midnight.',
       );
       expect(
@@ -464,7 +464,7 @@ describe('reports at stops from the map', () => {
         stops: [wayspotId(2)],
       });
       expect(again.status).toBe(200);
-      expect(again.json.text).toMatch(/^Win 3 raids in the rain · Rare Candy\n- Paititi Inti\n/);
+      expect(again.json.text).toMatch(/^Win 3 raids in the rain · Rare Candy\n• Paititi Inti\n/);
       expect(again.json.research?.[0]).toMatchObject({
         task: first?.task,
         text: 'Win 3 raids in the rain',
diff --git a/src/web/train-flow.test.ts b/src/web/train-flow.test.ts
index 9b750e16b6507ae9db24e27756cc655aedc68d03..8350427c8b115a3dd1dea0a3cf7dad821a777604 100644
--- a/src/web/train-flow.test.ts
+++ b/src/web/train-flow.test.ts
@@ -1,6 +1,10 @@
-import { readFileSync } from 'node:fs';
-import path from 'node:path';
 import { describe, expect, it } from 'vitest';
+import {
+  clientSheet,
+  cssPixels,
+  motionBlock,
+  themeTokens,
+} from '../../test/support/stylesheets.js';
 import { FLOW_CYCLE_MS, flowDelay } from './client/train-flow.js';
 
 /**
@@ -9,101 +13,27 @@ import { FLOW_CYCLE_MS, flowDelay } from './client/train-flow.js';
  * jump. Read from the stylesheets, as the browser reads them.
  */
 
-const CLIENT = path.resolve(import.meta.dirname, 'client');
-const read = (file: string): string =>
-  readFileSync(path.join(CLIENT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
-
-/** The light set of `theme.css`'s custom properties, by name. */
-function tokens(): Map<string, string> {
-  const light = /^\s*:root\s*\{([^{}]*)\}/u.exec(read('theme.css'))?.[1] ?? '';
-  return new Map(
-    [...light.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gu)].map((match) => [
-      match[1] ?? '',
-      (match[2] ?? '').trim(),
-    ]),
-  );
-}
-
-/** A length of the stylesheet in pixels: `var(…)` of the tokens, `calc` of + − × and brackets. */
-function pixels(text: string, values: Map<string, string>): number {
-  const resolved = text
-    .replace(/var\((--[a-z0-9-]+)\)/gu, (_whole, name: string) => {
-      const value = values.get(name);
-      if (value === undefined) throw new Error(`${name} is not in theme.css`);
-      return `(${value})`;
-    })
-    .replace(/calc\(/gu, '(')
-    .replace(/px/gu, '');
-  const parts = resolved.match(/\d+(?:\.\d+)?|[-+*()]/gu) ?? [];
-  let at = 0;
-  const sum = (): number => {
-    let total = product();
-    while (parts[at] === '+' || parts[at] === '-') {
-      const sign = parts[at] === '+' ? 1 : -1;
-      at += 1;
-      total += sign * product();
-    }
-    return total;
-  };
-  const product = (): number => {
-    let total = unit();
-    while (parts[at] === '*') {
-      at += 1;
-      total *= unit();
-    }
-    return total;
-  };
-  const unit = (): number => {
-    const part = parts[at];
-    at += 1;
-    if (part === '-') return -unit();
-    if (part === '(') {
-      const inner = sum();
-      at += 1;
-      return inner;
-    }
-    return Number(part);
-  };
-  return sum();
-}
-
-/** The body of the first `@media` block with this condition (one level of nesting). */
-function mediaBlock(css: string, condition: RegExp): string {
-  const start = css.search(condition);
-  if (start < 0) return '';
-  const open = css.indexOf('{', start);
-  let depth = 0;
-  for (let at = open; at < css.length; at += 1) {
-    if (css[at] === '{') depth += 1;
-    if (css[at] === '}') depth -= 1;
-    if (depth === 0) return css.slice(open + 1, at);
-  }
-  return '';
-}
-
-const MOTION = /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^@]*?\.train-flow/u;
-
 describe("a train's flow (plan 8M-13, T1)", () => {
   it('reads lengths through the tokens', () => {
     const values = new Map([
       ['--a', '8px'],
       ['--b', '4px'],
     ]);
-    expect(pixels('calc(-1 * (var(--a) + var(--b)))', values)).toBe(-12);
+    expect(cssPixels('calc(-1 * (var(--a) + var(--b)))', values)).toBe(-12);
   });
 
   it('moves the dashes by one whole period, forward along the line, in a loop', () => {
-    const css = read('map.css');
-    const values = tokens();
+    const css = clientSheet('map.css');
+    const values = themeTokens();
     const keyframes = /@keyframes\s+train-flow\s*\{([\s\S]*?\})\s*\}/u.exec(css)?.[1] ?? '';
     const offsets = [...keyframes.matchAll(/stroke-dashoffset:\s*([^;]+);/gu)].map((match) =>
-      pixels(match[1] ?? '', values),
+      cssPixels(match[1] ?? '', values),
     );
-    const motion = mediaBlock(css, MOTION);
+    const motion = motionBlock(css, '.train-flow');
     const pattern = /\.train-flow\s*\{[^}]*stroke-dasharray:\s*([^;]+);/u.exec(motion)?.[1] ?? '';
     const period = pattern
       .split(/\s+(?![^(]*\))/u)
-      .map((part) => pixels(part, values))
+      .map((part) => cssPixels(part, values))
       .reduce((total, part) => total + part, 0);
     expect(period).toBeGreaterThan(0);
     // From 0 to minus a period: the dashes run from the line's first point toward its last.
@@ -124,8 +54,8 @@ describe("a train's flow (plan 8M-13, T1)", () => {
   });
 
   it('moves nothing and hides the flow line where the device asks for less motion', () => {
-    const css = read('map.css');
-    const motion = mediaBlock(css, MOTION);
+    const css = clientSheet('map.css');
+    const motion = motionBlock(css, '.train-flow');
     // Every rule of the flow but the hidden line's is inside the media query.
     const outside = css.replace(motion, '');
     expect(outside).not.toMatch(/animation:\s*train-flow/u);
diff --git a/src/web/train-split.test.ts b/src/web/train-split.test.ts
index 3771a95007d893256d8d480316c7c7af616e4277..4715b17d3483dc8ec9993e39677faea9b29b3ad7 100644
--- a/src/web/train-split.test.ts
+++ b/src/web/train-split.test.ts
@@ -140,10 +140,11 @@ describe('Split… of a train on the map (plan 8M-8C)', () => {
     expect(opened.json.text.split('\n')).toEqual([
       'Group B (Fast) leaves Saturday legendaries and becomes a train of its own, Saturday ' +
         'legendaries (Fast):',
-      '- the same route, at the same stop (stop 2 of 3: The Stacks), the same end mode, boss ' +
+      // Discord's list marks as bullets (plan 8M-13, A1, fix round 1), each item on its own line.
+      '• the same route, at the same stop (stop 2 of 3: The Stacks), the same end mode, boss ' +
         'and start',
-      '- Alice and Bob move to it as they are signed up now',
-      '- you are its conductor',
+      '• Alice and Bob move to it as they are signed up now',
+      '• you are its conductor',
       '',
       'Submit splits it off.',
     ]);
diff --git a/test/support/stylesheets.ts b/test/support/stylesheets.ts
new file mode 100644
index 0000000000000000000000000000000000000000..4b1a05fbbe37acfe8e7d0452df8ad7a90902d6fc
--- /dev/null
+++ b/test/support/stylesheets.ts
@@ -0,0 +1,98 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+
+/**
+ * The web page's stylesheets as tests read them (plan 8M-13): a file of `src/web/client/` without
+ * its comments, `theme.css`'s light values, a length worked out through them, and the body of a
+ * media query.
+ */
+
+const CLIENT = path.resolve(import.meta.dirname, '../../src/web/client');
+
+/** A stylesheet of the page's folder, its comments taken out. */
+export function clientSheet(file: string): string {
+  return readFileSync(path.join(CLIENT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');
+}
+
+/** The light set of `theme.css`'s custom properties (its first `:root` block), by name. */
+export function themeTokens(): Map<string, string> {
+  const light = /^\s*:root\s*\{([^{}]*)\}/u.exec(clientSheet('theme.css'))?.[1] ?? '';
+  return new Map(
+    [...light.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gu)].map((match) => [
+      match[1] ?? '',
+      (match[2] ?? '').trim(),
+    ]),
+  );
+}
+
+/** A length of a stylesheet in pixels: `var(…)` of `values`, `calc` of + − × and brackets. */
+export function cssPixels(text: string, values: ReadonlyMap<string, string>): number {
+  const resolved = text
+    .replace(/var\((--[a-z0-9-]+)\)/gu, (_whole, name: string) => {
+      const value = values.get(name);
+      if (value === undefined) throw new Error(`${name} is not in theme.css`);
+      return `(${value})`;
+    })
+    .replace(/calc\(/gu, '(')
+    .replace(/px/gu, '');
+  const parts = resolved.match(/\d+(?:\.\d+)?|[-+*()]/gu) ?? [];
+  let at = 0;
+  const sum = (): number => {
+    let total = product();
+    while (parts[at] === '+' || parts[at] === '-') {
+      const sign = parts[at] === '+' ? 1 : -1;
+      at += 1;
+      total += sign * product();
+    }
+    return total;
+  };
+  const product = (): number => {
+    let total = unit();
+    while (parts[at] === '*') {
+      at += 1;
+      total *= unit();
+    }
+    return total;
+  };
+  const unit = (): number => {
+    const part = parts[at];
+    at += 1;
+    if (part === '-') return -unit();
+    if (part === '(') {
+      const inner = sum();
+      at += 1;
+      return inner;
+    }
+    return Number(part);
+  };
+  return sum();
+}
+
+/** The body of the first block that `start` finds the head of (an `@media`), braces counted. */
+export function blockAt(css: string, start: RegExp): string {
+  const found = css.search(start);
+  if (found < 0) return '';
+  const open = css.indexOf('{', found);
+  let depth = 0;
+  for (let at = open; at < css.length; at += 1) {
+    if (css[at] === '{') depth += 1;
+    if (css[at] === '}') depth -= 1;
+    if (depth === 0) return css.slice(open + 1, at);
+  }
+  return '';
+}
+
+/**
+ * The body of the `@media (prefers-reduced-motion: no-preference)` block whose first rules name
+ * `selector` (before any other at-rule).
+ */
+export function motionBlock(css: string, selector: string): string {
+  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
+  return blockAt(
+    css,
+    new RegExp(
+      String.raw`@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{[^@]*?${escaped}`,
+      'u',
+    ),
+  );
+}
````

### Task 4: 8M-13 task 4: what a visitor sees, and three checklist fixes

Prototype commit: `c0a8946c494fc8b193db4a66f681098f50f2b5fb`

A visitor is offered only Gyms and Region outlines: Raids, Trains,
Meetups and Wild spawns are members-only like the reports at stops, the
PokéStops and the Power Spots (L1); the visitor's pane keeps Campfire's
line. On a phone the not-a-member line and "Join the server on Discord"
stack at the left, the button as wide as its words (I1). Gyms off hides
"Find a gym"'s matches; on again shows them while the text stands (L2).

The staging checklists of 8M-11A (step 5: Done is off on an egg; the
card's refusal now bounces) and 8M-11C (step 25: a stretch with a place
in it; step 27: Chrome's Request conditions, a reload) set right.

**Files:**

```
 docs/architecture/web.md                                 |  3 ++-
 docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md |  6 +++---
 docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md |  4 ++--
 src/web/client/gym-dots.test.ts                          | 11 ++++++++---
 src/web/client/gym-dots.ts                               | 11 ++++++-----
 src/web/client/gyms-ui.isolated.test.ts                  | 41 ++++++++++++++++++++++++++++++++++++-----
 src/web/client/gyms-ui.ts                                | 14 +++++++++++++-
 src/web/client/layer-registry.test.ts                    | 24 ++++++++++++++++++++----
 src/web/client/layer-registry.ts                         | 32 +++++++++++++++++++++++++-------
 src/web/client/main.ts                                   |  5 +++--
 src/web/client/map.css                                   | 12 +++++++++---
 src/web/phone-header.test.ts                             | 15 ++++++++++++++-
 12 files changed, 141 insertions(+), 37 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/gym-dots.test.ts src/web/client/gyms-ui.isolated.test.ts src/web/client/layer-registry.test.ts src/web/phone-header.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff c0a8946c494fc8b193db4a66f681098f50f2b5fb -- src test scripts docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-13 task 4: what a visitor sees, and three checklist fixes`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 825a75b9a9d42fde9e91e24509a674ed06719805..979bcfa056a803b3fe36748c267e42ba320a4fad 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -47,7 +47,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **The start view** (`startView`, the first rule that applies): (1) your location, at street level (`STREET_ZOOM`, 15), when the browser granted it already (`alreadyGranted`, `your-location.ts`: `navigator.permissions.query({ name: 'geolocation' })` is `granted`; the page never asks on load), applied when its first fix comes unless the member moved the map meanwhile (`MemberMoves`: any `movestart` or `zoomstart` after the start view is set, a tap on a line of the list that flies the map among them); (2) the region `/maps` named (`?region=<id>`, `regionOf`), at street level at the middle of its box; it wins over (3) where the member last left the map of this server, at its own zoom (`readLastView` / `writeLastView`: `localStorage` `pine-map-view:<guild>`, written at each `moveend`, read and written in try/catch, `browserStorage`); (4) the whole server (`fitBounds` of its regions, else of its gyms, else "This server has no regions yet."). A location or last view beyond the regions and their margin is passed over. `?region=` is taken out of the address once read (as `?login=`), so that a reload opens where the member left the map.
 - **`/maps` names its region:** used in a region's channel or its forum (`regionChannelOf`), `/maps` puts the region's id in the map's address it shows (`/s/<guild>/map?region=<id>`) and in its login link (`LoginLinks.issue(…, 'map', region)`, `LinkHolder.region`); the link's POST redirects to `/s/<guild>/map?region=<id>` (an id of ours, never of the request); an expired link lands on the whole map (`?login=expired`).
 - **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
-- **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket came so with 8M-9B). The layers of `MAP_LAYERS`: Raids, and since plan 8M-9B Field research and Team GO Rocket after Meetups (below, "Reports at stops on the map's page"); Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 1024 pixels (`map.css`; 768 until plan 8M-9B, B7, provisional: five live toggles, "Research" and "Rocket" short in the row with their names in the sheet and the toggle's title, fit from 1024) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
+- **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket came so with 8M-9B). The layers of `MAP_LAYERS`: Raids, and since plan 8M-9B Field research and Team GO Rocket after Meetups (below, "Reports at stops on the map's page"); Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 1024 pixels (`map.css`; 768 until plan 8M-9B, B7, provisional: five live toggles, "Research" and "Rocket" short in the row with their names in the sheet and the toggle's title, fit from 1024) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), only Gyms and Region outlines are offered (`offered(spec, member)`; plan 8M-13, L1: every other layer, Wild spawns too, is `membersOnly`, since the server gives a visitor nothing but `/api/geo`); the controls are drawn anew once `/api/me` answers (`refresh`).
 - **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one cell of a grid fixed on the world are one cluster, the cell 60 pixels from zoom 15, 90 at 13 and 14, 120 at 12 and below (`cellPixels`, plan 8M-11B), drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<zoom>:<cell>`, plan 8M-11B) and only the difference touched at each move, list or change (`planDots`: a cluster whose gyms changed changes its count and place in place, one no longer wanted gives its marker to a new one, the rest is added or taken off): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12 min", "1 h 05" while it runs (`durationWords`' compact form, plan 8M-11A), "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "Egg" or "Hatched" where nobody said when, "Ended" by `stageAt` (capitalized since plan 8M-11A, S5)), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a max battle's marker (the raids' layer, plan 8M-9A: at its Power Spot, whose own dot it replaces, or at its pin), a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a battle's `title` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
@@ -343,6 +343,7 @@ Design `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, "Pl
 
 - **A train's direction (T1):** the arrowheads are 24 pixels. The legs ahead carry a slow flow: one more polyline per train over the points of its legs ahead, weight 2, `interactive: false`, in the train's line group, of classes `train-flow train-flow-line`; a loop's closing leg (Leaflet's `8 8`) takes `train-flow` itself. `map.css` gives `.train-flow` its pattern (`--flow-dash`, `--flow-gap`) and the animation `train-flow` (`--flow-time`, 2.5 s, linear, endless: the offset from 0 to minus one period, so the loop does not jump and the dashes run toward the line's last point), and the flow line its color (`--train-flow`), all under `@media (prefers-reduced-motion: no-preference)`; elsewhere `.train-flow-line` is hidden and the closing leg keeps its still dashes. The train being routed is not drawn by the parties' draw, so it has no flow. Each flowing path starts in step with the clock (fix round 1, R1-3): once Leaflet made it (`add`), `inFlowStep` sets its `animationDelay` through the CSSOM to `flowDelay(Date.now())`, minus the clock's place in the cycle (`FLOW_CYCLE_MS`, 2,500, `--flow-time`'s, held to it by `train-flow.test.ts`; both in `train-flow.ts`, a module without the DOM's types), so the paths a draw of the parties makes anew go on where the old ones were. `src/web/train-flow.test.ts` reads the stylesheets (a period, the media query).
 - **A train picked at any stop ahead (S7):** `stopBadges` (`train-line.ts`, pure) gives a badge per listing after the stop each train is at, numbered by its place in the route from 1 (the current stop keeps the ring; a finished train, and the stops a loop has done, get none; a stop the map cannot place is passed over), the badges of one stop (listed twice, or ahead of several trains) side by side by `slot`. `badgeAnchor(slot, raidFull, badgeSize, tapSize)` sets each number (`.number`, `--badge-size`, 20 px, the train's color, the number white) to the left of its stop, clear of a raid's full marker (`--raid-full`) by `BADGE_GAP` (3), centered on it, further slots further out: their centers 35, 58, 81 … px left of the stop. Each number sits in the middle of a box of a finger's size (`--tap-size`, 44 px; fix round 1, R1-4), class `train-badge`, empty to the eye, that takes the taps round it; the box is centered on its number (fix round 2, R2-1), so its right edge lies about 13 px left of the stop, clear of a gym's dot (8 px), and it overlaps only the left corners of a raid's or max battle's marker, which lies above it (`zIndexOffset` `BADGE_Z_OFFSET`, −1000) and keeps those taps. The boxes of one stop's neighboring numbers overlap; there Leaflet's order of the markers decides. `party-layer.ts` draws them in a group of the trains' layer from `BADGE_MIN_ZOOM` (15) up, anew at every draw and every `zoomend` (`drawBadges`, beside `drawArrows`); a tap opens the train's popup (`route:<id>`, else `train:<id>`) where the badge is. They take no click while the trains let clicks through (route mode, a place picked). Tests: `train-line.test.ts`, `party-layer-draw.isolated.test.ts`.
+- **Visitors (L1, I1, L2):** a visitor's layers are Gyms and Region outlines alone (above, "Layers"; their "Layers · n" counts fewer; a member's stored choice is untouched). The visitor's side pane keeps Campfire's line whatever the layers offer (`loggedOutPane(…, true)` in `main.ts`; the members' list foot line still follows the Meetups layer). On a phone the not-a-member line and "Join the server on Discord" stack at the left, the button as wide as its words (`#account:has(a.invite) .line` left-aligned, the invite `margin-right: auto` on the row after the line's; `phone-header.test.ts`); the desktop's header is unchanged. `shownGyms` (`gym-dots.ts`): with "Find a gym"'s text, its matches while the Gyms layer is on or the view is forced (route mode, a meetup's place, Add stops…), else none; without text, every gym on the same terms. So Gyms off hides a search's matches, and on again shows them while the text stands; a word typed in "Find a gym" while the layer is off turns it on (fix round 1, Matt's A: `registry.set`, ticked in the layers' menu and kept as the member's choice; not while a gym is to be clicked), so a search always shows its matches; Enter fits the map to the matches drawn. A visitor's Gyms layer is still off by default.
 - **Answers without Discord's list marks (A1):** `pageWords` writes the bot's list mark at the start of a line (`- ` or `* `, `LIST_MARK`) as a bullet, `• ` (fix round 1, R1-2: dropped, the items no longer read as a list), before the markdown and `unplain`, each item kept on its own line: a research report of several stops, Split…'s dialog text. A member's own mark arrives escaped (`\- `, `plain()`'s `bulletedList`) and stays as typed. Discord keeps its list. The notice band, the answer line and a form's answer (`.form-answer`) keep line breaks (`white-space: pre-line`; `src/web/answer-look.test.ts`).
 - **A refusal nudges the phone card (A2):** the card's content is drawn anew under a press, so the control pressed is out of it when the answer comes and `shake` found no card. `PhoneCard` moves itself: `nudge()` bounces the element it keeps once (`@keyframes nudge`, up by `--nudge-distance`, 6 px, and back over `--shake-time`, class `nudge` taken off and put back as `shake` does), only under `prefers-reduced-motion: no-preference`; `shows(partyId)` says whether its body holds that party's `.post`, `holds(element)` whether an element is in it. `refusalMoves(from, partyId, card)` (`press-answer.ts`) nudges the card that holds `from` or shows the party, else shakes `from`'s popup: the party layer's `answered`, the post's forms' refusal that keeps its form (`PostFormsDeps.refused`, in place of their own `shake`) and the raid's Change… (`RaidUiDeps.refused`) all go through it.
 
diff --git a/docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md b/docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md
index 42558127b53a0dab4a2727790212f2f2ac903448..d4cbf0951bb86fd74c8cd3df7976edf37e58a0d1 100644
--- a/docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md
+++ b/docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md
@@ -34,13 +34,13 @@ Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude dri
    - the train's Move… (Next), Manage… (Keep, another kind) and its route editor (add a stop);
    - "Be the conductor" as Tester.
 
-   A refusal (Done on an egg) answers at once.
+   A refusal (step 7's Move… as Tester) answers at once.
 
 ## Answers where the member looks (S9, S20, S21, S17)
 
 4. **The answer line.** After each press of step 2, the answer is under the post's buttons in the popup (blue-gray), never in a band at the top. It stays across the next poll (20 s) for 10 s, then goes.
-5. **A refusal shakes.** As Tester press Done on the egg: "This raid has not hatched yet." in red under the buttons, and the popup shakes once. With the device's reduced motion on (Windows: Settings › Accessibility › Visual effects › Animation effects off), the line shows and nothing shakes.
-6. **On the phone.** As Tester on the phone, the same presses in the phone card, in its summary too. The answer is under the first row of buttons, visible without opening the whole post. A refusal shakes the card.
+5. **Done is off on an egg.** As Tester, Done on the egg's post on the map is off (it cannot be pressed), so no refusal is pressed here: a refusal and its shake are step 7's. With the device's reduced motion on (Windows: Settings › Accessibility › Visual effects › Animation effects off), step 7's line shows and nothing shakes. (Corrected by plan 8M-13.)
+6. **On the phone.** As Tester on the phone, the same presses in the phone card, in its summary too. The answer is under the first row of buttons, visible without opening the whole post. A refusal (step 7's Move…) bounces the card up and back once (plan 8M-13, A2; with reduced motion, also Android's "Remove animations", it stays still).
 7. **Move… refused.** As Tester (not the conductor), press the train's Move…: the conductor's sentence in red in the answer line, and the popup shakes. There is no "Do this on Discord" line.
 8. **"Start a new group" as a note.** As a member alone in a plain group of a raid of one group, press Group…: in the post's place a box says "A new group is started on Discord.", with the button "Open the post on Discord" (it opens the post in a new tab) and Back (and Escape) putting the post back.
 9. **The completion question.** As Tester present at a hatched raid, wait for the completion question.
diff --git a/docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md b/docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md
index c762721cc2beadc53037e28f3dc5246bc993c915..abcfa22a54c46dcd71c832bd52b854b60a4ecb6a 100644
--- a/docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md
+++ b/docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md
@@ -68,9 +68,9 @@ From `2026-10-28-phase-8m10-staging.md`; not run on 2026-10-28 ("Not run: … 12
 22. **Shared corners dragged (8M-10 step 12).** In edit mode, drag the noted shared corner: both regions' outlines follow it as it moves, both staged; one Undo takes both back. Untick "Move shared corners together" and drag it again: only the dragged region's corner moves (a gap or overlap appears in the list). Reload: the switch is still unticked; tick it. A corner on another region's side (a T-junction) moves alone. A corner shared with another server's outline (dashed gray) comes apart from it.
 23. **A gap to fix.** With the switch unticked, drag the shared corner of step 22 a few meters apart, so that the list shows a gap (or an overlap) with "Fix…". Keep it for steps 24 and 25.
 24. **Fix… (8M-10 step 13).** Scroll the panel to the bottom, then Fix… of the gap: the box at the map's top right corner, its choices inside it, Apply and Cancel at its foot in sight without scrolling; the map fitted to the sliver left of the box. Take each choice: dashed on the map; Apply stages it as one change ("Fixed, as one change: Undo takes it back."); Undo. With the keyboard alone (Tab to Fix…, Enter): the focus goes into the box (its title, once the choices came), stays on a choice taken, and Cancel puts it on the panel, never on the page.
-25. **Fix all slivers… (8M-10 step 14).** The box with its question, Leave it, Stop here and Cancel at its foot; the map at each stretch beside the box; Cancel. With the keyboard and a screen reader (NVDA or Narrator, Matt): each question, the first and every one after Leave it or a choice taken, is read from its first line ("… fixed so far."), where the focus goes. Then Undo to nothing (the panel's line gone), and tick the switch.
+25. **Fix all slivers… (8M-10 step 14).** Fix all asks only about a stretch with a place in it: make the gap of step 23 hold a gym or a stop (drag the corner further, over one) to see the box (corrected by plan 8M-13). The box with its question, Leave it, Stop here and Cancel at its foot; the map at each stretch beside the box; Cancel. With the keyboard and a screen reader (NVDA or Narrator, Matt): each question, the first and every one after Leave it or a choice taken, is read from its first line ("… fixed so far."), where the focus goes. Then Undo to nothing (the panel's line gone), and tick the switch.
 26. **The address, logged out (8M-10 step 8, part).** In a private window, `/s/<guild>/regions/edit`: the login page (401) with "Log in with Discord" and "/region edit", as before.
-27. **The address without the live map (8M-10 step 8, part).** With `/api/geo` blocked in devtools (request blocking), open `/s/<guild>/map?edit=regions` as Googer: the editor fitted to the server's regions, not the default view of Pittsburgh's center at zoom 11. Unblock it.
+27. **The address without the live map (8M-10 step 8, part).** Block `/api/geo` in Chrome's devtools: the Network panel's "Request conditions" takes a URLPattern, so give the full address (`https://<host>/s/<guild>/api/geo`). The page reads it only at its load: reload after blocking, then open `/s/<guild>/map?edit=regions` as Googer: the editor fitted to the server's regions, not the default view of Pittsburgh's center at zoom 11. Unblock it. (Corrected by plan 8M-13.)
 28. **One save (8M-10 step 15; Matt's go-ahead).** Move one shared corner a few meters (the switch ticked), Save…: the preview names both regions; Save these changes: saved, the editor reloaded with the new outlines, the panel's line gone, and back on the map the menu says "Edit regions" alone. While the preview and the save are being sent, "Back to the map" is off, its title "Wait for the answer of the preview or the save." (devtools' network throttling makes the moment long enough to see). Then move it back and save again. Nothing else is saved.
 29. **Discord away (8M-10 step 9, optional).** With the bot's network to Discord cut for a moment: turning the editor on as Googer shows it read-only ("Discord cannot be reached just now, so the editor is read-only.", no Geoman tools, Save off); the clusters are drawn as in step 7.
 
diff --git a/src/web/client/gym-dots.test.ts b/src/web/client/gym-dots.test.ts
index 56cfe32d532d35e4207a45e30fb41fbb83732d80..10a37796d70b68730ecc2694be531ec3ab121ebd 100644
--- a/src/web/client/gym-dots.test.ts
+++ b/src/web/client/gym-dots.test.ts
@@ -24,13 +24,18 @@ describe('the gyms the map draws (plan 8M-7)', () => {
     expect(ids(shownGyms(GYMS, { on: false, filter: '', forced: false }))).toEqual([]);
   });
 
-  it('are those "Find a gym" matches while it holds a word, the layer on or off', () => {
-    expect(ids(shownGyms(GYMS, { on: false, filter: 'library', forced: false }))).toEqual([1, 3]);
+  it('are those "Find a gym" matches while it holds a word and the layer is on', () => {
     expect(ids(shownGyms(GYMS, { on: true, filter: 'fountain', forced: false }))).toEqual([2]);
   });
 
-  it('are every gym while a gym is to be clicked (route mode, a meetup place picked)', () => {
+  // Plan 8M-13 (L2): Gyms off hides a search's matches; on again shows them while the text stands.
+  it('are none while the layer is off, whatever "Find a gym" holds', () => {
+    expect(ids(shownGyms(GYMS, { on: false, filter: 'library', forced: false }))).toEqual([]);
+  });
+
+  it('are every gym, or the matches, while a gym is to be clicked (route mode, a place picked)', () => {
     expect(ids(shownGyms(GYMS, { on: false, filter: '', forced: true }))).toEqual([1, 2, 3]);
+    expect(ids(shownGyms(GYMS, { on: false, filter: 'library', forced: true }))).toEqual([1, 3]);
   });
 });
 
diff --git a/src/web/client/gym-dots.ts b/src/web/client/gym-dots.ts
index 32c1539eca5586e49e7fb328471102764b5073fa..25cc2e93c2d9827cf41449afe340206328ac1b7f 100644
--- a/src/web/client/gym-dots.ts
+++ b/src/web/client/gym-dots.ts
@@ -108,12 +108,13 @@ export interface GymsShown {
 }
 
 /**
- * The gyms the map draws (plan 8M-7): every gym while the Gyms layer is on or a gym is to be
- * clicked (route mode, a meetup's place picked: the map must offer them whatever the layer), and
- * while "Find a gym" holds a word those it matches, the layer on or off (finding a gym shows it);
- * none otherwise.
+ * The gyms the map draws (plan 8M-7): while the Gyms layer is on or a gym is to be clicked (route
+ * mode, a meetup's place picked: the map must offer them whatever the layer), every gym, or those
+ * "Find a gym" matches while it holds a word; none otherwise, also with a word (plan 8M-13, L2:
+ * Gyms off hides a search's matches, on again shows them while the text stands).
  */
 export function shownGyms(gyms: readonly MapGym[], shown: GymsShown): MapGym[] {
+  if (!shown.on && !shown.forced) return [];
   if (shown.filter.trim() !== '') return gyms.filter(gymFilter(shown.filter));
-  return shown.on || shown.forced ? [...gyms] : [];
+  return [...gyms];
 }
diff --git a/src/web/client/gyms-ui.isolated.test.ts b/src/web/client/gyms-ui.isolated.test.ts
index 1f3679e36ef6a17d311aadfc59f2ae4fb5356634..11ef25b7671c70da6f4f369b56f15de4d3506f13 100644
--- a/src/web/client/gyms-ui.isolated.test.ts
+++ b/src/web/client/gyms-ui.isolated.test.ts
@@ -170,12 +170,20 @@ function shown(zoom: number, more: { on?: boolean; thins?: () => boolean; typed?
   };
   /** How many times the gyms were worked out anew (each refresh counts those in view once). */
   const refreshed = { count: 0 };
+  /** The Gyms layer, which a test may turn on and off (`toggle`), and who listens. */
+  const layer = { on: more.on ?? true, listeners: [] as Array<(id: string, on: boolean) => void> };
   const registry = {
-    isOn: () => more.on ?? true,
-    onChange: () => undefined,
+    isOn: () => layer.on,
+    onChange: (listener: (id: string, on: boolean) => void) => {
+      layer.listeners.push(listener);
+    },
     setCount: () => {
       refreshed.count += 1;
     },
+    // As the layer menu's switch: kept, and told (plan 8M-13, R1-1).
+    set: (id: string, on: boolean) => {
+      if (id === 'gyms' && layer.on !== on) toggle(on);
+    },
   };
   const typing: Array<() => void> = [];
   const filter = {
@@ -213,7 +221,12 @@ function shown(zoom: number, more: { on?: boolean; thins?: () => boolean; typed?
     return now;
   };
   changes();
-  return { dots, map, hidden, group, changes, type, refreshed };
+  /** The Gyms layer turned on or off. */
+  const toggle = (on: boolean) => {
+    layer.on = on;
+    for (const listener of layer.listeners) listener('gyms', on);
+  };
+  return { dots, map, hidden, group, changes, type, refreshed, toggle, layer };
 }
 
 describe("the gyms' clusters (plan 8M-11B, S13)", () => {
@@ -257,11 +270,29 @@ describe("the gyms' clusters (plan 8M-11B, S13)", () => {
 });
 
 describe('the box over the gyms (plan 8M-12)', () => {
-  it('draws the gyms a word typed finds, the layer off, for a visitor', () => {
-    const { group } = shown(16, { on: false, typed: 'Gym 7' });
+  it('draws the gyms a word typed finds, for a visitor', () => {
+    const { group } = shown(16, { on: true, typed: 'Gym 7' });
+    expect([...group.layers].map((layer) => layer.at)).toEqual([[40.43, -79.92]]);
+  });
+
+  // Plan 8M-13 (L2): Gyms off hides the matches; on again shows them while the text stands.
+  it('hides the matches with the Gyms layer, and shows them again with it', () => {
+    const { group, toggle } = shown(16, { on: true, typed: 'Gym 7' });
+    toggle(false);
+    expect([...group.layers]).toEqual([]);
+    toggle(true);
     expect([...group.layers].map((layer) => layer.at)).toEqual([[40.43, -79.92]]);
   });
 
+  // Fix round 1 of 8M-13 (R1-1, Matt's A): a search with the Gyms layer off turns it on.
+  it('turns the Gyms layer on when a word is typed while it is off, and shows the matches', () => {
+    const { group, type, layer } = shown(16, { on: false });
+    expect([...group.layers]).toEqual([]);
+    type('Gym 7');
+    expect(layer.on).toBe(true);
+    expect([...group.layers].map((one) => one.at)).toEqual([[40.43, -79.92]]);
+  });
+
   it("thins nothing for a member, whose box is Find's: the layer says what is drawn", () => {
     const off = shown(16, { on: false, typed: 'Gym 7', thins: () => false });
     expect([...off.group.layers]).toEqual([]);
diff --git a/src/web/client/gyms-ui.ts b/src/web/client/gyms-ui.ts
index 464fa675ee60d3b196781aa6b8e85e841866fcc9..fc5415dd672d2d5bc550000271df1c48e3306165 100644
--- a/src/web/client/gyms-ui.ts
+++ b/src/web/client/gyms-ui.ts
@@ -153,12 +153,24 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
   deps.filter.addEventListener('input', () => {
     // A member's keystroke is Find's: the dots are as the layer says (plan 8M-12, review F2).
     if (deps.thins?.() === false) return;
+    // A search with the Gyms layer off turns it on, ticked in the layers' menu, which draws its
+    // matches (fix round 1 of 8M-13, Matt's A); not while a gym is to be clicked, which shows
+    // every gym whatever the layer says.
+    if (thinning().trim() !== '' && !registry.isOn('gyms') && !deps.forced()) {
+      registry.set('gyms', true);
+      return;
+    }
     refresh();
   });
   deps.filter.addEventListener('keydown', (event) => {
     // A member's Enter is Find's (plan 8M-12).
     if (event.key !== 'Enter' || thinning() === '') return;
-    const matches = shownGyms(deps.gyms, { on: false, filter: thinning(), forced: false });
+    // The matches drawn: none while the Gyms layer hides them (plan 8M-13, L2).
+    const matches = shownGyms(deps.gyms, {
+      on: registry.isOn('gyms'),
+      filter: thinning(),
+      forced: deps.forced(),
+    });
     if (matches.length === 0) return;
     map.fitBounds(L.latLngBounds(matches.map((gym) => [gym.lat, gym.lon])), {
       maxZoom: 17,
diff --git a/src/web/client/layer-registry.test.ts b/src/web/client/layer-registry.test.ts
index a9b0cfc9bff54fd8795e29361699bce43d9f935d..7c994710f5b8bc5932050dd2552930b86af3a4ee 100644
--- a/src/web/client/layer-registry.test.ts
+++ b/src/web/client/layer-registry.test.ts
@@ -41,10 +41,11 @@ function mapRegistry(kept: ViewStorage | undefined): LayerRegistry {
 }
 
 describe('whether a layer is offered, by its id (plan 8V-1)', () => {
-  it('offers the Meetups layer to everybody, a members-only layer to members only', () => {
+  it('offers a members-only layer to members only, the Meetups layer among them (plan 8M-13)', () => {
     const registry = mapRegistry(storage());
-    expect(registry.isOffered('meetups', false)).toBe(true);
+    expect(registry.isOffered('meetups', false)).toBe(false);
     expect(registry.isOffered('meetups', true)).toBe(true);
+    expect(registry.isOffered('outlines', false)).toBe(true);
     expect(registry.isOffered('research', false)).toBe(false);
     expect(registry.isOffered('research', true)).toBe(true);
     expect(registry.isOffered('nothing such', true)).toBe(false);
@@ -157,8 +158,23 @@ describe('the layers of the map (plan 8M-7)', () => {
     // Raids, trains, meetups, research, Rocket, outlines and the stops: the Gyms layer is off
     // (plan 8M-9A).
     expect(registry.countOn(true)).toBe(7);
-    // The stops and the reports at them are not offered to a visitor: not counted, though on.
-    expect(registry.countOn(false)).toBe(4);
+    // A visitor is offered the outlines alone of these: the rest is not counted, though on.
+    expect(registry.countOn(false)).toBe(1);
+  });
+
+  // Plan 8M-13 (L1): logged out, or not a member, the server gives the gyms and the regions'
+  // outlines (`/api/geo`) and nothing else.
+  it('offers a visitor only the layers that hold something for them: Gyms and Region outlines', () => {
+    const registry = mapRegistry(storage());
+    // Even once wild spawns had data, they would be a member's.
+    registry.setOffered('spawns', true);
+    const offered = (member: boolean) =>
+      registry
+        .layers()
+        .filter((layer) => registry.offered(layer, member))
+        .map((layer) => layer.id);
+    expect(offered(false)).toEqual(['gyms', 'outlines']);
+    expect(offered(true)).toEqual(MAP_LAYERS.map((layer) => layer.id));
   });
 
   it("words the phone's button and its sheet's counts", () => {
diff --git a/src/web/client/layer-registry.ts b/src/web/client/layer-registry.ts
index 412359f01815d5f2f5fa4659ce9bf7248ba1ccf5..dfe2d0ed6324067999034537904ba02be8fea598 100644
--- a/src/web/client/layer-registry.ts
+++ b/src/web/client/layer-registry.ts
@@ -29,11 +29,22 @@ export interface LayerSpec {
   waits?: boolean;
 }
 
-/** The map's layers in the order the row and the sheet show them. */
+/**
+ * The map's layers in the order the row and the sheet show them. A visitor (logged out, or not a
+ * member) is given the gyms and the regions' outlines alone (`/api/geo`): every other layer is
+ * members-only (plan 8M-13, L1), so that the list offers them nothing empty.
+ */
 export const MAP_LAYERS: readonly LayerSpec[] = [
-  { id: 'raids', name: 'Raids', on: true, kind: 'live', hint: 'Bosses, eggs and max battles' },
-  { id: 'trains', name: 'Trains', on: true, kind: 'live' },
-  { id: 'meetups', name: 'Meetups', on: true, kind: 'live' },
+  {
+    id: 'raids',
+    name: 'Raids',
+    on: true,
+    kind: 'live',
+    hint: 'Bosses, eggs and max battles',
+    membersOnly: true,
+  },
+  { id: 'trains', name: 'Trains', on: true, kind: 'live', membersOnly: true },
+  { id: 'meetups', name: 'Meetups', on: true, kind: 'live', membersOnly: true },
   // Reports at stops (plan 8M-9B): `/api/stop-reports`, a member's.
   {
     id: 'research',
@@ -53,7 +64,14 @@ export const MAP_LAYERS: readonly LayerSpec[] = [
     hint: 'Grunts, leaders and Giovanni at PokéStops',
     membersOnly: true,
   },
-  { id: 'spawns', name: 'Wild spawns', on: false, kind: 'background', waits: true },
+  {
+    id: 'spawns',
+    name: 'Wild spawns',
+    on: false,
+    kind: 'background',
+    waits: true,
+    membersOnly: true,
+  },
   // Off since the Report button (plan 8M-9A): its step 2 draws the gyms to pick from whatever
   // this says (on until then, fix round 1 of 8M-7: "Report raid" was in a gym's popup alone). A
   // browser that kept the layer on keeps it on.
@@ -143,8 +161,8 @@ export class LayerRegistry {
   }
 
   /**
-   * Whether the layer of this id is registered and offered (`offered`): the list's foot line to
-   * Campfire's meetups follows the Meetups layer (plan 8V-1).
+   * Whether the layer of this id is registered and offered (`offered`): the members' list's foot
+   * line to Campfire's meetups follows the Meetups layer (plan 8V-1).
    */
   isOffered(id: string, member: boolean): boolean {
     const spec = this.specs.find((one) => one.id === id);
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 8223d7d432fb20fd42f1059866d123465755c7b0..8d8c86d6ed005a21834ddf4dd15b56ac9a897e80 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -467,8 +467,9 @@ function start(): void {
         loggedOutPane(
           section,
           me.loggedIn ? 'member-only' : data.login === 'discord' ? 'discord' : 'links',
-          // Campfire's official meetups, public (plan 8V-1): while the Meetups layer is offered.
-          registry.isOffered('meetups', member),
+          // Campfire's official meetups are public (plan 8V-1): the line stands whatever the
+          // layers offer a visitor (plan 8M-13, L1).
+          true,
         );
         pane.replaceChildren(section);
         pane.hidden = false;
diff --git a/src/web/client/map.css b/src/web/client/map.css
index c7823381fe8a99aca59e4a1e18cbdab5f9ccb810..50cd63454a2df47899a24e429a76aafdc19a175c 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -625,12 +625,18 @@ body.editing-regions #map {
 
   /*
    * The server's invite (8M-11B, branch review BR-2): its own line under the not-a-member line,
-   * its words wrapping in the little room the header's row leaves, as small as the login.
+   * its words wrapping in the little room the header's row leaves, as small as the login. The
+   * line and the button stacked at the left, the button as wide as its words (plan 8M-13, I1):
+   * the line takes its row, so the button starts the next, pushed left.
    */
+  #account:has(a.invite) .line {
+    text-align: left;
+  }
+
   #account a.invite {
-    flex-basis: 100%;
+    margin-right: auto;
     white-space: normal;
-    text-align: center;
+    text-align: left;
     padding: 6px 10px;
     box-sizing: border-box;
   }
diff --git a/src/web/phone-header.test.ts b/src/web/phone-header.test.ts
index 789969c4e46fc4227ab7fd0104dd55f6673c08ee..be2ec5d430d442a03e9e0002ba2c40e53bd2de9e 100644
--- a/src/web/phone-header.test.ts
+++ b/src/web/phone-header.test.ts
@@ -154,11 +154,24 @@ describe("the server's invite in the header on a phone", () => {
     expect(shown(rules, '#account a.invite', 'white-space', false)).toBeUndefined();
     expect(shown(rules, '#account a.invite', 'flex-basis', false)).toBeUndefined();
     expect(shown(rules, '#account a.invite', 'white-space', true)).toBe('normal');
-    expect(shown(rules, '#account a.invite', 'flex-basis', true)).toBe('100%');
     expect(shown(rules, '#account a.invite', 'padding', true)).toBe(
       shown(rules, '#account a.login', 'padding', true),
     );
   });
+
+  // Plan 8M-13 (I1): the line and the button stacked, both at the left, the button its own width.
+  it('stacks the line and the button at the left, the button as wide as its words', () => {
+    // The line takes its row (it did), so the button starts the next; there it keeps its width
+    // and is pushed to the left.
+    expect(shown(rules, '#account .line', 'flex-basis', true)).toBe('100%');
+    expect(shown(rules, '#account a.invite', 'flex-basis', true)).toBeUndefined();
+    expect(shown(rules, '#account a.invite', 'margin-right', true)).toBe('auto');
+    expect(shown(rules, '#account a.invite', 'text-align', true)).toBe('left');
+    expect(shown(rules, '#account:has(a.invite) .line', 'text-align', true)).toBe('left');
+    // A wide screen keeps its header.
+    expect(shown(rules, '#account:has(a.invite) .line', 'text-align', false)).toBeUndefined();
+    expect(shown(rules, '#account a.invite', 'margin-right', false)).toBeUndefined();
+  });
 });
 
 // Plan 8M-11C, S29: "Edit regions" by one rule, a mouse and 1024 pixels, the stylesheet's query
````

### Task 5: 8M-13 task 5: Find's misspellings only when nothing else is found

Prototype commit: `60448d5e55ab36ba51702bf04d29f78df95738ad`

Each place of /api/find-places says whether it was found only by a
misspelling (FoundPlace.guess, placeFit's guess; guesses already rank
last within a kind). foundGroups shows them only when Find found no
report, no party and no place by its words for the text, and "Places · n"
counts what it shows (O1, Matt's A): rocket no longer lists Hockey
Rinks, gible no Bible places, ansus hall still finds Ansys Hall.

**Files:**

```
 docs/architecture/web.md    |  3 ++-
 src/domain/web/find-data.ts |  5 +++++
 src/web/client/find.test.ts | 79 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-----
 src/web/client/find.ts      |  9 ++++++++-
 src/web/find-places.test.ts | 22 +++++++++++++++++++++-
 src/web/find-routes.ts      |  3 +++
 6 files changed, 113 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/find.test.ts src/web/find-places.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 60448d5e55ab36ba51702bf04d29f78df95738ad -- src test scripts docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-13 task 5: Find's misspellings only when nothing else is found`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 979bcfa056a803b3fe36748c267e42ba320a4fad..156f2f93c387cc53addd68fccded23ed3b6060d8 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -333,7 +333,7 @@ Design `docs/superpowers/specs/2026-10-28-find-design.md` (approved 2026-10-28;
 - **The rows** (`WhatIsOn` with `found`, `pick` and `scroller`; `list-ui.ts`): the heading "Found · n" with "×" at its end, "Back to the list" (`FIND_BACK`, branch review BR-3: it empties the box as the box's × does, `PartyFrame.findCleared`; on a phone after a pick the box is hidden), and no sort; each row the list's own line (`ListLine`): the stop's or place's name (a raid's, max battle's or meetup's place, or its name alone where it has none; a train by its name, its stop line under it: review F5), under it what matched (a report's task and reward line, a grunt's name and lineup, a raid's heading, a meetup's name; a place's kind, `Gym`, `PokéStop`, `Power Spot`), the distance, a report's or party's time, and for a report not confirmed its mark in `--warning` (`ListLine.mark`, `unconfirmedWords`: "not confirmed: one of 6 encounters", "not confirmed: one of 2 rewards" for a report of before plan 8R-5, "reward not reported", "not confirmed: one of 2 lineups"). The places' rings are their layers' colors (`.picture.gyms`, `.stops`, `.spots`, `map.css`). The results are drawn anew with every list and poll, as the list is.
 - **A pick** (`pickLine`, `party-layer.ts`): a report's or party's layer is turned on (`registry.set`), a report a filter of its layer hides lifts that filter (`StopFilterUi.clear`), then the line opens as a line of the list does (`openLine`: the map flies there at street level or closer and opens its popup once it rests; on a phone the card; a thing the map cannot draw shows its popup under its row). A place is opened without turning its layer on (ruling R3: the Gyms layer is off by default): the map flies there, then opens what a tap there opens (branch review BR-2): a stop's reports (`openStopAt`: its marker's popup, else the stop's own), a Power Spot's battle (`openBattle`, else `openSpot`), a gym's raids (its marker's popup) or the list of what shares its place (`tapGym`, the gym's dot tapped), else the gym's own popup (`openGym`). A line the map does not open shows its popup under its row (`foundDetail`, review F6): a report's stop with every report there, as its marker's popup, a stop's or gym's own popup; the lines Find opened so are Find's alone, and the list's own opened lines come back as they were when Find ends. On a phone a pick hides the floating box (`PartyFrame.findPicked`, ruling R1), its text kept: the search button brings the box back and, while it holds a search, the list of its results.
 - **Clearing** the box (×, emptying it, or under two letters) draws the list as it was: its sort and filters were never touched, and its scroll is put back (`WhatIsOn.scroller`: kept when Find began to show, back to it when it ends). On a phone the list's sheet opens when a search begins (`PartyFrame.finding`, `body.list-open`, the box floating over its top with `padding-top`), never when its places come (review F1: it reopened over the map after a pick), and closes again when Find ends, where Find opened it; a pick shows the map with the card.
-- **The server's part:** each report of `/api/stop-reports` carries `words` and, where not confirmed, `unconfirmed` (`reportSearch`, `src/domain/stops/report-search.ts`; `stopReportView`'s `search` input, whose `lineupsOf` is `RocketLineupProvider.byKey(type)?.lineups?.length`). `GET /s/<guild>/api/find-places?q=<text>[&near=<lat>,<lon>]` (`findRoutes`, `src/web/find-routes.ts`): members only (`memberOrFailure`, as `/api/stops`: 401, 403, 503), `private, no-store`, `FIND_PER_MINUTE` (120) per address; `q` of two letters to `FIND_MAX_TEXT` (100), `near` a point (`pointSchema` of `wayspot-box.ts`, shared with `near=` of `/api/stops` and `/api/powerspots`), anything else 400. It answers `PlaceFinder.find` (`gyms-and-regions.md`: the gym search and the `WayspotIndex` of each kind, held in memory, limited to the server's regions as Discord's searches are; no database query) in its ranking, the nearer to `near` first of places that fit alike (`anchors`), at most ten of each kind, a guess that misses a word typed left out (`readsEvery` of `src/domain/search/text.ts`: each word typed is a beginning of a word of the name or misspelt by no more letters than `allowedTypos` lets it, none up to three letters, so "art" is not "park"; a word of `STOP_WORDS` asks nothing: review F3), as `FoundPlacesView` `{ places: [{ kind, id, name, lat, lon }] }`. Gyms come from the server too, not from the page's `/api/geo` (the builder's call: one ranking for the three kinds, Discord's own, misspellings read; the request is made anyway for the stops).
+- **The server's part:** each report of `/api/stop-reports` carries `words` and, where not confirmed, `unconfirmed` (`reportSearch`, `src/domain/stops/report-search.ts`; `stopReportView`'s `search` input, whose `lineupsOf` is `RocketLineupProvider.byKey(type)?.lineups?.length`). `GET /s/<guild>/api/find-places?q=<text>[&near=<lat>,<lon>]` (`findRoutes`, `src/web/find-routes.ts`): members only (`memberOrFailure`, as `/api/stops`: 401, 403, 503), `private, no-store`, `FIND_PER_MINUTE` (120) per address; `q` of two letters to `FIND_MAX_TEXT` (100), `near` a point (`pointSchema` of `wayspot-box.ts`, shared with `near=` of `/api/stops` and `/api/powerspots`), anything else 400. It answers `PlaceFinder.find` (`gyms-and-regions.md`: the gym search and the `WayspotIndex` of each kind, held in memory, limited to the server's regions as Discord's searches are; no database query) in its ranking, the nearer to `near` first of places that fit alike (`anchors`), at most ten of each kind, a guess that misses a word typed left out (`readsEvery` of `src/domain/search/text.ts`: each word typed is a beginning of a word of the name or misspelt by no more letters than `allowedTypos` lets it, none up to three letters, so "art" is not "park"; a word of `STOP_WORDS` asks nothing: review F3), as `FoundPlacesView` `{ places: [{ kind, id, name, lat, lon, guess }] }` (`guess` since plan 8M-13). Gyms come from the server too, not from the page's `/api/geo` (the builder's call: one ranking for the three kinds, Discord's own, misspellings read; the request is made anyway for the stops).
 - **Speed** (measured 2026-10-29 on the laptop, an upper bound): `PlaceFinder.find` over Pittsburgh's Wayfarer export in one region (5,886 gyms, 20,618 PokéStops, 16,553 Power Spots; the indexes built in about 0.5 s) took a median of 25 ms per request over twelve texts, 11 ms for a text that finds nothing, 44 to 54 ms for the commonest words ("church", "st"), what Discord's autocomplete of `/research stop:` costs per keystroke; the page's match over 400 research reports, 100 grunts, 20 hideouts, 80 raids, 10 trains and 10 meetups with the 5,886 gyms in the map took a median of 0.6 ms, at most 1.9 ms.
 - **Tests:** `src/domain/stops/report-search.test.ts` (the words and marks over real tasks and lineups: Spinda's curveball, Skiddo in a pool of six, the costumed Pikachu, a Cosmog, a dragon grunt, the water grunt "not sure which", Giovanni), `stop-report-view.test.ts` and `src/web/stop-reports.test.ts` (the view carries them), `src/web/find-places.test.ts` (the route, a member without the map's role refused: review F8), `src/web/client/find.test.ts` (words, groups, the timing over fake timers), `list-ui.test.ts` (the rows, the scroll given back), `what-is-on.test.ts` (a place's line, the mark), `gyms-ui.isolated.test.ts` (no thinning for a member), `party-layer-draw.isolated.test.ts` (a pick turns the layer on and opens the stop, lifts a hiding filter, opens a place without its layer; the list opens as a search begins and not when its places come after a pick; a found line's popup under its row; typing draws nothing). Tried in a preview without Discord and at staging (`docs/superpowers/plans/2026-10-29-phase-8m12-staging.md`).
 
@@ -344,6 +344,7 @@ Design `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, "Pl
 - **A train's direction (T1):** the arrowheads are 24 pixels. The legs ahead carry a slow flow: one more polyline per train over the points of its legs ahead, weight 2, `interactive: false`, in the train's line group, of classes `train-flow train-flow-line`; a loop's closing leg (Leaflet's `8 8`) takes `train-flow` itself. `map.css` gives `.train-flow` its pattern (`--flow-dash`, `--flow-gap`) and the animation `train-flow` (`--flow-time`, 2.5 s, linear, endless: the offset from 0 to minus one period, so the loop does not jump and the dashes run toward the line's last point), and the flow line its color (`--train-flow`), all under `@media (prefers-reduced-motion: no-preference)`; elsewhere `.train-flow-line` is hidden and the closing leg keeps its still dashes. The train being routed is not drawn by the parties' draw, so it has no flow. Each flowing path starts in step with the clock (fix round 1, R1-3): once Leaflet made it (`add`), `inFlowStep` sets its `animationDelay` through the CSSOM to `flowDelay(Date.now())`, minus the clock's place in the cycle (`FLOW_CYCLE_MS`, 2,500, `--flow-time`'s, held to it by `train-flow.test.ts`; both in `train-flow.ts`, a module without the DOM's types), so the paths a draw of the parties makes anew go on where the old ones were. `src/web/train-flow.test.ts` reads the stylesheets (a period, the media query).
 - **A train picked at any stop ahead (S7):** `stopBadges` (`train-line.ts`, pure) gives a badge per listing after the stop each train is at, numbered by its place in the route from 1 (the current stop keeps the ring; a finished train, and the stops a loop has done, get none; a stop the map cannot place is passed over), the badges of one stop (listed twice, or ahead of several trains) side by side by `slot`. `badgeAnchor(slot, raidFull, badgeSize, tapSize)` sets each number (`.number`, `--badge-size`, 20 px, the train's color, the number white) to the left of its stop, clear of a raid's full marker (`--raid-full`) by `BADGE_GAP` (3), centered on it, further slots further out: their centers 35, 58, 81 … px left of the stop. Each number sits in the middle of a box of a finger's size (`--tap-size`, 44 px; fix round 1, R1-4), class `train-badge`, empty to the eye, that takes the taps round it; the box is centered on its number (fix round 2, R2-1), so its right edge lies about 13 px left of the stop, clear of a gym's dot (8 px), and it overlaps only the left corners of a raid's or max battle's marker, which lies above it (`zIndexOffset` `BADGE_Z_OFFSET`, −1000) and keeps those taps. The boxes of one stop's neighboring numbers overlap; there Leaflet's order of the markers decides. `party-layer.ts` draws them in a group of the trains' layer from `BADGE_MIN_ZOOM` (15) up, anew at every draw and every `zoomend` (`drawBadges`, beside `drawArrows`); a tap opens the train's popup (`route:<id>`, else `train:<id>`) where the badge is. They take no click while the trains let clicks through (route mode, a place picked). Tests: `train-line.test.ts`, `party-layer-draw.isolated.test.ts`.
 - **Visitors (L1, I1, L2):** a visitor's layers are Gyms and Region outlines alone (above, "Layers"; their "Layers · n" counts fewer; a member's stored choice is untouched). The visitor's side pane keeps Campfire's line whatever the layers offer (`loggedOutPane(…, true)` in `main.ts`; the members' list foot line still follows the Meetups layer). On a phone the not-a-member line and "Join the server on Discord" stack at the left, the button as wide as its words (`#account:has(a.invite) .line` left-aligned, the invite `margin-right: auto` on the row after the line's; `phone-header.test.ts`); the desktop's header is unchanged. `shownGyms` (`gym-dots.ts`): with "Find a gym"'s text, its matches while the Gyms layer is on or the view is forced (route mode, a meetup's place, Add stops…), else none; without text, every gym on the same terms. So Gyms off hides a search's matches, and on again shows them while the text stands; a word typed in "Find a gym" while the layer is off turns it on (fix round 1, Matt's A: `registry.set`, ticked in the layers' menu and kept as the member's choice; not while a gym is to be clicked), so a search always shows its matches; Enter fits the map to the matches drawn. A visitor's Gyms layer is still off by default.
+- **Find's misspellings (O1, Matt's A):** each place of `/api/find-places` carries `guess` (`FoundPlace.guess`, `placeFit`'s `guess`: found only by a misspelling); `mergePlaces` ranks a guess after every other fit, so guesses come last within a kind and the cap of ten drops them first. `foundGroups` (`find.ts`) shows the guesses only when Find found nothing else for the text (no report, no party, no place by its words), and "Places · n" counts what it shows: `rocket` gives the Rocket reports and no Hockey Rinks, `gible` the raid and no Bible places, `ansus hall` still finds Ansys Hall. Discord's lists are unchanged.
 - **Answers without Discord's list marks (A1):** `pageWords` writes the bot's list mark at the start of a line (`- ` or `* `, `LIST_MARK`) as a bullet, `• ` (fix round 1, R1-2: dropped, the items no longer read as a list), before the markdown and `unplain`, each item kept on its own line: a research report of several stops, Split…'s dialog text. A member's own mark arrives escaped (`\- `, `plain()`'s `bulletedList`) and stays as typed. Discord keeps its list. The notice band, the answer line and a form's answer (`.form-answer`) keep line breaks (`white-space: pre-line`; `src/web/answer-look.test.ts`).
 - **A refusal nudges the phone card (A2):** the card's content is drawn anew under a press, so the control pressed is out of it when the answer comes and `shake` found no card. `PhoneCard` moves itself: `nudge()` bounces the element it keeps once (`@keyframes nudge`, up by `--nudge-distance`, 6 px, and back over `--shake-time`, class `nudge` taken off and put back as `shake` does), only under `prefers-reduced-motion: no-preference`; `shows(partyId)` says whether its body holds that party's `.post`, `holds(element)` whether an element is in it. `refusalMoves(from, partyId, card)` (`press-answer.ts`) nudges the card that holds `from` or shows the party, else shakes `from`'s popup: the party layer's `answered`, the post's forms' refusal that keeps its form (`PostFormsDeps.refused`, in place of their own `shake`) and the raid's Change… (`RaidUiDeps.refused`) all go through it.
 
diff --git a/src/domain/web/find-data.ts b/src/domain/web/find-data.ts
index 7a67e82474eb5142069478069533f7a32ec30ad3..22f86c5a94f545351a9ec10de0f82040f0125ad6 100644
--- a/src/domain/web/find-data.ts
+++ b/src/domain/web/find-data.ts
@@ -17,6 +17,11 @@ export interface FoundPlace {
   name: string;
   lat: number;
   lon: number;
+  /**
+   * Found only by a misspelling (`placeFit` `guess`, plan 8M-13, O1): the page shows such places
+   * only when Find found nothing else for the text. They come last within their kind.
+   */
+  guess: boolean;
 }
 
 /**
diff --git a/src/web/client/find.test.ts b/src/web/client/find.test.ts
index 4919bae339489ffd6e881f488295688fb64e5769..518715a1d83940d03797b459822c7670e918f122 100644
--- a/src/web/client/find.test.ts
+++ b/src/web/client/find.test.ts
@@ -271,9 +271,16 @@ describe("Find's groups (plan 8M-12)", () => {
 
   it("shows the server's places in its order, and says while they are asked for", () => {
     const places: FoundPlace[] = [
-      { kind: 'stop', id: 'abc.16', name: 'Dragon Mural', lat: 40.5, lon: -79.95 },
-      { kind: 'gym', id: '2', name: 'Dragon Gate', lat: 40.6, lon: -79.95 },
-      { kind: 'powerspot', id: 'def.16', name: 'Dragon Spot', lat: 40.4, lon: -79.95 },
+      { kind: 'stop', id: 'abc.16', name: 'Dragon Mural', lat: 40.5, lon: -79.95, guess: false },
+      { kind: 'gym', id: '2', name: 'Dragon Gate', lat: 40.6, lon: -79.95, guess: false },
+      {
+        kind: 'powerspot',
+        id: 'def.16',
+        name: 'Dragon Spot',
+        lat: 40.4,
+        lon: -79.95,
+        guess: false,
+      },
     ];
     const found = foundGroups(state('dragon', places), data());
     expect(found.map((group) => group.heading)).toEqual(['Places · 3']);
@@ -288,9 +295,64 @@ describe("Find's groups (plan 8M-12)", () => {
     expect(foundGroups(state('dragon', 'failed'), data())[0]?.note).toBe(PLACES_FAILED);
   });
 
+  // Plan 8M-13 (O1, Matt's A): a place found only by a misspelling is shown only when Find found
+  // nothing else for the text.
+  describe('places found only by a misspelling', () => {
+    const HOCKEY: FoundPlace = {
+      kind: 'stop',
+      id: 'h.16',
+      name: 'Hockey Rink',
+      lat: 40.5,
+      lon: -79.95,
+      guess: true,
+    };
+    const POCKET: FoundPlace = {
+      kind: 'gym',
+      id: '7',
+      name: 'Pocket Park',
+      lat: 40.5,
+      lon: -79.96,
+      guess: true,
+    };
+    const ROCKET_ST: FoundPlace = {
+      kind: 'stop',
+      id: 'r.16',
+      name: 'Rocket Street Mural',
+      lat: 40.5,
+      lon: -79.97,
+      guess: false,
+    };
+
+    it('are left out where reports or parties were found', () => {
+      const rocket = foundGroups(
+        state('rocket', [HOCKEY, POCKET]),
+        data({ reports: caseView({ grunts: [caseGrunt(1)] }) }),
+      );
+      expect(rocket.map((group) => group.kind)).toEqual(['reports']);
+      const gible = foundGroups(
+        state('gible', [HOCKEY]),
+        data({ parties: parties({ raids: [raid('r1', 1, 'Gible')] }) }),
+      );
+      expect(gible.map((group) => group.kind)).toEqual(['going']);
+    });
+
+    it('are left out where a place was found by its words, the count what is shown', () => {
+      const places = foundGroups(state('rocket', [ROCKET_ST, HOCKEY, POCKET]), data());
+      expect(places.map((group) => group.heading)).toEqual(['Places · 1']);
+      expect(places[0]?.lines.map((line) => line.name)).toEqual(['Rocket Street Mural']);
+    });
+
+    it('are shown where Find found nothing else for the text', () => {
+      const places = foundGroups(state('ansus hall', [HOCKEY, POCKET]), data());
+      expect(places.map((group) => group.heading)).toEqual(['Places · 2']);
+    });
+  });
+
   it('puts the groups in order, empty ones left out, and Enter takes the first line', () => {
     const groups = foundGroups(
-      state('dragon', [{ kind: 'gym', id: '2', name: 'Dragon Gate', lat: 40.6, lon: -79.95 }]),
+      state('dragon', [
+        { kind: 'gym', id: '2', name: 'Dragon Gate', lat: 40.6, lon: -79.95, guess: false },
+      ]),
       data({
         reports: caseView({ research: [caseResearch(1)] }),
         parties: parties({ raids: [raid('r1', 1, 'Dragonite')] }),
@@ -340,7 +402,14 @@ describe("Find's timing (plan 8M-12)", () => {
     return { find, asked, answers, fail, shown, whys, picked };
   }
 
-  const DRAGON: FoundPlace = { kind: 'gym', id: '2', name: 'Dragon Gate', lat: 40.6, lon: -79.95 };
+  const DRAGON: FoundPlace = {
+    kind: 'gym',
+    id: '2',
+    name: 'Dragon Gate',
+    lat: 40.6,
+    lon: -79.95,
+    guess: false,
+  };
 
   it('asks the server once, a pause after the last keystroke', async () => {
     const made = search();
diff --git a/src/web/client/find.ts b/src/web/client/find.ts
index 40f0d2061fc56da5f63e9829d7d1b1bb1df1433c..5cdfcd0a0a247093e7b23e429c7efc8d8c2a5f07 100644
--- a/src/web/client/find.ts
+++ b/src/web/client/find.ts
@@ -242,7 +242,14 @@ export function foundGroups(state: FindState, data: FindData): FindGroup[] {
   if (going.length > 0) {
     groups.push({ kind: 'going', heading: `Going on · ${String(going.length)}`, lines: going });
   }
-  const { places } = state;
+  // Places found only by a misspelling (plan 8M-13, O1, Matt's A) only where Find found nothing
+  // else for the text: no report, no party, no place by its words.
+  const places =
+    state.places === 'waiting' || state.places === 'failed'
+      ? state.places
+      : groups.length > 0 || state.places.some((place) => !place.guess)
+        ? state.places.filter((place) => !place.guess)
+        : state.places;
   if (places === 'waiting' || places === 'failed') {
     groups.push({
       kind: 'places',
diff --git a/src/web/find-places.test.ts b/src/web/find-places.test.ts
index 0957e1eb0340e4500102b732b184bf264a9a4ecb..9d81804418a9f65e6b0c545cddf04a4d0d6d31ce 100644
--- a/src/web/find-places.test.ts
+++ b/src/web/find-places.test.ts
@@ -55,13 +55,21 @@ describe('the places Find finds on the map (plan 8M-12)', () => {
     const { places } = answer.json<FoundPlacesView>();
     expect(places).toEqual(
       expect.arrayContaining([
-        { kind: 'gym', id: '1', name: 'Pinewood Public Library', lat: 40.05, lon: -80.05 },
+        {
+          kind: 'gym',
+          id: '1',
+          name: 'Pinewood Public Library',
+          lat: 40.05,
+          lon: -80.05,
+          guess: false,
+        },
         {
           kind: 'powerspot',
           id: wayspotId(5),
           name: 'Library Garden',
           lat: 40.0502,
           lon: -80.0502,
+          guess: false,
         },
       ]),
     );
@@ -119,6 +127,18 @@ describe('the places Find finds on the map (plan 8M-12)', () => {
     ]);
   });
 
+  // Plan 8M-13 (O1): the page shows a misspelling's places only when it found nothing else.
+  it('says which places it found only by a misspelling', async () => {
+    const made = await setup();
+    web = made.web;
+    expect((await made.ask('q=yelow%20mural')).json<FoundPlacesView>().places).toMatchObject([
+      { name: 'Yellow Mural', guess: true },
+    ]);
+    expect((await made.ask('q=yellow%20mural')).json<FoundPlacesView>().places).toMatchObject([
+      { name: 'Yellow Mural', guess: false },
+    ]);
+  });
+
   it('is not for a member without the map’s role (review F8)', async () => {
     const made = await stopReportingWith();
     const members = new FakeMemberDirectory().add(ALICE, 'Alice');
diff --git a/src/web/find-routes.ts b/src/web/find-routes.ts
index 319a070e982dffa7e888305efee0016a1cb4f2f9..62f510e56252cb0ad7aa49c9b4f4982f1b355eec 100644
--- a/src/web/find-routes.ts
+++ b/src/web/find-routes.ts
@@ -52,6 +52,9 @@ function foundPlace(choice: PlaceChoice): FoundPlace {
     name: choice.title,
     lat: choice.point.lat,
     lon: choice.point.lon,
+    // Last within its kind already: `mergePlaces` ranks a guess after every other fit, so the
+    // cap of each kind drops guesses first.
+    guess: choice.fit === 'guess',
   };
 }
 
````

### Task 6: 8M-13 task 6: Light, Dark or Device

Prototype commit: `4ac9d029d46f0167bd3ee79efc3d08b85bb9b9a6`

The map and its region editor offer a theme (S10, Matt's C): "Theme:
Light · Dark · Device" in the account menu, the current one pressed; a
visitor gets a small ⋮ button beside "Log in" holding only that. Kept in
the browser under pine-map-theme (Device keeps nothing; a blocked storage
leaves Device), set on <html> as data-theme before the page is drawn by
a classic head script of its own (assets/theme-<hash>.js, the manifest's
map.theme). The server's own pages keep the device's scheme.

Each dark block (theme.css's tokens, map.css's masks, editor.css's
Geoman icons) is written once for a page not forced light; the build
adds its copy for a page forced dark (scripts/web/forced-dark.ts, an
esbuild plugin; a dark rule of the old shape fails it). ThemeWatch.dark()
is the choice, else the device, and tells the tiles and colors when
either turns the page; every bundle's watch hears the choice.

**Files:**

```
 docs/architecture/testing.md                |  2 +-
 docs/architecture/web.md                    |  5 +++--
 scripts/web/build.ts                        | 34 +++++++++++++++++++++++++++++++---
 scripts/web/forced-dark.test.ts             | 93 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 scripts/web/forced-dark.ts                  | 65 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/common.ts                    | 65 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++---------
 src/web/client/editor.css                   |  2 +-
 src/web/client/main.ts                      |  9 +++++++--
 src/web/client/map.css                      | 37 +++++++++++++++++++++++++++++++++++--
 src/web/client/party-layer.isolated.test.ts |  2 ++
 src/web/client/places-ui.isolated.test.ts   |  4 +++-
 src/web/client/theme-choice.test.ts         | 98 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/theme-choice.ts              | 90 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/theme-head.ts                | 13 +++++++++++++
 src/web/client/theme.css                    |  8 ++++++--
 src/web/client/theme.test.ts                | 52 ++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/theme.ts                     | 87 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------------
 src/web/page-theme.test.ts                  | 12 ++++++++----
 src/web/page.test.ts                        | 23 +++++++++++++++++++++--
 src/web/page.ts                             | 25 ++++++++++++++++++-------
 src/web/report-icons.test.ts                |  6 +++++-
 test/support/web.ts                         |  3 ++-
 22 files changed, 684 insertions(+), 51 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated scripts/web/forced-dark.test.ts src/web/client/party-layer.isolated.test.ts src/web/client/places-ui.isolated.test.ts src/web/client/theme-choice.test.ts src/web/client/theme.test.ts src/web/page-theme.test.ts src/web/page.test.ts src/web/report-icons.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4ac9d029d46f0167bd3ee79efc3d08b85bb9b9a6 -- src test scripts docs/architecture docs/superpowers/plans/2026-10-28-phase-8m11a-staging.md docs/superpowers/plans/2026-10-28-phase-8m11c-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-13 task 6: Light, Dark or Device`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index 23a0d7189c8550a01a68042f677d06d28d0d3ff5..f4a45a6a5ae5e05437ca8531f498980c3a7b43eb 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -93,7 +93,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
 - Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. `showParties` drawing a list runs in `party-layer-draw.isolated.test.ts` (plan 8M-9A, reviews B1 to B9): Leaflet mocked down to layers and groups that say whether they are on the map, markers whose popup opens only there and tells the map before the layer (as Leaflet's), the circles drawn with their options; a page of `PageElement`s (attributes and `dataset`, the tree, simple selectors, bubbling clicks, the focus) with the document's own listeners (Escape, `visibilitychange`, which a test fires to have the list asked for again and drawn, `poll`); `fetch` answering `/api/parties` with the test's list; the theme, the list of what is on and the phone card stubbed (`fake.card`), and the hooks the party layer hands `raidUi` and `maxUi` taken as they are made (their `done`, `pickSpot`); route mode a stub of `trainUi`'s `spotClicked` (`fake.route`). It waits for each draw through `afterDraw`; its `started` takes an `activity` (`MapActivity`, plan 8M-10) to turn the region editor on and off under both pollers. The Power Spots' and PokéStops' dots (`showPlaces`) run over a Leaflet of dots and popups in `places-ui.isolated.test.ts`. Plan 8M-11B: the draw test records the lines drawn (`fake.shown.lines`, whose group says whether they are drawn now) and its map projects by a scale a test changes with `zoomedTo(pixels)`, which fires `zoomend` (a train's faint legs, its loop and its arrowheads); `train-line.test.ts` tests the legs and arrowheads over a projection of its own; `train-ui.isolated.test.ts` records the drag line (`dragLines`) and the held map (`map`: holds, held) for each way a drag ends; the gyms' layer (`showGymDots`) runs in `gyms-ui.isolated.test.ts` over a Leaflet of fakes that count the layers added to and taken off its group, the markers moved and a cluster's count written, with the party layer, `raid-forms`, `train-forms` and the theme mocked down to what it takes of them. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - Find on the map (plan 8M-12): the route over `stopReportingWith(rows)` and `stopWebWith(made.ctx)` (`find-places.test.ts`: the kept stops of `STOP_ROWS` and twelve "Little Free Library" rows for the cap of ten, the invented gyms, a `remoteAddress` of another address for the limit); the words and marks of reports over the real task list and lineups (`pageTask`, `pikachuTask`, `feedChoice`, `taskVersions` of the catalogue fixture, `report-search.test.ts`); the page's pure part over the cases of `stop-report-cases.ts`, which carry `words` as the server gives them, its timing over fake timers and a `places` that answers each text when the test says (`find.test.ts`); the rows and the scroll in `list-ui.test.ts` (`scroller` a plain object); a pick in `party-layer-draw.isolated.test.ts` (`raids.find`, `raids.findFirst`). Speed is measured by a scratch script over the Wayfarer export, never by a test.
-- The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node. A test of what a stylesheet does (plan 8M-13: a train's flow, `train-flow.test.ts`; the answer lines and the card's nudge, `answer-look.test.ts`) reads it through `test/support/stylesheets.ts`: `clientSheet(file)` without comments, `themeTokens()` (the light set), `cssPixels(text, tokens)` (a length through `var()` and `calc`), `blockAt` and `motionBlock(css, selector)` (the reduced-motion block that holds a rule).
+- The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`), and since plan 8M-13 a choice of the test's (`ThemeWatch`'s third argument, `chosen()`); the choice kept in a storage of the test's in `theme-choice.test.ts`, the build's forced-dark copies over the real stylesheets in `scripts/web/forced-dark.test.ts`. A fake `document` of an isolated test that reaches the page's theme gives `documentElement.getAttribute` (no `data-theme`: the device's) and `addEventListener`. It lives outside `src/web/client/` because the client's type check has no Node. A test of what a stylesheet does (plan 8M-13: a train's flow, `train-flow.test.ts`; the answer lines and the card's nudge, `answer-look.test.ts`) reads it through `test/support/stylesheets.ts`: `clientSheet(file)` without comments, `themeTokens()` (the light set), `cssPixels(text, tokens)` (a length through `var()` and `calc`), `blockAt` and `motionBlock(css, selector)` (the reduced-motion block that holds a rule).
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand (whether it asks is its `active()`, the page's `MapActivity` since plan 8M-10: visible and the region editor off); the region editor's toggle over a fake document and a fake mount (`editor-toggle.test.ts`, plan 8M-10); the editor's places by layer, the warning ring of a cluster, the unsaved count and line, and where the editor is offered against `map.css` (plan 8M-11C: `editor-view.test.ts`, `editor-toggle.test.ts`, `staged-storage.test.ts`, `src/web/phone-header.test.ts`; `src/web/editor-clusters.test.ts` reads `editor.css`; the editor's clustered places over a Leaflet of fakes whose markers get a new element each time their group is put back on the map, as Leaflet's do, in `editor-places.isolated.test.ts`); the reports at stops' popups, list, filters and forms over the cases of `src/web/client/stop-report-cases.ts`, plan 8M-9B, which the page never imports); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
 ## Operations
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index 156f2f93c387cc53addd68fccded23ed3b6060d8..6d1696b369f5ff6e1c6166cd8a1890ebed4336a9 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -246,8 +246,8 @@ The tool that makes the Wayspot export is private (`wayfarer.md`); the owner's i
 
 ## Restyling the page
 
-- Every color of every page Pine serves, and the sizes a restyle would touch (the font and its size, the corners' radius, a card's radius and side bar, the widths of the map's side pane and the editor's panel), is a custom property of `src/web/client/theme.css` (plan 8M-6), in two sets of the same names (plan 8M-7): light in `:root`, dark in `@media (prefers-color-scheme: dark) { :root { … } }`, so that each page follows the device's light or dark (no switch on the page). The look is Discord's: its grays (dark: the page `#313338`, panels and cards `#2b2d31`, `#1e1f22` beneath; light: white, `#f2f3f5`, `#e3e5e8`), blurple `--primary` buttons, gray `--secondary` ones, `--success` green `#248046` and `--danger` red `#da373c` as the posts' buttons use them (a press on the map is colored as the post's: Join primary, Here success, Leave danger, the rest secondary; `PRESS_STYLES`, `parties.ts`), cards with the colored side bar of a components-v2 container (a popup's side bar is the color of what it shows: `--raid`, `--train`, `--meetup`, `--gym`, and a party's post its post's own, `--accent-<name>` (plan 8M-8A, `PostAccent`), the same in light and dark as on Discord; Leaflet's popups, tooltips, controls and attribution restyled to the theme in `map.css`), and the system font (Discord's own is not free). `map.css` imports it, and `editor.css` is an add-on loaded beside `map.css` when the editor is first turned on (plan 8M-10: it imports neither again); `userscript.css` (`/userscript`) and `pages.css` (the short pages of `answers.ts`: a failure, `/`, a login link's page, the login a page needs; built as `assets/page.css`, a name without a hash, since those pages are answered where the manifest is not at hand, `SHORT_PAGE_STYLE`; without a build they are plain) import it too; their rules use `var(--…)` and write no color themselves. The header's controls never wrap their words; the member's name is one button whose small menu holds Log out (`showAccount`, `.account-menu`, closed on Escape and a click outside it), and narrower than 768 pixels the map's title is "Pine" (fix round 1). Every page's head says `<meta name="color-scheme" content="light dark">` (`COLOR_SCHEME_META`), so the browser's own parts follow. The colors Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties at the page's first drawing and again when the device changes between light and dark (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; `ThemeWatch` over `matchMedia('(prefers-color-scheme: dark)')`, `onThemeChange`; the stylesheet loads before the deferred script; a property it lacks draws gray): the map sets its outlines' and gyms' style anew and draws its parties anew (under a form being filled in, once it closes), the region editor draws its regions anew (its places keep their colors in both sets; only what was near black, `--fix-line` and `--preview`, turns light in dark). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
-- To try a change: edit a value in `theme.css`, run `npm run web:build`, and reload the page (the bundle's names change with its content). A new color is a new property in `theme.css`, used through `var(--…)`, or named in `theme.ts` for what Leaflet draws. `page-theme.test.ts` checks that the light and dark sets name the same values and that every page's stylesheet imports `theme.css`, and refuses a color written anywhere else in `src/web/client/` and its folders: in a stylesheet but `theme.css`, a hex value, a color function (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `color-mix(`) or one of the usual named colors (`white`, `red`, … ; `transparent`, `inherit`, `currentColor` and `none` are allowed) anywhere in a value; in the pages' TypeScript, a hex value or a color function anywhere in a string or a template (read with the TypeScript parser, comments aside), or a string that is a named color (a sentence may name a color: "shown in red"), but for `MISSING_COLOUR` of `theme.ts`, the gray of a property the stylesheet lacks. It also refuses a property used or drawn that `theme.css` does not define. The CSP is unchanged: the properties are in the bundled stylesheet, never inline.
+- Every color of every page Pine serves, and the sizes a restyle would touch (the font and its size, the corners' radius, a card's radius and side bar, the widths of the map's side pane and the editor's panel), is a custom property of `src/web/client/theme.css` (plan 8M-6), in two sets of the same names (plan 8M-7): light in `:root`, dark in `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { … } }`. A page follows the device's light or dark unless the member chose Light or Dark on the map or its region editor (plan 8M-13, S10: `data-theme` on `<html>`, set before the page is drawn by the head script `theme-head.ts`; below, "The last small fixes"). Every dark block of the page's stylesheets (`theme.css`'s set, `map.css`'s masks, `editor.css`'s Geoman icons) is written once, each selector starting with `:root:not([data-theme='light'])`, so a forced Light turns it off; no copy is kept by hand: `npm run web:build` adds the same rules for `:root[data-theme='dark']` after each block, outside the query (`withForcedDark`, `scripts/web/forced-dark.ts`, an esbuild plugin over `src/web/client/*.css`), and refuses a dark rule without that prefix. The short pages and `/userscript` set no `data-theme`, so they follow the device. The look is Discord's: its grays (dark: the page `#313338`, panels and cards `#2b2d31`, `#1e1f22` beneath; light: white, `#f2f3f5`, `#e3e5e8`), blurple `--primary` buttons, gray `--secondary` ones, `--success` green `#248046` and `--danger` red `#da373c` as the posts' buttons use them (a press on the map is colored as the post's: Join primary, Here success, Leave danger, the rest secondary; `PRESS_STYLES`, `parties.ts`), cards with the colored side bar of a components-v2 container (a popup's side bar is the color of what it shows: `--raid`, `--train`, `--meetup`, `--gym`, and a party's post its post's own, `--accent-<name>` (plan 8M-8A, `PostAccent`), the same in light and dark as on Discord; Leaflet's popups, tooltips, controls and attribution restyled to the theme in `map.css`), and the system font (Discord's own is not free). `map.css` imports it, and `editor.css` is an add-on loaded beside `map.css` when the editor is first turned on (plan 8M-10: it imports neither again); `userscript.css` (`/userscript`) and `pages.css` (the short pages of `answers.ts`: a failure, `/`, a login link's page, the login a page needs; built as `assets/page.css`, a name without a hash, since those pages are answered where the manifest is not at hand, `SHORT_PAGE_STYLE`; without a build they are plain) import it too; their rules use `var(--…)` and write no color themselves. The header's controls never wrap their words; the member's name is one button whose small menu holds Log out (`showAccount`, `.account-menu`, closed on Escape and a click outside it), and narrower than 768 pixels the map's title is "Pine" (fix round 1). Every page's head says `<meta name="color-scheme" content="light dark">` (`COLOR_SCHEME_META`), so the browser's own parts follow; `map.css` sets `color-scheme` for a forced choice. The colors Leaflet draws from TypeScript (region outlines, gym dots, a raid's dot, a train's line, a meetup's ring, the PokéStops while a place is picked, and everything the region editor draws: its regions in turn, `--region-1` to `--region-8`, places, overlaps, gaps, fixes) are read from the same properties at the page's first drawing and again whenever the page turns light or dark, by the device or by the member's choice (`theme()`, `src/web/client/theme.ts`, which names each property in `DRAWN_COLOURS` and `REGION_PALETTE`; `ThemeWatch` over `matchMedia('(prefers-color-scheme: dark)')` and the choice shown, `shownThemeChoice`, its `dark()` the choice, else the device, told of a choice by the event `pine-theme-chosen`; `onThemeChange`; the stylesheet loads before the deferred script; a property it lacks draws gray): the map sets its outlines' and gyms' style anew and draws its parties anew (under a form being filled in, once it closes), the region editor draws its regions anew (its places keep their colors in both sets; only what was near black, `--fix-line` and `--preview`, turns light in dark). A raid's ring and route mode's numbers share `--raid` and `--train` with what Leaflet draws.
+- To try a change: edit a value in `theme.css`, run `npm run web:build`, and reload the page (the bundle's names change with its content). A new color is a new property in `theme.css`, used through `var(--…)`, or named in `theme.ts` for what Leaflet draws. `page-theme.test.ts` checks that the light and dark sets name the same values (the dark set as written, under its prefix), `scripts/web/forced-dark.test.ts` that the build gives every dark block its forced copy rule for rule, and that every page's stylesheet imports `theme.css`, and refuses a color written anywhere else in `src/web/client/` and its folders: in a stylesheet but `theme.css`, a hex value, a color function (`rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `color-mix(`) or one of the usual named colors (`white`, `red`, … ; `transparent`, `inherit`, `currentColor` and `none` are allowed) anywhere in a value; in the pages' TypeScript, a hex value or a color function anywhere in a string or a template (read with the TypeScript parser, comments aside), or a string that is a named color (a sentence may name a color: "shown in red"), but for `MISSING_COLOUR` of `theme.ts`, the gray of a property the stylesheet lacks. It also refuses a property used or drawn that `theme.css` does not define. The CSP is unchanged: the properties are in the bundled stylesheet, never inline.
 
 ## The fix pass: answers and small fixes (plan 8M-11A)
 
@@ -347,6 +347,7 @@ Design `docs/superpowers/specs/2026-10-29-pre-cutover-small-pass-design.md`, "Pl
 - **Find's misspellings (O1, Matt's A):** each place of `/api/find-places` carries `guess` (`FoundPlace.guess`, `placeFit`'s `guess`: found only by a misspelling); `mergePlaces` ranks a guess after every other fit, so guesses come last within a kind and the cap of ten drops them first. `foundGroups` (`find.ts`) shows the guesses only when Find found nothing else for the text (no report, no party, no place by its words), and "Places · n" counts what it shows: `rocket` gives the Rocket reports and no Hockey Rinks, `gible` the raid and no Bible places, `ansus hall` still finds Ansys Hall. Discord's lists are unchanged.
 - **Answers without Discord's list marks (A1):** `pageWords` writes the bot's list mark at the start of a line (`- ` or `* `, `LIST_MARK`) as a bullet, `• ` (fix round 1, R1-2: dropped, the items no longer read as a list), before the markdown and `unplain`, each item kept on its own line: a research report of several stops, Split…'s dialog text. A member's own mark arrives escaped (`\- `, `plain()`'s `bulletedList`) and stays as typed. Discord keeps its list. The notice band, the answer line and a form's answer (`.form-answer`) keep line breaks (`white-space: pre-line`; `src/web/answer-look.test.ts`).
 - **A refusal nudges the phone card (A2):** the card's content is drawn anew under a press, so the control pressed is out of it when the answer comes and `shake` found no card. `PhoneCard` moves itself: `nudge()` bounces the element it keeps once (`@keyframes nudge`, up by `--nudge-distance`, 6 px, and back over `--shake-time`, class `nudge` taken off and put back as `shake` does), only under `prefers-reduced-motion: no-preference`; `shows(partyId)` says whether its body holds that party's `.post`, `holds(element)` whether an element is in it. `refusalMoves(from, partyId, card)` (`press-answer.ts`) nudges the card that holds `from` or shows the party, else shakes `from`'s popup: the party layer's `answered`, the post's forms' refusal that keeps its form (`PostFormsDeps.refused`, in place of their own `shake`) and the raid's Change… (`RaidUiDeps.refused`) all go through it.
+- **Light, Dark or Device (S10, Matt's C):** the map and its region editor offer a theme, kept in the browser (`localStorage` `pine-map-theme`, `light` or `dark`; Device, the default, keeps nothing; read and written through `browserStorage`, so a blocked storage leaves Device; `theme-choice.ts`: `readThemeChoice`, `keepThemeChoice`, `applyThemeChoice`, `choiceIsDark`, `themeItemNode`). The account menu holds "Theme: Light · Dark · Device" between its items and Log out, the current one pressed (`aria-pressed`, `.chosen`); a visitor, who has no account menu, gets a small ⋮ button (`.account-menu.theme-menu`, `aria-label` "Theme") in its place beside "Log in" holding only that; both close on Escape and a click outside, and a choice leaves the menu open with the page turned behind it (`showAccount(…, themed)`, `main.ts` passes `true`). The page sets `data-theme="light" | "dark"` on `<html>` for a forced choice and nothing for Device. Each dark block (`theme.css`'s tokens, `map.css`'s masks, `editor.css`'s Geoman icons) is written once, `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) … }`; the build adds the same rules for `:root[data-theme='dark']` after it, outside the query (`withForcedDark`, `scripts/web/forced-dark.ts`, an esbuild plugin over the page's own stylesheets; a rule of a dark block without that prefix fails the build). Not `light-dark()`: `ThemeWatch` reads tokens through `getComputedStyle`. `map.css` sets `color-scheme` for a forced choice, so the browser's own parts follow it. `ThemeWatch.dark()` is the choice, else the device (`choice`, the page's `shownThemeChoice()`, its `data-theme`); a change of either that turns the page reads the theme anew and tells its listeners (the tiles, the colors Leaflet draws), a change that does not tells nobody. `chooseTheme` keeps the choice, sets `data-theme` and says `pine-theme-chosen` on the document, which every bundle's watch hears (the region editor's bundle keeps a watch of its own). The choice is applied before the page is drawn by the head script `assets/theme-<hash>.js` (`theme-head.ts`; the manifest's `map.theme`; a classic `<script src>` in the map page's `<head>` before the stylesheet, neither deferred nor async, as the CSP allows only `'self'` and a hash). The server's own pages (answers, the login link's Continue, `/userscript`) keep the device's scheme. Tests: `theme-choice.test.ts`, `theme.test.ts`, `scripts/web/forced-dark.test.ts`, `page.test.ts`, `page-theme.test.ts` and `report-icons.test.ts` (the dark blocks' new shape).
 
 ## Adding a route
 
diff --git a/scripts/web/build.ts b/scripts/web/build.ts
index 2e3702d8f979f8d196315ef355a542bfdc96a71e..39573c3f29e6e32f03bcfc3ba18037768293a59c 100644
--- a/scripts/web/build.ts
+++ b/scripts/web/build.ts
@@ -1,6 +1,7 @@
-import { mkdir, rm, writeFile } from 'node:fs/promises';
+import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
 import path from 'node:path';
-import { build } from 'esbuild';
+import { build, type Plugin } from 'esbuild';
+import { withForcedDark } from './forced-dark.js';
 
 /**
  * Builds the web pages (`src/web/client/`) into `dist/web/`: the map (`assets/map-<hash>.js`
@@ -14,6 +15,10 @@ import { build } from 'esbuild';
  * script and style and the worker. The short pages' stylesheet (plan 8M-7) is `assets/page.css`,
  * a name without a hash, which the server names without the manifest. The folder is emptied first, so no old file stays; the rest
  * of `dist/web/` is the compiled server code of `src/web/` and is left alone.
+ *
+ * Plan 8M-13 (S10): the map's head script `assets/theme-<hash>.js` (`theme-head.ts`, the theme
+ * chosen set before the page is drawn), and the page's stylesheets with the rules of each dark
+ * block added for a page forced dark (`withForcedDark`, `forced-dark.ts`).
  */
 
 const root = path.resolve(import.meta.dirname, '../..');
@@ -27,10 +32,27 @@ await rm(assets, { recursive: true, force: true });
 await rm(manifest, { force: true });
 await mkdir(assets, { recursive: true });
 
+/** The page's own stylesheets, their dark blocks given their forced copies (plan 8M-13, S10). */
+const forcedDark: Plugin = {
+  name: 'forced-dark',
+  setup(on) {
+    // esbuild reads the filter as a Go regular expression, which takes no flags.
+    on.onLoad({ filter: /\.css$/ }, async (file) => {
+      if (path.resolve(path.dirname(file.path)) !== client) return undefined;
+      return {
+        contents: withForcedDark(await readFile(file.path, 'utf8')),
+        loader: 'css',
+        resolveDir: client,
+      };
+    });
+  },
+};
+
 const result = await build({
   entryPoints: [
     { in: path.join(client, 'main.ts'), out: 'map' },
     { in: path.join(client, 'map.css'), out: 'map' },
+    { in: path.join(client, 'theme-head.ts'), out: 'theme' },
     { in: path.join(client, 'editor.ts'), out: 'editor' },
     { in: path.join(client, 'editor.css'), out: 'editor' },
     { in: path.join(client, 'editor-worker.ts'), out: 'editor-worker' },
@@ -57,6 +79,7 @@ const result = await build({
   external: ['/icons/*'],
   metafile: true,
   logLevel: 'warning',
+  plugins: [forcedDark],
 });
 
 // The short pages' stylesheet (plan 8M-7: `pages.css` with `theme.css`), under a name of its own
@@ -70,6 +93,7 @@ const pages = await build({
   charset: 'utf8',
   metafile: true,
   logLevel: 'warning',
+  plugins: [forcedDark],
 });
 
 const outputs = [
@@ -82,7 +106,11 @@ const named = (pattern: RegExp): string => {
   return found;
 };
 const files = {
-  map: { script: named(/^map-[A-Z0-9]{8}\.js$/), style: named(/^map-[A-Z0-9]{8}\.css$/) },
+  map: {
+    script: named(/^map-[A-Z0-9]{8}\.js$/),
+    style: named(/^map-[A-Z0-9]{8}\.css$/),
+    theme: named(/^theme-[A-Z0-9]{8}\.js$/),
+  },
   editor: {
     script: named(/^editor-[A-Z0-9]{8}\.js$/),
     style: named(/^editor-[A-Z0-9]{8}\.css$/),
diff --git a/scripts/web/forced-dark.test.ts b/scripts/web/forced-dark.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..392befc52dea56af1721d04f23333802e04ca6f7
--- /dev/null
+++ b/scripts/web/forced-dark.test.ts
@@ -0,0 +1,93 @@
+import { readFileSync } from 'node:fs';
+import path from 'node:path';
+import { describe, expect, it } from 'vitest';
+import { blockAt } from '../../test/support/stylesheets.js';
+import { FORCED_DARK, withForcedDark } from './forced-dark.js';
+
+/**
+ * The page's dark rules in one place (plan 8M-13, S10): each `@media (prefers-color-scheme: dark)`
+ * block of the page's stylesheets is written once, for a page whose theme is not forced light;
+ * the build adds the same rules for a page forced dark (`data-theme="dark"`), whatever the device.
+ */
+
+const CLIENT = path.resolve(import.meta.dirname, '../../src/web/client');
+const read = (file: string): string => readFileSync(path.join(CLIENT, file), 'utf8');
+
+/** The rules of a stylesheet's text, as selector and declarations, spaces made one. */
+const rules = (css: string): Array<[string, string]> =>
+  [...css.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((rule) => [
+    (rule[1] ?? '').replace(/\s+/gu, ' ').trim(),
+    (rule[2] ?? '').replace(/\s+/gu, ' ').trim(),
+  ]);
+
+describe('the dark rules for a page forced dark (plan 8M-13, S10)', () => {
+  it('adds a copy of each dark block for a page forced dark, after it, outside the query', () => {
+    const css = [
+      '.a { color: var(--x); }',
+      '@media (prefers-color-scheme: dark) {',
+      "  :root:not([data-theme='light']) {",
+      '    --x: #000;',
+      '  }',
+      '',
+      "  :root:not([data-theme='light']) .b,",
+      "  :root:not([data-theme='light']) .c {",
+      '    filter: none;',
+      '  }',
+      '}',
+      '.d { color: var(--x); }',
+    ].join('\n');
+    const built = withForcedDark(css);
+    expect(built.startsWith(css.slice(0, css.indexOf('.d')))).toBe(true);
+    expect(built.trimEnd().endsWith('.d { color: var(--x); }')).toBe(true);
+    const added = built.slice(css.indexOf('.d') - 1, built.lastIndexOf('.d'));
+    expect(rules(added)).toEqual([
+      [`${FORCED_DARK}`, '--x: #000;'],
+      [`${FORCED_DARK} .b, ${FORCED_DARK} .c`, 'filter: none;'],
+    ]);
+    // The media query is left as it was.
+    expect(built).toContain('@media (prefers-color-scheme: dark) {');
+  });
+
+  it('refuses a dark rule that a forced Light would not turn off', () => {
+    const css = '@media (prefers-color-scheme: dark) {\n  :root {\n    --x: #000;\n  }\n}\n';
+    expect(() => withForcedDark(css)).toThrow(/:root/u);
+    const half = [
+      '@media (prefers-color-scheme: dark) {',
+      "  :root:not([data-theme='light']) .b, .c {",
+      '    filter: none;',
+      '  }',
+      '}',
+    ].join('\n');
+    expect(() => withForcedDark(half)).toThrow(/\.c/u);
+  });
+
+  it('leaves a stylesheet without dark rules as it is', () => {
+    expect(withForcedDark('.a { color: red; }\n')).toBe('.a { color: red; }\n');
+  });
+
+  it("gives the page's own dark blocks their forced copies, rule for rule", () => {
+    for (const file of ['theme.css', 'map.css', 'editor.css']) {
+      const source = read(file);
+      const dark = blockAt(source, /@media\s*\(prefers-color-scheme:\s*dark\)/u);
+      expect(dark, file).not.toBe('');
+      const built = withForcedDark(source);
+      // The rules the build added (a rule of the source may name a forced Dark itself: the
+      // browser's own parts' `color-scheme`, `map.css`).
+      const own = new Set(rules(source).map((rule) => rule.join('{')));
+      const forced = rules(built).filter(
+        (rule) => rule[0].includes(FORCED_DARK) && !own.has(rule.join('{')),
+      );
+      expect(rules(built).length, file).toBe(rules(source).length + forced.length);
+      const media = rules(
+        [...source.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/gu)]
+          .map((match) => blockAt(source.slice(match.index), /@media/u))
+          .join('\n'),
+      ).map(([selector, body]): [string, string] => [
+        selector.replaceAll(":root:not([data-theme='light'])", FORCED_DARK),
+        body,
+      ]);
+      expect(forced, file).toEqual(media);
+      expect(forced.length, file).toBeGreaterThan(0);
+    }
+  });
+});
diff --git a/scripts/web/forced-dark.ts b/scripts/web/forced-dark.ts
new file mode 100644
index 0000000000000000000000000000000000000000..baa058b8b145d3a408b048c1a13034f98ab3a572
--- /dev/null
+++ b/scripts/web/forced-dark.ts
@@ -0,0 +1,65 @@
+/**
+ * The page's dark rules for a page forced dark (plan 8M-13, S10). Each dark block of the page's
+ * stylesheets is written once, as
+ * `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) … { … } }`: dark where
+ * the device is and the member did not choose Light. The build adds, right after each such block,
+ * the same rules for `:root[data-theme='dark']` outside the query: dark wherever the member chose
+ * Dark. One source per block; a rule of such a block that a forced Light would not turn off is
+ * refused, so that a block of the old shape cannot slip through. Not `light-dark()`: `ThemeWatch`
+ * reads the tokens through `getComputedStyle`, which would hand Leaflet that text unresolved.
+ */
+
+/** The prefix of every selector of a dark block in the sources. */
+export const NOT_FORCED_LIGHT = ":root:not([data-theme='light'])";
+
+/** The prefix of the same rules for a page forced dark, which the build adds. */
+export const FORCED_DARK = ":root[data-theme='dark']";
+
+const DARK_MEDIA = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/gu;
+
+/** The index of the brace that closes the block opened at `open`. */
+function closing(css: string, open: number): number {
+  let depth = 0;
+  for (let at = open; at < css.length; at += 1) {
+    if (css[at] === '{') depth += 1;
+    if (css[at] === '}') {
+      depth -= 1;
+      if (depth === 0) return at;
+    }
+  }
+  throw new Error('a dark block is not closed');
+}
+
+/** A dark block's rules for a page forced dark; a selector without the prefix is refused. */
+function forcedRules(body: string): string {
+  const rules = [...body.replace(/\/\*[\s\S]*?\*\//gu, '').matchAll(/([^{}]+)\{([^{}]*)\}/gu)];
+  return rules
+    .map((rule) => {
+      const selectors = (rule[1] ?? '').split(',').map((one) => one.trim());
+      const forced = selectors.map((selector) => {
+        if (!selector.startsWith(NOT_FORCED_LIGHT)) {
+          throw new Error(
+            `a dark rule's selector must start with ${NOT_FORCED_LIGHT}, as a forced Light ` +
+              `turns it off: ${selector}`,
+          );
+        }
+        return FORCED_DARK + selector.slice(NOT_FORCED_LIGHT.length);
+      });
+      return `${forced.join(',\n')} {${rule[2] ?? ''}}`;
+    })
+    .join('\n\n');
+}
+
+/** A stylesheet with the rules for a page forced dark added after each of its dark blocks. */
+export function withForcedDark(css: string): string {
+  let built = '';
+  let from = 0;
+  for (const match of css.matchAll(DARK_MEDIA)) {
+    const open = match.index + match[0].length - 1;
+    const end = closing(css, open);
+    built += `${css.slice(from, end + 1)}\n\n/* The same, for a page forced dark (built). */\n`;
+    built += forcedRules(css.slice(open + 1, end));
+    from = end + 1;
+  }
+  return built + css.slice(from);
+}
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
index ba2ccfcdd83c1480de31a67b6595a2217a7f5af2..4301d363adb3a70be9e085428e61bb31d7fe11f6 100644
--- a/src/web/client/common.ts
+++ b/src/web/client/common.ts
@@ -17,7 +17,8 @@ import { LOGOUT_FAILED, logOut } from './logout.js';
 import { headerLines, inviteNode, NoticeBand, type Me, type WebPage } from './notice.js';
 import { renderNode } from './popup.js';
 import { requestError } from './request-error.js';
-import { darkScheme, onThemeChange } from './theme.js';
+import { chooseTheme, darkScheme, onThemeChange, shownThemeChoice } from './theme.js';
+import { THEME_CHOICES, themeItemNode, type ThemeChoice } from './theme-choice.js';
 
 /**
  * What the map page and the region editor share (plans 8M-1, 8M-2): the elements of the page,
@@ -232,16 +233,52 @@ export async function whoIsAsking(guild: string): Promise<Me> {
   }
 }
 
+/**
+ * "Theme: Light · Dark · Device" (plan 8M-13, S10): a press chooses (`chooseTheme`) and marks
+ * the choice; the menu stays open, the page turning behind it.
+ */
+function themeItem(): HTMLElement {
+  const item = renderNode(themeItemNode(shownThemeChoice()), document);
+  item.addEventListener('click', (event) => {
+    const pressed =
+      event.target instanceof HTMLElement
+        ? event.target.closest<HTMLElement>('[data-theme-choice]')?.dataset.themeChoice
+        : undefined;
+    const choice = THEME_CHOICES.find((one): one is ThemeChoice => one === pressed);
+    if (choice === undefined) return;
+    chooseTheme(choice);
+    for (const button of item.querySelectorAll<HTMLElement>('[data-theme-choice]')) {
+      const chosen = button.dataset.themeChoice === choice;
+      button.setAttribute('aria-pressed', String(chosen));
+      button.classList.toggle('chosen', chosen);
+    }
+  });
+  return item;
+}
+
+/** A small menu of the header (`<details>`) that closes on Escape and on a click outside it. */
+function closesByItself(menu: HTMLDetailsElement): void {
+  document.addEventListener('keydown', (event) => {
+    if (event.key === 'Escape') menu.open = false;
+  });
+  document.addEventListener('click', (event) => {
+    if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
+  });
+}
+
 /**
  * The header's account: the login, or the member's name with Log out, and what they may not.
- * `items`: what its menu holds before Log out for the member (the map's "Edit regions", plan
- * 8M-10); a press of one closes the menu.
+ * `items`: what its menu holds before the theme and Log out for the member (the map's "Edit
+ * regions", plan 8M-10); a press of one closes the menu. `themed`: the page offers Light, Dark
+ * or Device (plan 8M-13, S10: the map and its region editor), in the member's menu, or for a
+ * visitor, who has none, in a small ⋮ button of its own in its place.
  */
 export async function showAccount(
   guild: string,
   login: 'discord' | 'links',
   page: WebPage,
   items: (me: Me) => HTMLElement[] = () => [],
+  themed = false,
 ): Promise<Me> {
   const account = byId('account');
   const me = await whoIsAsking(guild);
@@ -262,6 +299,20 @@ export async function showAccount(
     link.append(full, short);
     account.append(link);
   }
+  if (themed && (header.name === undefined || !me.loggedIn)) {
+    const menu = document.createElement('details');
+    menu.className = 'account-menu theme-menu';
+    const summary = document.createElement('summary');
+    summary.textContent = '⋮';
+    summary.setAttribute('aria-label', 'Theme');
+    summary.title = 'Theme';
+    const held = document.createElement('div');
+    held.className = 'menu';
+    held.append(themeItem());
+    menu.append(summary, held);
+    closesByItself(menu);
+    account.append(menu);
+  }
   if (header.name !== undefined && me.loggedIn) {
     const name = document.createElement('span');
     name.className = 'name';
@@ -303,14 +354,10 @@ export async function showAccount(
       });
       held.append(item);
     }
+    if (themed) held.append(themeItem());
     held.append(logout);
     menu.append(summary, held);
-    document.addEventListener('keydown', (event) => {
-      if (event.key === 'Escape') menu.open = false;
-    });
-    document.addEventListener('click', (event) => {
-      if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
-    });
+    closesByItself(menu);
     account.append(menu);
   }
   for (const text of header.lines) {
diff --git a/src/web/client/editor.css b/src/web/client/editor.css
index 3729d2d6c7a8131fb1d16a51d178ba7222018c9c..b55e4c9be343fa715c6d924b2b620e23fa14e027 100644
--- a/src/web/client/editor.css
+++ b/src/web/client/editor.css
@@ -414,7 +414,7 @@
 
 /* Geoman's tool icons are dark drawings: turned light in dark, as the controls they sit on. */
 @media (prefers-color-scheme: dark) {
-  .leaflet-pm-toolbar .control-icon {
+  :root:not([data-theme='light']) .leaflet-pm-toolbar .control-icon {
     filter: invert(1);
   }
 }
diff --git a/src/web/client/main.ts b/src/web/client/main.ts
index 8d8c86d6ed005a21834ddf4dd15b56ac9a897e80..2a2307a460e6cb4d8cd8e8737b4180fca7ca6788 100644
--- a/src/web/client/main.ts
+++ b/src/web/client/main.ts
@@ -356,8 +356,13 @@ function start(): void {
   for (const layer of MAP_LAYERS) registry.register(layer);
   const controls = showLayerControls(registry, byId('layers'));
   const quiet = quietLine(map);
-  const account = showAccount(guild, data.login === 'discord' ? 'discord' : 'links', 'map', (me) =>
-    editingOffered(me) ? [editItem(toggle, load, guild, me, editLabel)] : [],
+  // Light, Dark or Device for the map and its region editor (plan 8M-13, S10).
+  const account = showAccount(
+    guild,
+    data.login === 'discord' ? 'discord' : 'links',
+    'map',
+    (me) => (editingOffered(me) ? [editItem(toggle, load, guild, me, editLabel)] : []),
+    true,
   ).then((me) => {
     asker.me = me;
     return me;
diff --git a/src/web/client/map.css b/src/web/client/map.css
index 50cd63454a2df47899a24e429a76aafdc19a175c..b602f542244f845f11950367ed1cba94deb7e7bb 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -183,6 +183,39 @@ a {
   }
 }
 
+/*
+ * Light, Dark or Device (plan 8M-13, S10): "Theme: Light · Dark · Device" in the account menu,
+ * the current one pressed; a visitor's ⋮ button in the account's place holds it alone.
+ */
+.theme-choice {
+  display: flex;
+  align-items: center;
+  gap: 4px;
+  white-space: nowrap;
+}
+
+#account .theme-choice .theme-option {
+  padding: 4px 8px;
+}
+
+#account .theme-choice .theme-option.chosen {
+  background: var(--primary);
+  color: var(--on-color);
+}
+
+.theme-menu summary::after {
+  content: none;
+}
+
+/* The browser's own parts (fields, scroll bars) follow a forced choice too. */
+:root[data-theme='light'] {
+  color-scheme: light;
+}
+
+:root[data-theme='dark'] {
+  color-scheme: dark;
+}
+
 /*
  * The region editor on (plan 8M-10): the live map's parts make way for the editor's own (its
  * map, tool row and panel, styled by `editor.css`), which are `hidden` while it is off.
@@ -844,8 +877,8 @@ body.editing-regions #map {
  * blew them out).
  */
 @media (prefers-color-scheme: dark) {
-  .report-icon.mask,
-  .report-icon.light {
+  :root:not([data-theme='light']) .report-icon.mask,
+  :root:not([data-theme='light']) .report-icon.light {
     filter: none;
   }
 }
diff --git a/src/web/client/party-layer.isolated.test.ts b/src/web/client/party-layer.isolated.test.ts
index 42b19594693417748c209c600f7d1b192fa28099..6c7ae07d0542900a23580a7b002fc7f597cadba3 100644
--- a/src/web/client/party-layer.isolated.test.ts
+++ b/src/web/client/party-layer.isolated.test.ts
@@ -276,6 +276,8 @@ describe("the map's popups (showParties)", () => {
       addEventListener: () => undefined,
       querySelectorAll: () => [],
       visibilityState: 'hidden',
+      // No theme chosen (plan 8M-13, S10): the device's.
+      documentElement: { getAttribute: () => null },
     });
     vi.stubGlobal('window', {
       setTimeout: () => 0,
diff --git a/src/web/client/places-ui.isolated.test.ts b/src/web/client/places-ui.isolated.test.ts
index d745bfe4e65c5f4da8e5dcebffa70b6c00f30b60..d7c5a580021eb7a885935ab5c97e56cfda591776 100644
--- a/src/web/client/places-ui.isolated.test.ts
+++ b/src/web/client/places-ui.isolated.test.ts
@@ -226,7 +226,9 @@ describe('the Power Spots and PokéStops of the view (showPlaces)', () => {
     // The theme read from a page without the stylesheet: its defaults.
     vi.stubGlobal('document', {
       createElement: (tag: string) => new PageElement(tag),
-      documentElement: {},
+      // No theme chosen (plan 8M-13, S10): the device's.
+      documentElement: { getAttribute: () => null },
+      addEventListener: () => undefined,
     });
     vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));
     /** The timers set (the 300 ms after the map rests), to run by hand. */
diff --git a/src/web/client/theme-choice.test.ts b/src/web/client/theme-choice.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..26e9c6696a94a60550e216b2c56e5765a5b4c364
--- /dev/null
+++ b/src/web/client/theme-choice.test.ts
@@ -0,0 +1,98 @@
+import { describe, expect, it } from 'vitest';
+import type { KeyValueStorage } from './staged-storage.js';
+import {
+  applyThemeChoice,
+  choiceIsDark,
+  keepThemeChoice,
+  readThemeChoice,
+  THEME_KEY,
+  themeItemNode,
+} from './theme-choice.js';
+
+/** A storage of the test's: what it holds, or one that throws at every use. */
+function storage(held: Record<string, string> = {}, throws = false): KeyValueStorage {
+  const check = () => {
+    if (throws) throw new Error('storage forbidden');
+  };
+  return {
+    getItem: (key) => {
+      check();
+      return held[key] ?? null;
+    },
+    setItem: (key, value) => {
+      check();
+      held[key] = value;
+    },
+    removeItem: (key) => {
+      check();
+      delete held[key];
+    },
+  };
+}
+
+describe('the theme chosen in the browser (plan 8M-13, S10)', () => {
+  it('is Device unless the browser keeps Light or Dark under pine-map-theme', () => {
+    expect(THEME_KEY).toBe('pine-map-theme');
+    expect(readThemeChoice(storage())).toBe('device');
+    expect(readThemeChoice(storage({ 'pine-map-theme': 'dark' }))).toBe('dark');
+    expect(readThemeChoice(storage({ 'pine-map-theme': 'light' }))).toBe('light');
+    expect(readThemeChoice(storage({ 'pine-map-theme': 'purple' }))).toBe('device');
+    // A blocked storage, or none at all, leaves Device.
+    expect(readThemeChoice(storage({ 'pine-map-theme': 'dark' }, true))).toBe('device');
+    expect(readThemeChoice(undefined)).toBe('device');
+  });
+
+  it('keeps Light or Dark, and forgets the choice for Device', () => {
+    const held: Record<string, string> = {};
+    keepThemeChoice(storage(held), 'dark');
+    expect(held).toEqual({ 'pine-map-theme': 'dark' });
+    keepThemeChoice(storage(held), 'device');
+    expect(held).toEqual({});
+    // A storage that keeps nothing: the choice holds for the visit, nothing thrown.
+    expect(() => {
+      keepThemeChoice(storage({}, true), 'light');
+    }).not.toThrow();
+    expect(() => {
+      keepThemeChoice(undefined, 'light');
+    }).not.toThrow();
+  });
+
+  it('sets data-theme on the page for a forced choice, and nothing for Device', () => {
+    const attributes = new Map<string, string>();
+    const root = {
+      setAttribute: (name: string, value: string) => attributes.set(name, value),
+      removeAttribute: (name: string) => attributes.delete(name),
+    };
+    applyThemeChoice(root, 'dark');
+    expect(attributes.get('data-theme')).toBe('dark');
+    applyThemeChoice(root, 'light');
+    expect(attributes.get('data-theme')).toBe('light');
+    applyThemeChoice(root, 'device');
+    expect(attributes.has('data-theme')).toBe(false);
+  });
+
+  it('is dark by the choice, else by the device', () => {
+    expect(choiceIsDark('dark', false)).toBe(true);
+    expect(choiceIsDark('light', true)).toBe(false);
+    expect(choiceIsDark('device', true)).toBe(true);
+    expect(choiceIsDark('device', false)).toBe(false);
+  });
+
+  it('is offered as "Theme: Light · Dark · Device", the current one marked', () => {
+    const node = themeItemNode('dark');
+    const buttons = (node.children ?? []).filter((child) => child.tag === 'button');
+    const words = (node.children ?? []).map((child) => child.text ?? '').join('');
+    expect(words).toBe('Theme: Light · Dark · Device');
+    expect(buttons.map((button) => button.attributes?.['data-theme-choice'])).toEqual([
+      'light',
+      'dark',
+      'device',
+    ]);
+    expect(buttons.map((button) => button.attributes?.['aria-pressed'])).toEqual([
+      'false',
+      'true',
+      'false',
+    ]);
+    expect(node.attributes).toMatchObject({ role: 'group', 'aria-label': 'Theme' });
+  });
+});
diff --git a/src/web/client/theme-choice.ts b/src/web/client/theme-choice.ts
new file mode 100644
index 0000000000000000000000000000000000000000..8fb37baa6b7e702ab9d3ab571bd6ba94f0811c0e
--- /dev/null
+++ b/src/web/client/theme-choice.ts
@@ -0,0 +1,90 @@
+import type { PageNode } from './popup.js';
+import type { KeyValueStorage } from './staged-storage.js';
+
+/**
+ * Light, Dark or Device (plan 8M-13, S10): the map's and the region editor's theme, chosen in the
+ * account menu (or the visitor's ⋮ button) and kept in the browser. Device, the default, follows
+ * the device as the pages always did. The page sets `data-theme="light" | "dark"` on `<html>` for
+ * a forced choice and nothing for Device; the stylesheets' dark rules apply where the page is not
+ * forced light and the device is dark, and wherever it is forced dark (`theme.css`; the build adds
+ * the forced copy, `scripts/web/forced-dark.ts`). The head script (`theme-head.ts`) applies the
+ * kept choice before the page is drawn. Imports nothing at run time: the head script is tiny.
+ */
+
+export type ThemeChoice = 'light' | 'dark' | 'device';
+
+/** The choices in the order the menu offers them. */
+export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'device'];
+
+/** Where the browser keeps the choice: one for every server, as the layers'. */
+export const THEME_KEY = 'pine-map-theme';
+
+/** Each choice's word in the menu. */
+const THEME_WORDS: Readonly<Record<ThemeChoice, string>> = {
+  light: 'Light',
+  dark: 'Dark',
+  device: 'Device',
+};
+
+/** The choice the browser keeps (`browserStorage`), Device where it keeps none or cannot say. */
+export function readThemeChoice(storage: KeyValueStorage | undefined): ThemeChoice {
+  try {
+    const kept = storage?.getItem(THEME_KEY);
+    return kept === 'light' || kept === 'dark' ? kept : 'device';
+  } catch {
+    return 'device';
+  }
+}
+
+/** Keeps a choice: Light or Dark under `THEME_KEY`, Device by forgetting it; never throws. */
+export function keepThemeChoice(storage: KeyValueStorage | undefined, choice: ThemeChoice): void {
+  try {
+    if (choice === 'device') storage?.removeItem(THEME_KEY);
+    else storage?.setItem(THEME_KEY, choice);
+  } catch {
+    // Private mode or a full storage: the choice holds for this visit.
+  }
+}
+
+/** Sets the page's `data-theme` for a forced choice, and takes it off for Device. */
+export function applyThemeChoice(
+  root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void },
+  choice: ThemeChoice,
+): void {
+  if (choice === 'device') root.removeAttribute('data-theme');
+  else root.setAttribute('data-theme', choice);
+}
+
+/** Whether the page is dark: by the choice, else by the device. */
+export function choiceIsDark(choice: ThemeChoice, deviceDark: boolean): boolean {
+  return choice === 'device' ? deviceDark : choice === 'dark';
+}
+
+/**
+ * The menu's item "Theme: Light · Dark · Device", a button per choice (`data-theme-choice`), the
+ * current one pressed.
+ */
+export function themeItemNode(current: ThemeChoice): PageNode {
+  const children: PageNode[] = [{ tag: 'span', className: 'theme-label', text: 'Theme: ' }];
+  THEME_CHOICES.forEach((choice, index) => {
+    if (index > 0) {
+      children.push({ tag: 'span', text: ' · ', attributes: { 'aria-hidden': 'true' } });
+    }
+    children.push({
+      tag: 'button',
+      className: choice === current ? 'theme-option chosen' : 'theme-option',
+      text: THEME_WORDS[choice],
+      attributes: {
+        type: 'button',
+        'data-theme-choice': choice,
+        'aria-pressed': String(choice === current),
+      },
+    });
+  });
+  return {
+    tag: 'div',
+    className: 'theme-choice',
+    attributes: { role: 'group', 'aria-label': 'Theme' },
+    children,
+  };
+}
diff --git a/src/web/client/theme-head.ts b/src/web/client/theme-head.ts
new file mode 100644
index 0000000000000000000000000000000000000000..84a786915bbb4f6663d6db45cd653dc61c88a5c4
--- /dev/null
+++ b/src/web/client/theme-head.ts
@@ -0,0 +1,13 @@
+import { browserStorage } from './staged-storage.js';
+import { applyThemeChoice, readThemeChoice } from './theme-choice.js';
+
+/**
+ * The map page's head script (plan 8M-13, S10): a classic script of its own (`<script src>`, the
+ * CSP lets nothing inline in), run before the page is drawn, that sets the theme the browser
+ * keeps on `<html>` (`data-theme`), so that the page does not show the device's scheme first.
+ * Built as `assets/theme-<hash>.js` (`scripts/web/build.ts`).
+ */
+applyThemeChoice(
+  document.documentElement,
+  readThemeChoice(browserStorage(() => window.localStorage)),
+);
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index f6f99fdc4afec14ad8ae896074d2d25ac384b68d..215df2e68ed2f132b1c3fcb7492dfa02cd2fa976 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -1,7 +1,11 @@
 /*
  * The look of every page Pine serves as named values (plans 8M-6, 8M-7): every color, and the
  * sizes a restyle would touch, in two sets of the same names: light in `:root`, dark in the
- * media query below, so that each page follows the device's light or dark. The look is
+ * media query below, so that each page follows the device's light or dark, unless the member
+ * chose Light or Dark on the map (plan 8M-13, S10: `data-theme` on `<html>`; the dark set
+ * applies where the page is not forced light, and the build adds it for a page forced dark,
+ * `scripts/web/forced-dark.ts`: write a dark rule once, its selector starting with
+ * `:root:not([data-theme='light'])`). The look is
  * Discord's: its grays, blurple primary buttons, gray secondary ones, green and red as the posts
  * use them, cards with the colored side bar of a components-v2 container. `map.css`, `editor.css`,
  * `userscript.css` and `pages.css` use them; the colors Leaflet draws (outlines, dots, lines,
@@ -170,7 +174,7 @@
 }
 
 @media (prefers-color-scheme: dark) {
-  :root {
+  :root:not([data-theme='light']) {
     /* Type and shape. */
     --font: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
     --font-size: 15px;
diff --git a/src/web/client/theme.test.ts b/src/web/client/theme.test.ts
index 0c42a0762f70007ac4db107444d1359fd8ca8205..c0bc739846a6a1047724effac34b51af02222422 100644
--- a/src/web/client/theme.test.ts
+++ b/src/web/client/theme.test.ts
@@ -9,6 +9,7 @@ import {
   ThemeWatch,
   type SchemeQuery,
 } from './theme.js';
+import { choiceIsDark, type ThemeChoice } from './theme-choice.js';
 
 /** A `matchMedia('(prefers-color-scheme: dark)')` of the test's, whose scheme it changes. */
 function fakeScheme(dark: boolean): SchemeQuery & { change(dark: boolean): void } {
@@ -52,6 +53,57 @@ describe('ThemeWatch (plan 8M-7)', () => {
     expect(watch.dark()).toBe(false);
     expect(watch.theme().colours.raid).toBe('#123456');
   });
+
+  // Plan 8M-13 (S10): Light, Dark or Device, chosen on the page.
+  describe('with a choice of Light, Dark or Device', () => {
+    /** A watch over a scheme and a choice of the test's; the page's colors follow both. */
+    const watched = (device: boolean, chosen: ThemeChoice) => {
+      const scheme = fakeScheme(device);
+      const choice = { now: chosen };
+      const dark = () => choiceIsDark(choice.now, scheme.matches);
+      const watch = new ThemeWatch(
+        (property) => (property === '--gym' ? (dark() ? 'dark-gym' : 'light-gym') : '#123456'),
+        scheme,
+        () => choice.now,
+      );
+      const told: string[] = [];
+      watch.onChange((theme) => told.push(theme.colours.gym));
+      return { scheme, choice, watch, told };
+    };
+
+    it('is the choice, else the device', () => {
+      expect(watched(false, 'dark').watch.dark()).toBe(true);
+      expect(watched(true, 'light').watch.dark()).toBe(false);
+      expect(watched(true, 'device').watch.dark()).toBe(true);
+    });
+
+    it('tells the tiles and colors when the choice changes what is drawn', () => {
+      const { choice, watch, told } = watched(false, 'device');
+      expect(watch.theme().colours.gym).toBe('light-gym');
+      choice.now = 'dark';
+      watch.chosen();
+      expect(told).toEqual(['dark-gym']);
+      expect(watch.dark()).toBe(true);
+      // Device on a light device: light again.
+      choice.now = 'device';
+      watch.chosen();
+      expect(told).toEqual(['dark-gym', 'light-gym']);
+      // Light from Device on a light device changes nothing drawn: nobody is told.
+      choice.now = 'light';
+      watch.chosen();
+      expect(told).toEqual(['dark-gym', 'light-gym']);
+    });
+
+    it('follows the device only while the choice is Device', () => {
+      const forced = watched(false, 'light');
+      forced.scheme.change(true);
+      expect(forced.told).toEqual([]);
+      expect(forced.watch.dark()).toBe(false);
+      const device = watched(false, 'device');
+      device.scheme.change(true);
+      expect(device.told).toEqual(['dark-gym']);
+    });
+  });
 });
 
 describe('readTheme', () => {
diff --git a/src/web/client/theme.ts b/src/web/client/theme.ts
index 88a1e9a9843944371b9542b325821ec723b4d45f..b53a4280fc0f326584d62c068d3aa2842dc44f0e 100644
--- a/src/web/client/theme.ts
+++ b/src/web/client/theme.ts
@@ -8,6 +8,14 @@
  * (`page-theme.test.ts`).
  */
 
+import { browserStorage } from './staged-storage.js';
+import {
+  applyThemeChoice,
+  choiceIsDark,
+  keepThemeChoice,
+  type ThemeChoice,
+} from './theme-choice.js';
+
 /** Each colour drawn from TypeScript, by the custom property of `theme.css` that holds it. */
 export const DRAWN_COLOURS = {
   /** The map's gym dots. */
@@ -142,23 +150,26 @@ export interface SchemeQuery {
 }
 
 /**
- * The theme of a page that follows the device's light or dark (plan 8M-7): read once, and read
- * again when the scheme changes (`theme.css` holds a set of values for each), after which every
- * listener is told, so that what Leaflet drew is drawn in the new colors. Without a query (a
- * browser that cannot say) the page is light and stays so.
+ * The theme of a page (plan 8M-7): read once, and read again when what is drawn turns light or
+ * dark (`theme.css` holds a set of values for each), after which every listener is told, so that
+ * what Leaflet drew is drawn in the new colors. Dark is the member's choice (plan 8M-13, S10:
+ * Light, Dark or Device, `choice`), else the device's scheme; a change of either that turns the
+ * page tells. Without a query (a browser that cannot say) the device is light.
  */
 export class ThemeWatch {
   private current: Theme | undefined;
   private readonly listeners: Array<(theme: Theme) => void> = [];
+  /** Whether the page was dark when last told (or first asked). */
+  private wasDark: boolean;
 
   constructor(
     private readonly read: (property: string) => string,
     private readonly query: SchemeQuery | undefined,
+    private readonly choice: () => ThemeChoice = () => 'device',
   ) {
+    this.wasDark = this.dark();
     query?.addEventListener('change', () => {
-      this.current = undefined;
-      const next = this.theme();
-      for (const listener of this.listeners) listener(next);
+      this.changed();
     });
   }
 
@@ -167,9 +178,24 @@ export class ThemeWatch {
     return this.current;
   }
 
-  /** Whether the device is dark now. */
+  /** Whether the page is dark now: by the choice, else by the device. */
   dark(): boolean {
-    return this.query?.matches ?? false;
+    return choiceIsDark(this.choice(), this.query?.matches ?? false);
+  }
+
+  /** The member chose another theme (its `data-theme` already set): told where it turned. */
+  chosen(): void {
+    this.changed();
+  }
+
+  /** The theme read anew and every listener told, where the page turned light or dark. */
+  private changed(): void {
+    const dark = this.dark();
+    if (dark === this.wasDark) return;
+    this.wasDark = dark;
+    this.current = undefined;
+    const next = this.theme();
+    for (const listener of this.listeners) listener(next);
   }
 
   /** Tells `listener` the new theme after each change of the scheme. */
@@ -180,15 +206,36 @@ export class ThemeWatch {
 
 let watch: ThemeWatch | undefined;
 
-/** The page's own watch, made at the first call. */
+/**
+ * The choice the page shows now: its `data-theme` (set by the head script from what the browser
+ * keeps, `theme-head.ts`, and by `chooseTheme`), Device without one.
+ */
+export function shownThemeChoice(): ThemeChoice {
+  const shown = document.documentElement.getAttribute('data-theme');
+  return shown === 'light' || shown === 'dark' ? shown : 'device';
+}
+
+/**
+ * Said on the document when the member chose a theme (`chooseTheme`): the region editor's
+ * bundle keeps a watch of its own, which hears it as the map's does.
+ */
+const THEME_CHOSEN = 'pine-theme-chosen';
+
+/** The page's own watch, made at the first call, told of the device's changes and the choice's. */
 function pageWatch(): ThemeWatch {
-  watch ??= new ThemeWatch(
+  if (watch) return watch;
+  const made = new ThemeWatch(
     (property) => getComputedStyle(document.documentElement).getPropertyValue(property),
     typeof window.matchMedia === 'function'
       ? window.matchMedia('(prefers-color-scheme: dark)')
       : undefined,
+    shownThemeChoice,
   );
-  return watch;
+  document.addEventListener(THEME_CHOSEN, () => {
+    made.chosen();
+  });
+  watch = made;
+  return made;
 }
 
 /** The page's theme, read from `:root` at the first call and again after a change of scheme. */
@@ -196,11 +243,25 @@ export function theme(): Theme {
   return pageWatch().theme();
 }
 
-/** Whether the device is dark now. */
+/** Whether the page is dark now: the member's choice, else the device (plan 8M-13, S10). */
 export function darkScheme(): boolean {
   return pageWatch().dark();
 }
 
+/**
+ * The member chose Light, Dark or Device (plan 8M-13, S10): kept in the browser, set on the page
+ * (`data-theme`), and the tiles and colors told where the page turned.
+ */
+export function chooseTheme(choice: ThemeChoice): void {
+  keepThemeChoice(
+    browserStorage(() => window.localStorage),
+    choice,
+  );
+  applyThemeChoice(document.documentElement, choice);
+  pageWatch();
+  document.dispatchEvent(new Event(THEME_CHOSEN));
+}
+
 /** Calls `listener` after each change between light and dark, the theme read anew. */
 export function onThemeChange(listener: (theme: Theme) => void): void {
   pageWatch().onChange(listener);
diff --git a/src/web/page-theme.test.ts b/src/web/page-theme.test.ts
index 1391d89c7fc843017f1f2f70168c844a5e1f58bb..d5edaf5ea4437792bed02ff9c55aebe335c485ad 100644
--- a/src/web/page-theme.test.ts
+++ b/src/web/page-theme.test.ts
@@ -166,7 +166,8 @@ describe("the pages' look", () => {
     const theme = declarations(read('theme.css'));
     expect(theme.length).toBeGreaterThan(0);
     for (const [selector, property] of theme) {
-      expect(selector, property).toBe(':root');
+      // The light set, and the dark one where the page is not forced light (plan 8M-13, S10).
+      expect([':root', ":root:not([data-theme='light'])"], property).toContain(selector);
       expect(property).toMatch(/^--[a-z0-9-]+$/u);
     }
     // The map loads it, and the editor's stylesheet is loaded beside the map's (plan 8M-10).
@@ -175,9 +176,12 @@ describe("the pages' look", () => {
 
   it('names the same values in its light set and its dark set (plan 8M-7)', () => {
     const css = withoutComments(read('theme.css'));
-    const dark = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^{}]*)\}\s*\}/u.exec(
-      css,
-    );
+    // Dark where the page is not forced light; the build adds it for a page forced dark (plan
+    // 8M-13, S10, `scripts/web/forced-dark.ts`).
+    const dark =
+      /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)\s*\{([^{}]*)\}\s*\}/u.exec(
+        css,
+      );
     expect(dark, 'a dark set in @media (prefers-color-scheme: dark)').not.toBeNull();
     const light = /^\s*:root\s*\{([^{}]*)\}/u.exec(css);
     expect(light, 'the light set first, in :root').not.toBeNull();
diff --git a/src/web/page.test.ts b/src/web/page.test.ts
index 7ad800a37c3bfaf9b964fd0f7cd07ac8fdfcdb2c..6de6d9b8ce3b524233c6e139053a98dcfd0ed38c 100644
--- a/src/web/page.test.ts
+++ b/src/web/page.test.ts
@@ -15,7 +15,7 @@ describe("the bundle's manifest", () => {
       rmSync(root, { recursive: true, force: true, maxRetries: 3 });
     });
     const manifest = {
-      map: { script: 'map-A.js', style: 'map-B.css' },
+      map: { script: 'map-A.js', style: 'map-B.css', theme: 'theme-H.js' },
       editor: { script: 'editor-C.js', style: 'editor-D.css', worker: 'editor-worker-E.js' },
       userscript: { script: 'userscript-F.js', style: 'userscript-G.css' },
     };
@@ -35,6 +35,12 @@ describe("the bundle's manifest", () => {
       JSON.stringify({ map: manifest.map, editor: manifest.editor }),
     );
     expect((await readAssets(root)).manifest).toBeUndefined();
+    // What the build before the theme's choice wrote (plan 8M-13): the map without its head script.
+    writeFileSync(
+      path.join(root, 'assets.json'),
+      JSON.stringify({ ...manifest, map: { script: 'map-A.js', style: 'map-B.css' } }),
+    );
+    expect((await readAssets(root)).manifest).toBeUndefined();
   });
 });
 
@@ -65,6 +71,12 @@ describe('the map page', () => {
     expect(page.body).toContain('<script src="/assets/map-ABCDEFGH.js" defer></script>');
     expect(page.body).toContain('<link rel="stylesheet" href="/assets/map-IJKLMNOP.css">');
     expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
+    // The theme chosen (plan 8M-13, S10), set before the page is drawn: a classic script of the
+    // head, neither deferred nor async, before the stylesheet.
+    const head = page.body.slice(0, page.body.indexOf('</head>'));
+    const theme = head.indexOf('<script src="/assets/theme-STUVWXYZ.js"></script>');
+    expect(theme).toBeGreaterThan(0);
+    expect(theme).toBeLessThan(head.indexOf('<link rel="stylesheet"'));
     expect(page.body).not.toMatch(/<style|\sstyle=|\son\w+=/i);
     // The title, "Pine" alone narrower than 768 pixels (fix round 1).
     expect(page.body).toContain(
@@ -215,7 +227,10 @@ describe("every page's look (plan 8M-7)", () => {
       `/auth/link/${FAKE_GUILD_ID}/${web.loginLinks.issue(FAKE_GUILD_ID, '700000000000000001', 'Ash', web.clock.now)}`,
       '/s/412345678901234999/map',
     ]) {
-      followsTheScheme((await web.app.inject({ url })).body, 'page.css', url);
+      const body = (await web.app.inject({ url })).body;
+      followsTheScheme(body, 'page.css', url);
+      // The server's own pages keep the device's scheme (plan 8M-13, S10): no choice applied.
+      expect(body, url).not.toContain('theme-STUVWXYZ.js');
     }
   });
 });
@@ -234,6 +249,10 @@ describe('the files of the bundle', () => {
     expect(script.headers['content-type']).toMatch(/javascript/);
     expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
     expect(script.headers['x-content-type-options']).toBe('nosniff');
+    // The map's head script (plan 8M-13, S10), as the page names it.
+    const theme = await web.app.inject({ url: '/assets/theme-STUVWXYZ.js' });
+    expect(theme.statusCode).toBe(200);
+    expect(theme.headers['content-type']).toMatch(/javascript/);
     const plain = await web.app.inject({ url: '/assets/notes.txt' });
     expect(plain.statusCode).toBe(200);
     expect(plain.headers['cache-control']).toBe('no-cache');
diff --git a/src/web/page.ts b/src/web/page.ts
index 594fc92d36aa490b6d4a161f6e6da448e24fd208..25147f8785f9f3cf519272ef11490be51c60c59d 100644
--- a/src/web/page.ts
+++ b/src/web/page.ts
@@ -16,10 +16,11 @@ export interface PageAssets {
 /**
  * The names of the bundle's files the pages load (`dist/web/assets.json`): the map's, and the
  * region editor's with the script of its worker (plan 8M-2), and the page of the Wayspot export
- * tool (`/userscript`, plan 8W-P).
+ * tool (`/userscript`, plan 8W-P). The map's `theme` is its head script (plan 8M-13, S10: the
+ * theme chosen set before the page is drawn).
  */
 export interface AssetManifest {
-  map: PageAssets;
+  map: PageAssets & { theme: string };
   editor: PageAssets & { worker: string };
   userscript: PageAssets;
 }
@@ -53,16 +54,19 @@ export async function readAssets(root = WEB_DIST): Promise<WebAssets> {
   const dir = path.resolve(root, 'assets');
   try {
     const read = JSON.parse(await readFile(path.join(root, 'assets.json'), 'utf8')) as {
-      map?: unknown;
+      map?: { theme?: unknown };
       editor?: { worker?: unknown };
       userscript?: unknown;
     };
     const map = pageAssets(read.map);
     const editor = pageAssets(read.editor);
     const worker = read.editor?.worker;
+    const theme = read.map?.theme;
     const userscript = pageAssets(read.userscript);
-    if (!map || !editor || !userscript || !isText(worker)) return { dir, manifest: undefined };
-    return { dir, manifest: { map, editor: { ...editor, worker }, userscript } };
+    if (!map || !editor || !userscript || !isText(worker) || !isText(theme)) {
+      return { dir, manifest: undefined };
+    }
+    return { dir, manifest: { map: { ...map, theme }, editor: { ...editor, worker }, userscript } };
   } catch {
     return { dir, manifest: undefined };
   }
@@ -95,8 +99,12 @@ function bodyAttributes(data: MapPageData, more: readonly string[] = []): string
   ].join(' ');
 }
 
-/** The head of a page: its title, its style and its script, nothing inline. */
-function head(title: string, assets: PageAssets): string[] {
+/**
+ * The head of a page: its title, its style and its script, nothing inline; first the head script
+ * of a page with a theme to choose (`theme`, plan 8M-13, S10), neither deferred nor async, so
+ * that the choice is set before anything is drawn.
+ */
+function head(title: string, assets: PageAssets & { theme?: string }): string[] {
   return [
     '<!doctype html>',
     '<html lang="en">',
@@ -104,6 +112,9 @@ function head(title: string, assets: PageAssets): string[] {
     '<meta charset="utf-8">',
     '<meta name="viewport" content="width=device-width, initial-scale=1">',
     COLOR_SCHEME_META,
+    ...(assets.theme === undefined
+      ? []
+      : [`<script src="/assets/${escapeHtml(assets.theme)}"></script>`]),
     `<title>${escapeHtml(title)}</title>`,
     `<link rel="stylesheet" href="/assets/${escapeHtml(assets.style)}">`,
     `<script src="/assets/${escapeHtml(assets.script)}" defer></script>`,
diff --git a/src/web/report-icons.test.ts b/src/web/report-icons.test.ts
index a553ff09259171bc949eb5129bd8c7ff953400f6..ab3d56abba56547cecd08bbe3646d97e32ae7009 100644
--- a/src/web/report-icons.test.ts
+++ b/src/web/report-icons.test.ts
@@ -94,7 +94,11 @@ describe("the Report menu's icons", () => {
     const dark = [...css.matchAll(/@media \(prefers-color-scheme: dark\) \{([^@]*?)\n\}/gu)]
       .map((match) => match[1] ?? '')
       .join('\n');
-    expect(dark).toMatch(/\.report-icon\.mask,\s*\.report-icon\.light \{\s*filter: none;/u);
+    // Where the page is not forced light; the build adds the rule for a page forced dark (plan
+    // 8M-13, S10).
+    expect(dark).toMatch(
+      /:root:not\(\[data-theme='light'\]\) \.report-icon\.mask,\s*:root:not\(\[data-theme='light'\]\) \.report-icon\.light \{\s*filter: none;/u,
+    );
     // Matt, 2026-10-28 (fix round 1): the train without the halo in light too.
     const outside = css.replace(/@media[^{]*\{[\s\S]*?\n\}/gu, '');
     expect(outside).toMatch(/\.report-icon\.shape-train \{[^}]*filter: none;/u);
diff --git a/test/support/web.ts b/test/support/web.ts
index c5a7c3b4a25f104c22d5adb61542aa57283948a1..d2e85a86fd71335dfbf5f058c4c74218246431d0 100644
--- a/test/support/web.ts
+++ b/test/support/web.ts
@@ -721,6 +721,7 @@ export function builtAssets(): WebAssets {
   mkdirSync(dir);
   writeFileSync(path.join(dir, 'map-ABCDEFGH.js'), 'console.log("map");');
   writeFileSync(path.join(dir, 'map-IJKLMNOP.css'), 'body { margin: 0; }');
+  writeFileSync(path.join(dir, 'theme-STUVWXYZ.js'), 'console.log("theme");');
   writeFileSync(path.join(dir, 'editor-QRSTUVWX.js'), 'console.log("editor");');
   writeFileSync(path.join(dir, 'editor-YZABCDEF.css'), 'body { margin: 0; }');
   writeFileSync(path.join(dir, 'editor-worker-GHIJKLMN.js'), 'console.log("worker");');
@@ -731,7 +732,7 @@ export function builtAssets(): WebAssets {
   return {
     dir,
     manifest: {
-      map: { script: 'map-ABCDEFGH.js', style: 'map-IJKLMNOP.css' },
+      map: { script: 'map-ABCDEFGH.js', style: 'map-IJKLMNOP.css', theme: 'theme-STUVWXYZ.js' },
       editor: {
         script: 'editor-QRSTUVWX.js',
         style: 'editor-YZABCDEF.css',
````

## After the last task

- [ ] `npm run check > var/smallpass-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 4ac9d029d46f0167bd3ee79efc3d08b85bb9b9a6 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
