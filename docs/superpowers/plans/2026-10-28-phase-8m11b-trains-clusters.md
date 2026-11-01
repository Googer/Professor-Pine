# Phase 8M-11B: The Web Map's Fix Pass, Trains, Clusters and the Invite: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the second plan of the web map's fix pass. A train's line on the map shows its way (S27); dragging a stop shows where it will land, and a held stop holds the map (S24, S25); the gyms' clusters are fewer and smooth (S13); a logged-in visitor who is not in the server is offered the server's invite (Matt, 2026-10-28).

- **Task 1:** S27. `MapTrain.atEnd` from the trains domain's `endMode` (one path). `src/web/client/train-line.ts` (`trainLegs`, `legArrows`, `arrowElement`): done legs faint (`--train-done` 0.35), arrowheads at the middle of each leg ahead (none under 40 px on screen, redrawn on every zoom), a loop's closing leg dashed. The line's pieces are one `L.featureGroup` under the popup key `route:<id>`.
- **Task 2:** S24 and S25. `dropNeighbors`, `dropLegs` and `holdMap` in `train-forms.ts`; the dotted drag line on its own layer; touch zoom and dragging off while a stop is held, given back in `endDrag` by every path, only the gestures that were on.
- **Task 3:** S13. Clusters keyed by their cell (`cluster:<zoom>:<x>:<y>`), `planDots` with `add`/`remove`/`move`/`change`, counts and places changed in place, markers handed to the next zoom's clusters; `cellPixels(zoom)` 60 / 90 / 120 px. Profile (Pittsburgh's 5,886 Wayfarer gyms): zoom steps between 11 and 14 went from about 1,200–1,400 markers made and destroyed to 100–300, the rest moved.
- **Task 4:** the invite. `settings.web.invites` (server id → `https://discord.gg/<code>` or `https://discord.com/invite/<code>`, refused otherwise at load); `/api/me`'s `invite` only for a logged-in visitor the directory does not find; the page's "Join the server on Discord" (`rel="noopener"`).
- **Task 5:** docs (`web.md`, `trains.md`, `testing.md`, `docs/web-setup.md`, the two guides) and the staging checklist `2026-10-28-phase-8m11b-staging.md`.

**Tech stack:**
- TypeScript 6.0, Node 26, Leaflet, esbuild, Fastify and Vitest.
- No new dependency, no migration, no command change, so no deploy. One new optional setting (`web.invites`). The CSP is unchanged.

**Spec:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11B: trains and clusters on the map"), approved by Matt 2026-10-28, its invite section added on his decision (f05bc6fd). With it: the brief `.superpowers/sdd/2026-10-28-phase-8m11b-trains-clusters/design.md` (git-ignored), its fix list and `progress.md`.

**Every diff in this plan was run before the plan was written.**
- They were made on a throwaway branch `proto-8m11b` (tip `59056e20`), one commit per task, on web-fix-pass bd02c340 (typescript-migration with 8Y).
- Each commit typechecks and passes its tests.
- On the tip, the full check (10,784 tests), the build and the database suite (612 tests) pass.

**Reviews:**
- **The prototype:** an Opus review returned "ready after fixes": 1 Important (the line's three pieces had popup keys `showsParty` did not know, so a popup opened from the faint leg missed its post), 2 Minor (arrowheads not redrawn on a zoom under a held form; a cluster guard test that could not fail, and the cluster's title untested). The prototyper's calls were all accepted (the invite beside the line on a desktop, `invites` optional, a two-stop loop's arrows at two thirds, the dotted drag line, cell sizes kept).
- **Fix round 1:** folded in; a scoped re-review returned "ready", with no findings.

**Conventions:** read `CLAUDE.md` and `docs/architecture/web.md`, `trains.md` and `testing.md`.

**Inside the plan:**
- Each commit needs only the typecheck (root and `src/web/client`) and its own test files.
- The full check, the build and the database suite run once, on the tip.
- Work in `../Professor-Pine-fixpass` on `web-fix-pass`; never commit in the main checkout.

## Review Focus

- A train's popup opened from any piece of its line (faint, ahead, closing leg) is the train's popup: it gets the post, closes on Delete…, and survives a redraw that removes that piece.
- Every way a drag ends (drop, Escape, cancel, lost capture, an edit, route mode ended) clears the line and gives the map back only the gestures it had.
- No cluster marker leaks or keeps a stale count or place across zooms, polls and layer toggles; the open gym is never removed.
- The invite reaches only a logged-in visitor who is not in the server, never a logged-out one, a member without the role, or anyone while Discord is away; a malformed address stops the start.
- The page uses nothing newer than ES2023 and no Temporal.

---

### Task 1: 8M-11B S27: a train's line shows its way on the map

Prototype commit: `4ea89bbfaa176af4ac7bee504f331c4e0ed066d4`

MapTrain.atEnd is the end mode as the domain applies it (endMode, now
exported from train.ts: a route under two stops finishes). The page
draws a train's legs done faint (--train-done, 0.35) and those ahead as
before (--train-ahead, 0.8), both read from theme.css (DRAWN_OPACITIES);
a loop's closing leg dashed; an arrowhead (divIcon, an SVG triangle in
the train's color, turned by the leg's bearing on the screen) at the
middle of each leg ahead of 40 pixels or more, drawn anew at each zoom,
two thirds along where a loop of two stops goes out and back on one
line. A finished route is all faint, without its closing leg or
arrowheads. The pure parts are train-line.ts (trainLegs, legArrows,
arrowElement).

**Files:**

```
 src/domain/party/train.ts                        |   5 ++--
 src/domain/web/party-data.ts                     |   6 +++++
 src/domain/web/party-view.test.ts                |  17 ++++++++++++
 src/domain/web/party-view.ts                     |   3 ++-
 src/web/client/parties.test.ts                   |   1 +
 src/web/client/party-layer-draw.isolated.test.ts | 204 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-------
 src/web/client/party-layer.ts                    |  92 +++++++++++++++++++++++++++++++++++++++++++++++++++++++----------
 src/web/client/post-draw.test.ts                 |   2 ++
 src/web/client/theme.css                         |   5 ++++
 src/web/client/theme.test.ts                     |  17 +++++++++++-
 src/web/client/theme.ts                          |  26 ++++++++++++++++++-
 src/web/client/train-forms.test.ts               |   1 +
 src/web/client/train-line.test.ts                | 126 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-line.ts                     | 126 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-ui.isolated.test.ts         |   1 +
 src/web/client/what-is-on.test.ts                |   1 +
 16 files changed, 605 insertions(+), 28 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/domain/web/party-view.test.ts src/web/client/parties.test.ts src/web/client/party-layer-draw.isolated.test.ts src/web/client/post-draw.test.ts src/web/client/theme.test.ts src/web/client/train-forms.test.ts src/web/client/train-line.test.ts src/web/client/train-ui.isolated.test.ts src/web/client/what-is-on.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 4ea89bbfaa176af4ac7bee504f331c4e0ed066d4 -- src test docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11B S27: a train's line shows its way on the map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/domain/party/train.ts b/src/domain/party/train.ts
index db4c737076b1ed0618ea8ae8ffa503ae573940c2..25ca7ae223708907185693c7fb0fb7fec3fea534 100644
--- a/src/domain/party/train.ts
+++ b/src/domain/party/train.ts
@@ -239,9 +239,10 @@ export function routeAhead(party: TrainParty): RouteAhead {
 
 /**
  * What the train does at the end of its route as far as it can: a route of fewer than two stops
- * finishes in every mode, since there is nowhere to go round or back to.
+ * finishes in every mode, since there is nowhere to go round or back to. The live map draws a
+ * train's line by it (`MapTrain.atEnd`, plan 8M-11B).
  */
-function endMode(party: TrainParty): TrainAtEnd {
+export function endMode(party: TrainParty): TrainAtEnd {
   return party.train.route.length < 2 ? 'finish' : party.train.atEnd;
 }
 
diff --git a/src/domain/web/party-data.ts b/src/domain/web/party-data.ts
index ce3d5857a0c06323f2d4cc17b7c45671989bea89..9591f88690cca12f930db4f32050268c5c1cbab0 100644
--- a/src/domain/web/party-data.ts
+++ b/src/domain/web/party-data.ts
@@ -285,6 +285,12 @@ export interface MapTrain {
   spots: MapTrainSpot[];
   /** The index in `route` of the stop the train is at; null without a route or once finished. */
   stop: number | null;
+  /**
+   * What it does at the last stop (plan 8M-11B, S27), as the domain applies it (`endMode`): a
+   * route of fewer than two stops finishes whatever its mode. A turn-back train's route is stored
+   * in its travel order, reversed when it turns, so the line's arrows follow `route` as it is.
+   */
+  atEnd: MapAtEnd;
   /**
    * What lies ahead, as the post's small print says it (plan 8M-8C, R3: `aheadText`, the turning
    * and looping words the server's), for the map's Route; null where the post says nothing.
diff --git a/src/domain/web/party-view.test.ts b/src/domain/web/party-view.test.ts
index ce0b46227f9ef5a04b4d80c14de19f9071258a03..60cc08a4fe3e417224759fce757bf9ae404cca6a 100644
--- a/src/domain/web/party-view.test.ts
+++ b/src/domain/web/party-view.test.ts
@@ -379,6 +379,22 @@ describe('partyView', () => {
     expect(partyView(input([train])).trains[0]?.spots).toEqual([]);
   });
 
+  // Plan 8M-11B (S27): the line's arrows and loop follow what the train does at its end, as the
+  // domain decides it (`endMode`): a route under two stops finishes whatever its mode.
+  it("gives a train's end mode as the domain applies it: a route under two stops finishes", () => {
+    const withMode = (atEnd: TrainParty['train']['atEnd'], route: number[]) =>
+      posted({
+        ...testTrain(),
+        train: { ...testTrain().train, route: stops(...route), stop: 0, atEnd },
+      });
+    const atEnd = (party: TrainParty) => partyView(input([party])).trains[0]?.atEnd;
+    expect(atEnd(withMode('loop', [1, 2, 3]))).toBe('loop');
+    expect(atEnd(withMode('turn-back', [1, 2]))).toBe('turn-back');
+    expect(atEnd(withMode('finish', [1, 2, 3]))).toBe('finish');
+    expect(atEnd(withMode('loop', [1]))).toBe('finish');
+    expect(atEnd(withMode('turn-back', []))).toBe('finish');
+  });
+
   it('shows a train with its route, the stop it is at, and a meetup with its times', () => {
     const train = posted(
       {
@@ -410,6 +426,7 @@ describe('partyView', () => {
         route: ['1', '2', '3'],
         spots: [],
         stop: 1,
+        atEnd: 'finish',
         // What lies ahead is the caller's words (plan 8M-8C): none given here.
         ahead: null,
         link: `https://discord.com/channels/${GUILD}/700000000000000002`,
diff --git a/src/domain/web/party-view.ts b/src/domain/web/party-view.ts
index d8bdd549fb3f36b054c61903c53519b1e487e6f2..ac128003e5b28f9c7d706a3e18b4ebb794908b1b 100644
--- a/src/domain/web/party-view.ts
+++ b/src/domain/web/party-view.ts
@@ -21,7 +21,7 @@ import {
 import { raidStage } from '../party/raid.js';
 import { PartyStatus } from '../party/status.js';
 import { timedOver } from '../party/timed.js';
-import { mayNotArrange, mayNotClear, mayNotLoad, mayNotMove } from '../party/train.js';
+import { endMode, mayNotArrange, mayNotClear, mayNotLoad, mayNotMove } from '../party/train.js';
 import { maxBossTitle, maxTierLabel } from '../pogo/max-tier.js';
 import { raidTierGroup, raidWords } from '../pogo/raid-tier.js';
 import type {
@@ -429,6 +429,7 @@ function trainOf(party: TrainParty, link: string, input: PartyViewInput): MapTra
       return spot ? [{ key: stopKey(ref), ...spot }] : [];
     }),
     stop: stop < route.length ? stop : null,
+    atEnd: endMode(party),
     ahead: input.trainAhead?.(party) ?? null,
     link,
     attendance: attendanceOf(party, input, false),
diff --git a/src/web/client/parties.test.ts b/src/web/client/parties.test.ts
index d6db11f12b1c3f92c35ad94fe7b508622ea30610..dd061776d4de1269af125f7ab5745474bd194ea0 100644
--- a/src/web/client/parties.test.ts
+++ b/src/web/client/parties.test.ts
@@ -561,6 +561,7 @@ describe('trainPopup and meetupItem', () => {
       route: ['1', '2', '3'],
       spots: [],
       stop: 1,
+      atEnd: 'finish',
       ahead: null,
       link: LINK,
       attendance: attendance({ actions: [] }),
diff --git a/src/web/client/party-layer-draw.isolated.test.ts b/src/web/client/party-layer-draw.isolated.test.ts
index 7b5109a404b072e394e6d3ea51b06b69b374712c..4d320e8d14ccd509037f430eeada948b624f56e1 100644
--- a/src/web/client/party-layer-draw.isolated.test.ts
+++ b/src/web/client/party-layer-draw.isolated.test.ts
@@ -70,7 +70,15 @@ const fake = vi.hoisted(() => {
       return { getLatLng: () => this.at };
     }
     /** The popup bound, the one Leaflet names in the map's events. */
-    readonly popup = { getElement: () => undefined };
+    /** How many times its popup was drawn anew in place (a post that came, plan 8M-11B R1). */
+    updates = 0;
+    readonly popup = {
+      getElement: () => undefined,
+      options: { autoPan: true },
+      update: () => {
+        this.updates += 1;
+      },
+    };
     /**
      * As Leaflet's: a layer that is not on the map opens no popup; the map is told first, then
      * the layer (`OpenPopup`), as when it closes.
@@ -93,7 +101,7 @@ const fake = vi.hoisted(() => {
     }
     /** Into a group, or onto the map itself (step 2's pin). */
     addTo(group: Group | object) {
-      if (group instanceof Group) group.add(this);
+      if (group instanceof Group || group instanceof FeatureGroup) group.add(this);
       return this;
     }
     remove() {
@@ -114,6 +122,20 @@ const fake = vi.hoisted(() => {
     }
   }
   class Marker extends Layer {}
+  /**
+   * A feature group (a train's line, plan 8M-11B R1): a layer of its own, bound to a popup, that
+   * holds the line's pieces.
+   */
+  class FeatureGroup extends Layer {
+    layers: Layer[] = [];
+    add(layer: Layer) {
+      layer.group = this as unknown as Group;
+      this.layers.push(layer);
+    }
+    getLayers() {
+      return this.layers;
+    }
+  }
   class Path extends Layer {}
   class CircleMarker extends Path {}
 
@@ -147,9 +169,11 @@ const fake = vi.hoisted(() => {
   const shown: {
     markers: Marker[];
     circles: CircleMarker[];
+    /** The lines drawn (a train's, plan 8M-11B). */
+    lines: Path[];
     popupOf: Layer | undefined;
     map: { fire(type: string, event: unknown): void } | undefined;
-  } = { markers: [], circles: [], popupOf: undefined, map: undefined };
+  } = { markers: [], circles: [], lines: [], popupOf: undefined, map: undefined };
 
   /** The phone card (plan 8M-8A) as the party layer uses it: which party it shows. */
   class Card {
@@ -191,7 +215,12 @@ const fake = vi.hoisted(() => {
   const renders: Array<() => void> = [];
 
   /** The list of what is on as the party layer made it: whether it is told the parties are known. */
-  const list: { partiesKnown?: (() => boolean) | undefined } = {};
+  const list: {
+    partiesKnown?: (() => boolean) | undefined;
+    /** The lines of the list drawn anew (a post that came), and who waits for the next. */
+    redrawn: string[];
+    waiting: Array<() => void>;
+  } = { redrawn: [], waiting: [] };
 
   return {
     Layer,
@@ -199,6 +228,7 @@ const fake = vi.hoisted(() => {
     Path,
     CircleMarker,
     Group,
+    FeatureGroup,
     shown,
     Card,
     card,
@@ -224,9 +254,14 @@ vi.mock('leaflet', () => ({
     fake.shown.circles.push(made);
     return made;
   },
-  polyline: (at: unknown, options: Record<string, unknown>) => new fake.Path(at, options),
+  polyline: (at: unknown, options: Record<string, unknown>) => {
+    const made = new fake.Path(at, options);
+    fake.shown.lines.push(made);
+    return made;
+  },
   divIcon: (options: Record<string, unknown>) => ({ options }),
   layerGroup: () => new fake.Group(),
+  featureGroup: () => new fake.FeatureGroup(undefined),
   svg: (options: Record<string, unknown>) => ({ options }),
   latLng: (lat: number, lng: number) => ({ lat, lng }),
   popup: () => {
@@ -275,7 +310,10 @@ vi.mock('./list-ui.js', async (importOriginal) => {
       render() {
         for (const done of fake.renders.splice(0)) done();
       }
-      redrawLine() {}
+      redrawLine(key: string) {
+        fake.list.redrawn.push(key);
+        for (const done of fake.list.waiting.splice(0)) done();
+      }
     },
   };
 });
@@ -644,6 +682,8 @@ async function started(options: {
   research?: ResearchOptionsView;
   /** A research report sent is never answered. */
   sendsForever?: boolean;
+  /** The posts `…/post` answers, by party id (none without it: 404). */
+  posts?: Record<string, unknown>;
   /** The map's zoom (16, where the PokéStops are drawn from, without it). */
   zoom?: number;
   /** Whether the live map is in use (plan 8M-10); the page's visibility alone without it. */
@@ -656,11 +696,13 @@ async function started(options: {
   page.visibility = 'hidden';
   fake.shown.markers = [];
   fake.shown.circles = [];
+  fake.shown.lines = [];
   fake.shown.popupOf = undefined;
   fake.card.wanted = options.phone ?? false;
   fake.route.on = false;
   fake.route.taken = [];
   fake.placeList.splice(0);
+  fake.list.redrawn = [];
   const body = new PageElement('body');
   vi.stubGlobal('HTMLElement', PageElement);
   vi.stubGlobal('HTMLButtonElement', PageElement);
@@ -711,6 +753,11 @@ async function started(options: {
   let partiesHeld: Promise<void> | undefined;
   vi.stubGlobal('fetch', (url: string) => {
     asked.push(url);
+    const post = /\/api\/parties\/([^/]+)\/post\?/u.exec(url);
+    const posted = post ? options.posts?.[post[1] ?? ''] : undefined;
+    if (posted !== undefined) {
+      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(posted) });
+    }
     if (url.endsWith('/api/parties')) {
       if (options.partiesDown === true) {
         return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('') });
@@ -740,6 +787,10 @@ async function started(options: {
   const flights: Array<[number, number]> = [];
   /** The zoom of each flight. */
   const flightZooms: number[] = [];
+  /** Pixels per degree on the screen: far apart unless a test zooms out (`zoomedTo`). */
+  let scale = 10_000;
+  /** The map's zoom, which `zoomedTo` may change. */
+  let zoom = options.zoom ?? 16;
   const map = {
     on(type: string, handler: (event: unknown) => void) {
       handlers.set(type, [...(handlers.get(type) ?? []), handler]);
@@ -753,7 +804,7 @@ async function started(options: {
       for (const handler of handlers.get(type) ?? []) handler(event);
     },
     createPane: () => ({ style: {} }),
-    getZoom: () => options.zoom ?? 16,
+    getZoom: () => zoom,
     getSize: () => ({ x: 1200, y: 800 }),
     getBounds: () => ({
       contains: (at: [number, number] | { lat: number; lng: number }) =>
@@ -764,8 +815,8 @@ async function started(options: {
     // Far apart on the screen: no two things share a place.
     latLngToContainerPoint: (at: { lat: number; lng: number } | [number, number]) =>
       Array.isArray(at)
-        ? { x: at[1] * 10_000, y: at[0] * 10_000 }
-        : { x: at.lng * 10_000, y: at.lat * 10_000 },
+        ? { x: at[1] * scale, y: -at[0] * scale }
+        : { x: at.lng * scale, y: -at.lat * scale },
     closePopup: () => {
       fake.shown.popupOf?.closePopup();
     },
@@ -863,6 +914,12 @@ async function started(options: {
     fire: (type: string, event: unknown) => {
       map.fire(type, event);
     },
+    /** The map zoomed so that a degree is `pixels` on the screen, its size of markers the same. */
+    zoomedTo: (pixels: number, to = zoom) => {
+      scale = pixels;
+      zoom = to;
+      map.fire('zoomend', {});
+    },
     panel: page.byId.get('parties') ?? new PageElement('missing'),
     raidForms: fake.forms.raid as RaidUiDeps,
     maxForms: fake.forms.max as MaxUiDeps,
@@ -1017,6 +1074,7 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
     route: ['1', 'wspot-1'],
     spots: [{ key: 'wspot-1', name: 'Lake Gazebo', lat: 40.45, lon: -79.94 }],
     stop,
+    atEnd: 'finish',
     ahead: null,
     link: 'https://discord.com/channels/1/2/5',
     attendance: attendance(),
@@ -1082,6 +1140,134 @@ describe('a battle at a Power Spot and one at a pin on the map', () => {
     expect(ringAt(40.45)).toBe(ringAt(40.441));
     expect(ringAt(40.45)).toBeLessThan(atGym as number);
   });
+
+  // Plan 8M-11B (S27): a train's line says where it goes and where it has been.
+  describe("a train's line", () => {
+    /** The arrowheads drawn now (those of the draws before are gone with their group). */
+    const arrows = () =>
+      fake.shown.markers.filter(
+        (marker) =>
+          marker.group?.layers.includes(marker) === true &&
+          (marker.options.icon as { options: { className?: string } } | undefined)?.options
+            .className === 'train-arrow',
+      );
+    /** Whether a layer is drawn now: in its group, and that group in its own, up to a layer's. */
+    const drawnNow = (layer: InstanceType<typeof fake.Layer>): boolean => {
+      const { group } = layer;
+      if (group?.layers.includes(layer) !== true) return false;
+      return group instanceof fake.FeatureGroup ? drawnNow(group) : true;
+    };
+    /** The lines drawn now, by their points, opacity and dashes. */
+    const lines = () =>
+      fake.shown.lines
+        .filter((line) => drawnNow(line))
+        .map((line) => ({
+          points: (line.at as Array<{ lat: number; lng: number }>).length,
+          opacity: line.options.opacity,
+          dashed: line.options.dashArray !== undefined,
+        }));
+    /** A loop of three stops: the Library, Lake Gazebo, the Fountain. */
+    const loop = (stop: number | null): MapTrain => ({
+      ...trainAt('t1', 0),
+      route: ['1', 'wspot-1', 'wspot-2'],
+      spots: [
+        { key: 'wspot-1', name: 'Lake Gazebo', lat: 40.45, lon: -79.94 },
+        { key: 'wspot-2', name: 'Fountain', lat: 40.43, lon: -79.93 },
+      ],
+      stop,
+      atEnd: 'loop',
+    });
+
+    it('draws the legs done faint, those ahead as before, each with an arrowhead turned along it', async () => {
+      await started({ raids: false, parties: view({ trains: [trainAt('t1', 0)] }) });
+      expect(lines()).toEqual([{ points: 2, opacity: 0.8, dashed: false }]);
+      // Library to Lake Gazebo: north-east on the screen.
+      expect(arrows()).toHaveLength(1);
+      const at = arrows()[0]?.getLatLng();
+      expect(at?.lat).toBeCloseTo(40.4455, 9);
+      expect(at?.lng).toBeCloseTo(-79.945, 9);
+      await started({ raids: false, parties: view({ trains: [trainAt('t1', 1)] }) });
+      expect(lines()).toEqual([{ points: 2, opacity: 0.35, dashed: false }]);
+      expect(arrows()).toEqual([]);
+    });
+
+    it('closes a loop with a dashed leg and its arrowhead; a finished one is all faint', async () => {
+      await started({ raids: false, parties: view({ trains: [loop(1)] }) });
+      expect(lines()).toEqual([
+        { points: 2, opacity: 0.35, dashed: false },
+        { points: 2, opacity: 0.8, dashed: false },
+        { points: 2, opacity: 0.8, dashed: true },
+      ]);
+      expect(arrows()).toHaveLength(2);
+      await started({ raids: false, parties: view({ trains: [loop(null)] }) });
+      expect(lines()).toEqual([{ points: 3, opacity: 0.35, dashed: false }]);
+      expect(arrows()).toEqual([]);
+    });
+
+    // Review R1 of 8M-11B: one popup per train's line, under the key the post's rules know.
+    describe('opened from its faint leg', () => {
+      /** The layer whose popup a click on `line` opens: its own, or its group's. */
+      const popupLayer = (line: InstanceType<typeof fake.Layer>) =>
+        line.bound ? line : (line.group as unknown as InstanceType<typeof fake.Layer>);
+      /** The faint leg of the train drawn now. */
+      const faintLeg = () => {
+        const leg = fake.shown.lines.find(
+          (line) => drawnNow(line) && line.options.opacity === 0.35,
+        );
+        if (!leg) throw new Error('no faint leg drawn');
+        return leg;
+      };
+      const posted = (stop: number) => ({ ...loop(stop), postKey: 'p1' });
+
+      it("is drawn anew when the train's post comes", async () => {
+        await started({
+          raids: false,
+          parties: view({ trains: [posted(1)] }),
+          posts: { t1: { key: 'p1' } },
+        });
+        const layer = popupLayer(faintLeg());
+        const redrawn = new Promise<void>((resolve) => {
+          fake.list.waiting.push(resolve);
+        });
+        // The pointer on it asks for the post ahead; the popup opens meanwhile.
+        layer.fire('mousedown');
+        layer.openPopup();
+        await redrawn;
+        expect(fake.list.redrawn).toContain('train:t1');
+        expect(layer.updates).toBe(1);
+      });
+
+      it('stays open when a move takes the faint leg away', async () => {
+        const { poll } = await started({ raids: false, parties: view({ trains: [posted(1)] }) });
+        popupLayer(faintLeg()).openPopup();
+        // Previous: back at the first stop, nothing done.
+        await poll(view({ trains: [posted(0)] }));
+        const open = fake.shown.popupOf;
+        expect(open !== undefined && drawnNow(open)).toBe(true);
+      });
+    });
+
+    // Review R2 of 8M-11B: the arrowheads follow every zoom, also while a form holds the parties.
+    it('draws the arrowheads for the new zoom while a form holds the parties', async () => {
+      const shown = await started({ raids: false, parties: view({ trains: [loop(0)] }) });
+      const claim = shown.raidForms.hold.take(false);
+      if (!claim || !shown.raidForms.hold.ready(claim, true)) throw new Error('no form opened');
+      // To zoom 13 (another size of markers: the parties wait for the form), far out.
+      shown.zoomedTo(1_000, 13);
+      expect(arrows()).toEqual([]);
+      shown.raidForms.hold.release(claim);
+    });
+
+    it('draws the arrowheads anew at each zoom: none on legs too short on the screen', async () => {
+      const shown = await started({ raids: false, parties: view({ trains: [loop(0)] }) });
+      expect(arrows()).toHaveLength(3);
+      // Zoomed out: a hundredth of a degree is 10 pixels, every leg under the 40 an arrowhead needs.
+      shown.zoomedTo(1_000);
+      expect(arrows()).toEqual([]);
+      shown.zoomedTo(10_000);
+      expect(arrows()).toHaveLength(3);
+    });
+  });
 });
 
 // Review B7b: the mirror of B7, a raid dimmed while a max battle's step 2 picks Power Spots.
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index 62f70fc6aa1cdc525ddd56db94760ff74d7f3f6f..d07b3a76d3074db3badd262b7e1933af6ab1c99d 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -44,6 +44,7 @@ import {
   trainActions,
 } from './train-forms.js';
 import { trainUi } from './train-ui.js';
+import { ARROW_PIXELS, arrowElement, legArrows, trainLegs, type TrainLeg } from './train-line.js';
 import { onThemeChange, theme } from './theme.js';
 import type { LayerRegistry } from './layer-registry.js';
 import { PLACES_FROM, placesWanted } from './cluster.js';
@@ -1145,7 +1146,38 @@ export function showParties(
   let drawnSize: MarkerSize | undefined;
   map.on('zoomend', () => {
     if (markerSize(map.getZoom()) !== drawnSize) redrawParties();
+    // The arrowheads follow every zoom, also while a form holds the parties (review R2).
+    drawArrows();
   });
+  /** The legs of each train drawn (plan 8M-11B, S27), whose arrowheads follow the zoom. */
+  let trainLines: TrainLeg[][] = [];
+  /** The arrowheads of the trains drawn, in the trains' layer, under the markers. */
+  const trainArrows = L.layerGroup();
+  /**
+   * The arrowheads of the trains' legs ahead as the map is zoomed now (`legArrows`): drawn anew at
+   * every draw of the parties and every zoom, none on a leg too short on the screen.
+   */
+  const drawArrows = (): void => {
+    trainArrows.clearLayers();
+    const project = (place: { lat: number; lon: number }) =>
+      map.latLngToContainerPoint([place.lat, place.lon]);
+    const colour = theme().colours.train;
+    for (const legs of trainLines) {
+      for (const arrow of legArrows(legs, project)) {
+        L.marker([arrow.lat, arrow.lon], {
+          icon: L.divIcon({
+            html: arrowElement(document, colour, arrow.angle),
+            className: 'train-arrow',
+            iconSize: [ARROW_PIXELS, ARROW_PIXELS],
+          }),
+          interactive: false,
+          keyboard: false,
+          // Over the line, under the parties' markers.
+          pane: 'overlayPane',
+        }).addTo(trainArrows);
+      }
+    }
+  };
   const toPixel = (place: { lat: number; lon: number }) =>
     map.latLngToContainerPoint([place.lat, place.lon]);
   const shownThings = () => placed.filter((thing) => layerShown(thing.layer));
@@ -1446,26 +1478,57 @@ export function showParties(
         ...(gym ? { place: { key: `gym:${String(gym.id)}`, name: gym.name } } : {}),
       });
     }
+    trainLines = [];
+    trainArrows.clearLayers();
+    trainArrows.addTo(groups.trains);
     for (const train of drawn.trains) {
       // Through its gyms and the power spots its data gives (plan 8X-4).
-      const { line, ring } = trainPlaces(train, gyms);
+      const { ring } = trainPlaces(train, gyms);
       const popup = () =>
         partyPopup(train, () => trainPopup(train, context(), trainActions(train)));
-      if (line.length > 1) {
-        withPopup(
-          L.polyline(
-            line.map((place) => L.latLng(place.lat, place.lon)),
-            {
-              color: theme().colours.train,
-              weight: 4,
-              opacity: 0.8,
-              interactive,
-            },
+      // Its way (plan 8M-11B, S27): the legs done faint, those ahead as before, a loop's closing
+      // leg dashed, all in one group with one popup under the key `route:<id>` (review R1: the
+      // post's rules, `showsParty`, know it, and a piece gone after a move takes no popup with
+      // it); the arrowheads ahead drawn for the zoom (`drawArrows`).
+      const legs = trainLegs(train, gyms);
+      const { colours, opacities } = theme();
+      const line = L.featureGroup();
+      const pieces = [
+        { legs: legs.filter((leg) => leg.done), faint: true },
+        { legs: legs.filter((leg) => !leg.done && !leg.closing), faint: false },
+      ];
+      for (const piece of pieces) {
+        const [first] = piece.legs;
+        if (!first) continue;
+        L.polyline(
+          [first.from, ...piece.legs.map((leg) => leg.to)].map((place) =>
+            L.latLng(place.lat, place.lon),
           ),
-          `route:${train.id}`,
-          popup,
-        ).addTo(groups.trains);
+          {
+            color: colours.train,
+            weight: 4,
+            opacity: piece.faint ? opacities.trainDone : opacities.trainAhead,
+            interactive,
+          },
+        ).addTo(line);
+      }
+      const closing = legs.find((leg) => leg.closing);
+      if (closing) {
+        L.polyline(
+          [L.latLng(closing.from.lat, closing.from.lon), L.latLng(closing.to.lat, closing.to.lon)],
+          {
+            color: colours.train,
+            weight: 4,
+            opacity: opacities.trainAhead,
+            dashArray: '8 8',
+            interactive,
+          },
+        ).addTo(line);
+      }
+      if (line.getLayers().length > 0) {
+        withPopup(line, `route:${train.id}`, popup).addTo(groups.trains);
       }
+      trainLines.push(legs);
       // A ring around the stop it is at (or its first stop before it starts): a gym's own marker
       // inside it stays a marker to click (plan 8S-4).
       if (ring) {
@@ -1505,6 +1568,7 @@ export function showParties(
         });
       }
     }
+    drawArrows();
     // The reports at stops (plan 8M-9B): a marker per stop with reports of the layers on, its
     // popup bound as a party's (the card, the held content), the stop whose popup or card is open
     // kept with its ended reports (B14).
diff --git a/src/web/client/post-draw.test.ts b/src/web/client/post-draw.test.ts
index 7fedd3d5a0c46867b01fd50de3803e6ebe318104..35eaa1dbdd2809364ef55cc94740d3b467e06ff2 100644
--- a/src/web/client/post-draw.test.ts
+++ b/src/web/client/post-draw.test.ts
@@ -610,6 +610,7 @@ describe('postPopup: the post, the member’s own part and the map’s line', ()
       route: ['1', '2', '3', '4'],
       spots: [],
       stop: 1,
+      atEnd: 'finish',
       ahead: 'Next: 3. Gym 3 · 4. Gym 4, the last stop',
       link: LINK,
       attendance: attendance({ mine: { status: 'coming', group: 'A' } }),
@@ -714,6 +715,7 @@ describe('the review’s fixes (8M-8A fix round 1)', () => {
     route: ['1', '2'],
     spots: [],
     stop: 0,
+    atEnd: 'finish',
     ahead: null,
     link: LINK,
     attendance: attendance(),
diff --git a/src/web/client/theme.css b/src/web/client/theme.css
index e20804a81044f19e98799ca96ca7dd1b6eed2a70..09747c49fc1e81fab46a62cdb25b0d4b06fcdf9f 100644
--- a/src/web/client/theme.css
+++ b/src/web/client/theme.css
@@ -19,6 +19,9 @@
   --raid-full: 44px;
   --raid-middle: 30px;
   --raid-small: 20px;
+  /* A train's line (8M-11B, S27): the legs ahead, and the legs it has done, fainter (0 to 1). */
+  --train-ahead: 0.8;
+  --train-done: 0.35;
   /* The map's side pane (the list, forms), the region editor's panel and its Fix box (8M-10). */
   --panel-width: 340px;
   --editor-panel-width: 360px;
@@ -168,6 +171,8 @@
     --raid-full: 44px;
     --raid-middle: 30px;
     --raid-small: 20px;
+    --train-ahead: 0.8;
+    --train-done: 0.35;
     --panel-width: 340px;
     --editor-panel-width: 360px;
     --fix-box-width: 340px;
diff --git a/src/web/client/theme.test.ts b/src/web/client/theme.test.ts
index 17e023aa3fae5799e1a200abec0610170965ae4a..8dd28e2e4d1221140d58bef2daeb11a594f4c220 100644
--- a/src/web/client/theme.test.ts
+++ b/src/web/client/theme.test.ts
@@ -4,6 +4,7 @@ import {
   MISSING_COLOUR,
   readTheme,
   REGION_PALETTE,
+  DRAWN_OPACITIES,
   DRAWN_SIZES,
   ThemeWatch,
   type SchemeQuery,
@@ -64,7 +65,12 @@ describe('readTheme', () => {
     expect(theme.colours.train).toBe('value of --train');
     expect(theme.palette).toEqual(REGION_PALETTE.map((property) => `value of ${property}`));
     expect(asked.sort()).toEqual(
-      [...Object.values(DRAWN_COLOURS), ...REGION_PALETTE, ...Object.values(DRAWN_SIZES)].sort(),
+      [
+        ...Object.values(DRAWN_COLOURS),
+        ...REGION_PALETTE,
+        ...Object.values(DRAWN_SIZES),
+        ...Object.values(DRAWN_OPACITIES),
+      ].sort(),
     );
   });
 
@@ -81,3 +87,12 @@ describe('the sizes of a raid marker (Matt, 2026-10-25)', () => {
     expect(theme.sizes).toEqual({ raidFull: 44, raidMiddle: 32, raidSmall: 20 });
   });
 });
+
+describe("the opacities of a train's line (plan 8M-11B, S27)", () => {
+  it('are read from theme.css, the usual ones where it lacks them or they are out of range', () => {
+    const theme = readTheme((property) => (property === '--train-done' ? ' 0.3 ' : ''));
+    expect(theme.opacities).toEqual({ trainAhead: 0.8, trainDone: 0.3 });
+    const wrong = readTheme((property) => (property === '--train-ahead' ? '2' : ''));
+    expect(wrong.opacities).toEqual({ trainAhead: 0.8, trainDone: 0.35 });
+  });
+});
diff --git a/src/web/client/theme.ts b/src/web/client/theme.ts
index b027fa855b7b63ae68d48509693eae97e5e41acb..e5d1bfac2550427b7b680da30ce8fdd7a696ad98 100644
--- a/src/web/client/theme.ts
+++ b/src/web/client/theme.ts
@@ -77,11 +77,27 @@ const SIZE_DEFAULTS: Readonly<Record<keyof typeof DRAWN_SIZES, number>> = {
   raidSmall: 20,
 };
 
+/**
+ * The opacities the page draws a train's line with (plan 8M-11B, S27): the legs ahead, and the
+ * legs it has done, fainter; by their custom properties of `theme.css`, from 0 to 1.
+ */
+export const DRAWN_OPACITIES = {
+  trainAhead: '--train-ahead',
+  trainDone: '--train-done',
+} as const;
+
+/** What an opacity the stylesheet lacks (or gives out of range) gives. */
+const OPACITY_DEFAULTS: Readonly<Record<keyof typeof DRAWN_OPACITIES, number>> = {
+  trainAhead: 0.8,
+  trainDone: 0.35,
+};
+
 export interface Theme {
   colours: Readonly<Record<DrawnColour, string>>;
   /** Never empty. */
   palette: readonly string[];
   sizes: Readonly<Record<keyof typeof DRAWN_SIZES, number>>;
+  opacities: Readonly<Record<keyof typeof DRAWN_OPACITIES, number>>;
 }
 
 /** What a property the stylesheet lacks gives: grey, so that what is drawn still shows. */
@@ -99,7 +115,15 @@ export function readTheme(read: (property: string) => string): Theme {
       return [name, Number.isFinite(px) ? px : SIZE_DEFAULTS[name as keyof typeof DRAWN_SIZES]];
     }),
   ) as Record<keyof typeof DRAWN_SIZES, number>;
-  return { colours, palette: REGION_PALETTE.map(value), sizes };
+  const opacities = Object.fromEntries(
+    Object.entries(DRAWN_OPACITIES).map(([name, property]) => {
+      const text = read(property).trim();
+      const opacity = text === '' ? Number.NaN : Number(text);
+      const usual = OPACITY_DEFAULTS[name as keyof typeof DRAWN_OPACITIES];
+      return [name, opacity >= 0 && opacity <= 1 ? opacity : usual];
+    }),
+  ) as Record<keyof typeof DRAWN_OPACITIES, number>;
+  return { colours, palette: REGION_PALETTE.map(value), sizes, opacities };
 }
 
 /**
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 8c366efcc32e78e484d70406b5bf2ef37b7376ba..5ea6f96cd48477fae3f01a9491579598dcf0aca5 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -56,6 +56,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   route: ['4', '1', '7'],
   spots: [],
   stop: 1,
+  atEnd: 'finish',
   ahead: null,
   link: 'https://discord.com/channels/1/2',
   attendance: {
diff --git a/src/web/client/train-line.test.ts b/src/web/client/train-line.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..0fa93e0364cdf03873e27c23da3c23e9ff1f3521
--- /dev/null
+++ b/src/web/client/train-line.test.ts
@@ -0,0 +1,126 @@
+import { describe, expect, it } from 'vitest';
+import type { MapAtEnd } from '../../domain/web/party-data.js';
+import { ARROW_MIN_PIXELS, legArrows, trainLegs, type TrainLeg } from './train-line.js';
+
+/** Stops on a line going east, a hundredth of a degree apart, by their gym ids. */
+const GYMS = new Map([
+  [1, { lat: 40, lon: -80 }],
+  [2, { lat: 40, lon: -79.99 }],
+  [3, { lat: 40, lon: -79.98 }],
+  [4, { lat: 40, lon: -79.97 }],
+]);
+const SPOT = { key: 'wabc.16', name: 'Lake Gazebo', lat: 40.01, lon: -79.98 };
+
+const train = (route: string[], stop: number | null, atEnd: MapAtEnd = 'finish') => ({
+  route,
+  stop,
+  atEnd,
+  spots: [SPOT],
+});
+
+/** A leg as the gyms it joins (by longitude), done or ahead, and whether it closes a loop. */
+const legsOf = (legs: TrainLeg[]) =>
+  legs.map((leg) => ({
+    from: leg.from.lon,
+    to: leg.to.lon,
+    done: leg.done,
+    ...(leg.closing ? { closing: true } : {}),
+  }));
+
+describe('trainLegs (plan 8M-11B, S27)', () => {
+  it('draws the legs before the stop the train is at faint, the rest ahead', () => {
+    expect(legsOf(trainLegs(train(['1', '2', '3', '4'], 2), GYMS))).toEqual([
+      { from: -80, to: -79.99, done: true },
+      { from: -79.99, to: -79.98, done: true },
+      { from: -79.98, to: -79.97, done: false },
+    ]);
+    // At its first stop (or before it starts) nothing is done.
+    expect(trainLegs(train(['1', '2', '3'], 0), GYMS).map((leg) => leg.done)).toEqual([
+      false,
+      false,
+    ]);
+  });
+
+  it('draws a finished route all faint, a loop without its closing leg', () => {
+    expect(trainLegs(train(['1', '2', '3'], null), GYMS).map((leg) => leg.done)).toEqual([
+      true,
+      true,
+    ]);
+    expect(trainLegs(train(['1', '2', '3'], null, 'loop'), GYMS)).toHaveLength(2);
+  });
+
+  it('closes a loop with a leg from its last stop back to its first, ahead whatever stop it is at', () => {
+    expect(legsOf(trainLegs(train(['1', '2', '3'], 2, 'loop'), GYMS))).toEqual([
+      { from: -80, to: -79.99, done: true },
+      { from: -79.99, to: -79.98, done: true },
+      { from: -79.98, to: -80, done: false, closing: true },
+    ]);
+  });
+
+  it("follows a turn-back train's route in the order it is stored: once turned, the way back", () => {
+    // The route as stored after the turn at gym 3: reversed, the train at its index 1.
+    expect(legsOf(trainLegs(train(['3', '2', '1'], 1, 'turn-back'), GYMS))).toEqual([
+      { from: -79.98, to: -79.99, done: true },
+      { from: -79.99, to: -80, done: false },
+    ]);
+    // At the last stop before it turns: everything done, nothing more drawn.
+    expect(trainLegs(train(['1', '2', '3'], 2, 'turn-back'), GYMS).every((leg) => leg.done)).toBe(
+      true,
+    );
+  });
+
+  it('goes through the Power Spots it can place, and over the stops it cannot', () => {
+    expect(legsOf(trainLegs(train(['1', SPOT.key, '99', '4'], 2), GYMS))).toEqual([
+      { from: -80, to: -79.98, done: true },
+      // The stop it is at is off the map: the leg that passes it is ahead.
+      { from: -79.98, to: -79.97, done: false },
+    ]);
+    expect(trainLegs(train(['1'], 0), GYMS)).toEqual([]);
+    expect(trainLegs(train(['1', '99'], 0, 'loop'), GYMS)).toEqual([]);
+  });
+});
+
+describe('legArrows (plan 8M-11B, S27)', () => {
+  /** A map where a hundredth of a degree is `pixels` on the screen, north up. */
+  const projection = (pixels: number) => (place: { lat: number; lon: number }) => ({
+    x: place.lon * pixels * 100,
+    y: -place.lat * pixels * 100,
+  });
+
+  it('puts an arrowhead at the middle of each leg ahead, pointing along the travel order', () => {
+    const legs = trainLegs(train(['1', '2', SPOT.key, '4'], 1), GYMS);
+    const arrows = legArrows(legs, projection(100));
+    // Leg 1 to 2 is done: no arrowhead. 2 to the spot goes north-east, the spot to 4 south-east.
+    expect(arrows).toHaveLength(2);
+    const [first, second] = arrows;
+    expect(first?.lat).toBeCloseTo(40.005, 9);
+    expect(first?.lon).toBeCloseTo(-79.985, 9);
+    expect(first?.angle).toBeCloseTo(-45, 6);
+    expect(second?.angle).toBeCloseTo(45, 6);
+  });
+
+  it('points east, south and west as the screen turns (degrees clockwise from east)', () => {
+    const east = legArrows(trainLegs(train(['1', '2'], 0), GYMS), projection(100));
+    expect(east.map((arrow) => Math.round(arrow.angle))).toEqual([0]);
+    const west = legArrows(trainLegs(train(['2', '1'], 0), GYMS), projection(100));
+    expect(Math.abs(Math.round(west[0]?.angle ?? 0))).toBe(180);
+  });
+
+  it(`gives none to a leg shorter on the screen than ${ARROW_MIN_PIXELS} pixels: zoomed out, none`, () => {
+    const legs = trainLegs(train(['1', '2', '3'], 0), GYMS);
+    expect(legArrows(legs, projection(ARROW_MIN_PIXELS + 1))).toHaveLength(2);
+    expect(legArrows(legs, projection(ARROW_MIN_PIXELS - 1))).toEqual([]);
+  });
+
+  it("gives a loop's closing leg its arrowhead, and moves the two of a loop of two stops apart", () => {
+    const three = legArrows(trainLegs(train(['1', '2', '3'], 0, 'loop'), GYMS), projection(100));
+    expect(three).toHaveLength(3);
+    expect(Math.abs(Math.round(three[2]?.angle ?? 0))).toBe(180);
+    // Out and back on one line: each arrowhead two thirds of the way along its leg, not both at
+    // the middle, where they would make a diamond.
+    const two = legArrows(trainLegs(train(['1', '2'], 0, 'loop'), GYMS), projection(100));
+    expect(two.map((arrow) => Math.round(arrow.angle * 1000) / 1000)).toEqual([0, 180]);
+    expect(two[0]?.lon).toBeCloseTo(-80 + 0.01 * (2 / 3), 9);
+    expect(two[1]?.lon).toBeCloseTo(-79.99 - 0.01 * (2 / 3), 9);
+  });
+});
diff --git a/src/web/client/train-line.ts b/src/web/client/train-line.ts
new file mode 100644
index 0000000000000000000000000000000000000000..cf3ff3c7d7cb92cca36469a3f2dbf20d0130a95e
--- /dev/null
+++ b/src/web/client/train-line.ts
@@ -0,0 +1,126 @@
+import type { MapTrain } from '../../domain/web/party-data.js';
+import { stopPlace, type StopPlace } from './parties.js';
+
+/**
+ * A train's line on the live map shows its way (plan 8M-11B, S27): the legs it has done faint,
+ * those ahead as before with an arrowhead at their middle pointing along the travel order, and a
+ * looping train's closing leg, from its last stop back to its first, dashed with its arrowhead.
+ * The order is the route's as stored: a turn-back train's route is reversed when it turns, so
+ * after the turn the arrowheads point back by themselves. Pure; `party-layer.ts` draws it.
+ */
+
+/** A leg of a train's line: from one stop the map can place to the next one it can. */
+export interface TrainLeg {
+  from: StopPlace;
+  to: StopPlace;
+  /** Before the stop the train is at (or every leg once the route is finished): drawn faint. */
+  done: boolean;
+  /** A loop's leg from its last stop back to its first: dashed. */
+  closing: boolean;
+}
+
+/**
+ * The legs of a train's line, in its travel order, through the stops the map can place (a stop
+ * it cannot place is passed over, as the line always did): a leg is done when the stop it leads
+ * to is at or before the train's; a finished route (`stop` null) is done throughout and closes
+ * no loop. A loop that can place two stops or more gets its closing leg, ahead.
+ */
+export function trainLegs(
+  train: Pick<MapTrain, 'route' | 'stop' | 'spots' | 'atEnd'>,
+  gyms: ReadonlyMap<number, StopPlace>,
+): TrainLeg[] {
+  const placed = train.route.flatMap((key, index) => {
+    const place = stopPlace(train, key, gyms);
+    return place ? [{ index, place }] : [];
+  });
+  const finished = train.stop === null;
+  const legs: TrainLeg[] = [];
+  for (let at = 1; at < placed.length; at += 1) {
+    const from = placed[at - 1];
+    const to = placed[at];
+    if (!from || !to) continue;
+    legs.push({
+      from: from.place,
+      to: to.place,
+      done: finished || to.index <= (train.stop ?? 0),
+      closing: false,
+    });
+  }
+  const first = placed[0];
+  const last = placed.at(-1);
+  if (train.atEnd === 'loop' && !finished && first && last && placed.length > 1) {
+    legs.push({ from: last.place, to: first.place, done: false, closing: true });
+  }
+  return legs;
+}
+
+/** A leg ahead shorter than this on the screen, in pixels, gets no arrowhead. */
+export const ARROW_MIN_PIXELS = 40;
+
+/** An arrowhead of a train's line: where it is drawn, and its turn in degrees clockwise from east. */
+export interface LegArrow {
+  lat: number;
+  lon: number;
+  angle: number;
+}
+
+/**
+ * The arrowheads of a train's legs ahead at the map's zoom (`project`: a place to the screen's
+ * pixels, y down), recomputed whenever the zoom changes: one at the middle of each leg ahead at
+ * least `ARROW_MIN_PIXELS` long on the screen, turned along it. A leg whose way back is drawn
+ * ahead too (a loop of two stops) has its arrowhead two thirds of the way along, so that the two
+ * do not meet at the middle.
+ */
+export function legArrows(
+  legs: readonly TrainLeg[],
+  project: (place: StopPlace) => { x: number; y: number },
+): LegArrow[] {
+  const ahead = legs.filter((leg) => !leg.done);
+  return ahead.flatMap((leg) => {
+    const from = project(leg.from);
+    const to = project(leg.to);
+    const dx = to.x - from.x;
+    const dy = to.y - from.y;
+    if (Math.hypot(dx, dy) < ARROW_MIN_PIXELS) return [];
+    const back = ahead.some((other) => other.from === leg.to && other.to === leg.from);
+    const share = back ? 2 / 3 : 1 / 2;
+    return [
+      {
+        lat: leg.from.lat + (leg.to.lat - leg.from.lat) * share,
+        lon: leg.from.lon + (leg.to.lon - leg.from.lon) * share,
+        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
+      },
+    ];
+  });
+}
+
+const SVG = 'http://www.w3.org/2000/svg';
+
+/** The side of an arrowhead's square, in pixels: a triangle over the line's 4. */
+export const ARROW_PIXELS = 16;
+
+/**
+ * An arrowhead as SVG of ours (no markup string: the page's CSP lets no `style` attribute in):
+ * a triangle pointing east in `color` (the theme's train color), turned by `angle` about its
+ * middle.
+ */
+export function arrowElement(document: Document, color: string, angle: number): SVGSVGElement {
+  const svg = document.createElementNS(SVG, 'svg');
+  const size = String(ARROW_PIXELS);
+  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
+  svg.setAttribute('width', size);
+  svg.setAttribute('height', size);
+  svg.setAttribute('aria-hidden', 'true');
+  const middle = ARROW_PIXELS / 2;
+  const triangle = document.createElementNS(SVG, 'polygon');
+  const near = '3';
+  const far = String(ARROW_PIXELS - 3);
+  triangle.setAttribute('points', `${near},${near} ${far},${String(middle)} ${near},${far}`);
+  triangle.setAttribute('fill', color);
+  triangle.setAttribute(
+    'transform',
+    `rotate(${angle.toFixed(1)} ${String(middle)} ${String(middle)})`,
+  );
+  svg.append(triangle);
+  return svg;
+}
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 6c7fcb7f5a0131498220eafabaae6f7ece63249c..9844937b587c9c3e47ba640ce5426949f23348e5 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -263,6 +263,7 @@ const train = (more: Partial<MapTrain> = {}): MapTrain => ({
   route: ['4', '1', '7'],
   spots: [],
   stop: 1,
+  atEnd: 'finish',
   ahead: null,
   link: 'https://discord.com/channels/1/2',
   attendance: {
diff --git a/src/web/client/what-is-on.test.ts b/src/web/client/what-is-on.test.ts
index 3ea5d98e8a194a9312e34e25e00912d3ba90334e..3fa8e590c6f67ffffb0e2f789412e0fff44e87ff 100644
--- a/src/web/client/what-is-on.test.ts
+++ b/src/web/client/what-is-on.test.ts
@@ -99,6 +99,7 @@ const train = (id: string, more: Partial<MapTrain> = {}): MapTrain => ({
   route: ['3', '2'],
   spots: [],
   stop: 0,
+  atEnd: 'finish',
   ahead: null,
   link: 'https://discord.com/channels/1/3',
   attendance: attendance(4, 1),
````

### Task 2: 8M-11B S24 and S25: the drag line and the held map

Prototype commit: `6762a8083ebad8028d3755c61bc9e05005cad9a9`

While a stop is dragged in the route editor the map shows its two new
legs, from the stop it would follow and to the one it would precede
(one at either end), dotted in the train's color on a layer of their
own; dropNeighbors and dropLegs beside dropPosition give them. The row
under the pointer stays marked in the list. While a stop's handle is
held the map's touch zoom and dragging are off (holdMap), and only
those that were on come back when the drag ends; both end with the
drag however it ends (a drop, in place or elsewhere, Escape, the
pointer canceled or its capture lost, an edit begun, route mode ended),
each way a DOM test of train-ui.

**Files:**

```
 src/web/client/party-layer.ts            |  26 ++++++++++++++++++++++++++
 src/web/client/train-forms.test.ts       |  59 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-forms.ts            |  66 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-ui.isolated.test.ts | 104 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/train-ui.ts               |  33 +++++++++++++++++++++++++++++++--
 5 files changed, 286 insertions(+), 2 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/train-forms.test.ts src/web/client/train-ui.isolated.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 6762a8083ebad8028d3755c61bc9e05005cad9a9 -- src test docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11B S24 and S25: the drag line and the held map`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/party-layer.ts b/src/web/client/party-layer.ts
index d07b3a76d3074db3badd262b7e1933af6ab1c99d..595ee9de0b4c605450bc508491188ebd7f97d999 100644
--- a/src/web/client/party-layer.ts
+++ b/src/web/client/party-layer.ts
@@ -38,6 +38,8 @@ import { maxUi, type MapSpot } from './max-ui.js';
 import { reportUi } from './report-ui.js';
 import {
   drawnTrains,
+  dropLegs,
+  holdMap,
   keepTools,
   newTrainButton,
   placedStops,
@@ -1810,6 +1812,8 @@ export function showParties(
   // (Move… and Manage… are forms of the post, plan 8M-8C); held like the raid forms. After a success the list
   // at once, and the train's popup opened.
   const routeLayer = L.layerGroup().addTo(map);
+  /** A dragged stop's new legs (plan 8M-11B, S24), over route mode's line. */
+  const dragLayer = L.layerGroup().addTo(map);
   const trainForms = trainUi({
     answered: (partyId, answer, from) => {
       answered(partyId, answer, from);
@@ -1855,6 +1859,28 @@ export function showParties(
         routeLayer.clearLayers();
       },
     },
+    // A stop dragged in the route editor (plan 8M-11B, S24): its new legs, dotted in the train's
+    // color on a layer of their own over route mode's dashed line.
+    dragLine: {
+      show: (train, from, to) => {
+        dragLayer.clearLayers();
+        for (const leg of dropLegs(train, from, to, gyms)) {
+          L.polyline([L.latLng(leg.from.lat, leg.from.lon), L.latLng(leg.to.lat, leg.to.lon)], {
+            color: theme().colours.train,
+            weight: 5,
+            dashArray: '2 9',
+            lineCap: 'round',
+            interactive: false,
+          }).addTo(dragLayer);
+        }
+      },
+      clear: () => {
+        dragLayer.clearLayers();
+      },
+    },
+    // A stop's handle held (S25): Leaflet counts every finger on the screen, so the map's touch
+    // zoom and dragging are off meanwhile, and back on after only where they were on.
+    holdMap: () => holdMap([map.touchZoom, map.dragging]),
     closePopup: () => {
       map.closePopup();
     },
diff --git a/src/web/client/train-forms.test.ts b/src/web/client/train-forms.test.ts
index 5ea6f96cd48477fae3f01a9491579598dcf0aca5..113d264fde2797a81e242b15cb570ff474d1bb35 100644
--- a/src/web/client/train-forms.test.ts
+++ b/src/web/client/train-forms.test.ts
@@ -6,8 +6,11 @@ import type { MapGym, PageNode } from './popup.js';
 import {
   conductorBody,
   drawnTrains,
+  dropLegs,
+  dropNeighbors,
   dropPosition,
   edgeScroll,
+  holdMap,
   keepTools,
   newTrainButton,
   routeEditBody,
@@ -514,6 +517,62 @@ describe('dragging a stop in the stop list (plan 8M-8C, R6)', () => {
     expect(drag.drop()).toBeUndefined();
   });
 
+  // Plan 8M-11B (S24): the map shows the dragged stop's two new legs.
+  it('names the stops a dragged stop would land between, one at either end', () => {
+    const route = ['4', '1', '7', '2'];
+    // Stop 3 dropped at 1: before everything, then the Library.
+    expect(dropNeighbors(route, 3, 1)).toEqual({ moved: '7', before: undefined, after: '4' });
+    expect(dropNeighbors(route, 1, 3)).toEqual({ moved: '4', before: '7', after: '2' });
+    expect(dropNeighbors(route, 2, 4)).toEqual({ moved: '1', before: '2', after: undefined });
+    // Where it is: its own legs.
+    expect(dropNeighbors(route, 2, 2)).toEqual({ moved: '1', before: '4', after: '7' });
+    expect(dropNeighbors(route, 9, 1)).toBeUndefined();
+  });
+
+  it("draws the dragged stop's new legs between the places the map has, none to a stop it cannot place", () => {
+    const places = new Map([
+      [4, { lat: 40, lon: -80 }],
+      [1, { lat: 40.01, lon: -80 }],
+      [7, { lat: 40.02, lon: -80 }],
+    ]);
+    const shown = train({ route: ['4', '1', '7', '99'] });
+    expect(dropLegs(shown, 3, 2, places)).toEqual([
+      { from: { lat: 40, lon: -80 }, to: { lat: 40.02, lon: -80 } },
+      { from: { lat: 40.02, lon: -80 }, to: { lat: 40.01, lon: -80 } },
+    ]);
+    // Dropped last: after the stop off the map, so no leg; first: one leg, to what follows it.
+    expect(dropLegs(shown, 1, 4, places)).toEqual([]);
+    expect(dropLegs(shown, 3, 1, places)).toEqual([
+      { from: { lat: 40.02, lon: -80 }, to: { lat: 40, lon: -80 } },
+    ]);
+  });
+
+  // Plan 8M-11B (S25): a held stop holds the map.
+  it("turns the map's gestures off while a stop is held, and back on only those that were on", () => {
+    const gesture = (on: boolean) => ({
+      on,
+      enabled() {
+        return this.on;
+      },
+      enable() {
+        this.on = true;
+      },
+      disable() {
+        this.on = false;
+      },
+    });
+    const zoom = gesture(true);
+    const dragging = gesture(false);
+    const release = holdMap([zoom, dragging]);
+    expect([zoom.on, dragging.on]).toEqual([false, false]);
+    release();
+    expect([zoom.on, dragging.on]).toEqual([true, false]);
+    // A second release (the drag ended twice) changes nothing someone else set since.
+    zoom.disable();
+    release();
+    expect(zoom.on).toBe(false);
+  });
+
   // Review C2: a second finger, or a pointer event of another, moves nothing of the drag.
   it('follows only the pointer that began the drag, until the drag ends', () => {
     const drag = new StopDrag();
diff --git a/src/web/client/train-forms.ts b/src/web/client/train-forms.ts
index 0a8799b6a6128f5a7544208f6f84dbd03ad17213..2645239542e21bdfaff01ee74e06724baf58a342 100644
--- a/src/web/client/train-forms.ts
+++ b/src/web/client/train-forms.ts
@@ -610,6 +610,72 @@ export function dropPosition(y: number, rows: readonly DragRow[]): number {
   return over === -1 ? Math.max(1, rows.length) : over + 1;
 }
 
+/**
+ * The stops a stop dragged from position `from` would land between at position `to` (plan
+ * 8M-11B, S24; positions from 1, as `/route move` takes them and `StopDrag`'s drop gives them):
+ * the stop it would follow and the one it would precede, by their keys, none at either end; at
+ * its own position its own neighbors. Undefined for a position the route does not have.
+ */
+export function dropNeighbors(
+  route: readonly string[],
+  from: number,
+  to: number,
+): { moved: string; before: string | undefined; after: string | undefined } | undefined {
+  const moved = route[from - 1];
+  if (moved === undefined || to < 1 || to > route.length) return undefined;
+  const rest = route.filter((_, index) => index !== from - 1);
+  return { moved, before: rest[to - 2], after: rest[to - 1] };
+}
+
+/**
+ * The dragged stop's new legs as the map draws them while it is dragged (S24): from the stop it
+ * would follow to it, and from it to the stop it would precede, each where the map can place both
+ * ends (`stopPlace`); one at either end of the route, none for a stop off the map.
+ */
+export function dropLegs(
+  train: Pick<MapTrain, 'route' | 'spots'>,
+  from: number,
+  to: number,
+  gyms: ReadonlyMap<number, StopPlace>,
+): Array<{ from: StopPlace; to: StopPlace }> {
+  const near = dropNeighbors(train.route, from, to);
+  if (!near) return [];
+  const place = (key: string | undefined) =>
+    key === undefined ? undefined : stopPlace(train, key, gyms);
+  const moved = place(near.moved);
+  if (!moved) return [];
+  const before = place(near.before);
+  const after = place(near.after);
+  return [
+    ...(before ? [{ from: before, to: moved }] : []),
+    ...(after ? [{ from: moved, to: after }] : []),
+  ];
+}
+
+/** A gesture of the map that can be switched off and on (Leaflet's `touchZoom`, `dragging`). */
+export interface MapGesture {
+  enabled(): boolean;
+  enable(): unknown;
+  disable(): unknown;
+}
+
+/**
+ * Holds the map while a stop's handle is held (plan 8M-11B, S25: Leaflet counts every finger on
+ * the screen, so a finger on the map beside the one on the handle pinch-zoomed it): the gestures
+ * that are on are switched off; the function it gives back switches those, and only those, on
+ * again, once.
+ */
+export function holdMap(gestures: readonly MapGesture[]): () => void {
+  const were = gestures.filter((gesture) => gesture.enabled());
+  for (const gesture of were) gesture.disable();
+  let released = false;
+  return () => {
+    if (released) return;
+    released = true;
+    for (const gesture of were) gesture.enable();
+  };
+}
+
 /** How near an edge of the stop list's pane a dragged stop scrolls it, in pixels (`edgeScroll`). */
 const SCROLL_EDGE = 40;
 
diff --git a/src/web/client/train-ui.isolated.test.ts b/src/web/client/train-ui.isolated.test.ts
index 9844937b587c9c3e47ba640ce5426949f23348e5..a1c190fec606686debaac1a977bcfee7807bd2c3 100644
--- a/src/web/client/train-ui.isolated.test.ts
+++ b/src/web/client/train-ui.isolated.test.ts
@@ -380,6 +380,13 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
   const modes: boolean[] = [];
   /** What went into a post's answer line (plan 8M-11A, S9). */
   const answers: { partyId: string; text: string; ok: boolean }[] = [];
+  /**
+   * The dragged stop's new legs on the map (plan 8M-11B, S24): where it would land as each was
+   * shown (`from>to`), `cleared` when they went.
+   */
+  const dragLines: string[] = [];
+  /** The map held while a stop's handle is held (S25): how often held, and whether it is now. */
+  const map = { holds: 0, held: false };
   const ui = trainUi({
     answered: (partyId, answer) => {
       answers.push({ partyId, ...answer });
@@ -410,6 +417,21 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
     routeMode: (on: boolean) => {
       modes.push(on);
     },
+    dragLine: {
+      show: (_train, from, to) => {
+        dragLines.push(`${String(from)}>${String(to)}`);
+      },
+      clear: () => {
+        dragLines.push('cleared');
+      },
+    },
+    holdMap: () => {
+      map.holds += 1;
+      map.held = true;
+      return () => {
+        map.held = false;
+      };
+    },
     redrawn: () => {
       events.push(`list drawn, routing ${ui.routing()?.id ?? 'none'}`);
     },
@@ -440,6 +462,8 @@ function page(answer: (url: string, body: unknown) => Answer | undefined = () =>
     modes,
     keyDown,
     answers,
+    dragLines,
+    map,
   };
 }
 
@@ -677,6 +701,86 @@ describe('route mode (trainUi)', () => {
     expect(shown.sent.at(-1)?.body).toEqual({ drawn: ['4', '1', '7'], from: 3, to: 1 });
   });
 
+  // Plan 8M-11B (S24): the map shows where the dragged stop would land, until the drag ends.
+  it("shows the dragged stop's new legs on the map as the pointer moves, and clears them at the drop", async () => {
+    const { shown, handleOf } = await dragging();
+    const { handle } = handleOf(3);
+    handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
+    handle.dispatch('pointermove', { clientY: 140, pointerId: 1 });
+    handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
+    handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
+    expect(shown.dragLines).toEqual(['3>3', '3>2', '3>1', 'cleared']);
+  });
+
+  // Plan 8M-11B (S25): the map's touch zoom and dragging are off while a stop is held, whatever
+  // ends the drag.
+  describe('holds the map while a stop is held, and lets it go however the drag ends', () => {
+    const ends: Array<
+      [string, (end: Awaited<ReturnType<typeof dragging>>, handle: FakeElement) => void]
+    > = [
+      [
+        'dropped on another row',
+        (_end, handle) => {
+          handle.dispatch('pointermove', { clientY: 110, pointerId: 1 });
+          handle.dispatch('pointerup', { clientY: 110, pointerId: 1 });
+        },
+      ],
+      [
+        'dropped where it was',
+        (_end, handle) => {
+          handle.dispatch('pointerup', { clientY: 175, pointerId: 1 });
+        },
+      ],
+      ['Escape', ({ shown }) => shown.keyDown('Escape')],
+      [
+        'the pointer canceled',
+        (_end, handle) => {
+          handle.dispatch('pointercancel', { pointerId: 1 });
+        },
+      ],
+      [
+        'the pointer capture lost',
+        (_end, handle) => {
+          handle.dispatch('lostpointercapture', { pointerId: 1 });
+        },
+      ],
+      [
+        'an edit begun (a gym tapped)',
+        ({ shown }) => {
+          const riverside = GYMS.get(2);
+          if (!riverside) throw new Error('no Riverside Gazebo');
+          shown.ui.gymClicked(riverside);
+        },
+      ],
+      [
+        'route mode ended',
+        ({ shown }) => {
+          editorOf(shown.tools).querySelector('button[data-cancel]')?.dispatch('click');
+        },
+      ],
+    ];
+    for (const [how, end] of ends) {
+      it(how, async () => {
+        const started = await dragging();
+        const { handle } = started.handleOf(3);
+        handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
+        expect(started.shown.map).toEqual({ holds: 1, held: true });
+        end(started, handle);
+        expect(started.shown.map).toEqual({ holds: 1, held: false });
+        expect(started.shown.dragLines.at(-1)).toBe('cleared');
+      });
+    }
+
+    it('another pointer neither holds the map nor lets it go', async () => {
+      const started = await dragging();
+      const { handle } = started.handleOf(3);
+      handle.dispatch('pointerdown', { clientY: 175, pointerId: 1 });
+      handle.dispatch('pointerup', { clientY: 110, pointerId: 2 });
+      handle.dispatch('pointerdown', { clientY: 145, pointerId: 3 });
+      expect(started.shown.map).toEqual({ holds: 1, held: true });
+    });
+  });
+
   // Plan 8M-8C, R5: a Power Spot of the map's layer is a stop to tap in route mode, as a gym is.
   it('adds a Power Spot tapped in route mode as the next stop, by its key; out of route mode a tap is its own', async () => {
     const shown = page();
diff --git a/src/web/client/train-ui.ts b/src/web/client/train-ui.ts
index caf767d57e33e3e19fbe2b206c0d12c28498d94e..63ce86c3b19eae475084f8e64b7e9670054e8163 100644
--- a/src/web/client/train-ui.ts
+++ b/src/web/client/train-ui.ts
@@ -85,6 +85,18 @@ export interface TrainUiDeps {
    * meanwhile (re-review N1, `RouteFocus`). Left out: nobody is told.
    */
   routeMode?: (on: boolean) => void;
+  /**
+   * A stop dragged in the route editor (plan 8M-11B, S24): its new legs on the map, from the stop
+   * it would follow and to the one it would precede (`dropLegs`) as it would land at `to`, and
+   * none once the drag ends, however it ends. Left out: the map shows nothing of it.
+   */
+  dragLine?: { show(train: MapTrain, from: number, to: number): void; clear(): void };
+  /**
+   * A stop's handle held (S25): the map's touch zoom and dragging off (`holdMap`); the function it
+   * gives back, called when the drag ends however it ends, puts back those that were on. Left
+   * out: the map is not held.
+   */
+  holdMap?: () => () => void;
 }
 
 /** What the page says of a form while another one is open. */
@@ -204,11 +216,15 @@ export function trainUi(deps: TrainUiDeps) {
    */
   const dragsIn = (editor: HTMLElement): void => {
     const rows = (): HTMLElement[] => [...editor.querySelectorAll<HTMLElement>('li')];
+    /** The dragged stop's legs on the map, drawn again only where it would land elsewhere. */
+    let lineTo: ((to: number | undefined) => void) | undefined;
+    let shownTo: number | undefined;
     const mark = (at: number | undefined): void => {
       rows().forEach((row, index) => {
         const others = row.className.split(' ').filter((name) => name !== 'drop-target');
         row.className = [...others, ...(index + 1 === at ? ['drop-target'] : [])].join(' ');
       });
+      lineTo?.(at);
     };
     const boxes = () => rows().map((row) => row.getBoundingClientRect());
     /** The pane the stop list scrolls in (the side pane, docked under the map on a phone). */
@@ -235,11 +251,21 @@ export function trainUi(deps: TrainUiDeps) {
           ? event.target.closest<HTMLElement>('.drag-handle')
           : null;
       if (!handle || !routing || drag.active) return;
-      const { route } = routing.train;
-      if (!drag.begin(Number(handle.dataset.drag), route, edits.busy, event.pointerId)) return;
+      const { train } = routing;
+      const from = Number(handle.dataset.drag);
+      if (!drag.begin(from, train.route, edits.busy, event.pointerId)) return;
       event.preventDefault();
       handle.setPointerCapture(event.pointerId);
       document.addEventListener('keydown', escape);
+      // The map held while the handle is (S25), and the stop's legs drawn where it is (S24).
+      const letGo = deps.holdMap?.();
+      lineTo = (to) => {
+        if (to === undefined || to === shownTo) return;
+        shownTo = to;
+        deps.dragLine?.show(train, from, to);
+      };
+      shownTo = undefined;
+      lineTo(from);
       endDrag = () => {
         endDrag = undefined;
         drag.cancel();
@@ -247,6 +273,9 @@ export function trainUi(deps: TrainUiDeps) {
         document.removeEventListener('keydown', escape);
         if (frame !== undefined) cancelAnimationFrame(frame);
         frame = undefined;
+        lineTo = undefined;
+        deps.dragLine?.clear();
+        letGo?.();
       };
     });
     editor.addEventListener('pointermove', (event) => {
````

### Task 3: 8M-11B S13: fewer, smoother gym clusters

Prototype commit: `1292d09efd354ad9137bb0a8d212898660e95fdc`

A cluster is keyed by its zoom and cell (cluster:<zoom>:<x>:<y>), no
longer by its gyms: planDots leaves what is drawn alone where nothing
changed, changes a cluster's count and place in place where its gyms
changed (a raid hiding one), gives the marker of a cluster no longer
wanted to a new one (a zoom, a pan) and adds or takes off only the rest.
The grid's cell grows as the map zooms out (cellPixels: 60 px from zoom
15, 90 at 13 and 14, 120 at 12 and below; the design's starting values,
kept after the profile).

Profile (a scratch replay of the gyms' layer over the 5,886 gyms of
Pittsburgh's Wayfarer export of 2026-10-16, a 1200 x 800 view centered
downtown with the layer's 50% margin; compute times on the loaded laptop
are upper bounds):

                     before                  after
  drawn at 11/12/13  513 / 715 / 706         171 / 252 / 405
  drawn at 14/15     522 / 271               351 / 271
  zoom 11 -> 12      +693 -491               +90 -9, 162 moved
  zoom 12 -> 13      +685 -694               +181 -28, 224 moved
  zoom 13 -> 14      +476 -660               +117 -171, 228 moved
  zoom 14 -> 15      +187 -438               +195 -275, 53 moved
  poll, no change    +0 -0                   +0 -0
  poll, raid hides   +1 -1 (cluster redrawn) 1 changed in place
  refresh's work     4.9 / 2.2 / 1.5 ms      1.9 / 1.4 / 1.3 ms
  (mean of 50 at zoom 11 / 12 / 13)

The work of a refresh was never the cost (a few milliseconds); the
markers made and destroyed at each zoom step (about 1,200 at 12 and 13)
were.

**Files:**

```
 src/web/client/cluster.ts               |  13 +++++++--
 src/web/client/gym-dots.test.ts         | 101 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++------
 src/web/client/gym-dots.ts              |  66 +++++++++++++++++++++++++++++++++----------
 src/web/client/gyms-ui.isolated.test.ts | 237 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 src/web/client/gyms-ui.ts               |  97 +++++++++++++++++++++++++++++++++++++++++++++++---------------
 5 files changed, 466 insertions(+), 48 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/web/client/gym-dots.test.ts src/web/client/gyms-ui.isolated.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 1292d09efd354ad9137bb0a8d212898660e95fdc -- src test docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11B S13: fewer, smoother gym clusters`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/web/client/cluster.ts b/src/web/client/cluster.ts
index 35286670a2fa45bb249c6d2cdb09ff98b5f16a5e..4e73659845b418d0cd2e05b0249aaaeac6d704c8 100644
--- a/src/web/client/cluster.ts
+++ b/src/web/client/cluster.ts
@@ -11,8 +11,15 @@
 export const CLUSTER_BELOW = 16;
 /** The PokéStops and Power Spots are drawn from this zoom. */
 export const PLACES_FROM = 16;
-/** A cell of the grid, in pixels of the map. */
-export const CELL_PIXELS = 60;
+/**
+ * A cell of the grid at a zoom, in pixels of the map (plan 8M-11B, S13: fewer clusters zoomed out,
+ * where Pittsburgh's gyms made some 700 of them in the view and its margin): 60 from zoom 15, 90
+ * at 13 and 14, 120 at 12 and below.
+ */
+export function cellPixels(zoom: number): number {
+  if (zoom >= 15) return 60;
+  return zoom >= 13 ? 90 : 120;
+}
 const TILE = 256;
 
 export interface Cluster<P> {
@@ -41,7 +48,7 @@ function pixelOf(place: { lat: number; lon: number }, zoom: number): { x: number
 export function clustersAt<P extends { lat: number; lon: number }>(
   points: readonly P[],
   zoom: number,
-  cell = CELL_PIXELS,
+  cell = cellPixels(zoom),
 ): Cluster<P>[] {
   if (zoom >= CLUSTER_BELOW)
     return points.map((point) => ({ points: [point], ...middle([point]) }));
diff --git a/src/web/client/gym-dots.test.ts b/src/web/client/gym-dots.test.ts
index b78ff1eda5149881b728542121b5eaebac076639..56cfe32d532d35e4207a45e30fb41fbb83732d80 100644
--- a/src/web/client/gym-dots.test.ts
+++ b/src/web/client/gym-dots.test.ts
@@ -1,5 +1,6 @@
 import { describe, expect, it } from 'vitest';
-import { dotsDiff, shownGyms, wantedDots } from './gym-dots.js';
+import { cellPixels, clustersAt } from './cluster.js';
+import { planDots, shownGyms, wantedDots, type DrawnDot, type WantedDot } from './gym-dots.js';
 import type { MapGym } from './popup.js';
 
 const gym = (id: number, name: string): MapGym => ({
@@ -50,18 +51,38 @@ describe('the dots and clusters drawn (plan 8M-7, fix round 1)', () => {
     expect([...wanted.keys()].sort()).toEqual(['gym:1', 'gym:2']);
   });
 
-  it('clusters below street level, each cluster keyed by its cell and its places', () => {
+  // Plan 8M-11B (S13): a cluster is its cell, whatever its places, so that a change of them
+  // changes its count and place in place rather than drawing it anew.
+  it('clusters below street level, each cluster keyed by its zoom and its cell alone', () => {
     const a = at(1, 40.445, -79.95);
     const b = at(2, 40.4451, -79.9501);
     const wanted = wantedDots([a, b], 12, VIEW, undefined);
     const [key] = [...wanted.keys()];
     expect(wanted.size).toBe(1);
-    expect(key).toMatch(/^cluster:/u);
+    expect(key).toMatch(/^cluster:12:\d+:\d+$/u);
     const item = wanted.get(key ?? '');
     expect(item?.kind === 'cluster' ? item.points.map((one) => one.id) : []).toEqual([1, 2]);
-    // Another place in the same cell is another cluster: drawn anew.
+    // Another place in the same cell: the same cluster, counting three.
     const more = wantedDots([a, b, at(3, 40.4452, -79.9502)], 12, VIEW, undefined);
-    expect([...more.keys()]).not.toContain(key);
+    expect([...more.keys()]).toEqual([key]);
+    const three = more.get(key ?? '');
+    expect(three?.kind === 'cluster' ? three.points.length : 0).toBe(3);
+    // At another zoom the grid is another: another key.
+    expect([...wantedDots([a, b], 11, VIEW, undefined).keys()]).not.toContain(key);
+  });
+
+  it('makes the cells larger as the map zooms out: fewer clusters', () => {
+    expect([15, 14, 13, 12, 11, 8].map(cellPixels)).toEqual([60, 90, 90, 120, 120, 120]);
+    // A row of 50 gyms about 50 meters apart, across the view: fewer clusters than 60-pixel
+    // cells would make, below zoom 15.
+    const row = Array.from({ length: 50 }, (_, index) =>
+      at(index + 1, 40.445, -79.965 + index * 0.0006),
+    );
+    for (const zoom of [12, 13, 14]) {
+      const drawn = wantedDots(row, zoom, VIEW, undefined).size;
+      expect(drawn, `zoom ${String(zoom)}`).toBeLessThan(clustersAt(row, zoom, 60).length);
+    }
+    expect(wantedDots(row, 15, VIEW, undefined).size).toBe(clustersAt(row, 15, 60).length);
   });
 
   it('keeps the gym whose popup is open on its own, out of clusters and out of view', () => {
@@ -74,14 +95,78 @@ describe('the dots and clusters drawn (plan 8M-7, fix round 1)', () => {
     expect([...away.keys()]).toEqual(['gym:9']);
   });
 
+  /** A cluster as wanted, of `count` gyms at a place. */
+  const cluster = (count: number, lat = 40.44, lon = -79.95) => ({
+    kind: 'cluster' as const,
+    points: Array.from({ length: count }, (_, index) => gym(index + 1, 'Gym')),
+    lat,
+    lon,
+  });
+  const dot = { kind: 'dot' as const, gym: gym(1, 'Gym') };
+  const drawnAs = (entries: Array<[string, DrawnDot]>) => new Map(entries);
+
   it('adds and takes off only the difference, never the open gym', () => {
     const wanted = new Map([
-      ['gym:1', null],
-      ['gym:3', null],
+      ['gym:1', dot],
+      ['gym:3', dot],
+    ]);
+    const drawn = drawnAs([
+      ['gym:1', undefined],
+      ['gym:2', undefined],
+      ['gym:5', undefined],
     ]);
-    expect(dotsDiff(['gym:1', 'gym:2', 'gym:5'], wanted, 'gym:5')).toEqual({
+    expect(planDots(drawn, wanted, 'gym:5')).toEqual({
       add: ['gym:3'],
       remove: ['gym:2'],
+      move: [],
+      change: [],
+    });
+  });
+
+  // Plan 8M-11B (S13): a poll that changes no gym draws nothing.
+  it('changes nothing where what is wanted is what is drawn', () => {
+    const wanted = new Map<string, WantedDot<MapGym>>([
+      ['gym:1', dot],
+      ['cluster:12:1:2', cluster(3)],
+    ]);
+    const drawn = drawnAs([
+      ['gym:1', undefined],
+      ['cluster:12:1:2', { count: 3, lat: 40.44, lon: -79.95 }],
+    ]);
+    expect(planDots(drawn, wanted, undefined)).toEqual({
+      add: [],
+      remove: [],
+      move: [],
+      change: [],
+    });
+  });
+
+  it("changes a cluster's count and place in place when its gyms change", () => {
+    const wanted = new Map([['cluster:12:1:2', cluster(2, 40.441, -79.951)]]);
+    const drawn = drawnAs([['cluster:12:1:2', { count: 3, lat: 40.44, lon: -79.95 }]]);
+    expect(planDots(drawn, wanted, undefined)).toEqual({
+      add: [],
+      remove: [],
+      move: [],
+      change: ['cluster:12:1:2'],
+    });
+  });
+
+  it("moves a cluster's marker no longer wanted to a new cluster rather than drawing one anew", () => {
+    const wanted = new Map<string, WantedDot<MapGym>>([
+      ['cluster:13:5:5', cluster(2)],
+      ['cluster:13:5:6', cluster(4)],
+      ['gym:7', dot],
+    ]);
+    const drawn = drawnAs([
+      ['cluster:12:1:1', { count: 9, lat: 40.4, lon: -79.9 }],
+      ['gym:8', undefined],
+    ]);
+    expect(planDots(drawn, wanted, undefined)).toEqual({
+      add: ['cluster:13:5:6', 'gym:7'],
+      remove: ['gym:8'],
+      move: [['cluster:12:1:1', 'cluster:13:5:5']],
+      change: [],
     });
   });
 });
diff --git a/src/web/client/gym-dots.ts b/src/web/client/gym-dots.ts
index 602d978c0490952b141c6c23e7f76c154b148f80..ac5070e271f3e609991aed2d42eaa6b97c6bdedd 100644
--- a/src/web/client/gym-dots.ts
+++ b/src/web/client/gym-dots.ts
@@ -13,9 +13,10 @@ export type WantedDot<G> =
 /**
  * What the gyms' layer draws for a view (plan 8M-7, fix round 1): the gyms of the view and a
  * margin round it (`DOTS_MARGIN`), clustered below street level (`clustersAt`), by key: `gym:<id>`
- * for a dot, `cluster:<cell>:<its places>` for a cluster, so that a cluster whose places change is
- * another. The gym whose popup is open (`open`) is always drawn on its own, out of every cluster,
- * wherever it is, so that its popup is never taken away.
+ * for a dot, `cluster:<zoom>:<cell>` for a cluster (plan 8M-11B, S13: its cell alone, so that a
+ * cluster whose places change is the same one, its count and place changed in place,
+ * `planDots`). The gym whose popup is open (`open`) is always drawn on its own, out of every
+ * cluster, wherever it is, so that its popup is never taken away.
  */
 export function wantedDots<G extends { id: number; lat: number; lon: number }>(
   gyms: readonly G[],
@@ -31,8 +32,7 @@ export function wantedDots<G extends { id: number; lat: number; lon: number }>(
     if (!first) continue;
     if (cluster.points.length === 1) wanted.set(`gym:${first.id}`, { kind: 'dot', gym: first });
     else {
-      const ids = cluster.points.map((point) => point.id).join(',');
-      wanted.set(`cluster:${cluster.cell ?? ''}:${ids}`, {
+      wanted.set(`cluster:${String(zoom)}:${cluster.cell ?? ''}`, {
         kind: 'cluster',
         points: cluster.points,
         lat: cluster.lat,
@@ -45,17 +45,53 @@ export function wantedDots<G extends { id: number; lat: number; lon: number }>(
   return wanted;
 }
 
-/** What to add and take off to go from the keys drawn to those wanted; never the open one. */
-export function dotsDiff(
-  drawn: Iterable<string>,
-  wanted: ReadonlyMap<string, unknown>,
+/** What a drawn cluster shows (its count and place); undefined for a gym's dot. */
+export type DrawnDot = { count: number; lat: number; lon: number } | undefined;
+
+/** How the gyms' layer goes from what it drew to what is wanted (`planDots`). */
+export interface DotsPlan {
+  /** Keys to draw anew. */
+  add: string[];
+  /** Keys to take off. */
+  remove: string[];
+  /** A cluster's marker no longer wanted, given to a new cluster: its count and place set. */
+  move: Array<[from: string, to: string]>;
+  /** A cluster drawn and still wanted whose count or place changed: set in place. */
+  change: string[];
+}
+
+/**
+ * How to go from what is drawn (by key, with what each cluster shows) to what is wanted (plan
+ * 8M-11B, S13), touching as little as can be: a key wanted and drawn the same is left alone (a
+ * poll that changes no gym changes nothing); a cluster whose count or place changed is changed in
+ * place; a new cluster takes over the marker of a cluster no longer wanted (a zoom, a pan), in
+ * order, rather than a marker being taken off and another made; the rest is added and taken
+ * off. Never the open gym's dot.
+ */
+export function planDots<G>(
+  drawn: ReadonlyMap<string, DrawnDot>,
+  wanted: ReadonlyMap<string, WantedDot<G>>,
   open: string | undefined,
-): { add: string[]; remove: string[] } {
-  const had = new Set(drawn);
-  return {
-    add: [...wanted.keys()].filter((key) => !had.has(key)),
-    remove: [...had].filter((key) => !wanted.has(key) && key !== open),
-  };
+): DotsPlan {
+  const added = [...wanted.keys()].filter((key) => !drawn.has(key));
+  const gone = [...drawn.keys()].filter((key) => !wanted.has(key) && key !== open);
+  const goneClusters = gone.filter((key) => drawn.get(key) !== undefined);
+  const move: Array<[string, string]> = [];
+  const add: string[] = [];
+  for (const key of added) {
+    const free = wanted.get(key)?.kind === 'cluster' ? goneClusters.shift() : undefined;
+    if (free === undefined) add.push(key);
+    else move.push([free, key]);
+  }
+  const moved = new Set(move.map(([from]) => from));
+  const change = [...wanted].flatMap(([key, item]) => {
+    const shown = drawn.get(key);
+    if (item.kind !== 'cluster' || shown === undefined) return [];
+    const same =
+      shown.count === item.points.length && shown.lat === item.lat && shown.lon === item.lon;
+    return same ? [] : [key];
+  });
+  return { add, remove: gone.filter((key) => !moved.has(key)), move, change };
 }
 
 /** What decides which gyms the map draws. */
diff --git a/src/web/client/gyms-ui.isolated.test.ts b/src/web/client/gyms-ui.isolated.test.ts
new file mode 100644
index 0000000000000000000000000000000000000000..dde981256f434adbddc217f90d82af8d76954719
--- /dev/null
+++ b/src/web/client/gyms-ui.isolated.test.ts
@@ -0,0 +1,237 @@
+import { afterEach, describe, expect, it, vi } from 'vitest';
+import { showGymDots, type GymDotsDeps } from './gyms-ui.js';
+import type { MapGym } from './popup.js';
+
+/**
+ * The gyms' layer (`showGymDots`, plan 8M-11B, S13) over a Leaflet of fakes that count what the
+ * page changes on the map: layers put into the gyms' group and taken out of it, markers moved,
+ * a cluster's count written. Isolated: mocked modules need a module graph of their own.
+ */
+const counted = vi.hoisted(() => {
+  const changes = { added: 0, removed: 0, moved: 0, relabeled: 0 };
+  type Handler = (event: unknown) => void;
+  /** A dot or a cluster's marker: where it is, its handlers, its popup. */
+  class Layer {
+    readonly handlers = new Map<string, Handler[]>();
+    group: Group | undefined;
+    constructor(
+      public at: [number, number],
+      readonly options: Record<string, unknown> = {},
+    ) {}
+    on(type: string, handler: Handler) {
+      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
+      return this;
+    }
+    off() {
+      return this;
+    }
+    bindPopup() {
+      return this;
+    }
+    openPopup() {
+      return this;
+    }
+    getPopup() {
+      return undefined;
+    }
+    setStyle() {
+      return this;
+    }
+    setLatLng(at: [number, number]) {
+      changes.moved += 1;
+      this.at = at;
+      return this;
+    }
+    /** The attributes set on its element since Leaflet made it with `options.title`. */
+    readonly attributes: Record<string, string> = {};
+    /** Its title as its element has it now. */
+    title(): unknown {
+      return this.attributes.title ?? this.options.title;
+    }
+    getElement() {
+      return {
+        setAttribute: (name: string, value: string) => {
+          this.attributes[name] = value;
+        },
+      };
+    }
+    addTo(group: Group) {
+      group.addLayer(this);
+      return this;
+    }
+  }
+  class Group {
+    readonly layers = new Set<Layer>();
+    addTo() {
+      return this;
+    }
+    addLayer(layer: Layer) {
+      changes.added += 1;
+      layer.group = this;
+      this.layers.add(layer);
+      return this;
+    }
+    removeLayer(layer: Layer) {
+      changes.removed += 1;
+      layer.group = undefined;
+      this.layers.delete(layer);
+      return this;
+    }
+    hasLayer(layer: Layer) {
+      return this.layers.has(layer);
+    }
+  }
+  /** The groups made (the gyms' is the only one). */
+  const groups: Group[] = [];
+  return { changes, Layer, Group, groups };
+});
+
+vi.mock('leaflet', () => ({
+  layerGroup: () => {
+    const group = new counted.Group();
+    counted.groups.push(group);
+    return group;
+  },
+  circleMarker: (at: [number, number], options: Record<string, unknown>) =>
+    new counted.Layer(at, options),
+  marker: (at: [number, number], options: Record<string, unknown>) =>
+    new counted.Layer(at, options),
+  divIcon: (options: Record<string, unknown>) => ({ options }),
+  latLngBounds: () => ({ getCenter: () => ({ lat: 0, lng: 0 }) }),
+  point: (x: number, y: number) => ({ x, y }),
+}));
+// What the gyms' layer takes of the party layer: the dot's size and its clicks, none here.
+vi.mock('./party-layer.js', () => ({
+  GYM_DOT: { radius: 6, weight: 2 },
+  gymClicks: () => undefined,
+}));
+vi.mock('./raid-forms.js', () => ({ heldContent: (draw: () => unknown) => draw }));
+vi.mock('./train-forms.js', () => ({ stopName: () => 'a gym' }));
+vi.mock('./theme.js', async (importOriginal) => {
+  const real = await importOriginal<typeof import('./theme.js')>();
+  return { ...real, theme: () => real.readTheme(() => ''), onThemeChange: () => undefined };
+});
+
+/** Six gyms of Oakland close together, and one across the river. */
+const gym = (id: number, lat: number, lon: number): MapGym => ({
+  id,
+  name: `Gym ${String(id)}`,
+  nickname: null,
+  lat,
+  lon,
+  regionIds: [1],
+  address: null,
+  description: null,
+  notice: null,
+});
+const GYMS = [
+  ...Array.from({ length: 6 }, (_, index) => gym(index + 1, 40.444 + index * 0.0002, -79.953)),
+  gym(7, 40.43, -79.92),
+];
+
+/** A cluster's count as its marker shows it (a span of ours), by its marker. */
+const labelOf = (layer: InstanceType<typeof counted.Layer>): string | null =>
+  (layer.options.icon as { options: { html: { textContent: string | null } } } | undefined)?.options
+    .html.textContent ?? null;
+
+afterEach(() => {
+  vi.unstubAllGlobals();
+});
+
+/** The gyms' layer over a map at `zoom` that shows Oakland, the raids hiding `hidden`. */
+function shown(zoom: number) {
+  vi.stubGlobal('document', {
+    createElement: () => {
+      const element = { textContent: null as string | null };
+      return new Proxy(element, {
+        set(target, key, value: unknown) {
+          if (key === 'textContent' && target.textContent !== null) counted.changes.relabeled += 1;
+          return Reflect.set(target, key, value);
+        },
+      });
+    },
+  });
+  vi.stubGlobal('window', { setTimeout: () => 0 });
+  counted.groups.splice(0);
+  Object.assign(counted.changes, { added: 0, removed: 0, moved: 0, relabeled: 0 });
+  const hidden = new Set<number>();
+  const map = {
+    zoom,
+    on: () => map,
+    once: () => map,
+    getZoom: () => map.zoom,
+    getBounds: () => ({
+      getSouth: () => 40.42,
+      getWest: () => -79.97,
+      getNorth: () => 40.46,
+      getEast: () => -79.9,
+      contains: () => true,
+    }),
+  };
+  const registry = { isOn: () => true, onChange: () => undefined, setCount: () => undefined };
+  const filter = { value: '', addEventListener: () => undefined };
+  const dots = showGymDots({
+    map,
+    gyms: GYMS,
+    names: new Map(),
+    registry,
+    filter,
+    extras: () => [],
+    editing: () => false,
+    clicked: () => false,
+    forced: () => false,
+    hidden: () => hidden,
+    tapped: () => undefined,
+  } as unknown as GymDotsDeps);
+  dots.refresh();
+  const group = counted.groups[0];
+  if (!group) throw new Error('the gyms drew no group');
+  /** What changed on the map since the last look. */
+  const changes = () => {
+    const now = { ...counted.changes };
+    Object.assign(counted.changes, { added: 0, removed: 0, moved: 0, relabeled: 0 });
+    return now;
+  };
+  changes();
+  return { dots, map, hidden, group, changes };
+}
+
+describe("the gyms' clusters (plan 8M-11B, S13)", () => {
+  // A guard rather than a change of behavior: the keys of plan 8M-7 were stable too while no gym
+  // changed (review R3); it keeps the layer from drawing anything anew at a poll.
+  it('draws nothing anew when the parties are drawn and no gym changed', () => {
+    const { dots, group, changes } = shown(12);
+    const before = [...group.layers];
+    expect(before.length).toBeGreaterThan(0);
+    dots.refresh();
+    dots.refresh();
+    expect(changes()).toEqual({ added: 0, removed: 0, moved: 0, relabeled: 0 });
+    expect([...group.layers]).toEqual(before);
+  });
+
+  it("changes a cluster's count and place in place when a raid hides one of its gyms", () => {
+    const { dots, group, hidden, changes } = shown(12);
+    const cluster = [...group.layers].find((layer) => labelOf(layer) === '6');
+    if (!cluster) throw new Error('no cluster of the six gyms');
+    const was = cluster.at;
+    hidden.add(6);
+    dots.refresh();
+    expect(changes()).toEqual({ added: 0, removed: 0, moved: 1, relabeled: 1 });
+    expect(labelOf(cluster)).toBe('5');
+    // Its title (the tooltip, what a screen reader says) with it.
+    expect(cluster.title()).toBe('5 gyms');
+    expect(cluster.at).not.toEqual(was);
+    expect(group.hasLayer(cluster)).toBe(true);
+  });
+
+  it("gives a cluster's marker to a cluster of the next zoom rather than drawing one anew", () => {
+    const { dots, map, group, changes } = shown(12);
+    const cluster = [...group.layers].find((layer) => labelOf(layer) === '6');
+    map.zoom = 13;
+    dots.refresh();
+    const now = changes();
+    expect(now.added).toBe(0);
+    expect(now.removed).toBe(0);
+    expect(cluster && group.hasLayer(cluster)).toBe(true);
+  });
+});
diff --git a/src/web/client/gyms-ui.ts b/src/web/client/gyms-ui.ts
index 6fcbd6ee6b271ab09bdb917e080477ba8d2ee6b5..f5e7b23f10e68a1c36d0250632578fe143c5ba01 100644
--- a/src/web/client/gyms-ui.ts
+++ b/src/web/client/gyms-ui.ts
@@ -1,6 +1,6 @@
 import * as L from 'leaflet';
 import { CLUSTER_BELOW } from './cluster.js';
-import { dotsDiff, shownGyms, wantedDots } from './gym-dots.js';
+import { planDots, shownGyms, wantedDots, type DrawnDot, type WantedDot } from './gym-dots.js';
 import type { LayerRegistry } from './layer-registry.js';
 import { GYM_DOT, gymClicks } from './party-layer.js';
 import { gymPopup, renderNode, type MapGym } from './popup.js';
@@ -52,12 +52,24 @@ export interface GymDotsDeps {
 /** How far a tap on a cluster zooms in at least. */
 const CLUSTER_STEP = 2;
 
+/** A cluster's marker as drawn: its count's text, and the gyms a tap zooms in on. */
+interface Bubble {
+  marker: L.Marker;
+  label: HTMLElement;
+  points: readonly MapGym[];
+}
+
+/** A cluster's title (its tooltip, what a screen reader says). */
+const gymsTitle = (count: number): string => `${String(count)} gyms`;
+
 export function showGymDots(deps: GymDotsDeps): GymDots {
   const { map, registry } = deps;
   const group = L.layerGroup().addTo(map);
   const dots = new Map<number, L.CircleMarker>();
-  /** What is drawn, by its key (`wantedDots`). */
-  const drawn = new Map<string, L.Layer>();
+  /** What is drawn, by its key (`wantedDots`), with what a cluster shows (`planDots`). */
+  const drawn = new Map<string, { layer: L.Layer; shows: DrawnDot }>();
+  /** The clusters' markers by key: their count's text and their gyms, set in place. */
+  const bubbles = new Map<string, Bubble>();
   /** The gym whose popup is open. */
   let open: number | undefined;
 
@@ -102,30 +114,50 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
     return marker;
   };
 
-  const bubble = (points: readonly MapGym[], lat: number, lon: number): L.Marker => {
+  const bubble = (points: readonly MapGym[], lat: number, lon: number): Bubble => {
     // The count as text of an element of ours: Leaflet sets a string as HTML.
     const label = document.createElement('span');
     label.textContent = String(points.length);
     const marker = L.marker([lat, lon], {
       icon: L.divIcon({ html: label, className: 'cluster', iconSize: [34, 34] }),
       keyboard: true,
-      title: `${points.length} gyms`,
+      title: gymsTitle(points.length),
     });
+    const made: Bubble = { marker, label, points };
     marker.on('click', () => {
-      const box = L.latLngBounds(points.map((point) => [point.lat, point.lon]));
+      const box = L.latLngBounds(made.points.map((point) => [point.lat, point.lon]));
       const zoom = Math.min(
         Math.max(map.getBoundsZoom(box, false, L.point(40, 40)), map.getZoom() + CLUSTER_STEP),
         CLUSTER_BELOW,
       );
       map.setView(box.getCenter(), zoom);
     });
-    return marker;
+    return made;
   };
 
   /**
-   * Draws what is wanted for the view and a margin (`wantedDots`), adding and taking off only the
-   * difference (`dotsDiff`): a pan or a new list of parties does not draw every gym anew, and the
-   * dot whose popup is open is never taken off (fix round 1).
+   * A cluster's marker shows `item` (plan 8M-11B, S13): its count, its title and its gyms, and it
+   * moves to their middle; only what changed is touched.
+   */
+  const reshow = (shown: Bubble, item: { points: MapGym[]; lat: number; lon: number }): void => {
+    const count = String(item.points.length);
+    if (shown.label.textContent !== count) {
+      shown.label.textContent = count;
+      shown.marker.getElement()?.setAttribute('title', gymsTitle(item.points.length));
+    }
+    shown.points = item.points;
+    shown.marker.setLatLng([item.lat, item.lon]);
+  };
+  const showsOf = (item: WantedDot<MapGym>): DrawnDot =>
+    item.kind === 'cluster'
+      ? { count: item.points.length, lat: item.lat, lon: item.lon }
+      : undefined;
+
+  /**
+   * Draws what is wanted for the view and a margin (`wantedDots`), touching only the difference
+   * (`planDots`): a pan or a new list of parties does not draw every gym anew, the dot whose popup
+   * is open is never taken off (fix round 1), a cluster whose gyms changed changes its count and
+   * place in place, and one no longer wanted gives its marker to a new one (plan 8M-11B, S13).
    */
   const refresh = (): void => {
     const hidden = deps.hidden();
@@ -142,22 +174,43 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
       east: bounds.getEast(),
     };
     const wanted = wantedDots(shown, map.getZoom(), view, open);
-    const { add, remove } = dotsDiff(
-      drawn.keys(),
-      wanted,
-      open === undefined ? undefined : `gym:${open}`,
-    );
-    for (const key of remove) {
-      const layer = drawn.get(key);
+    const shows = new Map([...drawn].map(([key, { shows: what }]) => [key, what]));
+    const plan = planDots(shows, wanted, open === undefined ? undefined : `gym:${open}`);
+    for (const key of plan.remove) {
+      const layer = drawn.get(key)?.layer;
       if (layer) group.removeLayer(layer);
       drawn.delete(key);
+      bubbles.delete(key);
+    }
+    for (const [from, to] of plan.move) {
+      const shown = bubbles.get(from);
+      const item = wanted.get(to);
+      bubbles.delete(from);
+      drawn.delete(from);
+      if (!shown || item?.kind !== 'cluster') continue;
+      reshow(shown, item);
+      bubbles.set(to, shown);
+      drawn.set(to, { layer: shown.marker, shows: showsOf(item) });
+    }
+    for (const key of plan.change) {
+      const shown = bubbles.get(key);
+      const item = wanted.get(key);
+      if (!shown || item?.kind !== 'cluster') continue;
+      reshow(shown, item);
+      drawn.set(key, { layer: shown.marker, shows: showsOf(item) });
     }
-    for (const key of add) {
+    for (const key of plan.add) {
       const item = wanted.get(key);
       if (!item) continue;
-      const layer = item.kind === 'dot' ? dot(item.gym) : bubble(item.points, item.lat, item.lon);
-      layer.addTo(group);
-      drawn.set(key, layer);
+      if (item.kind === 'dot') {
+        dot(item.gym).addTo(group);
+        drawn.set(key, { layer: dot(item.gym), shows: undefined });
+        continue;
+      }
+      const made = bubble(item.points, item.lat, item.lon);
+      made.marker.addTo(group);
+      bubbles.set(key, made);
+      drawn.set(key, { layer: made.marker, shows: showsOf(item) });
     }
     registry.setCount('gyms', shown.filter((gym) => bounds.contains([gym.lat, gym.lon])).length);
   };
@@ -197,7 +250,7 @@ export function showGymDots(deps: GymDotsDeps): GymDots {
     const key = `gym:${String(gym.id)}`;
     if (!group.hasLayer(marker)) {
       marker.addTo(group);
-      drawn.set(key, marker);
+      drawn.set(key, { layer: marker, shows: undefined });
     }
     marker.openPopup();
     return marker.getPopup()?.getElement();
````

### Task 4: 8M-11B: an invite for a logged-in visitor not in the server

Prototype commit: `e7ccd2a6fffacbbaf4e4a96b2b56355b77afc61d`

settings.web.invites maps a server's id to the invite its admin chose,
https://discord.gg/<code> or https://discord.com/invite/<code> (a vanity
code too, letters, digits and hyphens, nothing after it), checked when
the settings load: anything else stops the start with the shape it
must have; a blank one is none, and absent no server has one. /api/me
carries invite only for somebody logged in whom the directory finds not
in the server: nobody logged out, no member without the map's member
role, nobody while Discord cannot say. The page's header shows "Join
the server on Discord" under "You are not a member of this server.",
opening the invite in a new tab with rel="noopener" (inviteNode). Pine
calls Discord for nothing new.

**Files:**

```
 src/config/settings.test.ts   | 37 +++++++++++++++++++++++++++++++++++++
 src/config/settings.ts        | 39 +++++++++++++++++++++++++++++++++++++++
 src/web/client/common.ts      |  5 ++++-
 src/web/client/map.css        | 10 ++++++++++
 src/web/client/notice.test.ts | 39 ++++++++++++++++++++++++++++++++++++++-
 src/web/client/notice.ts      | 34 ++++++++++++++++++++++++++++++----
 src/web/guild-routes.ts       |  9 +++++++--
 src/web/login.test.ts         | 32 ++++++++++++++++++++++++++++++++
 8 files changed, 197 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`, `npx vitest run --project unit --project isolated src/config/settings.test.ts src/web/client/notice.test.ts src/web/login.test.ts`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff e7ccd2a6fffacbbaf4e4a96b2b56355b77afc61d -- src test docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11B: an invite for a logged-in visitor not in the server`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/src/config/settings.test.ts b/src/config/settings.test.ts
index 60a96faa02501e2981b64e298399dcdd4de94763..150f66f22c45539f57b90b5639310491b57f6803 100644
--- a/src/config/settings.test.ts
+++ b/src/config/settings.test.ts
@@ -307,6 +307,43 @@ describe('loadSettings', () => {
     expect(() => web(['Verified'])).toThrow(/memberRole/);
   });
 
+  // Plan 8M-11B: an invite for a visitor who is not in the server, per server, chosen by its admin.
+  it("reads each server's invite to the map's visitors, blank as none, and refuses anything else", () => {
+    const web = (invites: unknown) =>
+      loadSettings(
+        writeSettings((s) => {
+          s.web = { port: 8080, publicUrl: 'https://map.example.test', invites };
+        }),
+      ).web;
+    expect(
+      web({
+        '412345678901234567': ' https://discord.gg/abc123XY ',
+        '412345678901234568': 'https://discord.com/invite/pokemon-go-pgh',
+        '412345678901234569': '  ',
+      })?.invites,
+    ).toEqual({
+      '412345678901234567': 'https://discord.gg/abc123XY',
+      '412345678901234568': 'https://discord.com/invite/pokemon-go-pgh',
+    });
+    expect(web(undefined)?.invites).toBeUndefined();
+    for (const wrong of [
+      { '412345678901234567': 'https://discord.gg/' },
+      { '412345678901234567': 'http://discord.gg/abc123' },
+      { '412345678901234567': 'https://discord.gg/abc123?event=1' },
+      { '412345678901234567': 'https://example.com/invite/abc123' },
+      { '412345678901234567': 'https://discord.com/channels/1/2' },
+      { '412345678901234567': 'discord.gg/abc123' },
+      { 'not-a-server': 'https://discord.gg/abc123' },
+      { '412345678901234567': 7 },
+      ['https://discord.gg/abc123'],
+    ]) {
+      expect(() => web(wrong), JSON.stringify(wrong)).toThrow(/invites/);
+    }
+    expect(() => web({ '412345678901234567': 'https://discord.gg/' })).toThrow(
+      /https:\/\/discord\.gg\/<code> or https:\/\/discord\.com\/invite\/<code>/,
+    );
+  });
+
   it('takes a plain http address only for this machine', () => {
     for (const local of ['http://localhost:8080', 'http://127.0.0.1:8080/', 'http://[::1]:8080']) {
       const file = writeSettings((s) => {
diff --git a/src/config/settings.ts b/src/config/settings.ts
index 1c0b8df4b71c0ea7aa169f171493b7a3ab4461f1..d8dae167c510e84a9cae1650dc67d58c71063815 100644
--- a/src/config/settings.ts
+++ b/src/config/settings.ts
@@ -64,6 +64,13 @@ export function isLocalAddress(publicUrl: string): boolean {
   return LOCAL_HOSTS.includes(new URL(publicUrl).hostname);
 }
 
+/**
+ * An address of Discord's invites (plan 8M-11B, `web.invites`): `https://discord.gg/<code>` or
+ * `https://discord.com/invite/<code>`, the code (a vanity one too) letters, digits and hyphens,
+ * nothing after it.
+ */
+const INVITE_ADDRESS = /^https:\/\/(?:discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]{2,32}$/u;
+
 /**
  * The address every link of the web server points at (spec 2.1): `https:`, or `http:` for this
  * machine alone (the cookie is `Secure` otherwise); the root of its host, nothing after it, kept
@@ -295,6 +302,38 @@ const settingsObject = z.strictObject({
         (value) => (typeof value === 'string' ? value.trim() || undefined : value),
         z.string().optional(),
       ),
+      /**
+       * An invite for a logged-in visitor of the map who is not in the server (plan 8M-11B; Matt,
+       * 2026-10-28: the server's admin chooses whether it shares one and where newcomers land, so
+       * Pine needs no permission and calls Discord for nothing): a server's id to an address of
+       * Discord's invites, `https://discord.gg/<code>` or `https://discord.com/invite/<code>` (a
+       * vanity code too), nothing after it. A blank one is none; absent, no server has one.
+       */
+      invites: z
+        .preprocess(
+          (value) =>
+            value !== null && typeof value === 'object' && !Array.isArray(value)
+              ? Object.fromEntries(
+                  Object.entries(value).flatMap(([server, link]) =>
+                    typeof link !== 'string'
+                      ? [[server, link]]
+                      : link.trim() === ''
+                        ? []
+                        : [[server, link.trim()]],
+                  ),
+                )
+              : value,
+          z.record(
+            z.string().regex(/^\d{17,20}$/u, "must be a server's ID"),
+            z
+              .string()
+              .regex(
+                INVITE_ADDRESS,
+                'must be https://discord.gg/<code> or https://discord.com/invite/<code>',
+              ),
+          ),
+        )
+        .optional(),
     })
     .optional(),
   /**
diff --git a/src/web/client/common.ts b/src/web/client/common.ts
index 81df455bb297898c8cc805f5a048ab348ed1dcf4..ba2ccfcdd83c1480de31a67b6595a2217a7f5af2 100644
--- a/src/web/client/common.ts
+++ b/src/web/client/common.ts
@@ -14,7 +14,8 @@ import {
   type XyzSpec,
 } from './layers.js';
 import { LOGOUT_FAILED, logOut } from './logout.js';
-import { headerLines, NoticeBand, type Me, type WebPage } from './notice.js';
+import { headerLines, inviteNode, NoticeBand, type Me, type WebPage } from './notice.js';
+import { renderNode } from './popup.js';
 import { requestError } from './request-error.js';
 import { darkScheme, onThemeChange } from './theme.js';
 
@@ -318,5 +319,7 @@ export async function showAccount(
     line.textContent = text;
     account.append(line);
   }
+  // The server's invite under the line that they are not in it (plan 8M-11B).
+  if (header.invite !== undefined) account.append(renderNode(inviteNode(header.invite), document));
   return me;
 }
diff --git a/src/web/client/map.css b/src/web/client/map.css
index bfae04f387fb6631b4435b11d82a8c6f43b47bad..a2cdf25ff9b5aba29928de8af0dfb48cb26aebc8 100644
--- a/src/web/client/map.css
+++ b/src/web/client/map.css
@@ -85,6 +85,16 @@ a {
   background: var(--primary-hover);
 }
 
+/* The server's invite for somebody logged in who is not in it (8M-11B). */
+#account a.invite {
+  color: var(--on-color);
+  background: var(--primary);
+}
+
+#account a.invite:hover {
+  background: var(--primary-hover);
+}
+
 /* "Log in with Discord", "Log in" on a phone (8M-7 review fix 4). */
 #account a.login .short {
   display: none;
diff --git a/src/web/client/notice.test.ts b/src/web/client/notice.test.ts
index 7bd9fa85a12b129f4c23d1782fdc755ecd32b245..a5cd9c953dc7174f47ccfff6b17e56a4f79433ea 100644
--- a/src/web/client/notice.test.ts
+++ b/src/web/client/notice.test.ts
@@ -1,5 +1,12 @@
 import { describe, expect, it } from 'vitest';
-import { headerLines, loginNotice, loginNoticeFor, NOTICE_MS, NoticeBand } from './notice.js';
+import {
+  headerLines,
+  inviteNode,
+  loginNotice,
+  loginNoticeFor,
+  NOTICE_MS,
+  NoticeBand,
+} from './notice.js';
 
 describe('loginNotice', () => {
   it('says once why a login did not happen, and gives the address without it', () => {
@@ -79,6 +86,36 @@ describe('headerLines', () => {
     });
   });
 
+  // Plan 8M-11B: a way into the server for somebody logged in who is not in it.
+  it('offers the server\'s invite under "You are not a member of this server.", and nowhere else', () => {
+    const me = { loggedIn: true as const, name: 'Ash', csrf: 't', member: false, readOnly: false };
+    const invite = 'https://discord.gg/pinetest';
+    expect(headerLines({ ...me, invite }, 'discord', 'map')).toEqual({
+      login: false,
+      name: 'Ash',
+      lines: ['You are not a member of this server.'],
+      invite,
+    });
+    // Without one in the settings, the page reads as before.
+    expect(headerLines(me, 'discord', 'map')).not.toHaveProperty('invite');
+    // Only beside that line: a member, or Discord away, gets none whatever the answer holds.
+    expect(headerLines({ ...me, member: true, invite }, 'discord', 'map')).not.toHaveProperty(
+      'invite',
+    );
+    expect(headerLines({ ...me, readOnly: true, invite }, 'discord', 'map')).not.toHaveProperty(
+      'invite',
+    );
+  });
+
+  it('opens the invite in a new tab that cannot reach back into the map', () => {
+    expect(inviteNode('https://discord.gg/pinetest')).toEqual({
+      tag: 'a',
+      className: 'invite',
+      text: 'Join the server on Discord',
+      attributes: { href: 'https://discord.gg/pinetest', target: '_blank', rel: 'noopener' },
+    });
+  });
+
   it("tells nobody in the region editor to get the map's member role", () => {
     // A moderator without the role: the editor is theirs as staff, the role is for the map.
     const me = {
diff --git a/src/web/client/notice.ts b/src/web/client/notice.ts
index 4f9087886b89b5bb65e62f89e2e2a400c5d70ce6..1b812d2d76a324ca777a87e3782528372d90538e 100644
--- a/src/web/client/notice.ts
+++ b/src/web/client/notice.ts
@@ -1,3 +1,5 @@
+import type { PageNode } from './popup.js';
+
 /** Who is asking, as `/s/<guild>/api/me` answers. */
 export type Me =
   | { loggedIn: false }
@@ -17,6 +19,11 @@ export type Me =
        * the editor's data asks Discord and decides.
        */
       mayEditRegions?: boolean;
+      /**
+       * For one logged in who is not in the server (plan 8M-11B): the server's invite, as its
+       * admin set it in `settings.web.invites`; absent where it has none.
+       */
+      invite?: string;
     };
 
 /** How long the notice band shows a line (plan 8M-11A): a new line starts the time again. */
@@ -130,17 +137,21 @@ export function loginNoticeFor(notice: { text: string } | undefined, me: Me): st
 /** Which of the web pages a header is of: the live map or the region editor. */
 export type WebPage = 'map' | 'editor';
 
+/** What the page says of somebody who is not in the server. */
+export const NOT_A_MEMBER = 'You are not a member of this server.';
+
 /**
  * What the page's header says: "Log in with Discord" (only where it is offered) or how else to
  * log in, or the member's name with what keeps them from more than the public map: Discord away,
  * the map's member role they lack (only on the map: the editor is for staff, whom the role does
- * not concern), or not being in the server.
+ * not concern), or not being in the server, with the server's invite under it where `/api/me`
+ * gives one (`invite`, plan 8M-11B).
  */
 export function headerLines(
   me: Me,
   login: 'discord' | 'links',
   page: WebPage,
-): { login: boolean; name?: string; lines: string[] } {
+): { login: boolean; name?: string; lines: string[]; invite?: string } {
   if (!me.loggedIn) {
     return login === 'discord'
       ? { login: true, lines: [] }
@@ -151,12 +162,27 @@ export function headerLines(
     : me.member
       ? []
       : me.missingRole === undefined
-        ? ['You are not a member of this server.']
+        ? [NOT_A_MEMBER]
         : page === 'editor'
           ? []
           : [
               'You can look around the map. To join or report here, you need the ' +
                 `${me.missingRole} role in this server.`,
             ];
-  return { login: false, name: me.name, lines };
+  const invite = lines.length === 1 && lines[0] === NOT_A_MEMBER ? me.invite : undefined;
+  return { login: false, name: me.name, lines, ...(invite === undefined ? {} : { invite }) };
+}
+
+/**
+ * The server's invite under "You are not a member of this server." (plan 8M-11B): Discord's page
+ * in a new tab, which cannot reach back into the map (`noopener`). After joining, a reload makes
+ * them a member within the directory's minute.
+ */
+export function inviteNode(invite: string): PageNode {
+  return {
+    tag: 'a',
+    className: 'invite',
+    text: 'Join the server on Discord',
+    attributes: { href: invite, target: '_blank', rel: 'noopener' },
+  };
 }
diff --git a/src/web/guild-routes.ts b/src/web/guild-routes.ts
index 6677ddb284f272d0c33eaa8316ae679c55675269..b79e3dfd79c871879aa7d8b58edd0e8e426fc124 100644
--- a/src/web/guild-routes.ts
+++ b/src/web/guild-routes.ts
@@ -71,9 +71,11 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
   // directory; without the map's member role a member is none here, and is told the role's name,
   // `missingRole`: they are in the server, whose roles they see on Discord), and the CSRF token
   // its POSTs carry. When Discord cannot say, the page is read-only. Every request counts against
-  // the address, as it may ask Discord.
+  // the address, as it may ask Discord. Somebody logged in whom the directory finds not in the
+  // server is given the server's invite where the settings have one (`invite`, plan 8M-11B):
+  // nobody logged out (they may be a member), no member without the role, nobody while read-only.
   const meLimiter = new RateLimiter({ uses: ME_PER_MINUTE, perMs: 60_000 });
-  const { memberRole } = deps.settings;
+  const { memberRole, invites } = deps.settings;
   scope.get(
     '/api/me',
     { onRequest: limitedPerAddress(meLimiter, { now: deps.now }) },
@@ -85,8 +87,10 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
       let missingRole: string | undefined;
       let readOnly = false;
       let mayEdit = false;
+      let invite: string | undefined;
       try {
         const found = await deps.members.find(request.params.guild, session.userId);
+        if (found === undefined) invite = invites?.[request.params.guild];
         member = found !== undefined && countsOnTheMap(found.standing, memberRole);
         if (found !== undefined && !member) missingRole = memberRole;
         // Whether to offer "Edit regions" (plan 8M-10): a hint by the member as the directory
@@ -109,6 +113,7 @@ export function guildRoutes(scope: FastifyInstance, deps: WebDeps): void {
         readOnly,
         mayEditRegions: mayEdit,
         ...(missingRole === undefined ? {} : { missingRole }),
+        ...(invite === undefined ? {} : { invite }),
       };
     },
   );
diff --git a/src/web/login.test.ts b/src/web/login.test.ts
index 29cfb199b810693a3e48375268464c80a0bae414..4b0b48419700e131f03e34be16b7fe78fe7a2817 100644
--- a/src/web/login.test.ts
+++ b/src/web/login.test.ts
@@ -529,6 +529,38 @@ describe('who is asking', () => {
     expect(me).not.toHaveProperty('missingRole');
   });
 
+  // Plan 8M-11B: the server's invite, from the settings, only for one logged in and not in it.
+  it("gives the server's invite to somebody logged in who is not in it, and to nobody else", async () => {
+    const members = new FakeMemberDirectory();
+    const invite = 'https://discord.gg/pinetest';
+    const map = webServerWith({
+      members,
+      web: { memberRole: 'Verified', invites: { [FAKE_GUILD_ID]: invite } },
+      servers: { has: (guild) => guild === FAKE_GUILD_ID || guild === '412345678901234999' },
+    });
+    web = map;
+    const cookie = await map.loggedIn(ASH, 'Ash');
+    const ask = async (url = ME, headers: Record<string, string> = { cookie }) =>
+      (await map.app.inject({ url, headers })).json<object>();
+    expect(await ask()).toMatchObject({ loggedIn: true, member: false, invite });
+    // A server without one in the settings: none.
+    expect(await ask('/s/412345678901234999/api/me')).not.toHaveProperty('invite');
+    // Logged out (they may be a member who has not logged in): none.
+    expect(await ask(ME, {})).toEqual({ loggedIn: false });
+    // In the server without the map's member role: the role is named, no invite.
+    members.add(ASH, 'Ash');
+    expect(await ask()).toMatchObject({ member: false, missingRole: 'Verified' });
+    expect(await ask()).not.toHaveProperty('invite');
+    // A member: none.
+    members.standing(ASH, { roleNames: ['Verified'], administrator: false });
+    expect(await ask()).toMatchObject({ member: true });
+    expect(await ask()).not.toHaveProperty('invite');
+    // Discord cannot say whether they are in it: read-only, no invite.
+    members.failing = new Error('Discord is away');
+    expect(await ask()).toMatchObject({ readOnly: true });
+    expect(await ask()).not.toHaveProperty('invite');
+  });
+
   it('is read-only when Discord cannot say whether they are a member', async () => {
     const members = new FakeMemberDirectory().add(ASH, 'Ash');
     members.failing = new Error('Discord is away');
````

### Task 5: 8M-11B docs: trains and clusters on the map, the invite, staging

Prototype commit: `59056e20bb749e9c6a936d05d5e773211be9be77`

web.md gains "The fix pass: trains and clusters (plan 8M-11B)" (the
line's legs and arrowheads, the drag line, the held map, the clusters
by cell with the profile's numbers, the invite) and its settings,
header, frame and train view say what changed; trains.md says endMode
serves the map; testing.md names the new fakes and test files.
docs/web-setup.md documents web.invites with a sample, and both admin
guides point to it. The staging checklist covers two accounts on a
desktop and Matt's phone; the invite's visitor is Matt's call (a fresh
browser profile with an account outside the server, or Tester leaving
and rejoining through the invite).

**Files:**

```
 docs/architecture/testing.md                             |  2 +-
 docs/architecture/trains.md                              |  2 +-
 docs/architecture/web.md                                 | 21 +++++++++++++++++----
 docs/guides/migrating-a-legacy-instance.md               |  2 +-
 docs/guides/new-instance.md                              |  2 +-
 docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md | 83 +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 docs/web-setup.md                                        |  7 +++++++
 7 files changed, 111 insertions(+), 8 deletions(-)
```

- [ ] **Step 1: Apply the change.** Save the diff below to a file outside the repository and run
  `git apply --whitespace=nowarn <file>`. The tests in it are this task's tests.
- [ ] **Step 2: Typecheck and run this task's test files** (`npm run typecheck`); all pass.
- [ ] **Step 3: Format and lint check:** `npx prettier --check` and `npx eslint` on the files of this diff that they cover.
- [ ] **Step 4: Check the transcription:** `git diff 59056e20bb749e9c6a936d05d5e773211be9be77 -- src test docs/architecture docs/guides docs/web-setup.md docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md` prints nothing.
- [ ] **Step 5: Commit** with the title `8M-11B docs: trains and clusters on the map, the invite, staging`, the body above and the trailer, staging exactly the files listed (`git add -- <files>`).

````diff
diff --git a/docs/architecture/testing.md b/docs/architecture/testing.md
index dd1d541b15b8e65c5153f058e75e11847015750f..7be4d01c25147198c3ab5f5a8a7181349e367549 100644
--- a/docs/architecture/testing.md
+++ b/docs/architecture/testing.md
@@ -90,7 +90,7 @@ Tests are colocated, use real MySQL and real loggers, never the network, and run
 - Meetups on the map (plan 8M-5M): `meetupWebWith(ctx, { channelName })` gives the web server what `/meetup`, `/name`, `/info`, `/meet` and `/end` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `parties`, `regions` and `meetupSafety` of `meetupSafetyWith`, or of `createdMeetup` for a change, and `wayspots` of `wayspotsWith` for the stops; `await ctx.placeFinder.built()` before a stop is named); pass it as `meetups` beside `partyWebWith(made, …)`, which takes the services of `meetupSafetyWith` too, the same `throttles` to fill `/meetup`'s window (`MEETUP_COMMAND`) or a change's (`name`, or `variedThrottleKey('meet', START_THROTTLE)` for a start) before a request. Without it every use of the meetups' deps throws. The stops of `meetup-make.test.ts` are kept Wayspots in West: two PokéStops (one titled with a flagged word), a Power Spot, and for the cap 305 more. A block, a ruling: `made.storage.addBlock`, `made.storage.rule`; the moderators' post: `made.gateway.messagesIn(MOD_CHANNEL)`. The page's meetup forms are tested in their pure parts (`meetup-forms.test.ts`: the form, the editor, their bodies, `PlacePicking`, `StopLoads`, and the state `meetup-ui.ts` keeps, moved into pure functions there: the editor's fields typed in and the value each was drawn from, `editorTyped` and `editorAfter`; whether an answer closes the editor, draws it anew or only says its words, `editorStep`; whether the member chose the region, `regionChosenBy`; the box the stops are asked for, kept to the world, `stopsBox`); what is left in `meetup-ui.ts` is wiring to the DOM, and it and the map's side are tried at staging.
 - Max battles on the map (plan 8X-5): `maxReportingWith(safety, rows)` (`test/support/max-reporting.ts`) gives the services of `reportsWith` (without the moderators' channel unless `safety` names it), the max bosses of the recorded feed, the recorded max and big events, the kept Power Spot `SPOT_ROW` at `TEST_SPOT` (and `rows`), and a context over them whose place search is built (`ctx`); fake `Date` to `MAX_THURSDAY` (an ordinary Thursday, 14:00) first, and set the web server's `clock.now` to it (move both together to pass time). `maxWebWith(ctx, { channelName })` gives the web server what `/max` reads and calls; pass it as `maxes` beside `partyWebWith(made, …)`, whose `maxLook` shows a max battle as its post does (`reportedMax` for one made through the service). Without it every use of the max deps throws. A block at a pin: `made.storage.addBlock`; the moderators' notice: `made.reports.flush()`, then `made.gateway.messagesIn(MOD_CHANNEL)`; a spot in two regions: East's outline reaching into West (`made.regions.rows`), as for spawns.
 - Reports at stops on the map (plan 8R-3): `stopReportingWith(rows)` (`test/support/stop-reporting.ts`) gives the party services of `partyServiceWith` (`made`: its fake gateway holds the forums, who is barred, and the grunts' messages), the kept stops of `STOP_ROWS` (PokéStops 1 and 2 in West, 3 in East, a Power Spot) or `rows` (`wayspots`, the directory: `setPineStops` for stops of Pine's own), and a context with `StopReportService` over `MemoryStopReports` (`store`), `GruntMessageService` (`grunts`, over `gruntStore`; its timers never run) and `RocketService`; fake `Date` to `STOP_NOON` and set the web server's `clock.now` to it. `stopWebWith(ctx, { channelName, posts, grunts })` gives the web server what `/research` and `/rocket` read and call; pass it as `stops` beside `partyWebWith(made.made, …)` (whose `forums` the shared `PartyViewers` asks); `posts` is a `linkOf` of the test's (none by default), `grunts` the context's `grunts` for the grunts' links. Without it every use of the stops' deps throws. A command's window is filled under `researchWindow(settings)` or `rocketWindow(settings)` with `researchThrottle` / `rocketThrottle` (the varied keys the router counts them under), a take-back's under `RESEARCH_REMOVE` / `ROCKET_REMOVE` with `MEMBER_WRITE_THROTTLE`. A hideout reported between the route's look and the report: `vi.spyOn(made.ctx.stopReports, 'rocketAt').mockResolvedValueOnce(undefined)` (`stop-report-post.test.ts`).
-- Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. `showParties` drawing a list runs in `party-layer-draw.isolated.test.ts` (plan 8M-9A, reviews B1 to B9): Leaflet mocked down to layers and groups that say whether they are on the map, markers whose popup opens only there and tells the map before the layer (as Leaflet's), the circles drawn with their options; a page of `PageElement`s (attributes and `dataset`, the tree, simple selectors, bubbling clicks, the focus) with the document's own listeners (Escape, `visibilitychange`, which a test fires to have the list asked for again and drawn, `poll`); `fetch` answering `/api/parties` with the test's list; the theme, the list of what is on and the phone card stubbed (`fake.card`), and the hooks the party layer hands `raidUi` and `maxUi` taken as they are made (their `done`, `pickSpot`); route mode a stub of `trainUi`'s `spotClicked` (`fake.route`). It waits for each draw through `afterDraw`; its `started` takes an `activity` (`MapActivity`, plan 8M-10) to turn the region editor on and off under both pollers. The Power Spots' and PokéStops' dots (`showPlaces`) run over a Leaflet of dots and popups in `places-ui.isolated.test.ts`. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
+- Trains on the map (plan 8M-5): `trainWebWith(ctx, { channelName })` gives the web server what `/train`, `/route`, the moves and `/conductor` read and call, from a test's context (`createTestContext` with `partyService`, `attendance`, `timedParties`, `trains`, `parties`, `regions` and `users` of `partyServiceWith` or `createdTrain`, so that `made.userSettings` sets a maker's privacy and automatic status); pass it as `trains` beside `partyWebWith(made, …)`, the same `throttles` to fill a command's window (`TRAIN_COMMAND`, `route add`, `conductor set`, …) or the post's controls' (`controlThrottleKey(PARTY_KIND)`) before a request. Without it every use of the trains' deps throws. A route changed behind the page's back: change it through `made.trains` before the request (`train-route.test.ts`); a route of `MAX_ROUTE_STOPS`: `made.store.update` with invented gym ids, as `route.test.ts` does; saved routes of another member: `made.routes.add(member, region, name, gyms)`. The movement's announcement and its pings: `made.trains.flush()`, then the post's messages (`train-move.test.ts`). The new-train DM: `made.newTrains.set(id, made.gateway.guildId, true, 1)` before, `made.notify.flush()` and `dmBrief(made.dms.to(id)[0])` after (`train-start.test.ts`). The page's train forms are tested in their pure parts (`train-forms.test.ts`, route mode's queue of edits `RouteEdits` over a fake `send` that keeps each edit until the test answers it, a stop dragged, `StopDrag` and `dropPosition` over rows of the test's; `FormHold`'s `aside` claims in `raid-forms.test.ts`). A train's dialogs as forms (plan 8M-8C): their routes in `train-move.test.ts` (Move…), `train-manage.test.ts` and `train-split.test.ts` (a split as in `train-split.test.ts` of the commands: groups opened through `made.attendance`), the functions shared with Discord in `src/commands/trains/train-changes.test.ts`, the forms' pure parts in `src/web/client/train-post-forms.test.ts`, their addresses in `post-forms-ui.isolated.test.ts`. A conductor's change on its way while a press passes the route's checks: wrap `made.gateway.memberAccess` (asked last before the change) to start it (`train-move.test.ts`). `train-ui.ts` itself (route mode: its edits, a stop dragged and dropped, a Power Spot tapped) runs in `train-ui.isolated.test.ts` over a fake document of its own (`FakeElement`: attributes and `dataset`, the tree, fields, bubbling events with a pointer's `clientY`, the rows' boxes a test lays out (`box`, `getBoundingClientRect`), the selectors the page asks), a stubbed `fetch` that answers each request as the test says, a real `FormHold` and Leaflet mocked; it waits on a `Count` of its own (the page's type check cannot take `Tally`, whose timers are Node's). A gym's clicks (`gymClicks`) run over a fake layer in `party-layer.isolated.test.ts`, Leaflet mocked down to the `DomEvent.stop` it records; the right click on a raid's picture or dot runs the real Leaflet in `party-layer-contextmenu.isolated.test.ts` (plan 8W-3): globals stubbed in `vi.hoisted` with just enough of a browser for Leaflet to load (no DOM library), a map made of `L.Map.prototype` with its container, a pane, the marker's element made its target by `addInteractiveTarget`, the pointer's place given by stubbing the map's conversions, and `_fireDOMEvent` as Leaflet calls it; a marker that listens is the control that shows the test can fail. `showParties` drawing a list runs in `party-layer-draw.isolated.test.ts` (plan 8M-9A, reviews B1 to B9): Leaflet mocked down to layers and groups that say whether they are on the map, markers whose popup opens only there and tells the map before the layer (as Leaflet's), the circles drawn with their options; a page of `PageElement`s (attributes and `dataset`, the tree, simple selectors, bubbling clicks, the focus) with the document's own listeners (Escape, `visibilitychange`, which a test fires to have the list asked for again and drawn, `poll`); `fetch` answering `/api/parties` with the test's list; the theme, the list of what is on and the phone card stubbed (`fake.card`), and the hooks the party layer hands `raidUi` and `maxUi` taken as they are made (their `done`, `pickSpot`); route mode a stub of `trainUi`'s `spotClicked` (`fake.route`). It waits for each draw through `afterDraw`; its `started` takes an `activity` (`MapActivity`, plan 8M-10) to turn the region editor on and off under both pollers. The Power Spots' and PokéStops' dots (`showPlaces`) run over a Leaflet of dots and popups in `places-ui.isolated.test.ts`. Plan 8M-11B: the draw test records the lines drawn (`fake.shown.lines`, whose group says whether they are drawn now) and its map projects by a scale a test changes with `zoomedTo(pixels)`, which fires `zoomend` (a train's faint legs, its loop and its arrowheads); `train-line.test.ts` tests the legs and arrowheads over a projection of its own; `train-ui.isolated.test.ts` records the drag line (`dragLines`) and the held map (`map`: holds, held) for each way a drag ends; the gyms' layer (`showGymDots`) runs in `gyms-ui.isolated.test.ts` over a Leaflet of fakes that count the layers added to and taken off its group, the markers moved and a cluster's count written, with the party layer, `raid-forms`, `train-forms` and the theme mocked down to what it takes of them. The rest of Leaflet's side (`party-layer.ts`) is tried at staging, as `raid-ui.ts` is.
 - The pages' look (plan 8M-6): `src/web/page-theme.test.ts` reads the client's sources (`theme.css`, `map.css`, `editor.css`, the `.ts` files) and refuses a color written outside `theme.css`'s `:root` block, or a property used or drawn that it does not define, and checks that its light and dark sets name the same values and that every page's stylesheet imports it (plan 8M-7); `theme.test.ts` reads a theme through a fake reader (`readTheme`) and a change of scheme through a fake `matchMedia` (`ThemeWatch`). It lives outside `src/web/client/` because the client's type check has no Node.
 - `WebSessionRepository` and `MemoryWebSessions` run the same cases (`webSessionCases`, `test/support/web-session-cases.ts`). The pages' own code is tested in its pure parts (`src/web/client/*.test.ts`: the popup as a tree of nodes, rendered into a fake document; the filter; the tile layers; the header; the editor's counts, labels and reasons, the words of a fix, the worker's `CoverageChecker` with its fixes, the staged edits in a storage that may throw; the parties' popups and items, the raids of a gym under its one marker, the spawn form, its body and the regions of a point, the read-only line, countdowns and times, a press with its stale token, and the `Poller` over timers a test runs by hand (whether it asks is its `active()`, the page's `MapActivity` since plan 8M-10: visible and the region editor off); the region editor's toggle over a fake document and a fake mount (`editor-toggle.test.ts`, plan 8M-10); the reports at stops' popups, list, filters and forms over the cases of `src/web/client/stop-report-cases.ts`, plan 8M-9B, which the page never imports); Leaflet, Geoman, the worker in a browser, the real tiles, the parties' markers and the polling are tried at staging.
 
diff --git a/docs/architecture/trains.md b/docs/architecture/trains.md
index 45b17d6251d94920d87cdf633b938ada50ab68ec..839c80ff6341f4ec022c99ff7f7bfa271243c12d 100644
--- a/docs/architecture/trains.md
+++ b/docs/architecture/trains.md
@@ -15,7 +15,7 @@ The third kind of party: a route of gyms and Power Spots, a kind (raids, Dynamax
 - What the commands do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs` for `/train`, `addStopAs` … `forgetRouteAs` for `/route`, `moveTrainAs` for the four moves, `setConductorAs`, `clearConductorAs`; `manageTrainAs` is Manage…'s Submit (plan 8M-8C: moved out of `move.ts`, so that the dialog and the map's form share it, with `manageRefusal`, `movedOnWords` and `splitRefusalFor`; the map's panel's `reverseRouteAs`, `setAtEndAs` and `setKindAs` are gone with that panel, and `TrainService.reverse`, `setAtEnd` and `setKind` with them)), answering a `TrainAnswer` in the command's words; the commands throw a refusal as a `UserError`, the live map answers it (plan 8M-5). Move… and Manage… answer in the commands' words too (plan 8X-G). `startTrainAs` makes the train with its start when one is given (the map's form: `TrainRequest.startTime`, `NewTimedParty.startTime`), so that its post and the new-train DM say it from the first; `notSignedUpWords(where)` is the clause `/train` and the map add for a maker not signed up. `setConductorAs` names the conductor it took over from by the caller's `ConductorNamer` (`DISCORD_CONDUCTOR`, `memberText`, on Discord; the map names nobody).
 - A movement is announced in one message that pings the signed-up members who allow `mentions` and `mentionsTrainStops`, never the mover, gathered for five seconds and worded by the gym the train started from and where it is when the message goes ("back" only when every step was Previous; nothing when it is where it started or the route was emptied; "going round again, back to …" or "turning back at …, on to …" when the last step went round the end or turned back and the train is where it took it: `Movement` kinds `round` and `turn`, `PendingMove.lastFrom`). A gym or a Power Spot is a stop only when it lies in a region of the train's server (`reaches`, `stopRegionsInGuild`).
 - What is said once a few seconds after the last change goes through `Gathered` (`src/services/gathered.ts`: `later(key, merge)`, `drop`, `flush`, with `fold(older, newer)` for an entry whose turn comes while another waits behind a slow send): the start of a timed party and a train's movement. The party services share `storedChange` (`src/services/party-change.ts`) for a change decided inside the store.
-- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), Manage…'s menu (plan 8X-G; Manage… opens only for who may move the train and staff, so `setAtEnd`'s `mayArrange` matters for a dialog opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so Manage… (on Discord and on the map) also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
+- What a train does at the last stop of its route is `train.atEnd` (`TRAIN_AT_END`: `finish`, `loop`, `turn-back`; `TrainAtEnd`, `isTrainAtEnd` in `party.ts`), set by `/train`'s option `at-end` (default `finish`), Manage…'s menu (plan 8X-G; Manage… opens only for who may move the train and staff, so `setAtEnd`'s `mayArrange` matters for a dialog opened earlier and for saved routes; `setAtEnd`: for whoever may arrange the route, `mayArrange`, and staff, since it never moves the train nor un-finishes a route; the same mode is the same object; the line names the doer through `doer`) and a loaded saved route. A route of fewer than two stops finishes in every mode (`endMode`, exported since plan 8M-11B for the live map's `MapTrain.atEnd`, by which the map draws the line's arrowheads and a loop's closing leg). `destinationOf(party, move)` is where a move leaves the train (`route`, `stop`, `turn`, `skipped`): Next at the last stop finishes, goes to stop 0 (`turn: 'round'`) or stores the route reversed and goes to its index 1 (`turn: 'back'`); Skip goes round a loop (`(stop + 2) mod n`, three stops or more) and at the last stop of a turn-back to index 2 of the reversed route (refused at its second to last stop); Previous at stop 0 of a loop goes to the last stop, of the others is refused. A move that goes round or turns back is a movement and never finishes the route, and neither does removing the current last stop of a loop or turn-back train with two stops or more left (`removeStop`: a loop goes to stop 0, a turn-back train has the rest reversed and stands at its index 0); Finish finishes in every mode. `nextStop` and `turnAhead` say what Next does from where the train is. `reverseRoute(party, member, staff, from?, first?)` (`cannotReverse`: a loop at any stop, a route that finishes at its first or last stop; a finished route of either mode only when finished from its last stop, which starts it again there, else `reverse-finished-elsewhere`; never a turn-back or a route of one stop) puts the same gyms in the other order with the train at the same gym: no movement, Here stays Here, the mode stays, said in a line without a ping ("…, and starts again at X" for a restart). Reverse leaves `placeOf` as it was (except the restart of a finished route, which moves it from `end` to the gym), so Manage… (on Discord and on the map) also carries `first`, the gym the route began with (`route-changed` otherwise). The post's line of what lies ahead says the mode on a route of three stops or fewer (`, loops` / `, turns back at the end`, on two stops or more) and marks a stop past the end `(round again)` / `(turning back)`; after a turn or a Reverse the stops are numbered in their stored order. The words of the modes are `src/render/train-words.ts`.
 
 ## The post, Move… and Manage…
 
diff --git a/docs/architecture/web.md b/docs/architecture/web.md
index ee9571bf237602a5677d967eb99724db72de7492..a9b62d774033990a67c1a6ae01b6efe558320780 100644
--- a/docs/architecture/web.md
+++ b/docs/architecture/web.md
@@ -4,7 +4,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 
 ## Settings, secrets, start and stop
 
-- Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (plan 8M-7: `stadia`, the default, Stadia Maps' Alidade Smooth with OpenStreetMap's to fall back to; `osm`, OpenStreetMap's alone; or `google`, Google's beside Stadia's; no key for Stadia: it checks the page's domain, `localhost` passes; `docs/web-setup.md`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
+- Off unless `settings.web` is set (`src/config/settings.ts`, strict): `port` (required), `host` (default `127.0.0.1`; `0.0.0.0` in a container), `publicUrl` (the address every link points at: `https:`, or `http:` only for `localhost`, `127.0.0.1` or `[::1]`; the root of its host, kept without the slash: append a path as it is), `trustProxy` (default false), `tiles` (plan 8M-7: `stadia`, the default, Stadia Maps' Alidade Smooth with OpenStreetMap's to fall back to; `osm`, OpenStreetMap's alone; or `google`, Google's beside Stadia's; no key for Stadia: it checks the page's domain, `localhost` passes; `docs/web-setup.md`), `memberRole` (a role's name; blank or absent is unset: see "Who sees what"), `invites` (plan 8M-11B: a server's id to the invite its admin chose, `https://discord.gg/<code>` or `https://discord.com/invite/<code>`, a vanity code too, letters, digits and hyphens and nothing after it, `INVITE_ADDRESS`; a blank one is none, absent none for any server; see "The fix pass: trains and clusters"). An invalid `web` object stops the start like any setting. Pine serves plain HTTP; TLS and the way in (a tunnel, a proxy) are the operator's.
 - Secrets are in the environment, blank is unset: `DISCORD_CLIENT_SECRET` (without it there is no "Log in with Discord"; the links of `/maps` work) and `GOOGLE_MAPS_BROWSER_KEY` (Google's tiles; without it `tiles: 'google'` shows Stadia's, `shownTiles`, `src/web/headers.ts`). `configWarnings` says both at the start. The browser key reaches the page (it is restricted by referrer); `GOOGLE_API_KEY` never does.
 - `buildWebServer(deps)` (`src/web/server.ts`) builds the Fastify instance from what it is given explicitly (`WebDeps`: settings, the picture origins, the browser key, the servers the bot is in, the member directory, `Sessions`, the OAuth gateway or undefined, `LoginLinks`, `GeoCache`, the bundle, the region editor's `EditorDeps`, the live map's parties `PartyWebDeps`, its raids `RaidWebDeps`, its spawns `SpawnWebDeps`, its trains `TrainWebDeps`, its meetups `MeetupWebDeps`, its max battles `MaxWebDeps`, its reports at stops `StopWebDeps`, the application emoji's pictures `emoji` (plan 8M-8A), a clock, the logger); tests ask it through `inject`. `startWebServer` (`src/web/start.ts`) listens: a port it cannot take is logged at error and the bot runs on without its pages. `src/app.ts` builds the server after the login and starts it once the client is ready; the first shutdown step closes it, so no page starts a change while the bot is going: from that step on `EditorDeps.closing()` is true, and the editor's preview and save answer 503 "Pine is shutting down: try again in a few minutes.", also a save that was being checked when it began (`admin.save` is never started then).
 - Fastify's own logger is off. Every request is logged at debug by `method`, its route pattern (`/auth/link/:guild/:token`, never the address it was asked with, which may carry a token or code), `status` and `ms`. Never log a token, cookie, OAuth code, CSRF token, secret or the query string of `/auth/*`; a failure is logged as `{ err }` with the route.
@@ -37,7 +37,7 @@ The HTTP server in the bot (`src/web/`, plans 8M-1 to 8M-6; spec `docs/superpowe
 - `GET /s/<guild>/api/geo` is public: `geoView` (`src/domain/web/geo-view.ts`, pure; its types in `geo-data.ts`, which has no imports so the page can take them) gives the server's regions with an outline (named by their channels as the bot sees them, by their number where it sees none) and the gyms that lie in them (regions, address line, description, notice; places to six decimals; no elite raid gym mark, which Matt took out of everything members see, 2026-10-17: `isEliteGym` and the data stay). Gyms in no region of any server are left out. `GeoCache` (`src/web/geo-cache.ts`) keeps each server's JSON with a strong ETag (the SHA-256 of the JSON, cut) and builds it anew when `GymDirectory.generation` or `RegionDirectory.generation` changed (every load, gym re-read or forget) or a region's channel was renamed; an `If-None-Match` that names it is answered 304 (`etagMatches`: a list of tags compared weakly, `W/` ignored, or `*`), `Cache-Control: no-cache`.
 - The page `/s/<guild>/map` is a static template (`mapPage`, `src/web/page.ts`) that loads the bundle's script and style; what the page needs is in escaped `data-` attributes of `<body>` (`data-guild`, `data-tiles`, `data-google-key` only with Google's tiles, `data-login` `discord | links`; since plan 8M-10 the region editor's `data-editor-script`, `data-editor-style` and `data-worker`, and its hidden hosts, below). Without a built bundle it answers 503 saying `npm run web:build`.
 - The pages' code is `src/web/client/` with its own `tsconfig.json` (the DOM; the root config excludes the folder), bundled by `scripts/web/build.ts` (`npm run web:build`, also run by `npm run build`) with esbuild: IIFEs for ES2022, minified, into `dist/web/assets/` with hashed names: the map (`map-<hash>.js`, `map-<hash>.css` with Leaflet's CSS, Leaflet's pictures), the region editor (`editor-<hash>.js` with its own Leaflet and Geoman, `editor-<hash>.css` with Geoman's CSS, an add-on of the map's stylesheet, and its worker `editor-worker-<hash>.js`; since plan 8M-10 loaded by the map's page when the editor is first turned on); `dist/web/assets.json` names each page's script and style and the worker (`AssetManifest`: `map`, `editor`; read at start by `readAssets`, which takes a manifest of an older build as none). What both pages share (the tiles with Google's layers, the header and its login, reading JSON) is `src/web/client/common.ts`. The rest of `dist/web/` is the compiled server code; the build empties only `assets/`. `/assets/` (`@fastify/static`) serves that one flat folder: no index, no listing, plain file names only; a hashed name `public, max-age=31536000, immutable`, anything else `no-cache`.
-- The page: Leaflet; the tiles of `data-tiles` (`addTiles`, `src/web/client/common.ts`, over `tileLayers`, `src/web/client/layers.ts`, plan 8M-7): Stadia's Alidade Smooth in light and Alidade Smooth Dark in dark (`https://tiles.stadiamaps.com/tiles/alidade_smooth{_dark}/{z}/{x}/{y}{r}.png`, credited "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors" with links, `STADIA_ATTRIBUTION`), drawn anew in the other style when the device changes between light and dark; once Stadia refuses its tiles (three failed in a row with none loaded between, or the first two of the visit: a 401 on a domain it does not know, a 429 past the month's credits; the page cannot tell which, and a tile that loads starts the run again) OpenStreetMap's for the rest of the visit, once (`StadiaFallback`), drawn to zoom 20 with its own pictures enlarged past 19 (`maxNativeZoom`); the credit is the page's own, of the base shown alone (`BaseAttribution`: OpenStreetMap's replaces Stadia's at the switch, none while a Google layer is chosen); OpenStreetMap's alone for `osm`; OpenStreetMap's in dark are darkened by the class `tiles-darkened` on the map's container (a filter of `map.css` on the tile pane: invert, hue turned half round, a little less brightness, contrast and saturation; only while OpenStreetMap's base is shown, never on Google's); with Google's tiles a layer switch (the base first, then roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names below zoom 15 only, where they help to find a region (`regionLabelsShown`, `LABELS_BELOW`, fix round 1; from zoom 12 on before); gyms as dots, all in one color; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server."). `?login=failed|expired` is taken out of the address at once and said once `/api/me` answers, only to somebody logged out (`loginNoticeFor`, 8M-7 review fix 5: Back after a link login, or an old link opened while logged in, lands on `?login=expired` with the member's name in the header), on the map and in the region editor alike.
+- The page: Leaflet; the tiles of `data-tiles` (`addTiles`, `src/web/client/common.ts`, over `tileLayers`, `src/web/client/layers.ts`, plan 8M-7): Stadia's Alidade Smooth in light and Alidade Smooth Dark in dark (`https://tiles.stadiamaps.com/tiles/alidade_smooth{_dark}/{z}/{x}/{y}{r}.png`, credited "© Stadia Maps © OpenMapTiles © OpenStreetMap contributors" with links, `STADIA_ATTRIBUTION`), drawn anew in the other style when the device changes between light and dark; once Stadia refuses its tiles (three failed in a row with none loaded between, or the first two of the visit: a 401 on a domain it does not know, a 429 past the month's credits; the page cannot tell which, and a tile that loads starts the run again) OpenStreetMap's for the rest of the visit, once (`StadiaFallback`), drawn to zoom 20 with its own pictures enlarged past 19 (`maxNativeZoom`); the credit is the page's own, of the base shown alone (`BaseAttribution`: OpenStreetMap's replaces Stadia's at the switch, none while a Google layer is chosen); OpenStreetMap's alone for `osm`; OpenStreetMap's in dark are darkened by the class `tiles-darkened` on the map's container (a filter of `map.css` on the tile pane: invert, hue turned half round, a little less brightness, contrast and saturation; only while OpenStreetMap's base is shown, never on Google's); with Google's tiles a layer switch (the base first, then roadmap, satellite, hybrid: a session per layer from `createSession`, 2D tiles, the attribution of what is in view from `viewport` after the map rests, shown with "Google Maps"; `src/web/client/layers.ts`). Regions as outlines with their names below zoom 15 only, where they help to find a region (`regionLabelsShown`, `LABELS_BELOW`, fix round 1; from zoom 12 on before); gyms as dots, all in one color; a popup per gym built as a tree of nodes and rendered with `textContent` only (`gymPopup`, `renderNode`): never HTML from data. Leaflet treats string content as HTML (tooltips, popups, attributions, the layer switch's names): data goes to it as nodes (`renderNode`; a region's label is `regionLabel`), and the only strings it is given are constants of ours and the escaped copyright of `googleAttribution`. The filter box hides gyms whose name and nickname lack a word typed (`gymFilter`: no case, accents or apostrophes) and fits the map to the matches on Enter. The header: "Log in with Discord" (only with the secret) or "Use /maps in Discord to log in.", or the member's name, Log out (a POST with the CSRF token; `logOut`, `src/web/client/logout.ts`: on a 403, the token of a page loaded before a restart, it asks `/api/me` again and tries once more, a session gone by then counting as logged out; only a 2xx is logged out, so a second refusal, any other status or a broken connection says "Log out failed; try again.") and why they see only the public map (`headerLines`, `src/web/client/notice.ts`: Discord away; for `missingRole` "You can look around the map. To join or report here, you need the Verified role in this server."; else "You are not a member of this server.", `NOT_A_MEMBER`, with "Join the server on Discord" under it where `/api/me` gives the server's `invite`, plan 8M-11B). `?login=failed|expired` is taken out of the address at once and said once `/api/me` answers, only to somebody logged out (`loginNoticeFor`, 8M-7 review fix 5: Back after a link login, or an old link opened while logged in, lands on `?login=expired` with the member's name in the header), on the map and in the region editor alike.
 
 ## The map's frame (plan 8M-7)
 
@@ -48,7 +48,7 @@ Design `docs/superpowers/specs/2026-10-25-web-map-polish-design.md` ("The page's
 - **`/maps` names its region:** used in a region's channel or its forum (`regionChannelOf`), `/maps` puts the region's id in the map's address it shows (`/s/<guild>/map?region=<id>`) and in its login link (`LoginLinks.issue(…, 'map', region)`, `LinkHolder.region`); the link's POST redirects to `/s/<guild>/map?region=<id>` (an id of ours, never of the request); an expired link lands on the whole map (`?login=expired`).
 - **Your location** (`you-ui.ts`, `showWhereYouAre`; words in `your-location.ts`): "Show where I am", a round button with a crosshair (SVG of ours, `currentColor`) at the bottom right, asks the browser only when pressed (`watchPosition`, high accuracy), draws a blue dot (`--you`, edged `--you-edge`, drawn colors of `theme.ts`) with a circle of its accuracy, centers the map on it at street level or closer, and keeps it current while the page is open; pressed again it centers on the dot. Refused or unavailable: one line under the header (`locationRefusal`: "Your browser did not share your location.", "Your location is not available just now.", or "This browser cannot share your location with this page." where there is no geolocation or the page is not a secure context; browsers count `http://localhost` as one), nothing else. `onMove` tells the list each new fix.
 - **Layers** (`layer-registry.ts`, `LayerRegistry`): everything drawn is a layer the member toggles, registered with a name, whether it is on by default, live (a toggle of its own on the desktop) or background (under "More"), a line about it, members only (`membersOnly`) or waiting for data (`waits`), and how many of its things are in view (`setCount`, which the parts that draw it keep current at each `moveend` and draw). One call adds a layer (`register`; field research and Team GO Rocket came so with 8M-9B). The layers of `MAP_LAYERS`: Raids, and since plan 8M-9B Field research and Team GO Rocket after Meetups (below, "Reports at stops on the map's page"); Raids (max battles too since plan 8M-9A: the toggle keeps the name "Raids", since "Raids and max battles" broke the desktop's one row at 768 pixels; its line in the phone's sheet says "Bosses, eggs and max battles", and the list's group is "Raids and max battles"), Trains, Meetups (live, on), Wild spawns (off; it waits for data: no route lists spawns yet, so it is not offered until something calls `setOffered('spawns', true)`), Gyms (off since plan 8M-9A: the Report button's step 2 draws the gyms to pick from whatever the layer says; on until then, the controller's ruling of fix round 1 of 8M-7, while "Report raid" was in a gym's popup alone; a browser that kept the layer on keeps it on), PokéStops, Power Spots (off), Region outlines (on). The choice is kept per browser, one for every server (`localStorage` `pine-map-layers`, `{ id: boolean }`, read and written in try/catch; a value that is no boolean is ignored, a layer the browser kept nothing of takes its default). The controls (`layers-ui.ts`): on the desktop a row in the header (`<nav id="layers">` of the template) with the live layers as labelled toggles (`aria-pressed`, a dot of the layer's color) and the background ones as checkboxes under "More" (a `<details>`); narrower than 1024 pixels (`map.css`; 768 until plan 8M-9B, B7, provisional: five live toggles, "Research" and "Rocket" short in the row with their names in the sheet and the toggle's title, fit from 1024) a "Layers · n" button (`layersButtonLabel`, n the offered layers on) that opens a bottom sheet listing every offered layer with its line, how many are in view ("4 in view", `inViewWords`) and a switch (a checkbox `role="switch"`), Done and a tap on the scrim closing it; the sheet is a modal dialog for the keyboard (`SheetFocus`: `aria-modal`, the focus moved to its first switch, Tab and Shift+Tab kept inside it (from its last control to its first and back, and from outside it in: 8M-7 review fix 9), Escape closes it, the focus given back to the button), each switch named by its layer (`switchLabel`, `aria-label`), and "More" closes on Escape and on a click outside it (`moreCloses`). Logged out (or not a member), PokéStops and Power Spots are not offered (`offered(spec, member)`); the controls are drawn anew once `/api/me` answers (`refresh`).
-- **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one 60-pixel cell of a grid fixed on the world are one cluster, drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<cell>:<its gyms>`) and only the difference added or taken off at each move, list or change (`dotsDiff`): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
+- **What each layer draws:** the parties' popups and markers as before (`party-layer.ts`), now in a group per layer (`raids`, `trains`, `meetups`) put on and taken off the map by the registry; the regions' outlines with their labels (`main.ts`; the labels on a pane of their own, `region-labels`, at 350 under the overlay pane of the outlines and of the gyms', stops' and spots' circles and under every marker (round 2), taking no clicks, in 12 px type, so that a name never covers a raid or a gym); the gyms (`gyms-ui.ts`, `showGymDots`) at every zoom, by Pine's grid clustering below zoom 16 (`cluster.ts`, `clustersAt`, `CLUSTER_BELOW`: the places of one cell of a grid fixed on the world are one cluster, the cell 60 pixels from zoom 15, 90 at 13 and 14, 120 at 12 and below (`cellPixels`, plan 8M-11B), drawn as a circle with its count at the middle of its places, `.cluster`, `--cluster`; a tap zooms in on it, at least two zooms and at most to 16; Leaflet.markercluster's last release is from 2020); what is drawn is worked out for the view and half its size round it (`wantedDots`, `DOTS_MARGIN`; keyed `gym:<id>` and `cluster:<zoom>:<cell>`, plan 8M-11B) and only the difference touched at each move, list or change (`planDots`: a cluster whose gyms changed changes its count and place in place, one no longer wanted gives its marker to a new one, the rest is added or taken off): the gym whose popup is open is never taken off nor clustered while it is open (fix round 1); which gyms are drawn is `shownGyms` (`gym-dots.ts`): every gym while the Gyms layer is on, or while a gym is to be clicked (route mode, a meetup's place picked, the Report button's step 2 of a raid: `MapRaids.forced`, the gyms drawn anew after each draw of the parties), and while "Find a gym" holds a word those it matches whatever the layer (Enter fits the map to them and opens the one gym's popup once the map rests); the PokéStops and Power Spots of the view (`places-ui.ts`, `showPlaces`) for a member from zoom 16 (`placesWanted`, `PLACES_FROM`) through `/api/stops` and `/api/powerspots`, asked at once when wanted and again 300 ms after the map rests (`PlacesInView` over `StopLoads`: only the last question's answer shown, nothing after they are no longer wanted), small dots of `--stop` and `--power-spot` with the name in a popup (a Power Spot's popup also offers "Report max battle here" since plan 8M-9A, below, "Max battles on the map"; a spot whose battle is drawn is left out, `unoccupied`, drawn again from the last answer as the parties change, `ShownPlaces.redrawn`; while the Report button's step 2 picks them they are drawn whatever the layer, `placesWanted`'s `forced`, `MapRaids.forcedPlaces`), and "more than shown" in one quiet line at the bottom left of the map ("Zoom in to see every PokéStop here.", `MORE_THAN_SHOWN`, `quietLine`). Live things never cluster.
 - **Raid markers** (`raid-marker.ts`, frame B of the mockups): a circle centered on the gym, named for a screen reader by the lead raid's `heading` (the marker's `title`, 8M-7 review fix 9) (`raidMarkerNode`, drawn as an element of ours in a `divIcon`, `raidIcon`, 44 pixels): the post's picture (the boss, or the egg of its tier before it hatches) in a ring of its tier group's color (`MapRaid.tierGroup`, made by the domain's `raidTierGroup` of `src/domain/pogo/raid-tier.ts`: `1`, `3`, `5`, `mega` for Mega, Mega Legendary and Super Mega, `elite`, `shadow` for every shadow raid; `tierColour` names `--tier-<group>`; `raid-marker-tiers.test.ts` holds `theme.css` and `map.css` to every group of `RAID_TIER_GROUPS`), a time badge under it (`badgeFor`: "12 min", "1 h 05" while it runs (`durationWords`' compact form, plan 8M-11A), "hatches 2:40" before the hatch, the posts' time by `clockTime` with AM or PM left out today only, "hatches Wed, Oct 14, 2:00 PM" another day; "Egg" or "Hatched" where nobody said when, "Ended" by `stageAt` (capitalized since plan 8M-11A, S5)), and a green count of those going (`MapAttendance.going`, made by the domain's `goingCount` of `party.ts`: the committed heads of the whole party, coming, here and asked whether done, +1s counted, the lobbies' own rule that `lobbyCount` shares; none at zero). Raids shrink as the map zooms out and are still never grouped (Matt, 2026-10-25; `markerSize`): from zoom 15 the full marker (`--raid-full`, 44 px, with its badge and count), at 14 a smaller circle with the count and no badge (`--raid-middle`, 30 px), at 13 and below a small circle with the boss picture in its ring and no badge or count (`--raid-small`, 20 px); sizes are named values of `theme.css`, read by `theme().sizes` for what Leaflet draws; the tap target is never under 32 pixels (`tapBox`, a clear margin round a small circle), the train's and meetup's rings round a raid scale with its circle (`ringSizes(circle)`), and a zoom into another size draws the parties anew. Nearly over, it is dimmed (`isDimmed`: hatched by the clock, `stageAt` of `src/domain/party/raid-stage.ts`, which `raidStage` reads raids through, and `endsSoon` of `src/domain/time/ending-soon.ts`, the five minutes `/max`'s ending-soon question asks by: one rule). The page keeps badges and dimming current every 15 s from the times on the marker (`data-stage`, `data-hatch`, `data-end`; `markerNow`, by the same rules as at the draw), an egg turning into its time left as it hatches. One source for every fact (Matt, 2026-10-25): what the page shows or decides of a party is computed by the domain code the Discord side uses, sent with the list or imported from a pure module of `src/domain/` that imports nothing (`raid-stage.ts`, `ending-soon.ts`), never a second implementation; only the words are the page's. A gym with a raid shows the raid, not its gym dot, while the Raids layer is on (`hiddenGyms`, `MapRaids.raidGyms`); off, the dot is back. Trains and meetups keep their drawing (rings, a line), restyled; at a gym whose raid circle is drawn, their rings go round it rather than over the boss (`ringSizes`: the train's just outside the 44-pixel circle, radius 26, the meetup's outside the train's, radius 31; the old sizes elsewhere, and again when the Raids layer is off). A gym of several raids is drawn by one lead raid, the first with a picture, else the first (`leadRaid`): picture, ring, badge and count are all that raid's. A raid is named everywhere on the map (its popup, the list, the list of things at one place) in its post's own heading words, `MapRaid.heading` (`raidLook` over the renderer's `headlineParts`: `Level 5 raid against Yveltal`, `Level 5 raid (egg)`, without the shiny mark; the tier's words where the renderer gave none), and its popup reads its stage by the clock (`stageAt`), not the list's `stage`.
 - **Several things at one place** (`shared-place.ts`): when more than one shown thing sits at the same place (the same gym, or within 12 pixels at the current zoom, `sharedPlace`, `SHARED_PIXELS`; a raid marker, a max battle's marker (the raids' layer, plan 8M-9A: at its Power Spot, whose own dot it replaces, or at its pin), a train's ring, a meetup's ring, and a gym's dot tapped where parties share it, `MapRaids.gymTapped`), a tap on any of them opens one popup listing each (`placeListNode`: picture, name, time: the lead raid's `heading` and badge, a battle's `title` and badge, a train's or meetup's `startWords`), and a choice (`data-open`) opens that thing's own popup as before. A layer turned off takes its things out, and the overlap with them. This replaces the tap on a ring's line of the 8S-4 staging: the rings still take clicks on their line alone, but a tap on what they ring lists them.
 - **The list of what is on** (`what-is-on.ts`, pure; drawn by `list-ui.ts`, `WhatIsOn`; plan 8M-7, replacing the side panel "Meetups and other parties"): on the desktop the side pane on the right (`#parties`, "What is on"), under the trains' box; on a phone the header's "List" button (`#list-button`, `body.list-open`) swaps the map for it and back (its words say what a press shows next, "List" or "Map", with no `aria-pressed` beside them: 8M-7 review fix 9). It holds every live thing the layers on show across the whole server, not only what is in view (`listLines`: raids and, since plan 8M-9A, max battles in one group, "Raids and max battles", a battle named by its post's `title`, Soonest by its end, its key `max:<id>`; trains, meetups; wild spawns once a route lists them), grouped by kind in that order, each group headed with its count (`listGroups`: "Raids and max battles · 5"), under "What's going on · n" (`LIST_HEADING`, plan 8M-11A, S22; the logged-out pane and the pane's `aria-label` too). A line (`lineWords`, a button): the picture (a ring of the kind's color without one), the name (`raidName`, a train's or meetup's), the place (a raid's gym, as the map has it or as its post names it; a train's `stopLine`; a meetup's words), the distance (from your location, else the map's middle; none without a place), the time ("30 min left" by `timeLeft` over `durationWords`, plan 8M-11A; "hatches 2:40 PM", `startWords`), "4 going" (`MapAttendance.going`); dimmed in a raid's last minutes (`isDimmed`). Sort, kept per browser (`localStorage` `pine-map-sort`, try/catch, `readSort` / `writeSort`): Nearest (the default), Soonest (a raid's end, a train's or meetup's start; none last), Most going; ties by name, and what has no point at all last in its group whatever the sort. Tapping a line whose thing the map draws (its layer on) flies the map there (street level or closer) and opens its popup once the map rests (on a phone, back to the map first, `PartyFrame.showMap`); a thing the map does not draw (a train without a route or with none of its stops on the map, a raid at a gym the map does not show, a meetup without a place) shows its popup under its line instead (`detail`: `raidPopup`, `trainPopup` with its actions, `meetupPopup` with Edit…, as the side panel showed them). Hovering a line on the desktop highlights its marker (`highlighted`: a ring round a raid's circle, a thicker line for a ring). A form that opens in the side pane (the start form, route mode, a meetup's form or editor) is shown over the list, which comes back when it closes (`paneShows`). Drawn anew with each list and a change of sort; a move of the map, a change of layers and a new fix of your location (only sorted Nearest, and only once it moved more than 25 m, `fixRedraws`) draw it too, but never while a form holds: then once, when the form lets go (`ListRefresh`, fix round 1). A line shown with its popup under it is kept by its key (`WhatIsOn.kept`): drawn anew for a move, a fix or a change of layers, only its own words change and its popup (a group menu, a field) stays, the focus given back where it was (a control drawn anew is found again by its tag and `data-` attributes, `sameControl`: a line's button by `data-key`, its line's key, the sort by `data-sort`; a control with no `data-` attribute is not looked for, so the focus never jumps to the first line, 8M-7 review fix 2); drawn from a new list (`show`), its popup is drawn anew from it (counts, "You:", buttons), the group chosen in its menu kept while that group is still offered and the focus given to the control of the same kind (round 2); a change form opened in such a line takes the hold with its `alive` (`FormHold.take(…, alive)`), so that the hold lets go whenever the form goes away (`checkGone`, after each drawing of the list and with each new list). Whether a form of the pane's box holds is recomputed as a form takes the hold or lets it go (`FormHoldDeps.changed`, `asideHeld`); on a phone such a form, which needs the map (route mode, a meetup's place picked, any form of the box), shows the map with the pane docked under it, 40% of the screen, whatever "List" says (`body.form-docked`). The phone's header is one row: the title, Layers, List, a "Find" button that opens "Find a gym" over the map (`#search-button`, `body.search-open`; Escape closes it, and closing it empties it, so that no word filters the map unseen) and the account (the member's name, cut to fit, its menu holding Log out; logged out, the login says "Log in" with the buttons' smaller padding, its two wordings spans of which `map.css` shows one, while the pane's own button keeps "Log in with Discord": 8M-7 review fix 4, `src/web/phone-header.test.ts`), none of them wrapping; what the header says beside the account goes under it. Tried at staging on a phone: List swaps the map for the list and back, a tap on a line returns to the map at the thing, a form of the pane docks under the map. Logged out, the pane says "Log in to see what is on." with "Log in with Discord" (or how to log in with `/maps`); logged in without counting as a member, "Only members of this server see what is on." (`loggedOutPane`).
@@ -135,7 +135,7 @@ Brief `.superpowers/sdd/2026-10-27-phase-8m8c-train-controls/design.md` (its "Af
 ## Trains on the map (plan 8M-5)
 
 - **One code path per command** (spec 3.5, 3.7): what `/train`, the `/route` subcommands, `/next`, `/previous`, `/skip`, `/finish` and `/conductor` do beyond reading their options is one function each in `src/commands/trains/train-changes.ts` (`startTrainAs`, `addStopAs`, `removeStopAs`, `moveStopAs`, `clearRouteAs`, `saveRouteAs`, `loadRouteAs`, `forgetRouteAs`, `moveTrainAs`, `setConductorAs`, `clearConductorAs`; `TrainAnswer`: `ok`, `refused` with the service's reason, `gone`), in the command's words; the commands throw a refusal as a `UserError` and reply with the text, the map answers them. The map's Move…, Manage… and Split… are the post's dialogs, over their Submits' own functions (`moveTrainAs`, `manageTrainAs`, `splitGroupAs`; plan 8M-8C, below). The web server is given what the commands read and call (`TrainWebDeps.ctx`, `TrainWebContext`: the bot's context in `src/app.ts`) and the channel names the bot sees (`channelName`).
-- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `moves` (plan 8M-8C, R1: Move… as the post's dialog draws it, `moveForm` of `src/render/train-dialogs.ts` through `movesOnTheMap`, `src/web/train-views.ts`, given to the pure view as `PartyViewInput.trainMoves`: where the train is, `placeOf`; the dialog's text in the map's words; "Where to" and the moves `offeredMoves` makes, each with where it leads, `targetOf`, its label and the line under it; none for who may not move the train, a train without a route, or while read-only, `trainMovesOf`), `ahead` (plan 8M-8C, R3: what lies ahead as the post's small print says it, `aheadText` over `aheadLine`, `PartyViewInput.trainAhead`; the page words no turning or looping of its own), `moveRefusal` (why the member may not move it, with the words of Discord's refusal, `refusalOnTheMap`: Move…'s and Manage…'s line), `mayManage` (whether Manage… opens, `mayManageOf`; branch review B2); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The kind and the mode are Manage…'s (below, "A train's dialogs as forms"). The route is the version of the route (below). Nothing of it while read-only.
+- **The view:** `MapTrain` (`party-data.ts`) carries, besides 8M-3's name, start, route and stop, what the member may do on the map, decided by the domain's own rules (`party-view.ts`, pure): `may` (`trainRights`: `arrange`, add, remove and move stops, `mayNotArrange`; `clear`, the conductor and staff, staff here as `/route clear` has it, bot developers included, `PartyViewInput.botStaff`, `isMapBotStaff`; `load`, `mayNotLoad`: who may move the train, or the maker its first route), `moves` (plan 8M-8C, R1: Move… as the post's dialog draws it, `moveForm` of `src/render/train-dialogs.ts` through `movesOnTheMap`, `src/web/train-views.ts`, given to the pure view as `PartyViewInput.trainMoves`: where the train is, `placeOf`; the dialog's text in the map's words; "Where to" and the moves `offeredMoves` makes, each with where it leads, `targetOf`, its label and the line under it; none for who may not move the train, a train without a route, or while read-only, `trainMovesOf`), `ahead` (plan 8M-8C, R3: what lies ahead as the post's small print says it, `aheadText` over `aheadLine`, `PartyViewInput.trainAhead`; the page words no turning or looping of its own), `moveRefusal` (why the member may not move it, with the words of Discord's refusal, `refusalOnTheMap`: Move…'s and Manage…'s line), `mayManage` (whether Manage… opens, `mayManageOf`; branch review B2); `route` the stops' keys and `spots` the Power Spots of the route Pine keeps with their names and places (`PartyViewInput.spotOf`, plan 8X-4), which the line, the ring, route mode's numbers and the popup (`<title> (Power Spot)`, Directions) go through; `trainKind` and `trainKindWords` (plan 8X-5: what it goes to, as `TRAIN_KIND_WORDS` names it, `Max Battle Train`; not `kind`, which says that the party is a train); `atEnd` (plan 8M-11B: what it does at the last stop as the domain applies it, `endMode` of `train.ts`: a route under two stops finishes whatever its mode); and `conductor` (`conductorOf`: `you`, `other` or none, never a name; `mayTake` for a member signed up who is not it, `mayDrop` for the conductor and staff). The kind and the mode are Manage…'s (below, "A train's dialogs as forms"). The route is the version of the route (below). Nothing of it while read-only.
 - **Starting a train** `POST /s/<guild>/api/trains`, body `{ region, name, time?, atEnd?, kind? }` (strict: any region of the server by id, as `/api/geo` lists it; the name up to `/train`'s 80 characters, blanks allowed so that they are refused in its words; the start as `/meet` takes it, up to 40; the mode as `/train`'s `at-end`; the kind as its `kind`, plan 8X-5, a raid train without one). Before the body is read (`onRequest`): 60 a minute per address (`TRAIN_WRITES_PER_ADDRESS_MINUTE`, shared by every write of trains) and `postGuard`. Then the session (403) and the body (400); who starts it (`actingOnTheMap`); the region (of this server, else 404, whatever the id); its forum (none: 422 in `/train`'s words, the region named `#name`, `Region <id>` without a channel; `barred` 403; Discord unreachable 503); what `/train`'s guard and `/meet`'s reader refuse (a blank name 422 "Give a name of 1 to 80 characters."; a time that is none, read by `typedTimedTime` over `newPartyTimes('train', now)`, a party not made yet, 422 in its words); only then `/train`'s throttle in its window; then `startTrainAs` as the member (privacy and automatic status as `/train`), the train made with its start (`TrainRequest.startTime`, `NewTimedParty.startTime`, floored to the minute as `/meet` floors it), so that its post and the DM of who asked to hear of new trains say it from the first. The answer (`TrainAnswer`): 200 `{ ok: true, text: "Your train is made. It starts at 6:15 PM. Tap gyms or Power Spots on the map to add its stops.", train }`, and for a maker who is not signed up (automatic status None) `/train`'s clause after it (`notSignedUpWords`: "You are not signed up for it, as your /settings auto-status is None: sign up in its popup or its post to move the train or to be its conductor."); a region that lost its forum meanwhile 422. Logged `{ user, guild, region, outcome }`, "a train was started on the map".
 - **The route** `POST /s/<guild>/api/trains/<id>/route/<edit>`, edit `add` (`{ drawn, stop }`: the stop by its key, `stopKey`, plan 8X-4: a gym's id or `w<Wayfarer id>`; anything else 400, a stop of no region of the server 404; the route editor adds the gyms clicked; before 8X-4 the body was `{ drawn, gym }` with `drawn` the gyms' ids as numbers, and a page opened before the update keeps its old bundle, whose edits are refused as malformed, 400, and which draws no train line or ring (it looks the stop keys up as gym numbers, so every train is listed as unplaced), until the member reloads it: nothing reloads the page by itself), `remove` (`{ drawn, stop }`), `move` (`{ drawn, from, to }`), `clear` (`{ drawn }`), `save` (`{ drawn, name }`), `load` (`{ drawn, route }`), `forget` (`{ route }`): stops by their numbers from 1, as `/route` takes them; a saved route by the id the list gave it. **The version of the route** is the route itself: every edit but `forget` carries the route it was drawn from (`drawn`, the train's `route` as the page had it), and `TrainService` refuses it inside the store when the route is another by now (`routeDrawn`, reason `route-edited`, "The route changed meanwhile: here it is as it is now.", 409 with the train as it is now; a save is checked against the store's train before it writes); the commands give none, so they work as before. The order: the per-address limit, `postGuard` and an edit the map knows (404) before the body; the session and the body; who edits; an active train of this server as the store has it (anything else, a meetup's id among them, 409 "This train is over.", never read from the database); its forum (`barred` 403, unreachable 503); who may (`mayNotArrange` for add, remove and move, `mayNotClear` for clear, `mayNotLoad` for load: 403 in the command's words, "You are not signed up for this train.", with the train as the member sees it, who has passed its forum's access, so that the page draws the route editor again without the controls the member no longer has); a gym of a region of this server (`reaches`; any other id 404, so nobody learns of other servers' gyms); only then the subcommand's throttle in its window (`route add`, … `CHANGE_THROTTLE`); then its code path. 200 `ok`, 409 for `gone` and a press that no longer fits (`route-edited`, `route-changed`, `train-moved-on`, `conductor-changed`), 422 for any other refusal (`MAX_ROUTE_STOPS`, a gym on the route already, a saved route the member does not have); every answer of who may and of the code path but `gone` carries the train as the member sees it now (the 403 of who may too). The member's saved routes of the train's region `GET /s/<guild>/api/trains/<id>/routes` (members, as the pick lists; an active train of this server, 409 otherwise; its forum, 403, 503; 30 a minute per address): `{ routes: [{ id, name, stops, atEnd }] }`, as `/route load`'s list offers them. Logged `{ user, guild, party, edit, outcome }`, "a train's route was changed on the map", never a name.
 - **Moving** `POST /s/<guild>/api/trains/<id>/move/<press>`, press `next`, `previous`, `skip` (`{ from, target }`): Move…'s Submit (plan 8M-8C, R1), carrying where the form was drawn and where the move picked leads, as the dialog's custom id and choice carry them; the same checks in the same order, who may being `mayNotMove`, and the window of the post's controls (`ACTION_THROTTLE`, `controlThrottleKey(PARTY_KIND)`), as the dialog's Submit counts; then `moveTrainAs` with the surface `post` (the command's words, where the train is now, "I am telling the others."; of a finished route "Move… takes it back to stop 2: …", as the dialog says it), a move drawn where the train no longer is refused in the dialog's words (`movedOnWords`: "The train has moved on since you opened this: " and where it is now, 409 with the train). The old panel's presses `finish`, `reverse`, `at-end` and `kind` (plans 8M-5, 8X-5) answer 404 since plan 8M-8C: Finish, Reverse, the mode and the kind are Manage…'s, as on Discord, and a page of an older bundle gets 404 for them until it is reloaded (`reverseRouteAs`, `setAtEndAs`, `setKindAs`, `MapTrainRights.kind` and the surface `map` are gone). The movement message in the post pings as for any move. Logged "a train was moved on the map". **The conductor** `POST …/conductor/take` and `…/give-up` (body `{ who }`: `none`, `other` or `you`, whose the role was as the page drew the button, `CONDUCTOR_SEEN`): `/conductor set` and `/conductor clear` (`setConductorAs`, `clearConductorAs`); after the checks of every write, a button drawn when the role was another's than it is now 409 "The conductor of this train changed meanwhile: here it is as it is now." with the train (checked by the route against the store's train, not counted, and again inside the store, `conductorDrawn`, reason `conductor-changed`, for a change that was on its way meanwhile: `setConductorAs` and `clearConductorAs` pass `who` to the service), then a sign-up to take the role, the conductor or staff to drop it (403 in their words, with the train), in their windows. A takeover names nobody: "…, in the place of the conductor before." (`setConductorAs` takes a `ConductorNamer`; `/conductor set` passes `DISCORD_CONDUCTOR`, `memberText`). Logged "a train's conductor was changed on the map".
@@ -294,6 +294,19 @@ Design `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md`, "8M-11A"; fin
 - **The train as Discord emoji:** `pinetrain` is in `CONTROL_ICON_NAMES`. Once the application has it, it goes before a train's name in the summary's lists and the new-train DMs' brief (`PartyService.trainMark`, `customIconText`), never on a button; until then those lines read as before.
 - The start says once that meetup safety is off without its setting (`MeetupSafety.warnAtStart`), not once per server.
 
+## The fix pass: trains and clusters (plan 8M-11B)
+
+Design `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md`, "8M-11B"; findings S13, S24, S25 and S27 of the web polish's staging, and the invite (Matt, 2026-10-28).
+
+- **A train's line shows its way (S27):** `trainLegs` (`src/web/client/train-line.ts`, pure) cuts the line into legs between the stops the map can place, in the route's stored order: a leg is done when the stop it leads to is at or before the train's (`MapTrain.stop`), and every leg of a finished route is. A turn-back train's route is stored reversed when it turns, so its legs ahead point back after the turn by themselves, and at the last stop before it nothing is ahead. A loop (`MapTrain.atEnd`) gets its closing leg, from the last stop it can place back to the first, ahead; a finished loop has none.
+  - `party-layer.ts` draws the done legs as one line at `--train-done` (0.35), those ahead as one at `--train-ahead` (0.8; `DRAWN_OPACITIES` of `theme.ts`, read as numbers from 0 to 1, the usual ones otherwise), and the closing leg dashed (`8 8`), all three in one `L.featureGroup` bound once to the train's popup under `route:<id>` (review R1: the key `showsParty` knows, so a post that comes draws the popup anew whichever piece opened it, and a piece gone after a move takes no popup with it). The arrowheads are drawn anew at every `zoomend`, also while a form holds the parties (review R2).
+  - The arrowheads (`legArrows`): one at the middle of each leg ahead at least `ARROW_MIN_PIXELS` (40) long on the screen, turned by its bearing in pixels (degrees clockwise from east), drawn anew at every draw and every `zoomend` (`drawArrows`, a group of their own in the trains' layer). A leg whose way back is ahead too (a loop of two stops) has its arrowhead two thirds of the way along, so that the two do not meet. Each is a `divIcon` of class `train-arrow` holding an SVG triangle of ours (`arrowElement`, `ARROW_PIXELS` 16, built through the DOM, never markup: the CSP lets no `style` attribute in) in `--train`, not interactive, on Leaflet's `overlayPane` (over the line, under the parties' markers). No library.
+  - Route mode's dashed editing line is unchanged.
+- **The drag line (S24):** while a stop is dragged in the route editor, `TrainUiDeps.dragLine` shows its new legs: from the stop it would follow and to the one it would precede (`dropNeighbors`, `dropLegs` beside `dropPosition` in `train-forms.ts`: positions from 1, as `/route move` takes them; one leg at either end, none to a stop off the map), drawn again only when the position changes, dotted in the train's color (`2 9`, round caps, weight 5) on a layer of their own over route mode's line, and cleared when the drag ends by any path. The row under the pointer stays marked in the list.
+- **The held map (S25):** while a stop's handle is held, the map's `touchZoom` and `dragging` are off (`TrainUiDeps.holdMap`, `holdMap` of `train-forms.ts`), and the drag's end puts back only those that were on, once. Both end in `endDrag`: a drop (in place or elsewhere), Escape, `pointercancel`, `lostpointercapture`, an edit begun, the editor drawn anew and route mode ending.
+- **The gyms' clusters (S13):** a cluster is keyed by its zoom and cell (`cluster:<zoom>:<x>:<y>`), not by its gyms, and `planDots` (`gym-dots.ts`) turns what is drawn (`DrawnDot`: a cluster's count and place) into what is wanted with the least change: nothing where nothing changed (a poll that changes no gym redraws nothing), a cluster changed in place (`reshow` of `gyms-ui.ts`: its count's text and title only when the count changed, then `setLatLng`), the marker of a cluster no longer wanted given to a new one (a zoom, a pan), the rest added or taken off. The cell is `cellPixels(zoom)`: 60 from zoom 15, 90 at 13 and 14, 120 at 12 and below. Profiled over the 5,886 gyms of Pittsburgh's Wayfarer export (a 1200 by 800 view with the layer's margin): drawn at zoom 12 from 715 to 252; a zoom from 12 to 13 from about 1,380 markers made and taken off to about 210, with 224 moved; the work of a refresh was a few milliseconds before and after.
+- **An invite for a visitor who is not a member:** `/api/me` carries `invite` (from `settings.web.invites`) only for somebody logged in whom the directory finds not in the server: nobody logged out (they may be a member who has not logged in), no member without the map's member role (they keep the role line), nobody while Discord cannot say (read-only). The header shows "Join the server on Discord" (`inviteNode` of `notice.ts`, `#account a.invite`) under "You are not a member of this server." only (`headerLines`), opening the invite in a new tab with `rel="noopener"`. Pine calls Discord for nothing new and needs no permission: a paused or deleted invite fails as it would anywhere. After joining, a reload makes them a member within the directory's minute.
+
 ## Adding a route
 
 - Put it under `/s/<guild>/` in `guildRoutes` (the guild check comes first), JSON under `/s/<guild>/api/`. The only exception is the Wayspot export tool's `/userscript` (above), which belongs to no server; another address outside `/s/<guild>/` needs the same reason. Read the session with `sessions.of`; decide what the member may do from fresh data each time (`members.find`, `fetchGuildMember(…, true)` before a staff write), never from the session; refuse writes while Discord cannot be reached.
diff --git a/docs/guides/migrating-a-legacy-instance.md b/docs/guides/migrating-a-legacy-instance.md
index 200b21c6252adac635d84952e6a323c718411933..938306d0a6167da0f2040fc102b9a3aa7154dd15 100644
--- a/docs/guides/migrating-a-legacy-instance.md
+++ b/docs/guides/migrating-a-legacy-instance.md
@@ -340,7 +340,7 @@ The first only says what it would do, line by line: which rows it would add, and
 - **Team GO Rocket** is new too: `/rocket report` names who is at a PokéStop. A grunt is posted in the region channel for half an hour; a leader, Giovanni or a decoy grunt goes in "Today’s Stops" on the board until midnight (a leader or Giovanni new today with a line in the region channel). `/want` takes a grunt type (at most one DM an hour for each type), a leader, any leader, Giovanni or the decoy, and the Shadow box of a Pokémon also covers what Team GO Rocket gives.
 - **Unown**: members with the `unown` role get a want for Unown the first time they use the bot, instead of the role being pinged.
 - **The party history**: the bot keeps a history of ended raids, max battles, trains and meetups for statistics. It keeps a member's Discord id only if they opt in with `/settings history enabled:True`; without it they are counted, anonymously.
-- **A map on the web**, if you set up the web pages ([web setup](../web-setup.md)): `/maps` gives members the address and a login button.
+- **A map on the web**, if you set up the web pages ([web setup](../web-setup.md)): `/maps` gives members the address and a login button. With `web.invites` set, somebody who opens a shared link to the map, logs in and is not in your server gets "Join the server on Discord" with your invite.
 - **Raids that were active at the move are not carried over.** They end with the legacy bot, and `/admin cleanup-legacy` deletes their channels. Members report them again if they are still on. Open trains and meetups are not carried over either, but their channels stay as plain channels for discussion; new ones start with `/train` and `/meetup`.
 - Members no longer delete: `/report` (or **Report to moderators** in the Apps menu of a message) tells the moderators privately, in the moderators' channel; `/delete` and `/places` are staff commands offered to members with Manage Messages.
 - Staff commands (`/admin`, `/gym`, `/region`) are offered only to members with Manage Server, and the bot answers them only for members who also have a role named `admin`, `moderator` or `bot developer`, or for its owner (`OWNER_ID`). An admin can let another member see a staff command under Server Settings → Integrations → Professor Pine, on that command's own entry: an allowance for the application as a whole does not beat the Manage Server default (tried on a test server in October 2026).
diff --git a/docs/guides/new-instance.md b/docs/guides/new-instance.md
index da2c4d94d0249c49e136e308ffcf8bb92fc8ad5b..ba831d268bc3967a63a69b6ebdd739fb1ded271b 100644
--- a/docs/guides/new-instance.md
+++ b/docs/guides/new-instance.md
@@ -121,7 +121,7 @@ The settings that matter first:
 - `roles.unown`: the name of an Unown role the server had before Pine: its holders are given a want for Unown. Leave it as it is if you have none.
 - `raidEvents.weeklyRaidHour`: the weekly Raid Hour, in your time zone.
 
-The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, the trains still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). Field research is always on too: `research` only changes its defaults (the task list is read from Leek Duck's `https://leekduck.com/research/`, `url`, every hour, `refreshHours`, and said to be out of date in the log after 6 hours without a good read, `staleAfterHours`; `throttle` is how many reports a member may make in how many minutes, 10 in 30). Team GO Rocket is always on as well: `rocket` only changes its defaults (the lineups are read from ScrapedDuck's `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json`, `url`, every 6 hours, `refreshHours`, out of date after 24, `staleAfterHours`; a grunt's message stands 30 minutes, `gruntMinutes`; `throttle`, 10 reports in 30 minutes). With a `GOOGLE_API_KEY`, the gyms, PokéStops and Power Spots wait in a line for Google within a monthly budget that stays within Google's free amounts: `googleLookupsPerMonth` Places searches (4,500 unless set), of which the line leaves `googleLookupsReserve` (500) for gyms you add or move by hand and `/gym refresh`, and `googleGeocodesPerMonth` addresses (9,000); the month starts on the 1st at midnight Pacific time, when Google's free amounts reset, and `/gym google` shows how far the line is. Google counts the free amounts per billing account, not per key: instances whose keys bill to one account (a test instance beside your real one, say) share them, so split the budget between them (the three settings of each together within the free amounts), or the account pays for what goes past. The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). After an edit while the bot runs, `./pine restart`.
+The rest has working defaults (`lobbies`, for example, is how many trainers one lobby of a raid, a Dynamax battle and a Gigantamax battle holds: 20, 4 and 100, as in the game; `raid` only sets when a group of a raid or a train is told to split up, since members choose their own groups there, and Join fills groups by `dynamax` and `gigantamax` only in max battles and Gigantamax trains, the trains still to come). Max battles are always on and need no block: `maxBattles` only changes their defaults (the max bosses are read from Pokebattler's `https://fight.pokebattler.com/raids`, `url`, every 6 hours, `refreshMinutes`; `firstBattle` and `lastBattle` are the hours max battles can be fought, 06:00 and 21:00 unless set). Field research is always on too: `research` only changes its defaults (the task list is read from Leek Duck's `https://leekduck.com/research/`, `url`, every hour, `refreshHours`, and said to be out of date in the log after 6 hours without a good read, `staleAfterHours`; `throttle` is how many reports a member may make in how many minutes, 10 in 30). Team GO Rocket is always on as well: `rocket` only changes its defaults (the lineups are read from ScrapedDuck's `https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/rocketLineups.min.json`, `url`, every 6 hours, `refreshHours`, out of date after 24, `staleAfterHours`; a grunt's message stands 30 minutes, `gruntMinutes`; `throttle`, 10 reports in 30 minutes). With a `GOOGLE_API_KEY`, the gyms, PokéStops and Power Spots wait in a line for Google within a monthly budget that stays within Google's free amounts: `googleLookupsPerMonth` Places searches (4,500 unless set), of which the line leaves `googleLookupsReserve` (500) for gyms you add or move by hand and `/gym refresh`, and `googleGeocodesPerMonth` addresses (9,000); the month starts on the 1st at midnight Pacific time, when Google's free amounts reset, and `/gym google` shows how far the line is. Google counts the free amounts per billing account, not per key: instances whose keys bill to one account (a test instance beside your real one, say) share them, so split the budget between them (the three settings of each together within the free amounts), or the account pays for what goes past. The web pages (a map of your regions and gyms) are optional and off until you add a `web` block: [docs/web-setup.md](../web-setup.md). There, `web.invites` gives each server an invite of yours for somebody who opens the map, logs in and is not in the server yet ("Join the server on Discord"). After an edit while the bot runs, `./pine restart`.
 
 ## 4. Start the bot
 
diff --git a/docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md b/docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md
new file mode 100644
index 0000000000000000000000000000000000000000..f8c274985c526b0032858f3b2ac32f427b4543f0
--- /dev/null
+++ b/docs/superpowers/plans/2026-10-28-phase-8m11b-staging.md
@@ -0,0 +1,83 @@
+# Phase 8M-11B staging checklist: trains and clusters on the map, and the invite
+
+Every step needs Matt's go-ahead. Matt starts the bot and the tunnel. Claude drives Discord and the map in its own tab; Tester is on Matt's phone.
+
+- **Accounts:** Googer (the owner, staff) and Tester (a member, no staff role). Step 23 also needs somebody outside the test server: Matt decides how (step 22).
+- **Brief:** `.superpowers/sdd/2026-10-28-phase-8m11b-trains-clusters/design.md`.
+- **Design:** `docs/superpowers/specs/2026-10-28-web-fix-pass-design.md` ("8M-11B: trains and clusters on the map").
+- **Conventions:** `docs/architecture/web.md` ("The fix pass: trains and clusters (plan 8M-11B)").
+- **Devices:** a desktop browser, light and dark, at 1280 pixels; Matt's phone (touch, the docked pane, the phone card).
+- **Findings:** each step names the finding it closes (S13, S24, S25, S27, follow-ups "From the staging run of the web polish"), or the invite (Matt, 2026-10-28).
+
+## Before
+
+0. **The page built, the setting, the bot started after them.**
+   - Run `npm run web:build`.
+   - In Discord, as Googer, make an invite to the test server that does not expire (Server Settings › Invites, or Invite People › Edit invite link › Expire after: Never), and put it in `var/stage/settings.json` under `web`: `"invites": { "<TEST_GUILD_ID>": "https://discord.gg/<code>" }`.
+   - Start (or restart) the bot. No migration and no command change, so no deploy.
+1. **Trains to look at.** In one region, all three with Googer as the conductor and Tester signed up:
+   - **Line**, a train of four gyms, at the end "Finish", at stop 2;
+   - **Round**, a train of three gyms, at the end "Loop", at stop 1;
+   - **Back**, a train of three gyms, at the end "Turn back", at stop 1.
+
+   Pick gyms a few streets apart, so that every leg is long on the screen at zoom 15.
+
+## A train's line shows its way (S27)
+
+2. **Done and ahead.** On the desktop map at zoom 15, the Trains layer on, look at **Line**:
+   - the leg from stop 1 to stop 2 is faint;
+   - the two legs after stop 2 are drawn as before (orange, not faint), each with a small orange arrowhead at its middle pointing toward the next stop;
+   - the faint leg has no arrowhead.
+3. **The arrowheads follow the zoom.** Zoom out step by step: the arrowheads stay at the middle of their legs and keep pointing the right way at every zoom, and go away once a leg is shorter than about 40 pixels on the screen. Zoom back in: they come back. Pan the map: they move with it.
+4. **Moving on.** On **Line**, Move… › Next: the leg just traveled turns faint and loses its arrowhead. Move… › Previous: it is drawn as ahead again.
+5. **A loop.** Look at **Round**: its closing leg, from the last stop back to the first, is dashed, with an arrowhead pointing to the first stop. Move… › Next twice (to the last stop), then Next again (round to the first stop): every leg is drawn as ahead again, and the closing leg stays dashed with its arrowhead.
+6. **A turn-back train.** Look at **Back**:
+   - Move… › Next to the last stop: every leg is faint, and no arrowhead is drawn (nothing more is drawn while it is at the end);
+   - Move… › Next (it turns back): the legs ahead now run back toward the first stop, their arrowheads pointing back.
+7. **Finished.** Manage… › "Finish it here" on **Line**: its whole line is faint, with no arrowhead. Do the same on **Round**: no closing leg any more, and no arrowhead.
+8. **A loop of two stops.** Make a train of two gyms, at the end "Loop": the line and its dashed way back lie on one another, and the two arrowheads are apart (each two thirds of the way along its leg), not on top of each other at the middle.
+9. **The popups.** A click on a faint leg, on a leg ahead and on a loop's dashed leg each opens the train's popup (the phone card on the phone). The arrowheads take no click (a click on one goes to the line or the map under it).
+10. **Light and dark, and the phone.** Steps 2 and 5 in dark, and on the phone: the arrowheads are the train's color of each theme, readable over the tiles.
+11. **Route mode is unchanged.** "Edit route" on **Line**: route mode's dashed line and its numbered stops as before, and the train's own line (faint legs and arrowheads) is not drawn while it is edited.
+
+## The drag shows where a stop will land (S24)
+
+12. **On the desktop.** In route mode on **Line** (four stops), drag stop 3's handle with the mouse:
+    - as it moves over the rows, the map shows two dotted orange legs: from the stop it would follow to it, and from it to the stop it would precede;
+    - the row under the pointer stays marked in the list;
+    - over row 1 there is one leg (to the stop it would precede), over row 4 one leg (from the stop it would follow).
+13. **Every way the drag ends clears it.** The dotted legs go when the stop is dropped on another row (it moves), dropped where it was (nothing is sent), and on Escape. Start a drag and, with a second finger on the phone, tap a gym (it is added): the legs go, and the drag moves nothing.
+14. **On the phone.** The same with a finger in the docked pane: the legs show on the map above while the stop is dragged, and go when it is let go.
+
+## A held stop holds the map (S25)
+
+15. **The edge case of the staging (8M-8C 28a).** On the phone in route mode, hold a stop's handle with one finger and, with another, pinch and drag the map: the map neither zooms nor moves.
+16. **The map comes back.** Let go of the handle: pinch and drag the map; it zooms and moves as before. Do it again after a drag ended by a drop, and after one ended by the browser taking the pointer back (scroll the pane with the other finger, if the phone does).
+
+## Fewer, smoother gym clusters (S13)
+
+17. **Fewer clusters zoomed out.** Turn on the Gyms layer and zoom out over Pittsburgh to zoom 12, then 11: far fewer clusters than at the staging of 2026-10-28 (the cell is 120 pixels at 12 and below, 90 at 13 and 14, 60 from 15). Matt's eye: are they too few or too many at 12, 13 and 14? (The numbers are `cellPixels` in `src/web/client/cluster.ts`.)
+18. **Smooth zooming.** Zoom in and out between 11 and 16 with the wheel and on the phone with a pinch: no long freeze at the end of a zoom, as in S13. Optional: a Performance recording in devtools while zooming from 11 to 14 and back, for the plan's notes.
+19. **A cluster changes in place.** At zoom 13, with a cluster in view, have Googer report a raid at one of its gyms (on Discord): at the next poll the cluster's count goes down by one and the raid is drawn; the cluster does not blink.
+20. **A tap on a cluster** still zooms in on its gyms, also after a zoom (its marker may have been given to another cluster): each cluster zooms in on its own gyms.
+21. **Nothing redrawn for nothing.** At zoom 12, leave the map for a minute without any change: the clusters do not blink at the polls.
+
+## An invite for a visitor who is not a member
+
+22. **Matt decides who plays the visitor** (somebody logged in with Discord, not in the test server):
+    - **A fresh account outside the server, if Matt has one:** a fresh browser profile (Chrome: a new person; or a private window), logged in to Discord as that account. Nothing changes for Tester.
+    - **Tester, who leaves the test server and joins again:** only if Tester can rejoin, which the invite of step 0 allows (it is the link the button opens). Tester loses its roles and sign-ups in the test server by leaving: end Tester's parties first. Matt says which, or skips steps 23 to 25.
+23. **The invite.** As the visitor, open the map's address (`/s/<TEST_GUILD_ID>/map`) and log in with Discord:
+    - the header says "You are not a member of this server." and under it the button "Join the server on Discord";
+    - it opens the invite in a new tab (in that tab's devtools console, `window.opener` is `null`);
+    - on the phone the button sits under the line, at the right.
+24. **Joining.** Join the server through the invite, then reload the map (within a minute or so): the visitor is a member, the button is gone, and the parties are shown. No new login is asked.
+25. **Who never sees it.**
+    - Logged out (a private window, not logged in): the header has "Log in with Discord" only.
+    - Googer and Tester, members: no button.
+    - Optional, with `web.memberRole` set for a run to a role Tester lacks: Tester sees the role line ("…you need the … role in this server.") and no invite. Put the setting back after.
+26. **A wrong invite stops the start (optional).** With `"invites": { "<TEST_GUILD_ID>": "https://example.com/abc" }` the bot does not start, and its message names `web.invites` and says it must be `https://discord.gg/<code>` or `https://discord.com/invite/<code>`. Put the right one back, and start it again.
+
+## After
+
+27. **Back to how it was.** End the test trains (or let them end). Keep `web.invites` in the stage settings or take it out, as Matt likes; if Tester left and rejoined, give Tester back its roles.
diff --git a/docs/web-setup.md b/docs/web-setup.md
index 3dcfcdfac8d7156c16a7f33596a3b5901b269392..ab2c1b25e0cc596138a74d3669807a57942f7464 100644
--- a/docs/web-setup.md
+++ b/docs/web-setup.md
@@ -22,6 +22,13 @@ In `data/settings.json`:
 - `trustProxy`: `true` behind a tunnel or proxy, so that the rate limits count the visitor's address and not the tunnel's. Pine reads it from `X-Forwarded-For` (the last address there that no proxy on this machine or a private network added), and believes that header only from this machine or a private network. `CF-Connecting-IP` is not read: Cloudflare adds the visitor to `X-Forwarded-For` as well. Check that your tunnel sends `X-Forwarded-For` (Tailscale Funnel especially; see step 3): without it every visitor counts as the tunnel, and they share one limit.
 - `tiles`: `stadia` (the default: Stadia Maps' Alidade Smooth, light or dark as the visitor's device is; register your domain with Stadia first, section 4), `osm` (OpenStreetMap's standard tiles alone, darkened by the page in dark) or `google` (Google's roadmap, satellite and hybrid beside Stadia's; needs the browser key of section 4).
 - `memberRole` (optional, not in the example above; `"memberRole": "Verified"`): the name of a role a member must have to see and press the server's parties on the map, for a server whose members are verified before they take part (`Verified`). It is matched as Pine's other role settings are: trimmed, whatever its letter case. A member without it (an administrator excepted) sees what a visitor who is not logged in sees: the regions and gyms, no parties, and the header says they are not a member of the server; a press is refused. Leave it out (or blank) and every member of the server counts. The region editor is not affected: it is for staff. One setting serves every server the bot is in: a server without a role of that name shows its parties to its administrators only.
+- `invites` (optional, not in the example above): an invite for somebody who follows a link to the map, logs in with Discord and is not in the server. It is one entry per server, its id to an invite you made in Discord (Server Settings, Invites, or Invite People; choose a link that does not expire, and the channel newcomers land in), `https://discord.gg/<code>` or `https://discord.com/invite/<code>`; a vanity address works too:
+
+  ```json
+  "invites": { "412345678901234567": "https://discord.gg/pokemongo-pgh" }
+  ```
+
+  Such a visitor sees "Join the server on Discord" under "You are not a member of this server.", which opens the invite in a new tab; after joining, reloading the map makes them a member within a minute, without a new login. Nobody else sees it: not a visitor who has not logged in (they may be a member), not a member without the `memberRole`, not while Discord cannot be reached. Anything other than such an address stops the bot at the start with a message that says what it must look like; a blank value, or a server not listed, shows no invite. Pine does not make or check the invite and needs no permission for it: a paused or deleted invite fails on Discord's side as it would anywhere.
 
 The map says distances (its list of what is on) in the units of the top-level setting `distanceUnits`, as Discord does: `imperial` (the default) or `metric`.
 
````

## After the last task

- [ ] `npm run check > var/8m11b-check.log 2>&1; echo $?` (0), then `npm run build` (0), then `TESTCONTAINERS_HOST_OVERRIDE=127.0.0.1 npm run test:db` (0), one at a time.
- [ ] `git diff 59056e20bb749e9c6a936d05d5e773211be9be77 HEAD -- src test` prints nothing.
- [ ] The whole-branch review (Opus, high), its fixes, then the close: follow-ups, status in CLAUDE.md, the Gantt chart, memory. Remove the prototype worktree (its `node_modules` junction first).
